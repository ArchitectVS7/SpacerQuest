import { describe, it, expect } from 'vitest';
import { advanceDay, applyPlayerAction, endDay, startDay } from '../day.js';
import { createInitialState, serializeState, deserializeState } from '../state.js';
import { DayPhase, PlayerAction } from '../types.js';

const TEN_DAY_SCRIPT: PlayerAction[][] = [
  [
    { type: 'Trade', action: 'buy-fuel', fuelAmount: 20, spendDie: 0 },
    { type: 'Travel', destinationId: 2, spendDie: 1 },
    { type: 'Trade', action: 'pay-debt', amount: 50 },
  ],
  [{ type: 'Trade', action: 'buy-fuel', fuelAmount: 5, spendDie: 1 }],
  [
    { type: 'Trade', action: 'haggle', contractIndex: 0, spendDie: 0 },
    { type: 'Trade', action: 'sign-contract', contractIndex: 0, spendDie: 1 },
    { type: 'Travel', destinationId: 3, spendDie: 2 },
  ],
  [
    { type: 'Trade', action: 'pay-debt', amount: 25 },
    { type: 'Travel', destinationId: 4, spendDie: 1 },
  ],
  [{ type: 'Wait' }],
  [{ type: 'Trade', action: 'buy-fuel', fuelAmount: 10, spendDie: 0 }, { type: 'Wait' }],
  [
    { type: 'Travel', destinationId: 5, spendDie: 0 },
    { type: 'Trade', action: 'pay-debt', amount: 100 },
  ],
  [
    { type: 'Trade', action: 'haggle', contractIndex: 0, spendDie: 0 },
    { type: 'Trade', action: 'buy-fuel', fuelAmount: 1, spendDie: 1 },
  ],
  [{ type: 'Travel', destinationId: 6, spendDie: 1 }],
  [
    { type: 'Trade', action: 'buy-fuel', fuelAmount: 10, spendDie: 0 },
    { type: 'Wait' },
    { type: 'Trade', action: 'pay-debt', amount: 10 },
  ],
];

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

  it('produces the same results when advanced in phases for 10 scripted days', () => {
    let batchState = createInitialState(1);
    let steppedState = createInitialState(1);

    for (const actions of TEN_DAY_SCRIPT) {
      const batchResult = advanceDay(batchState, actions);

      const dawn = startDay(steppedState);
      let nextSteppedState = dawn.state;
      const steppedEvents = [...dawn.events];

      for (const action of actions) {
        const result = applyPlayerAction(nextSteppedState, action);
        nextSteppedState = result.state;
        steppedEvents.push(...result.events);
      }

      const dusk = endDay(nextSteppedState);
      steppedEvents.push(...dusk.events);

      expect(steppedEvents).toEqual(batchResult.events);

      batchState = batchResult.state;
      steppedState = dusk.state;
    }

    expect(steppedState).toEqual(batchState);
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

  it('produces identical batch vs stepped results across a Storylet action', () => {
    // The Sun-3 auditor storylet is deterministically available on day 1 (start
    // system 1, TOUR_ONE), so it can anchor the batch/stepped equivalence.
    const actions: PlayerAction[] = [
      { type: 'Storylet', storyletId: 'port.sun3.guild-auditor', choiceId: 'argue', spendDie: 0 },
      { type: 'Travel', destinationId: 2, spendDie: 1 },
    ];

    const availability = startDay(createInitialState(555));
    expect(availability.state.storylets.available.map((offer) => offer.storyletId)).toContain(
      'port.sun3.guild-auditor',
    );

    const batch = advanceDay(createInitialState(555), actions);

    const dawn = startDay(createInitialState(555));
    let steppedState = dawn.state;
    const steppedEvents = [...dawn.events];
    for (const action of actions) {
      const result = applyPlayerAction(steppedState, action);
      steppedState = result.state;
      steppedEvents.push(...result.events);
    }
    const dusk = endDay(steppedState);
    steppedEvents.push(...dusk.events);

    expect(steppedEvents).toEqual(batch.events);
    expect(dusk.state).toEqual(batch.state);
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
