/**
 * Off-lane exploration — points of interest & the OUTCOME ROWS (T-111a, T-110).
 *
 * The `Explore` action burns a die on a PILOT nav check to leave the trade lane
 * and chart a point of interest (PRD §7.2). This file is PURE DATA — the POI
 * *types*, their discovery flavor, the weighted discovery table, and every
 * payoff a board can yield, expressed as a typed row. The engine owns the seeded
 * rolls, the nav-check math, and what each payload KIND means.
 *
 * T-110 · THE VALUE-HEADED OUTCOME ROW (docs/EXPLORE_REDESIGN.md §2). A payoff is
 * a content row — one shared header (`id`, `valuePoints`, `pools`, `wireFound`)
 * plus one discriminated `payload` the engine resolves generically. Authoring the
 * 74th explore outcome is a row here, never an engine branch. There is NO
 * predicate on a row and NO per-row day-count: conditions belong on the storylet
 * a `questline` row points at (§2.5), and the recovery clock is derived by an
 * engine rule from `valuePoints` (§3b, T-111).
 */

import { BEACON_FRAGMENT_POOL, DERELICT_FRAGMENT_POOL } from './nemesis.js';
import type { StoryletEffects } from './storylets.js';

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

/**
 * T-110 · Which POI type a successful nav check surfaces, as an ordered weighted
 * table. The engine walks it cumulatively off one `rng.next()` and takes the
 * first entry it lands in — so which types EXIST, and how often, is content.
 * (This replaces `BEACON_DISCOVERY_CHANCE`, the last place the engine had to
 * name a POI type in a ternary.) The chances are the shipped near-even split, so
 * both types surface readily across a seed sweep; they must sum to 1.
 */
export const POI_DISCOVERY_TABLE: readonly { type: PoiType; chance: number }[] = [
  { type: 'beacon', chance: 0.5 },
  { type: 'derelict', chance: 0.5 },
];

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

// --- The outcome rows (T-110, docs/EXPLORE_REDESIGN.md §2) ---

/**
 * ONE PAYOFF a boarded POI can yield. The engine reads `payload.kind` and
 * nothing else about the row's identity — adding an outcome is adding a row.
 */
export interface ExploreOutcomeDefinition {
  /** Stable content id. The ONLY thing a save ever stores about an outcome. */
  id: string;
  /** 0..100 — THE ladder axis (§5). The ONLY tuning dial an author writes per row. */
  valuePoints: number;
  /** Which POI types can surface this row. */
  pools: readonly PoiType[];
  /** Period-voice line; `{name}` is resolved by the engine, the POI_KINDS precedent.
   *  Empty string ⇒ no line (the legacy rows only; see LEGACY_POI_LOOT). */
  wireFound: string;
  payload: ExploreOutcomePayload;
}

/**
 * The five kinds §2.2 settles, plus one transitional sixth.
 *
 * A "DEAD END" is not a sixth kind: it is `{ kind: 'lore' }` with neither
 * optional field — prose and a wire line, no mechanical payoff, `valuePoints: 0`.
 *
 * FINDING F-110-A · `contraband` is TRANSITIONAL and is NOT part of the settled
 * taxonomy. The shipped derelict table arms `flags['signal.contraband.pending']`
 * (the sealed-pod carry choice), and no settled kind emits `ContrabandFound`;
 * routing it through `lore.effects` would emit `StoryletEffectApplied` instead
 * and break pre-existing exploration assertions. T-110 is behaviour-preserving,
 * so the leg survives as an explicit payload kind. T-113 RETIRES IT once the new
 * pools land and no row uses it.
 */
export type ExploreOutcomePayload =
  | { kind: 'salvage'; minCredits: number; maxCredits: number }
  | { kind: 'lore'; fragmentId?: string; effects?: StoryletEffects }
  | { kind: 'unique-item'; itemId: string }
  | { kind: 'questline'; storyletId: string; delayDays: number }
  | { kind: 'npc'; profileId: string; dispositionDelta: number }
  | { kind: 'contraband' };

