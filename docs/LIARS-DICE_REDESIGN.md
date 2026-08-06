# Liar's Dice Redesign — the Dare becomes a scene

**Status:** SPECIFICATION (T-134, 2026-07-31). This document is the source of truth for the
**M4d** milestone of the 0.5.2 track (`TASKS.md` T-134 … T-137). **It is a spec, not an
implementation** — T-134 changed no engine, content, sim or UI source file, the same discipline
`docs/EXPLORE_REDESIGN.md` (T-100) and `docs/HANGOUT_REDESIGN.md` (T-101) kept for their own
milestones.

**It implements OWNER RULING D2** (`TASKS.md`, 2026-07-31, after two rounds of `/bakeoff`), and
**does not re-open it**:

> The Spacer's Dare's single opposed-GUILE check is replaced by a real Liar's Dice bluffing
> game. 4 hidden d6 per side, no wildcards, quantity capped at 8, face capped at 6, one hand =
> one Dare. Each turn is exactly one of RAISE FACE (F→F+1, quantity unchanged) / RAISE QUANTITY
> (same face, quantity strictly up) / RAISE BOTH (2× ante) / CALL THE BLUFF / FOLD. Ante rides
> the port's own wager band. GUILE integrates as **Peek**.

**D2 was checked against the source before being specified and it is workable.** Every shape it
needs has a home: the scene is `EncounterState`'s architectural twin, the ante is
`wagerBandFor`'s second reader, the Peek DC is the `dare` row's previously-ignored `dc` cell, and
the three disposition arms are `venueParamsFor` plus exactly one new field. Nothing in D2
required a new content *mechanism*; it required a new engine *rule module*.

**Companions:** `docs/HANGOUT_REDESIGN.md` (the venue/parameter surface this rides on, and §10's
T-125 measurement this must not break), `docs/EXPLORE_REDESIGN.md` (the sibling spec whose
state + migration + event template §4/§7/§8 follow almost 1:1), `docs/PRD-REIMAGINED.md` (design
intent, §6/§7.3 the Dare), `docs/VERSIONING.md` (save versions §2, `rulesFingerprint` §3),
`docs/BALANCE-POLICY.md` (governance), `docs/NPC_REDESIGN.md` (the N-series, paused behind this
track).

**The eleven things this document settles, each with a named decision:**

| § | Question | The decision |
| --- | --- | --- |
| §2 | The scene state and where it lives | **`GameState.dareHand`, a top-level scene beside `encounter`** |
| §3 | The seed wager | **Player-chosen inside the port band, exactly as today** |
| §4 | The ante | **3% of `band.max`, resolved once at open, per-side headroom** |
| §5 | The bid lattice and the closed exploit | **F→F+1 with quantity pinned, restated as arithmetic** |
| §6 | FOLD's economics | **The folder's whole escrow, and the dusk fold is a player fold** |
| §7 | Disposition | **NOT neutral — three arms, one new `dispositionOnFold` field** |
| §8 | The Peek | **A second die, before the first bid, against `dare.dc = 12`** |
| §9 | Actions, gating, and the AI dealer | **One `Dare` action with a move discriminator; a dealer that cannot see** |
| §10 | Events and drift guards | **Four new scene events, plus the terminal `HangoutEvent`, unchanged** |
| §11 | Save version and migration | **v13 → v14, one literal-`null` backfill** |
| §12 | The sim-side player policy | **A bounded continuation loop in the runner + a total `planDareMove`** |

**What this task does NOT owe.** A new markdown file under `docs/` is not hashed by
`computeRulesFingerprint` — `ENGINE_RULE_DIRECTORIES = ['', 'actions']`
(`packages/sim/src/balance/rules-fingerprint.ts:76`) plus the content sources, none of which is
`docs/`. So **T-134 owes no capstone, no smoke re-extract and no fingerprint re-derivation.**
The capstone owed for this whole milestone is T-137's, once (`TASKS.md` M4d), with `npm run
format` run **before** it and never after.

---

## §0 · Symbol conventions — how to read the code in this document

Every backticked identifier here is one of two things, and the two are never mixed.

1. **An EXISTING symbol.** It resolves under `packages/*/src` today; every one below was grepped
   while writing this spec. Three are worth flagging up front because they shape §7 and §9:
   - `npcGuile` (`packages/engine/src/actions/hangout.ts:95`) is **module-private**. §9 asks
     T-135 to keep it where it is and pass its *result* into the dealer policy, never the NPC.
   - `HangoutVenue` (`packages/engine/src/actions/hangout.ts:26`) is **module-private** and
     covers only the five *social* venues. Unchanged by this spec.
   - `SeededRng` (`packages/engine/src/rng.ts:5`) has `d20`, `rollHand`, `next`, `fork`,
     `shuffle` — and **no `d6`**. §9.6 makes adding one a named deliverable.
2. **A PROPOSED symbol.** It does **not** exist yet; this spec names it so T-135 / T-136 / T-137
   do not each invent a name. Every proposed symbol appears in the table below and nowhere else,
   and every code block introducing one is labelled **PROPOSED**.

**The FIELD names of a proposed type are proposed too** — `playerDice`, `dealerDice`, `bidder`,
`seedWager`, `ante`, `potPlayer`, `potDealer`, `peekUsed`, `peekedDealerDie`, `history`,
`antePaid`, `actualCount`, `dispositionDelta`, `dispositionOnFold` and the `move` / `outcome`
literal sets do not resolve today and are not expected to. Every other field name in this
document's code blocks (`id`, `systemId`, `day`, `dealerId`, `opponentId`, `credits`,
`disposition`, `dc`, `dispositionOnSuccess`, `dispositionOnFailure`, `wager`, `playerWon`,
`creditsDelta`, `failReason`, `spendDie`, `dice`, `spent`) is an existing one, reused
deliberately.

### Existing symbols this spec builds on (all verified 2026-07-31)

| Symbol | Location |
| --- | --- |
| `GameState` | `packages/engine/src/types.ts:1763` |
| `GameState.encounter: EncounterState \| null` | `packages/engine/src/types.ts:1789` |
| `EncounterState` | `packages/engine/src/types.ts:94` |
| `HangoutEvent` variant | `packages/engine/src/types.ts:692` |
| `DispositionChanged` variant + its `reason` union | `packages/engine/src/types.ts:386`, `:394` |
| `ActionBlocked.actionType` / `.reason` | `packages/engine/src/types.ts:486` / `:505` (`'active-encounter'` at `:506`) |
| `VisitHangout` action | `packages/engine/src/types.ts:1216` |
| `StatCheck.actionContext` (`'gamble'`) | `packages/engine/src/types.ts:313` |
| `check(die, statValue, dc)` | `packages/engine/src/dice.ts:160` |
| `spendDie(hand, index)` | `packages/engine/src/dice.ts:165` |
| `mutableNpc` / `applyDisposition` (±10 clamp, `delta === 0` early return) | `packages/engine/src/npc.ts:666` / `:674` |
| `resolveVisitHangout` (its `case 'dare'` arm) | `packages/engine/src/actions/hangout.ts:125` (`:242`–`:318`) |
| `npcGuile` (module-private) | `packages/engine/src/actions/hangout.ts:95` |
| `portHangoutFor` / `wagerBandFor` / `loanBandFor` / `venueParamsFor` / `venueOffered` / `rankClientele` | `packages/engine/src/hangoutRules.ts:64` / `:71` / `:92` / `:105` / `:125` / `:154` |
| `startDay` / `applyPlayerAction` / `endDay` | `packages/engine/src/day.ts:114` / `:211` / `:484` |
| the encounter action gate (`'active-encounter'`) | `packages/engine/src/day.ts:238`–`:257` |
| the action rng forks (`action-hangout-${actionEventIndex}`) | `packages/engine/src/day.ts:401`–`:448` |
| `SeededRng` (no `d6`) | `packages/engine/src/rng.ts:5`–`:59` |
| `cloneState` (JSON round-trip minus `eventLog` / `npcs`) | `packages/engine/src/clone.ts:60` |
| `createInitialState` (`encounter: null`) | `packages/engine/src/state.ts:178` |
| `GameStateSchema` (`.strict()`) | `packages/engine/src/schema.ts:1353` |
| `EncounterStateSchema` | `packages/engine/src/schema.ts:472` |
| `HangoutEvent` schema variant + its `failReason` `z.enum` | `packages/engine/src/schema.ts:882`, `:891` |
| `VisitHangout` action-schema venue enum | `packages/engine/src/schema.ts:1313` |
| `_schemaCoversGameState` / `_covEncounter` | `packages/engine/src/schema.ts:1395` / `:1453` |
| `AssertEventKeys` + the coverage block + the `void _cov…` block | `packages/engine/src/schema.ts:1476`, `:1485`–`:1553`, `:1584`+ |
| `_covExplorationFailReason` — the **value-level** guard precedent | `packages/engine/src/schema.ts:1511` |
| `MIGRATIONS[8]` / `MIGRATIONS[11]` / `MIGRATIONS[12]` | `packages/engine/src/save.ts:302` / `:371` / `:385` |
| `CURRENT_SAVE_VERSION = 13` | `packages/engine/src/save.ts:397` |
| `HangoutVenueParams` (+ the venue/field table) | `packages/content/src/portHangouts.ts:88` (table at `:64`–`:87`) |
| `DEFAULT_PORT_HANGOUT` (its `dare` block at `:200`) | `packages/content/src/portHangouts.ts:188` |
| `DARE_MIN_WAGER` 25 / `DARE_MAX_WAGER` 1000 / `DARE_WIN_DISPOSITION` −2 / `DARE_LOSS_DISPOSITION` +2 / `BEFRIEND_DC` 12 | `packages/content/src/hangout.ts:65` / `:66` / `:78` / `:79` / `:88` |
| the four Dare deeds (`dare_first`, `dare_won`, `high_roller`, `table_regular`) | `packages/content/src/deeds.ts:573`, `:585`, `:604`, `:618` |
| `classifyCheck` (`'gamble'` / `'npc-socialize'` → gamble bucket) | `packages/engine/src/wire.ts:96`–`:101` |
| `planDare` / `gamblerPolicy` / the two-hand queue loop | `packages/sim/src/index.ts:3441` / `:3508` / `:3683`–`:3691` |
| `GAMBLER_RESERVE` 3000 / `GAMBLER_BANKROLL_FRACTION` 0.1 / `GAMBLER_MAX_DARES_PER_DAY` 2 | `packages/sim/src/index.ts:3403` / `:3407` / `:3410` |
| the sweep runner batch loop + its `Combat && !encounter` skip | `packages/sim/src/index.ts:4867`–`:4905` (guard at `:4881`) |
| `legalActions`' Hangout block | `packages/sim/src/protocol.ts:772`–`:831` |
| `HangoutPlayStats` + its `HangoutEvent` fold | `packages/sim/src/index.ts:1155` (interface at `:268`) |
| the smoke fixture's `saveSchemaVersion` pin | `packages/sim/src/balance/checkpoints.ts:356`, `:439` |
| `ENGINE_RULE_DIRECTORIES = ['', 'actions']` | `packages/sim/src/balance/rules-fingerprint.ts:76` |

### Proposed symbols (do not exist yet)

| Proposed symbol | Home | Introduced by | § |
| --- | --- | --- | --- |
| `DareBid` | `packages/engine/src/types.ts` | T-135 | §2 |
| `DareBidEntry` | `packages/engine/src/types.ts` | T-135 | §2 |
| `DareHandState` | `packages/engine/src/types.ts` | T-135 | §2 |
| `GameState.dareHand` | `packages/engine/src/types.ts` | T-135 | §2 |
| `DareMoveKind` | `packages/engine/src/types.ts` | T-135 | §9.1 |
| `Dare` player action | `packages/engine/src/types.ts` | T-135 | §9.1 |
| `ActionBlocked.reason: 'active-dare-hand'` | `packages/engine/src/types.ts` | T-135 | §9.3 |
| `HangoutFailReason` (named extraction of an existing inline union) | `packages/engine/src/types.ts` | T-135 | §10.4 |
| `HangoutEvent.failReason: 'dare-hand-open'` | `packages/engine/src/types.ts` | T-135 | §9.3 |
| `DareHandStarted` / `DarePeeked` / `DareBidPlaced` / `DareHandResolved` | `GameEvent` union, `packages/engine/src/types.ts` | T-135 | §10 |
| `liarsDiceRules.ts` (whole module) | `packages/engine/src/liarsDiceRules.ts` | T-135 | §9.5 |
| `legalDareMoves` / `anteFor` / `headroomFor` / `resolveChallenge` / `dealerMove` | `packages/engine/src/liarsDiceRules.ts` | T-135 | §4, §5, §9.7 |
| `resolveDare` | `packages/engine/src/actions/dare.ts` | T-135 | §9.5 |
| `SeededRng.d6` | `packages/engine/src/rng.ts` | T-135 | §9.6 |
| `DareHandStateSchema` / `DareBidSchema` / `DareBidEntrySchema` / `_covDareHand` / `_covDareBid` / `_covDareBidEntry` | `packages/engine/src/schema.ts` | T-135 | §10.4 |
| `_covHangoutFailReason` | `packages/engine/src/schema.ts` | T-135 | §10.4 |
| `MIGRATIONS[13]`, `CURRENT_SAVE_VERSION = 14` | `packages/engine/src/save.ts` | T-135 | §11 |
| `HangoutVenueParams.dispositionOnFold` | `packages/content/src/portHangouts.ts` | T-135 | §7 |
| `DARE_FOLD_DISPOSITION` / `DARE_PEEK_DC` / `DARE_ANTE_BAND_FRACTION` | `packages/content/src/hangout.ts` | T-135 | §4, §7, §8 |
| `DARE_AI_*` policy constants | `packages/engine/src/liarsDiceRules.ts` | T-135 | §9.7 |
| `planDareMove` / `SIM_DARE_*` constants / `DARE_MAX_MOVES_PER_HAND` | `packages/sim/src/index.ts` | T-135 | §12 |

---

## §1 · The audit — what the Dare is today

READER: this is the baseline §2–§10 replace, and the shape T-137 re-measures against. Every
figure carries provenance.

### 1.1 The whole mechanic, in eleven lines

`resolveVisitHangout`'s `case 'dare'` (`packages/engine/src/actions/hangout.ts:242`–`:318`) is
**one opposed d20 roll**, resolved inline inside a single `applyPlayerAction`:

1. `dealerDie = rng.d20()` off the action's forked rng (`action-hangout-${actionEventIndex}`).
2. `playerRoll = check(die, playerGuile, dealerDie + dealerGuile)`; `dealerRoll = check(dealerDie,
   dealerGuile, die + playerGuile)`. Ties go to the player (`total >= dc`).
3. Two `StatCheck` events — the player's with `actionContext: 'gamble'`, the dealer's with
   `'npc-socialize'`. Both classify to the wire's **gamble** bucket (`wire.ts:96`–`:101`).
4. `wager = max(0, min(max(requested, band.min), min(band.max, playerCredits, dealerCredits)))`
   — the port's band from `wagerBandFor`, then the solvency cap. The clamp **algebra** is the
   engine's; the two bounds are the port's.
5. `creditsDelta = playerWon ? wager : -wager`, applied to the player and mirrored onto the
   dealer through `mutableNpc`.
6. `applyDisposition(state, dealerId, playerWon ? dispositionOnFailure : dispositionOnSuccess,
   'dare', events)` — one `DispositionChanged` per hand, ±10 clamped.
7. One terminal `HangoutEvent{venue:'dare', opponentId, wager, playerWon, creditsDelta}`.

**It costs exactly one dawn die and produces exactly one hand.** There is no state between
`applyPlayerAction` calls: the Dare has no persisted footprint at all today.

### 1.2 What reads the Dare's output — the compatibility surface

Named here because §7 and §10 are constrained by it, not by taste.

| Reader | What it keys on | Location |
| --- | --- | --- |
| `dare_first` deed | `HangoutEvent` · `venue = 'dare'` · `wager >= 0` | `content/deeds.ts:573` |
| `dare_won` deed | `HangoutEvent` · `venue = 'dare'` · `playerWon === true` | `content/deeds.ts:585` |
| `high_roller` deed | `HangoutEvent` · `venue = 'dare'` · `playerWon === true` · `wager >= 250` | `content/deeds.ts:604` |
| `table_regular` deed | `HangoutEvent` · `venue = 'dare'` · `wager >= 0` · `count >= 5` | `content/deeds.ts:618` |
| `HangoutPlayStats` balance fold | `HangoutEvent` — `dares`, `daresWon`, `daresLost`, `wagered`, `netCredits`, `expectedValuePerDare`, `failedVisits` | `sim/index.ts:1155` |
| the Hangout pane's last-dare readout | `HangoutEvent` · `venue === 'dare'` | `ui/src/store.ts:1315` |
| the wire's nat-20/nat-1 stories | `StatCheck.actionContext` → gamble bucket | `engine/src/wire.ts:54`, `:96` |
| `legalActions`' advertised `wager` domain | `wagerBandFor(currentSystemId)` | `sim/src/protocol.ts:820` |
| the interceptor draw (`chooseWeighted`) | `NpcState.disposition`, moved by step 6 | `engine/src/actions/travel.ts:339` |

The last row is the one that makes §7 the headline section: `docs/HANGOUT_REDESIGN.md` §10.4
measured the reach change's payoff **through** the Dare's voluntary disposition — named-captain
interception share 4.22% → 29.28% on the `gambler` arm, gambler inertness 76.26% → 31.65%. That
result is downstream of steps 5 and 6 above and of nothing else the Hangout does.

### 1.3 The measured baseline, and why it is being discarded

The economy bakeoff measured the current Dare at a **57.3% player win rate** and **+120–159cr EV
per dare** (`TASKS.md` D2). The owner's ruling was explicit that this is not a tuning problem —
the mechanic is thin, not mis-numbered. **T-137 measured the new game from scratch**; none of the
old figures is a target, and no constant in this spec may be retuned to reproduce them.

> **MEASURED — see §16 (T-137 capstone, 2026-07-31).** The figures that replace the discarded
> 57.3% / +120–159 cr are a **94.66% player win rate** and **+737.53 cr EV per hand** over
> **15,235 hands** (`.scratch/t137-liars-dice.ts`, 960 runs, fidelity 5/5 against `runCampaign`),
> against the 8,000-row capstone `docs/balance/baseline-t137-liars-dice.json`. **That is not an
> improvement — it is worse, and by ~5× on EV.** §16.2 files it as **finding F-137-1** (the
> baseline planner's opening claim is guaranteed true by construction, and the dealer's terminal
> fallback is CHALLENGE, so the house volunteers a certain loss in 90.48% of its decisions).
> Nothing was retuned in response; §16.7 carries the zero-line `git diff --stat` proof.

---

## §2 · The scene state — `GameState.dareHand`

### 2.1 The ruling: a top-level field, immediately after `encounter`

**PROPOSED (T-135) — `packages/engine/src/types.ts`, inside `GameState` at `:1789`+:**

```ts
  encounter: EncounterState | null;
  /** T-135 · The open Liar's Dice hand, or null. A SCENE, not player-owned data —
   *  see the sibling `encounter` above and docs/LIARS-DICE_REDESIGN.md §2.1. */
  dareHand: DareHandState | null;
```

**Rejected: `player.dareHand`.** `PlayerState` is the captain's sheet — credits, ship, stats,
charts, the dawn hand, the loan, the recovery slot. Every one of those is a fact about the
player alone and survives with them. A Liar's Dice hand is not: it has a **counterparty** whose
purse is already debited, an **escrow** neither side owns yet, and hidden information belonging
to the other side. Putting it under `player` would put the dealer's four hidden dice inside the
player's own state object, which is the wrong place both architecturally and, once §10's
"the UI reads the log" discipline is added, ethically. `encounter` sets the precedent exactly:
it too has a counterparty (`interceptor`) and lives at the top level.

**Rejected: a `scenes: {...}` container.** There would be exactly two members and no rule that
generalises over them. `EncounterState` earned its own key; so does this.

### 2.2 The shape

**PROPOSED (T-135) — `packages/engine/src/types.ts`:**

```ts
/** One standing claim: "there are at least `quantity` dice showing `face`, across
 *  all eight dice in play." `face` 1..6, `quantity` 1..8. */
export interface DareBid {
  quantity: number;
  face: number;
}

/** One line of the hand's public record — everything the UI's bid history and the
 *  T-137 fold need, and nothing that would leak a hidden die. */
export interface DareBidEntry {
  actor: 'player' | 'dealer';
  move: 'bid' | 'raise-face' | 'raise-quantity' | 'raise-both';
  quantity: number;
  face: number;
  /** Credits this actor paid into their own escrow for this move. 0 for the
   *  opening bid (an opening bid is not a raise — §4.2). */
  antePaid: number;
}

export interface DareHandState {
  /** `dare-${day}-${dealerId}-${dayEventCount}` — deterministic, no rng draw.
   *  The `enc-${day}-${dayEventCount}-…` precedent (actions/travel.ts:524). */
  id: string;
  /** FROZEN at open. The port whose band, ante and venue params govern the WHOLE
   *  hand, even if a later reload sees different content. §4.3. */
  systemId: number;
  dealerId: string;
  openedDay: number;
  /** 4 × d6, roll order preserved (NOT sorted — a sorted hand is a different
   *  hand to look at, and the UI animates the roll). */
  playerDice: number[];
  /** 4 × d6. HIDDEN: never enters an event until a challenge reveal (§10.2). */
  dealerDice: number[];
  /** The standing claim, or null before the player opens the bidding. */
  bid: DareBid | null;
  /** Who owns the standing bid — decides who wins a challenge. null iff bid is null. */
  bidder: 'player' | 'dealer' | null;
  /** The per-side seed, resolved and clamped once at open (§3). */
  seedWager: number;
  /** The per-raise ante, resolved once at open (§4). */
  ante: number;
  /** ESCROW, not a tally: credits already debited from `player.credits`. */
  potPlayer: number;
  /** ESCROW: credits already debited from the dealer's purse. */
  potDealer: number;
  /** True after a Peek ATTEMPT, pass or fail. One per hand (§8). */
  peekUsed: boolean;
  /** The one dealer die a successful Peek revealed, or null. */
  peekedDealerDie: { index: number; value: number } | null;
  history: DareBidEntry[];
}
```

### 2.3 Ruling — there is NO `toAct` field

The dealer **answers synchronously inside the player's own action**. Every `Dare` action that
does not end the hand resolves the player's move and then the dealer's answer before returning,
so **every persisted `dareHand` is player-to-act by construction**. A stored `toAct` would be a
constant, and this repo's own standard is that a state field with no consumer is a receipt
(`types.ts:134`, `EarnedDeedState.eventIndex`).

**Rejected: a persisted `toAct` against a future asynchronous dealer.** It buys nothing today
and would need a migration to remove. M4e (T-144–T-148) may revisit it if archetypes ever need
the dealer to hold the turn across a save boundary; until then the invariant `dareHand !== null
⇒ it is the player's move` is worth more than the field.

### 2.4 Ruling — credits are debited at contribution time, into escrow

`potPlayer` and `potDealer` are money **already taken out** of `player.credits` and the dealer's
purse (via `mutableNpc`, per the copy-on-write rule at `npc.ts:666`). Nothing is "owed".

> **INVARIANT (T-135 owes a test):** across a hand's whole life, from open to settlement,
> `player.credits + dareHand.potPlayer` is conserved, and likewise for the dealer.

This is what makes three separate things exact rather than approximate: FOLD's economics (§6)
are a transfer of an escrow that already exists; a mid-hand save round-trip (§11) can neither
mint nor lose the pot, because the pot is a number in the state and not an implied future
transaction; and the T-137 EV fold can be computed from settlement alone.

**Rejected: settle-at-the-end (pots as promises).** A reload mid-hand would then have to
re-derive who owes what from `history`, and a player who folds after their credits fell below
their accumulated antes would produce a negative balance — a rule the rest of the engine never
needs because it never lets an unpaid obligation exist.

---

## §3 · The seed wager — SETTLED: player-chosen, inside the port band, exactly as today

