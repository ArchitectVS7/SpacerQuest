// ---------------------------------------------------------------------------
// Golden fixture for the batch day-loop contract (T-1004).
//
// The two tests this replaces compared `advanceDay` against a hand-inlined copy
// of its OWN body (startDay -> applyPlayerAction* -> endDay) — a tautology that
// can never go red, because a rule change moves both sides identically. This
// fixture instead pins the RESULT of running a fixed script through advanceDay
// to COMMITTED hashes of the final state + the concatenated day-event stream. A
// drift here is a real day-loop regression (or a deliberate rebalance):
// regenerate with
//
//     npx tsx packages/engine/src/__tests__/fixtures/gen-day-loop-golden.ts
//
// which imports these scripts, replays them through advanceDay, and prints the
// exact constants to paste back. Two scripts are committed because no single
// seed surfaces every action variety in one clean day-loop:
//   - TEN_DAY_SCRIPT (seed 1): Trade (buy-fuel/haggle/sign-contract/pay-debt),
//                              Travel, and Wait across ten scripted days.
//   - STORYLET_SCRIPT (seed 555): the Sun-3 guild-auditor storylet (which is
//                              deterministically available on day 1) followed by
//                              a Travel — the Storylet action path the old
//                              batch-vs-stepped storylet test covered.
// The state hash is over serializeState(finalState) (which embeds the eventLog),
// the events hash over the returned day-event array; two hashes keep a diff
// legible about which side drifted.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { advanceDay } from '../../day.js';
import { createInitialState, serializeState } from '../../state.js';
import type { GameEvent } from '../../types.js';
import { PlayerAction } from '../../types.js';

export const SEED = 1;

/** Ten scripted days exercising the non-storylet action variety the two deleted
 *  batch/stepped-equivalence tests covered (moved here so the script has a
 *  single home shared by the test and the regenerator). */
export const TEN_DAY_SCRIPT: PlayerAction[][] = [
  [
    { type: 'Trade', action: 'buy-fuel', fuelAmount: 20, spendDie: 0 },
    { type: 'Travel', destinationId: 2, spendDie: 1 },
    { type: 'Trade', action: 'pay-debt', amount: 50 },
  ],
  [{ type: 'Trade', action: 'buy-fuel', fuelAmount: 5, spendDie: 1 }],
  [
    { type: 'Trade', action: 'haggle', contractIndex: 0, spendDie: 0 },
    { type: 'Trade', action: 'sign-contract', contractIndex: 0, spendDie: 1 },
    { type: 'Travel', destinationId: 3, spendDie: 2 },
  ],
  [
    // T-1103: the day-3 jump to system 3 is interdicted under the restored
    // encounter rates (Doc Salvage, tier 2, hull 2 — seed-1 deterministic).
    // Two fight volleys defeat him, which completes the pending travel; the
    // rest of the day proceeds from system 3. This also gives the golden
    // script the Combat coverage it never had.
    { type: 'Combat', stance: 'fight', targetId: 'npc-doc-salvage', spendDie: 0 },
    { type: 'Combat', stance: 'fight', targetId: 'npc-doc-salvage', spendDie: 1 },
    { type: 'Trade', action: 'pay-debt', amount: 25 },
    { type: 'Travel', destinationId: 4, spendDie: 2 },
  ],
  [{ type: 'Wait' }],
  [{ type: 'Trade', action: 'buy-fuel', fuelAmount: 10, spendDie: 0 }, { type: 'Wait' }],
  [
    { type: 'Travel', destinationId: 5, spendDie: 0 },
    { type: 'Trade', action: 'pay-debt', amount: 100 },
  ],
  [
    { type: 'Trade', action: 'haggle', contractIndex: 0, spendDie: 0 },
    { type: 'Trade', action: 'buy-fuel', fuelAmount: 1, spendDie: 1 },
  ],
  [{ type: 'Travel', destinationId: 6, spendDie: 1 }],
  [
    { type: 'Trade', action: 'buy-fuel', fuelAmount: 10, spendDie: 0 },
    { type: 'Wait' },
    { type: 'Trade', action: 'pay-debt', amount: 10 },
  ],
];

export const STORYLET_SEED = 555;

/** A single day anchoring the Storylet action path: the Sun-3 guild-auditor
 *  storylet is deterministically available on day 1 at seed 555, then a Travel. */
export const STORYLET_SCRIPT: PlayerAction[][] = [
  [
    { type: 'Storylet', storyletId: 'port.sun3.guild-auditor', choiceId: 'argue', spendDie: 0 },
    { type: 'Travel', destinationId: 2, spendDie: 1 },
  ],
];

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Replay a multi-day script through advanceDay (the exact batch entry point)
 *  and hash the final state and concatenated day-event stream. Shared by the
 *  test and the regenerator so both hash identical bytes; the committed golden
 *  is the frozen literal below, not this function's live output. */
export function runDayLoopGolden(
  seed: number,
  script: PlayerAction[][],
): { stateHash: string; eventsHash: string } {
  let state = createInitialState(seed);
  const events: GameEvent[] = [];
  for (const actions of script) {
    const result = advanceDay(state, actions);
    state = result.state;
    events.push(...result.events);
  }
  return {
    stateHash: sha256(serializeState(state)),
    eventsHash: sha256(JSON.stringify(events)),
  };
}

// --- Committed golden hashes (regenerate via gen-day-loop-golden.ts) ---------
// T-1201 re-derivation: NPC dusk resolution now routes all five verbs through
// the shared check() and emits a StatCheck event per resolved verb (PRD §7,
// "one system — no separate AI"). Those new events land in the day's event
// stream, and their rng.d20() draws shift the NPC sim's RNG stream, so BOTH the
// serialized state (NPC positions/credits/fuel) and the event hashes move for
// BOTH scripts. All four hashes were regenerated deliberately; the day-loop
// rules themselves are unchanged — only the NPCs now roll real checks.
// (Prior T-1104 re-derivation: rollContract's RNG draw order and destination/
// cargo ranges changed the manifest board and contract-driven event fields.)
//
// T-1202 re-derivation: nat-20/nat-1 checks now always spin a Galactic Wire story
// (day.ts scans each action + the dusk batch, emitting extra WireEntry events), so
// both scripts' EVENT streams grow. The scripts also exercise haggle (now
// margin-scaled, not flat 1.5x) and Combat (interceptor damage now margin-scaled),
// which move the serialized STATE too. The wire scanner is seeded from the stable
// pre-action rngState, so it does NOT perturb the persisted rngState — the NPC sim
// stream is unchanged; only the added stories + rebalanced haggle/combat drift the
// hashes. All four regenerated deliberately via gen-day-loop-golden.ts.
export const DAY_LOOP_GOLDEN_STATE_HASH =
  'ebcd2516354a1f59179dc12beed626916b7ee8859caf742fec7ae66da48f3e1f';
export const DAY_LOOP_GOLDEN_EVENTS_HASH =
  'edae218dc27b64f0f27e7543eb98e0a7d37a568bdbf5b1ff26209b5ea0fbd839';
export const STORYLET_GOLDEN_STATE_HASH =
  '9c10750ea5bd9fb5f3593ae7adfa81425d5f3ad2b7a68f9a82f663f63dc9f876';
export const STORYLET_GOLDEN_EVENTS_HASH =
  '5e726f54f9f6fccbb499350a4c52f1c749bc581c8d6c0f1e3296c0e1ccd6ff04';
