/**
 * SpacerQuest v4.0 - Repairs System (SP.DAMAGE.S)
 *
 * Ron the Recka's - Space Ship Repairs and Maintenance
 *
 * Repair cost formula (original SP.DAMAGE.S):
 *   cost = (9 - condition) * strength + rebuildFee
 *   rebuildFee = 2000 cr if condition === 0 (fully destroyed), else 0
 *   Plus 100 cr inspection fee per visit ("put your old tub up on the rack")
 *
 * Single DX repair: repair 1 unit of damage at cost = strength + rebuildFee
 * All DX repair: repair all damage at cost = (9-condition)*strength + rebuildFee
 */

import { prisma } from '../../db/prisma.js';
import { getTotalCredits, subtractCredits } from '../utils.js';

export type ComponentKey = 'hull' | 'drive' | 'cabin' | 'lifeSupport' | 'weapon' | 'navigation' | 'robotics' | 'shield';

const INSPECTION_FEE = 100; // "100 credits just to put your old tub up on the rack"
const REBUILD_FEE = 2000;   // Extra charge when condition=0 (fully destroyed)

/**
 * Calculate cost to repair a component.
 * Original: k=0:if x=9 k=2000:tj=tj+k (spfix) and k=0:if x<1 k=2000 (repauto)
 */
function componentRepairCost(strength: number, condition: number, units: number): number {
  const rebuildFee = condition === 0 ? REBUILD_FEE : 0;
  return (units * strength) + rebuildFee;
}

/**
 * Repair all damaged components.
 * Charges 100 cr inspection fee + (damage units * strength + rebuild fee per component).
 * Original: SP.DAMAGE.S ala/alr/repauto subroutines.
 */
export async function repairAllComponents(characterId: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });

  if (!character || !character.ship) {
    return { success: false, error: 'Character or ship not found' };
  }

  const ship = character.ship;
  const components: ComponentKey[] = ['hull', 'drive', 'cabin', 'lifeSupport', 'weapon', 'navigation', 'robotics', 'shield'];

  let repairCost = 0;
  for (const comp of components) {
    const strength = ship[`${comp}Strength` as keyof typeof ship] as number;
    const condition = ship[`${comp}Condition` as keyof typeof ship] as number;
    if (condition < 9) {
      repairCost += componentRepairCost(strength, condition, 9 - condition);
    }
  }

  const totalCost = INSPECTION_FEE + repairCost;
  const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
  if (totalCredits < totalCost) {
    return { success: false, error: `Not enough credits. Repair cost: ${repairCost} cr + ${INSPECTION_FEE} cr inspection fee` };
  }

  const updateData: Record<string, number> = {};
  for (const comp of components) {
    updateData[`${comp}Condition`] = 9;
  }

  const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, totalCost);

  await prisma.$transaction([
    prisma.ship.update({
      where: { id: ship.id },
      data: updateData,
    }),
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    })
  ]);

  return { success: true, cost: totalCost, repairCost, inspectionFee: INSPECTION_FEE, message: 'All components repaired to full condition!' };
}

/**
 * Repair a component at a Rim Star port.
 *
 * Original SP.DOCK2.S rmfx subroutine (lines 284-298):
 *   if x>199 x=199
 *   if (l$=jk$) or (x<1) return  (component destroyed or zero strength)
 *   if y>8 return                 (already in perfect condition)
 *   a=x*100                       (cost = strength × 100)
 *   y=y+1                         (repair exactly 1 condition unit)
 *
 * This is distinct from SP.DAMAGE.S repairs — rim ports only fix 1 condition
 * per visit and charge strength×100 with no rebuild fee.
 *
 * @param characterId - Character performing the repair
 * @param component - Ship component to repair
 */
export async function repairRimComponent(
  characterId: string,
  component: ComponentKey
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });

  if (!character || !character.ship) {
    return { success: false, error: 'Character or ship not found' };
  }

  const ship = character.ship;
  const strength = ship[`${component}Strength` as keyof typeof ship] as number;
  const condition = ship[`${component}Condition` as keyof typeof ship] as number;

  // if (l$=jk$) or (x<1) → component destroyed or zero strength
  if (strength < 1) {
    return { success: false, error: `${component} is destroyed — cannot repair here` };
  }

  // if y>8 → already in perfect condition
  if (condition >= 9) {
    return { success: true, cost: 0, newCondition: 9, message: `${component} is in perfect condition!` };
  }

  // Clamp strength at 199 (original: if x>199 x=199)
  const effectiveStrength = Math.min(strength, 199);

  // a = x*100 — cost per 1 condition unit
  const cost = effectiveStrength * 100;

  const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
  if (totalCredits < cost) {
    return { success: false, error: `Not enough credits. Repair cost: ${cost} cr` };
  }

  // y=y+1 — repair exactly 1 condition unit
  const newCondition = condition + 1;
  const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, cost);

  await prisma.$transaction([
    prisma.ship.update({
      where: { id: ship.id },
      data: { [`${component}Condition`]: newCondition },
    }),
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    }),
  ]);

  return { success: true, cost, newCondition, message: `${component} repaired! S:[${strength}] C:[${newCondition}]` };
}

/**
 * Repair a single component, all DX units or just one.
 * Original: SP.DAMAGE.S repo subroutine — "(A)ll DX  (S)ingle DX  [Q]uit"
 * mode='single' → repair 1 DX unit (original: y=1)
 * mode='all'    → repair all damage (original: y=(9-x))
 */
export async function repairSingleComponent(
  characterId: string,
  component: ComponentKey,
  mode: 'single' | 'all' = 'all'
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });

  if (!character || !character.ship) {
    return { success: false, error: 'Character or ship not found' };
  }

  const ship = character.ship;
  const strength = ship[`${component}Strength` as keyof typeof ship] as number;
  const condition = ship[`${component}Condition` as keyof typeof ship] as number;

  if (condition >= 9) {
    return { success: true, cost: 0, newCondition: 9, message: `${component} needs no repair` };
  }

  const units = mode === 'single' ? 1 : (9 - condition);
  const cost = componentRepairCost(strength, condition, units);

  const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
  if (totalCredits < cost) {
    return { success: false, error: `Not enough credits. Repair cost: ${cost} cr` };
  }

  const newCondition = Math.min(9, condition + units);
  const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, cost);

  await prisma.$transaction([
    prisma.ship.update({
      where: { id: ship.id },
      data: { [`${component}Condition`]: newCondition },
    }),
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    }),
  ]);

  return { success: true, cost, newCondition, message: `${component} repaired!` };
}
