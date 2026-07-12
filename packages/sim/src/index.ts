import {
  EXPLORATION_FUEL_COST,
  FLAWS,
  SPECIAL_EQUIPMENT,
  STAR_SYSTEMS,
  YARD_COMPONENT_TIER_PRICES,
  distance as systemDistance,
  isGatedDestination,
  type RenownRankId,
} from '@spacerquest/content';
import {
  FIGHT_FUEL_COST,
  RUN_FUEL_COST,
  createInitialState,
  endDay,
  jumpFuelCost,
  renownRankIndex,
  startDay,
  applyPlayerAction,
  SeededRng,
  type GameEvent,
  type GameState,
  type PlayerAction,
  type SpecialEquipmentId,
} from '@spacerquest/engine';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// T-202 · UGT adapter — the pure protocol core (message types, handleMessage,
// legal-actions enumerator, state-summary builder). Transport shell lives in
// ./protocol-stdio.ts. See PROTOCOL.md.
export * from './protocol.js';

export type SimPolicyName =
  'idle' | 'greedy' | 'random' | 'trader' | 'fighter' | 'explorer' | 'veteran';

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

const POLICY_NAMES: readonly SimPolicyName[] = [
  'idle',
  'greedy',
  'random',
  'trader',
  'fighter',
  'explorer',
  'veteran',
];

