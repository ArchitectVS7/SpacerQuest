/**
 * SpacerQuest v4.0 - Bot Combat Logic
 *
 * Decides whether to fight, retreat, or surrender, and runs combat loops.
 */

import { Character, Ship, BattleResult } from '@prisma/client';
import { BotProfile, BotAction, RngFunction } from './types.js';
import {
  Enemy,
  ShipStats,
  calculateBattleFactor,
  calculateEnemyBattleFactor,
  processCombatRound,
  applyShieldDamage,
  applySystemDamage,
  attemptRetreat,
  enemyDemandsTribute,
  recordBattle,
  calculateLoot,
  isNpcFriendly,
} from '../game/systems/combat.js';
import { getTotalCredits, addCredits, subtractCredits } from '../game/utils.js';
import { prisma } from '../db/prisma.js';

const MAX_COMBAT_ROUNDS = 20;

export interface CombatOutcome {
  result: 'VICTORY' | 'DEFEAT' | 'RETREAT' | 'SURRENDER' | 'FRIENDLY';
  rounds: number;
  creditsEarned: number;
  creditsLost: number;
  actions: BotAction[];
  event?: string;
}

/**
 * Resolve an encounter for a bot. Returns the outcome.
 */
export async function resolveBotCombat(
  character: Character & { ship: Ship },
  profile: BotProfile,
  enemy: Enemy,
  rng: RngFunction = Math.random,
): Promise<CombatOutcome> {
  const ship = character.ship;

  // Check friendly (same alliance)
  if (isNpcFriendly(enemy, character.allianceSymbol)) {
    return {
      result: 'FRIENDLY',
      rounds: 0,
      creditsEarned: 0,
      creditsLost: 0,
      actions: [],
      event: `${character.name} hailed friendly ${enemy.commander}`,
    };
  }

  const shipStats: ShipStats = {
    weaponStrength: ship.weaponStrength,
    weaponCondition: ship.weaponCondition,
    shieldStrength: ship.shieldStrength,
    shieldCondition: ship.shieldCondition,
    cabinStrength: ship.cabinStrength,
    cabinCondition: ship.cabinCondition,
    roboticsStrength: ship.roboticsStrength,
    roboticsCondition: ship.roboticsCondition,
    lifeSupportStrength: ship.lifeSupportStrength,
    lifeSupportCondition: ship.lifeSupportCondition,
    navigationStrength: ship.navigationStrength,
    navigationCondition: ship.navigationCondition,
    driveStrength: ship.driveStrength,
    driveCondition: ship.driveCondition,
    hasAutoRepair: ship.hasAutoRepair,
  };

  const playerBF = calculateBattleFactor(shipStats, character.rank, character.battlesWon);
  const enemyBF = calculateEnemyBattleFactor(enemy);
  enemy.battleFactor = enemyBF;

  const bfRatio = enemyBF > 0 ? playerBF / enemyBF : 10;

  // Decision: fight or flee?
  if (bfRatio < profile.combatRetreatThreshold && profile.aggression < 0.8) {
    // Try to retreat
    const retreatResult = attemptRetreat(
      (ship.driveStrength + (ship.hasTransWarpDrive ? 10 : 0)) * ship.driveCondition,
      enemy.driveStrength * enemy.driveCondition,
      ship.hasCloaker,
    );

    if (retreatResult.success) {
      await recordBattle(character.id, enemy, 'RETREAT' as BattleResult, 0, playerBF, 0, {});
      return {
        result: 'RETREAT',
        rounds: 0,
        creditsEarned: 0,
        creditsLost: 0,
        actions: [{ type: 'RETREAT', detail: `Retreated from ${enemy.commander}` }],
      };
    }
    // Retreat failed — must fight
  }

  // Fight loop
  let currentShipStats = { ...shipStats };
  let currentEnemy = { ...enemy };
  let totalCreditsEarned = 0;
  let totalCreditsLost = 0;
  const actions: BotAction[] = [];
  let round = 0;

  for (round = 1; round <= MAX_COMBAT_ROUNDS; round++) {
    const combatResult = processCombatRound(
      playerBF,
      currentShipStats.weaponStrength,
      currentShipStats.weaponCondition,
      currentShipStats.shieldStrength,
      currentShipStats.shieldCondition,
      ship.hasAutoRepair,
      currentEnemy,
      round,
    );

    // Apply damage to enemy shields
    if (combatResult.playerShieldDamage > 0) {
      const shieldResult = applyShieldDamage(currentEnemy.shieldCondition, combatResult.playerShieldDamage);
      currentEnemy.shieldCondition = shieldResult.newCondition;
    }

    // Apply system damage to enemy
    if (combatResult.playerSystemDamage > 0) {
      currentEnemy.hullCondition = Math.max(0, currentEnemy.hullCondition - 1);
    }

    // Apply damage to player shields
    if (combatResult.enemyShieldDamage > 0) {
      const shieldResult = applyShieldDamage(currentShipStats.shieldCondition, combatResult.enemyShieldDamage);
      currentShipStats.shieldCondition = shieldResult.newCondition;
    }

    // Apply system damage to player
    if (combatResult.enemySystemDamage > 0) {
      const dmgResult = applySystemDamage(currentShipStats, combatResult.enemySystemDamage);
      currentShipStats = dmgResult.updatedShip;
    }

    // Apply auto-repairs
    if (combatResult.playerRepairs > 0) {
      if (currentShipStats.weaponCondition > 0) currentShipStats.weaponCondition = Math.min(9, currentShipStats.weaponCondition + combatResult.playerRepairs);
      if (currentShipStats.shieldCondition > 0) currentShipStats.shieldCondition = Math.min(9, currentShipStats.shieldCondition + combatResult.playerRepairs);
      if (currentShipStats.driveCondition > 0) currentShipStats.driveCondition = Math.min(9, currentShipStats.driveCondition + combatResult.playerRepairs);
      if (currentShipStats.cabinCondition > 0) currentShipStats.cabinCondition = Math.min(9, currentShipStats.cabinCondition + combatResult.playerRepairs);
      if (currentShipStats.lifeSupportCondition > 0) currentShipStats.lifeSupportCondition = Math.min(9, currentShipStats.lifeSupportCondition + combatResult.playerRepairs);
      if (currentShipStats.navigationCondition > 0) currentShipStats.navigationCondition = Math.min(9, currentShipStats.navigationCondition + combatResult.playerRepairs);
      if (currentShipStats.roboticsCondition > 0) currentShipStats.roboticsCondition = Math.min(9, currentShipStats.roboticsCondition + combatResult.playerRepairs);
    }

    // Check for enemy defeat (hull condition 0)
    if (currentEnemy.hullCondition <= 0) {
      const loot = calculateLoot(enemy, playerBF);
      totalCreditsEarned = loot;

      // Apply loot
      const newCredits = addCredits(character.creditsHigh, character.creditsLow, loot);
      await prisma.character.update({
        where: { id: character.id },
        data: {
          creditsHigh: newCredits.high,
          creditsLow: newCredits.low,
          battlesWon: { increment: 1 },
          score: { increment: 5 },
        },
      });

      // Save ship damage
      await persistShipDamage(ship.id, currentShipStats);

      await recordBattle(character.id, enemy, 'VICTORY' as BattleResult, round, playerBF, loot, {});
      actions.push({ type: 'FIGHT', detail: `Defeated ${enemy.commander} in ${round} rounds (+${loot} cr)`, creditsEarned: loot });

      return {
        result: 'VICTORY',
        rounds: round,
        creditsEarned: totalCreditsEarned,
        creditsLost: 0,
        actions,
        event: `${character.name} defeated ${enemy.commander}`,
      };
    }

    // Check for bot defeat (critical condition — avg component condition < 2)
    const avgCondition = (
      currentShipStats.weaponCondition + currentShipStats.shieldCondition +
      currentShipStats.driveCondition + currentShipStats.cabinCondition +
      currentShipStats.lifeSupportCondition + currentShipStats.navigationCondition +
      currentShipStats.roboticsCondition
    ) / 7;

    if (avgCondition < 2) {
      // Surrender
      const credits = getTotalCredits(character.creditsHigh, character.creditsLow);
      const tribute = enemyDemandsTribute(round, credits);
      totalCreditsLost = tribute.tributeDemanded;

      const deducted = subtractCredits(character.creditsHigh, character.creditsLow, totalCreditsLost);
      await prisma.character.update({
        where: { id: character.id },
        data: {
          creditsHigh: deducted.high,
          creditsLow: deducted.low,
          battlesLost: { increment: 1 },
        },
      });

      await persistShipDamage(ship.id, currentShipStats);
      await recordBattle(character.id, enemy, 'SURRENDER' as BattleResult, round, playerBF, 0, {});
      actions.push({ type: 'SURRENDER', detail: `Surrendered to ${enemy.commander} (-${totalCreditsLost} cr)`, creditsSpent: totalCreditsLost });

      return {
        result: 'SURRENDER',
        rounds: round,
        creditsEarned: 0,
        creditsLost: totalCreditsLost,
        actions,
      };
    }

    // Mid-combat retreat check for cautious bots
    if (round > 3 && profile.caution > 0.7 && combatResult.battleAdvantage === 'ENEMY') {
      const retreatResult = attemptRetreat(
        (currentShipStats.driveStrength + (ship.hasTransWarpDrive ? 10 : 0)) * currentShipStats.driveCondition,
        currentEnemy.driveStrength * currentEnemy.driveCondition,
        ship.hasCloaker,
      );
      if (retreatResult.success) {
        await persistShipDamage(ship.id, currentShipStats);
        await recordBattle(character.id, enemy, 'RETREAT' as BattleResult, round, playerBF, 0, {});
        actions.push({ type: 'RETREAT', detail: `Retreated from ${enemy.commander} after ${round} rounds` });
        return {
          result: 'RETREAT',
          rounds: round,
          creditsEarned: 0,
          creditsLost: 0,
          actions,
        };
      }
    }
  }

  // Max rounds reached — draw counts as retreat
  await persistShipDamage(ship.id, currentShipStats);
  await recordBattle(character.id, enemy, 'RETREAT' as BattleResult, round, playerBF, 0, {});
  actions.push({ type: 'RETREAT', detail: `Disengaged from ${enemy.commander} after ${MAX_COMBAT_ROUNDS} rounds` });

  return {
    result: 'RETREAT',
    rounds: MAX_COMBAT_ROUNDS,
    creditsEarned: 0,
    creditsLost: 0,
    actions,
  };
}

async function persistShipDamage(shipId: string, stats: ShipStats): Promise<void> {
  await prisma.ship.update({
    where: { id: shipId },
    data: {
      weaponCondition: stats.weaponCondition,
      shieldCondition: stats.shieldCondition,
      driveCondition: stats.driveCondition,
      cabinCondition: stats.cabinCondition,
      lifeSupportCondition: stats.lifeSupportCondition,
      navigationCondition: stats.navigationCondition,
      roboticsCondition: stats.roboticsCondition,
    },
  });
}
