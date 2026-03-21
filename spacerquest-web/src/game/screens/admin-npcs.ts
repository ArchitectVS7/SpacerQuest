/**
 * SpacerQuest v4.0 - Admin NPC Editor Screen (SP.EDIT2)
 *
 * View, edit, auto-create, and delete NPC roster entries.
 * SP.EDIT2.txt: 20 variables per NPC, auto-generate (M), add/delete (A).
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { NpcType } from '@prisma/client';
import { CORE_SYSTEM_NAMES } from '../constants.js';

interface NpcEditorState {
  step: 'MENU' | 'NPC_LIST' | 'VIEW' | 'EDIT' | 'EDIT_VALUE' | 'CREATE_STRENGTH' | 'DELETE_CONFIRM';
  filterType?: NpcType;
  selectedId?: string;
  editField?: string;
}

const editorStates = new Map<string, NpcEditorState>();

const NPC_TYPE_LABELS: Record<string, NpcType> = {
  '1': 'PIRATE' as NpcType,
  '2': 'PATROL' as NpcType,
  '3': 'RIM_PIRATE' as NpcType,
  '4': 'BRIGAND' as NpcType,
  '5': 'REPTILOID' as NpcType,
};

// SP.EDIT2: all editable NPC fields (expanded from 9 to 14)
const EDITABLE_NPC_FIELDS: Record<string, { field: string; label: string }> = {
  '1': { field: 'weaponStrength', label: 'Weapon Strength (p7)' },
  '2': { field: 'weaponCondition', label: 'Weapon Condition (p8)' },
  '3': { field: 'shieldStrength', label: 'Shield Strength (s7)' },
  '4': { field: 'shieldCondition', label: 'Shield Condition (s8)' },
  '5': { field: 'hullStrength', label: 'Hull Strength (s5)' },
  '6': { field: 'hullCondition', label: 'Hull Condition (p9)' },
  '7': { field: 'driveStrength', label: 'Drive Strength (s3)' },
  '8': { field: 'driveCondition', label: 'Drive Condition (s4)' },
  '9': { field: 'creditValue', label: 'Credit Value (p5)' },
  'A': { field: 'fuelCapacity', label: 'Fuel Capacity (p6)' },
  'B': { field: 'lifeSupportCond', label: 'Life Support (s9)' },
  'C': { field: 'shipClass', label: 'Ship Class (p3$)' },
  'D': { field: 'commander', label: 'Commander (p4$)' },
  'E': { field: 'shipName', label: 'Ship Name (p5$)' },
};

// SP.EDIT2.txt lines 181-192: patrol auto-generate templates by strength 1-9
const PATROL_TEMPLATES: Record<number, { commander: string; shipName: string; shipClass: string }> = {
  1: { commander: 'Lt.Savage', shipName: 'SP1.Thor', shipClass: 'SLOOP' },
  2: { commander: 'Cmdr.Strong', shipName: 'SP2.Hercules', shipClass: 'CUTTER' },
  3: { commander: 'Como.Brainerd', shipName: 'SP3.Fearless', shipClass: 'BARK' },
  4: { commander: 'Capt.Brutus', shipName: 'SP4.Darkover', shipClass: 'BRIGANTINE' },
  5: { commander: 'Capt.Armand', shipName: 'SP5.Courageous', shipClass: 'CORVETTE' },
  6: { commander: 'Capt.Bouchet', shipName: 'SP6.Firedrake', shipClass: 'DESTROYER' },
  7: { commander: 'Capt.Brax', shipName: 'SP7.Victorious', shipClass: 'CRUISER' },
  8: { commander: 'Adm.Wong', shipName: 'SP8.Meritorious', shipClass: 'FRIGATE' },
  9: { commander: 'Adm.Hutchins', shipName: 'SP9.Incredible', shipClass: 'BATTLESHIP' },
};

// SP.EDIT2.txt lines 194-205: pirate auto-generate templates
const PIRATE_TEMPLATES: Record<number, { commander: string; shipName: string; shipClass: string }> = {
  1: { commander: 'K)(akj', shipName: 'K1++++', shipClass: 'Maligna Bat' },
  2: { commander: 'K)(ych', shipName: 'K2@@@@', shipClass: 'Maligna Cat' },
  3: { commander: 'K)(sfy', shipName: 'K3####', shipClass: 'Maligna Rat' },
  4: { commander: 'K)(sdf', shipName: 'K4$$$$', shipClass: 'Maligna Tat' },
  5: { commander: 'K)(ssf', shipName: 'K5%%%%', shipClass: 'Maligna Vat' },
  6: { commander: 'K)(dfy', shipName: 'K6^^^^', shipClass: 'Maligna Wat' },
  7: { commander: 'K)(dsh', shipName: 'K7&&&&', shipClass: 'Maligna Xat' },
  8: { commander: 'K)(ech', shipName: 'K8****', shipClass: 'Maligna Yat' },
  9: { commander: 'K)(chy', shipName: 'K9((((', shipClass: 'Maligna Zat' },
};

function getRandomSystem(): string {
  const systemId = Math.floor(Math.random() * 14) + 1;
  return CORE_SYSTEM_NAMES[systemId] || `System ${systemId}`;
}

export const AdminNpcsScreen: ScreenModule = {
  name: 'admin-npcs',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { user: { select: { isAdmin: true } } },
    });

    if (!character || !character.user.isAdmin) {
      return { output: '\x1b[31mAccess denied.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    editorStates.set(characterId, { step: 'MENU' });

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[31;1m      NPC EDITOR  (SP.EDIT2)              \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[33;1mSelect NPC type:\x1b[0m

  [1] Pirates        (PIRATES file)
  [2] Space Patrol   (SP.PAT file)
  [3] Rim Pirates    (SP.RIMPIR file)
  [4] Brigands       (SP.BRIGAND file)
  [5] Reptiloids     (SP.REPTILE file)
  [M] Back to Admin Menu

> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();
    const raw = input.trim();
    const state = editorStates.get(characterId) || { step: 'MENU' };

    if (key === 'M') {
      editorStates.delete(characterId);
      return { output: '\x1b[2J\x1b[H', nextScreen: 'admin-menu' };
    }

    // ── MENU ───────────────────────────────────────────────────────────────
    if (state.step === 'MENU') {
      const type = NPC_TYPE_LABELS[key];
      if (!type) {
        return { output: '\r\n\x1b[31mInvalid choice. Press 1-5 or M.\x1b[0m\r\n> ' };
      }
      state.step = 'NPC_LIST';
      state.filterType = type;
      editorStates.set(characterId, state);
      return renderNpcList(type);
    }

    // ── NPC_LIST ───────────────────────────────────────────────────────────
    if (state.step === 'NPC_LIST') {
      if (key === 'B') {
        state.step = 'MENU';
        state.filterType = undefined;
        editorStates.set(characterId, state);
        return { output: '\x1b[2J\x1b[H', nextScreen: 'admin-npcs' };
      }
      // SP.EDIT2: A = Add new NPC (auto-create)
      if (key === 'A') {
        state.step = 'CREATE_STRENGTH';
        editorStates.set(characterId, state);
        return { output: '\r\nEnter strength level (1-9) for new NPC:\r\n> ' };
      }
      const idx = parseInt(key, 10);
      if (isNaN(idx)) {
        return { output: '\r\n\x1b[31mEnter roster index, [A]dd new, [B]ack, or [M]enu.\x1b[0m\r\n> ' };
      }
      const npc = await prisma.npcRoster.findFirst({
        where: { type: state.filterType!, rosterIndex: idx },
      });
      if (!npc) {
        return { output: `\r\n\x1b[31mNPC #${idx} not found in ${state.filterType}.\x1b[0m\r\n> ` };
      }
      state.step = 'VIEW';
      state.selectedId = npc.id;
      editorStates.set(characterId, state);
      return renderNpcView(npc);
    }

    // ── CREATE_STRENGTH ────────────────────────────────────────────────────
    if (state.step === 'CREATE_STRENGTH') {
      const strength = parseInt(raw, 10);
      if (isNaN(strength) || strength < 1 || strength > 9) {
        state.step = 'NPC_LIST';
        editorStates.set(characterId, state);
        return { output: '\r\n\x1b[31mInvalid strength. Cancelled.\x1b[0m\r\n> ' };
      }

      const type = state.filterType!;

      // Get next roster index
      const maxEntry = await prisma.npcRoster.findFirst({
        where: { type },
        orderBy: { rosterIndex: 'desc' },
      });
      const nextIndex = (maxEntry?.rosterIndex || 0) + 1;

      // SP.EDIT2.txt: auto-generate based on type and strength
      let template: { commander: string; shipName: string; shipClass: string };
      if (type === 'PATROL') {
        template = PATROL_TEMPLATES[strength] || PATROL_TEMPLATES[1];
      } else {
        template = PIRATE_TEMPLATES[strength] || PIRATE_TEMPLATES[1];
      }

      // Scale stats by strength (SP.EDIT2 medit: each stat = strength * base)
      const baseWeapon = 10 + strength * 2;
      const baseShield = 10 + strength * 2;
      const baseDrive = 10 + strength * 2;
      const baseHull = 10 + strength;

      await prisma.npcRoster.create({
        data: {
          type,
          rosterIndex: nextIndex,
          shipClass: template.shipClass,
          commander: `${template.commander}-${nextIndex}`,
          shipName: `${template.shipName}-${nextIndex}`,
          homeSystem: getRandomSystem(),
          creditValue: strength * 20 + 50,
          fuelCapacity: type === 'PATROL' ? 1000 : 500,
          weaponStrength: baseWeapon,
          weaponCondition: 9,
          shieldStrength: baseShield,
          shieldCondition: 9,
          hullStrength: baseHull,
          hullCondition: 9,
          lifeSupportCond: 9,
          driveStrength: baseDrive,
          driveCondition: 9,
        },
      });

      state.step = 'NPC_LIST';
      editorStates.set(characterId, state);

      return {
        output: `\r\n\x1b[32mCreated ${type} #${nextIndex} at strength ${strength}.\x1b[0m\r\n${(await renderNpcList(type)).output}`,
      };
    }

    // ── VIEW ───────────────────────────────────────────────────────────────
    if (state.step === 'VIEW') {
      if (key === 'E') {
        state.step = 'EDIT';
        editorStates.set(characterId, state);
        return renderNpcEditMenu();
      }
      if (key === 'B') {
        state.step = 'NPC_LIST';
        state.selectedId = undefined;
        editorStates.set(characterId, state);
        return renderNpcList(state.filterType!);
      }
      // SP.EDIT2: delete NPC
      if (key === 'X') {
        state.step = 'DELETE_CONFIRM';
        editorStates.set(characterId, state);
        return { output: '\r\n\x1b[31;1mDelete this NPC?\x1b[0m Type YES to confirm:\r\n> ' };
      }
      return { output: '\r\n\x1b[31m[E]dit  [X] Delete  [B]ack to list  [M]ain Menu\x1b[0m\r\n> ' };
    }

    // ── DELETE_CONFIRM ─────────────────────────────────────────────────────
    if (state.step === 'DELETE_CONFIRM') {
      if (key === 'YES') {
        await prisma.npcRoster.delete({ where: { id: state.selectedId! } });
        state.step = 'NPC_LIST';
        state.selectedId = undefined;
        editorStates.set(characterId, state);
        return {
          output: `\r\n\x1b[32mNPC deleted.\x1b[0m\r\n${(await renderNpcList(state.filterType!)).output}`,
        };
      }
      state.step = 'VIEW';
      editorStates.set(characterId, state);
      return { output: '\r\n\x1b[33mDeletion cancelled.\x1b[0m\r\n> ' };
    }

    // ── EDIT (select field) ────────────────────────────────────────────────
    if (state.step === 'EDIT') {
      const entry = EDITABLE_NPC_FIELDS[key];
      if (!entry) {
        state.step = 'VIEW';
        editorStates.set(characterId, state);
        const npc = await prisma.npcRoster.findUnique({ where: { id: state.selectedId! } });
        return renderNpcView(npc);
      }
      state.editField = entry.field;
      state.step = 'EDIT_VALUE';
      editorStates.set(characterId, state);
      // String fields (C, D, E) accept text; numeric fields accept numbers
      const isString = ['shipClass', 'commander', 'shipName'].includes(entry.field);
      return { output: `\r\nEnter new ${isString ? 'text' : 'value'} for \x1b[33m${entry.label}\x1b[0m:\r\n> ` };
    }

    // ── EDIT_VALUE ─────────────────────────────────────────────────────────
    if (state.step === 'EDIT_VALUE' && state.editField) {
      const field = state.editField;
      const isString = ['shipClass', 'commander', 'shipName'].includes(field);

      let updateData: any;
      if (isString) {
        if (!raw) {
          state.editField = undefined;
          state.step = 'VIEW';
          editorStates.set(characterId, state);
          return { output: '\r\n\x1b[31mEmpty input. Edit cancelled.\x1b[0m\r\n> ' };
        }
        updateData = { [field]: raw };
      } else {
        const newValue = parseInt(raw, 10);
        if (isNaN(newValue) || newValue < 0) {
          state.editField = undefined;
          state.step = 'VIEW';
          editorStates.set(characterId, state);
          return { output: '\r\n\x1b[31mInvalid value. Edit cancelled.\x1b[0m\r\n> ' };
        }
        updateData = { [field]: newValue };
      }

      await prisma.npcRoster.update({
        where: { id: state.selectedId! },
        data: updateData,
      });

      const label = Object.values(EDITABLE_NPC_FIELDS).find(f => f.field === field)?.label || field;
      state.editField = undefined;
      state.step = 'VIEW';
      editorStates.set(characterId, state);

      const npc = await prisma.npcRoster.findUnique({ where: { id: state.selectedId! } });
      return {
        output: `\r\n\x1b[32m${label} updated.\x1b[0m\r\n${renderNpcView(npc).output}`,
      };
    }

    return { output: '\r\n\x1b[31mUnknown state.\x1b[0m\r\n> ' };
  },
};

async function renderNpcList(type: NpcType): Promise<ScreenResponse> {
  const npcs = await prisma.npcRoster.findMany({
    where: { type },
    orderBy: { rosterIndex: 'asc' },
  });

  let out = `\r\n\x1b[33;1m=== ${type} ROSTER (${npcs.length} entries) ===\x1b[0m\r\n\r\n`;
  out += `\x1b[33m Idx  Commander         Ship Class      W/S    BW/BL\x1b[0m\r\n`;
  out += `\x1b[37m───  ────────────────  ──────────────  ─────  ─────\x1b[0m\r\n`;

  for (const npc of npcs) {
    out += ` ${String(npc.rosterIndex).padStart(3)}  ${npc.commander.padEnd(16)}  ${npc.shipClass.padEnd(14)}  ${npc.weaponStrength}/${npc.shieldStrength}  ${npc.battlesWon}/${npc.battlesLost}\r\n`;
  }

  out += `\r\nEnter roster index, [A]dd new NPC, [B]ack, [M]ain Menu:\r\n> `;
  return { output: out };
}

function renderNpcView(npc: any): ScreenResponse {
  if (!npc) {
    return { output: '\x1b[31mNPC not found.\x1b[0m\r\n> ' };
  }

  let out = `\r\n\x1b[33;1m=== ${npc.commander} ===\x1b[0m\r\n\r\n`;
  out += `  Type:            ${npc.type}\r\n`;
  out += `  Ship Class:      ${npc.shipClass}\r\n`;
  out += `  Ship Name:       ${npc.shipName}\r\n`;
  out += `  Home System:     ${npc.homeSystem}\r\n`;
  out += `  Credit Value:    ${npc.creditValue}\r\n`;
  out += `  Fuel Capacity:   ${npc.fuelCapacity}\r\n`;
  out += `\r\n  \x1b[36mCombat Stats:\x1b[0m\r\n`;
  out += `    Weapons:     ${npc.weaponStrength}/${npc.weaponCondition} (p7/p8)\r\n`;
  out += `    Shields:     ${npc.shieldStrength}/${npc.shieldCondition} (s7/s8)\r\n`;
  out += `    Hull:        ${npc.hullStrength}/${npc.hullCondition} (s5/p9)\r\n`;
  out += `    Drive:       ${npc.driveStrength}/${npc.driveCondition} (s3/s4)\r\n`;
  out += `    Life Sup:    ${npc.lifeSupportCond} (s9)\r\n`;
  out += `\r\n  \x1b[36mBattle Record:\x1b[0m Won ${npc.battlesWon} / Lost ${npc.battlesLost}\r\n`;
  out += `\r\n  [E]dit  [X] Delete  [B]ack to list  [M]ain Menu\r\n> `;

  return { output: out };
}

function renderNpcEditMenu(): ScreenResponse {
  let out = `\r\n\x1b[33;1mSelect field to edit:\x1b[0m\r\n`;
  for (const [key, entry] of Object.entries(EDITABLE_NPC_FIELDS)) {
    out += `  [${key}] ${entry.label}\r\n`;
  }
  out += `\r\nEnter field key or any other key to cancel:\r\n> `;
  return { output: out };
}
