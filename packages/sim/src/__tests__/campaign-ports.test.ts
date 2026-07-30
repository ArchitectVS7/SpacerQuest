import { NPC_PROFILES } from '@spacerquest/content';
import { createInitialState } from '@spacerquest/engine';
import { describe, expect, it } from 'vitest';

import { aggregate, summarizeReport } from '../balance/aggregate.js';
import { runCampaign, type CampaignStatsReport } from '../index.js';

// ---------------------------------------------------------------------------
// N12/T-030 · THE NAMED READER (standing constraint 7) for the four things this
// step added so N12 can be graded at all:
//   * `CampaignStatsReport.portsOwned` — the player's stake count at the horizon,
//   * `MilestoneSample.player.ports` and `MilestoneSample.npcPortCount` (the
//     latter through `sampleField`, so it cannot fall out of step with the other
//     six per-captain arrays),
//   * their aggregate counterparts — `portsOwned` / `portOwnershipRate` on
//     `PolicyAggregate`, and `playerPorts` / `npcPortCount` on
//     `MilestoneAggregate`.
//
// WHY THIS FILE EXISTS AT ALL. N9 measured the port arm as the game's biggest
// asset lever — 22% of fleet cash converted into perpetual dusk income — and the
// instrument could not count a single stake. N12 is about to let the CAST buy the
// same asset, so if the count arrived with the mechanism, N12's own sweep could
// not see its own effect. That is a shape this track has now paid for four times:
// N9 — "the aggregate cannot see an asset"; N4 — `sampleMilestone` sampled all 41
// records, so eleven frozen quest captains landed in every wealth percentile;
// N10 — `day.ts` emitted `ContractClaimed` and nothing in `packages/sim` counted
// it; N11/T-022 — the cast had ranks nothing could read. The closing has to land
// BEFORE the capstone, not after it.
//
// THE CAST SIDE READS ZERO TODAY, AND THAT IS THE POINT OF SHIPPING IT EARLY.
// `NpcState` has no `ports` field until N12 proper, so `npcPortCount` is 30 zeroes
// at every milestone day. This file therefore asserts the cast side's SHAPE (its
// length, its index alignment, its non-negativity) and never `=== 0` — pinning the
// zero would turn N12's success into a red test, which is precisely backwards.
//
// WHAT IS AND IS NOT ASSERTED. Bands and structural invariants, never pinned
// digits (`docs/VERSIONING.md`: "bands with visible headroom, never pinned
// digits"). The exceptions are identities about the CODE rather than about
// balance: the 30-vs-41 length identity (a property of the shared
// `isSimulatedCaptain` predicate) and the aggregate's one-row identities.
//
// The one LIVE band is the player's side — that a real career, driven by a
// SHIPPED policy through the engine's own `Port` action, ends holding a stake the
// instrument can see. If it reds, the remedy is a wider sample (more seeds, other
// policies), never a weaker assertion and never a longer horizon.
// ---------------------------------------------------------------------------

/** N12 grades at day 120, so the reader reads the same horizon — and the same one
 *  `campaign-renown.test.ts` reads. */
const HORIZON = 120;
const MILESTONE_DAYS = [30, 60, 120] as const;

/**
 * SWEEP EVIDENCE — PINNED, NOT STEERED. Measured before these assertions were
 * written, over seeds 1..80 x 120 days x six shipped policies, through the
 * committed `runCampaign` (no test-local policy, no `startState`): the stake is
 * bought by the SHIPPED policies' own `planPortStake` (N9), out of the surplus
 * left after the whole Guild marker is held back, so the purchase is earned
 * through the engine's real `Port` action under `quotePort`'s rules.
 *
 *   trader   64/80 qualify · smuggler 21/80 · gambler 58/80
 *   fighter  31/80          · explorer 64/80 · veteran  0/80
 *
 * Seed 1 on the trader is the FIRST qualifier overall: one stake at the horizon,
 * with milestone counts [0, 0, 1] at days 30/60/120. Swap in any other qualifying
 * seed and every assertion below still passes — the seed is the sample, not the
 * result.
 *
 * The veteran's 0/80 is worth recording rather than routing around: it is N9's
 * finding that the veteran cannot accumulate surplus above its own reserve plus
 * the marker, measured a second time and now visible in the instrument. That is a
 * reachability finding for N12 to read, not a reason to pick a different driver.
 */
const SEED = 1;

let report: CampaignStatsReport;

function run(): CampaignStatsReport {
  // One career per file, memoized — `campaign-renown.test.ts`'s shape. Asking for
  // milestones is non-invasive (asserted in `balance-rig.test.ts`), so this is the
  // same career every assertion below reads.
  report ??= runCampaign(SEED, HORIZON, 'trader', { milestoneDays: MILESTONE_DAYS });
  return report;
}

function milestones(): NonNullable<CampaignStatsReport['milestones']> {
  const harvested = run().milestones;
  if (harvested === undefined)
    throw new Error('the run was asked for milestones and returned none');
  return harvested;
}

