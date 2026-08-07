# Task Process — standing rulings

**Status:** Standing decisions for how work is scoped, accepted and escalated in this
repository, harvested 2026-08-02 from the 0.5.2/0.5.3 task log. Companion to
`docs/ENGINEERING-POLICY.md` §1 (the standing constraints) and §2 (the gate), and to
`docs/VERSIONING.md` (what a version advance and a tag mean).

These rulings are about the *shape of a task*, not about any subsystem. They are the
answers to "may I do this here?", and they were all bought with a defect.

---

## 1. Task scope

**TP-1 — A SPEC task modifies zero source files.** (T-100, T-101; held by T-134, T-144 and
every later spec task) The deliverable is the document; no engine, content, sim or UI file
is touched. The boundary is stated in the task's own Accept criteria, never left implicit,
and is verified with a `git diff` showing only `TASKS.md` plus the new doc.

**TP-2 — A CONTENT pass carries zero lines under `packages/engine/src` outside
`__tests__`.** (T-117, T-123, T-124) Verified with
`git diff --stat packages/engine/src -- ':!**/__tests__/**'`. Engine changes get an owner
other than the content pass. A content pass also does not tune to produce a simulation
result, and does not tune in response to one.

**TP-3 — A MEASUREMENT/capstone task changes zero source lines but the baseline re-pin
path string.** (T-116, T-137, T-148) See `docs/BALANCE-RIG-DECISIONS.md` Part B/C for the
full form.

**TP-4 — A MECHANISM task does not fix the bug its mechanism finds.** (T-152) T-152's gate
caught `fighterPolicy` idling up to 32 consecutive days on its first run and deliberately
left it unfixed — the fix touches a hashed instrument source reserved by the standing
constraints — so the CI job was allowed to land red behind a dated KNOWN-RED note and the
fix shipped as its own task (T-159).

**TP-5 — A spec CROSS-CHECK task re-analyses no design, edits neither spec, opens no new
design question and touches no source file.** (T-102) Corrections exist only as numbered
directives in the review doc, carried forward to the owning downstream task.

**TP-6 — A sim-policy change and the capstone it would invalidate never land in the same
commit.** (T-116, T-150) T-116 filed F-116-1 rather than fixing it, for exactly this reason;
it was discharged by T-150, a task explicitly allowed to move policy fingerprints. A fix
whose blast radius would move *every* policy's fingerprint may not be smuggled into a
containment-scoped task that also takes a capstone.

**TP-7 — An engine scene change and the sim path that plays it land in the SAME task.**
(T-135) The sweeps are part of that task's gate; shipping a scene-opening engine while
leaving the sim queuing the old one-shot action for a follow-up was ruled out.

**TP-8 — Two tasks land in ONE commit when splitting them would regenerate the same
fixtures twice.** (T-117 / F-117-A) Two golden regenerations and two ledger entries for one
behaviour change is exactly the fixture churn the standing constraints exist to prevent.
The combination is recorded, not dressed up: the fixture ledger entry names BOTH mechanisms
and the reviewer reads both Accept clauses against one diff.

**TP-9 — Reach and content authoring are kept separable.** (T-121) T-121's placeholder rows
carried `systemId` and `prose` only, so every number resolved to the default. That inertness
is the precondition that lets a moved golden be attributed to reach rather than to tuning; a
reach change that also tunes numbers cannot be measured.

**TP-10 — An arithmetically inert guard may land while it is PROVABLY inert, with a comment
saying so and a hash proving it.** (T-121, T-123)

---

## 2. Acceptance criteria and amendment

**TP-11 — A task may not amend its own Accept clause in the same commit as the work being
judged.** (T-115 / F-115-A, T-117 / F-117-A) When two Accept clauses cannot both hold, the
fix is a NEW task with its own Accept clause; the original clause is restored verbatim. The
precedents that amend the DESIGN SPEC (F-113-A, F-114-A) do not license amending a bar.

**TP-12 — A task may not grade a miss against its own Accept clause.** (T-157) The Bug
Discovery Policy's deferral rule governs a bug found along the way, not an unmet acceptance
criterion of the task itself. The correct move is to halt under the `[BLOCKED BY = ...]`
convention and let the owner rule. An Accept clause is corrected only by a dated,
owner-signed amendment left *above* the original text — never edited down to match what
shipped.

