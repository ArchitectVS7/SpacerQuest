import { describe, expect, it } from 'vitest';
import { Stat } from '@spacerquest/content';
import { resolveCombat } from '../actions/combat.js';
import {
  calculateRouteDanger,
  generateEncounter,
  resolveTravel,
  selectEncounterInterceptor,
} from '../actions/travel.js';
import { applyPlayerAction } from '../day.js';
import { SeededRng } from '../rng.js';
import { createInitialState, deserializeState, serializeState, starterShip } from '../state.js';
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
    routeDangerChance: 0.3, // T-1103: tier-1 core chance (was 0.08); fixture literal, not an assertion
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

  it('matchmaking is route-correct and non-degenerate across a 500-seed sweep', () => {
    // Replaces the old 500-seed test, which only asserted interceptor.tier was in
    // the player-tier ±1 band — a clamp computed three lines above the selection,
    // so it tested the clamp against itself and exercised none of the real
    // matchmaking. This sweep drives the behaviors that test never touched: route
    // -correct anonymous kinds, that BOTH named and anonymous interceptors are
    // actually selected, and that every tier surfaces.
    //
    // Route facts (travel.ts routeKind/allowedAnonymousKinds) hard-coded here so
    // we test against the intended contract, not module internals:
    //   core (1->2):      PIRATE, PATROL, BRIGAND
    //   rim  (1->17):     RIM_PIRATE, PIRATE, BRIGAND, REPTILOID  (T-1101: the
    //                     Reptiloids re-homed onto the reachable rim frontier,
    //                     since §10 seals the Andromeda lanes they used to work)
    //   andromeda (1->22): REPTILOID only
    const ROUTES = [
      { name: 'core', dest: 2, allowed: ['PIRATE', 'PATROL', 'BRIGAND'] },
      { name: 'rim', dest: 17, allowed: ['RIM_PIRATE', 'PIRATE', 'BRIGAND', 'REPTILOID'] },
      { name: 'andromeda', dest: 22, allowed: ['REPTILOID'] },
    ] as const;

    let sawNamed = false;
    let sawAnonymous = false;
    const tiersSeen = new Set<number>();

    for (const route of ROUTES) {
      const anonKindsSeen = new Set<string>();

      for (let playerTier = 1; playerTier <= 5; playerTier += 1) {
        for (let seed = 1; seed <= 500; seed += 1) {
          const state = readyState(seed);
          state.player.tier = playerTier as GameState['player']['tier'];
          const interceptor = selectEncounterInterceptor(
            state,
            1,
            route.dest,
            3,
            new SeededRng(seed),
          );

          tiersSeen.add(interceptor.tier);
          // Secondary sanity: the tier band contract still holds (kept, but no
          // longer the ONLY assertion). T-1603 owns canonical balance targets.
          expect(interceptor.tier).toBeGreaterThanOrEqual(Math.max(1, playerTier - 1));
          expect(interceptor.tier).toBeLessThanOrEqual(Math.min(5, playerTier + 1));

          if (interceptor.source === 'named') {
            sawNamed = true;
          } else {
            sawAnonymous = true;
            // Anonymous interceptors carry a route-restricted kind; named ones do
            // not, so kind-band correctness is asserted only on anonymous picks.
            expect(interceptor.kind).toBeDefined();
            anonKindsSeen.add(interceptor.kind as string);
            expect(route.allowed).toContain(interceptor.kind);
          }
        }
      }

      // Route-specific negative/positive guarantees the old test never made.
      if (route.name === 'core') {
        expect(anonKindsSeen.has('REPTILOID')).toBe(false);
        expect(anonKindsSeen.has('RIM_PIRATE')).toBe(false);
      }
      if (route.name === 'rim') {
        // T-1101 acceptance: Reptiloids are reachable in a seed sweep on a route
        // the player can actually travel (the rim frontier), not the sealed
        // Andromeda lane. This is the "Reptiloids reachable" criterion.
        expect(anonKindsSeen.has('REPTILOID')).toBe(true);
      }
      if (route.name === 'andromeda') {
        // Every anonymous interceptor on an Andromeda lane is a Reptiloid.
        expect([...anonKindsSeen]).toEqual(['REPTILOID']);
      }
    }

    // Non-degeneracy: matchmaking actually reaches BOTH pools (a bug that only
    // ever picked named — or only anonymous — would pass the old test).
    expect(sawNamed).toBe(true);
    expect(sawAnonymous).toBe(true);
    // Every tier 1-5 is reachable across the sweep.
    expect([...tiersSeen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('fires encounters within a stated frequency band per danger tier (1,000 seeds)', () => {
    // T-1103 acceptance: a 1,000-jump seeded frequency test lands within a stated
    // band per danger tier. generateEncounter is called directly (bypassing the
    // day.ts destination gate), so a sealed Andromeda dest is fine here. Each tier
    // is ASSERTED via calculateRouteDanger before the loop so the fixture cannot
    // silently drift off its intended tier. Bands are ±0.05 around the table value
    // (~3.2σ at n=1000). T-1603 owns canonical balance targets.
    //
    // The table rates are the VETERAN-game rates: generateEncounter damps the
    // chance 0.5x during TOUR_ONE (see TOUR_ONE_ENCOUNTER_MULTIPLIER in
    // travel.ts), so this test flips the fixture era to measure the undamped
    // table. The damping itself is asserted separately below.
    const cases = [
      { tier: 1, dest: 2, chance: 0.3, band: [0.25, 0.35], contractDest: undefined },
      { tier: 2, dest: 14, chance: 0.35, band: [0.3, 0.4], contractDest: undefined },
      { tier: 3, dest: 14, chance: 0.4, band: [0.35, 0.45], contractDest: 14 },
      { tier: 4, dest: 17, chance: 0.5, band: [0.45, 0.55], contractDest: undefined },
      { tier: 5, dest: 22, chance: 0.6, band: [0.55, 0.65], contractDest: undefined },
    ] as const;

    for (const testCase of cases) {
      const routeState = readyState();
      routeState.era = 'VETERAN'; // measure the undamped table rates
      if (testCase.contractDest !== undefined) {
        routeState.player.activeContract = {
          destination: testCase.contractDest,
          cargoType: 1,
          payment: 100,
          pods: 1,
        };
      }

      const { routeDangerLevel, routeDangerChance } = calculateRouteDanger(
        routeState,
        1,
        testCase.dest,
      );
      expect(routeDangerLevel).toBe(testCase.tier);
      expect(routeDangerChance).toBe(testCase.chance);

      let hits = 0;
      for (let seed = 1; seed <= 1000; seed += 1) {
        if (generateEncounter(routeState, 1, testCase.dest, 50, new SeededRng(seed))) {
          hits += 1;
        }
      }
      const rate = hits / 1000;
      expect(rate).toBeGreaterThanOrEqual(testCase.band[0]);
      expect(rate).toBeLessThanOrEqual(testCase.band[1]);
    }
  });

  it('Tour One damps the encounter chance 0.5x (era read by generateEncounter)', () => {
    // T-1103: PRD authors Tour One around "one full combat", so the veteran
    // table rate is halved while state.era === 'TOUR_ONE'. Same 1,000-seed
    // sweep as above on the tier-1 core route: veteran ~0.30, Tour One ~0.15.
    const measure = (era: 'TOUR_ONE' | 'VETERAN'): number => {
      const routeState = readyState();
      routeState.era = era;
      let hits = 0;
      for (let seed = 1; seed <= 1000; seed += 1) {
        if (generateEncounter(routeState, 1, 2, 50, new SeededRng(seed))) hits += 1;
      }
      return hits / 1000;
    };
    const tourOne = measure('TOUR_ONE');
    const veteran = measure('VETERAN');
    expect(tourOne).toBeGreaterThanOrEqual(0.1);
    expect(tourOne).toBeLessThanOrEqual(0.2);
    // Identical seeds, so the damped set is a strict subset: exactly the rolls
    // under half the table chance survive.
    expect(veteran).toBeGreaterThan(tourOne);
  });

  it('a failed pilot check still produces an encounter (trigger decoupled from success)', () => {
    // T-1103 acceptance: a botched jump is no longer perfectly safe. Route 1->2
    // has DC travelDc(dist)=10; a die of 1 with PILOT 0 always fails the check.
    // Find a seed whose encounter roll < 0.30 (tier-1 core chance) so the jump is
    // both failed AND intercepted, then assert all three signals of decoupling.
    const losingRoute = () => {
      const state = readyState();
      state.player.dawnHand = { dice: [1], spent: [false] };
      state.player.stats[Stat.PILOT] = 0;
      return state;
    };

    let chosenSeed = -1;
    for (let seed = 1; seed <= 10_000; seed += 1) {
      // Probe with a throwaway state: encounter roll < 0.30 means a hit on 1->2.
      if (generateEncounter(readyState(), 1, 2, 5, new SeededRng(seed))) {
        chosenSeed = seed;
        break;
      }
    }
    expect(chosenSeed).toBeGreaterThan(0);

    const { state: nextState, events } = resolveTravel(
      losingRoute(),
      { type: 'Travel', destinationId: 2, spendDie: 0 },
      new SeededRng(chosenSeed),
    );

    const statCheck = events.find((event) => event.type === 'StatCheck');
    expect(statCheck).toBeDefined();
    if (statCheck?.type !== 'StatCheck') throw new Error('unreachable');
    expect(statCheck.result.success).toBe(false);
    expect(nextState.encounter).toBeTruthy();
    expect(events.some((event) => event.type === 'EncounterStarted')).toBe(true);
  });

  it('round-trips an encounter through JSON mid-travel', () => {
    const state = readyState();
    state.encounter = fixtureEncounter();
    // T-1102: maxFuel is now hull-derived and deserialize re-syncs it, clamping
    // fuel to the ceiling. readyState's generous 1000 fuel exceeds the junker's
    // 300 cap; use a within-cap value so the state is a consistent (real-game)
    // round-trip subject. The encounter payload — the actual subject here — is
    // unaffected.
    state.player.ship.fuel = 250;

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

  it('a failed talk check refuses to bargain: no tribute, round escalates', () => {
    const state = readyState();
    state.player.dawnHand = { dice: [1], spent: [false] };
    state.player.stats[Stat.TRADE] = 0;
    state.player.credits = 5000;
    state.encounter = fixtureEncounter();

    const { state: nextState, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'talk', targetId: state.encounter.interceptor.id, spendDie: 0 },
      new SeededRng(1),
    );

    // Failure means no deal this round — tribute is NOT demanded (they refuse to
    // bargain), the encounter continues under enemy pressure, and the round
    // advances so the next tribute is dearer.
    expect(nextState.encounter?.round).toBe(2);
    expect(nextState.player.credits).toBe(5000);
    expect(events.some((event) => event.type === 'TributeDemanded')).toBe(false);
    expect(events.some((event) => event.type === 'TributePaid')).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: 'EnemyCounterAction' }));
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'EncounterRound',
        continues: true,
        success: false,
        stance: 'talk',
      }),
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

  it('successful talk pays the current round tribute and resolves as talked-down', () => {
    const state = readyState();
    // die 19 + TRADE 1 beats DC 11: a success that is NOT a natural 20, so the
    // interceptor accepts (rather than waives) this round's tribute.
    state.player.dawnHand = { dice: [19], spent: [false] };
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

  it('a natural 20 talk waives tribute and resolves as talked-down for free', () => {
    const state = readyState();
    // The hand die at the spent index is what the check reads: index 0 holds 20.
    state.player.dawnHand = { dice: [20, 19, 4, 3, 1], spent: [false, false, false, false, false] };
    state.player.credits = 1500;
    state.encounter = fixtureEncounter();

    const { state: nextState, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'talk', targetId: state.encounter.interceptor.id, spendDie: 0 },
      new SeededRng(1),
    );

    expect(nextState.encounter).toBeNull();
    expect(nextState.player.credits).toBe(1500);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'TributeDemanded', amount: 1000, waived: true }),
    );
    expect(events.some((event) => event.type === 'TributePaid')).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'EncounterResolved', resolution: 'talked-down' }),
    );
  });

  it('caps tribute escalation at the engine maximum (intentional foundation divergence)', () => {
    const state = readyState();
    // A non-nat-20 success (19 + TRADE 1 vs DC 11) at a late round pays the
    // capped tribute. The engine applies min(round*1000, 10000), so round 12 →
    // 10,000 — deliberately diverging from foundation's enemyDemandsTribute
    // (which would yield 12,000 at round 12); see packages/content/src/combat.ts.
    state.player.dawnHand = { dice: [19], spent: [false] };
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

  it('a Pacifist interceptor never refuses tribute (no flaw roll at all)', () => {
    const state = readyState();
    // die 19 + TRADE 1 clears DC 11: a plain success that should pay tribute.
    state.player.dawnHand = { dice: [19], spent: [false] };
    state.player.credits = 5000;
    state.encounter = fixtureEncounter({
      interceptor: {
        ...fixtureEncounter().interceptor,
        id: 'anon-pacifist-1',
        flaw: 'Pacifist',
        flawDc: 10,
      },
    });

    const { state: nextState, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'talk', targetId: state.encounter.interceptor.id, spendDie: 0 },
      new SeededRng(1),
    );

    // Pacifist has no refusesTribute flag: no FlawCheck is rolled, and tribute is
    // accepted normally.
    expect(events.some((event) => event.type === 'FlawCheck')).toBe(false);
    expect(nextState.encounter).toBeNull();
    expect(nextState.player.credits).toBe(4000);
    expect(events).toContainEqual(expect.objectContaining({ type: 'TributePaid', amount: 1000 }));
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'EncounterResolved', resolution: 'talked-down' }),
    );
  });

  it('property: a refuses-tribute flaw never takes tribute when the flaw fires (seed sweep)', () => {
    // Rattlesnake is Vengeful (refusesTribute). Across a seed sweep the flaw roll
    // varies, so both outcomes occur — but the invariant is absolute: whenever the
    // flaw fires (resisted:false) the interceptor takes NO tribute and combat
    // stays live; only when it resists its own flaw does the tribute change hands.
    const rattlesnake = selectRattlesnakeInterceptor();
    let firedCount = 0;
    let resistedCount = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const state = readyState();
      state.player.dawnHand = { dice: [19], spent: [false] }; // talk clears DC 11
      state.player.credits = 10_000;
      state.encounter = fixtureEncounter({ interceptor: rattlesnake });

      const { state: next, events } = resolveCombat(
        state,
        { type: 'Combat', stance: 'talk', targetId: rattlesnake.id, spendDie: 0 },
        new SeededRng(seed),
      );

      const flaw = events.find((event) => event.type === 'FlawCheck');
      expect(flaw).toBeDefined();
      if (flaw?.type !== 'FlawCheck') throw new Error('unreachable');
      const paidTribute = events.some((event) => event.type === 'TributePaid');

      if (flaw.resisted === false) {
        expect(paidTribute).toBe(false);
        expect(next.encounter).not.toBeNull();
        expect(next.player.credits).toBe(10_000);
        firedCount += 1;
      } else {
        expect(paidTribute).toBe(true);
        resistedCount += 1;
      }
    }
    // The roll is non-degenerate: both branches are actually exercised.
    expect(firedCount).toBeGreaterThan(0);
    expect(resistedCount).toBeGreaterThan(0);
  });

  it('property: tribute demand escalates monotonically and caps at 10,000 across rounds', () => {
    // Sweep the round counter; the demanded tribute must be exactly the content
    // schedule min(round*1000, 10000): non-decreasing, capped from round 10 on.
    let previous = 0;
    for (let round = 1; round <= 14; round += 1) {
      const state = readyState();
      state.player.dawnHand = { dice: [19], spent: [false] };
      state.player.credits = 50_000;
      state.encounter = fixtureEncounter({ round });

      const { events } = resolveCombat(
        state,
        { type: 'Combat', stance: 'talk', targetId: state.encounter.interceptor.id, spendDie: 0 },
        new SeededRng(1),
      );

      const demanded = events.find((event) => event.type === 'TributeDemanded');
      expect(demanded).toBeDefined();
      if (demanded?.type !== 'TributeDemanded') throw new Error('unreachable');
      expect(demanded.amount).toBe(Math.min(round * 1000, 10_000));
      expect(demanded.amount).toBeGreaterThanOrEqual(previous);
      previous = demanded.amount;
    }
    expect(previous).toBe(10_000);
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

    // Round one is a failed talk (die 1): no tribute is demanded, but enemy
    // pressure still lands and the round advances.
    expect(roundOne.events.some((event) => event.type === 'TributeDemanded')).toBe(false);
    expect(roundOne.state.encounter?.round).toBe(2);
    expect(roundOne.events).toEqual(
      expect.arrayContaining([
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

  it('defeats a tier-3 interceptor in three volleys, hull counting 2,1,0 for 150 fuel', () => {
    let state = readyState();
    state.player.dawnHand = { dice: [20, 20, 20], spent: [false, false, false] };
    state.player.stats[Stat.GUNS] = 20;
    state.encounter = fixtureEncounter({
      enemyHull: 3,
      interceptor: { ...fixtureEncounter().interceptor, tier: 3 },
    });
    const startFuel = state.player.ship.fuel;
    const hullRemaining: number[] = [];

    for (let volley = 0; volley < 3; volley += 1) {
      const result = resolveCombat(
        state,
        {
          type: 'Combat',
          stance: 'fight',
          targetId: state.encounter!.interceptor.id,
          spendDie: volley,
        },
        new SeededRng(1),
      );
      state = result.state;
      const combatEvent = result.events.find(
        (event) => event.type === 'CombatEvent' && event.stance === 'fight',
      );
      if (combatEvent && combatEvent.type === 'CombatEvent') {
        hullRemaining.push(combatEvent.enemyHullRemaining ?? -1);
      }
    }

    expect(hullRemaining).toEqual([2, 1, 0]);
    expect(startFuel - state.player.ship.fuel).toBe(150);
    expect(state.encounter).toBeNull();
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
    // The killing blow drove the hull to 0 (ComponentDamaged records it)...
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'ComponentDamaged', component: 'hull', newCondition: 0 }),
    );
    expect(events).toContainEqual(expect.objectContaining({ type: 'ShipLost' }));
    // ...and ShipLost immediately triggers T-108 succession, which resets the
    // ship to the junker (hull back to condition 9) and emits LegacySuccession.
    expect(nextState.player.ship).toEqual(starterShip());
    expect(nextState.player.legacy.successionCount).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'LegacySuccession' }));
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
