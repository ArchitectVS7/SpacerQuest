/**
 * N7 · THE STAGED SMOKE RUNNER — "did something obviously break?", in seconds.
 *
 * The capstone sweep answers *what moved and by how much* and costs minutes; this
 * answers *is it still standing* and costs a fraction of a second, so it can run
 * on every change. `docs/balance/smoke/README.md` is the contract; this file and
 * `./checkpoints.ts` implement it.
 *
 * WHAT IT IS NOT. Nothing here grades balance. The tiers run at three days apiece
 * and the mid-game ones start from `./synthesize.ts` states that were never played
 * into — see that file's header, and note that `./aggregate.ts` refuses to fold
 * their rows into a baseline at all. The capstone remains the only authority on
 * numbers.
 *
 * ONE DAY LOOP. Every tier runs through `runCampaign`, the same function the
 * capstone uses, via its `startState` door. R2c's lesson (the sim's private copy
 * of the yard ladder that inherited the engine's bug and so agreed with it for the
 * wrong reason) applies exactly as much to a second copy of the day loop.
 *
 * READERS (constraint 7): `./checkpoints.ts` (records the expectations),
 * `../__tests__/balance-smoke.test.ts` (checks them).
 */

import { createHash } from 'node:crypto';

import { runCampaign, type CampaignStatsReport, type SimPolicyName } from '../index.js';
import { synthesizeTierState, type TierSpread } from './synthesize.js';

/**
 * How a tier's world comes into being.
 *   - `'played'`  — days 1..N of a real career. No synthesis, no caveat.
 *   - `'synthesized'` — assembled by `./synthesize.ts`. Breakage detection only.
 */
export type TierStart = 'played' | 'synthesized';

export interface SmokeTier {
  id: string;
  /** `state.day` the tier begins at. */
  startDay: number;
  /** Days played. Three, per the worklist's day tiers. */
  days: number;
  start: TierStart;
  /** Why THIS day window, in one sentence. Printed on failure so a reader who
   *  has never seen the fixture knows what the tier was for. */
  rationale: string;
  seeds: number[];
  policies: SimPolicyName[];
  /**
   * The tier is expected to cross the day-30 Tour One resolution, so EVERY run
   * must report a resolved `tourOne`. Declared per tier rather than inferred from
   * the day window, because the day the marker falls due is a rule
   * (`player.debtDueDay`) and a rule can move — at which point this assertion
   * should fail and be re-decided, not silently re-derive itself and pass.
   *
   * Measured 2026-07-29 on the harvested fixture: 7/7 runs on `days-29-31`, 0/7
   * on all three other tiers. It is the one authored branch the worklist's
   * suggested windows straddle, which is why the tier exists.
   */
  expectTourOneResolution: boolean;
}

/** What one (tier, policy) pair produced. Small on purpose: every field is one a
 *  failure message can quote, and the hash below covers everything else. */
export interface TierOutcome {
  policy: string;
  runs: number;
  /** `startDay + days` on every run, or the runner has lost track of the loop. */
  endDay: number;
  creditsMin: number;
  creditsMedian: number;
  creditsMax: number;
  debtTotal: number;
  /** DAYS on which the captain took at least one income action, summed over the
   *  tier's runs — not a count of actions. A tier where this collapses to zero is
   *  measuring a stalled captain, whatever its credit numbers say. */
  incomeDays: number;
  encounters: number;
  shipsLost: number;
  deliveredLegs: number;
  fuelStarvationDays: number;
  /** Deeds held at the end of the tier. Equal to deeds EARNED during it only
   *  because every tier starts from an empty registry — a played tier from day 1,
   *  a synthesized one because `synthesize.ts` deliberately does not fabricate a
   *  deed history. If that ever changes, this becomes a stock rather than a flow
   *  and the name must change with it. */
  deedsEarned: number;
  /** Runs whose day-30 Tour One marker resolved. See
   *  {@link SmokeTier.expectTourOneResolution}. */
  tourOneResolved: number;
  /**
   * sha256/16 over every run's end-of-tier tuple. The summary fields above are
   * for READING a failure; this is for CATCHING one — it moves on any change to
   * credits, debt, fuel, position, deeds or rank on any seed, including changes
   * that leave a median untouched.
   */
  outcomeHash: string;
}

function median(sorted: readonly number[]): number {
  // The `./aggregate.ts` convention: nearest-rank, no interpolation, so a
  // reported median is always an observed value.
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.5 * sorted.length) - 1))];
}

/** The reports behind one (tier, policy) pair. Exposed so the invariant checks
 *  can read the same runs the outcome was folded from. */
export function runTierReports(
  tier: SmokeTier,
  policy: SimPolicyName,
  spread: TierSpread | null,
): CampaignStatsReport[] {
  return tier.seeds.map((seed, seedIndex) => {
    if (tier.start === 'played') {
      if (tier.startDay !== 1) {
        throw new Error(
          `Tier ${tier.id} is 'played' but starts at day ${tier.startDay}. A played tier begins ` +
            `at day 1 by definition; reaching any later day means simulating the days before it.`,
        );
      }
      return runCampaign(seed, tier.days, policy);
    }
    if (spread === null) {
      throw new Error(`Tier ${tier.id} is 'synthesized' but carries no spread`);
    }
    return runCampaign(seed, tier.days, policy, {
      startState: synthesizeTierState(seed, seedIndex, tier.startDay, spread),
    });
  });
}

