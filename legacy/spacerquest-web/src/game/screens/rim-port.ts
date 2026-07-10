/**
 * SpacerQuest v4.0 - Rim Port Arrival Screen (SP.DOCK2.S:30-198)
 *
 * Dedicated arrival screen for rim star systems 15-20.
 * Handles docking fees, cargo offload/load, repairs, fuel, and the
 * Algol-2 trip counter zero offer.
 *
 * Phases: docking-fee → port (cargo + menu) → repairs/fuel sub-phases → launch
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits, addCredits, subtractCredits, getTotalCredits } from '../utils.js';
import {
  calculateLandingFee,
  calculateRimCargoPayment,
  loadRimCargo,
  getRimFuelSellPrice,
  calculateTripZeroCost,
} from '../systems/economy.js';
import { repairRimComponent } from '../systems/repairs.js';
import {
  RIM_SYSTEM_NAMES,
  RIM_CARGO,
  RIM_REPAIR_MAP,
  RIM_FUEL_BUY_PRICE,
  RIM_FUEL_MAX_BUY,
  RIM_FUEL_MAX_SELL,
  ALGOL_SYSTEM_ID,
  TRIP_ZERO_MIN_TRIPS,
} from '../constants.js';

// ── Phase tracking ──────────────────────────────────────────────────────
type Phase =
  | 'docking-fee'
  | 'port'
  | 'repairs'
  | 'fuel-menu'
  | 'fuel-buy'
  | 'fuel-sell'
  | 'fuel-sell-confirm'
  | 'launch'
  | 'trip-zero';

interface RimPortState {
  phase: Phase;
  dockingFeeRefused: boolean; // jr flag: towed out on launch
  cargoOffloadMsg: string;    // accumulated cargo messages
  cargoLoadMsg: string;
  fuelSellPrice?: number;     // cached for sell sub-phase
}

const stateMap = new Map<string, RimPortState>();

function getState(characterId: string): RimPortState {
  let st = stateMap.get(characterId);
  if (!st) {
    st = { phase: 'docking-fee', dockingFeeRefused: false, cargoOffloadMsg: '', cargoLoadMsg: '' };
    stateMap.set(characterId, st);
  }
  return st;
}

function clearState(characterId: string) {
  stateMap.delete(characterId);
}

// ── Helpers ─────────────────────────────────────────────────────────────

function header(systemName: string, credits: string, fuel: number): string {
  return `\x1b[36;1m[:\x1b[33m${systemName} Star Port\x1b[36;1m:]\x1b[0m` +
    `\x1b[36;1m[Cr:\x1b[32m${credits}\x1b[36;1m:]\x1b[0m` +
    `\x1b[36;1m[Fuel:\x1b[32m${fuel}\x1b[36;1m:]\x1b[0m`;
}

function systemName(systemId: number): string {
  return RIM_SYSTEM_NAMES[systemId] ?? `System ${systemId}`;
}

// ── Screen Module ───────────────────────────────────────────────────────

export const RimPortScreen: ScreenModule = {
  name: 'rim-port',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true, allianceMembership: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const sysId = character.currentSystem;
    if (sysId < 15 || sysId > 20) {
      clearState(characterId);
      return { output: '\x1b[33mYou are not at a rim port.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const sysName = systemName(sysId);
    const ship = character.ship;
    const credits = formatCredits(character.creditsHigh, character.creditsLow);

    const st = getState(characterId);

    // ── Docking fee phase ─────────────────────────────────────────────
    if (st.phase === 'docking-fee') {
      const isAllianceMember = !!character.allianceMembership;
      const isLSS = ship.lifeSupportName?.startsWith('LSS C') ?? false;
      const fee = calculateLandingFee(sysId, isAllianceMember, isLSS);

      // Space Patrol fee waiver (SP.DOCK2.S:37)
      const isPatrol = character.cargoManifest?.startsWith('Sec') ?? false;
      if (isPatrol) {
        st.phase = 'port';
        // Process cargo + render port directly
        await processCargoArrival(characterId, character, ship, sysId, st);
        return renderPortMenu(characterId, character, ship, sysId, st);
      }

      const output = `\r\n${header(sysName, credits, ship.fuel)}\r\n\r\n` +
        `Docking Fee: ${fee} cr...pay it? [Y]/(N): `;

      return { output, data: { fee } };
    }

    // ── Port menu phase ───────────────────────────────────────────────
    if (st.phase === 'port') {
      return renderPortMenu(characterId, character, ship, sysId, st);
    }

    // ── Repairs phase ─────────────────────────────────────────────────
    if (st.phase === 'repairs') {
      const repair = RIM_REPAIR_MAP[sysId];
      if (!repair) {
        st.phase = 'port';
        return renderPortMenu(characterId, character, ship, sysId, st);
      }
      const comp = repair.component as any;
      const strength = ship[`${comp}Strength` as keyof typeof ship] as number;
      const condition = ship[`${comp}Condition` as keyof typeof ship] as number;

      if (strength < 1) {
        const output = `\r\n\x1b[31mYour ${repair.label} = DESTROYED!\x1b[0m\r\n\r\nPress any key...\r\n> `;
        return { output };
      }
      if (condition >= 9) {
        const output = `\r\n\x1b[32m${repair.label} is in perfect condition!\x1b[0m\r\n\r\nPress any key...\r\n> `;
        return { output };
      }

      const cost = Math.min(strength, 199) * 100;
      const refreshedCredits = formatCredits(character.creditsHigh, character.creditsLow);
      const output = `\r\n${header(sysName, refreshedCredits, ship.fuel)}\r\n\r\n` +
        `${repair.label} is now at...S:[${strength}]...C:[${condition}]\r\n` +
        `Only ${repair.label} on ${sysName}...cost:${cost} per 1+\r\n\r\n` +
        `Repair? [Y]/(N): `;

      return { output };
    }

    // ── Fuel menu phase ───────────────────────────────────────────────
    if (st.phase === 'fuel-menu') {
      const refreshedCredits = formatCredits(character.creditsHigh, character.creditsLow);
      const output = `\r\n${header(sysName, refreshedCredits, ship.fuel)}\r\n\r\n` +
        `${sysName} Refueling Depot:  (B)uy fuel  (S)ell fuel  [Q]uit: `;
      return { output };
    }

    // ── Fuel buy phase ────────────────────────────────────────────────
    if (st.phase === 'fuel-buy') {
      const tankMax = (ship.hullCondition + 1) * 10 * ship.hullStrength;
      if (ship.fuel > tankMax) {
        st.phase = 'fuel-menu';
        return { output: `\r\nYou have too much fuel....sell off some!\r\n> ` };
      }
      if (ship.fuel === tankMax) {
        st.phase = 'fuel-menu';
        return { output: `\r\nYour tanks are full!\r\n> ` };
      }
      const canBuy = tankMax - ship.fuel;
      const refreshedCredits = formatCredits(character.creditsHigh, character.creditsLow);
      const output = `\r\n${sysName} Fuel Depot has fuel for sale....Price: ${RIM_FUEL_BUY_PRICE} cr per unit\r\n` +
        `${header(sysName, refreshedCredits, ship.fuel)}\r\n` +
        `Buy how much fuel for your ship? (0-${canBuy}): `;
      return { output };
    }

    // ── Fuel sell phase ───────────────────────────────────────────────
    if (st.phase === 'fuel-sell') {
      const sellPrice = getRimFuelSellPrice(sysId);
      st.fuelSellPrice = sellPrice;
      const refreshedCredits = formatCredits(character.creditsHigh, character.creditsLow);
      const output = `\r\n${header(sysName, refreshedCredits, ship.fuel)}\r\n` +
        `We pay ${sellPrice} cr per fuel unit...interested? [Y]/(N): `;
      return { output };
    }

    // ── Fuel sell confirm (enter amount) ──────────────────────────────
    if (st.phase === 'fuel-sell-confirm') {
      const refreshedCredits = formatCredits(character.creditsHigh, character.creditsLow);
      const output = `\r\n${header(sysName, refreshedCredits, ship.fuel)}\r\n` +
        `Sell off how much from your tanks? (0-${ship.fuel}): `;
      return { output };
    }

    // ── Launch phase ──────────────────────────────────────────────────
    if (st.phase === 'launch') {
      return renderLaunchPhase(characterId, character, ship, sysId, st);
    }

    // ── Trip zero phase ───────────────────────────────────────────────
    if (st.phase === 'trip-zero') {
      const { cost, costDisplay } = calculateTripZeroCost(ship);
      const output = `\r\n...pssst...wanna zero your trip counter for ${costDisplay}0,000 cr? (Y)/[N]: `;
      return { output, data: { cost } };
    }

    // Fallback
    st.phase = 'port';
    return renderPortMenu(characterId, character, ship, sysId, st);
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true, allianceMembership: true },
    });

    if (!character || !character.ship) {
      clearState(characterId);
      return { output: '\x1b[31mError.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const sysId = character.currentSystem;
    const sysName = systemName(sysId);
    const ship = character.ship;
    const st = getState(characterId);
    const key = input.trim().toUpperCase();

    // ── Docking fee response ──────────────────────────────────────────
    if (st.phase === 'docking-fee') {
      const isAllianceMember = !!character.allianceMembership;
      const isLSS = ship.lifeSupportName?.startsWith('LSS C') ?? false;
      const fee = calculateLandingFee(sysId, isAllianceMember, isLSS);

      if (key === 'N') {
        st.dockingFeeRefused = true;
        st.phase = 'launch';
        return { output: 'No\r\n', nextScreen: 'rim-port' };
      }

      // Default: pay
      const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
      if (totalCredits < fee) {
        st.dockingFeeRefused = true;
        st.phase = 'launch';
        return { output: `\x1b[31mNot enough credits!\x1b[0m\r\n`, nextScreen: 'rim-port' };
      }

      const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, fee);
      await prisma.character.update({
        where: { id: characterId },
        data: {
          creditsHigh: high,
          creditsLow: low,
          tripCount: { increment: 1 }, // z1=z1+1 (SP.DOCK2.S:44)
        },
      });

      st.phase = 'port';
      await processCargoArrival(characterId, character, ship, sysId, st);

      const feeMsg = `Yes\r\nDocking fee paid in full...\r\n`;
      // Re-fetch character after update
      return { output: feeMsg, nextScreen: 'rim-port' };
    }

    // ── Port menu response ────────────────────────────────────────────
    if (st.phase === 'port') {
      if (key === 'L') {
        st.phase = 'launch';
        return { output: key + '\r\n', nextScreen: 'rim-port' };
      }
      if (key === 'W' && sysId === 17) {
        return { output: key + '\r\n', nextScreen: 'wise-one' };
      }
      if (key === 'S' && sysId === 18) {
        return { output: key + '\r\n', nextScreen: 'sage' };
      }
      if (key === 'R' && sysId < 20) {
        st.phase = 'repairs';
        return { output: key + '\r\n', nextScreen: 'rim-port' };
      }
      if (key === 'F' && sysId < 20) {
        st.phase = 'fuel-menu';
        return { output: key + '\r\n', nextScreen: 'rim-port' };
      }
      return { output: '?\r\n> ' };
    }

    // ── Repairs response ──────────────────────────────────────────────
    if (st.phase === 'repairs') {
      const repair = RIM_REPAIR_MAP[sysId];
      if (key === 'Y' && repair) {
        const result = await repairRimComponent(characterId, repair.component as any);
        st.phase = 'port';
        if (result.success) {
          return { output: `Yes\r\n${result.message}\r\n`, nextScreen: 'rim-port' };
        }
        return { output: `Yes\r\n\x1b[31m${result.error}\x1b[0m\r\n`, nextScreen: 'rim-port' };
      }
      st.phase = 'port';
      return { output: 'No\r\n', nextScreen: 'rim-port' };
    }

    // ── Fuel menu response ────────────────────────────────────────────
    if (st.phase === 'fuel-menu') {
      if (key === 'B') {
        st.phase = 'fuel-buy';
        return { output: key + '\r\n', nextScreen: 'rim-port' };
      }
      if (key === 'S') {
        st.phase = 'fuel-sell';
        return { output: key + '\r\n', nextScreen: 'rim-port' };
      }
      // Q or default → back to port
      st.phase = 'port';
      return { output: '\r\n', nextScreen: 'rim-port' };
    }

    // ── Fuel buy response ─────────────────────────────────────────────
    if (st.phase === 'fuel-buy') {
      if (key === 'Q' || key === '') {
        st.phase = 'port';
        return { output: '...leaving\r\n', nextScreen: 'rim-port' };
      }
      const amount = parseInt(key, 10);
      if (isNaN(amount) || amount < 1) {
        st.phase = 'port';
        return { output: '...none...leaving\r\n', nextScreen: 'rim-port' };
      }
      if (amount > RIM_FUEL_MAX_BUY || key.length > 4) {
        return { output: '\x1b[31mInvalid amount.\x1b[0m\r\n', nextScreen: 'rim-port' };
      }
      const tankMax = (ship.hullCondition + 1) * 10 * ship.hullStrength;
      if (ship.fuel + amount > tankMax) {
        return { output: '\x1b[31mToo much fuel!\x1b[0m\r\n', nextScreen: 'rim-port' };
      }
      const cost = amount * RIM_FUEL_BUY_PRICE;
      const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
      if (totalCredits < cost) {
        return { output: `\x1b[31mNot enough credits!\x1b[0m\r\n`, nextScreen: 'rim-port' };
      }
      const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, cost);
      await prisma.ship.update({
        where: { id: ship.id },
        data: { fuel: ship.fuel + amount },
      });
      await prisma.character.update({
        where: { id: characterId },
        data: { creditsHigh: high, creditsLow: low },
      });
      return { output: `\r\nCost for ${amount} units = ${cost} cr\r\n`, nextScreen: 'rim-port' };
    }

    // ── Fuel sell response ────────────────────────────────────────────
    if (st.phase === 'fuel-sell') {
      if (key === 'N') {
        st.phase = 'fuel-menu';
        return { output: 'No\r\n', nextScreen: 'rim-port' };
      }
      // Y or default → proceed to amount entry
      st.phase = 'fuel-sell-confirm';
      return { output: 'Yes\r\n', nextScreen: 'rim-port' };
    }

    // ── Fuel sell confirm (amount) ────────────────────────────────────
    if (st.phase === 'fuel-sell-confirm') {
      if (key === '' || key === 'Q') {
        st.phase = 'fuel-menu';
        return { output: '\r\n', nextScreen: 'rim-port' };
      }
      const amount = parseInt(key, 10);
      if (isNaN(amount) || amount < 1) {
        st.phase = 'fuel-menu';
        return { output: '\r\n', nextScreen: 'rim-port' };
      }
      if (amount > ship.fuel || amount > RIM_FUEL_MAX_SELL || key.length > 4) {
        return { output: '\x1b[31mInvalid amount.\x1b[0m\r\n', nextScreen: 'rim-port' };
      }
      const sellPrice = st.fuelSellPrice ?? getRimFuelSellPrice(sysId);
      const payment = sellPrice * amount;
      const { high, low } = addCredits(character.creditsHigh, character.creditsLow, payment);
      await prisma.ship.update({
        where: { id: ship.id },
        data: { fuel: ship.fuel - amount },
      });
      await prisma.character.update({
        where: { id: characterId },
        data: { creditsHigh: high, creditsLow: low },
      });
      st.phase = 'fuel-sell-confirm'; // stay in sell loop (original: goto sfu1)
      return { output: `\r\nPayment of ${payment} cr for ${amount} units of fuel....thanx!\r\n`, nextScreen: 'rim-port' };
    }

    // ── Launch response ───────────────────────────────────────────────
    if (st.phase === 'launch') {
      // Launch validation already shown on render; this is the departure
      clearState(characterId);
      return { output: '\r\n', nextScreen: 'main-menu' };
    }

    // ── Trip zero response ────────────────────────────────────────────
    if (st.phase === 'trip-zero') {
      if (key === 'Y') {
        const { cost } = calculateTripZeroCost(ship);
        const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, cost);
        await prisma.character.update({
          where: { id: characterId },
          data: {
            tripCount: 0,
            tripsCompleted: 0, // t1=0 in original
            creditsHigh: high,
            creditsLow: low,
            tripZeroUsed: true,
          },
        });
        st.phase = 'launch';
        return { output: 'Yes\r\n', nextScreen: 'rim-port' };
      }
      // N or default
      st.phase = 'launch';
      return { output: 'No\r\n', nextScreen: 'rim-port' };
    }

    return { output: '?\r\n> ' };
  },
};

// ── Internal helpers ────────────────────────────────────────────────────

/**
 * Process cargo offload + load on arrival at rim port.
 * Modifies st.cargoOffloadMsg and st.cargoLoadMsg, and updates DB.
 */
