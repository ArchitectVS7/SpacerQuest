// ---------------------------------------------------------------------------
// T-1602b · THE FLAKE AGGREGATOR.
//
// A plain support module, NOT a spec: Playwright's default `testMatch` is
// `**/*.@(spec|test).?(c|m)[jt]s?(x)`, so nothing under `e2e/support/` is ever
// collected as a suite. It IS covered by `e2e/tsconfig.json` and by eslint.
//
// PURE by construction — no `fs`, no `process`, no clock. It takes already-parsed
// Playwright JSON reports and returns numbers, which is what makes it unit
// testable from a spec (`e2e/flake-rate.spec.ts`) instead of only being
// exercisable by burning twenty CI jobs.
//
// ---------------------------------------------------------------------------
// THE METRIC, stated so a reviewer can check it mechanically
// ---------------------------------------------------------------------------
//   flake rate = (flaky + unexpected tests) / (total non-skipped tests)
// across the N runs, restricted to tests tagged `@tour-one`.
//
// With 4 tagged tests × 20 runs = 80 results, ONE flaky result is 1.25% and
// passes the <2% bar; TWO is 2.5% and fails it.
//
// The gate ADDITIONALLY requires `unexpected === 0`. Playwright reports a test as
// `flaky` when it failed and then passed on retry, and `unexpected` when it
// failed every attempt. A test that fails every attempt is a BUG, not a flake,
// and must never be laundered through a percentage — so it fails the gate at any
// rate. `skipped` results are excluded from the denominator entirely: a test that
// never ran is not evidence of stability.
//
// The whole-suite (`all`) scope is computed alongside and reported for
// INFORMATION ONLY. The gate is the `@tour-one` scope, exactly as the T-1602b
// acceptance line words it — but a flaky spec elsewhere in the suite is still
// news, and hiding it would be dishonest.
// ---------------------------------------------------------------------------

/** The slice of Playwright's JSON report this module reads. Deliberately
 *  structural (not an import of Playwright's own types) so a reporter-shape
 *  change surfaces here as a compile error in ONE place. */
export interface PlaywrightJsonTest {
  /** Aggregated outcome across this test's attempts. */
  status?: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  results?: readonly { status?: string }[];
}

export interface PlaywrightJsonSpec {
  title?: string;
  file?: string;
  /** Playwright 1.42+ surfaces `test('…', { tag })` here. */
  tags?: readonly string[];
  tests?: readonly PlaywrightJsonTest[];
}

export interface PlaywrightJsonSuite {
  title?: string;
  file?: string;
  specs?: readonly PlaywrightJsonSpec[];
  suites?: readonly PlaywrightJsonSuite[];
}

export interface PlaywrightJsonReport {
  suites?: readonly PlaywrightJsonSuite[];
}

/** One test's outcome in one run, flattened out of the report tree. */
export interface FlatResult {
  /** `<file> › <title>` — how a named offender is reported back to a human. */
  id: string;
  file: string;
  title: string;
  tags: readonly string[];
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  /** 1-based index of the run this result came from. */
  run: number;
}

export interface ScopeSummary {
  /** Non-skipped test results in scope, across every run. The DENOMINATOR. */
  total: number;
  passed: number;
  flaky: number;
  unexpected: number;
  skipped: number;
  /** (flaky + unexpected) / total, or 0 when nothing ran. */
  rate: number;
}

export interface OffenderSummary {
  id: string;
  flaky: number;
  unexpected: number;
  /** The 1-based run indices this test misbehaved in. */
  runs: number[];
  tagged: boolean;
}

export interface RunSummary {
  run: number;
  tourOne: ScopeSummary;
  all: ScopeSummary;
}

export interface FlakeSummary {
  runs: RunSummary[];
  tourOne: ScopeSummary;
  all: ScopeSummary;
  /** Every test that was ever flaky or unexpected, worst first. */
  offenders: OffenderSummary[];
}

/** The tag as a spec AUTHORS it: `test('…', { tag: '@tour-one' }, …)`. */
export const TOUR_ONE_TAG = '@tour-one';

/** The JSON reporter strips the leading `@` — a spec tagged `'@tour-one'` lands
 *  in the report as `"tour-one"` (verified against a real run-*.json). Normalize
 *  both sides so the gate cannot silently measure ZERO tests because of a
 *  sigil, which is the one failure mode that would make it look green while
 *  measuring nothing. */
function normalizeTag(tag: string): string {
  return tag.startsWith('@') ? tag.slice(1) : tag;
}

