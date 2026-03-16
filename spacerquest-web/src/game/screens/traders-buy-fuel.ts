import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { getFuelPrice } from '../systems/economy.js';
import { formatCredits, subtractCredits } from '../utils.js';

export const TradersBuyFuelScreen: ScreenModule = {
  name: 'traders-buy-fuel',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({ 
      where: { id: characterId },
      include: { ship: true }
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: No ship found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const price = getFuelPrice(character.currentSystem);
    const credits = formatCredits(character.creditsHigh, character.creditsLow);

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m      BUY TRANSCEND FUEL                  \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[32mPrice:\x1b[0m ${price} cr per unit
\x1b[32mCredits:\x1b[0m ${credits} cr
\x1b[32mCurrent Fuel:\x1b[0m ${character.ship.fuel} units

Enter units to buy (0 to cancel):
\x1b[32m:\x1b[0m${character.currentSystem} Traders Buy Fuel:\x1b[32m: Amount:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const amountStr = input.trim();
    if (!amountStr || amountStr === '0') {
      return { output: '\x1b[2J\x1b[H\x1b[33mPurchase cancelled.\x1b[0m\r\n', nextScreen: 'traders' };
    }

    const units = parseInt(amountStr, 10);
    if (isNaN(units) || units <= 0) {
      return { output: '\r\n\x1b[31mInvalid amount.\x1b[0m\r\n> ' };
    }

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true }
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const price = getFuelPrice(character.currentSystem);
    const totalCost = units * price;

    const { success, high, low } = subtractCredits(character.creditsHigh, character.creditsLow, totalCost);
    if (!success) {
      return { output: `\r\n\x1b[31mNot enough credits. You need ${totalCost} cr.\x1b[0m\r\n> ` };
    }

    await prisma.$transaction([
      prisma.character.update({
        where: { id: characterId },
        data: { creditsHigh: high, creditsLow: low }
      }),
      prisma.ship.update({
        where: { id: character.ship.id },
        data: { fuel: character.ship.fuel + units }
      })
    ]);

    return { 
      output: `\x1b[2J\x1b[H\x1b[32mBought ${units} fuel for ${totalCost} cr.\x1b[0m\r\n`, 
      nextScreen: 'traders' 
    };
  }
};
