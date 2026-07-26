import {
  DARE_MAX_WAGER,
  DARE_MIN_WAGER,
  EXPLORATION_FUEL_COST,
  FENCE_REP_FLAG,
  FLAWS,
  LOAN_MAX_PRINCIPAL,
  LOAN_MIN_PRINCIPAL,
  SPECIAL_EQUIPMENT,
  STAR_SYSTEMS,
  Stat,
  YARD_COMPONENT_TIER_PRICES,
  distance as systemDistance,
  isGatedDestination,
  type RenownRankId,
} from '@spacerquest/content';
import {
  FIGHT_FUEL_COST,
  RUN_FUEL_COST,
  calculateFuelCapacity,
  createInitialState,
  decodedFragmentCount,
  endDay,
  fragmentCount,
  hasAnyUndecoded,
  hasFragment,
  isCarryingIllicit,
  jumpFuelCost,
  navBonus,
  quoteShipyard,
  renownRankIndex,
  startDay,
  travelDc,
  applyPlayerAction,
  weaponVolleyDamage,
  SeededRng,
  type GameEvent,
  type GameState,
  type PlayerAction,
  type ShipComponentId,
  type SpecialEquipmentId,
} from '@spacerquest/engine';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// T-202 · UGT adapter — the pure protocol core (message types, handleMessage,
// legal-actions enumerator, state-summary builder). Transport shell lives in
// ./protocol-stdio.ts. See PROTOCOL.md.
export * from './protocol.js';

export type SimPolicyName =
  | 'idle'
  | 'greedy'
  | 'random'
  | 'trader'
  | 'fighter'
  | 'explorer'
  | 'veteran'
  // T-1601b · the two net-new instruments: the smuggling pillar (contraband
  // supply → patrol scans → Ray's fence) and the Hangout tables (Spacer's Dare).
  | 'smuggler'
  | 'gambler';

export interface RunCampaignOptions {
  seed: number;
  days: number;
  policy: SimPolicyName;
}

export interface CampaignDayStats {
  day: number;
  credits: number;
  debt: number;
  fuel: number;
  systemId: number;
  wireEntries: number;
  flawChecks: number;
  flawOverrides: number;
  deedsEarned: string[];
  deedCount: number;
  renownRank: RenownRankId;
  /** Destination of the best-payment offer on this dawn's manifest board (T-107
   *  route-diversity tracking); null on a completely dark board. */
  bestOfferDestination: number | null;
  /** Number of income-producing actions the policy actually took this day
   *  (T-201): signing a contract, travelling toward a delivery, exploring for
   *  salvage/fragments, or engaging combat (fight/talk) for gain. The
   *  poverty-trap invariant asserts this is never zero for 5 consecutive days —
   *  a competent policy is never stuck with no legal way to make progress. */
  incomeActionCount: number;
  /** T-1601a: the per-day series behind the report-level `fuelStarvationDays`
   *  (T-1004) — true when this dusk ended stranded (`cannotAffordCheapestJump`).
   *  Set from the SAME single call that increments the counter, so the two can
   *  never disagree. READER: `campaign-policies.test.ts` cross-checks
   *  `daily.filter(d => d.fuelStarved).length === report.fuelStarvationDays`,
   *  which is what turns the scalar into an auditable trajectory (a run can now
   *  be asked WHEN it starved, not just how often). */
  fuelStarved: boolean;
}

// ---------------------------------------------------------------------------
// T-1601a (three blocks) / T-1601b (two more) · Policy-behavior metrics. These
// blocks are DERIVED sim report fields, not `GameState` — they are folded out of
// the typed `GameEvent` stream (and, where events cannot say it, out of
// before/after state comparisons) at report time. Nothing is persisted, so
// standing constraint 3's save-migration + round-trip obligation does not apply
// here; the report's JSON survival is covered by the existing byte-identical
// `reportToJson` determinism test.
//
// READERS (constraint 7) for all five: the per-policy assertions in
// `packages/sim/src/__tests__/campaign-policies.test.ts` (T-1601a's three) and
// `packages/sim/src/__tests__/campaign-smuggler-gambler.test.ts` (T-1601b's
// two), plus the CLI JSON that `reportToJson` emits for `npm run sim`.
// ---------------------------------------------------------------------------

/** T-1304 Penny Wise lending, as the trader actually used it over a run. */
export interface LoanUsageStats {
  /** `LoanEvent` kind 'borrowed' — advances actually taken at the desk. */
  loansTaken: number;
  /** Sum of `LoanEvent.principal` over the 'borrowed' events. */
  principalBorrowed: number;
  /** Sum of `LoanEvent.interest` over the per-dusk 'accrued' events — what the
   *  interim `LOAN_DAILY_RATE` × `LOAN_TERM_DAYS` band actually costs in play. */
  interestAccrued: number;
  /** Sum of `LoanEvent.amountPaid` over the 'repaid' events. */
  amountRepaid: number;
  /** 'repaid' events that drove the balance to zero (`cleared === true`). */
  loansCleared: number;
  /** 'defaulted' events — the term ran out unpaid (collection pressure follows). */
  defaults: number;
  /** Days whose DUSK state still carried a live loan. */
  daysWithLoan: number;
}

/** T-111b Signal-fragment flow: what the explorer pulled in and got decoded. */
export interface FragmentStats {
  /** `FragmentAcquired` events over the run (new fragments only — the engine
   *  suppresses duplicate grants). */
  acquired: number;
  /** `FragmentDecoded` events over the run (the Sage of Mizar-9's only output). */
  decoded: number;
  /** `fragmentCount` of the final Nemesis file. */
  heldAtEnd: number;
  /** `decodedFragmentCount` of the final Nemesis file. */
  decodedAtEnd: number;
}

/** T-1205/T-1206 ship fit, as BEHAVIOR rather than as a purchase receipt: what
 *  the policy bought AND what the fit then did in the fights it took. */
export interface EquipmentUseStats {
  /** `ShipyardEvent` action 'buy-special-equipment', in purchase order. */
  specialEquipmentBought: SpecialEquipmentId[];
  /** `ShipyardEvent` action 'buy-component-tier' count. */
  componentTiersBought: number;
  /** Winning fight rounds landed while the gun was BETTER than the junker's
   *  (`weaponVolleyDamage > 1` measured on the pre-action ship). Proves the
   *  T-1205/T-1206 weapon fit was load-bearing on a real volley, not merely
   *  purchased — events alone cannot say it, so this is measured per action. */
  upgradedVolleys: number;
  /** Sum of `ComponentDamaged.mitigated` — condition points the shields (or a
   *  fitted ARCH_ANGEL floor) absorbed off incoming fire. */
  shieldAbsorbedPoints: number;
  /** Dusks on which a fitted AUTO_REPAIR module actually restored condition.
   *  The module emits only prose, so this is a state comparison across `endDay`
   *  over the SAME seven non-hull components the engine reader repairs (mirrors
   *  `AUTO_REPAIR_COMPONENTS` in engine/src/components.ts — hull excluded there,
   *  hull excluded here; see AUTO_REPAIR_SIM_COMPONENTS below). */
  autoRepairDusks: number;
}

/**
 * T-1601b · The smuggling pillar as the smuggler actually ran it — supply
 * (contraband contracts + derelict pods), enforcement (patrol GUILE scans, PRD
 * §7.2) and the fence out (Smuggler Ray, PRD §7.5). Every field is a fold over
 * already-typed events except the two dusk-state counters, which no event can
 * say (carrying illicit cargo and holding the fence rep are STATE, not beats).
 * READER: the smuggler assertions in `campaign-smuggler-gambler.test.ts` and the
 * `npm run sim` CLI JSON.
 */
export interface SmugglingStats {
  /** `TradeEvent` action 'sign-contract' with `cargoType === 10` — the pillar's
   *  contract-side supply (only a port with `allowsContraband` issues one). */
  contrabandContractsSigned: number;
  /** `TradeEvent` action 'deliver-cargo' with `cargoType === 10` — runs that got
   *  past the patrols and paid out. */
  contrabandDelivered: number;
  /** `ContrabandScan` events — patrol interdictions that actually boarded an
   *  illicit hold (the engine draws no die unless PATROL && isCarryingIllicit). */
  scans: number;
  /** ...of which the patrol's GUILE check beat the player's concealment. */
  scansCaught: number;
  /** ...of which it did not. `scansCaught + scansEvaded === scans` by construction. */
  scansEvaded: number;
  /** Sum of `ContrabandConfiscated.fine` — CONTRABAND_FINE clamped to the purse. */
  finesPaid: number;
  /** `ContrabandConfiscated.confiscatedContract` — a voided contraband run. */
  contractsConfiscated: number;
  /** `ContrabandConfiscated.confiscatedPod` — a seized sealed pod. */
  podsConfiscated: number;
  /** `StoryletChoiceResolved` on `derelict.sealed-pod` / choice `take` — the pod
   *  supply line the Explore loot roll arms. */
  podsTaken: number;
  /** `StoryletChoiceResolved` on a `fence.ray.*` storylet's SELL choice — the
   *  §7.5 third out. Both fence storylets are `repeat: 'never'`, so this is
   *  bounded at 2 per career by content, not by the policy. */
  fenceSales: number;
  /** Days whose DUSK state still carried illicit cargo (`isCarryingIllicit`) —
   *  the exposure window the scan rolls against. */
  daysCarryingIllicit: number;
  /** Days whose DUSK state carried Ray's fence rep (`FENCE_REP_FLAG`). The flag's
   *  downstream reader is the scan DC itself (CONTRABAND_FENCE_REP_SCAN_PENALTY),
   *  so fencing EARLY raises the caught rate for the rest of the career. */
  fenceRepDays: number;
}

/**
 * T-1601b · The Spacers Hangout as the gambler actually played it (PRD §7.5's
 * first out; the Spacer's Dare of PRD §6/§7.3). Pure fold over `HangoutEvent`.
 * READER: the gambler assertions in `campaign-smuggler-gambler.test.ts` and the
 * `npm run sim` CLI JSON.
 */
export interface HangoutPlayStats {
  /** Social `HangoutEvent`s that actually resolved (no `failReason`). */
  visits: number;
  /** ...of which were Dares. */
  dares: number;
  /** Dares the player took (`playerWon === true`). */
  daresWon: number;
  /** Dares the dealer took. `daresWon + daresLost === dares`. */
  daresLost: number;
  /** Sum of `HangoutEvent.wager` — total stake across the run. Note the engine
   *  clamps every stake to [DARE_MIN_WAGER, DARE_MAX_WAGER] AND down to what the
   *  DEALER can cover, so a broke dealer shows up here as a thin wager. */
  wagered: number;
  /** Sum of `HangoutEvent.creditsDelta` — the tables' net effect on the purse. */
  netCredits: number;
  /** THE acceptance metric: `netCredits / dares` (0 when no dare was played). */
  expectedValuePerDare: number;
  /** meet / befriend / insult beats — the non-wagered social venues. */
  socialBeats: number;
  /** `HangoutEvent`s carrying a `failReason`. A policy whose preconditions mirror
   *  the engine's gates never burns a die on a typed refusal, so this must be 0 —
   *  it is the proof that `planDare`'s guards are the engine's guards. */
  failedVisits: number;
}

/** Route-diversity measure over a fixed window of days: how dominant the single
 *  most-frequent best-offer destination was (T-107 sim assertion). A healthy,
 *  churning economy keeps topShare well under 1 — no route stays optimal. */
export interface RouteDiversityWindow {
  windowIndex: number;
  startDay: number;
  endDay: number;
  topDestination: number | null;
  topShare: number;
  sampleCount: number;
}

export interface CampaignStatsReport {
  seed: number;
  days: number;
  policy: SimPolicyName;
  creditsCurve: number[];
  debtClearedDay: number | null;
  /** Days the player ended stranded: even after spending every credit on fuel
   *  they could not afford the cheapest available jump (T-1004). Supersedes the
   *  old `fuel === 0` count, which never fired in 6,000 simulated days. */
  fuelStarvationDays: number;
  flawOverrideRate: number;
  wireVolume: number;
  deedCount: number;
  deedsEarned: string[];
  renownRank: RenownRankId;
  /** Per-100-day route-diversity windows (T-107). */
  routeDiversity: RouteDiversityWindow[];
  /** T-1601a policy-behavior metrics — see the interfaces above for readers. */
  loanUsage: LoanUsageStats;
  fragments: FragmentStats;
  equipmentUse: EquipmentUseStats;
  /** T-1601b policy-behavior metrics — see the interfaces above for readers. */
  smuggling: SmugglingStats;
  hangoutPlay: HangoutPlayStats;
  finalState: {
    day: number;
    credits: number;
    debt: number;
    fuel: number;
    systemId: number;
  };
  daily: CampaignDayStats[];
}

export type SimPolicy = (context: {
  state: GameState;
  dayIndex: number;
  rng: SeededRng;
}) => PlayerAction[];

type ResolvedPolicy = {
  name: SimPolicyName;
  policy: SimPolicy;
  /** When true, the policy is invoked on the DAWN state (board not yet
   *  generated), exactly as the original three naive policies were — preserving
   *  their byte-for-byte behavior. The competent T-201 policies set this false:
   *  they are invoked on the freshly generated day state so they can read the
   *  live manifest board and dawn hand and actually plan (route/fuel/upgrade). */
  dawnBlind: boolean;
};

type CliResult = RunCampaignOptions | { help: true };

// `satisfies` (not just the annotation) so a name added to `SimPolicyName` but
// forgotten here — or misspelled here — is a compile error rather than a policy
// the CLI silently refuses.
const POLICY_NAMES = [
  'idle',
  'greedy',
  'random',
  'trader',
  'fighter',
  'explorer',
  'veteran',
  'smuggler',
  'gambler',
] as const satisfies readonly SimPolicyName[];

function isSimPolicyName(value: string): value is SimPolicyName {
  return (POLICY_NAMES as readonly string[]).includes(value);
}

export function systemIds(): number[] {
  return Object.keys(STAR_SYSTEMS)
    .map((id) => Number.parseInt(id, 10))
    .filter((id) => Number.isInteger(id))
    .sort((a, b) => a - b);
}

/** The systems a policy is allowed to name as a travel target — every system
 *  except the T-1101 gated ones (Andromeda / special), which the engine's
 *  destination gate refuses. A picker that targeted a sealed system would burn a
 *  die on an ActionBlocked and, cycling, could stall the default policy. */
export function travelableSystemIds(): number[] {
  return systemIds().filter((id) => !isGatedDestination(id));
}

/** T-1601a: the systems that actually host a Spacers Hangout — the only places
 *  the Penny Wise desk (borrow/repay) is legal, per the engine's `hasHangout`
 *  gate in day.ts. DERIVED from content (`STAR_SYSTEMS[...].hasHangout`), never a
 *  hard-coded id: today Sun-3 is the only one, and a policy that hard-coded `1`
 *  would silently stop finding the desk the moment content flags a second. */
export function hangoutSystemIds(): number[] {
  return systemIds().filter((id) => STAR_SYSTEMS[id]?.hasHangout === true);
}

/** Membership test over `hangoutSystemIds()` — the single derivation both the
 *  policies (borrow/repay preconditions, head-home routing) and any external
 *  caller share, so there is one definition of "where the desk is". */
function isHangoutSystem(systemId: number): boolean {
  return hangoutSystemIds().includes(systemId);
}

export function nextSystemId(currentSystemId: number): number {
  const ids = travelableSystemIds();
  const currentIndex = ids.indexOf(currentSystemId);

  if (currentIndex === -1) {
    return ids[0] ?? currentSystemId;
  }

  return ids[(currentIndex + 1) % ids.length] ?? currentSystemId;
}

function fuelPrice(state: GameState): number {
  return state.market.localFuelPrice || 5;
}

function affordableFuelAmount(state: GameState): number {
  const remainingCapacity = state.player.ship.maxFuel - state.player.ship.fuel;
  const affordable = Math.floor(state.player.credits / fuelPrice(state));
  return Math.max(0, Math.min(100, remainingCapacity, affordable));
}

/** A day the player is stranded: even after spending every credit on fuel they
 *  cannot reach the fuel needed for the CHEAPEST available jump (the nearest
 *  reachable system). Replaces the old `fuel === 0` metric, which never fired
 *  in 6,000 simulated days because every policy keeps the tank topped up — it
 *  measured a state the sim never reaches, not economic hardship (T-1004).
 *  Uses the same `jumpFuelCost` (via `playerJumpFuel`) the engine prices travel
 *  with, so "the cheapest jump" is the exact fuel the resolver would demand. */
export function cannotAffordCheapestJump(state: GameState): boolean {
  const from = state.player.currentSystemId;
  const cheapestJumpFuel = Math.min(
    // Only TRAVELABLE systems (T-1101): a sealed destination is not a jump the
    // player could actually take, so it never counts as "the cheapest jump".
    ...travelableSystemIds()
      .filter((id) => id !== from)
      .map((id) => playerJumpFuel(state, systemDistance(from, id))),
  );
  const ship = state.player.ship;
  const buyable = Math.floor(state.player.credits / fuelPrice(state));
  const maxReachableFuel = Math.min(ship.maxFuel, ship.fuel + buyable);
  return maxReachableFuel < cheapestJumpFuel;
}

function countDailyEvents(events: GameEvent[]): {
  wireEntries: number;
  flawChecks: number;
  flawOverrides: number;
  deedsEarned: string[];
} {
  let wireEntries = 0;
  let flawChecks = 0;
  let flawOverrides = 0;
  const deedsEarned: string[] = [];

  for (const event of events) {
    if (event.type === 'WireEntry') {
      wireEntries += 1;
    } else if (event.type === 'FlawCheck') {
      flawChecks += 1;
      if (!event.resisted) {
        flawOverrides += 1;
      }
    } else if (event.type === 'DeedEarned') {
      deedsEarned.push(event.deedId);
    }
  }

  return { wireEntries, flawChecks, flawOverrides, deedsEarned };
}

/** The seven components a fitted AUTO_REPAIR module regenerates overnight.
 *  MIRROR of engine/src/components.ts `AUTO_REPAIR_COMPONENTS` (which is module-
 *  private): the HULL is deliberately absent in both — the module patches
 *  systems, not the hull. Kept as an explicit mirror so a future divergence in
 *  the engine's list is visible here rather than silently mis-measured. */
const AUTO_REPAIR_SIM_COMPONENTS: readonly ShipComponentId[] = [
  'drives',
  'cabin',
  'lifeSupport',
  'weapons',
  'navigation',
  'robotics',
  'shields',
];

