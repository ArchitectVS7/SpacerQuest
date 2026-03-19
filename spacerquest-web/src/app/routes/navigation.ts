/**
 * SpacerQuest v4.0 - Navigation Routes
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { launchBody, courseChangeBody } from '../schemas.js';
import { getIO } from '../../sockets/io.js';

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
    const { COURSE_CHANGE_LIMIT_BASE } = await import('../../game/constants.js');
    const result = await processCourseChange(character.id, newSystemId, COURSE_CHANGE_LIMIT_BASE);

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

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    // Check for travel hazards that occurred during transit
    // Original SP.WARP.S: hazards trigger at 1/4 and 1/2 travel time
    const hazardEvents: Array<{ hazardName: string; component: string; action: string; newCondition: number; evaded: boolean }> = [];

    // Read travel state to get actual destination (character.destination is cargo delivery target)
    const travelState = await prisma.travelState.findUnique({
      where: { characterId: character.id },
    });

    if (character.ship) {
      const { checkHazardTrigger, generateHazard } = await import('../../game/systems/hazards.js');

      if (travelState) {
        const totalDuration = travelState.expectedArrival.getTime() - travelState.departureTime.getTime();
        const travelTimeUnits = Math.max(1, Math.floor(totalDuration / 1000)); // seconds as units

        // Check all hazard trigger points (1/4, 1/3, and 1/2)
        const quarterMark = Math.floor(travelTimeUnits / 4);
        const thirdMark = Math.floor(travelTimeUnits / 3);
        const halfMark = Math.floor(travelTimeUnits / 2);
        const checkPoints = [quarterMark, thirdMark, halfMark].filter(cp => cp > 0);

        const shipData = {
          hullCondition: character.ship.hullCondition,
          driveCondition: character.ship.driveCondition,
          cabinCondition: character.ship.cabinCondition,
          lifeSupportCondition: character.ship.lifeSupportCondition,
          weaponCondition: character.ship.weaponCondition,
          navigationCondition: character.ship.navigationCondition,
          roboticsCondition: character.ship.roboticsCondition,
          shieldCondition: character.ship.shieldCondition,
          shieldStrength: character.ship.shieldStrength,
        };

        for (const checkpoint of checkPoints) {
          if (checkHazardTrigger(checkpoint, travelTimeUnits)) {
            const hazard = generateHazard(shipData);
            if (hazard) {
              hazardEvents.push(hazard);

              // Apply damage to shipData for subsequent checks
              if (!hazard.evaded && hazard.component !== 'none') {
                const conditionKey = hazard.component === 'shields' ? 'shieldCondition' :
                  hazard.component === 'drives' ? 'driveCondition' :
                  hazard.component === 'weapons' ? 'weaponCondition' :
                  hazard.component === 'navigation' ? 'navigationCondition' :
                  hazard.component === 'robotics' ? 'roboticsCondition' :
                  hazard.component === 'hull' ? 'hullCondition' : null;

                if (conditionKey) {
                  (shipData as Record<string, number>)[conditionKey] = hazard.newCondition;
                }
              }
            }
          }
        }

        // Persist any hazard damage to the ship
        const damageOccurred = hazardEvents.some(h => !h.evaded && h.component !== 'none');
        if (damageOccurred) {
          await prisma.ship.update({
            where: { id: character.ship.id },
            data: {
              hullCondition: shipData.hullCondition,
              driveCondition: shipData.driveCondition,
              cabinCondition: shipData.cabinCondition,
              lifeSupportCondition: shipData.lifeSupportCondition,
              weaponCondition: shipData.weaponCondition,
              navigationCondition: shipData.navigationCondition,
              roboticsCondition: shipData.roboticsCondition,
              shieldCondition: shipData.shieldCondition,
            },
          });
        }
      }
    }

    const travelDestination = travelState?.destinationSystem || character.currentSystem;

    // ── Encounter generation ────────────────────────────────────────────
    // Original SP.WARP.S: at tt=(ty/3), tp=1 → link.fight
    // Every trip has a deterministic encounter at 1/3 travel time.
    // Pirates find you — you don't go looking for them.
    let encounterResult: any = undefined;
    try {
      const { generateEncounter, calculateBattleFactor, calculateEnemyBattleFactor, isNpcFriendly } =
        await import('../../game/systems/combat.js');
      const enemy = await generateEncounter(
        travelDestination,
        character.missionType,
        0
      );

      if (enemy && character.ship) {
        const enemyBF = calculateEnemyBattleFactor(enemy);
        enemy.battleFactor = enemyBF;

        // Check if friendly (same alliance) — original SP.FIGHT1.S:138
        if (isNpcFriendly(enemy, character.allianceSymbol)) {
          encounterResult = {
            encounter: true,
            friendly: true,
            enemy: { name: enemy.commander, class: enemy.class, type: enemy.type },
            message: `${enemy.commander} Hails A Friendly Greeting.`,
          };
        } else {
          // Hostile encounter — store as pending for the client to resolve
          // Create a combat record so the player can respond
          const playerBF = calculateBattleFactor(
            {
              weaponStrength: character.ship.weaponStrength,
              weaponCondition: character.ship.weaponCondition,
              shieldStrength: character.ship.shieldStrength,
              shieldCondition: character.ship.shieldCondition,
              cabinStrength: character.ship.cabinStrength,
              cabinCondition: character.ship.cabinCondition,
              roboticsStrength: character.ship.roboticsStrength,
              roboticsCondition: character.ship.roboticsCondition,
              lifeSupportStrength: character.ship.lifeSupportStrength,
              lifeSupportCondition: character.ship.lifeSupportCondition,
              navigationStrength: character.ship.navigationStrength,
              navigationCondition: character.ship.navigationCondition,
              driveStrength: character.ship.driveStrength,
              driveCondition: character.ship.driveCondition,
              hasAutoRepair: character.ship.hasAutoRepair,
            },
            character.rank as any,
            character.battlesWon
          );

          encounterResult = {
            encounter: true,
            friendly: false,
            enemy: {
              name: enemy.commander,
              class: enemy.class,
              type: enemy.type,
              battleFactor: enemyBF,
            },
            playerBF,
            message: `Intruder Alert! ${enemy.commander} in a ${enemy.class} is attacking!`,
          };
        }
      }
    } catch (err) {
      // Encounter generation failure is non-fatal — travel still completes
      // This can happen if NpcRoster table is empty or CombatEncounter model doesn't exist yet
    }

    const { completeTravel } = await import('../../game/systems/travel.js');
    await completeTravel(character.id, travelDestination);

    const { processDocking } = await import('../../game/systems/docking.js');
    await processDocking(character.id, travelDestination);

    // Push travel:complete to the character's socket room
    const destSystem = await prisma.starSystem.findUnique({ where: { id: travelDestination } });
    const io = getIO();
    if (io) {
      io.to(`character:${character.id}`).emit('travel:complete', {
        systemId: travelDestination,
        systemName: destSystem?.name || `System ${travelDestination}`,
        encounter: encounterResult,
      });
    }

    return {
      success: true,
      system: travelDestination,
      hazards: hazardEvents.length > 0 ? hazardEvents : undefined,
      encounter: encounterResult,
    };
  });
}
