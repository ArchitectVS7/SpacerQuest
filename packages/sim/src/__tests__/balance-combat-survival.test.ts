import { beforeAll, describe, expect, it } from 'vitest';
import { runCampaign, type CampaignStatsReport, type SimPolicyName } from '../index.js';
import {
  aggregate,
  summarizeReport,
  type BaselineAggregate,
  type CombatCell,
  type PolicyAggregate,
  type SeedRow,
  type TierParityBucket,
} from '../balance/aggregate.js';

// ---------------------------------------------------------------------------
// T-1603c · The committed, pinned proof of the COMBAT and SURVIVAL targets.
//
// Sibling of `balance-targets.test.ts` (T-1603b's economy/pacing proof) and built
// on the same three principles, restated here so this file can be read alone:
//   1. ONE aggregator. The slice is driven through `runCampaign` ->
//      `summarizeReport` -> `aggregate` — the same pure module
//      (`balance/aggregate.ts`) the sweep and the memo are built from — so the
//      numbers asserted here and the numbers printed in
//      `docs/balance/TUNING-T-1603.md` are computed by one piece of code.
//   2. BANDS WITH VISIBLE HEADROOM, never pinned digits. A pinned exact rate
//      would be a fixture: red on any content churn, silent on a real balance
//      regression. Every band below says what was measured, so the headroom is
//      legible.
//   3. NON-DEGENERACY FIRST. Every graded cell is checked for sample size before
//      it is graded, so no band can pass vacuously on an empty bucket.
//
// WHAT IT GUARDS. T-1603c's acceptance names three things, and all three are
// properties of the whole fleet's behaviour that can silently rot:
//   (1) combat EV is negative below tier parity when unprepared — and, because
//       that is TRUE BY CONSTRUCTION (see `it` #1), the discriminating version:
//       the below/unprepared cell is the worst cell in the table by a material
//       margin, and preparation pays off most when outgunned;
//   (2) a NONZERO death rate across at least 1,200 sim days — the audit's
//       zero-deaths finding, closed;
//   (3) the Auto-Repair design call — the module no longer switches the
//       life-support death path off.
//
// ================= SWEEP PROVENANCE (2026-07-26, T-1603c) ==================
// This file's own drive: seeds 1..15 x {fighter, smuggler, veteran, explorer} x
//        60 days = 60 runs, 3,600 SIM DAYS, in a single shared `beforeAll` (the
//        `deed-coverage.test.ts` / `balance-targets.test.ts` idiom, so three
//        `it`s pay for one set of drives).
// WHY THESE FOUR POLICIES, and not T-1603b's three. This file grades COMBAT and
//        DEATH, so the fleet is the one that fights and dies. `fighter` is here
//        for a named reason: it is the only shipped policy that buys AUTO_REPAIR
//        early, so it is the READER of the T-1603c Auto-Repair design call — and
//        under the OLD ordering it posted zero deaths and zero scares in 12,000
//        veteran-arm days. `smuggler` and `explorer` fly the most encounters per
//        career; `veteran` is the poorest and therefore the least able to repair
//        its way out. The trader/gambler economy instruments live in
//        `balance-targets.test.ts` and are deliberately NOT duplicated here.
// WHY 60 DAYS, not 35: deaths accumulate — component condition persists across
//        encounters until it is repaired — so a 35-day Tour One horizon measures
//        the era where the encounter rate is deliberately damped
//        (TOUR_ONE_ENCOUNTER_MULTIPLIER) and would grade the wrong game. 60 days
//        carries every run 30 days past the day-30 VETERAN flip.
// WHY 3,600 SIM DAYS: the acceptance says 1,200. `BASELINE-T-1603a.md` Flag 4
//        explicitly warns against a MARGINAL assertion, so the denominator is 3x
//        the requirement and the measured count is recorded below, in the open.
// MEASURED on this exact slice at authoring time (all four policies, 60 runs):
//        SURVIVAL — 7 ships lost over 3,600 sim days = 1.94 deaths / 1,000 days;
//        7 of 7 were COMBAT DEFEATS; 10.0% of runs (6 of 60) lost a ship. Per
//        policy: fighter 1, smuggler 3, veteran 3, explorer 0.
//        COMBAT (mean EV, n) — below/no -2087 (232) · below/yes -770 (91) ·
//        even/no -1086 (160) · even/yes -521 (56) · above/no -899 (89) ·
//        above/yes -398 (38). Below/above unprepared cost ratio 2.321;
//        preparation saves 63.1% at `below` parity against 55.7% at `above` —
//        i.e. on this slice the gun is now worth MORE when outgunned than when
//        outranking, which is BASELINE-T-1603a Flag 3 inverted.
//        `shipLostRate` in below/unprepared 1.29%.
//        AUTO_REPAIR — the `fighter` fits the module in 9 of its 15 careers
//        inside 60 days (31 regenerating dusks), so the reader is exercised.
// BEFORE, for contrast, on the identical slice at the T-1603b commit: ZERO ships
//        lost over the same 3,600 sim days; cost ratio 1.25; preparation saved
//        47.8% at `below` parity.
// The FULL arms behind the bands, which this slice is a sample of:
//        npm run balance:sweep -w @spacerquest/sim -- --label tour-one-1603c \
//            --seeds 500 --days 35 --shard i/4      (x4, then --merge)
//        npm run balance:sweep -w @spacerquest/sim -- --label veteran-1603c \
//            --seeds 100 --days 120 --shard i/4     (x4, then --merge)
//        Committed aggregates: docs/balance/baseline-tour-one-1603c.json and
//        docs/balance/baseline-veteran-1603c.json. Before-arms (T-1603b, same
//        seeds and horizons at the pre-tuning commit): baseline-tour-one-1603b.json
//        and baseline-veteran-1603b.json. `TUNING-T-1603.md` §11 tables both.
// RUNTIME: ~600 ms per 60-day run, so 60 runs is roughly 36s of the sim package's
//        suite — about half `balance-targets.test.ts`'s own 71s budget.
// ==========================================================================
// ---------------------------------------------------------------------------

