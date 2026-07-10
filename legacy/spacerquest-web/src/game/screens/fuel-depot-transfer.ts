/**
 * SpacerQuest v4.0 - Fuel Depot: Transfer from Ship Screen
 *
 * SP.REAL.txt lines 217-230: Transfer fuel from docked ship to depot storage.
 * Requires ship to be at the same system as the depot.
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { getSystemName, calculateDepotTransfer } from '../systems/economy.js';
import { FUEL_MAX_CAPACITY, FUEL_DEPOT_TRANSFER_MAX } from '../constants.js';

export const FuelDepotTransferScreen: ScreenModule = {
  name: 'fuel-depot-transfer',

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

    // SP.REAL.txt lines 218-219: if sp$=m4$ goto trn / print nz$" must be in same space port"
    if (character.currentSystem !== port.systemId) {
      const portName = getSystemName(port.systemId);
      return {
        output: `\x1b[2J\x1b[H\x1b[31m${character.shipName} must be in same space port as your fuel depot (${portName})\x1b[0m\r\n`,
        nextScreen: 'fuel-depot',
      };
    }

    const maxTransfer = Math.min(character.ship.fuel, FUEL_DEPOT_TRANSFER_MAX, FUEL_MAX_CAPACITY - port.fuelStored);

    // SP.REAL.txt lines 221-223:
    //   print\"[Storage:"m9"] Transfer fuel from "nz$"...[Q]uits"
    //   print\"[F:"f1":] : How much? (0-"f1"): ";
    let output = `\x1b[2J\x1b[H`;
    output += `\x1b[32m[Storage:\x1b[0m${port.fuelStored}\x1b[32m]\x1b[0m Transfer fuel from \x1b[33m${character.shipName}\x1b[0m...\x1b[33m[Q]uits\x1b[0m\r\n\r\n`;
    output += `\x1b[32m[F:\x1b[0m${character.ship.fuel}\x1b[32m:]\x1b[0m : How much? (0-${maxTransfer}): `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const trimmed = input.trim();

    if (!trimmed || trimmed === '0' || trimmed.toUpperCase() === 'Q') {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'fuel-depot' };
    }

    // SP.REAL.txt line 224: if len(i$)>4 print ro$
    if (trimmed.length > 4) {
      return { output: '\r\n\x1b[31mInvalid amount.\x1b[0m\r\n> ' };
    }

    const units = parseInt(trimmed, 10);
    if (isNaN(units) || units <= 0) {
      return { output: '\r\n\x1b[31mInvalid amount.\x1b[0m\r\n> ' };
    }

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true, portOwnership: true },
    });

    if (!character || !character.ship || !character.portOwnership) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const port = character.portOwnership;

    // Re-check docking constraint
    if (character.currentSystem !== port.systemId) {
      return {
        output: '\r\n\x1b[31mYou must be docked at your port to transfer fuel.\x1b[0m\r\n',
        nextScreen: 'fuel-depot',
      };
    }

    const result = calculateDepotTransfer(units, character.ship.fuel, port.fuelStored);

    if (!result.success) {
      return { output: `\r\n\x1b[31m${result.message}\x1b[0m\r\n> ` };
    }

    const portName = getSystemName(port.systemId);

    // SP.REAL.txt lines 227-229: update ship fuel and depot storage
    await prisma.$transaction([
      prisma.ship.update({
        where: { id: character.ship.id },
        data: { fuel: result.newShipFuel },
      }),
      prisma.portOwnership.update({
        where: { id: port.id },
        data: { fuelStored: result.newFuelStored },
      }),
    ]);

    // SP.REAL.txt lines 228-229:
    //   print\i" units of Fuel transferred from "nz$" to Main Port Storage."
    //   print i" units of Fuel transferred from Main Port Storage to "m4$
    return {
      output: `\x1b[2J\x1b[H\x1b[32m${units} units of Fuel transferred from ${character.shipName} to Main Port Storage.\r\n${units} units of Fuel transferred from Main Port Storage to ${portName}\x1b[0m\r\n`,
      nextScreen: 'fuel-depot',
    };
  },
};
