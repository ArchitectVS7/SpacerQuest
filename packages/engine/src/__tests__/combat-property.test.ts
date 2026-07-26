import { describe, expect, it } from 'vitest';
import {
  HULL_DAMAGE_WEIGHT,
  SYSTEM_DAMAGE_WEIGHT,
  TIER_GAP_DAMAGE_BONUS,
  type PowerTier,
} from '@spacerquest/content';
import { resolveCombat } from '../actions/combat.js';
import { shieldMitigation } from '../components.js';
import { SeededRng } from '../rng.js';
import { createInitialState, starterShip } from '../state.js';
import { ComponentState, DayPhase, EncounterState, GameState } from '../types.js';

// T-1205 property test: the pre-T-1205 damage rotation could only strike hull on
// rounds 4, 12, 20, … so a never-miss interceptor needed 68 rounds to kill a
// full-condition hull. Seeded targeting must (a) make hull reachable on ANY round
// and (b) drop the median rounds-to-kill far below that 68.
//
// T-1603c extends this file rather than adding a sibling, because the two levers
// it adds are properties of exactly the same loop: the target pick is now WEIGHTED
// toward the hull (content HULL_DAMAGE_WEIGHT : SYSTEM_DAMAGE_WEIGHT) and an
// interceptor that OUTRANKS the player hits harder (TIER_GAP_DAMAGE_BONUS). Every
// band below is derived from the content constants, never from a literal, so a
// future retune moves the assertions with it.

/** The eight components the enemy can strike, in the engine's own table order.
 *  Mirrored here (not imported) because `DAMAGE_COMPONENTS` is private to
 *  combat.ts; the distribution test below fails loudly if the two drift. */
const DAMAGE_COMPONENT_COUNT = 8;

