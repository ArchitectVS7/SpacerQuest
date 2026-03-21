/**
 * SpacerQuest v4.0 - Gambling System
 *
 * Implements Wheel of Fortune and Spacer's Dare
 * Ported from original SP.GAME.S
 */

import {
  WOF_MAX_BET,
  WOF_MIN_ROLLS,
  WOF_MAX_ROLLS,
  WOF_NUMBERS,
  DARE_MIN_ROUNDS,
  DARE_MAX_ROUNDS,
  DARE_MIN_CREDITS,
  DARE_MAX_MULTIPLIER,
} from '../constants';
import { getTotalCredits } from '../utils';

// ============================================================================
// WHEEL OF FORTUNE
// ============================================================================

/**
 * Calculate payout odds based on number of rolls
 *
 * Original from SP.GAME.S:
 *   y=(20/ik)-1
 *
 * More rolls = lower odds (easier to win but less payout)
 */
export function calculateWofOdds(rolls: number): number {
  const odds = Math.floor(WOF_NUMBERS / rolls) - 1;
  return Math.max(1, odds);
}

export interface WofInput {
  betNumber: number;
  betAmount: number;
  rolls: number;
  creditsHigh: number;
  creditsLow: number;
}

export interface WofResult {
  success: boolean;
  error?: string;
  won?: boolean;
  rolls?: number[];
  winningNumber?: number;
  odds?: number;
  payout?: number;
  cost?: number;
}

/**
 * Play a round of Wheel of Fortune
 *
 * Original mechanic from SP.GAME.S:
 *   - Player picks a number 1-20
 *   - Chooses 3-7 rolls
 *   - Each roll generates random 1-20
 *   - If any roll matches bet number, player wins bet × odds
 *   - Otherwise player loses bet amount
 */
export function playWheelOfFortune(input: WofInput): WofResult {
  const { betNumber, betAmount, rolls, creditsHigh, creditsLow } = input;

  // Validation
  if (betAmount <= 0) {
    return { success: false, error: 'Bet amount must be positive' };
  }
  if (betAmount > WOF_MAX_BET) {
    return { success: false, error: `Maximum bet is ${WOF_MAX_BET} credits` };
  }
  if (betNumber < 1 || betNumber > WOF_NUMBERS) {
    return { success: false, error: `Pick a number between 1 and ${WOF_NUMBERS}` };
  }
  if (rolls < WOF_MIN_ROLLS || rolls > WOF_MAX_ROLLS) {
    return { success: false, error: `Choose ${WOF_MIN_ROLLS}-${WOF_MAX_ROLLS} rolls` };
  }

  const totalCredits = getTotalCredits(creditsHigh, creditsLow);
  if (totalCredits < betAmount) {
    return { success: false, error: 'Not enough credits for this bet' };
  }

  const odds = calculateWofOdds(rolls);

  // Roll the wheel
  const rollResults: number[] = [];
  let won = false;

  for (let i = 0; i < rolls; i++) {
    // Original: r=20:gosub rand — generates 1-20
    const roll = Math.floor(Math.random() * WOF_NUMBERS) + 1;
    rollResults.push(roll);
    if (roll === betNumber) {
      won = true;
    }
  }

  const payout = won ? betAmount * odds : 0;
  const cost = won ? 0 : betAmount;

  return {
    success: true,
    won,
    rolls: rollResults,
    winningNumber: betNumber,
    odds,
    payout,
    cost,
  };
}

// ============================================================================
// SPACER'S DARE
// ============================================================================

export interface DareRoll {
  die1: number;
  die2: number;
  total: number;
}

/**
 * Roll two six-sided dice for Spacer's Dare
 *
 * Original from SP.GAME.S:
 *   z8=(random(6)) clamped 1-6
 *   z9=(random(6)) clamped 1-6
 */
export function rollDare(): DareRoll {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  return { die1, die2, total: die1 + die2 };
}

/**
 * Computer AI strategy for Spacer's Dare
 *
 * Original AI table from SP.GAME.S:
 *   x$="1919101007070710101919"
 *   o4=val(mid$(x$,((o2-1)*2)-1,2))
 *
 * Paired values indexed by reference total (2-12):
 *   total 2→19, 3→19, 4→10, 5→10, 6→7, 7→7, 8→7, 9→10, 10→10, 11→19, 12→19
 *
 * Rare totals (2,3,11,12) get high threshold (keep rolling — bust unlikely).
 * Common totals (6,7,8) get low threshold (stop early — bust likely).
 *
 * @param referenceTotal  o2: the first roll total of this round (the "bust number")
 * @param rollCount       x: how many additional rolls have been taken so far
 * @returns true if computer should keep rolling (o4 > rollCount in original)
 */
const COMPUTER_AI_TABLE = [19, 19, 10, 10, 7, 7, 7, 10, 10, 19, 19];
// Index 0 = total 2, index 10 = total 12

export function computerDareStrategy(referenceTotal: number, rollCount: number): boolean {
  const tableIndex = referenceTotal - 2; // totals range 2-12, index 0-10
  const threshold = COMPUTER_AI_TABLE[tableIndex] ?? 10;
  return rollCount < threshold;
}

