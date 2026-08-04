# Dawn-Hand Action Economy — spec for the M17 rewrite

**Authority for M17.** Written after a live owner playtest surfaced that the dawn hand's die
count was illegible ("it feels like I have five action points"), a `/bakeoff` on the travel die
specifically (T-195, shipped), and a board-game-designer pass on the whole action list. This
document is the spec; `TASKS.md`'s M17 block is the work list that implements it.

**Amended at the owner-approved review pass, 2026-08-04 (two rulings, same day):** the review
pass first extended the Befriend cap to Meet per-NPC-per-day; the owner then superseded that
draft with the **social pool ruling** — one daily pool of `SOCIAL_PLAYS_PER_DAY = 3` free
social plays bounds Meet, Befriend, AND Insult (§4a), with no per-NPC bookkeeping. In the same
ruling: Befriend's Guile check rolls an **internal d20** (§5's blocker, resolved as option 1);
§4b's round counter increments AT OPEN; and T-197's capstone still measures the Insult
encounter-farming loop, now as *verification* that X = 3 holds it rather than as an open
question.

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
| Hangout → Befriend | Main, die matters (Guile vs DC) | **Free, draws from the social pool (§4a)** — the check survives as an internal d20 vs the port's authored DC (§5, RESOLVED by owner ruling 2026-08-04) |
| Hangout → Meet | Main, die blind | **Free, draws from the social pool (§4a)** — the meet arm applies its disposition delta unconditionally, NO check; free and unbounded it would be a rush-to-ceiling grind, closed by the pool |
| Hangout → Insult | Main, die blind | **Free, draws from the social pool (§4a)** — always lands (−4); at −10 the hunt weight is 16×, so unbounded free insults are an encounter-farming loop. The pool prices a manufactured grudge at a full day's plays; T-197's capstone measures the fighter policy's encounter/combat income as VERIFICATION that X = 3 holds it |
| Hangout → Rumor | Main, die blind | **Free, outside the pool** — read-only: emits rumors, mutates nothing |
| Hangout → Borrow | Main, die blind | **Free** — bounded already: refuses a second loan while one is active |
| Hangout → Repay | Main, die blind | **Free** — bounded by credits and outstanding debt |
| Explore outcome's secondary "extra dice" toll | Main, die blind, a cost INSIDE an already-Main action | **Out of scope for M17** — smaller inconsistency, the parent Explore action already reads a die meaningfully; revisit later if it still bothers on review |
| Storylet choices authored with `spendDie` only (no `statCheck`) | Main, die blind, per-choice | **Out of scope for M17** — a content authoring question, not an engine rule; some choices are deliberately meant to be free, stakes-free narrative branches |

**Net effect:** of the ~15 die-costed action types today, 6 remain Main Actions (Jump, Explore,
Haggle, Combat, Peek, Crossing). Everything else becomes Free.

## 4 · The caps (owner-ruled; §4a re-ruled as the social pool, 2026-08-04)

Freeing an action removes the die as its only throttle. Three of the freed actions — Meet,
Befriend, Insult, the three that move disposition with no other bound — would otherwise be
grindable without limit. One pool bounds all three:

### 4a. The social pool — `SOCIAL_PLAYS_PER_DAY = 3` free social plays per day

**Owner ruling, 2026-08-04, superseding the same-day per-NPC-per-day draft** (that draft —
Meet and Befriend each once per NPC per day, tracked per-(npcId, venue) — is preserved in git
history as the logged not-chosen shape, per the D1/D7 precedent; the hybrid "pool + per-NPC"
and "Befriend stays Main" shapes were also presented and not chosen). One daily counter,
consumed by exactly **Meet, Befriend, and Insult**. Rumor (read-only), Borrow/Repay
(ledger-bounded), and Dare-open (§4b's own cap) are OUTSIDE the pool. `SOCIAL_PLAYS_PER_DAY`
is a **content constant** (with `MEET_DISPOSITION` and friends in `packages/content`) — tuning
X later is a content edit, not an engine change.

Why the arithmetic holds at X = 3: disposition clamps at ±10, Meet is +1 and Befriend +3 on
success, so walking one NPC to the ceiling takes ~4 dedicated days (with the every-3rd-dusk
decay dragging back) — restoring the owner's original intent that a relationship costs "real
time across days" — and the Insult farm (−4 always lands; −10 is a 16× hunt weight) costs a
full day's pool per manufactured grudge instead of three clicks.

**Accounting:** a play is spent when the action RESOLVES, regardless of outcome — a failed
Befriend check spends the play; a typed refusal (`venue-not-offered`,
`social-limit-reached`, …) spends nothing, matching the existing no-die-on-refusal convention.
The counter lives on the save, resets at dawn at `day.ts`'s existing chokepoint, and a
spent-out pool refuses with a typed `social-limit-reached` (extending `hangout.ts`'s existing
`no-die`/`invalid-die-index`/`die-already-spent` refusal family), never a silent no-op.

**Befriend's check, resolved by the same ruling (§5's blocker, option 1):** free Befriend rolls
an **internal d20 drawn from the action's rng** against the port's authored `befriend.dc` — the
check and every port's DC content stay live; what's given up is aiming a chosen die at it,
accepted by the owner as part of the pool ruling.

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

**The counter increments AT OPEN** (ruled at the 2026-08-04 review pass), at the same
`hangout.ts:351` site that freezes the tier's effects onto the hand: Liar's Dice hands persist
across save/reload and can straddle dusk, so counting at settlement would let a hand opened
before dusk dodge the dawn reset. "One settled hand" defines the round's UNIT; the open is when
the day's allowance is spent. A fold still settles the hand, so an open-and-fold burns both the
round and the escrow — the cap cannot be laundered through folds.

## 5 · Things this document flags rather than silently resolves

- **RESOLVED (owner, 2026-08-04) — what rolls Befriend's Guile check once its die is gone?**
  (Added at the review pass; the original draft missed it. The resolver is
  `check(die, playerGuile, dc)` — the spent die IS the roll, so "free Befriend" had nothing to
  roll.) **Ruled: option 1, an internal d20 from the action's rng** — the check and every
  port's authored `befriend.dc` stay live; the agency cost (Befriend becomes a Guile check the
  player cannot aim a die at) was accepted as part of the §4a social-pool ruling. Logged
  not-chosen shapes, for the record: (2) keep Befriend a Main Action (the die stays the roll —
  smallest mechanical change, breaks the "Hangout is free" story); (3) drop the check entirely
  (always lands like Meet — deletes a die-matters moment and kills the DC content).
- **"Hangout is free" — does that mean the visit, or every sub-action?** There's no separate
  "walk in" step today (visiting and acting are the same die-spend); this doc reads the owner's
  ruling as "every current Hangout sub-action loses its die cost," which is what §3's table
  applies. If that's not the intent, say so before M17's Hangout task starts.
- **SUPERSEDED (owner, 2026-08-04): the cap grain question.** The original per-NPC-per-day
  grain question is moot — the §4a social pool has no per-NPC bookkeeping; "a flat daily total
  across all NPCs," the coarser grain this bullet once listed as an alternative, is exactly
  what was ruled. Kept for the record of why the finer grains were considered.
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
