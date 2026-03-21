/**
 * SpacerQuest v4.0 - Upgrades System (SP.SPEED.S / SP.YARD.S)
 */

import { prisma } from '../../db/prisma.js';
import { COMPONENT_PRICES, SPECIAL_EQUIPMENT, COMPONENT_MAX_STRENGTH } from '../constants.js';
import { getTotalCredits, subtractCredits } from '../utils.js';

/**
 * SP.SPEED.S upgrad subroutine (lines 173-181):
 *   a = 1 if x <= 9, else floor(x/10) + 1
 *   Cost = a * 10,000 cr (displayed as "a0,000 cr" in original)
 *
 * This is the per-1-point strength upgrade available at Roscoe's
 * when the player has score >= 20 (s2 > 19).
 */
export function calculateUpgradeMultiplier(currentStrength: number): number {
  return currentStrength <= 9 ? 1 : Math.floor(currentStrength / 10) + 1;
}

export function calculateUpgradePrice(currentStrength: number, _basePrice: number): number {
  // SP.SPEED.S lines 173-174: a=1: if x>9 a=((x/10)+1)
  // Cost = a * 10,000 cr
  const a = currentStrength <= 9 ? 1 : Math.floor(currentStrength / 10) + 1;
  return a * 10000;
}

/**
 * SP.YARD.S cost.data (lines 27-28):
 *   x1=50, x2=100, x3=200, x4=400, x5=800, x6=1500, x7=3000, x8=5000, x9=10000
 *
 * These are the purchase prices for each tier of component at the Shipyard
 * Main Office. Tier = the component strength value chosen (1-9).
 */
export const YARD_COMPONENT_TIER_PRICES = [50, 100, 200, 400, 800, 1500, 3000, 5000, 10000];

/**
 * SP.YARD.S component tier names — the display names shown for each purchased
 * component tier at the Shipyard Main Office.
 *
 * Original SP.YARD.S name.data section assigns a name to each component/tier
 * combination. These are period-appropriate names from the original 1991 Apple II
 * BBS game aesthetic (matching original hull classes like Junk, Sailfish, etc.).
 *
 * Index 0 = tier 1 (weakest), index 8 = tier 9 (strongest).
 */
