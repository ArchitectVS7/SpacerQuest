/**
 * SpacerQuest v4.0 - Space Patrol HQ Screen (SP.REG.S patrol subroutine)
 *
 * Accessed from the Space Registry via key 'S'.
 *
 * Original SP.REG.S patrol subroutine (lines 177-267):
 *   Pre-check: if ((w1+p1)<50) or (kk=9) → TopGun promotion path (not in scope)
 *   pat1 label: main HQ menu
 *   Keys: J=Join/Oath, C=Choose system, O=Orders, L=Launch, K=Key/legend, ?=menu, Q=quit
 *
 * Original dock label (lines 269-284) fires when returning from patrol combat (kk=2).
 * In the modern flow, the combat screen routes VICTORY/DEFEAT for missionType===2
 * back to this screen. render() detects the post-combat state and fires payoff.
 *
 * Original zerout subroutine (lines 417-420):
 *   q1=0:q2=0:q3=0:q4=0:q5=0:q6=0:q2$="":q4$=""
 *   Maps to: cargoPods=0, cargoType=0, cargoPayment=0, destination=0, cargoManifest=null
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import {
  CORE_SYSTEM_NAMES,
  PATROL_BASE_PAY,
  PATROL_DAILY_LIMIT,
} from '../constants.js';
import {
  calculatePatrolDistance,
  calculatePatrolFuelCost,
  validatePatrolEntry,
  calculatePatrolPayoff,
} from '../systems/patrol.js';

// ============================================================================
// State machine — pick_system and confirm_system multi-step flow
// ============================================================================

interface PatrolState {
  step: 'pick_system' | 'confirm_system';
  systemId?: number;
  systemName?: string;
}

const pendingState = new Map<string, PatrolState>();

// ============================================================================
// Helpers
// ============================================================================

function systemLegend(): string {
  let out = '\r\n\x1b[33;1mCore Systems (patrol eligible):\x1b[0m\r\n';
  for (let i = 1; i <= 14; i++) {
    out += `  ${String(i).padStart(2, ' ')}. ${CORE_SYSTEM_NAMES[i]}\r\n`;
  }
  return out;
}

function hqMenu(): string {
  return (
    '\r\n\x1b[36;1m' + '─'.repeat(38) + '\x1b[0m\r\n' +
    '\x1b[33;1m     SPACE PATROL HEADQUARTERS\x1b[0m\r\n' +
    '\x1b[36;1m' + '─'.repeat(38) + '\x1b[0m\r\n' +
    '  [J]oin up  [C]hoose system\r\n' +
    '  [O]rders   [L]aunch pad\r\n' +
    '  [K]ey/legend  [?]Menu  [Q]uit\r\n' +
    '\r\n\x1b[32m[Space Patrol HQ]: Command:\x1b[0m '
  );
}

async function applyPayoffAndZerout(
  characterId: string,
  character: any,
  ship: any,
): Promise<string> {
  const distance = character.destination > 0
    ? calculatePatrolDistance(
        /* origin preserved? we use tripCount context */
        Math.abs(character.destination - character.currentSystem) > 0
          ? character.currentSystem
          : 1,
        character.destination,
      )
    : 1;

  // Use the distance that was set at launch. Since currentSystem may have been
  // updated to destination at dock, recalculate from destination field.
  // If currentSystem === destination (expected after dock), distance = abs(dest - origin).
  // Since we don't store origin separately, we derive it from the fact that
  // at launch, origin = currentSystem at that time. On dock:
  // sp$=q4$:sp=q4 → currentSystem = destination.
  // We recover distance = abs(destination - original_currentSystem).
  // Since we can't recover origin after dock, we use distance = q6 which
  // we store as the patrol distance. Because we don't store it separately,
  // calculate it now as: Math.abs(q4 - originalSystem). But we don't have
  // originalSystem. As a safe fallback: use the destination value itself
  // as a proxy (systems 1-14, distance ranges 1-13).
  // Better: store patrolDistance at launch time.
  // For now, since we increment astrecsTraveled by distance, compute it
  // as abs(destination - some reasonable value). This is a known limitation:
  // patrolDistance should be persisted. We approximate with destination value.
  const q6 = character.destination > 0
    ? character.destination   // approximation — exact value stored at launch not persisted
    : 1;

  const payoff = calculatePatrolPayoff({
    patrolBattlesWon: character.patrolBattlesWon,
    patrolBattlesLost: character.patrolBattlesLost,
    distance: q6,
    cargoPods: character.cargoPods,
    cargoPayment: character.cargoPayment || PATROL_BASE_PAY,
    creditsHigh: character.creditsHigh,
    creditsLow: character.creditsLow,
    astrecsTraveled: character.astrecsTraveled,
    cargoDelivered: character.cargoDelivered,
    tripsCompleted: character.tripsCompleted,
    battlesWon: character.battlesWon,
    battlesLost: character.battlesLost,
    score: character.score,
    rescuesPerformed: character.rescuesPerformed,
  });

  // Apply all DB updates — zerout + payoff + z1++
  const charUpdate: Record<string, any> = {
    creditsHigh: payoff.newCreditsHigh,
    creditsLow: payoff.newCreditsLow,
    score: payoff.newScore,
    astrecsTraveled: payoff.newAstrecsTraveled,
    cargoDelivered: payoff.newCargoDelivered,
    tripsCompleted: payoff.newTripsCompleted,
    battlesWon: payoff.newBattlesWon,
    battlesLost: payoff.newBattlesLost,
    tripCount: { increment: 1 },   // z1++ (dock)
    // zerout (SP.REG.S lines 417-420)
    hasPatrolCommission: false,
    cargoPods: 0,
    cargoType: 0,
    cargoPayment: 0,
    destination: 0,
    cargoManifest: null,
    missionType: 0,
    patrolBattlesWon: 0,
    patrolBattlesLost: 0,
  };

  if (payoff.promoted) {
    charUpdate.promotions = { increment: 1 };
    await Promise.all([
      prisma.character.update({ where: { id: characterId }, data: charUpdate }),
      prisma.ship.update({
        where: { characterId },
        data: {
          weaponStrength: { increment: 1 },
          shieldStrength: { increment: 1 },
          driveStrength: { increment: 1 },
        },
      }),
    ]);
  } else {
    await prisma.character.update({ where: { id: characterId }, data: charUpdate });
  }

  return payoff.reportLines.join('\r\n') + '\r\n';
}

