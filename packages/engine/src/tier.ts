import { PowerTier, RenownRankId } from '@spacerquest/content';
import { GameState, ShipState } from './types.js';
import { renownRankIndex } from './deeds.js';

// ---------------------------------------------------------------------------
// T-1203 · player.tier progression.
//
// `player.tier` is the player's power band (1..5) that encounter matchmaking
// reads to choose an interceptor tier. Before T-1203 it was hardcoded to 1 at
// creation and written nowhere else, so the matchmaking band never opened past
// tiers 1–2 and 23 of the 30 named NPCs (Rattlesnake included, PRD §7.4) could
// never intercept the player. This module makes tier a pure DERIVED function of
// the two things a player actually grows: renown rank and combat ship fit.
//
// READER of `player.tier`: encounter matchmaking in actions/travel.ts —
//   selectEncounterInterceptor (L193 reads state.player.tier ?? 1) and
//   chooseTargetTier (clamps the candidate band to [max(1,tier-1),
//   min(5,tier+1)]). Nothing else consumes it. Every write site (state.ts
//   creation + deserialize, day.ts action/dawn/dusk chokepoints, legacy.ts
//   succession) routes through syncPlayerTier so the field is always the
//   derivation of the live rank + ship, never a stale literal.
//
// DIVERGENCE from foundation (git ref f2f95fa9): foundation had NO player
// power-tier at all. foundation/rules/combat.ts matched encounters on the
// ENEMY ship-name tiers (K1..K9) and a score-derived `Rank`, and the rank-based
// combat bonus was explicitly removed there — there was no notion of a player
// tier band feeding matchmaking. PRD-REIMAGINED §7.4 ("Encounter matchmaking
// respects tiers") is redesign-owned and wins over foundation, so this formula
// is authored fresh here. Documented at the definition site per the standing
// constraint that every divergence from foundation carry a comment.
//
// FORMULA (tunable thresholds; invariants: junker→1, maxed combat fit→5,
// monotonic non-decreasing under climbing renown and upgrading):
//   rankTier      = clamp(1,5, floor(renownRankIndex(rank) / 2) + 1)
//     9 ranks, index 0..8:
//       LIEUTENANT/COMMANDER   → 1
//       CAPTAIN/COMMODORE      → 2
//       ADMIRAL/TOP_DOG        → 3
//       GRAND_MUFTI/MEGA_HERO  → 4
//       GIGA_HERO              → 5
//   shipRating    = max(weapons.strength, hull.strength, shields.strength)
//     junker fit = 1; the shipyard's buy-component-tier sets a component's
//     strength to tier*10 (tier 1..9), so a maxed combat fit reaches 90.
//   shipClassTier = shipRating<=10 →1, <=30 →2, <=50 →3, <=70 →4, else →5
//   tier          = clamp(1,5, max(rankTier, shipClassTier))
//
// WHY max: renown draws stronger hunters even in a weak ship (the PRD's
// "somewhere, Rattlesnake reads the headline"); an over-gunned low-rank player
// independently qualifies for a tougher band. max is monotonic non-decreasing
// under both axes, so a band never CLOSES. The starter (LIEUTENANT + junker)
// resolves to 1, so createInitialState's opening tier is unchanged.
// ---------------------------------------------------------------------------

function clampTier(value: number): PowerTier {
  return Math.max(1, Math.min(5, value)) as PowerTier;
}

/** Renown-rank contribution to the power band (1..5). */
function rankTier(rank: RenownRankId): number {
  return clampTier(Math.floor(renownRankIndex(rank) / 2) + 1);
}

/** Combat-fit contribution to the power band (1..5). Derived from the strongest
 *  of the three combat components (weapons/hull/shields) since the player has no
 *  explicit "ship class" field — the fit IS the class. */
function shipClassTier(ship: ShipState): number {
  const rating = Math.max(ship.weapons.strength, ship.hull.strength, ship.shields.strength);
  if (rating <= 10) return 1;
  if (rating <= 30) return 2;
  if (rating <= 50) return 3;
  if (rating <= 70) return 4;
  return 5;
}

/** Pure derivation of the player's power tier from renown rank + ship fit. */
export function computePlayerTier(rank: RenownRankId, ship: ShipState): PowerTier {
  return clampTier(Math.max(rankTier(rank), shipClassTier(ship)));
}

/** The single write chokepoint for `player.tier`: recompute it from the live
 *  registry rank + ship fit. Called at every state change that can move either
 *  input (rank-up, shipyard upgrade/repair, combat damage, succession, save
 *  load). Mirrors the syncMaxFuel "single recompute chokepoint" pattern. */
export function syncPlayerTier(state: GameState): void {
  state.player.tier = computePlayerTier(state.player.registry.renownRank, state.player.ship);
}