async function processCargoArrival(
  characterId: string,
  character: any,
  ship: any,
  sysId: number,
  st: RimPortState,
) {
  const sysName_ = systemName(sysId);
  const msgs: string[] = [];
  msgs.push(`Entering ${sysName_} cargo-receiving dock`);

  let hadCargo = false;

  // Check existing cargo
  if (!character.cargoManifest && character.cargoPods < 1) {
    msgs.push('Your pods are empty');
  } else if (character.cargoType === 20) {
    // Rim cargo delivered back to rim — not wanted (SP.DOCK2.S:80)
    msgs.push(`No need for ${character.cargoManifest || 'cargo'} here`);
  } else if (character.cargoManifest?.startsWith('Cont')) {
    // Contraband (SP.DOCK2.S:82)
    msgs.push('Smuggled goods not needed...Dump\'em!');
    await prisma.character.update({
      where: { id: characterId },
      data: { cargoPods: 0, cargoType: 0, cargoPayment: 0, cargoManifest: null, destination: 0 },
    });
  } else if (character.cargoManifest?.startsWith('Plan')) {
    // Planet cargo (SP.DOCK2.S:83)
    msgs.push('Nothing here for corporate raiders');
  } else if (character.cargoManifest === 'X') {
    // Andromeda mission cargo (SP.DOCK2.S:85-89)
    hadCargo = true;
    const rimIndex = sysId - 14;
    const basePayment = character.cargoPayment || 0;
    let andPayment = basePayment;
    // Derive NGC name for the cargo's origin/bonus rim match (cargoType 1-6 → NGC-44 to NGC-99)
    const ngcNames: Record<number, string> = { 1:'NGC-44', 2:'NGC-55', 3:'NGC-66', 4:'NGC-77', 5:'NGC-88', 6:'NGC-99' };
    const ngcName = ngcNames[character.cargoType] ?? 'Andromeda';
    let bonusMsg = '';
    if (rimIndex === character.cargoType) {
      // Matching cargo for this rim port → +50K bonus
      andPayment = basePayment + 5; // in 10K units
      bonusMsg = ` + 50K Bonus!\r\n...${ngcName} cargo needed here!`;
    } else {
      bonusMsg = `\r\nGuess we can find a use for your ${ngcName} cargo`;
    }
    const { high, low } = addCredits(character.creditsHigh, character.creditsLow, andPayment * 10000);
    msgs.push(`You receive payment of ${andPayment}0,000 cr${bonusMsg}`);
    await prisma.character.update({
      where: { id: characterId },
      data: {
        creditsHigh: high, creditsLow: low,
        cargoPods: 0, cargoType: 0, cargoPayment: 0, cargoManifest: null, destination: 0,
        missionType: 0,
      },
    });
  } else if (character.cargoPods > 0 && character.cargoPayment > 0) {
    // Normal cargo delivery at rim port (SP.DOCK2.S:90-103)
    hadCargo = true;
    msgs.push(`Your cargo of ${character.cargoManifest || 'goods'} is off-loaded by droid workers`);
    const { payment } = calculateRimCargoPayment(
      sysId,
      character.cargoPayment,
      character.cargoPods,
      ship.hullCondition,
    );
    const { high, low } = addCredits(character.creditsHigh, character.creditsLow, payment);
    msgs.push(`You receive payment of ${formatCredits(high, low)} cr`);
    await prisma.character.update({
      where: { id: characterId },
      data: {
        creditsHigh: high, creditsLow: low,
        cargoPods: 0, cargoType: 0, cargoPayment: 0, cargoManifest: null, destination: 0,
        missionType: 0,
      },
    });
  }

  st.cargoOffloadMsg = msgs.join('\r\n');

  // ── Load new rim cargo (SP.DOCK2.S:104-116) ────────────────────────
  // Apply upod formula: s1 = floor(max((h2+1)*s1, 10) / 10)
  // Original SP.DOCK2.S upod sub (lines 432-439) destructively mutates s1.
  // We compute it here from ship.cargoPods (same formula, not persisted).
  let s1 = ship.cargoPods;
  if (s1 > 0 && ship.hullStrength > 0) {
    if (ship.hullCondition < 1) {
      s1 = 1;
    } else {
      s1 = Math.floor(Math.max((ship.hullCondition + 1) * s1, 10) / 10);
    }
  }

  // Re-fetch character for updated credits
  const refreshed = await prisma.character.findUnique({ where: { id: characterId } });
  if (!refreshed) return;

  const loadMsgs: string[] = [];

  loadMsgs.push('The port agent apologizes for the lack of facilities');
  loadMsgs.push('Being way out on the edge of the galaxy.');
  loadMsgs.push('We don\'t get many visitors.');
  if (hadCargo) {
    loadMsgs.push(`But your cargo of ${character.cargoManifest || 'goods'} is much needed.`);
  }

  if (s1 < 1) {
    loadMsgs.push('No servicable pods to load');
    await prisma.character.update({
      where: { id: characterId },
      data: { cargoPods: 0, cargoType: 0, cargoManifest: null, cargoPayment: 0 },
    });
  } else {
    const loaded = loadRimCargo(sysId, s1, refreshed.creditsHigh, refreshed.creditsLow);
    if (loaded) {
      loadMsgs.push(`Droids load your ${loaded.pods} pods with ${loaded.cargoName} from ${systemName(sysId)}`);
      loadMsgs.push(`...Payment of ${loaded.payment} cr to be P.O.D. at a space port`);
      await prisma.character.update({
        where: { id: characterId },
        data: {
          cargoPods: loaded.pods,
          cargoType: 20, // rim cargo sentinel
          cargoManifest: loaded.cargoName,
          cargoPayment: loaded.payment,
          destination: loaded.destination,
        },
      });
    }
  }

  st.cargoLoadMsg = loadMsgs.join('\r\n');
}

