# Explore & Player Power — standing rulings

**Status:** Standing decisions for the Explore verb, its outcome table and the surfaces that
grant player power, harvested 2026-08-02 from the 0.5.2/0.5.3 task log. The design record is
`docs/EXPLORE_REDESIGN.md` (§§2–9) and `docs/PLAYER-TRINKETS_SPEC.md`; this file carries the
rulings that bind future work, with pointers back to the reasoning.

Boundary rulings that generalize past Explore live in
`docs/CONTENT-ENGINE-DECISIONS.md`; measurement rulings live in
`docs/BALANCE-RIG-DECISIONS.md`.

---

## 1. The outcome table

**EX-1 — A content row carries ONE dial: `valuePoints`.** (T-100, T-111) Recovery length and
AP cost are derived by `recoveryDays(valuePoints)` / `apCost(valuePoints)` reading
`EXPLORE_VALUE_BANDS`; the row type deliberately has neither key, so the correlation between
power and cost is structural rather than hand-tuned. See `CONTENT-ENGINE-DECISIONS.md` CE-12.

**EX-2 — `ExploreValueBand.weight` is `25/33/24/15/3`** — `docs/EXPLORE_REDESIGN.md` §5.2
verbatim, summing to 100 with every weight positive. Summing to 100 is what makes a weight
readable as a percentage of successful boards and is what §5.3's per-row arithmetic
(`bandWeight / rowsInBand`) is computed against. (T-117)

**EX-3 — `drawOutcome(poiType, rng)` spends a FLAT TWO `rng.next()` calls, always:** one
band draw renormalised over the bands actually present in that pool, one uniform pick inside
the band. No single-id short-circuit — the legacy behaviour died with the model it
reproduced, and a content edit inside a band must never re-phase the day's stream.
Determinism order is §2.4's: POI type → flavour name → band → row → within-payload roll.
(T-117)

**EX-4 — Two structural invariants bind authoring, both reachability properties rather than
style rules.** (T-115) (a) Every band must have at least one row in every pool, because
`drawOutcome` renormalises within the pool it draws for. (b) Every shipped `EXPLORE_ITEMS`
entry is granted by exactly one row: no item orphaned, none granted twice.

**EX-5 — An `npc` row's `dispositionDelta` is a function of its BAND and nothing else** —
band 2 is 1–2 (an INTRODUCTION), band 3 is 3–4 (a DEBT) — validated per band so a band-2 row
cannot quietly buy band-3 standing. (T-115)

**EX-6 — A content pass may bias the item mix INSIDE an authored ceiling; it may not raise
the ceiling.** (T-114 / F-114-B) §5.2's ceilings are transcribed verbatim and a ceiling
change is a spec/owner call. T-115 upheld this and left §5.2 unchanged: band 2's `+1`
strength grant is worth `+0` on a PILOT check because `navBonus` divides by
`NAV_BONUS_DIVISOR = 10`, and **a ladder is supposed to have a tier where a component grant
is a rounding error and a tier where it is permanent.**

**EX-7 — The reachability sweep is 6,000 boards.** (T-115) §5.3 computes 1,351 for 95%
confidence on the eight band-4 rows at 0.375% each; 6,000 is deliberate margin. The three
partial-reachability tests collapse into one asserting all 100 rows are observed, naming the
missing ids in the failure message.

**EX-8 — The sealed-pod supply line rides three already-authored band-1 derelict `lore`
rows** (`flags['signal.contraband.pending']` → `derelict.sealed-pod` →
`smuggling.podsTaken`), chosen on fiction and argued row by row, because §5.3's per-band
counts are fixed. Rate measured 20% → 4.4% of successful boards over a 6,000-board sweep
through the real verb, with no tuning. (T-117)

---

## 2. Recovery, AP cost and the day loop

**EX-9 — The four recovery interaction cases are settled** (`docs/EXPLORE_REDESIGN.md` §3.3)
and later work inherits them: travelling away forfeits the op at dusk (by location
predicate); death clears the slot via succession without touching the chart; a second
Explore is refused; and an open recovery survives the day-30 `TourOneResolved` era flip
untouched. D1/T-131 left all four intact. (T-100, T-111)

**EX-10 — There is exactly ONE recovery slot, `player.recovery`.** A second Explore while it
is open is refused with a typed `recovery-in-progress` event and charges neither a die nor
fuel — **a refusal is free; it is not a failed attempt.** (T-111)

**EX-11 — Content drift clears the slot, never crashes and never invents a payout.** (T-111)
A stored recovery whose `outcomeId` or `poiId` no longer resolves emits
`RecoveryAbandoned{reason:'unknown-outcome'}` and clears the slot. Throwing and fabricating a
payout were both rejected. This is also what makes content-id deletion a non-save-surface
change (see `SAVE-FORMAT-DECISIONS.md` SF-6).

