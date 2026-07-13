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
