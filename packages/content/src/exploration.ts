/**
 * Off-lane exploration — points of interest & loot tables (T-111a + T-111b).
 *
 * The `Explore` action burns a die on a PILOT nav check to leave the trade lane
 * and chart a point of interest: a transmitting BEACON or a boardable DERELICT
 * (PRD §7.2). This file is PURE DATA — the POI *types*, their discovery flavor,
 * and (T-111b) the LOOT TABLE each type rolls. The engine owns the seeded rolls
 * and the nav-check math.
 *
 * T-111b loot (PRD §7.2): a boarded POI yields up to three things, each rolled
 * INDEPENDENTLY off the seeded action rng in a fixed order —
 *   1. SALVAGE   — real credits.
 *   2. FRAGMENT  — a Signal Fragment, drawn from the type's fragment pool
 *                  (nemesis.ts), added to the player's nemesisFile. The treasure.
 *   3. CONTRABAND — a sealed pod: carrying it is a choice with patrol risk,
 *                  surfaced as a derelict storylet (T-110), not taken here.
 */

import { BEACON_FRAGMENT_POOL, DERELICT_FRAGMENT_POOL } from './nemesis.js';

/** The two kinds of point of interest exploration can surface. */
export type PoiType = 'beacon' | 'derelict';

export interface PoiKindDefinition {
  type: PoiType;
  /** Flavor names, chosen deterministically at discovery from the seeded roll. */
  names: readonly string[];
  /** Period-voice discovery wire copy. `{name}` is resolved by the engine. */
  wireDiscovered: string;
}

// BALANCE: foundation/rules/ carries NO exploration constants — the legacy game
// had no off-lane exploration action (grep 'explor' over foundation confirms).
// The values below are chosen for T-111a and flagged here as a deliberate
// divergence from canon:
//
//  - Nav DC sits one pip above the Tour-One PILOT baseline (+1), so a starter
//    spacer needs a mid-or-better hand die to thread it — exploration is a
//    gamble, not a freebie.
//  - The fuel burn matches the PRD §7.2 sample turn ("reaching it burns 80
//    fuel and a die"): off-lane detours cost real range.
export const EXPLORATION_NAV_DC = 12;
export const EXPLORATION_FUEL_COST = 80;

/** Probability a discovered POI is a beacon; the remainder are derelicts. A
 *  near-even split so both types surface readily across a seed sweep. */
export const BEACON_DISCOVERY_CHANCE = 0.5;

export const POI_KINDS: Readonly<Record<PoiType, PoiKindDefinition>> = {
  beacon: {
    type: 'beacon',
    names: [
      'a pre-Confederation distress beacon',
      'a derelict nav-beacon, still transmitting',
      'an unlisted relay buoy',
      'a silent Confederation marker beacon',
    ],
    wireDiscovered: 'Player charted {name} off the lane.',
  },
  derelict: {
    type: 'derelict',
    names: [
      'a gutted freighter hulk',
      'a drifting warship derelict',
      'an ice-locked colony barge',
      'a shattered survey vessel',
    ],
    wireDiscovered: 'Player boarded {name} adrift off the lane.',
  },
};

// --- Loot tables (T-111b, PRD §7.2) ---

/** One component of a POI's loot, rolled independently. */
export interface LootComponentChance {
  /** Probability (0-1) this component is present on a given board. */
  chance: number;
}

export interface SalvageLoot extends LootComponentChance {
  /** Inclusive credit range; the exact amount is a seeded roll in the band. */
  minCredits: number;
  maxCredits: number;
}

export interface FragmentLoot extends LootComponentChance {
  /** Signal Fragment ids this POI type can yield (nemesis.ts). Seeded pick. */
  pool: readonly string[];
}

export interface PoiLootTable {
  salvage: SalvageLoot;
  /** A Signal Fragment — the treasure. Empty pool ⇒ this POI never yields one. */
  fragment: FragmentLoot;
  /** A sealed Contraband pod (the carrying choice). */
  contraband: LootComponentChance;
}

// BALANCE: no canon loot tables exist (foundation had no exploration action).
// Values authored for T-111b, flagged as deliberate divergence:
//  - DERELICTS are the richer, riskier board: reliable salvage, a real chance
//    at a fragment, and the only source of Contraband pods.
//  - BEACONS are a transmitting signal source: thin salvage, no contraband, but
//    a live shot at a fragment leaking off the carrier wave.
// Chances are independent, so a lucky board can yield salvage AND a fragment.
export const POI_LOOT: Readonly<Record<PoiType, PoiLootTable>> = {
  beacon: {
    salvage: { chance: 0.55, minCredits: 40, maxCredits: 180 },
    fragment: { chance: 0.3, pool: BEACON_FRAGMENT_POOL },
    contraband: { chance: 0 },
  },
  derelict: {
    salvage: { chance: 0.8, minCredits: 120, maxCredits: 520 },
    fragment: { chance: 0.35, pool: DERELICT_FRAGMENT_POOL },
    contraband: { chance: 0.4 },
  },
};
