/**
 * SpacerQuest v4.0 - Wise One & Sage Tests
 *
 * Tests for the Rim Star special encounters at Polaris-1 and Mizar-9
 * Based on original SP.DOCK2.S:300-334
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateNumberKey,
  WISE_ONE_TEXT,
} from '../src/game/systems/wise-one';
import {
  CONSTELLATION_MAP,
  STAR_QUESTIONS,
  checkSageAnswer,
  getRandomSageQuestion,
  applySageReward,
} from '../src/game/systems/sage';

// ============================================================================
// WISE ONE TESTS (Polaris-1, System #17)
// ============================================================================

describe('Wise One (Polaris-1)', () => {
  describe('generateNumberKey', () => {
    it('should generate a number between 1 and 9', () => {
      for (let i = 0; i < 100; i++) {
        const key = generateNumberKey();
        expect(key).toBeGreaterThanOrEqual(1);
        expect(key).toBeLessThanOrEqual(9);
      }
    });

    it('should return an integer', () => {
      const key = generateNumberKey();
      expect(Number.isInteger(key)).toBe(true);
    });
  });

  describe('WISE_ONE_TEXT', () => {
    it('should contain flavor text about weapon enhancement', () => {
      expect(WISE_ONE_TEXT).toContain('weapon enhancement');
    });

    it('should mention alien ship derelicts', () => {
      expect(WISE_ONE_TEXT).toContain('derelict');
    });

    it('should mention The Great Void', () => {
      expect(WISE_ONE_TEXT).toContain('Great Void');
    });
  });
});

// ============================================================================
// SAGE TESTS (Mizar-9, System #18)
// ============================================================================

describe('Sage (Mizar-9)', () => {
  describe('CONSTELLATION_MAP', () => {
    it('should have 16 constellations (A-P)', () => {
      const keys = Object.keys(CONSTELLATION_MAP);
      expect(keys.length).toBe(16);
      expect(keys).toContain('A');
      expect(keys).toContain('P');
    });

    it('should include all original constellations', () => {
      expect(CONSTELLATION_MAP['A']).toBe('Perseus');
      expect(CONSTELLATION_MAP['B']).toBe('Auriga');
      expect(CONSTELLATION_MAP['C']).toBe('Orion');
      expect(CONSTELLATION_MAP['D']).toBe('Taurus');
      expect(CONSTELLATION_MAP['E']).toBe('Cygnus');
      expect(CONSTELLATION_MAP['F']).toBe('Aquila');
      expect(CONSTELLATION_MAP['G']).toBe('Scorpius');
      expect(CONSTELLATION_MAP['H']).toBe('Lyra');
      expect(CONSTELLATION_MAP['I']).toBe('Virgo');
      expect(CONSTELLATION_MAP['J']).toBe('Bootes');
      expect(CONSTELLATION_MAP['K']).toBe('Leo');
      expect(CONSTELLATION_MAP['L']).toBe('Gemini');
      expect(CONSTELLATION_MAP['M']).toBe('Draco');
      expect(CONSTELLATION_MAP['N']).toBe('Hercules');
      expect(CONSTELLATION_MAP['O']).toBe('Sagittarius');
      expect(CONSTELLATION_MAP['P']).toBe('Pegasus');
    });
  });

  describe('STAR_QUESTIONS', () => {
    it('should have 13 star-to-answer mappings', () => {
      expect(STAR_QUESTIONS.length).toBe(13);
    });

    it('should map ALGOL to A (Perseus)', () => {
      const algol = STAR_QUESTIONS.find(q => q.star === 'ALGOL');
      expect(algol).toBeDefined();
      expect(algol!.answer).toBe('A');
    });

    it('should map VEGA to H (Lyra)', () => {
      const vega = STAR_QUESTIONS.find(q => q.star === 'VEGA');
      expect(vega).toBeDefined();
      expect(vega!.answer).toBe('H');
    });

    it('should map DENEBOLA to K (Leo) - same as REGULUS', () => {
      const denebola = STAR_QUESTIONS.find(q => q.star === 'DENEBOLA');
      const regulus = STAR_QUESTIONS.find(q => q.star === 'REGULUS');
      expect(denebola).toBeDefined();
      expect(regulus).toBeDefined();
      expect(denebola!.answer).toBe('K');
      expect(regulus!.answer).toBe('K');
    });

    it('should map POLLUX to L (Gemini)', () => {
      const pollux = STAR_QUESTIONS.find(q => q.star === 'POLLUX');
      expect(pollux).toBeDefined();
      expect(pollux!.answer).toBe('L');
    });
  });

  describe('getRandomSageQuestion', () => {
    it('should return a valid star question', () => {
      for (let i = 0; i < 50; i++) {
        const question = getRandomSageQuestion();
        expect(question.star).toBeTruthy();
        expect(question.answer).toMatch(/^[A-P]$/);
      }
    });
  });

  describe('checkSageAnswer', () => {
    it('should accept correct answer (case-insensitive)', () => {
      expect(checkSageAnswer('ALGOL', 'A')).toBe(true);
      expect(checkSageAnswer('ALGOL', 'a')).toBe(true);
    });

    it('should reject incorrect answer', () => {
      expect(checkSageAnswer('ALGOL', 'B')).toBe(false);
      expect(checkSageAnswer('ALGOL', 'Z')).toBe(false);
    });

    it('should accept correct answer for DENEBOLA (K)', () => {
      expect(checkSageAnswer('DENEBOLA', 'K')).toBe(true);
    });
  });

  describe('applySageReward', () => {
    it('should increment cabin strength by 1', () => {
      const result = applySageReward(10, 5);
      expect(result.cabinStrength).toBe(11);
    });

    it('should set cabin condition to 9 (perfect)', () => {
      const result = applySageReward(10, 3);
      expect(result.cabinCondition).toBe(9);
    });

    it('should work with max cabin strength', () => {
      const result = applySageReward(209, 9);
      expect(result.cabinStrength).toBe(210);
      expect(result.cabinCondition).toBe(9);
    });
  });
});
