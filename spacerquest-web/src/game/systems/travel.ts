/**
 * SpacerQuest v4.0 - Travel System
 * 
 * Implements space travel mechanics from original SP.WARP.S and SP.LIFT.S
 * All formulas preserved exactly from the original
 */

import {
  COURSE_CHANGE_FUEL_MULTIPLIER,
  TRAVEL_TIME_MULTIPLIER,
  DAILY_TRIP_LIMIT,
} from '../constants';
import { calculateDistance } from '../utils';

// ============================================================================
// FUEL CALCULATIONS
// ============================================================================

/**
 * Calculate fuel cost for travel
 * 
 * Original formula from SP.WARP.S / SP.LIFT.S:
 *   af=d1:if af>21 af=21
 *   f2=(21-af)+(10-d2):if f2<1 f2=1
 *   f2=f2*q6:ty=f2+10:if ty>100 ty=100
 *   f2=ty/2
 * 
 * @param driveStrength - Drive strength (d1)
 * @param driveCondition - Drive condition (d2)
 * @param distance - Distance in astrecs (q6)
 * @returns Fuel units required
 */
export function calculateFuelCost(
  driveStrength: number,
  driveCondition: number,
  distance: number
): number {
  // Cap drive strength at 21 (original behavior)
  const af = Math.min(driveStrength, 21);
  
  // Base fuel cost
  let fuelCost = (21 - af) + (10 - driveCondition);
  
  // Minimum cost of 1
  if (fuelCost < 1) fuelCost = 1;
  
  // Multiply by distance
  fuelCost = fuelCost * distance;
  
  // Apply cap formula
  const ty = fuelCost + 10;
  const capped = Math.min(ty, 100);
  
  return Math.floor(capped / 2);
}

/**
 * Calculate fuel cost for course change
 * 
 * Original: x=(h1*5) - hull strength × 5
 * 
 * @param hullStrength - Hull strength (h1)
 * @returns Fuel units required for course change
 */
export function calculateCourseChangeFuel(hullStrength: number): number {
  return hullStrength * COURSE_CHANGE_FUEL_MULTIPLIER;
}

/**
 * Calculate maximum fuel capacity
 * 
 * Original: i=(h2+1)*h1: ye=(i*10)
 * 
 * @param hullStrength - Hull strength (h1)
 * @param hullCondition - Hull condition (h2)
 * @returns Maximum fuel capacity in units
 */
export function calculateFuelCapacity(hullStrength: number, hullCondition: number): number {
  if (hullStrength < 1 || hullCondition < 1) return 0;
  return (hullCondition + 1) * hullStrength * 10;
}

/**
 * Check if ship has enough fuel for journey
 */
export function hasEnoughFuel(
  currentFuel: number,
  requiredFuel: number
): { hasEnough: boolean; deficit: number } {
  const deficit = Math.max(0, requiredFuel - currentFuel);
  return {
    hasEnough: currentFuel >= requiredFuel,
    deficit,
  };
}

// ============================================================================
// TRAVEL TIME
// ============================================================================

/**
 * Calculate travel time in chronos
 * 
 * @param distance - Distance in astrecs
 * @returns Travel time in chronos units
 */
export function calculateTravelTime(distance: number): number {
  return distance * TRAVEL_TIME_MULTIPLIER;
}

/**
 * Calculate expected arrival time
 * 
 * @param departureTime - When travel started
 * @param distance - Distance in astrecs
 * @returns Expected arrival Date
 */
export function calculateArrivalTime(departureTime: Date, distance: number): Date {
  const chronos = calculateTravelTime(distance);
  // Convert chronos to milliseconds (1 chronos = 1 second for gameplay)
  return new Date(departureTime.getTime() + chronos * 1000);
}

// ============================================================================
// DAILY TRIP TRACKING
// ============================================================================

/**
 * Check if player can make another trip today
 * 
 * Original: if z1>2 print "Only 3 completed trips allowed per day"
 * 
 * @param tripCount - Trips completed today (z1)
 * @param lastTripDate - Date of last trip
 * @returns Whether player can travel
 */
export function canTravel(
  tripCount: number,
  lastTripDate: Date | null
): { canTravel: boolean; reason?: string; remainingTrips: number } {
  const remainingTrips = Math.max(0, DAILY_TRIP_LIMIT - tripCount);
  
  // Check if it's a new day
  if (lastTripDate) {
    const today = new Date();
    const lastTrip = new Date(lastTripDate);
    
    if (
      today.getDate() !== lastTrip.getDate() ||
      today.getMonth() !== lastTrip.getMonth() ||
      today.getFullYear() !== lastTrip.getFullYear()
    ) {
      // New day, reset counter
      return { canTravel: true, remainingTrips: DAILY_TRIP_LIMIT };
    }
  }
  
  if (tripCount >= DAILY_TRIP_LIMIT) {
    return {
      canTravel: false,
      reason: `Only ${DAILY_TRIP_LIMIT} trips allowed per day`,
      remainingTrips: 0,
    };
  }
  
  return { canTravel: true, remainingTrips };
}

