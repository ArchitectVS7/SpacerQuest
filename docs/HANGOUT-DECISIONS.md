# The Hangout — standing rulings

**Status:** Standing decisions for the Spacers Hangout, its fourteen authored ports and the
lending desk, harvested 2026-08-02 from the 0.5.2/0.5.3 task log. The design record is
`docs/HANGOUT_REDESIGN.md`; this file carries the rulings that bind future work.

The boundary rulings that generalize past the Hangout (parameter-only content, no per-port
engine branch, accessors, mirrors) live in `docs/CONTENT-ENGINE-DECISIONS.md` §1 and are
not repeated here. Liar's Dice — the Dare venue's resolver — has its own file.

---

## 1. Reach

**HO-1 — Only the fourteen core spaceports (ids 1–14, Sun-3 … Vega-6) carry `hasHangout`.**
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
3,000 with the dealer binding on 5% of hands; Sun-3's ceiling was operative on 60% of hands
against 0.8% dealer-capped. Cause: the N-series moved the cast's day-120 median wealth
21,884 → 76,049. **Nothing was compensated in either direction** — the band was neither
lowered because the floor proved affordable nor raised because the ceiling proved reachable.

**HO-19 — The NPC-side `VisitHangout` parity gap and the socialize credit faucet are
owner-gated, not build-task business.** See `docs/BALANCE-RIG-DECISIONS.md` BR-54 (the faucet
stays open at 0.22% of terminal NPC wealth) and BR-55 (the PARITY LEDGER row stays deferred
until the cast plays through the real resolver).
