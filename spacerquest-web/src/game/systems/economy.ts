/**
 * SpacerQuest v4.0 - Economy System
 * 
 * Implements trading, port ownership, and economic mechanics
 * from original SP.REAL.S, SP.LIFT.S, SP.DOCK1.S, SP.DOCK2.S
 */

import {
  CARGO_BASE_RATES,
  CARGO_WRONG_DESTINATION_PENALTY,
  FUEL_DEFAULT_PRICE,
  FUEL_PRICES_BY_SYSTEM,
  FUEL_SELL_MULTIPLIER,
  PORT_BASE_PRICE,
  PORT_RESALE_MULTIPLIER,
  PATROL_BASE_PAY,
  PATROL_BATTLE_BONUS,
} from '../constants';
import { addCredits, subtractCredits, getTotalCredits } from '../utils.js';
import { prisma } from '../../db/prisma.js';

// ============================================================================
// FUEL ECONOMY
// ============================================================================

/**
 * Get fuel price for a system
 * 
 * Original: Space Authority default 25 cr, with system variations
 */
export function getFuelPrice(systemId: number, portOwnerPrice?: number | null): number {
  // Port owner can set custom price
  if (portOwnerPrice && portOwnerPrice > 0) {
    return portOwnerPrice;
  }
  
  // System-specific prices
  if (systemId in FUEL_PRICES_BY_SYSTEM) {
    return FUEL_PRICES_BY_SYSTEM[systemId as keyof typeof FUEL_PRICES_BY_SYSTEM];
  }
  
  // Default Space Authority price
  return FUEL_DEFAULT_PRICE;
}

/**
 * Calculate fuel purchase cost
 */
export function calculateFuelBuyCost(units: number, pricePerUnit: number): number {
  return units * pricePerUnit;
}

/**
 * Calculate fuel sale proceeds
 * 
 * Original: Second-hand fuel sells at reduced rate
 */
export function calculateFuelSaleProceeds(units: number, buyPrice: number): number {
  return Math.floor(units * buyPrice * FUEL_SELL_MULTIPLIER);
}

// ============================================================================
// CARGO TRADING
// ============================================================================

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
export function getCargoDescription(type: number): string {
  const descriptions: Record<number, string> = {
    1: 'Titanium Ore',
    2: 'Capellan Herbals',
    3: 'Raw Dilithium',
    4: 'Mizarian Liquor',
    5: 'Achernarian Gems',
    6: 'Algolian RDNA',
    10: 'Contraband',
    20: 'Corporate Cargo',
  };
  return descriptions[type] || 'Unknown Cargo';
}

/**
 * Generate cargo contract
 * 
 * Original from SP.DOCK2.S - cargo based on origin system
 */
export function generateCargoContract(
  originSystem: number,
  cargoPods: number,
  isSmuggling: boolean = false
): CargoContract {
  // Determine cargo type based on origin
  let cargoType = 1;
  let baseRate = Number(CARGO_BASE_RATES[1 as keyof typeof CARGO_BASE_RATES]);

  if (originSystem >= 15 && originSystem <= 20) {
    // Rim Stars have special cargo
    const rimCargo: Record<number, { type: number; rate: number }> = {
      15: { type: 1, rate: 1000 },
      16: { type: 2, rate: 2000 },
      17: { type: 3, rate: 3000 },
      18: { type: 4, rate: 4000 },
      19: { type: 5, rate: 5000 },
      20: { type: 6, rate: 6000 },
    };
    const cargo = rimCargo[originSystem];
    if (cargo) {
      cargoType = cargo.type;
      baseRate = cargo.rate;
    }
  }

  if (isSmuggling) {
    cargoType = 10;
    baseRate = Math.floor(baseRate * 1.5); // Smuggling pays 50% more
  }
  
  // Calculate payment
  const payment = cargoPods * baseRate;
  
  // Random destination (not origin)
  let destination = Math.floor(Math.random() * 14) + 1;
  if (destination === originSystem) {
    destination = (destination % 14) + 1;
  }
  
  return {
    pods: cargoPods,
    cargoType,
    origin: originSystem,
    destination,
    payment,
    description: getCargoDescription(cargoType),
  };
}

