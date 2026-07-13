import { describe, expect, it } from 'vitest';
import {
  NPC_PROFILES,
  type PowerTier,
  type RenownRankId,
  type RouteDangerLevel,
} from '@spacerquest/content';
import { computePlayerTier, syncPlayerTier } from '../tier.js';
import { selectEncounterInterceptor } from '../actions/travel.js';
import { applySuccession } from '../legacy.js';
import { createInitialState, deserializeState, serializeState, starterShip } from '../state.js';
import { SeededRng } from '../rng.js';
import type { EarnedDeedState, GameState, ShipState } from '../types.js';

// A ship with a maxed combat fit — the shipyard's buy-component-tier sets a
// component's strength to tier*10 (tier 1..9), so tier 9 → strength 90.
function maxedCombatShip(): ShipState {
  const ship = starterShip();
  ship.weapons.strength = 90;
  return ship;
}

/** Elevate a fresh state's registry to the given rank by populating `earned`
 *  with that rank's worth of deed records — the SAME machinery deserialize uses
 *  (rank is a pure function of earned.length). Nothing here touches player.tier. */
function stateAtRank(rank: RenownRankId, earnedCount: number): GameState {
  const state = createInitialState(7);
  const earned: EarnedDeedState[] = [];
  for (let i = 0; i < earnedCount; i += 1) {
    earned.push({
      id: `synthetic-deed-${i}`,
      title: `Synthetic Deed ${i}`,
      citation: 'test',
      day: 1,
      eventIndex: i,
    });
  }
  state.player.registry.earned = earned;
  state.player.registry.renownRank = rank;
  // Derive tier from the elevated rank exactly as the engine's day loop does —
  // via the sync function, never a hand-assigned value.
  syncPlayerTier(state);
  return state;
}

