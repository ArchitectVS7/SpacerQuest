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
//
// T-1501 re-derivation (ALL FOUR hashes): the ports & rumors batch added the
// systemIds-only `port.aldebaran.grain-exchange` beat at Aldebaran-1 (system 2).
// Both scripts Travel to system 2 (and TEN_DAY_SCRIPT on to system 3), so the
// next dawn now surfaces extra StoryletOffered events + the resulting
// available-list entries, moving both the STATE and EVENT hashes on both scripts.
// This is a deliberate CONTENT ADDITION, not a behavior/rng change: no rule,
// value, or dice draw moved — only new eligible storylets appear at the docked
// systems. T-1502 re-pin: the NPC personal-chain batch added a chain opener at
// systems 2 (Rattlesnake) and 3 (Silk Dagger) — both systemIds-gated openers the
// scripts dock at — so one more offer surfaces at each. Neither script plays a
// Storylet, so the new dusk abandonment sweep (resolveAbandonedChains) never fires
// here; the drift is purely the new eligible offers. Regenerated via
// gen-day-loop-golden.ts.
//
// T-1503 re-pin: STATE hashes ONLY — both EVENT hashes are BYTE-IDENTICAL to their
// pre-T-1503 values (539812…/8934d5…), which is the proof this task added no
// behavioral/event change to the day loop. The four alliance-arc openers are
// `eras:['VETERAN']`-gated and both golden scripts run in TOUR_ONE, so they never
// offer here — no new StoryletOffered events. The sole drift is that
// `createInitialState` now serializes the additive `PlayerState.reputation`
// container ({0,0,0,0} throughout — no rep mover fired, and no rep mover draws rng
// anyway), which moves the serialized-state hashes only. Regenerated via
// gen-day-loop-golden.ts.
// T-1504 re-derivation (ALL FOUR hashes): rank-up wire PROSE only. Every renown
// rank now carries an authored `citation` (content deeds.ts) and the engine emits
// it verbatim; before this task only CONQUEROR had one and the other nine fell
// back to an engine-authored generic "Registry confirms Player as … after …"
// line. Both scripts rank up (seed 1: COMMANDER/CAPTAIN/COMMODORE; seed 555:
// COMMANDER), so every one of those WireEntry messages changes — moving the EVENT
// hashes and, because the eventLog is serialized, the STATE hashes too.
//
// This is a CONTENT/PROSE change, not a behavioral one, and it was verified as
// such rather than asserted: replaying both scripts after the change shows the
// SAME earned deeds, the SAME `registry.matchCounts` keys (no key from the 26
// newly-authored deeds appears — none of them match anything these scripts do),
// the SAME storylets offered (the 8 new era tie-ins are all `eraEvent`-gated and
// neither script has a live era event), and the same rank-up sequence. No rng
// draw, count, or value moved. Regenerated via gen-day-loop-golden.ts.
// T-1603b re-derivation (the TWO DAY-LOOP hashes only; both STORYLET hashes are
// BYTE-IDENTICAL and were not touched). CAUSE: the canonical
// RENOWN_DEED_THRESHOLDS rescale in content `deeds.ts` (CAPTAIN 2 -> 5,
// COMMODORE 3 -> 9, and so on up the ladder).
//
// WHAT ACTUALLY MOVED, verified by replaying both scripts before and after the
// rescale and diffing the event streams rather than trusting the hash:
//   1. The seed-1 ten-day script earns FOUR deeds. Under the old table that was
//      three rank-ups (COMMANDER at 1, CAPTAIN at 2, COMMODORE at 3); under the
//      canonical table it is ONE (COMMANDER at 1). Two `RenownRankUp` events and
//      their two rank-up `WireEntry` citations are gone from the stream, and the
//      `DeedEarned.renownRank` stamps on the later deeds read COMMANDER instead
//      of CAPTAIN/COMMODORE.
//   2. Because rank feeds `player.tier` (engine `tier.ts` `rankTier`), the
//      captain stays at tier 1 through the script instead of climbing to tier 2.
//      `player.tier` is the only input to `chooseTargetTier` /
//      `selectEncounterInterceptor`, so the day-3 jump that used to be
//      intercepted by the named tier-2 "The Chef" now fails as a navigation
//      malfunction instead. That is a REAL behavioural consequence of the rescale
//      (documented at the threshold table's definition site), not a golden drift.
//   3. The seed-555 storylet script earns ONE deed, so it ranks up to COMMANDER
//      under both tables and its two hashes are unchanged. That is the control:
//      the only scripts that moved are the ones whose rank actually changed.
// No day-loop rule, rng draw order or ordering guarantee was altered. Regenerated
// via gen-day-loop-golden.ts.
//
// T-1603c re-derivation (again the TWO DAY-LOOP hashes only; both STORYLET hashes
// are BYTE-IDENTICAL and were not touched — the seed-555 script fights nobody).
// CAUSE: the two combat-tuning levers in `docs/balance/TUNING-T-1603.md` §10 —
// the WEIGHTED enemy-fire target pick (content HULL_DAMAGE_WEIGHT 4 :
// SYSTEM_DAMAGE_WEIGHT 1) and the TIER_GAP_DAMAGE_BONUS.
//
// WHAT ACTUALLY MOVED, verified by dumping and diffing the two event streams
// rather than trusting the hash. The seed-1 script's stream is 945 events BEFORE
// and 945 events AFTER — same length, same order, same types — and the entire
// diff is FIVE lines in FOUR places, all inside the day-4 brigand interdiction
// `enc-4-4-2-4-anon-brigand-4`:
//   1-3. Three `ComponentDamaged` events move `amount` 1 -> 2 (condition 9 -> 7
//        instead of 9 -> 8). The brigand outranks the captain by one tier, so
//        TIER_GAP_DAMAGE_BONUS adds 1 to the raw hit; junker shields mitigate 0,
//        so all of it lands. This is the lever doing precisely what it is for.
//   4.   One `ComponentDamaged.component` moves 'drives' -> 'weapons': the SAME
//        single `rng.next()` draw, in the SAME position in the stream, now lands
//        in a different interval of the weighted table.
//   5.   One NPC `ContractClaimed.payment` (and its echoing NpcAction prose) moves
//        1370 -> 1350. This is a genuine DOWNSTREAM consequence, not drift:
//        `contractSpecFromShip` (engine economy.ts) feeds the player's DRIVES
//        condition into `jumpFuelCost`, and the manifest payment carries a
//        `fuelRequired * 5` term. With the hit landing on weapons instead of
//        drives the captain's drives stay at 9, the run needs less fuel, and the
//        board prices it 20 credits lower.
// NO rng draw was added, removed or reordered: `damageComponentForHit` still takes
// exactly one `rng.next()` and the tier-gap bonus takes none. Regenerated via
// gen-day-loop-golden.ts.
// T-1703 re-derivation (BOTH STATE hashes; BOTH EVENTS hashes are BYTE-IDENTICAL
// and were not touched — and that asymmetry is the whole proof).
// CAUSE: `GameState.edition` is a new ROOT-LEVEL field (types.ts `Edition`, the
// demo gate's one persisted scalar). The state hash is taken over
// `serializeState(finalState)`, so one added key — `"edition":"full"` — moves it
// by definition. Nothing about the day loop changed for a full career.
//
// WHY THE UNMOVED EVENTS HASHES ARE THE EVIDENCE. Both scripts run at edition
// 'full', where `isDemo` is false, so the demo gate in `applyPlayerAction` and
// the demo dusk in `endDay` are both dead branches: no event is added, removed
// or reordered, and — load-bearing — NO rng draw is taken or skipped (the gate is
// a scalar compare above the fork, exactly like the T-1505c terminal guard). If
// the demo work had leaked into the full game's day loop at all, the events
// hashes would have moved too. They did not. Regenerated via
// gen-day-loop-golden.ts.
// T-1605 · Regenerated after ordinary jumps stopped taking a pilot check. The
// StatCheck event no longer appears on a normal jump and navigation now prices
// the burn, so both the event stream and the state hash move. No rng draw was
// added or removed by that change (the check read the spent dawn die, it never
// rolled), so this is an event/state shape move, not a divergence in the stream.
// N1 · STATE HASHES RE-PINNED, EVENT HASHES DELIBERATELY NOT — and the split is
// the evidence, not a formality. N1 gave every `NpcState` a real `ship` and moved
// its `fuel` onto it, so `serializeState` now carries 30 more ship blocks: a pure
// SHAPE move. Nothing about what any actor DOES changed, so not one rng draw
// moved, and both event-stream hashes came back byte-identical from the
// regenerator. If the seed had been mis-calibrated — a tighter NPC hull clamping
// the roster's tank, a different drive ramp changing a jump's fuel — the event
// hashes would have moved with the state hashes. They did not.
//   DAY_LOOP state  71b3315e… -> f07d6de2…   (events a0e8ed7f… UNCHANGED)
//   STORYLET state  1f187dbe… -> 86fbc0cc…   (events 6f61a1d5… UNCHANGED)
// Regenerated via gen-day-loop-golden.ts.
//
// N2 · ALL FOUR HASHES RE-PINNED, and unlike N1 the EVENT hashes move too — which
// is the correct signal, not a regression. N2 does three things to the cast, each
// of which reaches this stream:
//   1. the component ramp re-seed (`npc.ts` `npcShipForProfile`) gives navigation
//      to the captains whose stats want it, so `navFuelFactor` re-prices their
//      jumps and their credits/fuel/positions diverge — a STATE move;
//   2. the hull re-seed puts every captain on the tank the yard licenses for their
//      hold (1,200 → 300 at tier 1), so `refuelIfNeeded` can now fail to fund a
//      jump and a captain falls to `brokeIdle`, which TAKES AN rng DRAW — so the
//      shared dusk stream genuinely diverges, not just its payload;
//   3. the upgrade decision emits a `WireEntry` per refit — new events by design
//      (the player-facing surface that the field is now buying ships).
// MEASURED rather than asserted, by dumping and diffing both streams (.scratch/):
// the seed-1 script runs 946 events BEFORE and 1,283 AFTER; 382 lines are ADDED
// and 45 changed — the additions are all `WireEntry` refit lines, the changes are
// NpcAction prose, contract payments and NPC positions downstream of (1) and (2).
// No player action, no player rule and no player-side rng draw is involved: the
// scripts' own `applyPlayerAction` results are untouched, and the day-loop rules
// themselves did not move (`rulesFingerprint` DID move, because these are rule
// sources, so the smoke fixture was re-extracted alongside).
//   DAY_LOOP state  f07d6de2… -> a16ca706…   (events a0e8ed7f… -> 2ae4bb5f…)
//   STORYLET state  86fbc0cc… -> a4374515…   (events 6f61a1d5… -> a5522f39…)
// Regenerated via gen-day-loop-golden.ts.
//
// RE-RECORDED AGAIN AT THE REOPENED N4 (archetypes bias the Ideal). Every one of
// the 30 captains draws its verb from a different distribution than it did the
// day before, so the shared dusk rng stream diverges from the first NPC turn of
// day 1 and everything downstream of it moves. MEASURED the same way as the N2
// entry above, by dumping and diffing both streams (.scratch/): 1,482 events
// BEFORE, 1,451 AFTER, of which
//   · `NpcAction` is UNCHANGED at 330 (11 days x 30 captains) — the cast still
//     takes exactly one action each per day; only WHICH action moved;
//   · `StatCheck` 260 -> 288 and `FlawCheck` 199 -> 156 — more days now resolve a
//     real verb check and fewer are eaten by a flaw override, because the blend
//     lands captains on verbs their flaw does not trigger as often;
//   · `ContractClaimed` 6 -> 2 and `DispositionChanged` 10 -> 4 — fewer snipes off
//     the player's board inside this 11-day window (an 11-day sample, not a
//     finding: the sweep is what grades competition, and it is N10's number);
//   · `WireEntry` 561 -> 556.
// THE PLAYER SIDE IS BYTE-IDENTICAL IN COUNT AND KIND: DawnRoll 11, DayAdvanced
// 11, DebtPayment 4, DeedEarned 6, RenownRankUp 3, TradeEvent 8, TravelEvent 6
// and all three Storylet events are unmoved, which is the check that this is an
// NPC-side change and not a quiet player rebalance.
//   DAY_LOOP state  1308cbc8… -> 7f111e79…   (events b9b7ec15… -> 33f661e6…)
//   STORYLET state  b405b3e1… -> de48563d…   (events a5ce5053… -> 2b927f80…)
//
// RE-RECORDED AT N10 (the shared per-system job pool). Two independent reasons the
// stream had to move, and neither is a player-side rebalance:
//   1. THE STATE SHAPE. `market.npcClaims` (one scalar) became
//      `market.jobPoolClaims` (a per-system record), so the serialized state hash
//      moves even where no value does.
//   2. THE DUSK RNG STREAM. A captain trading away from the player now draws a
//      LOCAL BOARD through `generateManifestBoard` and chooses off it via
//      `pickContract`, where pre-N10 they took a single `rollContract`. That is
//      more draws per trading captain, so the shared dusk stream diverges from the
//      first away-haul of day 1.
// MEASURED the same way as the two entries above, by dumping and diffing both
// streams: DAY_LOOP 1,310 events BEFORE, 1,301 AFTER, of which
//   · `NpcAction` is UNCHANGED at 300 (10 days x 30 captains) — the cast still
//     takes exactly one action each per day; only WHICH action moved;
//   · `StatCheck` 261 -> 254 and `FlawCheck` 145 -> 144 — a handful of days land on
//     a different verb, so a different check rolls;
//   · `NpcEncounter` 19 -> 20 and `WireEntry` 498 -> 496;
//   · `ContractClaimed` is UNCHANGED at 2. Worth stating because it is the field
//     N10 is about: an 11-day two-snipe sample cannot grade competition, and this
//     step's numbers come from the sweep and the capstone, never from here.
// THE PLAYER SIDE IS BYTE-IDENTICAL IN COUNT AND KIND: DawnRoll 10, DayAdvanced 10,
// DebtPayment 4, DeedEarned 5, RenownRankUp 2, TradeEvent 8, TravelEvent 5,
// StoryletOffered 37 and DispositionChanged 4 are all unmoved — the same check the
// N4 entry above used, and the same conclusion: an NPC-side change.
// (STORYLET moves the same way and no further: 141 -> 138, entirely
// `NpcEncounter` 3 -> 2, `StatCheck` 27 -> 26, `WireEntry` 58 -> 57.)
//   DAY_LOOP state  7f111e79… -> b1c4db25…   (events 33f661e6… -> 9f864bfa…)
//   STORYLET state  de48563d… -> deefa3d7…   (events 2b927f80… -> 3e96fe90…)
//
// N11 · STATE HASHES RE-PINNED, EVENT HASHES DELIBERATELY NOT — the same split as
// the N1 entry above, and for the same reason it is evidence rather than a
// formality. N11 gave every `NpcState` a `registry` (the captain's own deed ledger
// and Renown rank), so `serializeState` now carries 31 more registry blocks and the
// state hash moves by definition. What the cast DOES did not change: the accrual
// runs after the day's verb, reads the cached `registry.matchCounts`, and TAKES NO
// rng DRAW — and, load-bearing, a captain's deed-source events (`TradeEvent` /
// `TravelEvent` / `EncounterResolved`) go into a LOCAL per-captain batch that never
// enters the shared `events` array, so nothing is added to, removed from or
// reordered in the stream `day.ts` returns.
//
// BOTH EVENT HASHES CAME BACK BYTE-IDENTICAL FROM THE REGENERATOR, and that is the
// proof of both claims at once. If the accrual had drawn a die the stream would have
// diverged from the first trading captain of day 1; if a captain's source event had
// leaked into `events` it would appear in the stream AND earn the PLAYER the deed
// (day.ts pushes `npcEvents` into the array it later hands to `evaluateDeeds`).
// Neither happened. If either of these two ever moves on a change of this shape,
// that is the leak — fix the cause, never re-pin the number.
//   DAY_LOOP state  b1c4db25… -> ae6d73d7…   (events 9f864bfa… UNCHANGED)
//   STORYLET state  deefa3d7… -> 11b73757…   (events 3e96fe90… UNCHANGED)
// Regenerated via gen-day-loop-golden.ts.
//
// N11/T-021 · THE TWO DAY-LOOP HASHES RE-PINNED; BOTH STORYLET HASHES ARE
// BYTE-IDENTICAL and were not touched. CAUSE: `considerRefit` now asks the yard for
// rank-gated special equipment, so the −1 renown lockout stops being dormant and
// captains who have EARNED the CAPTAIN rung spend 10,000cr on gear instead of on
// their next component rung.
//
// MEASURED, not asserted — both streams dumped and diffed (scratchpad), 1,301 events
// BEFORE and 1,304 AFTER over the ten-day window:
//   · SEVEN gated purchases actually happen inside the window (5x Star Buster, 2x
//     Arch Angel), which is the point of the step: the gate is reachable. Their wire
//     lines REPLACE the component-refit lines those captains would otherwise have
//     bought — yard lines hold at 281 -> 282 while `racked … cargo pods` lines fall
//     42 -> 40, i.e. two hull rungs (and the `fillHold` purchase that rides each) are
//     displaced by a day, which is the whole of `WireEntry` 496 -> 495.
//   · `NpcAction` is UNCHANGED at 300 (10 days x 30 captains): the cast still takes
//     exactly one action each per day. `StatCheck` 254 -> 258, `FlawCheck` 144 -> 143,
//     `NpcEncounter` 20 -> 21 — a captain who spent their purse differently can now
//     fund a jump they previously could not (Zero Risk's day-7/day-10 broke-idle
//     becomes a real haul), so the shared dusk stream diverges from the first
//     displaced purchase onward. That is the downstream consequence of the money
//     moving, not drift.
//   · THE ENTIRE NON-NPC STREAM IS BYTE-IDENTICAL — all 176 events that are not
//     `kind:'npc'` / `npcId` / `characterId:'npc-…'` / `actor:'npc-…'` diff clean,
//     including every player StatCheck, DawnRoll 10, DayAdvanced 10, TradeEvent 8,
//     TravelEvent 5, DeedEarned 5, RenownRankUp 2, DebtPayment 4, StoryletOffered 37,
//     DispositionChanged 4 and ContractClaimed 2. That is the check that this is an
//     NPC-side change and not a quiet player rebalance, and it is why the seed-555
//     storylet script (one day, no captain reaches 5 deeds) is unmoved.
//   DAY_LOOP state  ae6d73d7… -> 4ad8b677…   (events 9f864bfa… -> 72748730…)
//   STORYLET state  11b73757… UNCHANGED      (events 3e96fe90… UNCHANGED)
// Regenerated via gen-day-loop-golden.ts.
//
// T-111 · BOTH STATE HASHES RE-PINNED, BOTH EVENT HASHES DELIBERATELY NOT — the
// same split as the N1 and N11 entries above, and here too the unmoved pair is the
// evidence rather than a formality. T-111 added ONE serialized player key,
// `recovery: null` (the open multi-day salvage op), so `serializeState` carries one
// more field on both scripts and the state hash moves by definition. This is
// exactly the T-1306 `rerollsRemaining` situation the `rollDawnHand` header
// records: a new persisted key with no behavioural reach into these scripts.
//
// WHY THE EVENT HASHES MUST HOLD, and what a move would have meant. Neither script
// contains an `Explore` action, so no recovery can be opened in either — and the
// dusk recovery tick T-111 inserts into `endDay` is guarded WHOLE on
// `player.recovery !== null`. On a recovery-free dusk it emits nothing, mutates
// nothing, and — the load-bearing half — takes NO rng draw: its `dayRng.fork` sits
// INSIDE the payout branch precisely because `SeededRng.fork` advances its parent.
// A fork on the guard path would have re-phased every dusk in the repo and moved
// both of these. They came back byte-identical from the regenerator. If either ever
// moves on a change of this shape, that is the leak — fix the cause, never re-pin.
//   DAY_LOOP state  4ad8b677… -> 3405f608…   (events 72748730… UNCHANGED)
//   STORYLET state  11b73757… -> 9e332c2e…   (events 3e96fe90… UNCHANGED)
// Regenerated via gen-day-loop-golden.ts.
export const DAY_LOOP_GOLDEN_STATE_HASH =
  '3405f60869ed3d720ccd23c58c52cd78777cbaf3e224d9e1df5e1d8831321658';
export const DAY_LOOP_GOLDEN_EVENTS_HASH =
  '7274873091b87cee192878a732e7ae8217575cc6650fd41f61290d2dfe1dbe71';
export const STORYLET_GOLDEN_STATE_HASH =
  '9e332c2ee43f01d94288df7d7a30a86c3fc1622320f6070f408a48c6c5903233';
export const STORYLET_GOLDEN_EVENTS_HASH =
  '3e96fe90247b837cba773049e855623f0381bb5cd0f9cf41fda9d86982a8b50e';
