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
 *  tier-5→3). Reader: components.ts `weaponVolleyDamage`, consumed by combat.ts.
 *
 *  CANONICAL (T-1603c, 2026-07-26, memo §10): RATIFIED at 20. This divisor is the
 *  sweep's `prepared` axis — `packages/sim/src/index.ts` records an encounter as
 *  prepared iff `weaponVolleyDamage(pre-action ship) > 1`, which is exactly "the
 *  gun is better than the junker's". Moving it would have redefined the axis the
 *  before/after tables are cut on mid-tuning, making Flag 3 ungradeable. Measured
 *  where it stands: preparation now saves 51.5% of the credit cost of a
 *  below-parity encounter on the Tour One arm (was 32.0%) and 66.4% on the veteran
 *  arm (was 55.3%) — where it now EXCEEDS the above-parity saving of 64.1%, which
 *  is Flag 3 inverted rather than merely narrowed. */
export const WEAPON_DAMAGE_DIVISOR = 20;

/** shields → condition points absorbed off an incoming enemy hit. Junker shields
 *  (score 1) absorb 0; each +15 of effective score absorbs one more point
 *  (tier-3→1, tier-5→3). Reader: components.ts `shieldMitigation`, consumed by
 *  combat.ts `applyEnemyPressure`.
 *
 *  CANONICAL (T-1603c, 2026-07-26, memo §10/§12): held at 15 through the combat
 *  tuning pass. The T-1603c tier-gap bonus raises the raw hit an outgunning
 *  interceptor lands from 1 to 1+gap, and mitigation is subtracted from that raw
 *  — so the divisor is exactly the dial that decides how much of the new
 *  below-parity pressure a refitted ship shrugs off. Moving it would have changed
 *  preparation's payoff and the gap bonus's bite at the same time, making neither
 *  gradeable; the gap bonus was moved alone and this held. */
export const SHIELD_MITIGATION_DIVISOR = 15;

/**
 * Enemy-fire targeting weights — the relative chance a landed interceptor hit
 * strikes the HULL versus any one of the seven fitted systems.
 *
 * Two scalars rather than a keyed table on purpose: `ShipComponentId` is an
 * ENGINE type (`packages/engine/src/types.ts`) and content must not depend on the
 * engine. The engine already owns the `DAMAGE_COMPONENTS` list (combat.ts) and
 * builds the weighted table from these two numbers, so content stays data.
 *
 * T-1603c, memo §12. T-1205 replaced foundation's fixed vandalism cascade with a
 * UNIFORM 1-in-8 pick. The uniform pick made the killing blow arithmetically
 * unreachable: a junker hull starts at 9 condition, an ordinary hit removes 1, so
 * a kill needed ~72 landed hits against encounters that run 2–4 rounds — one
 * combat defeat in 34,000+ encounters across both sweep arms
 * (`docs/balance/BASELINE-T-1603a.md` §4 "the arithmetic").
 *
 * MAGNITUDE — measured, not guessed. With eight components the hull share is
 * `w / (w + 7)`. Three values were driven through the SAME 105-run / 6,300-sim-day
 * tuning cut (seeds 1..15 x the seven sweep policies x 60 days) with
 * TIER_GAP_DAMAGE_BONUS held at 1:
 *   w = 3 (hull 30%) → 0.63 fleet deaths / 1,000 sim days, and ZERO life-support
 *                      events anywhere in the cut;
 *   w = 4 (hull 36%) → 0.95 deaths / 1,000 days, and the life-support gate is
 *                      reached again in the 120-day cut (1 failure, 3 scares);
 *   w = 5 (hull 42%) → 0.79 deaths / 1,000 days, and preparation's payoff when
 *                      outgunned fell BACKWARDS on the same cut (46.2%, against
 *                      49.4% at w = 4 and 52.7% at w = 3) — past this point the
 *                      hull dies faster than a refit can matter, so raising the
 *                      weight further re-opens Flag 3 in order to close Flag 4.
 * 4 is therefore the interior value: the smallest weight that lifts the fleet death
 * rate into the memo's target band ON THAT CUT without eroding the preparation
 * criterion. NO component is removed from the table — life support, the
 * slow-attrition death path, stays reachable at 1/11 = 9.1% a hit.
 *
 * Reader: engine combat.ts `damageComponentForHit`, consumed by
 * `applyEnemyPressure`. Covered by `engine/__tests__/combat-property.test.ts`
 * (distribution + rounds-to-kill) and `engine/__tests__/encounter.test.ts`.
 */
