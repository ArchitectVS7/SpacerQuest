import { Stat } from './stats.js';

/**
 * NPC intent weight tables — pure data, per TECH-STACK.md content/ charter.
 *
 * T-106: an NPC's Ideal steers what they *want* to do with their day
 * (PRD §6: "picks among the same verbs the player has ... weighted by Ideal
 * and situation"). Each Ideal maps to base weights over the five NPC intent
 * verbs. The ENGINE combines these numbers with the character's stats and
 * situation — no behavior logic lives here, only the numbers.
 */
export type NpcIntentType = 'Trade' | 'Travel' | 'Combat' | 'Patrol' | 'Socialize';

export const NPC_INTENT_TYPES: readonly NpcIntentType[] = [
  'Trade',
  'Travel',
  'Combat',
  'Patrol',
  'Socialize',
];

export type IdealWeights = Record<NpcIntentType, number>;

/** Which stat amplifies each intent — data only; the engine does the math.
 *  (A GUNS-5 character leans into Combat the way a TRADE-5 one leans into
 *  the manifest board.) */
export const INTENT_STAT_AFFINITY: Record<NpcIntentType, Stat> = {
  Trade: Stat.TRADE,
  Travel: Stat.PILOT,
  Combat: Stat.GUNS,
  Patrol: Stat.GRIT,
  Socialize: Stat.GUILE,
};

/** Per-intent difficulty class for an NPC's day-resolution check (T-1201).
 *  The engine rolls d20 + stats[INTENT_STAT_AFFINITY[intent]] vs this DC
 *  through the SAME shared check() the player uses — PRD §7: "the player and
 *  the galaxy run on one system — there is no separate AI."
 *
 *  DIVERGENCE from foundation f2f95fa9: the original NPC resolver did NOT roll
 *  through check() at all. Trade/Travel/Patrol days rolled nothing (trades
 *  always banked full payment); Combat used a raw inline `die + GUNS >= 12`
 *  and Socialize a raw `die + GUILE >= 14`. Those literals are gone — every
 *  verb now sources its DC from this table so failure is real and content-tunable.
 *  (Combat=12 and Socialize=14 preserve the old inline thresholds exactly.) */
export const NPC_CHECK_DCS: Record<NpcIntentType, number> = {
  Trade: 12, // land the deal margin
  Travel: 11, // a clean jump vs a rough one
  Combat: 12, // was the inline `>= 12`
  Patrol: 11, // an uneventful sweep
  Socialize: 14, // was the inline `>= 14`
};

/**
 * N13 · THE VIRTUAL HAND'S CALIBRATION — the two numbers, and only the two
 * numbers, behind a captain's die allocation. The RULE that reads them is the
 * engine's (`packages/engine/src/npcHand.ts`); this file holds the data, per the
 * standing constraint. There is deliberately no `if` here and no third magnitude.
 *
 * `NPC_ALLOCATION_PIVOT_STAT` is the roster's MEDIAN stat, measured rather than
 * chosen: over the 41 shipped profiles' 205 stat entries the median is 2 and the
 * mean 2.156 (histogram 0:30 · 1:47 · 2:44 · 3:40 · 4:33 · 5:11). It is the stat
 * value at which a captain's allocation is NEUTRAL — they take the middle of what
 * their hand has left.
 *
 * WHY NEUTRAL AT THE PIVOT IS THE WHOLE CALIBRATION, and why "always take the
 * best" was not on the table. The expected value of the MIDDLE of five sorted
 * d20s is 10.5 — exactly a plain d20's mean. So a median captain rolls the same
 * distribution N13 replaced, and the step moves the SPREAD of outcomes without
 * moving the fleet economy. Allocating the sharpest die every time averages ~17.4
 * (+7 on every check in the game) and would detonate every band in
 * `balance-targets.test.ts` — which would make the variance decomposition
 * unreadable, because an economy-wide shift swamps the effect being attributed.
 *
 * `NPC_ALLOCATION_SHARPNESS_PER_STAT` is how much one point of the check's
 * affinity stat bends that neutrality, as a probability: a stat-5 captain reaches
 * for the sharpest remaining die 30% of the time, a stat-0 captain reaches for the
 * dullest 20% of the time, and everyone else sits proportionally between. The
 * engine clamps the product into [-1, 1], so a future stat ladder wider than 0-5
 * cannot make this a certainty by arithmetic accident.
 */
export const NPC_ALLOCATION_PIVOT_STAT = 2;
export const NPC_ALLOCATION_SHARPNESS_PER_STAT = 0.1;

/** Extra fuel an NPC burns on a FAILED Travel (PILOT) check (T-1201): a rough
 *  jump costs more than a clean one. Clamped at the tank floor by the engine.
 *
 *  (Note: the Trade check deliberately carries NO credit/fuel consequence — see
 *  the long rationale at executeTrade in engine/npc.ts. Trade is the most
 *  frequent NPC verb and a skill check, so any per-trade economic penalty makes
 *  the 200-day wealth distribution degenerate; its soured-run consequence is the
 *  wire narrative + the recorded StatCheck, not a payout swing.) */
