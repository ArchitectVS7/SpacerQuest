/**
 * SpacerQuest v4.0 - Combat System
 *
 * Implements battle mechanics from original SP.FIGHT1.S
 * All formulas preserved exactly from the original
 *
 * NPC encounters use the persistent NpcRoster table, matching the
 * original Apple II data files (PIRATES, SP.PAT, SP.RIMPIR,
 * SP.BRIGAND, SP.REPTILE). A random NPC is selected from the roster
 * based on mission type and system, mirroring SP.FIGHT1.S:62-88.
 */

import { BattleResult, Rank } from '@prisma/client';
import {
  RANK_BF_BONUS,
  EXPERIENCE_BF_DIVISOR,
  TRIBUTE_BASE_MULTIPLIER,
  TRIBUTE_MAX,
  CLOAKING_ESCAPE_CHANCE,
} from '../constants';
import { calculateComponentPower, checkProbability, randomInt } from '../utils.js';

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
  /** NpcRoster.id if this enemy came from the persistent roster */
  npcRosterId?: string;
  /** Credit bounty from the NPC roster */
  creditValue?: number;
  /** Alliance affiliation from the NPC roster */
  alliance?: string;
}

/**
 * Generate encounter during travel by selecting from the NPC roster.
 *
 * Original from SP.WARP.S + SP.FIGHT1.S:62-88:
 *   At tt=(ty/3), tp=1 is set unconditionally — EVERY trip has an encounter.
 *   if sk=1 f$="pirates" ... if sk=2 f$="sp.pat" ...
 *   r=pn:gosub rand:pz=x:po=x  (random selection from roster)
 *
 * In the original game, encounters are DETERMINISTIC — they happen on every
 * trip at 1/3 of travel time. There is no probability roll. Pirates find you
 * regardless of your ship stats. The 30% probability was a v4.0 deviation
 * from the original that has been corrected.
 */
export async function generateEncounter(
  currentSystem: number,
  missionType: number,
  _playerPower: number
): Promise<Enemy | null> {
  // Original SP.WARP.S: encounters are deterministic at 1/3 travel time.
  // No probability check — every trip generates an encounter.

  const { prisma } = await import('../../db/prisma.js');

  // Determine NPC type based on mission — mirrors SP.FIGHT1.S:62-68
  let npcType: string;
  if (missionType === 2) {
    // Space Patrol mission (kk=2) — encounter pirates
    npcType = 'PIRATE';
  } else if (missionType === 5) {
    // Smuggling (kk=5) — encounter patrol
    npcType = 'PATROL';
  } else if (missionType === 10) {
    // Andromeda trip (kk=10) — encounter reptiloids
    npcType = 'REPTILOID';
  } else if (currentSystem > 20) {
    // Andromeda systems (21-26) — reptiloids
    npcType = 'REPTILOID';
  } else if (currentSystem > 14) {
    // Rim Stars (15-20) — rim pirates
    npcType = 'RIM_PIRATE';
  } else {
    // Standard cargo run (kk=1) — pirates or brigands
    npcType = missionType === 4 ? 'PATROL' : 'PIRATE';
  }

  // Select a random NPC from the roster — mirrors "r=pn:gosub rand:pz=x:po=x"
  const rosterCount = await prisma.npcRoster.count({ where: { type: npcType as any } });

  if (rosterCount === 0) {
    // Fallback: if no NPCs of this type exist, return null
    return null;
  }

  const skipCount = randomInt(0, rosterCount - 1);
  const npc = await prisma.npcRoster.findFirst({
    where: { type: npcType as any },
    skip: skipCount,
  });

  if (!npc) {
    return null;
  }

  // Build Enemy from the persistent NPC record
  return npcToEnemy(npc, currentSystem);
}

/**
 * Convert an NpcRoster record to an Enemy combat object.
 */
function npcToEnemy(npc: any, systemOverride?: number): Enemy {
  return {
    type: npc.type as Enemy['type'],
    class: npc.shipClass,
    name: npc.shipName,
    commander: npc.commander,
    system: systemOverride ?? 1,
    weaponStrength: npc.weaponStrength,
    weaponCondition: npc.weaponCondition,
    shieldStrength: npc.shieldStrength,
    shieldCondition: npc.shieldCondition,
    driveStrength: npc.driveStrength,
    driveCondition: npc.driveCondition,
    hullStrength: npc.hullStrength,
    hullCondition: npc.hullCondition,
    battleFactor: 0, // Calculated by caller via calculateEnemyBattleFactor()
    fuel: npc.fuelCapacity,
    npcRosterId: npc.id,
    creditValue: npc.creditValue,
    alliance: npc.alliance,
  };
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

  // Auto-repair module bonus has been removed. Original behavior repairs components instead.
  
  return weaponBF + shieldBF + cabinBF + roboticsBF + lifeBF + rankBonus + experienceBonus;
}

/**
 * Calculate enemy battle factor
 *
 * Original SP.FIGHT1.S ranfix routine: sums all component powers
 * and derives jg (enemy BF bonus) from the total.
 */
