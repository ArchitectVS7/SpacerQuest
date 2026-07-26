/**
 * Crew roster tuning — DATA, consumed by the engine's dice-progression readers
 * (T-1306 "Dice progression", PRD §7: "ship upgrades and crew can add dice, allow
 * one re-roll, or set a floor"). Before this, `const handSize = 5` was hardcoded
 * and a Day-200 veteran rolled the same dawn hand as a Day-1 nobody — the dice
 * pillar had NO progression axis. Crew are the concrete progression source.
 *
 * SOURCE MODEL: a spacer hires crew into the ship's cabin berths — `crewCapacity`
 * (engine components.ts), the T-1205 socket read off cabin STRENGTH. That is how
 * "ship upgrades add dice" is honored: a junker cabin berths 1 (hire one benefit),
 * a cabin refit berths more (stack all three). Each role grants exactly one of
 * PRD §7's three dice benefits — +1 die, one re-roll/day, or a roll floor — so the
 * three roles below span the whole axis. A dedicated dice MODULE in
 * SpecialEquipmentId is still intentionally NOT shipped: a new enum value would
 * ripple through schema/shipyard mutual-exclusion/sim for no acceptance gain.
 * T-1601c closed T-1306's deferral by making the extension point REAL rather than
 * merely promised: `EQUIPMENT_DICE_BENEFITS` below is the (shipped-empty) table a
 * future die-granting module joins with one entry — no engine change, no new call
 * site. The engine reads it via `dice.ts` `equipmentDiceBenefits`, whose output
 * folds through the SAME three accumulators as the crew roster in
 * `dawnDiceModifiers`.
 *
 * FOUNDATION (f2f95fa9): foundation has NO d20 dawn-hand mechanic at all — the
 * dawn hand is engine-original (there is no `handSize`, no re-roll, no floor, and
 * no crew-grants-dice rule anywhere in foundation/rules or the User-Manual). So
 * these constants carry no foundation citation: they are engine-original tuning,
 * sanctioned to live here per the TECH-STACK "balance numbers are data" constraint
 * — the same justification `lending.ts` and `hangout.ts` use. They are INTERIM
 * (T-1603): the canonical-values owner is T-1603b, the economy/pacing tuning pass
 * (hire prices and wages are economy knobs) — the same `INTERIM (T-1603)` idiom
 * `factions.ts` / `nemesis.ts` / `lending.ts` use. (The marker previously named
 * "the T-1601 rebalance"; T-1601 has since been split into T-1601a/b/c, none of
 * which is a tuning task — retargeted by T-1601c.) Do not enshrine as canonical.
 *
 * READERS: the dawn-hand aggregator (`packages/engine/src/dice.ts`
 * `dawnDiceModifiers`, feeding `rollDawnHand`), the hire/dismiss + reroll
 * resolvers (`packages/engine/src/actions/crew.ts`), the per-dusk wage upkeep
 * (`day.ts` endDay), and the headless sim (`packages/sim` protocol legalActions +
 * the veteran policy's crew planner). Surfaced to the player by T-1405 (named).
 */

import type { SpecialEquipmentContentId } from './upgrades.js';

/** The three dice benefits a dice-progression SOURCE can grant, spanning PRD §7's
 *  whole axis: a `+1` die, one re-roll charge per day, or a roll floor. A
 *  `CrewMember` on the player state stores only the `roleId` (and a fitted module
 *  stores only its boolean flag on the ship); the benefit is looked up here so the
 *  data (never engine logic) owns the tuning. T-1601c renamed this from
 *  `CrewDiceBenefit`: it is now the shared crew-AND-equipment dice vocabulary
 *  (`CREW_ROLES[].benefit` and `EQUIPMENT_DICE_BENEFITS` alike), so the
 *  crew-specific name would be a lie. */
export type DiceBenefit =
  { kind: 'extra-die' } | { kind: 'reroll' } | { kind: 'floor'; floor: number };

