/**
 * SpacerQuest v4.0 - Authentication Routes
 *
 * OAuth integration with BBS Portal
 * DB-backed session management for revocation support
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { randomUUID } from 'crypto';

const createBodySchema = z.object({
  name: z.string().min(3).max(15),
  shipName: z.string().min(3).max(15),
});

/**
 * Register authentication routes
 */
export async function registerAuthRoutes(fastify: FastifyInstance) {
  // OAuth login callback
  fastify.get('/auth/callback', async (request, reply) => {
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
        // Use mock user info for development
        // Each call gets a unique ID and email so parallel tests don't collide
        const mockId = `dev-user-${randomUUID().slice(0, 8)}`;
        userInfo = {
          id: mockId,
          email: `${mockId}@spacerquest.test`,
          displayName: 'Dev User',
        };
      } else {
        // Exchange code for token (would call BBS Portal in production)
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

        // Get user info
        const userInfoResponse = await fetch(process.env.BBS_PORTAL_USERINFO_URL!, {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
          },
        });

        userInfo = await userInfoResponse.json();
      }
      
      // Find or create user in SpacerQuest
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
      
      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      
      // Generate JWT for SpacerQuest session
      const jwt = fastify.jwt.sign({ 
        userId: user.id, 
        bbsUserId: user.bbsUserId 
      });
      
      // Create session record in database for revocation support
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
      
      // Redirect to game with token
      return reply.redirect(`/?token=${jwt}`);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Authentication failed' });
    }
  });
  
  // Check if user has character
  fastify.get('/auth/status', {
    preValidation: [async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    }],
  }, async (request, reply) => {
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
    preValidation: [async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    let body;
    try {
      body = createBodySchema.parse(request.body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.errors?.[0]?.message || 'Invalid input' });
    }

    // Validate and register character
    const registrySystem = await import('../../game/systems/registry.js');
    const result = await registrySystem.registerCharacter(userId, body.name, body.shipName);
    
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
    preValidation: [async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const authHeader = request.headers.authorization;
    const token = authHeader?.replace('Bearer ', '') || (request.query as { token?: string }).token;
    
    const saveSystem = await import('../../game/systems/save.js');
    await saveSystem.saveAndLogout(userId, token);
    
    return { success: true, message: 'Logged out successfully' };
  });
  
  // Get active sessions for user
  fastify.get('/auth/sessions', {
    preValidation: [async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
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
    preValidation: [async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { sessionId } = request.params as { sessionId: string };
    
    const deleted = await prisma.session.deleteMany({
      where: {
        id: sessionId,
        userId,
      },
    });
    
    return { 
      success: deleted.count > 0,
      message: deleted.count > 0 ? 'Session revoked' : 'Session not found',
    };
  });
  
  // Revoke all sessions (emergency logout everywhere)
  fastify.post('/auth/logout-all', {
    preValidation: [async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    }],
  }, async (request, reply) => {
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
