import {
  CREW_PER_CABIN_STRENGTH,
  NAV_BONUS_DIVISOR,
  ROBOTICS_REPAIR_DIVISOR,
  SHIELD_MITIGATION_DIVISOR,
  WEAPON_DAMAGE_DIVISOR,
} from '@spacerquest/content';
import { ComponentState, ShipState } from './types.js';

/**
 * T-1205 · Ship-component READERS. Before this module six of the eight ship
 * components were mechanically dead — combat read only the player's stats and the
 * enemy tier, so weapons/shields/navigation/robotics/cabin/lifeSupport were
 * cosmetic and `ComponentDamaged` on them was theatre. Each function here is the
 * single NAMED reader that makes one component load-bearing; each names its
 * consumer.
 *
 * PURITY: all pure functions of ship state — no DOM/I/O/Date/Math.random. Divisor
 * tuning is DATA imported from `@spacerquest/content` (never hard-coded here).
 *
 * BASELINE-SUBTRACTION INVARIANT: every reader is written so the starting junker
 * (state.ts `starterShip`) yields the EXACT value the pre-T-1205 code used —
 * weapons chip 1/volley, shields mitigate 0, nav bonus 0, single-repair +1. Only
 * an upgraded component diverges, which keeps the existing engine/sim goldens and
 * scripted combat tests valid except where combat's new seeded RNG draw is
 * involved. See packages/content/src/components.ts for the foundation-role
 * citation behind each divisor.
 */

/**
 * Foundation's `component_score` = strength × (condition + 1) / 10. A fresh
 * component (condition 9) scores exactly its strength; a dinged one scores less.
 * The shared spine every score-based reader below subtracts its junker baseline
 * from.
 */
export function effectiveScore(component: ComponentState): number {
  return (component.strength * (component.condition + 1)) / 10;
}

/**
 * weapons → hull points removed per WINNING fight volley.
 *
 * Junker weapons (strength 1, condition 9 → score 1) remove 1 — byte-identical to
 * the old `enemyHull - 1`. Upgraded weapons remove more (tier-3 → 2, tier-5 → 3),
 * so upgraded guns shorten time-to-kill. Clamped to ≥ 1 so even a battered gun
 * still chips the enemy on a win (preserving the "a hit always lands 1" floor).
 *
 * READER OF `weapons`. CONSUMED BY: combat.ts `resolveCombat` (the fight branch).
 */
export function weaponVolleyDamage(ship: ShipState): number {
  return Math.max(1, 1 + Math.floor((effectiveScore(ship.weapons) - 1) / WEAPON_DAMAGE_DIVISOR));
}

/**
 * shields → condition points subtracted from an incoming enemy hit before it
 * reaches the targeted component.
 *
 * Junker shields (score 1) mitigate 0 — the old enemy-damage math is unchanged.
 * Upgraded shields absorb more (tier-3 → 1, tier-5 → 2), so upgraded shields
 * reduce damage taken. HARD-CAPPED at 2, one below the nat-20 raw damage (3) that
 * `applyEnemyPressure` deals: a lucky nat-20 therefore ALWAYS penetrates the
 * strongest shields for at least 1, preserving foundation's "lucky shots bypass
 * shields" and guaranteeing the hull can still be killed no matter how strong the
 * shields (the T-1205 "hull damageable on any round" invariant survives upgrades).
 *
 * READER OF `shields`. CONSUMED BY: combat.ts `applyEnemyPressure`.
 */
const MAX_SHIELD_MITIGATION = 2;
export function shieldMitigation(ship: ShipState): number {
  const raw = Math.floor((effectiveScore(ship.shields) - 1) / SHIELD_MITIGATION_DIVISOR);
  return Math.max(0, Math.min(MAX_SHIELD_MITIGATION, raw));
}

/**
 * navigation → additive modifier on PILOT checks (travel arrival + off-lane
 * explore).
 *
 * Junker navigation (strength 10, condition 9 → score 10) adds 0 — travel/explore
 * goldens for a starter ship are unchanged. Upgraded nav adds accuracy (tier-3 →
 * +2), matching foundation's "damaged nav causes course errors" role.
 *
 * READER OF `navigation`. CONSUMED BY: travel.ts `resolveTravel` and
 * exploration.ts `resolveExploration` (the PILOT `check` modifier).
 */
export function navBonus(ship: ShipState): number {
  return Math.max(0, Math.floor((effectiveScore(ship.navigation) - 10) / NAV_BONUS_DIVISOR));
}

/**
 * robotics → condition restored per SINGLE-component shipyard repair.
 *
 * Junker robotics (score 10) restores 1 — the old `condition + 1` single-repair is
 * unchanged. Upgraded robotics repairs faster (tier-3 → 2), matching foundation's
 * Battle-Computer / Robbie-the-Robot role. Clamped to ≥ 1 so a damaged robotics
 * never makes a repair a no-op.
 *
 * READER OF `robotics`. CONSUMED BY: shipyard.ts `applyShipyardMutation`
 * (single-component repair branch).
 */
export function repairRate(ship: ShipState): number {
  return Math.max(
    1,
    1 + Math.floor((effectiveScore(ship.robotics) - 10) / ROBOTICS_REPAIR_DIVISOR),
  );
}

/**
 * cabin → crew capacity (berths). Read off raw cabin STRENGTH, not the
 * condition-scaled score: berths don't shrink when the cabin is scuffed. Junker
 * cabin (strength 1) berths 1; each +10 strength adds one (tier-3 → 4).
 *
 * READER OF `cabin`. CONSUMED BY: shipyard.ts `ShipPreview.crewCapacity`, surfaced
 * in the UI ship pane (format.ts / App.tsx) so a player sees capacity grow when the
 * cabin is upgraded. T-1306 socket: the real crew mechanic reads this same value.
 */
export function crewCapacity(ship: ShipState): number {
  return 1 + Math.floor(ship.cabin.strength / CREW_PER_CABIN_STRENGTH);
}

/**
 * lifeSupport → whether life support is CRITICAL (condition driven to 0). Only
 * reachable now that enemy fire can seed-target lifeSupport (T-1205). When true,
 * day.ts rolls the dusk GRIT survival check (LIFE_SUPPORT_SURVIVAL_DC); a failure
 * loses the ship to a life-support failure. Foundation: "damaged life support is
 * dangerous."
 *
 * READER OF `lifeSupport`. CONSUMED BY: day.ts `endDay` (the dusk survival gate).
 */
export function lifeSupportCritical(ship: ShipState): boolean {
  return ship.lifeSupport.condition === 0;
}