/**
 * Render the main port menu with cargo results and facility options.
 */
async function renderPortMenu(
  _characterId: string,
  character: any,
  ship: any,
  sysId: number,
  st: RimPortState,
): Promise<ScreenResponse> {
  const sysName_ = systemName(sysId);

  // Re-fetch for current credits
  const refreshed = await prisma.character.findUnique({ where: { id: character.id } });
  const credits = formatCredits(
    refreshed?.creditsHigh ?? character.creditsHigh,
    refreshed?.creditsLow ?? character.creditsLow,
  );
  const fuel = (await prisma.ship.findUnique({ where: { id: ship.id } }))?.fuel ?? ship.fuel;

  const lines: string[] = [];

  // Show cargo results if first time entering port phase
  if (st.cargoOffloadMsg) {
    lines.push(st.cargoOffloadMsg);
    lines.push('');
    st.cargoOffloadMsg = ''; // only show once
  }
  if (st.cargoLoadMsg) {
    lines.push(st.cargoLoadMsg);
    lines.push('');
    st.cargoLoadMsg = '';
  }

  // Facilities listing (SP.DOCK2.S:118-128)
  lines.push(`(#${sysId}) ${sysName_} Star Port Facilities:`);
  const repair = RIM_REPAIR_MAP[sysId];
  if (repair) {
    lines.push(` # ${repair.label}`);
  } else {
    lines.push(' # No Repair Shop');
  }
  if (sysId === 17) lines.push(' # Wise One');
  if (sysId === 17) lines.push(' # Cabin Repair');
  if (sysId === 18) lines.push(' # The Sage');
  if (sysId === 18) lines.push(' # Robot. Repair');
  if (sysId === ALGOL_SYSTEM_ID) {
    lines.push(' # No Fueling Depot');
  } else {
    lines.push(' # Fueling Depot');
  }

  // Menu options (SP.DOCK2.S:130-135)
  lines.push('');
  lines.push(`${header(sysName_, credits, fuel)}`);
  let menuLine = 'Choice:  (L)aunch  ';
  if (sysId === 17) menuLine += '(W)ise One Visit  ';
  if (sysId === 18) menuLine += '(S)age Visit  ';
  if (sysId < 20) menuLine += '(R)epairs  ';
  if (sysId < 20) menuLine += '(F)uel Depot  ';
  menuLine += ':  ';
  lines.push(menuLine);

  return { output: '\r\n' + lines.join('\r\n') + '\r\n> ' };
}

