import { describe, it, expect } from 'vitest';
import { advanceDay, applyPlayerAction, endDay, startDay } from '../day.js';
import { createInitialState, serializeState, deserializeState } from '../state.js';
import { DayPhase, PlayerAction } from '../types.js';
import {
  DAY_LOOP_GOLDEN_EVENTS_HASH,
  DAY_LOOP_GOLDEN_STATE_HASH,
  SEED,
  STORYLET_GOLDEN_EVENTS_HASH,
  STORYLET_GOLDEN_STATE_HASH,
  STORYLET_SCRIPT,
  STORYLET_SEED,
  TEN_DAY_SCRIPT,
  runDayLoopGolden,
} from './fixtures/day-loop-golden.js';

describe('Day loop', () => {
  it('advances day deterministically', () => {
    const state1 = createInitialState(123);
    const state2 = createInitialState(123);

    const result1 = advanceDay(state1, []);
    const result2 = advanceDay(state2, []);

    // Should increment day
    expect(result1.state.day).toBe(2);
    expect(result1.state.dayPhase).toBe(DayPhase.DAWN);
    expect(result1.state.dayEventCount).toBe(0);
    expect(result1.events[result1.events.length - 1]).toEqual({ type: 'DayAdvanced', day: 2 });
    expect(result1.state.eventLog[result1.state.eventLog.length - 1]).toEqual({
      type: 'DayAdvanced',
      day: 2,
    });
    expect(result1.state.eventLog).toEqual(result1.events);

    // Hand should be populated and marked fully spent because player waited
    expect(result1.state.player.dawnHand).toBeDefined();
    expect(result1.state.player.dawnHand?.spent).toEqual([true, true, true, true, true]);

    // Should be deterministic
    expect(result1.state).toEqual(result2.state);
    expect(result1.events).toEqual(result2.events);
  });

  it('serializes and deserializes', () => {
    const state = createInitialState(999);
    const { state: nextState } = advanceDay(state, []);

    const json = serializeState(nextState);
    const restored = deserializeState(json);

    expect(restored).toEqual(nextState);
    expect(restored.dayPhase).toBe(DayPhase.DAWN);
    expect(restored.dayEventCount).toBe(0);
  });

  it('emits DayAdvanced after dusk events in returned events and eventLog', () => {
    const state = createInitialState(321);
    state.player.debtDueDay = 1;

    const result = advanceDay(state, []);
    const dayAdvanced = { type: 'DayAdvanced', day: 2 };
    const returnedDebtDueIndex = result.events.findIndex((event) => event.type === 'DebtDue');
    const returnedDayAdvancedIndex = result.events.findIndex(
      (event) => event.type === 'DayAdvanced',
    );
    const loggedDebtDueIndex = result.state.eventLog.findIndex((event) => event.type === 'DebtDue');
    const loggedDayAdvancedIndex = result.state.eventLog.findIndex(
      (event) => event.type === 'DayAdvanced',
    );

    expect(result.events[result.events.length - 1]).toEqual(dayAdvanced);
    expect(result.state.eventLog[result.state.eventLog.length - 1]).toEqual(dayAdvanced);
    expect(result.state.eventLog).toEqual(result.events);
    expect(returnedDebtDueIndex).toBeGreaterThan(-1);
    expect(loggedDebtDueIndex).toBeGreaterThan(-1);
    expect(returnedDayAdvancedIndex).toBeGreaterThan(returnedDebtDueIndex);
    expect(loggedDayAdvancedIndex).toBeGreaterThan(loggedDebtDueIndex);
  });

  it('matches the committed golden for a 10-day scripted batch advance', () => {
    // Replaces the old batch-vs-stepped equivalence test, which compared
    // advanceDay against a hand-inlined copy of its own body (startDay ->
    // applyPlayerAction* -> endDay) — a tautology that can never go red because a
    // rule change moves both sides identically. Here the final state and the
    // day-event stream are pinned to COMMITTED hashes (fixtures/day-loop-golden),
    // so any drift in the real day loop is caught. Regenerate the golden via
    // gen-day-loop-golden.ts when a rule deliberately changes.
    const golden = runDayLoopGolden(SEED, TEN_DAY_SCRIPT);
    expect(golden.stateHash).toBe(DAY_LOOP_GOLDEN_STATE_HASH);
    expect(golden.eventsHash).toBe(DAY_LOOP_GOLDEN_EVENTS_HASH);
  });

  it('matches the committed golden across a Storylet action', () => {
    // Anchors the Storylet action path (Sun-3 guild-auditor is deterministically
    // available on day 1 at seed 555) against committed golden hashes — the
    // coverage the deleted batch-vs-stepped storylet test provided, now guarded
    // by a golden instead of a tautological self-comparison.
    const availability = startDay(createInitialState(STORYLET_SEED));
    expect(availability.state.storylets.available.map((offer) => offer.storyletId)).toContain(
      'port.sun3.guild-auditor',
    );

    const golden = runDayLoopGolden(STORYLET_SEED, STORYLET_SCRIPT);
    expect(golden.stateHash).toBe(STORYLET_GOLDEN_STATE_HASH);
    expect(golden.eventsHash).toBe(STORYLET_GOLDEN_EVENTS_HASH);
  });

  it('can serialize and resume mid-day with the same final state as batch advance', () => {
    const state = createInitialState(789);
    const actions: PlayerAction[] = [
      { type: 'Trade', action: 'buy-fuel', fuelAmount: 12, spendDie: 0 },
      { type: 'Travel', destinationId: 2, spendDie: 1 },
      { type: 'Trade', action: 'pay-debt', amount: 25 },
    ];

    const batch = advanceDay(state, actions);

    const dawn = startDay(state);
    const firstAction = applyPlayerAction(dawn.state, actions[0]);
    const restored = deserializeState(serializeState(firstAction.state));

    expect(restored.dayPhase).toBe(DayPhase.DAY);
    expect(restored.rngState).toBe(firstAction.state.rngState);
    expect(restored.dayEventCount).toBe(firstAction.state.dayEventCount);

    let resumedState = restored;
    for (const action of actions.slice(1)) {
      const result = applyPlayerAction(resumedState, action);
      resumedState = result.state;
    }

    const resumed = endDay(resumedState);

    expect(resumed.state).toEqual(batch.state);
  });

  it('serializes and resumes mid-day across a Storylet action', () => {
    const actions: PlayerAction[] = [
      { type: 'Storylet', storyletId: 'port.sun3.guild-auditor', choiceId: 'argue', spendDie: 0 },
      { type: 'Travel', destinationId: 2, spendDie: 1 },
      { type: 'Trade', action: 'pay-debt', amount: 25 },
    ];

    const batch = advanceDay(createInitialState(777), actions);

    const dawn = startDay(createInitialState(777));
    const firstAction = applyPlayerAction(dawn.state, actions[0]);
    const restored = deserializeState(serializeState(firstAction.state));

    expect(restored.dayPhase).toBe(DayPhase.DAY);
    expect(restored.rngState).toBe(firstAction.state.rngState);
    expect(restored.dayEventCount).toBe(firstAction.state.dayEventCount);

    let resumedState = restored;
    for (const action of actions.slice(1)) {
      resumedState = applyPlayerAction(resumedState, action).state;
    }
    const resumed = endDay(resumedState);

    expect(resumed.state).toEqual(batch.state);
  });

  it('persists active encounters across day end', () => {
    const state = createInitialState(246);
    const dawn = startDay(state);
    dawn.state.encounter = {
      id: 'enc-persist',
      pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
      interceptor: {
        id: 'anon-pirate-1',
        source: 'anonymous',
        name: 'K)(akj',
        shipName: 'K1++++',
        shipClass: 'Maligna Bat',
        homeSystem: 'Pollux-7',
        kind: 'PIRATE',
        rosterIndex: 1,
        stats: { PILOT: 1, GUNS: 0, TRADE: 0, GRIT: 0, GUILE: 1 },
        tier: 1,
      },
      routeDangerLevel: 1,
      routeDangerChance: 0.08,
      encounterRoll: 0.01,
      round: 1,
      enemyHull: 1,
    };

    const dusk = endDay(dawn.state);

    expect(dusk.state.dayPhase).toBe(DayPhase.DAWN);
    expect(dusk.state.encounter?.round).toBe(2);
    expect(dusk.events).toContainEqual(
      expect.objectContaining({ type: 'EnemyCounterAction', pressure: 'day-end' }),
    );
  });
});

