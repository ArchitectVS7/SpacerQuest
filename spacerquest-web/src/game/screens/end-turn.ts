/**
 * SpacerQuest v4.0 - End Turn Screen
 *
 * Confirms end-of-turn, runs all bot spacers, displays summary.
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { validateEndTurn, executeEndTurn } from '../systems/end-turn.js';

// Track which characters are awaiting confirmation or viewing results
const awaitingConfirm = new Set<string>();
const hasResults = new Set<string>();

export const EndTurnScreen: ScreenModule = {
  name: 'end-turn',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
    }

    const validation = validateEndTurn(character.tripCount);
    if (!validation.canEnd) {
      return {
        output: `\r\n\x1b[33m${validation.reason}\x1b[0m\r\n`,
        nextScreen: 'main-menu',
      };
    }

    awaitingConfirm.add(characterId);
    hasResults.delete(characterId);

    return {
      output: `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m           END YOUR TURN                  \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

You have completed your ${character.tripCount} trips for this turn.

All other spacers in the galaxy will now take their turns.
This may take a moment...

\x1b[37;1mEnd your turn? [Y]es / [N]o\x1b[0m
> `,
    };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    // After results are shown, any key returns to menu
    if (hasResults.has(characterId)) {
      hasResults.delete(characterId);
      return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
    }

    if (!awaitingConfirm.has(characterId)) {
      return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
    }

    if (key === 'N') {
      awaitingConfirm.delete(characterId);
      return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };
    }

    if (key === 'Y') {
      awaitingConfirm.delete(characterId);

      // Show processing message
      let output = '\r\n\x1b[33;1mProcessing turns...\x1b[0m\r\n\r\n';

      try {
        const summary = await executeEndTurn(characterId);

        // ── Galactic News Wire: curated highlights (not a full action log) ──
        if (summary.digest.length > 0) {
          output += '\x1b[36;1m═══════════════════════════════════════════\x1b[0m\r\n';
          output += '\x1b[33;1m        ⟢  G A L A C T I C   N E W S   W I R E  ⟣\x1b[0m\r\n';
          output += '\x1b[36;1m═══════════════════════════════════════════\x1b[0m\r\n\r\n';
          // First line is the dateline/opener; the rest are headline beats.
          output += `\x1b[37m${summary.digest[0]}\x1b[0m\r\n\r\n`;
          for (const line of summary.digest.slice(1, -1)) {
            output += `  ${line}\r\n`;
          }
          // Last line is the sign-off
          output += `\r\n\x1b[36;3m${summary.digest[summary.digest.length - 1]}\x1b[0m\r\n`;
          output += '\x1b[36;1m═══════════════════════════════════════════\x1b[0m\r\n';
        } else {
          output += `\x1b[32;1m${summary.botsProcessed} spacers took their turns.\x1b[0m\r\n`;
          output += `\x1b[37mA quiet cycle across the sector.\x1b[0m\r\n`;
        }

        output += '\r\n\x1b[32mYour trips have been reset. Ready for a new turn!\x1b[0m\r\n';
      } catch (err) {
        output += `\x1b[31mError processing turns. Please try again.\x1b[0m\r\n`;
      }

      output += '\r\n\x1b[37;1mPress any key to continue...\x1b[0m';
      hasResults.add(characterId);

      return { output };
    }

    return { output: '\r\n\x1b[31mPress Y or N.\x1b[0m\r\n> ' };
  },
};