// ============================================================================
// LAUNCH VALIDATION
// ============================================================================

export interface LaunchValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fuelRequired?: number;
  travelTime?: number;
}

/**
 * Validate all requirements for launch
 */
export async function validateLaunch(
  characterId: string,
  destinationSystemId: number
): Promise<LaunchValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { prisma } = await import('../../db/prisma.js');

  // Get character and ship data
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });
  
  if (!character) {
    return { valid: false, errors: ['Character not found'], warnings: [] };
  }

  if (!character.ship) {
    return { valid: false, errors: ['No ship found'], warnings: [] };
  }
  
  const ship = character.ship;
  
  // Check ship systems
  if (ship.driveStrength < 1 || ship.driveCondition < 1) {
    errors.push('No functional drives');
  }
  
  if (ship.cabinStrength < 1 || ship.cabinCondition < 1) {
    warnings.push('No cabin - uncomfortable journey');
  }
  
  if (ship.lifeSupportStrength < 1 || ship.lifeSupportCondition < 1) {
    errors.push('No life support system');
  }
  
  if (ship.navigationStrength < 1 || ship.navigationCondition < 1) {
    errors.push('No navigation system');
  }
  
  if (ship.roboticsStrength < 1 || ship.roboticsCondition < 1) {
    warnings.push('No computer/robotic system');
  }
  
  if (ship.hullCondition < 1) {
    errors.push('Ship too badly damaged to lift off');
  }
  
  if (ship.driveCondition < 1) {
    errors.push('Drives inoperable');
  }
  
  // Check daily trip limit
  const tripCheck = canTravel(character.tripCount, character.lastTripDate);
  if (!tripCheck.canTravel) {
    errors.push(tripCheck.reason!);
  }
  
  // Check fuel
  const distance = calculateDistance(character.currentSystem, destinationSystemId);
  const fuelRequired = calculateFuelCost(ship.driveStrength, ship.driveCondition, distance);
  
  if (ship.fuel < fuelRequired) {
    errors.push(`Not enough fuel. Need ${fuelRequired}, have ${ship.fuel}`);
  }
  
  // Check cargo contract validity
  if (character.cargoPods > 0 && character.cargoType !== 0) {
    if (character.destination === 0) {
      warnings.push('Cargo contract has no destination!');
    }
  }
  
  // Black hole transit check for Andromeda systems
  const { isAndromedaSystem, canTransitBlackHole } = await import('./black-hole.js');
  if (isAndromedaSystem(destinationSystemId)) {
    const transitCheck = canTransitBlackHole({
      isAstraxialHull: ship.isAstraxialHull,
      hullCondition: ship.hullCondition,
      driveCondition: ship.driveCondition,
      driveStrength: ship.driveStrength,
      fuel: ship.fuel,
    });
    if (!transitCheck.canTransit) {
      errors.push(transitCheck.reason!);
    }
  }

  // Special handling for Endgame destinations
  if (destinationSystemId === 28) {
    if (!character.cargoManifest || !character.cargoManifest.includes('Nemesis')) {
      errors.push('Access Denied: You do not have the Nemesis mission orders.');
    }
  } else if (destinationSystemId === 27) {
    if (!character.cargoManifest || !character.cargoManifest.includes('Maligna')) {
      errors.push('Access Denied: You do not have the Maligna mission orders.');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fuelRequired,
    travelTime: calculateTravelTime(distance),
  };
}

// ============================================================================
// COURSE CHANGE
// ============================================================================

export interface CourseChangeResult {
  success: boolean;
  fuelUsed: number;
  remainingChanges: number;
  error?: string;
}

/**
 * Process a manual course change
 * 
 * Original from SP.WARP.S:
 *   x=(h1*5):yr=yr-1:if yr<1 yr=0
 *   f1=f1-x
 */
