# Balance Rig — standing rulings

**Status:** Standing decisions for the Rimward balance rig, harvested 2026-08-02 from the
0.5.2/0.5.3 task log. Companion to `docs/BALANCE-POLICY.md` (where the numbers come from
and what the archetype vocabulary means), `docs/BALANCE-TELEMETRY_SPEC.md`,
`docs/VERSIONING.md` (the four independent version numbers, and "the rule that matters
most" about manufactured provenance) and `docs/NPC_REDESIGN.md` (standing amendment 1, the
baseline of record).

The rig is the only thing in this repo that can tell us whether a change was good. Almost
every ruling below exists to stop the rig from being quietly turned into a machine that
agrees with us.

---

## Part A — Fingerprints: what moves them, and what that costs

**BR-1 — Predict fingerprint movement from the hash's actual inputs, never from "I edited a
hashed file".** (T-159) `computeRulesFingerprint` hashes only `packages/content/src` plus
the engine's rule modules under `packages/engine/src`. **A `packages/sim/src` edit can
therefore never move `rulesFingerprint`** — it moves `instrumentFingerprint`,
`docsFingerprint` and `provenance.gitCommit`, and nothing else. Measured across T-159's
fix: `rulesFingerprint` stood at `f36d71f863a8ebe7` throughout.

**BR-2 — A docs-only change moves nothing and owes no capstone.** (T-130, T-151)
`computeDocsFingerprint` hashes the raw bytes of the rules and instrument **`.ts`** sources,
never `docs/`. A new `.md` leaves `docs/balance/smoke/tiers.json` fresh.

**BR-3 — But a new CONTENT file does not fail the rig test, and still stales every
fixture.** (T-151) Content is hashed wholesale (`CONTENT_NON_RULE_SOURCES` excludes only
`index.ts`), so `balance-rig.test.ts` will not notice an added content file while every
balance fixture goes stale and a capstone comes due. Do not rely on the rig test to catch
this.

**BR-4 — `instrumentFingerprint` is EXPECTED to move whenever a task edits
`packages/sim/src/index.ts`.** (T-123) An unchanged instrument fingerprint is evidence only
for a task that touched no sim file.

**BR-5 — Every source under a hashed root is either hashed or listed in its
NON_INSTRUMENT map WITH a written reason. There is no third, silent state.** (T-157) Files
that only read and render are non-instrument on `diff.ts`'s stated test — *it cannot
produce a number*. Live members: `sweep.ts`, `gate.ts`, `coverage.ts`, `report-model.ts`,
`report-html.ts`, `report-cli.ts`. Anything that computes a measured number must not be in
the map.

**BR-6 — Code structure may NEVER be chosen to control a fingerprint.** (T-140) Three
mechanisms were rejected on correctness, not convenience: (1) engine-level ambient state
set from the un-hashed `sweep.ts` — it buys a still hash with hidden mutable state in a
deterministic engine; (2) routing the telemetry sink through `packages/sim/src/protocol.ts`
(the UGT adapter, deliberately not instrument-hashed) — no sweep, smoke or capstone number
flows through it, and taking it because it sits on the cheap side of a hash boundary is
metric-gaming; (3) removing `packages/sim/src/index.ts` from `SIM_INSTRUMENT_DIRECTORIES` —
the too-NARROW direction `rules-fingerprint.ts` itself names as the correctness failure.

**BR-7 — Fingerprint movement is verified against a `git worktree` at the parent commit,
never asserted from memory, and the moved set is written down BEFORE the diff run.** (T-150)

**BR-8 — Any fingerprint beyond `rulesFingerprint` that moves must be NAMED IN THE COMMIT
BODY with the file that moved it.** (Owner ruling 2026-08-01 on F-140-3, option A.)
`docs/BALANCE-TELEMETRY_SPEC.md` §6's third bullet is permanently reworded to the property
T-110 actually established — a re-extraction moves fingerprints and `provenance` only, and
every recorded measurement stays byte-identical. §6's stricter "`rulesFingerprint`'s move is
the ONLY expected diff" wording was a transcription defect, not the bar T-110 set.

