// ---------------------------------------------------------------------------
// T-1602b (fix round 2) · READING A DIRECTORY OF RUN REPORTS, ONCE.
//
// The single place that touches the filesystem for the flake measurement, and
// the single place that turns a directory of reports into a printed table and an
// exit code. Both entry points share it — `flake-cli.ts` (what CI's aggregate
// job runs) and `flake-measure.ts` (the local equivalent of the whole matrix) —
// so the two can never drift into disagreeing about which files count, what
// order they are read in, or what the gate says. `flake.ts` itself stays PURE:
// no `fs`, no `process`, no clock.
// ---------------------------------------------------------------------------
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gatePasses, renderMarkdown, summarize, type PlaywrightJsonReport } from './flake';

/**
 * Where both the workflow and the local runner write `run-<i>.json`, relative to
 * `packages/ui` (CI runs the e2e steps with `working-directory: packages/ui`, and
 * `npm run … -w @spacerquest/ui` puts the local runner in the same cwd).
 *
 * NOT under `test-results/`, and that is load-bearing. Playwright DELETES its
 * `outputDir` (default `test-results/`) at the start of every run, so the
 * round-1 location `test-results/flake/` silently self-destructed the moment a
 * second run started: run 2 wiped run 1's report, run 3 wiped run 2's, and a
 * 20-run measurement ended with a single surviving file. It looked fine in CI
 * only because each matrix shard is a fresh runner that runs the suite once —
 * the bug was invisible until the whole matrix ran on one machine. Reports the
 * measurement depends on must live outside the directory the tool under
 * measurement is entitled to erase.
 */
export const DEFAULT_REPORT_DIR = 'flake-results';

/** Report filenames in shard order — `run-2.json` before `run-10.json`, because
 *  the per-run table is read by a human comparing shards. */
export function orderReportFiles(names: readonly string[]): string[] {
  return names
    .filter((n) => n.endsWith('.json'))
    .sort((a, b) => {
      const na = Number(/(\d+)/.exec(a)?.[1] ?? '0');
      const nb = Number(/(\d+)/.exec(b)?.[1] ?? '0');
      return na - nb || a.localeCompare(b);
    });
}

/** Parse every `*.json` in `dir`, in shard order. THROWS on an unreadable,
 *  unparseable or empty directory rather than returning `[]`: an empty
 *  measurement is not a passing measurement, and a reassuring 0.00% printed over
 *  zero runs is the one output this tool must never produce. */
export function readReportsFromDir(dir: string): PlaywrightJsonReport[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    throw new Error(`no such directory: ${dir}`);
  }

  const files = orderReportFiles(names);
  if (files.length === 0) throw new Error(`no JSON reports found in ${dir}`);

  return files.map((file) => {
    const path = join(dir, file);
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as PlaywrightJsonReport;
    } catch (err) {
      throw new Error(`could not parse ${path}: ${String(err)}`);
    }
  });
}

/**
 * Read `dir`, print the markdown table, and return the process exit code:
 * 0 when the gate passes, 1 otherwise. This is the whole of what CI's aggregate
 * job does and the whole of what the local runner does after its last run, so
 * the CI evidence and the local evidence are the same computation over the same
 * inputs.
 */
export function reportDirectory(dir: string): number {
  let reports: PlaywrightJsonReport[];
  try {
    reports = readReportsFromDir(dir);
  } catch (err) {
    console.error(`flake:report — ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const summary = summarize(reports);
  console.log(renderMarkdown(summary));

  if (summary.tourOne.total === 0) {
    // `gatePasses` would say true here — a rate of 0 over an empty denominator.
    // Refuse it: a measurement that counted no tagged test measured nothing.
    console.error('\nflake:report — no @tour-one tests ran; the gate has nothing to measure.');
    return 1;
  }
  return gatePasses(summary) ? 0 : 1;
}
