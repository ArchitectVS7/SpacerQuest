import { describe, expect, it, beforeAll } from 'vitest';

import {
  reportToJson,
  runCampaign,
  type CampaignDayStats,
  type CampaignStatsReport,
  type CombatEncounterRecord,
  type RouteLegRecord,
} from '../index.js';
import {
  aggregate,
  combatCost,
  combatEv,
  deedPacing,
  distribution,
  isCombatWin,
  quantile,
  routeEv,
  routeKey,
  share,
  summarizeReport,
  tierParityBucket,
  MAX_TRACKED_DEED,
} from '../balance/aggregate.js';
import { parseSweepArgs } from '../balance/sweep.js';

// ---------------------------------------------------------------------------
// T-1603a · The NAMED READER (standing constraint 7) for the four report blocks
// this task added to `CampaignStatsReport` — `tourOne`, `combatEncounters`,
// `routeLegs` and `survival` — and for the pure aggregation module those blocks
// exist to feed (`../balance/aggregate.ts`).
//
// Two halves, deliberately:
//   1. Fixture math. `distribution`/`quantile`/`tierParityBucket`/`combatEv`/
//      `routeEv` are pinned against hand-built inputs, with no campaign run at
//      all. These definitions are what T-1603b and T-1603c are graded against
//      ("median trader debt-clear day in [22, 30]", "combat EV negative below
//      tier parity unprepared"), so they are held still by a test that costs
//      milliseconds and cannot drift with balance.
//   2. Consumption. Two real 35-day campaigns prove the blocks are populated by
//      ordinary play AND cross-check each new block against a field that already
//      existed — which is what makes this a reader rather than a receipt.
//
// NO `GameState` FIELD WAS ADDED by T-1603a: every block is derived at report
// time from the typed event stream plus pre-action state samples and is never
// persisted. There is therefore deliberately no save migration and no state
// round-trip test here; what IS asserted is that the REPORT survives a JSON
// round-trip, which is the artifact the sweep writes to disk.
//
// Horizon note: both runs are 35 days, matching the sweep's Tour One arm. It is
// the shortest horizon that carries through the day-30 Tour One resolution, so
// this file never becomes the test suite's wall-clock floor.
// ---------------------------------------------------------------------------

const HORIZON = 35;
const SEED = 1;

function encounterRecord(overrides: Partial<CombatEncounterRecord> = {}): CombatEncounterRecord {
  return {
    encounterId: 'enc-fixture',
    day: 1,
    interceptorTier: 1,
    playerTier: 1,
    prepared: false,
    rounds: 1,
    creditsDelta: 0,
    tributeCredits: 0,
    salvageCredits: 0,
    fineCredits: 0,
    successionCredits: 0,
    travelCompleted: true,
    fuelUnits: 0,
    fuelCredits: 0,
    repairCredits: 0,
    resolution: 'defeated',
    shipLost: false,
    ...overrides,
  };
}

function legRecord(overrides: Partial<RouteLegRecord> = {}): RouteLegRecord {
  return {
    signedDay: 1,
    originSystem: 1,
    destination: 9,
    cargoType: 1,
    quotedPayment: 1000,
    paidPayment: 1000,
    deliveredDay: 3,
    fuelUnitsWhileOpen: 0,
    fuelPriceAtSigning: 5,
    outcome: 'delivered',
    ...overrides,
  };
}

function dayStats(day: number, deedsEarned: string[]): CampaignDayStats {
  return {
    day,
    credits: 0,
    debt: 0,
    fuel: 0,
    systemId: 1,
    wireEntries: 0,
    flawChecks: 0,
    flawOverrides: 0,
    deedsEarned,
    deedCount: 0,
    renownRank: 'LIEUTENANT',
    bestOfferDestination: null,
    // N10 · A full board and no snipe: this helper exists to exercise the deed
    // pacing math, so the contract-competition fields are set to the undrained
    // case rather than to something the arithmetic here would read.
    boardDepth: 4,
    contractsSniped: 0,
    // N11/T-022 · Same reasoning: this helper drives the deed-pacing math only, so
    // the cast's yard is set to the quiet day rather than to a number the
    // arithmetic under test would pick up.
    npcSpecialEquipmentBought: 0,
    incomeActionCount: 0,
    fuelStarved: false,
  };
}