export interface CrewRole {
  /** Stable content id — the key a hired `CrewMember` stores and the aggregator
   *  looks the benefit up by. */
  id: string;
  /** Display name (T-1405 crew pane). */
  name: string;
  /** Role label / flavor (T-1405). */
  role: string;
  /** Credits to hire, spent up front (a die-costed Hangout/port action). */
  hirePrice: number;
  /** Credits charged at dusk while aboard (day.ts endDay wage upkeep). An unpaid
   *  crew walks — see the endDay wage block. */
  dailyWage: number;
  /** The single dice benefit this role grants at dawn. */
  benefit: DiceBenefit;
}

/**
 * The three hireable roles, one per benefit. Priced so the extra-die Second is the
 * dearest (the strongest benefit — a whole extra action's worth of die), the
 * navigator's re-roll mid, and the quartermaster's floor the cheapest. Wages are a
 * small fraction of hire price so a productive trader can keep a crew but an idle
 * one bleeds. INTERIM (T-1603b).
 */
export const CREW_ROLES: readonly CrewRole[] = [
  {
    id: 'crew-second',
    name: 'First Officer',
    role: 'Second-in-command',
    hirePrice: 3000,
    dailyWage: 40,
    benefit: { kind: 'extra-die' },
  },
  {
    id: 'crew-navigator',
    name: 'Navigator',
    role: 'Astrogator',
    hirePrice: 2500,
    dailyWage: 30,
    benefit: { kind: 'reroll' },
  },
  {
    id: 'crew-quartermaster',
    name: 'Quartermaster',
    role: 'Quartermaster',
    hirePrice: 2000,
    dailyWage: 25,
    benefit: { kind: 'floor', floor: 5 },
  },
];

/** Roles keyed by id for O(1) benefit lookup by the aggregator/resolvers. */
export const CREW_BY_ID: Record<string, CrewRole> = Object.fromEntries(
  CREW_ROLES.map((role) => [role.id, role]),
);

/** Base dawn-hand size before any crew/equipment modifier — the value the old
 *  hardcoded `const handSize = 5` used. */
export const DAWN_BASE_HAND_SIZE = 5;

/** Safety clamp on EXTRA dice granted by ALL sources COMBINED — crew roster plus
 *  any `EQUIPMENT_DICE_BENEFITS` grants — so future content (a second extra-die
 *  role, or a die-granting module) can never inflate the hand without bound. With
 *  one extra-die role and no shipped module the realized extra is 1; this leaves
 *  headroom. READER: `dice.ts` `dawnDiceModifiers` (applied to the combined sum). */
export const MAX_EXTRA_DICE = 2;

/** Absolute ceiling on the realized dawn-hand size (base + extras from every
 *  source), the hard cap `dawnDiceModifiers` clamps to. Base 5 + MAX_EXTRA_DICE
 *  2 = 7. */
export const MAX_DAWN_HAND_SIZE = 7;

/**
 * T-1601c · The dice-progression EXTENSIBILITY POINT, closing T-1306's deferral.
 * Maps a FITTED SpecialEquipment id → the one dice benefit that module grants at
 * dawn.
 *
 * SHIPS EMPTY BY DESIGN: no gameplay module grants dice today, so every dawn hand
 * is byte-identical to pre-T-1601c (proved in `dice.test.ts`). A future
 * die-granting module is exactly one entry here — no engine change, no new call
 * site, and no save migration, because the benefit is looked up from the
 * fitted-equipment flags already on `ShipState` and is never stored on the save
 * (the same "content owns the tuning" shape `CREW_ROLES[].benefit` uses).
 *
 * Keyed by `SpecialEquipmentContentId` so a typo'd id is a compile error rather
 * than a silent no-op.
 *
 * READER: `packages/engine/src/dice.ts` `equipmentDiceBenefits`, whose result
 * `dawnDiceModifiers` folds through the SAME three accumulators as the crew
 * roster — reaching the player at `day.ts` startDay (the dealt hand),
 * `actions/crew.ts` resolveReroll (the re-roll floor), and the UI HandDock badges
 * (`packages/ui/src/format.ts` dawnHandModifiers).
 */
export const EQUIPMENT_DICE_BENEFITS: Readonly<
  Partial<Record<SpecialEquipmentContentId, DiceBenefit>>
> = {};
