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
    enemyHull: 1,
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

function selectRattlesnakeInterceptor() {
  const state = readyState();
  state.player.tier = 3;
  state.npcs = state.npcs.filter((npc) => npc.profileId === 'npc-rattlesnake');

  for (let seed = 1; seed <= 10_000; seed += 1) {
    const interceptor = selectEncounterInterceptor(state, 1, 2, 3, new SeededRng(seed));
    if (interceptor.profileId === 'npc-rattlesnake') {
      return interceptor;
    }
  }

  throw new Error('No seed selected Rattlesnake as named interceptor');
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

  it('rejects combat without an active encounter instead of running legacy stub DCs', () => {
    const state = readyState();

    expect(() =>
      resolveCombat(
        state,
        { type: 'Combat', stance: 'run', targetId: 'npc-1', spendDie: 0 },
        new SeededRng(1),
      ),
    ).toThrow('Combat requires an active encounter');
  });

  it('blocks travel, trade, and shipyard while an encounter is active', () => {
    const state = readyState();
    state.encounter = fixtureEncounter();
    const before = structuredClone(state);

    const attempts: readonly { actionType: string; action: PlayerAction }[] = [
      { actionType: 'Travel', action: { type: 'Travel', destinationId: 2, spendDie: 0 } },
      {
        actionType: 'Trade',
        action: { type: 'Trade', action: 'buy-fuel', fuelAmount: 1, spendDie: 0 },
      },
      {
        actionType: 'Shipyard',
        action: { type: 'Shipyard', action: 'buy-cargo-pods', quantity: 1, spendDie: 0 },
      },
    ];

    for (const { actionType, action } of attempts) {
      const result = applyPlayerAction(state, action);
      const blocked = {
        type: 'ActionBlocked',
        day: state.day,
        actionType,
        reason: 'active-encounter',
      };

      // The refusal is logged, but no die is spent, dayEventCount is not
      // bumped, and everything else is untouched.
      expect(result.events).toEqual([blocked]);
      expect(result.state.eventLog).toEqual([...before.eventLog, blocked]);
      expect({ ...result.state, eventLog: undefined }).toEqual({
        ...before,
        eventLog: undefined,
      });
      expect(result.state.dayEventCount).toBe(before.dayEventCount);
    }
  });

  it('keeps and increments the encounter round after a failed talk check', () => {
    const state = readyState();
    state.player.dawnHand = { dice: [1], spent: [false] };
    state.player.stats[Stat.TRADE] = 0;
    state.player.credits = 0;
    state.encounter = fixtureEncounter();

    const { state: nextState, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'talk', targetId: state.encounter.interceptor.id, spendDie: 0 },
      new SeededRng(1),
    );

    expect(nextState.encounter?.round).toBe(2);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'TributeDemanded', amount: 1000, affordable: false }),
    );
    expect(events).toContainEqual(expect.objectContaining({ type: 'EnemyCounterAction' }));
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'EncounterRound', continues: true, stance: 'talk' }),
    );
  });

  it.each([
    ['talk', 'talked-down'],
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

  it('successful run escapes without completing the pending travel', () => {
    const { state: nextState, events } = resolveEncounterAction('run');

    expect(nextState.encounter).toBeNull();
    expect(nextState.player.currentSystemId).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'EncounterResolved', resolution: 'escaped' }),
    );
    expect(
      events.some(
        (event) => event.type === 'TravelEvent' && event.resumedFromEncounterId === 'enc-test',
      ),
    ).toBe(false);
  });

  it('failed talk pays tribute when affordable and resolves as talked-down', () => {
    const state = readyState();
    state.player.dawnHand = { dice: [1], spent: [false] };
    state.player.credits = 1500;
    state.encounter = fixtureEncounter();

    const { state: nextState, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'talk', targetId: state.encounter.interceptor.id, spendDie: 0 },
      new SeededRng(1),
    );

    expect(nextState.encounter).toBeNull();
    expect(nextState.player.credits).toBe(500);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'TributeDemanded', amount: 1000, affordable: true }),
    );
    expect(events).toContainEqual(expect.objectContaining({ type: 'TributePaid', amount: 1000 }));
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'EncounterResolved', resolution: 'talked-down' }),
    );
  });

  it('caps tribute escalation at the foundation maximum', () => {
    const state = readyState();
    state.player.dawnHand = { dice: [1], spent: [false] };
    state.player.credits = 20_000;
    state.encounter = fixtureEncounter({ round: 12 });

    const { state: nextState, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'talk', targetId: state.encounter.interceptor.id, spendDie: 0 },
      new SeededRng(1),
    );

    expect(nextState.player.credits).toBe(10_000);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'TributeDemanded', amount: 10_000 }),
    );
    expect(events).toContainEqual(expect.objectContaining({ type: 'TributePaid', amount: 10_000 }));
  });

  it('enemy flaw check can refuse tribute and keep combat active', () => {
    const rattlesnake = selectRattlesnakeInterceptor();
    const state = readyState();
    state.player.dawnHand = { dice: [1], spent: [false] };
    state.player.credits = 10_000;
    state.encounter = fixtureEncounter({ interceptor: rattlesnake });

    const { state: nextState, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'talk', targetId: state.encounter.interceptor.id, spendDie: 0 },
      new SeededRng(1),
    );

    expect(nextState.encounter?.round).toBe(2);
    expect(nextState.player.credits).toBe(10_000);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'FlawCheck',
        npcId: rattlesnake.id,
        flaw: 'Vengeful',
        dc: 14,
        resisted: false,
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'TributeDemanded', refused: true, affordable: true }),
    );
    expect(events.some((event) => event.type === 'TributePaid')).toBe(false);
  });

  it('plays a deterministic three-round combat state machine', () => {
    let state = readyState();
    state.player.dawnHand = { dice: [1, 20, 20], spent: [false, false, false] };
    state.player.credits = 0;
    state.encounter = fixtureEncounter({
      enemyHull: 2,
      interceptor: {
        ...fixtureEncounter().interceptor,
        stats: { PILOT: 1, GUNS: 20, TRADE: 0, GRIT: 0, GUILE: 1 },
      },
    });

    const roundOne = resolveCombat(
      state,
      { type: 'Combat', stance: 'talk', targetId: state.encounter.interceptor.id, spendDie: 0 },
      new SeededRng(1),
    );
    state = roundOne.state;
    const roundTwo = resolveCombat(
      state,
      { type: 'Combat', stance: 'fight', targetId: state.encounter!.interceptor.id, spendDie: 1 },
      new SeededRng(2),
    );
    state = roundTwo.state;
    const roundThree = resolveCombat(
      state,
      { type: 'Combat', stance: 'fight', targetId: state.encounter!.interceptor.id, spendDie: 2 },
      new SeededRng(3),
    );

    expect(roundOne.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'TributeDemanded', round: 1, amount: 1000 }),
        expect.objectContaining({
          type: 'ComponentDamaged',
          component: 'shields',
          newCondition: 8,
        }),
      ]),
    );
    expect(roundTwo.state.encounter?.round).toBe(3);
    expect(roundTwo.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'CombatEvent', stance: 'fight', enemyHullRemaining: 1 }),
        expect.objectContaining({ type: 'ComponentDamaged', component: 'drives', newCondition: 8 }),
      ]),
    );
    expect(roundThree.state.encounter).toBeNull();
    expect(roundThree.state.player.currentSystemId).toBe(2);
    expect(roundThree.events).toContainEqual(
      expect.objectContaining({ type: 'EncounterResolved', resolution: 'defeated' }),
    );
  });

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
    expect(events).toContainEqual(expect.objectContaining({ type: 'EnemyCounterAction' }));
  });

  it('enemy pressure can damage components and emit ShipLost', () => {
    const state = readyState();
    state.player.dawnHand = { dice: [1], spent: [false] };
    state.player.ship.hull.condition = 1;
    state.encounter = fixtureEncounter({
      round: 4,
      interceptor: {
        ...fixtureEncounter().interceptor,
        stats: { PILOT: 1, GUNS: 20, TRADE: 0, GRIT: 0, GUILE: 1 },
      },
    });

    const { state: nextState, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'run', targetId: state.encounter.interceptor.id, spendDie: 0 },
      new SeededRng(1),
    );

    expect(nextState.encounter).toBeNull();
    expect(nextState.player.ship.hull.condition).toBe(0);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'ComponentDamaged', component: 'hull', newCondition: 0 }),
    );
    expect(events).toContainEqual(expect.objectContaining({ type: 'ShipLost' }));
    expect(deserializeState(serializeState(nextState))).toEqual(nextState);
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
