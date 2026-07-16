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
// T-401 · Storylet reachability sweep (extended for T-1302).
//
// Acceptance: each of the 25 cargo & passenger storylets is REACHABLE in a
// seed sweep. "Reachable" means it appears in eligibleStorylets(state)
// during honest headless play — the coverage-hunter driver below reaches every
// storylet through LEGAL engine actions only (Travel / Trade / Combat /
// Storylet / Wait via applyPlayerAction). It NEVER pokes state.flags, state.day,
// currentSystemId, activeContract, cargo, or state.eraEvent to force
// eligibility — the same honesty bar the project's global rules set for
// playtests. If a storylet were unreachable, the fix would be to re-author its
// trigger, not to poke state.
//
// T-1302 rewrote two exemplars onto their REAL economic triggers, so the hunter
// must now reach them the hard way:
//  - `cargo.medicinals.plague-relief` fires only while a live `plague` era event
//    is active AND the ship carries a Medicinals (type 4) contract INSIDE the
//    afflicted system. The hunter reacts to the (rare, seeded) plague by hauling
//    medicine into the fevered port (`pursuePlague`).
//  - `cargo.ticking-crate.discovered` fires only on a signed Contraband (type
//    10) contract, which T-1104 issues solely from the rim's `allowsContraband`
//    ports. The hunter runs out to Antares-5 (system 15, the nearest such port)
//    to sign one (`pursueContraband`).
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

// T-1302: the rim contraband port the ticking-crate run is signed at (Antares-5,
// system 15 — the closest `allowsContraband` port), and the core system it is
// reached through (Vega-6, system 14, a short DC-11 hop away) so a fresh
// spacer's pilot check can clear the rim jump reliably.
const CONTRABAND_PORT = 15;
const CONTRABAND_STEP = 14;

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

/** Highest-value unspent die in the dawn hand. Jumps spend this (a pilot check
 *  clears on `die + PILOT >= DC`, or a natural 20), so the hunter clears longer
 *  hops — the rim contraband run especially — as reliably as the hand allows. */
