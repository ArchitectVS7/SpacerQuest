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
T-110 actually established — a re-extraction moves `productVersion`, the fingerprints and
`provenance` only, and every recorded measurement stays byte-identical. §6's stricter
"`rulesFingerprint`'s move is the ONLY expected diff" wording was a transcription defect,
not the bar T-110 set. **(T-166, 2026-08-04: `productVersion` added above. This sentence
and the 2026-08-01 reword it transcribed both dropped it, while BR-9 twelve lines below
had it right the whole time — `3468ef5f` moved four fields, not three. The rule is now
ENFORCED, not remembered: `packages/sim/src/__tests__/smoke-reextraction.test.ts` asserts
it against `3468ef5f`'s own diff and against a live re-extraction, so the next miscopy
goes red instead of sitting in a doc.)**

**BR-60 — The Tier-2 pilot is NON-INSTRUMENT, so a pilot-only change moves no fingerprint and
owes no capstone.** (T-154) `pilot.ts`, `pilot-anthropic.ts` and `pilot-cli.ts` are classified in
`SIM_NON_INSTRUMENT_SOURCES` (`packages/sim/src/balance/rules-fingerprint.ts`, ~lines 150–167)
with their reasons written down on BR-5's terms — **never called by `runCampaign`, never exported
by `index.ts`** — so no sweep, gate or smoke number can descend from them. An instance of BR-5,
recorded here because the pilot is the largest non-instrument surface in `packages/sim` and the
temptation to let it grow into the measured path is correspondingly larger. **(T-155, 2026-08-03
— the exemption carries a PROVISO, stated because a pilot task is exactly where it would be
forgotten: all three files stay non-instrument, and a pilot-only change owes no `rulesFingerprint`
move and no capstone sweep, ONLY while no new file is added under `packages/sim/src/` and no
gameplay constant, content instance, balance band, threshold, golden, fingerprint or persisted
save shape is touched. A new file under the hashed root re-opens BR-5, not this ruling.)**

**BR-69 — UI-only work owes NO capstone and NO fingerprint move, because `packages/ui` is not
hashed at all.** (T-162) `packages/sim/src/balance/rules-fingerprint.ts` hashes `packages/engine`
plus `packages/content` (rules) and `packages/sim/src` (instrument); `packages/ui` appears in
neither set. A task confined to `packages/ui/**`, `docs/**` and `.github/**` therefore closes
without a balance capstone. This is a statement about what the hash reads, not a licence: the
moment such a task reaches into `packages/engine` to fix what the cockpit revealed, BR-61 applies
in full.

**BR-70 — A brief's pinned-figure table lives INSIDE its test file, never in a new module under a
hashed root.** (T-158) The T-158 pre-UAT figure pins sit in
`packages/sim/src/__tests__/uat-brief-figures.test.ts` itself. Any new non-test module under
`packages/sim/src` would owe a `SIM_NON_INSTRUMENT_SOURCES` entry (BR-5) and would move
`instrumentFingerprint`, staling every committed smoke fixture over a table of prose citations;
`__tests__` is listed in `HASHED_ROOT_IGNORED_DIRECTORIES`
(`packages/sim/src/balance/rules-fingerprint.ts:250-254`) and can move no fingerprint. Where a
helper is genuinely shared, it earns its module and its classification — a single brief's pin
table does not.

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

**(T-173, 2026-08-04) The parenthetical above is DISCHARGED for the Hangout/disposition
measurement; the rule itself is unchanged.** The objection was always about the COMMIT, never
about the fields: four measurements (T-125, T-137, T-148, T-150) each descended from a
gitignored probe because the fields could not ride in on a capstone. T-173 added them in their
OWN non-capstone commit under BR-10 + BR-9 — `SeedRow.hangout` / `SeedRow.disposition`,
`MilestoneSample.npcDisposition`, and five interceptor-provenance fields on
`CombatEncounterRecord` — with the `balance:extract` re-extract in the same commit and NO
baseline move. `rulesFingerprint` unmoved at `febc55edd3a94b3f` (zero lines under
`packages/engine/src` and `packages/content/src`); `instrumentFingerprint` and `docsFingerprint`
moved; every recorded checkpoint byte-identical; a two-arm 320-run sweep diffed at the aggregate
level reported *"NO MEASURED VALUE MOVED"* on every shared path, with the new paths listed as
one-sided. The next Hangout/disposition question is answered off the sweep's own rows, so a
fifth probe in that lineage would be a step backwards.

