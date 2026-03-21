/**
 * SpacerQuest v4.0 - Black Hole Transit System
 *
 * Gates access to Andromeda galaxy systems (21-26)
 * Requires Astraxial hull upgrade from SP.SPEED.S
 *
 * Original: Astraxial hull enables black hole transit to 6 NGC systems
 *
 * Also implements the Black Hole Exit event (SP.PATPIR.S "black" section,
 * lines 142-198): random component damage on exit + The Great Void weapon
 * enhancement discovery.
 */

import { CORE_SYSTEMS, RIM_SYSTEMS, ANDROMEDA_SYSTEMS } from '../constants';

// Andromeda systems start after Core (14) + Rim (6) = system IDs 21-26
const ANDROMEDA_START = CORE_SYSTEMS + RIM_SYSTEMS + 1; // 21
const ANDROMEDA_END = ANDROMEDA_START + ANDROMEDA_SYSTEMS - 1; // 26

// Black hole transit base fuel cost (long-distance intergalactic travel)
const BLACK_HOLE_BASE_FUEL = 200;

/**
 * Check if a system ID is in the Andromeda galaxy
 */
export function isAndromedaSystem(systemId: number): boolean {
  return systemId >= ANDROMEDA_START && systemId <= ANDROMEDA_END;
}

export interface BlackHoleTransitCheck {
  canTransit: boolean;
  reason?: string;
  fuelCost?: number;
}

export interface TransitShipState {
  isAstraxialHull: boolean;
  hullCondition: number;
  driveCondition: number;
  driveStrength: number;
  fuel: number;
}

/**
 * Check if a ship can transit through the black hole to Andromeda
 *
 * Requirements:
 *   - Astraxial hull installed
 *   - Hull in working condition (condition > 0)
 *   - Drives functional (condition > 0)
 *   - Sufficient fuel for transit
 */
export function canTransitBlackHole(ship: TransitShipState): BlackHoleTransitCheck {
  if (!ship.isAstraxialHull) {
    return {
      canTransit: false,
      reason: 'Astraxial hull required for black hole transit',
    };
  }

  if (ship.hullCondition < 1) {
    return {
      canTransit: false,
      reason: 'Hull too damaged for black hole transit',
    };
  }

  if (ship.driveCondition < 1) {
    return {
      canTransit: false,
      reason: 'Drives inoperable — cannot enter black hole',
    };
  }

  const fuelCost = getBlackHoleTransitCost(ship.driveStrength, ship.driveCondition);
  if (ship.fuel < fuelCost) {
    return {
      canTransit: false,
      reason: `Not enough fuel for black hole transit (need ${fuelCost}, have ${ship.fuel})`,
      fuelCost,
    };
  }

  return {
    canTransit: true,
    fuelCost,
  };
}

/**
 * Calculate fuel cost for black hole transit
 *
 * Better drives = lower cost. Uses similar formula structure to regular travel.
 */
export function getBlackHoleTransitCost(driveStrength: number, driveCondition: number): number {
  const af = Math.min(driveStrength, 21);
  const efficiency = af + driveCondition;
  // Higher efficiency = lower cost
  const cost = Math.max(50, BLACK_HOLE_BASE_FUEL - (efficiency * 5));
  return cost;
}

// ============================================================================
// BLACK HOLE EXIT DAMAGE — SP.PATPIR.S "black" section lines 147-158
// ============================================================================

/**
 * Ship stats needed for black hole exit damage calculation.
 * Maps original variables: d1=drive, c1=cabin, l1=life-support,
 * w1=weapon, n1=nav, r1=robotics, p1=hull.
 */
export interface BlackHoleShipStats {
  driveStrength: number;
  cabinStrength: number;
  lifeSupportStrength: number;
  weaponStrength: number;
  navigationStrength: number;
  roboticsStrength: number;
  hullStrength: number;
}

/** Component index names — original picks i=1-7 and maps to component */
export type BlackHoleComponent =
  | 'drives'
  | 'cabin'
  | 'lifeSupport'
  | 'weapons'
  | 'navigation'
  | 'robotics'
  | 'hull';