**The hand is opened by the existing action, unchanged in shape:**

```ts
{ type: 'VisitHangout', venue: 'dare', opponentId, wager, spendDie }
```

and `wager` is clamped by **the existing algebra, character for character**
(`actions/hangout.ts:270`–`:277`):

```
requested = action.wager ?? band.min
cap       = min(band.max, player.credits, dealer.credits)
seedWager = max(0, min(max(requested, band.min), cap))
```

Both sides post `seedWager` (which is why the dealer's purse is inside the cap — a stake a broke
dealer cannot match is capped, never a crash).

**Why player-chosen rather than a fixed table stake — four reasons, all of them existing code:**

1. `planDare` (`sim/index.ts:3441`) already sizes a stake off `wagerBandFor`; a fixed stake
   would delete a working policy behaviour and the `GAMBLER_BANKROLL_FRACTION` tuning behind it.
2. `legalActions` (`protocol.ts:820`) already advertises `wager: {kind:'int', min: band.min, max:
   band.max}` from the same accessor; a fixed stake makes that domain a lie.
3. `hangoutPlay.wagered` and `expectedValuePerDare` (`sim/index.ts:268`–`:290`) fold
   `HangoutEvent.wager`; a constant wager makes the first meaningless and the second
   incomparable with the T-125 baseline.
4. `high_roller` (`deeds.ts:604`) triggers on `wager >= 250`. A fixed stake either makes it
   unreachable or automatic.

And one design reason that is not about compatibility: **the seed is the only lever the player
has before seeing a die**, and §4.4 shows it also buys or spends the raising game. That is a
real decision, and D2's ante-rides-the-band ruling only means anything if the seed can vary.

**Rejected: a fixed table stake per port.** It would collapse the four readers above, and the
T-122–T-124 content pass has just authored thirteen distinct wager bands (`portHangouts.ts:297`,
`:388`, `:436`, `:521`, `:585`, `:648`, `:702`, `:757`, `:824`, `:885`, `:942`, `:1015`, plus the
default at `:193`) whose entire expressive job is to make the stake vary by port.

**Rejected: seeding only the player (a house that risks nothing).** The dealer's purse is what
bounds the pot today and is the subject of Finding F-101-1
(`docs/HANGOUT_REDESIGN.md:890`); removing it would make that finding unanswerable and would
make a challenge win pay from nowhere.

---

## §4 · The ante — a rule that reads `PortHangout`, never a per-port constant

### 4.1 The formula

**PROPOSED (T-135) — `packages/content/src/hangout.ts`:**

```ts
/** T-135 · The per-raise ante as a fraction of the port's own wager ceiling
 *  (owner ruling D2: "≈3% of band.max"). ONE number for all fourteen ports; the
 *  VARIATION comes from the bands, which content already authors. */
export const DARE_ANTE_BAND_FRACTION = 0.03;
```

**PROPOSED (T-135) — `packages/engine/src/liarsDiceRules.ts`:**

```ts
export function anteFor(systemId: number): number {
  return Math.max(1, Math.round(wagerBandFor(systemId).max * DARE_ANTE_BAND_FRACTION));
}
```

**RULE: `anteFor` is called exactly once per hand, at open, and its result is stored in
`DareHandState.ante`.** Every subsequent raise reads the stored number. A content edit or a
`portHangoutFor` change between two `applyPlayerAction` calls therefore cannot move the price of
a raise mid-hand — the same reason `systemId` is frozen at open (§4.3).

**There is no per-port ante constant, no `HangoutVenueParams.ante` field and no per-port
branch.** A port that wants a steeper table authors a wider `wager` band; that is the whole of
D2's "ports further away carry steeper stakes", stated as content and read by one rule.

### 4.2 What costs what