// BALANCE: no canon loot tables exist (foundation had no exploration action).
// The rows below are the SHIPPED T-111b tables re-expressed in the T-110 shape —
// same credit bands, same fragment pools, same contraband pod — so the extraction
// is behaviour-preserving. Their `valuePoints` are plausible placements on the §5
// ladder but NOTHING calibrates against them: every `legacy-` row is retired by
// T-113 when the authored pools land. Their `wireFound` is deliberately EMPTY
// (finding F-110-B): emitting a line here would add a WireEntry per boarded POI
// and move the replay goldens. §2.4's "never charged 80 fuel for total silence"
// fix arrives with the authored copy at T-113.
const LEGACY_LORE_ROWS: readonly ExploreOutcomeDefinition[] = [
  ...BEACON_FRAGMENT_POOL.map((fragmentId) => ({
    id: `legacy-lore-beacon-${fragmentId}`,
    valuePoints: 6,
    pools: ['beacon'] as const,
    wireFound: '',
    payload: { kind: 'lore' as const, fragmentId },
  })),
  ...DERELICT_FRAGMENT_POOL.map((fragmentId) => ({
    id: `legacy-lore-derelict-${fragmentId}`,
    valuePoints: 6,
    pools: ['derelict'] as const,
    wireFound: '',
    payload: { kind: 'lore' as const, fragmentId },
  })),
];

/** Every explore outcome the game can yield. T-110 ships only the legacy rows. */
export const EXPLORE_OUTCOMES: readonly ExploreOutcomeDefinition[] = [
  {
    id: 'legacy-salvage-beacon',
    valuePoints: 8,
    pools: ['beacon'],
    wireFound: '',
    payload: { kind: 'salvage', minCredits: 40, maxCredits: 180 },
  },
  {
    id: 'legacy-salvage-derelict',
    valuePoints: 20,
    pools: ['derelict'],
    wireFound: '',
    payload: { kind: 'salvage', minCredits: 120, maxCredits: 520 },
  },
  ...LEGACY_LORE_ROWS,
  {
    id: 'legacy-contraband-beacon',
    valuePoints: 14,
    pools: ['beacon'],
    wireFound: '',
    payload: { kind: 'contraband' },
  },
  {
    id: 'legacy-contraband-derelict',
    valuePoints: 14,
    pools: ['derelict'],
    wireFound: '',
    payload: { kind: 'contraband' },
  },
];

// --- The legacy three-leg draw (T-111b's shape, kept alive as DATA) ---

/**
 * T-110 · §2.4 is explicit that the single weighted draw is NOT behaviour-
 * preserving on its own: today's three legs are INDEPENDENT, so a lucky board
 * yields salvage AND a fragment AND a pod. The extraction therefore keeps the
 * three-leg draw alive — but as a content table pointing at row ids, not as
 * engine control flow. T-113 swaps the engine's `drawLegacyLoot` call for the
 * weighted draw over `EXPLORE_OUTCOMES` and deletes this table.
 */
export interface LegacyLootLeg {
  /** Probability (0-1) this leg fires on a given board. */
  chance: number;
  /** Rows this leg can yield. Empty ⇒ the leg never fires (and rolls nothing). */
  outcomeIds: readonly string[];
}

export interface LegacyPoiLootTable {
  salvage: LegacyLootLeg;
  fragment: LegacyLootLeg;
  contraband: LegacyLootLeg;
}

// The chances are VERBATIM the shipped T-111b table (beacon 0.55/0.30/0,
// derelict 0.80/0.35/0.40) and the fragment leg's ids are the fragment pools in
// POOL ORDER — the index a seeded pick lands on is load-bearing, which is why
// they are derived by `.map` and never transcribed by hand. The beacon's
// contraband leg keeps its zero chance (a beacon leaks signal, not sealed pods).
export const LEGACY_POI_LOOT: Readonly<Record<PoiType, LegacyPoiLootTable>> = {
  beacon: {
    salvage: { chance: 0.55, outcomeIds: ['legacy-salvage-beacon'] },
    fragment: {
      chance: 0.3,
      outcomeIds: BEACON_FRAGMENT_POOL.map((id) => `legacy-lore-beacon-${id}`),
    },
    contraband: { chance: 0, outcomeIds: ['legacy-contraband-beacon'] },
  },
  derelict: {
    salvage: { chance: 0.8, outcomeIds: ['legacy-salvage-derelict'] },
    fragment: {
      chance: 0.35,
      outcomeIds: DERELICT_FRAGMENT_POOL.map((id) => `legacy-lore-derelict-${id}`),
    },
    contraband: { chance: 0.4, outcomeIds: ['legacy-contraband-derelict'] },
  },
};