**TP-13 — A coder may not rule on its own deviation from a settled Accept criterion, even
when the argument is sound. Soundness is not authority.** (T-140) The run halts after one
fix round and escalates. Fix rounds 2 and 3 deliberately changed ZERO hashed bytes so the
owner ruled against the same numbers the review saw.

**TP-14 — When a review's only `pass=false` input is an owner-gated clause, further fix
rounds are not scheduled — they cannot converge.** (T-157) T-157's round 3 re-verified every
code-side claim, found zero defects, and its entire diff was one dated paragraph in
`TASKS.md`.

**TP-15 — When the owner has already ruled a load-bearing design question, the specifying
task implements the ruled option and does not re-open it** — and if a ruled option proves
unworkable the task FAILS with the reason rather than quietly documenting an alternative.
(T-100)

---

## 3. Correcting documents

**TP-16 — When a spec contradicts itself, resolve in the direction the majority of the
document agrees on and correct the spec IN PLACE.** (T-113, T-114 / F-114-A) The rejected
alternative — authoring zero rows so the Accept clause is vacuously true — is
metric-gaming. Amending the design spec is legitimate; amending a task's own Accept clause
is not (TP-11).

**TP-17 — Deviations from an authored spec table are annotated in place, not absorbed
silently.** (T-123) T-123 annotated `docs/HANGOUT_REDESIGN.md` §6.3's rows with what shipped
plus a block recording three deviations and why each was graded differently.

**TP-18 — A comment that asserts an invariant is updated in the SAME commit that falsifies
it.** (T-102) A comment that lies is a defect, not a follow-up.

**TP-19 — A new system's spec is a NEW document, not an appendix behind a closed capstone.**
(T-144) `docs/LIARS-DICE-PROGRESSION_SPEC.md` was split out rather than appended as a §17 to
a doc that closes on a dated §16 capstone; the parent got a short cross-reference addendum
and its capstone stayed untouched.

**TP-28 — A Delivered note found to be FALSE is corrected by an appended, dated CORRECTION
naming the finding; the wrong sentence is left standing.** (T-154 / F-155-3) It is not
rewritten and not deleted. The grounds: a Delivered note describing something that is not in
the tree is exactly the drift class the task file's audits exist to catch, so erasing it
erases the evidence that the drift happened. This is the delivery-note analogue of TP-12's
rule for Accept clauses — the correction goes *beside* the original text, never *over* it.

---

## 4. Refactors, deletions and deferred defects

**TP-20 — A refactor claimed behaviour-preserving is EVIDENCED, and the evidence is authored
BEFORE any line moves.** (T-110) A parity test pinning the whole per-seed result to a sha256
stamped from the pre-refactor tree, authored and run green against `main` first; plus a
zero-line diff on the pre-existing test file and byte-identical goldens, stated explicitly in
the commit body (the N3 precedent).

**TP-21 — When a rule is deleted, every test asserting it is REWRITTEN to the new contract —
never deleted, never lowered — and the sweep includes the e2e specs, not just engine and sim
tests.** (T-112 / F-112-D) Corollaries: pin the claim, not the casting (literal cast names
now resolve through the shipped cast, so a re-cast is not a regression); and re-derive a
broken fixture by sweeping seeds offline rather than re-anchoring a seed to dodge an
outcome.

**TP-22 — A pinned assertion whose subject is deleted is RETARGETED, not deleted.** (T-113)
Keep the claim that mattered and re-point it at the surviving mechanism; where the set went
to zero, the tripwire was kept and its claim flipped to `expect(legacy).toEqual([])`.

**TP-23 — A defect that is knowingly deferred is pinned by an explicit tripwire test
asserting the CURRENT wrong behaviour**, so it cannot be closed silently; whoever fixes it
deletes the tripwire deliberately in the same change. (T-150 / F-150-2)

**TP-24 — A red e2e spec whose cause is a design defect is escalated as a named task, never
made green by pre-seeding fixtures around it.** (T-122) T-122 left three onboarding specs
red rather than pre-seed the prompt, because that would have turned the specs green while
leaving the coach dark for real players.

**TP-25 — Measurement that a hook task is not chartered for is held out on purpose.**
(T-147) A threshold rescale mid-milestone is not a hook task's business; measurement stays
in its own capstone task.