| Move | Nominal cost |
| --- | --- |
| the opening bid | **0** — an opening bid is not a raise |
| RAISE FACE | `ante` |
| RAISE QUANTITY | `ante` |
| RAISE BOTH | `2 × ante` |
| CALL THE BLUFF | 0 |
| FOLD | 0 (the forfeit is §6's, not an ante) |
| Peek | 0 credits — it costs a **die** (§8) |

### 4.3 Headroom — per side, against the port's own ceiling

```ts
export function headroomFor(hand: DareHandState, side: 'player' | 'dealer'): number {
  const max = wagerBandFor(hand.systemId).max;
  return Math.max(0, max - (side === 'player' ? hand.potPlayer : hand.potDealer));
}
```

**RULE (the charged amount).** For an actor raising with nominal cost `c`:

```
charged = min(c, headroomFor(hand, side), actorCredits)
```

and the raise is **legal only if `charged === c`**. A partial ante is never taken.

**RULE (the forced ending).** If `headroomFor(hand, side) < ante`, no raise is legal for that
side; the only legal moves are **CALL** or **FOLD**. This is enforced identically on both sides:
the player gets a typed refusal (§9.3), and the dealer policy is never offered the move
(`legalDareMoves` is the single source of legality for both — §5.4).

**RULE (insolvency).** An actor whose credits cannot cover `c` likewise cannot raise, with the
same two consequences. In practice this only binds the dealer, whose purse is not clamped by
`GAMBLER_RESERVE`.

`band.max` is therefore the **per-side exposure ceiling for the whole hand**, seed included.
That is the reading that makes the band mean one thing rather than two.

**Rejected: headroom measured against the antes only, excluding the seed.** Each side could then
stake `band.max` in seed *and* `band.max` in antes, so a "5–200" dive bar could take 400 off a
captain. `band.max` would stop being a ceiling.

**Rejected: a single shared headroom (`band.max − (potPlayer + potDealer)`).** At any seed above
half the band, headroom would be zero from the first move for both sides — the raising game would
vanish at exactly the stakes it is most interesting at, and asymmetric raising (one side raising
more than the other) would starve the other side of moves it did nothing to earn.

### 4.4 The arithmetic that falls out — and it is load-bearing for T-137

The bid lattice (§5) bounds a hand independently of money. From an opening bid of `(q, f)` every
raise strictly increases `q` or `f` and **never decreases either**, with `q ≤ 8` and `f ≤ 6`. So
from the lowest possible opening `(1,1)` there are at most `(8−1) + (6−1) = 12` raises before the
bid is `(8,6)`, where **no raise is legal at any price**.

A RAISE BOTH consumes one face step and one quantity step for `2 × ante` — exactly the same cost
per step as two single raises. **So the maximum ante any one side can pay in a hand is `12 ×
ante = 0.36 × band.max`, regardless of the mix of moves.** Therefore:

> **The ante clamp binds for a side if and only if that side's seed exceeds ≈64% of the port's
> `band.max`** (`band.max − seed < 12 × ante`).

This is exact, port-independent, and it is the answer T-137's "does the clamp fire often enough
to matter" question is measured against. It is **not** a prediction that it never fires: the
gambler sizes its stake at `min(band.max, floor((credits − 3000) × 0.1))`
(`sim/index.ts:3403`–`:3407`), and `docs/HANGOUT_REDESIGN.md`/`deeds.ts:604`'s note records a
measured mean stake of ~697 against the default `band.max` of 1,000 — **69.7%, above the
threshold.** Deep hands at rich tables will hit the clamp. That is the designed behaviour, and
T-137 reports the rate rather than tuning it away.

### 4.5 Worked ante values, from the shipped rows

| Port row | `wager` band | `ante` | max ante spend (12 raises) | clamp binds above a seed of |
| --- | --- | --- | --- | --- |
| `DEFAULT_PORT_HANGOUT` (`:193`) and systems 1, 3 (which omit `wager`) | 25 – 1,000 | **30** | 360 | 640 |
| system 2, the Weighbridge (`:297`) | 50 – 750 | **23** | 276 | 474 |
| system 4, the Garrison Mess (`:521`) | 100 – 400 | **12** | 144 | 256 |
| system 5, the Standing Hall (`:585`) | 25 – 2,000 | **60** | 720 | 1,280 |
| system 6, the Incident Book (`:824`) | 20 – 300 | **9** | 108 | 192 |
| system 7, the Fittings (`:885`) | 15 – 1,200 | **36** | 432 | 768 |
| system 8, the Dry Tank (`:388`) | 5 – 200 | **6** | 72 | 128 |
| system 9, the Turnaround (`:942`) | 75 – 900 | **27** | 324 | 576 |
| system 10, the Bonded Room (`:436`) | 100 – 500 | **15** | 180 | 320 |
| system 11, the High Table (`:648`) | 500 – 3,000 | **90** | 1,080 | 1,920 |
| system 12, the Underhold (`:702`) | 10 – 3,000 | **90** | 1,080 | 1,920 |
| system 13, the Second Watch (`:1015`) | 200 – 1,800 | **54** | 648 | 1,152 |
| system 14, the Long Room (`:757`) | 250 – 1,500 | **45** | 540 | 960 |

(`Math.round` is JavaScript's half-up: `750 × 0.03 = 22.5 → 23`. Stated because it is the one
row where the rounding direction is visible.)

**A headroom walk-through at the Dry Tank (system 8, band 5–200, ante 6).** A captain who seeds
the house minimum of 5 has headroom 195 — 32 raises' worth, far past the lattice's 12, so the
clamp is unreachable. A captain who seeds 150 has headroom 50 — **8 raises**, and the ninth is
refused: at bid `(5,3)` after eight raises the only legal moves left are CALL and FOLD, with 305
credits in escrow across the two sides. That is the beat D2's clamp exists to produce, and at the
dive bar it costs 150 credits to reach.

---

## §5 · The bid lattice, and the exploit closed — stated as a rule

This section is **normative**. It does not cite `TASKS.md`; it restates the ruleset as the
arithmetic `legalDareMoves` implements, so that a later reader who never opens `TASKS.md` cannot
reintroduce the hole.

### 5.1 The five moves, as arithmetic

Let the standing bid be `(q, f)` with `1 ≤ q ≤ 8` and `1 ≤ f ≤ 6`, owned by `bidder`.

| Move | Precondition | Result | Cost |
| --- | --- | --- | --- |
| **OPEN** (`move: 'bid'`) | `bid === null` | `(q', f')` with `1 ≤ q' ≤ 8`, `1 ≤ f' ≤ 6` | 0 |
| **RAISE FACE** | `bid !== null` · `f < 6` · headroom & credits cover `ante` | `f' = f + 1` **exactly**; `q' = q` **exactly** | `ante` |
| **RAISE QUANTITY** | `bid !== null` · `q < 8` · headroom & credits cover `ante` | `f' = f` **exactly**; `q < q' ≤ 8` | `ante` |
| **RAISE BOTH** | `bid !== null` · `f < 6` · `q < 8` · headroom & credits cover `2 × ante` | `f' = f + 1` **exactly** **and** `q < q' ≤ 8` | `2 × ante` |
| **CALL THE BLUFF** | `bid !== null` | resolve, §5.3 | 0 |
| **FOLD** | hand is open (bid may be null) | resolve, §6 | 0 |

Every raise sets `bidder` to the raising actor.

**Illegal, always, and refused with a typed event rather than clamped into legality:** a face
raise that changes `quantity` in either direction; a face raise of more than one step; a face
raise at `f = 6`; a quantity raise that lowers or keeps `quantity`; a quantity raise past 8; a
raise whose ante the actor's headroom or credits cannot cover in full; any move against a null
bid other than OPEN, FOLD or PEEK; any move at all when `dareHand === null`.

### 5.2 Why quantity is pinned, and why the face step is exactly one

**The hole in the first ruleset.** If a face raise may also drop the quantity, then a player
holding `k` dice of some face `g` can always raise to `(k, g)` — and because they *hold* `k`
of them, `actual ≥ k` is guaranteed, so the claim is **risk-free**. A challenge against it is
guaranteed to lose. The player chains this across every face they hold, and the game is a
formality with a decorative ante.

**Pinning quantity closes it.** From `(q, f)` the only face move is `(q, f+1)`. For that to be a
risk-free claim the player must hold `q` dice of face `f+1` as well — with only four dice, the
probability of holding `q` on a specific adjacent face is:

| `q` | P(≥ q of a named face in 4d6) |
| --- | --- |
| 1 | 51.8% |
| 2 | 13.2% |
| 3 | 1.6% |
| 4 | 0.077% |

and **`q ≥ 3` on two different faces at once is arithmetically impossible with four dice**
(`3 + 3 > 4`). So above the shallowest bids the face raise is a genuine claim about the other
side's dice, which is the whole game.

**The single step is not cosmetic — it is half the fix.** If RAISE FACE could jump `f → f + 3`,
a player would simply *search* for the face on which their own count still matches `q` and jump
there, restoring the risk-free claim for as long as any such face exists above the current one.
Restricting the move to `f + 1` removes the search: there is exactly one candidate face, and no
choice about which.

**RAISE BOTH introduces no equivalent hole.** It demands `q' > q` **and** `f' = f + 1`
simultaneously — strictly harder to hold truthfully than a plain face raise, never easier. Its
`2 × ante` price matches that: it is always the riskier claim, and it always costs more.

### 5.3 CALL THE BLUFF — resolution

```ts
export function resolveChallenge(hand: DareHandState): {
  actualCount: number;
  bidderWins: boolean;
} {
  const face = hand.bid!.face;
  const actualCount =
    hand.playerDice.filter((d) => d === face).length +
    hand.dealerDice.filter((d) => d === face).length;
  return { actualCount, bidderWins: actualCount >= hand.bid!.quantity };
}
```

`actualCount >= quantity` ⇒ **the bidder** takes the whole pot (`potPlayer + potDealer`);
otherwise **the challenger** does. The bidder is `hand.bidder`; the challenger is the other side.
Note that the challenger is always the actor who played CALL, because a bid is always answered
before control returns.

**Both hands are revealed on a challenge, and only on a challenge** (§6, §10.2).

### 5.4 One legality function, two consumers

**PROPOSED (T-135) — `packages/engine/src/liarsDiceRules.ts`:**

```ts
export function legalDareMoves(
  hand: DareHandState,
  side: 'player' | 'dealer',
  actorCredits: number,
): DareMoveKind[];
```

`resolveDare` refuses a player move that is not in this list, and `dealerMove` chooses only from
this list. **There is exactly one implementation of "what is legal", and both sides go through
it.** Anything else is how a dealer ends up with a move the player cannot answer.

### 5.5 Wildcards are permanently out of scope

Ones-as-wild is **not** a later enhancement and must not be added by M4e or anything after it. A
held 1 gives a guaranteed floor on *every* face at once, is ~3.5× more common than any specific
match, and reopens a strictly worse version of §5.2's hole — one that pinning quantity does
nothing against, because the wild die satisfies the pinned quantity on the adjacent face too.
This is recorded here, in the rules section, so the sentence lives next to the rule it would
break.

---

## §6 · FOLD's economics — exact

### 6.1 The transfer

**A player FOLD:** the dealer receives the **whole pot**, `potPlayer + potDealer`. Since the
dealer's own `potDealer` was already their money (§2.4), the *net* movement is:

```
player.credits  += 0                     (their escrow is gone; it was debited at contribution)
dealer.credits  += potPlayer + potDealer
creditsDelta     = −potPlayer            (reported from the player's view)
```

So the player forfeits **the seed wager plus every ante they have paid this hand** — exactly
D2's wording — and nothing more. There is **no reveal**: `DareHandResolved.dealerDice` is absent
(§10.2), and the player never learns whether the fold was correct. That is what a fold is.

**A dealer FOLD** is the exact mirror: `player.credits += potPlayer + potDealer`, `creditsDelta
= +potDealer`, no reveal.

**A fold before the opening bid is legal** and forfeits `seedWager` (the escrow at that point is
the seed alone). A captain who rolls four ones may simply pay the table and leave.

### 6.2 The dusk fallback — an open hand at `endDay` is a player fold

**RULE.** `endDay` (`day.ts:484`) gains **one clause**: if `state.dareHand !== null`, resolve it
as a player fold with `outcome: 'timeout-fold'` — identical economics, identical disposition
delta (§7), identical events. Then `dareHand = null`.

**ORDER.** The clause fires **before** the NPC dusk loop, so the dealer's purse settles on the
same tick their own day is simulated, and before the dawn-hand spend-out loop is irrelevant
either way (the hand costs no further dice).

**Why a fold and not an auto-challenge or a void.** Three reasons, in order of weight:

1. **Totality without deadlock.** With this clause, *no reachable state can carry a hand into the
   next dawn*. Every driver — the UI, the sim runner, the LLM harness, a save reloaded by a
   player who never comes back to the table — terminates. §12's totality proof leans on this as
   its second safety net.
2. **It is what a table does when you walk away.** Walking out on a standing bid is a fold
   everywhere the game is played.
3. **It cannot be gamed.** An auto-challenge would make "let the day run out" a free showdown,
   which is strictly better than folding and would make FOLD dead. A void (refund both escrows)
   would make the timeout strictly better than *any* move, which is worse still.

### 6.3 The worked ledger — put this table in front of any reader who doubts §6.1

Default band (25–1,000), `ante = 30`. Seed 100 each side. The player raises twice (2 × 30) and
the dealer once (30).

| | `potPlayer` | `potDealer` | pot |
| --- | --- | --- | --- |
| at open | 100 | 100 | 200 |
| after player RAISE QUANTITY | 130 | 100 | 230 |
| after dealer RAISE FACE | 130 | 130 | 260 |
| after player RAISE FACE | 160 | 130 | 290 |

| Outcome | player credits | dealer credits | `creditsDelta` | reveal? |
| --- | --- | --- | --- | --- |
| player folds (or dusk timeout) | +0 | +290 | **−160** | no |
| dealer folds | +290 | +0 | **+130** | no |
| challenge, player wins | +290 | +0 | **+130** | yes |
| challenge, player loses | +0 | +290 | **−160** | yes |

Note the asymmetry the escrow makes visible and correct: a player who has raised more than the
dealer **loses more than they can win**. That is the ante doing its job, and it is why a bluff
that has been paid for twice is expensive to abandon.

---

## §7 · Disposition — SETTLED: **not** neutral. Three arms, one new field.

This is the section T-134 exists to protect. `docs/HANGOUT_REDESIGN.md` §10's headline result —
named-captain interception share 4.22% → 29.28% on the gambler arm, gambler inertness 76.26% →
31.65% — is produced by the Dare moving `NpcState.disposition`, and by nothing else the Hangout
does. **Ruling the Liar's Dice Dare disposition-neutral would delete T-125's result.** It is not
ruled neutral.

### 7.1 The three arms

| Hand outcome | Disposition delta applied to the dealer | Today's default value |
| --- | --- | --- |
| `challenge-win` — the player wins the showdown | `venueParamsFor(systemId,'dare').dispositionOnFailure` | `DARE_WIN_DISPOSITION` = **−2** |
| `dealer-fold` — the dealer walks | `dispositionOnFailure` (same arm: mechanically a player win) | **−2** |
| `challenge-loss` — the dealer wins the showdown | `dispositionOnSuccess` | `DARE_LOSS_DISPOSITION` = **+2** |
| `player-fold` — the player walks | **`dispositionOnFold`** (new) | `DARE_FOLD_DISPOSITION` = **+1** |
| `timeout-fold` — dusk closed the hand | `dispositionOnFold` (§6.2: identical in every respect) | **+1** |

The existing success/failure framing is **unchanged**: "success" is the arm where the **house**
prevails (`portHangouts.ts:64`–`:87`'s table, row `dare`). This is deliberately not renamed —
thirteen authored port rows and one default row are written against that framing
(`portHangouts.ts:390`, `:438`, `:524`, `:587`, `:650`, `:704`, `:759`, `:826`, `:944`, `:1017`),
and a rename would be a content-wide edit with no mechanical payoff.

`applyDisposition` is applied **exactly once per hand**, with `reason: 'dare'`, at settlement.
Its ±10 clamp and its `delta === 0` early return are unchanged, so a port that authors
`dispositionOnFold: 0` emits no `DispositionChanged` at all — which is the existing behaviour
for every venue field a port zeroes.

### 7.2 Why `+1` for a fold, and why a fold is not neutral

A fold is a social act. The dealer just took the spacer's money **without showing a hand** — the
cheapest possible win, and the one that most makes the dealer well-disposed toward the captain
who keeps paying for the privilege. So the sign matches `DARE_LOSS_DISPOSITION`. The magnitude is
smaller because it was not a beaten spacer: the dealer did not out-play anyone, and the story is
duller.

**This arm WIDENS the voluntary-disposition channel rather than narrowing it.** Today a Dare
produces exactly two possible disposition outcomes; Liar's Dice produces three, and the third is
reachable by a player who is losing and wants to stop. §7.5 states what that means for T-125's
number.

### 7.3 The new content field

**PROPOSED (T-135) — `packages/content/src/portHangouts.ts`, on `HangoutVenueParams` (`:88`):**

```ts
  /** T-135 · Disposition delta when the PLAYER folds a Liar's Dice hand (including
   *  the dusk timeout fold). Read by `dare` only; 0 on every other venue. */
  dispositionOnFold?: number;
```

**PROPOSED (T-135) — `packages/content/src/hangout.ts`:**

```ts
/** T-135 · The dealer took the pot without a showdown — a smaller warming than a
 *  hand actually won (DARE_LOSS_DISPOSITION), and positive for the same reason. */
export const DARE_FOLD_DISPOSITION = 1;
```

Three mechanical consequences T-135 must carry, named here so none is a surprise:

1. **`venueParamsFor` returns `Required<HangoutVenueParams>`** (`hangoutRules.ts:105`), so
   `DEFAULT_PORT_HANGOUT` must author `dispositionOnFold` for **all seven venues** — the `dare`
   row gets `DARE_FOLD_DISPOSITION`, the other six get `0` with the existing
   `// ignored by this venue` comment. The accessor gains a fourth `??` line.
2. **The venue/field table at `portHangouts.ts:64`–`:87` gains a column.** Its `dare` row also
   needs its `dc` cell rewritten (§8) — the two edits land together.
3. **The ten authored port rows that set `dare` params are NOT touched.** They omit
   `dispositionOnFold` and inherit `+1` by field-wise resolution, which is exactly the
   behaviour-preserving property `hangoutRules.ts`'s field-wise rule exists for. **M4d authors no
   new port numbers.** Per-port fold deltas are M4e's business (T-144/T-145), and a content pass
   that wants one has the field waiting.

### 7.4 No new `DispositionChanged.reason`

All three arms report `reason: 'dare'`. The outcome is already carried, precisely, by
`DareHandResolved.outcome` (§10.2), which sits in the same event batch.

**Rejected: a `'dare-fold'` reason.** The `reason` union is declared in three places that must
be widened in lockstep — `types.ts:394`, `npc.ts:678`, `schema.ts:668` — and every reader would
have to learn a fourth Hangout reason to answer a question the neighbouring event already
answers. The one reader that actually cares about the split is T-137's balance fold, which reads
the typed outcome anyway.

### 7.5 The T-125 clause — stated explicitly, because it is an Accept criterion

Four properties are **preserved by construction**, and together they are what keeps
`docs/HANGOUT_REDESIGN.md` §10.4's measurement comparable across the redesign:

1. **The magnitudes are unchanged.** ±2 by default, and every authored port row's `dare` deltas
   (−1 … −7 / +1 … +4) are inherited untouched.
2. **The cadence is unchanged.** Exactly one `applyDisposition` call, and therefore at most one
   `DispositionChanged`, per hand — the same as today.
3. **Hand volume per run is unchanged.** A hand still costs exactly one dawn die at open
   (§9.2), and `GAMBLER_MAX_DARES_PER_DAY = 2` is untouched, so the gambler still plays up to two
   hands a day at a Hangout port. The disposition channel's *throughput* is the same.
4. **The sign convention is unchanged.** A player win still sours the dealer; a player loss still
   warms them. `chooseWeighted`'s grudge/friend weighting (`travel.ts:339`, doc comment `:325`–`:337`) therefore
   reads the same shape of input.

The one thing that **does** change is the *distribution* over the three arms, because the win
rate of a bluffing game is not the win rate of an opposed d20 check, and because a fold is now
reachable. **T-137 is the task that re-measures it**, and its Accept explicitly requires the new
win rate / EV / fold rate to be reported rather than assumed. If T-137 finds the interceptor lift
materially moved, that is a finding for a fresh owner call — **not** a licence to retune
`DARE_FOLD_DISPOSITION` or any band.

**Rejected: ruling the Liar's Dice Dare disposition-neutral.** Its stated cost would be the whole
of §10.4: the gambler arm's named-interception share would revert toward the 4.22% control, the
inertness rate toward 76.26%, and the reach change (14 ports) would lose the measured payoff that
justified it. There is no compensating benefit — the three arms cost one optional content field.

---

## §8 · The Peek — SETTLED: a second die, before the first bid, DC 12

### 8.1 The action and its window

```ts
{ type: 'Dare', move: 'peek', spendDie }
```

**Legal iff** `dareHand !== null` **and** `bid === null` **and** `peekUsed === false`. It costs a
**second unspent dawn die** — validated by the same three-way split every die-costed action uses
(`no-die` / `invalid-die-index` / `die-already-spent`), each a typed refusal that spends nothing.

The window is deliberately "after the dice are rolled, before the bidding opens": it is the beat
D2 named ("at hand-open, before the first bid"), and it is the only beat where the information is
worth a die — a peek after the bidding has started tells you about a hand you have already been
betting against.

### 8.2 The check

```
check(die, player.stats[Stat.GUILE], venueParamsFor(systemId, 'dare').dc)
```

**The `dare` row's previously-ignored `dc` cell becomes the Peek DC.** `DEFAULT_PORT_HANGOUT`'s
`dare.dc` moves **`0` → `DARE_PEEK_DC = 12`** (`portHangouts.ts:201`), sized on `BEFRIEND_DC`'s
band (`hangout.ts:88`, also 12) — the other GUILE check a player makes at a Hangout, so a
captain's read on the Peek's difficulty transfers from a beat they already know.

**Verified: no authored port row sets `dare.dc`.** All ten authored `dare` blocks
(`portHangouts.ts:390`, `:438`, `:524`, `:587`, `:650`, `:704`, `:759`, `:826`, `:944`, `:1017`)
carry only disposition fields. So all fourteen ports inherit DC 12 and **no content row is
touched by T-135** — per-port Peek DCs are M4e's, and the field is already there for them.

`check`'s nat-20 auto-success and nat-1 auto-fail apply unchanged (`dice.ts:160`–`:175`).

### 8.3 What a Peek reveals

**Success:** exactly one of the dealer's four dice, **chosen by the hand's rng, not by the
player** — `peekedDealerDie = { index, value }` where `index = rng.next() × 4 | 0` off the
action's forked rng. The player learns a real die but not which one they would have picked.

**Failure:** nothing. `peekedDealerDie` stays null.

**Either way** `peekUsed = true` and the die is spent. One attempt per hand, pass or fail.

**Rejected: letting the player choose the index.** With four dice and one peek, choosing is not
a decision — the dice are exchangeable before the reveal, so a chosen index is the same
distribution wearing a UI. Rejected as false agency.

### 8.4 The StatCheck consequence — a named obligation for T-135

The Peek emits one `StatCheck{actor:'Player', stat: Stat.GUILE, dc, result, actionContext:
'gamble'}`. That is **the only StatCheck a Liar's Dice hand ever emits.**

Today's Dare emits **two** (`actions/hangout.ts:255`–`:274`): the player's `'gamble'` and the
dealer's `'npc-socialize'`. Liar's Dice has no opposed check, so the dealer's disappears from this
path entirely.

**What survives, verified:** the `'npc-socialize'` context is *also* emitted by the NPC sim's
own Socialize verb (`npc.ts:1338`), so the wire's gamble bucket keeps an NPC-side source and
`pickGambleLoser` (`wire.ts:54`) does not become dead code. What is lost is the *player-adjacent*
NPC gamble nat, and — because the Peek is optional — **the gamble bucket's player-side nat-20 /
nat-1 wire stories now fire only on a peek.**

> **T-135 owes a grep before deleting the old arm** across `wire.ts` (`classifyCheck`,
> `natWireStories`), `content/deeds.ts` (any `StatCheck`-triggered deed), and the sim's telemetry
> buckets, and must **report as a finding** anything that depended on the two-check-per-Dare
> shape. This is a named deliverable, not a suggestion.

---

## §9 · Actions, turn flow, gating, and the AI dealer

### 9.1 The action shape — one type, one move discriminator

**PROPOSED (T-135) — `packages/engine/src/types.ts`, in `PlayerAction`:**

```ts
export type DareMoveKind =
  | 'bid'
  | 'raise-face'
  | 'raise-quantity'
  | 'raise-both'
  | 'challenge'
  | 'fold'
  | 'peek';

  | {
      /** T-135 · One move in the open Liar's Dice hand (`state.dareHand`). The
       *  hand is OPENED by VisitHangout{venue:'dare'} and closed by 'challenge',
       *  'fold', a dealer answer that ends it, or the dusk timeout fold. */
      type: 'Dare';
      move: DareMoveKind;
      /** Required for 'bid' / 'raise-quantity' / 'raise-both'; ignored otherwise. */
      quantity?: number;
      /** Required for 'bid' / 'raise-face' / 'raise-both'; ignored otherwise. */
      face?: number;
      /** 'peek' ONLY. Bids, raises, challenges and folds cost no die. */
      spendDie?: number;
    }
```

This is the `Combat{stance}` shape (`types.ts:1183`), chosen for the same reason: one verb whose
variants share a scene, a target and a lifecycle.

**Rejected: seven separate action types.** `legalActions`, `applyPlayerAction`'s branch chain,
the action schema union, `isIncomeAction` and every policy would each grow seven members for a
set that is only ever legal together.

### 9.2 The die economy — settled

**One hand costs exactly one dawn die** (spent by the opening `VisitHangout`), **or two if the
player peeks.** Bids, raises, challenges and folds cost **no die**. Stated as a rule because it
is what keeps §7.5's property 3 true: hand volume per run is unchanged, so the disposition
channel's throughput is unchanged.

**Rejected: a die per bid.** A four-raise hand would cost five dice — more than a whole dawn hand
— making Liar's Dice unplayable in the game it lives in.

### 9.3 The flow, and the three gates

**Flow:**

```
VisitHangout{venue:'dare', opponentId, wager, spendDie}
      ↓  (spends 1 die; rolls 4 + 4 d6; opens the hand with NO bid)
   [ optional Dare{move:'peek', spendDie} — spends a 2nd die ]
      ↓
Dare{move:'bid', quantity, face}
      ↓  the DEALER ANSWERS INSIDE THE SAME RESOLVER CALL
   … each player raise likewise draws exactly one dealer answer …
      ↓
hand ends when either side CHALLENGES or FOLDS, or at dusk (§6.2)
```

**Gate 1 — an open hand blocks the world, exactly as an encounter does.** While `dareHand !==
null`, the six blockable verbs (`Trade`, `Travel`, `Shipyard`, `Storylet`, `Explore`,
`VisitHangout`) are refused with a typed `ActionBlocked{reason:'active-dare-hand'}` — a **new
`reason`**, mirroring `'active-encounter'` (`day.ts:238`–`:257`). `Reroll`, `Crew`, `Port`,
`Combat` and `Dare` stay exempt, for the identical reasons the encounter gate exempts them.

> This widens `ActionBlocked.reason` (`types.ts:505`) **only** — never `actionType`, which
> already carries all six. No die is spent, `dayEventCount` is untouched, nothing throws.

This gate is what makes "a hand is a scene like Combat" *true* rather than asserted. It is also
what stops the pathological state where a player opens a hand, flies to another system, and asks
a dealer four jumps away to answer a bid.

**Gate 2 — `VisitHangout{venue:'dare'}` while a hand is open** is a typed
`HangoutEvent{venue:'dare', failReason:'dare-hand-open'}`, **no die spent**. (Gate 1 already
refuses it with `ActionBlocked`; gate 2 is the resolver's own defence for any caller that
reaches `resolveVisitHangout` directly, and it keeps the resolver's never-throws contract
self-contained rather than dependent on `day.ts`.) This widens `HangoutEvent.failReason`
(`types.ts:704`) and its `z.enum` (`schema.ts:891`) — see §10.4 for the guard that owes.

**Gate 3 — a `Dare` action with no open hand is a typed no-op fail, NEVER a throw.**
`resolveDare` returns `HangoutEvent{venue:'dare', failReason:'no-dare-hand'}` and changes
nothing.

> **This is deliberately safer than `resolveCombat`, which throws** (`actions/combat.ts:256`).
> The throw was tolerable there only because the sweep runner special-cases it
> (`if (action.type === 'Combat' && !dayState.encounter) continue;`, `sim/index.ts:4881`) — a
> workaround the sim had to grow because the engine chose a throw. §12 adds the analogous skip
> for `Dare` anyway (belt and braces for the mid-batch case), but the engine must not require it.

### 9.4 The dealer answers synchronously — the precedent and the consequence

A player `Dare` move that is a bid or a raise is resolved, and then — in the same
`applyPlayerAction`, off the same forked rng — the dealer's answer is computed and applied. The
call returns with either a new standing bid owned by the dealer, or a resolved hand.

**Precedent:** `resolveCombat` resolves the enemy's counter-fire inside the player's own volley;
the player never sends an "enemy turn" action. Same shape here.

**Consequence (stated so §12 does not have to discover it):** the returned state is *always*
player-to-act, which is what makes §2.3's no-`toAct` ruling sound and what makes §12's
continuation loop terminate.

### 9.5 Where the code lives

| Piece | Home | Why |
| --- | --- | --- |
| `legalDareMoves`, `anteFor`, `headroomFor`, `resolveChallenge`, `dealerMove`, the `DARE_AI_*` constants | **`packages/engine/src/liarsDiceRules.ts`** (new) | The `combatRules.ts` / `exploreOutcomes.ts` / `hangoutRules.ts` precedent: a rule module at the engine root, pure, no state mutation. |
| `resolveDare` (the resolver) | **`packages/engine/src/actions/dare.ts`** (new) | A resolver belongs beside the other resolvers. `actions/hangout.ts` is already 400+ lines with seven arms; adding a multi-turn scene to it would make one file two subsystems. |
| the hand-OPEN arm | `actions/hangout.ts`'s `case 'dare'` — **rewritten, not kept alongside** | The opening move is still a `VisitHangout`, so it stays where the die validation, opponent resolution and `venueOffered` gate already are. |
| the `Dare` branch + rng fork | `day.ts`, `dayRng.fork(\`action-dare-${actionEventIndex}\`)` | Matches every other die-costed action's fork label (`day.ts:401`–`:448`). |
| the dusk fold clause | `day.ts`'s `endDay`, before the NPC dusk loop | §6.2. |

**`liarsDiceRules.ts` is auto-hashed.** `ENGINE_RULE_DIRECTORIES = ['', 'actions']`
(`rules-fingerprint.ts:76`) covers the engine root and `actions/`, so both new files land in
`rulesFingerprint` with **no `ENGINE_NON_RULE_SOURCES` entry** and
`balance-rig.test.ts`'s "classifies every engine source" check stays green without any edit.
Stated here so it is not discovered as a surprise failure.

### 9.6 `SeededRng` needs a `d6`

**PROPOSED (T-135) — `packages/engine/src/rng.ts`:**

```ts
  public d6(): number {
    return Math.floor(this.next() * 6) + 1;
  }
```

`SeededRng` today has `d20`, `rollHand` (which is `d20`-based), `next`, `fork` and `shuffle`
(`rng.ts:5`–`:59`) — there is no six-sided die anywhere in the engine.

**Named consequence:** `rng.ts` is an engine-root source, so adding `d6` moves
`rulesFingerprint` **and** — because the eight opening dice are drawn off the action rng — the
replay goldens for any seed that opens a hand. That is expected; the milestone's one capstone
(T-137) covers it, and the goldens are re-recorded by T-135 as part of its own gate.

### 9.7 The AI dealer — the anti-cheat shape IS the signature

**PROPOSED (T-135) — `packages/engine/src/liarsDiceRules.ts`:**

```ts
export interface DareMove {
  move: Exclude<DareMoveKind, 'peek'>;
  quantity?: number;
  face?: number;
}

export function dealerMove(input: {
  dealerDice: readonly number[];
  bid: DareBid | null;
  bidder: 'player' | 'dealer' | null;
  dealerGuile: number;
  ante: number;
  headroom: number;
  dealerCredits: number;
  /** 0..99, drawn by the caller from the action's forked rng. Keeps the policy pure. */
  roll: number;
}): DareMove;
```

**There is no player-dice parameter, and that is the enforcement.** The function cannot read the
player's hand because the function cannot *express* the player's hand.

**T-135 owes both halves of the proof:**

- **(a) Compile-time.** The input type has no member through which the player's dice, the
  `GameState`, or the `DareHandState` (which contains `playerDice`) could arrive. `dealerMove`
  takes the interface above and nothing else — reviewable in one line.
- **(b) Behavioural.** A test that holds `dealerDice`, the seed, the port and the rng seed fixed,
  varies the player's hidden dice across many values, drives each variant **through the real
  `applyPlayerAction` resolver** (never by calling `dealerMove` directly), and asserts the
  dealer's emitted move sequence is **identical** across all of them. A dealer that peeks would
  diverge on at least one variant.

**This is a distinct bug class.** Nothing existing guards against it: the opposed-GUILE Dare had
no hidden information, `resolveCombat` has no hidden enemy state, and every other verb resolves
against public state. A cheating dealer would not fail any existing test, would not move a
fingerprint in a suspicious way, and would present to a player as "the dealer is uncannily
good" — indistinguishable from difficulty. Hence the test, and hence the signature.

### 9.8 The dealer's policy body

Pseudocode; every named constant is engine-side, in `liarsDiceRules.ts`, and M4e's archetypes
(T-144–T-146) will parameterise exactly these.

```
choices = legalDareMoves(hand, 'dealer', dealerCredits)   // §5.4 — the single legality source

own      = count of bid.face in dealerDice                // 0..4
expected = own + 4/6                                       // 4 unknown dice, 1/6 each ⇒ +0.667
surplus  = bid.quantity − expected                         // how much the bid over-claims

// 1. Is the standing bid too tall to believe?
if surplus > DARE_AI_CHALLENGE_MARGIN − dealerGuile * DARE_AI_GUILE_PATIENCE
      and 'challenge' ∈ choices                            → CHALLENGE

// 2. Hopeless and expensive: no matching dice and a large claim.
if own === 0 and bid.quantity >= DARE_AI_FOLD_QUANTITY
      and 'fold' ∈ choices                                 → FOLD

// 3. Raise if a legal, affordable raise exists.
if roll < DARE_AI_RAISE_BOTH_CHANCE + dealerGuile * DARE_AI_GUILE_BLUFF
      and 'raise-both' ∈ choices                           → RAISE BOTH (quantity + 1, face + 1)
if own >= (bid.quantity + 1) − 4/6
      and 'raise-quantity' ∈ choices                       → RAISE QUANTITY (quantity + 1)
if count(bid.face + 1 in dealerDice) >= bid.quantity − 4/6
      and 'raise-face' ∈ choices                           → RAISE FACE
if roll < DARE_AI_BLUFF_CHANCE + dealerGuile * DARE_AI_GUILE_BLUFF
      and any raise ∈ choices                              → the cheapest legal raise (bluff)

// 4. Terminal fallback — ALWAYS available when a bid stands (§9.9).
                                                            → CHALLENGE
```

| Constant | Value | One-line justification |
| --- | --- | --- |
| `DARE_AI_CHALLENGE_MARGIN` | `1.5` | A bid over-claiming by more than ~1.5 dice against the dealer's own count is more likely false than true at 4 unknown dice. |
| `DARE_AI_GUILE_PATIENCE` | `0.15` | GUILE 5 lowers the margin to 0.75 — a sharper dealer calls a shade sooner, since reading a bluff is exactly what GUILE is. |
| `DARE_AI_FOLD_QUANTITY` | `5` | Holding none of the face and facing a claim of 5+ across 8 dice, the dealer's four dice cannot rescue the challenge; walking is cheaper than paying an ante to find out. |
| `DARE_AI_RAISE_BOTH_CHANCE` | `8` (of 100) | Rare by design — it costs `2 × ante` and D2 calls it the objectively riskier claim. T-137 measures how often it is actually taken. |
| `DARE_AI_GUILE_BLUFF` | `4` (per point) | GUILE 5 adds +20 to both bluff rolls: **higher guile ⇒ bluffs more**, the stated meaning of the stat at the table. |
| `DARE_AI_BLUFF_CHANCE` | `20` (of 100) | A dealer who never bluffs is readable in three hands, which would make the player's own bluffs free. |

**`dealerGuile` is read through the existing `npcGuile` helper** (`actions/hangout.ts:95`) by the
*resolver*, which passes the resulting number into `dealerMove`. The policy never sees an
`NpcState`.

**GUILE origin, recorded in one sentence per the M4d block:** every player and NPC stat is set
once at creation and never mutated anywhere in the shipped engine, so `dealerGuile` is a fixed,
hand-authored 0–5 personality trait (`content/cast.ts`) and the Peek works off a fixed player
GUILE exactly as today's Dare already does. Whether *any* stat should become investable is M6's
question, not this milestone's.

### 9.9 Two dealer rulings that make the scene total

1. **The dealer never folds before the player's opening bid.** There is nothing to fold to; the
   dealer's first decision point is the answer to the opening bid. `dealerMove` is never called
   with `bid === null`, and T-135 should assert that as a precondition rather than inventing an
   opening policy for a state the flow cannot produce.
2. **The dealer always has a legal move.** `CHALLENGE` is legal whenever a bid stands (§5.1),
   unconditionally and at zero cost. Since the dealer is only ever asked to move when a bid
   stands (ruling 1), `legalDareMoves(hand,'dealer',…)` is never empty. That is the totality
   argument on the dealer's side, and it is the mirror of §12.3's on the player's.

---

## §10 · Events, schema, and the drift guards

### 10.1 SETTLED: four new scene event types, **not** a richer `HangoutEvent`

A multi-turn scene gets the `EncounterStarted` / `EncounterRound` / `EncounterResolved`
treatment. `HangoutEvent` is the **one-shot social ledger** for seven venues; folding a bid
history, two escrows, a peek result, eight dice and five outcomes into it would mean ten more
optional fields that six other venues never set, and every one of the nine readers in §1.2 would
become defensive about fields that are absent by design.

**Rejected: a `HangoutEvent{venue:'dare', kind: 'started'|'bid'|'resolved', …}` sub-discriminator**
(the `LoanEvent.kind` shape). `LoanEvent` earned that because its four kinds share one ledger and
one reader. These four share a *scene*, and their readers (the UI's table, T-137's fold) are new.

### 10.2 The four variants

**PROPOSED (T-135) — `packages/engine/src/types.ts`, in the `GameEvent` union:**

```ts
  | {
      type: 'DareHandStarted';
      day: number;
      handId: string;
      opponentId: string;
      systemId: number;
      seedWager: number;
      ante: number;
      /** The PLAYER's four dice. The dealer's are NEVER here — see below. */
      playerDice: number[];
    }
  | {
      type: 'DarePeeked';
      day: number;
      handId: string;
      success: boolean;
      /** Present only on success. */
      dieIndex?: number;
      value?: number;
    }
  | {
      type: 'DareBidPlaced';
      day: number;
      handId: string;
      actor: 'player' | 'dealer';
      move: 'bid' | 'raise-face' | 'raise-quantity' | 'raise-both';
      quantity: number;
      face: number;
      antePaid: number;
      potPlayer: number;
      potDealer: number;
    }
  | {
      type: 'DareHandResolved';
      day: number;
      handId: string;
      opponentId: string;
      outcome:
        | 'challenge-win'    // player won the showdown
        | 'challenge-loss'   // dealer won the showdown
        | 'player-fold'
        | 'dealer-fold'
        | 'timeout-fold';    // dusk closed an open hand (§6.2)
      /** The standing bid at resolution; null iff the hand folded before any bid. */
      bid: DareBid | null;
      /** Present ONLY on the two challenge outcomes. */
      actualCount?: number;
      playerDice: number[];
      /** Present ONLY on the two challenge outcomes — a fold NEVER reveals (§6.1). */
      dealerDice?: number[];
      /** From the player's view. §6.3's table. */
      creditsDelta: number;
      /** The delta PASSED to applyDisposition (pre-clamp). The APPLIED delta is on
       *  the neighbouring DispositionChanged, which is the existing convention. */
      dispositionDelta: number;
    }
```

**THE HIDDEN-DICE DISCIPLINE, stated as a rule.** `state.eventLog` is serialized into the save
and is read directly by the UI. **`dealerDice` must not appear in any event before the reveal**,
and the reveal happens on exactly two outcomes. `DareHandStarted` carries `playerDice` only; a
`DareHandStarted` that carried both hands would leak the dealer's hand to any UI that renders the
log, and would leak it into the save file where a curious player can read it. This is where the
leak would happen, so this is where the rule is written.

(The dealer's dice do live in `state.dareHand.dealerDice`, which is also serialized. That is
unavoidable — the hand has to persist — and it is the same posture the engine already takes with
`market` internals and `npcs`. The discipline being enforced here is that the *narrative log*,
which the UI renders line by line, never contains them.)

### 10.3 The terminal `HangoutEvent` stays, unchanged in shape — this is a ruling

**At settlement, and exactly once, the hand also emits:**

```ts
{ type: 'HangoutEvent', day, venue: 'dare', opponentId,
  wager: hand.seedWager, playerWon, creditsDelta }
```

with `playerWon = (outcome === 'challenge-win' || outcome === 'dealer-fold')` — so `false` on
every fold — and `creditsDelta` the same number `DareHandResolved` carries.

**Two definitions, pinned, because T-137's numbers depend on them:**

- **`wager` is the SEED, not the pot.** It is the player's *chosen stake*, which is what the
  field has always meant and what `high_roller`'s `>= 250` threshold was calibrated against.
- **`creditsDelta` is the NET over the whole hand** (`+potDealer` on a win, `−potPlayer` on a
  loss/fold), so `hangoutPlay.netCredits` stays exactly "the tables' net effect on the purse".

**Why this is load-bearing, and not sentiment.** Nine shipped readers key on this event (§1.2),
four of them content-authored deeds and one of them `HangoutPlayStats` — **the very instrument
T-137 uses**. Dropping the terminal event would silently zero `dares`, `daresWon`, `wagered`,
`netCredits` and `expectedValuePerDare`, break four deeds, and blank the Hangout pane's readout,
and none of it would fail a test until someone read the report.

**Shape unchanged, deliberately.** No new key is added to `HangoutEvent` — every Liar's Dice
detail rides `DareHandResolved`. This keeps `AssertEventKeys<'HangoutEvent'>` and all four deed
triggers untouched. (`dare_first` and `table_regular` match `wager >= 0`, so a fold with a
non-zero seed still counts as a Dare played — correct: the captain sat down.)

**The one `HangoutEvent` change is a VALUE change, not a key change:** `failReason` gains
`'dare-hand-open'` (§9.3) and `'no-dare-hand'` (gate 3). §10.4 says what that owes.

### 10.4 The schema work, split by the two disciplines

**EVENTS are non-strict, so `AssertEventKeys` is their only protection.** For each of the four
new variants, in the same commit:

1. a `schema.ts` variant added to the `GameEventSchema` union — **non-strict**, like every other
   event variant;
2. a line in the coverage block (`schema.ts:1485`–`:1553`):
   ```ts
   const _covEvDareHandStarted: AssertEventKeys<'DareHandStarted'> = true;
   const _covEvDarePeeked: AssertEventKeys<'DarePeeked'> = true;
   const _covEvDareBidPlaced: AssertEventKeys<'DareBidPlaced'> = true;
   const _covEvDareHandResolved: AssertEventKeys<'DareHandResolved'> = true;
   ```
3. the matching `void _cov…` line in the block at `schema.ts:1584`+.

`_covEventTypes` (`schema.ts:1483`) additionally pins the discriminator sets, so a variant added
to `types.ts` and forgotten in the schema fails `tsc` immediately.

**A VALUE-level guard is owed too, and `AssertEventKeys` will not catch it.** Widening
`HangoutEvent.failReason` changes no key, so the key guard sails past it — exactly the hole
`_covExplorationFailReason` (`schema.ts:1511`) was added to close for `ExplorationFailReason`.
T-135 therefore:

1. extracts the inline union at `types.ts:704` into a named
   `export type HangoutFailReason = 'no-die' | 'invalid-die-index' | 'die-already-spent' |
   'no-opponent' | 'venue-not-offered' | 'dare-hand-open' | 'no-dare-hand';` (a
   behaviour-preserving extraction);
2. adds
   ```ts
   const _covHangoutFailReason: AssertEqual<
     HangoutFailReason,
     NonNullable<SchemaEventVariant<'HangoutEvent'>['failReason']>
   > = true;
   ```
   beside its `ExplorationFailReason` twin.

**STATE takes the opposite discipline — everything `.strict()`:**

```ts
const DareBidSchema = z.object({ quantity: z.number(), face: z.number() }).strict();
const DareBidEntrySchema = z.object({ /* … */ }).strict();
const DareHandStateSchema = z.object({ /* … */ }).strict();
```

plus, in `GameStateSchema` (`schema.ts:1353`), `dareHand: DareHandStateSchema.nullable()`
immediately after `encounter`, and three key guards modelled on `_covEncounter`
(`schema.ts:1453`):

```ts
const _covDareHand: AssertEqual<keyof DareHandState, keyof z.infer<typeof DareHandStateSchema>> = true;
const _covDareBid: AssertEqual<keyof DareBid, keyof z.infer<typeof DareBidSchema>> = true;
const _covDareBidEntry: AssertEqual<keyof DareBidEntry, keyof z.infer<typeof DareBidEntrySchema>> = true;
```

The root `_schemaCoversGameState` (`schema.ts:1395`) picks up the new `GameState` key
automatically and will fail `tsc` if the schema is not updated in the same commit — which is the
point of it.

**The action schema** (`schema.ts:1313` neighbourhood) gains a `Dare` variant with `move` as a
`z.enum` of the seven `DareMoveKind` literals, plus optional `quantity` / `face` / `spendDie`.

---

## §11 · Save version and migration

### 11.1 The bump

`CURRENT_SAVE_VERSION` (`save.ts:397`) moves **13 → 14**, with:

```ts
  // v13->v14: T-135 added GameState.dareHand (the open Liar's Dice scene). A v13
  // save has no `dareHand` key, so backfill it to null before schema validation —
  // a statement of fact, not a default. Idempotent: a state that already carries
  // the key keeps it exactly.
  13: (v13State) => ({
    ...(v13State as object),
    dareHand: (v13State as { dareHand?: unknown }).dareHand ?? null,
  }),
```

This is the additive one-key shape of `MIGRATIONS[8]` (`edition`, `save.ts:302`) and
`MIGRATIONS[12]` (`player.recovery`, `save.ts:385`), one level shallower.

### 11.2 The house rule, discharged rather than waved

The standing constraint is that **a migration calls a rule, it does not restate one**. Here the
backfilled value is the literal `null`, so **there is no rule to call** — a v13 save was written
by an engine in which no hand could exist, so "there is no open hand" is a fact about that save,
not a default this migration is choosing. That is `MIGRATIONS[12]`'s own wording, and it applies
verbatim.

### 11.3 What T-135 owes alongside

- **A round-trip test on a MID-HAND state**: a bid standing, non-zero escrow on **both** sides, a
  `peekedDealerDie` present, at least two `history` entries — through `serializeState` →
  `deserializeState`, asserting deep equality including both hidden hands. This is the test that
  proves §2.4's conservation invariant survives a reload.
- **A migration test**: a synthetic v13 envelope loads to v14 with `dareHand === null`, and a v14
  state already carrying a hand is untouched by re-running the migration (idempotence).
- **`createInitialState` sets `dareHand: null`** (`state.ts:178`, beside `encounter: null`).
- **`cloneState` needs NO change** (`clone.ts:60`) — it is a JSON round-trip of everything except
  `eventLog` and `npcs`, so a new plain-data top-level field is deep-copied for free. **Stated so
  nobody adds a branch**; a hand-written clause here would be the exact kind of aliasing bug the
  module's header warns about.
- **`docs/VERSIONING.md` §2** (line 229, "currently `13`") moves to `14` **in T-135's commit**,
  not this one.

### 11.4 The smoke-fixture consequence — named so it is not a surprise

`checkpoints.ts` pins `saveSchemaVersion` (`:356`) and rejects a fixture whose pin does not match
the tree (`:439`). **The version bump alone stales `docs/balance/smoke/tiers.json` and reddens
`balance-smoke.test.ts`**, before any behavioural change is considered — and the engine and
content changes in §4/§7/§8/§9 move `rulesFingerprint` as well.

**The established pattern in this track** (T-131 `b8f184f7`, T-133 `bb239809`, both of which
touched `tiers.json`): **each engine/content task re-extracts the SMOKE fixture to keep its own
gate green; the full 8,000-row capstone is batched once per milestone.** For M4d that capstone is
**T-137**, and `npm run format` runs **before** it, never after. T-135 and T-136 re-extract smoke
only.

---

## §12 · The sim-side player policy — total over the scene's state space

### 12.1 The blocker, stated first

The sweep runner asks a policy for a batch of actions **once per day** and applies them without
re-planning (`sim/index.ts:4867`–`:4905`). A multi-turn scene cannot be planned from the dawn
state, because every move after the opening bid depends on a dealer answer that does not exist
yet. **The moment `VisitHangout{venue:'dare'}` opens a scene instead of resolving inline, every
sweep that plays the tables ends its day with an open hand** — which gate 1 (§9.3) then blocks
every subsequent action against, and which §6.2's dusk fold silently forfeits. The measured EV
would be "the gambler folds every hand", which is not a measurement of anything.

This is why the fix is specified here and not improvised in T-135.

### 12.2 SETTLED: a bounded continuation loop in the runner, not a policy rewrite

**All eight policies keep queueing exactly what they queue today.** `planDare`
(`sim/index.ts:3441`) is **unchanged** — same guards, same `wagerBandFor` stake sizing, same
`ledger.takeBest()` — and so is the gambler's two-hand loop (`:3683`–`:3691`). The runner gains
a continuation loop immediately after each `applyPlayerAction`:

**PROPOSED (T-135) — `packages/sim/src/index.ts`, inside the batch loop at `:4892`+:**

```ts
      const stepped = applyPlayerAction(dayState, action);
      dayState = stepped.state;
      dayEvents.push(...stepped.events);
      ingestBalanceRecords(stepped.events, balanceSample(preActionState, dayState.player.credits), balance);

      // T-135 · A Liar's Dice hand is a SCENE: the policy planned its opening from
      // the dawn state and cannot plan the rest, because every later move answers a
      // dealer bid that did not exist at dawn. Play it out here, one move at a time,
      // folding each step's events exactly as the outer loop does.
      let dareGuard = 0;
      while (dayState.dareHand && dareGuard < DARE_MAX_MOVES_PER_HAND) {
        dareGuard += 1;
        const move = planDareMove(dayState);
        if (!move) break;
        const pre = dayState;
        const played = applyPlayerAction(dayState, move);
        dayState = played.state;
        dayEvents.push(...played.events);
        ingestBalanceRecords(played.events, balanceSample(pre, dayState.player.credits), balance);
      }
      if (dareGuard >= DARE_MAX_MOVES_PER_HAND) dareGuardHits += 1;
```

plus, beside the existing Combat skip at `:4881`:

```ts
      if (action.type === 'Dare' && !dayState.dareHand) continue;
```

(defensive: a `Dare` can only reach the outer batch if a policy ever queues one, which none does
today — but the same class of orphaning that produced the Combat skip applies.)

**Two constraints, both non-negotiable:**

1. **The loop must fold `ingestBalanceRecords` exactly as the outer loop does**, with a
   pre-action sample. If it does not, T-137 measures the opening hand and nothing else.
2. **`DARE_MAX_MOVES_PER_HAND` hits must be COUNTED and asserted zero** in the sim suite — never
   silently swallowed. §12.4 shows the guard is provably unreachable, which is precisely why a
   non-zero count is a bug worth failing on.

**Rejected: re-invoking the whole policy mid-batch.** It changes every policy's contract — they
are documented as planning from the *dawn* state, and `dawnBlind` policies deliberately never see
the mid-day state — for one venue's benefit.

**Rejected: an engine-side auto-play (the engine plays the player's hand out).** That puts a
player policy inside the engine, which is this track's core constraint violated in one line, and
it would make the UI's hand unplayable (the engine would have already finished it).

### 12.3 `planDareMove` — the baseline strategy

**PROPOSED (T-135) — `packages/sim/src/index.ts`, exported:**

```ts
export function planDareMove(state: GameState): PlayerAction | null;
```

Pure, no rng, no die ledger. The algorithm:

```
hand = state.dareHand
if (!hand) return null

own(f) = count of f in hand.playerDice

// (b) No bid stands — open truthfully on the face we hold most of.
if (hand.bid === null) {
  F* = the face with the highest own(f)   (ties → the HIGHER face)
  return { type:'Dare', move:'bid', face: F*, quantity: Math.max(1, own(F*)) }
}

expected = own(hand.bid.face) + 4/6

// (c1) Hopeless: none of the claimed face and a tall claim.
if (own(hand.bid.face) === 0 && hand.bid.quantity >= SIM_DARE_FOLD_QUANTITY)
  return { type:'Dare', move:'fold' }

// (c2) The claim is taller than the evidence supports.
if (hand.bid.quantity > expected + SIM_DARE_CHALLENGE_MARGIN)
  return { type:'Dare', move:'challenge' }

// (c3) Raise if a raise is legal AND affordable AND within headroom.
if (raiseQuantityLegal)  return { move:'raise-quantity', quantity: bid.quantity + 1, face: bid.face }
if (raiseFaceLegal)      return { move:'raise-face',     quantity: bid.quantity,     face: bid.face + 1 }

// (c4) Terminal fallback.
return { type:'Dare', move:'challenge' }
```

| Constant | Value | Justification |
| --- | --- | --- |
| `SIM_DARE_FOLD_QUANTITY` | `5` | Mirrors `DARE_AI_FOLD_QUANTITY` so the two sides fold on comparable evidence and the measured fold rate is not an artefact of an asymmetric baseline. |
| `SIM_DARE_CHALLENGE_MARGIN` | `1.5` | Mirrors `DARE_AI_CHALLENGE_MARGIN` for the same reason. |

The legality predicates in (c3) are computed by the sim from the same public inputs the engine
uses (`bid`, `hand.ante`, `wagerBandFor(hand.systemId).max − hand.potPlayer`,
`state.player.credits`). **The engine remains the authority** — an illegal move is refused with a
typed event and the loop's next iteration re-plans from the unchanged hand, which cannot loop
forever because the fallback at (c4) is unconditional.

### 12.4 The totality proof — written out, because "total" is an Accept criterion

**Claim.** `planDareMove` returns a legal move for every reachable scene state, and the
continuation loop terminates.

**The reachable states partition into exactly three**, and there is no fourth because §9.4
guarantees the returned state is always player-to-act (the dealer never holds the turn at rest,
so "waiting for the dealer" is not a persisted state):

- **(a) `state.dareHand === null`.** Returns `null`; the loop's `while` condition is already
  false, or `break` exits. ✔
- **(b) A hand is open and `bid === null`.** An opening bid is **always** legal: `face ∈ 1..6` is
  satisfied by any held face, and `quantity = max(1, own(F*))` lies in `1..4 ⊆ 1..8`. The opening
  bid costs no ante (§4.2), so neither headroom nor credits can refuse it. ✔
- **(c) A hand is open and a bid stands.** **CHALLENGE is legal unconditionally** — §5.1 gives it
  the single precondition `bid !== null`, it costs nothing, and no clamp applies to it. Branch
  (c4) reaches it on every path that (c1)–(c3) do not take. ✔

**Termination, two independent bounds:**

1. **The bid lattice.** Every raise strictly increases `quantity` or `face` and decreases
   neither, with `quantity ≤ 8` and `face ≤ 6`. So at most **12 raises** can occur in a hand from
   the lowest opening bid (§4.4), after which no raise is legal for either side and the only
   moves are CALL and FOLD — both terminal. Combined with the opening bid, a peek and the
   terminal move, **a hand is at most 15 player actions long**, so
   `DARE_MAX_MOVES_PER_HAND = 32` can never fire. It is a tripwire, not a policy.
2. **The dusk fold.** Even if the loop broke early — a `null` return, an unexpected refusal, a
   future policy that gives up — `endDay`'s timeout-fold (§6.2) closes the hand. **No reachable
   state can carry a hand into the next dawn.**

### 12.5 Two named baseline limitations — coverage gaps, not silent omissions

**The baseline never PEEKS.** Dice are reserved at plan time by the policy's `DieLedger`
(`sim/index.ts:1738`), and the continuation loop runs *after* planning; grabbing a second die
mid-batch would break the ledger's reservation invariant, which every other planner depends on.

> **Consequence, stated so T-137 reports the right thing:** the measured win rate and EV are a
> **no-peek baseline**. The Peek's value is covered by unit tests and T-136's e2e path only, and
> T-137 must label its numbers accordingly. Improving this is T-144's (M4e) business, and it needs
> a `DieLedger` that can be consulted mid-batch — a real change, not a tweak.

**The baseline never chooses RAISE BOTH.** It is not in `planDareMove`'s branch list.

> **Consequence:** T-137's "how often is the 2× ante used" figure measures the **dealer's** use
> only. A zero on the player's side is the baseline, not a bug — say so in the report.

Neither limitation threatens totality: both are moves the baseline *declines*, never states it
cannot answer.

### 12.6 `legalActions` must advertise the scene

`packages/sim/src/protocol.ts`'s Hangout block (`:772`–`:831`) is re-read per step by any UGT
client, so it is naturally total. It gains:

**When `state.dareHand !== null`:**

```ts
actions.push({
  type: 'Dare',
  params: {
    move:     { kind: 'enum', choices: /* legalDareMoves(...) as strings, peek included iff legal */ },
    quantity: { kind: 'int', min: hand.bid ? hand.bid.quantity : 1, max: 8 },
    face:     { kind: 'int', min: hand.bid ? hand.bid.face : 1,     max: 6 },
    spendDie: dieParam,   // 'peek' only
  },
  note: "One move in the open Liar's Dice hand. quantity/face are required for bid and the raises; a face raise moves the face up by exactly one and leaves quantity unchanged; a quantity raise leaves the face unchanged. spendDie applies to 'peek' only.",
});
```

**And, mirroring gate 2 (§9.3), `VisitHangout` drops `'dare'` from its advertised `venue`
choices while a hand is open** — advertising it would offer the driver an action the engine
answers with a guaranteed typed refusal, which is the same class of drift the T-120 port-mirror
and the F-121-1 dead-dealer repair both closed.

The `move` domain is filtered through the **same** `legalDareMoves` the engine and the dealer
use (§5.4), so there is one definition of legality across all three consumers.

---

## §13 · Framework findings

### Finding F-134-1 · The ante clamp is reachable only above a 64%-of-band seed — and the gambler sits just above it

**Status: MEASURED at §16.5 (T-137, 2026-07-31) — the clamp fires on 53.12% of the DEALER's
16,485 decisions and on 0.00% of the player's 1,570.** F-134-1's own prediction lands almost
exactly: the measured mean stake-to-band ratio is **70.05%** against its predicted ~69.7%, the
median is **100.00%**, and **63.13%** of hands (9,618 / 15,235) are seeded above §4.4's
0.64 × `band.max` threshold. §4.4's derivation cross-checks exactly — **zero** band-clamped
decisions occurred at a seed ≤ 0.64 × `band.max` across 18,055 sampled decision points. The
player-side zero is a selection effect explained at §16.5, and it is downstream of finding
F-137-1. Nothing was retuned. *(Original text preserved below.)*

**Status when filed: REPORTED, and it is T-137's to measure, not T-135's to fix.**

§4.4 derives exactly when the headroom clamp can bind: `seed > (1 − 12 × 0.03) × band.max =
0.64 × band.max`. The gambler's stake sizing (`min(band.max, floor((credits − GAMBLER_RESERVE) ×
0.1))`, `sim/index.ts:3403`–`:3407`) produced a **measured mean stake of ~697 against the default
`band.max` of 1,000** (recorded at `content/deeds.ts:604`) — **69.7%, just over the line.**

So the clamp is expected to fire on deep hands at rich tables and essentially never at shallow
ones. **This is the designed behaviour**, and T-137's Accept explicitly asks for the rate. It is
recorded as a finding rather than a tuning note because it is the one place where a sim policy
constant (`GAMBLER_BANKROLL_FRACTION`) and an engine rule constant
(`DARE_ANTE_BAND_FRACTION`) interact to decide whether a mechanic is reachable at all — and a
future edit to either, made for unrelated reasons, could silently make the clamp unreachable
without failing anything.

### Finding F-134-2 · The player-side gamble wire bucket becomes peek-only

**Status: REPORTED, with a named grep obligation on T-135 (§8.4).**

Today's Dare emits two `StatCheck`s per hand. Liar's Dice emits at most one, and only if the
player peeks. The `'npc-socialize'` context survives independently via the NPC sim
(`npc.ts:1338`), so the wire's gamble bucket and `pickGambleLoser` (`wire.ts:54`) do not become
dead code — but the *player-adjacent* gamble nat becomes an optional event. If T-135's grep finds
a deed, telemetry bucket or UI readout that assumed one player gamble check per Dare, that is a
real regression and must be reported before the old arm is deleted.

### Finding F-134-3 · `wagerBandFor` acquires a second meaning

**Status: REPORTED, no action required in M4d.**

`band.max` now means two things at once: the ceiling on a **seed** (§3, its existing job) and the
ceiling on a side's **total exposure** for a whole hand (§4.3, new). They are consistent — the
second contains the first — but a content author retuning a band for one reason now moves the
other. The `HangoutVenueParams` table (`portHangouts.ts:64`) and `wagerBandFor`'s doc comment
(`hangoutRules.ts:71`) must both say so, or a T-144 content pass will move a band for a prose
reason and change how many raises a hand can hold.

---

## §14 · What this spec deliberately does not settle

One line each, so a later reader cannot mistake absence for oversight.

- **The UI, the animation stack, and its new dependency.** T-136's, behind
  `~/.claude/skills/tabletop-ui/SKILL.md`. This spec fixes only what the UI may *read* (§10.2's
  hidden-dice discipline) and never how it looks.
- **The opponent roster, archetypes, the unlock ladder and "Read the Table."** M4e
  (T-144–T-148). §9.8's `DARE_AI_*` constants are shaped to be parameterised by archetype; that
  is the whole of the forward compatibility this spec commits to.
- **Per-port `dispositionOnFold` and per-port Peek DCs.** Both fields exist after T-135 and both
  are inherited by all fourteen ports. Authoring them is M4e's content pass.
- **The 5th/6th die.** The unlock ladder's first two rungs. `DareHandState.playerDice` /
  `dealerDice` are arrays and §5's arithmetic is written in terms of "the 8 dice in play", but
  the quantity cap of 8 and §4.4's 12-raise bound are stated against 4+4 and will need restating.
- **GUILE as an investable stat.** M6's question, closed out of D2 by the owner.
- **The parity ledger re-ask (does the NPC cast get `VisitHangout`?).** Deferred to T-150, to be
  asked against this system rather than against the stub.
- **The manifest version.** Frozen by ruling D4 until the T-130 rulings close.
- **An asynchronous dealer.** §2.3's rejected `toAct`. M4e may revisit if archetypes need it.
- **Wildcards.** Not deferred — **permanently out of scope** (§5.5).

---

## §15 · Handoff — which task implements which section

| Task | Sections it implements |
| --- | --- |
| **T-135** (engine) | §2 (state + schema), §3 (open arm rewrite), §4 (`anteFor`/`headroomFor`), §5 (`legalDareMoves`/`resolveChallenge`), §6 (settlement + the `endDay` clause), §7 (three arms + `dispositionOnFold` + `DARE_FOLD_DISPOSITION`), §8 (Peek + `DARE_PEEK_DC`), §9 (actions, gates, `liarsDiceRules.ts`, `actions/dare.ts`, `SeededRng.d6`, `dealerMove`), §10 (four events + all guards), §11 (migration + round-trip), §12 (runner loop + `planDareMove` + `legalActions`). Smoke re-extract only. |
| **T-136** (UI) | The scene inside `HangoutPanel`, reading §2's state and §10's events. §10.2's hidden-dice discipline is an e2e assertion, not a claim. |
| **T-137** (capstone) | **DELIVERED 2026-07-31 — see §16.** The one `npm run format` (zero files) → fixture re-extract → 8,000-row sweep (`baseline-t137-liars-dice.json`) for the whole milestone. Reported: win rate **94.66%**, EV/hand **+737.53 cr** (§16.1); FOLD rate **0.03%**, never strictly dominant and weakly dominated by CHALLENGE by derivation (§16.3); RAISE BOTH dealer-side **23.18%** of dealer raises, player-side 0 by construction (§16.4); ante clamp **53.12%** dealer / **0.00%** player (§16.5); §7.5's interceptor lift **grew** 29.28% → 47.50% (§16.6). Two findings filed and NOT fixed: **F-137-1** (§16.2) and **F-137-2** (§16.6). |
| **M4e** (T-144–T-148) · the career on top of the game | Specified and measured in `docs/LIARS-DICE-PROGRESSION_SPEC.md`. **Its capstone is that file's §12 (2026-08-01)**, not a §17 here — §16 below is M4d's and is history. M4e re-pinned the baseline of record to `docs/balance/baseline-t148-roster-ladder.json`; §16's `baseline-t137-liars-dice.json` figures stand as the M4d record they were measured as. Two numbers from §12 that bear directly on §16's findings: the win rate fell **94.66% → 80.07%** once the roster and ladder landed, and **F-137-2 improved** — the wronged-captain share fell 47.50% → 26.19% while the lift over uniform rose 2.623× → 2.875×, exactly the fall-back §16.6 said not to read as a regression. **F-137-1 is untouched and still live on pool B** (100.00% of openers guaranteed true), by explicit §3.9 design. |

### The layer above this one — M4e lives in its own file

**This document specifies the GAME. `docs/LIARS-DICE-PROGRESSION_SPEC.md` (T-144) specifies the
CAREER built on top of it** — the fixed 42-opponent roster (3 per `hasHangout` port, beat-once,
with persisted per-opponent purses), the four AI archetypes as executable decision rules, the
five-rung unlock ladder (5/10/20/40/80 games → 5th die → 6th die → "Read the Table" → a ×3 wager
ceiling → the band clamp removed), the two new `PlayerState` fields and the single `v14 → v15`
migration that lands them, and the port-clear / roster-clear achievements. It is implemented by
**T-145–T-148** and its §12 is reserved for T-148's capstone, in §16's shape.

It **adds to** this document and repeals nothing in it. Two clauses in particular carry across
unchanged and are restated there rather than reinterpreted: **§5.5's permanent wildcard
exclusion** (re-confirmed by the M4e bakeoff, which found ones-as-wild reopens a worse version of
the exploit §5.2 closed — it is not a tuning knob), and **§9.7's anti-cheat signature discipline**,
which the new `archetypeMove` inherits verbatim (no `playerDice`, no `GameState`, no
`DareHandState` in its input). The one thing M4e changes about *this* file's rules is that four
dice per side and a claim ceiling of eight become the **tier-0 case** of a function rather than
constants; §16's baseline was measured at tier 0 against pool B, and both stay untouched so the
comparison survives.

---

## §16 · T-137 capstone — the measured Dare (2026-07-31)

**This section reports measurements. It changes no constant.** Every number below carries its
`n` and the instrument that produced it; the figures that are *derived rather than sampled* say
so. The two results that are genuinely broken — **F-137-1** (§16.2) and **F-137-2** (§16.6) —
are written up as findings and left for a fresh owner call, per this track's standing "never
edit a fingerprint, band or threshold to make a test pass" rule.

### 16.0 Method — and the two limitations that bound everything after it

**Read this before any headline.** The sim's baseline hand strategy (`planDareMove`,
`sim/index.ts:3572`) declares two coverage gaps at §12.5, and both are in force here:

1. **NO PEEK.** Dice are reserved at plan time, so the continuation loop never spends one on a
   Peek. Measured: **0 `DarePeeked` events in 15,235 hands.** The Peek's value — and therefore
   whether `DARE_PEEK_DC = 12` is priced right — is **unmeasured by this capstone** and is
   T-144's business.
2. **NO RAISE BOTH on the player's side.** `planDareMove` has no such branch. The player-side
   RAISE BOTH count below is **0 by construction**, not a bug and not a finding; §16.4's figure
   is a *dealer-side* measurement.

**The gate work, in order.**

| Step | Command | Result |
| --- | --- | --- |
| 1 | `npm run format` | **zero files changed** (prettier reported every file `(unchanged)`) |
| 2 | 8 × `balance:sweep --label t137-liars-dice --seeds 1000 --days 120 --policies trader,trader-degraded,fighter,explorer,veteran,smuggler,gambler,greedy --milestone-days 21,29,30,41,60,120 --shard i/8`, then `--merge` | `[balance] wrote aggregate for 8000 rows to …/docs/balance/baseline-t137-liars-dice.json` — 8 × 1,000, no short arm |
| 3 | `balance:extract --aggregate docs/balance/baseline-t137-liars-dice.json` | `[smoke] 4 tiers, spreads harvested, rules a5ec29dba6457f77 / instrument 4de222a04b05a537 / docs b8ed2b1cdefceaf7` |
| 4 | re-pin | `balance-targets.test.ts`, `docs/NPC_REDESIGN.md` ×2, `docs/balance/smoke/README.md` (the last was **stale at `baseline-t125-hangout.json`** — T-131 and T-133 both missed it; corrected here) |

**The fingerprints did not move, and that is the honest reading.** T-135 already re-stamped
`tiers.json` when it landed `liarsDiceRules.ts` / `actions/dare.ts` (§15's "smoke re-extract
only"), and T-136 was UI-only, which `ENGINE_RULE_DIRECTORIES` does not hash. So the "one
re-extract owed for the whole milestone" is discharged as a **provenance re-pin onto a fresh
8,000-row aggregate**, not as a new hash. The milestone's rules hash moved at T-135; it is
`a5ec29dba6457f77` and is unchanged at HEAD.

**The sweep diff isolates the mechanic exactly.** Against `t133-loanband` — the aggregate
measured immediately before the engine landed — `balance:diff` moves **precisely two rows,
`gambler` and `fleet`**, and leaves `explorer`, `fighter`, `greedy`, `smuggler`, `trader`,
`trader-degraded` and `veteran` byte-identical. Every policy that never sits at a table is
unmoved. (Against the outgoing baseline of record `t131-explore-ap` five rows move, because that
file also predates T-133's per-port loan band; the two-row result is the one that attributes.)

**The probe.** `.scratch/t137-liars-dice.ts` (gitignored, read-only, descended from T-125's
`.scratch/t125-hangout.ts` so §16.6's interceptor comparison is like-for-like). **960 runs =
seeds 1..120 × 120 days × 8 policies**, the same arm shape T-125 used. Its one structural
addition is the dare continuation loop, mirrored from `sim/index.ts:5047-5062`; without it every
hand would end open and be dusk-folded and the probe would measure "the gambler folds every
hand". **Fidelity: 5/5 MATCH on five channels** (final credits, deed count, `hangoutPlay.dares`,
`daresWon`, `netCredits`) against `runCampaign` on (1,`gambler`), (2,`gambler`), (3,`gambler`),
(4,`smuggler`), (5,`veteran`). `dareGuardHits` **0**, as `DARE_MAX_MOVES_PER_HAND`'s doc comment
requires. The capstone aggregate cannot answer §16.1–§16.5: `SeedRow`
(`sim/balance/aggregate.ts:250`) carries no dare field, and adding one would have moved
`instrumentFingerprint` in the same commit that took the measurement — the T-116/T-125 split.

**Only the `gambler` policy plays.** All 15,235 hands in the fleet total are the gambler's; the
other seven policies opened zero. Fleet and gambler figures are therefore identical in
§16.1–§16.5 and are quoted once.

### 16.1 Win rate and EV per hand — the headline

| Measure | Value (n = 15,235 hands, 120 runs) |
| --- | --- |
| **player win rate** | **94.66%** (14,421 / 15,235) |
| **EV per hand** | **+737.53 cr** (net +11,236,324 cr) |
| net / seed staked | **93.70%** (11,236,324 / 11,992,057) |
| seed wager | min 0 · p25 226 · **median 500** · p75 1,000 · max 3,000 · mean **787.1** |
| seed as a share of the port's `band.max` | mean **70.05%**, median **100.00%** |
| **bids per hand** | mean **1.19**, median **1**, max 5 |
| Peeks attempted | **0** (§16.0 limitation 1) |

**Outcome mix over all five arms:**

| outcome | count | share |
| --- | --- | --- |
| `challenge-win` | 14,421 | 94.66% |
| `challenge-loss` | 809 | 5.31% |
| `player-fold` | 5 | 0.03% |
| `dealer-fold` | **0** | 0.00% |
| `timeout-fold` | **0** | 0.00% |

`timeout-fold = 0` is the check that the continuation loop drains every hand: no hand reached
dusk open, so no measurement below is contaminated by a silent dusk forfeit. `dealer-fold = 0`
is a real result, not an instrument gap — see §16.4.

**Against the discarded figures.** §1.3 recorded the old opposed-d20 Dare at a **57.3% win rate**
and **+120–159 cr EV**. Those were never a target and are not one now. The new game measures
**94.66% / +737.53 cr** — the mechanic did not get closer to fair, it got **much** further from
it, in the player's favour, and by roughly **5×** on EV.

### 16.2 FINDING F-137-1 · The dealer challenges a claim that is true by construction

**Status: FIXED AT T-160 (2026-08-02) — shipped shape (b), THE OPENING LATTICE.** See **§17** for
the bakeoff, the numbers and the findings it filed. In one line: `isLatticeMove`'s `bid` arm now
requires `quantity > own(face)` via the new `minOpeningQuantity`
(`packages/engine/src/liarsDiceRules.ts`), so an opening claim can no longer be made risk-free.
**Measured post-fix: openers guaranteed true 100.00% → 0.00%** (n = 101,616 hands), player win rate
80.30% → 61.07%, EV/hand +565.8 → +197.3 cr.

**The NOT-CHOSEN shape, logged per the D1/D7 precedent: (a) the dealer's fallback** — make
`dealerMove`'s terminal fallback the cheapest legal *raise* and reserve CHALLENGE for the surplus
test. It was implemented in full and simulated on identical seeds. It lost on two pre-committed
criteria: it **cannot remove the risk-free opener at all** (openers stayed 100.00% guaranteed true
on both pools, because the defect is in the *claim*, not in the answer to it), and its win rate
**73.04%** landed outside the pre-committed 55–70% band. It is scoped to `dealerMove`, i.e. pool B
alone, so it left pool A — **57%** of hands actually played — untouched. §17.3 carries the full
three-arm table. *(The original T-137 text is preserved below, unedited, as the record of what was
measured then.)*

The 94.66% is not noise and not a lucky arm. It has a single mechanical cause, and both halves
of it are individually defensible:

1. **Every opening bid the baseline planner makes is guaranteed true.** `planDareMove` branch
   (b) (`sim/index.ts:3593-3607`) opens at `quantity = max(1, own(bestFace))` on the face it
   holds most of. `resolveChallenge` counts the face across **all eight** dice
   (`liarsDiceRules.ts:214-217`), so `actualCount ≥ own(bestFace) = quantity` **always**; the
   dealer's four dice can only add to it. With four dice over six faces `own(bestFace) ≥ 1`, so
   the `max(1, …)` never binds either. **Measured: 15,235 / 15,235 opening bids (100.00%) were
   guaranteed true.**
2. **The dealer's terminal fallback is CHALLENGE.** `dealerMove` branch 4
   (`liarsDiceRules.ts:345-350`) returns `{ move: 'challenge' }` whenever no earlier branch
   fires — which §9.9 ruling 2 chose deliberately, because CHALLENGE is the one move that is
   always legal and so makes the dealer's policy total. Against an opening bid of `(1, f)` or
   `(2, f)` the surplus test (branch 1) cannot trip, the fold test (branch 2) needs
   `quantity ≥ 5`, and the raise tests need dice the dealer usually does not hold — so the
   fallback is where most hands land.

**Put together, the dealer volunteers a certain loss.** Measured, splitting every showdown by
who played CALL:

| challenger | showdowns | challenger won |
| --- | --- | --- |
| **the DEALER** | 14,915 (90.48% of its 16,485 decisions) | **793 — 5.32%** |
| the player | 315 | 299 — 94.92% |

The dealer's own move mix says the same thing: `challenge` **14,915**, `raise-quantity` 857,
`raise-both` 364, `raise-face` 349, `fold` **0**. Nine dealer decisions in ten are a challenge,
and nineteen in twenty of those lose.

**Why this is a design finding and not a tuning note.** Nothing here is mis-numbered. The
lattice is sound, the ante is sound, `DARE_AI_CHALLENGE_MARGIN` is a reasonable margin. The
defect is *structural*: a bidding game in which the opening claim can be made risk-free, against
an opponent whose default answer is to call it, has no bluffing in it at all. **Three shapes
that would each close it, none applied here:**

- **the dealer's fallback** — make the terminal fallback the cheapest legal *raise* and reserve
  CHALLENGE for the surplus test, so the dealer stops paying for information it already has;
- **the opening lattice** — require an opening claim to exceed what the bidder holds (a
  `quantity > own(face)` opening rule), which removes the risk-free claim at its source and is a
  §5-level rule change, not a constant;
- **the baseline planner** — teach `planDareMove` to open above its own count. This one is
  **not** a fix: it would move the measurement without moving the game, since a human player
  would simply keep opening truthfully.

The first two are engine rules and belong to an owner. **Recommended: raise at M4e, alongside
the archetype pass that already reshapes `DARE_AI_*`.**

**What it costs the economy, from the 8,000-row capstone** (`balance:diff t133-loanband →
t137-liars-dice`, `gambler` row):

| gambler, n = 1,000 seeds | before (t133) | after (t137) |
| --- | --- | --- |
| `finalCredits.median` | 56,686 | **94,798** (+67.2%) |
| `tourOneClearRate` | 0.8470 | **0.9520** (+12.4%) |
| `debtClearedDay.median` | 25 | **22** (−12.0%) |
| `portOwnershipRate` | 0.8330 | **0.9880** (+18.6%) |
| `survival.shipsLost` | 26 | 47 (+80.8%) |

The gambler is now the richest archetype in the fleet by a wide margin. (The rising death count
is downstream of wealth, not of the tables: a rich gambler flies more and buys fights it would
previously have avoided — `combatCells[*/unprepared].purseDelta.mean` all move sharply negative.)

### 16.3 FOLD — the rate, and the dominance question settled

**The rate: 5 folds in 15,235 hands — 0.03%.** All five were post-bid; **zero** pre-bid folds,
because `planDareMove` branch (b) always opens rather than walking. Across 1,570 player decision
points with a bid standing, FOLD was **legal at 100.00%** of them and taken at 0.32%.

**Is FOLD ever strictly dominant? No — and it never can be. This is a derivation, not a sample.**

The escrow is debited at contribution time (§2.4), so at any decision point the player's
`potPlayer` is already spent. A fold forfeits it with certainty (§6.1) and CHALLENGE costs
nothing, so with `P_false = P(actualCount < quantity)`:

```
EV_fold       = −potPlayer
EV_challenge  = P_false·(+potDealer) + (1 − P_false)·(−potPlayer)
EV_challenge − EV_fold = P_false · (potPlayer + potDealer)  ≥ 0   ALWAYS
```

**So FOLD is weakly dominated by CHALLENGE at every reachable state, and strictly dominated
wherever `P_false > 0`** — i.e. everywhere except `quantity ≤ own(face)`, where the standing bid
is guaranteed true and the two are exactly equal. It is *never* strictly better than CHALLENGE
in credits, at any hand strength, at any pot size. Measured against the baseline's five actual
folds: **5/5 (100.00%) fell in the strictly-dominated set** (`P_false > 0`), none in the tied
set, and the summed `Σ P_false · pot` left on the table was **3,136 cr — 627.20 cr per fold**,
0.21 cr per hand.

**Across hand strengths, as a table.** `P_false` is computed analytically from
`Binom(4, 1/6)` — the same four-unknown-dice model `dealerMove` reasons with
(`liarsDiceRules.ts:299-303`) — never re-rolled. Cells are `n`, mean `P_false`, mean edge in
credits:

| `own(bid.face)` | q = 1–2 | q = 3–4 | q = 5–6 | q = 7–8 |
| --- | --- | --- | --- | --- |
| **0** | 346 · 0.68 · 695 cr | 244 · 0.99 · 964 cr | 5 · 1.00 · 627 cr | — |
| **1** | 452 · 0.48 · 463 cr | 148 · 0.91 · 997 cr | 2 · 1.00 · 2,105 cr | — |
| **2** | — | 343 · 0.48 · 432 cr | 10 · 0.98 · 1,159 cr | — |
| **3** | — | 20 · 0.48 · 537 cr | — | — |
| **4** | — | — | — | — |

Every populated cell has a **non-negative** edge and every one of them is **strictly positive**.
There is no corner of the hand-strength space where folding is the better credit play.

**The two counterweights, stated honestly rather than declaring the mechanic broken.**

1. **A fold pays disposition the credits-only EV ignores.** `DARE_FOLD_DISPOSITION = 1`
   (`content/hangout.ts:132`) where a player *win* pays `DARE_WIN_DISPOSITION = −2`. Walking
   away warms the dealer; beating them sours the dealer. That is a real payoff in a currency
   this section does not price, and §16.6 shows the currency has teeth.
2. **The "no reveal" benefit is mechanically inert today.** §6.1 says a fold conceals the
   player's dice. Against the shipped house AI that buys nothing: `dealerMove`
   (`liarsDiceRules.ts:274-283`) takes `dealerDice`, `bid`, `bidder`, `dealerGuile`, `ante`,
   `headroom`, `dealerCredits` and `roll` — **no history parameter, no cross-hand memory, and no
   `GameState`.** There is no channel through which a past reveal could reach a future decision.
   Concealment will become worth something when M4e gives archetypes memory; it is worth nothing
   now.

**The counterfactual, and it is the empirical half of the answer.** The same 960 runs re-flown
with a probe-local `planDareMoveNoFold` (identical to the shipped planner except branch (c1)
returns `challenge`; the shipped function is untouched — T-116's ablation precedent):

| | baseline | FOLD ablated |
| --- | --- | --- |
| hands | 15,235 | 15,216 |
| win rate | 94.66% | 94.68% |
| EV / hand | +737.53 cr | **+738.74 cr** |
| mean final credits (gambler) | 93,487 | 93,178 |
| `player-fold` outcomes | 5 | 0 |
| dare disposition arm mix | `−7…+4`, 13,758 events | same shape, 13,729 events |

**Removing FOLD from the player's repertoire entirely changes EV per hand by +0.16% and the
gambler's mean final credits by −0.33%.** At the shipped baseline, FOLD is a *null* mechanic —
neither a trap nor a tool. That is a coverage statement about the baseline planner as much as
about the rule; a human player who folds often would be leaking the per-fold 627 cr edge above.

> **RULED AT T-177 (2026-08-06) — F-160-3 closed; the binding ruling is `docs/LIARS-DICE-DECISIONS.md`
> LD-26, and it is not restated here.**
>
> §16.3's derivation above is **untouched and still true**: FOLD is weakly dominated by CHALLENGE in
> credits everywhere and strictly dominated wherever `P_false > 0`. What §16.3 never did was price
> the SECOND currency, and that is where the ruling lives. Writing the crossover as an expression
> over the three live constants in `packages/content/src/hangout.ts` — never as a literal — FOLD is
> the disposition-better play iff `P_false > (LOSS − FOLD)/(LOSS − WIN)`; and the reachable `P_false`
> spectrum off this file's own model is not dense on `[0,1]` but `{0} ∪ [(5/6)^u, 1]` for
> `u ∈ {4,5,6}`, because `q − own ≤ 0` gives exactly 0 and `q − own ≥ 1` gives at least
> `1 − probAtLeast(1, u)`. **That floor clears the crossover at every shipped tier.** So the two
> currencies PARTITION: wherever FOLD strictly loses credits it strictly wins disposition, and where
> it does not lose credits at all the credit comparison is a tie. FOLD is a **priced trade, not a
> dead move** — and §16.6's measured interceptor lift is what makes the currency it buys worth having.
>
> **Counterweight 2 above (concealment) is RETIRED from the justification.** It is inert, exactly as
> §16.3 says, and the ruling does not lean on it — it is *not* part of why FOLD is kept. M4e still
> owns the memory that would make it worth something.
>
> Nothing shipped in `packages/engine/src` beyond comments; `rulesFingerprint` was computed before
> and after and is unmoved, so the "if anything ships" clause did not fire. Shapes (B) *give
> concealment a real channel* and (C) *change FOLD's economics* were both logged and rejected, with
> reasons, in LD-26.

### 16.4 RAISE BOTH — the 2× ante

| | count |
| --- | --- |
| **player** `raise-both` | **0 — by construction** (§16.0 limitation 2) |
| **dealer** `raise-both` | **364** |
| as a share of the dealer's 1,570 raises | **23.18%** |
| as a share of all 16,485 dealer decisions | **2.21%** |

`DARE_AI_RAISE_BOTH_CHANCE = 8` (of 100, `liarsDiceRules.ts:238`), and the observed 2.21% sits
below it exactly as expected: the branch is gated on `faceRoom && quantityRoom &&
affordable(2 × ante)` *and* is reached only after the challenge and fold tests decline, and 90.48%
of dealer decisions terminate at the challenge branch before the roll is ever consulted. Read
against the raises only, 23.18% of dealer raises are the double — the move is rare but not
vestigial.

Full dealer bid mix: `raise-quantity` 857 · `raise-both` 364 · `raise-face` 349 (plus 14,915
challenges and 0 folds). Full player bid mix: `bid` 15,235 · `raise-quantity` 1,250 ·
`raise-face` 0 · `raise-both` 0.

### 16.5 The ante clamp (F-134-1) — it fires hard on the house and never on the player

**Both binders reported separately**, using the shipped accessors `headroomFor(hand, side)` and
`chargedAnte` (`liarsDiceRules.ts:58-72`). *Band-clamped* = the lattice still allows a raise
(`face < 6` or `quantity < 8`) but `headroom < ante`. *Solvency-clamped* = `credits < ante`.

| | player | dealer |
| --- | --- | --- |
| decision points | 1,570 | 16,485 |
| **band-clamped** | **0 (0.00%)** | **8,757 (53.12%)** |
| **solvency-clamped** | **0 (0.00%)** | 2,127 (12.90%) |
| RAISE BOTH priced out | 10 (0.64%) | — |
| terminal CALL/FOLD made from a clamped state | 0 / 320 (0.00%) | — |

- **Hands where §4.4 says the clamp *could* bind (seed > 0.64 × `band.max`): 9,618 / 15,235 =
  63.13%.** F-134-1 predicted "just over the line" and it is: the measured **mean stake-to-band
  ratio is 70.05%** against its predicted ~69.7%, and the **median is 100.00%** — the gambler
  seeds at the full port ceiling more often than not.
- **§4.4's arithmetic cross-checks exactly: 0 band-clamped decisions occurred at a seed
  ≤ 0.64 × `band.max`.** The derivation holds against 18,055 sampled decision points.
- **Why the player-side rate is 0.00% and it is not an instrument bug.** A player decision point
  only exists when the *dealer* raised — the dealer's answer is synchronous, so a hand that ends
  on the dealer's first move never returns control. But the dealer can only raise when *its own*
  headroom covers an ante, and both sides seed the same `seedWager` against the same `band.max`,
  so the very condition that would clamp the player is the condition that stops the dealer
  handing control back. The clamp is real, reachable and firing at 53.12% — the player is
  structurally never the one it fires on. **This is a selection effect, reported as one.**
- **The answer to "does it fire often enough to matter": on the house, decisively yes; on the
  player, not once in 1,570 opportunities.** It is not retuned here. Its rate is a consequence
  of F-137-1 (hands are 1.19 bids long, so nobody spends their headroom) and re-measuring it is
  owed to whichever task closes that finding.

*One incidental note, not new:* `[A]`'s minimum seed wager is **0** — the pre-existing
zero-credit-stake condition T-125 recorded as F-123-3 (the seed is clamped to the dealer's purse,
and a broke dealer deals a free hand). Unchanged by this redesign, still not fixed here.

### 16.6 The §7.5 obligation — did §10.4's interceptor lift survive?

Same instrument, same seeds, same days, same policies as T-125, so this is like-for-like against
`docs/HANGOUT_REDESIGN.md` §10.4's recorded AFTER column. Reconstruct misses **0 / 5,801**.

| `gambler` (120 runs) | §10.4 AFTER (opposed-d20 Dare) | **T-137 (Liar's Dice)** |
| --- | --- | --- |
| named interceptions | 929 of 3,689 (25.18%) | 880 of 3,548 (24.80%) |
| **inertness rate** | 31.65% | **23.52%** |
| mean lift `P_w / P_u` | 1.4814× | **1.6649×** |
| **chosen at disposition < 0** | 272 / 929 (**29.28%**) | **418 / 880 (47.50%)** |
| analytic uniform expectation | 9.904% | 18.108% |
| **wronged-captain lift** | 2.956× | **2.623×** |
| mean disposition of the CHOSEN captain | −1.378 | **−2.453** |
| mean disposition of their POOL | −0.294 | −0.764 |

| fleet (960 runs) | §10.4 AFTER | **T-137** |
| --- | --- | --- |
| interceptions | 23,100 | 23,037 |
| of which named | 5,706 (24.70%) | 5,801 (25.18%) |
| inertness | 69.56% | **67.83%** |
| chosen at disposition < 0 | 578 / 5,706 (10.13%) | **734 / 5,801 (12.65%)** |
| analytic uniform expectation | 4.223% | 5.326% |
| wronged-captain lift | 2.398× | **2.376×** |
| mean disposition CHOSEN vs POOL | −0.402 / −0.102 | −0.534 / −0.161 |

**§10.4's lift did not merely survive — it grew by roughly 60%, and §7.5 requires that to be
reported as a finding rather than banked.** The gambler's headline was *nearly three in ten of
its named interceptions are flown by someone it beat at cards* (**29.28%**). It now reads
**47.50% — nearly one in two.** Inertness fell from 31.65% to **23.52%**, the mean disposition of
the chosen captain deepened from −1.378 to **−2.453**, and the weighting lift `P_w/P_u` rose from
1.4814× to **1.6649×**.

§7.5's four preserved properties held exactly as written — the magnitudes are untouched, the
cadence is still one `applyDisposition` per hand, hand volume per run is unchanged
(`GAMBLER_MAX_DARES_PER_DAY` 2, one dawn die per hand), and the sign convention is the same. So
the movement is **not** a property violation. It is the *distribution over the three arms*
shifting, which §7.5 explicitly predicted would move and asked to have measured.

**FINDING F-137-2 · The interceptor lift's growth is a symptom of F-137-1, not an independent
win. Status: REPORTED, left for the same owner call.** The souring arm fires whenever the player
wins, and the player now wins 94.66% of hands (§16.1). The wronged-captain share rose because
the *win rate* is broken, not because disposition got better tuned. **The number to watch is the
wronged-captain lift over uniform, which is the part that measures the weighting rather than the
roster's mood: it went 2.956× → 2.623×, i.e. slightly DOWN.** The draw is doing marginally less
work than it was; the roster is simply angrier. Anyone fixing F-137-1 should expect this figure
to fall back toward 29% and must **not** read that as a regression in the interceptor draw.

**The third arm is now visible in the mix.** `DispositionChanged{reason:'dare'}` fired 13,758
times, by applied delta: `−7` 505 · `−6` 548 · `−5` 770 · `−4` 1,981 · `−3` 2,320 · `−2` 5,385 ·
`−1` 1,435 · `+1` 248 · `+2` 412 · `+3` 93 · `+4` 61. **The souring arm carries 12,944 of 13,758
(94.08%)** and the warming arms 814 (5.92%) — which is F-137-1 again, seen through disposition:
the player wins 94.66% of hands, so the dealer is soured 94.08% of the time. The `+1` fold arm
fired **248 times, 1.80%** of dare disposition movement.

**No band and no disposition constant was touched.** Per §7.5's closing sentence, a materially
moved lift is a finding for a fresh owner call and **not** a licence to retune
`DARE_FOLD_DISPOSITION` or any port's `dare` arms. It moved; it is filed as F-137-2 above; and
`DARE_WIN_DISPOSITION` (−2), `DARE_LOSS_DISPOSITION` (+2), `DARE_FOLD_DISPOSITION` (+1) and all
fourteen authored `dare` rows sit at exactly the values T-135 inherited.

### 16.7 What was NOT tuned

`git diff --stat` for this commit, restricted to hashed rule and instrument sources:

```
$ git diff --stat -- packages/engine/src packages/content/src \
                     packages/sim/src/index.ts packages/sim/src/balance
(no output — zero files, zero lines)
```

The **only** source line this task touched is the baseline path string in
`packages/sim/src/__tests__/balance-targets.test.ts:103`, which is a data re-pin the file's own
header comment names as the single line to update. The `it.fails` tripwire at `:225` was checked
and **stays correctly red**: the trader clears on day **21** against `[22, 30]` at **n = 990** on
the new baseline (21 at n = 987 on the old), so it did not invert and was not flipped. No band,
no threshold, no fingerprint and no golden was edited.

**Constants left at their shipped values**, listed so a later reader can see the retune that did
not happen: `DARE_ANTE_BAND_FRACTION` 0.03 · `DARE_PEEK_DC` 12 · `DARE_WIN_DISPOSITION` −2 ·
`DARE_LOSS_DISPOSITION` +2 · `DARE_FOLD_DISPOSITION` +1 · `DARE_MIN_WAGER` 25 ·
`DARE_MAX_WAGER` 1000 · `DARE_AI_CHALLENGE_MARGIN` 1.5 · `DARE_AI_GUILE_PATIENCE` 0.15 ·
`DARE_AI_FOLD_QUANTITY` 5 · `DARE_AI_RAISE_BOTH_CHANCE` 8 · `DARE_AI_GUILE_BLUFF` 4 ·
`DARE_AI_BLUFF_CHANCE` 20 · `DARE_MAX_QUANTITY` 8 · `DARE_MAX_FACE` 6 · `DARE_DICE_PER_SIDE` 4 ·
`SIM_DARE_FOLD_QUANTITY` 5 · `SIM_DARE_CHALLENGE_MARGIN` 1.5 · `GAMBLER_BANKROLL_FRACTION` ·
`GAMBLER_RESERVE` · `GAMBLER_MAX_DARES_PER_DAY` 2 · **all fourteen authored `wager` bands** in
`content/portHangouts.ts`.

### 16.8 What this capstone leaves open

1. **F-137-1** (§16.2) — the risk-free opening claim against a challenge-happy dealer, and the
   94.66% / +737.53 cr it produces. **An owner call.** Recommended home: M4e (T-144–T-148),
   which already reshapes `DARE_AI_*`.
2. **F-137-2** (§16.6) — the interceptor lift grew 29.28% → 47.50% as a *symptom* of F-137-1,
   while the weighting's own lift over uniform slipped 2.956× → 2.623×. Same owner call; whoever
   closes F-137-1 should expect this to fall back and must not read that as a regression.
3. **The Peek is unmeasured** (§16.0). `DARE_PEEK_DC = 12` has never been exercised by any arm.
   Whoever gives the baseline planner a Peek owes the measurement.
4. **The player-side RAISE BOTH is unmeasured** (§16.0), for the same reason.
5. **The clamp's player-side rate is 0 for a reason that is downstream of F-137-1** (§16.5) and
   must be re-measured once hands run longer than 1.19 bids.
6. **FOLD is a null mechanic at the shipped baseline** (§16.3) and is weakly dominated by
   CHALLENGE by construction. Whether that is acceptable — a fold that is never the better
   credit play, whose only positive payoff is `+1` disposition and whose stated concealment
   benefit is inert against a memoryless dealer — is a design question, not a constant.
   > **RULED AT T-177 (2026-08-06)** — carried to T-160 as F-160-3 (§17.7, §17.8) and closed there.
   > The shape taken is **(A): accept FOLD as a disposition move and say so in the spec** — but on
   > the stronger argument, not the "flavour" one. The two currencies PARTITION and FOLD is a
   > **priced trade** rather than a null mechanic: it is never the better credit play and is the
   > better disposition play at every state where the credit comparison is not already a tie.
   > Shapes (B) *give concealment a real channel* and (C) *change FOLD's economics* were rejected
   > with reasons. The binding ruling is `docs/LIARS-DICE-DECISIONS.md` **LD-26**; the concealment
   > half of item 6's own wording is retired from the justification rather than repeated.

---

## §17 · T-160 capstone — F-137-1 closed, the bakeoff that closed it (2026-08-02)

**What this section is.** T-137 filed **F-137-1** (§16.2) as an owner call with three candidate
shapes and fixed none of them. T-148 confirmed it survived the roster and the ladder untouched
(100.00% of openers still guaranteed true, `docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.2). T-160 was
scheduled by the owner to run **before** the T-158 UAT halt, because UAT's purpose is the owner's
first honest read of pacing and dice-tension and the bar as shipped distorted that read. This is
the bakeoff, the shipped fix, and every number owed.

