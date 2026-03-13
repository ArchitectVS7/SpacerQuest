/**
 * SpacerQuest v4.0 - Encounter Generation Job
 *
 * Runs every 5 minutes to:
 * - Generate bot-vs-bot combats
 * - Process port takeover attempts
 * - Update fuel prices based on supply/demand
 */
import { PrismaClient, AllianceType } from '@prisma/client';
import { randomInt, checkProbability } from '../game/utils.js';
import { calculateBattleFactor } from '../game/systems/combat.js';
const prisma = new PrismaClient();
/**
 * Run the encounter generation job
 */
export async function runEncounterJob() {
    const result = {
        botCombats: 0,
        takeoverAttempts: 0,
        successfulTakeovers: 0,
        priceUpdates: 0,
    };
    console.log('[Encounter Job] Starting encounter generation...');
    // 1. Generate bot-vs-bot combats
    result.botCombats = await generateBotCombats();
    // 2. Process port takeover attempts
    const takeoverResult = await processTakeoverAttempts();
    result.takeoverAttempts = takeoverResult.attempts;
    result.successfulTakeovers = takeoverResult.successes;
    // 3. Update fuel prices (simple supply/demand)
    result.priceUpdates = await updateFuelPrices();
    console.log(`[Encounter Job] Completed: ${result.botCombats} bot combats, ${result.takeoverAttempts} takeover attempts`);
    return result;
}
/**
 * Generate bot-vs-bot combat encounters
 * Simulates combat between AI spacers
 */
async function generateBotCombats() {
    // Get active characters (excluding players currently in combat)
    const characters = await prisma.character.findMany({
        where: {
            ship: {
                weaponStrength: { gt: 0 },
                shieldStrength: { gt: 0 },
            },
        },
        include: {
            ship: true,
        },
        take: 50,
    });
    if (characters.length < 2)
        return 0;
    let combatCount = 0;
    // Generate some random combats
    const numCombats = randomInt(1, Math.min(5, Math.floor(characters.length / 2)));
    for (let i = 0; i < numCombats; i++) {
        const idx1 = randomInt(0, characters.length - 1);
        let idx2 = randomInt(0, characters.length - 1);
        // Make sure we don't fight ourselves
        while (idx2 === idx1) {
            idx2 = randomInt(0, characters.length - 1);
        }
        const attacker = characters[idx1];
        const defender = characters[idx2];
        // Simulate combat
        const attackerBF = calculateBattleFactor({
            weaponStrength: attacker.ship.weaponStrength,
            weaponCondition: attacker.ship.weaponCondition,
            shieldStrength: attacker.ship.shieldStrength,
            shieldCondition: attacker.ship.shieldCondition,
            cabinStrength: attacker.ship.cabinStrength,
            cabinCondition: attacker.ship.cabinCondition,
            roboticsStrength: attacker.ship.roboticsStrength,
            roboticsCondition: attacker.ship.roboticsCondition,
            lifeSupportStrength: attacker.ship.lifeSupportStrength,
            lifeSupportCondition: attacker.ship.lifeSupportCondition,
            navigationStrength: attacker.ship.navigationStrength,
            navigationCondition: attacker.ship.navigationCondition,
            driveStrength: attacker.ship.driveStrength,
            driveCondition: attacker.ship.driveCondition,
            hasAutoRepair: attacker.ship.hasAutoRepair,
        }, attacker.rank, attacker.battlesWon);
        const defenderBF = calculateBattleFactor({
            weaponStrength: defender.ship.weaponStrength,
            weaponCondition: defender.ship.weaponCondition,
            shieldStrength: defender.ship.shieldStrength,
            shieldCondition: defender.ship.shieldCondition,
            cabinStrength: defender.ship.cabinStrength,
            cabinCondition: defender.ship.cabinCondition,
            roboticsStrength: defender.ship.roboticsStrength,
            roboticsCondition: defender.ship.roboticsCondition,
            lifeSupportStrength: defender.ship.lifeSupportStrength,
            lifeSupportCondition: defender.ship.lifeSupportCondition,
            navigationStrength: defender.ship.navigationStrength,
            navigationCondition: defender.ship.navigationCondition,
            driveStrength: defender.ship.driveStrength,
            driveCondition: defender.ship.driveCondition,
            hasAutoRepair: defender.ship.hasAutoRepair,
        }, defender.rank, defender.battlesWon);
        // Determine winner (higher BF wins, with some randomness)
        const attackerRoll = attackerBF * (0.8 + Math.random() * 0.4);
        const defenderRoll = defenderBF * (0.8 + Math.random() * 0.4);
        const winner = attackerRoll > defenderRoll ? attacker : defender;
        const loser = attackerRoll > defenderRoll ? defender : attacker;
        // Update winner stats
        await prisma.character.update({
            where: { id: winner.id },
            data: {
                battlesWon: { increment: 1 },
                score: { increment: 10 },
            },
        });
        // Update loser stats
        await prisma.character.update({
            where: { id: loser.id },
            data: {
                battlesLost: { increment: 1 },
            },
        });
        // Log the combat
        await prisma.gameLog.create({
            data: {
                type: 'BATTLE',
                message: `Bot combat: ${winner.name} defeated ${loser.name}`,
                metadata: {
                    winnerId: winner.id,
                    loserId: loser.id,
                    winnerBF: attackerBF,
                    loserBF: defenderBF,
                },
            },
        });
        combatCount++;
    }
    return combatCount;
}
/**
 * Process hostile takeover attempts on alliance systems
 */
