/**
 * SpacerQuest v4.0 - Combat State Persistence
 *
 * Handles combat state storage for disconnect mitigation.
 * When a player disconnects mid-combat (browser close, network loss),
 * the combat is resolved server-side using existing formulas.
 *
 * This is the modern equivalent of the original carrier-loss penalty
 * (SP.MAL.S:456-457) but without the harsh punishment. The natural
 * combat outcome serves as sufficient consequence.
 *
 * Architecture is similar to TravelState model — persists in-progress
 * state in the database so it survives disconnections.
 */

import { randomInt, checkProbability } from '../utils.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CombatParticipant {
  weaponPower: number;
  shieldPower: number;
  drivePower: number;
  battleFactor: number;
  hullCondition?: number;
}

export interface CombatState {
  characterId: string;
  player: CombatParticipant;
  enemy: CombatParticipant;
  round: number;
  active: boolean;
  createdAt: Date;
}

export interface CombatResolution {
  resolved: boolean;
  outcome: 'VICTORY' | 'DEFEAT' | 'DRAW';
  roundsPlayed: number;
  message: string;
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Create a new combat state for persistence
 */
export function createCombatState(
  characterId: string,
  player: CombatParticipant,
  enemy: CombatParticipant,
  round: number
): CombatState {
  return {
    characterId,
    player,
    enemy,
    round,
    active: true,
    createdAt: new Date(),
  };
}

/**
 * Check if combat state is currently active
 */
export function isCombatActive(state: CombatState | null): boolean {
  if (!state) return false;
  return state.active;
}

// ============================================================================
// DISCONNECT RESOLUTION
// ============================================================================

/**
 * Resolve combat when player disconnects
 *
 * Uses simplified combat resolution based on battle factors with randomness.
 * The player's combat continues server-side — they don't get to "dodge"
 * an unfavorable outcome by closing the browser.
 *
 * This uses a simplified simulation of the original SP.FIGHT1.S combat loop:
 * - Compare battle factors with variance
 * - Higher BF wins more often but not always
 * - Runs remaining rounds up to max of 12 (original qq limit)
 */
export function resolveCombatOnDisconnect(state: CombatState): CombatResolution {
  if (!state.active) {
    return {
      resolved: false,
      outcome: 'DRAW',
      roundsPlayed: state.round,
      message: 'Combat was already resolved.',
    };
  }

  const maxRounds = 12; // Original qq limit
  let playerDamageTotal = 0;
  let enemyDamageTotal = 0;
  let currentRound = state.round;

  // Simulate remaining combat rounds
  while (currentRound <= maxRounds) {
    // Player attacks: weapon power vs enemy shield
    const playerAttack = state.player.weaponPower * (0.8 + Math.random() * 0.4);
    const enemyDefense = state.enemy.shieldPower * (0.8 + Math.random() * 0.4);
    if (playerAttack > enemyDefense) {
      enemyDamageTotal += Math.floor(playerAttack - enemyDefense);
    }

    // Enemy attacks: weapon power vs player shield
    const enemyAttack = state.enemy.weaponPower * (0.8 + Math.random() * 0.4);
    const playerDefense = state.player.shieldPower * (0.8 + Math.random() * 0.4);
    if (enemyAttack > playerDefense) {
      playerDamageTotal += Math.floor(enemyAttack - playerDefense);
    }

    currentRound++;

    // Check for decisive victory (hull destroyed)
    const enemyHull = (state.enemy.hullCondition || 5) * 100;
    if (enemyDamageTotal >= enemyHull) break;
    const playerHull = 500; // Reasonable default
    if (playerDamageTotal >= playerHull) break;
  }

  // Determine outcome
  let outcome: 'VICTORY' | 'DEFEAT' | 'DRAW';
  if (enemyDamageTotal > playerDamageTotal * 1.2) {
    outcome = 'VICTORY';
  } else if (playerDamageTotal > enemyDamageTotal * 1.2) {
    outcome = 'DEFEAT';
  } else {
    outcome = 'DRAW';
  }

  // Mark combat as resolved
  state.active = false;

  const messages: Record<string, string> = {
    VICTORY: 'Combat resolved: Your ship prevailed while you were disconnected.',
    DEFEAT: 'Combat resolved: Your ship was defeated while you were disconnected.',
    DRAW: 'Combat resolved: The battle ended in a draw while you were disconnected.',
  };

  return {
    resolved: true,
    outcome,
    roundsPlayed: currentRound - 1,
    message: messages[outcome],
  };
}
