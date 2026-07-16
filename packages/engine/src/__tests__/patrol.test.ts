import { describe, expect, it } from 'vitest';
import {
  Stat,
  CONTRABAND_FINE,
  CONTRABAND_FENCE_REP_SCAN_PENALTY,
  CONTRABAND_POD_FENCE_PRICE,
  FENCE_REP_FLAG,
} from '@spacerquest/content';
import { applyPatrolContrabandScan } from '../actions/patrol.js';
import { resolveTravel } from '../actions/travel.js';
import { refreshAvailableStorylets, resolveStoryletChoice } from '../storylets.js';
import { SeededRng } from '../rng.js';
import { createInitialState } from '../state.js';
import { DayPhase, EncounterState, GameEvent, GameState } from '../types.js';

// A PATROL interceptor fixture with a tunable GUILE (the scanner's stat). Named
// vs anonymous is set per-test; anonymous is the common case.
function patrolEncounter(
  overrides: {
    guile?: number;
    source?: 'named' | 'anonymous';
    id?: string;
    name?: string;
  } = {},
): EncounterState {
  return {
    id: 'enc-patrol',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
    interceptor: {
      id: overrides.id ?? 'anon-patrol-1',
      source: overrides.source ?? 'anonymous',
      name: overrides.name ?? 'Lt.Savage',
      shipName: 'SP1.Thor',
      shipClass: 'SLOOP',
      homeSystem: 'Procyon-5',
      kind: 'PATROL',
      rosterIndex: 1,
      stats: { PILOT: 1, GUNS: 0, TRADE: 1, GRIT: 0, GUILE: overrides.guile ?? 2 },
      tier: 1,
    },
    routeDangerLevel: 1,
    routeDangerChance: 0.3,
    encounterRoll: 0.01,
    round: 1,
    enemyHull: 1,
  };
}

// A PIRATE interceptor fixture — used to prove non-patrol encounters never scan.
function pirateEncounter(): EncounterState {
  const enc = patrolEncounter();
  enc.interceptor.kind = 'PIRATE';
  enc.interceptor.id = 'anon-pirate-1';
  return enc;
}

// A player state carrying illicit cargo via the derelict POD flag.
function carryingPodState(guile = 0, credits = 1000): GameState {
  const state = createInitialState(7);
  state.dayPhase = DayPhase.DAY;
  state.player.stats[Stat.GUILE] = guile;
  state.player.credits = credits;
  state.flags['signal.contraband.carrying'] = true;
  return state;
}

// A player state carrying illicit cargo via a type-10 Contraband CONTRACT.
function carryingContractState(guile = 0, credits = 1000): GameState {
  const state = createInitialState(7);
  state.dayPhase = DayPhase.DAY;
  state.player.stats[Stat.GUILE] = guile;
  state.player.credits = credits;
  state.player.activeContract = { destination: 27, cargoType: 10, payment: 5000, pods: 1 };
  return state;
}

// Runs the isolated scan and returns the events it emitted.
function runScan(state: GameState, encounter: EncounterState, seed: number): GameEvent[] {
  const events: GameEvent[] = [];
  applyPatrolContrabandScan(state, encounter, new SeededRng(seed), events);
  return events;
}

// Find a seed whose single d20 produces a caught / not-caught scan for the
// given patrol/player GUILE, without mutating a real state (fresh clone each try).
function findScanSeed(want: 'caught' | 'clean', patrolGuile: number, playerGuile: number): number {
  for (let seed = 1; seed <= 5000; seed += 1) {
    const state = carryingPodState(playerGuile);
    const events = runScan(state, patrolEncounter({ guile: patrolGuile }), seed);
    const scan = events.find((e) => e.type === 'ContrabandScan');
    if (scan && scan.type === 'ContrabandScan') {
      if (want === 'caught' && scan.caught) return seed;
      if (want === 'clean' && !scan.caught) return seed;
    }
  }
  throw new Error(
    `No ${want} scan seed found for patrolGuile=${patrolGuile} playerGuile=${playerGuile}`,
  );
}

