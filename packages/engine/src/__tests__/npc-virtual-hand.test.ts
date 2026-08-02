import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  DAWN_BASE_HAND_SIZE,
  NPC_ALLOCATION_PIVOT_STAT,
  NPC_ALLOCATION_SHARPNESS_PER_STAT,
} from '@spacerquest/content';
import { SeededRng } from '../rng.js';
import { rollDawnHand } from '../dice.js';
import { NPC_HAND_MODIFIERS, npcAllocationBias, npcVirtualHand } from '../npcHand.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const NPC_HAND_SOURCE = join(HERE, '..', 'npcHand.ts');

/** Drain a fresh hand for `count` allocations at one stat value. */
function allocateAll(seed: number, statValue: number, count: number): number[] {
  const hand = npcVirtualHand(new SeededRng(seed));
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) out.push(hand.allocateVirtualDie(statValue));
  return out;
}

describe('N13 · the NPC virtual hand', () => {
  it('deals through the PLAYER’s own rollDawnHand, at the player’s base hand size', () => {
    // The whole claim of design (b) — "the same RNG discipline the player's hand
    // uses" — reduced to an equality. If this ever needs a translation layer, the
    // cast has stopped sharing the player's deal.
    for (const seed of [1, 7, 99, 4242]) {
      const hand = npcVirtualHand(new SeededRng(seed));
      hand.allocateVirtualDie(NPC_ALLOCATION_PIVOT_STAT);
      const expected = rollDawnHand(new SeededRng(seed), {
        handSize: DAWN_BASE_HAND_SIZE,
        floor: 0,
        rerolls: 0,
      });
      expect(hand.dealtHand()?.dice).toEqual(expected.dice);
    }
  });

  it('deals a descending hand of five d20 faces', () => {
    const hand = npcVirtualHand(new SeededRng(11));
    hand.allocateVirtualDie(NPC_ALLOCATION_PIVOT_STAT);
    const dice = hand.dealtHand()!.dice;
    expect(dice).toHaveLength(DAWN_BASE_HAND_SIZE);
    for (const die of dice) {
      expect(die).toBeGreaterThanOrEqual(1);
      expect(die).toBeLessThanOrEqual(20);
    }
    expect([...dice].sort((a, b) => b - a)).toEqual(dice);
  });

  it('expresses the Reroll ruled exclusion AS DATA: rerollsRemaining is 0', () => {
    // The PARITY LEDGER records `Reroll` as EXCLUDED by owner ruling. This is that
    // ruling made structural — the hand is dealt with `rerolls: 0`, so there is no
    // branch anywhere that could be flipped to re-open it.
    expect(NPC_HAND_MODIFIERS.rerolls).toBe(0);
    const hand = npcVirtualHand(new SeededRng(3));
    hand.allocateVirtualDie(NPC_ALLOCATION_PIVOT_STAT);
    expect(hand.dealtHand()?.rerollsRemaining).toBe(0);
  });

  it('spends each die exactly once and never returns a spent one', () => {
    const hand = npcVirtualHand(new SeededRng(21));
    // LAZY DEAL: nothing exists until the first allocation asks for it.
    expect(hand.dealtHand()).toBeNull();
    expect(hand.remaining()).toBe(0);
    const dealtOrder: number[] = [];
    for (let i = 0; i < DAWN_BASE_HAND_SIZE; i += 1) {
      dealtOrder.push(hand.allocateVirtualDie(3));
      expect(hand.remaining()).toBe(DAWN_BASE_HAND_SIZE - 1 - i);
    }
    expect(hand.remaining()).toBe(0);
    // Every dealt die came back exactly once — a multiset equality, since faces
    // can repeat.
    expect([...dealtOrder].sort((a, b) => b - a)).toEqual([...hand.dealtHand()!.dice]);
    expect(hand.exhaustedAllocations()).toBe(0);
  });

  it('is MEAN-NEUTRAL at the pivot stat: always the middle remaining die', () => {
    // The calibration property the whole balance argument rests on (see
    // `NPC_ALLOCATION_PIVOT_STAT`'s doc-block): E[middle of 5 sorted d20s] = 10.5,
    // which is a plain d20's mean, so a median captain does not move the economy.
    expect(npcAllocationBias(NPC_ALLOCATION_PIVOT_STAT)).toBe(0);
    for (let seed = 1; seed <= 400; seed += 1) {
      const hand = npcVirtualHand(new SeededRng(seed));
      // The first allocation deals, so the pool has to be read after it — every
      // later step is predicted from the pool the previous step left behind.
      const first = hand.allocateVirtualDie(NPC_ALLOCATION_PIVOT_STAT);
      const pool = [...hand.dealtHand()!.dice];
      expect(first).toBe(pool[Math.floor(pool.length / 2)]);
      pool.splice(Math.floor(pool.length / 2), 1);
      while (pool.length > 0) {
        const expected = pool[Math.floor(pool.length / 2)];
        expect(hand.allocateVirtualDie(NPC_ALLOCATION_PIVOT_STAT)).toBe(expected);
        pool.splice(Math.floor(pool.length / 2), 1);
      }
    }
  });

  it('makes the allocated die strictly increasing in the affinity stat', () => {
    // Monte Carlo. Per BR-17 a flaky result here is answered by WIDENING the
    // sample, never by loosening the assertion.
    //
    // ONE ALLOCATION PER FRESH HAND, and that is not a detail: draining a whole
    // hand sums to the same five faces WHATEVER order they come out in, so a
    // full-hand mean is identically E[d20] at every stat and would measure
    // nothing. Skill here is a claim about WHICH die a captain reaches for FIRST,
    // and a captain-day spends one die on its verb in the overwhelming majority
    // of cases, so the first allocation is also the honest unit.
    const DRAWS = 40_000;
    const means: number[] = [];
    for (let stat = 0; stat <= 5; stat += 1) {
      let total = 0;
      const rng = new SeededRng(1000 + stat);
      for (let draw = 0; draw < DRAWS; draw += 1) {
        total += npcVirtualHand(rng).allocateVirtualDie(stat);
      }
      means.push(total / DRAWS);
    }
    for (let stat = 1; stat <= 5; stat += 1) {
      expect(
        means[stat] > means[stat - 1],
        `mean allocated die at stat ${stat} (${means[stat].toFixed(3)}) must exceed ` +
          `stat ${stat - 1} (${means[stat - 1].toFixed(3)})`,
      ).toBe(true);
    }
    // And the pivot sits on a plain d20's mean, which is the economy-neutrality
    // claim measured rather than asserted.
    expect(Math.abs(means[NPC_ALLOCATION_PIVOT_STAT] - 10.5)).toBeLessThan(0.25);
  });

  it('reaches the dullest die below the pivot and the sharpest above it', () => {
    const reached = (stat: number): { sharpest: boolean; dullest: boolean } => {
      let sharpest = false;
      let dullest = false;
      for (let seed = 1; seed <= 500; seed += 1) {
        const hand = npcVirtualHand(new SeededRng(seed));
        const die = hand.allocateVirtualDie(stat);
        const dice = hand.dealtHand()!.dice;
        if (die === dice[0] && dice[0] !== dice[dice.length - 1]) sharpest = true;
        if (die === dice[dice.length - 1] && dice[0] !== dice[dice.length - 1]) dullest = true;
      }
      return { sharpest, dullest };
    };
    expect(reached(0).dullest).toBe(true);
    expect(reached(5).sharpest).toBe(true);
    // And neither corner is reachable from the wrong side of the pivot.
    expect(npcAllocationBias(0)).toBeLessThan(0);
    expect(npcAllocationBias(5)).toBeGreaterThan(0);
    expect(npcAllocationBias(5)).toBeCloseTo(
      (5 - NPC_ALLOCATION_PIVOT_STAT) * NPC_ALLOCATION_SHARPNESS_PER_STAT,
      10,
    );
  });

  it('clamps the bias into [-1, 1] however wide a future stat ladder gets', () => {
    expect(npcAllocationBias(1_000)).toBe(1);
    expect(npcAllocationBias(-1_000)).toBe(-1);
  });

  it('falls back to a raw d20 once the hand is exhausted (boundary 2)', () => {
    const hand = npcVirtualHand(new SeededRng(77));
    for (let i = 0; i < DAWN_BASE_HAND_SIZE; i += 1) hand.allocateVirtualDie(2);
    expect(hand.remaining()).toBe(0);
    expect(hand.exhaustedAllocations()).toBe(0);
    for (let i = 0; i < 4; i += 1) {
      const die = hand.allocateVirtualDie(2);
      expect(die).toBeGreaterThanOrEqual(1);
      expect(die).toBeLessThanOrEqual(20);
    }
    expect(hand.exhaustedAllocations()).toBe(4);
  });

  it('N5 seam: absent dullDieChance draws nothing and changes nothing', () => {
    // The inertness proof, at the level that matters — the rng STATE. If the seam
    // cost a draw, every seeded career would move the day N5 is merely scheduled.
    const withoutParam = new SeededRng(555);
    const plain = npcVirtualHand(withoutParam);
    const withUndefined = new SeededRng(555);
    const explicit = npcVirtualHand(withUndefined, undefined);
    for (let i = 0; i < DAWN_BASE_HAND_SIZE; i += 1) {
      expect(explicit.allocateVirtualDie(5)).toBe(plain.allocateVirtualDie(5));
    }
    expect(withUndefined.getState()).toBe(withoutParam.getState());
  });

  it('N5 seam: dullDieChance=1 downgrades a sharpest pick to the middle', () => {
    // Driven, not asserted-by-inspection: `dullDieChance: 1` means every sharpest
    // reach slips, so with a stat-5 captain the sharpest die can never come out
    // first while three or more remain.
    let sawSlip = false;
    for (let seed = 1; seed <= 300; seed += 1) {
      const hand = npcVirtualHand(new SeededRng(seed), 1);
      const first = hand.allocateVirtualDie(5);
      const dice = hand.dealtHand()!.dice;
      if (dice[0] === dice[Math.floor(dice.length / 2)]) continue; // indistinguishable
      expect(first).not.toBe(dice[0]);
      if (first === dice[Math.floor(dice.length / 2)]) sawSlip = true;
    }
    expect(sawSlip).toBe(true);
  });

  it('N5 seam: the slip is guarded at three remaining dice', () => {
    // With two left the "middle" IS the dullest, so a slip there would degrade the
    // day's plan rather than the day's roll — the player-side ledger's own rule.
    // Stated as an EQUALITY against the un-degraded hand, which is what "the
    // guard closes" means: below three remaining, a `dullDieChance: 1` captain
    // and a captain with no profile at all must be indistinguishable — same die,
    // and the same rng state, because a blocked slip must not draw either.
    //
    // The two hands are walked into the 2-remaining state at the PIVOT stat, where
    // bias is 0 so no sharpest reach happens and the slip cannot fire on the way
    // in; that keeps the two streams in lockstep up to the allocation under test.
    for (let seed = 1; seed <= 300; seed += 1) {
      const slipRng = new SeededRng(seed);
      const plainRng = new SeededRng(seed);
      const slipping = npcVirtualHand(slipRng, 1);
      const plain = npcVirtualHand(plainRng);
      for (let i = 0; i < 3; i += 1) {
        expect(slipping.allocateVirtualDie(NPC_ALLOCATION_PIVOT_STAT)).toBe(
          plain.allocateVirtualDie(NPC_ALLOCATION_PIVOT_STAT),
        );
      }
      expect(slipping.remaining()).toBe(2);
      expect(slipRng.getState()).toBe(plainRng.getState());
      expect(slipping.allocateVirtualDie(5)).toBe(plain.allocateVirtualDie(5));
      expect(slipRng.getState()).toBe(plainRng.getState());
    }
  });

  it('N5 seam: with three or more remaining the guard is OPEN and the slip fires', () => {
    // The other half of the guard: at three remaining a stat-5 captain with
    // `dullDieChance: 1` must NEVER come away with the sharpest die.
    let checked = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const hand = npcVirtualHand(new SeededRng(seed), 1);
      const taken = [
        hand.allocateVirtualDie(NPC_ALLOCATION_PIVOT_STAT),
        hand.allocateVirtualDie(NPC_ALLOCATION_PIVOT_STAT),
      ];
      expect(hand.remaining()).toBe(3);
      const left = [...hand.dealtHand()!.dice];
      for (const die of taken) left.splice(left.indexOf(die), 1);
      if (left[0] === left[1]) continue; // sharpest indistinguishable from middle
      expect(hand.allocateVirtualDie(5)).not.toBe(left[0]);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('is deterministic: one seed, one allocation sequence', () => {
    expect(allocateAll(31337, 4, 8)).toEqual(allocateAll(31337, 4, 8));
    expect(allocateAll(31337, 4, 8)).not.toEqual(allocateAll(31338, 4, 8));
  });

  it('carries the sanctioned-abstraction flag at its definition site', () => {
    // ACCEPT CRITERION, made mechanical. The marker string is the SAME one
    // `npc.ts` already carries, so one grep finds every place the parity design
    // admits an abstraction.
    const source = readFileSync(NPC_HAND_SOURCE, 'utf8');
    expect(source).toContain('THE ONE SANCTIONED ABSTRACTION');
    expect(source).toMatch(/MODEL\*{0,2} OF THE DECISION, NOT THE DECISION/i);
    // Both boundaries are named where the function is defined.
    expect(source).toMatch(/The pick is modelled/);
    expect(source).toMatch(/Exhaustion falls back to a raw d20/);
  });
});
