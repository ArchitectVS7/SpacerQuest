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
 *
 * T-111 · THE VALUE BANDS (docs/EXPLORE_REDESIGN.md §5.2). `EXPLORE_VALUE_BANDS`
 * below is the ONLY place in the codebase a recovery day-count is written. The
 * engine's `bandFor`/`recoveryDays` (exploreOutcomes.ts) read it; no row carries
 * an N of its own, and the type is what enforces that.
 */

import { BEACON_FRAGMENT_POOL, DERELICT_FRAGMENT_POOL } from './nemesis.js';
import type { ExploreModuleContentId } from './crew.js';
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

// --- The unique-item table (T-112, docs/EXPLORE_REDESIGN.md §4) -------------

/**
 * T-112 · The ship elements a CLASS-A item can move.
 *
 * DECLARED HERE, NOT IMPORTED FROM THE ENGINE. `ShipComponentId` is an engine
 * type and content must never depend on the engine — the precedent is stated
 * outright in `components.ts` (`HULL_DAMAGE_WEIGHT`). The engine pins the two
 * unions equal with a compile-time `AssertEqual` in `exploreOutcomes.ts`, so a
 * component renamed on either side is a `tsc` failure rather than a dead row.
 */
export type ShipElementComponentId =
  'hull' | 'drives' | 'cabin' | 'lifeSupport' | 'weapons' | 'navigation' | 'robotics' | 'shields';

/**
 * ONE declared delta a Class-A item applies to the ship. The ELEMENT CLASS is the
 * discriminant the engine switches on; the row supplies only its parameters. No
 * row names a rule: `component` deltas clamp to the documented `ComponentState`
 * strength bound, a `maxFuel` delta is realized through the engine's single
 * `syncMaxFuel` chokepoint, and a `cargoPods` delta is clamped by the yard's own
 * `maxCargoPodsForShip`.
 */
export type ShipElementDelta =
  | { element: 'component'; component: ShipElementComponentId; strength: number }
  | { element: 'maxFuel'; amount: number }
  | { element: 'cargoPods'; amount: number };

/**
 * ONE unique item a `{ kind: 'unique-item' }` outcome row can grant, in the two
 * classes §4 names:
 *
 *  - `class: 'ship'` — CLASS A, the workhorse tier: a declared list of ship-element
 *    deltas. Unbounded and pure content; this is where "+2 to PILOT checks"
 *    ambitions are re-authored as `navigation.strength +20`, which the engine's
 *    existing `navBonus` reader already turns into a check bonus.
 *  - `class: 'module'` — CLASS B, the die effect: the row names an
 *    `ExploreModuleContentId` and the module's `DiceBenefit` is looked up from
 *    `EXPLORE_MODULE_DICE_BENEFITS` (crew.ts). Deliberately capped at the three
 *    shipped modules — see that table's header for the cap argument.
 */
export type ExploreItemDefinition =
  | { id: string; name: string; class: 'ship'; deltas: readonly ShipElementDelta[] }
  | { id: string; name: string; class: 'module'; moduleId: ExploreModuleContentId };

/**
 * Every unique item the game can grant.
 *
 * ONLY THE THREE CLASS-B ITEMS SHIP AT T-112, AND THAT ABSENCE IS DELIBERATE.
 * T-112 owns the effect SURFACE; the `unique-item` outcome ROWS that reach for it
 * are authored by T-113/T-114/T-115 against the §5.2 band ceilings. Shipping
 * speculative Class-A items here would be content invented ahead of the ladder
 * that prices it. The Class-A resolver is proved instead by test-local rows
 * handed straight to the engine's exported `applyUniqueItem` — the same
 * dependency-injection shape `equipmentDiceBenefits(ship, table)` already uses to
 * prove a shipped-empty table's path.
 *
 * READERS: the engine's `unique-item` arm (`exploreOutcomes.ts`, by id) and the
 * UI's acquisition line (`ui/format.ts` `explorationOutcome`, for the name only).
 */
