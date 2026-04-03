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
import { FUEL_MAX_CAPACITY, CORE_SYSTEM_NAMES, CORE_SYSTEMS } from '../constants.js';

// SP.REAL.S port section: M key stock report — pending ratio input
const pendingStockRatio = new Map<string, boolean>();

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
    output += `  (M)arket    - Space port stock activity report\r\n`;
    output += `  (N)ews      - Port fee collection report\r\n`;
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
      // SP.REAL.S fuel subroutine line 175: "if i$='Q' goto start1"
      return { output: '\x1b[33mLeaving\x1b[0m\r\n', nextScreen: 'port-accounts' };
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

    // SP.REAL.S port section: ratio input for stock report
    if (pendingStockRatio.has(characterId)) {
      pendingStockRatio.delete(characterId);
      const raw = input.trim();
      if (raw === '' || raw.toUpperCase() === 'Q') {
        return FuelDepotScreen.render(characterId);
      }
      const ratio = parseInt(raw, 10);
      if (isNaN(ratio) || ratio < 1 || ratio > 100) {
        return { output: '\r\n\x1b[31m...Enter 1-100...\x1b[0m\r\nInput number: (Q)uits: ' };
      }
      return renderStockReport(ratio);
    }

    // SP.REAL.S start1 line 47: "if i$='N' print 'Fee Report': copy'sp.fee': goto start1"
    // Modern: query GameLog PORT_FEE entries for this port's system
    if (key === 'N') {
      return renderFeeReport(character.portOwnership.systemId);
    }

    // SP.REAL.S start1 line 46: "if i$='M' print 'Stock Report': goto port"
    if (key === 'M') {
      pendingStockRatio.set(characterId, true);
      return {
        output:
          '\r\n\x1b[37;1m-------------------------\x1b[0m\r\n' +
          'Space Port Stock Activity\r\n' +
          '\x1b[37;1m-------------------------\x1b[0m\r\n' +
          'Choose a projection ratio: [1-100] (<C-R>=1:1)\r\n' +
          'Input number: (Q)uits: ',
      };
    }

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

// ============================================================================
// SP.REAL.S start1 N key — Fee Report (copy"sp.fee")
// Original: sp.fee is a BBS file appended to on each spacer launch at the port.
// Modern: query GameLog PORT_FEE entries for the port's system.
// ============================================================================

async function renderFeeReport(systemId: number): Promise<ScreenResponse> {
  const systemName = CORE_SYSTEM_NAMES[systemId] || `System ${systemId}`;

  const fees = await prisma.gameLog.findMany({
    where: { type: 'PORT_FEE', systemId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { character: { select: { name: true, shipName: true } } },
  });

  let out = '\r\n';
  out += '\x1b[37m-------------------------------------------------------------------------------\x1b[0m\r\n';
  out += `Space Port Collected Fees List for: \x1b[33m${systemName}\x1b[0m\r\n`;
  out += '\x1b[37m-------------------------------------------------------------------------------\x1b[0m\r\n';

  if (fees.length === 0) {
    out += 'No fees collected yet.\r\n';
  } else {
    for (const entry of fees) {
      const date = entry.createdAt.toISOString().slice(0, 10);
      const name = entry.character?.name ?? 'Unknown';
      const ship = entry.character?.shipName ?? '';
      const meta = entry.metadata as Record<string, any> | null;
      const fee = meta?.fee ?? 0;
      const nameShip = ship ? `${name}/${ship}` : name;
      out += `${date}: ${nameShip.padEnd(34)} - Fee Paid: ${fee} cr\r\n`;
    }
  }

  out += '\x1b[37m-------------------------------------------------------------------------------\x1b[0m\r\n';
  out += `\x1b[32m> \x1b[0m`;
  return { output: out };
}

// ============================================================================
// SP.REAL.S port: / prtr: — Space Port Stock Activity bar chart
// Original: reads sp.stk (i, y per system); bar = scaled by ratio a; max 60 chars
// Modern: queries GameLog for DOCK events grouped by systemId
// ============================================================================

async function renderStockReport(ratio: number): Promise<ScreenResponse> {
  // Count DOCK arrivals per system from GameLog
  const logs = await prisma.gameLog.findMany({
    where: { type: 'SYSTEM', metadata: { path: ['event'], equals: 'DOCK' } },
    select: { metadata: true },
  });

  // Tally per-system trip counts
  const counts: Record<number, number> = {};
  for (let i = 1; i <= CORE_SYSTEMS; i++) counts[i] = 0;
  for (const log of logs) {
    const meta = log.metadata as Record<string, any> | null;
    const sid = meta?.systemId as number | undefined;
    if (sid && sid >= 1 && sid <= CORE_SYSTEMS) {
      counts[sid] = (counts[sid] || 0) + 1;
    }
  }

  let out =
    `\r\n\x1b[37;1m  Projection Ratio = ${ratio}:1\x1b[0m\r\n\r\n` +
    `  Space_Port_____Trips`;
  out += `____.____|____.____|____.____|____.____|____.____|____.____|__\r\n`;

  for (let x = 1; x <= CORE_SYSTEMS; x++) {
    const y = counts[x] || 0;
    const name = (CORE_SYSTEM_NAMES[x] || `System ${x}`).padEnd(13).slice(0, 13);
    // SP.REAL.S prtr: a$=a$+right$("____"+str$(y),5)
    const tripStr = ('____' + y).slice(-5);
    // SP.REAL.S: if y>=a iz=floor(y/a); if y<a iz=0; if iz>60 iz=60
    const iz = y >= ratio ? Math.min(Math.floor(y / ratio), 60) : 0;
    const bar = '_'.repeat(iz);
    out += `  ${name}${tripStr}${bar}\r\n`;
  }

  out += `\r\n\x1b[37;1m....type anykey to go on....\x1b[0m\r\n> `;
  return { output: out };
}