**BR-14 — Re-pinning the baseline of record moves ALL FIVE of its pointers in the same commit,
and since T-165 a test says so.** (T-116, T-125; fifth pointer added T-182; machine-enforced
T-165) Under standing amendment 1's "does the baseline describe HEAD?" rule the five sites are
`packages/sim/src/__tests__/balance-targets.test.ts`'s `BASELINE_OF_RECORD_PATH` (the only one
read at runtime, and therefore the authoritative one), amendment 1's own pointer,
`docs/NPC_REDESIGN.md`'s status banner, `docs/balance/smoke/README.md`'s "current
baseline" line, and — added at T-182 — **this rule's own "current baseline of record"
sentence below** — with the smoke fixture re-extracted FROM the new capstone file. The current
baseline of record is `docs/balance/baseline-t175-archetype-ordering.json` (8,000 rows, 8
one-indexed shards, spreads harvested, `sweepLabel t175-archetype-ordering`; re-pinned at T-175
2026-08-06 — F-160-1's close, which makes `archetypeMove`'s `optimal` branch READ the standing
claim (`probClaimTrue` / `creditedClaimSupport`) instead of pricing it with the unconditioned
Binomial, un-inverting the archetype ordering at every tier: bad − optimal −6.64 pp (z −12.74)
-> +16.09 pp (z +28.99). It moves BOTH fingerprints — `rulesFingerprint` cabd2112ccf4cefb (was
f264d7f4a2d56fde; the new rule plus three optional `DareHandResolved` fields) and
`instrumentFingerprint` e84d8e074fde0b98 (was b8894cb6c678fce6; `sim/index.ts`'s `dareCells`
split plus `gamblerPolicy`'s two shared anti-idle rungs) — so it is deliberately NOT a
single-arm attribution. TWO OF TEN ROWS MOVED (fleet, gambler), predicted before the run; gate
PASS, 0 invariant violations. The one it replaces was
`docs/balance/baseline-t168-effective-band.json` — F-148-4's fix, which makes `planDare` and the UGT protocol enumerator size the
Dare wager domain off the engine's new `preHandWagerBand` (the unlock tier's EFFECTIVE band)
instead of the port's raw tier-0 band, so a career can at last REQUEST into the raised tier-4
ceiling and tier 5's removed clamp. It moves BOTH fingerprints — `rulesFingerprint`
f264d7f4a2d56fde (was 2f93098dc9ab15f0; the new accessor is an engine rule source) and
`instrumentFingerprint` b8894cb6c678fce6 (was 5c230e99648cddee; `sim/index.ts`'s `planDare`
plus three additive `HangoutPlayStats` fields) — so it is deliberately NOT a single-arm
attribution, and `sim/protocol.ts`'s half of the fix contributes to neither hash. TWO OF THE
TEN ROWS MOVED — fleet and gambler — with explorer, fighter, greedy, smuggler, trader,
trader-degraded and veteran byte-identical. PREDICTED IN WRITING BEFORE THE RUN (`TASKS.md`
T-168): `planDare` is called by `gamblerPolicy` and by nothing else, and fleet pools it.
Gambler `finalCredits.median` 80,244 -> 115,612. ONE shape change reported and not suppressed:
`byPolicy[gambler].renownRanks.GIGA_HERO`, a previously-empty bucket the richer gambler now
reaches. Gate PASS, 0 invariant violations, nothing tuned in response. Before that:
`baseline-t208-quest-captain-ports.json` at T-208 — the M19 MILESTONE CLOSER, a
CONTENT-AND-ENGINE capstone that gives the 11
`QUEST_PROFILES` captains a DECLARED HOME PORT (`NpcProfile.homePortSystemId`) instead of the
arbitrary `(index % 20) + 1` seed that had parked six of them at rim systems with no Cantina
for an entire career. It moves `rulesFingerprint` (cbb087860825aa35 -> 2f93098dc9ab15f0 —
content is hashed wholesale, and `state.ts` / `save.ts` are hashed engine rule modules) and
NOT `instrumentFingerprint` (unmoved at 5c230e99648cddee — nothing under `packages/sim/src`
outside `__tests__` was touched), so it is a clean single-arm attribution. SIX OF THE TEN ROWS
MOVED — fleet, explorer, gambler, greedy, smuggler and veteran — with fighter, trader and
trader-degraded byte-identical. THE MOVE WAS PREDICTED IN WRITING BEFORE THE RUN (`TASKS.md`
T-208) and its channel named: `resolveVisitHangout` picks its Dare dealer from co-located NPCs
with no `isSimulatedCaptain` filter, and the bond hook requires co-location too, so moving
eleven records changes which captains are in which room. Headline movement is small in every
direction — fleet `tourOneClearRate` 0.6329 -> 0.6348, fleet `finalCredits.median` 49,839 ->
49,687. Gate PASS, 0 invariant violations, and nothing was tuned in response. Before that:
`baseline-t206-captain-voice.json` at T-206 — a CONTENT-ONLY capstone shipping the cast's
authored VOICE: `tableTalk` and the four `catchphrases` slots for the 27 captains T-205 left
on its `VOICE_AUTHORING_PENDING` worklist. It moved `rulesFingerprint` (5ae9a5d473827024 ->
cbb087860825aa35) and NOT `instrumentFingerprint` (unmoved at 5c230e99648cddee), and EVERY ONE
OF THE EIGHT POLICY ROWS CAME BACK BYTE-IDENTICAL — "NOTHING MOVED. Every compared field is
equal on both sides." — predicted in writing before the run (`TASKS.md` T-206). Gate
PASS, 0 invariant violations. Before that: `baseline-t204-cantina-rename.json` at T-204 — a
TEXT-ONLY capstone shipping the player-facing "Hangout" -> "Cantina" rename:
authored prose STRING VALUES only, with no rule, DC, band, threshold or code path changed. It
moves `rulesFingerprint` (f33b6af1ee21dffa -> 5ae9a5d473827024 — content is hashed wholesale
into the fingerprint, so even a pure-text edit moves it) and NOT `instrumentFingerprint`
(unmoved at 5c230e99648cddee), so it is a clean single-arm attribution. EVERY ONE OF THE EIGHT POLICY ROWS CAME BACK BYTE-IDENTICAL, which was predicted in
writing before the run and is an INSTRUMENT-GAP NULL RESULT rather than a verdict that the new
ceiling is balanced: the sim's gambler is the only policy that plays a Dare and is bounded at
`GAMBLER_MAX_DARES_PER_DAY = 2`, below the ruled ceiling, so it plays the same 1,2,2,2,2,2
hands by tier under both the old and the new table — F-202-1 in `TASKS.md`'s T-202 block files
the gambler-arm instrument task that would be needed to measure it. Before that:
`baseline-t197-hangout-caps.json` at T-197 — the M17 MILESTONE CLOSER, the first capstone of
the M17 arc to move BOTH hashes at once (rules 10e19c88e9a07856, instrument 5c230e99648cddee),
`baseline-t196b-instruments.json` at T-196b, `baseline-t196a-free-actions.json` at
T-196a, `baseline-t199-pacifist.json` at T-199, `baseline-t195-dawn-dice.json` at T-195, `baseline-t188-orbital-3d.json`
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

**BR-61 — A rules-directory edit owes a FULL capstone even when the predicted delta is ZERO.**
(T-182) T-182 touched `packages/engine/src/dice.ts`, inside `ENGINE_RULE_DIRECTORIES['']`, so
`rulesFingerprint` moved and a fresh 8,000-row sweep was taken —
`docs/balance/baseline-t182-reroll-fix.json`, `sweepLabel t182-reroll-fix` — even though
`balance:diff` against `n13-shipped` reported **NOTHING MOVED** across all 8,000 careers. This is
the complement to BR-9/BR-10: a behaviour-inert EXTRACTION is remedied by re-extraction, but a
behaviour-CHANGING rules edit with a zero predicted delta still buys the sweep, because "I
predicted zero" and "the rig measured zero" are different claims and only the second one is
evidence. The zero was pre-committed with its mechanism per BR-1/BR-26: the sim's `withReroll`
prepends its `Reroll` to the dawn batch and no sim policy reads `rerollsRemaining` after a die is
spent, which is the only window the bug lived in.

**BR-62 — A baseline filename written into a task block is ADVISORY and may have rotted before
the task runs.** (T-160) T-160's block named `baseline-t148-roster-ladder.json`, which was two
capstones stale at HEAD. Diff for attribution against the **actual** baseline of record —
`BASELINE_OF_RECORD_PATH` in `packages/sim/src/__tests__/balance-targets.test.ts`, the only
pointer read at runtime and the one `packages/sim/src/__tests__/baseline-pointers.test.ts` holds
the other four against (BR-14) — and quote the older, task-named baseline separately for the
economic read only, as T-160 did with `baseline-t182-reroll-fix.json` against `t148`.

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

**BR-63 — N13 is graded WITHIN ARCHETYPE, not fleet-wide, and its hypothesis is recorded as
DISPROVED AS STATED even though the change was ACCEPTED.** (T-156) The SHIPPED−CONTROL
fleet-wide `skillShare` gap is +0.0045 (0.7527 → 0.7407 → 0.7452 across
`baseline-n13-{pre,control,shipped}.json`), which sits inside the 8-shard noise floor — the
dominant effect of the NPC virtual hand is that it is a variance REDUCER. Within archetype the
gap is positive in 8 of 8 independent shards for `explorer` (+0.0432), `fighter` (+0.0306) and
`veteran` (+0.0165), and a coin flip for `trader`/`smuggler`/`gambler`. Any successor step on
this lever (N5) reuses N13's three-arm control design and grades on the within-archetype axis.
Recorded because the honest write-up of an accepted change is the one that says which half of
the hypothesis the rig actually supported.

**BR-64 — Widening a coverage seed range is a WIDENING only if every number in the file stays
byte-identical.** (T-160, extending BR-17) `deed-coverage.test.ts` went 1..65 → 1..76: the union
stayed 44/44, the `>= 2` bar stayed byte-identical, and 1..76 is the SHORTEST contiguous range
holding two individually-total careers. It is a re-phasing, not harder dice, and that was proven
rather than asserted — a 160-seed re-sweep found ten total careers where T-115's found two, so
the slate got easier, with the long pole still `slipped_the_scan` and no dice deed anywhere near
the margin. Widen to the shortest range that still clears the UNMOVED bar, and show the move is
re-phasing.

**BR-65 — A candidate fix that trades one measured instrument against another does not land on
its headline number alone.** (T-161) F-161-1's storylet split buys `assertNoIncomeStall` seeds
≥ 5 from 197 → 18, but costs `deed-coverage.test.ts` its full slates, 2 → 0. It is therefore
deferred to a task that OWNS the deed-hunter instrument and is permitted to re-pin that test —
the same scope shape T-159 used when it left F-159-1 to T-161. A fix is not free because the
number it was aimed at moved; the price is whatever it did to the rig's other instruments, and
that price is measured before the fix is graded.

**BR-71 — A brief's figure pin resolves its value by plain IN-SECTION substring, deliberately not
by `coverage.ts`'s last-column table resolver.** (T-158) The pin reads from the heading line to
the next same-or-shallower heading, so `####` subsections stay in scope. The table resolver was
tried and rejected on a demonstrated miss: against `docs/HANGOUT_REDESIGN.md` §11.3's decay table
it returns the `explorer only` figure **96.47%** instead of the fleet's **96.52%** — the wrong
cell, silently, where the substring resolver fails LOUDLY on a reword. A resolver that can return
a plausible wrong number is worse than one that cannot find the number at all; this is the pin
half of L-035's rule.

**BR-72 — A named repro case that no longer reproduces is REPORTED, never claimed as fixed.**
(T-199) `docs/EXPLORE_REDESIGN.md` §10.3's seed-3 / Sirius-16 / days-45-49 stall stopped
reproducing once T-195's travel-die easing re-seeded every stream — seed 3 now runs 120 days at a
longest zero-income streak of 1. T-199 discharged that Accept clause by SAYING SO and pinning
seed 3 as a 120-day regression bar in
`packages/sim/src/__tests__/campaign-smuggler-gambler.test.ts`, rather than writing the clause up
as closed by its own change. A stream re-phase and a fix are different events and the record must
be able to tell them apart. (Provenance note: T-199's own re-pin to
`docs/balance/baseline-t199-pacifist.json` has since been SUPERSEDED — `BASELINE_OF_RECORD_PATH`
in `packages/sim/src/__tests__/balance-targets.test.ts:218` names
`docs/balance/baseline-t175-archetype-ordering.json`, per BR-62.)

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
new test present. **(T-175 and T-199 extend this from exports to shared BEHAVIOUR helpers, which
is the harder case because the extraction moves code a policy already runs. `planHomewardBurn`
was lifted out of `fighterPolicy` and shown to return the `fighter` fingerprint byte-identical to
its pin — and the 200 × 35 strand scan to report the SAME two offenders — with only the
extraction applied; only then was it wired into `traderPolicy` and `smugglerPolicy`. T-175 used
the same two-step for `gamblerPolicy`. A helper extracted and wired in one commit makes every
subsequent number unattributable.)**

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
report-level `assert*` calls — a test that re-composes them proves the test's composition, not
the sweep's. (T-167 added one ARM-LEVEL predicate that `runGate` cannot reach by construction;
it is partitioned out by registry, not exempted — see BR-57.)

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