export function calculateEnemyBattleFactor(enemy: Enemy): number {
  const weaponBF = calculateComponentPower(enemy.weaponStrength, enemy.weaponCondition);
  const shieldBF = calculateComponentPower(enemy.shieldStrength, enemy.shieldCondition);
  const driveBF = Math.floor(calculateComponentPower(enemy.driveStrength, enemy.driveCondition) / 10);
  const hullBF = Math.floor(calculateComponentPower(enemy.hullStrength, enemy.hullCondition) / 10);

  return weaponBF + shieldBF + driveBF + hullBF;
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
  playerRepairs: number;
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
  hasAutoRepair: boolean,
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

  let playerRepairs = 0;
  if (hasAutoRepair) {
    playerRepairs = 1;
    combatLog.push('Auto-Repair module restores +1 condition to all systems');
  }

  return {
    round,
    playerDamage,
    enemyDamage,
    playerShieldDamage,
    enemyShieldDamage,
    playerSystemDamage,
    enemySystemDamage,
    playerRepairs,
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
  _damage: number
): DamageResult & { updatedShip: ShipStats } {
  const updatedShip = { ...ship };
  let componentDamaged = '';
  let conditionLost = 0;

  // Original SP.FIGHT1.S ordered cascade: Cabin -> Nav -> Drives -> Shields -> Hull(Life Support)
  // Instead of a random roll, we check components in order and damage the first one that has condition > 0
  if (updatedShip.cabinCondition > 0) {
    updatedShip.cabinCondition = Math.max(0, updatedShip.cabinCondition - 1);
    componentDamaged = 'Cabin';
    conditionLost = 1;
  } else if (updatedShip.navigationCondition > 0) {
    updatedShip.navigationCondition = Math.max(0, updatedShip.navigationCondition - 1);
    componentDamaged = 'Navigation';
    conditionLost = 1;
  } else if (updatedShip.driveCondition > 0) {
    updatedShip.driveCondition = Math.max(0, updatedShip.driveCondition - 1);
    componentDamaged = 'Drives';
    conditionLost = 1;
  } else if (updatedShip.shieldCondition > 0) {
    updatedShip.shieldCondition = Math.max(0, updatedShip.shieldCondition - 1);
    componentDamaged = 'Shields';
    conditionLost = 1;
  } else if (updatedShip.lifeSupportCondition > 0) {
    updatedShip.lifeSupportCondition = Math.max(0, updatedShip.lifeSupportCondition - 1);
    componentDamaged = 'Life Support';
    conditionLost = 1;
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
    if (checkProbability(0.5)) {
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
  if (combatRounds > 12) tribute = 10000;
  tribute = Math.min(tribute, 10000);

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
 * Record battle result in database and update NPC battle stats.
 *
 * Original SP.FIGHT1.S wrote updated NPC stats back to the data file
 * via pirwrite (line 134-139). We do the same by updating NpcRoster.
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
      npcRosterId: enemy.npcRosterId || null,
      result,
      rounds,
      battleFactor: playerBF,
      lootCredits,
      damageTaken,
    },
  });

  // Update NPC roster battle stats — mirrors original pirwrite
  if (enemy.npcRosterId) {
    const isPlayerWin = result === 'VICTORY';
    await prisma.npcRoster.update({
      where: { id: enemy.npcRosterId },
      data: isPlayerWin
        ? { battlesLost: { increment: 1 } }
        : { battlesWon: { increment: 1 } },
    });
  }
}

// ============================================================================
// LOOT CALCULATION
// ============================================================================

/**
 * Calculate loot from defeated enemy
 *
 * When enemy comes from the NPC roster, use the creditValue field.
 * Otherwise fall back to class-based calculation.
 */
export function calculateLoot(enemy: Enemy, playerBF: number): number {
  // Original pirate salvage formula based on cargo type
  let baseLoot = 0;
  // Fallback to creditValue if no class logic found, otherwise rely on class/type
  if (enemy.class === 'SPX') baseLoot = 500;
  else if (enemy.class === 'SPY') baseLoot = 1000;
  else if (enemy.class === 'SPZ') baseLoot = 2000;
  else if (enemy.type === 'RIM_PIRATE') baseLoot = 3000;
  else if (enemy.type === 'PIRATE') baseLoot = 1000; // Base estimate for standard pirates
  else if (enemy.creditValue && enemy.creditValue > 0) baseLoot = enemy.creditValue;

  // Bonus for player's battle factor
  const bfBonus = Math.floor(playerBF / 10);

  return baseLoot + bfBonus;
}

// ============================================================================
// ALLIANCE CHECK
// ============================================================================

/**
 * Check if the NPC is friendly (same alliance as player).
 *
 * Original SP.FIGHT1.S:138:
 *   if right$(p5$,2)=right$(nz$,2) print pz$" "p5$" Hails A Friendly Greeting."
 */
export function isNpcFriendly(enemy: Enemy, playerAlliance: string): boolean {
  if (!enemy.alliance || enemy.alliance === 'NONE') return false;
  if (!playerAlliance || playerAlliance === 'NONE') return false;
  return enemy.alliance === playerAlliance;
}
