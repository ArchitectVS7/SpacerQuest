/**
 * Disposition tuning — DATA, consumed by the engine (T-1204 "Disposition with
 * teeth", PRD §6 "They remember").
 *
 * These numbers give `npc.disposition` real consumers. Before T-1204 the value
 * was written but read only by storylet triggers and one dusk bond hook: the
 * tribute/talk DC was flat `10 + tier`, interceptor selection was uniform, and a
 * −1/dusk decay swamped every gain (measured max +1 over 4×300 sim days). The
 * constants below wire disposition into three engine readers — interceptor
 * SELECTION (grudges hunt you, friends pass you by), the tribute/talk DC ("this
 * is personal"), and a rebalanced DECAY — plus the typed per-profile Bond hook.
 *
 * FOUNDATION (f2f95fa9): foundation has NO per-NPC player-disposition system to
 * port (T-106 invented disposition; the whole mechanic is engine-original), so
 * these carry no foundation citation — they are engine tuning, sanctioned to
 * live here per the TECH-STACK "balance numbers are data" constraint. Every
 * engine site that reads one of these comments the T-1204 divergence locally.
 */

/**
 * Signed disposition deltas a named interceptor remembers an encounter by.
 * Larger than the original (+2/−3/+1) so a single organic event survives the
 * rebalanced decay long enough to reach the Bond-hook threshold and |5| peaks:
 *   - tribute: paid off, an easy mark remembered fondly.
 *   - defeat:  you shot their ship out from under them — a serious grudge. At
 *     −5 a SINGLE organic combat defeat reaches the acceptance's |disposition|
 *     ≥ 5 peak, and the interception grudge-weighting (below) then makes the
 *     wronged NPC re-hunt the player.
 *   - playerFled: the player ran and the interceptor kept the field — mild
 *     relief, a small mark in the player's favor.
 *   - contractSniped: an NPC who undercut the player on a board contract logs a
 *     small rival grudge.
 */
export const DISPOSITION_DELTAS = {
  tribute: 3,
  defeat: -5,
  playerFled: 2,
  contractSniped: -1,
} as const;

/**
 * Decay moves one step toward 0 every Nth dusk (not every dusk). The original
 * every-dusk −1 erased every organic gain before it could reach a threshold; a
 * slower step lets a paid-off / storylet-bonded NPC hold their standing across
 * several days so repeated interactions accumulate. Reader: the periodic decay
 * loop in engine `day.ts` (endDay), keyed to `state.day % N` (no new save field).
 */
export const DISPOSITION_DECAY_INTERVAL_DAYS = 3;

/**
 * Interceptor-selection weighting (engine `travel.ts` selectEncounterInterceptor).
 * A named candidate's pick weight is `1 + GRUDGE_WEIGHT × max(0, −disposition)`
 * for grudges (they hunt you) and `max(MIN_WEIGHT, 1 − FRIEND_WEIGHT × disposition)`
 * for favor (friends pass you by). Anonymous candidates always weight 1. The
 * weighting only reorders picks WITHIN a single already-chosen tier pool, so it
 * never perturbs the tier-band matchmaking invariant.
 */
export const INTERCEPT_GRUDGE_WEIGHT = 1.5;
export const INTERCEPT_FRIEND_WEIGHT = 0.15;
export const INTERCEPT_MIN_WEIGHT = 0.1;

/**
 * Tribute/talk DC term (engine `combat.ts` resolveTalk). The talk-down DC gains
 * `−TALK_DC_PER_DISPOSITION × interceptorDisposition`: a grudge (negative) RAISES
 * the DC ("this is personal — buying him off is brutal", the unbuilt v0.1 T-104
 * Rattlesnake beat), favor (positive) LOWERS it (a friend cuts you a deal).
 */
export const TALK_DC_PER_DISPOSITION = 1;

/** The two mechanical beats a bonded NPC can perform at dusk. */
export type BondBeat = 'drive-off' | 'fuel-gift';

/**
 * A typed character hook keyed to a profile's Bond (T-1204). Replaces the bare
 * inline `disposition >= 5` + hardcoded DCs that used to live in `day.ts`: the
 * beat an NPC performs, the disposition it activates at, and its roll DC are now
 * DATA on the profile, so an NPC does the intervention THEIR bond implies.
 */
export interface BondHook {
  /** Which dusk intervention this NPC performs when bonded and co-located. */
  beat: BondBeat;
  /** Disposition at/above which the hook is live. Lower than the old bare 5 so
   *  the storylet-driven bond path (e.g. Doc Salvage) can reach it organically
   *  before the rebalanced decay pulls the NPC back toward neutral. */
  activateAt: number;
  /** d20 + rescuer GRIT vs this. */
  dc: number;
  /** fuel-gift: units transferred to the player. */
  fuelAmount?: number;
  /** fuel-gift: fires when player fuel is at/below this. Broadened from the old
   *  dry-tank-only (=== 0) so a "running low" mayday — not just a dead stop —
   *  reaches it, which is what makes the beat organically triggerable. */
  lowFuelThreshold?: number;
  /** fuel-gift: the rescuer only answers if they can spare this much fuel. */
  minRescuerFuel?: number;
}
