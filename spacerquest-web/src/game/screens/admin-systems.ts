/**
 * SpacerQuest v4.0 - Admin Star System Editor Screen (SP.EDIT2 star systems)
 *
 * View and edit star system configuration: alliance, DEFCON, visit count, port owner.
 * SP.EDIT2.txt lines 353-450: Star System Editor with 10 fields per system.
 * Also covers Alliance Savings Editor (SP.EDIT2.txt lines 327-351).
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';

interface SystemEditorState {
  step: 'LIST' | 'VIEW' | 'EDIT' | 'EDIT_VALUE' | 'ALLIANCE_VIEW';
  selectedSystemId?: number;
  editField?: string;
}

const editorStates = new Map<string, SystemEditorState>();

const SYSTEM_FIELDS: Record<string, { field: string; label: string }> = {
  '1': { field: 'defconLevel', label: 'DEFCON Level' },
  '2': { field: 'visitCount', label: 'Visit Count' },
  '3': { field: 'fuelPrice', label: 'Fuel Price' },
  '4': { field: 'fuelStored', label: 'Fuel Stored' },
};

export const AdminSystemsScreen: ScreenModule = {
  name: 'admin-systems',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { user: { select: { isAdmin: true } } },
    });

    if (!character || !character.user.isAdmin) {
      return { output: '\x1b[31mAccess denied.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    editorStates.set(characterId, { step: 'LIST' });
    return renderSystemList();
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();
    const raw = input.trim();
    const state = editorStates.get(characterId) || { step: 'LIST' };

    if (key === 'M') {
      editorStates.delete(characterId);
      return { output: '\x1b[2J\x1b[H', nextScreen: 'admin-menu' };
    }

    // ── LIST ───────────────────────────────────────────────────────────────
    if (state.step === 'LIST') {
      // A = alliance savings view
      if (key === 'A') {
        state.step = 'ALLIANCE_VIEW';
        editorStates.set(characterId, state);
        return renderAllianceSavings();
      }
      const sysId = parseInt(raw, 10);
      if (isNaN(sysId) || sysId < 1) {
        return { output: '\r\n\x1b[31mEnter system ID (1-28), [A]lliance savings, or [M]enu.\x1b[0m\r\n> ' };
      }
      const system = await prisma.starSystem.findUnique({ where: { id: sysId } });
      if (!system) {
        return { output: `\r\n\x1b[31mSystem ${sysId} not found.\x1b[0m\r\n> ` };
      }
      state.step = 'VIEW';
      state.selectedSystemId = sysId;
      editorStates.set(characterId, state);
      return renderSystemView(system);
    }

    // ── ALLIANCE_VIEW ──────────────────────────────────────────────────────
    if (state.step === 'ALLIANCE_VIEW') {
      state.step = 'LIST';
      editorStates.set(characterId, state);
      return renderSystemList();
    }

    // ── VIEW ───────────────────────────────────────────────────────────────
    if (state.step === 'VIEW') {
      if (key === 'E') {
        state.step = 'EDIT';
        editorStates.set(characterId, state);
        return renderSystemEditMenu();
      }
      if (key === 'B') {
        state.step = 'LIST';
        state.selectedSystemId = undefined;
        editorStates.set(characterId, state);
        return renderSystemList();
      }
      return { output: '\r\n\x1b[31m[E]dit  [B]ack to list  [M]enu\x1b[0m\r\n> ' };
    }

    // ── EDIT ───────────────────────────────────────────────────────────────
    if (state.step === 'EDIT') {
      const entry = SYSTEM_FIELDS[key];
      if (!entry) {
        state.step = 'VIEW';
        editorStates.set(characterId, state);
        const system = await prisma.starSystem.findUnique({ where: { id: state.selectedSystemId! } });
        return renderSystemView(system);
      }
      state.editField = entry.field;
      state.step = 'EDIT_VALUE';
      editorStates.set(characterId, state);
      return { output: `\r\nEnter new value for \x1b[33m${entry.label}\x1b[0m:\r\n> ` };
    }

    // ── EDIT_VALUE ─────────────────────────────────────────────────────────
    if (state.step === 'EDIT_VALUE' && state.editField) {
      const newValue = parseInt(raw, 10);
      if (isNaN(newValue) || newValue < 0) {
        state.step = 'VIEW';
        state.editField = undefined;
        editorStates.set(characterId, state);
        return { output: '\r\n\x1b[31mInvalid value. Edit cancelled.\x1b[0m\r\n> ' };
      }

      await prisma.starSystem.update({
        where: { id: state.selectedSystemId! },
        data: { [state.editField]: newValue },
      });

      const label = Object.values(SYSTEM_FIELDS).find(f => f.field === state.editField)?.label || state.editField;
      state.editField = undefined;
      state.step = 'VIEW';
      editorStates.set(characterId, state);

      const system = await prisma.starSystem.findUnique({ where: { id: state.selectedSystemId! } });
      return {
        output: `\r\n\x1b[32m${label} updated to ${newValue}.\x1b[0m\r\n${renderSystemView(system).output}`,
      };
    }

    return { output: '\r\n\x1b[31mUnknown state.\x1b[0m\r\n> ' };
  },
};

async function renderSystemList(): Promise<ScreenResponse> {
  const systems = await prisma.starSystem.findMany({
    orderBy: { id: 'asc' },
  });

  let out = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[31;1m      STAR SYSTEM EDITOR  (SP.EDIT2)      \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[33m  ID  Name              Type      Alliance         DEFCON  Visits\x1b[0m
\x1b[37m───  ────────────────  ────────  ───────────────  ──────  ──────\x1b[0m\r\n`;

  for (const s of systems) {
    out += `  ${String(s.id).padStart(2)}  ${s.name.padEnd(16)}  ${s.type.padEnd(8)}  ${s.allianceControl.padEnd(15)}  ${String(s.defconLevel).padStart(6)}  ${String(s.visitCount).padStart(6)}\r\n`;
  }

  out += `\r\nEnter system ID to view, [A]lliance savings, [M]ain Menu:\r\n> `;
  return { output: out };
}

function renderSystemView(system: any): ScreenResponse {
  if (!system) {
    return { output: '\x1b[31mSystem not found.\x1b[0m\r\n> ' };
  }

  let out = `\r\n\x1b[33;1m=== ${system.name} (System #${system.id}) ===\x1b[0m\r\n\r\n`;
  out += `  Type:            ${system.type}\r\n`;
  out += `  Alliance:        ${system.allianceControl}\r\n`;
  out += `  DEFCON Level:    ${system.defconLevel}\r\n`;
  out += `  Visit Count:     ${system.visitCount}\r\n`;
  out += `  Fuel Price:      ${system.fuelPrice}\r\n`;
  out += `  Fuel Stored:     ${system.fuelStored}\r\n`;
  out += `  Port Owner:      ${system.portOwner || '(none)'}\r\n`;
  out += `  Last Activity:   ${system.lastActivity.toISOString().slice(0, 16).replace('T', ' ')}\r\n`;
  out += `\r\n  [E]dit  [B]ack to list  [M]enu\r\n> `;
  return { output: out };
}

// SP.EDIT2.txt lines 327-351: Alliance savings/bank accounts
async function renderAllianceSavings(): Promise<ScreenResponse> {
  const alliances = await prisma.allianceMembership.groupBy({
    by: ['alliance'],
    _sum: { creditsHigh: true, creditsLow: true },
    _count: true,
  });

  let out = `\r\n\x1b[33;1m=== ALLIANCE SAVINGS ===\x1b[0m\r\n\r\n`;
  out += `\x1b[33m  Alliance            Members  Total Credits\x1b[0m\r\n`;

  for (const a of alliances) {
    const totalCredits = formatCredits(a._sum.creditsHigh || 0, a._sum.creditsLow || 0);
    out += `  ${a.alliance.padEnd(18)}  ${String(a._count).padStart(7)}  ${totalCredits}\r\n`;
  }

  if (alliances.length === 0) {
    out += `  (No alliance memberships)\r\n`;
  }

  out += `\r\nPress any key to return to system list...\r\n> `;
  return { output: out };
}

function renderSystemEditMenu(): ScreenResponse {
  let out = `\r\n\x1b[33;1mSelect field to edit:\x1b[0m\r\n`;
  for (const [key, entry] of Object.entries(SYSTEM_FIELDS)) {
    out += `  [${key}] ${entry.label}\r\n`;
  }
  out += `\r\nEnter field number or any other key to cancel:\r\n> `;
  return { output: out };
}
