/**
 * SpacerQuest v4.0 - Sage / Ancient One Screen (SP.DOCK2.S:300-330)
 *
 * Located at Mizar-9 (System #18)
 * Interactive constellation knowledge quiz with +1 cabin reward
 * Visitable once per session (sageVisited flag)
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import {
  SAGE_TEXT,
  CONSTELLATION_CHART,
  getRandomSageQuestion,
  checkSageAnswer,
  applySageReward,
} from '../systems/sage.js';

// Pending sage questions keyed by characterId.
// Stored in memory since the quiz is immediate (render → single input → done).
const pendingQuestions = new Map<string, string>();

export const SageScreen: ScreenModule = {
  name: 'sage',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
    }

    if (character.currentSystem !== 18) {
      return {
        output: '\x1b[33mThe Sage can only be visited at Mizar-9 (System 18).\x1b[0m\r\n',
        nextScreen: 'main-menu',
      };
    }

    // Once per session (original: flag kj)
    if (character.sageVisited) {
      return {
        output: '\x1b[33mThe Ancient One has already spoken to you this session.\x1b[0m\r\n',
        nextScreen: 'main-menu',
      };
    }

    const question = getRandomSageQuestion();
    pendingQuestions.set(characterId, question.star);

    const output = `
\x1b[36;1m${'-'.repeat(50)}\x1b[0m
\x1b[35;1m       THE ANCIENT ONE - Mizar-9\x1b[0m
\x1b[36;1m${'-'.repeat(50)}\x1b[0m

\x1b[33m${SAGE_TEXT}\x1b[0m

\x1b[36m${CONSTELLATION_CHART}\x1b[0m

\x1b[32;1mIn which constellation is ${question.star} to be found?\x1b[0m
\x1b[37m(Enter letter A-P)\x1b[0m
> `;

    return { output, data: { star: question.star } };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    // Mark visited regardless of answer
    await prisma.character.update({
      where: { id: characterId },
      data: { sageVisited: true },
    });

    const star = pendingQuestions.get(characterId);
    pendingQuestions.delete(characterId);

    if (!star) {
      return {
        output: '\x1b[31mThe Sage has no question for you.\x1b[0m\r\n',
        nextScreen: 'main-menu',
      };
    }

    const answer = input.trim().toUpperCase();

    if (answer.length !== 1 || answer < 'A' || answer > 'P') {
      return {
        output: '\x1b[31mThe Sage frowns... "That is not a valid answer."\x1b[0m\r\n',
        nextScreen: 'main-menu',
      };
    }

    if (checkSageAnswer(star, answer)) {
      const reward = applySageReward(character.ship.cabinStrength, character.ship.cabinCondition);

      await prisma.ship.update({
        where: { id: character.ship.id },
        data: {
          cabinStrength: reward.cabinStrength,
          cabinCondition: reward.cabinCondition,
        },
      });

      return {
        output: `\x1b[32;1m"Correct!" The Sage smiles.\x1b[0m\r\n` +
          `\x1b[33mYour cabin systems have been enhanced!\x1b[0m\r\n` +
          `\x1b[36mCabin Strength: ${reward.cabinStrength} | Condition: ${reward.cabinCondition}\x1b[0m\r\n`,
        nextScreen: 'main-menu',
      };
    }

    return {
      output: '\x1b[31m"Incorrect..." The Sage shakes his head slowly.\x1b[0m\r\n' +
        '\x1b[33mPerhaps next time you will study the constellations.\x1b[0m\r\n',
      nextScreen: 'main-menu',
    };
  },
};
