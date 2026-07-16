import {
  CREW_BY_ID,
  DAWN_BASE_HAND_SIZE,
  MAX_DAWN_HAND_SIZE,
  MAX_EXTRA_DICE,
} from '@spacerquest/content';
import { SeededRng } from './rng.js';
import { CrewMember, DawnHand, CheckResult } from './types.js';

/**
 * T-1306 · The resolved dawn-hand parameters after applying crew (and any future
 * equipment) dice benefits (PRD §7). All three of the axis's benefits live here:
 * `handSize` (base + extra-die crew, clamped), `floor` (the max crew floor — every
 * rolled die is raised to at least this), and `rerolls` (the day's re-roll
 * charges). Produced by {@link dawnDiceModifiers}; consumed by {@link rollDawnHand}.
 */
export interface DawnDiceModifiers {
  handSize: number;
  floor: number;
  rerolls: number;
}

/**
 * T-1306 · Aggregate a crew roster into the day's {@link DawnDiceModifiers} (PRD
 * §7: "ship upgrades and crew can add dice, allow one re-roll, or set a floor").
 * PURE — a function of the crew list and content tuning only (no rng, no I/O). The
 * benefit for each hired member is looked up from content (`CREW_BY_ID`), never
 * stored on the save. Extra dice are summed then clamped to `MAX_EXTRA_DICE` (and
 * the total to `MAX_DAWN_HAND_SIZE`); the floor is the MAX across crew (a stronger
 * floor wins, they don't stack); rerolls are SUMMED (realized max 1 with one
 * reroll role). An empty roster returns the exact pre-T-1306 defaults
 * `{ handSize: 5, floor: 0, rerolls: 0 }`, so a crew-free run rolls byte-identically.
 *
 * EQUIPMENT-EXTENSIBLE: a future dice module would add its benefit into the same
 * three accumulators here — a one-line change, no new call site.
 *
 * READER of `PlayerState.crew`. CONSUMED BY: day.ts `startDay` (the dawn roll) and
 * actions/crew.ts `resolveReroll` (re-applying the floor to a re-rolled die).
 */
export function dawnDiceModifiers(crew: readonly CrewMember[]): DawnDiceModifiers {
  let extraDice = 0;
  let floor = 0;
  let rerolls = 0;
  for (const member of crew) {
    const benefit = CREW_BY_ID[member.roleId]?.benefit;
    if (!benefit) continue;
    if (benefit.kind === 'extra-die') {
      extraDice += 1;
    } else if (benefit.kind === 'reroll') {
      rerolls += 1;
    } else if (benefit.kind === 'floor') {
      floor = Math.max(floor, benefit.floor);
    }
  }
  const handSize = Math.min(
    MAX_DAWN_HAND_SIZE,
    DAWN_BASE_HAND_SIZE + Math.min(MAX_EXTRA_DICE, extraDice),
  );
  return { handSize, floor, rerolls };
}

/**
 * T-1306 · Roll the dawn hand off the resolved {@link DawnDiceModifiers}. The
 * `floor` raises each rolled die to at least `floor` (PRD §7's "set a floor"); this
 * preserves `rng.rollHand`'s descending order because flooring is monotonic. The
 * `rerolls` count seeds `rerollsRemaining` for the day. For an empty-crew
 * `{ handSize: 5, floor: 0, rerolls: 0 }` the `rng.rollHand(5)` draw is
 * byte-identical to the old `rollDawnHand(rng, 5)`; only the added
 * `rerollsRemaining: 0` key changes serialization (the two golden STATE hashes).
 */
export function rollDawnHand(rng: SeededRng, modifiers: DawnDiceModifiers): DawnHand {
  const raw = rng.rollHand(modifiers.handSize);
  const dice = modifiers.floor > 0 ? raw.map((d) => Math.max(d, modifiers.floor)) : raw;
  const spent = new Array<boolean>(dice.length).fill(false);
  return { dice, spent, rerollsRemaining: modifiers.rerolls };
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
