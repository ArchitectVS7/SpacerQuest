# Liar's Dice & Progression — standing rulings

**Status:** Standing decisions for the Dare venue's Liar's Dice scene and its opponent
progression, harvested 2026-08-02 from the 0.5.2/0.5.3 task log. The design record is
`docs/LIARS-DICE_REDESIGN.md` (the scene) and `docs/LIARS-DICE-PROGRESSION_SPEC.md` (the
roster, ladder and purse); this file carries the rulings that bind future work.

`docs/LIARS-DICE-PROGRESSION_SPEC.md` is the **settled authority** for the 42-row
`LIARS_DICE_OPPONENTS` table, the four AI archetypes as concrete decision rules, the
five-rung ladder, every resolver validation site the dynamic dice-count ripples into, the
"Read the Table" copy, the bounded-betting ceiling multiplier, the synthesized achievement
signal and the persisted per-opponent purse. Its §0 ground truth was verified at HEAD.
**Downstream tasks must not re-derive any of it.** (T-144)

---

## 1. The scene

**LD-1 — Scene state lives as a new TOP-LEVEL `GameState.dareHand`, sibling to
`encounter` — not nested under `player`.** (T-134) The reason generalizes: **a Dare hand is a
scene like Combat, not player-owned data like `dawnHand`.**

**LD-2 — `venue: 'dare'` opens a scene instead of resolving inline, and the OLD single-check
Dare is fully REPLACED.** (T-135) Keeping the one-shot path as a fallback was explicitly
rejected. `actions/hangout.ts`'s `'dare'` case now only opens the hand;
`packages/engine/src/actions/dare.ts` owns resolution.

**LD-3 — Each move (open/bid/raise/raise-both/challenge/fold) is its own
`applyPlayerAction`, mirroring Combat's multi-turn shape** — one `Dare` action is one PLAYER
move plus the dealer's answer computed in the same call off the same forked rng, so the
returned state is ALWAYS player-to-act. (T-135)

**LD-4 — Unlike `resolveCombat`, `actions/dare.ts` NEVER throws.** Every player-possible
input resolves to a typed `HangoutEvent{venue:'dare', failReason}`, so sim drivers never need
a special case. (T-135)

**LD-5 — The Dare is NOT disposition-neutral: three per-outcome arms (win / loss / FOLD)
through a content field on the `venueParamsFor` surface.** (T-134) The disposition-neutral
alternative was rejected because T-125's measured interceptor lift is driven by *voluntary
Dare disposition* — `DARE_WIN_DISPOSITION` / `DARE_LOSS_DISPOSITION` are what earned the
Hangout its fourteen ports — so neutrality would have cost that result.

**LD-6 — Ante is a `PortHangout`-readable RULE, never a per-port constant:**
`round(band.max * 0.03)`, floor 1, doubled for RAISE BOTH, clamped to remaining headroom per
raise. The seed wager stays player-chosen inside the port band, and the Peek check is a second
die before the first bid at DC 12. (T-134)

**LD-7 — Exploit closure is a RULE, not a reference:** RAISE FACE is pinned to F→F+1 with
quantity unchanged; FOLD forfeits seed plus all accumulated antes to escrow. Wildcards
(ones-as-wild) stay permanently out of scope. (T-134)

**LD-8 — FOLD can never be made strictly dominant by tuning a constant.** (T-137) By
derivation `EV_challenge − EV_fold = P_false · pot ≥ 0` always, so FOLD is never strictly
dominant, is weakly dominated by CHALLENGE everywhere, and is strictly dominated wherever
`P_false > 0`. Measured: 0.03% taken, 5/5 observed folds in the strictly dominated set,
and ablating FOLD entirely moves EV/hand by +0.16%. **Changing this requires changing what
FOLD pays, not a number.**

---

## 2. The presentation

**LD-9 — The scene uses real CSS-3D d6s via `transform-style: preserve-3d` — no WebGL and no
3D engine.** GSAP is the one animation dependency (credited in `docs/CREDITS.md`), scoped to
the single job CSS keyframes cannot do cleanly: the staggered, callback-bearing reveal
timeline. Every other visual — cubes, pips, glow, shroud — stays plain CSS. (T-136)

