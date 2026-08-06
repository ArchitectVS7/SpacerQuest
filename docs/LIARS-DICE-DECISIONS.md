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
to rule on. It does not move `BAD_CREDULITY`, which was re-derived against measured post-fix data
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
is NOT part of why FOLD is kept, and a later reader must not re-derive the ruling from it. **M4e is
the milestone that gives archetypes memory** (§16.3); concealment becomes worth something there,
for free, without this ruling pre-empting it.

**The two shapes REJECTED, with reasons.**

- **(B) give concealment a real channel.** Requires cross-hand memory reaching both `dealerMove` and
  `archetypeMove` — a signature change on both policies plus persisted per-opponent memory, i.e. a
  save-shape change with a migration and a round-trip test, a `rulesFingerprint` move, a capstone
  and an 8,000-row sweep. It would also re-open the archetype ordering LD-25 shipped one task
  earlier and collide with the open raise-valuation finding (`T-219` / F-176-1). M4e already owns
  the memory; the correct move is to wait for it rather than to buy it here at full price.
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
memory (M4e's). It does not touch `optimal`'s raise valuation (`T-219`'s). Nothing shipped in
`packages/engine/src` beyond comments: `rulesFingerprint` was computed before and after and is
UNMOVED, so no capstone, no sweep and no re-measurement were owed. T-160's standing measurement
(n = 18,678 post-bid player decision points, FOLD legal at 100.00% and taken at 3.51%) satisfies the
`n ≥ 10,000` clause, and **under this ruling a 3.51% take rate is not a defect — it is the expected
rate for a move whose price is denominated in the other currency**.

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
