/**
 * SpacerQuest v4.0 - Space News Screen (SP.TOP.S:242-294)
 *
 * Public news board displaying GameLog entries as BBS-style posts.
 * Three log categories matching the original filer routine:
 * - (B)attles  - Recent Battles (iz=1, sp.batt)
 * - (A)lliance - Alliance Holding Transactions (iz=2, sp.news)
 * - (R)escues  - Recent Rescues & Missions
 * - (Q)uit     - Return to Spacers Hangout
 *
 * Original source: SP.TOP.S:242-294 (filer routine)
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { LogType } from '@prisma/client';

// ============================================================================
// CONSTANTS
// ============================================================================

const NEWS_PAGE_SIZE = 20;

type NewsCategory = 'BATTLES' | 'ALLIANCE' | 'ALL';

const pendingCategory = new Map<string, NewsCategory>();

// ============================================================================
// HELPERS
// ============================================================================

function formatLogDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

async function renderNews(category: NewsCategory): Promise<string> {
  let types: LogType[];
  let heading: string;

  switch (category) {
    case 'BATTLES':
      types = ['BATTLE' as LogType, 'DUEL' as LogType];
      heading = '                  Spacer Quest - Battle Log';
      break;
    case 'ALLIANCE':
      types = ['ALLIANCE' as LogType];
      heading = '               Alliance Holding Transactions';
      break;
    case 'ALL':
    default:
      types = [
        'BATTLE' as LogType,
        'DUEL' as LogType,
        'ALLIANCE' as LogType,
        'PROMOTION' as LogType,
        'RESCUE' as LogType,
        'MISSION' as LogType,
      ];
      heading = '                  Spacer Quest - Space News';
      break;
  }

  const logs = await prisma.gameLog.findMany({
    where: { type: { in: types } },
    orderBy: { createdAt: 'desc' },
    take: NEWS_PAGE_SIZE,
  });

  const separator = '\x1b[36m' + '-'.repeat(79) + '\x1b[0m';
  const dateStr = formatLogDate(new Date());

  let output = '\r\n' + separator + '\r\n';
  output += `\x1b[33;1m${heading} - ${dateStr}\x1b[0m\r\n`;
  output += separator + '\r\n';

  if (logs.length === 0) {
    output += '\r\n  No entries found.\r\n';
  } else {
    for (const log of logs) {
      const logDate = formatLogDate(log.createdAt);
      output += `${logDate}${log.message}\r\n`;
    }
  }

  output += '\r\n' + separator + '\r\n';
  return output;
}

// ============================================================================
// SCREEN MODULE
// ============================================================================

export const SpaceNewsScreen: ScreenModule = {
  name: 'space-news',

  render: async (_characterId: string): Promise<ScreenResponse> => {
    const separator = '\x1b[36m' + '-'.repeat(79) + '\x1b[0m';

    const output =
      '\r\n' +
      separator + '\r\n' +
      '\x1b[33;1m                     S P A C E   N E W S\x1b[0m\r\n' +
      separator + '\r\n' +
      '\r\n' +
      '  \x1b[37;1m(B)\x1b[0mattles     - Recent Battles\r\n' +
      '  \x1b[37;1m(A)\x1b[0mlliance    - Alliance Holding Transactions\r\n' +
      '  \x1b[37;1m(S)\x1b[0mhow All    - All Space News\r\n' +
      '  \x1b[37;1m(Q)\x1b[0muit        - Return to Hangout\r\n' +
      '\r\n> ';

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    // If we're showing a category, any key returns to menu
    if (pendingCategory.has(characterId)) {
      pendingCategory.delete(characterId);
      return SpaceNewsScreen.render(characterId);
    }

    switch (key) {
      case 'B': {
        pendingCategory.set(characterId, 'BATTLES');
        const news = await renderNews('BATTLES');
        return { output: news + '\x1b[37mPress any key...\x1b[0m ' };
      }

      case 'A': {
        pendingCategory.set(characterId, 'ALLIANCE');
        const news = await renderNews('ALLIANCE');
        return { output: news + '\x1b[37mPress any key...\x1b[0m ' };
      }

      case 'S': {
        pendingCategory.set(characterId, 'ALL');
        const news = await renderNews('ALL');
        return { output: news + '\x1b[37mPress any key...\x1b[0m ' };
      }

      case 'Q':
        return { output: '\r\n', nextScreen: 'spacers-hangout' };

      default:
        return { output: '\r\n\x1b[31mInvalid command.\x1b[0m\r\n> ' };
    }
  },
};
