/**
 * T-1603a · The committed, re-runnable balance sweep.
 *
 * WHAT IT MEASURES. It runs the policy fleet across a seed range and folds every
 * run's `CampaignStatsReport` into the baseline distributions the memo
 * (`docs/balance/BASELINE-T-1603a.md`) is built from: Tour One clear day, route
 * EVs, combat EV by tier parity, death rate, deed pacing. All arithmetic lives in
 * the pure `./aggregate.js`; this file is the only half that touches argv and the
 * filesystem (the T-1602b `flake.ts`/`flake-io.ts` split).
 *
 * NOT A CI TEST, by the task's own terms. It is a script: `tsc -b` and eslint
 * cover it (it is inside `src/**`), vitest does not (vitest only collects
 * `*.test.ts`). The entry point below is guarded so importing this module — or
 * type-checking it — never starts a sweep.
 *
 * ------------------------------------------------------------------------
 * RUNTIME BUDGET — read before choosing a horizon.
 *
 * `runCampaign` is roughly QUADRATIC in days: the day loop rescans a growing
 * event log, so doubling the horizon roughly quadruples the cost. Measured on the
 * authoring machine (Windows 10, node 22, trader policy, one run each):
 *
 *     days :   35     60     100     120     150
 *     ms   :  283    614   1,639   2,292   3,322
 *
 * A naive "500 seeds x 7 policies x 300 days" is therefore ~10 HOURS. The baseline
 * is taken as two arms instead:
 *
 *   Tour One arm (the headline 500-seed sweep) — 500 seeds x 7 policies x 35 days,
 *     ~17 min single-threaded. Covers Tour One clear day, combat EV, death rate,
 *     route EV and early deed pacing.
 *   Veteran arm — 100 seeds x 7 policies x 120 days, ~27 min single-threaded.
 *     Covers deed pacing past Tour One, route churn and the longer-horizon EVs.
 *
 * Both split cleanly with `--shard i/N` (seed s belongs to shard `(s - 1) % N`), so
 * four concurrent processes bring them to a measured 5m30s and 8m35s on an 8-core box.
 *
 * The quadratic day-cost is itself a baseline finding and is recorded in the memo
 * as a flag for T-1605c (the performance pass).
 * ------------------------------------------------------------------------
 *
 * HOW TO RUN (from the repo root):
 *
 *   # Tour One arm, four shards in parallel, then merge:
 *   npm run balance:sweep -w @spacerquest/sim -- --label tour-one --seeds 500 --days 35 --shard 1/4
 *   ... (2/4, 3/4, 4/4) ...
 *   npm run balance:sweep -w @spacerquest/sim -- --label tour-one --merge
 *
 *   # Veteran arm:
 *   npm run balance:sweep -w @spacerquest/sim -- --label veteran --seeds 100 --days 120 --shard 1/4
 *   npm run balance:sweep -w @spacerquest/sim -- --label veteran --merge
 *
 *   # T-140 · A TRACED run (docs/BALANCE-TELEMETRY_SPEC.md) — one JSONL line per NPC
 *   # captain decision, beside the rows file:
 *   npm run balance:sweep -w @spacerquest/sim -- --label npc-trace --seeds 3 --days 30 \
 *     --shard 1/1 --trace-npc-decisions
 *
 *   A traced run is FOR DIAGNOSIS, NEVER FOR A CAPSTONE. The career it plays is
 *   identical (tracing is observation only, and the untraced/traced row files are
 *   byte-identical), but it writes tens of thousands of extra lines to disk, so keep
 *   it small and keep it out of the 8,000-run baseline path.
 *
 * Raw rows land in `.scratch/balance/` (gitignored — 3,500 runs of raw encounter
 * and route records are not a repo artifact). The merge step writes the COMMITTED
 * aggregate to `docs/balance/baseline-<label>.json`, which is what T-1603b/T-1603c
 * diff against.
 *
 * Progress goes to stderr; stdout stays clean so `--merge` output can be piped.
 */

import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NpcDecisionTrace } from '@spacerquest/engine';

import { runCampaign, type SimPolicyName } from '../index.js';
import { aggregate, summarizeReport, type SeedRow } from './aggregate.js';

/** The default fleet: the six competent policies (the balance instruments) plus
 *  `greedy` as a naive control, so the memo can say what "playing badly" costs.
 *  `idle` and `random` are deliberately out — they are protocol/robustness
 *  instruments, not balance ones, and would drag every fleet distribution toward
 *  noise. Both remain available via `--policies`. */
const DEFAULT_POLICIES: readonly SimPolicyName[] = [
  'trader',
  'fighter',
  'explorer',
  'veteran',
  'smuggler',
  'gambler',
  'greedy',
];