export const HULL_DAMAGE_WEIGHT = 4;
export const SYSTEM_DAMAGE_WEIGHT = 1;

/** navigation → additive PILOT-check bonus on travel and off-lane explore. Junker
 *  navigation (score 10) adds 0; each +10 above the junker score adds one
 *  (tier-3→2). Reader: components.ts `navBonus`, consumed by travel.ts /
 *  exploration.ts. */
export const NAV_BONUS_DIVISOR = 10;

/**
 * T-1605 · Navigation as a DETERMINISTIC fuel discount.
 *
 * Navigation used to exist only as a `+bonus` on the pilot check that decided
 * whether a jump happened at all. That check is gone (see engine
 * `actions/travel.ts`): a jump now always arrives, because a game must not take
 * a full tank of fuel and a turn and hand back nothing. Measured before the
 * change: 34% of jumps failed even when the player spent their BEST die, and
 * 31% of all fuel spend bought no movement whatsoever.
 *
 * So navigation keeps its meaning by moving from a 1-in-3 coin flip to every
 * single jump: each full point of effective nav score above the junker's 10
 * shaves this fraction off the per-unit burn, to a floor of NAV_FUEL_FLOOR.
 * Upgrading is now felt continuously instead of being invisible until it is not.
 */
export const NAV_FUEL_DISCOUNT_PER_POINT = 0.03;

/** Most that navigation alone can cut off a jump (drives do the heavy lifting). */
export const NAV_FUEL_FLOOR = 0.6;

/**
 * What a JUNKER's navigation (effective score 10) multiplies a jump's burn by.
 *
 * Removing the pilot check gave the player back everything the failed jumps used
 * to cost, and the balance sweep caught the overshoot immediately: the trader's
 * median debt-clear moved to day 21 against a design band of [22, 30]. This
 * restores that friction as a PRICE rather than a coin flip — a green pilot in a
 * junker burns more getting where they are going, every time, predictably, and
 * flying better equipment is what makes it cheaper. Tuned against
 * `balance-targets.test.ts` (40 seeds x 3 policies x 35 days), not guessed.
 */
export const NAV_FUEL_JUNKER_PENALTY = 1.0;

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
 *  dangerous." Reader: components.ts `lifeSupportCritical` gate + day.ts.
 *
 *  CANONICAL (T-1603c, 2026-07-26, memo §10/§13 Flag 5): RATIFIED at 10, and
 *  ratified only NOW because until T-1603c it could not honestly be graded. The
 *  T-1804 ordering in day.ts ran the AUTO_REPAIR regen BEFORE this gate, so any
 *  ship carrying the module never rolled the save at all and the DC governed only
 *  the module-less half of the fleet. T-1603c moved the regen after the gate, so
 *  the DC is now live for EVERY ship, and it is held where it stands: at GRIT 1 a
 *  spacer saves on 9+ (55%), at GRIT 4 on 6+ (75%) — dangerous, survivable, and
 *  worth refitting away from. `components.test.ts` pins that BOTH branches are
 *  reachable with the module fitted, which is the reader-proof this ratification
 *  rests on. */
export const LIFE_SUPPORT_SURVIVAL_DC = 10;

/**
 * T-1206 · Special-equipment reader tuning — DATA for the four purchasable,
 * renown-gated modules (CLOAKER / AUTO_REPAIR / STAR_BUSTER / ARCH_ANGEL) that
 * v0.1 made *reachable* but wired to no rule. Each constant below is read by the
 * named engine reader that finally makes its module load-bearing. Same
 * baseline-subtraction discipline as the component block above: a ship WITHOUT
 * the module reproduces the pre-T-1206 numbers exactly (the flags default false),
 * so no existing golden moves.
 */

