/**
 * T-154 · The argv/filesystem half of the native LLM pilot.
 *
 * Same pure/IO split — and the same reason — as `balance/sweep.ts`: everything
 * that decides anything lives in the pure `./pilot.js`; this file owns argv, the
 * transport wiring, the JSONL file and the exit code. Operator documentation is
 * `packages/sim/PILOT.md`.
 *
 * HOW TO RUN (from the repo root):
 *
 *   npm run pilot -- --seed 1 --days 30                    # deterministic, no API calls
 *   npm run pilot -- --brain anthropic --seed 1 --days 30  # the paid Tier-2 pass
 *   npm run pilot -- --brain recorded --replay test-results/pilot/<runId>.jsonl --seed 1
 *
 * `--brain first-legal` is the DEFAULT so an accidental invocation costs nothing.
 *
 * NOT A CI TEST, by the same terms as `balance/sweep.ts`: it is a script. `tsc -b`
 * and eslint cover it; vitest collects only `*.test.ts`. The entry point below is
 * guarded so importing or type-checking this module never starts a run.
 *
 * SCOPE: protocol/state level only. This driver cannot see UI-only bugs — PILOT.md
 * §2 and `docs/TESTING-STRATEGY.md` Part D.
 */

import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeSessionHandler } from './protocol-stdio.js';
import {
  DEFAULT_MAX_STEPS_PER_DAY,
  actionSequence,
  firstDivergence,
  firstLegalBrain,
  parseJsonl,
  randomBrain,
  recordedBrain,
  runPassed,
  runPilot,
  type PilotBrain,
  type PilotLogEntry,
} from './pilot.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
/** `test-results/` is already gitignored — a run's trail is an artefact, not a source. */
const DEFAULT_OUT_DIR = join(REPO_ROOT, 'test-results', 'pilot');

/**
 * T-155 · **F-155-2, found by running the documented command.** Every path flag
 * anchors on the REPO ROOT, not on `process.cwd()`.
 *
 * `npm run pilot` is an npm workspace script (`packages/sim/package.json`), so its
 * cwd is `packages/sim/` — while the default output directory above is built from
 * `REPO_ROOT`. Before this, `--out test-results/pilot/x` (copied from the CLI's own
 * help text) wrote to `packages/sim/test-results/...`, and PILOT.md §1's documented
 * `--replay test-results/pilot/<runId>.jsonl` could never find the file the default
 * run had just written. A relative path meant two different directories depending
 * on which flag it was passed to, which makes a documented invocation a lie.
 * Absolute paths are passed through untouched.
 */
function resolveFromRepoRoot(raw: string): string {
  return isAbsolute(raw) ? raw : resolve(REPO_ROOT, raw);
}

type BrainName = 'first-legal' | 'random' | 'anthropic' | 'recorded';
const BRAIN_NAMES: BrainName[] = ['first-legal', 'random', 'anthropic', 'recorded'];

export interface PilotCliOptions {
  seeds: number[];
  days: number;
  brain: BrainName;
  replay: string | null;
  outDir: string;
  maxStepsPerDay: number;
  edition: 'full' | 'demo';
}

/**
 * T-155 · The two things `npm run pilot` can be asked to do. `--compare` is a mode
 * rather than a flag on a run because it takes no seed, no brain and no horizon —
 * accepting those silently would let `--compare a b --brain anthropic` read as a
 * paid run that never happened, which is the same class of mistake the `--brain`
 * throw below already guards.
 */
export type PilotCliCommand =
  | { mode: 'help' }
  | { mode: 'compare'; left: string; right: string }
  | ({ mode: 'run' } & PilotCliOptions);

function usage(): string {
  return [
    'Usage: npm run pilot -- [options]',
    '',
    '  --seed <n>            Seed, repeatable or comma-separated. Default 1.',
    '  --days <n>            Horizon per run. Default 30.',
    `  --brain <name>        ${BRAIN_NAMES.join(' | ')}. Default first-legal (free, offline).`,
    '  --replay <path.jsonl> With --brain recorded: the prior run to replay.',
    '  --out <dir>           JSONL output directory. Default test-results/pilot.',
    `  --max-steps-per-day <n>  Forced end-day after this many steps. Default ${DEFAULT_MAX_STEPS_PER_DAY}.`,
    '  --edition full|demo   Licence to open the career on. Default full.',
    '  --compare <a.jsonl> <b.jsonl>',
    '                        T-155 determinism check: normalise both trails to their',
    '                        action sequences (volatile runId/clock fields dropped),',
    '                        print each digest, and report IDENTICAL or the first',
    '                        diverging step. Exits 1 on divergence. Takes no other flag.',
    '  --help',
    '',
    'Exits non-zero when illegalAttempts, blockedFromLegal, protocolErrors or',
    'diceBoundsViolations is non-zero on any run. See packages/sim/PILOT.md.',
  ].join('\n');
}

