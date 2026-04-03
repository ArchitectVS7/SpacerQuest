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
 * Calculate fuel cost for black hole transit.
 *
 * SP.BLACK.S fcost subroutine (lines 309-317), called with q6=10:
 *   af=d1: if af>21 af=21
 *   f2=(21-af)+(10-d2): if f2<1 f2=1
 *   f2=(f2*q6): ty=(f2+10)
 *   if ty>100 ty=100
 *   f2=(ty/2): return
 */
export function getBlackHoleTransitCost(driveStrength: number, driveCondition: number): number {
  const q6 = 10; // SP.BLACK.S: q6=10 before gosub fcost
  const af = Math.min(driveStrength, 21);
  let f2 = (21 - af) + (10 - driveCondition);
  if (f2 < 1) f2 = 1;
  f2 = f2 * q6;
  let ty = f2 + 10;
  if (ty > 100) ty = 100;
  return Math.floor(ty / 2);
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
 *   r=7:gosub rand           → pick damage amount y (1-7, first rand)
 *   y=i:gosub rand           → pick component index i (1-7, second rand)
 *   if i=1 j=d1: ... gosub blkx: d1=j
 *   if i=2 j=c1: ... gosub blkx: c1=j
 *   ...
 *   blkx:
 *     if j>5 j=(j-y):print l$" damaged -"y:return
 *     i=i+1:return            → if strength <= 5, increment i and return
 *
 * The blkx cascade: since the `if i=N` checks are sequential ACOS-BASIC
 * statements on consecutive lines, incrementing i inside blkx causes the
 * NEXT `if i=N` to fire on the same pass. This cascades until a component
 * with strength > 5 is found or all 7 components are exhausted (no damage).
 *
 * Selection: componentIndex (1-7) selects the starting component.
 * Damage: damageAmount (1-7) is subtracted from the component's strength.
 * Cascade: if selected component has strength <= 5, tries componentIndex+1,
 *          componentIndex+2, ... up to 7. If none qualify, no damage occurs.
 *
 * @param componentIndex  1-7 selecting starting component (second rand roll)
 * @param damageAmount    1-7 damage to apply (first rand roll, stored in y)
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

  // Clamp starting index to valid range (1-7 from original rand), convert to 0-based
  const startIdx = Math.max(1, Math.min(7, componentIndex)) - 1;

  // blkx cascade: try startIdx, then startIdx+1, ..., up to index 6 (component 7)
  // Original: blkx increments i and returns; sequential if-checks cause next to fire.
  // If component strength <= 5 → cascade to next. If strength > 5 → apply damage.
  for (let idx = startIdx; idx < components.length; idx++) {
    const comp = components[idx];
    if (comp.strength > 5) {
      // blkx: if j>5 j=(j-y) → apply damage
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
    // blkx: i=i+1 → cascade to next component
  }

  // All components from startIdx to 7 have strength <= 5 — no damage
  return { damaged: false };
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
