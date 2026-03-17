/**
 * SpacerQuest v4.0 - Alliance Bulletin Board System
 *
 * Alliance-specific bulletin boards from original SP.TOP.S:175-239
 * Each alliance has its own board, restricted to members only.
 *
 * Operations:
 * - (R)eread - View existing messages
 * - (W)rite msg - Post a message (79 char max, auto-prepended with date + name)
 * - (K)ill msgs - Wipe all messages (board reset)
 * - (Q)uit - Exit
 */

import { AllianceType } from '@prisma/client';
import { getDateString } from '../utils.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum message length (from original SP.TOP.S:230)
 * Original: if (lw<1) or (lw>79) print "Outta Range!"
 */
export const MAX_MESSAGE_LENGTH = 79;

/**
 * Board names per alliance
 * Original SP.TOP.S:199-202
 */
export const ALLIANCE_BOARD_NAMES: Partial<Record<AllianceType, string>> = {
  [AllianceType.ASTRO_LEAGUE]: 'Astro League Bulletins',
  [AllianceType.SPACE_DRAGONS]: 'Space Dragons Bulletins',
  [AllianceType.WARLORD_CONFED]: 'Warlord Confed Bulletins',
  [AllianceType.REBEL_ALLIANCE]: 'Rebel Alliance Bulletins',
};

// ============================================================================
// ACCESS CONTROL
// ============================================================================

/**
 * Check if a player can access a specific alliance's board
 *
 * Original SP.TOP.S:198-203:
 *   Check alliance symbol (right$(nz$,1)) matches board
 *   "You must belong to an alliance to read bulletins"
 */
export function canAccessBoard(
  playerAlliance: AllianceType,
  boardAlliance: AllianceType
): boolean {
  if (playerAlliance === AllianceType.NONE) return false;
  return playerAlliance === boardAlliance;
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Validate a bulletin message
 *
 * Original SP.TOP.S:230:
 *   if (lw<1) or (lw>79) print "Outta Range!"
 */
export function validateMessage(message: string): { valid: boolean; error?: string } {
  if (!message || message.length < 1) {
    return { valid: false, error: 'Message too short' };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: 'Message too long (79 chars max)' };
  }
  return { valid: true };
}

/**
 * Format a bulletin post with date and player name
 *
 * Original SP.TOP.S:233:
 *   i$=da$+": "+na$+":"
 *   append to alliance file with message
 */
export function formatBulletinPost(playerName: string, message: string): string {
  const date = getDateString();
  return `${date}: ${playerName}: ${message}`;
}

/**
 * Board header text
 * Original SP.TOP.S:179
 */
export const BOARD_HEADER =
  'Confidential Bulletins For Alliance Members Only';
