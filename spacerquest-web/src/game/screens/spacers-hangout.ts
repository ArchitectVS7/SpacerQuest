/**
 * SpacerQuest v4.0 - Spacers Hangout Screen (SP.BAR.S)
 *
 * Central social hub at Sun-3 (System #1).
 * Features:
 * - Alliance joining
 * - Brig viewing / bail
 * - Gambling (links to pub)
 * - Information broker
 * - Smuggling contracts
 *
 * Original source: SP.BAR.S
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import { isJailed } from '../systems/jail.js';
import { ALLIANCE_INFO } from '../systems/alliance-rules.js';

export const SpacersHangoutScreen: ScreenModule = {
  name: 'spacers-hangout',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
    }

    // Only accessible at Sun-3 (system 1)
    if (character.currentSystem !== 1) {
      return {
        output: '\x1b[33mThe Spacers Hangout is only accessible at Sun-3.\x1b[0m\r\n',
        nextScreen: 'main-menu',
      };
    }

    const credits = formatCredits(character.creditsHigh, character.creditsLow);

    const output = `
\x1b[36;1m${'-'.repeat(31)}\x1b[0m
\x1b[33;1m Welcome to The Spacers Hangout!\x1b[0m
\x1b[36;1m${'-'.repeat(31)}\x1b[0m

You step over an old spacer sprawled on the floor mumbling
...'what black hole hit me?'...'all I had were four drinks'...

\x1b[32m[:\x1b[0m${credits}\x1b[32m:][Spacers Hangout]:\x1b[0m

  \x1b[37;1m(G)\x1b[0mamble    \x1b[37;1m(D)\x1b[0mrinks    \x1b[37;1m(I)\x1b[0mnfo
  \x1b[37;1m(A)\x1b[0mlliance  \x1b[37;1m(B)\x1b[0mrig     \x1b[37;1m[Q]\x1b[0muit

Hello Spacer ${character.name}. What'll it be?
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    switch (key) {
      case 'Q':
        return { output: '\x1b[33mLeaving the Hangout...\x1b[0m\r\n', nextScreen: 'main-menu' };

      case 'G':
        return { output: '\x1b[33mGambling...\x1b[0m\r\n', nextScreen: 'pub' };

      case 'D':
        return { output: '\r\n\x1b[32mSlurp! Guzzle! Barf!\x1b[0m\r\n> ' };

      case 'I':
        return {
          output: `\r\n\x1b[33mInformation Broker:\x1b[0m\r\n` +
            `  WIS - Try Polaris-1\r\n` +
            `  SAG - Try Mizar-9\r\n` +
            `  ALL - Looking for an alliance?\r\n` +
            `  PIR - Pirates attack Cargo Transports\r\n` +
            `  SMU - Smuggling pays big bucks\r\n` +
            `  SPA - Owning a Space Port generates income\r\n` +
            `  BAT - B/F = Hull/Rank/Drives/#Trips/Life/#Wins\r\n> `,
        };

      case 'A': {
        // Alliance display
        const lines = ['\r\n\x1b[33;1mAlliance Recruitment:\x1b[0m\r\n'];
        for (const a of ALLIANCE_INFO) {
          const count = await prisma.allianceMembership.count({
            where: { alliance: a.enum },
          });
          lines.push(`  (${a.symbol}) ${a.name} - ${count} members\r\n`);
        }
        lines.push('\r\nRequires Lieutenant rank or higher.\r\n');
        lines.push('Use PUT /api/character/alliance to join.\r\n> ');
        return { output: lines.join('') };
      }

      case 'B': {
        // Brig viewing
        const jailed = await prisma.character.findMany({
          where: { crimeType: { not: null } },
          select: { spacerId: true, name: true, shipName: true, crimeType: true },
        });

        if (jailed.length === 0) {
          return {
            output: `\r\n\x1b[36;1m${'_'.repeat(49)}\x1b[0m\r\n` +
              `\x1b[33mHmmm...Let's see who we have locked up....\x1b[0m\r\n` +
              `\x1b[36;1m${'_'.repeat(49)}\x1b[0m\r\n` +
              `\r\nThe Brig is vacant right now\r\n> `,
          };
        }

        const cells = jailed.map((j, i) =>
          `  Cell #${i + 1} (#${String(j.spacerId).padStart(4, '0')})...${j.name}...Ship: ${j.shipName || 'none'}`
        ).join('\r\n');

        return {
          output: `\r\n\x1b[36;1m${'_'.repeat(49)}\x1b[0m\r\n` +
            `\x1b[33mHmmm...Let's see who we have locked up....\x1b[0m\r\n` +
            `\x1b[36;1m${'_'.repeat(49)}\x1b[0m\r\n` +
            `\r\n${cells}\r\n` +
            `\r\nThat's the scurvy lot of them\r\n> `,
        };
      }

      default:
        return {
          output: '\r\n\x1b[31mWhoops!...one too many!\x1b[0m\r\n> ',
        };
    }
  },
};
