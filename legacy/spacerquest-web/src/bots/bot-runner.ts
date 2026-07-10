/**
 * SpacerQuest v4.0 - Bot Runner
 *
 * Orchestrates all bot turns. Sequential execution to avoid
 * race conditions on shared state (ports, alliances, fuel prices).
 */

import { prisma } from '../db/prisma.js';
import { BotRunSummary, BotTurnResult, RngFunction } from './types.js';
import { getBotCount } from './config.js';
import { ensureBotsExist } from './bot-setup.js';
import { executeBotTurn } from './bot-turn.js';
import { getProfileForBot } from './profiles.js';
import { calculateRank } from '../game/utils.js';
import { buildGalacticDigest, DigestPromotion } from './galactic-digest.js';

const cleanName = (n?: string | null) => (n ?? '').replace(/^\[BOT\]\s*/, '');

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
    digest: [],
  };

  const results: BotTurnResult[] = [];
  for (const bot of bots) {
    const profile = getProfileForBot(bot.name);
    if (!profile) continue;

    const result = await executeBotTurn(bot.id, profile, rng);
    results.push(result);

    summary.botsProcessed++;
    summary.totalBattles += result.battlesWon + result.battlesLost;
    summary.totalCargoDelivered += result.tripsCompleted;
    summary.events.push(...result.notableEvents);
  }

  // Withdraw stale arena postings no one took (refunding escrowed stakes)
  try {
    const { expireStaleDuels } = await import('../game/systems/duel.js');
    await expireStaleDuels();
  } catch { /* arena expiry is best-effort */ }

  // Run promotion checks for all characters (returns who advanced, for the wire)
  const promotions = await checkPromotions();

  // Current #1 spacer for the leaderboard beat
  const leaderChar = await prisma.character.findFirst({
    orderBy: { score: 'desc' },
    select: { name: true, score: true, rank: true },
  });
  const leader = leaderChar?.name
    ? { name: cleanName(leaderChar.name), score: leaderChar.score ?? 0, rank: (leaderChar.rank as string) ?? 'LIEUTENANT' }
    : null;

  // Curate the galactic news wire
  summary.digest = buildGalacticDigest({ results, promotions, leader }, rng);

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
async function checkPromotions(): Promise<DigestPromotion[]> {
  const { Rank } = await import('@prisma/client');
  const { getHonorarium, addCredits: addCr } = await import('../game/utils.js');

  const characters = await prisma.character.findMany({
    where: { rank: { not: Rank.GIGA_HERO } },
  });

  const promoted: DigestPromotion[] = [];
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
      promoted.push({ name: cleanName(char.name), rank: newRank });
    }
  }
  return promoted;
}
