/**
 * SpacerQuest v4.0 - Black Hole Exit Event Screen
 *
 * Implements the "black" public entry from SP.PATPIR.S lines 142-198.
 *
 * Reached only via the Andromeda black-hole transit (arrive handler sets
 * screenOverride='black-hole-event' when the crossing occurs). The 1991 trigger was an
 * undocumented spacebar press during warp; here it is offered as a choice — see the
 * render() comment and EVALUATION.md §7.
 *
 * Flow:
 *   1. Nudge: "Investigate the derelict craft? [Y]/(N)" — N presses on to Andromeda.
 *   2. On Y: exit-stress component damage (blkx, lines 147-158), then the Great Void —
 *      player must input their Number Key (from the Wise One) to find the enhancement.
 *   3. If correct key: weapon enhancement discovery + Y/N install prompt (lines 166-190).
 *   4. All paths continue to the Andromeda destination (andromeda-dock).
 *
 * State machine:
 *   'nudge'        → offer to investigate the derelict (Y/N)
 *   'void_prompt'  → waiting for number key input
 *   'install'      → weapon enhancement found, prompt install Y/N
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import {
  computeBlackHoleDamage,
  rollBlackHoleDamage,
  BlackHoleDamageResult,
} from '../systems/black-hole.js';

// ============================================================================
// Session state
// ============================================================================

type BhState = 'nudge' | 'void_prompt' | 'install';
const sessionState = new Map<string, BhState>();
// Track first-install-prompt inner state: a$ in original = first Y/N answer
const installFirstAnswer = new Map<string, 'Y' | 'N' | null>();

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build the damage message shown at exit.
 * Original line 146: print nz$" badly stressed by precipitous 90 degree exit from Black Hole!"
 */
function buildDamageOutput(
  shipName: string,
  dmg: BlackHoleDamageResult
): string {
  let out = `\r\n\x1b[2J\x1b[H`;
  out += `\r\n\x1b[33;1m${shipName} badly stressed by precipitous 90 degree exit from Black Hole!\x1b[0m\r\n`;
  if (dmg.damaged) {
    out += `\r\n\x1b[31m${dmg.label} damaged -${dmg.damageAmount}\x1b[0m\r\n`;
  }
  return out;
}

// ============================================================================
// Screen module
// ============================================================================

