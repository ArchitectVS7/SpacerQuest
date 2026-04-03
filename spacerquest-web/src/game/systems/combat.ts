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
// CLOAKING DEVICE TOGGLE (SP.WARP.S lines 118-143)
// ============================================================================

/**
 * SP.WARP.S flank/flock logic for cloaking device during encounters.
 *
 * Original flow:
 *   if (kk=1) or (kk=5) goto flank
 *   flank: if right$(p1$,1)<>"=" link "sp.fight1"  (no cloaker → fight)
 *   Player toggles cloaker ON/OFF with spacebar, presses G to engage
 *   flock: if kk<>5 goto contin (non-smuggling: cloaker always works if ON)
 *          r=(c1+c2):gosub rand:if x>c1 → "Cloaker Malfunction!" → fight
 *          goto contin
 *   contin: if a$="OFF" → fight
 *           if a$="ON " → "the ship is Cloaked!" → skip fight
 *
 * In the web version, cloaker is auto-engaged when present. The player
 * does not need to press spacebar interactively — the system automatically
 * attempts to cloak.
 *
 * @param missionType    - kk value (1=cargo, 5=smuggling)
 * @param hasCloaker     - whether ship has Morton's Cloaker (p1$ ends with "=")
 * @param cabinStrength  - c1: cabin strength (used in malfunction check)
 * @param cabinCondition - c2: cabin condition (used in malfunction check)
 * @returns { cloaked: true } to skip fight, { cloaked: false, malfunction?: true } to proceed to fight
 */
export function attemptCloakDuringTravel(
  missionType: number,
  hasCloaker: boolean,
  cabinStrength: number,
  cabinCondition: number,
): { cloaked: boolean; malfunction: boolean; message: string } {
  // Only cargo (kk=1) and smuggling (kk=5) missions can use cloaker during travel
  if (missionType !== 1 && missionType !== 5) {
    return { cloaked: false, malfunction: false, message: '' };
  }

  // No cloaker equipped — go straight to fight
  if (!hasCloaker) {
    return { cloaked: false, malfunction: false, message: '' };
  }

  // For smuggling runs (kk=5), cloaker has a malfunction chance
  // Original: r=(c1+c2):gosub rand:if x>c1 → malfunction
  if (missionType === 5) {
    const r = cabinStrength + cabinCondition;
    const x = r > 0 ? randomInt(1, r) : 1;
    if (x > cabinStrength) {
      return {
        cloaked: false,
        malfunction: true,
        message: 'Cloaker Malfunction!',
      };
    }
  }

  // Cloaker works — ship is cloaked, skip the fight
  return {
    cloaked: true,
    malfunction: false,
    message: `Morton's Cloaking Device engaged...the ship is Cloaked!`,
  };
}

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
  playerWeaponStrength: number
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

  // SP.FIGHT1.S lines 113-126: attack threshold check using sp.conf (jw/jx/ju/jv)
  // Pirates K1-K9: player weapon must be in [jm, jn] where jm=(ju*tier+15), jn=jm+(jv*5)
  // Patrol SPX: player weapon must be >= jw; Patrol SPZ: player weapon must be >= jx
  // Only applied for PIRATE and PATROL types (not rim, reptiloid, brigand)
  if ((npcType === 'PIRATE' || npcType === 'PATROL') && playerWeaponStrength > 0) {
    const { getGameConfig } = await import('./game-config.js');
    const gameConfig = await getGameConfig();
    const ju = gameConfig.attackRandomMin;
    const jv = gameConfig.attackRandomMax;
    const jw = gameConfig.pirateAttackThreshold;
    const jx = gameConfig.patrolAttackThreshold;

    if (npcType === 'PATROL') {
      // SPX: weapon >= jw; SPZ: weapon >= jx (SP.FIGHT1.S lines 120-121)
      const shipName = npc.shipName || '';
      const prefix = shipName.substring(0, 3).toUpperCase();
      if (prefix === 'SPX' && playerWeaponStrength < jw) return null;
      if (prefix === 'SPZ' && playerWeaponStrength < jx) return null;
    } else if (npcType === 'PIRATE') {
      // K1-K9: player weapon must be in [jm, jn] (SP.FIGHT1.S lines 125-126)
      const shipName = npc.shipName || '';
      const tierStr = shipName.substring(1, 2); // 'K1!!!!'.substring(1,2) → '1'
      const tier = parseInt(tierStr, 10);
      if (!isNaN(tier) && tier >= 1 && tier <= 9) {
        const jm = (ju * tier) + 15;
        const jn = jm + (jv * 5);
        if (playerWeaponStrength < jm || playerWeaponStrength > jn) return null;
      }
    }
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
  hullStrength: number;
  hullCondition: number;
  hasAutoRepair: boolean;
}

/**
 * Calculate Battle Factor (total player power for battle advantage)
 *
 * Original from SP.FIGHT1.S: hx=x8+x9+r9
 *   x8 = w2*w1  (weapon condition × weapon strength — weapon power)
 *   x9 = p2*p1  (shield condition × shield strength — shield power)
 *   r9 = BF bonus from ranfix routine (support components + experience)
 *
 * The ranfix routine (FIGHT1.S:471-491) computes r9:
 *   For each of [cabin, life support, nav, drives, robotics, hull]:
 *     sum += floor((condition+1) * strength / 10)
 *   sum += floor(battlesWon / 10)       [e1 = battles won]
 *   r9 = sum/5  (if sum > 4)
 *   r9 = 10     (if sum <= 4)
 *
 * NOTE: Weapon and shield are NOT in ranfix. They are separate (x8, x9).
 * NOTE: Rank bonus is NOT in the original ranfix — only battlesWon (e1).
 * NOTE: Auto-repair does NOT give a BF bonus — it repairs components post-battle.
 */