function bestDie(state: GameState): number | undefined {
  const hand = state.player.dawnHand;
  if (!hand) return undefined;
  let bestIndex: number | undefined;
  let bestValue = -1;
  for (let i = 0; i < hand.dice.length; i += 1) {
    if (!hand.spent[i] && hand.dice[i] > bestValue) {
      bestValue = hand.dice[i];
      bestIndex = i;
    }
  }
  return bestIndex;
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
  const die = bestDie(s);
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
 *  a matching cargoType. Returns the board index to sign, or -1.
 *
 *  T-1302: `cargo.medicinals.plague-relief` is EXCLUDED — signing a Medicinals
 *  contract no longer arms it (it needs a live plague event + the afflicted
 *  system too), so `pursuePlague` owns it; leaving it here would have the hunter
 *  sign type-4 runs forever, never covering it. `cargo.ticking-crate.discovered`
 *  stays: its Contraband (type 10) contract is board-signable once the hunter is
 *  at a rim `allowsContraband` port. */
function signableCargoIndex(state: GameState, covered: Set<string>): number {
  for (const id of T401_IDS) {
    if (covered.has(id)) continue;
    if (id === 'cargo.medicinals.plague-relief') continue;
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

/** Sign the board contract at `idx`, then cover any storylet the freshly-signed
 *  contract makes eligible this dawn. */
function signContract(state: GameState, idx: number, covered: Set<string>): GameState {
  let s = ensureFuel(state);
  const die = freeDie(s);
  if (die === undefined) return s;
  s = applyPlayerAction(s, {
    type: 'Trade',
    action: 'sign-contract',
    contractIndex: idx,
    spendDie: die,
  }).state;
  return resolveEligibleTargets(s, covered);
}

/**
 * T-1302 · Chase the plague-relief run on its REAL trigger. When a `plague` era
 * event is live, get a Medicinals (type 4) contract into the afflicted system:
 *   - already carrying type 4 → burn to the epicentre (the storylet then fires);
 *   - carrying the wrong cargo → deliver it to free the hold;
 *   - hold free → make the epicentre and sign a Medicinals run off its board.
 * All legal actions; never pokes eraEvent or position to force the match.
 */
function pursuePlague(state: GameState, covered: Set<string>): GameState {
  const s = state;
  const epicentre = s.eraEvent?.affectedSystemIds[0];
  if (epicentre === undefined) return ensureFuel(s);

  if (s.player.activeContract?.cargoType === 4) {
    if (s.player.currentSystemId !== epicentre) return travelTo(s, epicentre);
    return ensureFuel(s); // in the fevered port, carrying medicine — now eligible
  }
  if (s.player.activeContract) {
    return travelTo(s, s.player.activeContract.destination); // free the hold
  }
  if (s.player.currentSystemId !== epicentre) return travelTo(s, epicentre);
  const idx = s.market.manifestBoard.findIndex((c) => c.cargoType === 4);
  if (idx >= 0) return signContract(s, idx, covered);
  return ensureFuel(s); // wait for the epicentre board to offer a Medicinals run
}

/**
 * T-1302 · Chase the ticking-crate on its REAL trigger: a signed Contraband
 * (type 10) contract. Type 10 issues only from the rim's `allowsContraband`
 * ports, so free the hold, hop out to Antares-5 (via Vega-6 for a cheap pilot
 * DC), and sign the contraband run its board eventually surfaces.
 */
function pursueContraband(state: GameState, covered: Set<string>): GameState {
  const s = state;
  if (s.player.activeContract) return travelTo(s, s.player.activeContract.destination);
  if (s.player.currentSystemId === CONTRABAND_PORT) {
    const idx = s.market.manifestBoard.findIndex((c) => c.cargoType === 10);
    if (idx >= 0) return signContract(s, idx, covered);
    return ensureFuel(s); // wait for the rim board to roll a Contraband run
  }
  if (s.player.currentSystemId === CONTRABAND_STEP) return travelTo(s, CONTRABAND_PORT);
  return travelTo(s, CONTRABAND_STEP);
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
 *   A. A `plague` era event is LIVE and plague-relief is still uncovered → race
 *      a Medicinals run into the afflicted port before the fever lifts (T-1302).
 *   B. Slot free + the board can deliver an uncovered cargo target → SIGN it
 *      (arms that cargo head; also signs the rim Contraband run once at Antares).
 *   C. Slot occupied → DELIVER the held contract to free the slot for the next
 *      cargo type.
 *   D. Slot free, no signable cargo → TRAVEL to the next uncovered passenger /
 *      one-shot origin.
 *   E. Only the contraband run left to reach → run out to the rim for it (T-1302).
 *   F. Nothing to do → top up and let the day roll (scheduled follow-ups fire).
 * Every branch uses only legal engine actions.
 */
function planDay(state: GameState, covered: Set<string>): GameState {
  let s = state;
  if (s.encounter) s = clearEncounter(s);

  // A. The plague run is time-boxed to the live event — chase it first.
  if (!covered.has('cargo.medicinals.plague-relief') && s.eraEvent?.defId === 'plague') {
    return pursuePlague(s, covered);
  }

  if (!s.player.activeContract) {
    const signIdx = signableCargoIndex(s, covered);
    if (signIdx >= 0) {
      // The signed contract's cargo head is now eligible — cover it this dawn.
      return signContract(s, signIdx, covered);
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

  // E. Only the rim Contraband run (and/or scheduled/plague waits) left — go get it.
  if (!covered.has('cargo.ticking-crate.discovered')) {
    return pursueContraband(s, covered);
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
    // A seed sweep: the bulk of the 25 fall in the first seed. The long poles are
    // the two T-1302 rewrites — the plague run needs a live `plague` era event
    // (seeded, ~1-in-6 of a rare onset) to coincide with a Medicinals haul into
    // the epicentre, and the contraband run needs the rim board to roll a type-10
    // offer. A wider seed ceiling hardens both; the loop stops the instant the
    // union is complete (in practice within the first couple of seeds).
    for (let seed = 1; seed <= 20 && covered.size < TARGET_SET.size; seed += 1) {
      runSeed(seed, 500, covered);
    }

    const missing = T401_IDS.filter((id) => !covered.has(id));
    expect(missing, `unreached storylets: ${missing.join(', ')}`).toEqual([]);
  }, 180000);
});
