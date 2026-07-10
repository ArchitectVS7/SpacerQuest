import { describe, it, expect } from 'vitest';
import { SeededRng } from '../rng.js';

describe('SeededRng', () => {
  it('is deterministic', () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(42);
    
    expect(rng1.next()).toBe(rng2.next());
    expect(rng1.d20()).toBe(rng2.d20());
    expect(rng1.rollHand(5)).toEqual(rng2.rollHand(5));
  });

  it('d20 returns values between 1 and 20', () => {
    const rng = new SeededRng(12345);
    for (let i = 0; i < 1000; i++) {
      const roll = rng.d20();
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(20);
    }
  });

  it('forks deterministically', () => {
    const rng1 = new SeededRng(42).fork('test');
    const rng2 = new SeededRng(42).fork('test');
    const rng3 = new SeededRng(42).fork('other');

    expect(rng1.d20()).toBe(rng2.d20());
    expect(rng1.d20()).not.toBe(rng3.d20());
  });

  it('shuffles deterministically', () => {
    const arr = [1, 2, 3, 4, 5];
    const rng1 = new SeededRng(99);
    const rng2 = new SeededRng(99);

    expect(rng1.shuffle(arr)).toEqual(rng2.shuffle(arr));
  });
});
