import { RENOWN_RANK_ORDER } from '@spacerquest/engine';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { runCampaign, type SimPolicyName } from '../index.js';
import {
  aggregate,
  summarizeReport,
  type BaselineAggregate,
  type PolicyAggregate,
  type SeedRow,
} from '../balance/aggregate.js';

// ---------------------------------------------------------------------------
// T-1603b · The committed, pinned proof of the two GRADED balance targets.
//
// This file is the CI-sized counterpart to `packages/sim/src/balance/sweep.ts`.
// The sweep is the instrument the memo (`docs/balance/TUNING-T-1603.md`) is built
// from — 3,500 careers, ~6 minutes, not a test. This file drives a small
// deterministic slice of the SAME fleet through the SAME pure aggregator
// (`balance/aggregate.ts`), so the numbers it asserts and the numbers the memo
// prints are computed by one piece of code, not two.
//
// WHAT IT GUARDS, and why these two and not others. T-1603b's acceptance names
// exactly three targets. Two of them are properties of the whole fleet's
// behaviour and can silently rot under any future tuning change, so they are
// pinned here:
//   (1) the trader's median debt-clear day sits inside [22, 30] — "Tour One
//       clearable by competent play in 25-30 days (not 10, not never)";
//   (2) no route dominates the fleet — "era churn working";
//   (3) deed pacing — the ladder is no longer exhausted inside Tour One.
//
// BANDS, NOT FIXTURES. Every assertion below is a BAND with real headroom around
// the measured value, never the measured value pinned to the digit. A pinned
// exact share would be a fixture: it would red on any content addition and would
// say nothing about whether the game is still balanced. The bands are chosen so
// that a genuine regression (a dominant route appearing, the marker becoming
// trivial or unclearable, the renown ladder collapsing back into the tutorial)
// fails, and ordinary content churn does not. Where a band is loose, the comment
// says what the measured value actually was, so the headroom is visible.
//
// ================= SWEEP PROVENANCE (2026-07-26, T-1603b) ==================
// This file's own drive: seeds 1..40 x {trader, smuggler, gambler} x 35 days =
//        120 runs, driven through `runCampaign` -> `summarizeReport` ->
//        `aggregate` in a single shared `beforeAll` (the `deed-coverage.test.ts`
//        idiom, so three `it`s pay for one set of drives).
// MEASURED on this slice at authoring time: trader debt-cleared rate 90% (36/40),
//        median clear day 23 (smuggler 29, gambler 25); fleet 3,252 legs over 274
//        distinct routes with a 1.48% top-route share and a 0.143 T-107 topShare
//        median; fleet median 17 deeds by day 30, and a renown histogram of
//        COMMODORE 7 / ADMIRAL 42 / TOP_DOG 30 / GRAND_MUFTI 30 / MEGA_HERO 11 —
//        ZERO at GIGA_HERO or CONQUEROR.
// The FULL arms behind the bands, which this slice is a sample of:
//        npm run balance:sweep -w @spacerquest/sim -- --label tour-one-1603b \
//            --seeds 500 --days 35 --shard i/4      (x4, then --merge)
//        npm run balance:sweep -w @spacerquest/sim -- --label veteran-1603b \
//            --seeds 100 --days 120 --shard i/4     (x4, then --merge)
//        Committed aggregates: docs/balance/baseline-tour-one-1603b.json and
//        docs/balance/baseline-veteran-1603b.json. Before-arms (T-1603a, the same
//        seeds and horizons at the pre-tuning commit): baseline-tour-one.json and
//        baseline-veteran.json. The memo tables both.
// WHY 3 POLICIES AND 40 SEEDS: the three that actually engage the marker and the
//        route board. `fighter` is included in neither — it clears about half its
//        careers, so its debt-clear median is a small-sample statistic at n=40.
//        `explorer` and `veteran` never meaningfully pay the marker (T-1603a
//        Flag 7) and `greedy` is the naive control; folding any of them into a
//        40-seed cut would drag the fleet route numbers toward noise without
//        adding a graded signal. The FULL fleet lives in the sweep.
// RUNTIME: ~283 ms per 35-day run, so 120 runs is roughly 34s of the sim
//        package's suite. Measured before/after in the Delivered note.
// ==========================================================================
// ---------------------------------------------------------------------------

