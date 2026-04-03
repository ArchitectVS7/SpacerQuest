/**
 * SpacerQuest v4.0 - Economy Routes
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { fuelBody, depotSetPriceBody, depotBuyBody, depotTransferBody, allianceInvestBody, allianceWithdrawBody, wheelBody, dareBody } from '../schemas.js';
import { jailPlayer, CrimeType } from '../../game/systems/jail.js';

export async function registerEconomyRoutes(fastify: FastifyInstance) {
  // Buy fuel
  fastify.post('/api/economy/fuel/buy', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = fuelBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { units } = body.data;

    const { getFuelPrice, calculateFuelBuyCost } = await import('../../game/systems/economy.js');

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    const fuelPrice = getFuelPrice(character.currentSystem);
    const cost = calculateFuelBuyCost(units, fuelPrice);

    const { subtractCredits } = await import('../../game/utils.js');
    const { success } = subtractCredits(character.creditsHigh, character.creditsLow, cost);

    if (!success) {
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

    return { success: true, units, cost, fuelPrice };
  });

  // Sell fuel
  fastify.post('/api/economy/fuel/sell', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = fuelBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { units } = body.data;

    const { getFuelSellPrice } = await import('../../game/systems/economy.js');

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    if (character.ship.fuel < units) {
      return reply.status(400).send({ error: 'Not enough fuel' });
    }

    const sellPrice = getFuelSellPrice(character.currentSystem);
    const proceeds = units * sellPrice;

    // Update ship fuel and character credits
    await prisma.ship.update({
      where: { id: character.ship.id },
      data: { fuel: character.ship.fuel - units },
    });

    const { addCredits } = await import('../../game/utils.js');
    const { high, low } = addCredits(character.creditsHigh, character.creditsLow, proceeds);
    await prisma.character.update({
      where: { id: character.id },
      data: { creditsHigh: high, creditsLow: low },
    });

    return { success: true, units, proceeds };
  });

  // Accept cargo contract
  fastify.post('/api/economy/cargo/accept', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const { generateCargoContract } = await import('../../game/systems/economy.js');

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    if (character.ship.cargoPods < 1) {
      return reply.status(400).send({ error: 'No cargo pods available' });
    }

    const contract = generateCargoContract(
      character.currentSystem,
      character.ship.cargoPods,
      false,
      {
        hullCondition: character.ship.hullCondition,
        driveStrength: character.ship.driveStrength,
        driveCondition: character.ship.driveCondition,
      }
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
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const { calculateCargoPayment } = await import('../../game/systems/economy.js');

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || character.cargoPods < 1) {
      return reply.status(400).send({ error: 'No cargo to deliver' });
    }

    // Smuggling patrol encounter check (cargoType 10 = contraband)
    // Original: SP.FIGHT1.S — smuggling missions trigger Space Patrol encounters
    if (character.cargoType === 10 && character.ship) {
      const { generateEncounter } = await import('../../game/systems/combat.js');
      const { calculateComponentPower } = await import('../../game/utils.js');

      const playerPower = calculateComponentPower(
        character.ship.weaponStrength,
        character.ship.weaponCondition
      ) + calculateComponentPower(
        character.ship.shieldStrength,
        character.ship.shieldCondition
      );

      const patrol = await generateEncounter(character.currentSystem, 5, playerPower);

      if (patrol) {
        // Patrol intercepted the smuggling run — cargo confiscated, no payment, player jailed
        await prisma.character.update({
          where: { id: character.id },
          data: {
            cargoPods: 0,
            cargoType: 0,
            cargoPayment: 0,
            cargoManifest: null,
            destination: 0,
            crimeType: CrimeType.SMUGGLING,
            name: jailPlayer(character.name),
          },
        });

        return {
          success: false,
          intercepted: true,
          patrol: {
            type: patrol.type,
            class: patrol.class,
            name: patrol.name,
            commander: patrol.commander,
          },
          message: 'Space Patrol intercepts your smuggling run! Contraband confiscated! You have been arrested!',
        };
      }
    }

    const contract = {
      pods: character.cargoPods,
      cargoType: character.cargoType,
      origin: character.currentSystem,
      destination: character.destination,
      payment: character.cargoPayment,
      description: character.cargoManifest || '',
      fuelRequired: 0,
      distance: 0,
      valuePerPod: 0,
      deliveryBonus: 0,
      bonusCargo: '',
      bonusDest: '',
    };

    const { payment, bonus, total, message } = calculateCargoPayment(
      contract,
      character.currentSystem
    );

    // Add payment to credits
    const { addCredits } = await import('../../game/utils.js');
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

    return { success: true, payment, bonus, total, message };
  });

  // Alliance Invest
  fastify.post('/api/economy/alliance/invest', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = allianceInvestBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { amount, type, systemId, levels } = body.data;

    const character = await prisma.character.findFirst({ where: { userId } });
    if (!character) return reply.status(404).send({ error: 'Character not found' });

    const allianceSystem = await import('../../game/systems/alliance.js');

    if (type === 'DEFCON') {
      const result = await allianceSystem.investInDefcon(character.id, systemId || character.currentSystem, levels || 1);
      if (!result.success) return reply.status(400).send({ error: result.error });
      return result;
    } else {
      const result = await allianceSystem.investInAlliance(character.id, amount || 0);
      if (!result.success) return reply.status(400).send({ error: result.error });
      return result;
    }
  });

  // Wheel of Fortune
  fastify.post('/api/economy/gamble/wheel', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = wheelBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { betNumber, betAmount, rolls } = body.data;

    const character = await prisma.character.findFirst({ where: { userId } });
    if (!character) return reply.status(404).send({ error: 'Character not found' });

    const { playWheelOfFortune } = await import('../../game/systems/gambling.js');
    const result = playWheelOfFortune({
      betNumber,
      betAmount,
      rolls,
      creditsHigh: character.creditsHigh,
      creditsLow: character.creditsLow,
    });

    if (!result.success) return reply.status(400).send({ error: result.error });

    // Update credits
    const { addCredits, subtractCredits } = await import('../../game/utils.js');
    let high = character.creditsHigh;
    let low = character.creditsLow;

    if (result.won) {
      ({ high, low } = addCredits(high, low, result.payout!));
    } else {
      ({ high, low } = subtractCredits(high, low, result.cost!));
    }

    await prisma.character.update({
      where: { id: character.id },
      data: { creditsHigh: high, creditsLow: low },
    });

    return result;
  });

  // Spacer's Dare
  fastify.post('/api/economy/gamble/dare', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = dareBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { rounds, multiplier } = body.data;

    const character = await prisma.character.findFirst({ where: { userId } });
    if (!character) return reply.status(404).send({ error: 'Character not found' });

    const { playSpacersDare } = await import('../../game/systems/gambling.js');
    const result = playSpacersDare({
      rounds,
      multiplier,
      creditsHigh: character.creditsHigh,
      creditsLow: character.creditsLow,
    });

    if (!result.success) return reply.status(400).send({ error: result.error });

    // Update credits
    const { addCredits, subtractCredits } = await import('../../game/utils.js');
    let high = character.creditsHigh;
    let low = character.creditsLow;

    if (result.netCredits! > 0) {
      ({ high, low } = addCredits(high, low, result.netCredits!));
    } else if (result.netCredits! < 0) {
      ({ high, low } = subtractCredits(high, low, Math.abs(result.netCredits!)));
    }

    await prisma.character.update({
      where: { id: character.id },
      data: { creditsHigh: high, creditsLow: low },
    });

    return result;
  });

  // Alliance Withdraw
  fastify.post('/api/economy/alliance/withdraw', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = allianceWithdrawBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }
    const { amount } = body.data;

    const character = await prisma.character.findFirst({ where: { userId } });
    if (!character) return reply.status(404).send({ error: 'Character not found' });

    const allianceSystem = await import('../../game/systems/alliance.js');
    const result = await allianceSystem.withdrawFromAlliance(character.id, amount);
    if (!result.success) return reply.status(400).send({ error: result.error });
    return result;
  });

  // ── Fuel Depot (port owner operations) ───────────────────────────────────

  // Set fuel depot price
  fastify.post('/api/economy/depot/price', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = depotSetPriceBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }

    const { validateDepotPrice } = await import('../../game/systems/economy.js');

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { portOwnership: true },
    });

    if (!character?.portOwnership) {
      return reply.status(400).send({ error: 'Not a port owner' });
    }

    const result = validateDepotPrice(body.data.price);
    if (!result.success) {
      return reply.status(400).send({ error: result.message });
    }

    await prisma.portOwnership.update({
      where: { id: character.portOwnership.id },
      data: { fuelPrice: result.newPrice },
    });

    return { success: true, newPrice: result.newPrice };
  });

  // Buy fuel wholesale for depot
  fastify.post('/api/economy/depot/buy', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = depotBuyBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }

    const { calculateDepotBuy } = await import('../../game/systems/economy.js');

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { portOwnership: true },
    });

    if (!character?.portOwnership) {
      return reply.status(400).send({ error: 'Not a port owner' });
    }

    const result = calculateDepotBuy(
      body.data.units,
      character.portOwnership.fuelStored,
      character.creditsHigh,
      character.creditsLow,
    );

    if (!result.success) {
      return reply.status(400).send({ error: result.message });
    }

    await prisma.$transaction([
      prisma.character.update({
        where: { id: character.id },
        data: { creditsHigh: result.creditsHigh, creditsLow: result.creditsLow },
      }),
      prisma.portOwnership.update({
        where: { id: character.portOwnership.id },
        data: { fuelStored: result.newFuelStored },
      }),
    ]);

    return { success: true, units: result.units, cost: result.cost, newFuelStored: result.newFuelStored };
  });

  // Transfer fuel from ship to depot
  fastify.post('/api/economy/depot/transfer', {
    preValidation: [requireAuth],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = depotTransferBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
    }

    const { calculateDepotTransfer } = await import('../../game/systems/economy.js');

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true, portOwnership: true },
    });

    if (!character?.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    if (!character.portOwnership) {
      return reply.status(400).send({ error: 'Not a port owner' });
    }

    // SP.REAL.txt line 218: must be docked at port's system
    if (character.currentSystem !== character.portOwnership.systemId) {
      return reply.status(400).send({ error: 'Must be docked at your port to transfer fuel' });
    }

    const result = calculateDepotTransfer(
      body.data.units,
      character.ship.fuel,
      character.portOwnership.fuelStored,
    );

    if (!result.success) {
      return reply.status(400).send({ error: result.message });
    }

    await prisma.$transaction([
      prisma.ship.update({
        where: { id: character.ship.id },
        data: { fuel: result.newShipFuel },
      }),
      prisma.portOwnership.update({
        where: { id: character.portOwnership.id },
        data: { fuelStored: result.newFuelStored },
      }),
    ]);

    return { success: true, units: result.units, newFuelStored: result.newFuelStored, newShipFuel: result.newShipFuel };
  });
}
