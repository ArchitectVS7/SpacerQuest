/**
 * T-1603a · Balance-baseline aggregation — the PURE half of the sweep.
 *
 * No `fs`, no `process`, no clock, no rng. Everything here is a function of the
 * `CampaignStatsReport`s a sweep produced, which is what makes the definitions
 * unit-testable in `packages/sim/src/__tests__/balance-sweep.test.ts` without
 * running a campaign. The I/O half — argument parsing, sharding, file writes,
 * progress — lives in `./sweep.ts` and imports this module. That split is the
 * `e2e/support/flake.ts` (pure) / `flake-io.ts` (filesystem) pattern ratified in
 * T-1602b, adopted here for the same reason: CI and a local re-run must not be
 * able to compute different numbers from the same rows.
 *
 * WHY THIS FILE IS THE OWNER OF THE DEFINITIONS. T-1603b and T-1603c are graded
 * against the distributions this module produces ("median trader debt-clear day in
 * [22, 30]", "combat EV negative below tier parity unprepared"). If `combatEv`,
 * `routeEv`, the tier-parity sign convention or the quantile method were re-derived
 * at each call site, the before/after comparison would be meaningless. They are
 * exported from exactly one place — here — and the memo quotes this file.
 *
 * READERS (constraint 7): `./sweep.ts` and `../__tests__/balance-sweep.test.ts`.
 */

import type {
  CampaignDayStats,
  CampaignStatsReport,
  CombatEncounterRecord,
  RouteLegRecord,
  SimPolicyName,
} from '../index.js';

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

/**
 * A summary of one measured quantity. Every number in the baseline memo is one of
 * these, so a tuning pass can diff a whole target with a single table row.
 *
 * QUANTILE METHOD (stated because an undocumented convention makes T-1603b's
 * before/after comparison unfalsifiable): **nearest-rank on the ascending sorted
 * sample**. For a sample of n values and quantile q ∈ (0, 1], the reported value is
 * `sorted[clamp(ceil(q * n) - 1, 0, n - 1)]`. No interpolation — every reported
 * quantile is an actually-observed datum, which matters when the quantity is a day
 * number or a credit count and a half-value would be a fiction. `median` is `p50`
 * under the same rule, so for even n it is the LOWER of the two middle values, not
 * their average.
 */
export interface Distribution {
  n: number;
  min: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
  mean: number;
}

const EMPTY_DISTRIBUTION: Distribution = {
  n: 0,
  min: 0,
  p10: 0,
  p25: 0,
  median: 0,
  p75: 0,
  p90: 0,
  max: 0,
  mean: 0,
};

/** Nearest-rank quantile over an ASCENDING-sorted sample. See `Distribution`. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(q * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index];
}

export function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) return { ...EMPTY_DISTRIBUTION };
  const sorted = [...values].sort((a, b) => a - b);
  let total = 0;
  for (const value of sorted) total += value;
  return {
    n: sorted.length,
    min: sorted[0],
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    max: sorted[sorted.length - 1],
    mean: total / sorted.length,
  };
}

/** Share of a boolean sample, 0 when the sample is empty (never NaN — a NaN in a
 *  memo table is indistinguishable from a real zero once it is prose). */
