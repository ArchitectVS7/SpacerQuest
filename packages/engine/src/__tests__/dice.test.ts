import { describe, it, expect } from 'vitest';
import { SeededRng } from '../rng.js';
import { rollDawnHand, check, spendDie, remainingDice, isDayOver } from '../dice.js';

describe('Dice', () => {
  it('rolls dawn hand correctly', () => {
    const rng = new SeededRng(1);
    const hand = rollDawnHand(rng, 5);

    expect(hand.dice).toHaveLength(5);
    expect(hand.spent).toEqual([false, false, false, false, false]);

    // Check descending order
    for (let i = 0; i < hand.dice.length - 1; i++) {
      expect(hand.dice[i]).toBeGreaterThanOrEqual(hand.dice[i + 1]);
    }
  });

  it('evaluates checks', () => {
    // Normal success
    let result = check(15, +2, 16);
    expect(result.success).toBe(true);
    expect(result.margin).toBe(1);
    expect(result.nat20).toBe(false);

    // Normal failure
    result = check(10, +2, 15);
    expect(result.success).toBe(false);
    expect(result.margin).toBe(-3);

    // Nat 20 (auto-success even if total < dc)
    result = check(20, -2, 25);
    expect(result.success).toBe(true);
    expect(result.nat20).toBe(true);

    // Nat 1 (auto-fail even if total >= dc)
    result = check(1, +10, 10);
    expect(result.success).toBe(false);
    expect(result.nat1).toBe(true);
  });

  it('spends dice correctly', () => {
    const rng = new SeededRng(1);
    let hand = rollDawnHand(rng, 3);

    expect(isDayOver(hand)).toBe(false);
    expect(remainingDice(hand)).toHaveLength(3);

    const spendResult = spendDie(hand, 1);
    hand = spendResult.hand;

    expect(spendResult.die).toBe(hand.dice[1]);
    expect(hand.spent).toEqual([false, true, false]);
    expect(remainingDice(hand)).toHaveLength(2);

    // Cannot double spend
    expect(() => spendDie(hand, 1)).toThrow('Die already spent');

    // Spend rest
    hand = spendDie(hand, 0).hand;
    hand = spendDie(hand, 2).hand;

    expect(isDayOver(hand)).toBe(true);
    expect(remainingDice(hand)).toHaveLength(0);
  });
});