---

## Part B — Capstones, re-extraction and the baseline of record

**BR-9 — A behaviour-inert code extraction is remedied by RE-EXTRACTION, not a capstone and
not a hand edit.** (T-110 / F-110-C, the T-021 precedent; reused at T-112, T-122, T-140,
T-159) Re-run `npm run balance:extract -- --aggregate <the current baseline>`. The proof of
inertness is that the `docs/balance/smoke/tiers.json` diff is fingerprints + `gitCommit` +
`productVersion` while **every recorded checkpoint number is identical**.

**BR-10 — An instrument-only fingerprint move does not earn a capstone.** (T-159) The
`rulesFingerprint` branch of `fixtureFreshness` never fires for a sim-only edit, so the
documented remedy is a re-extract from the *same* aggregate, keeping provenance and run
count intact — not a 1,000-seed sweep.

**BR-11 — Re-extract AFTER `npm run format`, never before.** (T-159) The formatter rewraps
`packages/sim/src/index.ts`, itself a hashed instrument source, so extracting first commits
a fixture that goes stale on the next format run.

**BR-12 — A milestone owes ONE capstone, and one task owns it.** (T-137) Not one per task.
A content pass is not a capstone (T-122); a mechanism task is not a capstone; the
milestone's sweep, its re-pinned baseline and its verdict all belong to one named task.

**BR-13 — A capstone commit changes ZERO source lines but the baseline re-pin path
string.** (T-125, T-137) No new test file, no instrument field, no constant. Proven with a
`git diff --stat` in the write-up. A measurement the aggregate cannot answer is taken
instead by a gitignored `.scratch/` two-arm probe (the T-116 split) — adding `SeedRow` /
`MilestoneSample` / `CombatEncounterRecord` fields would move `instrumentFingerprint` in the
same commit that takes the capstone, so the fixture would record numbers measured under a
different instrument.

**BR-14 — Re-pinning the baseline of record moves ALL FIVE of its pointers in the same commit,
and since T-165 a test says so.** (T-116, T-125; fifth pointer added T-182; machine-enforced
T-165) Under standing amendment 1's "does the baseline describe HEAD?" rule the five sites are
`packages/sim/src/__tests__/balance-targets.test.ts`'s `BASELINE_OF_RECORD_PATH` (the only one
read at runtime, and therefore the authoritative one), amendment 1's own pointer,
`docs/NPC_REDESIGN.md`'s status banner, `docs/balance/smoke/README.md`'s "current
baseline" line, and — added at T-182 — **this rule's own "current baseline of record"
sentence below** — with the smoke fixture re-extracted FROM the new capstone file. The current
baseline of record is `docs/balance/baseline-t199-pacifist.json` (8,000 rows, 8 one-indexed
shards, spreads harvested, `sweepLabel t199-pacifist`; re-pinned at T-199 2026-08-04 — the
F-150-2 capstone. Before that: `baseline-t195-dawn-dice.json` at T-195, `baseline-t188-orbital-3d.json`
at T-188, `baseline-t160-dealer-fix.json` at T-160, `baseline-t182-reroll-fix.json` at T-182,
`baseline-n13-shipped.json` at T-156.)

**BR-14 IS NO LONGER ENFORCED BY A HUMAN REMEMBERING IT — and the record of why is not flattering
to the rule.** It was recorded in the first place because the smoke README was missed twice
(T-131 and T-133 both left it stale, T-137 caught it by hand). T-182 then found the rule's own
sentence stale and added it as a fifth pointer. **T-165 found THREE of the five stale at once** —
the status banner (two re-pins behind, at `t195-dawn-dice`), the smoke README (three behind, at
`t160-dealer-fix`) and this rule's own sentence (four behind, at `t182-reroll-fix`) — because
T-188, T-195 and T-199 each re-pinned the baseline while moving only some of the pointers (T-199's
own delivery note says plainly that it moved it "in both places that name it", which was two of
five). A rule violated at three consecutive re-pins is not a rule; it is a hope. So T-165 built
`packages/sim/src/__tests__/baseline-pointers.test.ts`, which reads all five sites, fails when any
disagrees, fails just as loudly when a site's anchor sentence is reworded so it stops resolving,
and holds an allowlist of the `docs/**` files that mention a baseline of record WITHOUT being a
pointer — so a sixth pointer cannot appear unnoticed the way the fifth did. The test lives under
`__tests__` deliberately: a module under `packages/sim/src/balance/` would move
`instrumentFingerprint` and make every future pointer check owe a capstone.