describe('T-1203 computePlayerTier formula', () => {
  it('a fresh Lieutenant in the junker resolves to tier 1 (no starting-band churn)', () => {
    expect(computePlayerTier('LIEUTENANT', starterShip())).toBe(1);
    expect(createInitialState(1).player.tier).toBe(1);
  });

  it('renown rank alone lifts the band (junker fit)', () => {
    const junker = starterShip();
    expect(computePlayerTier('LIEUTENANT', junker)).toBe(1);
    expect(computePlayerTier('COMMANDER', junker)).toBe(1);
    expect(computePlayerTier('CAPTAIN', junker)).toBe(2);
    expect(computePlayerTier('COMMODORE', junker)).toBe(2);
    expect(computePlayerTier('ADMIRAL', junker)).toBe(3);
    expect(computePlayerTier('TOP_DOG', junker)).toBe(3);
    expect(computePlayerTier('GRAND_MUFTI', junker)).toBe(4);
    expect(computePlayerTier('MEGA_HERO', junker)).toBe(4);
    expect(computePlayerTier('GIGA_HERO', junker)).toBe(5);
  });

  it('ship combat fit alone lifts the band (Lieutenant rank)', () => {
    // A low-rank pilot who over-guns their ship independently qualifies for a
    // tougher band — max() semantics, not rank-only.
    expect(computePlayerTier('LIEUTENANT', maxedCombatShip())).toBe(5);
  });

  it('tier is the max of rank and ship contributions', () => {
    // Rank dominates a weak ship...
    expect(computePlayerTier('GIGA_HERO', starterShip())).toBe(5);
    // ...and a strong ship dominates a low rank.
    const midShip = starterShip();
    midShip.weapons.strength = 50; // shipClassTier 3
    expect(computePlayerTier('LIEUTENANT', midShip)).toBe(3);
    expect(computePlayerTier('CAPTAIN', midShip)).toBe(3); // rankTier 2 < shipTier 3
  });

  it('output is always a PowerTier in 1..5', () => {
    const ranks: RenownRankId[] = [
      'LIEUTENANT',
      'COMMANDER',
      'CAPTAIN',
      'COMMODORE',
      'ADMIRAL',
      'TOP_DOG',
      'GRAND_MUFTI',
      'MEGA_HERO',
      'GIGA_HERO',
    ];
    for (const rank of ranks) {
      for (const strength of [1, 10, 30, 50, 70, 90]) {
        const ship = starterShip();
        ship.weapons.strength = strength;
        const tier = computePlayerTier(rank, ship);
        expect(tier).toBeGreaterThanOrEqual(1);
        expect(tier).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe('T-1203 tier survives save round-trip', () => {
  it('deserialize resyncs tier from the carried rank + ship (never a stale/default 1)', () => {
    const state = stateAtRank('ADMIRAL', 5);
    // Sanity: the derived tier is above the starting band and set through the
    // formula, not by hand.
    expect(state.player.tier).toBe(computePlayerTier('ADMIRAL', state.player.ship));

    const restored = deserializeState(serializeState(state));
    expect(restored.player.registry.renownRank).toBe('ADMIRAL');
    expect(restored.player.tier).toBe(computePlayerTier('ADMIRAL', restored.player.ship));
    expect(restored.player.tier).toBe(3);
  });

  it('a legacy save with a stale tier: 1 is corrected to the derived band on load', () => {
    const state = stateAtRank('GIGA_HERO', 15);
    const raw = JSON.parse(serializeState(state)) as GameState;
    raw.player.tier = 1; // simulate a pre-T-1203 save's frozen tier
    const restored = deserializeState(JSON.stringify(raw));
    expect(restored.player.tier).toBe(5);
  });
});

describe('T-1203 defined succession behavior', () => {
  it('succession resets the ship to the junker but keeps the tier matched to carried rank', () => {
    const state = stateAtRank('GIGA_HERO', 15);
    // Give the fallen spacer an upgraded combat ship so we can prove the reset.
    state.player.ship.weapons.strength = 90;
    expect(computePlayerTier('GIGA_HERO', state.player.ship)).toBe(5);

    const events = applySuccession(state, {
      encounter: {
        id: 'enc-x',
        pendingTravel: { origin: 4, destination: 5, fuelUsed: 10 },
        interceptor: {
          id: 'npc-rattlesnake',
          source: 'named',
          name: 'Rattlesnake',
          shipName: 'Fang',
          profileId: 'npc-rattlesnake',
          stats: { PILOT: 2, GUNS: 3, TRADE: 3, GRIT: 2, GUILE: 1 },
          tier: 3,
          flaw: 'Vengeful',
          flawDc: 14,
        },
        routeDangerLevel: 3,
        routeDangerChance: 0.3,
        encounterRoll: 0.01,
        round: 1,
        enemyHull: 3,
      },
      interceptorId: 'npc-rattlesnake',
    });

    // Ship is the junker again...
    expect(state.player.ship).toEqual(starterShip());
    // ...but the successor's tier is NOT reset to 1: it is the rank-matched band
    // (carried GIGA_HERO + junker fit → 5), recomputed by the formula.
    expect(state.player.tier).not.toBe(1);
    expect(state.player.tier).toBe(computePlayerTier('GIGA_HERO', starterShip()));
    expect(state.player.tier).toBe(5);
    expect(events.some((e) => e.type === 'LegacySuccession')).toBe(true);
  });
});

describe('T-1203 roster reachability', () => {
  it('every named profile tier is inside some reachable player-tier band (structural)', () => {
    // For player tier P (1..5), matchmaking clamps the candidate band to
    // [max(1,P-1), min(5,P+1)]. Assert every named profile.tier is covered by at
    // least one such band — 0 structurally-unreachable tiers. Asserted against
    // the REAL roster so a future profile tier outside 1..5 fails loudly.
    for (const profile of NPC_PROFILES) {
      const reachable = [1, 2, 3, 4, 5].some((p) => {
        const lo = Math.max(1, p - 1);
        const hi = Math.min(5, p + 1);
        return profile.tier >= lo && profile.tier <= hi;
      });
      expect(reachable, `${profile.id} (tier ${profile.tier}) is unreachable`).toBe(true);
    }
  });

  it('computePlayerTier yields every band value 1..5 for a legitimate (rank, ship) pair', () => {
    // Proves no player-tier value is a dead band: each of 1..5 is reachable
    // through earned rank and/or shipyard-tier ship fits.
    expect(computePlayerTier('LIEUTENANT', starterShip())).toBe(1);
    const t2 = starterShip();
    t2.weapons.strength = 20;
    expect(computePlayerTier('LIEUTENANT', t2)).toBe(2);
    expect(computePlayerTier('ADMIRAL', starterShip())).toBe(3);
    expect(computePlayerTier('GRAND_MUFTI', starterShip())).toBe(4);
    expect(computePlayerTier('GIGA_HERO', starterShip())).toBe(5);
  });

  it('the real matchmaker surfaces all 30 named NPCs across the reachable tiers (0 unreachable)', () => {
    // The definitive sweep: drive selectEncounterInterceptor (the actual matcher)
    // for every reachable player tier and collect every named profileId it
    // returns. The union must be the full named roster. This iterates player.tier
    // as a STRUCTURAL enumeration of the bands — distinct from the acceptance's
    // "no test setting tier manually", which governs the veteran-interception
    // test (the derived value must lift itself there).
    const allNamed = new Set(NPC_PROFILES.map((p) => p.id));
    const surfaced = new Set<string>();

    for (let playerTier = 1; playerTier <= 5; playerTier += 1) {
      const state = createInitialState(999);
      state.player.tier = playerTier as PowerTier;
      for (let danger = 1; danger <= 5; danger += 1) {
        for (let seed = 1; seed <= 200; seed += 1) {
          const interceptor = selectEncounterInterceptor(
            state,
            1,
            2,
            danger as RouteDangerLevel,
            new SeededRng(seed * 7 + danger),
          );
          if (interceptor.source === 'named' && interceptor.profileId) {
            surfaced.add(interceptor.profileId);
          }
        }
      }
    }

    const missing = [...allNamed].filter((id) => !surfaced.has(id));
    expect(missing).toEqual([]);
    expect(surfaced.size).toBe(30);
  });
});
