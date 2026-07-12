import { describe, expect, it } from 'vitest';
import { STORYLETS, type StoryletDefinition } from '@spacerquest/content';
import {
  applyPlayerAction,
  createInitialState,
  endDay,
  startDay,
  type GameState,
} from '@spacerquest/engine';

// ---------------------------------------------------------------------------
// T-401 · Storylet reachability sweep.
//
// Acceptance: each of the 25 cargo & passenger storylets is REACHABLE in a
// 500-day seed sweep. "Reachable" means it appears in eligibleStorylets(state)
// during honest headless play — the coverage-hunter driver below reaches every
// storylet through LEGAL engine actions only (Travel / Trade / Combat /
// Storylet / Wait via applyPlayerAction). It NEVER pokes state.flags, state.day,
// currentSystemId, activeContract, or cargo to force eligibility — the same
// honesty bar the project's global rules set for playtests. If a storylet were
// unreachable, the fix would be to re-author its trigger, not to poke state.
// ---------------------------------------------------------------------------

// The 25 T-401 storylet ids (the target set for the sweep).
const T401_IDS: readonly string[] = [
  'cargo.dry-goods.short-count',
  'cargo.nutri-goods.spoilage-scare',
  'cargo.spices.customs-sniff',
  'cargo.medicinals.plague-relief',
  'cargo.electronics.gray-market-buyer',
  'cargo.precious-metals.escort-shakedown',
  'cargo.rare-elements.assay-dispute',
  'cargo.photonic.calibration-drift',
  'cargo.ticking-crate.discovered',
  'cargo.ticking-crate.aftermath',
  'passenger.false-name.board',
  'passenger.false-name.arrival',
  'passenger.pilgrim.board',
  'passenger.pilgrim.arrival',
  'passenger.fugitive.board',
  'passenger.fugitive.arrival',
  'passenger.orphan.board',
  'passenger.orphan.arrival',
  'passenger.medic.board',
  'passenger.medic.arrival',
  'passenger.courier.sealed-orders',
  'passenger.gambler.debt',
  'passenger.deadhead.empty-berth',
  'passenger.stowaway.discovered',
  'passenger.envoy.sealed-writ',
];

const TARGET_SET = new Set(T401_IDS);
const BY_ID = new Map<string, StoryletDefinition>(STORYLETS.map((s) => [s.id, s]));

type Offer = GameState['storylets']['available'][number];
type Choice = Offer['choices'][number];

function choiceNeedsDie(choice: Choice): boolean {
  return Boolean(choice.requirements?.spendDie || choice.requirements?.statCheck);
}

/** First unspent die index in the dawn hand, or undefined if the hand is spent
 *  (or absent). All die-spending actions gate on this so we never over-draw. */
function freeDie(state: GameState): number | undefined {
  const hand = state.player.dawnHand;
  if (!hand) return undefined;
  for (let i = 0; i < hand.dice.length; i += 1) {
    if (!hand.spent[i]) return i;
  }
  return undefined;
}

/** Pick the choice the hunter resolves a target with: a requirement-free choice,
 *  PREFERRING one that schedules a follow-up (so chains — passenger arrivals, the
 *  ticking-crate aftermath — get armed). A requirement-free choice always exists
 *  (enforced by the engine test), so this never returns undefined for a target. */
function pickChoice(storylet: StoryletDefinition): Choice | undefined {
  const free = storylet.choices.filter((c) => !c.requirements);
  const scheduling = free.find((c) =>
    [c.effects, c.successEffects, c.failureEffects].some((e) => (e?.schedule?.length ?? 0) > 0),
  );
  return scheduling ?? free[0];
}

/** Clear any active encounter so Trade/Travel/Storylet actions unblock. Prefer
 *  TALK — a talked-down (or fought-off) encounter COMPLETES the interrupted jump,
 *  where running only aborts back to origin. Falls back to run to force-clear a
 *  stubborn encounter (a vengeful interceptor that refuses tribute), retried the
 *  next dawn if dice run out. */
function clearEncounter(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.encounter && guard < 8) {
    guard += 1;
    const die = freeDie(s);
    if (die === undefined) break;
    const targetId = s.encounter.interceptor.id;
    const stance: 'talk' | 'run' = guard <= 3 ? 'talk' : s.player.ship.fuel >= 100 ? 'run' : 'talk';
    s = applyPlayerAction(s, { type: 'Combat', stance, targetId, spendDie: die }).state;
  }
  return s;
}

/** Top the tank up when it dips, so a jump is always affordable. Buys only what
 *  the purse allows; a no-op when broke (the hunter recovers on the next
 *  delivery). */
function ensureFuel(state: GameState, minFuel = 90): GameState {
  if (state.player.ship.fuel >= minFuel) return state;
  const price = state.market.localFuelPrice || 5;
  const want = 220 - state.player.ship.fuel;
  const capacity = state.player.ship.maxFuel - state.player.ship.fuel;
  const affordable = Math.floor(state.player.credits / price);
  const units = Math.max(0, Math.min(want, capacity, affordable));
  if (units < 1) return state;
  const die = freeDie(state);
  if (die === undefined) return state;
  return applyPlayerAction(state, {
    type: 'Trade',
    action: 'buy-fuel',
    fuelAmount: units,
    spendDie: die,
  }).state;
}

/** Fly to `dest`, completing the jump through any encounter (talk completes the
 *  trip; run only aborts). A no-op when already there or out of dice/fuel. */
function travelTo(state: GameState, dest: number): GameState {
  let s = state;
  if (s.encounter) s = clearEncounter(s);
  if (s.player.currentSystemId === dest) return s;
  s = ensureFuel(s);
  const die = freeDie(s);
  if (die === undefined) return s;
  s = applyPlayerAction(s, { type: 'Travel', destinationId: dest, spendDie: die }).state;
  if (s.encounter) s = clearEncounter(s); // complete the jump the same day if intercepted
  return s;
}

