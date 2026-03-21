/**
 * SpacerQuest v4.0 - Fuel Depot Menu Screen
 *
 * SP.REAL.txt lines 168-180: Port owner fuel depot hub.
 * Commands: (P)rice, (T)ransfer, (B)uy, [Q]uit
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import { getSystemName } from '../systems/economy.js';
import { FUEL_MAX_CAPACITY } from '../constants.js';

export const FuelDepotScreen: ScreenModule = {
  name: 'fuel-depot',

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
    const portName = getSystemName(port.systemId);
    const stored = Math.min(port.fuelStored, FUEL_MAX_CAPACITY);
    const credits = formatCredits(character.creditsHigh, character.creditsLow);

    // SP.REAL.txt line 170-174:
    //   print\m4$" Fuel Depot: "m9" units____Selling Price: "m5" cr per unit"
    //   gosub crfix
    //   print\"[Cr:"g$":]=[F:"f1"] FUEL: (P)rice  (T)ransfer  (B)uy [Q]uit: ";
    let output = `\x1b[2J\x1b[H`;
    output += `\x1b[36;1m_________________________________________\x1b[0m\r\n`;
    output += `\x1b[33;1m      FUEL DEPOT                          \x1b[0m\r\n`;
    output += `\x1b[36;1m_________________________________________\x1b[0m\r\n\r\n`;
    output += `\x1b[33m${portName}\x1b[0m Fuel Depot: \x1b[32m${stored}\x1b[0m units    Selling Price: \x1b[32m${port.fuelPrice}\x1b[0m cr per unit\r\n`;
    output += `\x1b[32m[Cr:\x1b[0m${credits}\x1b[32m:]=[F:\x1b[0m${character.ship.fuel}\x1b[32m]\x1b[0m`;

    if (stored >= FUEL_MAX_CAPACITY) {
      output += ` \x1b[31m20K limit\x1b[0m`;
    }

    output += `\r\n\r\n`;
    output += `  (P)rice     - Set fuel selling price\r\n`;
    output += `  (T)ransfer  - Transfer fuel from ship\r\n`;
    output += `  (B)uy       - Buy fuel wholesale\r\n`;
    output += `  [Q]uit      - Return to main menu\r\n\r\n`;
    output += `\x1b[32m:\x1b[0m${character.currentSystem} Fuel Depot:\x1b[32m: Command:\x1b[0m\r\n> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    if (!key || key === 'Q') {
      return { output: '\x1b[33mLeaving\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    // Need port ownership data to check 20K limit
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { portOwnership: true },
    });

    if (!character?.portOwnership) {
      return { output: '\x1b[31mNot a port owner!\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const stored = character.portOwnership.fuelStored;

    if (key === 'P') {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'fuel-depot-price' };
    }

    // SP.REAL.txt line 176: if m9>19999 print"20K limit":goto fuel
    if (key === 'T') {
      if (stored >= FUEL_MAX_CAPACITY) {
        return { output: '\r\n\x1b[31m20K limit\x1b[0m\r\n> ' };
      }
      return { output: '\x1b[2J\x1b[H', nextScreen: 'fuel-depot-transfer' };
    }

    if (key === 'B') {
      if (stored >= FUEL_MAX_CAPACITY) {
        return { output: '\r\n\x1b[31m20K limit\x1b[0m\r\n> ' };
      }
      return { output: '\x1b[2J\x1b[H', nextScreen: 'fuel-depot-buy' };
    }

    return { output: '\r\n\x1b[31m...Whoops...\x1b[0m\r\n> ' };
  },
};
