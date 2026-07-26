import { describe, expect, it } from 'vitest';
import {
  ALL_FRAGMENT_IDS,
  BEACON_FRAGMENT_POOL,
  CROSSING_ENDING,
  CROSSING_STAKE_MIN_CREDITS,
  CROSSING_WIRE,
  DEEDS,
  DERELICT_FRAGMENT_POOL,
  NEMESIS_SYSTEM_ID,
  RENOWN_DEED_THRESHOLDS,
  RENOWN_RANKS,
  WISE_ONE_FRAGMENT_ID,
} from '@spacerquest/content';
import {
  applyPlayerAction,
  careerEnded,
  careerEpilogue,
  createInitialState,
  endDay,
  rankForDeedCount,
  startDay,
  syncMaxFuel,
  type GameEvent,
  type GameState,
} from '@spacerquest/engine';
import { legalActions } from '../protocol.js';

// ---------------------------------------------------------------------------
// T-1505c · THE WHOLE ARC, SCRIPTED: twelve fragments → decoded → crossing →
// ENDING. This is the acceptance's "full arc completable in a scripted long
// sim", and the headless half of "the ending is reachable" (standing
// constraint 2 — nothing here touches the UI).
//
// HONEST SPLIT, stated up front (the `nemesis-crossing.test.ts` convention):
//
// SCENARIO INPUT — injected, and nothing else:
//   * The registry stood up at the crossing's required rank, by filling its
//     ledger with `RENOWN_DEED_THRESHOLDS.CONQUEROR` REAL content deeds and
//     re-deriving the rank through `rankForDeedCount` (both derived from
//     content, so T-1603's rescale moves the fixture with the game). That an
//     unguided career actually REACHES Conqueror is proven by
//     `deed-coverage.test.ts` (seed 2, day 102); this file declines to re-pay
//     that ~30s.
//   * A fitted-veteran ship (drives / hull / navigation) with a full tank, and a
//     bank balance above the stake floor. `debt = 0`, `loan = null`.
//
//   * THE NEMESIS FILE STARTS EMPTY. That is the whole difference between this
//     file and T-1505b's `nemesis-crossing.test.ts`, which injects the twelve
//     fragments and walks only the terminus. Here every fragment is FOUND.
//
// PLAYED — through `startDay` / `applyPlayerAction` / `endDay` only, with zero
// state pokes after the fixture is built:
//   1. all twelve fragments acquired across all FOUR authored modes — the Wise
//      One's windowed Polaris-1 hook (`day >= 25`, which is what makes this a
//      LONG sim), off-lane `Explore` sweeps for the derelict and beacon pools,
//      the two NPC-held pieces at Fomalhaut-2 / Mira-9, and the Sage's own two;
//   2. all twelve decoded through the real `sage.mizar.decode-*` storylets;
//   3. the stake committed via `nemesis.crossing.the-stake`;
//   4. the jump to NEMESIS;
//   5. THE ENDING — `careerEnded`, the epilogue, an empty `legalActions`, and a
//      typed `career-ended` refusal on the next verb attempted.
//
// SEED PROVENANCE (pinned, never hunted at test time — TASKS.md v1.2 sizing rule
// 1): swept seeds 1..4 at a 120-day horizon with the driver below. Seed 1 is the
// first that lands the complete set, and lands all FIVE `FragmentSource`
// literals: derelict (03/04/06/07 on days 1–6), beacon (05/02/08 on days 4–8),
// npc (09 on day 2, 10 on day 3), sage (11 on day 4, 12 on day 5) and wise-one
// (01 on day 26 — the first day the windowed hook can fire). Every fragment is
// decoded by day 27; the stake and the crossing follow immediately after.
//
// Budget: the event log is cloned per action (O(days²) — see the note in
// `campaign-nemesis.test.ts`), so the driver BREAKS the instant the career ends
// and the horizon is capped well inside the useful range. Measured ~0.2s.
// ---------------------------------------------------------------------------

/** Sweep provenance above. */
const ARC_SEED = 1;
/** Generous cap: seed 1 finishes on day 28. A regression that stalls the arc
 *  fails on the assertions below rather than hanging the suite. */
const HORIZON = 120;

const POLARIS = 17;
const FOMALHAUT = 7;
const MIRA = 8;
const MIZAR = 18;
const CROSSING_STORYLET = 'nemesis.crossing.the-stake';

