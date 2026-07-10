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

export type ComponentKey = 'hull' | 'drive' | 'cabin' | 'lifeSupport' | 'weapon' | 'navigation' | 'robotics' | 'shield' | 'cargoPods';

// SP.DAMAGE.S:28-29: ri$ and jk$ — junk gate error message
export const JUNK_REPAIR_ERROR = 'Too badly damaged to repair...recommend replacement';

const INSPECTION_FEE = 100; // "100 credits just to put your old tub up on the rack"
const REBUILD_FEE = 2000;   // Extra charge when condition=0 (fully destroyed)

// ============================================================================
// ENHANCEMENT STRIPPING (SP.DAMAGE.S enca/enhc subroutines, lines 86-96, 172-182)
// ============================================================================

export interface EnhancementCheckResult {
  name: string;
  strength: number;
  /** How many strength points were subtracted (0 or 10) */
  penalty: number;
  stripped: boolean;
}

/**
 * Apply the enca/enhc logic before repairing a component at condition=0.
 *
 * Original SP.DAMAGE.S enca (line 86-96):
 *   if x>0 a=0:return             ← if condition > 0, no stripping
 *   if right$(l$,2)<>"+*" a=0:return  ← only strip "+*" (Titanium) enhancements
 *   l=len(l$):l=l-2
 *   a$=left$(l$,l):l$=a$:a=10    ← strip "+*", set strength penalty a=10
 *   if j<10 j=0:a=0              ← if strength < 10, can't save, zero out
 *   print "Unable to save enhancement...sorry"
 *
 * @param name      Component name string (may end in "+*")
 * @param strength  Current component strength (j in original)
 * @param condition Current component condition (x in original)
 */
export function checkEnhancementStripping(
  name: string,
  strength: number,
  condition: number,
): EnhancementCheckResult {
  // if condition > 0, no stripping needed
  if (condition > 0) {
    return { name, strength, penalty: 0, stripped: false };
  }
  // only strip if name ends with "+*" (Titanium enhancement marker)
  if (!name.endsWith('+*')) {
    return { name, strength, penalty: 0, stripped: false };
  }
  // Strip the "+*" suffix
  const strippedName = name.slice(0, -2);
  // if strength < 10, component cannot be saved at all (j=0, a=0)
  if (strength < 10) {
    return { name: strippedName, strength: 0, penalty: 0, stripped: true };
  }
  // Apply penalty of 10 strength points
  return { name: strippedName, strength: strength - 10, penalty: 10, stripped: true };
}

// ============================================================================
// HULL-STRENGTH CAPS (SP.DAMAGE.S spfix subroutine, lines 113-115)
// ============================================================================

export interface HullCapResult {
  /** Updated strength values per component (only for components that were capped) */
  updates: Record<string, number>;
  /** Number of components that exceeded the cap */
  cappedCount: number;
}

/**
 * Enforce hull-based component strength caps (SP.DAMAGE.S spfix lines 113-115).
 *
 * Original:
 *   if (h1<10) and (j>99) di=di+1:j=99   ← small hull: cap at 99
 *   if (h1>9) and (j>199) di=di+1:j=199  ← large hull: cap at 199
 *
 * Called during damage assessment display, modifying actual strength values.
 *
 * @param hullStrength  h1 — player's hull strength
 * @param components    Map of {strengthField: currentStrength} for all components
 */