/** T-1601b · The one contraband cargo type (content `CARGO_TYPES`, id 10). Only a
 *  port with `allowsContraband` issues it (engine `rollContract`), and it is what
 *  makes a signed run illicit for `isCarryingIllicit`. Named here so the fold
 *  below reads as the pillar rather than as a magic number. */
const CONTRABAND_CARGO_TYPE = 10;

/** T-1601b · The pod-take beat: `derelict.sealed-pod` / choice `take`, the flag
 *  that makes a hold permanently illicit until a scan or Ray clears it. Matched
 *  by CHOICE ID, never by ordinal, so re-ordering the content choices can never
 *  silently turn this into the "leave it" beat. */
const SEALED_POD_STORYLET_ID = 'derelict.sealed-pod';
const SEALED_POD_TAKE_CHOICE_ID = 'take';
/** T-1601b · Smuggler Ray's two fence storylets and their SELL choices (content
 *  storylets.ts). Both are `repeat: 'never'`. Choice ids, not ordinals. */
const FENCE_STORYLET_PREFIX = 'fence.ray.';
const FENCE_SELL_CHOICE_IDS: readonly string[] = ['sell-the-pod', 'fence-the-load'];

/** T-1601a/T-1601b · The run-level behavior metrics one day's events fold into.
 *  Passed as a single accumulator rather than as a growing positional list —
 *  there is exactly one call site (`runCampaign`), so the fold stays readable as
 *  the block count grows. */
interface CampaignMetricAccumulator {
  loanUsage: LoanUsageStats;
  fragments: FragmentStats;
  equipmentUse: EquipmentUseStats;
  smuggling: SmugglingStats;
  hangoutPlay: HangoutPlayStats;
}

/** T-1601a · Fold one day's events into the run-level behavior metrics. Kept as
 *  a SIBLING of `countDailyEvents` (rather than widening it) so that function's
 *  signature and its existing callers stay untouched. Pure: a fold over the
 *  event stream, no rng, so determinism is unaffected. */
function accumulateMetricEvents(
  events: readonly GameEvent[],
  metrics: CampaignMetricAccumulator,
): void {
  const { loanUsage, fragments, equipmentUse, smuggling, hangoutPlay } = metrics;
  for (const event of events) {
    if (event.type === 'LoanEvent') {
      if (event.kind === 'borrowed') {
        loanUsage.loansTaken += 1;
        loanUsage.principalBorrowed += event.principal ?? 0;
      } else if (event.kind === 'accrued') {
        loanUsage.interestAccrued += event.interest ?? 0;
      } else if (event.kind === 'repaid') {
        loanUsage.amountRepaid += event.amountPaid ?? 0;
        if (event.cleared) loanUsage.loansCleared += 1;
      } else if (event.kind === 'defaulted') {
        loanUsage.defaults += 1;
      }
    } else if (event.type === 'FragmentAcquired') {
      fragments.acquired += 1;
    } else if (event.type === 'FragmentDecoded') {
      fragments.decoded += 1;
    } else if (event.type === 'ShipyardEvent') {
      if (event.action === 'buy-special-equipment' && event.equipment) {
        equipmentUse.specialEquipmentBought.push(event.equipment);
      } else if (event.action === 'buy-component-tier') {
        equipmentUse.componentTiersBought += 1;
      }
    } else if (event.type === 'ComponentDamaged') {
      equipmentUse.shieldAbsorbedPoints += event.mitigated ?? 0;
    } else if (event.type === 'TradeEvent') {
      // T-1601b: the contraband SUPPLY side. `cargoType` is stamped on the
      // sign/deliver events by the trade + travel resolvers, so the pillar's
      // throughput needs no new state — only a filter on the type-10 runs.
      if (event.success && event.cargoType === CONTRABAND_CARGO_TYPE) {
        if (event.action === 'sign-contract') smuggling.contrabandContractsSigned += 1;
        else if (event.action === 'deliver-cargo') smuggling.contrabandDelivered += 1;
      }
    } else if (event.type === 'ContrabandScan') {
      smuggling.scans += 1;
      if (event.caught) smuggling.scansCaught += 1;
      else smuggling.scansEvaded += 1;
    } else if (event.type === 'ContrabandConfiscated') {
      smuggling.finesPaid += event.fine;
      if (event.confiscatedContract) smuggling.contractsConfiscated += 1;
      if (event.confiscatedPod) smuggling.podsConfiscated += 1;
    } else if (event.type === 'StoryletChoiceResolved') {
      if (
        event.storyletId === SEALED_POD_STORYLET_ID &&
        event.choiceId === SEALED_POD_TAKE_CHOICE_ID
      ) {
        smuggling.podsTaken += 1;
      } else if (
        event.storyletId.startsWith(FENCE_STORYLET_PREFIX) &&
        FENCE_SELL_CHOICE_IDS.includes(event.choiceId)
      ) {
        smuggling.fenceSales += 1;
      }
    } else if (event.type === 'HangoutEvent') {
      if (event.failReason !== undefined) {
        // A typed refusal (no die spent). Counted so a policy whose guards drift
        // out of step with the engine's gates shows up as a number, not silence.
        hangoutPlay.failedVisits += 1;
      } else {
        hangoutPlay.visits += 1;
        if (event.venue === 'dare') {
          hangoutPlay.dares += 1;
          if (event.playerWon) hangoutPlay.daresWon += 1;
          else hangoutPlay.daresLost += 1;
          hangoutPlay.wagered += event.wager ?? 0;
          hangoutPlay.netCredits += event.creditsDelta ?? 0;
        } else if (
          event.venue === 'meet' ||
          event.venue === 'befriend' ||
          event.venue === 'insult'
        ) {
          hangoutPlay.socialBeats += 1;
        }
      }
    }
  }
}

function appendDieAction(
  actions: PlayerAction[],
  makeAction: (spendDie: number) => PlayerAction,
): void {
  const dieActionCount = actions.filter((action) => action.type !== 'Wait').length;

  if (dieActionCount < 5) {
    actions.push(makeAction(dieActionCount));
  }
}

export function availablePlannedActions(state: GameState): PlayerAction[] {
  const actions: PlayerAction[] = [{ type: 'Wait' }];

  if (state.encounter) {
    for (const stance of ['talk', 'run', 'fight'] as const) {
      appendDieAction(actions, (spendDie) => ({
        type: 'Combat',
        stance,
        targetId: state.encounter!.interceptor.id,
        spendDie,
      }));
    }
    return actions;
  }

  const fuelToBuy = affordableFuelAmount(state);
  if (state.player.ship.fuel < state.player.ship.maxFuel && fuelToBuy >= 1) {
    appendDieAction(actions, (spendDie) => ({
      type: 'Trade',
      action: 'buy-fuel',
      fuelAmount: fuelToBuy,
      spendDie,
    }));
  }

  const destinationId = state.player.activeContract
    ? state.player.activeContract.destination
    : nextSystemId(state.player.currentSystemId);
  appendDieAction(actions, (spendDie) => ({
    type: 'Travel',
    destinationId,
    spendDie,
  }));

  if (state.player.debt > 0 && state.player.credits > 0) {
    actions.push({
      type: 'Trade',
      action: 'pay-debt',
      amount: Math.min(state.player.credits, state.player.debt),
    });
  }

  return actions;
}

export const idlePolicy: SimPolicy = () => [{ type: 'Wait' }];

type StoryletOfferChoice = GameState['storylets']['available'][number]['choices'][number];

function choiceRequiresDie(choice: StoryletOfferChoice): boolean {
  return Boolean(choice.requirements?.spendDie || choice.requirements?.statCheck);
}

function canAffordChoice(state: GameState, choice: StoryletOfferChoice): boolean {
  const credits = choice.requirements?.credits;
  if (!credits) {
    return true;
  }
  if (credits.gte !== undefined && state.player.credits < credits.gte) {
    return false;
  }
  if (credits.lte !== undefined && state.player.credits > credits.lte) {
    return false;
  }
  if (credits.equals !== undefined && state.player.credits !== credits.equals) {
    return false;
  }
  return true;
}

/** Greedy storylet pick: first available offer with an affordable choice,
 *  preferring no-die choices; a die choice spends the lowest die (index 0, the
 *  policy's single die action of the day). Deterministic — content order only. */
function chooseStoryletAction(state: GameState): PlayerAction | null {
  for (const offer of state.storylets.available) {
    const affordable = offer.choices.filter((choice) => canAffordChoice(state, choice));
    const chosen = affordable.find((choice) => !choiceRequiresDie(choice)) ?? affordable[0];
    if (chosen) {
      return {
        type: 'Storylet',
        storyletId: offer.storyletId,
        choiceId: chosen.id,
        ...(choiceRequiresDie(chosen) ? { spendDie: 0 } : {}),
      };
    }
  }
  return null;
}

/** T-1601a · The Sage of Mizar-9's decode storylets (`sage.mizar.decode-first`
 *  and `decode-02..12`, content/storylets.ts) — the game's ONLY decoder. */
const SAGE_DECODE_STORYLET_PREFIX = 'sage.mizar.decode';
/** Mizar-9. Where the Sage keeps the workshop; not a gated destination, so a
 *  plain `Travel` reaches it. */
const SAGE_SYSTEM_ID = 18;

/** T-1601a · `chooseStoryletAction` takes the FIRST offer in board order, which
 *  at Mizar-9 may not be the decode (the Sage also hosts the constellation quiz
 *  and star-lore beats). While the explorer is chasing a decode, prefer a Sage
 *  decode offer; the caller falls back to the ordinary greedy pick. Every decode
 *  storylet's first choice is the die-free `decode`, so this resolves INLINE on a
 *  normal income day — the standalone/inline split is untouched. */
function chooseDecodeStoryletAction(state: GameState): PlayerAction | null {
  for (const offer of state.storylets.available) {
    if (!offer.storyletId.startsWith(SAGE_DECODE_STORYLET_PREFIX)) continue;
    const affordable = offer.choices.filter((choice) => canAffordChoice(state, choice));
    const chosen = affordable.find((choice) => !choiceRequiresDie(choice)) ?? affordable[0];
    if (chosen) {
      return {
        type: 'Storylet',
        storyletId: offer.storyletId,
        choiceId: chosen.id,
        ...(choiceRequiresDie(chosen) ? { spendDie: 0 } : {}),
      };
    }
  }
  return null;
}

export const greedyTraderPolicy: SimPolicy = ({ state }) => {
  if (state.encounter) {
    return [
      {
        type: 'Combat',
        stance: 'talk',
        targetId: state.encounter.interceptor.id,
        spendDie: 0,
      },
    ];
  }

  const storyletAction = chooseStoryletAction(state);
  if (storyletAction) {
    return [storyletAction];
  }

  if (state.player.activeContract) {
    return [
      {
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: 0,
      },
    ];
  }

  const fuelToBuy = affordableFuelAmount(state);
  if (state.player.ship.fuel < 200 && fuelToBuy >= 1) {
    return [
      {
        type: 'Trade',
        action: 'buy-fuel',
        fuelAmount: fuelToBuy,
        spendDie: 0,
      },
    ];
  }

  const actions: PlayerAction[] = [
    {
      type: 'Trade',
      action: 'sign-contract',
      contractIndex: 0,
      spendDie: 0,
    },
  ];

  if (state.player.debt > 0 && state.player.credits > 2000) {
    actions.push({
      type: 'Trade',
      action: 'pay-debt',
      amount: Math.min(state.player.credits - 1000, state.player.debt),
    });
  }

  return actions;
};

export const randomLegalActionPolicy: SimPolicy = ({ state, rng }) => {
  const actions = availablePlannedActions(state);
  const index = Math.floor(rng.next() * actions.length);
  return [actions[index] ?? { type: 'Wait' }];
};

// ---------------------------------------------------------------------------
// T-201 · Competent policies. These are the balance instruments — they play the
// game the way a thinking spacer would, using ONLY the day state (fresh board +
// dawn hand) and no external randomness, so a seed reproduces byte-identically.
//
// They are invoked on the POST-startDay state (dawnBlind:false), so they can
// read the live manifest board (choose the best contract), the dawn hand
// (spend the sharpest dice on skill checks and the dull ones on rote actions),
// the local fuel price, and any encounter carried over from the previous dusk.
// ---------------------------------------------------------------------------

/** Whether an action is a legal income-producing / progress move (T-201
 *  poverty-trap definition): signing a contract, travelling toward a delivery,
 *  exploring for salvage/fragments, or engaging combat (fight/talk) for gain.
 *  Buying fuel, paying debt, waiting, or fleeing are not income moves. */
export function isIncomeAction(action: PlayerAction): boolean {
  if (action.type === 'Travel') return true;
  if (action.type === 'Explore') return true;
  if (action.type === 'Trade') return action.action === 'sign-contract';
  if (action.type === 'Combat') return action.stance === 'fight' || action.stance === 'talk';
  return false;
}

/**
 * A per-day die ledger. The dawn hand is sorted DESCENDING (index 0 = the
 * highest-value die), so `takeBest` pops the sharpest remaining die (for skill
 * checks — travel, explore, combat) and `takeWorst` pops the dullest (for rote
 * actions that roll no check — signing, refuelling, buying upgrades). Returns
 * `undefined` once the hand is exhausted so callers stop queueing actions.
 */
interface DieLedger {
  takeBest(): number | undefined;
  takeWorst(): number | undefined;
  remaining(): number;
}

function dieLedger(state: GameState): DieLedger {
  const hand = state.player.dawnHand;
  const available: number[] = [];
  if (hand) {
    for (let index = 0; index < hand.dice.length; index += 1) {
      if (!hand.spent[index]) available.push(index);
    }
  } else {
    for (let index = 0; index < 5; index += 1) available.push(index);
  }
  return {
    takeBest: () => available.shift(),
    takeWorst: () => available.pop(),
    remaining: () => available.length,
  };
}

/** Fuel the player's own drives burn on a jump of `dist` — the SAME cost math
 *  the engine prices travel with (single source of truth). */
function playerJumpFuel(state: GameState, dist: number): number {
  const ship = state.player.ship;
  return jumpFuelCost(ship.drives, dist, ship.hasTransWarpDrive ?? false);
}

interface RankedContract {
  index: number;
  destination: number;
  payment: number;
  dist: number;
  fuel: number;
}

/** The manifest board annotated with distance and jump fuel from the current
 *  system, pre-sorted by RAW payment, richest first (board order as the
 *  tiebreak so the choice is deterministic). Note: this is only the raw
 *  pre-ranking — since T-1102 `traderPolicy` re-ranks the reachable subset by
 *  NET value (payment minus fuel burn priced at the local depot) before
 *  signing, so the final choice is made there, not here. */
function rankedContracts(state: GameState): RankedContract[] {
  const from = state.player.currentSystemId;
  return state.market.manifestBoard
    .map((contract, index) => {
      const dist = systemDistance(from, contract.destination);
      return {
        index,
        destination: contract.destination,
        payment: contract.payment,
        dist,
        fuel: playerJumpFuel(state, dist),
      };
    })
    .sort((a, b) => b.payment - a.payment || a.index - b.index);
}

// T-1102: retuned for the fuel-scarcity overhaul. Under the new per-distance
// cost a single rim run can burn ~250+ fuel, so the trader must top off BEFORE a
// big jump rather than after stranding. Threshold raised so a partially-drained
// tank refuels early; target lifted toward the starter ceiling (300) so a rich,
// distant contract is actually fundable in one day.
const FUEL_REFUEL_THRESHOLD = 180;
const FUEL_REFUEL_TARGET = 300;

/** Queue a refuel (dull die) when the tank dips below the working threshold,
 *  buying up to the target, capped by what's affordable above `keepFloor`.
 *  Returns the action and its credit cost (so debt planning can reserve it).
 *  T-1601a `extraCredits`: credits the day's plan has ALREADY arranged to have on
 *  hand before this action runs (today only: a Penny Wise advance queued earlier
 *  in the same day). The planners are pure and read the DAWN state, so a borrow
 *  the policy has queued but not yet applied has to be passed in explicitly —
 *  otherwise the trader borrows to cover a fuel bill and then refuses to spend
 *  the money it just borrowed. Defaults to 0, so every existing caller is
 *  byte-identical. */
function planRefuel(
  state: GameState,
  ledger: DieLedger,
  keepFloor: number,
  threshold = FUEL_REFUEL_THRESHOLD,
  target = FUEL_REFUEL_TARGET,
  extraCredits = 0,
): { action: PlayerAction; cost: number } | null {
  const ship = state.player.ship;
  if (ship.fuel >= threshold) return null;
  const price = state.market.localFuelPrice || 5;
  const want = Math.min(ship.maxFuel - ship.fuel, target - ship.fuel);
  const spendable = Math.max(0, state.player.credits + extraCredits - keepFloor);
  const affordable = Math.floor(spendable / price);
  const units = Math.min(want, affordable);
  if (units < 1) return null;
  const die = ledger.takeWorst();
  if (die === undefined) return null;
  return {
    action: { type: 'Trade', action: 'buy-fuel', fuelAmount: units, spendDie: die },
    cost: units * price,
  };
}

// T-1205: a real player repairs a battered ship. Now that enemy fire can chip the
// HULL on any round (seeded component targeting), a junker's hull condition — and
// with it the hull-derived fuel ceiling (maxFuel = (condition+1)·strength·30) —
// can be ground down mid-run, shrinking the tank until no contract is reachable
// and a solvent trader strands rich-but-short-ranged (observed: hull condition 3 →
// maxFuel 120, stuck 7 days with 158k credits). The pre-T-1205 damage rotation
// spared the hull in short encounters, so the policies never needed to repair;
// they do now. This is the "think like a player" fix, not a loosened invariant.
const CRIPPLED_FUEL_FRACTION = 0.7;

/** A repair-all when a chipped hull's fuel ceiling has dropped enough to hamper
 *  the ship AND the repair is affordable above `reserve`. Restores the full tank
 *  in one action so the ship can reach contracts again. Two triggers:
 *   1. the ceiling fell below CRIPPLED_FUEL_FRACTION of pristine (the coarse
 *      "clearly crippled" heuristic), OR
 *   2. T-1302 stranding trigger — the degraded tank can no longer reach the
 *      CHEAPEST contract on the board, but a pristine (condition-9) tank could.
 *      The 0.7 fraction alone misses the boundary case that motivated T-1205:
 *      combat drops the starter hull to condition 6 → maxFuel = 7·1·30 = 210,
 *      exactly 0.7·300, so trigger 1's `>=` lets it slip through — yet 210 is
 *      below the ~286 nearest-contract jump at a Rim system, stranding a solvent
 *      trader for days (seed 2: 5 idle dawns at system 16 with ~33k credits and
 *      a full 210 tank, every board contract 221–494 fuel away). Repairing the
 *      hull restores the 300 tank and reopens the near runs. Reader:
 *      campaign.test.ts poverty-trap invariant (streak < 5).
 *  Returns null when the ship is healthy, unaffordable, or out of dice. */