describe('T-1603a balance aggregation math', () => {
  it('reports nearest-rank quantiles over the sorted sample', () => {
    // 1..10 sorted. Nearest rank: index = ceil(q * n) - 1.
    const values = [7, 3, 10, 1, 5, 9, 2, 8, 4, 6];
    const summary = distribution(values);

    expect(summary.n).toBe(10);
    expect(summary.min).toBe(1);
    expect(summary.max).toBe(10);
    expect(summary.mean).toBe(5.5);
    expect(summary.p10).toBe(1);
    expect(summary.p25).toBe(3);
    // No interpolation: the median of an even sample is the LOWER middle value,
    // never the 5.5 an averaging convention would report.
    expect(summary.median).toBe(5);
    expect(summary.p75).toBe(8);
    expect(summary.p90).toBe(9);
  });

  it('returns an all-zero distribution for an empty sample and the value itself for n=1', () => {
    const empty = distribution([]);
    expect(empty).toEqual({
      n: 0,
      min: 0,
      p10: 0,
      p25: 0,
      median: 0,
      p75: 0,
      p90: 0,
      max: 0,
      mean: 0,
    });

    const single = distribution([42]);
    expect(single.n).toBe(1);
    for (const key of ['min', 'p10', 'p25', 'median', 'p75', 'p90', 'max', 'mean'] as const) {
      expect(single[key]).toBe(42);
    }

    // Every quantile of an empty sample is 0, not NaN — a NaN in a memo table is
    // indistinguishable from a real zero once it has been rendered as prose.
    expect(quantile([], 0.5)).toBe(0);
    expect(share(3, 0)).toBe(0);
  });

  it('pins the tier-parity sign convention in BOTH directions', () => {
    // 'below' means the INTERCEPTOR outranks the player — the bucket T-1603c's
    // acceptance names. Inverting this silently inverts that acceptance.
    expect(tierParityBucket(1, 3)).toBe('below');
    expect(tierParityBucket(3, 1)).toBe('above');
    expect(tierParityBucket(2, 2)).toBe('even');
    expect(tierParityBucket(5, 4)).toBe('above');
    expect(tierParityBucket(4, 5)).toBe('below');
  });

  it('prices combat EV from the itemised cost lines, never the purse delta', () => {
    const record = encounterRecord({
      // A purse that GREW by 1,700 while the fight was open — a delivery that
      // paid out mid-encounter. The EV must not be fooled by it.
      creditsDelta: 1700,
      fuelCredits: 800,
      repairCredits: 30,
      tributeCredits: 120,
      fineCredits: 50,
      successionCredits: 0,
    });

    expect(combatCost(record)).toBe(1000);
    expect(combatEv(record)).toBe(-1000);
  });

  it('counts a win on the field but not a tribute paid', () => {
    expect(isCombatWin(encounterRecord({ resolution: 'defeated' }))).toBe(true);
    expect(isCombatWin(encounterRecord({ resolution: 'interceptor-escaped' }))).toBe(true);
    expect(isCombatWin(encounterRecord({ resolution: 'interceptor-fled' }))).toBe(true);
    expect(isCombatWin(encounterRecord({ resolution: 'talked-down' }))).toBe(false);
    expect(isCombatWin(encounterRecord({ resolution: 'escaped' }))).toBe(false);
    expect(isCombatWin(encounterRecord({ resolution: 'ship-lost' }))).toBe(false);
  });

  it('rates a delivered leg per elapsed day, net of fuel, and refuses to rate the rest', () => {
    // 2,000 paid − 100 units × 5 credits = 1,500 over 3 elapsed days = 500/day.
    const delivered = legRecord({
      signedDay: 4,
      deliveredDay: 7,
      paidPayment: 2000,
      fuelUnitsWhileOpen: 100,
      fuelPriceAtSigning: 5,
    });
    expect(routeEv(delivered)).toBe(500);

    // Same-day delivery: the max(1, span) floor keeps Infinity out of the memo.
    expect(routeEv(legRecord({ signedDay: 9, deliveredDay: 9, paidPayment: 700 }))).toBe(700);

    // Never-delivered legs are excluded, not scored as zero — folding them in as
    // zeros would reward a policy for signing contracts it never ran.
    expect(routeEv(legRecord({ outcome: 'lost', paidPayment: null, deliveredDay: null }))).toBe(
      null,
    );
    expect(
      routeEv(legRecord({ outcome: 'open-at-end', paidPayment: null, deliveredDay: null })),
    ).toBe(null);

    expect(routeKey(legRecord({ originSystem: 3, destination: 11 }))).toBe('3->11');
  });

  it('dates the Nth deed and rates deeds per 100 days', () => {
    const daily = [
      dayStats(1, ['first_manifest', 'first_jump']),
      dayStats(2, []),
      dayStats(9, ['first_delivery']),
      dayStats(31, ['rim_runner']),
    ];
    const pacing = deedPacing(daily);

    expect(pacing.dayOfNthDeed).toHaveLength(MAX_TRACKED_DEED);
    expect(pacing.dayOfNthDeed.slice(0, 4)).toEqual([1, 1, 9, 31]);
    expect(pacing.dayOfNthDeed[4]).toBe(null);
    // The day-31 deed is outside Tour One and must not be counted in it.
    expect(pacing.deedsByDay30).toBe(3);
    expect(pacing.deedsPer100Days).toBe(100);
    expect(deedPacing([]).deedsPer100Days).toBe(0);
  });
});

