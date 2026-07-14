import { describe, it, expect } from 'vitest';
import { CrewMember } from '../types.js';
import { SeededRng } from '../rng.js';
import {
  rollDawnHand,
  dawnDiceModifiers,
  check,
  spendDie,
  remainingDice,
  isDayOver,
} from '../dice.js';

const NO_MODS = { handSize: 5, floor: 0, rerolls: 0 } as const;

describe('Dice', () => {
  it('rolls dawn hand correctly', () => {
    const rng = new SeededRng(1);
    const hand = rollDawnHand(rng, NO_MODS);

    expect(hand.dice).toHaveLength(5);
    expect(hand.spent).toEqual([false, false, false, false, false]);
    expect(hand.rerollsRemaining).toBe(0);

    // Check descending order
    for (let i = 0; i < hand.dice.length - 1; i++) {
      expect(hand.dice[i]).toBeGreaterThanOrEqual(hand.dice[i + 1]);
    }
  });

  // --- T-1306 · dice progression ------------------------------------------
  it('dawnDiceModifiers: empty crew yields the base defaults', () => {
    expect(dawnDiceModifiers([])).toEqual({ handSize: 5, floor: 0, rerolls: 0 });
  });

  it('dawnDiceModifiers: an extra-die crew adds one die (clamped)', () => {
    const crew: CrewMember[] = [{ roleId: 'crew-second', hiredDay: 1 }];
    expect(dawnDiceModifiers(crew)).toEqual({ handSize: 6, floor: 0, rerolls: 0 });
  });

  it('dawnDiceModifiers: a floor crew sets the floor', () => {
    const crew: CrewMember[] = [{ roleId: 'crew-quartermaster', hiredDay: 1 }];
    const mods = dawnDiceModifiers(crew);
    expect(mods.floor).toBe(5);
    expect(mods.handSize).toBe(5);
    expect(mods.rerolls).toBe(0);
  });

  it('dawnDiceModifiers: a reroll crew banks one charge', () => {
    const crew: CrewMember[] = [{ roleId: 'crew-navigator', hiredDay: 1 }];
    expect(dawnDiceModifiers(crew)).toEqual({ handSize: 5, floor: 0, rerolls: 1 });
  });

  it('dawnDiceModifiers: all three benefits stack into one hand', () => {
    const crew: CrewMember[] = [
      { roleId: 'crew-second', hiredDay: 1 },
      { roleId: 'crew-navigator', hiredDay: 1 },
      { roleId: 'crew-quartermaster', hiredDay: 1 },
    ];
    expect(dawnDiceModifiers(crew)).toEqual({ handSize: 6, floor: 5, rerolls: 1 });
  });

  it('dawnDiceModifiers: an unknown roleId contributes nothing', () => {
    const crew: CrewMember[] = [{ roleId: 'crew-nonexistent', hiredDay: 1 }];
    expect(dawnDiceModifiers(crew)).toEqual({ handSize: 5, floor: 0, rerolls: 0 });
  });

  it('rollDawnHand: a die-granting modifier rolls 6 dice (acceptance #1)', () => {
    const hand = rollDawnHand(new SeededRng(1), { handSize: 6, floor: 0, rerolls: 0 });
    expect(hand.dice).toHaveLength(6);
    expect(hand.spent).toHaveLength(6);
    expect(hand.rerollsRemaining).toBe(0);
  });

  it('rollDawnHand: a reroll modifier seeds rerollsRemaining', () => {
    const hand = rollDawnHand(new SeededRng(1), { handSize: 5, floor: 0, rerolls: 1 });
    expect(hand.rerollsRemaining).toBe(1);
  });

  it('rollDawnHand: the floor clamps every die and preserves descending order (acceptance #3)', () => {
    // Property-style sweep over seeds and floors.
    for (let seed = 1; seed <= 60; seed += 1) {
      for (const floor of [0, 3, 5, 10, 20]) {
        const hand = rollDawnHand(new SeededRng(seed), { handSize: 5, floor, rerolls: 0 });
        expect(hand.dice).toHaveLength(5);
        for (let i = 0; i < hand.dice.length; i += 1) {
          expect(hand.dice[i]).toBeGreaterThanOrEqual(floor);
          expect(hand.dice[i]).toBeGreaterThanOrEqual(1);
          expect(hand.dice[i]).toBeLessThanOrEqual(20);
        }
        // Descending order survives flooring (monotonic).
        for (let i = 0; i < hand.dice.length - 1; i += 1) {
          expect(hand.dice[i]).toBeGreaterThanOrEqual(hand.dice[i + 1]);
        }
      }
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
    let hand = rollDawnHand(rng, { handSize: 3, floor: 0, rerolls: 0 });

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