function planCrippledRepair(
  state: GameState,
  ledger: DieLedger,
  reserve: number,
  extraCredits = 0,
): PlayerAction | null {
  const need = crippledRepairNeed(state);
  if (!need.needed || !need.repairable) return null;
  if (state.player.credits + extraCredits - need.cost < reserve) return null;
  const die = ledger.takeWorst();
  if (die === undefined) return null;
  return { type: 'Shipyard', action: 'repair', repairMode: 'all', spendDie: die };
}

/**
 * T-1601a · The AFFORDABILITY-FREE half of `planCrippledRepair`: do the two
 * crippled triggers hold, is a repair-all otherwise legal, and what does the yard
 * quote? Split out so the trader can ask "the ship needs a repair it cannot pay
 * for" — the §7.5 repair-duress case behind a Penny Wise advance — without
 * burning a die on a plan it is about to reject. `repairable` deliberately treats
 * INSUFFICIENT_CREDITS as repairable (that is precisely the case the loan fixes)
 * while any other yard refusal is not; with `extraCredits === 0` the composition
 * above is byte-identical to the pre-split behavior, because a quote that failed
 * only on credits also fails the `credits - cost < reserve` test.
 */
function crippledRepairNeed(state: GameState): {
  needed: boolean;
  repairable: boolean;
  cost: number;
} {
  const none = { needed: false, repairable: false, cost: 0 };
  const ship = state.player.ship;
  const pristineCapacity = calculateFuelCapacity(ship.hull.strength, 9);
  if (pristineCapacity <= 0) return none;
  const crippled = ship.maxFuel < CRIPPLED_FUEL_FRACTION * pristineCapacity;
  // Cheapest jump-fuel among the contracts currently on the board — the least
  // the tank must hold to fly ANY run from here.
  const from = state.player.currentSystemId;
  const contractFuels = state.market.manifestBoard.map((contract) =>
    playerJumpFuel(state, systemDistance(from, contract.destination)),
  );
  const cheapestContractFuel = contractFuels.length > 0 ? Math.min(...contractFuels) : Infinity;
  // Stranded by a combat-shrunk tank: it can't fly the cheapest contract, the hull
  // is worn (so a repair actually lifts the ceiling), and a pristine tank WOULD
  // reach it (else repairing is futile and we leave the decision to other logic).
  const strandedByTank =
    ship.hull.condition < 9 &&
    ship.maxFuel < cheapestContractFuel &&
    pristineCapacity >= cheapestContractFuel;
  if (!crippled && !strandedByTank) return none;
  const quote = quoteShipyard(state, {
    type: 'Shipyard',
    action: 'repair',
    repairMode: 'all',
    spendDie: 0,
  });
  const repairable = quote.ok || quote.failure?.reason === 'INSUFFICIENT_CREDITS';
  return { needed: true, repairable, cost: quote.cost };
}

/**
 * Single combat move for the weak-hulled trader/explorer. Resolving an
 * encounter by talk or fight COMPLETES the interrupted delivery; running only
 * escapes back to the origin (delivery lost). So prefer to talk it down when the
 * tribute is affordable and the interceptor will actually take credits; fall
 * back to a getaway otherwise. Exactly ONE combat action per day — queueing more
 * would crash the moment one resolves the encounter (no encounter left to
 * target). An unresolved encounter simply carries to the next dawn and is
 * retried, at the cost of one dusk pressure roll.
 */
function planPacifistCombat(state: GameState, ledger: DieLedger): PlayerAction[] {
  const encounter = state.encounter;
  if (!encounter) return [];
  const die = ledger.takeBest();
  if (die === undefined) return [{ type: 'Wait' }];
  const targetId = encounter.interceptor.id;

  const round = encounter.round;
  const tribute = Math.min(round * 1000, 10_000);
  const flaw = encounter.interceptor.flaw;
  const refusesTribute = flaw ? Boolean(FLAWS[flaw]?.refusesTribute) : false;
  const canPay = state.player.credits >= tribute;

  if (!refusesTribute && canPay) {
    return [{ type: 'Combat', stance: 'talk', targetId, spendDie: die }];
  }
  if (state.player.ship.fuel >= RUN_FUEL_COST) {
    return [{ type: 'Combat', stance: 'run', targetId, spendDie: die }];
  }
  // Dry tank and can't buy the interceptor off with credits: talk anyway (a
  // nat-20 waves the ship through, and it costs no fuel).
  return [{ type: 'Combat', stance: 'talk', targetId, spendDie: die }];
}

/** Amount to pay toward the Guild marker this dusk. Computed from PLAN-TIME
 *  credits minus the operating reserve and the fuel we're about to burn on
 *  refuelling — so even if a delivery is interrupted (no income arrives) the
 *  ledger clamp can never drain the tank below the reserve.
 *  T-1601a `refuelCost` is really "everything already committed this day" (the
 *  refuel, plus any Penny Wise repayment queued ahead of this action), and
 *  `extraCredits` is a Penny Wise advance queued ahead of it — a marker-duress
 *  advance exists precisely so it can reach the Guild. Both default to their
 *  pre-T-1601a values, so existing callers are unchanged. */
function planDebtPayment(
  state: GameState,
  reserve: number,
  refuelCost: number,
  extraCredits = 0,
): PlayerAction | null {
  if (state.player.debt <= 0) return null;
  const spendable = state.player.credits + extraCredits - reserve - refuelCost;
  const amount = Math.min(state.player.debt, spendable);
  if (amount < 1) return null;
  return { type: 'Trade', action: 'pay-debt', amount };
}

// T-1102: raised from 1500. Fuel now costs multiples of the old flat rate, so the
// trader must keep a fatter buffer back from debt payments to fund the next day's
// refuel — otherwise it pays down debt aggressively, then strands with no credits
// to fill the tank for the following run.
const TRADER_RESERVE = 3000;

// ---------------------------------------------------------------------------
// T-1601a · The trader's Penny Wise verbs (PRD §7.5: "a quiet word with Penny
// Wise, who lends at rates that become their own quest line" — one of the bad
// day's three outs). These two numbers are POLICY tuning, not game balance data:
// they say when THIS sim instrument decides a day is bad enough to borrow and
// when it heads home to settle up. Nothing in the engine or content reads them,
// so they deliberately do NOT live in packages/content (constraint 4 cuts both
// ways — content holds the rules' data, not a policy's heuristics). The lending
// RATE/TERM/PRINCIPAL band those loans are priced at is content
// (`content/lending.ts`), and this policy is its first sim exerciser.
// ---------------------------------------------------------------------------

/** How many days before the Guild marker falls due the trader will treat "the
 *  marker is bigger than the purse" as duress worth borrowing against. */
const TRADER_LOAN_MARKER_WINDOW = 6;
/** How many days before a loan falls due the trader starts PREFERRING a run that
 *  ends at a Hangout, so it is standing at the desk with the money in hand. */
const TRADER_LOAN_HOME_WINDOW = 5;

/**
 * A Penny Wise advance sized to the day's shortfall. Preconditions mirror
 * `resolveVisitHangout` + day.ts's hangout/encounter gates exactly, so the policy
 * can never burn a die on a typed refusal: a Hangout system, no live loan, no
 * encounter, a real shortfall, and a die left in the hand. The principal is
 * clamped with the CONTENT band constants (never restated numerically here).
 *
 * The die is the DULLEST remaining: borrowing rolls no check.
 *
 * CRITICAL: the caller must queue this as an EXTRA action on an otherwise normal
 * working day, never as a standalone day. A borrow-only day has
 * `incomeActionCount === 0` and would walk the poverty-trap invariant
 * (`longestZeroIncomeStreak < 5`) — the bad-day out must not itself become the
 * bad day.
 */
function planLoanBorrow(
  state: GameState,
  ledger: DieLedger,
  shortfall: number,
): { action: PlayerAction; principal: number } | null {
  if (state.encounter) return null;
  if (state.player.loan) return null;
  if (!isHangoutSystem(state.player.currentSystemId)) return null;
  if (!(shortfall >= 1)) return null;
  const principal = Math.max(
    LOAN_MIN_PRINCIPAL,
    Math.min(LOAN_MAX_PRINCIPAL, Math.ceil(shortfall)),
  );
  const die = ledger.takeWorst();
  if (die === undefined) return null;
  return {
    action: { type: 'VisitHangout', venue: 'borrow', amount: principal, spendDie: die },
    principal,
  };
}

/**
 * Clear the Penny Wise marker in full while standing at the desk. Two triggers:
 * comfortably (the balance AND the operating reserve are both covered), or
 * urgently — inside two days of the due day, pay it with whatever is on hand
 * rather than let it flip. A default is not a slap on the wrist: it applies
 * LOAN_DEFAULT_DISPOSITION to Penny Wise (grudge-weighting her into the
 * interceptor draw) and multiplies the realized encounter chance by
 * COLLECTION_ENCOUNTER_MULTIPLIER until the balance is cleared. Dull die — a
 * repayment rolls no check.
 */
function planLoanRepay(state: GameState, ledger: DieLedger): PlayerAction | null {
  const loan = state.player.loan;
  if (!loan) return null;
  if (state.encounter) return null;
  if (!isHangoutSystem(state.player.currentSystemId)) return null;
  const outstanding = loan.outstanding;
  if (outstanding < 1) return null;
  const urgent = loan.dueDay - state.day <= 2;
  const affordable = urgent
    ? state.player.credits >= outstanding
    : state.player.credits >= outstanding + TRADER_RESERVE;
  if (!affordable) return null;
  const die = ledger.takeWorst();
  if (die === undefined) return null;
  return { type: 'VisitHangout', venue: 'repay', amount: outstanding, spendDie: die };
}

// T-1102: the largest share of the tank a single contract's jump may cost. Below
// 1.0 so a run leaves fuel/credit margin to re-fly after an encounter-run and to
// pay tribute — the headroom that keeps the scarcity economy out of deadlock.
// Shared by the trader and veteran contract pickers.
const SIGN_FUEL_FRACTION = 0.6;

/**
 * TRADER — route + fuel planner that pays down the Guild marker. Each day it
 * keeps the tank topped, signs the richest contract on the board and flies it to
 * delivery the SAME day (a second run too while the debt is still heavy and the
 * hand/tank allow), then remits everything above a fuel reserve toward the debt.
 * Weak hull, so it talks its way past interceptors rather than fighting.
 *
 * T-1601a adds the two verbs a working rim trader actually uses: once the Guild
 * marker is cleared it PREFERS a rim run over a core one inside the same fundable
 * set ("one more run to the rim", PRD §1/§9), and on a bad day at a Hangout it
 * takes a Penny Wise advance (PRD §7.5) sized to the day's shortfall, protects
 * the repayment from the marker, and clears the balance at the desk before the
 * term runs out.
 */
export const traderPolicy: SimPolicy = ({ state }) => {
  const ledger = dieLedger(state);
  if (state.encounter) return planPacifistCombat(state, ledger);

  const ship = state.player.ship;
  const from = state.player.currentSystemId;
  const actions: PlayerAction[] = [];

  // T-1102: under the per-distance fuel cost, a jump can cost more than the idle
  // refuel threshold would ever top up — so the DESTINATION is chosen first and
  // the refuel is sized to guarantee the tank can actually make that jump. This
  // is the fix for the scarcity deadlock: a carried-over contract whose leg costs
  // (say) 228 fuel while the tank sits at 192 — above the flat threshold, so no
  // top-up fires — otherwise strands the trader forever (a dry-tank Travel is a
  // no-op that burns nothing, so the state never changes).
  // T-1102: under scarcity the richest contract is often a far one whose fuel
  // bill (and stranding risk) dwarfs a nearer, only-slightly-poorer run. Rank the
  // reachable board by NET value — payment minus the fuel the jump burns at the
  // local depot price — so the trader flies efficient runs it can actually fund,
  // and never signs a loss.
  const fuelDepotPrice = state.market.localFuelPrice || 5;
  const ranked = rankedContracts(state); // fuel = cost from the CURRENT system
  // Cap the fuel a single signed run may cost at a fraction of the tank. The
  // margin is deliberate: an interrupted delivery the trader RUNS from returns it
  // to origin and forces a re-flight (re-charging the jump fuel), so a run that
  // eats most of the tank can loop the ship into an unfundable deadlock after a
  // couple of encounters. Keeping runs cheap preserves the fuel/credit headroom
  // to re-fly and to weather tribute demands.
  const signFuelCap = ship.maxFuel * SIGN_FUEL_FRACTION;
  const signableWithin = (cap: number) =>
    ranked
      .filter((c) => c.fuel <= cap)
      .map((c) => ({ ...c, net: c.payment - c.fuel * fuelDepotPrice }))
      .filter((c) => c.net > 0)
      .sort((a, b) => b.net - a.net || a.index - b.index);
  let reachable: (RankedContract & { net: number })[] = signableWithin(signFuelCap);
  // T-1104 poverty-trap fix: T-1104 lets rollContract route the trader to a Rim
  // system, and from the Rim EVERY core-bound contract's leg exceeds 0.6 of the
  // tank — so the re-flight-margin cap leaves `reachable` empty and a rich,
  // full-tank trader strands for days waiting on a rare short hop (seed 1 stalled
  // 9 days at system 17). When nothing is signable within the margin cap, relax
  // to the FULL tank so the trader takes the run it can actually complete (it can
  // afford the fuel and accepts the thinner re-flight margin) rather than idling.
  // Reader: campaign.test.ts's 300-day poverty-trap invariant (streak < 5).
  if (reachable.length === 0) {
    reachable = signableWithin(ship.maxFuel);
  }

  // T-1601a · Which reachable run to take. The default is unchanged (the richest
  // NET run), with two preferences layered on top, both of which only ever pick a
  // DIFFERENT member of the already-fundable set — never a run the tank or the
  // purse cannot carry, which is the T-1104 strand this policy exists to avoid.
  let preferred = reachable.length > 0 ? reachable[0] : null;
  const loan = state.player.loan;
  if (preferred && state.player.debt === 0) {
    // "One more run to the rim" (PRD §1/§9). Gated on the Guild marker being
    // CLEARED, deliberately: the marker is the Tour One failure condition and the
    // acceptance's clear-rate band, so the trader finishes paying the Guild before
    // it starts flying the long, expensive, lucrative rim legs. Rim-ness is read
    // from content (`isRim`), never from a hard-coded 15..20 id range — the rim
    // set is data and has moved before. Those legs are also where the fuel bills
    // get big enough to produce genuine borrowing duress.
    const rimRun = reachable.find((c) => STAR_SYSTEMS[c.destination]?.isRim === true);
    if (rimRun) preferred = rimRun;
  }
  if (preferred && loan && loan.dueDay - state.day <= TRADER_LOAN_HOME_WINDOW) {
    // Head home to settle up: with the balance covered and the term nearly up,
    // prefer a fundable run that ENDS at the Penny Wise desk. Preference only —
    // if no such contract is on the board the trader flies its normal best run.
    if (state.player.credits >= loan.outstanding) {
      const homeRun = reachable.find((c) => isHangoutSystem(c.destination));
      if (homeRun) preferred = homeRun;
    }
  }

  let primaryDest: number | null = null;
  if (state.player.activeContract) {
    primaryDest = state.player.activeContract.destination;
  } else if (preferred) {
    primaryDest = preferred.destination;
  }
  const primaryFuelNeed =
    primaryDest !== null ? playerJumpFuel(state, systemDistance(from, primaryDest)) : 0;

  // ---- T-1601a · Penny Wise, under duress -------------------------------
  // Three genuinely bad-day shapes (PRD §7.5), each measured against the plan the
  // trader has already made for today. The advance is sized to the LARGEST of
  // them and queued FIRST, so the principal is on hand before the refuel /
  // repair / marker payment below try to spend it.
  const repairNeed = crippledRepairNeed(state);
  // 1. FUEL DURESS — the tank cannot make today's leg and the purse cannot buy
  //    the difference. The classic §7.5 bad day: a run in hand, no way to fly it.
  const fuelShortfall =
    primaryFuelNeed > ship.fuel
      ? (primaryFuelNeed - ship.fuel) * fuelDepotPrice - state.player.credits
      : 0;
  // 2. REPAIR DURESS — the ship is crippled enough that `planCrippledRepair`
  //    wants to fire, but the yard quote is out of reach above the reserve.
  const repairShortfall =
    repairNeed.needed && repairNeed.repairable
      ? repairNeed.cost + TRADER_RESERVE - state.player.credits
      : 0;
  // 3. MARKER DURESS — the Guild marker is closing and the purse cannot cover it.
  const markerShortfall =
    state.player.debt > 0 &&
    state.day >= state.player.debtDueDay - TRADER_LOAN_MARKER_WINDOW &&
    state.player.credits < state.player.debt
      ? state.player.debt - state.player.credits
      : 0;
  // 4. WORKING CAPITAL — not duress, and labelled honestly as such: a Tour One
  //    trader standing at the desk on the morning of day 1 with 1,000 credits, a
  //    25,000 marker and a month to clear it BORROWS. Every real spacer does; the
  //    advance buys the fuel for the runs that pay the Guild, and the strict
  //    duress cases above almost never coincide with being AT the desk (measured
  //    over seeds 1..50: the trader passes through Sun-3 about five dawns per 60
  //    days, and is rarely there on the one day the tank runs dry). Without this
  //    case the lending band ships unexercised by any policy, which is precisely
  //    what this task exists to prevent.
  const workingCapitalShortfall =
    state.player.debt > 0 && state.player.credits < TRADER_RESERVE
      ? TRADER_RESERVE - state.player.credits
      : 0;
  const shortfall = Math.max(
    fuelShortfall,
    repairShortfall,
    markerShortfall,
    workingCapitalShortfall,
  );
  const borrow = planLoanBorrow(state, ledger, shortfall);
  let borrowed = 0;
  if (borrow) {
    // FIRST in the day's plan — and an EXTRA action on a normal working day, so
    // the sign/travel below still runs and the day keeps its income action.
    actions.push(borrow.action);
    borrowed = borrow.principal;
  }

  // Settle the Penny Wise balance before the day's spending starts, so the
  // repayment is never lost to a refuel that drained the purse first.
  const repay = planLoanRepay(state, ledger);
  let repaid = 0;
  if (repay) {
    actions.push(repay);
    repaid = loan?.outstanding ?? 0;
  }

  // Raise the refuel threshold/target to cover this day's jump (capped at the
  // tank). Never lower them below the working defaults.
  const refuelThreshold = Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_THRESHOLD, primaryFuelNeed));
  const refuelTarget = Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_TARGET, primaryFuelNeed));
  const refuel = planRefuel(
    state,
    ledger,
    // T-1601a: hold back exactly the repayment queued above (it runs first, but
    // these planners all read the DAWN state), so the tank is never filled with
    // the money that was going to clear the marker.
    repaid,
    refuelThreshold,
    refuelTarget,
    borrowed,
  );
  let refuelCost = 0;
  if (refuel) {
    actions.push(refuel.action);
    refuelCost = refuel.cost;
  }

  // T-1205: if enemy fire has chipped the hull down far enough to collapse the
  // fuel ceiling (stranding a solvent trader with no reachable contract), repair
  // the ship — a real player fixes a crippled hull. Restores the full tank for the
  // next run; fires only when actually crippled and affordable.
  // T-1601a: the day's Penny Wise traffic nets into the affordability check (an
  // advance funds the repair, a repayment is money already spent). The refuel is
  // deliberately NOT subtracted — that was never modelled here, and changing it
  // would move the T-1302 stranding fix this planner exists for.
  const repair = planCrippledRepair(state, ledger, TRADER_RESERVE, borrowed - repaid);
  if (repair) actions.push(repair);

  // The tank the trader will actually have when it flies today — current fuel
  // plus whatever the just-queued refuel tops it up by (refuel runs before the
  // travel action).
  const fuelPrice = state.market.localFuelPrice || 5;
  const boughtFuel = refuel ? refuel.cost / fuelPrice : 0;
  const availableFuel = Math.min(ship.maxFuel, ship.fuel + boughtFuel);

  if (state.player.activeContract) {
    // A run carried over (a prior delivery was interrupted or the nav check
    // slipped) — finish it before signing anything new.
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
    }
  } else if (preferred && availableFuel >= primaryFuelNeed) {
    // T-1601a: `preferred` is `reachable[0]` unless the rim or head-home
    // preference above swapped in another member of the SAME fundable set.
    const best = preferred;
    const signDie = ledger.takeWorst();
    const travelDie = ledger.takeBest();
    if (signDie !== undefined && travelDie !== undefined) {
      actions.push({
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: best.index,
        spendDie: signDie,
      });
      actions.push({ type: 'Travel', destinationId: best.destination, spendDie: travelDie });

      // Second run while the debt still bites: throughput matters more than the
      // marginal encounter risk when 25,000 credits are due by day 30.
      if (state.player.debt > 5000 && reachable.length > 1 && ledger.remaining() >= 2) {
        // T-1601a: the richest OTHER fundable run — `reachable[1]` unless a
        // preference above made `best` something other than `reachable[0]`.
        const second = reachable.find((c) => c.index !== best.index)!;
        // The board shifts when the first contract is spliced off; correct the
        // live index for the second sign.
        const liveIndex = second.index > best.index ? second.index - 1 : second.index;
        const secondSignDie = ledger.takeWorst();
        const secondTravelDie = ledger.takeBest();
        // T-1102: the second leg is flown FROM the first delivery's system, not
        // from here — price it on that leg (distance best.destination → second),
        // and require the fuel left after run 1 to cover it. The old check used
        // the second contract's cost-from-here, which under scarcity signed a
        // double the tank could never complete and deadlocked the run.
        const secondLegFuel = playerJumpFuel(
          state,
          systemDistance(best.destination, second.destination),
        );
        const projectedFuel = availableFuel - primaryFuelNeed;
        if (
          secondSignDie !== undefined &&
          secondTravelDie !== undefined &&
          projectedFuel >= secondLegFuel
        ) {
          actions.push({
            type: 'Trade',
            action: 'sign-contract',
            contractIndex: liveIndex,
            spendDie: secondSignDie,
          });
          actions.push({
            type: 'Travel',
            destinationId: second.destination,
            spendDie: secondTravelDie,
          });
        }
      }
    }
  }

  // T-1601a: PROTECT THE PENNY WISE REPAYMENT FROM THE GUILD MARKER. While a loan
  // is live and unpaid this day, hold its whole balance back on top of the
  // operating reserve. Sending it to the Guild instead is a false economy: the
  // marker is a plain ledger, but a defaulted loan applies LOAN_DEFAULT_DISPOSITION
  // to Penny Wise (grudge-weighting her into the interceptor draw, travel.ts
  // chooseWeighted) AND multiplies the realized encounter chance by
  // COLLECTION_ENCOUNTER_MULTIPLIER until it is cleared — a compounding penalty
  // that costs far more than the days of marker payment it defers. A repayment
  // queued TODAY needs no such hold; it is already committed spending instead.
  const loanHold = state.player.loan && !repay ? state.player.loan.outstanding : 0;
  const debtPayment = planDebtPayment(
    state,
    TRADER_RESERVE + loanHold,
    refuelCost + repaid,
    borrowed,
  );
  if (debtPayment) actions.push(debtPayment);

  return actions.length > 0 ? actions : [{ type: 'Wait' }];
};

