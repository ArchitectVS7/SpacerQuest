/**
 * SpacerQuest v4.0 - Top Gun Rankings Screen + Wins Mission Offer (SP.TOP.S)
 *
 * Two distinct entry modes, matching the original SP.TOP.S entry points:
 *
 * 1. Rankings display (Library option 8, `link"sp.top","start"`):
 *    render() with no wins flag → shows rankings, any key → library
 *
 * 2. Nemesis mission offer (`wins` subroutine, SP.TOP.S lines 111-150):
 *    render() when pendingWins flag set → shows D/M/T mission offer screen
 *    - (D)ecline → return to calling screen
 *    - (M)ission → assign Nemesis mission (missionType=9, q6=20, etc.) → navigate
 *    - [T]alk about it (default) → flavor text → re-show menu
 *    Space Commandant (SP.REG.S:183, SP.CARGO.S:36) routes here via nextScreen:'topgun'
 *    after setting pendingWins.
 *
 * Original categories (SP.TOP.S lines 79-102):
 *   td$ = Fastest Drives    (d1*d2)
 *   tf$ = Fanciest Cabin    (c1*c2)
 *   ts$ = Best Life Support (l1*l2)
 *   tw$ = Strongest Weapons (w1*w2)
 *   tj$ = Best Navigation   (n1*n2)
 *   tr$ = Best Robotics     (r1*r2)
 *   tg$ = Strongest Shields (p1*p2)
 *   a$  = Best All-Around Ship
 *
 * In the original, this was a static file (topgun). The modern version
 * computes rankings live from the database.
 *
 * After rankings display: any key returns to library (original: "goto lib1").
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { getTopGunRankings } from '../systems/topgun.js';
import { prisma } from '../../db/prisma.js';

// ============================================================================
// State: which players are in the "wins" mission-offer flow
// (SP.TOP.S wins subroutine, lines 111-150)
// ============================================================================

/**
 * Characters currently in the wins mission-offer flow.
 * Set by space-patrol.ts and traders-cargo.ts before routing nextScreen:'topgun'.
 * win1 state: 'menu' = waiting for D/M/T; 'confirm' = waiting for Y/N before assign
 */
export const pendingWins = new Map<string, 'menu' | 'confirm' | 'talk'>();

// ============================================================================
// Wins screen helpers (SP.TOP.S lines 114-150)
// ============================================================================

function winsMenuText(prefix: string, name: string): string {
  return (
    `\r\n${prefix} ${name}, you have done well!\r\n` +
    'The Space Patrol has been authorized to offer you\r\n' +
    'Perhaps, the most dangerous assignment of all.\r\n' +
    '\r\nYour choice?  (D)ecline  (M)ission  [T]alk about it: '
  );
}

function winsTalkText(): string {
  return (
    "\r\nThe 'Mission' consists of travelling to the far reaches\r\n" +
    'Of the galaxy, finding the Nemesis star system and\r\n' +
    'Bringing back the Nemesian Star Jewels. These gems\r\n' +
    'Are reputed to have incredible powers which could be\r\n' +
    'Used to alleviate much of the pain, suffering, and\r\n' +
    'Misunderstanding which exists in the universe today.\r\n'
  );
}

function winsAssignText(name: string, prefix: string): string {
  return (
    '\r\nYour mission is to find and bring back the Nemesian Star Jewels\r\n' +
    'From the Nemesian Star System.  The required coordinates are\r\n' +
    '\r\n.......00,00,00.....Your Destination is......NEMESIS\r\n' +
    '\r\nThe Trip will require a great deal of fuel...as well as\r\n' +
    `Your ship being in perfect condition.  Prepare well\r\n` +
    'As this is a most hazardous trip with countless dangers\r\n' +
    'Awaiting you along the way.  Few are chosen for a mission\r\n' +
    'Such as this...Only the best are qualified...It has been said\r\n' +
    "That a special word is required...'to unlock the unlockable'.\r\n" +
    "(Rumors are that purveyors of spirits know of such things)\r\n" +
    '\r\nAll the galaxy awaits your safe return.....\r\n' +
    `\r\n............God Speed ${prefix} ${name}!......\r\n`
  );
}

// ============================================================================
// SCREEN MODULE
// ============================================================================