**LD-10 — Every animation must also run in a synchronous INSTANT mode.** Under reduced motion
the GSAP timeline object is never created, so the settled DOM exists on the very next render.
This is what lets the e2e suite assert real state instead of racing animation timing, and the
spec runs under `emulateMedia({ reducedMotion: 'reduce' })` for exactly that reason. (T-136)

---

## 3. The roster

**LD-11 — The roster is FIXED at 42 rows — exactly 3 per `hasHangout` port** — with seat,
archetype and bankroll fully determined by port per T-144's table (bad ×7 / random ×7 /
mixed ×14 / optimal ×14), authored in `packages/content/src/liarsDice.ts` and validated at
load time. A later content pass must keep the per-port determinism and the archetype spread
rather than appending free-form rows. (T-145)

**LD-12 — The fixed-roster lookup is a PARALLEL branch alongside the existing 30-captain
roaming-NPC resolver, not a replacement.** The roaming path is untouched and its tests must
keep passing; future opponent work extends the roster branch rather than folding the two
paths together. (T-145)

**LD-13 — A roster opponent is recorded in `player.liarsDiceBeaten` exactly once, on first
defeat.** The one-time-ness rides ENTIRELY on T-145's `includes` de-dup guard plus the
roaming-pool gate; T-147 deliberately added no second de-dup mechanism, because **two guards
for one invariant is how they drift apart.** (T-145, T-147)

**LD-14 — Set-closure is DERIVED FROM THE AUTHORED ROSTER, never from a literal count.**
(T-147) `liarsDicePortCleared` / `liarsDiceRosterCleared` iterate `LIARS_DICE_OPPONENTS`
rather than testing against 3-per-port or 42-total, so a content pass that adds a fourth seat
or a fifteenth house moves the rule with it instead of leaving the capstone earnable one seat
early.

---

## 4. The ladder

**LD-15 — `liarsDiceTier` is called in exactly TWO places, and a third call site is a bug.**
(`docs/LIARS-DICE-PROGRESSION_SPEC.md` §4.6, T-146) (1) `actions/hangout.ts`'s open arm,
which FREEZES the tier's effects onto `dicePerSide`, `maxQuantity` and `bandMax` once at
open, so a mid-hand threshold crossing or a content edit can never move a hand already in
progress; (2) `ui/format.ts`'s pre-hand `dareWagerBounds`, legitimate only because there is
no hand yet to read a frozen field off.

**LD-16 — Five doubling rungs (5/10/20/40/80), with the off-by-one pinned so the settling
hand itself still plays at its OLD tier.** Dice go 4→5→6, hard-capped at six forever. Tier 4
raises the bounded-betting ceiling via `effectiveWagerBand` (`max × LIARS_DICE_RAISED_CEILING_MULT`)
with the ante scaled alongside it so a raise is not free relative to a tripled pot. Tier 5
sets `bandMax: null` and removes the band clamp at both ends, leaving the pre-existing
solvency clamp as the sole remaining ceiling. (T-146)

**LD-17 — F-146-2 is an ACCEPTED CONSEQUENCE, not a reason to change the ruling.** (T-146,
`docs/LIARS-DICE-PROGRESSION_SPEC.md` §4.4) Tier 4's ×3 multiplier triples per-side
*whole-hand* exposure, not just the seed, because `headroomFor` reads the same ceiling.
Measured at T-148: 1.527 → 2.194 bids/hand, +43.7%.

**LD-18 — F-146-3: the ladder LOWERS the baseline's Dare win rate, and that is the honest
direction.** (T-146) Pinned gambler runs, tier pinned at 0 vs ladder live: 299 → 284 hands,
82.6% → 80.6% win rate, +109,380 → +61,134 net (EV/hand 366 → 215). Cause: the baseline
opener claims `(own(F*), F*)`, true by construction, and a bigger hand makes that claim a
smaller share of the dice in play, so the free wins F-135-1 named get rarer. **Nothing was
tuned in response.**

**LD-19 — F-148-4 / F-146-1 may NOT be fixed by teaching `planDare` the effective band
directly** — that needs a third `liarsDiceTier` call site, which §4.6 rules a bug. The §4.6
amendment (or a rule that hands out the effective band without a third read) comes first, the
edit second, and neither is improvised inside a measurement task. (T-148)