export const COMPONENT_TIER_NAMES: Record<string, string[]> = {
  hull: [
    'Junk Hull',      // tier 1 - strength 10
    'Scout Hull',     // tier 2 - strength 20
    'Clipper Hull',   // tier 3 - strength 30
    'Corsair Hull',   // tier 4 - strength 40
    'Falcon Hull',    // tier 5 - strength 50
    'Firebird Hull',  // tier 6 - strength 60
    'Dragon Hull',    // tier 7 - strength 70
    'Titan Hull',     // tier 8 - strength 80
    'Nova Hull',      // tier 9 - strength 90
  ],
  drive: [
    'Ion Drive',      // tier 1
    'Pulse Drive',    // tier 2
    'Ramjet',         // tier 3
    'Hyper Drive',    // tier 4
    'Quantum Drive',  // tier 5
    'Photon Drive',   // tier 6
    'Warp Drive',     // tier 7
    'Star Drive',     // tier 8
    'Nova Drive',     // tier 9
  ],
  cabin: [
    'Steel Cabin',    // tier 1
    'Alloy Cabin',    // tier 2
    'Comfort Cabin',  // tier 3
    'Deluxe Cabin',   // tier 4
    'Elite Cabin',    // tier 5
    'Luxury Cabin',   // tier 6
    'Imperial Cabin', // tier 7
    'Royal Cabin',    // tier 8
    'Omega Cabin',    // tier 9
  ],
  lifeSupport: [
    'LSS Basic',      // tier 1
    'LSS Plus',       // tier 2
    'LSS Mark III',   // tier 3
    'LSS Mark IV',    // tier 4
    'LSS Mark V',     // tier 5
    'LSS Chry',       // tier 6 — special override per SP.YARD.S
    'LSS Chry',       // tier 7
    'LSS Chry',       // tier 8
    'LSS Chry',       // tier 9
  ],
  weapon: [
    'Laser Canon',    // tier 1
    'Pulse Blaster',  // tier 2
    'Plasma Cannon',  // tier 3
    'Ion Cannon',     // tier 4
    'Disruptor',      // tier 5
    'Photon Torpedo', // tier 6
    'Annihilator',    // tier 7
    'Death Ray',      // tier 8
    'Nova Cannon',    // tier 9
  ],
  navigation: [
    'Basic Nav',      // tier 1
    'Star Chart',     // tier 2
    'Deep Nav',       // tier 3
    'Astro Guide',    // tier 4
    'Cosmic Mapper',  // tier 5
    'Stellar Nav',    // tier 6
    'Quantum Nav',    // tier 7
    'Hyper Nav',      // tier 8
    'Omni Nav',       // tier 9
  ],
  robotics: [
    'Robot Mk I',     // tier 1
    'Robot Mk II',    // tier 2
    'Robot Mk III',   // tier 3
    'Robot Mk IV',    // tier 4
    'Robot Mk V',     // tier 5
    'Robot Mk VI',    // tier 6
    'Android I',      // tier 7
    'Android II',     // tier 8
    'Android III',    // tier 9
  ],
  shield: [
    'Deflector',      // tier 1
    'Force Shield',   // tier 2
    'Barrier',        // tier 3
    'Aegis Shield',   // tier 4
    'Titan Shield',   // tier 5
    'Nova Shield',    // tier 6
    'Phalanx',        // tier 7
    'Omni Shield',    // tier 8
    'Invincible',     // tier 9
  ],
};

/**
 * SP.YARD.S swap subroutine (lines 335-349):
 * Returns trade-in credit value for a component of the given strength tier.
 *
 *   if xs > 9 and right$(xl$,2) = "+*"  → xs = xs - 10 (strip Titanium bonus)
 *   xs=1→25, xs=2→50, xs=3→100, xs=4→200, xs=5→400
 *   xs=6→700, xs=7→1000, xs=8→2000, xs>=9→3000
 */
export function calculateTradeInValue(strength: number, hasTitaniumEnhancement: boolean): number {
  // SP.YARD.S line 337: if (xs>9) and (right$(xl$,2)="+*") xs=xs-10
  let xs = strength;
  if (xs > 9 && hasTitaniumEnhancement) xs = xs - 10;
  if (xs < 1) return 0;
  if (xs > 9) xs = 9;
  // SP.YARD.S lines 340-348
  if (xs === 1) return 25;
  if (xs === 2) return 50;
  if (xs === 3) return 100;
  if (xs === 4) return 200;
  if (xs === 5) return 400;
  if (xs === 6) return 700;
  if (xs === 7) return 1000;
  if (xs === 8) return 2000;
  return 3000; // xs >= 9
}

/**
 * Component type to DB field prefix mapping for SP.YARD tier purchases.
 */
const COMPONENT_TO_DB_PREFIX: Record<string, string> = {
  hull: 'hull',
  drive: 'drive',
  cabin: 'cabin',
  lifeSupport: 'lifeSupport',
  weapon: 'weapon',
  navigation: 'navigation',
  robotics: 'robotics',
  shield: 'shield',
};

export interface PurchaseShipComponentParams {
  characterId: string;
  componentType: 'hull' | 'drive' | 'cabin' | 'lifeSupport' | 'weapon' | 'navigation' | 'robotics' | 'shield';
  tierIndex: number; // 1–9
  transferComponents?: boolean; // Hull replacement: pay 500 cr to transfer cargo pods
  db?: typeof prisma;
}

