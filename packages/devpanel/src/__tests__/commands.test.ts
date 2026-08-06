/**
 * T-143 · §6 CRITERION 1 — "every §1 command is triggerable with a flag set that is
 * a verified SUBSET of its script's real parsed arguments".
 *
 * This is the criterion with the most ways to fake it. Comparing the registry
 * against each script's `usage()` text would prove only that two pieces of prose
 * agree; reading the parser and asserting a hand-copied list would prove only
 * that the copy was made once. So the subset property is proved AT RUNTIME,
 * against the real parsers, by spawning each script with EVERY panel flag for
 * that row present at once and asserting no flag-shaped complaint comes back.
 *
 * AND WITH A NEGATIVE CONTROL IN THE SAME TEST. Without one, "stderr contains no
 * `Unknown argument:`" would also pass against a script that never validated
 * anything — a test with no teeth, which is worse than no test. Each row is
 * therefore also spawned with `--not-a-real-flag` and asserted to reject it.
 *
 * The commands may still fail for other reasons (a missing input file, an
 * aggregate with no rows). That is fine and expected: the assertion is
 * deliberately narrow to flag-shaped errors, because that and only that is what
 * "the panel's flag set is a subset of the parser's" means.
 */

import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  BASELINE_FILE_PATTERN,
  GATE_STEPS,
  LABEL_PATTERN,
  PANEL_COMMANDS,
  PanelArgError,
  assertNoWritingCommands,
  buildArgv,
  findCommand,
  npmArgvFor,
  npmExecutable,
  type PanelCommand,
} from '../commands.js';
import { planShardedSweep } from '../runner.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const NPM = npmExecutable();
const resolvePath = (path: string): string => resolve(REPO_ROOT, path);

/** Two committed aggregates, used as real inputs so the parsers get past argv. */
const BASELINE_A = join(REPO_ROOT, 'docs', 'balance', 'baseline-tour-one.json');
const BASELINE_B = join(REPO_ROOT, 'docs', 'balance', 'baseline-t150-postfix.json');

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

