# Balance Redesign Worklist — one change, one hypothesis, one simulation

**Status:** work list, written 2026-07-28. Output of the archetype-balance review (senior-dev
assessment + three independent persona reviews: casual gamer, power gamer, game designer —
all run on Sonnet, all briefed with identical neutral data).
**Companions:** `BALANCE-POLICY.md` (governance, plus the archetype vocabulary and measured
baseline in its Part D), `PRD-REIMAGINED.md` (design intent).

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
| *(the band assertion was SPLIT out and re-homed on 2026-07-29 — see below)* | | |

> **THE BAND TRIPWIRE FIRED ON NOISE DURING N2, AND THAT IS THE MOST IMPORTANT TESTING
> LESSON THIS TRACK HAS PRODUCED.** `balance-targets` bundled two claims of very different
> statistical cost into one test running a **40-seed** arm:
>
> - *the trader clears, and clears fastest of the three* — resolves fine at n=40;
> - *its median clear day sits inside [22, 30]* — **does not.**
>
> The band is a median of a discrete day over a wide spread (capstone p25 18 / p75 25), so
> ±1 day is noise at n=40. During N2 that arm read **22**, flipping the tripwire green and
> **announcing that R2.5's defect was fixed — while the authoritative 1,000-seed capstone
> read 21 both before and after.** R0b's standing amendment had already predicted exactly
> this ("a candidate passed at n=100 and failed at n=1,000"); it simply had not been applied
> to the test itself. **A criterion that can announce a balance fix that did not happen is
> worse than no criterion.**
>
> **Fix (owner decision, 2026-07-29): split by what the sample can resolve.** The 40-seed arm
> keeps the ordering claim — robust at n=40 precisely because it compares three medians on
> identical seeds rather than pinning the absolute position of one. The band moved to a new
> block graded against **the committed capstone**, read from disk so that re-pinning is a
> data change and a missing baseline fails loudly. It carries the `it.fails` tripwire, now at
> a sample size that can actually tell when R2.5 lands.
>
> **General rule this earns: match the assertion to the sample, not the sample to the
> assertion.** Splitting one test into two is usually the cheaper half of that trade.
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
  --milestone-days 21,29,30,41,60,120 \
  --policies trader,trader-degraded,fighter,explorer,veteran,smuggler,gambler,greedy --shard i/8
npm run balance:sweep -w @spacerquest/sim -- --label <label> --merge

