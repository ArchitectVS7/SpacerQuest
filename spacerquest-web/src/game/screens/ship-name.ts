/**
 * SpacerQuest v4.0 - Ship Naming Screen (SP.REG.S shipname subroutine)
 *
 * Accessed via Library option 6 (SP.REG.S line 62: if i=6 goto shipname).
 *
 * Original SP.REG.S shipname subroutine (lines 98-129):
 *
 *   1. Show current ship name
 *   2. Preserve current alliance suffix (io$) from last char of current name
 *   3. Prompt for new name
 *   4. Validate:
 *      - 3-15 chars: "3-15 characters....please"
 *      - First 4 chars contain "THE ": "No 'THE ' allowed!"
 *      - Last char is an alliance symbol (+/@/&/^): "Seek out the Spacers Hangout..."
 *   5. Confirm: "Henceforth your spaceship will be named: [NAME] ...is this correct? [Y]/(N):"
 *   6. Y/Enter → save (appending old alliance suffix if present) → goto lib1
 *   7. N → re-prompt (goto shipname)
 *   8. Q/empty at input → "No changes made" → goto lib1
 *
 * Note: In the modern implementation the alliance symbol is stored in
 * character.allianceSymbol (not embedded in shipName), so suffix preservation
 * is handled by the separate allianceSymbol field and not re-appended to the name.
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';

// Alliance symbols that may not be added to ship names manually
const ALLIANCE_SYMBOLS = new Set(['+', '@', '&', '^']);

// Per-character pending name during Y/N confirmation
const pendingName = new Map<string, string>();

function renderPrompt(currentShipName: string | null): string {
  let out = '';
  out += '\r\n\x1b[33;1m=== SHIP NAMING ===\x1b[0m\r\n';
  out += `Your ship's name: \x1b[37;1m${currentShipName || '(unnamed)'}\x1b[0m\r\n`;
  out += '\r\nEnter the new name of your ship (<C-R> Quits): ';
  return out;
}

export const ShipNameScreen: ScreenModule = {
  name: 'ship-name',

  render: async (characterId: string): Promise<ScreenResponse> => {
    pendingName.delete(characterId);

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { shipName: true },
    });

    return { output: renderPrompt(character?.shipName ?? null) };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { shipName: true },
    });

    if (!character) {
      return { output: '\x1b[31mError.\x1b[0m\r\n', nextScreen: 'library' };
    }

    // ── Y/N confirmation state ─────────────────────────────────────────────
    if (pendingName.has(characterId)) {
      const newName = pendingName.get(characterId)!;
      const key = input.trim().toUpperCase();

      if (key === 'N') {
        // Original: if i$="N" print"No":goto shipname (re-show from top)
        pendingName.delete(characterId);
        return { output: 'No\r\n' + renderPrompt(character.shipName) };
      }

      // Y or Enter = confirm (original: [Y]/(N) — Y is default)
      pendingName.delete(characterId);
      await prisma.character.update({
        where: { id: characterId },
        data: { shipName: newName },
      });
      return {
        output: `Yes\r\n`,
        nextScreen: 'library',
      };
    }

    // ── Name input state ───────────────────────────────────────────────────
    const raw = input.trim();

    // Q or empty = quit (original: if i$="" i$="Q" / if i$="Q" print"No changes made":goto lib1)
    if (raw === '' || raw.toUpperCase() === 'Q') {
      return { output: 'No changes made\r\n', nextScreen: 'library' };
    }

    // Length check (original: if (l<3) or (l>15) print"3-15 characters....please":goto shna)
    if (raw.length < 3 || raw.length > 15) {
      return {
        output: '3-15 characters....please\r\n\r\nEnter the new name of your ship (<C-R> Quits): ',
      };
    }

    // "THE " prefix check (original: a$=left$(i$,4): if instr("THE ",a$) ...)
    // Blocks names that are "THE" exactly (3 chars) or start with "THE " (4+ chars)
    const first4 = raw.substring(0, 4).toUpperCase();
    if (first4 === 'THE ' || raw.toUpperCase() === 'THE') {
      return {
        output: `No '${first4.trimEnd()}' allowed!\r\n\r\nEnter the new name of your ship (<C-R> Quits): `,
      };
    }

    // Alliance symbol check (original: im$=right$(i$,1): if symbol → goto ali)
    const lastChar = raw.slice(-1);
    if (ALLIANCE_SYMBOLS.has(lastChar)) {
      return {
        output:
          '\r\nSeek out the Spacers Hangout before being\r\n' +
          'Using that symbol in your ship\'s name.\r\n\r\n' +
          'Enter the new name of your ship (<C-R> Quits): ',
      };
    }

    // Valid name — show confirmation (original: lines 125-128)
    pendingName.set(characterId, raw);
    return {
      output:
        `\r\nHenceforth your spaceship will be named: \x1b[37;1m${raw}\x1b[0m\r\n` +
        '......is this correct? [Y]/(N): ',
    };
  },
};
