/**
 * SpacerQuest v4.0 - Shared Auth Middleware
 *
 * Reusable JWT preValidation hooks for protected routes.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../db/prisma.js';

/**
 * JWT preValidation hook — attach to any route that requires authentication.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (_err) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

/**
 * Admin preValidation hook — verifies JWT and checks isAdmin flag.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (_err) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  const payload = request.user as { userId: string };
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isAdmin: true },
  });

  if (!user || !user.isAdmin) {
    reply.code(403).send({ error: 'Admin access required' });
  }
}
