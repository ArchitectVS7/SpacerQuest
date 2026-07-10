import { describe, expect, it } from 'vitest';
import { Stat } from '@spacerquest/content';
import { resolveCombat } from '../actions/combat.js';
import { generateEncounter, resolveTravel, selectEncounterInterceptor } from '../actions/travel.js';
import { applyPlayerAction } from '../day.js';
import { SeededRng } from '../rng.js';
import { createInitialState, deserializeState, serializeState } from '../state.js';
import { DayPhase, EncounterState, GameState, PlayerAction } from '../types.js';

function readyState(seed = 123): GameState {
  const state = createInitialState(seed);
  state.dayPhase = DayPhase.DAY;
  state.player.dawnHand = { dice: [20, 19, 4, 3, 1], spent: [false, false, false, false, false] };
  state.player.ship.fuel = 1000;
  return state;
}

function fixtureEncounter(overrides: Partial<EncounterState> = {}): EncounterState {
  return {
    id: 'enc-test',
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
    ...overrides,
  };
}

function findEncounterSeed(): number {
  const state = readyState();
  for (let seed = 1; seed <= 10_000; seed += 1) {
    if (generateEncounter(state, 1, 27, 50, new SeededRng(seed))) {
      return seed;
    }
  }
  throw new Error('No encounter seed found');
}

function resolveEncounterAction(
  stance: 'talk' | 'run' | 'fight',
  spendDie = 0,
  state = readyState(),
): ReturnType<typeof resolveCombat> {
  state.encounter = fixtureEncounter();
  return resolveCombat(
    state,
    {
      type: 'Combat',
      stance,
      targetId: state.encounter.interceptor.id,
      spendDie,
    },
    new SeededRng(1),
  );
}

describe('Encounter system', () => {
  it('starts deterministic encounters for the same seed and action', () => {
    const rngSeed = findEncounterSeed();
    const action: PlayerAction = { type: 'Travel', destinationId: 27, spendDie: 0 };
    const first = resolveTravel(readyState(111), action, new SeededRng(rngSeed));
    const second = resolveTravel(readyState(111), action, new SeededRng(rngSeed));

    expect(first.state.encounter).toBeTruthy();
    expect(first.state.encounter).toEqual(second.state.encounter);
    expect(first.events).toEqual(second.events);
    expect(first.events.some((event) => event.type === 'EncounterStarted')).toBe(true);
  });

  it('respects player tier bands across 500 seeded interceptor selections', () => {
    for (let playerTier = 1; playerTier <= 5; playerTier += 1) {
      for (let seed = 1; seed <= 500; seed += 1) {
        const state = readyState(seed);
        state.player.tier = playerTier as GameState['player']['tier'];
        const interceptor = selectEncounterInterceptor(state, 1, 27, 5, new SeededRng(seed));
        expect(interceptor.tier).toBeGreaterThanOrEqual(Math.max(1, playerTier - 1));
        expect(interceptor.tier).toBeLessThanOrEqual(Math.min(5, playerTier + 1));
      }
    }
  });

  it('round-trips an encounter through JSON mid-travel', () => {
    const state = readyState();
    state.encounter = fixtureEncounter();

    expect(deserializeState(serializeState(state))).toEqual(state);
  });

  it('blocks travel and trade while an encounter is active', () => {
    const state = readyState();
    state.encounter = fixtureEncounter();

    expect(() =>
      applyPlayerAction(state, { type: 'Travel', destinationId: 2, spendDie: 0 }),
    ).toThrow('Cannot travel during an active encounter');
    expect(() =>
      applyPlayerAction(state, { type: 'Trade', action: 'buy-fuel', fuelAmount: 1, spendDie: 0 }),
    ).toThrow('Cannot trade during an active encounter');
  });

  it('keeps and increments the encounter round after a failed talk check', () => {
    const state = readyState();
    state.player.dawnHand = { dice: [1], spent: [false] };
    state.player.stats[Stat.TRADE] = 0;
    state.encounter = fixtureEncounter();

    const { state: nextState, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'talk', targetId: state.encounter.interceptor.id, spendDie: 0 },
      new SeededRng(1),
    );

    expect(nextState.encounter?.round).toBe(2);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'EncounterRound', continues: true, stance: 'talk' }),
    );
  });

  it.each([
    ['talk', 'talked-down'],
    ['run', 'escaped'],
    ['fight', 'defeated'],
  ] as const)(
    'successful %s clears the encounter and completes pending travel',
    (stance, resolution) => {
      const { state: nextState, events } = resolveEncounterAction(stance);

      expect(nextState.encounter).toBeNull();
      expect(nextState.player.currentSystemId).toBe(2);
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'EncounterResolved', resolution }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'TravelEvent',
          success: true,
          resumedFromEncounterId: 'enc-test',
        }),
      );
    },
  );

  it.each([
    ['run', 9],
    ['fight', 49],
  ] as const)('insufficient fuel during %s keeps the encounter active', (stance, fuel) => {
    const state = readyState();
    state.player.ship.fuel = fuel;
    const { state: nextState, events } = resolveEncounterAction(stance, 0, state);

    expect(nextState.encounter).toBeTruthy();
    expect(nextState.player.currentSystemId).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'CombatEvent',
        stance,
        success: false,
        insufficientFuel: true,
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'EncounterRound', continues: true, insufficientFuel: true }),
    );
  });

  it('delivers contracts only after encounter resolution', () => {
    const state = readyState();
    state.player.credits = 100;
    state.player.activeContract = { destination: 2, cargoType: 1, payment: 250, pods: 1 };
    state.encounter = fixtureEncounter();

    expect(state.player.currentSystemId).toBe(1);
    expect(state.player.credits).toBe(100);

    const { state: nextState } = resolveCombat(
      state,
      { type: 'Combat', stance: 'talk', targetId: state.encounter.interceptor.id, spendDie: 0 },
      new SeededRng(1),
    );

    expect(nextState.player.currentSystemId).toBe(2);
    expect(nextState.player.credits).toBe(350);
    expect(nextState.player.activeContract).toBeNull();
  });
});
