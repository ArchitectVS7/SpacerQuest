/**
 * SpacerQuest v4.0 - Character Registry System (SP.REG.S)
 */

import { prisma } from '../../db/prisma.js';
import { validateName, addCredits } from '../utils.js';
import { RANK_HONORARIA } from '../constants.js';

export async function registerCharacter(userId: string, name: string, shipName: string) {
  const nameValidation = validateName(name);
  if (!nameValidation.valid) {
    return { success: false, error: nameValidation.error };
  }

  const shipValidation = validateName(shipName);
  if (!shipValidation.valid) {
    return { success: false, error: `Ship name: ${shipValidation.error}` };
  }

  const existing = await prisma.character.findFirst({ where: { userId } });
  if (existing) {
    return { success: false, error: 'Character already exists' };
  }

  // Source: characters start at 0 cr, then receive Lieutenant honorarium (a=1, g1=g1+a → 10,000 cr)
  // Fire the promotion at creation to match source behavior (promo fires on first session entry)
  const startingCredits = addCredits(0, 0, RANK_HONORARIA.LIEUTENANT);

  const character = await prisma.character.create({
    data: {
      userId,
      name,
      shipName,
      creditsHigh: startingCredits.high,
      creditsLow: startingCredits.low,
      currentSystem: 1, // Sun-3
    },
  });
  
  await prisma.ship.create({
    data: {
      characterId: character.id,
      hullStrength: 5, hullCondition: 9,
      driveStrength: 5, driveCondition: 9,
      cabinStrength: 1, cabinCondition: 9,
      lifeSupportStrength: 5, lifeSupportCondition: 9,
      weaponStrength: 1, weaponCondition: 9,
      navigationStrength: 5, navigationCondition: 9,
      roboticsStrength: 1, roboticsCondition: 9,
      shieldStrength: 1, shieldCondition: 9,
      fuel: 50, cargoPods: 0, maxCargoPods: 1,
    },
  });
  
  await prisma.gameLog.create({
    data: {
      type: 'SYSTEM',
      characterId: character.id,
      message: `New spacer created: ${name} of the ship ${shipName}`,
    },
  });
  
  return { success: true, character };
}

// ============================================================================
// TYPES FOR DIRECTORY/RECORD RENDERING
// ============================================================================

export interface SpacerRecord {
  spacerId: number;
  name: string;
  shipName: string | null;
  rank: string;
  allianceSymbol: string;
  currentSystem: number;
  destination: number;
  score: number;
  tripsCompleted: number;
  astrecsTraveled: number;
  cargoDelivered: number;
  battlesWon: number;
  battlesLost: number;
  rescuesPerformed: number;
  ship: {
    hullStrength: number;
    hullCondition: number;
    driveStrength: number;
    driveCondition: number;
    cabinStrength: number;
    cabinCondition: number;
    lifeSupportStrength: number;
    lifeSupportCondition: number;
    weaponStrength: number;
    weaponCondition: number;
    navigationStrength: number;
    navigationCondition: number;
    roboticsStrength: number;
    roboticsCondition: number;
    shieldStrength: number;
    shieldCondition: number;
    fuel: number;
    hasCloaker: boolean;
    hasAutoRepair: boolean;
    isAstraxialHull: boolean;
  };
}

export interface DirectoryEntry {
  spacerId: number;
  name: string;
  shipName: string | null;
  rank: string;
  allianceSymbol: string;
  score: number;
}

// Alliance name mapping
const ALLIANCE_NAMES: Record<string, { name: string; symbol: string }> = {
  ASTRO_LEAGUE: { name: 'Astro League', symbol: '+' },
  SPACE_DRAGONS: { name: 'Space Dragons', symbol: '@' },
  WARLORD_CONFED: { name: 'Warlord Confederation', symbol: '&' },
  REBEL_ALLIANCE: { name: 'Rebel Alliance', symbol: '^' },
};

// ============================================================================
// REGISTRY HEADER
// ============================================================================

/**
 * Render the Space Registry main menu header
 *
 * Original from SP.REG.S:
 *   Menu options: [R]ecord, [L]ibrary, [A]lliance, [Q]uit
 */
export function renderRegistryHeader(): string {
  let out = '';
  out += '\x1b[36;1m=========================================\x1b[0m\r\n';
  out += '\x1b[33;1m         SPACE REGISTRY                  \x1b[0m\r\n';
  out += '\x1b[36;1m=========================================\x1b[0m\r\n\r\n';
  out += '  [R]ecord  - View a spacer\'s record\r\n';
  out += '  [L]ibrary - Game information & help\r\n';
  out += '  [A]lliance Directory\r\n';
  out += '  [Q]uit    - Return to main menu\r\n';
  out += '\r\n\x1b[32m[Space Registry]:Command:\x1b[0m ';
  return out;
}

// ============================================================================
// SPACER RECORD
// ============================================================================

/**
 * Render a detailed spacer record
 *
 * Original from SP.REG.S displays:
 *   Spacer name, Ship Name, all 8 components with strength/condition,
 *   Origin, Destination, vital stats
 */