---

**LD-21 — F-137-1 is CLOSED by the OPENING LATTICE (§16.2 shape (b)), not by the dealer's
fallback (shape (a)).** (T-160, 2026-08-02, `docs/LIARS-DICE_REDESIGN.md` §17)

*Shipped:* an opening claim must EXCEED what the bidder holds of the claimed face —
`minOpeningQuantity(own) = own + 1`, enforced in `isLatticeMove`'s `bid` arm through a new
REQUIRED `ownOfClaimedFace` parameter (the T-146 `maxQuantity` precedent, so every call site is a
compile error until it is updated). Measured: openers guaranteed true **100.00% → 0.00%** on both
pools, player win rate 80.30% → **61.07%**, EV/hand +565.8 → **+197.3 cr** (n = 101,616).

*Not chosen, and logged as such per D1/D7:* **shape (a), the dealer's fallback** — make
`dealerMove`'s terminal fallback the cheapest legal raise and reserve CHALLENGE for the surplus
test. Implemented in full, simulated on identical seeds, and it **lost on two pre-committed
criteria**: (i) it cannot remove the risk-free opener at all — openers stayed **100.00%**
guaranteed true on both pools, because the defect is in the CLAIM and (a) only changes the ANSWER
to it; (ii) its win rate **73.04%** fell outside the pre-committed 55–70% band. It is also scoped
to `dealerMove`, i.e. pool B, so it left the 57% of hands that are pool A untouched. **(a) is not
dead:** it is an independent lever that remains available on top of the shipped (b) — see F-160-2
— and would need its own bakeoff.

*Explicitly NOT a candidate, at T-137's own ruling and still:* §16.2's third shape, teaching
`planDareMove` to open above its own count. It moves the measurement without moving the game. The
planner DOES now open one higher, but because the RULE moved under it — `isLatticeMove` refuses
`quantity <= own(face)` for every actor, human included — and the planner still makes the smallest
claim the lattice permits.

**LD-22 — the challenger-won split's ≤20 pp criterion was not met by EITHER shape, and it was
reported as a miss rather than softened.** (T-160) Shipped: dealer-as-challenger 40.73% vs
player-as-challenger 82.43%, 41.7 pp apart (T-137: 5.32% vs 94.92%). The residual has a named
cause the criterion did not price — the player's planner challenges selectively while the dealer
challenges by default — so a gap is expected. **No threshold was edited.** Filed as F-160-2.

---

## 5. Open owner call

**LD-20 — F-148-1, F-148-3 and F-137-1 are ONE owner call, not three, and its order is
fixed:** close F-137-1 (the guaranteed-true opener) first, re-run the capstone's Arm 2, and
only *then* look at the archetypes. **Explicitly rejected as first moves:** retuning
`BAD_CREDULITY` or `archetypeMove` — the policies do what they are specified to do, so
retuning papers over F-137-1 — and reweighting the four tone mixes toward the *harder* seat,
which is circular, because `bad` is only harder *because of* F-137-1. (T-148)

> **T-160 (2026-08-02) discharged the FIRST step of LD-20's fixed order and nothing further.**
> F-137-1 is closed (LD-21), Arm 2 was re-run at 101,616 hands, and the archetypes were
> re-measured without being touched. **The inversion survived** — `optimal` 64.48% vs `bad`
> 51.98%, z = −21.02 — so it is only partly downstream of F-137-1 and is refiled as **F-160-1**.
> LD-20's remaining two steps (F-148-1 and F-148-3) are still the owner's, and the two things it
> explicitly rejected as first moves remain rejected: no `BAD_CREDULITY` / `archetypeMove` retune
> and no reweighting of the four tone mixes happened here.

Ladder pacing (`LIARS_DICE_UNLOCK_GAMES`), the `CONQUEROR` renown threshold and the
instrument's own seating rule are owner-gated and covered in
`docs/BALANCE-RIG-DECISIONS.md` Part G.

---

## 6. The action economy (M17)

