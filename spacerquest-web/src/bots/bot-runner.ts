/**
 * SpacerQuest v4.0 - Bot Runner
 *
 * Orchestrates all bot turns. Sequential execution to avoid
 * race conditions on shared state (ports, alliances, fuel prices).
 */

import { prisma } from '../db/prisma.js';
import { BotRunSummary, RngFunction } from './types.js';
import { getBotCount } from './config.js';
import { ensureBotsExist } from './bot-setup.js';
import { executeBotTurn } from './bot-turn.js';
import { getProfileForBot } from './profiles.js';
import { calculateRank } from '../game/utils.js';

export async function runAllBotTurns(
  playerCharacterId: string,
  rng: RngFunction = Math.random,
): Promise<BotRunSummary> {
  const botCount = await getBotCount();
  await ensureBotsExist(botCount);

  const bots = await prisma.character.findMany({
    where: { isBot: true },
    include: { ship: true },
    take: botCount,
    orderBy: { name: 'asc' },
  });

  const summary: BotRunSummary = {
    botsProcessed: 0,
    totalBattles: 0,
    totalCargoDelivered: 0,
    events: [],
  };

  for (const bot of bots) {
    const profile = getProfileForBot(bot.name);
    if (!profile) continue;

    const result = await executeBotTurn(bot.id, profile, rng);

    summary.botsProcessed++;
    summary.totalBattles += result.battlesWon + result.battlesLost;
    summary.totalCargoDelivered += result.tripsCompleted;
    summary.events.push(...result.notableEvents);
  }

  // Run promotion checks for all characters
  await checkPromotions();

  // Reset ALL trip counts (player + bots)
  await prisma.character.updateMany({
    data: { tripCount: 0 },
  });

  return summary;
}

/**
 * Check and apply promotions for all characters.
 * Reuses the same logic as daily-tick but isolated for end-turn flow.
 */
async function checkPromotions(): Promise<void> {
  const { Rank } = await import('@prisma/client');
  const { getHonorarium, addCredits: addCr } = await import('../game/utils.js');

  const characters = await prisma.character.findMany({
    where: { rank: { not: Rank.GIGA_HERO } },
  });

  for (const char of characters) {
    const newRank = calculateRank(char.score);
    if (newRank !== char.rank) {
      const honorarium = getHonorarium(newRank);
      const newCredits = addCr(char.creditsHigh, char.creditsLow, honorarium);

      await prisma.character.update({
        where: { id: char.id },
        data: {
          rank: newRank,
          promotions: char.promotions + 1,
          creditsHigh: newCredits.high,
          creditsLow: newCredits.low,
        },
      });

      await prisma.gameLog.create({
        data: {
          type: 'PROMOTION',
          characterId: char.id,
          message: `${char.name} promoted to ${newRank}`,
          metadata: { fromRank: char.rank, toRank: newRank, honorarium },
        },
      });
    }
  }
}