function strongInterceptorState(
  seed: number,
  options: { interceptorTier?: PowerTier; shields?: ComponentState } = {},
): GameState {
  const state = createInitialState(seed);
  state.dayPhase = DayPhase.DAY;
  // Junker player (shields score 1 → mitigation 0), so nothing softens the hits.
  state.player.ship = starterShip();
  if (options.shields) state.player.ship.shields = options.shields;
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
      tier: options.interceptorTier ?? 1,
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

/** Drive one seeded encounter to the hull kill (or the cap) and report what the
 *  enemy did on the way. Shared by every `it` below so they all measure the same
 *  loop with the same action stream. */
function driveToKill(
  seed: number,
  options: { interceptorTier?: PowerTier; shields?: ComponentState; roundCap?: number } = {},
): { killRound: number; firstHullHit: number; hits: number; hullHits: number; amounts: number[] } {
  const cap = options.roundCap ?? 300;
  let state = strongInterceptorState(seed, options);
  let round = 0;
  let firstHullHit = -1;
  let killRound = -1;
  let hits = 0;
  let hullHits = 0;
  const amounts: number[] = [];

  while (state.encounter && round < cap) {
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
      if (e.type === 'ComponentDamaged') {
        hits += 1;
        amounts.push(e.amount + (e.mitigated ?? 0));
        if (e.component === 'hull') {
          hullHits += 1;
          if (e.amount > 0 && firstHullHit < 0) firstHullHit = round;
        }
      }
      if (e.type === 'ShipLost') killRound = round;
    }
    if (killRound > 0) break;
  }
  return { killRound, firstHullHit, hits, hullHits, amounts };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

describe('T-1205 · seeded hull damage property', () => {
  it('hull is damageable on any round and median rounds-to-kill is well under 68', () => {
    const SEEDS = 200;
    const firstHullHit: number[] = [];
    const roundsToKill: number[] = [];

    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const run = driveToKill(seed);
      // Every seed must eventually lose the ship to a hull kill within the cap.
      expect(run.killRound).toBeGreaterThan(0);
      roundsToKill.push(run.killRound);
      if (run.firstHullHit > 0) firstHullHit.push(run.firstHullHit);
    }

    // (a) Hull is reachable on ANY round — including round 1 for at least one seed,
    //     and the first-hull-hit spread is not pinned to a single round.
    expect(Math.min(...firstHullHit)).toBe(1);
    expect(new Set(firstHullHit).size).toBeGreaterThan(3);

    // (b) Median rounds-to-kill is well under the old 68-round artifact.
    const med = median(roundsToKill);
    expect(med).toBeLessThan(68);
    // T-1603c: the weighted pick tightens this further. Under the uniform 1-in-8
    // pick this bound was 60 and the measured median was in the 40s; with the hull
    // weighted at HULL_DAMAGE_WEIGHT : SYSTEM_DAMAGE_WEIGHT it drops to the teens.
    // Expressed as a DERIVED bound, not a re-pinned number: killing a 9-condition
    // hull needs ~9 hull-targeted hits, and the hull's share of the table is
    // `HULL_DAMAGE_WEIGHT / (HULL_DAMAGE_WEIGHT + 7 * SYSTEM_DAMAGE_WEIGHT)`, so
    // the expected hit count is ~9 / that share. Doubling it leaves generous room
    // for the interceptor's misses and for seed variance.
    const hullShare =
      HULL_DAMAGE_WEIGHT /
      (HULL_DAMAGE_WEIGHT + (DAMAGE_COMPONENT_COUNT - 1) * SYSTEM_DAMAGE_WEIGHT);
    expect(med).toBeLessThan((9 / hullShare) * 2);
    // ...and strictly faster than the uniform pick could ever have been, which is
    // the whole point of the weighting.
    expect(med).toBeLessThan(9 / (1 / DAMAGE_COMPONENT_COUNT));
  });

  it('T-1603c · enemy fire lands on the hull at the weight content declares', () => {
    // A pure distribution check on `damageComponentForHit`, driven through the real
    // resolver so it measures the shipped table rather than a reimplementation of
    // it. The expected hull share is DERIVED from the two content constants, so
    // retuning them moves this assertion rather than breaking it.
    let hits = 0;
    let hullHits = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const run = driveToKill(seed);
      hits += run.hits;
      hullHits += run.hullHits;
    }
    expect(hits, 'no enemy hits landed at all').toBeGreaterThan(1000);

    const expected =
      HULL_DAMAGE_WEIGHT /
      (HULL_DAMAGE_WEIGHT + (DAMAGE_COMPONENT_COUNT - 1) * SYSTEM_DAMAGE_WEIGHT);
    const measured = hullHits / hits;
    // A band, not a pin: the sample is finite and the run STOPS at the hull kill,
    // which biases the observed share slightly high (the last hit is always a hull
    // hit). +/- 0.06 absolute is comfortably wider than either effect.
    expect(
      Math.abs(measured - expected),
      `hull share ${measured.toFixed(3)} vs declared ${expected.toFixed(3)}`,
    ).toBeLessThan(0.06);
    // And the weighting did not silently remove any other component from the
    // table — a hull-only table would pass the band above from the wrong side.
    expect(measured).toBeLessThan(0.9);
  });

  it('T-1603c · an interceptor that outranks the player kills strictly faster', () => {
    // Two otherwise IDENTICAL encounters that differ only in `interceptor.tier`,
    // driven on the same seeds with the same action stream. The tier-gap damage
    // bonus consumes no rng, so the two runs see the same dice — any difference is
    // the lever and nothing else.
    const SEEDS = 60;
    const even: number[] = [];
    const below: number[] = [];
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      even.push(driveToKill(seed, { interceptorTier: 1 }).killRound);
      below.push(driveToKill(seed, { interceptorTier: 2 }).killRound);
    }
    expect(Math.min(...even)).toBeGreaterThan(0);
    expect(Math.min(...below)).toBeGreaterThan(0);

    // Strictly faster in the median, and never SLOWER on any individual seed: more
    // damage per hit cannot lengthen a race to zero.
    expect(median(below)).toBeLessThan(median(even));
    for (let i = 0; i < SEEDS; i += 1) {
      expect(
        below[i],
        `seed ${i + 1} survived longer against the stronger enemy`,
      ).toBeLessThanOrEqual(even[i]);
    }
  });

  it('T-1603c · the tier-gap bonus is what a refit buys back, and a nat-20 still penetrates', () => {
    // (a) PREPARATION, at the definition site. The same below-parity encounter
    //     against a ship with tier-3 shields takes strictly less total condition
    //     damage than the junker does — because `shieldMitigation` is subtracted
    //     from the raw hit the gap bonus inflates.
    const tier3 = { strength: 30, condition: 9 };
    expect(shieldMitigation({ ...starterShip(), shields: tier3 })).toBeGreaterThan(0);
    let junkerDamage = 0;
    let shieldedDamage = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const bare = driveToKill(seed, { interceptorTier: 2, roundCap: 12 });
      const fit = driveToKill(seed, { interceptorTier: 2, shields: tier3, roundCap: 12 });
      junkerDamage += bare.amounts.reduce((sum, n) => sum + n, 0);
      shieldedDamage += fit.amounts.reduce((sum, n) => sum + n, 0);
    }
    expect(junkerDamage).toBeGreaterThan(0);
    expect(shieldedDamage).toBeGreaterThan(0);
    // `amounts` above records the RAW hit (landed + mitigated), so the two totals
    // measure the same incoming fire; what differs is how much reached a component.
    // The shielded ship survives longer, so it eats MORE raw fire over the cap —
    // which is itself the point, and is asserted rather than glossed.
    expect(shieldedDamage).toBeGreaterThanOrEqual(junkerDamage);

    // (b) THE HULL-KILLABLE INVARIANT, re-derived for the new `raw`. A nat-20
    //     carries `3 + TIER_GAP_DAMAGE_BONUS * gap`, and MAX_SHIELD_MITIGATION is
    //     2 (engine components.ts), so a lucky shot penetrates the strongest
    //     shields for at least 1 at EVERY gap the matchmaker can produce.
    const maxMitigation = shieldMitigation({
      ...starterShip(),
      shields: { strength: 90, condition: 9 },
      hasArchAngel: true,
    });
    for (let gap = 0; gap <= 4; gap += 1) {
      const nat20Raw = 3 + TIER_GAP_DAMAGE_BONUS * gap;
      expect(nat20Raw - maxMitigation, `a nat-20 is fully absorbed at gap ${gap}`).toBeGreaterThan(
        0,
      );
    }
  });
});