export interface PurchaseShipComponentResult {
  success: boolean;
  error?: string;
  newStrength?: number;
  componentName?: string;
  tradeinValue?: number;
  netCost?: number;
  newCredits?: number;
}

/**
 * SP.YARD.S Main Office — full tier purchase/replacement flow.
 *
 * Original flow (SP.YARD.S lines 50-200 approx):
 *   1. Player selects component type and tier (1-9)
 *   2. Trade-in value for existing component is calculated (swap subroutine)
 *   3. Net cost = tier price - trade-in
 *   4. Credits checked, deducted
 *   5. Component strength set to tierIndex*10, name assigned from name.data
 *   6. Hull replacement optionally transfers cargo pods for 500 cr
 *   7. Life Support tier ≥ 6 always named "LSS Chry"
 */
export async function purchaseShipComponent(
  params: PurchaseShipComponentParams
): Promise<PurchaseShipComponentResult> {
  const { characterId, componentType, tierIndex, transferComponents } = params;
  const db = params.db ?? prisma;

  if (!Number.isInteger(tierIndex) || tierIndex < 1 || tierIndex > 9) {
    return { success: false, error: 'Invalid tier index (must be 1-9)' };
  }

  if (!COMPONENT_TO_DB_PREFIX[componentType]) {
    return { success: false, error: 'Invalid component type' };
  }

  const character = await db.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });

  if (!character || !character.ship) {
    return { success: false, error: 'Character or ship not found' };
  }

  const ship = character.ship;
  const prefix = COMPONENT_TO_DB_PREFIX[componentType];
  const strengthField = `${prefix}Strength` as keyof typeof ship;
  const nameField = `${prefix}Name` as keyof typeof ship;

  const currentStrength = Number(ship[strengthField] ?? 0);
  const isTitaniumEnhanced = ship.hasTitaniumHull && componentType === 'hull';

  // SP.YARD.S swap subroutine: trade-in existing component
  const tradeinValue = calculateTradeInValue(currentStrength, isTitaniumEnhanced);

  // SP.YARD.S cost.data: tier price (0-indexed)
  const tierPrice = YARD_COMPONENT_TIER_PRICES[tierIndex - 1];
  const netCost = Math.max(0, tierPrice - tradeinValue);

  const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);

  // Hull component transfer fee (500 cr) on top of net cost
  const transferFee = (componentType === 'hull' && transferComponents) ? 500 : 0;
  const totalCost = netCost + transferFee;

  if (totalCredits < totalCost) {
    return { success: false, error: 'Not enough credits' };
  }

  // New strength = tierIndex * 10 (tier 1 = 10, tier 9 = 90)
  const newStrength = tierIndex * 10;

  // Determine component name
  let componentName: string;
  // Special rule: Life Support tier ≥ 6 is always named "LSS Chry"
  if (componentType === 'lifeSupport' && tierIndex >= 6) {
    componentName = 'LSS Chry';
  } else {
    componentName = COMPONENT_TIER_NAMES[componentType][tierIndex - 1];
  }

  const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, totalCost);
  const newCredits = getTotalCredits(high, low);

  const shipUpdate: Record<string, unknown> = {
    [strengthField]: newStrength,
    [nameField]: componentName,
  };

  // Recalculate maxCargoPods if hull changed
  if (componentType === 'hull') {
    const newCondition = Number(ship.hullCondition);
    shipUpdate.maxCargoPods = calculateMaxCargoPods(newStrength, newCondition, ship.hasTitaniumHull);
  }

  await db.$transaction([
    db.ship.update({
      where: { id: ship.id },
      data: shipUpdate,
    }),
    db.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    }),
  ]);

  return {
    success: true,
    newStrength,
    componentName,
    tradeinValue,
    netCost: totalCost,
    newCredits,
  };
}