describe('Destination gate (T-1101)', () => {
  /** A DAY-phase state with a fresh dawn hand and a full tank. */
  function dayState(seed = 42): ReturnType<typeof startDay>['state'] {
    const state = startDay(createInitialState(seed));
    const next = state.state;
    next.player.ship.fuel = next.player.ship.maxFuel;
    return next;
  }

  it.each([
    ['NEMESIS', 28],
    ['Andromeda', 22],
  ])('blocks Travel to a gated destination (%s) with a typed fail, not a throw', (_label, dest) => {
    const state = dayState();
    const before = structuredClone(state);

    let result: ReturnType<typeof applyPlayerAction> | undefined;
    expect(() => {
      result = applyPlayerAction(state, { type: 'Travel', destinationId: dest, spendDie: 0 });
    }).not.toThrow();
    if (!result) throw new Error('unreachable');

    const blocked = {
      type: 'ActionBlocked',
      day: state.day,
      actionType: 'Travel',
      reason: 'destination-locked',
    };
    // Typed fail — the only event, appended to the log, and NOTHING else moved:
    // no die spent, dayEventCount unchanged, system unchanged (mirrors the
    // encounter-block precedent).
    expect(result.events).toEqual([blocked]);
    expect(result.state.eventLog).toEqual([...before.eventLog, blocked]);
    expect(result.state.dayEventCount).toBe(before.dayEventCount);
    expect(result.state.player.currentSystemId).toBe(before.player.currentSystemId);
    expect(result.state.player.dawnHand?.spent).toEqual(before.player.dawnHand?.spent);
    expect(result.state.player.dawnHand?.spent.some(Boolean)).toBe(false);
  });

  it('the nemesis.crossing.unlocked flag lifts the gate (the consumed reader)', () => {
    const state = dayState();
    state.flags['nemesis.crossing.unlocked'] = true;

    const result = applyPlayerAction(state, { type: 'Travel', destinationId: 28, spendDie: 0 });

    // No refusal: travel proceeds down the normal pilot-check path.
    expect(
      result.events.some(
        (event) => event.type === 'ActionBlocked' && event.reason === 'destination-locked',
      ),
    ).toBe(false);
    expect(result.events.some((event) => event.type === 'StatCheck')).toBe(true);
  });

  it('core travel is unaffected by the gate', () => {
    const state = dayState();
    const result = applyPlayerAction(state, { type: 'Travel', destinationId: 2, spendDie: 0 });

    expect(result.events.some((event) => event.type === 'ActionBlocked')).toBe(false);
    expect(result.events.some((event) => event.type === 'StatCheck')).toBe(true);
  });
});