**LD-23 — Opening a hand is a FREE ACTION, and a ROUNDS-PER-DAY CAP that scales with
`liarsDiceTier` is what replaced its die.** (T-197, `docs/DAWN-HAND-REDESIGN.md` §4b; owner:
*"clamp liars dice at X number of rounds, scaling with a player's rank in liars dice
(rewarding good play)."*)

Four things about the cap are rulings rather than implementation details:

1. **It reuses the EXISTING rank variable at the EXISTING call site.** `liarsDiceTier` is
   read exactly once per open, at `actions/hangout.ts`'s tier-freeze site, and §4b's cap is
   evaluated from THAT read — no second progression variable, and no second tier read inside
   the resolver. (`liarsDiceRoundsRemaining` in `liarsDiceRules.ts` adds a third
   `liarsDiceTier` call for the UI, the protocol enumerator and the gambler's loop bound;
   that is a rule ACCESSOR with no hand to read a frozen field off, which is the distinction
   the file header's "a third call site is a bug" paragraph now records explicitly.)
2. **The counter increments AT OPEN, not at settlement.** A hand persists across save/reload
   and can straddle dusk, so a settlement-counted round would let a hand opened before dusk
   dodge the dawn reset entirely. §4b's "a round is one settled hand" defines the round's
   UNIT; the OPEN is when the day's allowance is spent. A fold still settles the hand, so an
   open-and-fold burns the round — **the cap cannot be laundered through folds.**
3. **A refused open draws NO rng and mutates nothing.** The check sits above the dice draw
   and the escrow debit, so a day on which the player tried and was refused has a
   byte-identical rng stream to a day on which they never tried.
4. **The counter lives on the SAVE** (`player.dareRoundsToday`, `CURRENT_SAVE_VERSION`
   15 → 16), because a mid-day reload that cleared it would make the cap advisory.

**THE EXACT NUMBERS ARE CONFIRMED (owner, 2026-08-05, ruled at T-198 R3, shipped at T-202).**
`LIARS_DICE_ROUNDS_PER_DAY = [1, 2, 3, 4, 5, 6]` (`packages/content/src/liarsDice.ts`, indexed
by tier 0-5) — a strict +1/tier climb, revised UP from the `[1, 2, 2, 3, 3, 4]` suggestion T-197
shipped. The owner's reasoning: the simulated ceiling for an always-wins gambler playing every
free round is high, but real play at these odds still loses ~40% of individual hands, and
rewarding a risky gambler archetype with the credits to buy fast drives/cloaking and run a
scoundrel playstyle is an ACCEPTED, INTENTIONAL outcome rather than an exploit to close. The
revision was a CONTENT edit and paid its capstone,
`docs/balance/baseline-t202-liars-dice-ceiling.json`, diffed against
`baseline-t197-hangout-caps.json`. **That capstone came back byte-identical on all eight policy
rows, and that is an INSTRUMENT-GAP NULL RESULT, not a verdict**: the sim's gambler plays
`min(GAMBLER_MAX_DARES_PER_DAY = 2, liarsDiceRoundsRemaining(state))` and is the only policy
that plans a Dare at all, so it plays `1,2,2,2,2,2` hands by tier under BOTH tables and cannot
exhibit tiers ≥ 2 of the ruled ceiling. Measuring it needs a gambler arm bounded by the
engine's own accessor — a new instrument BEHAVIOUR and its own task (F-202-1, `TASKS.md` T-202).

**Superseded — the `PROPOSED` framing as it shipped at T-197, kept for the record:**

**THE EXACT NUMBERS ARE PROPOSED, NOT RULED — awaiting owner confirmation.**
`LIARS_DICE_ROUNDS_PER_DAY = [1, 2, 2, 3, 3, 4]` (`packages/content/src/liarsDice.ts`,
indexed by tier 0-5) ships as §4b's own suggested table, which that section explicitly calls
"a starting suggestion, not a ruling". **What IS ruled is the SHAPE** — monotone
non-decreasing in tier, so playing well buys table time. The question was surfaced to the
owner before implementation and no answer had arrived at ship time; the numbers are marked
`PROPOSED` at the constant, in §4b, and here, and they are cheap to change because this
array is the only place they exist. **Retuning them is a CONTENT edit and must be measured
by a capstone, not argued from a fingerprint** — T-197's own capstone measured the shipped
table and is the baseline any revision diffs against.
