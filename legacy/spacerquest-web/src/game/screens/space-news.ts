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

type NewsCategory = 'BATTLES' | 'ALLIANCE' | 'ALL' | 'CONQUEST' | 'HERO';

// SP.TOP.S filer: lc$ persists between calls as the last-used cutoff date.
// Modern equivalent: per-player persistent default date.
const lastDate = new Map<string, string>(); // characterId → 'MM/DD/YY'

// State for date-prompt flow (B and A filer categories)
const pendingDateInput = new Map<string, { category: NewsCategory; categoryLabel: string }>();

// State for "any key returns to menu" after viewing news
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

// SP.TOP.S filer check.date subroutine (lines 287-295):
//   Validates and parses MM/DD/YY date string.
//   Original: len=8, mid$(3,1)="/", mid$(6,1)="/", month 1-12, day 1-31, year 1-99
export function parseFilerDate(s: string): Date | null {
  if (s.length !== 8) return null;
  if (s[2] !== '/' || s[5] !== '/') return null;
  const month = parseInt(s.slice(0, 2), 10);
  const day   = parseInt(s.slice(3, 5), 10);
  const year  = parseInt(s.slice(6, 8), 10);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31)     return null;
  if (year < 1 || year > 99)   return null;
  // 2-digit year: 00-99 → 2000-2099 (modern games post-2000)
  const fullYear = 2000 + year;
  return new Date(fullYear, month - 1, day, 0, 0, 0, 0);
}

async function renderNews(category: NewsCategory, since?: Date): Promise<string> {
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
    case 'CONQUEST':
      types = ['CONQUEST' as LogType];
      heading = '                Spacer Quest - Hall of Fame';
      break;
    case 'HERO':
      types = ['HERO' as LogType];
      heading = '                 Spacer Quest - Space Heroes';
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

  // SP.TOP.S filer: filter entries by date (check.date subroutine)
  const whereClause = since
    ? { type: { in: types }, createdAt: { gte: since } }
    : { type: { in: types } };

  const logs = await prisma.gameLog.findMany({
    where: whereClause,
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
      '  \x1b[37;1m(G)\x1b[0mreat       - Hall of Fame (Conquerors)\r\n' +
      '  \x1b[37;1m(H)\x1b[0meroes      - Space Heroes Log\r\n' +
      '  \x1b[37;1m(S)\x1b[0mhow All    - All Space News\r\n' +
      '  \x1b[37;1m(Q)\x1b[0muit        - Return to Main Menu\r\n' +
      '\r\n> ';

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    // SP.TOP.S filer date-input state: user entered a date (or blank = use default)
    if (pendingDateInput.has(characterId)) {
      const { category, categoryLabel } = pendingDateInput.get(characterId)!;
      pendingDateInput.delete(characterId);

      const raw = input.trim();
      let since: Date | undefined;

      if (raw === '') {
        // Empty input: use persisted default date (or no filter if none saved)
        const saved = lastDate.get(characterId);
        since = saved ? (parseFilerDate(saved) ?? undefined) : undefined;
      } else {
        // Validate MM/DD/YY format (SP.TOP.S filer:252-257)
        const parsed = parseFilerDate(raw);
        if (!parsed) {
          // Invalid date — re-prompt with existing default
          const defaultDate = lastDate.get(characterId) || '';
          pendingDateInput.set(characterId, { category, categoryLabel });
          return {
            output:
              '\r\n\x1b[31m...Enter MM/DD/YY...\x1b[0m\r\n' +
              `Scan for ${categoryLabel} since...(<C-R> accepts)-> ${defaultDate}`,
          };
        }
        // Valid date: update persistent default
        lastDate.set(characterId, raw);
        since = parsed;
      }

      pendingCategory.set(characterId, category);
      const news = await renderNews(category, since);
      const sinceLabel = since ? `[${formatLogDate(since)}]` : '';
      return { output: news + `${sinceLabel} \x1b[37mPress any key...\x1b[0m ` };
    }

    // If we're showing a category, any key returns to menu
    if (pendingCategory.has(characterId)) {
      pendingCategory.delete(characterId);
      return SpaceNewsScreen.render(characterId);
    }

    switch (key) {
      case 'B': {
        // SP.TOP.S filer iz=1: "Scan for Recent Battles since...(<C-R> accepts)-> lc$"
        const defaultDate = lastDate.get(characterId) || '';
        pendingDateInput.set(characterId, { category: 'BATTLES', categoryLabel: 'Recent Battles' });
        return {
          output:
            `\r\nScan for Recent Battles since...(<C-R> accepts)-> ${defaultDate}`,
        };
      }

      case 'A': {
        // SP.TOP.S filer iz=2: "Scan for Alliance Activity since...(<C-R> accepts)-> lc$"
        const defaultDate = lastDate.get(characterId) || '';
        pendingDateInput.set(characterId, { category: 'ALLIANCE', categoryLabel: 'Alliance Activity' });
        return {
          output:
            `\r\nScan for Alliance Activity since...(<C-R> accepts)-> ${defaultDate}`,
        };
      }

      case 'G': {
        // SP.START.S: if i$="G" print"Hall of Fame":copy"sp.great":goto main1
        pendingCategory.set(characterId, 'CONQUEST');
        const news = await renderNews('CONQUEST');
        return { output: news + '\x1b[37mPress any key...\x1b[0m ' };
      }

      case 'H': {
        // SP.START.S: if i$="S" print"Space Heroes":copy"sp.hero":goto main1
        // (original used S for heroes; modern uses H to avoid conflict with Show All)
        pendingCategory.set(characterId, 'HERO');
        const news = await renderNews('HERO');
        return { output: news + '\x1b[37mPress any key...\x1b[0m ' };
      }

      case 'S': {
        pendingCategory.set(characterId, 'ALL');
        const news = await renderNews('ALL');
        return { output: news + '\x1b[37mPress any key...\x1b[0m ' };
      }

      case 'Q':
        return { output: '\r\n', nextScreen: 'main-menu' };

      default:
        return { output: '\r\n\x1b[31mInvalid command.\x1b[0m\r\n> ' };
    }
  },
};
