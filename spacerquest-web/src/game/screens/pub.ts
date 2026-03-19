/**
 * SpacerQuest v4.0 - Pub Screen (SP.BAR.S / SP.GAME.S)
 *
 * Gambling games, gossip, and information.
 * Wheel of Fortune and Spacer's Dare are multi-step input flows.
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits, subtractCredits, addCredits, getTotalCredits } from '../utils.js';
import { playWheelOfFortune, playSpacersDare, calculateWofOdds } from '../systems/gambling.js';
import {
  WOF_MAX_BET,
  WOF_MIN_ROLLS,
  WOF_MAX_ROLLS,
  WOF_NUMBERS,
  DARE_MIN_ROUNDS,
  DARE_MAX_ROUNDS,
  DARE_MAX_MULTIPLIER,
  DARE_MIN_CREDITS,
} from '../constants.js';

// ============================================================================
// Multi-step input state tracking
// ============================================================================

interface WofState {
  step: 'NUMBER' | 'ROLLS' | 'BET';
  betNumber?: number;
  rolls?: number;
}

interface DareState {
  step: 'ROUNDS' | 'MULTIPLIER';
  rounds?: number;
}

const wofStates = new Map<string, WofState>();
const dareStates = new Map<string, DareState>();

export const PubScreen: ScreenModule = {
  name: 'pub',
  render: async (characterId: string): Promise<ScreenResponse> => {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { ship: true }
    });

    if (!character) {
      return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n' };
    }

    // Clear any pending gambling state on re-render
    wofStates.delete(characterId);
    dareStates.delete(characterId);

    const credits = formatCredits(character.creditsHigh, character.creditsLow);

    const output = `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m      THE LONELY ASTEROID PUB             \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m

The air is thick with smoke and cheap synth-ale.
Spacers from across the galaxy share stories here.

\x1b[32mCredits:\x1b[0m ${credits} cr

\x1b[37;1m=========================================\x1b[0m
\x1b[33;1m           PUB MENU                      \x1b[0m
\x1b[37;1m=========================================\x1b[0m

  [G]ossip - Hear the latest rumors
  [W]heel of Fortune - Test your luck (${WOF_MAX_BET} cr max)
  [D]are Game - High stakes gambling
  [B]uy a drink (50 cr)
  [M]ain Menu

\x1b[32m:\x1b[0m${character.currentSystem} Pub:\x1b[32m:(?=Menu): Command:\x1b[0m
> `;

    return { output };
  },

  handleInput: async (characterId: string, input: string): Promise<ScreenResponse> => {
    const raw = input.trim();
    const key = raw.toUpperCase();

    // ---------------------------------------------------------------
    // Wheel of Fortune multi-step flow
    // ---------------------------------------------------------------
    if (wofStates.has(characterId)) {
      return handleWofInput(characterId, raw);
    }

    // ---------------------------------------------------------------
    // Spacer's Dare multi-step flow
    // ---------------------------------------------------------------
    if (dareStates.has(characterId)) {
      return handleDareInput(characterId, raw);
    }

    // ---------------------------------------------------------------
    // Main pub menu
    // ---------------------------------------------------------------
    switch (key) {
      case 'M':
        return { output: '\x1b[2J\x1b[H', nextScreen: 'main-menu' };

      case 'G': {
        const logs = await prisma.gameLog.findMany({
          where: { type: { in: ['BATTLE', 'PROMOTION', 'ALLIANCE'] } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });

        const gossip = logs.map(log => `  \x1b[36m*\x1b[0m ${log.message}`).join('\r\n');
        return {
          output: `\r\n\x1b[33mLatest Gossip:\x1b[0m\r\n${gossip || '  Nothing new...'}\r\n> `
        };
      }

      case 'W': {
        // Start Wheel of Fortune flow
        wofStates.set(characterId, { step: 'NUMBER' });
        return {
          output: `\r\n\x1b[33;1m=== ASTRAL DIGITAL WHEEL OF FORTUNE ===\x1b[0m\r\n` +
            `\r\nThe wheel has ${WOF_NUMBERS} numbers. Pick yours!\r\n` +
            `\r\nEnter your lucky number (1-${WOF_NUMBERS}), or Q to cancel: `,
        };
      }

      case 'D': {
        // Start Spacer's Dare flow
        const character = await prisma.character.findUnique({ where: { id: characterId } });
        if (!character) return { output: '\x1b[31mError.\x1b[0m\r\n> ' };

        const credits = getTotalCredits(character.creditsHigh, character.creditsLow);
        if (credits < DARE_MIN_CREDITS) {
          return {
            output: `\r\n\x1b[33;1m=== SPACER'S DARE ===\x1b[0m\r\n` +
              `\r\n\x1b[31mYou need at least ${DARE_MIN_CREDITS} credits to play.\x1b[0m\r\n> `,
          };
        }

        dareStates.set(characterId, { step: 'ROUNDS' });
        return {
          output: `\r\n\x1b[33;1m=== SPACER'S DARE ===\x1b[0m\r\n` +
            `\r\nYou and the computer roll dice. Doubles = bust.\r\n` +
            `Net difference x multiplier = credits won or lost.\r\n` +
            `\r\nHow many rounds? (${DARE_MIN_ROUNDS}-${DARE_MAX_ROUNDS}), or Q to cancel: `,
        };
      }

      case 'B': {
        const character = await prisma.character.findUnique({
          where: { id: characterId }
        });
        if (!character) return { output: '\x1b[31mError: Character not found.\x1b[0m\r\n> ' };

        const { success, high, low } = subtractCredits(character.creditsHigh, character.creditsLow, 50);
        if (!success) {
          return { output: '\r\n\x1b[31mYou don\'t have enough credits for a drink!\x1b[0m\r\n> ' };
        }

        await prisma.character.update({
          where: { id: characterId },
          data: { creditsHigh: high, creditsLow: low }
        });

        return {
          output: '\r\n\x1b[32m*gulp* That hit the spot! (-50 cr)\x1b[0m\r\n> '
        };
      }

      default:
        return {
          output: '\r\n\x1b[31mInvalid command. Press G, W, D, B, or M.\x1b[0m\r\n> '
        };
    }
  }
};

// ============================================================================
// WHEEL OF FORTUNE — multi-step handler
// ============================================================================

async function handleWofInput(characterId: string, raw: string): Promise<ScreenResponse> {
  if (raw.toUpperCase() === 'Q') {
    wofStates.delete(characterId);
    return { output: '\r\n\x1b[33mCancelled.\x1b[0m\r\n> ' };
  }

  const state = wofStates.get(characterId)!;
  const num = parseInt(raw, 10);

  if (state.step === 'NUMBER') {
    if (isNaN(num) || num < 1 || num > WOF_NUMBERS) {
      return { output: `\r\n\x1b[31mPick a number 1-${WOF_NUMBERS}.\x1b[0m\r\nYour number: ` };
    }
    state.betNumber = num;
    state.step = 'ROLLS';
    return {
      output: `\r\nNumber \x1b[33;1m${num}\x1b[0m locked in.\r\n` +
        `How many rolls? (${WOF_MIN_ROLLS}-${WOF_MAX_ROLLS}) — more rolls = better odds, lower payout: `,
    };
  }

  if (state.step === 'ROLLS') {
    if (isNaN(num) || num < WOF_MIN_ROLLS || num > WOF_MAX_ROLLS) {
      return { output: `\r\n\x1b[31mChoose ${WOF_MIN_ROLLS}-${WOF_MAX_ROLLS} rolls.\x1b[0m\r\nRolls: ` };
    }
    state.rolls = num;
    state.step = 'BET';
    const odds = calculateWofOdds(num);
    return {
      output: `\r\n${num} rolls — payout odds: \x1b[33;1m${odds}:1\x1b[0m\r\n` +
        `Bet amount? (1-${WOF_MAX_BET} cr): `,
    };
  }

  if (state.step === 'BET') {
    if (isNaN(num) || num < 1 || num > WOF_MAX_BET) {
      return { output: `\r\n\x1b[31mBet 1-${WOF_MAX_BET} cr.\x1b[0m\r\nBet: ` };
    }

    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) {
      wofStates.delete(characterId);
      return { output: '\x1b[31mError.\x1b[0m\r\n> ' };
    }

    const result = playWheelOfFortune({
      betNumber: state.betNumber!,
      betAmount: num,
      rolls: state.rolls!,
      creditsHigh: character.creditsHigh,
      creditsLow: character.creditsLow,
    });

    wofStates.delete(characterId);

    if (!result.success) {
      return { output: `\r\n\x1b[31m${result.error}\x1b[0m\r\n> ` };
    }

    // Display the wheel spinning
    let out = '\r\n\x1b[33;1mThe wheel spins...\x1b[0m\r\n';
    for (let i = 0; i < result.rolls!.length; i++) {
      const match = result.rolls![i] === state.betNumber! ? '\x1b[32;1m***' : '\x1b[37m   ';
      out += `  Roll ${i + 1}: \x1b[36;1m${String(result.rolls![i]).padStart(2)}\x1b[0m ${match}\x1b[0m\r\n`;
    }

    if (result.won) {
      const payout = result.payout!;
      const newCredits = addCredits(character.creditsHigh, character.creditsLow, payout);
      await prisma.character.update({
        where: { id: characterId },
        data: { creditsHigh: newCredits.high, creditsLow: newCredits.low },
      });
      out += `\r\n\x1b[32;1mWINNER! Number ${state.betNumber} hit! +${payout} cr\x1b[0m\r\n`;
    } else {
      const cost = result.cost!;
      const newCredits = subtractCredits(character.creditsHigh, character.creditsLow, cost);
      if (newCredits.success) {
        await prisma.character.update({
          where: { id: characterId },
          data: { creditsHigh: newCredits.high, creditsLow: newCredits.low },
        });
      }
      out += `\r\n\x1b[31mNo luck. Number ${state.betNumber} didn't come up. -${cost} cr\x1b[0m\r\n`;
    }

    out += '> ';
    return { output: out };
  }

  wofStates.delete(characterId);
  return { output: '\r\n> ' };
}

// ============================================================================
// SPACER'S DARE — multi-step handler
// ============================================================================

async function handleDareInput(characterId: string, raw: string): Promise<ScreenResponse> {
  if (raw.toUpperCase() === 'Q') {
    dareStates.delete(characterId);
    return { output: '\r\n\x1b[33mCancelled.\x1b[0m\r\n> ' };
  }

  const state = dareStates.get(characterId)!;
  const num = parseInt(raw, 10);

  if (state.step === 'ROUNDS') {
    if (isNaN(num) || num < DARE_MIN_ROUNDS || num > DARE_MAX_ROUNDS) {
      return { output: `\r\n\x1b[31mChoose ${DARE_MIN_ROUNDS}-${DARE_MAX_ROUNDS} rounds.\x1b[0m\r\nRounds: ` };
    }
    state.rounds = num;
    state.step = 'MULTIPLIER';
    return {
      output: `\r\n${num} rounds. Stakes multiplier? (1-${DARE_MAX_MULTIPLIER}): `,
    };
  }

  if (state.step === 'MULTIPLIER') {
    if (isNaN(num) || num < 1 || num > DARE_MAX_MULTIPLIER) {
      return { output: `\r\n\x1b[31mMultiplier 1-${DARE_MAX_MULTIPLIER}.\x1b[0m\r\nMultiplier: ` };
    }

    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) {
      dareStates.delete(characterId);
      return { output: '\x1b[31mError.\x1b[0m\r\n> ' };
    }

    const result = playSpacersDare({
      rounds: state.rounds!,
      multiplier: num,
      creditsHigh: character.creditsHigh,
      creditsLow: character.creditsLow,
    });

    dareStates.delete(characterId);

    if (!result.success) {
      return { output: `\r\n\x1b[31m${result.error}\x1b[0m\r\n> ` };
    }

    // Display round-by-round results
    let out = '\r\n\x1b[33;1mDice are rolling...\x1b[0m\r\n';
    out += `\r\n  ${'Round'.padEnd(7)} ${'You'.padEnd(8)} ${'Computer'.padEnd(10)} Winner\r\n`;
    out += `  ${'-'.repeat(38)}\r\n`;

    for (let i = 0; i < result.roundResults!.length; i++) {
      const r = result.roundResults![i];
      const pRoll = r.playerRolls[0];
      const cRoll = r.computerRolls[0];
      const pDisplay = pRoll.isDoubles ? `${pRoll.die1}+${pRoll.die2}=BUST` : `${pRoll.die1}+${pRoll.die2}=${pRoll.total}`;
      const cDisplay = cRoll.isDoubles ? `${cRoll.die1}+${cRoll.die2}=BUST` : `${cRoll.die1}+${cRoll.die2}=${cRoll.total}`;
      const winColor = r.roundWinner === 'PLAYER' ? '\x1b[32m' : r.roundWinner === 'COMPUTER' ? '\x1b[31m' : '\x1b[33m';
      out += `  ${String(i + 1).padEnd(7)} ${pDisplay.padEnd(8)} ${cDisplay.padEnd(10)} ${winColor}${r.roundWinner}\x1b[0m\r\n`;
    }

    out += `\r\n  Total: You \x1b[36;1m${result.playerTotal}\x1b[0m — Computer \x1b[36;1m${result.computerTotal}\x1b[0m`;
    out += ` (x${result.multiplier} multiplier)\r\n`;

    const net = result.netCredits!;
    if (result.winner === 'PLAYER') {
      const newCredits = addCredits(character.creditsHigh, character.creditsLow, net);
      await prisma.character.update({
        where: { id: characterId },
        data: { creditsHigh: newCredits.high, creditsLow: newCredits.low },
      });
      out += `\r\n\x1b[32;1mYou win! +${net} cr\x1b[0m\r\n`;
    } else if (result.winner === 'COMPUTER') {
      const loss = Math.abs(net);
      const newCredits = subtractCredits(character.creditsHigh, character.creditsLow, loss);
      if (newCredits.success) {
        await prisma.character.update({
          where: { id: characterId },
          data: { creditsHigh: newCredits.high, creditsLow: newCredits.low },
        });
      }
      out += `\r\n\x1b[31;1mYou lose! -${loss} cr\x1b[0m\r\n`;
    } else {
      out += `\r\n\x1b[33;1mIt's a tie! No credits change.\x1b[0m\r\n`;
    }

    out += '> ';
    return { output: out };
  }

  dareStates.delete(characterId);
  return { output: '\r\n> ' };
}
