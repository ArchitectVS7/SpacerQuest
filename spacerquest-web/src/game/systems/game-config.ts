/**
 * SpacerQuest v4.0 - Game Config Helper (SP.EDIT3 sp.conf)
 *
 * Manages the singleton GameConfig row for sysop-tunable battle settings.
 */

import { prisma } from '../../db/prisma.js';

export async function getGameConfig() {
  return prisma.gameConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });
}

export async function updateGameConfig(data: {
  battleDifficulty?: number;
  maxCombatRounds?: number;
  pirateAttackThreshold?: number;
  patrolAttackThreshold?: number;
  attackRandomMin?: number;
  attackRandomMax?: number;
}) {
  return prisma.gameConfig.update({
    where: { id: 'default' },
    data,
  });
}