const VALID_POLICIES: readonly SimPolicyName[] = [
  'idle',
  'greedy',
  'random',
  'trader',
  'fighter',
  'explorer',
  'veteran',
  'smuggler',
  'gambler',
  // R1 (docs/BALANCE-REDESIGN-WORKLIST.md) · the human-plausible pilot. Valid but
  // deliberately OUT of DEFAULT_POLICIES: it is a measurement instrument run
  // beside the `trader` row, not a seventh archetype, and folding it into the
  // default fleet would silently move every `fleet` union number in the baseline.
  'trader-degraded',
];

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const DEFAULT_ROWS_DIR = join(REPO_ROOT, '.scratch', 'balance');
const DEFAULT_AGGREGATE_DIR = join(REPO_ROOT, 'docs', 'balance');

export interface SweepOptions {
  label: string;
  seeds: number;
  seedStart: number;
  days: number;
  policies: SimPolicyName[];
  shardIndex: number;
  shardCount: number;
  rowsDir: string;
  aggregateDir: string;
  merge: boolean;
  /**
   * N7 · Days at which every run records a {@link MilestoneSample} — the real
   * progression spread the smoke fixtures are seeded from. Empty by default so
   * an ordinary sweep is byte-identical to a pre-N7 one; a capstone that intends
   * to re-cut the fixtures passes the smoke tiers' start days.
   */
  milestoneDays: number[];
  /**
   * T-140 · Write one JSONL line per NPC captain decision beside the rows file
   * (docs/BALANCE-TELEMETRY_SPEC.md §4(4)). Off by default so the routine capstone
   * neither slows down nor changes shape — spec §4(3). Diagnosis only.
   */
  traceNpcDecisions: boolean;
}

function usage(): string {
  return [
    'Usage: npm run balance:sweep -w @spacerquest/sim -- [options]',
    '',
    '  --label <name>        Arm name; keys the row/aggregate filenames. Default "tour-one".',
    '  --seeds <n>           Seed count. Default 500.',
    '  --seed-start <n>      First seed. Default 1.',
    '  --days <n>            Horizon per run. Default 35.',
    `  --policies a,b,c      Comma-separated. Default ${DEFAULT_POLICIES.join(',')}.`,
    '  --shard i/N           Run only seeds where (seed - seedStart) % N === i - 1.',
    '  --out <dir>           Raw row directory. Default .scratch/balance (gitignored).',
    '  --aggregate-out <dir> Aggregate directory. Default docs/balance.',
    '  --milestone-days a,b  N7: record a milestone sample at the dawn of each day, so the',
    '                        capstone harvests the real progression spread the smoke fixtures',
    '                        are seeded from. Off by default (rows stay pre-N7 shaped).',
    '  --trace-npc-decisions T-140: also write traces-<label>-shard<i>of<N>.jsonl to the raw',
    '                        row directory — one line per NPC captain decision, with the',
    '                        distribution the engine otherwise discards. Off by default;',
    '                        diagnosis only, never a capstone. Cannot be combined with --merge.',
    '  --merge               Do not sweep: read every shard row file for --label,',
    '                        aggregate, and write docs/balance/baseline-<label>.json.',
    '  --help',
    '',
    'See the header of packages/sim/src/balance/sweep.ts for the runtime budget.',
  ].join('\n');
}

function parsePositiveInteger(flag: string, raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') throw new Error(`Missing value for ${flag}`);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be an integer >= 1`);
  }
  return parsed;
}

function parsePolicies(raw: string | undefined): SimPolicyName[] {
  if (raw === undefined || raw.trim() === '') throw new Error('Missing value for --policies');
  const names = raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  if (names.length === 0) throw new Error('--policies listed no policies');
  // THROW, never fall through. `resolvePolicy` in ../index.ts silently answers an
  // unknown name with the RANDOM policy, so a typo here would otherwise produce a
  // full 500-seed sweep of the wrong policy that looks entirely plausible in the
  // output. Validated against the same union the CLI validates against.
  for (const name of names) {
    if (!(VALID_POLICIES as readonly string[]).includes(name)) {
      throw new Error(`Invalid policy: ${name} (expected one of ${VALID_POLICIES.join(', ')})`);
    }
  }
  return names as SimPolicyName[];
}

/** N7 · Comma-separated day numbers. Validated rather than coerced for the same
 *  reason `parsePolicies` throws: a silently-dropped typo would produce a capstone
 *  with no milestones in it and no sign that any were asked for. */
function parseMilestoneDays(raw: string | undefined): number[] {
  if (raw === undefined || raw.trim() === '') throw new Error('Missing value for --milestone-days');
  const days = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => parsePositiveInteger('--milestone-days', part));
  if (days.length === 0) throw new Error('--milestone-days listed no days');
  return [...new Set(days)].sort((a, b) => a - b);
}