**TP-29 — A defect found mid-task whose fix moves `rulesFingerprint` does NOT ride along in
the capstone commit.** (T-156, on F-156-1, deferred to T-182) It is filed as its own task with
its own inert-extraction commit, golden regeneration and capstone. The reason is attribution,
not tidiness: `dice.ts` sits inside `ENGINE_RULE_DIRECTORIES['']`, so folding the fix in would
put two rule changes under one capstone and make N13's variance decomposition unattributable —
the exact confound N4's control arm exists to prevent. The deferral still owes the written
both-limbs risk analysis on the RECEIVING task, per the Bug Discovery Policy; a fingerprint
argument buys the split, it does not buy silence.

**TP-32 — A deferred defect whose fix would move a WIDE-BLAST constant comes back as its own
task block, never as an inline constant edit inside whatever task next touches the area.**
(T-158, on F-150-1; the ruling itself is BR-79.) Either constant BR-50 names — the
`rng.next() < 0.25` named-pool interceptor gate in `packages/engine/src/actions/travel.ts`, or
`DISPOSITION_DECAY_INTERVAL_DAYS = 3` in `packages/content/src/disposition.ts` — moves every
disposition-reading system at once and therefore owes its own capstone (BR-61). This is TP-29's
rule stated forward rather than in hindsight: the size of the blast radius is known at deferral
time, so the shape of the eventual fix is decided at deferral time too, before anyone is standing
in the file with a one-line change in front of them.

---

## 5. Versioning ceremony

**TP-26 — No version advance and no tag while the track's own findings are open.** (Owner
ruling, T-130 gate 2026-07-31.) Its condition was met on 2026-08-02 and the manifest moved
to 0.5.3; a tag is still withheld because a tag is a stage marker cut by the ceremony, and
the first (`alpha`) waits on the UAT pass per `docs/VERSIONING.md`'s stage table.

**TP-27 — A new private workspace declares no `version`.** (T-143) Exactly one workspace
declares a version in `package-lock.json`; a private, never-published dev tool has no
product version to state. When a repo-wide invariant test fires on a new file, remove the
offending declaration rather than loosening the invariant.

---

## 6. Sequencing in `TASKS.md`

**TP-30 — Sequencing lives in BOTH the `after:` field and the block's POSITION in file
order.** (T-154) The orchestrator picks the first eligible TODO in file order, so a
resequencing recorded only in `after:` is inert, and a gate stated only in prose is not a gate
at all. T-154's split was dead until the block was physically moved above T-158, and T-155's
`after:` was corrected to name T-158 explicitly rather than lean on T-154's prose note. A build
block is never moved back below a halting `[BLOCKED BY = Human UAT]` block.

**TP-31 — A prioritization argument constrains the RUN task, not the BUILD task.** (T-154) A
predecessor belongs in `after:` only when the task's own Accept criteria reference something
that predecessor PRODUCES. "Run the pilot after the first human UAT" is an argument about when
results are worth having, not about what the builder needs: T-154 (build) stayed at
`after: T-130` while T-155 (run) took `after: T-154, T-158`, because neither Accept clause
referenced anything T-158 produces. Over-gating a build task on a human-blocked predecessor
stalls work that could have shipped.

---

## 7. Harvested 2026-08-06 (T-166 … T-204)

**TP-33 — When a delivered task finds its own block's framing wrong, the correction is RECORDED
BESIDE the original wording, never silently substituted.** (T-173, reused by name at T-183, T-202,
T-204, T-208.) T-173 recorded two — a stale baseline path and a stale re-pin site count. The same
discipline governs documents: when a doc claim about a precedent commit is found wrong, correct
the LIVE claim but leave the historical misquotes intact as an auditable record (T-166) — the
record of having been wrong twice about the same four-line diff is itself the evidence for the
check that now guards it. And an explicitly DATED ground-truth table is a snapshot, left alone
rather than back-edited: `docs/LIARS-DICE-PROGRESSION_SPEC.md` §0's 2026-07-31 table still says 44
deeds after T-170 measured the slate at 59; the new number is stated in the new section (T-170).

**TP-34 — A rename never rewrites the historical record.** (T-204.) `TASKS.md` and every dated
design doc describe decisions actually made under the old name; rewriting them would falsify the
record. The invariant that survives an append-only protocol note is not a byte-identical count but
`git diff TASKS.md | grep '^-' | grep -i hangout` returning exactly one line — the task's own
`status:` flip. The file only grew. Related: when a `PROPOSED` / `STILL OPEN` marker is CONFIRMED
by an owner ruling, the superseded proposal text is RETAINED as dated history rather than deleted,
and any pinned assertion guarding the old phrase is RE-PURPOSED — its `why` restated to say it now
guards THE RETAINED HISTORY — so a later cleanup pass cannot delete the record silently (T-202,
applied across five sites).