export const BlackHoleEventScreen: ScreenModule = {
  name: 'black-hole-event',

  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true },
    });

    if (!character || !character.ship) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
    }

    // ── Discoverability nudge (see EVALUATION.md §7) ─────────────────────────
    // The 1991 original triggered the Great Void via an UNDOCUMENTED spacebar press
    // during warp — invisible to a single-player audience with no BBS grapevine. Here
    // the derelict is OFFERED instead. Investigating still carries the authentic cost:
    // it applies the "precipitous 90-degree exit" stress damage (SP.PATPIR.S 147-158,
    // a SEPARATE roll from the transit snap the arrive handler already applied), and the
    // reward remains gated on the Wise One's Number Key. Decline = clean, no discovery.
    sessionState.set(characterId, 'nudge');
    installFirstAnswer.delete(characterId);

    const output =
      '\r\n\x1b[2J\x1b[H' +
      '\r\n\x1b[36;1mYou tear through the black hole into the vacuous darkness of The Great Void.\x1b[0m\r\n' +
      '\r\nAs your sensors settle, a faintly illuminated shape looms in the distance —\r\n' +
      'a derelict craft of unknown origin, drifting in the silence.\r\n' +
      '\r\n\x1b[33mBreaking off to investigate will stress your ship further, and the Void\r\n' +
      'yields its secrets only to those who know their Number Key.\x1b[0m\r\n' +
      '\r\nInvestigate the derelict craft? \x1b[37;1m[Y]\x1b[0m/(N): ';

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const raw = input.trim();
    const state = sessionState.get(characterId) ?? 'nudge';

    // ── Discoverability nudge: investigate the derelict, or press on? ──────
    if (state === 'nudge') {
      const key = raw.toUpperCase() === '' ? 'Y' : raw.toUpperCase(); // Enter = default [Y]
      if (key === 'N') {
        sessionState.delete(characterId);
        return {
          output:
            'N\r\n\r\nYou leave the derelict to the darkness and press on toward Andromeda......\r\n' +
            '\r\nPress any key to continue...',
          nextScreen: 'andromeda-dock',
        };
      }
      if (key !== 'Y') {
        return { output: '\r\nInvestigate the derelict craft? \x1b[37;1m[Y]\x1b[0m/(N): ' };
      }

      // Y — investigating costs the exit-stress damage (SP.PATPIR.S 147-158),
      // then presents the Great Void Number-Key challenge.
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        include: { ship: true },
      });
      if (!character || !character.ship) {
        return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'andromeda-dock' };
      }
      const ship = character.ship;
      const { componentIndex, damageAmount } = rollBlackHoleDamage();
      const dmg = computeBlackHoleDamage(componentIndex, damageAmount, {
        driveStrength:       ship.driveStrength,
        cabinStrength:       ship.cabinStrength,
        lifeSupportStrength: ship.lifeSupportStrength,
        weaponStrength:      ship.weaponStrength,
        navigationStrength:  ship.navigationStrength,
        roboticsStrength:    ship.roboticsStrength,
        hullStrength:        ship.hullStrength,
      });
      if (dmg.damaged && dmg.field && dmg.newStrength !== undefined) {
        await prisma.ship.update({
          where: { id: ship.id },
          data: { [dmg.field]: dmg.newStrength },
        });
      }

      sessionState.set(characterId, 'void_prompt');
      return {
        output:
          'Y\r\n' +
          buildDamageOutput(character.shipName || 'Ship', dmg) +
          `\r\nYou pick your way toward the derelict......\r\n` +
          `\r\nInput your 'NUMBER KEY' into your Navigation System: `,
      };
    }

    // ── Void prompt: player enters Number Key (lines 162-165) ──────────────
    if (state === 'void_prompt') {
      const entered = parseInt(raw, 10);
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: { numberKey: true, shipName: true, ship: { select: { weaponStrength: true } } },
      });

      if (!character) {
        return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'main-menu' };
      }

      // Original line 164: if (kn<1) or (kn>9) kn=10  — invalid kn = 10 (impossible to match)
      const kn = (character.numberKey !== null && character.numberKey !== undefined &&
                  character.numberKey >= 1 && character.numberKey <= 9)
        ? character.numberKey
        : 10;

      // Original line 162: i=val(i$):if i<1 i=0:i$="?"
      const playerEntry = (!isNaN(entered) && entered >= 1) ? entered : 0;
      const displayEntry = playerEntry > 0 ? String(playerEntry) : '?';

      // Original line 165: if i<>kn print"Only empty space rewards your diligent scanning":goto blk9
      if (playerEntry !== kn) {
        sessionState.delete(characterId);
        return {
          output:
            `${displayEntry}\r\n...Scanning...\r\n\r\n` +
            'Only empty space rewards your diligent scanning\r\n' +
            '\r\nDis-engaging from the derelict alien craft......\r\n' +
            'You power up your Drives to Warp Light Speed\r\n' +
            'And head back to the last plotted position\r\n' +
            'Of the black hole......\r\n\r\n' +
            'Press any key to continue...',
          nextScreen: 'andromeda-dock',
        };
      }

      // Correct key — discovery sequence (lines 166-175)
      sessionState.set(characterId, 'install');
      installFirstAnswer.set(characterId, null);

      return {
        output:
          `${displayEntry}\r\n...Scanning...\r\n\r\nBut wait...\r\n` +
          '....A faintly illuminated shape looms before you\r\n' +
          'You scan the object and determine that it is a space craft\r\n' +
          "Of some kind...which your Navigation cannot identify\r\n" +
          'Using your tractor beam you pull closer and attach your\r\n' +
          "Boarding hatch to it's side. Laser-cutting an entry\r\n" +
          '........you enter and search the craft......\r\n' +
          'In the weapons room you discover an exotic device\r\n' +
          '\r\nYou transport it back to your ship for analysis\r\n' +
          '\r\nDeciding it is some kind of weapon enhancement...\r\n' +
          '\r\nInstall [Y]/(N): ',
      };
    }

    // ── Install prompt (blk3-blk5, lines 176-190) ──────────────────────────
    if (state === 'install') {
      const key = raw.toUpperCase() === '' ? 'Y' : raw.toUpperCase(); // CR defaults to Y
      const firstAnswer = installFirstAnswer.get(characterId);

      if (firstAnswer === null) {
        // First Y/N — a$ in original
        if (key !== 'Y' && key !== 'N') {
          return { output: `\r\nInstall [Y]/(N): ` };
        }
        installFirstAnswer.set(characterId, key as 'Y' | 'N');
        return {
          output:
            `${key}\r\n` +
            'Are you sure? [Y]/(N): ',
        };
      }

      // Second Y/N — i$ in original
      if (key === 'N') {
        // Original line 183: if i$="N" goto blk3  (re-ask)
        installFirstAnswer.set(characterId, null);
        return { output: `\r\nInstall [Y]/(N): ` };
      }

      if (key === 'Y') {
        if (firstAnswer === 'Y') {
          // Both Y → install (blk4-blk5, lines 186-190)
          sessionState.delete(characterId);
          installFirstAnswer.delete(characterId);

          const character = await prisma.character.findUnique({
            where: { id: characterId },
            include: { ship: true },
          });

          if (!character || !character.ship) {
            return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n', nextScreen: 'andromeda-dock' };
          }

          // Original blk4: if left$(w1$,1)="?" goto blk5 (already enhanced)
          //                 w1$="?"+w1$ (prepend "?" = weapon enhanced flag)
          // In v4.0: set hasWeaponMark = true on ship (equivalent to w1$="?"+w1$)
          const alreadyEnhanced = character.ship.hasWeaponMark;
          if (!alreadyEnhanced) {
            await prisma.ship.update({
              where: { id: character.ship.id },
              data: { hasWeaponMark: true },
            });
          }

          const weaponName = alreadyEnhanced ? 'Weapons (already enhanced)' : 'Weapons';
          return {
            output:
              `Y\r\n` +
              `\r\nThe alien enhancement device is installed on your ${weaponName}\r\n` +
              '\r\nDis-engaging from the derelict alien craft......\r\n' +
              'You power up your Drives to Warp Light Speed\r\n' +
              'And head back to the last plotted position\r\n' +
              'Of the black hole......\r\n\r\n' +
              'Press any key to continue...',
            nextScreen: 'andromeda-dock',
          };
        }

        // firstAnswer was N, second is Y → jettison (line 185)
        sessionState.delete(characterId);
        installFirstAnswer.delete(characterId);
        return {
          output:
            `Y\r\n` +
            '\r\nThe device is jettisoned over-board\r\n' +
            '\r\nDis-engaging from the derelict alien craft......\r\n' +
            'You power up your Drives to Warp Light Speed\r\n' +
            'And head back to the last plotted position\r\n' +
            'Of the black hole......\r\n\r\n' +
            'Press any key to continue...',
          nextScreen: 'andromeda-dock',
        };
      }

      // Non Y/N key
      return { output: '\r\nAre you sure? [Y]/(N): ' };
    }

    // Fallback: any key at blk9 (end state)
    sessionState.delete(characterId);
    return { output: '\r\n', nextScreen: 'andromeda-dock' };
  },
};
