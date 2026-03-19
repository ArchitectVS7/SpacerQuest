/**
 * SpacerQuest v4.0 - Extra-Curricular Menu Screen (SP.END.txt sp.menu11)
 *
 * Menu options:
 *   (P) Pirate Mode — Attack other ships for loot
 *   (S) Star Patrol — Hunt pirates for bounties
 *   (C) Smuggler Patrol — Intercept smugglers
 *   (W) Dueling Arena — Challenge another player
 *   (G) Hire Ship Guard — 10,000 cr, prevents vandalism on quit
 *   (Q) Return to main menu
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import { SHIP_GUARD_COST } from '../constants.js';
import { setMode, hireShipGuard } from '../systems/extra-curricular.js';

export const ExtraCurricularScreen: ScreenModule = {
  name: 'extra-curricular',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const credits = formatCredits(character.creditsHigh, character.creditsLow);
    const currentMode = character.extraCurricularMode || 'none';
    const guardStatus = character.ship.hasShipGuard ? '\x1b[32mON DUTY\x1b[0m' : '\x1b[31mNONE\x1b[0m';

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m     EXTRA-CURRICULAR ACTIVITIES          \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[32mCredits:\x1b[0m ${credits} cr
\x1b[32mCurrent Mode:\x1b[0m ${currentMode}
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

    switch (key) {
      case 'P': {
        const result = await setMode(characterId, 'pirate');
        return {
          output: '\r\n\x1b[33;1mPirate Mode activated! Attack other ships during travel.\x1b[0m\r\n> ',
        };
      }

      case 'S': {
        const result = await setMode(characterId, 'star_patrol');
        return {
          output: '\r\n\x1b[36;1mStar Patrol activated! Hunt pirates for bounties.\x1b[0m\r\n> ',
        };
      }

      case 'C': {
        const result = await setMode(characterId, 'smuggler_patrol');
        return {
          output: '\r\n\x1b[35;1mSmuggler Patrol activated! Intercept smugglers.\x1b[0m\r\n> ',
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
        await setMode(characterId, null);
        return {
          output: '\r\n\x1b[37mExtra-curricular mode cancelled.\x1b[0m\r\n> ',
        };
      }

      case 'Q':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };

      default:
        return { output: '\r\n\x1b[31mInvalid command.\x1b[0m\r\n> ' };
    }
  },
};
