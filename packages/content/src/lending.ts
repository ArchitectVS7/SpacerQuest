/**
 * Penny Wise lending tuning — DATA, consumed by the engine (T-1304 "Penny Wise
 * lending", PRD §7.5: "a quiet word with Penny Wise, who lends at rates that
 * become their own quest line" — one of the bad day's three outs).
 *
 * A player at a `hasHangout` system can borrow credits at Penny Wise's desk:
 * principal advanced up front, per-dusk interest accruing to the loan (never to
 * credits — debt is a ledger, never negative money), a repay action, and default
 * consequences that are READ — a disposition hit against `npc-penny-wise` (fed to
 * the interceptor grudge-weighting) and a collection flag (loan.status ===
 * 'defaulted') the encounter generator reads to raise interdiction odds. These
 * numbers are the balance knobs for all of that.
 *
 * FOUNDATION (f2f95fa9): foundation has NO lending / loan mechanic of any kind —
 * Penny Wise exists only as a trader in the cast, and there is no borrow verb
 * anywhere. So these constants carry no foundation citation: they are
 * engine-original tuning, sanctioned to live here per the TECH-STACK "balance
 * numbers are data" constraint — the same justification `hangout.ts` and
 * `disposition.ts` use. They are INTERIM and OWNED BY the T-1601 rebalance (which
 * lists T-1304 in its `after`); do not enshrine them as canonical.
 *
 * READERS: the borrow/repay resolver (`packages/engine/src/actions/hangout.ts`),
 * the per-dusk accrual + default flip in the day loop (`day.ts` endDay), the
 * default-flag encounter reader (`actions/travel.ts` generateEncounter), and the
 * grudge-weighting via the disposition hit (`travel.ts` chooseWeighted). Surfaced
 * to the player by T-1404 (Penny Wise's desk pane).
 */

/** The lender of record. Loans key their disposition hit / grudge to this id;
 *  the desk is available at any Hangout (Penny Wise is the lender, not a
 *  co-located NPC), so the §7.5 "quiet word with Penny Wise" out is reliable. */
export const LENDER_ID = 'npc-penny-wise';

/** Per-dusk interest, applied to the ORIGINAL principal (simple interest, not
 *  compounding): each dusk adds `ceil(principal * LOAN_DAILY_RATE)` to the
 *  outstanding balance. 0.05 ≈ 5%/dusk — steep enough to bite over a term,
 *  gentle enough that a productive trader can clear it. Interim (T-1601). */
export const LOAN_DAILY_RATE = 0.05;

/** Term in dusks. The loan comes DUE `LOAN_TERM_DAYS` dusks after it is taken;
 *  crossing the due day unpaid flips it to `defaulted`. Interim (T-1601). */
export const LOAN_TERM_DAYS = 15;

/** Principal band. The floor comfortably covers the §7.5 ~500-credit bad-day gap
 *  and the cheapest starter jump's fuel bill; the ceiling caps a single advance.
 *  A borrow request is clamped into [MIN, MAX]. Interim (T-1601). */
export const LOAN_MIN_PRINCIPAL = 250;
export const LOAN_MAX_PRINCIPAL = 5000;

/** Disposition Penny Wise moves by on a DEFAULT (negative — a stiffed lender
 *  remembers). Sized like |DISPOSITION_DELTAS.defeat| (−5): defaulting on Penny
 *  Wise is as memorable a grudge as shooting someone's ship out from under them,
 *  so the interceptor grudge-weighting (travel.ts chooseWeighted) makes her far
 *  likelier to BE your interceptor. Applied exactly once at the default flip.
 *  Interim (T-1601). */
export const LOAN_DEFAULT_DISPOSITION = -5;

/** Collection pressure: while a loan is `defaulted`, the realized encounter
 *  chance is multiplied by this (>1) — the "collectors are looking for you"
 *  reader in generateEncounter (the dangerous mirror of the CLOAKER damp). The
 *  multiplier stands until the loan is repaid (which nulls it). Interim (T-1601). */
export const COLLECTION_ENCOUNTER_MULTIPLIER = 1.5;
