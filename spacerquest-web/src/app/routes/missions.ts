/**
 * SpacerQuest v4.0 - Missions Routes
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { NEMESIS_REQUIREMENT_WINS } from '../../game/constants.js';

export async function registerMissionsRoutes(fastify: FastifyInstance) {
  // Accept Nemesis Mission
  fastify.post('/api/missions/nemesis', {
    preValidation: [async (request, reply) => {
      try { await request.jwtVerify(); }
      catch (err) { reply.code(401).send({ error: 'Unauthorized' }); }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    if (character.battlesWon < NEMESIS_REQUIREMENT_WINS) {
      return reply.status(400).send({ error: `Requires ${NEMESIS_REQUIREMENT_WINS} battle wins to accept the Nemesis mission.` });
    }

    if (
      character.ship.hullCondition < 9 ||
      character.ship.driveCondition < 9 ||
      character.ship.cabinCondition < 9 ||
      character.ship.lifeSupportCondition < 9 ||
      character.ship.weaponCondition < 9 ||
      character.ship.navigationCondition < 9 ||
      character.ship.roboticsCondition < 9 ||
      character.ship.shieldCondition < 9
    ) {
      return reply.status(400).send({ error: 'Ship must be in perfect condition (level 9) to accept the Nemesis mission.' });
    }

    await prisma.character.update({
      where: { id: character.id },
      data: {
        cargoManifest: 'Nemesis Orders - Coordinates: 00,00,00',
        destination: 28, // Nemesis system ID
        missionType: 3, // Assigned Nemesis mission type
      },
    });

    await prisma.gameLog.create({
      data: {
        type: 'MISSION',
        characterId: character.id,
        message: `${character.name} accepted the NEMESIS MISSION!`,
        metadata: { missionType: 'NEMESIS', destination: 28 },
      },
    });

    return { success: true, message: 'Nemesis mission accepted. Proceed to Coordinates 00,00,00 (System 28).' };
  });

  // Accept Maligna Mission
  fastify.post('/api/missions/maligna', {
    preValidation: [async (request, reply) => {
      try { await request.jwtVerify(); }
      catch (err) { reply.code(401).send({ error: 'Unauthorized' }); }
    }],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    if (!character.isConqueror) {
      return reply.status(400).send({ error: 'Only Conquerors can accept the Maligna mission.' });
    }

    if (!character.ship.isAstraxialHull || character.ship.driveStrength < 25) {
      return reply.status(400).send({ error: 'Requires Astraxial Hull and Drive Strength 25+.' });
    }

    await prisma.character.update({
      where: { id: character.id },
      data: {
        cargoManifest: 'MALIGNA MISSION - Coordinates: 13,33,99',
        destination: 27, // Maligna system ID
        missionType: 4, // Assigned Maligna mission type
      },
    });

    await prisma.gameLog.create({
      data: {
        type: 'MISSION',
        characterId: character.id,
        message: `${character.name} accepted the MALIGNA MISSION!`,
        metadata: { missionType: 'MALIGNA', destination: 27 },
      },
    });

    return { success: true, message: 'Maligna mission accepted. Proceed to Coordinates 13,33,99 (System 27).' };
  });
}