describe('N12/T-030 · the instrument can see a port', () => {
  it('samples the simulated FIELD (30), not the record count (41)', () => {
    const sample = milestones()[0];
    // The N4 confusion, guarded a third time and on the new array: 30 is the
    // simulated field, 41 is the roster (30 captains + 11 quest records), and 31 is
    // the manifest board. Kept as two deliberately distinct constants so a future
    // re-conflation goes red rather than agreeing with itself.
    expect(sample.npcPortCount).toHaveLength(NPC_PROFILES.length);
    expect(NPC_PROFILES.length).toBeLessThan(createInitialState(SEED).npcs.length);
  });

  it('keeps all seven per-captain arrays in step — one traversal, one filter', () => {
    // The property `sampleField`'s single `state.npcs.filter` buys: index i is the
    // same captain in every array. `npcPortCount` joins that guarantee here so N12
    // can read a captain's stake alongside the purse that bought it.
    for (const sample of milestones()) {
      const lengths = [
        sample.npcCredits.length,
        sample.npcHullStrength.length,
        sample.npcFuel.length,
        sample.npcSystemId.length,
        sample.npcDeedCount.length,
        sample.npcRenownRank.length,
        sample.npcPortCount.length,
      ];
      expect(new Set(lengths).size).toBe(1);
    }
  });

  it('records a non-negative integer stake count for every captain', () => {
    // DELIBERATELY NOT `=== 0`. Every entry is zero today because `NpcState` has no
    // `ports` field yet, and that zero is stated in the field's own comment rather
    // than pinned here: an assertion that the cast owns nothing would go red on the
    // day N12 succeeds, which is the opposite of what this reader is for.
    for (const sample of milestones()) {
      for (const stakes of sample.npcPortCount) {
        expect(Number.isInteger(stakes)).toBe(true);
        expect(stakes).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("TRACKS A CAREER THAT BUYS ONE — the player's side, live", () => {
    // THE ONE LIVE BAND, and the point of the whole step: an instrument that can
    // only report zero has not closed the blind spot. The bar is set at the floor
    // of nothing rather than near the measurement (seed 1 holds 1 stake), so a
    // later step that legitimately moves the number does not have to re-pin this
    // file; what it may never do is go silent. See the SWEEP EVIDENCE above.
    const r = run();
    expect(r.portsOwned).toBeGreaterThanOrEqual(1);
    expect(milestones().some((sample) => sample.player.ports >= 1)).toBe(true);
  });

  it('never un-buys a stake between milestone days', () => {
    // Valid ONLY because of two engine facts, and it is here to keep them true:
    // the `Port` action is buy-only (there is no sell branch in
    // `resolvePortPurchase`), and stakes are carried WHOLESALE through succession
    // (`legacy.ts`), so a career's stake count is monotone non-decreasing even
    // across a death. If this reds it is a finding about one of those two rules —
    // escalate it; it is not a band to widen.
    const harvested = milestones();
    for (let day = 1; day < harvested.length; day += 1) {
      expect(harvested[day].player.ports).toBeGreaterThanOrEqual(harvested[day - 1].player.ports);
    }
    // The two new surfaces cross-checked against each other rather than each
    // against a literal: the day-120 sample is taken at DAWN and the report's count
    // at the END of the horizon, so the report can only be ahead, never behind.
    const dayOneTwenty = harvested.at(-1);
    expect(dayOneTwenty?.day).toBe(HORIZON);
    expect(run().portsOwned).toBeGreaterThanOrEqual(dayOneTwenty?.player.ports ?? 0);
  });

  it('the aggregate carries both rows up: the stake count and the ownership share', () => {
    const r = run();
    const { fleet } = aggregate('t030-reader', [summarizeReport(r)]);

    // One row, so the distribution IS the run — an identity about the plumbing, not
    // a balance number.
    expect(fleet.portsOwned.n).toBe(1);
    expect(fleet.portsOwned.median).toBe(r.portsOwned);
    expect(fleet.portsOwned.max).toBe(r.portsOwned);
    // ...and this career owns a stake, so the share of owning runs is all of them.
    // The SHARE is the readable figure for a row where most runs end at zero, which
    // is why it sits on `PolicyAggregate` beside the distribution.
    expect(fleet.portOwnershipRate).toBe(1);

    const aggregated = fleet.milestones;
    expect(aggregated).toBeDefined();
    expect(aggregated?.map((entry) => entry.day)).toEqual([...MILESTONE_DAYS]);
    for (const milestone of aggregated ?? []) {
      // One player per run, and one run.
      expect(milestone.playerPorts.n).toBe(1);
      // Pooled over every captain of every run: 30 x runs, and runs is 1 here.
      expect(milestone.npcPortCount.n).toBe(NPC_PROFILES.length);
      expect(milestone.npcPortCount.min).toBeGreaterThanOrEqual(0);
    }
    expect(aggregated?.at(-1)?.playerPorts.median).toBe(milestones().at(-1)?.player.ports);
  });

  it('survives the JSON round trip the sweep writes to disk', () => {
    // The sweep persists reports as JSON; a field that does not survive that is a
    // field the capstone does not carry.
    const r = run();
    const revived = JSON.parse(JSON.stringify(r)) as CampaignStatsReport;
    expect(revived.portsOwned).toBe(r.portsOwned);
    expect(revived.milestones?.map((sample) => sample.player.ports)).toEqual(
      milestones().map((sample) => sample.player.ports),
    );
    expect(revived.milestones?.map((sample) => sample.npcPortCount)).toEqual(
      milestones().map((sample) => sample.npcPortCount),
    );
  });
});
