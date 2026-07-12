// Golden regenerator for T-1004's batch day-loop fixture. Replays the two
// committed scripts through advanceDay and prints the exact constants to paste
// into day-loop-golden.ts.
// Run: npx tsx packages/engine/src/__tests__/fixtures/gen-day-loop-golden.ts
import {
  SEED,
  STORYLET_SCRIPT,
  STORYLET_SEED,
  TEN_DAY_SCRIPT,
  runDayLoopGolden,
} from './day-loop-golden.js';

const main = runDayLoopGolden(SEED, TEN_DAY_SCRIPT);
const storylet = runDayLoopGolden(STORYLET_SEED, STORYLET_SCRIPT);

console.log(`export const DAY_LOOP_GOLDEN_STATE_HASH = '${main.stateHash}';`);
console.log(`export const DAY_LOOP_GOLDEN_EVENTS_HASH = '${main.eventsHash}';`);
console.log(`export const STORYLET_GOLDEN_STATE_HASH = '${storylet.stateHash}';`);
console.log(`export const STORYLET_GOLDEN_EVENTS_HASH = '${storylet.eventsHash}';`);
