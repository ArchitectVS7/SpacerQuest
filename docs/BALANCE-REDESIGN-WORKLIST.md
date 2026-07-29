# Balance Redesign Worklist — one change, one hypothesis, one simulation

**Status:** work list, written 2026-07-28. Output of the archetype-balance review (senior-dev
assessment + three independent persona reviews: casual gamer, power gamer, game designer —
all run on Sonnet, all briefed with identical neutral data).
**Companions:** `ARCHETYPE-BALANCE-MATRIX.md` (the measured data), `BALANCE-POLICY.md`
(governance), `PRD-REIMAGINED.md` (design intent).

---

## Executive summary

**CURRENT FIGURES (baseline of record: `docs/balance/baseline-vet-1k-r2a.json`, 1,000 careers
× 120 days per archetype, post-R0a + R2a).** The game's dominant strategy is **disengagement from
risk**: an unarmed trader clears the 25,000cr marker **92%** of the time by day **21**, ends
near-richest at TOP_DOG, and dies at **0.16 deaths/1k days against a 0.57 fleet average** —
while meeting *more* pirates than the fighter (31.6 vs 26.4 encounters/career) and surviving
**10,106 outgunned encounters at a `shipLostRate` of 0.00119**, ~109× lower than greedy's
0.12934 and ~3.6× lower than the fighter's 0.00425. It **never fits a weapon**: zero encounters
in a `prepared` cell across 1,000 careers.

> **Two corrections to the original text, kept visible rather than silently rewritten.**
>
> **(a) R1 — "escaping" meant *surviving*, not *running*.** The raw records show 979 of the
> trader's 1,052 outgunned encounters (100-seed arm) ended `talked-down` and only 62 `escaped`.
> The risk-free exit is **paying tribute**, not flight — which is why R2 was re-scoped.
>
> **(b) R0b — the original "0 ships and 0 cargo across 12,000 simulated days" was a sampling
> artifact.** At 1,000 seeds the same policy loses **19 ships and 17 of 89,967 routes**. The
> defect is real and the direction was right; the magnitude was overstated, and no rate in this
> document should be read as a hard zero. The old 100-seed figures (0.90 clears, 0 ships,
> 151,972 fighter credits, 0.75 smuggler deaths/1k) appear below only where a reviewer quoted
> them at the time.

The review's verdict, converged on independently by all three personas and the outside
assessment: **this is one confined structural defect, not a full redesign.** The core loop,
the face-up dice hand, and the NPC society were praised by every reviewer; the defect is the
economics of the encounter triangle — *escaping is free, unlimited, and always works, and
winning pays nothing* — plus one demo-breaking bug: the explorer archetype clears the Tour
One debt **0%** of the time.

Strongest convergence signals (weighted heavily, per the review brief):

1. All three personas independently made consequence-free escape their #1 issue; both
   mechanism-proposing personas independently concluded the §6 "predation pressure" proposal
   treats the symptom (who gets intercepted) not the disease (escape has no cost).
2. All three flagged explorer 0% as a bug aimed at the demo's story-driven audience, not
   intended asymmetry.
3. All three want the world to respond to wealth — but with the warning that a blanket
   wealth-to-power dial *without* fixing escape/combat payoff makes "stay poor, never
   upgrade" the new dominant line.
4. Two of three flagged the deeds/credits inversion: fighter is richest (151,972cr) with the
   fewest deeds (14); smuggler has the most deeds (28) with the worst viable-archetype
   survival (0.75 deaths/1k).
   > **R0b update:** the inversion HOLDS at 1,000 seeds (fighter 158,978cr / 13 deeds;
   > smuggler 28 deeds). The smuggler half does not: its death rate is **0.55**, below the
   > veteran's 0.70, so "worst viable-archetype survival" is no longer true. See R5b.

---

## How to use this document

Work the recommendations **in order** (dependencies are noted). For each one:

1. **State the hypothesis** (pre-written below; refine before starting if the R1 measurement
   changes the picture).
2. **Make exactly one change** — a lever (constant/config) or a programmatic change, never
   both in one step.
3. **Run the simulation** and compare against the pinned baseline.
4. **Accept or reject** against the written success/failure criteria. A rejected hypothesis
   is a result, not a failure — record it and move to the alternative listed.
5. **Record the outcome** in this file (append a `**Result:**` line under the step) and
   re-pin the baseline if accepted.

Standing constraints from `BALANCE-POLICY.md` that every step must respect:

- Divergences from foundation are commented at the definition site (Part B rule 3).
- The trader clear-day design band is **[22, 30]** (matrix §3). Post-fix, the trader
  *should* land inside it — today's day-21 clear is below the band, i.e. the marker is
  currently trivial for the trader.
- The T-1605b anti-poverty-trap invariant must hold (`campaign-policies`, scoped to the
  competent policies per errata E4).
- The full validation battery is: `balance-targets`, `balance-sweep`, `campaign-policies`,
  `lending-property`, `balance-combat-survival`, plus protocol replay goldens and the
  day-loop golden. Goldens are *expected* to move when behavior changes — re-pin them
  deliberately, never silently.

**THE TWO KNOWN-RED ASSERTIONS, and why they are `it.fails` rather than skipped
(owner decision 2026-07-28, ahead of the N-series).** The gate was red at HEAD on two
R-series debts, neither owned by the NPC-parity track:

| assertion | owner | why it is red |
| --- | --- | --- |
| `balance-targets` — trader clears inside [22, 30] | **R2.5** | clears day 21; the marker is trivial for the dominant archetype — the defect the redesign exists to remove |
| `balance-combat-survival` — "Auto-Repair no longer switches the death path off" | **R2c** | `debt === 0` kit gating moved fit-out ~day 20 → ~day 60, so careers-with-a-module is 5 of 15 against a `> 5` bar calibrated on the subsidised economy |

Both are marked `it.fails`, **not `it.skip` and not commented out**. The distinction is
load-bearing: every assertion still executes and the verdict is inverted, so each one goes
**red again the moment the underlying defect is fixed**. They are tripwires that fire on
success, not suppressed coverage — a skipped test would report nothing when R2.5 lands.
Flip each back to `it` in the same commit that fixes it. The N-series therefore runs
against a green gate without pulling R2.5's design work forward, and any third failure is
unambiguously the N-task's.

**The sweep command.** 1,000 seeds since R0b — see that step for why 100 cannot grade this.
Eight shards run in ~2.5 min on a 10-core box; the fleet now includes `trader-degraded` as a
second lens (a fix should hold up for the sloppy pilot too).

```sh
# ×8, one per shard
npm run balance:sweep -w @spacerquest/sim -- --label <label> --seeds 1000 --days 120 \
  --policies trader,trader-degraded,fighter,explorer,veteran,smuggler,gambler,greedy --shard i/8
npm run balance:sweep -w @spacerquest/sim -- --label <label> --merge
```

**Baseline of record for all comparisons:** `docs/balance/baseline-vet-1k-r2a.json` (1,000
seeds, post-R0a + R2a). `baseline-vet-1k.json` is its immediate predecessor (post-R0a only)
and differs solely in the `fighter` and `veteran` rows. The table immediately below is the RETIRED 100-seed arm, kept because the review
and the early steps quote it; the corrected figures are in the R0b result.

| archetype | clears | clear day | final cr | deeds | enc/career | combat EV | ships lost | deaths/1k |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| trader | 0.90 | 21 | 79,954 | 17 | 32.5 | −1,299 | **0** | **0.00** |
| smuggler | 0.61 | 29 | 44,027 | **28** | 33.1 | −1,400 | 9 | 0.75 |
| gambler | 0.82 | 26 | 66,413 | 22 | 30.2 | −1,309 | 2 | 0.17 |
| fighter | 0.71 | **19** | **151,972** | 14 | 25.4 | −400 | 5 | 0.42 |
| explorer | 0.00 | — | 93,342 | 23 | **40.2** | −1,500 | 7 | 0.58 |
| greedy | 0.00 | — | 1,000 | 8 | 2.0 | −32 | 12 | 1.00 |
| veteran | 0.01 | 93 | 12,195 | 20 | 15.8 | −400 | 11 | 0.92 |

---

## CRITICAL

### R1 — Measure escape reliability under a human-plausible pilot

*This is the matrix §6's own unanswered gating question. Nothing downstream should be built
until it is answered.*

- **Hypothesis:** the trader's perfect escape record (1,052/1,052 while outgunned) survives
  even under degraded, human-plausible piloting — i.e. the defect is in the **engine**
  (running is near-free), not in the sim policy's optimality.
- **Change (programmatic, sim-only — no engine change):** add a degraded variant of the
  trader policy in `packages/sim/src/index.ts` — noisy die allocation (sometimes spends a
  mid die where the optimal spends the best), imperfect fuel reserves (occasionally arrives
  at an encounter without the full-exchange tank margin), occasional greedy contract
  overreach. No engine or content changes.
- **Simulate:** run the balance sweep with the degraded trader added; 100 seeds × 120 days.
- **Proves the hypothesis:** degraded-trader `shipLostRate` while outgunned remains ≈ 0
  (say, < 0.005 vs greedy's 0.0685 and fighter's 0.0323) → escape is structurally free;
  proceed to R2.
- **Disproves:** degraded trader starts losing ships at a meaningful rate → the perfect
  record is a policy artifact; re-scope R2 toward tuning against the human-plausible pilot
  (and possibly UI/telegraphing work) instead of re-pricing escape.
- **Supporting data:** matrix §5–§6; the trader met *more* interceptors than the fighter,
  so attraction is already sufficient — only consequence is in question.

**Result (2026-07-28): HYPOTHESIS DISPROVED — and the premise it rests on is wrong.**

Instrument: `trader-degraded`, a shipped sim policy (`packages/sim/src/index.ts`,
`degradedTraderPolicy`) that reuses the trader's whole day plan with three slips layered on —
noisy die allocation (0.35/check), thin-tank arrival (0.25/day), greedy contract overreach
(0.20/day). Slips draw from the per-day policy rng fork, so degraded careers replay
byte-for-byte. No engine or content change. Sweep: `baseline-r1-degraded.json`, 100 seeds ×
120 days, fleet + degraded. The seven baseline policies re-ran **JSON-identical** to
`baseline-vet-t1605.json` (pinned in `campaign-degraded.test.ts`), so the comparison is sound.

*Finding 1 — the criterion fails.* Degraded-trader `shipLostRate` while outgunned is
**0.0133**, not the "< 0.005" the hypothesis predicted — 2.7× the bar, above fighter (0.0040)
and explorer (0.0031), near veteran (0.0121). Fleet-wide it is the **worst** death rate
measured: 19 ships lost, 1.58 deaths/1k days (greedy, the cautionary control: 1.00). Routes
lost 18 (clean trader: 0 of 9,003). Tour One clear rate 0.90 → 0.72; clear day 21 → 22.
The perfect record is substantially a **policy artifact**. Per the disproof branch, R2 must be
re-scoped toward the human-plausible pilot rather than built on "escape is structurally free".