export interface DareRoundResult {
  playerScore: number;
  computerScore: number;
  roundWinner: 'PLAYER' | 'COMPUTER' | 'TIE';
  playerRolls: DareRoll[];
  computerRolls: DareRoll[];
}

export interface DareInput {
  rounds: number;
  multiplier: number;
  creditsHigh: number;
  creditsLow: number;
}

export interface DareResult {
  success: boolean;
  error?: string;
  roundResults?: DareRoundResult[];
  playerTotal?: number;
  computerTotal?: number;
  winner?: 'PLAYER' | 'COMPUTER' | 'TIE';
  netCredits?: number;
  multiplier?: number;
}

/**
 * Simulate one turn in Spacer's Dare (Pig-style dice game)
 *
 * Original mechanic from SP.GAME.S (strat / foolish / comp.turn labels):
 *   1. Roll once → reference total (o2). This roll is NOT scored.
 *   2. Keep rolling:
 *      - If total == o2 → BUST (score = 0 for this round)
 *      - Otherwise → accumulate total into z6
 *   3. Stop when bust or strategy says stop.
 *   4. Round score = accumulated z6 (0 if busted).
 *
 * @param strategy  Returns true (keep rolling) given (referenceTotal, rollCount).
 *                  rollCount starts at 1 after the reference roll.
 */
function simulateDareTurn(strategy: (ref: number, count: number) => boolean): {
  rolls: DareRoll[];
  score: number;
  busted: boolean;
  referenceTotal: number;
} {
  const rolls: DareRoll[] = [];

  // First roll sets the reference (not scored) — original: gosub roll.dice; o2=z8+z9
  const refRoll = rollDare();
  rolls.push(refRoll);
  const referenceTotal = refRoll.total;

  let accum = 0;
  let rollCount = 1; // x in original, starts at 1

  while (strategy(referenceTotal, rollCount)) {
    const roll = rollDare();
    rolls.push(roll);
    rollCount++;
    if (roll.total === referenceTotal) {
      // BUST — original: "Gotcha Human!" / "Bad Ram Chip!"
      return { rolls, score: 0, busted: true, referenceTotal };
    }
    // Accumulate — original: z6=z6+z4
    accum += roll.total;
  }

  return { rolls, score: accum, busted: false, referenceTotal };
}

/**
 * Play Spacer's Dare
 *
 * Original from SP.GAME.S (strat / foolish / comp.turn labels):
 *   - Each round: player and computer each roll a reference total, then keep
 *     rolling to accumulate score.
 *   - Rolling the reference total again = BUST (0 points that round).
 *   - Computer strategy is driven by AI table indexed by its own reference total.
 *   - Player strategy mirrors the computer AI table (original is interactive;
 *     this automated version uses the same table as a stand-in).
 *   - Net cumulative score difference × multiplier = credits won/lost.
 */
export function playSpacersDare(input: DareInput): DareResult {
  const { rounds, multiplier, creditsHigh, creditsLow } = input;

  // Validation
  const totalCredits = getTotalCredits(creditsHigh, creditsLow);
  if (totalCredits < DARE_MIN_CREDITS) {
    return { success: false, error: `Need at least ${DARE_MIN_CREDITS} credits to play` };
  }
  if (rounds < DARE_MIN_ROUNDS || rounds > DARE_MAX_ROUNDS) {
    return { success: false, error: `Choose ${DARE_MIN_ROUNDS}-${DARE_MAX_ROUNDS} rounds` };
  }
  if (multiplier < 1 || multiplier > DARE_MAX_MULTIPLIER) {
    return { success: false, error: `Multiplier must be 1-${DARE_MAX_MULTIPLIER}` };
  }

  const roundResults: DareRoundResult[] = [];
  let playerTotal = 0;
  let computerTotal = 0;

  for (let r = 0; r < rounds; r++) {
    // Player turn — uses computer AI table as strategy (original is interactive)
    const playerTurn = simulateDareTurn(computerDareStrategy);

    // Computer turn — uses AI table keyed to its reference total
    const computerTurn = simulateDareTurn(computerDareStrategy);

    const playerScore = playerTurn.score;
    const computerScore = computerTurn.score;

    let roundWinner: 'PLAYER' | 'COMPUTER' | 'TIE' = 'TIE';
    if (playerScore > computerScore) roundWinner = 'PLAYER';
    else if (computerScore > playerScore) roundWinner = 'COMPUTER';

    playerTotal += playerScore;
    computerTotal += computerScore;

    roundResults.push({
      playerScore,
      computerScore,
      roundWinner,
      playerRolls: playerTurn.rolls,
      computerRolls: computerTurn.rolls,
    });
  }

  let winner: 'PLAYER' | 'COMPUTER' | 'TIE' = 'TIE';
  if (playerTotal > computerTotal) winner = 'PLAYER';
  else if (computerTotal > playerTotal) winner = 'COMPUTER';

  const netCredits = Math.abs(playerTotal - computerTotal) * multiplier;
  const signedNet = winner === 'PLAYER' ? netCredits : winner === 'COMPUTER' ? -netCredits : 0;

  return {
    success: true,
    roundResults,
    playerTotal,
    computerTotal,
    winner,
    netCredits: signedNet,
    multiplier,
  };
}
