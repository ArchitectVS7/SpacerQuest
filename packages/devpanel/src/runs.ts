/**
 * T-143 · RUN DIRECTORIES, RUN RECORDS, AND THE PROMOTION GUARD — spec §3.
 *
 * Split the way the rest of this repo splits I/O from judgment: every rule below
 * (naming, the promotion allowlist, the traversal guard) is a pure total
 * function, and the four thin functions at the bottom are the only ones that
 * touch the filesystem.
 *
 * THE §3 SHAPE, RESTATED SO THE CODE CAN BE CHECKED AGAINST IT:
 *
 *   - An ad hoc panel sweep is NOT COMMITTED. It lands in
 *     `.scratch/balance/panel-runs/<label>-<timestamp>/`, which `.gitignore`
 *     already ignores wholesale via its `.scratch/` rule — verified in
 *     `__tests__/isolation.test.ts` with `git check-ignore -v`, so this property
 *     is proved rather than asserted and NO `.gitignore` EDIT WAS MADE OR NEEDED.
 *   - PROMOTING a run to the committed baseline of record is a separate,
 *     deliberate, confirm-gated action — never automatic on sweep completion.
 *     `docs/VERSIONING.md`: a baseline pointer move is "a deliberate act... as its
 *     own commit". So promotion copies exactly one file and then STOPS: it never
 *     shells out to git, it hands back the `git add`/`git commit` lines for the
 *     developer to run themselves.
 *
 * HISTORY IS DERIVED, NOT INDEXED. `listRuns` scans run directories for their
 * `run.json`. A shared mutable index file would let one crashed run corrupt the
 * history of every other; a directory scan cannot.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

export interface RunRecord {
  readonly id: string;
  readonly commandId: string;
  readonly title: string;
  /** The exact command line(s) spawned, as the UI displayed them before the run. */
  readonly commandLines: readonly string[];
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly exitCode: number | null;
  readonly shardCount: number;
  readonly status: 'running' | 'ok' | 'failed';
  /** Repo-relative-ish absolute paths of anything the run produced that the UI links. */
  readonly outputs: readonly string[];
  readonly runDir: string;
}

/** `<runsRoot>/<label>-<YYYYMMDD-HHmmss>` — pure, so the tests do not need a clock. */
export function panelRunDir(runsRoot: string, label: string, startedAtIso: string): string {
  return join(runsRoot, `${label}-${runTimestamp(startedAtIso)}`);
}

export function runTimestamp(iso: string): string {
  // `2026-08-01T09:14:07.123Z` -> `20260801-091407`. Derived from the ISO string
  // rather than from `Date` fields so it is timezone-free and stable in a test.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (match === null) throw new Error(`Not an ISO timestamp: ${iso}`);
  return `${match[1]}${match[2]}${match[3]}-${match[4]}${match[5]}${match[6]}`;
}

/**
 * THE PROMOTION ALLOWLIST. Throws unless all three hold:
 *
 *   1. `src` is inside the panel-runs root — you may only promote something the
 *      panel itself produced, never an arbitrary file off the disk.
 *   2. `dest` resolves inside `<repoRoot>/docs/balance` — the committed baseline
 *      directory and nothing else. Checked AFTER `resolve`, so `..` traversal in
 *      either argument is already collapsed by the time it is compared.
 *   3. `basename(dest)` is `baseline-<slug>.json` — the one artefact shape
 *      `sweep.ts --merge` writes and `balance:diff` reads.
 *
 * A `startsWith(root + sep)` comparison (not a bare `startsWith(root)`) so
 * `docs/balance-scratch/` cannot pass as `docs/balance/`.
 */
export function assertPromotionTarget(input: {
  src: string;
  dest: string;
  runsRoot: string;
  repoRoot: string;
}): void {
  const src = resolve(input.src);
  const dest = resolve(input.dest);
  const runsRoot = resolve(input.runsRoot);
  const baselineDir = resolve(input.repoRoot, 'docs', 'balance');
  if (!src.startsWith(runsRoot + sep)) {
    throw new Error(`Refusing to promote: ${src} is not inside the panel run root ${runsRoot}`);
  }
  if (!dest.startsWith(baselineDir + sep)) {
    throw new Error(`Refusing to promote: ${dest} is not inside ${baselineDir}`);
  }
  if (!/^baseline-[A-Za-z0-9._-]+\.json$/.test(basename(dest))) {
    throw new Error(
      `Refusing to promote: ${basename(dest)} is not a baseline-<label>.json aggregate`,
    );
  }
}

/**
 * The static route's guard. Returns the absolute path only if it stays inside
 * `root`; `null` otherwise. Used for serving generated reports and log files out
 * of the run directories, which is the panel's only `GET` that reads a
 * client-supplied path.
 */
export function resolveInsideRoot(root: string, relativePath: string): string | null {
  const decoded = decodeURIComponent(relativePath).replace(/^\/+/, '');
  if (decoded.includes('\0')) return null;
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, decoded);
  return target === absoluteRoot || target.startsWith(absoluteRoot + sep) ? target : null;
}

/**
 * The git commands a promotion hands back. Returned as TEXT for the developer to
 * run, never executed: `docs/VERSIONING.md` requires a baseline pointer move to
 * be its own deliberate commit, and a tool that stages and commits on your behalf
 * is exactly the "side effect of running a tool" that rule forbids.
 */
export function promotionGitLines(repoRelativeDest: string): string[] {
  return [
    `git add ${repoRelativeDest}`,
    `git commit -m "balance: promote ${basename(repoRelativeDest)} as the baseline of record"`,
  ];
}

// ---------------------------------------------------------------------------
// The filesystem half. Everything above this line is pure.
// ---------------------------------------------------------------------------

export const RUN_RECORD_FILE = 'run.json';

export function ensureRunDir(runDir: string): void {
  mkdirSync(runDir, { recursive: true });
}

export function writeRunRecord(runDir: string, record: RunRecord): void {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, RUN_RECORD_FILE), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

export function readRunRecord(runDir: string): RunRecord | null {
  const file = join(runDir, RUN_RECORD_FILE);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as RunRecord;
  } catch {
    // A half-written record from a killed process is a missing row in the
    // history, not a reason the whole history fails to load.
    return null;
  }
}

/** Newest first, by `startedAt`. */
export function listRuns(runsRoot: string): RunRecord[] {
  if (!existsSync(runsRoot)) return [];
  const records: RunRecord[] = [];
  for (const entry of readdirSync(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const record = readRunRecord(join(runsRoot, entry.name));
    if (record !== null) records.push(record);
  }
  return records.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** The one write outside `.scratch/` this whole package performs. Guarded above. */
export function promoteBaseline(input: {
  src: string;
  dest: string;
  runsRoot: string;
  repoRoot: string;
}): void {
  assertPromotionTarget(input);
  mkdirSync(dirname(resolve(input.dest)), { recursive: true });
  copyFileSync(resolve(input.src), resolve(input.dest));
}
