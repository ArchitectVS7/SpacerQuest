/**
 * SpacerQuest v4.0 - Bot Configuration
 */

import { prisma } from '../db/prisma.js';

export async function getBotCount(): Promise<number> {
  const n = parseInt(process.env.BOT_COUNT || '20', 10);
  let base = [0, 5, 10, 20].includes(n) ? n : 20;
  
  if (isEnhancedMode() && base > 0) {
    const activeHumanPlayers = await prisma.character.count({
      where: {
        isBot: false,
      }
    });
    
    // If multiplayer, add extra bots. Otherwise stick to the base 20.
    if (activeHumanPlayers > 1) {
      base += (activeHumanPlayers * 3);
    }
  }
  
  return base;
}

export function isClassicMode(): boolean {
  return process.env.CLASSIC_MODE === 'true';
}

export function isEnhancedMode(): boolean {
  return process.env.BOT_ENHANCED === 'true';
}