// ---------------------------------------------------------------------------
// T-1601b · SMUGGLER. The smuggling pillar (PRD §7.2 "patrol captains roll GUILE
// checks against smugglers", §7.5 "Smuggler Ray" as the third out) shipped
// complete — contraband contracts (T-1104), the derelict sealed pod (T-111b),
// the patrol scan (T-1305), Ray's fence storylets — but NO policy ever ran it,
// so the balance instruments never measured a scan, a fine, or a fence sale.
// This policy is that instrument.
//
// WHY IT LIVES ON THE RIM: `rollContract` only issues cargo type 10 from an
// ORIGIN port with `allowsContraband`, which today is exactly the six rim
// systems (content systems.ts). A core-resident smuggler is offered no
// contraband at all — so the pillar's supply is a ROUTING problem before it is
// anything else, and the policy is built around getting to (and staying on) the
// rim. Its second supply line is the sealed pod: Explore → POI loot →
// `signal.contraband.pending` → the `derelict.sealed-pod` storylet, whose `take`
// choice sets a carrying flag NOTHING clears but a confiscation or Ray.
//
// The numbers below are POLICY tuning, not game balance data — they say when
// THIS instrument decides to deadhead for the rim, exactly as
// TRADER_LOAN_MARKER_WINDOW says when the trader decides a day is bad enough to
// borrow. The contraband/fence/dare BAND constants stay in content, and this
// file imports them rather than restating them (constraint 4 cuts both ways).
// ---------------------------------------------------------------------------

/** Mirrors TRADER_RESERVE: the smuggler is a trader variant and needs the same
 *  fat buffer to fund the next day's refuel under the T-1102 fuel economy. */
const SMUGGLER_RESERVE = 3000;
/** Drive condition at or below which the smuggler books a repair: every point of
 *  wear adds 1 fuel PER UNIT OF DISTANCE (`jumpFuelCost`), which on this policy's
 *  long legs is the difference between a 13-fuel hop and a 39-fuel one. */
const SMUGGLER_DRIVE_REPAIR_CONDITION = 8;
/** The credit floor the EXPLORE sweeps keep back, deliberately far below
 *  SMUGGLER_RESERVE. Same lesson EXPLORER_FUEL_RESERVE records: a high floor
 *  becomes its own strand, because it blocks the one income action still legal on
 *  a day when the board offers no fundable, navigable run. Measured with the
 *  sweeps gated at the full reserve (seed 8 × 300 days): five consecutive
 *  zero-income days at Herculis-2 on 1,399 credits and a 228-unit tank — the ship
 *  could have flown off-lane the whole time. */
const SMUGGLER_EXPLORE_RESERVE = 2000;
/** The floor on a day that has produced NO income action — see the comment at the
 *  explore loop. Thin on purpose: on such a day the choice is between charting
 *  off-lane and idling, and idling is what the poverty-trap invariant forbids. */
const SMUGGLER_IDLE_EXPLORE_RESERVE = 200;
/** What it costs to be allowed to DEADHEAD for the rim — an unpaid leg flown
 *  only when the board offers nothing fundable at all. Same shape and same
 *  rationale as EXPLORER_DECODE_TRIP_RESERVE / _FIRST_DAY: a pursuit leg flown
 *  broke lands the ship at a rim port with no fundable run and no credits to
 *  refuel, which is a strand, not a career. */
const SMUGGLER_RIM_DEADHEAD_RESERVE = 10000;
/** Not before the Tour One marker has resolved (PRD §5.1): the first month is
 *  where this policy is poorest and a deadhead is least survivable. */
const SMUGGLER_RIM_DEADHEAD_FIRST_DAY = 30;
/** The die roll a leg must be flyable ON before the smuggler will commit to it:
 *  a jump is only signed when `travelDc(distance) <= PILOT + navBonus + this`, so
 *  the run lands on a 15-or-better rather than only on a natural 20. See the NAV
 *  GATE comment in the policy for the strand this closes. */
const SMUGGLER_SIGN_DIE_FLOOR = 15;

/**
 * T-1601b · The smuggler's storylet preference, modelled on
 * `chooseDecodeStoryletAction`. Board order would otherwise hand the pillar's
 * two decisive beats to whatever sorts first, and the greedy picker's
 * "prefer a die-free choice" rule would happily take `leave` / `keep-it-bolted`.
 * Priority: (a) TAKE the sealed pod (the pod supply line), then (b) SELL to Ray
 * (the §7.5 fence out, which also stamps FENCE_REP_FLAG and so makes every later
 * scan harder — a consequence this policy exists to measure, not to dodge).
 * Choices are matched by CHOICE ID so re-ordering the content can never flip
 * this into the declining branch. Both target choices are die-free, so the
 * caller resolves them INLINE and the day keeps its income action.
 */
function chooseSmugglerStoryletAction(state: GameState): PlayerAction | null {
  const takeChoice = (
    offer: GameState['storylets']['available'][number],
    choiceIds: readonly string[],
  ): PlayerAction | null => {
    const chosen = offer.choices.find(
      (choice) => choiceIds.includes(choice.id) && canAffordChoice(state, choice),
    );
    if (!chosen) return null;
    return {
      type: 'Storylet',
      storyletId: offer.storyletId,
      choiceId: chosen.id,
      ...(choiceRequiresDie(chosen) ? { spendDie: 0 } : {}),
    };
  };

  for (const offer of state.storylets.available) {
    if (offer.storyletId !== SEALED_POD_STORYLET_ID) continue;
    const action = takeChoice(offer, [SEALED_POD_TAKE_CHOICE_ID]);
    if (action) return action;
  }
  for (const offer of state.storylets.available) {
    if (!offer.storyletId.startsWith(FENCE_STORYLET_PREFIX)) continue;
    const action = takeChoice(offer, FENCE_SELL_CHOICE_IDS);
    if (action) return action;
  }
  return null;
}

/** The nearest rim system to `from` (content `isRim`, never a hard-coded 15..20
 *  range — the rim set is data and has moved before). Ties break on the lower
 *  id so the choice is deterministic. Gated systems are excluded: a sealed
 *  destination is not a leg the player could fly. */
function nearestRimSystemId(from: number): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const id of travelableSystemIds()) {
    if (id === from || STAR_SYSTEMS[id]?.isRim !== true) continue;
    const dist = systemDistance(from, id);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = id;
    }
  }
  return best;
}

/**
 * SMUGGLER — a trader that runs dirty. It keeps the tank topped and funds itself
 * with ordinary contract runs (the same net-value ranking, margin cap and
 * T-1104 full-tank relaxation the trader uses), but inside the already-fundable
 * set it prefers, in order: a CONTRABAND run (cargo type 10), then any rim-bound
 * run — because the rim is where the contraband is issued. It takes every sealed
 * pod an Explore sweep turns up, sells to Ray when he offers, and pays the Guild
 * out of what the runs pay. Weak hull, so it talks its way past interceptors.
 *
 * Unlike the trader's rim preference, this one is NOT gated on the Guild marker
 * being cleared: the rim IS this policy's career, and a contraband payday prices
 * at the top of the band (CARGO_TYPES type 10 carries the highest
 * valueMultiplier), so the marker is paid out of exactly those runs.
 */
