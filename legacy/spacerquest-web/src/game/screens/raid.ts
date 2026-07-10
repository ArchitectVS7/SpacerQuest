/**
 * SpacerQuest v4.0 - Alliance Raid Screen (SP.BAR.S:169-211)
 *
 * Player-initiated alliance raids from the Spacers Hangout information broker.
 * Original flow:
 *   1. Player chooses to raid from Info Broker
 *   2. Gets shown forged documents briefing
 *   3. Picks target system (1-14 core systems only)
 *   4. Can't raid own alliance or unaligned systems
 *   5. Shown target DEFCON, confirms raid
 *   6. Sets mission (kk=4, q2$="Plans for Raid") and auto-launches
 *   7. On arrival at target, raid completes (SP.DOCK1.S:129-135)
 *   8. Player gets owner documents (pz$) to register at Investment Center
 *
 * Original source: SP.BAR.S:169-211, SP.DOCK1.S:129-135
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { calculateFuelCost } from '../systems/travel.js';
import { calculateDistance } from '../utils.js';

// ============================================================================
// MULTI-STEP STATE
// ============================================================================

interface RaidState {
  step: 'confirm_raid' | 'pick_system' | 'confirm_target';
  systemId?: number;
  systemName?: string;
  defconLevel?: number;
  ownerAlliance?: string;
}

const pendingRaid: Map<string, RaidState> = new Map();

// ============================================================================
// SCREEN MODULE
// ============================================================================

export const RaidScreen: ScreenModule = {
  name: 'raid',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'spacers-hangout' };
    }

    // Original SP.BAR.S:170 — kk=9 means already on a mission
    if (character.missionType !== 0) {
      return {
        output: '\r\n\x1b[31mSorry, don\'t know anything about raiding\x1b[0m\r\n',
        nextScreen: 'spacers-hangout',
      };
    }

    // Original SP.BAR.S:171-176
    const output =
      '\r\n\x1b[33mMust belong to an alliance to fully succeed in a raid\x1b[0m\r\n' +
      'Want to do a little armed corporate raiding..eh?\r\n' +
      '\r\n' +
      `\x1b[36m${'-'.repeat(32)}\x1b[0m\r\n` +
      '\x1b[33;1mRaiding an Alliance Star System:\x1b[0m\r\n' +
      `\x1b[36m${'-'.repeat(32)}\x1b[0m\r\n` +
      'You will be given forged papers which will allow you to pass the\r\n' +
      'Launch Control Officer\'s inspection at the Space Port Launch Bays\r\n' +
      '\r\nStill want to get up a lil\' ol\' raiding party...eh? \x1b[37;1m[Y]\x1b[0m/(N): ';

    pendingRaid.set(characterId, { step: 'confirm_raid' });

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();
    const state = pendingRaid.get(characterId);

    if (!state) {
      return { output: '\r\n', nextScreen: 'spacers-hangout' };
    }

    // ── Step 1: Confirm raid ──────────────────────────────────────────────
    if (state.step === 'confirm_raid') {
      if (key === 'N') {
        pendingRaid.delete(characterId);
        return {
          output: '\r\n\x1b[33m.......not today!.....\x1b[0m\r\n',
          nextScreen: 'spacers-hangout',
        };
      }

      // Show system list and prompt
      // Original SP.BAR.S:178 — copy"sp.legend" then prompt
      const systems = await prisma.starSystem.findMany({
        where: { id: { gte: 1, lte: 14 } },
        orderBy: { id: 'asc' },
      });

      let list = '\r\n\x1b[36;1mCore Star Systems:\x1b[0m\r\n';
      for (const sys of systems) {
        list += `  ${String(sys.id).padStart(2, ' ')}. ${sys.name}\r\n`;
      }

      pendingRaid.set(characterId, { step: 'pick_system' });
      return {
        output: list + '\r\nWhich Star System are you planning to raid? (1-14) \x1b[37;1m[Q]\x1b[0muit: ',
      };
    }

    // ── Step 2: Pick system ───────────────────────────────────────────────
    if (state.step === 'pick_system') {
      if (key === 'Q' || key === '') {
        pendingRaid.delete(characterId);
        return {
          output: '\r\n\x1b[33m.......not today!.....\x1b[0m\r\n',
          nextScreen: 'spacers-hangout',
        };
      }

      const systemId = parseInt(input.trim(), 10);
      if (isNaN(systemId) || systemId < 1 || systemId > 14) {
        return { output: '\r\n\x1b[31mOutta range!\x1b[0m\r\nWhich Star System? (1-14) [Q]uit: ' };
      }

      const character = await prisma.character.findUnique({
        where: { id: characterId },
      });

      if (!character) {
        pendingRaid.delete(characterId);
        return { output: '\x1b[31mError.\x1b[0m\r\n', nextScreen: 'spacers-hangout' };
      }

      // Look up the system
      const targetSystem = await prisma.starSystem.findUnique({
        where: { id: systemId },
      });

      if (!targetSystem) {
        return { output: '\r\n\x1b[31mSystem not found.\x1b[0m\r\nWhich Star System? (1-14) [Q]uit: ' };
      }

      // Check for AllianceSystem record
      const allianceSystem = await prisma.allianceSystem.findUnique({
        where: { systemId },
      });

      // Original SP.BAR.S:193 — can't raid own alliance
      if (allianceSystem && allianceSystem.alliance === character.allianceSymbol) {
        return {
          output: `\r\n\x1b[31mHey! ${targetSystem.name} is owned by your ${allianceSystem.alliance}!\x1b[0m\r\nWhich Star System? (1-14) [Q]uit: `,
        };
      }

      // Original SP.BAR.S:194 — can't raid unaligned systems
      if (!allianceSystem || allianceSystem.alliance === 'NONE') {
        return {
          output: `\r\n\x1b[31m${targetSystem.name} is an unaligned system....sorry!\x1b[0m\r\nWhich Star System? (1-14) [Q]uit: `,
        };
      }

      // Original SP.BAR.S:195-196 — show DEFCON and confirm
      const defcon = allianceSystem.defconLevel;

      pendingRaid.set(characterId, {
        step: 'confirm_target',
        systemId,
        systemName: targetSystem.name,
        defconLevel: defcon,
        ownerAlliance: allianceSystem.alliance,
      });

      return {
        output: `\r\n${targetSystem.name}'s DEFCON:   Weapons: ${defcon}00...Shielding: ${defcon}00\r\n` +
          `\r\nYou've chosen ${targetSystem.name}...Are you sure? \x1b[37;1m[Y]\x1b[0m/(N): `,
      };
    }

    // ── Step 3: Confirm target and launch raid ────────────────────────────
    if (state.step === 'confirm_target') {
      if (key === 'N') {
        // Go back to system picker
        pendingRaid.set(characterId, { step: 'pick_system' });
        return { output: '\r\nWhich Star System? (1-14) [Q]uit: ' };
      }

      const character = await prisma.character.findUnique({
        where: { id: characterId },
        include: { ship: true },
      });

      if (!character || !character.ship) {
        pendingRaid.delete(characterId);
        return { output: '\x1b[31mError.\x1b[0m\r\n', nextScreen: 'spacers-hangout' };
      }

      const systemId = state.systemId!;
      const systemName = state.systemName!;

      // Calculate fuel requirement
      const distance = calculateDistance(character.currentSystem, systemId);
      const fuelRequired = calculateFuelCost(
        character.ship.driveStrength,
        character.ship.driveCondition,
        distance
      );

      // Original SP.BAR.S:199-211 — set up raid mission
      // kk=4, q2$="Plans for Raid", q1=1 (1 pod), nj=3
      await prisma.character.update({
        where: { id: character.id },
        data: {
          missionType: 4,           // kk=4: Raid mission
          cargoManifest: 'Plans for Raid',  // q2$
          destination: systemId,    // q4
          cargoPods: 1,             // q1=1
          cargoType: 10,            // raid cargo
          cargoPayment: 0,
        },
      });

      pendingRaid.delete(characterId);

      // Original SP.BAR.S:202-211 — battle plans display
      const rankTitle = character.rank;
      const output =
        '\r\n\x1b[33mNote: Previous cargo contract will be voided\x1b[0m\r\n' +
        '      And...this is your last trip for today\r\n' +
        '\r\n' +
        `\x1b[36m${'-'.repeat(39)}\x1b[0m\r\n` +
        `      \x1b[33;1m[:-=:[ Battle Plans ]:=-:]\x1b[0m\r\n` +
        `   Raider: ${rankTitle} ${character.name}\r\n` +
        `\x1b[36m${'-'.repeat(39)}\x1b[0m\r\n` +
        `   Raiding Alliance: ${state.ownerAlliance}\r\n` +
        `   Documents       : Plans for Raid\r\n` +
        `   Loaded Pods     : 1\r\n` +
        `   Origin          : System ${character.currentSystem}\r\n` +
        `   Destination     : ${systemName}\r\n` +
        `   Fuel Required   : ${fuelRequired} units\r\n` +
        `   Distance        : ${distance} Astrec(s)\r\n` +
        `\x1b[36m${'-'.repeat(39)}\x1b[0m\r\n` +
        '\r\n\x1b[32mRaid mission accepted! Navigate to your target.\x1b[0m\r\n';

      return { output, nextScreen: 'main-menu' };
    }

    pendingRaid.delete(characterId);
    return { output: '\r\n', nextScreen: 'spacers-hangout' };
  },
};
