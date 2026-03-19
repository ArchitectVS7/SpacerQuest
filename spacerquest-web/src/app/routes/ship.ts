/**
 * SpacerQuest v4.0 - Ship Routes
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { upgradeBody } from '../schemas.js';

export async function registerShipRoutes(fastify: FastifyInstance) {
  // Get ship status
  fastify.get('/api/ship/status', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return reply.status(404).send({ error: 'No ship found' });
    }

    return {
      shipName: character.shipName,
      components: [
        { name: 'Hull', strength: character.ship.hullStrength, condition: character.ship.hullCondition },
        { name: 'Drives', strength: character.ship.driveStrength, condition: character.ship.driveCondition },
        { name: 'Cabin', strength: character.ship.cabinStrength, condition: character.ship.cabinCondition },
        { name: 'Life Support', strength: character.ship.lifeSupportStrength, condition: character.ship.lifeSupportCondition },
        { name: 'Weapons', strength: character.ship.weaponStrength, condition: character.ship.weaponCondition },
        { name: 'Navigation', strength: character.ship.navigationStrength, condition: character.ship.navigationCondition },
        { name: 'Robotics', strength: character.ship.roboticsStrength, condition: character.ship.roboticsCondition },
        { name: 'Shields', strength: character.ship.shieldStrength, condition: character.ship.shieldCondition },
      ],
      fuel: character.ship.fuel,
      cargoPods: character.ship.cargoPods,
      maxCargoPods: character.ship.maxCargoPods,
      specialEquipment: [
        character.ship.hasCloaker ? 'Morton\'s Cloaker' : null,
        character.ship.hasAutoRepair ? 'Auto-Repair Module' : null,
        character.ship.hasStarBuster ? 'STAR-BUSTER++' : null,
        character.ship.hasArchAngel ? 'ARCH-ANGEL++' : null,
        character.ship.isAstraxialHull ? 'Astraxial Hull' : null,
      ].filter(Boolean),
    };
  });

  // Upgrade component
  fastify.post('/api/ship/upgrade', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = upgradeBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { component, upgradeType } = body.data;

    const character = await prisma.character.findFirst({ where: { userId } });
    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    const upgradesSystem = await import('../../game/systems/upgrades.js');
    const result = await upgradesSystem.upgradeShipComponent(character.id, component, upgradeType);

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return result;
  });

  // Repair all damage
  fastify.post('/api/ship/repair', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const character = await prisma.character.findFirst({ where: { userId } });
    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    const repairsSystem = await import('../../game/systems/repairs.js');
    const result = await repairsSystem.repairAllComponents(character.id);

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return result;
  });
}
