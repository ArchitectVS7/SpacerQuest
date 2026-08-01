/**
 * T-143 · THE CHILD-PROCESS ORCHESTRATOR — spec §2.
 *
 * Everything that spawns lives here, over an INJECTED spawn seam
 * ({@link SpawnFn}). That is not test decoration: §6 asks for concurrency to be
 * asserted "by process-count/timing, not just reading the code", and the only way
 * to prove a serial implementation would FAIL is to inject children that refuse
 * to exit until N of them are simultaneously live. A real `spawn` cannot express
 * that barrier; a seam can. `__tests__/sharding.test.ts` runs both — the barrier
 * with a fake, and a second pass with the real `spawn` comparing wall-clock
 * intervals.
 *
 * SHELL: FALSE, ALWAYS. Every argv is an array built by `./commands.ts`, so no
 * value is ever interpolated into a command string and quoting is not a hazard
 * this panel has. `env` is inherited UNCHANGED, and `cwd` is always the repo root
 * — both are preconditions of §6's byte-for-byte criterion, since a child that
 * saw a different environment than a hand-typed one could produce different bytes.
 *
 * WHAT §2 REQUIRES, AND WHERE EACH PART IS:
 *   - N shards spawned CONCURRENTLY, never serially — `runShardedSweep`, which
 *     spawns every child in one synchronous loop BEFORE awaiting anything.
 *   - `--merge` runs only after every shard exits 0 — the `allZero` check.
 *   - "Never falls back to serial shards" — there is deliberately no such branch
 *     to fall back to, and no concurrency limit that could become one.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildArgv,
  npmArgvFor,
  npmExecutable,
  renderCommandLine,
  type PanelCommand,
  type PanelFormValues,
} from './commands.js';

export interface SpawnOptions {
  readonly cwd: string;
}

export interface ChildLike {
  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  readonly stdout: {
    on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  } | null;
  readonly stderr: {
    on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  } | null;
  kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnFn = (
  command: string,
  argv: readonly string[],
  options: SpawnOptions,
) => ChildLike;

export const realSpawn: SpawnFn = (command, argv, options) =>
  nodeSpawn(command, [...argv], {
    cwd: options.cwd,
    shell: false,
    // Inherited unchanged. A child that saw a different env than a hand-typed
    // invocation could legitimately produce different bytes, which would make
    // §6's byte-for-byte criterion untestable rather than merely unmet.
    env: process.env,
    windowsHide: true,
  });

export type RunEvent =
  | { readonly kind: 'spawn'; readonly stream: string; readonly commandLine: string }
  | { readonly kind: 'stdout' | 'stderr'; readonly stream: string; readonly text: string }
  | { readonly kind: 'exit'; readonly stream: string; readonly code: number | null }
  | { readonly kind: 'note'; readonly stream: string; readonly text: string };

export interface RunDeps {
  readonly spawn: SpawnFn;
  readonly cwd: string;
  readonly onEvent: (event: RunEvent) => void;
  /** Injected so the timing tests can record without a clock stub inside the runner. */
  readonly now?: () => number;
}

export interface ProcessResult {
  readonly commandLine: string;
  readonly argv: readonly string[];
  readonly code: number | null;
  readonly startedAt: number;
  readonly finishedAt: number;
}

/**
 * Spawn one child and resolve when it exits. NEVER REJECTS on a non-zero exit —
 * a failing sweep is a RESULT the panel must display, not an exception that
 * unwinds the orchestration and hides which shard failed.
 */
export function runOnce(
  executable: string,
  argv: readonly string[],
  stream: string,
  deps: RunDeps,
  logSink?: (chunk: 'stdout' | 'stderr', text: string) => void,
): Promise<ProcessResult> {
  const now = deps.now ?? Date.now;
  const commandLine = renderCommandLine(executable, argv);
  const startedAt = now();
  deps.onEvent({ kind: 'spawn', stream, commandLine });
  const child = deps.spawn(executable, argv, { cwd: deps.cwd });
  child.stdout?.on('data', (chunk) => {
    const text = chunk.toString();
    logSink?.('stdout', text);
    deps.onEvent({ kind: 'stdout', stream, text });
  });
  child.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    logSink?.('stderr', text);
    deps.onEvent({ kind: 'stderr', stream, text });
  });
  return new Promise<ProcessResult>((resolvePromise) => {
    let settled = false;
    const settle = (code: number | null): void => {
      if (settled) return;
      settled = true;
      deps.onEvent({ kind: 'exit', stream, code });
      resolvePromise({ commandLine, argv, code, startedAt, finishedAt: now() });
    };
    child.on('exit', (code) => {
      settle(code);
    });
    child.on('error', (error) => {
      deps.onEvent({ kind: 'stderr', stream, text: `${error.message}\n` });
      // A spawn that never started is a failure, reported with the same shape as
      // a non-zero exit so no caller needs a second failure path.
      settle(-1);
    });
  });
}

