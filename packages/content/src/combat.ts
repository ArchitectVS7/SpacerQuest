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
 *
 * CANONICAL (T-1603c, 2026-07-26, memo §10/§11): RATIFIED at 10 / 50. The
 * line-item split of `combatCost` across the full 3,500-career Tour One arm shows
 * exactly what these buy: FIGHT_FUEL_COST is the dominant cost of a PREPARED
 * encounter (599 of 778 credits in the below/prepared cell) while tribute is the
 * dominant cost of an UNPREPARED one. That is the shape the game wants — the two
 * ways out of an interdiction cost different currencies — so the pair was
 * ratified and the parity SHAPE of the bill was moved instead (see
 * TRIBUTE_TIER_GAP_STEP below). Raising these would have widened every cell
 * roughly equally and graded nothing. The 5:1 ratio is the load-bearing part:
 * running is cheap and fighting is a commitment, which is what makes the stance a
 * decision. Reader: engine combat.ts `resolveCombat`.
 */
export const RUN_FUEL_COST = 10;
export const FIGHT_FUEL_COST = 50;

/**
 * Enemy hit severity — the margin band that upgrades an ordinary hit, and the
 * per-tier bonus an interceptor that OUTRANKS the player adds on top.
 *
 * T-1603c, memo §11/§12. Before this pass every rank-and-file interceptor bit
 * exactly 1 condition a hit regardless of who it was hunting, so the parity axis
 * of the balance table barely separated: below-parity encounters cost only 1.19x
 * (Tour One) / 1.29x (veteran) what above-parity ones did, and preparation saved
 * only 32% when outgunned against 62% when outranking — the gun helped you punish
 * the weak more than it helped you survive the strong
 * (`docs/balance/TUNING-T-1603.md` §6, Flag 3).
 *
 * WHAT THIS LEVER DOES, stated honestly after the fact. It is added to `raw`
 * BEFORE `shieldMitigation` is subtracted, so:
 *   - hull time-to-kill in below-parity fights roughly halves → combat can KILL
 *     again, which is this constant's real job and the finding it closes;
 *   - shields subtract from exactly that raw, so a refitted ship eats the extra
 *     and an unprepared junker (mitigation 0) does not → the refit is felt where
 *     it should be felt.
 * What it does NOT do, and the plan for this task assumed it would: it does not
 * meaningfully move combat's CREDIT cost. Repairs are ~1% of an encounter's bill
 * across the measured fleet (see TRIBUTE_BASE_MULTIPLIER below), because sim
 * policies almost never buy repairs — so doubling the damage doubles ~10 credits.
 * The parity axis of the EV table is moved by TRIBUTE_TIER_GAP_STEP instead. Both
 * levers are kept: this one makes combat dangerous, that one makes it expensive.
 *
 * MAGNITUDE — measured, not guessed. `chooseTargetTier` (engine travel.ts) bands
 * the interceptor to [playerTier−1, playerTier+1], so in the `below` bucket the
 * gap is ALWAYS exactly 1. This is therefore a x2 lever on the base hit, not an
 * open-ended one. Both candidate values went through the same 105-run /
 * 6,300-sim-day tuning cut (seeds 1..15 x the seven sweep policies x 60 days):
 *   1 → below/above cost spread 1.47x, preparation saving when outgunned 53%;
 *   2 → below/above cost spread 1.31x, preparation saving when outgunned 47%.
 * 2 is WORSE on both counts, which is counter-intuitive enough to be worth
 * recording: at raw 3 an ordinary below-parity hit already carries nat-20
 * severity, so it saturates the MAX_SHIELD_MITIGATION cap of 2 and a refit can no
 * longer buy back a proportional share of the hit — the lever stops discriminating
 * exactly where it is supposed to discriminate hardest. 1 keeps a rank-and-file
 * below-parity hit inside the band a tier-3 refit can meaningfully soften
 * (mitigation 1 of raw 2).
 *
 * `BIG_HIT_MARGIN` was hard-coded in the engine (combat.ts) before this pass and
 * is lifted here under standing constraint 4 (balance numbers are data). Held at
 * 10: `margin = die + interceptorGUNS − (10 + playerGRIT)`, so it stays out of
 * reach for the low-GUNS rank-and-file and only strong guns or a nat-20 land the
 * deeper hit. Ratified rather than moved because the gap bonus now supplies the
 * below-parity severity that a lower threshold would otherwise have had to.
 *
 * Reader: engine combat.ts `applyEnemyPressure`. Covered by
 * `engine/__tests__/combat-property.test.ts`, `engine/__tests__/encounter.test.ts`
 * and `sim/__tests__/balance-combat-survival.test.ts`.
 */
export const TIER_GAP_DAMAGE_BONUS = 1;

