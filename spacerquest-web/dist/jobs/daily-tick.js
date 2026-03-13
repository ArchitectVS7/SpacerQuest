/**
 * SpacerQuest v4.0 - Daily Tick Job
 *
 * Runs at midnight UTC daily to:
 * - Reset trip counters for all players
 * - Collect port income
 * - Evict inactive port owners
 * - Generate daily news
 */
import { PrismaClient, Rank } from '@prisma/client';
import { addCredits, isDayDifferent, getDateString } from '../game/utils.js';
import { PORT_EVICTION_DAYS, } from '../game/constants.js';
const prisma = new PrismaClient();
/**
 * Run the daily tick
 */
export async function runDailyTick() {
    const now = new Date();
    const dateStr = getDateString();
    const result = {
        date: dateStr,
        tripsReset: 0,
        portsProcessed: 0,
        totalIncomeCollected: 0,
        portsEvicted: 0,
        promotionsGranted: 0,
        newsGenerated: [],
    };
    console.log(`[Daily Tick] Starting daily tick for ${dateStr}...`);
    // 1. Reset trip counters for all players
    console.log('[Daily Tick] Resetting trip counters...');
    const tripResetResult = await prisma.character.updateMany({
        where: { tripCount: { gt: 0 } },
        data: { tripCount: 0 },
    });
    result.tripsReset = tripResetResult.count;
    console.log(`[Daily Tick] Reset ${result.tripsReset} character trip counters`);
    // 2. Process port income
    console.log('[Daily Tick] Processing port income...');
    const ports = await prisma.portOwnership.findMany({
        include: {
            character: true,
        },
    });
    for (const port of ports) {
        const income = calculateDailyIncome(port);
        if (income > 0) {
            // Add income to port bank
            const { high, low } = addCredits(port.bankCreditsHigh, port.bankCreditsLow, income);
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
            const daysInactive = Math.floor((now.getTime() - port.lastActiveDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysInactive >= PORT_EVICTION_DAYS) {
                await evictPortOwner(port.id, port.characterId);
                result.portsEvicted++;
                result.newsGenerated.push(`Port at system ${port.systemId} seized due to ${daysInactive} days of inactivity`);
            }
        }
    }
    console.log(`[Daily Tick] Processed ${result.portsProcessed} ports, collected ${result.totalIncomeCollected} cr`);
    // 3. Check for promotions
    console.log('[Daily Tick] Checking for promotions...');
    const characters = await prisma.character.findMany({
        where: {
            rank: {
                not: Rank.GIGA_HERO,
            },
        },
    });
    for (const char of characters) {
        const newRank = calculateRankFromScore(char.score);
        if (newRank !== char.rank) {
            const honorarium = getHonorariumForRank(newRank);
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
            result.newsGenerated.push(`${char.name} promoted to ${newRank}! Received ${honorarium} cr honorarium.`);
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
    console.log(`[Daily Tick] Granted ${result.promotionsGranted} promotions`);
    // 4. Generate daily news log
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
    console.log(`[Daily Tick] Daily tick completed successfully`);
    return result;
}
/**
 * Calculate daily income for a port
 */
function calculateDailyIncome(port) {
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
async function evictPortOwner(portId, characterId) {
    // Get port details for logging
    const port = await prisma.portOwnership.findUnique({
        where: { id: portId },
    });
    if (!port)
        return;
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
    console.log(`[Daily Tick] Evicted port owner from system ${port.systemId}`);
}
/**
 * Calculate rank from score (matches utils.ts)
 */
function calculateRankFromScore(score) {
    if (score >= 2700)
        return Rank.GIGA_HERO;
    if (score >= 1350)
        return Rank.MEGA_HERO;
    if (score >= 1100)
        return Rank.GRAND_MUFTI;
    if (score >= 900)
        return Rank.TOP_DOG;
    if (score >= 600)
        return Rank.ADMIRAL;
    if (score >= 450)
        return Rank.COMMODORE;
    if (score >= 300)
        return Rank.CAPTAIN;
    if (score >= 150)
        return Rank.COMMANDER;
    return Rank.LIEUTENANT;
}
/**
 * Get honorarium for rank
 */
function getHonorariumForRank(rank) {
    const honoraria = {
        LIEUTENANT: 0,
        COMMANDER: 20000,
        CAPTAIN: 30000,
        COMMODORE: 40000,
        ADMIRAL: 50000,
        TOP_DOG: 80000,
        GRAND_MUFTI: 100000,
        MEGA_HERO: 120000,
        GIGA_HERO: 150000,
    };
    return honoraria[rank] || 0;
}
/**
 * Reset daily landing fees and fuel sales tracking
 * Called after income is collected
 */
export async function resetDailyPortTracking() {
    await prisma.portOwnership.updateMany({
        data: {
            dailyLandingFees: 0,
            dailyFuelSales: 0,
        },
    });
}
//# sourceMappingURL=daily-tick.js.map