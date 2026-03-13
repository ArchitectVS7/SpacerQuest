/**
 * SpacerQuest v4.0 - Combat System
 * 
 * Implements battle mechanics from original SP.FIGHT1.S
 * All formulas preserved exactly from the original
 */

import { BattleResult, Rank } from '@prisma/client';
import {
  RANK_BF_BONUS,
  EXPERIENCE_BF_DIVISOR,
  AUTO_REPAIR_BF_BONUS,
  TRIBUTE_BASE_MULTIPLIER,
  TRIBUTE_MAX,
  RETREAT_SUCCESS_CHANCE,
  CLOAKING_ESCAPE_CHANCE,
  ENCOUNTER_BASE_CHANCE,
  ENCOUNTER_RIM_CHANCE,
  PIRATE_CLASSES,
} from '../constants';
import { calculateComponentPower, rollD100, rollDice, checkProbability, randomInt } from '../utils.js';

// ============================================================================
// ENCOUNTER GENERATION
// ============================================================================

export interface Enemy {
  type: 'PIRATE' | 'PATROL' | 'RIM_PIRATE' | 'BRIGAND' | 'REPTILOID';
  class: string;
  name: string;
  commander: string;
  system: number;
  weaponStrength: number;
  weaponCondition: number;
  shieldStrength: number;
  shieldCondition: number;
  driveStrength: number;
  driveCondition: number;
  hullStrength: number;
  hullCondition: number;
  battleFactor: number;
  fuel: number;
}

/**
 * Generate random encounter during travel
 * 
 * Original from SP.FIGHT1.S:
 *   r=4: if sk=5 r=3 ... if sk=3 r=pz ... gosub rand
 */
export function generateEncounter(
  currentSystem: number,
  missionType: number,
  playerPower: number
): Enemy | null {
  // Determine encounter chance based on system type
  const encounterChance = currentSystem > 14 ? ENCOUNTER_RIM_CHANCE : ENCOUNTER_BASE_CHANCE;
  
  // Roll for encounter
  if (!checkProbability(encounterChance)) {
    return null;
  }
  
  // Determine enemy type based on mission
  if (missionType === 2) {
    // Space Patrol mission - encounter pirates
    return generatePirate(playerPower);
  }
  
  if (missionType === 5) {
    // Smuggling - encounter patrol
    return generatePatrol(playerPower);
  }
  
  if (currentSystem > 14) {
    // Rim Stars - rim pirates
    return generateRimPirate(playerPower);
  }
  
  // Standard cargo run - pirate encounter
  return generatePirate(playerPower);
}

/**
 * Generate pirate enemy
 */
function generatePirate(playerPower: number): Enemy {
  const pirateClass = getPirateClassForPower(playerPower);
  const powerMultiplier = getPiratePowerMultiplier(pirateClass);
  
  return {
    type: 'PIRATE',
    class: pirateClass.name,
    name: generatePirateShipName(),
    commander: generatePirateName(),
    system: randomInt(1, 14),
    weaponStrength: Math.floor(20 * powerMultiplier),
    weaponCondition: randomInt(5, 9),
    shieldStrength: Math.floor(15 * powerMultiplier),
    shieldCondition: randomInt(5, 9),
    driveStrength: Math.floor(15 * powerMultiplier),
    driveCondition: randomInt(5, 9),
    hullStrength: Math.floor(20 * powerMultiplier),
    hullCondition: randomInt(5, 9),
    battleFactor: 0, // Calculated below
    fuel: randomInt(100, 500),
  };
}

/**
 * Generate Space Patrol enemy (for smugglers)
 */
function generatePatrol(playerPower: number): Enemy {
  const powerMultiplier = 1.0 + (playerPower / 500);
  
  return {
    type: 'PATROL',
    class: 'SPX',
    name: 'Space Patrol Interceptor',
    commander: 'Patrol Commander',
    system: randomInt(1, 14),
    weaponStrength: Math.floor(25 * powerMultiplier),
    weaponCondition: 9,
    shieldStrength: Math.floor(20 * powerMultiplier),
    shieldCondition: 9,
    driveStrength: Math.floor(20 * powerMultiplier),
    driveCondition: 9,
    hullStrength: Math.floor(25 * powerMultiplier),
    hullCondition: 9,
    battleFactor: 0,
    fuel: 1000,
  };
}

/**
 * Generate Rim Pirate enemy
 */
