# Testing Strategy & Foundation Reference of Record

**Status:** Standing policy. Companion to `docs/BALANCE-POLICY.md` (where the archetype/sweep vocabulary and numbers come from) and `docs/NPC_REDESIGN.md` (where the cast's parity ledger — what NPCs can and can't yet do — is tracked).

This document records what our testing actually consists of today, with evidence; what we learned from building and running an external tool (UGT) against this game across two eras; and a proposed model that leans on the cast's own N-series parity work instead of depending on an external, separately-maintained harness. See the companion after-action report at `/Users/vs7/Dev/Games/_UGT Universal Game Tester/AFTER-ACTION-REPORT.md` for the cross-repo evidence this leans on.

---

## Part A — What already works, with evidence

Three layers exist today, and all three have concrete track records:

**1. Engine unit/property tests.** `packages/engine/src/__tests__/` — deterministic, function-level, the first line of defense. Cheap, fast, necessary, and — on their own — exactly the "green but hollow" failure mode this whole track started from: they pass while the actual play sequence still breaks (the F3/F5 die-spent-before-check bugs below are the textbook case — the *checks themselves* were correct in isolation, the *ordering* against die-spend wasn't).

**2. The T-1603a balance sweep (`packages/sim/src/balance/sweep.ts`).** This already does more than "balance tuning" — read closely, it is a real, running, 30-actor simulation: every sweep seed runs the full cast of NPCs (`packages/engine/src/npc.ts`, `resolveNpcDay` at line 1855) through `resolveNpcDay` every simulated day, on the *same* engine functions and constraints a player uses (owner ruling, `NPC_REDESIGN.md:189-198` — "the same functions, the same costs, the same constraints"), while a scripted `SimPolicy` (`packages/sim/src/index.ts:766-770`) occupies the single player seat. A production invocation is 1,000 seeds × up to 120 days × 8 policies, sharded 8-way (`npm run balance:sweep -w @spacerquest/sim -- --seeds 1000 --days 120 --policies trader,trader-degraded,fighter,explorer,veteran,smuggler,gambler,greedy --shard i/8`, merged and cross-checked to 8,000 rows). **This is already, today, "run the cast through hundreds of games" — it's just framed and consumed as a balance-tuning tool, not explicitly wired into the testing/regression gate.**

**3. The one completed UGT campaign against this codebase (T-1604a, `docs/playtests/T-1604a-ugt-campaign.md`).** 11,188 applied actions across 6 legs, walking to day 151 with a hand-written competence policy in the player seat, 8 invariants swept after every one of 13,025 hunter steps. It found real, structural, otherwise-invisible bugs:

| Finding | What it was | Only findable by |
|---|---|---|
| F2 | A captain at 0 credits with an undeliverable hold had no income verb; debt compounded to 38M over 385 stuck days | playing hundreds of consecutive days |
| F1 | An unfloored storylet penalty could drive credits negative | a real long play sequence hitting that storylet |
| F3 | Travel's fuel gate wasn't checked before the die was spent — burned a die per unaffordable jump for 14 straight days | a real driver replaying the actual UI/API sequence, not a unit test of the gate function alone |
| F5 | 68% of Shipyard applies typed-fail *after* the die is already spent | same as F3 — an ordering bug, invisible to isolated unit tests |
| F10 | The cheapest port stake (7,150 cr) was unreachable under a measured best-effort policy | a multi-hundred-day economic simulation, not a spreadsheet check |
| G1 | A protocol client could never open a demo career — `handleMessage` silently dropped the `edition` field | driving the real message protocol end-to-end |

Every one of these is now a fix **and**, where it generalizes, a native regression test (T-1605b's poverty-trap invariant exists specifically so this class of bug never needs re-discovering by luck). That fix-then-encode-as-a-native-test pattern is the actual payoff of the campaign, not the campaign itself as a recurring event.

## Part B — Lessons from UGT (see the companion after-action report for full evidence)

- **The methodology is what earned its keep, not the tool.** Long-horizon simulated play through a real action-legality boundary, checked against declared invariants after every step, found bugs that unit tests structurally cannot see (ordering bugs, multi-hundred-day economic dead ends). That's worth keeping permanently.
- **A separately-maintained external harness drifts out of sync silently.** SpacerQuest shipped `Reroll` and `Crew/dismiss` and the UGT-side protocol had zero coverage of either for about two weeks — nobody updated the sibling repo, nothing caught the gap. The fix is not "remember to sync harder"; it's **don't depend on a harness that isn't updated by the same people, on the same cadence, as the content it's supposed to cover.**
- **A shared external runtime accumulates its own defects, and they cost you results, not just it.** UGT's own bugs (`verify_game` silently discarding comparison evidence, an idle-action fallback shaped for a different game) meant some of our own earlier runs could have been reporting false confidence. Anything we build in-repo is at least a bug we'll notice, in our own review process, on our own schedule.
- **Every finding should convert into a native, permanent test, not a reason to re-run an external campaign.** This is already our instinct (T-1605b) — make it the explicit rule going forward.

## Part C — The cast is already most of a testing fleet, with real gaps

The N-series work (`docs/NPC_REDESIGN.md`) put ~30 NPCs on the same rules a player uses — but **parity is not complete**, and the gaps are exactly the places fleet-based testing today has zero visibility, regardless of seed count:

| Verb | NPC parity status (per `NPC_REDESIGN.md`'s Parity Ledger, as of 2026-07-30 rulings) | Testing implication |
|---|---|---|
| Trade, Travel, Shipyard, Wait, Renown | **Shipped** — same functions, costs, constraints as a player | Sweep coverage is real for these today |
| Combat | **Partial** — forced/interdiction branch shared; chosen `executeCombat` branch is still an abstract GUNS check, no interceptor/damage/ship-loss (six fighters logged 6.4 interdictions each and 0 deaths) | The sweep cannot currently exercise real chosen-combat risk/reward at all |
| Explore, VisitHangout | **Deferred**, pending the 0.5.2 rebuild | Zero fleet coverage of these systems today — bugs here need a human or a policy-driven pass, not the sweep |
| Crew, Reroll | **Undecided (N13, "dawn-hand parity")** — NPCs currently take "one coarse d20 action per day," not the five-die hand-allocation decision a player faces | The sweep's NPCs are not facing the game's central decision at all; this is the single biggest fidelity gap between "NPC" and "player" today |

**Implication:** "run the cast through hundreds of games" is already mostly true for Trade/Travel/Shipyard/economy bugs, and not yet true for Combat's chosen branch, Explore, VisitHangout, or the core dice-allocation decision. Treat sweep results as authoritative for the verbs marked Shipped above, and as silent (not "passing," *silent*) for everything else until the corresponding N-series parity work lands.

## Part D — Proposed model: two tiers, both native, no external dependency

**Tier 1 — bulk/regression, cheap, mostly already built.** Explicitly reframe the balance sweep as a testing surface, not only a tuning tool:
- Fold the 8 invariants already used in T-1604a (credits-floor, no-negative-cargo, etc. — see `docs/playtests/T-1604a-ugt-campaign.md` §4) into the sweep itself as hard pass/fail assertions, not just reported numbers. A sweep that produces a negative-credits row or a statistical anomaly (e.g. an expected ~30% event rate reading 0% across a full shard) should fail the run, the same way a broken unit test does.
- This gives near-continuous coverage of every verb marked **Shipped** in Part C's table, at effectively zero marginal cost beyond what the sweep already runs.

**Tier 2 — deep audit, occasional, targeted at the player seat.** Build a single in-repo LLM "pilot" policy that drives the player seat through the same real legal-actions/protocol seam the UGT adapter already proved out (`packages/sim/src/protocol.ts` / `protocol-stdio.ts`, `PROTOCOL.md`) — implemented natively as our own `SimPolicy`-shaped driver, not as a dependency on an external package. This is a direct, in-repo application of the UGT methodology (declare invariants, walk N days, log state deltas, never fabricate an action outside the legal set) without the drift risk described in Part B. Run this periodically as a deep audit — not continuously — the same cadence UGT's own campaigns actually ran at, but owned end-to-end in this repo.

## Part E — What this does not replace

- **Native unit/invariant tests remain mandatory** for anything a sweep or an LLM pilot finds — the fix-then-encode-as-a-test discipline (T-1605b) stays the rule, not the exception.
- **This does not close the NPC parity gaps** in Part C. Combat's chosen branch, Explore, VisitHangout, and the N13 dawn-hand decision need their own N-series work before fleet-based testing can claim coverage there; until then, those systems need either manual playtesting or a policy-driven Tier 2 pass to get any simulated coverage at all.

## Part F — Proposed follow-on tasks

Each tier is split into a **build** task and a **validate** task, so a new testing mechanism is proven to actually catch what it claims to catch — using a committed, re-runnable check, not a one-off manual confirmation — before the milestone is considered closed. This mirrors the discipline UGT's own campaigns used on themselves (e.g. T-1604a's same-seed determinism check, run twice and compared byte-for-byte, before trusting the campaign's own output).

Four tasks, ready to fold into `TASKS.md` as a new milestone once the currently in-flight orchestrator run reaches a clean state (see note at the end of this section). Written to the project's task-entry format.

```markdown
## M7 — Testing strategy: the sweep as a gate, and a native LLM pilot

### T-152 · Build: fold sweep invariants into a pass/fail gate — `status: TODO` · `coder: opus` · `after: T-130`
Take the invariant set already used in the T-1604a UGT campaign (`docs/playtests/T-1604a-ugt-campaign.md` §4 — credits floor, no-negative-cargo, and the rest of the 8) and wire them into `packages/sim/src/balance/sweep.ts` as hard assertions the sweep run itself fails on, not just numbers it reports. Add a statistical-anomaly check for any event whose expected rate is known (e.g. an encounter type expected at ~30% reading 0% across a full shard) so a probability regression fails the run instead of silently changing the reported baseline. Wire this sweep-as-gate into CI (or document why it's too slow for CI and instead into a scheduled/nightly job) so Tier-1 coverage (per Part D above) runs without a human remembering to invoke it. This task builds the mechanism only — T-153 proves it works.
**Accept:** `sweep.ts` contains a named assertion function per invariant, each grep-able by name; an expected-event-rate table with named thresholds exists for the anomaly check; a CI workflow file or documented scheduled-job config invokes the gate.

### T-153 · Validate: prove the sweep gate catches known regressions — `status: TODO` · `coder: opus` · `after: T-152`
Build one seeded-bad fixture per invariant class from T-152 (e.g. a synthetic state with negative credits, a synthetic event log reading 0% against an expected ~30% rate) plus one clean/current-state fixture, and write a committed, automated test suite that runs the gate against all of them. This suite is permanent — it runs as part of `npm test` going forward, so the gate's own correctness is continuously re-verified rather than confirmed once and trusted forever. Also confirm the CI/scheduled wiring from T-152 actually executes the gate script (a dry run or CI log), not merely references it.
**Accept:** a committed test file (e.g. `packages/sim/src/__tests__/sweep-gate.test.ts`) asserts every seeded-bad fixture fails the gate (non-zero exit / thrown assertion) and the clean fixture passes (zero exit); this test file runs under `npm test`; CI/scheduled-job evidence (log or dry run) shows the wiring from T-152 actually fires, not just exists.

### T-154 · Build: native LLM pilot policy for the player seat — `status: TODO` · `coder: opus` · `after: T-153`
Implement a `SimPolicy` (or a driver against `packages/sim/src/protocol-stdio.ts`) that has an LLM pick the player's actions each day from the real legal-actions list, in-repo — no dependency on the external UGT package. Reuse the adapter discipline from `packages/sim/PROTOCOL.md`: an unmapped/illegal action must be rejected, never fabricated. Log state deltas per action (mirroring T-1604a's JSONL shape) so a run's findings are reviewable after the fact. This task builds the driver only — T-155 proves it's trustworthy before it's relied on.
**Accept:** the driver runs against the real engine via the protocol seam and produces a reviewable action/state-delta log; illegal-action attempts are rejected and logged, never silently applied; a short README documents how to invoke a run.

### T-155 · Validate: run the pilot end-to-end and confirm it's trustworthy — `status: TODO` · `coder: opus` · `after: T-154`
Run the T-154 driver for real: at least 30 simulated days across at least 3 seeds. Confirm zero illegal/fabricated actions were accepted and zero crashes or hangs occurred. Then run one seed twice, independently, and confirm the two runs produce identical action sequences (the same determinism check T-1604a used on the UGT side) — an audit tool that isn't reproducible can't be trusted to diagnose a regression later. If any part of the pipeline is inherently nondeterministic (e.g. the LLM call itself), the run log must document exactly what's pinned/replayable and what isn't, rather than silently passing on a lucky match. Only once this task's Accept criteria are met does M7 close; update Part D of `docs/TESTING-STRATEGY.md` with the confirmed cadence and the exact command to invoke a run.
**Accept:** a committed run artifact (e.g. under `docs/playtests/` or a `packages/sim` output path) shows ≥30 days × ≥3 seeds completed with zero illegal actions and zero crashes; a same-seed determinism check shows two independent runs producing identical action sequences, or the run log explicitly documents which part of the pipeline is nondeterministic and how that's bounded; `docs/TESTING-STRATEGY.md` Part D updated with the confirmed cadence and invocation command.
```

**Note on timing:** `TASKS.md` currently has an orchestrator run in flight (uncommitted changes present as of this writing). These four tasks are staged here rather than inserted directly to avoid racing that run's own edits to the file; they will be appended under a new `## M7` section once the tree is clean.

---

## Part G — Addendum (2026-07-31): closing the gap between "the sweep is a gate" and "confident before UAT"

Parts A–F answer "how do we stop what's already covered from regressing." They do not answer the question the owner actually asked next: *by the time of the first human UAT, should there already be confidence the game is playable* — across archetype balance, port-to-port navigation, and overall player experience, not just per-feature UI/backend correctness. This addendum is that answer, and it does not replace M7 (T-152–T-155); it resequences and extends it.

**The honest starting point is already on record, twice.** `docs/RELEASE-CHECKLIST.md`'s own header states the 30-NPC field is "eight passes from player parity," carries "two known-red balance targets" (`packages/sim/src/__tests__/balance-targets.test.ts:225`, the trader clear-day-band `it.fails` tripwire — deliberately red, not skipped or deleted), and that "nobody has played this build end to end yet." Part C of this document says the same thing from the testing side: Combat's chosen branch is an abstract GUNS check with zero modeled deaths across 6.4 interdictions/fighter; Explore and VisitHangout have zero fleet coverage; N13 (dawn-hand parity) is undecided, and until it lands the sweep's NPCs are not facing the five-die hand-allocation decision a player faces at all. Sweep-as-gate (Tier 1) makes the *already-covered* verbs reliably not-regress — it cannot manufacture coverage for combat, explore, hangout, or the dice-hand decision. Treating a green gate as "the game is tested" would be exactly the "green but hollow" failure mode Part A opened with, one level up.

**Mapped onto the three things asked about:**

- **Archetype balance.** The sweep runs 8 scripted policies (trader, fighter, explorer, veteran, smuggler, gambler, greedy, trader-degraded) — good nominal breadth. But `fighter`'s defining verb (chosen combat) and `explorer`'s defining verb (Explore) are exactly the two systems with no real parity per Part C's table. "Archetype balance is tested" is currently true for the economic archetypes and false for the two most distinctive ones — a content/parity gap, not something more sweep tooling can close.
- **Port-to-port navigation.** The strongest-covered axis today — Travel/Shipyard are marked Shipped in Part C. Confidence here is reasonably justified once T-152/T-153 turn the sweep's numbers into hard pass/fail instead of eyeballed reports.
- **Overall player experience.** Structurally out of reach for both the sweep and an LLM pilot — neither can judge whether pacing or dice-tension *feels* right. That is what the owner's own UAT is for. The lever available here is making sure that first session produces reusable evidence (decision traces, a playtest log) instead of only an impression — which is what T-140/T-141 are for, and neither is currently sequenced ahead of UAT.

**Recommended resequencing of M7, plus two additions, before the first human UAT:**

1. **T-152 → T-153 first**, unchanged. Cheap, mechanical, already spec'd; protects everything below from silently regressing while the rest of this happens.
2. **N13 (dawn-hand parity) before further content work, not after.** Part C already calls it "the single biggest fidelity gap between NPC and player today" — every day it stays undecided, the sweep measures a different game than the one a human will play. This should outrank the remaining testing-infra tasks, since it changes what the *existing* sweep is worth.
3. **Finish and measure Hangout before UAT, not after.** `TASKS.md` T-145–T-150 (roster, unlock ladder, achievement hooks, capstone measurement, named-pool gate) are open, and the whole Liar's Dice/roster/ladder system currently sits at the same zero-fleet-coverage status as Explore. It should not be the one system nobody — human or sweep — has run through yet when it's front-and-center in the build the owner sits down with.
4. **Make a deliberate, recorded call on Combat's chosen branch before UAT**, even if the call is "not fixing the model this pass." Apply the release-checklist's own "the coder does not self-waive" discipline: name it as an open question rather than letting the sweep's silence stand in for an answer.
5. **Pull T-140/T-141 (decision tracing + opt-in playtest logging) ahead of the first UAT session.** If they land first, the owner's own first playthrough stops being only an impression and becomes a structured, reviewable log — the same fix-then-encode-as-test discipline Part E already commits to for sweep/pilot findings, applied to human play.
6. **Run T-154/T-155 (native LLM pilot) after the first human UAT, not before.** It is a Tier-2 audit tool, and the owner's own UAT is the best available Tier-2 pass for round one; better spent reproducing and extending whatever the owner finds by hand than run cold beforehand.

**One addition to the mechanism itself.** Part C's verb-parity table is prose today — a human has to remember to cross-check it against which archetypes the sweep actually runs. Recommend a small script/test that cross-references the 8 sweep archetypes against their defining verb's parity status and fails/warns if an archetype's headline verb isn't marked Shipped. This turns "is archetype balance actually tested" into something CI can assert, the same way T-152 turns the invariants into a gate, instead of something that has to be re-derived by reading two documents side by side.

**Disposition:** this addendum is a recommendation, not a ruling — the resequencing above, the Combat go/no-go, and the coverage-matrix addition are left for the team to weigh against what else is in flight before folding into `TASKS.md`.
