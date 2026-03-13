/**
 * SpacerQuest v4.0 - Ship Routes
 */

import { FastifyInstance } from 'fastify';

export async function registerShipRoutes(fastify: FastifyInstance) {
  const { PrismaClient } = await import('@prisma/client');
  
  // Get ship status
  fastify.get('/api/ship/status', {
    preValidation: [async (request, reply) => {
      try { await request.jwtVerify(); }
      catch (err) { reply.code(401).send({ error: 'Unauthorized' }); }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const prisma = new PrismaClient();
    
    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });
    
    await prisma.$disconnect();
    
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
    preValidation: [async (request, reply) => {
      try { await request.jwtVerify(); }
      catch (err) { reply.code(401).send({ error: 'Unauthorized' }); }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { component, upgradeType } = request.body as {
      component: string;
      upgradeType: 'STRENGTH' | 'CONDITION';
    };
    
    const upgradesSystem = await import('../../game/systems/upgrades.js');
    const result = await upgradesSystem.upgradeShipComponent(userId, component, upgradeType);
    
    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }
    
    return result;
  });
  
  // Repair all damage
  fastify.post('/api/ship/repair', {
    preValidation: [async (request, reply) => {
      try { await request.jwtVerify(); }
      catch (err) { reply.code(401).send({ error: 'Unauthorized' }); }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    
    const repairsSystem = await import('../../game/systems/repairs.js');
    const result = await repairsSystem.repairAllComponents(userId);

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }
    
    return result;
  });
}
