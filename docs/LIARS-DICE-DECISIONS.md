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
> **RULED AT T-177 (2026-08-06) — see LD-26.** LD-8's final sentence is exactly why shape (C),
> *change FOLD's economics*, was rejected: it is a change to what FOLD PAYS, so it needs the full
> capstone + 8,000-row sweep + re-derivation, and it re-opens LD-7's closed exploit fix ("FOLD
> forfeits seed plus all accumulated antes"). LD-8's derivation itself is **untouched and still
> stands**: FOLD remains weakly dominated by CHALLENGE in credits, everywhere. LD-26 rules that this
> is acceptable because the credit ledger is not the only one the move is priced in.

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

> **SUPERSEDED AT T-176 (2026-08-06): (a) IS NOW DEAD.** It got the bakeoff this paragraph reserved
> for it — on top of the shipped (b), identical seeds, 1,600 gambler careers × 120 days — and **lost
> on the same criterion, C2, in the opposite direction**: player win rate **39.64%** against the
> 55–70% band (T-160's (a) measured 73.04%, above it), EV/hand **−314.9 cr**, and the only invariant
> violation in 3,200 careers. It is also unnecessary: the re-derived split criterion C3′ passes
> **without** it. See LD-22's T-176 block and `docs/LIARS-DICE_REDESIGN.md` §18.6. The sentence
> above is left verbatim — it was true when written, and what changed is the evidence, not the
> record.

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

> **T-176 (2026-08-06) RE-DERIVED THE CRITERION AND RAN SHAPE (a) ANYWAY. F-160-2 IS CLOSED, AND
> (a) IS NOW DEAD RATHER THAN DORMANT.** (`docs/LIARS-DICE_REDESIGN.md` §18.)
>
> **THE RE-DERIVED CRITERION, C3′, WRITTEN BEFORE THE ARM RAN.** C3 compared two rates over two
> DIFFERENT challenge populations. C3′ holds the evidence fixed at
> `k = bid.quantity − own(bid.face)` — the sufficient statistic BOTH sides' margins are written in,
> since each tests `surplus = k − dicePerSide/6` against `1.5`. Three limbs: **(a)** direct
> standardisation onto a common `(k, dicePerSide)` distribution, **still at T-160's own 20 pp, which
> was NOT edited**; **(b)** a Kitagawa decomposition of the raw gap into composition and rate, with
> composition required to carry ≥ 50% — the falsifiable form of "the selectivity is the cause";
> **(c)** an absolute floor, `p_backed > 50%` per side per pool, derived from the two margins' own
> docblocks ("more likely false than true") rather than picked. The obvious floor —
> "realised ≥ `1 − probAtLeast(k, d)`" — was **rejected in writing before the run** because it
> prices the claimant as non-strategic, which is the exact assumption T-175's `probClaimTrue`
> disproved in this codebase; measured afterwards, every single cell falls below it, on both sides.
>
> **MEASURED, PER POOL, ON THE SHIPPED INSTRUMENT** (`HangoutPlayStats.dareChallengeCells`,
> 1,600 gambler careers × 120 days, **n = 279,857 hands**, `dareChallengeDisagreements` 0):
>
> | pool | dealer-as-challenger | player-as-challenger | raw gap | standardised gap | composition share |
> | --- | --- | --- | --- | --- | --- |
> | B (roaming) | 43.24% (n=146,360) | 90.03% (n=9,847) | 46.79 pp | **19.29 pp** PASS | **70.4%** |
> | A (roster) | 65.81% (n=97,681) | 92.30% (n=19,852) | 26.49 pp | **10.09 pp** PASS | **70.3%** |
>
> **THE GAP IS ~70% COMPOSITION, AND THE COMPOSITION IS STRUCTURAL.** The shipped planner played
> **ZERO** evidence-unbacked challenges in 29,699 (branch (c4) needs *no legal raise to exist*,
> which never happened in 279,857 hands); the dealer is 42.5% / 22.9% unbacked and wins 5.92% /
> 11.43% there. All four `p_backed` clear the floor (70.8% / 90.0% / 82.0% / 92.3%). **F-160-2's
> named mechanism is confirmed and quantified rather than asserted.**
>
> **SHAPE (a) WAS RUN BECAUSE THE CRITERION SAID IN ADVANCE IT WOULD BE, AND IT LOST ON C2 AGAIN.**
> C3′ pre-committed a routing trigger (dealer unbacked share above 20% with `p_unbacked` under 50%); it
> fired on both pools, so (a) — `dealerMove`'s terminal fallback becomes the cheapest legal raise —
> was implemented on top of the shipped (b) and run on identical seeds (1,600 × 120 days, 282,060
> hands). It does narrow the roaming raw gap 46.79 → 20.41 pp. It also takes the **player win rate
> 52.90% → 39.64%** (C2's band is 55–70%), **EV/hand +190.1 → −314.9 cr**, gambler `finalCredits`
> median 64,622 → 20,330, and produces the **only invariant violation in 3,200 careers** across both
> arms (seed 128, 77 consecutive zero-income days). C1 is structurally unmoved (it never touched the
> CLAIM), C4 survives both (lift 2.942× → 2.810×), C6 holds both. It also MISSES C3′(b) on roaming
> (composition share 45.5%), which is expected — it removes the composition the criterion
> decomposes. **LD-21's "(a) is not dead" is superseded: (a) is dead.** It lost the first bakeoff on
> C2 at 73.04% (above the band) and the second on C2 at 39.64% (far below it), and C3′ passes
> without it. The engine file was reverted; `git diff` on `packages/engine/src/liarsDiceRules.ts` is
> comment-only.
>
> **NO THRESHOLD, BAND OR GOLDEN WAS EDITED IN EITHER DIRECTION.** C3 itself is left VERBATIM in
> §17.2 and is still reported as a miss; C3′ is a second criterion beside it, not a replacement for
> its number. Two findings were filed rather than absorbed: **F-176-1** (`optimal`'s raise valuation
> prices a counterparty that does not exist — `TASKS.md` T-219) and **F-176-2** (the shipped player
> win rate is 52.90%, 2.1 pp below C2's own floor, moved there by T-175 and never re-scored —
> `TASKS.md` T-220).

> **BOTH OF THOSE FINDINGS ARE NOW CLOSED (2026-08-06).** F-176-1 at T-219 — measured, bakeoff'd
> and declined, see **LD-27**. F-176-2 at T-220 — C2 **partitioned**, see **LD-28** and
> `docs/LIARS-DICE_REDESIGN.md` §20: the win-rate limb retires as a bakeoff instrument, the EV limb
> is promoted to a standing invariant, and the 52.90% quoted above is re-measured per pool at
> **58.55% roaming (n = 157,037) / 45.69% roster (n = 122,820)**. **The 55–70% was not edited.**
> Shape (a)'s death, recorded above, is reinforced rather than re-opened: its −314.9 cr/hand fails
> LD-28's new EV invariant outright.

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

> **T-175 (2026-08-06) discharged the SECOND step — the archetypes — and F-160-1 is CLOSED.**
> The residual was `optimal`'s alone. It was **measured before anything was changed** (a
> calibration table over ~42,000 dealer decisions per tier: `optimal`'s `[0.1, 0.3)` predicted-truth
> band realised 60.89% / 85.34% / 95.50% actually-true at 4 / 5 / 6 dice), and the fix is a rule
> read backwards out of `minOpeningQuantity` with no free parameter — see **LD-25**. Re-measured
> off the SHIPPED instrument's own capstone rows: bad − optimal went **−6.64 pp (z −12.74) →
> +16.11 pp (z +29.02)**, and **+15.79 pp (z 35.93)** on a sample WIDENED to 1,600 gambler careers
> because `random` landed under the n ≥ 10,000 bar —
> positive at every tier, and the ladder now orders `optimal` < `bad` < roaming < `random` by
> difficulty. **LD-20's two rejections both HELD:** `BAD_CREDULITY` was re-derived against measured
> data and **left at 1** (spec §3.4a), and `git diff packages/content/src/liarsDice.ts` is empty —
> the four tone mixes were not reweighted, and LD-20's reason for rejecting that lever survives its
> own premise: the mixes are CONTENT and the ordering is a RULE. LD-20's remaining step (F-148-3)
> is still the owner's.

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

---

## 7. The live-tier read (M19)

**LD-24 — §4.6's "`liarsDiceTier` is called in exactly TWO places; a third is a bug" is AMENDED:
the ruling is about HANDS, not about a grep count.** (T-168,
`docs/LIARS-DICE-PROGRESSION_SPEC.md` §4.6a, 2026-08-05.)

The invariant §4.6 was always protecting is this, and it is unchanged:

> **A site that HAS a hand reads that hand's FROZEN fields** (`maxQuantity`, `dicePerSide`,
> `bandMax`, `ante`, `systemId`) **and never the live tier.** A site that has NO hand — because it
> answers a question about the *day*, or about a *stake not yet placed* — has no frozen field to
> read, and the live tier is its only honest input. Those sites are legitimate, but they must live
> **inside `packages/engine/src` as named accessors**, so the tier→effect mapping exists in exactly
> one place and is never re-derived by a caller.