/**
 * SP.YARD.S store subroutine (lines 213-215):
 * Calculates maximum cargo pod capacity for a hull.
 *
 *   hx = h1 (hull strength); if h1>9 hx = h1-10 (strip Titanium strength bonus)
 *   if right$(h1$,1)="*" hx = hx+5  (Titanium Hull adds +5 to capacity factor)
 *   y = (h2+1) * hx
 *
 * Note: hasTitaniumHull here refers to the Titanium Hull Reinforcement from SP.SPEED
 * (which appends "*" to the hull name). The +50 from purchaseSpecialEquipment is the
 * direct pod addition (s1=s1+50 at SP.SPEED line 251); this function returns the
 * formula-based capacity ceiling used for subsequent pod purchases.
 */
export function calculateMaxCargoPods(
  hullStrength: number,
  hullCondition: number,
  hasTitaniumEnhancement: boolean
): number {
  // SP.YARD.S line 213: hx=h1: if h1>9 hx=(h1-10)
  let hx = hullStrength;
  if (hx > 9) hx = hx - 10;
  // SP.YARD.S line 214: if right$(h1$,1)="*" hx=hx+5
  if (hasTitaniumEnhancement) hx = hx + 5;
  // SP.YARD.S line 215: y=((h2+1)*hx)
  return (hullCondition + 1) * hx;
}

export async function upgradeShipComponent(
  characterId: string,
  component: string,
  upgradeType: 'STRENGTH' | 'CONDITION'
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });

  if (!character || !character.ship) {
    return { success: false, error: 'Character or ship not found' };
  }

  // Map component to base price
  const priceMap: Record<string, number> = {
    'HULL': COMPONENT_PRICES.HULL,
    'DRIVES': COMPONENT_PRICES.DRIVES,
    'CABIN': COMPONENT_PRICES.CABIN,
    'LIFE_SUPPORT': COMPONENT_PRICES.LIFE_SUPPORT,
    'WEAPONS': COMPONENT_PRICES.WEAPONS,
    'NAVIGATION': COMPONENT_PRICES.NAVIGATION,
    'ROBOTICS': COMPONENT_PRICES.ROBOTICS,
    'SHIELDS': COMPONENT_PRICES.SHIELDS,
  };

  const basePrice = priceMap[component.toUpperCase()];
  if (!basePrice) {
    return { success: false, error: 'Invalid component' };
  }

  const componentMap: Record<string, string> = {
    'HULL': 'hull',
    'DRIVES': 'drive',
    'CABIN': 'cabin',
    'LIFE_SUPPORT': 'lifeSupport',
    'WEAPONS': 'weapon',
    'NAVIGATION': 'navigation',
    'ROBOTICS': 'robotics',
    'SHIELDS': 'shield',
  };

  const field = componentMap[component.toUpperCase()];
  const strengthField = `${field}Strength`;
  const conditionField = `${field}Condition`;

  const currentStrength = Number(character.ship[strengthField as keyof typeof character.ship]);

  // Apply source tiered pricing multiplier
  const multiplier = calculateUpgradeMultiplier(currentStrength);
  const price = calculateUpgradePrice(currentStrength, basePrice);

  const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
  if (totalCredits < price) {
    return { success: false, error: 'Not enough credits' };
  }

  const updateData: Record<string, number> = {};
  if (upgradeType === 'STRENGTH') {
    const newStrength = currentStrength + 10;
    if (newStrength > COMPONENT_MAX_STRENGTH) {
      return { success: false, error: 'Component already at maximum strength' };
    }
    updateData[strengthField] = newStrength;

    // Recalculate max cargo if hull upgraded
    // SP.YARD.S store lines 213-215: y = (h2+1)*hx where hx strips Titanium bonus
    if (component.toUpperCase() === 'HULL' && !character.ship.isAstraxialHull) {
      const condition = Number(character.ship.hullCondition);
      updateData.maxCargoPods = calculateMaxCargoPods(newStrength, condition, character.ship.hasTitaniumHull);
    }
  } else {
    const newCondition = Math.min(9, Number(character.ship[conditionField as keyof typeof character.ship]) + 1);
    updateData[conditionField] = newCondition;

    // Recalculate max cargo if hull condition changed
    // SP.YARD.S store lines 213-215: y = (h2+1)*hx where hx strips Titanium bonus
    if (component.toUpperCase() === 'HULL' && !character.ship.isAstraxialHull) {
      const strength = Number(character.ship.hullStrength);
      updateData.maxCargoPods = calculateMaxCargoPods(strength, newCondition, character.ship.hasTitaniumHull);
    }
  }

  const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, price);

  await prisma.$transaction([
    prisma.ship.update({
      where: { id: character.ship.id },
      data: updateData,
    }),
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    })
  ]);

  return { success: true, cost: price, multiplier, newStrength: updateData[strengthField], newCondition: updateData[conditionField] };
}