### 17.0 Method, and the four ground-truth corrections this task made first

| | |
| --- | --- |
| Base commit | `d9b3a1bc` on `redesign/explore-hangout` |
| Bakeoff rig | three **git worktrees** off the same commit — `control` (no change), `cand-a`, `cand-b` — each with its own `node_modules/@spacerquest/*` symlinks so a build in one cannot leak into another. **The main tree was byte-clean through the whole bakeoff** (`git status` verified before and after). |
| Bakeoff arm | `gambler`, seeds 1..200 × 120 days, per arm. **33,636 / 33,965 / 34,008 hands** — past the `n ≥ 1,000 hands` sizing rule in every archetype cell. |
| Capstone arms | **Arm 1** = seeds 1..120 × 120 days × 8 policies (960 careers, 20,397 hands) — the like-for-like shape §12.6's interceptor column uses. **Arm 2** = `gambler`, seeds 1..600 × 120 days (600 careers, **101,616 hands**) — depth. |
| Probe | `.scratch/t160-postfix.ts`, **REBUILT and declared as rebuilt**: the T-137/T-148 probe lived in `.scratch/`, which was never committed (`git log --all -- .scratch` is empty), so this is not a verbatim descendant. It re-implements `runCampaign`'s day loop because `runCampaign` returns a summary and all four owed numbers are per-HAND facts. |
| Fidelity | The probe loop is checked against `runCampaign` on **six channels** (`finalCredits`, `deedCount`, `dares`, `daresWon`, `netCredits`, `dareGuardHits`) over 5 (seed, policy) pairs — **PASS on every arm**. Gates asserted to **zero on every arm**: `dareGuardHits`, hands left open, `timeout-fold`, unresolved hands, per-`handId` join misses, interceptor reconstruct misses. |