/** See SWEEP PROVENANCE. Explicit and fixed — never a hunt range. */
const SEEDS = Array.from({ length: 40 }, (_, index) => index + 1);
/** The Tour One horizon: the shortest that carries through the day-30 resolution
 *  and five days past it, matching the sweep's Tour One arm exactly. */
const DAYS = 35;
/** See SWEEP PROVENANCE for why these three. */
const POLICIES: readonly SimPolicyName[] = ['trader', 'smuggler', 'gambler'];

// --- The graded bands ------------------------------------------------------

/** T-1603b acceptance, verbatim: "median trader debt-clear day in [22, 30]".
 *  Measured on the full 500-seed after-arm: 23 (unchanged from the T-1603a
 *  baseline, which is the point — the renown rescale was not allowed to move it).
 *  This 40-seed slice measures the same 23. */
const TRADER_CLEAR_DAY_MIN = 22;
const TRADER_CLEAR_DAY_MAX = 30;

/**
 * THE BASELINE OF RECORD — the committed 1,000-seed capstone, and the only sample
 * that resolves the [22, 30] band (R0b; see the split note on the band test below).
 *
 * Read from disk rather than imported so that re-pinning the baseline is a data
 * change, not a code change, and so a MISSING or RENAMED baseline fails loudly here
 * instead of silently grading nothing. The path is deliberately the single string
 * that must be updated when the baseline is re-pinned — the same commit that writes
 * the new file updates this line and the pointer in
 * `docs/NPC_REDESIGN.md`'s standing amendment 1.
 */
const BASELINE_OF_RECORD_PATH = fileURLToPath(
  new URL('../../../../docs/balance/baseline-n11-shipped.json', import.meta.url),
);
const BASELINE_OF_RECORD = JSON.parse(readFileSync(BASELINE_OF_RECORD_PATH, 'utf8')) as {
  label: string;
  byPolicy: { policy: string; debtClearedDay: { median: number; n: number } }[];
};

/** T-1603b acceptance: "no stable optimal route across the fleet". The full
 *  500-seed after-arm measures the most-flown route at 1.3% of 59,979 legs across
 *  396 distinct routes; this 120-run slice measures 1.48% across 274 (3,252
 *  legs). The 5% band is therefore ~3.4x headroom — a REGRESSION DETECTOR (one
 *  route carrying a twentieth of all traffic would be a genuine funnel), not a
 *  re-pin of 1.48%. */
const MAX_TOP_ROUTE_SHARE = 0.05;
/** Same idea from the other side: a collapse in the number of routes in use is
 *  what a dominant route looks like before the share moves. Measured 274 on this
 *  slice, 396 on the full arm. */
const MIN_DISTINCT_ROUTES = 150;

/** T-1603b acceptance: "deed pacing". The bands the canonical
 *  RENOWN_DEED_THRESHOLDS rescale (content `deeds.ts`) was set against — see that
 *  table's own comment for the design targets and `docs/balance/TUNING-T-1603.md`
 *  §4 for the before/after histograms. */
/*  Measured 17 on this three-policy slice (the full seven-policy fleet, which
 *  includes the naive `greedy` control, medians 14). Both before and after — the
 *  rescale moved the LADDER, not the deed triggers, which is why this band is the
 *  same on both sides and is here to catch a deed-supply regression. */
const DEEDS_BY_DAY_30_MIN = 8;
const DEEDS_BY_DAY_30_MAX = 26;
/** Share of 35-day careers ending at GIGA_HERO or above. Before the rescale this
 *  was 51% fleet-wide (1,798 of 3,500 careers at rank 9 of 10 by day 35, plus two
 *  at the CONQUEROR capstone). The target is under 10%; measured after: ZERO. The
 *  band is kept at 10% rather than 0 so that a future content pass which makes a
 *  rare exceptional career reach GIGA_HERO inside Tour One does not red this —
 *  the defect being guarded is GIGA_HERO as the DEFAULT tutorial outcome. */
const MAX_TOP_RANK_SHARE = 0.1;
/** The two ranks that must not be a Tour One outcome. DERIVED from the tail of
 *  `RENOWN_RANK_ORDER`, never hand-listed, so appending an eleventh rank moves
 *  this with it. */