function parsePositiveInteger(flag: string, raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') throw new Error(`Missing value for ${flag}`);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be an integer >= 1`);
  return parsed;
}

export function parsePilotArgs(argv: readonly string[]): PilotCliCommand {
  const options: PilotCliOptions = {
    seeds: [],
    days: 30,
    brain: 'first-legal',
    replay: null,
    outDir: DEFAULT_OUT_DIR,
    maxStepsPerDay: DEFAULT_MAX_STEPS_PER_DAY,
    edition: 'full',
  };
  let compare: { left: string; right: string } | null = null;
  const runFlags: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') return { mode: 'help' };
    if (arg === '--compare') {
      const left = argv[index + 1];
      const right = argv[index + 2];
      if (left === undefined || right === undefined || left.trim() === '' || right.trim() === '') {
        throw new Error('--compare needs two paths: --compare <a.jsonl> <b.jsonl>');
      }
      compare = { left: resolveFromRepoRoot(left), right: resolveFromRepoRoot(right) };
      index += 2;
      continue;
    }
    runFlags.push(String(arg));
    if (arg === '--seed') {
      const raw = argv[index + 1];
      if (raw === undefined) throw new Error('Missing value for --seed');
      for (const part of raw.split(',')) {
        if (part.trim() !== '') options.seeds.push(parsePositiveInteger('--seed', part));
      }
      index += 1;
    } else if (arg === '--days') {
      options.days = parsePositiveInteger('--days', argv[index + 1]);
      index += 1;
    } else if (arg === '--max-steps-per-day') {
      options.maxStepsPerDay = parsePositiveInteger('--max-steps-per-day', argv[index + 1]);
      index += 1;
    } else if (arg === '--brain') {
      const raw = argv[index + 1];
      // THROW, never fall through to a default: a typo that silently ran the free
      // offline brain would report "the pilot passed" about a pass that never
      // called the model (the `balance/sweep.ts` --policies precedent).
      if (raw === undefined || !(BRAIN_NAMES as string[]).includes(raw)) {
        throw new Error(`--brain must be one of ${BRAIN_NAMES.join(', ')}`);
      }
      options.brain = raw as BrainName;
      index += 1;
    } else if (arg === '--replay') {
      const raw = argv[index + 1];
      if (raw === undefined || raw.trim() === '') throw new Error('Missing value for --replay');
      options.replay = resolveFromRepoRoot(raw);
      index += 1;
    } else if (arg === '--out') {
      const raw = argv[index + 1];
      if (raw === undefined || raw.trim() === '') throw new Error('Missing value for --out');
      options.outDir = resolveFromRepoRoot(raw);
      index += 1;
    } else if (arg === '--edition') {
      const raw = argv[index + 1];
      if (raw !== 'full' && raw !== 'demo') throw new Error('--edition must be full or demo');
      options.edition = raw;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${String(arg)}`);
    }
  }

  if (compare !== null) {
    // Reject rather than ignore — the `--brain` precedent above, applied to the
    // mode: silently dropping `--seed 7 --days 30` here would print a determinism
    // verdict about two files while the operator believed a run had happened.
    if (runFlags.length > 0) {
      throw new Error(`--compare takes no other flags; got ${runFlags.join(' ')}`);
    }
    return { mode: 'compare', ...compare };
  }

  if (options.seeds.length === 0) options.seeds.push(1);
  if (options.brain === 'recorded' && options.replay === null) {
    throw new Error('--brain recorded requires --replay <path.jsonl>');
  }
  return { mode: 'run', ...options };
}

/**
 * T-155 · The same-seed determinism check, as a command rather than a shell
 * pipeline, so the normalisation it depends on is the one `pilot.ts` defines and
 * `pilot.test.ts` proves — not an ad-hoc `diff` a reader has to trust.
 */
export function comparePilotRuns(
  leftText: string,
  rightText: string,
): { identical: boolean; report: string } {
  const left = actionSequence(parseJsonl(leftText));
  const right = actionSequence(parseJsonl(rightText));
  const digest = (sequence: readonly string[]): string =>
    createHash('sha256').update(sequence.join('\n')).digest('hex');
  const divergence = firstDivergence(left, right);
  const lines = [
    `  a  ${left.length} steps  sha256 ${digest(left)}`,
    `  b  ${right.length} steps  sha256 ${digest(right)}`,
  ];
  if (divergence === null) {
    lines.push('  IDENTICAL — the two runs produced the same action sequence.');
    return { identical: true, report: lines.join('\n') };
  }
  lines.push(
    `  DIVERGED at step index ${divergence} (0-based, step entries only):`,
    `    a: ${left[divergence] ?? '<end of sequence>'}`,
    `    b: ${right[divergence] ?? '<end of sequence>'}`,
  );
  return { identical: false, report: lines.join('\n') };
}

async function resolveBrain(options: PilotCliOptions, seed: number): Promise<PilotBrain> {
  if (options.brain === 'first-legal') return firstLegalBrain();
  if (options.brain === 'random') return randomBrain(seed);
  if (options.brain === 'recorded') {
    const text = readFileSync(options.replay!, 'utf8');
    return recordedBrain(parseJsonl(text));
  }
  // Imported lazily so a free run never loads the SDK and never needs a key.
  const { anthropicBrain } = await import('./pilot-anthropic.js');
  return anthropicBrain();
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const parsed = parsePilotArgs(argv);
  if (parsed.mode === 'help') {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (parsed.mode === 'compare') {
    const result = comparePilotRuns(
      readFileSync(parsed.left, 'utf8'),
      readFileSync(parsed.right, 'utf8'),
    );
    process.stdout.write(`compare\n  a  ${parsed.left}\n  b  ${parsed.right}\n${result.report}\n`);
    return result.identical ? 0 : 1;
  }

  mkdirSync(parsed.outDir, { recursive: true });
  let failed = false;

  for (const seed of parsed.seeds) {
    const brain = await resolveBrain(parsed, seed);
    const runId = `${brain.kind}-s${seed}-d${parsed.days}-${Date.now()}`;
    const outPath = join(parsed.outDir, `${runId}.jsonl`);
    const handle = openSync(outPath, 'w');
    try {
      // Flush per entry (T-1604a's discipline): a run that crashes on step 900
      // still leaves 899 readable lines behind.
      const write = (entry: PilotLogEntry): void => {
        writeSync(handle, `${JSON.stringify(entry)}\n`);
      };
      const { summary } = await runPilot({
        transport: makeSessionHandler(),
        brain,
        seed,
        days: parsed.days,
        edition: parsed.edition,
        maxStepsPerDay: parsed.maxStepsPerDay,
        runId,
        onEntry: write,
      });
      process.stdout.write(
        [
          `seed ${seed} · ${brain.kind}${brain.model === undefined ? '' : ` (${brain.model})`}`,
          `  log                  ${outPath}`,
          `  daysPlayed           ${summary.daysPlayed} (stopped by ${summary.stoppedBy}, final day ${summary.finalDay})`,
          `  stepsApplied         ${summary.stepsApplied}`,
          `  illegalAttempts      ${summary.illegalAttempts}`,
          `  fallbacks            ${summary.fallbacks}`,
          `  blockedFromLegal     ${summary.blockedFromLegal}`,
          `  protocolErrors       ${summary.protocolErrors}`,
          `  diceBoundsViolations ${summary.diceBoundsViolations}`,
          '',
        ].join('\n'),
      );
      if (!runPassed(summary)) failed = true;
    } finally {
      closeSync(handle);
    }
  }

  return failed ? 1 : 0;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  try {
    process.exitCode = await runCli(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`${message}\n${usage()}\n`);
    process.exitCode = 1;
  }
}

// Guarded exactly as `balance/sweep.ts` guards its own CLI: importing this module
// (or type-checking it) must never start a run.
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  void main();
}