**BR-66 — `veteran` stays EXEMPT from `GATE_COMPETENT_POLICIES` after T-161's fix, and the
exemption note is RE-NUMBERED against a live measurement rather than inherited.** (T-161,
qualifying BR-41) On seeds 1..200 × 35 days the worst zero-income streak fell **31 → 13** (the
nine seeds holding the 31-day strand drop to 5–10), but 197 of 200 seeds still sit at or over the
`INCOME_STALL_LIMIT` of 5, and seeds 1..60 — the exact CI `gate` sample — still hold five
stalling veteran seeds (1, 18, 26, 34, 58). The prior note claimed "6–8 consecutive zero-income
days" from dice-banking; both halves were wrong (the real figure was 31 days, the real cause was
the un-relaxed contract filter F-159-1), so the exemption was re-justified against the
measurement, not merely re-worded. When F-161-1 is closed, RE-MEASURE and revisit membership —
do not assume either way.

**BR-67 — `Crew` and `Reroll` are EXCLUDED from NPC verb parity by owner ruling, not open
gaps.** (Owner ruling 2026-07-31, shipped at N13 / T-156.) The exclusion is recorded in three
places that must stay in sync: `docs/NPC_REDESIGN.md`'s PARITY LEDGER (the literal
`**EXCLUDED (owner ruling 2026-07-31, shipped at N13 / T-156)**`), `'excluded'` in
`VERB_PARITY` (`packages/sim/src/balance/coverage.ts`), and `docs/TESTING-STRATEGY.md` Part C.
`packages/sim/src/__tests__/archetype-coverage.test.ts` enforces all three **in both
directions**, and the doc is never edited to match the code. `Reroll`'s exclusion is
STRUCTURAL rather than conventional: the NPC virtual hand is dealt with `rerolls: 0`, so there
is no charge for a captain to spend.

**BR-73 — The three not-observable UGT predicates stay `not-observable`, even though a different
tier has now MEASURED all three at zero.** (T-155, qualifying BR-34's honesty rule and L-034)
`docs/TESTING-STRATEGY.md` Part D's `inv_blocked_from_legal_non_increasing`,
`inv_protocol_errors_non_increasing` and `inv_dice_bounds` keep
`disposition: 'not-observable'` in `SWEEP_INVARIANT_DISPOSITIONS` with `coveredBy: null`, because
the disposition claim is about **the sweep**, which still cannot see them. The Tier-2 pilot
measured all three at zero across 300 days; that is a real result and it belongs in the pilot's
own report, but a second tier measuring an invariant does not turn the sweep's row green. A
coverage table describes the mechanism it names, never the union of every mechanism in the repo.

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

**BR-68 — The fighter's anti-idle homeward-burn is REJECTED for `veteranPolicy`, on a
measurement rather than on symmetry.** (T-161) Per BR-46 there are exactly two accepted fallback
shapes, and the brief required measuring before assuming one suffices. The second branch was
tried: it moved the worst zero-income streak 13 → 11 but moved seeds at or over the limit the
WRONG way, 18 → 19, so it was reverted. Only the T-1104 full-tank `signableWithin(cap)` two-pass
relaxation landed — the same shape the other five gated policies carry. A fallback branch that
helps the tail and hurts the population is not a fallback.

**BR-74 — `planPacifistCombat` queues the GETAWAY first and the plea behind it on the next die;
the day is no longer capped at exactly one combat stance.** (T-199) Plea-first was implemented
and MEASURED, then rejected: it moved `balance-combat-survival.test.ts`'s "preparation pays off
when outgunned" band from **0.5333 → 0.4542** against a bar of 0.50, and the move was causal
rather than noise (0.4340 at a 3× widened 360-seed sample). The band was **not** moved to fit the
ordering; the ordering was moved to respect the band. BR-16's line applies to plan ordering as
much as to constants.

**BR-75 — `planStrandedExplore` (`packages/sim/src/index.ts:3068`) must be queued LAST in any
plan.** (T-199) A band-3/4 find charges `apCost` extra dice at claim, which crashed
`veteranPolicy` on seed 194 during development when the rung sat higher. Its ordering against
`planHomewardBurn` needs no coordination: the burn is the better out, and if the burn queued a
Travel then `actions.some(isIncomeAction)` is already true, so the stranded-Explore rung returns
null on its own first guard.

**BR-76 — F-199-3: the rim-strand class is fixed STRUCTURALLY, never seed by seed, because any
change to a shared planner re-seeds every policy's stream and moves WHICH seeds strand.** (T-199)
A fix verified only on the seeds that were named is not verified. Evidence: a prototype of the
T-199 fix took smuggler's 200-seed worst streak **5 → 1** while waking a **dormant 27-day fighter
strand on seed 35** — the exact seed T-159's commit message reports as fixed. The corresponding
enforcement obligation is L-041: every offending seed is pinned as a test at the CI sweep's own
35-day horizon.

**BR-77 — A fix that could satisfy an invariant by RECLASSIFICATION is cross-checked with a
variant that changes no classification.** (T-199) A `talk` anywhere in a plan makes that day
income-classified, so after T-199 `assertNoIncomeStall` can no longer fire from a carried
encounter for the five `planPacifistCombat` policies — the invariant could have gone green
without a single strand actually ending. The strand was proved genuinely gone, not merely
relabelled, by a **discarded variant** — a second `run` instead of the plea — which also cleared
every offending seed (200 × 35, worst streak 3, zero offenders). Where a fix touches what an
invariant COUNTS as well as what the policy does, the control arm changes only the behaviour.

**BR-78 — Do NOT add `yardCost` to `fighterPolicy`'s `planDebtPayment` call.** (T-199,
re-affirmed T-196b so it cannot be re-made under cover of another task.) Measured over 100 seeds
× 120 days it takes median final credits **79,494 → 5,877** and the debt-clear rate
**0.580 → 0.510**; an 8,000-row capstone diff puts `fighter.finalCredits.median` at **-93.5%**
with `tourOneClearRate` **-9.2%**. Mechanism: a smaller payment leaves the COMPOUNDING Guild
marker open longer while `kitAllowed` withholds special equipment at `debt > 0`. A change that
reads as prudence in the planner is a compounding-interest change in the economy.