**Why the old formulation had to go.** It named a *count of textual call sites* instead of the
invariant, and a count cannot tell the two cases apart. So it did both of the wrong things at once:
it FORBADE the only correct fix for F-148-4 (teaching the sim's stake planner the effective band),
and it PERMITTED the bug — `planDare` and `packages/sim/src/protocol.ts` sized the `wager` domain
off raw `wagerBandFor(...)` and never called `liarsDiceTier` at all, so no grep for a forbidden
third site could ever have found them. Two shipped tasks (T-197's `liarsDiceRoundsRemaining`,
T-168's `preHandWagerBand`) each had to argue around the paragraph in a source comment because
there was no rule to read; T-197's amendment lived in the `liarsDiceRules.ts` header and never
reached the spec at all, and §4.6a folds it in retroactively.

**The licensed live-tier reads are now ENUMERATED AND CLOSED** (§4.6a): the `actions/hangout.ts`
freeze site; `liarsDiceRoundsRemaining`; `preHandWagerBand`; and `format.ts`'s `preHandTier`, now
narrowed to the tier ≥ 3 "Read the Table" unlock alone. **Adding a fifth requires amending that
list**, in the spec, before the code.

**The NEW bug, replacing the old one:** any caller outside `packages/engine/src` that sizes a Dare
**stake domain** off raw `wagerBandFor(...)` instead of `preHandWagerBand(state)` — or that
re-derives `band.max × LIARS_DICE_RAISED_CEILING_MULT` for itself. That is a *stricter* rule than
the one it replaces: it catches the F-148-4 defect, which the old one could not see.

**Enforced at T-243.** `packages/sim/src/__tests__/liars-dice-process.test.ts` scans the source for
the exact four licensed `liarsDiceTier(...)` call sites and for the forbidden non-engine
stake-domain mirrors. A fifth live-tier read, a raw non-engine `wagerBandFor(...)` stake-domain
reader, or a restated raised-ceiling multiplier now fails the gate instead of relying on a manual
grep.

---

**LD-25 — `optimal` READS THE STANDING CLAIM. The chosen shape, and the four measured and
rejected.** (T-175, closing F-160-1; `docs/LIARS-DICE-PROGRESSION_SPEC.md` §3.3a.)

**The ruling.** `archetypeMove`'s `optimal` branch computes its belief that the standing claim is
true from the claim itself, not from an unconditioned Binomial:

```
creditedClaimSupport(q, u) = min(max(q - 1, 0), u)
pTrue(bid)                 = ownOf(bid.face) + creditedClaimSupport(bid.quantity, u) >= bid.quantity
```

**Why this is a rule and not a tuned number.** `minOpeningQuantity(m) = m + 1` (LD-21 / T-160)
forbids a claim at or under what the claimant holds of the claimed face. Read backwards, a standing
claim of `q` is the claim of someone holding `q - 1`. There is no free parameter: move
`minOpeningQuantity` and this moves with it. No hidden information is added — the bid is public and
`ownOf` is the house's own hand.

**The four shapes MEASURED AND REJECTED**, all on the same to-termination rig against the shipped
planner, n = 40,000 hands per candidate per tier (n = 400,000 for the tier-0 arbitration). House
credits per hand, higher is a harder seat; `bad` is the bar the ordering has to clear:

| shape | 4 dice | 5 dice | 6 dice | verdict |
| --- | --- | --- | --- | --- |
| SHIPPED BEFORE (`probAtLeast`, no read) | +3.42 | −17.00 | −31.17 | the defect |
| **CHOSEN — full credited support** | **+48.52** | **+25.99** | **+9.28** | beats `bad` at every tier |
| credit exactly ONE die (`probAtLeast(q−own−1, u−1)`) | +40.72 | +17.49 | +0.78 | REJECTED — loses to `bad` at tier 0 by 3.96, z = −18 |
| condition on the LATTICE BOUND alone (`X ≤ q−1`) | +3.93 | −15.45 | −29.12 | REJECTED — near-inert; the engine's own bound pushes the WRONG WAY (it truncates the upper tail, lowering `pTrue`), which is the clean negative result that proves the missing evidence is *behavioural* |
| MODAL-FACE read (soft, parameter-free) + lattice bound | +43.27 | +19.35 | +11.28 | REJECTED — still loses to `bad` at tier 0 by 1.41, and at n = 400,000 that residual is z = −6.4, i.e. real and not noise |
| credited support applied to `optimal`'s OWN raises too | +40.19 | −31.16 | −72.76 | REJECTED — re-uses the read from the ORIGINAL claim at a higher quantity (stale evidence) |
| `bad`, for reference | +44.68 | +16.94 | −1.31 | — |

**Why the residual was NOT taste, so this was not escalated.** Two shapes (the chosen one and the
modal-face read) both narrow the inversion, and the plan's rule is to halt and escalate when the
choice between them is taste. It is not: pre-committed criterion — *the ordering must un-invert at
EVERY tier on the shipped planner* — is met by exactly one of them, and the tier-0 arm was WIDENED
to n = 400,000 (never re-thresholded) to establish that the runner-up's 1.41-credit shortfall is
z = −6.4 rather than noise.

**The one objection to the chosen shape was measured too, not waved off.** A point read makes
`optimal` maximally credulous about a claim, so it should in principle be exploitable by a bluffing
human — a counterparty the sim's planner cannot be, since it opens at the engine's floor by
construction. Re-run with the counterparty opening `+1` and `+2` OVER the floor: the chosen shape
takes +66.74 / +55.70 / +45.70 and +95.47 / +92.52 / +87.26 credits per hand. It is 8–10 credits
per hand behind the runner-up in that regime, but **bluffing is a catastrophically losing line for
the player against every candidate including this one**, so the exposure is real in direction and
worth nothing in play. Recorded rather than assumed.

**What this ruling does NOT do.** It does not touch `optimal`'s RAISE valuation — the "as if the
opponent challenges it immediately" model assumption is untouched and remains **T-176 / F-160-2's**
to rule on.

> **RULED AT T-219 (2026-08-06) — MEASURED AND KEPT.** The sentence above is left verbatim; its
> pointer is discharged. T-176 declined the raise valuation in writing, it was refiled as
> **F-176-1**, and T-219 re-measured the error on HEAD (n = 13,472 / 14,330 / 15,096 raises per
> tier), bakeoff'd **four** replacements derived from named sources on identical seeds at
> n = 200,000 hands per arm per tier, and **kept the shipped expression**. All four lose; three
> re-invert the ordering this ruling shipped. The reason, derived rather than observed: at
> `pTrue = 1` the expression reduces to `probAtLeast(k_m, u) · (potPlayer + potDealer + c_m) > c_m`,
> so the *"as if challenged immediately"* assumption **is** `optimal`'s raise evidence gate. See
> **LD-27** for the binding ruling and `docs/LIARS-DICE_REDESIGN.md` §19 for the record. It does not move `BAD_CREDULITY`, which was re-derived against measured post-fix data
and left at `1` (spec §3.4a). It does not reweight the four tone mixes, which LD-20 rejected as
circular and which are CONTENT besides. And it narrows one thing: `optimal`'s FOLD branch becomes
provably unreachable (`pTrue` is now 0 or 1, so a challenge always ties or beats a fold), **RULED at
T-177 (LD-26 / `docs/LIARS-DICE-PROGRESSION_SPEC.md` §3.3b)**: the branch is RETAINED rather than
removed, and is guarded by a named test.

---

**LD-26 — FOLD IS A DISPOSITION PURCHASE, AND THE TWO CURRENCIES PARTITION.** (T-177, ruling on
**F-160-3**; harvested from T-137 §16.8 item 6, re-measured at T-160 §17.7.) **The shape taken is
(A): FOLD is ACCEPTED as a disposition move, and it is said so in the spec.** But it is accepted on
a stronger argument than "flavour", and the T-137/T-160 framing of it — *a null mechanic whose only
positive payoff is `+1` disposition* — is retired as INCOMPLETE rather than repeated. The correct
statement is that the game pays in **two** currencies and FOLD's price is denominated in the second
one.

**The credit half (LD-8 / §16.3, untouched and still true).** The escrow is debited at CONTRIBUTION
time, so a fold forfeits `potPlayer` with certainty while a challenge costs nothing to make:

```
EV_fold       = −potPlayer
EV_challenge  = P_false · potDealer − (1 − P_false) · potPlayer
EV_challenge − EV_fold = P_false · (potPlayer + potDealer)  ≥ 0, everywhere
```

FOLD is therefore weakly dominated by CHALLENGE in credits at every state, and strictly dominated
wherever `P_false > 0`. This is a DERIVATION about escrow, not a constant; T-160 confirmed the
opening floor does not touch it, and nothing in this ruling does either.

**The disposition half — the part §16.3 never priced, and the spine of the ruling.** Read live from
`packages/content/src/hangout.ts`: `DARE_WIN_DISPOSITION` (`:78`), `DARE_LOSS_DISPOSITION` (`:79`),
`DARE_FOLD_DISPOSITION` (`:153`). Higher disposition is better for the player, so

```
disp(fold)          = DARE_FOLD_DISPOSITION
E[disp(challenge)]  = P_false · DARE_WIN_DISPOSITION + (1 − P_false) · DARE_LOSS_DISPOSITION

FOLD is the DISPOSITION-better play  ⟺  P_false > crossover,
   where  crossover = (DARE_LOSS_DISPOSITION − DARE_FOLD_DISPOSITION)
                    / (DARE_LOSS_DISPOSITION − DARE_WIN_DISPOSITION)
```

**The crossover is stated as that expression and never as a literal** — the ruling is that it falls
where the three shipped constants already put it, not that it was tuned to.

**The reachable `P_false` spectrum is NOT dense on `[0,1]`, and that is what closes the argument.**
The engine's one probability model is `probAtLeast` (`packages/engine/src/liarsDiceRules.ts:712`)
and `P_false = 1 − probAtLeast(q − own(face), dicePerSide)`:

- `q − own ≤ 0` → `P_false = 0` exactly. The claim is TRUE BY CONSTRUCTION (`resolveChallenge`
  counts the face across all dice in play, so `actualCount ≥ own`). Here the credit comparison is a
  **TIE** — `EV_challenge − EV_fold = 0` — so folding gives up nothing measurable in credits, and
  the disposition read is the only live difference. It favours the CHALLENGE.
- `q − own ≥ 1` → the smallest non-zero value is `1 − probAtLeast(1, u) = (5/6)^u`, and `u ∈ {4,5,6}`
  across the whole shipped ladder (`dicePerSideForTier`, `liarsDiceRules.ts:126`, capped at six
  forever). The binding case is `u = 6`.

So the reachable spectrum is `{0} ∪ [(5/6)^u, 1]`, and **`(5/6)^u > crossover` at every shipped
tier** — verified at all three widths by the named test below, computed from the live constants.

**THE RULING, in one sentence.** The two currencies partition the state space cleanly: FOLD is never
the better CREDIT play, and is the better DISPOSITION play at *every* state where the credit
comparison is not already a tie. It is therefore a **priced trade, not a dead move** — it costs
`P_false · (potPlayer + potDealer)` credits and buys
`DARE_FOLD_DISPOSITION − (P_false · WIN + (1 − P_false) · LOSS)` disposition. *Decline a fight you
would probably win, and the dealer stays warm.* §16.6's measured interceptor lift — a captain's
disposition really does reach into who flies the intercept, at 2.4–2.9× uniform — is what makes that
second currency worth buying, so this is a purchase against a measured effect rather than against
flavour text.

**The concealment claim (§6.1) is RETIRED from the justification, not repeated.** It is
mechanically inert — `dealerMove` and `archetypeMove` take no history parameter and hold no
cross-hand memory, so there is no channel by which a past reveal could reach a future decision. It
is NOT part of why FOLD is kept, and a later reader must not re-derive the ruling from it.
**Re-read at T-244 after M4e shipped:** no live task now owns cross-hand memory for
`dealerMove`/`archetypeMove`, so the §6.1 concealment benefit is retired rather than deferred to a
phantom owner. A future memory feature must file a new owner, save shape, migration and measurement
before it can revive concealment as a payoff.

**The two shapes REJECTED, with reasons.**

- **(B) give concealment a real channel.** Requires cross-hand memory reaching both `dealerMove` and
  `archetypeMove` — a signature change on both policies plus persisted per-opponent memory, i.e. a
  save-shape change with a migration and a round-trip test, a `rulesFingerprint` move, a capstone
  and an 8,000-row sweep. It would also re-open the archetype ordering LD-25 shipped one task
  earlier and collide with the open raise-valuation finding (`T-219` / F-176-1). **Re-rejected at
  T-244:** M4e has shipped and did not add that memory channel, so there is no active owner to wait
  on; buying shape B now is a new rules-and-save feature, not a deferred implementation detail.
- **(C) change FOLD's economics** (e.g. refund a fraction of `potPlayer`). **LD-7** pins "FOLD
  forfeits seed plus all accumulated antes" as a CLOSED exploit fix, and §6.2 rejected the
  neighbouring shapes (auto-challenge, void) for exactly the gameability a partial refund
  reintroduces: any refund makes *open, then walk* a cheap option on every hand and re-prices the
  dusk timeout. **LD-8**'s own closing sentence — "changing this requires changing what FOLD pays,
  not a number" — names this as the expensive lever it is. Not warranted to rescue a move that is
  already a coherent trade in the second currency.

**What this ruling does NOT do.** It does not touch LD-7's forfeiture rule. It does not move
`DARE_FOLD_DISPOSITION`, `DARE_WIN_DISPOSITION` or `DARE_LOSS_DISPOSITION` — retuning one of them to
relocate the crossover would be tuning a number to make the ruling come out, and the ruling is
precisely that the crossover falls where the constants already are. It does not give the dealer
memory. It does not touch `optimal`'s raise valuation (`T-219`'s). Nothing shipped in
`packages/engine/src` beyond comments: `rulesFingerprint` was computed before and after and is
UNMOVED, so no capstone, no sweep and no re-measurement were owed. T-160's standing measurement
(n = 18,678 post-bid player decision points, FOLD legal at 100.00% and taken at 3.51%) satisfies the
`n ≥ 10,000` clause, and **under this ruling a 3.51% take rate is not a defect — it is the expected
rate for a move whose price is denominated in the other currency**.

**The one thing it left open is now CLOSED.** T-177 was ruling-only, so the player could not SEE the
price they were being asked to pay — and a purchase whose price the buyer cannot see is not a design,
it is a trap. That gap was filed as **F-177-1** / `T-221` and **shipped at T-221**: the Dare table
prints both arms of the trade at the point of decision (`dare-fold-trade`, beside the FOLD control),
read from the live escrow (`potPlayer` / `potDealer`) and the port's own `dare` row
(`venueParamsFor(...).dispositionOnFold`) — no constant imported into the UI, no crossover and no
`P_false` restated there, and the disposition arm absent on a roster seat through the same §7.6 hard
null `liarsDiceDealerReadout` owns. **The ruling itself is unchanged; only its visibility moved**, and
the change was UI-only (`rulesFingerprint` unmoved, no capstone owed). See
`docs/LIARS-DICE_REDESIGN.md` §17.7's blockquote for the shipped detail.

**The F-175-2 arm, stated explicitly rather than inherited.** `optimal`'s FOLD branch is
**UNREACHABLE BY CONSTRUCTION** at the shipped `probClaimTrue` (`liarsDiceRules.ts:992`), which is a
POINT read: at `pTrue = 1` a challenge scores `−potDealer`, tying fold and winning
`OPTIMAL_TIE_BREAK`; at `pTrue = 0` it scores `+potPlayer` and beats it outright. §3.3's "rare but
REACHABLE, and it must not be special-cased away" is **superseded** for `optimal`. The branch is
**RETAINED, not removed** (`liarsDiceRules.ts:1218`): `optimal` is an argmax over the whole legal
set and the branch goes live again the instant `pTrue` stops being a point read, and removal would
be a semantic edit that moves `rulesFingerprint` and buys a capstone for zero behaviour change.
It cost nothing to narrow — `optimal`'s fold share was already 0.00% of ~42,000 dealer decisions per
tier BEFORE T-175's change. See `docs/LIARS-DICE-PROGRESSION_SPEC.md` §3.3b.

**What enforces this ruling.** Both halves are asserted from the live constants and the live
probability model, with no literals, so a later retune goes RED and re-opens LD-26 rather than
silently voiding it:

- `packages/engine/src/__tests__/liarsDice.test.ts` — describe **`T-177 · the FOLD ruling — the two
  currencies partition`**: the crossover is strictly interior; `1 − probAtLeast(1, u) > crossover`
  at `u = dicePerSideForTier(0|1|2)` (*this assertion is the ruling*); the credit identity
  `EV_challenge − EV_fold = P_false · (potPlayer + potDealer) ≥ 0` with equality iff `P_false = 0`;
  and the join of the two, which is the partition itself.
- `packages/engine/src/__tests__/liarsDiceArchetypes.test.ts` — describe **`T-177 · F-175-2 —
  OPTIMAL never folds, and that is now a construction`**: zero folds over 5,000 positions at each of
  the three tier widths, the tie corner at `potPlayer`/`potDealer` `= 0` with the raise set emptied,
  and the POINT-read property of `probClaimTrue` pinned so a future soft read trips the test rather
  than reviving the branch in silence.
- **T-221 · the ruling's VISIBILITY, guarded on the same terms.**
  `packages/ui/src/__tests__/liars-dice-pane.test.ts` — describe **`T-221 · the FOLD trade is priced
  at the table`**: the disposition arm is asserted equal to `venueParamsFor(systemId,
  'dare').dispositionOnFold` *and* to the imported `DARE_FOLD_DISPOSITION`, so a retune reddens the
  UI's read rather than leaving the table quoting the old price; and — the load-bearing one — a real
  fold is applied and the quoted price compared against `DareHandResolved`'s own `creditsDelta` and
  `dispositionDelta`, which binds the projection to `settleDareHand` so the price SHOWN and the price
  CHARGED cannot drift. The roster arm asserts the hard null against the resolver's own 0 and the
  absent `DispositionChanged`. The COPY (as opposed to the values) is asserted through the real DOM
  by `packages/ui/e2e/liars-dice.spec.ts` — *the FOLD trade is priced at the point of decision — both
  arms* — and `packages/ui/e2e/liars-dice-roster.spec.ts` — *a roster seat is quoted the credit arm
  of the fold, and no warmth*.

---

**LD-27 — THE RAISE VALUATION'S "AS IF CHALLENGED IMMEDIATELY" ASSUMPTION IS *KEPT*, BECAUSE IT IS
THE EVIDENCE GATE.** (T-219, ruling on **F-176-1**; filed at T-176 §18.7 after T-175 measured its
magnitude and T-176 declined it in writing.) **The shape taken is: NOTHING CHANGES IN THE RULE, and
the reason is written down at the site, in the spec (§3.3c) and here.** `packages/engine/src` is
touched only in comments; `rulesFingerprint` was measured before and after at
**`cabd2112ccf4cefb`** and is unmoved, so no capstone is owed.

**The finding was RIGHT about the counterparty and WRONG about what follows.** `archetypeMove`'s
`optimal` branch values a raise as
`EV = pOurs · potPlayer − (1 − pOurs)(potDealer + c_m)` — the payoff if the opponent challenges it
**immediately**. Measured on HEAD (probe, `.scratch/t219-diag.ts`, n = 13,472 / 14,330 / 15,096
raises at 4 / 5 / 6 dice — the Accept bar was n ≥ 10,000 per tier and every tier clears it on its
own count), the opponent challenges the house's raise on the next ply **22.62% / 28.01% / 29.86%**
of the time. The model asserts 100%. Per-raise error, modelled minus realised:
**−126.99 / −84.81 / −47.34** credits, SE ≈ 1.2. *T-175's quoted +52.62 / −53.26 pair was measured
on its own pre-`probClaimTrue` control arm and its sign has since reversed; it may not be argued
from, and §19.0 records that correction.*

**Why it is kept — a derivation, not a preference.** `probClaimTrue` is a point read, so
`pTrue ∈ {0, 1}`. At `pTrue = 0` a challenge scores `+potPlayer`, which no raise can beat (a raise
maxes at exactly `potPlayer`, and the tie-break gives it to `challenge`), so **every raise happens
at `pTrue = 1`** — and there `challenge` and `fold` both score `−potDealer`, so the raise comparison
rearranges exactly to

```
optimal raises  <=>  probAtLeast(k_m, u) * (potPlayer + potDealer + c_m)  >  c_m
```

`probAtLeast` is monotone non-increasing in `k`, so the admissible set is a **down-set in `k`**.
The immediate-challenge term is the only part of the expression that is a function of the raise's
own truth probability; it is therefore the only thing making `optimal`'s raise rule an evidence rule
at all. Measured: over 200,000 hands per tier the shipped rule emits **zero** raises at `k ≥ 3`.

**The four shapes MEASURED AND REJECTED**, all derived from named sources, all with no free
parameter, all on identical seeds (`SeededRng(20_260_806 + u)`) at n = 200,000 hands per arm per
tier, all scored on **realised** house credits per hand off the engine's showdown rule rather than
on their own EV (F-175-1's trap). `bad` is LD-25's bar:

| shape | named source | 4 dice | 5 dice | 6 dice | verdict |
| --- | --- | --- | --- | --- | --- |
| **SHIPPED — KEPT** | — | **+48.61** | **+26.42** | **+8.43** | best at every tier |
| S1a · `pCall · EV`, `pCall = 1 − probAtLeast(⌈q − u/6 − M⌉, u)` | `DARE_AI_CHALLENGE_MARGIN` (`:730`), the one shared bar T-176 §18.2 applied to both sides | +45.41 | +21.06 | +6.75 | REJECTED — loses at every tier, z = 9.9 / 15.0 / 4.6 on the conservative independent-arm SE |
| S1b · S1a plus a one-ply continuation | the planner's own ungated (c3) branch order | +17.26 | +12.13 | +1.22 | REJECTED — re-inverts the ordering at four dice; its leaf is valued with the shipped model, so the lookahead re-imports the error one ply deeper |
| S1c · S1a plus the counterparty's FOLD branch | `DARE_AI_FOLD_QUANTITY` (`:746`) | +13.68 | −3.13 | +6.88 | REJECTED — below `bad` at four and five dice, re-inverts at both |
| S2 · restrict, don't re-price | `dealerMove`'s own raise gates (`:854`, `:858`), which unify to `own(f_m) ≥ q_m − u/6` | −3.00 | −19.08 | −24.98 | REJECTED — over the integers that is `k ≤ 0` at four and five dice; it deletes 97% of `optimal`'s raises and re-inverts at every tier |
| `bad`, reference | — | +44.70 | +17.27 | −2.03 | — |

**Why this was NOT escalated.** LD-25's halt rule fires when two candidates clear the criteria and
the choice between them is taste. It did not fire: **a pre-committed criterion separates every
candidate from the control.** S2, S1b and S1c fail K2 (the archetype ordering re-inverts) or K3
(below `bad`); S1a clears K1–K3 and is separated from the shipped rule by measurement — worse at
every tier at z ≥ 4.6, and 29–34 credits per hand worse under the robustness arm. **That last
separation exposed a gap in this task's own criteria** (K1–K4 never said "a replacement must beat
the incumbent"), and §19.7 records that as a scored miss rather than patching the criteria after
the fact.

**The robustness arm was run, not waved off.** A shape that prices a *selective* caller is by
construction more exploitable by a bluffing opener. Re-run with the counterparty opening `+1` and
`+2` over the engine floor: S1a takes **+62.62 / +27.23 / +11.83** against the shipped rule's
**+66.87 / +56.41 / +46.08** at `+1`, converging at `+2` (**+95.75 / +91.47 / +87.07** vs
**+95.75 / +92.24 / +87.07**). The exposure is real and it is larger than predicted.

**The ordering and the win rate, re-scored on the SHIPPED instrument** (`dareCells`, the 1,600-seed
gambler × 120-day arm §18.4 used, so the comparison is like-for-like): `bad − optimal` =
**+15.79 pp, SE 0.44, z 35.93**, and the player win rate **52.90%** at n = 279,857 — both reproducing
§18.6 to the published decimal, which is what an unchanged rule must do. **C2's 55–70% band is
T-220's and was neither edited nor targeted**; it is recorded that every alternative moved the
number *away* from the floor, so a future T-220 reaching for the raise valuation as a lever should
read §19.6 first.

**What this ruling does NOT do.** It does not change `EV(raise m)`, `probClaimTrue`,
`BAD_CREDULITY`, `DARE_AI_CHALLENGE_MARGIN`, `DARE_AI_FOLD_QUANTITY`, the tone mixes or the sim's
`planDareMove` — moving the last of those to make an engine measurement come out right is §16.2's
banned third shape. It does not re-open LD-26: `pTrue` is still a point read, so `optimal`'s FOLD
branch is still unreachable-by-construction and retained, and §3.3b's clause naming *"the
raise-valuation work `T-219` owns"* now reads **measured and declined at T-219**. And it does not
fix the coupling it exposed — **F-219-1**, filed as `T-222`: the gate's threshold is
`ante / (2 · seedWager + ante)`, so the player moves the house's evidence bar by choosing how much
to stake. Enumerated over EVERY shipped band at tier 0 (all 40 system ids): the gate is `k ≤ 3` at
every band ceiling and `k ≤ 2`, `k ≤ 1` or — at the 15–1200, 25–2000 and 10–3000 ports — **`k ≤ 0`**
at the floor, where `optimal` will only raise a claim it already holds. Every band widens; three
span four steps of `k`. That is a wager-band/ante ruling, not a measurement task's to take.

> **CLOSED AT T-222 — LD-29.** F-219-1 is measured over every band × all six tiers, baked off
> against the one alternative that dissolves it, and **ruled acceptable at every bounded tier**: the
> threshold is **pot odds**, and a player who stakes more moves the bar and **loses** by it
> (`docs/LIARS-DICE_REDESIGN.md` §21). LD-27's own numbers are untouched. Two things the sentence
> above did not know are filed rather than absorbed: the loosest gate in every band sits inside a
> **one-ante dead zone where no raise is legal at all** (F-222-1 / `T-224`), and **tier 5 caps
> nothing**, so past `k ≤ 3` the gate misprices and the ordering re-inverts (F-222-2 / `T-225`).

**What enforces this ruling.** `packages/engine/src/__tests__/liarsDiceArchetypes.test.ts`, describe
**`T-219 · F-176-1 — the immediate-challenge assumption IS optimal's raise evidence gate`**. Every
assertion is computed from `probAtLeast`, `probClaimTrue` and the imported constants, with no
literals in the mechanism, so a later change to the valuation goes RED and re-opens LD-27 rather
than silently voiding it: every raise is emitted at `pTrue = 1`; every raise satisfies the derived
inequality above; the admissible `k` set is a down-set at all three widths; and the
`ante`/`seedWager` coupling of F-219-1 is pinned at the band floor, the rig's own stakes and the
band ceiling.

---

**LD-28 — C2 IS PARTITIONED: ITS WIN-RATE LIMB IS RETIRED AS THE BAKEOFF INSTRUMENT IT SAYS IT IS,
ITS EV LIMB IS PROMOTED TO A STANDING INVARIANT, AND A SECOND INVARIANT IS ADDED.** (T-220, ruling
on **F-176-2**; filed at T-176 §18.7 after T-175 moved the number and scored the ordering rather
than the band.) **The shape taken is: NOTHING CHANGES IN ANY RULE, no band, threshold or golden is
edited in either direction, and the 55–70% stands VERBATIM in `docs/LIARS-DICE_REDESIGN.md` §17.2
with the shipped game still reported as having fallen through it.** `packages/engine/src` and
`packages/content/src` are **not touched at all**; `rulesFingerprint` was read before and after at
**`cabd2112ccf4cefb`**, `instrumentFingerprint` at **`2d6d1990eaf13031`** and `docsFingerprint` at
**`265aea1d09f0d485`** — **all three unmoved**, so no capstone is owed. *(`docsFingerprint` hashes
the raw bytes of the same rule and instrument SOURCES, comments included — **not** `docs/**`; see
`rules-fingerprint.ts:658`. Editing this file does not move it, and a reader who assumes otherwise
from the name will mis-read every note in this series.)* `CURRENT_SAVE_VERSION` unmoved at 17
(`packages/engine/src/save.ts:627`).

**THE FINDING WAS RIGHT ABOUT THE FACT AND THE OMISSION.** The trend is real and monotone —
T-137 **94.66%** → T-148 **80.07%** → T-160 **61.07%** → HEAD **52.90%** — and two consecutive
tasks moved the number without re-scoring the band it was chosen against.

**WHY THE WIN-RATE LIMB CANNOT BE A STANDING INVARIANT — the derivation, not a preference.**
Every anchor the 55–70% was built on was measured on the very defect T-160's bakeoff removed:
T-137's 94.66% and T-148's 80.07% were both taken with **openers guaranteed true = 100.00%**
(F-137-1 itself), and §1.3's 57.3% is the **opposed-d20** Dare — a different mechanic, which §1.3
discards in its own words (*"none of the old figures is a target"*). T-160 was entitled to use them
as **bakeoff anchors**, and C2's own row states its job: *"Disqualifies; does not pick."* It
discharged that job twice and correctly — shape (a) at **73.04%** above the ceiling (T-160) and at
**39.64%** below the floor (T-176). Nothing ever promoted it beyond that.

**The shipped rules supply the replacement anchor with NO FREE PARAMETER.** `minOpeningQuantity(m)
= m + 1` (`liarsDiceRules.ts:498`, reached from `isLatticeMove` at `:545`) forces the opener to
claim strictly above their own count, and both house policies throw on `bid === null`
(`dealerMove:801`, `archetypeMove:1113`), so **the opener is always the player**. The minimum legal
opening claim is true iff the other side holds one of the claimed face — the engine's own
`probAtLeast(1, d)`, **called and never restated as a literal**:
**51.77% (d=4) / 59.81% (d=5) / 66.51% (d=6)**. The shipped game is therefore **structurally
asymmetric against the player at ply 1**, and a band centred on 62.5% is derivable only from the
rules that let the opener claim for free. 50% is not the fair point either: the player chooses the
stake, chooses the face, and challenges from an evidence-backed position **100%** of the time
against the dealer's 57.5% / 77.1% (LD-22). 52.90% is what that combination looks like.

**THE MEASUREMENT, per pool, `n` on every cell** (`dareCells`, 1,600 gambler careers × 120 days,
the same arm §18.4 / §19.9 used; Accept bar `n ≥ 10,000` per pool, both clear it by >10×):

| pool | **n (hands)** | player win rate | SE | **EV / hand** | bids/hand |
| --- | --- | --- | --- | --- | --- |
| **roaming** (`dealerMove`) | **157,037** | **58.55%** | 0.12 | **+495.8 cr** | 1.289 |
| **roster** (`archetypeMove`) | **122,820** | **45.69%** | 0.14 | **−200.8 cr** | 1.780 |
| **AGGREGATE** | **279,857** | **52.90%** | 0.09 | **+190.1 cr** | 1.504 |

Reproducing §18.6 / §19.9 to every published decimal, which is what an unmoved rule owes.
**The two pools sit on opposite sides of C2's 55% floor.** Per archetype:
`roaming|none` 58.55% (n = 157,037), `roster|optimal` 39.83% (n = 95,580), `roster|bad` 55.63%
(n = 14,680), `roster|random` 78.61% (n = 12,560); the other four of the eight cells are
**structurally empty**, not under-sampled. C6 re-scored alongside: `bad − optimal` = **+15.79 pp,
SE 0.44, z 35.93** — no re-inversion.

**A SECOND, INDEPENDENT REASON.** The aggregate is a **mixture**, and its level moves with its
weights alone. Holding every cell's own measured rate fixed and changing only the weighting:
**52.90%** as measured, **49.11%** with tiers equally weighted, **52.12%** with pools equally
weighted, **35.63%** under a tier-0 mix — a **17.28 pp spread with no rate changed**. The repo
already contains the demonstration: T-175 read **51.58%** off a 5-seed × 40-day window and this
capstone reads **52.90%** off 1,600 × 120 **on the same rules**, because careers climb the ladder.
A bar that is passed or failed by the sweep's `--days` is not a bar. *(Reported honestly against
the tidier story: the roaming−roster **gap** is 96.8% rate and only 3.2% composition — unlike C3,
where LD-22 found ~70% composition. The two pools genuinely play differently. Only the
weighting-sensitivity of the **level** bears on this ruling.)*

**THE RULING.**

1. **RETIRED — C2's win-rate limb**, as the bakeoff instrument it declares itself to be. Its text
   is left verbatim; the number is not moved in either direction; the fall through it is still
   reported as a fall in §17.2, §18.6, §19.9 and §20.
2. **PROMOTED — C2's EV limb, unchanged: pooled EV/hand well under +558 cr.** That figure is not
   taste; it is **T-148's measured money-printer signature** on a table that was provably broken
   (§17.3's control arm reproduces it at +565.8). A bar naming a measured pathology keeps its
   meaning after the pathology is fixed. Measured **+190.1** — comfortable.
3. **ADDED — pooled EV/hand must remain POSITIVE**, from design intent rather than from the
   measurement: the Dare is a **voluntary** action whose headline value is the disposition channel
   (`docs/HANGOUT_REDESIGN.md` §7 / §10.4, the interceptor draw), and a negative-EV table is one a
   rational player never sits at, which closes that channel. Falsifiable, with a demonstrated
   violator — shape (a) at **−314.9 cr/hand** (§18.6).

**THE COUNTER-CASE, ANSWERED.** Retiring a band the shipped game has just fallen through is on its
face self-serving. Three checkable answers: **(i)** no number moved in either direction, and the
fall is still reported; **(ii)** both replacement bars name sources that **predate** the
measurement — +558 is T-148's, and "EV > 0" is a statement about a voluntary action, neither is
190.1 minus slack; **(iii)** had the derivation produced a floor above 52.90%, the honest outcome
was to report a miss, which is exactly what T-160 did for C3 and what §18.5 did again.

**WHAT THIS RULING DOES NOT DO.** It does not move `minOpeningQuantity`, `dealerMove`,
`archetypeMove`, `probClaimTrue`, `DARE_AI_CHALLENGE_MARGIN`, `SIM_DARE_CHALLENGE_MARGIN`, the
wager bands, the ante, or any band in `balance-targets.test.ts` / `balance/gate.ts`. It does not
re-open LD-21 (the opening lattice **is** the replacement anchor's source), LD-22 (shape (a) stays
dead — it loses this ruling's EV invariant outright), LD-25 or LD-27. And it does not price the
residual it exposed — **F-220-1**, filed as `TASKS.md` **T-223**: the roster pool is EV-**negative**
at **−200.8 cr/hand** (n = 122,820), driven by `roster|optimal` at **−482.3 over n = 95,580**, i.e.
34% of every hand played. T-220 **predicted EV > 0 on both pools and that prediction was WRONG**
(§20.6), which is why the invariant above is stated on the **pooled** table and the pool-level price
is an owner call with its own row. LD-26 already ruled that credits buy disposition and that the two
currencies partition, so this may be that same purchase one level up — but the price has never been
named, derived, bounded or tested, and setting a roster-EV floor inside the task that just measured
it would be fitting a bar to a number.

> **DATED NOTE (T-223, 2026-08-06) — F-220-1 IS CLOSED AS LD-30, AND ONE CLAUSE OF THE PARAGRAPH
> ABOVE IS CORRECTED.** Nothing in LD-28's numbers or its ruling text is edited; this note records
> what a later task established. The clause *"LD-26 already ruled that credits buy disposition …
> so this may be that same purchase one level up"* is **WRONG**, and demonstrably so at a shipped
> hard null: **a roster seat pays NO disposition at all**
> (`packages/engine/src/actions/dare.ts:168-181`, §7.6, asserted through the real resolver by
> `T-145 · roster hands apply NO disposition (§7.6)`). The disposition channel is fed by the
> **roaming** pool — the pool this very table measures at **+495.8 cr/hand** — so the sink is on the
> *other side* of LD-26's partition, not one level up it. **LD-30** rules the price **intended** as
> the price of the SEAT (the richest-candidate seat election meeting content's difficulty-priced
> purse ladder), re-weights the same cells to content's **own authored census** at **+172.8
> cr/hand**, and measures the set-seeking instrument that buys what the roster actually sells at
> **+21.5 cr/hand (n = 11,021)**. **LD-28's two invariants are re-scored and both hold** (pooled EV
> **+190.1 > 0**, with **27.29 pp** of mix headroom to the break-even roster share; and **≪ +558**).
> See `docs/LIARS-DICE_REDESIGN.md` §22 and **LD-30**.

**WHAT ENFORCES THIS RULING.** `packages/sim/src/__tests__/campaign-dare-cells.test.ts`, describe
**`T-220 · LD-28 — the table's standing invariants`**. Four assertions, all sized as detectors
rather than knife edges, all printing the value, the `n` and the SE on failure, all carrying the
standing remedy *"if red, WIDEN THE SAMPLE — never move the bar (N4/N10, `docs/VERSIONING.md`)"*:
the pooled EV/hand is positive; the pooled EV/hand is far under T-148's +558; the ply-1 opening
burden is computed from the engine's own `probAtLeast` against the binomial written out in the test
and is monotone in `d`, so a change to the dice model goes RED and re-opens LD-28 rather than
silently voiding its anchor; and the per-pool rollup is lossless against `dares` / `daresWon` /
`netCredits`.

---

**LD-29 — THE HOUSE'S RAISE EVIDENCE BAR IS POT ODDS, AND THE PLAYER MOVING IT BY STAKING MORE IS
THE BAR WORKING RATHER THAN AN ACCIDENT. RULED ACCEPTABLE AT EVERY BOUNDED TIER; TIER 5 AND THE
BAND-CEILING DEAD ZONE ARE FILED, NOT FOLDED IN.** (T-222, ruling on **F-219-1**; filed at T-219
§19.10 / LD-27, which derived the gate but was forbidden from ruling on the band or the ante.)
**The shape taken is: NOTHING CHANGES IN ANY RULE — no band, threshold, fraction or golden is edited
in either direction.** `packages/engine/src` and `packages/content/src` are **not touched at all**
(the only source edited anywhere is a test file, and `__tests__` is in
`HASHED_ROOT_IGNORED_DIRECTORIES`); `rulesFingerprint` was read before and after at
**`cabd2112ccf4cefb`**, `instrumentFingerprint` at **`2d6d1990eaf13031`** and `docsFingerprint` at
**`265aea1d09f0d485`** — **all three unmoved**, so no capstone is owed. `CURRENT_SAVE_VERSION`
unmoved at 17 (`packages/engine/src/save.ts:627`), re-read live.

**THE FINDING WAS RIGHT ABOUT THE FACT AND THE OMISSION, AND WRONG ABOUT WHAT IT MEANT.** The
enumeration reproduces on HEAD exactly — at tier 0, **40/40** bands widen with transitions
`{0→3, 1→3, 2→3}` — and nothing named or tested the coupling before T-219. What T-219 could not
know, because it measured the gate and not the play, is the sign.

**THE DERIVATION, NOT A PREFERENCE.** LD-27 established that every `optimal` raise happens at
`pTrue = 1`, where `challenge` and `fold` both score `−potDealer`, so the branch rearranges exactly
to `probAtLeast(k, u) · (potPlayer + potDealer + c) > c`, i.e.

```
optimal raises  <=>  probAtLeast(k, u)  >  c / (pot + c)
```

**`c / (pot + c)` is pot odds** — the break-even probability of a wager that costs `c` and wins
`pot + c`. A larger pot offers the house better odds on the same raise, and a bar that *did not*
move with the pot would be the mispriced one. Three consequences, each measured rather than argued
(`.scratch/t222-stake.ts`, 260 cells × **n = 40,000 hands**, identical seeds
`SeededRng(20_260_806 + u)` across every stake cell, scored on **realised** house credits off the
engine's own showdown rule; the rig's `optimal` proven byte-equal to
`archetypeMove({archetype:'optimal'})` over **1,200,000** states at every shipped ante and pot range
by `.scratch/t222-fidelity.ts`, zero mismatches):

1. **The play is a function of the RATIO alone.** Holding `c / (2s + c)` fixed and scaling stake and
   ante together ×1 / ×2 / ×4 / ×10 gives net/seed **0.6316 at every rung**, with byte-identical
   histograms. Holding the stake and varying the ante *within* a gate step changes nothing.
2. **A looser gate is BETTER for the house, monotonically, at every bounded tier.** Stake-normalised
   house net by gate step: **−0.04 → +0.11 → +0.45 → +0.63** (4 dice) and **−0.39 → −0.29 → +0.09 →
   +0.37** (6 dice); the player's win rate falls **51.77% → 18.55%** and **65.28% → 31.35%** as the
   bar opens. **There is no player-side exploit in the coupling to price.**
3. **The bounded ceiling gate is ONE number for all forty ports.** `anteFor` makes the ante a fixed
   fraction of the same ceiling the stake is capped at, so the ceiling ratio is
   `f / (2 + f)` with `f = DARE_ANTE_BAND_FRACTION` and **the band cancels out**. §19.10's `k ≤ 3`
   at all 40 ceilings is a property of the fraction, not a coincidence across ports.

**WHERE THE MEASURED GAME ACTUALLY SITS** (the shipped instrument's own seated quantities,
n = 279,857 hands over 1,600 gambler careers × 120 days): mean seated stake **2,631.6**, per-career
mean p10/p50/p90 **1,537 / 2,477 / 3,876**, max **32,510**, **64.13%** of hands seated **above the
port's authored ceiling**. The floor end of the coupling — where the house loses and the ordering
inverts — is **essentially unexercised**; the game lives at and beyond the ceiling end.

**THE ALTERNATIVE WAS BAKED OFF, NOT WAVED OFF.** Of the three levers the finding named, Controls A
and B show `DARE_ANTE_BAND_FRACTION` and the bands **cannot** dissolve the coupling — they move
where the step boundaries fall and nothing else. Only **the ante's reference** can: `ante =
max(1, round(seedWager × f))` makes the ratio `f / (2 + f)` **constant in the stake**. Run over the
same 260 cells on identical seeds, it does exactly that — a flat `k ≤ 3` gate, a flat 31.35% player
win rate at six dice, no ordering inversion below the ceiling. **It is DECLINED**, for reasons in
order of weight: (i) it moves the table **against the player at every measured cell**, and **LD-28
promoted "pooled player EV per hand > 0" to a standing invariant one task ago** at a measured
+190.1 cr — whether that survives cannot be known without a full 8,000-row capstone, which is not a
measurement task's to spend on speculation; (ii) it **fixes neither** of the two things measured to
be broken (it leaves the dead zone byte-identical, because at the ceiling `s = band.max` and the two
rules produce the same ante); (iii) it is an engine change that would owe its own capstone to decide
whether it is admissible at all. Recorded for the future: **ALT is the shape a fix to F-222-2 should
start from**, because a stake-referenced ante caps the ratio without capping the stake.

**THE ORDERING, RE-SCORED ON THE SHIPPED INSTRUMENT** as Accept requires (`dareCells`, the 1,600-seed
gambler × 120-day arm, the same one §18.4 / §19.9 / §20.3 used): `bad − optimal` = **+15.79 pp,
SE 0.44, z 35.93**; player win rate **52.90%** at n = 279,857; EV **+190.1 cr/hand**;
`roster|optimal` **39.83%** at n = 95,580; **0 tier and 0 challenge disagreements**;
`invariants: 0 violations` on all four shards. Every published decimal reproduced, which is what an
unmoved rule owes. *(The `combat-win-share` gate FAIL on all four shards is the known
gambler-only-arm artefact §19.9 and §20.0 record, not a regression.)*

**THE RULING.**

1. **ACCEPTABLE — the stake/ante coupling at every BOUNDED tier (0–4)**, on the pot-odds derivation
   and the monotone measurement above. Nothing moves.
2. **FILED, NOT ABSORBED — F-222-1 (`TASKS.md` T-224): the top `DARE_ANTE_BAND_FRACTION` of every
   bounded band is a DEAD ZONE.** `headroomFor` counts the seed against `band.max`, so a seed within
   one ante of the ceiling leaves **both** sides unable to cover a raise: the loosest gate in the
   band never fires, and the hand collapses to a single opening claim resolved at
   `probAtLeast(1, u)` — **in the player's favour at every width**. Measured house net/seed
   **−0.045** (4 dice) / **−0.321** (6 dice) against **+0.445 / +0.373** one quarter-band lower;
   at the default band at tier 4 that is **+962 cr/hand to the player against −842**. §16.5 already
   measured the gambler's median stake-to-band ratio at **100.00%**. T-224's shipped-instrument
   cut measures the actual dead-zone share at **623 / 8,452 = 7.37%** over 48 gambler careers × 120
   days, with **1.0 bids/hand**, **66.29%** player wins and **+351.4 cr/hand** to the player
   (**+464.8 cr/hand at tier 4**, n = 451 dead-zone hands). The lever is §4.3's whole-hand exposure
   ruling, not the ante; T-224 is blocked on the owner's intended-vs-defect ruling.
3. **FILED, NOT ABSORBED — F-222-2 (`TASKS.md` T-225): tier 5 caps nothing.**
   `effectiveWagerBand → {min: 0, max: null}` removes the ceiling while `anteFor` freezes the ante at
   the tier-4 reference, so the ratio → 0 as the stake grows. Past `k ≤ 3` the direction **reverses**:
   +0.373 → **+0.223** at `k ≤ 4` → **−0.139** deeper, with the ordering **re-inverting at −4.95 pp**.
   `k = 4` is admitted from **1,026 cr** (5–200 port) and **5,127** (default band), both inside the
   **32,510** maximum stake measured over 1,600 careers. **T-222 predicted this would not happen and
   was wrong** (§21.6, prediction 3); the ruling above is scoped to bounded tiers in consequence
   rather than being restated to match. T-225's shipped-instrument cut now measures the live tier-5
   stake distribution over 48 gambler careers × 120 days: **4,612** tier-5 hands, `k ≤ 4` on
   **1,725 / 4,612 = 37.40%**, `k ≥ 5` on **8 / 4,612 = 0.17%** (Denebola-5 5 hands, Mira-9 3
   hands), and **0** fully dissolved hands. T-225 is blocked on the owner's intended-vs-defect
   ruling for the uncapped veteran ratio.
4. **FILED, NOT ABSORBED — F-222-3 (`TASKS.md` T-226): the archetype ordering is stake-conditional.**
   `bad − optimal` runs **−21.15 pp** at band floors to **+20.61 pp** mid-band to **0.00** in the dead
   zone. `bad` reads no pot at all, so the whole dependence is `optimal`'s. LD-25 states the ordering
   without a stake range and no test covers it off the stakes the sweep happens to play. T-226 now
   pins that range in `liarsDiceArchetypes.test.ts` at n = 12,000 per cell: floor inversions at four
   and six dice (**−15.64 pp**, **−10.64 pp**), positive mid-band rows (**+2.08 pp**, **+20.36 pp**),
   positive tier-5 `k ≤ 4` (**+13.82 pp**) and a re-inverted cheap-port `k ≥ 5` tail (**−2.92 pp**).
   T-226 is blocked on the owner's ruling whether LD-25 should be restated as a mid-band property or
   the inversion zones are defects to bake off.

**WHAT THIS RULING DOES NOT DO.** It does not move `DARE_ANTE_BAND_FRACTION`, the ante's reference,
any wager band, `headroomFor`, `effectiveWagerBand`, `anteFor`, `probClaimTrue`, `BAD_CREDULITY`,
`DARE_AI_CHALLENGE_MARGIN`, `SIM_DARE_CHALLENGE_MARGIN` or the sim's `planDareMove` — moving the last
of those to make an engine measurement come out right is §16.2's banned third shape. It does not
re-open **LD-25** (the ordering bar stands; F-222-3 asks for its *range*, not its sign), **LD-26**
(`pTrue` is still a point read), **LD-27** (the raise valuation is untouched and this ruling is built
on its derivation) or **LD-28** (whose EV invariant is, on the contrary, the reason ALT is declined).

**WHAT ENFORCES THIS RULING.** `packages/engine/src/__tests__/liarsDiceArchetypes.test.ts`, describe
**`T-222 · F-219-1 — the stake/ante coupling, ruled`**. Five assertions, every one computed from
`probAtLeast`, `anteFor`, `effectiveWagerBand`, `legalMovesFrom` and content's own
`DARE_ANTE_BAND_FRACTION`, **with no literal threshold in any mechanism**, so a retune of a band or
the fraction goes RED and **re-opens LD-29** rather than silently voiding it: the gate is monotone
non-decreasing in the seed over all 40 ports × 6 tiers (3,120 cells); the closed-form step boundary
`⌊c(1−p)/(2p)⌋ + 1` agrees with the brute-force gate at every `(port, tier, k)`; the seeded pots are
the **tightest** bar in the hand, so every ante paid only loosens it; a bounded band caps the gate at
exactly the value `f / (2 + f)` predicts while **tier 5 removes that cap**; and the dead zone at the
top of every bounded band is exactly one ante wide. T-219's own describe keeps **every** expectation
it shipped — only its closing comment is redirected here.

---

**LD-30 — THE ROSTER SEAT'S PRICE IS THE PRICE OF THE SEAT, NOT OF A DISPOSITION CHANNEL, AND THE
MEASURED SINK IS THE SEAT ELECTION RATHER THAN THE TABLE. RULED INTENDED, WITH A BOUNDED STANDING
INVARIANT SOURCED IN CONTENT'S OWN SEAT CENSUS.** (T-223, ruling on **F-220-1**; filed at T-220 §20.7
/ LD-28, which measured the pool and was forbidden from pricing it.) **The shape taken is: NOTHING
CHANGES IN ANY RULE — no band, threshold, fraction, fingerprint or golden is edited in either
direction.** `packages/engine/src`, `packages/content/src` and `packages/ui/src` are **not touched at
all** outside `__tests__` (which is in `HASHED_ROOT_IGNORED_DIRECTORIES` and not in
`SIM_INSTRUMENT_DIRECTORIES`); `rulesFingerprint` was read live before and after at
**`cabd2112ccf4cefb`**, `instrumentFingerprint` at **`2d6d1990eaf13031`** and `docsFingerprint` at
**`265aea1d09f0d485`** — **all three unmoved**, so no capstone is owed. `CURRENT_SAVE_VERSION` unmoved
at **17** (`packages/engine/src/save.ts:627`), re-read live.

**THE FINDING'S ARITHMETIC IS EXACT AND ITS PREMISE IS FALSE.** The pool figures reproduce to every
published decimal on a fresh 1,600-career arm (`docs/LIARS-DICE_REDESIGN.md` §22.3): roaming
**+495.8 cr/hand** (n = 157,037), roster **−200.8** (n = 122,820), `roster|optimal` **−482.3**
(n = 95,580). But F-220-1 reads that as the price of **disposition with a named captain**, and
**a roster seat pays no disposition at all** — `packages/engine/src/actions/dare.ts:168-181` nulls it
by construction (§7.6, *"pool A is outside the NPC economy entirely"*), asserted through the real
resolver at every terminal arm by `T-145 · roster hands apply NO disposition (§7.6)`. The disposition
channel `docs/HANGOUT_REDESIGN.md` §10.4's interceptor draw depends on is fed by the **roaming**
pool — **the pool at +495.8**. It is not gated behind the sink; it is on the other side of the
partition **LD-26 already ruled**, which is cited here rather than restated.

**AND THE LABEL MISLEADS.** "the roster (the named captains)" names the wrong set. The roster is
LD-11's **authored 42-row house table** (`packages/content/src/liarsDice.ts`, the `ld-` namespace):
no `NpcState`, no roam, no death, no disposition, no relationship. The **named captains** are the
roaming pool (LD-12). What a roster seat sells is **`player.liarsDiceBeaten` set closure** (LD-13),
the fourteen port deeds and the grand slam (LD-14), and the authored `lines`. The price is therefore
denominated in **progression**, and that is where it is derived below.

**WHAT −200.8 ACTUALLY MEASURES — a derivation, not a preference.** Two shipped facts meet:

- content authors bankroll **monotone in difficulty** — seat 1 (`bad`/`random`) `3 × wager.max`,
  seat 2 (`mixed`) `5 ×`, seat 3 (`optimal`) `8 ×`, with the table's own header saying *"difficulty
  rises monotonically with the purse"*; and
- `planDare` elects **the richest candidate across both pools**, first-wins on a tie — a rule
  `docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.9 F-148-2 already ruled **"RULED, not overlooked"** and
  forbids re-teaching, *"because changing it re-bases every baseline in the same commit that measures
  it"*.

So a bankroll-chasing policy sits opposite `optimal` on **77.82%** of its roster hands (seat 3 is
52.87–64.28% of them in every 30-day window and never less than half; the rest arrives through seat
2's `mixed` rows resolving to `optimal` at open). And because the pool is **zero-sum** (§7.1) and
never regenerates (§7.5), every credit lost to seat 3 **grows seat 3's purse and re-elects it
tomorrow** while the soft seats drain toward the `purse <= 0` skip: measured over 1,600 careers, Σ
seat-3 purses run **140,400 → 162,433 (+15.7%)** while seats 1 and 2 fall **−6.8%** and **−3.7%**,
and **5.72 of 42 seats are broke at the horizon**.

**THE DECOMPOSITION, holding every cell's own EV FIXED and changing only the weights** (§22.4; the
authored census is computed from `LIARS_DICE_OPPONENTS`, each `'mixed'` row distributed by its own
`mix`, never restated as a literal):

| weighting | `optimal` / `bad` / `random` | **EV / hand** |
| --- | --- | --- |
| **as measured** (the seat-picker's mix) | 77.82% / 11.95% / 10.23% | **−200.8** |
| **LD-11's AUTHORED seat census** | 49.05% / 26.67% / 24.29% | **+172.8** |
| **flat across the three concrete archetypes** | 33.33% each | **+391.3** |

**AND THE INDEPENDENT CONFIRMATION, on the instrument that actually buys what the roster sells.**
`deed-hunter.ts`'s roster tour plays unbeaten seats in authored order at **band-minimum** stakes;
driven over **152 careers × 300 days** (the coverage arm's 76 seeds **doubled so the pool clears
n ≥ 10,000 on its own count** — the sample was widened, never the bar), it measures the same table at
**+21.5 cr/hand over n = 11,021**, ends the median career **+1,885 cr up** on the gauntlet
(**−0.52%** of the median purse, i.e. a gain), closes **2,099 port sets**, banks
`liars_dice_grand_slam` in **141 of 152 careers**, and leaves **0.00 of 42 seats broke** — §7.5's
no-lockout theorem is not merely un-violated, it is not approached.

**THE RULING.**

1. **INTENDED — the roster price is the price of the SEAT, denominated in PROGRESSION.** LD-11
   authors a difficulty ladder and prices it in purse; a policy that always takes the biggest purse
   always takes the hardest seat and pays for it. The measured −200.8 is that policy's bill, not the
   table's tariff, and the picker that writes it is ruled elsewhere and not re-opened here.
2. **ADDED — a bounded standing invariant: the CENSUS BOUND.** The roster pool's EV per hand,
   re-weighted to LD-11's **own authored seat census** with every cell's measured EV held fixed, must
   stay **POSITIVE**. The weights are computed from `LIARS_DICE_OPPONENTS` and **the bar is ZERO** —
   not −200.8 minus slack — so the mechanism holds no literal and a content pass that re-authors the
   census into a sink goes RED and re-opens LD-30.
3. **NAMED, NOT BOUNDED — the asymmetry.** The player's **upside** against the gauntlet is capped at
   **Σ bankroll = 280,800 cr** (recomputed from the table, not quoted) and never regenerates; the
   most any of 1,600 careers took off was **163,442 — 58.21% of the whole cap**. The **downside has
   no bound at all**: the worst career fed **102,742 cr** in. No document said this before. It is
   **not** shipped as an invariant, and the reason is that a cap the rules already enforce bars
   nothing in the direction that matters (§22.5's B2 discussion).
4. **FILED, NOT ABSORBED — F-223-1 (`TASKS.md` T-227): the player is told NOTHING about which seat is
   the hard one.** The purse is projected but **not rendered**; `seat` is not projected at all;
   `liarsDiceDealerReadout` hard-nulls on a `ld-` id; and the only cue that ever arrives, at unlock
   tier ≥ 3, describes **style** — calling the hardest, richest seat *"This one plays it safe."*
   A4 is answered independently of the sign on LD-26 / T-221's own precedent (*"a purchase whose
   price the buyer cannot see is not a design, it is a trap"*). Not fixed here because what is
   missing is a **difficulty** disclosure, which is a design call about what the player learns and
   when.

**THE COUNTER-CASE, ANSWERED.** Ruling a measured −200.8 cr/hand "intended" is the convenient
outcome, so four checkable answers: **(i)** the premise it overturns is false at a shipped hard null
with an existing test, not by reinterpretation; **(ii)** an independent instrument measures the same
table **positive** and closes the set in 141 of 152 careers — if the roster were a sink that arm
could not exist; **(iii)** the new bar's weights are **content's**, authored many tasks before this
measurement, and its threshold is **zero**; **(iv) two of six pre-committed predictions were WRONG
and are recorded as wrong** (§22.7), including the one most convenient to this reading — "the
gambler buys nothing" is false, it closes **2,861** port sets across 1,600 careers.

**THE ALTERNATIVES, DECLINED IN WRITING RATHER THAN OMITTED.** **ALT-1**, re-authoring the seat
census or the `3× / 5× / 8×` bankroll ladder, is the on-point lever and the measurement says it is
not where the effect is: content's own census already reads **+172.8** and the policy that plays it
is **paid**. **ALT-2**, LD-29's stake-referenced ante, was measured and declined one task ago on
identical seeds and moves the table **against** the player at every cell — the wrong direction for a
player-side sink. **ALT-3**, removing §7.6's hard null so a roster seat pays disposition, would make
the finding's premise true at the cost of a persisted per-opponent disposition for a pool with no
`NpcState` — a save-shape change owing a migration that **calls** a rule plus a round-trip test, a
`rulesFingerprint` move and a capstone — and it is declined because correction (i) above removes the
reason to want it.

**WHAT THIS RULING DOES NOT DO.** It does not move `planDare`'s richest-candidate rule (§12.9
F-148-2's), the seat census, the bankroll ladder, `DARE_ANTE_BAND_FRACTION`, the ante's reference,
any wager band, `probClaimTrue`, `BAD_CREDULITY`, `DARE_AI_CHALLENGE_MARGIN`,
`SIM_DARE_CHALLENGE_MARGIN` or the sim's `planDareMove` — moving the last of those to make an engine
measurement come out right is §16.2's banned third shape. It does not re-open **LD-11**, **LD-13**,
**LD-25**, **LD-26** (whose partition it cites, and one clause of whose T-220 restatement it
corrects by dated note), **LD-27**, **LD-28** (**both** of whose invariants it re-scores and neither
of which it edits: pooled EV **+190.1 > 0** with **27.29 pp** of mix headroom, and **≪ +558**) or
**LD-29**. It does not add a stake dimension to `dareCells`, and it takes no view on the disclosure
F-223-1 files.

**WHAT ENFORCES THIS RULING.** Both files are in `__tests__`, so neither can move a fingerprint.

- `packages/sim/src/__tests__/campaign-dare-cells.test.ts`, describe **`T-223 · LD-30 — the roster
  seat's price`**: the **census bound**, computed from `LIARS_DICE_OPPONENTS` with **no literal
  threshold in the mechanism** (measured **+209.0** on the file's 48-career detector sample, at a
  career-cluster bootstrap **SE 73.9** — reported as a ~2.8 SE detector rather than presented as
  comfortable); the **mix headroom**, both sides derived from the live rollups, with an assertion
  that it and LD-28's pooled reading **cannot disagree**; and the **archetype rollup lossless**
  against the roster marginal, non-empty at all three concrete arms, `optimal` the majority arm — so
  a later roster figure published *without* the archetype cut goes red rather than repeating
  F-220-1's mistake. All three print value, `n` and cell detail on failure and carry the standing
  remedy *"IF THIS IS RED, WIDEN THE SAMPLE — NEVER MOVE THE BAR (N4/N10, `docs/VERSIONING.md`)"*.
- `packages/engine/src/__tests__/liarsDice.test.ts`, describe **`T-223 · what a roster seat pays, and
  what it does not`**: the §7.6 null holds on the **WIN** arm too, with a vacuity guard proving the
  challenge sample reaches **both** terminal arms (the one thing `T-145 · roster hands apply NO
  disposition (§7.6)` never asserted — that describe is **extended, not duplicated**);
  `seedLiarsDicePurses()` **is** the authored bankroll row-wise, with the key sets compared;
  and **bankroll is STRICTLY increasing in `seat` at every one of the 14 ports**, with seat 3
  `optimal` and seat 2 `mixed` everywhere — the pin that makes the seat-election derivation durable,
  so a content pass that flattens or inverts the ladder re-opens LD-30 instead of silently re-basing
  every roster figure in §18–§22.