*Finding 2 — and this is the bigger one — the trader does not escape. It pays.* Of its 1,052
outgunned encounters, **979 (93%) end `talked-down` and only 62 (5.9%) end `escaped`**
(`travelCompletedRate` 0.931 — a fleeing trader would not complete the trip). The executive
summary above reads the matrix's "escaped all 1,052" as the *run stance*; the raw records say
it means *survived*. **The consequence-free exit under measurement is TRIBUTE, not flight.**
Mean tribute per outgunned encounter: 1,877cr, and combat EV of −1,299 is essentially all
tribute. It is free not because it is unpriced but because **the price is capped
(`round × 1000`, `TRIBUTE_MAX`, margin-shaved) while the purse is not** — a 1,877cr toll
against a 48,000cr purse is a rounding error, and `planPacifistCombat` correctly prefers
talk whenever the tribute is affordable, which for a solvent trader is always.

*Finding 3 — slip ablation names the mechanism.* Deaths by slip, held one-at-a-time over the
same 100 seeds × 120 days: dull-die only **9** (outgunned rate 0.0077), thin-fuel only **6**
(0.0046), overreach only **1** (0.0000), all three **19** (0.0152). Doubling the die slip to
0.70 gives **45** deaths (0.0379) — monotone in degradation, so this is a gradient, not a
knife-edge artifact. Autopsy (seed 8, days 99–100): a rich trader talks, a middling die fails
the talk check, `continueEncounter` lands 3 hull points, and two failed talks kill a
full-hull ship. **The kill path runs through the talk roll, not the run roll.**

**Consequence for R2 — re-scope before building.** R2 as written prices a successful
`combat_run`. That stance carries 5.9% of the dominant archetype's outgunned encounters, so
the change would move ~62 of 1,052 events and leave the actual dominant line (pay the toll,
complete the delivery) untouched. The three candidates in R2's bakeoff should be re-drawn
around the **exit that is actually taken**, e.g.: (a) tribute that scales with ability to pay
or with cargo value rather than a flat capped ladder; (b) the interceptor takes *cargo* rather
than credits when the hold is worth more than the toll; (c) a repeat-tribute reputation cost
that makes "always pay" compound (the rim learns who pays). The run-pricing options stay live
for the fighter/explorer profiles, which run far more often — but they are not the trader fix.
Recommend a `/bakeoff` pass on the re-drawn candidate set before any lever moves.

**Battery:** `npm test` green except two failures **already red at HEAD** (verified by stashing
this change): `balance-targets` "trader median debt-clear day 21 outside [22, 30]" and
`balance-combat-survival` "Auto-Repair no longer switches the death path off" (fighter
`shipsLost === 0`). Both are *the defect this worklist exists to remove*, and both are R2/R3
work — R1 is measure-only and deliberately does not touch them. Baseline of record is
**unchanged** (`baseline-vet-t1605.json`), correctly: a disproved hypothesis re-pins nothing.

### R0 — Fix the instrument, then re-pin the yardstick

> **Owner decision 2026-07-28: bugs are addressed BEFORE R2.** Nothing below this step is
> gradable until it lands, because R2/R2.5 are graded by diffing a sweep against a pinned
> baseline — and today both the instrument and the baseline are wrong.

**R0a — `planPacifistCombat`'s tribute oracle (bug fix, sim-only).**

- **The defect:** `packages/sim/src/index.ts` grades tribute affordability with a hardcoded
  `Math.min(round * 1000, 10_000)` and never calls the engine's `tributeForRound`, so it
  ignores `TRIBUTE_CLASS_MULTIPLIER` (Reptiloid ×2) and `TRIBUTE_TIER_GAP_STEP` (×1.75) — the
  sim's trader can decide "I can afford this" about a number the engine will not charge.
- **Why it is a BUG and not a modelling simplification** (the distinction matters, because a
  sim policy is allowed to be imperfect): this file's own standard is to mirror the engine
  exactly — `planLoanBorrow`'s comment states its preconditions "mirror `resolveVisitHangout`
  + day.ts's hangout/encounter gates exactly, so the policy can never burn a die on a typed
  refusal". And the UI (`format.ts` `tributeThisRound`) already calls the real function, so a
  human player HAS the true number while the instrument does not. Found independently by two
  reviewers in the R2 bake-off.
- **Blast radius:** changes trader/explorer/gambler stance decisions → **moves every policy
  fingerprint and the baseline**. That is exactly why it must precede R0b.
- **Measured cost of NOT fixing it first:** in the bake-off's control arm, patching the oracle
  alone changed the sloppy pilot's clear rate 0.72 → 0.75 and its ship losses 19 → 11. An
  uncorrected instrument would have charged those deltas to whatever R2 shipped.

**Result (2026-07-28): DONE.** `planPacifistCombat` now calls `tributeForRound` with the
interceptor's `kind` and the `interceptor.tier − player.tier` gap, matching `resolveTalk`'s own
call. Sweep `baseline-r0a-oracle.json` (100 seeds × 120 days, same fleet as the pinned
baseline) — **every competent policy moved; `greedy` is byte-identical**, which is the control
that proves the diff is this code path and nothing else (greedy runs `greedyTraderPolicy`, not
`planPacifistCombat`).

| policy | clear | clear day | ships lost | routes lost | final cr |
| --- | --- | --- | --- | --- | --- |
| trader | 0.90 → 0.89 | 21 → 21 | **0 → 1** | **0 → 1** | 79,954 → 79,954 |
| fighter | 0.71 → 0.72 | 19 → 20 | 5 → 5 | 5 → 5 | unchanged |
| explorer | 0.00 → 0.00 | — | 7 → 8 | 19 → 19 | 93,342 → 92,531 |
| veteran | 0.01 → 0.01 | 93 → 91 | 11 → 12 | 28 → 29 | 12,195 → 12,005 |
| smuggler | 0.61 → 0.58 | 29 → 29 | **9 → 4** | 36 → 38 | 44,027 → 44,082 |
| gambler | 0.82 → 0.78 | 26 → 27 | 2 → 2 | 16 → 15 | 66,413 → 64,927 |
| greedy | IDENTICAL | — | — | — | — |
| trader-degraded | 0.72 → 0.75 | 23 → 22 | **19 → 11** | 18 → 11 | — |

**The direction is "the instrument got smarter, and mostly safer."** A policy that now sees the
true demand correctly declines to talk when it cannot actually pay, and takes the getaway
instead — so the smuggler's deaths more than halve (9 → 4) and the sloppy pilot's fall 19 → 11
(deaths/1k 1.58 → 0.92). Two clear rates drop (smuggler −0.03, gambler −0.04) because running
forfeits the delivery the old mis-estimate used to buy through. **This independently reproduces
the bake-off's "sighted trader" arm (0.72 → 0.75, 19 → 11) from a different code path, which is
the cross-check that the correction is real and not an artifact of either measurement.**

Note the trader moving **0 → 1 ships and 0 → 1 routes** at 100 seeds: the bug fix ALONE lifts it
off the zero that this document's executive summary was built on — a second, independent
confirmation of the R0b sampling finding.

Battery: typecheck, lint, and 1,102 tests green; the only failures are the two already red at
HEAD. `campaign-degraded.test.ts` fingerprints re-pinned deliberately for `trader` and `fighter`
with a re-pin log recording the previous values and the cause (the other five are unchanged
*in that test's 5-seed × 40-day window only* — the sweep above shows they do move at scale).

**R0b — re-pin the baseline at 1,000 seeds.**

- **The defect:** `baseline-vet-t1605.json` is 100 seeds × 120 days and records the trader at
  **0 ships / 0 routes lost**. At 1,000 seeds the same policy loses **21 ships and 19 routes**
  (0.175 deaths/1k). The headline "0 ships and 0 cargo across 12,000 simulated days" — quoted
  in this document's own executive summary and in `ARCHETYPE-BALANCE-MATRIX.md` — is a
  **sampling artifact**, not a property of the game.
- **The second defect:** the clear-day median is a discrete day number over a wide spread
  (p25 18 / median 21 / p75 25), so ±1 day is noise at n=100. A bake-off candidate passed the
  [22, 30] band at n=100 and failed it at n=1,000.
- **Change:** re-run the veteran arm at 1,000 seeds × 120 days AFTER R0a, write
  `docs/balance/baseline-vet-1k.json`, and make it the baseline of record. Update the matrix
  table and this document's executive summary to the corrected figures.
- **Proves/disproves:** measure-only. It cannot fail — but it CAN change the size of the
  problem R2 is being asked to solve, and the corrected numbers must be read before R2's
  acceptance thresholds are treated as final.
- **NOT affected: R1 does not need re-running.** Its conclusion strengthens at the larger
  sample — normal trader 21 ships / 0.175 per 1k vs the degraded pilot's 131 ships / 1.09 per
  1k, a ~6× separation that the 100-seed arm expressed only as "0 vs 19".

**Result (2026-07-28): DONE. Baseline of record is now
`docs/balance/baseline-vet-1k.json`** — 1,000 seeds × 120 days × 8 policies (8,000 careers,
960,000 sim-days), taken after R0a. `baseline-vet-t1605.json` is retired; keep it only as the
provenance of the numbers this document was originally written against.

| archetype | clears | clear day | final cr | deeds | enc/career | combat EV | ships lost | deaths/1k |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| trader | 0.92 | 21 | 80,305 | 17 | 31.6 | −1,245 | **19** | **0.16** |
| smuggler | 0.55 | 30 | 42,769 | **28** | 34.2 | −1,400 | 66 | 0.55 |
| gambler | 0.80 | 26 | 68,436 | 23 | 30.1 | −1,300 | 27 | 0.23 |
| fighter | 0.70 | **20** | **158,978** | 13 | 26.4 | −400 | 56 | 0.47 |
| explorer | 0.00 | — | 91,669 | 23 | **40.1** | −1,500 | 65 | 0.54 |
| greedy | 0.00 | — | 1,000 | 8 | 2.0 | −27 | 111 | **0.93** |
| veteran | 0.01 | 90 | 12,501 | 20 | 16.2 | −400 | 84 | 0.70 |
| trader-degraded | 0.76 | 23 | 57,619 | 18 | 29.4 | −1,400 | 120 | 1.00 |
| **fleet** | 0.47 | 25 | 57,959 | 19 | 26.2 | −850 | 548 | 0.57 |

**THREE LESSONS, in descending order of how much they should change future practice.**

**1. Every headline zero in this document was a sampling artifact.** The trader loses **19
ships and 17 of 89,967 routes** — not zero. Its outgunned `shipLostRate` is **0.00119** over
10,106 outgunned encounters, not `0.0000`. "Immortal" was never true; "very rarely mortal"
is. At n=100 a rate of 0.0012 has an expected count of ~1 in the whole arm, so observing 0
was the likeliest single outcome — **the old baseline was not unlucky, it was under-powered,
and a zero is the one value a small sample reports most confidently and least reliably.**
*Practice change: never state a rate as 0.00 from a 100-seed arm. Report it as "< 1/n" or
re-run at 1,000.*

**2. The core finding SURVIVES — the defect is real, the magnitude was overstated.** The
trader is still far and away the safest archetype: 0.16 deaths/1k against a 0.57 fleet
average and greedy's 0.93, and an outgunned loss rate **~109× lower than greedy's 0.12934**
and ~3.6× lower than the fighter's 0.00425 *while meeting more interceptors than the fighter
does*. It still never fits a weapon (`prepared`-cell encounters: **0**, across 31.6
encounters/career × 1,000 careers). R2/R2.5 are still the right work; they are correcting a
strong bias, not an absolute.

**3. The clear-day target is genuinely missed — this was NOT a sampling artifact, and my
earlier speculation that R0b "might change what fixed means" for `balance-targets` was
wrong.** The trader's clear day at n=1,000 is still **21** (n=985, p25 18 / median 21 / p75 25
/ p90 30 / mean 22.8). The `balance-targets` failure is a real, reproducible miss of the
[22, 30] band, and R2/R2.5 must actually move it. What n=100 could not resolve was ±1 day of
*candidate* effect, which is why 1,000 seeds is now mandatory for grading — not the baseline
value itself.

