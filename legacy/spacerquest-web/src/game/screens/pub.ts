/**
 * SpacerQuest v4.0 - Pub Screen (SP.BAR.S / SP.GAME.S)
 *
 * Gambling games, gossip, and information.
 * Wheel of Fortune and Spacer's Dare are multi-step input flows.
 */

import { ScreenModule, ScreenResponse } from './types.js';
import { prisma } from '../../db/prisma.js';
import { formatCredits, subtractCredits, addCredits, getTotalCredits } from '../utils.js';
import { playWheelOfFortune, calculateWofOdds, rollDare, computerDareStrategy } from '../systems/gambling.js';
import {
  WOF_MAX_BET,
  WOF_MIN_ROLLS,
  WOF_MAX_ROLLS,
  WOF_NUMBERS,
  WOF_DAILY_WIN_CAP,
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
  step: 'ROUNDS' | 'MULTIPLIER' | 'PLAYER_ROLLING';
  rounds?: number;
  multiplier?: number;
  // Active game state
  totalRounds?: number;
  currentRound?: number;
  playerTotal?: number;     // o5 — cumulative player score
  computerTotal?: number;   // o6 — cumulative computer score
  // Current player turn
  referenceTotal?: number;  // o2 — the bust number for this round
  accumulated?: number;     // z6 — accumulated score this turn
  rollCount?: number;       // x — rolls taken this turn
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
        // SP.GAME.S line 47: if (ui>0) and (uh>ui) goto gak
        // Check daily win cap before starting WOF
        const wofChar = await prisma.character.findUnique({ where: { id: characterId } });
        if (wofChar) {
          const today = new Date().toISOString().slice(0, 10);
          const winsToday = wofChar.wofWinsDate === today ? wofChar.wofWinsToday : 0;
          if (winsToday > WOF_DAILY_WIN_CAP) {
            // SP.GAME.S line 136-137: gak — "Digital W. of F. closed for renovations"
            return {
              output: '\r\n\x1b[33;1mDigital W. of F. closed for renovations\x1b[0m\r\n> ',
            };
          }
        }
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
            `\r\nRoll dice, accumulate score. Roll your reference number again = bust!\r\n` +
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
      // SP.GAME.S line 125: uh=uh+1 — increment daily win counter
      const today = new Date().toISOString().slice(0, 10);
      const currentWins = character.wofWinsDate === today ? character.wofWinsToday : 0;
      await prisma.character.update({
        where: { id: characterId },
        data: {
          creditsHigh: newCredits.high,
          creditsLow: newCredits.low,
          wofWinsToday: currentWins + 1,
          wofWinsDate: today,
        },
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
      // SP.GAME.S line 128: if g2<1 print"Sorry 'bout that...you are flat busted!":g2=0:goto lnk
      if (newCredits.success && newCredits.high === 0 && newCredits.low <= 0) {
        out += `\r\n\x1b[31;1mSorry 'bout that...you are flat busted!\x1b[0m\r\n`;
        out += '> ';
        return { output: out };
      }
    }

    out += '> ';
    return { output: out };
  }

  wofStates.delete(characterId);
  return { output: '\r\n> ' };
}

// ============================================================================
// SPACER'S DARE — interactive multi-step handler
// Original SP.GAME.S: player rolls interactively with "Roll again? [Y]/(N)"
// per roll. Computer uses AI table (automated).
// ============================================================================