export function renderSpacerRecord(record: SpacerRecord): string {
  const s = record.ship;
  let out = '';

  out += '\x1b[36;1m-----------------------------------------\x1b[0m\r\n';
  out += `\x1b[33;1m  SPACER RECORD #${record.spacerId}\x1b[0m\r\n`;
  out += '\x1b[36;1m-----------------------------------------\x1b[0m\r\n';

  out += `  Name:       \x1b[37;1m${record.name}\x1b[0m\r\n`;
  out += `  Ship:       ${record.shipName || 'None'}\r\n`;
  out += `  Rank:       ${formatRank(record.rank)}\r\n`;
  out += `  Score:      ${record.score}\r\n`;
  out += `  Location:   System ${record.currentSystem}\r\n`;
  if (record.destination > 0) {
    out += `  Destination: System ${record.destination}\r\n`;
  }

  out += '\r\n\x1b[33m  --- Ship Components ---\x1b[0m\r\n';
  out += formatComponent('Hull', s.hullStrength, s.hullCondition);
  out += formatComponent('Drives', s.driveStrength, s.driveCondition);
  out += formatComponent('Cabin', s.cabinStrength, s.cabinCondition);
  out += formatComponent('Life Support', s.lifeSupportStrength, s.lifeSupportCondition);
  out += formatComponent('Weapons', s.weaponStrength, s.weaponCondition);
  out += formatComponent('Navigation', s.navigationStrength, s.navigationCondition);
  out += formatComponent('Robotics', s.roboticsStrength, s.roboticsCondition);
  out += formatComponent('Shields', s.shieldStrength, s.shieldCondition);

  out += `\r\n  Fuel:       ${s.fuel} units\r\n`;

  // Special equipment
  const equipment: string[] = [];
  if (s.hasCloaker) equipment.push('Cloaker');
  if (s.hasAutoRepair) equipment.push('Auto-Repair');
  if (s.isAstraxialHull) equipment.push('Astraxial Hull');
  if (equipment.length > 0) {
    out += `  Equipment:  ${equipment.join(', ')}\r\n`;
  }

  out += '\r\n\x1b[33m  --- Vital Stats ---\x1b[0m\r\n';
  out += `  Trips:      ${record.tripsCompleted}\r\n`;
  out += `  Astrecs:    ${record.astrecsTraveled}\r\n`;
  out += `  Cargo:      ${record.cargoDelivered}\r\n`;
  out += `  Battles Won: ${record.battlesWon}\r\n`;
  out += `  Battles Lost: ${record.battlesLost}\r\n`;
  out += `  Rescues:    ${record.rescuesPerformed}\r\n`;

  out += '\x1b[36;1m-----------------------------------------\x1b[0m\r\n';
  return out;
}

function formatComponent(name: string, strength: number, condition: number): string {
  const paddedName = (name + ':').padEnd(16);
  return `  ${paddedName} Str ${String(strength).padStart(3)} / Cond ${condition}\r\n`;
}

function formatRank(rank: string): string {
  return rank.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ============================================================================
// SPACER DIRECTORY
// ============================================================================

/**
 * Render the spacer directory listing
 *
 * Original from SP.REG.S:
 *   Lists all spacers with ID, name, ship, rank, alliance symbol
 */
export function renderSpacerDirectory(entries: DirectoryEntry[]): string {
  if (entries.length === 0) {
    return '\x1b[33mNo spacers registered.\x1b[0m\r\n';
  }

  let out = '';
  out += '\x1b[36;1m-----------------------------------------\x1b[0m\r\n';
  out += '\x1b[33;1m         SPACER DIRECTORY                \x1b[0m\r\n';
  out += '\x1b[36;1m-----------------------------------------\x1b[0m\r\n';
  out += `  ${'ID'.padEnd(5)} ${'Name'.padEnd(16)} ${'Ship'.padEnd(14)} ${'Rank'.padEnd(12)} A\r\n`;
  out += '\x1b[36m  ' + '-'.repeat(50) + '\x1b[0m\r\n';

  for (const entry of entries) {
    const allianceSym = getAllianceSym(entry.allianceSymbol);
    const rank = formatRank(entry.rank);
    out += `  ${String(entry.spacerId).padEnd(5)} `;
    out += `${(entry.name).padEnd(16)} `;
    out += `${(entry.shipName || '-').padEnd(14)} `;
    out += `${rank.padEnd(12)} `;
    out += `${allianceSym}\r\n`;
  }

  return out;
}

function getAllianceSym(alliance: string): string {
  const info = ALLIANCE_NAMES[alliance];
  return info ? info.symbol : '';
}

// ============================================================================
// ALLIANCE DIRECTORY
// ============================================================================

/**
 * Render the alliance directory grouped by alliance
 *
 * Original from SP.REG.S:
 *   Groups spacers under their alliance headers (+), (@), (&), (^)
 */
export function renderAllianceDirectory(entries: DirectoryEntry[]): string {
  let out = '';
  out += '\x1b[36;1m-----------------------------------------\x1b[0m\r\n';
  out += '\x1b[33;1m       ALLIANCE DIRECTORY                \x1b[0m\r\n';
  out += '\x1b[36;1m-----------------------------------------\x1b[0m\r\n\r\n';

  for (const [key, info] of Object.entries(ALLIANCE_NAMES)) {
    const members = entries.filter(e => e.allianceSymbol === key);
    out += `\x1b[33;1m  (${info.symbol}) ${info.name}\x1b[0m`;
    out += ` [${members.length} members]\r\n`;

    if (members.length === 0) {
      out += '    (no members)\r\n';
    } else {
      for (const m of members) {
        out += `    ${String(m.spacerId).padEnd(4)} ${m.name.padEnd(16)} ${(m.shipName || '-').padEnd(14)} ${formatRank(m.rank)}\r\n`;
      }
    }
    out += '\r\n';
  }

  // Unaligned spacers
  const unaligned = entries.filter(e => !ALLIANCE_NAMES[e.allianceSymbol]);
  if (unaligned.length > 0) {
    out += '\x1b[37m  Unaligned Spacers\x1b[0m\r\n';
    for (const m of unaligned) {
      out += `    ${String(m.spacerId).padEnd(4)} ${m.name.padEnd(16)} ${(m.shipName || '-').padEnd(14)} ${formatRank(m.rank)}\r\n`;
    }
  }

  return out;
}