**BR-15 — A known-failing balance target stays an `it.fails` tripwire across every
re-pin — never converted, never deleted — and the re-pin is explicitly re-read against it in
the delivery note.** (T-125) The baseline is never selected to move a number into band.

---

## Part C — Measurement discipline

**BR-16 — A measurement task measures. It does not tune.** (T-116, T-124, T-137, T-148) A
capstone that reports a bad number and quietly moves a constant has failed the task. T-148
shipped `git diff --stat` = zero lines across engine, content, `sim/index.ts`,
`sim/protocol.ts`, `sim/balance` and `ui/src` with **ten tempting levers named in a table
and left alone**. If a number comes back bad, that IS the finding, and the lever goes to the
owner.

**BR-17 — Widen the sample; never widen the threshold.** (T-114, T-115) Five seeds cannot
be separated from stream noise, so T-114 re-priced nothing off a five-seed window. When a
content change moved deed coverage, T-115 widened `COVERAGE_SEEDS` from 1..12 to 1..65 and
left the `>= 2` bar byte-identical. Re-pricing a verb to flatter a metric is metric-gaming.

**BR-18 — Do not lower a threshold to keep a deed reachable; stage the retirement
instead.** (T-113 / F-113-D) `rich_hulk` fires on a 400cr+ `SalvageRecovered`, so the leg
that supplied it was left whole and its deletion deferred one task until a replacement band
was authored.

**BR-19 — A two-arm differential probe builds each arm in its OWN `git worktree` with its
own `node_modules` and its own `tsc -b` output.** (T-125) A shared `node_modules` resolves
through `realpath` and would silently run the older commit's sim against HEAD's engine.
Validity is then shown by an N/N fidelity MATCH on named channels plus control policies that
must come out byte-identical across arms.

**BR-20 — An unpaired ablation's arm medians are drift, not signal.** (T-116) Only the
paired sign count over the seed range is readable. A hand-rolled ablation loop must also be
fidelity-checked against the production `runCampaign` before its added counters are believed
(T-116: 5/5 MATCH).

**BR-21 — A lift claim states its inertness rate FIRST and is bounded by it, and is quoted
against an analytic counterfactual — never against nothing.** (T-125) Only 24.70% of 23,100
fleet interceptions reach the named pool, and 69.56% of those saw an all-zero pool where
`chooseWeighted` is byte-identical to a uniform pick.

**BR-22 — A measured rate of zero is reported as `< 1/N`, never as 0.00%, and the honest
cause is named when a different change is what actually collapsed the rate.** (T-150)

**BR-23 — When a fix is expected to move a number the wrong way, PRE-COMMIT the
prediction.** (T-148) T-148 pre-committed that the wronged-captain share *falling* (47.50%
→ 26.19%) while the lift over uniform *rose* (2.623× → 2.875×) is the interceptor getting
better, not a regression.

**BR-24 — Containment is a prediction, checked by row.** (T-137, T-150, T-159) Name the rows
that may move before the sweep. For a Liar's Dice mechanic change it is exactly `gambler`
and `fleet`, and the seven policies that never sit at a table must be byte-identical; a
third moved row is a containment failure, not noise. For a single-policy change, exactly
that policy's `PINNED_FINGERPRINTS` row may move — T-159 moved only `fighter`
(`13b4155d3d53e543 → f3e2714c7973c78c`), and the six unchanged rows are what proves the edit
was scoped.

**BR-25 — Report the economic movement a reachability change causes; tune only in a later,
separately reviewable task.** (T-121) The 1→14 port Hangout reach change moved
`expectedValuePerDare` 198.62 → 101.02, trader loan defaults 6 → 0 and gambler dares 272 →
1,314. Nothing was tuned in response. Reach and content authoring are kept separable
precisely so a moved golden is attributable.

