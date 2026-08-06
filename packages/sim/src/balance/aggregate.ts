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
  DispositionStats,
  HangoutPlayStats,
  MilestoneSample,
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
 * THE combat-EV definition: what the encounter PAID minus what it COST.
 *
 * R2c CHANGED THE SIGN CONVENTION, deliberately. This used to read `-combatCost(...)`
 * and its comment said the value was "negative-or-zero by construction: the engine
 * pays nothing for winning a fight". That was true and it was the defect — an
 * archetype whose whole strategy is combat could never be solvent, which only
 * stayed invisible while a trade-in bug was handing out free ship components (see
 * `YARD_COMPONENT_TRADE_IN`). Now a destroyed interceptor yields salvage, so the
 * payout side is real and this function reports a genuine EV that CAN be positive.
 *
 * A consequence worth stating for anyone diffing baselines across R2c: every
 * `combatEv` figure recorded before R2c is a negated cost, not an EV, and the two
 * are not comparable on a cell where salvage was earned.
 */
export function combatEv(record: CombatEncounterRecord): number {
  return record.salvageCredits - combatCost(record);
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
  /** N10 · Offers the cast took off this run's live board (`ContractClaimed`). */
  contractClaims: number;
  /** N11 · Rank-gated special equipment the simulated field bought over this run —
   *  the one row that says whether the Renown gate T-021 opened is being walked
   *  through. Carried straight off the report; no re-derivation here. */
  npcSpecialEquipmentPurchases: number;
  /** N12/T-030 · Port stakes the player holds at the horizon. Carried straight off
   *  the report; no re-derivation here. */
  portsOwned: number;
  /**
   * T-173 · `CampaignStatsReport.hangoutPlay`, carried WHOLE off the report — no
   * re-derivation here, the same discipline as `contractClaims` and `portsOwned`
   * above.
   *
   * WHY IT IS ON THE ROW AT ALL: until T-173 the sweep's rows could not answer a
   * single Hangout question, so every Hangout measurement since T-125 descended
   * from a gitignored `.scratch/` probe (BR-13). The block is carried whole rather
   * than flattened into a handful of columns for the reason the file header gives:
   * a row is raw material, and a later re-cut must not have to pay for another
   * sweep.
   */
  hangout: HangoutPlayStats;
  /** T-173 · `CampaignStatsReport.disposition`, same discipline, same reason. */
  disposition: DispositionStats;
  /** N10 · The dawn board's DEPTH across the run — one entry per day, so the
   *  aggregate can report percentiles rather than a mean that hides a dark port. */
  boardDepths: number[];
  combat: CombatEncounterRecord[];
  routes: RouteLegRecord[];
  /** N7 · Carried from the report when the sweep asked for milestone days. */
  milestones?: MilestoneSample[];
  /** N7 · Carried from the report when the career started from a SYNTHESIZED
   *  state. {@link aggregate} refuses to fold a row that carries it — see the
   *  throw there for why that guard is the honest caveat made structural. */
  syntheticStart?: true;
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
    contractClaims: report.contractClaims,
    npcSpecialEquipmentPurchases: report.npcSpecialEquipmentPurchases,
    portsOwned: report.portsOwned,
    hangout: report.hangoutPlay,
    disposition: report.disposition,
    boardDepths: report.daily.map((day) => day.boardDepth),
    combat: report.combatEncounters,
    routes: report.routeLegs,
    ...(report.milestones === undefined ? {} : { milestones: report.milestones }),
    ...(report.syntheticStart === undefined ? {} : { syntheticStart: true as const }),
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

/**
 * T-173 · THE INTERCEPTOR DRAW, rolled up — the five columns
 * `docs/HANGOUT_REDESIGN.md` §11.3's table reports, computed here from the raw
 * fields `CombatEncounterRecord` now carries.
 *
 * WHY IT IS AN AGGREGATE AND NOT LEFT TO THE READER: the raw rows live only in a
 * sweep's `--out` directory, which is gitignored; the AGGREGATE is the artefact
 * that gets committed. Without these five numbers the next Hangout/disposition
 * question would again have to be answered by a throwaway probe — which is the
 * exact history this task closes (T-125, T-137, T-148, T-150, four probes).
 *
 * NOTHING HERE RESTATES A RULE. `chooseWeighted`'s grudge weight function is
 * deliberately NOT duplicated: every figure below is arithmetic over the recorded
 * pool, and a future re-cut of the weighting reads `namedPoolDispositions` off the
 * rows rather than a number this module baked in.
 */
export interface InterceptorAggregate {
  /** Every recorded encounter open, named and anonymous. Equals
   *  `PolicyAggregate.encounters` — carried anyway so this block is readable on
   *  its own and so a divergence between the two is visible rather than assumed
   *  away. */
  interceptions: number;
  /** Named draws / interceptions. The engine's own gate is `rng.next() < 0.25`
   *  applied only when the named pool is non-empty, so this is the 0.25 constant
   *  MEASURED rather than asserted. */
  namedShare: number;
  /** Named draws whose every pool candidate sat at exactly 0 — draws where
   *  disposition, however weighted, changed nothing. §11.3's "inertness". */
  inertShare: number;
  /** Named draws whose CHOSEN captain sat below 0: the player was hunted by
   *  someone they had wronged. */
  chosenWrongedShare: number;
  /**
   * The ANALYTIC uniform counterfactual for `chosenWrongedShare`: over named
   * draws, the mean of (candidates below 0) / (pool size). It is the share a
   * grudge-BLIND uniform pick would have produced from the very same pools, so
   * `chosenWrongedShare / uniformWrongedShare` is the grudge lift.
   *
   * SUMMED, NEVER RE-ROLLED — the probe's own discipline, kept: a second rng pass
   * would add sampling noise to a quantity that has a closed form.
   */
  uniformWrongedShare: number;
  /** Named draws whose pool could not be reconstructed
   *  (`namedPoolReconstructed === false`). **A NON-ZERO IS A FINDING TO FILE**, not
   *  a number to widen a band around: it means the draw came from
   *  `selectEncounterInterceptor`'s band-widening branch and the four shares above
   *  are computed over a smaller sample than `namedShare` implies. */
  reconstructionMisses: number;
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
  // --- Contract competition (N10) -----------------------------------------
  /** Offers the cast took off players' live boards, summed over the row. */
  contractClaims: number;
  contractClaimsPerRun: number;
  /**
   * The dawn board's depth, pooled over every day of every run in the row. The
   * PERCENTILES are the point and a mean would defeat it: competition shows up as
   * the bottom of this distribution moving (p10 dropping from 4 to 1) long before
   * the median does, and this step's Disproves — "boards empty" — is a statement
   * about that tail.
   */
  boardDepth: Distribution;
  // --- Renown gate (N11) ---------------------------------------------------
  /**
   * Rank-gated special equipment the simulated field bought, summed over the row,
   * and the same figure per run. T-021 made the gate REACHABLE; this is the field
   * that says whether it is being reached, and a zero is a finding about
   * reachability rather than an empty cell.
   *
   * The per-run form is the one a diff should read: the raw sum scales with the
   * number of seeds in the row, so comparing two sweeps of different width on it
   * would compare sample sizes.
   */
  npcSpecialEquipmentPurchases: number;
  npcSpecialEquipmentPurchasesPerRun: number;
  // --- Port ownership (N12/T-030) ------------------------------------------
  /**
   * Port stakes the PLAYER held at the horizon, pooled over every run in the row.
   * The first ASSET this aggregate has ever been able to see — N9 measured the
   * port arm as the game's biggest lever and the instrument could not count a
   * single stake.
   */
  portsOwned: Distribution;
  /**
   * Share of runs that ended holding at least one stake — and this, not the
   * median, is the readable figure today. Ports are dear enough that most policies
   * end at zero, so `portsOwned.median` is 0 for a row where a quarter of the runs
   * bought one; N9 additionally recorded ports as structurally unreachable for the
   * explorer and the veteran, so a 0 here is a finding about REACHABILITY rather
   * than an empty cell.
   *
   * It is also the figure N12's two Disproves limbs are statements about — "ports
   * stay a player monopoly de facto" and "a day-N land grab locks the player out"
   * are both claims about how many careers hold a stake, not about how many stakes
   * the median career holds.
   */
  portOwnershipRate: number;
  // --- Combat -------------------------------------------------------------
  encounters: number;
  encountersPerRun: number;
  combatCells: CombatCell[];
  combatEvAll: Distribution;
  /** T-173 · Who answered the jump, and what standing they held — see
   *  {@link InterceptorAggregate}. */
  interceptor: InterceptorAggregate;
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
  // --- N7 milestone harvest ------------------------------------------------
  /** Present only when the sweep ran with `--milestone-days`. See
   *  {@link MilestoneAggregate}. */
  milestones?: MilestoneAggregate[];
}

/**
 * N7 · The progression spread of the 31 captains at one milestone day, pooled
 * across every run in the row. This is what turns a smoke fixture's tier seeding
 * from a guess into a measurement: `checkpoints.ts` reads these distributions and
 * `synthesize.ts` lays them back down across the roster.
 *
 * Absent from every aggregate produced before N7 and from any sweep run without
 * `--milestone-days`, which is why the field is optional on `PolicyAggregate` —
 * and why the differ reports a path present on one side only rather than
 * pretending the two aggregates are the same measurement.
 */
export interface MilestoneAggregate {
  day: number;
  /** Runs that reached this day. A horizon shorter than `day` yields 0. */
  runs: number;
  playerCredits: Distribution;
  playerDebt: Distribution;
  playerFuel: Distribution;
  playerTier: Distribution;
  playerDeedCount: Distribution;
  /** `max(weapons, hull, shields)` — the fit `computePlayerTier` reads. */
  playerShipRating: Distribution;
  playerWeaponsStrength: Distribution;
  playerHullStrength: Distribution;
  playerShieldsStrength: Distribution;
  playerDrivesStrength: Distribution;
  playerCargoPods: Distribution;
  playerCrew: Distribution;
  /** N12/T-030 · Port stakes the player held AT THIS DAY. The by-day series N12's
   *  hand-off explicitly asks for ("measure port-ownership counts by DAY from the
   *  first sweep, not just at day 120") on the player's side, against which the
   *  cast's `npcPortCount` below is read. */
  playerPorts: Distribution;
  /** Pooled over every NPC of every run: 30 × runs samples. THE field spread. */
  npcCredits: Distribution;
  npcHullStrength: Distribution;
  npcFuel: Distribution;
  /** N11 · Deeds earned per captain, pooled the same way: 30 × runs samples. */
  npcDeedCount: Distribution;
  /**
   * N12/T-030 · Port stakes per captain at this milestone day, pooled the same
   * way: 30 × runs samples. THE by-day cast-side series N12's hand-off asks for —
   * the land-grab limb ("a day-N land grab locks the player out before Tour One
   * resolves") is a claim about day 30 against day 120, which only a per-day
   * measurement can answer.
   *
   * Reads all zeroes until N12 proper gives `NpcState` a `ports` field; see
   * `MilestoneSample.npcPortCount` for why the empty measurement is the honest one
   * and why it ships a step early.
   */
  npcPortCount: Distribution;
  /**
   * T-173 · Standing per captain at this milestone day, pooled the same way:
   * 30 × runs samples. The BY-DAY disposition spread — the thing the run-level
   * `SeedRow.disposition` totals cannot say, because a total cannot distinguish
   * "the cast never held a standing" from "every standing had decayed by day 30".
   *
   * Every entry is 0 at day 1 by construction, so a day-1 milestone doubles as the
   * neutrality check the T-125 probe had to assert for itself.
   */
  npcDisposition: Distribution;
  /**
   * T-173 · Share of the same samples sitting at a NON-ZERO standing. The
   * readable figure for this day, and the reason it sits beside the distribution
   * rather than being left to a reader: standings are rare and short-lived
   * (`docs/HANGOUT_REDESIGN.md` §11.3 measured the cast at exactly 0 on 96.52% of
   * live captain-days), so `npcDisposition.median` is 0 for a day on which a
   * quarter of the cast holds a grudge — the same argument
   * `PolicyAggregate.portOwnershipRate` makes about stakes.
   */
  npcNonzeroDispositionShare: number;
  /**
   * N11 · THE CAST'S RANK DISTRIBUTION at this milestone day — a HISTOGRAM, not a
   * `Distribution`, because a rank is categorical and a median over an eight-rung
   * ladder's indices would be a fiction dressed as a measurement.
   *
   * Deliberately the same shape as `PolicyAggregate.renownRanks`, which is the
   * PLAYER's: the two side by side are what makes T-023's renown-inflation limb —
   * "does the median captain outrank a competent player?" — answerable off a single
   * artefact instead of two sweeps.
   *
   * Keys sum to `NPC_PROFILES.length × runs`; every key is a content rank id.
   */
  npcRenownRanks: Record<string, number>;
}

function milestoneAggregatesFor(rows: readonly SeedRow[]): MilestoneAggregate[] | undefined {
  const byDay = new Map<number, MilestoneSample[]>();
  for (const row of rows) {
    for (const sample of row.milestones ?? []) {
      const bucket = byDay.get(sample.day);
      if (bucket) bucket.push(sample);
      else byDay.set(sample.day, [sample]);
    }
  }
  if (byDay.size === 0) return undefined;
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, samples]) => {
      // T-173 · Pooled once and read twice (the distribution and the non-zero
      // share are one measurement in two shapes). `?? []` for the same reason
      // `interceptorAggregateFor` guards its reads: `--merge` folds row files off
      // disk, and a shard written before T-173 carries milestone samples with no
      // `npcDisposition` — an empty pool must aggregate to `n: 0`, never throw
      // halfway through a merge.
      const standings = samples.flatMap((sample) => sample.npcDisposition ?? []);
      return {
        day,
        runs: samples.length,
        playerCredits: distribution(samples.map((sample) => sample.player.credits)),
        playerDebt: distribution(samples.map((sample) => sample.player.debt)),
        playerFuel: distribution(samples.map((sample) => sample.player.fuel)),
        playerTier: distribution(samples.map((sample) => sample.player.tier)),
        playerDeedCount: distribution(samples.map((sample) => sample.player.deedCount)),
        playerShipRating: distribution(samples.map((sample) => sample.player.shipRating)),
        playerWeaponsStrength: distribution(samples.map((sample) => sample.player.weaponsStrength)),
        playerHullStrength: distribution(samples.map((sample) => sample.player.hullStrength)),
        playerShieldsStrength: distribution(samples.map((sample) => sample.player.shieldsStrength)),
        playerDrivesStrength: distribution(samples.map((sample) => sample.player.drivesStrength)),
        playerCargoPods: distribution(samples.map((sample) => sample.player.cargoPods)),
        playerCrew: distribution(samples.map((sample) => sample.player.crew)),
        playerPorts: distribution(samples.map((sample) => sample.player.ports)),
        npcCredits: distribution(samples.flatMap((sample) => sample.npcCredits)),
        npcHullStrength: distribution(samples.flatMap((sample) => sample.npcHullStrength)),
        npcFuel: distribution(samples.flatMap((sample) => sample.npcFuel)),
        npcDeedCount: distribution(samples.flatMap((sample) => sample.npcDeedCount)),
        npcPortCount: distribution(samples.flatMap((sample) => sample.npcPortCount)),
        npcDisposition: distribution(standings),
        npcNonzeroDispositionShare: share(
          standings.filter((standing) => standing !== 0).length,
          standings.length,
        ),
        npcRenownRanks: rankHistogram(samples.flatMap((sample) => sample.npcRenownRank)),
      };
    });
}