**TP-35 — An Accept criterion's "if anything ships" clause is settled against what MEASURABLY
shipped, not against which files were opened.** (T-177.) T-177 touched
`packages/engine/src/liarsDiceRules.ts` but only inside COMMENTS, which `hashSemantic` strips, so
`computeRulesFingerprint(repoRoot)` read `cabd2112ccf4cefb` before and after and the clause did not
fire — no capstone, no 8,000-row sweep, no re-measurement, no fixture re-extract. Test files are
exempt by `HASHED_ROOT_IGNORED_DIRECTORIES.__tests__`. Likewise, adding keys to a DERIVED REPORT is
not a save-shape change (T-176).

**TP-36 — A bakeoff's pre-committed criteria must separate candidates from the INCUMBENT, not
only from the baseline.** (T-219.) T-219's K1–K4 were written against `bad` and never said a
replacement must beat the SHIPPED rule, so read literally they would have licensed shipping S1a —
which loses at every tier. The criteria set names the incumbent bar up front, and **may not be
patched after the numbers land**; the gap is recorded as a scored miss instead (§19.7).

**TP-37 — A criterion pre-committed for a BAKEOFF is an arbitration instrument, not a standing
invariant.** (T-220.) When a shipped number falls through such a band, the owner either RE-DERIVES
the band against the shipped rules — arguing the anchors, not picking them — or RETIRES it
explicitly in the relevant decisions doc. Either way the band's text stands VERBATIM and the fall
is still reported as a fall. T-220 partitioned C2 this way (win-rate limb retired, EV limb
promoted, binding text LD-28), leaving the `55–70%` untouched in `docs/LIARS-DICE_REDESIGN.md`
§17.2.

**TP-38 — A replacement bar must name a source that PREDATES the measurement it is scored
against, and a task may not set a bar on a number it measured in that same task.** (T-220.) That
is fitting a bar to a number. T-220's two kept bars cite T-148's measured +558 money-printer
signature and "EV > 0 for a voluntary action", neither being 190.1 minus slack, and it explicitly
DECLINED to set the roster-pool EV floor, deferring it to T-223.