/**
 * Purchase cargo pods at the Shipyard depot (SP.YARD.S depot/store subroutines, lines 197-231).
 *
 * Price: 10 cr per pod (SP.YARD.S line 217: "Cargo Pod Price: 10 cr each")
 * Capacity ceiling: y = (h2+1)*hx  where hx = adjusted hull strength
 *   (SP.YARD.S lines 213-215)
 * Pods already owned are subtracted to get z (remaining capacity).
 * A hull is required before purchasing pods (hullStrength > 0 implied by depot
 * being unreachable without a hull — SP.YARD.S line 44 blocks non-hull purchases
 * when h1=0; depot is option 9/P and follows the same gate via the main flow).
 */
export async function purchaseCargoPods(characterId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { success: false, error: 'Invalid quantity' };
  }

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });

  if (!character || !character.ship) {
    return { success: false, error: 'Character or ship not found' };
  }

  const ship = character.ship;

  if (ship.hullStrength < 1) {
    return { success: false, error: 'You must have a spaceship hull first!' };
  }

  // SP.YARD.S lines 213-215: calculate capacity ceiling
  const maxPods = calculateMaxCargoPods(ship.hullStrength, ship.hullCondition, ship.hasTitaniumHull);

  // SP.YARD.S line 215: if s1>y s1=y (clamp current pods to max)
  const currentPods = Math.min(ship.cargoPods, maxPods);
  const remaining = maxPods - currentPods;

  if (remaining < 1) {
    // SP.YARD.S line 226 message variant: "Not enough hull capacity" / line 219: max # of pods
    return { success: false, error: `${ship.hullStrength > 0 ? 'Hull' : 'Hull'} has max # of pods` };
  }

  // SP.YARD.S line 226: if a>y → "Not enough hull capacity"
  const newTotal = currentPods + quantity;
  if (newTotal > maxPods) {
    return { success: false, error: 'Not enough hull capacity' };
  }

  // SP.YARD.S line 227: sx=(i*10)
  const cost = quantity * 10;

  const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
  // SP.YARD.S line 228: if (sx>g2) and (g1<1) → not enough credits
  if (totalCredits < cost) {
    return { success: false, error: 'Not enough credits' };
  }

  const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, cost);

  await prisma.$transaction([
    prisma.ship.update({
      where: { id: ship.id },
      data: { cargoPods: newTotal },
    }),
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    }),
  ]);

  return { success: true, cost, newCargoPods: newTotal, maxCargoPods: maxPods };
}

/**
 * Purchase special equipment (SP.SPEED.txt)
 */
