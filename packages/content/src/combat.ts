/**
 * Combat balance constants — DATA, consumed by the engine's combat resolver.
 *
 * These live in content (not in engine logic) per the TECH-STACK standing
 * constraint that balance numbers are data. The engine cannot import from
 * `foundation/` (a frozen, non-compiling reference tree — not a workspace), so
 * `@spacerquest/content` is the sanctioned home for numbers the engine reads.
 */

/**
 * Fuel gates (UGT Finding 2's lesson): nothing in combat that burns fuel is
 * free when the tank is short — no free volleys AND no free getaways. These are
 * engine-original tuning values; `foundation/rules/` has no run/fight fuel
 * constant to port (only `RESCUE_FUEL_COST`).
 */
export const RUN_FUEL_COST = 10;
export const FIGHT_FUEL_COST = 50;

/**
 * Tribute escalates `TRIBUTE_BASE_MULTIPLIER` cr per round and caps at
 * `TRIBUTE_MAX`. Base/max mirror `foundation/rules/constants.ts:190-193`
 * (original SP.FIGHT1.S:227 `kc=(kg*1000):if kg>12 kc=10000`).
 *
 * INTENTIONAL DIVERGENCE from foundation's `enemyDemandsTribute`: the engine
 * applies the cap as `min(round * base, max)`, so tribute reaches the 10,000
 * ceiling at round 10 and stays there. Foundation's function only caps for
 * `rounds > 12`, so it yields 11,000 at round 11 and 12,000 at round 12 —
 * values that exceed its own stated 10,000 maximum (foundation's own comment at
 * `foundation/rules/combat.ts` flags 12,000 > 10,000 as an inconsistency). The
 * engine keeps the cleaner monotonic-capped schedule.
 */
export const TRIBUTE_BASE_MULTIPLIER = 1000;
export const TRIBUTE_MAX = 10_000;
