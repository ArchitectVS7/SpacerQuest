import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { generateCargoContract } from '../systems/economy.js';

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

    // Generate a contract proposal
    const contract = generateCargoContract(character.currentSystem, maxCargo, false);
    
    // Store proposal in cache/db or just pass it in output state
    // For BBS simplicity, we can just save it to character directly when accepted
    // Wait, we need to know what they are accepting. We can securely regenerate or store it.
    // For now, we will save the proposed contract fields to the character's missionType temporarily
    // Or just store it via a unique id. Let's just generate and assume they accept the random one right away.
    // Actually, in SpacerQuest, it's just a direct choice: "We have X pods bound for Y for Z cr. Accept? Y/N"

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

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m      CARGO CONTRACT PROPOSAL             \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

The trader looks over your ship and offers a deal:

\x1b[32mCargo:\x1b[0m ${contract.pods} pods of ${contract.description}
\x1b[32mDestination:\x1b[0m System ${contract.destination}
\x1b[32mPayment:\x1b[0m ${contract.payment} cr upon delivery

Accept this contract? (Y/N)
\x1b[32m:\x1b[0m${character.currentSystem} Cargo Contract:\x1b[32m: Command:\x1b[0m
> `;

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
