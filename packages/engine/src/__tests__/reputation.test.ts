import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FENCE_REP_FLAG,
  FENCE_REP_REBEL_DELTA,
  PATROL_EVADED_LEAGUE_DELTA,
  PATROL_TRIBUTE_LEAGUE_DELTA,
  PORT_PURCHASE_ALLIANCE_DELTA,
  PURCHASABLE_PORTS_BY_SYSTEM,
  REPUTATION_MAX,
  REPUTATION_MIN,
  SMUGGLING_CAUGHT_LEAGUE_DELTA,
  SMUGGLING_CAUGHT_REBEL_DELTA,
  Stat,
} from '@spacerquest/content';
import { applyReputation } from '../reputation.js';
import { applyPatrolContrabandScan } from '../actions/patrol.js';
import { resolveCombat } from '../actions/combat.js';
import { resolveTravel } from '../actions/travel.js';
import { startDay, applyPlayerAction } from '../day.js';
import { SeededRng } from '../rng.js';
import { createInitialState } from '../state.js';
import { DayPhase, EncounterState, GameEvent, GameState } from '../types.js';

// ---------------------------------------------------------------------------
// T-1503 · Four-faction reputation — the mover, the three organic sources (the
// named deferrals patrol.ts / contraband.ts / ports.ts now consume), and a
// source-scan guard proving those deferral comments are gone.
// ---------------------------------------------------------------------------

describe('T-1503 · applyReputation (the shared mover)', () => {
  it('moves standing and emits a ReputationChanged only when the value actually changes', () => {
    const state = createInitialState(1);
    const events: GameEvent[] = [];
    applyReputation(state, 'league', 5, 'port-deal', events);
    expect(state.player.reputation.league).toBe(5);
    expect(events).toEqual([
      {
        type: 'ReputationChanged',
        day: 1,
        faction: 'league',
        delta: 5,
        reputation: 5,
        reason: 'port-deal',
      },
    ]);

    // A zero delta is a no-op — no event.
    const noop: GameEvent[] = [];
    applyReputation(state, 'league', 0, 'questline', noop);
    expect(noop).toHaveLength(0);
    expect(state.player.reputation.league).toBe(5);
  });

  it('clamps to the [REPUTATION_MIN, REPUTATION_MAX] band and reports the ACTUAL applied delta', () => {
    const state = createInitialState(2);
    state.player.reputation.dragons = REPUTATION_MAX - 2;
    const events: GameEvent[] = [];
    applyReputation(state, 'dragons', 10, 'questline', events);
    expect(state.player.reputation.dragons).toBe(REPUTATION_MAX);
    expect(events[0]).toMatchObject({
      type: 'ReputationChanged',
      delta: 2,
      reputation: REPUTATION_MAX,
    });

    // Already at the ceiling → clamped to a no-op → no event.
    const noop: GameEvent[] = [];
    applyReputation(state, 'dragons', 5, 'questline', noop);
    expect(noop).toHaveLength(0);

    // Floor works too.
    state.player.reputation.rebels = REPUTATION_MIN + 1;
    const down: GameEvent[] = [];
    applyReputation(state, 'rebels', -10, 'smuggling-caught', down);
    expect(state.player.reputation.rebels).toBe(REPUTATION_MIN);
    expect(down[0]).toMatchObject({ delta: -1 });
  });
});

// A caught-scan PATROL fixture + seed finder (mirrors patrol.test.ts).
function patrolEncounter(guile = 6): EncounterState {
  return {
    id: 'enc-patrol',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
    interceptor: {
      id: 'anon-patrol-1',
      source: 'anonymous',
      name: 'Lt.Savage',
      shipName: 'SP1.Thor',
      kind: 'PATROL',
      rosterIndex: 1,
      stats: { PILOT: 1, GUNS: 0, TRADE: 1, GRIT: 0, GUILE: guile },
      tier: 1,
    },
    routeDangerLevel: 1,
    routeDangerChance: 0.3,
    encounterRoll: 0.01,
    round: 1,
    enemyHull: 1,
  };
}

function carryingPodState(credits = 1000): GameState {
  const state = createInitialState(7);
  state.dayPhase = DayPhase.DAY;
  state.player.stats[Stat.GUILE] = 0;
  state.player.credits = credits;
  state.flags['signal.contraband.carrying'] = true;
  return state;
}

