import { NPC_PROFILES } from '@spacerquest/content';
import { describe, expect, it } from 'vitest';

import { aggregate, summarizeReport } from '../balance/aggregate.js';
import { runCampaign, type CampaignStatsReport, type CombatEncounterRecord } from '../index.js';

// ---------------------------------------------------------------------------
// T-173 · THE NAMED READER (standing constraint 7) for the fields this task added
// so a Hangout/disposition question can be answered off the SWEEP'S OWN ROWS:
//   * `CombatEncounterRecord.interceptorId` / `interceptorSource` /
//     `interceptorDisposition` / `namedPoolDispositions` / `namedPoolReconstructed`,
//   * `CampaignStatsReport.disposition` (`DispositionStats`),
//   * `MilestoneSample.npcDisposition` (through `sampleField`, so it cannot fall
//     out of step with the seven per-captain arrays beside it),
//   * their aggregate counterparts — `SeedRow.hangout` / `SeedRow.disposition`,
//     `PolicyAggregate.interceptor`, and `MilestoneAggregate.npcDisposition` /
//     `npcNonzeroDispositionShare`.
//
// WHY THIS FILE EXISTS AT ALL. Every Hangout/disposition measurement this project
// has taken — T-125, T-137, T-148, T-150 — had to descend from a GITIGNORED
// `.scratch/` probe, because the capstone instrument carried no hangout field, no
// disposition field and no interceptor id (`docs/BALANCE-RIG-DECISIONS.md` BR-13
// records exactly that, and names these three shapes as the reason). Four probes
// re-deriving the same reconstruction is four chances to re-derive it differently,
// and the result lived only in a doc appendix. The instrument now carries the
// fields; this file is what says they are populated by ordinary play, in the right
// shape, and survive to disk. Same class, and closed for the same reason, as
// N9 ("the aggregate cannot see an asset"), N10, N11 and N12/T-030 — the twin of
// which, `campaign-ports.test.ts`, this file is modelled on section for section.
//
// WHY IT LIVES IN `__tests__`. `packages/sim/src/__tests__` is in
// `HASHED_ROOT_IGNORED_DIRECTORIES` (`balance/rules-fingerprint.ts`), so nothing
// here can move `instrumentFingerprint` and stale the smoke fixture. A module
// under `packages/sim/src/balance/` would, and would owe a re-extraction just to
// check a reader. Same argument as `baseline-pointers.test.ts`.
//
// WHAT IS AND IS NOT ASSERTED. Structural invariants and bands with visible
// headroom, never pinned digits (`docs/VERSIONING.md`). NO BAND IN THIS FILE MAY
// BE EDITED TO MAKE IT PASS: if the `reconstructionMisses` assertion reds, that is
// a FINDING to file (the interceptor draw reached outside the pool this instrument
// rebuilds); if the policy-sensitivity assertions red, the fold or the policy
// changed. The remedy is a wider sample or a fix, never a weaker assertion —
// `docs/BALANCE-POLICY.md`.
// ---------------------------------------------------------------------------

/** The horizon the disposition findings were measured at (`docs/HANGOUT_REDESIGN.md`
 *  §10/§11), so this reader reads the same one. */
const HORIZON = 120;
/** Day 1 is load-bearing: the roster is neutral at dawn of day 1 by construction,
 *  which is the guard the T-125 probe carried as a throwaway `throw`. */
const MILESTONE_DAYS = [1, 30, 60, 120] as const;
/** Enough careers to put a few hundred interceptions and both a Hangout-heavy and
 *  a Hangout-blind policy through the shape assertions, at ~0.3s per run. */
const SEEDS = [1, 2, 3, 4] as const;

const cache = new Map<string, CampaignStatsReport>();

