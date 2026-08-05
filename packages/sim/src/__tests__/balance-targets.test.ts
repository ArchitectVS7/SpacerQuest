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
 * instead of silently grading nothing.
 *
 * THIS IS THE AUTHORITATIVE POINTER — the only one of the five that is READ at
 * runtime; the other four are prose that describes it. BR-14
 * (`docs/BALANCE-RIG-DECISIONS.md`) requires the same commit that writes a new
 * capstone to move ALL FIVE:
 *
 *   1. this line;
 *   2. `docs/NPC_REDESIGN.md` — standing amendment 1's "Baseline of record is …";
 *   3. `docs/NPC_REDESIGN.md` — the status banner's newest "BASELINE OF RECORD
 *      RE-PINNED AT T-nnn" block, which goes at the TOP of the banner;
 *   4. `docs/balance/smoke/README.md` — the "The current baseline (…)" line;
 *   5. `docs/BALANCE-RIG-DECISIONS.md` — BR-14's own "current baseline of record
 *      is …" sentence (the fifth site, added at T-182).
 *
 * (T-165's task block and `TODO.md` both said FOUR; they predate T-182's fifth.)
 * Agreement is no longer a matter of anyone remembering: since T-165,
 * `packages/sim/src/__tests__/baseline-pointers.test.ts` reads all five and fails
 * when any disagrees — it was RED ON ARRIVAL against three genuinely stale sites
 * left by T-188, T-195 and T-199.
 */
