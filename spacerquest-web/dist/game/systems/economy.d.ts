/**
 * SpacerQuest v4.0 - Economy System
 *
 * Implements trading, port ownership, and economic mechanics
 * from original SP.REAL.S, SP.LIFT.S, SP.DOCK1.S, SP.DOCK2.S
 */
/**
 * Get fuel price for a system
 *
 * Original: Space Authority default 25 cr, with system variations
 */
export declare function getFuelPrice(systemId: number, portOwnerPrice?: number | null): number;
/**
 * Calculate fuel purchase cost
 */
export declare function calculateFuelBuyCost(units: number, pricePerUnit: number): number;
/**
 * Calculate fuel sale proceeds
 *
 * Original: Second-hand fuel sells at reduced rate
 */
export declare function calculateFuelSaleProceeds(units: number, buyPrice: number): number;
export interface CargoContract {
    pods: number;
    cargoType: number;
    origin: number;
    destination: number;
    payment: number;
    description: string;
}
/**
 * Get cargo description by type
 */
export declare function getCargoDescription(type: number): string;
/**
 * Generate cargo contract
 *
 * Original from SP.DOCK2.S - cargo based on origin system
 */
export declare function generateCargoContract(originSystem: number, cargoPods: number, isSmuggling?: boolean): CargoContract;
/**
 * Calculate cargo delivery payment
 *
 * Original from SP.DOCK1.S:
 *   Validates destination, applies bonus/penalty
 */
export declare function calculateCargoPayment(contract: CargoContract, actualDestination: number): {
    payment: number;
    bonus: number;
    total: number;
    message: string;
};
export interface PortPurchaseResult {
    success: boolean;
    cost: number;
    message: string;
}
/**
 * Calculate port purchase price
 *
 * Original from SP.REAL.S:
 *   Based on system, typically 10,000 cr units (100,000 cr)
 */
export declare function calculatePortPrice(systemId: number): number;
/**
 * Calculate port resale value
 */
export declare function calculatePortResaleValue(purchasePrice: number): number;
/**
 * Purchase space port
 */
export declare function purchasePort(characterId: string, systemId: number, creditsHigh: number, creditsLow: number): Promise<PortPurchaseResult>;
/**
 * Sell space port
 */
export declare function sellPort(characterId: string, systemId: number, creditsHigh: number, creditsLow: number): Promise<{
    success: boolean;
    proceeds: number;
    message: string;
}>;
/**
 * Calculate daily port income
 *
 * Original from SP.LIFT.S:
 *   Landing fees based on hull strength
 */
export declare function calculateLandingFee(hullStrength: number, systemId: number): number;
/**
 * Process port fee collection
 */
export declare function collectPortFees(portId: string, characterId: string, hullStrength: number, systemId: number): Promise<number>;
/**
 * Calculate Space Patrol pay
 *
 * Original from SP.REG.S:
 *   500 cr base + 1000 cr per battle won
 */
export declare function calculatePatrolPay(battlesWon: number): number;
/**
 * Process patrol mission completion
 */
export declare function completePatrolMission(characterId: string, battlesWon: number): Promise<{
    pay: number;
    message: string;
}>;
/**
 * Process rescue service payment
 *
 * Original from SP.REG.S:
 *   1000 cr salvage fee paid to rescuer
 */
export declare function processRescuePayment(rescuerCharacterId: string): Promise<{
    fee: number;
    message: string;
}>;
//# sourceMappingURL=economy.d.ts.map