**Four corrections to the task's own framing, made before anything ran.** The task block was
authored against T-148 HEAD; four things had moved.

1. The **baseline of record is `docs/balance/baseline-t182-reroll-fix.json`**, not
   `baseline-t148-roster-ladder.json` — T-150 and T-182 both moved `gambler` in between. §17.5
   diffs against **both**: t182 is the pair that *attributes* the mechanic, t148 is the
   *economic* read §16.2's cost table compares to.
2. The named source anchors had drifted: `planDareMove` is `packages/sim/src/index.ts:3699`
   (branch (b) at :3706-3722), not `:3593-3607`; `dealerMove` is
   `packages/engine/src/liarsDiceRules.ts:638` (fallback at :727-732), not `:345-350`.
3. **The sweep cannot answer any of the four owed numbers.** `SeedRow`
   (`packages/sim/src/balance/aggregate.ts`) carries no dare field at all. Win rate, EV/hand,
   dealer-challenge share and the challenger-won split come from the **probe**; "against
   `baseline-t148…`" means "against §12.2's T-148 figures", and that is what §17.3 compares to.
4. **No save-shape change is owed.** Neither candidate touches `DareHandState` or any persisted
   shape, so there is no migration and **`CURRENT_SAVE_VERSION` stays at 15** (the constraint
   sheet's "12" is itself stale — the shipped value at HEAD is 15, asserted by
   `liarsDiceAchievements.test.ts`).