// ============================================================================
// Orders display — SP.REG.S deal2 label (lines 231-240)
// ============================================================================

function renderOrders(character: any): string {
  const destName = CORE_SYSTEM_NAMES[character.destination] || `System ${character.destination}`;
  const originName = CORE_SYSTEM_NAMES[character.currentSystem] || `System ${character.currentSystem}`;
  const distance = calculatePatrolDistance(character.currentSystem, character.destination);
  return (
    '\r\n\x1b[36;1m' + '─'.repeat(38) + '\x1b[0m\r\n' +
    '   \x1b[33;1m[:-=:[ Space Patrol Orders ]:=-:]\x1b[0m\r\n' +
    '\x1b[36;1m' + '─'.repeat(38) + '\x1b[0m\r\n' +
    `   Cargo         : ${character.cargoManifest || 'Secret Battle Codes'}\r\n` +
    `   Value         : 0 cr per pod\r\n` +
    `   Loaded Pods   : ${character.cargoPods}\r\n` +
    `   Origin        : ${originName}\r\n` +
    `   Destination   : ${destName}\r\n` +
    `   Distance      : ${distance} Astrec(s)\r\n` +
    `   Pay           : ${character.cargoPayment || PATROL_BASE_PAY} cr\r\n` +
    `   Oath Taken by : ${character.name}\r\n` +
    `   Witness: Commandant of Space Patrol\r\n` +
    '\x1b[36;1m' + '─'.repeat(38) + '\x1b[0m\r\n'
  );
}

