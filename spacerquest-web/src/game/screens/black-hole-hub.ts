/**
 * SpacerQuest v4.0 - Black Hole Hub Screen
 *
 * Implements SP.BLACK.S start/gogo/black sections (lines 29-89).
 *
 * Shown when a player arrives at system 28 (black hole) without pendingLattice.
 * Flow:
 *   1. start (lines 29-56): Offer Astraxial hull purchase if player lacks it
 *      - Skip to gogo if already Astraxial
 *      - Check eligibility: isConqueror + LSS Chrysalis + driveStrength > 24
 *      - If not eligible → print restriction → gogo
 *      - If eligible → stt section: check credits, confirm purchase
 *   2. gogo/gogo1/androm (lines 57-72): Andromeda destination selection menu
 *      - Keys: 1-6 (select system), Q (quit/linkback), X (ship stats), A (about), ? (menu)
 *   3. black (lines 74-89): Launch confirmation
 *      - [L]aunch → set missionType=10, initiate travel to NGC system
 *      - (A)bort → return to menu
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { getBlackHoleTransitCost } from '../systems/black-hole.js';
import { startTravel } from '../systems/travel.js';
import { subtractCredits } from '../utils.js';

// ============================================================================
// NGC destination data (SP.BLACK.S sys2 subroutine, lines 201-207)
// ============================================================================

const NGC_SYSTEMS: Record<number, { name: string; systemId: number; coords: string }> = {
  1: { name: 'NGC-44', systemId: 21, coords: '44,22,00' },
  2: { name: 'NGC-55', systemId: 22, coords: '55,33,11' },
  3: { name: 'NGC-66', systemId: 23, coords: '66,44,22' },
  4: { name: 'NGC-77', systemId: 24, coords: '77,55,33' },
  5: { name: 'NGC-88', systemId: 25, coords: '88,66,44' },
  6: { name: 'NGC-99', systemId: 26, coords: '99,77,55' },
};

// ============================================================================
// Session state
// ============================================================================

type HubPhase =
  | 'offer'            // Showing Astraxial hull offer, waiting Y/N
  | 'purchase_confirm' // Showing purchase details, waiting Y/N
  | 'menu'             // Showing androm menu, waiting 1-6/Q/X/A/?
  | 'launch_confirm';  // Showing launch confirmation, waiting L/(A)

interface HubState {
  phase: HubPhase;
  selectedNgc?: number; // 1-6 selected NGC index
}

const sessionState = new Map<string, HubState>();

// ============================================================================
// Helpers
// ============================================================================

function creditDisplay(high: number, low: number): string {
  if (high) return `${high}${String(low).padStart(4, '0')}`;
  return String(low);
}

/** SP.BLACK.S androm subroutine (lines 151-162): Charted Andromedan Stars menu */
function renderAndromMenu(): string {
  return (
    '\r\nMission Planning - Operations Section\r\n' +
    '-'.repeat(41) + '\r\n' +
    'Charted Andromedan Stars Coordinates\r\n' +
    '-'.repeat(41) + '\r\n' +
    '1]...NGC-44...................44,22,00\r\n' +
    '2]...NGC-55...................55,33,11\r\n' +
    '3]...NGC-66...................66,44,22\r\n' +
    '4]...NGC-77...................77,55,33\r\n' +
    '5]...NGC-88...................88,66,44\r\n' +
    '6]...NGC-99...................99,77,55\r\n' +
    '            [Q] Return to star port\r\n' +
    ' (X) Ship Stats              (A) About Mission\r\n' +
    '            (?) This Menu\r\n' +
    '-'.repeat(41) + '\r\n'
  );
}

/** Build status line: [Cr:X:] [F:fuel:] [P:pods:] */
function statusLine(creditsHigh: number, creditsLow: number, fuel: number, cargoPods: number): string {
  return `[Cr:${creditDisplay(creditsHigh, creditsLow)}:]:[F:${fuel}:]:[P:${cargoPods}:]`;
}

/** SP.BLACK.S:58 warning about non-Astraxial hull */
function nonAstraxialWarning(hullName: string | null): string {
  const name = hullName || 'current hull';
  return `\r\nBlack hole transit hazardous using your ${name}\r\n`;
}

