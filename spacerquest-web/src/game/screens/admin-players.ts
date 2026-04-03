/**
 * SpacerQuest v4.0 - Admin Player Editor Screen (SP.EDIT1)
 *
 * List, view, search, edit, reset, and delete character stats.
 * SP.EDIT1.txt: 57 editable variables, player listing, search by name/number.
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';

interface PlayerEditorState {
  step: 'LIST' | 'VIEW' | 'EDIT_FIELD' | 'EDIT_SHIP' | 'CONFIRM' | 'CONFIRM_SHIP' | 'SEARCH' | 'DELETE_CONFIRM' | 'RESET_CONFIRM';
  page: number;
  selectedId?: string;
  editField?: string;
  editValue?: string;
  editTarget?: 'character' | 'ship';
}

const editorStates = new Map<string, PlayerEditorState>();

// SP.EDIT1 character fields — all 57 original variables mapped to modern schema
// Original view subroutine (SP.EDIT1.txt lines 111-178) shows these fields
const CHAR_FIELDS: Record<string, { field: string; label: string }> = {
  '1':  { field: 'creditsHigh', label: 'Credits 10K [g1]' },
  '2':  { field: 'creditsLow', label: 'Credits <10K [g2]' },
  '3':  { field: 'bankHigh', label: 'Bank 10K' },
  '4':  { field: 'bankLow', label: 'Bank <10K' },
  '5':  { field: 'score', label: 'Score [sc]' },
  '6':  { field: 'currentSystem', label: 'Current System [sp]' },
  '7':  { field: 'tripsCompleted', label: 'Trips Completed [u1]' },
  '8':  { field: 'battlesWon', label: 'Battles Won [e1]' },
  '9':  { field: 'battlesLost', label: 'Battles Lost [m1]' },
  'A':  { field: 'astrecsTraveled', label: 'Astrecs Traveled [j1]' },
  'B':  { field: 'cargoDelivered', label: 'Cargo Delivered [k1]' },
  'C':  { field: 'rescuesPerformed', label: 'Total Rescues [b1]' },
  'D':  { field: 'tripCount', label: 'Crime/Trip Count [z1]' },
  'E':  { field: 'cargoPods', label: 'Full Pods [q1]' },
  'F':  { field: 'cargoType', label: 'Cargo Type [q2]' },
  'G':  { field: 'destination', label: 'Destination # [q4]' },
  'H':  { field: 'cargoPayment', label: 'Cargo Pay [q5]' },
  'I':  { field: 'missionType', label: 'Mission Type (PP) [pp]' },
};

// Ship component fields — SP.EDIT1 variables 14-45
const SHIP_FIELDS: Record<string, { field: string; label: string }> = {
  '1': { field: 'hullStrength', label: 'Hull Strength [h1]' },
  '2': { field: 'hullCondition', label: 'Hull Condition [h2]' },
  '3': { field: 'driveStrength', label: 'Drive Strength [d1]' },
  '4': { field: 'driveCondition', label: 'Drive Condition [d2]' },
  '5': { field: 'cabinStrength', label: 'Cabin Strength [c1]' },
  '6': { field: 'cabinCondition', label: 'Cabin Condition [c2]' },
  '7': { field: 'lifeSupportStrength', label: 'Life Support Str [l1]' },
  '8': { field: 'lifeSupportCondition', label: 'Life Support Cond [l2]' },
  '9': { field: 'weaponStrength', label: 'Weapon Strength [w1]' },
  'A': { field: 'weaponCondition', label: 'Weapon Condition [w2]' },
  'B': { field: 'navigationStrength', label: 'Navigation Str [n1]' },
  'C': { field: 'navigationCondition', label: 'Navigation Cond [n2]' },
  'D': { field: 'roboticsStrength', label: 'Robotics Str [r1]' },
  'E': { field: 'roboticsCondition', label: 'Robotics Cond [r2]' },
  'F': { field: 'shieldStrength', label: 'Shield Strength [p1]' },
  'G': { field: 'shieldCondition', label: 'Shield Condition [p2]' },
  'H': { field: 'fuel', label: 'Fuel [f1]' },
};

export const AdminPlayersScreen: ScreenModule = {
  name: 'admin-players',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { user: { select: { isAdmin: true } } },
    });

    if (!character || !character.user.isAdmin) {
      return { output: '\x1b[31mAccess denied.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    editorStates.set(characterId, { step: 'LIST', page: 1 });
    return renderPlayerList(1);
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();
    const raw = input.trim();
    const state = editorStates.get(characterId) || { step: 'LIST', page: 1 };

    if (key === 'M') {
      editorStates.delete(characterId);
      return { output: '\x1b[2J\x1b[H', nextScreen: 'admin-menu' };
    }

    // ── LIST mode ──────────────────────────────────────────────────────────
    if (state.step === 'LIST') {
      if (key === 'N') {
        state.page++;
        editorStates.set(characterId, state);
        return renderPlayerList(state.page);
      }
      if (key === 'P' && state.page > 1) {
        state.page--;
        editorStates.set(characterId, state);
        return renderPlayerList(state.page);
      }
      // SP.EDIT1 line 51: S = Scan for player
      if (key === 'S') {
        state.step = 'SEARCH';
        editorStates.set(characterId, state);
        return { output: '\r\nEnter spacer ID or player name to search:\r\n> ' };
      }
      // Select player by spacer ID
      const spacerId = parseInt(key, 10);
      if (!isNaN(spacerId)) {
        const target = await prisma.character.findUnique({
          where: { spacerId },
          include: { ship: true },
        });
        if (!target) {
          return { output: `\r\n\x1b[31mSpacer #${spacerId} not found.\x1b[0m\r\n> ` };
        }
        state.step = 'VIEW';
        state.selectedId = target.id;
        editorStates.set(characterId, state);
        return renderPlayerView(target);
      }
      return { output: '\r\n\x1b[31mEnter spacer ID, [S]earch, [N]ext, [P]rev, or [M]enu.\x1b[0m\r\n> ' };
    }

    // ── SEARCH mode ────────────────────────────────────────────────────────
    if (state.step === 'SEARCH') {
      const num = parseInt(raw, 10);
      let target;
      if (!isNaN(num)) {
        target = await prisma.character.findUnique({
          where: { spacerId: num },
          include: { ship: true },
        });
      } else if (raw.length > 0) {
        target = await prisma.character.findFirst({
          where: { name: { contains: raw, mode: 'insensitive' } },
          include: { ship: true },
        });
      }
      if (!target) {
        state.step = 'LIST';
        editorStates.set(characterId, state);
        return { output: `\r\n\x1b[31mNo player found matching "${raw}".\x1b[0m\r\n> ` };
      }
      state.step = 'VIEW';
      state.selectedId = target.id;
      editorStates.set(characterId, state);
      return renderPlayerView(target);
    }

    // ── VIEW mode ──────────────────────────────────────────────────────────
    if (state.step === 'VIEW') {
      if (key === 'E') {
        state.step = 'EDIT_FIELD';
        editorStates.set(characterId, state);
        return renderCharEditMenu();
      }
      // SP.EDIT1: ship editing
      if (key === 'H') {
        state.step = 'EDIT_SHIP';
        editorStates.set(characterId, state);
        return renderShipEditMenu();
      }
      if (key === 'B') {
        state.step = 'LIST';
        state.selectedId = undefined;
        editorStates.set(characterId, state);
        return renderPlayerList(state.page);
      }
      // SP.EDIT1 line 57: D = Reset player to defaults
      if (key === 'D') {
        state.step = 'RESET_CONFIRM';
        editorStates.set(characterId, state);
        return { output: '\r\n\x1b[31;1mReset this player to default stats?\x1b[0m Type YES to confirm:\r\n> ' };
      }
      // SP.EDIT1 line 58: I = Inactivate (delete) player
      if (key === 'I') {
        state.step = 'DELETE_CONFIRM';
        editorStates.set(characterId, state);
        return { output: '\r\n\x1b[31;1mDELETE this player permanently?\x1b[0m Type YES to confirm:\r\n> ' };
      }
      return { output: '\r\n\x1b[31m[E]dit char  [H]ship edit  [D]efaults  [I]nactivate  [B]ack  [M]enu\x1b[0m\r\n> ' };
    }

    // ── RESET CONFIRM ──────────────────────────────────────────────────────
    if (state.step === 'RESET_CONFIRM') {
      if (key === 'YES') {
        // SP.EDIT1 lines 281-291: reset to new-player state
        await prisma.character.update({
          where: { id: state.selectedId! },
          data: {
            creditsHigh: 0, creditsLow: 0,
            bankHigh: 0, bankLow: 0,
            score: 0, currentSystem: 1,
            tripsCompleted: 0, battlesWon: 0, battlesLost: 0,
            rescuesPerformed: 0, astrecsTraveled: 0, cargoDelivered: 0,
            tripCount: 0, rank: 'LIEUTENANT',
            cargoPods: 0, cargoType: 0, cargoPayment: 0, destination: 0,
            cargoManifest: null, missionType: 0,
            isConqueror: false, isLost: false, lostLocation: null,
            extraCurricularMode: null, crimeType: null,
          },
        });
        const ship = await prisma.ship.findUnique({ where: { characterId: state.selectedId! } });
        if (ship) {
          await prisma.ship.update({
            where: { characterId: state.selectedId! },
            data: {
              hullStrength: 10, hullCondition: 5,
              driveStrength: 10, driveCondition: 5,
              cabinStrength: 5, cabinCondition: 5,
              lifeSupportStrength: 5, lifeSupportCondition: 5,
              weaponStrength: 5, weaponCondition: 5,
              navigationStrength: 5, navigationCondition: 5,
              roboticsStrength: 5, roboticsCondition: 5,
              shieldStrength: 5, shieldCondition: 5,
              fuel: 100, cargoPods: 0, maxCargoPods: 0,
              hasCloaker: false, hasAutoRepair: false,
              hasStarBuster: false, hasArchAngel: false,
              isAstraxialHull: false, hasTitaniumHull: false,
              hasTransWarpDrive: false, hasShipGuard: false,
            },
          });
        }
        state.step = 'VIEW';
        editorStates.set(characterId, state);
        const target = await prisma.character.findUnique({
          where: { id: state.selectedId! },
          include: { ship: true },
        });
        return { output: `\r\n\x1b[32mPlayer reset to defaults.\x1b[0m\r\n${renderPlayerView(target).output}` };
      }
      state.step = 'VIEW';
      editorStates.set(characterId, state);
      return { output: '\r\n\x1b[33mReset cancelled.\x1b[0m\r\n> ' };
    }

    // ── DELETE CONFIRM ─────────────────────────────────────────────────────
    if (state.step === 'DELETE_CONFIRM') {
      if (key === 'YES') {
        // SP.EDIT1 lines 293-298: inactivate player
        // Delete related records first, then character
        await prisma.$transaction([
          prisma.combatSession.deleteMany({ where: { characterId: state.selectedId! } }),
          prisma.battleRecord.deleteMany({ where: { characterId: state.selectedId! } }),
          prisma.duelEntry.deleteMany({ where: { challengerId: state.selectedId! } }),
          prisma.duelEntry.deleteMany({ where: { contenderId: state.selectedId! } }),
          prisma.travelState.deleteMany({ where: { characterId: state.selectedId! } }),
          prisma.gameLog.deleteMany({ where: { characterId: state.selectedId! } }),
          prisma.portOwnership.deleteMany({ where: { characterId: state.selectedId! } }),
          prisma.allianceMembership.deleteMany({ where: { characterId: state.selectedId! } }),
          prisma.ship.deleteMany({ where: { characterId: state.selectedId! } }),
          prisma.character.delete({ where: { id: state.selectedId! } }),
        ]);

        state.step = 'LIST';
        state.selectedId = undefined;
        editorStates.set(characterId, state);
        return { output: '\r\n\x1b[32mPlayer deleted.\x1b[0m\r\n', nextScreen: 'admin-players' };
      }
      state.step = 'VIEW';
      editorStates.set(characterId, state);
      return { output: '\r\n\x1b[33mDeletion cancelled.\x1b[0m\r\n> ' };
    }

    // ── EDIT CHARACTER FIELD ───────────────────────────────────────────────
    if (state.step === 'EDIT_FIELD') {
      const entry = CHAR_FIELDS[key];
      if (!entry) {
        state.step = 'VIEW';
        editorStates.set(characterId, state);
        const target = await prisma.character.findUnique({
          where: { id: state.selectedId! },
          include: { ship: true },
        });
        return renderPlayerView(target);
      }
      state.editField = entry.field;
      state.editTarget = 'character';
      state.step = 'CONFIRM';
      editorStates.set(characterId, state);
      return { output: `\r\nEnter new value for \x1b[33m${entry.label}\x1b[0m:\r\n> ` };
    }

    // ── EDIT SHIP FIELD ────────────────────────────────────────────────────
    if (state.step === 'EDIT_SHIP') {
      const entry = SHIP_FIELDS[key];
      if (!entry) {
        state.step = 'VIEW';
        editorStates.set(characterId, state);
        const target = await prisma.character.findUnique({
          where: { id: state.selectedId! },
          include: { ship: true },
        });
        return renderPlayerView(target);
      }
      state.editField = entry.field;
      state.editTarget = 'ship';
      state.step = 'CONFIRM_SHIP';
      editorStates.set(characterId, state);
      return { output: `\r\nEnter new value for \x1b[33m${entry.label}\x1b[0m:\r\n> ` };
    }

    // ── CONFIRM (character edit) ───────────────────────────────────────────
    if (state.step === 'CONFIRM') {
      const newValue = parseInt(raw, 10);
      if (isNaN(newValue) || newValue < 0) {
        state.step = 'VIEW';
        editorStates.set(characterId, state);
        return { output: '\r\n\x1b[31mInvalid value. Edit cancelled.\x1b[0m\r\n> ' };
      }

      const fieldName = state.editField!;
      await prisma.character.update({
        where: { id: state.selectedId! },
        data: { [fieldName]: newValue },
      });

      state.step = 'VIEW';
      state.editField = undefined;
      editorStates.set(characterId, state);

      const target = await prisma.character.findUnique({
        where: { id: state.selectedId! },
        include: { ship: true },
      });
      const label = Object.values(CHAR_FIELDS).find(f => f.field === fieldName)?.label || fieldName;
      return {
        output: `\r\n\x1b[32m${label} updated to ${newValue}.\x1b[0m\r\n${renderPlayerView(target).output}`,
      };
    }

    // ── CONFIRM_SHIP (ship edit) ───────────────────────────────────────────
    if (state.step === 'CONFIRM_SHIP') {
      const newValue = parseInt(raw, 10);
      if (isNaN(newValue) || newValue < 0) {
        state.step = 'VIEW';
        editorStates.set(characterId, state);
        return { output: '\r\n\x1b[31mInvalid value. Edit cancelled.\x1b[0m\r\n> ' };
      }

      const fieldName = state.editField!;
      await prisma.ship.update({
        where: { characterId: state.selectedId! },
        data: { [fieldName]: newValue },
      });

      state.step = 'VIEW';
      state.editField = undefined;
      editorStates.set(characterId, state);

      const target = await prisma.character.findUnique({
        where: { id: state.selectedId! },
        include: { ship: true },
      });
      const label = Object.values(SHIP_FIELDS).find(f => f.field === fieldName)?.label || fieldName;
      return {
        output: `\r\n\x1b[32m${label} updated to ${newValue}.\x1b[0m\r\n${renderPlayerView(target).output}`,
      };
    }

    return { output: '\r\n\x1b[31mUnknown state.\x1b[0m\r\n> ' };
  },
};

async function renderPlayerList(page: number): Promise<ScreenResponse> {
  const perPage = 15;
  const skip = (page - 1) * perPage;

  const [characters, total] = await Promise.all([
    prisma.character.findMany({
      select: {
        spacerId: true,
        name: true,
        rank: true,
        creditsHigh: true,
        creditsLow: true,
        currentSystem: true,
      },
      orderBy: { spacerId: 'asc' },
      skip,
      take: perPage,
    }),
    prisma.character.count(),
  ]);

  let out = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[31;1m      PLAYER EDITOR  (SP.EDIT1)           \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[33;1m ID  Name            Rank         Credits    Sys\x1b[0m
\x1b[37;1m───  ──────────────  ───────────  ─────────  ───\x1b[0m\r\n`;

  for (const c of characters) {
    const credits = formatCredits(c.creditsHigh, c.creditsLow);
    out += ` ${String(c.spacerId).padStart(3)}  ${c.name.padEnd(14)}  ${c.rank.padEnd(11)}  ${credits.padStart(9)}  ${String(c.currentSystem).padStart(3)}\r\n`;
  }

  const totalPages = Math.ceil(total / perPage);
  out += `\r\n\x1b[37mPage ${page}/${totalPages} — ${total} spacers total\x1b[0m\r\n`;
  out += `Enter spacer ID, [S]earch, [N]ext, [P]rev, [M]ain Menu:\r\n> `;

  return { output: out };
}

function renderPlayerView(character: any): ScreenResponse {
  if (!character) {
    return { output: '\x1b[31mCharacter not found.\x1b[0m\r\n> ' };
  }

  const credits = formatCredits(character.creditsHigh, character.creditsLow);
  const bank = formatCredits(character.bankHigh, character.bankLow);

  let out = `\r\n\x1b[33;1m=== ${character.name} (Spacer #${character.spacerId}) ===\x1b[0m\r\n\r\n`;
  // SP.EDIT1 view subroutine (lines 111-178): all 57 fields across 4 pages
  // Page 1: string fields (fields 1-15)
  out += `  Rank [pp$]:      ${character.rank}\r\n`;
  out += `  Score [sc]:      ${character.score}\r\n`;
  out += `  Credits [g1/g2]: ${credits} cr\r\n`;
  out += `  Bank:            ${bank} cr\r\n`;
  out += `  System [sp]:     ${character.currentSystem}\r\n`;
  out += `  Alliance [o4$]:  ${character.allianceSymbol || '(none)'}\r\n`;
  // Page 2: numeric stat fields (fields 16-30)
  out += `  Trips Done [u1]: ${character.tripsCompleted}\r\n`;
  out += `  Battles Won[e1]: ${character.battlesWon}\r\n`;
  out += `  Batt.Lost  [m1]: ${character.battlesLost}\r\n`;
  out += `  Rescues    [b1]: ${character.rescuesPerformed}\r\n`;
  out += `  Astrecs    [j1]: ${character.astrecsTraveled ?? 0}\r\n`;
  out += `  Cargo Del. [k1]: ${character.cargoDelivered ?? 0}\r\n`;
  // Page 3: mission/cargo state (fields 31-45)
  out += `  Port Owned [o1]: ${character.currentSystem}\r\n`;
  out += `  Trips/Crime[z1]: ${character.tripCount ?? 0}\r\n`;
  out += `  Full Pods  [q1]: ${character.cargoPods ?? 0}\r\n`;
  out += `  Cargo Type [q2]: ${character.cargoType ?? 0}\r\n`;
  out += `  Cargo Val. [q3]: ${character.cargoPayment ?? 0}\r\n`;
  out += `  Dest #     [q4]: ${character.destination ?? 0}\r\n`;
  out += `  Cargo Pay  [q5]: ${character.cargoPayment ?? 0}\r\n`;
  out += `  Manifest[q2$]:   ${character.cargoManifest || '(none)'}\r\n`;
  // Page 4: special flags (fields 46-57)
  out += `  Mission Type[pp]:${character.missionType ?? 0}\r\n`;
  out += `  Lost in Sp [ap]: ${character.isLost ? 'YES' : 'No'}\r\n`;
  out += `  Lost Loc  [ap$]: ${character.lostLocation || '(n/a)'}\r\n`;
  out += `  Conqueror:       ${character.isConqueror ? 'YES' : 'No'}\r\n`;
  out += `  ExtraCurr  [pp]: ${character.extraCurricularMode || '(none)'}\r\n`;

  if (character.ship) {
    out += `\r\n  \x1b[36mShip:\x1b[0m ${character.shipName || 'Unnamed'}\r\n`;
    out += `    Hull:       ${character.ship.hullStrength}/${character.ship.hullCondition}\r\n`;
    out += `    Drive:      ${character.ship.driveStrength}/${character.ship.driveCondition}\r\n`;
    out += `    Cabin:      ${character.ship.cabinStrength}/${character.ship.cabinCondition}\r\n`;
    out += `    Life Sup:   ${character.ship.lifeSupportStrength}/${character.ship.lifeSupportCondition}\r\n`;
    out += `    Weapons:    ${character.ship.weaponStrength}/${character.ship.weaponCondition}\r\n`;
    out += `    Navigation: ${character.ship.navigationStrength}/${character.ship.navigationCondition}\r\n`;
    out += `    Robotics:   ${character.ship.roboticsStrength}/${character.ship.roboticsCondition}\r\n`;
    out += `    Shields:    ${character.ship.shieldStrength}/${character.ship.shieldCondition}\r\n`;
    out += `    Fuel:       ${character.ship.fuel}\r\n`;
    out += `    Cargo Pods: ${character.ship.cargoPods}/${character.ship.maxCargoPods}\r\n`;
  }

  out += `\r\n  [E]dit char  [H]ship edit  [D]efaults  [I]nactivate  [B]ack  [M]enu\r\n> `;
  return { output: out };
}

function renderCharEditMenu(): ScreenResponse {
  let out = `\r\n\x1b[33;1mSelect character field to edit:\x1b[0m\r\n`;
  for (const [key, entry] of Object.entries(CHAR_FIELDS)) {
    out += `  [${key}] ${entry.label}\r\n`;
  }
  out += `\r\nEnter field number or any other key to cancel:\r\n> `;
  return { output: out };
}

function renderShipEditMenu(): ScreenResponse {
  let out = `\r\n\x1b[33;1mSelect ship component to edit:\x1b[0m\r\n`;
  for (const [key, entry] of Object.entries(SHIP_FIELDS)) {
    out += `  [${key}] ${entry.label}\r\n`;
  }
  out += `\r\nEnter field key or any other key to cancel:\r\n> `;
  return { output: out };
}