export const smugglerPolicy: SimPolicy = ({ state }) => {
  const ledger = dieLedger(state);
  // A carried-over encounter is resolved first. NOTE: the contraband scan has
  // ALREADY happened by the time this runs — `applyPatrolContrabandScan` fires
  // at interdiction inside resolveTravel, before any stance is chosen — so no
  // combat choice here can suppress a scan or change its outcome.
  if (state.encounter) return planPacifistCombat(state, ledger);

  const actions: PlayerAction[] = [];
  const ship = state.player.ship;
  const from = state.player.currentSystemId;

  // The pod / fence beats first, then the ordinary greedy pick. Die-free choices
  // resolve INLINE (they cost no die, so the day still does its income work); a
  // die choice is taken as a standalone day, matching the explorer.
  const storyletAction = chooseSmugglerStoryletAction(state) ?? chooseStoryletAction(state);
  if (storyletAction) {
    if (storyletAction.type === 'Storylet' && storyletAction.spendDie === undefined) {
      actions.push(storyletAction);
    } else {
      return [storyletAction];
    }
  }

  // DRIVES FIRST — the smuggler's defining upgrade, for exactly the reason
  // T-1310 gives the explorer's: a policy that lives on the RIM cannot fly rim
  // distances on the junker's strength-10 drives. A tier-3 drive costs ~0 net
  // (the trade-in dwarfs the sticker) and drops per-unit jump fuel from 12 to
  // ~1, so the same tank reaches six times as far. Measured without it (seeds
  // 1..8 × 300 days): seeds 1, 2 and 3 spent their whole purse on a single
  // ~240-fuel rim leg, failed the long jump's high pilot DC — which BURNS the
  // fuel and leaves the ship at origin (engine resolveTravel) — and then sat on
  // an unfundable activeContract for the rest of the campaign (289 fuel-starved
  // days, a marker compounded past 3,900,000). With the drives all eight seeds
  // finish solvent. Component tiers are not renown-gated, so this is reachable
  // from day one; gated above a working reserve so it never spends the last
  // credits at the yard.
  if (ship.drives.strength < 30 && state.player.credits >= SMUGGLER_RESERVE / 2) {
    const die = ledger.takeWorst();
    if (die !== undefined) {
      actions.push({
        type: 'Shipyard',
        action: 'buy-component-tier',
        component: 'drives',
        tier: 3,
        spendDie: die,
      });
    }
  } else if (ship.navigation.strength < 30 && state.player.credits >= SMUGGLER_RESERVE / 2) {
    // THEN THE NAV COMPUTER. `navBonus` adds `floor((score - 10) / 10)` to every
    // pilot check, so a tier-3 navigation (+2) buys 4 units of extra reach
    // against the `8 + distance/2` travel DC — which is the difference between a
    // rim port being a place you can leave under the NAV GATE below and a place
    // you are stuck at. Also ~0 net at the yard (the strength-10 trade-in covers
    // the tier-3 sticker), so it is affordable the moment the drives are done.
    const die = ledger.takeWorst();
    if (die !== undefined) {
      actions.push({
        type: 'Shipyard',
        action: 'buy-component-tier',
        component: 'navigation',
        tier: 3,
        spendDie: die,
      });
    }
  }

  // ---- Contract pick (trader machinery, plus a NAV gate) -------------------
  // WHY THE NAV GATE IS NEW HERE. Every other policy's reachability test is the
  // FUEL cap, which under the junker's strength-10 drives happens to imply a
  // short distance too (a 44-unit leg costs 528 fuel on a 300 tank, so it can
  // never be signed). The drives upgrade above breaks that coupling: at
  // strength 30 the same leg costs 44 fuel and sails through the fuel cap — but
  // `travelDc` is `8 + distance/2`, so its pilot DC is 30, which a d20 plus a
  // junker's PILOT modifier CANNOT beat. Signing it locks the contract (a failed
  // jump never clears `activeContract`, engine resolveTravel) and burns the whole
  // leg's fuel on every retry — the exact "signed 118 unwinnable rim runs, 0
  // delivered" trap T-1104's comment describes, re-opened by cheap fuel.
  // Measured before this gate (seeds 1..8 × 300 days): seeds 2 and 7 locked onto
  // a DC-30 rim-to-rim leg and re-attempted it until the campaign ended (seed 7:
  // credits 6, marker compounded to 2,686,365, zero-income streak 5 — the
  // invariant's bar). The gate is NEVER relaxed, unlike the fuel cap below: a
  // jump the ship cannot navigate is not a cheaper option, it is a dead end.
  const pilotModifier = state.player.stats[Stat.PILOT] + navBonus(ship);
  const navBeatable = (dist: number) => travelDc(dist) <= pilotModifier + SMUGGLER_SIGN_DIE_FLOOR;

  const fuelDepotPrice = state.market.localFuelPrice || 5;
  const ranked = rankedContracts(state);
  const signableWithin = (cap: number) =>
    ranked
      .filter((c) => c.fuel <= cap && navBeatable(c.dist))
      .map((c) => ({ ...c, net: c.payment - c.fuel * fuelDepotPrice }))
      .filter((c) => c.net > 0)
      .sort((a, b) => b.net - a.net || a.index - b.index);
  let reachable = signableWithin(ship.maxFuel * SIGN_FUEL_FRACTION);
  // T-1104 poverty-trap fix, ported (see traderPolicy for the full argument): a
  // RIM-RESIDENT policy hits this corner constantly, because from the rim every
  // core-bound leg exceeds SIGN_FUEL_FRACTION of the tank and `reachable` comes
  // back empty. Relax to the FULL tank rather than idle. Reader: the poverty-trap
  // invariant in campaign-smuggler-gambler.test.ts (streak < 5).
  if (reachable.length === 0) {
    reachable = signableWithin(ship.maxFuel);
  }

  // Preferences, both INSIDE the already-fundable set — never a run the tank or
  // the purse cannot carry, which is the strand the relaxation above exists for.
  let preferred = reachable.length > 0 ? reachable[0] : null;
  if (preferred) {
    const contrabandRun = reachable.find(
      (c) => state.market.manifestBoard[c.index]?.cargoType === CONTRABAND_CARGO_TYPE,
    );
    if (contrabandRun) {
      // A type-10 run needs no gate: it is a fundable, top-of-band payday
      // (CARGO_TYPES type 10 carries the highest valueMultiplier), so taking it
      // is strictly better trading AND the pillar's supply at the same time.
      preferred = contrabandRun;
    } else {
      // MOVING HOUSE to the rim, on the other hand, is gated on the Guild marker
      // being cleared — the same gate the trader puts on its rim preference, and
      // for the reason the sweep measured rather than a theoretical one. Without
      // this line the smuggler emigrates to the rim inside the first month, where
      // every core-bound leg is unfundable on a junker drive: seeds 1, 2, 3 and 8
      // of the 1..8 × 300-day sweep ended on ~1 credit with 24-289 fuel-starved
      // days and a marker compounded past 3,900,000, and seed 2's zero-income
      // streak hit 7 (the invariant's bar is 5). With the gate the same four seeds
      // finish solvent. The rim is still this policy's home — it just earns its
      // passage first, exactly as the PRD's "one more run to the rim" frames it.
      const rimRun =
        state.player.debt === 0
          ? reachable.find((c) => STAR_SYSTEMS[c.destination]?.isRim === true)
          : undefined;
      if (rimRun) preferred = rimRun;
    }
  }
  // HEAD HOME TO SETTLE UP — the trader's preference, ported for a measured
  // reason. `planLoanRepay` is only legal AT a Hangout, and nothing else in this
  // policy ever routes back to one, so without this the day-1 working-capital
  // advance is never repaid: it accrues interest, the `loanHold` below holds its
  // whole balance back from the Guild marker forever, and BOTH ledgers compound
  // untouched (seed 8 of the 1..8 × 300-day sweep finished with a 1,982,209
  // marker while flying a perfectly healthy trade loop on ~9,000 credits a day).
  // Preference only, inside the fundable set, and only when the balance is
  // actually covered — it never flies a run it cannot fund to reach the desk.
  const loan = state.player.loan;
  if (
    preferred &&
    loan &&
    loan.dueDay - state.day <= TRADER_LOAN_HOME_WINDOW &&
    state.player.credits >= loan.outstanding
  ) {
    const homeRun = reachable.find((c) => isHangoutSystem(c.destination));
    if (homeRun) preferred = homeRun;
  }

  const primaryDest = state.player.activeContract
    ? state.player.activeContract.destination
    : (preferred?.destination ?? null);
  const primaryFuelNeed =
    primaryDest !== null ? playerJumpFuel(state, systemDistance(from, primaryDest)) : 0;

  // ---- Penny Wise, as WORKING CAPITAL (PRD §7.5) ---------------------------
  // The same day-1 advance `traderPolicy` takes, and for a sharper reason: a
  // failed pilot check BURNS the jump's fuel and leaves the ship at origin
  // (engine resolveTravel), so a thin purse plus one botched jump plus one
  // interdiction is enough to leave a smuggler holding a contract it can neither
  // fly nor abandon — the activeContract lock the T-1310 comments call a silent
  // strand. Measured without this block (seeds 1..8 × 300 days): seeds 3, 5, 7
  // and 8 locked inside the first week and never recovered (seed 3 sat at Sun-3
  // re-attempting the same jump for 294 days on 1 credit). The trader survives
  // the identical day-1 corner precisely BECAUSE it borrows. Sized to the larger
  // of the day's fuel shortfall and the working-capital gap, clamped by
  // `planLoanBorrow` into the CONTENT principal band.
  const fuelShortfall =
    primaryFuelNeed > ship.fuel
      ? (primaryFuelNeed - ship.fuel) * fuelDepotPrice - state.player.credits
      : 0;
  const workingCapitalShortfall =
    state.player.debt > 0 && state.player.credits < SMUGGLER_RESERVE
      ? SMUGGLER_RESERVE - state.player.credits
      : 0;
  const borrow = planLoanBorrow(state, ledger, Math.max(fuelShortfall, workingCapitalShortfall));
  let borrowed = 0;
  if (borrow) {
    // An EXTRA action on a normal working day (never a standalone day) — the
    // sign/travel below still runs, so the day keeps its income action.
    actions.push(borrow.action);
    borrowed = borrow.principal;
  }
  // Settle the balance before the day's spending starts, so a refuel can never
  // eat the money that was going to clear the desk.
  const repay = planLoanRepay(state, ledger);
  let repaid = 0;
  if (repay) {
    actions.push(repay);
    repaid = state.player.loan?.outstanding ?? 0;
  }

  // Size the refuel to guarantee today's leg (capped at the tank), never below
  // the working defaults — the T-1102 scarcity fix.
  const refuel = planRefuel(
    state,
    ledger,
    repaid,
    Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_THRESHOLD, primaryFuelNeed)),
    Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_TARGET, primaryFuelNeed)),
    borrowed,
  );
  let refuelCost = 0;
  if (refuel) {
    actions.push(refuel.action);
    refuelCost = refuel.cost;
  }

  const repair = planCrippledRepair(state, ledger, SMUGGLER_RESERVE, borrowed - repaid);
  if (repair) {
    actions.push(repair);
  } else if (ship.drives.condition < SMUGGLER_DRIVE_REPAIR_CONDITION) {
    // KEEP THE DRIVES SHARP. `jumpFuelCost` charges `21 - min(strength,21) +
    // (10 - condition)` per unit of distance, so a drive worn from condition 9 to
    // 7 TRIPLES the fuel bill of every leg this policy flies — and it flies the
    // long ones. `planCrippledRepair` above only fires on the HULL's fuel-ceiling
    // collapse, so nothing else in the sim ever notices a worn drive. Affordable
    // above the working reserve, dull die (a repair rolls no check).
    const quote = quoteShipyard(state, {
      type: 'Shipyard',
      action: 'repair',
      repairMode: 'all',
      spendDie: 0,
    });
    if (
      quote.ok &&
      state.player.credits + borrowed - repaid - refuelCost - quote.cost >= SMUGGLER_RESERVE
    ) {
      const die = ledger.takeWorst();
      if (die !== undefined) {
        actions.push({ type: 'Shipyard', action: 'repair', repairMode: 'all', spendDie: die });
      }
    }
  }

  const boughtFuel = refuel ? refuel.cost / fuelDepotPrice : 0;
  const postRefuelFuel = Math.min(ship.maxFuel, ship.fuel + boughtFuel);
  let projectedFuel = postRefuelFuel;

  if (state.player.activeContract) {
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
      projectedFuel -= primaryFuelNeed;
    }
  } else if (preferred && postRefuelFuel >= primaryFuelNeed) {
    const best = preferred;
    const signDie = ledger.takeWorst();
    const travelDie = ledger.takeBest();
    if (signDie !== undefined && travelDie !== undefined) {
      actions.push({
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: best.index,
        spendDie: signDie,
      });
      actions.push({ type: 'Travel', destinationId: best.destination, spendDie: travelDie });
      projectedFuel -= primaryFuelNeed;
    }
  } else if (STAR_SYSTEMS[from]?.isRim !== true) {
    // ---- The one gated DEADHEAD, mirroring the explorer's Sage leg ---------
    // Reached only when the board offered nothing fundable, so it costs the day
    // nothing it would have earned. Every gate is the explorer's: past the Tour
    // One boundary, genuinely flush, and — the load-bearing one — the tank AFTER
    // this turn's refuel already covers the whole hop. NEVER launch a leg you
    // cannot finish. `Travel` is itself an income action, so this cannot burn a
    // zero-income day.
    const target = nearestRimSystemId(from);
    const legFuel =
      target === null ? Infinity : playerJumpFuel(state, systemDistance(from, target));
    if (
      target !== null &&
      // Same nav gate as the sign above — never deadhead onto a jump the ship
      // cannot navigate.
      navBeatable(systemDistance(from, target)) &&
      state.day > SMUGGLER_RIM_DEADHEAD_FIRST_DAY &&
      state.player.credits - refuelCost >= SMUGGLER_RIM_DEADHEAD_RESERVE &&
      postRefuelFuel >= legFuel
    ) {
      const die = ledger.takeBest();
      if (die !== undefined) {
        actions.push({ type: 'Travel', destinationId: target, spendDie: die });
        projectedFuel -= legFuel;
      }
    }
  }

  // Off-lane sweeps with whatever sharp dice remain, while solvent and fuelled:
  // this is the POD supply line (Explore loot arms `signal.contraband.pending`,
  // which is what offers `derelict.sealed-pod` at the next dawn). Explore is an
  // income action, so a sweep day is never a zero-income day.
  // The floor DROPS on a day the plan has produced no income action at all —
  // typically a rim dawn whose board holds nothing both fundable and navigable.
  // Off-lane charting is then the only legal way to make progress, and refusing
  // it over a credit floor is precisely how a policy strands itself with a full
  // tank (measured at the flat 2,000 floor, seeds 1..20 × 300 days: seed 13 sat
  // at Mizar-9 for 11 straight days on 1,755 credits and a 270-unit tank; seeds
  // 12, 16 and 19 idled 7, 7 and 5). The high floor still applies on a normal
  // working day, because exploring down to the last credit on days that ALREADY
  // earn is its own spiral (measured at a flat 500 floor: seed 1 idled 183 days).
  const exploreFloor = actions.some(isIncomeAction)
    ? SMUGGLER_EXPLORE_RESERVE
    : SMUGGLER_IDLE_EXPLORE_RESERVE;
  while (
    state.player.credits + borrowed - refuelCost - repaid > exploreFloor &&
    projectedFuel >= EXPLORATION_FUEL_COST &&
    ledger.remaining() > 0
  ) {
    const die = ledger.takeBest();
    if (die === undefined) break;
    actions.push({ type: 'Explore', spendDie: die });
    projectedFuel -= EXPLORATION_FUEL_COST;
  }

  // T-1601a's protection, ported: while a Penny Wise balance is live and unpaid
  // today, hold it back on top of the operating reserve rather than sending it to
  // the Guild. A defaulted loan grudge-weights Penny Wise into the interceptor
  // draw AND multiplies the encounter chance until cleared; a late marker does
  // neither.
  const loanHold = state.player.loan && !repay ? state.player.loan.outstanding : 0;
  const debtPayment = planDebtPayment(
    state,
    SMUGGLER_RESERVE + loanHold,
    refuelCost + repaid,
    borrowed,
  );
  if (debtPayment) actions.push(debtPayment);

  return actions.length > 0 ? actions : [{ type: 'Wait' }];
};

// ---------------------------------------------------------------------------
// T-1601b · GAMBLER. The Spacers Hangout is a core PRD verb (§7 "Visit the
// Hangout", §7.5's first out, §6's Spacer's Dare wire line) that T-1303 built
// and T-1404 surfaced, but which no balance instrument ever PLAYED — the trader
// only ever visits the desk to borrow and repay (T-1601a). This policy plays the
// tables: an otherwise ordinary trading career that routes through the Hangout
// and wagers on opposed-GUILE Dares while it is standing there.
//
// Policy tuning, not game data (same justification as the smuggler's constants
// above): the Dare's own band — DARE_MIN_WAGER / DARE_MAX_WAGER — is CONTENT and
// is imported, never restated, exactly as planLoanBorrow treats the lending band.
// ---------------------------------------------------------------------------

/** The working float the gambler never stakes into. Mirrors TRADER_RESERVE, and
 *  is deliberately larger than a full day of dares (GAMBLER_MAX_DARES_PER_DAY ×
 *  DARE_MAX_WAGER = 1,000) so that even a total wipeout at the tables leaves the
 *  day's refuel/repair budget intact — which is what makes it safe to settle the
 *  stakes FIRST in the day's plan. */
const GAMBLER_RESERVE = 3000;
/** Share of the bankroll ABOVE the reserve the gambler is willing to put on one
 *  hand. The engine clamps the request into the content band regardless, so this
 *  only decides where inside that band a given day's stake lands. */
const GAMBLER_BANKROLL_FRACTION = 0.1;
/** Dice budget guard: at most two hands a day, so a Hangout dawn still has dice
 *  left for the sign/travel pair that keeps the day an income day. */
const GAMBLER_MAX_DARES_PER_DAY = 2;

/**
 * One hand of Spacer's Dare. The preconditions MIRROR `resolveVisitHangout` plus
 * day.ts's hangout/encounter gates exactly, so the policy can never burn a die on
 * a typed refusal (the `hangoutPlay.failedVisits === 0` assertion is what holds
 * this honest):
 *   - no encounter, and a `hasHangout` system (day.ts emits ActionBlocked
 *     otherwise) — read through `isHangoutSystem`, never a hard-coded id;
 *   - a co-located NPC to deal (`currentSystemId === player's`), else the engine
 *     returns a 'no-opponent' fail;
 *   - the RICHEST such NPC, first-wins on a tie. This is load-bearing, not
 *     cosmetic: the engine caps the wager at `min(DARE_MAX_WAGER, playerCredits,
 *     dealerCredits)`, so dealing with a broke NPC produces a zero-or-tiny-stake
 *     hand that inflates the dare count and drags `expectedValuePerDare` toward
 *     0 — the one value the acceptance forbids;
 *   - the purse is above the reserve and the dealer can cover the minimum stake.
 *
 * The die is the BEST remaining, unlike planLoanBorrow / planLoanRepay which take
 * the dullest: borrowing and repaying roll no check, but a Dare is a real opposed
 * GUILE check against the dealer's live total — the sharper die wins hands.
 *
 * CRITICAL (same warning planLoanBorrow carries): the caller must queue this as
 * an EXTRA action on an otherwise normal working day, never as a standalone day.
 * `VisitHangout` is not an income action (`isIncomeAction`), so a gamble-only day
 * has `incomeActionCount === 0` and walks the poverty-trap invariant.
 *
 * `credits` is the purse the hand will actually be played against — the caller
 * passes the DAWN credits for the first hand and subtracts each queued stake for
 * the next, because these planners are pure and read the dawn state.
 */
function planDare(state: GameState, ledger: DieLedger, credits: number): PlayerAction | null {
  if (state.encounter) return null;
  if (!isHangoutSystem(state.player.currentSystemId)) return null;

  let dealer: GameState['npcs'][number] | null = null;
  for (const npc of state.npcs) {
    if (npc.currentSystemId !== state.player.currentSystemId) continue;
    if (dealer === null || npc.credits > dealer.credits) dealer = npc;
  }
  if (dealer === null) return null;
  // A dealer who cannot cover the minimum stake makes a zero-EV hand — skip it.
  if (dealer.credits < DARE_MIN_WAGER) return null;

  const bankroll = credits - GAMBLER_RESERVE;
  if (bankroll < DARE_MIN_WAGER) return null;
  // Clamped with the CONTENT band constants, never with restated numbers.
  const wager = Math.max(
    DARE_MIN_WAGER,
    Math.min(DARE_MAX_WAGER, Math.floor(bankroll * GAMBLER_BANKROLL_FRACTION)),
  );

  const die = ledger.takeBest();
  if (die === undefined) return null;
  return { type: 'VisitHangout', venue: 'dare', opponentId: dealer.id, wager, spendDie: die };
}

/**
 * GAMBLER — a working trader who plays the tables. The day is the trader's
 * (refuel sized to the leg → crippled repair → richest NET fundable run → fly it
 * → pay the Guild), with two changes:
 *   1. inside the already-fundable set it PREFERS a run that ends at a Hangout
 *      system, so it is standing at the tables on the next dawn (the same shape
 *      as the trader's head-home preference, minus the loan condition);
 *   2. while it IS at a Hangout, it queues up to GAMBLER_MAX_DARES_PER_DAY hands
 *      as EXTRA actions on that working day.
 *
 * The working day is planned FIRST so the sign/travel dice are reserved before
 * the tables get what is left; the dares are then placed at the FRONT of the
 * returned plan so the stakes settle before the day's spending. That ordering is
 * only safe because GAMBLER_RESERVE exceeds a full day of maximum stakes.
 */
