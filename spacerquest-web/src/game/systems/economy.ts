/**
 * SpacerQuest v4.0 - Economy System
 * 
 * Implements trading, port ownership, and economic mechanics
 * from original SP.REAL.S, SP.LIFT.S, SP.DOCK1.S, SP.DOCK2.S
 */

import {
  CARGO_BASE_RATES,
  CARGO_TYPES,
  CORE_SYSTEM_NAMES,
  CARGO_WRONG_DESTINATION_PENALTY,
  FUEL_DEFAULT_PRICE,
  FUEL_MAX_CAPACITY,
  FUEL_PRICES_BY_SYSTEM,
  FUEL_SELL_DEFAULT_PRICE,
  FUEL_SELL_PRICES_BY_SYSTEM,
  FUEL_SELL_MULTIPLIER,
  FUEL_DEPOT_WHOLESALE_PRICE,
  FUEL_DEPOT_MAX_PRICE,
  FUEL_DEPOT_TRANSFER_MAX,
  PORT_BASE_PRICE,
  PORT_RESALE_MULTIPLIER,
  PATROL_BASE_PAY,
  PATROL_BATTLE_BONUS,
  RIM_CARGO,
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
 * Get fuel sell price for a system (what the port pays the player)
 *
 * SP.LIFT.S seller section:
 *   hf=2 (default)
 *   if sp=8  hf=3  (Mira-9)
 *   if sp=14 hf=4  (Vega-6)
 *   if sp=1  hf=1  (Sun-3)
 *   if sp=13 hf=5  (Spica-3)
 *   if (sc>2) and (fp$<>"") and (m5>2) hf=(m5/2)  (port owner: half their buy price)
 */
export function getFuelSellPrice(systemId: number, portOwnerSellPrice?: number | null): number {
  if (portOwnerSellPrice && portOwnerSellPrice > 0) {
    return portOwnerSellPrice;
  }
  if (systemId in FUEL_SELL_PRICES_BY_SYSTEM) {
    return FUEL_SELL_PRICES_BY_SYSTEM[systemId as keyof typeof FUEL_SELL_PRICES_BY_SYSTEM];
  }
  return FUEL_SELL_DEFAULT_PRICE;
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
 * Legacy function: uses buyPrice × 0.5. Prefer getFuelSellPrice + units for new code.
 */
export function calculateFuelSaleProceeds(units: number, buyPrice: number): number {
  return Math.floor(units * buyPrice * FUEL_SELL_MULTIPLIER);
}

// ============================================================================
// CARGO TRADING
// ============================================================================

export interface CargoContract {
  pods: number;          // q1: pods loaded (from upod calculation)
  cargoType: number;     // q2: cargo type index (1-9)
  origin: number;        // sp: origin system ID
  destination: number;   // q4: destination system ID
  payment: number;       // q5: total payment in credits
  description: string;   // q2$: cargo name string
  fuelRequired: number;  // f2: fuel units required for the trip
  distance: number;      // q6: distance in Astrecs
  valuePerPod: number;   // q3: value per pod (cargoType * 3)
}

/**
 * Get cargo description by type
 * Original: carname subroutine (SP.CARGO.txt lines 313-323)
 * Types 1-9 are from the original game. Type 10 (Contraband) is a modern addition.
 */
export function getCargoDescription(type: number): string {
  return CARGO_TYPES[type] ?? 'Unknown Cargo';
}

/**
 * Get star system name by ID
 * Original: desname subroutine (SP.CARGO.txt lines 325-340)
 * Returns the original BBS system name (e.g. "Deneb-4") for systems 1-14.
 */
export function getSystemName(systemId: number): string {
  return CORE_SYSTEM_NAMES[systemId] ?? `System ${systemId}`;
}

/**
 * Generate cargo contract using the original payment formula.
 *
 * Original: SP.CARGO.txt manif + pay1-pay4 subroutines
 *
 * Key original variables:
 *   v1/v5/y1/y5 = cargo type (1-9, random r=9)
 *   v2/v6/y2/y6 = cargo value per pod = cargoType * 3
 *   v3/v7/y3/y7 = destination system (1-14, random r=14, excludes current)
 *   d6/d7/d8/d9 = distance = |origin - destination|
 *   Payment formula (pay1): v4 = (v2*d6)/3 * upodX + (f2*5) + 1000, cap 15000
 *
 * @param originSystem - current star system ID
 * @param cargoPods    - ship's total cargo pod capacity (s1)
 * @param isSmuggling  - if true, generate Contraband contract (type 10)
 * @param shipStats    - ship component values needed for upod/fcost formulas
 */
export function generateCargoContract(
  originSystem: number,
  cargoPods: number,
  isSmuggling: boolean = false,
  shipStats: {
    hullCondition: number;   // h2: hull condition (0-9)
    driveStrength: number;   // d1: drive strength
    driveCondition: number;  // d2: drive condition (0-9)
  } = { hullCondition: 9, driveStrength: 10, driveCondition: 9 }
): CargoContract {
  // Smuggling: type 10 (Contraband), fixed payment based on old flat rate
  if (isSmuggling) {
    const smugPayment = cargoPods * Number(CARGO_BASE_RATES[1]) * 2;
    let dest = Math.floor(Math.random() * 14) + 1;
    if (dest === originSystem) dest = originSystem < 14 ? dest + 1 : dest - 1;
    const dist = Math.max(1, Math.abs(dest - originSystem));
    return {
      pods: cargoPods,
      cargoType: 10,
      origin: originSystem,
      destination: dest,
      payment: smugPayment,
      description: getCargoDescription(10),
      fuelRequired: 0,
      distance: dist,
      valuePerPod: 0,
    };
  }

  // Random cargo type 1-9 (original: r=9 → random(9) → 1-9)
  const cargoType = Math.floor(Math.random() * 9) + 1;

  // Random destination system 1-14 (original: r=14)
  let destination = Math.floor(Math.random() * 14) + 1;
  // spx: avoid picking current system — if sp<14 add 1, if sp=14 subtract 1
  if (destination === originSystem) {
    if (originSystem < 14) destination += 1;
    else destination -= 1;
  }

  // Distance = |origin - destination|, minimum 1 (original man2)
  const distance = Math.max(1, Math.abs(destination - originSystem));

  const { hullCondition, driveStrength, driveCondition } = shipStats;

  // upod: serviceable pod count = s1 * (h2+1) / 10, minimum 1
  // (Original: y=h2+1; x=s1*y; if x<10 x=10; x=x/10)
  let upodX: number;
  if (cargoPods < 1 || hullCondition < 1) {
    upodX = 1;
  } else {
    const y = hullCondition + 1;
    let rawX = cargoPods * y;
    if (rawX < 10) rawX = 10;
    upodX = Math.floor(rawX / 10);
  }

  // fcost: fuel required for this trip
  // (Original: af=min(d1,21); f2=(21-af)+(10-d2); f2*=dist; ty=f2+10; cap 100; f2=ty/2)
  const af = Math.min(driveStrength, 21);
  let f2 = (21 - af) + (10 - driveCondition);
  if (f2 < 1) f2 = 1;
  f2 = f2 * distance;
  const ty = f2 + 10;
  const fuelRequired = Math.floor(Math.min(ty, 100) / 2);

  // Payment formula (original pay1-pay4):
  //   v2 = cargoType * 3  (value per pod)
  //   v4 = v2 * distance; if v4<3 v4=3; v4=v4/3
  //   v4 = v4 * upodX
  //   v4 = v4 + (f2*5) + 1000; cap 15000
  //   x = v4/s1 (floor); v4 = x * s1  (normalize to pod multiple)
  const valuePerPod = cargoType * 3;
  let payment = valuePerPod * distance;
  if (payment < 3) payment = 3;
  payment = Math.floor(payment / 3);
  payment = payment * upodX;
  payment = payment + (fuelRequired * 5) + 1000;
  if (payment > 15000) payment = 15000;
  if (cargoPods > 0) {
    const perPod = Math.floor(payment / cargoPods);
    payment = perPod * cargoPods;
  }

  return {
    pods: upodX,
    cargoType,
    origin: originSystem,
    destination,
    payment,
    description: getCargoDescription(cargoType),
    fuelRequired,
    distance,
    valuePerPod,
  };
}

/**
 * Calculate cargo delivery payment
 *
 * Original: contract payment (q5) is paid in full at the correct destination.
 * Wrong destination delivers at 50% of stated payment (CARGO_WRONG_DESTINATION_PENALTY).
 * The original has no delivery bonus — the "ie bonus" is added at contract signing,
 * not at delivery.
 */
export function calculateCargoPayment(
  contract: CargoContract,
  actualDestination: number
): { payment: number; bonus: number; total: number; message: string } {
  if (actualDestination === contract.destination) {
    return {
      payment: contract.payment,
      bonus: 0,
      total: contract.payment,
      message: `Cargo delivered successfully to ${getSystemName(contract.destination)}`,
    };
  } else {
    const reduced = Math.floor(contract.payment * CARGO_WRONG_DESTINATION_PENALTY);
    return {
      payment: reduced,
      bonus: 0,
      total: reduced,
      message: `Wrong destination! Expected ${getSystemName(contract.destination)}, got ${getSystemName(actualDestination)}. Payment reduced.`,
    };
  }
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

  // SP.REAL.txt lines 121-122: g1=g1+m7:g2=g2+m8
  // Refund the port's bank balance (bankCreditsHigh/bankCreditsLow) to the player
  const bankBalance = getTotalCredits(port.bankCreditsHigh, port.bankCreditsLow);
  const totalProceeds = resaleValue + bankBalance;

  // Add proceeds + bank balance to character
  const { high: newHigh, low: newLow } = addCredits(creditsHigh, creditsLow, totalProceeds);

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
    proceeds: totalProceeds,
    message: `Port ${systemId} sold for ${resaleValue} cr! Bank balance of ${bankBalance} cr also returned.`,
  };
}

// ============================================================================
// PORT FINANCES
// ============================================================================

/**
 * Calculate rim port docking fee (SP.DOCK2.S:31-44)
 *
 * Original formula:
 *   a=(q4 mod 14): zh=1000
 *   if mp$="]["  zh=zh-100   (full alliance member discount)
 *   if mq$="LSS C" zh=zh-400 (LSS Corps member discount)
 *   x=a*zh
 *
 * @param systemId - Rim star system ID (15-20)
 * @param isAllianceMember - true if player has full alliance membership (mp$="][")
 * @param isLSSDiscount    - true if player is in LSS Corps (mq$="LSS C")
 * @returns Docking fee in credits
 */
export function calculateLandingFee(systemId: number, isAllianceMember: boolean = false, isLSSDiscount: boolean = false): number {
  const a = systemId % 14;
  let zh = 1000;
  if (isAllianceMember) zh -= 100;
  if (isLSSDiscount) zh -= 400;
  return a * zh;
}

/**
 * Calculate fuel sell price at rim star ports (SP.DOCK2.S:229-231)
 *
 * Original:
 *   gf = 25 - q4
 *   if q4=15 gf=5  (special case override)
 *
 * @param systemId - Rim star system ID (15-20)
 * @returns Credits per fuel unit sold
 */
export function getRimFuelSellPrice(systemId: number): number {
  if (systemId === 15) return 5; // Original special case: if q4=15 gf=5
  return 25 - systemId;
}

/**
 * Process port fee collection
 */
export async function collectPortFees(
  portId: string,
  characterId: string,
  systemId: number,
  isAllianceMember: boolean = false,
  isLSSDiscount: boolean = false
): Promise<number> {
  const fee = calculateLandingFee(systemId, isAllianceMember, isLSSDiscount);
  
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
      metadata: { fee, isAllianceMember, isLSSDiscount },
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

// ============================================================================
// FUEL DEPOT (SP.REAL.txt lines 168-230 — port owner fuel operations)
// ============================================================================

export interface DepotSetPriceResult {
  success: boolean;
  newPrice: number;
  message: string;
}

/**
 * Validate fuel depot price.
 * SP.REAL.txt line 184: range 0-50, max 2 digits.
 */
export function validateDepotPrice(price: number): DepotSetPriceResult {
  if (!Number.isInteger(price) || price < 0 || price > FUEL_DEPOT_MAX_PRICE) {
    return { success: false, newPrice: 0, message: `Price must be 0-${FUEL_DEPOT_MAX_PRICE}` };
  }
  return { success: true, newPrice: price, message: `Fuel price set to ${price} cr/unit` };
}

export interface DepotBuyResult {
  success: boolean;
  units: number;
  cost: number;
  newFuelStored: number;
  creditsHigh: number;
  creditsLow: number;
  message: string;
}

/**
 * Calculate wholesale fuel purchase for depot.
 * SP.REAL.txt line 193: 10 cr/unit from Main Port Storage, depot max 20,000.
 */
export function calculateDepotBuy(
  units: number,
  currentStored: number,
  creditsHigh: number,
  creditsLow: number,
): DepotBuyResult {
  const fail = (msg: string) => ({
    success: false, units: 0, cost: 0, newFuelStored: currentStored,
    creditsHigh, creditsLow, message: msg,
  });

  if (!Number.isInteger(units) || units <= 0) return fail('Invalid amount');

  const maxBuyable = FUEL_MAX_CAPACITY - currentStored;
  if (units > maxBuyable) return fail(`20,000 unit limit`);

  const cost = units * FUEL_DEPOT_WHOLESALE_PRICE;
  const sub = subtractCredits(creditsHigh, creditsLow, cost);
  if (!sub.success) return fail('Not enough credits');

  return {
    success: true,
    units,
    cost,
    newFuelStored: currentStored + units,
    creditsHigh: sub.high,
    creditsLow: sub.low,
    message: `${units} units of Fuel transferred from Main Port Storage`,
  };
}

export interface DepotTransferResult {
  success: boolean;
  units: number;
  newFuelStored: number;
  newShipFuel: number;
  message: string;
}

/**
 * Calculate fuel transfer from ship to depot.
 * SP.REAL.txt line 225: max 2900 per transfer, depot max 20,000, must be docked.
 */
export function calculateDepotTransfer(
  units: number,
  shipFuel: number,
  currentStored: number,
): DepotTransferResult {
  const fail = (msg: string) => ({
    success: false, units: 0, newFuelStored: currentStored,
    newShipFuel: shipFuel, message: msg,
  });

  if (!Number.isInteger(units) || units <= 0) return fail('Invalid amount');
  if (units > shipFuel) return fail('Not enough ship fuel');
  if (units > FUEL_DEPOT_TRANSFER_MAX) return fail(`Max transfer is ${FUEL_DEPOT_TRANSFER_MAX} units`);
  if (currentStored + units > FUEL_MAX_CAPACITY) return fail('20,000 unit limit');

  return {
    success: true,
    units,
    newFuelStored: currentStored + units,
    newShipFuel: shipFuel - units,
    message: `${units} units of Fuel transferred`,
  };
}

// ============================================================================
// RIM PORT CARGO (SP.DOCK2.S:90-116 + carname:336-343)
// ============================================================================

/**
 * Calculate rim port cargo delivery payment.
 *
 * Original SP.DOCK2.S:90-103 (ridk → parv → payment loop):
 *   if q5<2 q5=2
 *   gosub upod → recalculate serviceable pods
 *   if q1<=s1 goto parv
 *   if (q5>q1) and (q1>0) x=(q5/q1): q5=x*s1
 *   a=1: if q4>14 a=(q4-14)        ← rim multiplier (1-6)
 *   y=1: if q5>1 y=(q5/2)          ← half payment per iteration
 *   for k=1 to a: ib=ib+y: next    ← accumulate total
 *
 * @param systemId      - Rim system ID (15-20)
 * @param cargoPayment  - Original cargo payment (q5) from the contract
 * @param cargoPods     - Ship's total cargo pods (s1)
 * @param hullCondition - Hull condition (h2, 0-9)
 */
export function calculateRimCargoPayment(
  systemId: number,
  cargoPayment: number,
  cargoPods: number,
  hullCondition: number,
): { payment: number } {
  let q5 = cargoPayment;
  if (q5 < 2) q5 = 2;

  // upod: serviceable pod count = (h2+1)*cargoPods/10
  let upod = cargoPods;
  if (cargoPods > 0 && hullCondition >= 0) {
    const raw = cargoPods * (hullCondition + 1);
    upod = Math.floor(Math.max(raw, 10) / 10);
  }

  // Adjust payment if pods degraded (SP.DOCK2.S:94-95)
  if (upod <= cargoPods) {
    // parv path — no adjustment needed when pods OK
  }
  if (q5 > cargoPods && cargoPods > 0) {
    const x = Math.floor(q5 / cargoPods);
    q5 = x * upod;
  }

  // Rim multiplier: a = systemId - 14 (1 for system 15, 6 for system 20)
  const a = Math.max(1, systemId - 14);

  // Per-iteration payment
  const y = q5 > 1 ? Math.floor(q5 / 2) : 1;

  // Payment loop: total = a * y
  const payment = a * y;

  return { payment };
}

/**
 * Load rim cargo onto ship.
 *
 * Original SP.DOCK2.S:110-116 + carname (336-343):
 *   a=1: if s2>10 a=(s2/10)   ← s2 is total credits (creditsLow proxy)
 *   if a>300 a=300
 *   x=0: if s1>10 x=(s1/10): if x>9 x=9
 *   q5=a*x: if q5<1 q5=0
 *   gosub carname              ← apply name + multiplier
 *   q1=s1                      ← pods loaded = total pods
 *   q2=20                      ← cargo type = rim cargo sentinel
 *
 * @param systemId   - Rim system ID (15-20)
 * @param cargoPods  - Ship's total cargo pods (s1)
 * @param creditsHigh - Player's credits high (g1, units of 10,000)
 * @param creditsLow  - Player's credits low  (g2)
 */
export function loadRimCargo(
  systemId: number,
  cargoPods: number,
  creditsHigh: number,
  creditsLow: number,
): { cargoName: string; payment: number; pods: number; destination: number } | null {
  if (cargoPods < 1) return null;

  const rimCargo = RIM_CARGO[systemId];
  if (!rimCargo) return null;

  // s2 in the original is creditsLow (the low-order credit value)
  let a = 1;
  if (creditsLow > 10) a = Math.floor(creditsLow / 10);
  if (a > 300) a = 300;

  let x = 0;
  if (cargoPods > 10) {
    x = Math.floor(cargoPods / 10);
    if (x > 9) x = 9;
  }

  let q5 = a * x;
  if (q5 < 1) q5 = 0;

  // Apply rim cargo multiplier (carname subroutine)
  q5 = q5 * rimCargo.multiplier;

  return {
    cargoName: rimCargo.name,
    payment: q5,
    pods: cargoPods,
    destination: 20, // q2=20: rim cargo sentinel — delivered at any core port
  };
}

/**
 * Calculate trip counter zero cost at Algol-2.
 *
 * Original SP.DOCK2.S:189-191:
 *   y=(w1+p1+d1+h1+n1)
 *   if y>9 y=(y/10)
 *   cost = y * 10,000
 *
 * @param ship - Ship stats with relevant strength values
 */
export function calculateTripZeroCost(ship: {
  weaponStrength: number;
  shieldStrength: number;
  driveStrength: number;
  hullStrength: number;
  navigationStrength: number;
}): { cost: number; costDisplay: number } {
  let y = ship.weaponStrength + ship.shieldStrength + ship.driveStrength +
          ship.hullStrength + ship.navigationStrength;
  if (y > 9) y = Math.floor(y / 10);
  return { cost: y * 10000, costDisplay: y };
}