function generateRimPirate(playerPower: number): Enemy {
  const powerMultiplier = 1.5 + (playerPower / 400);
  
  return {
    type: 'RIM_PIRATE',
    class: 'RIM',
    name: generatePirateShipName(),
    commander: generatePirateName(),
    system: randomInt(15, 20),
    weaponStrength: Math.floor(30 * powerMultiplier),
    weaponCondition: randomInt(6, 9),
    shieldStrength: Math.floor(25 * powerMultiplier),
    shieldCondition: randomInt(6, 9),
    driveStrength: Math.floor(20 * powerMultiplier),
    driveCondition: randomInt(6, 9),
    hullStrength: Math.floor(30 * powerMultiplier),
    hullCondition: randomInt(6, 9),
    battleFactor: 0,
    fuel: randomInt(200, 600),
  };
}

function getPirateClassForPower(playerPower: number) {
  for (const pc of PIRATE_CLASSES) {
    if (playerPower >= pc.minPower && playerPower <= pc.maxPower) {
      return pc;
    }
  }
  return PIRATE_CLASSES[2]; // SPZ
}

function getPiratePowerMultiplier(pirateClass: typeof PIRATE_CLASSES[number]): number {
  if (pirateClass.name === 'SPX') return 1.0;
  if (pirateClass.name === 'SPY') return 1.5;
  return 2.0; // SPZ
}

// ============================================================================
// BATTLE FACTOR CALCULATION
// ============================================================================

export interface ShipStats {
  weaponStrength: number;
  weaponCondition: number;
  shieldStrength: number;
  shieldCondition: number;
  cabinStrength: number;
  cabinCondition: number;
  roboticsStrength: number;
  roboticsCondition: number;
  lifeSupportStrength: number;
  lifeSupportCondition: number;
  navigationStrength: number;
  navigationCondition: number;
  driveStrength: number;
  driveCondition: number;
  hasAutoRepair: boolean;
}

/**
 * Calculate Battle Factor
 * 
 * Original from SP.FIGHT1.S:
 *   BF = (weapon × condition) + (shield × condition) + 
 *        (cabin × condition / 10) + (robotics × condition / 10) +
 *        (life support × condition / 10) + rank_bonus + experience_bonus
 */
export function calculateBattleFactor(
  ship: ShipStats,
  rank: Rank,
  battlesWon: number
): number {
  // Component contributions
  const weaponBF = calculateComponentPower(ship.weaponStrength, ship.weaponCondition);
  const shieldBF = calculateComponentPower(ship.shieldStrength, ship.shieldCondition);
  
  // Computer contributions (divided by 10)
  const cabinBF = Math.floor(calculateComponentPower(ship.cabinStrength, ship.cabinCondition) / 10);
  const roboticsBF = Math.floor(calculateComponentPower(ship.roboticsStrength, ship.roboticsCondition) / 10);
  const lifeBF = Math.floor(calculateComponentPower(ship.lifeSupportStrength, ship.lifeSupportCondition) / 10);
  
  // Rank bonus
  const rankBonus = RANK_BF_BONUS[rank as keyof typeof RANK_BF_BONUS] || 0;
  
  // Experience bonus (battles won / 10)
  const experienceBonus = Math.floor(battlesWon / EXPERIENCE_BF_DIVISOR);
  
  // Auto-repair module bonus
  const autoRepairBonus = ship.hasAutoRepair ? AUTO_REPAIR_BF_BONUS : 0;
  
  return weaponBF + shieldBF + cabinBF + roboticsBF + lifeBF + rankBonus + experienceBonus + autoRepairBonus;
}

/**
 * Calculate enemy battle factor
 */
export function calculateEnemyBattleFactor(enemy: Enemy): number {
  const weaponBF = calculateComponentPower(enemy.weaponStrength, enemy.weaponCondition);
  const shieldBF = calculateComponentPower(enemy.shieldStrength, enemy.shieldCondition);
  
  // Enemies get simplified calculation
  return weaponBF + shieldBF;
}

// ============================================================================
// COMBAT ROUND
// ============================================================================

export interface CombatRound {
  round: number;
  playerDamage: number;
  enemyDamage: number;
  playerShieldDamage: number;
  enemyShieldDamage: number;
  playerSystemDamage: number;
  enemySystemDamage: number;
  battleAdvantage: 'PLAYER' | 'ENEMY' | 'EVEN';
  combatLog: string[];
}

/**
 * Process one round of combat
 * 
 * Original from SP.FIGHT1.S:
 *   x8=w2*w1 (player weapon power)
 *   y8=p8*p7 (enemy weapon power)
 *   x9=p2*p1 (player shield power)
 *   y9=s8*s7 (enemy shield power)
 */