### 17.1 Predictions, recorded BEFORE the first run

Written down before the probe or the sweep executed, so they can be scored rather than
rationalised.

| # | Prediction | Outcome |
| --- | --- | --- |
| 1 | **Moved sweep rows: `gambler` and `fleet` only**; the other seven byte-identical | ✅ §17.5 |
| 2 | `rulesFingerprint` **moves** under both shapes; `instrumentFingerprint` moves under (b), not under (a); `docsFingerprint` moves either way | ✅ |
| 3 | `gambler.finalCredits.median` **falls** from its t182 level; `tourOneClearRate`, `portOwnershipRate` fall; `survival.shipsLost` falls | ✅ §17.5 |
| 4 | **F-137-2's wronged share FALLS** — pre-committed as EXPECTED (§16.8 item 2), not a regression. The lift over uniform must not collapse | ✅ §17.6 |
| 5 | `liars_dice_grand_slam` becomes **less** reachable, not more | ✅ §17.7 |
| 6 | Shape (b) **un-inverts** the archetype ordering (F-148-1); shape (a) does not | ❌ **WRONG — the inversion survives both shapes.** Filed as **F-160-1** (§17.8) |

### 17.2 Arbitration criteria, pre-committed BEFORE the runs

| # | Criterion | Pass condition |
| --- | --- | --- |
| **C1** | the conjunction is broken | openers guaranteed true → 0.00%, **or** the dealer's challenge share of its own decisions falls far below 90.48% **and** its challenge-win rate rises off 5.32%. **Reported per pool.** |
| **C2** | win rate in a defensible band | **55–70%** player win rate, EV/hand well under +558 cr. Anchors: §1.3's discarded opposed-d20 Dare at 57.3%, T-137 94.66%, T-148 80.07%. **Disqualifies; does not pick.** |
| | *(RE-SCORED AT T-176, 2026-08-06: the SHIPPED game now measures **52.90%** (n = 279,857), 2.1 pp BELOW this floor — moved there by T-175, never re-scored until now. Filed as **F-176-2** / `TASKS.md` T-220. No band was edited.)* | |
| **C3** | the challenger-won split is no longer lopsided | the two rows within **≈20 pp** of each other (T-137: 5.32% vs 94.92%) |
| | *(RE-DERIVED AT T-176, 2026-08-06 — see §18. The row above is left VERBATIM and the **20 pp was not edited**; §18 asks the same 20 pp of the comparison that holds SELECTIVITY FIXED, which is what C3 should have asked. C3 as written is still a MISS and is still reported as one.)* | |
| **C4** | F-137-2 re-read | wronged share falls (EXPECTED); the **lift over uniform** must not collapse from 2.875× |
| **C5** | blast radius / test churn | **REPORT ONLY. MUST NOT BREAK A TIE.** |
| **C6** | archetype ordering un-inverts | `optimal` vs `bad` win rate, with SE and z, on both arms |

**HALT rule:** if both shapes passed C1–C4 and C6 and the residual was taste, HALT and escalate.
**It did not trigger** — the numbers arbitrated on two named criteria and (b) lost none.

### 17.3 The bakeoff — three arms, identical seeds, `gambler` 1..200 × 120 days

**Rig validation, on predictions the rig did not produce.** Before any candidate number was
believed, the `control` arm was checked against T-148's published figures. It reproduced the
*structural* fact exactly and the *sampled* facts to within ~0.5 pp:

| | T-148 (§12.2) | **control arm** |
| --- | --- | --- |
| openers guaranteed true | 100.00% | **100.00%** (33,636 / 33,636) — exact, as a structural fact must be |
| player win rate | 80.07% | 80.30% |
| EV / hand | +558.00 cr | +565.8 cr |
| roaming (pool B) | 76.91% | 77.60% |
| roster `optimal` | 84.69% | 84.51% |
| roster `bad` | 68.78% | 69.13% |
| F-137-2 wronged share / lift | 26.19% / 2.875× | 26.63% / 2.933× |
| `liars_dice_grand_slam` | 0 / 720 | 0 / 200 |

**The three arms.** `n` on every cell.

| | **control** (n=33,636) | **(a) dealer's fallback** (n=33,965) | **(b) opening lattice** (n=34,008) |
| --- | --- | --- | --- |
| **openers guaranteed true — ALL** | 100.00% | **100.00%** | **0.00%** |
| — pool B (roaming) | 100.00% (n=14,507) | 100.00% (n=14,694) | **0.00%** (n=14,483) |
| — pool A (roster) | 100.00% (n=19,129) | 100.00% (n=19,271) | **0.00%** (n=19,525) |
| player win rate | 80.30% ±0.22 | **73.04%** ±0.24 | **60.88%** ±0.26 |
| EV / hand | +565.8 cr | +434.1 cr | **+196.0 cr** |
| bids / hand | 1.980 | 2.351 | 1.301 |
| dealer challenge share of its decisions — ALL | 60.18% | 48.25% | 81.92% |
| — pool B | 56.35% | **33.16%** | 81.67% |
| — pool A | 63.25% | **62.71%** | 82.10% |
| challenger = DEALER won | 18.46% (n=28,970) | 28.98% (n=25,612) | **40.87%** (n=31,131) |
| challenger = PLAYER won | 70.84% (n=3,803) | 79.09% (n=7,462) | 82.22% (n=2,019) |
| **split (pp)** | 52.4 | 50.1 | **41.4** |
| F-137-2 wronged share / lift | 26.63% / 2.933× | 19.53% / 2.959× | 20.08% / **3.085×** |
| `optimal` vs `bad` (z) | −15.38 pp, z = −16.96 | −14.54 pp, z = −16.09 | −13.59 pp, z = −13.21 |
| `finalCredits` median | 97,594 | 87,311 | 68,518 |
| grand slams | 0 / 200 | 0 / 200 | 0 / 200 |
| files touched (C5, report only) | — | 1 engine file | 3 engine/sim + 1 UI + tests |

**Scoring against the pre-committed criteria.**

- **C1 — decisive, and it decided the bakeoff.** Shape (a) leaves the risk-free opener at
  **100.00% on both pools**: it changes the *answer* to the claim, never the claim. Its second
  limb does move — pool B's challenge share 56.35% → 33.16% and the dealer's challenge-win rate
  22.32% → 55.51% — but it is scoped to `dealerMove`, so **pool A, which is 57% of hands actually
  played (§12.3), is untouched** (63.25% → 62.71%, 15.71% → 15.53%). Shape (b) takes
  openers-guaranteed-true to **0.00% on both pools**, which is the defect removed at its source.
  **(b) passes; (a) fails.**
- **C2 — (a) is disqualified by the band it was measured against.** 73.04% is outside the
  pre-committed 55–70%. (b)'s 60.88% is inside it, and close to §1.3's discarded opposed-d20
  Dare at 57.3%. **(b) passes; (a) fails.**
- **C3 — NEITHER shape meets the pre-committed ≤20 pp, and that is reported as a miss, not
  softened.** (b) improves it most (52.4 → 41.4 pp) and moves the number the criterion was really
  about — the dealer's own challenge-win rate — from T-137's **5.32%** through control's 18.46% to
  **40.87%**, i.e. from a guaranteed loss to close to a coin flip. The residual asymmetry has a
  named cause: the *player* challenges selectively (only when the claim outruns the evidence)
  while the dealer challenges by default, so a gap is expected and the threshold was set without
  pricing it. **Filed as F-160-2** (§17.8) rather than absorbed.
- **C4 — both pass; see §17.6.**
- **C6 — NEITHER shape un-inverts the ordering.** This was prediction 6 and it was **wrong**.
  Filed as **F-160-1** (§17.8).
- **C5 — reported and explicitly not used.** (b) is the wider change. The task forbids picking on
  taste, and cost is taste.

**Verdict: shape (b), the opening lattice.** It wins C1 and C2 outright and loses none. The HALT
rule did not fire because the difference is not taste — it is two pre-committed criteria.

**§16.2's third shape (teach `planDareMove` to open above its own count) was never a candidate**
and is still not one. The distinction matters and is stated at the call site: the *rule* moved, so
`isLatticeMove` refuses `quantity <= own(face)` for **every** actor including a human, and
`planDareMove` opening at `minOpeningQuantity(own(bestFace))` is the minimum legal adaptation
forced by that refusal. The planner still makes the smallest claim the lattice permits.

### 17.4 The shipped shape, grep-able at its named site

```
packages/engine/src/liarsDiceRules.ts   export function minOpeningQuantity(ownOfClaimedFace: number): number
packages/engine/src/liarsDiceRules.ts   isLatticeMove(…, maxQuantity, ownOfClaimedFace)
                                        if (move === 'bid') return bid === null && quantity >= minOpeningQuantity(ownOfClaimedFace);
```

