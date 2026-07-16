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
import type { SimPolicy } from '../../index.js';

/** The longest run of consecutive days on which the policy took NO
 *  income-producing action (sign / travel-to-deliver / explore / fight-or-talk).
 *  The poverty-trap invariant is that this never reaches 5 — the policy is never
 *  stranded with no legal way to make progress. */
export function longestZeroIncomeStreak(daily: { incomeActionCount: number }[]): number {
  let longest = 0;
  let current = 0;
  for (const day of daily) {
    if (day.incomeActionCount === 0) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
}

/** Drive a competent policy headlessly through the engine exactly as
 *  runCampaign does (policy plans on the fresh post-startDay day state), and
 *  return the final GameState so a test can inspect REAL ship/charts state
 *  (upgrades bought, POIs charted) rather than only the report summary. */
export function driveCompetentCampaign(policy: SimPolicy, seed: number, days: number): GameState {
  let state = createInitialState(seed);
  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const rng = new SeededRng(seed)
      .fork('policy')
      .fork(`day-${state.day}`)
      .fork(`index-${dayIndex}`);
    const dawn = startDay(state);
    let dayState = dawn.state;
    const actions = policy({ state: dayState, dayIndex, rng });
    for (const action of actions) {
      dayState = applyPlayerAction(dayState, action).state;
    }
    state = endDay(dayState).state;
  }
  return state;
}