/**
 * Render the launch phase with validation and trip-zero offer.
 */
async function renderLaunchPhase(
  characterId: string,
  character: any,
  ship: any,
  sysId: number,
  st: RimPortState,
): Promise<ScreenResponse> {
  const sysName_ = systemName(sysId);
  const refreshed = await prisma.character.findUnique({ where: { id: characterId }, include: { ship: true } });
  const currentShip = refreshed?.ship ?? ship;
  const credits = formatCredits(
    refreshed?.creditsHigh ?? character.creditsHigh,
    refreshed?.creditsLow ?? character.creditsLow,
  );

  const lines: string[] = [];
  lines.push(header(sysName_, credits, currentShip.fuel));

  // Turnaround fuel cost if docking fee was refused (SP.DOCK2.S:181)
  if (st.dockingFeeRefused) {
    const fuelCost = currentShip.hullStrength * 5;
    const newFuel = Math.max(0, currentShip.fuel - fuelCost);
    await prisma.ship.update({
      where: { id: currentShip.id },
      data: { fuel: newFuel },
    });
    if (fuelCost > 0) {
      lines.push(`Turn-around fuel used: ${fuelCost}`);
    }
    if (newFuel < 1) {
      lines.push('....No Fuel!');
    }
  }

  // Drive check (SP.DOCK2.S:184)
  if (currentShip.driveStrength < 1 || currentShip.driveCondition < 1) {
    lines.push(`The ${character.spacerId}'s drives are ...disabled`);
    lines.push(`Space tugs tow ${character.spacerId} out to the space lanes to await rescue`);
    clearState(characterId);
    await prisma.character.update({
      where: { id: characterId },
      data: { isLost: true, lostLocation: sysId },
    });
    return { output: '\r\n' + lines.join('\r\n') + '\r\n', nextScreen: 'main-menu' };
  }

  // Hull check (SP.DOCK2.S:185)
  if (currentShip.hullStrength < 1 || currentShip.hullCondition < 1) {
    lines.push(`The ${character.spacerId}'s hull is ...disabled`);
    lines.push(`Space tugs tow ${character.spacerId} out to the space lanes to await rescue`);
    clearState(characterId);
    await prisma.character.update({
      where: { id: characterId },
      data: { isLost: true, lostLocation: sysId },
    });
    return { output: '\r\n' + lines.join('\r\n') + '\r\n', nextScreen: 'main-menu' };
  }

  // ── Algol-2 trip counter zero offer (SP.DOCK2.S:186-194) ───────────
  const charData = refreshed ?? character;
  if (
    sysId === ALGOL_SYSTEM_ID &&
    charData.tripCount >= TRIP_ZERO_MIN_TRIPS &&
    !charData.tripZeroUsed
  ) {
    const { cost, costDisplay } = calculateTripZeroCost(currentShip);
    const totalCredits = getTotalCredits(charData.creditsHigh, charData.creditsLow);
    if (cost > 0 && totalCredits >= cost) {
      st.phase = 'trip-zero';
      lines.push(`\r\n...pssst...wanna zero your trip counter for ${costDisplay}0,000 cr? (Y)/[N]: `);
      return { output: '\r\n' + lines.join('\r\n') };
    }
  }

  // Normal launch — return to main menu
  clearState(characterId);
  lines.push(`Departing ${sysName_}...`);
  return { output: '\r\n' + lines.join('\r\n') + '\r\n', nextScreen: 'main-menu' };
}
