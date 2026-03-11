/**
 * SpacerQuest v4.0 - Economy Routes
 */

import { FastifyInstance } from 'fastify';

export async function registerEconomyRoutes(fastify: FastifyInstance) {
  const { PrismaClient } = await import('@prisma/client');
  
  // Buy fuel
  fastify.post('/api/economy/fuel/buy', {
    preValidation: [async (request, reply) => {
      try { await request.jwtVerify(); }
      catch (err) { reply.code(401).send({ error: 'Unauthorized' }); }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { units } = request.body as { units: number };
    
    const prisma = new PrismaClient();
    const { getFuelPrice, calculateFuelBuyCost } = await import('../game/systems/economy.js');
    
    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });
    
    if (!character || !character.ship) {
      await prisma.$disconnect();
      return reply.status(400).send({ error: 'No ship found' });
    }
    
    const fuelPrice = getFuelPrice(character.currentSystem);
    const cost = calculateFuelBuyCost(units, fuelPrice);
    
    const { subtractCredits, addCredits } = await import('../game/utils.js');
    const { success } = subtractCredits(character.creditsHigh, character.creditsLow, cost);
    
    if (!success) {
      await prisma.$disconnect();
      return reply.status(400).send({ error: 'Not enough credits' });
    }
    
    // Update ship fuel and character credits
    await prisma.ship.update({
      where: { id: character.ship.id },
      data: { fuel: character.ship.fuel + units },
    });
    
    const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, cost);
    await prisma.character.update({
      where: { id: character.id },
      data: { creditsHigh: high, creditsLow: low },
    });
    
    await prisma.$disconnect();
    
    return { success: true, units, cost, fuelPrice };
  });
  
  // Sell fuel
  fastify.post('/api/economy/fuel/sell', {
    preValidation: [async (request, reply) => {
      try { await request.jwtVerify(); }
      catch (err) { reply.code(401).send({ error: 'Unauthorized' }); }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { units } = request.body as { units: number };
    
    const prisma = new PrismaClient();
    const { getFuelPrice, calculateFuelSaleProceeds } = await import('../game/systems/economy.js');
    
    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });
    
    if (!character || !character.ship) {
      await prisma.$disconnect();
      return reply.status(400).send({ error: 'No ship found' });
    }
    
    if (character.ship.fuel < units) {
      await prisma.$disconnect();
      return reply.status(400).send({ error: 'Not enough fuel' });
    }
    
    const fuelPrice = getFuelPrice(character.currentSystem);
    const proceeds = calculateFuelSaleProceeds(units, fuelPrice);
    
    // Update ship fuel and character credits
    await prisma.ship.update({
      where: { id: character.ship.id },
      data: { fuel: character.ship.fuel - units },
    });
    
    const { addCredits } = await import('../game/utils.js');
    const { high, low } = addCredits(character.creditsHigh, character.creditsLow, proceeds);
    await prisma.character.update({
      where: { id: character.id },
      data: { creditsHigh: high, creditsLow: low },
    });
    
    await prisma.$disconnect();
    
    return { success: true, units, proceeds };
  });
  
  // Accept cargo contract
  fastify.post('/api/economy/cargo/accept', {
    preValidation: [async (request, reply) => {
      try { await request.jwtVerify(); }
      catch (err) { reply.code(401).send({ error: 'Unauthorized' }); }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    
    const prisma = new PrismaClient();
    const { generateCargoContract } = await import('../game/systems/economy.js');
    
    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });
    
    if (!character || !character.ship) {
      await prisma.$disconnect();
      return reply.status(400).send({ error: 'No ship found' });
    }
    
    if (character.ship.cargoPods < 1) {
      await prisma.$disconnect();
      return reply.status(400).send({ error: 'No cargo pods available' });
    }
    
    const contract = generateCargoContract(
      character.currentSystem,
      character.ship.cargoPods,
      false
    );
    
    await prisma.character.update({
      where: { id: character.id },
      data: {
        cargoPods: contract.pods,
        cargoType: contract.cargoType,
        cargoPayment: contract.payment,
        destination: contract.destination,
        cargoManifest: contract.description,
      },
    });
    
    await prisma.$disconnect();
    
    return {
      success: true,
      contract: {
        pods: contract.pods,
        cargoType: contract.cargoType,
        description: contract.description,
        destination: contract.destination,
        payment: contract.payment,
      },
    };
  });
  
  // Deliver cargo
  fastify.post('/api/economy/cargo/deliver', {
    preValidation: [async (request, reply) => {
      try { await request.jwtVerify(); }
      catch (err) { reply.code(401).send({ error: 'Unauthorized' }); }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    
    const prisma = new PrismaClient();
    const { calculateCargoPayment } = await import('../game/systems/economy.js');
    
    const character = await prisma.character.findFirst({
      where: { userId },
    });
    
    if (!character || character.cargoPods < 1) {
      await prisma.$disconnect();
      return reply.status(400).send({ error: 'No cargo to deliver' });
    }
    
    const contract = {
      pods: character.cargoPods,
      cargoType: character.cargoType,
      origin: character.currentSystem,
      destination: character.destination,
      payment: character.cargoPayment,
      description: character.cargoManifest || '',
    };
    
    const { payment, bonus, total, message } = calculateCargoPayment(
      contract,
      character.currentSystem
    );
    
    // Add payment to credits
    const { addCredits } = await import('../game/utils.js');
    const { high, low } = addCredits(character.creditsHigh, character.creditsLow, total);
    
    await prisma.character.update({
      where: { id: character.id },
      data: {
        creditsHigh: high,
        creditsLow: low,
        cargoPods: 0,
        cargoType: 0,
        cargoPayment: 0,
        cargoManifest: null,
        destination: 0,
        cargoDelivered: { increment: 1 },
      },
    });
    
    await prisma.$disconnect();
    
    return { success: true, payment, bonus, total, message };
  });
}
