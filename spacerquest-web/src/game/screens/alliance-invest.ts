/**
 * SpacerQuest v4.0 - Alliance Investment Center Screen (SP.VEST.S)
 *
 * Allows alliance members to invest/withdraw credits, increase DEFCON
 * on star systems, and view alliance-controlled systems.
 */

import { AllianceType } from '@prisma/client';
import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import { investInAlliance, withdrawFromAlliance, investInDefcon, acquireSystem, hostileTakeover, calculateTakeoverCost, getDefconTier, calculateDefconCostPerLevel } from '../systems/alliance.js';
import { DEFCON_MAX, CORE_SYSTEM_NAMES, CORE_SYSTEMS, ALLIANCE_STARTUP_INVESTMENT } from '../constants.js';

// ── Pending-input state (module-level maps keyed by characterId) ─────────────

const pendingInvest: Map<string, boolean> = new Map();
const pendingWithdraw: Map<string, boolean> = new Map();

interface DefconState {
  step: 'system' | 'password' | 'confirm';
  systemId?: number;
  systemName?: string;
  password?: string;
}
const pendingDefcon: Map<string, DefconState> = new Map();

interface PasswordState {
  step: 'system' | 'enter' | 'confirm';
  systemId?: number;
  systemName?: string;
  candidate?: string;
}
const pendingPassword: Map<string, PasswordState> = new Map();

interface AcquireState {
  step: 'system' | 'confirm' | 'password';
  systemId?: number;
  systemName?: string;
  password?: string;
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
    `  (N)ews     - Alliance transaction log\r\n` +
    `  (P)assword - Change system account password (CEO only)\r\n` +
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