**BR-26 — Report the mechanism alongside a fingerprint move, with a decomposition where one
exists.** (T-123, ledger entry 19: a content-only vs content+mirror split.) Never tune it
away, never re-record to make something pass.

**BR-27 — Read a fixture figure against its PREDICTED share, not as a verdict.** (T-115)
Explore's per-outcome event rate is ~10× lower by design — a board used to walk three
independent legs and now draws one row of a hundred — so `RecoveryStarted` at 44.7% is read
against the 42% of the table that sits in bands 2–4, and `podFlagged` at 5.0% against 4.5%.

**BR-28 — Do not manufacture provenance.** (T-142) A report may NEVER attach the current
tree's fingerprint to an input artefact. Sidecar stamps supplied via `--provenance` render
attributed as "declared by `<file>` — NOT by the aggregate itself", and the footer's figures
are labelled as the tree the report was generated on. `compareRulesets` is three-state and
`unknown` may never render as `same`; a missing stamp produces the loud "RULESET UNKNOWN"
banner, never an optimistic match.

**BR-29 — Deed-hunter routing stays fixed and deterministic across a measurement.** (T-121)
`HANGOUT_SYSTEM = 1` is deliberate; §4.2's "route to the nearest Hangout" option was
rejected so the veteran's errand does not vary underneath the measurement.

**BR-30 — Changing the advertised legal-action set does not move the replay goldens.**
(T-121) Replay logs emit only `state-summary` and `action-result`, never a `legal-actions`
enumeration — verified, with response counts and all three session `rngState`s unchanged.
This CONTRADICTS `docs/HANGOUT_REDESIGN.md` §4.2's prediction and is recorded so no future
task re-derives the wrong blast radius from it.

---

## Part D — Fixtures and goldens

**BR-31 — Goldens are re-verified by regenerating through their OWN generators and
JSON-comparing generator output against the committed module** — never by string-matching
the prettier-wrapped file — and are re-recorded only if they actually differ. (T-122, T-124;
both came back byte-identical and neither was re-recorded.)

**BR-32 — A pinned fixture is re-derived with a ledger entry, and the control on a
re-derivation is that ONLY the affected rows move.** (T-113) In `campaign-degraded`'s
`PINNED_FINGERPRINTS`, exactly the two sweeping policies moved while the other five stayed
byte-identical — that byte-identity is what says a verb-yield change moved the callers and
not the world.

**BR-33 — A deliberate RNG-stream change is named in the commit body** (the N3 precedent;
T-131 regenerated the replay goldens because bands 3–4 now consume RNG at claim).

**BR-34 — Every seeded-BAD gate fixture is ONE named mutation off a real report or a real
sample, never a hand-built literal, and each must fail EXACTLY ONE band** so it cannot pass
by breaking everything. (T-153)

**BR-35 — The clean gate fixture is sized to clear every `minSample` floor at once** — 104
rows (52 seeds × trader/fighter × 35 days = 3,640 sim-days), all eight bands in band and
**none skipped**. Do not shrink it below the floors. (T-153)

**BR-36 — Extraction before addition, proved inert.** (T-153) Making `runGate`/`reportGate`
public was `export` plus a readers note and nothing else, with all three fingerprints
measured byte-identical before and after and the suite green with the export applied and no
new test present.

---

## Part E — The sweep gate and CI

**BR-37 — The gate lives in a PURE module, `packages/sim/src/balance/gate.ts`** (the
T-1602b pure/IO split, mirroring `aggregate.ts`): named `assert*` predicates plus an
`EXPECTED_EVENT_RATES` table, called by name from `runGate` in `balance/sweep.ts`. It is
registered non-instrument because it asserts *about* measurements rather than producing one,
so tightening a check never stales a smoke fixture. New gate checks belong there, not in
`sweep.ts` or `index.ts`. (T-152)