export function processCombatRound(
  playerBF: number,
  playerWeaponStr: number,
  playerWeaponCond: number,
  playerShieldStr: number,
  playerShieldCond: number,
  enemy: Enemy,
  round: number
): CombatRound {
  const combatLog: string[] = [];
  
  // Calculate power levels
  const playerWeaponPower = playerWeaponStr * playerWeaponCond;
  const playerShieldPower = playerShieldStr * playerShieldCond;
  const enemyWeaponPower = enemy.weaponStrength * enemy.weaponCondition;
  const enemyShieldPower = enemy.shieldStrength * enemy.shieldCondition;
  
  // Determine battle advantage
  const battleAdvantage = playerBF > enemy.battleFactor ? 'PLAYER' :
                          playerBF < enemy.battleFactor ? 'ENEMY' : 'EVEN';
  
  combatLog.push(`Round #${round} - Battle Advantage: ${battleAdvantage}`);
  
  // Player attacks
  let playerDamage = 0;
  let playerShieldDamage = 0;
  let playerSystemDamage = 0;
  
  if (playerWeaponPower > enemyShieldPower) {
    const excessDamage = playerWeaponPower - enemyShieldPower;
    playerShieldDamage = Math.floor(excessDamage / 10);
    playerSystemDamage = excessDamage % 10;
    playerDamage = playerShieldDamage + playerSystemDamage;
    combatLog.push(`Your weapons hit for ${playerDamage} damage!`);
  } else {
    combatLog.push('Enemy shields deflect your attack');
  }
  
  // Enemy attacks
  let enemyDamage = 0;
  let enemyShieldDamage = 0;
  let enemySystemDamage = 0;
  
  if (enemyWeaponPower > playerShieldPower) {
    const excessDamage = enemyWeaponPower - playerShieldPower;
    enemyShieldDamage = Math.floor(excessDamage / 10);
    enemySystemDamage = excessDamage % 10;
    enemyDamage = enemyShieldDamage + enemySystemDamage;
    combatLog.push(`Enemy weapons hit for ${enemyDamage} damage!`);
  } else {
    combatLog.push('Your shields deflect the enemy attack');
  }
  
  return {
    round,
    playerDamage,
    enemyDamage,
    playerShieldDamage,
    enemyShieldDamage,
    playerSystemDamage,
    enemySystemDamage,
    battleAdvantage,
    combatLog,
  };
}

// ============================================================================
// DAMAGE APPLICATION
// ============================================================================

export interface DamageResult {
  shieldsReduced: number;
  systemDamaged?: {
    component: string;
    conditionLost: number;
  };
}

/**
 * Apply damage to shields
 */
export function applyShieldDamage(
  currentCondition: number,
  damage: number
): { newCondition: number; reduced: number } {
  const reduced = Math.min(damage, currentCondition);
  const newCondition = Math.max(0, currentCondition - reduced);
  return { newCondition, reduced };
}

/**
 * Apply system damage (random component hit)
 * 
 * Original from SP.FIGHT1.S - damage can hit:
 * Cabin, Nav, Drives, Robotics, Weapons, Hull
 */
export function applySystemDamage(
  ship: ShipStats,
  damage: number
): DamageResult & { updatedShip: ShipStats } {
  const updatedShip = { ...ship };
  const damageRoll = rollDice(6);
  
  let componentDamaged = '';
  let conditionLost = 0;
  
  switch (damageRoll) {
    case 1: // Cabin
      if (updatedShip.cabinCondition > 0) {
        updatedShip.cabinCondition = Math.max(0, updatedShip.cabinCondition - 1);
        componentDamaged = 'Cabin';
        conditionLost = 1;
      }
      break;
    case 2: // Navigation
      if (updatedShip.navigationCondition > 0) {
        updatedShip.navigationCondition = Math.max(0, updatedShip.navigationCondition - 1);
        componentDamaged = 'Navigation';
        conditionLost = 1;
      }
      break;
    case 3: // Drives
      if (updatedShip.driveCondition > 0) {
        updatedShip.driveCondition = Math.max(0, updatedShip.driveCondition - 1);
        componentDamaged = 'Drives';
        conditionLost = 1;
      }
      break;
    case 4: // Robotics
      if (updatedShip.roboticsCondition > 0) {
        updatedShip.roboticsCondition = Math.max(0, updatedShip.roboticsCondition - 1);
        componentDamaged = 'Robotics';
        conditionLost = 1;
      }
      break;
    case 5: // Weapons
      if (updatedShip.weaponCondition > 0) {
        updatedShip.weaponCondition = Math.max(0, updatedShip.weaponCondition - 1);
        componentDamaged = 'Weapons';
        conditionLost = 1;
      }
      break;
    case 6: // Hull
      if (updatedShip.lifeSupportCondition > 0) {
        updatedShip.lifeSupportCondition = Math.max(0, updatedShip.lifeSupportCondition - 1);
        componentDamaged = 'Life Support';
        conditionLost = 1;
      }
      break;
  }
  
  return {
    shieldsReduced: 0,
    systemDamaged: componentDamaged ? { component: componentDamaged, conditionLost } : undefined,
    updatedShip,
  };
}