**Secondary observations for downstream steps:**

- **R1 is confirmed and sharpened.** Degraded-pilot outgunned `shipLostRate` **0.00899** vs
  the clean trader's **0.00119** — a **7.6× separation**, measured on 10,123 vs 10,106
  outgunned encounters. R1's conclusion needed no re-run; it is now quantified on both sides
  instead of resting on a zero.
- **R5's deeds/credits inversion holds at scale** — fighter is richest (158,978) with the
  *fewest* deeds (13); smuggler leads deeds (28). Unchanged conclusion.
- **R5b's premise weakened.** The smuggler's death tax was quoted at 0.75 deaths/1k; at
  n=1,000 it is **0.55**, below the veteran's 0.70 and close to the explorer's 0.54. It is no
  longer "the worst viable-archetype survival". Re-read R5b against this number before tuning
  the contraband risk premium — the tariff it was written to reduce may not exist.
- **R3 is untouched and still urgent:** explorer clears **0.00** at 1,000 seeds. Not a
  sampling artifact by any reading.

### R2 — Make the pirate a threat (near-peer power + the pirate table)

> **SUPERSEDES the original R2 ("price the escape"), by owner decision 2026-07-28.** The
> original step is preserved verbatim in *Appendix A* below, together with the bake-off that
> retired it. Short version: pricing the run targets a stance the dominant archetype uses in
> 5.9% of its dangerous encounters, and every per-encounter price the bake-off simulated was
> either inert (escape pricing, wallet-scaled tribute) or an arbitrary tax on success (cargo
> seizure). The owner's re-frame moves the lever off *what the player owns* and onto *what
> the pirate is* and *what the player did last time*. R2 is the first half; R2.5 is the second.

*No bake-off. The owner ruled the alternatives non-competing — these are complementary parts
of one direction, not options to choose between — so this ships as designed and is graded by
sweep. Two of the four measurements below already establish the defect; nothing is being
taken on faith.*

- **Hypothesis:** combat is a solved problem, not a decision, because interceptor power tops
  out far below player power. Scaling high-tier interceptors toward near-peer — and moving
  the pirate roster into an authored data table with its own demand lines — makes the fight
  stance a real choice at the top of the curve without touching the T-1603c combat table's
  per-event costs.

- **THE MEASURED DEFECT (2026-07-28, from `baseline-vet-t1605.json` + engine source):**
  An **armed** fighter's win rate is **97.0% while OUTGUNNED**, 98.2% at parity, 98.5% when
  it outranks. Being outgunned costs 1.5 percentage points. The tier system is decorative.
  The mechanism is arithmetic, not tuning:
  - `travel.ts` sets `enemyHull: interceptor.tier` — **the deadliest pirate in the game has
    5 hull points.**
  - `weaponVolleyDamage` at max component tier (strength 90) is **5**, plus
    `STAR_BUSTER_VOLLEY_BONUS` 2 = **7**. **A maxed player one-shots every pirate in the
    game, tier 5 included.**
  - The whole difficulty curve is "do you own a gun": the *unprepared* fighter wins only
    67.7% outgunned, and then the curve is flat forever.
  - **Stats are NOT the lever and must not be the fix:** interceptor stats are d20 modifiers
    capped at 5, and the tier-4/5 roster is *already* maxed at PILOT 5 / GUNS 5 / GRIT 5
    (measured across all 65 entries in `ANONYMOUS_INTERCEPTORS`). There is no headroom.
    Hull, shields/mitigation and volley math are where the room is.

- **Change (a) — content, the pirate table.** Move the interceptor roster into an authored
  data table (`packages/content`, TS module exporting typed rows — NOT csv/json read at
  runtime; content is typed source in this repo and a parsed file would dodge `tsc`).
  Columns: name, ship name, ship class, kind, tier, stats, hull, and **authored demand
  lines** ("Lord Valtrax demands you turn over 20,000 credits immediately or be destroyed"),
  plus the conversational beats a demand can draw from. This is what makes an escalating
  encounter *legible* — the ladder in R2.5 is invisible unless the pirate says it out loud.
- **Change (b) — lever, near-peer power.** Scale `enemyHull` (and/or high-tier mitigation)
  so a tier-5 interceptor survives a maxed volley and trades meaningfully with an endgame
  ship. ONE knob per step: land the hull scale, sweep, then consider mitigation separately.
- **Change (c) — presentation, the wingman.** A high-tier interceptor may carry a `wingman`
  flag that adds hull and a second pressure roll, surfaced as *"Two pirates block your escape
  and demand tribute!"*. **Deliberately ONE interceptor under the hood** —
  `EncounterState.interceptor` is singular, and making it plural would touch every resolver,
  the save schema, the UI and every golden for a fiction beat that a flag delivers. Owner
  decision, recorded here so a later reader does not "fix" it into a real second ship.

- **Simulate:** full fleet + `trader-degraded`, **1,000 seeds × 120 days** (see the sample-size
  finding below — 100 seeds cannot grade this), then the full validation battery.
- **Proves:** armed-fighter win rate while outgunned drops out of the high 90s into a band
  where the fit and the stance both matter (target ~0.75–0.85); the *unprepared* penalty
  stays at least as sharp as today; fighter final credits do not collapse; the trader's
  numbers move only as much as the shared encounter path forces (R2.5 is the trader lever,
  not this one); anti-poverty-trap suite green.
- **Disproves:** win rate barely moves (hull scale too small — one step up, re-run) or the
  fighter's clear rate/credits collapse (too large — halve it), or deaths concentrate on the
  *unarmed* archetypes rather than at the top of the curve, which would mean the change hit
  the wrong end of the ladder.

**Result (2026-07-28): the LEVER is disproved; the PREMISE is confirmed; and the step
uncovered a second instrument bug that was blocking the whole question.**

**R2a (shipped) — the fighter's self-imposed upgrade ceiling.** `planFighterUpgrade` stopped
buying at weapons strength 50 / everything-else 30, while the policy ended a 120-day career
holding a measured **~126,000 credits** and yard tier 9 (strength 90) costs 10,000. The
consequences, measured over 120 seeds × 120 days:

- `player.tier = max(rankTier, shipClassTier)` and `shipClassTier` needs strength > 50 for
  tier 4. Pinned at exactly 50, the fighter sat at **tier 3 in 97% of its encounters** and
  reached tier 4 or 5 **never**. The trader (which never upgrades at all) likewise: tier 4 —
  **0.0%**.
- `chooseTargetTier` clamps interceptors to `[tier−1, tier+1]`, so the measured **tier-5
  interceptor share was 0.0%** for both fighter and trader (6.7% for the veteran).
- **25 of the 65 entries in `ANONYMOUS_INTERCEPTORS` — the entire tier-4/5 band — had never
  been exercised by ANY balance sweep ever run.** R2 was asking "are top-tier pirates a real
  threat?" about content the instrument could not reach. This is why the elite-only power
  variants measured as an *exact* no-op: byte-identical to control, because tier 5 never
  spawned.
- With the ceiling lifted: fighter **player tier 5 in 87.7%** of encounters, **tier-5
  interceptor share 0.0% → 62.2%**; veteran 48.1%.

Same class of defect as R0a, and it is fixed the same way — by letting the instrument play
the game a competent player would. Shipped. New baseline of record:
**`docs/balance/baseline-vet-1k-r2a.json`**. At 1,000 seeds it moves **only** `fighter` and
`veteran` (the two policies sharing the wishlist); the other six rows are byte-identical,
which is the control proving the diff is this function alone.

| policy | clears | clear day | final cr | ships | deaths/1k |
| --- | --- | --- | --- | --- | --- |
| fighter | 0.70 → **0.61** | 20 → **23** | 158,978 → 155,059 | 56 → 41 | 0.47 → **0.34** |
| veteran | 0.01 → 0.00 | 90 → 96 | 12,501 → 8,372 | 84 → 103 | 0.70 → 0.86 |

The fighter buys guns instead of paying the Guild, so its clear rate falls and its clear day
moves **into the [22, 30] band**; better shields/hull make it *safer* per encounter.

**The premise is CONFIRMED — and only measurable now.** With the instrument reaching the real
top of the ladder, an armed fighter at tier 5 fighting tier-5 interceptors wins
**0.982 of even-parity encounters in a median of 2 rounds (n=15,259)**; over all prepared
cells, **0.971 (n=24,213)**. Top-tier pirates are chaff, exactly as the owner argued — it
simply could not be shown before, because nobody had ever met one.

> **A measurement trap worth recording, because it nearly produced the opposite conclusion.**
> The obvious metric — win rate in the `below`-parity (outgunned) cell — is **not comparable
> across these arms**. Raising the player's tier ceiling *empties* it: at tier 5 you cannot be
> outgunned, so the cell collapses from n=3,681 to n=342 and starts reporting early-career
> encounters only. Read naively it says the win rate fell 0.970 → 0.693 and "combat is no
> longer solved". The robust metric is win rate over **all prepared cells** (0.977 → 0.968:
> essentially unchanged). Same lesson as R0b, one level up: **check that the denominator
> means the same thing in both arms before believing the ratio.**

**The lever is DISPROVED. Both knobs overshoot; the smallest meaningful step already wrecks
the archetype it aims at.** 300 seeds × 120 days, fighter row, win rate over all prepared
cells:

| arm | win | fighter final cr | deaths/1k | trader ships |
| --- | --- | --- | --- | --- |
| control | 0.977 | 160,459 | 0.39 | 8 |
| enemy hull ×2 | 0.884 | **46,062 (−71%)** | **3.42 (×8.8)** | 8 |
| enemy hull ×3 / ² | 0.47 / 0.09 | ~2,800 (−98%) | 5.8 / 7.7 | 8 |
| +1 dmg at tier 4–5 | 0.960 | 101,088 (−37%) | 3.03 (×7.8) | 17 |
| +⌊tier/2⌋ dmg | 0.935 | 65,107 (−59%) | 6.72 (×17) | 37 |
| +(tier−1) dmg | 0.904 | 37,875 (−76%) | 11.11 (×28) | 96 |

