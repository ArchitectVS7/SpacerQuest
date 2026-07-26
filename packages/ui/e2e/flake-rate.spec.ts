import { test, expect } from '@playwright/test';
import {
  FLAKE_RATE_LIMIT,
  gatePasses,
  summarize,
  TOUR_ONE_TAG,
  type PlaywrightJsonReport,
} from './support/flake';

// ---------------------------------------------------------------------------
// T-1602b · THE FLAKE GATE, MADE LOCALLY CHECKABLE.
//
// The acceptance criterion "flake rate <2% over 20 CI runs" is push-dependent:
// the measurement itself only exists after `.github/workflows/e2e-flake.yml` has
// run its matrix. What CAN be checked here and now — and what the CI-evidence
// rule asks for — is that the thing doing the measuring is correct. These tests
// feed `summarize` synthetic reports and pin the arithmetic AND the gate's two
// clauses.
//
// It uses no `page` (precedent: `derule.spec.ts`, a source-scan guard), and it
// is deliberately UNTAGGED so it is not itself part of the suite it measures.
// That also means no test TITLE here may contain an `@word`: Playwright lifts
// `@tag` out of a title as a real tag, which would silently enrol this spec in
// the very population it is gating — the measurement measuring itself.
// ---------------------------------------------------------------------------

type Status = 'expected' | 'flaky' | 'unexpected' | 'skipped';

/** How the JSON reporter actually writes the tag: WITHOUT the authoring `@`
 *  (verified against a real `run-*.json`). The fixtures below use this raw form
 *  on purpose — a synthetic report written in the authoring form would pass a
 *  matcher that then measures zero real tests. */
const REPORTED_TAG = 'tour-one';

/** One synthetic run: four `@tour-one` tests plus two untagged ones, matching
 *  the real suite's shape (2 career tests + 2 death tests are the tagged four). */
function run(
  tourOne: readonly Status[],
  others: readonly Status[] = ['expected', 'expected'],
  tag: string = REPORTED_TAG,
): PlaywrightJsonReport {
  return {
    suites: [
      {
        title: 'tour-one',
        file: 'tour-one.spec.ts',
        specs: tourOne.map((status, i) => ({
          title: `tour one test ${i + 1}`,
          file: 'tour-one.spec.ts',
          tags: [tag],
          tests: [{ status }],
        })),
        // A nested suite, because Playwright nests describe blocks and the
        // walker must recurse rather than only reading the top level.
        suites: [
          {
            title: 'elsewhere',
            file: 'other.spec.ts',
            specs: others.map((status, i) => ({
              title: `other test ${i + 1}`,
              file: 'other.spec.ts',
              tags: [],
              tests: [{ status }],
            })),
          },
        ],
      },
    ],
  };
}

const CLEAN: readonly Status[] = ['expected', 'expected', 'expected', 'expected'];

function twentyClean(): PlaywrightJsonReport[] {
  return Array.from({ length: 20 }, () => run(CLEAN));
}

test('the tag matcher survives the reporter dropping the leading sigil', () => {
  // The one failure mode that would make the gate look green while measuring
  // NOTHING: a sigil mismatch collapsing the denominator to zero. Both spellings
  // must count, and a differently-named tag must not.
  for (const tag of [REPORTED_TAG, TOUR_ONE_TAG]) {
    const summary = summarize([run(CLEAN, ['expected', 'expected'], tag)]);
    expect(summary.tourOne.total, `tag "${tag}" must be counted`).toBe(4);
  }
  const unrelated = summarize([run(CLEAN, ['expected', 'expected'], 'slow')]);
  expect(unrelated.tourOne.total).toBe(0);
});

test('twenty clean runs measure a 0% flake rate and pass the gate', () => {
  const summary = summarize(twentyClean());
  expect(summary.runs).toHaveLength(20);
  expect(summary.tourOne.total).toBe(80);
  expect(summary.tourOne.passed).toBe(80);
  expect(summary.tourOne.rate).toBe(0);
  expect(summary.offenders).toEqual([]);
  expect(gatePasses(summary)).toBe(true);
});

test('one flaky result in eighty is 1.25% and passes; two is 2.5% and fails', () => {
  const reports = twentyClean();
  reports[7] = run(['expected', 'flaky', 'expected', 'expected']);
  const one = summarize(reports);
  expect(one.tourOne.flaky).toBe(1);
  expect(one.tourOne.total).toBe(80);
  expect(one.tourOne.rate).toBeCloseTo(0.0125, 10);
  expect(one.tourOne.rate).toBeLessThan(FLAKE_RATE_LIMIT);
  expect(gatePasses(one)).toBe(true);
  // The offender is named, with the run it happened in — the report must never
  // report a percentage without saying which test earned it.
  expect(one.offenders).toHaveLength(1);
  expect(one.offenders[0].flaky).toBe(1);
  expect(one.offenders[0].runs).toEqual([8]);
  expect(one.offenders[0].tagged).toBe(true);

  reports[12] = run(['expected', 'expected', 'flaky', 'expected']);
  const two = summarize(reports);
  expect(two.tourOne.flaky).toBe(2);
  expect(two.tourOne.rate).toBeCloseTo(0.025, 10);
  expect(two.tourOne.rate).toBeGreaterThanOrEqual(FLAKE_RATE_LIMIT);
  expect(gatePasses(two)).toBe(false);
});

test('a single hard failure fails the gate no matter how low the rate is', () => {
  const reports = twentyClean();
  reports[3] = run(['unexpected', 'expected', 'expected', 'expected']);
  const summary = summarize(reports);
  // 1/80 = 1.25%, comfortably under the bar…
  expect(summary.tourOne.rate).toBeCloseTo(0.0125, 10);
  expect(summary.tourOne.rate).toBeLessThan(FLAKE_RATE_LIMIT);
  // …and it still fails, because a test that failed every attempt is a bug and
  // must not be laundered through a percentage.
  expect(summary.tourOne.unexpected).toBe(1);
  expect(gatePasses(summary)).toBe(false);
});

test('noise outside the gated scope moves the reported number but never the gate', () => {
  const reports = twentyClean();
  reports[1] = run(CLEAN, ['flaky', 'unexpected']);
  reports[2] = run(CLEAN, ['flaky', 'expected']);
  const summary = summarize(reports);

  expect(summary.tourOne.rate).toBe(0);
  expect(summary.tourOne.unexpected).toBe(0);
  expect(gatePasses(summary)).toBe(true);

  // Reported honestly all the same — a flaky spec elsewhere is still news.
  expect(summary.all.flaky).toBe(2);
  expect(summary.all.unexpected).toBe(1);
  expect(summary.all.rate).toBeGreaterThan(0);
  expect(summary.offenders.map((o) => o.tagged)).toEqual([false, false]);
});

test('skipped results leave the denominator, so a skipped suite cannot fake a pass', () => {
  const summary = summarize([run(['skipped', 'skipped', 'skipped', 'skipped'])]);
  expect(summary.tourOne.skipped).toBe(4);
  expect(summary.tourOne.total).toBe(0);
  expect(summary.tourOne.rate).toBe(0);
  // The rate is 0 and `gatePasses` is true — which is exactly why the CLI ALSO
  // refuses a measurement with zero counted @tour-one results (flake-cli.ts).
  expect(gatePasses(summary)).toBe(true);
});