# THEN re-extract the smoke fixture FROM THE CAPSTONE YOU JUST WROTE — not bare.
npm run balance:extract -w @spacerquest/sim -- --aggregate docs/balance/baseline-<label>.json
```

> **BOTH FLAGS ARE LOAD-BEARING, and this block omitted both until 2026-07-29.**
> Copy-pasting the old version cost a re-run in the R2c-follow-up step, twice:
> - **No `--milestone-days`** and the capstone carries no milestone samples, so it is
>   ~7,400 fields SHORT of its predecessor. `balance:diff` reports those as removed
>   paths, which is easy to mistake for diff noise and filter away — that is exactly
>   how it got missed the first time.
> - **A bare `balance:extract`** defaults to `--aggregate docs/balance/baseline-n1.json`,
>   which has no milestones — so it silently rewrites the fixture with
>   `spreadSource: "estimated"` and downgrades a `"harvested"` one. The extractor
>   prints which it did (`spreads harvested` vs `spreads estimated`); read that line.
>   The fixture's own `provenance.spreadSource` is the durable record.

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
  in this document's own executive summary and in `BALANCE-POLICY.md`'s archetype matrix
  (Part D) — is a
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
  > **CLOSED 2026-07-29** (R2c-follow-up): 0.00 -> **0.777**. The 0.00 was real, and it was
  > not a funding rate — `explorerPolicy` had no `planDebtPayment` call at all. Note this
  > bullet's own warning got the diagnosis exactly backwards in a way n could not fix:
  > the rate really was 0.00, at every sample size, because nothing ever paid.

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

> **CORRECTION TO CLAIM 3 (2026-07-29, doc-audit finding).** Two things in that
> paragraph were false as written, and the second one hid a live defect for a day.
> **(a)** "the rule every other competent policy already follows" — it was the
> fighter's new rule and nobody else's. `COMPETENT_POLICIES` is
> `[trader, fighter, explorer]`, and the explorer gated its yard purchase on
> `credits >= EXPLORER_RESERVE / 2` with no reference to `player.debt` at all.
> **(b)** "the fighter never paid its debts … the only competent policy that did"
> — the audit that produced (a) went looking for the explorer's *late* remittance
> and found it had **no remittance of any kind**: `planDebtPayment` appeared in
> five policies and never in `explorerPolicy`. A policy that never remits at all
> cannot show up in a search for policies that remit late, which is exactly how
> R2c looked straight at this and missed it. **Both are now fixed in code** — see
> the R2c-follow-up entry below, which also settles R3.

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

### R2c-follow-up — The explorer remits to the Guild (SHIPPED 2026-07-29)

**Found by auditing this document against the code it describes, not by a sweep.**
R2c's claim 3 said kit was "gated on `debt === 0`, the rule every other competent
policy already follows." Checking that sentence against `COMPETENT_POLICIES`
(`[trader, fighter, explorer]`) found the explorer buying at the yard on
`credits >= EXPLORER_RESERVE / 2`, never reading `player.debt`. Pulling that thread
found the real defect underneath it, which was larger and older.

**THE EXPLORER HAD NO DEBT REMITTANCE AT ALL.** Not a late one, not a weak one:
`planDebtPayment` was called by the trader, smuggler, gambler, fighter and veteran,
and never by `explorerPolicy`. Measured on shipped code, 30 seeds x 120 days:

| | before | after |
| --- | --- | --- |
| marker cleared | **0 of 30** | 30 of 30 |
| `TourOneResolved` | `unpaid` 30 of 30 | `cleared` 30 of 30 |
| credits held on day 30 | median **39,866** | — |
| debt at day 120 | **148,696**, identical on every seed | 0 |

That last row is the tell. A debt that lands on the same number from every starting
seed is a debt **nothing ever touches** — 25,000 principal, flagged unpaid at day 30,
then compounded by `day.ts`'s dusk interest for ninety days with no payment against
it. And the explorer could afford it the whole time: a median 39,866 credits on the
day the marker fell due. It also ate the `guild.debt-flagged` penalty — leaner
manifests, keener patrols — for every career, which is why `encountersPerRun` drops
40.5 -> 37.1 once the marker is actually paid.

**Fix: the missing verb, not a new one.** `explorerPolicy` now ends with the same
`planDebtPayment` call every other policy already had, held back by a dedicated
`EXPLORER_DEBT_RESERVE` (6,000) so the remittance cannot eat tomorrow's refuel.

**THE YARD PURCHASE IS DELIBERATELY *NOT* DEBT-GATED, and this is the interesting
half.** The obvious reading of the audit finding — "make the explorer obey the
fighter's `debt === 0` rule" — is wrong, and measurement says so three times over:
1. `quoteShipyard` prices the tier-3 drives buy at **175 credits**. R2c's spiral was
   built out of 10,000cr STAR_BUSTERs and a 100,000cr ASTRAXIAL_HULL. A 175cr
   purchase is not that class of kit and cannot reproduce that failure.
2. It fires on **day 1**, out of the 1,000cr starting purse, 29 days before the
   marker is due. Any debt-shaped gate is unsatisfiable on day 1 by construction —
   `debt === 0` and an N9-style `credits - debt` hold (which needs 26,000cr) would
   not have *delayed* this buy, they would have **deleted** it.
3. Deleting it breaks the arc. Tier-3 drives cut fuel-per-jump 60 -> 5, the only
   thing that brings the Polaris-1 rim hop inside the sign-cap — so the whole T-1310
   pursuit that `campaign-nemesis.test.ts` grades at ≥80% of 50 seeds hangs off that
   one 175cr line.

The general rule this earns, and it generalises past this policy: **a debt gate is a
gate on DISCRETIONARY kit, never on the capability that generates the income.** The
drives *are* the explorer's earning power, so gating them behind the marker gates the
explorer out of ever paying the marker — the anti-poverty-trap invariant in its
purest form. R2c's phrasing invited the wrong generalisation by describing its rule
as fleet-wide when it was one policy's answer to one five-figure shopping list.

**Reserve tuning, and a sampling mistake caught in flight.** The first cut reserved
only `EXPLORER_RESERVE` (2,000) and the capstone answered with `shipsLost` **41 ->
57** and `fuelStarvationDays.mean` 0.0130 -> 0.1390 — precisely the failure
`TRADER_RESERVE`'s own comment records ("pays down debt aggressively, then strands
with no credits to fill the tank"). A 250-seed sweep then picked 8,000 on a
starvation reading of **0.012 that did not survive n=1,000 (0.104)**. Only 9-17 runs
in 1,000 starve at all, so that column is a ten-run tail and its non-monotonicity is
noise; the clear rate and clear-day median are monotone over all 1,000 and are what
the value is actually ranked on. **This is R0b's standing amendment biting a
constant instead of a test** — the same shape as the `balance-targets` split, and
the second time in this document a candidate has passed at a small n and failed at
1,000. Re-swept at 1,000 seeds, 6,000 is the highest clear rate among values landing
the median inside R3's [22, 30] band, and the only one whose ship losses come in at
or below the pre-change 41. Full table in the `EXPLORER_DEBT_RESERVE` comment.

**Capstone (1,000 seeds x 120 days), explorer row:**

| | N2 baseline | now |
| --- | --- | --- |
| `tourOneClearRate` | 0.000 | **0.777** |
| `debtClearedDay.median` | never | **23** |
| `survival.shipsLost` | 41 | **39** |
| `deedCount.median` | 24 | 28 |
| `encountersPerRun` | 40.47 | 37.07 |
| `finalCredits.median` | 79,168 | 57,327 |

The explorer's renown profile moves with its purse, and this is the one row worth
flagging that is not in the table: `renownRanks` goes `{GRAND_MUFTI 907, MEGA_HERO 88,
TOP_DOG 5}` -> `{MEGA_HERO 865, GIGA_HERO 68, GRAND_MUFTI 67}`. It is a downstream
consequence of the -27.6% final credits, not a separate lever, and the TOP_DOG bucket
disappearing is 5 careers out of 1,000. Recorded, not tuned.

Fleet `tourOneClearRate` 0.4145 -> 0.5116; fleet `shipsLost` 609 -> 607. **Only the
explorer row moves** — trader, fighter, veteran, smuggler, gambler, greedy and
trader-degraded are byte-identical, which is the control proving the edit stayed
inside `explorerPolicy`. `rulesFingerprint` is UNCHANGED (`2273d380…`): this is an
instrument change, not a ruleset change, and the smoke fixture was re-extracted once
at the end per standing amendment 3, from this capstone, `spreadSource: "harvested"`.

**Two procedural traps this step fell into, both now fixed in the sweep block at the
top of this document rather than just described here.** The capstone was first run
without `--milestone-days`, producing a baseline ~7,400 fields short of its
predecessor; `balance:diff` DID report every missing path, and they were filtered out
of the terminal as noise. Then a bare `balance:extract` — which defaults to
`baseline-n1.json`, a capstone with no milestones — rewrote the fixture from
`spreadSource: "harvested"` down to `"estimated"`. Neither failed a test: the smoke
suite validates the fixture it is given, and a fixture full of estimates is still a
valid fixture. **The check that catches both is reading the extractor's own
`spreads harvested` / `spreads estimated` line, and diffing the new baseline's field
set against the outgoing one before re-pinning.**

**This closes R3** — see that step for the disproved hypothesis and the one
acceptance criterion it does *not* close.

**Baseline of record re-pinned to `docs/balance/baseline-r2c-explorer-remit.json`**
(standing amendment 1: re-pin on shipped code). Battery **1,233 passing / 0
failing**; `tsc -b`, `eslint`, `prettier` clean. The `campaign-degraded` explorer
fingerprint is re-pinned with mechanism logged at the site (entry 7).

> **THIS IS THE CURRENT BASELINE OF RECORD — read this before diffing (2026-07-29).**
> `docs/balance/` holds every historical capstone, and the two most recent-LOOKING
> names are not the current one. In particular **`baseline-n9-shipped.json` is
> SUPERSEDED** by the line above; diffing against it reports ~2,000 moved fields
> across all 9 rows that were already accounted for by this re-pin. A doc audit did
> exactly that and briefly mis-filed the result as live baseline drift. If you are
> checking whether the baseline still describes HEAD, diff
> `baseline-r2c-explorer-remit.json`, and pass the milestone set it was measured with
> (`--milestone-days 21,29,30,41,60,120`) — a different milestone set shifts every
> `milestones[i]` index and manufactures thousands of phantom deltas.

### R2d — Re-price ports to the 1991 curve (SHIPPED 2026-07-28)

Recovered from the original Apple II source in this repo's own history
(`7ca606d7^:SQ/SP.BANK`, the live port registry; `7ca606d7^:Decompile/Source-Text/SP.REAL.txt`,
"Space Port Accounts & Fuel Depot Ltd"). **The currency needs no conversion: our
`YARD_COMPONENT_TIER_PRICES` IS the 1991 ladder**, tier for tier
(`7ca606d7^:SQ/SP.YARD.5`: "Atomic Missile 50cr ... Astral ASDRS 10000cr").
*All three paths are HISTORICAL — `7ca606d7` quarantined the Museum Edition, so none
of them exist at HEAD and each needs the `7ca606d7^:` prefix to resolve.*

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

> **WHAT "RECOVERED" MEANS HERE — precision added 2026-07-29 (doc audit), no code
> change.** The distinction is worth stating because an earlier audit pass read the
> `(15 - systemId) * 10_000` formula in `content/ports.ts` as a description of the
> shipped table and flagged it as an overclaim.
>
> - **The VALUES are recovered exactly.** The shipped price multiset is precisely
>   {10,000, 20,000, ... 140,000} — every rung of the 1991 ladder, once each. Verified
>   against `7ca606d7^:SQ/SP.BANK`, whose third numeric field is the price in units of
>   10,000cr (`SP.REAL.txt` prints it `m6"0,000 cr"` and charges it at `buy1`), and
>   which is `15 - systemId` for all fourteen ports.
> - **The per-port ASSIGNMENT is deliberately ours, not the source's.** The rungs are
>   handed out in measured-traffic-band order, not by `systemId`. Only Sun-3 (1) and
>   Fomalhaut-2 (7) coincide; the other twelve do not. The aggregate row in the table
>   above is what R2d claimed and it holds — but `(15 - systemId) * 10_000` describes
>   the 1991 registry, **not** this table, and should never be cited as if it did.
> - **The "tier for tier" phrase above is about `YARD_COMPONENT_TIER_PRICES`, not
>   ports** — and it is exact: `[50, 100, 200, 400, 800, 1500, 3000, 5000, 10000]`
>   matches `SQ/SP.YARD.5` nine for nine.
>
> **Why the source's assignment was rejected — settled, do not re-litigate.** Applying
> `(15 - systemId) * 10_000` against our income column puts **six of fourteen ports
> outside the pinned payback window** (Altair-3 1,600 dusks, Denebola-5 1,385,
> Aldebaran-1 1,368, Deneb-4 1,053, Vega-6 118) and creates **strictly dominated
> ports** — Aldebaran-1 at 130,000cr for 95/dusk against Mira-9 at 70,000cr for
> 115/dusk — failing the price/income monotonicity check in `port.test.ts`. The reason
> is structural: 1991 port income was TRAFFIC-driven, so its `systemId` order carried
> the traffic signal implicitly; ours pays a flat `baseDuskIncome`, so price must be
> assigned in income rank order or the ladder stops being a ladder. Full fidelity to
> the source's assignment would be a worse board, not a purer one.
>
> **SMOKE FIXTURE RE-STAMPED, AND WHY THAT IS NOT A RE-MEASURE.** The corrections
> above are comment-only, but `rules-fingerprint.ts` hashes raw file bytes, so
> editing a comment in `content/ports.ts` moved `rulesFingerprint`
> (`2273d3802c590a13` → `17a2a0a078160bbe`) and turned the three N7 freshness tests
> red. The change was proved inert before anything was re-stamped: an 8-shard
> capstone on the edited tree versus stashed clean HEAD, identical seeds, 7,000 rows
> each, diffed to **"NOTHING MOVED. Every compared field is equal on both sides."**
> `docs/balance/smoke/tiers.json` was therefore re-extracted from the UNCHANGED
> baseline of record — provenance still `r2c-explorer-remit`, 8,000 runs, spreads
> `harvested` — so the only fields that moved are the fingerprint and the extraction
> date. No new capstone was committed, because no rule changed. Battery **1,233
> passing / 0 failing**.
>
> **This is a false positive of the instrument, and it is being fixed** — see the
> N7-FP entry below. The byte hash is broader than the contract in
> `docs/VERSIONING.md` §3 ("a hash over the files that decide outcomes"), and the
> cost lands precisely on keeping definition-site commentary correct, which is how
> the two wrong figures above survived this long.

**CORRECTION TO THE R2c ENTRY ABOVE.** R2c recorded that the trade-in fix had made
ports unreachable — "no seed qualifies at 150 OR 300 days". **That was a measurement
error, not a regression.** The probe used the wrong action shape (`buy-stake` for
`buy`) and REPLACED the policy's actions instead of appending to them, so it never
bought anything. Re-run faithfully, and *after* the re-pricing: the veteran qualifies
on 6 of 20 seeds at 150 days (3, 8, 11, 13, 15, 19) and 18 of 20 at 300; the trader on
18 of 20 at 150. Ports were always reachable. The `campaign-reach` test needed only a
seed re-pin (12 → 3), which is the third time that test has been re-pinned for a
content change and is its documented pattern.

> **STALE AS OF N2 (2026-07-29 correction, doc-audit finding).** N2's NPC field
> (`considerRefit`, `npcComponentLadder`) shifts the encounter matchmaker's
> interceptor draws for every long unguided trajectory, same mechanism as the
> T-1504a/T-1603b re-pins in `campaign-reach.test.ts`. The test itself was already
> re-pinned to seed 9 in the N2 commit, but this entry and the test's own comment
> block were not updated at the time — a doc-currency gap, not a functional break.
> **Re-swept 2026-07-29 (seeds 1..20 of the exact driver, current HEAD):** the
> veteran now qualifies on only **2 of 20** seeds at 150 days — **9, 13** — and
> **8 of 20** at 300 days — 1, 5, 6, 8, 9, 11, 13, 19. **Seed 9 is the current pin
> and the first qualifier.** The qualifying rate falling 6/20 → 2/20 at the 150-day
> horizon is a real, recorded economic consequence of N2 (the veteran now competes
> for ports against an NPC field that reinvests), not something to tune away. The
> in-file comment at `campaign-reach.test.ts` has been updated to match.

**Cost, stated at the definition site:** income is unchanged (the aggregate ceiling has
no headroom), so payback stretches from [110, 150] dusks to [154, 1044] — Denebola-5
154, Mira-9 1044, with the test pinning the window at [150, 1050]. A stake is now
a status-and-control asset rather than an investment that repays inside a career. The
"hub pays a premium" invariant was re-expressed: under a 14x price ladder against a
~4.5x income spread, payback is no longer monotone in traffic, so the pinned property
is now the plainer and now-true-by-construction one — **the dearest ports are the
busiest ones**. Protocol replay goldens moved (port prices ride the F10 port ledger in
the state summary) and were regenerated deliberately.

Also recovered: **the original port was a fuel depot** — 10cr/unit, 20,000-unit
inventory the owner stocks, plus an interest-bearing savings account. Income was
TRAFFIC-driven. Ours pays a flat `baseDuskIncome` whether or not anyone visits.

### N7-FP — The rules fingerprint hashes code, not bytes (SHIPPED 2026-07-29)

**This is not a graded N-series step** — no hypothesis, no sweep, no verdict, no re-pin. It is
a defect and its fix, recorded beside N7-RIG because both change *the instrument that decides
whether a fixture still describes HEAD*. `rules-fingerprint.ts` used to hash raw file text, so
editing a COMMENT in any rule source moved `rulesFingerprint` and declared every balance
fixture stale — answering *"this is a different game"* when the truth was *"same game, better
sentence"*, and taxing exactly the definition-site commentary BALANCE-POLICY Part B rule 3
requires. **The fix (option C of three considered):** comments are now stripped before hashing
**using the TypeScript parser rather than a regex** (`//` and `/* */` occur inside string
literals here, so text-stripping would corrupt real code), and the re-print also normalises
quote style, so a Prettier pass cannot move a rules fingerprint either.

**Still binds:**

- **The raw-byte hash is NOT deleted, it is demoted.** It survives as `docsFingerprint`,
  recorded in fixture provenance and reported when it moves, but **never a
  `FreshnessProblem`** — a commentary change is worth dating, not worth failing.
  `fixtureFreshness` never reads it; its only reader, `fixtureDocsDrift`, returns
  `string | null`.
- **ACCEPTED COST: treat a `typescript` MAJOR bump as a re-stamp event.** The printer's output
  can shift across TypeScript major versions, moving every fingerprint at once on a dependency
  bump — loud, one-time, obviously attributable, remedied by the same re-stamp. This trades a
  rare loud false positive for a frequent quiet one.
- **What holds it honest, and only the pair is meaningful.** `balance-rig.test.ts` pins BOTH
  directions against a synthetic tree (a comment edit does NOT move `rulesFingerprint`; a
  `140000 -> 130000` edit in the same file DOES), plus a guard that a string literal containing
  comment markers is still hashed as code, and two tests that docs drift stays informational.
  Comment-insensitivity alone is satisfied by a hash that ignores everything.
- **Changing the hash ALGORITHM is not a re-measure.** Both fingerprints moved, so the fixture
  was re-extracted from the unchanged baseline of record — no rule changed, no new capstone
  committed. Stated because *"re-stamped without re-measuring"* is exactly the move
  `docs/VERSIONING.md` forbids doing silently.
- **OI-4 — how to quote a battery total in this document.** This entry originally read "1,233
  passing", N2's figure copied forward; `b7b52116`'s own commit message says **1,239** and the
  audit re-measured 1,239 at that HEAD. Root `npm test` is
  `npm run test --workspaces --if-present`, and **exactly four workspaces have a `test`
  script** — desktop 102, engine 725, sim 277, ui 135 at `b7b52116`. `packages/content` has no
  test script at all (only `build`), so a "content 102" arm in any note is `packages/desktop`
  mislabelled. *Post-remediation the battery stands at **1,262 passing / 0 failing** — sim
  **300**; the +23 is the OI-6 / OI-6b / OI-7 rig tests recorded in N7-RIG below.*

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N7-RIG — Two blind spots in the fingerprint, closed by audit (REMEDIATION · 2026-07-29)