    // SP.VEST.S:35 — if pz$<>"" print "Ah...you have the new owner documents for {pz$}":goto invtak
    if (character.raidDocument) {
      pendingTakeover.set(characterId, { step: 'system' });
      return {
        output:
          renderHeader(membership.alliance, investedStr, creditsStr) +
          `\r\n\x1b[33mAh...you have the new owner documents for ${character.raidDocument}\x1b[0m\r\n` +
          `Which Star System? (1-${CORE_SYSTEMS}) (Q)uit: `,
      };
    }

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
    // SP.VEST.S fortify/fortpass (lines 69-95): select system, then Y/N per level
    if (pendingDefcon.has(characterId)) {
      const state = pendingDefcon.get(characterId)!;

      if (state.step === 'system') {
        const raw = input.trim().toUpperCase();
        if (raw === 'Q' || raw === '') {
          pendingDefcon.delete(characterId);
          return { output: '\r\n\x1b[32mCommand:\x1b[0m ' };
        }
        const systemId = parseInt(input.trim(), 10);
        if (isNaN(systemId) || systemId < 1 || systemId > 14) {
          return {
            output: `\r\n\x1b[31mOutta range!\x1b[0m\r\nWhich system? (1-14) (Q)uit: `,
          };
        }

        // Check system ownership before entering fortification
        const sys = await prisma.allianceSystem.findUnique({ where: { systemId } });
        const sysName = CORE_SYSTEM_NAMES[systemId] || `System ${systemId}`;

        if (!sys) {
          return {
            output: `\r\n${sysName} is open for investment\r\nWhich system? (1-14) (Q)uit: `,
          };
        }
        if (sys.alliance !== membership.alliance) {
          return {
            output: `\r\nYou are not in The ${sys.alliance}\r\nWhich system? (1-14) (Q)uit: `,
          };
        }

        // Show system info and prompt for password (SP.VEST.S fort1, lines 73-78)
        const assets = formatCredits(sys.assetsHigh, sys.assetsLow);
        if (sys.defconLevel >= DEFCON_MAX) {
          pendingDefcon.delete(characterId);
          return {
            output: `\r\n[${sysName} - ${sys.alliance}][:Assets:${assets}:][:Fort:${sys.defconLevel}:]\r\n` +
              `\r\nMaximum DEFCON achieved for ${sysName}\r\n\x1b[32mCommand:\x1b[0m `,
          };
        }

        const j = getDefconTier(sys.defconLevel);
        if ((j * 10) > sys.assetsHigh) {
          pendingDefcon.delete(characterId);
          return {
            output: `\r\n[${sysName} - ${sys.alliance}][:Assets:${assets}:][:Fort:${sys.defconLevel}:]\r\n` +
              `\r\nNeed more assets in ${sysName}\r\n\x1b[32mCommand:\x1b[0m `,
          };
        }

        // SP.VEST.S fort1: password required before fortification
        pendingDefcon.set(characterId, { step: 'password', systemId, systemName: sysName });
        return {
          output: `\r\n[${sysName} - ${sys.alliance}][:Assets:${assets}:][:Fort:${sys.defconLevel}:]\r\n` +
            `\r\n\x1b[37;1mA password is required to unlock the account\x1b[0m\r\n` +
            `Enter the password for ${sysName}: `,
        };
      }

      if (state.step === 'password') {
        // SP.VEST.S fort1 (lines 75-77): verify password
        const enteredPassword = input;
        const systemId = state.systemId!;
        const sys = await prisma.allianceSystem.findUnique({ where: { systemId } });
        const sysName = state.systemName || `System ${systemId}`;

        if (!sys || !sys.password) {
          // No password set — allow fortification without password
          pendingDefcon.set(characterId, { step: 'confirm', systemId, systemName: sysName });
          const j = getDefconTier(sys?.defconLevel ?? 0);
          const costStr = `${j}00,000`;
          return {
            output: `\r\n\x1b[37;1m[Y]\x1b[0m/(N): `,
          };
        }

        if (enteredPassword !== sys.password) {
          // SP.VEST.S line 76: "Beat it bud before we call security"
          pendingDefcon.delete(characterId);
          return {
            output: `\r\n\x1b[31mBeat it bud before we call security!\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
          };
        }

        // Password correct — proceed to fortification
        pendingDefcon.set(characterId, { step: 'confirm', systemId, systemName: sysName });
        const assets = formatCredits(sys.assetsHigh, sys.assetsLow);
        const j = getDefconTier(sys.defconLevel);
        const costStr = `${j}00,000`;
        return {
          output: `\r\n[${sysName} - ${sys.alliance}][:Assets:${assets}:][:Fort:${sys.defconLevel}:]\r\n` +
            `\r\n[DEFCON:${sys.defconLevel}:]: Increase Level?  Cost: ${costStr} cr: \x1b[37;1m[Y]\x1b[0m/(N): `,
        };
      }

      if (state.step === 'confirm') {
        const key = input.trim().toUpperCase();
        if (key === 'N') {
          // SP.VEST.S definc: check if any changes were made, then save
          pendingDefcon.delete(characterId);
          return { output: 'No\r\n\x1b[32mCommand:\x1b[0m ' };
        }

        // Y or Enter → increase one level
        const systemId = state.systemId!;
        const result = await investInDefcon(characterId, systemId, 1);

        if (!result.success) {
          pendingDefcon.delete(characterId);
          return {
            output: `\r\n\x1b[31m${result.error}\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
          };
        }

        // Check if we can offer another level
        const sys = await prisma.allianceSystem.findUnique({ where: { systemId } });
        const sysName = CORE_SYSTEM_NAMES[systemId] || `System ${systemId}`;

        if (!sys || sys.defconLevel >= DEFCON_MAX) {
          pendingDefcon.delete(characterId);
          const defcon = sys?.defconLevel ?? DEFCON_MAX;
          return {
            output: `Yes\r\n\r\nMaximum DEFCON achieved for ${sysName}\r\n` +
              `Current DEFCON: Weaponry:____${defcon}00______Shielding:____${defcon}00\r\n` +
              `\x1b[32mCommand:\x1b[0m `,
          };
        }

        const j = getDefconTier(sys.defconLevel);
        if ((j * 10) > sys.assetsHigh) {
          pendingDefcon.delete(characterId);
          return {
            output: `Yes\r\n\r\nNeed more assets in ${sysName}\r\n` +
              `Current DEFCON: Weaponry:____${sys.defconLevel}00______Shielding:____${sys.defconLevel}00\r\n` +
              `\x1b[32mCommand:\x1b[0m `,
          };
        }

        // Prompt for next level (SP.VEST.S fortpass loop)
        const assets = formatCredits(sys.assetsHigh, sys.assetsLow);
        const costStr = `${j}00,000`;
        return {
          output: `Yes\r\n\r\n[${sysName} - ${sys.alliance}][:Assets:${assets}:][:Fort:${sys.defconLevel}:]\r\n` +
            `\r\n[DEFCON:${sys.defconLevel}:]: Increase Level?  Cost: ${costStr} cr: \x1b[37;1m[Y]\x1b[0m/(N): `,
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

    // ── Password change multi-step flow (SP.VEST.S P key → starget/passwd/starite) ──
    if (pendingPassword.has(characterId)) {
      return handlePasswordFlow(characterId, input, character, membership as any);
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
        // SP.VEST.S show (lines 255-280): loop ALL 14 systems, display each with
        // alliance, CEO, assets, and DEFCON — including unowned systems.
        // Original: for i=1 to 14; gosub inpin; gosub invfix; gosub invsh1; next
        // Header: "# Star System  Alliance         C E O               Assets     DEFCON"
        const allSystemRecords = await prisma.allianceSystem.findMany({
          orderBy: { systemId: 'asc' },
        });

        // Build a lookup by systemId for quick access
        const sysMap = new Map(allSystemRecords.map(s => [s.systemId, s]));

        // Fetch CEO names for all owned systems in one query
        const ownerIds = allSystemRecords
          .map(s => s.ownerCharacterId)
          .filter((id): id is string => id !== null);
        const ownerChars = ownerIds.length > 0
          ? await prisma.character.findMany({
              where: { id: { in: ownerIds } },
              select: { id: true, name: true },
            })
          : [];
        const ownerMap = new Map(ownerChars.map(c => [c.id, c.name]));

        // SP.VEST.S invsh1 column widths (original profix lx values):
        //   o3$ (star system name) lx=14, o4$ (alliance) lx=17, o5$ (CEO) lx=20
        const oc =
          ` #    Star System   Alliance              ` +
          `C E O               Assets     DEFCON`;
        const od =
          `---   -----------   ---------             ` +
          `--------------      ---------  ------`;

        let list =
          `\r\n\x1b[36;1m${oc}\x1b[0m\r\n` +
          `\x1b[37m${od}\x1b[0m\r\n`;

        for (let i = 1; i <= CORE_SYSTEMS; i++) {
          const sys = sysMap.get(i);
          const sysName = (CORE_SYSTEM_NAMES[i] || `System ${i}`).padEnd(14).slice(0, 14);
          const allianceName = sys ? sys.alliance.padEnd(17).slice(0, 17) : 'Available.........';
          const ceoName = (sys?.ownerCharacterId && ownerMap.get(sys.ownerCharacterId))
            ? (ownerMap.get(sys.ownerCharacterId) as string).padEnd(20).slice(0, 20)
            : '--------------------';
          const assets = sys ? formatCredits(sys.assetsHigh, sys.assetsLow).padStart(9) : '        0';
          const defcon = sys ? String(sys.defconLevel).padStart(2) : ' 0';
          const numStr = i < 10 ? ` ${i}` : `${i}`;
          list += ` ${numStr}.   ${sysName} ${allianceName} ${ceoName} ${assets}  ..F:${defcon}\r\n`;
        }

        list += `\x1b[37m${od}\x1b[0m\r\n`;
        list += `\x1b[32mCommand:\x1b[0m `;

        return { output: list };
      }

      // SP.VEST.S: N = Alliance Transaction log (iz=2:iy=4:link"sp.top","filer")
      case 'N': {
        const logs = await prisma.gameLog.findMany({
          where: { type: 'ALLIANCE' },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { character: { select: { name: true } } },
        });

        if (logs.length === 0) {
          return {
            output: `\r\n\x1b[33mNo alliance transactions on record.\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
          };
        }

        let out = `\r\n\x1b[36;1m Alliance Transaction Log:\x1b[0m\r\n`;
        out += `\x1b[37m ────────────────────────────────────────────────────────────────\x1b[0m\r\n`;
        for (const entry of logs) {
          const date = entry.createdAt.toISOString().slice(0, 10);
          out += ` ${date}  ${entry.message}\r\n`;
        }
        out += `\x1b[37m ────────────────────────────────────────────────────────────────\x1b[0m\r\n`;
        out += `\x1b[32mCommand:\x1b[0m `;
        return { output: out };
      }

      // SP.VEST.S: P = CEO password change (gosub starget; gosub passwd; gosub starite)
      case 'P': {
        pendingPassword.set(characterId, { step: 'system' });
        return {
          output: renderSystemLegend() +
            `\r\nWhich Star System? (1-${CORE_SYSTEMS}) (Q)uit: `,
        };
      }

      // SP.VEST.S line 51: if i$="H" print"Help!":setint(1):copy"sp.help":setint(""):goto invest1
      case 'H': {
        return { output: renderAllianceHelp() + '\x1b[32mCommand:\x1b[0m ' };
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
// PASSWORD CHANGE flow (SP.VEST.S P key → starget/passwd/starite, lines 38/208-218)
// ============================================================================

async function handlePasswordFlow(
  characterId: string,
  raw: string,
  _character: any,
  _membership: any,
): Promise<ScreenResponse> {
  const state = pendingPassword.get(characterId)!;
  const key = raw.trim().toUpperCase();

  if (state.step === 'system') {
    if (key === 'Q' || key === '') {
      pendingPassword.delete(characterId);
      return { output: '\r\n\x1b[32mCommand:\x1b[0m ' };
    }
    if (key === 'L') {
      return { output: renderSystemLegend() + `\r\nWhich Star System? (1-${CORE_SYSTEMS}) (Q)uit: ` };
    }

    const systemId = parseInt(raw.trim(), 10);
    if (isNaN(systemId) || systemId < 1 || systemId > CORE_SYSTEMS) {
      return { output: '\r\n\x1b[31mOutta range!\x1b[0m\r\nWhich Star System? (1-14) (Q)uit: ' };
    }

    const sys = await prisma.allianceSystem.findUnique({ where: { systemId } });
    const sysName = CORE_SYSTEM_NAMES[systemId] || `System ${systemId}`;

    if (!sys) {
      return { output: `\r\n${sysName} is open for investment\r\nWhich Star System? (1-14) (Q)uit: ` };
    }

    // SP.VEST.S passwd subroutine: "C E O  privilege only!" (o5$<>na$)
    if (sys.ownerCharacterId !== characterId) {
      pendingPassword.delete(characterId);
      return {
        output: `\r\n\x1b[31mC E O  privilege only!\x1b[0m\r\n\x1b[32mCommand:\x1b[0m `,
      };
    }

    pendingPassword.set(characterId, { step: 'enter', systemId, systemName: sysName });
    return {
      output: `\r\n${sysName} - ${sys.alliance}\r\n` +
        `\r\nType a password (4-8 characters) (Q)uits: `,
    };
  }

  if (state.step === 'enter') {
    if (key === 'Q') {
      // SP.VEST.S passwd: "No Password":o7$=""
      const systemId = state.systemId!;
      await prisma.allianceSystem.update({
        where: { systemId },
        data: { password: null },
      });
      pendingPassword.delete(characterId);
      return { output: 'No Password\r\n\x1b[32mCommand:\x1b[0m ' };
    }

    const pw = raw.trim();
    // SP.VEST.S passwd: if (len(i$)<4) or (len(i$)>8) goto passwd
    if (pw.length < 4 || pw.length > 8) {
      return { output: `\r\n\x1b[31mPassword must be 4-8 characters.\x1b[0m\r\nType a password (4-8 characters) (Q)uits: ` };
    }

    pendingPassword.set(characterId, { ...state, step: 'confirm', candidate: pw });
    return {
      output: `\r\n${pw} <---...is this the password you wish? \x1b[37;1m[Y]\x1b[0m/(N): `,
    };
  }

  if (state.step === 'confirm') {
    if (key === 'N') {
      // SP.VEST.S passwd: "No":goto passwd
      pendingPassword.set(characterId, { step: 'enter', systemId: state.systemId, systemName: state.systemName });
      return { output: `No\r\nType a password (4-8 characters) (Q)uits: ` };
    }

    // Save the new password (SP.VEST.S: print"Yes":return → gosub starite → save)
    const systemId = state.systemId!;
    await prisma.allianceSystem.update({
      where: { systemId },
      data: { password: state.candidate },
    });
    pendingPassword.delete(characterId);
    return { output: `Yes\r\n\x1b[32mCommand:\x1b[0m ` };
  }

  pendingPassword.delete(characterId);
  return { output: '\r\n\x1b[32mCommand:\x1b[0m ' };
}

// ============================================================================
// Alliance Help (SP.HELP — Alliance Holdings Section)
// SP.VEST.S line 51: copy"sp.help"
// ============================================================================

export function renderAllianceHelp(): string {
  const L = '\r\n';
  return (
    L +
    '\x1b[36;1mAlliance Holdings Section:\x1b[0m' + L +
    '\x1b[37m--------------------------\x1b[0m' + L +
    '  Alliances are able to invest in an entire star system\'s planet. This' + L +
    '  planet can be a headquarters which can be fortified against attack by' + L +
    '  other alliances.' + L +
    L +
    '  When exiting from the game, a spacer is given a choice which includes' + L +
    '  standing guard over one of his alliance planets. Any other alliance' + L +
    '  wishing to attack that planet, then would have to fight through the' + L +
    '  guard ships finishing up by then having to fight the fortified' + L +
    '  headquarters of the attacked alliance. If successful, he would then' + L +
    '  claim the planet in question for his alliance. If he fails to survive,' + L +
    '  then his ship is destroyed.' + L +
    L +
    '  Commands: (I)nvest  (T)akeover  (D)eposit  (W)ithdraw' + L +
    '            (F)ort    (S)ystems   (N)ews     (P)assword  (Q)uit' + L +
    L
  );
}

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

    // SP.VEST.S line 67: gosub passwd — set account password
    pendingAcquire.set(characterId, { step: 'password', systemId: state.systemId, systemName: state.systemName });
    return {
      output: `\r\n\x1b[37;1mA password is required to secure the account\x1b[0m\r\n` +
        `Enter a password for ${state.systemName}: `,
    };
  }

  if (state.step === 'password') {
    // Store the password and complete the acquisition
    const password = raw;
    pendingAcquire.delete(characterId);
    const result = await acquireSystem(characterId, state.systemId!, password);

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

    // SP.VEST.S:168-179 — if pz$=o3$ skip eligibility and cost: goto invtak2
    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (character?.raidDocument === systemName) {
      // Raid document holder — execute takeover directly (no cost, no confirm)
      pendingTakeover.delete(characterId);
      const previousAlliance = allianceSystem.alliance;
      await prisma.$transaction([
        prisma.allianceSystem.update({
          where: { systemId },
          data: {
            alliance: membership.alliance as AllianceType,
            ownerCharacterId: characterId,
            defconLevel: 1,
            lastTakeoverAttempt: new Date(),
          },
        }),
        prisma.character.update({
          where: { id: characterId },
          data: { raidDocument: null },
        }),
        prisma.gameLog.create({
          data: {
            type: 'ALLIANCE',
            characterId,
            systemId,
            message: `: [${membership.alliance}] - Take-Over ${systemName} from ${previousAlliance} by ${character.name}`,
            metadata: { event: 'RAID_TAKEOVER', systemId, systemName, newAlliance: membership.alliance, previousAlliance },
          },
        }),
      ]);
      return {
        output:
          `\r\nYou are now the new  C E O  of the board of ${systemName} Ltd\r\n` +
          `The ${membership.alliance} now controls this star system\r\n` +
          `\x1b[32mCommand:\x1b[0m `,
      };
    }

    // SP.VEST.S takeover eligibility (lines 170-173)
    const isBankrupt = allianceSystem.assetsHigh < 1 && allianceSystem.assetsLow < 10000;
    if (!isBankrupt) {
      if (allianceSystem.assetsHigh >= 200) {
        return {
          output: `\r\nAssets greater than 1,999,999...${systemName} safe from Take-Over\r\nWhich Star System? (1-14) (Q)uit: `,
        };
      }
      if (allianceSystem.assetsHigh < 10) {
        return {
          output: `\r\n${systemName}'s Assets need to be > 99,999 for Take-Over\r\nWhich Star System? (1-14) (Q)uit: `,
        };
      }
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