/**
 * Credits a DESTROYED interceptor's wreck yields, per tier of the interceptor.
 *
 * THE PROBLEM THIS EXISTS TO FIX, measured 2026-07-28. Until now `resolveEncounter`
 * granted no credits under any resolution, so `combatEv` was ≤ 0 **by construction**
 * — the engine paid nothing for winning a fight, ever. That was survivable only
 * because a second defect was quietly paying for the guns: the yard's trade-in
 * ladder was indexed by component STRENGTH rather than by owned TIER, which made
 * every mid-ladder upgrade free (see `YARD_COMPONENT_TRADE_IN` in upgrades.ts).
 * Fixing that exposed the real shape of the fighter's economy — its median career
 * credits fell from 155,059 to **2,825**, i.e. to its own operating reserve, because
 * it spends its surplus on a fit that cannot pay for itself. An archetype whose
 * whole strategy is combat cannot be solvent in a game where combat has no income.
 *
 * WHY 150/TIER, and why that number is not invented here. The engine ALREADY prices
 * a combat win at exactly `150 * tier` — on the NPC side, in `npc.ts` `executeCombat`,
 * where the comment reads "150×tier keeps fighting a living, not a money printer,
 * next to the shared contract-payment formula." That figure was calibrated against
 * the same contract economy the player flies. Paying the player's victories at the
 * NPC rate makes one fiction priced one way for both sides of it, rather than
 * inventing a second scale.
 *
 * SCOPE — deliberately narrow. Paid ONLY on `'defeated'`: you broke the ship, you
 * take the wreck. A `'interceptor-escaped'` win pays nothing (it flew away under its
 * own power; there is no wreck), and `'talked-down'`/`'escaped'` are exits, not
 * victories. This keeps the T-1603c combat table untouched — it adds a payout term,
 * it does not retune a cost term.
 *
 * READERS: `engine/actions/combat.ts` `resolveEncounter` (the grant, stamped onto
 * `EncounterResolved.salvageCredits`), and `sim/balance/aggregate.ts` `combatEv`,
 * which now subtracts cost from salvage instead of reporting a negated cost.
 */
export const COMBAT_SALVAGE_PER_TIER = 150;
export const BIG_HIT_MARGIN = 10;

/**
 * Tour One encounter damping — the realized encounter chance during the TOUR_ONE
 * era is `routeDangerChance * TOUR_ONE_ENCOUNTER_MULTIPLIER`.
 *
 * T-1103 introduced it as INTERIM and named T-1603 as the owner of the canonical
 * value; T-1603b handed it to T-1603c as combat pacing (`TUNING-T-1603.md` §7).
 *
 * CANONICAL (T-1603c, 2026-07-26, memo §12d): RATIFIED at 0.5, and moved from
 * engine `travel.ts` into content because a balance number is data.
 *
 * The evidence for RATIFYING rather than moving it is indirect, and is stated that
 * way rather than dressed up: the T-1603c levers already made a Tour One
 * interdiction materially more dangerous AND more expensive at the SAME rate of
 * interdictions, and that alone took the trader's Tour One debt-clear rate from
 * 86.2% to 79.0% across the 3,500-career arm (median clear day 23 -> 24, still
 * inside the T-1603b-guarded [22, 30]). This multiplier is the term that decides
 * how MANY of those encounters a Tour One career sees, so raising it would
 * compound a cost that has just gone up; no alternative value was swept, because
 * the direction is not in doubt and a tuning pass tunes inside the previous pass's
 * guard rails. It is the counterweight that keeps the guarded band intact.
 *
 * HONEST TENSION, recorded rather than fixed here: PRD-REIMAGINED §"Tour One"
 * (line 73) authors the onboarding arc around exactly ONE full combat, while the
 * measured Tour One arm sees ~5.2 encounters per 35-day career. 0.5 is already a
 * compromise between the authored beat and foundation's 0.30/0.40 table; closing
 * that gap properly is an encounter-authoring question (which jumps are supposed
 * to be dangerous), not a multiplier.
 *
 * PRD-REIMAGINED wins over foundation numbers (standing constraint 5): foundation
 * has no era-scaled encounter rate at all.
 *
 * Reader: engine travel.ts `generateEncounter`; the multiplier rides on
 * `state.era`, which day.ts flips TOUR_ONE→VETERAN at the day-30 resolution. No
 * new GameState field. Covered by `engine/__tests__/encounter.test.ts`.
 */
export const TOUR_ONE_ENCOUNTER_MULTIPLIER = 0.5;

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
 *
 * CANONICAL (T-1603c, 2026-07-26, memo §10/§11): both RATIFIED — and the
 * measurement that ratified them is the one that reshaped this whole task.
 * `tributeCredits` turns out to be ~95% of what an UNPREPARED encounter costs
 * (1,011 of 1,061 credits in the below/unprepared cell of the 3,500-career Tour
 * One arm, against 25 of fuel and 10 of repairs), because the sim fleet's
 * unprepared spacers talk and pay rather than fight. So the base and the cap are
 * not a minor line — they ARE the price of combat for most careers, and moving
 * either would have moved every cell at once. What T-1603c moved instead is the
 * PARITY SHAPE of that same demand (TRIBUTE_TIER_GAP_STEP below), which is the
 * quantity the acceptance actually grades. Encounters still resolve in 2-4 rounds,
 * so the round-10 ceiling is untouched. Reader: `tributeForRound` (engine
 * combat.ts) → the UI's tribute preview (T-1402).
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
/* CANONICAL (T-1603c, 2026-07-26, memo §10): RATIFIED unchanged. These are a
 * FOUNDATION RESTORE keyed to interceptor CLASS, i.e. flavour with teeth, and the
 * tuning pass moved the parity axis instead — class and parity are independent
 * dials and moving both at once would have made neither gradeable. */