/**
 * Calculate cargo delivery payment
 * 
 * Original from SP.DOCK1.S:
 *   Validates destination, applies bonus/penalty
 */
export function calculateCargoPayment(
  contract: CargoContract,
  actualDestination: number
): { payment: number; bonus: number; total: number; message: string } {
  let payment = contract.payment;
  let bonus = 0;
  let message = '';
  
  // Check if destination is correct
  if (actualDestination === contract.destination) {
    // Correct destination - full pay
    message = `Cargo delivered successfully to ${contract.destination}`;
    
    // Bonus for correct destination
    bonus = Math.floor(payment * 0.1); // 10% bonus
    payment += bonus;
  } else {
    // Wrong destination - penalty
    payment = Math.floor(payment * CARGO_WRONG_DESTINATION_PENALTY);
    message = `Wrong destination! Expected ${contract.destination}, got ${actualDestination}. Payment reduced.`;
  }
  
  return {
    payment,
    bonus,
    total: payment,
    message,
  };
}

// ============================================================================
// PORT OWNERSHIP
// ============================================================================

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
export function calculatePortPrice(_systemId: number): number {
  // Base price for all systems
  return PORT_BASE_PRICE;
}

/**
 * Calculate port resale value
 */
export function calculatePortResaleValue(purchasePrice: number): number {
  return Math.floor(purchasePrice * PORT_RESALE_MULTIPLIER);
}

/**
 * Purchase space port
 */
export async function purchasePort(
  characterId: string,
  systemId: number,
  creditsHigh: number,
  creditsLow: number
): Promise<PortPurchaseResult> {
  // Check if already owned
  const existingPort = await prisma.portOwnership.findUnique({
    where: { systemId },
  });
  
  if (existingPort) {
    return {
      success: false,
      cost: 0,
      message: `${systemId} is already owned!`,
    };
  }
  
  const price = calculatePortPrice(systemId);
  const totalCredits = getTotalCredits(creditsHigh, creditsLow);
  
  if (totalCredits < price) {
    return {
      success: false,
      cost: price,
      message: `Not enough credits! Port costs ${price} cr`,
    };
  }
  
  // Deduct credits
  const { high: newHigh, low: newLow } = subtractCredits(creditsHigh, creditsLow, price);
  
  // Create port ownership
  await prisma.portOwnership.create({
    data: {
      characterId,
      systemId,
      fuelPrice: FUEL_DEFAULT_PRICE,
      fuelStored: 3000,
      fuelCapacity: 20000,
      bankCreditsHigh: 0,
      bankCreditsLow: 0,
      defconLevel: 0,
    },
  });
  
  // Update character credits
  await prisma.character.update({
    where: { id: characterId },
    data: {
      creditsHigh: newHigh,
      creditsLow: newLow,
    },
  });
  
  // Log the purchase
  await prisma.gameLog.create({
    data: {
      type: 'TRADE',
      characterId,
      systemId,
      message: `Purchased space port at system ${systemId} for ${price} cr`,
    },
  });
  
  return {
    success: true,
    cost: price,
    message: `Port ${systemId} purchased for ${price} cr!`,
  };
}

/**
 * Sell space port
 */
export async function sellPort(
  characterId: string,
  systemId: number,
  creditsHigh: number,
  creditsLow: number
): Promise<{ success: boolean; proceeds: number; message: string }> {
  const port = await prisma.portOwnership.findUnique({
    where: { systemId },
  });
  
  if (!port || port.characterId !== characterId) {
    return {
      success: false,
      proceeds: 0,
      message: 'You do not own this port!',
    };
  }
  
  const resaleValue = calculatePortResaleValue(PORT_BASE_PRICE);
  
  // Add credits
  const { high: newHigh, low: newLow } = addCredits(creditsHigh, creditsLow, resaleValue);
  
  // Delete port ownership
  await prisma.portOwnership.delete({
    where: { id: port.id },
  });
  
  // Update character
  await prisma.character.update({
    where: { id: characterId },
    data: {
      creditsHigh: newHigh,
      creditsLow: newLow,
    },
  });
  
  return {
    success: true,
    proceeds: resaleValue,
    message: `Port ${systemId} sold for ${resaleValue} cr!`,
  };
}

