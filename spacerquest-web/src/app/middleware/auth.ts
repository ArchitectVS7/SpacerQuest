/**
 * SpacerQuest v4.0 - Shared Auth Middleware
 *
 * Reusable JWT preValidation hook for protected routes.
 */

import { FastifyRequest, FastifyReply } from 'fastify';

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