/** See SWEEP PROVENANCE. Explicit and fixed — never a hunt range. */
const SEEDS = Array.from({ length: 15 }, (_, index) => index + 1);
/** See SWEEP PROVENANCE for why 60 and not 35. */
// R2c NOTE — DO NOT WIDEN THIS WINDOW. 60 days is load-bearing for the two
// distribution targets below (preparation-saves and fleet death rate). Widening to
// 90 to recover the Auto-Repair fitting rate was measured and REVERTED: it moved
// preparation-saves to 48.0% (bar 50%) and the death rate to 0.74/1k (bar 0.8).
const DAYS = 60;
/** See SWEEP PROVENANCE for why these four. */
const POLICIES: readonly SimPolicyName[] = ['fighter', 'smuggler', 'veteran', 'explorer'];
/** The literal acceptance denominator. The slice is 3x this; asserted so a future
 *  narrowing of the slice cannot quietly drop under the requirement. */
const REQUIRED_SIM_DAYS = 1200;

// --- The graded bands ------------------------------------------------------

/** Non-degeneracy floor for a graded combat cell. Below this an EV mean is noise
 *  and every band over it would be vacuous. The smallest graded cell measured 38. */
const MIN_CELL_ENCOUNTERS = 25;

/** T-1603c's discriminating criterion #1: how much worse an unprepared fight is
 *  when the player is OUTGUNNED than when the player OUTRANKS. Before T-1603c this
 *  was 1.19x (Tour One arm) / 1.29x (veteran arm) — parity barely mattered. The
 *  target is >= 1.4x; the committed 3,500-career Tour One after-arm measures
 *  1.854x and this slice measures 2.321x. */
