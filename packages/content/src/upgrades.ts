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
const SPECIAL_EQUIPMENT_TABLE = [
  { id: 'CLOAKER', name: 'Cloaker', price: 500 },
  { id: 'AUTO_REPAIR', name: 'Auto-Repair', price: 'DYNAMIC_HULL_STRENGTH' },
  { id: 'STAR_BUSTER', name: 'Star Buster', price: 10000, requiredRenownRank: 'CAPTAIN' },
  { id: 'ARCH_ANGEL', name: 'Arch Angel', price: 10000, requiredRenownRank: 'CAPTAIN' },
  { id: 'ASTRAXIAL_HULL', name: 'Astraxial Hull', price: 100000, requiredRenownRank: 'GIGA_HERO' },
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