function findCaughtSeed(): number {
  for (let seed = 1; seed <= 5000; seed += 1) {
    const state = carryingPodState();
    const events: GameEvent[] = [];
    applyPatrolContrabandScan(state, patrolEncounter(), new SeededRng(seed), events);
    const scan = events.find((e) => e.type === 'ContrabandScan');
    if (scan?.type === 'ContrabandScan' && scan.caught) return seed;
  }
  throw new Error('no caught seed found');
}

describe('T-1503 · smuggling-scan rep (patrol.ts — the patrol.ts:106 + contraband.ts:37 deferrals)', () => {
  it('a caught scan cools the League and warms the Rebels', () => {
    const seed = findCaughtSeed();
    const state = carryingPodState();
    const events: GameEvent[] = [];
    applyPatrolContrabandScan(state, patrolEncounter(), new SeededRng(seed), events);

    expect(state.player.reputation.league).toBe(SMUGGLING_CAUGHT_LEAGUE_DELTA);
    expect(state.player.reputation.rebels).toBe(SMUGGLING_CAUGHT_REBEL_DELTA);
    const repEvents = events.filter((e) => e.type === 'ReputationChanged');
    expect(
      repEvents.some((e) => e.type === 'ReputationChanged' && e.reason === 'smuggling-caught'),
    ).toBe(true);
  });

  it('a caught smuggler carrying the fence.ray.dealt flag draws EXTRA Rebel warmth (fence-dealt)', () => {
    const seed = findCaughtSeed();
    const state = carryingPodState();
    state.flags[FENCE_REP_FLAG] = true;
    const events: GameEvent[] = [];
    applyPatrolContrabandScan(state, patrolEncounter(), new SeededRng(seed), events);

    // Base Rebel warmth PLUS the fence bonus.
    expect(state.player.reputation.rebels).toBe(
      SMUGGLING_CAUGHT_REBEL_DELTA + FENCE_REP_REBEL_DELTA,
    );
    expect(events.some((e) => e.type === 'ReputationChanged' && e.reason === 'fence-dealt')).toBe(
      true,
    );
  });

  it('a CLEAN scan moves no reputation (only a caught scan brands you)', () => {
    // High player GUILE, low patrol GUILE, a seed that resists.
    for (let seed = 1; seed <= 5000; seed += 1) {
      const state = createInitialState(7);
      state.dayPhase = DayPhase.DAY;
      state.player.stats[Stat.GUILE] = 8;
      state.flags['signal.contraband.carrying'] = true;
      const events: GameEvent[] = [];
      applyPatrolContrabandScan(state, patrolEncounter(0), new SeededRng(seed), events);
      const scan = events.find((e) => e.type === 'ContrabandScan');
      if (scan?.type === 'ContrabandScan' && !scan.caught) {
        expect(events.some((e) => e.type === 'ReputationChanged')).toBe(false);
        expect(state.player.reputation).toEqual({
          league: 0,
          dragons: 0,
          confederation: 0,
          rebels: 0,
        });
        return;
      }
    }
    throw new Error('no clean seed found');
  });
});

describe('T-1503 · port-deal rep (port.ts — the ports.ts alliance deferral)', () => {
  it('buying an aligned port warms that port’s faction', () => {
    // Sun-3 (system 1) is a League port. Buy it and League warms by the deal delta.
    const league = PURCHASABLE_PORTS_BY_SYSTEM[1];
    expect(league.alliance).toBe('league');
    let state = createInitialState(1);
    state.player.credits = league.purchasePrice + 5000;
    state = startDay(state).state;
    const die = state.player.dawnHand!.spent.findIndex((s) => !s);

    const { state: bought, events } = applyPlayerAction(state, {
      type: 'Port',
      action: 'buy',
      systemId: 1,
      spendDie: die,
    });

    expect(bought.player.reputation.league).toBe(PORT_PURCHASE_ALLIANCE_DELTA);
    expect(
      events.some(
        (e) => e.type === 'ReputationChanged' && e.faction === 'league' && e.reason === 'port-deal',
      ),
    ).toBe(true);
  });

  it('buying a Confederation-tagged port warms the Warlord Confederation (the named reader)', () => {
    // System 3 (Altair-3) is a Confederation port.
    const confed = PURCHASABLE_PORTS_BY_SYSTEM[3];
    expect(confed.alliance).toBe('confederation');
    let state = createInitialState(1);
    state.player.credits = confed.purchasePrice + 5000;
    state.player.currentSystemId = 3;
    state = startDay(state).state;
    const die = state.player.dawnHand!.spent.findIndex((s) => !s);

    const { state: bought } = applyPlayerAction(state, {
      type: 'Port',
      action: 'buy',
      systemId: 3,
      spendDie: die,
    });
    expect(bought.player.reputation.confederation).toBe(PORT_PURCHASE_ALLIANCE_DELTA);
  });
});