**TP-39 — Pre-registered predictions are kept VERBATIM once the result is in.** (T-196b, T-160's
discipline: a forecast is worthless if it can be edited after the fact.) Sentences inside them that
are misstatements of EVIDENCE rather than forecasts get a DATED CORRECTIONS block immediately
after the list, beside the original text and never over it; the forecast-versus-result
reconciliation goes in Delivered. Where the block's own prediction is FALSIFIABLE BY READING
SOURCE before the run, the corrected prediction is written INTO the block before the run and the
original kept beside it (T-202: the block predicted "only the `gambler` row moves, and it moves
UP"; source said `min(2, allowance)` is `1,2,2,2,2,2` by tier under both tables, so the corrected
pre-run prediction was "all eight policy rows byte-identical, `rulesFingerprint` moves,
`instrumentFingerprint` does not" — which held exactly).

**TP-40 — "No logic change expected" in a task's Files list is discharged by a TEST, not by a
sentence in the delivery note.** (T-196b.) The `packages/sim/src/pilot.ts` confirmation shipped as
`pilot.test.ts` `T-196b · still enumerates the freed verbs, plus Wait and end-day, on an exhausted
hand`, with the argued mechanism written INTO the test (dropping `spendDie` SHRINKS each freed
spec's odometer domain, so freed candidates become strictly LESS likely to hit
`DEFAULT_PER_SPEC_CANDIDATE_CAP`).

**TP-41 — A feel-gated Accept clause is closed ONLY by a signed `RULED (owner, <date>)` entry in
`TASKS.md`.** (T-185, on the T-157/T-158 escalate-and-halt precedent.) Never by test count, and
never by a coder flipping status because the commit instruction asked for DONE. T-185 was
deliberately left `BLOCKED` at commit time for exactly this reason and only went DONE on the
owner's 2026-08-05 ruling.

**TP-42 — TP-30's "never move a build block back below a halting block" extends to human RULING
gate tasks, not just `[BLOCKED BY = Human UAT]` blocks.** (T-187.) T-187 was deliberately ordered
ABOVE T-186 — a ruling gate that halts the whole run when reached — because it had no dependency
on it and Select picks the first eligible TODO in FILE ORDER.

**TP-43 — A task whose Accept clause is CONDITIONAL on another task's ruling closes as MOOT,
recording the ruling in the block and gating green, when that ruling does not produce the
precondition.** (T-192.) T-188's ruling was scoped to the map's VISUAL question only and explicitly
held the live travel formula unchanged, so T-192 closed moot rather than manufacturing the missing
state to gate on.

**TP-44 — Restyle in two commits' worth of ORDER, not one.** (T-190, T-191.) Move every handler
and `data-*` attribute VERBATIM into the new wrapper, land the wrap with ZERO lines of CSS and run
the full gate green on that INERT state, before any styling is written — so the move is proved
inert first and any later red is unambiguously the styling. The proof that interactions are
unchanged is that the EXISTING readers of the same testids pass UNMODIFIED (T-190: nine
board-reading specs plus `e2e/support/career.ts`'s contract picker, 138/138, `git status` showing
exactly one new spec file; T-191: thirteen testid readers plus the desktop cockpit helper, with
`port-ledger.spec.ts` the only new file). `railsProps(...)` stays on the same blocks in the same
order so `inert` / `data-rails-off` semantics are byte-identical. **Restyles must also run
`npm run test:e2e:demo -w @spacerquest/ui` explicitly,** because `demo-gate.spec.ts` lives behind
its own config.

**TP-45 — A load-bearing number the owner has not ruled MAY ship against the spec's
starting-suggestion table, provided it is marked `PROPOSED — AWAITING OWNER CONFIRMATION` in all
THREE surfaces at once:** the content docblock holding the constant, the spec section that
proposed it, and the decision-doc entry. (T-197, for `LIARS_DICE_ROUNDS_PER_DAY`.) Surfacing a
question is not confirming it, and a Delivered note may never describe the former as the latter.

**TP-46 — An open owner question inherited by a downstream CHECKPOINT task is promoted to its own
NUMBERED ruling rather than left to ride inside a broader ruling of that checkpoint.** (T-197's
rounds table became **R3** at T-198.) A "pacing is fine" answer to the wide question would silently
bless specific numbers nobody ruled on, so the narrow question must be asked separately or it is
never actually answered.

**TP-47 — A PRESENTATION task over an existing number changes ZERO economy values.** (T-200.)
T-200 reframed the $25,000 Tour One debt without touching its value, the due day or the guild
interest rate. Every figure is read live off `GameState` with no numeric literal duplicated in the
copy, and the boundary is verified by `git diff --stat` scoped to `packages/engine` /
`packages/content` returning EMPTY.

**TP-48 — A `type: design` task produces a written proposal and nothing else.** (T-201, owner-set:
"explicitly asked to review a design proposal before any implementation".) Every changed path ends
in `.md`, no engine or UI code is touched, the proposal NAMES its own open questions rather than
silently deciding them, and the follow-up `code`-type implementation task is NOT filed until the
owner picks a direction.

---

## 8. Harvested 2026-08-06 (T-186 … T-255)

**TP-49 — Work in direct tension with a COMMITTED design pillar is a RULING task that starts
BLOCKED, never a build-and-ship task.** (T-186.) T-186 sat against `docs/PRD-REIMAGINED.md` §4's
"committed amber-phosphor CRT style… Duskers-grade commitment" and against `docs/TECH-STACK.md`:164
and :247-248, which name that aesthetic as the REASON Electron and the DOM/WebGL renderer were
chosen. Silently reworking the palette would have overridden an explicit prior owner commitment.
Whatever is then ruled, the pillar doc is UPDATED to match rather than left contradicting shipped
behaviour.

**TP-50 — A visual-direction ruling is not taken from PROSE.** (T-186, owner-set: he declined to
pick from descriptions.) The Accept criterion's own path is required — `/bakeoff` with independent
reviewers in isolated context, each REQUIRED to build and screenshot a real mockup before giving a
verdict, compared side by side. The ruling then names a specific REFERENCE BUILD
(`docs/design/T218-reference/T186-chassis.png` / `chassis.html`), not a description; a later
synthesis that merges the winner with a loser's rules is a NEW thing needing its own approval, which
is how T-186's fuller-synthesis attempt was rejected on sight.

**TP-51 — A ruled visual reference lives IN-REPO, not in a session scratchpad.** (T-218.)
`docs/design/T218-reference/` carries `chassis-rvrule.html` and `chassis-rvrule.png` alongside
candidate D's unmodified `chassis.html` and `T186-chassis.png`, so the two-selector diff recorded at
UI-2b stays auditable. A scratchpad-only reference makes "matches the ruled reference build"
unverifiable the moment the scratchpad is collected, and `docs/` is prettier-ignored, so this costs
the gate nothing.

**TP-52 — One task is worked in exactly ONE working tree.** (T-218.) Round 1 split T-218 across
`/Users/vs7/Dev/Games/SpacerQuest` (branch `redesign/explore-hangout`) and a six-minute-old
`../SpacerQuest-guards` on scratch branch `guards/m8-m13-remainders`, producing a HALF diff in one
tree and the FULL diff in the other with contradicting statuses. The resolution rule: consolidate
into the branch the track runs on and that tracks `origin` — never commit onto an unmerged,
upstream-less scratch branch — then verify the tracked diffs byte-identical by hash and REMOVE the
throwaway worktree (`git worktree remove` + `git branch -d`). Worktrees are throwaway measurement
rigs and the main tree stays byte-clean (`docs/BALANCE-RIG-DECISIONS.md` BR-7 / BR-19); this is the
mirror image of the lesson at `docs/NPC_REDESIGN.md:2245`.

**TP-53 — Every dispatched review or gate agent is given the ABSOLUTE repo root; inherited cwd is
never the anchor.** (T-218.) Review and gate for this file's tasks MUST run with cwd
`/Users/vs7/Dev/Games/SpacerQuest` (branch `redesign/explore-hangout`). The irreducible remainder,
named here so it stops being re-litigated: `Iron-Ashes/TASKS.md` also carries its own unrelated
`T-218` — task ids are unique per PROJECT, not per filesystem, and no file surgery can remove that
match. Dispatching any judge of this repo's work from the parent folder `/Users/vs7/Dev/Games` is
the defect, not the duplicate id. See `docs/LESSONS.md` L-068.

**TP-54 — `status: DONE` is the ORCHESTRATOR's to set at protocol step 5, after review passes AND
the gate is green.** (T-218.) A coder finishing the work does not set it — extending TP-41's "never
by a coder flipping status because the commit instruction asked for DONE" from feel-gated clauses to
the protocol generally. T-218 round 1 left T-218, T-216 and T-217 all reading DONE when the review
had in fact been BLOCKED; all three were reverted to IN-PROGRESS with the Delivered notes left
intact — only the CLAIM OF ACCEPTANCE was withdrawn, never the evidence.

**TP-55 — A temporary deviation is closed by DATING its record, not by deleting it.** (T-250.)
`docs/PLAYTEST-TELEMETRY_SPEC.md`'s `INTERIM DEVIATION` block became
`INTERIM DEVIATION, CLOSED (T-250, 2026-08-06)`, with the provenance — commit `5b430136` and the
owner's directive wording — preserved in the spec preamble, the `playtestLog.ts` header and the task
block, while spec §3's "OFF by default." was never touched. Doc and code agree again because the
code moved back, not because the doc was bent to it. (The TP-33 / TP-34 discipline, applied to a
deviation rather than to a correction or a rename.)

**TP-56 — No `CHANGELOG.md` entry is owed when an INTERNAL-ONLY default returns to spec.** (T-250.)
The playtest-logging flip only ever reached the pre-public internal build, and spec §3 has said OFF
since the document was written, so a changelog line would describe behaviour no released build ever
had. The omission is a DECISION, recorded here, not an oversight to be corrected later.

**TP-57 — Comparison artifacts an owner ruling will be made against are COMMITTED, not sent as
ephemeral attachments.** (T-188.) T-188's three prototypes (4a flat orbital, 4b sphere, 4c radar
console) were never committed; by the 2026-08-05 ruling pass they no longer existed on disk and had
to be REGENERATED from the committed data (`coordinates3D`, `orbitalLayout2D`, `distance3D`) before
the owner could compare them at all, and at T-215 the mobile-open failure could only be reproduced
by rebuilding the failure mode rather than by inspecting the artifact. See TP-51 for the same rule
applied to a ruled reference build.