export interface LogSink {
  readonly sink: (channel: 'stdout' | 'stderr', text: string) => void;
  readonly close: () => void;
}

/** A file-backed sink so a long sweep's output survives a closed browser tab. */
export function fileLogSink(runDir: string, stem: string): LogSink {
  mkdirSync(runDir, { recursive: true });
  const out = createWriteStream(join(runDir, `${stem}.out.log`), { flags: 'a' });
  const err = createWriteStream(join(runDir, `${stem}.err.log`), { flags: 'a' });
  return {
    sink: (channel, text) => {
      (channel === 'stdout' ? out : err).write(text);
    },
    close: () => {
      out.end();
      err.end();
    },
  };
}

export interface ShardedSweepInput {
  readonly command: PanelCommand;
  readonly values: PanelFormValues;
  readonly shardCount: number;
  readonly runDir: string;
  /** Injected so `buildArgv` stays pure; the server passes a repo-root resolver. */
  readonly resolvePath: (path: string) => string;
  readonly executable?: string;
  /** Off in the barrier test, on in real runs. */
  readonly writeLogs?: boolean;
}

export interface ShardedSweepResult {
  readonly shards: readonly ProcessResult[];
  readonly merge: ProcessResult | null;
  readonly status: 'ok' | 'failed';
  readonly commandLines: readonly string[];
}

/**
 * Plan the argv for every shard and for the merge, PURELY — so the UI can render
 * the exact command lines before anything is spawned, and `run.json` can record
 * what was promised alongside what happened. `__tests__/byte-identical.test.ts`
 * asserts the runner spawned exactly the argv this function displayed.
 *
 * SHARDS ARE 1-INDEXED, `1/N` … `N/N`. `parseShard` rejects `i > N` and refuses
 * `0` outright (`parsePositiveInteger` requires >= 1), and `inShard` computes
 * `(seed - seedStart) % count === index - 1` — so a 0-indexed loop would drop
 * every seed of one shard and duplicate none, producing a merge that looks
 * complete and is short by 1/N of the runs.
 */
export function planShardedSweep(input: {
  command: PanelCommand;
  values: PanelFormValues;
  shardCount: number;
  runDir: string;
  resolvePath: (path: string) => string;
}): { shards: string[][]; merge: string[] } {
  if (!Number.isInteger(input.shardCount) || input.shardCount < 1) {
    throw new Error(`shardCount must be an integer >= 1, got ${String(input.shardCount)}`);
  }
  // §3: a panel sweep is gitignored by default. `sweep.ts`'s own defaults are
  // `.scratch/balance` for rows and `docs/balance` FOR THE AGGREGATE — the
  // second of which would drop a committed-looking baseline into the repo on
  // every ad hoc click. So when the operator leaves them blank the panel points
  // BOTH at this run's directory. The injection is visible: it goes into the
  // values map here, before `buildArgv`, and the resulting command line is what
  // the UI displays and `run.json` stores.
  const values: Record<string, string | readonly string[] | undefined> = { ...input.values };
  if (single(values.out) === '') values.out = input.runDir;
  if (single(values.aggregateOut) === '') values.aggregateOut = input.runDir;

  const base = buildArgv(input.command, values, { resolvePath: input.resolvePath });
  const shards: string[][] = [];
  for (let index = 1; index <= input.shardCount; index += 1) {
    shards.push([...base, '--shard', `${index}/${input.shardCount}`]);
  }

  // The merge re-reads finished row files, so it must carry the SAME --label and
  // the SAME two directories and nothing else that plays a day.
  // `--trace-npc-decisions` is stripped: `parseSweepArgs` THROWS when it is
  // combined with `--merge` (a merge plays no days, so it can trace nothing).
  const mergeValues: Record<string, string | readonly string[] | undefined> = {
    label: values.label,
    out: values.out,
    aggregateOut: values.aggregateOut,
  };
  const merge = [
    ...buildArgv(input.command, mergeValues, { resolvePath: input.resolvePath }),
    '--merge',
  ];
  return { shards, merge };
}

function single(value: string | readonly string[] | undefined): string {
  if (value === undefined) return '';
  return (typeof value === 'string' ? value : (value[0] ?? '')).trim();
}

/**
 * §2, implemented: spawn every shard concurrently, then merge — and ONLY if every
 * shard exited 0.
 */