export function share(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

// ---------------------------------------------------------------------------
// Combat: parity buckets and EV
// ---------------------------------------------------------------------------

/**
 * Where the player stood relative to the interceptor, from the PLAYER's point of
 * view.
 *
 * SIGN CONVENTION — read this before using it, because getting it backwards
 * silently inverts T-1603c's acceptance ("combat EV negative BELOW tier parity
 * without preparation"):
 *   - 'below' — the interceptor's tier is HIGHER than the player's. The player is
 *     outgunned. **This is T-1603c's target bucket.**
 *   - 'even'  — equal tiers.
 *   - 'above' — the player's tier is higher; the interceptor is outmatched.
 * The test pins both directions explicitly.
 */
export type TierParityBucket = 'below' | 'even' | 'above';

export function tierParityBucket(playerTier: number, interceptorTier: number): TierParityBucket {
  if (interceptorTier > playerTier) return 'below';
  if (interceptorTier < playerTier) return 'above';
  return 'even';
}

/**
 * The credits an encounter cost, attributed by event. See the
 * `CombatEncounterRecord` block comment in `../index.ts` for why this is built
 * from itemised lines rather than from the purse delta.
 */
export function combatCost(record: CombatEncounterRecord): number {
  return (
    record.fuelCredits +
    record.repairCredits +
    record.tributeCredits +
    record.fineCredits +
    record.successionCredits
  );
}

/**
 * THE combat-EV definition. Negative-or-zero by construction: the engine pays
 * nothing for winning a fight (no bounty, no wreck salvage — `resolveEncounter`
 * moves disposition and reputation only). That is a finding, not a bug in this
 * function; the memo records it and T-1603c owns the call. What the baseline
 * therefore compares is the MAGNITUDE of the loss across parity/preparation cells.
 */
export function combatEv(record: CombatEncounterRecord): number {
  return -combatCost(record);
}

/** A fight the player won on the field: the interceptor was destroyed or slipped
 *  away beaten, or a bonded third party drove it off. Talking a demand down is a
 *  RESOLUTION, not a win — it is priced in `tributeCredits`. */
export function isCombatWin(record: CombatEncounterRecord): boolean {
  return (
    record.resolution === 'defeated' ||
    record.resolution === 'interceptor-escaped' ||
    record.resolution === 'interceptor-fled'
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Credits per elapsed day on a delivered contract, net of the leg's fuel burn:
 * `(paidPayment - fuelUnitsWhileOpen * fuelPriceAtSigning) / max(1, deliveredDay - signedDay)`.
 *
 * Returns `null` for a leg that never delivered — an undelivered contract has no
 * payout to rate, and folding it in as a zero would silently reward a policy for
 * signing contracts it never runs. The caller counts 'lost'/'open-at-end' legs
 * separately (see `RouteAggregate`).
 *
 * The `max(1, …)` floor is load-bearing: a same-day delivery has a zero-day span,
 * and dividing by it would put an Infinity in a memo table.
 */
export function routeEv(leg: RouteLegRecord): number | null {
  if (leg.outcome !== 'delivered' || leg.paidPayment === null || leg.deliveredDay === null) {
    return null;
  }
  const net = leg.paidPayment - leg.fuelUnitsWhileOpen * leg.fuelPriceAtSigning;
  return net / Math.max(1, leg.deliveredDay - leg.signedDay);
}

/** `origin→destination`, the key the memo's route table is cut on. */
export function routeKey(leg: RouteLegRecord): string {
  return `${leg.originSystem}->${leg.destination}`;
}

// ---------------------------------------------------------------------------
// Deed pacing
// ---------------------------------------------------------------------------

/** The day the Nth deed landed (N = 1..`MAX_TRACKED_DEED`), plus the two pacing
 *  rates the memo reports. */
export const MAX_TRACKED_DEED = 5;

export interface DeedPacing {
  /** Index i holds the day the (i+1)-th deed was earned, or null if the run never
   *  got that far. Length is always `MAX_TRACKED_DEED`, so the memo's table has a
   *  cell for every N whether or not it was reached. */
  dayOfNthDeed: (number | null)[];
  deedsByDay30: number;
  deedsPer100Days: number;
}

export function deedPacing(daily: readonly CampaignDayStats[]): DeedPacing {
  const dayOfNthDeed: (number | null)[] = new Array<number | null>(MAX_TRACKED_DEED).fill(null);
  let earned = 0;
  let deedsByDay30 = 0;
  for (const day of daily) {
    for (const _deed of day.deedsEarned) {
      earned += 1;
      if (earned <= MAX_TRACKED_DEED) dayOfNthDeed[earned - 1] = day.day;
      if (day.day <= 30) deedsByDay30 += 1;
    }
  }
  const days = daily.length;
  return {
    dayOfNthDeed,
    deedsByDay30,
    deedsPer100Days: days === 0 ? 0 : (earned / days) * 100,
  };
}

// ---------------------------------------------------------------------------
// Per-run summary
// ---------------------------------------------------------------------------

/**
 * One sweep row: everything the memo needs from a single `runCampaign`, plus the
 * RAW encounter and route records. The records are carried rather than pre-bucketed
 * on purpose — T-1603b/T-1603c can re-cut the same rows (a different parity split,
 * a per-cargo-type route table) without paying for another sweep.
 */
export interface SeedRow {
  seed: number;
  policy: SimPolicyName;
  days: number;
  finalCredits: number;
  finalDebt: number;
  /** First day the debt reached zero, or null if it never did in the horizon. */
  debtClearedDay: number | null;
  /** The day-30 branch (`TourOneResolved.outcome`), null if the horizon is short. */
  tourOneOutcome: 'cleared' | 'unpaid' | null;
  /** Debt still owed at the day-30 resolution; null when it never resolved. */
  tourOneDebtOutstanding: number | null;
  deedCount: number;
  deedPacing: DeedPacing;
  renownRank: string;
  fuelStarvationDays: number;
  /** `topShare` of the FIRST route-diversity window (days 1..100) — the window the
   *  Tour One arm actually covers. Null when the run produced no window. */
  routeDiversityTopShare: number | null;
  shipsLost: number;
  combatDefeats: number;
  lifeSupportFailures: number;
  lifeSupportScares: number;
  successions: number;
  combat: CombatEncounterRecord[];
  routes: RouteLegRecord[];
}

export function summarizeReport(report: CampaignStatsReport): SeedRow {
  return {
    seed: report.seed,
    policy: report.policy,
    days: report.days,
    finalCredits: report.finalState.credits,
    finalDebt: report.finalState.debt,
    debtClearedDay: report.debtClearedDay,
    tourOneOutcome: report.tourOne?.outcome ?? null,
    tourOneDebtOutstanding: report.tourOne?.debtOutstanding ?? null,
    deedCount: report.deedCount,
    deedPacing: deedPacing(report.daily),
    renownRank: report.renownRank,
    fuelStarvationDays: report.fuelStarvationDays,
    routeDiversityTopShare: report.routeDiversity[0]?.topShare ?? null,
    shipsLost: report.survival.shipsLost,
    combatDefeats: report.survival.combatDefeats,
    lifeSupportFailures: report.survival.lifeSupportFailures,
    lifeSupportScares: report.survival.lifeSupportScares,
    successions: report.survival.successions,
    combat: report.combatEncounters,
    routes: report.routeLegs,
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/** One cell of the parity × preparation table — the memo's combat target. */
export interface CombatCell {
  parity: TierParityBucket;
  prepared: boolean;
  n: number;
  ev: Distribution;
  rounds: Distribution;
  winRate: number;
  shipLostRate: number;
  travelCompletedRate: number;
  /** Diagnostic: the contaminated purse delta, reported beside the attributed EV
   *  so the memo can show how much of it is unrelated income. */
  purseDelta: Distribution;
}

export interface RouteAggregate {
  route: string;
  originSystem: number;
  destination: number;
  legs: number;
  delivered: number;
  evPerDay: Distribution;
  payment: Distribution;
  /** `paidPayment - quotedPayment` on delivered legs — the T-1202 margin-scaling
   *  delta. A non-zero median here is the scaling working, not a defect. */
  marginDelta: Distribution;
}

export interface SurvivalAggregate {
  shipsLost: number;
  combatDefeats: number;
  lifeSupportFailures: number;
  lifeSupportScares: number;
  successions: number;
  simDays: number;
  deathsPer1000Days: number;
  /** Share of RUNS that lost at least one ship. */
  runsWithDeathRate: number;
}

export interface PolicyAggregate {
  /** 'fleet' for the union row, otherwise the policy name. */
  policy: string;
  runs: number;
  simDays: number;
  // --- Tour One clear day -------------------------------------------------
  tourOneResolvedRuns: number;
  tourOneClearRate: number;
  /** Over runs that ever cleared the debt inside the horizon. */
  debtClearedDay: Distribution;
  debtClearedRate: number;
  tourOneDebtOutstanding: Distribution;
  finalCredits: Distribution;
  fuelStarvationDays: Distribution;
  // --- Deed pacing --------------------------------------------------------
  deedCount: Distribution;
  deedsByDay30: Distribution;
  deedsPer100Days: Distribution;
  /** Index i is the distribution of the day the (i+1)-th deed landed, over the
   *  runs that reached it; `n` therefore doubles as the reach count. */
  dayOfNthDeed: Distribution[];
  renownRanks: Record<string, number>;
  // --- Combat -------------------------------------------------------------
  encounters: number;
  encountersPerRun: number;
  combatCells: CombatCell[];
  combatEvAll: Distribution;
  // --- Routes -------------------------------------------------------------
  routeLegs: number;
  routesDelivered: number;
  routesLost: number;
  routesOpenAtEnd: number;
  routeEvPerDay: Distribution;
  routeMarginDelta: Distribution;
  distinctRoutes: number;
  /** Share of delivered legs flown on the single most-used route — the memo's
   *  "dominant route" number (T-1603b's target). */
  topRouteShare: number;
  topRoutes: RouteAggregate[];
  routeDiversityTopShare: Distribution;
  // --- Survival -----------------------------------------------------------
  survival: SurvivalAggregate;
}

export interface BaselineAggregate {
  label: string;
  policies: string[];
  seeds: number;
  days: number;
  runs: number;
  fleet: PolicyAggregate;
  byPolicy: PolicyAggregate[];
}

const PARITIES: readonly TierParityBucket[] = ['below', 'even', 'above'];

function combatCellsFor(records: readonly CombatEncounterRecord[]): CombatCell[] {
  const cells: CombatCell[] = [];
  for (const parity of PARITIES) {
    for (const prepared of [false, true]) {
      const cell = records.filter(
        (record) =>
          tierParityBucket(record.playerTier, record.interceptorTier) === parity &&
          record.prepared === prepared,
      );
      cells.push({
        parity,
        prepared,
        n: cell.length,
        ev: distribution(cell.map(combatEv)),
        rounds: distribution(cell.map((record) => record.rounds)),
        winRate: share(cell.filter(isCombatWin).length, cell.length),
        shipLostRate: share(cell.filter((record) => record.shipLost).length, cell.length),
        travelCompletedRate: share(
          cell.filter((record) => record.travelCompleted).length,
          cell.length,
        ),
        purseDelta: distribution(cell.map((record) => record.creditsDelta)),
      });
    }
  }
  return cells;
}

function routeAggregatesFor(legs: readonly RouteLegRecord[]): RouteAggregate[] {
  const byRoute = new Map<string, RouteLegRecord[]>();
  for (const leg of legs) {
    const key = routeKey(leg);
    const bucket = byRoute.get(key);
    if (bucket) bucket.push(leg);
    else byRoute.set(key, [leg]);
  }
  const aggregates: RouteAggregate[] = [];
  for (const [route, bucket] of byRoute) {
    const delivered = bucket.filter((leg) => leg.outcome === 'delivered');
    aggregates.push({
      route,
      originSystem: bucket[0]?.originSystem ?? -1,
      destination: bucket[0]?.destination ?? -1,
      legs: bucket.length,
      delivered: delivered.length,
      evPerDay: distribution(
        delivered.map(routeEv).filter((value): value is number => value !== null),
      ),
      payment: distribution(delivered.map((leg) => leg.paidPayment ?? 0)),
      marginDelta: distribution(delivered.map((leg) => (leg.paidPayment ?? 0) - leg.quotedPayment)),
    });
  }
  // Deterministic order: most-flown first, ties broken by route key so a rerun
  // that shuffles nothing still prints an identical table.
  aggregates.sort((a, b) => b.legs - a.legs || a.route.localeCompare(b.route));
  return aggregates;
}

/** Fold a set of rows into one aggregate. `policy` is the label the row carries
 *  ('fleet' for the union). */
export function aggregateRows(policy: string, rows: readonly SeedRow[]): PolicyAggregate {
  const combat = rows.flatMap((row) => row.combat);
  const legs = rows.flatMap((row) => row.routes);
  const delivered = legs.filter((leg) => leg.outcome === 'delivered');
  const routes = routeAggregatesFor(legs);
  const simDays = rows.reduce((total, row) => total + row.days, 0);

  const renownRanks: Record<string, number> = {};
  for (const row of rows) {
    renownRanks[row.renownRank] = (renownRanks[row.renownRank] ?? 0) + 1;
  }

  const dayOfNthDeed: Distribution[] = [];
  for (let index = 0; index < MAX_TRACKED_DEED; index += 1) {
    dayOfNthDeed.push(
      distribution(
        rows
          .map((row) => row.deedPacing.dayOfNthDeed[index] ?? null)
          .filter((value): value is number => value !== null),
      ),
    );
  }

  const resolvedRuns = rows.filter((row) => row.tourOneOutcome !== null);
  const shipsLost = rows.reduce((total, row) => total + row.shipsLost, 0);

  return {
    policy,
    runs: rows.length,
    simDays,
    tourOneResolvedRuns: resolvedRuns.length,
    tourOneClearRate: share(
      resolvedRuns.filter((row) => row.tourOneOutcome === 'cleared').length,
      resolvedRuns.length,
    ),
    debtClearedDay: distribution(
      rows
        .map((row) => row.debtClearedDay)
        .filter((value): value is number => value !== null && value > 0),
    ),
    debtClearedRate: share(rows.filter((row) => row.debtClearedDay !== null).length, rows.length),
    tourOneDebtOutstanding: distribution(
      resolvedRuns
        .filter((row) => row.tourOneOutcome === 'unpaid')
        .map((row) => row.tourOneDebtOutstanding ?? 0),
    ),
    finalCredits: distribution(rows.map((row) => row.finalCredits)),
    fuelStarvationDays: distribution(rows.map((row) => row.fuelStarvationDays)),
    deedCount: distribution(rows.map((row) => row.deedCount)),
    deedsByDay30: distribution(rows.map((row) => row.deedPacing.deedsByDay30)),
    deedsPer100Days: distribution(rows.map((row) => row.deedPacing.deedsPer100Days)),
    dayOfNthDeed,
    renownRanks,
    encounters: combat.length,
    encountersPerRun: rows.length === 0 ? 0 : combat.length / rows.length,
    combatCells: combatCellsFor(combat),
    combatEvAll: distribution(combat.map(combatEv)),
    routeLegs: legs.length,
    routesDelivered: delivered.length,
    routesLost: legs.filter((leg) => leg.outcome === 'lost').length,
    routesOpenAtEnd: legs.filter((leg) => leg.outcome === 'open-at-end').length,
    routeEvPerDay: distribution(
      delivered.map(routeEv).filter((value): value is number => value !== null),
    ),
    routeMarginDelta: distribution(
      delivered.map((leg) => (leg.paidPayment ?? 0) - leg.quotedPayment),
    ),
    distinctRoutes: routes.length,
    topRouteShare: share(routes[0]?.legs ?? 0, legs.length),
    topRoutes: routes.slice(0, 5),
    routeDiversityTopShare: distribution(
      rows
        .map((row) => row.routeDiversityTopShare)
        .filter((value): value is number => value !== null),
    ),
    survival: {
      shipsLost,
      combatDefeats: rows.reduce((total, row) => total + row.combatDefeats, 0),
      lifeSupportFailures: rows.reduce((total, row) => total + row.lifeSupportFailures, 0),
      lifeSupportScares: rows.reduce((total, row) => total + row.lifeSupportScares, 0),
      successions: rows.reduce((total, row) => total + row.successions, 0),
      simDays,
      deathsPer1000Days: simDays === 0 ? 0 : (shipsLost / simDays) * 1000,
      runsWithDeathRate: share(rows.filter((row) => row.shipsLost > 0).length, rows.length),
    },
  };
}

/** The whole memo's numbers: the fleet union plus one block per policy. Policy
 *  order is the order they first appear in `rows`, so a sweep's `--policies` order
 *  is the memo's column order. */
export function aggregate(label: string, rows: readonly SeedRow[]): BaselineAggregate {
  const policies: string[] = [];
  for (const row of rows) {
    if (!policies.includes(row.policy)) policies.push(row.policy);
  }
  const seeds = new Set(rows.map((row) => row.seed)).size;
  return {
    label,
    policies,
    seeds,
    days: rows[0]?.days ?? 0,
    runs: rows.length,
    fleet: aggregateRows('fleet', rows),
    byPolicy: policies.map((policy) =>
      aggregateRows(
        policy,
        rows.filter((row) => row.policy === policy),
      ),
    ),
  };
}
