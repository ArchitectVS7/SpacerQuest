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

import { ARENA_REQUIREMENTS, DUEL_HANDICAP_DIVISOR } from '../constants';

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
  out += '  (O)ptions - Stakes and Arena descriptions\r\n';
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
// ARENA MENU12 (sp.menu12 — SP.ARENA1.S lines 63, 102: if i$="O" i$="sp.menu12":gosub show)
// ============================================================================

/**
 * Render SP.MENU12 content — Stakes Options and Arena Options descriptions.
 * Original file was displayed verbatim via `copy i$` in ACOS-BASIC.
 */
export function renderArenaMenu12(): string {
  const L = '\r\n';
  let out = L;
  out += ' _______________________________________________________________________' + L;
  out += '|                                                                       |' + L;
  out += '|_____________________S_t_a_k_e_s___O_p_t_i_o_n_s______________________|' + L;
  out += '|                                                                       |' + L;
  out += '|           Portion of Total Points proportionate to Handicap          |' + L;
  out += '|           Ship Component Strength proportionate to Handicap          |' + L;
  out += '|             Credits on hand equal to (Handicap x 10,000)             |' + L;
  out += '|_______________________________________________________________________|' + L;
  out += '|                                                                       |' + L;
  out += '|______________________A_r_e_n_a___O_p_t_i_o_n_s_______________________|' + L;
  out += '|                                                                       |' + L;
  out += '|     Ion Cloud Arena..............(completed trips/50)                |' + L;
  out += '|     Proton Storm Arena...........(astrecs travelled/100)             |' + L;
  out += '|     Cosmic Radiation Arena.......(cargo delivered/100)               |' + L;
  out += '|     Black Hole Proximity Arena...(rescues x 10)                      |' + L;
  out += '|     Super-Nova Flare Arena.......((battles won +1000)-battles lost)  |' + L;
  out += '|     Deep Space Arena.............(no conditions existent)            |' + L;
  out += '|_______________________________________________________________________|' + L;
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

// ============================================================================
// STAT SCREEN (stat section, SP.ARENA1.S lines 320-338)
// ============================================================================

export interface ArenaStatData {
  shipName: string;
  ownerName: string;
  hullStrength: number; hullCondition: number;
  driveStrength: number; driveCondition: number;
  cabinStrength: number; cabinCondition: number;
  lifeSupportStrength: number; lifeSupportCondition: number;
  weaponStrength: number; weaponCondition: number;
  navigationStrength: number; navigationCondition: number;
  roboticsStrength: number; roboticsCondition: number;
  shieldStrength: number; shieldCondition: number;
  tripsCompleted: number;
  astrecsTraveled: number;
  cargoDelivered: number;
  rescuesPerformed: number;
  battlesWon: number;
  battlesLost: number;
  score: number;
  creditsHigh: number;
  creditsLow: number;
  handicap: number;
}

/**
 * Render ship/character stat screen (stat section, SP.ARENA1.S lines 320-338)
 *
 * Original output format:
 *   Component                  Strngth  Cond.  |  Vital Stats
 *   Hull [h1] [h2] | Completed Trips: u1
 *   ...
 *   Handicap (HCP) for [shipName]: [h]
 */
export function renderArenaStat(data: ArenaStatData): string {
  function stfx(label: string, str: number, cnd: number, vitalStat: string): string {
    const lPad = (label + '_'.repeat(27)).slice(0, 27);
    const strStr = String(str).padStart(3);
    return `${lPad}[: ${strStr} :]__[: ${cnd} :]  |  ${vitalStat}\r\n`;
  }

  const credits = data.creditsHigh > 0
    ? `${data.creditsHigh}${String(data.creditsLow).padStart(4, '0')}`
    : String(data.creditsLow);

  let out = '';
  out += '\r\n' + '-'.repeat(74) + '\r\n';
  out += `     Ship: ${data.shipName} - Owner: ${data.ownerName}\r\n`;
  out += '-'.repeat(74) + '\r\n';
  out += 'Component                  Strngth  Cond.  |  Vital Stats\r\n';
  out += '-------------------        -------  -----  | -------------------\r\n';
  out += stfx('Hull', data.hullStrength, data.hullCondition, `Completed Trips   : ${data.tripsCompleted}`);
  out += stfx('Drives', data.driveStrength, data.driveCondition, `Astrecs Travelled : ${data.astrecsTraveled}`);
  out += stfx('Cabin', data.cabinStrength, data.cabinCondition, `Cargo Delivered   : ${data.cargoDelivered}`);
  out += stfx('Life Support', data.lifeSupportStrength, data.lifeSupportCondition, `Total Rescues     : ${data.rescuesPerformed}`);
  out += stfx('Weapons', data.weaponStrength, data.weaponCondition, `Battles Won       : ${data.battlesWon}`);
  out += stfx('Navigation', data.navigationStrength, data.navigationCondition, `Battles Lost      : ${data.battlesLost}`);
  out += stfx('Robotics', data.roboticsStrength, data.roboticsCondition, `Total Points      : ${data.score}`);
  out += stfx('Shields', data.shieldStrength, data.shieldCondition, `Credits On Hand   : ${credits}`);
  out += '-'.repeat(74) + '\r\n';
  out += `Handicap (HCP) for ${data.shipName}: [: ${data.handicap} :]\r\n`;
  out += '-'.repeat(74) + '\r\n';
  return out;
}

// ============================================================================
// ARENA GAME LOGIC (SP.ARENA1.S / SP.ARENA2.S)
// ============================================================================

export interface ShipComponents {
  hullStrength: number; hullCondition: number;
  driveStrength: number; driveCondition: number;
  cabinStrength: number; cabinCondition: number;
  lifeSupportStrength: number; lifeSupportCondition: number;
  weaponStrength: number; weaponCondition: number;
  navigationStrength: number; navigationCondition: number;
  roboticsStrength: number; roboticsCondition: number;
  shieldStrength: number; shieldCondition: number;
}

/**
 * Calculate ship handicap (hand subroutine, SP.ARENA1.S line 344-347)
 *
 * Original: h=(h1*h2)+(d1*d2)+(c1*c2)+(l1*l2)+(w1*w2)+(n1*n2)+(r1*r2)+(p1*p2)
 *           if h<500 h=0: return
 *           h=(h/500): return
 */
export function calculateDuelHandicap(ship: ShipComponents): number {
  const total =
    ship.hullStrength * ship.hullCondition +
    ship.driveStrength * ship.driveCondition +
    ship.cabinStrength * ship.cabinCondition +
    ship.lifeSupportStrength * ship.lifeSupportCondition +
    ship.weaponStrength * ship.weaponCondition +
    ship.navigationStrength * ship.navigationCondition +
    ship.roboticsStrength * ship.roboticsCondition +
    ship.shieldStrength * ship.shieldCondition;
  if (total < DUEL_HANDICAP_DIVISOR) return 0;
  return Math.floor(total / DUEL_HANDICAP_DIVISOR);
}

/**
 * Calculate arena-specific handicap (arena subroutine SP.ARENA1.S lines 124-129 / afill SP.ARENA2.S lines 155-160)
 *
 * Original (afill):
 *   if x6=1 a=(u1/50)
 *   if x6=2 a=(j1/100)
 *   if x6=3 a=(k1/100)
 *   if x6=4 a=(b1*10)
 *   if x6=5 a=((e1+1000)-m1)
 *   if x6=6 a=0
 */
export function calculateArenaHandicap(
  arenaType: number,
  tripsCompleted: number,
  astrecsTraveled: number,
  cargoDelivered: number,
  rescuesPerformed: number,
  battlesWon: number,
  battlesLost: number
): number {
  switch (arenaType) {
    case 1: return Math.floor(tripsCompleted / 50);
    case 2: return Math.floor(astrecsTraveled / 100);
    case 3: return Math.floor(cargoDelivered / 100);
    case 4: return rescuesPerformed * 10;
    case 5: return (battlesWon + 1000) - battlesLost;
    case 6: return 0;
    default: return 0;
  }
}

export interface DuelCombatResult {
  /** Hits scored by the person who posted the duel (original Contender, bx side) */
  posterHits: number;
  /** Hits scored by the person who accepted the duel (original Challenger, cx side) */
  accepterHits: number;
  /** Whether the battle ended in a draw (equal hits) */
  isDraw: boolean;
  /** Round-by-round salvo log */
  salvos: string[];
}

/**
 * Simulate arena duel combat (salv subroutine, SP.ARENA2.S lines 74-83)
 *
 * NOTE: naming here uses "poster" for the person who posted to the roster (original Contender)
 * and "accepter" for the person who issued the challenge / accepted (original Challenger).
 * Modern DB schema uses the reverse names (challengerId=poster, contenderId=accepter).
 *
 * Original salv (9 rounds):
 *   r=9: rand → j (1-9), bx=((j+1)*10)+x5  (poster's arena handicap x5, +1 advantage)
 *         rand → k (1-9), cx=(k*10)+a        (accepter's arena handicap a)
 *   bx>cx → posterHits++; cx>bx → accepterHits++; equal → deflect
 */
export function simulateDuelCombat(
  posterShipName: string,
  accepterShipName: string,
  posterArenaHandicap: number,
  accepterArenaHandicap: number
): DuelCombatResult {
  let posterHits = 0;
  let accepterHits = 0;
  const salvos: string[] = [];
  let prevJ = 0;
  let prevK = 0;
  const R = 9;

  for (let round = 0; round < 9; round++) {
    // Poster salvo: bx=((j+1)*10)+posterArenaHandicap
    // Original SP.ARENA2.S line 75-76: r=9:gosub rand:if x=j x=x+1 / j=x / bx=((x+1)*10)+x5
    // rand subroutine clamps: if x>r x=r (so max is 9, not 10)
    let j = Math.floor(Math.random() * R) + 1;
    if (j === prevJ) j = Math.min(j + 1, R); // clamp to R (9), not R+1
    prevJ = j;
    const bx = (j + 1) * 10 + posterArenaHandicap;

    // Accepter salvo: cx=(k*10)+accepterArenaHandicap
    // Original SP.ARENA2.S line 78-79: gosub rand:if x=k x=x+1 / k=x / cx=(x*10)+a
    // rand subroutine clamps: if x>r x=r (so max is 9, not 10)
    let k = Math.floor(Math.random() * R) + 1;
    if (k === prevK) k = Math.min(k + 1, R); // clamp to R (9), not R+1
    prevK = k;
    const cx = k * 10 + accepterArenaHandicap;

    if (bx > cx) {
      salvos.push(`${posterShipName} Salvo hits [${bx - cx}] => ${accepterShipName}!`);
      posterHits++;
    } else if (cx > bx) {
      salvos.push(`${accepterShipName} Salvo hits [${cx - bx}] => ${posterShipName}!`);
      accepterHits++;
    } else {
      salvos.push(`${posterShipName} and ${accepterShipName} Shields deflect Salvos!`);
    }
  }

  return {
    posterHits,
    accepterHits,
    isDraw: posterHits === accepterHits,
    salvos,
  };
}

/**
 * Calculate proportional stakes transfer amount (fini section, SP.ARENA2.S lines 92-96)
 *
 * Original:
 *   t=h+x2
 *   if h>x2  s=((x2*10)/t):u=(x3*s)   <- accepter stronger: use poster's (weaker) handicap × poster's stakes
 *   if x2>h  s=((h*10)/t):u=(xo*s)    <- poster stronger:   use accepter's (weaker) handicap × accepter's stakes
 *   if h=x2  s=((h*10)/t):u=(xo*s)    <- equal:             same as poster-stronger case
 *   v=1:if u>9 v=(u/10)
 *
 * NOTE: "poster" = original Contender (modern challenger), "accepter" = original Challenger (modern contender)
 * posterHandicap = x2 in original; accepterHandicap = h in original
 * posterStakes = x3 (credits/components = posterHandicap; points = floor(posterScore/posterHandicap/10))
 * accepterStakes = xo (credits/components = accepterHandicap; points = floor(accepterScore/accepterHandicap/10))
 */
export function calculateProportionalStakes(
  posterHandicap: number,
  accepterHandicap: number,
  posterStakes: number,
  accepterStakes: number
): number {
  const t = posterHandicap + accepterHandicap;
  if (t === 0) return 1;

  let u: number;
  if (accepterHandicap > posterHandicap) {
    // accepter is stronger: use poster's (weaker) handicap and poster's stakes
    const s = (posterHandicap * 10) / t;
    u = posterStakes * s;
  } else {
    // poster is stronger or equal: use accepter's (weaker) handicap and accepter's stakes
    const s = (accepterHandicap * 10) / t;
    u = accepterStakes * s;
  }

  return Math.max(1, Math.floor(u / 10));
}