/** The fragments that exist ONLY in the exploration loot pools — the ids no
 *  storylet grants, so the sweep is the only way to hold them. Derived from the
 *  content pools, never listed by hand. */
const POOL_ONLY_IDS = [...new Set([...DERELICT_FRAGMENT_POOL, ...BEACON_FRAGMENT_POOL])];

type FragmentAcquired = Extract<GameEvent, { type: 'FragmentAcquired' }>;

/** The scenario fixture. See the HONEST SPLIT header for input vs played. */
function veteranAtSol(seed: number): GameState {
  const base = createInitialState(seed);
  base.player.registry.earned = DEEDS.slice(0, RENOWN_DEED_THRESHOLDS.CONQUEROR).map(
    (deed, index) => ({
      id: deed.id,
      title: deed.title,
      citation: deed.citationTemplate,
      day: 1,
      eventIndex: index,
    }),
  );
  base.player.registry.renownRank = rankForDeedCount(base.player.registry.earned.length);
  base.player.credits = CROSSING_STAKE_MIN_CREDITS * 8;
  base.player.debt = 0;
  base.player.loan = null;
  base.player.ship.drives = { strength: 60, condition: 9 };
  base.player.ship.hull = { strength: 30, condition: 9 };
  base.player.ship.navigation = { strength: 90, condition: 9 };
  syncMaxFuel(base.player.ship);
  base.player.ship.fuel = base.player.ship.maxFuel;
  // The Nemesis file is UNTOUCHED — empty, exactly as a fresh career's.
  return base;
}

// --- legal-play helpers (shape shared with nemesis-fragments.test.ts) -------

function freeDie(state: GameState): number | undefined {
  const hand = state.player.dawnHand;
  if (!hand) return undefined;
  for (let i = 0; i < hand.dice.length; i += 1) if (!hand.spent[i]) return i;
  return undefined;
}

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

/** Talk (or run) an interdiction down so the day's other verbs unblock. */
function clearEncounter(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.encounter && guard < 8) {
    guard += 1;
    const die = freeDie(s);
    if (die === undefined) break;
    const targetId = s.encounter.interceptor.id;
    const stance: 'talk' | 'run' = guard <= 3 ? 'talk' : 'run';
    s = applyPlayerAction(s, { type: 'Combat', stance, targetId, spendDie: die }).state;
  }
  return s;
}

