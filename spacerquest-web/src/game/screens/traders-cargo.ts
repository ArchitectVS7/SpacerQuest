import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { generateCargoContract, getSystemName } from '../systems/economy.js';

export const TradersCargoScreen: ScreenModule = {
  name: 'traders-cargo',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({ 
      where: { id: characterId },
      include: { ship: true }
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: No ship found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    if (character.cargoPods > 0) {
      return { 
        output: '\x1b[2J\x1b[H\x1b[31mYou already have active cargo. Deliver it or dump it first!\x1b[0m\r\n', 
        nextScreen: 'traders' 
      };
    }

    const maxCargo = character.ship.maxCargoPods;
    if (maxCargo <= 0) {
      return { 
        output: '\x1b[2J\x1b[H\x1b[31mYour ship has no cargo space. Upgrade your cabin first.\x1b[0m\r\n', 
        nextScreen: 'traders' 
      };
    }

    // Generate a contract proposal using the original payment formula
    const contract = generateCargoContract(character.currentSystem, maxCargo, false, {
      hullCondition: character.ship.hullCondition,
      driveStrength: character.ship.driveStrength,
      driveCondition: character.ship.driveCondition,
    });

    await prisma.character.update({
        where: { id: characterId },
        data: {
            missionType: 99, // 99 represents "contract pending"
            destination: contract.destination,
            cargoPayment: contract.payment,
            cargoType: contract.cargoType,
            cargoPods: contract.pods,
        }
    });

    const destName = getSystemName(contract.destination);
    const originName = getSystemName(character.currentSystem);
    const output = `
\x1b[36;1m-------------------------------------\x1b[0m
\x1b[33;1m   [:  $$$-=:[ Legal Contract ]:=-$$$ :]\x1b[0m
\x1b[36;1m-------------------------------------\x1b[0m

   Cargo         : ${contract.description}
   Value         : ${contract.valuePerPod} cr per pod
   Number of Pods: ${contract.pods}
   Origin        : ${originName}
   Destination   : ${destName}
   Fuel Required : ${contract.fuelRequired} units
   Distance      : ${contract.distance} Astrec(s)
   Pay           : ${contract.payment} cr

Sign the contract? [Y]/(N): `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();
    
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true }
    });

    if (!character || character.missionType !== 99) {
        return { output: '\x1b[2J\x1b[H\x1b[31mContract expired.\x1b[0m\r\n', nextScreen: 'traders' };
    }

    if (key === 'Y') {
        // Accept
        await prisma.character.update({
            where: { id: characterId },
            data: {
                missionType: 1, // Active cargo contract
            }
        });
        // Also take up the cargo space on the ship
        if (character.ship) {
            await prisma.ship.update({
                where: { id: character.ship.id },
                data: { cargoPods: character.cargoPods }
            });
        }
        return { output: '\x1b[2J\x1b[H\x1b[32mContract accepted! Cargo loaded.\x1b[0m\r\n', nextScreen: 'traders' };
    } 

    if (key === 'N') {
        // Reject
        await prisma.character.update({
            where: { id: characterId },
            data: {
                missionType: 0,
                destination: 0,
                cargoPayment: 0,
                cargoType: 0,
                cargoPods: 0,
            }
        });
        return { output: '\x1b[2J\x1b[H\x1b[33mContract rejected.\x1b[0m\r\n', nextScreen: 'traders' };
    }

    return { output: '\r\n\x1b[31mInvalid input. Enter Y or N.\x1b[0m\r\n> ' };
  }
};
