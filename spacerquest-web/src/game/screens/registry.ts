/**
 * SpacerQuest v4.0 - Registry Screen (SP.REG.S)
 *
 * Terminal screen for the Space Registry / Directory
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import {
  renderRegistryHeader,
  renderSpacerRecord,
  renderSpacerDirectory,
  renderAllianceDirectory,
} from '../systems/registry.js';

export const RegistryScreen: ScreenModule = {
  name: 'registry',
  render: async (_characterId: string): Promise<ScreenResponse> => {
    return { output: renderRegistryHeader() };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    switch (key) {
      case 'Q':
      case 'M':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };

      case 'R': {
        // Show directory first so player can pick a spacer
        const spacers = await prisma.character.findMany({
          select: {
            spacerId: true, name: true, shipName: true,
            rank: true, allianceSymbol: true, score: true,
          },
          orderBy: { score: 'desc' },
          take: 50,
        });

        const output = renderSpacerDirectory(spacers.map(s => ({
          spacerId: s.spacerId,
          name: s.name,
          shipName: s.shipName,
          rank: s.rank,
          allianceSymbol: s.allianceSymbol,
          score: s.score,
        })));

        return { output: output + '\r\nEnter spacer ID to view record, or [Q]uit: ', nextScreen: 'registry-search' };
      }

      case 'L':
        return {
          output: '\r\n\x1b[33;1m=== LIBRARY ===\x1b[0m\r\n' +
            '\r\nSpacerQuest v4.0 - Web Museum Edition\r\n' +
            'Original game by 1991 Apple II BBS\r\n' +
            '\r\nCommands: Navigate systems, trade cargo,\r\n' +
            'upgrade your ship, battle pirates,\r\n' +
            'join alliances, and explore the galaxy.\r\n' +
            '\r\n\x1b[32m[Space Registry]:Command:\x1b[0m ',
        };

      case 'A': {
        const spacers = await prisma.character.findMany({
          select: {
            spacerId: true, name: true, shipName: true,
            rank: true, allianceSymbol: true, score: true,
          },
          orderBy: { score: 'desc' },
        });

        const output = renderAllianceDirectory(spacers.map(s => ({
          spacerId: s.spacerId,
          name: s.name,
          shipName: s.shipName,
          rank: s.rank,
          allianceSymbol: s.allianceSymbol,
          score: s.score,
        })));

        return { output: output + '\r\n\x1b[32m[Space Registry]:Command:\x1b[0m ' };
      }

      default: {
        return { output: '\r\n\x1b[31mInvalid command. Press R, L, A, or Q.\x1b[0m\r\n\x1b[32m[Space Registry]:Command:\x1b[0m ' };
      }
    }
  },
};