**This is not a graded N-series step** — no hypothesis, no sweep, no verdict, no re-pin. It is
remediation of three items (**OI-6**, **OI-6b**, **OI-7**) raised by the 2026-07-29 N-series
doc-vs-code audit: five independent verification passes over every step marked SHIPPED, run
against HEAD `5e4b9f0c` on a clean tree, which raised **13 items (OI-1 … OI-12 plus OI-6b),
all closed the same day**. The audit's own working file was never committed: **this document
is the whole record**, and every one of the 13 is traceable by grepping its OI-number here —
`OI-1` and `OI-5` under N1/N2, `OI-2` under N6 and N3, `OI-3` under N7 and standing amendment
3, `OI-4` under N7-FP, `OI-6`/`OI-6b`/`OI-7` here, `OI-8` under N3, `OI-9` under N2 and THE
PARITY LEDGER, `OI-10` in the track preamble, `OI-11` under N6, `OI-12` under N8. Where an
item stayed open by decision rather than being fixed, it is filed under the step that owns it
rather than in a list of its own. It is recorded here, beside N7-FP, because both are changes
to *the instrument that decides whether a fixture still describes HEAD*. **Nothing was
re-stamped and nothing was owed** — rules **`91cfa4adc626ba54`** (56 files) and instrument
**`79adfd2417aa9fcd`** (4 files) both unmoved and still matching
`docs/balance/smoke/tiers.json`; running the new module against a pristine `git archive HEAD`
tree reproduced the stamped `docsFingerprint` `e003c81c03bcd116` exactly, so the working-tree
drift was 100% attributable to OI-1's comment rewrite in `npc.ts` (recorded in N1). Battery
**1,239 -> 1,262 passing / 0 failing**; rig tests **29 -> 52**.

**Still binds:**

- **OI-6 — every directory under a hashed root is a decision on record.** `listTsFiles` read
  only the declared directories, so `packages/engine/src/rules/` would have been invisible to
  `computeRulesFingerprint` **and** to the three enumeration tests that exist to make the
  classification total. The guard **fails rather than auto-recursing**, deliberately:
  auto-recursion would let a whole subtree join the fingerprint with nobody having decided
  that it should. In `packages/sim/src/balance/rules-fingerprint.ts`: `:207`
  `HASHED_ROOT_IGNORED_DIRECTORIES` (`__tests__`, `node_modules`, `dist`), each carrying its
  stated reason; `:248` `assertNoUndeclaredSubdirectory()`, whose message names the offending
  directory and both remedies; `:352` `listTsFiles()`; `:523` `collect()` and `:625`
  `allSourceKeys()` both take the declared-subdirectory set through, **so the hash and the
  enumeration tests walk the same guarded tree**. `listTsFiles` is the module's only
  `readdirSync`. It lives in the PRODUCTION MODULE, not the test, and that is load-bearing:
  `checkpoints.ts` and `smoke-extract.ts` stamp fixtures from the command line, and a
  vitest-only guard cannot reach a CLI stamp. 8 tests, `balance-rig.test.ts:537`.
- **SHARP BUT INTENTIONAL — an empty, `.d.ts`-only or asset-only directory all THROW, and they
  hard-fail `smoke-extract` at the CLI, not just a test.** So adding e.g.
  `packages/content/src/data/*.json` will stop a fixture extraction dead until someone declares
  the directory. That is conservative-safe and consistent with the module's doctrine, but it is
  a real cost, and the remedy is one line in `HASHED_ROOT_IGNORED_DIRECTORIES` or in the
  declared set.
- **OI-6b — the four symlink rules, settled.** `readdirSync(withFileTypes)` types a symlink by
  ITSELF, not its target, so a symlinked directory slipped both the new guard and
  `listTsFiles`. `listTsFiles` now classifies every entry ONCE via `statSync` — which follows
  the link where `lstatSync` would not, and that is the entire reason for choosing it
  (`classifyEntries()` / `ClassifiedEntry`, `rules-fingerprint.ts:276-350`). (1) A **symlinked
  directory** trips the guard with the identical message and escapes it via
  `HASHED_ROOT_IGNORED_DIRECTORIES` exactly as a real one does. (2) A **symlinked `.ts` file**
  is HASHED like any other rule source — `readFileSync` follows the link, so it is real rule
  code deciding real outcomes. (3) **The repo-relative path IN THIS TREE enters the manifest,
  not the target's** — a fingerprint describes this tree. (4) A **dangling or
  non-regular-file** link fails loudly with a named `UNRESOLVABLE SYMLINK` message rather than
  letting a bare `ENOENT` escape from inside a fixture stamp. Cost on a healthy tree is zero
  and is pinned by a test. 9 tests, `balance-rig.test.ts:634`.
- **OI-7 — a file TypeScript cannot parse used to hash silently.** `ts.createSourceFile` does
  not throw on bad syntax: it RECOVERS, records the problem in the `@internal`
  `parseDiagnostics`, and the printer prints the recovered tree (`export const A = (` prints as
  `export const A = ();`). Two different broken states can recover to the same tree — **a
  fingerprint collision between rulesets that are not the same ruleset.** `assertParseClean`
  (`rules-fingerprint.ts:485`) now fails with the file, the line:column and the parser's own
  message before anything is hashed; `hashSemantic` (`:436`) calls it at `:444`, ahead of
  `printFile` at `:445`. It is an assertion rather than a documented mitigation for the same
  reason as OI-6: `tsc -b` is external and runs in the battery, not before `smoke-extract.ts`
  stamps a fixture. **The assertion's own failure mode is covered: if `parseDiagnostics` ever
  stops being readable (a TypeScript upgrade renaming that `@internal` field) it throws rather
  than silently stopping checking.** 6 tests, `balance-rig.test.ts:761`.
- **The hashed corpus, pinned as a test rather than remembered.** All **60** hashed files —
  **56** rule plus **4** instrument, the instrument set being exactly `sim/index.ts`,
  `balance/aggregate.ts`, `balance/smoke.ts`, `balance/synthesize.ts` — parse with **zero**
  diagnostics under the exact `ScriptTarget.Latest` / `ScriptKind.TS` pair the hash uses.
- **ONE HOLE OF THE SAME CLASS IS STILL OPEN — recorded, not closed.** The guard catches a new
  *subdirectory* under a hashed root. A whole new hashed **root** — a new package, say
  `packages/economy/src` — is caught by nothing: it would simply never be walked, and every
  enumeration test would pass while describing a game that had grown a limb. Closing it needs
  a different mechanism (the workspace list is the thing that would have to be
  totality-checked, not a directory listing). **It belongs to whichever step first adds a
  package** — that step must either declare the new root here or record why it holds no rule
  code.

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

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

> **RESOLVED WITHOUT ITS LEVER (2026-07-29) — see the R2c-follow-up entry above.**
> **The hypothesis is DISPROVED, and that is the finding.** The 0% clear rate was
> never a funding-rate problem, so neither knob in "Change (lever)" needed to move:
> the explorer was already sitting on a median **39,866 credits on day 30** against
> the 25,000 it owed. It could afford the marker on essentially every seed and
> simply never paid it, because `explorerPolicy` had no `planDebtPayment` call at
> all. "Supporting data" above had the shape of it — *"it earns fine over 120 days,
> it just can't front-load 25,000cr by day 30"* — and drew the wrong conclusion
> from it. It could front-load it. Nothing ever asked it to.
>
> **Acceptance, measured at 1,000 seeds x 120 days:**
> - *"clears ≥ ~0.4"* — **0.777.** ✅
> - *"clear-day median inside or near [22, 30]"* — **23.** ✅
> - *"trader/gambler behavior unchanged"* — **byte-identical**, along with fighter,
>   veteran, smuggler, greedy and trader-degraded. Only the explorer row moves. ✅
> - *"explorer final credits don't balloon past the fighter"* — **still open, and NOT
>   closed by this work.** Explorer 57,327 vs fighter 2,825. It improved (79,168 ->
>   57,327, -27.6%) but the gap is 20x either way, and it is a *fighter-side* fact:
>   2,825 is the fighter's own operating reserve, the "combat has no income" finding
>   R2c recorded under its own claim 2. Read this criterion as belonging to the
>   fighter's economy, not the explorer's funding rate.
>
> **What this leaves open:** the PRD §7.2 Day-19 vignette now succeeds ~78% of the
> time instead of 0%, so the demo-conversion concern the personas raised is largely
> answered. Whether explore EV itself should still rise is a *separate* design
> question about whether the exploration fantasy pays — it is no longer load-bearing
> for Tour One, and should not be justified by the clear rate any more.

---

## THE NPC PARITY TRACK (N-series)

**Why this track exists, and why it interrupted the R-series.** The balance work kept
producing findings that were really one finding: the 30 NPCs are not playing the game.
They are an economic texture generator wearing a captain's name. Owner's framing, and
it is the right one — *"an NPC needs to trade, so they need to upgrade their ship. They
need to fly, so they need to interact with pirates. That means they pay bribes, with
either credits or cargo, or fight, or flee. They literally MUST act like a player."*

**STATUS BOARD** — updated as each step lands; the per-step `**Result:**` blocks below are
the detail. Run order is N0 → N1 → **N7** → N2 → N6 → N3 → **N10 → N11 → N12 → N13** → N4 →
N5 → N8 (see "Sequencing at a glance" for why N7 moved; N10–N13 added by owner ruling
2026-07-29 — see THE PARITY LEDGER below).

| step | status | outcome |
| --- | --- | --- |
| N0 — copy-on-write discipline | **SHIPPED** | clone flat in NPC richness, not linear; killed the quadratic |
| N1 — NPCs own a real ship | **SHIPPED** `b438096b` | change accepted, **hypothesis disproved** — capstone byte-identical; found the N2 blocker + the fuel exemption |
| N7 — capstone diff + smoke rig | **SHIPPED** | **accepted** — 1.5 s smoke vs 2 min capstone; staleness fails loudly; found N9 |
| N2 — NPCs upgrade their ships | **SHIPPED** | **ACCEPTED** — spread max/median 13.4→155, fits 5→144, Honor List 2/8→8/8 contested; found R10 |
| N6 — Honor List, 31-way board | **SHIPPED** | **accepted** — actor-shaped board; found 6 of 8 titles uncontestable by construction |
| N3 — NPCs meet pirates | TODO | permanent death SETTLED; **the 11 mechanically-referenced captains are EXEMPT**, the other 19 mortal |
| N4 — NPC archetypes | TODO | — |
| N5 — NPC proficiency spread | TODO | reuses R1's `PilotDegradationProfile`; **GATED BY N13** — its die-allocation lever needs a decision surface to act on |
| **N10 — NPCs work the contract board** | **TODO · MUST-HAVE** | owner ruling 2026-07-29 — NPCs interact with trade contracts as players do; the co-location gate and 1-claim/dusk cap get measured, not assumed |
| **N11 — NPCs earn deeds and Renown** | **TODO · MUST-HAVE** | removes the rank −1 dead end; the yard's Renown gate becomes reachable with no NPC branch |
| **N12 — NPCs buy ports** | **TODO · MUST-HAVE** | lands BEFORE N8; pulls N8's aggregate-sees-assets task forward as its own first task |
| **N13 — NPC decision surface (dawn-hand parity)** | **TODO · MUST-HAVE** | literal reduced hand vs algorithmic equivalent — owner accepts algorithmic fast-forward; gates N5 |
| **N9 — the instrument's three unplayed actions** | **SHIPPED** | **hypothesis REJECTED** — verbs cost 38% of fleet cash, not gain; found the aggregate cannot see an asset |
| N8 — re-pin against a living field | TODO | **must first teach the aggregate to see ports**; re-pin against the post-N9 instrument; **follows N10–N12** (owner ruling 2026-07-29) |

