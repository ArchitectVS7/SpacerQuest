/**
 * T-143 · §6 CRITERION 3 — "panel-triggered output is BYTE-FOR-BYTE identical to
 * the same command run directly by hand".
 *
 * The property is structural, not incidental: `./commands.ts` emits nothing for
 * an omitted optional field, `./runner.ts` spawns with `shell: false`, `cwd` =
 * the repo root and `env` inherited unchanged, and the panel adds exactly two
 * flags (`--out`/`--aggregate-out`) which it renders in the UI before the run.
 * So "clicked in the panel" and "typed in a terminal" are the SAME argv array,
 * not merely equivalent ones — and this suite spawns both and compares bytes.
 *
 * WHY STDERR IS COMPARED WITH TIMING MASKED, AND WHY THAT IS NOT A LOOSENING.
 * `sweep.ts` writes `${formatElapsed(...)} elapsed` and a `... in 0m00s` line to
 * stderr, so the CLI's stderr IS NOT BYTE-STABLE AGAINST ITSELF: two hand-typed
 * runs of the same command differ there too. Masking `\d+m\d\ds` is therefore a
 * property of the instrument, not a concession by the panel. It is applied to
 * stderr ONLY. The stdout comparison and both artifact comparisons are exact,
 * unmasked `Buffer.equals`, and must stay that way — this note is not licence to
 * widen them.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findCommand, npmArgvFor, npmExecutable, renderCommandLine } from '../commands.js';
import { planShardedSweep, realSpawn, runOnce, runShardedSweep, type SpawnFn } from '../runner.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const NPM = npmExecutable();
const resolvePath = (path: string): string => resolve(REPO_ROOT, path);

interface Captured {
  stdout: Buffer;
  stderr: Buffer;
  code: number | null;
}

/** The HAND-TYPED side: a plain `spawn`, with no panel code anywhere in it. */
function byHand(argv: readonly string[]): Promise<Captured> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(NPM, [...argv], { cwd: REPO_ROOT, shell: false, env: process.env });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      resolvePromise({ stdout: Buffer.concat(out), stderr: Buffer.concat(err), code });
    });
  });
}

/** The PANEL side: the same command, spawned through `./runner.ts`'s seam. */
async function byPanel(
  commandId: 'diff' | 'sweep',
  commandArgv: readonly string[],
): Promise<Captured> {
  const command = findCommand(commandId);
  if (command === undefined) throw new Error(`missing ${commandId}`);
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  // Tap the raw Buffers on the way past, so the comparison is over BYTES rather
  // than over a string the runner already decoded.
  const tappedSpawn: SpawnFn = (executable, argv, options) => {
    const child = spawn(executable, [...argv], {
      cwd: options.cwd,
      shell: false,
      env: process.env,
    });
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    return child;
  };
  const result = await runOnce(NPM, npmArgvFor(command, commandArgv), commandId, {
    spawn: tappedSpawn,
    cwd: REPO_ROOT,
    onEvent: () => {
      /* the stream the UI would render; irrelevant to the byte comparison */
    },
  });
  return { stdout: Buffer.concat(out), stderr: Buffer.concat(err), code: result.code };
}

function maskTiming(buffer: Buffer): string {
  return buffer.toString('utf8').replace(/\d+m\d\ds/g, '<elapsed>');
}

describe('stdout is byte-for-byte identical (balance:diff, a pure function of its inputs)', () => {
  const before = join(REPO_ROOT, 'docs', 'balance', 'baseline-tour-one.json');
  const after = join(REPO_ROOT, 'docs', 'balance', 'baseline-t150-postfix.json');

  it('the report form', async () => {
    const commandArgv = [before, after];
    const command = findCommand('diff');
    if (command === undefined) throw new Error('missing diff');
    const [panel, hand] = await Promise.all([
      byPanel('diff', commandArgv),
      byHand(npmArgvFor(command, commandArgv)),
    ]);
    expect(panel.code).toBe(hand.code);
    expect(panel.stdout.length).toBeGreaterThan(0);
    expect(panel.stdout.equals(hand.stdout)).toBe(true);
    expect(panel.stderr.equals(hand.stderr)).toBe(true);
  }, 180_000);

  it('the --json form', async () => {
    const commandArgv = [before, after, '--json'];
    const command = findCommand('diff');
    if (command === undefined) throw new Error('missing diff');
    const [panel, hand] = await Promise.all([
      byPanel('diff', commandArgv),
      byHand(npmArgvFor(command, commandArgv)),
    ]);
    expect(panel.stdout.equals(hand.stdout)).toBe(true);
  }, 180_000);
});

