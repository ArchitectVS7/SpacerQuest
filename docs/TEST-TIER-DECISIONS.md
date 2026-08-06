# Test Tiers & CI Coverage — standing rulings

**Status:** Standing decisions for the tier map — which seam each suite drives, what Tier 3
(browser/DOM) is and is not, and which branches CI runs it on. Harvested 2026-08-06 from the
0.5.3 task log. Design records: `docs/TESTING-STRATEGY.md` (Parts C, G and H are the primary
record for most of what follows), `docs/ENGINEERING-POLICY.md` §2,
`docs/playtests/T-162-dom-longhaul.md`, `packages/sim/PILOT.md`.

Fingerprint consequences of a UI-only change are ruled in `docs/BALANCE-RIG-DECISIONS.md`
BR-69; the pilot itself is ruled in `docs/DEV-TOOLING-DECISIONS.md` §5.

The common thread: **a tier's result is evidence about that tier's seam and nothing else, and a
gate that does not run on the branch about to merge is not a gate.**

---

## 1. Tier boundaries

**TT-1 — Tiers do not substitute for each other, in either direction.** (T-155, amplifying
DT-28) T-155 (the sim-side pilot run, protocol/state seam) and T-162 (`packages/ui`, the
browser/DOM seam) cover **disjoint** gaps. A green pilot run says nothing about the cockpit —
that is the bridge blind spot DT-28 records — and equally, a green cockpit long-haul says nothing
about judged play deep into a career. The operational consequence is stated so it is not
re-litigated: **M7 does not close on T-155 while T-162 is still TODO**, and neither task's
result may be quoted in acceptance of the other.

---

## 2. Tier 3 — the browser/DOM long-haul

**TT-2 — Tier 3 is shape (b): a long-horizon INVARIANT SWEEP in Playwright.** (T-162) Shape (a)
— driving the T-154 pilot's action choices through the real DOM — is logged as **not chosen**, in
`docs/playtests/T-162-dom-longhaul.md` §5 and the "Tier 3, as built" block of
`docs/TESTING-STRATEGY.md`, for four reasons: (1) it needs a hand-maintained protocol-action →
cockpit-control map that nothing forces anyone to update; (2) its only interesting brain is still
unvalidated against the real API (F-155-1), is paid-per-step and is not reproducible; (3) blanket
invariants fit the unanticipated-crash bug class better than judged play does; and (4) shape (b)
reuses a harness that already works. *Judged* play deep into a career remains available at the
protocol seam via `npm run pilot` — it is not lost, it is sited elsewhere.

**TT-3 — Long-haul cadence is per-push CI, ONE seed × 30 days, inside the existing `e2e` job.**
(T-162) No new job and no new trigger, because the failure class is a **regression** class: a
client crash introduced today must fail today's build, not tomorrow's cron — and per F-153-1 a
`cron:` job would not fire off a non-default branch anyway. Seed **breadth** is bought on demand
(`LONGHAUL_SEEDS` / `LONGHAUL_DAYS`), which is where a randomised sweep actually finds the
unanticipated. Cheap-and-always beats thorough-and-elsewhere for a regression gate.

**TT-4 — A red e2e spec whose cause is that the RULES moved under it is repaired by re-reading
the live state, never by lowering the gate.** (T-162, F-162-3) Two repairs, two shapes. A
rules-owned literal the spec never claimed to own — a post-jump tank level, a drain point — is
replaced by a read of the live readout. A genuinely seed-dependent fixture is **re-hunted offline
against the built engine**, by replaying that test's exact decision rule, with the sweep script
and the provenance recorded in the spec's header comment (`starmap.spec.ts` seed 9 → 70;
`tour-one-death.spec.ts` seed 192 → 12). An assertion is never merely loosened to fit the new
rules. This is TP-24's sibling: TP-24 forbids pre-seeding fixtures around a design defect, TT-4
forbids relaxing an assertion around a rules change.

---

## 3. CI coverage — which branches run what

**TT-5 — All three workflows trigger on `branches: ['**']`, and any narrowing is DECLARED in a
two-state map.** (T-163) `.github/workflows/ci.yml`, `sweep-gate.yml` and `e2e-flake.yml` all
carry `**` — `**` and not a bare `*`, because `*` does not match a `/` and would still exclude
`redesign/explore-hangout`; under `push.branches` it still excludes tags. Every job-level `if:`
skip string, every `concurrency` block and `e2e-flake.yml`'s `paths:` cost filter are
byte-unchanged; only the branch lists were removed. A future narrowing must be entered in
`DECLARED_BRANCH_NARROWINGS` in `packages/ui/src/__tests__/ci-workflow.test.ts` — empty today,
with totality asserted in both directions, so there is **no silent third state**.

**TT-6 — Narrow a workflow by `paths`, never by branch name.** (T-163) `paths` is a COST
argument, and it re-opens itself the moment the measured thing changes; a branch name is a
COVERAGE argument, and it rots one branch at a time. Corollary: a job-level "the push run of this
same commit already tested it" skip
(`github.event_name == 'push' || …head.repo.full_name != github.repository`) is valid **only**
when the push trigger covers every branch that skip applies to — so widening the trigger is what
makes the standing `ci-no-duplicate-runs` norm true, not what weakens it.

**TT-7 — Four alternative shapes were considered and REJECTED**, recorded in
`docs/TESTING-STRATEGY.md` Part H as the primary record. (T-163) (1) Adding `npm run test:e2e` to
`docs/ENGINEERING-POLICY.md` §2's mandatory local block — 95 specs per commit, and still a human
remembering (L-020: prose is not enforcement). (2) Requiring e2e only for "rule-deleting changes"
— it asks the author to classify their own change, the exact judgment T-1605 and T-195 both got
wrong. (3) Extending the allowlist to `[main, rimward-redesign, 'redesign/**']` — the same
enumeration one iteration later, with `sweep-gate.yml`'s hand-added `redesign/explore-hangout`
entry as proof of how that ends. (4) Keeping the mac/win `package` matrix scoped to `main` —
declined because the repo is public (free runners) and an asymmetric per-job `if:` is a second
condition to keep in sync.

**TT-8 — Two costs are ACCEPTED, not defects, and are stated rather than discovered.** (T-163,
written into `docs/TESTING-STRATEGY.md` Part H) A working-branch push touching e2e paths now
fires `e2e-flake.yml`'s 20-run flake matrix; and F-153-1's default-branch-only `cron:` remains
unfixed. Related scope change landed with it: `docs/ENGINEERING-POLICY.md` §2 widened from
changes "touching the cockpit" to "the cockpit, **or the rules the cockpit asserts against**"
(naming the deleted-check / renamed-outcome / moved-rules-owned-number class), with the local
requirement now backstopped by CI rather than relied upon. §1's numbering is untouched because
other documents cite it, and `docs/BALANCE-RIG-DECISIONS.md` BR-40 was amended **in place**
rather than given a new BR-n, since that numbering is strictly sequential across Parts A–G.