export const gamblerPolicy: SimPolicy = ({ state }) => {
  const ledger = dieLedger(state);
  if (state.encounter) return planPacifistCombat(state, ledger);

  const actions: PlayerAction[] = [];
  const ship = state.player.ship;
  const from = state.player.currentSystemId;

  const storyletAction = chooseStoryletAction(state);
  if (storyletAction) {
    if (storyletAction.type === 'Storylet' && storyletAction.spendDie === undefined) {
      actions.push(storyletAction);
    } else {
      return [storyletAction];
    }
  }

  const fuelDepotPrice = state.market.localFuelPrice || 5;
  const ranked = rankedContracts(state);
  const signableWithin = (cap: number) =>
    ranked
      .filter((c) => c.fuel <= cap)
      .map((c) => ({ ...c, net: c.payment - c.fuel * fuelDepotPrice }))
      .filter((c) => c.net > 0)
      .sort((a, b) => b.net - a.net || a.index - b.index);
  let reachable = signableWithin(ship.maxFuel * SIGN_FUEL_FRACTION);
  // The T-1104 full-tank relaxation (see traderPolicy) — the anti-strand fix.
  if (reachable.length === 0) {
    reachable = signableWithin(ship.maxFuel);
  }

  // Head for the tables: a fundable run that ENDS at a Hangout is preferred over
  // an equally fundable one that does not. Preference only, inside the fundable
  // set — the gambler never flies a run it cannot fund just to reach a game.
  let preferred = reachable.length > 0 ? reachable[0] : null;
  if (preferred) {
    const tablesRun = reachable.find((c) => isHangoutSystem(c.destination));
    if (tablesRun) preferred = tablesRun;
  }

  const primaryDest = state.player.activeContract
    ? state.player.activeContract.destination
    : (preferred?.destination ?? null);
  const primaryFuelNeed =
    primaryDest !== null ? playerJumpFuel(state, systemDistance(from, primaryDest)) : 0;

  // The trader's Penny Wise machinery, and doubly in character here: the gambler
  // is already standing at the desk. It is also load-bearing for survival — a
  // botched pilot check burns the leg's fuel and leaves the ship at origin, so a
  // thin purse plus one bad jump strands the ship on a contract it can neither
  // fly nor abandon. Measured without it (seeds 1..8 × 300 days): seeds 3 and 7
  // locked in the first week and finished on 1-2 credits with markers compounded
  // past 5,100,000 and 294 fuel-starved days. Queued FIRST, and always as an
  // EXTRA action on a working day (never a standalone day — see planLoanBorrow).
  const fuelShortfall =
    primaryFuelNeed > ship.fuel
      ? (primaryFuelNeed - ship.fuel) * fuelDepotPrice - state.player.credits
      : 0;
  const workingCapitalShortfall =
    state.player.debt > 0 && state.player.credits < GAMBLER_RESERVE
      ? GAMBLER_RESERVE - state.player.credits
      : 0;
  const borrow = planLoanBorrow(state, ledger, Math.max(fuelShortfall, workingCapitalShortfall));
  let borrowed = 0;
  if (borrow) {
    actions.push(borrow.action);
    borrowed = borrow.principal;
  }
  const repay = planLoanRepay(state, ledger);
  let repaid = 0;
  if (repay) {
    actions.push(repay);
    repaid = state.player.loan?.outstanding ?? 0;
  }

  const refuel = planRefuel(
    state,
    ledger,
    repaid,
    Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_THRESHOLD, primaryFuelNeed)),
    Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_TARGET, primaryFuelNeed)),
    borrowed,
  );
  let refuelCost = 0;
  if (refuel) {
    actions.push(refuel.action);
    refuelCost = refuel.cost;
  }

  const repair = planCrippledRepair(state, ledger, GAMBLER_RESERVE, borrowed - repaid);
  if (repair) actions.push(repair);

  const boughtFuel = refuel ? refuel.cost / fuelDepotPrice : 0;
  const availableFuel = Math.min(ship.maxFuel, ship.fuel + boughtFuel);

  if (state.player.activeContract) {
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
    }
  } else if (preferred && availableFuel >= primaryFuelNeed) {
    const best = preferred;
    const signDie = ledger.takeWorst();
    const travelDie = ledger.takeBest();
    if (signDie !== undefined && travelDie !== undefined) {
      actions.push({
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: best.index,
        spendDie: signDie,
      });
      actions.push({ type: 'Travel', destinationId: best.destination, spendDie: travelDie });
    }
  }

  // ---- Nothing to fly? Go where the tables are -----------------------------
  // Reached only when the board held no fundable run at all, so this costs the
  // day nothing it would have earned — and a gambler with no work on the board
  // heading for the Hangout is the most in-character move this policy has. It is
  // also the anti-idle fix: `Travel` IS an income action, and without it a rich
  // gambler simply stops (measured on seeds 1..20 × 300 days: seed 19 sat at
  // Rigel-8 for 5 straight days on 50,546 credits and a 117-unit tank, level
  // with the poverty-trap bar). Never launches a leg the tank cannot finish.
  if (!state.player.activeContract && !actions.some(isIncomeAction)) {
    let target: number | null = null;
    let bestDistance = Infinity;
    for (const id of hangoutSystemIds()) {
      if (id === from || isGatedDestination(id)) continue;
      const dist = systemDistance(from, id);
      if (dist < bestDistance) {
        bestDistance = dist;
        target = id;
      }
    }
    if (target !== null && availableFuel >= playerJumpFuel(state, bestDistance)) {
      const die = ledger.takeBest();
      if (die !== undefined) {
        actions.push({ type: 'Travel', destinationId: target, spendDie: die });
      }
    }
  }

  // T-1601a's protection: while a Penny Wise balance is live and unpaid today,
  // hold it back from the Guild marker (a default grudge-weights Penny Wise into
  // the interceptor draw and multiplies the encounter chance until cleared).
  const loanHold = state.player.loan && !repay ? state.player.loan.outstanding : 0;
  const debtPayment = planDebtPayment(
    state,
    GAMBLER_RESERVE + loanHold,
    refuelCost + repaid,
    borrowed,
  );
  if (debtPayment) actions.push(debtPayment);

  // ---- The tables, with whatever dice the working day left over -------------
  // Each hand is re-clamped against the credits the previous one would leave in
  // the worst case (a loss), so two queued stakes can never over-commit the purse.
  const dares: PlayerAction[] = [];
  let purse = state.player.credits;
  for (let hand = 0; hand < GAMBLER_MAX_DARES_PER_DAY; hand += 1) {
    const dare = planDare(state, ledger, purse);
    if (!dare) break;
    dares.push(dare);
    purse -= dare.type === 'VisitHangout' ? (dare.wager ?? 0) : 0;
  }

  const plan = [...dares, ...actions];
  return plan.length > 0 ? plan : [{ type: 'Wait' }];
};

function componentTradeInValue(strength: number): number {
  if (strength < 1) return 0;
  if (strength === 1) return 25;
  if (strength === 2) return 50;
  if (strength === 3) return 100;
  if (strength === 4) return 200;
  if (strength === 5) return 400;
  if (strength === 6) return 700;
  if (strength === 7) return 1000;
  if (strength === 8) return 2000;
  return 3000;
}

/** Net cost of a component-tier upgrade — the yard sticker price less the
 *  trade-in on the current fit. Mirrors the engine's shipyard math so the
 *  fighter never burns a die on an unaffordable purchase. */
function componentTierNetCost(
  state: GameState,
  component: 'weapons' | 'hull' | 'shields' | 'drives',
  tier: number,
): number {
  const price = YARD_COMPONENT_TIER_PRICES[tier - 1] ?? Infinity;
  let strength = state.player.ship[component].strength;
  if (component === 'hull' && state.player.ship.hasTitaniumHull && strength > 9) strength -= 10;
  return Math.max(0, price - componentTradeInValue(strength));
}

const FIGHTER_RESERVE = 3000;

/**
 * T-1601a · The fighter's special-equipment shopping list, and the ONE ordering
 * fact that makes it work: AUTO_REPAIR is priced `min(hull.strength * 1000,
 * 20000)` (engine shipyard.ts `specialEquipmentCost`, mirrored in
 * `simSpecialEquipmentCost`), so it costs **1,000 credits while the ship is still
 * on the junker's strength-1 hull and 20,000 the moment the tier-3 hull refit
 * lands**. A player who wants it buys it FIRST — which is why `fighterPolicy`
 * now runs `planSpecialEquipment` BEFORE `planFighterUpgrade`, instead of after.
 * It carries no renown gate either, so it is the only special equipment a
 * low-renown fighter can reach at all, and it is what makes the T-1206 module
 * genuinely load-bearing in this policy's play (`equipmentUse.autoRepairDusks`).
 *
 * CLOAKER and TITANIUM_HULL are deliberately absent: both conflict with this list
 * under the engine's exclusion ladder (see `planSpecialEquipment`).
 */
const FIGHTER_EQUIPMENT_PRIORITY: readonly SpecialEquipmentId[] = [
  'AUTO_REPAIR',
  'STAR_BUSTER',
  'ARCH_ANGEL',
  'ASTRAXIAL_HULL',
];

/** The fighter's shopping list, cheapest meaningful refit first: a real gun,
 *  then a bigger gun, then a tougher hull/shields/drives — each bought only when
 *  the surplus above the operating reserve covers it. */
function planFighterUpgrade(state: GameState, ledger: DieLedger): PlayerAction | null {
  const ship = state.player.ship;
  const wishlist: { component: 'weapons' | 'hull' | 'shields' | 'drives'; tier: number }[] = [];
  if (ship.weapons.strength < 30) wishlist.push({ component: 'weapons', tier: 3 });
  else if (ship.weapons.strength < 50) wishlist.push({ component: 'weapons', tier: 5 });
  if (ship.hull.strength < 30) wishlist.push({ component: 'hull', tier: 3 });
  if (ship.shields.strength < 30) wishlist.push({ component: 'shields', tier: 3 });
  if (ship.drives.strength < 30) wishlist.push({ component: 'drives', tier: 3 });

  for (const pick of wishlist) {
    const cost = componentTierNetCost(state, pick.component, pick.tier);
    if (state.player.credits >= FIGHTER_RESERVE + cost) {
      const die = ledger.takeWorst();
      if (die === undefined) return null;
      return {
        type: 'Shipyard',
        action: 'buy-component-tier',
        component: pick.component,
        tier: pick.tier,
        spendDie: die,
      };
    }
  }
  return null;
}

/**
 * FIGHTER — upgrade-then-hunt. It funds itself with a contract run each day
 * (fuel gating respected), reinvests the surplus into weapon/hull/shield/drive
 * tiers, and when an interceptor jumps it, it FIGHTS the ones it can drop — one
 * volley per point of enemy hull, spending the sharpest dice, but only when the
 * tank holds enough fuel for the whole exchange. Outmatched (not enough fuel or
 * hand for the full kill) it runs, and if it can't even run it talks its way out.
 */
export const fighterPolicy: SimPolicy = ({ state }) => {
  const ledger = dieLedger(state);

  if (state.encounter) {
    const encounter = state.encounter;
    const targetId = encounter.interceptor.id;
    const hull = Math.max(1, encounter.enemyHull);
    // T-1205: a winning volley now removes `weaponVolleyDamage` hull points, not a
    // flat 1, so the clean kill takes CEIL(hull / volleyDamage) volleys — fewer
    // with an upgraded gun. Queuing the old raw `hull` count over-fired once
    // weapons were load-bearing: the enemy died early and the surplus Combat
    // actions hit no encounter (a throw). Sizing the queue to the real damage is
    // both the fix and the reason an upgraded fighter wins more (this task's A/B).
    // T-1601a: this window is already the WIDE one, and deliberately stays so —
    // `volleys` is the min of what the enemy needs, what the tank can burn and
    // what the hand holds, and any value >= 1 commits, so a PARTIAL volley is
    // taken rather than bailing to the pacifist path. That is the right trade
    // once the fit is load-bearing (T-1205/T-1206): enemy hull carries between
    // rounds and upgraded shields absorb the counter-fire. It is also where the
    // report's `equipmentUse.upgradedVolleys` and `shieldAbsorbedPoints` come
    // from. The pacifist fallback below is reached only on a dry tank or an
    // exhausted hand — i.e. when there is genuinely no volley to throw.
    const volleysNeeded = Math.ceil(hull / weaponVolleyDamage(state.player.ship));
    const fuelVolleys = Math.floor(state.player.ship.fuel / FIGHT_FUEL_COST);
    const volleys = Math.min(volleysNeeded, fuelVolleys, ledger.remaining());
    if (volleys >= 1) {
      // Queue exactly `volleys` fights — never more than the enemy's hull, so a
      // clean sweep resolves on the final volley without a dangling action.
      const fights: PlayerAction[] = [];
      for (let i = 0; i < volleys; i += 1) {
        const die = ledger.takeBest();
        if (die === undefined) break;
        fights.push({ type: 'Combat', stance: 'fight', targetId, spendDie: die });
      }
      if (fights.length > 0) return fights;
    }
    // Can't win this one cleanly: fall back to the pacifist escape logic.
    return planPacifistCombat(state, ledger);
  }

  const actions: PlayerAction[] = [];
  const refuel = planRefuel(state, ledger, 0);
  if (refuel) actions.push(refuel.action);

  // T-1104: only sign a contract whose jump fits inside SIGN_FUEL_FRACTION of the
  // tank — the SAME reachability gate trader/veteran already apply. Before
  // rollContract issued rim destinations the richest contract was always a
  // fuelable core run, so picking ranked[0] raw was safe; now the richest is
  // often a long, high-DC rim run this ship can neither fuel nor fly, and signing
  // it locked the contract (a failed jump never clears activeContract) and
  // poverty-trapped the fighter. Filtering to reachable runs keeps "richest run"
  // intent while refusing the unwinnable rim temptation.
  const ranked = rankedContracts(state);
  const signFuelCap = state.player.ship.maxFuel * SIGN_FUEL_FRACTION;
  const reachable = ranked.filter((c) => c.fuel <= signFuelCap);
  if (state.player.activeContract) {
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
    }
  } else if (reachable.length > 0) {
    const best = reachable[0];
    const signDie = ledger.takeWorst();
    const travelDie = ledger.takeBest();
    if (signDie !== undefined && travelDie !== undefined) {
      actions.push({
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: best.index,
        spendDie: signDie,
      });
      actions.push({ type: 'Travel', destinationId: best.destination, spendDie: travelDie });
    }
  }

  // T-1601a: special equipment goes FIRST for the fighter. AUTO_REPAIR is priced
  // off the CURRENT hull strength, so buying it before `planFighterUpgrade` lands
  // the tier-3 hull is the difference between 1,000 and 20,000 credits — see
  // FIGHTER_EQUIPMENT_PRIORITY. The offensive items behind it (STAR_BUSTER /
  // ARCH_ANGEL at CAPTAIN, ASTRAXIAL_HULL at GIGA_HERO) still open only through
  // EARNED rank (T-114a); only the ORDER relative to the component tiers moved.
  const special = planSpecialEquipment(state, ledger, FIGHTER_RESERVE, FIGHTER_EQUIPMENT_PRIORITY);
  if (special) actions.push(special);

  const upgrade = planFighterUpgrade(state, ledger);
  if (upgrade) actions.push(upgrade);

  // Keep the marker from festering, but never at the cost of the war chest.
  const debtPayment = planDebtPayment(state, FIGHTER_RESERVE, refuel?.cost ?? 0);
  if (debtPayment) actions.push(debtPayment);

  return actions.length > 0 ? actions : [{ type: 'Wait' }];
};

const EXPLORER_RESERVE = 2000;
// T-1310: a small hard credit floor the explorer keeps back for fuel. Low on
// purpose — a HIGH floor becomes its own strand (it blocks the very refuel needed to
// escape a low-fuel corner), and with the early drives upgrade below fuel is cheap
// enough that a thin reserve always buys enough range to reach the next contract.
const EXPLORER_FUEL_RESERVE = 50;
// T-1601a: what it costs to be allowed to DEADHEAD to the Sage of Mizar-9. A
// decode trip earns nothing on the way out — it is a rim round-trip paid for in
// fuel — so it is only a good move from a genuinely flush position. Measured
// WITHOUT these two gates (seeds 1..12 × 300 days): the explorer started decode
// trips inside the first month, arrived at rim ports broke, and three of twelve
// seeds finished on ~50 credits with 20-250 fuel-starved days, against zero
// starved days and six-figure balances before the leg existed. WITH them (seeds
// 1..20 × 300 days): 18 of 20 careers decode every fragment they pull and finish
// on six figures, worst zero-income streak 3 (the pre-T-1601a baseline's worst
// was 4). The deadhead is NOT dead code at this value — disabling it entirely
// over the same sweep drops the total decode count from 203 to 161. Sweep also
// showed values from 2,000 to 10,000 producing near-identical outcomes; the
// conservative end is kept because the failure it guards against is a strand.
const EXPLORER_DECODE_TRIP_RESERVE = 10000;
/** Not before the Tour One marker has resolved (PRD §5.1 / engine day-30
 *  resolution): the first month is where this policy is poorest, and a deadhead
 *  flown out of it is what turned into the strands above. */
const EXPLORER_DECODE_TRIP_FIRST_DAY = 30;

/**
 * EXPLORER — fragment chaser. Off-lane sweeps are a credit SINK (a detour burns
 * 80 fuel for a thin salvage roll), so the explorer funds itself with one
 * contract run a day and pours the surplus fuel and dice into Explore attempts,
 * charting POIs and pulling Signal fragments while staying solvent. Weak hull,
 * so it talks/ runs past interceptors.
 */
