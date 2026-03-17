/**
 * SpacerQuest v4.0 - Alliance Investment Center Screen (SP.VEST.S)
 *
 * Allows alliance members to invest/withdraw credits, increase DEFCON
 * on star systems, and view alliance-controlled systems.
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import { investInAlliance, withdrawFromAlliance, investInDefcon } from '../systems/alliance.js';
import { DEFCON_COST_PER_LEVEL } from '../constants.js';

// ── Pending-input state (module-level maps keyed by characterId) ─────────────

const pendingInvest: Map<string, boolean> = new Map();
const pendingWithdraw: Map<string, boolean> = new Map();

interface DefconState {
  step: 'system' | 'levels';
  systemId?: number;
}
const pendingDefcon: Map<string, DefconState> = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderHeader(allianceName: string, investedStr: string, creditsStr: string): string {
  return (
    `\x1b[2J\x1b[H` +
    `\x1b[36;1m_________________________________________\x1b[0m\r\n` +
    `\x1b[33;1m    ALLIANCE INVESTMENT CENTER            \x1b[0m\r\n` +
    `\x1b[36;1m_________________________________________\x1b[0m\r\n` +
    `\r\n` +
    `\x1b[32mAlliance:\x1b[0m ${allianceName}\r\n` +
    `\x1b[32mInvested:\x1b[0m ${investedStr} cr\r\n` +
    `\x1b[32mCredits on hand:\x1b[0m ${creditsStr} cr\r\n` +
    `\r\n` +
    `\x1b[37;1m=========================================\x1b[0m\r\n` +
    `\r\n` +
    `  (I)nvest   - Deposit credits into alliance treasury\r\n` +
    `  (W)ithdraw - Withdraw from treasury\r\n` +
    `  (D)EFCON   - Increase system defense level\r\n` +
    `  (S)ystems  - View alliance-controlled systems\r\n` +
    `  (Q)uit     - Return to main menu\r\n` +
    `\r\n` +
    `\x1b[32mCommand:\x1b[0m `
  );
}

// ── ScreenModule ─────────────────────────────────────────────────────────────

export const AllianceInvestScreen: ScreenModule = {
  name: 'alliance-invest',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const membership = await prisma.allianceMembership.findUnique({
      where: { characterId },
    });

    if (!membership || membership.alliance === 'NONE') {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
    }

    const investedStr = formatCredits(membership.creditsHigh, membership.creditsLow);
    const creditsStr = formatCredits(character.creditsHigh, character.creditsLow);

    return { output: renderHeader(membership.alliance, investedStr, creditsStr) };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    // Always fetch fresh data
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const membership = await prisma.allianceMembership.findUnique({
      where: { characterId },
    });

    if (!membership || membership.alliance === 'NONE') {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
    }

    // ── DEFCON multi-step flow ──────────────────────────────────────────────
    if (pendingDefcon.has(characterId)) {
      const state = pendingDefcon.get(characterId)!;

      if (state.step === 'system') {
        const systemId = parseInt(input.trim(), 10);
        if (isNaN(systemId) || systemId < 1 || systemId > 28) {
          pendingDefcon.delete(characterId);
          return {
            output: `\r\n\x1b[31mInvalid system number. Must be 1–28.\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
          };
        }
        pendingDefcon.set(characterId, { step: 'levels', systemId });
        const costNote = `\x1b[33mCost: ${DEFCON_COST_PER_LEVEL.toLocaleString()} cr per level\x1b[0m`;
        return {
          output: `\r\n${costNote}\r\nHow many levels? (1-10): `,
        };
      }

      if (state.step === 'levels') {
        const levels = parseInt(input.trim(), 10);
        if (isNaN(levels) || levels < 1 || levels > 10) {
          pendingDefcon.delete(characterId);
          return {
            output: `\r\n\x1b[31mInvalid level count. Must be 1–10.\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
          };
        }

        const systemId = state.systemId!;
        pendingDefcon.delete(characterId);

        const result = await investInDefcon(characterId, systemId, levels);

        const color = result.success ? '\x1b[32m' : '\x1b[31m';
        const message = result.success
          ? (result.message ?? `DEFCON updated for system ${systemId}.`)
          : (result.error ?? 'Operation failed.');

        return {
          output: `\r\n${color}${message}\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
        };
      }
    }

    // ── Invest multi-step flow ──────────────────────────────────────────────
    if (pendingInvest.has(characterId)) {
      pendingInvest.delete(characterId);

      const amount = parseInt(input.trim(), 10);
      if (isNaN(amount) || amount <= 0) {
        return {
          output: `\r\n\x1b[31mInvalid amount.\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
        };
      }

      const result = await investInAlliance(characterId, amount);

      if (!result.success) {
        return {
          output: `\r\n\x1b[31mInvestment failed: ${result.error}\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
        };
      }

      return {
        output: `\r\n\x1b[32m${amount.toLocaleString()} cr invested successfully. New balance: ${result.newBalance?.toLocaleString()} cr.\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
      };
    }

    // ── Withdraw multi-step flow ────────────────────────────────────────────
    if (pendingWithdraw.has(characterId)) {
      pendingWithdraw.delete(characterId);

      const amount = parseInt(input.trim(), 10);
      if (isNaN(amount) || amount <= 0) {
        return {
          output: `\r\n\x1b[31mInvalid amount.\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
        };
      }

      const result = await withdrawFromAlliance(characterId, amount);

      if (!result.success) {
        return {
          output: `\r\n\x1b[31mWithdrawal failed: ${result.error}\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
        };
      }

      return {
        output: `\r\n\x1b[32m${amount.toLocaleString()} cr withdrawn successfully.\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
      };
    }

    // ── Top-level command dispatch ──────────────────────────────────────────
    const key = input.trim().toUpperCase();

    switch (key) {
      case 'I': {
        pendingInvest.set(characterId, true);
        return { output: '\r\nHow much to invest? (Enter amount): ' };
      }

      case 'W': {
        pendingWithdraw.set(characterId, true);
        return { output: '\r\nHow much to withdraw? (Enter amount): ' };
      }

      case 'D': {
        pendingDefcon.set(characterId, { step: 'system' });
        return { output: '\r\nWhich system? (1-28): ' };
      }

      case 'S': {
        const systems = await prisma.allianceSystem.findMany({
          where: { alliance: membership.alliance },
          orderBy: { systemId: 'asc' },
        });

        if (systems.length === 0) {
          return {
            output: `\r\n\x1b[33mYour alliance controls no systems.\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
          };
        }

        let list =
          `\r\n\x1b[36;1m Alliance Systems for ${membership.alliance}:\x1b[0m\r\n` +
          `\x1b[37m ─────────────────────────────────────────\x1b[0m\r\n`;

        for (const sys of systems) {
          list += ` System \x1b[33m${String(sys.systemId).padStart(2, ' ')}\x1b[0m  DEFCON: \x1b[32m${sys.defconLevel}\x1b[0m\r\n`;
        }

        list += `\x1b[37m ─────────────────────────────────────────\x1b[0m\r\n`;
        list += `\x1b[32mCommand:\x1b[0m `;

        return { output: list };
      }

      case 'Q': {
        return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
      }

      default: {
        return {
          output: `\r\n\x1b[31mInvalid command. Press I, W, D, S, or Q.\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
        };
      }
    }
  },
};
