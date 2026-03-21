/**
 * SpacerQuest v4.0 - Port Fuel Prices Screen
 *
 * SP.START.S portf subroutine (lines 217-249):
 * Displays all 14 core systems with port owner name, alliance symbol,
 * fuel sell price, and fuel buy price.
 *
 * Original display format (per system):
 *   system_name  owner_name  alliance  buy_price  sell_price
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { getFuelPrice, getFuelSellPrice, getSystemName } from '../systems/economy.js';
import { getAllianceSymbol } from '../utils.js';
import { AllianceType } from '@prisma/client';

const CORE_SYSTEMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const PortFuelPricesScreen: ScreenModule = {
  name: 'port-fuel-prices',

  render: async (_characterId: string): Promise<ScreenResponse> => {
    // Fetch all port ownerships for core systems, including character data
    const ownerships = await prisma.portOwnership.findMany({
      where: { systemId: { in: CORE_SYSTEMS } },
      include: { character: { select: { name: true, allianceSymbol: true } } },
    });

    // Build a lookup map by systemId
    const ownerMap = new Map(ownerships.map(o => [o.systemId, o]));

    let output = '\x1b[2J\x1b[H';
    output += '\x1b[36;1m_________________________________________\x1b[0m\r\n';
    output += '\x1b[33;1m      PORT FUEL PRICES                   \x1b[0m\r\n';
    output += '\x1b[36;1m_________________________________________\x1b[0m\r\n\r\n';

    // Header
    output += `  ${'System'.padEnd(12)} ${'Owner'.padEnd(14)} ${'A'.padEnd(2)} ${'Buy'.padStart(4)} ${'Sell'.padStart(4)}\r\n`;
    output += `  \x1b[36m${'-'.repeat(42)}\x1b[0m\r\n`;

    for (const sysId of CORE_SYSTEMS) {
      const sysName = getSystemName(sysId).padEnd(12);
      const port = ownerMap.get(sysId);

      let ownerName: string;
      let allianceSym: string;
      let buyPrice: number;
      let sellPrice: number;

      if (port) {
        ownerName = port.character.name.substring(0, 13).padEnd(14);
        allianceSym = getAllianceSymbol(port.character.allianceSymbol as AllianceType) || ' ';
        buyPrice = getFuelPrice(sysId, port.fuelPrice);
        sellPrice = getFuelSellPrice(sysId, Math.floor(port.fuelPrice / 2) || null);
      } else {
        ownerName = 'Space Authority'.padEnd(14);
        allianceSym = ' ';
        buyPrice = getFuelPrice(sysId);
        sellPrice = getFuelSellPrice(sysId);
      }

      output += `  ${sysName} ${ownerName} ${allianceSym.padEnd(2)} ${String(buyPrice).padStart(4)} ${String(sellPrice).padStart(4)}\r\n`;
    }

    output += '\r\n\x1b[32mPress any key to return...\x1b[0m\r\n> ';
    return { output };
  },

  handleInput: async (_characterId: string, _input: string): Promise<ScreenResponse> => {
    return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
  },
};
