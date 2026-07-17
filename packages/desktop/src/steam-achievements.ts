// ============================================================================
//  T-1702 · Steam achievement + rich-presence derivation — the PURE, testable core
// ============================================================================
//
// This module holds ZERO native code and ZERO I/O. It is the deterministic mapping
// from the engine's existing typed GameEvents to Steam achievement ids, plus the
// rich-presence formatter. Keeping it pure gives it a vitest home (the UI package has
// no unit runner) and keeps the Steam-facing surface auditable without a Steam client.
//
// STANDING-CONSTRAINTS NOTES:
//   • Engine stays pure / no new event: we reuse `DeedEarned` and `RenownRankUp`
//     (packages/engine/src/types.ts) — no new GameState field, flag, or event.
//   • Content is data: the achievement id SET is DERIVED from `DEEDS` (content), not a
//     hand-maintained table, so partner-backend config and code cannot silently drift
//     (asserted by steam-achievements.test.ts).
//   • The `newRank === 'CONQUEROR'` capstone is the one rank the task names explicitly
//     ("the ≥30-Deed set including Conqueror"); lower rank-ups are intentionally NOT
//     mapped so the Steam set is exactly {one per deed} + Conqueror.

import { DEEDS, STAR_SYSTEMS } from '@spacerquest/content';
import type { GameEvent } from '@spacerquest/engine';

/** The single Steam achievement id for the career capstone (PRD-REIMAGINED §5.2/§9). */
export const CONQUEROR_ACHIEVEMENT_ID = 'RANK_CONQUEROR';

/** Steam achievement id for a deed id, e.g. `first_manifest` → `DEED_FIRST_MANIFEST`.
 *  Exported so the id derivation is testable and reused by `allAchievementIds`. */
export function achievementIdForDeed(deedId: string): string {
  return `DEED_${deedId.toUpperCase()}`;
}

/**
 * Map a single engine event to the Steam achievement id it should unlock, or null
 * when the event is not achievement-bearing. Only `DeedEarned` (every deed) and the
 * `RenownRankUp` into CONQUEROR unlock achievements — everything else returns null.
 */
export function achievementIdForEvent(event: GameEvent): string | null {
  if (event.type === 'DeedEarned') {
    return achievementIdForDeed(event.deedId);
  }
  if (event.type === 'RenownRankUp' && event.newRank === 'CONQUEROR') {
    return CONQUEROR_ACHIEVEMENT_ID;
  }
  return null;
}

/**
 * The canonical, complete set of Steam achievement ids: one per authored deed plus
 * the Conqueror capstone. This is the list the Steamworks partner-backend config MUST
 * mirror; a test asserts it covers every deed so config and code never drift. Derived
 * from `DEEDS` (content) — no hand-maintained table.
 */
export function allAchievementIds(): string[] {
  return [...DEEDS.map((d) => achievementIdForDeed(d.id)), CONQUEROR_ACHIEVEMENT_ID];
}

/** The rich-presence snapshot for a system + day. Pure and unit-testable.
 *  `steamDisplay` is the human-readable string shown in the friends list. */
export function presenceFor(
  systemId: number,
  day: number,
): { system: string; day: number; steamDisplay: string } {
  const system = STAR_SYSTEMS[systemId]?.name ?? `System ${systemId}`;
  return { system, day, steamDisplay: `${system} · Day ${day}` };
}