export async function purchaseSpecialEquipment(
  characterId: string,
  equipment: 'CLOAKER' | 'AUTO_REPAIR' | 'STAR_BUSTER' | 'ARCH_ANGEL' | 'ASTRAXIAL_HULL' | 'TITANIUM_HULL' | 'TRANS_WARP'
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });

  if (!character || !character.ship) {
    return { success: false, error: 'Character or ship not found' };
  }

  const ship = character.ship;
  const spec = SPECIAL_EQUIPMENT[equipment];

  // Check if already owned
  const ownershipMap: Record<string, boolean> = {
    'CLOAKER': ship.hasCloaker,
    'AUTO_REPAIR': ship.hasAutoRepair,
    'STAR_BUSTER': ship.hasStarBuster,
    'ARCH_ANGEL': ship.hasArchAngel,
    'ASTRAXIAL_HULL': ship.isAstraxialHull,
    'TITANIUM_HULL': ship.hasTitaniumHull,
    'TRANS_WARP': ship.hasTransWarpDrive,
  };
  if (ownershipMap[equipment]) {
    return { success: false, error: 'Already equipped' };
  }

  // Equipment-specific requirement checks
  if (equipment === 'CLOAKER') {
    if (ship.hullStrength >= 5) {
      return { success: false, error: 'Hull too large for cloaker (must be < 5 strength)' };
    }
    if (ship.shieldStrength < 1) {
      return { success: false, error: 'Shields required for cloaker' };
    }
    if (ship.hasAutoRepair) {
      return { success: false, error: 'Cloaker incompatible with auto-repair' };
    }
  }

  if (equipment === 'AUTO_REPAIR') {
    if (ship.hasCloaker) {
      return { success: false, error: 'Auto-repair incompatible with cloaker' };
    }
  }

  if (equipment === 'STAR_BUSTER' || equipment === 'ARCH_ANGEL') {
    if (character.score < 150) {
      return { success: false, error: 'Requires Commander rank (score ≥ 150)' };
    }
  }

  if (equipment === 'ASTRAXIAL_HULL') {
    if (!character.isConqueror) {
      return { success: false, error: 'Requires Conqueror status' };
    }
    if (ship.driveStrength < 25) {
      return { success: false, error: 'Requires drive strength ≥ 25' };
    }
  }

  // Calculate price
  let price: number;
  if (equipment === 'AUTO_REPAIR' || equipment === 'TITANIUM_HULL') {
    // SP.SPEED.txt lines 82-83: "if h1>20 x=20000:goto aarp" / "x=h1*1000"
    // Cost is hull_strength * 1,000 cr, capped at 20,000 cr when hull > 20
    const rawPrice = ship.hullStrength * (spec as any).priceMultiplier;
    price = ship.hullStrength > 20 ? 20000 : rawPrice;
  } else {
    price = (spec as any).price;
  }

  const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
  if (totalCredits < price) {
    return { success: false, error: 'Not enough credits' };
  }

  const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, price);

  const shipUpdate: Record<string, any> = {};
  const fieldMap: Record<string, string> = {
    'CLOAKER': 'hasCloaker',
    'AUTO_REPAIR': 'hasAutoRepair',
    'STAR_BUSTER': 'hasStarBuster',
    'ARCH_ANGEL': 'hasArchAngel',
    'ASTRAXIAL_HULL': 'isAstraxialHull',
    'TITANIUM_HULL': 'hasTitaniumHull',
    'TRANS_WARP': 'hasTransWarpDrive',
  };
  shipUpdate[fieldMap[equipment]] = true;

  if (equipment === 'ASTRAXIAL_HULL') {
    const bonus = (SPECIAL_EQUIPMENT.ASTRAXIAL_HULL as any).bonus;
    shipUpdate.hullStrength = bonus.hullStrength;
    shipUpdate.hullCondition = bonus.hullCondition;
    shipUpdate.maxCargoPods = bonus.cargoPods;
    shipUpdate.fuel = ship.fuel + bonus.fuel;
  }
  
  if (equipment === 'TITANIUM_HULL') {
    shipUpdate.maxCargoPods = ship.maxCargoPods + 50;
  }

  await prisma.$transaction([
    prisma.ship.update({
      where: { id: ship.id },
      data: shipUpdate,
    }),
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    }),
  ]);

  return { success: true, cost: price, equipment };
}
