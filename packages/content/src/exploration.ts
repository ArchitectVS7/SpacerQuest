/**
 * Off-lane exploration — points of interest (T-111a).
 *
 * The `Explore` action burns a die on a PILOT nav check to leave the trade lane
 * and chart a point of interest: a transmitting BEACON or a boardable DERELICT
 * (PRD §7.2). This file is PURE DATA — the POI *types* and their discovery
 * flavor. The engine owns the seeded roll and the nav-check math.
 *
 * DELIBERATELY MINIMAL for T-111a: the reward tables — salvage credits, sealed
 * Contraband pods, and the Signal Fragments that feed the Nemesis file — are
 * T-111b. A discovered POI is just a charted coordinate here; T-111b attaches
 * loot to it by `id`/`type`.
 */

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
