# The Hangout — standing rulings

**Status:** Standing decisions for the Spacers Hangout, its fourteen authored ports and the
lending desk, harvested 2026-08-02 from the 0.5.2/0.5.3 task log. The design record is
`docs/HANGOUT_REDESIGN.md`; this file carries the rulings that bind future work.

The boundary rulings that generalize past the Hangout (parameter-only content, no per-port
engine branch, accessors, mirrors) live in `docs/CONTENT-ENGINE-DECISIONS.md` §1 and are
not repeated here. Liar's Dice — the Dare venue's resolver — has its own file.

---

## 1. Reach

**HO-1 — Only the fourteen core spaceports (ids 1–14, Sol-3 … Vega-6) carry `hasHangout`.**
(T-121, `docs/HANGOUT_REDESIGN.md` §4.5) The rim (15–20), Andromeda (21–26), MALIGNA (27) and
NEMESIS (28) get no venue — and a non-empty un-flagged set is what keeps
`ActionBlocked{'no-hangout'}` reachable at all. Negative/refusal tests therefore target
Antares-5 (15), never a core port.

**HO-2 — `hasHangout` and the `PORT_HANGOUTS` key set must be equal in BOTH directions.**
(T-121, §2.2 ruling 3) A flag without a row, or a row without a flag, is a defect, not a
configuration.

**HO-3 — The `PORT_HANGOUTS` table is CLOSED at fourteen authored rows.** (T-124) T-121's
`baselineHangout(id)` builder is deleted along with its `STAR_SYSTEMS` import, so an
unauthored port cannot be added silently. A future port needs an authored row, not a
generated one.

**HO-4 — A port's governance/lawfulness is a content axis INDEPENDENT of the
`isRim`/contraband flag.** (T-101 §6.2) Core systems need not be uniformly safe: a partisan
faction, a seedy underbelly or a strict garrison world are all core-compatible. "Exotic" and
"dangerous" ports are not reserved for rim-flavoured reskins.

---

## 2. The authored register

**HO-5 — The fourteen-port register spread is fixed at 6 `everyday` / 4 `exotic` /
2 `dangerous` / 2 `comic`,** with all four of §6.1's registers represented. Two comic rooms
rather than one, because a single comic port is a novelty and two are a register. (T-124)

**HO-6 — Tone must correlate with the numbers, quantified over ALL authored ports** so later
passes inherit it unedited: a non-`everyday` port moves at least two of the six mechanical
axes; a `dangerous` port is strictly harsher than the default on at least one consequence
axis; an `exotic` port is unusual on stakes, regulars or venue set. (T-123 §6.1)

**HO-7 — `comic` is graded as the exact NEGATION of `dangerous`** — no harsher than the
default on any of the four clauses the `dangerous` test uses — so both registers are judged
on one axis set. Denebola-5 is the strict per-axis softest authored port, the forgiving pole
mirroring Arcturus-6's maximality. (T-124)

**HO-8 — Ports may share a register but must not share an axis vector.** (T-124) Pollux-7 is
explicitly not a second Altair-3: Altair-3 moves one axis, Pollux-7 moves four. Sharing
`tone` is not sharing identity.

**HO-9 — Altair-3 (the Waypost) is the deliberate NUMERIC MEAN of the table.** (T-122) Its
`wager` and `venueParams` are omitted rather than restated, and it is distinct on
`clientele` alone — the one axis no sim policy reads — so it satisfies §6.4's
set-cardinality rule while staying a clean measurement control. The mean is pinned by a
named test so a later pass cannot quietly tune it.

**HO-10 — A port may vary a venue's TERMS but may never withhold a venue that is the only
path to a galaxy-wide safety guarantee.** (Owner ruling D7, T-133; F-123-2)
`ARCTURUS_6_HANGOUT` originally omitted `borrow`/`repay`, which deleted §7.5's anti-poverty
escape hatch at that port entirely — a captain with an empty purse and a dry tank was
typed-refused and stayed stranded. The fix was to keep the desk open everywhere and vary the
PRINCIPAL BAND instead.

---

## 3. Venues

**HO-11 — Exactly one new engine event value was added for refusal, `'venue-not-offered'`,
evaluated BEFORE `spendDie`,** routed through the existing `failVenue` split so it lands on
`HangoutEvent` for the five social venues and on `LoanEvent` for `borrow`/`repay`. Refusing a
venue therefore spends no die, moves no credits and writes no loan. (T-120)

