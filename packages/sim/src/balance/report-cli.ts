/**
 * T-142 · THE TIER 1 TELEMETRY REPORT — the I/O half. Argv and the filesystem
 * live here; every count, sort and comparison lives in the pure
 * `./report-model.ts` and every byte of markup in `./report-html.ts`. That is the
 * T-1602b split `./diff.ts`/`./diff-cli.ts` already follows, and this file is
 * modelled on `./diff-cli.ts` line for line — same `resolveArtifact` path rule,
 * same main-guard, same "throw on an unknown flag" argv discipline.
 *
 * HOW TO RUN (from the repo root):
 *
 *   npm run balance:report -w @spacerquest/sim -- \
 *     --aggregate docs/balance/baseline-t150-postfix.json \
 *     --compare-to docs/balance/baseline-tour-one.json \
 *     --traces .scratch/balance/traces-t140-trace-shard1of1.jsonl \
 *     --playtest-log .scratch/balance/playtest.jsonl
 *
 * IT WRITES EXACTLY ONE FILE, into a gitignored directory, and reads everything
 * else (spec §3, §6). `.scratch/` is already ignored wholesale, so a run leaves
 * `git status` clean; no input is opened for writing anywhere in this file.
 *
 * `--traces <glob>` IN THE SPEC, A REPEATABLE FILE-OR-DIRECTORY FLAG HERE. The
 * package has zero runtime dependencies and this is not the task that changes
 * that, so there is no glob library; an unquoted shell glob expands into repeated
 * flags anyway (`--traces .scratch/balance/traces-*.jsonl` becomes N arguments),
 * and a directory argument covers the quoted case by reading the `traces-*.jsonl`
 * inside it, sorted.
 *
 * ARGV IS STRICT: an unknown flag and a missing value both THROW. A typo that
 * silently produced a plausible-looking report over the wrong inputs is the exact
 * failure this whole spec exists to prevent.
 *
 * READERS (constraint 7): `../__tests__/balance-report.test.ts`, and the
 * `balance:report` script in `packages/sim/package.json`.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BaselineAggregate } from './aggregate.js';
import { renderReportHtml } from './report-html.js';
import {
  buildBeforeAfter,
  buildLeaderboard,
  buildPlaytestView,
  buildTraceView,
  resolveInputProvenance,
  type GeneratorFingerprints,
  type PlaytestSource,
  type ReportModel,
  type TraceSource,
} from './report-model.js';
import { resolveArtifact } from './resolve-artifact.js';
import {
  computeInstrumentFingerprint,
  computeRulesFingerprint,
  REPO_ROOT,
} from './rules-fingerprint.js';

/** Under `.scratch/`, which `.gitignore` already ignores wholesale. Running the
 *  generator must never dirty the working tree (spec §3). */
export const DEFAULT_OUT_DIR = join('.scratch', 'balance', 'reports');

export function usage(): string {
  return [
    'Usage: npm run balance:report -w @spacerquest/sim -- --aggregate <file> [options]',
    '',
    '  --aggregate <file>            REQUIRED. A BaselineAggregate (docs/balance/baseline-*.json).',
    '  --compare-to <file>           A second aggregate; adds the before/after view.',
    '  --traces <file|dir>           NPC decision traces (JSONL). Repeatable. A directory reads',
    '                                every traces-*.jsonl inside it, sorted.',
    '  --playtest-log <file>         A T-141 export (.jsonl / .json / .csv). Repeatable.',
    '  --provenance <file>           JSON carrying rulesFingerprint/instrumentFingerprint to',
    '                                attribute to --aggregate (e.g. docs/balance/smoke/tiers.json).',
    '                                Rendered as "declared by <file>", never as intrinsic.',
    '  --compare-provenance <file>   The same, for --compare-to.',
    `  --out <dir>                   Output directory. Default ${DEFAULT_OUT_DIR} (gitignored).`,
    '  --name <slug>                 Output file name stem. Default derived from the labels.',
    '  --help',
  ].join('\n');
}

export interface ReportCliOptions {
  aggregate: string;
  compareTo: string | null;
  traces: string[];
  playtestLogs: string[];
  provenance: string | null;
  compareProvenance: string | null;
  outDir: string;
  name: string | null;
}

function requireValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseReportArgs(argv: readonly string[]): ReportCliOptions | { help: true } {
  let aggregate: string | null = null;
  let compareTo: string | null = null;
  const traces: string[] = [];
  const playtestLogs: string[] = [];
  let provenance: string | null = null;
  let compareProvenance: string | null = null;
  let outDir: string | null = null;
  let name: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') return { help: true };
    if (arg === '--aggregate') {
      aggregate = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === '--compare-to') {
      compareTo = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === '--traces') {
      traces.push(requireValue(argv, index, arg));
      index += 1;
    } else if (arg === '--playtest-log') {
      playtestLogs.push(requireValue(argv, index, arg));
      index += 1;
    } else if (arg === '--provenance') {
      provenance = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === '--compare-provenance') {
      compareProvenance = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === '--out') {
      outDir = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === '--name') {
      name = requireValue(argv, index, arg);
      index += 1;
    } else {
      // Deliberately fatal for BOTH a typo'd flag and a stray positional: the
      // alternative is a report built over inputs nobody asked for.
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (aggregate === null) throw new Error('--aggregate is required');
  return {
    aggregate: resolveArtifact(aggregate),
    compareTo: compareTo === null ? null : resolveArtifact(compareTo),
    traces: traces.map(resolveArtifact),
    playtestLogs: playtestLogs.map(resolveArtifact),
    provenance: provenance === null ? null : resolveArtifact(provenance),
    compareProvenance: compareProvenance === null ? null : resolveArtifact(compareProvenance),
    outDir: outDir === null ? resolve(REPO_ROOT, DEFAULT_OUT_DIR) : resolveOut(outDir),
    name,
  };
}

/** The out dir may not exist yet, so `resolveArtifact`'s existence probe is the
 *  wrong rule for it: an absolute path is taken as given, a relative one is
 *  resolved against cwd. */
function resolveOut(path: string): string {
  return resolve(process.cwd(), path);
}

function display(path: string): string {
  const relativePath = relative(REPO_ROOT, path);
  return relativePath.startsWith('..') ? path : relativePath.split('\\').join('/');
}

function readText(path: string): string {
  if (!existsSync(path)) throw new Error(`Input not found: ${path}`);
  return readFileSync(path, 'utf8');
}

function loadAggregate(path: string): { raw: string; parsed: BaselineAggregate } {
  const raw = readText(path);
  const parsed = JSON.parse(raw) as BaselineAggregate;
  if (typeof parsed.label !== 'string' || !Array.isArray(parsed.byPolicy)) {
    throw new Error(`${path} is not a sweep aggregate (no label / byPolicy)`);
  }
  return { raw, parsed };
}

function loadSidecar(path: string | null): { path: string; parsed: unknown } | undefined {
  if (path === null) return undefined;
  return { path: display(path), parsed: JSON.parse(readText(path)) as unknown };
}

/** A file argument is taken as one file; a directory argument reads every
 *  `traces-*.jsonl` inside it, sorted, so the quoted-glob case still works. */
export function expandTraceInputs(paths: readonly string[]): string[] {
  const files: string[] = [];
  for (const path of paths) {
    if (!existsSync(path)) throw new Error(`Trace input not found: ${path}`);
    if (statSync(path).isDirectory()) {
      const inside = readdirSync(path)
        .filter((entry) => entry.startsWith('traces-') && entry.endsWith('.jsonl'))
        .sort();
      if (inside.length === 0) throw new Error(`No traces-*.jsonl inside ${path}`);
      files.push(...inside.map((entry) => join(path, entry)));
    } else {
      files.push(path);
    }
  }
  return files;
}

function slugify(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
}

export interface RunResult {
  outFile: string;
  bytes: number;
}

export function run(options: ReportCliOptions, generatedAt: string): RunResult {
  const aggregate = loadAggregate(options.aggregate);
  const aggregateProvenance = resolveInputProvenance(
    display(options.aggregate),
    aggregate.raw,
    aggregate.parsed,
    loadSidecar(options.provenance),
  );

  const traceFiles = expandTraceInputs(options.traces);
  const traceSources: TraceSource[] = traceFiles.map((path) => ({
    path: display(path),
    name: basename(path),
    text: readText(path),
  }));
  const playtestSources: PlaytestSource[] = options.playtestLogs.map((path) => ({
    path: display(path),
    name: basename(path),
    text: readText(path),
  }));

  let beforeAfter: ReportModel['beforeAfter'] = null;
  if (options.compareTo !== null) {
    const compare = loadAggregate(options.compareTo);
    const compareProvenance = resolveInputProvenance(
      display(options.compareTo),
      compare.raw,
      compare.parsed,
      loadSidecar(options.compareProvenance),
    );
    // The FIRST aggregate is "after" — it is the one the leaderboard describes,
    // and `--compare-to` reads as "…compared to this earlier run".
    beforeAfter = buildBeforeAfter(
      compare.parsed,
      aggregate.parsed,
      compareProvenance,
      aggregateProvenance,
    );
  }

  let generator: GeneratorFingerprints | null = null;
  try {
    generator = {
      rulesFingerprint: computeRulesFingerprint().fingerprint,
      instrumentFingerprint: computeInstrumentFingerprint().fingerprint,
    };
  } catch {
    // A tree this walk refuses to fingerprint is still a tree a report can be
    // generated on; the footer says the figure is unavailable rather than
    // guessing one.
    generator = null;
  }

  const name =
    options.name ??
    slugify(
      beforeAfter === null
        ? aggregate.parsed.label
        : `${beforeAfter.beforeLabel}-vs-${beforeAfter.afterLabel}`,
    );

  const model: ReportModel = {
    name,
    leaderboard: buildLeaderboard(aggregate.parsed, aggregateProvenance),
    beforeAfter,
    traces: traceSources.length === 0 ? null : buildTraceView(traceSources),
    playtest: playtestSources.length === 0 ? null : buildPlaytestView(playtestSources),
    generator,
  };

  const html = renderReportHtml(model, { generatedAt });
  mkdirSync(options.outDir, { recursive: true });
  const outFile = join(options.outDir, `${name}.html`);
  writeFileSync(outFile, html, 'utf8');
  return { outFile, bytes: Buffer.byteLength(html, 'utf8') };
}

export function main(argv: string[] = process.argv.slice(2)): void {
  try {
    const parsed = parseReportArgs(argv);
    if ('help' in parsed) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const result = run(parsed, new Date().toISOString());
    process.stdout.write(
      `[balance] wrote ${result.bytes} bytes to ${result.outFile}\n` +
        '[balance] nothing was committed: the output directory is gitignored, and no input was modified.\n',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`${message}\n${usage()}\n`);
    process.exitCode = 1;
  }
}

// Guarded exactly as ./diff-cli.ts guards its own CLI.
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main();
}