export const TRIBUTE_CLASS_MULTIPLIER: Record<AnonymousInterceptorKind, number> = {
  BRIGAND: 0.5,
  REPTILOID: 2,
  PIRATE: 1,
  PATROL: 1,
  RIM_PIRATE: 1,
};

/**
 * Tribute tier-gap escalation — the extra fraction of the demand an interceptor
 * adds for each TIER it outranks the player. T-1603c, memo §12.
 *
 * WHY THIS EXISTS, and why the T-1603c damage levers were not enough on their
 * own. T-1603c's graded criterion is that combat is worst when the player is
 * outgunned and unprepared. Splitting `combatCost` by line item across the whole
 * 3,500-career Tour One arm showed where the money actually goes, and it is not
 * where the plan assumed (memo §11):
 *
 *   cell        fuel   repair  tribute  → total
 *   below/no      25       10     1011     1061
 *   below/yes    599       44      118      778
 *   above/no       3        4      883      902
 *
 * TRIBUTE IS ~95% OF AN UNPREPARED ENCOUNTER'S BILL AND REPAIRS ARE ~1%. The
 * hull-weighting and tier-gap DAMAGE levers make combat lethal — which is what
 * they were for, and they moved the death rate from zero — but they move the
 * credit cost by about 1%, because sim policies almost never buy repairs. So the
 * parity axis of the EV table is, in practice, a TRIBUTE axis, and moving it
 * requires a tribute lever.
 *
 * WHY IT IS ALSO THE RIGHT RULE, not merely the effective one. An interceptor
 * that outranks its mark knows it, and prices accordingly; the game already
 * expresses exactly this idea through `TRIBUTE_CLASS_MULTIPLIER` (a Reptiloid
 * doubles, a Brigand halves — a FOUNDATION RESTORE). This is that same idea keyed
 * to the matchup instead of the species. It is deliberately ONE-SIDED — an
 * interceptor the player OUTRANKS does not discount — because a discount would
 * pay the player for being strong, and the fleet's wealth curve is already
 * unbraked (`TUNING-T-1603.md` §6).
 *
 * MAGNITUDE — measured, not guessed. `chooseTargetTier` (engine travel.ts) bands
 * the interceptor to [playerTier-1, playerTier+1], so the gap in the `below`
 * bucket is always exactly 1 and this is a x1.75 lever, not an open-ended one.
 * Three candidates were driven through the SAME 420-run / 14,700-sim-day tuning
 * cut (seeds 1..60 x the seven sweep policies x 35 days), with the T-1603c damage
 * levers already in place:
 *
 *   step   below/above unprepared cost ratio   preparation saving at `below`   trader clear rate
 *   0.50   1.76x                               48.9%                           83%
 *   0.75   2.03x                               54.7%                           75%
 *   1.00   2.24x                               58.2%                           73%
 *
 * (The T-1603b before-column on the same measure: 1.19x and 32.0%; the graded
 * targets are >= 1.4x and >= 50%.)
 *
 * 0.75 is the interior value: the SMALLEST step that clears BOTH graded targets.
 * 0.50 leaves the preparation criterion a point and a half short, and 1.00 buys
 * three more points of it for another eight points of the trader's Tour One clear
 * rate — a bad trade, because a tuning pass tunes INSIDE the previous pass's guard
 * rails. At 0.75 the T-1603b-guarded trader median debt-clear day is unmoved at 24,
 * inside its [22, 30] band with room on both sides.
 *
 * Reader: engine combat.ts `tributeForRound` (via `resolveTalk`), and — as a
 * CLIENT of that same function, never a reimplementation — the UI's
 * `tributeThisRound` preview (format.ts), which forwards the same tier gap so the
 * previewed demand is the demand the engine charges.
 */
export const TRIBUTE_TIER_GAP_STEP = 0.75;

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
 *
 * CANONICAL (T-1603c, 2026-07-26, memo §10): RATIFIED at 15. It governs how a WON
 * fight ends, and every T-1603c criterion is about what a fight COSTS and whether
 * it can kill the player — the two do not interact. Measured across both
 * after-arms the win rate in the three PREPARED cells sits at 75-86% (Tour One)
 * and 86-93% (veteran), so the edge is not quietly denying prepared players their
 * wins.
 */
export const RETREAT_KILL_EDGE = 15;