describe('T-1505 · the crossing arrival (CrossingCompleted)', () => {
  /** A DAY-phase state poised at Polaris-1 with the crossing committed and a ship
   *  that can actually make the (very long) jump to NEMESIS. */
  function crossingReadyState(): ReturnType<typeof startDay>['state'] {
    const next = startDay(createInitialState(42)).state;
    next.flags['nemesis.crossing.unlocked'] = true;
    next.player.currentSystemId = 17; // Polaris-1
    // A maxed drive (cheap per-unit) + a full, generous tank so the distance-131
    // jump to NEMESIS is affordable; a high PILOT + die 20 guarantees the check.
    next.player.ship.drives = { strength: 21, condition: 9 };
    next.player.ship.fuel = 4000;
    next.player.ship.maxFuel = 4000;
    next.player.stats.PILOT = 40;
    next.player.dawnHand = { dice: [20, 12, 6, 3, 1], spent: [false, false, false, false, false] };
    // A decoded signal to report on arrival.
    for (let i = 1; i <= 12; i += 1) {
      const id = `frag-nemesis-${String(i).padStart(2, '0')}`;
      next.player.nemesisFile.fragments.push({
        fragmentId: id,
        source: 'sage',
        day: 1,
        decoded: true,
      });
    }
    return next;
  }

  it('emits CrossingCompleted on arrival at NEMESIS with the flag set', () => {
    const state = crossingReadyState();
    const result = applyPlayerAction(state, { type: 'Travel', destinationId: 28, spendDie: 0 });

    // The ship actually arrived at NEMESIS (no interdiction — suppressed on the
    // crossing lane — and the pilot check passed).
    expect(result.state.player.currentSystemId).toBe(28);
    expect(
      result.events.some(
        (event) => event.type === 'ActionBlocked' && event.reason === 'destination-locked',
      ),
    ).toBe(false);
    // The terminal receipt fired, carrying the assembled decoded count.
    const crossing = result.events.find((e) => e.type === 'CrossingCompleted');
    expect(crossing).toBeDefined();
    if (crossing?.type === 'CrossingCompleted') {
      expect(crossing.fragmentsDecoded).toBe(12);
    }
    // It is a single, once-only receipt in the log.
    expect(result.state.eventLog.filter((e) => e.type === 'CrossingCompleted')).toHaveLength(1);
  });

  it('does NOT emit CrossingCompleted when arriving at a non-NEMESIS system', () => {
    const state = crossingReadyState();
    state.player.currentSystemId = 1; // Sun-3
    const result = applyPlayerAction(state, { type: 'Travel', destinationId: 2, spendDie: 0 });
    expect(result.events.some((e) => e.type === 'CrossingCompleted')).toBe(false);
  });
});