export function applyHullStrengthCaps(
  hullStrength: number,
  components: Record<string, number>,
): HullCapResult {
  const maxStrength = hullStrength >= 10 ? 199 : 99;
  const updates: Record<string, number> = {};
  let cappedCount = 0;
  for (const [field, strength] of Object.entries(components)) {
    if (strength > maxStrength) {
      updates[field] = maxStrength;
      cappedCount++;
    }
  }
  return { updates, cappedCount };
}

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
 *
 * Also applies:
 * - Enhancement stripping (enca/enhc): if condition=0 and name ends "+*", strip enhancement and reduce strength by 10 (SP.DAMAGE.S:172-182)
 * - Hull strength caps (spfix): enforced when damage assessment is run (SP.DAMAGE.S:113-115)
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

  // Apply hull strength caps first (SP.DAMAGE.S spfix lines 113-115)
  const compStrengths: Record<string, number> = {};
  for (const comp of components) {
    compStrengths[`${comp}Strength`] = ship[`${comp}Strength` as keyof typeof ship] as number;
  }
  const { updates: capUpdates } = applyHullStrengthCaps(ship.hullStrength, compStrengths);
  const effectiveStrengths: Record<string, number> = { ...compStrengths, ...capUpdates };

  // Apply enhancement stripping and compute repair cost
  let repairCost = 0;
  const updateData: Record<string, number | string> = {};
  const strippedComponents: string[] = [];

  for (const comp of components) {
    let strength = effectiveStrengths[`${comp}Strength`];
    const condition = ship[`${comp}Condition` as keyof typeof ship] as number;
    const nameField = `${comp}Name`;
    const name = (ship[nameField as keyof typeof ship] as string) ?? '';

    // SP.DAMAGE.S enhc:175 — if l$=jk$ goto ala (skip Junk components in repair-all)
    // Junk = strength===0: too badly damaged, cannot repair (recommend replacement)
    if (strength === 0) {
      continue;
    }

    // Enhancement stripping (enca/enhc): only applies when condition=0
    if (condition === 0 && name) {
      const ec = checkEnhancementStripping(name, strength, condition);
      if (ec.stripped) {
        updateData[nameField] = ec.name;
        updateData[`${comp}Strength`] = ec.strength;
        strength = ec.strength;
        strippedComponents.push(comp);
      }
    }

    if (condition < 9 && strength > 0) {
      repairCost += componentRepairCost(strength, condition, 9 - condition);
    }
    updateData[`${comp}Condition`] = 9;
  }

  // Apply hull caps to strength fields in updateData
  Object.assign(updateData, capUpdates);

  const totalCost = INSPECTION_FEE + repairCost;
  const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
  if (totalCredits < totalCost) {
    return { success: false, error: `Not enough credits. Repair cost: ${repairCost} cr + ${INSPECTION_FEE} cr inspection fee` };
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

  const msg = strippedComponents.length > 0
    ? `All components repaired. Enhancement stripped on: ${strippedComponents.join(', ')}`
    : 'All components repaired to full condition!';
  return { success: true, cost: totalCost, repairCost, inspectionFee: INSPECTION_FEE, message: msg };
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
 *
 * Also applies enhancement stripping (enca): if condition=0 and name ends "+*",
 * strip enhancement and reduce strength by 10 before repair (SP.DAMAGE.S:86-96).
 */
export async function repairSingleComponent(
  characterId: string,
  component: ComponentKey,
  mode: 'single' | 'all' = 'all'
) {
  // SP.DAMAGE.S:83 — if i=9 print "Pods repaired free": no cost, no update
  if (component === 'cargoPods') {
    return { success: true, cost: 0, newCondition: 9, message: 'Pods repaired free' };
  }

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });

  if (!character || !character.ship) {
    return { success: false, error: 'Character or ship not found' };
  }

  const ship = character.ship;
  let strength = ship[`${component}Strength` as keyof typeof ship] as number;
  const condition = ship[`${component}Condition` as keyof typeof ship] as number;

  // SP.DAMAGE.S enca:88 — if l$=jk$ print l$;ri$:pop:goto rep1 (Junk = strength 0: too badly damaged)
  if (strength === 0) {
    return { success: false, error: JUNK_REPAIR_ERROR };
  }

  if (condition >= 9) {
    return { success: true, cost: 0, newCondition: 9, message: `${component} needs no repair` };
  }

  // Enhancement stripping (enca): applied before repair when condition=0
  const nameField = `${component}Name`;
  const name = (ship[nameField as keyof typeof ship] as string) ?? '';
  const ec = checkEnhancementStripping(name, strength, condition);
  const extraUpdates: Record<string, number | string> = {};
  if (ec.stripped) {
    strength = ec.strength;
    extraUpdates[nameField] = ec.name;
    extraUpdates[`${component}Strength`] = ec.strength;
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
      data: { [`${component}Condition`]: newCondition, ...extraUpdates },
    }),
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    }),
  ]);

  const msg = ec.stripped
    ? `${component} repaired! Enhancement stripped (strength -10).`
    : `${component} repaired!`;
  return { success: true, cost, newCondition, message: msg };
}
