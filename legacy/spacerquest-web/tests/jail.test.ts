/**
 * SpacerQuest v4.0 - Jail / Brig / Crime System Tests
 *
 * Based on original SP.END.S:233-271, SP.BAR.S:300-379, SP.FIGHT1.S:247-253
 */

import { describe, it, expect } from 'vitest';
import {
  CrimeType,
  CRIME_FINES,
  BAIL_MULTIPLIER,
  isJailed,
  jailPlayer,
  releasePlayer,
  calculateBailCost,
  canPayFine,
  payFine,
} from '../src/game/systems/jail';

// ============================================================================
// CRIME TYPES AND FINES
// ============================================================================

describe('Jail System', () => {
  describe('CRIME_FINES', () => {
    it('should have correct fine for smuggling (pp=5)', () => {
      expect(CRIME_FINES[CrimeType.SMUGGLING]).toBe(1000);
    });

    it('should have correct fine for carrier loss (pp=6)', () => {
      expect(CRIME_FINES[CrimeType.CARRIER_LOSS]).toBe(10000);
    });

    it('should have correct fine for conduct (pp=7)', () => {
      expect(CRIME_FINES[CrimeType.CONDUCT]).toBe(20000);
    });
  });

  // ============================================================================
  // JAIL STATE DETECTION
  // ============================================================================

  describe('isJailed', () => {
    it('should detect J% prefix as jailed', () => {
      expect(isJailed('J%Firefox')).toBe(true);
      expect(isJailed('J%Captain Kirk')).toBe(true);
    });

    it('should detect non-jailed players', () => {
      expect(isJailed('Firefox')).toBe(false);
      expect(isJailed('Captain Kirk')).toBe(false);
      expect(isJailed('')).toBe(false);
    });
  });

  // ============================================================================
  // JAIL/RELEASE
  // ============================================================================

  describe('jailPlayer', () => {
    it('should prefix name with J%', () => {
      expect(jailPlayer('Firefox')).toBe('J%Firefox');
    });

    it('should not double-jail already jailed player', () => {
      expect(jailPlayer('J%Firefox')).toBe('J%Firefox');
    });
  });

  describe('releasePlayer', () => {
    it('should remove J% prefix', () => {
      expect(releasePlayer('J%Firefox')).toBe('Firefox');
    });

    it('should not modify non-jailed player', () => {
      expect(releasePlayer('Firefox')).toBe('Firefox');
    });
  });

  // ============================================================================
  // BAIL COST
  // ============================================================================

  describe('calculateBailCost', () => {
    it('should be double the fine for smuggling', () => {
      // Original: bail for pp=5 is 2000 (double 1000)
      expect(calculateBailCost(CrimeType.SMUGGLING)).toBe(2000);
    });

    it('should be double the fine for carrier loss', () => {
      // Original: bail for pp=6 is 20000 (double 10000)
      expect(calculateBailCost(CrimeType.CARRIER_LOSS)).toBe(20000);
    });

    it('should use the BAIL_MULTIPLIER constant', () => {
      expect(BAIL_MULTIPLIER).toBe(2);
    });
  });

  // ============================================================================
  // FINE PAYMENT
  // ============================================================================

  describe('canPayFine', () => {
    it('should return true when player has enough credits for smuggling fine', () => {
      // 1000 cr fine, player has 2000
      expect(canPayFine(0, 2000, CrimeType.SMUGGLING)).toBe(true);
    });

    it('should return false when player cannot afford fine', () => {
      expect(canPayFine(0, 500, CrimeType.SMUGGLING)).toBe(false);
    });

    it('should handle carrier loss fine (10,000 cr = 1 high)', () => {
      // Need g1 >= 1 for carrier loss
      expect(canPayFine(1, 0, CrimeType.CARRIER_LOSS)).toBe(true);
      expect(canPayFine(0, 9999, CrimeType.CARRIER_LOSS)).toBe(false);
    });

    it('should handle conduct fine (20,000 cr = 2 high)', () => {
      expect(canPayFine(2, 0, CrimeType.CONDUCT)).toBe(true);
      expect(canPayFine(1, 9999, CrimeType.CONDUCT)).toBe(false);
    });
  });

  describe('payFine', () => {
    it('should deduct smuggling fine correctly', () => {
      const result = payFine(0, 2000, CrimeType.SMUGGLING);
      expect(result.success).toBe(true);
      expect(result.creditsHigh).toBe(0);
      expect(result.creditsLow).toBe(1000);
    });

    it('should deduct carrier loss fine correctly', () => {
      const result = payFine(2, 0, CrimeType.CARRIER_LOSS);
      expect(result.success).toBe(true);
      expect(result.creditsHigh).toBe(1);
      expect(result.creditsLow).toBe(0);
    });

    it('should fail when insufficient credits', () => {
      const result = payFine(0, 500, CrimeType.SMUGGLING);
      expect(result.success).toBe(false);
    });
  });
});
