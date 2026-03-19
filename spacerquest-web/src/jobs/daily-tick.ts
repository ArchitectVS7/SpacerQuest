/**
 * SpacerQuest v4.0 - Daily Tick Job
 * 
 * Runs at midnight UTC daily to:
 * - Reset trip counters for all players
 * - Collect port income
 * - Evict inactive port owners
 * - Generate daily news
 */

import { Rank } from '@prisma/client';
import { addCredits, isDayDifferent, getDateString, calculateRank, getHonorarium } from '../game/utils.js';
import {
  PORT_EVICTION_DAYS,
} from '../game/constants.js';
import { prisma } from '../db/prisma.js';
import { publishDailyTick } from './event-publisher.js';
import { workerLogger } from './logger.js';
import { generateNpcBulletinPosts } from '../game/systems/bulletin-board.js';
import { isClassicMode } from '../bots/config.js';

const log = workerLogger.child({ job: 'daily-tick' });

export interface DailyTickResult {
  date: string;
  tripsReset: number;
  portsProcessed: number;
  totalIncomeCollected: number;
  portsEvicted: number;
  promotionsGranted: number;
  npcBulletinPosts: number;
  newsGenerated: string[];
}

/**
 * Run the daily tick
 */
export async function runDailyTick(): Promise<DailyTickResult> {
  const now = new Date();
  const dateStr = getDateString();
  
  const result: DailyTickResult = {
    date: dateStr,
    tripsReset: 0,
    portsProcessed: 0,
    totalIncomeCollected: 0,
    portsEvicted: 0,
    promotionsGranted: 0,
    npcBulletinPosts: 0,
    newsGenerated: [],
  };
  
  log.info(`Starting daily tick for ${dateStr}`);
  
  // 1. Reset trip counters for all players (only in classic mode)
  if (isClassicMode()) {
    log.info('Resetting trip counters (classic mode)');
    const tripResetResult = await prisma.character.updateMany({
      where: { tripCount: { gt: 0 } },
      data: { tripCount: 0 },
    });
    result.tripsReset = tripResetResult.count;
    log.info(`Reset ${result.tripsReset} character trip counters`);
  } else {
    log.info('Skipping trip reset (end-turn mode handles trip resets)');
  }
  
  // 2. Process port income
  log.info('Processing port income');
  const ports = await prisma.portOwnership.findMany({
    include: {
      character: true,
    },
  });
  
  for (const port of ports) {
    const income = calculateDailyIncome(port);
    
    if (income > 0) {
      // Add income to port bank
      const { high, low } = addCredits(
        port.bankCreditsHigh,
        port.bankCreditsLow,
        income
      );
      
      await prisma.portOwnership.update({
        where: { id: port.id },
        data: {
          bankCreditsHigh: high,
          bankCreditsLow: low,
          lastFeeCollection: now,
        },
      });
      
      result.portsProcessed++;
      result.totalIncomeCollected += income;
    }
    
    // Check for inactive port eviction
    if (isDayDifferent(port.lastActiveDate, now)) {
      const daysInactive = Math.floor(
        (now.getTime() - port.lastActiveDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysInactive >= PORT_EVICTION_DAYS) {
        await evictPortOwner(port.id, port.characterId);
        result.portsEvicted++;
        result.newsGenerated.push(
          `Port at system ${port.systemId} seized due to ${daysInactive} days of inactivity`
        );
      }
    }
  }
  
  log.info(`Processed ${result.portsProcessed} ports, collected ${result.totalIncomeCollected} cr`);
  
  // 3. Check for promotions
  log.info('Checking for promotions');
  const characters = await prisma.character.findMany({
    where: {
      rank: {
        not: Rank.GIGA_HERO,
      },
    },
  });
  
  for (const char of characters) {
    const newRank = calculateRank(char.score);

    if (newRank !== char.rank) {
      const honorarium = getHonorarium(newRank);
      
      // Update character
      await prisma.character.update({
        where: { id: char.id },
        data: {
          rank: newRank,
          promotions: char.promotions + 1,
          creditsHigh: char.creditsHigh + Math.floor(honorarium / 10000),
          creditsLow: char.creditsLow + (honorarium % 10000),
        },
      });
      
      result.promotionsGranted++;
      result.newsGenerated.push(
        `${char.name} promoted to ${newRank}! Received ${honorarium} cr honorarium.`
      );
      
      // Log the promotion
      await prisma.gameLog.create({
        data: {
          type: 'PROMOTION',
          characterId: char.id,
          message: `${char.name} promoted to ${newRank}`,
          metadata: {
            fromRank: char.rank,
            toRank: newRank,
            honorarium,
          },
        },
      });
    }
  }
  
  log.info(`Granted ${result.promotionsGranted} promotions`);

  // 4. Generate NPC bulletin board posts
  log.info('Generating NPC bulletin board posts');
  try {
    const npcPosts = await generateNpcBulletinPosts();
    result.npcBulletinPosts = npcPosts;
    log.info(`Generated ${npcPosts} NPC bulletin board posts`);
  } catch (err) {
    log.warn('Failed to generate NPC bulletin posts (NPC roster may not be seeded yet)');
  }

  // 5. Generate daily news log
  if (result.newsGenerated.length > 0) {
    await prisma.gameLog.create({
      data: {
        type: 'SYSTEM',
        message: `Daily tick completed: ${result.newsGenerated.length} events`,
        metadata: {
          date: dateStr,
          events: result.newsGenerated,
          tripsReset: result.tripsReset,
          portsProcessed: result.portsProcessed,
          totalIncomeCollected: result.totalIncomeCollected,
          portsEvicted: result.portsEvicted,
          promotionsGranted: result.promotionsGranted,
        },
      },
    });
  }
  
  log.info('Daily tick completed successfully');

  // Publish summary to connected clients via Redis pub/sub
  await publishDailyTick({
    tripsReset: result.tripsReset,
    portsProcessed: result.portsProcessed,
    promotionsGranted: result.promotionsGranted,
    newsGenerated: result.newsGenerated,
  });

  return result;
}

/**
 * Calculate daily income for a port
 */
function calculateDailyIncome(port: { dailyLandingFees: number; dailyFuelSales: number }): number {
  // Base income from landing fees (simulated)
  const baseIncome = port.dailyLandingFees || 0;
  
  // Income from fuel sales (simulated)
  const fuelIncome = port.dailyFuelSales || 0;
  
  // If no specific tracking, use a base minimum
  if (baseIncome === 0 && fuelIncome === 0) {
    return Math.floor(Math.random() * 500) + 100; // 100-600 cr base income
  }
  
  return baseIncome + fuelIncome;
}

/**
 * Evict a port owner
 */
async function evictPortOwner(portId: string, characterId: string): Promise<void> {
  // Get port details for logging
  const port = await prisma.portOwnership.findUnique({
    where: { id: portId },
  });
  
  if (!port) return;
  
  // Reset port ownership
  await prisma.portOwnership.delete({
    where: { id: portId },
  });
  
  // Log the eviction
  await prisma.gameLog.create({
    data: {
      type: 'SYSTEM',
      characterId,
      systemId: port.systemId,
      message: `Port ownership at system ${port.systemId} revoked due to inactivity`,
    },
  });
  
  log.info(`Evicted port owner from system ${port.systemId}`);
}

// calculateRank and getHonorarium are now imported from '../game/utils.js'
// (previously had stale thresholds — e.g. Admiral=600 instead of correct 750)

/**
 * Reset daily landing fees and fuel sales tracking
 * Called after income is collected
 */
export async function resetDailyPortTracking(): Promise<void> {
  await prisma.portOwnership.updateMany({
    data: {
      dailyLandingFees: 0,
      dailyFuelSales: 0,
    },
  });
}
