// ---------------------------------------------------------------------------
// T-1602b (fix round 2) · THE LOCAL EQUIVALENT OF THE 20-RUN CI MATRIX.
//
// WHY THIS EXISTS — the round-1 defect, stated plainly.
// Round 1 shipped the flake measurement as CI-only: a `workflow_dispatch` matrix
// in `.github/workflows/e2e-flake.yml`. That made the acceptance criterion
// unobtainable, twice over:
//   1. GitHub only dispatches a workflow that already exists on the DEFAULT
//      BRANCH. A matrix added by the very commit that needs it can never be
//      started (`gh workflow run e2e-flake.yml` -> HTTP 404, "workflow not found
//      on the default branch"), and review/gate run on the uncommitted diff, so
//      there was nothing to point at.
//   2. Even after merging, nothing would have started it: dispatch-only means a
//      human has to remember. A measurement nobody takes is not a measurement.
// Fix 1 is the workflow's new `push` trigger. Fix 2 is this file: the CI-evidence
// rule says "the local equivalent of what CI runs satisfies review", and before
// this there was no local equivalent to run — `flake-cli.ts` only aggregates
// reports the matrix had already produced.
//
// HOW IT MATCHES THE MATRIX, shard for shard:
//   * N sequential `playwright test` runs, default 20 = the matrix width;
//   * each with `FLAKE_RUN=1` and `FLAKE_REPORT=<dir>/run-<i>.json` — the exact
//     env the workflow sets, so both sides get `retries: 1` and the JSON
//     reporter, and both feed the same aggregator the same shaped input;
//   * each booting its OWN preview server, exactly as a fresh matrix job does.
//     Sharing one warm server would be faster and dishonest: the two stalls the
//     fix-round-1 diagnosis found were both in the post-`goto` boot window, so a
//     warm server measures away the very thing under question;
//   * a failing run is the DATUM, never a reason to stop — the mirror of the
//     workflow's `fail-fast: false` and `continue-on-error`;
//   * then the SAME aggregation, table and gate as CI's aggregate job, through
//     the shared `reportDirectory`.
//
//   npm run flake:measure -w @spacerquest/ui          # 20 runs, the real thing
//   npm run flake:measure -w @spacerquest/ui -- 3     # a quick pipeline smoke
//
// Not a spec (Playwright's default `testMatch` never collects `support/`), but it
// IS typechecked by `e2e/tsconfig.json` and linted like every other e2e file.
// ---------------------------------------------------------------------------
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_REPORT_DIR, reportDirectory } from './flake-io';

/** The matrix width in `.github/workflows/e2e-flake.yml`, and the run count the
 *  T-1602b acceptance line names. Kept identical on both sides on purpose. */
const MATRIX_WIDTH = 20;

function main(): number {
  const requested = process.argv[2] ?? String(MATRIX_WIDTH);
  const runs = Number(requested);
  if (!Number.isInteger(runs) || runs < 1 || runs > MATRIX_WIDTH) {
    console.error(
      `flake:measure — runs must be a whole number in 1..${MATRIX_WIDTH}, got "${requested}"`,
    );
    return 1;
  }
  const dir = process.argv[3] ?? DEFAULT_REPORT_DIR;

  // A `run-*.json` left behind by an earlier measurement would be counted as
  // this one's evidence — a 20-run table built partly from yesterday's runs.
  // Start from an empty directory, always.
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const started = Date.now();
  for (let run = 1; run <= runs; run += 1) {
    console.log(`\n=== flake:measure — run ${run}/${runs} ===`);
    const result = spawnSync('npx', ['playwright', 'test'], {
      stdio: 'inherit',
      // `shell: true` so this resolves `npx` on Windows (`npx.cmd`) as well as
      // on the ubuntu runner. The argv is fixed and contains no user input.
      shell: true,
      env: { ...process.env, FLAKE_RUN: '1', FLAKE_REPORT: join(dir, `run-${run}.json`) },
    });
    if (result.error) {
      // Failing to START a run is a broken toolchain, not a flake datum — there
      // is no report for it, so continuing would silently shrink the sample.
      console.error(`flake:measure — could not start run ${run}: ${result.error.message}`);
      return 1;
    }
    // A non-zero exit is EXPECTED whenever a test failed. That failure is the
    // measurement, and it is already recorded in `run-<i>.json`. Keep going.
    console.log(`=== run ${run}/${runs} exited ${String(result.status)} ===`);
  }
  console.log(`\n${runs} runs in ${Math.round((Date.now() - started) / 1000)}s\n`);

  return reportDirectory(dir);
}

process.exit(main());