export async function runShardedSweep(
  input: ShardedSweepInput,
  deps: RunDeps,
): Promise<ShardedSweepResult> {
  const executable = input.executable ?? npmExecutable();
  const plan = planShardedSweep(input);
  const commandLines = [
    ...plan.shards.map((argv) => renderCommandLine(executable, npmArgvFor(input.command, argv))),
    renderCommandLine(executable, npmArgvFor(input.command, plan.merge)),
  ];

  const sinks: LogSink[] = [];
  const pending: Promise<ProcessResult>[] = [];
  // ONE SYNCHRONOUS LOOP, NO AWAIT INSIDE IT. This is the whole of §2's
  // "concurrently, never serial": every child is live before the first `await`,
  // so there is no ordering for a slow shard to impose on a fast one.
  for (let index = 0; index < plan.shards.length; index += 1) {
    const stream = `shard${index + 1}of${plan.shards.length}`;
    let sink: ((channel: 'stdout' | 'stderr', text: string) => void) | undefined;
    if (input.writeLogs !== false) {
      const log = fileLogSink(input.runDir, stem(stream));
      sinks.push(log);
      sink = log.sink;
    }
    pending.push(
      runOnce(executable, npmArgvFor(input.command, plan.shards[index]), stream, deps, sink),
    );
  }
  const shards = await Promise.all(pending);
  for (const sink of sinks) sink.close();

  const failed = shards
    .map((result, index) => ({ index: index + 1, code: result.code }))
    .filter((entry) => entry.code !== 0);
  if (failed.length > 0) {
    // NAME THE SHARDS. "the sweep failed" sends you to read four log files;
    // "shard 3/4 exited 1" sends you to one.
    deps.onEvent({
      kind: 'note',
      stream: 'merge',
      text:
        `NOT MERGING: ${failed.length} of ${shards.length} shards did not exit 0 ` +
        `(${failed.map((entry) => `shard ${entry.index} exited ${String(entry.code)}`).join(', ')}). ` +
        'A merge over a partial row set would produce an aggregate that looks complete and is not.\n',
    });
    return { shards, merge: null, status: 'failed', commandLines };
  }

  let mergeSink: ((channel: 'stdout' | 'stderr', text: string) => void) | undefined;
  let mergeLog: LogSink | undefined;
  if (input.writeLogs !== false) {
    mergeLog = fileLogSink(input.runDir, 'merge');
    mergeSink = mergeLog.sink;
  }
  const merge = await runOnce(
    executable,
    npmArgvFor(input.command, plan.merge),
    'merge',
    deps,
    mergeSink,
  );
  mergeLog?.close();
  return {
    shards,
    merge,
    status: merge.code === 0 ? 'ok' : 'failed',
    commandLines,
  };
}

function stem(stream: string): string {
  return stream.replace(/[^A-Za-z0-9._-]+/g, '-');
}

/** A single, unsharded command (diff / extract / smoke / report). */
export async function runSingleCommand(
  input: {
    command: PanelCommand;
    values: PanelFormValues;
    runDir: string;
    resolvePath: (path: string) => string;
    executable?: string;
    writeLogs?: boolean;
  },
  deps: RunDeps,
): Promise<{ result: ProcessResult; commandLines: string[] }> {
  const executable = input.executable ?? npmExecutable();
  const argv = npmArgvFor(
    input.command,
    buildArgv(input.command, input.values, { resolvePath: input.resolvePath }),
  );
  let sink: ((channel: 'stdout' | 'stderr', text: string) => void) | undefined;
  let log: LogSink | undefined;
  if (input.writeLogs !== false) {
    log = fileLogSink(input.runDir, input.command.id);
    sink = log.sink;
  }
  const result = await runOnce(executable, argv, input.command.id, deps, sink);
  log?.close();
  return { result, commandLines: [renderCommandLine(executable, argv)] };
}

/** The gate: four read-only steps, stopping at the first non-zero exit. */
export async function runGate(
  input: {
    runDir: string;
    steps: readonly { label: string; argv: readonly string[] }[];
    executable?: string;
    writeLogs?: boolean;
  },
  deps: RunDeps,
): Promise<{ results: ProcessResult[]; status: 'ok' | 'failed'; commandLines: string[] }> {
  const executable = input.executable ?? npmExecutable();
  const results: ProcessResult[] = [];
  const commandLines = input.steps.map((step) => renderCommandLine(executable, step.argv));
  for (const step of input.steps) {
    let sink: ((channel: 'stdout' | 'stderr', text: string) => void) | undefined;
    let log: LogSink | undefined;
    if (input.writeLogs !== false) {
      log = fileLogSink(input.runDir, stem(step.label));
      sink = log.sink;
    }
    // Deliberately SERIAL, unlike the shards: these four steps contend for the
    // same tsbuildinfo and the same node_modules, and a green gate has to mean
    // the four ran against a settled tree.
    const result = await runOnce(executable, step.argv, step.label, deps, sink);
    log?.close();
    results.push(result);
    if (result.code !== 0) {
      deps.onEvent({
        kind: 'note',
        stream: 'gate',
        text: `${step.label} exited ${String(result.code)} — stopping; later steps were not run.\n`,
      });
      return { results, status: 'failed', commandLines };
    }
  }
  return { results, status: 'ok', commandLines };
}