**BR-38 — An invariant helper has exactly ONE definition.** (T-152) `longestZeroIncomeStreak`
lives in `gate.ts` and is re-exported from the test support module, so the gate and the
suite cannot drift into two copies that disagree.

**BR-39 — A validating suite drives the PRODUCTION composer.** (T-153)
`sweep-gate.test.ts` calls the sweep's own `runGate`/`reportGate` rather than re-listing the
nine `assert*` calls — a test that re-composes them proves the test's composition, not the
sweep's.

**BR-40 — CI shape: a small fixed 2-shard + merge `gate` job on every push/PR, sized so no
expected-event-rate check reports SKIPPED, plus a `deep` job on nightly cron and
`workflow_dispatch`.** (T-152) Running the deep sample on every push was rejected as too
slow. Two gate limitations are recorded rather than worked around: the flat invariants'
end-to-end exit is proven via `reportGate` (making a real sweep emit a negative-credits row
would require breaking the engine), and `--merge` deliberately does not re-run the flat
invariants because `SeedRow` carries no `daily[]`, so the merge leg rests entirely on the
rate table. (T-153) **"Every push/PR" became literally true at T-163**, and was not before:
this workflow's `on.push.branches` was a hand-maintained allowlist that had grown a
`redesign/explore-hangout` entry by hand, so an unlisted working branch got no `gate` job at
all while the job's same-repo-PR skip deferred to a push run that did not exist. The list is
now `['**']`, the skip is unchanged, and the shape is pinned by
`packages/ui/src/__tests__/ci-workflow.test.ts` — including this job's 1-indexed
`--shard i/2` → `--merge` invocation with `--milestone-days` and both `--out`/`--aggregate-out`
under `$RUNNER_TEMP`. Reasoning and declined alternatives: `docs/TESTING-STRATEGY.md` Part H.

**BR-41 — `assertNoIncomeStall` is scoped to `GATE_COMPETENT_POLICIES`, and that exact
membership is pinned by a negative control** showing the identical stall on `veteran` and
`greedy` returns zero violations. Do not widen the scope without replacing the control.
(T-153)

**BR-42 — Sweep-gate verification runs write to a scratch dir through BOTH `--out` and
`--aggregate-out`, and the closing assertion is that nothing leaked into `docs/balance/`.**
(T-159)

**BR-43 — Coverage-gate warn/fail split.** (T-157) An `uncovered` archetype listed in
`ACKNOWLEDGED_COVERAGE_GAPS` prints a warn line and does **not** set a non-zero exit; an
`uncovered` archetype with no acknowledgement, or an `unclassified` policy with no matrix
row, fails and exits 1; `exempt` is a third value printed on its own line, never folded into
a pass. **Reason:** today's gaps are recorded, owner-gated deferrals no build task can
close, and a gate permanently red for a documented deferral trains people to ignore it —
the same disposition `gate.ts` already takes for its three `not-observable` UGT predicates.

**BR-44 — An archetype is never re-mapped onto a verb because that verb happens to be
green.** (T-157) `gambler`'s prime focus is `VisitHangout` per `docs/BALANCE-POLICY.md`
D.2a, not `Trade` (its secondary spread). Choosing a mapping for greenness is the same class
as widening a band to clear a gate. `Port` and `Storylet` are deliberately absent from the
coverage matrix — they are PARITY LEDGER rows but appear in no Part C table and are no
archetype's prime focus — with the reason stated at the constant rather than left as a
silent gap.

**BR-45 — CI evidence standard: no green CI run may be claimed that was not observed.**
(T-153) Acceptance rests on a verbatim quoted runner log plus a local dry run of the exact
CI invocation, with any un-run half filed as a finding rather than asserted green.

---

## Part F — Archetype and policy norms

**BR-46 — D.2a norm: every archetype is "one prime focus + a spread of secondary actions,
never a single-verb monoculture", and there are exactly TWO accepted fallback shapes** —
(1) a second-pass T-1104 full-tank relaxation of the gate, or (2) an explicit anti-idle move
that fires only when the day queued no income action at all. Stated at
`docs/BALANCE-POLICY.md` D.2a; any new or edited archetype is checked against it instead of
re-deriving the answer from source. The `veteran` and `greedy` exclusions are deliberate and
stated at their own definition sites — do not re-litigate them in the doc. (T-159)

