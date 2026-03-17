/**
 * SpacerQuest v4.0 - Alliance Bulletin Board Routes
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import z from 'zod';

export async function registerAllianceRoutes(fastify: FastifyInstance) {
  // GET /api/alliance/board - Read bulletin board posts
  fastify.get('/api/alliance/board', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const character = await prisma.character.findFirst({ where: { userId } });
    if (!character) {
      return reply.status(400).send({ error: 'Character not found' });
    }

    const membership = await prisma.allianceMembership.findUnique({
      where: { characterId: character.id },
    });

    if (!membership || membership.alliance === 'NONE') {
      return reply.status(400).send({ error: 'You must belong to an alliance' });
    }

    const posts = await prisma.bulletinPost.findMany({
      where: { alliance: membership.alliance },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return { success: true, alliance: membership.alliance, posts };
  });

  // POST /api/alliance/board - Write a bulletin board message
  fastify.post('/api/alliance/board', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const bodySchema = z.object({ message: z.string().min(1).max(79) });
    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { message } = body.data;

    const { validateMessage, formatBulletinPost } = await import('../../game/systems/bulletin-board.js');

    const character = await prisma.character.findFirst({ where: { userId } });
    if (!character) {
      return reply.status(400).send({ error: 'Character not found' });
    }

    const membership = await prisma.allianceMembership.findUnique({
      where: { characterId: character.id },
    });

    if (!membership || membership.alliance === 'NONE') {
      return reply.status(400).send({ error: 'You must belong to an alliance' });
    }

    const validation = validateMessage(message);
    if (!validation.valid) {
      return reply.status(400).send({ error: validation.error });
    }

    const post = await prisma.bulletinPost.create({
      data: {
        alliance: membership.alliance,
        authorName: character.name,
        characterId: character.id,
        message: formatBulletinPost(character.name, message),
      },
    });

    return { success: true, post };
  });

  // DELETE /api/alliance/board - Kill (wipe) all messages on the board
  fastify.delete('/api/alliance/board', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const character = await prisma.character.findFirst({ where: { userId } });
    if (!character) {
      return reply.status(400).send({ error: 'Character not found' });
    }

    const membership = await prisma.allianceMembership.findUnique({
      where: { characterId: character.id },
    });

    if (!membership) {
      return reply.status(400).send({ error: 'You must belong to an alliance' });
    }

    const { count } = await prisma.bulletinPost.deleteMany({
      where: { alliance: membership.alliance },
    });

    return { success: true, deleted: count };
  });
}