**EX-12 — D1 hybrid (owner ruling, 2026-07-31): bands 3–4 charge `apCost` EXTRA dice out of
the same dawn hand at claim** (band 3 = 2, band 4 = 3, on top of the sweep's own die),
resolving same-day; **band 2 keeps T-111's 1-day calendar recovery** untouched at a measured
42.1% collection rate. The full-uniform conversion was rejected because it forces a
`player.recovery` schema removal and a bigger single diff.

**EX-13 — No band may carry both `recoveryDays > 0` and `apCost > 0`.** A band is drawn
AFTER the nav check, with the sweep's own die and the 80 fuel already spent, so an `apCost`
row has no later dusk with a dawn hand left to charge against and can only resolve same-day.
The two costs are alternatives, never a sum — written as a content-table test, never a
comment. (T-131)

**EX-14 — The zero-die-commitment invariant survives NARROWED to band 2 rather than
disappearing.** Nothing may charge a die per recovery *day*; a same-day claim cost is not a
per-day cost, so what the rule banned — a die cost that scales with the clock — is still
banned. (T-131)

**EX-15 — The AP payment spends the LOWEST-VALUE unspent dice first**, stated as a rule so
the pick is never implementation-defined, and implemented by looping the existing
single-index `spendDie` — no second multi-die spend surface was invented. (T-131)

**EX-16 — A band-3/4 find whose dawn hand cannot cover `apCost` is FORFEITED** — no
downgrade, no partial payout — emitting `ExplorationFailed{reason:'insufficient-dice'}`,
while `PoiDiscovered` still fires so the player is told what was found and only that its
recovery failed. (T-131)

---

## 3. The player-power surfaces: Class A, Class B, and stats

**EX-17 — Explore item effects live in exactly TWO classes** (`docs/EXPLORE_REDESIGN.md`
§4): unbounded **Class-A** `ShipState`/`SPECIAL_EQUIPMENT` element deltas, and **Class-B**
die effects bounded at EXACTLY three modules routed through the pre-existing `DiceBenefit` /
`EQUIPMENT_DICE_BENEFITS` hook — `check()`'s signature does not move. A new explore reward
must fit one of the two; **a fourth die-granting module is a design change, not a content
row.** (T-100)

**EX-18 — Fitted modules are a LIST on `ShipState`, not optional booleans.** (T-112)
`exploreModules?: readonly ExploreModuleContentId[]`. F-100-1's sketched three booleans are
explicitly rejected: booleans force a second, WRITE-side switch keyed on a specific item id —
exactly what the effect surface forbids — plus a union member, a `hasSpecialEquipment` case,
a schema field and a backfill *per module*. The three-module bound now rests on §4.2's design
argument (the `MAX_EXTRA_DICE` clamp, the three-kind vocabulary) and a content test asserting
the table has exactly three keys, not on how tedious a fourth would be.

**EX-19 — Player-modifying trinkets: DO NOT BUILD.** (T-151) Unanimous 4/4, and a
full-engine rig (300 seeds × 8 policies × 35 days per variant, n=2,400 rows each, no-change
control proven byte-identical to production on 9/9 policy×seed full-JSON hashes) does not
overturn it. Candidate B (worn slots) was refused by all four reviewers on cost: a save bump,
a migration, a round-trip test, a succession rule, `effectiveStats` routing over 21 read sites
and a new UI pane. The bakeoff report is `docs/PLAYER-TRINKETS_SPEC.md`, which is the record.

**EX-20 — If the owner ever overrules EX-19, the spec is settled with no open question:**
NO slot (a one-time grant consumed into `player.stats`, forfeited on death — mandatory,
because `applySuccession` today RESETS the ship but CARRIES stats, so silence would make a
trinket the only acquired bonus that outlives its owner); `+1` as a LITERAL type so `+2` is a
compile error; **PILOT and TRADE only**; the Explore unique-item row at band 4 only; and no
save-shape change. (T-151 §8)

**EX-21 — GRIT is excluded because it is the one stat that genuinely works.** (T-151) `+1`
GRIT cuts ship losses 20% and `+2` cuts them 46%, landing entirely on the curve
`content/components.ts` ratifies as "held where it stands". The two stats that may safely be
touched buy a naive-choice regret of only 174–413cr against day-35 medians of 1,120–21,418.
Measured dead options were removed from scope by the data, overturning the spec's own
pre-measurement draft: `+1` GUNS changes 2.5% of campaigns; `+1` GUILE changes 2 campaigns
out of 2,400.

**EX-22 — A uniform stat band is wrong by ~4× BETWEEN stats.** (T-151) There are two check
families, and `+1` is worth the full +5pp only for read-off rolls the player does not choose
(GRIT), against +1.28pp for every spent-die stat, where a 5-die hand already clears DC 12 at
96.88%. **Any future stat-bonus design must size the bound per check family, not uniformly.**

**EX-23 — A stat trinket is NOT the second check-level modifier surface that ruling 2
reserved for a fresh owner call** (unanimous 4/4): it touches no `DiceBenefit`, no
`dawnDiceModifiers` and not `check()`'s signature — it changes `statValue`, the argument
`check()` has always taken. **But answering NO does not clear it:** both throttles that keep
Class A and Class B honest — the `/10` `NAV_BONUS_DIVISOR` damping and the three-module cap —
are inapplicable to a stat delta *by construction*, so any bound on a stat delta must be set
by hand, deliberately. (T-151)

**EX-24 — The "±1–2, mirroring ship-component deltas" framing is false twice over and must
not be reused.** (T-151) Component deltas are damped 10:1 and feed ONE reader; a stat delta is
undamped and feeds EVERY reader of that stat. `navigation +10` is the first delta in the whole
content table that buys a whole `+1`, and it is one of only five band-4 items. Separately,
routine travel is no longer a PILOT check (T-1605) — only the one-time Nemesis Crossing
survives, so PILOT's recurring surface is the Explore nav DC 12 plus combat retreat.

---

## 4. The verdict of record

**EX-25 — Explore is STILL a net credit loss, and the gap narrowed rather than closed.**
(T-116) 85 of 120 seeds finish richer WITHOUT the verb, down from 101/120 pre-rebuild
(`docs/EXPLORE_REDESIGN.md` §9). **Re-pricing to make it positive is an owner call, not a
build task's.**

**EX-26 — Explore's per-outcome event rate is ~10× lower BY DESIGN and is not a regression
to price back out.** (T-115) A board used to walk three independent legs and now draws one row
of a hundred. Read fixture figures against their predicted share, per
`BALANCE-RIG-DECISIONS.md` BR-27.
