import type { ExploreModuleContentId } from '@spacerquest/content';
import {
  ARCH_ANGEL_MITIGATION_FLOOR,
  AUTO_REPAIR_REGEN,
  CREW_PER_CABIN_STRENGTH,
  NAV_BONUS_DIVISOR,
  NAV_FUEL_DISCOUNT_PER_POINT,
  NAV_FUEL_FLOOR,
  NAV_FUEL_JUNKER_PENALTY,
  ROBOTICS_REPAIR_DIVISOR,
  SHIELD_MITIGATION_DIVISOR,
  STAR_BUSTER_VOLLEY_BONUS,
  WEAPON_DAMAGE_DIVISOR,
} from '@spacerquest/content';
import { ComponentState, ShipComponentId, ShipState, SpecialEquipmentId } from './types.js';

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
 * T-1601c · Is `equipment` FITTED to this ship? The single honest mapping from the
 * `SpecialEquipmentId` union to the boolean flag that records it on `ShipState`.
 *
 * Extracted from shipyard.ts's private `alreadyInstalled`, which the dice
 * extensibility point needed too — one mapping, so a purchase guard and a
 * dice-benefit lookup can never disagree about what "fitted" means. Deliberately
 * an exhaustive switch with `default: return false` rather than shipyard's old
 * "everything else is TRANS_WARP" fallthrough, which would have misreported an
 * unknown id as a fitted Trans-Warp.
 *
 * PURE — a total function of ship state (no rng, no I/O).
 *
 * READERS: `actions/shipyard.ts` `specialEquipmentFailure` (the ALREADY_INSTALLED
 * guard) and `dice.ts` `equipmentDiceBenefits` (the equipment leg of the dawn-hand
 * aggregation).
 */
export function hasSpecialEquipment(ship: ShipState, equipment: SpecialEquipmentId): boolean {
  switch (equipment) {
    case 'CLOAKER':
      return ship.hasCloaker === true;
    case 'AUTO_REPAIR':
      return ship.hasAutoRepair === true;
    case 'STAR_BUSTER':
      return ship.hasStarBuster === true;
    case 'ARCH_ANGEL':
      return ship.hasArchAngel === true;
    case 'ASTRAXIAL_HULL':
      return ship.isAstraxialHull === true;
    case 'TITANIUM_HULL':
      return ship.hasTitaniumHull === true;
    case 'TRANS_WARP':
      return ship.hasTransWarpDrive === true;
    default:
      return false;
  }
}

/**
 * T-112 · Is an EXPLORE-GRANTED module fitted to this ship? The sibling of
 * {@link hasSpecialEquipment}, and the one honest "is this module fitted"
 * mapping for Class B (docs/EXPLORE_REDESIGN.md §4.2).
 *
 * DELIBERATELY NOT A SWITCH. `ShipState.exploreModules` is a LIST of content ids,
 * so this is a membership test — which means the read side and the grant side
 * ({@link fitExploreModule}) cannot disagree about what "fitted" means, because
 * neither of them enumerates the ids at all. See F-112-A on `ShipState` for why a
 * list rather than F-100-1's three booleans.
 *
 * PURE — a total function of ship state (no rng, no I/O).
 *
 * READERS: `dice.ts` `equipmentDiceBenefits` (the module leg of the dawn-hand
 * aggregation) and `ui/format.ts` `fittedModuleRows` (the ship pane).
 */
export function hasExploreModule(ship: ShipState, moduleId: ExploreModuleContentId): boolean {
  return ship.exploreModules?.includes(moduleId) === true;
}

/**
 * T-112 · Fit an explore-granted module. THE ONLY WRITER of
 * `ShipState.exploreModules`, and idempotent: returns `false` and mutates nothing
 * when the module is already aboard, so resolving the same find twice (a repeated
 * row, a replayed event) can never double-count a benefit.
 *
 * The array is REPLACED rather than pushed into, because the field is declared
 * `readonly ExploreModuleContentId[]` — the immutability is real, not a comment.
 *
 * CALLER: `exploreOutcomes.ts` `applyUniqueItem`, the Class-B arm.
 */
export function fitExploreModule(ship: ShipState, moduleId: ExploreModuleContentId): boolean {
  if (hasExploreModule(ship, moduleId)) return false;
  ship.exploreModules = [...(ship.exploreModules ?? []), moduleId];
  return true;
}

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
 * T-1206: a fitted STAR_BUSTER adds a flat siege bonus ON TOP of the weapon fit,
 * so the top-tier siege weapon shortens time-to-kill further — the module was
 * purchasable since v0.1 but read by nothing until this reader. A ship WITHOUT the
 * Star-Buster (the default, `hasStarBuster` false) is byte-identical to before.
 *
 * READER OF `weapons` AND `hasStarBuster`. CONSUMED BY: combat.ts `resolveCombat`
 * (the fight branch).
 */
export function weaponVolleyDamage(ship: ShipState): number {
  return (
    Math.max(1, 1 + Math.floor((effectiveScore(ship.weapons) - 1) / WEAPON_DAMAGE_DIVISOR)) +
    (ship.hasStarBuster ? STAR_BUSTER_VOLLEY_BONUS : 0)
  );
}

