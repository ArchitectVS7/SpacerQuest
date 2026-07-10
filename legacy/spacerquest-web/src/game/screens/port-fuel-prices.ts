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

    // SP.START.S portf: fetch fuelStored from portOwnership
    const fuelStoredMap = new Map(ownerships.map(o => [o.systemId, o.fuelStored]));

    let output = '\x1b[2J\x1b[H';
    output += '\x1b[36;1m_________________________________________\x1b[0m\r\n';
    output += '\x1b[33;1m      PORT FUEL PRICES                   \x1b[0m\r\n';
    output += '\x1b[36;1m_________________________________________\x1b[0m\r\n\r\n';

    // SP.START.S portf header (original format)
    output += ` #   Port               Owner                  A  Fuel  Sell  Buy\r\n`;
    output += `--   ----------------   --------------------   -  ----  ----  ---\r\n`;

    for (const sysId of CORE_SYSTEMS) {
      const port = ownerMap.get(sysId);
      const sysName = getSystemName(sysId).padEnd(16).slice(0, 16);
      const sysNum = String(sysId).padStart(2);

      let ownerName: string;
      let allianceSym: string;
      let sellStr: string;  // sell TO player (m5)
      let buyStr: string;   // buy FROM player (m5/2)
      let fuelStr: string;

      if (port) {
        ownerName = port.character.name.substring(0, 20).padEnd(20);
        allianceSym = getAllianceSymbol(port.character.allianceSymbol as AllianceType) || '_';
        const sell = port.fuelPrice;
        const buy = Math.floor(port.fuelPrice / 2);
        sellStr = sell > 0 ? String(sell).padStart(4) : '   ?';
        buyStr = buy > 0 ? String(buy).padStart(3) : '  ?';
        fuelStr = String(fuelStoredMap.get(sysId) ?? 0).padStart(4);
      } else {
        // SP.START.S: if m5$="" lo$="_____(for sale)_____"
        ownerName = '(for sale)'.padEnd(20);
        allianceSym = '_';
        sellStr = '   ?';
        buyStr = '  ?';
        fuelStr = '3000';  // default (new port)
      }

      output += `${sysNum}   ${sysName}   ${ownerName}   ${allianceSym}  ${fuelStr}  ${sellStr}  ${buyStr}\r\n`;
    }

    output += '\r\n\x1b[32mPress any key to return...\x1b[0m\r\n> ';
    return { output };
  },

  handleInput: async (_characterId: string, _input: string): Promise<ScreenResponse> => {
    return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
  },
};
