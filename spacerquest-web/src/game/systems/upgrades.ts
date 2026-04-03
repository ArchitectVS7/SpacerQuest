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
  // SP.YARD.S hull subroutine (lines 58-66)
  hull: [
    'Reliable',       // tier 1 - strength 10
    'Flyer',          // tier 2 - strength 20
    'Racer',          // tier 3 - strength 30
    'Viper',          // tier 4 - strength 40
    'Tiger',          // tier 5 - strength 50
    'Mark IV',        // tier 6 - strength 60
    'Dreadnought',    // tier 7 - strength 70
    'Invincible',     // tier 8 - strength 80
    'Battle Star',    // tier 9 - strength 90
  ],
  // SP.YARD.S drive subroutine (lines 75-83)
  drive: [
    'Pulse Engines',          // tier 1
    'Reaction Mass Engines',  // tier 2
    'Hydrogen Ram Scoop',     // tier 3
    'Plasma Ion Drive',       // tier 4
    'Anti-Matter Drive',      // tier 5
    'Ultra-Grav System',      // tier 6
    'Supra-Grav System',      // tier 7
    'Photonic LS Drive',      // tier 8
    'Harmonic FTL Drive',     // tier 9
  ],
  // SP.YARD.S cabin subroutine (lines 92-100)
  cabin: [
    'Simple Accomodations',   // tier 1
    'Basic Comforts',         // tier 2
    'Comfortable Habitat',    // tier 3
    'Deluxe Staterooms',      // tier 4
    'Luxury Accomodations',   // tier 5
    'Pent-House',             // tier 6
    'Estate Digs',            // tier 7
    'Athenia Pad',            // tier 8
    'Plaza Suite',            // tier 9
  ],
  // SP.YARD.S life subroutine (lines 114-123): "LSS Model " + number + "A"
  // "LSS Chrysalis+*" is a quest reward (SP.TOP.S:171), NOT a yard tier.
  lifeSupport: [
    'LSS Model 1A',   // tier 1
    'LSS Model 2A',   // tier 2
    'LSS Model 3A',   // tier 3
    'LSS Model 4A',   // tier 4
    'LSS Model 5A',   // tier 5
    'LSS Model 6A',   // tier 6
    'LSS Model 7A',   // tier 7
    'LSS Model 8A',   // tier 8
    'LSS Model 9A',   // tier 9
  ],
  // SP.YARD.S weapon subroutine (lines 132-140)
  weapon: [
    'Atomic Missiles',          // tier 1
    'Phasor Guns',              // tier 2
    'Laser Guns',               // tier 3
    'Plasma Flamer',            // tier 4
    'Photon Torpedoes',         // tier 5
    'Ion Disruptor',            // tier 6
    'Particle Ray Generator',   // tier 7
    'Neutron Beam Projector',   // tier 8
    'Astral ASDRS',             // tier 9
  ],
  // SP.YARD.S nav subroutine (lines 149-157)
  navigation: [
    'Solar Nav Aid System',   // tier 1
    'Galactic Nav Device',    // tier 2
    'Astral Plane Hardware',  // tier 3
    'Harmonic Void Marks',    // tier 4
    'Ethereal Seeker',        // tier 5
    'Super Astro-Guide',      // tier 6
    'LOGRUS NAV',             // tier 7
    'Pathfinder:][',          // tier 8
    'Astrolabe MK-VI',        // tier 9
  ],
  // SP.YARD.S robot subroutine (lines 166-174)
  robotics: [
    'Basic Auto-Pilot',       // tier 1
    'SW Auto Robotic Sys',    // tier 2
    'Ultra Robotic Control',  // tier 3
    'COMPU-TRAK XM',          // tier 4
    'Spiffy Controller',      // tier 5
    'Auto-Battler Console',   // tier 6
    'Robo-Mentor',            // tier 7
    'Psion-O-Tac',            // tier 8
    'Colossus A:I',           // tier 9
  ],
  // SP.YARD.S prot subroutine (lines 183-191)
  shield: [
    'Power',            // tier 1
    'Hi-Energy',        // tier 2
    'Atomic',           // tier 3
    'Protector',        // tier 4
    'Guardian',         // tier 5
    'Guardian-II',      // tier 6
    'Guardian-]I[',     // tier 7
    'Carapace-XM',      // tier 8
    'ION-MAG Shield',   // tier 9
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
  podSalvage?: number;
  contractVoided?: boolean;
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
 *   7. Life Support with "LSS Chry" prefix blocks replacement (Chrysalis downgrade guard)
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

  // SP.YARD.S life subroutine (lines 107-110): LSS Chrysalis downgrade guard.
  // Original: if left$(l1$,8)<>"LSS Chry" goto lifex
  //   print "It will cost 1,500,000 cr to remove the [lss name]"
  //   print "Very doubtful you wish to proceed....."
  //   pop:goto main
  if (componentType === 'lifeSupport') {
    const currentLssName = (ship[nameField] as string) ?? '';
    if (currentLssName.startsWith('LSS Chry')) {
      return {
        success: false,
        error: `It will cost 1,500,000 cr to remove the ${currentLssName}. Very doubtful you wish to proceed.....`,
      };
    }
  }

  // SP.YARD.S swap subroutine: trade-in existing component
  const tradeinValue = calculateTradeInValue(currentStrength, isTitaniumEnhanced);

  // SP.YARD.S cost.data: tier price (0-indexed)
  const tierPrice = YARD_COMPONENT_TIER_PRICES[tierIndex - 1];
  const netCost = Math.max(0, tierPrice - tradeinValue);

  const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);

  // Hull component transfer fee (500 cr) on top of net cost
  const transferFee = (componentType === 'hull' && transferComponents) ? 500 : 0;

  // SP.YARD.S scrap subroutine: "Pods salvageable @ 2 cr each" — g2=g2+(s1*2):s1=0
  // When transferring components to new hull, salvage existing pods at 2 cr each.
  const podSalvage = (componentType === 'hull' && transferComponents) ? (ship.cargoPods ?? 0) * 2 : 0;

  // Net cost = component cost - tradein + transferFee - podSalvage
  const totalCost = Math.max(0, netCost + transferFee - podSalvage);

  if (totalCredits < totalCost) {
    return { success: false, error: 'Not enough credits' };
  }

  // New strength = tierIndex * 10 (tier 1 = 10, tier 9 = 90)
  const newStrength = tierIndex * 10;

  // Determine component name from original SP.YARD.S name tables
  const componentName = COMPONENT_TIER_NAMES[componentType][tierIndex - 1];

  // SP.YARD.S scrap2 (lines 301-302): if q1>0 void the cargo contract
  // "As of now...your Cargo Contract is null and void!"
  // q1=0:q2=0:q3=0:q4=0:q5=0:q6=0:q2$="":q4$=""
  const contractVoided = componentType === 'hull' && !!transferComponents && character.cargoPods > 0;

  const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, totalCost);
  const newCredits = getTotalCredits(high, low);

  const shipUpdate: Record<string, unknown> = {
    [strengthField]: newStrength,
    [nameField]: componentName,
  };

  // Recalculate maxCargoPods if hull changed; also clear pods on transfer (SP.YARD.S s1=0)
  if (componentType === 'hull') {
    const newCondition = Number(ship.hullCondition);
    shipUpdate.maxCargoPods = calculateMaxCargoPods(newStrength, newCondition, ship.hasTitaniumHull);
    if (transferComponents) {
      // SP.YARD.S scrap: g2=g2+(s1*2):s1=0 — pods cleared after salvage
      shipUpdate.cargoPods = 0;
    }
    // SP.YARD.S main menu line 32: if (h1>4) and (right$(p1$,1)="=") → strip cloaker
    // When the new hull strength exceeds 4, the Morton's Cloaker is removed automatically.
    if (newStrength > 4 && ship.hasCloaker) {
      shipUpdate.hasCloaker = false;
    }
  }

  const characterUpdate: Record<string, unknown> = { creditsHigh: high, creditsLow: low };
  if (contractVoided) {
    // SP.YARD.S scrap2:301-302: void active cargo contract on hull scrap
    characterUpdate.cargoPods = 0;
    characterUpdate.cargoType = 0;
    characterUpdate.destination = 0;
    characterUpdate.cargoPayment = 0;
    characterUpdate.cargoManifest = null;
    characterUpdate.missionType = 0;
  }

  await db.$transaction([
    db.ship.update({
      where: { id: ship.id },
      data: shipUpdate,
    }),
    db.character.update({
      where: { id: characterId },
      data: characterUpdate,
    }),
  ]);

  return {
    success: true,
    newStrength,
    componentName,
    tradeinValue,
    netCost: totalCost,
    newCredits,
    podSalvage,
    contractVoided,
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

  const updateData: Record<string, number | boolean> = {};
  if (upgradeType === 'STRENGTH') {
    const newStrength = currentStrength + 10;
    if (newStrength > COMPONENT_MAX_STRENGTH) {
      return { success: false, error: 'Component already at maximum strength' };
    }

    // SP.SPEED.S upit subroutine (lines 152-154):
    // if (left$(l1$,5)="LSS C") or (l1<51) return
    // i$="":l1=50:print "The [l1$] can't support a strength >50"
    // Life support strength cannot exceed 50 unless it is the LSS Chrysalis ("LSS C" prefix).
    if (component.toUpperCase() === 'LIFE_SUPPORT') {
      const lssName = (character.ship['lifeSupportName' as keyof typeof character.ship] as string) ?? '';
      if (!lssName.startsWith('LSS C') && newStrength > 50) {
        return { success: false, error: "This Life Support cannot exceed strength 50" };
      }
    }

    updateData[strengthField] = newStrength;

    // Recalculate max cargo if hull upgraded
    // SP.YARD.S store lines 213-215: y = (h2+1)*hx where hx strips Titanium bonus
    if (component.toUpperCase() === 'HULL' && !character.ship.isAstraxialHull) {
      const condition = Number(character.ship.hullCondition);
      updateData.maxCargoPods = calculateMaxCargoPods(newStrength, condition, character.ship.hasTitaniumHull);

      // SP.YARD.S main menu line 32: if (h1>4) and (right$(p1$,1)="=") → strip cloaker
      // When hull strength passes 4 (i.e. new strength > 4) and cloaker is installed, remove it.
      if (newStrength > 4 && character.ship.hasCloaker) {
        updateData.hasCloaker = false;
      }
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
    // SP.SPEED.S cloak line 102: if h1<1 → need hull first
    if (ship.hullStrength < 1) {
      return { success: false, error: "You need a ship's hull before we can help you!" };
    }
    if (ship.hullStrength >= 5) {
      return { success: false, error: 'Hull too large for cloaker (must be < 5 strength)' };
    }
    if (ship.shieldStrength < 1) {
      return { success: false, error: 'Shields required for cloaker' };
    }
    if (ship.hasAutoRepair) {
      return { success: false, error: 'Cloaker incompatible with auto-repair' };
    }
    // SP.SPEED.S cloak lines 108-109: if right$(p1$,2)="++" → cloaker won't fit
    // "++" in the original means ARCH-ANGEL is installed on the shield slot
    if (ship.hasArchAngel) {
      return { success: false, error: "Cloaker won't fit with Arch-Angel shield installed" };
    }
  }

  if (equipment === 'AUTO_REPAIR') {
    // SP.SPEED.S autorep line 74: if h1<1 → need a hull first
    if (ship.hullStrength < 1) {
      return { success: false, error: 'Need a hull first' };
    }
    if (ship.hasCloaker) {
      return { success: false, error: 'Auto-repair incompatible with cloaker' };
    }
    // SP.SPEED.txt lines 85-96: Titanium enhancement and A-R cannot coexist.
    // Installing A-R removes Titanium. The cost warning is shown but we proceed.
    // Original: if l$="*" print "Requires removing the Titanium Enhancement"
    // Line 96: h1=h1-10:s1=s1-5 (remove titanium strength bonus and pod bonus)
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
    // SP.BLACK.S:53: f1=2900 — SET fuel to 2900 (not add); full fuel tanks included in purchase
    shipUpdate.fuel = bonus.fuel;
  }
  
  // ── SP.SPEED.txt lines 85-96: Component mutual exclusivity ──
  // Titanium Enhancement (+*) and Auto-Repair (+!) cannot coexist.
  // Installing one removes the other with appropriate stat adjustments.

  if (equipment === 'AUTO_REPAIR' && ship.hasTitaniumHull) {
    // SP.SPEED.txt line 96: remove titanium — h1=h1-10, s1=s1-5
    // Original strips the +* suffix and reverts strength/pod bonuses
    shipUpdate.hasTitaniumHull = false;
    shipUpdate.hullStrength = Math.max(1, ship.hullStrength - 10);
    shipUpdate.maxCargoPods = Math.max(0, ship.maxCargoPods - 50);
    // Note: s1=s1-5 in original refers to cargo pod capacity factor, which
    // in the modern system is the +50 pod bonus from Titanium
  }

  if (equipment === 'TITANIUM_HULL' && ship.hasAutoRepair) {
    // SP.SPEED.txt choose subroutine lines 249: if right$(xl$,2)="+!" strip it
    // Original: lw=len(xl$):lw=lw-2:xl$=left$(xl$,lw)
    // Installing Titanium removes Auto-Repair module
    shipUpdate.hasAutoRepair = false;
  }

  // ── SP.SPEED.S nemget subroutine: cloaker stripping ──────────────────────
  // Original: if right$(xl$,1)="=" print "The Morton's Cloaker will be lost"
  // Cloaker is installed on shield slot (p1$="="). ARCH-ANGEL replaces the shield
  // → hasCloaker must be cleared. STAR-BUSTER checks w1$ (weapon, no "=") — strip
  // defensively in case of edge-case state.
  if ((equipment === 'ARCH_ANGEL' || equipment === 'STAR_BUSTER') && ship.hasCloaker) {
    // SP.SPEED.S nemget: replacing component loses the Morton's Cloaker (="= suffix)
    shipUpdate.hasCloaker = false;
  }

  if (equipment === 'TITANIUM_HULL') {
    shipUpdate.maxCargoPods = ship.maxCargoPods + 50;
  }

  // SP.SPEED.S cloak line 122: p1$=p1$+"=":p2=9:h2=9
  // Installing the Morton's Cloaker also restores shield condition and hull condition to 9.
  if (equipment === 'CLOAKER') {
    shipUpdate.shieldCondition = 9;
    shipUpdate.hullCondition = 9;
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
