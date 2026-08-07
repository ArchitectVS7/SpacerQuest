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
   **Re-read at T-244 after M4e shipped:** no live owner now adds that memory to `dealerMove` or
   `archetypeMove`, so concealment is retired as a payoff, not deferred to M4e.

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
> §16.3 says, and the ruling does not lean on it — it is *not* part of why FOLD is kept. Re-read at
> T-244 after M4e shipped: no live task owns the memory that would make it worth something, so the
> concealment payoff is retired unless a future owner files it as a new rules/save feature.
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
| | *(**RULED AT T-220, 2026-08-06 — see §20 and LD-28. THE ROW ABOVE IS LEFT VERBATIM AND THE 55–70% WAS NOT EDITED.** The criterion is **PARTITIONED**: its WIN-RATE limb is **RETIRED as the bakeoff instrument it says it is** — all three of its anchors were measured on the risk-free opener shape (b) removed, and the shipped `minOpeningQuantity` puts the player's ply-1 burden at `probAtLeast(1,d)` = **51.77% / 59.81% / 66.51%**, from which a 62.5%-centred band is not derivable. Its **EV limb SURVIVES and is PROMOTED to a standing invariant** (well under +558 cr — T-148's measured money-printer signature), joined by a second: **pooled EV/hand > 0**. Re-measured per pool at n ≥ 10,000: roaming **58.55%** (n = 157,037), roster **45.69%** (n = 122,820) — **opposite sides of this floor**, which is the second reason its aggregate form cannot be an invariant. The fall through the band is still reported as a fall. Pinned by `campaign-dare-cells.test.ts` · `T-220 · LD-28`.)* | |
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
  Dare at 57.3%. **(b) passes; (a) fails.** *(RULED AT T-220, 2026-08-06 — this scoring stands as
  the record of a bakeoff correctly arbitrated, and the 55–70% used here is unedited. It is **not**
  a live standing band: §20.2 / **LD-28** retire the win-rate limb, because all three of the
  anchors named in this bullet were measured on the risk-free opener (b) removed. C2's EV limb is
  promoted instead. See §20.)*
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
>
> **SHIPPED AT T-221 (F-177-1) — THE OBLIGATION IS DISCHARGED.** The Dare table now prints BOTH
> arms of the trade at the point of decision: a `dare-fold-trade` line rendered beside the FOLD
> control (and reused verbatim as that control's hover title, so the two cannot drift). It is
> composed in `packages/ui/src/format.ts`'s `dareFoldTrade` from the LIVE hand and the LIVE port
> row — the escrow (`potPlayer` / `potDealer`, the same two numbers `settleDareHand` pays out as
> `creditsDelta = −potPlayer`, `actions/dare.ts:145`) and the port's own `dare` row
> (`venueParamsFor(hand.systemId, 'dare').dispositionOnFold`, the same field the resolver reads at
> `actions/dare.ts:173`). **No constant is imported into the UI, and no crossover, `P_false` or
> `probAtLeast` is restated there** — the derivation stays in the engine's tests, and a retune of
> `DARE_FOLD_DISPOSITION` moves what the table says with no UI edit. The disposition arm is ABSENT
> on a roster seat, through the same hard null `liarsDiceDealerReadout` already owns (§7.6: pool A
> has no `NpcState`, so there is no standing to buy). Guarded through the real DOM by
> `packages/ui/e2e/liars-dice.spec.ts` and `liars-dice-roster.spec.ts`, and bound to the resolver's
> own `creditsDelta` / `dispositionDelta` by `packages/ui/src/__tests__/liars-dice-pane.test.ts`.
> **UI-only: `rulesFingerprint` unmoved** (`packages/ui` is in neither the rules nor the instrument
> hash set, `packages/sim/src/balance/rules-fingerprint.ts`), so no capstone was owed.

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
   retargeted at the finding. **RESOLVED AT T-219 (2026-08-06):** the finding was taken up, the
   error was re-measured on HEAD, four derived replacements were bakeoff'd, and the assumption was
   **kept** — §19, and §18.7's own `CLOSED AT T-219` block.

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

> **CLOSED AT T-219 (2026-08-06) — MEASURED, BAKED OFF, AND DECLINED.** See **§19**. Re-measured on
> HEAD at n = 13,472 / 14,330 / 15,096 raises per tier: the T-175 pair quoted above is
> **pre-`probClaimTrue` and its sign has since reversed** — the shipped model is now systematically
> *pessimistic* about raises (−37.05 modelled vs +10.29 realised at six dice), and the counterparty
> calls on the next ply **22.62% / 28.01% / 29.86%** of the time against the model's assumed 100%.
> Four replacements derived from named sources (`DARE_AI_CHALLENGE_MARGIN`,
> `DARE_AI_FOLD_QUANTITY`, `dealerMove`'s own raise gate) were bakeoff'd on identical seeds at
> n = 200,000 hands per arm per tier. **All four lose**; three re-invert the archetype ordering
> T-175 shipped. §19.6 says why in one line: at `pTrue = 1` the shipped expression reduces to
> `probAtLeast(k, u) > cost / (potPlayer + potDealer + cost)`, a monotone threshold on `k` — **the
> immediate-challenge assumption IS `optimal`'s raise evidence gate**, and pricing the counterparty
> correctly dissolves it. Nothing shipped in `packages/engine/src` beyond comments;
> `rulesFingerprint` measured unmoved at `cabd2112ccf4cefb`.

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

## §19 · T-219 — F-176-1 closed: the raise valuation, re-measured and priced (2026-08-06)

**What this section is.** F-176-1 says `archetypeMove`'s `optimal` branch values every candidate
raise **as if the opponent challenged it immediately** — `ev = pOurs · potPlayer − (1 − pOurs) ·
(potDealer + cost)` — and that the shipped counterparty does not behave that way. The finding was
filed with a *magnitude* (T-175's +52.62 modelled against −53.26 realised at six dice, §18.7) and a
*mechanism* (T-176's zero unbacked challenges in 29,699, §18.4). This task re-measures the error on
HEAD before touching anything, derives candidate replacements from named sources, bakes them off on
identical seeds, and either ships one or declines in writing. **§19.0–§19.3 were written before a
single bakeoff number existed**, so the predictions can be scored rather than rationalised (§17.1 /
§18.3's own discipline).

### 19.0 Corrections to the finding's own framing, made before anything ran

1. **THE FINDING'S HEADLINE PAIR IS PRE-`probClaimTrue` AND MAY NOT BE ARGUED FROM.** "+52.62
   modelled vs −53.26 realised at six dice" was measured by T-175 **on its own control arm, i.e.
   before `probClaimTrue` shipped** (it appears in T-175's PHASE B, the block that measured the
   defect it then fixed). `probClaimTrue` did not change the raise formula, but it changed
   *catastrophically* which decisions ever reach a raise: `optimal` challenged 91–94% of its
   decisions before the change and challenges from a **zero count only** after it. The raise
   population is therefore a different population, and the pair must be re-taken. It was — see
   §19.1.
2. **THE SIGN OF THE ERROR HAS REVERSED, AND THAT REVERSES WHAT A FIX HAS TO DO.** On HEAD the
   shipped model is systematically **PESSIMISTIC** about raises, not optimistic: at six dice it
   models **−42.32** per raise against a realised **+16.44** (T-175's own estimand, replicated), and
   on the sharper per-raise estimand **−37.05 modelled vs +10.29 realised**. A repair that prices
   the counterparty correctly should therefore make `optimal` raise **more**, not less. Any
   reasoning inherited from the finding's text ("it over-values raises") is wrong on arrival.
3. **T-175'S ESTIMAND IS NOT PER-RAISE AND IS KEPT ONLY AS A REPLICATION TARGET.** It recorded the
   modelled EV of the **last** raise in a hand against the **whole hand's** terminal house net, once
   per hand. The headline estimand here is **one record per raise decision**, carrying `k = q_m −
   own(f_m)`, both pots, the cost, the modelled EV and the hand's terminal house net as the
   continuation value from that decision. Both are printed, the first labelled as the replication.
4. **THE TWO QUANTITIES ARE NOT COMMENSURABLE, AND THAT NON-COMMENSURABILITY *IS* THE DEFECT.** The
   modelled EV prices the pots **as they stand at the raise**; the realised net is the terminal net,
   after every subsequent escrow contribution. The model says the hand ends here. It does not. That
   is the finding, stated as an identity rather than as a discrepancy to be explained away.

### 19.1 PHASE 0 — the error re-measured on HEAD, before anything changed

**Probe-sourced** (`.scratch/t219-diag.ts`, temporary and uncommitted — the T-169 / T-175
precedent). The rig is `t175-diag.ts`'s hand loop with the raise block replaced by the two
estimands above; `plannerMove` is a **restatement** of `packages/sim/src/index.ts`'s `planDareMove`,
matched line for line against `SIM_DARE_FOLD_QUANTITY = 5` (`:4963`),
`SIM_DARE_CHALLENGE_MARGIN = 1.5` (`:4968`) and the ungated (c3) `raise-quantity` → `raise-face` →
(c4) `challenge` order. It is a restatement because `@spacerquest/engine` cannot import
`@spacerquest/sim` — the dependency runs the other way — which is the same reason the shipped
`liarsDiceArchetypes.test.ts` restates it. **N = 40,000 hands per tier; the Accept bar is n ≥ 10,000
RAISES per tier and every tier clears it on its own count, so the sample was not widened.**

| tier | n (raises) | modelled/raise | realised/raise | gap | SE | T-175 replication (modelled / realised, n) |
| --- | --- | --- | --- | --- | --- | --- |
| 4 dice | **13,472** | −73.73 | +53.26 | **−126.99** | 1.193 | −78.99 / +60.43 (n = 13,001) |
| 5 dice | **14,330** | −56.73 | +28.08 | **−84.81** | 1.234 | −61.15 / +34.45 (n = 13,680) |
| 6 dice | **15,096** | −37.05 | +10.29 | **−47.34** | 1.217 | −42.32 / +16.44 (n = 14,080) |

**THE ERROR IS A FUNCTION OF `k`, EXACTLY AS T-176'S MECHANISM PREDICTS** — and the last column is
"the counterparty that does not exist" turned into a number. The shipped model asserts that column
is **100.00%** at every row.

| tier | `k = q_m − own(f_m)` | n | modelled | realised | gap | SE | **P(called on the next ply)** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 0 | 423 | +100.00 | −114.40 | +214.40 | 4.90 | **12.53%** |
| 4 | 1 | 3,067 | −10.91 | +45.53 | −56.44 | 2.21 | **18.00%** |
| 4 | 2 | 9,969 | −100.65 | +62.86 | −163.51 | 1.14 | **24.51%** |
| 5 | 0 | 506 | +100.06 | −46.03 | +146.09 | 5.98 | **25.30%** |
| 5 | 1 | 3,377 | +7.66 | −15.58 | +23.24 | 2.23 | **28.40%** |
| 5 | 2 | 10,404 | −85.91 | +45.69 | −131.60 | 1.20 | **28.04%** |
| 6 | 0 | 734 | +100.25 | +3.69 | +96.55 | 4.98 | **32.02%** |
| 6 | 1 | 3,919 | +23.26 | −40.90 | +64.16 | 1.98 | **29.17%** |
| 6 | 2 | 10,360 | −70.69 | +29.22 | −99.91 | 1.26 | **30.00%** |

Pooled over all `k`, the counterparty calls the house's raise on the very next ply **22.62%**
(n = 13,472) / **28.01%** (n = 14,330) / **29.86%** (n = 15,096) of the time. The model's
assumption is wrong by 70–77 percentage points, and the `k = 2` rows — which carry 74%, 73% and 69%
of all raises — are where it is wrong by the most credits.

### 19.2 The candidates, and the named source each is derived from

Every constant below is either already exported from `packages/engine/src/liarsDiceRules.ts` or is
an existing rule in that file read backwards (the `creditedClaimSupport` precedent, LD-25: *"there
is no free parameter here; move `minOpeningQuantity` and this moves with it"*). **A new free scalar
picked because it scored well is a tuned number and is disqualified before it is run.**

- **S0 — SHIPPED (control).** `ev = pOurs · potPlayer − (1 − pOurs)(potDealer + cost)`.
- **S1 — price the call probability from the engine's OWN challenge rule.** The counterparty
  challenges a claim `(q, f)` iff its own surplus clears the shared evidence bar,
  `q − X − u/6 > DARE_AI_CHALLENGE_MARGIN`, where `X` is its count of `f`. From the house's seat
  `X ~ Binomial(u, 1/6)`, which is exactly what `probAtLeast` integrates. Writing
  `T = q − u/6 − DARE_AI_CHALLENGE_MARGIN`: **`T` is never an integer**, because
  `DARE_AI_CHALLENGE_MARGIN = 1.5` and `u/6 ∈ {2/3, 5/6, 1}` for the only three widths the ladder
  reaches, so the strict `X < T` collapses to `X ≤ ⌈T⌉ − 1` and
  **`pCall = 1 − probAtLeast(⌈T⌉, u)`** — one exported constant, one exported function, no
  parameter. Named source: `DARE_AI_CHALLENGE_MARGIN` (`:730`), the one shared bar §18.2 applied
  identically to both sides, mirrored verbatim by the sim at `index.ts:4860`.
  - **S1a — `V_cont = 0`, the minimal shape.** `ev = pCall · S0ev + (1 − pCall) · 0`. The
    not-called branch is valued at the status quo, which is not a convenience: LD-8 / §16.3's
    escrow derivation says the raise's `cost` is **debited at contribution time**, so at the moment
    the raise is made the house's position relative to "the hand continues" is exactly zero.
  - **S1b — `V_cont` = one-ply lookahead.** If the opponent does not call, its shipped branch (c3)
    is **ungated** and plays `raise-quantity` to `(q + 1, f)` (or `raise-face` if the quantity is
    capped); value the continuation as the house's own argmax against that forced reply, one ply
    deep, S0 at the leaf. O(1). Named source: the planner's own branch order, which §18.1's table
    already reads off source.
- **S2 — do not re-price; RESTRICT.** Keep S0's formula and apply the **roaming dealer's own
  shipped raise gate** to `optimal`'s candidate set. `dealerMove` admits a quantity raise iff
  `own(f) ≥ bid.quantity + 1 − u/6` (`:854`) and a face raise iff `own(f+1) ≥ bid.quantity − u/6`
  (`:858`); on the candidate's own `(q_m, f_m)` **both unify to `own(f_m) ≥ q_m − u/6`**. Named
  source in the strongest available sense — a rule already in this file, applied to a second
  consumer, exactly as `legalMovesFrom` is.

### 19.3 Arbitration criteria, pre-committed BEFORE the runs

| # | criterion | bar |
| --- | --- | --- |
| **K1** | the raise-valuation gap shrinks materially at every tier | measured against §19.1's table, with `n` and SE |
| **K2** | **the archetype ordering does not re-invert** | `bad − optimal` stays **positive at every tier**, and the headline stays clear of 0 with its z (control **+15.79 pp, z 35.93**, §18.4) |
| **K3** | house credits/hand ≥ `bad` at every tier | LD-25's own bar, unchanged |
| **K4** | the player win rate is **reported** against F-176-2 | reported, **not optimised toward** — the 55–70% band is **T-220's** and may not be edited or targeted here |

**THE HALT RULE, RESTATED FROM LD-25.** If two candidates both clear K1–K3 and the choice between
them is **taste**, HALT and escalate to the owner rather than picking. If a pre-committed criterion
separates them, proceed and say which one did.

**THE ROBUSTNESS ARM IS NOT OPTIONAL.** A shape that prices "the opponent challenges *selectively*"
is by construction more exploitable by a counterparty that bluffs. The winner is re-run with the
counterparty opening **+1 and +2 over the engine floor** (T-175's own objection-measuring arm), and
if it collapses there that is reported with numbers rather than waved off.

### 19.4 Predictions, recorded BEFORE the first bakeoff run

1. **S2 collapses `optimal`'s raise share and is the worst arm.** At `u = 4`, `own ≥ q_m − 2/3` is
   `own ≥ q_m` over the integers, i.e. `k ≤ 0`; §19.1 says `k ≤ 0` is only **3.2%** of the raises
   `optimal` currently makes, so the gate deletes ~97% of them and pushes `optimal` back toward the
   pure-challenger behaviour F-160-1 measured as the softest seat in the game. Predicted to **fail
   K2 or K3**.
2. **S1a raises MORE than S0 at every tier.** Raise EVs on HEAD are mostly negative (§19.1), and
   multiplying a negative by `pCall ∈ (0,1)` moves it toward zero, i.e. up, while `challenge` and
   `fold` are untouched. Predicted **raise share up, challenge share down**.
3. **S1a beats S0 on realised house credits/hand at every tier**, because the realised value of a
   raise (§19.1's `realised` column) is positive at every tier while the model calls it negative.
4. **S1b beats S1a at six dice and is within noise of it at four**, because the continuation value
   is largest where the ladder is widest and raises are cheapest relative to the pot.
5. **No candidate re-inverts the ordering** (`bad − optimal` stays positive), because none of them
   touches the challenge branch that T-175 fixed.
6. **The winner loses ground under the +1/+2 bluff arm relative to S0**, since S1 prices a
   selective caller and a bluffing opener is exactly the counterparty that model under-prices.

### 19.5 THE BAKEOFF — five arms, identical seeds, `n` on every cell

**Probe-sourced** (`.scratch/t219-bakeoff.ts`, temporary and uncommitted). Derived from
`.scratch/t175-bakeoff.ts`; that rig swapped the probability *estimator*, this one swaps the whole
raise **valuer**, and everything else is byte-identical so the arms differ in exactly one place.
Every arm plays the same seeds (`SeededRng(20_260_806 + u)`) and **every arm is scored on REALISED
house credits per hand off the engine's own showdown rule — never on its own EV**, which is
F-175-1's self-confirming premise (a) and the one trap this task could most easily have fallen into.

**THE CONTROL IS THE SHIPPED RULE, PROVEN AND NOT ASSUMED.** The rig restates `optimal`; a drifted
restatement would score every arm against a straw control. `.scratch/t219-fidelity.ts`
cross-checks the rig's S0 arm against `archetypeMove({archetype:'optimal'})` over **1,200,000
randomised states** — 600,000 with randomised `headroom`/`dealerCredits` and 600,000 in the rig's
own configuration — at all three widths, on move kind, quantity **and** face. **Zero mismatches**,
with the move mix reported for non-vacuity (challenge 515,106 / raise-quantity 50,403 / raise-face
34,491 on the first sweep).

**A FOURTH ALTERNATIVE WAS ADDED AFTER THE FIRST RUN, AND THAT IS RECORDED RATHER THAN HIDDEN.**
S1c (below) does not appear in §19.2 because it was written after S1a/S1b/S2 were scored, when
S1a's *shape* had been ruled out but its *family* had not: S1c prices the counterparty's FOLD branch
as well as its CHALLENGE branch, from `DARE_AI_FOLD_QUANTITY` — the second constant §19.2's own
plan named as available. It is derived from the same named source, carries no free parameter, and it
**lost**; adding it strengthens the decline rather than weakening it.

**n = 200,000 hands per arm per tier** (the first pass ran at 40,000 and was widened to 200,000
because S1a's shortfall at six dice was the closest cell; **the sample was widened, the claim was
never softened** — T-175's third-arm precedent).

| tier | arm | house cr/hand | SE | challenge share (win rate, n) | raise share (n) | player win | raise gap vs the shipped model (n) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **4 dice** | **S0 (shipped)** | **+48.61** | 0.224 | 72.93% (78.15%, n=184,262) | 27.07% (n=68,380) | 27.81% | −126.16 (n=68,380) |
| | S1a | +45.41 | 0.235 | 64.83% (87.76%, n=163,937) | 35.17% (n=88,940) | 27.85% | −99.52 (n=88,940) |
| | S1b | +17.26 | 0.242 | 75.30% (68.57%, n=171,676) | 24.70% (n=56,319) | 40.94% | −82.77 (n=56,319) |
| | S1c | +13.68 | 0.270 | 49.62% (93.19%, n=130,067) | 50.38% (n=132,068) | 37.69% | −26.62 (n=132,068) |
| | S2 | −3.00 | 0.224 | 98.95% (48.47%, n=199,792) | 1.05% (n=2,116) | 51.47% | +112.16 (n=2,116) |
| | `bad`, reference | +44.70 | 0.219 | 80.97% (69.68%, n=199,041) | 19.03% (n=46,773) | 30.57% | −187.55 (n=46,773) |
| **5 dice** | **S0 (shipped)** | **+26.42** | 0.242 | 71.52% (68.12%, n=179,976) | 28.48% (n=71,681) | 37.97% | −84.93 (n=71,681) |
| | S1a | +21.06 | 0.263 | 54.32% (86.15%, n=144,110) | 45.68% (n=121,202) | 37.17% | −50.37 (n=121,202) |
| | S1b | +12.13 | 0.250 | 67.76% (68.78%, n=163,095) | 32.24% (n=77,612) | 43.17% | −65.13 (n=77,612) |
| | S1c | −3.13 | 0.277 | 44.74% (90.19%, n=119,733) | 55.26% (n=147,902) | 44.96% | −9.71 (n=147,902) |
| | S2 | −19.08 | 0.220 | 98.62% (40.36%, n=199,268) | 1.38% (n=2,779) | 59.42% | +146.87 (n=2,779) |
| | `bad`, reference | +17.27 | 0.236 | 83.01% (56.73%, n=198,908) | 16.99% (n=40,714) | 43.32% | −147.15 (n=40,714) |
| **6 dice** | **S0 (shipped)** | **+8.43** | 0.249 | 70.20% (58.84%, n=177,269) | 29.80% (n=75,255) | 46.15% | −47.60 (n=75,255) |
| | S1a | +6.75 | 0.271 | 49.45% (82.56%, n=133,264) | 50.55% (n=136,215) | 43.26% | −31.77 (n=136,215) |
| | S1b | +1.22 | 0.255 | 64.57% (62.74%, n=159,542) | 35.43% (n=87,558) | 48.22% | −43.30 (n=87,558) |
| | S1c | +6.88 | 0.271 | 49.42% (82.63%, n=133,178) | 50.58% (n=136,317) | 43.21% | −32.12 (n=136,317) |
| | S2 | −24.98 | 0.225 | 89.25% (38.33%, n=193,419) | 10.75% (n=23,301) | 61.93% | +69.35 (n=23,301) |
| | `bad`, reference | −2.03 | 0.238 | 83.30% (47.44%, n=198,687) | 16.70% (n=39,841) | 52.30% | −105.68 (n=39,841) |

**THE SHIPPED RULE WINS AT EVERY TIER, AND NOT NARROWLY.** Against the strongest alternative (S1a):
**+3.20** at four dice (conservative independent-arm SE 0.325, **z = 9.9**), **+5.36** at five
(SE 0.357, **z = 15.0**), **+1.68** at six (SE 0.368, **z = 4.6**). The arms share seeds, so the
paired SE is smaller than that bound and the z figures are floors.

**THE ORDERING, PER ARM, ON THIS RIG** (`bad − optimal` in player-win points; K2's bar):

| arm | 4 dice | 5 dice | 6 dice | K2 |
| --- | --- | --- | --- | --- |
| **S0 (shipped)** | **+2.76** | **+5.35** | **+6.15** | **PASS** |
| S1a | +2.72 | +6.15 | +9.04 | PASS |
| S1b | **−10.37** | +0.15 | +4.08 | **FAIL** — re-inverts at four dice |
| S1c | **−7.12** | **−1.64** | +9.09 | **FAIL** — re-inverts at four and five |
| S2 | **−20.90** | **−16.10** | **−9.63** | **FAIL** — re-inverts at every tier |

**THE ROBUSTNESS ARM, RUN ANYWAY** (counterparty opening +1 / +2 over the engine floor,
n = 200,000/cell). S1a does not merely lose ground, it **collapses**: at +1 it takes
**+62.62 / +27.23 / +11.83** against S0's **+66.87 / +56.41 / +46.08**, a 29- and 34-credit gap at
five and six dice. At +2 the two shapes converge (**+95.75 / +91.47 / +87.07** vs
**+95.75 / +92.24 / +87.07**) because a +2 opener is called almost immediately by both. The
exposure predicted in §19.4 item 6 is real, and larger than predicted.

### 19.6 WHY EVERY REPLACEMENT LOSES — the model error is LOAD-BEARING, and that is a measurement

The derivation, from the shipped branch alone. `probClaimTrue` is a point read, so at any decision
`pTrue ∈ {0, 1}`.

- At **`pTrue = 0`** the challenge branch scores `+potPlayer`, and no raise can beat it: the raise
  EV is maximised at `pOurs = 1`, where it is exactly `potPlayer`, and `OPTIMAL_TIE_BREAK` orders
  `challenge` first. **So every raise `optimal` makes happens at `pTrue = 1`.**
- At **`pTrue = 1`** the challenge and fold branches both score exactly `−potDealer`, so the raise
  comparison collapses to `S0ev > −potDealer`, which rearranges — with no approximation — to

  ```
  pOurs · (potPlayer + potDealer + cost) > cost
  ```

  i.e. **`optimal` raises iff `probAtLeast(k, u) > cost / (potPlayer + potDealer + cost)`**, a
  threshold on `k` alone at fixed pots. `probAtLeast` is monotone non-increasing in `k`, so the
  admissible set is a **down-set in `k`**: a genuine evidence gate.

**At the table's own numbers that gate is `k ≤ 2`, and the histogram is the proof.** With the rig's
pots and ante (100 / 100 / 30) the threshold is `30/230 = 0.13043`;
`probAtLeast(2, 4) = 0.13194` clears it and `probAtLeast(3, 4) = 0.01620` does not. Raises actually
emitted, by `k = q_m − own(f_m)`, n = 200,000 hands per arm:

| arm | 4 dice | 5 dice | 6 dice |
| --- | --- | --- | --- |
| **S0 (shipped)** | k≤2 only — k=1 22.8%, **k=2 74.1%**, k≥3 **0** | k≤2 only — k=2 72.3%, k≥3 **0** | k≤2 only — k=2 68.6%, k≥3 **0** |
| S1a | k=3 **31.8%** | k=3 42.9%, k=4 5.4% | k=3 37.5%, k=4 12.3% |
| S1b | k=3 51.5%, k=4 9.6% | k=3 37.4%, k=4 14.2% | k=3 24.2%, k=4 17.5% |
| S1c | k=3 27.8%, k=4 24.0%, **k=6/7 present** | k=3 38.4%, k=4 9.1%, k=5 9.8% | k=3 37.5%, k=4 12.3% |
| S2 | k≤0 only (k=0 95.6%) | k≤0 only | k≤1 only |
| `bad` | k≤2 only | k≤2 only | k≤2 only |

**THAT IS THE WHOLE ANSWER.** `pCall` is a function of the claimed **quantity** `q_m`; the raise's
own truth probability is a function of **`k`**. Multiplying the second by the first does not sharpen
the gate, it **dissolves** it: `|pCall · S0ev| < potDealer` for essentially every reachable state
(`pCall ≤ 0.77` and `|S0ev| ≤ potDealer + cost`), so under S1 the raise branch beats `−potDealer`
almost unconditionally and `optimal` starts raising on claims it has no evidence for. S2 fails from
the other side: `dealerMove`'s gate is `own(f_m) ≥ q_m − u/6`, which over the integers is `k ≤ 0` at
four and five dice — it deletes 97% of `optimal`'s raises and pushes it back toward the
pure-challenger behaviour F-160-1 measured as the softest seat in the game.

**So the "counterparty that does not exist" is doing real work.** The immediate-challenge assumption
is not merely a conservative simplification, as the comment at the site has claimed since T-145 — it
is the **only** thing that makes `optimal`'s raise rule an evidence rule at all, because it is the
only term in the expression that is a function of the raise's own truth probability. Pricing the
counterparty correctly, in every derived form available, removes the evidence test and plays worse.
**That is the finding, and it is why nothing ships.**

### 19.7 The predictions, SCORED — including the wrong ones

| # | prediction | verdict | what actually happened |
| --- | --- | --- | --- |
| 1 | S2 collapses the raise share and is the worst arm; fails K2 or K3 | **RIGHT** | raise share 1.05% / 1.38% / 10.75%; house net −3.00 / −19.08 / −24.98, below `bad` at every tier (K3) **and** the ordering re-inverts at every tier (K2) |
| 2 | S1a raises MORE than S0 at every tier | **RIGHT** | 27.07 → 35.17, 28.48 → 45.68, 29.80 → 50.55 |
| 3 | S1a beats S0 on realised house credits/hand at every tier | **WRONG** | it **loses** at every tier: −3.20 (z 9.9), −5.36 (z 15.0), −1.68 (z 4.6). The reasoning failed because it treated "the realised value of the raises S0 makes is positive" as "raising more is better" — but the realised column is conditioned on **the raises S0 selects**, and S1a selects a different, worse population (§19.6) |
| 4 | S1b beats S1a at six dice and is within noise at four | **WRONG on both halves** | S1b is *below* S1a at six (+1.22 vs +6.75) and 28 credits below it at four (+17.26 vs +45.41) — not noise. The one-ply leaf is itself valued with S0, so the lookahead imports the very error it was meant to correct, one ply deeper |
| 5 | No candidate re-inverts the ordering | **WRONG** | three of four do: S2 at every tier, S1b at four dice, S1c at four and five. Only S1a keeps `bad − optimal` positive throughout. The reasoning ("none of them touches the challenge branch") was wrong because the challenge **share** is a consequence of the raise valuation, not independent of it |
| 6 | The winner loses ground under the +1/+2 bluff arm | **RIGHT, and by more than expected** | S1a: −4.25 / −29.18 / −34.25 credits/hand against S0 at +1 |

**AND A MISS IN THE CRITERIA THEMSELVES, RECORDED RATHER THAN PATCHED OVER.** K1–K4 were written
against `bad` (LD-25's frame) and **never said a replacement must beat the incumbent**. Read
literally, S1a passes K1 (the gap shrinks at every tier: −126.16 → −99.52, −84.93 → −50.37,
−47.60 → −31.77), passes K2, passes K3 (it clears `bad` at every tier) and K4 is report-only — so
the pre-committed set would have licensed shipping a rule that is worse than the shipped one at
every tier at z ≥ 4.6. **That is a defect in this task's own criteria, not a licence.** The binding
rule is the one the whole track runs on and which K1–K4 forgot to restate: a change ships only if it
is an improvement. It is recorded here so the criteria set can be scored, exactly as §18.5 scored
prediction 4 as half-wrong rather than dropping it.

### 19.8 THE DECISION — F-176-1 is CLOSED as MEASURED AND DECLINED

**Nothing ships in `packages/engine/src` beyond comments.** The finding is real, its magnitude is
re-measured on HEAD (§19.1) and its mechanism is understood (§19.6) — and the correct response to
it is to leave the rule alone and say why, at the site and in the ruling. The T-177 precedent is
exact: that task also found the honest answer was "the shipped shape is right for a reason nobody
had written down", and it recorded the reason rather than manufacturing a change.

**The halt rule did not fire.** LD-25's halt is for *two candidates separated only by taste*. Here a
**pre-committed criterion separated every candidate from the control**: S2, S1b and S1c fail K2
(the ordering re-inverts) or K3 (below `bad`), and S1a is separated from S0 by the improvement
requirement §19.7 records as the criteria set's own omission — measured, not judged, at z ≥ 4.6 at
every tier and −29 to −34 credits/hand under the robustness arm.

**`rulesFingerprint`, MEASURED BEFORE AND AFTER, NOT ASSERTED** (T-176 §18.6a / T-177's method,
`computeRulesFingerprint` from `packages/sim/src/balance/rules-fingerprint.ts` via the built
`packages/sim/dist`): **`cabd2112ccf4cefb` → `cabd2112ccf4cefb`**. Equal. `instrumentFingerprint`
**`2d6d1990eaf13031`** and `docsFingerprint` **`46a21a8d0fe680fb`**, both unmoved. The only non-doc,
non-test file this change set touches is `liarsDiceRules.ts`, and every edit in it is inside a
comment, which `hashSemantic` strips; the two test files are free of a capstone by
`HASHED_ROOT_IGNORED_DIRECTORIES.__tests__` (`rules-fingerprint.ts:255-262`), read at HEAD rather
than taken from a plan. **`CURRENT_SAVE_VERSION` re-read live at `packages/engine/src/save.ts:627`
— 17, UNMOVED**; no persisted shape changed, so no migration and no round-trip test is owed, stated
rather than left unaddressed.

**THE "IF ANYTHING SHIPS" CLAUSE DID NOT FIRE.** Accept conditions the capstone on
`packages/engine/src` being touched; the only engine lines here are comments that provably cannot
move `rulesFingerprint`. So: **no capstone, no 8,000-row sweep, no `balance:diff`, no
`balance:extract`, no baseline re-pin.** T-177's precedent, and its wording, verbatim.

### 19.9 THE ORDERING AND THE WIN RATE, RE-SCORED ON THE SHIPPED INSTRUMENT

Accept names two numbers that must come off the **shipped** instrument (`dareCells` /
`dareChallengeCells` / `dareChallengeSplit`), not a probe — `docs/HANGOUT_REDESIGN.md` §10.7's
standing rule. Re-scored on the **same arm shape** §18.4 used, so the comparison is like-for-like:
`--policies gambler --seeds 1600 --days 120`, four 1-indexed shards, scored with
`.scratch/t176-bakeoff.mjs` unchanged.

```
npm run balance:sweep -- --label t219-rescore --seeds 1600 --days 120 --policies gambler \
  --milestone-days 21,29,30,41,60,120 --shard i/4          # i = 1..4
node .scratch/t176-bakeoff.mjs t219-rescore
```

| | §18.6's shipped column | **T-219 re-score** | |
| --- | --- | --- | --- |
| rows / dares / tier disagreements | 1,600 / 279,857 / 0 | **1,600 / 279,857 / 0** | reproduced |
| **C2 player win rate** | 52.90% | **52.90%** (n = 279,857) | reproduced |
| C2 EV/hand | +190.1 cr | **+190.1 cr** | reproduced |
| bids/hand | — | 1.504 | — |
| `roster\|optimal` player wins | 39.83% (n=95,580) | **39.83%** (n=95,580) | reproduced |
| `roster\|bad` player wins | 55.63% (n=14,680) | **55.63%** (n=14,680) | reproduced |
| `roster\|random` player wins | — | 78.61% (n=12,560) | — |
| **C6 `bad − optimal`** | **+15.79 pp, SE 0.44, z 35.93** | **+15.79 pp, SE 0.44, z 35.93** | **reproduced — the ordering does NOT re-invert** |
| C3′(a) roaming / roster standardised gap | 19.29 / 10.09 pp | **19.29 / 10.09 pp** | reproduced |
| composition share | 70.4% / 70.3% | **70.4% / 70.3%** | reproduced |
| `invariants` | 0 violations | **0 violations** on all four shards | reproduced |

**The reproduction is the point, not a formality.** An unchanged rule must give an unchanged number,
and it does — to every decimal place published, on all four shards, with the same
`combat-win-share` rate FAIL the T-176 arm logs carry (an artefact of a gambler-only arm, identical
on both, and not an invariant violation). That confirms HEAD is exactly the arm §18 measured and
that this task moved nothing.

**C2's BAND IS T-220'S AND WAS NEITHER EDITED NOR TARGETED** (§18.6's own framing, restated). The
player win rate is **reported** here against F-176-2's 52.90% and is unchanged; the 55–70% band
belongs to T-220, and it is worth recording that the *direction* the alternatives moved it was
**away from** the band floor — S1a takes it to 43.26% at six dice on the probe rig — so a future
T-220 that reaches for the raise valuation as a lever should read §19.6 first.

### 19.10 Findings filed by T-219

**F-219-1 · `optimal`'s raise evidence gate is a function of the player's OWN WAGER, and nothing
names or tests it.** Filed as `TASKS.md` **T-222**. §19.6 derives the gate exactly:
`optimal` raises iff `probAtLeast(k, u) > cost / (potPlayer + potDealer + cost)`. Both pots are
seeded at the player's chosen `seedWager` (`packages/engine/src/actions/hangout.ts:550-551`) and
`cost` is the frozen `ante = round(band.max × DARE_ANTE_BAND_FRACTION)`
(`liarsDiceRules.ts:72`, `hangout.ts:144`, `= 0.03`), so the threshold is
`ante / (2 · seedWager + ante)` and **the player moves it by choosing how much to stake**:

Enumerated over **every** shipped band at tier 0 (`wagerBandFor` × `anteFor`, all 40 system ids,
so the default row is covered too), the gate at the band FLOOR against the gate at the band CEILING:

| band | ante | gate at the FLOOR | gate at the CEILING |
| --- | --- | --- | --- |
| 25–1000 (28 ports, the default) | 30 | `k ≤ 1` | `k ≤ 3` |
| 5–200 | 6 | `k ≤ 1` | `k ≤ 3` |
| 20–300 | 9 | `k ≤ 1` | `k ≤ 3` |
| 100–400 / 100–500 | 12 / 15 | `k ≤ 2` | `k ≤ 3` |
| 250–1500 / 200–1800 / 500–3000 | 45 / 54 / 90 | `k ≤ 2` | `k ≤ 3` |
| 50–750 / 75–900 | 23 / 27 | `k ≤ 1` | `k ≤ 3` |
| **15–1200 / 25–2000 / 10–3000** | 36 / 60 / 90 | **`k ≤ 0`** — `optimal` will only raise a claim it ALREADY HOLDS | `k ≤ 3` |
| the probe rig's own 100/100/30 | 30 | — | `k ≤ 2` |

**Every band widens, and three of them span four whole steps of `k`.** So the house's evidence bar
for raising **loosens as the player bets more** — at the deepest ports a minimum-stake hand faces a
dealer that will not raise unless it already holds the claim, and a maximum-stake hand faces one
that will raise on `k = 3`. This is an accident of the ante/pot ratio rather than a design. It is not a defect this task can fix (that is a wager-band or ante ruling,
and touching either inside a measurement task is §16.2's banned third shape all over again), but it
is now **pinned by a named test** rather than left to prose:
`liarsDiceArchetypes.test.ts`, describe `T-219 · F-176-1 — the immediate-challenge assumption IS
optimal's raise evidence gate`, which computes all three rows from `probAtLeast` and the imported
constants and goes red if the coupling changes.

> **RULED AT T-222 (2026-08-06) — LD-29, `docs/LIARS-DICE-DECISIONS.md`; the measurement is §21.**
> Every number in §19.10 above stands exactly as measured and the enumeration **reproduces on HEAD**
> (40/40 bands widen at tier 0, transitions `{0→3, 1→3, 2→3}`, §21.3). **The READING is inverted by
> the measurement.** `c / (pot + c)` is **pot odds** — the exact break-even probability of a raise
> costing `c` into a pot of `pot` — not an accident of the ante/pot ratio, and the house's
> stake-normalised return is **monotone non-decreasing** in the gate step at every bounded tier
> (−0.04 → +0.11 → +0.45 → +0.63 at four dice; −0.39 → −0.29 → +0.09 → +0.37 at six, n = 40,000 per
> cell over 260 cells). **A player who stakes more moves the bar and loses 6–33 points of win rate
> by it.** At the ceiling the ratio is `f / (2 + f)` with the band cancelling out, so the `k ≤ 3`
> row above is one number for all forty ports rather than forty numbers that happen to agree.
>
> **The sentence "a maximum-stake hand faces one that will raise on `k = 3`" is FALSE IN PLAY, and
> that correction is F-222-1** (`TASKS.md` **T-224**, §21.4b): `headroomFor` counts the seed against
> `band.max`, so at a stake within one ante of the ceiling **no raise is legal for either side** —
> the loosest gate in every band is unreachable, and the hand collapses to a single opening claim
> resolved at `probAtLeast(1, u)`, in the player's favour, at the largest stake the port allows.
>
> **Two further residuals are FILED rather than folded into the ruling:** F-222-2 (`T-225`) — at
> tier 5 the ceiling is removed, nothing caps the ratio, and past `k ≤ 3` the gate **misprices**
> (house net/seed +0.373 → +0.223 → −0.139, ordering re-inverts at −4.95 pp), reachable from 1,026
> credits at the 5–200 port; and F-222-3 (`T-226`) — the archetype ordering is **stake-conditional**
> and inverts at band floors. The one named alternative (referencing the ante to the player's stake)
> was **bakeoff'd on identical seeds** and declined on LD-28's standing invariant, §21.4a.

**F-176-1 CLOSES: MEASURED, BAKED OFF, AND DECLINED WITH THE NUMBERS.** The finding was right that
the model is wrong about the counterparty — the shipped rule assumes a 100% immediate-call rate
against a measured **22.62% / 28.01% / 29.86%** — and wrong about what follows from that. Every
replacement derived from a named source loses, three of the four re-invert the archetype ordering
T-175 shipped, and the strongest loses to the incumbent at z ≥ 4.6 at every tier and by 29–34
credits per hand against a bluffing opener. The assumption survives, now with a derivation, a
measurement and a test instead of an unexamined comment.

## §20 · T-220 — F-176-2 closed: C2 re-scored, partitioned and ruled (2026-08-06)

**The task in one line.** T-160's arbitration criterion **C2** — "**55–70%** player win rate,
EV/hand well under +558 cr" (§17.2) — has been fallen through by the shipped game
(**52.90%**, §18.6 / §19.9) and nobody re-scored the band against the rules that now exist.
T-220 does that: it re-derives what a defensible win rate *is* under the shipped opening rule,
**retires C2's win-rate limb as the bakeoff instrument it was**, **promotes its EV limb to a
standing invariant**, adds one further invariant derived from design intent, and pins all of it
with tests. **No rule moved. No band, threshold or golden was edited in either direction.**
The ruling is **LD-28** in `docs/LIARS-DICE-DECISIONS.md`.

### 20.0 Corrections to the task's own framing, made before anything ran

Following §18.0 / §19.0: where the finding or the plan asserts something the repo does not
support, it is corrected **here, first**, rather than quietly worked around.

1. **A T-160 → HEAD composition decomposition is NOT COMPUTABLE, and this task does not fake
   one.** The plan asks whether the fall from 61.07% to 52.90% is composition or rate. That
   question needs per-cell counts on *both* endpoints, and `dareCells` — the instrument that
   produces them — **shipped at T-175**, one task *after* T-160 (§18.6a's lineage;
   `packages/sim/src/index.ts` `zeroDareCells`). The T-160 arm has no cells and cannot be given
   any without re-running T-160's *rule*, which this task is forbidden to do. §20.4 therefore
   answers the *decidable* form of the same question — **is the aggregate a mixture whose level
   moves with its weights?** — entirely within HEAD, which is what the argument actually needs.
2. **The trend's T-160 figure is 61.07%, and §17.3's bakeoff table says 60.88%. Both are
   correct and they are different rigs.** 61.07% is the post-fix **capstone sweep** at
   n = 101,616 (§16.2, LD-21); 60.88% is the **200-seed bakeoff arm** at n = 34,008 (§17.3).
   The trend row quotes the capstone figure, which is the right one to compare against HEAD's
   capstone-scale 52.90%. Recorded so a later reader does not read a contradiction.
3. **Phase 0 is shards-only, and that is deliberate — no `--merge`, no `--aggregate`, no
   capstone.** The standing "1-indexed shards then `--merge`, verify 8,000 rows,
   `--milestone-days` **and** `--aggregate`" constraint governs the **capstone sweep**, which is
   owed when `rulesFingerprint` moves. It does not move here (§20.5's fingerprint block), so
   this is a **single-policy diagnostic arm** measured exactly as T-219 §19.9 measured its
   re-score. Stated so the reviewer does not read a skipped step.
4. **`combat-win-share` FAILs on all four shards, and it is the known gambler-only-arm
   artefact, not a regression.** §19.9 records the same FAIL on the identical arm shape:
   a `--policies gambler` arm plays almost no combat, so the share is measured on a
   near-empty numerator. `invariants: 0 violations` on all four shards.

### 20.1 Predictions, recorded BEFORE the rows were scored

Written to this file and committed to before `.scratch/t220-c2.mjs` was run, so they can be
scored rather than rationalised (§17.1 / §18.3 / §19.4 discipline). Scored at §20.6, wrong ones
included.

| # | Prediction | Outcome |
| --- | --- | --- |
| 1 | The arm **reproduces §18.6 / §19.9 exactly** — 1,600 rows, 279,857 dares, 52.90%, +190.1 cr/hand, C6 +15.79 pp — and both fingerprints read unmoved | *(scored at §20.6)* |
| 2 | **Both pools clear the Accept bar** of n ≥ 10,000 hands on their own count | *(scored at §20.6)* |
| 3 | **The two pools land on OPPOSITE sides of C2's 55% floor** — roaming above it, roster below — so C2's aggregate form has no consistent per-pool reading and cannot be a standing invariant in the form it is written | *(scored at §20.6)* |
| 4 | **EV/hand is POSITIVE on both pools**, not merely in aggregate — the proposed new invariant holds at the finer cut too | *(scored at §20.6)* |
| 5 | Of the 8 pool × archetype cells, **exactly 4 are populated** and the other 4 are **structurally empty** rather than under-powered: `none` is a roaming-only slot and the three archetypes are roster-only | *(scored at §20.6)* |
| 6 | Re-weighting the aggregate across tier mixes, **holding every cell's own rate fixed**, moves the headline by **≥ 3 pp** — i.e. a material part of the level is composition, not rate | *(scored at §20.6)* |

### 20.2 THE DERIVATION — what a defensible win rate is under the rules that now exist

Accept requires the band be **argued rather than picked**, against the anchors §17.3 used. Each
anchor is addressed by name.

**Every anchor C2's floor was built on was measured on the defect C2's own bakeoff removed.**

| anchor | what it was measured on | can it bound the shipped game? |
| --- | --- | --- |
| T-137 **94.66%** (§1.3's follow-up, §16.1) | openers guaranteed true **100.00%** — F-137-1, the defect itself (§16.2) | **No.** It is a measurement *of* the defect. |
| T-148 **80.07%** (progression spec §12.2, quoted §17.3) | same defect, post-ladder — control arm reproduces it at 80.30% with openers still 100.00% true | **No**, for the same reason. |
| §1.3's **57.3%** | the **opposed-d20 Dare** — a single opposed check, a different mechanic, discarded | **No.** §1.3 says it in its own words: *"none of the old figures is a target, and no constant in this spec may be retuned to reproduce them."* T-160 was entitled to use it as a **bakeoff anchor**; it cannot be a floor for a mechanic that did not exist when it was measured. |

**And C2's own row says what it is for: "Disqualifies; does not pick."** It is a *relative*
instrument — a fence around a set of candidate rules, written before any of them was measured.
It discharged that job twice and correctly: it disqualified shape (a) at **73.04%** above the
ceiling (T-160 §17.3) and again at **39.64%** below the floor (T-176 §18.6). A criterion that
has done its arbitration job is not thereby a standing invariant, and nothing ever promoted it.

**The shipped game's own opening rule supplies the replacement anchor, with no free parameter.**
`minOpeningQuantity(m) = m + 1` (`packages/engine/src/liarsDiceRules.ts:498`, reached from
`isLatticeMove`'s `bid` arm at `:545`) forces the opener to claim **strictly above their own
count**. Both house policies throw on `bid === null` — `dealerMove` at `:801`, `archetypeMove`
at `:1113` — so **the opener is always the player**, by construction rather than by convention.

The minimum legal opening claim `(own(f) + 1, f)` is therefore true **iff the other side holds
at least one of the claimed face** among its `dicePerSide` dice. That probability is the
engine's own `probAtLeast(1, d)` — **called, never restated as a literal** (the LD-26 / LD-27
no-literals-in-the-mechanism precedent; pinned by the §20.5 test):

| `dicePerSide` | tier | `probAtLeast(1, d)` — P(the minimum legal opener is TRUE) |
| --- | --- | --- |
| 4 | 0 | **51.77%** |
| 5 | 1 | **59.81%** |
| 6 | 2–5 | **66.51%** |

**This is the load-bearing reading.** The shipped rule makes the game **structurally asymmetric
against the player at ply 1**: the player must put a claim at risk before anyone else does, and
even the cheapest such claim is a coin-flip-plus at four dice. A band **centred on 62.5%** was
never derivable from these rules — it was derivable only from the rules that let the opener
claim for free, which is precisely what T-160 deleted. **50% is not this game's fair point
either**: the player also *chooses the stake*, *chooses the face*, and — measured, not
assumed — challenges from an **evidence-backed position 100% of the time** against the dealer's
57.5% / 77.1% (§18.5, LD-22). Those advantages are what put the measured rate slightly *above*
the ply-1 burden rather than at it, and 52.90% sitting between `probAtLeast(1,4)` = 51.77% and
`probAtLeast(1,5)` = 59.81% is the shape that derivation predicts.

**Therefore the ruling is a PARTITION, not a simple retirement.** C2 has two limbs and they have
different provenances:

1. **The WIN-RATE limb is RETIRED as the bakeoff instrument it was.** Its text in §17.2 stands
   **verbatim**; the 55–70% is **not edited**, and the shipped game is still reported as having
   fallen through it. (LD-22 / C3's exact precedent: re-derive, never move the number.)
2. **The EV limb SURVIVES and is PROMOTED to a standing invariant, unchanged:** EV/hand **well
   under +558 cr**. That number is not a taste call — it is **T-148's measured money-printer
   signature** (§17.3's control arm reproduces it at +565.8), i.e. the observed EV of a table
   that was provably broken. A bar that names a measured pathology keeps its meaning after the
   pathology is fixed.
3. **A SECOND standing invariant is added, derived from design intent rather than from the
   measurement: the player's EV per hand must remain POSITIVE.** The Dare is a **voluntary**
   action whose headline value is the disposition channel (`docs/HANGOUT_REDESIGN.md` §7 /
   §10.4 — the interceptor draw). A negative-EV table is one a rational player never sits at,
   which closes that channel and strands the content behind it. This is falsifiable and it has
   a **demonstrated violator**: shape (a) took the table to **−314.9 cr/hand** (§18.6).

**THE COUNTER-CASE, stated and answered rather than omitted.** Retiring a band the shipped game
has just fallen through is, on its face, self-serving. Three things answer it, and all three are
checkable:

- **(i) No number moved, in either direction.** The 55–70% stands verbatim in §17.2, the fall
  through it is still reported as a fall, and §20.5's `git diff --stat` shows no band, threshold
  or golden touched anywhere in the repo.
- **(ii) The replacement bars predate the measurement and name their sources.** +558 is T-148's
  measured figure from before shape (b) existed; "EV > 0" is a design-intent statement about a
  voluntary action, not 190.1 minus slack. Neither was reverse-engineered from 52.90%.
- **(iii) If the derivation had produced a floor above 52.90%, the honest outcome would have
  been to report a miss.** That is exactly what T-160 did for C3 (§17.3: *"NEITHER shape meets
  the pre-committed ≤20 pp, and that is reported as a miss, not softened"*), and what §18.5 did
  again when C3-as-written stayed a miss after re-derivation. The derivation above landed where
  it landed because of `minOpeningQuantity`, not because of where the measurement sits.

### 20.3 THE MEASUREMENT — per pool, `n` on every cell

**The arm.** Identical in shape to §18.4 / §19.9, so the comparison is like-for-like:

```
npm run balance:sweep -- --label t220-c2 --seeds 1600 --days 120 --policies gambler \
  --milestone-days 21,29,30,41,60,120 --shard i/4          # i = 1..4, run in parallel
node .scratch/t220-c2.mjs t220-c2
```

**Stamps asserted before anything was scored** (`.scratch/t219-fp.mjs`, unchanged):
`rules cabd2112ccf4cefb`, `instrument 2d6d1990eaf13031` — **both identical to §18.6a's**, so HEAD
is exactly the arm §18/§19 measured and every number below attributes to the shipped rule.
`dareTierDisagreements 0` and `dareChallengeDisagreements 0` on all four shards; `invariants: 0
violations` on all four.

**The join is asserted, not eyeballed** — the free correctness check that the pool rollup is
lossless: `Σ dareCells.hands = 279,857 = Σ dares`; `Σ playerWon = 148,052 = Σ daresWon`;
`Σ netCredits = 53,208,282 = Σ netCredits`. All three exact.

**Reproduction of §18.6 / §19.9, which an unchanged rule must give:** 1,600 rows, **279,857**
dares, **52.90%**, **+190.1 cr/hand**, bids/hand **1.504**, `finalCredits` median **64,622**,
C6 `bad − optimal` **+15.79 pp, SE 0.44, z 35.93** — every published decimal. *(The median is the
lower-middle element of the 1,600 sorted rows, which is the convention §18.6 used; the mean of the
two middle rows is 64,634.5. Recorded so the two figures are not read as a discrepancy.)*

**THE HEADLINE — the Accept bar is `n ≥ 10,000` hands per pool, and BOTH pools clear it by more
than an order of magnitude.**

| pool | **n (hands)** | player win rate | SE | **EV / hand** | bids/hand | **n bar** |
| --- | --- | --- | --- | --- | --- | --- |
| **roaming** (`archetype = none`; the house plays `dealerMove`) | **157,037** | **58.55%** | 0.12 | **+495.8 cr** | 1.289 | **PASS** |
| **roster** (the named captains; the house plays `archetypeMove`) | **122,820** | **45.69%** | 0.14 | **−200.8 cr** | 1.780 | **PASS** |
| **AGGREGATE** | **279,857** | **52.90%** | 0.09 | **+190.1 cr** | 1.504 | — |

**The single most important line in this task:** *the two pools sit on OPPOSITE sides of C2's 55%
floor, 12.86 pp apart.* One number cannot be a standing invariant for both.

**POOL × ARCHETYPE — 8 cells, `n` on each.** Four are **structurally empty** rather than
under-powered, and the distinction is stated rather than left to the reader: `none` is the
roaming-only slot and the three archetypes are roster-only, so the empty cells are cells the
rules cannot reach, not cells the sample missed.

| cell | **n** | player win rate | SE | EV / hand | reading |
| --- | --- | --- | --- | --- | --- |
| `roaming\|none` | **157,037** | 58.55% | 0.12 | +495.8 | n bar PASS |
| `roster\|optimal` | **95,580** | 39.83% | 0.16 | **−482.3** | n bar PASS |
| `roster\|bad` | **14,680** | 55.63% | 0.41 | +301.9 | n bar PASS |
| `roster\|random` | **12,560** | 78.61% | 0.37 | +1,354.3 | n bar PASS |
| `roaming\|optimal`, `roaming\|bad`, `roaming\|random`, `roster\|none` | **0** | — | — | — | **STRUCTURALLY EMPTY** — unreachable by the pool/archetype partition, not under-sampled |

**POOL × TIER — 12 cells, `n` on each.** Six clear the 10,000 bar on their own count; the six
low-tier cells are marked **UNDER-POWERED** and are read as *direction* only, never as a
published rate.

| cell | **n** | win rate | SE | EV / hand | | cell | **n** | win rate | SE | EV / hand |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `roaming\|t0` | 2,550 | 46.75% | 0.99 | −13.7 | *under-powered* | `roster\|t0` | 5,450 | 30.42% | 0.62 | −117.1 | *under-powered* |
| `roaming\|t1` | 3,007 | 55.47% | 0.91 | +23.1 | *under-powered* | `roster\|t1` | 4,990 | 40.24% | 0.69 | −56.7 | *under-powered* |
| `roaming\|t2` | 6,569 | 60.25% | 0.60 | +44.8 | *under-powered* | `roster\|t2` | 9,421 | 47.49% | 0.51 | −14.7 | *under-powered* |
| `roaming\|t3` | **14,761** | 59.01% | 0.40 | +44.0 | PASS | `roster\|t3` | **17,219** | 46.87% | 0.38 | −23.8 | PASS |
| `roaming\|t4` | **35,700** | 60.26% | 0.26 | +225.7 | PASS | `roster\|t4` | **28,193** | 46.32% | 0.30 | −143.2 | PASS |
| `roaming\|t5` | **94,450** | 58.12% | 0.16 | +728.7 | PASS | `roster\|t5` | **57,547** | 46.65% | 0.21 | −332.8 | PASS |

**C6, the archetype ordering, re-scored alongside as Accept requires:** `roster|optimal` **39.83%**
(n = 95,580), `roster|bad` **55.63%** (n = 14,680), `roster|random` **78.61%** (n = 12,560).
**`bad − optimal` = +15.79 pp, SE 0.44, z 35.93.** The ordering holds and does not re-invert —
reproducing §18.4 and §19.9 exactly, which is what an unmoved rule owes.

### 20.3a THE DERIVATION, CORROBORATED — the opening burden tracks the measured rate

§20.2's anchor is `probAtLeast(1, d)`. If it is the right reference, the *shape* of the win rate
across the dice ladder should follow it and the *pool identity* should set the level. Cut by dice
width, that is exactly what the rows say — and the offset is near-constant within each pool across
all three widths, which is a much stronger result than the level agreement alone:

| pool | dice `d` | tiers | **n** | measured | `probAtLeast(1, d)` | **offset** |
| --- | --- | --- | --- | --- | --- | --- |
| roaming | 4 | t0 | 2,550 | 46.75% | 51.77% | **−5.03 pp** |
| roaming | 5 | t1 | 3,007 | 55.47% | 59.81% | **−4.34 pp** |
| roaming | 6 | t2–t5 | **151,480** | 58.81% | 66.51% | **−7.70 pp** |
| roster | 4 | t0 | 5,450 | 30.42% | 51.77% | **−21.35 pp** |
| roster | 5 | t1 | 4,990 | 40.24% | 59.81% | **−19.57 pp** |
| roster | 6 | t2–t5 | **112,380** | 46.67% | 66.51% | **−19.84 pp** |

**Roster's offset is flat to within 1.8 pp across the whole ladder; roaming's to within 3.4 pp.**
The ply-1 opening burden explains the *ladder shape* of the win rate, and which house policy sits
opposite explains the *level*. That is the derivation earning its place, not decorating it.

### 20.4 THE COMPOSITION READ — the aggregate's LEVEL is a weighting choice

The second, independent reason C2's aggregate form was never a standing invariant. The headline is
a **mixture** over `pool × archetype × tier`, and its weights move whenever content or run length
moves. **Holding every cell's own rate fixed at its measured value and changing only the weights:**

| weighting | win rate | EV / hand |
| --- | --- | --- |
| **as measured** (actual mix, 1,600 careers × 120 days) | **52.90%** | **+190.1** |
| tier-0 mix only | **35.63%** | −84.2 |
| tiers equally weighted | 49.11% | +49.4 |
| pools equally weighted | 52.12% | +147.5 |

**A 17.28 pp spread with not one rate changed.** The rules are identical in all four rows; only
the question "which hands count" differs. A number that moves 17 pp on a bookkeeping choice cannot
be a bar the game passes or fails.

**This is not hypothetical, and the repo already contains the demonstration.** T-175's Delivered
note read **51.58%** off a five-seed × 40-day window; this capstone reads **52.90%** off 1,600
seeds × 120 days — **on the same rules**. Careers climb the ladder, so a longer run re-weights
toward `t5` (152,000 of 279,857 hands) and toward roaming. The band would be passed or failed by
the sweep's `--days`, which is an argument, not a rule.

**But the ROAMING−ROSTER gap itself is RATE, not composition — and that is reported even though
it cuts against the tidier story.** Kitagawa-decomposing the 12.86 pp pool gap over the tier axis:
**composition +0.41 pp, rate +12.45 pp — composition share 3.2%.** Unlike C3, where T-176 found
~70% of the raw gap was composition (LD-22), the two pools here genuinely play differently against
the player; their tier mixes are nearly the same. **Both readings are true and they answer
different questions:** the *level* of the aggregate is highly weighting-sensitive (17.28 pp), while
the *pool difference* is a real difference between `dealerMove` and `archetypeMove`. Only the first
bears on whether C2 can be an invariant, and it is the one the ruling rests on.

### 20.5 THE RULING, AND WHAT WAS NOT EDITED

**Binding text: LD-28** in `docs/LIARS-DICE-DECISIONS.md`. In summary:

1. **C2's WIN-RATE limb is RETIRED as the bakeoff instrument it was**, on §20.2's derivation.
   Its text in §17.2 stands **verbatim**; the **55–70% is not edited**; the shipped game's fall
   through it is still reported as a fall, here and in §18.6 and §19.9.
2. **C2's EV limb is PROMOTED to a standing invariant, unchanged** — pooled EV/hand well under
   **+558 cr**, T-148's *measured* money-printer signature. Measured **+190.1**, comfortable.
3. **A second standing invariant is added** — pooled EV/hand **> 0**, from design intent (the
   Dare is voluntary; §10.4's disposition channel closes if a rational player never sits down),
   with a demonstrated violator in shape (a)'s **−314.9** (§18.6).
4. **The residual is FILED, not absorbed: F-220-1 / `TASKS.md` T-223.** The roster pool is
   EV-**negative** at −200.8 cr/hand. §20.6's prediction 4 said it would not be and was wrong.
   The invariants above are therefore stated on the **pooled** table, and the pool-level price is
   an owner call with its own row rather than a clause buried here.

**NO RULE MOVED, and the "if any rule moves" branch of Accept is discharged per-lever in writing
rather than left dangling:**

| lever | why it did not move |
| --- | --- |
| `dealerMove`'s terminal fallback (shape (a)) | **Dead — LD-22.** Lost C2 at 73.04% (T-160) and again at 39.64% (T-176), took EV/hand to −314.9, dropped the gambler's median purse 68.5%, and produced the only invariant violation in 3,200 careers. |
| `optimal`'s raise valuation | **Closed and declined — LD-27 / §19.** Four replacements from named sources, bakeoff'd at n = 200,000/arm/tier; all four lose, three re-invert the ordering, and §19.9 records that the strongest moves the win rate **further from** the band (43.26%). |
| `SIM_DARE_CHALLENGE_MARGIN` / `DARE_AI_CHALLENGE_MARGIN` | T-176's Delivered note already ruled that touching either to move this number is **tuning the instrument to hit a threshold**. |
| `minOpeningQuantity` | **It is the fix.** Unwinding it re-opens F-137-1 — and it is the very rule §20.2's replacement anchor is derived from. |

**FINGERPRINTS AND SCOPE.** Touched: `docs/**`, `packages/sim/src/__tests__/**`, `.scratch/**`,
`TASKS.md`. `__tests__` is in `HASHED_ROOT_IGNORED_DIRECTORIES` and is not in
`SIM_INSTRUMENT_DIRECTORIES` (`packages/sim/src/balance/rules-fingerprint.ts`, whose list is
`['', 'balance']`), so **`instrumentFingerprint` does not move**. Nothing under
`packages/engine/src` or `packages/content/src` changes at all, so **`rulesFingerprint` does not
move** — measured **`cabd2112ccf4cefb`** before the run and unchanged after. **`docsFingerprint` is
UNMOVED too, at `265aea1d09f0d485`** — and the reason is worth stating because the name invites the
opposite guess: `computeDocsFingerprint` (`rules-fingerprint.ts:658`) hashes the **raw bytes of the
same rule and instrument SOURCES**, comments included, **not `docs/**`**. Markdown does not enter
it. This task edits no hashed source at all, so all three hashes hold. **No capstone, no
re-extract, no baseline re-pin is owed**, and §20.0 correction 3 says why the Phase-0 arm is
shards-only.
**`CURRENT_SAVE_VERSION` is UNMOVED at 17**, re-read live at `packages/engine/src/save.ts:627` —
nothing persisted moved, and a derived per-pool report is not a save shape, so **no migration and
no round-trip test is owed**. Stated rather than left to inference.

### 20.6 THE PREDICTIONS, SCORED — including the wrong one

| # | Prediction | Outcome |
| --- | --- | --- |
| 1 | Reproduces §18.6 / §19.9 exactly; fingerprints unmoved | ✅ **PASS** — 1,600 / 279,857 / 52.90% / +190.1 / +15.79 pp z 35.93 / median 64,622, `rules cabd2112ccf4cefb`, `instrument 2d6d1990eaf13031` |
| 2 | Both pools clear n ≥ 10,000 | ✅ **PASS** — 157,037 and 122,820, both by >10× |
| 3 | The pools land on **opposite sides of the 55% floor** | ✅ **PASS** — roaming 58.55% above, roster 45.69% below, 12.86 pp apart |
| 4 | **EV/hand is positive on BOTH pools** | ❌ **WRONG.** roaming **+495.8**, roster **−200.8**. The new invariant holds *pooled* and **fails on the roster pool**. Filed as **F-220-1** / `TASKS.md` **T-223** (§20.7) and the invariant is stated on the pooled table in consequence — the prediction was not quietly restated to match the result. |
| 5 | Exactly 4 of 8 pool × archetype cells populated, the rest **structurally empty** | ✅ **PASS** — `roaming\|none`, `roster\|optimal`, `roster\|bad`, `roster\|random`; the other four are unreachable by the partition, not under-sampled |
| 6 | Re-weighting moves the headline **≥ 3 pp** with rates held fixed | ✅ **PASS**, and by far more than predicted — **17.28 pp** (35.63% under a tier-0 mix vs 52.90% as measured) |

**Prediction 4 is the useful one.** It was the prediction most convenient to this task's own
ruling, it is the one that failed, and it produced the finding. Recording it as a miss is the
difference between a re-derivation and a rationalisation.

### 20.7 Findings filed by T-220

**F-220-1 · the ROSTER pool is a net credit SINK, and nothing names or bounds the price.** Filed
as `TASKS.md` **T-223**. The aggregate +190.1 cr/hand is a mixture of **+495.8** (roaming,
n = 157,037) and **−200.8** (roster, n = 122,820), the latter driven by `roster|optimal` at
**−482.3 over n = 95,580 — 34% of every hand played.** A player who wants disposition with a
**specific named captain** must sit at a roster table, so the disposition channel §10.4's
interceptor draw depends on is gated behind a credit sink. **LD-26 already ruled that credits buy
disposition and that the two currencies partition**, so this may well be the intended shape one
level up — but **the price has never been named, derived, bounded or tested**, nothing in
`docs/HANGOUT_REDESIGN.md` §7 / §10.4 says the named-captain table is meant to cost credits, and no
test would notice if it doubled. That is an owner call, and T-220 is a measurement-and-ruling task
that may not take it: setting a roster-EV floor here would be fitting a bar to a number this task
just measured, which is exactly what §20.2(ii) forbids.

> **CLOSED AT T-223 — LD-30 (2026-08-06).** The numbers above are exact and reproduce to every
> decimal (§22.3). **The reading is inverted, and §22.0 correction 1 shows why: a roster seat pays
> NO disposition at all** (`actions/dare.ts:168-181`, §7.6's hard null, with a shipped test), so the
> sink cannot be the disposition channel's price — that channel is fed by the **roaming** pool, the
> one at +495.8. What −200.8 measures is the **seat election**: `planDare` takes the richest
> candidate, content prices difficulty in purse, and the two meet on `optimal` for **77.82%** of the
> gambler's roster hands. Re-weighted to content's **own authored seat census** the same pool reads
> **+172.8 cr/hand**, and the shipped **set-seeking** instrument — the one that buys what the roster
> actually sells — is **PAID +21.5 cr/hand (n = 11,021)** and closes the grand slam in 141 of 152
> careers (§22.4a). Ruled **intended**, with a bounded standing invariant (the **census bound**) and
> the unbounded-downside asymmetry named (§22.4b). One residual filed rather than absorbed: the
> player is told **nothing** about which seat is the hard one — **F-223-1 / `TASKS.md` T-227**.
> Nothing in §20.3, §20.5 item 4 or §20.6's prediction-4 row is edited.

### 20.8 The scorecard

| Accept clause | verdict |
| --- | --- |
| C2 re-derived **or** retired explicitly in `docs/LIARS-DICE-DECISIONS.md`, **argued not picked**, against §17.3's anchors incl. §1.3's 57.3% | **DONE — LD-28.** §20.2 addresses all three anchors by name and derives the replacement from `minOpeningQuantity` + `probAtLeast(1,d)` with no free parameter; §20.3a corroborates it on the rows. **A partition, not a blanket retirement:** the win-rate limb retires, the EV limb is promoted, a third invariant is added. |
| if any rule moves it is **bakeoff'd rather than tuned**; archetype ordering re-scored alongside | **DISCHARGED VACUOUSLY AND DELIBERATELY** — no rule moved; §20.5 gives the reason per lever. **C6 re-scored anyway**: +15.79 pp, SE 0.44, z 35.93, no re-inversion. |
| rate re-measured at **n ≥ 10,000 hands per pool**, **`n` on every cell** | **PASS** — roaming **157,037**, roster **122,820**. `n` on all 8 pool × archetype cells, all 12 pool × tier cells, all 6 dice-width cells and every C6 row; six under-powered tier cells are **marked as such** rather than published as rates. |
| §17.2's **C2 row gains the outcome** | **DONE** — a second dated italic line appended beneath T-176's. **The `55–70%` text is untouched.** |
| gate green | `npm run format`, `npm test`, `npx tsc -b`, `npm run lint`, `npm run format:check` all exit 0; zero failing tests; the `it.fails` tripwires stay red-as-designed. |
| no band / threshold / golden edited | **NONE** — in either direction. `git diff` touches `docs/**`, `packages/sim/src/__tests__/**`, `.scratch/**` and `TASKS.md` only. |

**F-176-2 CLOSES: RE-SCORED, PARTITIONED AND RULED.** The trend the finding flagged is real and
monotone — 94.66% → 80.07% → 61.07% → 52.90% — and the finding was right that nobody had re-scored
the band. What the re-score shows is that **three of those four numbers were measured on a game
whose opening claim was risk-free**, and the fourth is the first honest reading. The band was a
fence around a bakeoff; the shipped rules put the player's ply-1 burden at **51.77% / 59.81% /
66.51%** by construction, and 52.90% is what a game with that burden and a selective challenger
looks like. **Nothing was tuned, no number was moved, and the one part of C2 that named a measured
pathology rather than a picked figure was kept and promoted.**

## §21 · T-222 — F-219-1 closed: the stake/ante coupling, measured and ruled (2026-08-06)

**The task in one line.** T-219 derived, and §19.10 filed, that `optimal`'s raise evidence gate is
`ante / (2·seedWager + ante)` — **a bar the player moves by choosing how much to stake**. T-222
re-measures that coupling on HEAD over **every shipped band × all six tiers**, quantifies its effect
on **play** rather than on the gate, bakes the coupling off against the one named alternative that
dissolves it, and rules. **No rule moved. No band, threshold, fraction or golden was edited in
either direction.** The ruling is **LD-29** in `docs/LIARS-DICE-DECISIONS.md`. Three residuals are
**filed rather than absorbed** — F-222-1 / F-222-2 / F-222-3, `TASKS.md` **T-224 / T-225 / T-226**.

**The headline, stated before the evidence so a reader can check it against the tables:** the
finding's *fact* reproduces exactly and its *reading* is measured backwards. The gate does loosen
with the stake — and a looser gate is **better for the house**, monotonically, at every band and
every bounded tier, because `c / (pot + c)` is not an accident of the ante/pot ratio: **it is pot
odds**, the exact break-even probability of a raise costing `c` into a pot of `pot`. What the
measurement *did* turn up is two things F-219-1 did not name: a **dead zone one ante wide at the top
of every bounded band**, where the loosest gate in the band is unreachable because no raise is legal
at all, and **tier 5**, where the ceiling is removed, nothing caps the ratio, and the gate walks past
the value every bounded tier stops at.

### 21.0 Corrections to the task's own framing, made before anything ran

Following §18.0 / §19.0 / §20.0. Five things the finding as written does not say, each verified at
HEAD before it was recorded.

1. **`ante / (2·seedWager + ante)` is the gate at the FIRST decision only; the pots GROW.**
   `placeBid` does `hand.potPlayer += antePaid` and the dealer's mirror
   (`packages/engine/src/actions/dare.ts:326-333`). The general gate is
   `ante / (potPlayer + potDealer + ante)` with `potPlayer + potDealer ≥ 2·seedWager`, monotone
   non-decreasing within a hand. **The finding's formula is therefore the TIGHTEST bar the house
   ever faces**, and every subsequent ply loosens it further — which strengthens the finding rather
   than weakening it. Measured directly in §21.4's deep ladder: a cell whose *opening* gate is
   `k ≤ 4` emits `k = 5` raises on 16.79% of its raises, because the pots grew mid-hand. Pinned by
   the test named in §21.5.
2. **`seedWager` is NOT freely chosen — it is clamped by BOTH purses.**
   `packages/engine/src/actions/hangout.ts:471-478`:
   `seedWager = max(0, min(max(requested, band.min), min(band.max ?? ∞, player.credits, opponentCredits)))`.
   "A quantity the player controls and the house does not" is true only inside a solvency envelope
   that **includes the dealer's own purse**, and that envelope is already pinned end-to-end by
   `liarsDice.test.ts`'s `T-145 · the solvency clamp reads the LIVE purse (§7.2)` describe. Whether
   the ceiling is *reachable* is an empirical question, answered at §21.4c, not an assumption.
3. **T-219 enumerated TIER 0 ONLY, and the tier is where the coupling changes character.**
   `anteFor(systemId, tier)` multiplies by `LIARS_DICE_RAISED_CEILING_MULT` at `tier >= 4`
   (`liarsDiceRules.ts:72-75`) and `effectiveWagerBand` returns `band.max × MULT` at tier 4 and
   **`{min: 0, max: null}` at tier 5** (`:324-332`). So at tier 4 the ante and the ceiling scale
   *together* — the gate at the ceiling is unchanged and the bar at a **fixed** stake tightens 3× —
   and at tier 5 the ceiling is removed while the ante stays frozen at the tier-4 reference. "Every
   shipped band" is read here as **bands × six tiers**, because the coupling is not tier-invariant.
4. **The shipped instrument cannot cut by stake, and this task does NOT add that cut.** `dareCells`
   is keyed `pool|archetype|tier` (`packages/sim/src/index.ts`); adding a stake dimension is an
   instrument change (`packages/sim/src` is in `SIM_INSTRUMENT_DIRECTORIES`, list `['', 'balance']`)
   and would move `instrumentFingerprint` inside a measurement task — the shape §19 and §20 both
   refused. The stake evidence therefore comes from **temporary uncommitted probes**
   (`.scratch/t222-bands.ts`, `.scratch/t222-stake.ts`, `.scratch/t222-fidelity.ts`,
   `.scratch/t222-reach.ts`); the shipped instrument is used **only** for the reproduction arm
   (§21.4c, §21.5). Stated so a reviewer does not read a skipped step.
5. **THE PLAN'S OWN REACHABILITY PROBE IS NOT A FAITHFUL ARM, AND IT IS REPORTED AS A FAILED
   INSTRUMENT RATHER THAN QUIETLY USED.** The plan asks for `runCampaign(seed, days, wrappedPolicy)`
   wrapping `gamblerPolicy`. `resolvePolicy` (`packages/sim/src/index.ts:6446-6449`) gives a **raw
   `SimPolicy` `dawnBlind: true`**, while the named `'gambler'` arm resolves with
   `dawnBlind: false` — so a wrapper is invoked at a different point in the day and is a different
   arm. Measured, not assumed: the wrapper arm's mean **seated** stake is **102.3** against the
   shipped arm's **2,631.6**, a 25× divergence, and its `handsAboveBaseCeiling` is 0.07% against
   64.13%. Its within-band histogram is therefore **discarded** and §21.4c answers reachability off
   the shipped instrument's own seated quantities, which are exact.

### 21.1 Predictions, recorded BEFORE the rows were scored

**Full disclosure of what had already run when these were written** (§19.5's "a fourth alternative
was added after the first run, and that is recorded rather than hidden"): the enumeration (§21.3),
the fidelity harness, the reproduction arm, the reachability read, and **one exploratory block** —
the default 25–1000 band at tier 0 (five cells) plus the three controls of §21.4. **Not yet run or
looked at**: the full 13-band × 4-tier × 5-position matrix, every tier-5 cell, the deep ladder, and
the entire bakeoff arm. Predictions 1–6 are scored at §21.6, wrong ones included; the reproduction
of §19.10's tier-0 enumeration is reported as a **reproduction**, not dressed up as a prediction.

| # | Prediction | Outcome |
| --- | --- | --- |
| 1 | Every band at every tier 0–4 shows the same three-regime shape: stake-normalised house net RISES with the gate step, then COLLAPSES at the exact band ceiling | *(§21.6)* |
| 2 | At the exact band ceiling at tiers 0–4, **zero** raises are emitted at **every** band, and the player win rate there equals `probAtLeast(1, u)` to within 1 pp | *(§21.6)* |
| 3 | **A1 holds** — net/seed is non-decreasing in the gate step at every band and tier | *(§21.6)* |
| 4 | **A2 fails on the probe at band FLOORS** — `bad − optimal` is negative at the floor of most bands at tier 0 — while holding on the shipped instrument | *(§21.6)* |
| 5 | Tier 5 admits `k = 4` inside the measured maximum seated wager (32,510) for at least half the bands, and admits `k = u` at none of them | *(§21.6)* |
| 6 | The tier-5 cells beyond the tier-4 ceiling do **not** collapse the way the bounded ceilings do, because `bandMax === null` removes the headroom clamp | *(§21.6)* |

### 21.2 Arbitration criteria, pre-committed BEFORE the runs

| # | criterion | why this and not a magnitude bar |
| --- | --- | --- |
| **A1 · DIRECTION** | stake-normalised house net per hand (`houseNet / seedWager`) is **non-decreasing across the gate steps** at every band and tier where a raise is legal | This is the bar that matters. If a LOOSER gate makes the house WORSE, the bar is mispriced and a constant must move. A magnitude bar was deliberately **not** chosen: the coupling's magnitude is a property of the band's width, so picking an X% would be picking a number to pass. |
| **A2 · ORDERING** | `bad − optimal` does not re-invert **on the shipped instrument's arm** (C6, §19.9's +15.79 pp) | K2's bar, §19.3. Any cell where it inverts on the probe is reported and either shown unreachable or ruled — never dropped. |
| **A3 · REACHABILITY** | where the measured game actually sits inside each band, from the instrument's own **seated** quantities | Answers "is the end of the band a place the game visits" without an instrument change (§21.0 item 4). |
| **A4 · DISSOLUTION** | no **reachable** (band, tier, stake) triple makes the gate admit `k = u` | If one exists it is **named and ruled**, not discovered later. |

**A1–A4 all hold ⇒ rule the coupling acceptable, LD-29, no rule change. Any failure ⇒ the change
branch fires and the ruling names which criterion failed.** Both happened, and §21.5 says exactly
which limb each outcome attaches to.

### 21.3 THE ENUMERATION, RE-RUN ON HEAD — bands × ALL SIX TIERS

`.scratch/t222-bands.ts`, derived from `.scratch/t219-bands.ts`. Every number below comes through
`wagerBandFor` / `effectiveWagerBand` / `anteFor` / `probAtLeast` / `dicePerSideForTier` — **no
restated constant anywhere**. The step boundaries are **closed form, not sampled**: `optimal` admits
evidence `k` at seed `s` iff `probAtLeast(k,u)·(2s + c) > c`, i.e. `s > c(1−p)/(2p)`, so the smallest
integer seed admitting `k` is `⌊c(1−p)/(2p)⌋ + 1`. *(The `+ 1` is load-bearing and corrects the
first draft of this section: the inequality is **strict**, so even at `p = 1` a **zero** stake admits
nothing — a free hand has no raising game at all. The test named in §21.5 caught that, which is the
test doing its job on the day it was written.)*

**§19.10 REPRODUCES EXACTLY AT TIER 0**: **40/40** bands widen, transitions **`{0→3, 1→3, 2→3}`** —
every published cell, on HEAD, unchanged.

**The whole-tier summary, which is new:**

| tier | dice | bands that widen | floor→ceiling transitions observed |
| --- | --- | --- | --- |
| 0 | 4 | **40 / 40** | `0→3`, `1→3`, `2→3` |
| 1 | 5 | **40 / 40** | `0→3`, `1→3`, `2→3` |
| 2 | 6 | 39 / 40 | `0→3`, `1→3`, `2→3`, **`3→3`** |
| 3 | 6 | 39 / 40 | `0→3`, `1→3`, `2→3`, **`3→3`** |
| 4 | 6 | **40 / 40** | `0→3`, `1→3`, `2→3` |
| 5 | 6 | — | **the ceiling does not exist** |

**EVERY BOUNDED TIER STOPS AT `k ≤ 3`, AND THAT IS ONE NUMBER RATHER THAN FORTY.** At the ceiling the
ratio is `ante / (2·band.max + ante)`, and `anteFor` makes `ante` a fixed **fraction** of that same
ceiling — so the ratio is `f / (2 + f)` with `f = DARE_ANTE_BAND_FRACTION`, **and the band cancels
out entirely**. That is why §19.10 found `k ≤ 3` at all 40 ceilings: the ceiling gate is a property
of the *fraction*, not of any port. It is asserted that way in the test (§21.5) — computed from `f`,
with no literal `3` in the mechanism.

**The step boundaries, in credits.** Three representative bands; the full 13 × 6 table is in
`.scratch/t222-bands.log`.

| band | tier | ante | smallest seed admitting `k = 0 / 1 / 2 / 3 / 4 / 5 / 6` |
| --- | --- | --- | --- |
| 25–1000 (28 ports, the default) | 0 | 30 | 1 / 14 / 99 / 911 / 19,426 / — / — |
| 25–1000 | 2 | 30 | 1 / 8 / 42 / 226 / 1,709 / 22,561 / 699,826 |
| 25–1000 | 4 | **90** | 1 / 23 / 126 / 678 / 5,127 / 67,682 / 2,099,476 |
| 25–1000 | **5** | **90** (frozen at the tier-4 reference) | 1 / 23 / 126 / 678 / **5,127** / **67,682** / 2,099,476 |
| 5–200 (the cheapest port) | **5** | **18** | 1 / 5 / 26 / 136 / **1,026** / **13,537** / 419,896 |
| 10–3000 | **5** | **270** | 1 / 68 / 378 / 2,033 / 15,379 / 203,045 / 6,298,426 |

**Tier 4 tightens the bar at a FIXED stake and leaves it unchanged at the ceiling** — both consequences
of the ante and the ceiling scaling by the same `LIARS_DICE_RAISED_CEILING_MULT`. **Tier 5 removes
the ceiling and freezes the ante**, so nothing caps the ratio; full dissolution (`k = u = 6`) arrives
at **419,896 – 6,298,426** credits depending on the port, and the intermediate steps `k = 4` and
`k = 5` arrive at **1,026 – 15,379** and **13,537 – 203,045**. Whether those are *reached* is §21.4c.

### 21.4 THE PLAY EFFECT — `n` on every cell

`.scratch/t222-stake.ts`, derived from `.scratch/t219-bakeoff.ts`: the same loop, the same
tie-break, the same candidate builder, the same **realised-showdown** scorer. **Exactly two things
change.** (1) The ante and the seed stake become per-cell parameters read from `anteFor` /
`effectiveWagerBand` instead of t219's hard-coded 30 / 100. (2) **Headroom is modelled faithfully**
instead of being pinned at 10,000 — `headroomFor` is `max(0, bandMax − pot)`, and near the ceiling
that number is smaller than the ante, so the raise is not merely rarer, **it is illegal**. t219's
fixed headroom hid that, and it is the single largest correction this probe makes.

**Identical seeds across every stake cell** (`SeededRng(20_260_806 + u)`): both sides draw `u` dice
per hand and nothing else consumes the stream, so every cell at a width plays the **same dice in the
same order** and the cells differ in exactly one place. **Every arm is scored on REALISED house
credits off the engine's own showdown rule, never on the policy's own EV** — F-175-1's
self-confirming premise (a).

**THE CONTROL IS THE SHIPPED RULE, PROVEN AND NOT ASSUMED.** `.scratch/t222-fidelity.ts`
cross-checks the rig's `optimal` against `archetypeMove({archetype:'optimal'})` over **1,200,000**
randomised states at **every shipped ante** (the 20 distinct values `anteFor` produces across 40
ports × 6 tiers, 6 … 270) and over pots, headroom and credits randomised across **0 … 9,000**, the
largest tier-4 ceiling in the game. **Zero mismatches**, move mix `challenge 909,707 /
raise-quantity 176,811 / raise-face 113,482` for non-vacuity. t219's harness pinned one ante and a
0–400 pot range, which would not have covered these cells.

**n = 40,000 hands per arm per cell; 260 cells in the main matrix; 10,400,000 hands.** No comparison
below is within 2 SE of its neighbour — the smallest separation reported is 0.150 of a stake against
SEs of ≤ 0.02 of a stake — so no widening was owed.

**THE RESULT, AND IT IS UNUSUALLY CLEAN: the stake-free quantities are a function of the GATE STEP
ALONE.** Every cell sharing a gate step reproduces the *same* player win rate, the *same* challenge
/ raise shares and the *same* `k` histogram to the published decimal, across 13 bands and four tiers.

| dice | gate | **n (hands)** | house net / seed | player win | challenge share | raise share | **`bad − optimal`** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | `k ≤ 0` | 120,000 | −0.055 … −0.041 | **51.77%** | 98.87% | 1.13% | **−21.15 pp** |
| 4 | `k ≤ 1` | 200,000 | +0.067 … +0.108 | 46.31% | 91.65% | 8.35% | **−15.69 pp** |
| 4 | `k ≤ 2` | 1,760,000 | **+0.445 … +0.477** | 28.02% | 72.75% | 27.25% | +2.61 pp |
| 4 | `k ≤ 3` (control) | 40,000 | **+0.632** | 18.55% | 58.90% | 41.10% | +12.07 pp |
| 4 | ceiling, **headroom 0** | 520,000 | **−0.045** | **52.27%** | 100.00% | **0.00%** | 0.00 pp |
| 6 | `k ≤ 0` | 160,000 | −0.612 … −0.387 | **65.28%** | 97.83% | 2.17% | **−13.32 pp** |
| 6 | `k ≤ 1` | 400,000 | −0.363 … −0.263 | 61.43% | 87.74% | 12.26% | **−9.47 pp** |
| 6 | `k ≤ 2` | 440,000 | −0.020 … +0.099 | 45.76% | 70.13% | 29.87% | +6.20 pp |
| 6 | `k ≤ 3` | 4,200,000 | **+0.373** | 31.35% | 52.65% | 47.35% | **+20.61 pp** |
| 6 | `k ≤ 4` (**tier 5 only**) | 1,040,000 | **+0.223** | 38.67% | 39.52% | 60.48% | +13.29 pp |
| 6 | ceiling, **headroom 0** | 520,000 | **−0.321** | **66.04%** | 100.00% | **0.00%** | 0.00 pp |

**A LOOSER GATE IS BETTER FOR THE HOUSE, MONOTONICALLY, RIGHT UP TO `k ≤ 3`** — `−0.04 → +0.11 →
+0.45 → +0.63` at four dice, `−0.39 → −0.29 → +0.09 → +0.37` at six. **The finding's implicit worry
is measured backwards.** A player who stakes more does move the house's evidence bar, and every step
they move it **costs them**: the player win rate falls 51.77% → 18.55% at four dice and 65.28% →
31.35% at six as the gate opens. There is no player-side exploit in the coupling to price.

**AND THE REASON IS NOT AN ACCIDENT — IT IS POT ODDS.** The threshold `c / (pot + c)` is *exactly*
the break-even probability of a raise costing `c` into a pot of `pot`: the raise wins `pot + c` with
probability `p` and loses `c` otherwise, so `p·(pot + c) > c` is the textbook condition. A bigger
pot offers the house better odds on the same raise, and `optimal` correctly takes them. §19.10 called
this "an accident of the ante/pot ratio rather than a design"; the measurement says the ante/pot
ratio is precisely what such a bar **should** be a function of, and that the shipped rule is
tracking it correctly.

**THE TWO CONTROLS THAT SEPARATE THE RATIO FROM THE STAKE, run because the derivation says only the
ratio matters and an assertion is not a measurement:**

- **CONTROL A — hold the stake at 1,000, vary the ante over the 20 shipped values.** Within a gate
  step the play is **identical**: antes 60 / 90 / 180 / 270 all give player win **28.02%**, the same
  `k` histogram and net/seed 0.448 / 0.452 / 0.465 / 0.477 (the drift is the ante's own contribution
  to the pot, not a behaviour change). Antes 6 / 12 / 30 all give **18.55%**. **The gate STEP is the
  whole mechanism; the ante is not.**
- **CONTROL B — hold the RATIO at `30/2030` and scale stake and ante together ×1, ×2, ×4, ×10.**
  Net/seed is **0.6316 at every rung**, to four decimals, with byte-identical histograms and win
  rates. **The play is a function of the ratio alone.** This is the cleanest statement in the task
  and it is what makes the bakeoff at §21.4a decidable.
- **CONTROL C — hold stake and ante, vary the headroom.** Nothing moves until the headroom drops
  below ~3 antes: `bandMax` 1,090 / 1,300 / 2,000 / 4,000 / 20,000 / ∞ are **all identical**. At one
  ante of room the house does *better* (+0.774), and at **zero** it collapses to −0.046. The second
  lever is a step function at the very top of the band, which is §21.4b.

**`bad` IS A CLEAN CONTROL AND THAT IS WHY IT IS IN EVERY CELL.** `bad` reads no pot at all
(`BAD_CREDULITY` is a count rule), so *any* stake-dependence in `bad − optimal` is `optimal`'s alone.
Measured: the ordering holds and widens as the gate opens (+2.61 → +12.07 at four dice, +6.20 →
+20.61 at six) and **inverts at the tight end** (−15.69 / −21.15 at four dice, −9.47 / −13.32 at
six). That inversion is F-222-3 (§21.7).

**THE DEEP TIER-5 LADDER — the only place the gate goes past `k ≤ 3`.** `bandMax === null`, so the
headroom clamp is absent and the gate is the only thing bounding the raise. n = 40,000 per cell:

| stake, as a multiple of the ante | opening gate | house net / seed | player win | **`bad − optimal`** |
| --- | --- | --- | --- | --- |
| 57× (5,130 cr at the default band; 1,026 at 5–200) | `k ≤ 4` | **+0.220** | 38.67% | +13.29 pp |
| 752× (67,680 / 13,536) | `k ≤ 4` opening, **`k = 5` reached mid-hand** | **−0.139** | 56.91% | **−4.95 pp** |
| 2,000× (180,000 / 36,000) | `k ≤ 5` | **−0.119** | 55.95% | **−3.98 pp** |
| 23,328× (2,099,520 / 419,904) | `k ≤ 6 = u`, **fully dissolved** | **−0.244** | 62.21% | **−10.25 pp** |

**A1 FAILS HERE AND NOWHERE ELSE.** Past `k ≤ 3` the direction reverses: `+0.373 → +0.223` is a
**0.150-of-a-stake** loss to the house for opening the bar one further step, and deeper still the
house goes **negative** and the archetype ordering **re-inverts**. The mechanism is LD-27's own:
the immediate-challenge premise is a *conservative* error at tight gates and an *expensive* one once
the pot/ante ratio is large enough to admit raises whose truth probability is under 1%. The 752×
row is also the empirical proof of §21.0 correction 1 — its **opening** gate is `k ≤ 4` and it emits
`k = 5` raises on **16.79%** of its raises, because the pots grew.

### 21.4a THE BAKEOFF — the one named alternative, on identical seeds

Accept requires that if a constant moves it is **bakeoff'd rather than tuned**. The alternative was
run *anyway*, because a ruling that declines a change should be able to say what the change would
have done. Of the three levers Accept names — `DARE_ANTE_BAND_FRACTION`, **the ante's reference**,
the bands — Controls A and B say the first and third **cannot** dissolve the coupling: the play
depends only on the ratio, so changing the fraction or the band moves *where* the step boundaries
fall and nothing else. **Only the ante's reference can dissolve it**, and it dissolves it exactly:

> **ALT · reference the ante to the PLAYER'S OWN STAKE.** `ante = max(1, round(seedWager × f))`
> with the same `f = DARE_ANTE_BAND_FRACTION`, the same rounding, the same floor at 1 — only the
> reference moves. Then `ante / (2s + ante) = f / (2 + f)`, **constant in the stake**, and F-219-1's
> coupling is gone by construction rather than by measurement.

Same 260 cells, same seeds, same realised scorer, n = 40,000 per cell.

| | shipped | **ALT** |
| --- | --- | --- |
| gate at 6 dice, every band, every stake below the ceiling | `k ≤ 0 … 4` depending on the stake | **`k ≤ 3` everywhere** |
| player win rate, 6 dice, floor → ceiling of the default band | 65.28% → 31.35% | **31.35% flat** |
| player win rate, 4 dice, floor → 75% of the default band | 46.31% → 28.02% | **18.55% flat** |
| house net / seed, 6 dice | −0.61 … +0.37 | **+0.373 flat** |
| `bad − optimal` | −21.15 … +20.61 pp | **+12.07 (4 dice) / +20.61 (6 dice)**, never negative below the ceiling |
| the ceiling dead zone (§21.4b) | present | **UNCHANGED — at the ceiling `s = band.max` so the two rules agree exactly** |

**ALT WINS ON THE COUPLING AND IS DECLINED ON A STANDING INVARIANT, WHICH IS A DIFFERENT THING FROM
LOSING.** It does what it claims: the coupling vanishes, the ordering never inverts, and the gate
sits at the best-performing step everywhere. It is declined for three reasons, in order of weight:

1. **It moves the table monotonically AGAINST the player at every measured cell** — there is no cell
   in the matrix where ALT lowers the house's net/seed — and LD-28 promoted **"pooled player EV per
   hand must remain POSITIVE"** to a **standing invariant** one task ago, measured at **+190.1 cr**.
   Whether that survives a rule that strengthens the house at every stake **cannot be known without
   a full 8,000-row capstone**, which is precisely the shape a measurement task may not take on
   speculation. Shipping ALT here would be adopting a rule that puts a one-task-old invariant at
   risk without scoring it.
2. **It fixes nothing that was measured to be broken.** A1 holds for the shipped rule at every
   bounded tier; the two things that *are* broken (§21.4b's dead zone, §21.4's tier-5 reversal) are
   **untouched by ALT** — the dead zone because at `s = band.max` the two rules produce the identical
   ante, and tier 5 because ALT's constant gate is `k ≤ 3`, which is where the shipped rule already
   is until the stake runs away.
3. **It is a rules change to `packages/engine/src` and would owe this task its own capstone.** With
   (1) unresolved, that capstone would be run to decide whether the change is admissible at all —
   i.e. the sweep would be doing the arbitration a bakeoff is supposed to do first.

**Recorded rather than buried: ALT is the shape a future task should start from if F-222-2 (tier 5)
is ever ruled a defect**, because a stake-referenced ante is the only named rule that caps the ratio
without capping the stake.

### 21.4b F-222-1 · THE DEAD ZONE — the top `DARE_ANTE_BAND_FRACTION` of every bounded band

The largest thing this task found, and F-219-1 does not mention it. `headroomFor` is
`max(0, bandMax − pot)` and **the seed counts against it** (§4.3: `band.max` is a whole-hand exposure
ceiling, not a seed ceiling). So a seed within one ante of the ceiling leaves **both** sides unable
to cover a raise, `legalMovesFrom` offers only `challenge` and `fold`, and the hand is **one claim
long by construction**. The zone's width is exactly one ante — i.e. exactly
`DARE_ANTE_BAND_FRACTION` of the ceiling, because that is what the ante *is*.

**THE LOOSEST GATE IN EVERY BAND IS THEREFORE UNREACHABLE.** §19.10's `k ≤ 3` at the ceiling is a bar
that never fires: at the stake that produces it, no raise is legal at all.

**And the price runs the other way.** Measured, n = 40,000 per cell:

| dice | stake | house net / seed | player win rate | `probAtLeast(1, u)` |
| --- | --- | --- | --- | --- |
| 4 | 75% of the band | **+0.445** | 28.02% | — |
| 4 | **the exact ceiling** | **−0.045** | **52.27%** | **51.77%** |
| 6 | 75% of the band | **+0.373** | 31.35% | — |
| 6 | **the exact ceiling** | **−0.321** | **66.04%** | **66.51%** |

**Staking the exact ceiling converts Liar's Dice into a single-claim coin flip at the player's own
ply-1 odds, at the largest stake the port allows.** At the default band at tier 4 that is **+962
credits per hand to the player** against **−842** at 75% of the same band: a **1,804 cr/hand swing
from a 25%-of-band change in stake**, and the sign of the player's EV flips with it. The measured
win rate at the ceiling matching `probAtLeast(1, u)` to within 0.5 pp is the proof of the mechanism
— it is LD-28's ply-1 opening burden with nothing else left in the hand, which is also a mechanical
corroboration of §20.2's derivation from an angle §20 could not see.

**This is F-134-1's band clamp, priced for the first time.** §16.5 measured the clamp firing on the
house at **53.12%** and the gambler's median stake-to-band ratio at **100.00%**, and said explicitly
that re-measuring it was owed to whichever task closed F-137-1; §17.7 re-measured it at T-160 and
found it not firing *at that arm's bankrolls and tiers*. Neither ever priced what the player gains
by sitting in the zone. **Filed as F-222-1 / `TASKS.md` T-224, not fixed here**: the lever is
`headroomFor` / §4.3's whole-hand exposure ruling, not the ante — §21.4a shows ALT leaves it exactly
as it is — and re-opening §4.3 inside a measurement task is §16.2's banned third shape.

### 21.4c REACHABILITY — where the shipped game actually sits

Off the **shipped instrument's own seated quantities** (§21.0 item 5 says why the wrapper probe is
discarded). n = **279,857** hands over 1,600 gambler careers × 120 days:

| quantity | value |
| --- | --- |
| mean **seated** stake | **2,631.6 cr** |
| per-career mean seated stake, p10 / p50 / p90 | **1,537 / 2,477 / 3,876** |
| max seated stake in 1,600 careers | **32,510** |
| hands seated **above the port's authored ceiling** | **179,463 / 279,857 = 64.13%** |
| hands seated **above the ×3 raised ceiling** (tier 5 only) | **90,444 / 279,857 = 32.32%** |
| bids per hand | **1.504** (roaming 1.289, roster 1.780) |

**A3 IS ANSWERED DECISIVELY AND IN THE UNCOMFORTABLE DIRECTION.** The floor end of the coupling —
where the gate is `k ≤ 0` or `k ≤ 1`, where the house loses money and where the archetype ordering
inverts — is **essentially unexercised**: not one career in 1,600 has a mean stake near any band's
floor (p10 = 1,537 against a default floor of 25). The measured game lives **at and beyond the
ceiling end**, which is exactly where §21.4b's dead zone is.

**T-224 MEASUREMENT (2026-08-07, 48 gambler careers × 120 days, HEAD): the exact dead-zone share is
7.37%** — **623 / 8,452** settled hands. This is now a shipped instrument cut, not a bound:
`HangoutPlayStats.dareCells` carries `deadZoneHands`, `deadZonePlayerWon`, `deadZoneNetCredits` and
`deadZoneBids` in every existing pool × archetype × tier cell. The old `≤ 49.6%` bound was
directionally useful but loose by 42.23 pp. The measured subset has exactly **1.0 bids/hand**, as the
mechanism predicts; player win rate is **66.29%** and player EV is **+351.4 cr/hand** versus the
same arm's overall **52.89%** and **+174.0 cr/hand**.

| cut | hands | dead-zone hands | share | dead-zone win | dead-zone EV/hand |
| --- | ---: | ---: | ---: | ---: | ---: |
| all shipped gambler hands | 8,452 | 623 | **7.37%** | **66.29%** | **+351.4 cr** |
| t0 | 240 | 15 | 6.25% | 53.33% | +26.6 cr |
| t1 | 240 | 10 | 4.17% | 60.00% | +50.0 cr |
| t2 | 480 | 42 | 8.75% | 69.05% | +76.0 cr |
| t3 | 960 | 105 | 10.94% | 65.71% | +49.6 cr |
| t4 | 1,920 | 451 | **23.49%** | **66.74%** | **+464.8 cr** |
| t5 | 4,612 | 0 | 0.00% | — | — |

Populated cells, with all zero cells omitted: `roaming|none|t0` 15/34, `roaming|none|t1` 10/12,
`roaming|none|t2` 42/106, `roaming|none|t3` 100/299, `roaming|none|t4` 363/1,021,
`roster|bad|t3` 1/1, `roster|bad|t4` 10/25, `roster|optimal|t3` 4/29,
`roster|optimal|t4` 70/415 and `roster|random|t4` 8/20. The concentration is therefore exactly
where the earlier reachability table pointed: bounded high-tier play, especially tier 4. This task
does **not** rule whether that is acceptable; it supplies the owner-facing number for T-224's
intended-vs-defect call.

**A4 HOLDS, and it holds by measurement rather than by argument.** Full dissolution (`k = u`) needs
**≥ 419,896** credits at the cheapest port and **≥ 2,099,476** at the default band; the largest
stake seated in 1,600 careers is **32,510**. **`k = 4` is reached** (from 1,026 at the 5–200 port,
5,127 at the default band) and **`k = 5` is reachable at the cheap ports** (13,537 against a
measured max of 32,510). So the gate does not dissolve in the shipped game — but it goes **two steps
past** the `k ≤ 3` every bounded tier stops at, which is F-222-2.

### 21.5 THE RULING, AND WHAT WAS NOT EDITED

**Binding text: LD-29** in `docs/LIARS-DICE-DECISIONS.md`. In summary:

1. **THE COUPLING IS RULED ACCEPTABLE AT EVERY BOUNDED TIER (0–4), with a derivation rather than a
   preference.** `c / (pot + c)` is **pot odds** — the exact break-even probability of the raise
   being priced — and the measurement shows the house's stake-normalised return is **monotone
   non-decreasing** in the gate step throughout (A1 **PASS** at tiers 0–4). At the ceiling the ratio
   is `f / (2 + f)` with the band cancelling out, so the bounded gate is **one number for all forty
   ports** and cannot be moved by authoring a band. **A player who stakes more moves the bar and
   loses by it.**
2. **A2 PASSES where it was pre-committed** — on the shipped instrument, `bad − optimal` = **+15.79
   pp, SE 0.44, z 35.93** (§21.6's reproduction arm), no re-inversion. It **fails on the probe at
   band floors**, which is reported in full and **filed as F-222-3** rather than dropped.
3. **A4 PASSES** — no reachable triple dissolves the gate; the nearest is 13× the largest stake ever
   seated.
4. **A1 FAILS AT TIER 5 ONLY, and that is FILED, not folded in.** Past `k ≤ 3` the direction
   reverses (+0.373 → +0.223 → −0.139), and tier 5 is the only place the stake can get there because
   `effectiveWagerBand` returns `{min: 0, max: null}` while `anteFor` freezes the ante. **The lever
   is T-146 §4.8's removed ceiling, not the ante** — §21.4a's ALT arm proves the ante's reference
   cannot be tuned to reach it without changing every other tier as well. **F-222-2 / T-225.**
5. **The one named alternative was BAKED OFF, not waved off** (§21.4a), and is **declined on LD-28's
   standing invariant** with the reason written down, not on taste.

**NO RULE MOVED, and the "if any rule moves" branch is discharged per lever in writing:**

| lever | why it did not move |
| --- | --- |
| `DARE_ANTE_BAND_FRACTION` (`packages/content/src/hangout.ts`) | **Cannot dissolve the coupling.** Control A: within a gate step the ante is irrelevant; Control B: the play is a function of the ratio alone. Changing `f` moves *where* the step boundaries fall, and nothing else. It would also turn `liarsDice.test.ts`'s fourteen-port ante assertion red — that is the signal working. |
| **the ante's reference** (`anteFor`) | **Bakeoff'd and declined** — §21.4a. It dissolves the coupling and moves the table against the player at **every** measured cell, putting LD-28's one-task-old EV invariant at risk with no capstone to score it. |
| the wager bands (`portHangouts.ts`) | Same as `f`: Control B says the band cannot change the play except through the ratio, and the ceiling gate is band-independent by construction. |
| `optimal`'s raise valuation | **Closed and declined — LD-27 / §19.** Four replacements from named sources, all lose, three re-invert the ordering. |
| `headroomFor` / §4.3's exposure ceiling | The lever behind **F-222-1**, filed as T-224. Re-opening §4.3 inside a measurement task is §16.2's banned third shape. |
| `SIM_DARE_CHALLENGE_MARGIN` / `planDareMove` | T-176's Delivered note already ruled that touching either to move an engine measurement is tuning the instrument to hit a threshold. |

**FINGERPRINTS AND SCOPE.** Touched: `docs/**`, `packages/engine/src/__tests__/**`, `.scratch/**`,
`TASKS.md`. `__tests__` is in `HASHED_ROOT_IGNORED_DIRECTORIES` and is not in
`SIM_INSTRUMENT_DIRECTORIES` (`['', 'balance']`), so a test-only edit moves nothing. **Nothing under
`packages/engine/src` or `packages/content/src` moves semantically** — no non-test source is edited
at all. Measured before and after the change set with `.scratch/t219-fp.mjs` (unchanged):
**`rulesFingerprint cabd2112ccf4cefb`**, **`instrumentFingerprint 2d6d1990eaf13031`**,
**`docsFingerprint 265aea1d09f0d485`** — **all three unmoved**, identical to §20.5's. *(As §20.5
records and this task re-states because the name invites the opposite guess: `computeDocsFingerprint`
hashes the raw bytes of the same rule and instrument **sources**, comments included — **not**
`docs/**`. Markdown does not enter it.)* **No capstone, no re-extract and no baseline re-pin is
owed.** **`CURRENT_SAVE_VERSION` is UNMOVED at 17**, re-read live at
`packages/engine/src/save.ts:627` — nothing persisted moved, so no migration and no round-trip test
is owed either.

**WHAT ENFORCES THIS RULING.** `packages/engine/src/__tests__/liarsDiceArchetypes.test.ts`, describe
**`T-222 · F-219-1 — the stake/ante coupling, ruled`** — five assertions, every one computed from
`probAtLeast`, `anteFor`, `effectiveWagerBand`, `legalMovesFrom` and content's own
`DARE_ANTE_BAND_FRACTION`, **with no literal threshold in any mechanism**, so a later retune goes
RED and re-opens LD-29 rather than silently voiding it: the gate is monotone non-decreasing in the
seed at all 40 ports × 6 tiers (3,120 cells); the closed-form step boundary agrees with the gate
exactly at every `(port, tier, k)`; the seeded pots are the tightest bar in the hand (§21.0 item 1);
a bounded band caps the gate at the one value `f / (2 + f)` predicts and tier 5 removes that cap;
and the dead zone at the top of every bounded band is exactly one ante wide. **T-219's own describe
is left with every expectation intact** — only its closing comment is redirected from "T-222 must be
re-read" to LD-29 / §21.

### 21.6 THE PREDICTIONS, SCORED — including the wrong one

| # | Prediction | Outcome |
| --- | --- | --- |
| 1 | The three-regime shape at every band, every tier 0–4 | ✅ **PASS** — 260 cells; net/seed rises with the gate step and collapses at the exact ceiling at all 13 bands × 4 tiers |
| 2 | Zero raises at the exact ceiling at every band; player win = `probAtLeast(1, u)` ± 1 pp | ✅ **PASS** — raise share **0.00%** in all 13 ceiling cells at every bounded tier; **52.27% vs 51.77%** (4 dice) and **66.04% vs 66.51%** (6 dice), both inside 0.5 pp |
| 3 | **A1 holds** at every band and tier | ❌ **WRONG, and it is the useful one.** A1 holds at every **bounded** tier and **fails at tier 5**: `k ≤ 3 → k ≤ 4` costs the house **0.150 of a stake** (+0.3731 → +0.2229), and deeper the house goes negative. The prediction was the one most convenient to a clean "rule it acceptable" outcome; it failed, and the ruling is scoped to bounded tiers and **files F-222-2** in consequence rather than being restated to match |
| 4 | A2 fails on the probe at band floors, holds on the shipped instrument | ✅ **PASS** — `bad − optimal` **−15.69 / −21.15 pp** at four dice and **−9.47 / −13.32 pp** at six, against **+15.79 pp (z 35.93)** on the instrument. Filed as **F-222-3** |
| 5 | Tier 5 admits `k = 4` inside the measured max seated wager for ≥ half the bands; `k = u` at none | ✅ **PASS** — `k = 4` from **1,026 … 15,379** against a measured max of **32,510** (12 of 13 bands inside it); `k = u` needs **≥ 419,896**, reached by none |
| 6 | The tier-5 cells beyond the tier-4 ceiling do not collapse the way bounded ceilings do | ✅ **PASS** — every tier-5 cell keeps `headroom-raises = ∞` and a live raise share (47.35% → 60.48%); the collapse is a bounded-band phenomenon only |

**Prediction 3 is the one that mattered.** Had it been quietly re-scoped to "at every bounded tier"
after the fact, this task would have ruled the coupling acceptable *everywhere* and buried the one
regime where it demonstrably misprices. It is recorded as wrong, and the finding it produced is the
task's second output.

### 21.7 Findings filed by T-222

**F-222-1 · THE TOP `DARE_ANTE_BAND_FRACTION` OF EVERY BOUNDED BAND IS A DEAD ZONE, AND SITTING IN
IT IS THE BEST PLAY IN THE GAME.** Filed as `TASKS.md` **T-224**. §21.4b: `headroomFor` counts the
seed against `band.max`, so a seed within one ante of the ceiling leaves both sides unable to cover a
raise; the Dare collapses to a single opening claim resolved at `probAtLeast(1, u)`, which is **in
the player's favour at every width**. Measured: house net/seed **−0.045** (4 dice) and **−0.321**
(6 dice) against **+0.445 / +0.373** at 75% of the same band — **+962 cr/hand to the player at the
default band at tier 4, against −842 one quarter-band lower.** §16.5 already measured the shipped
gambler's median stake-to-band ratio at **100.00%**, so this is not hypothetical play. The lever is
§4.3's whole-hand exposure ruling, not the ante, and §21.4a proves the ante's reference cannot reach
it. **The exact share of hands seated in the zone needs the `dareCells` stake cut this task refuses
to add (§21.0 item 4); §21.4c bounds it at ≤ 49.6% from `bids/hand`.**

**F-222-2 · AT TIER 5 NOTHING CAPS THE POT/ANTE RATIO, AND PAST `k ≤ 3` THE GATE MISPRICES.** Filed
as `TASKS.md` **T-225**. §21.4's deep ladder: the house's stake-normalised return **reverses**
(+0.373 at `k ≤ 3` → **+0.223** at `k ≤ 4` → **−0.139** deeper), and the archetype ordering
**re-inverts** (`bad − optimal` **−4.95 pp**). `k = 4` is admitted from **1,026 cr** at the 5–200
port and **5,127** at the default band, both inside the **32,510** maximum stake measured over 1,600
careers, so this is reachable rather than theoretical. Every bounded tier stops at `k ≤ 3` because
`ante = f × ceiling` makes the ceiling ratio `f / (2 + f)`; tier 5 removes the ceiling
(`effectiveWagerBand → {min: 0, max: null}`, T-146 §4.8) and freezes the ante at the tier-4
reference, so the ratio → 0 as the stake grows. **This is a §4.8 ruling, not an ante ruling**, and
§21.4a records the shape a fix should start from (a stake-referenced ante caps the ratio without
capping the stake).

**F-222-3 · THE ARCHETYPE ORDERING IS STAKE-CONDITIONAL, AND NOTHING TESTS IT OFF THE STAKES THE
SWEEP HAPPENS TO PLAY.** Filed as `TASKS.md` **T-226**. LD-25 publishes `bad − optimal > 0` as a
property of the archetypes and every task since has scored it on one arm. Measured across the stake
axis it is a property of the archetypes **at a stake**: **−21.15 / −15.69 pp** at four dice and
**−13.32 / −9.47 pp** at six at band floors, **+2.61 … +20.61 pp** in the middle, **0.00** in the
dead zone, and **−4.95 pp** again deep at tier 5. `bad` reads no pot at all, so the whole
stake-dependence is `optimal`'s. The floor end is currently unexercised (§21.4c), which is why the
sweep has never seen it — but "unexercised by today's gambler policy" is not the same as
"unreachable by a player", and the bar has never been stated with the stake range it holds over.

### 21.8 The scorecard

| Accept clause | verdict |
| --- | --- |
| the coupling re-measured on HEAD across **every shipped band**, `n` on every cell | **PASS** — all 13 authored bands (40 system ids, default row included) × **six** tiers in §21.3; 260 play cells at n = 40,000 each in §21.4, **10,400,000 hands**, plus a 1,200,000-state fidelity proof and a four-rung deep ladder. Correction: "every band" is read as **bands × tiers** (§21.0 item 3) |
| its **effect on play** quantified, not just its effect on the gate | **PASS** — §21.4: stake-normalised house net, player win rate, challenge/raise/fold shares and the `k` histogram per gate step, with three controls separating the ratio from the stake and from the headroom. **The house plays measurably worse at BOTH ends**: −0.045 / −0.321 at the ceiling (dead zone) and −0.04 … −0.61 at the floor |
| owner **rules it acceptable with the derivation** — or changes a constant | **RULED ACCEPTABLE at bounded tiers, LD-29**, on the **pot-odds** derivation; **A1's tier-5 failure is filed, not folded in** (F-222-2). No constant moved |
| if changed, **bakeoff'd against ≥ 1 alternative on identical seeds rather than tuned** | **DISCHARGED ANYWAY** — §21.4a runs the one named alternative (ante referenced to the stake) over the same 260 cells on identical seeds with the realised scorer, and declines it **on LD-28's standing invariant**, in writing |
| LD-27's `k`-gate derivation **re-run against the new numbers rather than re-sampled** | **DONE** — §21.3 re-derives the step boundary in closed form (`s > c(1−p)/(2p)`), corrects its own `k = 0` edge, and the test asserts the closed form against the brute-force gate at every `(port, tier, k)` |
| the archetype ordering **re-scored and must not re-invert** | **PASS on the shipped instrument** — `bad − optimal` **+15.79 pp, SE 0.44, z 35.93**, reproducing §18.4 / §19.9 / §20.3 exactly. Off-instrument inversions reported in full and **filed as F-222-3** |
| `liarsDiceArchetypes.test.ts`'s `T-219 · F-176-1` describe **updated honestly rather than relaxed to pass** | **DONE** — **every expectation is untouched**, including `widened === 40` and `['0->3','1->3','2->3']`; only the closing comment is redirected to LD-29 / §21. A new describe carries the new claims |
| `docs/LIARS-DICE-PROGRESSION_SPEC.md` §3.3c and §19.10 **gain the outcome** | **DONE** — §19.10 keeps its text verbatim and gains a dated `RULED AT T-222` blockquote; §3.3c likewise, plus **§3.3d** for the tier dimension, following §3.3a/b/c's own amend-in-place form |
| if `packages/engine/src` or `packages/content/src` moves semantically, **own capstone with the moved rows predicted first** | **NOT OWED, and measured rather than asserted** — no non-test source is edited; `rules cabd2112ccf4cefb` / `instrument 2d6d1990eaf13031` / `docs 265aea1d09f0d485` all read unmoved before and after |
| gate green | `npm run format`, `npm test`, `npx tsc -b`, `npm run lint`, `npm run format:check` all exit 0; zero failing tests; the `it.fails` tripwires stay red-as-designed |

**F-219-1 CLOSES: MEASURED, BAKED OFF AND RULED — WITH ITS READING INVERTED AND TWO LARGER THINGS
FOUND UNDERNEATH IT.** The finding was right that the player moves the house's evidence bar, right
that nothing named or tested it, and wrong that this is an accident: `c / (pot + c)` is pot odds, and
every step the player opens it costs them between 6 and 33 points of win rate. What the measurement
found instead is that the *loosest* bar in every bounded band sits inside a **one-ante dead zone
where no raise is legal at all** — making the best play in the game "stake the exact ceiling and flip
a coin at `probAtLeast(1, u)`" — and that **tier 5 has no such bar**, so the gate walks two steps past
where every other tier stops and starts losing the house money. Neither was folded into the ruling
to keep the task closed.

## §22 · T-223 — F-220-1 closed: the roster seat's price, named, decomposed and ruled (2026-08-06)

**The task in one line.** T-220 §20.7 filed that the **roster pool is EV-negative at −200.8 cr/hand
(n = 122,820)** while the roaming pool runs **+495.8** (n = 157,037), that this is "the price of
disposition with a named captain one level up", and that **nothing names, derives, bounds or tests
it**. T-223 re-measures the pool, decomposes it against the roster archetype mix, prices the same
table on the instrument that actually **buys** what the roster sells, and rules. **No rule moved. No
band, threshold, fingerprint or golden was edited in either direction.** The ruling is **LD-30** in
`docs/LIARS-DICE-DECISIONS.md`. One residual — the **disclosure** question — is **filed rather than
absorbed**: F-223-1 / `TASKS.md` **T-227**.

**The headline, stated before the evidence so a reader can check it against the tables:** the
finding's **numbers are exact** and its **premise is false**. A roster seat pays **no disposition at
all** — that is a shipped hard null with its own test (§22.0 correction 1) — so the credit sink
cannot be the price of a disposition channel. What −200.8 actually measures is the **seat election**:
`planDare` takes the **richest** candidate, content authors the purse **monotone in difficulty**, and
those two facts meet on `optimal` for **77.82%** of the gambler's roster hands. Re-weighted to
**content's own authored seat census**, holding every cell's measured EV fixed, the same pool reads
**+172.8 cr/hand**. And measured directly on the **deed-hunter roster tour** — the shipped instrument
that plays every seat and closes the set — the roster pays the player **+21.5 cr/hand over
n = 11,021**, closes the grand slam in **141 of 152 careers**, and leaves the median career
**+1,885 cr richer** than it started against the gauntlet. **The roster table is not a sink; the
bankroll-chasing seat election is.**

### 22.0 Corrections to the task's own framing, made before anything ran

Following §18.0 / §19.0 / §20.0 / §21.0. Five things the finding or the plan asserts that the repo
does not support, each verified at HEAD before it was recorded. **Three of them change what the
ruling can say.**

1. **THE ROSTER PAYS ZERO DISPOSITION, so the finding's premise is FALSE.**
   `packages/engine/src/actions/dare.ts:168-181`:

   ```ts
   const roster = hand.opponentKind === 'roster';
   const dispositionDelta = roster ? 0 : /* … */;
   if (!roster) applyDisposition(state, hand.dealerId, dispositionDelta, 'dare', events);
   ```

   with the site's own comment *"T-145 · THE ROSTER APPLIES NO DISPOSITION (§7.6) … pool A is
   outside the NPC economy entirely (§1 rule 1)"*, and a shipped test that asserts it through the
   real resolver at every terminal arm (`packages/engine/src/__tests__/liarsDice.test.ts`,
   `T-145 · roster hands apply NO disposition (§7.6)`). The finding says *"a player who wants
   disposition with a specific named captain must sit at a roster table"* and *"the disposition
   channel §10.4's interceptor draw depends on is gated behind an unadvertised credit sink."*
   **Both are wrong against the shipped rules.** The disposition channel is fed by the **roaming**
   pool — the pool measured at **+495.8 cr/hand**. It is not gated behind the sink; it is on the
   **other side of the partition**. LD-28's closing paragraph inherits the same error (*"so this may
   be that same purchase one level up"*); LD-30 carries a **dated note** under LD-28 correcting it,
   **without editing any of LD-28's numbers or its ruling text**.

2. **"roster (the named captains)" MISLABELS THE POOL, and the mislabel is what makes the finding
   sound like a disposition question.** The roster is LD-11's **authored 42-row house table**
   (`packages/content/src/liarsDice.ts`, the `ld-` id namespace) — not `NpcState`s, no
   `currentSystemId`, no roam, no death, no disposition, no relationship. The **named captains** are
   the **roaming** pool (LD-12, the 30-profile cast reached through `actions/hangout.ts:241-260`).
   What a roster seat actually sells is **`player.liarsDiceBeaten` set closure** (LD-13), the
   fourteen port deeds and the grand slam (LD-14), and the authored `lines` — a **progression**
   purchase, not a disposition one. The derivation Accept asks for is therefore denominated in
   **closure**, and §22.4a prices it there.

3. **THE 77.82% `optimal` WEIGHT IS SET BY THE INSTRUMENT'S SEAT ELECTION, not by the game — and the
   mechanism is one step subtler than the plan states.** Two facts meet:

   - content authors bankroll **monotone in difficulty** (`liarsDice.ts:20-27`: seat 1 `bad`/`random`
     `3 × wager.max`, seat 2 `mixed` `5 ×`, seat 3 `optimal` `8 ×`, with the header's own words
     *"difficulty rises monotonically with the purse"*), and
   - `planDare` (`packages/sim/src/index.ts:4744-4790`) elects **the richest candidate across both
     pools, first-wins on a tie**.

   So a bankroll-chasing policy sits at **seat 3** wherever the roster out-banks the field. **The
   plan's "seat 3 by construction" is three-quarters right and §22.4 measures the rest:** seat 3 is
   **64.28% → 52.87%** of roster hands across the four 30-day windows, never below half; the
   remainder of the 77.82% `optimal` weight comes from **seat 2's `mixed` rows resolving to
   `optimal`** at open (the census puts 6.6 of 14 mixed rows' weight on `optimal`). Both channels run
   through the same picker. §12.9 F-148-2 already ruled that picker **"RULED, not overlooked"** and
   forbids re-teaching it (*"changing it re-bases every baseline in the same commit that measures
   it"*). **−200.8 cr/hand is therefore a property of this arm's seat election, not a price the game
   charges a player**, and §22 says so before it publishes the figure again.

4. **Phase 0 is shards-only, and that is deliberate** — no `--merge`, no `--aggregate`, no capstone.
   §20.0 correction 3, restated rather than left for a reviewer to read as a skipped step: the
   standing "1-indexed shards then `--merge`, verify 8,000 rows, `--milestone-days` **and**
   `--aggregate`" constraint governs the **capstone** sweep, owed when `rulesFingerprint` moves. It
   does not move here (§22.5's fingerprint block). And §20.0 correction 4, likewise restated:
   **`combat-win-share` FAILs on all four shards and is the known gambler-only-arm artefact**
   (§19.9) — a `--policies gambler` arm plays almost no combat, so the share is measured on a
   near-empty numerator. **`invariants: 0 violations` on all four shards.**

5. **THE PURSE IS NOT RENDERED, so the plan's UI premise is wrong in the player's favour and in the
   ruling's.** The plan states that *"the only pre-tier-3 discriminator between the three seats is
   the purse"*. `HangoutRosterOpponent` does carry `purse` (`packages/ui/src/format.ts:524-550`) —
   but **no pane reads it**: the roster section (`packages/ui/src/App.tsx:2470-2510`) renders the
   name, `· beaten`, `· cleaned out` and, at tier ≥ 3, the read. `grep -n purse
   packages/ui/src/App.tsx` returns one **comment** and nothing else. So the pre-tier-3 player has
   **no cue at all** — not an inverted one — and §22.6's UI answer is restated accordingly.

### 22.1 Predictions, recorded BEFORE the first row was scored

Written to `.scratch/t223-predictions.md` and committed to before the sweep was invoked and before
`.scratch/t223-roster.mjs` existed (§20.6's prediction 4 is the standard this series holds itself
to). Scored at §22.7, **wrong ones kept**.

| # | Prediction | Outcome |
| --- | --- | --- |
| 1 | The arm **reproduces §20.3 to every published decimal** with both fingerprints unmoved | *(scored at §22.7)* |
| 2 | Both pools clear `n ≥ 10,000` **and all three concrete roster archetype cells clear it too** | *(scored at §22.7)* |
| 3 | Re-weighted to a **FLAT** archetype mix — and to the **authored census** — the roster pool turns **EV-POSITIVE**, i.e. the sink is `optimal` × its *weight*, not the pool | *(scored at §22.7)* |
| 4 | The sweep's gambler closes **zero port sets and zero grand slams**: it pays the price and **buys nothing** | *(scored at §22.7)* |
| 5 | The **zero-sum price meter** reconstructs the roster marginal of `dareCells.netCredits` **exactly**, and Σ bankroll recomputed from content equals the header's **280,800 cr** | *(scored at §22.7)* |
| 6 | The **deed-hunter roster tour** pays a materially smaller total price than the gambler; its **per-hand EV is NEGATIVE** but its cost-to-closure is **under 5% of the median career purse** | *(scored at §22.7)* |

### 22.2 Arbitration criteria, pre-committed BEFORE any run

Named in writing before the numbers landed, in the same file.

- **A1** — if the sink is (mix × `optimal`) and **disappears under a flat or authored-census mix**,
  the **rule** is not broken, and the live question is whether the shipped **content census** and the
  **instrument's** seat election are what the owner intends.
- **A2** — the price is a **defect** if a player who *wants what the roster sells* (set closure)
  **cannot afford it**: if the deed-hunter tour's cost-to-closure is a material fraction of a
  career's purse, or if it can **strand** (§7.5's no-lockout theorem must survive).
- **A3** — the price is a **defect** if LD-28's pooled `EV > 0` invariant has **no headroom** against
  mix drift.
- **A4** — the **disclosure** question is answered **independently of A1–A3**: an unpriced purchase
  is a trap regardless of the sign (LD-26 / T-221's precedent: *"a purchase whose price the buyer
  cannot see is not a design, it is a trap"*).

### 22.3 THE MEASUREMENT — per pool, `n` on every cell

**Phase 0, stamps first.** `npx tsc -b && node .scratch/t219-fp.mjs`, **before anything ran**:
`rules cabd2112ccf4cefb`, `instrument 2d6d1990eaf13031`, `docs 265aea1d09f0d485` — all three
identical to §20.5's and §21.5's. **`CURRENT_SAVE_VERSION` re-read LIVE from
`packages/engine/src/save.ts:627` and reads 17** — re-read, not copied from any doc.

**The arm**, identical in shape to §20.3 so the comparison is like-for-like:

```
npm run balance:sweep -- --label t223-roster --seeds 1600 --days 120 --policies gambler \
  --milestone-days 21,29,30,41,60,120 --shard i/4          # i = 1..4, run in parallel
node .scratch/t223-roster.mjs t223-roster
```

`dareTierDisagreements 0`, `dareChallengeDisagreements 0` and `invariants: 0 violations` on all four
shards. **The join is asserted, not eyeballed:** `Σ dareCells.hands = 279,857 = Σ dares`;
`Σ playerWon = 148,052 = Σ daresWon`; `Σ netCredits = 53,208,282 = Σ netCredits`. All three exact.
**Reproduction of §20.3:** 1,600 rows, **279,857** dares, **52.90%**, **+190.1 cr/hand**, bids/hand
**1.504**, `finalCredits` median **64,622**, C6 `bad − optimal` **+15.79 pp, SE 0.44, z 35.93** —
every published decimal.

**THE HEADLINE — both pools clear `n ≥ 10,000` by more than an order of magnitude.** The EV column
now carries a **career-cluster bootstrap SE** (2,000 resamples over the 1,600 careers): `dareCells`
holds no sum of squares, so a within-cell SE is not computable from the rows, and careers — not
hands — are the level the dependence actually lives at.

| pool | **n (hands)** | player win rate | SE | **EV / hand** | bootstrap SE | 95% CI | bids/hand |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **roaming** (`archetype = none`, `dealerMove`) | **157,037** | **58.55%** | 0.12 | **+495.8** | 13.8 | [+468.8, +521.5] | 1.289 |
| **roster** (LD-11's authored house table, `archetypeMove`) | **122,820** | **45.69%** | 0.14 | **−200.8** | 10.8 | [−222.4, −179.4] | 1.780 |
| **AGGREGATE** | **279,857** | **52.90%** | 0.09 | **+190.1** | 10.2 | [+170.6, +208.6] | 1.504 |

**POOL × ARCHETYPE — every populated cell clears the `n ≥ 10,000` bar on its own count**, which is
the Accept clause's finer cut. Four of eight cells are **structurally empty** rather than
under-powered: `none` is a roaming-only slot and the three archetypes are roster-only.

| cell | **n** | win rate | SE | **EV / hand** | bootstrap SE | 95% CI | reading |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `roaming\|none` | **157,037** | 58.55% | 0.12 | **+495.8** | 13.8 | [+468.8, +521.5] | n bar PASS |
| `roster\|optimal` | **95,580** | 39.83% | 0.16 | **−482.3** | 11.5 | [−504.7, −459.9] | n bar PASS |
| `roster\|bad` | **14,680** | 55.63% | 0.41 | **+301.9** | 27.0 | [+250.6, +354.4] | n bar PASS |
| `roster\|random` | **12,560** | 78.61% | 0.37 | **+1,354.3** | 25.9 | [+1,303.7, +1,405.3] | n bar PASS |
| `roaming\|optimal`, `roaming\|bad`, `roaming\|random`, `roster\|none` | **0** | — | — | — | — | — | **STRUCTURALLY EMPTY** |

**POOL × TIER** reproduces §20.3 unchanged (six cells clear the bar; the six low-tier cells are
marked **UNDER-POWERED** and read as direction only, never published as rates):
`roaming` t0 2,550 / t1 3,007 / t2 6,569 / **t3 14,761** / **t4 35,700** / **t5 94,450**;
`roster` t0 5,450 / t1 4,990 / t2 9,421 / **t3 17,219** / **t4 28,193** / **t5 57,547**.
**C6 re-scored as Accept requires:** `roster|optimal` **39.83%** (n = 95,580), `roster|bad`
**55.63%** (n = 14,680), `roster|random` **78.61%** (n = 12,560), **`bad − optimal` = +15.79 pp,
SE 0.44, z 35.93 — the ordering holds and does NOT re-invert.**

### 22.4 THE ARCHETYPE DECOMPOSITION — is the sink `optimal`, or the POOL?

**A cross-pool Kitagawa over the ARCHETYPE axis is NOT DEFINED, and this task does not fake one.**
The axis is **structurally disjoint** across the pools (four of eight cells empty by construction,
§20.6 prediction 5), so there is no cell whose rate both pools contribute to and the
composition/rate split has no referent. The decidable form of the same question — and the one the
Accept clause actually asks — is the **re-weighting**, holding every cell's own EV fixed and
changing only the weights. The **authored seat census** is **computed from `LIARS_DICE_OPPONENTS`**,
with each `'mixed'` row distributed across the three concrete archetypes by its **own `mix`** (the
resolution the engine performs at open, §4.5 ruling 1) — never restated as a literal.

| weighting | source | `optimal` / `bad` / `random` | **EV / hand** | win rate |
| --- | --- | --- | --- | --- |
| **as measured** | the seat-picker's own mix | **77.82% / 11.95% / 10.23%** | **−200.8** | 45.69% |
| **the AUTHORED seat census** | LD-11, computed from content (`bad×7 / random×7 / mixed×14 / optimal×14` → 20.60 / 11.20 / 10.20 of 42 after distributing the mixes) | **49.05% / 26.67% / 24.29%** | **+172.8** | 53.46% |
| **FLAT across the three concrete archetypes** | — | 33.33% each | **+391.3** | 58.02% |

**THE ANSWER TO THE ACCEPT QUESTION IS THIS TABLE, and it is unambiguous: the sink is `optimal`
× ITS WEIGHT, not the pool.** Not one cell EV changed between the three rows; only the question
"which seat does the player sit at" differs, and the answer to that question is the **seat-picker's**,
not the game's. `roster|optimal` is **77.82%** of roster hands and **34.15%** of every hand played.

**THE FEEDBACK LOOP, DEMONSTRATED RATHER THAN ASSERTED** (`.scratch/t223-meter.mjs gambler`, the
same 1,600 careers × 120 days, driven through a **spy** that returns its policy's actions unchanged;
the identity in §22.4b is what proves the driven career is the same career). Roster hands by **seat**
and the seats' **purse trajectory**, both read off the live state:

| window | seat 1 (`3×`, soft) | seat 2 (`5×`, mix) | **seat 3 (`8×`, house)** | seat 3 share of roster hands | roaming hands |
| --- | --- | --- | --- | --- | --- |
| d1–30 | 2 | 14,256 | **25,659** | **64.28%** | 29,757 |
| d31–60 | 316 | 12,375 | **17,997** | **58.65%** | 40,249 |
| d61–90 | 1,543 | 10,339 | **15,671** | **56.88%** | 42,621 |
| d91–120 | 2,662 | 8,961 | **13,039** | **52.87%** | 44,410 |

| day | Σ seat-1 purses | Σ seat-2 purses | **Σ seat-3 purses** |
| --- | --- | --- | --- |
| 1 | 52,650 | 87,750 | **140,400** |
| 60 | 52,420 | 87,217 | **145,853** |
| 120 | **49,089** (−6.8%) | **84,523** (−3.7%) | **162,433 (+15.7%)** |

**That is the loop, measured:** the pool is zero-sum, so every credit the player loses to seat 3
**grows seat 3's purse and re-elects it tomorrow**, while the soft seats drain toward the `purse <= 0`
skip — **5.72 of 42 seats are broke at the horizon**, and by the §7.4 theorem a broke seat is a
**beaten** one. Seat 3's share of roster hands falls across the windows only because the **roaming**
field gets richer faster (29,757 → 44,410 roaming hands) and because a higher tier deals more rounds
per day, so the day's second and third hands fall to seats the first hand has already committed.
**Seat 3 never drops below half of all roster hands in any window.**

### 22.4a THE SECOND INSTRUMENT — what the roster costs a player who wants what it SELLS

The gambler is **set-blind**: `planDare` "has no idea a *set* exists" (§12.9 F-148-2, at the site).
The shipped instrument that **does** seek closure is `deed-hunter.ts`'s roster tour — unbeaten seats
in **authored seat order** at **band-minimum stakes**, self-stopping on the registry. It is a
**shipped instrument and was not modified**. Driven at `driveCompetentCampaign(deedHunterPolicy,
seed, 300)` over **152 careers** (the coverage arm's 76 seeds, **doubled so the roster pool clears the
`n ≥ 10,000` bar on its own count** — the sample was widened rather than a rate published
under-powered):

| | **the deed hunter** (set-seeking, band-minimum stakes, 152 × 300d) | **the gambler** (bankroll-chasing, set-blind, 1,600 × 120d) |
| --- | --- | --- |
| roster hands | **11,021** (72.5 / career) | **122,820** (76.8 / career) |
| **roster EV / hand** | **+21.5 cr** | **−200.8 cr** |
| net off the roster, per career | p10 **−473** · p50 **+1,885** · p90 **+3,450** | p10 **−52,332** · p50 **−20,506** · p90 **+30,297** |
| as a share of the median final purse | **−0.52%** (i.e. a **gain**) | **31.72%** (a real cost) |
| port sets closed | **2,099** (every one of 152 careers closed ≥ 1) | 2,861 (1,254 of 1,600 careers closed ≥ 1) |
| **grand slams** | **141 / 152 (92.8%)**, `liars_dice_grand_slam` banked 141 | **0 / 1,600** |
| days to closure | p10 **158** · p50 **205** · p90 **259** · max 295 | — (never closes at a 120-day horizon) |
| broke seats at the horizon | **0.00 of 42** | 5.72 of 42 |

**THE LOAD-BEARING ROW IS THE SECOND: the roster pays the set-seeker +21.5 cr/hand.** The price
F-220-1 names is not a price at all for the player the roster is *for*; it is what a policy pays for
electing the house's hardest seat on three of every four roster hands and never finishing a set.

**Two things this table does NOT claim, stated so a reader does not read a contradiction.** (i) The
census re-weighting predicts **+172.8** and the hunter measures **+21.5** — the same **sign**, which
is the claim, and different **magnitudes**, because the re-weighting holds the *gambler's* cell EVs
(mean seated stake **2,631.6**, §21) while the hunter plays at **band minimum**; EV per hand scales
with the stake. (ii) The two arms have different horizons (300d vs 120d) and different policies, so
the two rows are not a controlled comparison of anything except **what each policy pays for what it
gets** — which is exactly the quantity A2 is about.

**A2 IS ANSWERED AND PASSES, on the strongest form of the test:** the tour does not merely afford
closure, it is **paid** to close, **0.00 seats are broke at the horizon**, and §7.5's no-lockout
theorem is not merely un-violated — it is not even approached.

### 22.4b THE ZERO-SUM PRICE METER — and the asymmetry nothing in the docs names

The roster is zero-sum (§7.1) and never regenerates (§7.5), so
`Σ_ids (bankroll − liarsDicePurses[id])` at the horizon **is** the net credits a career took **off**
the roster. Recomputed from `LIARS_DICE_OPPONENTS` rather than quoted: **Σ bankroll = 280,800 cr over
42 rows — the content header's claim, CONFIRMED.**

**The meter reconstructs the instrument exactly, on all 1,600 careers:**
`Σ (bankroll − purse) === roster marginal of dareCells.netCredits` on **1,600 / 1,600** careers, and
the spy's queued dares equal `dareCells.hands` on **1,600 / 1,600**. Pooled: **−24,657,726 cr over
122,820 roster hands = −200.8 cr/hand**, reproducing §22.3's cell arithmetic from an entirely
independent read of the state. *(That identity also proves `driveCompetentCampaign` and
`runCampaign` drive the same career on this arm, which is what licenses §22.4's per-seat read.)*

**THE ASYMMETRY, stated plainly because nothing in the docs names it.** The player's **upside** off
the roster is **capped at Σ bankroll = 280,800** and never regenerates; the most any of the 1,600
careers took off was **163,442 cr — 58.21% of the whole cap**, so the ceiling is real and reachable.
The **downside has no such bound**: the worst career fed **102,742 cr** in, and nothing in the rules
stops a career feeding it more. **That asymmetry is the honest core of F-220-1**, it survives every
correction above, and LD-30 names it rather than absorbing it — see §22.5's bound B2 discussion.

### 22.4c COMPOSITION, reproduced

§20.4's reading holds unchanged (rates held fixed, weights varied): **52.90%** as measured, **49.11%**
tiers equally weighted, **52.12%** pools equally weighted, **35.63%** under a tier-0 mix — a
**17.28 pp** spread with no rate changed. Kitagawa over the **tier** axis (the axis on which the
pools *do* overlap): the win-rate gap is **12.86 pp = composition 0.41 + rate 12.45** (3.2%
composition), and the **EV** gap is **696.6 = composition 27.4 + rate 669.2** (3.9% composition). The
two pools genuinely play differently; the archetype axis is where the *weighting* story lives, and
§22.4 is where it is told.

### 22.5 THE RULING, AND WHAT WAS NOT EDITED

**Binding text: LD-30** in `docs/LIARS-DICE-DECISIONS.md`. In summary:

1. **THE PRICE IS RULED INTENDED — as the price of the SEAT, denominated in PROGRESSION, and it is
   the seat ELECTION rather than the table that produces the measured figure.** LD-11 authors a
   difficulty ladder and prices it in purse; a policy that always takes the biggest purse always
   takes the hardest seat, and pays for it. The measured −200.8 is that policy's bill, not the
   table's tariff. **Nothing in any rule moves.**
2. **A BOUNDED STANDING INVARIANT IS ADDED — the CENSUS BOUND: the roster pool's EV/hand, re-weighted
   to LD-11's own authored seat census with every cell's measured EV held fixed, must stay
   POSITIVE.** Sourced (content's census, which **predates** this measurement by many tasks),
   argued (§22.4's decomposition is exactly what it bounds), **computed** — the weights come from
   `LIARS_DICE_OPPONENTS`, and **the bar is ZERO**, which is not −200.8 minus slack.
3. **F-223-1 IS FILED, NOT ABSORBED** (`TASKS.md` **T-227**): the player is told **nothing** about
   which of the three seats is the hard one. §22.6.

**WHY B1 AND B3 WERE NOT TAKEN, argued rather than omitted** (the plan named three candidates and
asked for the two rejected ones to be argued against in writing):

- **B1 — the mix-headroom bound** (`measured roster share < EV_roaming / (EV_roaming − EV_roster)`).
  Measured: roster share **43.89%** against a break-even share of **71.18%**, **27.29 pp of
  headroom** — so **A3 PASSES** comfortably. But B1 is **algebraically identical to LD-28's promoted
  invariant**: `pooled EV > 0 ⟺ share < w*`. Shipping it as a *new* bar would be shipping LD-28's bar
  twice under a second name. It is therefore **shipped as a REPORTED QUANTITY with an assertion that
  the two readings cannot disagree** — the headroom is the number that says how much composition
  drift LD-28 tolerates, and nothing reported it before — and **not** counted as the new invariant.
- **B3 — the demonstrated-violator bound** (roster EV/hand > shape (a)'s **−314.9**, §18.6). Sourced,
  on LD-28's own "a bar that names a measured pathology keeps its meaning" argument. **Rejected
  because the margin is thin and would be presented as comfortable if it were not:** −200.8 against
  −314.9 is **114.1 cr of margin at a career-cluster bootstrap SE of 10.8**, ~10.6 SE — but it bounds
  the *measured* mix, which §22.4 has just shown is the **seat-picker's** number, so B3 would bar a
  quantity the ruling says is not the game's. A bound on an instrument artefact is not a bound on the
  game.
- **B2 — the zero-sum capital bound** (credits fed in must stay under Σ bankroll). **Not shipped as
  an invariant, and the reason is that it is not falsifiable in the direction that matters:** the
  cap binds the player's **upside** (which the rules already enforce — a purse cannot go below zero
  and never regenerates), not the **downside**, which is the unbounded side (§22.4b). Shipping it
  would look like a bound while barring nothing. The asymmetry it names is instead **written down**
  in §22.4b and in LD-30, which is the honest treatment.

**THE COUNTER-CASE, stated and answered rather than omitted.** Ruling a measured −200.8 cr/hand
"intended" is, on its face, the convenient outcome. Four checkable answers:

- **(i) The premise the finding rested on is demonstrably false**, and it is false at a shipped hard
  null with an existing test, not by reinterpretation (§22.0 correction 1).
- **(ii) The ruling is contradicted by no measurement and CONFIRMED by an independent one.** The
  set-seeking instrument — a different policy, a different horizon, different stakes — measures the
  same table at **+21.5 cr/hand over n = 11,021** and closes the grand slam in 141 of 152 careers.
  If the roster were a sink, that arm could not exist.
- **(iii) The new bar is not fitted.** Its weights are content's, authored long before this
  measurement; its threshold is **zero**; and it goes **red** on exactly the thing the ruling claims
  is safe — a content pass that re-authors the census into a sink.
- **(iv) Two of six pre-committed predictions were WRONG and are recorded as wrong** (§22.7),
  including the one most convenient to this reading (prediction 4: "buys nothing" — it closes 2,861
  port sets).

**NO RULE MOVED, and the "if any rule moves" branch of Accept is discharged per-lever in writing:**

| lever | why it did not move |
| --- | --- |
| `planDare`'s richest-candidate rule | **§12.9 F-148-2 — RULED, not overlooked.** It is the shared seat-picker every dice sweep row reads off, so changing it re-bases every baseline in the commit that measures it. §16.2's banned third shape covers moving the sim to make an engine measurement come out. |
| **ALT-1 · the content seat census / the `3× / 5× / 8×` bankroll ladder** | **The on-point lever, and the measurement says it is not where the effect is.** Content's own census already reads **+172.8 cr/hand** (§22.4) and the hunter, which plays that census, is **paid +21.5**. Re-authoring the ladder to fix a number produced by the *picker* would move `rulesFingerprint`, buy a capstone, re-base every roster figure in §18–§22, and fix nothing that is broken. **Declined on the evidence, not waved off.** |
| **ALT-2 · LD-29's stake-referenced ante** (`ante = max(1, round(seedWager × f))`) | **Measured and declined ONE TASK AGO at §21 / LD-29**, on identical seeds over 260 cells at n = 40,000 hands/cell: it moves the table **against the player at every measured cell**, which is the wrong direction for a finding about a player-side sink, and LD-29 records it as the shape a fix to **F-222-2** should start from — a different finding. Re-running it here would re-measure a closed bakeoff to answer a question §22.4 answers arithmetically. |
| **ALT-3 · remove the §7.6 hard null so a roster seat pays disposition** | **Declined in writing, with the cost stated.** Pool A has **no `NpcState`** (§1 rule 1), so this is not a flag flip: it needs per-roster-opponent disposition **persisted**, i.e. a **save-shape change owing a migration that CALLS a rule plus a round-trip test**, a `rulesFingerprint` move and a capstone — and it would re-open LD-26's partition, LD-13's beat-once rule and §7.6's own ruling. It is declined **because §22.0 correction 1 removes the reason to want it**: the finding asked for it to make its premise true, and the premise being false is the finding's answer, not a gap to close. |
| `optimal`'s raise valuation | **LD-27 — closed and declined**, five arms, all lose. |
| `SIM_DARE_CHALLENGE_MARGIN` / `DARE_AI_CHALLENGE_MARGIN` | T-176's Delivered note: tuning the instrument to hit a threshold. |
| `minOpeningQuantity` | LD-21's fix and LD-28's replacement anchor. |
| any band / threshold / golden | **Never edited to make a test pass**, in either direction. A red live band gets a **wider sample** (N4/N10) — which is exactly what §22.4a did when the hunter arm's roster pool came in at n = 5,620 on 76 careers: the seed set was **doubled to 152** so the cell clears the 10,000 bar, rather than publishing an under-powered rate. |

**FINGERPRINTS AND SCOPE.** Touched: `docs/**`, `packages/engine/src/__tests__/**`,
`packages/sim/src/__tests__/**`, `.scratch/**`, `TASKS.md`. Nothing under `packages/engine/src`
outside `__tests__`, nothing under `packages/content/src`, nothing under `packages/ui/src`.
`__tests__` is in `HASHED_ROOT_IGNORED_DIRECTORIES` and is **not** in `SIM_INSTRUMENT_DIRECTORIES`
(`packages/sim/src/balance/rules-fingerprint.ts`, whose list is `['', 'balance']`), so
**`instrumentFingerprint` does not move**; **`rulesFingerprint` does not move**; and
**`docsFingerprint` does not move either** — `computeDocsFingerprint` (`rules-fingerprint.ts:658`)
hashes the raw bytes of the same rule and instrument **sources**, comments included, **not
`docs/**`**. Read live before and after with `.scratch/t219-fp.mjs`: **`cabd2112ccf4cefb` /
`2d6d1990eaf13031` / `265aea1d09f0d485`**, all three unmoved. **No capstone, no re-extract, no
baseline re-pin is owed**, and §22.0 correction 4 says why the arm is shards-only.
**`CURRENT_SAVE_VERSION` is UNMOVED at 17**, **re-read live** at `packages/engine/src/save.ts:627` —
a derived per-pool report is not a save shape, so **no migration and no round-trip test is owed**.

**WHAT ENFORCES THIS RULING** (both files are in `__tests__`, so neither can move a fingerprint —
stated here as §20.5 states it):

- `packages/sim/src/__tests__/campaign-dare-cells.test.ts`, describe **`T-223 · LD-30 — the roster
  seat's price`**. Three assertions on the **same memoised 48-career pass** the T-220 describe uses
  (hoisted to module scope; no fourth walk over 48 careers, and T-220's own assertions are
  byte-identical): the **census bound**, with the weights computed from `LIARS_DICE_OPPONENTS` and
  **no literal threshold in the mechanism**; the **mix headroom**, with both sides derived from the
  live rollups and an assertion that it and LD-28's pooled reading **cannot disagree**; and the
  **archetype rollup lossless** against the roster marginal, non-empty at all three concrete arms,
  with `optimal` the majority arm — so a later roster figure published *without* the archetype cut
  goes red. All three print value, `n` and the cell detail on failure and carry the standing remedy
  *"IF THIS IS RED, WIDEN THE SAMPLE — NEVER MOVE THE BAR (N4/N10, `docs/VERSIONING.md`)"*.
  **Measured on that 48-career sample:** roster n = 3,699 at **−186.8**, `optimal` n = 2,858 at
  **−510.3** (w 0.490), `bad` n = 431 at **+421.3** (w 0.267), `random` n = 410 at **+1,428.8**
  (w 0.243) → **census EV +209.0**; roster share **43.76%** against break-even **70.88%**
  (**27.12 pp** of headroom). **The census margin is reported in SE rather than presented as
  comfortable:** a career-cluster bootstrap over those 48 careers puts it at **+208.6 ± 73.9**, with
  **3 of 4,000** resamples below zero — a ~2.8 SE detector, not a knife edge, and deterministic in
  the seeds, so it moves only when the rules do.
- `packages/engine/src/__tests__/liarsDice.test.ts`, describe **`T-223 · what a roster seat pays, and
  what it does not`**. Three assertions, all computed from the shipped table so a content pass that
  breaks either structural fact goes RED and **re-opens LD-30**: the §7.6 null holds on the **WIN**
  arm too, with a **vacuity guard** proving the challenge sample reaches **both** terminal arms (the
  one thing `T-145 · roster hands apply NO disposition (§7.6)` never asserted — that describe is
  **extended, not duplicated**); `seedLiarsDicePurses()` **is** the authored bankroll row-wise, with
  the **key sets** compared so a row added without a purse fails rather than a total that happens to
  match; and **bankroll is STRICTLY increasing in `seat` at every one of the 14 ports** with seat 3
  `optimal` and seat 2 `mixed` at every port — **the pin that makes §22.0 correction 3 durable.**

### 22.6 THE UI ANSWER — `docs/HANGOUT_REDESIGN.md` §7, Finding F-223-1

Accept names the UI question explicitly, and A4 answers it **independently of the sign**. Answered
from the shipped code, every claim grep-able:

- `packages/ui/src/format.ts:571` `hangoutRosterOpponents` exposes **name / beaten / purse / broke**,
  plus `read` **only at unlock tier ≥ 3** and **never on a `mixed` row** (§4.5 ruling 1).
- **The pane renders four of those five and NOT the purse** (`packages/ui/src/App.tsx:2470-2510`):
  name, `· beaten`, `· cleaned out`, and the read. §22.0 correction 5.
- `packages/ui/src/format.ts:670` `liarsDiceDealerReadout` **hard-nulls on any `ld-` id**, so a
  roster seat prints no standing line at all (LD-26 / T-221's roster arm).
- The row's own `seat` field — and content's `journeyman / regular / house` role table — is **not**
  in `HangoutRosterOpponent` and is not rendered.

**THE ANSWER IS NO, AND IT IS WORSE THAN THE FINDING GUESSED: the player is told NOTHING.** Before
tier 3 the three seats are distinguished by their **authored names alone**. At tier ≥ 3 the read
arrives — and it describes **style, not difficulty**: `optimal`, the hardest and richest seat, reads
**"This one plays it safe."** (`liarsDiceRules.ts:335`), which a player has every reason to hear as
*harmless*; the `mixed` seat reads nothing by ruling; only `bad` reads *"This one's reckless."*

**It is FILED rather than shipped, and the reason is the ruling itself.** LD-30 finds the roster is
**not** the expensive seat for the player it is for (+21.5 cr/hand to the set-seeker), so bolting on
a "this seat is expensive" cue would print a claim this task's own measurement contradicts. What is
actually missing is a **difficulty** disclosure on a ladder content already authors and the UI
already carries the field for — an inert, zero-content-cost change, but a **design** call about what
the player should be told and when, which is the owner's and not a measurement task's.
**F-223-1 / `TASKS.md` T-227.**

### 22.7 THE PREDICTIONS, SCORED — including the two wrong ones

| # | Prediction | Outcome |
| --- | --- | --- |
| 1 | Reproduces §20.3 to every published decimal; fingerprints unmoved | ✅ **PASS** — 1,600 / 279,857 / 52.90% / +190.1 / roaming +495.8 / roster −200.8 / `roster\|optimal` −482.3 / +15.79 pp z 35.93 / median 64,622, with `rules cabd2112ccf4cefb`, `instrument 2d6d1990eaf13031`, `docs 265aea1d09f0d485` |
| 2 | Both pools **and all three concrete roster archetype cells** clear n ≥ 10,000 | ✅ **PASS** — 157,037 / 122,820, and 95,580 / 14,680 / 12,560. No published roster archetype cell is under-powered |
| 3 | Flat **and** census re-weightings turn the roster pool EV-POSITIVE | ✅ **PASS** — flat **+391.3** (predicted ≈ +391), census **+172.8**, against −200.8 as measured. Not one cell EV changed |
| 4 | The gambler closes **zero port sets and zero grand slams** — "pays the price and buys nothing" | ❌ **HALF WRONG, and the wrong half is the load-bearing one.** Grand slams **0 / 1,600** ✅. But it closes **2,861 port sets**, in **1,254 of 1,600 careers**, at a mean of **20.51 / 42** seats beaten. "Buys nothing" is FALSE — it buys 68% of a set's worth of closure per career and never finishes one. The ruling is stated against the measurement, not the prediction |
| 5 | The zero-sum meter reconstructs the roster marginal **exactly**; Σ bankroll = 280,800 | ✅ **PASS** — exact on **1,600 / 1,600** careers (and hand counts exact on 1,600 / 1,600); Σ bankroll recomputed **280,800**, header confirmed |
| 6 | The hunter's per-hand EV is **NEGATIVE**; its cost-to-closure is under 5% of the median purse | ❌ **WRONG ON THE SIGN.** The hunter's roster EV is **+21.5 cr/hand** over n = 11,021, and the median career ends **+1,885 cr up** on the gauntlet — **−0.52%** of the median purse. The magnitude clause is right and then some: there is no cost to bound, because there is no cost |

**Prediction 6 is the useful one.** It was written expecting the roster to charge *somebody*, and the
instrument that buys what the roster sells is **paid**. That is the measurement that turns §22.0
correction 1 from a debating point into a ruling.

### 22.8 Findings filed by T-223

**F-223-1 · the player is never told which of the three house seats is the hard one.** Filed as
`TASKS.md` **T-227** and written into `docs/HANGOUT_REDESIGN.md` §7. Content authors a strict
difficulty ladder (seat 1 soft / seat 2 mixed / seat 3 `optimal`, purse `3× / 5× / 8×`, pinned by
this task's own engine test) and the UI surfaces **none of it**: the purse is projected but not
rendered, `seat` is not projected at all, `liarsDiceDealerReadout` hard-nulls on a `ld-` id, and the
only cue that ever arrives — at tier ≥ 3 — describes **style**, calling the hardest seat *"This one
plays it safe."* A4 is answered independently of the sign, on LD-26 / T-221's precedent: an unpriced
purchase is a trap regardless of whether it is expensive. **Not shipped here** because what is
missing is a *difficulty* disclosure and that is a design call about what the player learns and when
(§22.6), not a measurement task's to take.

### 22.9 The scorecard

| Accept clause | verdict |
| --- | --- |
| roster EV re-measured at **n ≥ 10,000 per pool**, **`n` on every cell** | **PASS** — roaming **157,037**, roster **122,820**; every populated pool × archetype cell clears the bar on its own count (95,580 / 14,680 / 12,560); `n` on all 8 archetype cells, all 12 tier cells and every C6 row; six under-powered tier cells **marked as such**; a career-cluster bootstrap SE and 95% CI added to every published EV cell |
| **decomposed against the roster archetype mix** — is the sink `optimal`, or the pool? | **DONE — §22.4.** A cross-pool Kitagawa over the archetype axis is **not defined** (disjoint axis) and is not faked; the decidable form is the re-weighting, and it answers unambiguously: **`optimal` × its WEIGHT**, −200.8 as elected → **+172.8** under content's own census → **+391.3** flat, with **no cell EV changed**. The feedback loop is **measured**, not asserted (seat-3 purse +15.7%, soft seats −6.8% / −3.7%, 5.72 broke seats) |
| owner **rules the price intended** → written into `LIARS-DICE-DECISIONS.md` with the derivation, **LD-26 cited not restated**, and a **bounded** standing invariant, **sourced and argued, not fitted** | **DONE — LD-30.** The derivation is denominated in **closure** (correction 2), not disposition; LD-26 is **cited** for the partition and **corrected** by a dated note for the one clause that mis-stated it. The invariant is the **CENSUS BOUND** — weights computed from `LIARS_DICE_OPPONENTS`, bar **ZERO**, not −200.8 minus slack. B1 and B3 are **argued against in writing** (§22.5) |
| **or** rules it a defect → bakeoff'd against ≥ 1 named alternative, ordering re-scored, LD-28's invariants re-scored | **NOT THE BRANCH TAKEN, and discharged per-lever anyway** (§22.5's table): ALT-1 declined **on the measurement**, ALT-2 measured and declined at §21/LD-29 one task ago, ALT-3 costed and declined in writing. **C6 re-scored regardless:** `bad − optimal` **+15.79 pp, SE 0.44, z 35.93 — no re-inversion.** **Both LD-28 invariants re-scored:** pooled EV **+190.1 > 0** ✅ and **≪ +558** ✅, with **27.29 pp** of mix headroom |
| the **UI question answered explicitly** (`docs/HANGOUT_REDESIGN.md` §7) | **DONE — §22.6 / Finding F-223-1 / T-227.** Answered **no**, from the shipped code, and the plan's own premise corrected: the purse is **not rendered**, so the player has no cue at all before tier 3 and a **style** cue after it |
| if any rule moves, own capstone with moved rows predicted first | **VACUOUS AND DELIBERATELY SO** — no rule moved; §22.5's fingerprint block reads all three hashes live, before and after, unmoved |
| **§20.7 gains the outcome** | **DONE** — a dated line appended under F-220-1. §20.3's table, §20.5's item 4 and §20.6's prediction-4 row are left **verbatim** |
| gate green | `npm run format`, `npm test`, `npx tsc -b`, `npm run lint`, `npm run format:check` all exit 0; zero failing tests; the `it.fails` tripwires stay red-as-designed |
| no band / threshold / golden edited | **NONE** — in either direction. When a cell came in under-powered (the hunter arm at n = 5,620) **the sample was doubled**, not the bar |

**F-220-1 CLOSES: MEASURED, DECOMPOSED, PRICED ON THE RIGHT INSTRUMENT, AND RULED.** The finding's
arithmetic was exact and its reading was inverted. The roster does not sell disposition — it cannot,
by a shipped hard null — it sells **closure**, and to the player who buys closure it pays **+21.5
cr/hand** and hands over the grand slam in **141 of 152 careers**. The −200.8 is the bill for a
policy that takes the biggest purse on the table on three of four roster hands and never finishes a
set, and the picker that writes that bill is **ruled, not overlooked**. What the finding was right
about, and what no document had said, is now written down: **the player's upside against the
gauntlet is capped at 280,800 credits and never regenerates, while the downside has no bound at
all** — and the one thing the player is told about which seat is which is **nothing**.
