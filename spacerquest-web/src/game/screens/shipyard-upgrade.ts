import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { upgradeShipComponent } from '../systems/upgrades.js';

export const ShipyardUpgradeScreen: ScreenModule = {
  name: 'shipyard-upgrade',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({ 
      where: { id: characterId },
      include: { ship: true }
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: No ship found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m      COMPONENT UPGRADE                   \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

Select a component to upgrade:
  [1] Hull
  [2] Drives
  [3] Cabin
  [4] Life Support
  [5] Weapons
  [6] Navigation
  [7] Robotics
  [8] Shields

  [0] Cancel

Enter number:
\x1b[32m:\x1b[0m${character.currentSystem} Shipyard Upgrade:\x1b[32m: Component:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim();
    
    if (key === '0' || !key) {
      return { output: '\x1b[2J\x1b[H\x1b[33mUpgrade cancelled.\x1b[0m\r\n', nextScreen: 'shipyard' };
    }

    const componentMap: Record<string, string> = {
      '1': 'HULL',
      '2': 'DRIVES',
      '3': 'CABIN',
      '4': 'LIFE_SUPPORT',
      '5': 'WEAPONS',
      '6': 'NAVIGATION',
      '7': 'ROBOTICS',
      '8': 'SHIELDS',
    };

    const component = componentMap[key];
    if (!component) {
      return { output: '\r\n\x1b[31mInvalid component selection.\x1b[0m\r\n> ' };
    }

    // Default to upgrading STRENGTH for now, to keep it simple and match typical BBS games
    // A more advanced version would ask STRENGTH vs CONDITION
    const result = await upgradeShipComponent(characterId, component, 'STRENGTH');

    if (!result.success) {
      return { output: `\r\n\x1b[31mUpgrade failed: ${result.error}\x1b[0m\r\n> ` };
    }

    return { 
      output: `\x1b[2J\x1b[H\x1b[32m${component} upgraded successfully! (-${result.cost} cr)\x1b[0m\r\n`, 
      nextScreen: 'shipyard' 
    };
  }
};