function isSimPolicyName(value: string): value is SimPolicyName {
  return POLICY_NAMES.includes(value as SimPolicyName);
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

/** The manifest board ranked by payment, richest first (board order as the
 *  tiebreak so the choice is deterministic). */
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

const FUEL_REFUEL_THRESHOLD = 120;
const FUEL_REFUEL_TARGET = 260;

/** Queue a refuel (dull die) when the tank dips below the working threshold,
 *  buying up to the target, capped by what's affordable above `keepFloor`.
 *  Returns the action and its credit cost (so debt planning can reserve it). */
function planRefuel(
  state: GameState,
  ledger: DieLedger,
  keepFloor: number,
  threshold = FUEL_REFUEL_THRESHOLD,
  target = FUEL_REFUEL_TARGET,
): { action: PlayerAction; cost: number } | null {
  const ship = state.player.ship;
  if (ship.fuel >= threshold) return null;
  const price = state.market.localFuelPrice || 5;
  const want = Math.min(ship.maxFuel - ship.fuel, target - ship.fuel);
  const spendable = Math.max(0, state.player.credits - keepFloor);
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
 *  ledger clamp can never drain the tank below the reserve. */
function planDebtPayment(
  state: GameState,
  reserve: number,
  refuelCost: number,
): PlayerAction | null {
  if (state.player.debt <= 0) return null;
  const spendable = state.player.credits - reserve - refuelCost;
  const amount = Math.min(state.player.debt, spendable);
  if (amount < 1) return null;
  return { type: 'Trade', action: 'pay-debt', amount };
}

const TRADER_RESERVE = 1500;

/**
 * TRADER — route + fuel planner that pays down the Guild marker. Each day it
 * keeps the tank topped, signs the richest contract on the board and flies it to
 * delivery the SAME day (a second run too while the debt is still heavy and the
 * hand/tank allow), then remits everything above a fuel reserve toward the debt.
 * Weak hull, so it talks its way past interceptors rather than fighting.
 */
export const traderPolicy: SimPolicy = ({ state }) => {
  const ledger = dieLedger(state);
  if (state.encounter) return planPacifistCombat(state, ledger);

  const actions: PlayerAction[] = [];
  let refuelCost = 0;

  const refuel = planRefuel(state, ledger, 0);
  if (refuel) {
    actions.push(refuel.action);
    refuelCost = refuel.cost;
  }

  const ranked = rankedContracts(state);

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
  } else if (ranked.length > 0) {
    const best = ranked[0];
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
      if (state.player.debt > 5000 && ranked.length > 1 && ledger.remaining() >= 2) {
        const second = ranked[1];
        // The board shifts when the first contract is spliced off; correct the
        // live index for the second sign.
        const liveIndex = second.index > best.index ? second.index - 1 : second.index;
        const secondSignDie = ledger.takeWorst();
        const secondTravelDie = ledger.takeBest();
        const projectedFuel = state.player.ship.fuel - best.fuel;
        if (
          secondSignDie !== undefined &&
          secondTravelDie !== undefined &&
          projectedFuel >= second.fuel
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

  const debtPayment = planDebtPayment(state, TRADER_RESERVE, refuelCost);
  if (debtPayment) actions.push(debtPayment);

  return actions.length > 0 ? actions : [{ type: 'Wait' }];
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
    const fuelVolleys = Math.floor(state.player.ship.fuel / FIGHT_FUEL_COST);
    const volleys = Math.min(hull, fuelVolleys, ledger.remaining());
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

  const ranked = rankedContracts(state);
  if (state.player.activeContract) {
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
    }
  } else if (ranked.length > 0) {
    const best = ranked[0];
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

  const upgrade = planFighterUpgrade(state, ledger);
  if (upgrade) actions.push(upgrade);

  // Once renown opens the gate (CAPTAIN, from combat/trade deeds), spend the
  // war chest on the offensive special equipment through EARNED rank (T-114a).
  const special = planSpecialEquipment(state, ledger, FIGHTER_RESERVE);
  if (special) actions.push(special);

  // Keep the marker from festering, but never at the cost of the war chest.
  const debtPayment = planDebtPayment(state, FIGHTER_RESERVE, refuel?.cost ?? 0);
  if (debtPayment) actions.push(debtPayment);

  return actions.length > 0 ? actions : [{ type: 'Wait' }];
};

const EXPLORER_RESERVE = 2000;

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
  // Explorers burn fuel fast — keep the tank fuller than a trader would.
  const refuel = planRefuel(state, ledger, 0, 200, 400);

  const ranked = rankedContracts(state);
  if (state.player.activeContract) {
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
    }
  } else if (ranked.length > 0) {
    const best = ranked[0];
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

  // Refuel AFTER planning trade dice so the sharp dice go to the nav checks that
  // matter; the refuel itself rolls nothing.
  if (refuel) actions.push(refuel.action);

  // Off-lane sweeps with whatever sharp dice remain, while solvent and fuelled.
  // Project the tank forward: current fuel, plus the units the refuel adds, less
  // one jump's worth already committed to the delivery, then spend the rest on
  // Explore detours (each burns EXPLORATION_FUEL_COST).
  const fuelPrice = state.market.localFuelPrice || 5;
  let projectedFuel = state.player.ship.fuel + (refuel ? refuel.cost / fuelPrice : 0);
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
): PlayerAction | null {
  const ship = state.player.ship;
  const priority: SpecialEquipmentId[] = ['STAR_BUSTER', 'ARCH_ANGEL', 'ASTRAXIAL_HULL'];
  for (const equipment of priority) {
    if (simEquipmentInstalled(state, equipment)) continue;
    // STAR_BUSTER conflicts with a cloaker; the veteran never buys one, but keep
    // the guard honest so we never queue an install the yard will reject.
    if (equipment === 'STAR_BUSTER' && ship.hasCloaker) continue;
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
    const canWin =
      state.player.ship.weapons.strength > 1 && Math.min(fuelVolleys, ledger.remaining()) >= hull;
    if (need('first_combat_win') && canWin) {
      const fights: PlayerAction[] = [];
      for (let i = 0; i < hull; i += 1) {
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
    return planPacifistCombat(state, ledger);
  }

  // A storylet in the queue is taken as a standalone day (matches the other
  // policies) so its die spend never collides with the trade-day ledger — this
  // is how beacon_keeper and chained storylets progress.
  const storyletAction = chooseStoryletAction(state);
  if (storyletAction) return [storyletAction];

  const actions: PlayerAction[] = [];

  // Fuel: normally keep topped. While fuel_fumes_arrival is still unearned, let
  // the tank run lower (only top up near-empty) so a delivery jump can land us
  // at <= 25 fuel — without ever hard-stranding.
  let refuelCost = 0;
  const refuel = need('fuel_fumes_arrival')
    ? planRefuel(state, ledger, 0, 30, 60)
    : planRefuel(state, ledger, 0);
  if (refuel) {
    actions.push(refuel.action);
    refuelCost = refuel.cost;
  }

  const board = state.market.manifestBoard;
  if (state.player.activeContract) {
    const die = ledger.takeBest();
    if (die !== undefined) {
      actions.push({
        type: 'Travel',
        destinationId: state.player.activeContract.destination,
        spendDie: die,
      });
    }
  } else {
    // Steer the contract choice toward missing delivery/travel deeds, else richest.
    let idx = -1;
    if (need('mercy_runner')) {
      idx = board.findIndex((c) => c.cargoType === 4 && c.destination === 7);
    }
    if (idx < 0 && need('rimward_bound')) {
      idx = board.findIndex((c) => c.destination >= 15 && c.destination <= 20);
    }
    if (idx < 0) {
      const ranked = rankedContracts(state);
      idx = ranked.length > 0 ? ranked[0].index : -1;
    }
    if (idx >= 0) {
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
      const stepped = applyPlayerAction(dayState, action);
      dayState = stepped.state;
      dayEvents.push(...stepped.events);
    }
    const dusk = endDay(dayState);
    state = dusk.state;
    dayEvents.push(...dusk.events);

    const counts = countDailyEvents(dayEvents);
    wireVolume += counts.wireEntries;
    flawChecks += counts.flawChecks;
    flawOverrides += counts.flawOverrides;

    if (cannotAffordCheapestJump(state)) {
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
    });
  }

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
    'Usage: npm run sim -- --seed <integer> --days <integer> --policy <idle|greedy|random|trader|fighter|explorer|veteran>',
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
