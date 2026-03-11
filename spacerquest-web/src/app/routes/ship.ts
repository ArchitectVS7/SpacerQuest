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
    
    const prisma = new PrismaClient();
    const { COMPONENT_PRICES } = await import('../game/constants.js');
    
    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });
    
    if (!character || !character.ship) {
      await prisma.$disconnect();
      return reply.status(404).send({ error: 'No ship found' });
    }
    
    // Map component to price
    const priceMap: Record<string, number> = {
      'HULL': COMPONENT_PRICES.HULL,
      'DRIVES': COMPONENT_PRICES.DRIVES,
      'CABIN': COMPONENT_PRICES.CABIN,
      'LIFE_SUPPORT': COMPONENT_PRICES.LIFE_SUPPORT,
      'WEAPONS': COMPONENT_PRICES.WEAPONS,
      'NAVIGATION': COMPONENT_PRICES.NAVIGATION,
      'ROBOTICS': COMPONENT_PRICES.ROBOTICS,
      'SHIELDS': COMPONENT_PRICES.SHIELDS,
    };
    
    const price = priceMap[component.toUpperCase()];
    
    if (!price) {
      await prisma.$disconnect();
      return reply.status(400).send({ error: 'Invalid component' });
    }
    
    // Check credits
    const { getTotalCredits, subtractCredits } = await import('../game/utils.js');
    const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
    
    if (totalCredits < price) {
      await prisma.$disconnect();
      return reply.status(400).send({ error: 'Not enough credits' });
    }
    
    // Determine component field
    const componentMap: Record<string, string> = {
      'HULL': 'hull',
      'DRIVES': 'drive',
      'CABIN': 'cabin',
      'LIFE_SUPPORT': 'lifeSupport',
      'WEAPONS': 'weapon',
      'NAVIGATION': 'navigation',
      'ROBOTICS': 'robotics',
      'SHIELDS': 'shield',
    };
    
    const field = componentMap[component.toUpperCase()];
    const strengthField = `${field}Strength`;
    const conditionField = `${field}Condition`;
    
    // Apply upgrade
    const updateData: any = {};
    
    if (upgradeType === 'STRENGTH') {
      updateData[strengthField] = character.ship[strengthField as keyof typeof character.ship] + 10;
    } else {
      updateData[conditionField] = Math.min(9, character.ship[conditionField as keyof typeof character.ship] + 1);
    }
    
    await prisma.ship.update({
      where: { id: character.ship.id },
      data: updateData,
    });
    
    // Deduct credits
    const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, price);
    await prisma.character.update({
      where: { id: character.id },
      data: { creditsHigh: high, creditsLow: low },
    });
    
    await prisma.$disconnect();
    
    return {
      success: true,
      cost: price,
      newStrength: updateData[strengthField],
      newCondition: updateData[conditionField],
    };
  });
  
  // Repair all damage
  fastify.post('/api/ship/repair', {
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
    
    if (!character || !character.ship) {
      await prisma.$disconnect();
      return reply.status(404).send({ error: 'No ship found' });
    }
    
    const ship = character.ship;
    
    // Calculate repair cost: (9 - condition) × strength per component
    let totalCost = 0;
    const components = ['hull', 'drive', 'cabin', 'lifeSupport', 'weapon', 'navigation', 'robotics', 'shield'];
    
    for (const comp of components) {
      const strength = ship[`${comp}Strength` as keyof typeof ship] as number;
      const condition = ship[`${comp}Condition` as keyof typeof ship] as number;
      const damage = 9 - condition;
      totalCost += damage * strength;
    }
    
    // Check credits
    const { getTotalCredits, subtractCredits } = await import('../game/utils.js');
    const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
    
    if (totalCredits < totalCost) {
      await prisma.$disconnect();
      return reply.status(400).send({ error: `Not enough credits. Repair cost: ${totalCost} cr` });
    }
    
    // Repair all components to condition 9
    const updateData: any = {};
    for (const comp of components) {
      updateData[`${comp}Condition`] = 9;
    }
    
    await prisma.ship.update({
      where: { id: ship.id },
      data: updateData,
    });
    
    // Deduct credits
    const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, totalCost);
    await prisma.character.update({
      where: { id: character.id },
      data: { creditsHigh: high, creditsLow: low },
    });
    
    await prisma.$disconnect();
    
    return {
      success: true,
      cost: totalCost,
      message: 'All components repaired to full condition!',
    };
  });
}