/** Record + resolve every currently-eligible target. Seeing a target in the
 *  available list is what "reachable" means, so we mark it covered on sight;
 *  resolving heads with their scheduling choice arms the chained follow-ups.
 *  Requirement-free resolution spends no die, so this can clear a whole dawn's
 *  worth of offers. */
function resolveEligibleTargets(state: GameState, covered: Set<string>): GameState {
  let s = state;
  let guard = 0;
  while (guard < 40) {
    guard += 1;
    if (s.encounter) s = clearEncounter(s);
    for (const offer of s.storylets.available) {
      if (TARGET_SET.has(offer.storyletId)) covered.add(offer.storyletId);
    }
    const offer = s.storylets.available.find((o) => TARGET_SET.has(o.storyletId));
    if (!offer) break;
    const storylet = BY_ID.get(offer.storyletId);
    const choice = storylet ? pickChoice(storylet) : undefined;
    if (!storylet || !choice) break;
    if (choiceNeedsDie(choice)) break; // shouldn't happen — we only pick free choices
    s = applyPlayerAction(s, {
      type: 'Storylet',
      storyletId: offer.storyletId,
      choiceId: choice.id,
    }).state;
  }
  return s;
}

/** Cargo target still uncovered whose contract the board can currently deliver:
 *  a matching cargoType (and destination, for the plague run). Returns the board
 *  index to sign, or -1. */
function signableCargoIndex(state: GameState, covered: Set<string>): number {
  for (const id of T401_IDS) {
    if (covered.has(id)) continue;
    const cargo = BY_ID.get(id)?.trigger.cargo;
    if (cargo?.activeContractCargoType === undefined) continue;
    const idx = state.market.manifestBoard.findIndex(
      (c) =>
        c.cargoType === cargo.activeContractCargoType &&
        (cargo.activeContractDestination === undefined ||
          c.destination === cargo.activeContractDestination),
    );
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Origin of the first uncovered, directly-pursuable, system-gated target
 *  (passenger boards + one-shot vignettes). Scheduled follow-ups are excluded —
 *  they arm off their heads, not off a location. */
function nextSystemGoal(state: GameState, covered: Set<string>): number | undefined {
  for (const id of T401_IDS) {
    if (covered.has(id)) continue;
    const trigger = BY_ID.get(id)?.trigger;
    if (!trigger || trigger.scheduledOnly) continue;
    if (trigger.systemIds && trigger.systemIds.length > 0) return trigger.systemIds[0];
  }
  return undefined;
}

/**
 * One day of the coverage hunter, in priority order after resolving eligible
 * targets:
 *   A. Slot free + the board can deliver an uncovered cargo target → SIGN it
 *      (arms that cargo head; catches the rare plague run whenever it surfaces).
 *   B. Slot occupied → DELIVER the held contract to free the slot for the next
 *      cargo type.
 *   C. Slot free, no signable cargo → TRAVEL to the next uncovered passenger /
 *      one-shot origin.
 *   D. Nothing to do → top up and let the day roll (scheduled follow-ups fire).
 * Every branch uses only legal engine actions.
 */
function planDay(state: GameState, covered: Set<string>): GameState {
  let s = state;
  if (s.encounter) s = clearEncounter(s);

  if (!s.player.activeContract) {
    const signIdx = signableCargoIndex(s, covered);
    if (signIdx >= 0) {
      s = ensureFuel(s);
      const die = freeDie(s);
      if (die !== undefined) {
        s = applyPlayerAction(s, {
          type: 'Trade',
          action: 'sign-contract',
          contractIndex: signIdx,
          spendDie: die,
        }).state;
        // The signed contract's cargo head is now eligible — cover it this dawn.
        s = resolveEligibleTargets(s, covered);
      }
      return s;
    }
  }

  if (s.player.activeContract) {
    // Free the slot: deliver the held contract to its destination.
    return travelTo(s, s.player.activeContract.destination);
  }

  const goalSystem = nextSystemGoal(s, covered);
  if (goalSystem !== undefined && s.player.currentSystemId !== goalSystem) {
    return travelTo(s, goalSystem);
  }

  // Only scheduled follow-ups (or nothing) left to reach: keep fuelled and let
  // the day advance so schedules come due.
  return ensureFuel(s);
}

/** Drive one seed for up to `maxDays`, accumulating reachable target ids into
 *  `covered`. Stops early once every target is covered. */
function runSeed(seed: number, maxDays: number, covered: Set<string>): void {
  let state = createInitialState(seed);
  for (let day = 0; day < maxDays; day += 1) {
    let s = startDay(state).state;
    s = resolveEligibleTargets(s, covered);
    if (covered.size < TARGET_SET.size) {
      s = planDay(s, covered);
      s = resolveEligibleTargets(s, covered);
    }
    state = endDay(s).state;
    if (covered.size === TARGET_SET.size) break;
  }
}

describe('T-401 storylet reachability (500-day seed sweep)', () => {
  it('reaches all 25 cargo & passenger storylets through legal headless play', () => {
    const covered = new Set<string>();
    // A seed sweep: most targets fall in the first seed; extra seeds harden the
    // rare plague-relief run (a Medicinals→Fomalhaut-2 contract the board issues
    // only occasionally). Stops as soon as the union is complete.
    for (let seed = 1; seed <= 8 && covered.size < TARGET_SET.size; seed += 1) {
      runSeed(seed, 500, covered);
    }

    const missing = T401_IDS.filter((id) => !covered.has(id));
    expect(missing, `unreached storylets: ${missing.join(', ')}`).toEqual([]);
  }, 120000);
});
