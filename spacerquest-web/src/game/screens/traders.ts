/**
 * SpacerQuest v4.0 - Traders Screen (SP.XCHG.S)
 * 
 * Cargo trading, market prices, and commerce
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import { getCargoDescription, getFuelPrice } from '../systems/economy.js';

export const TradersScreen: ScreenModule = {
  name: 'traders',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({ 
      where: { id: characterId },
      include: { ship: true }
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: No ship found.\x1b[0m\r\n' };
    }

    const credits = formatCredits(character.creditsHigh, character.creditsLow);
    const fuelPrice = getFuelPrice(character.currentSystem);

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m      INTERGALACTIC TRADERS               \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

Market rates fluctuate based on supply/demand.

\x1b[32mCredits:\x1b[0m ${credits} cr
\x1b[32mFuel Price:\x1b[0m ${fuelPrice} cr/unit
\x1b[32mCargo Pods:\x1b[0m ${character.ship.cargoPods}/${character.ship.maxCargoPods}

\x1b[37;1m=========================================\x1b[0m
\x1b[33;1m         CARGO TYPES                     \x1b[0m
\x1b[37;1m=========================================\x1b[0m

  Type    Description
  ────────────────────────────────────
  [1]     Dry Goods
  [2]     Nutri Goods
  [3]     Spices
  [4]     Medicinals
  [5]     Electronics
  [6]     Precious Metals
  [7]     Rare Elements
  [8]     Photonic Components
  [9]     Dilithium Crystal

\x1b[37;1m=========================================\x1b[0m
\x1b[33;1m           TRADERS MENU                  \x1b[0m
\x1b[37;1m=========================================\x1b[0m

  [A]ccept cargo contract
  [B]uy fuel
  [S]ell fuel
  [C]heck current contract
  [M]ain Menu

\x1b[32m:\x1b[0m${character.currentSystem} Traders:\x1b[32m:(?=Menu): Command:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    switch (key) {
      case 'M':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
      
      case 'A':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'traders-cargo' };
      
      case 'B':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'traders-buy-fuel' };
      
      case 'S':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'traders-sell-fuel' };
      
      case 'C': {
        // Check current cargo contract
        const character = await prisma.character.findUnique({
          where: { id: characterId },
        });

        if (character && character.cargoPods > 0 && character.cargoType !== 0) {
          const cargoDesc = getCargoDescription(character.cargoType);
          return {
            output: `\r\n\x1b[33mCurrent Contract:\x1b[0m\r\n  ${character.cargoPods} pods of ${cargoDesc}\r\n  Destination: System ${character.destination}\r\n  Payment: ${character.cargoPayment} cr\r\n> `
          };
        }
        return {
          output: '\r\n\x1b[33mNo active cargo contract\x1b[0m\r\n> '
        };
      }
      
      default:
        return { 
          output: '\r\n\x1b[31mInvalid command. Press A, B, S, C, or M.\x1b[0m\r\n> ' 
        };
    }
  }
};
