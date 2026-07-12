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