const MIN_PARITY_COST_RATIO = 1.4;

/** T-1603c's discriminating criterion #2, and the honest form of "combat EV
 *  negative below tier parity WITHOUT PREPARATION": what preparation is worth when
 *  it matters most. `BASELINE-T-1603a.md` Flag 3 recorded the defect — the gun
 *  helped you punish the weak (62% saving at `above`) far more than it helped you
 *  survive the strong (32% at `below`). Target >= 50%; the committed Tour One
 *  after-arm measures 51.5% and this slice measures 63.1%. */
const MIN_PREPARATION_SAVING_BELOW = 0.5;

/** Deaths per 1,000 sim days. Before T-1603c the veteran arm measured 0.12 and
 *  this slice measured a flat ZERO. The band is the memo's target range (§11):
 *  below 0.8 death is a rumour rather than a dread (PRD line 85, "a real loss, not
 *  a soft reset"); above 6.0 a 120-day career is more likely than not to end in a
 *  succession, which is a different game. This slice measures 1.94. */
const MIN_DEATHS_PER_1000_DAYS = 0.8;
const MAX_DEATHS_PER_1000_DAYS = 6.0;

/** Share of RUNS that lost at least one ship. The upper bound is the real guard
 *  here: it is what would catch a future change that makes death routine. Measured
 *  10.0% on this slice (6 of 60 careers). */
const MAX_RUNS_WITH_DEATH_RATE = 0.5;

let report: BaselineAggregate;
let reports: CampaignStatsReport[];

function policyRow(policy: string): PolicyAggregate {
  const row = report.byPolicy.find((entry) => entry.policy === policy);
  if (!row) throw new Error(`no aggregate row for policy '${policy}'`);
  return row;
}

function cell(parity: TierParityBucket, prepared: boolean): CombatCell {
  const found = report.fleet.combatCells.find(
    (entry) => entry.parity === parity && entry.prepared === prepared,
  );
  if (!found) throw new Error(`no combat cell for ${parity}/${prepared ? 'yes' : 'no'}`);
  return found;
}

/** The CREDIT COST of an average encounter in a cell — i.e. `-mean EV`, which is
 *  positive and therefore reads the way a bill reads. Every comparison below is
 *  phrased in cost so "bigger is worse" holds throughout. */
function cost(parity: TierParityBucket, prepared: boolean): number {
  return -cell(parity, prepared).ev.mean;
}

beforeAll(() => {
  const rows: SeedRow[] = [];
  reports = [];
  for (const policy of POLICIES) {
    for (const seed of SEEDS) {
      const campaign = runCampaign(seed, DAYS, policy);
      reports.push(campaign);
      rows.push(summarizeReport(campaign));
    }
  }
  report = aggregate('balance-combat-survival', rows);
}, 180000);

