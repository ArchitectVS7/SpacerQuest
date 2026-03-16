/**
 * SpacerQuest v4.0 - Dueling Arena System
 *
 * Renders the Dueling Arena terminal screens
 * Ported from original SP.ARENA1.S / SP.ARENA2.S
 *
 * Original features:
 *   (1) Contender - Post a duel challenge to the roster
 *   (2) Challenger - Accept a pending duel
 *   (R) Roster - View open duel challenges
 *   (B) Battle Log - View completed duel results
 *   (L) List - View all ships
 *   (Q) Quit
 */

import { ARENA_REQUIREMENTS } from '../constants';

// ============================================================================
// TYPES
// ============================================================================

export interface DuelRosterEntry {
  id: string;
  challengerName: string;
  challengerShip: string;
  stakesType: string;
  stakesAmount: number;
  arenaType: number;
  handicap: number;
  createdAt: Date;
}

export interface DuelBattleLogEntry {
  winnerName: string;
  winnerShip: string;
  loserName: string;
  loserShip: string;
  arenaType: number;
  stakesType: string;
  stakesAmount: number;
  completedAt: Date;
}

export interface DuelResultDisplay {
  winnerName: string;
  winnerShip: string;
  winnerHits: number;
  loserName: string;
  loserShip: string;
  loserHits: number;
  arenaType: number;
  stakesType: string;
  stakesAmount: number;
}

// ============================================================================
// ARENA & STAKES CONSTANTS
// ============================================================================

/**
 * 6 arena types from original SP.ARENA1.S:
 *   (1) Ion Cloud, (2) Proton Storm, (3) Cosmic Radiation,
 *   (4) Black Hole Proximity, (5) Super-Nova Flare, (6) Deep Space
 */
export const ARENA_NAMES = [
  'Ion Cloud',
  'Proton Storm',
  'Cosmic Radiation',
  'Black Hole Proximity',
  'Super-Nova Flare',
  'Deep Space',
] as const;

/**
 * Stakes types from original:
 *   (1) Total Points, (2) Ship Component Strength, (3) Credits
 */
export const STAKES_NAMES = [
  'Total Points',
  'Ship Component Strength',
  'Credits',
] as const;

// ============================================================================
// ARENA HEADER
// ============================================================================

/**
 * Render the Spacer Arena main menu
 *
 * Original from SP.ARENA1.S:
 *   [Spacer Arena]:Command: [ ]
 *   (1) Contender, (2) Challenger, (R)oster, (B)attle Log, (L)ist, (Q)uit
 */
export function renderArenaHeader(): string {
  let out = '';
  out += '\x1b[36;1m=========================================\x1b[0m\r\n';
  out += '\x1b[33;1m          SPACER ARENA                   \x1b[0m\r\n';
  out += '\x1b[36;1m=========================================\x1b[0m\r\n\r\n';
  out += '  (1) Contender - Post a duel challenge\r\n';
  out += '  (2) Challenger - Accept a duel\r\n';
  out += '  (R)oster - View pending duels\r\n';
  out += '  (B)attle Log - View past results\r\n';
  out += '  (L)ist - List all ships\r\n';
  out += '  (Q)uit - Return to main menu\r\n';
  out += '\r\n\x1b[32m[Spacer Arena]:Command:\x1b[0m ';
  return out;
}

// ============================================================================
// ARENA OPTIONS
// ============================================================================

/**
 * Render arena type and stakes selection info
 */
export function renderArenaOptions(): string {
  let out = '';
  out += '\x1b[33;1m  Arena Types:\x1b[0m\r\n';
  ARENA_NAMES.forEach((name, i) => {
    let req = '';
    switch (i) {
      case 0: req = ` (requires ${ARENA_REQUIREMENTS.ION_CLOUD.trips} trips)`; break;
      case 1: req = ` (requires ${ARENA_REQUIREMENTS.PROTON_STORM.astrecs} astrecs)`; break;
      case 2: req = ` (requires ${ARENA_REQUIREMENTS.COSMIC_RADIATION.cargo} cargo)`; break;
      case 3: req = ` (requires ${ARENA_REQUIREMENTS.BLACK_HOLE.rescues} rescue)`; break;
      case 4: req = ' (requires 50 battles)'; break;
      case 5: req = ' (open to all)'; break;
    }
    out += `    (${i + 1}) ${name}${req}\r\n`;
  });

  out += '\r\n\x1b[33;1m  Stakes Types:\x1b[0m\r\n';
  STAKES_NAMES.forEach((name, i) => {
    out += `    (${i + 1}) ${name}\r\n`;
  });

  return out;
}

