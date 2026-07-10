/**
 * SpacerQuest v4.0 - Fuel Depot: Buy Wholesale Screen
 *
 * SP.REAL.txt lines 188-215: Port owner buys fuel at 10 cr/unit from Main Port Storage.
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import { getSystemName, calculateDepotBuy } from '../systems/economy.js';
import { FUEL_MAX_CAPACITY, FUEL_DEPOT_WHOLESALE_PRICE } from '../constants.js';

export const FuelDepotBuyScreen: ScreenModule = {
  name: 'fuel-depot-buy',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true, portOwnership: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: No ship found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    if (!character.portOwnership) {
      return { output: '\x1b[31mNot a port owner!\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const port = character.portOwnership;
    const credits = formatCredits(character.creditsHigh, character.creditsLow);
    const maxBuyable = FUEL_MAX_CAPACITY - port.fuelStored;

    // SP.REAL.txt lines 189-193:
    //   print\"........Main Port Fuel Storage........."
    //   gosub crfix
    //   print\"[Cr:"g$":]=[Storage:"m9"] Buy fuel...[Q]uits"
    //   print\"Your Cost: 10 cr/unit...How much? (0-"(20000-m9)"): ";
    let output = `\x1b[2J\x1b[H`;
    output += `\x1b[36m........Main Port Fuel Storage.........\x1b[0m\r\n\r\n`;
    output += `\x1b[32m[Cr:\x1b[0m${credits}\x1b[32m:]=[Storage:\x1b[0m${port.fuelStored}\x1b[32m]\x1b[0m Buy fuel...\x1b[33m[Q]uits\x1b[0m\r\n\r\n`;
    output += `Your Cost: ${FUEL_DEPOT_WHOLESALE_PRICE} cr/unit...How much? (0-${maxBuyable}): `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const trimmed = input.trim();

    if (!trimmed || trimmed === '0' || trimmed.toUpperCase() === 'Q') {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'fuel-depot' };
    }

    // SP.REAL.txt line 195: if len(i$)>5 print ro$
    if (trimmed.length > 5) {
      return { output: '\r\n\x1b[31mInvalid amount.\x1b[0m\r\n> ' };
    }

    const units = parseInt(trimmed, 10);
    if (isNaN(units) || units <= 0) {
      return { output: '\r\n\x1b[31mInvalid amount.\x1b[0m\r\n> ' };
    }

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true, portOwnership: true },
    });

    if (!character || !character.ship || !character.portOwnership) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const port = character.portOwnership;
    const result = calculateDepotBuy(units, port.fuelStored, character.creditsHigh, character.creditsLow);

    if (!result.success) {
      return { output: `\r\n\x1b[31m${result.message}\x1b[0m\r\n> ` };
    }

    const portName = getSystemName(port.systemId);

    // SP.REAL.txt lines 207-210: deduct credits, add fuel to depot
    await prisma.$transaction([
      prisma.character.update({
        where: { id: characterId },
        data: { creditsHigh: result.creditsHigh, creditsLow: result.creditsLow },
      }),
      prisma.portOwnership.update({
        where: { id: port.id },
        data: { fuelStored: result.newFuelStored },
      }),
    ]);

    // SP.REAL.txt line 211: print\i" units of Fuel transferred from Main Port Storage to "m4$
    return {
      output: `\x1b[2J\x1b[H\x1b[32m${units} units of Fuel transferred from Main Port Storage to ${portName}\x1b[0m\r\n`,
      nextScreen: 'fuel-depot',
    };
  },
};