---

## Part G — Standing owner-gated knobs

These are **design questions for the owner, not tuning knobs.** A task measures them and
reports; no task changes them without a recorded owner ruling.

**BR-50 — The 0.25 named-pool interceptor gate (`travel.ts`) and
`DISPOSITION_DECAY_INTERVAL_DAYS = 3`.** (T-125, re-affirmed T-150.) Measured twice, changed
neither time. **Ruled again 2026-08-03 as F-150-1 — DEFER; see BR-79.**

**BR-79 — Owner ruling, 2026-08-03 (at T-158): R1 (Combat's chosen `executeCombat` branch) —
DEFER. R2 (F-150-1) — DEFER.** Both are **deferrals**, not fixes and not accept-as-final: the
owner prioritised UI/visual-design iteration (T-186, T-188, T-189, T-190, T-191) first, and will
revisit both afterwards. Recorded here because a deferral with no stated reason decays into an
accepted state. The ruling is transcribed to five places that must stay in sync:
`ACKNOWLEDGED_COVERAGE_GAPS.fighter.owner` in `packages/sim/src/balance/coverage.ts`, the
`| Combat |` PARITY LEDGER row in `docs/NPC_REDESIGN.md`, the "Deliberately deferred" bullet in
`TASKS.md`, and both the STATUS line and the F-150-1 findings row in
`docs/HANGOUT_REDESIGN.md` §11.3.

**If F-150-1 is ever ruled "fix", it lands as a NEW TASK BLOCK — never as a constant edited
inline.** (T-158) Either constant BR-50 names — the `rng.next() < 0.25` named-pool gate in
`packages/engine/src/actions/travel.ts`, or `DISPOSITION_DECAY_INTERVAL_DAYS = 3` in
`packages/content/src/disposition.ts` — moves every disposition-reading system at once, and
therefore owes its own capstone. See TP-32.

**BR-51 — `RENOWN_DEED_THRESHOLDS.CONQUEROR = 38` must not be rescaled off a 120-day
capstone.** (T-148) It was sized off a 300-day measurement against a 44-deed slate and is
being read against a 120-day horizon and a 59-deed slate; only a 300-day arm may overrule
it. Report, do not retune. **MEASURED AT T-170 (2026-08-05) — CONFIRMED, NOT RETUNED, and
no owner ruling is needed because nothing is being asked to change.** The 300-day arm ran:
`docs/balance/baseline-t170-conqueror-300d.json`, 8 policies × 1,000 seeds × 300 days =
8,000 rows, the baseline of record's own fleet and seeds with `--days` the only variable
(`rulesFingerprint` `f264d7f4a2d56fde` and `instrumentFingerprint` `b8894cb6c678fce6` equal
on both arms, and the arm's day-120 milestone reproduces `baseline-t168-effective-band.json`
field-for-field on all eight policies). Against the 59-deed slate the `gambler` deedCount
median is **38** (p90 41, max 44, mean 37.858) with **579 of 1,000 reaching CONQUEROR** at a
median crossing day of **249** (out-of-tree probe, `runCampaign(seed, 300, 'gambler')`, seeds
1..120); all seven non-dice policies return **0 of 7,000**, the best of them (`smuggler`)
three deeds short at its maximum of 35. So 38 keeps six deeds of headroom below what the top
career banks, sits 7 above `GIGA_HERO = 31` with 418 of 1,000 careers stopping inside that
gap, and stays ≤ `DEEDS.length = 59` — T-1603b's derivation, reproduced from a fleet sweep
instead of two pinned deed-hunter seeds. `RENOWN_DEED_THRESHOLDS` was not touched; the only
source edit at T-170 is a provenance comment above `CONQUEROR: 38`. Full write-up:
`docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.12.

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

**BR-57 — An experiment that cannot move a row is a broken instrument, and the rig says so
itself.** (T-167, 2026-08-04) `assertVariantsPerturbEveryPolicy`
(`packages/sim/src/balance/gate.ts`) FAILS when a policy's aggregate is bit-for-bit identical to
the control across every variant that was supposed to perturb it. It is the check that would have
caught **F-151-9** — `docs/PLAYER-TRINKETS_SPEC.md` §2.3(b)'s `fighter` row reading 2,825cr in
all eight columns, found by a human reading a table.

- **Two limbs, because they blame different things.** A **dead arm** (a variant that moved no
  policy row at all) is a harness failure, reported under the *variant's* id and then **excluded
  from the live denominator** — leaving it in would manufacture one flat-policy violation per
  policy and bury the real finding under noise it caused. A **flat policy** is byte-identical to
  the control in *every* live variant.
- **All live arms, never a threshold.** A policy that moves under any one live arm is
  demonstrably sensitive. That quantifier is what keeps the false-positive rate at zero on a
  matrix like §2.3(b)'s, where `explorer`, `greedy`, `trader` and `veteran` are each flat under
  *some* arm and none of them is a defect.
- **Two live variants is the floor** (`SENSITIVITY_MIN_LIVE_VARIANTS`), and the reason is in the
  same matrix: under `guns_p1` the `explorer` policy sits at 16,847cr in both columns —
  identical, and entirely legitimate, because a GUNS bonus has no business moving a policy that
  never fights. Below the floor the predicate returns **no flatness verdict rather than a false
  one**, the discipline `checkExpectedEventRates` applies with `minSample`.
- **Bit-for-bit is `balance/diff.ts` at epsilon 0**, reused rather than re-implemented. That
  default is BR-era doctrine already: both sweeps are seeded and deterministic, so any tolerance
  would let a real regression hide under noise this instrument does not have. `diffAggregates`
  re-keys `byPolicy` by policy NAME (so a reordered `--policies` cannot break the comparison) and
  ignores `label` (load-bearing — two arms of one rig differ in their label by construction).
- **It is ARM-LEVEL, and therefore deliberately NOT in `runGate`.** A sweep has exactly one arm,
  so calling it there would be a check that can never fire. It is registered in
  `ARM_LEVEL_ASSERTIONS` and the kitchen-sink totality guard partitions on that registry — a
  partition on *signature*, not an exemption, and the price is a working fixture: the suite
  asserts every registered name is a real export, is disjoint from what `runGate` reaches, and
  actually fires on a seeded-bad arm set.
- **It is the standing exit check for T-174**, which owns the `fighter` defect itself. That task
  is done when this predicate returns zero violations over its fixed rig's arms — not when a
  median in a memo looks different.

**BR-58 — A merged aggregate stamps itself at write time, and a stamp is PROVENANCE, not a
measurement.** (T-183, 2026-08-04, closing F-142-1.) `packages/sim/src/balance/sweep.ts`'s
`--merge` calls `computeAggregateStamp()` (`packages/sim/src/balance/provenance.ts`) and writes
`rulesFingerprint` / `instrumentFingerprint` / `gitCommit` onto the `BaselineAggregate` before
the file hits disk. Before T-183 an aggregate had seven top-level keys and none of them was a
stamp, so `balance:report` over two committed aggregates rendered the loud "RULESET UNKNOWN FOR
ONE OR BOTH INPUTS" banner and could say nothing at all about whether the two arms had measured
the same game.

- **Stamped at WRITE time, unconditionally** — including a `--aggregate-out` into a scratch
  directory. A run whose provenance depends on where it was written is not provenance.
- **Computed in the IO half, carried by the pure half.** `aggregate()` takes the stamp as an
  optional third argument and writes it straight through; it never computes one. The fold is
  pure (no `fs`, no `process`, no clock) and a fingerprint is a walk of the working tree. The
  SHAPE lives in the hashed instrument file; the COMPUTATION does not.
- **The stamps join `IGNORED_PATHS` in `balance/diff.ts`**, for `label`'s reason one step on:
  they describe the measurement, never the game, and leaving them in would report three shape
  changes and `identical: false` for two runs that measured the identical thing — breaking the
  "NOTHING MOVED" verdict every inertness proof in this repo depends on. Ignoring them is not
  silent: `formatAggregateDiff` prints a provenance banner (`SAME RULESET` / `DIFFERENT
  RULESETS` / `RULESET UNKNOWN on one or both sides`) above the row summary, so the fact
  excluded from the table is not a fact lost.
- **`unknown` is still a state of its own.** The 40-odd `docs/balance/baseline-*.json` committed
  before T-183 are **not** rewritten: they were produced by trees that did not stamp, and writing
  a stamp into them now would forge provenance for a run nobody can re-derive — the class
  `docs/VERSIONING.md` forbids. They stay `unknown`, which is the honest verdict, and
  `--provenance` remains how a reader attributes stamps to one of them.
- **A devpanel-PROMOTED baseline inherits the stamps for free, with no devpanel change.**
  `assertPromotionTarget`/promotion in `packages/devpanel/src/runs.ts` copies a merged file
  verbatim, and the panel invokes the CLI rather than reimplementing it
  (`docs/DEV-CONTROL-PANEL_SPEC.md` §1). That is the constraint paying off rather than a
  coincidence.
- **Not stamped, deliberately:** `productVersion` and `saveSchemaVersion`. Only the two fields
  T-183's Accept names plus `instrumentFingerprint` (without which the report resolves a ruleset
  banner and still prints "Instrument version unknown", which half-answers the question). The
  report's `productVersion` column continues to read `unknown` for an aggregate; that is a
  follow-up, not this decision.

---

**BR-59 — The raised-ceiling measurement rides on `HangoutPlayStats`, on the report, and not
in a forked `.scratch/` probe.** (T-168, `docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.11.)

