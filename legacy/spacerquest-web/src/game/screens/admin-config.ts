/**
 * SpacerQuest v4.0 - Admin Battle Config Screen (SP.EDIT3)
 *
 * View and edit game configuration (battle difficulty, combat rounds, etc.)
 * Also handles game reset confirmation flow.
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { getGameConfig, updateGameConfig } from '../systems/game-config.js';

interface ConfigEditorState {
  step: 'VIEW' | 'EDIT' | 'EDIT_VALUE' | 'RESET_CONFIRM';
  editField?: string;
}

const editorStates = new Map<string, ConfigEditorState>();

const CONFIG_FIELDS: Record<string, { dbField: string; label: string; min: number; max: number }> = {
  '1': { dbField: 'battleDifficulty', label: 'Battle Difficulty (ff)', min: 1, max: 9 },
  '2': { dbField: 'maxCombatRounds', label: 'Max Combat Rounds (qq)', min: 1, max: 15 },
  '3': { dbField: 'pirateAttackThreshold', label: 'Pirate Attack Threshold (jw)', min: 1, max: 100 },
  '4': { dbField: 'patrolAttackThreshold', label: 'Patrol Attack Threshold (jx)', min: 1, max: 100 },
  '5': { dbField: 'attackRandomMin', label: 'Attack Random Min (ju)', min: 1, max: 9 },
  '6': { dbField: 'attackRandomMax', label: 'Attack Random Max (jv)', min: 1, max: 9 },
};

export const AdminConfigScreen: ScreenModule = {
  name: 'admin-config',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { user: { select: { isAdmin: true } } },
    });

    if (!character || !character.user.isAdmin) {
      return { output: '\x1b[31mAccess denied.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    editorStates.set(characterId, { step: 'VIEW' });
    return renderConfigView();
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();
    const state = editorStates.get(characterId) || { step: 'VIEW' };

    if (key === 'M') {
      editorStates.delete(characterId);
      return { output: '\x1b[2J\x1b[H', nextScreen: 'admin-menu' };
    }

    if (state.step === 'VIEW') {
      if (key === 'E') {
        state.step = 'EDIT';
        editorStates.set(characterId, state);
        return renderEditMenu();
      }
      if (key === 'R') {
        state.step = 'RESET_CONFIRM';
        editorStates.set(characterId, state);
        return {
          output: '\r\n\x1b[31;1m!!! GAME RESET !!!\x1b[0m\r\n\r\nThis will DELETE all characters, ships, battles, and game state.\r\nStar systems and users will be preserved.\r\n\r\nType \x1b[31mRESET\x1b[0m to confirm, or anything else to cancel:\r\n> ',
        };
      }
      return { output: '\r\n\x1b[31mPress E to edit, R to reset, or M to return.\x1b[0m\r\n> ' };
    }

    if (state.step === 'EDIT') {
      const field = CONFIG_FIELDS[key];
      if (!field) {
        state.step = 'VIEW';
        editorStates.set(characterId, state);
        return renderConfigView();
      }
      state.editField = key;
      state.step = 'EDIT_VALUE';
      editorStates.set(characterId, state);
      return {
        output: `\r\nEnter new value for \x1b[33m${field.label}\x1b[0m (${field.min}-${field.max}):\r\n> `,
      };
    }

    if (state.step === 'EDIT_VALUE') {
      const field = CONFIG_FIELDS[state.editField!];
      const newValue = parseInt(input.trim(), 10);

      if (isNaN(newValue) || newValue < field.min || newValue > field.max) {
        state.step = 'VIEW';
        state.editField = undefined;
        editorStates.set(characterId, state);
        return {
          output: `\r\n\x1b[31mValue must be ${field.min}-${field.max}. Edit cancelled.\x1b[0m\r\n${(await renderConfigView()).output}`,
        };
      }

      await updateGameConfig({ [field.dbField]: newValue });

      state.step = 'VIEW';
      state.editField = undefined;
      editorStates.set(characterId, state);
      return {
        output: `\r\n\x1b[32m${field.label} updated to ${newValue}.\x1b[0m\r\n${(await renderConfigView()).output}`,
      };
    }

    if (state.step === 'RESET_CONFIRM') {
      if (input.trim() === 'RESET') {
        // Perform full game reset
        await prisma.$transaction([
          prisma.combatSession.deleteMany(),
          prisma.battleRecord.deleteMany(),
          prisma.duelEntry.deleteMany(),
          prisma.travelState.deleteMany(),
          prisma.gameLog.deleteMany(),
          prisma.bulletinPost.deleteMany(),
          prisma.portOwnership.deleteMany(),
          prisma.allianceMembership.deleteMany(),
          prisma.ship.deleteMany(),
          prisma.character.deleteMany(),
        ]);

        await prisma.gameConfig.upsert({
          where: { id: 'default' },
          create: { id: 'default' },
          update: {
            battleDifficulty: 5,
            maxCombatRounds: 12,
            pirateAttackThreshold: 20,
            patrolAttackThreshold: 25,
            attackRandomMin: 3,
            attackRandomMax: 5,
          },
        });

        await prisma.starSystem.updateMany({
          data: {
            portOwner: null,
            allianceControl: 'NONE',
            defconLevel: 1,
            visitCount: 0,
          },
        });

        editorStates.delete(characterId);
        return {
          output: '\r\n\x1b[32;1mGame has been reset.\x1b[0m All characters and game state cleared.\r\nYou have been logged out.\r\n',
        };
      }

      state.step = 'VIEW';
      editorStates.set(characterId, state);
      return {
        output: `\r\n\x1b[33mReset cancelled.\x1b[0m\r\n${(await renderConfigView()).output}`,
      };
    }

    return { output: '\r\n\x1b[31mUnknown state.\x1b[0m\r\n> ' };
  },
};

async function renderConfigView(): Promise<ScreenResponse> {
  const config = await getGameConfig();

  // SP.EDIT3 bat2b subroutine (lines 122-126): attack strength table per tier
  // jm=((ju*x)+15): jn=(jm+(jv*5)) for x=1 to 9
  const ju = config.attackRandomMin;
  const jv = config.attackRandomMax;
  let attackTable = '';
  for (let x = 1; x <= 9; x++) {
    const jm = (ju * x) + 15;
    const jn = jm + (jv * 5);
    attackTable += `  SP${x} and K${x} Attacks Spacer with Weap.Str: ${jm} - ${jn}\r\n`;
  }

  const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[31;1m      BATTLE CONFIG  (SP.EDIT3)           \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[33;1mCurrent Configuration (sp.conf):\x1b[0m

  ff = ${config.battleDifficulty}    Battle Difficulty     (1-9)
  qq = ${config.maxCombatRounds}   Max Combat Rounds     (1-15)
  jw = ${config.pirateAttackThreshold}   Pirate Attack Thresh  (1-100)
  jx = ${config.patrolAttackThreshold}   Patrol Attack Thresh  (1-100)
  ju = ${config.attackRandomMin}    Attack Random Min     (1-9)
  jv = ${config.attackRandomMax}    Attack Random Max     (1-9)

\x1b[33mAttack Strength Table (SP.EDIT3 bat2b):\x1b[0m
${attackTable}
  Last updated: ${config.updatedAt.toISOString()}

  [E]dit  [R]eset Game  [M]ain Menu
> `;

  return { output };
}

function renderEditMenu(): ScreenResponse {
  let out = `\r\n\x1b[33;1mSelect field to edit:\x1b[0m\r\n`;
  for (const [key, field] of Object.entries(CONFIG_FIELDS)) {
    out += `  [${key}] ${field.label}\r\n`;
  }
  out += `\r\nEnter field number or any other key to cancel:\r\n> `;
  return { output: out };
}
