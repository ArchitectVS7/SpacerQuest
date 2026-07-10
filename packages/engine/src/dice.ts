import { SeededRng } from './rng.js';
import { DawnHand, CheckResult } from './types.js';

export function rollDawnHand(rng: SeededRng, handSize: number): DawnHand {
  const dice = rng.rollHand(handSize);
  const spent = new Array<boolean>(handSize).fill(false);
  return { dice, spent };
}

export function check(die: number, statValue: number, dc: number): CheckResult {
  const total = die + statValue;
  const margin = total - dc;
  const nat20 = die === 20;
  const nat1 = die === 1;

  // Nat 20 auto-succeeds, Nat 1 auto-fails
  let success = false;
  if (nat20) {
    success = true;
  } else if (nat1) {
    success = false;
  } else {
    success = total >= dc;
  }

  return {
    die,
    modifier: statValue,
    total,
    dc,
    success,
    margin,
    nat20,
    nat1,
  };
}

export function spendDie(hand: DawnHand, index: number): { die: number; hand: DawnHand } {
  if (index < 0 || index >= hand.dice.length) {
    throw new Error('Invalid die index');
  }
  if (hand.spent[index]) {
    throw new Error('Die already spent');
  }

  const newHand = {
    dice: [...hand.dice],
    spent: [...hand.spent],
  };
  newHand.spent[index] = true;

  return { die: newHand.dice[index], hand: newHand };
}

export function remainingDice(hand: DawnHand): number[] {
  return hand.dice.filter((_, i) => !hand.spent[i]);
}

export function isDayOver(hand: DawnHand): boolean {
  return hand.spent.every((s) => s);
}