**WHAT AN NPC ACTUALLY IS TODAY (measured 2026-07-28, `packages/engine/src/npc.ts`):**

> **PARTLY SUPERSEDED (2026-07-29 audit, item OI-10) — kept as the track's baseline
> description.**
> N1 gave every captain a real ship and N2 a real upgrade decision, so the "no ship, no
> components, phantom trading" bullets below describe the field as the track FOUND it,
> not HEAD. Still true at HEAD: no encounters (N3), no deeds or rank (N11), no board
> claims away from the player (N10), no ports (N12), and one coarse d20 action per day
> (N13).

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

### THE PARITY LEDGER — which player verbs the cast must play (owner ruling 2026-07-29)

*Recorded from the owner directly, after the 2026-07-29 doc-vs-code audit of the shipped
N steps. This ruling adds four MUST-HAVE steps (N10–N13) and turns "all or most of a full
player's actions" from a preamble sentence into a checkable ledger.*

**The ruling.** The 30 NPCs must perform all or most of the actions of a full player, to
simulate a multiplayer field. Specifically MUST-HAVE: NPCs **interact with trade
contracts** (N10), **gain Renown** (N11), and **buy ports** (N12) — the owner had assumed
ports were already NPC-purchasable; they never were. *"If these actions can be
fast-forwarded algorithmically that is fine, but they must happen"* — the coarse
one-action day may stand in for hour-by-hour play, but the ACTION itself must occur, under
the same rules and the same prices, priced through the engine's own functions and never
through a private parallel model (the standing constraint above is unchanged by this
ruling; it is what makes the fast-forward honest).

**The ledger** — the player's eleven verbs, audited against the cast at HEAD (2026-07-29):

