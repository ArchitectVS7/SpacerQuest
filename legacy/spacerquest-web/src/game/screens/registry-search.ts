import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { renderSpacerRecord } from '../systems/registry.js';

export const RegistrySearchScreen: ScreenModule = {
  name: 'registry-search',
  render: async (characterId: string): Promise<ScreenResponse> => {
    return { output: '' };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();
    if (key === 'Q' || key === 'M' || key === '') {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'registry' };
    }

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
          nextScreen: 'registry'
        };
      }

      return { output: '\r\n\x1b[31mSpacer not found.\x1b[0m\r\n\x1b[32m[Space Registry]:Command:\x1b[0m ', nextScreen: 'registry' };
    }

    return { output: '\r\n\x1b[31mInvalid ID.\x1b[0m\r\n\x1b[32m[Space Registry]:Command:\x1b[0m ', nextScreen: 'registry' };
  }
};
