/**
 * SpacerQuest v4.0 - Character Routes
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { shipNameBody, allianceBody } from '../schemas.js';

export async function registerCharacterRoutes(fastify: FastifyInstance) {
  // Get character status
  fastify.get('/api/character', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const character = await prisma.character.findFirst({
      where: { userId },
      include: {
        ship: true,
        user: true,
      },
    });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    // Calculate daily trips remaining
    const { canTravel } = await import('../../game/systems/travel.js');
    const tripStatus = canTravel(character.tripCount, character.lastTripDate);

    return {
      character: {
        id: character.id,
        spacerId: character.spacerId,
        name: character.name,
        shipName: character.shipName,
        allianceSymbol: character.allianceSymbol,
        rank: character.rank,
        score: character.score,
        creditsHigh: character.creditsHigh,
        creditsLow: character.creditsLow,
        currentSystem: character.currentSystem,
        tripCount: character.tripCount,
        tripsCompleted: character.tripsCompleted,
        battlesWon: character.battlesWon,
        battlesLost: character.battlesLost,
        cargoPods: character.cargoPods,
        cargoType: character.cargoType,
        destination: character.destination,
        missionType: character.missionType,
      },
      ship: character.ship ? {
        hullStrength: character.ship.hullStrength,
        hullCondition: character.ship.hullCondition,
        driveStrength: character.ship.driveStrength,
        driveCondition: character.ship.driveCondition,
        cabinStrength: character.ship.cabinStrength,
        cabinCondition: character.ship.cabinCondition,
        lifeSupportStrength: character.ship.lifeSupportStrength,
        lifeSupportCondition: character.ship.lifeSupportCondition,
        weaponStrength: character.ship.weaponStrength,
        weaponCondition: character.ship.weaponCondition,
        navigationStrength: character.ship.navigationStrength,
        navigationCondition: character.ship.navigationCondition,
        roboticsStrength: character.ship.roboticsStrength,
        roboticsCondition: character.ship.roboticsCondition,
        shieldStrength: character.ship.shieldStrength,
        shieldCondition: character.ship.shieldCondition,
        fuel: character.ship.fuel,
        cargoPods: character.ship.cargoPods,
        maxCargoPods: character.ship.maxCargoPods,
        hasCloaker: character.ship.hasCloaker,
        hasAutoRepair: character.ship.hasAutoRepair,
        hasStarBuster: character.ship.hasStarBuster,
        hasArchAngel: character.ship.hasArchAngel,
        isAstraxialHull: character.ship.isAstraxialHull,
      } : null,
      dailyTripsRemaining: tripStatus.remainingTrips,
    };
  });

  // Rename ship
  fastify.put('/api/character/ship-name', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = shipNameBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { shipName } = body.data;

    const { validateName } = await import('../../game/utils.js');
    const validation = validateName(shipName);

    if (!validation.valid) {
      return reply.status(400).send({ error: validation.error });
    }

    const character = await prisma.character.findFirst({ where: { userId } });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    await prisma.character.update({
      where: { id: character.id },
      data: { shipName },
    });

    return { success: true, shipName };
  });

  // Join/leave alliance
  fastify.put('/api/character/alliance', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = allianceBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { alliance } = body.data;

    const character = await prisma.character.findFirst({ where: { userId } });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    // Map alliance string to enum
    const allianceMap: Record<string, any> = {
      'NONE': 'NONE',
      '+': 'ASTRO_LEAGUE',
      '@': 'SPACE_DRAGONS',
      '&': 'WARLORD_CONFED',
      '^': 'REBEL_ALLIANCE',
    };

    const allianceEnum = allianceMap[alliance] || 'NONE';

    // Update character alliance symbol
    await prisma.character.update({
      where: { id: character.id },
      data: { allianceSymbol: allianceEnum },
    });

    // Create or update alliance membership
    if (allianceEnum !== 'NONE') {
      await prisma.allianceMembership.upsert({
        where: { characterId: character.id },
        update: { alliance: allianceEnum as any },
        create: {
          characterId: character.id,
          alliance: allianceEnum as any,
        },
      });
    } else {
      await prisma.allianceMembership.deleteMany({
        where: { characterId: character.id },
      });
    }

    return { success: true, alliance };
  });
}