export const EXPLORE_ITEMS: readonly ExploreItemDefinition[] = [
  {
    id: 'item-tally-slate',
    name: 'Gunnery Tally-Slate',
    class: 'module',
    moduleId: 'module-tally-slate',
  },
  {
    id: 'item-marked-ephemeris',
    name: "Astrogator's Marked Ephemeris",
    class: 'module',
    moduleId: 'module-marked-ephemeris',
  },
  {
    id: 'item-berth-couch',
    name: "Staff Pilot's Berth-Couch",
    class: 'module',
    moduleId: 'module-berth-couch',
  },
];

/** Items keyed by id for O(1) lookup by the engine's `unique-item` arm. A miss is
 *  tolerated by the reader (the `CREW_BY_ID[…]?.benefit` precedent), so a save or
 *  a row naming a retired item mutates nothing. */
export const EXPLORE_ITEM_BY_ID: Record<string, ExploreItemDefinition> = Object.fromEntries(
  EXPLORE_ITEMS.map((item) => [item.id, item]),
);

// --- The value ladder's band table (T-111, docs/EXPLORE_REDESIGN.md §5.2) ---

/**
 * ONE BAND on the value ladder. A band is a half-open range of `valuePoints`
 * starting at `minValuePoints` and running to the next band's start; the engine's
 * `bandFor` walks the ordered list and keeps the LAST satisfied entry.
 *
 * Only the three columns T-111 consumes ship here. §5.2 reserves four more for
 * the content passes that follow — `payload kinds permitted` (T-113/T-114/T-115),
 * `Class-A ceiling` and `Class-B permitted` (T-114), and `draw weight` (T-113,
 * when the single weighted draw replaces the legacy legs).
 * Extend this interface when those land; do not re-invent a second table.
 *
 * FINDING F-112-C · the two effect-strength columns were attributed to T-112 and
 * are RE-TARGETED to T-114 here. T-112 built the effect SURFACE (the resolver,
 * the module tier, the cockpit readouts) but authored NO `unique-item` outcome
 * rows — the first ones are band-2 rows and land with T-114. A ceiling column
 * added at T-112 would therefore have had zero consumers and nothing to validate
 * against, which is a stub raising a coverage signal rather than a rule. T-114
 * has rows to check, so the columns land with the validator that reads them.
 *
 * THE ENFORCEMENT, stated so it is not lost: `ExploreOutcomeDefinition` has NO
 * `recoveryDays` key and MUST NEVER GAIN ONE. A content author cannot hand-tune
 * one row's recovery clock because there is nowhere to write it — a missing field
 * is a compile error, which is stronger than any test. `grep recoveryDays
 * packages/content/src/exploration.ts` must hit ONLY inside EXPLORE_VALUE_BANDS.
 *
 * IN-REPO PRECEDENT, deliberately copied: `RENOWN_DEED_THRESHOLDS` (deeds.ts) is
 * a content band table and `rankForDeedCount` (engine deeds.ts) is the one-line
 * engine rule that reads it by walking the ordered list and keeping the last
 * satisfied entry. Content owns where the bands sit; the engine owns what a band
 * MEANS.
 */
export interface ExploreValueBand {
  /** Ladder index. Monotone with `minValuePoints`; band 0 is the dead-end floor. */
  band: number;
  /** Inclusive lower bound on `valuePoints`. Rows MUST be ordered ascending. */
  minValuePoints: number;
  /** N — calendar days a find in this band takes to recover. 0 ⇒ same-day. */
  recoveryDays: number;
}

// BALANCE: the day counts are VERBATIM docs/EXPLORE_REDESIGN.md §5.2. Bands 0-1
// (58% of successful boards under §5.2's weights) recover same-day, so the common
// find behaves exactly like today's instant loot — the audit measured a median
// day-120 captain carrying 27 fuel, and a verb that always cost a multi-day
// commitment on top of an 80-fuel gate would be unusable for the captain it is
// meant to serve. Band 4's N is held at 6 so a day-24 find still reads as a
// legible gamble against the day-30 Tour One marker.
export const EXPLORE_VALUE_BANDS: readonly ExploreValueBand[] = [
  { band: 0, minValuePoints: 0, recoveryDays: 0 },
  { band: 1, minValuePoints: 1, recoveryDays: 0 },
  { band: 2, minValuePoints: 11, recoveryDays: 1 },
  { band: 3, minValuePoints: 31, recoveryDays: 3 },
  { band: 4, minValuePoints: 61, recoveryDays: 6 },
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