async function handleDareInput(characterId: string, raw: string): Promise<ScreenResponse> {
  if (raw.toUpperCase() === 'Q') {
    dareStates.delete(characterId);
    return { output: '\r\n\x1b[33mCancelled.\x1b[0m\r\n> ' };
  }

  const state = dareStates.get(characterId)!;
  const num = parseInt(raw, 10);

  // ── Setup: get round count ────────────────────────────────────────────
  if (state.step === 'ROUNDS') {
    if (isNaN(num) || num < DARE_MIN_ROUNDS || num > DARE_MAX_ROUNDS) {
      return { output: `\r\n\x1b[31mThe limits are ${DARE_MIN_ROUNDS}-${DARE_MAX_ROUNDS}...try again...\x1b[0m\r\nRounds: ` };
    }
    state.rounds = num;
    state.step = 'MULTIPLIER';
    return {
      output: `\r\nWhat score-multiplier would you like [1-${DARE_MAX_MULTIPLIER}]? `,
    };
  }

  // ── Setup: get multiplier, then start first round ─────────────────────
  if (state.step === 'MULTIPLIER') {
    if (isNaN(num) || num < 1 || num > DARE_MAX_MULTIPLIER) {
      return { output: `\r\n\x1b[31mThe limits are 1-${DARE_MAX_MULTIPLIER}...try again...\x1b[0m\r\nMultiplier: ` };
    }

    state.multiplier = num;
    state.totalRounds = state.rounds!;
    state.currentRound = 1;
    state.playerTotal = 0;
    state.computerTotal = 0;

    // Start first round
    return startPlayerTurn(state);
  }

  // ── Player rolling: Y/N per roll ──────────────────────────────────────
  if (state.step === 'PLAYER_ROLLING') {
    const key = raw.toUpperCase();

    if (key === 'N') {
      // SP.GAME.S addit3: "You stay on z6 cr."
      const stayScore = state.accumulated!;
      state.playerTotal! += stayScore;

      let out = `No\r\n    You stay on ${stayScore} cr.\r\n`;

      // Computer's turn (automated)
      out += computerTurn(state);

      // Check if more rounds
      return advanceRound(characterId, state, out);
    }

    // Y (or any key) → roll again (SP.GAME.S line 229: goto foolish)
    state.rollCount! += 1;
    const roll = rollDare();
    const x = state.rollCount!;

    let out = 'Yes\r\n';
    out += `Roll #${x < 10 ? ' ' : ''}${x}____( ${roll.total} )`;

    // SP.GAME.S line 223: if z4==o2 → BUST
    if (roll.total === state.referenceTotal!) {
      out += `<----- Gotcha Human!\x07\r\n`;
      // Bust: score = 0, don't add to playerTotal
      // Computer's turn
      out += computerTurn(state);
      return advanceRound(characterId, state, out);
    }

    // SP.GAME.S line 226: z6=z6+z4 — accumulate
    state.accumulated! += roll.total;
    out += `....Roll again? \x1b[37;1m[Y]\x1b[0m/(N): `;
    return { output: out };
  }

  dareStates.delete(characterId);
  return { output: '\r\n> ' };
}

/**
 * Start a new player turn: roll reference dice, show header, prompt.
 * SP.GAME.S lines 205-216 (strat label)
 */
function startPlayerTurn(state: DareState): ScreenResponse {
  const refRoll = rollDare();
  state.referenceTotal = refRoll.total;
  state.accumulated = 0;
  state.rollCount = 1;
  state.step = 'PLAYER_ROLLING';

  const round = state.currentRound!;
  const isLast = round === state.totalRounds!;

  let out = '\r\n\x1b[33;1m            Spacers Dare\x1b[0m\r\n';
  if (isLast) {
    out += '\r\nThis is the LAST round...\r\n';
  }
  out += `\r\n       Round # ${round}\r\n`;
  out += ` --------------------------\r\n`;
  // SP.GAME.S line 215: reference roll displayed with brackets [ ]
  out += `\r\nRoll # 1____[ ${state.referenceTotal} ]`;
  // SP.GAME.S line 226: z6=z6+z4, but z4=0 on first call → reference not scored
  out += `....Roll again? \x1b[37;1m[Y]\x1b[0m/(N): `;

  return { output: out };
}

/**
 * Run the computer's turn automatically using AI table.
 * SP.GAME.S lines 234-255 (comp.turn / comp1 / comp2 / comp3)
 */
