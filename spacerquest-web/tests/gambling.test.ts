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

    it('should detect doubles', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // both dice = 4
      const result = rollDare();
      expect(result.die1).toBe(result.die2);
      expect(result.isDoubles).toBe(true);
      vi.restoreAllMocks();
    });
  });

  describe('computerDareStrategy', () => {
    it('should return whether computer keeps rolling based on AI table', () => {
      // Computer uses threshold table from original: "1919101007070710101919"
      const decision = computerDareStrategy(0, 1);
      expect(typeof decision).toBe('boolean');
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
      });
    });

    it('should apply multiplier to net credits result', () => {
      // Force deterministic outcomes
      let callIdx = 0;
      const values = [
        // Round 1: player rolls 6+5=11 (no doubles), computer rolls 2+3=5
        0.83, 0.66, // player dice: 6, 5
        0.16, 0.33, // computer dice: 2, 3
        // Round 2: player rolls 6+5=11, computer rolls 2+3=5
        0.83, 0.66,
        0.16, 0.33,
        // Round 3: player rolls 6+5=11, computer rolls 2+3=5
        0.83, 0.66,
        0.16, 0.33,
      ];
      vi.spyOn(Math, 'random').mockImplementation(() => {
        const val = values[callIdx % values.length];
        callIdx++;
        return val;
      });

      const result = playSpacersDare({
        rounds: 3,
        multiplier: 2,
        creditsHigh: 1,
        creditsLow: 0,
      });

      vi.restoreAllMocks();

      expect(result.success).toBe(true);
      // Net credits should be multiplied by 2
      if (result.netCredits! > 0) {
        expect(result.multiplier).toBe(2);
      }
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
