/**
 * SpacerQuest v4.0 - Andromeda Dock Screen (SP.BLACK.S:91-149)
 *
 * Handles cargo loading at Andromeda galaxy planets (systems 21-26).
 * Shows planet description, cargo selection menu (6 items), confirmation,
 * and optional fuel cache exchange (1/5 chance: trade shield power for fuel).
 *
 * Source: SP.BLACK.S dock section (lines 91-149)
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';

// Andromeda cargo data — SP.BLACK.S sys2 subroutine (lines 201-207).
// Each NGC system has exactly 2 valid cargo slots; unset slots are empty string ('').
// Selecting an empty slot triggers "It's wise to choose a cargo" (SP.BLACK.S:111).
// Slots map to menu options: index 0=option1(ore), 1=option2(herbals), 2=option3(crystals),
//   3=option4(liquors), 4=option5(gems), 5=option6(biologicals)
// Original variable assignments per planet:
//   NGC-44: o4=1,o4$="Dragonium Ore"   o8=5,o8$="Rarium Gems"          (slots 1,5)
//   NGC-55: o7=4,o7$="Merusian Liquor" o9=6,o9$="Anti-Virion Serum"    (slots 4,6)
//   NGC-66: o4=1,o4$="Mystium Ore"     o6=3,o6$="Clyrium Crystal"      (slots 1,3)
//   NGC-77: o5=2,o5$="Oreganol Herbs"  o7=4,o7$="Ferlian Elixre"       (slots 2,4)
//   NGC-88: o6=3,o6$="Sonolide Crystal" o8=5,o8$="Arachnid Gems"       (slots 3,5)
//   NGC-99: o5=2,o5$="Infernum Spice"  o9=6,o9$="Grundgy Vaccine"      (slots 2,6)
const ANDROMEDA_CARGO: Record<number, readonly [string, string, string, string, string, string]> = {
  21: ['Dragonium Ore',  '',               '',                '',               'Rarium Gems',    ''],               // NGC-44: slots 1,5
  22: ['',               '',               '',                'Merusian Liquor', '',              'Anti-Virion Serum'], // NGC-55: slots 4,6
  23: ['Mystium Ore',    '',               'Clyrium Crystal', '',               '',               ''],               // NGC-66: slots 1,3
  24: ['',               'Oreganol Herbs', '',                'Ferlian Elixre', '',               ''],               // NGC-77: slots 2,4
  25: ['',               '',               'Sonolide Crystal', '',              'Arachnid Gems',  ''],               // NGC-88: slots 3,5
  26: ['',               'Infernum Spice', '',                '',               '',               'Grundgy Vaccine'], // NGC-99: slots 2,6
};

// NGC names for Andromeda systems 21-26
const NGC_NAMES: Record<number, string> = {
  21: 'NGC-44', 22: 'NGC-55', 23: 'NGC-66', 24: 'NGC-77', 25: 'NGC-88', 26: 'NGC-99',
};

// Planet surface descriptions (SP.BLACK.S:171-178 planet subroutine, i=1-6)
const PLANET_DESCRIPTIONS: readonly string[] = [
  'In a red sun-lit washed landscape of exotic sandstone formations',
  'In a hot and humid swampy delta under a blue-gray murky sky',
  'In a frigid wind-sculpted icy terrain under a distant blue sun',
  'In an acrid green and fog-permeated jungle of exotic plants',
  'On an island composed of massive violet-hued stone formations',
  'In a malodorous unbreathable atmosphere under a blazing star',
];

// ── Phase tracking ──────────────────────────────────────────────────────
type Phase = 'goods' | 'confirm' | 'cache' | 'done';

interface AndromedaDockState {
  phase: Phase;
  initialized: boolean;   // false on first render, true after
  selectedIndex: number;  // 1-6 cargo selection
  selectedName: string;   // cargo name for "pods are loaded with" message
  upodPods: number;       // effective pods after upod calc
  payment: number;        // random payment (>= 5)
}

const stateMap = new Map<string, AndromedaDockState>();

function getState(characterId: string): AndromedaDockState {
  let st = stateMap.get(characterId);
  if (!st) {
    st = { phase: 'goods', initialized: false, selectedIndex: 0, selectedName: '', upodPods: 0, payment: 0 };
    stateMap.set(characterId, st);
  }
  return st;
}

function clearState(characterId: string) {
  stateMap.delete(characterId);
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Apply upod formula: s1 = floor(max((h2+1)*s1, 10) / 10)
 * Same formula used in rim-port.ts.
 */
function calcUpodPods(cargoPods: number, hullStrength: number, hullCondition: number): number {
  let s1 = cargoPods;
  if (s1 > 0 && hullStrength > 0) {
    if (hullCondition < 1) {
      s1 = 1;
    } else {
      s1 = Math.floor(Math.max((hullCondition + 1) * s1, 10) / 10);
    }
  }
  return s1;
}

/**
 * Random payment: r=(s1/10)+1; rand(1,r); if x<5 x=5
 * SP.BLACK.S:116-117
 */
