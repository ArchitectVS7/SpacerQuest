/**
 * SpacerQuest v4.0 - Mission Generation Job
 * 
 * Runs every 6 hours to:
 * - Generate patrol missions
 * - Check Nemesis/Maligna eligibility
 * - Generate special events
 */

import { randomInt } from '../game/utils.js';
import {
  NEMESIS_REQUIREMENT_WINS,
  PATROL_BASE_PAY,
} from '../game/constants.js';
import { prisma } from '../db/prisma.js';

export interface MissionJobResult {
  patrolMissionsGenerated: number;
  nemesisOffers: number;
  specialEvents: number;
}

/**
 * Run the mission generation job
 */
export async function runMissionJob(): Promise<MissionJobResult> {
  const result: MissionJobResult = {
    patrolMissionsGenerated: 0,
    nemesisOffers: 0,
    specialEvents: 0,
  };
  
  console.log('[Mission Job] Starting mission generation...');
  
  // 1. Generate patrol missions for eligible players
  result.patrolMissionsGenerated = await generatePatrolMissions();
  
  // 2. Check Nemesis eligibility
  result.nemesisOffers = await checkNemesisEligibility();
  
  // 3. Generate special events
  result.specialEvents = await generateSpecialEvents();
  
  console.log(`[Mission Job] Completed: ${result.patrolMissionsGenerated} patrol missions, ${result.nemesisOffers} Nemesis offers`);
  
  return result;
}

/**
 * Generate Space Patrol missions
 * Players not on patrol may be offered missions
 */
async function generatePatrolMissions(): Promise<number> {
  // Find eligible characters (not on patrol, good standing)
  const eligibleCharacters = await prisma.character.findMany({
    where: {
      missionType: 0, // Not on mission
      battlesWon: { gte: 10 }, // At least 10 wins
      ship: {
        weaponStrength: { gte: 10 },
        shieldStrength: { gte: 10 },
      },
    },
    include: {
      ship: true,
    },
    take: 20,
  });
  
  let missionsGenerated = 0;
  
  for (const char of eligibleCharacters) {
    // 20% chance to be offered a patrol mission
    if (Math.random() > 0.2) continue;
    
    // Assign random sector
    const sector = randomInt(1, 14);
    
    await prisma.character.update({
      where: { id: char.id },
      data: {
        missionType: 2, // Space Patrol
        patrolSector: sector,
        cargoPods: 10, // Secret battle codes
        cargoType: 100, // Special cargo type for patrol
        cargoPayment: PATROL_BASE_PAY + (char.battlesWon * 1000),
        destination: sector,
      },
    });
    
    await prisma.gameLog.create({
      data: {
        type: 'MISSION',
        characterId: char.id,
        message: `${char.name} offered Space Patrol mission in sector ${sector}`,
        metadata: {
          missionType: 'PATROL',
          sector,
        },
      },
    });
    
    missionsGenerated++;
  }
  
  return missionsGenerated;
}

/**
 * Check for Nemesis mission eligibility
 * Requires 500+ battle wins
 */
async function checkNemesisEligibility(): Promise<number> {
  const eligibleCharacters = await prisma.character.findMany({
    where: {
      battlesWon: { gte: NEMESIS_REQUIREMENT_WINS },
      missionType: 0, // Not on mission
      ship: {
        hullCondition: 9, // Perfect condition
        driveCondition: 9,
        cabinCondition: 9,
        lifeSupportCondition: 9,
        weaponCondition: 9,
        navigationCondition: 9,
        roboticsCondition: 9,
        shieldCondition: 9,
      },
    },
    include: {
      ship: true,
    },
  });
  
  let offers = 0;
  
  for (const char of eligibleCharacters) {
    // Check if already offered/completed
    if (char.cargoManifest?.includes('Nemesis')) continue;
    
    // Offer the Nemesis mission
    await prisma.character.update({
      where: { id: char.id },
      data: {
        cargoManifest: 'Nemesis Orders - Coordinates: 00,00,00',
        destination: 28, // Nemesis system ID
      },
    });
    
    await prisma.gameLog.create({
      data: {
        type: 'MISSION',
        characterId: char.id,
        message: `${char.name} offered the NEMESIS MISSION! Coordinates: 00,00,00`,
        metadata: {
          missionType: 'NEMESIS',
          coordinates: { x: 0, y: 0, z: 0 },
          reward: 150000,
        },
      },
    });
    
    offers++;
  }
  
  return offers;
}

/**
 * Generate special events
 */
async function generateSpecialEvents(): Promise<number> {
  let events = 0;
  
  // Random special event: Maligna mission availability
  if (Math.random() > 0.7) { // 30% chance each run
    // Find conquerors eligible for Maligna mission
    const conquerors = await prisma.character.findMany({
      where: {
        isConqueror: true,
        ship: {
          isAstraxialHull: true,
          driveStrength: { gte: 25 },
        },
      },
    });
    
    for (const char of conquerors) {
      if (!char.cargoManifest?.includes('Maligna')) {
        await prisma.character.update({
          where: { id: char.id },
          data: {
            cargoManifest: 'MALIGNA MISSION - Coordinates: 13,33,99',
          },
        });
        
        events++;
      }
    }
  }
  
  // Random event: Alliance war bulletin
  if (Math.random() > 0.8) { // 20% chance
    const alliances = ['ASTRO_LEAGUE', 'SPACE_DRAGONS', 'WARLORD_CONFED', 'REBEL_ALLIANCE'];
    const alliance1 = alliances[randomInt(0, 3)];
    let alliance2 = alliances[randomInt(0, 3)];
    
    while (alliance2 === alliance1) {
      alliance2 = alliances[randomInt(0, 3)];
    }
    
    await prisma.gameLog.create({
      data: {
        type: 'ALLIANCE',
        message: `WAR BULLETIN: ${alliance1} and ${alliance2} tensions rising!`,
        metadata: {
          event: 'ALLIANCE_TENSION',
          alliances: [alliance1, alliance2],
        },
      },
    });
    
    events++;
  }
  
  return events;
}
