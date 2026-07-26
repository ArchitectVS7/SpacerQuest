export const YARD_COMPONENT_TIER_PRICES = [
  50, 100, 200, 400, 800, 1500, 3000, 5000, 10000,
] as const;

export const SHIP_COMPONENTS = [
  { id: 'hull', name: 'Hull' },
  { id: 'drives', name: 'Drives' },
  { id: 'cabin', name: 'Cabin' },
  { id: 'lifeSupport', name: 'Life Support' },
  { id: 'weapons', name: 'Weapons' },
  { id: 'navigation', name: 'Navigation' },
  { id: 'robotics', name: 'Robotics' },
  { id: 'shields', name: 'Shields' },
] as const;

import type { RenownRankId } from './deeds.js';

export interface SpecialEquipmentDefinition {
  readonly id: string;
  readonly name: string;
  readonly price: number | 'DYNAMIC_HULL_STRENGTH';
  /** Minimum Renown rank required to purchase this equipment (Deeds/Renown gate;
   *  replaces foundation's vestigial score/conqueror gates). */
  readonly requiredRenownRank?: RenownRankId;
}

/** The literal source of the shipped equipment table. Kept `as const` (and behind
 *  the widened `SPECIAL_EQUIPMENT` export below) purely so the id union can be
 *  DERIVED from it — see `SpecialEquipmentContentId`. */
/**
 * T-1603b · RENOWN GATES RE-ANCHORED, as direct fallout of the canonical
 * `RENOWN_DEED_THRESHOLDS` rescale (content `deeds.ts`). READ THIS BEFORE MOVING
 * A GATE BACK.
 *
 * A `requiredRenownRank` is a rank NAME, but what it actually costs a player is
 * the DEED COUNT behind that name — and the rescale changed every one of those
 * counts. The rule applied here is: hold each gate's real cost in deeds roughly
 * where it was, so the rescale re-proportions the ladder without silently
 * re-pricing the equipment hanging off it.
 *
 *   ASTRAXIAL_HULL: GIGA_HERO → TOP_DOG. The old GIGA_HERO was 15 deeds; the new
 *     TOP_DOG is 17. Naming GIGA_HERO now would mean 31 deeds — MORE THAN DOUBLE
 *     the old gate, and structurally unreachable in real play: measured over
 *     seeds 1..20 of `driveCompetentCampaign(veteranPolicy, seed, 500)`, the
 *     shipped veteran caps at 23 earned deeds (GRAND_MUFTI) after five hundred
 *     days while banking 400k–565k credits. The money is there; only the rank
 *     would block, so leaving the gate at GIGA_HERO would quietly delete the
 *     game's deepest equipment from every non-deed-hunting career and would red
 *     the T-114a reachability acceptance in `packages/sim/src/__tests__/
 *     campaign-reach.test.ts` for a reason that is not a defect.
 *   STAR_BUSTER / ARCH_ANGEL: CAPTAIN, HELD. The name is unchanged but the cost
 *     rose 2 → 5 deeds — a deliberate, small tightening. 5 deeds still lands in
 *     the first week for every competent policy (T-1603a §5: the fleet's 5th deed
 *     is a day-4 median), so these stay early-career purchases; and 2 deeds was
 *     close enough to free that the gate read as decoration.
 *
 * ASTRAXIAL_HULL remains the DEEPEST renown gate in the game — nothing is gated
 * above it — which is the property the T-114a acceptance actually tests. The two
 * ranks above TOP_DOG are now what T-1603b's memo calls the deed-hunter's ranks,
 * and CONQUEROR keeps its own separate reader (the Nemesis-crossing stake gate,
 * `CROSSING_REQUIRED_RANK` in `nemesis.ts`), so the top of the ladder is not left
 * without consumers.
 *
 * READER: `packages/engine/src/actions/shipyard.ts` compares
 * `renownRankIndex(player.registry.renownRank)` against
 * `renownRankIndex(requiredRenownRank)` and refuses the purchase below it;
 * surfaced to the player as the locked row in the shipyard's special-equipment
 * pane. Both directions are asserted in `engine/__tests__/shipyard.test.ts`.
 */
const SPECIAL_EQUIPMENT_TABLE = [
  { id: 'CLOAKER', name: 'Cloaker', price: 500 },
  { id: 'AUTO_REPAIR', name: 'Auto-Repair', price: 'DYNAMIC_HULL_STRENGTH' },
  { id: 'STAR_BUSTER', name: 'Star Buster', price: 10000, requiredRenownRank: 'CAPTAIN' },
  { id: 'ARCH_ANGEL', name: 'Arch Angel', price: 10000, requiredRenownRank: 'CAPTAIN' },
  { id: 'ASTRAXIAL_HULL', name: 'Astraxial Hull', price: 100000, requiredRenownRank: 'TOP_DOG' },
  { id: 'TITANIUM_HULL', name: 'Titanium Hull', price: 'DYNAMIC_HULL_STRENGTH' },
  { id: 'TRANS_WARP', name: 'Trans-Warp Drive', price: 10000 },
] as const satisfies readonly SpecialEquipmentDefinition[];

/**
 * T-1601c · The literal union of shipped special-equipment ids, DERIVED from the
 * table above so the two can never drift. It mirrors the engine's hand-written
 * `SpecialEquipmentId` union (`packages/engine/src/types.ts`), but being derived
 * it turns a typo'd key in a content table keyed by equipment id into a COMPILE
 * error instead of a silent no-op. READER: `crew.ts` `EQUIPMENT_DICE_BENEFITS`.
 */
export type SpecialEquipmentContentId = (typeof SPECIAL_EQUIPMENT_TABLE)[number]['id'];

/** The shipped special equipment, widened to the declared interface so consumers
 *  (`engine/actions/shipyard.ts`, `sim`, `ui/format.ts`) see the same structural
 *  type they always have — the `as const` above exists only to derive the id
 *  union, never to narrow this export. */
export const SPECIAL_EQUIPMENT: readonly SpecialEquipmentDefinition[] = SPECIAL_EQUIPMENT_TABLE;