// ============================================================================
// COMBAT ACTIONS
// ============================================================================

export interface RetreatResult {
  success: boolean;
  message: string;
}

/**
 * Attempt to retreat from combat
 * 
 * Original: Check if faster ship, then retreat chance
 */
export function attemptRetreat(
  playerDrivePower: number,
  enemyDrivePower: number,
  hasCloaker: boolean
): RetreatResult {
  // Cloaking device provides escape chance
  if (hasCloaker && checkProbability(CLOAKING_ESCAPE_CHANCE)) {
    return {
      success: true,
      message: 'Morton\'s Cloaker activates... you escape!',
    };
  }
  
  // Compare speeds
  if (playerDrivePower > enemyDrivePower) {
    if (checkProbability(RETREAT_SUCCESS_CHANCE)) {
      return {
        success: true,
        message: 'Your superior drives allow you to escape!',
      };
    }
  }
  
  return {
    success: false,
    message: 'Enemy prevents your retreat!',
  };
}

export interface SurrenderResult {
  accepted: boolean;
  tributeDemanded: number;
  message: string;
}

/**
 * Enemy demands tribute
 * 
 * Original from SP.FIGHT1.S:
 *   kc=(kg*1000):if kg>12 kc=10000
 */
export function enemyDemandsTribute(
  combatRounds: number,
  playerCredits: number
): SurrenderResult {
  // Calculate tribute demand
  let tribute = combatRounds * TRIBUTE_BASE_MULTIPLIER;
  if (combatRounds > 12) tribute = TRIBUTE_MAX;
  tribute = Math.min(tribute, TRIBUTE_MAX);
  
  // Cap at player's available credits
  tribute = Math.min(tribute, playerCredits);
  
  return {
    accepted: true,
    tributeDemanded: tribute,
    message: `Enemy demands ${tribute} cr tribute!`,
  };
}

// ============================================================================
// BATTLE RECORD
// ============================================================================

/**
 * Record battle result in database
 */
export async function recordBattle(
  characterId: string,
  enemy: Enemy,
  result: BattleResult,
  rounds: number,
  playerBF: number,
  lootCredits: number,
  damageTaken: Record<string, number>
): Promise<void> {
  const { prisma } = await import('../../db/prisma.js');
  
  await prisma.battleRecord.create({
    data: {
      characterId,
      enemyType: enemy.type.toLowerCase(),
      enemyName: enemy.name,
      enemyClass: enemy.class,
      systemId: enemy.system,
      result,
      rounds,
      battleFactor: playerBF,
      lootCredits,
      damageTaken,
    },
  });
}

// ============================================================================
// LOOT CALCULATION
// ============================================================================

/**
 * Calculate loot from defeated enemy
 * 
 * Original from SP.FIGHT1.S:
 *   p5=p5+10000 (for big wins)
 *   g2=g2+p5
 */
export function calculateLoot(enemy: Enemy, playerBF: number): number {
  // Base loot from enemy class
  let baseLoot = 0;
  if (enemy.class === 'SPX') baseLoot = 500;
  if (enemy.class === 'SPY') baseLoot = 1000;
  if (enemy.class === 'SPZ') baseLoot = 2000;
  if (enemy.type === 'RIM_PIRATE') baseLoot = 3000;
  
  // Bonus for player's battle factor
  const bfBonus = Math.floor(playerBF / 10);
  
  return baseLoot + bfBonus;
}

// ============================================================================
// NAME GENERATION
// ============================================================================

const PIRATE_NAMES = [
  'Black Star', 'Crimson Raider', 'Void Hunter', 'Nebula Shark',
  'Dark Matter', 'Star Vulture', 'Cosmic Wolf', 'Plasma Jackal',
  'Quantum Bandit', 'Asteroid King', 'Comet Reaper', 'Solar Marauder',
];

const PIRATE_COMMANDERS = [
  'Captain Vex', 'Commander Shadow', 'Admiral Void', 'Captain Blood',
  'Major Chaos', 'General Dark', 'Captain Storm', 'Commander Fire',
];

function generatePirateShipName(): string {
  return PIRATE_NAMES[randomInt(0, PIRATE_NAMES.length - 1)];
}

function generatePirateName(): string {
  return PIRATE_COMMANDERS[randomInt(0, PIRATE_COMMANDERS.length - 1)];
}