const TOP_RANKS = RENOWN_RANK_ORDER.slice(-2);

let report: BaselineAggregate;

function policyRow(policy: string): PolicyAggregate {
  const row = report.byPolicy.find((entry) => entry.policy === policy);
  if (!row) throw new Error(`no aggregate row for policy '${policy}'`);
  return row;
}

beforeAll(() => {
  const rows: SeedRow[] = [];
  for (const policy of POLICIES) {
    for (const seed of SEEDS) {
      rows.push(summarizeReport(runCampaign(seed, DAYS, policy)));
    }
  }
  report = aggregate('balance-targets', rows);
}, 180000);

describe('T-1603b balance targets (pinned slice of the committed sweep)', () => {
  // SPLIT 2026-07-29 (owner decision), because this test's 40-seed arm cannot grade
  // what it was asserting. It bundled two claims of very different statistical cost:
  //
  //   (a) the trader clears, and clears FASTEST of the three  — resolves at n=40;
  //   (b) its median clear day sits inside [22, 30]           — DOES NOT.
  //
  // (b) is a median of a discrete day over a wide spread (capstone p25 18 / p75 25),
  // so ±1 day is noise at this sample size. R0b's standing amendment already said
  // exactly this — "a candidate passed at n=100 and failed at n=1,000" — and it bit
  // here for real: during N2 this arm read 22 and flipped the tripwire green while
  // the authoritative 1,000-seed capstone read 21 both before and after, i.e. the
  // R2.5 defect was untouched and the test reported it fixed. A criterion that can
  // announce a balance fix that did not happen is worse than no criterion.
  //
  // So (a) stays here as a live test, and (b) moves to the capstone-graded block
  // below, which is the only authority on that number. See NPC_REDESIGN
  // standing amendment 1.
  it('the trader clears the Guild marker, and clears it fastest', () => {
    const trader = policyRow('trader');

    // Non-degeneracy first: an empty or near-empty sample would make the median
    // meaningless and the band vacuously true. The trader is the competent-play
    // instrument, so most of its careers must actually clear.
    expect(trader.runs).toBe(SEEDS.length);
    expect(
      trader.debtClearedRate,
      'the trader stopped clearing the marker in most careers',
    ).toBeGreaterThan(0.5);
    expect(trader.debtClearedDay.n).toBeGreaterThan(SEEDS.length / 2);

    // The marker is a real 30-day clock, not a formality: the trader is the
    // FASTEST of the three policies here, and the other two sit at or past it.
    // If a tuning change ever made a different line strictly better than trading
    // at clearing the marker, that is a balance finding, and it lands here.
    // This comparison is ROBUST at n=40 in a way the band is not: it is an
    // ordering between three medians measured on identical seeds, not the
    // absolute position of one of them.
    for (const policy of POLICIES) {
      if (policy === 'trader') continue;
      const row = policyRow(policy);
      if (row.debtClearedDay.n === 0) continue;
      expect(
        row.debtClearedDay.median,
        `${policy} now clears the marker faster than the trader`,
      ).toBeGreaterThanOrEqual(trader.debtClearedDay.median);
    }
  });
});

