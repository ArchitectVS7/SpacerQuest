/**
 * SpacerQuest v4.0 - Gambling System Tests
 *
 * Tests for Wheel of Fortune and Spacer's Dare
 * Based on original SP.GAME.S mechanics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateWofOdds,
  playWheelOfFortune,
  playSpacersDare,
  rollDare,
  computerDareStrategy,
} from '../src/game/systems/gambling';
import {
  WOF_MAX_BET,
  WOF_MIN_ROLLS,
  WOF_MAX_ROLLS,
  WOF_NUMBERS,
  WOF_DAILY_WIN_CAP,
  DARE_MIN_ROUNDS,
  DARE_MAX_ROUNDS,
  DARE_MIN_CREDITS,
  DARE_MAX_MULTIPLIER,
} from '../src/game/constants';

// ============================================================================
// WHEEL OF FORTUNE TESTS
// ============================================================================

describe('Wheel of Fortune', () => {
  describe('calculateWofOdds', () => {
    it('should calculate correct odds based on number of rolls', () => {
      // Original formula: odds = (20 / rolls) - 1
      expect(calculateWofOdds(3)).toBe(Math.floor(20 / 3) - 1); // 6-1 = 5
      expect(calculateWofOdds(4)).toBe(4);  // 20/4 - 1 = 4
      expect(calculateWofOdds(5)).toBe(3);  // 20/5 - 1 = 3
      expect(calculateWofOdds(7)).toBe(1);  // floor(20/7) - 1 = 1
    });

    it('should have minimum odds of 1', () => {
      expect(calculateWofOdds(WOF_MAX_ROLLS)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('playWheelOfFortune', () => {
    it('should reject bet amounts over maximum', () => {
      const result = playWheelOfFortune({
        betNumber: 10,
        betAmount: WOF_MAX_BET + 1,
        rolls: 3,
        creditsHigh: 1,
        creditsLow: 0,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/bet/i);
    });

    it('should reject bet amounts of 0 or negative', () => {
      const result = playWheelOfFortune({
        betNumber: 10,
        betAmount: 0,
        rolls: 3,
        creditsHigh: 1,
        creditsLow: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid bet numbers (outside 1-20)', () => {
      const result = playWheelOfFortune({
        betNumber: 21,
        betAmount: 100,
        rolls: 3,
        creditsHigh: 1,
        creditsLow: 0,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/number/i);
    });

    it('should reject invalid roll counts', () => {
      const tooFew = playWheelOfFortune({
        betNumber: 10,
        betAmount: 100,
        rolls: 2,
        creditsHigh: 1,
        creditsLow: 0,
      });
      expect(tooFew.success).toBe(false);

      const tooMany = playWheelOfFortune({
        betNumber: 10,
        betAmount: 100,
        rolls: 8,
        creditsHigh: 1,
        creditsLow: 0,
      });
      expect(tooMany.success).toBe(false);
    });

    it('should reject if player cannot afford bet', () => {
      const result = playWheelOfFortune({
        betNumber: 10,
        betAmount: 500,
        rolls: 3,
        creditsHigh: 0,
        creditsLow: 100,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/credit/i);
    });

    it('should return roll results array matching requested roll count', () => {
      const result = playWheelOfFortune({
        betNumber: 10,
        betAmount: 100,
        rolls: 5,
        creditsHigh: 1,
        creditsLow: 0,
      });
      expect(result.success).toBe(true);
      expect(result.rolls).toHaveLength(5);
      result.rolls!.forEach(r => {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(WOF_NUMBERS);
      });
    });

    it('should pay out correctly on a win', () => {
      // Force a win by mocking random
      let callCount = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callCount++;
        // Return value that maps to number 10 consistently
        // rollNumber = floor(random * 20) + 1 = 10 when random = 0.45
        return 0.45;
      });

      const result = playWheelOfFortune({
        betNumber: 10,
        betAmount: 100,
        rolls: 5,
        creditsHigh: 1,
        creditsLow: 0,
      });

      vi.restoreAllMocks();

      expect(result.success).toBe(true);
      expect(result.won).toBe(true);
      // Odds for 5 rolls: floor(20/5) - 1 = 3
      expect(result.payout).toBe(100 * 3);
    });

    it('should deduct bet on a loss', () => {
      // Force a loss - all rolls different from bet number
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // always roll 1

      const result = playWheelOfFortune({
        betNumber: 15,
        betAmount: 200,
        rolls: 3,
        creditsHigh: 1,
        creditsLow: 0,
      });

      vi.restoreAllMocks();

      expect(result.success).toBe(true);
      expect(result.won).toBe(false);
      expect(result.payout).toBe(0);
      expect(result.cost).toBe(200);
    });

    it('should include odds in result', () => {
      const result = playWheelOfFortune({
        betNumber: 10,
        betAmount: 100,
        rolls: 4,
        creditsHigh: 1,
        creditsLow: 0,
      });
      expect(result.odds).toBe(4);
    });
  });
});

// ============================================================================
// WOF DAILY WIN CAP (SP.GAME.S lines 47, 53)
// ============================================================================

describe('WOF_DAILY_WIN_CAP constant', () => {
  it('is 12 (SP.GAME.S line 53: ui=12)', () => {
    expect(WOF_DAILY_WIN_CAP).toBe(12);
  });
});

// ============================================================================
// SPACER'S DARE TESTS
// ============================================================================

describe("Spacer's Dare", () => {
  describe('rollDare', () => {
    it('should roll two dice each between 1 and 6', () => {
      for (let i = 0; i < 50; i++) {
        const { die1, die2, total } = rollDare();
        expect(die1).toBeGreaterThanOrEqual(1);
        expect(die1).toBeLessThanOrEqual(6);
        expect(die2).toBeGreaterThanOrEqual(1);
        expect(die2).toBeLessThanOrEqual(6);
        expect(total).toBe(die1 + die2);
      }
    });
  });

  describe('computerDareStrategy', () => {
    // Original AI table from x$="1919101007070710101919":
    //   total 2→19, 3→19, 4→10, 5→10, 6→7, 7→7, 8→7, 9→10, 10→10, 11→19, 12→19
    it('should keep rolling for rare totals (2,3) up to threshold 19', () => {
      expect(computerDareStrategy(2, 18)).toBe(true);   // rollCount 18 < 19
      expect(computerDareStrategy(2, 19)).toBe(false);  // rollCount 19 not < 19
      expect(computerDareStrategy(3, 18)).toBe(true);
    });

    it('should stop early for common totals (6,7,8) at threshold 7', () => {
      expect(computerDareStrategy(7, 6)).toBe(true);   // rollCount 6 < 7
      expect(computerDareStrategy(7, 7)).toBe(false);  // rollCount 7 not < 7
      expect(computerDareStrategy(6, 7)).toBe(false);
      expect(computerDareStrategy(8, 7)).toBe(false);
    });

    it('should use threshold 10 for medium totals (4,5,9,10)', () => {
      expect(computerDareStrategy(4, 9)).toBe(true);
      expect(computerDareStrategy(4, 10)).toBe(false);
      expect(computerDareStrategy(9, 9)).toBe(true);
      expect(computerDareStrategy(9, 10)).toBe(false);
    });

    it('should use threshold 19 for high rare totals (11,12)', () => {
      expect(computerDareStrategy(11, 18)).toBe(true);
      expect(computerDareStrategy(11, 19)).toBe(false);
      expect(computerDareStrategy(12, 18)).toBe(true);
    });
  });

  describe('playSpacersDare', () => {
    it('should reject if player has fewer than minimum credits', () => {
      const result = playSpacersDare({
        rounds: 5,
        multiplier: 1,
        creditsHigh: 0,
        creditsLow: DARE_MIN_CREDITS - 1,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/credit/i);
    });

    it('should reject invalid round counts', () => {
      const tooFew = playSpacersDare({
        rounds: DARE_MIN_ROUNDS - 1,
        multiplier: 1,
        creditsHigh: 1,
        creditsLow: 0,
      });
      expect(tooFew.success).toBe(false);

      const tooMany = playSpacersDare({
        rounds: DARE_MAX_ROUNDS + 1,
        multiplier: 1,
        creditsHigh: 1,
        creditsLow: 0,
      });
      expect(tooMany.success).toBe(false);
    });

    it('should reject invalid multiplier', () => {
      const result = playSpacersDare({
        rounds: 5,
        multiplier: DARE_MAX_MULTIPLIER + 1,
        creditsHigh: 1,
        creditsLow: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should play the requested number of rounds', () => {
      const result = playSpacersDare({
        rounds: 5,
        multiplier: 1,
        creditsHigh: 1,
        creditsLow: 0,
      });
      expect(result.success).toBe(true);
      expect(result.roundResults).toHaveLength(5);
    });

    it('should track scores for player and computer per round', () => {
      const result = playSpacersDare({
        rounds: 3,
        multiplier: 1,
        creditsHigh: 1,
        creditsLow: 0,
      });
      expect(result.success).toBe(true);
      result.roundResults!.forEach(round => {
        expect(round).toHaveProperty('playerScore');
        expect(round).toHaveProperty('computerScore');
        expect(round).toHaveProperty('roundWinner');
        expect(round.playerScore).toBeGreaterThanOrEqual(0);
        expect(round.computerScore).toBeGreaterThanOrEqual(0);
        // Each turn must have at least 1 roll (the reference roll)
        expect(round.playerRolls.length).toBeGreaterThanOrEqual(1);
        expect(round.computerRolls.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should bust when a subsequent roll matches the reference total', () => {
      // Math.floor(0 * 6) + 1 = 1, so r=0 → die=1. Both dice=1 → total=2.
      // reference total = 2 → threshold from AI table = 19 (keep rolling).
      // All subsequent rolls also total 2 → matches reference → BUST every time.
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const result = playSpacersDare({
        rounds: 3,
        multiplier: 1,
        creditsHigh: 1,
        creditsLow: 0,
      });

      vi.restoreAllMocks();

      expect(result.success).toBe(true);
      // Every round: reference=2, next=2 → bust → score=0
      result.roundResults!.forEach(round => {
        expect(round.playerScore).toBe(0);
        // Must have at least 2 rolls: reference + bust
        expect(round.playerRolls.length).toBeGreaterThanOrEqual(2);
        expect(round.playerRolls[0].total).toBe(2);
        expect(round.playerRolls[1].total).toBe(2);
      });
    });

    it('should apply multiplier to net credits result', () => {
      const result = playSpacersDare({
        rounds: 3,
        multiplier: 2,
        creditsHigh: 1,
        creditsLow: 0,
      });

      expect(result.success).toBe(true);
      expect(result.multiplier).toBe(2);
      // |netCredits| = |playerTotal - computerTotal| * multiplier
      const expectedAbs = Math.abs(result.playerTotal! - result.computerTotal!) * 2;
      expect(Math.abs(result.netCredits!)).toBe(expectedAbs);
    });

    it('should return overall winner', () => {
      const result = playSpacersDare({
        rounds: 5,
        multiplier: 1,
        creditsHigh: 1,
        creditsLow: 0,
      });
      expect(result.success).toBe(true);
      expect(['PLAYER', 'COMPUTER', 'TIE']).toContain(result.winner);
    });
  });
});
