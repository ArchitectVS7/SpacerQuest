// ---------------------------------------------------------------------------
// Shared campaign-sim drivers.
//
// This is a plain support module (NOT a `*.test.ts` file, so vitest never
// collects it as a suite). It holds the headless drivers/helpers that more than
// one campaign spec needs, so the campaign suite can live in several sibling
// `*.test.ts` files that vitest's fork pool runs IN PARALLEL across cores —
// instead of one ~8-minute file that serializes the whole sweep and blows the
// test window. Splitting is a pure test-organisation change: every spec keeps
// its exact seeds, horizons, and assertions; nothing about coverage moves.
// ---------------------------------------------------------------------------
import {
  applyPlayerAction,
  createInitialState,
  endDay,
  SeededRng,
  startDay,
  type GameState,
} from '@spacerquest/engine';
import { DARE_MAX_MOVES_PER_HAND, planDareMove, type SimPolicy } from '../../index.js';

/**
 * The longest run of consecutive days on which the policy took NO
 * income-producing action (sign / travel-to-deliver / explore / fight-or-talk).
 * The poverty-trap invariant is that this never reaches 5 — the policy is never
 * stranded with no legal way to make progress.
 *
 * T-152 · THE DEFINITION MOVED to `../../balance/gate.ts` and is re-exported here
 * so every existing importer is untouched. The sweep gate asserts the same rule
 * (`assertNoIncomeStall`) and cannot import a `__tests__` support module from
 * `src/`, so the choice was one definition in `src/` or two copies of a threshold
 * rule — and two copies of a threshold rule is how a test and a gate come to
 * disagree about whether the same run passed.
 */
export { longestZeroIncomeStreak } from '../../balance/gate.js';

/** Drive a competent policy headlessly through the engine exactly as
 *  runCampaign does (policy plans on the fresh post-startDay day state), and
 *  return the final GameState so a test can inspect REAL ship/charts state
 *  (upgrades bought, POIs charted) rather than only the report summary.
 *
 *  A one-line delegation to {@link driveFrom} with `createInitialState(seed)` as
 *  the starting state — the loop, the rng derivation and the mid-batch-death
 *  guard all live there now, so the two drivers cannot drift. This is a pure
 *  refactor: every caller's seeds, horizons and assertions are byte-identical
 *  (asserted by the four campaign specs, which run unchanged). */
export function driveCompetentCampaign(policy: SimPolicy, seed: number, days: number): GameState {
  return driveFrom(policy, createInitialState(seed), seed, days);
}

/** {@link driveCompetentCampaign} generalized over the STARTING state (T-1605b).
 *  The poverty-trap invariant has to drive a policy from an adversarial state the
 *  engine was steered into (indebted / post-confiscation / zero-fuel-rim), not
 *  from a fresh career, and `createInitialState` is the only thing the original
 *  driver hard-coded. `initial` must be in DAWN phase — `startDay` throws
 *  otherwise, which is the check this function deliberately does not duplicate.
 *
 *  READER: `poverty-invariant.test.ts` PT-5, which idles an adversarial state for
 *  150 days (so the loan and the guild marker compound without limit) and then
 *  asserts the escape is STILL there in the resulting state. */
export function driveFrom(
  policy: SimPolicy,
  initial: GameState,
  seed: number,
  days: number,
): GameState {
  let state = initial;
  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const rng = new SeededRng(seed)
      .fork('policy')
      .fork(`day-${state.day}`)
      .fork(`index-${dayIndex}`);
    const dawn = startDay(state);
    let dayState = dawn.state;
    const actions = policy({ state: dayState, dayIndex, rng });
    for (const action of actions) {
      // T-1603c: mirror the mid-batch-death guard `runCampaign` has carried since
      // T-1205 (`packages/sim/src/index.ts`, "a queued Combat can now be orphaned
      // mid-batch"). Enemy damage can drive the player's hull to 0 and end the
      // encounter by succession BEFORE the rest of a queued volley is applied, and
      // `resolveCombat` throws on a Combat with no active encounter — a real UGT
      // client re-reads legal actions between steps and would never send it. This
      // driver was written when a hull kill was arithmetically unreachable (one
      // combat defeat in 34,000+ encounters, `docs/balance/BASELINE-T-1603a.md`
      // §4), so the omission never surfaced; the T-1603c targeting levers make hull
      // kills real and it does. Bringing the two drivers back into agreement is the
      // fix — nothing about any spec's seeds, horizons or assertions moves.
      if (action.type === 'Combat' && !dayState.encounter) continue;
      if (action.type === 'Dare' && !dayState.dareHand) continue;
      dayState = applyPlayerAction(dayState, action).state;

      // T-135: mirror `runCampaign`'s Liar's Dice continuation loop, for exactly
      // the reason the Combat guard above is mirrored — the two drivers must not
      // drift. A `VisitHangout{venue:'dare'}` now OPENS a scene instead of
      // resolving inline, so without this the gambler ends every day with an open
      // hand: gate 1 blocks every subsequent action of that day and the dusk
      // timeout-fold forfeits the seed. Measured on seed 1 × 120 days, that alone
      // drove the gambler from solvent to 148,696 in debt.
      let dareGuard = 0;
      while (dayState.dareHand && dareGuard < DARE_MAX_MOVES_PER_HAND) {
        dareGuard += 1;
        const move = planDareMove(dayState);
        if (!move) break;
        dayState = applyPlayerAction(dayState, move).state;
      }
    }
    state = endDay(dayState).state;
  }
  return state;
}
