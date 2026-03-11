/**
 * SpacerQuest v4.0 - Authentication Routes
 * 
 * OAuth integration with BBS Portal
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';

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
      // Exchange code for token (mock for now - would call BBS Portal)
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
      
      const userInfo = await userInfoResponse.json();
      
      // Find or create user in SpacerQuest
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      
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
      
      await prisma.$disconnect();
      
      // Generate JWT for SpacerQuest session
      const jwt = fastify.jwt.sign({ 
        userId: user.id, 
        bbsUserId: user.bbsUserId 
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
    
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });
    
    await prisma.$disconnect();
    
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
    const body = createBodySchema.parse(request.body);
    
    // Validate names
    const { validateName } = await import('../game/utils.js');
    
    const nameValidation = validateName(body.name);
    if (!nameValidation.valid) {
      return reply.status(400).send({ error: nameValidation.error });
    }
    
    const shipValidation = validateName(body.shipName);
    if (!shipValidation.valid) {
      return reply.status(400).send({ error: `Ship name: ${shipValidation.error}` });
    }
    
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    // Check if user already has character
    const existing = await prisma.character.findFirst({
      where: { userId },
    });
    
    if (existing) {
      await prisma.$disconnect();
      return reply.status(400).send({ error: 'Character already exists' });
    }
    
    // Create character with starter ship
    const character = await prisma.character.create({
      data: {
        userId,
        name: body.name,
        shipName: body.shipName,
        creditsHigh: 0,
        creditsLow: 1000, // Starting 1,000 cr
        currentSystem: 1, // Sun-3
      },
    });
    
    // Create empty ship (needs components purchased)
    await prisma.ship.create({
      data: {
        characterId: character.id,
        hullStrength: 0,
        hullCondition: 0,
        driveStrength: 0,
        driveCondition: 0,
        cabinStrength: 0,
        cabinCondition: 0,
        lifeSupportStrength: 0,
        lifeSupportCondition: 0,
        weaponStrength: 0,
        weaponCondition: 0,
        navigationStrength: 0,
        navigationCondition: 0,
        roboticsStrength: 0,
        roboticsCondition: 0,
        shieldStrength: 0,
        shieldCondition: 0,
        fuel: 0,
        cargoPods: 0,
        maxCargoPods: 0,
      },
    });
    
    await prisma.$disconnect();
    
    // Log creation
    await prisma.gameLog.create({
      data: {
        type: 'SYSTEM',
        characterId: character.id,
        message: `New spacer created: ${body.name} of the ship ${body.shipName}`,
      },
    });
    
    return reply.status(201).send({
      id: character.id,
      name: character.name,
      shipName: character.shipName,
    });
  });
  
  // Logout
  fastify.post('/auth/logout', {
    preValidation: [async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    }],
  }, async (request, reply) => {
    // In production, would invalidate session in database
    return { success: true };
  });
}
