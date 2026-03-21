/**
 * SpacerQuest v4.0 - Wise One Screen (SP.DOCK2.S:332-334)
 *
 * Located at Polaris-1 (System #17)
 * Displays flavor text and generates a random Number Key (1-9)
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { WISE_ONE_TEXT, generateNumberKey } from '../systems/wise-one.js';

export const WiseOneScreen: ScreenModule = {
  name: 'wise-one',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
    }

    // Only accessible at Polaris-1 (System #17)
    if (character.currentSystem !== 17) {
      return {
        output: '\x1b[33mThe Wise One can only be visited at Polaris-1 (System 17).\x1b[0m\r\n',
        nextScreen: 'rim-port',
      };
    }

    const numberKey = generateNumberKey();

    // Persist kn (number key) to character record — SP.PATPIR.S black section line 164
    // uses kn to validate the player's input in The Great Void
    await prisma.character.update({
      where: { id: characterId },
      data: { numberKey },
    });

    const output = `
\x1b[36;1m${'-'.repeat(50)}\x1b[0m
\x1b[35;1m          THE WISE ONE - Polaris-1\x1b[0m
\x1b[36;1m${'-'.repeat(50)}\x1b[0m

\x1b[33m${WISE_ONE_TEXT}\x1b[0m

\x1b[32;1mThe Wise One reveals a Number Key: [ ${numberKey} ]\x1b[0m

\x1b[36mRemember this number well, Spacer...\x1b[0m

\x1b[37mPress any key to leave...\x1b[0m
> `;

    return { output, data: { numberKey } };
  },

  handleInput: async (_characterId: string, _input: string): Promise<ScreenResponse> => {
    return {
      output: '\x1b[33mYou leave the presence of The Wise One...\x1b[0m\r\n',
      nextScreen: 'rim-port',
    };
  },
};