// T-196b re-pin (t196a-free-actions -> t196b-instruments). Same shape, same 8,000
// rows, same eight policies, same milestone days (21,29,30,41,60,120). This is ARM 2
// of the control-arm pair T-196a opened: the RULES did not move (`rulesFingerprint`
// is still 55414694d7187afc — no engine or content file is touched), the INSTRUMENTS
// did (6106da3575355153 -> 812d9e87d7307f3c), because the eight sim policies stopped
// budgeting a dawn die for the nine M17 Free Actions and the protocol enumerator
// stopped advertising one. The diff against the T-196a arm is therefore the measured
// value of EXPLOITATION alone. The bands below are UNTOUCHED. SEVEN of the eight
// policy rows moved (all but `greedy`, whose plan did not change) against T-196a's
// two — that breadth contrast is the result. Fleet `tourOneClearRate` 0.6305 ->
// 0.6342, median final credits 49,517 -> 49,839 (+0.7%), ships lost 465 -> 487; the
// fighter carries the arm (clear rate 0.499 -> 0.603, median credits 45,551 ->
// 82,671) because its three-planner shopping chain no longer has to win a die each.
//
// (Prior) T-196a re-pin (t199-pacifist -> t196a-free-actions). Same shape, same 8,000 rows,
// same eight policies, same milestone days (21,29,30,41,60,120). The capstone was
// re-taken because M17 (`docs/DAWN-HAND-REDESIGN.md` §3) freed nine administrative
// action types from the dawn hand, which moves the RULES fingerprint
// (febc55edd3a94b3f -> 55414694d7187afc) and stales every fixture measured against
// it. The bands below are UNTOUCHED — nothing here was re-derived to accommodate the
// new sample. EXACTLY TWO policy rows moved, `explorer` and `smuggler` (the only two
// that queue `Explore`); the other six are byte-identical on every headline metric.
//
// (Prior) T-199 re-pin (t195-dawn-dice -> t199-pacifist). Same shape, same 8,000 rows, same
// eight policies, same milestone days: the capstone was re-taken because
// `packages/sim/src/index.ts` moved (the shared pacifist-combat planner and the
// anti-idle rim-strand rules), which moves the INSTRUMENT fingerprint and stales
// every fixture measured against it. The bands below are UNTOUCHED — nothing here
// was re-derived to accommodate the new sample.
// T-197 re-pin (t196b-instruments -> t197-hangout-caps). Same shape, same 8,000 rows,
// same eight policies, same milestone days. UNLIKE the T-196a/T-196b pair this capstone
// moves BOTH fingerprints — the engine and content changed (all seven Hangout venues went
// free; the social pool and the rounds cap arrived) AND the instruments changed (three
// planners lost their `DieLedger`, two gained the rounds mirror) — so it is not a clean
// single-arm attribution and the block comment above should not be read as claiming one.
// The bands below are UNTOUCHED; nothing here was re-derived to accommodate the new sample.
// T-202 re-pin (t197-hangout-caps -> t202-liars-dice-ceiling). Same shape, same 8,000 rows,
// same eight policies, same milestone days. A CONTENT-ONLY capstone: it ships R3's ruled
// `LIARS_DICE_ROUNDS_PER_DAY = [1, 2, 3, 4, 5, 6]`, so `rulesFingerprint` moves and
// `instrumentFingerprint` does NOT. EVERY ONE OF THE EIGHT POLICY ROWS CAME BACK
// BYTE-IDENTICAL, and that is an INSTRUMENT-GAP NULL RESULT rather than a verdict that the
// new ceiling is balanced: the sim's gambler is the only policy that plans a Dare and it is
// bounded by `GAMBLER_MAX_DARES_PER_DAY = 2` (`packages/sim/src/index.ts:4058,4584`), below
// the ruled ceiling, so it plays `1,2,2,2,2,2` hands by tier under BOTH tables. See F-202-1
// in `TASKS.md`'s T-202 block. The bands below are UNTOUCHED — nothing here was re-derived
// to accommodate the new sample (there was nothing to re-derive: the sample did not move).
// T-206 re-pin (t204-cantina-rename -> t206-captain-voice). Same shape, same 8,000 rows,
// same eight policies, same milestone days. A CONTENT-ONLY capstone in the same class as
// T-204's rename: it ships the authored `tableTalk` and `catchphrases` lines for the 27
// captains T-205 left on its worklist, so `rulesFingerprint` moves (content is hashed
// WHOLESALE, so even prose with no reader moves it — `5ae9a5d473827024` on the outgoing
// baseline -> `cbb087860825aa35`) and `instrumentFingerprint` does NOT (unmoved at
// `5c230e99648cddee`). `balance:diff` printed "NOTHING MOVED. Every compared field is equal
// on both sides", which was PREDICTED IN WRITING BEFORE THE RUN (`TASKS.md` T-206) and is the
// only correct outcome: nothing reads either field until T-207, so a moved row would have
// meant something consumes the profile object wholesale and would have been filed as a
// finding. The bands below are UNTOUCHED — there was nothing to re-derive.
const BASELINE_OF_RECORD_PATH = fileURLToPath(
  new URL('../../../../docs/balance/baseline-t206-captain-voice.json', import.meta.url),
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

    // THE ORDERING ASSERTION MOVED OUT OF THIS 40-SEED ARM AT T-156, for exactly
    // the reason the band moved out before it: THE SAMPLE CANNOT RESOLVE IT. Its
    // old comment claimed the comparison was "ROBUST at n=40 in a way the band is
    // not"; N13 re-phased the cast and the 40-seed slice promptly reported the
    // gambler clearing on day 19 against the trader's 22 — an inversion that does
    // not exist at any sample large enough to see. Measured on this exact driver
    // at 35 days, seeds 1..N, AFTER N13:
    //     N=40  trader 22 · gambler 19 · smuggler 26
    //     N=80  trader 22 · gambler 20 · smuggler 26
    //     N=120 trader 21 · gambler 20 · smuggler 26
    //     N=200 trader 21 · gambler 20 · smuggler 26
    //     N=300 trader 21 · gambler 21 · smuggler 25   <- the ordering holds
    // and at CAPSTONE scale (1,000 seeds x 120 days) the trader and the gambler
    // are EXACTLY TIED on 21 in ALL THREE N13 arms — pre, control and shipped —
    // so N13 did not move this at all. The assertion is re-homed below onto the
    // committed capstone, which is the only sample that resolves it, rather than
    // widened here (300 seeds x 3 policies would multiply this file's runtime by
    // 7.5 to re-derive a number the capstone already holds).
    //
    // THE REAL FINDING, RECORDED RATHER THAN PAPERED OVER: "the trader clears it
    // FASTEST" is not what the capstone says. It says the trader and the gambler
    // are tied at 21, and have been for at least three arms. The trader is the
    // fastest-or-equal line, not the fastest one, and if that is not the intended
    // shape it is a balance question for R2.5, not a test to re-tune.
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

  it('no competing line clears the Guild marker faster than the trader', () => {
    // MOVED HERE FROM THE 40-SEED ARM AT T-156 — see the note there for the
    // measurement that showed n=40 cannot resolve a one-day ordering. Graded on
    // the committed capstone at n ~ 1,000 clearing careers per policy, which can.
    const rowFor = (
      policy: string,
    ): { policy: string; debtClearedDay: { median: number; n: number } } => {
      const row = BASELINE_OF_RECORD.byPolicy.find((candidate) => candidate.policy === policy);
      if (!row) throw new Error(`baseline of record has no '${policy}' row`);
      return row;
    };
    const trader = rowFor('trader');
    // Non-degeneracy, same guard the band above carries: an ordering read off a
    // thin arm is not an ordering.
    expect(trader.debtClearedDay.n).toBeGreaterThan(500);

    for (const policy of POLICIES) {
      if (policy === 'trader') continue;
      const row = rowFor(policy);
      if (row.debtClearedDay.n <= 500) continue;
      // `>=` allows a TIE deliberately, and the gambler currently takes it (21 vs
      // 21). What this forbids is a competing line being strictly FASTER, which
      // would be a real balance finding about what the marker rewards.
      expect(
        row.debtClearedDay.median,
        `${policy} clears the marker faster than the trader (${row.debtClearedDay.median} vs ${trader.debtClearedDay.median}) on the baseline of record`,
      ).toBeGreaterThanOrEqual(trader.debtClearedDay.median);
    }
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