describe('T-1603a sweep CLI argument parsing', () => {
  it('defaults to the Tour One arm', () => {
    const parsed = parseSweepArgs([]);
    expect('help' in parsed).toBe(false);
    if ('help' in parsed) return;
    expect(parsed.label).toBe('tour-one');
    expect(parsed.seeds).toBe(500);
    expect(parsed.days).toBe(35);
    expect(parsed.shardCount).toBe(1);
    expect(parsed.policies).toContain('trader');
    // `idle`/`random` are protocol instruments, not balance ones.
    expect(parsed.policies).not.toContain('idle');
    expect(parsed.policies).not.toContain('random');
  });

  it('THROWS on an unknown policy instead of silently sweeping the random policy', () => {
    // `resolvePolicy` answers an unrecognised name with `randomLegalActionPolicy`,
    // so without this guard a typo would produce a plausible-looking 500-seed
    // sweep of the wrong policy. This is the guard.
    expect(() => parseSweepArgs(['--policies', 'tradr'])).toThrow(/Invalid policy: tradr/);
    expect(() => parseSweepArgs(['--policies', 'trader,fighter'])).not.toThrow();
    expect(() => parseSweepArgs(['--shard', '5/4'])).toThrow(/--shard i must be <= N/);
    expect(() => parseSweepArgs(['--seeds', '0'])).toThrow(/must be an integer >= 1/);
    expect(() => parseSweepArgs(['--nope'])).toThrow(/Unknown argument/);
  });
});

