import { describe, it, expect } from 'vitest';
import {
  EQUIPMENT_DICE_BENEFITS,
  MAX_DAWN_HAND_SIZE,
  MAX_EXTRA_DICE,
  DAWN_BASE_HAND_SIZE,
  type DiceBenefit,
} from '@spacerquest/content';
import { CrewMember, ShipState, SpecialEquipmentId } from '../types.js';
import { SeededRng } from '../rng.js';
import { createInitialState } from '../state.js';
import {
  rollDawnHand,
  dawnDiceModifiers,
  equipmentDiceBenefits,
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

// --- T-1601c · the dice-progression extensibility hook ----------------------
// The hook closes T-1306's deferral: a future die-granting equipment module joins
// the content table `EQUIPMENT_DICE_BENEFITS` and becomes live at every existing
// call site, with no change to the dawn-roll core. NO gameplay module ships, so
// the table is empty and the live path is provably unchanged (last test).
describe('T-1601c · the dice-progression extensibility hook', () => {
  /** A starter ship with every special-equipment flag explicitly cleared. */
  function bareShip(): ShipState {
    const ship = createInitialState(1).player.ship;
    ship.hasCloaker = false;
    ship.hasAutoRepair = false;
    ship.hasStarBuster = false;
    ship.hasArchAngel = false;
    ship.isAstraxialHull = false;
    ship.hasTitaniumHull = false;
    ship.hasTransWarpDrive = false;
    return ship;
  }

  it('grants a die through the extensibility point (accept criterion)', () => {
    expect(dawnDiceModifiers([], [{ kind: 'extra-die' }])).toEqual({
      handSize: DAWN_BASE_HAND_SIZE + 1,
      floor: 0,
      rerolls: 0,
    });
  });

  it('grants a die through the whole ship → table → dealt-hand chain', () => {
    const ship = bareShip();
    ship.hasCloaker = true;
    const table: Partial<Record<SpecialEquipmentId, DiceBenefit>> = {
      CLOAKER: { kind: 'extra-die' },
    };

    const granted = equipmentDiceBenefits(ship, table);
    expect(granted).toEqual([{ kind: 'extra-die' }]);

    const mods = dawnDiceModifiers([], granted);
    expect(mods.handSize).toBe(6);

    // The granted die reaches the DEALT hand, not just the modifier struct.
    const hand = rollDawnHand(new SeededRng(1), mods);
    expect(hand.dice).toHaveLength(6);
    expect(hand.spent).toHaveLength(6);
  });

  it('a module that is NOT fitted grants nothing', () => {
    const table: Partial<Record<SpecialEquipmentId, DiceBenefit>> = {
      CLOAKER: { kind: 'extra-die' },
    };
    const granted = equipmentDiceBenefits(bareShip(), table);
    expect(granted).toEqual([]);
    expect(dawnDiceModifiers([], granted).handSize).toBe(DAWN_BASE_HAND_SIZE);
  });

  it('equipment and crew fold into the SAME accumulators, and the clamps hold', () => {
    const crew: CrewMember[] = [{ roleId: 'crew-second', hiredDay: 1 }]; // +1 die

    // Crew die + equipment die = 7 (base 5 + 2).
    expect(dawnDiceModifiers(crew, [{ kind: 'extra-die' }]).handSize).toBe(
      DAWN_BASE_HAND_SIZE + MAX_EXTRA_DICE,
    );
    // A third extra-die grant is absorbed by MAX_EXTRA_DICE / MAX_DAWN_HAND_SIZE.
    expect(dawnDiceModifiers(crew, [{ kind: 'extra-die' }, { kind: 'extra-die' }]).handSize).toBe(
      MAX_DAWN_HAND_SIZE,
    );
  });

  it('equipment floors take the MAX with crew floors; rerolls SUM', () => {
    const quartermaster: CrewMember[] = [{ roleId: 'crew-quartermaster', hiredDay: 1 }]; // floor 5
    // A stronger equipment floor wins (floors never stack).
    expect(dawnDiceModifiers(quartermaster, [{ kind: 'floor', floor: 7 }]).floor).toBe(7);
    // A weaker one loses.
    expect(dawnDiceModifiers(quartermaster, [{ kind: 'floor', floor: 3 }]).floor).toBe(5);

    const navigator: CrewMember[] = [{ roleId: 'crew-navigator', hiredDay: 1 }]; // 1 reroll
    expect(dawnDiceModifiers(navigator, [{ kind: 'reroll' }]).rerolls).toBe(2);
  });

  it('ships EMPTY: no gameplay module grants dice, so the live path is unchanged', () => {
    expect(Object.keys(EQUIPMENT_DICE_BENEFITS)).toHaveLength(0);

    // A ship with EVERY module fitted still grants nothing off the shipped table.
    const ship = bareShip();
    ship.hasCloaker = true;
    ship.hasAutoRepair = true;
    ship.hasStarBuster = true;
    ship.hasArchAngel = true;
    ship.isAstraxialHull = true;
    ship.hasTitaniumHull = true;
    ship.hasTransWarpDrive = true;
    expect(equipmentDiceBenefits(ship)).toEqual([]);

    const fullCrew: CrewMember[] = [
      { roleId: 'crew-second', hiredDay: 1 },
      { roleId: 'crew-navigator', hiredDay: 1 },
      { roleId: 'crew-quartermaster', hiredDay: 1 },
    ];
    for (const crew of [[] as CrewMember[], fullCrew]) {
      expect(dawnDiceModifiers(crew, equipmentDiceBenefits(ship))).toEqual(dawnDiceModifiers(crew));
    }
  });
});
