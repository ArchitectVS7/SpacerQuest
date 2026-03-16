/**
 * SpacerQuest v4.0 - Black Hole Transit System
 *
 * Gates access to Andromeda galaxy systems (21-26)
 * Requires Astraxial hull upgrade from SP.SPEED.S
 *
 * Original: Astraxial hull enables black hole transit to 6 NGC systems
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
