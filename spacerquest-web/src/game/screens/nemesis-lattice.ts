/**
 * SpacerQuest v4.0 - Nemesis Lattice Puzzle Screen
 *
 * SP.MAL.S nemgem subroutine (lines 379-405):
 *
 * After defeating the Nemesian Forces (kk=9), the player must speak
 * the correct word to the crystal lattice to claim the Star Jewels.
 * The answer is "INFINITY".
 *
 * Original flow:
 *   i=0:copy"nemesis"
 *   nemg1: input@2"What say you to The Lattice? ";i$
 *   if i$="INFINITY" → shatters lattice, awards gems, goto mallosex
 *   hint responses for partial matches
 *   wrong/empty: "Nothing happens!", i+1, up to 3 attempts then nemx
 *   nemx: "Leave without the jewels? (Y)/[N]:" → Y: abandon, N: retry
 *
 * Rewards (mallosex + gems via SP.TOP.S:169-172):
 *   sc+1: promotions+1
 *   j1+10: astrecs+10
 *   u1+1: trips+1
 *   z1=0: tripCount=0
 *   s2+q6+5 (q6=20): score+25
 *   g1+15: credits+150,000
 *   l1+50: lifeSupportStrength+50, l2=9
 *   p1=25, p2=9: shield 25/9
 *   w1=25, w2=2: weapon 25/2
 *   w1$="STAR-BUSTER++", p1$="ARCH-ANGEL++", l1$="LSS Chrysalis+*"
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { addCredits } from '../utils.js';
import { NEMESIS_REWARD_CREDITS } from '../constants.js';

interface LatticeState {
  attempts: number;      // SP.MAL.S i counter
  awaitingAbandon: boolean; // nemx state — waiting for Y/N
}

const latticeState = new Map<string, LatticeState>();

function getState(characterId: string): LatticeState {
  if (!latticeState.has(characterId)) {
    latticeState.set(characterId, { attempts: 0, awaitingAbandon: false });
  }
  return latticeState.get(characterId)!;
}

function getHint(input: string): string | null {
  const up = input.toUpperCase();
  if (up.includes('HELP'))    return 'Ah...the finite cry...';
  if (up.includes('FINIT'))   return '...Very warm!';
  if (up.includes('ETERN'))   return '....Close...but no cigar';
  if (up.includes('SPACE'))   return 'Nice try';
  if (up.includes('FIREFOX')) return "Calling on dieties doesn't help";
  if (up.includes('SHIT'))    return 'Getting a craving for soap';
  if (up.includes('FUCK'))    return 'You taste soap!';
  if (up.includes('DAMN'))    return '...Frustrated?????';
  return null;
}

async function awardGems(characterId: string): Promise<void> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });
  if (!character || !character.ship) return;

  // mallosex (SP.MAL.S:316-321): sc+1, j1+10, u1+1, z1=0, s2+q6+5 (q6=20)
  await prisma.character.update({
    where: { id: characterId },
    data: {
      score: character.score + 25,
      promotions: character.promotions + 1,
      tripsCompleted: character.tripsCompleted + 1,
      tripCount: 0,
      astrecsTraveled: (character.astrecsTraveled + 10) > 29999 ? 0 : character.astrecsTraveled + 10,
      missionType: 0,
      destination: 0,
      cargoManifest: null,
      pendingLattice: false,
    },
  });

  // gems (SP.TOP.S:169-172):
  //   g1+15 credits, l1+50, l2=9, p1=25, p2=9, w1=25, w2=2
  //   w1$="STAR-BUSTER++", p1$="ARCH-ANGEL++", l1$="LSS Chrysalis+*"
  //   SP.TOP.S:169: q1=0:q2=0:q3=0:q4=0:q5=0:q6=0:q2$="":q4$="" (full zerout)
  const { high, low } = addCredits(character.creditsHigh, character.creditsLow, NEMESIS_REWARD_CREDITS);
  await prisma.ship.update({
    where: { characterId },
    data: {
      lifeSupportStrength: character.ship.lifeSupportStrength + 50,
      lifeSupportCondition: 9,
      lifeSupportName: 'LSS Chrysalis+*',
      shieldStrength: 25,
      shieldCondition: 9,
      shieldName: 'ARCH-ANGEL++',
      weaponStrength: 25,
      weaponCondition: 2,
      weaponName: 'STAR-BUSTER++',
      hasStarBuster: true,
      hasArchAngel: true,
    },
  });
  await prisma.character.update({
    where: { id: characterId },
    data: {
      creditsHigh: high,
      creditsLow: low,
      // SP.TOP.S:169 full zerout: q1=0, q2=0, q3=0, q4=0, q5=0, q6=0
      cargoPods: 0,
      cargoType: 0,
      cargoPayment: 0,
    },
  });

  await prisma.gameLog.create({
    data: {
      type: 'MISSION',
      characterId,
      message: `${character.name} Conquered Nemesian Forces and returned with the Star Jewels`,
      metadata: { event: 'NEMESIS_COMPLETE', reward: NEMESIS_REWARD_CREDITS },
    },
  });
}

export const NemesisLatticeScreen: ScreenModule = {
  name: 'nemesis-lattice',

  render: async (characterId: string): Promise<ScreenResponse> => {
    latticeState.set(characterId, { attempts: 0, awaitingAbandon: false });
    let out = '\x1b[2J\x1b[H';
    out += '\x1b[35;1m_________________________________________\x1b[0m\r\n';
    out += '\x1b[35;1m      N E M E S I S                      \x1b[0m\r\n';
    out += '\x1b[35;1m_________________________________________\x1b[0m\r\n\r\n';
    out += '\x1b[36mThe crystal lattice glows with an eerie light...\x1b[0m\r\n';
    out += '\x1b[36mAncient energies pulse within its facets.\x1b[0m\r\n\r\n';
    out += '\x1b[33mWhat say you to The Lattice? \x1b[0m\r\n> ';
    return { output: out };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const state = getState(characterId);
    const trimmed = input.trim();
    const upper = trimmed.toUpperCase();

    // ── nemx: abandon confirmation (Y/N) ──────────────────────────────────
    if (state.awaitingAbandon) {
      if (upper === 'Y') {
        // SP.MAL.S:399: pb=3, kk=1, goto linkup — leave without jewels
        latticeState.delete(characterId);
        await prisma.character.update({
          where: { id: characterId },
          data: {
            missionType: 0,
            destination: 0,
            cargoManifest: null,
            pendingLattice: false,
          },
        });
        return { output: 'Yes\r\n', nextScreen: 'main-menu' };
      }
      // N — retry from scratch (SP.MAL.S:400: i=0: goto nemg1)
      state.awaitingAbandon = false;
      state.attempts = 0;
      return { output: 'No\r\n\r\nWhat say you to The Lattice? \r\n> ' };
    }

    // ── INFINITY — correct answer (SP.MAL.S:385: if i$="INFINITY" goto nemg2) ──
    if (upper === 'INFINITY') {
      latticeState.delete(characterId);
      await awardGems(characterId);
      let out = '\r\n\x1b[32mThe crystal lattice shatters into fine dust. You take the gems\x1b[0m\r\n\r\n';
      out += '\x1b[33m+25 score points awarded.\x1b[0m\r\n';
      out += '\x1b[33mThe Nemesian Star Jewels have altered your weaponry, shields, and life support!\x1b[0m\r\n';
      out += '\x1b[33m150,000 cr honorarium awarded by the Space Authority.\x1b[0m\r\n\r\n';
      out += '\x1b[32mPress any key to continue...\x1b[0m\r\n> ';
      return { output: out, nextScreen: 'main-menu' };
    }

    // ── QUIT — goto nemx (SP.MAL.S:394: if instr("QUIT",i$) goto nemx) ──
    if (upper.includes('QUIT')) {
      state.awaitingAbandon = true;
      return { output: '\r\nLeave without the jewels? (Y)/[N]: ' };
    }

    // ── Wrong answer — increment attempt counter ──────────────────────────
    // SP.MAL.S: hint checks fall through to nemo (both hint AND "Nothing happens!" print)
    state.attempts += 1;

    let out = '';
    const hint = getHint(upper);
    if (hint) {
      out += `\r\n${hint}\r\n`;
    }
    out += '\r\n.....Nothing happens!\r\n';

    // SP.MAL.S:396: i<3 → retry; i>=3 → nemx
    if (state.attempts >= 3) {
      state.awaitingAbandon = true;
      state.attempts = 0;
      out += '\r\nLeave without the jewels? (Y)/[N]: ';
      return { output: out };
    }

    out += '\r\nWhat say you to The Lattice? \r\n> ';
    return { output: out };
  },
};
