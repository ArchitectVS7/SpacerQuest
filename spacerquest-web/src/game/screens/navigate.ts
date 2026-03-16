import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { validateLaunch, startTravel } from '../systems/travel.js';

export const NavigateScreen: ScreenModule = {
  name: 'navigate',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({ 
      where: { id: characterId },
      include: { ship: true }
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m      NAVIGATION CONTROL                   \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[32mCurrent Location:\x1b[0m System ${character.currentSystem}
\x1b[32mFuel Remaining:\x1b[0m ${character.ship?.fuel || 0} units

Enter destination system ID to travel to.
Or enter 0 or leave blank to abort.

\x1b[32m:\x1b[0m${character.currentSystem} Navigation:\x1b[32m: Destination System ID:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const destStr = input.trim().toUpperCase();
    
    if (!destStr || destStr === '0' || destStr === 'M' || destStr === 'Q' || destStr === 'ABORT') {
      return { output: '\x1b[2J\x1b[H\x1b[33mNavigation aborted.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const destinationSystemId = parseInt(destStr, 10);
    if (isNaN(destinationSystemId) || destinationSystemId < 1) {
      return { output: '\r\n\x1b[31mInvalid system ID. Please enter a valid number or M to return to Main Menu.\x1b[0m\r\n> ' };
    }

    const character = await prisma.character.findUnique({
      where: { id: characterId }
    });

    if (!character) {
        return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    if (character.currentSystem === destinationSystemId) {
        return { output: '\r\n\x1b[33mYou are already in system ' + destinationSystemId + '.\x1b[0m\r\n> ' };
    }

    const validation = await validateLaunch(characterId, destinationSystemId);
    
    if (!validation.valid) {
        return { 
            output: '\r\n\x1b[31mLaunch Aborted!\x1b[0m\r\n' + validation.errors.map(e => `  - ${e}`).join('\r\n') + '\r\n\r\nPress Enter to return to Main Menu.', 
            nextScreen: 'main-menu' 
        };
    }

    // Attempt launch
    try {
        await startTravel(characterId, character.currentSystem, destinationSystemId, validation.fuelRequired || 0);
        return {
            output: `\r\n\x1b[36;1mENGAGING DRIVES...\x1b[0m\r\n\x1b[32mCourse laid for System ${destinationSystemId}.\x1b[0m\r\n\x1b[33mFuel consumed: ${validation.fuelRequired}\x1b[0m\r\n\r\n\x1b[32mYou are now in transit. Check tracking systems.\x1b[0m\r\n`,
            nextScreen: 'main-menu'
        };
    } catch (err) {
        return { output: '\r\n\x1b[31mSystem Error during launch sequence.\x1b[0m\r\n> ' };
    }
  }
};
