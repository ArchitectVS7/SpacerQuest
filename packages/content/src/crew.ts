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
 * SpecialEquipmentId is intentionally NOT added: it would ripple new enum values
 * through schema/shipyard mutual-exclusion/sim for no acceptance gain. The engine
 * aggregator (dice.ts `dawnDiceModifiers`) is written equipment-extensibly so a
 * future module is a one-line add.
 *
 * FOUNDATION (f2f95fa9): foundation has NO d20 dawn-hand mechanic at all — the
 * dawn hand is engine-original (there is no `handSize`, no re-roll, no floor, and
 * no crew-grants-dice rule anywhere in foundation/rules or the User-Manual). So
 * these constants carry no foundation citation: they are engine-original tuning,
 * sanctioned to live here per the TECH-STACK "balance numbers are data" constraint
 * — the same justification `lending.ts` and `hangout.ts` use. They are INTERIM and
 * OWNED BY the T-1601 rebalance; do not enshrine them as canonical.
 *
 * READERS: the dawn-hand aggregator (`packages/engine/src/dice.ts`
 * `dawnDiceModifiers`, feeding `rollDawnHand`), the hire/dismiss + reroll
 * resolvers (`packages/engine/src/actions/crew.ts`), the per-dusk wage upkeep
 * (`day.ts` endDay), and the headless sim (`packages/sim` protocol legalActions +
 * the veteran policy's crew planner). Surfaced to the player by T-1405 (named).
 */

/** The three dice benefits a crew role can grant, spanning PRD §7's whole axis:
 *  a `+1` die, one re-roll charge per day, or a roll floor. A `CrewMember` on the
 *  player state stores only the `roleId`; the benefit is looked up here so the
 *  data (never engine logic) owns the tuning. */
export type CrewDiceBenefit =
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
  benefit: CrewDiceBenefit;
}

/**
 * The three hireable roles, one per benefit. Priced so the extra-die Second is the
 * dearest (the strongest benefit — a whole extra action's worth of die), the
 * navigator's re-roll mid, and the quartermaster's floor the cheapest. Wages are a
 * small fraction of hire price so a productive trader can keep a crew but an idle
 * one bleeds. INTERIM (T-1601).
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

/** Safety clamp on crew-granted EXTRA dice, so future content (a second extra-die
 *  source, or a dice module) can never inflate the hand without bound. With one
 *  extra-die role the realized extra is 1; this leaves headroom. */
export const MAX_EXTRA_DICE = 2;

/** Absolute ceiling on the realized dawn-hand size (base + extras), the hard cap
 *  `dawnDiceModifiers` clamps to. Base 5 + MAX_EXTRA_DICE 2 = 7. */
export const MAX_DAWN_HAND_SIZE = 7;
