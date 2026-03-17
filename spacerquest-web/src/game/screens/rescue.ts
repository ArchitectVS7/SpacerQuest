/**
 * SpacerQuest v4.0 - Rescue Service Screen (SP.REG.S)
 *
 * Terminal screen for the rescue service
 * Lists lost ships and allows rescue attempts
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { renderRescueScreen } from '../systems/rescue.js';

export const RescueScreen: ScreenModule = {
  name: 'rescue',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
    }

    // Get lost ships
    const lostShips = await prisma.character.findMany({
      where: { isLost: true },
      select: {
        id: true,
        name: true,
        shipName: true,
        lostLocation: true,
        updatedAt: true,
      },
    });

    const mapped = lostShips.map(s => ({
      id: s.id,
      name: s.name,
      shipName: s.shipName || 'unnamed',
      lostLocation: s.lostLocation || 0,
      lostAt: s.updatedAt,
    }));

    const output = renderRescueScreen(mapped, character.name);
    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    if (key === 'Q' || key === 'M') {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
    }

    // Try to parse as a number (rescue selection)
    const selection = parseInt(key, 10);
    if (isNaN(selection)) {
      return { output: '\r\n\x1b[31mInvalid input. Enter a number or Q to quit.\x1b[0m\r\n> ' };
    }

    // Get lost ships again
    const lostShips = await prisma.character.findMany({
      where: { isLost: true },
      select: { id: true, name: true, lostLocation: true },
    });

    if (selection < 1 || selection > lostShips.length) {
      return { output: '\r\n\x1b[31mInvalid selection.\x1b[0m\r\n> ' };
    }

    const target = lostShips[selection - 1];

    return {
      output: `\r\n\x1b[33m${target.name} is lost near system ${target.lostLocation}\x1b[0m\r\n` +
        `Do you wish to rescue their ship? Use: POST /api/economy/rescue { targetId: "${target.id}" }\r\n> `,
    };
  },
};
