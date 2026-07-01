/**
 * SpacerQuest v4.0 - Player Goals & Objective Surfacing
 *
 * Pure helpers (no prisma) that turn the player's state into visible progress and a
 * single "what should I do now?" nudge for the main-menu dashboard.
 *
 * Design rule (see ARENA_DESIGN / EVALUATION §6): advancement is surfaced as
 * progress + opportunity, never power. Rank progress is derived from SCORE (the source
 * of truth), because the stored `character.rank` only updates on end-turn / patrol payoff
 * and would lag a cargo-earned promotion.
 */

import { Rank } from '@prisma/client';
import { RANK_THRESHOLDS } from '../constants.js';
import { getSystemName } from './economy.js';

// Ranks in ascending score order (matches the Rank enum + RANK_THRESHOLDS).
const RANK_LADDER: { rank: Rank; threshold: number }[] = (Object.keys(RANK_THRESHOLDS) as Rank[])
  .map(rank => ({ rank, threshold: RANK_THRESHOLDS[rank as keyof typeof RANK_THRESHOLDS] }))
  .sort((a, b) => a.threshold - b.threshold);

export interface NextRankInfo {
  /** The next rank above the current score, or null at the top (Giga Hero). */
  nextRank: Rank | null;
  /** Points still needed to reach `nextRank` (0 at the top). */
  pointsToNext: number;
}

/** Next-rank progress from raw score (source of truth), independent of the stored rank. */
export function getNextRankInfo(score: number): NextRankInfo {
  for (const { rank, threshold } of RANK_LADDER) {
    if (threshold > score) return { nextRank: rank, pointsToNext: threshold - score };
  }
  return { nextRank: null, pointsToNext: 0 };
}

/** Human-friendly rank label: TOP_DOG → "Top Dog". */
export function rankTitle(rank: Rank | string): string {
  return String(rank).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Objective selection ──────────────────────────────────────────────────────
export interface GoalSnapshot {
  score: number;
  fuel: number;
  credits: number;        // total credits (high*10000 + low)
  cargoPods: number;
  destination: number;    // 0 = none
  isConqueror: boolean;
}

const LOW_FUEL = 20;              // below this, stranding is a real risk
const AFFORD_UPGRADE = 10_000;    // enough for at least one component upgrade / special
const NEAR_RANK = 50;             // "so close!" nudge margin
const CONQUEST_NEAR = 9000;       // final stretch toward the 10,000 Conqueror win

const TIPS = [
  'Tip: fuel runs cheapest out at Mira-9.',
  'Tip: rescue stranded spacers for bonus points.',
  'Tip: the richest contracts run through dangerous space — pack weapons.',
  'Tip: wager your winnings against rivals in the Arena.',
  'Tip: bank your credits once you make Commander.',
];

/**
 * One priority-picked objective for the dashboard. First match wins — immediate,
 * actionable needs (fuel, the trade loop) rank above aspirational milestones, since the
 * dashboard already shows next-rank progress separately.
 */
export function selectObjective(s: GoalSnapshot, rng: () => number = Math.random): string {
  if (s.fuel < LOW_FUEL) return 'Refuel at the Traders before your next launch.';
  // The Conqueror win is momentous — surface it in the final stretch, above the routine loop.
  if (s.score >= CONQUEST_NEAR && !s.isConqueror) return `${10000 - s.score} pts to CONQUEROR status — the win is in reach!`;
  if (s.cargoPods < 1) return 'Sign a cargo contract at the Traders [T].';
  if (s.cargoPods >= 1 && s.destination > 0) return `Deliver your cargo to ${getSystemName(s.destination)}.`;
  if (s.credits >= AFFORD_UPGRADE) return 'You can afford a ship upgrade at the Shipyard [S].';
  const { nextRank, pointsToNext } = getNextRankInfo(s.score);
  if (nextRank && pointsToNext <= NEAR_RANK) return `Just ${pointsToNext} pts to ${rankTitle(nextRank)}!`;
  return TIPS[Math.min(TIPS.length - 1, Math.floor(rng() * TIPS.length))];
}
