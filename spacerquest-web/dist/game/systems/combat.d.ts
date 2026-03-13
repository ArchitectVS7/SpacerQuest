/**
 * SpacerQuest v4.0 - Combat System
 *
 * Implements battle mechanics from original SP.FIGHT1.S
 * All formulas preserved exactly from the original
 */
import { BattleResult, Rank } from '@prisma/client';
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
export declare function generateEncounter(currentSystem: number, missionType: number, playerPower: number): Enemy | null;
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
export declare function calculateBattleFactor(ship: ShipStats, rank: Rank, battlesWon: number): number;
/**
 * Calculate enemy battle factor
 */
export declare function calculateEnemyBattleFactor(enemy: Enemy): number;
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
export declare function processCombatRound(playerBF: number, playerWeaponStr: number, playerWeaponCond: number, playerShieldStr: number, playerShieldCond: number, enemy: Enemy, round: number): CombatRound;
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
export declare function applyShieldDamage(currentCondition: number, damage: number): {
    newCondition: number;
    reduced: number;
};
/**
 * Apply system damage (random component hit)
 *
 * Original from SP.FIGHT1.S - damage can hit:
 * Cabin, Nav, Drives, Robotics, Weapons, Hull
 */
export declare function applySystemDamage(ship: ShipStats, damage: number): DamageResult & {
    updatedShip: ShipStats;
};
export interface RetreatResult {
    success: boolean;
    message: string;
}
/**
 * Attempt to retreat from combat
 *
 * Original: Check if faster ship, then retreat chance
 */
export declare function attemptRetreat(playerDrivePower: number, enemyDrivePower: number, hasCloaker: boolean): RetreatResult;
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
export declare function enemyDemandsTribute(combatRounds: number, playerCredits: number): SurrenderResult;
/**
 * Record battle result in database
 */
export declare function recordBattle(characterId: string, enemy: Enemy, result: BattleResult, rounds: number, playerBF: number, lootCredits: number, damageTaken: Record<string, number>): Promise<void>;
/**
 * Calculate loot from defeated enemy
 *
 * Original from SP.FIGHT1.S:
 *   p5=p5+10000 (for big wins)
 *   g2=g2+p5
 */
export declare function calculateLoot(enemy: Enemy, playerBF: number): number;
//# sourceMappingURL=combat.d.ts.map