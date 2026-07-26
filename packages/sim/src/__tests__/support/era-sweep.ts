// ---------------------------------------------------------------------------
// T-1504d · The era-event reachability driver.
//
// A plain support module (NOT a `*.test.ts` file, so vitest never collects it as
// a suite) — the same precedent as `campaign-drivers.ts` and `deed-hunter.ts`.
//
// WHY IT WAS EXTRACTED: `era-storylet-coverage.test.ts` used to hunt seeds inline
// (`for (seed = 1; seed <= 30) … break`), which meant the recorded evidence for
// its pins could only ever come from re-running the test itself. T-1504d pins the
// seeds, and a pin is only honest if the throwaway `.scratch/` sweep that FOUND
// it and the committed test that ASSERTS it run the IDENTICAL driver. So the
// driver lives here and both callers import it. Moving it was a pure move — no
// logic changed, no clause dropped; the committed test's two assertions are
// byte-identical to the pre-extraction ones.
// ---------------------------------------------------------------------------
import { STORYLETS, type StoryletDefinition } from '@spacerquest/content';
import {
  applyPlayerAction,
  createInitialState,
  endDay,
  startDay,
  type GameState,
} from '@spacerquest/engine';

/** defId → the storylets that name it. Derived, never hand-maintained. */
export const TIE_INS = new Map<string, string[]>();
for (const storylet of STORYLETS as readonly StoryletDefinition[]) {
  const defId = storylet.trigger.eraEvent?.defId;
  if (defId === undefined) continue;
  TIE_INS.set(defId, [...(TIE_INS.get(defId) ?? []), storylet.id]);
}

/** Storylet ids tied to a defId, for the "was it offered" check. */
function tiedIds(defId: string): ReadonlySet<string> {
  return new Set(TIE_INS.get(defId) ?? []);
}

function freeDie(state: GameState): number | undefined {
  const hand = state.player.dawnHand;
  if (!hand) return undefined;
  for (let i = 0; i < hand.dice.length; i += 1) {
    if (!hand.spent[i]) return i;
  }
  return undefined;
}

/** Clear an encounter so the day can keep moving. Talk first (it completes an
 *  interrupted jump), run as the fallback. */
function clearEncounter(state: GameState): GameState {
  let next = state;
  let guard = 0;
  while (next.encounter && guard < 6) {
    guard += 1;
    const die = freeDie(next);
    if (die === undefined) break;
    next = applyPlayerAction(next, {
      type: 'Combat',
      stance: guard <= 3 ? 'talk' : 'run',
      targetId: next.encounter.interceptor.id,
      spendDie: die,
    }).state;
  }
  return next;
}

/**
 * A plain hauler day: keep the tank up, keep a contract moving, keep flying. It
 * has NO awareness of era events whatsoever — it never reads `state.eraEvent`,
 * never steers toward an epicentre, and never resolves a storylet. That is the
 * point: the tie-ins must surface during ORDINARY play, not because the driver
 * went looking for them.
 */
function haulerDay(state: GameState): GameState {
  let next = state;
  if (next.encounter) next = clearEncounter(next);

  // Top the tank when it dips, so a jump is always affordable.
  if (next.player.ship.fuel < 150) {
    const price = next.market.localFuelPrice || 5;
    const room = next.player.ship.maxFuel - next.player.ship.fuel;
    const units = Math.max(0, Math.min(room, Math.floor(next.player.credits / price)));
    const die = freeDie(next);
    if (units > 0 && die !== undefined) {
      next = applyPlayerAction(next, {
        type: 'Trade',
        action: 'buy-fuel',
        fuelAmount: units,
        spendDie: die,
      }).state;
    }
  }

  if (next.player.activeContract) {
    const die = freeDie(next);
    if (die !== undefined) {
      next = applyPlayerAction(next, {
        type: 'Travel',
        destinationId: next.player.activeContract.destination,
        spendDie: die,
      }).state;
    }
    if (next.encounter) next = clearEncounter(next);
    return next;
  }

  // Sign the cheapest-to-reach offer on the board and fly it.
  const board = next.market.manifestBoard;
  if (board.length > 0) {
    const signDie = freeDie(next);
    if (signDie !== undefined) {
      next = applyPlayerAction(next, {
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: 0,
        spendDie: signDie,
      }).state;
    }
    const travelDie = freeDie(next);
    if (next.player.activeContract && travelDie !== undefined) {
      next = applyPlayerAction(next, {
        type: 'Travel',
        destinationId: next.player.activeContract.destination,
        spendDie: travelDie,
      }).state;
      if (next.encounter) next = clearEncounter(next);
    }
  }
  return next;
}

export interface Sighting {
  /** defIds whose era event the scheduler actually started during play. */
  started: Set<string>;
  /** defIds that had a tied storylet on the offer board while they were live. */
  fired: Set<string>;
}

export function emptySighting(): Sighting {
  return { started: new Set(), fired: new Set() };
}

export function runSeed(seed: number, maxDays: number, sighting: Sighting): void {
  let state = createInitialState(seed);
  for (let day = 0; day < maxDays; day += 1) {
    let dayState = startDay(state).state;

    // (a) ERA REACHABILITY — the engine's own scheduler started an event.
    for (const event of state.eventLog) {
      if (event.type === 'EraEventStarted') sighting.started.add(event.defId);
    }

    // (b) TIE-IN FIRING — while an event is live, a storylet naming its defId is
    //     on the offer board. Read only; the driver never resolves it (being
    //     offered IS reachability, the same bar the T-401 storylet sweep uses).
    const live = dayState.eraEvent?.defId;
    if (live !== undefined) {
      const tied = tiedIds(live);
      if (dayState.storylets.available.some((offer) => tied.has(offer.storyletId))) {
        sighting.fired.add(live);
      }
    }

    dayState = haulerDay(dayState);

    const live2 = dayState.eraEvent?.defId;
    if (live2 !== undefined) {
      const tied = tiedIds(live2);
      if (dayState.storylets.available.some((offer) => tied.has(offer.storyletId))) {
        sighting.fired.add(live2);
      }
    }

    state = endDay(dayState).state;
    for (const event of state.eventLog.slice(-40)) {
      if (event.type === 'EraEventStarted') sighting.started.add(event.defId);
    }
  }
}
