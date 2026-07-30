import {
  CREW_BY_ID,
  DAWN_BASE_HAND_SIZE,
  EQUIPMENT_DICE_BENEFITS,
  EXPLORE_MODULE_DICE_BENEFITS,
  MAX_DAWN_HAND_SIZE,
  MAX_EXTRA_DICE,
  type DiceBenefit,
  type ExploreModuleContentId,
} from '@spacerquest/content';
import { hasExploreModule, hasSpecialEquipment } from './components.js';
import { SeededRng } from './rng.js';
import { CrewMember, DawnHand, CheckResult, ShipState, SpecialEquipmentId } from './types.js';

/**
 * T-1306 · The resolved dawn-hand parameters after applying crew — and (T-1601c)
 * fitted-equipment — dice benefits (PRD §7). All three of the axis's benefits live
 * here: `handSize` (base + extra dice from every source, clamped), `floor` (the max
 * floor across sources — every rolled die is raised to at least this), and
 * `rerolls` (the day's re-roll charges). Produced by {@link dawnDiceModifiers};
 * consumed by {@link rollDawnHand}.
 */
export interface DawnDiceModifiers {
  handSize: number;
  floor: number;
  rerolls: number;
}

/**
 * T-1601c · The EQUIPMENT LEG of the dawn-hand aggregation — the extensibility
 * point T-1306 deferred, now real instead of merely promised. Collects the dice
 * benefits granted by the modules FITTED to `ship`, by looking each shipped
 * equipment id in `table` up against the ship's fitted flags
 * (`components.ts` `hasSpecialEquipment` — the same predicate the shipyard's
 * ALREADY_INSTALLED guard uses, so purchase and benefit can never disagree).
 *
 * T-112 · THE PROMISE IS NOW KEPT, THROUGH A SECOND LOOP. This function's old
 * header promised that "a future die-granting module joins with one entry, no
 * engine change, no new call site". T-112 is that entry — three of them, in the
 * SIBLING content table `EXPLORE_MODULE_DICE_BENEFITS`, read by the second loop
 * below against `hasExploreModule` and appended into the SAME `granted` array.
 * What did NOT change is the load-bearing part: `dawnDiceModifiers` is untouched,
 * `check()` is untouched, there is no new accumulator, and all three call sites
 * still call `equipmentDiceBenefits(ship)` exactly as they did — so the modules
 * reach the dealt hand, the re-roll floor and the UI badges for free.
 *
 * TWO TABLES, DELIBERATELY (docs/EXPLORE_REDESIGN.md §6, finding F-100-1).
 * `table` is keyed by the SHIPYARD's purchasable id union and STILL SHIPS EMPTY —
 * `dawnDiceModifiers(crew, equipmentDiceBenefits(bareShip))` remains byte-identical
 * to `dawnDiceModifiers(crew)` for a ship with no explore modules. `moduleTable` is
 * keyed by explore-module ids the yard never sells, because a unique find
 * recovered off a derelict must not appear on every yard's shelf.
 *
 * Both parameters are injectable so each leg is PROVABLE without shipping a
 * gameplay module — plain dependency injection, no mocks.
 *
 * Iterates the TABLES (not the ship), so each leg costs its table's size and the
 * empty yard table costs zero iterations. PURE — a total function of ship state
 * and content data (no rng, no I/O). No benefit is stored on the save: the yard
 * leg derives from the fitted flags and the module leg from the fitted-id list,
 * both already on `ShipState`.
 *
 * READER of `ShipState`'s special-equipment flags and of `ShipState.exploreModules`.
 * CONSUMED BY: {@link dawnDiceModifiers} at all three of its call sites — day.ts
 * `startDay`, actions/crew.ts `resolveReroll`, and the UI's `format.ts`
 * `dawnHandModifiers`.
 */
export function equipmentDiceBenefits(
  ship: ShipState,
  table: Readonly<Partial<Record<SpecialEquipmentId, DiceBenefit>>> = EQUIPMENT_DICE_BENEFITS,
  moduleTable: Readonly<
    Partial<Record<ExploreModuleContentId, DiceBenefit>>
  > = EXPLORE_MODULE_DICE_BENEFITS,
): readonly DiceBenefit[] {
  const granted: DiceBenefit[] = [];
  for (const [id, benefit] of Object.entries(table)) {
    if (!benefit) continue;
    if (hasSpecialEquipment(ship, id as SpecialEquipmentId)) granted.push(benefit);
  }
  for (const [id, benefit] of Object.entries(moduleTable)) {
    if (!benefit) continue;
    if (hasExploreModule(ship, id as ExploreModuleContentId)) granted.push(benefit);
  }
  return granted;
}

/**
 * T-1306 · Aggregate a crew roster — and (T-1601c) the dice benefits of the ship's
 * fitted equipment — into the day's {@link DawnDiceModifiers} (PRD §7: "ship
 * upgrades and crew can add dice, allow one re-roll, or set a floor").
 * PURE — a function of the crew list, the granted equipment benefits, and content
 * tuning only (no rng, no I/O). The benefit for each hired member is looked up from
 * content (`CREW_BY_ID`), never stored on the save. Extra dice are summed then
 * clamped to `MAX_EXTRA_DICE` (and the total to `MAX_DAWN_HAND_SIZE`); the floor is
 * the MAX (a stronger floor wins, floors don't stack); rerolls are SUMMED. An empty
 * roster returns the exact pre-T-1306 defaults `{ handSize: 5, floor: 0,
 * rerolls: 0 }`, so a crew-free run rolls byte-identically.
 *
 * EQUIPMENT-EXTENSIBLE (T-1601c, closing T-1306's deferral): the optional
 * `equipment` list — produced by {@link equipmentDiceBenefits} off the content
 * table `EQUIPMENT_DICE_BENEFITS` — folds through the SAME three accumulators as
 * the crew, via the shared `applyBenefit` below. Crew and equipment therefore
 * provably share one fold: the clamps apply to the COMBINED extra-die count, one
 * source's floor beats the other's by MAX, and re-roll charges from both sum. The
 * fold is order-independent (sum/sum/max). The content table ships EMPTY, so
 * `equipment` is `[]` on every live call today and the dealt hand is unchanged.
 *
 * READER of `PlayerState.crew` (and, via the caller, the ship's equipment flags).
 * CONSUMED BY: day.ts `startDay` (the dawn roll), actions/crew.ts `resolveReroll`
 * (re-applying the floor to a re-rolled die), and ui/format.ts `dawnHandModifiers`
 * (the HandDock badges).
 */
export function dawnDiceModifiers(
  crew: readonly CrewMember[],
  equipment: readonly DiceBenefit[] = [],
): DawnDiceModifiers {
  let extraDice = 0;
  let floor = 0;
  let rerolls = 0;
  const applyBenefit = (benefit: DiceBenefit): void => {
    if (benefit.kind === 'extra-die') {
      extraDice += 1;
    } else if (benefit.kind === 'reroll') {
      rerolls += 1;
    } else if (benefit.kind === 'floor') {
      floor = Math.max(floor, benefit.floor);
    }
  };
  for (const member of crew) {
    const benefit = CREW_BY_ID[member.roleId]?.benefit;
    if (!benefit) continue;
    applyBenefit(benefit);
  }
  for (const benefit of equipment) {
    applyBenefit(benefit);
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