describe('T-1305 · patrol contraband GUILE scan', () => {
  it('carrying through a PATROL encounter rolls a GUILE scan StatCheck (npc-patrol)', () => {
    // Acceptance #1: the scan fires and emits the shaped StatCheck + ContrabandScan.
    const events = runScan(carryingPodState(), patrolEncounter(), 1);

    const statCheck = events.find((e) => e.type === 'StatCheck');
    expect(statCheck, 'a StatCheck must be emitted').toBeDefined();
    if (statCheck?.type === 'StatCheck') {
      expect(statCheck.stat).toBe(Stat.GUILE);
      expect(statCheck.actionContext).toBe('npc-patrol');
      expect(statCheck.actor).toBe('Lt.Savage');
    }
    expect(events.some((e) => e.type === 'ContrabandScan')).toBe(true);
  });

  it('caught path confiscates the pod, fines the player, and emits ContrabandConfiscated', () => {
    // Acceptance #2: force a caught seed (high patrol GUILE, player GUILE 0).
    const seed = findScanSeed('caught', 6, 0);
    const state = carryingPodState(0, 1000);
    const events = runScan(state, patrolEncounter({ guile: 6 }), seed);

    // Pod flag cleared (confiscated).
    expect(state.flags['signal.contraband.carrying']).toBeUndefined();
    // Fine deducted.
    expect(state.player.credits).toBe(1000 - CONTRABAND_FINE);

    const conf = events.find((e) => e.type === 'ContrabandConfiscated');
    expect(conf, 'ContrabandConfiscated must be emitted on the caught path').toBeDefined();
    if (conf?.type === 'ContrabandConfiscated') {
      expect(conf.fine).toBe(CONTRABAND_FINE);
      expect(conf.confiscatedPod).toBe(true);
      expect(conf.confiscatedContract).toBe(false);
      expect(conf.creditsRemaining).toBe(1000 - CONTRABAND_FINE);
    }
  });

  it('caught path voids a type-10 Contraband contract (no delivery payment)', () => {
    const seed = findScanSeed('caught', 6, 0);
    const state = carryingContractState(0, 1000);
    const events = runScan(state, patrolEncounter({ guile: 6 }), seed);

    expect(state.player.activeContract).toBeNull();
    expect(state.player.credits).toBe(1000 - CONTRABAND_FINE);
    const conf = events.find((e) => e.type === 'ContrabandConfiscated');
    if (conf?.type === 'ContrabandConfiscated') {
      expect(conf.confiscatedContract).toBe(true);
      expect(conf.confiscatedPod).toBe(false);
    }
  });

  it('the fine clamps at 0 credits — a scan never drives the balance negative', () => {
    const seed = findScanSeed('caught', 6, 0);
    const state = carryingPodState(0, 120); // less than CONTRABAND_FINE
    const events = runScan(state, patrolEncounter({ guile: 6 }), seed);
    expect(state.player.credits).toBe(0);
    const conf = events.find((e) => e.type === 'ContrabandConfiscated');
    if (conf?.type === 'ContrabandConfiscated') {
      expect(conf.fine).toBe(120);
    }
  });

  it('clean scan leaves cargo and credits intact', () => {
    const seed = findScanSeed('clean', 0, 8); // high player GUILE resists
    const state = carryingPodState(8, 1000);
    const events = runScan(state, patrolEncounter({ guile: 0 }), seed);

    expect(state.flags['signal.contraband.carrying']).toBe(true);
    expect(state.player.credits).toBe(1000);
    expect(events.some((e) => e.type === 'ContrabandConfiscated')).toBe(false);
    // But a scan STILL happened (the StatCheck + ContrabandScan fire either way).
    expect(events.some((e) => e.type === 'ContrabandScan')).toBe(true);
  });

  it('a NAMED patrol that catches you nurses a disposition grudge', () => {
    const seed = findScanSeed('caught', 6, 0);
    const state = carryingPodState(0, 1000);
    // Use a real named NPC id so applyDisposition finds the cast member.
    const named = state.npcs[0];
    const events = runScan(
      state,
      patrolEncounter({ guile: 6, source: 'named', id: named.id, name: named.name }),
      seed,
    );
    expect(named.disposition).toBeLessThan(0);
    expect(events.some((e) => e.type === 'DispositionChanged')).toBe(true);
  });

  it('a non-patrol (PIRATE) encounter never scans and consumes no rng', () => {
    // Acceptance guard: no scan events, and the d20 is never drawn (rng untouched).
    const state = carryingPodState();
    const rngA = new SeededRng(42);
    const events: GameEvent[] = [];
    applyPatrolContrabandScan(state, pirateEncounter(), rngA, events);
    expect(events).toHaveLength(0);
    // A fresh rng at the same seed must be in the same position — prove no draw
    // happened by comparing the NEXT value each produces.
    const rngB = new SeededRng(42);
    expect(rngA.d20()).toBe(rngB.d20());
  });

  it('a clean hold (not carrying) never scans and consumes no rng', () => {
    const state = createInitialState(7);
    state.dayPhase = DayPhase.DAY;
    const rngA = new SeededRng(99);
    const events: GameEvent[] = [];
    applyPatrolContrabandScan(state, patrolEncounter(), rngA, events);
    expect(events).toHaveLength(0);
    const rngB = new SeededRng(99);
    expect(rngA.d20()).toBe(rngB.d20());
  });
});

