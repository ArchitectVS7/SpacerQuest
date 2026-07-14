/**
 * Combat balance constants — DATA, consumed by the engine's combat resolver.
 *
 * These live in content (not in engine logic) per the TECH-STACK standing
 * constraint that balance numbers are data. The engine cannot import from
 * `foundation/` (a frozen, non-compiling reference tree — not a workspace), so
 * `@spacerquest/content` is the sanctioned home for numbers the engine reads.
 */

import { AnonymousInterceptorKind } from './cast.js';

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

/**
 * Tribute class modifier (T-1207). FOUNDATION RESTORE (f2f95fa9 combat.ts:1271-1273,
 * original SP.FIGHT1.S:227-228 `if sk=5 kc=(kc/2)` / `if sk=4 kc=kc*2`): a Brigand
 * (foundation kind 5) HALVES the demanded tribute — they are petty shakedown
 * artists who take what little they can get; a Reptiloid (foundation kind 4)
 * DOUBLES it — an alien predator that extorts hard. These modifiers were dropped
 * (uncommented) in the redesign; T-1207 restores them. Applied after the base
 * round schedule and re-capped at TRIBUTE_MAX. Consumed by engine combat.ts
 * `tributeForRound`.
 *
 * FOUNDATION DIVERGENCE: foundation ALSO doubled tribute for `pz>10` (a
 * high-roster-index pirate). That clause is deliberately NOT ported — in the
 * redesign `rosterIndex` is an identity/matchmaking key, not a demand rank, and
 * T-1207 scopes the modifier to interceptor CLASS only. The remaining classes
 * (PIRATE / PATROL / RIM_PIRATE) and every named interceptor (which carries no
 * `kind`) take the unmodified schedule (×1).
 */
export const TRIBUTE_CLASS_MULTIPLIER: Record<AnonymousInterceptorKind, number> = {
  BRIGAND: 0.5,
  REPTILOID: 2,
  PIRATE: 1,
  PATROL: 1,
  RIM_PIRATE: 1,
};

/**
 * The player's kill-pressure advantage on an enemy's post-kill retreat roll
 * (T-1207, PRD §7.4). DATA, consumed by engine combat.ts. When a fight volley
 * would destroy the interceptor, the enemy makes an opposed PILOT retreat check
 * against the player's PILOT + this edge; a losing interceptor almost never
 * slips a lost fight, so escape is reserved for a strong enemy roll or a natural
 * 20 (the "miracle burn at Deneb-4" wire beat). Tuned so a PILOT-1 rank-and-file
 * interceptor escapes only on that miracle — ordinary kills still read as
 * `defeated`.
 *
 * FOUNDATION DIVERGENCE (f2f95fa9): foundation had no post-kill enemy retreat;
 * a defeated ship was simply destroyed. The opposed retreat is engine-original
 * per PRD §7.4.
 *
 * TUNING: a natural 20 ALWAYS escapes (check() auto-success is edge-independent)
 * — that is the guaranteed miracle burn. This edge governs only the NON-nat
 * escapes. At 15 a PILOT-1 rank-and-file interceptor needs to roll near-max
 * while the player rolls low (a freak, on top of the ~5% nat-20), so ordinary
 * kills read `defeated`; a strong-PILOT interceptor (e.g. a Reptiloid at PILOT 5)
 * still slips a lost fight on a genuinely strong roll, matching PRD §7.4's "a
 * strong roll or a nat-20 does".
 */
export const RETREAT_KILL_EDGE = 15;