export const NPC_TRAVEL_FAIL_EXTRA_FUEL = 25;

/** Stipend an NPC collects on a PASSED Patrol (GRIT) check (T-1201): a clean,
 *  productive sweep. A failed sweep costs the small credit stake below. */
export const NPC_PATROL_SUCCESS_CREDITS = 40;
/** Credit stake an NPC loses on a FAILED Patrol check (T-1201): a wasted,
 *  costly sweep. Never takes an NPC negative (engine clamps at 0). */
export const NPC_PATROL_FAIL_CREDITS = 20;

/** Winnings an NPC banks on a PASSED Socialize (GUILE) check at the Hangout
 *  tables (T-1201) — preserves the foundation's inline `+150` payout. */
export const NPC_SOCIALIZE_WIN_CREDITS = 150;
/** Ante an NPC loses on a FAILED Socialize check (T-1201) — preserves the
 *  foundation's inline `-50`. */
export const NPC_SOCIALIZE_LOSS_CREDITS = 50;

/** Fallback for any Ideal missing from the table (e.g. future cast additions
 *  before their weights are authored): an even-keeled journeyman spacer. */
export const DEFAULT_IDEAL_WEIGHTS: IdealWeights = {
  Trade: 3,
  Travel: 2,
  Combat: 1,
  Patrol: 1,
  Socialize: 1,
};

/**
 * One entry per distinct Ideal in cast.ts (all 30). Weights are relative,
 * 0 disables the verb outright for that worldview (a Balance idealist never
 * initiates violence; a Justice idealist never haggles for profit).
 */
export const IDEAL_WEIGHTS: Record<string, IdealWeights> = {
  // The Original 20
  Dominance: { Trade: 1, Travel: 1, Combat: 5, Patrol: 3, Socialize: 0 },
  Perfection: { Trade: 2, Travel: 2, Combat: 4, Patrol: 1, Socialize: 1 },
  Wealth: { Trade: 6, Travel: 2, Combat: 0, Patrol: 1, Socialize: 1 },
  Thrill: { Trade: 2, Travel: 3, Combat: 2, Patrol: 0, Socialize: 4 },
  Order: { Trade: 1, Travel: 2, Combat: 2, Patrol: 5, Socialize: 1 },
  Profit: { Trade: 5, Travel: 2, Combat: 2, Patrol: 0, Socialize: 1 },
  Glory: { Trade: 1, Travel: 3, Combat: 5, Patrol: 1, Socialize: 2 },
  Efficiency: { Trade: 5, Travel: 2, Combat: 0, Patrol: 1, Socialize: 1 },
  Power: { Trade: 1, Travel: 2, Combat: 5, Patrol: 2, Socialize: 1 },
  Preservation: { Trade: 2, Travel: 3, Combat: 0, Patrol: 4, Socialize: 2 },
  Chaos: { Trade: 2, Travel: 3, Combat: 3, Patrol: 1, Socialize: 3 },
  Logic: { Trade: 4, Travel: 2, Combat: 1, Patrol: 2, Socialize: 1 },
  Freedom: { Trade: 4, Travel: 4, Combat: 1, Patrol: 0, Socialize: 2 },
  Industry: { Trade: 5, Travel: 3, Combat: 0, Patrol: 1, Socialize: 1 },
  Excellence: { Trade: 1, Travel: 3, Combat: 5, Patrol: 1, Socialize: 1 },
  Survival: { Trade: 4, Travel: 2, Combat: 0, Patrol: 2, Socialize: 1 },
  Advantage: { Trade: 4, Travel: 2, Combat: 1, Patrol: 0, Socialize: 3 },
  Discovery: { Trade: 1, Travel: 6, Combat: 0, Patrol: 1, Socialize: 1 },
  Opulence: { Trade: 6, Travel: 2, Combat: 1, Patrol: 0, Socialize: 2 },
  // Balance (Stellar Monk, Pacifist): never initiates Combat or Patrol —
  // his days are trade, travel, and the Hangout.
  Balance: { Trade: 3, Travel: 3, Combat: 0, Patrol: 0, Socialize: 3 },
  // The 10 New Cast Members
  Ascension: { Trade: 1, Travel: 4, Combat: 2, Patrol: 1, Socialize: 3 },
  Knowledge: { Trade: 5, Travel: 1, Combat: 0, Patrol: 0, Socialize: 4 },
  Utility: { Trade: 4, Travel: 2, Combat: 1, Patrol: 2, Socialize: 1 },
  Truth: { Trade: 1, Travel: 5, Combat: 0, Patrol: 1, Socialize: 2 },
  Justice: { Trade: 0, Travel: 2, Combat: 4, Patrol: 5, Socialize: 0 },
  Beauty: { Trade: 4, Travel: 2, Combat: 0, Patrol: 0, Socialize: 4 },
  Mystery: { Trade: 1, Travel: 5, Combat: 2, Patrol: 1, Socialize: 1 },
  Control: { Trade: 4, Travel: 2, Combat: 1, Patrol: 1, Socialize: 2 },
  Flavor: { Trade: 5, Travel: 3, Combat: 0, Patrol: 0, Socialize: 2 },
  Possession: { Trade: 4, Travel: 2, Combat: 2, Patrol: 2, Socialize: 0 },
};