describe('T-1603a report blocks are populated by ordinary play and consumed', () => {
  let trader: CampaignStatsReport;
  let fighter: CampaignStatsReport;
  let smuggler: CampaignStatsReport;

  beforeAll(() => {
    trader = runCampaign(SEED, HORIZON, 'trader');
    fighter = runCampaign(SEED, HORIZON, 'fighter');
    smuggler = runCampaign(SEED, HORIZON, 'smuggler');
  }, 30000);

  it('records the day-30 Tour One branch, distinct from the first debt-free day', () => {
    for (const report of [trader, fighter, smuggler]) {
      expect(report.tourOne).not.toBeNull();
      expect(report.tourOne?.resolvedDay).toBe(30);
      expect(['cleared', 'unpaid']).toContain(report.tourOne?.outcome);
      if (report.tourOne?.outcome === 'cleared') {
        expect(report.tourOne.debtOutstanding).toBe(0);
      } else {
        expect(report.tourOne?.debtOutstanding).toBeGreaterThan(0);
      }
    }
    // A horizon that never reaches day 30 has no branch to report.
    expect(runCampaign(SEED, 5, 'trader').tourOne).toBeNull();
  });

  it('records one well-formed record per encounter the fighter took', () => {
    expect(fighter.combatEncounters.length).toBeGreaterThan(0);
    for (const record of fighter.combatEncounters) {
      expect(record.encounterId).not.toBe('');
      expect(record.interceptorTier).toBeGreaterThanOrEqual(1);
      expect(record.interceptorTier).toBeLessThanOrEqual(5);
      expect(record.playerTier).toBeGreaterThanOrEqual(1);
      expect(record.playerTier).toBeLessThanOrEqual(5);
      expect(record.rounds).toBeGreaterThanOrEqual(0);
      expect(record.fuelUnits).toBeGreaterThanOrEqual(0);
      expect(record.repairCredits).toBeGreaterThanOrEqual(0);
      // The invariant that keeps the death fold and the resolution union in step.
      expect(record.shipLost).toBe(record.resolution === 'ship-lost');
      expect([
        'escaped',
        'talked-down',
        'defeated',
        'interceptor-fled',
        'interceptor-escaped',
        'ship-lost',
        'unresolved',
      ]).toContain(record.resolution);
      // Fuel is priced at the encounter's local price, never left unpriced.
      if (record.fuelUnits > 0) expect(record.fuelCredits).toBeGreaterThan(0);
      else expect(record.fuelCredits).toBe(0);
    }
    // A policy that actually fights burns fuel doing it (FIGHT_FUEL_COST).
    expect(fighter.combatEncounters.some((record) => record.fuelUnits > 0)).toBe(true);
  });

  it('records one leg per signed contract, cross-checked against the smuggling block', () => {
    expect(trader.routeLegs.length).toBeGreaterThan(0);
    for (const leg of trader.routeLegs) {
      expect(['delivered', 'lost', 'open-at-end']).toContain(leg.outcome);
      expect(leg.quotedPayment).toBeGreaterThan(0);
      expect(leg.fuelPriceAtSigning).toBeGreaterThan(0);
      if (leg.outcome === 'delivered') {
        expect(leg.paidPayment).not.toBeNull();
        expect(leg.deliveredDay).not.toBeNull();
        expect(leg.deliveredDay ?? 0).toBeGreaterThanOrEqual(leg.signedDay);
      } else {
        expect(leg.paidPayment).toBeNull();
      }
    }

    // THE cross-check that makes this a reader: the leg stream and the T-1601b
    // smuggling counters are folded independently from the same events, so they
    // must agree on both the contraband contracts signed and the ones delivered.
    for (const report of [trader, fighter, smuggler]) {
      const contraband = report.routeLegs.filter((leg) => leg.cargoType === 10);
      expect(contraband.length).toBe(report.smuggling.contrabandContractsSigned);
      expect(contraband.filter((leg) => leg.outcome === 'delivered').length).toBe(
        report.smuggling.contrabandDelivered,
      );
    }
  });

  it('folds every ShipLost reason, so the death counts cannot drift', () => {
    for (const report of [trader, fighter, smuggler]) {
      const { survival } = report;
      expect(survival.shipsLost).toBe(survival.combatDefeats + survival.lifeSupportFailures);
      expect(survival.successions).toBeGreaterThanOrEqual(survival.shipsLost);
      expect(survival.lifeSupportScares).toBeGreaterThanOrEqual(0);
      // A combat death is also visible as a record resolution — two independent
      // folds over the same event, which is what would catch one of them rotting.
      expect(report.combatEncounters.filter((record) => record.shipLost).length).toBe(
        survival.combatDefeats,
      );
    }
  });

  it('summarizes a report into finite sweep rows and aggregates them', () => {
    const rows = [trader, fighter, smuggler].map(summarizeReport);
    for (const row of rows) {
      expect(row.days).toBe(HORIZON);
      expect(Number.isFinite(row.finalCredits)).toBe(true);
      expect(Number.isFinite(row.deedPacing.deedsPer100Days)).toBe(true);
      expect(Number.isFinite(row.fuelStarvationDays)).toBe(true);
      expect(row.deedPacing.dayOfNthDeed).toHaveLength(MAX_TRACKED_DEED);
    }

    const summary = aggregate('unit', rows);
    expect(summary.runs).toBe(3);
    expect(summary.byPolicy.map((entry) => entry.policy)).toEqual([
      'trader',
      'fighter',
      'smuggler',
    ]);
    // Six cells: 3 parity buckets x prepared/unprepared, always present even when
    // empty, so a memo table never has a missing row.
    expect(summary.fleet.combatCells).toHaveLength(6);
    expect(summary.fleet.combatCells.reduce((total, cell) => total + cell.n, 0)).toBe(
      summary.fleet.encounters,
    );
    expect(summary.fleet.encounters).toBe(
      trader.combatEncounters.length +
        fighter.combatEncounters.length +
        smuggler.combatEncounters.length,
    );
    expect(summary.fleet.routeLegs).toBe(
      summary.fleet.routesDelivered + summary.fleet.routesLost + summary.fleet.routesOpenAtEnd,
    );
    expect(summary.fleet.survival.simDays).toBe(HORIZON * 3);
    for (const value of Object.values(summary.fleet.routeEvPerDay)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('keeps the new blocks deterministic and JSON round-trippable', () => {
    // Byte-identical reruns of the new record streams specifically (the existing
    // whole-report determinism tests cover the rest and are untouched).
    const first = runCampaign(7, HORIZON, 'fighter');
    const second = runCampaign(7, HORIZON, 'fighter');
    expect(JSON.stringify(second.combatEncounters)).toBe(JSON.stringify(first.combatEncounters));
    expect(JSON.stringify(second.routeLegs)).toBe(JSON.stringify(first.routeLegs));
    expect(second.survival).toEqual(first.survival);
    expect(second.tourOne).toEqual(first.tourOne);

    // The sweep writes reports-derived rows to disk, so the report must survive a
    // JSON round-trip intact. (No `GameState` field was added by this task, so
    // there is no save migration in play — see the header.)
    expect(JSON.parse(reportToJson(first)) as CampaignStatsReport).toEqual(first);
  }, 30000);
});
