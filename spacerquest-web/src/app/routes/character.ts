/**
 * SpacerQuest v4.0 - Character Routes
 */

import { FastifyInstance } from 'fastify';
import { AllianceType } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { shipNameBody, allianceBody } from '../schemas.js';
import { canJoinAlliance, calculateSwitchCost } from '../../game/systems/alliance-rules.js';
import { canPayFine, payFine, releasePlayer, CrimeType, calculateBailCost } from '../../game/systems/jail.js';
import { subtractCredits } from '../../game/utils.js';

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

    // Original SP.REG.S shipname subroutine (lines 113-121):
    // If ship name ends in an alliance symbol (+/@/&/^), the player
    // must already be a member of that alliance.
    // "Seek out the Spacers Hangout before being / Using that symbol in your ship's name."
    const ALLIANCE_SYMBOL_MAP: Record<string, AllianceType> = {
      '+': AllianceType.ASTRO_LEAGUE,
      '@': AllianceType.SPACE_DRAGONS,
      '&': AllianceType.WARLORD_CONFED,
      '^': AllianceType.REBEL_ALLIANCE,
    };
    const lastChar = shipName.slice(-1);
    if (ALLIANCE_SYMBOL_MAP[lastChar]) {
      const requiredAlliance = ALLIANCE_SYMBOL_MAP[lastChar];
      if (character.allianceSymbol !== requiredAlliance) {
        return reply.status(400).send({
          error: 'Seek out the Spacers Hangout before using that symbol in your ship\'s name.',
        });
      }
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
    const allianceMap: Record<string, AllianceType> = {
      'NONE': AllianceType.NONE,
      '+': AllianceType.ASTRO_LEAGUE,
      '@': AllianceType.SPACE_DRAGONS,
      '&': AllianceType.WARLORD_CONFED,
      '^': AllianceType.REBEL_ALLIANCE,
    };

    const allianceEnum = allianceMap[alliance] ?? AllianceType.NONE;

    // Validate the join if not leaving
    if (allianceEnum !== AllianceType.NONE) {
      // Count total players and members in target alliance
      const [totalPlayers, allianceMemberCount] = await Promise.all([
        prisma.character.count(),
        prisma.allianceMembership.count({ where: { alliance: allianceEnum } }),
      ]);

      const joinResult = canJoinAlliance(
        character.rank,
        character.allianceSymbol as AllianceType,
        totalPlayers,
        allianceMemberCount
      );

      if (!joinResult.allowed) {
        return reply.status(400).send({ error: joinResult.reason });
      }

      // If switching alliances, apply switch cost
      if (joinResult.hasExistingAlliance) {
        const ownsPort = await prisma.portOwnership.findFirst({
          where: { characterId: character.id },
        });

        calculateSwitchCost(
          character.creditsHigh,
          character.creditsLow,
          ownsPort !== null
        );

        // Deduct all credits
        await prisma.character.update({
          where: { id: character.id },
          data: {
            creditsHigh: 0,
            creditsLow: 0,
          },
        });

        // Delete port ownership
        await prisma.portOwnership.deleteMany({
          where: { characterId: character.id },
        });
      }
    }

    // Update character alliance symbol
    await prisma.character.update({
      where: { id: character.id },
      data: { allianceSymbol: allianceEnum },
    });

    // Create or update alliance membership
    if (allianceEnum !== AllianceType.NONE) {
      await prisma.allianceMembership.upsert({
        where: { characterId: character.id },
        update: { alliance: allianceEnum },
        create: {
          characterId: character.id,
          alliance: allianceEnum,
        },
      });
    } else {
      await prisma.allianceMembership.deleteMany({
        where: { characterId: character.id },
      });
    }

    return { success: true, alliance };
  });

  // Pay fine to get out of jail
  fastify.post('/api/character/jail/pay-fine', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const character = await prisma.character.findFirst({ where: { userId } });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    if (character.crimeType === null) {
      return reply.status(400).send({ error: 'You are not in jail' });
    }

    const crimeType = character.crimeType as unknown as CrimeType;

    if (!canPayFine(character.creditsHigh, character.creditsLow, crimeType)) {
      return reply.status(400).send({ error: 'Not enough credits to pay fine' });
    }

    const fineResult = payFine(character.creditsHigh, character.creditsLow, crimeType);
    const releasedName = releasePlayer(character.name);

    await prisma.character.update({
      where: { id: character.id },
      data: {
        creditsHigh: fineResult.creditsHigh,
        creditsLow: fineResult.creditsLow,
        crimeType: null,
        name: releasedName,
      },
    });

    return { success: true, message: 'Fine paid. You are free to go.' };
  });

  // Bail out another player
  fastify.post('/api/character/jail/bail/:targetId', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { targetId } = request.params as { targetId: string };

    const caller = await prisma.character.findFirst({ where: { userId } });

    if (!caller) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    const targetSpacerId = parseInt(targetId, 10);
    if (isNaN(targetSpacerId)) {
      return reply.status(400).send({ error: 'Invalid target ID' });
    }

    const target = await prisma.character.findFirst({
      where: { spacerId: targetSpacerId },
    });

    if (!target) {
      return reply.status(404).send({ error: 'Target character not found' });
    }

    if (target.crimeType === null) {
      return reply.status(400).send({ error: 'That player is not in jail' });
    }

    const crimeType = target.crimeType as unknown as CrimeType;
    const bailCost = calculateBailCost(crimeType);

    const deductResult = subtractCredits(caller.creditsHigh, caller.creditsLow, bailCost);

    if (!deductResult.success) {
      return reply.status(400).send({ error: 'Not enough credits to post bail' });
    }

    const releasedName = releasePlayer(target.name);

    await Promise.all([
      prisma.character.update({
        where: { id: caller.id },
        data: {
          creditsHigh: deductResult.high,
          creditsLow: deductResult.low,
        },
      }),
      prisma.character.update({
        where: { id: target.id },
        data: {
          crimeType: null,
          name: releasedName,
        },
      }),
    ]);

    return { success: true, message: `Bailed out ${releasedName}` };
  });
}
