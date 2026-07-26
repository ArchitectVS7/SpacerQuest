import { ERA_EVENTS, STORYLETS, type StoryletDefinition } from '@spacerquest/content';
import {
  applyPlayerAction,
  createInitialState,
  endDay,
  startDay,
  type GameState,
} from '@spacerquest/engine';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// T-1504 · Era-event storylet tie-in reachability.
//
// PROVENANCE: this sweep arrived early, inside the interrupted 77ee7c04 WIP
// commit, ahead of the task that owns it. T-1504b (the tie-in content pass) only
// RE-RAN it, to prove the flag-gate rework of the two optional tie-ins did not
// break the per-defId union — it deliberately did not extend it, re-tune its
// seeds, or touch its horizon. Finishing and pinning this sweep (seed budget,
// horizon, the wider reachability bar) is T-1504d's deliverable.
//
// Acceptance: "every era reachable and fires >= 1 tied storylet in a seed sweep."
//
// Two halves, both honest:
//   1. STATIC — every authored era event has at least one storylet whose
//      `trigger.eraEvent.defId` names it. The map is DERIVED FROM `STORYLETS`,
//      never hand-listed, so a future era event added without a tie-in fails this
//      test automatically rather than passing a stale literal.
//   2. PLAYED — a seeded sweep of honest headless play in which, for each of the
//      six defIds, (a) the engine's own dusk scheduler actually STARTED that era
//      event (an `EraEventStarted` in the log — era reachability), and (b) while
//      it was live, a storylet tied to that defId was on the offer board (tie-in
//      firing). Nothing pokes `state.eraEvent`, the day, or the ship's position to
//      manufacture either half: the driver only plays legal actions through
//      `applyPlayerAction` / `startDay` / `endDay` and observes.
//
// WHY THE SWEEP IS CHEAP: onset is ~10%/dusk after a 5-day cooldown with a
// uniform 1-of-6 pick (engine era.ts), so a 400-day run yields ~25 onsets and a
// couple of seeds cover all six kinds. The tie-ins that carry the per-defId
// guarantee gate on `defId` ALONE — an `inAffectedSystem` gate on a
// single-system event would demand the ship be standing on the one rolled
// epicentre, which is what makes the T-1302 plague exemplar the storylet sweep's
// long pole. That design choice is what this test protects.
// ---------------------------------------------------------------------------

/** defId → the storylets that name it. Derived, never hand-maintained. */
const TIE_INS = new Map<string, string[]>();
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

interface Sighting {
  /** defIds whose era event the scheduler actually started during play. */
  started: Set<string>;
  /** defIds that had a tied storylet on the offer board while they were live. */
  fired: Set<string>;
}

function runSeed(seed: number, maxDays: number, sighting: Sighting): void {
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

describe('T-1504 era-event storylet tie-ins', () => {
  it('every authored era event has at least one storylet tied to it', () => {
    const untied = ERA_EVENTS.filter((def) => (TIE_INS.get(def.id)?.length ?? 0) === 0).map(
      (def) => def.id,
    );
    expect(untied, `era events with no storylet tie-in: ${untied.join(', ')}`).toEqual([]);
    // ...and every tie-in names a REAL era event (content validation already
    // rejects an unknown defId; this pins the inverse direction).
    const known = new Set(ERA_EVENTS.map((def) => def.id));
    for (const defId of TIE_INS.keys()) {
      expect(known.has(defId), `${defId} is not an authored era event`).toBe(true);
    }
  });

  it('a seed sweep reaches every era event and offers a tied storylet while it is live', () => {
    const sighting: Sighting = { started: new Set(), fired: new Set() };
    const target = ERA_EVENTS.length;
    // Measured at authoring time: seeds 1-3 complete both unions (the scheduler
    // rolls ~25 onsets per 400-day run over a uniform 1-of-6 pick). The ceiling is
    // generous headroom, not the cost — the loop breaks the moment both are full.
    for (let seed = 1; seed <= 30; seed += 1) {
      if (sighting.started.size === target && sighting.fired.size === target) break;
      runSeed(seed, 400, sighting);
    }

    const unreached = ERA_EVENTS.filter((def) => !sighting.started.has(def.id)).map((d) => d.id);
    expect(unreached, `era events never scheduled in play: ${unreached.join(', ')}`).toEqual([]);

    const silent = ERA_EVENTS.filter((def) => !sighting.fired.has(def.id)).map((d) => d.id);
    expect(silent, `era events that fired no tied storylet: ${silent.join(', ')}`).toEqual([]);
  }, 300000);
});