describe('T-1603b · the [22, 30] band, graded on the committed capstone', () => {
  // THE BAND LIVES HERE, not in the 40-seed arm above, because a 1,000-seed capstone
  // is the only sample that resolves it (R0b). This reads the committed baseline of
  // record rather than re-running campaigns: that file IS the measurement of record,
  // it is re-pinned deliberately by whichever step moves it, and reading it costs
  // milliseconds instead of minutes.
  //
  // KNOWN RED, EXPECTED TO FAIL — owned by R2.5. The trader clears on day 21 against
  // [22, 30]: the marker is trivial for the dominant archetype, which is the defect
  // the balance redesign exists to remove. NOT skipped and NOT deleted — `it.fails`
  // keeps the assertions executing and inverts the verdict, so this goes RED THE
  // MOMENT R2.5 MOVES THE CLEAR DAY INTO BAND, at a sample size that can actually
  // tell. Flip back to `it` in the same commit that lands the fix.
  it.fails('the trader clears the marker inside the target band, not sooner', () => {
    const trader = BASELINE_OF_RECORD.byPolicy.find((row) => row.policy === 'trader');
    if (!trader) throw new Error("baseline of record has no 'trader' row");

    // Non-degeneracy: guard against grading a band on a baseline that was itself
    // measured on a thin or broken arm.
    expect(
      trader.debtClearedDay.n,
      'baseline of record was measured on too few clearing careers to grade a median',
    ).toBeGreaterThan(500);

    // The acceptance itself. BOTH bounds matter and for different reasons: below
    // 22 the marker is trivial ("not 10"), above 30 it is not clearable inside
    // Tour One at all ("not never").
    expect(
      trader.debtClearedDay.median,
      `trader median debt-clear day ${trader.debtClearedDay.median} outside [${TRADER_CLEAR_DAY_MIN}, ${TRADER_CLEAR_DAY_MAX}]`,
    ).toBeGreaterThanOrEqual(TRADER_CLEAR_DAY_MIN);
    expect(trader.debtClearedDay.median).toBeLessThanOrEqual(TRADER_CLEAR_DAY_MAX);
  });

  it('no single route dominates the fleet', () => {
    const { fleet } = report;

    // Non-degeneracy: a fleet that flew almost nothing would pass every band
    // below by accident.
    expect(fleet.routeLegs).toBeGreaterThan(1000);

    expect(
      fleet.topRouteShare,
      `most-flown route carries ${(fleet.topRouteShare * 100).toFixed(2)}% of all legs`,
    ).toBeLessThanOrEqual(MAX_TOP_ROUTE_SHARE);
    expect(
      fleet.distinctRoutes,
      `only ${fleet.distinctRoutes} distinct routes in use`,
    ).toBeGreaterThanOrEqual(MIN_DISTINCT_ROUTES);

    // The T-107 diversity instrument, from the other direction: `topShare` is the
    // share of DAWNS whose best-paying offer named the single most-frequent
    // destination. A board that kept steering to one place would push this toward
    // 1 long before the flown-leg share moved. Measured median ~0.14.
    expect(fleet.routeDiversityTopShare.median).toBeLessThanOrEqual(0.4);
  });

  it('the renown ladder is no longer exhausted inside Tour One', () => {
    const { fleet } = report;

    // (a) Deeds still arrive — the rescale slowed the LADDER, not the deed
    // triggers, and a collapse in earned deeds would be a different defect.
    expect(
      fleet.deedsByDay30.median,
      `fleet median deeds by day 30 is ${fleet.deedsByDay30.median}`,
    ).toBeGreaterThanOrEqual(DEEDS_BY_DAY_30_MIN);
    expect(fleet.deedsByDay30.median).toBeLessThanOrEqual(DEEDS_BY_DAY_30_MAX);

    // (b) ...but they no longer buy the top of the ladder. Derived from the
    // measured rank histogram against RENOWN_RANK_ORDER — never a hard-coded rank
    // list, so a content change to the ladder moves this assertion with it.
    const totalRuns = Object.values(fleet.renownRanks).reduce((sum, n) => sum + n, 0);
    expect(totalRuns).toBe(POLICIES.length * SEEDS.length);
    const atTop = TOP_RANKS.reduce((sum, rank) => sum + (fleet.renownRanks[rank] ?? 0), 0);
    expect(
      atTop / totalRuns,
      `${atTop}/${totalRuns} careers reach ${TOP_RANKS.join('/')} inside ${DAYS} days`,
    ).toBeLessThan(MAX_TOP_RANK_SHARE);

    // (c) The ladder still DISCRIMINATES — it did not simply move out of reach.
    // More than one rank is represented, and the ranks in play are a contiguous
    // band rather than everyone piled on one rung.
    const ranksInPlay = RENOWN_RANK_ORDER.filter((rank) => (fleet.renownRanks[rank] ?? 0) > 0);
    expect(ranksInPlay.length, 'every career ended at the same rank').toBeGreaterThan(2);
    const modeCount = Math.max(...ranksInPlay.map((rank) => fleet.renownRanks[rank]));
    expect(modeCount / totalRuns, 'the ladder collapsed onto a single rank').toBeLessThan(0.8);
  });
});