describe('sweep artifacts are byte-for-byte identical', () => {
  it('the rows file and the merged aggregate both match a hand-typed run', async () => {
    const panelDir = mkdtempSync(join(tmpdir(), 't143-bytes-panel-'));
    const handDir = mkdtempSync(join(tmpdir(), 't143-bytes-hand-'));
    const command = findCommand('sweep');
    if (command === undefined) throw new Error('missing sweep');

    const values = { label: 'panel-bytes', seeds: '4', days: '8', policies: 'trader,fighter' };

    // --- panel side -------------------------------------------------------
    const result = await runShardedSweep(
      { command, values, shardCount: 1, runDir: panelDir, resolvePath },
      { spawn: realSpawn, cwd: REPO_ROOT, onEvent: () => {} },
    );
    expect(result.status).toBe('ok');

    // --- hand side: the SAME argv, typed out, into a different directory ---
    const handPlan = planShardedSweep({
      command,
      values,
      shardCount: 1,
      runDir: handDir,
      resolvePath,
    });
    const shardRun = await byHand(npmArgvFor(command, handPlan.shards[0]));
    expect(shardRun.code).toBe(0);
    const mergeRun = await byHand(npmArgvFor(command, handPlan.merge));
    expect(mergeRun.code).toBe(0);

    const rows = 'rows-panel-bytes-shard1of1.json';
    const aggregate = 'baseline-panel-bytes.json';
    for (const name of [rows, aggregate]) {
      expect(existsSync(join(panelDir, name))).toBe(true);
      expect(existsSync(join(handDir, name))).toBe(true);
      const panelBytes = readFileSync(join(panelDir, name));
      const handBytes = readFileSync(join(handDir, name));
      // EXACT. No masking, no epsilon, no normalisation.
      expect(panelBytes.equals(handBytes)).toBe(true);
    }
  }, 300_000);

  it('stderr matches once the instrument’s own elapsed timer is masked', async () => {
    const panelDir = mkdtempSync(join(tmpdir(), 't143-stderr-panel-'));
    const handDir = mkdtempSync(join(tmpdir(), 't143-stderr-hand-'));
    const command = findCommand('sweep');
    if (command === undefined) throw new Error('missing sweep');
    const values = { label: 'stderr-check', seeds: '2', days: '5', policies: 'trader' };
    const panelPlan = planShardedSweep({
      command,
      values,
      shardCount: 1,
      runDir: panelDir,
      resolvePath,
    });
    const handPlan = planShardedSweep({
      command,
      values,
      shardCount: 1,
      runDir: handDir,
      resolvePath,
    });
    const panel = await byPanel('sweep', panelPlan.shards[0]);
    const hand = await byHand(npmArgvFor(command, handPlan.shards[0]));
    // The only remaining difference is the temp directory each was pointed at,
    // which is the flag the operator supplied, not something the panel invented.
    expect(maskTiming(panel.stderr).split(panelDir).join('<dir>')).toBe(
      maskTiming(hand.stderr).split(handDir).join('<dir>'),
    );
  }, 300_000);
});

describe('what you saw is what ran', () => {
  it('the argv actually spawned equals the command line the UI was shown', async () => {
    const command = findCommand('sweep');
    if (command === undefined) throw new Error('missing sweep');
    const runDir = mkdtempSync(join(tmpdir(), 't143-wysiwyr-'));
    const values = { label: 'wysiwyr', seeds: '2', days: '5', policies: 'trader' };

    // What the UI is handed BEFORE the run starts (server `/api/plan` calls this
    // same function with the same arguments).
    const displayed = (() => {
      const plan = planShardedSweep({ command, values, shardCount: 2, runDir, resolvePath });
      return [
        ...plan.shards.map((argv) => renderCommandLine(NPM, npmArgvFor(command, argv))),
        renderCommandLine(NPM, npmArgvFor(command, plan.merge)),
      ];
    })();

    const spawned: string[] = [];
    const recordingSpawn: SpawnFn = (executable, argv, options) => {
      spawned.push(renderCommandLine(executable, argv));
      return realSpawn(executable, argv, options);
    };
    const result = await runShardedSweep(
      { command, values, shardCount: 2, runDir, resolvePath },
      { spawn: recordingSpawn, cwd: REPO_ROOT, onEvent: () => {} },
    );
    expect(result.status).toBe('ok');
    expect(spawned).toEqual(displayed);
    expect(result.commandLines).toEqual(displayed);
  }, 300_000);
});