`ownOfClaimedFace` is a **required** parameter, by the T-146 `maxQuantity` precedent: it turns the
sweep of call sites into compile errors so no site can silently skip the rule. All four were
updated — `actions/dare.ts` (the resolver's refusal, still `illegal-dare-move` and still spending
nothing), `sim/protocol.ts` (the advertised `quantity.min`), `ui/App.tsx` (`claimOk` plus the
opening composer's seed), and `sim/index.ts` (`planDareMove` branch (b)).

**Totality, proven not asserted.** `own(f) ≤ dicePerSide` for every face, so
`own(f) + 1 ≤ dicePerSide + 1 ≤ 2 × dicePerSide = maxQuantity` at every tier. An opening bid is
still legal on **every** face at **every** tier, including a six-dice hand showing all six faces
(floor 2, ceiling 12). `liarsDice.test.ts`'s `TOTALITY` case executes that proof on the two worst
inputs the rule can be handed. **The dealer is unaffected** — §9.9 ruling 1, now asserted by a test
rather than argued in prose: `dealerMove` and `archetypeMove` both throw on `bid === null`, so
neither ever opens.

**Extraction before addition.** The signature widening landed first with the `bid` arm still
`return bid === null` — behaviour-preserving, whole engine suite green, every behavioural golden
unmoved — and the predicate was flipped only after. (`rulesFingerprint` moved at that first step
because it is a hash of source bytes; that is inherent to any engine edit and is not a behavioural
golden.)

**Adjacent staleness found while reading, and fixed because the fix was free.**
`sim/protocol.ts` advertised the dare `quantity.max` as a hardcoded `8` rather than
`hand.maxQuantity`, which under-advertises the domain at every tier ≥ 1 (where it is 10 or 12). It
sat on the same object literal the opening floor had to be threaded through, so it was fixed in
place rather than filed. `protocol.test.ts` now derives both bounds from the hand.

### 17.5 The 8,000-row capstone sweep

`rulesFingerprint` moves, so this task takes its own capstone: implement + re-pin in ONE task.
`npm run format` ran BEFORE extraction.

See §17.9 for the command block actually run and the diff output.

### 17.6 F-137-2 re-read — the fall was PRE-COMMITTED and is not a regression

§16.8 item 2 says outright that whoever closes F-137-1 "should expect this to fall back and must
not read that as a regression". Prediction 4 restated it before the run. It fell, as predicted.

**Arm 1, `gambler`, 120 careers — the like-for-like column §12.6 uses:**

| | §10.4 AFTER | T-137 | T-148 | **control (T-160 rig)** | **T-160 shipped** |
| --- | --- | --- | --- | --- | --- |
| chosen at disposition < 0 | 29.28% | **47.50%** | 26.19% | 26.63%¹ | **19.82%**² |
| analytic uniform expectation | 9.904% | 18.108% | 9.108% | 9.078%¹ | 6.639%² |
| **wronged-captain lift** | 2.956× | 2.623× | **2.875×** | **2.933×**¹ | **2.985×**² |
| mean disposition of CHOSEN | −1.378 | −2.453 | −1.237 | −1.302¹ | −0.823² |
| mean disposition of their POOL | −0.294 | −0.764 | −0.330 | −0.326¹ | −0.158² |
| reconstruct misses | — | 0 / 5,801 | 0 / 886 | **0 / 1,457** | **0 / 4,491** |

¹ gambler-only, 200 careers (the bakeoff arm). ² gambler-only, 600 careers (capstone Arm 2).

**Fleet column (960 careers, Arm 1, control vs shipped on identical seeds):**

| fleet | §10.4 AFTER | T-137 | T-148 | **control** | **T-160 shipped** |
| --- | --- | --- | --- | --- | --- |
| interceptions | 23,100 | 23,037 | 23,013 | 22,915 | 23,001 |
| of which named | 24.70% | 25.18% | 25.23% | 25.05% (5,741) | 25.02% (5,756) |
| inertness | 69.56% | 67.83% | 70.79% | 72.15% | 72.38% |
| chosen at disposition < 0 | 10.13% | 12.65% | 9.44% | 8.87% | **7.66%** |
| analytic uniform expectation | 4.223% | 5.326% | 3.966% | 3.612% | 3.171% |
| **wronged-captain lift** | 2.398× | 2.376× | 2.379× | 2.455× | **2.416×** |
| reconstruct misses | — | 0 / 5,801 | 0 / 886 | **0 / 5,741** | **0 / 5,756** |

**The reading, stated the way §16.6 asked for it.** The wronged *share* fell (gambler 26.63% →
19.82%, fleet 8.87% → 7.66%) because there are fewer soured captains to draw from — the player
wins 61% of hands instead of 80%, so `DARE_WIN_DISPOSITION` fires less often. **The number that
measures the weighting rather than the roster's mood — the lift over uniform — did NOT collapse.**
It *rose* on the gambler arm (2.933× → **2.985×**, above T-148's 2.875× and above T-125's 2.956×)
and is flat on the fleet arm (2.455× → 2.416×, still above T-148's 2.379×). **C4 passes.** The
interceptor draw is doing at least as much of the work as it was, against a milder pool. No
disposition constant and no port's `dare` arms were touched.

### 17.7 FOLD, the clamp, and grand-slam reachability — restated post-fix

**FOLD (§16.8 item 6). Still weakly dominated by CHALLENGE, and that is a derivation this fix does
not touch.** §16.3's argument is unchanged: the escrow is debited at contribution time, a fold
forfeits it with certainty, CHALLENGE costs nothing, so
`EV_challenge − EV_fold = P_false · (potPlayer + potDealer) ≥ 0` at every reachable state. What
moved is the *rate*: at Arm 2 (n = 101,616) FOLD is legal at **100.00%** of the 18,678 post-bid
player decision points and taken at **3.51%** — up from control's 0.91% and T-137's 0.32%. Hand-
level player-fold rate 0.50% → **0.65%**; dealer-fold 2.07% → 1.95%. Pre-bid folds: **0** on every
arm (the planner always opens). So FOLD is measurably *less* dead than at T-137, but it is still
never the better credit play. **FILED as a finding for the owner (F-160-3, §17.8), not redesigned
here** — the task is explicit that a still-dead FOLD is a finding to file, not a licence.

> **RULED AT T-177 (2026-08-06).** Shape **(A)** — FOLD is accepted as a **disposition purchase**,
> and the spec now says so (`docs/LIARS-DICE-DECISIONS.md` **LD-26**, the binding ruling;
> `docs/LIARS-DICE-PROGRESSION_SPEC.md` §3.3b for the `optimal` arm; the §16.3 blockquote for the
> derivation's second half). Every number in §17.7 above stands exactly as measured.
>
> **The 3.51% take rate is NOT a defect under the ruling — it is the expected rate for a move whose
> price is denominated in the other currency.** FOLD costs `P_false · (potPlayer + potDealer)`
> credits and buys `FOLD − (P_false·WIN + (1 − P_false)·LOSS)` disposition, and the reachable
> `P_false` spectrum (`{0} ∪ [(5/6)^u, 1]`, `u ∈ {4,5,6}`) clears the disposition crossover at every
> shipped tier, so the two currencies partition: FOLD is never the better credit play *and* is
> always the better disposition play wherever the credit comparison is not a tie. A rate near zero
> would be the reading the credit ledger alone predicts; a few percent is what a player buying
> goodwill looks like.
>
> **This measurement is the standing one.** Nothing shipped in `packages/engine/src` beyond
> comments — `rulesFingerprint` computed before and after and UNMOVED — so the Accept clause's "if
> anything ships, re-run the derivation and re-measure at n ≥ 10,000" did not fire; §17.7's
> n = 18,678 post-bid decision points already satisfies it.
>
> **The concealment sentence in §17.7 is retired from the JUSTIFICATION but stands as a statement of
> fact.** Concealment is still inert and LD-26 does not lean on it. A follow-on backlog row covers
> the one thing the ruling does leave open: the player cannot currently SEE the price they are
> paying, and a purchase whose price is invisible is a trap rather than a design. That is a UI
> obligation, filed rather than shipped here.

**The player-side ante clamp (§16.5 / §16.8 item 5).** §16.5 said the player-side 0.00% was a
selection effect downstream of F-137-1 and had to be re-measured "once hands run longer than 1.19
bids". Re-measured, and the answer is that the premise is gone in the other direction: **shape (b)
makes hands SHORTER**, not longer — bids/hand 1.980 → **1.301** — because a taller opening claim
trips `dealerMove`'s surplus test immediately (challenge share 60.18% → 81.92%). Measured clamp
rate at Arm 2: **player 0 of 11,950 raise contributions, dealer 0 of 18,678** — both `< 0.01%`, and
control measured 0 on both as well. The clamp is not firing at all at these bankrolls and tiers,
on either side, before or after the fix. That is a cleaner statement than §16.5's, and it removes
the F-137-1 confound the old figure carried.

**`liars_dice_grand_slam` (F-148-2), restated on the post-fix arm.** T-148: 0 in 720 careers.
Post-fix: **0 in 600 careers (Arm 2), 0 in 960 careers (Arm 1)**, and it got **harder**, exactly as
predicted — seats-beaten median **29 → 26** (max 36 → 33 of 42), ports-cleared median **3 → 1**
(max 8 → 6 of 14). The owner should read that next to F-148-2's eventual ruling: the gauntlet was
already uncompletable at 120 days and is now further from completion.

### 17.8 Findings filed by T-160

**F-160-1 · The archetype ordering (F-148-1) SURVIVES the F-137-1 fix. Prediction 6 was wrong.**
§12.2 traced the inversion to F-137-1 and said "close F-137-1 … and re-measure; if the inversion
survives that, the archetypes are the finding". It survives, on all three arms:

| arm | `optimal` | `bad` | bad − optimal | z |
| --- | --- | --- | --- | --- |
| control | 84.51% (n=14,091) | 69.13% (n=2,925) | −15.38 pp | **−16.96** |
| (a) | 84.70% (n=14,211) | 70.17% (n=2,886) | −14.54 pp | −16.09 |
| (b) shipped, bakeoff | 64.54% (n=14,694) | 50.96% (n=2,769) | −13.59 pp | −13.21 |
| **(b) shipped, Arm 2** | **64.48%** (n=43,733) | **51.98%** (n=8,288) | **−12.50 pp** | **−21.02** |

The gap narrowed (15.38 → 12.50 pp) but did not close or flip; at Arm 2's sample |z| is 21. So the
inversion is **only partly** downstream of F-137-1, and the residual belongs to `archetypeMove` /
`BAD_CREDULITY`. **Nothing was tuned** — §12.9 and §3.8 both forbid touching them here, and doing
so inside the task that removed the confound would have papered over the result. Per LD-20's own
ordering the owner now has what it asked for: F-137-1 is closed and the archetypes re-measured.
Note the one thing that *did* change qualitatively: `optimal` (64.48%) is no longer softer than the
roaming dealer (56.94%) by nearly the old margin, but it is still softer.

> **CLOSED AT T-175 (2026-08-06) — THE INVERSION IS FIXED AND FLIPPED, AND THE MECHANISM WAS
> MEASURED BEFORE ANYTHING WAS CHANGED.** The residual belonged to `archetypeMove`'s `optimal`
> branch, exactly where F-148-1 and this finding both said to look — and **not** to
> `BAD_CREDULITY`, which was re-derived against measured data and **left at 1**.
>
> **THE MECHANISM, measured at n ≈ 42,000 dealer decisions per tier on a to-termination rig against
> the shipped planner (temporary probe; the headline table below is off the SHIPPED instrument).**
> `optimal` priced the standing claim with `probAtLeast(q − own(face), dicePerSide)` — the
> unconditioned Binomial, i.e. **as though the claimant had said nothing.** Its calibration was
> catastrophic in exactly the band where the decision is made:
>
> | `optimal`'s predicted `pTrue` | realised TRUE, 4 dice | 5 dice | 6 dice |
> | --- | --- | --- | --- |
> | `[0.0, 0.1)` | 9.73% | 20.02% | 31.73% |
> | `[0.1, 0.3)` | **60.89%** | **85.34%** | **95.50%** |
> | `[0.5, 0.7)` | 94.57% | 98.54% | 100.00% |
> | `[0.9, 1.0)` | 100.00% | 100.00% | 100.00% |
>
> A policy that believes a claim is 13% likely when it is 95% likely will call it, and `optimal`
> did: it challenged **91–94%** of its decisions and won **51% / 41% / 34%** of those, against
> `bad`'s **70% / 57% / 48%** on a rule that is one comparison long. *`bad`'s crude classifier was
> beating `optimal`'s expected-value argmax, because the argmax was fed a wrong number.*
>
> **THE FIX, one line and no free parameter.** `probClaimTrue` /
> `creditedClaimSupport` (`packages/engine/src/liarsDiceRules.ts`) read the claimant's support off
> the claim: `minOpeningQuantity` forbids a claim at or under what the claimant holds, so a claim of
> `q` is the claim of someone holding `q − 1`, capped at `dicePerSide`. The RAISE valuations are
> untouched (they are T-176/F-160-2's). Four other reads were measured and rejected — see
> `docs/LIARS-DICE-DECISIONS.md` **LD-25**.
>
> **THE ORDERING, RE-MEASURED, BOTH ARMS.** The AFTER row is read off the **SHIPPED INSTRUMENT**
> — `HangoutPlayStats.dareCells` on the 8,000-row capstone's own sweep rows, no probe involved
> (`docs/HANGOUT_REDESIGN.md` §10.7). The BEFORE row is the same instrument with the RULE alone
> reverted, so the comparison is single-variable:
>
> | arm | `optimal` | `bad` | bad − optimal | SE | z |
> | --- | --- | --- | --- | --- | --- |
> | BEFORE (control: final instrument, old rule) | 64.65% (n=56,433) | 58.01% (n=10,528) | −6.64 pp | 0.52 | −12.74 |
> | **AFTER (shipped, off the capstone rows)** | **39.61%** (n=59,814) | **55.72%** (n=9,205) | **+16.11 pp** | 0.56 | **+29.02** |
> | AFTER, WIDENED to 1,600 gambler careers | 39.83% (n=95,580) | 55.63% (n=14,680) | +15.79 pp | 0.44 | +35.93 |
>
> The third row exists because `roster|random` landed at n = 7,868 on the capstone, under the
> Accept criterion's **n ≥ 10,000 per archetype cell**. The sample was **WIDENED** (to
> n = 12,560 for `random`) rather than the claim softened or the bar moved. `dareTierDisagreements`
> is **0** across all 279,857 hands, so freeze-at-open is confirmed as a side effect.
>
> and it flips at EVERY tier, not just in the pool: t1 +9.47 (z 2.90), t2 +9.64 (z 4.69), t3 +12.35
> (z 8.06), t4 +12.65 (z 10.59), t5 +18.72 (z 24.82). **The full difficulty ladder is now ordered
> the way the labels claim:** `optimal` 39.63% < `bad` 55.71% < roaming dealer 58.51% < `random`
> 78.33% player-win. LD-20's reading — "the 14 `optimal` rows are the easiest opponents in the
> game" — is now false in both degree and kind: they are the hardest.

**F-160-2 · The challenger-won split does not reach the pre-committed ≤20 pp under either shape.**
Shipped: dealer-as-challenger 40.73%, player-as-challenger 82.43% — 41.7 pp apart at Arm 2. The
mechanism is named and is not the dealer's: the *player's* planner challenges selectively
(`bid.quantity > own(face) + dicePerSide/6 + 1.5`), the dealer challenges by default from its
terminal fallback, and a selective challenger should beat a default one. The criterion was set
without pricing that. **Reported, not tuned around.** Whoever revisits it should note that shape
(a) — the not-chosen shape — is exactly the lever that makes the dealer's default *not* a
challenge, and that (a) and (b) are not mutually exclusive: (a) remains available as a second,
independent change on top of the shipped (b), and would need its own bakeoff.

> **RESOLVED / RE-DERIVED AT T-176 (2026-08-06) — THE CRITERION WAS THE DEFECT, AND SHAPE (a) WAS
> BAKEOFF'D ANYWAY AND LOST AGAIN.** The paragraph above stands verbatim; what follows is what
> measuring it properly said. Full working: **§18**.
>
> **THE RE-DERIVATION (§18.2, written BEFORE the arm ran).** C3 compared two rates over two
> DIFFERENT challenge populations and called the difference lopsided. C3′ holds the evidence fixed:
> `k = bid.quantity − own(bid.face)` off the challenger's own hand against the other side's
> `dicePerSide` unknown dice — the sufficient statistic BOTH margins are written in
> (`surplus = k − dicePerSide/6`) — with the engine's own `probAtLeast` imported rather than
> restated, and one engine-exported constant (`DARE_AI_CHALLENGE_MARGIN`) classifying both sides
> identically. **The 20 pp bar is T-160's own and was not moved.**
>
> **THE ANSWER, off the SHIPPED instrument at n = 279,857 hands (1,600 gambler careers × 120 days,
> `n` on every cell, per pool):**
>
> | pool | dealer-as-challenger | player-as-challenger | raw gap | **standardised gap** |
> | --- | --- | --- | --- | --- |
> | B (roaming) | 43.24% (n=146,360) | 90.03% (n=9,847) | 46.79 pp | **19.29 pp** — PASS |
> | A (roster) | 65.81% (n=97,681) | 92.30% (n=19,852) | 26.49 pp | **10.09 pp** — PASS |
>
> **AND THE RESIDUAL IS ACCOUNTED FOR RATHER THAN ASSERTED.** A Kitagawa decomposition puts
> **70.4% / 70.3%** of the raw gap on COMPOSITION. The number that makes it concrete: the shipped
> planner played **ZERO** evidence-unbacked challenges in 29,699 — branch (c4) is reachable only
> when the lattice offers no legal raise, and over 279,857 hands that never happened — while the
> dealer is **42.5% / 22.9%** unbacked, winning **5.92% / 11.43%** there. The planner is not "more
> selective"; it is **perfectly selective by construction**, so a wide raw gap was structurally
> guaranteed. Both sides' evidence-backed challenges clear a coin flip (70.8% / 90.0% / 82.0% /
> 92.3%), which is the floor that could have failed and did not.
>
> **SHAPE (a) IS NOW DEAD, NOT DORMANT.** §18.2 pre-committed a trigger — the dealer's unbacked
> share above 20% with `p_unbacked` under 50% — and it FIRED, so (a) was implemented on top of the
> shipped (b) and run on identical seeds. It narrows the roaming raw gap 46.79 → 20.41 pp and it
> **loses on C2 exactly as it did at T-160, by a wider margin in the other direction**: player win
> rate **52.90% → 39.64%**, EV/hand **+190.1 → −314.9 cr**, gambler `finalCredits` median 64,622 →
> 20,330, and the only invariant violation in 3,200 careers (seed 128, 77 consecutive zero-income
> days). C1 is structurally unmoved, C4 survives on both (lift 2.942× → 2.810×), C6 holds on both.
> It was reverted; `git diff` on `packages/engine/src/liarsDiceRules.ts` is comment-only.

**F-160-3 · FOLD is still never the better credit play.** §17.7. Rate up (0.32% → 3.51% of post-bid
decision points), dominance unchanged, because the dominance is a derivation about escrow and not a
constant. Its only positive payoff remains `+1` disposition, and its stated concealment benefit is
still inert against a memoryless dealer. A design question for the owner.
> **CLOSED AT T-177 (2026-08-06).** Ruled shape (A): FOLD is accepted as a **disposition purchase**,
> not a null mechanic — the two currencies partition (never the better credit play, always the better
> disposition play where credits do not already tie), and the crossover falls below the reachable
> `P_false` floor `(5/6)^u` at every shipped tier. Binding ruling:
> `docs/LIARS-DICE-DECISIONS.md` **LD-26**; see §16.3 and §17.7's blockquotes. Comment-only in
> `packages/engine/src`; `rulesFingerprint` unmoved. **F-175-2** (T-175's `optimal`-fold-branch
> narrowing) was ruled in the same pass — branch RETAINED and guarded by a named test,
> `docs/LIARS-DICE-PROGRESSION_SPEC.md` §3.3b.

### 17.9 The gate, and the baseline re-pin

See `TASKS.md`'s T-160 Delivered note for the command block, the merge row count, the diff output
and the four re-pin sites.

---

## §18 · T-176 — F-160-2 re-derived: the challenger-won split, priced (2026-08-06)

**What this section is.** T-160 pre-committed criterion **C3** — "the two challenger rows within
≈20 pp" — and reported a **miss** rather than softening it (§17.3, LD-22). §17.8's F-160-2 named
the residual's cause (the player's planner challenges *selectively*, the dealer challenges by
*default* out of its terminal fallback) and said outright that **the criterion was set without
pricing that**. T-176's first Accept branch is to re-derive the criterion with the selectivity
priced in, *argued from the two policies rather than picked*. **§18.1–§18.3 were written before a
single number was measured**, so they can be scored rather than rationalised (§17.1's own
discipline). §18.4 onward is what the instrument then said.

### 18.0 Four corrections to the task's own framing, made before anything ran

T-176's task block was authored at T-160 and **three tasks have landed since**. Recorded rather
than silently substituted (§17.0's precedent).

1. **THE BLOCK'S HEADLINE NUMBERS ARE PRE-T-175 AND MAY NOT BE ARGUED FROM.** "40.73% vs 82.43%,
   41.7 pp" is T-160's Arm 2. **T-175 shipped `probClaimTrue`** (LD-25), which rewrote how pool A's
   `optimal` decides to challenge and moved the archetype ordering by 22 pp. Under the shipped
   rule `pTrue` is 0-or-1 and equals 1 whenever the dealer holds **any** die of the claimed face
   (`creditedClaimSupport(q, d) = min(q − 1, d)`, so `own + (q − 1) ≥ q ⟺ own ≥ 1` for every
   `q ≤ d + 1`), so `optimal` now challenges only from a **zero count** — the most selective
   challenge rule in the game. Anything leaning on the T-160 figures is wrong on arrival, and the
   split is re-measured on HEAD first.
2. **THE PLANNER IS NOT "NEVER-BLUFFING", AND THE FRAMING THAT SAID SO IS WRONG ABOUT ITS RAISES.**
   `planDareMove`'s *opening* is truthful — it opens at `minOpeningQuantity(own(bestFace))`, the
   engine's floor (`packages/sim/src/index.ts:4859`, branch (b)). Its **raises are not**: branch
   (c3) takes `raise-quantity` whenever the engine says one is legal and affordable, **with no
   evidence test at all**. So the claimant the dealer faces bluffs on every raise. The dealer's own
   raises, by contrast, ARE evidence-gated (`liarsDiceRules.ts:854`, `858`) outside its explicit
   `DARE_AI_BLUFF_CHANCE` branch. This *reverses* the sign of the "counterparty" half of the
   expected gap, and it is priced in §18.2 accordingly.
3. **`probAtLeast` IS NOT A USABLE ABSOLUTE FLOOR, AND SAYING SO IS THIS TASK'S OWN CORRECTION.**
   The obvious floor — "each side's realised win rate must reach `1 − probAtLeast(k, dicePerSide)`"
   — prices the claimant as **non-strategic**, i.e. as though the other side's dice were uniform
   given the claim. **T-175 disproved exactly that assumption in this codebase**: it is the defect
   `probClaimTrue` fixed. A claimant who says `q` has *chosen* to say `q`, so at matched `(k, d)`
   the claim is more often true than the unconditioned Binomial says and a floor built on it is
   guaranteed to fail for reasons that are not defects. §18.3 keeps `probAtLeast` where it is
   genuinely load-bearing — as the thing that *derives* the bar — and states the bar itself in the
   terms the two policies' own docblocks use.
4. **NO ENGINE RULE IS TOUCHED, AND ONE AVAILABLE LEVER IS REFUSED ON PURPOSE.**
   `liarsDiceRules.ts`'s `optimal` block carries a comment naming T-176 as the owner of whether the
   raise valuation should price the planner's selectivity. It is **not** one of Accept's two
   branches, it would re-open the ordering T-175 shipped one task ago, and it is the same class of
   move as §16.2's banned third shape. It is filed as **F-176-1** (§18.7) and the comment is
   retargeted at the finding.

### 18.1 The two policies, read off their source — the argument the criterion has to price

| | **the player's side** (`planDareMove`, `packages/sim/src/index.ts:4859`) | **the house's side, pool B** (`dealerMove`, `packages/engine/src/liarsDiceRules.ts:785`) | **the house's side, pool A** (`archetypeMove`, `:1080`) |
| --- | --- | --- | --- |
| challenges from | **(c2)** `bid.quantity > own(face) + dicePerSide/6 + SIM_DARE_CHALLENGE_MARGIN` (`:4801`, `= 1.5`) — a judgment | **branch 1**, `surplus > DARE_AI_CHALLENGE_MARGIN − dealerGuile · DARE_AI_GUILE_PATIENCE` (`:730` `= 1.5`, `:733` `= 0.15`) — the same judgment, relaxed by GUILE | `optimal`: EV argmax over `probClaimTrue`; `bad`: `q − own > BAD_CREDULITY` (`= 1`); `random`: uniform |
| ...and from | **(c4)**, the terminal fallback — but only when **no raise is legal**, i.e. a forced call | **branch 4**, the terminal fallback, **by default** — reached whenever branches 1–3 decline | `bad`'s and `optimal`'s own terminal arms, same shape as (c4) |
| raises | **(c3), UNGATED** — any legal, affordable `raise-quantity`, then `raise-face`. No evidence test | **branch 3, GATED** — `own ≥ q + 1 − d/6` for quantity, `ownNextFace ≥ q − d/6` for face — plus an explicit bluff branch at `DARE_AI_BLUFF_CHANCE + guile · DARE_AI_GUILE_BLUFF` (`:755` `= 20`, `:752` `= 4`) | `bad`: cheapest legal raise, ungated; `optimal`: EV argmax |
| folds | (c1) `own = 0 ∧ q ≥ 5` | branch 2, the same bar scaled by tier | `bad` never folds; `optimal` folds only on an EV argmax |

**Four facts follow, and together they are the whole re-derivation.**

1. **THE TWO SELECTIVE RULES ARE THE SAME RULE.** `SIM_DARE_CHALLENGE_MARGIN`'s own docblock says
   it "mirrors the engine dealer's `DARE_AI_CHALLENGE_MARGIN` … so the two sides fold on comparable
   evidence and the measured rate is not an artefact of an asymmetric baseline". Both are `1.5`,
   both are applied to the same `surplus = q − own(face) − dicePerSide/6`. **At matched evidence
   there is no policy asymmetry left to explain a gap** — only GUILE's `0.15`-per-point relaxation
   on the dealer's side, which widens the dealer's *population* rather than changing its bar.
2. **THE COMPOSITIONS ARE NOT THE SAME.** The dealer's fallback is a **default challenge**; the
   player's is a **forced** one (reachable only when the lattice offers no raise, which at these
   tiers is rare). So the dealer's challenge population contains a large block of decisions its own
   evidence bar **declined**, and the player's contains almost none. A selective challenger should
   beat a mostly-default one, and **this is the gap the criterion never priced.** It is a property
   of the *mixture*, not of either rule.
3. **THE COUNTERPARTIES DIFFER, AND NOT IN THE DIRECTION §17.8 ASSUMED.** Correction 2 above: the
   claimant the dealer challenges bluffs on **every** raise (branch (c3) is ungated), while the
   claimant the player challenges raises only inside its evidence outside a ~20–40% bluff roll. So
   the *counterparty* channel should push the **dealer's** challenge-win rate **up** relative to the
   player's, i.e. it works **against** the composition channel rather than compounding it.
4. **THE POOLS ARE DIFFERENT GAMES AND THE SPLIT IS A PER-POOL QUANTITY.** Pool A never calls
   `dealerMove`. Since T-175 its `optimal` arm challenges only from a zero count (correction 1),
   which is *more* selective than the player's `(c2)`. Reporting one blended number across both
   pools would average two different mechanisms — which is why Accept demands `n` on every cell,
   per pool.

**What a defensible expected gap therefore looks like.** Not a number picked for the two rows, but
a **decomposition**: the raw gap is the sum of a *composition* term (how much of each side's
challenge population its own evidence bar disowns) and a *rate* term (how each side does at matched
evidence). The composition term is **expected and correct** — it is fact 2, and it is precisely
what the not-chosen shape (a) would remove. The rate term is what a criterion may legitimately
bound, because at matched evidence fact 1 says the two rules are the same rule.

### 18.2 C3′ — the re-derived criterion, stated before the measurement

Let `k = bid.quantity − own(bid.face)` counted off the **challenger's own** hand: the number of the
claimed face the challenger still needs from the other side's `dicePerSide` dice. It is the
sufficient statistic **both** margins are expressed in (`surplus = k − dicePerSide/6`), and the
engine already exports its analytic prior, `probAtLeast(k, dicePerSide)`
(`packages/engine/src/liarsDiceRules.ts:712`) — **imported, never restated in the sim.**

A challenge is **EVIDENCE-BACKED** iff `k − dicePerSide/6 > DARE_AI_CHALLENGE_MARGIN`. One
engine-exported constant, applied identically to both sides — deliberately *not* a mirror of either
policy's if-chain (the dealer's relaxes by GUILE; the player's does not). It lands on **`k ≥ 3` at
all three legal arities** (`1.5 + 4/6 = 2.167`, `1.5 + 5/6 = 2.333`, `1.5 + 6/6 = 2.5`), which is
why `w`, `p_backed` and `p_unbacked` are pure summation over the shipped cells and nothing extra is
stored (`isEvidenceBackedChallenge`, `packages/sim/src/index.ts`).

| | criterion | pass condition |
| --- | --- | --- |
| **C3′(a)** | **like-for-like.** Per pool, standardise both sides onto a common `(k, dicePerSide)` distribution (direct standardisation; pooled weights over the common support `S` = cells where **both** sides have `n ≥ 1,000`). | **the standardised difference ≤ 20 pp**, per pool. **The 20 is T-160's own number** — no threshold has been widened; the same bar is asked of the comparison that holds selectivity fixed, which is what C3 should have asked. Coverage `Σ_S n / N` is reported for both sides, because a bar met on 5% of the mass is not met. |
| **C3′(b)** | **the residual is accounted for, not asserted.** Decompose the raw per-pool gap `p_P − p_D` exactly (Kitagawa): `(w_P − w_D)·(p̄_backed − p̄_unbacked)` — the **composition** term — plus the two matched-evidence **rate** terms. | the composition term carries **≥ 50%** of the raw gap, with its SE. That is the falsifiable form of "the selectivity is the cause": if the mixture explains less than half, F-160-2's named mechanism is *not* the mechanism and the finding is re-opened rather than closed. |
| **C3′(c)** | **the absolute floor, and it can fail.** At **evidence-backed** cells the shared model puts the claim's falsity at ≥ **93.77%** (`1 − probAtLeast(3, 6)`, the weakest backed cell), and both margins' docblocks derive `1.5` from "more likely false than true". | **`p_backed > 50%`** for both sides on both pools, at `n ≥ 1,000`. A side whose own evidence bar does not clear a coin flip has a bar mis-set for its actual counterparty, and no composition argument excuses it. **NOT** stated as "≥ `1 − probAtLeast(k, d)`" — see §18.0 correction 3. |
| **C3′(d)** | **the routing diagnostic** (reported, not a pass/fail). Per side per pool: the **unbacked share** `1 − w` and its win rate `p_unbacked`. | — |
| **n bar** | pre-committed | `n ≥ 10,000` per (pool × challenger) headline cell; `n ≥ 1,000` per standardisation cell actually used. **If a cell lands short, WIDEN THE SAMPLE** (T-175's third arm is the precedent) — never soften the claim, never move the bar. |

**THE SHAPE-(a) TRIGGER, PRE-COMMITTED.** The not-chosen bakeoff shape (a) — make `dealerMove`'s
terminal fallback the cheapest legal raise and reserve CHALLENGE for the surplus test — is run
**iff** C3′(a) is missed on either pool, **or** C3′(d) shows the dealer's unbacked share above 20%
of its challenges with `p_unbacked < 50%`. Both are conditions (a) actually addresses: it removes
exactly the default-challenge population. If it is triggered, §17.3's bakeoff discipline applies in
full (git worktrees, identical seeds, `n` on every cell) and **C1, C2 and C4 are re-scored as well
as C3′** — a shape that fixes C3′ by breaking C2's 55–70% band is not shippable, and (a) alone
measured 73.04% at T-160.

### 18.3 Predictions, recorded BEFORE the first run

| # | prediction | outcome |
| --- | --- | --- |
| 1 | The **raw** split has NARROWED since T-160's 41.7 pp, driven by pool A: `probClaimTrue` made `optimal` challenge only from a zero count, which is a far better challenge population. | **RIGHT** — §18.4, blended gap 41.7 → 39.27 pp, pool A carried it |
| 2 | Pool B's dealer-as-challenger rate is roughly unmoved from T-160's 40.87% (nothing in T-175 touched `dealerMove`). | **RIGHT** — §18.4, 43.24% vs 40.87% |
| 3 | The **standardised** difference is materially smaller than the raw one, on both pools. | **RIGHT** — §18.5, 46.79 → 19.29 pp and 26.49 → 10.09 pp |
| 4 | C3′(b)'s composition term carries the majority of the raw gap **in pool B**, and less of it in pool A (where both sides are selective, so there is less composition to carry). | **WRONG, half** — §18.5, majority in both (70.4% / 70.3%) but NOT smaller in pool A |
| 5 | `dareChallengeDisagreements` is **0** on every seed and every arm. | **RIGHT** — §18.6a, 0 across 561,917 hands over both arms |
| 6 | C3′(c) passes on both sides of both pools — no side's evidence-backed challenges are a coin-flip loser. | **RIGHT** — §18.5, 70.8% / 90.0% / 82.0% / 92.3% |

### 18.4 THE RAW SPLIT, RE-MEASURED PER POOL, `n` ON EVERY CELL

**THE ARM.** `gambler`, seeds 1..1,600 × 120 days, four 1-indexed shards, off the **SHIPPED
INSTRUMENT** (`HangoutPlayStats.dareChallengeCells` / `dareChallengeSplit`) — no probe. **1,600
rows, 279,857 settled hands, 273,740 of them settled by CHALLENGE.** `invariants: 0 violations` on
all four shards. **Not adopted as the baseline of record** and its aggregate is written to
`.scratch/`, not `docs/balance/`: it is one policy over one horizon, and the merged gate's single
rate FAIL (`combat-win-share 0.0019`) is the arithmetic of a gambler-only arm — that policy plans
no fights — not a finding. `dareChallengeDisagreements` is **0** across all 279,857 hands.

| pool | dealer-as-challenger | player-as-challenger | **raw gap** |
| --- | --- | --- | --- |
| **B (roaming)** | **43.24%** (n = 146,360) | **90.03%** (n = 9,847) | **46.79 pp** (SE 0.33) |
| **A (roster)** | **65.81%** (n = 97,681) | **92.30%** (n = 19,852) | **26.49 pp** (SE 0.24) |
| both, blended | 52.27% (n = 244,041) | 91.55% (n = 29,699) | 39.27 pp |

**Against T-160's Arm 2 (40.73% / 82.43%, 41.7 pp):** the blended gap has narrowed to **39.27 pp**,
and the movement is almost entirely **pool A**, exactly as predicted — the dealer's challenge-win
rate there is now **65.81%**. **Prediction 1 PASSED.** Pool B's 43.24% against T-160's blended
40.87% is roughly unmoved, as predicted, and nothing in T-175 touched `dealerMove`. **Prediction 2
PASSED** (with the caveat that T-160 published the dealer row blended, not per pool, so this is a
like-for-like-ish rather than an exact comparison).

**By archetype — and this is why the rollup exists.** Post-T-175 `optimal` is a different
challenger from `bad`, and the number nobody could have guessed from the pool row is the first one:

| cell | n | challenger won |
| --- | --- | --- |
| `roster` / `optimal` / dealer | 78,523 | **71.12%** |
| `roster` / `bad` / dealer | 14,612 | 44.19% |
| `roster` / `random` / dealer | 4,546 | 43.69% |
| `roaming` / `none` / dealer | 146,360 | 43.24% |
| `roster` / `optimal` / player | 16,773 | 91.77% |
| `roster` / `random` / player | 3,011 | 97.01% |
| `roaming` / `none` / player | 9,847 | 90.03% |
| `roster` / `bad` / player | 68 | 16.18% |

`optimal` challenges only from a ZERO count of the claimed face (§18.0 correction 1) and wins
71.12% of the time doing it — it is now, by a wide margin, the best challenger at the table, and the
whole of pool A's rise is its. The 68-hand `roster|bad|player` cell is under every bar and is
reported as a count, not a rate.

### 18.5 C3′ SCORED

**C3′(a) — LIKE-FOR-LIKE. PASS ON BOTH POOLS.** The common support at `n >= 1,000` on both sides is
two cells per pool, both at six dice — which is itself the finding that pool B's dealer has a large
population the player simply never occupies.

| pool | cell | n player / p | n dealer / p | weight | analytic prior `1 - probAtLeast(k,d)` |
| --- | --- | --- | --- | --- | --- |
| roaming | d6 k3 | 5,487 / 87.50% | 54,666 / 61.69% | 0.6832 | 93.77% |
| roaming | d6 k4 | 3,955 / 92.72% | 23,936 / 87.49% | 0.3168 | 99.13% |
| roster | d6 k3 | 8,045 / 90.73% | 43,891 / 75.14% | 0.6080 | 93.77% |
| roster | d6 k4 | 10,671 / 93.09% | 22,821 / 91.54% | 0.3920 | 99.13% |

| pool | standardised player | standardised dealer | **difference** | SE | coverage P / D | C3′(a) |
| --- | --- | --- | --- | --- | --- | --- |
| **B (roaming)** | 89.15% | 69.86% | **19.29 pp** | 0.37 | 95.89% / 53.70% | **PASS** (bar 20) |
| **A (roster)** | 91.65% | 81.57% | **10.09 pp** | 0.26 | 94.28% / 68.30% | **PASS** (bar 20) |

**Prediction 3 PASSED** — the standardised gap is less than half the raw one on both pools (46.79 →
19.29; 26.49 → 10.09). **The 20 pp is T-160's own number and was not touched.** The coverage column
is reported because a bar met on a sliver of the mass is not met: it covers ~95% of the *player's*
challenges on both pools and 54% / 68% of the *dealer's* — which is the composition asymmetry stated
as a coverage number rather than argued.

**C3′(b) — THE RESIDUAL IS ACCOUNTED FOR. PASS ON BOTH POOLS.**

| pool | side | `w` (evidence-backed share) | `p_backed` | `p_unbacked` |
| --- | --- | --- | --- | --- |
| roaming | player | **100.00%** | 90.03% (n = 9,847) | — (n = **0**) |
| roaming | dealer | 57.51% | 70.82% (n = 84,166) | **5.92%** (n = 62,194) |
| roster | player | **100.00%** | 92.30% (n = 19,852) | — (n = **0**) |
| roster | dealer | 77.12% | 81.95% (n = 75,327) | **11.43%** (n = 22,354) |

| pool | raw gap | = composition | + rate | composition share | C3′(b) |
| --- | --- | --- | --- | --- | --- |
| **B (roaming)** | 46.79 pp | **32.92 pp** | 13.87 pp | **70.4%** | **PASS** (bar 50%) |
| **A (roster)** | 26.49 pp | **18.63 pp** | 7.86 pp | **70.3%** | **PASS** (bar 50%) |

**This is the answer F-160-2 asked for, and it is a measurement rather than an argument: about 70%
of the raw gap is composition — the dealer challenging out of a population its own evidence bar
disowns — and ~30% is a genuine matched-evidence difference.** The single most striking row is
`p_unbacked` on the player's side: **the shipped planner played ZERO unbacked challenges in 29,699
of them, on both pools.** Branch (c4) is reachable only when the lattice offers no legal raise, and
over 279,857 hands that never happened. So the planner is not "more selective than" the dealer —
**it is perfectly selective by construction**, and the dealer is 42.5% / 22.9% unbacked. A gap was
not merely expected; a gap was structurally guaranteed.

**Prediction 4 FAILED — HALF WRONG, and scored as such.** It said the composition term would carry
the majority in pool B and *less* of it in pool A. It carries the majority in both (right) but the
two shares are **70.4% and 70.3%** — indistinguishable, not smaller. The reasoning behind the
prediction ("both sides are selective in pool A, so there is less composition to carry") was wrong
because it read `optimal`'s selectivity as reducing the dealer's *unbacked* share; what it actually
does is raise the dealer's win rate *within* the backed cells. Recorded rather than quietly dropped.

**C3′(c) — THE ABSOLUTE FLOOR. PASS ON ALL FOUR SIDES.** roaming player 90.03%, roaming dealer
70.82%, roster player 92.30%, roster dealer 81.95% — every one of them well clear of 50%, at
n >= 9,847. **Prediction 6 PASSED.** No side's evidence bar is mis-set for its actual counterparty.
Shipped as a live assertion in `packages/sim/src/__tests__/campaign-dare-challenges.test.ts`, so a
later rule change that re-breaks it is red rather than silent.

**C3′(d) — THE ROUTING DIAGNOSTIC, AND IT FIRED.** The dealer's unbacked share is **42.49%**
(roaming) and **22.88%** (roster) of its challenges, winning **5.92%** and **11.43%**. Both clear
§18.2's pre-committed trigger (share > 20% with `p_unbacked < 50%`), so **the shape-(a) bakeoff was
run** — not because C3′ failed, but because the criterion said in advance that this pattern would
send it there, and a trigger written before the run is not re-read afterwards.

**Every populated cell above n = 900, `n` on each, both pools** — the `k` axis with the analytic
prior beside it. The dealer's low-`k` block is the composition term made visible:

| cell | n | challenger won | backed | analytic prior |
| --- | --- | --- | --- | --- |
| `roaming` dealer d6 k0 | 1,010 | 0.00% | no | 0.00% |
| `roaming` dealer d6 k1 | 17,068 | 0.00% | no | 33.49% |
| `roaming` dealer d6 k2 | 41,327 | 7.81% | no | 73.68% |
| `roaming` dealer d6 k3 | 54,666 | 61.69% | **yes** | 93.77% |
| `roaming` dealer d6 k4 | 23,936 | 87.49% | **yes** | 99.13% |
| `roaming` dealer d6 k5 | 2,763 | 91.28% | **yes** | 99.93% |
| `roaming` dealer d5 k2 | 928 | 10.78% | no | 80.38% |
| `roaming` dealer d5 k3 | 1,149 | 77.89% | **yes** | 96.45% |
| `roaming` dealer d4 k2 | 954 | 35.85% | no | 86.81% |
| `roaming` dealer d4 k3 | 932 | 90.56% | **yes** | 98.38% |
| `roaming` player d6 k3 | 5,487 | 87.50% | **yes** | 93.77% |
| `roaming` player d6 k4 | 3,955 | 92.72% | **yes** | 99.13% |
| `roster` dealer d6 k1 | 2,670 | 0.00% | no | 33.49% |
| `roster` dealer d6 k2 | 15,492 | 8.07% | no | 73.68% |
| `roster` dealer d6 k3 | 43,891 | 75.14% | **yes** | 93.77% |
| `roster` dealer d6 k4 | 22,821 | 91.54% | **yes** | 99.13% |
| `roster` dealer d6 k5 | 2,429 | 92.71% | **yes** | 99.93% |
| `roster` dealer d5 k2 | 1,291 | 25.17% | no | 80.38% |
| `roster` dealer d5 k3 | 2,427 | 85.66% | **yes** | 96.45% |
| `roster` dealer d4 k2 | 1,988 | 49.25% | no | 86.81% |
| `roster` dealer d4 k3 | 2,724 | 93.58% | **yes** | 98.38% |
| `roster` player d6 k3 | 8,045 | 90.73% | **yes** | 93.77% |
| `roster` player d6 k4 | 10,671 | 93.09% | **yes** | 99.13% |

(The omitted cells are all in the instrument and are every one of them either a tier-0/1 tail or a
`k >= 5` tail; none reaches the n >= 1,000 standardisation bar.)

**REALISED VS THE ANALYTIC PRIOR — §18.0's correction 3 vindicated by the data.** Every single cell
realises *below* `1 - probAtLeast(k, d)`, on both sides and both pools, and the shortfall is
enormous at low `k` (0.00% realised against a 33.49% prior at d6 k1). That is not a defect: it is
exactly the fact T-175's `probClaimTrue` encodes — the claimant *chose* to make the claim, so at
matched `(k, d)` the claim is far more often true than the unconditioned Binomial says. A criterion
built on "realised >= 1 - probAtLeast" would have failed 100% of cells for a reason that is not a
defect, which is why C3′(c) is stated as a 50% floor *derived from* the prior rather than as the
prior.

### 18.6 THE SHAPE-(a) BAKEOFF, RUN BECAUSE THE TRIGGER FIRED — AND (a) LOSES AGAIN

**Rig, and one honest deviation from §17.3, recorded rather than glossed.** §17.3 used three git
worktrees. That was **not usable here**: the arm is measured with an instrument that is *not yet
committed* (this task is forbidden from committing), and a worktree checks out a commit, so a
worktree arm would have measured a tree with no `dareChallengeCells` in it. Single-variableness is
instead guaranteed three ways, all checkable: (i) **identical seeds** — 1..1,600 × 120 days on both
arms; (ii) the (a) diff was **exactly one hunk** in `dealerMove`'s branch 4, and `git diff` was
verified to contain nothing else before and after; (iii) the control arm is the **already-completed**
§18.4 run, so the comparison is against rows produced before shape (a) existed on disk. The stamps
confirm it: control `rules cabd2112ccf4cefb`, arm (a) `rules 0f91771293da7990`, **identical
`instrument 2d6d1990eaf13031` on both** — the instrument did not move between arms, so every
difference below attributes to the rule.

**Shape (a):** `dealerMove`'s terminal fallback (branch 4) becomes the **cheapest legal raise** in
the lattice's own order, with CHALLENGE reserved for branch 1's surplus test and for the case where
no raise is legal at all. Totality is preserved by the same argument as before (CHALLENGE has the
single precondition `bid !== null`). Scoped to `dealerMove`, so **pool A is untouched by
construction** — which the numbers confirm.

| | **SHIPPED (b)** | **(b) + (a)** | criterion |
| --- | --- | --- | --- |
| settled hands | 279,857 | 282,060 | — |
| **player win rate** | **52.90%** | **39.64%** | **C2 — (a) FAILS, 15.4 pp below the 55% floor** |
| **EV / hand** | **+190.1 cr** | **-314.9 cr** | C2 — the player now LOSES money at the table |
| bids / hand | 1.504 | 1.833 | — |
| gambler `finalCredits` median | 64,622 | **20,330** (-68.5%) | — |
| `tourOneClearRate` | 0.9319 | 0.9081 | — |
| `deedCount` median | 25 | 22 | — |
| **invariant violations** | **0 / 1,600** | **1** — seed 128, **77** consecutive zero-income days | (a) alone bankrupts a career into a strand |
| openers guaranteed true | 0.00% | 0.00% | **C1 — structurally unmoved**: (a) does not touch `isLatticeMove`, and T-160 said so in its own words ("(a) changes the ANSWER to the claim, never the claim") |
| F-137-2 wronged share / lift | 20.35% / **2.942x** | 10.89% / **2.810x** | **C4 — both survive**; (a) is marginally worse and does not collapse |
| `bad - optimal` | **+15.79 pp** (z 35.93) | +13.94 pp (z 29.42) | C6 — the ordering holds on both; (a) narrows it |
| roaming raw gap | 46.79 pp | **20.41 pp** | (a) *does* do what it was proposed to do... |
| roaming standardised gap | 19.29 pp | 10.78 pp | ...and C3′(a) **already passed without it** |
| roaming composition share | 70.4% | **45.5%** | **C3′(b) — (a) MISSES**, which is expected: it removes the very composition the criterion decomposes |
| roster raw / standardised gap | 26.49 / 10.09 pp | 23.88 / 9.63 pp | pool A barely moves — (a) is `dealerMove`-scoped, as designed |

**VERDICT: SHAPE (a) IS NOT SHIPPED, and it loses on the same pre-committed criterion it lost on at
T-160 — C2 — by a wider margin than before.** T-160 disqualified (a) at **73.04%**, above the band;
on top of shipped (b) it lands at **39.64%**, far below it, takes EV/hand negative, drops the
gambler's median purse 68.5%, and produces the only invariant violation in 3,200 careers across both
arms. **It is also not needed:** C3′(a), C3′(b) and C3′(c) all pass on the shipped shape, so (a)
would be buying a narrower raw gap — a number the re-derivation shows is *supposed* to be wide —
with the player's whole edge at the table. LD-21's "(a) is not dead" is now closed: **it is dead**,
and LD-22 records why. The engine file was reverted and `git diff` on
`packages/engine/src/liarsDiceRules.ts` is **comment-only**.

### 18.6a THE INSTRUMENT, AND WHAT IT COST

Sim-only and additive. `HangoutPlayStats` gains `dareChallengeCells` (108 zero-filled
`pool|challenger|dN|kM` cells), `dareChallengeSplit` (16 zero-filled `pool|archetype|challenger`
cells) and `dareChallengeDisagreements`; `readDareChallenge` is the one place a settled hand becomes
a challenge reading, and `isEvidenceBackedChallenge` the one place the shared margin is applied. All
three arrive on `SeedRow.hangout` with **no `aggregate.ts` edit** — verified, not assumed: that
block is carried whole (`aggregate.ts`, `hangout: report.hangoutPlay`). `packages/engine/src` is
touched by a **comment only**.

**THE INERTNESS PROOF IS ROWS, NOT A HASH.** `campaign-degraded.test.ts` **entry 38**: with the
three new keys stripped from the hashed report, **all seven** policy fingerprints come back
byte-identical to their entry-37 values — `gambler` included, the only row that sits at a table.
Zero careers changed. A counter cannot change behaviour: `planDareMove`'s inputs did not move by one
byte, and the instrument reads the hidden dice off the **settlement** event, which the planner never
sees.

**FINGERPRINTS.** `rulesFingerprint` **UNMOVED at `cabd2112ccf4cefb`** — predicted, and confirmed by
the sweep's own stamp: `hashSemantic` strips comments before hashing (N7-FP), so the one engine edit
in this change set is invisible to it. `instrumentFingerprint` `e84d8e074fde0b98` →
**`2d6d1990eaf13031`**. `docsFingerprint` moves. `productVersion` 0.5.3 unmoved.
**`CURRENT_SAVE_VERSION` is UNMOVED at 17**, re-read live at `packages/engine/src/save.ts:627` — no
persisted shape changed, and three new keys on a derived REPORT are not a save shape, so **no
migration and no round-trip test is owed**, stated rather than left unaddressed.

**Prediction 5 PASSED** — `dareChallengeDisagreements` is 0 across all 279,857 hands of the control
arm, all 282,060 of arm (a), and every seed of the unit suite.

### 18.7 Findings filed by T-176

**F-176-1 · `optimal`'s RAISE valuation prices a counterparty that does not exist.** Filed as
`TASKS.md` **T-219**, and the engine comment that pointed at "T-176" is retargeted at it.
`archetypeMove`'s `optimal` branch values a raise as if the opponent challenged it immediately;
T-175 measured that as a modelled +52.62 credits per raise against a realised -53.26 at six dice and
left it, naming T-176. **T-176 read the pointer and declined it, in writing** (§18.0 correction 4):
it is outside both branches of this task's Accept, it would re-open the ordering T-175 shipped one
task earlier, and it is the same class of move as §16.2's banned third shape. §18.5 adds the
*mechanism* to T-175's magnitude: the shipped planner played **zero** unbacked challenges in 29,699,
so "the opponent challenges immediately" is nearly true at high `k` and nearly false everywhere else.

**F-176-2 · the table's player win rate has fallen through T-160's own C2 band, unremarked.** Filed
as `TASKS.md` **T-220**. C2 pre-committed **55-70%** and (b) shipped at 61.07%. T-175 moved it again
and scored the ORDERING, not the band. This arm measures **52.90%** at n = 279,857 — **2.1 pp below
the floor** — for the first time at capstone scale. The trend is monotone: T-137 94.66% → T-148
80.07% → T-160 61.07% → HEAD 52.90%. **Nothing was tuned in response and no band was edited.** C2
was an arbitration criterion for a bakeoff rather than a standing invariant, so this is an owner call
and not a gate failure — but it is the second consecutive task to move the number without anyone
re-scoring the band it was chosen against.

### 18.8 The scorecard

| criterion | verdict |
| --- | --- |
| **C3′(a)** like-for-like <= 20 pp | **PASS** — roaming 19.29 pp, roster 10.09 pp |
| **C3′(b)** composition >= 50% of the raw gap | **PASS** — 70.4% / 70.3% |
| **C3′(c)** `p_backed > 50%` on both sides of both pools | **PASS** — 70.8% / 90.0% / 82.0% / 92.3% |
| **C3′(d)** routing diagnostic | **FIRED** → the shape-(a) bakeoff was run |
| **shape (a)** | **NOT SHIPPED** — loses C2 at 39.64% (band 55-70%), takes EV/hand negative, and misses C3′(b); C3′ already passes without it |
| n bars (10,000 headline / 1,000 standardisation) | **MET** on every cell used — 146,360 / 9,847 / 97,681 / 19,852 headline; the four standardisation cells run 3,955-54,666 |

**F-160-2 CLOSES: RE-DERIVED, MEASURED, AND THE RESIDUAL PRICED.** The criterion that missed was not
measuring what it was about. Held at matched evidence, the two sides sit **19.29 pp** and **10.09
pp** apart — inside T-160's own 20 pp, with the bar untouched — and **70% of the raw gap is the
composition difference the original criterion never priced**: the shipped planner challenges from an
evidence-backed position **100% of the time**, the dealer from one **57.5% / 77.1%** of the time.
That gap is the game working. The lever that would remove it was bakeoff'd anyway, because the
criterion said in advance that it would be, and it lost.