describe('T-1603c combat & survival targets (pinned slice of the committed sweep)', () => {
  it('combat is a losing proposition, and losing it outgunned and unprepared is the worst version', () => {
    // NON-DEGENERACY FIRST. A band over an empty cell is not a test.
    for (const parity of ['below', 'even', 'above'] as const) {
      for (const prepared of [false, true]) {
        expect(
          cell(parity, prepared).n,
          `combat cell ${parity}/${prepared ? 'prepared' : 'unprepared'} has too few encounters to grade`,
        ).toBeGreaterThan(MIN_CELL_ENCOUNTERS);
      }
    }

    // (a) THE LITERAL ACCEPTANCE: "combat EV negative below tier parity
    //     unprepared". It is asserted, and it is TRUE BY CONSTRUCTION — and the
    //     honest thing is to say so rather than let it read as evidence.
    //     `resolveEncounter` (engine combat.ts) grants NO credits under any
    //     resolution: no bounty, no wreck salvage, no prize. So `combatEv` is
    //     `-combatCost` in every cell and cannot be positive anywhere.
    //
    //     T-1603c deliberately did NOT add a combat payout — that is a design
    //     change needing a PRD reading, not a tuning change (PRD-REIMAGINED §7.4's
    //     combat vignette ends "Nobody died; the story compounds instead": combat's
    //     payoff is narrative and positional, and salvage belongs to EXPLORATION,
    //     the only salvage table in the game). Recorded in `TUNING-T-1603.md` §12.
    //     Everything below (b) is the DISCRIMINATING replacement.
    expect(cell('below', false).ev.mean).toBeLessThan(0);
    expect(cell('below', false).ev.median).toBeLessThan(0);

    // (b) PARITY MONOTONICITY, unprepared: being outgunned costs more than being
    //     even, which costs more than outranking. This is the shape the tier-gap
    //     damage bonus (content `TIER_GAP_DAMAGE_BONUS`) exists to produce.
    expect(cost('below', false)).toBeGreaterThan(cost('even', false));
    expect(cost('even', false)).toBeGreaterThan(cost('above', false));

    // (c) ...by a MATERIAL margin, not a rounding error. This is the number that
    //     was 1.19x / 1.29x before the tuning pass.
    const parityRatio = cost('below', false) / cost('above', false);
    expect(
      parityRatio,
      `below/above unprepared cost ratio is only ${parityRatio.toFixed(3)}x`,
    ).toBeGreaterThanOrEqual(MIN_PARITY_COST_RATIO);

    // (d) PREPARATION PAYS OFF WHEN OUTGUNNED — Flag 3, and the real content of
    //     "without preparation". The saving is measured as the share of the
    //     unprepared bill that preparation removes.
    const savingBelow = 1 - cost('below', true) / cost('below', false);
    expect(
      savingBelow,
      `preparation saves only ${(savingBelow * 100).toFixed(1)}% when outgunned`,
    ).toBeGreaterThanOrEqual(MIN_PREPARATION_SAVING_BELOW);

    // (e) THE FULL ORDERING, so the table cannot invert silently: the worst place
    //     to be is outgunned and unprepared; the best is outranking and prepared;
    //     and preparation while outgunned beats no preparation while outgunned.
    expect(cost('below', false)).toBeGreaterThan(cost('below', true));
    expect(cost('below', true)).toBeGreaterThan(cost('above', true));
    expect(cost('below', false)).toBe(
      Math.max(
        ...(['below', 'even', 'above'] as const).flatMap((parity) => [
          cost(parity, false),
          cost(parity, true),
        ]),
      ),
    );
  });

  it('spacers die', () => {
    const { survival } = report.fleet;

    // The denominator, asserted rather than assumed — the acceptance is "across
    // 1,200 sim days" and this slice must always carry real margin over it.
    expect(survival.simDays).toBe(SEEDS.length * POLICIES.length * DAYS);
    expect(survival.simDays).toBeGreaterThanOrEqual(REQUIRED_SIM_DAYS * 2);

    // THE ACCEPTANCE: a nonzero death rate. This is the audit's zero-deaths
    // finding, closed. Before T-1603c this exact slice measured 0.
    expect(
      survival.shipsLost,
      `no ship was lost across ${survival.simDays} sim days`,
    ).toBeGreaterThan(0);

    // ...and inside the designed band, from both sides. See the constants.
    expect(
      survival.deathsPer1000Days,
      `death rate ${survival.deathsPer1000Days.toFixed(2)} per 1,000 sim days`,
    ).toBeGreaterThanOrEqual(MIN_DEATHS_PER_1000_DAYS);
    expect(survival.deathsPer1000Days).toBeLessThanOrEqual(MAX_DEATHS_PER_1000_DAYS);

    // COMBAT can kill again. This is the specific finding T-1603c exists to
    // close: `BASELINE-T-1603a.md` §4 measured ONE combat defeat in 34,000+
    // encounters across both sweep arms, because the enemy's target pick was
    // uniform over eight components and a junker hull needed ~72 landed hits.
    expect(
      survival.combatDefeats,
      'no combat defeat anywhere in the slice — the hull is unkillable again',
    ).toBeGreaterThan(0);

    // Deaths are spread across careers rather than piled into one unlucky run
    // (which `deathsPer1000Days` alone could not distinguish), and they are not
    // so common that a career is expected to end in one.
    expect(survival.runsWithDeathRate).toBeGreaterThan(0);
    expect(
      survival.runsWithDeathRate,
      `${(survival.runsWithDeathRate * 100).toFixed(1)}% of careers lost a ship`,
    ).toBeLessThanOrEqual(MAX_RUNS_WITH_DEATH_RATE);

    // Every ship lost is a succession — death is legacy, not game over (PRD line
    // 85). A ShipLost that did not hand the career to a successor would be a
    // silent break in the T-108 path.
    expect(report.fleet.survival.successions).toBe(survival.shipsLost);

    // The below/unprepared cell is where the dying happens — the same cell the
    // EV table grades as the worst place to be. Cross-checking the two makes the
    // parity axis mean the same thing in credits and in lives.
    expect(
      cell('below', false).shipLostRate,
      'nobody ever loses a ship while outgunned and unprepared',
    ).toBeGreaterThan(0);
  });

  it('Auto-Repair no longer switches the death path off', () => {
    // THE READER-CONSUMES-IT ASSERTION for T-1603c's named design call. The call
    // itself — move the AUTO_REPAIR dusk regen from BEFORE the life-support
    // survival gate to AFTER it — is proven deterministically, branch by branch,
    // in `packages/engine/src/__tests__/components.test.ts` ("a fitted Auto-Repair
    // no longer switches the life-support death path off"), which is the right
    // place for it: the ordering is an engine rule, not a distribution.
    //
    // What THIS test adds is the fleet-level half that the engine test cannot
    // reach: that the module is actually FITTED in real careers here (so the
    // reader runs at all), and that the policy which fits it is no longer immune
    // to death. Under the old ordering `fighter` was the only policy with ZERO
    // deaths AND zero life-support scares in 12,000 veteran-arm days — not because
    // it played well, but because the module removed the path
    // (`docs/balance/BASELINE-T-1603a.md` Flag 5).
    const fighterReports = reports.filter((entry) => entry.policy === 'fighter');
    expect(fighterReports.length).toBe(SEEDS.length);

    // (a) THE MODULE IS REALLY IN PLAY. `autoRepairDusks` counts dusks on which a
    //     fitted AUTO_REPAIR actually restored condition, so a nonzero total means
    //     careers in this slice both bought it and used it.
    const autoRepairDusks = fighterReports.reduce(
      (total, entry) => total + entry.equipmentUse.autoRepairDusks,
      0,
    );
    const careersWithModule = fighterReports.filter(
      (entry) => entry.equipmentUse.autoRepairDusks > 0,
    ).length;
    expect(
      autoRepairDusks,
      'no career in the slice ever ran the AUTO_REPAIR reader — the design call is untested here',
    ).toBeGreaterThan(0);
    expect(careersWithModule).toBeGreaterThan(SEEDS.length / 3);

    // (b) AND THE POLICY THAT FITS IT DIES. This is the number that was zero.
    const fighter = policyRow('fighter');
    expect(
      fighter.survival.shipsLost,
      'the AUTO_REPAIR buyer is death-proof again',
    ).toBeGreaterThan(0);

    // (c) The life-support gate is not disabled fleet-wide either: no policy in
    //     the slice, module or not, is exempt from the succession path — every
    //     ship lost by any policy resolved into a succession, and the module
    //     buyer's losses are counted in that total.
    const lossesByPolicy = report.byPolicy.map((row) => row.survival.shipsLost);
    expect(lossesByPolicy.reduce((sum, n) => sum + n, 0)).toBe(report.fleet.survival.shipsLost);
  });
});
