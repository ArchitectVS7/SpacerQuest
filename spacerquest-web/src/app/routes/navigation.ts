/**
 * SpacerQuest v4.0 - Navigation Routes
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { launchBody, courseChangeBody } from '../schemas.js';

export async function registerNavigationRoutes(fastify: FastifyInstance) {
  // Launch to destination
  fastify.post('/api/navigation/launch', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = launchBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { destinationSystemId, cargoContract } = body.data;

    const { validateLaunch, startTravel } = await import('../../game/systems/travel.js');

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    // Validate launch
    const validation = await validateLaunch(character.id, destinationSystemId);

    if (!validation.valid) {
      return reply.status(400).send({
        error: 'Launch validation failed',
        details: validation.errors
      });
    }

    // Deduct fuel
    await prisma.ship.update({
      where: { id: character.ship.id },
      data: { fuel: character.ship.fuel - (validation.fuelRequired || 0) },
    });

    // Set cargo contract if provided
    if (cargoContract) {
      await prisma.character.update({
        where: { id: character.id },
        data: {
          cargoPods: cargoContract.pods,
          cargoType: cargoContract.type,
          cargoPayment: cargoContract.payment,
          destination: destinationSystemId,
        },
      });
    }

    // Start travel
    await startTravel(
      character.id,
      character.currentSystem,
      destinationSystemId,
      validation.fuelRequired || 0
    );

    return {
      success: true,
      fuelRequired: validation.fuelRequired,
      travelTime: validation.travelTime,
      destination: destinationSystemId,
    };
  });

  // Get travel progress
  fastify.get('/api/navigation/travel-status', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const character = await prisma.character.findFirst({ where: { userId } });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    const { getTravelProgress } = await import('../../game/systems/travel.js');
    const progress = await getTravelProgress(character.id);

    if (!progress) {
      return { inTransit: false };
    }

    return progress;
  });

  // Course change
  fastify.post('/api/navigation/course-change', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = courseChangeBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { newSystemId } = body.data;

    const character = await prisma.character.findFirst({ where: { userId } });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    const { processCourseChange } = await import('../../game/systems/travel.js');
    const result = await processCourseChange(character.id, newSystemId, 5);

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return {
      success: true,
      fuelUsed: result.fuelUsed,
      remainingChanges: result.remainingChanges,
    };
  });

  // Complete travel (called when travel time expires)
  fastify.post('/api/navigation/arrive', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const character = await prisma.character.findFirst({ where: { userId } });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    const { completeTravel } = await import('../../game/systems/travel.js');
    await completeTravel(character.id, character.destination || character.currentSystem);

    const { processDocking } = await import('../../game/systems/docking.js');
    await processDocking(character.id, character.destination || character.currentSystem);

    return { success: true, system: character.destination };
  });
}
