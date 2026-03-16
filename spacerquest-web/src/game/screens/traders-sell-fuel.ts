import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { getFuelPrice, calculateFuelSaleProceeds } from '../systems/economy.js';
import { formatCredits, addCredits } from '../utils.js';

export const TradersSellFuelScreen: ScreenModule = {
  name: 'traders-sell-fuel',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({ 
      where: { id: characterId },
      include: { ship: true }
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: No ship found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const buyPrice = getFuelPrice(character.currentSystem);
    // Usually sell price is half of buy price or determined by FUEL_SELL_MULTIPLIER
    const sellPricePerUnit = calculateFuelSaleProceeds(1, buyPrice);
    const credits = formatCredits(character.creditsHigh, character.creditsLow);

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m      SELL TRANSCEND FUEL                 \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[32mPrice:\x1b[0m ${sellPricePerUnit} cr per unit
\x1b[32mCredits:\x1b[0m ${credits} cr
\x1b[32mCurrent Fuel:\x1b[0m ${character.ship.fuel} units

Enter units to sell (0 to cancel):
\x1b[32m:\x1b[0m${character.currentSystem} Traders Sell Fuel:\x1b[32m: Amount:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const amountStr = input.trim();
    if (!amountStr || amountStr === '0') {
      return { output: '\x1b[2J\x1b[H\x1b[33mSale cancelled.\x1b[0m\r\n', nextScreen: 'traders' };
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

    if (character.ship.fuel < units) {
      return { output: '\r\n\x1b[31mYou do not have that much fuel to sell!\x1b[0m\r\n> ' };
    }

    const buyPrice = getFuelPrice(character.currentSystem);
    const totalProceeds = calculateFuelSaleProceeds(units, buyPrice);

    const { high, low } = addCredits(character.creditsHigh, character.creditsLow, totalProceeds);

    await prisma.$transaction([
      prisma.character.update({
        where: { id: characterId },
        data: { creditsHigh: high, creditsLow: low }
      }),
      prisma.ship.update({
        where: { id: character.ship.id },
        data: { fuel: character.ship.fuel - units }
      })
    ]);

    return { 
      output: `\x1b[2J\x1b[H\x1b[32mSold ${units} fuel for ${totalProceeds} cr.\x1b[0m\r\n`, 
      nextScreen: 'traders' 
    };
  }
};
