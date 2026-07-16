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
    // T-1302: the day-3 jump to system 3 no longer interdicts, so this day is a
    // plain pay-debt + Travel. The interdiction that T-1203 relied on here was an
    // EMERGENT side effect of the day-3 event count: the seed-1 day-3 contract is
    // a Dilithium (type 9) run, and under the pre-T-1302 triggers that armed
    // `cargo.ticking-crate.discovered`, whose StoryletOffered event bumped
    // `dayEventCount` — the very index the travel action forks its encounter RNG
    // from (`action-travel-${actionEventIndex}`, day.ts). T-1302 re-homed the
    // ticking crate onto a Contraband (type 10) contract, so the type-9 run stops
    // offering it; the day-3 travel now forks one index earlier and rolls no
    // encounter. Combat is exercised directly by the dedicated combat suites
    // (combat-property / encounter / actions / components tests), so this golden
    // returns to its stated Trade/Travel/Wait/Storylet variety.
    { type: 'Trade', action: 'pay-debt', amount: 25 },
    { type: 'Travel', destinationId: 4, spendDie: 0 },
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
//
// T-1203 re-derivation: player.tier is now a derived function of renown rank +
// ship fit rather than a hardcoded 1, so it climbs during the seed-1 script as
// deeds are earned (CAPTAIN by day 3 → tier 2 → ADMIRAL by day 4 → tier 3). The
// widened matchmaking band changes the day-3 interceptor from Doc Salvage
// (tier 2) to Smuggler Ray (named, tier 3), and the day-4 combat script was
// updated to resolve that tougher encounter (fight-then-run escape, see above).
// syncPlayerTier consumes NO rng (pure), so the persisted rng stream is
// unperturbed; both the serialized STATE (player.tier + the changed encounter/
// combat outcomes) and the EVENT stream (different interceptor + combat events)
// move for the TEN_DAY script. The STORYLET script (seed 555) earns no rank-up
// and stays tier 1, so its hashes are unchanged. All hashes regenerated
// deliberately via gen-day-loop-golden.ts.
//
// T-1204 re-derivation (Disposition with teeth): the day-3 Smuggler Ray
// encounter ends with a clean RUN (player-fled), whose disposition delta grew
// from +1 to +2 (DISPOSITION_DELTAS), and dusk decay is now PERIODIC (every 3rd
// dusk) instead of every dusk — so Smuggler Ray's post-escape standing and its
// DispositionChanged events differ across the ten days. The interceptor SELECTION
// weighting added no rng draw for this script (all named candidates are at
// neutral 0 when the day-3 jump is matched, so chooseWeighted is byte-identical
// to the old uniform pick), and the talk DC term never fires (no talk stance
// here), so ONLY the enlarged player-fled delta + the periodic decay move the
// serialized STATE and EVENT hashes for the TEN_DAY script. The STORYLET script
// (seed 555, day 1, no combat, all dispositions 0) is unaffected — its hashes
// are unchanged. Regenerated via gen-day-loop-golden.ts.
//
// T-1205 re-derivation (ship components load-bearing): enemy combat damage now
// (1) draws ONE extra seeded rng.next() per LANDED hit to pick the struck
// component — replacing the deterministic round-based rotation — and (2) subtracts
// the player's shield mitigation (0 for the junker in this script, so amounts are
// unchanged). The extra per-hit draw shifts the encounter rng stream for the day-3
// Smuggler Ray combat, moving both the serialized STATE (which components were
// chipped) and the EVENT hashes (the ComponentDamaged targets + the new
// `mitigated: 0` field) for the TEN_DAY script. The draw is taken only on a HIT
// and rides a forked encounter rng, so the persisted day rngState / NPC stream is
// unperturbed. Weapons/nav/robotics are all at junker baselines here. The STORYLET
// script (seed 555, no combat) is unchanged. Regenerated via gen-day-loop-golden.ts.
//
// T-1207 re-baseline (TEN_DAY only; STORYLET hashes unchanged — no combat): the
// day-3 Smuggler Ray combat now resolves run as an OPPOSED PILOT roll (a fresh
// enemy pursuit d20 + a second player StatCheck) and adds a post-kill enemy
// retreat roll on a defeating volley. Both shift the encounter rng stream and the
// emitted event set, so the TEN_DAY state + events hashes move. That the STORYLET
// hashes are byte-identical confirms the change is scoped to combat.
//
// T-1302 re-derivation (TEN_DAY only; STORYLET hashes unchanged — its seed-555
// day-1 has no type-9/10 contract or plague event, so nothing it offers moved):
// re-homing `cargo.ticking-crate.discovered` from a Dilithium (type 9) to a
// Contraband (type 10) contract removes the day-3 StoryletOffered that the seed-1
// type-9 run used to emit. That event bumped `dayEventCount`, which is the fork
// index the following Travel action seeds its encounter roll from
// (`action-travel-${actionEventIndex}`), so dropping it shifts the day-3 jump to
// a no-encounter fork. The day-4 combat steps (which resolved that interdiction)
// are therefore removed and the day becomes a plain pay-debt + Travel; both the
// day-loop STATE and EVENT hashes move accordingly. The day-loop RULES are
// unchanged — only a content storylet trigger moved. Regenerated via
// gen-day-loop-golden.ts.
//
// T-1304 re-derivation (STATE hashes only; both EVENT hashes UNCHANGED): adding
// the persistent `PlayerState.loan` field (null on every loan-free run) adds one
// `"loan":null` key to the serialized state, so both day-loop STATE hashes move —
// exactly as they did when charts/nemesisFile/legacy were added. The EVENT
// streams are byte-identical (the whole accrual/default block is guarded on a
// non-null loan, and no run here takes a loan), which is why only the two state
// hashes below changed and the event hashes did not. Regenerated via
// gen-day-loop-golden.ts.
//
// T-1306 re-derivation (STATE hashes only; both EVENT hashes UNCHANGED): adding
// the persistent `PlayerState.crew` field (empty `[]` on every crew-free run) plus
// the `dawnHand.rerollsRemaining` key (0 with no reroll crew) adds two keys to the
// serialized state, so both day-loop STATE hashes move — exactly as loan/charts/
// nemesisFile/legacy did. The EVENT streams are byte-identical (the wage-upkeep
// block is guarded on a non-empty crew, no run here hires, and rollDawnHand's
// `rng.rollHand(5)` draw is unchanged for an empty crew — only the added
// serialization keys differ), which is why only the two state hashes changed.
// Regenerated via gen-day-loop-golden.ts.
//
// T-1307 re-derivation (STATE hashes only; both EVENT hashes UNCHANGED): adding
// the persistent `PlayerState.ports` field (empty `[]` on every port-free run)
// adds one `"ports":[]` key to the serialized state, so both day-loop STATE hashes
// move — exactly as loan/crew/charts/nemesisFile/legacy did. The EVENT streams are
// byte-identical (the dusk launch-fee income block is guarded on a non-empty port
// roster, and no run here buys a port, so no PortEvent fires and no rng is drawn),
// which is why only the two state hashes below changed and the event hashes did
// not. Regenerated via gen-day-loop-golden.ts.
//
// T-1401 re-derivation (ALL FOUR hashes): the required `WireEntry.kind`
// discriminator now rides every wire line, so each WireEntry in both the
// serialized state's eventLog (STATE hashes) and the returned day-event stream
// (EVENT hashes) gains a `"kind":"…"` key. This is a SERIALIZATION-SHAPE change,
// NOT a behavior change: stripping the added `kind` off every WireEntry
// reproduces the previous four hashes byte-for-byte (verified), and the sim STATS
// report is byte-identical. No rule, value, or rng draw moved — only the new
// field appears. Regenerated via gen-day-loop-golden.ts.
export const DAY_LOOP_GOLDEN_STATE_HASH =
  '5519e486a2a0d0cc9c01989dc2e344837582eae507a7c80cc8e82432778dfe70';
export const DAY_LOOP_GOLDEN_EVENTS_HASH =
  'a09524c2c7023e1abb067c1d9b0da74977d6ec012f756d9549fceb4537882059';
export const STORYLET_GOLDEN_STATE_HASH =
  '20fd40b333a8bcf24ce8e02872dc9e7679a78369938a9b242ab9807895f3e968';
export const STORYLET_GOLDEN_EVENTS_HASH =
  '87e0948b1535a1af96ea4dca365014cab3b33872853c1637f11a9cb3b8e8e049';
