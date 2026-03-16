/**
 * SpacerQuest v4.0 - Social Routes
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { rescueBody, duelChallengeBody } from '../schemas.js';

export async function registerSocialRoutes(fastify: FastifyInstance) {
  // Get spacer directory
  fastify.get('/api/social/directory', async (_request, _reply) => {
    const spacers = await prisma.character.findMany({
      select: {
        spacerId: true,
        name: true,
        shipName: true,
        rank: true,
        allianceSymbol: true,
        score: true,
      },
      orderBy: { score: 'desc' },
      take: 100,
    });

    return {
      spacers: spacers.map(s => ({
        id: s.spacerId,
        name: s.name,
        shipName: s.shipName,
        rank: s.rank,
        alliance: s.allianceSymbol,
        score: s.score,
      })),
    };
  });

  // Get Top Gun rankings - Full category list from original
  fastify.get('/api/social/topgun', async (_request, _reply) => {
    const topgunSystem = await import('../../game/systems/topgun.js');
    return topgunSystem.getTopGunRankings();
  });

  // Get high score leaderboard
  fastify.get('/api/social/leaderboard', async (_request, _reply) => {
    const scores = await prisma.character.findMany({
      select: {
        name: true,
        score: true,
        rank: true,
      },
      orderBy: { score: 'desc' },
      take: 20,
    });

    return {
      scores: scores.map((s, i) => ({
        rank: i + 1,
        name: s.name,
        score: s.score,
        characterRank: s.rank,
      })),
    };
  });

  // Get battle log
  fastify.get('/api/social/battles', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const character = await prisma.character.findFirst({ where: { userId } });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    const battles = await prisma.battleRecord.findMany({
      where: { characterId: character.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return { battles };
  });

  // List lost ships for rescue service
  fastify.get('/api/social/lost-ships', {
    preValidation: [requireAuth],
  }, async (_request, _reply) => {
    const lostShips = await prisma.character.findMany({
      where: { isLost: true },
      select: {
        id: true,
        name: true,
        shipName: true,
        lostLocation: true,
        updatedAt: true,
      },
    });

    return {
      lostShips: lostShips.map(s => ({
        id: s.id,
        name: s.name,
        shipName: s.shipName || 'unnamed',
        lostLocation: s.lostLocation,
        lostAt: s.updatedAt,
      })),
    };
  });

  // Perform rescue
  fastify.post('/api/economy/rescue', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = rescueBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { targetId } = body.data;

    const rescuer = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!rescuer || !rescuer.ship) {
      return reply.status(400).send({ error: 'Character or ship not found' });
    }

    const { validateRescueAttempt, calculateRescueRewards } = await import('../../game/systems/rescue.js');
    const validation = validateRescueAttempt({
      fuel: rescuer.ship.fuel,
      isLost: rescuer.isLost,
    });

    if (!validation.canRescue) {
      return reply.status(400).send({ error: validation.reason });
    }

    const target = await prisma.character.findUnique({ where: { id: targetId } });
    if (!target || !target.isLost) {
      return reply.status(400).send({ error: 'Target is not lost in space' });
    }

    const rewards = calculateRescueRewards();

    const { addCredits } = await import('../../game/utils.js');

    // Update rescuer: +credits, -fuel, +score, +rescue count
    const { high, low } = addCredits(rescuer.creditsHigh, rescuer.creditsLow, rewards.creditsFee);
    await prisma.character.update({
      where: { id: rescuer.id },
      data: {
        creditsHigh: high,
        creditsLow: low,
        score: { increment: rewards.scoreBonus },
        rescuesPerformed: { increment: 1 },
      },
    });

    await prisma.ship.update({
      where: { id: rescuer.ship.id },
      data: { fuel: rescuer.ship.fuel - rewards.fuelCost },
    });

    // Update rescued character: no longer lost
    await prisma.character.update({
      where: { id: targetId },
      data: {
        isLost: false,
        lostLocation: null,
      },
    });

    // Log the rescue
    await prisma.gameLog.create({
      data: {
        type: 'RESCUE',
        characterId: rescuer.id,
        message: `${rescuer.name} rescued ${target.name} from near system ${target.lostLocation}`,
        metadata: {
          rescuerId: rescuer.id,
          targetId: target.id,
          location: target.lostLocation,
        },
      },
    });

    return {
      success: true,
      message: `Rescued ${target.name}! Salvage fee: ${rewards.creditsFee} cr`,
      rewards,
    };
  });

  // Challenge to duel
  fastify.post('/api/duel/challenge', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = duelChallengeBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { targetId, stakesType, stakesAmount, arenaType } = body.data;

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    // Enforce arena requirements
    const { ARENA_REQUIREMENTS } = await import('../../game/constants.js');

    if (arenaType === 1 && character.tripsCompleted < ARENA_REQUIREMENTS.ION_CLOUD.trips) {
      return reply.status(400).send({ error: `Ion Cloud arena requires ${ARENA_REQUIREMENTS.ION_CLOUD.trips} trips completed` });
    }
    if (arenaType === 2 && character.astrecsTraveled < ARENA_REQUIREMENTS.PROTON_STORM.astrecs) {
      return reply.status(400).send({ error: `Proton Storm arena requires ${ARENA_REQUIREMENTS.PROTON_STORM.astrecs} astrecs traveled` });
    }
    if (arenaType === 3 && character.cargoDelivered < ARENA_REQUIREMENTS.COSMIC_RADIATION.cargo) {
      return reply.status(400).send({ error: `Cosmic Radiation arena requires ${ARENA_REQUIREMENTS.COSMIC_RADIATION.cargo} cargo deliveries` });
    }
    if (arenaType === 4 && character.rescuesPerformed < ARENA_REQUIREMENTS.BLACK_HOLE.rescues) {
      return reply.status(400).send({ error: `Black Hole arena requires ${ARENA_REQUIREMENTS.BLACK_HOLE.rescues} rescues` });
    }

    // Calculate handicap
    const h = character.ship.hullStrength * character.ship.hullCondition;
    const d = character.ship.driveStrength * character.ship.driveCondition;
    const c = character.ship.cabinStrength * character.ship.cabinCondition;
    const l = character.ship.lifeSupportStrength * character.ship.lifeSupportCondition;
    const w = character.ship.weaponStrength * character.ship.weaponCondition;
    const n = character.ship.navigationStrength * character.ship.navigationCondition;
    const r = character.ship.roboticsStrength * character.ship.roboticsCondition;
    const p = character.ship.shieldStrength * character.ship.shieldCondition;

    const handicap = Math.floor((h + d + c + l + w + n + r + p) / 500);

    // Create duel entry
    const duel = await prisma.duelEntry.create({
      data: {
        challengerId: character.id,
        contenderId: targetId ? String(targetId) : null,
        stakesType,
        stakesAmount,
        arenaType,
        handicap,
      },
    });

    return {
      success: true,
      duel: {
        id: duel.id,
        stakesType: duel.stakesType,
        stakesAmount: duel.stakesAmount,
        arenaType: duel.arenaType,
        handicap: duel.handicap,
        status: duel.status,
      },
    };
  });

  // Accept duel challenge
  fastify.post('/api/duel/accept/:duelId', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { duelId } = request.params as { duelId: string };

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    const duel = await prisma.duelEntry.findUnique({
      where: { id: duelId },
      include: {
        challenger: { include: { ship: true } },
      },
    });

    if (!duel) {
      return reply.status(404).send({ error: 'Duel not found' });
    }

    if (duel.status !== 'PENDING') {
      return reply.status(400).send({ error: 'Duel is not pending' });
    }

    if (duel.contenderId && duel.contenderId !== character.id) {
      return reply.status(400).send({ error: 'This duel is not for you' });
    }

    // Accept the duel
    await prisma.duelEntry.update({
      where: { id: duelId },
      data: {
        contenderId: character.id,
        status: 'ACCEPTED',
      },
    });

    return {
      success: true,
      message: 'Duel accepted! Prepare for combat.',
      duel: {
        id: duel.id,
        challenger: duel.challenger.name,
        contender: character.name,
        stakesType: duel.stakesType,
        stakesAmount: duel.stakesAmount,
        arenaType: duel.arenaType,
      },
    };
  });

  // Resolve duel (simulate combat)
  fastify.post('/api/duel/resolve/:duelId', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { duelId } = request.params as { duelId: string };

    const duel = await prisma.duelEntry.findUnique({
      where: { id: duelId },
      include: {
        challenger: { include: { ship: true } },
        contender: { include: { ship: true } },
      },
    });

    if (!duel || !duel.challenger.ship || !duel.contender.ship) {
      return reply.status(404).send({ error: 'Duel not found or ships missing' });
    }

    if (duel.status !== 'ACCEPTED') {
      return reply.status(400).send({ error: 'Duel is not ready to resolve' });
    }

    // Calculate battle factors
    const { calculateBattleFactor } = await import('../../game/systems/combat.js');

    const challengerBF = calculateBattleFactor(
      {
        weaponStrength: duel.challenger.ship.weaponStrength,
        weaponCondition: duel.challenger.ship.weaponCondition,
        shieldStrength: duel.challenger.ship.shieldStrength,
        shieldCondition: duel.challenger.ship.shieldCondition,
        cabinStrength: duel.challenger.ship.cabinStrength,
        cabinCondition: duel.challenger.ship.cabinCondition,
        roboticsStrength: duel.challenger.ship.roboticsStrength,
        roboticsCondition: duel.challenger.ship.roboticsCondition,
        lifeSupportStrength: duel.challenger.ship.lifeSupportStrength,
        lifeSupportCondition: duel.challenger.ship.lifeSupportCondition,
        navigationStrength: duel.challenger.ship.navigationStrength,
        navigationCondition: duel.challenger.ship.navigationCondition,
        driveStrength: duel.challenger.ship.driveStrength,
        driveCondition: duel.challenger.ship.driveCondition,
        hasAutoRepair: duel.challenger.ship.hasAutoRepair,
      },
      duel.challenger.rank,
      duel.challenger.battlesWon
    );

    const contenderBF = calculateBattleFactor(
      {
        weaponStrength: duel.contender.ship.weaponStrength,
        weaponCondition: duel.contender.ship.weaponCondition,
        shieldStrength: duel.contender.ship.shieldStrength,
        shieldCondition: duel.contender.ship.shieldCondition,
        cabinStrength: duel.contender.ship.cabinStrength,
        cabinCondition: duel.contender.ship.cabinCondition,
        roboticsStrength: duel.contender.ship.roboticsStrength,
        roboticsCondition: duel.contender.ship.roboticsCondition,
        lifeSupportStrength: duel.contender.ship.lifeSupportStrength,
        lifeSupportCondition: duel.contender.ship.lifeSupportCondition,
        navigationStrength: duel.contender.ship.navigationStrength,
        navigationCondition: duel.contender.ship.navigationCondition,
        driveStrength: duel.contender.ship.driveStrength,
        driveCondition: duel.contender.ship.driveCondition,
        hasAutoRepair: duel.contender.ship.hasAutoRepair,
      },
      duel.contender.rank,
      duel.contender.battlesWon
    );

    // Add randomness
    const challengerRoll = challengerBF * (0.8 + Math.random() * 0.4);
    const contenderRoll = contenderBF * (0.8 + Math.random() * 0.4);

    const winner = challengerRoll > contenderRoll ? duel.challenger : duel.contender;
    const loser = challengerRoll > contenderRoll ? duel.contender : duel.challenger;

    // Update winner stats
    await prisma.character.update({
      where: { id: winner.id },
      data: {
        battlesWon: { increment: 1 },
        score: { increment: duel.stakesAmount / 10 },
      },
    });

    // Update loser stats
    await prisma.character.update({
      where: { id: loser.id },
      data: {
        battlesLost: { increment: 1 },
      },
    });

    // Handle stakes transfer
    if (duel.stakesType === 'credits') {
      const { subtractCredits, addCredits } = await import('../../game/utils.js');

      const loserCredits = subtractCredits(loser.creditsHigh, loser.creditsLow, duel.stakesAmount);
      if (loserCredits.success) {
        const winnerCredits = addCredits(winner.creditsHigh, winner.creditsLow, duel.stakesAmount);

        await prisma.character.update({
          where: { id: loser.id },
          data: { creditsHigh: loserCredits.high, creditsLow: loserCredits.low },
        });
        await prisma.character.update({
          where: { id: winner.id },
          data: { creditsHigh: winnerCredits.high, creditsLow: winnerCredits.low },
        });
      }
    }

    // Mark duel as completed
    await prisma.duelEntry.update({
      where: { id: duelId },
      data: {
        status: 'COMPLETED',
        result: winner.id === duel.challenger.id ? 'VICTORY' : 'DEFEAT',
        completedAt: new Date(),
      },
    });

    // Log the duel
    await prisma.gameLog.create({
      data: {
        type: 'DUEL',
        message: `Duel: ${winner.name} defeated ${loser.name}`,
        metadata: {
          winnerId: winner.id,
          loserId: loser.id,
          stakesType: duel.stakesType,
          stakesAmount: duel.stakesAmount,
        },
      },
    });

    return {
      success: true,
      result: {
        winner: winner.name,
        loser: loser.name,
        winnerBF: Math.floor(challengerRoll > contenderRoll ? challengerRoll : contenderRoll),
        loserBF: Math.floor(challengerRoll > contenderRoll ? contenderRoll : challengerRoll),
      },
    };
  });
}
