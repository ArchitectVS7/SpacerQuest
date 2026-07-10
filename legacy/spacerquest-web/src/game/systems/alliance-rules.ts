/**
 * SpacerQuest v4.0 - Alliance Join/Switch Rules
 *
 * Enforces the original alliance rules from SP.BAR.S:
 * - Lieutenant+ rank required to join
 * - Switching costs all credits + port loss
 * - 1/3 cap per alliance (with minimum member threshold)
 *
 * Original source: SP.BAR.S:98-167
 */

import { Rank, AllianceType } from '@prisma/client';
import { ALLIANCE_SIZE_DIVISOR, ALLIANCE_MIN_MEMBERS } from '../constants.js';
import { getRankIndex } from '../utils.js';

// ============================================================================
// ALLIANCE DEFINITIONS
// ============================================================================

export const ALLIANCE_INFO = [
  { symbol: '+', name: 'The Astro League', enum: AllianceType.ASTRO_LEAGUE },
  { symbol: '@', name: 'The Space Dragons', enum: AllianceType.SPACE_DRAGONS },
  { symbol: '&', name: 'The Warlord Confed', enum: AllianceType.WARLORD_CONFED },
  { symbol: '^', name: 'The Rebel Alliance', enum: AllianceType.REBEL_ALLIANCE },
];

// ============================================================================
// JOIN VALIDATION
// ============================================================================

export interface JoinResult {
  allowed: boolean;
  hasExistingAlliance: boolean;
  reason?: string;
}

/**
 * Check if a player can join an alliance
 *
 * Original SP.BAR.S:99: if pp$="" print "Only Lieutenants and higher may join"
 * Original SP.BAR.S:166: if (a>(np/3)) and (a>4) k$="That Alliance is full"
 *
 * @param rank Player's current rank
 * @param currentAlliance Player's current alliance (NONE if not in one)
 * @param totalPlayers Total number of players in the game
 * @param allianceMemberCount Number of members in the target alliance
 */
export function canJoinAlliance(
  rank: Rank,
  currentAlliance: AllianceType,
  totalPlayers: number,
  allianceMemberCount: number
): JoinResult {
  const hasExistingAlliance = currentAlliance !== AllianceType.NONE;

  // Check rank — Lieutenant is the minimum rank (pp$="" = no rank = pre-Lieutenant)
  // In v4.0, LIEUTENANT is the starting rank, so all players qualify
  const rankIdx = getRankIndex(rank);
  if (rankIdx < 0) {
    return { allowed: false, hasExistingAlliance, reason: 'Only Lieutenants and higher may join an alliance' };
  }

  // Check 1/3 cap
  if (isAllianceFull(totalPlayers, allianceMemberCount)) {
    return { allowed: false, hasExistingAlliance, reason: 'That Alliance is full...try another' };
  }

  return { allowed: true, hasExistingAlliance };
}

// ============================================================================
// SWITCH COST
// ============================================================================

export interface SwitchCost {
  creditsLost: number;
  losesPort: boolean;
}

/**
 * Calculate the cost of switching alliances
 *
 * Original SP.BAR.S:110-116:
 *   "It will cost you all your credits to switch alliances"
 *   g1=0:g2=0
 *   Port ownership also lost (o1=0:ap$="")
 */
export function calculateSwitchCost(
  creditsHigh: number,
  creditsLow: number,
  ownsPort: boolean = false
): SwitchCost {
  return {
    creditsLost: creditsHigh * 10000 + creditsLow,
    losesPort: ownsPort,
  };
}

// ============================================================================
// ALLIANCE SIZE CAP
// ============================================================================

/**
 * Check if an alliance is full
 *
 * Original SP.BAR.S:166:
 *   if (a>(np/3)) and (a>4) k$="That Alliance is full...try another"
 *
 * Both conditions must be true:
 * 1. Members exceed 1/3 of total players
 * 2. Members exceed the minimum threshold (4)
 */
export function isAllianceFull(
  totalPlayers: number,
  currentMembers: number
): boolean {
  const maxByRatio = Math.floor(totalPlayers / ALLIANCE_SIZE_DIVISOR);
  return currentMembers > maxByRatio && currentMembers > ALLIANCE_MIN_MEMBERS;
}