export function calculateBattleFactor(
  ship: ShipStats,
  rank: Rank,
  battlesWon: number,
  tripCount = 0,
): number {
  // Weapon power (x8 = w2*w1) and shield power (x9 = p2*p1)
  const weaponPower = calculateComponentPower(ship.weaponStrength, ship.weaponCondition);
  const shieldPower = calculateComponentPower(ship.shieldStrength, ship.shieldCondition);

  // ranfix: support component contributions use (condition+1)*strength/10
  // This means even a fully-damaged component (condition=0) still contributes strength/10
  const cabinContrib   = Math.floor((ship.cabinCondition + 1)        * ship.cabinStrength / 10);
  const lssContrib     = Math.floor((ship.lifeSupportCondition + 1)  * ship.lifeSupportStrength / 10);
  const navContrib     = Math.floor((ship.navigationCondition + 1)   * ship.navigationStrength / 10);
  const driveContrib   = Math.floor((ship.driveCondition + 1)        * ship.driveStrength / 10);
  const roboticsContrib= Math.floor((ship.roboticsCondition + 1)     * ship.roboticsStrength / 10);
  // Original ranfix line 478: a=(h2+1)*h1:gosub rfix — hull included in player BF
  const hullContrib    = Math.floor((ship.hullCondition + 1)         * ship.hullStrength / 10);

  // Experience contribution: e1 (battles won) added DIRECTLY via rfox (not /10)
  // Original ranfix: x=e1:gosub rfox → rfox just does y=y+x (no division)
  // Component pairs go through rfix (/10), but e1 bypasses rfix and uses rfox directly
  void EXPERIENCE_BF_DIVISOR; // constant kept for documentation, not used here
  const expContrib = battlesWon;

  // Trip count bonus: original ranfix line 479: if u1>49 x=(u1/50):gosub rfox
  const tripContrib = tripCount > 49 ? Math.floor(tripCount / 50) : 0;

  // Sum all support contributions
  const supportSum = cabinContrib + lssContrib + navContrib + driveContrib + roboticsContrib + hullContrib + expContrib + tripContrib;

  // Original: if a>4 r9=(a/5) / if a<5 r9=10
  const r9 = supportSum > 4 ? Math.floor(supportSum / 5) : 10;

  // Rank bonus preserved from v4.0 (not in original ranfix, but kept for gameplay balance)
  const rankBonus = RANK_BF_BONUS[rank as keyof typeof RANK_BF_BONUS] || 0;

  // Total: x8 + x9 + r9 + rank (modern addition)
  return weaponPower + shieldPower + r9 + rankBonus;
}

/**
 * Calculate enemy battle factor (total enemy power: y8 + y9 + jg)
 *
 * Original SP.FIGHT1.S ranfix routine (FIGHT1.S:483-491):
 *   Enemy contributions to jg (BF bonus):
 *     ni  = enemy cabin (pre-set from rand rolls)
 *     ns  = enemy nav
 *     nc  = enemy command center
 *     s3/s4 = enemy drive strength/condition → (s4+1)*s3/10
 *     p9/s5 = enemy hull condition/strength  → (p9+1)*s5/10
 *     s9    = enemy shield condition         → (s9+1)*15/10
 *     bw    = enemy battles won
 *     rx    = enemy random factor
 *   jg = sum/5 (if sum > 4) or 10 (if sum < 5)
 *   jg += z1*5  (z1 = player crime count adds to enemy difficulty)
 *
 * In v4.0 with NPC roster, enemy stats map to the same formula:
 *   y8 = weaponCondition * weaponStrength  (enemy weapon power)
 *   y9 = shieldCondition * shieldStrength  (enemy shield power)
 *   jg from drive + hull contributions (simplified)
 */
export function calculateEnemyBattleFactor(enemy: Enemy, crimeCount = 0): number {
  // Enemy weapon power (y8) and shield power (y9)
  const weaponPower = calculateComponentPower(enemy.weaponStrength, enemy.weaponCondition);
  const shieldPower = calculateComponentPower(enemy.shieldStrength, enemy.shieldCondition);

  // Enemy support components using same (condition+1)*strength/10 formula as ranfix
  const driveContrib = Math.floor((enemy.driveCondition + 1) * enemy.driveStrength / 10);
  const hullContrib  = Math.floor((enemy.hullCondition + 1)  * enemy.hullStrength / 10);

  const supportSum = driveContrib + hullContrib;
  let jg = supportSum > 4 ? Math.floor(supportSum / 5) : 10;

  // Original ranfix line 491: jg=jg+(z1*5) — player crime count increases enemy BF
  jg += crimeCount * 5;

  return weaponPower + shieldPower + jg;
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
  /** SP.FIGHT1.S:318 — 1/5 lucky shot fired when enemy shields deflect */
  isLuckyShot: boolean;
}

/**
 * Process one round of combat
 *
 * Original from SP.FIGHT1.S begin subroutine (lines 306-328):
 *   x8=w2*w1 (player weapon power)
 *   y8=p8*p7 (enemy weapon power)
 *   x9=p2*p1 (player shield power)
 *   y9=s8*s7 (enemy shield power)
 *   e6=(x8+r9):e9=(y9+jg)  ← battle factors added to weapon/shield power
 *   x=0:if e6>e9 x=(e6-e9)
 *   if x>0 goto big
 *   r=5:gosub rand:if x<>3 x=0:goto dbig  ← 1/5 Lucky Shot probability
 *   if r2<1 x=0:goto dbig                  ← requires robotics condition > 0
 *   a=0:if (r1<10) or (r2<1) x=0:goto dbig ← requires robotics strength >= 10
 *   a=((r1*r2)/10):a=((a+r9)/2)            ← Lucky Shot damage formula
 *
 * @param roboticsStrength  r1 (robotics strength — needed for Lucky Shot)
 * @param roboticsCondition r2 (robotics condition — needed for Lucky Shot + BC malfunction)
 * @param luckyShotRoll     Optional 1–5 roll override for deterministic testing
 */