Three additive fields — `handsAboveBaseCeiling`, `handsAboveRaisedCeiling`, `maxSeedWager` —
folded from `DareHandStarted` in `accumulateMetricEvents`, carried onto `SeedRow.hangout` for
free by the whole-object copy `aggregate.ts` already does, and therefore answerable off any
sweep's own rows for the rest of the project's life.

**Why not a probe.** The T-173 note under BR-13 retires that lineage explicitly: four
measurements in a row (T-125, T-137, T-148, T-150) descended from a gitignored two-arm probe
*only because* the fields could not ride in on a capstone, and T-173 discharged that objection
for exactly this family of Hangout questions. A fifth fork would be a step backwards, and the
question here — "does any career ever stake above the port ceiling?" — is a **population**
question about the sweep's own 8,000 rows, which is the shape a probe is worst at.

**Why the fields land in the SAME commit as a capstone, which BR-13 normally forbids.** BR-13's
objection is that adding instrument fields moves `instrumentFingerprint` in the commit that takes
the capstone, so the fixture would record numbers measured under a different instrument. That
failure mode cannot occur here, for two reasons stated rather than assumed. First, T-168 moves
`rulesFingerprint` regardless — it adds `preHandWagerBand` to `packages/engine/src` — so a
capstone is owed by the rules change whether or not a field is added, and BR-12's "one capstone
per milestone" makes splitting it into two capstones the actual violation. Second, the outgoing
baseline **cannot** carry these fields under any ordering: they measure a behaviour
(`planDare` requesting above the tier-0 ceiling) that did not exist before this commit, so a
"measure first, then change" split would record three zeros and answer nothing. The honest
pre-fix column is *"structurally unmeasurable, and 0 by construction"*, and that is what §12.11
records.

**What they are NOT.** They are not a gate, a threshold or a target. Nothing asserts a bound on
them in `balance/gate.ts`; the only assertions are `> 0` existence proofs in
`campaign-smuggler-gambler.test.ts`, which is a claim about the instrument being wired, not
about the game being balanced.

---

## Part H — Harvested 2026-08-06 (T-164 … T-208)

**BR-80 — A test file under a hashed root's `__tests__` moves NO fingerprint and owes no
capstone.** (T-164, re-affirmed T-165, T-166, T-169, T-220.) `__tests__` is the first entry of
`HASHED_ROOT_IGNORED_DIRECTORIES` in `packages/sim/src/balance/rules-fingerprint.ts`,
`listTsFiles` consults it before `assertNoUndeclaredSubdirectory` fires, and
`packages/sim/src/__tests__/balance-rig.test.ts` pins that an ignored directory's contents are
not hashed. **Corollary, which is the trap:** a content or sim test must live under
`src/__tests__/` and nowhere else — a sibling `src/tests/` or `src/spec/` under a hashed root
throws by design, because the escape hatch is the NAMED `__tests__` entry, not a general
exemption for test-looking directory names.

**BR-81 — Documentation-consistency and fixture-integrity checks live under
`packages/sim/src/__tests__/`, NEVER under `packages/sim/src/balance/`.** (T-165, T-166.) Every
module under `balance/` is a hashed instrument source or a classified non-instrument, so a
pointer-consistency or re-extraction check placed there would move `instrumentFingerprint` and
stale the very fixture it verifies — owing a re-extraction just to check re-extractions.

**BR-82 — The baseline of record has FIVE pointer sites, not four, and the count is read from
the test rather than from any task block.** (T-165, re-confirmed T-173, T-195, T-204, T-206.)
The five are `BASELINE_OF_RECORD_PATH` in `packages/sim/src/__tests__/balance-targets.test.ts`
(the only site a test reads at RUNTIME, and therefore the authority all others are checked
against), `docs/NPC_REDESIGN.md` ×2 including the status banner, `docs/balance/smoke/README.md`,
and BR-14's own sentence in this file — the fifth added at T-182, after the "four-site" phrasing
was written. T-188, T-195 and T-199 each re-pinned while moving only some of the five, and all
three lagging sites were still stale when T-165 arrived. `packages/sim/src/__tests__/
baseline-pointers.test.ts` enumerates them and fails on any disagreement; when new docs prose
trips its totality pass, the prose is REWORDED out of pointer shape, never added to
`ACKNOWLEDGED_NON_POINTERS` (T-202).

**BR-83 — The allowed diff set for a re-extraction of `docs/balance/smoke/tiers.json` is FOUR
JSON paths:** `productVersion`, `rulesFingerprint`, `docsFingerprint`, `provenance.gitCommit`.
(T-166, correcting §6 of `docs/BALANCE-TELEMETRY_SPEC.md` and BR-8.) Not "`rulesFingerprint`
only" (the original claim, transcribed from a summary instead of read off commit `3468ef5f`) and
not "fingerprints + `provenance`" (the 2026-08-01 reword, still one field short because
`productVersion` is neither). Everything else, including the whole `checkpoints` array and
`saveSchemaVersion`, is byte-identical.