**HO-12 — The seventh venue, `'rumor'`, deliberately gets NO dispatch.** (T-132)
`VisitHangout{rumor}` would spend a die to emit exactly the free `hangoutRumors(nextState)`
output the pane already renders every frame, so a paid affordance is strictly dominated. The
omission is marked by a comment at the dispatch site rather than left to be rediscovered as
a gap.

**HO-13 — The three social venues dispatch through ONE `visitSocial(venue, opponentId)`
function**, venue as a parameter, reusing the exact `VisitHangout` shape `visitDare` already
established — no per-venue rule branch. A future venue extends the parameter; it does not get
its own dispatch function. (T-132)

---

## 4. The lending desk

**HO-14 — D7 scope boundary: a port owns the loan PRINCIPAL BAND only.** (T-133) The rate
(`LOAN_DAILY_RATE`), the term (`LOAN_TERM_DAYS`) and the lender (`LENDER_ID`) stay global — a
port decides how deep the desk goes, never what it charges — so there is still exactly one
lender of record and one `LoanState` slot.

**HO-15 — Per-port lending variation is a `PortHangout` content field read through a rule
accessor:** `loanBand?: { min, max }` read by `loanBandFor(systemId)` beside `wagerBandFor`.
`DEFAULT_PORT_HANGOUT.loanBand` defaults to the global bounds, so unauthored ports are
behaviour-preserving by construction, and every reader (engine `borrowLoan`, UI
`lendingTerms`, sim `protocol.ts`) clamps through the accessor rather than the constants.
(T-133)

**HO-16 — Arcturus-6 is the game's one tight credit desk** — `loanBand.max = 1000` with the
full venue set: tight, not absent. All thirteen other authored ports and the default row
resolve to the global bounds. (T-133)

**HO-17 — On port change the pane RE-CLAMPS (never resets) the in-flight loan principal
against the new port's band,** so a captain who reopens the credit desk elsewhere never sees a
number the local quartermaster will not honour. (T-133)

---

## 5. The measured record

**HO-18 — F-101-1 is partly REFUTED at the top end: the declared wager band, not the
dealer's purse, is the live constraint.** (T-123, confirmed T-125 §10.5 at band 88.93% /
dealer 10.97%.) Measured over 1,319 hands: Regulus-6's declared 500/3,000 realized a max of
3,000 with the dealer binding on 5% of hands; Sol-3's ceiling was operative on 60% of hands
against 0.8% dealer-capped. Cause: the N-series moved the cast's day-120 median wealth
21,884 → 76,049. **Nothing was compensated in either direction** — the band was neither
lowered because the floor proved affordable nor raised because the ceiling proved reachable.

**HO-19 — The NPC-side `VisitHangout` parity gap and the socialize credit faucet are
owner-gated, not build-task business.** See `docs/BALANCE-RIG-DECISIONS.md` BR-54 (the faucet
stays open at 0.22% of terminal NPC wealth) and BR-55 (the PARITY LEDGER row stays deferred
until the cast plays through the real resolver).

---

## 6. The action economy (M17)

**HO-20 — ALL SEVEN Hangout venues are FREE ACTIONS, and one shared daily POOL — not a
per-NPC ledger — is what bounds the three that move disposition.** (T-197, owner ruling
2026-08-04, `docs/DAWN-HAND-REDESIGN.md` §3/§4a.)

`dare`-open, `meet`, `befriend`, `insult`, `rumor`, `borrow` and `repay` lost their dawn-die
cost. `Dare{move:'peek'}` did not, and is now the only die spend left anywhere in the
Hangout family — it is the one real check inside an open hand.

The pool is `SOCIAL_PLAYS_PER_DAY = 3` plays per day, shared by exactly `meet`, `befriend`
and `insult`. Its grain was ruled twice in one day and the second ruling stands: an earlier
draft made it per-NPC-per-day (Meet and Befriend each once per captain), and the owner
superseded that with the flat daily pool. **The three shapes that were presented and NOT
chosen, logged so a later reader does not re-propose them as new:** (1) per-(npcId, venue)
per-day, (2) a hybrid pool-plus-per-NPC, (3) leaving Befriend a Main Action.

