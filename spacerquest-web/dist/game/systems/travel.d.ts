/**
 * SpacerQuest v4.0 - Travel System
 *
 * Implements space travel mechanics from original SP.WARP.S and SP.LIFT.S
 * All formulas preserved exactly from the original
 */
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
export declare function calculateFuelCost(driveStrength: number, driveCondition: number, distance: number): number;
/**
 * Calculate fuel cost for course change
 *
 * Original: x=(h1*5) - hull strength × 5
 *
 * @param hullStrength - Hull strength (h1)
 * @returns Fuel units required for course change
 */
export declare function calculateCourseChangeFuel(hullStrength: number): number;
/**
 * Calculate maximum fuel capacity
 *
 * Original: i=(h2+1)*h1: ye=(i*10)
 *
 * @param hullStrength - Hull strength (h1)
 * @param hullCondition - Hull condition (h2)
 * @returns Maximum fuel capacity in units
 */
export declare function calculateFuelCapacity(hullStrength: number, hullCondition: number): number;
/**
 * Check if ship has enough fuel for journey
 */
export declare function hasEnoughFuel(currentFuel: number, requiredFuel: number): {
    hasEnough: boolean;
    deficit: number;
};
/**
 * Calculate travel time in chronos
 *
 * @param distance - Distance in astrecs
 * @returns Travel time in chronos units
 */
export declare function calculateTravelTime(distance: number): number;
/**
 * Calculate expected arrival time
 *
 * @param departureTime - When travel started
 * @param distance - Distance in astrecs
 * @returns Expected arrival Date
 */
export declare function calculateArrivalTime(departureTime: Date, distance: number): Date;
/**
 * Check if player can make another trip today
 *
 * Original: if z1>2 print "Only 3 completed trips allowed per day"
 *
 * @param tripCount - Trips completed today (z1)
 * @param lastTripDate - Date of last trip
 * @returns Whether player can travel
 */
export declare function canTravel(tripCount: number, lastTripDate: Date | null): {
    canTravel: boolean;
    reason?: string;
    remainingTrips: number;
};
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
export declare function validateLaunch(characterId: string, destinationSystemId: number): Promise<LaunchValidationResult>;
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
export declare function processCourseChange(characterId: string, newDestinationId: number, courseChangesRemaining: number): Promise<CourseChangeResult>;
/**
 * Start travel for a character
 */
export declare function startTravel(characterId: string, originSystem: number, destinationSystem: number, fuelReserved: number): Promise<void>;
/**
 * Complete travel for a character
 */
export declare function completeTravel(characterId: string, destinationSystem: number): Promise<void>;
/**
 * Get travel progress for a character
 */
export declare function getTravelProgress(characterId: string): Promise<{
    inTransit: boolean;
    progress: number;
    timeRemaining: number;
    origin?: number;
    destination?: number;
} | null>;
/**
 * Register character as lost in space
 *
 * Original from SP.DAMAGE.S / SP.WARP.S
 */
export declare function registerLostInSpace(characterId: string, location: number): Promise<void>;
//# sourceMappingURL=travel.d.ts.map