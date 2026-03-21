/**
 * SpacerQuest v4.0 - Alliance Investment Center Screen (SP.VEST.S)
 *
 * Allows alliance members to invest/withdraw credits, increase DEFCON
 * on star systems, and view alliance-controlled systems.
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import { investInAlliance, withdrawFromAlliance, investInDefcon, acquireSystem, hostileTakeover, calculateTakeoverCost } from '../systems/alliance.js';
import { DEFCON_COST_PER_LEVEL, CORE_SYSTEM_NAMES, CORE_SYSTEMS, ALLIANCE_STARTUP_INVESTMENT } from '../constants.js';

// ── Pending-input state (module-level maps keyed by characterId) ─────────────

const pendingInvest: Map<string, boolean> = new Map();
const pendingWithdraw: Map<string, boolean> = new Map();

interface DefconState {
  step: 'system' | 'levels';
  systemId?: number;
}
const pendingDefcon: Map<string, DefconState> = new Map();

interface AcquireState {
  step: 'system' | 'confirm';
  systemId?: number;
  systemName?: string;
}
const pendingAcquire: Map<string, AcquireState> = new Map();

interface TakeoverState {
  step: 'system' | 'confirm';
  systemId?: number;
  systemName?: string;
  cost?: number;
  previousAlliance?: string;
}
const pendingTakeover: Map<string, TakeoverState> = new Map();

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
    `  (I)nvest   - Acquire an unowned star system\r\n` +
    `  (T)akeover - Hostile takeover of enemy system\r\n` +
    `  (D)eposit  - Deposit credits into alliance treasury\r\n` +
    `  (W)ithdraw - Withdraw from treasury\r\n` +
    `  (F)ort     - Increase system defense level\r\n` +
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
        // SP.VEST.S line 219: only systems 1-14 are investable (14 core star systems)
        if (isNaN(systemId) || systemId < 1 || systemId > 14) {
          pendingDefcon.delete(characterId);
          return {
            output: `\r\n\x1b[31mInvalid system number. Must be 1–14.\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
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

    // ── Acquire (Invest) multi-step flow ─────────────────────────────────────
    if (pendingAcquire.has(characterId)) {
      return handleAcquireFlow(characterId, input.trim(), membership);
    }

    // ── Hostile Takeover multi-step flow ───────────────────────────────────
    if (pendingTakeover.has(characterId)) {
      return handleTakeoverFlow(characterId, input.trim(), membership);
    }

    // ── Deposit multi-step flow ───────────────────────────────────────────
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
          output: `\r\n\x1b[31mDeposit failed: ${result.error}\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
        };
      }

      return {
        output: `\r\n\x1b[32m${amount.toLocaleString()} cr deposited successfully. New balance: ${result.newBalance?.toLocaleString()} cr.\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
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
      // SP.VEST.S: I = Invest (Acquire unowned system)
      case 'I': {
        pendingAcquire.set(characterId, { step: 'system' });
        return {
          output: renderSystemLegend() +
            `\r\nWhich Star System? (1-${CORE_SYSTEMS}) (Q)uit: `,
        };
      }

      // SP.VEST.S: T = Hostile Take-Over
      case 'T': {
        pendingTakeover.set(characterId, { step: 'system' });
        return {
          output: renderSystemLegend() +
            `\r\nWhich Star System? (1-${CORE_SYSTEMS}) (Q)uit: `,
        };
      }

      // SP.VEST.S: D = Deposit Funds
      case 'D': {
        pendingInvest.set(characterId, true);
        return { output: '\r\nHow much to deposit? (Enter amount): ' };
      }

      case 'W': {
        pendingWithdraw.set(characterId, true);
        return { output: '\r\nHow much to withdraw? (Enter amount): ' };
      }

      // SP.VEST.S: F = Fortifications (DEFCON)
      case 'F': {
        pendingDefcon.set(characterId, { step: 'system' });
        return { output: '\r\nWhich system? (1-14): ' };
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

        // SP.VEST.S show: system, alliance, CEO, assets, DEFCON
        let list =
          `\r\n\x1b[36;1m Alliance Systems for ${membership.alliance}:\x1b[0m\r\n` +
          `\x1b[37m ─────────────────────────────────────────────────\x1b[0m\r\n` +
          ` ${'#'.padEnd(4)} ${'System'.padEnd(16)} ${'Assets'.padEnd(12)} DEFCON\r\n` +
          ` ${'---'.padEnd(4)} ${'------'.padEnd(16)} ${'------'.padEnd(12)} ------\r\n`;

        for (const sys of systems) {
          const sysName = CORE_SYSTEM_NAMES[sys.systemId] || `System ${sys.systemId}`;
          const assets = formatCredits(sys.assetsHigh, sys.assetsLow);
          list += ` ${String(sys.systemId).padStart(2, ' ')}   ${sysName.padEnd(16)} ${(assets + ' cr').padEnd(12)} F:${String(sys.defconLevel).padStart(2, ' ')}\r\n`;
        }

        list += `\x1b[37m ─────────────────────────────────────────────────\x1b[0m\r\n`;
        list += `\x1b[32mCommand:\x1b[0m `;

        return { output: list };
      }

      case '?': {
        return AllianceInvestScreen.render(characterId);
      }

      case 'Q': {
        return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
      }

      default: {
        return {
          output: `\r\n\x1b[31mWhoops!...hit <C-R> to continue...\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
        };
      }
    }
  },
};

// ============================================================================
// System Legend helper
// ============================================================================

function renderSystemLegend(): string {
  let legend = '\r\n\x1b[36;1mCore Star Systems:\x1b[0m\r\n';
  for (let i = 1; i <= CORE_SYSTEMS; i++) {
    legend += `  ${String(i).padStart(2, ' ')}. ${CORE_SYSTEM_NAMES[i]}\r\n`;
  }
  return legend;
}

// ============================================================================
// ACQUIRE flow (SP.VEST.S invall, lines 55-67)
// ============================================================================

async function handleAcquireFlow(
  characterId: string, raw: string, membership: any
): Promise<ScreenResponse> {
  const state = pendingAcquire.get(characterId)!;
  const key = raw.toUpperCase();

  if (state.step === 'system') {
    if (key === 'Q' || key === '') {
      pendingAcquire.delete(characterId);
      return { output: '\r\n\x1b[32mCommand:\x1b[0m ' };
    }
    if (key === 'L') {
      return { output: renderSystemLegend() + `\r\nWhich Star System? (1-${CORE_SYSTEMS}) (Q)uit: ` };
    }

    const systemId = parseInt(raw, 10);
    if (isNaN(systemId) || systemId < 1 || systemId > CORE_SYSTEMS) {
      return { output: '\r\n\x1b[31mOutta range!\x1b[0m\r\nWhich Star System? (1-14) (Q)uit: ' };
    }

    // Check if system is already owned
    const existing = await prisma.allianceSystem.findUnique({ where: { systemId } });
    if (existing) {
      const sysName = CORE_SYSTEM_NAMES[systemId] || `System ${systemId}`;
      return {
        output: `\r\n${sysName} belongs to The ${existing.alliance}\r\nWhich Star System? (1-14) (Q)uit: `,
      };
    }

    const systemName = CORE_SYSTEM_NAMES[systemId] || `System ${systemId}`;
    pendingAcquire.set(characterId, { step: 'confirm', systemId, systemName });
    // SP.VEST.S line 59: "Startup funds of 10,000 cr are required....Do this? [Y]/(N)"
    return {
      output: `\r\n${systemName} - Available for Investment\r\n` +
        `\r\nStartup funds of ${ALLIANCE_STARTUP_INVESTMENT.toLocaleString()} cr are required....Do this? \x1b[37;1m[Y]\x1b[0m/(N): `,
    };
  }

  if (state.step === 'confirm') {
    if (key === 'N') {
      pendingAcquire.delete(characterId);
      return { output: 'No\r\n\x1b[32mCommand:\x1b[0m ' };
    }

    pendingAcquire.delete(characterId);
    const result = await acquireSystem(characterId, state.systemId!);

    if (!result.success) {
      return {
        output: `\r\n\x1b[31m${result.error}\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
      };
    }

    return {
      output: `Yes\r\n` +
        `\r\nYou are now the  C E O  of the board for ${result.systemName}\r\n` +
        `\x1b[32mCommand:\x1b[0m `,
    };
  }

  pendingAcquire.delete(characterId);
  return { output: '\r\n\x1b[32mCommand:\x1b[0m ' };
}

// ============================================================================
// HOSTILE TAKEOVER flow (SP.VEST.S invtak, lines 170-192)
// ============================================================================

async function handleTakeoverFlow(
  characterId: string, raw: string, membership: any
): Promise<ScreenResponse> {
  const state = pendingTakeover.get(characterId)!;
  const key = raw.toUpperCase();

  if (state.step === 'system') {
    if (key === 'Q' || key === '') {
      pendingTakeover.delete(characterId);
      return { output: '\r\n\x1b[32mCommand:\x1b[0m ' };
    }
    if (key === 'L') {
      return { output: renderSystemLegend() + `\r\nWhich Star System? (1-${CORE_SYSTEMS}) (Q)uit: ` };
    }

    const systemId = parseInt(raw, 10);
    if (isNaN(systemId) || systemId < 1 || systemId > CORE_SYSTEMS) {
      return { output: '\r\n\x1b[31mOutta range!\x1b[0m\r\nWhich Star System? (1-14) (Q)uit: ' };
    }

    const allianceSystem = await prisma.allianceSystem.findUnique({ where: { systemId } });
    const systemName = CORE_SYSTEM_NAMES[systemId] || `System ${systemId}`;

    if (!allianceSystem) {
      return {
        output: `\r\n${systemName} belongs to no alliance\r\nWhich Star System? (1-14) (Q)uit: `,
      };
    }

    if (allianceSystem.alliance === membership.alliance) {
      return {
        output: `\r\n${systemName} already belongs to your alliance\r\nWhich Star System? (1-14) (Q)uit: `,
      };
    }

    // SP.VEST.S line 176: if o3>=200 → safe from takeover
    if (allianceSystem.assetsHigh >= 200) {
      return {
        output: `\r\nAssets greater than 1,999,999...${systemName} safe from Take-Over\r\nWhich Star System? (1-14) (Q)uit: `,
      };
    }

    const cost = calculateTakeoverCost(allianceSystem.assetsHigh);

    // Show current CEO if any
    let ceoInfo = '';
    if (allianceSystem.ownerCharacterId) {
      const ceo = await prisma.character.findUnique({ where: { id: allianceSystem.ownerCharacterId } });
      if (ceo) {
        ceoInfo = `\r\n${ceo.name} is current  C E O  of the board for ${systemName}`;
      }
    }

    pendingTakeover.set(characterId, {
      step: 'confirm',
      systemId,
      systemName,
      cost,
      previousAlliance: allianceSystem.alliance,
    });

    // SP.VEST.S lines 181-182
    return {
      output: `\r\n${systemName} - Owned by ${allianceSystem.alliance}` +
        ceoInfo +
        `\r\n\r\nTake-Over requires ${cost.toLocaleString()} cr....Do this? \x1b[37;1m[Y]\x1b[0m/(N): `,
    };
  }

  if (state.step === 'confirm') {
    if (key === 'N') {
      pendingTakeover.delete(characterId);
      return { output: 'No\r\n\x1b[32mCommand:\x1b[0m ' };
    }

    pendingTakeover.delete(characterId);
    const result = await hostileTakeover(characterId, state.systemId!);

    if (!result.success) {
      return {
        output: `\r\n\x1b[31m${result.error}\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
      };
    }

    return {
      output: `Yes\r\n` +
        `\r\nYou are now the new  C E O  of the board of ${result.systemName} Ltd\r\n` +
        `The ${membership.alliance} now controls this star system\r\n` +
        `\x1b[32mCommand:\x1b[0m `,
    };
  }

  pendingTakeover.delete(characterId);
  return { output: '\r\n\x1b[32mCommand:\x1b[0m ' };
}
