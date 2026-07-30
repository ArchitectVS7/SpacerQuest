import {
  DEEDS,
  NPC_PROFILES,
  RENOWN_DEED_THRESHOLDS,
  SPECIAL_EQUIPMENT,
} from '@spacerquest/content';
import { createInitialState, renownRankIndex } from '@spacerquest/engine';
import { describe, expect, it } from 'vitest';

import { aggregate, summarizeReport } from '../balance/aggregate.js';
import { runCampaign, type CampaignStatsReport } from '../index.js';

// ---------------------------------------------------------------------------
// N11/T-022 · THE NAMED READER (standing constraint 7) for the three things this
// step added to the instrument so N11 could be graded at all:
//   * `CampaignStatsReport.npcSpecialEquipmentPurchases` and its per-day series
//     `CampaignDayStats.npcSpecialEquipmentBought`,
//   * `MilestoneSample.npcDeedCount` / `npcRenownRank` (via `sampleField`),
//   * their aggregate counterparts — `npcSpecialEquipmentPurchases(PerRun)` on
//     `PolicyAggregate`, and `npcDeedCount` / `npcRenownRanks` on
//     `MilestoneAggregate`.
//
// WHY THIS FILE EXISTS AT ALL. N11's Simulate clause asks for the CAST's rank
// distribution at day 30/60/120 and for special-equipment purchase counts, and
// before this step the instrument could report neither. That is the same blind
// spot three previous steps each paid for, and the lineage is worth stating
// because the shape repeats: N9 — "the aggregate cannot see an asset"; N4 —
// `sampleMilestone` sampled all 41 records, so eleven frozen quest captains
// landed in every wealth percentile; N10 — `day.ts` emitted `ContractClaimed` and
// nothing in `packages/sim` counted it. A mechanism the instrument cannot see
// cannot be graded, and the closing has to land BEFORE the capstone (T-023), not
// after it, or the capstone measures the gap instead of the game.
//
// WHAT IS AND IS NOT ASSERTED. Bands and structural invariants, never pinned
// digits (`docs/VERSIONING.md`: "bands with visible headroom, never pinned
// digits"). Two exceptions, both deliberate and neither a balance number: the
// arithmetic identity between the scalar and its own per-day series, which is a
// property of the code; and the 30-vs-41 length identity, which is a property of
// the shared `isSimulatedCaptain` predicate.
//
// The one LIVE band is the last test — that the instrument can see the mechanism
// fire at all. If it reds, the remedy is a wider sample (more seeds, longer
// horizon), never a weaker assertion; and a genuine zero across seeds at a
// 120-day horizon is a finding about T-021's reachability to escalate, not a
// threshold to move.
// ---------------------------------------------------------------------------

/** N11 grades at day 120, so the reader reads the same horizon. */
const HORIZON = 120;
const MILESTONE_DAYS = [30, 60, 120] as const;
const SEED = 3;

/** The rank-gated rows, read off content by the SAME filter `considerRefit` and
 *  the instrument use, so a newly gated item joins this test for free and no id
 *  list is restated here. Three today: STAR_BUSTER / ARCH_ANGEL (CAPTAIN) and
 *  ASTRAXIAL_HULL (TOP_DOG). */
const GATED = SPECIAL_EQUIPMENT.filter((entry) => entry.requiredRenownRank !== undefined);

let report: CampaignStatsReport;

function run(): CampaignStatsReport {
  // One career per file, memoized — `campaign-contracts.test.ts`'s shape. Asking
  // for milestones is non-invasive (asserted in `balance-rig.test.ts`), so this is
  // the same career every assertion below reads.
  report ??= runCampaign(SEED, HORIZON, 'trader', { milestoneDays: MILESTONE_DAYS });
  return report;
}

function milestones(): NonNullable<CampaignStatsReport['milestones']> {
  const harvested = run().milestones;
  if (harvested === undefined)
    throw new Error('the run was asked for milestones and returned none');
  return harvested;
}