/**
 * shields → condition points subtracted from an incoming enemy hit before it
 * reaches the targeted component.
 *
 * Junker shields (score 1) mitigate 0 — the old enemy-damage math is unchanged.
 * Upgraded shields absorb more (tier-3 → 1, tier-5 → 2), so upgraded shields
 * reduce damage taken. HARD-CAPPED at 2.
 *
 * THE HULL-KILLABLE INVARIANT, re-derived for T-1603c. `applyEnemyPressure` now
 * deals `raw = (nat20 ? 3 : margin >= BIG_HIT_MARGIN ? 2 : 1) +
 * TIER_GAP_DAMAGE_BONUS * tierGap`, so the MINIMUM raw a nat-20 can carry is 3
 * (gap 0) and it rises with the gap. MAX_SHIELD_MITIGATION = 2 must stay STRICTLY
 * below that minimum: at 2 a nat-20 always penetrates the strongest shields for at
 * least 1, preserving foundation's "lucky shots bypass shields" and guaranteeing
 * the hull can still be killed no matter how strong the shields (the T-1205 "hull
 * damageable on any round" invariant survives upgrades). The tier-gap bonus only
 * ever ADDS to raw, so it widens the headroom rather than eroding it — but the
 * invariant is derived from the nat-20 floor of 3, not from "raw 3", because raw
 * is no longer a single value. Pinned by `components.test.ts`.
 *
 * T-1206: a fitted ARCH_ANGEL raises the mitigation to at least
 * ARCH_ANGEL_MITIGATION_FLOOR — the top-tier shield guarantees a floor of absorb
 * regardless of the shield tier's raw value, making the previously-inert module
 * load-bearing. The floor is still passed through the same MAX_SHIELD_MITIGATION
 * cap (the content constant is <= the cap), so a nat-20 (raw 3) still penetrates
 * for >= 1 and the hull-killable invariant holds. A ship WITHOUT the Arch-Angel
 * (default `hasArchAngel` false) is byte-identical to before.
 *
 * READER OF `shields` AND `hasArchAngel`. CONSUMED BY: combat.ts
 * `applyEnemyPressure`.
 */
const MAX_SHIELD_MITIGATION = 2;
export function shieldMitigation(ship: ShipState): number {
  const raw = Math.floor((effectiveScore(ship.shields) - 1) / SHIELD_MITIGATION_DIVISOR);
  const floored = ship.hasArchAngel ? Math.max(raw, ARCH_ANGEL_MITIGATION_FLOOR) : raw;
  return Math.max(0, Math.min(MAX_SHIELD_MITIGATION, floored));
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
/**
 * Navigation → multiplier on a jump's fuel burn (<= 1). T-1605.
 *
 * Replaces navigation's old job as a modifier on the pilot check that decided
 * whether a jump landed at all. A jump always lands now, so nav pays out on
 * every jump instead of on the 1-in-3 that used to fail.
 *
 * READER OF `navigation`. CONSUMED BY: economy.ts `jumpFuelCost`.
 */
export function navFuelFactor(ship: ShipState): number {
  const above = Math.max(0, effectiveScore(ship.navigation) - 10);
  return Math.max(NAV_FUEL_FLOOR, NAV_FUEL_JUNKER_PENALTY - above * NAV_FUEL_DISCOUNT_PER_POINT);
}

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

/**
 * AUTO_REPAIR → dusk condition regeneration. PORTED FROM
 * f2f95fa9:foundation/rules/combat.ts `applyAutoRepair`: each fitted component
 * (strength > 0) below full condition regenerates AUTO_REPAIR_REGEN condition
 * overnight, clamped to the 9 ceiling. Foundation's component list is the seven
 * FITTED systems with the HULL EXCLUDED — the Auto-Repair module patches systems,
 * not the hull itself — and this reader mirrors that list exactly.
 *
 * Pure: no rng, no I/O; returns the condition deltas and the list of repaired
 * components so the caller can apply them and narrate. A ship WITHOUT the module
 * never calls this (day.ts guards on `hasAutoRepair`).
 *
 * READER OF `hasAutoRepair`. CONSUMED BY: day.ts `endDay`.
 */
const AUTO_REPAIR_COMPONENTS: readonly ShipComponentId[] = [
  'drives',
  'cabin',
  'lifeSupport',
  'weapons',
  'navigation',
  'robotics',
  'shields',
];

export function autoRepairRegen(ship: ShipState): {
  updates: Partial<Record<ShipComponentId, number>>;
  repaired: ShipComponentId[];
} {
  const updates: Partial<Record<ShipComponentId, number>> = {};
  const repaired: ShipComponentId[] = [];
  for (const id of AUTO_REPAIR_COMPONENTS) {
    const component = ship[id];
    if (component.strength > 0 && component.condition < 9) {
      updates[id] = Math.min(9, component.condition + AUTO_REPAIR_REGEN);
      repaired.push(id);
    }
  }
  return { updates, repaired };
}