/** Top the tank up at the local depot, never spending into the stake floor. */
function ensureFuel(state: GameState): GameState {
  const ship = state.player.ship;
  if (ship.fuel >= 1000) return state;
  const price = state.market.localFuelPrice || 5;
  const spendable = state.player.credits - CROSSING_STAKE_MIN_CREDITS * 2;
  const units = Math.max(
    0,
    Math.min(ship.maxFuel - ship.fuel, Math.floor(spendable / price), 3000),
  );
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

function heldIds(state: GameState): string[] {
  return state.player.nemesisFile.fragments.map((fragment) => fragment.fragmentId);
}

function holds(state: GameState, fragmentId: string): boolean {
  return heldIds(state).includes(fragmentId);
}

function offered(state: GameState, storyletId: string): boolean {
  return state.storylets.available.some((offer) => offer.storyletId === storyletId);
}

function play(
  state: GameState,
  storyletId: string,
  choiceId: string,
): { state: GameState; events: GameEvent[] } {
  return applyPlayerAction(state, { type: 'Storylet', storyletId, choiceId });
}

/** The SHIPPED decode-storylet id for a fragment (fragment 01's path predates the
 *  numbered batch), so the driver walks the same doors a player does. */
function decodeStoryletFor(fragmentId: string): string {
  return fragmentId === WISE_ONE_FRAGMENT_ID
    ? 'sage.mizar.decode-first'
    : `sage.mizar.decode-${fragmentId.slice(-2)}`;
}

/** One jump toward `dest`, completing through any interdiction. A failed pilot
 *  check simply costs the attempt; the driver retries the next dawn. */
function travelToward(state: GameState, dest: number): GameState {
  let s = state;
  if (s.player.currentSystemId === dest) return s;
  s = ensureFuel(s);
  const die = bestDie(s);
  if (die === undefined) return s;
  s = applyPlayerAction(s, { type: 'Travel', destinationId: dest, spendDie: die }).state;
  if (s.encounter) s = clearEncounter(s);
  return s;
}

/** The four AUTHORED fragment-granting scenes, each with the choice that takes
 *  the piece. The driver plays whichever is on today's board — it never forces
 *  one, and never touches the nemesisFile itself. */
const GRANTING_SCENES: readonly (readonly [string, string])[] = [
  ['wise-one.polaris.signal-hook', 'buy-fragment'],
  ['npc.rust-bucket.scrap-sliver', 'take-the-plate'],
  ['npc.void-whisper.psalm-shard', 'take-the-transcription'],
  ['sage.mizar.archive', 'take-the-drawer-piece'],
  ['sage.mizar.final-line', 'take-the-final-line'],
];

describe('T-1505c · the whole Nemesis arc, played: fragments → decode → crossing → ending', () => {
  it('completes the arc in a scripted long sim and ends the career on the far side', () => {
    let state = startDay(veteranAtSol(ARC_SEED)).state;
    const acquired: FragmentAcquired[] = [];
    let stakeCredits = 0;
    let crossingEvents: GameEvent[] = [];

    for (let day = 0; day < HORIZON && !careerEnded(state); day += 1) {
      if (day > 0) state = startDay(state).state;
      if (state.encounter) state = clearEncounter(state);

      // (1) ACQUIRE — play any granting scene that is on today's board.
      for (const [storyletId, choiceId] of GRANTING_SCENES) {
        if (!offered(state, storyletId)) continue;
        const result = play(state, storyletId, choiceId);
        state = result.state;
        acquired.push(
          ...result.events.filter((e): e is FragmentAcquired => e.type === 'FragmentAcquired'),
        );
      }

      // (2) DECODE — every held-and-raw fragment whose Sage scene is live.
      for (const fragment of [...state.player.nemesisFile.fragments]) {
        if (fragment.decoded) continue;
        const storyletId = decodeStoryletFor(fragment.fragmentId);
        if (offered(state, storyletId)) state = play(state, storyletId, 'decode').state;
      }

      // (3) THE STAKE — the moment the set is whole, sign it at the Sage's bench.
      if (offered(state, CROSSING_STORYLET)) {
        stakeCredits = state.player.credits;
        const committed = play(state, CROSSING_STORYLET, 'commit');
        state = committed.state;
        crossingEvents = [...crossingEvents, ...committed.events];
      }

      // (4) MOVE — the errand circuit, in priority order. The Wise One's hook is
      //     windowed on `day >= 25`, so the run to Polaris-1 waits for it; that
      //     wait is what makes this a long sim rather than a scripted scene.
      const needPool = POOL_ONLY_IDS.some((id) => !holds(state, id));
      let target: number | undefined;
      if (state.flags['nemesis.crossing.unlocked'] === true) target = NEMESIS_SYSTEM_ID;
      else if (!holds(state, WISE_ONE_FRAGMENT_ID) && state.day >= 25) target = POLARIS;
      else if (!holds(state, 'frag-nemesis-09')) target = FOMALHAUT;
      else if (!holds(state, 'frag-nemesis-10')) target = MIRA;
      else if (!needPool || !holds(state, 'frag-nemesis-11')) target = MIZAR;
      if (target !== undefined && state.player.currentSystemId !== target) {
        state = travelToward(state, target);
        if (state.encounter) state = clearEncounter(state);
        if (careerEnded(state)) {
          crossingEvents = [...crossingEvents, ...state.eventLog.slice(-8)];
          break;
        }
      }

      // (5) SWEEP — burn the rest of the hand off-lane while pool ids are missing.
      //     The Explore verb is the ONLY route to the derelict / beacon pools.
      if (POOL_ONLY_IDS.some((id) => !holds(state, id))) {
        for (let i = 0; i < 5; i += 1) {
          if (state.encounter) state = clearEncounter(state);
          state = ensureFuel(state);
          const die = freeDie(state);
          if (die === undefined) break;
          const result = applyPlayerAction(state, { type: 'Explore', spendDie: die });
          state = result.state;
          acquired.push(
            ...result.events.filter((e): e is FragmentAcquired => e.type === 'FragmentAcquired'),
          );
        }
      }

      state = endDay(state).state;
    }

    // ---- (a) TWELVE FRAGMENTS, ALL FOUND IN PLAY --------------------------
    // Derived from the content table, never a literal 12.
    expect([...heldIds(state)].sort()).toEqual([...ALL_FRAGMENT_IDS].sort());
    // …and every one of them arrived through a real FragmentAcquired event.
    expect([...new Set(acquired.map((e) => e.fragmentId))].sort()).toEqual(
      [...ALL_FRAGMENT_IDS].sort(),
    );

    // ---- (b) ALL FOUR ACQUISITION MODES ------------------------------------
    // The four authored funnels, by their recorded source: the off-lane sweep
    // (derelict + beacon), the NPC-held pieces, the Sage's drawer, and the Wise
    // One's sale. A regression that collapses the arc onto one funnel fails here.
    const sources = new Set(state.player.nemesisFile.fragments.map((f) => f.source));
    for (const source of ['derelict', 'beacon', 'npc', 'sage', 'wise-one'] as const) {
      expect(sources.has(source), `no fragment was acquired from '${source}'`).toBe(true);
    }
    // The pool ids came off real boarded POIs (resolveLoot stamps the poiId).
    for (const id of POOL_ONLY_IDS) {
      const event = acquired.find((e) => e.fragmentId === id);
      expect(event?.poiId, `${id} was not found on a boarded POI`).toBeDefined();
    }

    // ---- (c) ALL TWELVE DECODED THROUGH THE SAGE ---------------------------
    expect(state.player.nemesisFile.fragments.filter((f) => f.decoded)).toHaveLength(
      ALL_FRAGMENT_IDS.length,
    );

    // ---- (d) THE STAKE, SIGNED --------------------------------------------
    expect(state.flags['nemesis.crossing.unlocked']).toBe(true);
    expect(state.flags['nemesis.crossing.stake.credits']).toBe(stakeCredits);
    expect(crossingEvents).toContainEqual({
      type: 'NemesisCrossing',
      day: state.flags['nemesis.crossing.stake.day'],
      kind: 'stake-committed',
      stakeCredits,
    });

    // ---- (e) THE CROSSING, FLOWN ------------------------------------------
    expect(state.player.currentSystemId).toBe(NEMESIS_SYSTEM_ID);
    expect(state.eventLog).toContainEqual({
      type: 'NemesisCrossing',
      day: state.day,
      kind: 'crossed',
    });
    expect(state.eventLog).toContainEqual({
      type: 'WireEntry',
      day: state.day,
      kind: 'plain',
      message: CROSSING_WIRE.crossed,
    });

    // ---- (f) THE ENDING ----------------------------------------------------
    expect(careerEnded(state)).toBe(true);

    const epilogue = careerEpilogue(state);
    // The prose is CONTENT's, imported — never re-typed here.
    expect(epilogue.kicker).toBe(CROSSING_ENDING.kicker);
    expect(epilogue.title).toBe(CROSSING_ENDING.title);
    expect(epilogue.prose).toEqual(CROSSING_ENDING.prose);
    expect(epilogue.signOff).toBe(CROSSING_ENDING.signOff);
    // …and the numbers are the career's own.
    expect(epilogue.day).toBe(state.day);
    expect(epilogue.fragmentsHeld).toBe(ALL_FRAGMENT_IDS.length);
    expect(epilogue.fragmentsDecoded).toBe(ALL_FRAGMENT_IDS.length);
    expect(epilogue.stakeCredits).toBe(stakeCredits);
    expect(epilogue.rankLabel).toBe(RENOWN_RANKS[epilogue.rankId].label);
    expect(epilogue.systemsCharted).toBe(state.player.charts.visitedSystemIds.length);

    // The headless STOP SIGNAL: the protocol advertises nothing at all.
    const legal = legalActions(state);
    expect(legal.actions).toEqual([]);
    expect(legal.canWait).toBe(false);
    expect(legal.lifecycle).toEqual([]);

    // …and the engine refuses the verb anyway, with the typed reason.
    const refused = applyPlayerAction(state, {
      type: 'Trade',
      action: 'buy-fuel',
      fuelAmount: 1,
      spendDie: 0,
    });
    expect(refused.events).toEqual([
      {
        type: 'ActionBlocked',
        day: state.day,
        actionType: 'Trade',
        reason: 'career-ended',
      },
    ]);
  });
});
