/**
 * SpacerQuest v4.0 - Fuel Depot: Set Price Screen
 *
 * SP.REAL.txt lines 181-187: Owner sets fuel selling price (0-50 cr/unit).
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { validateDepotPrice } from '../systems/economy.js';

export const FuelDepotPriceScreen: ScreenModule = {
  name: 'fuel-depot-price',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { portOwnership: true },
    });

    if (!character?.portOwnership) {
      return { output: '\x1b[31mNot a port owner!\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    // SP.REAL.txt line 182-183:
    //   print\"[Fuel Price: "m5"] - Set Fuel Unit Price...[Q]uits"
    //   input@3\"New Fuel Price: (0-50): ";i$
    let output = `\x1b[2J\x1b[H`;
    output += `\x1b[32m[Fuel Price: \x1b[33;1m${character.portOwnership.fuelPrice}\x1b[0m\x1b[32m]\x1b[0m - Set Fuel Unit Price...\x1b[33m[Q]uits\x1b[0m\r\n\r\n`;
    output += `New Fuel Price: (0-50): `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const trimmed = input.trim();

    if (!trimmed || trimmed.toUpperCase() === 'Q') {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'fuel-depot' };
    }

    // SP.REAL.txt line 185: if len(i$)>2 print ro$:goto fuel
    if (trimmed.length > 2) {
      return { output: '\r\n\x1b[31mInvalid input.\x1b[0m\r\n> ' };
    }

    const price = parseInt(trimmed, 10);
    if (isNaN(price)) {
      return { output: '\r\n\x1b[31mInvalid input.\x1b[0m\r\n> ' };
    }

    const result = validateDepotPrice(price);
    if (!result.success) {
      return { output: `\r\n\x1b[31m${result.message}\x1b[0m\r\n> ` };
    }

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { portOwnership: true },
    });

    if (!character?.portOwnership) {
      return { output: '\x1b[31mNot a port owner!\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    await prisma.portOwnership.update({
      where: { id: character.portOwnership.id },
      data: { fuelPrice: result.newPrice },
    });

    return {
      output: `\x1b[2J\x1b[H\x1b[32m${result.message}\x1b[0m\r\n`,
      nextScreen: 'fuel-depot',
    };
  },
};
