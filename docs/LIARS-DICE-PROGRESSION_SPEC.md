# Liar's Dice — the roster, the archetypes, and the unlock ladder

**T-144 · spec only · authored 2026-07-31 · zero source files touched.**

This is the addendum to `docs/LIARS-DICE_REDESIGN.md` for milestone **M4e** (T-144–T-148). M4d
built the game; this builds the *career* on top of it. It settles the fixed 42-opponent roster,
the four AI archetypes as actual decision rules, the five-rung unlock ladder, the two new
persisted player fields and their single save migration, the per-opponent persisted purse, and
the achievement completion signal.

It is a **split-out** document rather than a §17 of the redesign, because that file closes with
§16 — a *dated capstone*. Burying a new system's spec behind a capstone makes both harder to
read, and T-148's own capstone then has an obvious home here (§12, mirroring §16's shape).

**Nothing in this document is left to the implementing coder's judgement.** Where a number
carries a justification the justification is written down, because this repo's specs argue their
numbers. Where a ruling closes a door, the door is named.

---

## §0 · Ground truth, verified at HEAD on 2026-07-31

Everything below was read out of the tree, not remembered. T-145/T-146/T-147 should not
re-derive any of it.

| Fact | Verified at |
| --- | --- |
| `CURRENT_SAVE_VERSION` is **14**. (The orchestrator brief's "starting at 12" is stale — T-111 took it to 13 and T-135 to 14.) | `packages/engine/src/save.ts:429` |
| The 14 `hasHangout` ports are system ids **1–14 exactly**. Rim 15–20, Andromeda 21–26, MALIGNA 27 and NEMESIS 28 carry no Hangout. | `packages/content/src/systems.ts:99-140` |
| `DARE_MIN_WAGER = 25`, `DARE_MAX_WAGER = 1000`, `DARE_ANTE_BAND_FRACTION = 0.03` | `packages/content/src/hangout.ts:65,66,123` |
| Ports **1 and 3 omit `wager`** and resolve field-wise through `DEFAULT_PORT_HANGOUT` to 25/1000. | `packages/content/src/portHangouts.ts:201-206,279,367` |
| `NpcState.id === profile.id` — roster ids must therefore be disjoint from `ALL_NPC_PROFILES` ids. | `packages/engine/src/state.ts:79-82` |
| `STATE_PATHS` is a **one-element** allowlist (`player.ship.fuel`) and `DeedTrigger.state` is a post-event *filter*. The state-flag route to an achievement is closed. | `packages/engine/src/deeds.ts:104`, `matchesState` |
| `deeds.test.ts` guards: (a) every deed's `eventType` must be in `EVENT_PATHS`; (b) every matcher path must be allowlisted **for that type**; (c) the reverse — every `EVENT_PATHS` **key** must be named by ≥1 deed. **(c) is at eventType granularity, not per-path** — an allowlisted *path* no deed names does not red it. | `packages/engine/src/__tests__/deeds.test.ts:810-835, 893-905` |
| `deed-coverage.test.ts` drives 65 seeds × 300 days and asserts (a) **every** authored deed is earned in the union, and (b) **≥ 2** careers earn the whole slate. The prose comment says "measured at 3"; the assertion is `toBeGreaterThanOrEqual(2)`. | `packages/sim/src/__tests__/deed-coverage.test.ts:219-280` |
| `DEEDS.length` is **44**. `RENOWN_DEED_THRESHOLDS.CONQUEROR` is **38**. | `packages/content/src/deeds.ts:320`, `:238-270` |
| `HangoutFailReason` is a union pinned **value-for-value** in the schema (`_covHangoutFailReason`), not key-for-key. A new member must be added in both places or a save carrying it fails to parse. | `packages/engine/src/types.ts:286-310` |
| T-137 measured the shipped Dare at a **94.66%** player win rate and **+737.53 cr** EV per hand, on 8,000 rows. | `docs/LIARS-DICE_REDESIGN.md` §16.1 |

### The fourteen ports, as authored

| id | name | house | tone | `wager.min` | `wager.max` | ante @T0 | ante @T4 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Sun-3 | the Long Table | everyday | 25 | 1000 | 30 | 90 |
| 2 | Aldebaran-1 | the Weighbridge | everyday | 50 | 750 | 23 | 68 |
| 3 | Altair-3 | the Waypost | everyday | 25 | 1000 | 30 | 90 |
| 4 | Arcturus-6 | the Garrison Mess | dangerous | 100 | 400 | 12 | 36 |
| 5 | Deneb-4 | the Standing Hall | exotic | 25 | 2000 | 60 | 180 |
| 6 | Denebola-5 | the Incident Book | comic | 20 | 300 | 9 | 27 |
| 7 | Fomalhaut-2 | the Fittings | comic | 15 | 1200 | 36 | 108 |
| 8 | Mira-9 | the Dry Tank | everyday | 5 | 200 | 6 | 18 |
| 9 | Pollux-7 | the Turnaround | everyday | 75 | 900 | 27 | 81 |
| 10 | Procyon-5 | the Bonded Room | everyday | 100 | 500 | 15 | 45 |
| 11 | Regulus-6 | the High Table | exotic | 500 | 3000 | 90 | 270 |
| 12 | Rigel-8 | the Underhold | dangerous | 10 | 3000 | 90 | 270 |
| 13 | Spica-3 | the Second Watch | exotic | 200 | 1800 | 54 | 162 |
| 14 | Vega-6 | the Long Room | exotic | 250 | 1500 | 45 | 135 |

Ante columns are `max(1, round(ceiling × 0.03))` — the shipped `anteFor` arithmetic, with the T4
ceiling `3 × band.max` (§4.4). They are reproduced here so they can be pinned in a test without
recomputing: the **@T0 column is the shipped value** and is T-145's behaviour-preservation
baseline; the **@T4 column is T-146's**, landing with `anteFor`'s tier parameter (§4.7).

---

## §1 · The two pools — stated as rules, because the distinction is an Accept criterion

**Rule 1 — Pool A, the fixed roster.** 42 authored opponents, exactly 3 per `hasHangout` port,
living in `packages/content/src/liarsDice.ts`. They are **not** `NpcState`s. They have no
`currentSystemId`, take no part in the dusk roam simulation, cannot die, carry no disposition and
no relationship. They are always seatable at their authored port unless broke (§7). They are the
gauntlet.

**Rule 2 — Pool B, the 30 roaming captains.** `NPC_PROFILES`, **mechanism entirely unchanged**:
`hangoutNpcs` / `rankClientele` surface whoever is in-system and `!dead`, they are freely
re-challengeable without limit, they are played by the shipped `dealerMove` policy with its
GUILE-driven bluff constants, and `applyDisposition` runs on them exactly as today. A captain
whose simulation has parked them at a rim system is unreachable that day. That is in-fiction
continuity — "that captain's out at the rim right now" — and it is **not** a bug to route around.

**Rule 3 — `player.liarsDiceBeaten` records POOL A AND ONLY POOL A.** A win over a roaming
captain is never written to `liarsDiceBeaten`, never advances a port-clear deed, and never
advances the roster-clear deed, no matter how many times it happens. The only counter both pools
feed is `liarsDiceGamesPlayed`.

*Why, written down so a later reader cannot "simplify" it away:* pool B is unbounded replay
against a pool that respawns its willingness to play every single day. If a roaming win counted
toward a completion set, the achievements would degrade from a gauntlet into a grind timer — a
player would clear them by sitting at Sun-3 pressing the same key. The 42 are finite, authored,
positionally distributed across the whole map, and beat-once. That is what makes clearing them
mean something.

**Rule 3a — the corollary.** `liarsDiceBeaten` is a **set semantically** but a `string[]`
physically (§5). A rematch against an already-beaten roster opponent is perfectly legal, pays
normally, and increments `liarsDiceGamesPlayed` — it simply writes nothing to the beaten list and
emits no completion event (§6).

---

## §2 · The content table — `packages/content/src/liarsDice.ts`

### 2.1 The exported shape

```ts
/** The three CONCRETE policies plus the meta-archetype that samples among them. */
export type LiarsDiceArchetypeId = 'optimal' | 'bad' | 'random' | 'mixed';

/**
 * A percentage split across the three CONCRETE archetypes. Non-negative integers
 * summing to EXACTLY 100. `'mixed'` is deliberately not a member of this shape,
 * so a mix can never recurse into another mix.
 */
export interface LiarsDiceMix {
  optimal: number;
  bad: number;
  random: number;
}

export interface LiarsDiceOpponent {
  /** `ld-<systemId>-<seat>`. Provably disjoint from every NpcState id (which are
   *  `NPC_PROFILES` / `QUEST_PROFILES` ids) — asserted by the content validator. */
  id: string;
  /** The `STAR_SYSTEMS` id of the port this opponent is fixed at. Matches the
   *  record key; the validator asserts key === row.systemId, the `portHangouts.ts`
   *  precedent. */
  systemId: number;
  name: string;
  seat: 1 | 2 | 3;
  archetype: LiarsDiceArchetypeId;
  /** REQUIRED iff `archetype === 'mixed'`, ABSENT otherwise. Asserted BOTH ways. */
  mix?: Readonly<LiarsDiceMix>;
  /** The AUTHORED STARTING PURSE, in credits. Seeded onto the save at new-game and
   *  by the v14→v15 migration; the live balance thereafter is save state (§7). */
  bankroll: number;
  /** Three authored lines, voiced to the port's `prose.tone`. */
  lines: { tableTalk: string; win: string; lose: string };
}

export const LIARS_DICE_OPPONENTS: Readonly<Record<number, readonly LiarsDiceOpponent[]>>;

/** The five ladder thresholds, in `liarsDiceGamesPlayed`. §4. */
export const LIARS_DICE_UNLOCK_GAMES: readonly [5, 10, 20, 40, 80];

/** Tier 4's ceiling multiplier over the port's authored `wager.max`. §4.4. */
export const LIARS_DICE_RAISED_CEILING_MULT = 3;
```

### 2.2 Three fields that are deliberately absent

- **No `guile`.** For pool A the archetype *is* the policy. `npcGuile` is pool B's input and is
  never read for a roster opponent. Adding a `guile` to the roster row would create a second,
  silently-unused difficulty dial.
- **No `dead`, no `currentSystemId`.** Rule 1. A roster opponent's only mutable state is its
  purse, and that lives on the save, not in content.
- **No per-opponent wager band.** The port's authored band governs, as it does for pool B. A port
  that wants steeper tables authors a wider band — the `liarsDiceRules.ts` module header's "there
  is no per-port branch anywhere in this file" law extends to the roster unchanged.

### 2.3 The engine/content line

`liarsDice.ts` is **data**. The archetype *label* is data; the policy that reads the label is
`packages/engine/src/liarsDiceRules.ts` (§3). There is no `if (` in `packages/content` deciding an
outcome — the standing constraint holds by construction, because the file exports no functions at
all beyond the validator of §8 row 37, which decides nothing and only throws on malformed content.

### 2.4 Seats, archetypes and bankrolls — fully determined

Every one of the 42 rows is derived from its port by the table below. No author judgement is
involved in *which* archetype or *how much* bankroll; the only authored content is the name and
the three lines.

| seat | role | archetype | bankroll |
| --- | --- | --- | --- |
| 1 | the journeyman | `'bad'` at ports 1–7, `'random'` at ports 8–14 | 3 × `wager.max` |
| 2 | the regular | `'mixed'`, mix chosen by the port's authored `tone` | 5 × `wager.max` |
| 3 | the house | `'optimal'` | 8 × `wager.max` |

Label census: **bad ×7, random ×7, mixed ×14, optimal ×14.** All four labels are present at a
meaningful count, difficulty rises monotonically with the purse at every port, and every port
offers one easy seat, one unpredictable seat and one hard seat — so no port is a dead stop for a
weak player and no port is free for a strong one.

*Why the 1–7 / 8–14 split for seat 1 rather than alternating:* it keeps the split legible in the
content file (a contiguous run, not a parity trick) and it puts `'random'` — the seat a player
cannot learn to read — at the seven ports that include the two widest bands (11, 12) and the
narrowest (8), so the unreadable seat spans the whole stake range rather than clustering.

### 2.5 The four tone mixes

Each is a non-negative integer triple summing to exactly 100. The port's authored
`prose.tone` picks the row; the *tone*, not the id, so a port that is re-toned in a later content
pass moves with it and no engine code learns a port id.

| tone | ports | `optimal` | `bad` | `random` |
| --- | --- | --- | --- | --- |
| everyday | 1, 2, 3, 8, 9, 10 | 40 | 40 | 20 |
| exotic | 5, 11, 13, 14 | 60 | 20 | 20 |
| dangerous | 4, 12 | 70 | 10 | 20 |
| comic | 6, 7 | 20 | 40 | 40 |

The reading: a dangerous house plays sharp, a comic house plays for the story, an exotic house
plays well, and an everyday house is a coin-flip between a sharp regular and a loose one.

### 2.6 The full 42-row bankroll table

Copy this; do not recompute it.

| port | `wager.max` | seat 1 (×3) | seat 2 (×5) | seat 3 (×8) | port total |
| --- | --- | --- | --- | --- | --- |
| 1 Sun-3 | 1000 | 3000 | 5000 | 8000 | 16000 |
| 2 Aldebaran-1 | 750 | 2250 | 3750 | 6000 | 12000 |
| 3 Altair-3 | 1000 | 3000 | 5000 | 8000 | 16000 |
| 4 Arcturus-6 | 400 | 1200 | 2000 | 3200 | 6400 |
| 5 Deneb-4 | 2000 | 6000 | 10000 | 16000 | 32000 |
| 6 Denebola-5 | 300 | 900 | 1500 | 2400 | 4800 |
| 7 Fomalhaut-2 | 1200 | 3600 | 6000 | 9600 | 19200 |
| 8 Mira-9 | 200 | 600 | 1000 | 1600 | 3200 |
| 9 Pollux-7 | 900 | 2700 | 4500 | 7200 | 14400 |
| 10 Procyon-5 | 500 | 1500 | 2500 | 4000 | 8000 |
| 11 Regulus-6 | 3000 | 9000 | 15000 | 24000 | 48000 |
| 12 Rigel-8 | 3000 | 9000 | 15000 | 24000 | 48000 |
| 13 Spica-3 | 1800 | 5400 | 9000 | 14400 | 28800 |
| 14 Vega-6 | 1500 | 4500 | 7500 | 12000 | 24000 |

**Total roster capital: 280,800 cr** (= 16 × Σ`wager.max` = 16 × 17,550).

State this number in the T-148 capstone. It is the **bounded, one-time maximum** the entire
gauntlet can ever transfer to the player, for the whole life of a save, because the roster is
zero-sum and never regenerates (§7). Whatever T-148 measures a dice-playing career's wealth at,
280,800 cr is the ceiling the roster contributes to it — a career that out-earns that from the
tables is earning it off pool B, which is a separate finding.

**The invariant this table buys:** at every one of the 42 rows, `bankroll ≥ wagerBandFor(systemId).min`,
because the smallest bankroll is `3 × max` and `3 × max ≥ min` holds at every port (the tightest
is port 11: 9000 ≥ 500). This is the precondition of §7's no-lockout theorem, and it is asserted
by the content validator (§8 row 37) so a later content pass cannot quietly break it.

### 2.7 Names and lines — the constraint set

126 strings (42 × 3). This spec does not author them; it fixes the constraints, and the content
validator enforces the mechanical ones:

1. **Names are unique across all 42** and **must not collide with any `ALL_NPC_PROFILES` name** —
   a roster opponent and a roaming captain sharing a name would make the picker ambiguous and the
   wire unreadable. (Ids are separately guaranteed disjoint by the `ld-` prefix.)
2. **All three lines non-empty**, ≤ ~120 characters, voiced to the port's `prose.tone`.
3. **`tableTalk` must not reference a dice count.** The count moves with the ladder (§4), so
   "four dice apiece" would be a lie at tier 2. This is a mechanical trap and the reason it is
   written down rather than left to taste.
4. **No `{…}` placeholder in any line.** They are printed verbatim, exactly as the renown
   citations are (`deeds.test.ts` pins that rule for citations; the same rule applies here by
   analogy and the validator enforces it).

---

## §3 · The archetypes as decision rules

The owner ruling named four labels. A label is not a policy. This section gives each one an
executable rule, and it contains no unquantified "heuristic".

All of it lands in `packages/engine/src/liarsDiceRules.ts`, whose PURE contract is preserved:
nothing here mutates a `GameState`, draws from an rng, or emits an event.

### 3.1 The shared probability helper

```ts
/**
 * P(Binomial(u, 1/6) >= k) — the chance that `u` unknown d6 show at least `k` of a
 * given face. Exact and closed-form; no rng, no state, no approximation.
 *   k <= 0  -> 1
 *   k > u   -> 0
 *   else      sum_{j=k..u} C(u,j) (1/6)^j (5/6)^(u-j)
 * `u` is the LIVE `dicePerSide` off the hand, never a constant — this is one of the
 * ladder's ripple sites (§4, §8 row 9).
 */
export function probAtLeast(k: number, u: number): number;
```

The truth probability of a standing claim `(q, f)` seen from the dealer's seat, holding `own`
dice of face `f` among its own `n` and knowing nothing about the other side's `n`:

```
pTrue(q, f) = probAtLeast(q - own, dicePerSide)
```

This is the *only* probability model any archetype uses, and it is the same one whichever seat is
computing it. It assumes nothing about the opponent's play, which is precisely why it is
implementable and unit-testable without an opponent model.

### 3.2 The signature — the anti-cheat discipline, extended verbatim

§9.7 of the redesign made the *absence of a `playerDice` parameter* the enforcement mechanism
against a cheating dealer. That discipline extends to the new entry point without exception:

```ts
export function archetypeMove(input: {
  /** CONCRETE, never 'mixed' — a mix is resolved at open (§3.6) and stored. */
  archetype: 'optimal' | 'bad' | 'random';
  dealerDice: readonly number[];
  dicePerSide: number;
  maxQuantity: number;
  /** Never null: the roster dealer, like the roaming dealer, is never asked to move
   *  before the player's opening bid (§9.9 ruling 1). A null throws. */
  bid: DareBid;
  ante: number;
  headroom: number;
  dealerCredits: number;
  /** ESCROW, and PUBLIC — both pots ride every DareBidPlaced event, so reading them
   *  is not hidden information. Needed because EV is a function of the pot. */
  potPlayer: number;
  potDealer: number;
  /** 0..99, drawn by the CALLER from the action's forked rng. Keeps the policy a
   *  total function of its inputs. */
  roll: number;
}): DareMove;
```

**There is no `playerDice`, no `GameState` and no `DareHandState` in that input, and that is the
enforcement.** The function cannot read the player's hand because it cannot express it. **T-145**
owes the same behavioural test `liarsDice.test.ts` already applies to `dealerMove`: vary the
player's hidden dice across many values, hold everything else fixed, and assert the emitted move
sequence never moves. (T-145, not T-146: the archetype policies are T-145's deliverable — §8's
task column, rows 9a and 23.)

`dealerDice` is `readonly` for the same reason as before — the policy reads the house's own hand
and may not rearrange it.

Legality is asked of `legalMovesFrom(...)` and nowhere else, so §5.4's "one definition of
legality" survives a second consumer.

### 3.3 OPTIMAL — an expected-value argmax

Deterministic. Draws no rng (the `roll` is ignored, and that is fine: the caller draws exactly one
per move regardless, which is what keeps the draw sequence uniform across archetypes — §3.7).

Let `potPlayer` / `potDealer` be the current escrow, `pTrue = pTrue(bid.quantity, bid.face)` the
probability the standing claim is true, and `c_m` the nominal cost of a candidate raise.

```
EV(challenge) = (1 - pTrue) * potPlayer  -  pTrue * potDealer
EV(fold)      = -potDealer
EV(raise m)   = pOurs(m) * potPlayer  -  (1 - pOurs(m)) * (potDealer + c_m)
                where pOurs(m) = probAtLeast(q_m - ownOf(f_m), dicePerSide)
```

**The candidate raises are the cheapest lattice step only** — three of them:

| move | claim | cost |
| --- | --- | --- |
| `raise-quantity` | `(q + 1, f)` | `ante` |
| `raise-face` | `(q, f + 1)` | `ante` |
| `raise-both` | `(q + 1, f + 1)` | `2 × ante` |

*The dominance proof, so nobody "improves" this by searching the whole lattice:* a `raise-quantity`
to any `q' > q` costs exactly `ante`, flat in `q'`, while `pOurs` is monotone non-increasing in
`q'` (`probAtLeast(k, u)` is non-increasing in `k`). `EV` is monotone increasing in `pOurs` at
fixed cost. Therefore every `q' > q + 1` is weakly dominated by `q' = q + 1`, and the same argument
applies to the quantity component of `raise-both`. The face component is already pinned to exactly
`+1` by §5.2's exploit fix. So the search space is provably three candidates, not `O(maxQuantity)`,
and the policy is O(1).

**Pick the argmax over `{challenge, fold} ∪ {legal raises}`.** Ties are broken by a fixed total
order so the policy is a total function of its inputs and its unit tests are stable:

```
challenge  >  raise-quantity  >  raise-face  >  raise-both  >  fold
```

**The model assumption, stated rather than hidden:** a raise is valued *as if the opponent
challenges it immediately*. This is a conservative, model-free valuation — it needs no belief
about how the player plays, which is exactly why "optimal" here means "optimal against the
information it has" and not "solves the game". Say so in the code comment. It is honest, it is
testable, and it is a genuinely strong policy: it will not over-challenge a claim that
`probAtLeast` says is likely true, which is the specific failure F-137-1 named on the roaming path.

**Restriction that falls out:** `optimal` folds only when `-potDealer` beats every alternative,
which requires `pTrue` to be very high *and* every raise to be unaffordable or worse. It is rare
but reachable, and it must not be special-cased away.

### 3.4 BAD — a specified leak, not "worse random"

`bad` plays as though the other side of the table were blank — it reasons only from its own dice
and never credits the unknown dice with anything. This is the classic beginner leak and it is
*legible*: a player who watches a `bad` opponent will learn to make tall true claims and let them
call.

```
BAD_CREDULITY = 1

1. If  bid.quantity - own > BAD_CREDULITY  and 'challenge' is legal  ->  challenge
2. Else the cheapest legal raise, in lattice order:
      raise-quantity -> raise-face -> raise-both
3. Else challenge
```

**`bad` NEVER FOLDS**, and that is a property with a test obligation, not an accident: `challenge`
is unconditionally legal whenever a bid stands (§5.1), so branch 3 is always available and the
fold branch is unreachable. **T-145** owes an assertion of this over a large randomised input
sweep (§8 row 9a's owner, not T-146).

Note the deliberate asymmetry with `optimal`: with 4 dice per side the unknown side contributes
`4/6 ≈ 0.67` expected matches, so `bad`'s threshold of "more than 1 over my own count" makes it
challenge true claims constantly at low quantities. That is the leak. It is worth roughly the
`unknownExpectation` term, every hand, which is what makes seat 1 the easy seat.

### 3.5 RANDOM — uniform over the legal set

```
moves = legalMovesFrom(bid, ante, headroom, dealerCredits, /* peekUsed */ true, maxQuantity)
index = Math.floor((roll / 100) * moves.length)
```

A raise kind takes the cheapest lattice step, exactly as the table in §3.3. `random` therefore uses
the **one already-drawn `roll`** and needs no additional rng draw, which is what keeps the
per-move draw count identical across all three archetypes and across both pools (§3.7).

`random` is genuinely uniform — including over `fold`, which means it is the only archetype that
hands the player a free pot at meaningful frequency, and also the only one that will challenge a
claim it should believe. Unreadable in both directions. That is the point.

### 3.6 MIXED — resolved ONCE PER HAND, at open

**Ruling, with its reason:** a mixed opponent that re-rolls its personality on every move is not
"unpredictable", it is *noise* — the player cannot learn anything from it within a hand, and
"Read the Table" (§4.5) would have nothing true to say. Resolving once per hand makes a mixed
opponent a genuine identity for the duration of a hand and a genuine unknown across a career.

```ts
/** Cumulative thresholds in the FIXED key order optimal, bad, random. The order is
 *  part of the contract: changing it changes every golden that contains a mixed
 *  hand. Returns a CONCRETE archetype; never 'mixed'. */
export function resolveMixedArchetype(mix: LiarsDiceMix, roll: number): 'optimal' | 'bad' | 'random';
```

```
roll < mix.optimal                 -> 'optimal'
roll < mix.optimal + mix.bad       -> 'bad'
otherwise                          -> 'random'
```

`roll` is `0..99`. Because the mix sums to exactly 100 (validator-enforced), the three branches
partition the range with no gap and no overlap, and the third branch needs no bound check.

The resolved concrete archetype is **stored on the hand** as `DareHandState.opponentArchetype`
(§5) and is what every subsequent move and the Read-the-Table line read. `opponentArchetype` is
never the string `'mixed'`.

### 3.7 The RNG draw-order ruling — load-bearing for the goldens

**T-145 states this explicitly in `actions/hangout.ts`'s comment** (it owns §8 rows 12 and 16a,
where the draws happen), because it is the reason the M4d day-loop goldens survive M4e:

**At open**, the roster path draws, in order: the player's `dicePerSide` dice, then the dealer's
`dicePerSide` dice, then — **only when `archetype === 'mixed'`** — exactly one archetype roll,
appended last. The roaming path's draw sequence is byte-identical to today's.

**Per move**, both paths draw exactly one `Math.floor(rng.next() * 100)`, before dispatch, whether
or not the chosen policy consumes it. `optimal` ignores it; the draw still happens. This is
deliberate: a policy-dependent draw count would make the rng stream depend on the archetype, and a
content edit to one opponent's archetype would then move every downstream number in the campaign.

At tier 0 with a roaming opponent, both sequences are exactly what M4d shipped, so the goldens are
provably inert until a roster hand or a ladder unlock actually occurs.

### 3.8 Pool B is untouched

`dealerMove` keeps its shipped body and its `DARE_AI_*` GUILE constants. A roster hand never calls
`dealerMove`; a roaming hand never calls `archetypeMove`. The dispatch is one branch on
`hand.opponentKind` in `actions/dare.ts` (§8 row 23).

*Why this matters:* T-137's 8,000-row baseline was measured against `dealerMove`. Leaving it
byte-identical is what makes T-148's pool-B numbers directly comparable to T-137's rather than a
fresh, uncomparable sample.

### 3.9 F-137-1, named and partly discharged

§16.2 filed **F-137-1**: the shipped `dealerMove` challenges claims that are true by construction,
producing the 94.66% / +737.53 cr result, and §16.8 recommended M4e as its home.

**This spec discharges F-137-1 on the roster path only, and says so rather than claiming more.**
`optimal` and `mixed`-resolving-to-`optimal` challenge on an EV comparison against a real
`probAtLeast`, so they do not make F-137-1's mistake; `bad` makes it *deliberately and by name*;
`random` makes it at chance. **The roaming path keeps F-137-1 unchanged**, because changing
`dealerMove` would (a) invalidate the T-137 baseline mid-milestone and (b) is a difficulty
retune that belongs to an owner call, not to a roster task.

**T-148 owes the split measurement** — win rate and EV per hand, reported separately for
`opponentKind: 'roster'` and `opponentKind: 'roaming'`, and per archetype within the roster. If
the roster's `optimal` seat does not measurably beat the `bad` seat, the policy is wrong and that
is a finding, not a tuning knob.

---

## §4 · The unlock ladder

### 4.1 Thresholds and the tier function

The ladder is driven by `player.liarsDiceGamesPlayed`: **cumulative settled hands, either pool**,
counted at the single settlement site (§8 row 20) so that folds, challenges and the dusk
`timeout-fold` all count and none can be missed.

```ts
/** Content owns the thresholds; the engine owns the arithmetic. */
export const LIARS_DICE_UNLOCK_GAMES = [5, 10, 20, 40, 80] as const;

/** Tier n is live at gamesPlayed >= LIARS_DICE_UNLOCK_GAMES[n-1]. */
export function liarsDiceTier(gamesPlayed: number): 0 | 1 | 2 | 3 | 4 | 5;
```

Threshold semantics, pinned so an off-by-one cannot be argued: the **settlement of the 5th hand**
increments the counter to 5, which makes tier 1 live for the **6th** hand. A hand's tier is frozen
at open (§4.6), so the 5th hand itself is played entirely at tier 0.

### 4.2 What each rung changes

| tier | `gamesPlayed` | what it changes |
| --- | --- | --- |
| 0 | 0–4 | `dicePerSide = 4`, `maxQuantity = 8`, ceiling = the port's `wager.max`, no Read |
| 1 | ≥ 5 | `dicePerSide = 5` ⇒ `maxQuantity = 10` |
| 2 | ≥ 10 | `dicePerSide = 6` ⇒ `maxQuantity = 12`. **Hard cap: six, forever** |
| 3 | ≥ 20 | **Read the Table** unlocked (§4.5) |
| 4 | ≥ 40 | wager ceiling = `band.max × LIARS_DICE_RAISED_CEILING_MULT` (= ×3) |
| 5 | ≥ 80 | the band clamp is removed entirely — both `min` and `max`. The solvency clamp stays |

### 4.3 The two derived rules

**`maxQuantityForDice(n) = 2 × n`.** The claim ceiling is and always was "every die in play". That
is exactly what the shipped `DARE_MAX_QUANTITY = 8` encodes at `n = 4`, so the rule is **provably
inert at tier 0** — the same behaviour-preserving-first discipline the N3 `combatRules.ts` extract
set. Split across the two owners per §8's task column: **T-145 lands the two pure functions**
(`dicePerSideForTier`, `maxQuantityForDice` — rows 1, 2, 9a) because its migration and its open arm
both call them, with the constants kept as their tier-0 values; **T-146 rewires the call sites**
(rows 3–8) in its own commit and demonstrates zero golden movement, *then* lets the tier move.

**`DARE_MAX_FACE` stays 6 at every tier — explicit ruling.** The task brief says "the
quantity/face caps become a function of live unlock tier"; that resolves to **quantity varies, face
does not**. Two reasons, both hard:

1. It is a d6. A seventh face is not a bigger die, it is a different game, and `SeededRng.d6` would
   have to become a parameterised roll for no gain the ladder asked for.
2. The closed exploit's search space (§5.2) is bounded by the face ladder's length. Widening the
   face range reopens the *search* for a face on which a risk-free chain still works, against a fix
   that was proven only over 1..6.

So: `dicePerSideForTier(tier)` and `maxQuantityForDice(n)` are functions; `DARE_MAX_FACE` remains
a constant, and a coder who "completes the symmetry" by making it a function is introducing a bug.

### 4.4 Tier 4's multiplier is 3 — justified

T-137 measured the Dare at a **94.66% win rate** and **+737.53 cr per hand**. At that win rate the
wager ceiling is not one brake among several, it is essentially the *only* brake: the per-hand EV
is close to linear in the stake. So the multiplier is the single most consequential number in this
document, and it is chosen against real bounds:

- **×2 is imperceptible.** A tier-4 unlock the player cannot feel is not a reward.
- **×5 puts a Regulus-6 / Rigel-8 hand at 15,000 cr** — larger than the *entire authored roster
  capital of two whole ports* (Denebola-5 4,800 + Mira-9 3,200 + Procyon-5 8,000 = 16,000). A
  single hand that can drain two ports of the gauntlet is not "increased bounded betting", it is
  the end of the bound.
- **×3 tops out at 9,000 cr**, which is the same order of magnitude as the ~4× spread already
  authored between the widest band (3,000) and one of the narrower ones (750). It is a real jump
  the player will feel and it stays inside the shape of the existing content.

**The second effect, recorded rather than discovered later:** `headroomFor` reads the same ceiling.
So ×3 does not only triple the *seed* — it triples **per-side whole-hand exposure**, which roughly
triples how many raises a hand can physically hold before a side runs out of headroom. Longer
hands mean more bids, more challenges, and a materially different hand shape. **T-148 owes the
measurement** (mean bids per hand at tier 0 vs tier 4; T-137's baseline was 1.19 bids/hand). This
is a consequence of the ruling, not a reason to change it.

### 4.5 "Read the Table" — exact copy

Unlocked at tier ≥ 3. Shown **at open, before the first bid**, riding `DareHandStarted` as an
optional `opponentRead?: string`.

| resolved archetype | line |
| --- | --- |
| `'optimal'` | **"This one plays it safe."** |
| `'bad'` | **"This one's reckless."** |
| `'random'` | **"Can't get a read on this one."** |

Two gaps in the owner's wording, settled here:

**Ruling 1 — mixed shows its RESOLVED arm's line.** The owner listed three phrases for four
labels. Because a mix is resolved once at open (§3.6), a mixed opponent *is* one of the three for
the duration of the hand, and the honest read is the resolved one. A consequence worth stating: a
mixed opponent may read differently from one hand to the next, which is exactly what makes a mixed
opponent unreadable over a career — at zero extra copy and with no lie ever told to the player.

**Ruling 2 — pool B gets a read too**, derived by rule from the profile's GUILE, because roaming
captains have no archetype:

```
npcGuile(npc) >= 4  ->  "This one plays it safe."
npcGuile(npc) <= 1  ->  "This one's reckless."
otherwise           ->  "Can't get a read on this one."
```

Without this, a tier-3 unlock would be **dead at the pool that supplies most of the player's
hands** — the player would unlock a feature and then not see it for days. The mapping is honest:
`DARE_AI_GUILE_BLUFF` and `DARE_AI_GUILE_PATIENCE` mean high GUILE bluffs more *and* challenges
sooner, so a high-GUILE dealer genuinely is the careful one and a low-GUILE dealer genuinely is the
loose one.

Both live in one pure function:

```ts
export function readTheTableLine(
  kind: 'roster' | 'roaming',
  archetypeOrGuile: 'optimal' | 'bad' | 'random' | number,
): string;
```

**Mathematically inert, restated:** Read the Table touches no dice, no count, no cost, no legality
and no probability. It is one string on one event. That inertness is exactly why it was chosen over
wildcards, and it must stay true — if a later task makes the read conditional on anything the
resolver computes, it has stopped being inert.

### 4.6 The tier is FROZEN AT OPEN — and this is what collapses the ripple

The hand stores its tier's *effects*, not the tier: `dicePerSide`, `maxQuantity` and `bandMax` are
written once at open and never recomputed (§5.3). `ante` and `systemId` are already frozen for
exactly this reason (§4.3 of the redesign).

*Why:* a save/reload, a content edit, or a settlement that crosses a threshold mid-scene must never
move the rules of a hand already in progress. A hand opened at 4 dice is a 4-dice hand until it
settles, even if the player's 5th game settles in between.

**This ruling is what turns the brief's alarming "every validation site needs to read the live
tier, not just the deal" into something tractable.** No validation site reads a live tier. Every
validation site reads a **frozen field on the hand it was already handed** — `hand.maxQuantity`
instead of the `DARE_MAX_QUANTITY` constant, `hand.bandMax` instead of `wagerBandFor(hand.systemId).max`.
The set of sites is finite, enumerated in §8, and each is a constant-to-field substitution rather
than a plumbing change.

**`liarsDiceTier` is called in exactly TWO places, and nowhere else:**

1. `actions/hangout.ts`'s `case 'dare'` open arm (§8 row 16b) — the one site that *freezes* a tier
   onto a hand.
2. `packages/ui/src/format.ts:417 dareWagerBounds` (§8 row 51) — the pre-hand wager input's bounds.
   This is the one legitimate live-tier read, and it is legitimate **precisely because there is no
   hand yet to read a frozen field off**: the player is choosing a stake before the hand exists.
   It is a display projection that decides nothing; the engine re-clamps at open regardless.

A third call site is a bug. If a site has a hand, it reads the frozen field.

### 4.7 The ante at high tiers

`anteFor` currently reads `wagerBandFor(systemId).max × DARE_ANTE_BAND_FRACTION`. It must take the
tier, because an ante that stays at 30 while the ceiling goes to 3,000 makes raises nearly free
relative to the pot and collapses the bid lattice into "always raise".

```
tier <= 3 : ceiling = band.max
tier == 4 : ceiling = band.max * LIARS_DICE_RAISED_CEILING_MULT
tier == 5 : ceiling = band.max * LIARS_DICE_RAISED_CEILING_MULT   <-- note
ante      = max(1, round(ceiling * DARE_ANTE_BAND_FRACTION))
```

**Tier 5's ante is computed from the TIER-4 ceiling, and this is the one place tier 5 is not "just
remove the clamp".** State it explicitly. An ante derived from an unbounded ceiling is undefined —
there is no number to take 3% of. Unlimited betting removes the *seed and exposure* clamp; it does
not and cannot remove the ante *scale*, which needs a finite reference. Freezing that reference at
the tier-4 ceiling is the only choice that is continuous with tier 4 (a player crossing 80 games
sees their ante stay put rather than jump or vanish).

### 4.8 Tier 5's headroom

```
headroomFor(hand, side):
    if hand.bandMax === null  ->  Number.MAX_SAFE_INTEGER
    else                      ->  max(0, hand.bandMax - potFor(side))
```

`bandMax === null` *is* the encoding of tier 5. `chargedAnte(nominal, headroom, actorCredits)`
already takes the min with the actor's credits, so removing the band clamp leaves the **solvency
clamp as the sole ceiling with no signature change to `chargedAnte` at all** — the existing
function was already written to make this work.

**The invariant T-146 must assert, at every tier including 5:** neither side's escrow contribution
can ever exceed that side's actual credits, and neither side's credits can go negative, at any
point in a hand. This is the whole content of the owner's "the pot can never literally run away".

At tier 5 the band's **`min` is removed too** (the owner's wording: "remove the port's wager-band
MIN/MAX clamp"). So the seed becomes `max(0, min(requested, player.credits, opponentCredits))` with
no floor — a veteran may sit down at Regulus-6 for 10 credits if they want to. That is intentional:
the floor existed to stop a captain playing beneath a house's dignity, and a captain 80 games in has
earned the right to.

---

## §5 · The save shape — ONE version bump, landed entirely by T-145

**`CURRENT_SAVE_VERSION: 14 → 15.` `MIGRATIONS[14]` is the only new migration in the whole
milestone.** T-146 and T-147 must not move the version. This is the ruling that stops two parallel
tasks racing.

### 5.1 On `PlayerState`

```ts
/** T-145 · Roster opponent ids the captain has beaten, in FIRST-DEFEAT ORDER.
 *  A SET semantically, an array physically — no duplicates, ever. POOL A ONLY
 *  (§1 rule 3): a win over a roaming captain is never written here. */
liarsDiceBeaten: string[];

/** T-145 · Every settled Liar's Dice hand against EITHER pool. Integer >= 0.
 *  Drives the unlock ladder (§4). Incremented at exactly one site (§8 row 20). */
liarsDiceGamesPlayed: number;
```

Order matters and is worth keeping: `liarsDiceBeaten` is first-defeat order, not sorted and not
insertion-order-by-id. It is a career record, the UI can render it as one, and a sort would destroy
information for no gain.

### 5.2 At the root of `GameState`

```ts
/** T-145 · Live purse per roster opponent, keyed by `LiarsDiceOpponent.id`. §7. */
liarsDicePurses: Record<string, number>;
```

**Ruling, with its reason:** these balances are **not the captain's property** — they belong to the
counterparties. They sit at the root of `GameState`, beside `npcs` and `dareHand`, not on
`player`. `npcs[].credits` is the exact precedent: a roaming dealer's purse is not on the player
either. This is the "one map, keyed by opponent id" the owner's ruling asked for.

`cloneState` needs **no change** for it: `clone.ts` is a JSON round-trip of everything except
`eventLog` and `npcs`, so a new plain-data root field is deep-copied for free. State this in the
migration comment so nobody adds a clone branch — a hand-written clause there would be exactly the
aliasing bug that module's header warns about (the `MIGRATIONS[13]` comment says the same thing
about `dareHand`).

### 5.3 On `DareHandState` — five new fields, ALL landed by T-145

```ts
/** Which pool the counterparty came from. Decides money routing (§7), disposition
 *  (§7.6), the policy dispatch (§3.8) and the beaten-set write (§6). */
opponentKind: 'roaming' | 'roster';

/** The CONCRETE archetype for this hand, resolved once at open (§3.6). Never the
 *  string 'mixed'. NULL iff `opponentKind === 'roaming'`. */
opponentArchetype: 'optimal' | 'bad' | 'random' | null;

/** FROZEN tier value: 4 | 5 | 6. The length of BOTH dice arrays. */
dicePerSide: number;

/** FROZEN: 2 * dicePerSide. The claim ceiling every legality site reads. */
maxQuantity: number;

/** FROZEN effective wager ceiling for this hand. NULL === tier 5, unlimited —
 *  `headroomFor` returns MAX_SAFE_INTEGER and the solvency clamp is the only cap. */
bandMax: number | null;
```

### 5.4 The migration body

One function. **It calls rules; it restates none.**

```
MIGRATIONS[14] = (v14State) => {
  1. player.liarsDiceBeaten      ??= []
  2. player.liarsDiceGamesPlayed ??= 0
  3. liarsDicePurses = seedLiarsDicePurses(v14State.liarsDicePurses)
  4. if (dareHand !== null) backfill its five new keys at tier-0 values
}
```

**Steps 1 and 2 are statements of FACT about a v14 save, not defaults.** A v14 save was written by
an engine in which no roster existed, so "this captain has beaten nobody in the roster" and "this
captain has played zero Liar's Dice hands under the new counter" are *true of that save* rather
than values the migration is picking. That is `MIGRATIONS[12]`'s and `MIGRATIONS[13]`'s own
wording, reused deliberately.

**Step 3 discharges the house rule** ("a migration calls a rule, it never restates one") the way
`MIGRATIONS[11]` did with `emptyDeedRegistry`:

```ts
/**
 * The full roster purse map, derived from the AUTHORED bankrolls. PURE: returns a
 * new object and mutates nothing.
 *
 * PRESERVES EVERY EXISTING KEY. That is what makes it idempotent AND what makes a
 * later content pass that adds a 4th opponent to a port need no further save
 * version — the loader's backfill path picks the new id up with its authored
 * bankroll and leaves every played-down balance exactly where it was.
 */
export function seedLiarsDicePurses(existing?: Record<string, number>): Record<string, number>;
```

Called from **three** places, deliberately: `MIGRATIONS[14]`, `createInitialState`, and
`deserializeState`'s backfill path.

**Step 4** backfills an *open* v14 hand at tier-0 values, again by calling rules rather than
restating literals:

| key | value | why |
| --- | --- | --- |
| `opponentKind` | `'roaming'` | true by construction — no roster existed at v14 |
| `opponentArchetype` | `null` | required to be null for a roaming hand |
| `dicePerSide` | `dicePerSideForTier(0)` | not the literal `4` |
| `maxQuantity` | `maxQuantityForDice(dicePerSide)` | not the literal `8` |
| `bandMax` | `wagerBandFor(hand.systemId).max` | not a literal; the hand's frozen port governs |

Idempotent: a state that already carries the keys keeps them exactly, hidden dice and escrow
included.

### 5.5 The round-trip test obligation

The `dareHand` precedent T-135 set, applied to both branches of step 4:

1. A v14 fixture with **no open hand** → migrate to v15 → serialize → deserialize → assert
   field-for-field equality, `liarsDiceBeaten === []`, `liarsDiceGamesPlayed === 0`, and a
   `liarsDicePurses` map with **42 keys whose values equal the authored bankrolls**.
2. A v14 fixture with a **mid-hand open `dareHand`** (a standing bid, non-zero escrow on both
   sides, `peekUsed: true`, a non-empty `history`) → migrate → round-trip → assert the five new
   keys carry the tier-0 values above **and that every pre-existing key is byte-identical**, escrow
   and hidden dice included.
3. Idempotency: running `MIGRATIONS[14]` twice produces the same object as running it once.

### 5.6 Version-race rulings — these are blockers, not advice

> **THE ONE AUTHORITY ON WHO EDITS WHAT is §8's `task` column.** Every row of the ripple carries
> exactly one owner there. This subsection and §11 *cite* that column; neither restates it. If a
> future edit makes them disagree, **§8 wins** and the disagreeing text is the bug.
>
> *Why this is spelled out:* the first draft of this document stated ownership in three places
> (a prose ruling here, a file-level table here, and a per-row list in §11) and they were cut three
> different ways — §11 handed `actions/hangout.ts`'s open arm to T-146 while Ruling A required
> T-145 to write it. A spec whose own ownership statements contradict each other leaves the cut to
> the coder's judgement, which this document's opening line forbids. One column, cited everywhere.

**Ruling A — T-145 lands the ENTIRE `DareHandState` shape**, writing a value for all five new
fields at **every** open, roaming hands included. T-145 therefore *owns §8 row 16* (the
`nextState.dareHand = { … }` literal) — a schema key and a migration alone cannot make a
newly-opened hand carry a field; only the open-arm literal can.

T-145 is *behaviour-preserving **on the ladder axis***, and only on that axis:

- `opponentKind` / `opponentArchetype` are written at their **real** values from the first commit,
  because T-145 is the task that introduces pool A at all (its Accept criteria require roster
  opponents to be reachable, playable and zero-sum).
- `dicePerSide` / `maxQuantity` / `bandMax` are written at **tier-0** values —
  `dicePerSideForTier(0)`, `maxQuantityForDice(…)`, `wagerBandFor(hand.systemId).max` — which are
  exactly the numbers the shipped engine already computes. The fields exist, the schema pins them,
  the migration backfills them, and nothing observable moves.

**T-146 then changes exactly one thing about row 16: where those three ladder values come from**
(`liarsDiceTier(player.liarsDiceGamesPlayed)` instead of the literal `0`), plus what
`liarsDiceTier` returns. It adds **no schema key, no migration, no version move** — which is what
keeps T-146's stated "no save-shape change here" Accept criterion true. Row 16 is therefore split
`16a` (T-145, the five keys) / `16b` (T-146, the tier source); see §8.

**Ruling B — adding a `GameEvent` variant is NOT a save-version change.** T-147 adds
`LiarsDiceSetCleared` (§6). `GameEventSchema` runs in Zod **strip** mode by design, so the
append-only `eventLog` is forward-compatible; the only obligation is the compile-time
discriminator-set and `AssertEqual` guards in `schema.ts`. **Say this in T-147's task, explicitly** —
otherwise a careful coder will reasonably bump the version and race T-146.

Adding an **optional field to an existing variant** (`DareHandStarted.dicePerSide`,
`.opponentRead?`, `.opponentLine?`; `DareHandResolved.opponentLine?`) is not a version change
either, for the same strip-mode reason and the same guard obligation.

**Ruling C — the new `HangoutFailReason` member is also not a version change**, but it *is* a
two-file edit: `HangoutFailReason` in `types.ts` **and** the `z.enum` in `schema.ts` that
`_covHangoutFailReason` pins **value-for-value** (not key-for-key). The type comment already warns
that `AssertEventKeys` would sail past a missed value and the save would fail to parse at load.

**Both edits land in T-145** (§8 row 30b), *not* T-147. `'opponent-broke'` is the refusal the broke
rule emits (§7.4), and the broke rule is a T-145 Accept criterion ("the broke-opponent rule behaves
per spec (asserted)"). The fail reason cannot ship in a later task than the refusal that raises it.

**Ruling D — the in-file conflict split between T-146 and T-147.** They do not race on
`CURRENT_SAVE_VERSION`, and after Rulings A and C they no longer share a file *except*
`actions/dare.ts`'s `settleDareHand` tail, which all three tasks touch in sequence:

| task | its edit to `settleDareHand` (`dare.ts:83`) |
| --- | --- |
| **T-145** | pot credit via `payOpponent`; `applyDisposition` skipped for roster with `dispositionDelta = 0`; §6.2 **step 1 only** — the `liarsDiceBeaten` push and its early stop, recording the result in a local `justBeaten: boolean` |
| **T-146** | one line: `player.liarsDiceGamesPlayed += 1`, at this single settlement site |
| **T-147** | §6.2 **steps 2–3 only** — `if (justBeaten)`, the set-closure arithmetic and the one or two `LiarsDiceSetCleared` emissions |

T-146 and T-147 are declared parallel-safe by TASKS.md. Their two edits above are to **disjoint,
non-adjacent statements** of a function T-145 has already restructured, so a merge is mechanical.
If the orchestrator cannot honour that, **run them sequentially** — T-147 second, since its
`if (justBeaten)` block reads a local T-145 introduced and T-146 does not move.

---

## §6 · The completion signal, and the fifteen deeds

### 6.1 One event type, one `scope` discriminator

```ts
| {
    type: 'LiarsDiceSetCleared';
    day: number;
    /** 'port' = all three of one port's roster seats beaten.
     *  'roster' = all 42 beaten. */
    scope: 'port' | 'roster';
    /** The port cleared. For scope:'roster', the port of the final win. */
    systemId: number;
    /** The opponent whose defeat closed the set. */
    opponentId: string;
    /** `liarsDiceBeaten.length` AFTER the write — 3,6,…42 for port scope, 42 for roster. */
    beatenCount: number;
  }
```

A second event type (`LiarsDicePortCleared` + `LiarsDiceRosterCleared`) was considered and
rejected: it would need a second `EVENT_PATHS` entry, a second schema variant and a second guard,
for no expressive gain over a two-value discriminator.

### 6.2 The emission rule — one-time BY CONSTRUCTION

Inside `settleDareHand`, and **only** there (§8 row 20), on a hand with `opponentKind: 'roster'`
whose outcome is a player win (`challenge-win` or `dealer-fold`):

```
1. If  hand.dealerId is NOT in player.liarsDiceBeaten  ->  push it, justBeaten = true.
   IF THE PUSH DID NOT HAPPEN, EMIT NOTHING AND STOP.
2. If justBeaten AND all 3 of that port's authored opponents are now in the
   set  ->  emit { scope: 'port', systemId: hand.systemId, … }.
3. If additionally all 42 authored opponents are in the set
   ->  emit { scope: 'roster', … } as a SECOND event in the same batch.
```

**Split across two tasks, per §8 rows 20d and 20e — this is deliberate and not a seam to close.**
**T-145 owns step 1**, because "beating a roster opponent records them in `liarsDiceBeaten` exactly
once (a rematch win does not duplicate, asserted by a test)" is a T-145 Accept criterion and the
beaten set is the state T-147 is defined to *read*. It lands the push, the early stop, and the
`justBeaten` local. **T-147 owns steps 2–3** — the closure arithmetic and the emissions — added
under `if (justBeaten)`. Between the two tasks the beaten set is correct and simply nothing fires;
that intermediate state is coherent and shippable, which is what makes the split legal.

Step 1's early stop is the whole mechanism. It makes a **rematch win silent**, which is precisely
what T-147's "not once per remaining game against the roaming pool" requires — and note that a
roaming win never reaches step 1 at all, because the roster branch is gated on `opponentKind`.

Step 3 is a *second* event in the same batch, not a replacement: the 42nd win legitimately closes
both its port and the roster, and both deeds must fire. Order is port-then-roster, so the wire
reads in the order a player experiences it.

### 6.3 The `EVENT_PATHS` addition — exactly two paths

```ts
LiarsDiceSetCleared: ['scope', 'systemId'],
```

Against `deeds.test.ts`'s three guards, individually:

- **Guard (a)** (`:810-828`, every deed's `eventType` must be allowlisted): without this entry all
  15 new deeds would be **dead content** — they would compile, validate, render in the Registry
  preview, and never fire. The entry is mandatory.
- **Guard (b)** (same block, every matcher path allowlisted for its type): `scope` is what the
  roster-clear deed matches on; `systemId` is the **port-discriminating** path the ×14 deeds need.
  Both are named by real deeds, so both must be listed.
- **Guard (c)** (`:893-905`, the reverse — no orphan `EVENT_PATHS` **key**): satisfied, because 15
  deeds name `LiarsDiceSetCleared`. **Note for accuracy:** guard (c) checks *keys*, not individual
  paths, so listing `opponentId` and `beatenCount` would not red anything. They are still
  **deliberately omitted** — an allowlist should grant exactly what a matcher names and nothing
  more, and the event is free to carry fields no matcher may reach. That is the correct minimal
  grant, and the reason is discipline rather than a failing test.

**This is an allowlist entry, not a matcher-DSL change.** No change to `matchesEvent`, `readPath`,
`FieldMatcher`, `DeedTrigger` or `STATE_PATHS`.

### 6.4 The fifteen `DeedDefinition` entries

In `packages/content/src/deeds.ts`. **No `count` on any of them** — the event already means "the
set closed", so a count would be a second, redundant gate.

Fourteen port-clears:

```ts
{
  id: 'liars_dice_cleared_<slug>',
  trigger: {
    eventType: 'LiarsDiceSetCleared',
    match: [ { path: 'scope', equals: 'port' }, { path: 'systemId', equals: <N> } ],
  },
  citationTemplate: /* names the port's authored `prose.houseName`, in its voice */,
}
```

| systemId | slug | house named in the citation |
| --- | --- | --- |
| 1 | `sun_3` | the Long Table |
| 2 | `aldebaran_1` | the Weighbridge |
| 3 | `altair_3` | the Waypost |
| 4 | `arcturus_6` | the Garrison Mess |
| 5 | `deneb_4` | the Standing Hall |
| 6 | `denebola_5` | the Incident Book |
| 7 | `fomalhaut_2` | the Fittings |
| 8 | `mira_9` | the Dry Tank |
| 9 | `pollux_7` | the Turnaround |
| 10 | `procyon_5` | the Bonded Room |
| 11 | `regulus_6` | the High Table |
| 12 | `rigel_8` | the Underhold |
| 13 | `spica_3` | the Second Watch |
| 14 | `vega_6` | the Long Room |

And one whole-game clear:

```ts
{
  id: 'liars_dice_grand_slam',
  trigger: {
    eventType: 'LiarsDiceSetCleared',
    match: [ { path: 'scope', equals: 'roster' } ],
  },
}
```

### 6.5 THE TRAP — `deed-coverage.test.ts`, and it must not be loosened

`packages/sim/src/__tests__/deed-coverage.test.ts` asserts, across 65 seeds × 300 days:

1. **every** authored deed is earned by *some* career (`ALL_DEED_IDS` is derived from `DEEDS`, so
   the 15 new ids are picked up automatically), and
2. **≥ 2** careers earn the *whole* slate in one life.

**Adding 15 deeds reds both assertions** unless `packages/sim/src/__tests__/support/deed-hunter.ts`
is taught to clear the roster. This is not a hypothetical — it is the single most likely way T-147
ends up red.

**The assertions must not be loosened, scoped, banded or excluded.** That is the standing
constraint ("never edit a fingerprint/band/threshold/golden to make a test pass"). T-147 therefore
owes, as part of its own scope:

- a `deedHunterPolicy` branch that **tours the 14 `hasHangout` ports** and, at each, plays each of
  the 3 roster seats until beaten (skipping any already in `liarsDiceBeaten`, and skipping a broke
  opponent per §7.4);
- **15 new `HUNTER_TARGET_DEED_IDS` entries**, which the existing "the hunter steers for deed ids
  that actually exist" drift guard will then check against content;
- **a re-pin of the seed range and/or the 300-day horizon with fresh provenance** if 300 days no
  longer suffices. A re-pin with a written provenance block is sanctioned by the file's own
  precedent (T-1603b re-pinned seeds 1 and 7 → 1 and 6). A *widened assertion* is not.

**Feasibility, so the coder knows this is achievable and does not reach for the loosening:** at
T-137's measured 94.66% win rate, beating 42 opponents takes ≈ 45 hands in expectation. The
gambler policy already plays up to `GAMBLER_MAX_DARES_PER_DAY = 2` per day, so that is ~23 play-days
plus a 14-port tour. Comfortably inside a 300-day horizon. If the *roster* win rate turns out to be
much lower than 94.66% (which it should be — that is the point of the `optimal` seat), the horizon
math is the thing to re-check first.

### 6.6 `RENOWN_DEED_THRESHOLDS.CONQUEROR` — report, do not retune

`CONQUEROR = 38` against a slate growing **44 → 59**. The `CONQUEROR <= DEEDS.length` structural
guard still holds with far more room than before, and the 44 non-dice deeds still reach 38 on their
own, so **nothing breaks**. But the ladder becomes materially easier for a dice-playing captain: 15
of the 59 deeds are now reachable from one verb.

**Report it in T-148's capstone; do not retune it in T-147.** A threshold rescale mid-milestone
would invalidate the very measurement that should decide whether it needs rescaling, and the
threshold's own comment records that it was sized off a measurement rather than a feel. T-148 owes:
the day on which a dice-playing career crosses 38 vs a non-dice career, over the sweep.

---

## §7 · The persisted purse, the broke rule, and the no-regeneration theorem

### 7.1 Zero-sum, per the owner ruling

A roster hand debits and credits `state.liarsDicePurses[opponentId]` at **exactly the three sites**
a roaming hand debits and credits `NpcState.credits`:

| site | roaming today | roster |
| --- | --- | --- |
| the seed, at open | `mutableNpc(state, dealerId).credits -= seedWager` | `liarsDicePurses[id] -= seedWager` |
| each dealer ante, in `placeBid` | `mutableNpc(...).credits -= antePaid` | `liarsDicePurses[id] -= antePaid` |
| the pot, in `settleDareHand` | `mutableNpc(...).credits += pot` | `liarsDicePurses[id] += pot` |

**The roster is never a mint.** Every credit the player takes off a roster opponent came out of
that opponent's authored bankroll, and §2.6's 280,800 cr is the lifetime cap.

The branch is confined to two new exported helpers in `actions/dare.ts` (§8 row 18) —
`opponentCredits(state, hand)` and `payOpponent(state, hand, delta)` — which are the **only two
places in the engine where `opponentKind` is branched on for money**. They live in `dare.ts`
rather than `liarsDiceRules.ts` because that module's header forbids state mutation; there is no
import cycle, because `dare.ts` does not import `hangout.ts`.

### 7.2 The solvency clamp reads the LIVE balance

```
cap = min(effectiveMax, player.credits, opponentCredits(state, hand))
```

Identical clamp algebra to today's, with the third term resolved by kind. Same for the dealer-side
`chargedAnte` legality check inside `legalMovesFrom` — which already takes `actorCredits` as a
parameter, so it needs no change at all beyond being *passed* the right number.

This is what makes tier 5's "unlimited betting" keep a real cap against the roster: a Mira-9
journeyman with 600 cr caps the hand at 600 cr no matter how many games the captain has played.

### 7.3 Sitting down, clamped — one rule, no new branch

An opponent with a live purse **≥ 1** sits, at whatever the clamp permits — **including below the
port's `band.min`**. This is not a new rule and not a concession: it is *already today's behaviour*
for a poor roaming dealer, because the shipped clamp is
`Math.max(0, Math.min(Math.max(requested, band.min), cap))` and `cap` can be under `band.min`.
Nothing changes.

### 7.4 BROKE = live purse ≤ 0 → they refuse to sit

A `VisitHangout{venue:'dare'}` naming a roster opponent whose live purse is `<= 0` is refused with
a typed event:

```ts
{ type: 'HangoutEvent', day, venue: 'dare', opponentId, failReason: 'opponent-broke' }
```

- `'opponent-broke'` is a **new `HangoutFailReason` member**. Two-file edit (§5.6 ruling C): the
  union in `types.ts` and the value-for-value `z.enum` in `schema.ts`. No save-version change.
  **Both edits land in T-145, with this refusal** — a fail reason cannot ship later than the
  refusal that raises it.
- Placed **before `spendDie`**, alongside the other pre-spend refusals (`no-opponent`,
  `venue-not-offered`, `dare-hand-open`). A refusal must never burn a dawn die — that is the
  invariant every existing refusal in that function upholds.
- The UI greys the row and shows the reason (§8 row 46).

### 7.5 They do NOT regenerate. Ever. — and the theorem that makes it safe

**Permanent ruling, in §5.5's register alongside the wildcard exclusion.** Regeneration is a mint,
and the owner's ruling is that the roster is zero-sum with the player. A regenerating purse would
also make the 280,800 cr cap meaningless, which would make T-148's measurement meaningless.

The obvious objection is "then a player can lock themselves out of an achievement". They cannot,
and here is the proof, written out because it is the load-bearing argument for the whole ruling:

> **Theorem.** No port-clear or roster-clear deed can ever be locked out by the purse rule.
>
> **Proof.** A roster opponent's purse changes only through the three sites of §7.1, and the only
> one that *decreases* it net over a whole hand is losing the pot in `settleDareHand` — the seed and
> ante debits are matched by the pot credit whenever the opponent wins. Therefore a roster
> opponent's purse can fall below its authored bankroll only by **losing hands to the player**.
> Every player win over a roster opponent writes that opponent's id into `liarsDiceBeaten` (§6.2
> step 1, which is unconditional on the first such win). Therefore
>
>   `purse < bankroll  ⟹  the opponent has lost at least one hand  ⟹  id ∈ liarsDiceBeaten`
>
> and a fortiori `purse ≤ 0 ⟹ id ∈ liarsDiceBeaten`. **Broke implies beaten.** So the beaten set
> already contains every broke opponent, and no completion set can be short an opponent the player
> is now unable to play. ∎
>
> **Precondition:** the opponent must be able to sit at least once, i.e. `bankroll ≥ 1`. §2.6
> guarantees the far stronger `bankroll ≥ wagerBandFor(systemId).min` at every row, and the content
> validator (§8 row 37) asserts it so a later content pass cannot break the theorem's foundation.

**T-145 writes the theorem into the code comment at the broke-refusal site** (§8 row 11), because
T-145 lands that refusal. A future reader who finds a "broke opponent" refusal with no regeneration
will otherwise reasonably assume it is a bug.

Note the theorem's dependency direction, which is what forces §6.2 step 1 into T-145 alongside the
refusal: the proof's load-bearing step is "every player win over a roster opponent writes that
opponent's id into `liarsDiceBeaten`". If the broke refusal shipped in a task where the beaten-set
write did not yet exist, the lockout the theorem rules out would be **real** for the duration of
that gap. They ship together or the theorem is false.

### 7.6 Roster hands apply NO disposition

Disposition lives on `NpcState`. Pool A is outside the NPC economy entirely (Rule 1), so there is
no record to move. `applyDisposition` is **skipped** when `opponentKind === 'roster'`, and
`DareHandResolved.dispositionDelta` is `0`.

**A consequence, recorded rather than discovered:** this creates a new class of Liar's Dice hands
that emit **no `DispositionChanged` at all**. §7.5 of the redesign made T-125's interceptor-lift
property a named comparability obligation ("one `applyDisposition` call per hand, same cadence as
the old single-check Dare"). That property is now measured against a **changed hand mix**, because
roster hands are silent on the disposition axis. **Handed to T-148**, which owes the interceptor
lift split by `opponentKind` and must not read a drop as a regression without that split. Not tuned
here.

### 7.7 The terminal `HangoutEvent` still fires for roster hands, unchanged in shape

§10.3's nine shipped readers — four content deeds, `HangoutPlayStats` (the instrument T-137
measured with), `high_roller`, `table_regular`, the Hangout pane — all key on it, and none of them
should learn about the roster.

**Consequence:** `hangoutPlay.netCredits` now mixes both pools into one number. **T-148 must split
its measurement by `opponentKind`** or it will report a blended figure that describes neither pool.
The split is available: `DareHandResolved` and the hand both carry `opponentKind`, and the
`HangoutEvent`'s `opponentId` is `ld-`-prefixed for pool A, so the split is derivable from the
event log alone with no new field.

---

## §8 · The ripple, enumerated by file and function

This is a checklist, not prose. Every row is a concrete edit site, named by file and symbol. Line
numbers are given where they were stable at HEAD on 2026-07-31 and are a navigation aid, not a
contract.

> **THE `task` COLUMN IS THE SINGLE AUTHORITY ON OWNERSHIP.** §5.6 and §11 cite it; they do not
> restate it. Every row has exactly one owner. Where a site is genuinely edited by more than one
> task, the row is **split into lettered sub-rows with one owner each** rather than listed twice —
> a shared row is how the first draft of this document ended up contradicting itself.
>
> The owners are derived from **TASKS.md's Accept criteria**, which are the contract this spec
> serves. The rule that settles every case: *a task owns every site its own Accept criteria cannot
> be satisfied without.* T-145's criteria demand reachable roster opponents, working archetype
> policies, a zero-sum purse, a live-balance solvency clamp, a broke rule and an exactly-once
> beaten write — so T-145 owns those sites, even where they sit in a file whose ladder-axis edits
> belong to T-146.

### `packages/engine/src/liarsDiceRules.ts`

| # | task | site | change |
| --- | --- | --- | --- |
| 1 | **T-145** | `DARE_MAX_QUANTITY` (`:79`) | the function `maxQuantityForDice(dicePerSide)` lands here; the constant **stays**, redefined as its tier-0 value. Provably inert (§4.3) |
| 2 | **T-145** | `DARE_DICE_PER_SIDE` (`:84`) | the function `dicePerSideForTier(tier)` lands here; the constant **stays**, redefined as `dicePerSideForTier(0)`. Provably inert. T-145 needs both functions: its migration (§5.4 step 4) and its open arm (row 16a) call them |
| 3 | **T-146** | `legalMovesFrom` (`:130`) | new `maxQuantity` param; `:151`'s `quantityRoom = bid.quantity < DARE_MAX_QUANTITY` reads it |
| 4 | **T-146** | `legalDareMoves` (`:114`) | passes `hand.maxQuantity` through |
| 5 | **T-146** | `isLatticeMove` (`:170`) | new `maxQuantity` param; the `quantity > DARE_MAX_QUANTITY` bound at `:179` reads it |
| 6 | **T-146** | `headroomFor` (`:58`) | reads the hand's **frozen** `bandMax`, not `wagerBandFor(hand.systemId).max`; `null → Number.MAX_SAFE_INTEGER` (§4.8). Inert when it lands: T-145 wrote `bandMax` at exactly `wagerBandFor(systemId).max` |
| 7 | **T-146** | `anteFor` (`:48`) | new `tier` param; ceiling per §4.7, with tier 5 using the tier-4 ceiling |
| 8 | **T-146** | `dealerMove` (`:274`) | `unknownExpectation` at `:301` becomes `dicePerSide / DARE_MAX_FACE` (currently the constant `DARE_DICE_PER_SIDE`); `DARE_AI_FOLD_QUANTITY` at `:314` becomes `round(5 × dicePerSide / 4)`. **Both are provably inert at 4 dice**, which is what keeps T-137's baseline honest. Needs a `dicePerSide` input |
| 9a | **T-145** | new exports (pool A + the pure tier table) | `probAtLeast`, `archetypeMove`, `resolveMixedArchetype`, `liarsDiceOpponentFor(systemId, opponentId)`, `seedLiarsDicePurses`, `dicePerSideForTier`, `maxQuantityForDice`. This is §3 in full — the archetype policies are **T-145's** deliverable ("each archetype's policy is distinguishable by an actual behavioral test") |
| 9b | **T-146** | new exports (the ladder) | `liarsDiceTier`, `effectiveWagerBand(systemId, tier)`, `readTheTableLine` |

The module's PURE header contract is preserved across both rows — `seedLiarsDicePurses` returns a
new map and mutates nothing, and nothing in §3 or §4 touches a `GameState`, an rng or an event.

### `packages/engine/src/actions/hangout.ts` — `case 'dare'` (~`:264-330`)

| # | task | site | change |
| --- | --- | --- | --- |
| 10 | **T-145** | opponent resolution (~`:195`) | a **parallel** roster branch keyed on the `ld-` id namespace, **not** a replacement. The existing `!n.dead && n.currentSystemId === player.currentSystemId` filter still governs pool B, untouched |
| 11 | **T-145** | pre-spend refusals | the `'opponent-broke'` refusal (§7.4), placed with the other pre-`spendDie` refusals, carrying §7.5's theorem in its comment |
| 12 | **T-145** | the deal (~`:285`) | `playerDice` / `dealerDice` built from the hand's `dicePerSide` in a loop instead of the constant. **Player-first roll order preserved** (§3.7). Inert at tier 0, and it is what leaves T-146 nothing to do here |
| 13a | **T-145** | the clamp (~`:279`) | `dealerNpc.credits` → kind-resolved `opponentCredits(state, hand)` (§7.2 — "the solvency clamp reads the live balance", a T-145 Accept criterion) |
| 13b | **T-146** | the clamp (~`:279`) | `wagerBandFor(systemId)` → `effectiveWagerBand(systemId, tier)` |
| 14 | **T-146** | `anteFor(systemId)` (~`:294`) | → `anteFor(systemId, tier)` |
| 15 | **T-145** | the escrow debit (~`:289`) | `mutableNpc(...)` → kind-resolved `payOpponent` |
| 16a | **T-145** | the `nextState.dareHand = { … }` literal (~`:291`) | **all five new fields written** (§5.3). `opponentKind` / `opponentArchetype` at real values; `dicePerSide` / `maxQuantity` / `bandMax` at tier-0 values via `dicePerSideForTier(0)`, `maxQuantityForDice(…)`, `wagerBandFor(systemId).max`. §5.6 Ruling A — **a schema key and a migration cannot make a newly-opened hand carry a field; only this literal can** |
| 16b | **T-146** | the same literal | the tier source only: `liarsDiceTier(player.liarsDiceGamesPlayed)` replaces the literal `0`. One expression, no new key |
| 17a | **T-145** | `DareHandStarted` (~`:320`) | gains `dicePerSide` (the UI cannot render a hand without it) and `opponentLine?: string` — the roster opponent's authored `lines.tableTalk`, present iff roster (T-145 Accept: "catchphrases render at table-talk/win/lose per opponent"). **Still `playerDice` only** — §10.2's hidden-dice discipline is unchanged |
| 17b | **T-146** | `DareHandStarted` (~`:320`) | gains the optional `opponentRead?: string` at tier ≥ 3 (§4.5) |

### `packages/engine/src/actions/dare.ts`

| # | task | site | change |
| --- | --- | --- | --- |
| 18 | **T-145** | NEW | exported `opponentCredits(state, hand)` and `payOpponent(state, hand, delta)` — the **only** two places `opponentKind` is branched on for money (§7.1) |
| 19 | **T-145** | `placeBid` (`:179`) | the dealer ante debit routes through `payOpponent` |
| 20a | **T-145** | `settleDareHand` (`:83`) | pot credit via `payOpponent` (`:98`) — closes the zero-sum loop |
| 20b | **T-145** | `settleDareHand` (`:117`) | `applyDisposition` **skipped** for roster, with `dispositionDelta = 0` (§7.6) |
| 20c | **T-145** | `DareHandResolved` | gains `opponentLine?: string` — the opponent's authored `lines.win` when they won, `lines.lose` when they lost; present iff roster (§2.1) |
| 20d | **T-145** | `settleDareHand` | **§6.2 step 1 only**: the `liarsDiceBeaten` push, its early stop, and the `justBeaten` local. T-145 Accept: "beating a roster opponent records them in `liarsDiceBeaten` exactly once … asserted by a test" |
| 20e | **T-146** | `settleDareHand` | **`liarsDiceGamesPlayed += 1` here and only here** — the single settlement site, so player folds, dealer folds, both challenge outcomes and the dusk `timeout-fold` all count and none can be missed |
| 20f | **T-147** | `settleDareHand` | **§6.2 steps 2–3 only**: `if (justBeaten)`, the set-closure arithmetic, the one or two `LiarsDiceSetCleared` emissions |
| 21 | **T-146** | `isLatticeMove(...)` call (`:282`) | passes `hand.maxQuantity` |
| 22 | **T-145** | the missing-dealer guard (`:312`) | `nextState.npcs.find(...)` must **not** fire for roster hands — today it would close every roster hand instantly with `timeout-fold`, so this is a T-145 blocker, not a polish item. Its roster twin is "the content row vanished across a reload" (`liarsDiceOpponentFor` returns undefined), which closes the hand the same way |
| 23 | **T-145** | the policy dispatch (`:321`) | `dealerMove` vs `archetypeMove` on `hand.opponentKind`. `npcGuile` is read on the roaming path **only** |
| 24 | *none — confirm* | the Peek arm (`:257`) | already reads `hand.dealerDice.length` — **length-agnostic, NO CHANGE**. Stated so a coder does not "fix" it |
| 25 | *none — confirm* | `resolveChallenge` (rules `:205`) | counts across both arrays with `.filter` — **length-agnostic, NO CHANGE** |

### `packages/engine/src/day.ts`

| # | task | site | change |
| --- | --- | --- | --- |
| 26 | **T-146** *(confirm only)* | the dusk `settleDareHand(nextState, 'timeout-fold', events)` (`:564`) | **no edit** — it inherits the counter increment from row 20e and draws no rng, so the day-loop goldens stay honest. Listed so T-146 confirms rather than assumes |

### `packages/engine/src/schema.ts`

| # | task | site | change |
| --- | --- | --- | --- |
| 27 | **T-145** | `DareHandStateSchema` (`:505`) | five keys, `.strict()`, plus the `_covDareHand` `AssertEqual` guard (`:1582`) |
| 28 | **T-145** | `PlayerStateSchema` | `liarsDiceBeaten: z.array(z.string())`, `liarsDiceGamesPlayed: z.number()`, plus its coverage guard |
| 29 | **T-145** | `GameStateSchema` (~`:1492`, beside `dareHand`) | `liarsDicePurses: z.record(z.string(), z.number())` |
| 30a | **T-145** | `GameEventSchema` | `DareHandStarted`'s `dicePerSide` + `opponentLine?` and `DareHandResolved`'s `opponentLine?` (rows 17a, 20c), each with its compile-time pairing guard |
| 30b | **T-145** | `HangoutFailReason` | the `'opponent-broke'` value in `types.ts`'s union **and** in the pinned `z.enum` (`_covHangoutFailReason` is **value-for-value**). §5.6 Ruling C — ships with the refusal at row 11, not later |
| 30c | **T-146** | `GameEventSchema` | `DareHandStarted`'s `opponentRead?` (row 17b) + its guard |
| 30d | **T-147** | `GameEventSchema` | the `LiarsDiceSetCleared` variant + its discriminator-set and `AssertEqual` guards |

### `packages/engine/src/state.ts`

| # | task | site | change |
| --- | --- | --- | --- |
| 31 | **T-145** | `createInitialState` (~`:180`, beside `dareHand: null`) | seeds `liarsDiceBeaten: []`, `liarsDiceGamesPlayed: 0`, `liarsDicePurses: seedLiarsDicePurses()` |

### `packages/engine/src/save.ts`

| # | task | site | change |
| --- | --- | --- | --- |
| 32 | **T-145** | `MIGRATIONS[14]`, `CURRENT_SAVE_VERSION = 15` | plus the header provenance paragraph in the file's existing style (the `MIGRATIONS[13]` block is the template), plus `deserializeState`'s backfill path calling `seedLiarsDicePurses`. **The only version move in M4e** |

### `packages/engine/src/deeds.ts`

| # | task | site | change |
| --- | --- | --- | --- |
| 33 | **T-147** | `EVENT_PATHS` (`:36`) | one entry: `LiarsDiceSetCleared: ['scope', 'systemId']` (§6.3). No `matchesEvent` / `readPath` / DSL change |

### `packages/content/src/`

| # | task | site | change |
| --- | --- | --- | --- |
| 34 | **T-145** | NEW `liarsDice.ts` | §2 in full — the 42 rows **and** `LIARS_DICE_UNLOCK_GAMES` / `LIARS_DICE_RAISED_CEILING_MULT`. The two ladder constants are inert data until T-146's `liarsDiceTier` reads them; splitting the file across two tasks would buy nothing and risk a merge |
| 35 | **T-147** | `deeds.ts` | +15 entries (§6.4) |
| 36 | **T-145** | `index.ts` | barrel exports for the new types, the table and the two constants |
| 37 | **T-145** | NEW `liarsDiceValidation.ts` | the `deedValidation.ts` / `nemesisValidation.ts` precedent. Asserts: exactly 42 rows; exactly 3 per port across exactly the 14 `hasHangout` ids; record key === `row.systemId`; ids unique, `ld-`-prefixed, and **disjoint from every `ALL_NPC_PROFILES` id**; names unique and disjoint from every profile name; `seat` ∈ {1,2,3} and unique within a port; `mix` present **iff** `archetype === 'mixed'`; every mix a non-negative-integer triple summing to exactly 100; **`bankroll >= wagerBandFor(systemId).min`** (§7.5's precondition); all three lines non-empty, ≤ 120 chars, no `{…}` placeholder; no line matching a dice-count phrase |

### `packages/sim/src/`

| # | task | site | change |
| --- | --- | --- | --- |
| 38 | **T-145** | `index.ts:3451 planDare` | must be able to **select a roster opponent** — otherwise no sweep row and no deed-coverage career ever plays one, and the whole milestone is unmeasured. Must skip broke opponents (mirroring the engine's §7.4 refusal, the same way the `!npc.dead` and `venueOffered` mirrors already work). **T-145, not T-146**: test obligation 17 ("roster zero-sum through the real action loop") cannot run without it |
| 39 | **T-146** | `index.ts:3596 planDareMove` | `const expected = own(bid.face) + 4 / 6` hardcodes four dice → `hand.dicePerSide / 6`. The opening-bid loop's `face <= 6` is correct at every tier and **stays** (§4.3) |
| 40 | **T-145** | `protocol.ts:862` | `opponentId: { kind: 'enum', choices: [...inSystemNpcIds] }` must include the port's **non-broke roster ids**, and `:867`'s `note` must say so. Without this the UGT protocol cannot reach pool A at all and **T-145's own "reachable through the real UI" criterion fails** — which is exactly why this row is T-145's |
| 41 | **T-147** | `__tests__/support/deed-hunter.ts` + `HUNTER_TARGET_DEED_IDS` | the roster-clearing branch and the 15 new ids (§6.5) |
| 42 | *none — confirm* | `balance/rules-fingerprint.ts` | **NO EDIT NEEDED**, and this is stated so nobody adds one: `liarsDice.ts` is a content file and content is hashed wholesale; any new engine **root** module is auto-classified by `ENGINE_RULE_DIRECTORIES = ['', 'actions']`. No `ENGINE_NON_RULE_SOURCES` entry, and `balance-rig.test.ts`'s "classifies every engine source" check stays green |

### `packages/ui/src/`

| # | task | site | change |
| --- | --- | --- | --- |
| 43 | **T-146** | `App.tsx:33-35` | the `DARE_DICE_PER_SIDE` / `DARE_MAX_QUANTITY` imports must come off the **live hand** (`hand.dicePerSide`, `hand.maxQuantity`). `DARE_MAX_FACE` stays a constant import (§4.3) |
| 44 | **T-146** | `App.tsx:2348` | the dealer's die-placeholder count off `hand.dicePerSide`, not the constant |
| 45 | **T-146** | `App.tsx:2360` and `:2590` | the quantity stepper's clamp and its `data-max` off `hand.maxQuantity`. `:2603`'s `data-max={DARE_MAX_FACE}` is **unchanged** |
| 46a | **T-145** | `App.tsx:1865` / `format.ts:377 hangoutNpcs` | a **parallel** `hangoutRosterOpponents(game)` returning `{ id, name, beaten, purse, broke }`. The picker lists both pools, visually separated, beaten opponents marked, broke opponents disabled with the reason. `hangoutNpcs` itself is unchanged. **This row is how "all 42 opponents are reachable through the real UI" is satisfied** |
| 46b | **T-146** | the same projection | adds the `read?` field at tier ≥ 3 |
| 47 | **T-146** | the scene pane | the Read-the-Table line rendered at open when `DareHandStarted.opponentRead` is present |
| 48 | **T-146** *(confirm + extend)* | `__tests__/liars-dice-pane.test.ts:188` | `expect(reveal.playerDice).toHaveLength(4)` is tier-0-specific. It stays **valid and unchanged** at tier 0; the ladder needs its own additional tiered cases (5 and 6 dice), not an edit to this one |
| 49 | **T-145** | `format.ts:476 dareScene` | **`dealerName: game.npcs.find(n => n.id === hand.dealerId)?.name ?? hand.dealerId` resolves to the raw id `ld-5-2` for every roster hand** — pool A has no `NpcState`. It must branch on `hand.opponentKind` through the engine's `liarsDiceOpponentFor` (row 9a), the same way this file already calls `wagerBandFor` / `headroomFor` rather than re-deriving. `DareSceneView` also gains `opponentKind` and the `tableTalk` line. `dealerDieCount` is already `.length` — **confirm, no change** |
| 50 | **T-145** | `format.ts:528 dareRevealFrom` | the same `game.npcs.find(...)` name fallback, off `resolved.opponentId`; `DareRevealView` gains the win/lose `opponentLine` picked from `DareHandResolved` (row 20c). Its `dispositionDelta` is legitimately `0` on every roster hand (§7.6) — **confirm the pane does not render that as a regression** |
| 51 | **T-146** | `format.ts:417 dareWagerBounds` | `wagerBandFor(game.player.currentSystemId)` → the effective band for the **live** tier. This is the pre-hand stake input, so it is the second and last legitimate `liarsDiceTier` call site (§4.6) — there is no hand yet to read a frozen field off. Display only; the engine re-clamps at open |

**Rows 49–51 were found by reading `format.ts` at HEAD**, not by inference: rows 43–48 covered the
pane's *dice counts* but nothing covered the pane's *identity and voice*, and without row 49 a
roster hand renders as `ld-5-2` at the table — a T-145 Accept failure that would otherwise be
discovered only at the e2e.

**Four rows above are "confirm, do not change": 24, 25, 26 and 42**, plus the confirm halves of 48,
49 and 50. They are enumerated precisely because a coder auditing for "everywhere four is assumed"
will find them and be tempted.

---

## §9 · The test obligation register

T-144 adds no tests — it is spec-only. This register is the set the later tasks owe, drawn from
their Accept criteria, so no obligation is discovered late.

**The numbering is stable and never renumbered** — obligations are grouped by owner, and the owner
follows §8's task column. (Obligations 7–12, 17 and 18 sat under T-146 in this document's first
draft, and 19–20 under T-147, before the ownership reconciliation of §11.1; they moved, they were
not renumbered.) **These numbers are obligation ids and have nothing to do with §8's row numbers** —
obligation 26 is not ripple row 26.

**T-145 (the roster, the archetypes, the purse, the save):**
1. The content validator of §8 row 37, run over the shipped table.
2. Ids provably disjoint from `ALL_NPC_PROFILES` / `QUEST_PROFILES` ids.
3. `bankroll ≥ wagerBandFor(systemId).min` at all 42 rows — §7.5's precondition.
4. The v14→v15 round trip, **both** fixtures plus the idempotency case (§5.5).
5. `createInitialState` seeds 42 purse keys equal to the authored bankrolls.
6. Behaviour-preservation: with tier pinned at 0 and pool B only, every M4d golden is unmoved.
7. The anti-cheat test extended to `archetypeMove`: vary the player's hidden dice, assert the
   dealer's emitted move sequence never moves (§3.2).
8. `probAtLeast` against hand-computed exact values at u ∈ {4,5,6} and every k. (All three
   values of `u`, even though T-145 only ever *plays* at 4 — the function is total and T-146
   must inherit it proven.)
9. **`optimal` beats `bad` over N simulated head-to-head hands**, at a margin with a stated `n`.
   This is T-145's "each archetype's policy is distinguishable by an actual behavioral test".
10. **`bad` never folds**, over a large randomised sweep (§3.4).
11. `random`'s move distribution is uniform over the legal set, χ² at a stated `n`.
12. `resolveMixedArchetype`'s three branches partition 0..99 exactly, for all four authored mixes.
17. Roster zero-sum through the **real action loop** (not a direct rules call): player credit
    delta + purse delta = 0 over a whole hand, at every outcome. Requires §8 row 38.
18. The broke refusal spends no die and moves no state.
19a. Beaten-recorded-**exactly once**: a rematch win against an already-beaten roster opponent
    writes nothing to `liarsDiceBeaten`. (The "and emits nothing" half is 19b, T-147's.)
20a. A roaming win never touches `liarsDiceBeaten`.
25. All 42 opponents reachable through the real UI at their authored port — e2e for a sample via
    the UGT protocol (§8 row 40), unit for full table shape and uniqueness. The pane shows the
    authored **name**, not the raw `ld-` id (§8 row 49).
26. The three authored lines render at table-talk / win / lose (§8 rows 17a, 20c, 49, 50).

**T-146 (the ladder):**
13. Each of the five unlocks, asserted at `threshold − 1` and at `threshold` (10 cases).
14. The six-dice hard cap: no `gamesPlayed`, however large, yields `dicePerSide > 6`.
15. Tier 5 is still solvency-clamped: neither side's credits can go negative, at any stake.
16. The tier is frozen at open: a settlement that crosses a threshold mid-scene does not move the
    open hand's `dicePerSide` / `maxQuantity` / `bandMax`.
27. `liarsDiceGamesPlayed` increments exactly once per settled hand at **every** outcome — both
    folds, both challenge arms, and the dusk `timeout-fold` (§8 rows 20e, 26).
28. Save round-trip covers `liarsDiceGamesPlayed` at several tiers, **without moving
    `CURRENT_SAVE_VERSION`** (§5.6 Ruling A).

**T-147 (achievements):**
19b. A rematch win against an already-beaten opponent **emits nothing**.
20b. A roaming win never emits `LiarsDiceSetCleared`.
21. Port-clear fires exactly once, on the 3rd distinct win at that port.
22. Roster-clear fires exactly once, on the 42nd, **alongside** that port's port-clear.
23. `deeds.test.ts`'s three guards stay green with the new entry and the 15 new deeds.
24. `deed-coverage.test.ts` stays green **without loosening an assertion** (§6.5).

---

## §10 · What this spec deliberately does not settle

1. **Wildcards (ones-as-wild) — permanently out of scope**, restated here from §5.5 of the
   redesign so this document is self-contained. The M4e bakeoff found they reopen a *worse* version
   of the exploit M4d closed: holding *m* ones gives a guaranteed floor on every non-one face
   **simultaneously**, ~3.5× more common than the closed exploit and unbounded in scope, and the
   fixed-quantity / adjacent-face-only fix does nothing against it because the guarantee never comes
   from restating a known count on one next face. **This is not a tuning knob.** Do not resurrect it
   without a fresh, dedicated design pass.
2. **More than 3 opponents per port.** The shape supports it and `seedLiarsDicePurses`'s
   preserve-existing behaviour means a later content pass needs **no further save version** — but
   the deed slate and the completion arithmetic would both need revisiting, so it is not this
   milestone's.
3. **Roster disposition, roster relationships, roster death.** Rule 1 forecloses all three by
   design; reopening any of them is a new design track, not an extension.
4. **Whether the 42 get `VisitHangout` cast parity.** That is D2's still-deferred parity-ledger
   row, re-asked at **T-150** against the finished system rather than the stub.
5. **F-137-1 on the roaming path**, and therefore `dealerMove`'s `DARE_AI_*` constants. §3.9.
   **Not a contradiction with §8 row 8**, which does edit `dealerMove`: row 8 makes its two
   four-dice assumptions read the live `dicePerSide` and is *provably inert at 4 dice*. No
   constant's **value** moves and no decision changes at tier 0, so T-137's baseline stays
   comparable. What is out of scope is *retuning* those constants, not teaching the arithmetic
   how many dice are on the table.
6. **`RENOWN_DEED_THRESHOLDS.CONQUEROR`.** §6.6 — reported by T-148, retuned by nobody in M4e.

---

## §11 · Handoff — which task implements which section

**These rows are derived from §8's task column and add nothing to it.** Where this table and §8
disagree, §8 wins (§5.6's opening note).

| Task | Sections it implements | Ripple rows (from §8) |
| --- | --- | --- |
| **T-145** · the roster, the archetypes, the purse, the one migration | §2 (the whole content table, all 42 rows, the validator), §3 in full (`probAtLeast`, `archetypeMove`, the three policies, `resolveMixedArchetype`, the draw-order ruling), §5 (**the only version bump in M4e**, `CURRENT_SAVE_VERSION 14→15`, `MIGRATIONS[14]`, and the **full** `DareHandState` shape — real `opponentKind`/`opponentArchetype`, tier-0 ladder values), §6.2 **step 1 only**, §7.1–§7.6 (zero-sum routing, the live-balance clamp, the clamped sit-down, the broke refusal + its theorem, the no-disposition rule) | 1, 2, 9a, 10–13a, 15, 16a, 17a, 18, 19, 20a–20d, 22, 23, 27–30b, 31, 32, 34, 36, 37, 38, 40, 46a, 49, 50 |
| **T-146** · the ladder | §4 in full (all five tiers, the ×3 multiplier, the ante rule, Read the Table), the `liarsDiceGamesPlayed` increment | 3–8, 9b, 13b, 14, 16b, 17b, 20e, 21, 26, 30c, 39, 43–45, 46b, 47, 48, 51. **No save-shape change** |
| **T-147** · the achievements | §6 minus step 1 (the event, the closure arithmetic, the `EVENT_PATHS` entry, the 15 deeds, **the `deed-hunter.ts` extension**) | 20f, 30d, 33, 35, 41. **No save-version change** |
| **T-148** · the capstone | **DELIVERED 2026-08-01 — see §12.** Every owed measurement discharged: the win-rate/EV split by `opponentKind` **and** by archetype (§12.2 — and §3.9's verdict comes back **inverted**, z = −30.76, filed as F-148-1); bids-per-hand at tier 0 vs tier 4 (§12.4 — 1.527 → 2.194 like-for-like, +43.7%, discharging F-146-2); `hangoutPlay.netCredits` split by pool (§12.5 — roaming 39.77% / roster 60.23%); the interceptor lift split by pool (§12.6 — the wronged share fell 47.50% → 26.19% and the lift over uniform ROSE 2.623× → 2.875×, which is F-137-2 getting better); the roster's realised share of the 280,800 cr cap (§12.5 — 20.24% at day 120); the CONQUEROR crossing day (§12.7 — **unreached at 120 days by every policy, dice or not**). Plus the two the task added: ladder pacing (§12.1 — rung 5 crossed by 99.50% of dice careers at median day 55) and the pool share of hands actually played (§12.3 — the gauntlet takes **57.04%**, not the roaming pool). Five findings filed and NOT fixed: **F-148-1…F-148-5** (§12.9), each with its lever named and left alone. | — |

### 11.1 The reconciliation, recorded — why T-145 is this large

This document's first draft cut the work along **its own section boundaries** (§3 → T-146, §7 →
T-146/T-147, §6 → T-147). That cut was wrong, and it is worth saying why so it is not
reintroduced: **TASKS.md's Accept criteria are the contract, and they were written before this
spec.** T-145's read, at TASKS.md ~2673–2679:

> *"all 42 opponents are reachable through the real UI at their authored port"*; *"each archetype's
> policy is distinguishable by an actual behavioral test"*; *"catchphrases render at
> table-talk/win/lose per opponent"*; *"beating a roster opponent records them in `liarsDiceBeaten`
> exactly once … asserted by a test"*; *"a roster hand is zero-sum against that opponent's persisted
> purse and the solvency clamp reads the live balance (both asserted by a test through the real
> action loop)"*; *"the broke-opponent rule behaves per spec (asserted)"*.

None of those can be satisfied by content rows, a schema and a migration. Each names a **runtime
behaviour** whose edit site sits in `actions/hangout.ts`, `actions/dare.ts`, `liarsDiceRules.ts`,
`sim/` or `format.ts` — and T-146 and T-147 are both `after: T-145`, so a cut that put those sites
in a later task made T-145 unfinishable **by construction**, not merely awkward. The old §11 row
even handed §8 row 40 to T-146 while row 40's own text says T-145's criterion fails without it.

So the cut follows the criteria, not the section numbers:

- **T-145 is "pool A exists and works end to end, at tier 0."** Big, but it is one coherent
  shippable thing, and it is exactly what TASKS.md scoped.
- **T-146 is "the numbers stop being constants."** Every one of its rows is a ladder-axis
  substitution against a field T-145 already froze onto the hand (§4.6) — which is why it needs no
  schema key, no migration and no version move, and why its own "no save-shape change here" Accept
  criterion is true rather than aspirational.
- **T-147 is "closing a set fires a deed."** It reads `liarsDiceBeaten`, which T-145 populates, and
  adds the emission T-145 deliberately left out. Its TASKS.md body already says "reading T-145's
  `liarsDiceBeaten`", which only parses under this cut.

**TASKS.md needs no edit as a result of this reconciliation** — the spec was moved onto TASKS.md's
criteria, not the reverse. That direction is deliberate: an Accept criterion is a commitment, and a
spec that finds itself unable to meet one should re-cut its own plan rather than rewrite the
commitment.

**One clarification T-146 and T-147 should read rather than infer:** each inherits a codebase in
which pool A already plays. Neither is introducing the roster; both are extending a working system.
A T-146 coder who finds `archetypeMove` already written, or a T-147 coder who finds the beaten set
already populated, has found the intended state of the tree, not a task boundary someone crossed.

### The two blocking rulings, repeated because they are the ones that break if forgotten

> **T-145 owns the ONLY version bump in M4e, and lands the FULL `DareHandState` shape — including
> §8 row 16, the open-arm literal that actually writes the five fields.** T-146 and T-147 read
> fields that already exist. Neither may move `CURRENT_SAVE_VERSION`. Adding a `GameEvent` variant
> (T-147), adding an optional field to an existing variant (T-145, T-146) and adding a
> `HangoutFailReason` value (**T-145**, with the broke refusal that raises it) are **not** version
> changes — see §5.6 rulings A, B and C.

> **T-147 owes the `deed-hunter.ts` extension, and may not loosen, scope, band or skip
> `deed-coverage.test.ts`.** 15 new deeds red both of its assertions until the hunter can clear the
> roster. A re-pin of seeds or horizon with fresh written provenance is sanctioned; a widened
> assertion is not.

---

## §12 · T-148 capstone — the measured roster and ladder (2026-08-01)

### 12.0 Method — and the three limitations that bound everything after it

**Read this before any headline.** Three constraints are in force, and each one narrows what a
number below is allowed to mean.

1. **Seven of the eight shipped policies play zero hands.** `planDare` (`sim/index.ts:3452`) has
   exactly one call site: `gamblerPolicy` (`:3864`). `trader`, `trader-degraded`, `fighter`,
   `explorer`, `veteran`, `smuggler` and `greedy` opened **0 hands** across 840 runs. So **"does a
   typical playstyle cross 80 games in a normal career" is not measurable from this rig.** What is
   measurable is the *maximal dice-playing* playstyle — an upper bound. §12.1 therefore reports the
   pacing as a bound and gives the analytic read-across (`day 80/k` for a career playing `k`
   hands/day) so a lighter playstyle can be read off the same table.
2. **F-146-1 is in force, and it is narrower than its own summary.** `planDare` sizes the *seed*
   off `wagerBandFor(systemId)` — the **tier-0** band — at every tier, so the raised *stake* is
   never requested. But `resolveVisitHangout` freezes `effectiveWagerBand(systemId, tier).max` onto
   `hand.bandMax` and `anteFor(systemId, tier)` onto `hand.ante` at open, and `headroomFor` reads
   the frozen ceiling. **So the tier-4 whole-hand exposure ceiling and the tier-scaled ante DO move
   in played hands, and §4.4's obligation IS measurable** — see §12.4. What is unmeasured is the
   raised seed, and only that.
3. **The synthesized-state caveat**, inherited unchanged from the smoke rig
   (`docs/balance/smoke/README.md`): the fixture's mid-game tiers are synthesized starting states,
   never balance verdicts. Nothing in §12 is measured off the fixture; it is measured off the sweep
   and off the probe.

**The gate work, in order.**

| Step | Command | Result |
| --- | --- | --- |
| 1 | `npm run format` | **zero files changed** (prettier reported every file `(unchanged)`) |
| 2 | 8 × `balance:sweep --label t148-roster-ladder --seeds 1000 --days 120 --policies trader,trader-degraded,fighter,explorer,veteran,smuggler,gambler,greedy --milestone-days 21,29,30,41,60,120 --shard i/8`, then `--merge` | `[balance] wrote aggregate for 8000 rows to …/docs/balance/baseline-t148-roster-ladder.json` — 8 × 1,000, 1-indexed, no short arm |
| 3 | `balance:diff docs/balance/baseline-t137-liars-dice.json docs/balance/baseline-t148-roster-ladder.json` | `MOVED ROWS (2): fleet, gambler` · `UNCHANGED ROWS: header, explorer, fighter, greedy, smuggler, trader, trader-degraded, veteran` |
| 4 | `balance:extract --aggregate docs/balance/baseline-t148-roster-ladder.json` | `[smoke] 4 tiers, spreads harvested, rules 09deb1e41c99bdeb / instrument c80ebc59869406bb / docs 350d78708243b524` |
| 5 | re-pin | `balance-targets.test.ts:103`, `docs/NPC_REDESIGN.md` ×2, `docs/balance/smoke/README.md:95` |

**The fingerprints did not move, and that is the honest reading.** T-145, T-146 and T-147 each
re-extracted `tiers.json` as they landed, so the hashed corpora were already stamped at HEAD before
this capstone ran. The "one re-extract owed for the whole milestone" is discharged as a
**provenance re-pin onto a fresh 8,000-row aggregate** (`sweepLabel` `t137-liars-dice` →
`t148-roster-ladder`, `gitCommit` `a876b4f7` → `c27cf3bc`, `runs` 8,000, `spreadSource`
`harvested`), not as a new hash. Milestone-batching the capstone remains correct; it simply had
nothing left to re-stamp.

**The sweep diff isolates the milestone exactly, and the prediction was stated before it ran.**
M4e adds no rule any non-gambler career touches — the roster is only reachable through
`VisitHangout{venue:'dare'}`, the fifteen deeds only through `LiarsDiceSetCleared`, and the ladder
only through `liarsDiceGamesPlayed`. The diff moves **precisely two rows, `gambler` and `fleet`**,
and leaves the other seven **byte-identical**. In particular `createInitialState` now seeds 42
purse keys and that perturbs **no** rng stream. Three "shape changes" are reported and are all the
same benign kind — `byPolicy[gambler].renownRanks.GIGA_HERO` and two
`milestones[i].npcRenownRanks.ADMIRAL` keys are *newly present* because the gambler's deed count
rose into a rank bucket that had zero occupants before (§12.7).

**The probe.** `.scratch/t148-roster-ladder.ts` — gitignored, read-only, descended from
`.scratch/t137-liars-dice.ts`, which descends from `.scratch/t125-hangout.ts`. The M5 interceptor
block is kept **verbatim** through both generations, which is what makes §12.6 like-for-like
against §16.6 rather than a new number off a new instrument. Its structural additions over T-137
are four, all counters: a hand-open snapshot joined by `handId` (the pool and the resolved
archetype exist **only** on `state.dareHand`; `DareHandResolved` carries neither), a tier derived
two independent ways, day-loop purse/ladder/deed tracking, and one fix — T-137's probe read
`wagerBandFor(hand.systemId).max` at each decision point, which stopped being the hand's ceiling
when T-146 froze `bandMax`.

**`liarsDiceTier` was NOT called a third time.** §4.6 rules a third call site a bug. The probe
derives the tier arithmetically from the **imported** `LIARS_DICE_UNLOCK_GAMES` and cross-checks it
against the hand's frozen `dicePerSide`/`bandMax`, which turns the constraint into a free
correctness check on the freeze-at-open behaviour.

**Fidelity: 5/5 MATCH on SIX channels** against `runCampaign` on (1,`gambler`), (2,`gambler`),
(3,`gambler`), (4,`smuggler`), (5,`veteran`) — final credits, deed count, `hangoutPlay.dares`,
`daresWon`, `netCredits`, and **Σ of the per-hand `creditsDelta` joined by `handId`**, the sixth
channel T-148 adds because every split below rests on that join being lossless. Over both arms:
**join misses 0, hands left open 0, tier/freeze disagreements 0, `dareGuardHits` 0, `timeout-fold`
0.**

**The two arms.**

| Arm | Shape | Hands | Purpose |
| --- | --- | --- | --- |
| **1** | seeds 1..120 × 120 days × 8 policies = **960 runs** | **20,477** | Identical shape to T-137's probe arm, so §12.6's interceptor figures are directly comparable |
| **2** | `gambler` only, seeds 1..600 × 120 days = **600 runs** | **101,904** | Depth, to fill the archetype and tier cells past the `n ≥ 1,000 hands` sizing rule |

**Sizing rule, stated as discipline and not post-hoc:** every reported cell carries its `n`; no rate
is reported as `0.00` off a small arm — a zero is written `< 1/n` (NPC_REDESIGN standing amendment
1). Arm 2's smallest archetype cell is `random` at **n = 6,577 hands**, comfortably past the
threshold; no cell needed widening and no claim was softened. Where Arm 1 and Arm 2 both measure a
quantity, both are given and they agree.

---

### 12.1 Pacing against the doubling ladder (5 / 10 / 20 / 40 / 80)

Arm 2, `gambler`, **n = 600 careers × 120 days**.

| Rung | Tier | Games | Careers reaching it | Crossing day (median) | p25 / p75 |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 (5th die) | 5 | **600 / 600 (100.00%)** | **4** | 4 / 5 |
| 2 | 2 (6th die) | 10 | 599 / 600 (99.83%) | **8** | 7 / 9 |
| 3 | 3 (Read the Table) | 20 | 599 / 600 (99.83%) | **14** | 13 / 15 |
| 4 | 4 (×3 ceiling) | 40 | 598 / 600 (99.67%) | **27** | 25 / 29 |
| 5 | 5 (clamp removed) | 80 | **597 / 600 (99.50%)** | **55** | 52 / 57 |

| Checkpoint | `liarsDiceGamesPlayed` (median) | p25 / p75 | Tier of the median career |
| --- | --- | --- | --- |
| day 21 | 31 | 29 / 33 | 3 |
| day 30 | 45 | 42 / 48 | 4 |
| **day 35** (Tour One's horizon) | **52** | 49 / 55 | **4** |
| day 60 | 87 | 84 / 91 | **5** |
| day 120 | **171** | 165 / 177 | 5 |

**The verdict on the brief's own question: rung 5 does NOT go the way of Explore's band-4 — for a
dice-playing career.** 99.50% of `gambler` careers cross 80 games, at a median of day 55, less than
half way through the horizon. The ladder's top rung is not merely reachable; **it is where a dice
career spends most of its life** — 53.04% of all hands played in Arm 2 were played at tier 5 (§12.4),
and the median career finishes at **171 games, more than twice the top rung**. If anything the
ladder is *short*, not long.

**But that answer is bounded by limitation 1 and must not be read as "a typical playstyle".** The
arm measures a career that plays `GAMBLER_MAX_DARES_PER_DAY = 2` hands on most days — measured
**1.415 hands/day**. The analytic read-across, so the owner can price a lighter playstyle without a
new sweep: a career playing `k` hands/day crosses rung 5 at **day `80/k`**.

| Hands/day | Day rung 5 opens | Inside a 120-day career? | Inside Tour One (day 35)? |
| --- | --- | --- | --- |
| 1.415 (measured, maximal) | 57 | yes | no |
| 1.0 | 80 | yes | no |
| 0.67 (two hands every third day) | 120 | **borderline** | no |
| 0.5 | 160 | **no** | no |
| 0.25 | 320 | no | no |

So the honest shape of the finding is: **the ladder is correctly sized for a dedicated dice
career and out of reach for a casual one, and there is no playstyle in the shipped policy set that
sits between those two** — every non-gambler policy plays exactly zero hands. That gap is an
instrument gap, not a design verdict, and it is named in §12.9.

---

### 12.2 Win rate and EV per hand, split by pool and by archetype

Arm 2, **n = 101,904 hands**. `±` is the binomial standard error on the win rate.

| Cell | n hands | share | player win rate | EV / hand | bids / hand | mean ante |
| --- | --- | --- | --- | --- | --- | --- |
| **roaming** (pool B) | 43,779 | 42.96% | **76.91%** ± 0.20 | **+516.5 cr** | 2.127 | 88 |
| **roster** (pool A), all | 58,125 | 57.04% | **82.44%** ± 0.16 | **+589.3 cr** | 1.881 | 89 |
| roster · `optimal` | 42,494 | 41.70% | **84.69%** ± 0.17 | +632.2 cr | 1.801 | 91 |
| roster · `bad` | 9,054 | 8.88% | **68.78%** ± 0.49 | +286.0 cr | 2.063 | 77 |
| roster · `random` | 6,577 | 6.45% | **86.71%** ± 0.42 | +729.4 cr | 2.152 | 92 |

Arm 1 replicates it at n = 20,477: roaming 77.85%, roster 82.41%, `optimal` 84.44%, `bad` 69.53%,
`random` 86.39%.

**The headline, against T-137.** The whole-mechanic figures moved in the direction F-146-3
predicted and by less than its 5-seed pilot suggested:

| | T-137 (M4d) | **T-148 (M4e)** |
| --- | --- | --- |
| player win rate | 94.66% | **80.07%** (Arm 2) · 80.48% (Arm 1) |
| EV / hand | +737.53 cr | **+558.00 cr** (Arm 2) · +562.63 cr (Arm 1) |
| net / seed staked | 93.70% | **61.12%** |
| `player-fold` rate | 0.03% | 0.55% |
| `dealer-fold` | 0 (0.00%) | 2,205 (2.16%) |
| opening bids guaranteed true | 100.00% | **100.00%** (F-137-1 untouched, by design) |

F-146-3's pilot predicted EV/hand 366 → 215. The direction is confirmed at n = 101,904; the
**magnitude was overstated by the pilot** (the real fall is 737.53 → 558.00, −24.3%, not −41%).
That is what a 5-seed pilot is for and why it was not banked.

#### §3.9's verdict, as a number — and it comes back INVERTED

§3.9 asks: *"If the roster's `optimal` seat does not measurably beat the `bad` seat, the policy is
wrong and that is a finding, not a tuning knob."*

```
player win rate vs optimal  84.69%  (n = 42,494)
player win rate vs bad      68.78%  (n =  9,054)
bad − optimal = −15.92 pp,  SE = 0.52 pp,  z = −30.76
```

Arm 1 replicates the sign and the magnitude independently: −14.91 pp, SE 1.16 pp, **z = −12.88**.

**The archetypes are emphatically not cosmetic — |z| is 30, not 2 — but the ordering is backwards.**
`bad` is the hardest seat at the table and `optimal` is the softest. Worse, **`optimal` (84.69%) is
softer than the undesigned roaming dealer (76.91%)**, so the 14 `optimal` rows and the `optimal`
arm of the 14 `mixed` rows are, in play, the *easiest* opponents in the game. Filed as **F-148-1**.
Nothing was tuned; `BAD_CREDULITY`, `archetypeMove` and the four mix tables sit at their shipped
values.

**The mechanism, from the same data.** `bad` challenges on `BAD_CREDULITY = 1` — "more than one
over what I hold" — against the baseline planner's opener, which is `(own(F*), F*)`: a claim of
dice the player is **holding**, true by construction (F-137-1, still 100.00% of openers). A
credulous, challenge-happy `bad` therefore walks into a claim it cannot beat far *less* often than
`optimal`'s EV comparison does, because `optimal` correctly computes that a low claim is probably
true and **raises** instead — extending the hand into the lattice, where the player's
raise-quantity ladder and the guaranteed-true floor keep compounding. `bad` ends hands early and
cheaply (2.063 bids/hand, EV +286 cr); `optimal` plays them long and loses more (1.801 bids/hand,
EV +632 cr). **The archetype policies are working exactly as specified; what they are playing
against is F-137-1.** That is why F-148-1's recommended home is the same owner call as F-137-1 and
not a knob on `archetypeMove`.

---

### 12.3 Roaming pool vs fixed roster — which one is actually played

Arm 2, **n = 101,904 hands over 600 careers**.

| | hands | share |
| --- | --- | --- |
| **roster** (the 42-seat gauntlet) | **58,125** | **57.04%** |
| **roaming** (the unlimited-replay pool) | 43,779 | 42.96% |

| Day bucket | hands | roster share |
| --- | --- | --- |
| 1 – 30 | 26,913 | **72.62%** |
| 31 – 60 | 25,130 | 58.50% |
| 61 – 120 | 49,861 | **47.89%** |

**So the answer to the brief's design question is the opposite of the one it feared.** The
unlimited-replay pool does **not** dominate play and leave the gauntlet untouched. The gauntlet
takes the *majority* of hands, and takes nearly three quarters of them in the first thirty days.

**The mechanism, read off the source rather than guessed.** `planDare` picks the **richest
candidate**, considering roaming NPCs first and first-wins on ties (`sim/index.ts:3487-3513`).
Roster bankrolls are authored at `3× / 5× / 8× wagerBandFor(systemId).max`, which out-banks most
roaming captains early in a career; as the roaming NPC economy accumulates credits over 120 days
the fixed purses lose the comparison and the roster's share decays — 72.62% → 47.89%. The purses
are zero-sum and never regenerate, so a drained seat is skipped forever; in practice **that almost
never happens** (median 0 seats at purse ≤ 0 by day 120, max 4 of 42), because the roster's share
falls off for the bankroll-comparison reason long before a purse empties.

**But the gauntlet is played, not completed** — and that is the finding.

| Per career (n = 600) | median | p75 | max | of |
| --- | --- | --- | --- | --- |
| distinct seats ever seated | **31** | — | 36 | 42 |
| seats **beaten** (`liarsDiceBeaten`) | **29** | 31 | 36 | 42 |
| seats drained to purse ≤ 0 | 0 | — | 4 | 42 |
| **ports cleared** (all 3 seats) | **3** | — | 8 | **14** |
| **grand slam** (all 42) | — | — | — | **0 / 600 careers (< 0.17%)** |

Careers clearing at least one port: **581 / 600 (96.83%)**. Arm 1 agrees: median 3 ports, max 8,
grand slam 0 / 120.

**What this implies for T-147's fifteen deeds, stated plainly.** A maximal dice career playing 171
hands over 120 days beats **29 of 42 seats** and clears **3 of the 14 ports**. So of the fifteen
completion deeds, roughly **three of the fourteen `liars_dice_cleared_<port>` rows fire for a median
career**, and `liars_dice_grand_slam` fired **zero times in 720 careers across both arms**. The
gap is not that the roster is unplayed — it is that hands are spread across seats by a *bankroll*
rule that has no idea a set exists, so a career touches 31 of 42 seats and finishes none of the
remaining eleven ports. Filed as **F-148-2**. `planDare`'s selection rule was **not** changed.

---

### 12.4 Tier 0 vs tier 4 — the hand shape (§4.4, discharging F-146-2)

The plain tier cut, Arm 2:

| Tier | n hands | share | bids / hand | mean ante | mean seed | player win rate |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 3,000 | 2.94% | 1.710 | 37 | 251 | 80.10% |
| 1 | 2,997 | 2.94% | 1.732 | 37 | 281 | 82.38% |
| 2 | 5,990 | 5.88% | 1.841 | 36 | 289 | 83.42% |
| 3 | 11,977 | 11.75% | 1.831 | 36 | 327 | 83.57% |
| **4** | 23,893 | 23.45% | **2.020** | **106** | 973 | 79.62% |
| 5 | 54,047 | **53.04%** | 2.052 | 104 | 1,157 | 78.99% |

**That cut is confounded twice over and must not be quoted alone.** The tier applies to **both**
pools, the pool mix shifts across a career (§12.3), and the seed is bankroll-driven so a later tier
is also a richer captain. The like-for-like cell against T-137 — whose 1.19 bids/hand was measured
on a mix that was 100% roaming and 100% tier 0 — is the **roaming column**:

| Tier | roaming n | bids / hand | ante | roster n | bids / hand | ante |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 1,119 | **1.527** | 17 | 1,881 | 1.819 | 50 |
| 1 | 936 | 1.485 | 20 | 2,061 | 1.844 | 45 |
| 2 | 1,366 | 1.919 | 20 | 4,624 | 1.818 | 41 |
| 3 | 3,005 | 1.937 | 27 | 8,972 | 1.795 | 39 |
| **4** | 9,411 | **2.194** | 96 | 14,482 | 1.907 | 113 |
| 5 | 27,942 | 2.180 | 101 | 26,105 | 1.915 | 108 |

**§4.4's obligation, discharged: within the roaming pool, tier 4 lengthens the hand from 1.527 to
2.194 bids, +43.7%.** §4.4 predicted "roughly triples how many raises a hand can physically hold";
the realised effect is a **44% increase in bids actually placed**, not a tripling — because
headroom was rarely the binding constraint at tier 0 in the first place (player band-clamp rate
**0.00%**, dealer 2.15%, §12.8's untouched `[D]` block).

The two frozen quantities that carry the ×3, measured directly:

| | tier 0 | tier 4 | ratio |
| --- | --- | --- | --- |
| mean frozen `bandMax` (per-side exposure ceiling) | 1,248 cr | 3,541 cr | **2.837×** |
| mean frozen `ante` | 37 cr | 106 cr | **2.86×** |
| mean `seedWager` **requested** | 251 cr | 973 cr | 3.88× *(bankroll, not the tier)* |

Both frozen quantities land just under `LIARS_DICE_RAISED_CEILING_MULT = 3`; the shortfall is the
**port mix**, not an arithmetic error — tier 4 is reached later in a career, at a different
distribution of ports, and the ratio is of two different port samples. **Tier 5 carries
`bandMax: null` on all 54,047 of its hands**, confirming the clamp is genuinely removed and not
merely widened.

**F-146-1 is confirmed and its scope is now exact.** The raised *stake* is never requested: the
tier-0 and tier-4 seed columns move only because the gambler is richer, and `planDare` still asks
for `min(wagerBandFor(systemId).max, …)`. What the ladder *does* exercise in play is the frozen
ceiling and the ante — both measured above. Filed forward as **F-148-4**; `planDare` was not
changed and no third `liarsDiceTier` call site was added.

---

### 12.5 The pool split of `hangoutPlay.netCredits` (§7.7) and the roster's realised share of the cap (§2.6)

**The split §7.7 demands**, Arm 2:

| pool | net to the player | share |
| --- | --- | --- |
| roaming (B) | 22,611,560 cr | 39.77% |
| **roster (A)** | **34,251,375 cr** | **60.23%** |
| total | 56,862,935 cr | — |

The total reconciles **exactly** to `hangoutPlay.netCredits` (56,862,935 cr) — that equality is the
sixth fidelity channel. Arm 1 agrees: roaming 39.83% / roster 60.17%.

**The blended `hangoutPlay.netCredits` describes neither pool**, exactly as §7.7 warned: pool A
supplies 57.04% of hands and 60.23% of the money, at a win rate 5.5 pp higher and an EV/hand 14%
higher than pool B.

**§2.6's one-time cap.** Σ of the 42 authored bankrolls, **summed from `LIARS_DICE_OPPONENTS`
rather than copied from the prose**, is **280,800 cr** — it **AGREES** with §2.6's stated total, so
there is no discrepancy to file.

| | Σ purses remaining (median) | **realised draw** (median) | as a share of the 280,800 cr cap | mean | max |
| --- | --- | --- | --- | --- | --- |
| day 30 | 273,573 cr | **7,236 cr** | **2.58%** | 8,062 | 34,108 |
| day 60 | 255,850 cr | **24,961 cr** | **8.89%** | 25,653 | 61,901 |
| day 120 | 224,086 cr | **56,841 cr** | **20.24%** | 57,086 | 110,110 |

*(The two medians in that table are medians of different orderings and do not subtract to each
other exactly — `280,800 − 224,086 = 56,714` against the printed 56,841. The probe's percentile
picks index `floor(0.5 n)` on each series independently, and `drawn = 280,800 − remaining` reverses
the sort order, so the two land one rank apart. A 127 cr gap on a 280,800 cr cap; recorded rather
than quietly reconciled.)*

**A 120-day dice career does not out-earn the cap** — it draws roughly a fifth of it. Per career it
banks 94,772 cr net from the tables, of which **57,086 cr (60.2%) is pool A's**, against a
per-career pool-A ceiling of 280,800 cr (**20.33%**). Extrapolating the day-60→120 draw rate
(≈ 531 cr/day) the cap would bind around **day 540** — far outside any measured horizon, but inside
the 300-day-plus veteran horizon §6.5's own arithmetic reasons about. **The cap is real and it is
not close to binding at 120 days.** No bankroll was touched.

---

### 12.6 The §7.5 / §7.6 interceptor obligation — split by pool, and it moved back

Same instrument, same seeds, same days, same policies as T-125 and T-137, so this is like-for-like.
Arm 1, `gambler`, 120 runs. Reconstruct misses **0 / 886**.

| `gambler` (120 runs) | §10.4 AFTER (opposed-d20) | T-137 (Liar's Dice) | **T-148 (roster + ladder)** |
| --- | --- | --- | --- |
| named interceptions | 929 of 3,689 (25.18%) | 880 of 3,548 (24.80%) | **886 of 3,524 (25.14%)** |
| inertness rate | 31.65% | 23.52% | **43.23%** |
| mean lift `P_w / P_u` | 1.4814× | 1.6649× | **1.4029×** |
| **chosen at disposition < 0** | 272 / 929 (**29.28%**) | 418 / 880 (**47.50%**) | **232 / 886 (26.19%)** |
| analytic uniform expectation | 9.904% | 18.108% | **9.108%** |
| **wronged-captain lift** | 2.956× | 2.623× | **2.875×** |
| mean disposition of the CHOSEN captain | −1.378 | −2.453 | **−1.237** |
| mean disposition of their POOL | −0.294 | −0.764 | **−0.330** |

| fleet (960 runs) | §10.4 AFTER | T-137 | **T-148** |
| --- | --- | --- | --- |
| interceptions | 23,100 | 23,037 | **23,013** |
| of which named | 5,706 (24.70%) | 5,801 (25.18%) | **5,807 (25.23%)** |
| inertness | 69.56% | 67.83% | **70.79%** |
| chosen at disposition < 0 | 578 / 5,706 (10.13%) | 734 / 5,801 (12.65%) | **548 / 5,807 (9.44%)** |
| analytic uniform expectation | 4.223% | 5.326% | **3.966%** |
| wronged-captain lift | 2.398× | 2.376× | **2.379×** |

**The direction predicted by §7.6 is exactly what happened, and F-137-2 got BETTER, not worse.**
The wronged-captain share fell 47.50% → **26.19%**, back *below* T-125's 29.28%. And **F-137-2's
own "number to watch" — the lift over uniform, the part that measures the weighting rather than the
roster's mood — rose 2.623× → 2.875×, back toward T-125's 2.956×.** F-137-2 warned that whoever
made the win rate less lopsided should expect the share to fall back toward 29% and must not read
that as a regression in the interceptor draw. That is precisely the reading here: the draw is doing
**more** of the work than it was at T-137, not less.

**The split by pool, which §7.6 requires before any of that may be read.** Two mechanisms, both
§7.6's:

- **Roster hands apply no disposition at all.** 11,785 of Arm 1's 20,477 hands (**57.55%**) are
  roster hands and moved **zero** dispositions, by rule.
- **The win rate fell**, so the souring arm fires relatively less often.

`DispositionChanged{reason:'dare'}` fell from **13,758** (T-137, over 15,235 hands) to **7,949**
(T-148, over **20,477** hands) — a third fewer disposition moves off a third more hands. Cross-check:
7,949 moves over 8,692 **roaming** hands = **91.45%**; the 8.55% residual is `applyDisposition`
returning without emitting when the target is already saturated at ±10 (`npc.ts:705`), not a
missing event.

By applied delta: `−7` 350 · `−6` 288 · `−5` 281 · `−4` 704 · `−3` 997 · `−2` 2,521 · `−1` 883 ·
`+1` 576 · `+2` 994 · `+3` 271 · `+4` 84. **The souring arm now carries 6,024 of 7,949 (75.78%)**,
down from T-137's 94.08%, and the warming arms 1,925 (**24.22%**), up from 5.92%. The `+1` fold arm
fired **576 times (7.25%)**, up from 248 (1.80%) — the fold rate rose from 0.03% to 0.55%.

**No disposition constant and no port's `dare` arms were touched.** `DARE_WIN_DISPOSITION` (−2),
`DARE_LOSS_DISPOSITION` (+2), `DARE_FOLD_DISPOSITION` (+1), `INTERCEPT_GRUDGE_WEIGHT`,
`INTERCEPT_FRIEND_WEIGHT` and `INTERCEPT_MIN_WEIGHT` all sit at the values T-125 inherited.

---

### 12.7 CONQUEROR — the crossing day, reported and not retuned (§6.6)

**No policy reaches `RENOWN_DEED_THRESHOLDS.CONQUEROR = 38` inside 120 days — dice-playing or
not.** Arm 1, seeds 1..120 × 120 days, all eight policies:

| policy | hands played (median) | deedCount median | p75 | max | reached 38? |
| --- | --- | --- | --- | --- | --- |
| **`gambler`** (the dice career) | **171** | **28** | 29 | 33 | **0 / 120 (< 0.83%)** |
| `smuggler` | 0 | 28 | 29 | 32 | 0 / 120 |
| `explorer` | 0 | 27 | 28 | 31 | 0 / 120 |
| **`veteran`** (control) | 0 | **20** | 21 | 22 | 0 / 120 |
| **`trader`** (control) | 0 | **20** | 21 | 23 | 0 / 120 |
| `trader-degraded` | 0 | 19 | 20 | 23 | 0 / 120 |
| `fighter` | 0 | 11 | 17 | 19 | 0 / 120 |
| `greedy` | 0 | 9 | 10 | 13 | 0 / 120 |

The 8,000-row sweep agrees at n = 1,000 per policy: `gambler` deedCount median **28** (p90 31, max
34, mean 27.893), `veteran` 20, `trader` 20. `renownRanks` for the gambler: MEGA_HERO 726,
GRAND_MUFTI 143, **GIGA_HERO 129 (31 deeds)**, TOP_DOG 2 — **CONQUEROR: 0**.

**§6.6 asked whether the ladder becomes materially easier for a dice-playing captain. Measurably
yes, and measurably not enough to matter at this horizon.** Against T-137 the gambler's deedCount
median moved **25 → 28** (the diff's +12.0%), which is the fifteen new deeds landing — but 28 is
still **ten short** of 38, and the non-dice controls sit at 20. So the fifteen deeds bought the
dice career a **+8-deed lead over a trader** where it had a +5 lead before, and CONQUEROR stayed
out of reach for everyone.

**This is a horizon mismatch, not a break, and it is reported rather than retuned.** `CONQUEROR:
38` was sized (T-1603b, recorded in its own comment) off a **300-day** measurement in which each
career banked all 44 authored deeds and crossed 38 on days 87–88. The slate is now **59** deeds and
the measurement horizon here is **120 days**. Nothing in this capstone licenses moving the
threshold — the number that would decide it is a 300-day arm this rig does not run. Filed as
**F-148-5**; `RENOWN_DEED_THRESHOLDS` was not touched.

---

### 12.8 What was NOT tuned

`git diff --stat` for this commit, restricted to hashed rule and instrument sources:

```
$ git diff --stat -- packages/engine/src packages/content/src \
                     packages/sim/src/index.ts packages/sim/src/protocol.ts \
                     packages/sim/src/balance packages/ui/src
(no output — zero files, zero lines)
```

The **only** shipped-source line this task changed is the baseline path string in
`packages/sim/src/__tests__/balance-targets.test.ts:103`, which that file's own header comment
names as the single line to update on a re-pin. One assertion was **added** (never widened) in
`packages/sim/src/__tests__/balance-smoke.test.ts`, pinning `provenance.spreadSource ===
'harvested'` so F-146-0's silent downgrade — a `balance:extract` run that drops `--aggregate`
defaults to `baseline-n1.json` and flips the rig to `estimated` **without moving a fingerprint** —
fails loudly instead of surviving a milestone. The pre-existing enum assertion was left exactly as
it is: it documents the enum's legal range, which is a different claim from the committed rig's
state. Both files are outside all three hashed corpora (`SIM_INSTRUMENT_DIRECTORIES = ['',
'balance']`), so neither edit can move a fingerprint.

**The `it.fails` tripwire at `balance-targets.test.ts:225` was checked and stays correctly RED**:
the trader clears the debt marker on day **21** against `[22, 30]` at **n = 990** on the new
baseline — identical to the outgoing one (21 at n = 990). It did not invert and it was not flipped.
`balance-combat-survival.test.ts`'s two tripwires likewise stay red.

**No band, no threshold, no fingerprint and no golden was edited.** Constants left at their shipped
values, listed so a later reader can see the retune that did not happen:
`LIARS_DICE_UNLOCK_GAMES` `[5, 10, 20, 40, 80]` · `LIARS_DICE_RAISED_CEILING_MULT` 3 ·
`BAD_CREDULITY` 1 · the four tone mixes (`EVERYDAY` 40/40/20, `EXOTIC` 60/20/20, `DANGEROUS`
70/10/20, `COMIC` 20/40/40) · **all 42 authored bankrolls** · `RENOWN_DEED_THRESHOLDS.CONQUEROR` 38
· `DARE_ANTE_BAND_FRACTION` 0.03 · `DARE_PEEK_DC` 12 · `DARE_WIN_DISPOSITION` −2 ·
`DARE_LOSS_DISPOSITION` +2 · `DARE_FOLD_DISPOSITION` +1 · every `DARE_AI_*` · `GAMBLER_RESERVE` ·
`GAMBLER_BANKROLL_FRACTION` · `GAMBLER_MAX_DARES_PER_DAY` 2 · all fourteen authored `wager` bands.

Gate: `npm test` **exit 0 (1,918 tests, 95 files, zero failures)** · `npx tsc -b` **0** ·
`npm run lint` **0** · `npm run format:check` **0**.

---

### 12.9 Findings filed, not fixed — and every lever left unpulled

Per this track's house discipline, a bad number is **reported**, not tuned around. Five findings,
each with its mechanism, its recommendation, and an explicit owner call.

**F-148-1 · The archetype ordering is inverted: `optimal` is the softest seat in the game.**
Status: REPORTED, NOT FIXED. The player wins **84.69%** against `optimal` and **68.78%** against
`bad` (z = −30.76, n = 51,548), and `optimal` (84.69%) is softer than the *undesigned* roaming
dealer (76.91%). Mechanism (§12.2): `optimal`'s EV comparison correctly declines to challenge the
baseline planner's guaranteed-true opener and raises instead, extending the hand into a lattice
where the player compounds; `bad`'s `BAD_CREDULITY = 1` makes it end hands early and cheaply. **The
archetype policies are behaving as specified; what they are playing against is F-137-1.**
Recommendation: **do not touch `archetypeMove` or `BAD_CREDULITY` first.** Close F-137-1 (the
guaranteed-true opener) and re-measure; if the inversion survives that, the archetypes are the
right place to look. **Left for an owner call — the same one F-137-1 is waiting on.**

**F-148-2 · The gauntlet is played but never completed; `liars_dice_grand_slam` is unreachable
through play.** Status: REPORTED, NOT FIXED. A maximal dice career beats **29 of 42** seats and
clears **3 of 14** ports in 120 days; the grand slam fired **0 times in 720 careers**. Mechanism
(§12.3): `planDare` picks the richest candidate and has no idea a *set* exists, so hands scatter
across 31 distinct seats and finish neither the eleven remaining ports nor the roster. **Not a
purse-depletion problem** — median 0 seats drained. Recommendation: this is a *policy* gap
(`planDare` is the sim's baseline, not the game's rule) but it is also a real player-facing
question — a human hunting the deed would seat deliberately, and the deed's reachability for a
human is therefore **unmeasured by this rig**. Either give `planDare` a set-completion preference
(an instrument change, which owes its own inert-first commit) or accept the deeds as
deliberate-play rewards and say so in the spec. **Left for an owner call.**

**F-148-3 · The roster is the softer and richer pool, which is backwards for a gauntlet.** Status:
REPORTED, NOT FIXED. Pool A supplies 57.04% of hands, 60.23% of the money, a win rate 5.5 pp higher
and an EV/hand 14% higher than pool B. A fixed roster of named characters with authored bankrolls
reads as the *challenge* content; it currently measures as the *easy* content. This is F-148-1
seen through the wallet and shares its recommendation. **Left for the same owner call.**

**F-148-4 · F-146-1 confirmed, with its scope now exact: the raised ceiling is never staked into.**
Status: REPORTED, NOT FIXED. `planDare` and `protocol.ts:869` both size the wager domain off
`wagerBandFor(...)` — the tier-0 band — so no sweep row and no UGT career ever *requests* a tier-4
or tier-5 stake. What the ladder does exercise is the frozen `bandMax` and the tier-scaled `ante`,
both measured in §12.4. Consequence: **the ×3 ceiling and the removed clamp are, in play today,
worth +43.7% bids per hand and nothing else.** Recommendation: teaching `planDare` the effective
band needs a third `liarsDiceTier` call site, which §4.6 rules a bug — so this needs either an
explicit §4.6 amendment or a rule that hands the effective band out without a third read. **Not
improvised here. Left for an owner call**, and it is the natural companion to T-150's parity row.

**F-148-5 · CONQUEROR = 38 is unreached at 120 days by every policy, dice or not.** Status:
REPORTED, NOT FIXED, exactly as §6.6 instructs. The gambler's median moved 25 → 28; the controls sit
at 20; nobody reaches 38. The threshold was sized off a **300-day** measurement against a **44**-deed
slate and is now being read against a 120-day horizon and a **59**-deed slate. Recommendation: the
number that would settle it is a 300-day arm, which this rig does not run. **Do not rescale the
threshold off a 120-day capstone.** Left for an owner call.

#### Levers considered and deliberately left alone

Every one of these was examined against a number above and **not touched**. Naming them is the
point: a capstone that reports a bad number and quietly moves a constant has failed the task.

| Lever | Where | The number that tempted it | Why it was left |
| --- | --- | --- | --- |
| `LIARS_DICE_UNLOCK_GAMES` `[5,10,20,40,80]` | `content/liarsDice.ts:89` | Rung 5 opens at median day 55 and carries 53% of all hands — the top rung is the *default* state, not the endgame | Widening it would be tuning to the maximal playstyle, the only one the rig can see (§12.0 limitation 1). Owner call. |
| `LIARS_DICE_RAISED_CEILING_MULT` = 3 | `content/liarsDice.ts:93` | ×3 buys only +43.7% bids/hand, less than §4.4 predicted | The shortfall is F-148-4's (the seed is never raised), not the multiplier's. Fixing the wrong one first would hide the real gap. |
| `planDare`'s richest-candidate rule | `sim/index.ts:3487-3513` | Drives both the 57%/43% pool split (§12.3) and F-148-2's zero grand slams | It is the *instrument's* policy, not the game's rule; changing it re-bases every baseline in the same commit that measures it. |
| `planDare`'s tier-0 band sizing | `sim/index.ts:3524` | F-148-4 / F-146-1 | Needs a third `liarsDiceTier` call site, which §4.6 forbids. Amendment first, edit second. |
| `dealerMove`'s F-137-1 opener + all `DARE_AI_*` | `engine/liarsDiceRules.ts` | 100.00% of openers still guaranteed true; it is the root cause under F-148-1 and F-148-3 | §3.9 and §10.5 both explicitly scope it out of M4e. It is an owner call and always was. |
| `BAD_CREDULITY` = 1 and `archetypeMove` | `engine/liarsDiceRules.ts:761` | The inverted ordering, z = −30.76 | The policies do what they are specified to do. Retuning them would paper over F-137-1. |
| The four tone mixes | `content/liarsDice.ts:97-100` | `random` is only 6.45% of hands and `bad` 8.88% | Reweighting toward the *harder* seat means reweighting toward `bad`, which is only harder *because* of F-137-1. Circular. |
| The 42-row bankroll table (280,800 cr) | `content/liarsDice.ts:107+` | Only 20.24% of the cap is drawn in 120 days | The cap is doing its job — it is a ceiling, not a target, and it is nowhere near binding. |
| `RENOWN_DEED_THRESHOLDS.CONQUEROR` = 38 | `content/deeds.ts:289` | Unreached by every policy at 120 days | §6.6: report, do not retune. It was sized off a 300-day arm; a 120-day arm cannot overrule it. |
| `GAMBLER_MAX_DARES_PER_DAY` = 2 | `sim/index.ts` | Sets the 1.415 hands/day that decides all of §12.1 | It is the instrument's throttle. Changing it would move the pacing answer by fiat. |

---

### 12.10 What this capstone leaves open — for T-150

1. **F-148-1 / F-148-3 / F-137-1 are one owner call, not three.** The archetype inversion, the
   roster-is-easier result and the guaranteed-true opener share a single root. Whoever takes it
   should close F-137-1 first and re-run this capstone's Arm 2 before touching `archetypeMove`.
2. **F-148-2's deed reachability is unmeasured for a human player.** The rig's `planDare` seats by
   bankroll; a person hunting `liars_dice_grand_slam` would seat by set. The deeds may be perfectly
   reachable deliberately and merely invisible to this instrument — that distinction needs either a
   set-seeking probe arm or an explicit spec sentence saying the fifteen deeds are deliberate-play
   content.
3. **F-148-4 needs a §4.6 amendment before it needs code.** The raised ceiling cannot be staked
   into without a third `liarsDiceTier` read, which §4.6 rules a bug.
4. **No playstyle sits between "1.4 hands a day" and "zero".** Seven of eight policies never sit at
   a table, so every pacing number here is an upper bound with nothing to interpolate against. A
   casual-dice policy would make §12.1's read-across a measurement instead of an extrapolation.
5. **The Peek and the player-side RAISE BOTH remain unmeasured**, unchanged from §16.0's
   limitations 1 and 2 — `planDareMove` still never peeks (0 `DarePeeked` in 122,381 hands across
   both arms) and still has no raise-both branch.
6. **CONQUEROR needs a 300-day arm**, not a 120-day one, before anyone may rescale it.
7. **§10's item 4 — whether the 42 get `VisitHangout` cast parity — is still D2's deferred row and
   is T-150's to re-ask** against the finished system, now with §12.3's numbers underneath it.

