/**
 * SpacerQuest v4.0 - Pub Screen (SP.BAR.S / SP.GAME.S)
 * 
 * Gambling games, gossip, and information
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';

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
          output: '\r\n\x1b[33mWheel of Fortune - Use API endpoint /api/economy/gamble/wheel\x1b[0m\r\n> ' 
        };
      
      case 'D':
        return { 
          output: '\r\n\x1b[33mDare Game - High stakes! Use API endpoint\x1b[0m\r\n> ' 
        };
      
      case 'B':
        return { 
          output: '\r\n\x1b[32m*gulp* That hit the spot! (-50 cr)\x1b[0m\r\n> ' 
        };
      
      default:
        return { 
          output: '\r\n\x1b[31mInvalid command. Press G, W, D, B, or M.\x1b[0m\r\n> ' 
        };
    }
  }
};