export const TopgunScreen: ScreenModule = {
  name: 'topgun',

  render: async (characterId: string): Promise<ScreenResponse> => {
    // ── wins subroutine (SP.TOP.S lines 111-150) ─────────────────────────
    // If pendingWins is set, show the Nemesis mission offer, not the rankings.
    if (pendingWins.has(characterId)) {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
      });
      if (!character) {
        pendingWins.delete(characterId);
        return { output: '\x1b[31mError.\x1b[0m\r\n', nextScreen: 'main-menu' };
      }
      // Ensure wins state is 'menu'
      pendingWins.set(characterId, 'menu');
      const prefix = character.rank || '';
      return { output: winsMenuText(prefix, character.name) };
    }

    // ── Rankings display (SP.TOP.S start/write, lines 30-103) ────────────
    const { categories } = await getTopGunRankings();

    let out = '';
    out += '\x1b[36;1m=========================================\x1b[0m\r\n';
    out += '\x1b[33;1m           TOP GUN RANKINGS              \x1b[0m\r\n';
    out += '\x1b[36;1m=========================================\x1b[0m\r\n\r\n';

    for (const cat of categories) {
      const label = (cat.name + ':').padEnd(22);
      const leader = cat.leader.padEnd(16);
      out += `  ${label} ${leader} [${cat.value}]\r\n`;
    }

    out += '\r\n\x1b[36m-----------------------------------------\x1b[0m\r\n';
    out += '....type anykey to go on....';
    return { output: out };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const key = input.trim().toUpperCase();

    // ── wins flow input handling (SP.TOP.S win1/assign labels) ───────────
    const winsState = pendingWins.get(characterId);

    if (winsState === 'menu') {
      // Default [T] on Enter (SP.TOP.S:118: if i$=chr$(13) i$="T")
      const effective = key === '' ? 'T' : key;

      if (effective === 'D') {
        // Decline: link"sp.link" — return to main menu
        pendingWins.delete(characterId);
        return { output: `${effective}\r\n`, nextScreen: 'main-menu' };
      }

      if (effective === 'M') {
        // Mission: ask for confirmation (SP.TOP.S assign:133)
        pendingWins.set(characterId, 'confirm');
        return {
          output: `${effective}\r\n\r\nSure you want to take on this mission? [Y]/(N): `,
        };
      }

      // T (or default): show talk text, re-show menu
      pendingWins.set(characterId, 'talk');
      const character = await prisma.character.findUnique({ where: { id: characterId } });
      const prefix = character?.rank || '';
      const name = character?.name || '';
      return {
        output: `${effective}\r\n` + winsTalkText() + winsMenuText(prefix, name),
      };
    }

    if (winsState === 'talk') {
      // After talk text re-show — same as menu
      pendingWins.set(characterId, 'menu');
      const key2 = key === '' ? 'T' : key;

      if (key2 === 'D') {
        pendingWins.delete(characterId);
        return { output: `${key2}\r\n`, nextScreen: 'main-menu' };
      }
      if (key2 === 'M') {
        pendingWins.set(characterId, 'confirm');
        return { output: `${key2}\r\nSure you want to take on this mission? [Y]/(N): ` };
      }
      // T again
      pendingWins.set(characterId, 'talk');
      const character = await prisma.character.findUnique({ where: { id: characterId } });
      const prefix = character?.rank || '';
      const name = character?.name || '';
      return {
        output: `${key2}\r\n` + winsTalkText() + winsMenuText(prefix, name),
      };
    }

    if (winsState === 'confirm') {
      // SP.TOP.S assign:134: if i$="N" print"No":goto win1
      if (key === 'N') {
        pendingWins.set(characterId, 'menu');
        const character = await prisma.character.findUnique({ where: { id: characterId } });
        const prefix = character?.rank || '';
        const name = character?.name || '';
        return { output: `No\r\n` + winsMenuText(prefix, name) };
      }

      // Y or Enter: assign Nemesis mission (SP.TOP.S assign lines 135-150)
      // kk=9, q1=s1 (cargoPods = existing), q2=0, q4=0, q5=1, q6=20, q2$="Nemesis Orders", q4$="NEMESIS"
      // missionType=9, cargoPayment=1 (q5=1), cargoManifest='Nemesis Orders', destination=28 (Nemesis)
      // kk q6=20 stored in cargoPayment override at award time — here we set cargoPayment=20 (q6)
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        include: { ship: true },
      });
      if (!character) {
        pendingWins.delete(characterId);
        return { output: '\x1b[31mError.\x1b[0m\r\n', nextScreen: 'main-menu' };
      }

      // SP.TOP.S:148: kk=9:q1=s1:q2=0:q4=0:q5=1:q6=20:q2$="Nemesis Orders":q4$="NEMESIS"
      // In modern schema: missionType=9, cargoPods stays as-is (q1=s1 = player's ship cargoPods),
      // cargoType=0, destination=28 (Nemesis system), cargoManifest='Nemesis Orders', cargoPayment=20 (q6)
      await prisma.character.update({
        where: { id: characterId },
        data: {
          missionType: 9,
          cargoType: 0,
          destination: 28,
          cargoManifest: 'Nemesis Orders',
          cargoPayment: 20,
        },
      });

      pendingWins.delete(characterId);
      const prefix = character.rank || '';
      return {
        output:
          `Yes\r\n` +
          winsAssignText(character.name, prefix) +
          '\r\n....type anykey to go on.....',
        nextScreen: 'navigate',
      };
    }

    // ── Rankings: any key returns to library ──────────────────────────────
    // (original: "setint(1):copy f$:setint(''):goto lib1")
    return { output: '\r\n', nextScreen: 'library' };
  },
};
