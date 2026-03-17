/**
 * SpacerQuest v4.0 - Alliance Bulletin Board Screen (SP.TOP.S)
 *
 * Alliance-restricted bulletin board for posting and reading messages.
 * Each alliance has its own board; only members may access it.
 *
 * Operations:
 * - (R)eread   - Refresh and view messages
 * - (W)rite msg - Post a message (79 char max)
 * - (K)ill msgs - Wipe all messages (confirmation required)
 * - (Q)uit      - Return to Spacers Hangout
 *
 * Original source: SP.TOP.S:175-239
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { AllianceType } from '@prisma/client';
import {
  ALLIANCE_BOARD_NAMES,
  BOARD_HEADER,
  validateMessage,
  formatBulletinPost,
} from '../systems/bulletin-board.js';

// ============================================================================
// MULTI-STEP INPUT STATE
// ============================================================================

/** Characters currently mid-way through the write-message flow */
const pendingWrite: Map<string, boolean> = new Map();

/** Characters currently mid-way through the kill-board confirmation flow */
const pendingKill: Map<string, boolean> = new Map();

// ============================================================================
// HELPERS
// ============================================================================

async function renderBoard(characterId: string): Promise<ScreenResponse> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
  }

  const membership = await prisma.allianceMembership.findUnique({
    where: { characterId },
  });

  if (!membership || membership.alliance === AllianceType.NONE) {
    return {
      output:
        '\r\n\x1b[31mYou must belong to an alliance to read bulletins.\x1b[0m\r\n',
      nextScreen: 'spacers-hangout',
    };
  }

  const alliance = membership.alliance;
  const boardName = ALLIANCE_BOARD_NAMES[alliance] ?? 'Alliance Bulletins';

  const posts = await prisma.bulletinPost.findMany({
    where: { alliance },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const postLines =
    posts.length === 0
      ? '  No messages posted.\r\n'
      : posts
          .map((p, i) => `  ${String(i + 1).padStart(2)}. ${p.content}`)
          .join('\r\n') + '\r\n';

  const output =
    '\r\n' +
    `\x1b[33;1m${BOARD_HEADER}\x1b[0m\r\n` +
    `\x1b[37;1m${boardName}\x1b[0m\r\n` +
    `\x1b[36m${'─'.repeat(79)}\x1b[0m\r\n` +
    `\r\n${postLines}\r\n` +
    `\x1b[36m${'─'.repeat(79)}\x1b[0m\r\n` +
    `  \x1b[37;1m(R)\x1b[0meread  \x1b[37;1m(W)\x1b[0mrite msg  \x1b[37;1m(K)\x1b[0mill msgs  \x1b[37;1m(Q)\x1b[0muit\r\n` +
    `\r\n> `;

  return { output };
}

// ============================================================================
// SCREEN MODULE
// ============================================================================

export const BulletinBoardScreen: ScreenModule = {
  name: 'bulletin-board',

  render: async (characterId: string): Promise<ScreenResponse> => {
    return renderBoard(characterId);
  },

  handleInput: async (
    characterId: string,
    input: string
  ): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    // ------------------------------------------------------------------
    // Multi-step: write message (second call — message body received)
    // ------------------------------------------------------------------
    if (pendingWrite.get(characterId)) {
      pendingWrite.delete(characterId);

      const message = input.trim();
      const validation = validateMessage(message);

      if (!validation.valid) {
        return {
          output: `\r\n\x1b[31mOutta Range! ${validation.error}.\x1b[0m\r\n> `,
        };
      }

      const character = await prisma.character.findUnique({
        where: { id: characterId },
      });

      if (!character) {
        return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
      }

      const membership = await prisma.allianceMembership.findUnique({
        where: { characterId },
      });

      if (!membership || membership.alliance === AllianceType.NONE) {
        return {
          output:
            '\r\n\x1b[31mYou must belong to an alliance to post bulletins.\x1b[0m\r\n',
          nextScreen: 'spacers-hangout',
        };
      }

      const formatted = formatBulletinPost(character.name, message);

      await prisma.bulletinPost.create({
        data: {
          alliance: membership.alliance,
          authorName: character.name,
          characterId,
          content: formatted,
        },
      });

      const board = await renderBoard(characterId);
      return {
        output: `\r\n\x1b[32mMessage posted!\x1b[0m\r\n` + board.output,
        nextScreen: board.nextScreen,
      };
    }

    // ------------------------------------------------------------------
    // Multi-step: kill confirmation (second call — Y/N received)
    // ------------------------------------------------------------------
    if (pendingKill.get(characterId)) {
      pendingKill.delete(characterId);

      if (key === 'Y') {
        const membership = await prisma.allianceMembership.findUnique({
          where: { characterId },
        });

        if (!membership || membership.alliance === AllianceType.NONE) {
          return {
            output:
              '\r\n\x1b[31mYou must belong to an alliance to manage bulletins.\x1b[0m\r\n',
            nextScreen: 'spacers-hangout',
          };
        }

        await prisma.bulletinPost.deleteMany({
          where: { alliance: membership.alliance },
        });

        const board = await renderBoard(characterId);
        return {
          output: `\r\n\x1b[33mBoard wiped.\x1b[0m\r\n` + board.output,
          nextScreen: board.nextScreen,
        };
      }

      // 'N' or anything else — cancel
      return {
        output: '\r\n\x1b[37mKill cancelled.\x1b[0m\r\n> ',
      };
    }

    // ------------------------------------------------------------------
    // Normal commands
    // ------------------------------------------------------------------
    switch (key) {
      case 'R':
        return renderBoard(characterId);

      case 'W':
        pendingWrite.set(characterId, true);
        return {
          output: '\r\nEnter message (79 chars max): ',
        };

      case 'K':
        pendingKill.set(characterId, true);
        return {
          output: '\r\nWipe all messages? (Y/N): ',
        };

      case 'Q':
        return { output: '\r\n', nextScreen: 'spacers-hangout' };

      default:
        return {
          output: '\r\n\x1b[31mInvalid command.\x1b[0m\r\n> ',
        };
    }
  },
};
