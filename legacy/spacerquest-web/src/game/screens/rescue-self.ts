/**
 * SpacerQuest v4.0 - Self-Rescue Screen (SP.LINK.txt lines 59-87)
 *
 * When a player is lost in space (isLost=true), they can pay credits
 * to have their ship immediately rescued.
 *
 * Cost formula (SP.LINK.txt line 61):
 *   xo=20000:if sc<20 xo=(sc*1000)
 *   where sc = floor(score/150)
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { calculateSelfRescueCost } from '../constants.js';
import { formatCredits, subtractCredits } from '../utils.js';

export const RescueSelfScreen: ScreenModule = {
  name: 'rescue-self',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    // SP.LINK.txt line 60: if ap<1 print "You have no need for Rescue Service!"
    if (!character.isLost) {
      return {
        output: '\r\n\x1b[33mYou have no need for Rescue Service!\x1b[0m\r\n',
        nextScreen: 'main-menu',
      };
    }

    const cost = calculateSelfRescueCost(character.score);
    const credits = formatCredits(character.creditsHigh, character.creditsLow);

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m         RESCUE SERVICE                   \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[31;1mYour ship is LOST IN SPACE!\x1b[0m

\x1b[32mRescue Cost:\x1b[0m ${cost} cr
\x1b[32mYour Credits:\x1b[0m ${credits} cr

Immediate rescue of your lost ship is available for ${cost} cr

Want to be rescued now? [Y]/(N): `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    if (key === 'N' || key === '') {
      return { output: 'No\r\n', nextScreen: 'main-menu' };
    }

    if (key !== 'Y') {
      return { output: '\r\nWant to be rescued now? [Y]/(N): ' };
    }

    // Y pressed — attempt rescue
    const character = await prisma.character.findUnique({
      where: { id: characterId },
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    if (!character.isLost) {
      return { output: '\r\n\x1b[33mYou have no need for Rescue Service!\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    const cost = calculateSelfRescueCost(character.score);

    // SP.LINK.txt line 65: if xo>g2 print ng$ (not enough credits)
    const { success, high, low } = subtractCredits(character.creditsHigh, character.creditsLow, cost);
    if (!success) {
      const credits = formatCredits(character.creditsHigh, character.creditsLow);
      return {
        output: `Yes\r\n\x1b[31mNot enough credits! You need ${cost} cr, you have ${credits} cr.\x1b[0m\r\n`,
        nextScreen: 'main-menu',
      };
    }

    // SP.LINK.txt line 80: close:ap=0 (clear lost state)
    await prisma.character.update({
      where: { id: characterId },
      data: {
        isLost: false,
        lostLocation: null,
        creditsHigh: high,
        creditsLow: low,
      },
    });

    // SP.LINK.txt lines 84-86:
    //   i$=da$+" : The "+sp$+" Rescue Service rescued "+nz$
    //   open #1,"sp.great":append #1:print #1,i$:close
    // Write a RESCUE GameLog entry so the event appears in Space News.
    await prisma.gameLog.create({
      data: {
        type: 'RESCUE',
        characterId,
        message: `: The Rescue Service rescued ${character.shipName || character.name}`,
        metadata: { characterName: character.name, shipName: character.shipName, cost },
      },
    });

    return {
      output: `Yes\r\n\x1b[32mYour ship has been rescued! ${cost} cr deducted.\x1b[0m\r\n`,
      nextScreen: 'main-menu',
    };
  },
};
