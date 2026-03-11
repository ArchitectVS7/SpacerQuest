/**
 * SpacerQuest v4.0 - Social Routes
 */

import { FastifyInstance } from 'fastify';

export async function registerSocialRoutes(fastify: FastifyInstance) {
  const { PrismaClient } = await import('@prisma/client');
  
  // Get spacer directory
  fastify.get('/api/social/directory', async (request, reply) => {
    const prisma = new PrismaClient();
    
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
    
    await prisma.$disconnect();
    
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
  
  // Get Top Gun rankings
  fastify.get('/api/social/topgun', async (request, reply) => {
    const prisma = new PrismaClient();
    
    // Get top ships by various categories
    const topDrives = await prisma.character.findFirst({
      where: { ship: { driveStrength: { gt: 0 } } },
      include: { ship: true },
      orderBy: { ship: { driveStrength: 'desc' } },
    });
    
    const topWeapons = await prisma.character.findFirst({
      where: { ship: { weaponStrength: { gt: 0 } } },
      include: { ship: true },
      orderBy: { ship: { weaponStrength: 'desc' } },
    });
    
    const topShields = await prisma.character.findFirst({
      where: { ship: { shieldStrength: { gt: 0 } } },
      include: { ship: true },
      orderBy: { ship: { shieldStrength: 'desc' } },
    });
    
    await prisma.$disconnect();
    
    return {
      categories: [
        { name: 'Fastest Drives', leader: topDrives?.shipName || 'N/A', value: topDrives?.ship?.driveStrength || 0 },
        { name: 'Strongest Weapons', leader: topWeapons?.shipName || 'N/A', value: topWeapons?.ship?.weaponStrength || 0 },
        { name: 'Strongest Shields', leader: topShields?.shipName || 'N/A', value: topShields?.ship?.shieldStrength || 0 },
      ],
    };
  });
  
  // Get high score leaderboard
  fastify.get('/api/social/leaderboard', async (request, reply) => {
    const prisma = new PrismaClient();
    
    const scores = await prisma.character.findMany({
      select: {
        name: true,
        score: true,
        rank: true,
      },
      orderBy: { score: 'desc' },
      take: 20,
    });
    
    await prisma.$disconnect();
    
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
    preValidation: [async (request, reply) => {
      try { await request.jwtVerify(); }
      catch (err) { reply.code(401).send({ error: 'Unauthorized' }); }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const prisma = new PrismaClient();
    
    const character = await prisma.character.findFirst({ where: { userId } });
    
    if (!character) {
      await prisma.$disconnect();
      return reply.status(404).send({ error: 'Character not found' });
    }
    
    const battles = await prisma.battleRecord.findMany({
      where: { characterId: character.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    
    await prisma.$disconnect();
    
    return { battles };
  });
  
  // Challenge to duel
  fastify.post('/api/duel/challenge', {
    preValidation: [async (request, reply) => {
      try { await request.jwtVerify(); }
      catch (err) { reply.code(401).send({ error: 'Unauthorized' }); }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { targetId, stakesType, stakesAmount, arenaType } = request.body as {
      targetId?: number;
      stakesType: string;
      stakesAmount: number;
      arenaType: number;
    };
    
    const prisma = new PrismaClient();
    
    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });
    
    if (!character || !character.ship) {
      await prisma.$disconnect();
      return reply.status(400).send({ error: 'No ship found' });
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
    
    await prisma.$disconnect();
    
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
}
