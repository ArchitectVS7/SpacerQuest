// ---------------------------------------------------------------------------
// T-1602b · The flake-report runner (CI's aggregate step).
//
// Reads a directory of Playwright JSON reports (`run-*.json`, one per matrix
// shard), aggregates them through the PURE `summarize` in ./flake.ts, prints the
// markdown table, and exits non-zero when the gate fails. All of that lives in
// `reportDirectory` (./flake-io.ts) so the local 20-run runner
// (./flake-measure.ts) finishes with the identical computation instead of a
// second copy of it; this file is only the argv/exit shell.
//
//   npm run flake:report -w @spacerquest/ui -- <dir>
//
// Not a spec (Playwright's default `testMatch` never collects `support/`), but it
// IS typechecked by `e2e/tsconfig.json` and linted like every other e2e file.
// ---------------------------------------------------------------------------
import { DEFAULT_REPORT_DIR, reportDirectory } from './flake-io';

process.exit(reportDirectory(process.argv[2] ?? DEFAULT_REPORT_DIR));
