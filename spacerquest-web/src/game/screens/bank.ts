/**
 * SpacerQuest v4.0 - Bank Screen (SP.BANK.S)
 * 
 * Banking system for deposits, withdrawals, and balance checks
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';

export const BankScreen: ScreenModule = {
  name: 'bank',
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
\x1b[33;1m      FIRST GALACTIC BANK                 \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[32mWelcome, ${character.name}\x1b[0m

\x1b[37mCurrent Balance:\x1b[0m
  ${credits} credits

\x1b[33m"Your credits are safe with us"\x1b[0m
  - Management

\x1b[37;1m=========================================\x1b[0m
\x1b[33;1m           BANKING MENU                  \x1b[0m
\x1b[37;1m=========================================\x1b[0m

  [D]eposit credits (API endpoint)
  [W]ithdraw credits (API endpoint)
  [T]ransfer to alliance account
  [R]eturn to Main Menu

\x1b[32m:\x1b[0m${character.currentSystem} Bank:\x1b[32m:(?=Menu): Command:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    switch (key) {
      case 'R':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
      
      case 'D':
        return { 
          output: '\r\n\x1b[33mUse the /api/economy/fuel/buy endpoint for transactions\x1b[0m\r\n> ' 
        };
      
      case 'W':
        return { 
          output: '\r\n\x1b[33mUse the /api/economy/fuel/sell endpoint for transactions\x1b[0m\r\n> ' 
        };
      
      case 'T':
        return { 
          output: '\r\n\x1b[33mUse the /api/economy/alliance/invest endpoint\x1b[0m\r\n> ' 
        };
      
      default:
        return { 
          output: '\r\n\x1b[31mInvalid command. Press D, W, T, or R.\x1b[0m\r\n> ' 
        };
    }
  }
};