function run(policy: 'gambler' | 'explorer', seed = 1): CampaignStatsReport {
  const key = `${policy}-${String(seed)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const report = runCampaign(seed, HORIZON, policy, { milestoneDays: MILESTONE_DAYS });
  cache.set(key, report);
  return report;
}

function milestones(report: CampaignStatsReport): NonNullable<CampaignStatsReport['milestones']> {
  const harvested = report.milestones;
  if (harvested === undefined)
    throw new Error('the run was asked for milestones and returned none');
  return harvested;
}

/** Every interception across the multi-policy, multi-seed sample. */
function sampleEncounters(): CombatEncounterRecord[] {
  return SEEDS.flatMap((seed) => [
    ...run('gambler', seed).combatEncounters,
    ...run('explorer', seed).combatEncounters,
  ]);
}

describe('T-173 · the instrument can see a standing', () => {
  it('keeps npcDisposition in step with the other per-captain arrays', () => {
    // The property `sampleField`'s single `state.npcs.filter` buys: index i is the
    // same captain in every array, so a captain's standing is readable against the
    // purse and the rank that earned it. A second filter anywhere would make that
    // a coincidence.
    for (const sample of milestones(run('gambler'))) {
      const lengths = [
        sample.npcCredits.length,
        sample.npcHullStrength.length,
        sample.npcFuel.length,
        sample.npcSystemId.length,
        sample.npcDeedCount.length,
        sample.npcRenownRank.length,
        sample.npcPortCount.length,
        sample.npcDisposition.length,
      ];
      expect(new Set(lengths).size).toBe(1);
      // The N4 confusion, guarded again on the new array: 30 is the SIMULATED
      // field, 41 is the roster (30 captains + 11 quest records).
      expect(sample.npcDisposition).toHaveLength(NPC_PROFILES.length);
      for (const standing of sample.npcDisposition) {
        expect(Number.isInteger(standing)).toBe(true);
        // The engine's own clamp. A value outside it is a clamp defect, not a
        // balance number — escalate rather than widen.
        expect(standing).toBeGreaterThanOrEqual(-10);
        expect(standing).toBeLessThanOrEqual(10);
      }
    }
  });

  it('reads a NEUTRAL roster at day 1 — the probe assertion, promoted', () => {
    // `.scratch/t125-hangout.ts` carried this as `if (state.npcs.some(n =>
    // n.disposition !== 0)) throw 'day-0 roster not all-neutral'`, in a gitignored
    // file. Every disposition figure the four probes reported rests on it (a
    // standing is a MOVE from neutral), so it belongs in the repo.
    for (const policy of ['gambler', 'explorer'] as const) {
      const dayOne = milestones(run(policy))[0];
      expect(dayOne.day).toBe(1);
      expect(dayOne.npcDisposition.every((standing) => standing === 0)).toBe(true);
    }
  });

  it('records who answered the jump, and the pool they were drawn from', () => {
    const encounters = sampleEncounters();
    // The sample has to contain interceptions at all, or every assertion below is
    // vacuously true. This is a floor, not a measurement.
    expect(encounters.length).toBeGreaterThan(50);
    for (const record of encounters) {
      expect(record.interceptorId).not.toBe('');
      expect(['named', 'anonymous']).toContain(record.interceptorSource);
      if (record.interceptorSource === 'anonymous') {
        // An anonymous candidate carries no standing toward the player and
        // `chooseWeighted` weights it exactly 1, so both fields must be empty —
        // a 0 here would read as "neutral captain" and corrupt the inertness rate.
        expect(record.namedPoolDispositions).toEqual([]);
        expect(record.interceptorDisposition).toBeNull();
      } else {
        expect(record.namedPoolDispositions.length).toBeGreaterThan(0);
        expect(record.interceptorDisposition).not.toBeNull();
        expect(record.namedPoolDispositions).toContain(record.interceptorDisposition);
      }
    }
    // Both sides of the engine's 0.25 named-pool gate are exercised by the sample,
    // so neither branch above is untested.
    expect(encounters.some((record) => record.interceptorSource === 'named')).toBe(true);
    expect(encounters.some((record) => record.interceptorSource === 'anonymous')).toBe(true);
  });

  it('reconstructs EVERY named pool — a miss is a finding, not a band', () => {
    // `selectEncounterInterceptor` has a third, band-widening branch that draws
    // outside the single-tier pool this instrument rebuilds. It fires only when
    // both pools are empty at the target tier, and T-125 measured it at 0 of
    // 11,566 named draws. If this ever reds, FILE IT: the shares in
    // `PolicyAggregate.interceptor` would then be computed over a smaller sample
    // than `namedShare` implies. It is never a number to widen.
    const encounters = sampleEncounters();
    const named = encounters.filter((record) => record.interceptorSource === 'named');
    const misses = named.filter((record) => !record.namedPoolReconstructed);
    expect(
      misses.length,
      `${String(misses.length)} of ${String(named.length)} named draws (out of ` +
        `${String(encounters.length)} interceptions) could not be reconstructed — the draw came ` +
        `from selectEncounterInterceptor's band-widening branch. FILE THIS as a finding.`,
    ).toBe(0);
    // Anonymous draws claim no pool, so nothing can be missed on them.
    expect(
      encounters
        .filter((record) => record.interceptorSource === 'anonymous')
        .every((record) => record.namedPoolReconstructed),
    ).toBe(true);
  });

  it('folds standing off the events AND off the dusk state, policy-sensitively', () => {
    const gambler = run('gambler').disposition;
    const explorer = run('explorer').disposition;

    // The gambler plays the tables, so the Dare moves standing. The explorer never
    // sits down — the probe's own control (`docs/HANGOUT_REDESIGN.md` §10, "the
    // policies that never open a Hangout") — so its dare counter is EXACTLY 0. A
    // fold that quietly counted every reason the same would fail this pair.
    expect(gambler.movesByReason.dare).toBeGreaterThan(0);
    expect(explorer.movesByReason.dare).toBe(0);
    // Decay is a dusk step on every career, played or not.
    expect(gambler.movesByReason.decay).toBeGreaterThan(0);
    expect(explorer.movesByReason.decay).toBeGreaterThan(0);

    for (const stats of [gambler, explorer]) {
      // One sample per live captain per day.
      expect(stats.liveNpcDays).toBeGreaterThan(0);
      expect(stats.zeroDispositionNpcDays).toBeLessThanOrEqual(stats.liveNpcDays);
      expect(stats.absDispositionSum).toBeGreaterThanOrEqual(0);
      // The engine's clamp again, on the state-sampled side.
      expect(stats.peakAbsDisposition).toBeLessThanOrEqual(10);
      // A standing that opened and closed lasted at least one dusk-to-dusk day.
      for (const span of stats.standingSpanDays) expect(span).toBeGreaterThanOrEqual(1);
      expect(stats.standingsOpenAtHorizon).toBeGreaterThanOrEqual(0);
    }
    // The gambler holds standing the explorer does not: it is the existence proof
    // that the disposition system is reachable through play (§11.3's counter-case).
    // A floor of "more than none", never a pinned ratio.
    expect(gambler.standingSpanDays.length).toBeGreaterThan(0);
  });

  it('carries the two blocks onto the row rather than re-deriving them', () => {
    // `SeedRow.hangout` and `SeedRow.disposition` are the report's own objects.
    // Deep equality is the assertion that no second definition of these numbers
    // exists in `aggregate.ts` — the file-header rule ("exported from exactly one
    // place") applied to the two blocks T-173 added.
    const report = run('gambler');
    const row = summarizeReport(report);
    expect(row.hangout).toEqual(report.hangoutPlay);
    expect(row.disposition).toEqual(report.disposition);
  });

  it('survives the JSON round trip the sweep writes to disk', () => {
    // The sweep persists rows as JSON; a field that does not survive that is a
    // field the capstone does not carry — which is the whole point of the task.
    const report = run('gambler');
    const revived = JSON.parse(JSON.stringify(report)) as CampaignStatsReport;
    expect(revived.disposition).toEqual(report.disposition);
    expect(revived.milestones?.map((sample) => sample.npcDisposition)).toEqual(
      milestones(report).map((sample) => sample.npcDisposition),
    );
    expect(revived.combatEncounters.map((record) => record.namedPoolDispositions)).toEqual(
      report.combatEncounters.map((record) => record.namedPoolDispositions),
    );
    // A JSON round trip turns an absent key and a null into different things; the
    // anonymous case is the one that carries a null, so it is checked explicitly.
    expect(revived.combatEncounters.map((record) => record.interceptorDisposition)).toEqual(
      report.combatEncounters.map((record) => record.interceptorDisposition),
    );
  });

  it('rolls the interceptor draw and the milestone spread up into the aggregate', () => {
    const rows = SEEDS.flatMap((seed) => [
      summarizeReport(run('gambler', seed)),
      summarizeReport(run('explorer', seed)),
    ]);
    const { fleet } = aggregate('t173-reader', rows);

    // Identities about the plumbing, not balance numbers: every recorded encounter
    // reaches the interceptor block, and every share is a share.
    const encounters = rows.reduce((total, row) => total + row.combat.length, 0);
    expect(fleet.interceptor.interceptions).toBe(encounters);
    expect(fleet.interceptor.interceptions).toBe(fleet.encounters);
    for (const value of [
      fleet.interceptor.namedShare,
      fleet.interceptor.inertShare,
      fleet.interceptor.chosenWrongedShare,
      fleet.interceptor.uniformWrongedShare,
    ]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    // The named-pool gate is reachable in this sample, so `namedShare` is a
    // measurement rather than a structural zero. Deliberately NOT pinned near
    // 0.25: that constant is an owner-deferred design question
    // (`docs/HANGOUT_REDESIGN.md` §11.3), and pinning it here would make changing
    // it a red test in a reader.
    expect(fleet.interceptor.namedShare).toBeGreaterThan(0);
    expect(fleet.interceptor.reconstructionMisses).toBe(0);

    const aggregated = fleet.milestones;
    expect(aggregated).toBeDefined();
    expect(aggregated?.map((entry) => entry.day)).toEqual([...MILESTONE_DAYS]);
    for (const milestone of aggregated ?? []) {
      // Pooled over every simulated captain of every run: 30 x runs.
      expect(milestone.npcDisposition.n).toBe(NPC_PROFILES.length * rows.length);
      expect(milestone.npcDisposition.min).toBeGreaterThanOrEqual(-10);
      expect(milestone.npcDisposition.max).toBeLessThanOrEqual(10);
      expect(milestone.npcNonzeroDispositionShare).toBeGreaterThanOrEqual(0);
      expect(milestone.npcNonzeroDispositionShare).toBeLessThanOrEqual(1);
    }
    // Day 1 is neutral for every captain of every run, so the share is exactly 0
    // and the distribution is degenerate — the aggregate-side twin of the
    // neutrality assertion above.
    const dayOne = aggregated?.[0];
    expect(dayOne?.day).toBe(1);
    expect(dayOne?.npcNonzeroDispositionShare).toBe(0);
    expect(dayOne?.npcDisposition.min).toBe(0);
    expect(dayOne?.npcDisposition.max).toBe(0);
    // ...and by the horizon the cast has moved off neutral somewhere, or the
    // by-day series would be measuring nothing.
    expect(aggregated?.at(-1)?.npcNonzeroDispositionShare).toBeGreaterThan(0);
  });
});
