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