/** SP.BLACK.S "sp.hole" ASCII art substitute */
function blackHoleArt(): string {
  return (
    '\r\n\x1b[35;1m' +
    '         .   .   .  *  .  . .   .  *   .  . .  . * .\r\n' +
    '     . . .  *  .   . . .   .  @@@@@@@@@@@@  .  . .  *\r\n' +
    '   .  *  .    .  .  . .  @@@@@@@@@@@@@@@@@@@@  .  .  .\r\n' +
    '  .  .  .  .   .  @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@  .  .\r\n' +
    '   .  .  *  .  @@@@@@@@@@@@@     @@@@@@@@@@@@@@@@@  .\r\n' +
    '  .  .  .  @@@@@@@@@@@@@              @@@@@@@@@@@@@@ .\r\n' +
    '   * .  .  @@@@@@@@@@@@    B L A C K   @@@@@@@@@@@@\r\n' +
    '  .  .  .  @@@@@@@@@@@@@    H O L E   @@@@@@@@@@@@@ .\r\n' +
    '   .  *  .  @@@@@@@@@@@@@@@         @@@@@@@@@@@@@@  .\r\n' +
    '  .  .  .   .  @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@  .  .\r\n' +
    '   .  .  .  .  . @@@@@@@@@@@@@@@@@@@@@@@@@@  .  .  *\r\n' +
    '     . * .  .   .   .  @@@@@@@@@@@@@@  .  .  .   .\r\n' +
    '         .  *  .  .  .   .  .  .  .  *  .  .  .   .\r\n' +
    '\x1b[0m'
  );
}

/** Ship stats display (SP.BLACK.S shipstat subroutine) */
function renderShipStats(char: any, ship: any): string {
  let out = '\r\n';
  out += `Ship's Name...: ${char.shipName || 'Unknown'}\r\n`;
  out += ` Section        Type                       Cond    Strength\r\n`;
  out += ` -------        ----                       -----   --------\r\n`;
  out += ` Hull___________${(ship.hullName || 'Unknown').padEnd(27)}[ ${ship.hullCondition} ]______${ship.hullStrength}\r\n`;
  out += ` Drive__________${(ship.driveName || 'Unknown').padEnd(27)}[ ${ship.driveCondition} ]______${ship.driveStrength}\r\n`;
  out += ` Cabin__________${(ship.cabinName || 'Unknown').padEnd(27)}[ ${ship.cabinCondition} ]______${ship.cabinStrength}\r\n`;
  out += ` Life Support___${(ship.lifeSupportName || 'Unknown').padEnd(27)}[ ${ship.lifeSupportCondition} ]______${ship.lifeSupportStrength}\r\n`;
  out += ` Weapons________${(ship.weaponName || 'Unknown').padEnd(27)}[ ${ship.weaponCondition} ]______${ship.weaponStrength}\r\n`;
  out += ` Navigation_____${(ship.navigationName || 'Unknown').padEnd(27)}[ ${ship.navigationCondition} ]______${ship.navigationStrength}\r\n`;
  out += ` Robotics_______${(ship.roboticsName || 'Unknown').padEnd(27)}[ ${ship.roboticsCondition} ]______${ship.roboticsStrength}\r\n`;
  out += ` Shields________${(ship.shieldName || 'Unknown').padEnd(27)}[ ${ship.shieldCondition} ]______${ship.shieldStrength}\r\n`;
  out += ` Fuel Units${' '.repeat(32)}[ ${ship.hullCondition} ]______${ship.fuel}\r\n`;
  const cargoStatus = char.cargoPods > 0 ? ` ${char.cargoManifest || 'Cargo'}` : ' Empty';
  out += ` Cargo Pods${' '.repeat(32)}[ ${ship.hullCondition} ]______${ship.maxCargoPods}${cargoStatus}\r\n`;
  return out;
}

// ============================================================================
// Screen module
// ============================================================================

