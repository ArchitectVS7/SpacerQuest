/**
 * Ship-component reader tuning constants — DATA, consumed by the engine's
 * component readers (packages/engine/src/components.ts). T-1205 wires each of the
 * eight ship components to a named gameplay reader; the divisors below decide how
 * strongly an UPGRADED component diverges from the junker baseline.
 *
 * These live in content (not engine logic) per the TECH-STACK standing constraint
 * that balance numbers are data. The engine cannot import from `foundation/` (a
 * frozen, non-compiling reference tree), so `@spacerquest/content` is the
 * sanctioned home for the numbers the engine reads.
 *
 * BASELINE-SUBTRACTION DESIGN: every engine reader is defined as a monotonic
 * function of foundation's `component_score` = strength*(condition+1)/10 with the
 * junker's starting score subtracted out, so a FRESH JUNKER reproduces the exact
 * numbers the pre-T-1205 code produced (weapons chip 1/volley, shields mitigate 0,
 * nav bonus 0, single-repair +1 condition). The divisors here only move the needle
 * once a component is actually upgraded above the junker fit.
 *
 * FOUNDATION (f2f95fa9:foundation/lore/User-Manual.md §4.6/§4.7) defines the
 * component ROLES this task honors — weapons=attack, shields=absorb-before-hull,
 * navigation=course accuracy, robotics=Battle Computer/repair, cabin=crew, life
 * support="damaged life support is dangerous." Foundation never expressed those
 * roles as these exact divisor formulas (it had no d20 combat resolver), so the
 * specific curves are engine-original tuning, not a ported constant. PRD-REIMAGINED
 * wins on numbers; T-1603 owns canonical balance targets — these are the starting
 * values chosen so a tier-3 refit is clearly felt and a tier-5 is strong.
 */

/** weapons → per-winning-volley hull damage. Junker weapons (score 1) chip 1;
 *  each +20 of effective score adds another point of volley damage (tier-3→2,
 *  tier-5→3). Reader: components.ts `weaponVolleyDamage`, consumed by combat.ts. */
export const WEAPON_DAMAGE_DIVISOR = 20;

/** shields → condition points absorbed off an incoming enemy hit. Junker shields
 *  (score 1) absorb 0; each +15 of effective score absorbs one more point
 *  (tier-3→1, tier-5→3). Reader: components.ts `shieldMitigation`, consumed by
 *  combat.ts `applyEnemyPressure`. */
export const SHIELD_MITIGATION_DIVISOR = 15;

/** navigation → additive PILOT-check bonus on travel and off-lane explore. Junker
 *  navigation (score 10) adds 0; each +10 above the junker score adds one
 *  (tier-3→2). Reader: components.ts `navBonus`, consumed by travel.ts /
 *  exploration.ts. */
export const NAV_BONUS_DIVISOR = 10;

/** robotics → condition restored per single-component shipyard repair. Junker
 *  robotics (score 10) restores 1; each +20 above the junker score restores one
 *  more (tier-3→2). Reader: components.ts `repairRate`, consumed by shipyard.ts. */
export const ROBOTICS_REPAIR_DIVISOR = 20;

/** cabin → crew capacity. Junker cabin (strength 1) berths 1; each full +10 of
 *  cabin STRENGTH berths one more (tier-3→4). Read off raw strength, not the
 *  condition-scaled score, because berths do not shrink when the cabin is dinged.
 *  Reader: components.ts `crewCapacity`; the T-1306 socket for real crew rules,
 *  surfaced in the UI ship pane now. */
export const CREW_PER_CABIN_STRENGTH = 10;

/** lifeSupport → the GRIT survival check DC rolled at dusk when life support has
 *  been driven to condition 0 (only reachable now that enemy fire can target it,
 *  T-1205 seeded damage). Passing it is a scare; failing it loses the ship to a
 *  life-support failure (day.ts, reusing the T-108 succession path). DC 10 is a
 *  coin-flip-ish save for a starting spacer (GRIT 1 → needs 9+) — dangerous but
 *  not a death sentence, matching foundation's "damaged life support is
 *  dangerous." Reader: components.ts `lifeSupportCritical` gate + day.ts. */
export const LIFE_SUPPORT_SURVIVAL_DC = 10;
