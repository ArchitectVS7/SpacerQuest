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
import { prisma } from '../../db/prisma.js';
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

// ============================================================================
// NPC BULLETIN BOARD POST GENERATION
// ============================================================================

/**
 * Alliance display names matching original SP.VEST.S:194-200 (allchk routine)
 */
const ALLIANCE_DISPLAY_NAMES: Partial<Record<AllianceType, string>> = {
  [AllianceType.ASTRO_LEAGUE]: 'Astro League',
  [AllianceType.SPACE_DRAGONS]: 'Space Dragons',
  [AllianceType.WARLORD_CONFED]: 'Warlord Confed',
  [AllianceType.REBEL_ALLIANCE]: 'Rebel Alliance',
};

/**
 * NPC bulletin board post templates adapted from original SP.VEST.S news entries.
 *
 * Original templates from SP.VEST.S:
 *   Line 65:  ": "+na$+" of The "+o4$+" Acquires "+o3$
 *   Line 93:  ": "+na$+" - "+lm$+" - Increases "+o3$+" DEFCON to: "+a$
 *   Line 127: ": "+na$+" - "+lm$+" - Withdraws "+ir$+" cr from "+o3$
 *   Line 163: ": "+na$+" - "+lm$+" - Deposits "+ir$+" cr to "+o3$
 *   Line 187: ": ["+ln$+"] - Take-Over "+o3$+" from "+o4$+" by "+na$
 *
 * These templates generate NPC-authored posts for alliance boards,
 * giving the world a populated feel even with few real players.
 */

type NpcPostTemplate = (npcName: string, alliance: string, system: string) => string;

const NPC_POST_TEMPLATES: NpcPostTemplate[] = [
  // Adapted from SP.VEST.S:65 — acquisition report
  (name, alliance) => `${name} of The ${alliance}: Scouting new systems for expansion`,

  // Adapted from SP.VEST.S:93 — DEFCON increase report
  (name, alliance, system) => `${name} - ${alliance} - Recommends DEFCON increase for ${system}`,

  // Adapted from SP.VEST.S:127 — withdrawal activity
  (name, alliance, system) => `${name} - ${alliance} - Reports low reserves at ${system}`,

  // Adapted from SP.VEST.S:163 — deposit activity
  (name, alliance, system) => `${name} - ${alliance} - Supply run to ${system} complete`,

  // Adapted from SP.VEST.S:187 — takeover report
  (name, alliance, system) => `[${alliance}] - ${name} reports hostile activity near ${system}`,

  // Patrol/combat report
  (name, alliance) => `${name} - ${alliance} - Patrols report all clear`,

  // Rally call
  (name, alliance) => `${name} of The ${alliance}: All hands report for duty!`,

  // Intelligence report
  (name, alliance, system) => `${name} - ${alliance} - Gathering intelligence on ${system}`,

  // Trade route update
  (name, alliance, system) => `${name} - ${alliance} - New trade route established via ${system}`,

  // Defensive posture
  (name, alliance, system) => `${name} - ${alliance} - Fortifying defenses at ${system}`,
];

/** Star system names for template variety */
const SYSTEM_NAMES = [
  'Sun-3', 'Aldebaran-1', 'Altair-3', 'Arcturus-6',
  'Canopus-2', 'Deneb-8', 'Fomalhaut-7', 'Procyon-4',
  'Regulus-5', 'Rigel-6', 'Sirius-1', 'Spica-3',
  'Vega-6', 'Wolf-4', 'Antares-5', 'Capella-4',
  'Polaris-1', 'Mizar-9', 'Betelgeuse-2', 'Algol-2',
];

/**
 * Generate NPC bulletin board posts for alliance boards.
 *
 * Selects random NPCs from the roster that have alliance affiliations
 * and creates templated posts on their alliance's board.
 *
 * @param count - Number of NPC posts to generate (default 1-3 random)
 * @returns Number of posts created
 */
export async function generateNpcBulletinPosts(count?: number): Promise<number> {
  const postCount = count ?? (1 + Math.floor(Math.random() * 3));

  // Get NPCs with alliance affiliations
  const alliedNpcs = await prisma.npcRoster.findMany({
    where: { alliance: { not: 'NONE' as AllianceType } },
  });

  if (alliedNpcs.length === 0) return 0;

  let created = 0;

  for (let i = 0; i < postCount; i++) {
    const npc = alliedNpcs[Math.floor(Math.random() * alliedNpcs.length)];
    const allianceName = ALLIANCE_DISPLAY_NAMES[npc.alliance] ?? 'Unknown';
    const system = SYSTEM_NAMES[Math.floor(Math.random() * SYSTEM_NAMES.length)];
    const template = NPC_POST_TEMPLATES[Math.floor(Math.random() * NPC_POST_TEMPLATES.length)];

    const messageBody = template(npc.commander, allianceName, system);
    const formatted = formatBulletinPost(npc.commander, messageBody);

    await prisma.bulletinPost.create({
      data: {
        alliance: npc.alliance,
        authorName: npc.commander,
        characterId: null,
        message: formatted,
      },
    });

    created++;
  }

  return created;
}