export function processCombatRound(
  playerBF: number,
  playerWeaponStr: number,
  playerWeaponCond: number,
  playerShieldStr: number,
  playerShieldCond: number,
  hasAutoRepair: boolean,
  enemy: Enemy,
  round: number,
  roboticsStrength = 0,
  roboticsCondition = 0,
  luckyShotRoll?: number,
): CombatRound {
  const combatLog: string[] = [];

  // Calculate power levels
  const playerWeaponPower = playerWeaponStr * playerWeaponCond;  // x8
  const playerShieldPower = playerShieldStr * playerShieldCond;  // x9
  const enemyWeaponPower = enemy.weaponStrength * enemy.weaponCondition;  // y8
  const enemyShieldPower = enemy.shieldStrength * enemy.shieldCondition;  // y9
  const enemyBF = enemy.battleFactor || 0;  // jg

  // SP.FIGHT1.S:311 — e6=(x8+r9):e9=(y9+jg)  battle factors contribute to attack/defense
  const e6 = playerWeaponPower + playerBF;   // player attack power
  const e9 = enemyShieldPower + enemyBF;     // enemy defense power
  // SP.FIGHT1.S:384 — e8=(y8+jg):e7=(x9+r9)
  const e8 = enemyWeaponPower + enemyBF;     // enemy attack power
  const e7 = playerShieldPower + playerBF;   // player defense power

  // SP.FIGHT1.S:195 — hx=x8+x9+r9:kx=y8+y9+jg  (battle advantage display)
  const playerTotal = playerWeaponPower + playerShieldPower + playerBF;
  const enemyTotal  = enemyWeaponPower  + enemyShieldPower  + enemyBF;
  const battleAdvantage = playerTotal > enemyTotal ? 'PLAYER' :
                          playerTotal < enemyTotal ? 'ENEMY' : 'EVEN';

  combatLog.push(`Round #${round} - Battle Advantage: ${battleAdvantage}`);

  // ── Player attacks (SP.FIGHT1.S:306-328 begin subroutine) ──────────────────
  let playerDamage = 0;
  let playerShieldDamage = 0;
  let playerSystemDamage = 0;
  let isLuckyShot = false;

  if (e6 > e9) {
    // SP.FIGHT1.S:311 — direct hit: x=(e6-e9)
    let x = e6 - e9;
    // SP.FIGHT1.S:323 — if r2<1 y=(y/2): Battle Computer malfunction halves damage
    if (roboticsCondition < 1) {
      x = Math.floor(x / 2);
      combatLog.push('Battle Computer Malfunction! Damage halved.');
    }
    playerDamage = x;
    playerSystemDamage = playerDamage > 0 ? 1 : 0;
    combatLog.push(`Your weapons hit for ${playerDamage} damage!`);
  } else {
    // SP.FIGHT1.S:313 — r=5:gosub rand:if x<>3 x=0:goto dbig  (1/5 Lucky Shot)
    const roll = luckyShotRoll !== undefined ? luckyShotRoll : randomInt(1, 5);
    if (roll === 3 && roboticsCondition >= 1 && roboticsStrength >= 10) {
      // SP.FIGHT1.S:316 — a=((r1*r2)/10):a=((a+r9)/2):if (a>e6) and (e6>1) a=(e6/2)
      let a = (roboticsStrength * roboticsCondition) / 10;
      a = (a + playerBF) / 2;
      if (a > e6 && e6 > 1) a = e6 / 2;
      playerDamage = Math.floor(a);
      playerSystemDamage = playerDamage > 0 ? 1 : 0;
      isLuckyShot = true;
      combatLog.push('*:Lucky Shot:*');
    } else {
      combatLog.push('Enemy shields deflect your attack');
    }
  }

  // ── Enemy attacks (SP.FIGHT1.S:381-388 pirfite section) ────────────────────
  let enemyDamage = 0;
  let enemyShieldDamage = 0;
  let enemySystemDamage = 0;

  if (e8 > e7) {
    const x = e8 - e7;
    enemyDamage = x;
    enemySystemDamage = 1;
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
    isLuckyShot,
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
 * Apply system damage — random component hit
 *
 * Original SP.FIGHT1.S sfff subroutine (lines 396-436):
 *   r=7:gosub rand:x=x+1
 *   if (x mod 2)<>0 y=(y/2)   ← halve damage for odd x values (3,5,7)
 *   if x=3 goto sfa2  (Nav)
 *   if x=5 goto sfa3  (Drives)
 *   if x=7 goto sfa4  (Robotics)
 *   sfa1: Cabin → sfa2: Nav → sfa3: Drives → sfa4: Robotics → sfa5: Weapons → sfa6: Hull
 *
 * The roll selects which component to START the cascade at:
 *   roll 1,3,5,7 (even x after +1 = 2,4,6,8) → start at Cabin
 *   roll 2 (x=3, odd) → start at Nav
 *   roll 4 (x=5, odd) → start at Drives
 *   roll 6 (x=7, odd) → start at Robotics
 * If the selected component condition = 0, cascade to the next.
 *
 * @param roll  Optional 1–7 random roll for deterministic testing
 */
export function applySystemDamage(
  ship: ShipStats,
  _damage: number,
  roll?: number,
): DamageResult & { updatedShip: ShipStats } {
  const updatedShip = { ...ship };
  let componentDamaged = '';
  let conditionLost = 0;

  // SP.FIGHT1.S:397 — r=7:gosub rand:x=x+1  (x is 2-8)
  const r = roll !== undefined ? roll : randomInt(1, 7);
  const x = r + 1;

  // SP.FIGHT1.S:399-401 — random starting component based on x value
  // Start at Cabin for even x (2,4,6,8); Nav for x=3; Drives for x=5; Robotics for x=7
  type ComponentKey = 'cabin' | 'nav' | 'drives' | 'robotics' | 'weapon' | 'hull';
  let startAt: ComponentKey;
  if (x === 3) startAt = 'nav';
  else if (x === 5) startAt = 'drives';
  else if (x === 7) startAt = 'robotics';
  else startAt = 'cabin';

  // Cascade: Cabin → Nav → Drives → Robotics → Weapon → Hull (sfa1–sfa6)
  const cascade: ComponentKey[] = ['cabin', 'nav', 'drives', 'robotics', 'weapon', 'hull'];
  const startIdx = cascade.indexOf(startAt);

  for (let i = startIdx; i < cascade.length; i++) {
    const comp = cascade[i];
    if (comp === 'cabin' && updatedShip.cabinCondition > 0) {
      updatedShip.cabinCondition = Math.max(0, updatedShip.cabinCondition - 1);
      componentDamaged = 'Cabin';
      conditionLost = 1;
      break;
    } else if (comp === 'nav' && updatedShip.navigationCondition > 0) {
      updatedShip.navigationCondition = Math.max(0, updatedShip.navigationCondition - 1);
      componentDamaged = 'Navigation';
      conditionLost = 1;
      break;
    } else if (comp === 'drives' && updatedShip.driveCondition > 0) {
      updatedShip.driveCondition = Math.max(0, updatedShip.driveCondition - 1);
      componentDamaged = 'Drives';
      conditionLost = 1;
      break;
    } else if (comp === 'robotics' && updatedShip.roboticsCondition > 0) {
      updatedShip.roboticsCondition = Math.max(0, updatedShip.roboticsCondition - 1);
      componentDamaged = 'Robotics';
      conditionLost = 1;
      break;
    } else if (comp === 'weapon' && updatedShip.weaponCondition > 0) {
      updatedShip.weaponCondition = Math.max(0, updatedShip.weaponCondition - 1);
      componentDamaged = 'Weapon';
      conditionLost = 1;
      break;
    } else if (comp === 'hull' && updatedShip.hullCondition > 0) {
      updatedShip.hullCondition = Math.max(0, updatedShip.hullCondition - 1);
      componentDamaged = 'Hull';
      conditionLost = 1;
      break;
    }
  }

  return {
    shieldsReduced: 0,
    systemDamaged: componentDamaged ? { component: componentDamaged, conditionLost } : undefined,
    updatedShip,
  };
}

// ============================================================================
// SPEED / CHASE CHECK (SP.FIGHT1.S speed:/spedo:)
// ============================================================================

export interface SpeedChaseResult {
  /** True if enemy drive power exceeds player drive power */
  enemyFaster: boolean;
  /** True if enemy gets a bonus attack run this round */
  enemyChases: boolean;
  /** True if slower enemy retreats from conflict (we=1) */
  enemyRetreats: boolean;
}

/**
 * Post-round speed/chase check (SP.FIGHT1.S spedo:/spedck:)
 *
 * Original spedck (FIGHT1.S:515-518):
 *   x = d1*d2   ← player speed (drive strength × condition)
 *   y = s3*s4   ← enemy speed (drive strength × condition)
 *
 * Original spedo (FIGHT1.S:451-465):
 *   if x >= y → tied/player faster → normal next round
 *   if y > x (enemy faster):
 *     if (y9>0) and (y8>0) → guaranteed bonus run ("making another run")
 *     r=3:gosub rand:if x=1 → 1/3 chance bonus run
 *     gosp: if (y8>0) and (nc>0) → bonus run
 *     xspy: enemy retreats ("retreats from conflict"), we=1
 *
 * @param playerDriveStrength  d1
 * @param playerDriveCondition d2
 * @param enemyDriveStrength   s3
 * @param enemyDriveCondition  s4
 * @param enemyWeaponPower     y8 = p8*p7 (enemy weapon condition × strength)
 * @param enemyShieldCondition y9
 * @param roll                 Optional 1-3 random roll for testing (default: random)
 */
export function checkEnemySpeedChase(
  playerDriveStrength: number,
  playerDriveCondition: number,
  enemyDriveStrength: number,
  enemyDriveCondition: number,
  enemyWeaponPower: number,
  enemyShieldCondition: number,
  roll?: number,
): SpeedChaseResult {
  const playerSpeed = Math.max(0, playerDriveStrength * playerDriveCondition);
  const enemySpeed = Math.max(0, enemyDriveStrength * enemyDriveCondition);

  // Player tied or faster — no chase
  if (playerSpeed >= enemySpeed) {
    return { enemyFaster: false, enemyChases: false, enemyRetreats: false };
  }

  // Enemy is faster — guaranteed chase if enemy has both shields and weapons
  if (enemyShieldCondition > 0 && enemyWeaponPower > 0) {
    return { enemyFaster: true, enemyChases: true, enemyRetreats: false };
  }

  // 1/3 chance chase (r=3:gosub rand:if x=1)
  const r = roll !== undefined ? roll : randomInt(1, 3);
  if (r === 1) {
    return { enemyFaster: true, enemyChases: true, enemyRetreats: false };
  }

  // Enemy retreats from conflict (xspy: we=1)
  return { enemyFaster: true, enemyChases: false, enemyRetreats: true };
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
 * Original SP.FIGHT1.S:210-211:
 *   if i$="N" print"...Retreating..."\:x=y:goto spgo
 *   → When player chooses N (retreat), battle ends immediately.
 *
 * Player retreat is ALWAYS successful in the original. There is no probability
 * check for the player — they can always disengage by pressing N.
 *
 * Speed (drive power) only determines whether the ENEMY retreats or makes
 * another attack run on the next round (FIGHT1.S:455-465). It does not
 * affect the player's ability to retreat.
 *
 * Cloaker activates immediately when used (always succeeds).
 */
export function attemptRetreat(
  playerDrivePower: number,
  enemyDrivePower: number,
  hasCloaker: boolean
): RetreatResult {
  // Cloaking device: always succeeds (player explicitly activates it)
  if (hasCloaker) {
    return {
      success: true,
      message: 'Morton\'s Cloaker activates... you escape!',
    };
  }

  // Player retreat is always successful — original FIGHT1.S:210-211
  // Speed advantage only affects the post-round enemy behavior, not player retreat
  void playerDrivePower;
  void enemyDrivePower;
  return {
    success: true,
    message: '...Retreating...',
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
 * Original SP.FIGHT1.S:227-230:
 *   kc=(kg*1000):if kg>12 kc=10000
 *
 * Demands rise by 1000 per round (1000 at round 1, 12000 at round 12).
 * After round 12, tribute is fixed at 10000.
 * Note: round 12 demand (12000) exceeds the post-round-12 cap (10000).
 */
export function enemyDemandsTribute(
  combatRounds: number,
  playerCredits: number
): SurrenderResult {
  // Original: kc=(kg*1000):if kg>12 kc=10000
  const tribute = combatRounds > 12 ? TRIBUTE_MAX : combatRounds * TRIBUTE_BASE_MULTIPLIER;

  // Cap at player's available credits
  const actual = Math.min(tribute, playerCredits);

  return {
    accepted: true,
    tributeDemanded: actual,
    message: `Enemy demands ${actual} cr tribute!`,
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
 * Calculate credit loot from defeated enemy (boarding + safe contents)
 *
 * Original SP.FIGHT2.S:132-136:
 *   x=0:if p6>1 x=(p6/2)           — take half enemy fuel
 *   if (s8<1) and (x>0) "Boarding... x Fuel taken"
 *   if s5<1 "The pz$'s safe contained p5 cr" — take enemy credits
 *
 * When enemy comes from the NPC roster, use the creditValue field.
 * Otherwise fall back to class-based calculation.
 */
export function calculateLoot(enemy: Enemy, playerBF: number): number {
  let baseLoot = 0;
  if (enemy.class === 'SPX') baseLoot = 500;
  else if (enemy.class === 'SPY') baseLoot = 1000;
  else if (enemy.class === 'SPZ') baseLoot = 2000;
  else if (enemy.type === 'RIM_PIRATE') baseLoot = 3000;
  else if (enemy.type === 'PIRATE') baseLoot = 1000;
  else if (enemy.creditValue && enemy.creditValue > 0) baseLoot = enemy.creditValue;

  const bfBonus = Math.floor(playerBF / 10);

  return baseLoot + bfBonus;
}

// ============================================================================
// SALVAGE SYSTEM (SP.FIGHT2.S:139-193)
// ============================================================================

/**
 * Component types that can be found in wreckage salvage.
 */
export type SalvageComponent =
  | 'gold'
  | 'drive'
  | 'cabin'
  | 'lifeSupport'
  | 'weapon'        // beam intensifier (beneficial)
  | 'navigation'
  | 'robotics'
  | 'shield'
  | 'weaponDefective' // defective power unit (harmful)
  | 'nothing';

export interface SalvageResult {
  component: SalvageComponent;
  amount: number;
  description: string;
  /** True if weapon enhancement requires player confirmation (risk/reward) */
  requiresConfirmation: boolean;
  /** True if this is a defective weapon that will REDUCE weapon strength */
  isDefective: boolean;
}

/**
 * Salvage names for each component type, matching original FIGHT2.S:147-156
 *
 * sk=1/2 (pirate/patrol) names:
 *   Gold Bullion, Drive: Non-Friction Bearings, Cabin: Grav-Less Water Bed,
 *   LSS: Auto-Doc Specialist, Weapon: Beam Intensifier, Nav: Auto-True-Focus,
 *   Robotic: Lightning Battle Chip, Shield: Photonic Deflector,
 *   Weapon: Power Unit!...Defective!
 *
 * sk>=3 (rim/reptiloid) names (FIGHT2.S:173-178):
 *   Weapon: Ionic Crystal, Drive: Relay Matrix, Shield: Protecto-Fuse,
 *   Robotic: Iridium Chip, Nav: Sextant Arc, LSS: Recycle Unit
 */
const SALVAGE_NAMES_STANDARD: Record<number, { component: SalvageComponent; prefix: string }> = {
  1: { component: 'gold', prefix: 'Gold Bullion' },
  2: { component: 'drive', prefix: 'Drive: Non-Friction Bearings' },
  3: { component: 'cabin', prefix: 'Cabin: Grav-Less Water Bed' },
  4: { component: 'lifeSupport', prefix: 'LSS: Auto-Doc Specialist' },
  5: { component: 'weapon', prefix: 'Weapon: Beam Intensifier' },
  6: { component: 'navigation', prefix: 'Nav: Auto-True-Focus' },
  7: { component: 'robotics', prefix: 'Robotic: Lightning Battle Chip' },
  8: { component: 'shield', prefix: 'Shield: Photonic Deflector' },
  9: { component: 'weaponDefective', prefix: 'Weapon: Power Unit!...Defective!' },
};

const SALVAGE_NAMES_RIM: Record<number, { component: SalvageComponent; prefix: string }> = {
  1: { component: 'weapon', prefix: 'Weapon: Ionic Crystal' },
  2: { component: 'drive', prefix: 'Drive: Relay Matrix' },
  3: { component: 'shield', prefix: 'Shield: Protecto-Fuse' },
  4: { component: 'robotics', prefix: 'Robotic: Iridium Chip' },
  5: { component: 'navigation', prefix: 'Nav: Sextant Arc' },
  6: { component: 'lifeSupport', prefix: 'LSS: Recycle Unit' },
};

/**
 * Calculate salvage from defeated enemy wreckage.
 *
 * Original SP.FIGHT2.S:139-193 (scav/scavr routines):
 *
 * For sk=1 (pirates, core systems):
 *   - Amount based on 2nd char of enemy ship name (original: a$=mid$(p5$,2,1))
 *   - Roll determines component: r=(z1+4) + r=7, combined into x
 *   - x=1: gold (+a * 10,000 cr), x=2-4,6-8: component upgrades
 *   - x=5: weapon beam intensifier (requires confirmation)
 *   - x=9: defective weapon power unit (requires confirmation, reduces weapon)
 *   - x>9: nothing useful
 *
 * For sk=2 (patrol): amount fixed at 1
 *
 * For sk>=3 (rim pirates, reptiloids — scavr routine):
 *   - Different component pool (weapon, drive, shield, robotics, nav, LSS)
 *   - Amount based on enemy rank (p3) with modifier for sk=3
 *   - Roll: r=(z1+wb+7), only values 1-6 yield components, rest nothing
 *
 * @param enemyType - Type of enemy (maps to sk value)
 * @param playerTripCount - z1 (trips today), affects roll range
 * @param playerBattlesWon - wb (battles won by player)
 * @param enemyName - p5$ (ship name, 2nd char used for amount in sk=1)
 * @param enemyRank - p3 (enemy's rank/power tier for rim salvage)
 */
export function calculateSalvage(
  enemyType: Enemy['type'],
  playerTripCount: number,
  playerBattlesWon: number,
  enemyName: string,
  enemyRank: number,
): SalvageResult {
  // Map enemy type to sk value
  const sk = enemyTypeToSk(enemyType);

  if (sk >= 3) {
    return calculateSalvageRim(playerTripCount, playerBattlesWon, enemyRank, sk);
  }

  // sk=1 or sk=2: standard salvage (scav routine)
  return calculateSalvageStandard(sk, playerTripCount, enemyName);
}

function enemyTypeToSk(type: Enemy['type']): number {
  switch (type) {
    case 'PIRATE': return 1;
    case 'PATROL': return 2;
    case 'RIM_PIRATE': return 3;
    case 'REPTILOID': return 4;
    case 'BRIGAND': return 5;
    default: return 1;
  }
}

/**
 * Standard salvage for pirates/patrol (FIGHT2.S:139-165, sk=1 or sk=2)
 */
function calculateSalvageStandard(
  sk: number,
  playerTripCount: number,
  enemyName: string,
): SalvageResult {
  // Determine salvage amount
  let amount: number;
  if (sk === 2) {
    // Patrol: fixed amount of 1 (FIGHT2.S:142)
    amount = 1;
  } else {
    // Pirate: amount from 2nd char of ship name (FIGHT2.S:143)
    // Original: a$=mid$(p5$,2,1):r=(val(a$)+1):gosub rand:a=i
    const nameChar = enemyName.length >= 2 ? enemyName.charAt(1) : '1';
    const nameVal = parseInt(nameChar, 10);
    const rollRange = (isNaN(nameVal) ? 1 : nameVal) + 1;
    amount = randomInt(1, Math.max(1, rollRange));
  }

  // Determine component type
  // Original: r=(z1+4):gosub rand:x=i:r=7:gosub rand:x=(x+i)
  const roll1 = randomInt(1, Math.max(1, playerTripCount + 4));
  const roll2 = randomInt(1, 7);
  const x = roll1 + roll2;

  // x=5 or x=9 map to xk=5 (same search animation length)
  // Original: if (x=5) or (x=9) xk=5

  if (x > 9) {
    return { component: 'nothing', amount: 0, description: '...Nothing Useful', requiresConfirmation: false, isDefective: false };
  }

  const entry = SALVAGE_NAMES_STANDARD[x];
  if (!entry) {
    return { component: 'nothing', amount: 0, description: '...Nothing Useful', requiresConfirmation: false, isDefective: false };
  }

  // Gold is special: credits = amount * 10,000 (FIGHT2.S:147: g1=g1+a → a * 10,000 cr)
  if (x === 1) {
    return {
      component: 'gold',
      amount: amount * 10000,
      description: `${entry.prefix} +${amount}0,000 cr`,
      requiresConfirmation: false,
      isDefective: false,
    };
  }

  // Weapon enhancements (x=5 or x=9) require confirmation
  if (x === 5 || x === 9) {
    return {
      component: entry.component,
      amount,
      description: `${entry.prefix} +${amount}`,
      requiresConfirmation: true,
      isDefective: x === 9,
    };
  }

  // Standard component upgrade
  return {
    component: entry.component,
    amount,
    description: `${entry.prefix} +${amount}`,
    requiresConfirmation: false,
    isDefective: false,
  };
}

/**
 * Rim/Reptiloid salvage (FIGHT2.S:167-180, scavr routine)
 *
 * Original:
 *   r=(z1+wb+7):gosub rand:x=i
 *   if (x>6) → nothing useful
 *   y=p3:if sk=3 y=(p3+2):r=(y/2):gosub rand:y=i
 */
function calculateSalvageRim(
  playerTripCount: number,
  playerBattlesWon: number,
  enemyRank: number,
  sk: number,
): SalvageResult {
  const rollRange = Math.max(1, playerTripCount + playerBattlesWon + 7);
  const x = randomInt(1, rollRange);

  if (x < 1 || x > 6) {
    return { component: 'nothing', amount: 0, description: '...Nothing Useful', requiresConfirmation: false, isDefective: false };
  }

  // Amount calculation
  let baseAmount = enemyRank;
  if (sk === 3) baseAmount = enemyRank + 2;
  const amountRange = Math.max(1, Math.floor(baseAmount / 2));
  const amount = randomInt(1, amountRange);

  const entry = SALVAGE_NAMES_RIM[x];
  if (!entry) {
    return { component: 'nothing', amount: 0, description: '...Nothing Useful', requiresConfirmation: false, isDefective: false };
  }

  return {
    component: entry.component,
    amount,
    description: `${entry.prefix} +${amount}`,
    requiresConfirmation: false,
    isDefective: false,
  };
}

/**
 * Apply salvage result to ship components.
 * Returns a partial Ship update object for Prisma.
 *
 * Caps LSS at 50 strength (FIGHT2.S:186: if l1>50 l1=50)
 * Caps all components at 199 strength (FIGHT2.S:52/FIGHT1.S:71: if x>199 x=199)
 */
export function applySalvage(
  salvage: SalvageResult,
  currentShip: {
    driveStrength: number;
    cabinStrength: number;
    lifeSupportStrength: number;
    weaponStrength: number;
    navigationStrength: number;
    roboticsStrength: number;
    shieldStrength: number;
  },
): Record<string, number> {
  const MAX_STRENGTH = 199;
  const LSS_MAX = 50; // FIGHT2.S:186

  const updates: Record<string, number> = {};

  switch (salvage.component) {
    case 'drive':
      updates.driveStrength = Math.min(MAX_STRENGTH, currentShip.driveStrength + salvage.amount);
      break;
    case 'cabin':
      updates.cabinStrength = Math.min(MAX_STRENGTH, currentShip.cabinStrength + salvage.amount);
      break;
    case 'lifeSupport':
      updates.lifeSupportStrength = Math.min(LSS_MAX, currentShip.lifeSupportStrength + salvage.amount);
      break;
    case 'weapon':
      updates.weaponStrength = Math.min(MAX_STRENGTH, currentShip.weaponStrength + salvage.amount);
      break;
    case 'weaponDefective':
      updates.weaponStrength = Math.max(0, currentShip.weaponStrength - salvage.amount);
      break;
    case 'navigation':
      updates.navigationStrength = Math.min(MAX_STRENGTH, currentShip.navigationStrength + salvage.amount);
      break;
    case 'robotics':
      updates.roboticsStrength = Math.min(MAX_STRENGTH, currentShip.roboticsStrength + salvage.amount);
      break;
    case 'shield':
      updates.shieldStrength = Math.min(MAX_STRENGTH, currentShip.shieldStrength + salvage.amount);
      break;
    // 'gold' and 'nothing' don't affect ship components
  }

  return updates;
}

// ============================================================================
// TRIBUTE / SURRENDER SYSTEM (SP.FIGHT1.S:222-271)
// ============================================================================

/**
 * The 5 surrender paths from the original, determined by mission type (kk) and
 * encounter context (sk).
 */
export type TributePath =
  | 'ALLIANCE_RAID'     // kk=4: plans & fuel confiscated (pb=6)
  | 'SMUGGLING'         // kk=5: cargo confiscated, criminal record (pb=5)
  | 'RIM_CONFISCATION'  // sk=3 & pz=21: cargo confiscated by rim pirate (pb=7)
  | 'CREDIT_TRIBUTE'    // Default: pay credits (pb=7)
  | 'INSUFFICIENT_CREDITS'; // ckc: not enough credits, take cargo/pods/fuel

export interface TributeResult {
  path: TributePath;
  tributeCredits: number;
  /** Credits lost (may differ from tribute if insufficient) */
  creditsLost: number;
  /** Fuel confiscated */
  fuelLost: number;
  /** Cargo pods confiscated */
  cargoLost: boolean;
  /** Storage pods lost (from ckc fallback) */
  storagePodsTaken: number;
  /** Player gets criminal record (smuggling caught) */
  criminalRecord: boolean;
  /** Message describing what happened */
  message: string;
}

/**
 * Calculate full tribute/surrender outcome based on mission context.
 *
 * Original SP.FIGHT1.S:222-271 has 5 distinct paths:
 *
 * 1. ctk4 (kk=4, alliance raid): Plans & fuel confiscated.
 *    pb=6. Half fuel taken by enemy. (FIGHT1.S:243-246)
 *
 * 2. ctk5 (kk=5, smuggling): Cargo confiscated, criminal record.
 *    pb=5. na$ gets "J%" prefix (jailbird). z1 incremented. (FIGHT1.S:247-253)
 *
 * 3. ctk5 (sk=3, pz=21, rim pirate #21): Cargo confiscated.
 *    pb=7. No criminal record. (FIGHT1.S:249)
 *
 * 4. ctk (default): Pay credit tribute. Amount = kc=(kg*1000), capped at 10000 after round 12.
 *    Modifiers: smuggling halves (kc/2), alliance raids or high pirates double (kc*2).
 *    pb=7. (FIGHT1.S:254-262)
 *
 * 5. ckc (insufficient credits fallback): Enemy takes cargo, then pods, then fuel.
 *    (FIGHT1.S:264-267)
 *
 * @param missionType - kk value (1=cargo, 2=patrol, 4=alliance raid, 5=smuggling, etc.)
 * @param enemyType - Maps to sk
 * @param combatRounds - kg (current round number)
 * @param playerCredits - Total credits available
 * @param playerFuel - Current fuel
 * @param playerCargoPods - q1 (cargo pods carried)
 * @param playerCargoManifest - q2$ (cargo description)
 * @param playerStoragePods - s1 (storage pods on ship)
 * @param enemyRosterId - pz (NPC roster index, 21 = special rim pirate)
 */
export function calculateTribute(
  missionType: number,
  enemyType: Enemy['type'],
  combatRounds: number,
  playerCredits: number,
  playerFuel: number,
  playerCargoPods: number,
  playerCargoManifest: string | null,
  playerStoragePods: number,
  enemyRosterId?: number,
): TributeResult {
  const sk = enemyTypeToSk(enemyType);

  // Path 1: Alliance raid (kk=4) — plans & fuel confiscated
  // SP.FIGHT1.S:245 — if f1<2 f1=2 before taking half (enemy always gets at least 1 fuel)
  if (missionType === 4) {
    const effectiveFuel = playerFuel < 2 ? 2 : playerFuel;  // original: if f1<2 f1=2
    const fuelTaken = Math.floor(effectiveFuel / 2);
    return {
      path: 'ALLIANCE_RAID',
      tributeCredits: 0,
      creditsLost: 0,
      fuelLost: fuelTaken,
      cargoLost: true,
      storagePodsTaken: 0,
      criminalRecord: false,
      message: `Plans & Fuel confiscated! ${fuelTaken} fuel taken.`,
    };
  }

  // Path 2: Smuggling caught (kk=5) — cargo confiscated, criminal record
  if (missionType === 5) {
    return {
      path: 'SMUGGLING',
      tributeCredits: 0,
      creditsLost: 0,
      fuelLost: 0,
      cargoLost: true,
      storagePodsTaken: 0,
      criminalRecord: true,
      message: `Cargo of ${playerCargoManifest || 'contraband'} confiscated! Criminal record added.`,
    };
  }

  // Path 3: Rim pirate #21 confiscation (sk=3, pz=21)
  if (sk === 3 && enemyRosterId === 21 && playerCargoPods > 0) {
    return {
      path: 'RIM_CONFISCATION',
      tributeCredits: 0,
      creditsLost: 0,
      fuelLost: 0,
      cargoLost: true,
      storagePodsTaken: 0,
      criminalRecord: false,
      message: `Cargo of ${playerCargoManifest || 'goods'} confiscated by Rim Pirate!`,
    };
  }

  // Path 4/5: Credit tribute (default)
  // Original: kc=(kg*1000):if kg>12 kc=10000
  let kc = combatRounds > 12 ? TRIBUTE_MAX : combatRounds * TRIBUTE_BASE_MULTIPLIER;

  // Modifiers from original FIGHT1.S:227-228
  // Original line 227: if sk=5 kc=(kc/2) — Brigand encounter halves tribute
  if (sk === 5) kc = Math.floor(kc / 2);
  // Original line 228: if (sk=4) or (pz>10) kc=kc*2 — Reptiloid (sk=4) or high-rank pirate (pz>10) doubles
  if (sk === 4 || (enemyRosterId !== undefined && enemyRosterId > 10)) kc = kc * 2;

  // Cap at TRIBUTE_MAX
  if (kc > TRIBUTE_MAX) kc = TRIBUTE_MAX;

  // Can player afford it?
  if (playerCredits >= kc) {
    // Path 4: Pay credits
    return {
      path: 'CREDIT_TRIBUTE',
      tributeCredits: kc,
      creditsLost: kc,
      fuelLost: 0,
      cargoLost: false,
      storagePodsTaken: 0,
      criminalRecord: false,
      message: `You pay ${kc} cr tribute.`,
    };
  }

  // Path 5: Insufficient credits (ckc) — take cargo, then pods, then fuel
  // Original FIGHT1.S:264-267
  if (playerCargoPods > 0) {
    return {
      path: 'INSUFFICIENT_CREDITS',
      tributeCredits: kc,
      creditsLost: 0,
      fuelLost: 0,
      cargoLost: true,
      storagePodsTaken: 0,
      criminalRecord: false,
      message: `Not enough credits! Enemy takes your ${playerCargoManifest || 'cargo'}.`,
    };
  }

  if (playerStoragePods > 0) {
    return {
      path: 'INSUFFICIENT_CREDITS',
      tributeCredits: kc,
      creditsLost: 0,
      fuelLost: 0,
      cargoLost: false,
      storagePodsTaken: playerStoragePods,
      criminalRecord: false,
      message: `Not enough credits! Enemy takes ${playerStoragePods} storage pods.`,
    };
  }

  // Last resort: take fuel
  const fuelTaken = playerFuel > 0 ? playerFuel : 0;
  return {
    path: 'INSUFFICIENT_CREDITS',
    tributeCredits: kc,
    creditsLost: 0,
    fuelLost: fuelTaken,
    cargoLost: false,
    storagePodsTaken: 0,
    criminalRecord: false,
    message: `Not enough credits! Enemy drains ${fuelTaken} fuel.`,
  };
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

// ============================================================================
// POST-BATTLE PROCESSING (SP.FIGHT2.S:41-75)
// ============================================================================

export interface AutoRepairResult {
  /** Map of condition field names to new condition values */
  updates: Record<string, number>;
  /** Human-readable repair messages e.g. "Drives: 5→6" */
  messages: string[];
}

/**
 * Apply Auto-Repair module post-battle (SP.FIGHT2.S:41-64)
 *
 * Original: if right$(h1$,1)="!" → fixr routine for each component
 *   fixr: if strength>0 and condition<9 → condition+1 (printing the repair)
 *         also handles total-damage reconstruction at -1 strength, -500 fuel
 *
 * NOTE: This function handles the +1 condition path only. The reconstruction
 * dialog (totally damaged component) is handled in the screen handler.
 *
 * @param ship  Current ship stats (conditions may already include per-round damage)
 * @returns     Condition updates and display messages
 */
export function applyAutoRepair(ship: Pick<ShipStats,
  'driveStrength' | 'driveCondition' |
  'cabinStrength' | 'cabinCondition' |
  'lifeSupportStrength' | 'lifeSupportCondition' |
  'weaponStrength' | 'weaponCondition' |
  'navigationStrength' | 'navigationCondition' |
  'roboticsStrength' | 'roboticsCondition' |
  'shieldStrength' | 'shieldCondition'
>): AutoRepairResult {
  const updates: Record<string, number> = {};
  const messages: string[] = [];
  const comps = [
    { str: 'driveStrength',      cond: 'driveCondition',      label: 'Drives' },
    { str: 'cabinStrength',      cond: 'cabinCondition',      label: 'Cabin' },
    { str: 'lifeSupportStrength',cond: 'lifeSupportCondition',label: 'Life Support' },
    { str: 'weaponStrength',     cond: 'weaponCondition',     label: 'Weapons' },
    { str: 'navigationStrength', cond: 'navigationCondition', label: 'Nav' },
    { str: 'roboticsStrength',   cond: 'roboticsCondition',   label: 'Robotics' },
    { str: 'shieldStrength',     cond: 'shieldCondition',     label: 'Shields' },
  ] as const;
  for (const c of comps) {
    const strength = (ship as Record<string, number>)[c.str];
    const cond = (ship as Record<string, number>)[c.cond];
    if (strength > 0 && cond < 9) {
      updates[c.cond] = cond + 1;
      messages.push(`${c.label}: ${cond}→${cond + 1}`);
    }
  }
  return { updates, messages };
}

export interface ShieldRechargeResult {
  /** New shield condition (may be unchanged) */
  shieldCondition: number;
  /** Remaining fuel after recharge */
  fuel: number;
}

/**
 * Apply Shield Recharger module post-battle (SP.FIGHT2.S:66-75)
 *
 * Original: if right$(h1$,1)="*"
 *   loop: f1-=p1, p2+=1  while p2<9 and f1>=p1
 *
 * Costs shieldStrength fuel per +1 shieldCondition.
 *
 * @param shieldStrength  p1 — fuel cost per shield unit
 * @param shieldCondition p2 — current shield condition
 * @param fuel            f1 — current fuel
 * @returns               New shield condition and remaining fuel
 */
export function applyShieldRecharge(
  shieldStrength: number,
  shieldCondition: number,
  fuel: number,
): ShieldRechargeResult {
  let p2 = shieldCondition;
  let f1 = fuel;
  if (shieldStrength > 0) {
    while (p2 < 9 && f1 >= shieldStrength) {
      f1 -= shieldStrength;
      p2 += 1;
    }
  }
  return { shieldCondition: p2, fuel: f1 };
}

// ============================================================================
// DEFEAT CONSEQUENCES (SP.FIGHT2.S pirwin: lines 195-220)
// ============================================================================

export interface DefeatConsequences {
  /** Cargo pods lost (q1=0 if enemy boards and takes cargo) */
  cargoLost: boolean;
  /** Storage pods lost (s1 reduced by half) */
  storagePodsLost: number;
  /** Fuel drained (f1 reduced by half) */
  fuelLost: number;
  /** Message describing what was taken */
  message: string;
}

/**
 * Calculate what the enemy takes when the player loses (SP.FIGHT2.S pirwin:195-220).
 *
 * Original pirwin path (player ship defeated):
 *   if p2>0 goto pirwin4  ← skip boarding if player still has shields (already at 0 here)
 *   if q1>0: enemy takes all cargo pods ("The pz$s take q1 pods of q2$")
 *   elif s1>=2: enemy takes half storage pods  a=(s1/2)
 *   else: enemy drains half fuel  x=(f1/2)
 *
 * Note: this is called when player shields are gone (p2<1 in original),
 * which is the condition under which boarding occurs.
 *
 * @param playerCargoPods    q1 — cargo pods being carried
 * @param playerCargoManifest q2$ — cargo description
 * @param playerStoragePods  s1 — installed storage pods
 * @param playerFuel         f1 — current fuel
 * @param enemyTypeName      pz$ — enemy type name for message
 */
export function calculateDefeatConsequences(
  playerCargoPods: number,
  playerCargoManifest: string | null,
  playerStoragePods: number,
  playerFuel: number,
  enemyTypeName: string,
): DefeatConsequences {
  // Priority 1: cargo pods (q1 > 0)
  if (playerCargoPods > 0) {
    return {
      cargoLost: true,
      storagePodsLost: 0,
      fuelLost: 0,
      message: `The ${enemyTypeName}s take ${playerCargoPods} pods of ${playerCargoManifest || 'cargo'}`,
    };
  }

  // Priority 2: storage pods (s1 >= 2)
  if (playerStoragePods >= 2) {
    const taken = Math.floor(playerStoragePods / 2);
    return {
      cargoLost: false,
      storagePodsLost: taken,
      fuelLost: 0,
      message: `The ${enemyTypeName}s take ${taken} storage pods`,
    };
  }

  // Priority 3: half fuel
  const fuelDrained = playerFuel >= 2 ? Math.floor(playerFuel / 2) : 0;
  return {
    cargoLost: false,
    storagePodsLost: 0,
    fuelLost: fuelDrained,
    message: `The ${enemyTypeName}s drain ${fuelDrained} fuel from your tanks`,
  };
}