function walk(
  suite: PlaywrightJsonSuite,
  run: number,
  inheritedFile: string,
  out: FlatResult[],
): void {
  const file = suite.file ?? inheritedFile;
  for (const spec of suite.specs ?? []) {
    const specFile = spec.file ?? file;
    const tags = spec.tags ?? [];
    for (const test of spec.tests ?? []) {
      out.push({
        id: `${specFile} › ${spec.title ?? '(untitled)'}`,
        file: specFile,
        title: spec.title ?? '(untitled)',
        tags,
        status: test.status ?? 'unexpected',
        run,
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, run, file, out);
}

/** Flatten one run's report into per-test outcomes. Exported for the unit spec. */
export function flatten(report: PlaywrightJsonReport, run: number): FlatResult[] {
  const out: FlatResult[] = [];
  for (const suite of report.suites ?? []) walk(suite, run, suite.file ?? '', out);
  return out;
}

function summarize0(results: readonly FlatResult[]): ScopeSummary {
  let passed = 0;
  let flaky = 0;
  let unexpected = 0;
  let skipped = 0;
  for (const r of results) {
    if (r.status === 'expected') passed += 1;
    else if (r.status === 'flaky') flaky += 1;
    else if (r.status === 'skipped') skipped += 1;
    else unexpected += 1;
  }
  const total = passed + flaky + unexpected;
  return {
    total,
    passed,
    flaky,
    unexpected,
    skipped,
    rate: total === 0 ? 0 : (flaky + unexpected) / total,
  };
}

function isTourOne(r: FlatResult): boolean {
  return r.tags.some((tag) => normalizeTag(tag) === normalizeTag(TOUR_ONE_TAG));
}

/**
 * Aggregate N runs of the e2e suite into the two scoped summaries plus a
 * per-run breakdown and a named list of every test that ever misbehaved.
 * `reports` is expected in run order; the 1-based index becomes the run number.
 */
export function summarize(reports: readonly PlaywrightJsonReport[]): FlakeSummary {
  const all: FlatResult[] = [];
  const runs: RunSummary[] = [];

  reports.forEach((report, i) => {
    const flat = flatten(report, i + 1);
    all.push(...flat);
    runs.push({
      run: i + 1,
      tourOne: summarize0(flat.filter(isTourOne)),
      all: summarize0(flat),
    });
  });

  const byId = new Map<string, OffenderSummary>();
  for (const r of all) {
    if (r.status !== 'flaky' && r.status !== 'unexpected') continue;
    const entry = byId.get(r.id) ?? {
      id: r.id,
      flaky: 0,
      unexpected: 0,
      runs: [],
      tagged: isTourOne(r),
    };
    if (r.status === 'flaky') entry.flaky += 1;
    else entry.unexpected += 1;
    entry.runs.push(r.run);
    byId.set(r.id, entry);
  }

  const offenders = [...byId.values()].sort(
    (a, b) =>
      b.unexpected - a.unexpected ||
      b.flaky - a.flaky ||
      Number(b.tagged) - Number(a.tagged) ||
      a.id.localeCompare(b.id),
  );

  return {
    runs,
    tourOne: summarize0(all.filter(isTourOne)),
    all: summarize0(all),
    offenders,
  };
}

/** The gate itself, in one place so the CLI and the unit spec cannot drift. */
export const FLAKE_RATE_LIMIT = 0.02;

export function gatePasses(summary: FlakeSummary): boolean {
  return summary.tourOne.rate < FLAKE_RATE_LIMIT && summary.tourOne.unexpected === 0;
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function scopeRow(label: string, s: ScopeSummary): string {
  return `| ${label} | ${s.total} | ${s.passed} | ${s.flaky} | ${s.unexpected} | ${s.skipped} | ${pct(s.rate)} |`;
}

/** Render the summary as the markdown table the workflow tees into the job step
 *  summary — and that the Delivered note quotes verbatim as its CI evidence. */
export function renderMarkdown(summary: FlakeSummary): string {
  const lines: string[] = [];
  lines.push('## Tour One E2E flake rate');
  lines.push('');
  lines.push(`Runs measured: **${summary.runs.length}**`);
  lines.push('');
  lines.push('| scope | results | passed | flaky | unexpected | skipped | flake rate |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  lines.push(scopeRow(`\`${TOUR_ONE_TAG}\` (**gated**)`, summary.tourOne));
  lines.push(scopeRow('whole suite (informational)', summary.all));
  lines.push('');
  lines.push(
    `Gate: \`@tour-one\` flake rate < ${pct(FLAKE_RATE_LIMIT)} AND zero unexpected → **${
      gatePasses(summary) ? 'PASS' : 'FAIL'
    }**`,
  );
  lines.push('');
  lines.push('### Per run');
  lines.push('');
  lines.push('| run | tour-one results | flaky | unexpected | suite flaky | suite unexpected |');
  lines.push('| ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of summary.runs) {
    lines.push(
      `| ${r.run} | ${r.tourOne.total} | ${r.tourOne.flaky} | ${r.tourOne.unexpected} | ${r.all.flaky} | ${r.all.unexpected} |`,
    );
  }
  lines.push('');
  if (summary.offenders.length === 0) {
    lines.push('No test was flaky or unexpected in any run.');
  } else {
    lines.push('### Every test that misbehaved');
    lines.push('');
    lines.push('| test | tour-one | flaky | unexpected | runs |');
    lines.push('| --- | :---: | ---: | ---: | --- |');
    for (const o of summary.offenders) {
      lines.push(
        `| ${o.id} | ${o.tagged ? 'yes' : 'no'} | ${o.flaky} | ${o.unexpected} | ${o.runs.join(', ')} |`,
      );
    }
  }
  return lines.join('\n');
}