describe('T-1305 · Smuggler Ray fence sale (headless storylet flow)', () => {
  function offerAndResolve(
    state: GameState,
    storyletId: string,
    choiceId: string,
  ): { state: GameState; events: GameEvent[] } {
    const refreshed = refreshAvailableStorylets(state).state;
    expect(
      refreshed.storylets.available.some((o) => o.storyletId === storyletId),
      `${storyletId} should be offered`,
    ).toBe(true);
    return resolveStoryletChoice(
      refreshed,
      { type: 'Storylet', storyletId, choiceId },
      new SeededRng(1),
    );
  }

  it('fencing the sealed pod pays, clears the carrying flag, and sets fence.ray.dealt', () => {
    // Acceptance #3a: a fence sale pays.
    let state = createInitialState(7);
    state.dayPhase = DayPhase.DAY;
    state.player.credits = 1000;
    state.flags['signal.contraband.carrying'] = true;

    const result = offerAndResolve(state, 'fence.ray.sealed-pod', 'sell-the-pod');
    state = result.state;

    expect(state.player.credits).toBe(1000 + CONTRABAND_POD_FENCE_PRICE);
    expect(state.flags['signal.contraband.carrying']).toBeUndefined();
    expect(state.flags[FENCE_REP_FLAG]).toBe(true);
  });

  it('fencing a Contraband contract pays and clears the active contract', () => {
    let state = createInitialState(7);
    state.dayPhase = DayPhase.DAY;
    state.player.credits = 1000;
    state.player.activeContract = { destination: 27, cargoType: 10, payment: 5000, pods: 1 };

    const result = offerAndResolve(state, 'fence.ray.contraband-cargo', 'fence-the-load');
    state = result.state;

    expect(state.player.credits).toBeGreaterThan(1000);
    expect(state.player.activeContract).toBeNull();
    expect(state.flags[FENCE_REP_FLAG]).toBe(true);
  });
});

