/**
 * SpacerQuest v4.0 - Bank Screen (SP.BANK.S / SP.LINK.S Financial Section)
 *
 * Banking system for deposits, withdrawals, and balance checks.
 *
 * SP.LINK.S lines 89-98 (finan):
 *   if (pp$="") or (left$(pp$,4)="Lieu") goto fink
 *   fink: print "Space Patrol rank of Commander or higher"
 *         print "Required for admittance into the Financial Section"
 *         goto linker
 *
 * Lieutenants are blocked from the Financial Section entirely.
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import { Rank } from '@prisma/client';

export const BankScreen: ScreenModule = {
  name: 'bank',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true }
    });

    // SP.LINK.S finan lines 92-98: Lieutenants cannot access Financial Section
    if (!character || character.rank === Rank.LIEUTENANT) {
      return {
        output: '\r\n\x1b[31mSpace Patrol rank of Commander or higher\x1b[0m\r\n' +
                '\x1b[31mRequired for admittance into the Financial Section\x1b[0m\r\n',
        nextScreen: 'main-menu',
      };
    }

    const credits = formatCredits(character.creditsHigh, character.creditsLow);
    const inBank = formatCredits(character.bankHigh, character.bankLow);

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m      FIRST GALACTIC BANK                 \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[32mWelcome, ${character.name}\x1b[0m

\x1b[37mCurrent Balance:\x1b[0m
  ${credits} credits (On Hand)
  ${inBank} credits (In Bank)

\x1b[33m"Your credits are safe with us"\x1b[0m
  - Management

\x1b[37;1m=========================================\x1b[0m
\x1b[33;1m           BANKING MENU                  \x1b[0m
\x1b[37;1m=========================================\x1b[0m

  [D]eposit credits
  [W]ithdraw credits
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
        return { output: '\x1b[2J\x1b[H', nextScreen: 'bank-deposit' };
      
      case 'W':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'bank-withdraw' };
      
      case 'T':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'bank-transfer' };
      
      default:
        return { 
          output: '\r\n\x1b[31mInvalid command. Press D, W, T, or R.\x1b[0m\r\n> ' 
        };
    }
  }
};
