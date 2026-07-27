/**
 * Dusk subsistence floor — DATA, consumed by the engine (T-1604b, fixing UGT
 * finding F2 in `docs/playtests/T-1604a-ugt-campaign.md` §7).
 *
 * PRD-REIMAGINED §"Scarcity of choices, never a poverty trap" (docs/
 * PRD-REIMAGINED.md:35) states the design law this number implements: "the world
 * provides floors: NPCs work odd jobs and small income, so **no actor in the
 * simulation, player or cast**, gets permanently trapped at zero with no move
 * left. A bad run makes a *different* game … not a dead one."
 *
 * THE ASYMMETRY THIS CLOSES. The cast already had its floor: `npc.ts` `brokeIdle`
 * pays every broke NPC `NPC_ODD_JOB_CREDITS = 25` on an idle day ("keeps broke
 * NPCs off an exact-zero pin and gives them a road back to solvency"), and the
 * flaw-loss clamp in the same file exists so "nobody gets pinned at exactly 0
 * credits." The PLAYER was the one actor in the simulation without it. The UGT
 * campaign measured the consequence: seed 20260728 sat at Mira-9 with 0 credits,
 * 29/300 fuel and an undeliverable Pollux-7 contract for **385 consecutive days**
 * — no income verb advertised, no Hangout at that system, and a hold that could
 * not be re-let. That is precisely the "dead game" the law forbids.
 *
 * SEMANTICS: A FLOOR, NOT A FAUCET. At dusk, if `credits < SUBSISTENCE_FLOOR_CREDITS`
 * the purse is raised TO the floor — never BY it. Credits can therefore never
 * exceed the floor by this rule, so it is unfarmable (there is no way to bank it)
 * and it is invisible to any solvent captain: a single contract pays 2,200+, so
 * a working career never touches this branch and every solvent dusk is
 * byte-identical to the pre-T-1604b engine.
 *
 * WHY 100. It is the game's existing "broke" line — `NPC_BROKE_CREDITS = 100`
 * (`packages/engine/src/npc.ts`), the threshold below which the cast itself stops
 * discretionary spending and takes dock work. Reusing it keeps one definition of
 * "broke" across player and cast. At a typical `localFuelPrice` it buys roughly
 * twenty units of fuel a day, so the audited trap (29 fuel, needing a neighbour
 * hop) resolves in a handful of days rather than never — a bad run becomes a
 * different game, not a dead one.
 *
 * FOUNDATION (f2f95fa9): foundation has NO subsistence, odd-jobs or dole rule for
 * the player — there is no such verb anywhere in `foundation/rules/`. So this
 * constant carries no foundation citation: it is engine-original tuning,
 * sanctioned to live here per the TECH-STACK "balance numbers are data"
 * constraint — the same justification `lending.ts` and `hangout.ts` use.
 *
 * POST-T-1603 ECONOMY NUMBER. T-1603a–c set the canonical balance targets; this
 * number was introduced AFTER that pass and its sweeps therefore never saw it.
 * That is recorded, not glossed, in `docs/BALANCE-POLICY.md` Part C (E8), per the
 * T-1804 errata precedent. It is a floor for the destitute only, so it moves no
 * canonical target — asserted by the balance suites, which run unchanged.
 *
 * READERS: the dusk floor block in `packages/engine/src/day.ts` `endDay` (the sole
 * writer), which emits `SubsistenceIncome` + a `WireEntry{kind:'plain'}`. Those
 * are consumed by the sim campaign roll-up's `subsistenceDays`
 * (`packages/sim/src/index.ts`) and by the UI wire pane through the existing
 * generic `kind:'plain'` path (`packages/ui/src/format.ts` `wireKind`).
 */

/** The credit line a captain is never left below at dusk. Raised TO, never BY —
 *  see the header for why it is a floor rather than a stipend, and why 100. */
export const SUBSISTENCE_FLOOR_CREDITS = 100;