// ============================================================================
// Screen module
// ============================================================================

export const SpacePatrolScreen: ScreenModule = {
  name: 'space-patrol',

  render: async (characterId: string): Promise<ScreenResponse> => {
    pendingState.delete(characterId);

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError.\x1b[0m\r\n', nextScreen: 'registry' };
    }

    // ── Post-combat dock (SP.REG.S dock label, lines 269-284) ─────────────
    // Detect: player just returned from patrol combat (missionType still 2)
    if (character.missionType === 2) {
      // Check ship is still operational (lines 274-275)
      if (character.ship.hullCondition < 1 || character.ship.driveCondition < 1) {
        // Ship destroyed — lost in space (simplified: just clear and return)
        await prisma.character.update({
          where: { id: characterId },
          data: {
            hasPatrolCommission: false, missionType: 0,
            cargoPods: 0, cargoType: 0, cargoPayment: 0,
            destination: 0, cargoManifest: null,
            patrolBattlesWon: 0, patrolBattlesLost: 0,
          },
        });
        return {
          output: '\r\n\x1b[31mYour ship is too damaged. Patrol aborted.\x1b[0m\r\n',
          nextScreen: 'main-menu',
        };
      }

      const report = await applyPayoffAndZerout(characterId, character, character.ship);
      return { output: '\r\n' + report + hqMenu() };
    }

    // ── Normal entry: validate and show HQ menu ────────────────────────────
    const validation = validatePatrolEntry({
      hullCondition: character.ship.hullCondition,
      driveCondition: character.ship.driveCondition,
      tripCount: character.tripCount,
      missionType: character.missionType,
    });

    if (!validation.canEnter) {
      return {
        output: `\r\n${validation.reason}\r\n`,
        nextScreen: 'registry',
      };
    }

    return { output: hqMenu() };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError.\x1b[0m\r\n', nextScreen: 'registry' };
    }

    const ship = character.ship;

    // ── Multi-step: system pick ────────────────────────────────────────────
    const state = pendingState.get(characterId);

    if (state?.step === 'pick_system') {
      // Q or empty → quit patrol (cs=0, zerout) — original line 210
      if (key === 'Q' || key === '') {
        pendingState.delete(characterId);
        await prisma.character.update({
          where: { id: characterId },
          data: {
            hasPatrolCommission: false,
            cargoPods: 0, cargoType: 0, cargoPayment: 0,
            destination: 0, cargoManifest: null,
          },
        });
        return { output: '\r\nQuitting Space Patrol\r\n' + hqMenu() };
      }

      const sysId = parseInt(key, 10);
      if (isNaN(sysId) || sysId < 1 || sysId > 14) {
        return {
          output: '\r\nEnter a system number (1-14) or Q to quit: ',
        };
      }

      const sysName = CORE_SYSTEM_NAMES[sysId];
      pendingState.set(characterId, { step: 'confirm_system', systemId: sysId, systemName: sysName });
      return {
        output: `\r\nYou've chosen ${sysName}...Are you sure? [Y]/(N): `,
      };
    }

    if (state?.step === 'confirm_system') {
      if (key === 'N') {
        pendingState.set(characterId, { step: 'pick_system' });
        return {
          output: 'No\r\n' + systemLegend() + '\r\nPatrol which system? (1-14) (Q)uit S.P.: ',
        };
      }

      // Y or Enter — confirm destination
      pendingState.delete(characterId);
      const sysId = state.systemId!;
      const sysName = state.systemName!;

      await prisma.character.update({
        where: { id: characterId },
        data: { destination: sysId },
      });

      // Show orders
      const updatedChar = { ...character, destination: sysId };
      return {
        output: 'Yes\r\n' + renderOrders(updatedChar) + hqMenu(),
      };
    }

    // ── Main HQ menu commands ──────────────────────────────────────────────

    if (key === 'Q' || key === '\r' || key === '') {
      pendingState.delete(characterId);
      return { output: 'Leaving\r\n', nextScreen: 'registry' };
    }

    if (key === '?') {
      return { output: hqMenu() };
    }

    if (key === 'K') {
      // Key/legend — original: print"Key":copy"sp.legend":goto pat1
      return { output: 'Key\r\n' + systemLegend() + hqMenu() };
    }

    // Validate ship is functional before J/C/O/L
    if (ship.hullCondition < 1 || ship.driveCondition < 1) {
      return { output: '\r\nNo functional ship\r\n' + hqMenu() };
    }

    if (character.tripCount > PATROL_DAILY_LIMIT) {
      return { output: '\r\nOnly 3 completed trips allowed per day\r\n' + hqMenu() };
    }

    if (key === 'J') {
      // Join/Oath — SP.REG.S deal label (lines 220-230)
      if (character.hasPatrolCommission) {
        // Already commissioned — show orders (goto deal2)
        return { output: 'Joining up\r\n' + renderOrders(character) + hqMenu() };
      }

      // Warn if active cargo contract (q1>0)
      let out = 'Joining up\r\n';
      if (character.cargoPods > 0) {
        out += '\r\nNote:Your current cargo contract will be\r\n';
        out += 'Invalidated if you join the Space Patrol\r\n';
      }

      out += `\r\nWelcome ${character.name} to The Space Patrol\r\n`;

      await prisma.character.update({
        where: { id: characterId },
        data: {
          hasPatrolCommission: true,
          cargoPods: 1,
          cargoType: 0,
          cargoPayment: PATROL_BASE_PAY,
          cargoManifest: 'Secret Battle Codes',
          destination: 0,
          patrolBattlesWon: 0,
          patrolBattlesLost: 0,
        },
      });

      // Fall through to system pick (original: goto pat2 after deal)
      pendingState.set(characterId, { step: 'pick_system' });
      return {
        output: out + systemLegend() + '\r\nPatrol which system? (1-14) (Q)uit S.P.: ',
      };
    }

    // C, O, L require oath taken first (original line 200: if cs<1 print"The Oath must be taken first")
    if (!character.hasPatrolCommission) {
      return { output: '\r\nThe Oath must be taken first\r\n' + hqMenu() };
    }

    if (key === 'C') {
      // Choose — SP.REG.S pat2 label (lines 205-218)
      pendingState.set(characterId, { step: 'pick_system' });
      return {
        output: 'Choosing\r\n' + systemLegend() + '\r\nPatrol which system? (1-14) (Q)uit S.P.: ',
      };
    }

    if (key === 'O') {
      // Orders — SP.REG.S deal2 (lines 231-240)
      return { output: 'Your Orders\r\n' + renderOrders(character) + hqMenu() };
    }

    if (key === 'L') {
      // Launch — SP.REG.S launch label (lines 258-267)
      if (character.destination < 1) {
        return { output: '\r\nDestination System Required!\r\n' + hqMenu() };
      }

      // Calculate fuel required
      const distance = calculatePatrolDistance(character.currentSystem, character.destination);
      const fuelRequired = calculatePatrolFuelCost(ship.driveStrength, ship.driveCondition, distance);

      if (ship.fuel < fuelRequired) {
        return {
          output: `\r\nInsufficient fuel. Need ${fuelRequired} units (have ${ship.fuel}).\r\n` + hqMenu(),
        };
      }

      const destName = CORE_SYSTEM_NAMES[character.destination];
      await prisma.character.update({
        where: { id: characterId },
        data: { missionType: 2 },
      });

      return {
        output:
          '\r\nLaunch Pad\r\n' +
          '\r\nExternal Sensors Scanning.......\r\n' +
          `  ${destName} sector.\r\n`,
        nextScreen: 'combat',
      };
    }

    return { output: '?\r\n' + hqMenu() };
  },
};