There is no calibration that moves the win rate more than ~2 points without taking 37–76% of
the fighter's economy and multiplying fleet deaths by 6–28×. R2's own disproof branch says
"too large — halve it", and halving the smallest step is the control. **A global power
constant is the wrong shape of fix**: it fires on all ~30 encounters a career, so any setting
big enough to matter at the top is ruinous everywhere else.

**THE DISCRIMINATOR FOR R2.5 (the most useful thing this step produced).** The two knobs are
not interchangeable:

- **Enemy TOUGHNESS is a fighter-only tax.** The trader's ship losses are **8 in every hull
  arm** — identical to control at ×2, ×3 and ². It never fights, so soaking volleys costs it
  nothing.
- **Enemy OFFENSE reaches everyone who enters an encounter.** The trader goes **8 → 17 → 37 →
  96** ships across the damage ladder, because a failed talk draws return fire (the R1 kill
  path).

So hull scaling *punishes the archetype that engages and rewards the one that doesn't* — it
would make the trader's pacifism MORE dominant, which is backwards. **R2.5's ladder should
escalate the pirate's OFFENSE, not its hull**, and must be applied selectively (by history,
per the owner's design) rather than as a global constant.

**Deferred, deliberately:** the pirate data table and the wingman flag. Both are vehicles for
R2.5's demands and escalation; landing authored demand lines now, with no mechanism reading
them, would be scaffolding rather than content. They move to R2.5.

**Battery:** typecheck, lint, **1,103 of 1,104 tests green**. Two changes to the red set:
`balance-combat-survival` ("Auto-Repair no longer switches the death path off") **went GREEN**
— it was red at HEAD and R2a fixed it, because a fighter that now buys AUTO_REPAIR *and still
dies* is exactly what it asserts. `alliance-arcs` needed a seed re-pin (3 → 1) for the third
time in its history and for the identical documented mechanism — `player.tier` moves →
matchmaking draws a different interceptor sequence → the organic-mover half stops firing.
Swept seeds 1..20: **12 qualify against the previous sweep's 9**, so the organic path became
*more* reachable, not less. Only `balance-targets` (trader clear day 21) remains red; that is
R2.5's target, not this step's.

### R2c — Pay for the guns, and pay for winning (2026-07-28, SHIPPED)

Three changes landed together, at the owner's direction, because the first one alone
left an archetype non-viable.

**1. The yard trade-in ladder was indexed by STRENGTH, not by owned TIER.** A live
economy bug in the shipping build. `tradeInValue` flattened at 3,000cr for any
strength >= 9, and `buy-component-tier` sets `strength = tier * 10` — so the
trade-in credit exceeded the list price of tiers 1-7 and **every mid-ladder upgrade
was free**. Measured on a fresh day-1 save with a 1,000cr purse: drives, navigation,
lifeSupport and robotics all to tier 7 (12,000cr of list price) for **0 credits**,
cutting the jump-fuel bill ~92% (distance-10: 120 fuel -> 10) permanently. Walking
one component 1->9 cost 9,000 instead of 16,525 — a **7,525cr subsidy per
component**. Values unchanged; only the indexing is corrected, so junker-start
components (strengths 1-9) price exactly as before. The sim's private copy of the
ladder — which had inherited the same mistake, and so agreed with the engine for the
wrong reason — was deleted; it now asks `quoteShipyard`.

**2. It exposed that combat has no income.** Removing the subsidy took the fighter's
median career credits from **155,059 to 2,825** (its own operating reserve). The
fighter was never a viable economy; it was a subsidised one. `resolveEncounter`
granted no credits under any resolution, so `combatEv` was negative BY CONSTRUCTION.
A destroyed interceptor now pays `COMBAT_SALVAGE_PER_TIER` (150/tier — the rate the
NPC side has always paid its own combat wins, `npc.ts` `executeCombat`). Fighter
combat EV: **negative-by-construction -> +350 median**. `combatEv` in
`aggregate.ts` now reports salvage minus cost; pre-R2c figures are negated costs and
are NOT comparable.

**3. And it exposed that the fighter never paid its debts.** It bought kit before
remitting to the Guild — the only competent policy that did. Survivable while kit was
free; a debt spiral once it was not (seed 1 x 300 days: **4,253,290cr owed**). Kit is
now gated on `debt === 0`, the rule every other competent policy already follows.
Same seed/horizon: debt **4,253,290 -> 0**, credits **2,825 -> 584,456**, modules
1 -> 3, component tiers 4 -> 9, `shieldAbsorbedPoints` 0 -> 86.

*Measured and rejected on the way:* gating only the component ladder and letting
special equipment through (ASTRAXIAL_HULL is 100,000cr — the spiral came straight
back); a `credits >= debt + reserve` rule (stricter early, fitting rate 5/15 -> 4/15);
widening `balance-combat-survival`'s window 60 -> 90 days (moved preparation-saves to
48.0% against a 50% bar and the death rate to 0.74 against 0.8 — 60 is load-bearing).

**Baseline of record: `docs/balance/baseline-r2c-final.json`** (1,000 seeds x 120
days). trader / gambler / greedy / trader-degraded rows byte-identical; fighter,
veteran, smuggler and explorer moved.

**KNOWN RED, all three stated honestly rather than papered over:**
- `balance-targets` — trader clears day 21 against [22, 30]. **Pre-existing at HEAD**,
  untouched by this work, and R2.5's target.
- `balance-combat-survival` "Auto-Repair" — **caused by this change.** The fighter now
  kits out around day 60 instead of day 20, so careers-with-a-module inside the
  60-day window is exactly 5 of 15 against a `> 5` bar (7 at 75 days, 8 at 90+). The
  behavior change is intended; the threshold was calibrated against the subsidised
  economy. **Deliberately NOT loosened here** — that is a design call, not a
  mechanical re-pin.
- `campaign-reach` T-1307 ports — **caused by this change.** The fleet is honestly
  poorer, the veteran (6,359cr median) can no longer reach the cheapest 7,150cr port,
  and no seed qualifies at 150 OR 300 days. Owned by the port re-pricing step below.

### R2d — Re-price ports to the 1991 curve (SHIPPED 2026-07-28)

Recovered from the original Apple II source in this repo's own history
(`7ca606d7^:SQ/SP.BANK`, the live port registry; `Decompile/Source-Text/SP.REAL.txt`,
"Space Port Accounts & Fuel Depot Ltd"). **The currency needs no conversion: our
`YARD_COMPONENT_TIER_PRICES` IS the 1991 ladder**, tier for tier (`SQ/SP.YARD.5`:
"Atomic Missile 50cr ... Astral ASDRS 10000cr").

| | ours | % of field affording | OG 1991 | % affording |
| --- | --- | --- | --- | --- |
| cheapest | 7,150 | 65% | 10,000 | 62% |
| 2nd | 8,600 | 63% | 20,000 | **50%** |
| dearest | 43,500 | 30% | 140,000 | **3%** |
| all 14 | 211,750 | | 1,050,000 | |

Measured against the real field (30 NPCs + the player, n=1,860, day 120). **Our prices
are a flat shelf, not a ladder** — 13 of 14 sit between 7,150 and 19,000, so anyone who
can buy one can buy twelve, and there is no race. The 1991 curve is linear 10,000 ->
140,000 and lands exactly on the owner's stated goal: the cheapest reachable by ~62%,
the second by precisely the top 50%, the best by 3%.

**CORRECTION TO THE R2c ENTRY ABOVE.** R2c recorded that the trade-in fix had made
ports unreachable — "no seed qualifies at 150 OR 300 days". **That was a measurement
error, not a regression.** The probe used the wrong action shape (`buy-stake` for
`buy`) and REPLACED the policy's actions instead of appending to them, so it never
bought anything. Re-run faithfully, and *after* the re-pricing: the veteran qualifies
on 6 of 20 seeds at 150 days (3, 8, 11, 13, 15, 19) and 18 of 20 at 300; the trader on
18 of 20 at 150. Ports were always reachable. The `campaign-reach` test needed only a
seed re-pin (12 → 3), which is the third time that test has been re-pinned for a
content change and is its documented pattern.

**Cost, stated at the definition site:** income is unchanged (the aggregate ceiling has
no headroom), so payback stretches from [110, 150] dusks to [154, 1050]. A stake is now
a status-and-control asset rather than an investment that repays inside a career. The
"hub pays a premium" invariant was re-expressed: under a 14x price ladder against a
~4.5x income spread, payback is no longer monotone in traffic, so the pinned property
is now the plainer and now-true-by-construction one — **the dearest ports are the
busiest ones**. Protocol replay goldens moved (port prices ride the F10 port ledger in
the state summary) and were regenerated deliberately.

Also recovered: **the original port was a fuel depot** — 10cr/unit, 20,000-unit
inventory the owner stocks, plus an interest-bearing savings account. Income was
TRAFFIC-driven. Ours pays a flat `baseDuskIncome` whether or not anyone visits.

### R2.5 — The escalation ladder (the world remembers what you did)

*Depends on R2's pirate table landing — the ladder needs authored lines to speak through.*

- **Hypothesis:** the dominant line is not "escape is free", it is "**pay-and-continue is
  free**" (measured: 979 of 1,052 outgunned encounters end `talked-down`, 62 `escaped`). A
  ladder that escalates on **encounter history rather than player wealth** prices that line
  without punishing a player for being rich or for carrying good freight, and restores the
  lethality that a pure cargo-seizure mechanic removes.
- **Change (programmatic + state):** a career-scoped escalation counter. Every stance moves
  it, which is the design's load-bearing property:
  - **pay a demand →** the next demand is bigger;
  - **kill a pirate →** the next interceptor comes back heavier (respecting or deliberately
    breaking the `[tier−1, tier+1]` matchmaking clamp — decide and comment at the site);
  - **run →** the pirate gets a **parting shot** (see below), and the ladder still moves.
- **NO COOL-OFF — owner decision, 2026-07-28.** The ladder does not decay and does not reset.
  *Recorded with its counter-argument, per BALANCE-POLICY Part B rule 3:* the review's
  power-gamer flagged that a ladder which RESETS on a non-pay action is farmable (interleave
  one cheap run to zero the counter — the wanted-level cooldown exploit). **This design is
  immune to that specific exploit by construction, because every stance escalates and there
  is no reset action.** The residual risk a cool-off would have covered is different and
  should be watched in the sweep: an undecaying ladder is a one-way ratchet, so a long career
  eventually meets uniformly maximal demands and every career may end the same way. The
  acceptance below tests for exactly that (see the late-career check).
- **The parting shot.** A *successful* run currently costs **nothing** — verified in
  `resolveRun`: on success it goes straight to `resolveEncounter(..., 'escaped')` with no
  damage. The parting shot fills a real hole. NOTE for whoever grades it: the bake-off
  measured escape-pricing as inert, but **that result is conditional on nobody running**
  (5.9%). If the ladder pushes players toward the getaway, the parting shot becomes
  load-bearing — do not carry the old "this does nothing" finding forward unexamined.