// ============================================================================
// PORT FINANCES
// ============================================================================

/**
 * Calculate daily port income
 * 
 * Original from SP.LIFT.S:
 *   Landing fees based on hull strength
 */
export function calculateLandingFee(hullStrength: number, systemId: number): number {
  const baseFee = (hullStrength * 10) + ((15 - systemId) * 10);
  return Math.max(10, baseFee);
}

/**
 * Process port fee collection
 */
export async function collectPortFees(
  portId: string,
  characterId: string,
  hullStrength: number,
  systemId: number
): Promise<number> {
  const fee = calculateLandingFee(hullStrength, systemId);
  
  // Add to port bank
  const port = await prisma.portOwnership.findUnique({
    where: { id: portId },
  });
  
  if (!port) return 0;
  
  const { high: newHigh, low: newLow } = addCredits(
    port.bankCreditsHigh,
    port.bankCreditsLow,
    fee
  );
  
  await prisma.portOwnership.update({
    where: { id: portId },
    data: {
      bankCreditsHigh: newHigh,
      bankCreditsLow: newLow,
      dailyLandingFees: { increment: fee },
      lastFeeCollection: new Date(),
    },
  });
  
  // Log the fee
  await prisma.gameLog.create({
    data: {
      type: 'PORT_FEE',
      characterId,
      systemId,
      message: `Port fee collected: ${fee} cr from landing at system ${systemId}`,
      metadata: { fee, hullStrength },
    },
  });
  
  return fee;
}

// ============================================================================
// PATROL PAY
// ============================================================================

/**
 * Calculate Space Patrol pay
 * 
 * Original from SP.REG.S:
 *   500 cr base + 1000 cr per battle won
 */
export function calculatePatrolPay(battlesWon: number): number {
  return PATROL_BASE_PAY + (battlesWon * PATROL_BATTLE_BONUS);
}

/**
 * Process patrol mission completion
 */
export async function completePatrolMission(
  characterId: string,
  battlesWon: number
): Promise<{ pay: number; message: string }> {
  const pay = calculatePatrolPay(battlesWon);
  
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });
  
  if (!character) {
    return { pay: 0, message: 'Character not found' };
  }
  
  // Add credits
  const { high: newHigh, low: newLow } = addCredits(
    character.creditsHigh,
    character.creditsLow,
    pay
  );
  
  await prisma.character.update({
    where: { id: characterId },
    data: {
      creditsHigh: newHigh,
      creditsLow: newLow,
      missionType: 0, // Clear mission
      cargoPods: 0,
      cargoType: 0,
      cargoPayment: 0,
    },
  });
  
  return {
    pay,
    message: `Patrol mission complete! Pay: ${pay} cr (${PATROL_BASE_PAY} base + ${battlesWon * PATROL_BATTLE_BONUS} bonus)`,
  };
}

// ============================================================================
// RESCUE SERVICE
// ============================================================================

/**
 * Process rescue service payment
 * 
 * Original from SP.REG.S:
 *   1000 cr salvage fee paid to rescuer
 */
export async function processRescuePayment(
  rescuerCharacterId: string
): Promise<{ fee: number; message: string }> {
  const fee = 1000; // Fixed rescue fee
  
  const character = await prisma.character.findUnique({
    where: { id: rescuerCharacterId },
  });
  
  if (!character) {
    return { fee: 0, message: 'Character not found' };
  }
  
  // Add credits
  const { high: newHigh, low: newLow } = addCredits(
    character.creditsHigh,
    character.creditsLow,
    fee
  );
  
  await prisma.character.update({
    where: { id: rescuerCharacterId },
    data: {
      creditsHigh: newHigh,
      creditsLow: newLow,
      rescuesPerformed: { increment: 1 },
    },
  });
  
  return {
    fee,
    message: `Rescue successful! Salvage fee: ${fee} cr`,
  };
}