| player verb | NPC today | owed by |
| --- | --- | --- |
| Trade | coarse haul; claims the player's board only when co-located, 1 claim/dusk fleet cap | **N10** |
| Travel | real fuel, real routes, no encounters yet | N3 |
| Combat | abstract GUNS check vs no one, flat bounty | N3 |
| Shipyard | full price/gate parity via `ShipyardActor` — **but the refit spends no die** where a player burns 1 of 5 even on a refusal (watch item **OI-9**, argued under N2's Result) | shipped (N2) · OI-9 open |
| Explore | never | **UNRULED — owner decides by N8** |
| VisitHangout | Socialize stand-in; no borrow/repay | **UNRULED — owner decides by N8** |
| Crew | never (meaningless without a hand) | N13 decides |
| Port | never — the player is the only possible port owner | **N12** |
| Reroll | n/a without a hand | N13 decides |
| Storylet | authored player-facing content | **UNRULED — owner decides by N8** |
| Wait | Idle | shipped |

Renown is the verb-less twelfth row: every rank gate applies to NPCs (`actorRankIndex`
returns −1 without a registry) but no deed can ever accrue — a no-recourse lockout, which
consequence 2 above already defines as an exemption. **N11** removes it.

The three UNRULED rows are deliberately not defaulted: "most" is only honest if every
exclusion is a recorded decision rather than a silent gap. Rule on each (implement,
fast-forward, or exclude with a reason) before N8 pins the living-field baseline.

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

### N1 — NPCs own a real ship (SHIPPED 2026-07-28 · `b438096b`)

**Result (2026-07-28): CHANGE ACCEPTED — HYPOTHESIS DISPROVED** (the wording standing
amendment 2 counts in its ratio). `NpcState.ship: ShipState` shipped and `NpcState.fuel` was
**removed** rather than kept beside it — two fuel numbers on one captain would have been two
sources of truth — under save schema **9 -> 10** via `MIGRATIONS[9]`, the first registry entry
that MOVES a field rather than adding one. The capstone came back **byte-identical to
`baseline-r2c-final.json` apart from `label`**, which was arithmetic rather than a null
result: a ship seeded from profile tier and never mutated *is* the phantom wearing a struct,
so the step's *"NPC wealth spread widens"* clause was mis-assigned and belongs to N2.

**Still binds:**

- **SUPERSEDED HULL FORMULA — do not re-derive it.** N1 shipped
  `hull.strength = 2 + 2·tier`, calibrated against the phantom's *unbounded* tank so the
  clamp could not bind. **N2's second task deliberately replaced it** — `npcHullStrength` is
  now a search for the smallest hull strength whose `maxCargoPodsForShip` covers the tier's
  pod count, removing the fuel-tank exemption. See N2. *A reader grepping current `npc.ts`
  for `2 + 2 * tier` will not find it.*
- **OI-1 — the clone measurement, one number in three places.** Re-measured 2026-07-29 over
  10 seeds × 120 days of the ambient NPC loop, three alternated runs per side, node v24.13.1:
  **0.355 ms/game-day for the JSON round trip against 0.399 for `structuredClone` — ~12%
  more**, non-overlapping spreads; an independent verifier reproduced the direction with
  board generation hoisted out of the timed region (**0.307 vs 0.358, +16.3%**) and on the
  clone alone (**3.47 µs vs 5.02 µs, +45%**), identical simulation checksums both ways. **Read
  ~12% as a FLOOR, not the effect size.** The clone stays as `JSON.parse(JSON.stringify(npc))`.
  The false comment at `packages/engine/src/npc.ts:1031-1039` and the duplicate figures at
  `packages/engine/src/__tests__/clone.test.ts:363-367` were rewritten to agree — one
  measurement, three places, no third copy left to drift.
- **OI-1 precision corrections, both easy to "fix" back into being wrong.** The roster is
  **30 captains, not 31** (`createInitialState(seed).npcs.length === 30`); **31 is the BOARD
  size** (the player plus the 30), so **N6's heading is correct and is not to be "fixed"**.
  And where the code says N1 grew the NPC record "~10x", that is an **object count, not a
  size**: 229 -> 745 bytes, **3.3× in bytes**, with exactly eight nested component objects
  added (`types.ts:1139-1146`).
- **Restated Proves for N1**, since the shipped one contradicted itself: *no behaviour moves;
  NPC capability becomes mutable state the captain owns instead of a constant recomputed from
  their profile.*
- **`MIGRATIONS[9]` is the precedent N7 leans on** to keep `save.ts`/`schema.ts` out of
  `rulesFingerprint`: it *calls* `npcShipForTier` rather than restating it, so the rule itself
  lives in a hashed file. Anything that inlines a rule into a migration breaks that.
  **Idempotent, never throws**, and it shares ONE seeding function with `createInitialState`
  and `deserializeState`, so a migrated roster cannot drift from a freshly created one — the
  three properties the next migration to touch this registry is expected to match.
- **The guard was blind to nested writes and N1 closed it.** `clone.test.ts`'s scan matched
  only `handle.field = …`, so `rescuer.ship.fuel -= amount` — the exact write this step
  introduced — was structurally invisible. It now matches an assignment anywhere down a
  member path rooted at an NPC handle while still permitting comparisons.
- **Costs, measured, so a later step does not re-litigate them.** Save roster 4,129 -> 19,569
  bytes (+519/ship × 30): +4.2% on a real 30-day save, +0.14% on a 1,000-day one, load time
  unchanged. Per-day +8% on a 1,000-day career (1.40 -> 1.51 ms), ~0.1 ms of the ~39 ms of
  headroom N0 bought.
- **Baseline of record UNCHANGED (`baseline-r2c-final.json`)** — per R1's precedent a
  disproved hypothesis re-pins nothing. `baseline-n1.json` is committed as this step's
  capstone provenance only; that it diffs to nothing is the finding.
- **What N1 found and handed on:** the shipyard API is player-shaped and blocks N2, and NPCs
  fly on ~4× a player's fuel. Both are written into **N2's entry**, per standing amendment 4,
  and the audit's OI-5 precision on the blocker is recorded there too.

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N2 — NPCs upgrade their ships (SHIPPED 2026-07-29)

**Result (2026-07-29): ACCEPTED** — all three Proves limbs hold, neither Disproves limb fires.
The step's first two tasks landed as stated: the `ShipyardActor { ship, credits, registry? }`
refactor of four player-shaped shipyard functions, and the hull/component re-seed that
**removed N1's fuel-tank exemption** — N1 had seeded `hull.strength = 2 + 2·tier` to clear the
phantom's unbounded tank, **leaving NPCs on ~4× a player's fuel for comparable capacity** (see
the standing constraint above), and this step re-seeded the hull to what a player's ship of
that capability would be. On top of them sits `considerRefit`, an upgrade decision priced through
the engine's own `quoteShipyard` with no parallel cost model. Day-120 NPC wealth spread
**max/median 13.4 -> 155**, **distinct fits 5 -> 144**, richest captains median 282,247cr
against 132cr in the bottom quartile — **and the poorest still exist** (p10 = 127, min hull
strength still 1); the Honor List went **2 of 8 contested to 8 of 8**, which was N6's hand-off
criterion. Arm A (actor param alone) diffed against `baseline-n9-shipped.json` as *"NOTHING
MOVED"*, so the player did not move across the refactor. The step also found **R10**.

**Still binds:**

- **The refactor is structural, not an adapter, and that is load-bearing.** `PlayerState` and
  `NpcState` both satisfy `ShipyardActor` as-is, so there is no wrapper on either side —
  `applyShipyardMutation` *debits* `actor.credits`, and a wrapper would have banked the debit
  on a copy. **`quoteShipyard`'s throwaway is now one ship (`structuredClone`) instead of a
  whole `GameState` (`cloneState`), which is what makes quoting 30 captains a day
  affordable** — tidying it back onto `cloneState` re-introduces the per-day cost N0 exists to
  have killed, and N11's richer refit ladder, N12's per-NPC port pricing and N13's dawn hand
  are all measured inside the envelope it bought.

- **WATCH ITEM OI-9 — the NPC refit pays no die.** `considerRefit` applies
  `applyShipyardMutation` directly; `resolveShipyard` is never called, and the `spendDie: 0`
  sitting beside it is a placeholder, not a cost. A player buying at the yard burns 1 of
  their 5 dice **even when the purchase is refused.** Everything else is at parity — same
  prices, same gates, the engine's own functions on both sides, no location rule on either —
  and the asymmetry is argued at its definition site (`npc.ts:648-673`: one coarse action
  stands in for a whole NPC day, so charging a die would double-charge the abstraction). It
  is recorded rather than closed because that argument is genuinely reasonable **and**
  because the caveat below was measured against a field that gets one FREE purchase every
  single day. *Trigger: if N3+ sweeps show the field out-fitting the player, the first knob
  is making the refit displace the day's verb some fraction of the time — not re-pricing the
  ladder.* Carried as a verb-parity question in THE PARITY LEDGER.
- **THE CAVEAT, and it should govern N3's sequencing.** The *top* of the field converges on
  an identical maxed fit. Across three seeds the first captains max out **on day 69 in every
  one** — 72 rungs (8 components × 9 tiers) at one purchase per day. **Purchase opportunities
  are the binding constraint, not money**: the yard's whole ladder costs ~132,400cr against
  captains ending near 2M. (Distinct NPC holders on the Honor List peak at 12.3 on day 30 and
  fall back to 5.4 by day 120 for the same reason.) A design correction was made mid-step and
  reported rather than hidden — filling every hold before the ladder drove 20 of 31 onto an
  identical fit, and moving pods onto the hull rung barely helped (18 of 31), **which is what
  proves the root cause is the ladder's pricing, not the ordering** (see R10). No constant was
  tuned to hide it.
- **`greedy` IS NOT A VALID CONTROL FOR AN N-SERIES CHANGE — carry this forward.** It moved
  in every arm. R0a introduced it as the control for *policy* changes, but it shares a galaxy
  with the cast and reaches it through contract competition and the shared dusk RNG stream, so
  an NPC-side change *should* move it. Written into `campaign-degraded.test.ts` so the next
  step does not misread it.
- **Save schema: no bump, decided deliberately** — recorded at `npcShipForProfile` and in
  `save.ts`'s registry header. Existing v10 rosters are **not** re-seeded, because post-N1
  `npc.ship` is owned mutable state and a migration **could not tell an issued fit from a
  bought one — it would confiscate purchases.** `MIGRATIONS[9]` picks up the new ramp
  automatically (it calls `seedNpcShip`), which is correct: a v9 roster never had ships.
- **`registry` optional is a rule, not a gap.** A captain without one ranks `-1`, strictly
  below every Renown rung, so rank-gated purchases refuse with **no NPC branch** — which is
  also the permanent lockout **N11** exists to remove.
- **OI-5 precision (2026-07-29 audit).** The first task originally named `maxCargoPodsForShip`
  as a fifth blocked function. It takes a bare `ShipState`
  (`packages/engine/src/actions/shipyard.ts:182`), never took `GameState`, and correctly never
  got an actor parameter — **four** functions gained `ShipyardActor`, not five.
- **Contract competition: no out-competition, and N10 reads this number.** 295 -> 301
  `ContractClaimed` events (**+2.0%**) over 10 seeds × 120 dusks. The mechanism is capped at
  one claim per dusk and gated on co-location, and richer NPCs actually trade *less* (the
  poverty Trade boost stops firing), so an 8× wealth increase moves it by noise.
- **Test pin taken deliberately:** `campaign.test.ts`'s NPC wealth-spread ceiling raised
  10 -> 25 against measured ratios 7.52–15.99, i.e. **pinned ~56% above the worst observed
  rather than at the last measurement.** `rulesFingerprint` `76ac9179…` -> `2273d380…`.
- **Baseline of record re-pinned to `docs/balance/baseline-n2-final.json`** at this step
  (standing amendment 1 as refined); it has since been superseded — the amendment is
  authoritative.

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N3 — NPCs meet pirates, and answer them

- **Hypothesis:** routing NPC travel through real encounter generation, with a real
  stance choice, makes the NPC field carry the same risk the player does — which is the
  precondition for their wealth spread meaning anything.
- **FIRST TASK — widen `clone.test.ts`'s copy-on-write scan before adding a new
  cross-boundary NPC writer.** Filed by the 2026-07-29 audit as **OI-8** and deliberately
  folded in here rather than fixed on its own: N3 introduces death marking, which IS a new
  cross-boundary NPC write, and the guard should be ahead of it rather than behind it.
  What the scan covers today is `day.ts`, `storylets.ts` and `actions/*.ts` — **`npc.ts`,
  `state.ts` and the whole of `packages/sim` are unscanned** — and both the handle names
  and the field names it matches are hard-coded allowlists, so a writer named `captain`, or
  a field like `name` or `profileId`, walks straight past it. This document has already
  recorded the same lesson twice: N0 asserted one cross-boundary writer and found four (a
  grep keyed on variable names), and N1 found the pattern blind to nested paths. The third
  instance is the one to fix by widening the scan's SHAPE, not by adding another name to a
  list. **Known benign escapee, named so it is not discovered as a surprise:**
  `packages/sim/src/balance/synthesize.ts:158-164` writes NPC records raw. It is safe today
  only because the state is fresh from `createInitialState`, so there is no snapshot for it
  to corrupt — but that is a property of its caller, not of the write, and it sits outside
  the door and outside the scan.
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
  - **Authored content attached to the dead. SETTLED (owner, 2026-07-28): the eleven
    mechanically-referenced captains are EXEMPT from mortality in N3. The other 19 are
    mortal.**

    *The original note here named "Penny Wise, Smuggler Ray, the Sage" and warned that
    killing the lender must not strand the loan verb. **All three parts of that were
    wrong**, and the measurement is why the ruling is narrow:*

    | claim | reality (measured 2026-07-28) |
    | --- | --- |
    | three service NPCs | **eleven** cast ids are referenced by mechanics |
    | the Sage is at risk | **the Sage is not a captain** — it lives in the nemesis-fragment decode content, not the 30-roster. It cannot die. |
    | killing the lender strands the loan verb | **it does not.** `LENDER_ID` is only a disposition/grudge key; `lending.ts` states at its definition site that the desk is available at any Hangout because "Penny Wise is the lender, not a co-located NPC". |

    **The eleven:** `npc-silk-dagger`, `npc-lucky-seven`, `npc-rattlesnake`,
    `npc-penny-wise`, `npc-doc-salvage`, `npc-wild-card`, `npc-smuggler-ray`,
    `npc-stellar-monk`, `npc-void-whisper`, `npc-the-broker`, `npc-rust-bucket`. Ten are
    referenced **only** in `storylets.ts` as `trigger: { npc: { id } }`; Penny Wise only in
    `lending.ts`.

    **The real failure mode is mid-chain death, not a missing verb.** The storylets are
    multi-step chains with scheduled follow-ups: answer Doc Salvage's ping on day 12
    (`chain.doc-salvage.ping_answered`), Doc Salvage dies on day 40, and on day 41 the
    scheduled beat fires — *"Doc Salvage answers a day later…"*. **A dead captain talks.**

    **Why exempt rather than seal the chains** (the alternative, kept visible per
    BALANCE-POLICY Part B rule 3): sealing them properly — resolving a dead captain's
    pending storylets as unreachable, reusing the existing `wireResolution` "you never
    answered" path — is the *right* long-term answer and is its own authored-content task.
    Bundling it into N3 would make one step change NPC combat **and** narrative resolution
    at once, and neither result would be attributable. **Ship mortality for the 19, measure
    the shrink rate, then decide whether the eleven join them.** Revisit with that number.
  - **A dead captain's record stays** (for the wire, the Honor List's history and any
    grudge the player still carries); it is marked dead, not deleted.

    **— and the Honor List must then SKIP it. This is a N3 deliverable, not a N6 one.**
    Read alone, the bullet above argues only that the record persists, and a reader who
    implements `dead` and stops there ships a board that ranks corpses forever. Skipping
    marked records is the **fifth 1991 behaviour N6 deliberately left as a seam** (filed by
    the 2026-07-29 audit as **OI-2**; see N6's correction block). `honorField`
    (`packages/ui/src/format.ts:2611`) applies no dead filter, says so in its own words,
    and names the exact remedy — `.filter((n) => !n.dead)`. **One clause, in a file N3
    otherwise has no reason to open**, which is precisely why it is written down here.
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
- **GATED BY N13 (2026-07-29).** "Noisy die allocation" presupposes a hand the cast does
  not hold — the very Disproves clause above was at risk of firing *by construction*.
  Grade this step against whichever decision surface N13 ships, and rewrite the lever
  list here at N13's close to name which degradation levers survive the translation.

### N10 — NPCs work the contract board (MUST-HAVE · owner ruling 2026-07-29)

*Found by the 2026-07-29 audit: the owner's parity intent assumed fuller contract
interaction than the cast has.*

- **What exists today, measured:** `executeTrade` synthesizes a private offer via
  `rollContract` for every haul EXCEPT when the NPC shares the player's system, in which
  case it may claim one visible offer off the player's live board — capped at **one claim
  per dusk across the whole fleet** and gated on co-location (`NpcDayContext.claimableBoard`,
  `day.ts`). N2 measured the consequence: an 8× wealth increase across the field moved
  `ContractClaimed` by +2.0% — noise. Competition is a texture, not a force.
- **Hypothesis:** letting captains claim from the shared per-system job pool wherever they
  fly — not only under the player's nose — makes contract competition a real economic
  force and the market feel inhabited.
- **Change (programmatic):** NPCs claim against the same job pool that generates the
  player's board. If materializing live boards for 20 systems × 30 captains breaches the
  performance envelope, the sanctioned fast-forward (per the PARITY LEDGER ruling) is a
  shared depletion pool: a synthesized claim debits the same generation pool that shapes
  the next board the player sees — the player must be able to WATCH the competition, not
  just share a galaxy with it. The 1-claim/dusk cap and the co-location gate are throttles
  from the texture era: sweep them as knobs here rather than inheriting them silently.
- **Simulate:** full sweep + `ContractClaimed` rates + board-depth percentiles at the
  player's location.
- **Proves:** claims scale with field activity; offers the player saw disappear at rates
  that track the cast; the trader's clear-day band holds or moves attributably.
- **Disproves:** boards empty and Tour One clear collapses (competition tuned too hot), or
  nothing moves at all (the cap was the binding constraint and still is — a finding about
  the cap, to take back to the owner).

### N11 — NPCs earn deeds and Renown (MUST-HAVE · owner ruling 2026-07-29)

- **The dead end, measured (2026-07-29 audit):** `ShipyardActor.registry` is optional and
  no NPC has one, so `actorRankIndex` returns −1 — strictly below every rung — forever.
  No NPC deed source exists anywhere in the engine. Every rank gate therefore applies to
  the cast as a permanent lockout with no recourse, which is precisely what standing-
  constraint consequence 2 defines as an exemption ("a number chosen so that a rule will
  NOT bite…" has a mirror: a gate the actor can never open is not the same rule the player
  plays under, because the player can EARN the key). Dormant today only because
  `considerRefit` never requests special equipment; N3's combat and the Honor List's top
  end will make it bite.
- **Hypothesis:** captains who accrue deeds from their real actions produce a field whose
  top end contests the player's endgame — rank-gated gear stops being a player monopoly.
- **Change (programmatic):** give captains a deed registry fed by the actions they already
  perform, through the same deed definitions and thresholds (`deeds.ts`) — hauls
  delivered, fights won (N3), careers survived. The fast-forward allowance applies to the
  SOURCE (the coarse verbs stand in for played days); it does not license synthetic
  backfill of unearned rank at world creation — that is the phantom pattern again, and a
  tier-5 captain seeded with a rank they never earned is exactly the "constant recomputed
  from profile" N1 existed to kill. Rank-gated purchases then flow through the EXISTING
  gate with no NPC branch — `considerRefit`'s ladder learns about special equipment and
  nothing else changes.
- **Simulate:** full sweep + rank distribution at day 30/60/120 + special-equipment
  purchase counts.
- **Proves:** by day 120 some captains hold real ranks and buy through the Renown gate;
  the Honor List's top end includes rank-gated fits; the player's progression spine is
  contested, not copied.
- **Disproves:** renown inflation (the median captain outranks a competent player — deed
  pacing is wrong for a 30-seat field), or zero accrual (the coarse turn cannot reach the
  thresholds — a finding about deed pacing, not a reason to seed ranks).

### N12 — NPCs buy ports (MUST-HAVE · owner ruling 2026-07-29 · LANDS BEFORE N8)

- **Why, and why the owner flagged it:** N9 measured port stakes as the game's biggest
  asset lever — the port arm alone converted 22% of fleet cash into perpetual dusk income
  — and the player is structurally the only possible owner (`resolvePortPurchase` exists
  only behind the player's `Port` action). The owner had assumed the cast could already
  buy ports. Ports are finite and per-system: they are the single best multiplayer-
  scarcity surface the game owns, and today the player bids against nobody.
- **FIRST TASK — pull N8's asset-visibility task forward to here.** `sampleMilestone`
  records `crew` but not `ports`; the aggregate cannot see an asset for the player, let
  alone for a captain. If the cast starts buying ports before the instrument can count
  them, this step's own sweep cannot see its own effect — the R0a/R2a class of mistake,
  one more time. Milestones learn `ports` (player AND per-NPC) as the opening move, and
  N8 inherits the net-worth question with the plumbing already laid.
- **Change (programmatic):** the NPC turn may buy a stake through the same pricing and
  the same rules — `isPurchasablePort`, the standing-in-the-system co-location rule the
  player obeys, one stake per port, first come first served. `NPC_YARD_RESERVE` (the
  cast's existing discretionary-money line) throttles it the same way it throttles the
  yard; no new pacing constant unless the sweep demands one.
- **Simulate:** full sweep + port-ownership counts by day + who owns what at day 120.
- **Proves:** some ports end the career NPC-owned; the player faces real scarcity (the
  port they wanted can be gone); NPC wealth spread becomes partly asset-shaped rather
  than purely cash-shaped.
- **Disproves:** a day-N land grab locks the player out of every port before Tour One
  resolves (pacing wrong), or no captain ever crosses the price line and ports stay a
  player monopoly de facto (the reserve line is mis-set for six-figure assets).

### N13 — The NPC decision surface: dawn-hand parity (MUST-HAVE · owner ruling 2026-07-29 · GATES N5)

- **The gap, in this track's own words:** the preamble says *"the NPC field does not face
  the game's central decision"* — and no step before this one addressed it. N5's premise
  (R1's `PilotDegradationProfile`, whose signature lever is noisy die ALLOCATION) silently
  presupposed a hand the cast does not hold.
- **Owner ruling (2026-07-29):** the decision must be represented; an algorithmic
  fast-forward is acceptable. The choice between the two designs below is the owner's,
  made at step start and recorded here — not drifted into.
  - **(a) A literal reduced hand** — 2–3 dice per captain-day, allocated across the day's
    verb, the refit, and overhead. *Pro:* the same rules literally; N5/R1's levers apply
    verbatim; `Crew` and `Reroll` become real NPC verbs (fold crew hiring in here, which
    also resolves the ledger's two "N13 decides" rows). *Con:* real per-day cost against
    the ~40 ms envelope (measure before committing); a genuinely new balance surface.
  - **(b) An algorithmic equivalent** — keep the one-verb day; derive the day's quality
    from a virtual hand drawn under the same RNG discipline, with proficiency (N5)
    expressed as allocation noise on it. *Pro:* envelope-cheap; N5 gets its medium
    anyway. *Con:* it is a MODEL of the decision, not the decision — it must be flagged
    at its definition site as the one sanctioned abstraction in the parity design, and
    `Crew`/`Reroll` then stay player-only, which the PARITY LEDGER must record as a ruled
    exclusion rather than a gap.
- **Simulate:** full sweep + per-captain outcome variance decomposition (verb-weight luck
  vs skill).
- **Proves:** NPC day outcomes gain a skill-sensitive spread that N5 can then widen;
  per-captain variance stops being pure verb-weight luck.
- **Disproves:** outcomes statistically indistinguishable from the pre-N13 turn — the
  added surface carried no decision, and N5 should not be graded on top of it.

### N6 — The Honor List becomes a real 31-way board (SHIPPED 2026-07-28)

**Result (2026-07-28): ACCEPTED** — and it measured the field's flatness as a number, which was
the most useful thing it produced. The board is **actor-shaped, not player-shaped**
(`HonorCaptain`, `honorField(game)` building `[player, ...npcs]`, a `rankTitle` that never
touches `game.player.*`), so one scoring path applies the engine's own `effectiveScore` whoever
the captain is and **there is no NPC branch to drift**; no `packages/engine` change was needed,
and **nothing outside `packages/ui` imports UI source**, verified, so that is the complete
affected scope — which is what warrants a scope-limited battery for the next UI change, N3's
`.filter((n) => !n.dead)` included.
Its finding — six of the eight titles uncontestable **by construction**, because
`npcShipForTier` varied only hull, drives and pods — became N2's premise and N2's acceptance
criterion, and N2 discharged it (2 of 8 -> 8 of 8 contested).

**Still binds:**

- **OI-2 — the fifth 1991 behaviour is a SEAM owned by N3, not a delivery.** Four behaviours
  were recovered from the original BASIC (`7ca606d7^:Decompile/Source-Text/SP.TOP.txt`, quoted
  at the definition site): the whole-registry walk, per-component max, co-held ties, and the
  40-character holder-line budget. The fifth — **skip-don't-delete for marked records**
  (`if (left$(na$,1)="*") … next`) — is **not implemented**: `honorField`
  (`packages/ui/src/format.ts:2620`) applies no dead filter, and `NpcState` has no `dead`
  field to read. The code says so in its own words at `format.ts:2611` — *"DEAD CAPTAINS (N3,
  not yet landed — this is the seam, not the feature)"* — and names the exact remedy,
  `.filter((n) => !n.dead)`. **Do not implement it here, and do not ask another step to
  implement it early:** the `dead` field is N3's state shape, and building it ahead of N3 is
  the ahead-of-the-step smuggling this track polices. **N3 owns it.**
- **OI-11 — KNOWN COSMETIC GAP in the holder-line budget, recorded not fixed.** The
  40-character budget counts **one** character per separator (`format.ts:2687`:
  `line += (holders.length > 0 ? 1 : 0) + captain.name.length`), exactly what the BASIC
  counted for its `"/"` join — so **the data-level 1991 parity is exact and the fidelity claim
  stands unqualified.** The UI then renders the separator as `" / "`, three characters, so the
  RENDERED line can exceed 40 visible characters. One surface, no rule depends on it. It is
  filed rather than patched because closing it means deciding whether the budget is a DATA
  rule (keep 1, the divergence moves to the renderer) or a DISPLAY rule (count 3, and 1991
  parity is what bends) — a decision, not a typo.
- **Ties are CO-HELD, not broken.** Any tiebreak available here (roster index, profile tier,
  credits) would be *this file inventing a rule about who is the better captain* — the R2c
  failure mode. Determinism comes from ordering: holders sort by name on a plain code-unit
  compare with **no locale collator**, so the board cannot depend on the machine that rendered
  it. Roster order is deliberately unused, asserted by a test that reverses `game.npcs` and
  requires a byte-identical board — which also means **N3 marking captains dead cannot
  reshuffle the display**.
- **`playerRank` is computed blind to `isPlayer`, to holder order and to the line budget**
  (`1 + captains scoring strictly higher`), so the player can never out-rank someone they
  merely tied. The player is pinned first among co-holders for honesty, not favour: on a
  31-way tie the 40-character budget prints ~3 of 31 names.
- **One documented divergence from foundation** (BALANCE-POLICY Part B rule 3): 1991 credited
  the **ship** (`nz$`); this board credits the **captain**, because Rimward's wire, dossier,
  Hangout and grudges all name the captain. Scoring, ties and budget untouched.
- **PROCESS: parallel agents need isolated worktrees.** N6 and N9 were run in parallel in one
  shared working tree, so N6's full-suite and `balance:smoke` runs were contaminated by N9's
  half-finished edits. The UI work itself was isolated and unaffected; the fix is cheap and it
  cost real confidence.
- **Out of scope, reported not fixed, and MEASURED ON THE CONTAMINATED TREE:** three shipped
  policies allegedly never buy a component upgrade in 120 days (`trader` ending at 3,000cr on
  the untouched day-1 junker, `veteran` at 1,085cr, only `smuggler` upgrading drives 10 -> 30).
  That reading is hard to reconcile with the baseline's 80,305cr median trader, which is
  itself a reason to distrust it. **Re-measure on a clean tree before acting.**

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N7 — The measurement rig: capstone sweep + staged smoke tests (SHIPPED 2026-07-28)

**Result (2026-07-28): ACCEPTED.** The loop the owner designed — capstone sweep -> differ ->
checkpoint extraction -> fast staged smoke tiers — ships as `npm run balance:diff` /
`balance:extract` / `balance:smoke` plus `--milestone-days` on the sweep, with 94 new tests
(71 smoke + 23 rig guards). **A full sweep is only warranted as a capstone after a series of
green smoke tests.** It immediately found that the instrument had never played three of the
game's eleven actions (see N9).

**Still binds:**

- **SUPERSEDED IN MECHANISM BY N7-FP (2026-07-29 · `b7b52116`), audit item OI-3.** N7 shipped
  the fingerprint as a hash over **raw file bytes**, and explicitly refused comment-stripping
  on the grounds that "a parser that mis-parses fails silently, in the one direction this
  whole design exists to prevent." That is no longer HEAD: `rulesFingerprint` is now taken
  over the TypeScript printer's re-emission with comments stripped, and the raw-byte hash
  survives demoted as `docsFingerprint`. **The refused warning was RIGHT and was honoured, not
  discarded** — the silent-mis-parse hole was real, was filed as **OI-7**, and is closed by a
  hard `parseDiagnostics` assertion. See **N7-FP** and **N7-RIG**.
- **The fixture contract.** Fixtures live in `docs/balance/smoke/` (see its README) and every
  one records `productVersion`, `saveSchemaVersion`, a `rulesFingerprint` and its sweep
  provenance. **A stale fixture fails loudly and is never silently used** — there is no
  `--force`, no env override, no auto-refresh, and a rig test asserts that checking a stale
  fixture leaves the file on disk untouched. Staleness was verified independently by moving
  the hash and watching every tier fail in `beforeAll`, so **the 64 tier assertions did not
  run at all** — nothing can report green about a game that no longer exists.
- **Two fingerprints, not one.** `rulesFingerprint` covers `packages/content/src` + the
  engine's rule modules; **`packages/sim` is deliberately OUT of it and into a separate
  `instrumentFingerprint`** — the sim is the thermometer, not the weather, so folding it in
  would assert "the ruleset changed" every time a policy was tuned. `save.ts`/`schema.ts` are
  excluded because persistence is versioned by `saveSchemaVersion` (safe only on the N1
  precedent, where `MIGRATIONS[9]` *calls* `npcShipForTier`); `types.ts` and `clone.ts` are
  IN, on the N1 and N0 precedents. **The classification is total and reviewer-checkable:**
  three tests enumerate `packages/{engine,content,sim}/src` and fail on any `.ts` that is
  neither hashed nor named in the exclusion map with a reason, **so a new engine module cannot
  land unclassified.** *Read that totality claim alongside N7-RIG: it was true for FILES
  inside declared directories and silently untrue for DIRECTORIES until OI-6 landed, and it is
  still untrue for a whole new hashed ROOT.*
- **THE HONEST CAVEAT, enforced structurally rather than documented.** You cannot start a
  career at day 21 without simulating days 1–20, so mid-game tiers use SYNTHESIZED states, and
  **a synthesized run must never be used to grade balance.** `runCampaign`'s only door to a
  mid-game start stamps `syntheticStart: true`, `summarizeReport` carries the stamp to the
  `SeedRow`, and `aggregateRows` **throws** on any synthetic row, naming seed and policy.
  Since a `BaselineAggregate` is the artefact every balance number in this document comes
  from, a synthesized run cannot become a balance number by any route. Filtering was
  considered and rejected: a silent drop turns *"you measured something you may not measure"*
  into *"your sample was smaller than you thought"*. **Smoke tests catch regressions; the
  capstone sweep remains the only authority on numbers.**
- **What the smoke suite MISSES, stated because a breakage detector that oversells its
  coverage is the failure mode here.** *Ship loss and succession: zero coverage* — at 0.57
  deaths/1,000 days, 672 sim-days expects 0.38 deaths, so no seconds-scale tier can cover the
  death path. *A synthesized captain has an empty deed registry and LIEUTENANT rank*, so
  deed-gated storylets, rank-driven `player.tier` and the progression spine are untested in
  the three mid-game tiers (fabricating deeds would be authoring content inside a fixture).
  *The spread is rank-coupled marginals, not joint samples*, so the `max` slot holds 83,701
  credits **and** 25,000 debt. *The recorded-outcome half only catches drift while the rules
  hold still* — which is why the **invariants** are a separate half, including a per-tier "not
  measuring a stalled field" check so the goldens cannot quietly become tautologies.
- **The `days-29-31` tier is declared per tier, not inferred from the day window.** `day.ts`
  forks the career at `day === player.debtDueDay` (30) into cleared/unpaid, and the unpaid
  branch sets `guild.debt-flagged`, which re-prices every board and encounter thereafter:
  **56/56 runs resolve Tour One on that tier, 0/56 on each of the other three.** If
  `debtDueDay` moves, the assertion fails and is re-decided instead of silently re-deriving.
- **Every capstone harvests real milestone samples to replace the estimated spreads**, so the
  fixtures get truer with each capstone. The shipped fixture is `spreadSource: "harvested"`;
  the `estimatedSpread` fallback was verified and correctly reports `spreadSource:
  "estimated"` with a re-run note. `--milestone-days` is proven non-invasive: 0 numeric
  changes, 0 value changes, 3,699 shape changes — all of them added `milestones[…]` paths.
- **Reading a differ report: `label` is the sole deliberate ignore, and the report names what
  it ignored.** Keying `topRoutes` by route id once produced 192 phantom "shape changes" — a
  route dropping out of the top five is a value change, not a schema difference. Check the
  shape/value split before believing a moved row.
- **Baseline of record UNCHANGED at this step** (`baseline-r2c-final.json`); the harvest
  capstone was numerically identical to `baseline-n1.json` and was deliberately left
  uncommitted in `.scratch/`, because **writing a `baseline-*.json` into `docs/balance/` reads
  as a re-pin, and a re-pin is a decision, not a side effect.**

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N9 — The instrument has never played three of the eleven actions (SHIPPED 2026-07-28 · `55233e15`)

> **Found by N7, 2026-07-28. Sequenced BEFORE N8** — N-IDs are labels, not an order
> (`docs/VERSIONING.md` §4).

**Result (2026-07-28): HYPOTHESIS REJECTED — but the code SHIPPED and was retained**, which is
the case standing amendment 1's refinement was written for: it moved **7 of 8 policy rows** —
`greedy`, the untouched control, is the eighth and is byte-identical. `packages/sim` emitted
`Crew`, `Port` and `Reroll` **zero** times, so no standing policy's economy had ever included
port income, crew dice or a rerolled hand; all three now fire, priced through engine/content
functions throughout (`planReroll` on the sharpest unspent die below `expectedFreshDieFace`;
`planCaptainOverhead` arbitrating **one** die-costed purchase per day — berth -> crew -> port
— on the dullest remaining die, queued last so income actions are never displaced). The
direction was wrong: fleet final credits **50,448 -> 31,205 (−38.1%)** with Tour One
essentially frozen (≤0.3% on every clear rate) and `encountersPerRun` 24.33 -> 24.37 — **the
extra deaths are a thinner purse, not more fights**. `player.crew.length` was **0 at every
percentile** across 8,000 careers at days 21/29/41; it is now **median 2 / p75 3 at day 41** —
the post-state N13 has to grade a hand-bearing cast against.

**Still binds:**

- **Per-verb attribution, four capstones at 1,000 seeds × 120 days** — N12 reads the port
  figure: **Port only** 39,193cr (**−22.3%**, ships +0.5%), **Crew + berths only** 37,888
  (−24.9%, ships +10.9%), **+ Reroll** a further −0.2%, all three shipped 31,205 (−38.1%,
  ships +13.3%).
- **Why the three verbs are ONE change, and why they had never fired.** `rerollsRemaining` is
  seeded only from `dawnDiceModifiers`, whose only live source is the crew roster; crew is
  gated by `crewCapacity = 1 + floor(cabin.strength/10)`, so the junker berths exactly **one**
  and a full three-role roster needs cabin tier 2. **Nothing could have fired them** — the
  blind spot was structural, not an oversight in any one policy. Their named readers, for the
  steps that follow: **`Crew`** is T-1306's dice-progression source, read by `dice.ts`
  `dawnDiceModifiers`; **`Port`** is T-1307's dusk income, read by `port.ts` `portDuskIncome`.
- **Every balance number in this document was produced by that instrument — but this is not a
  blanket invalidation, and the carve-out is on record.** R2d's port re-pricing measured
  *affordability* against the real field and re-ran its reach probe with appended buy actions,
  **so it is not invalidated**. What IS scoped by the blind spot are the numbers the aggregate
  produced: the fleet's income ceiling, its dice distribution and its clear-day medians were
  all measured on a strictly narrower game than the one that ships.

- **THE FINDING THAT OUTRANKS THE VERDICT — the instrument measures CASH, not NET WORTH.**
  `finalCredits` cannot see an asset. The trader's ~13,500cr of port spend is still on its
  balance sheet yielding 65–290/dusk in perpetuity, and the aggregate scores it as a 100% loss.
  So *"the fleet got poorer"* is unambiguously true only of the **crew** arm (wages, ~15,100
  out and ~1,500 back — a genuine operating loss); the **port** arm is balance-sheet conversion
  the instrument structurally cannot read. **`sampleMilestone` records `crew` but not `ports`,
  so port ownership is invisible to every aggregate this project produces.** Same class as R0a
  and R2a. **This must be fixed before N8 re-pins** — the milestone half is now N12's first
  task, the net-worth question stays with N8.
- **The marker HOLD, not a hard block — a judgment call made, reversed, and documented at the
  site.** The overhead first shipped *without* a marker gate, on the argument that crew is a
  throughput purchase. A full capstone refuted it — trader clear 0.916 -> 0.759 and clear day
  21 -> 25, smuggler 0.535 -> 0.210 and day 30 -> 44, fleet ships 571 -> 816 — and the premise
  failed on its own terms: a trader's day is a two-run plan capped at five dice, so the sixth
  die a First Officer grants buys no extra contract. It was restored as a **hold**
  (`spendable` subtracts the outstanding marker) rather than a hard block, **because a hard
  block silences all three verbs for the explorer (clears 0.00) and veteran (0.001) *forever*,
  re-creating the very blind spot this step removes.**
- **Reading `greedy` as a control.** It is untouched here and its row is byte-identical — but
  *the differ reports `greedy` under MOVED when the arm carries `--milestone-days`*, because
  the added `milestones[…]` paths are a shape change. Strip that key and the values are equal.
  **Check the shape/value split before reading a control as broken.**
- **The reroll is arithmetically marginal, not badly played.** Played strictly +EV it can only
  fire when the *sharpest* die is already below the fresh expectation, and
  `P(max of 5d20 < 11) = 0.5⁵ ≈ 3.1%` — verified independently. A career sees ~1.2 charges
  worth ~2 pips: −0.2% credits, +1.7% ships, both inside noise. **The verb is now exercised; it
  is not a lever.** Zero crew walkouts in 280 careers.
- **Out of scope, reported not fixed.** (1) N7's fingerprint over-sensitivity cost **three
  re-runs in one step** here, which is the evidence N7-FP was granted on; closed by N7-FP.
  (2) **The extra-die crew role is near-worthless to trader-shaped policies by construction**:
  their day is a fixed two-run plan capped at five dice, so a sixth die has no queued use. If
  the First Officer is meant to be the strongest hire, something needs a use for the die.
  (3) **Ports are unreachable for two archetypes structurally** — under the marker hold the
  explorer (clears 0.00) and veteran (0.001) never accumulate surplus above debt, so any
  fleet-wide port-ownership criterion is measured on five policies, not seven.
- **Provenance pointers.** Baseline re-pinned to `docs/balance/baseline-n9-shipped.json` (the
  refinement in standing amendment 1); `campaign-degraded` fingerprints re-pinned deliberately
  with **logged entry #5** (trader `467a83d4->2e4f1623`, fighter `b6ef1dc0->620348f8`, explorer
  `90d35d3c->6f4d8c17`, smuggler `b480fc6f->49d98c00`, gambler `de62c310->29fc3a0c`), **greedy
  and veteran unchanged**. `rulesFingerprint` unchanged at `76ac9179…` — the proof no
  engine/content rule moved — while `instrumentFingerprint` moved `34453d51…->37f920ed…` and
  the smoke fixture was re-extracted. **The `balance-targets` tripwire did NOT fire:** trader
  clear day 21 -> 21 at 1,000 seeds, so it still fails its assertion and still passes as
  `it.fails`.
- **Corroborating measurement still cited elsewhere:** at day 41 across 8,000 careers
  `playerShipRating` median AND p75 are both **1** (≥75% of careers never buy a combat
  component) and `playerCargoPods` runs **min 10 / max 11** against a starting 10 — cargo pods
  are effectively never bought, which is why R10 stayed invisible for the whole project.

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N8 — Re-pin the baseline against a living field

- Everything above changes the world the player trades in — captains claiming contracts,
  buying ships, dying. **Every balance number in this document moves.** Re-pin at 1,000
  seeds (the R0b standing amendment) and re-read the R-series conclusions against it,
  especially R2.5, whose escalation ladder was designed against a field that took no risk.
- **FIRST TASK — teach the aggregate to see an asset, before re-pinning anything.** N9
  found that `sampleMilestone` records `crew` but not `ports`, so **port ownership is
  invisible to every aggregate this project produces** and `finalCredits` scores a bought
  port as a 100% loss. The policies now buy ports (N9), so re-pinning first would bake a
  blind spot on a live asset class into the yardstick every R-series conclusion is
  re-read against. Same class as R0a and R2a, and both of those had to precede the work
  they graded. A `ports: state.player.ports.length` on the milestone is the minimum;
  consider whether the fleet needs a net-worth figure alongside the cash one, since
  **"the fleet got poorer" is currently unfalsifiable for any purchase of an asset.**
  *2026-07-29: the milestone half of this task is pulled forward into N12's first task
  (the cast starts buying ports there and the sweep must see it); the net-worth question
  stays here.*
- **SECOND PRECONDITION — N10, N11 and N12 land first (owner ruling 2026-07-29, THE
  PARITY LEDGER).** A "living field" whose captains cannot work the contract board, hold
  a rank, or own a port is not the field the player actually ships against. Re-pinning
  before those verbs exist would bake three known absences into the yardstick every
  R-series conclusion is re-read against — the same class of mistake this step's first
  task exists to prevent. Rule on the ledger's three UNRULED verbs (Explore,
  VisitHangout, Storylet) before pinning, so every exclusion is a decision on record.
- **The post-N9 re-pin is DONE** — `baseline-n9-shipped.json`, taken fresh at HEAD. N8
  re-pins again on top of the living field; it no longer has to unpick N9.
  *(2026-07-29, doc audit item **OI-12**: this bullet named `baseline-n9-shipped.json` as
  the baseline OF RECORD, which was true when it was written and is now stale by two
  re-pins — N2 and then R2c-follow-up. The current baseline of record is
  `docs/balance/baseline-r2c-explorer-remit.json`, which is what **standing amendment 1**
  names and what `packages/sim/src/__tests__/balance-targets.test.ts:103` reads at runtime.
  **The amendment is authoritative; read it before diffing anything.** The N9 re-pin itself
  genuinely happened and its rule refinement is the reason amendment 1 reads the way it
  does, so it is left on the record here rather than overwritten.)*

---

## IMPORTANT

### R10 — The tier-1 hull is a 25-credit day-1 exploit (found by N2, 2026-07-29)

> **This is an R-series economy defect, not N-series work**, and it is the root cause of the
> top-of-field convergence recorded in N2's Result. Filed here so it is not carried as an
> NPC problem.

**Reproduced on a fresh `createInitialState(12345)` and verified independently from the
constants.** `maxCargoPodsForShip` computes `(cond + 1) × hullCapacity`, where
`hullCapacity = strength` until strength exceeds 10. So:

| hull | strength | cargo pods | fuel tank |
| --- | --- | --- | --- |
| junker (start) | 1 | **10** | **300** |
| tier 1 | 10 | **100** | **3,000** |
| tier 2 | 20 | 100 | 6,000 |

**One rung multiplies cargo capacity by ten, and it costs 25 credits** — `YARD_COMPONENT_
TIER_PRICES[0]` is 50, less a 25 junker trade-in. Ninety extra pods at 10cr each is another
900. **For 925 of a 1,000-credit starting purse**, the same seeded manifest board goes from
payments `1,910 / 6,280 / 2,300 / 2,080 / 6,280` to `6,300 / 41,900 / 8,600 / 5,300 /
41,900`. Note also that tier 1 and tier 2 both yield 100 pods — tier 1 is a cliff, not a
step.

**Why it stayed invisible for the entire project:** N9 measured that no shipped policy ever
buys cargo pods (`playerCargoPods` min 10 / max 11 across 8,000 careers). **N2's NPC refit
is the first actor in the codebase that reinvests profit, and it fell straight into it.**
The instrument could not find a bug in a purchase it never made — the same shape as R0a,
R2a and N9, and the fourth instance of it.

**Related, found alongside and also player-facing:**
- **`quoteShipyard`'s `after.maxFuel` is wrong for a hull purchase.** `applyShipyardMutation`
  deliberately leaves the tank to `day.ts`'s chokepoint, so the shipyard pane previews the
  fuel ceiling as **unchanged** — 300 → 300 where the real purchase yields 3,000. Pre-existing
  and untouched by N2. **A player-visible preview lie on the single most valuable purchase in
  the game.**
- **`tradeInValue`'s junker band out-prices the tier-1 list price.** Indexed by raw strength,
  it reaches 3,000 at strength 9 against a 50cr tier-1 sticker, so any component at strength
  ≥ 2 gets its first rung free. Unreachable for the player (the yard only sets multiples of
  10; the junker starts at 1), but N2's seed puts NPCs in that band, so it is live for them —
  one rung, once, per component.

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
  N0 (copy-on-write) ......................... DONE
   └─► N1 (NPCs own a real ship) ............. DONE  (change accepted, hypothesis disproved)
        ├─► N7 (capstone diff + smoke rig) ... DONE  (accepted; 1.5 s smoke, 2 min capstone)
        │    └─► N9 (the instrument's three unplayed actions) ... DONE  (rejected; found the cash-vs-net-worth gap)
        ├─► N6 (Honor List, 31-way board) ... DONE  (accepted; 6/8 titles frozen until N2)
        └─► N2 (NPCs upgrade + shipyard actor param + ramp re-seed) ... DONE  (accepted)
             └─► N3 (NPCs meet pirates + answer them)
                  └─► N10 (NPCs work the contract board) ......... MUST-HAVE (owner 2026-07-29)
                       └─► N11 (NPCs earn deeds + Renown) ........ MUST-HAVE
                            └─► N12 (NPCs buy ports; the aggregate
                                 learns to see assets FIRST) ..... MUST-HAVE, lands before N8
                                 └─► N13 (NPC decision surface:
                                      dawn-hand parity) .......... MUST-HAVE, gates N5
                                      └─► N4 (archetypes) ──► N5 (proficiency spread)
                                           └─► N8 (re-pin the baseline against a living field)
                                                ▲ N9 MUST LAND FIRST — see below
                                                ▲ N10–N12 + the ledger's UNRULED verbs
                                                  MUST BE SETTLED FIRST (owner 2026-07-29)

WHY N9 GATES N8: N8 re-pins the baseline that every R-series conclusion gets re-read
against. The instrument that would produce it has never emitted Crew, Port or Reroll
(N7's finding), so re-pinning first would bake a known blind spot into the yardstick.
Same class as R0a/R2a, and both of those had to precede the steps they graded.

WHY N7 MOVED (owner decision 2026-07-28): the doc originally ran it after N4/N5. Every
step from N2 on is graded by diffing a sweep, and at full NPC fidelity that capstone is
projected at ~80 min — unusable as an iteration loop. N7's fingerprinted smoke fixtures
turn it into a seconds-long check, so building it SECOND gives N2–N6 a real fast gate
instead of grading them on faith. N1 first regardless: N7's checkpoints need a world
with ships in it to harvest from.

THEN the R-series resumes, re-read against N8's baseline:
  R2.5 (escalation ladder + demand menu) ──► R4 (predation) ──► R5b (smuggler tariff)

WHY THE PAUSE: R2.5's ladder was designed against a field that takes no risk and never
upgrades. Landing it before N8 would tune the player's world against captains who are
not in it.
R3 (explorer)  — CLOSED 2026-07-29 by the R2c-follow-up (clear rate 0.00 -> 0.777)
R6 (instrument) — any time, goldens-identical
R5a (fighter deeds) — after R2 lands
R7 — ABSORBED into R2.5.  R8/R9 — opportunistic
```

One change per step. One sweep per change. Re-pin the baseline only on an accepted
hypothesis, and append the result under the step before moving on.

**Two standing amendments from the R1/bake-off work (2026-07-28), binding on every step below:**

1. **Grade at 1,000 seeds × 120 days, not 100 — DONE (R0b).** The 100-seed arm cannot resolve
   the clear-day target to the ±1 day the [22, 30] band is graded at, and its "0 ships / 0
   cargo" headline was a sampling artifact (19 ships and 17 routes at n=1,000). **Corollary
   for every future step: never report a rate as 0.00 off a small arm — report `< 1/n`, or
   re-run bigger.**
   > **Baseline of record is `docs/balance/baseline-r2c-explorer-remit.json`** (1,000 seeds
   > × 120 days). `baseline-n2-final`, `baseline-n9-shipped`, `baseline-r2c-final` and
   > `baseline-vet-1k*` are its predecessors.
   > **It is also read at runtime by `balance-targets.test.ts`'s band block**, so re-pinning
   > means updating that path in the same commit. **Update this pointer in the same commit that re-pins the baseline** —
   > a stale yardstick silently mis-grades every step that diffs against it.
   >
   > **RULE REFINED 2026-07-28 — re-pin on SHIPPED CODE, not on an accepted hypothesis.**
   > The old wording ("re-pin the baseline only on an accepted hypothesis") was written for
   > R1 and R2's lever, which were **measure-only or never shipped** — for those, re-pinning
   > nothing is right. **N9 is the case it did not anticipate: hypothesis REJECTED, code
   > SHIPPED and retained**, moving 7 of 8 policy rows. Under the old wording the baseline
   > stayed at `r2c-final`, which no longer described HEAD, and N2's differ would have shown
   > N9's deltas tangled with N2's own. **The test is "does the baseline describe HEAD?",
   > not "did we like the answer?"** A verdict is a judgement about a hypothesis; a baseline
   > is a description of the tree.
   >
   > *Provenance:* `baseline-n9-shipped.json` was taken fresh at HEAD and diffed against
   > N9's own shipped arm — **"NO MEASURED VALUE MOVED"**, an independent reproduction of
   > N9's figures from a clean run rather than a copied artefact.
2. **A rejected hypothesis is a result.** R1's was rejected and produced the re-scope that
   this document now runs on. Record outcomes under the step, including the ones that say
   "the premise was wrong". **Two of the four graded steps so far were disproved** (R1, R2's
   lever) and a third was accepted-with-hypothesis-disproved (N1); that ratio is the method
   working, not a problem to fix.
3. **Re-extract the smoke fixture ONCE, at the end of a step** (owner decision 2026-07-28).
   N7's `rulesFingerprint` hashes raw file bytes, so a comment or a `prettier --write`
   stales the fixture — and Part B rule 3 *requires* commenting at definition sites, so this
   fires constantly. N9 paid it **three times in one step**. The mechanism is correct and
   deliberately not being "optimised": stripping comments needs a parser, and a parser that
   mis-parses fails **silently**, in the one direction the whole design exists to prevent.
   So the fix is procedural — finish the code, *then* re-extract. A capstone is 1m46s, not
   the 80 minutes that motivated the rig, so the tax is small if it is paid once.
   *If it still hurts after N2, the option with real data behind it is hashing the
   TypeScript **emit** rather than source bytes — `tsc` re-prints from the AST, so comments
   and formatting normalise away while real code changes still move the hash, and it is the
   same compiler that builds the product rather than a bespoke parser.*
   > **THE MECHANISM ABOVE IS SUPERSEDED BY N7-FP (2026-07-29 · `b7b52116`) — and this
   > amendment predicted its own supersession.** *Flagged by the 2026-07-29 doc audit as
   > item **OI-3**; annotated rather than rewritten, because the cost it records is the
   > evidence that motivated the change.*
   >
   > **The procedural rule stands, unchanged: re-extract ONCE, at the end of a step.** What
   > no longer describes HEAD is its premise. `rulesFingerprint` does not hash raw file
   > bytes any more — the raw-byte hash was **demoted to `docsFingerprint`**, which is
   > informational only and cannot fail a test (`fixtureFreshness` never reads it; its one
   > reader, `fixtureDocsDrift`, returns `string | null` and is explicitly not a
   > `FreshnessProblem`). So a comment or a `prettier --write` no longer stales the fixture
   > at all, and the tax N9 paid three times in one step is gone. The closing paragraph
   > directly above is what shipped: *"hashing the TypeScript **emit** rather than source
   > bytes"* is precisely option C of N7-FP, using the same compiler that builds the
   > product rather than a bespoke parser.
   >
   > Its stated risk — "a parser that mis-parses fails **silently**" — was real, and N7-FP
   > did **not** discharge it: `ts.createSourceFile` recovers from broken syntax and prints
   > the recovered tree without complaint. The audit filed that as **OI-7** and it is now
   > closed by a hard `parseDiagnostics` assertion ahead of the hash. See the **N7-RIG**
   > entry (immediately after N7-FP) for OI-7 and for OI-6/OI-6b.
4. **Close the loop on the step before starting the next one** (added 2026-07-28, after
   this was caught drifting). Landing a step means all four of: the heading carries
   `(SHIPPED <date> · <sha>)`, a `**Result:**` block is appended under it, the sequencing
   diagram above reflects reality, and **anything learned that changes DIRECTION is written
   into the step it affects** — not just recorded under the step that found it. N1 found the
   shipyard API blocks N2 and that NPCs fly on ~4× a player's fuel; both belong in N2's
   entry, and are there.
