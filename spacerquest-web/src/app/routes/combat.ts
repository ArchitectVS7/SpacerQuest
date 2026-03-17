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

    const { generateEncounter, calculateBattleFactor, calculateEnemyBattleFactor } =
      await import('../../game/systems/combat.js');

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    // Generate enemy
    const enemy = generateEncounter(
      character.currentSystem,
      character.missionType,
      character.score
    );

    if (!enemy) {
      return { encounter: false, message: 'No enemy encountered' };
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
        hasAutoRepair: character.ship.hasAutoRepair,
      },
      character.rank,
      character.battlesWon
    );

    enemy.battleFactor = calculateEnemyBattleFactor(enemy);

    // Create CombatSession for disconnect mitigation
    await prisma.combatSession.upsert({
      where: { characterId: character.id },
      update: {
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
        character.ship.driveStrength * character.ship.driveCondition,
        enemy?.driveStrength * enemy?.driveCondition || 100,
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
        hasAutoRepair: character.ship.hasAutoRepair,
      },
      character.rank,
      character.battlesWon
    );

    const combatRound = processCombatRound(
      playerBF,
      character.ship.weaponStrength,
      character.ship.weaponCondition,
      character.ship.shieldStrength,
      character.ship.shieldCondition,
      enemy || {
        weaponStrength: 20,
        weaponCondition: 7,
        shieldStrength: 15,
        shieldCondition: 7,
        battleFactor: 200,
      },
      round
    );

    // Update CombatSession round counter
    await prisma.combatSession.updateMany({
      where: { characterId: character.id, active: true },
      data: { currentRound: round + 1 },
    });

    // If combat ended (victory/defeat), mark session inactive
    if (combatRound.victory || combatRound.defeat) {
      const result = combatRound.victory ? 'VICTORY' : 'DEFEAT';
      await prisma.combatSession.updateMany({
        where: { characterId: character.id, active: true },
        data: { active: false, result },
      });
    }

    return combatRound;
  });
}