- **The escape math.** Fold ship **speed** into the run check. Today `resolveRun` is a pure
  opposed PILOT roll: the ship plays no part, so **running is the only stance with no build
  investment behind it** (fighting scales with `weapons`; `drives` does nothing for it).
  `drives` already carries strength + condition and is yard-upgradeable, so this both gives
  the stance an investment path and makes a dull component matter.
- **The demand menu (R2.5b, sweep separately).** A demand may ask for credits, **credits AND
  cargo** at the top of the ladder, or **a piece of ship tech**. Two rules:
  1. **The player chooses how to pay.** The bake-off's cargo seizure failed the design bar
     precisely because it was automatic — "your freight is good, so you lose it" is a tax on
     success, structurally the same defect as the wealth-scaled tribute the same bake-off
     rejected. As a *demand the player answers*, it becomes the decision the encounter is
     missing.
  2. **Tech seizure is the sharpest of the three and needs no new persistent state** —
     components are already numbers on the ship and a seized tier is re-buyable, so it
     pressures the player without ending the career, stays visible on the ship sheet for the
     rest of the run, and gives the mid-game shipyard a reason to exist.
- **Cargo is INDIVISIBLE — a constraint, not a choice.** `player.activeContract` is a single
  nullable contract; `cargoPods` is capacity, not stackable freight. "Jettison X of your
  holds" has nothing to operate on today. Jettison is therefore **binary** (dump the contract
  or don't) unless a divisible-cargo model is scoped as its own task, which is out of scope
  here.
- **Simulate:** full fleet + `trader-degraded`, 1,000 seeds × 120 days. **Plus a mandatory
  adversarial arm:** a "fly light" policy that runs short, safe, empty routes and never
  engages, to test the failure mode this design most plausibly creates — all three stances
  getting worse at once until not flying is the best play.
- **Proves:** trader `routesLost`/`shipsLost` move off the floor; trader clear day inside
  [22, 30] **at 1,000 seeds**; trader clear rate ≥ ~0.75; the **fly-light policy does NOT
  outperform the honest trader**; fleet death rate does not fall (the "spacers die" target in
  `balance-combat-survival` stays green — a cargo-only mechanic broke it, and this design
  exists partly to avoid that); late-career demand distribution still has spread rather than
  every career pinning to the ladder's maximum.
- **Disproves:** fly-light wins (the ladder is taxing engagement rather than pricing the exit
  — weaken the run/parting-shot arm first, since that is what makes flying loaded bad); or
  clear rate collapses below ~0.6; or the ratchet flattens the late game (revisit the
  no-cool-off decision with data, not opinion).

### Cross-cutting note

Both of the cross-cutting fixes that used to live here — the stale tribute oracle and the
under-powered baseline — were promoted to **R0**, ahead of R2, by owner decision. They are
prerequisites, not companions: R2/R2.5 are graded by diffing against a baseline, and neither
the instrument nor the baseline is currently trustworthy.

---

**Appendix A — the retired R2 and the bake-off that retired it (2026-07-28).**

*Original R2 hypothesis, verbatim:* "attaching a real cost to a successful `combat_run` —
risk of cargo jettison or contract-deadline damage — moves trader `shipLostRate`/`routesLost`
off zero and pushes its clear day into the [22, 30] band, without touching the tuned combat
table and without breaking the anti-poverty-trap invariant." Original change: "on a successful
run while outgunned, roll a jettison/delay consequence." Original supporting data: trader 0
routes lost of 9,003 delivered.

*Method.* Three reviewers (designer / systems engineer / power-gamer), isolated context,
identical brief. Then every candidate simulated from the real engine before any code was
written: variants are the shipped `resolveTalk`/`resolveRun` patched at named anchors in a
tree sourced from `git archive HEAD`, each anchor asserted to match exactly once and to change
the file. The no-change control reproduced production **byte-for-byte across all seven
policies**. Rig validation: the power-gamer's advance prediction for the wealth-scaled
candidate ("clear 0.88–0.90, day 21–22, routesLost 0, shipsLost 0") was reproduced exactly by
a sweep it never saw.

*Results, trader row, 100 seeds × 120 days, identical seeds:*

| arm | clear | day | routes lost | ships | final cr |
| --- | --- | --- | --- | --- | --- |
| control | 0.90 | 21 | 0/9,003 | 0 | 79,954 |
| wallet-scaled tribute (reserve-anchored) | 0.90 | 21 | 0/9,006 | 0 | 33,532 |
| wallet-scaled tribute (gross, 12%/round) | 0.90 | 22 | 2/9,011 | 2 | 25,970 |
| price the escape (jettison 30%) | 0.90 | 21 | 31/8,960 | 0 | 79,472 |
| cargo seizure (hold > 2× toll) | 0.88 | 23 | 619/8,248 | 2 | 66,750 |

*Findings that survive the retirement and constrain R2/R2.5:*

1. **A tribute proportional to the purse cannot produce a loss** — a fraction of what you hold
   is always payable. All three reviewers reached this analytically; the sweep confirms it
   (0 ships, 0 routes, in every calibration, against a sighted trader too). It is a **wealth
   tax, not a risk lever**: −58% final credits, zero change in danger.
2. **Pricing the escape is opt-out-for-free** — a never-run trader dropped route losses 94%,
   *raised* clear rate 0.90 → 0.95 and finished richer. Conditional on the 5.9% run rate; see
   the parting-shot note in R2.5.