/** STAR_BUSTER → extra hull points a WINNING fight volley removes when the
 *  Star-Buster siege weapon is fitted, on top of `weaponVolleyDamage`. FOUNDATION
 *  (f2f95fa9:foundation/lore/User-Manual.md §"Star-Buster") makes STAR-BUSTER++
 *  the top-tier weapon; foundation had no d20 combat resolver, so the magnitude is
 *  engine-original tuning (PRD-REIMAGINED wins on numbers; T-1603 owns canonical
 *  targets). Reader: components.ts `weaponVolleyDamage`, consumed by combat.ts
 *  `resolveCombat` fight branch.
 *
 *  CANONICAL (T-1603c, 2026-07-26, memo §10): RATIFIED at 2. It shortens fights,
 *  which under the T-1603c levers is now worth strictly more than it was — fewer
 *  rounds is fewer landed enemy hits at the new hull weighting — so the module got
 *  better without its number moving. Nothing in either arm asked for a change. */
export const STAR_BUSTER_VOLLEY_BONUS = 2;

/** ARCH_ANGEL → the shield-mitigation FLOOR the Arch-Angel guarantees regardless
 *  of the fitted shield tier. Must be <= MAX_SHIELD_MITIGATION (2, in engine
 *  components.ts) so a nat-20 still penetrates for >= 1 and the T-1205 "hull
 *  damageable on any round" invariant survives. FOUNDATION makes ARCH-ANGEL++ the
 *  top shield; magnitude is engine-original tuning. Reader: components.ts
 *  `shieldMitigation`, consumed by combat.ts `applyEnemyPressure`.
 *
 *  CANONICAL (T-1603c, 2026-07-26, memo §10): RATIFIED at 2. The invariant it must
 *  respect was RE-DERIVED rather than re-asserted: with the tier-gap bonus, the
 *  raw hit is `(nat20 ? 3 : bigMargin ? 2 : 1) + TIER_GAP_DAMAGE_BONUS * gap`, so
 *  the nat-20 FLOOR is 3 (at gap 0) and rises with the gap. 2 therefore still sits
 *  strictly below every possible nat-20 raw, with more headroom than before, not
 *  less. Pinned by `engine/__tests__/components.test.ts`. */
export const ARCH_ANGEL_MITIGATION_FLOOR = 2;

/** AUTO_REPAIR → condition points restored to each damaged component at dusk.
 *  PORTED FROM f2f95fa9:foundation/rules/combat.ts `applyAutoRepair` (the
 *  `condition + 1` regen path). Reader: components.ts `autoRepairRegen`, consumed
 *  by day.ts `endDay`.
 *
 *  CANONICAL (T-1603c, 2026-07-26, memo §12): the MAGNITUDE is RATIFIED at 1 — it
 *  is a foundation port and there was never a case for moving it. What T-1603c
 *  changed is the module's ORDERING in `day.ts`, not its strength: the regen now
 *  runs AFTER the life-support survival gate instead of before it, so Auto-Repair
 *  no longer switches the life-support death path off. See the design-call block
 *  at that call site in `packages/engine/src/day.ts` for the full rationale, and
 *  `LIFE_SUPPORT_SURVIVAL_DC` above for what the change made gradeable. */
export const AUTO_REPAIR_REGEN = 1;

/** CLOAKER → multiplier applied to the realized encounter chance when Morton's
 *  Cloaking Device is fitted. PORTED-IN-SPIRIT from f2f95fa9:foundation/rules/
 *  combat.ts `attemptCloakDuringTravel`. DIVERGENCE: foundation fully SKIPPED the
 *  fight for cargo/smuggling runs when cloaked; the engine expresses "the ship
 *  slips past" as a probabilistic reduction of the realized encounter rate so some
 *  encounters still fire (PRD wins on numbers). Value is engine-original tuning;
 *  T-1603 owns canonical targets. Reader: travel.ts `generateEncounter`.
 *
 *  CANONICAL (T-1603c, 2026-07-26, memo §10): RATIFIED at 0.4. Like the
 *  Star-Buster, the module got BETTER without its number moving — avoiding 60% of
 *  interdictions is worth more now that an interdiction costs more. It is also,
 *  deliberately, still not a skip: PRD-REIMAGINED wins over foundation's outright
 *  fight-skip, and at 0.4 a cloaked ship still gets caught often enough that the
 *  Nemesis and grudge systems keep their hooks in a cloaked career. */
export const CLOAK_ENCOUNTER_MULTIPLIER = 0.4;
