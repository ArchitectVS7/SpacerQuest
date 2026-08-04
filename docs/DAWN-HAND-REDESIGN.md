# Dawn-Hand Action Economy — spec for the M17 rewrite

**Authority for M17.** Written after a live owner playtest surfaced that the dawn hand's die
count was illegible ("it feels like I have five action points"), a `/bakeoff` on the travel die
specifically (T-195, shipped), and a board-game-designer pass on the whole action list. This
document is the spec; `TASKS.md`'s M17 block is the work list that implements it.

## 1 · The complaint, and the two separate problems it turned out to be

Owner, live playtest: *"it was not at all apparent why I was adding a d20 to any of my tasks...
it feels like I have five action points, I have no feedback if the die does anything."*

Investigation (T-194's filing) found this was actually two problems wearing one complaint:

1. **Some die-costed actions read the die's face value, some don't, and nothing says which.**
   T-194 (still open, now superseded below) proposed teaching this split and making it visible.
2. **Too many actions cost a die at all.** Owner, this round: *"I don't feel like I should burn
   an action point signing the contract, and a second action point buying fuel, and a third
   action point executing the contract."* This is the real fix — most of what cost a die was
   administrative overhead riding the same scarce resource as the decisions that actually vary
   a run. T-194's "teach the split" plan is now moot for every action this document frees: there
   is no split to teach if the action doesn't cost a die in the first place.

## 2 · The design principle

Standard board-game/TTRPG split, named so it can be checked against rather than argued from
feel: **Main Actions** consume the day's one scarce resource (5 dice) because they are the
decisions that make a day's shape a real choice. **Free Actions** don't, because something *else*
already bounds them — credits, a single-active-contract slot, a single-active-loan slot,
inventory/berth capacity, physical component tiers. Taxing a Free Action with a die on top of
its real cost is a double-tax, not a decision.

**The test applied to every currently-die-costed action, verified against the actual resolver
code, not assumed:** does removing the die let a rational player do something unbounded and
exploitative? If yes, it needs a bound before it can be free (§4). If the real bound already
exists elsewhere, it's free with no further work.

## 3 · Full inventory, current state, verified by reading every `spendDie(` call site

| Action | Today | Ruling |
|---|---|---|
| Space jump (Travel) | Main, and (T-195) the die matters | **Stays Main** — confirmed by owner, "that was the original game balance, number of hops per day" |
| Explore / off-lane sweep | Main, die matters (Pilot vs Nav DC) | **Stays Main** — confirmed by owner |
| Haggle | Main, die matters (Trade vs DC 12) | **Stays Main** — the one real *optional* gamble on a contract already signed for free |
| Combat (fight/run/talk) | Main, die matters (Guns/Pilot/Trade vs DC) | **Stays Main** — the highest-stakes content in the game |
| Liar's Dice → Peek | Main, die matters (Guile vs DC) | **Stays Main** — the one real check inside an open hand |
| Nemesis crossing | Main, die matters (Pilot vs DC) | **Stays Main** — rare, endgame, its own quote/check pair |
| Sign contract | Main, die blind | **Free** — bounded already: `trade.ts:67` refuses a second active contract, plus board scarcity |
| Buy fuel | Main, die blind | **Free** — bounded by credits + tank capacity |
| Abandon contract | Main, die blind | **Free** — no reason to tax quitting |
| Pay debt | *(already free of a die — engine comment: "remote payments need no roll")* | **No change** |
| Port purchase | Main, die blind | **Free** — bounded by credits + one purchase per port |
| Shipyard — repair, cargo pods, component tier, special equipment (one shared resolver) | Main, die blind | **Free**, all four — bounded by credits + physical slots/tiers |
| Crew hire | Main, die blind | **Free** — bounded by credits + berth capacity |
| Crew dismiss | Main, die blind | **Free** — no cost today besides the die |
| Reroll | *(not a die spend — burns a separate `rerollsRemaining` charge)* | **No change** |
| Hangout → open a Dare (Liar's Dice) | Main, die blind | **Free, but capped (§4)** — wagers are bounded by the player's own credits, but ROUNDS PLAYED had no bound besides the die |
| Hangout → Befriend | Main, die matters (Guile vs DC) | **Free, but capped (§4)** — disposition clamps at a ceiling, but nothing stopped reaching it in one sitting |
| Hangout → Insult, Meet, Rumor | Main, die blind | **Free** — low-stakes, no exploit surface found |
| Hangout → Borrow | Main, die blind | **Free** — bounded already: refuses a second loan while one is active |
| Hangout → Repay | Main, die blind | **Free** — bounded by credits and outstanding debt |
| Explore outcome's secondary "extra dice" toll | Main, die blind, a cost INSIDE an already-Main action | **Out of scope for M17** — smaller inconsistency, the parent Explore action already reads a die meaningfully; revisit later if it still bothers on review |
| Storylet choices authored with `spendDie` only (no `statCheck`) | Main, die blind, per-choice | **Out of scope for M17** — a content authoring question, not an engine rule; some choices are deliberately meant to be free, stakes-free narrative branches |

**Net effect:** of the ~15 die-costed action types today, 6 remain Main Actions (Jump, Explore,
Haggle, Combat, Peek, Crossing). Everything else becomes Free.

## 4 · The two caps (owner-ruled this round)

Freeing an action removes the die as its only throttle. Two of the freed actions had no other
bound, so freeing them outright would let a rational player grind them without limit:

### 4a. Befriend — clamp to once per NPC per day

Owner: *"clamp befriend at one."* Disposition already clamps at a ceiling, so unlimited free
Befriends couldn't have exceeded the max — but nothing stopped a player from *rushing* to it in
one sitting instead of it costing real time across days, which was the actual risk. **One
Befriend attempt per NPC per calendar day**, tracked per-NPC (not a global daily counter — a
player working through the Hangout roster should still be able to Befriend several *different*
NPCs in one visit; the cap is against repeating the SAME NPC). Refused attempts return a typed
fail (`hangout.ts`'s existing three-way `no-die`/`invalid-die-index`/`die-already-spent`
convention extends naturally to a fourth: `already-attempted-today`), never a silent no-op.

### 4b. Liar's Dice rounds — clamp per day, scaling with the player's Liar's Dice rank

Owner: *"clamp liars dice at X number of rounds, scaling with a player's rank in liars dice
(rewarding good play)."* The existing rank variable is `liarsDiceTier(gamesPlayed)`
(`liarsDiceRules.ts:195`, 0-5, derived from `player.liarsDiceGamesPlayed` cumulative settled
hands) — already read exactly once per hand-open, at `hangout.ts:351`, to freeze the wager
band/dice-per-side/max-quantity for that hand. The round cap reuses the SAME tier read, at the
SAME call site, rather than inventing a second progression variable.

**Suggested table** (owner to confirm exact numbers before implementation; the shape — more
rounds at higher tier — is the ruled part, the exact counts are not):

| Tier | Games played | Rounds/day |
|---|---|---|
| 0 | 0 | 1 |
| 1 | `LIARS_DICE_UNLOCK_GAMES[0]` | 2 |
| 2 | `LIARS_DICE_UNLOCK_GAMES[1]` | 2 |
| 3 | `LIARS_DICE_UNLOCK_GAMES[2]` | 3 |
| 4 | `LIARS_DICE_UNLOCK_GAMES[3]` | 3 |
| 5 | `LIARS_DICE_UNLOCK_GAMES[4]` | 4 |

A "round" is one settled hand (open → bidding → challenge/settlement), not one bid. Refused
opens past the day's cap return a typed fail, same convention as 4a.

## 5 · Things this document flags rather than silently resolves

- **"Hangout is free" — does that mean the visit, or every sub-action?** There's no separate
  "walk in" step today (visiting and acting are the same die-spend); this doc reads the owner's
  ruling as "every current Hangout sub-action loses its die cost," which is what §3's table
  applies. If that's not the intent, say so before M17's Hangout task starts.
- **Is "once per NPC per day" the right grain for the Befriend cap**, or should it be "once per
  Hangout visit" (finer, if a future task ever meters visits separately) or a flat daily total
  across all NPCs (coarser)? This doc picked per-NPC-per-day as the reading that best matches
  "don't let a player max one relationship for free in one sitting" without also blocking a
  player who wants to work the whole roster in one visit.
- **The exact rounds-per-tier numbers in §4b are a starting suggestion, not a ruling.** Confirm
  before the coder locks them in — they're cheap to change later (one content table), but the
  *shape* (more rounds at higher tier) is what's actually load-bearing for "rewarding good play."

## 6 · What does NOT change

- Contract pricing (die-affects-price, replacing or supplementing Haggle) — a separate, still-
  open thread from the earlier bake-off, analytical only (NPCs don't Haggle, so it isn't
  simulable through the sweep the way travel was). Not part of M17.
- Hangout "atmosphere" (die shapes venue temperament) — same status, not part of M17.
- The travel die's mechanism (T-195, already shipped) — unaffected by this document.
- Any UI/tutorial work — M17 is the mechanical layer. T-194 is superseded as originally scoped
  and needs its own re-scope once M17's action list is final (see TASKS.md's T-194 block).
