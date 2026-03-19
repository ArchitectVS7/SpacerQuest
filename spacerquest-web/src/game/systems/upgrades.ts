/**
 * SpacerQuest v4.0 - Upgrades System (SP.SPEED.S)
 */

import { prisma } from '../../db/prisma.js';
import { COMPONENT_PRICES, SPECIAL_EQUIPMENT, COMPONENT_MAX_STRENGTH } from '../constants.js';
import { getTotalCredits, subtractCredits } from '../utils.js';

/**
 * Source tiered pricing formula (SP.YARD.S & SP.SPEED.S):
 *   Initial 9 tiers use exponential array (50-10,000)
 *   Higher tiers fall back to multiplier (level * base_price)
 */
export function calculateUpgradeMultiplier(currentStrength: number): number {
  return currentStrength <= 9 ? 1 : Math.floor(currentStrength / 10) + 1;
}

export function calculateUpgradePrice(currentStrength: number, basePrice: number): number {
  const currentTier = currentStrength <= 9 ? 1 : Math.floor(currentStrength / 10) + 1;
  const exponentialPrices = [50, 100, 200, 400, 800, 1500, 3000, 5000, 10000];
  
  if (currentTier <= 9) {
    return exponentialPrices[currentTier - 1];
  }
  
  // Tiers > 9 use the multiplier * component base price (from Roscoe / SP.SPEED)
  const multiplier = currentTier;
  return multiplier * basePrice;
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
    if (component.toUpperCase() === 'HULL' && !character.ship.isAstraxialHull) {
      const condition = Number(character.ship.hullCondition);
      updateData.maxCargoPods = (condition + 1) * newStrength * 10;
      if (character.ship.hasTitaniumHull) updateData.maxCargoPods += 50;
    }
  } else {
    const newCondition = Math.min(9, Number(character.ship[conditionField as keyof typeof character.ship]) + 1);
    updateData[conditionField] = newCondition;
    
    // Recalculate max cargo if hull condition repaired
    if (component.toUpperCase() === 'HULL' && !character.ship.isAstraxialHull) {
      const strength = Number(character.ship.hullStrength);
      updateData.maxCargoPods = (newCondition + 1) * strength * 10;
      if (character.ship.hasTitaniumHull) updateData.maxCargoPods += 50;
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
    price = ship.hullStrength * (spec as any).priceMultiplier;
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