export async function processCourseChange(
  characterId: string,
  newDestinationId: number,
  courseChangesRemaining: number
): Promise<CourseChangeResult> {
  const { prisma } = await import('../../db/prisma.js');
  
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });
  
  if (!character || !character.ship) {
    return { success: false, fuelUsed: 0, remainingChanges: 0, error: 'Character or ship not found' };
  }
  
  const ship = character.ship;
  
  // Check if navigation is functional
  if (ship.navigationStrength < 1 || ship.navigationCondition < 1) {
    return { success: false, fuelUsed: 0, remainingChanges: 0, error: 'Navigation system not functioning' };
  }
  
  // Check course change limit
  if (courseChangesRemaining < 1) {
    return { success: false, fuelUsed: 0, remainingChanges: 0, error: 'Navigation locked into last course setting' };
  }
  
  // Calculate fuel cost
  const fuelCost = calculateCourseChangeFuel(ship.hullStrength);
  
  // Check fuel
  if (ship.fuel < fuelCost) {
    return { success: false, fuelUsed: 0, remainingChanges: 0, error: `Not enough fuel for course change (need ${fuelCost})` };
  }
  
  // Update character destination and fuel
  await prisma.character.update({
    where: { id: characterId },
    data: {
      destination: newDestinationId,
    },
  });
  
  await prisma.ship.update({
    where: { id: ship.id },
    data: {
      fuel: ship.fuel - fuelCost,
    },
  });
  
  return {
    success: true,
    fuelUsed: fuelCost,
    remainingChanges: courseChangesRemaining - 1,
  };
}

// ============================================================================
// TRAVEL STATE MANAGEMENT
// ============================================================================

/**
 * Start travel for a character
 */
export async function startTravel(
  characterId: string,
  originSystem: number,
  destinationSystem: number,
  fuelReserved: number
): Promise<void> {
  const { prisma } = await import('../../db/prisma.js');
  const now = new Date();
  const distance = calculateDistance(originSystem, destinationSystem);
  const arrivalTime = calculateArrivalTime(now, distance);
  
  await prisma.travelState.upsert({
    where: { characterId },
    update: {
      originSystem,
      destinationSystem,
      departureTime: now,
      expectedArrival: arrivalTime,
      fuelReserved,
      inTransit: true,
    },
    create: {
      characterId,
      originSystem,
      destinationSystem,
      departureTime: now,
      expectedArrival: arrivalTime,
      fuelReserved,
      inTransit: true,
    },
  });
  
  // Update character state
  await prisma.character.update({
    where: { id: characterId },
    data: {
      currentSystem: 0, // 0 = in transit
      tripCount: { increment: 1 },
      lastTripDate: now,
    },
  });
}

/**
 * Complete travel for a character
 */
export async function completeTravel(
  characterId: string,
  destinationSystem: number
): Promise<void> {
  const { prisma } = await import('../../db/prisma.js');
  
  // Remove travel state
  await prisma.travelState.deleteMany({
    where: { characterId },
  });
  
  // Update character position
  await prisma.character.update({
    where: { id: characterId },
    data: {
      currentSystem: destinationSystem,
      tripsCompleted: { increment: 1 },
    },
  });
  
  // Update system visit count
  await prisma.starSystem.update({
    where: { id: destinationSystem },
    data: {
      visitCount: { increment: 1 },
      lastActivity: new Date(),
    },
  });
}

/**
 * Get travel progress for a character
 */
export async function getTravelProgress(characterId: string): Promise<{
  inTransit: boolean;
  progress: number;
  timeRemaining: number;
  origin?: number;
  destination?: number;
} | null> {
  const { prisma } = await import('../../db/prisma.js');
  
  const travelState = await prisma.travelState.findUnique({
    where: { characterId },
  });
  
  if (!travelState || !travelState.inTransit) {
    return null;
  }
  
  const now = new Date();
  const totalDuration = travelState.expectedArrival.getTime() - travelState.departureTime.getTime();
  const elapsed = now.getTime() - travelState.departureTime.getTime();
  const progress = Math.min(100, Math.floor((elapsed / totalDuration) * 100));
  const timeRemaining = Math.max(0, Math.floor((travelState.expectedArrival.getTime() - now.getTime()) / 1000));
  
  return {
    inTransit: true,
    progress,
    timeRemaining,
    origin: travelState.originSystem,
    destination: travelState.destinationSystem,
  };
}

// ============================================================================
// LOST IN SPACE
// ============================================================================

/**
 * Register character as lost in space
 * 
 * Original from SP.DAMAGE.S / SP.WARP.S
 */
export async function registerLostInSpace(
  characterId: string,
  location: number
): Promise<void> {
  const { prisma } = await import('../../db/prisma.js');
  
  await prisma.character.update({
    where: { id: characterId },
    data: {
      isLost: true,
      lostLocation: location,
    },
  });
  
  // Create lost ship record
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });
  
  if (character) {
    await prisma.gameLog.create({
      data: {
        type: 'SYSTEM',
        characterId,
        message: `${character.name}'s ship ${character.shipName || 'unnamed'} is LOST IN SPACE near system ${location}`,
        metadata: { location },
      },
    });
  }
}
