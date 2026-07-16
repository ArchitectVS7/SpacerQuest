import { describe, expect, it } from 'vitest';
import { resolveCombat } from '../actions/combat.js';
import { SeededRng } from '../rng.js';
import { createInitialState, starterShip } from '../state.js';
import { DayPhase, EncounterState, GameState } from '../types.js';

// T-1205 property test: the pre-T-1205 damage rotation could only strike hull on
// rounds 4, 12, 20, … so a never-miss interceptor needed 68 rounds to kill a
// full-condition hull. Seeded targeting must (a) make hull reachable on ANY round
// and (b) drop the median rounds-to-kill far below that 68.

function strongInterceptorState(seed: number): GameState {
  const state = createInitialState(seed);
  state.dayPhase = DayPhase.DAY;
  // Junker player (shields score 1 → mitigation 0), so nothing softens the hits.
  state.player.ship = starterShip();
  state.player.stats.TRADE = 1; // talk (die 2) reliably fails vs DC 11
  const encounter: EncounterState = {
    id: 'enc-prop',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
    interceptor: {
      id: 'anon-strong',
      source: 'anonymous',
      name: 'Grinder',
      shipName: 'GX',
      shipClass: 'Maligna Bat',
      homeSystem: 'Pollux-7',
      kind: 'PIRATE',
      rosterIndex: 1,
      // GUNS 20 → pressure hits every round but a nat-1.
      stats: { PILOT: 1, GUNS: 20, TRADE: 0, GRIT: 0, GUILE: 1 },
      tier: 1,
    },
    routeDangerLevel: 1,
    routeDangerChance: 0.3,
    encounterRoll: 0.01,
    round: 1,
    enemyHull: 999999, // never resolves by enemy death; talk-fail drives pressure
  };
  state.encounter = encounter;
  return state;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

describe('T-1205 · seeded hull damage property', () => {
  it('hull is damageable on any round and median rounds-to-kill is well under 68', () => {
    const SEEDS = 200;
    const ROUND_CAP = 300;
    const firstHullHit: number[] = [];
    const roundsToKill: number[] = [];

    for (let seed = 1; seed <= SEEDS; seed += 1) {
      let state = strongInterceptorState(seed);
      let round = 0;
      let hullHitRound = -1;
      let killRound = -1;

      while (state.encounter && round < ROUND_CAP) {
        round += 1;
        state.player.dawnHand = { dice: [2], spent: [false] }; // die 2 → talk fails
        const rng = new SeededRng(seed * 100003 + round);
        const result = resolveCombat(
          state,
          { type: 'Combat', stance: 'talk', targetId: 'anon-strong', spendDie: 0 },
          rng,
        );
        state = result.state;
        for (const e of result.events) {
          if (
            e.type === 'ComponentDamaged' &&
            e.component === 'hull' &&
            e.amount > 0 &&
            hullHitRound < 0
          ) {
            hullHitRound = round;
          }
          if (e.type === 'ShipLost') killRound = round;
        }
        if (killRound > 0) break;
      }

      // Every seed must eventually lose the ship to a hull kill within the cap.
      expect(killRound).toBeGreaterThan(0);
      roundsToKill.push(killRound);
      if (hullHitRound > 0) firstHullHit.push(hullHitRound);
    }

    // (a) Hull is reachable on ANY round — including round 1 for at least one seed,
    //     and the first-hull-hit spread is not pinned to a single round.
    expect(Math.min(...firstHullHit)).toBe(1);
    expect(new Set(firstHullHit).size).toBeGreaterThan(3);

    // (b) Median rounds-to-kill is well under the old 68-round artifact.
    const med = median(roundsToKill);
    expect(med).toBeLessThan(68);
    // Comfortably under — the uniform 1/8 targeting kills far faster than the old
    // rotation ever could.
    expect(med).toBeLessThan(60);
  });
});
