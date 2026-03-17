/**
 * SpacerQuest v4.0 - Jail / Brig Screen (SP.END.S)
 *
 * Terminal screen for jailed players. Displayed on login when the character
 * name carries the J% prefix assigned by the crime system.
 *
 * Original source: SP.END.S:233-271
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits } from '../utils.js';
import {
  CrimeType,
  CRIME_FINES,
  canPayFine,
  payFine,
  releasePlayer,
  RELEASE_MESSAGE,
} from '../systems/jail.js';

// ============================================================================
// HELPERS
// ============================================================================

const CRIME_DESCRIPTIONS: Record<CrimeType, string> = {
  [CrimeType.SMUGGLING]:    'Caught smuggling contraband',
  [CrimeType.CARRIER_LOSS]: 'Loss of carrier during battle',
  [CrimeType.CONDUCT]:      'Conduct against spirit of the game',
};

// ============================================================================
// SCREEN MODULE
// ============================================================================

export const JailScreen: ScreenModule = {
  name: 'jail',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
    }

    if (character.crimeType === null) {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
    }

    const crimeType = character.crimeType as CrimeType;
    const fine = CRIME_FINES[crimeType];
    const description = CRIME_DESCRIPTIONS[crimeType];
    const credits = formatCredits(character.creditsHigh, character.creditsLow);

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m   BRIG OF ADMIRAL JURIS P. MAGNUS       \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

\x1b[37mCharge:\x1b[0m  ${description}
\x1b[37mFine:\x1b[0m    ${fine.toLocaleString()} credits
\x1b[37mOn Hand:\x1b[0m ${credits} credits

\x1b[37;1m=========================================\x1b[0m

  \x1b[37;1m(P)\x1b[0may Fine   \x1b[37;1m(W)\x1b[0mait

> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
    }

    switch (key) {
      case 'P': {
        if (character.crimeType === null) {
          return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
        }

        const crimeType = character.crimeType as CrimeType;

        if (!canPayFine(character.creditsHigh, character.creditsLow, crimeType)) {
          return {
            output: '\r\n\x1b[31mNot enough credits!\x1b[0m\r\n> ',
          };
        }

        const result = payFine(character.creditsHigh, character.creditsLow, crimeType);

        if (!result.success) {
          return {
            output: '\r\n\x1b[31mNot enough credits!\x1b[0m\r\n> ',
          };
        }

        const releasedName = releasePlayer(character.name);

        await prisma.character.update({
          where: { id: characterId },
          data: {
            creditsHigh: result.creditsHigh,
            creditsLow: result.creditsLow,
            crimeType: null,
            name: releasedName,
          },
        });

        return {
          output: `\r\n\x1b[33;1m${RELEASE_MESSAGE}\x1b[0m\r\n`,
          nextScreen: 'main-menu',
        };
      }

      case 'W':
        return {
          output: '\r\n\x1b[37mYou sit in the brig, staring at the cold metal walls...\x1b[0m\r\n> ',
        };

      default:
        return {
          output: '\r\n\x1b[31mInvalid command. Press P to pay fine or W to wait.\x1b[0m\r\n> ',
        };
    }
  },
};
