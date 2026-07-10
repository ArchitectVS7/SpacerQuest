import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { getFuelSellPrice } from '../systems/economy.js';
import { formatCredits, addCredits } from '../utils.js';
import { FUEL_MAX_CAPACITY } from '../constants.js';

export const TradersSellFuelScreen: ScreenModule = {
  name: 'traders-sell-fuel',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true, portOwnership: true }
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: No ship found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    // SP.LIFT.S line 316: i$="Sell":if ma$=na$ i$="Transfer"
    const isOwner = character.portOwnership?.systemId === character.currentSystem;
    const action = isOwner ? 'Transfer' : 'Sell';
    const credits = formatCredits(character.creditsHigh, character.creditsLow);

    let output = `\x1b[2J\x1b[H`;
    output += `\x1b[36;1m_________________________________________\x1b[0m\r\n`;
    output += `\x1b[33;1m      ${action.toUpperCase()} TRANSCEND FUEL                 \x1b[0m\r\n`;
    output += `\x1b[36;1m_________________________________________\x1b[0m\r\n\r\n`;

    if (isOwner) {
      output += `\x1b[33mFuel will be transferred to your depot storage.\x1b[0m\r\n`;
    } else {
      const sellPricePerUnit = getFuelSellPrice(character.currentSystem);
      output += `\x1b[32mPrice:\x1b[0m ${sellPricePerUnit} cr per unit\r\n`;
    }

    output += `\x1b[32mCredits:\x1b[0m ${credits} cr\r\n`;
    output += `\x1b[32mCurrent Fuel:\x1b[0m ${character.ship.fuel} units\r\n\r\n`;
    output += `\x1b[32m[Cr:\x1b[0m${credits}\x1b[32m:]:[:F:\x1b[0m${character.ship.fuel}\x1b[32m:]\x1b[0m : ${action} how much? \x1b[33m[Q]uits\x1b[0m\r\n> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const amountStr = input.trim();
    if (!amountStr || amountStr === '0' || amountStr.toUpperCase() === 'Q') {
      return { output: '\x1b[2J\x1b[H\x1b[33mSale cancelled.\x1b[0m\r\n', nextScreen: 'traders' };
    }

    const units = parseInt(amountStr, 10);
    if (isNaN(units) || units <= 0) {
      return { output: '\r\n\x1b[31mInvalid amount.\x1b[0m\r\n> ' };
    }

    // SP.LIFT.S seller: if i>2900 print ro$ (max 2900 per transaction)
    if (units > 2900) {
      return { output: '\r\n\x1b[31mToo Much!\x1b[0m\r\n> ' };
    }

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true, portOwnership: true }
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    if (character.ship.fuel < units) {
      return { output: '\r\n\x1b[31mYou do not have that much fuel to sell!\x1b[0m\r\n> ' };
    }

    // SP.LIFT.S line 326: if (m5$=na$) print"Fuel put into Storage!":f1=(f1-i):m9=(m9+i):goto fler
    // Port owner: transfer fuel to depot storage, no credit change
    const isOwner = character.portOwnership?.systemId === character.currentSystem;
    if (isOwner && character.portOwnership) {
      const port = character.portOwnership;
      const newFuelStored = Math.min(port.fuelStored + units, FUEL_MAX_CAPACITY);
      await prisma.$transaction([
        prisma.ship.update({
          where: { id: character.ship.id },
          data: { fuel: character.ship.fuel - units },
        }),
        prisma.portOwnership.update({
          where: { id: port.id },
          data: { fuelStored: newFuelStored },
        }),
      ]);
      return {
        output: `\x1b[2J\x1b[H\x1b[32mFuel put into Storage!\x1b[0m\r\n`,
        nextScreen: 'traders',
      };
    }

    const sellPrice = getFuelSellPrice(character.currentSystem);
    const totalProceeds = units * sellPrice;

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