export function foldTierOutcome(
  tier: SmokeTier,
  policy: SimPolicyName,
  reports: readonly CampaignStatsReport[],
): TierOutcome {
  const hash = createHash('sha256');
  for (const report of reports) {
    hash.update(
      JSON.stringify([
        report.seed,
        report.finalState.day,
        report.finalState.credits,
        report.finalState.debt,
        report.finalState.fuel,
        report.finalState.systemId,
        report.deedCount,
        report.renownRank,
        report.combatEncounters.length,
        report.survival.shipsLost,
      ]),
    );
  }
  const credits = reports.map((report) => report.finalState.credits).sort((a, b) => a - b);
  return {
    policy,
    runs: reports.length,
    endDay: tier.startDay + tier.days,
    creditsMin: credits[0] ?? 0,
    creditsMedian: median(credits),
    creditsMax: credits[credits.length - 1] ?? 0,
    debtTotal: reports.reduce((total, report) => total + report.finalState.debt, 0),
    incomeDays: reports.reduce(
      (total, report) =>
        total + report.daily.reduce((sum, day) => sum + (day.incomeActionCount > 0 ? 1 : 0), 0),
      0,
    ),
    encounters: reports.reduce((total, report) => total + report.combatEncounters.length, 0),
    shipsLost: reports.reduce((total, report) => total + report.survival.shipsLost, 0),
    deliveredLegs: reports.reduce(
      (total, report) =>
        total + report.routeLegs.filter((leg) => leg.outcome === 'delivered').length,
      0,
    ),
    fuelStarvationDays: reports.reduce((total, report) => total + report.fuelStarvationDays, 0),
    deedsEarned: reports.reduce((total, report) => total + report.deedCount, 0),
    tourOneResolved: reports.filter((report) => report.tourOne !== null).length,
    outcomeHash: hash.digest('hex').slice(0, 16),
  };
}

export function runSmokeTier(
  tier: SmokeTier,
  policy: SimPolicyName,
  spread: TierSpread | null,
): TierOutcome {
  return foldTierOutcome(tier, policy, runTierReports(tier, policy, spread));
}

/**
 * Structural checks that hold whatever the numbers are, so a FRESH fixture is
 * still a test rather than a tautology.
 *
 * These are the half of the suite that a re-extract cannot make vacuous: the
 * recorded outcomes above say "this is what the ruleset produced last time", and
 * re-extracting rewrites them by construction. An invariant says "this could
 * never be true of a working game", and re-extracting cannot silence it. Both
 * halves are needed; only this one survives a re-pin.
 *
 * Returns a list of human-readable violations — empty means clean.
 */
export function tierInvariantViolations(
  tier: SmokeTier,
  policy: SimPolicyName,
  reports: readonly CampaignStatsReport[],
): string[] {
  const violations: string[] = [];
  const expectedEndDay = tier.startDay + tier.days;
  for (const report of reports) {
    const where = `${tier.id}/${policy}/seed ${report.seed}`;
    if (report.finalState.day !== expectedEndDay) {
      violations.push(
        `${where}: ended on day ${report.finalState.day}, expected ${expectedEndDay} — the day ` +
          `loop did not advance once per requested day`,
      );
    }
    if (report.daily.length !== tier.days) {
      violations.push(`${where}: recorded ${report.daily.length} days, expected ${tier.days}`);
    }
    for (const day of report.daily) {
      if (!Number.isFinite(day.credits) || day.credits < 0) {
        violations.push(`${where}: credits ${day.credits} on day ${day.day}`);
      }
      if (!Number.isFinite(day.debt) || day.debt < 0) {
        violations.push(`${where}: debt ${day.debt} on day ${day.day}`);
      }
      if (!Number.isFinite(day.fuel) || day.fuel < 0) {
        violations.push(`${where}: fuel ${day.fuel} on day ${day.day}`);
      }
    }
    // The T-1605b promise, in the weak form a three-day window can carry: debt is
    // a LEDGER entry and never negative credits (PRD §2), so a captain may be
    // broke but never below zero. Checked above; here we only assert the purse is
    // a number at the end, which catches an NaN that a min/median would hide.
    if (!Number.isFinite(report.finalState.credits)) {
      violations.push(`${where}: final credits are not a number`);
    }
    // The authored branch this tier exists to cover. An invariant rather than a
    // recorded number, so a re-extract cannot quietly accept a tier that stopped
    // reaching it — the failure mode where the checkpoints stay green while the
    // career's central beat has stopped firing.
    if (tier.expectTourOneResolution && report.tourOne === null) {
      violations.push(
        `${where}: the day-30 Tour One marker did not resolve. This tier exists to cross that ` +
          `fork (day.ts, day === player.debtDueDay); a run that misses it is covering nothing ` +
          `the neighbouring tiers do not already cover.`,
      );
    }
  }
  return violations;
}