describe('T-1305 · fence-rep A/B (the flag measurably changes later patrol behavior)', () => {
  it('a fence-rep player is caught strictly more often across identical seeds', () => {
    // Acceptance #3b: hold player GUILE and patrol GUILE fixed; the only
    // difference is the fence.ray.dealt flag. It must raise the caught count.
    const N = 300;
    const playerGuile = 4;
    const patrolGuile = 2;

    let caughtWithout = 0;
    let caughtWith = 0;
    for (let seed = 1; seed <= N; seed += 1) {
      const clean = carryingPodState(playerGuile);
      const cleanEvents = runScan(clean, patrolEncounter({ guile: patrolGuile }), seed);
      const cleanScan = cleanEvents.find((e) => e.type === 'ContrabandScan');
      if (cleanScan?.type === 'ContrabandScan' && cleanScan.caught) caughtWithout += 1;

      const flagged = carryingPodState(playerGuile);
      flagged.flags[FENCE_REP_FLAG] = true;
      const flaggedEvents = runScan(flagged, patrolEncounter({ guile: patrolGuile }), seed);
      const flaggedScan = flaggedEvents.find((e) => e.type === 'ContrabandScan');
      if (flaggedScan?.type === 'ContrabandScan' && flaggedScan.caught) caughtWith += 1;
    }

    expect(caughtWith).toBeGreaterThan(caughtWithout);
    // Sanity: the penalty is exactly the concealment drop we tuned.
    expect(CONTRABAND_FENCE_REP_SCAN_PENALTY).toBeGreaterThan(0);
  });
});

describe('T-1305 · "take the pod" is no longer strictly dominant (100-seed EV)', () => {
  it('carrying the +300cr pod through patrols realizes nonzero confiscation risk', () => {
    // Acceptance #4: over 100 distinct seeds the scan catches the player at
    // least once — the pod grab now carries real downside.
    const seeds = 100;
    let caught = 0;
    let confiscations = 0;
    for (let seed = 1; seed <= seeds; seed += 1) {
      const state = carryingPodState(0, 1000); // took the +300 pod, GUILE 0
      const events = runScan(state, patrolEncounter({ guile: 2 }), seed);
      const scan = events.find((e) => e.type === 'ContrabandScan');
      if (scan?.type === 'ContrabandScan' && scan.caught) caught += 1;
      if (events.some((e) => e.type === 'ContrabandConfiscated')) {
        confiscations += 1;
        // A caught seed must actually have confiscated + fined.
        expect(state.player.credits).toBe(1000 - CONTRABAND_FINE);
        expect(state.flags['signal.contraband.carrying']).toBeUndefined();
      }
    }
    expect(caught).toBeGreaterThan(0);
    expect(confiscations).toBe(caught);
    // The realized fine can exceed the +300 pod reward, so "take it" is not free.
    expect(CONTRABAND_FINE).toBeGreaterThan(300);
  });
});

describe('T-1305 · end-to-end travel wiring', () => {
  it('a PATROL interdiction while carrying emits the scan through resolveTravel', () => {
    // Prove the travel.ts wiring, not just the isolated function: find a seed
    // whose real jump yields a PATROL encounter while carrying, then assert the
    // ContrabandScan event surfaced end-to-end.
    for (let seed = 1; seed <= 8000; seed += 1) {
      const state = createInitialState(seed);
      state.dayPhase = DayPhase.DAY;
      state.player.dawnHand = {
        dice: [20, 12, 6, 3, 1],
        spent: [false, false, false, false, false],
      };
      state.player.ship.fuel = 1000;
      state.flags['signal.contraband.carrying'] = true;
      // Core route from Sun-3 (1) to a neighboring core system.
      const result = resolveTravel(
        state,
        { type: 'Travel', destinationId: 2, spendDie: 0 },
        new SeededRng(seed),
      );
      const enc = result.state.encounter;
      if (enc && enc.interceptor.kind === 'PATROL') {
        expect(
          result.events.some((e) => e.type === 'ContrabandScan'),
          `seed ${seed}: PATROL interdiction while carrying must emit a ContrabandScan`,
        ).toBe(true);
        return;
      }
    }
    throw new Error('No PATROL-while-carrying interdiction found in 8000 seeds');
  });
});