export interface BlackHoleDamageResult {
  damaged: boolean;
  component?: BlackHoleComponent;
  /** Prisma field name for the strength field */
  field?: string;
  /** Human-readable component label (from original l$ variable) */
  label?: string;
  damageAmount?: number;
  newStrength?: number;
}

/**
 * Pure function: compute black hole exit component damage.
 *
 * Original SP.PATPIR.S black section lines 147-158:
 *   r=7:gosub rand           → pick component index i (1-7)
 *   y=i:gosub rand           → pick damage amount y (1-7, using new rand)
 *   if i=1 j=d1: ... gosub blkx: d1=j
 *   if i=2 j=c1: ... gosub blkx: c1=j
 *   ...
 *   blkx:
 *     if j>5 j=(j-y):print l$" damaged -"y:return
 *     i=i+1:return            → if strength <= 5, skip (try next component)
 *
 * Selection is random (1-7) for component, then random (1-7) for damage.
 * Damage only applied if component strength > 5.
 * If strength <= 5, the blkx subroutine does i=i+1 (shifts to next component)
 * but does NOT loop — so effectively: if component strength <= 5, no damage.
 *
 * @param componentIndex  1-7 selecting component (from r=7 rand roll)
 * @param damageAmount    1-7 damage to apply (from y=i rand roll, i=7)
 * @param ship            Current ship component strengths
 */
export function computeBlackHoleDamage(
  componentIndex: number,
  damageAmount: number,
  ship: BlackHoleShipStats
): BlackHoleDamageResult {
  // Component map: index → (original var, label, prisma field, strength value)
  const components: Array<{
    key: BlackHoleComponent;
    label: string;
    field: string;
    strength: number;
  }> = [
    { key: 'drives',       label: 'Drives',       field: 'driveStrength',       strength: ship.driveStrength },
    { key: 'cabin',        label: 'Cabin',         field: 'cabinStrength',       strength: ship.cabinStrength },
    { key: 'lifeSupport',  label: 'Life Support',  field: 'lifeSupportStrength', strength: ship.lifeSupportStrength },
    { key: 'weapons',      label: 'Weapons',       field: 'weaponStrength',      strength: ship.weaponStrength },
    { key: 'navigation',   label: 'Navigation',    field: 'navigationStrength',  strength: ship.navigationStrength },
    { key: 'robotics',     label: 'Robotics',      field: 'roboticsStrength',    strength: ship.roboticsStrength },
    { key: 'hull',         label: 'Hull',          field: 'hullStrength',        strength: ship.hullStrength },
  ];

  // Clamp index to valid range (1-7 from original rand)
  const idx = Math.max(1, Math.min(7, componentIndex)) - 1;
  const comp = components[idx];

  // blkx: if j>5 j=(j-y) → only applies damage if strength > 5
  // if j<=5 → i=i+1 (no damage applied in this invocation)
  if (comp.strength <= 5) {
    return { damaged: false };
  }

  const newStrength = Math.max(0, comp.strength - damageAmount);
  return {
    damaged: true,
    component: comp.key,
    field: comp.field,
    label: comp.label,
    damageAmount,
    newStrength,
  };
}

/**
 * Roll random values for black hole exit damage.
 *
 * Original SP.PATPIR.S lines 147:
 *   r=7:gosub rand:y=i:gosub rand
 *   First rand selects component (i=1-7, r=7)
 *   Second rand: i is set to y from first rand (y=i), r is unchanged (r=7)
 *   → damage is random 1-7
 *
 * Returns { componentIndex: 1-7, damageAmount: 1-7 }
 */
export function rollBlackHoleDamage(): { componentIndex: number; damageAmount: number } {
  const componentIndex = Math.floor(Math.random() * 7) + 1; // 1-7
  const damageAmount = Math.floor(Math.random() * 7) + 1;   // 1-7
  return { componentIndex, damageAmount };
}
