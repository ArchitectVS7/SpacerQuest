/**
 * SpacerQuest v4.0 - Combat Routes
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { engageBody, combatActionBody } from '../schemas.js';
import { calculateComponentPower } from '../../game/utils.js';

export async function registerCombatRoutes(fastify: FastifyInstance) {
  // Start combat encounter
  fastify.post('/api/combat/engage', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = engageBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { attack } = body.data;

    const { generateEncounter, calculateBattleFactor, calculateEnemyBattleFactor, isNpcFriendly } =
      await import('../../game/systems/combat.js');

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    // Generate enemy from NPC roster (async DB lookup)
    const enemy = await generateEncounter(
      character.currentSystem,
      character.missionType,
      character.score
    );

    if (!enemy) {
      return { encounter: false, message: 'No enemy encountered' };
    }

    // Same-alliance NPC check — original SP.FIGHT1.S:138
    if (isNpcFriendly(enemy, character.allianceSymbol)) {
      return {
        encounter: true,
        friendly: true,
        message: `${enemy.name} Hails A Friendly Greeting.`,
        enemy: {
          type: enemy.type,
          class: enemy.class,
          name: enemy.name,
          commander: enemy.commander,
        },
      };
    }

    // Calculate battle factors
    const playerBF = calculateBattleFactor(
      {
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
        hullStrength: character.ship.hullStrength,
        hullCondition: character.ship.hullCondition,
        hasAutoRepair: character.ship.hasAutoRepair,
      },
      character.rank,
      character.battlesWon,
      character.tripCount,
    );

    enemy.battleFactor = calculateEnemyBattleFactor(enemy, character.tripCount);

    // Create CombatSession for disconnect mitigation
    await prisma.combatSession.upsert({
      where: { characterId: character.id },
      update: {
        npcRosterId: enemy.npcRosterId || null,
        playerWeaponPower: calculateComponentPower(character.ship.weaponStrength, character.ship.weaponCondition),
        playerShieldPower: calculateComponentPower(character.ship.shieldStrength, character.ship.shieldCondition),
        playerDrivePower: calculateComponentPower(character.ship.driveStrength, character.ship.driveCondition),
        playerBattleFactor: playerBF,
        enemyWeaponPower: enemy.weaponStrength || 20,
        enemyShieldPower: enemy.shieldStrength || 15,
        enemyDrivePower: enemy.driveStrength || 10,
        enemyBattleFactor: enemy.battleFactor,
        enemyHullCondition: enemy.hullCondition || 5,
        currentRound: 1,
        active: true,
        result: null,
      },
      create: {
        characterId: character.id,
        npcRosterId: enemy.npcRosterId || null,
        playerWeaponPower: calculateComponentPower(character.ship.weaponStrength, character.ship.weaponCondition),
        playerShieldPower: calculateComponentPower(character.ship.shieldStrength, character.ship.shieldCondition),
        playerDrivePower: calculateComponentPower(character.ship.driveStrength, character.ship.driveCondition),
        playerBattleFactor: playerBF,
        enemyWeaponPower: enemy.weaponStrength || 20,
        enemyShieldPower: enemy.shieldStrength || 15,
        enemyDrivePower: enemy.driveStrength || 10,
        enemyBattleFactor: enemy.battleFactor,
        enemyHullCondition: enemy.hullCondition || 5,
        currentRound: 1,
        active: true,
      },
    });

    return {
      encounter: true,
      enemy: {
        type: enemy.type,
        class: enemy.class,
        name: enemy.name,
        commander: enemy.commander,
        battleFactor: enemy.battleFactor,
        npcRosterId: enemy.npcRosterId,
        alliance: enemy.alliance,
      },
      playerBattleFactor: playerBF,
      attack,
    };
  });

  // Combat round action
  fastify.post('/api/combat/action', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = combatActionBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { action, round = 1, enemy } = body.data;

    const { processCombatRound, calculateBattleFactor, attemptRetreat } =
      await import('../../game/systems/combat.js');

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    if (action === 'RETREAT') {
      const retreat = attemptRetreat(
        (character.ship.driveStrength + (character.ship.hasTransWarpDrive ? 10 : 0)) * character.ship.driveCondition,
        ((enemy?.driveStrength as number) ?? 10) * ((enemy?.driveCondition as number) ?? 7) || 100,
        character.ship.hasCloaker
      );

      // Mark CombatSession inactive on successful retreat
      if (retreat.success) {
        await prisma.combatSession.updateMany({
          where: { characterId: character.id, active: true },
          data: { active: false, result: 'RETREAT' },
        });
      }

      return {
        success: retreat.success,
        message: retreat.message,
        retreated: retreat.success,
      };
    }

    if (action === 'SURRENDER') {
      await prisma.combatSession.updateMany({
        where: { characterId: character.id, active: true },
        data: { active: false, result: 'SURRENDER' },
      });
      return { success: true, message: 'You surrender to the enemy.', surrendered: true };
    }

    // Process combat round
    const playerBF = calculateBattleFactor(
      {
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
        hullStrength: character.ship.hullStrength,
        hullCondition: character.ship.hullCondition,
        hasAutoRepair: character.ship.hasAutoRepair,
      },
      character.rank,
      character.battlesWon,
      character.tripCount,
    );

    const combatRound = processCombatRound(
      playerBF,
      character.ship.weaponStrength,
      character.ship.weaponCondition,
      character.ship.shieldStrength,
      character.ship.shieldCondition,
      character.ship.hasAutoRepair,
      (enemy || {
        weaponStrength: 20,
        weaponCondition: 7,
        shieldStrength: 15,
        shieldCondition: 7,
        battleFactor: 200,
      }) as unknown as import('../../game/systems/combat.js').Enemy,
      round
    );

    // Update CombatSession round counter
    await prisma.combatSession.updateMany({
      where: { characterId: character.id, active: true },
      data: { currentRound: round + 1 },
    });

    // If combat ended, mark session inactive
    // Combat ends when either side's shields are destroyed (damage >= shield power)
    const combatEnded = combatRound.enemyShieldDamage >= 100 || combatRound.playerShieldDamage >= 100;
    if (combatEnded) {
      const result = combatRound.enemyShieldDamage >= 100 ? 'VICTORY' : 'DEFEAT';
      await prisma.combatSession.updateMany({
        where: { characterId: character.id, active: true },
        data: { active: false, result },
      });
    }

    return combatRound;
  });
}
