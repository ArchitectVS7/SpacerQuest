/**
 * SpacerQuest v4.0 - Pub Screen (SP.BAR.S / SP.GAME.S)
 * 
 * Gambling games, gossip, and information
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits, subtractCredits } from '../utils.js';

export const PubScreen: ScreenModule = {
  name: 'pub',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({ 
      where: { id: characterId },
      include: { ship: true }
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
    }

    const credits = formatCredits(character.creditsHigh, character.creditsLow);

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m      THE LONELY ASTEROID PUB             \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

The air is thick with smoke and cheap synth-ale.
Spacers from across the galaxy share stories here.

\x1b[32mCredits:\x1b[0m ${credits} cr

\x1b[37;1m=========================================\x1b[0m
\x1b[33;1m           PUB MENU                      \x1b[0m
\x1b[37;1m=========================================\x1b[0m

  [G]ossip - Hear the latest rumors
  [W]heel of Fortune - Test your luck (1000 cr)
  [D]are Game - High stakes gambling
  [B]uy a drink (50 cr)
  [M]ain Menu

\x1b[32m:\x1b[0m${character.currentSystem} Pub:\x1b[32m:(?=Menu): Command:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    switch (key) {
      case 'M':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
      
      case 'G': {
        // Get latest gossip from game logs
        const logs = await prisma.gameLog.findMany({
          where: { type: { in: ['BATTLE', 'PROMOTION', 'ALLIANCE'] } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });

        const gossip = logs.map(log => `  • ${log.message}`).join('\n');
        return {
          output: `\r\n\x1b[33mLatest Gossip:\x1b[0m\r\n${gossip || '  Nothing new...'}\r\n> `
        };
      }
      
      case 'W':
        return {
          output: `\r\n\x1b[33;1m=== ASTRAL DIGITAL WHEEL OF FORTUNE ===\x1b[0m\r\n` +
            `\r\nPick a number (1-20), choose 3-7 rolls, bet up to 1000 cr.\r\n` +
            `Fewer rolls = higher odds!\r\n` +
            `  3 rolls: 5:1 odds\r\n` +
            `  4 rolls: 4:1 odds\r\n` +
            `  5 rolls: 3:1 odds\r\n` +
            `  7 rolls: 1:1 odds\r\n` +
            `\r\nUse: POST /api/economy/gamble/wheel { betNumber, betAmount, rolls }\r\n> `,
          nextScreen: 'pub-wheel',
        };

      case 'D':
        return {
          output: `\r\n\x1b[33;1m=== SPACER'S DARE ===\x1b[0m\r\n` +
            `\r\nRoll dice vs the computer! Doubles = bust.\r\n` +
            `Choose 3-10 rounds and 1-3x multiplier.\r\n` +
            `Minimum 750 cr to play.\r\n` +
            `\r\nUse: POST /api/economy/gamble/dare { rounds, multiplier }\r\n> `,
          nextScreen: 'pub-dare',
        };
      
      case 'B': {
        const character = await prisma.character.findUnique({
          where: { id: characterId }
        });
        if (!character) return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n> ' };

        const { success, high, low } = subtractCredits(character.creditsHigh, character.creditsLow, 50);
        if (!success) {
          return { output: '\r\n\x1b[31mYou don\'t have enough credits for a drink!\x1b[0m\r\n> ' };
        }

        await prisma.character.update({
          where: { id: characterId },
          data: { creditsHigh: high, creditsLow: low }
        });

        return { 
          output: '\r\n\x1b[32m*gulp* That hit the spot! (-50 cr)\x1b[0m\r\n> ' 
        };
      }
      
      default:
        return { 
          output: '\r\n\x1b[31mInvalid command. Press G, W, D, B, or M.\x1b[0m\r\n> ' 
        };
    }
  }
};