export const BlackHoleHubScreen: ScreenModule = {
  name: 'black-hole-hub',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    // Only accessible at system 28 (black hole)
    if (character.currentSystem !== 28) {
      return { output: '', nextScreen: 'main-menu' };
    }

    const ship = character.ship;
    const isAstraxial = ship.isAstraxialHull || (ship.hullName?.startsWith('Astrax') ?? false);

    // SP.BLACK.S:32: if left$(h1$,6)="Astrax" goto gogo
    if (isAstraxial) {
      sessionState.set(characterId, { phase: 'menu' });
      let out = '\x1b[2J\x1b[H';
      out += nonAstraxialWarning(null).replace('hazardous', 'ready — hull cleared for transit'); // already Astraxial, no warning
      // Actually skip the warning for Astraxial
      out = '\x1b[2J\x1b[H';
      out += renderAndromMenu();
      out += `\r\n${statusLine(character.creditsHigh, character.creditsLow, ship.fuel, ship.maxCargoPods)} - Choice: `;
      return { output: out };
    }

    // Not Astraxial: show offer (SP.BLACK.S:33-35)
    sessionState.set(characterId, { phase: 'offer' });
    let out = '\x1b[2J\x1b[H';
    out += blackHoleArt();
    out += `\r\n${statusLine(character.creditsHigh, character.creditsLow, ship.fuel, ship.maxCargoPods)} - Interested? [Y]/(N): `;
    return { output: out };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase() || '\r';
    const state = sessionState.get(characterId) ?? { phase: 'menu' };

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const ship = character.ship;

    // ── Phase: offer — initial Astraxial hull interest prompt ─────────────
    if (state.phase === 'offer') {
      // SP.BLACK.S:36: if i$="N" print"No":goto linkback
      if (key === 'N') {
        sessionState.delete(characterId);
        return { output: 'No\r\n', nextScreen: 'main-menu' };
      }
      if (key !== 'Y') {
        return {
          output: `${statusLine(character.creditsHigh, character.creditsLow, ship.fuel, ship.maxCargoPods)} - Interested? [Y]/(N): `,
        };
      }

      // SP.BLACK.S:37: print"Yes":as$="Astraxial-*!"
      // SP.BLACK.S:38: if d1<25 → error + gogo
      if (ship.driveStrength < 25) {
        sessionState.set(characterId, { phase: 'menu' });
        let out = `Yes\r\n\r\nThe Astraxial-*! hull can only accept drives of >24 str.\r\n`;
        out += renderAndromMenu();
        out += `\r\n${statusLine(character.creditsHigh, character.creditsLow, ship.fuel, ship.maxCargoPods)} - Choice: `;
        return { output: out };
      }

      // SP.BLACK.S:39: if (mp$="][") and (mq$="LSS C") goto stt
      const isConqueror = character.isConqueror;
      const hasLSSC = ship.lifeSupportName?.startsWith('LSS C') ?? false;

      if (!isConqueror || !hasLSSC) {
        // SP.BLACK.S:40-42: restriction message + gogo
        sessionState.set(characterId, { phase: 'menu' });
        let out = `Yes\r\n\r\nBy order of The Rim Stars Space Authority, Only Conquerors of\r\nMaligna and Nemesis allowed to purchase the 'Astraxial-*!' hull\r\n`;
        out += renderAndromMenu();
        out += `\r\n${statusLine(character.creditsHigh, character.creditsLow, ship.fuel, ship.maxCargoPods)} - Choice: `;
        return { output: out };
      }

      // Eligible → stt section: check credits, show cost
      // SP.BLACK.S:48: if g1<10 → not enough credits
      if (character.creditsHigh < 10) {
        sessionState.set(characterId, { phase: 'menu' });
        let out = `Yes\r\n\r\nNot enough credits for the Astraxial-*! hull (need 100,000 cr)\r\n`;
        out += renderAndromMenu();
        out += `\r\n${statusLine(character.creditsHigh, character.creditsLow, ship.fuel, ship.maxCargoPods)} - Choice: `;
        return { output: out };
      }

      // SP.BLACK.S:45-49: show cost + prompt
      sessionState.set(characterId, { phase: 'purchase_confirm' });
      let out = `Yes\r\n\x1b[2J\x1b[H`;
      out += blackHoleArt();
      out += `\r\nCost will be 100,000 cr to install this special hull\r\n`;
      out += `(No trade-ins or credit given for your ${ship.hullName || 'current hull'}....sorry)\r\n`;
      out += `\r\n.....Purchase it? [Y]/(N): `;
      return { output: out };
    }

    // ── Phase: purchase_confirm — confirm hull purchase ────────────────────
    if (state.phase === 'purchase_confirm') {
      if (key === 'N') {
        sessionState.set(characterId, { phase: 'menu' });
        let out = `No\r\n`;
        out += renderAndromMenu();
        out += `\r\n${statusLine(character.creditsHigh, character.creditsLow, ship.fuel, ship.maxCargoPods)} - Choice: `;
        return { output: out };
      }
      if (key !== 'Y') {
        return { output: '.....Purchase it? [Y]/(N): ' };
      }

      // SP.BLACK.S:51-56: purchase
      // g1=g1-10 (pay 100k), f1=2900 (SET fuel), s1=190 (SET cargo pods)
      // h1$="Astraxial-*!", h1=29, h2=9
      const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, 100000);
      await prisma.$transaction([
        prisma.character.update({
          where: { id: characterId },
          data: { creditsHigh: high, creditsLow: low },
        }),
        prisma.ship.update({
          where: { id: ship.id },
          data: {
            hullName: 'Astraxial-*!',
            hullStrength: 29,
            hullCondition: 9,
            fuel: 2900,
            maxCargoPods: 190,
            isAstraxialHull: true,
          },
        }),
      ]);

      // Re-fetch for updated values
      const updatedChar = await prisma.character.findUnique({
        where: { id: characterId },
        include: { ship: true },
      });
      const updatedShip = updatedChar?.ship;

      sessionState.set(characterId, { phase: 'menu' });
      let out = `Yes\r\n\r\nAt that price we'll throw in 190 pods plus full fuel tanks\r\n`;
      if (updatedShip) {
        out += renderShipStats(updatedChar, updatedShip);
      }
      out += renderAndromMenu();
      out += `\r\n${statusLine(updatedChar?.creditsHigh ?? high, updatedChar?.creditsLow ?? low, updatedShip?.fuel ?? 2900, updatedShip?.maxCargoPods ?? 190)} - Choice: `;
      return { output: out };
    }

    // ── Phase: menu — Andromeda destination selection (gogo/gogo1) ─────────
    if (state.phase === 'menu') {
      // SP.BLACK.S:64: if i$=chr$(13) i$="Q"
      const effectiveKey = key === '\r' || key === '' ? 'Q' : key;

      // SP.BLACK.S:67: if i$="Q" goto linkback
      if (effectiveKey === 'Q') {
        sessionState.delete(characterId);
        return { output: 'Q\r\n', nextScreen: 'main-menu' };
      }

      // SP.BLACK.S:68: if i$="?" goto gogo (re-display menu)
      if (effectiveKey === '?') {
        const out = renderAndromMenu() +
          `\r\n${statusLine(character.creditsHigh, character.creditsLow, ship.fuel, ship.maxCargoPods)} - Choice: `;
        return { output: out };
      }

      // SP.BLACK.S:69: if i$="X" gosub shipstat:goto gogo1
      if (effectiveKey === 'X') {
        const out = renderShipStats(character, ship) +
          `\r\n${statusLine(character.creditsHigh, character.creditsLow, ship.fuel, ship.maxCargoPods)} - Choice: `;
        return { output: out };
      }

      // SP.BLACK.S:70: if i$="A" → show sp.hole (About Mission) + gogo1
      if (effectiveKey === 'A') {
        const out = `A\r\n` + blackHoleArt() +
          `\r\n${statusLine(character.creditsHigh, character.creditsLow, ship.fuel, ship.maxCargoPods)} - Choice: `;
        return { output: out };
      }

      // SP.BLACK.S:71: i=val(i$): if (i<1) or (i>6) print ro$:goto gogo
      const sel = parseInt(effectiveKey, 10);
      if (isNaN(sel) || sel < 1 || sel > 6) {
        const out = `${effectiveKey}\r\nOutta Range!\r\n` + renderAndromMenu() +
          `\r\n${statusLine(character.creditsHigh, character.creditsLow, ship.fuel, ship.maxCargoPods)} - Choice: `;
        return { output: out };
      }

      // Valid destination selected → goto black section
      const dest = NGC_SYSTEMS[sel];
      sessionState.set(characterId, { phase: 'launch_confirm', selectedNgc: sel });

      // SP.BLACK.S:72: gosub read → SP.BLACK.S:74-79: black section
      // SP.BLACK.S:76-79: show origin/destination + [L]aunch prompt
      const fuelCost = getBlackHoleTransitCost(ship.driveStrength, ship.driveCondition);
      let out = `${effectiveKey}\r\n\r\n`;
      out += `[Cr:${creditDisplay(character.creditsHigh, character.creditsLow)}:]:[F:${ship.fuel}:]:[P:${ship.maxCargoPods}:]\r\n`;
      out += `\r\nOrigin: ${await getSystemName(character.currentSystem)} star port\r\n`;
      out += `Coordinates for ${dest.name} are locked into your ${ship.navigationName || 'Navigation System'}\r\n`;
      // Show non-Astraxial warning if applicable (SP.BLACK.S:58)
      if (!ship.isAstraxialHull && !(ship.hullName?.startsWith('Astrax'))) {
        out += nonAstraxialWarning(ship.hullName ?? null);
      }
      out += `Fuel required for transit: ${fuelCost}\r\n`;
      out += `\r\n[L]aunch  (A)bort :`;
      return { output: out };
    }

    // ── Phase: launch_confirm — [L]aunch or (A)bort ───────────────────────
    if (state.phase === 'launch_confirm') {
      const ngcIdx = state.selectedNgc ?? 1;
      const dest = NGC_SYSTEMS[ngcIdx];

      // SP.BLACK.S:79: if i$="A" print"Aborting":goto gogo
      if (key === 'A') {
        sessionState.set(characterId, { phase: 'menu' });
        let out = `Aborting\r\n`;
        out += renderAndromMenu();
        out += `\r\n${statusLine(character.creditsHigh, character.creditsLow, ship.fuel, ship.maxCargoPods)} - Choice: `;
        return { output: out };
      }

      if (key !== 'L') {
        return { output: `[L]aunch  (A)bort :` };
      }

      // SP.BLACK.S:80-89: launch sequence
      // kk=10, gosub feek, q4$=o3$, q6=10, gosub fcost, link"sp.warp"
      const fuelCost = getBlackHoleTransitCost(ship.driveStrength, ship.driveCondition);

      if (ship.fuel < fuelCost) {
        sessionState.set(characterId, { phase: 'menu' });
        const out = `\r\nInsufficient fuel for transit! Need ${fuelCost}, have ${ship.fuel}.\r\n` +
          renderAndromMenu() +
          `\r\n${statusLine(character.creditsHigh, character.creditsLow, ship.fuel, ship.maxCargoPods)} - Choice: `;
        return { output: out };
      }

      // Set missionType=10 (kk=10), deduct fuel, initiate travel
      await prisma.$transaction([
        prisma.character.update({
          where: { id: characterId },
          data: { missionType: 10, destination: dest.systemId },
        }),
        prisma.ship.update({
          where: { id: ship.id },
          data: { fuel: ship.fuel - fuelCost },
        }),
      ]);

      await startTravel(characterId, character.currentSystem, dest.systemId, fuelCost);

      sessionState.delete(characterId);

      // SP.BLACK.S:80-84: launch cinematic
      const driveName = ship.driveName || 'Drive';
      const shipName = character.shipName || 'Ship';
      let out = `\r\n${driveName} power on!...Prepare for Launch...\r\n`;
      out += `\r\n.....${shipName} successfully launched!...`;
      out += '.'.repeat(18) + '\r\n';
      out += `\r\nYou are now in transit to ${dest.name}...\r\n`;
      out += `Fuel consumed: ${fuelCost}\r\n`;
      return { output: out, nextScreen: 'main-menu' };
    }

    // Fallback
    sessionState.delete(characterId);
    return { output: '', nextScreen: 'main-menu' };
  },
};

// Helper: get system name for display
async function getSystemName(systemId: number): Promise<string> {
  const system = await prisma.starSystem.findUnique({
    where: { id: systemId },
    select: { name: true },
  });
  return system?.name || `System ${systemId}`;
}
