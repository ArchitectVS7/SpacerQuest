/**
 * SpacerQuest v4.0 - Combat Routes
 */
import { prisma } from '../../db/prisma.js';
export async function registerCombatRoutes(fastify) {
    // Start combat encounter
    fastify.post('/api/combat/engage', {
        preValidation: [async (request, reply) => {
                try {
                    await request.jwtVerify();
                }
                catch (err) {
                    reply.code(401).send({ error: 'Unauthorized' });
                }
            }],
    }, async (request, reply) => {
        const { userId } = request.user;
        const { attack } = request.body;
        const { generateEncounter, calculateBattleFactor, calculateEnemyBattleFactor } = await import('../../game/systems/combat.js');
        const character = await prisma.character.findFirst({
            where: { userId },
            include: { ship: true },
        });
        if (!character || !character.ship) {
            return reply.status(400).send({ error: 'No ship found' });
        }
        // Generate enemy
        const enemy = generateEncounter(character.currentSystem, character.missionType, character.score);
        if (!enemy) {
            return { encounter: false, message: 'No enemy encountered' };
        }
        // Calculate battle factors
        const playerBF = calculateBattleFactor({
            weaponStrength: character.ship.weaponStrength,
            weaponCondition: character.ship.weaponCondition,
            shieldStrength: character.ship.shieldStrength,
            shieldCondition: character.ship.shieldCondition,
            cabinStrength: character.ship.cabinStrength,
            cabinCondition: character.ship.cabinCondition,
            roboticsStrength: character.ship.roboticsStrength,
            roboticsCondition: character.ship.roboticsCondition,
            lifeSupportStrength: character.ship.lifeSupportStrength,
            lifeSupportCondition: character.ship.lifeSupportCondition,
            navigationStrength: character.ship.navigationStrength,
            navigationCondition: character.ship.navigationCondition,
            driveStrength: character.ship.driveStrength,
            driveCondition: character.ship.driveCondition,
            hasAutoRepair: character.ship.hasAutoRepair,
        }, character.rank, character.battlesWon);
        enemy.battleFactor = calculateEnemyBattleFactor(enemy);
        return {
            encounter: true,
            enemy: {
                type: enemy.type,
                class: enemy.class,
                name: enemy.name,
                commander: enemy.commander,
                battleFactor: enemy.battleFactor,
            },
            playerBattleFactor: playerBF,
            attack,
        };
    });
    // Combat round action
    fastify.post('/api/combat/action', {
        preValidation: [async (request, reply) => {
                try {
                    await request.jwtVerify();
                }
                catch (err) {
                    reply.code(401).send({ error: 'Unauthorized' });
                }
            }],
    }, async (request, reply) => {
        const { userId } = request.user;
        const { action, round = 1, enemy } = request.body;
        const { processCombatRound, calculateBattleFactor, attemptRetreat } = await import('../../game/systems/combat.js');
        const character = await prisma.character.findFirst({
            where: { userId },
            include: { ship: true },
        });
        if (!character || !character.ship) {
            return reply.status(400).send({ error: 'No ship found' });
        }
        if (action === 'RETREAT') {
            const retreat = attemptRetreat(character.ship.driveStrength * character.ship.driveCondition, enemy?.driveStrength * enemy?.driveCondition || 100, character.ship.hasCloaker);
            return {
                success: retreat.success,
                message: retreat.message,
                retreated: retreat.success,
            };
        }
        // Process combat round
        const playerBF = calculateBattleFactor({
            weaponStrength: character.ship.weaponStrength,
            weaponCondition: character.ship.weaponCondition,
            shieldStrength: character.ship.shieldStrength,
            shieldCondition: character.ship.shieldCondition,
            cabinStrength: character.ship.cabinStrength,
            cabinCondition: character.ship.cabinCondition,
            roboticsStrength: character.ship.roboticsStrength,
            roboticsCondition: character.ship.roboticsCondition,
            lifeSupportStrength: character.ship.lifeSupportStrength,
            lifeSupportCondition: character.ship.lifeSupportCondition,
            navigationStrength: character.ship.navigationStrength,
            navigationCondition: character.ship.navigationCondition,
            driveStrength: character.ship.driveStrength,
            driveCondition: character.ship.driveCondition,
            hasAutoRepair: character.ship.hasAutoRepair,
        }, character.rank, character.battlesWon);
        const combatRound = processCombatRound(playerBF, character.ship.weaponStrength, character.ship.weaponCondition, character.ship.shieldStrength, character.ship.shieldCondition, enemy || {
            weaponStrength: 20,
            weaponCondition: 7,
            shieldStrength: 15,
            shieldCondition: 7,
            battleFactor: 200,
        }, round);
        return combatRound;
    });
}
//# sourceMappingURL=combat.js.map