function calcPayment(upodPods: number): number {
  const r = Math.floor(upodPods / 10) + 1;
  const x = Math.floor(Math.random() * r) + 1;
  return Math.max(5, x);
}

/** Goods menu (SP.BLACK.S:164-169 goods subroutine) */
function goodsMenu(systemId: number): string {
  const cargo = ANDROMEDA_CARGO[systemId];
  const name = NGC_NAMES[systemId] ?? `System ${systemId}`;
  if (!cargo) return '';
  return (
    `\r\n${name} - Cargo Available For Transport\r\n` +
    `${'─'.repeat(45)}\r\n` +
    `1) Ore(s)        : ${cargo[0]}\r\n` +
    `2) Herbals       : ${cargo[1]}\r\n` +
    `3) Crystals      : ${cargo[2]}\r\n` +
    `4) Liquors       : ${cargo[3]}\r\n` +
    `5) Precious Gems : ${cargo[4]}\r\n` +
    `6) Biologicals   : ${cargo[5]}\r\n` +
    `${'─'.repeat(45)}\r\n`
  );
}

// ── Screen Module ───────────────────────────────────────────────────────

export const AndromedaDockScreen: ScreenModule = {
  name: 'andromeda-dock',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const sysId = character.currentSystem;
    if (sysId < 21 || sysId > 26) {
      clearState(characterId);
      return { output: '\x1b[33mYou are not at an Andromeda system.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const ship = character.ship;
    const ngcName = NGC_NAMES[sysId] ?? `System ${sysId}`;
    const planetIndex = sysId - 20; // 1-6
    const credits = formatCredits(character.creditsHigh, character.creditsLow);
    const st = getState(characterId);

    // ── Goods selection phase ─────────────────────────────────────────
    if (st.phase === 'goods') {
      const upodPods = calcUpodPods(ship.cargoPods, ship.hullStrength, ship.hullCondition);
      st.upodPods = upodPods;

      let output = '';

      // Show arrival description only on first render (SP.BLACK.S:94-98)
      if (!st.initialized) {
        st.initialized = true;
        const planetDesc = PLANET_DESCRIPTIONS[planetIndex - 1] ?? '';
        output +=
          `\r\nYou reverse thrusters and set your ${character.shipName || 'ship'} down on ${ngcName}\r\n` +
          `Stepping through the ${ship.lifeSupportName || 'airlock'} you find yourself\r\n` +
          `${planetDesc}\r\n` +
          `You explore and discover several items worthy as cargo for loading\r\n`;
      }

      output += goodsMenu(sysId);
      output += `[Cr:${credits}:]:[F:${ship.fuel}:]:[P:${upodPods}:] - Which cargo? (1-6): `;
      return { output };
    }

    // ── Confirmation phase ────────────────────────────────────────────
    if (st.phase === 'confirm') {
      return { output: `\r\nAre you satisfied? (Y)/(N)/(Q): ` };
    }

    // ── Fuel cache phase ──────────────────────────────────────────────
    if (st.phase === 'cache') {
      const shieldName = ship.shieldName || 'Shield';
      return {
        output:
          `\r\n${shieldName}:  Str:[${ship.shieldStrength}]   Cond:[${ship.shieldCondition}]   Fuel on Board:[${ship.fuel}]\r\n` +
          `\r\nA cache of fuel units is discovered in a cave nearby\r\n` +
          `It can be loaded into your ship if the ${shieldName}'s\r\n` +
          `power charge units are left behind....Do this? (Y)/(N): `,
      };
    }

    // ── Done phase ────────────────────────────────────────────────────
    if (st.phase === 'done') {
      clearState(characterId);
      return { output: `\r\nDeparting ${ngcName}...\r\n`, nextScreen: 'main-menu' };
    }

    // Fallback
    st.phase = 'goods';
    return { output: '\r\n> ', nextScreen: 'andromeda-dock' };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      clearState(characterId);
      return { output: '\x1b[31mError.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const sysId = character.currentSystem;
    const ship = character.ship;
    const st = getState(characterId);
    const key = input.trim().toUpperCase();
    const ngcName = NGC_NAMES[sysId] ?? `System ${sysId}`;

    // ── Cargo selection ───────────────────────────────────────────────
    if (st.phase === 'goods') {
      const cargoIndex = parseInt(key, 10);
      if (isNaN(cargoIndex) || cargoIndex < 1 || cargoIndex > 6) {
        return { output: 'Outta Range!\r\n', nextScreen: 'andromeda-dock' };
      }

      // SP.BLACK.S:105-111: check if selected slot has cargo (sparse slots)
      // if q2$="" print"It's wise to choose a cargo":goto dock1
      const cargo = ANDROMEDA_CARGO[sysId];
      const cargoName = cargo?.[cargoIndex - 1] ?? '';
      if (!cargoName) {
        // Empty slot — return to goods menu with advisory message
        const credits = formatCredits(character.creditsHigh, character.creditsLow);
        return {
          output:
            `${key}\r\nIt's wise to choose a cargo\r\n` +
            goodsMenu(sysId) +
            `[Cr:${credits}:]:[F:${ship.fuel}:]:[P:${st.upodPods}:] - Which cargo? (1-6): `,
        };
      }

      // SP.BLACK.S:112: if s1<10 print"Too few pods to complete mission!":goto leave
      if (st.upodPods < 10) {
        st.phase = 'done';
        return { output: `${key}\r\nToo few pods to complete mission!\r\n`, nextScreen: 'andromeda-dock' };
      }

      st.selectedIndex = cargoIndex;
      st.selectedName = cargoName;
      st.payment = calcPayment(st.upodPods);
      st.phase = 'confirm';

      return { output: `${key}\r\n`, nextScreen: 'andromeda-dock' };
    }

    // ── Confirmation ──────────────────────────────────────────────────
    if (st.phase === 'confirm') {
      if (key === 'N') {
        // Back to cargo selection
        st.phase = 'goods';
        const credits = formatCredits(character.creditsHigh, character.creditsLow);
        return {
          output:
            `No\r\n${goodsMenu(sysId)}` +
            `[Cr:${credits}:]:[F:${ship.fuel}:]:[P:${st.upodPods}:] - Which cargo? (1-6): `,
        };
      }

      if (key !== 'Y') {
        // Q or unknown: abort → leave section
        st.phase = 'done';
        const leaveMsg =
          `?\r\n\r\nDestination: ............\r\n` +
          `\x1b[32mO u t e r   S p a c e\x1b[0m.......\r\n` +
          `Prepare to lift off from ${ngcName}...Drive engines ignited!\r\n`;
        return { output: leaveMsg, nextScreen: 'andromeda-dock' };
      }

      // Y: SP.BLACK.S:116-118 — compute payment, set cargo fields
      // r=(s1/10)+1:gosub rand; if x<5 x=5; q1=s1:q2=i:q5=x:q3$="X"
      await prisma.character.update({
        where: { id: characterId },
        data: {
          cargoPods: st.upodPods,
          cargoType: st.selectedIndex,
          cargoPayment: st.payment,
          cargoManifest: 'X',  // q3$="X" = Andromeda cargo flag (SP.BLACK.S:118)
          missionType: 10,
        },
      });

      let msg = `Yes\r\n${character.shipName || 'Your ship'}'s ${st.upodPods} pods are loaded with ${st.selectedName}\r\n`;

      // SP.BLACK.S:120-122 — fuel cache check: r=5:gosub rand; if (x=3) goto cache (1/5 chance)
      // Original does NOT check shieldCondition > 0 — cache offered regardless of shield state.
      // With condition=0: x=((0+1)*200)=200 fuel gained.
      const cacheRoll = Math.floor(Math.random() * 5) + 1;
      if (cacheRoll === 3) {
        st.phase = 'cache';
        return { output: msg, nextScreen: 'andromeda-dock' };
      }

      // No cache — go directly to leave section
      msg +=
        `\r\nDestination: ............\r\n` +
        `\x1b[32mO u t e r   S p a c e\x1b[0m.......\r\n` +
        `Prepare to lift off from ${ngcName}...Drive engines ignited!\r\n`;
      st.phase = 'done';
      return { output: msg, nextScreen: 'andromeda-dock' };
    }

    // ── Fuel cache offer ──────────────────────────────────────────────
    if (st.phase === 'cache') {
      if (key === 'Y') {
        // SP.BLACK.S:132: x=((p2+1)*200):f1=(f1+x):p2=0
        const fuelGained = (ship.shieldCondition + 1) * 200;
        const newFuel = ship.fuel + fuelGained;
        await prisma.ship.update({
          where: { id: ship.id },
          data: { fuel: newFuel, shieldCondition: 0 },
        });
        const shieldName = ship.shieldName || 'Shield';
        const msg =
          `Yes\r\n` +
          `${shieldName}:  Str:[${ship.shieldStrength}]   Cond:[0]   Fuel on Board:[${newFuel}]\r\n` +
          `\r\nDestination: ............\r\n` +
          `\x1b[32mO u t e r   S p a c e\x1b[0m.......\r\n` +
          `Prepare to lift off from ${ngcName}...Drive engines ignited!\r\n`;
        st.phase = 'done';
        return { output: msg, nextScreen: 'andromeda-dock' };
      }

      // N or default: skip cache, proceed to leave
      const msg =
        `No\r\nDestination: ............\r\n` +
        `\x1b[32mO u t e r   S p a c e\x1b[0m.......\r\n` +
        `Prepare to lift off from ${ngcName}...Drive engines ignited!\r\n`;
      st.phase = 'done';
      return { output: msg, nextScreen: 'andromeda-dock' };
    }

    // ── Done ──────────────────────────────────────────────────────────
    if (st.phase === 'done') {
      clearState(characterId);
      return { output: '\r\n', nextScreen: 'main-menu' };
    }

    return { output: '?\r\n' };
  },
};