/**
 * N4 · How an archetype BIASES a captain's Ideal — a multiplier over
 * {@link IDEAL_WEIGHTS}, never a replacement for it.
 *
 * OWNER RULING (docs/NPC_REDESIGN.md, N4 RULING 1): *"archetype scales the
 * captain's own IDEAL_WEIGHTS, and the engine draws from the combined
 * distribution"*. The design is multiplicative for three reasons that all
 * matter: two traders with different Ideals stay measurably different captains,
 * an Ideal's authored `0` VETO survives the multiply (0 x anything is still 0 —
 * the Stellar Monk's `Balance` cannot be talked into a fight by an archetype),
 * and the archetype effect is SEPARABLE, so a sweep can attribute it by running
 * an arm with this whole table set to 1.
 *
 * THE RULE, and it is uniform on purpose: **an archetype DOUBLES the verbs it
 * is about and leaves the rest alone.** Because doubling all five would be the
 * identity, doubling three of them is equally a statement about the two it
 * leaves behind — the veteran's `Patrol: 1` and `Socialize: 1` are "no time for
 * sweeps or for the bar", not an absence of opinion. Every entry is 1 or 2:
 * there is no third magnitude to argue about at a later step, and the two rows
 * the owner's ruling worked out by hand (trader, fighter) are reproduced here
 * EXACTLY rather than re-derived.
 *
 * WHAT THIS TABLE DELIBERATELY REPLACED: pre-N4 `pickIntent` scaled the Ideal by
 * `(1 + the verb's affinity stat)`. Measured over the curated roster, that term
 * concentrates the average captain onto **3.1** verbs against **4.3** without it
 * (a TRADE-5 trader reaches 89% Trade and ONE live verb) — i.e. it re-creates
 * the "ten traders are literally the same function" collapse the reopened N4
 * exists to undo, and it contradicts the arithmetic the owner's ruling recorded.
 * So archetype takes that slot. {@link INTENT_STAT_AFFINITY} keeps its other and
 * more honest reader: which stat ROLLS the day's check in the engine.
 */
export type ArchetypeIntentMultipliers = Record<string, IdealWeights>;

export const ARCHETYPE_INTENT_MULTIPLIERS: ArchetypeIntentMultipliers = {
  /** The manifest board is the whole game. (Owner ruling's worked example:
   *  Cargo King · Wealth {6,2,0,1,1} -> {12,2,0,1,1} = Trade 75%, Travel 13%.) */
  trader: { Trade: 2, Travel: 1, Combat: 1, Patrol: 1, Socialize: 1 },
  /** Runs cargo, runs far, and keeps the contacts that move it. The two left at
   *  1 are the point: a smuggler's day is not a firefight and not a lane sweep,
   *  which is a lawman's work. Their rim preference lives in the engine's
   *  `executeTrade`, not here — this table only says how OFTEN they haul. */
  smuggler: { Trade: 2, Travel: 2, Combat: 1, Patrol: 1, Socialize: 2 },
  /** Guns and sweeps. (Owner ruling's worked example: Iron Vex · Dominance
   *  {1,1,5,3,0} -> {1,1,10,6,0}.) */
  fighter: { Trade: 1, Travel: 1, Combat: 2, Patrol: 2, Socialize: 1 },
  /** The far lanes for their own sake. Their Ideals already carry Travel 5–6,
   *  so a doubling is plenty — a third magnitude here would pin them at 90%. */
  explorer: { Trade: 1, Travel: 2, Combat: 1, Patrol: 1, Socialize: 1 },
  /** The Hangout table, and the float to sit at it. */
  gambler: { Trade: 1, Travel: 1, Combat: 1, Patrol: 1, Socialize: 2 },
  /** The only archetype that doubles three verbs: a veteran plays the whole
   *  loop — earns, flies, and fights — which is also what makes them the field's
   *  natural deed-earners when N11 gives deeds a source. */
  veteran: { Trade: 2, Travel: 2, Combat: 2, Patrol: 1, Socialize: 1 },
};

/** The identity row: what an archetype-blind captain would draw from. Named
 *  rather than inlined because it is BOTH the fallback for an archetype missing
 *  from the table above AND the control arm N4 was graded against — one
 *  definition, so the control cannot drift from the fallback. */
export const NEUTRAL_INTENT_MULTIPLIERS: IdealWeights = {
  Trade: 1,
  Travel: 1,
  Combat: 1,
  Patrol: 1,
  Socialize: 1,
};