**BR-84 — No escape hatch on `packages/sim/src/__tests__/smoke-reextraction.test.ts`.** (T-166.)
If its section 1 goes red, a doc no longer describes the precedent it cites — repair §6 and BR-8;
never edit the expectation and never widen `MUTABLE_FIXTURE_FIELDS` so a field stops being
reported, which is the same move as widening a balance band to clear a gate. If section 2 goes
red, the remedy is a re-extraction (BR-9), never a hand edit of the fixture. Ownership is narrow
by design: the file owns only "when a re-extraction happens, did anything move that isn't allowed
to" — `fixtureFreshness` in `balance-smoke.test.ts` still owns staleness.

**BR-85 — A cross-arm sweep violation carries the `CROSS_ARM_SEED = -1` sentinel and
`day: null`,** because `0` is a legal seed and so cannot mean "no seed".
(T-167, `packages/sim/src/balance/gate.ts:671`.) Widening `SweepViolation.seed` to
`number | null` was explicitly REJECTED: `formatGateReport` and the committed `gate-*.json`
shape both read `seed` as a number, so the nullable type would have broken the printed table and
the committed fixtures.

**BR-86 — `planDare`'s stake floor `Math.max(1, preHandWagerBand(state).min)` is a POLICY choice
of the INSTRUMENT, not a game rule.** (T-168.) §4.8 removes the band's FLOOR at tier 5, so a raw
`band.min` of 0 would seat FREE hands and drag `expectedValuePerDare` toward 0; the identical
expression is re-derived — not weakened — at `campaign-smuggler-gambler.test.ts:508`. Correction
shipped with it: `GAMBLER_RESERVE`'s "larger than a full day of dares (2 × 1,000)" is FALSE past
tier 4; what bounds exposure there is `GAMBLER_BANKROLL_FRACTION` plus the resolver's solvency
clamp.

