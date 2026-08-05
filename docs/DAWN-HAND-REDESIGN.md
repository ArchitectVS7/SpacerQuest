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

**SHIPPED, PART 1 — T-196a (2026-08-04): the nine administrative actions are FREE in the
ENGINE.** `sign-contract`, `buy-fuel`, `abandon-contract`, all four `Shipyard` kinds, `Crew`
hire/dismiss and the `Port` buy no longer take a die: the `spendDie` field is gone from those
action shapes in `packages/engine/src/types.ts` AND from the zod schema in `schema.ts` (a stale
caller's field is stripped, never accepted), and the four resolvers no longer touch the dawn
hand at all. `haggle` is untouched — its die IS the TRADE check. No new cap was added to any of
the nine, per §3's exploit analysis. What T-196a deliberately did NOT do, so the two capstone
arms stay attributable: the sim policies still budget a die for them (`packages/sim/src/index.ts`)
and the protocol enumerator still advertises `spendDie` on them (`protocol.ts`) — that is
T-196b; the cockpit still gates the buttons on an armed die — that is T-196c. §4's caps and the
Hangout rows are T-197.

**SHIPPED, PART 2 — T-196b (2026-08-05): the INSTRUMENTS now play the freed economy.**
The eight sim policies (`packages/sim/src/index.ts`) no longer count the nine against the
dawn hand — `planRefuel`, `planCrippledRepair`, `planCaptainOverhead`, `planFighterUpgrade`
and `planSpecialEquipment` lost their `DieLedger` outright; every sign→travel pair is gated
on the TRAVEL die alone; the trader's second run needs one spare die instead of two; the
veteran's broker_shark gate falls from three dice to two (haggle + travel). Where the die
scarcity used to ration two purchases apart, a running `committed`/`yardCommitted` credit
total now does it, because credits — not the hand — were always the real bound. The protocol
enumerator (`protocol.ts`) advertises all nine WITHOUT a `spendDie` param and, new at this
task, KEEPS advertising them when `diceRemaining` is empty: die-actions vanish with the hand,
Free Actions do not. `packages/sim/src/pilot.ts` needed no change and it was verified rather
than assumed (removing `spendDie` shrinks each freed spec's odometer domain, so they became
LESS likely to be truncated, and `abandon-contract`'s now-empty `params` fills to exactly one
candidate). The capstone is arm 2 of the control-arm pair: `rulesFingerprint` is unmoved
(`55414694d7187afc` — no engine or content file is touched) and only `instrumentFingerprint`
changes, so the diff against arm 1 is the measured value of exploitation alone. Baseline of
record is now `docs/balance/baseline-t196b-instruments.json`. Still open: the cockpit still
gates the buttons on an armed die (T-196c), and §4's caps plus the Hangout rows are T-197.

**SHIPPED, PART 3 — T-197 (2026-08-05): the HANGOUT is free, and two daily caps replaced
the die.** All SEVEN venue sub-actions lost their die cost — `dare`-open, `meet`, `befriend`,
`insult`, `rumor`, `borrow`, `repay` — in the ENGINE, the INSTRUMENTS and the COCKPIT at
once, because unlike the nine administrative verbs these needed a new BOUND rather than
merely a removed one, and shipping the bound in a later task would have left the exploit
open in between. `spendDie` is gone from the `VisitHangout` shape in `types.ts` AND from the
zod schema (a stale caller's field is stripped, never accepted); `resolveVisitHangout` no
longer touches the dawn hand at all. **`Dare{move:'peek'}` is untouched and is now the only
die spend left in the Hangout family** — it is §3's "one real check inside an open hand", it
still rolls Guile against the port's DC, and `actions/dare.ts` is byte-identical.

What replaced the die, both enforced in the resolver and both on the save
(`CURRENT_SAVE_VERSION` 15 → 16, `MIGRATIONS[15]`, round-trip tested — the counters must
survive a MID-DAY reload or the caps are advisory):

* **§4a's SOCIAL POOL** — `SOCIAL_PLAYS_PER_DAY = 3` plays shared by `meet`/`befriend`/
  `insult`, spent on RESOLUTION whatever the outcome (a failed Befriend d20 spends one),
  refused with a typed `social-limit-reached`. It is a CONTENT constant, beside
  `MEET_DISPOSITION`.
* **§4b's ROUNDS CAP** — `LIARS_DICE_ROUNDS_PER_DAY` opens per day, indexed by the tier
  already frozen at `hangout.ts`'s open site, counted AT OPEN, refused with a typed
  `daily-round-limit`.

Both reset at dawn through ONE rule (`resetDailyHangoutCaps`) called from `day.ts`'s
existing NEXT DAY PREP chokepoint — `startDay` deliberately has no second reset, since a
mid-day reload re-enters dawn and would otherwise refill a spent allowance. Befriend's check
survives as §5's ruled internal d20. Both counts are RENDERED beside the controls they bound
(`social-plays-left`, `dare-rounds-left`) so neither cap can refuse a click the player could
not see coming.

## 0 · M17 as measured — the Insult null result and the cumulative arc

*This section is what **T-198**, the owner pacing checkpoint, reads. Its brief —
`docs/playtests/T-198-pacing-brief.md` — quotes this section's figures and is pinned back to it
by `packages/sim/src/__tests__/pacing-brief-figures.test.ts` in both directions, so neither the
section nor the brief can drift from the other unnoticed.*

**THE INSULT MEASUREMENT, AND WHY IT IS A NULL RESULT RATHER THAN A PASS.** §4a predicted
the pool would hold the free-insult × 2.358× wronged-interceptor farming loop, and the
capstone was required to check it against the fighter's encounter/combat income. The
`fighter` row came back **BYTE-IDENTICAL** to T-196b — encounters/run 19.6460, ships lost 11,
median credits 82,671, clear rate 0.6030. **That is not evidence the pool works.** Verified
while planning and re-verified in the diff: **no sim policy has ever emitted `meet`,
`befriend` or `insult`** — only `protocol.ts`'s enumerator names them — so the farming loop
cannot be EXHIBITED by this instrument at all, and the fighter's stillness says only that
the freed dice and the rounds cap do not reach that row. What can be said is the analytic
bound: at 3 plays/day × −4, a captain can manufacture at most ONE grudge to the −10 floor
per day, where before the cap it was three clicks and change. **The instrument gap is
T-198's brief.** An insult-playing policy is a new instrument BEHAVIOUR and its own arm, so
it was deliberately not added here — and X was NOT retuned on the strength of an
unmeasurable, which §4a explicitly forbids.

**The one thing still open is §5's last bullet: the exact rounds-per-tier NUMBERS.** They
ship as this document's own suggested table, marked `PROPOSED — awaiting owner confirmation`
in three places (the content constant, §5 below, and `docs/LIARS-DICE-DECISIONS.md` LD-23).
The SHAPE — more rounds at a higher tier — was already ruled and is what the mechanism
implements.

**THE CUMULATIVE ARC — the whole dawn-hand milestone in one table**, measured at 1,000 seeds
× 120 days × 8 policies = 8,000 runs at every step, and read straight off the six committed
aggregates in `docs/balance/`:

| baseline | clear rate | median credits | ships lost | encounters/run |
| --- | ---: | ---: | ---: | ---: |
| `t182-reroll-fix` (origin) | 0.5689 | 36,947 | 573 | 23.7580 |
| `t195-dawn-dice` | 0.6310 | 50,813 | 411 | 21.6256 |
| **`t199-pacifist`** | 0.6320 | 49,729 | 436 | 21.7868 |
| `t196a-free-actions` | 0.6305 | 49,517 | 465 | 21.7913 |
| `t196b-instruments` | 0.6342 | 49,839 | 487 | 22.2404 |
| `t197-hangout-caps` | 0.6329 | 49,839 | 492 | 22.2482 |

**T-199 IS NAMED EXPLICITLY IN THAT TABLE, AND IT IS NOT PART OF THIS ARC.** It is the
`smugglerPolicy` / `planPacifistCombat` fix (F-150-2, `assertNoIncomeStall` 7 violations →
0) and it happens to sit between T-195 and T-196a in baseline order. Folding its row into
"dawn-hand easing" would credit this milestone with an income-stall repair it did not make,
which is exactly why the row is called out rather than silently spanned.

**What the arc actually shows.** Nearly the whole easing is T-195's — the travel-die
bake-off moved clear rate 0.5689 → 0.6310 (+6.2 pp) and median credits 36,947 → 50,813
(+37.5%) in one step. Everything after it, T-197 included, is within ±0.4 pp of clear rate
and ±2.6% of median credits: **freeing the administrative and Hangout actions did NOT ease
the game measurably at the fleet level.** That is a real finding and the honest headline —
the freeing was a LEGIBILITY change (§1's actual complaint) and the numbers say it was paid
for in legibility rather than in difficulty. Ships lost drift back up across the arc (411 →
492) while encounters/run also rises (21.63 → 22.25), so the deaths track exposure rather
than a weakened captain. Both remain far under T-182's 573.

**Unlike T-196a/T-196b this is NOT a clean single-arm attribution, and the capstone says so
rather than implying otherwise.** That pair was a deliberate control-arm split (engine only,
then instrument only), so each moved exactly one fingerprint. T-197 moves BOTH
`rulesFingerprint` (the freed resolver, the two caps, two content constants) and
`instrumentFingerprint` (`planLoanBorrow`/`planLoanRepay`/`planDare` lose their `DieLedger`,
`planDare` and the gambler's loop gain the rounds mirror), so no arithmetic can split the
two causes in T-197's diff.

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
- **STILL OPEN (T-197 shipped the mechanism against the suggested numbers) — the exact
  rounds-per-tier numbers in §4b are a starting suggestion, not a ruling.** The question was
  surfaced to the owner before implementation and no answer had arrived at ship time, so
  T-197 shipped §4b's table verbatim as `LIARS_DICE_ROUNDS_PER_DAY = [1, 2, 2, 3, 3, 4]` and
  marked it `PROPOSED — awaiting owner confirmation` in three places rather than resolving it
  quietly: on the constant itself (`packages/content/src/liarsDice.ts`), in this bullet, and
  as `docs/LIARS-DICE-DECISIONS.md` LD-23. They stay cheap to change — that array is the only
  place they exist, and it is CONTENT — but the *shape* (more rounds at higher tier) is what
  is actually load-bearing for "rewarding good play," and the shape is ruled. **A revision is
  a content edit that owes a capstone**, diffed against `baseline-t197-hangout-caps.json`,
  not an argument from a fingerprint.

## 6 · What does NOT change

- Contract pricing (die-affects-price, replacing or supplementing Haggle) — a separate, still-
  open thread from the earlier bake-off, analytical only (NPCs don't Haggle, so it isn't
  simulable through the sweep the way travel was). Not part of M17.
- Hangout "atmosphere" (die shapes venue temperament) — same status, not part of M17.
- The travel die's mechanism (T-195, already shipped) — unaffected by this document.
- Any UI/tutorial work — M17 is the mechanical layer. T-194 is superseded as originally scoped
  and needs its own re-scope once M17's action list is final (see TASKS.md's T-194 block).