3. **Cargo seizure worked mechanically and failed on design.** It survived both attacks (a
   sighted trader: 631 routes lost; the run-away counter-play: 546 vs 619, a 12% dodge versus
   escape-pricing's 94%) — the hatch is closed by existing rules, since fleeing forfeits the
   delivery anyway. It fixed the red `balance-targets` test. **But** it is an automatic tax on
   carrying good freight, and it made the world *safer* — fleet death rate 0.8 → 0.28/1k,
   breaking the "spacers die" target — because seizing cargo ENDS encounters that used to
   grind into the R1 kill path. Retired on the owner's design call; the *demand menu* in R2.5b
   keeps its useful half by making it a choice rather than a confiscation.
4. **⚠ TWO CONCLUSIONS REVERSED AT 10× SAMPLE (1,000 seeds × 120 days) — the most transferable
   finding in this document:**

   | arm | day @ n=100 | day @ n=1,000 | clear @ n=1,000 | routes lost @ n=1,000 |
   | --- | --- | --- | --- | --- |
   | control | 21 | 21 | 0.920 | **19/90,264** |
   | cargo seizure 3× | **22** | **21 — fails band** | 0.903 | 2,571/87,325 |
   | cargo seizure 2× | **23** | **22 — band edge** | 0.872 | 6,552/82,985 |

   - **The trader is not immortal.** Over 120,000 sim-days the control loses **21 ships and 19
     routes** (0.175 deaths/1k). The matrix's headline "0 ships and 0 cargo across 12,000
     simulated days" — and this document's own executive summary — is a **small-sample artifact
     of the 100-seed baseline**. The defect is real but smaller than stated.
   - **The clear-day criterion is unstable at n=100.** It is a median of a discrete day number
     over a wide spread (control p25 18 / median 21 / p75 25), so ±1 day is noise. A candidate
     passed at n=100 and failed at n=1,000. **`baseline-vet-t1605.json`'s 100-seed methodology
     is under-powered for the [22, 30] target.**

Three independent reviewers (game designer / systems engineer / power-gamer), isolated context,
identical brief. Then every candidate simulated from the real engine before any code was written.

*Rig.* Variants are the shipped `resolveTalk`/`resolveRun` patched at named anchors in an isolated
tree sourced from `git archive HEAD` (not the working tree — a concurrent reviewer edited
`packages/engine` mid-run and two variants inherited it before the rig was hardened; the build now
fails if a stray probe is staged). Every anchor must match exactly once and must change the file.
The no-change control reproduces production **byte-for-byte across all seven policies**.
*Rig validation:* the power-gamer's advance prediction for candidate (a) — "clear 0.88–0.90, day
21–22, routesLost 0, shipsLost 0" — was reproduced exactly by a sweep it never saw.

*Reviewer agreement (independent, different reasoning — banked):*
1. A tribute proportional to the purse **cannot** produce a loss: a fraction of what you hold is
   always payable. All three reached this analytically; one built it and measured 0/0.
2. Candidate (d) is opt-out-for-free. Power-gamer built a never-run trader against it: routes lost
   collapsed 94%, clear rate *rose* 0.90 → 0.95, final credits rose. The trader is already 88%
   opted out before it ships.
3. **`planPacifistCombat` grades affordability with a hardcoded `min(round*1000, 10_000)` and never
   calls `tributeForRound`** — it ignores `TRIBUTE_CLASS_MULTIPLIER` (Reptiloid ×2) and
   `TRIBUTE_TIER_GAP_STEP` (×1.75), while the UI's `format.ts` shows the player the true number.
   Found independently by two reviewers. **Pre-existing bug; fix it in whatever PR lands R2**, or
   the instrument grades a blind pilot the real player is not.

*Results, trader row, 100 seeds × 120 days (identical seeds, one harness):*

| arm | clear | day | routes lost | ships | final cr |
| --- | --- | --- | --- | --- | --- |
| control | 0.90 | 21 | 0/9,003 | 0 | 79,954 |
| (a) purse-scaled, reserve-anchored | 0.90 | 21 | 0/9,006 | 0 | 33,532 |
| (a) gross-purse 12%/round | 0.90 | 22 | 2/9,011 | 2 | 25,970 |
| (d) jettison on escape 30% | 0.90 | 21 | 31/8,960 | 0 | 79,472 |
| **(b) cargo seizure, hold > 2× toll** | 0.88 | 23 | **619/8,248** | 2 | 66,750 |
| (b) at 3× toll | 0.89 | 22 | 222/8,746 | 0 | 74,007 |

(a) is a **wealth tax, not a risk lever** — it removes 58% of final credits while leaving ships and
cargo untouched, in every calibration and also against a *sighted* trader. (d) confirmed inert.

*(b) survives both attacks.* Against a **sighted** trader (oracle patched to the engine's own
function): routes lost 631, day 23 — unchanged. Against the **opt-out** counter-play the power-gamer
predicted (run whenever the hold is seizable): routes lost 546 vs 619, a **12% reduction, versus
(d)'s 94% collapse**. The hatch is closed by rules that already exist — fleeing forfeits the
delivery anyway, so dodging the seizure costs about what the seizure costs. No new guard rail.

**⚠ WHAT REVERSED AT 10× (1,000 seeds × 120 days — the most transferable finding here):**

| arm | n=100 day | n=1,000 day | n=1,000 clear | n=1,000 routes lost |
| --- | --- | --- | --- | --- |
| control | 21 | 21 | 0.920 | **19/90,264** |
| (b) 3× toll | **22** | **21 — FAILS band** | 0.903 | 2,571/87,325 |
| (b) 2× toll | **23** | **22 — band edge** | 0.872 | 6,552/82,985 |

1. **The trader is not immortal.** At 120,000 sim-days the control loses **21 ships and 19 routes**
   (0.175 deaths/1k). The matrix's headline "0 ships and 0 cargo across 12,000 simulated days" —
   and this document's own executive summary — is a **small-sample artifact of the 100-seed
   baseline**, not a property of the game. The defect is real but smaller than stated.
2. **The clear-day criterion is unstable at n=100.** It is a median of a discrete day number over a
   wide distribution (control p25 18 / median 21 / p75 25), so ±1 day is noise. (b) at 3× looked
   in-band at n=100 and fails at n=1,000. **`baseline-vet-t1605.json`'s 100-seed methodology is
   under-powered to grade the [22, 30] target**; any R2 accept/reject must be run at 1,000 seeds.

*Test ledger for (b) at 2× (run in the variant tree; control run the same way to separate rig noise):*
- **FIXES `balance-targets`** — the headline red test at HEAD goes green.
- `poverty-invariant` (10/10) and `lending-property` stay green. T-1605b holds.
- **BREAKS, genuinely:** `balance-combat-survival` gains two failures — the parity cost ordering,
  and **"spacers die" (fleet death rate 0.8 → 0.28/1k)**. Seizure *ends* encounters that used to
  grind on into the R1 kill path, so the world gets **poorer but SAFER** — the opposite of R2's
  intent. Also one `campaign-reach` and one `campaign-policies` scripted-seed failure.
- Expected: `campaign-degraded` byte-identity pins move (any engine change moves them; re-pin
  deliberately). Rig noise only: `campaign.test.ts` stdout test also fails in the control tree.

**Recommendation: (b) cargo seizure at the 2× threshold, and NOT as R2's whole answer.** It is the
only candidate that produces real cargo loss, it is robust to both the sighted and opt-out attacks,
and it fixes the clear-day test — but only to the band's edge (22), and it *reduces* lethality. If
the "spacers die" target is to be preserved, (b) needs a companion lever that restores the
mortality it removes; that is a second step, not a bigger dial on this one. Deferred: (c) is the
power-gamer's pick but needs a new persistent field + save migration and belongs in R4; it was the
one candidate this bake-off could not simulate.

- **Deferred alternative (requires reopening a constraint):** pay the victory — tier-scaled
  bounty/salvage. This reopens the "don't touch combat maths" constraint (defensible: the
  T-1603c table is tuned for *magnitudes*; combat-EV-negative-by-construction is a *sign*
  problem, and victory proceeds are a new lever, not a retune). Only take this step if
  R2's accepted form still leaves the fight stance strictly dominated in the R2 sweep —
  check: does any non-fighter archetype ever rationally choose to fight?

### R3 — Fix explorer funding inside Tour One

*Independent of R1/R2 — can be worked in parallel, but land and sweep it separately.*

- **Hypothesis:** the explorer 0% clear rate is a funding-rate problem (80-fuel sweeps as a
  pure credit sink crowd out marker payments), and raising early-career explore EV — e.g.
  better salvage rolls or reduced explore fuel cost during days ≤ 30 — lifts explorer to a
  meaningfully nonzero clear rate without making explore farmable for the trader.
- **Change (lever):** one knob — either the day-≤30 explore fuel cost or the salvage roll
  band. Pick one; do not move both in the same step.
- **Simulate:** full sweep; watch explorer *and* trader/smuggler (who must not start
  preferring explore as an income exploit).
- **Proves:** explorer clears ≥ ~0.4 with a clear-day median inside or near [22, 30];
  explorer final credits don't balloon past the fighter; trader/gambler behavior unchanged.
- **Disproves:** explorer still ≈ 0 (the sink is elsewhere — profile where its credits go
  before day 30) or other archetypes pivot to explore-farming (lever too rich — bound it
  to pre-marker-clear careers or shrink it).
- **Supporting data:** explorer 0.00 clears yet 93,342 final credits and the *most*
  encounters (40.2) — it earns fine over 120 days, it just can't front-load 25,000cr by
  day 30. Tour One is the public demo; the exploration fantasy is the PRD's own §7.2
  showcase vignette *set on Day 19, inside Tour One*, and it currently fails the tutorial
  100% of the time. All three personas flagged this; two tied it to demo conversion.

---

## THE NPC PARITY TRACK (N-series)

**Why this track exists, and why it interrupted the R-series.** The balance work kept
producing findings that were really one finding: the 30 NPCs are not playing the game.
They are an economic texture generator wearing a captain's name. Owner's framing, and
it is the right one — *"an NPC needs to trade, so they need to upgrade their ship. They
need to fly, so they need to interact with pirates. That means they pay bribes, with
either credits or cargo, or fight, or flee. They literally MUST act like a player."*

**WHAT AN NPC ACTUALLY IS TODAY (measured 2026-07-28, `packages/engine/src/npc.ts`):**

- `NpcState` is `{ id, name, profileId, currentSystemId, credits, fuel, disposition,
  lastAction }`. **No ship. No components. No XP.**
- It trades against a **phantom ship** derived from a static profile tier —
  `npcCargoPods(tier)`, `hullCondition: 9`, `npcDrives(tier)` — that never changes for
  the whole career. So an NPC's income cannot grow with investment, because there is no
  investment.
- `executeTravel` picks a random destination, burns fuel from that phantom drive, rolls
  a PILOT check for "clean vs rough jump", and arrives. **It generates no encounter.**
  An NPC has never met a pirate.
- `executeCombat` is an abstract GUNS check against no one, paying a flat `150 x tier`
  bounty. No interceptor, no stance, no damage, no repair, no ship loss.
- One action per day, on a random d20 — against the player's five-die hand with
  allocation. **The NPC field does not face the game's central decision.**

**The measured performance envelope this track has to live inside** (all taken
2026-07-28; see the N0 result for the change that bought the headroom):

| | per game day | 1,000-seed sweep, 8 cores |
| --- | --- | --- |
| today (abstract NPCs) | 1.07 ms | ~2.5 min |
| 30 full-fidelity NPCs, naive | 51.4 ms | ~103 min |
| 30 full-fidelity NPCs, post-N0 | ~40 ms | ~80 min |

**Full fidelity is affordable for PLAYING and expensive for MEASURING** — 40 ms/day is
imperceptible, an 80-minute sweep cannot be an iteration loop. That asymmetry is not a
problem to solve, it is the shape of the plan: the full sweep becomes an infrequent
CAPSTONE and the fast loop is staged smoke tests seeded from its output (N7).

### THE STANDING CONSTRAINT FOR THE WHOLE TRACK — same rules, no exemptions

*Owner ruling, 2026-07-28. This governs every N step and outranks any per-step
convenience.* **An NPC plays by the rules a player plays by.** Not "similar rules",
not "rules calibrated to produce similar outcomes" — the same functions, the same
costs, the same constraints. Where an NPC cannot use the engine's own function today,
the fix is to make the function usable by both (give it an actor parameter), never to
write the NPC a private one. R2c is the standing warning: the sim kept a private copy
of the yard ladder that had inherited the same bug as the engine, so it agreed with the
engine **for the wrong reason** and hid a live economy defect for months.

**Two consequences that are easy to miss, both already live:**

1. **Capability is a property of the SHIP, not of the captain's tier.** Tier and
   capability correlate only because a tier-5 captain *earned* a tier-5 ship. So cargo
   capacity is **objectively not a static per-captain value** — an NPC that profits from
   a delivery can buy pods, and its capacity changes. Any step that treats capacity as a
   function of `profile.tier` has re-introduced the phantom. N1 removed the last such
   read (`npcCargoPods`/`npcDrives` are now seed-only); N2 is what makes the value
   actually move.
2. **A number chosen so that a rule will NOT bite is a rule exemption, even when the
   resulting state is legal.** N1's `npcHullStrength` is the live example, and it is
   flagged at its own definition site: the ramp was calibrated against the phantom's
   *unbounded* tank rather than against what a player's ship of that capability would be.
   The seeded ships pass `maxCargoPodsForShip` — but a tier-1 NPC holds 4 cargo pods and
   a **1,200-unit tank**, where a player with comparable capacity (the junker: 10 pods,
   hull strength 1) holds **300**. **NPCs currently fly on ~4× a player's fuel.** That is
   an exemption, and N2 owns removing it (see N2's first two tasks).

---

### N0 — One copy-on-write discipline for player and NPC turns (SHIPPED 2026-07-28)

- **Why first:** NPC records are about to grow a ship, and `cloneState` deep-copied all
  thirty of them on every player action. Adding ships without this would have taxed the
  player 3.5x (`cloneState` 0.0294 -> 0.0955 ms) and made 30 captains each acting
  **quadratic** — measured 1.6 / 11.6 / 43.1 ms per day at 10 / 30 / 60 NPCs.
- **Change:** `cloneState` shares NPC records between snapshots (fresh array, shared
  records). All cross-boundary NPC writes route through one door, `mutableNpc`.
- **Result:** clone 0.0294 -> 0.0125 ms today, 0.0955 -> **0.0121** ms with fat NPC
  records — i.e. **flat in NPC richness instead of linear**, which is what kills the
  quadratic. Player-day 1.394 -> 1.066 ms as a side effect.
- **Two things worth carrying forward.** I asserted there was ONE cross-boundary NPC
  writer; there were FOUR (a grep keyed on variable names missed `dealerNpc.credits`
  and three `rescuer.*` writes — searching by FIELD found them). And it shook out a real
  engine bug: `storylets.ts` computed a clamped disposition delta from a handle taken
  before the update, reporting **0 for every clamped change**. `clone.test.ts` now holds
  the line with a source scan, verified by reintroducing a violation and watching it fail.

### N1 — NPCs own a real ship

- **Hypothesis:** replacing the phantom tier-derived ship with a real `ShipState` on
  `NpcState` changes what NPCs can earn and where they can fly, without yet changing any
  decision they make.
- **Change (state + migration):** `NpcState.ship: ShipState`. Seed it at world creation
  from the profile tier so day 1 is close to today's behavior. Point `executeTrade` /
  `executeTravel` at the real ship instead of `npcCargoPods(tier)` / `npcDrives(tier)` /
  `hullCondition: 9`. **Costs a save-version bump + round-trip test** (`schema.ts`), and
  the roster is 30 records, so watch save size.
- **Simulate:** full sweep. Expect movement even with no new decisions — cargo capacity
  and fuel burn now vary per captain instead of being a tier constant.
- **Proves:** NPC wealth spread widens; no policy row moves for a reason other than
  contract competition; save round-trips byte-identical.
- **Disproves:** the field's wealth distribution collapses or explodes — the day-1 seed
  is mis-calibrated against the old phantom.

**Result (2026-07-28): CHANGE ACCEPTED — HYPOTHESIS DISPROVED, and the step's own
Proves clause contradicts its Change clause.**

`NpcState.ship: ShipState` shipped. `NpcState.fuel` was **removed** rather than kept
beside it — the tank moved onto the ship, mirroring `PlayerState` (which has never
carried a top-level `fuel`); two fuel numbers on one captain would have been two sources
of truth. Save schema **9 → 10** with `MIGRATIONS[9]`, the first entry in that registry
that MOVES a field rather than adding one: it seeds each captain's ship from their
profile tier, pours the saved `fuel` into `ship.fuel`, and drops the old key. Idempotent,
never throws, and shares ONE seeding function with `createInitialState` and
`deserializeState` so a migrated roster cannot drift from a freshly created one.

**Nothing moved. Not approximately — exactly.** The capstone (1,000 seeds × 120 days ×
8 policies, 8 shards) is **byte-identical to `baseline-r2c-final.json` apart from the
`label` field**: all 8 policy rows and the fleet aggregate compare equal. NPC wealth
percentiles at day 30 / 60 / 120 (300 records) are identical **to the credit** at every
one of min/p10/p25/median/p75/p90/max/mean/sd. A 10-seed × 120-day × 30-NPC trajectory
hash over every captain's credits/fuel/system/disposition/lastAction is unchanged
(`1fda0f41…c0c2f` both sides).

**Why — and this is the transferable part.** The step asks the seed to be calibrated so
"day 1 is close to today's behavior" and simultaneously asks that "NPC wealth spread
widens". **Those cannot both hold.** The phantom ship IS a pure function of the profile
tier, so a ship seeded from that tier and never mutated is arithmetically the phantom
wearing a struct. Movement was only ever available by smuggling in a lever the step
forbids. The Proves clause was mis-assigned: **it belongs to N2**, where the decision
that could move it lives. Read correctly, N1's deliverable is a 30-record state change
plus a save migration with a *zero*-behaviour blast radius — and the byte-identity is the
proof it landed cleanly, not evidence of a null result. Restated Proves for N1: *no
behaviour moves; NPC capability becomes mutable state the captain owns instead of a
constant recomputed from their profile.*

**The one genuinely new number is `hull.strength = 2 + 2·tier`**, and it is calibrated
against the phantom's *unbounded* tank: pre-N1 an NPC's fuel had no ceiling. It yields
1,200 (tier 1) … 3,600 (tier 5) via the engine's own `calculateFuelCapacity`, clearing
both the 1,000-unit birth tank and the largest top-up `refuelIfNeeded` ever requests
(640, on the distance-45 Cygnus-16 → Rigel-19 run at tier-1 drives). **The clamp
therefore cannot bind** — which is what makes day 1 identical rather than merely close,
and it was verified observationally too (across 120 day-loop days no captain's fuel ever
reaches `maxFuel`). *Rejected deliberately, and recorded because it is a live candidate
for a later step:* the engine's own `maxCargoPodsForShip` licenses a hull of 1–2 for
these pod counts, which would clamp the roster's birth tank 1,000 → 300 and make every
long haul a refuelling decision. **That is a fuel-scarcity lever, not a modelling
choice**, and N1's contract is to change no decision. It stays out until a step owns it.

**Costs, measured.** Save roster 4,129 → 19,569 bytes (+519/ship × 30); +4.2% on a real
30-day save, +0.14% on a 1,000-day save (the event log dominates any real career); load
time unchanged. Per-day cost +8% on a 1,000-day career (1.40 → 1.51 ms) — ~0.1 ms of the
~39 ms of headroom N0 bought. `structuredClone` in `resolveNpcDay` was tried and is
*worse* (0.47 vs 0.42 ms ambient); the existing clone stayed.

**N0's guard was blind to nested writes, and N1 is the change that would have walked into
it.** `clone.test.ts`'s source scan matched only `handle.field = …`, so `rescuer.ship.fuel
-= amount` — the exact write this step introduces — was structurally invisible to it, as
was any `npc.lastAction.details = …`. The pattern now matches an assignment anywhere down
a member path rooted at an NPC handle while still permitting comparisons. Verified
N0-style by injecting `npc.ship.fuel -= 1` into `storylets.ts` and watching it fail, then
go green on removal. **The guard had never been tested against a nested path**; that is a
latent hole this step closed, not one it opened.

**Goldens re-pinned (2 files, deliberately).** `day-loop-golden.ts` STATE hashes
`71b3315e…` → `f07d6de2…` and `1f187dbe…` → `86fbc0cc…` — mechanism: `serializeState`
carries 30 more ship blocks. **Both EVENT hashes are unchanged**, and that split IS the
evidence: a mis-calibrated seed would have moved the event hashes too. `replay-golden.ts`
regenerated; only the three SESSION strings needed to (they embed `serializeState`), and
rewriting every NPC record back to its pre-N1 shape makes all six compare equal, rngStates
included.

**Baseline of record is UNCHANGED: `docs/balance/baseline-r2c-final.json`.** Per R1's
precedent, a disproved hypothesis re-pins nothing. `baseline-n1.json` is committed as the
provenance of this step's capstone; that it diffs to nothing against its predecessor is
the finding, and one `diff` reproduces it.

**Battery:** `npm test` **1,114 passing / 0 failing** (1,104 + 10 new: 4 seed-calibration,
6 v9→v10 migration), `tsc -b`, `eslint`, `prettier` all clean. The two `it.fails`
tripwires were not touched and still hold — expected, since no policy row moved.

> **BLOCKS N2, found here: the shipyard API is player-shaped.** `quoteShipyard`,
> `shipyardCost`, `shipyardFailure`, `applyShipyardMutation` and `maxCargoPodsForShip` all
> take `(state: GameState, …)` and read `state.player.ship` / `.credits` / `.registry`
> directly. **An NPC cannot be priced through any of them as they stand** — so N2's
> instruction to price upgrades "through the engine's own `quoteShipyard`, never a
> parallel cost model" is currently *impossible*, and the path of least resistance is
> exactly the parallel cost model R2c warns about. Giving these functions an actor
> parameter (ship + credits + rank) is **N2's first task, not an optional cleanup**.

### N2 — NPCs upgrade their ships

*The owner's stated core complaint: "If the NPC never upgrades their ship, they never
increase their trade profit."*

- **Hypothesis:** an NPC that reinvests profit into its fit earns more over a career,
  producing the wealth SPREAD a 31-captain race needs — some compounding, some stuck.
- **INHERITS N1's PROVES CLAUSE.** *"NPC wealth spread widens"* was written into N1 and
  is unachievable there: a ship seeded from profile tier and never mutated is
  arithmetically the phantom it replaced (see N1's Result). The spread is **N2's** to
  produce, because N2 owns the decision that moves it. Grade it here.
- **FIRST TASK — the shipyard API is player-shaped, and this step is blocked until it
  is not.** Found during N1. `quoteShipyard`, `shipyardCost`, `shipyardFailure`,
  `applyShipyardMutation` and `maxCargoPodsForShip` all take `(state: GameState, …)` and
  read `state.player.ship` / `.credits` / `.registry` directly, so **an NPC cannot be
  priced through any of them as they stand.** Give them an actor parameter (ship +
  credits + rank). This is not optional cleanup: without it the path of least resistance
  is the parallel cost model the standing constraint forbids.
- **SECOND TASK — remove N1's fuel-tank exemption, here and not before.** N1 seeded
  `hull.strength = 2 + 2·tier` to clear the phantom's unbounded tank, leaving NPCs on
  ~4× a player's fuel for comparable capacity (see the standing constraint above).
  Re-seed the hull to what a player's ship of that capability would be. **It must land in
  THIS step and not earlier**, because tightening the tank without granting the upgrade
  path makes an NPC permanently poorer with no recourse — which is itself a same-rules
  violation, since a player can buy a better hull. Coupled with upgrades it becomes the
  intended loop: profit → better hull → bigger tank and more pods → longer, richer hauls.
  It IS a fuel-scarcity lever, so sweep it as its own knob (one change, one hypothesis).
- **Change (programmatic):** an upgrade decision in the NPC turn, priced through the
  engine's own `quoteShipyard` — never a parallel cost model. Note R2c's lesson here:
  the sim's private copy of the yard maths inherited the same bug as the engine and so
  agreed with it for the wrong reason.
- **Simulate:** full sweep + the NPC wealth distribution at day 30/60/120.
- **Proves:** NPC final-wealth spread widens materially vs N1; the richest captains are
  the ones who upgraded; the poorest still exist (no universal escalator).
- **Disproves:** every NPC converges on the same fit (the decision is not a decision), or
  NPC wealth runs away and they out-compete the player for contracts.

### N3 — NPCs meet pirates, and answer them

- **Hypothesis:** routing NPC travel through real encounter generation, with a real
  stance choice, makes the NPC field carry the same risk the player does — which is the
  precondition for their wealth spread meaning anything.
- **Change (programmatic):** generate encounters on NPC jumps; give the NPC a stance
  (pay with credits, pay with cargo, fight, flee) resolved by the SAME combat rules;
  apply damage, repair and — the sharp end — **ship loss**.
- **SETTLED (owner, 2026-07-28): an NPC death is PERMANENT. No succession, no
  replacement, no respawn.** The player gets succession; an NPC does not. The framing is
  *"in many real-world multiplayer games, sometimes a player quits"* — the seat empties
  and stays empty. Consequences to build deliberately rather than discover:
  - **The field shrinks over a career.** Contract competition falls, and the Honor List
    (N6) loses contenders. That is the intended fiction, not drift — but N8 must measure
    the shrink rate, because a roster that empties by day 60 is a different game from one
    that loses two captains in 120 days.
  - **Authored content attached to the dead.** The cast carries bond hooks, NPC chains and
    fence/lender roles (Penny Wise, Smuggler Ray, the Sage). Killing the lender must not
    strand the loan verb. Either exempt the service NPCs from mortality or make their
    absence a real consequence — decide per NPC, and say which at the definition site.
  - **A dead captain's record stays** (for the wire, the Honor List's history and any
    grudge the player still carries); it is marked dead, not deleted.
- **Simulate:** full sweep + NPC deaths/1k days beside the player's.
- **Proves:** NPCs lose ships at a rate in the same order as the player's archetypes;
  contract competition drops when captains die; the wire narrates it.
- **Disproves:** NPC death rate is wildly off the player's (the stance logic is not
  player-like), or the roster empties out over a long career.

### N4 — NPC archetypes

- **Hypothesis:** assigning each of the 30 a playstyle (trader / fighter / explorer /
  smuggler / gambler / veteran) produces a field that behaves like 30 different people
  rather than 30 samples of one distribution.
- **Change:** an archetype per NPC at world creation, driving its turn. Reuse the sim
  policies' *logic* where possible — they already encode these styles — without paying
  the player's full day loop (see the performance envelope above).
- **Proves:** per-archetype NPC outcomes differ measurably (wealth, deaths, fit); the
  Honor List (N6) shows different captains topping different titles.
- **Disproves:** archetype makes no measurable difference — the NPC turn is too coarse
  for the distinction to survive.

### N5 — NPC proficiency spread

- **Hypothesis:** *"some will play very well, some will make mistakes."* This is already
  built and calibrated: R1's `PilotDegradationProfile` models exactly this (noisy die
  allocation, thin fuel margin, greedy contract overreach) and measured a **7.6x**
  survival difference between a sharp and a sloppy pilot.
- **Change:** a proficiency profile per NPC at world creation, spread across the roster.
- **Proves:** NPC outcomes correlate with proficiency, not just archetype; the field has
  a visible top and bottom that is not purely luck.
- **Disproves:** proficiency washes out — the NPC turn has too few decisions for skill to
  express itself, which would itself be a finding about the turn's depth.

### N6 — The Honor List becomes a real 31-way board

- **Depends on N1** (NPCs must have components to rank).
- The 1991 board is already shipped as a personal one (`honorList` in `ui/format.ts`,
  T-1406) precisely because `NpcState` had no ship. Once N1 lands, the same function
  ranks the whole field, which is what the owner asked for originally and what makes the
  eight titles a contest rather than a progress bar.

### N7 — The measurement rig: capstone sweep + staged smoke tests

*Owner's design, recorded because it is the answer to the 80-minute sweep.*

- **The loop:** a full sweep produces data -> the data is crunched and diffed against the
  previous run -> **checkpoint markers are extracted from it** -> those become fast
  staged smoke tests (e.g. days 1-3, 21-23, 41-43) run on every change. A full sweep is
  only warranted as a **capstone after a series of green smoke tests**.
- **Build:** (a) a differ that compares two sweep aggregates and reports what moved and
  by how much; (b) a checkpoint extractor; (c) the staged runner.
- **Fixtures live in `docs/balance/smoke/`** (folder and contract established
  2026-07-28 — see its README). Every fixture records `productVersion`,
  `saveSchemaVersion`, a **`rulesFingerprint`**, and its sweep provenance.
- **VERSIONED BY A DERIVED FINGERPRINT, NOT A DECLARED NUMBER** (`docs/VERSIONING.md`
  §3). The fingerprint is a hash over the sources that decide outcomes
  (`packages/content/src` + the engine's rule modules), so changing a tribute constant
  moves it without anyone remembering to. **A stale fingerprint fails loudly and is never
  silently used** — a smoke run against another ruleset's checkpoints reports green about
  a game that no longer exists, which is worse than no test at all.
- **Each smoke tier seeds a best-guess SPREAD of progression across the 30 NPCs** (and
  the player), so a tier exercises a realistic field rather than 31 identical captains.
  The first spreads are estimates; **every capstone run harvests real milestone samples
  to replace them**, so the fixtures get truer with each capstone instead of staying at
  whatever was guessed on day one.
- **THE HONEST CAVEAT, which must be written into the rig itself:** you cannot *start* a
  career at day 21 without simulating days 1-20, so the mid-game tiers need SYNTHESIZED
  states. That is fine for a breakage detector and **must never be used to grade
  balance** — this repo's own tests warn against poking state to reach a scenario. Smoke
  tests catch regressions; the capstone sweep remains the only authority on numbers.

### N8 — Re-pin the baseline against a living field

- Everything above changes the world the player trades in — captains claiming contracts,
  buying ships, dying. **Every balance number in this document moves.** Re-pin at 1,000
  seeds (the R0b standing amendment) and re-read the R-series conclusions against it,
  especially R2.5, whose escalation ladder was designed against a field that took no risk.

---

## IMPORTANT

### R4 — Predation pressure, redesigned as authored pursuers

*Depends on R1's answer and R2/R2.5 landing first.*

> **Re-scope note (2026-07-28):** R2.5's escalation ladder now owns "the world responds to
> what you did". R4's remaining, non-overlapping half is "the world responds to what you
> **have**" (the wealth-to-power ratio) — and the bake-off's power-gamer built the hoarder
> policy that R4's acceptance calls for and found under-investment is *already* a bad trade
> (final credits 10,970 vs the honest trader's 23,714, clear rate 0.80 vs 0.90). Re-read R4
> against the ladder before starting it: it may collapse into "authored named pursuers as
> content", with the wealth dial deleted.

- **Hypothesis:** wealth-responsive pressure delivered as **legible, Flaw-driven authored
  pursuers** (a Rattlesnake-grade grudge or a named predator that ignores the
  [tier−1, tier+1] clamp when the wealth-to-power ratio is high) produces the "the rim
  notices soft money" effect without creating a stay-poor/never-upgrade dominant line.
- **Change (programmatic):** matchmaking-side only, per the matrix §6 constraint —
  a pursuer encounter class whose `combat_run` is opposed at a penalty, gated on
  credits-vs-fit ratio, fronted by named NPCs so the pressure is diegetic and learnable
  rather than an invisible dial.
- **Simulate:** full sweep + one adversarial policy added to the sim: a "pauper" variant
  that deliberately hoards nothing and never upgrades, to prove under-investment is *not*
  now optimal.
- **Proves:** high-ratio archetypes (trader) see pursuer encounters and nonzero
  consequences; banking the purse into fit measurably lowers pursuit (the self-correcting
  property); the pauper policy does *not* outperform the trader; greedy (the control) does
  not become unrecoverably worse than its 1.00 deaths/1k baseline.
- **Disproves:** pauper wins (the power-gamer failure mode — shrink the ratio's rate effect,
  keep only the pursuer-quality effect) or rich-but-fueled-down captains get stranded
  (breaks T-1605b — add a fuel-state guard to pursuer eligibility).
- **Supporting data:** matrix §6 open questions (liquid credits vs total assets; the
  poverty-trap interaction) are decided by this step's design — record the choices here.

### R5 — Repair the deeds/credits inversion

- **Hypothesis:** the fighter's deed drought (14, the fewest, despite ADMIRAL rank money)
  and the smuggler's death tax (0.75 deaths/1k for +11 deeds) are both incentive
  misalignments: the progression spine (deeds → renown → tier) punishes the two most
  engaged-with-risk styles. Adding combat-reachable deeds and/or softening the smuggler's
  marginal mortality brings every archetype's deed rate into a band where no style is a
  deed desert.
- **Change:** two separate steps, swept separately —
  (a) **content lever:** audit the 44 deeds for combat reachability; add or re-gate deeds a
  fighting career actually triggers (the veteran policy proves the encounter-stance deeds
  are reachable; the fighter simply never steers at them);
  (b) **lever:** whatever R2/R4 landed on, check smuggler deaths/1k — if still ≥ 0.75,
  tune the contraband/rim risk premium down one notch.
- **Simulate:** full sweep; compare `deedCount.median` spread across archetypes.
- **Proves:** fighter deeds ≥ ~20 (within reach of the fleet median) without its final
  credits inflating; smuggler deaths/1k ≤ ~0.5 while keeping its deed lead (risk premium
  preserved, tariff reduced).
- **Disproves:** fighter deeds unmoved → the gap is policy (the sim fighter doesn't chase
  deeds), not content — reclassify as a sim-fidelity fix, not a balance change.

### R6 — Instrument Contract Competition in the sweep

- **Hypothesis:** Contract Competition (PRD §2's named retention mechanic; errata E3 — NPCs
  claim off the *player's* board, ≤ 1/dusk when co-located) is currently invisible in the
  balance data and may not be biting the winning archetype at all.
- **Change (sim/metrics only):** add columns to `packages/sim/src/balance/aggregate.ts` —
  contracts lost to NPC claims per career, and the credit value of claimed contracts —
  per archetype.
- **Simulate:** re-run the sweep; no engine change, so goldens must be byte-identical.
- **Proves/disproves:** this step only *measures*. If the trader loses ≈ 0 contracts to
  competition, the PRD's most legible "economy fights back" mechanic is not reaching the
  dominant style — feed that finding into a follow-on lever task.

---

## NICE-TO-HAVE

### R7 — Escape-fatigue DC creep

> **ABSORBED INTO R2.5 (2026-07-28).** The escalation ladder is this idea generalised from
> the run stance to all three stances. **Do not build the reset-on-any-non-run form described
> below** — the bake-off's power-gamer identified it as farmable (interleave one cheap
> non-run stance to zero the counter, the wanted-level cooldown exploit). The ladder is immune
> because every stance escalates and there is no reset action. Kept for the record only.

- **Hypothesis:** cumulative DC creep on consecutive successful `combat_run` results within
  a career (reset on any non-run stance) breaks the "escape as habit" pattern more cheaply
  than R2's consequence roll. *Candidate mechanism for R2's bakeoff rather than a separate
  step — listed here in case R2's chosen form under-delivers.*
- **Simulate/criteria:** as R2.

### R8 — Wire/story-engagement metric

- **Hypothesis:** optimizing playstyles are silently skipping the emergent-narrative content
  (storylets, hangout, NPC chains) the game is selling. **Measure-only:** add per-archetype
  counters for storylet fires, hangout visits, NPC-chain touches to the aggregate. If the
  trader's numbers are near zero, that is a retention finding for the design side.

### R9 — Explain `greedy`'s ambient deaths

- **Hypothesis:** 12 ships lost at only 2.0 encounters/career means the control archetype is
  dying to something other than encounter outcomes (unrepaired hull attrition, stranding).
  **Measure-only:** itemize its loss causes in one instrumented run. If losses are
  encounter-independent noise that could also hit players, escalate; if they're the
  intended cost of buying nothing (its role as the cautionary control), record and close.

---

## Sequencing at a glance

```
DONE: R1 ──► R0a ──► R0b ──► R2 ──► R2c ──► R2d ──► N0

NPC PARITY TRACK (in progress — the R-series is PAUSED behind it, see below):
  N0 (copy-on-write, DONE)
   └─► N1 (NPCs own a real ship)  ──► N6 (Honor List becomes a 31-way board)
        └─► N2 (NPCs upgrade)
             └─► N3 (NPCs meet pirates + answer them)
                  └─► N4 (archetypes) ──► N5 (proficiency spread)
                       └─► N7 (capstone sweep + staged smoke tests)
                            └─► N8 (re-pin the baseline against a living field)

THEN the R-series resumes, re-read against N8's baseline:
  R2.5 (escalation ladder + demand menu) ──► R4 (predation) ──► R5b (smuggler tariff)

WHY THE PAUSE: R2.5's ladder was designed against a field that takes no risk and never
upgrades. Landing it before N8 would tune the player's world against captains who are
not in it.
R3 (explorer)  — parallel, separate sweep
R6 (instrument) — any time, goldens-identical
R5a (fighter deeds) — after R2 lands
R7 — ABSORBED into R2.5.  R8/R9 — opportunistic
```

One change per step. One sweep per change. Re-pin the baseline only on an accepted
hypothesis, and append the result under the step before moving on.

**Two standing amendments from the R1/bake-off work (2026-07-28), binding on every step below:**

1. **Grade at 1,000 seeds × 120 days, not 100 — DONE (R0b).** The 100-seed arm cannot resolve
   the clear-day target to the ±1 day the [22, 30] band is graded at, and its "0 ships / 0
   cargo" headline was a sampling artifact (19 ships and 17 routes at n=1,000). Baseline of
   record is now `baseline-vet-1k.json`. **Corollary for every future step: never report a
   rate as 0.00 off a small arm — report `< 1/n`, or re-run bigger.**
2. **A rejected hypothesis is a result.** R1's was rejected and produced the re-scope that
   this document now runs on. Record outcomes under the step, including the ones that say
   "the premise was wrong".