export const explorerPolicy: SimPolicy = ({ state }) => {
  const ledger = dieLedger(state);
  if (state.encounter) return planPacifistCombat(state, ledger);

  const actions: PlayerAction[] = [];

  // T-1310: Nemesis-arc reachability. The Wise One of Polaris-1 (system 17) is the
  // ONLY source of frag-nemesis-01 and the sole key into the decode arc (PRD §8.3).
  // Polaris-1 is a rim system no core contract routes to under starter drives (its
  // nearest core neighbour is a ~22-unit hop = 264 fuel, over the 180 sign-cap), so
  // the explorer reaches it through LEGAL actions only (below): it resolves the
  // offered wire rumor / Wise One hook, upgrades its drives (making the rim hop cost
  // a fraction of the tank), banks enough to afford the 500cr fragment, then flies
  // STRAIGHT to Polaris-1. No state poke, no teleport. Pursuit runs from the hook's
  // day-25 window open until the fragment is in hand.
  const pursuingArc = state.day >= 25 && !hasFragment(state.player.nemesisFile, 'frag-nemesis-01');

  // T-1601a · The DECODE leg. Acquiring fragments was already real (Explore →
  // POI loot pool → FragmentAcquired), but nothing ever routed the explorer to
  // the Sage of Mizar-9 (system 18), the game's only decoder — so everything it
  // pulled sat raw forever. This is the second pursuit phase, and it is
  // deliberately SEQUENCED AFTER the Polaris pursuit (`!pursuingArc`):
  // campaign-nemesis.test.ts requires the arc to open by day 80 on >= 80% of 50
  // seeds, and that sweep ends the instant frag-nemesis-01 lands — so a decode
  // leg that can only run once the Polaris pursuit is satisfied cannot regress
  // it. Unlike arc pursuit, Explore is NOT suppressed here: decoding costs
  // nothing but the jump, so the explore↔decode loop should keep charting.
  const decodePursuit = !pursuingArc && hasAnyUndecoded(state.player.nemesisFile);

  // Resolve any offered storylet — the wire rumor, the Wise One buy-fragment hook
  // (grants frag-nemesis-01), and (at Mizar-9) the Sage decodes all surface here. A
  // no-die choice is resolved INLINE: it costs no die, so the day still does its
  // income work and the arc never burns a zero-income day (the poverty-trap
  // invariant the explorer is held to). A die-consuming choice is taken as a
  // standalone day (matches veteranPolicy) so it never collides with the ledger.
  // T-1601a: while chasing a decode, a Sage decode offer outranks whatever sorts
  // first on the board (see chooseDecodeStoryletAction).
  const storyletAction =
    (decodePursuit ? chooseDecodeStoryletAction(state) : null) ?? chooseStoryletAction(state);
  if (storyletAction) {
    // chooseStoryletAction always returns a Storylet action; a no-die choice omits
    // spendDie (resolve inline), a die choice sets it (resolve as a standalone day).
    if (storyletAction.type === 'Storylet' && storyletAction.spendDie === undefined) {
      actions.push(storyletAction);
    } else {
      return [storyletAction];
    }
  }

  // T-1205: repair a hull chipped down enough to collapse the fuel ceiling before
  // the explorer strands (it burns fuel fastest, so it feels a shrunk tank first).
  const crippledRepair = planCrippledRepair(state, ledger, EXPLORER_RESERVE);
  if (crippledRepair) actions.push(crippledRepair);

  // T-1310: the explorer invests in DRIVES early — its defining upgrade, the way the
  // fighter buys guns. A tier-3 drive (strength 30) costs ~0 net (the strength-10
  // trade-in dwarfs the 200cr sticker) and drops per-unit jump fuel from 12 to ~1, so
  // the same tank reaches six times as far. This is both what a real explorer does
  // and the structural fix for the strands above: with near-free fuel the ship almost
  // never burns itself into an unrefuelable corner, and — once bought — the rim hop to
  // the Wise One of Polaris-1 (system 17) fuels for a fraction of the tank, so arc
  // pursuit can fly straight there. Component tiers are NOT renown-gated (engine
  // shipyard.ts), so a low-renown explorer can buy them. Gated above a working reserve
  // so it never spends its last credits on the yard.
  if (state.player.ship.drives.strength < 30 && state.player.credits >= EXPLORER_RESERVE / 2) {
    const die = ledger.takeWorst();
    if (die !== undefined) {
      actions.push({
        type: 'Shipyard',
        action: 'buy-component-tier',
        component: 'drives',
        tier: 3,
        spendDie: die,
      });
    }
  }

  const from = state.player.currentSystemId;
  const fuelPriceNow = state.market.localFuelPrice || 5;
  const drivesReady = state.player.ship.drives.strength >= 20;

  // T-1310: hold back a small credit reserve so a refuel is always possible next
  // turn — the explorer used to pour its last credits into fuel (floor 0), then the
  // fuel burned down until it was too broke to refuel and too empty to reach even
  // the nearest system, freezing there for the rest of the campaign (a silent strand
  // the poverty-trap check misses, since a failed Travel still counts as income). The
  // Wise One's 500cr fragment is NOT protected by the floor (a high floor re-strands);
  // instead the flight to Polaris-1 below only launches once the ship can afford it.
  const refuelFloor = EXPLORER_FUEL_RESERVE;
  const refuel = planRefuel(state, ledger, refuelFloor, 200, 400);
  // T-1310: refuel BEFORE the jump. The old order pushed the refuel AFTER the travel
  // action, so the ship jumped on its current (possibly near-empty) tank, failed the
  // jump, and then got stuck on an active contract it could neither reach nor abandon
  // — refuelling a ship that had already frozen at the wrong system. Topping the tank
  // first makes sign+refuel+travel a single completable delivery.
  if (refuel) actions.push(refuel.action);
  const postRefuelFuel = state.player.ship.fuel + (refuel ? refuel.cost / fuelPriceNow : 0);

  // T-1104: reachability gate (see fighterPolicy) — refuse the unfuelable rim
  // run the richest-first ranking would otherwise sign and get stranded on.
  // T-1310: ALSO bound by the fuel the ship will actually have AFTER this turn's
  // refuel (postRefuelFuel), capped by the tank-fraction sign-cap. Signing a contract
  // the ship can neither fly nor fund was the other half of the freeze. Bounding by
  // the funded, topped tank makes a low-fuel explorer take a SHORT reachable run
  // instead, earn, and fly on — which is also what lets arc pursuit reach Polaris-1.
  const ranked = rankedContracts(state);
  const signFuelCap = state.player.ship.maxFuel * SIGN_FUEL_FRACTION;
  const flyCap = Math.min(signFuelCap, postRefuelFuel);
  let reachable = ranked.filter((c) => c.fuel <= flyCap);
  // T-1601a: the T-1104 relaxation the trader has always had, ported to the
  // explorer. From a RIM port every core-bound leg exceeds SIGN_FUEL_FRACTION of
  // the tank, so `reachable` comes back empty and the explorer — which cannot
  // Explore below EXPLORER_RESERVE either — has NO legal move and Waits forever
  // (measured before this line: seed 16 sat at Mizar-9 for 48 straight days after
  // a ship loss left it at the rim on a junker drive with 340 credits). The
  // decode leg above makes ending a day at a rim port routine, so the corner has
  // to be closed here. When nothing fits the margin cap, relax to the FULL funded
  // tank: take the run the ship can actually complete, accepting the thinner
  // re-flight margin, exactly as `traderPolicy` does. Reader: the poverty-trap
  // invariant in campaign-policies.test.ts (streak < 5).
  if (reachable.length === 0) {
    reachable = ranked.filter((c) => c.fuel <= postRefuelFuel);
  }
  if (state.player.activeContract) {
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
    }
  } else if (pursuingArc && drivesReady && from !== 17 && state.player.credits >= 550) {
    // T-1310: drives upgraded and the 500cr fragment is affordable — fly STRAIGHT to
    // Polaris-1 (system 17) to reach the Wise One, the sole grantor of frag-nemesis-01.
    // Direct travel needs no contract and system 17 is not a gated destination (engine
    // day.ts / isGatedDestination); the upgraded drive makes the hop cost a fraction of
    // the tank, so a plain Travel gets there instead of waiting on a rare dest-17
    // contract to happen onto a board. The >=550 gate means the ship arrives able to
    // buy the fragment (chooseStoryletAction takes buy-fragment only when credits>=500);
    // until then it banks net-positive runs below.
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({ type: 'Travel', destinationId: 17, spendDie: die });
    }
  } else if (
    decodePursuit &&
    drivesReady &&
    from !== SAGE_SYSTEM_ID &&
    // FUELLED, FUNDED and out of Tour One — all three required. Mizar-9 is a RIM
    // system: an explorer that deadheads for it on a thin tank burns days on
    // failed jumps and lands broke at a rim port where no contract is within the
    // sign-cap and no Explore is affordable — a silent strand (measured before
    // these gates: seed 16 sat at Mizar-9 for 48 straight days). So the detour
    // only launches when the tank can already make the hop after this turn's
    // refuel and the career is genuinely flush. Same shape as the Polaris leg's
    // `>= 550` affordability gate above: never start a pursuit leg you cannot
    // finish. See EXPLORER_DECODE_TRIP_RESERVE for the sweep behind the numbers.
    postRefuelFuel >= playerJumpFuel(state, systemDistance(from, SAGE_SYSTEM_ID)) &&
    state.player.credits >= EXPLORER_DECODE_TRIP_RESERVE &&
    state.day > EXPLORER_DECODE_TRIP_FIRST_DAY
  ) {
    // T-1601a: fly STRAIGHT to the Sage of Mizar-9 (system 18) with a held, raw
    // fragment — exactly the argument the Polaris leg above already documents:
    // system 18 is not gated (isGatedDestination), and the upgraded drive makes
    // the hop a fraction of the tank, so a plain legal Travel gets there instead
    // of waiting on a rare dest-18 contract to happen onto a board. No state
    // poke, no teleport. The Sage's decode is die-free and resolves inline on the
    // following dawn, so the round trip costs fuel and a jump, never an income
    // day (Travel is itself an income action for the poverty-trap invariant).
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({ type: 'Travel', destinationId: SAGE_SYSTEM_ID, spendDie: die });
    }
  } else if (reachable.length > 0) {
    // T-1310: during pursuit, bank on NET-POSITIVE runs only (payment beats the fuel
    // bill at the local depot), so credits actually climb toward the drives tier and
    // the fragment — the raw richest-first pick can be a fuel loss that keeps the
    // spend-to-zero explorer broke. Outside pursuit, keep the richest reachable run.
    let best = reachable[0];
    if (pursuingArc) {
      const netPositive = reachable
        .map((c) => ({ ...c, net: c.payment - c.fuel * fuelPriceNow }))
        .filter((c) => c.net > 0)
        .sort((a, b) => b.net - a.net || a.index - b.index);
      if (netPositive.length > 0) best = netPositive[0];
    } else if (decodePursuit) {
      // T-1601a: the PAID decode trip. A fundable run that already ends at
      // Mizar-9 carries the explorer to the Sage AND gets paid for it, so it is
      // always preferred over the deadhead above and carries none of its gates —
      // it costs nothing the day would not have spent anyway. Preference only,
      // inside the already-fundable set.
      const sageRun = reachable.find((c) => c.destination === SAGE_SYSTEM_ID);
      if (sageRun) best = sageRun;
    }
    const signDie = ledger.takeWorst();
    const travelDie = ledger.takeBest();
    if (signDie !== undefined && travelDie !== undefined) {
      actions.push({
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: best.index,
        spendDie: signDie,
      });
      actions.push({ type: 'Travel', destinationId: best.destination, spendDie: travelDie });
    }
  }

  // Off-lane sweeps with whatever sharp dice remain, while solvent and fuelled.
  // Project the tank forward: post-refuel fuel, less one jump's worth already
  // committed to the delivery, then spend the rest on Explore detours (each burns
  // EXPLORATION_FUEL_COST).
  // T-1310: SUPPRESSED during arc pursuit. Exploring is the explorer's credit sink
  // (it refuels to explore, draining credits to the solvency floor), which left it
  // too broke to ever afford the drives tier or the 500cr Wise One fragment. While
  // pursuing the arc the explorer banks its contract income instead, so the tier and
  // the fragment become affordable; normal off-lane charting resumes the moment the
  // fragment is in hand (pursuit ends) or before day 25.
  if (!pursuingArc) {
    let projectedFuel = postRefuelFuel;
    if (actions.some((action) => action.type === 'Travel')) {
      projectedFuel -= playerJumpFuel(state, 5);
    }
    while (
      state.player.credits > EXPLORER_RESERVE &&
      projectedFuel >= EXPLORATION_FUEL_COST &&
      ledger.remaining() > 0
    ) {
      const die = ledger.takeBest();
      if (die === undefined) break;
      actions.push({ type: 'Explore', spendDie: die });
      projectedFuel -= EXPLORATION_FUEL_COST;
    }
  }

  return actions.length > 0 ? actions : [{ type: 'Wait' }];
};

/** Mirror of the engine's private `specialEquipmentCost` (shipyard.ts) so a
 *  policy never burns a die on an unaffordable special-equipment purchase. */
function simSpecialEquipmentCost(state: GameState, equipment: SpecialEquipmentId): number {
  const hullStrength = state.player.ship.hull.strength;
  if (equipment === 'CLOAKER') return 500;
  if (equipment === 'AUTO_REPAIR' || equipment === 'TITANIUM_HULL') {
    return Math.min(hullStrength * 1000, 20000);
  }
  if (equipment === 'ASTRAXIAL_HULL') return 100000;
  return 10000; // STAR_BUSTER, ARCH_ANGEL, TRANS_WARP
}

/** Whether the equipment is already installed — mirrors engine `alreadyInstalled`. */
function simEquipmentInstalled(state: GameState, equipment: SpecialEquipmentId): boolean {
  const ship = state.player.ship;
  switch (equipment) {
    case 'CLOAKER':
      return ship.hasCloaker === true;
    case 'AUTO_REPAIR':
      return ship.hasAutoRepair === true;
    case 'STAR_BUSTER':
      return ship.hasStarBuster === true;
    case 'ARCH_ANGEL':
      return ship.hasArchAngel === true;
    case 'ASTRAXIAL_HULL':
      return ship.isAstraxialHull === true;
    case 'TITANIUM_HULL':
      return ship.hasTitaniumHull === true;
    default:
      return ship.hasTransWarpDrive === true;
  }
}

/**
 * Buy the next affordable, renown-gated special-equipment item the ship can
 * legally install. This is what makes special equipment reachable through
 * EARNED play (T-114a): the gate is `state.player.registry.renownRank`, climbed
 * by deeds — no test sets the rank. Priority runs cheapest-gate first so
 * STAR_BUSTER/ARCH_ANGEL (CAPTAIN) land long before ASTRAXIAL_HULL (GIGA_HERO).
 */
function planSpecialEquipment(
  state: GameState,
  ledger: DieLedger,
  reserve: number,
  // T-1601a: the priority list is now a PARAMETER, defaulting to the veteran's
  // original three so `veteranPolicy` (the T-114a pinned-seed ASTRAXIAL_HULL
  // reachability proof) is byte-for-byte unchanged. The fighter passes its own
  // list, which leads with AUTO_REPAIR — see `FIGHTER_EQUIPMENT_PRIORITY`.
  priority: readonly SpecialEquipmentId[] = ['STAR_BUSTER', 'ARCH_ANGEL', 'ASTRAXIAL_HULL'],
): PlayerAction | null {
  const ship = state.player.ship;
  for (const equipment of priority) {
    if (simEquipmentInstalled(state, equipment)) continue;
    // Mirror of the engine's `specialEquipmentFailure` exclusion/prereq ladder
    // (actions/shipyard.ts), so a policy never burns a die on a refusal. The
    // CLOAKER conflicts with STAR_BUSTER / ARCH_ANGEL / AUTO_REPAIR and demands
    // hull strength 1–4 (which every upgrading policy refits past), and
    // TITANIUM_HULL conflicts with AUTO_REPAIR — so neither is ever on a priority
    // list here; only the reverse-direction guards are needed.
    if (equipment === 'STAR_BUSTER' && ship.hasCloaker) continue;
    if (equipment === 'ARCH_ANGEL' && ship.hasCloaker) continue;
    if (equipment === 'AUTO_REPAIR' && (ship.hasCloaker || ship.hasTitaniumHull)) continue;
    if (equipment === 'ASTRAXIAL_HULL' && ship.drives.strength < 25) continue;

    const requiredRank = SPECIAL_EQUIPMENT.find((e) => e.id === equipment)?.requiredRenownRank;
    if (
      requiredRank &&
      renownRankIndex(state.player.registry.renownRank) < renownRankIndex(requiredRank)
    ) {
      continue;
    }
    const cost = simSpecialEquipmentCost(state, equipment);
    if (state.player.credits < reserve + cost) continue;
    const die = ledger.takeWorst();
    if (die === undefined) return null;
    return { type: 'Shipyard', action: 'buy-special-equipment', equipment, spendDie: die };
  }
  return null;
}

const VETERAN_RESERVE = 3000;

/**
 * VETERAN — the endgame balance instrument and the T-114a reachability proof.
 * A full-loop pilot that deliberately earns its way up the Renown ladder and
 * spends the winnings on the renown-gated special equipment — including the
 * ASTRAXIAL_HULL at GIGA_HERO. It is registry-driven: each dawn it reads which
 * Deeds are still unearned and steers toward them (haggle for broker_shark, a
 * mercy_runner / rim contract when offered, varied combat stance for the three
 * encounter deeds, a low-fuel arrival for the fuel-fumes deed), then trades to
 * fund the fit. It is NOT in COMPETENT_POLICIES: it is an endgame grinder, not
 * a lean balance baseline, so it is exempt from the poverty-trap sweep.
 */
