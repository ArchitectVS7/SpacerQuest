/**
 * SpacerQuest v4.0 - Combat Screen (SP.FIGHT1.S / SP.FIGHT2.S)
 *
 * Terminal screen for space combat encounters
 * Driven by the combat system, renders round-by-round battle display
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import {
  renderEncounterAlert,
  renderBattleStatusBar,
  renderCombatActions,
  renderPostBattleSummary,
} from '../systems/combat-display.js';
import { calculateComponentPower, formatCredits } from '../utils.js';

export const CombatScreen: ScreenModule = {
  name: 'combat',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
    }

    const ship = character.ship;
    const weaponPower = calculateComponentPower(ship.weaponStrength, ship.weaponCondition);
    const shieldPower = calculateComponentPower(ship.shieldStrength, ship.shieldCondition);

    const statusBar = renderBattleStatusBar({
      shipName: character.shipName || 'unnamed',
      fuel: ship.fuel,
      weaponPower,
      shieldPower,
      battleFactor: 0, // Will be filled when combat is active
    });

    const actions = renderCombatActions(ship.hasCloaker);

    return {
      output: '\x1b[2J\x1b[H' +
        '\x1b[33;1m  COMBAT SYSTEMS ONLINE\x1b[0m\r\n\r\n' +
        statusBar + '\r\n' +
        '  Awaiting encounter...\r\n\r\n' +
        actions,
    };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    switch (key) {
      case 'A':
        return {
          output: '\r\n\x1b[33mContinuing attack...\x1b[0m\r\n' +
            'Use: POST /api/combat/round to process next round\r\n> ',
        };

      case 'R':
        return {
          output: '\r\n\x1b[33mAttempting retreat...\x1b[0m\r\n' +
            'Use: POST /api/combat/retreat to attempt escape\r\n> ',
        };

      case 'S':
        return {
          output: '\r\n\x1b[33mSurrender - paying tribute...\x1b[0m\r\n' +
            'Use: POST /api/combat/surrender to pay tribute\r\n> ',
        };

      case 'C': {
        const character = await prisma.character.findUnique({
          where: { id: characterId },
          include: { ship: true },
        });
        if (character?.ship?.hasCloaker) {
          return {
            output: '\r\n\x1b[36mActivating Morton\'s Cloaker...\x1b[0m\r\n' +
              'Use: POST /api/combat/cloak to activate cloaking device\r\n> ',
          };
        }
        return { output: '\r\n\x1b[31mNo cloaking device installed.\x1b[0m\r\n> ' };
      }

      case 'Q':
      case 'M':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };

      default:
        return { output: '\r\n\x1b[31mInvalid. Press A, R, S, or Q.\x1b[0m\r\n> ' };
    }
  },
};