describe('N11 · the instrument can see the cast walk through the Renown gate', () => {
  it('the purchase scalar equals its own per-day series', () => {
    const r = run();
    // T-1601a's `fuelStarved` identity, and N10's `contractClaims` after it: one
    // measurement in two shapes, the total summed from the trajectory rather than
    // kept as a second counter. This is arithmetic about the code, not about
    // balance, which is why it is exact where everything else here is a band.
    expect(r.npcSpecialEquipmentPurchases).toBe(
      r.daily.reduce((total, day) => total + day.npcSpecialEquipmentBought, 0),
    );
    expect(r.daily).toHaveLength(HORIZON);
  });

  it('stays inside the bounds the engine itself imposes, derived rather than pinned', () => {
    const r = run();
    for (const day of r.daily) {
      // A negative day would mean a gated item was uninstalled or the roster
      // shrank — the two assumptions that make a dusk state-diff a purchase count.
      // The instrument deliberately does not clamp it, so this is the assertion
      // that would surface it.
      expect(day.npcSpecialEquipmentBought).toBeGreaterThanOrEqual(0);
      // `considerRefit` RETURNS after one successful `buy`, so a captain buys at
      // most one item per day: 30 captains is the per-day ceiling.
      expect(day.npcSpecialEquipmentBought).toBeLessThanOrEqual(NPC_PROFILES.length);
    }
    // ...and the yard answers ALREADY_INSTALLED forever after, so a captain buys
    // each gated row at most once per career: 30 × 3 over the whole run.
    expect(r.npcSpecialEquipmentPurchases).toBeLessThanOrEqual(NPC_PROFILES.length * GATED.length);
  });

  it('samples the simulated FIELD (30), not the record count (41)', () => {
    const sample = milestones()[0];
    // The N4 confusion, guarded a second time and on the new arrays: 30 is the
    // simulated field, 41 is the roster (30 captains + 11 quest records), and 31 is
    // the manifest board. Kept as two deliberately distinct constants so a future
    // re-conflation goes red rather than agreeing with itself.
    expect(sample.npcDeedCount).toHaveLength(NPC_PROFILES.length);
    expect(sample.npcRenownRank).toHaveLength(NPC_PROFILES.length);
    expect(NPC_PROFILES.length).toBeLessThan(createInitialState(SEED).npcs.length);
  });

  it('keeps all six per-captain arrays in step — one traversal, one filter', () => {
    // The property `sampleField`'s single `state.npcs.filter` buys: index i is the
    // same captain in every array, which is what makes a deed count readable
    // alongside the rank it produced (and what the monotonicity test below needs).
    for (const sample of milestones()) {
      const lengths = [
        sample.npcCredits.length,
        sample.npcHullStrength.length,
        sample.npcFuel.length,
        sample.npcSystemId.length,
        sample.npcDeedCount.length,
        sample.npcRenownRank.length,
      ];
      expect(new Set(lengths).size).toBe(1);
    }
  });

  it('records content ranks and plausible deed counts, checked against the shared definitions', () => {
    for (const sample of milestones()) {
      for (const rank of sample.npcRenownRank) {
        // Through the engine's own ladder rather than a restated list of rungs: an
        // unknown rank answers -1, which is precisely the dead end N11 exists to
        // remove and must never appear in a measurement.
        expect(renownRankIndex(rank)).toBeGreaterThanOrEqual(0);
        expect(rank in RENOWN_DEED_THRESHOLDS).toBe(true);
      }
      for (const deeds of sample.npcDeedCount) {
        expect(deeds).toBeGreaterThanOrEqual(0);
        // A captain cannot earn a deed the content table does not define.
        expect(deeds).toBeLessThanOrEqual(DEEDS.length);
      }
    }
  });

  it('never un-earns a deed or drops a rank between milestone days', () => {
    // Valid ONLY because of two engine facts, and it is here to keep them true:
    // `accrueDeeds` appends (nothing removes an earned deed), and a dead captain is
    // SKIPPED rather than spliced out of `state.npcs`, so index i is the same
    // captain at day 30 and at day 120. If this reds it is a finding about roster
    // stability — escalate it; it is not a band to widen.
    const harvested = milestones();
    for (let day = 1; day < harvested.length; day += 1) {
      const before = harvested[day - 1];
      const after = harvested[day];
      for (let i = 0; i < after.npcDeedCount.length; i += 1) {
        expect(after.npcDeedCount[i]).toBeGreaterThanOrEqual(before.npcDeedCount[i]);
        expect(renownRankIndex(after.npcRenownRank[i])).toBeGreaterThanOrEqual(
          renownRankIndex(before.npcRenownRank[i]),
        );
      }
    }
  });

  it('the aggregate carries both rows up: purchases per run and the cast rank histogram', () => {
    const r = run();
    const { fleet } = aggregate('n11-reader', [summarizeReport(r)]);

    expect(fleet.npcSpecialEquipmentPurchases).toBe(r.npcSpecialEquipmentPurchases);
    // One row, so the per-run figure is the row itself. The per-run form is the one
    // a diff reads, because the raw sum scales with the number of seeds.
    expect(fleet.npcSpecialEquipmentPurchasesPerRun).toBe(r.npcSpecialEquipmentPurchases);

    const aggregated = fleet.milestones;
    expect(aggregated).toBeDefined();
    expect(aggregated?.map((entry) => entry.day)).toEqual([...MILESTONE_DAYS]);
    for (const milestone of aggregated ?? []) {
      // Pooled over every captain of every run: 30 × runs, and runs is 1 here.
      expect(milestone.npcDeedCount.n).toBe(NPC_PROFILES.length);
      const histogram = Object.values(milestone.npcRenownRanks).reduce(
        (total, count) => total + count,
        0,
      );
      expect(histogram).toBe(NPC_PROFILES.length);
      // The histogram is keyed by `string` (a JSON object's keys are), so the
      // "is it a real rank" check goes through the content ladder rather than
      // through `renownRankIndex`, which would need a cast to be asked at all —
      // and a cast is exactly how an unknown key would slip past.
      for (const rank of Object.keys(milestone.npcRenownRanks)) {
        expect(rank in RENOWN_DEED_THRESHOLDS).toBe(true);
      }
    }
  });

  it('survives the JSON round trip the sweep writes to disk', () => {
    // The sweep persists reports as JSON; a field that does not survive that is a
    // field the capstone does not carry.
    const r = run();
    const revived = JSON.parse(JSON.stringify(r)) as CampaignStatsReport;
    expect(revived.npcSpecialEquipmentPurchases).toBe(r.npcSpecialEquipmentPurchases);
    expect(revived.daily.map((day) => day.npcSpecialEquipmentBought)).toEqual(
      r.daily.map((day) => day.npcSpecialEquipmentBought),
    );
    expect(revived.milestones?.map((sample) => sample.npcDeedCount)).toEqual(
      milestones().map((sample) => sample.npcDeedCount),
    );
    expect(revived.milestones?.map((sample) => sample.npcRenownRank)).toEqual(
      milestones().map((sample) => sample.npcRenownRank),
    );
  });

  it('SEES THE MECHANISM FIRE — the gate is walked through, not merely offered', () => {
    // THE ONE LIVE BAND, and the point of the whole step: an instrument that
    // reports a structurally perfect zero has not closed the blind spot.
    //
    // MEASURED before this assertion was written, seeds 1..8 × 120 days, trader and
    // fighter: 35–46 gated purchases per run (seed 3 trader, the career here: 41),
    // at most 3 on any one day. The cast rank histogram at day 120 on this seed is
    // COMMODORE 22 / CAPTAIN 4 / COMMANDER 3 / LIEUTENANT 1.
    //
    // The bar is set at the floor of nothing rather than near the measurement, so a
    // later step that legitimately moves the number does not have to re-pin this
    // file; what it may never do is go silent.
    const r = run();
    expect(r.npcSpecialEquipmentPurchases).toBeGreaterThan(0);
    expect(r.daily.some((day) => day.npcSpecialEquipmentBought > 0)).toBe(true);

    const dayOneTwenty = milestones().at(-1);
    expect(dayOneTwenty?.day).toBe(120);
    // Rank, not deeds: LIEUTENANT is the rung every captain starts on, so a
    // histogram with any other key is the gate having actually opened for someone.
    const ranks = new Set(dayOneTwenty?.npcRenownRank ?? []);
    expect([...ranks].some((rank) => rank !== 'LIEUTENANT')).toBe(true);
  });
});
