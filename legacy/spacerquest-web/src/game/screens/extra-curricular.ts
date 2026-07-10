/**
 * SpacerQuest v4.0 - Extra-Curricular Menu Screen (SP.END.txt sp.menu11)
 *
 * Original flow for Pirate (P):
 *   1. "Really want to go 'a pirating'? [Y]/(N)" — confirm
 *   2. Show star system legend (sp.legend)
 *   3. "In which system do you wish to lurk? (1-14) [Q]uits" — pick system
 *   4. "Is <system> your choice? [Y]/(N)" — confirm system
 *   5. Cargo contracts voided, pp=1, writes to pirates file
 *
 * Original flow for Star Patrol (S):
 *   1. Show star system legend
 *   2. "Join which Star System Squadron Patrol? (1-14) [Q]uit" — pick system
 *   3. Alliance check: ship suffix must match system's alliance (line 168)
 *   4. Cargo contracts voided, pp=4, writes to sp.pat file
 *
 * Original flow for Smuggler Patrol (C):
 *   1. "Patrol for smugglers? [Y]/(N)" — confirm
 *   2. Same as Star Patrol but skips alliance check (xe=1, line 167)
 *
 * Menu options:
 *   (P) Pirate Mode — Attack other ships for loot
 *   (S) Star Patrol — Hunt pirates for bounties
 *   (C) Smuggler Patrol — Intercept smugglers
 *   (W) Dueling Arena — Challenge another player
 *   (G) Hire Ship Guard — 10,000 cr, prevents vandalism on quit
 *   (N) Cancel current mode
 *   (Q) Return to main menu
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import { SHIP_GUARD_COST, FUEL_MIN_MISSIONS, CORE_SYSTEM_NAMES, CORE_SYSTEMS } from '../constants.js';
import { setMode, hireShipGuard } from '../systems/extra-curricular.js';

// ============================================================================
// MULTI-STEP STATE (same pattern as raid.ts)
// ============================================================================

interface ECState {
  step: 'confirm' | 'pick_system' | 'confirm_system';
  mode: 'pirate' | 'star_patrol' | 'smuggler_patrol';
  systemId?: number;
  systemName?: string;
}

const pendingEC: Map<string, ECState> = new Map();

function renderSystemLegend(): string {
  let legend = '\r\n\x1b[36;1mCore Star Systems:\x1b[0m\r\n';
  for (let i = 1; i <= CORE_SYSTEMS; i++) {
    legend += `  ${String(i).padStart(2, ' ')}. ${CORE_SYSTEM_NAMES[i]}\r\n`;
  }
  return legend;
}

export const ExtraCurricularScreen: ScreenModule = {
  name: 'extra-curricular',
  render: async (characterId: string): Promise<ScreenResponse> => {
    // Clear any pending state on fresh render
    pendingEC.delete(characterId);

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const credits = formatCredits(character.creditsHigh, character.creditsLow);
    const currentMode = character.extraCurricularMode || 'none';
    const patrolInfo = character.patrolSector
      ? ` (${CORE_SYSTEM_NAMES[character.patrolSector] || `System ${character.patrolSector}`})`
      : '';
    const guardStatus = character.ship.hasShipGuard ? '\x1b[32mON DUTY\x1b[0m' : '\x1b[31mNONE\x1b[0m';

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m     EXTRA-CURRICULAR ACTIVITIES          \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[32mCredits:\x1b[0m ${credits} cr
\x1b[32mCurrent Mode:\x1b[0m ${currentMode}${patrolInfo}
\x1b[32mShip Guard:\x1b[0m ${guardStatus}

\x1b[37;1m=========================================\x1b[0m

  [P]irate Mode    - Attack ships for loot
  [S]tar Patrol    - Hunt pirates for bounties
  [C]smuggler Patrol - Intercept smugglers
  [W] Dueling Arena
  [G]uard - Hire ship guard (${SHIP_GUARD_COST.toLocaleString()} cr)
  [N]one  - Cancel current mode
  [Q]uit  - Return to main menu

\x1b[32m:\x1b[0m${character.currentSystem} Extra-Curricular:\x1b[32m:(?=Menu): Command:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();
    const state = pendingEC.get(characterId);

    // ── Multi-step flow handler ────────────────────────────────────────
    if (state) {
      return handleMultiStep(characterId, key, input.trim(), state);
    }

    // ── Top-level menu handler ─────────────────────────────────────────
    async function checkMissionPrereqs() {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        include: { ship: true },
      });
      if (!character || !character.ship) {
        return 'Need space ship';
      }
      if (character.ship.hullCondition < 1 || character.ship.driveCondition < 1) {
        return 'Functioning ship and drives needed first!';
      }
      if (character.ship.fuel < FUEL_MIN_MISSIONS) {
        return 'Not enough fuel to undertake mission!';
      }
      return null;
    }

    switch (key) {
      case 'P': {
        const err = await checkMissionPrereqs();
        if (err) return { output: `\r\n\x1b[31m${err}\x1b[0m\r\n> ` };
        // Warn about cargo (SP.END.txt line 56: if q1>0 gosub fcc3)
        const character = await prisma.character.findUnique({ where: { id: characterId } });
        let cargoWarning = '';
        if (character && character.cargoPods > 0) {
          cargoWarning = '\r\n\x1b[33mCargo contracts you have will be voided!\x1b[0m';
        }
        // SP.END.txt line 57: "Really want to go 'a pirating'? [Y]/(N)"
        pendingEC.set(characterId, { step: 'confirm', mode: 'pirate' });
        return {
          output: cargoWarning + `\r\nReally want to go 'a pirating? \x1b[37;1m[Y]\x1b[0m/(N): `,
        };
      }

      case 'S': {
        const err = await checkMissionPrereqs();
        if (err) return { output: `\r\n\x1b[31m${err}\x1b[0m\r\n> ` };
        const character = await prisma.character.findUnique({ where: { id: characterId } });
        let cargoWarning = '';
        if (character && character.cargoPods > 0) {
          cargoWarning = '\r\n\x1b[33mCargo contracts you have will be voided!\x1b[0m';
        }
        // Star Patrol goes straight to system legend + pick (no initial confirm)
        pendingEC.set(characterId, { step: 'pick_system', mode: 'star_patrol' });
        return {
          output: cargoWarning + renderSystemLegend() +
            '\r\nJoin which Star System Squadron Patrol? (1-14) \x1b[37;1m[Q]\x1b[0muit: ',
        };
      }

      case 'C': {
        const err = await checkMissionPrereqs();
        if (err) return { output: `\r\n\x1b[31m${err}\x1b[0m\r\n> ` };
        const character = await prisma.character.findUnique({ where: { id: characterId } });
        let cargoWarning = '';
        if (character && character.cargoPods > 0) {
          cargoWarning = '\r\n\x1b[33mCargo contracts you have will be voided!\x1b[0m';
        }
        // SP.END.txt line 149: "Patrol for smugglers? [Y]/(N)"
        pendingEC.set(characterId, { step: 'confirm', mode: 'smuggler_patrol' });
        return {
          output: cargoWarning + '\r\nPatrol for smugglers? \x1b[37;1m[Y]\x1b[0m/(N): ',
        };
      }

      case 'W':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'arena' };

      case 'G': {
        const result = await hireShipGuard(characterId);
        if (!result.success) {
          return { output: `\r\n\x1b[31m${result.error}\x1b[0m\r\n> ` };
        }
        return {
          output: `\r\n\x1b[32mShip guard hired! (-${result.cost!.toLocaleString()} cr)\x1b[0m\r\n> `,
        };
      }

      case 'N': {
        await setMode(characterId, null, null);
        return {
          output: '\r\n\x1b[37mExtra-curricular mode cancelled.\x1b[0m\r\n> ',
        };
      }

      case 'Q':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };

      case '?':
        // Re-render menu
        return ExtraCurricularScreen.render(characterId);

      default:
        return { output: '\r\nWhoops....\r\n> ' };
    }
  },
};

// ============================================================================
// MULTI-STEP STATE MACHINE
// ============================================================================

async function handleMultiStep(
  characterId: string,
  key: string,
  rawInput: string,
  state: ECState,
): Promise<ScreenResponse> {

  // ── Step: Confirm (pirate / smuggler patrol) ─────────────────────────
  if (state.step === 'confirm') {
    if (key === 'N') {
      pendingEC.delete(characterId);
      return { output: 'No\r\n> ' };
    }
    // Yes → show system legend and pick
    pendingEC.set(characterId, { step: 'pick_system', mode: state.mode });
    const prompt = state.mode === 'pirate'
      ? '\r\nIn which system do you wish to lurk? (1-14) \x1b[37;1m[Q]\x1b[0muits: '
      : '\r\nJoin which Star System Squadron Patrol? (1-14) \x1b[37;1m[Q]\x1b[0muit: ';
    return {
      output: 'Yes' + renderSystemLegend() + prompt,
    };
  }

  // ── Step: Pick system (1-14) ─────────────────────────────────────────
  if (state.step === 'pick_system') {
    if (key === 'Q' || key === '') {
      pendingEC.delete(characterId);
      return { output: '\r\n> ' };
    }
    if (key === '?') {
      const prompt = state.mode === 'pirate'
        ? '\r\nIn which system do you wish to lurk? (1-14) \x1b[37;1m[Q]\x1b[0muits: '
        : '\r\nJoin which Star System Squadron Patrol? (1-14) \x1b[37;1m[Q]\x1b[0muit: ';
      return { output: renderSystemLegend() + prompt };
    }

    const systemId = parseInt(rawInput, 10);
    if (isNaN(systemId) || systemId < 1 || systemId > CORE_SYSTEMS) {
      return { output: '\r\n\x1b[31mOutta range!\x1b[0m\r\n(1-14) [Q]uit: ' };
    }

    const systemName = CORE_SYSTEM_NAMES[systemId];

    // Star Patrol alliance check (SP.END.txt line 168)
    if (state.mode === 'star_patrol') {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
      });
      if (character) {
        const allianceSystem = await prisma.allianceSystem.findUnique({
          where: { systemId },
        });
        // Original: right$(nz$,1)<>o6$ — player's alliance must match system's alliance
        if (allianceSystem && allianceSystem.alliance !== 'NONE' &&
            allianceSystem.alliance !== character.allianceSymbol) {
          return {
            output: `\r\n\x1b[31mYou're not in that Alliance\x1b[0m\r\n(1-14) [Q]uit: `,
          };
        }
      }
    }

    // Pirate gets a confirmation step; patrol/smuggler just activate
    if (state.mode === 'pirate') {
      pendingEC.set(characterId, {
        step: 'confirm_system',
        mode: state.mode,
        systemId,
        systemName,
      });
      return {
        output: `\r\nIs ${systemName} your choice? \x1b[37;1m[Y]\x1b[0m/(N): `,
      };
    }

    // Star Patrol / Smuggler Patrol — activate immediately
    return activateMode(characterId, state.mode, systemId, systemName);
  }

  // ── Step: Confirm system (pirate only) ───────────────────────────────
  if (state.step === 'confirm_system') {
    if (key === 'N') {
      // Go back to system picker
      pendingEC.set(characterId, { step: 'pick_system', mode: state.mode });
      return {
        output: 'No' + renderSystemLegend() +
          '\r\nIn which system do you wish to lurk? (1-14) \x1b[37;1m[Q]\x1b[0muits: ',
      };
    }

    return activateMode(characterId, state.mode, state.systemId!, state.systemName!);
  }

  // Fallback
  pendingEC.delete(characterId);
  return { output: '\r\n> ' };
}

// ============================================================================
// ACTIVATE MODE
// ============================================================================

async function activateMode(
  characterId: string,
  mode: 'pirate' | 'star_patrol' | 'smuggler_patrol',
  systemId: number,
  systemName: string,
): Promise<ScreenResponse> {
  pendingEC.delete(characterId);
  await setMode(characterId, mode, systemId);

  if (mode === 'pirate') {
    // SP.END.txt lines 92-95: pirate launch sequence
    return {
      output: 'Yes\r\n' +
        '\r\nOutside the space port and under cover of darkness...\r\n' +
        'Your ship lifts off from a small secret launch pad.\r\n' +
        `Auto-Nav settings guide you to ${systemName}\r\n` +
        'Where you lie in wait to prey upon the trade routes.....\r\n',
      nextScreen: 'main-menu',
    };
  }

  if (mode === 'star_patrol') {
    // SP.END.txt lines 191-206: patrol launch
    const character = await prisma.character.findUnique({ where: { id: characterId } });
    const charName = character?.name || 'Spacer';
    return {
      output: '\r\n...entering coordinates into your ship\'s computer\r\n' +
        `\r\nYou lift off from the Launch Bays.........\r\n` +
        `\r\nPatrolling the ${systemName} Star System\r\n` +
        'To Defend against any and all corporate raiders\r\n',
      nextScreen: 'main-menu',
    };
  }

  // smuggler_patrol: SP.END.txt lines 191-205
  return {
    output: '\r\n...entering coordinates into your ship\'s computer\r\n' +
      `\r\nYou lift off from the Launch Bays.........\r\n` +
      `\r\nPatrolling the ${systemName} Star System\r\n` +
      'Mission: Space Patrol Search & Destroy Smuggling\r\n',
    nextScreen: 'main-menu',
  };
}
