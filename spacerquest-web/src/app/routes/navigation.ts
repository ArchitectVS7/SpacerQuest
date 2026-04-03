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

        // SP.WARP.S getime: hazard marks depend on mission type (mx = missionType > 1)
        // Normal (mx=0): 1/4 and 1/2 only. At 1/3, tp=1 (encounter), not hazard.
        // Mission (mx>0): 1/4, 1/2, plus mission-only marks: 1/3, 1/9, 1/8, 1/7, 1/6, 1/5
        const onMission = character.missionType > 1;
        const quarterMark = Math.floor(travelTimeUnits / 4);
        const halfMark = Math.floor(travelTimeUnits / 2);
        const checkPoints: number[] = [quarterMark, halfMark];
        if (onMission) {
          // SP.WARP.S lines 332-338: additional mission hazard triggers
          checkPoints.push(
            Math.floor(travelTimeUnits / 3),
            Math.floor(travelTimeUnits / 9),
            Math.floor(travelTimeUnits / 8),
            Math.floor(travelTimeUnits / 7),
            Math.floor(travelTimeUnits / 6),
            Math.floor(travelTimeUnits / 5),
          );
        }
        const uniqueCheckPoints = [...new Set(checkPoints)].filter(cp => cp > 0);

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

        for (const checkpoint of uniqueCheckPoints) {
          if (checkHazardTrigger(checkpoint, travelTimeUnits, onMission)) {
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

      // ── SP.WARP.S line 167: Black hole transit flag ─────────────────────
      // Andromeda mission (kk=10): set bh=1 after passing halfway point (black hole transit)
      // This allows course changes for the remainder of the trip in Andromeda space.
      const { isAndromedaSystem } = await import('../../game/systems/black-hole.js');
      if (character.missionType === 10 && travelState && isAndromedaSystem(travelState.destinationSystem)) {
        const now = Date.now();
        const departureTime = travelState.departureTime.getTime();
        const expectedArrival = travelState.expectedArrival.getTime();
        const halfwayPoint = departureTime + ((expectedArrival - departureTime) / 2);
        
        // If we've passed the halfway point, black hole transit is complete
        if (now >= halfwayPoint && !travelState.blackHoleTransited && character.ship) {
          await prisma.travelState.update({
            where: { characterId: character.id },
            data: { blackHoleTransited: true },
          });

          // ── SP.WARP.S snap subroutine (lines 386-411): component strength loss ──
          // Transit through black hole causes random component strength damage.
          // r=6:gosub rand → pick component (1-8); r=8:gosub rand → damage amount y
          // Astraxial hull: if x=1 → x=16 (safe); better nav roll
          // if x>8 → safe transit (no damage)
          const ship = character.ship;
          const isAstraxial = ship.isAstraxialHull;
          const componentRoll = Math.ceil(Math.random() * 6); // r=6

          // Better damage roll for Astraxial hull with good navigation
          let maxDamage = 8;
          if (isAstraxial && ship.navigationStrength > 9) {
            maxDamage = Math.floor(ship.navigationStrength / 10) + 10; // r=(n1/10)+10
          }
          const damageAmount = Math.ceil(Math.random() * maxDamage); // y

          // Astraxial hull: x=1 → x=16 (always safe)
          let effectiveComponent = componentRoll;
          if (isAstraxial && componentRoll === 1) {
            effectiveComponent = 16; // safe
          }

          // Only damage if x <= 8 (x>8 = safe)
          if (effectiveComponent <= 8 && character.ship) {
            const componentMap: Record<number, { field: keyof typeof ship; label: string }> = {
              1: { field: 'hullStrength', label: 'Hull' },
              2: { field: 'driveStrength', label: 'Drive' },
              3: { field: 'cabinStrength', label: 'Cabin' },
              4: { field: 'lifeSupportStrength', label: 'Life Support' },
              5: { field: 'weaponStrength', label: 'Weapon' },
              6: { field: 'navigationStrength', label: 'Navigation' },
              7: { field: 'roboticsStrength', label: 'Robotics' },
              8: { field: 'shieldStrength', label: 'Shields' },
            };
            const comp = componentMap[effectiveComponent];
            if (comp) {
              const currentStrength = ship[comp.field] as number;
              const newStrength = Math.max(0, currentStrength - damageAmount);
              await prisma.ship.update({
                where: { id: ship.id },
                data: { [comp.field]: newStrength },
              });
              // Log the snap damage for hazard events (displayed to player)
              hazardEvents.push({
                hazardName: 'Black Hole Stress',
                component: comp.label,
                action: 'suffers loss of',
                newCondition: damageAmount, // reuse field to carry damage amount
                evaded: false,
              });
            }
          }
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
        const enemyBF = calculateEnemyBattleFactor(enemy, character.tripCount);
        enemy.battleFactor = enemyBF;

        // ── SP.WARP.S lines 118-143: Cloaking device toggle during travel ──
        // For cargo (kk=1) and smuggling (kk=5) missions, if the ship has a
        // cloaker (p1$ ends with "="), show interactive toggle screen.
        // Player can toggle ON/OFF with spacebar, press G to engage.
        const cloakerEligible = (character.missionType === 1 || character.missionType === 5) &&
          character.ship.hasCloaker;

        // Check if friendly (same alliance) — original SP.FIGHT1.S:138
        if (isNpcFriendly(enemy, character.allianceSymbol)) {
          encounterResult = {
            encounter: true,
            friendly: true,
            enemy: { name: enemy.commander, class: enemy.class, type: enemy.type },
            message: `${enemy.commander} Hails A Friendly Greeting.`,
          };
        } else {
          // Hostile encounter — create CombatSession so combat screen can process rounds
          const { calculateComponentPower } = await import('../../game/utils.js');
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
              hullStrength: character.ship.hullStrength,
              hullCondition: character.ship.hullCondition,
              hasAutoRepair: character.ship.hasAutoRepair,
            },
            character.rank as any,
            character.battlesWon,
            character.tripCount,
          );

          // Create CombatSession for the combat screen to read
          await prisma.combatSession.upsert({
            where: { characterId: character.id },
            update: {
              npcRosterId: enemy.npcRosterId || null,
              enemyType: enemy.type,
              enemyName: enemy.name,
              playerWeaponPower: calculateComponentPower(character.ship.weaponStrength, character.ship.weaponCondition),
              playerShieldPower: calculateComponentPower(character.ship.shieldStrength, character.ship.shieldCondition),
              playerDrivePower: calculateComponentPower(character.ship.driveStrength, character.ship.driveCondition),
              playerBattleFactor: playerBF,
              enemyWeaponPower: enemy.weaponStrength || 20,
              enemyShieldPower: enemy.shieldStrength || 15,
              enemyDrivePower: enemy.driveStrength || 10,
              enemyBattleFactor: enemyBF,
              enemyHullCondition: enemy.hullCondition || 5,
              currentRound: 1,
              active: true,
              result: null,
            },
            create: {
              characterId: character.id,
              npcRosterId: enemy.npcRosterId || null,
              enemyType: enemy.type,
              enemyName: enemy.name,
              playerWeaponPower: calculateComponentPower(character.ship.weaponStrength, character.ship.weaponCondition),
              playerShieldPower: calculateComponentPower(character.ship.shieldStrength, character.ship.shieldCondition),
              playerDrivePower: calculateComponentPower(character.ship.driveStrength, character.ship.driveCondition),
              playerBattleFactor: playerBF,
              enemyWeaponPower: enemy.weaponStrength || 20,
              enemyShieldPower: enemy.shieldStrength || 15,
              enemyDrivePower: enemy.driveStrength || 10,
              enemyBattleFactor: enemyBF,
              enemyHullCondition: enemy.hullCondition || 5,
              currentRound: 1,
              active: true,
            },
          });

          encounterResult = {
            encounter: true,
            friendly: false,
            cloakerEligible,
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

    // ── SP.END.S pirate lurk (lines 86-98): check for lurking human pirates ──
    // SP.PATPIR.S checks the "pirates" file for players in pirate mode lurking
    // in the destination system. In the modern game this is extraCurricularMode='pirate'
    // with patrolSector matching the destination system.
    // Pirate encounters take priority over NPC encounters (original: sp.patpir runs
    // independently from the regular encounter chain).
    if (!encounterResult) {
      const lurkingPirate = await prisma.character.findFirst({
        where: {
          extraCurricularMode: 'pirate',
          patrolSector: travelDestination,
          id: { not: character.id },
        },
        include: { ship: true },
      });

      if (lurkingPirate?.ship) {
        const { calculateBattleFactor } = await import('../../game/systems/combat.js');
        const { calculateComponentPower } = await import('../../game/utils.js');
        const pirateShip = lurkingPirate.ship;

        // Calculate pirate's battle factor using the same formula as any player character
        const pirateBF = calculateBattleFactor(
          {
            weaponStrength: pirateShip.weaponStrength, weaponCondition: pirateShip.weaponCondition,
            shieldStrength: pirateShip.shieldStrength, shieldCondition: pirateShip.shieldCondition,
            cabinStrength: pirateShip.cabinStrength, cabinCondition: pirateShip.cabinCondition,
            roboticsStrength: pirateShip.roboticsStrength, roboticsCondition: pirateShip.roboticsCondition,
            lifeSupportStrength: pirateShip.lifeSupportStrength, lifeSupportCondition: pirateShip.lifeSupportCondition,
            navigationStrength: pirateShip.navigationStrength, navigationCondition: pirateShip.navigationCondition,
            driveStrength: pirateShip.driveStrength, driveCondition: pirateShip.driveCondition,
            hullStrength: pirateShip.hullStrength, hullCondition: pirateShip.hullCondition,
            hasAutoRepair: pirateShip.hasAutoRepair,
          },
          lurkingPirate.rank as any,
          lurkingPirate.battlesWon,
          lurkingPirate.tripCount,
        );

        const playerBF = calculateBattleFactor(
          {
            weaponStrength: character.ship!.weaponStrength, weaponCondition: character.ship!.weaponCondition,
            shieldStrength: character.ship!.shieldStrength, shieldCondition: character.ship!.shieldCondition,
            cabinStrength: character.ship!.cabinStrength, cabinCondition: character.ship!.cabinCondition,
            roboticsStrength: character.ship!.roboticsStrength, roboticsCondition: character.ship!.roboticsCondition,
            lifeSupportStrength: character.ship!.lifeSupportStrength, lifeSupportCondition: character.ship!.lifeSupportCondition,
            navigationStrength: character.ship!.navigationStrength, navigationCondition: character.ship!.navigationCondition,
            driveStrength: character.ship!.driveStrength, driveCondition: character.ship!.driveCondition,
            hullStrength: character.ship!.hullStrength, hullCondition: character.ship!.hullCondition,
            hasAutoRepair: character.ship!.hasAutoRepair,
          },
          character.rank as any,
          character.battlesWon,
          character.tripCount,
        );

        await prisma.combatSession.upsert({
          where: { characterId: character.id },
          update: {
            npcRosterId: null,
            enemyType: 'PIRATE',
            enemyName: lurkingPirate.shipName || lurkingPirate.name,
            playerWeaponPower: calculateComponentPower(character.ship!.weaponStrength, character.ship!.weaponCondition),
            playerShieldPower: calculateComponentPower(character.ship!.shieldStrength, character.ship!.shieldCondition),
            playerDrivePower: calculateComponentPower(character.ship!.driveStrength, character.ship!.driveCondition),
            playerBattleFactor: playerBF,
            enemyWeaponPower: pirateShip.weaponStrength,
            enemyShieldPower: pirateShip.shieldStrength,
            enemyDrivePower: pirateShip.driveStrength,
            enemyBattleFactor: pirateBF,
            enemyHullCondition: pirateShip.hullCondition,
            currentRound: 1,
            active: true,
            result: null,
          },
          create: {
            characterId: character.id,
            npcRosterId: null,
            enemyType: 'PIRATE',
            enemyName: lurkingPirate.shipName || lurkingPirate.name,
            playerWeaponPower: calculateComponentPower(character.ship!.weaponStrength, character.ship!.weaponCondition),
            playerShieldPower: calculateComponentPower(character.ship!.shieldStrength, character.ship!.shieldCondition),
            playerDrivePower: calculateComponentPower(character.ship!.driveStrength, character.ship!.driveCondition),
            playerBattleFactor: playerBF,
            enemyWeaponPower: pirateShip.weaponStrength,
            enemyShieldPower: pirateShip.shieldStrength,
            enemyDrivePower: pirateShip.driveStrength,
            enemyBattleFactor: pirateBF,
            enemyHullCondition: pirateShip.hullCondition,
            currentRound: 1,
            active: true,
          },
        });

        encounterResult = {
          encounter: true,
          friendly: false,
          cloakerEligible: false,
          enemy: {
            name: lurkingPirate.shipName || lurkingPirate.name,
            class: pirateShip.hullName || 'Unknown',
            type: 'PIRATE',
            battleFactor: pirateBF,
          },
          playerBF,
          message: `\x1b[31;1mAmbush! ${lurkingPirate.name}'s ${lurkingPirate.shipName || 'ship'} springs from cover!\x1b[0m`,
        };
      }
    }

    const { completeTravel } = await import('../../game/systems/travel.js');
    await completeTravel(character.id, travelDestination);

    const { processDocking } = await import('../../game/systems/docking.js');
    await processDocking(character.id, travelDestination);

    // Check if Nemesis lattice puzzle is pending (SP.MAL.S nemgem subroutine)
    let screenOverride: string | undefined;
    if (travelDestination >= 15 && travelDestination <= 20) {
      screenOverride = 'rim-port';
    } else if (travelDestination >= 21 && travelDestination <= 26) {
      screenOverride = 'andromeda-dock';
    } else if (travelDestination === 28) {
      const updatedChar = await prisma.character.findUnique({
        where: { id: character.id },
        select: { pendingLattice: true },
      });
      if (updatedChar?.pendingLattice) {
        screenOverride = 'nemesis-lattice';
      } else {
        // SP.BLACK.S start section: arriving at black hole without Nemesis battle → hub screen
        screenOverride = 'black-hole-hub';
      }
    }

    // Push travel:complete to the character's socket room
    const destSystem = await prisma.starSystem.findUnique({ where: { id: travelDestination } });
    const io = getIO();
    if (io) {
      io.to(`character:${character.id}`).emit('travel:complete', {
        systemId: travelDestination,
        systemName: destSystem?.name || `System ${travelDestination}`,
        encounter: encounterResult,
        hazards: hazardEvents.length > 0 ? hazardEvents : undefined,
        screenOverride,
      });
    }

    return {
      success: true,
      system: travelDestination,
      hazards: hazardEvents.length > 0 ? hazardEvents : undefined,
      encounter: encounterResult,
    };
  });

  // ── SP.WARP.S lines 123-143: Cloaker toggle resolution ──────────────────
  // Called after player interacts with the cloaker toggle screen.
  // cloakerOn=true: attempt to cloak (with malfunction check for smuggling)
  // cloakerOn=false: proceed to combat
  fastify.post('/api/navigation/cloaker-resolve', {
    preValidation: [requireAuth],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { cloakerOn } = request.body as { cloakerOn: boolean };

    const character = await prisma.character.findFirst({
      where: { userId },
      include: { ship: true },
    });

    if (!character?.ship) {
      return reply.status(400).send({ error: 'No ship found' });
    }

    // Player chose OFF — proceed straight to combat (CombatSession already exists)
    if (!cloakerOn) {
      return { cloaked: false, malfunction: false, message: '' };
    }

    // Player chose ON — run cloaker logic
    const { attemptCloakDuringTravel } = await import('../../game/systems/combat.js');
    const result = attemptCloakDuringTravel(
      character.missionType,
      character.ship.hasCloaker,
      character.ship.cabinStrength,
      character.ship.cabinCondition,
    );

    if (result.cloaked) {
      // Cloaker worked — delete CombatSession, skip fight
      await prisma.combatSession.deleteMany({
        where: { characterId: character.id },
      });
    }

    return {
      cloaked: result.cloaked,
      malfunction: result.malfunction,
      message: result.cloaked
        ? `...the ${character.shipName || 'ship'} is Cloaked!`
        : result.malfunction
          ? 'Cloaker Malfunction!'
          : '',
    };
  });
}