**Why the pool and not something finer.** A per-NPC cap bounds a relationship; it does not
bound the INSULT FARM, which needs only one captain and a repeat. A flat daily total prices
a manufactured grudge at a whole day's plays no matter who it is aimed at — the exploit §4a
actually names — and carries no per-captain bookkeeping onto the save.

Three properties make the pool a rule rather than a counter, and all three are load-bearing:

1. **`SOCIAL_PLAYS_PER_DAY` is CONTENT** (`packages/content/src/hangout.ts`, beside
   `MEET_DISPOSITION`). Tuning X is a content edit, exactly like tuning the deltas it sits
   next to; the engine owns only the arithmetic that reads it.
2. **A play is spent when the action RESOLVES, whatever the outcome** — a FAILED Befriend
   check spends one. A typed refusal spends nothing, which is the same "a refusal is never
   charged" convention every pre-resolution fail in `resolveVisitHangout` kept for the die.
3. **A spent-out pool refuses TYPED (`social-limit-reached`), never silently**, and the
   count is rendered beside the controls (`social-plays-left`) so the refusal can never be
   the first the player hears of the cap.

`rumor` (read-only), `borrow` and `repay` (single-loan slot + credits) draw from NEITHER
cap: they already had a real bound, which is the whole of §3's test. `dare`-open has §4b's
rounds cap instead — see `docs/LIARS-DICE-DECISIONS.md` LD-22.

**HO-21 — Free Befriend rolls an INTERNAL d20 against the port's authored DC.** (T-197,
owner ruling 2026-08-04, `docs/DAWN-HAND-REDESIGN.md` §5.) The resolver was
`check(die, GUILE, dc)` — the spent die WAS the roll — so freeing Befriend left the check
with nothing to roll. Ruled: draw a d20 from the action's own rng. The `check()` call, the
`StatCheck` event and every port's authored `befriend.dc` stay live and unchanged. What is
knowingly given up is the player's ability to AIM a chosen die at this check; the owner
accepted that as part of the same pool ruling. Logged not-chosen: keep Befriend a Main
Action (smallest change, breaks the "the Hangout is free" story), or drop the check entirely
(deletes a die-matters moment and kills the DC content at fourteen ports).

---

## 7. Harvested 2026-08-06 (T-203, T-204)

**HO-22 — The standing cue must be readable BEFORE the player commits, not buried post-open.**
(T-203.) An unconditional `hangout-npc-standing` tag on every pool-B roster row
(`App.tsx:2448`) shows the band before a table is even opened, and `dare-dealer-history` renders
beside `dare-dealer-name` for the life of the hand. The same rule BARS the tag from pool-A rows —
`packages/ui/e2e/hangout.spec.ts:478-480` asserts zero `hangout-npc-standing` nodes inside
`hangout-roster-opponent`, because a pool-A seat has no `NpcState` and therefore no standing, and
a synthesized neutral band would be a FALSE cue rather than a harmless default.

**HO-23 — "Hangout" → "Cantina" is a PLAYER-FACING TEXT rename ONLY.** (T-204, owner-scoped.)
Authored prose string values, UI labels, tooltips and `aria-label`s change; file names, exported
symbols, `hasHangout` / `PORT_HANGOUTS`, `HangoutTone` / `HangoutProse`, comments, test names and
the save schema's `z.literal('VisitHangout')` do NOT. Renaming the save literal is a save-shape
change owing its own migration and was explicitly DEFERRED by the owner, not forgotten; going
further is its own scoped task. Related hazard, recorded because it bites silently: when renaming
a word that appears in a NEGATIVE assertion, EXTEND the pattern to cover both words — `npc.test.ts`'s
`VENUE` regex was strengthened to `/hangout|cantina|\bbar\b|tables?/i`, because a guard that stops
matching stops guarding, and it does so green.

**HO-24 — The rename Accept clause's "zero hits" is RECONCILED, not literal.** (T-204.) A raw
`grep -ci hangout packages/ui/src` cannot reach zero because HO-23's out-of-scope list preserves
`data-testid`s, `railsProps('hangout')`, imported symbols and comments. Read via the criterion's
own "authored STRING VALUES … not field/type names", the AST-accurate remainder is exactly 14
hits, none player-facing: 12 test-name/`describe` strings plus `liarsDiceValidation.ts:133,138`
(developer-facing validation errors naming the `hasHangout` identifier).