function parseShard(raw: string | undefined): { index: number; count: number } {
  if (raw === undefined || raw.trim() === '') throw new Error('Missing value for --shard');
  const parts = raw.split('/');
  if (parts.length !== 2) throw new Error('--shard must look like i/N');
  const index = parsePositiveInteger('--shard i', parts[0]);
  const count = parsePositiveInteger('--shard N', parts[1]);
  if (index > count) throw new Error('--shard i must be <= N');
  return { index, count };
}

export function parseSweepArgs(argv: readonly string[]): SweepOptions | { help: true } {
  const options: SweepOptions = {
    label: 'tour-one',
    seeds: 500,
    seedStart: 1,
    days: 35,
    policies: [...DEFAULT_POLICIES],
    shardIndex: 1,
    shardCount: 1,
    rowsDir: DEFAULT_ROWS_DIR,
    aggregateDir: DEFAULT_AGGREGATE_DIR,
    merge: false,
    milestoneDays: [],
    traceNpcDecisions: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') return { help: true };
    if (arg === '--merge') {
      options.merge = true;
    } else if (arg === '--trace-npc-decisions') {
      options.traceNpcDecisions = true;
    } else if (arg === '--label') {
      const value = argv[index + 1];
      if (value === undefined || value.trim() === '') throw new Error('Missing value for --label');
      options.label = value.trim();
      index += 1;
    } else if (arg === '--seeds') {
      options.seeds = parsePositiveInteger('--seeds', argv[index + 1]);
      index += 1;
    } else if (arg === '--seed-start') {
      options.seedStart = parsePositiveInteger('--seed-start', argv[index + 1]);
      index += 1;
    } else if (arg === '--days') {
      options.days = parsePositiveInteger('--days', argv[index + 1]);
      index += 1;
    } else if (arg === '--milestone-days') {
      options.milestoneDays = parseMilestoneDays(argv[index + 1]);
      index += 1;
    } else if (arg === '--policies') {
      options.policies = parsePolicies(argv[index + 1]);
      index += 1;
    } else if (arg === '--shard') {
      const shard = parseShard(argv[index + 1]);
      options.shardIndex = shard.index;
      options.shardCount = shard.count;
      index += 1;
    } else if (arg === '--out') {
      const value = argv[index + 1];
      if (value === undefined || value.trim() === '') throw new Error('Missing value for --out');
      options.rowsDir = resolve(value);
      index += 1;
    } else if (arg === '--aggregate-out') {
      const value = argv[index + 1];
      if (value === undefined || value.trim() === '') {
        throw new Error('Missing value for --aggregate-out');
      }
      options.aggregateDir = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg ?? ''}`);
    }
  }

  // T-140 · THROW, never fall through — the same rule `parsePolicies` above states
  // and for the same reason. `--merge` re-reads finished row files and plays no
  // career, so it can produce no traces; silently ignoring the flag would let a
  // run report success while having traced nothing at all.
  if (options.merge && options.traceNpcDecisions) {
    throw new Error(
      '--trace-npc-decisions cannot be combined with --merge (a merge plays no days)',
    );
  }

  return options;
}

/** Seed s belongs to shard `(s - seedStart) % shardCount`, 1-indexed. Chosen over
 *  contiguous blocks so every shard sees the same mix of seeds — a block split
 *  would let one shard finish minutes before another if difficulty correlates with
 *  seed order. */
function inShard(seed: number, options: SweepOptions): boolean {
  return (seed - options.seedStart) % options.shardCount === options.shardIndex - 1;
}

function rowsFileName(options: SweepOptions): string {
  return `rows-${options.label}-shard${options.shardIndex}of${options.shardCount}.json`;
}

/** T-140 · spec §4(4)'s location convention — a sibling of the rows file, under the
 *  same gitignored `.scratch/balance/`, for the same reason: raw per-decision
 *  records are not a repo artifact. */
function tracesFileName(options: SweepOptions): string {
  return `traces-${options.label}-shard${options.shardIndex}of${options.shardCount}.jsonl`;
}

/** How many JSONL lines are buffered before a `writeSync`. */
const TRACE_FLUSH_LINES = 1000;

/**
 * T-140 · A STREAMING JSONL writer, and streaming is not a nicety here: one shard
 * of the veteran arm is ~30 captains x ~1-2 decisions x 120 days x 250 seeds x 7
 * policies of entries, which no in-memory array survives. Opened before the seed
 * loop, flushed every {@link TRACE_FLUSH_LINES}, closed after it.
 */
function openTraceWriter(target: string): {
  sink: (entry: NpcDecisionTrace) => void;
  close: () => number;
} {
  const fd = openSync(target, 'w');
  let buffer: string[] = [];
  let written = 0;
  const flush = (): void => {
    if (buffer.length === 0) return;
    writeSync(fd, `${buffer.join('\n')}\n`);
    buffer = [];
  };
  return {
    sink: (entry) => {
      buffer.push(JSON.stringify(entry));
      written += 1;
      if (buffer.length >= TRACE_FLUSH_LINES) flush();
    },
    close: () => {
      flush();
      closeSync(fd);
      return written;
    },
  };
}

function formatElapsed(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
}

function runSweep(options: SweepOptions): void {
  const rows: SeedRow[] = [];
  const started = Date.now();
  const lastSeed = options.seedStart + options.seeds - 1;
  let completed = 0;
  const planned =
    options.policies.length *
    Array.from({ length: options.seeds }, (_, offset) => options.seedStart + offset).filter(
      (seed) => inShard(seed, options),
    ).length;

  process.stderr.write(
    `[balance] ${options.label} shard ${options.shardIndex}/${options.shardCount}: ` +
      `${planned} runs (${options.days} days, ${options.policies.join(',')})\n`,
  );

  // T-140 · The file is opened ONCE, before the seed loop, and only when asked.
  mkdirSync(options.rowsDir, { recursive: true });
  const traceTarget = join(options.rowsDir, tracesFileName(options));
  const traceWriter = options.traceNpcDecisions ? openTraceWriter(traceTarget) : null;
  if (traceWriter) {
    process.stderr.write(`[balance] tracing NPC decisions to ${traceTarget}\n`);
  }
  // The extras object handed to an UNTRACED run is byte-for-byte the one this file
  // built before T-140 — the traced branch is a separate object, so the ordinary
  // path cannot acquire a field by accident.
  const milestoneExtras =
    options.milestoneDays.length === 0 ? {} : { milestoneDays: options.milestoneDays };
  const extras = traceWriter
    ? { ...milestoneExtras, npcDecisionTrace: traceWriter.sink }
    : milestoneExtras;

  for (let seed = options.seedStart; seed <= lastSeed; seed += 1) {
    if (!inShard(seed, options)) continue;
    for (const policy of options.policies) {
      rows.push(summarizeReport(runCampaign(seed, options.days, policy, extras)));
      completed += 1;
      if (completed % 25 === 0 || completed === planned) {
        process.stderr.write(
          `[balance] ${completed}/${planned} · seed ${seed} · ${policy} · ` +
            `${formatElapsed(Date.now() - started)} elapsed\n`,
        );
      }
    }
  }

  const tracedEntries = traceWriter?.close();

  const target = join(options.rowsDir, rowsFileName(options));
  writeFileSync(target, `${JSON.stringify(rows)}\n`, 'utf8');
  process.stderr.write(
    `[balance] wrote ${rows.length} rows to ${target} in ${formatElapsed(Date.now() - started)}\n`,
  );
  if (tracedEntries !== undefined) {
    process.stderr.write(
      `[balance] wrote ${tracedEntries} NPC decision traces to ${traceTarget}\n`,
    );
  }
}

function mergeShards(options: SweepOptions): void {
  const prefix = `rows-${options.label}-shard`;
  let names: string[];
  try {
    names = readdirSync(options.rowsDir).filter(
      (name) => name.startsWith(prefix) && name.endsWith('.json'),
    );
  } catch {
    throw new Error(`No row directory at ${options.rowsDir} — run the sweep first`);
  }
  if (names.length === 0) {
    throw new Error(`No row files matching ${prefix}*.json in ${options.rowsDir}`);
  }
  names.sort();

  const rows: SeedRow[] = [];
  for (const name of names) {
    const parsed = JSON.parse(readFileSync(join(options.rowsDir, name), 'utf8')) as SeedRow[];
    rows.push(...parsed);
    process.stderr.write(`[balance] merged ${parsed.length} rows from ${name}\n`);
  }
  // Deterministic order regardless of which shard finished first, so re-merging
  // the same shards always produces a byte-identical aggregate.
  rows.sort((a, b) => a.seed - b.seed || a.policy.localeCompare(b.policy));

  const summary = aggregate(options.label, rows);
  mkdirSync(options.aggregateDir, { recursive: true });
  const target = join(options.aggregateDir, `baseline-${options.label}.json`);
  writeFileSync(target, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  process.stderr.write(`[balance] wrote aggregate for ${rows.length} rows to ${target}\n`);
}

export function main(argv: string[] = process.argv.slice(2)): void {
  try {
    const parsed = parseSweepArgs(argv);
    if ('help' in parsed) {
      process.stdout.write(`${usage()}\n`);
      process.exitCode = 0;
      return;
    }
    if (parsed.merge) mergeShards(parsed);
    else runSweep(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`${message}\n${usage()}\n`);
    process.exitCode = 1;
  }
}

// Guarded exactly as ../index.ts guards its own CLI: importing this module (or
// type-checking it) must never start a 17-minute sweep.
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main();
}
