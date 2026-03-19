/**
 * SpacerQuest v4.0 - Extra-Curricular System (SP.END.txt lines 36-134, sp.menu11)
 *
 * Modes: Pirate, Star Patrol, Smuggler Patrol
 * Ship Guards: 10,000 cr hire cost; prevents vandalism on quit
 * Vandalism: without guard, random component damage on quit
 */

import { prisma } from '../../db/prisma.js';
import {
  SHIP_GUARD_COST,
  VANDALISM_STRENGTH_MIN,
  VANDALISM_STRENGTH_MAX,
  VANDALISM_CONDITION_MIN,
  VANDALISM_CONDITION_MAX,
} from '../constants.js';
import { getTotalCredits, subtractCredits, randomInt } from '../utils.js';

export type ExtraCurricularMode = 'pirate' | 'star_patrol' | 'smuggler_patrol' | null;

/**
 * Set a character's extra-curricular mode
 */
export async function setMode(characterId: string, mode: ExtraCurricularMode) {
  await prisma.character.update({
    where: { id: characterId },
    data: { extraCurricularMode: mode },
  });
  return { success: true, mode };
}

/**
 * Hire a ship guard (SP.END.txt line 100: g1=g1-1 → 10,000 cr)
 */
export async function hireShipGuard(characterId: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });

  if (!character || !character.ship) {
    return { success: false, error: 'Character or ship not found' };
  }

  if (character.ship.hasShipGuard) {
    return { success: false, error: 'Ship guard already hired' };
  }

  const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
  if (totalCredits < SHIP_GUARD_COST) {
    return { success: false, error: 'Not enough credits (10,000 cr required)' };
  }

  const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, SHIP_GUARD_COST);

  await prisma.$transaction([
    prisma.ship.update({
      where: { id: character.ship.id },
      data: { hasShipGuard: true },
    }),
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    }),
  ]);

  return { success: true, cost: SHIP_GUARD_COST };
}

/**
 * Apply vandalism on quit if no ship guard (SP.END.txt lines 110-134)
 * Random component gets strength -1 to -5, condition -1 to -3
 */
export async function applyVandalism(characterId: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });

  if (!character || !character.ship) {
    return { vandalized: false };
  }

  // Guard prevents vandalism and is consumed for the session
  if (character.ship.hasShipGuard) {
    await prisma.ship.update({
      where: { id: character.ship.id },
      data: { hasShipGuard: false },
    });
    return { vandalized: false, guardConsumed: true };
  }

  // Pick a random component to vandalize
  const components = [
    'hull', 'drive', 'cabin', 'lifeSupport',
    'weapon', 'navigation', 'robotics', 'shield',
  ];
  const target = components[Math.floor(Math.random() * components.length)];
  const strengthField = `${target}Strength`;
  const conditionField = `${target}Condition`;

  const currentStrength = Number(character.ship[strengthField as keyof typeof character.ship]);
  const currentCondition = Number(character.ship[conditionField as keyof typeof character.ship]);

  const strengthLoss = randomInt(VANDALISM_STRENGTH_MIN, VANDALISM_STRENGTH_MAX);
  const conditionLoss = randomInt(VANDALISM_CONDITION_MIN, VANDALISM_CONDITION_MAX);

  const newStrength = Math.max(0, currentStrength - strengthLoss);
  const newCondition = Math.max(0, currentCondition - conditionLoss);

  const updateData: Record<string, number> = {};
  updateData[strengthField] = newStrength;
  updateData[conditionField] = newCondition;

  await prisma.ship.update({
    where: { id: character.ship.id },
    data: updateData,
  });

  return {
    vandalized: true,
    component: target,
    strengthLoss,
    conditionLoss,
  };
}