**BR-47 — An anti-idle branch must be guarded so it cannot become a counter-warming loop.**
(T-159) The fighter's homeward burn fires only when the day queued no income action, only to
a destination affordable on the post-refuel tank, and only if that destination is strictly
closer to a Hangout — so a stranded ship walks in toward the core instead of ping-ponging.
**Rejected alternative:** the trader's filter-relaxation pattern, which cannot help when
`reachable` is empty even at `maxFuel`.

**BR-48 — The instrument's own policy is not the game's rule, and may not be changed inside
a measurement task.** (T-148) `planDare`'s richest-candidate seating rule and
`GAMBLER_MAX_DARES_PER_DAY = 2` set the hands-per-day on which every ladder-pacing
conclusion rests; changing either re-bases every baseline in the same commit that measures
it.

**BR-49 — `F-123-3` was fixed by option A** — `planDare` takes a `committedStakes` map and
reads the dealer's purse net of stakes already queued against them, the same worst-case
convention applied to the player's own purse. Option B (moving `GAMBLER_MAX_DARES_PER_DAY`)
was rejected as a pacing change by fiat. (T-150)

---

## Part G — Standing owner-gated knobs

These are **design questions for the owner, not tuning knobs.** A task measures them and
reports; no task changes them without a recorded owner ruling.

**BR-50 — The 0.25 named-pool interceptor gate (`travel.ts`) and
`DISPOSITION_DECAY_INTERVAL_DAYS = 3`.** (T-125, re-affirmed T-150.) Measured twice, changed
neither time.

**BR-51 — `RENOWN_DEED_THRESHOLDS.CONQUEROR = 38` must not be rescaled off a 120-day
capstone.** (T-148) It was sized off a 300-day measurement against a 44-deed slate and is
being read against a 120-day horizon and a 59-deed slate; only a 300-day arm may overrule
it. Report, do not retune.

**BR-52 — `LIARS_DICE_UNLOCK_GAMES` `[5,10,20,40,80]` stays as authored.** (T-148) Rung 5
opens at median day 55 and carries 53.04% of all hands, but widening the ladder would be
tuning to the maximal playstyle — the only one the rig can see, since seven of eight policies
play zero hands. 99.50% of dice careers cross rung 5, so the ladder is validated as
*reachable*; that is explicitly not evidence it is mis-sized.

**BR-53 — Mira-9's wager band ceiling stays 200 even though it makes the `high_roller`
deed unreachable there.** (T-122 / F-101-7) Inflating a dive bar's band to make a deed
reachable is tuning to reach an answer; deed coverage must read a Mira-9 zero as expected,
not as a gap.

**BR-54 — The NPC Hangout credit faucet stays open.** (Owner ruling D3, 2026-07-31,
re-measured T-150.) Three independent bakeoff reviewers put it under 0.3% of NPC wealth by
day 120; re-measured post-fix at +3.44cr/captain-day = 0.22% of terminal NPC wealth. That
does not justify breaking `resolveNpcDay`'s deliberately single-NPC-mutation model to make
the transfer zero-sum.

**BR-55 — The `VisitHangout` PARITY LEDGER row stays DEFERRED.** (Owner ruling 2026-08-02.)
The re-measured numbers are smaller than at the 2026-07-30 ruling but do not discharge the
requirement: real parity needs the cast playing through the actual
`resolveVisitHangout`/Liar's Dice resolver, not the `executeSocialize` stub.

**BR-56 — Re-argue a deferral on the MEASURED number, not the original one.** (T-101,
T-125) The three NPC-side `VisitHangout` defects were deferred in exchange for two
measurement obligations, on the argument that the faucet keeps dealer purses solvent and
dealer purses cap the player's stake. Both obligations were discharged and the measurement
**partly refuted that argument** (the declared band binds 88.93% of stakes; the dealer only
10.97%). A deferral's rationale is evidence with an expiry date.