/** N11 · Count ranks by name. Built the same way `aggregateRows` builds the
 *  player's `renownRanks`, and kept as a named function rather than inlined
 *  because a categorical count and a `Distribution` must never be mistaken for
 *  each other at a call site. */
function rankHistogram(ranks: readonly string[]): Record<string, number> {
  const histogram: Record<string, number> = {};
  for (const rank of ranks) {
    histogram[rank] = (histogram[rank] ?? 0) + 1;
  }
  return histogram;
}

/**
 * T-183 · WHAT A MERGED AGGREGATE SAYS ABOUT ITSELF: the ruleset it measured, the
 * instrument that measured it, and where in history that tree was.
 *
 * Computed by `./provenance.ts` and passed IN, never computed here — this module is
 * the PURE half (no `fs`, no `process`, no clock, no rng; see the file header) and a
 * fingerprint is a walk of the working tree. The IO half (`./sweep.ts --merge`) owns
 * the reading; this module owns only the SHAPE, which is why the shape lives in the
 * hashed instrument file and the computation does not.
 */
export interface AggregateStamp {
  rulesFingerprint: string;
  instrumentFingerprint: string;
  gitCommit: string;
}

export interface BaselineAggregate {
  label: string;
  /**
   * T-183 · F-142-1, closed. OPTIONAL, and the optionality is load-bearing twice
   * over: every `docs/balance/baseline-*.json` committed BEFORE T-183 carries only
   * the original seven keys and must still type as a `BaselineAggregate`, and
   * `aggregate()` is pure so it cannot mint one unaided. A reader that finds these
   * absent is looking at a pre-T-183 artefact — that is `unknown`, never `same`
   * (`./report-model.ts` `compareRulesets`).
   */
  rulesFingerprint?: string;
  instrumentFingerprint?: string;
  gitCommit?: string;
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

/**
 * T-173 · Fold the interceptor-provenance fields into {@link InterceptorAggregate}.
 *
 * DEFENSIVE ON LEGACY ROWS BY CONSTRUCTION, not by a cast: a row file written
 * before T-173 carries none of the five fields, and `--merge` folds row files off
 * disk. `record.interceptorSource === 'named'` is simply false when the key is
 * absent, and `?? []` covers the pool, so an old shard aggregates to
 * `interceptions > 0` with every share at 0 rather than throwing — visibly empty,
 * which is the honest reading of a sweep that never measured it.
 */
function interceptorAggregateFor(records: readonly CombatEncounterRecord[]): InterceptorAggregate {
  const named = records.filter((record) => record.interceptorSource === 'named');
  let inert = 0;
  let chosenWronged = 0;
  let uniformWrongedExpectation = 0;
  let reconstructionMisses = 0;
  for (const record of named) {
    if (record.namedPoolReconstructed === false) {
      reconstructionMisses += 1;
      continue;
    }
    const pool = record.namedPoolDispositions ?? [];
    if (pool.length === 0) continue;
    if (pool.every((standing) => standing === 0)) inert += 1;
    if ((record.interceptorDisposition ?? 0) < 0) chosenWronged += 1;
    // The closed form of "what a uniform pick would have done with THIS pool".
    uniformWrongedExpectation += pool.filter((standing) => standing < 0).length / pool.length;
  }
  return {
    interceptions: records.length,
    namedShare: share(named.length, records.length),
    inertShare: share(inert, named.length),
    chosenWrongedShare: share(chosenWronged, named.length),
    uniformWrongedShare: share(uniformWrongedExpectation, named.length),
    reconstructionMisses,
  };
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

/**
 * N7 · THE STRUCTURAL FORM OF THE HONEST CAVEAT.
 *
 * A mid-game smoke tier runs against a SYNTHESIZED world — a day-21 state built
 * to look like day 21 rather than played into. That is fine for a breakage
 * detector and it must never grade balance, and this repo already knows that a
 * documented rule is not the same as an enforced one (`poverty-invariant.test.ts`:
 * "the fix would be to re-author a storylet trigger or the map, not to poke
 * state").
 *
 * So the rule is enforced where it can actually be broken. A baseline aggregate
 * is THE artefact that grades balance — the memo tables, the worklist's Results,
 * every before/after in this document are `BaselineAggregate` fields. Folding one
 * synthesized row into one would silently launder a fabricated state into a
 * balance number, so the fold refuses: not a warning, not a filter that drops the
 * row quietly, a THROW naming the offending seed.
 *
 * Filtering was considered and rejected. A silent drop turns "you measured
 * something you may not measure" into "your sample was smaller than you thought",
 * which is the same failure wearing a disguise.
 */
function rejectSyntheticRows(rows: readonly SeedRow[]): void {
  const synthetic = rows.filter((row) => row.syntheticStart === true);
  if (synthetic.length === 0) return;
  const sample = synthetic[0];
  throw new Error(
    `Refusing to aggregate ${synthetic.length} SYNTHESIZED row(s) (first: seed ${sample.seed}, ` +
      `policy ${sample.policy}). A career that began from a fabricated mid-game state is a ` +
      `breakage sample, never a balance measurement — see N7 in ` +
      `docs/NPC_REDESIGN.md and docs/balance/smoke/README.md. The capstone sweep ` +
      `is the only authority on numbers.`,
  );
}

/** Fold a set of rows into one aggregate. `policy` is the label the row carries
 *  ('fleet' for the union). */
export function aggregateRows(policy: string, rows: readonly SeedRow[]): PolicyAggregate {
  rejectSyntheticRows(rows);
  const milestones = milestoneAggregatesFor(rows);
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
  const claims = rows.reduce((total, row) => total + row.contractClaims, 0);
  const gatedPurchases = rows.reduce((total, row) => total + row.npcSpecialEquipmentPurchases, 0);

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
    contractClaims: claims,
    contractClaimsPerRun: rows.length === 0 ? 0 : claims / rows.length,
    boardDepth: distribution(rows.flatMap((row) => row.boardDepths)),
    npcSpecialEquipmentPurchases: gatedPurchases,
    // Guarded exactly as `contractClaimsPerRun` is: an empty row set is 0, never NaN.
    npcSpecialEquipmentPurchasesPerRun: rows.length === 0 ? 0 : gatedPurchases / rows.length,
    portsOwned: distribution(rows.map((row) => row.portsOwned)),
    // Through the shared `share()` so an empty row set answers 0 rather than NaN,
    // exactly as `debtClearedRate` above does.
    portOwnershipRate: share(rows.filter((row) => row.portsOwned > 0).length, rows.length),
    encounters: combat.length,
    encountersPerRun: rows.length === 0 ? 0 : combat.length / rows.length,
    combatCells: combatCellsFor(combat),
    combatEvAll: distribution(combat.map(combatEv)),
    interceptor: interceptorAggregateFor(combat),
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
    ...(milestones === undefined ? {} : { milestones }),
  };
}

/**
 * The whole memo's numbers: the fleet union plus one block per policy. Policy
 * order is the order they first appear in `rows`, so a sweep's `--policies` order
 * is the memo's column order.
 *
 * T-183 · `stamp` is OPTIONAL and is written straight through — see
 * {@link AggregateStamp} for why it is computed by the caller. Omitting it produces
 * a byte-identical object to every pre-T-183 call, which is the machine-checked
 * inertness `../__tests__/aggregate-stamp.test.ts` asserts.
 */
export function aggregate(
  label: string,
  rows: readonly SeedRow[],
  stamp?: AggregateStamp,
): BaselineAggregate {
  const policies: string[] = [];
  for (const row of rows) {
    if (!policies.includes(row.policy)) policies.push(row.policy);
  }
  const seeds = new Set(rows.map((row) => row.seed)).size;
  return {
    label,
    // Spread, not three `?? undefined` assignments: an ABSENT stamp must leave the
    // keys absent, not present-and-undefined. `JSON.stringify` erases the difference
    // but `Object.keys`, `./diff.ts`'s flatten and every shape test do not.
    ...(stamp ?? {}),
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