async function processTakeoverAttempts() {
    const allianceSystems = await prisma.allianceSystem.findMany({
        where: {
            alliance: {
                not: AllianceType.NONE,
            },
        },
    });
    let attempts = 0;
    let successes = 0;
    for (const system of allianceSystems) {
        // 1% daily chance of takeover attempt
        if (!checkProbability(0.01))
            continue;
        attempts++;
        // Check if system has cooldown
        if (system.lastTakeoverAttempt) {
            const daysSinceAttempt = Math.floor((Date.now() - system.lastTakeoverAttempt.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceAttempt < 7)
                continue; // 7 day cooldown
        }
        // Pick a random rival alliance
        const alliances = Object.values(AllianceType).filter(a => a !== AllianceType.NONE && a !== system.alliance);
        if (alliances.length === 0)
            continue;
        const attackingAlliance = alliances[randomInt(0, alliances.length - 1)];
        // DEFCON reduces success chance
        const baseSuccessChance = 0.3;
        const defconReduction = system.defconLevel * 0.02;
        const successChance = Math.max(0.05, baseSuccessChance - defconReduction);
        if (checkProbability(successChance)) {
            // Successful takeover
            await prisma.allianceSystem.update({
                where: { systemId: system.systemId },
                data: {
                    alliance: attackingAlliance,
                    lastTakeoverAttempt: new Date(),
                },
            });
            await prisma.gameLog.create({
                data: {
                    type: 'ALLIANCE',
                    systemId: system.systemId,
                    message: `${attackingAlliance} seized control of system ${system.systemId} from ${system.alliance}!`,
                    metadata: {
                        fromAlliance: system.alliance,
                        toAlliance: attackingAlliance,
                    },
                },
            });
            successes++;
        }
        else {
            // Failed attempt - update cooldown
            await prisma.allianceSystem.update({
                where: { systemId: system.systemId },
                data: {
                    lastTakeoverAttempt: new Date(),
                },
            });
        }
    }
    return { attempts, successes };
}
/**
 * Update fuel prices based on simple supply/demand
 */
async function updateFuelPrices() {
    const ports = await prisma.portOwnership.findMany();
    let updates = 0;
    for (const port of ports) {
        // Random price fluctuation
        const currentPrice = port.fuelPrice;
        const fluctuation = randomInt(-2, 2);
        let newPrice = currentPrice + fluctuation;
        // Clamp to valid range
        newPrice = Math.max(5, Math.min(50, newPrice));
        if (newPrice !== currentPrice) {
            await prisma.portOwnership.update({
                where: { id: port.id },
                data: {
                    fuelPrice: newPrice,
                },
            });
            updates++;
        }
    }
    return updates;
}
//# sourceMappingURL=encounter-generation.js.map