function computerTurn(state: DareState): string {
  let out = '\r\nStep back and let a real PRO handle those dice!\r\n';

  // Computer reference roll
  const refRoll = rollDare();
  const compRef = refRoll.total;
  out += `Roll # 1____[ ${compRef} ]\r\n`;

  let accum = 0;
  let rollCount = 1;

  // Computer keeps rolling based on AI table
  while (computerDareStrategy(compRef, rollCount)) {
    rollCount++;
    const roll = rollDare();
    out += `Roll #${rollCount < 10 ? ' ' : ''}${rollCount}____( ${roll.total} )`;

    if (roll.total === compRef) {
      // SP.GAME.S line 249: "Bad Ram Chip!"
      out += `<-----*WHIRR* *CLICK* Bad Ram Chip!\x07\r\n`;
      accum = 0;
      break;
    }
    out += '\r\n';
    accum += roll.total;
  }

  if (accum > 0) {
    out += `\r\n    Computer stays on ${accum} cr.\r\n`;
  }

  state.computerTotal! += accum;
  return out;
}

/**
 * After both player and computer have played a round, show score and advance.
 */
async function advanceRound(
  characterId: string,
  state: DareState,
  out: string,
): Promise<ScreenResponse> {
  const round = state.currentRound!;
  const totalRounds = state.totalRounds!;

  // SP.GAME.S lines 256-258: score display
  const label = round === totalRounds ? 'Final Score' : `End of Round ${round}____Score`;
  out += `\r\n${label}:____Human: ${state.playerTotal} cr____Computer: ${state.computerTotal} cr\r\n`;

  if (round < totalRounds) {
    // More rounds to play
    state.currentRound! += 1;
    const nextRoundOutput = startPlayerTurn(state);
    return { output: out + nextRoundOutput.output };
  }

  // Game over — calculate winner and update credits
  const playerTotal = state.playerTotal!;
  const computerTotal = state.computerTotal!;
  const multiplier = state.multiplier!;

  dareStates.delete(characterId);

  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) {
    return { output: out + '\r\n\x1b[31mError.\x1b[0m\r\n> ' };
  }

  if (playerTotal > computerTotal) {
    // SP.GAME.S lines 263-284: winner
    const diff = playerTotal - computerTotal;
    const winnings = diff * multiplier;
    const newCredits = addCredits(character.creditsHigh, character.creditsLow, winnings);
    await prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: newCredits.high, creditsLow: newCredits.low },
    });
    out += `\r\nCongratulations Human on a game well-played!\r\n`;
    out += `Calculating your winnings....${diff} multiplied by ${multiplier}\r\n`;
    out += `\x1b[32;1mYou have just increased your bankroll by ${winnings.toLocaleString()} credits!\x1b[0m\r\n`;
  } else if (computerTotal > playerTotal) {
    // SP.GAME.S lines 286-294: loser
    const diff = computerTotal - playerTotal;
    let loss = diff * multiplier;
    // SP.GAME.S line 288: if o9>g2 then o9=g2 — cap is creditsLow (g2) only, NOT total credits.
    // Original uses g2 (low 0-9999) as the cap. High credits (g1) are not at risk.
    if (loss > character.creditsLow) loss = character.creditsLow;
    const newCredits = subtractCredits(character.creditsHigh, character.creditsLow, loss);
    if (newCredits.success) {
      await prisma.character.update({
        where: { id: characterId },
        data: { creditsHigh: newCredits.high, creditsLow: newCredits.low },
      });
    }
    out += `\r\nYou lose Human...pay the pit boss as you leave.\r\n`;
    out += `Calculating your losses....${diff} multiplied by ${multiplier}\r\n`;
    out += `\x1b[31;1mYou have just lost ${loss.toLocaleString()} credits!\x1b[0m\r\n`;
  } else {
    out += `\r\n\x1b[33;1mIt's a tie! No credits change.\x1b[0m\r\n`;
  }

  out += '> ';
  return { output: out };
}
