/**
 * SpacerQuest v4.0 - Character Registry System (SP.REG.S)
 */

import { prisma } from '../../db/prisma.js';
import { validateName } from '../utils.js';

export async function registerCharacter(userId: string, name: string, shipName: string) {
  const nameValidation = validateName(name);
  if (!nameValidation.valid) {
    return { success: false, error: nameValidation.error };
  }
  
  const shipValidation = validateName(shipName);
  if (!shipValidation.valid) {
    return { success: false, error: `Ship name: ${shipValidation.error}` };
  }
  
  const existing = await prisma.character.findFirst({ where: { userId } });
  if (existing) {
    return { success: false, error: 'Character already exists' };
  }
  
  const character = await prisma.character.create({
    data: {
      userId,
      name,
      shipName,
      creditsHigh: 0,
      creditsLow: 1000, // Starting 1,000 cr
      currentSystem: 1, // Sun-3
    },
  });
  
  await prisma.ship.create({
    data: {
      characterId: character.id,
      hullStrength: 0, hullCondition: 0,
      driveStrength: 0, driveCondition: 0,
      cabinStrength: 0, cabinCondition: 0,
      lifeSupportStrength: 0, lifeSupportCondition: 0,
      weaponStrength: 0, weaponCondition: 0,
      navigationStrength: 0, navigationCondition: 0,
      roboticsStrength: 0, roboticsCondition: 0,
      shieldStrength: 0, shieldCondition: 0,
      fuel: 0, cargoPods: 0, maxCargoPods: 0,
    },
  });
  
  await prisma.gameLog.create({
    data: {
      type: 'SYSTEM',
      characterId: character.id,
      message: `New spacer created: ${name} of the ship ${shipName}`,
    },
  });
  
  return { success: true, character };
}