**BR-87 — A "before" column for a newly added measurement field is a MEASURED CONTROL ARM, not a
construction argument, whenever the pre-fix code can be re-run.** (T-168.) T-168 re-ran the
one-line pre-fix `planDare` over the IDENTICAL 1,000 seeds × 120 days with the new fields present
and got 0 and 0 measured, rather than asserting 0 by construction. **BR-59 is reconciled to this
stronger wording** — its "structurally unmeasurable, and 0 by construction" clause is superseded,
and `docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.11.0 is the record.

**BR-88 — A comment-only edit to a hashed rule or instrument source, plus a new assertion under
`__tests__`, owes NO fingerprint move, no capstone and no sweep.** (T-169, applied at T-177,
T-219.) `hashSemantic` strips comments before hashing
(`rules-fingerprint.ts:11-17`), `HASHED_ROOT_IGNORED_DIRECTORIES.__tests__` excludes test files,
and the raw-byte `docsFingerprint` is reported but never fails. The claim is still shown, never
argued: read `computeRulesFingerprint(repoRoot)` at HEAD before and after the edit and print both
(T-177: `cabd2112ccf4cefb` both times), then run `npm run balance:smoke`.

**BR-89 — A horizon-only differential arm is proved single-variable by EVIDENCE, not by
argument.** (T-170.) Both arms must carry equal `rulesFingerprint` / `instrumentFingerprint`
(also recomputed from the tree at the commit) AND the overlapping milestone day must reproduce
field-for-field — T-170's `milestones[day=120]` sample (`playerDeedCount`, `playerCredits`,
`playerDebt`, `playerFuel`, `playerTier`) equalled `baseline-t168-effective-band.json` on all
eight policies. Only that licenses attributing 100% of the difference to `--days`.

**BR-90 — A DIAGNOSTIC arm at a non-standard horizon does not re-pin the baseline of record and
never has `balance:extract` run against it.** (T-170.) Re-cutting smoke fixtures off a 300-day
arm is the F-146-0 class of error. The BR-82 pointers stayed put and `baseline-pointers.test.ts`
stayed green through T-170.

**BR-91 — `MAX_TRACKED_DEED = 5` and the `SeedRow` shape stay as authored even when a measurement
wants a number they do not carry.** (T-170.) Raising either moves `instrumentFingerprint` and
stales every smoke fixture, while an out-of-tree probe (`runCampaign(seed, 300, 'gambler')`
reading `daily[].deedsEarned` / `daily[].renownRank`) buys the same number for nothing.

**BR-92 — Instrument first, then the rule — and instrument inertness is proved by ROWS, not by a
hash.** (T-175, extended T-176.) Adding optional event fields moves `rulesFingerprint` even when
nothing behaves differently, so the proof is `campaign-degraded.test.ts`'s stripped-fingerprint
entries coming back BYTE-IDENTICAL to the previous entry for all seven policies, `gambler`
included. Corollary: a before/after table only attributes to the RULE if the control arm is
re-run on the FINAL instrument. When sim-only report keys are added, re-pin the degraded
fingerprints in the same change and record the ledger entry proving the strip-the-new-keys
recovery BEFORE any number from the new instrument is argued from.

**BR-93 — A large capstone row move that is the intended consequence of a measured fix is the
FINDING, not a regression to absorb.** (T-175.) `gambler.finalCredits.median` 115,612 → 63,653
(−44.9%), `tourOneClearRate` 0.9610 → 0.9360, `deedCount.median` 28 → 25 were reported against
the written pre-run prediction (exactly two moved rows, `gambler` and `fleet`), nothing was tuned
in response, no band, threshold or golden was edited, and the one SHAPE CHANGE was reported
rather than suppressed.

**BR-94 — §17.3's git-worktree bakeoff rig is NOT usable when an arm must be measured with an
instrument that is not yet committed.** (T-176.) A worktree checks out a commit and would measure
a tree with no instrument in it. Single-variableness is then evidenced three checkable ways
instead: identical seeds on both arms, a `git diff` verified to be exactly one hunk, and stamp
confirmation (differing `rulesFingerprint`, identical `instrumentFingerprint`).

**BR-95 — A bakeoff arm that is not adopted as the baseline of record writes its aggregate to
`.scratch/`, not `docs/balance/`, and the baseline is NOT re-pinned when no measured number
moved.** (T-176.) Clearing instrument-fingerprint staleness on `docs/balance/smoke/tiers.json`
takes T-173's cheap path instead: `npm run format` BEFORE extraction, then
`npm run balance:extract -- --aggregate <the current baseline of record>`, with that path re-read
live from `BASELINE_OF_RECORD_PATH` in `balance-targets.test.ts`.

**BR-96 — A finding's own quoted numbers are re-measured on HEAD before they are argued from.**
(T-219.) T-219's headline "+52.62 modelled vs −53.26 realised at six dice" was measured by T-175
on its pre-`probClaimTrue` control arm; `probClaimTrue` changed which decisions ever reach a
raise, so the raise population differed and the sign had reversed on HEAD (per-raise gap −126.99
/ −84.81 / −47.34, SE ≈ 1.2). Numbers measured on a superseded arm may not be quoted.

**BR-97 — A bakeoff control that RESTATES a shipped decision function is proven EQUAL to it
before any arm is scored.** (T-219, extending BR-20 from hand-rolled ablation loops to bakeoff
controls.) T-219 cross-checked its restated `optimal` against the shipped
`archetypeMove({archetype:'optimal'})` over 1,200,000 randomised states at all three widths on
move kind, quantity and face — zero mismatches. A drifted restatement scores every arm against a
straw control, which is F-175-1's premise.

**BR-98 — Probe-sourced per-task numbers do not earn a shipped-instrument field.** (T-219.)
T-219 declined to add a per-raise field to `dareCells`: `dareCells` already answers the ordering
and win-rate questions, and moving `instrumentFingerprint` inside a MEASUREMENT task is §16.2's
banned third shape. T-175's calibration table is the precedent for keeping such numbers in a
scratch probe.

**BR-99 — A Phase-0 single-policy DIAGNOSTIC arm is legitimately shards-only — no `--merge` and
no `--aggregate`.** (T-219 §19.9, T-220 §20.0.) The standing 8,000-row / `--merge` / `--aggregate`
constraint governs the CAPSTONE sweep, which is owed only when `rulesFingerprint` moves. Both
precedents ran as `--policies gambler --seeds 1600 --days 120` over four 1-indexed shards.

**BR-100 — A test-only + docs-only task moves NO fingerprint and owes no capstone, no re-extract
and no baseline re-pin — INCLUDING `docsFingerprint`.** (T-220, verified live: `rulesFingerprint`
`cabd2112ccf4cefb`, `instrumentFingerprint` `2d6d1990eaf13031`, `docsFingerprint`
`265aea1d09f0d485`, `CURRENT_SAVE_VERSION` 17, all unmoved.) `__tests__` is in
`HASHED_ROOT_IGNORED_DIRECTORIES` and is not in `SIM_INSTRUMENT_DIRECTORIES` (`['', 'balance']`),
and — against its name — `computeDocsFingerprint` hashes the raw bytes of the rule and instrument
SOURCES, comments included, and never reads `docs/**`.

**BR-101 — UI-only work owes NO capstone and NO fingerprint move.** (T-221, confirming BR-69;
also T-189, T-201, T-203.) `computeRulesFingerprint` hashes `packages/engine/src` rule modules
plus `packages/content/src`; `computeInstrumentFingerprint` hashes `packages/sim/src`;
`packages/ui` appears in neither set. A task confined to `packages/ui` + `docs` closes with
`rulesFingerprint` UNMOVED, an empty `git diff --stat -- packages/engine/src packages/content/src`
and `balance-smoke.test.ts`'s "is not stale" assertion green. **This is a fact about the hash's
scope, not a licence to reach into the engine without a capstone.** Corollary (T-189):
hand-authored UI geometry such as `SHIP_DIAGRAM_GEOMETRY` lives in `packages/ui/src/format.ts` —
putting a drawing's coordinates in content would stale every balance fixture for a picture.

**BR-102 — An instrument-only move — a widening, a new aggregate field, a sweep-side edit — owes
NO baseline re-pin.** (T-173, re-affirmed T-183; the corollary to BR-10's "no capstone".) The
baseline of record does not move for an instrument change; the obligation actually discharged is
that all five BR-82 pointers still AGREE. T-173's Accept asking for a "four-site baseline re-pin"
was wrong twice over — the sites have been FIVE since T-182, and a non-capstone owes none of them
a move.

**BR-103 — A docs block describing an instrument move deliberately AVOIDS the phrases
`BASELINE OF RECORD RE-PINNED AT T-` and `Baseline of record is`.** (T-173.) Otherwise it
masquerades as a sixth pointer or a newer re-pin; a T-173 banner ahead of T-199's would fail the
banner-ordering check and would be a false claim.

**BR-104 — All Hangout/disposition measurement stays inside `packages/sim`.** (T-173.) Putting
the named pool or the standing onto `EncounterStarted` was REJECTED because it moves
`rulesFingerprint`, which an instrument commit is forbidden to move; interceptor provenance rides
on `CombatEncounterRecord` (`interceptorId`, `interceptorSource`, `interceptorDisposition`,
`namedPoolDispositions`, `namedPoolReconstructed`) instead.

**BR-105 — The instrument records the RAW pool, never a derived weight.** (T-173.)
`namedPoolDispositions` carries the pool itself because `chooseWeighted`'s formula must not be
duplicated in the instrument, and `namedPoolReconstructed` is a COUNTED field rather than a
footnote, so `selectEncounterInterceptor`'s band-widening branch is measured rather than assumed.

**BR-106 — New aggregate fields are `?? []`-guarded and additive-only, so `sweep --merge` over a
shard written by an older instrument cannot crash.** (T-173,
`MilestoneAggregate.npcDisposition`, `MilestoneAggregate.npcNonzeroDispositionShare`.)

**BR-107 — BR-19's "each arm gets its OWN `node_modules`" has exactly one narrow exception.**
(T-173.) A BEFORE `git worktree` may share the root `node_modules` only when `diff -r` proves
`packages/engine/src` and `packages/content/src` byte-identical between the arms AND the sweep
entry point imports its sim sources by relative path, so the arms differ in `packages/sim` alone.
Outside those two conditions the shared-`node_modules` trap stands.

**BR-108 — Editing `packages/sim/src/balance/sweep.ts` does NOT move `instrumentFingerprint`.**
(T-183.) It is named in `SIM_NON_INSTRUMENT_SOURCES` ("The I/O half of the sweep"), so `collect()`
skips it; `report-model.ts`, `report-html.ts`, `diff.ts`, `smoke-extract.ts`, `provenance.ts` and
`rules-fingerprint.ts` are non-instrument for the same reason. What moved the hash at T-183 was
the `BaselineAggregate` TYPE change in `aggregate.ts`. Any future task planned on "touching
sweep.ts costs a capstone / re-extract" is planning against a constraint that does not exist.

**BR-109 — A field that describes the MEASUREMENT rather than the game joins `IGNORED_PATHS` in
`balance/diff.ts` in the same commit that adds it, and the ignoring is made NON-SILENT.** (T-183,
for `rulesFingerprint` / `instrumentFingerprint` / `gitCommit` on `BaselineAggregate`.)
`diffAggregates` flattens the whole object, so without the ignore a stamped-vs-committed diff
reports three `SHAPE CHANGES` and `identical: false` for two runs that measured the identical
thing, breaking the "NOTHING MOVED" verdict every inertness proof depends on. Non-silence is
supplied by `formatAggregateDiff`'s SAME RULESET / DIFFERENT RULESETS / RULESET UNKNOWN banner.
Where the new field is OPTIONAL, its omitted case is proved byte-identical rather than argued —
deep-equality, `JSON.stringify` equality and key ABSENCE — because `?? undefined` writes a key.

**BR-110 — The travel die may only ever grant a MONOTONIC BENEFIT — no check, no DC, no fail
state.** (T-195, owner-ruled.) That is what makes T-1605's invariant ("an ordinary jump with fuel
always arrives") hold by construction rather than by discipline. The rejected alternative — a real
per-jump Pilot check with a margin-scaled fuel penalty capped at 25% of the jump's cost — measured
SAFE-LOOKING per jump but raised fleet-wide `fuelStarvationDays.mean` 278% over a 200-seed/60-day
sweep, reproducing exactly the stranding risk T-1605 removed, spread across a career instead of
concentrated in one hard failure. The pure fuel discount measured safe (ships lost −43%, no new
failure mode) because it can only ever help.

**BR-111 — The shipped travel-die magnitudes are `NAV_DIE_FUEL_DISCOUNT_MAX = 0.15` and
`NAV_DIE_EVASION_MAX = 0.2`,** both linear from nat 1 (no effect) to nat 20, applied by
`resolveTravel` to ORDINARY jumps only. (T-195, `packages/engine/src/actions/travel.ts:128-129`.)
The Nemesis crossing is excluded and keeps its own quoted burn (`quoteCrossingStake`) and its own
real check. `generateEncounter`'s new `die` parameter defaults to 1 (`navDieEvasionFactor(1) === 1`)
so every caller that does not pass one stays byte-identical. **The "if these read as too strong
once played" follow-up is CLOSED, not open:** T-198's owner ruling R1 named both constants as
candidate levers and answered accept-as-is. Do not re-open them without new play evidence.

**BR-112 — When a rules easing turns seeded regression tests red, fix the tests PROPERLY.**
(T-195, three worked examples, under BR-17.) `campaign-degraded.test.ts`'s seven
`PINNED_FINGERPRINTS` were re-derived TOGETHER as one shared cause documented once, not one by
one. `campaign-reach.test.ts`'s hull-reachability sample was WIDENED 6 → 20 seeds and NOT
re-thresholded — at 6 seeds the eased economy produced a coincidental 6-for-6, at 20 the true rate
is 16/20, still "reachable, not free" — so that sample must not be shrunk back.
`campaign-policies.test.ts`'s `FIGHTER_METRIC_SEED` was re-pinned 1 → 2 via the
sweep-for-a-qualifying-seed convention that file already uses twice.

**BR-113 — An engine-rules easing and the instruments' EXPLOITATION of it take SEPARATE capstone
arms.** (T-196a / T-196b, following N13's control-arm pattern.) T-196a's arm deliberately left the
sim policies' die budgets, the protocol enumerator's `spendDie` advertising and the UI's armed-die
gating untouched — each marked in place with the task that owns it — so the arm measures "rules
eased, instruments not yet exploiting", and T-196b's arm measures the exploitation. Predict which
side moves BEFORE the run: `npc.ts` imports only `applyShipyardMutation`, `quoteShipyard` and
travel helpers, never the resolvers, so NPC rows were correctly predicted near-still
(`fleet.npcSpecialEquipmentPurchasesPerRun` 44.1695 → 44.2002).

**BR-114 — Task ids are NOT monotonic in time in this repo, so no check may use a numeric or
lexical PROXY for recency.** (T-196a; T-196a re-pins AFTER T-199, and `TASKS.md` sequences T-199
first.) `baseline-pointers.test.ts`'s banner-ordering check asserts the PROPERTY directly — the
FIRST re-pin block in file order must name the baseline the authoritative pointer names — which is
strictly stronger and assumes no numbering scheme.

**BR-115 — Sim policy planners in `packages/sim/src/index.ts` are bounded by their REAL bounds —
a running `committed` / `yardCommitted` credit total, board size, tank, berths — never by die
scarcity.** (T-196b.) `planRefuel`, `planCrippledRepair`, `planCaptainOverhead`,
`planFighterUpgrade` and `planSpecialEquipment` lost their `DieLedger` outright: the hand was only
ever standing in for the credit bound, so the throttle it silently supplied must be re-supplied
explicitly. Where a loop sweeps once per die, the bound is charged PER ITERATION —
`sweepReplacement` charges each queued sweep the credits its `EXPLORATION_FUEL_COST` will cost to
replace at the local depot price, in BOTH the smuggler's and the explorer's loops, which T-199
keeps byte-identical.

**BR-116 — REJECTED on measurement, recorded so it is not re-tried: a nav gate on
`planHomewardBurn` (mirroring `smugglerPolicy`'s `navBeatable`) as the fix for the F-196b-1
smuggler stalls.** (T-196b.) It changed neither seed 42's nor seed 216's streak — the
tank-emptying jumps on seed 42's days 62 and 64 were INTERDICTIONS, not failed pilot checks — so
it was reverted rather than kept as an unmotivated shared-planner change.

**BR-117 — An instrument-only arm must leave `rulesFingerprint` UNMOVED and move only
`instrumentFingerprint`;** that pairing is what attributes the measured delta to the instruments
rather than to the engine or content. (T-196b: `55414694d7187afc` unmoved,
`6106da3575355153` → `812d9e87d7307f3c`.)

**BR-118 — Measured value of freeing the administrative nine (8,000 rows, 1,000 seeds × 120 days
× 8 policies).** (T-196b.) SEVEN of eight policy rows move, with `greedy` the deliberate unmoved
control. Fleet `tourOneClearRate` 0.6305 → 0.63425 and fleet median credits 49,517 → 49,839, but
the fleet rise is carried almost entirely by the `fighter` (+37,120 median credits, clear rate
0.499 → 0.603, `fuelStarvationDays` 0.385 → 0.146) — the only row running a three-planner shopping
chain on top of a sign→travel and a combat, i.e. the row that paid the largest die tax. FIVE of
the seven moved rows FALL on median credits (`smuggler` −2,073, `explorer` −1,642, `trader` −518,
`trader-degraded` −382, `gambler` −355) because `planCaptainOverhead` lost its die throttle. Cost
side: ships lost 465 → 487 (+4.7%); `debtClearedRate` 0.7395 → 0.7581. Nothing was tuned in
response.

**BR-119 — A stale seed pin is RE-DERIVED from a widened sweep, never edited to fit; and where a
BAR itself widens, it is called out and justified against its own DELETED-BRANCH control.**
(T-196b.) `FIGHTER_METRIC_SEED` 2 → 6; `campaign-smuggler-gambler.test.ts` gained a SEPARATE
`SMUGGLER_ENFORCEMENT_SEED = 2` rather than moving the shared `REPORT_SEED` out from under the
file's other assertions. `sweep-gate.test.ts`'s veteran bar 10 → 12 runs against BR-17's "widen
the sample, never the threshold", so it carries its justification: seed 91 goes 5 → 12 while the
other eight of those nine seeds IMPROVE, which is what says the bar tracks a real re-phasing
rather than absorbing a regression.

**BR-120 — A byte-identical capstone diff is a verdict only when the instrument CAN exhibit the
change; otherwise it is an INSTRUMENT-GAP NULL RESULT and is reported as "inert to this
instrument", never as "the ruling is safe".** (T-202, the second such case after T-198's Insult
null result.) The sim's gambler is bounded at `GAMBLER_MAX_DARES_PER_DAY = 2`, below the ruled
`[1,2,3,4,5,6]` ceiling, so the sweep could not exhibit R3 at all.

**BR-121 — A frozen pre-session brief is never retro-edited to accommodate a later capstone.**
(T-202, upheld T-204 and T-206.) `pacing-brief-figures.test.ts`'s `ARC_BASELINES` deliberately
stays at SIX: every row in it must appear in the frozen 2026-08-05 pre-session brief, so adding
`baseline-t202-liars-dice-ceiling.json` (or t204's, or t206's) would force an edit to the brief
itself. A new capstone baseline is added to the five BR-82 pointer sites and to nothing else. The
reason is recorded in-file and at `docs/DAWN-HAND-REDESIGN.md:154`.

**BR-122 — A pure-PROSE content pass still owes a FULL capstone, because content is hashed
wholesale into `rulesFingerprint` — but the PREDICTION is FLAT.** (T-206, which moved
`6635ee318436f99f` → `cbb087860825aa35`.) `balance:diff` must print `NOTHING MOVED`. A moved
`outcomeHash` or a moved row would mean something consumes the profile object wholesale — that is
a finding to file and escalate, never a reason to re-baseline.

**BR-123 — After an intentional rule change, BOTH goldens are regenerated through their committed
regenerators, never hand-edited, and the check that the regeneration was LEGITIMATE is that the
DICE did not move.** (T-208, following the T-156 precedent.)
`fixtures/day-loop-golden.ts` via `gen-day-loop-golden.ts`, `sim/fixtures/replay-golden.ts` via
`gen-golden.ts`; all three replay session `rngState`s stayed 364866002 / 268015010 / −1231248819,
verified against `git show HEAD:`. A quest captain takes no turn, so relocating one cannot consume
a roll — a moved `rngState` would have meant the task perturbed the simulation itself.

**BR-124 — Freeing die costs on administrative verbs moves ONLY the policies that queue
`Explore`.** (T-196a; the mechanism is recorded in full at `docs/EXPLORE-DECISIONS.md` EX-27.)
Exactly two of eight policy rows moved — `explorer` and `smuggler` — and the other six came back
byte-identical on every headline metric. Predict die-budget changes to move Explore-queuing
policies only, and cross-check on an independent sample via `campaign-degraded.test.ts`'s
`PINNED_FINGERPRINTS`.
