/**
 * SpacerQuest v4.0 - Port Ownership System (SP.REAL.S)
 */

import { prisma } from '../../db/prisma.js';
import { subtractCredits } from '../utils.js';

const PORT_BASE_PRICE = 500000;

export async function buyPort(characterId: string, systemId: number) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) return { success: false, error: 'Character not found' };

  const port = await prisma.allianceSystem.findUnique({ where: { systemId } });
  if (port && port.ownerCharacterId) {
    return { success: false, error: 'Port is already owned' };
  }

  const { success, high, low } = subtractCredits(character.creditsHigh, character.creditsLow, PORT_BASE_PRICE);
  if (!success) return { success: false, error: 'Not enough credits to buy port' };

  await prisma.$transaction([
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    }),
    prisma.allianceSystem.upsert({
      where: { systemId },
      update: { ownerCharacterId: characterId },
      create: { systemId, alliance: 'NONE', ownerCharacterId: characterId, defconLevel: 1 },
    }),
    prisma.gameLog.create({
      data: {
        type: 'SYSTEM',
        systemId,
        message: `${character.name} purchased Port ${systemId}`,
      }
    })
  ]);

  return { success: true, message: `Successfully purchased Port ${systemId}` };
}

export async function collectPortDividends(_characterId: string, _systemId: number) {
  // Simplistic dividend collection logic for now, in lieu of full daily processing
  return { success: false, error: 'Dividends collect automatically at day reset' };
}