// ============================================================================
// DUEL ROSTER
// ============================================================================

/**
 * Render the dueling roster (pending challenges)
 *
 * Original from SP.ARENA1.S:
 *   Date | ID# | Ship Name | Stakes | Arena | HCP | Challenger
 */
export function renderDuelRoster(entries: DuelRosterEntry[]): string {
  let out = '';
  out += '\x1b[36;1m-----------------------------------------\x1b[0m\r\n';
  out += '\x1b[33;1m         DUELING ROSTER                  \x1b[0m\r\n';
  out += '\x1b[36;1m-----------------------------------------\x1b[0m\r\n';

  if (entries.length === 0) {
    out += '\r\n  \x1b[37mNo duels posted. Arena is empty.\x1b[0m\r\n';
    return out;
  }

  out += `  ${'#'.padEnd(3)} ${'Challenger'.padEnd(16)} ${'Ship'.padEnd(12)} ${'Stakes'.padEnd(10)} ${'Arena'.padEnd(18)} HCP\r\n`;
  out += '\x1b[36m  ' + '-'.repeat(65) + '\x1b[0m\r\n';

  entries.forEach((entry, i) => {
    const arenaName = ARENA_NAMES[entry.arenaType - 1] || 'Unknown';
    const stakes = `${entry.stakesAmount} ${entry.stakesType}`;
    out += `  ${String(i + 1).padEnd(3)} `;
    out += `${entry.challengerName.padEnd(16)} `;
    out += `${entry.challengerShip.padEnd(12)} `;
    out += `${stakes.padEnd(10)} `;
    out += `${arenaName.padEnd(18)} `;
    out += `${entry.handicap}\r\n`;
  });

  return out;
}

// ============================================================================
// BATTLE LOG
// ============================================================================

/**
 * Render the duel battle log (completed duels)
 *
 * Original from SP.ARENA2.S:
 *   [Ship][hits] beats [Opponent][hits] in [Arena]
 */
export function renderBattleLog(entries: DuelBattleLogEntry[]): string {
  let out = '';
  out += '\x1b[36;1m-----------------------------------------\x1b[0m\r\n';
  out += '\x1b[33;1m         BATTLE LOG                      \x1b[0m\r\n';
  out += '\x1b[36;1m-----------------------------------------\x1b[0m\r\n';

  if (entries.length === 0) {
    out += '\r\n  \x1b[37mNo battles recorded yet. Log is empty.\x1b[0m\r\n';
    return out;
  }

  for (const entry of entries) {
    const arenaName = ARENA_NAMES[entry.arenaType - 1] || 'Unknown';
    const date = entry.completedAt.toLocaleDateString();
    out += `\r\n  \x1b[37m${date}\x1b[0m - ${arenaName}\r\n`;
    out += `  \x1b[32m${entry.winnerName}\x1b[0m (${entry.winnerShip})`;
    out += ` beats `;
    out += `\x1b[31m${entry.loserName}\x1b[0m (${entry.loserShip})\r\n`;
    out += `  Stakes: ${entry.stakesAmount} ${entry.stakesType}\r\n`;
  }

  return out;
}

// ============================================================================
// DUEL RESULT DISPLAY
// ============================================================================

/**
 * Render a duel result
 *
 * Original from SP.ARENA2.S:
 *   [Ship Name][hit count] beats [Opponent Name][hit count]
 */
export function renderDuelResult(result: DuelResultDisplay): string {
  const arenaName = ARENA_NAMES[result.arenaType - 1] || 'Unknown';

  let out = '';
  out += '\x1b[36;1m=========================================\x1b[0m\r\n';
  out += `\x1b[33;1m  DUEL RESULT - ${arenaName}\x1b[0m\r\n`;
  out += '\x1b[36;1m=========================================\x1b[0m\r\n\r\n';

  out += `  \x1b[32;1m${result.winnerName}\x1b[0m (${result.winnerShip}) [${result.winnerHits} hits]\r\n`;
  out += `      beats\r\n`;
  out += `  \x1b[31m${result.loserName}\x1b[0m (${result.loserShip}) [${result.loserHits} hits]\r\n\r\n`;

  out += `  Stakes: ${result.stakesAmount} ${result.stakesType}\r\n`;

  out += '\x1b[36;1m=========================================\x1b[0m\r\n';
  return out;
}
