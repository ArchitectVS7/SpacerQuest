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