export const veteranPolicy: SimPolicy = ({ state }) => {
  const ledger = dieLedger(state);
  const earned = new Set(state.player.registry.earned.map((deed) => deed.id));
  const need = (id: string): boolean => !earned.has(id);

  // Combat: collect first_combat_win / silver_tongue / clean_getaway by picking
  // the still-unearned outcome we can act on this encounter.
  if (state.encounter) {
    const encounter = state.encounter;
    const targetId = encounter.interceptor.id;
    const hull = Math.max(1, encounter.enemyHull);
    const fuelVolleys = Math.floor(state.player.ship.fuel / FIGHT_FUEL_COST);
    // T-1205: a winning volley removes `weaponVolleyDamage` hull points, so the
    // clean kill needs CEIL(hull / volleyDamage) volleys — fewer with an upgraded
    // gun. Sizing to real damage (not the raw hull count) is both the correctness
    // fix (over-queuing orphaned the surplus Combat once weapons went live) and
    // why an upgraded veteran wins fights it used to be priced out of.
    const volleysNeeded = Math.ceil(hull / weaponVolleyDamage(state.player.ship));
    const canWin =
      state.player.ship.weapons.strength > 1 &&
      Math.min(fuelVolleys, ledger.remaining()) >= volleysNeeded;
    if (need('first_combat_win') && canWin) {
      const fights: PlayerAction[] = [];
      for (let i = 0; i < volleysNeeded; i += 1) {
        const die = ledger.takeBest();
        if (die === undefined) break;
        fights.push({ type: 'Combat', stance: 'fight', targetId, spendDie: die });
      }
      if (fights.length > 0) return fights;
    }
    if (need('silver_tongue')) {
      const die = ledger.takeBest();
      if (die !== undefined) return [{ type: 'Combat', stance: 'talk', targetId, spendDie: die }];
    }
    if (need('clean_getaway') && state.player.ship.fuel >= RUN_FUEL_COST) {
      const die = ledger.takeBest();
      if (die !== undefined) return [{ type: 'Combat', stance: 'run', targetId, spendDie: die }];
    }
    // Carrying a delivery, deeds all earned: FIGHT the interceptor down rather
    // than fall through to the pacifist run. A fight win resolves the encounter
    // 'defeated', which COMPLETES the interrupted delivery (completePendingTravel)
    // and lands the ship at its destination — whereas a run forfeits the contract
    // and dumps the ship back at the origin. On a long, high-danger lane (the
    // full-rate VETERAN-era encounter band the T-1301 era flip now exposes) the
    // interceptions are relentless: running the loaded ship home every time bled
    // the veteran's fuel 10/interdiction and its credits on re-fuel until it was
    // MAROONED one jump short with no income to recover (observed: pinned at 5
    // credits / 61 fuel from day ~50 to 500 on the sys-17→9 rim run, the
    // ASTRAXIAL_HULL forever out of reach). The veteran has the gun for it
    // (weapons strength climbs past the junker's 1), and fighting through is what
    // a real veteran does with a hold full of cargo. Only when it can't win the
    // fight in the fuel/dice it has does it fall back to the pacifist path.
    if (state.player.activeContract && canWin) {
      const fights: PlayerAction[] = [];
      for (let i = 0; i < volleysNeeded; i += 1) {
        const die = ledger.takeBest();
        if (die === undefined) break;
        fights.push({ type: 'Combat', stance: 'fight', targetId, spendDie: die });
      }
      if (fights.length > 0) return fights;
    }
    return planPacifistCombat(state, ledger);
  }

  // A storylet in the queue is taken as a standalone day (matches the other
  // policies) so its die spend never collides with the trade-day ledger — this
  // is how beacon_keeper and chained storylets progress.
  const storyletAction = chooseStoryletAction(state);
  if (storyletAction) return [storyletAction];

  const actions: PlayerAction[] = [];
  const ship = state.player.ship;
  const from = state.player.currentSystemId;
  const board = state.market.manifestBoard;

  // T-1205: repair a hull the enemy has chipped down enough to collapse the fuel
  // ceiling, before it strands the grinder and starves its deed income.
  const repair = planCrippledRepair(state, ledger, VETERAN_RESERVE);
  if (repair) actions.push(repair);

  // T-1102: choose the destination FIRST so the refuel can be sized to reach it —
  // the same scarcity fix the trader needs. Without it the veteran signs the
  // richest (often far, unfuelable) run, strands, and never earns the credits to
  // upgrade — pinned at the junker hull for the whole 500-day campaign.
  const fuelDepotPrice = state.market.localFuelPrice || 5;
  const ranked = rankedContracts(state);
  const reachable = ranked
    .filter((c) => c.fuel <= ship.maxFuel * SIGN_FUEL_FRACTION)
    .map((c) => ({ ...c, net: c.payment - c.fuel * fuelDepotPrice }))
    .filter((c) => c.net > 0)
    .sort((a, b) => b.net - a.net || a.index - b.index);
  const reachableByFullTank = (dest: number): boolean =>
    playerJumpFuel(state, systemDistance(from, dest)) <= ship.maxFuel;

  // Steer toward missing deeds, but only when that steered run is fuelable; else
  // take the richest reachable, net-positive run.
  let idx = -1;
  if (need('mercy_runner')) {
    const m = board.findIndex((c) => c.cargoType === 4 && c.destination === 7);
    if (m >= 0 && reachableByFullTank(board[m].destination)) idx = m;
  }
  if (idx < 0 && need('rimward_bound')) {
    const r = board.findIndex(
      (c) => c.destination >= 15 && c.destination <= 20 && reachableByFullTank(c.destination),
    );
    if (r >= 0) idx = r;
  }
  if (idx < 0) idx = reachable.length > 0 ? reachable[0].index : -1;

  const primaryDest = state.player.activeContract
    ? state.player.activeContract.destination
    : idx >= 0
      ? board[idx].destination
      : null;
  const primaryFuelNeed =
    primaryDest !== null ? playerJumpFuel(state, systemDistance(from, primaryDest)) : 0;

  // Size the refuel to guarantee the jump. fuel_fumes_arrival still wants a lean
  // tank (land on fumes), so top only just above the jump cost; otherwise raise
  // the working threshold/target to cover the jump (never below the defaults).
  let refuelCost = 0;
  const wantFumes = need('fuel_fumes_arrival') && primaryFuelNeed > 0;
  const refuel = wantFumes
    ? planRefuel(
        state,
        ledger,
        0,
        Math.min(ship.maxFuel, primaryFuelNeed),
        Math.min(ship.maxFuel, primaryFuelNeed + 24),
      )
    : planRefuel(
        state,
        ledger,
        0,
        Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_THRESHOLD, primaryFuelNeed)),
        Math.min(ship.maxFuel, Math.max(FUEL_REFUEL_TARGET, primaryFuelNeed)),
      );
  if (refuel) {
    actions.push(refuel.action);
    refuelCost = refuel.cost;
  }
  const boughtFuel = refuel ? refuel.cost / fuelDepotPrice : 0;
  const availableFuel = Math.min(ship.maxFuel, ship.fuel + boughtFuel);

  if (state.player.activeContract) {
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
    }
  } else if (idx >= 0 && availableFuel >= primaryFuelNeed) {
    // Haggle the chosen board offer before signing → broker_shark. Needs three
    // dice for haggle + sign + travel, so gate on the remaining budget.
    if (need('broker_shark') && !board[idx].haggled && ledger.remaining() >= 3) {
      const haggleDie = ledger.takeWorst();
      if (haggleDie !== undefined) {
        actions.push({
          type: 'Trade',
          action: 'haggle',
          contractIndex: idx,
          spendDie: haggleDie,
        });
      }
    }
    const signDie = ledger.takeWorst();
    const travelDie = ledger.takeBest();
    if (signDie !== undefined && travelDie !== undefined) {
      actions.push({
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: idx,
        spendDie: signDie,
      });
      actions.push({
        type: 'Travel',
        destinationId: board[idx].destination,
        spendDie: travelDie,
      });
    }
  }

  // Yard: a cargo-pod expansion (earns yard_rat + cargo_expansion), then combat
  // tiers (weapons first, so first_combat_win becomes winnable), then the
  // renown-gated special equipment once the rank opens.
  if (
    need('cargo_expansion') &&
    state.player.credits >= VETERAN_RESERVE + 1000 &&
    ledger.remaining() > 0
  ) {
    const die = ledger.takeWorst();
    if (die !== undefined) {
      actions.push({ type: 'Shipyard', action: 'buy-cargo-pods', quantity: 1, spendDie: die });
    }
  }
  const upgrade = planFighterUpgrade(state, ledger);
  if (upgrade) actions.push(upgrade);
  const special = planSpecialEquipment(state, ledger, VETERAN_RESERVE);
  if (special) actions.push(special);

  const debtPayment = planDebtPayment(state, VETERAN_RESERVE, refuelCost);
  if (debtPayment) actions.push(debtPayment);

  return actions.length > 0 ? actions : [{ type: 'Wait' }];
};

export function resolvePolicy(policy: SimPolicyName | SimPolicy): ResolvedPolicy {
  if (typeof policy === 'function') {
    return { name: 'random', policy, dawnBlind: true };
  }

  if (policy === 'idle') {
    return { name: policy, policy: idlePolicy, dawnBlind: true };
  }

  if (policy === 'greedy') {
    return { name: policy, policy: greedyTraderPolicy, dawnBlind: true };
  }

  if (policy === 'trader') {
    return { name: policy, policy: traderPolicy, dawnBlind: false };
  }

  if (policy === 'fighter') {
    return { name: policy, policy: fighterPolicy, dawnBlind: false };
  }

  if (policy === 'explorer') {
    return { name: policy, policy: explorerPolicy, dawnBlind: false };
  }

  if (policy === 'veteran') {
    return { name: policy, policy: veteranPolicy, dawnBlind: false };
  }

  // T-1601b. NOTE the fallthrough below: an unrecognised name silently runs the
  // RANDOM policy, so a missing branch here would not fail loudly — it would just
  // report zeros for every metric. `campaign-smuggler-gambler.test.ts` asserts
  // these two resolve to the named policies precisely to catch that.
  if (policy === 'smuggler') {
    return { name: policy, policy: smugglerPolicy, dawnBlind: false };
  }

  if (policy === 'gambler') {
    return { name: policy, policy: gamblerPolicy, dawnBlind: false };
  }

  return { name: policy, policy: randomLegalActionPolicy, dawnBlind: true };
}

function validateInteger(name: string, value: number, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
}

/** Destination of the highest-paying offer on a freshly generated board. First
 *  max wins (deterministic board order). Null when the board is empty. */
function bestOfferDestination(board: GameState['market']['manifestBoard']): number | null {
  let destination: number | null = null;
  let bestPayment = -1;
  for (const offer of board) {
    if (offer.payment > bestPayment) {
      bestPayment = offer.payment;
      destination = offer.destination;
    }
  }
  return destination;
}

/** Group the per-dawn best-offer destinations into fixed windows and report how
 *  dominant the single most-frequent destination was in each (T-107). */
export function computeRouteDiversity(
  bestOfferDestinations: readonly (number | null)[],
  windowSize = 100,
): RouteDiversityWindow[] {
  const windows: RouteDiversityWindow[] = [];
  for (let start = 0; start < bestOfferDestinations.length; start += windowSize) {
    const slice = bestOfferDestinations.slice(start, start + windowSize);
    const counts = new Map<number, number>();
    let sampleCount = 0;
    for (const destination of slice) {
      if (destination === null) continue;
      sampleCount += 1;
      counts.set(destination, (counts.get(destination) ?? 0) + 1);
    }
    let topDestination: number | null = null;
    let topCount = 0;
    for (const [destination, count] of counts) {
      if (count > topCount) {
        topCount = count;
        topDestination = destination;
      }
    }
    windows.push({
      windowIndex: windows.length,
      startDay: start + 1,
      endDay: start + slice.length,
      topDestination,
      topShare: sampleCount === 0 ? 0 : topCount / sampleCount,
      sampleCount,
    });
  }
  return windows;
}

export function runCampaign(
  seed: number,
  days: number,
  policy: SimPolicyName | SimPolicy,
): CampaignStatsReport {
  validateInteger('seed', seed, Number.MIN_SAFE_INTEGER);
  validateInteger('days', days, 0);

  const resolvedPolicy = resolvePolicy(policy);
  let state = createInitialState(seed);
  const creditsCurve: number[] = [];
  const daily: CampaignDayStats[] = [];
  let debtClearedDay: number | null = null;
  let fuelStarvationDays = 0;
  let flawChecks = 0;
  let flawOverrides = 0;
  let wireVolume = 0;
  const bestOfferDestinations: (number | null)[] = [];
  // T-1601a behavior metrics (see the interface doc comments for readers).
  const loanUsage: LoanUsageStats = {
    loansTaken: 0,
    principalBorrowed: 0,
    interestAccrued: 0,
    amountRepaid: 0,
    loansCleared: 0,
    defaults: 0,
    daysWithLoan: 0,
  };
  const fragments: FragmentStats = { acquired: 0, decoded: 0, heldAtEnd: 0, decodedAtEnd: 0 };
  const equipmentUse: EquipmentUseStats = {
    specialEquipmentBought: [],
    componentTiersBought: 0,
    upgradedVolleys: 0,
    shieldAbsorbedPoints: 0,
    autoRepairDusks: 0,
  };
  // T-1601b behavior metrics (see the interface doc comments for readers).
  const smuggling: SmugglingStats = {
    contrabandContractsSigned: 0,
    contrabandDelivered: 0,
    scans: 0,
    scansCaught: 0,
    scansEvaded: 0,
    finesPaid: 0,
    contractsConfiscated: 0,
    podsConfiscated: 0,
    podsTaken: 0,
    fenceSales: 0,
    daysCarryingIllicit: 0,
    fenceRepDays: 0,
  };
  const hangoutPlay: HangoutPlayStats = {
    visits: 0,
    dares: 0,
    daresWon: 0,
    daresLost: 0,
    wagered: 0,
    netCredits: 0,
    expectedValuePerDare: 0,
    socialBeats: 0,
    failedVisits: 0,
  };
  const metrics: CampaignMetricAccumulator = {
    loanUsage,
    fragments,
    equipmentUse,
    smuggling,
    hangoutPlay,
  };

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const startingDay = state.day;
    const rng = new SeededRng(seed)
      .fork('policy')
      .fork(`day-${startingDay}`)
      .fork(`index-${dayIndex}`);
    // The naive policies (dawnBlind) plan on the DAWN state (board not yet
    // generated), exactly as they did under advanceDay — byte-for-byte
    // preserved (startDay clones its input, so `dawnState` is untouched). The
    // competent T-201 policies plan on the freshly generated day state so they
    // can read the live board and dawn hand. We inline advanceDay's
    // start→act→dusk sequence either way, observing the fresh board for
    // route-diversity tracking (T-107).
    const dawnState = state;
    const dawn = startDay(state);
    let dayState = dawn.state;
    const dayEvents: GameEvent[] = [...dawn.events];
    bestOfferDestinations.push(bestOfferDestination(dayState.market.manifestBoard));
    const actions = resolvedPolicy.policy({
      state: resolvedPolicy.dawnBlind ? dawnState : dayState,
      dayIndex,
      rng,
    });
    const incomeActionCount = actions.filter(isIncomeAction).length;
    for (const action of actions) {
      // T-1205: a queued Combat can now be orphaned mid-batch — seeded enemy
      // damage can drive the player's hull to 0 and end the encounter (succession)
      // BEFORE the rest of a volley queue is applied, and a Combat with no active
      // encounter is malformed input that throws. A batch driver must therefore
      // skip a Combat once the encounter is gone (a real UGT client re-reads legal
      // actions between steps and would never send it). This only fires on the new
      // mid-batch-death path, so deterministic non-fatal runs are unchanged.
      if (action.type === 'Combat' && !dayState.encounter) continue;
      // T-1601a: `upgradedVolleys` cannot be read off the event stream — a
      // CombatEvent says a fight round landed, not what gun landed it. Sample the
      // fit on the PRE-action ship (the junker's `weaponVolleyDamage` is exactly
      // 1 by the T-1205 baseline-subtraction invariant, so `> 1` means a bought
      // weapon tier / STAR_BUSTER was in play) and pair it with the outcome.
      const volleyDamageBefore = weaponVolleyDamage(dayState.player.ship);
      const stepped = applyPlayerAction(dayState, action);
      dayState = stepped.state;
      dayEvents.push(...stepped.events);
      if (
        volleyDamageBefore > 1 &&
        stepped.events.some(
          (event) => event.type === 'CombatEvent' && event.stance === 'fight' && event.success,
        )
      ) {
        equipmentUse.upgradedVolleys += 1;
      }
    }
    // T-1601a: the AUTO_REPAIR module narrates only a WireEntry, so measure it by
    // comparing condition across the dusk on the seven components the engine's
    // reader actually touches (hull excluded, exactly as engine-side).
    const preDuskShip = dayState.player.ship;
    const dusk = endDay(dayState);
    state = dusk.state;
    dayEvents.push(...dusk.events);
    if (
      preDuskShip.hasAutoRepair === true &&
      AUTO_REPAIR_SIM_COMPONENTS.some(
        (id) => state.player.ship[id].condition > preDuskShip[id].condition,
      )
    ) {
      equipmentUse.autoRepairDusks += 1;
    }
    if (state.player.loan) {
      loanUsage.daysWithLoan += 1;
    }
    // T-1601b: two DUSK-STATE folds. No event says "the hold is still dirty" or
    // "the fence rep is still on the record" — those are conditions, not beats —
    // so they are measured the same way `daysWithLoan` above is. Both use the
    // engine/content definitions (`isCarryingIllicit`, `FENCE_REP_FLAG`) rather
    // than re-deriving from raw flags, so the sim can never drift from the scan.
    if (isCarryingIllicit(state)) {
      smuggling.daysCarryingIllicit += 1;
    }
    if (state.flags[FENCE_REP_FLAG] === true) {
      smuggling.fenceRepDays += 1;
    }

    const counts = countDailyEvents(dayEvents);
    accumulateMetricEvents(dayEvents, metrics);
    wireVolume += counts.wireEntries;
    flawChecks += counts.flawChecks;
    flawOverrides += counts.flawOverrides;

    // T-1004 stranding measure. Evaluated ONCE and consumed twice: the report
    // counter and the per-day `fuelStarved` series below (T-1601a).
    const fuelStarved = cannotAffordCheapestJump(state);
    if (fuelStarved) {
      fuelStarvationDays += 1;
    }

    if (debtClearedDay === null && state.player.debt === 0) {
      debtClearedDay = state.day;
    }

    creditsCurve.push(state.player.credits);
    daily.push({
      day: state.day,
      credits: state.player.credits,
      debt: state.player.debt,
      fuel: state.player.ship.fuel,
      systemId: state.player.currentSystemId,
      wireEntries: counts.wireEntries,
      flawChecks: counts.flawChecks,
      flawOverrides: counts.flawOverrides,
      deedsEarned: counts.deedsEarned,
      deedCount: state.player.registry.earned.length,
      renownRank: state.player.registry.renownRank,
      bestOfferDestination: bestOfferDestinations[dayIndex] ?? null,
      incomeActionCount,
      fuelStarved,
    });
  }

  fragments.heldAtEnd = fragmentCount(state.player.nemesisFile);
  fragments.decodedAtEnd = decodedFragmentCount(state.player.nemesisFile);
  // T-1601b: the acceptance metric, derived post-loop exactly as the fragment
  // end-state fields above are. Zero (not NaN) on a career that never dared.
  hangoutPlay.expectedValuePerDare =
    hangoutPlay.dares > 0 ? hangoutPlay.netCredits / hangoutPlay.dares : 0;

  return {
    seed,
    days,
    policy: resolvedPolicy.name,
    creditsCurve,
    debtClearedDay,
    fuelStarvationDays,
    flawOverrideRate: flawChecks === 0 ? 0 : flawOverrides / flawChecks,
    wireVolume,
    deedCount: state.player.registry.earned.length,
    deedsEarned: state.player.registry.earned.map((deed) => deed.id),
    renownRank: state.player.registry.renownRank,
    routeDiversity: computeRouteDiversity(bestOfferDestinations),
    loanUsage,
    fragments,
    equipmentUse,
    smuggling,
    hangoutPlay,
    finalState: {
      day: state.day,
      credits: state.player.credits,
      debt: state.player.debt,
      fuel: state.player.ship.fuel,
      systemId: state.player.currentSystemId,
    },
    daily,
  };
}

export function reportToJson(report: CampaignStatsReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function usage(): string {
  return [
    'Usage: npm run sim -- --seed <integer> --days <integer> --policy <idle|greedy|random|trader|fighter|explorer|veteran|smuggler|gambler>',
    'Defaults: --seed 1 --days 100 --policy idle',
    'Alias: --policy random-legal-action',
  ].join('\n');
}

function normalizePolicy(value: string): SimPolicyName {
  if (value === 'random-legal-action') {
    return 'random';
  }

  if (isSimPolicyName(value)) {
    return value;
  }

  throw new Error(`Invalid policy: ${value}`);
}

function parseIntegerFlag(name: string, value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing value for ${name}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }

  return parsed;
}

function parseCli(argv: string[]): CliResult {
  const options: RunCampaignOptions = {
    seed: 1,
    days: 100,
    policy: 'idle',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      return { help: true };
    }

    if (arg === '--seed') {
      options.seed = parseIntegerFlag(arg, argv[index + 1]);
      index += 1;
    } else if (arg === '--days') {
      options.days = parseIntegerFlag(arg, argv[index + 1]);
      index += 1;
    } else if (arg === '--policy') {
      const value = argv[index + 1];
      if (value === undefined || value.trim() === '') {
        throw new Error('Missing value for --policy');
      }
      options.policy = normalizePolicy(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg ?? ''}`);
    }
  }

  validateInteger('--seed', options.seed, Number.MIN_SAFE_INTEGER);
  validateInteger('--days', options.days, 0);

  return options;
}

export function parseCliArgs(argv: string[]): RunCampaignOptions {
  const result = parseCli(argv);

  if ('help' in result) {
    throw new Error('--help is handled by main');
  }

  return result;
}

export function main(argv: string[] = process.argv.slice(2)): void {
  try {
    const result = parseCli(argv);

    if ('help' in result) {
      process.stdout.write(`${usage()}\n`);
      process.exitCode = 0;
      return;
    }

    process.stdout.write(reportToJson(runCampaign(result.seed, result.days, result.policy)));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`${message}\n${usage()}\n`);
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main();
}
