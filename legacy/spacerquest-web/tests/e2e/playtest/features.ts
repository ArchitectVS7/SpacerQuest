/**
 * SpacerQuest Playtest — Canonical Feature List (single source of truth)
 *
 * Both playtest harnesses track the same set of player-facing features. This file
 * is the ONE place they're defined; the scripted engine's report (`ALL_FEATURES`)
 * and the LLM tracker's map (`FEATURES`) are both derived from it, so they can
 * never drift out of sync again.
 */

export interface GameFeature {
  id: string;
  description: string;
}

export const GAME_FEATURES: GameFeature[] = [
  // Navigation
  { id: 'nav.launch',         description: 'Launch to another system' },
  { id: 'nav.cargo_delivery', description: 'Deliver cargo on arrival' },
  { id: 'nav.hazard',         description: 'Travel hazard encountered' },
  { id: 'nav.encounter',      description: 'Combat encounter triggered during travel' },
  { id: 'nav.malfunction',    description: 'Nav system malfunction (redirected to random system)' },
  // Combat
  { id: 'combat.attack',      description: 'Attack in combat (press A)' },
  { id: 'combat.retreat',     description: 'Retreat from combat (press R)' },
  { id: 'combat.surrender',   description: 'Surrender in combat (press S)' },
  { id: 'combat.victory',     description: 'Win a combat battle' },
  // Shipyard
  { id: 'shipyard.view',      description: 'Visit the Shipyard screen' },
  { id: 'shipyard.upgrade',   description: 'Upgrade a ship component' },
  { id: 'shipyard.repair',    description: 'Repair ship components (press R at shipyard)' },
  // Traders
  { id: 'traders.buy_fuel',   description: 'Buy fuel at Traders' },
  { id: 'traders.sell_fuel',  description: 'Sell fuel at Traders' },
  { id: 'traders.accept_cargo', description: 'Accept a cargo contract' },
  // Bank
  { id: 'bank.visit',         description: 'Visit the Bank screen' },
  { id: 'bank.deposit',       description: 'Deposit credits to bank' },
  { id: 'bank.withdraw',      description: 'Withdraw credits from bank' },
  // Pub
  { id: 'pub.visit',          description: 'Visit the Pub screen' },
  { id: 'pub.drink',          description: 'Buy a drink at the pub' },
  { id: 'pub.gamble',         description: 'Gamble at the pub' },
  // Registry
  { id: 'registry.visit',     description: 'Visit the Space Registry screen' },
  { id: 'registry.patrol',    description: 'Accept a Space Patrol mission' },
  // Special
  { id: 'npc.sage',           description: 'Visit the Sage (System 18)' },
  { id: 'npc.wise_one',       description: 'Visit the Wise One (System 17)' },
  // Progress
  { id: 'score.rank_advance', description: 'Advance to a new rank' },
];

/** All feature IDs, in canonical order. */
export const ALL_FEATURE_IDS: string[] = GAME_FEATURES.map((f) => f.id);

/** Feature ID → human description. */
export const FEATURE_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  GAME_FEATURES.map((f) => [f.id, f.description]),
);
