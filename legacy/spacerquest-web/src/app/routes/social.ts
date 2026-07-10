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

    const character = await prisma.character.findFirst({ where: { userId } });
    if (!character) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    // Resolve optional target spacerId → character id (open to Anyone if unset)
    let targetCharacterId: string | null = null;
    if (targetId) {
      const target = await prisma.character.findFirst({ where: { spacerId: targetId } });
      targetCharacterId = target?.id ?? null;
    }

    const { createDuelChallenge } = await import('../../game/systems/duel.js');
    const result = await createDuelChallenge(character.id, {
      stakesType, stakesAmount, arenaType, targetCharacterId,
    });
    if (result.ok === false) {
      return reply.status(400).send({ error: result.error });
    }

    return {
      success: true,
      duel: {
        id: result.duelId,
        stakesType, stakesAmount, arenaType,
        handicap: result.handicap,
        status: 'PENDING',
      },
    };
  });

  // Accept duel challenge
  fastify.post('/api/duel/accept/:duelId', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { duelId } = request.params as { duelId: string };

    const character = await prisma.character.findFirst({ where: { userId } });
    if (!character) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    const { acceptDuelChallenge } = await import('../../game/systems/duel.js');
    const result = await acceptDuelChallenge(duelId, character.id);
    if (result.ok === false) {
      const code = result.error === 'Duel not found' ? 404 : 400;
      return reply.status(code).send({ error: result.error });
    }

    return { success: true, message: 'Duel accepted! Prepare for combat.' };
  });

  // Resolve duel (simulate combat)
  fastify.post('/api/duel/resolve/:duelId', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { duelId } = request.params as { duelId: string };

    const { resolveDuel } = await import('../../game/systems/duel.js');
    const result = await resolveDuel(duelId);
    if (result.ok === false) {
      const code = result.error.includes('not found') ? 404 : 400;
      return reply.status(code).send({ error: result.error });
    }

    const r = result.resolution;
    if (r.draw) {
      return { success: true, result: { draw: true, salvos: r.salvos, message: r.message } };
    }
    return {
      success: true,
      result: {
        winner: r.winnerName,
        loser: r.loserName,
        winnerHits: r.winnerHits,
        loserHits: r.loserHits,
        stakesTransferred: r.stakesTransferred,
        salvos: r.salvos,
      },
    };
  });
}
