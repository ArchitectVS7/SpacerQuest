/**
 * SpacerQuest v4.0 - Authentication Routes
 *
 * OAuth integration with BBS Portal
 * DB-backed session management for revocation support
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { createCharacterBody } from '../schemas.js';

/**
 * Register authentication routes
 */
export async function registerAuthRoutes(fastify: FastifyInstance) {
  // OAuth login callback
  fastify.get('/auth/callback', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { code } = request.query as { code?: string };

    if (!code) {
      return reply.status(400).send({ error: 'Authorization code required' });
    }

    try {
      // Check if using mock OAuth
      const isMock = process.env.NODE_ENV === 'development' ||
                     process.env.BBS_PORTAL_TOKEN_URL?.includes('mock');

      let userInfo: any;

      if (isMock) {
        const mockId = `dev-user-${randomUUID().slice(0, 8)}`;
        userInfo = {
          id: mockId,
          email: `${mockId}@spacerquest.test`,
          displayName: 'Dev User',
        };
      } else {
        const tokenResponse = await fetch(process.env.BBS_PORTAL_TOKEN_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: process.env.BBS_PORTAL_CLIENT_ID!,
            client_secret: process.env.BBS_PORTAL_CLIENT_SECRET!,
            redirect_uri: process.env.BBS_PORTAL_CALLBACK_URL!,
          }),
        });

        if (!tokenResponse.ok) {
          throw new Error('OAuth token exchange failed');
        }

        const tokenData = await tokenResponse.json();

        const userInfoResponse = await fetch(process.env.BBS_PORTAL_USERINFO_URL!, {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
          },
        });

        userInfo = await userInfoResponse.json();
      }

      let user = await prisma.user.findUnique({
        where: { bbsUserId: userInfo.id },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            bbsUserId: userInfo.id,
            email: userInfo.email,
            displayName: userInfo.displayName,
          },
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      const jwt = fastify.jwt.sign({
        userId: user.id,
        bbsUserId: user.bbsUserId
      });

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await prisma.session.create({
        data: {
          userId: user.id,
          token: jwt,
          expiresAt,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
      });

      return reply.redirect(`/?token=${jwt}`);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Authentication failed' });
    }
  });

  // Check if user has character
  fastify.get('/auth/status', {
    preValidation: [requireAuth],
  }, async (request, _reply) => {
    const { userId } = request.user as { userId: string };

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    return {
      hasCharacter: !!character,
      character: character ? {
        id: character.id,
        name: character.name,
        shipName: character.shipName,
        rank: character.rank,
      } : null,
    };
  });

  // Create new character
  fastify.post('/auth/character', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const parsed = createCharacterBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const registrySystem = await import('../../game/systems/registry.js');
    const result = await registrySystem.registerCharacter(userId, parsed.data.name, parsed.data.shipName);

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return reply.status(201).send({
      id: result.character!.id,
      name: result.character!.name,
      shipName: result.character!.shipName,
    });
  });

  // Logout with session revocation
  fastify.post('/auth/logout', {
    preValidation: [requireAuth],
  }, async (request, _reply) => {
    const { userId } = request.user as { userId: string };
    const authHeader = request.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || (request.query as { token?: string }).token;

    const saveSystem = await import('../../game/systems/save.js');
    await saveSystem.saveAndLogout(userId, token);

    return { success: true, message: 'Logged out successfully' };
  });

  // Get active sessions for user
  fastify.get('/auth/sessions', {
    preValidation: [requireAuth],
  }, async (request, _reply) => {
    const { userId } = request.user as { userId: string };

    const sessions = await prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      sessions: sessions.map(s => ({
        id: s.id,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        current: s.userAgent === request.headers['user-agent'],
      })),
    };
  });

  // Revoke specific session
  fastify.delete('/auth/sessions/:sessionId', {
    preValidation: [requireAuth],
  }, async (request, _reply) => {
    const { userId } = request.user as { userId: string };
    const { sessionId } = request.params as { sessionId: string };

    const deleted = await prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });

    return {
      success: deleted.count > 0,
      message: deleted.count > 0 ? 'Session revoked' : 'Session not found',
    };
  });

  // Revoke all sessions (emergency logout everywhere)
  fastify.post('/auth/logout-all', {
    preValidation: [requireAuth],
  }, async (request, _reply) => {
    const { userId } = request.user as { userId: string };

    const saveSystem = await import('../../game/systems/save.js');
    await saveSystem.emergencyLogoutAll(userId);

    return { success: true, message: 'All sessions revoked' };
  });

  // Dev Login (only in development)
  if (process.env.NODE_ENV !== 'production') {
    fastify.get('/auth/dev-login', async (request, reply) => {
      try {
        let user = await prisma.user.findFirst();

        if (!user) {
          user = await prisma.user.create({
            data: {
              bbsUserId: 'dev-local-user-id',
              email: 'dev@localhost.test',
              displayName: 'Local Dev User',
            },
          });
        }

        const jwt = fastify.jwt.sign({
          userId: user.id,
          bbsUserId: user.bbsUserId
        });

        return reply.redirect(`/?token=${jwt}`);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Dev login failed' });
      }
    });
  }
}
