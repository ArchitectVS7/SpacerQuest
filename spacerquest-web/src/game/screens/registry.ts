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

        return { output: output + '\r\nEnter spacer ID to view record, or [Q]uit: ' };
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
        // Try to parse as spacer ID for record lookup
        const id = parseInt(key, 10);
        if (!isNaN(id)) {
          const spacer = await prisma.character.findFirst({
            where: { spacerId: id },
            include: { ship: true },
          });

          if (spacer && spacer.ship) {
            const record = {
              spacerId: spacer.spacerId,
              name: spacer.name,
              shipName: spacer.shipName,
              rank: spacer.rank,
              allianceSymbol: spacer.allianceSymbol,
              currentSystem: spacer.currentSystem,
              destination: spacer.destination,
              score: spacer.score,
              tripsCompleted: spacer.tripsCompleted,
              astrecsTraveled: spacer.astrecsTraveled,
              cargoDelivered: spacer.cargoDelivered,
              battlesWon: spacer.battlesWon,
              battlesLost: spacer.battlesLost,
              rescuesPerformed: spacer.rescuesPerformed,
              ship: {
                hullStrength: spacer.ship.hullStrength,
                hullCondition: spacer.ship.hullCondition,
                driveStrength: spacer.ship.driveStrength,
                driveCondition: spacer.ship.driveCondition,
                cabinStrength: spacer.ship.cabinStrength,
                cabinCondition: spacer.ship.cabinCondition,
                lifeSupportStrength: spacer.ship.lifeSupportStrength,
                lifeSupportCondition: spacer.ship.lifeSupportCondition,
                weaponStrength: spacer.ship.weaponStrength,
                weaponCondition: spacer.ship.weaponCondition,
                navigationStrength: spacer.ship.navigationStrength,
                navigationCondition: spacer.ship.navigationCondition,
                roboticsStrength: spacer.ship.roboticsStrength,
                roboticsCondition: spacer.ship.roboticsCondition,
                shieldStrength: spacer.ship.shieldStrength,
                shieldCondition: spacer.ship.shieldCondition,
                fuel: spacer.ship.fuel,
                hasCloaker: spacer.ship.hasCloaker,
                hasAutoRepair: spacer.ship.hasAutoRepair,
                isAstraxialHull: spacer.ship.isAstraxialHull,
              },
            };

            return {
              output: renderSpacerRecord(record) + '\r\n\x1b[32m[Space Registry]:Command:\x1b[0m ',
            };
          }

          return { output: '\r\n\x1b[31mSpacer not found.\x1b[0m\r\n\x1b[32m[Space Registry]:Command:\x1b[0m ' };
        }

        return { output: '\r\n\x1b[31mInvalid command. Press R, L, A, or Q.\x1b[0m\r\n\x1b[32m[Space Registry]:Command:\x1b[0m ' };
      }
    }
  },
};
