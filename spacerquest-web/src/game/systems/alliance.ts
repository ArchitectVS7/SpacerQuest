/**
 * SpacerQuest v4.0 - Alliance System
 * 
 * Implements SP.VEST.S (Investing in Alliance, DEFCON, Takeovers)
 */

import { prisma } from '../../db/prisma.js';
import { DEFCON_COST_PER_LEVEL } from '../constants.js';
import { addCredits, subtractCredits } from '../utils.js';

export async function investInAlliance(characterId: string, amount: number) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    return { success: false, error: 'Character not found' };
  }

  const membership = await prisma.allianceMembership.findUnique({
    where: { characterId },
  });

  if (!membership || membership.alliance === 'NONE') {
    return { success: false, error: 'Not in an alliance' };
  }

  const { success, high, low } = subtractCredits(character.creditsHigh, character.creditsLow, amount);
  if (!success) {
    return { success: false, error: 'Not enough credits' };
  }

  const investedHigh = membership.creditsHigh + Math.floor(amount / 100000);
  const investedLow = membership.creditsLow + (amount % 100000);
  const normalizedHigh = investedHigh + Math.floor(investedLow / 100000);
  const normalizedLow = investedLow % 100000;

  await prisma.$transaction([
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    }),
    prisma.allianceMembership.update({
      where: { id: membership.id },
      data: { creditsHigh: normalizedHigh, creditsLow: normalizedLow },
    })
  ]);

  return { success: true, newBalance: normalizedHigh * 100000 + normalizedLow };
}

export async function withdrawFromAlliance(characterId: string, amount: number) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    return { success: false, error: 'Character not found' };
  }

  const membership = await prisma.allianceMembership.findUnique({
    where: { characterId },
  });

  if (!membership || membership.alliance === 'NONE') {
    return { success: false, error: 'Not in an alliance' };
  }

  const { success: canWithdraw, high: newInvHigh, low: newInvLow } = subtractCredits(
    membership.creditsHigh,
    membership.creditsLow,
    amount
  );

  if (!canWithdraw) {
    return { success: false, error: 'Not enough invested credits' };
  }

  const { high: newCharHigh, low: newCharLow } = addCredits(
    character.creditsHigh,
    character.creditsLow,
    amount
  );

  await prisma.$transaction([
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: newCharHigh, creditsLow: newCharLow },
    }),
    prisma.allianceMembership.update({
      where: { id: membership.id },
      data: { creditsHigh: newInvHigh, creditsLow: newInvLow },
    })
  ]);

  return { success: true, withdrawn: amount };
}

export async function investInDefcon(characterId: string, systemId: number, levels: number) {
  const cost = levels * DEFCON_COST_PER_LEVEL;

  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    return { success: false, error: 'Character not found' };
  }

  const membership = await prisma.allianceMembership.findUnique({
    where: { characterId },
  });

  if (!membership || membership.alliance === 'NONE') {
    return { success: false, error: 'Not in an alliance' };
  }

  // Deduct from player's credits
  const { success: canAfford, high, low } = subtractCredits(
    character.creditsHigh,
    character.creditsLow,
    cost
  );

  if (!canAfford) {
    return { success: false, error: 'Not enough credits for this DEFCON increase' };
  }

  // Get or create AllianceSystem
  let allianceSystem = await prisma.allianceSystem.findUnique({
    where: { systemId },
  });

  if (!allianceSystem) {
    allianceSystem = await prisma.allianceSystem.create({
      data: {
        systemId,
        alliance: membership.alliance,
        defconLevel: 1 + levels,
        ownerCharacterId: characterId,
      },
    });
  } else {
    // Port Takeover Logic
    if (allianceSystem.alliance !== membership.alliance) {
      if (allianceSystem.defconLevel > levels) {
        // Did not beat existing DEFCON, just weaken it
        await prisma.$transaction([
          prisma.character.update({
            where: { id: characterId },
            data: { creditsHigh: high, creditsLow: low },
          }),
          prisma.allianceSystem.update({
            where: { systemId },
            data: { defconLevel: allianceSystem.defconLevel - levels },
          }),
        ]);
        return { success: true, message: `Weakened enemy DEFCON. It is now level ${allianceSystem.defconLevel - levels}.` };
      } else {
        // Takeover success
        const remainingLevels = levels - allianceSystem.defconLevel;
        allianceSystem = await prisma.allianceSystem.update({
          where: { systemId },
          data: {
            alliance: membership.alliance,
            defconLevel: 1 + remainingLevels,
            ownerCharacterId: characterId,
            lastTakeoverAttempt: new Date(),
          },
        });
        
        // Log takeover
        await prisma.gameLog.create({
          data: {
            type: 'ALLIANCE',
            systemId,
            message: `${membership.alliance} has forcibly TAKEN OVER System ${systemId}!`,
            metadata: { event: 'TAKEOVER', systemId, newAlliance: membership.alliance },
          },
        });
      }
    } else {
      // Friendly: just add levels
      allianceSystem = await prisma.allianceSystem.update({
        where: { systemId },
        data: {
          defconLevel: allianceSystem.defconLevel + levels,
        },
      });
    }
  }

  // Finalize credit deduction for non-weakening cases
  await prisma.character.update({
    where: { id: characterId },
    data: { creditsHigh: high, creditsLow: low },
  });

  return { success: true, message: `System ${systemId} DEFCON is now ${allianceSystem.defconLevel} for ${allianceSystem.alliance}.` };
}