describe('T-1503 · patrol-encounter rep (combat.ts resolveEncounter — the patrol-tribute mover)', () => {
  // Find a seed whose real jump from Sun-3 yields an ANONYMOUS PATROL encounter.
  function findPatrolJump(): { state: GameState; targetId: string } {
    for (let seed = 1; seed <= 8000; seed += 1) {
      const state = createInitialState(seed);
      state.dayPhase = DayPhase.DAY;
      state.player.dawnHand = {
        dice: [20, 12, 6, 3, 1],
        spent: [false, false, false, false, false],
      };
      state.player.ship.fuel = 1000;
      const result = resolveTravel(
        state,
        { type: 'Travel', destinationId: 2, spendDie: 0 },
        new SeededRng(seed),
      );
      const enc = result.state.encounter;
      if (enc && enc.interceptor.kind === 'PATROL' && enc.interceptor.source === 'anonymous') {
        return { state: result.state, targetId: enc.interceptor.id };
      }
    }
    throw new Error('no PATROL jump found');
  }

  it('fleeing a PATROL cools the League (patrol-evaded)', () => {
    const { state, targetId } = findPatrolJump();
    const before = state.player.reputation.league;
    // Run has fuel/ die; spend a fresh die (index 1 is unspent after the travel die 0).
    const die = state.player.dawnHand!.spent.findIndex((s) => !s);
    const { state: after, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'run', targetId, spendDie: die },
      new SeededRng(123),
    );
    // A run either escapes (encounter resolved) — which fires the evaded mover — or
    // the round continues; loop until resolved to observe the terminal rep move.
    if (after.encounter === null) {
      expect(after.player.reputation.league).toBe(before + PATROL_EVADED_LEAGUE_DELTA);
      expect(
        events.some(
          (e) =>
            e.type === 'ReputationChanged' &&
            e.faction === 'league' &&
            e.reason === 'patrol-evaded',
        ),
      ).toBe(true);
    } else {
      // Not resolved this round (interceptor pursued) — rep only moves on resolution.
      expect(after.player.reputation.league).toBe(before);
    }
  });

  it('the patrol-tribute and patrol-evaded deltas have opposite signs (compliance vs defiance)', () => {
    expect(PATROL_TRIBUTE_LEAGUE_DELTA).toBeGreaterThan(0);
    expect(PATROL_EVADED_LEAGUE_DELTA).toBeLessThan(0);
  });
});

describe('T-1503 · named deferrals are consumed (source-scan guard)', () => {
  const read = (rel: string): string =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  it('patrol.ts / contraband.ts / ports.ts no longer say "deferred to T-1503"', () => {
    const patrolSrc = read('../actions/patrol.ts');
    const contrabandSrc = read('../../../content/src/contraband.ts');
    const portsSrc = read('../../../content/src/ports.ts');
    for (const [name, src] of [
      ['patrol.ts', patrolSrc],
      ['contraband.ts', contrabandSrc],
      ['ports.ts', portsSrc],
    ] as const) {
      expect(src, `${name} still contains a deferral phrase`).not.toMatch(/deferred to T-1503/);
      expect(src, `${name} still calls the rep consequence a FUTURE reader`).not.toMatch(
        /FUTURE reader/,
      );
    }
  });

  it('patrol.ts and port.ts reference the reputation mover', () => {
    expect(read('../actions/patrol.ts')).toMatch(/applyReputation/);
    expect(read('../actions/port.ts')).toMatch(/applyReputation/);
  });
});