async function runCli(command: PanelCommand, commandArgv: readonly string[]): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(NPM, npmArgvFor(command, commandArgv), {
      cwd: REPO_ROOT,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? -1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

/** Every way these four parsers complain about a FLAG, as opposed to about data. */
function flagComplaints(stderr: string): string[] {
  const patterns = [
    /Unknown argument: (\S+)/g,
    /Missing value for (\S+)/g,
    /(\S+) requires a value/g,
    /(--\S+) must (?:look like|be)/g,
  ];
  const found: string[] = [];
  for (const pattern of patterns) {
    for (const match of stderr.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

function dummyValueFor(flagId: string, scratch: string): string {
  switch (flagId) {
    case 'label':
      return 't143-flagcheck';
    case 'seeds':
    case 'seedStart':
    case 'days':
      return '1';
    case 'policies':
      return 'trader';
    case 'milestoneDays':
      return '1';
    case 'epsilon':
      return '0';
    case 'date':
      return '2026-01-01';
    case 'name':
      return 't143-flagcheck';
    case 'aggregate':
    case 'before':
      return BASELINE_A;
    case 'compareTo':
    case 'after':
      return BASELINE_B;
    case 'provenance':
    case 'compareProvenance':
      return join(REPO_ROOT, 'docs', 'balance', 'smoke', 'tiers.json');
    case 'traces':
      return join(scratch, 'traces-t143-shard1of1.jsonl');
    case 'playtestLog':
      return join(scratch, 'playtest.jsonl');
    case 'out':
    case 'aggregateOut':
      return scratch;
    default:
      return 'x';
  }
}

/** Every flag the row declares, with a shape-valid dummy value. */
function everyFlag(command: PanelCommand, scratch: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const flag of command.flags) {
    values[flag.id] = flag.kind === 'boolean' ? 'true' : dummyValueFor(flag.id, scratch);
  }
  return values;
}

describe('the registry is a subset of each script’s real parsed arguments', () => {
  const scratch = mkdtempSync(join(tmpdir(), 't143-flags-'));
  writeFileSync(join(scratch, 'traces-t143-shard1of1.jsonl'), '', 'utf8');
  writeFileSync(join(scratch, 'playtest.jsonl'), '', 'utf8');

  for (const id of ['sweep', 'diff', 'extract', 'report'] as const) {
    it(`${id}: every panel flag at once is accepted by the real parser`, async () => {
      const command = findCommand(id);
      expect(command).toBeDefined();
      if (command === undefined) return;
      const argv = buildArgv(command, everyFlag(command, scratch), { resolvePath });
      // The sweep's shard flag is owned by the orchestrator rather than the
      // form, so it is appended here — it must be verified against the parser
      // exactly like the others.
      if (id === 'sweep') argv.push('--shard', '1/1');
      const result = await runCli(command, argv);
      expect(flagComplaints(result.stderr)).toEqual([]);
    }, 120_000);

    it(`${id}: the same parser DOES reject an invented flag (negative control)`, async () => {
      const command = findCommand(id);
      if (command === undefined) throw new Error('missing command');
      const result = await runCli(command, ['--not-a-real-flag']);
      expect(result.stderr).toContain('Unknown argument: --not-a-real-flag');
      expect(result.code).not.toBe(0);
    }, 120_000);
  }

  it('the merge argv the orchestrator emits is accepted by the real parser', async () => {
    const command = findCommand('sweep');
    if (command === undefined) throw new Error('missing sweep');
    const plan = planShardedSweep({
      command,
      values: { label: 't143-mergecheck' },
      shardCount: 2,
      runDir: scratch,
      resolvePath,
    });
    // The merge is spawned by the panel, never typed by the operator, so it is
    // the one argv nobody would notice going stale.
    const result = await runCli(command, plan.merge);
    expect(flagComplaints(result.stderr)).toEqual([]);
  }, 120_000);
});

describe('buildArgv is pure, total and refuses to smuggle', () => {
  const sweep = findCommand('sweep');
  if (sweep === undefined) throw new Error('missing sweep');

  it('rejects a label that could escape its directory', () => {
    for (const bad of ['../x', 'a b', '-x', 'a/b', 'a\\b', '']) {
      expect(() => buildArgv(sweep, { label: bad }, { resolvePath })).toThrow();
    }
    expect(LABEL_PATTERN.test('tour-one_2')).toBe(true);
  });

  it('emits nothing at all for an omitted optional field', () => {
    // The property §6's byte-for-byte criterion rests on: the panel never adds a
    // flag the operator did not ask for.
    expect(buildArgv(sweep, { label: 'x' }, { resolvePath })).toEqual(['--label', 'x']);
  });

  it('emits every path flag absolute', () => {
    const argv = buildArgv(
      sweep,
      { label: 'x', out: '.scratch/balance/panel-runs/x' },
      { resolvePath },
    );
    const value = argv[argv.indexOf('--out') + 1];
    expect(isAbsolute(value)).toBe(true);
    // NOT `packages/sim/.scratch/...`: `npm run ... -w @spacerquest/sim` runs
    // with cwd = packages/sim and `sweep.ts` resolves --out with a bare resolve().
    expect(value).toBe(join(REPO_ROOT, '.scratch', 'balance', 'panel-runs', 'x'));
  });

  it('refuses a value that would become a flag', () => {
    expect(() => buildArgv(sweep, { label: 'ok', policies: '--merge' }, { resolvePath })).toThrow(
      PanelArgError,
    );
    expect(() => buildArgv(sweep, { label: 'ok', seeds: '--days' }, { resolvePath })).toThrow(
      PanelArgError,
    );
  });

  it('rejects a non-integer where the parser wants an integer >= 1', () => {
    for (const bad of ['0', '1.5', 'x', '1e3']) {
      expect(() => buildArgv(sweep, { label: 'ok', seeds: bad }, { resolvePath })).toThrow();
    }
  });

  it('has no --merge and no --shard field: the orchestrator owns both', () => {
    const ids = sweep.flags.map((flag) => flag.flag);
    expect(ids).not.toContain('--merge');
    expect(ids).not.toContain('--shard');
  });

  it('requires diff’s two positionals and emits them before the flags', () => {
    const diff = findCommand('diff');
    if (diff === undefined) throw new Error('missing diff');
    expect(() => buildArgv(diff, { before: BASELINE_A }, { resolvePath })).toThrow(PanelArgError);
    const argv = buildArgv(
      diff,
      { before: BASELINE_A, after: BASELINE_B, json: 'true' },
      { resolvePath },
    );
    expect(argv).toEqual([BASELINE_A, BASELINE_B, '--json']);
  });

  it('rejects a second value for a non-repeatable flag and accepts one for --traces', () => {
    const report = findCommand('report');
    if (report === undefined) throw new Error('missing report');
    expect(() =>
      buildArgv(report, { aggregate: [BASELINE_A, BASELINE_B] }, { resolvePath }),
    ).toThrow(PanelArgError);
    const argv = buildArgv(
      report,
      { aggregate: BASELINE_A, traces: ['/a/one.jsonl', '/a/two.jsonl'] },
      { resolvePath },
    );
    expect(argv.filter((token) => token === '--traces')).toHaveLength(2);
  });
});

describe('§5’s ruling: lint:fix and format are excluded, and that is enforced', () => {
  it('no panel row is a source-writing, packaging or release command', () => {
    for (const command of PANEL_COMMANDS) {
      const script = command.npmScript ?? '';
      expect(script).not.toMatch(/^(package:|release:)/);
      expect(script).not.toBe('format');
      expect(script).not.toBe('lint:fix');
    }
    // And the guard itself has teeth.
    expect(() => assertNoWritingCommands([{ ...PANEL_COMMANDS[0], npmScript: 'format' }])).toThrow(
      /DEV-CONTROL-PANEL_SPEC/,
    );
  });

  it('the gate is the four read-only checks and nothing that writes', () => {
    expect(GATE_STEPS.map((step) => step.label)).toEqual([
      'npm test',
      'npx tsc -b',
      'npm run lint',
      'npm run format:check',
    ]);
    for (const step of GATE_STEPS) {
      expect(step.argv).not.toContain('--fix');
      expect(step.argv).not.toContain('format');
    }
  });

  it('BASELINE_FILE_PATTERN names exactly what --merge writes', () => {
    expect(BASELINE_FILE_PATTERN.test('baseline-tour-one.json')).toBe(true);
    expect(BASELINE_FILE_PATTERN.test('baseline-../evil.json')).toBe(false);
    expect(BASELINE_FILE_PATTERN.test('rows-tour-one-shard1of4.json')).toBe(false);
  });
});
