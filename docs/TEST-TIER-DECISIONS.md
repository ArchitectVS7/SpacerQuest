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

---

## 4. Harvested 2026-08-06 (T-164 … T-221)

**TT-9 — Where a content validator lives is a RULE, not a preference.** (T-164; canonical text
`docs/TESTING-STRATEGY.md` Part I.) A validator whose assertions read only `@spacerquest/content`
lives in `packages/content/src/__tests__/` beside its rows; a validator that must resolve a row
THROUGH the engine (`resolveExploration`, `apCost` / `recoveryDays`, `createInitialState`, the day
loop) lives in `packages/engine/src/__tests__/` permanently. The second clause is FORCED, not
chosen: `packages/engine` depends on `@spacerquest/content`, `packages/engine/tsconfig.json`
references `../content`, and the root `tsconfig.json` lists `./packages/content` first — so an
engine dependency in `packages/content` (any field, `devDependencies` included) is both an npm
workspace cycle and a `tsc -b` project-reference cycle, and the absence of that reverse edge is
asserted across every dependency field rather than described in prose. Two shapes were rejected:
"ruling only, stand up no runner" (its sole argument was a fingerprint fear the rig had already
answered) and "move the whole file and give content an engine devDependency" (the cycle).

**TT-10 — A doc-pointer consistency check must be provably able to go red PERMANENTLY, not just
at introduction.** (T-165.) Its comparison core must be a PURE FUNCTION (`disagreements()` in
`baseline-pointers.test.ts`) driven by seeded-bad reading sets — de-synced site, unresolved
anchor, four-stale-one-correct — independent of live file contents; a doc reword that stops an
extractor matching is treated as a FAILURE, not as agreement; and a TOTALITY pass must walk every
`.md` under `docs/` for the pointer phrases and require each hit be either a checked site or a
reasoned `ACKNOWLEDGED_NON_POINTERS` entry. Generalisation: a check over an enumerated set of
files always owes a totality pass, because the set grows.

**TT-11 — Numeric readouts overlaid on an SVG diagram are HTML absolutely positioned in
PERCENTAGES, never SVG `<text>`.** (T-189.) `SVGElement` has no `innerText`, and
`packages/ui/e2e/shipyard.spec.ts:78,83` reads `fuel-per-jump` via
`Number(await ...innerText())` — **having to edit an existing spec to accommodate a
re-presentation is the signal that data was lost, so the spec staying UNMODIFIED is the acceptance
test.** Corollary: percentage alignment holds only while the svg box matches the viewBox aspect,
so the diagram is sized by `max-width` on the wrapper and NEVER by `max-height`
(`packages/ui/src/theme.css:567`).

**TT-12 — UI unit tests target the PURE SELECTOR in `packages/ui/src/format.ts`, never
`../store`.** (T-190.) Importing the store runs `init()` at module load and reaches for storage
and sound. Component-state behaviour (a stow, a toggle) is proved by REAL CLICKS in e2e instead,
because this repo has no `@testing-library/react`; that reasoning is written into the spec beside
the assertions rather than left implicit. Selector fixtures call
`startDay(createInitialState(...))`, not `createInitialState` alone, since the board is generated
at dawn and a bare initial state makes count assertions vacuous.

**TT-13 — A UI acceptance clause asking for "DOM pane tests" in `packages/ui/src/__tests__/` is
discharged at the STORE level plus Playwright, not by adding a rendered-DOM environment.**
(T-196c.) `packages/ui/vitest.config.ts` pins `environment: 'node'` deliberately; a per-file
`@vitest-environment` comment is the only sanctioned exception, and the rendered-DOM seam stays in
`packages/ui/e2e`.

**TT-14 — A claim about what a player can SEE is proved through the real DOM, never on a
formatter.** (T-221.) Unit tests bind the VALUES to the engine
(`packages/ui/src/__tests__/liars-dice-pane.test.ts`); the COPY is asserted in Playwright specs
driving real clicks (`e2e/liars-dice.spec.ts`, `e2e/liars-dice-roster.spec.ts`), including the
ABSENCE of jargon (`/disposition|crossover|probab/i`) and that a control's hover `title` is the
identical string to the printed line. A test that widens its sample across seeds until a
precondition occurs must ASSERT the precondition was reached (`expect(raised).toBe(1)`), rather
than narrowing to one lucky seed or silently looping zero times.

**TT-15 — `packages/desktop/e2e/support/cockpit.ts` is a DELIBERATELY DUPLICATED e2e helper,
kept apart from `packages/ui/e2e/support/career.ts`,** so a dev-mode/packaged difference shows up
as a real failure rather than a shared-fixture illusion. (T-200; the accepted cost now stated
rather than discovered.) Every new boot-blocking overlay or global first-run state must be
dismissed in BOTH helper families in the SAME commit, and the local gate (`npm test`, `tsc -b`,
lint, `format:check`) cannot catch the omission because desktop e2e is a separate CI job — T-187
left the desktop suite red from `eed2f3fe`, and T-200 repeated it on the opening marker, failing
8/8 desktop specs plus both package jobs after the Delivered note had already claimed the flows
were unblocked. A green local gate is never evidence for the desktop suite.

**TT-16 — Overlay dismissal ORDER in `startCareer` is load-bearing, not stylistic.** (T-200.)
`skipOpeningMarker` runs BEFORE `skipFirstTurnWalkthrough`, because `App.tsx`'s `WalkthroughCard`
renders nothing at all while `openingMarkerPending` — so skipping the walkthrough first silently
no-ops and lets it surface and block "New game". `skipOpeningMarker` is called a SECOND time after
"Roll", because `newGame` re-arms the marker unconditionally where the walkthrough's one-shot
record does not. Related and sharper: **when a test asserts on the FIRST user gesture, every
setup click a helper makes must happen BEFORE the observer is installed** — the dismiss click is a
real `pointerdown` that `sound.ts`'s capture-phase listener credits as the observed first gesture.

**TT-17 — Explicitly rejected for the dawn beat, with the cost MEASURED rather than guessed.**
(T-201.) A blocking beat; a beat that skips the reduced rail; duplicating the dice into throwaway
DOM. `grep -rl "end-day" packages/ui/e2e` is 21 files / 56 occurrences, but 18 already call
`page.emulateMedia({ reducedMotion: 'reduce' })` — so a beat gated on the same `reduced` predicate
as the existing scramble and `.sweep` costs only 8 presses across `smoke.spec.ts`,
`sound-audible.spec.ts` and `long-haul-invariants.spec.ts`, well inside
`TEST_TIMEOUT_MS = 60_000`. The off-rail version would cost `duration × 30` per long-haul seed,
need all 21 files rewritten, and break the e2e `die` locators.

**TT-18 — A golden re-derived because of a TEXT-ONLY change must prove it MECHANICALLY, never by
hand-patching.** (T-204, matching the T-149 and N13/T-156 precedent.) Reverse-substitute the new
word back to the old in each newly computed pre-image and confirm it reproduces the COMMITTED
predecessor constants EXACTLY (done for all six replay constants and all four
`day-loop-golden.ts` sha256 hashes), and assert the `rngState`s are UNMOVED
(`364866002 / 268015010 / −1231248819`) — a moved `rngState` means a prose edit changed a draw,
which is a bug, not a rename. Both files carry a `T-204 RE-DERIVATION` comment block recording why
the bytes moved.

**TT-19 — When a test suite is deleted together with the thing it tested, a COMMENT stands where
it was,** naming exactly what it covered and what replaces it — as §7 of
`packages/content/src/__tests__/castValidation.test.ts` does for the retired waiver-hygiene
describe — so its absence reads as a deliberate retirement rather than dropped coverage. (T-206.)

**TT-20 — A red REACHABILITY pin is repaired by re-running the test's own documented re-pin
sweep, never by touching an assertion.** (T-208, the sixth application of that procedure.)
`campaign-reach.test.ts`'s T-1204 bond reachability went red at T-208; a fresh seeds 1..30,
300-day sweep driven through the shipped test with a temporary env-var seed override found NINE
qualifying seeds (2, 3, 4, 7, 9, 13, 15, 21, 28) against the previous sweep's eight, so
`CAMPAIGN_SEED` moved 1 → 2 with the loop body and both assertions UNTOUCHED. Where a check
encodes a numeric or lexical PROXY for the property it cares about, replace the PROXY with the
property rather than re-pinning the proxy — and say so in the delivery note, since "never edit a
check to make a test pass" is the standing rule (T-196a).

**TT-21 — An engine RULES change is not gated by the unit suite: the full e2e suite runs before a
gate is called green, and red specs are repaired AT THE SPEC.** (T-196a, the second occurrence of
F-162-3's class.) Freeing nine engine actions from their die cost left the unit gate green while
`npm run test:e2e -w @spacerquest/ui` found 10 RED specs; all were fixed at the spec, none by
re-pinning a number, 162/162 green after. Two repair rules came out of it: a die-arming helper
that a freed verb no longer consumes must stay IDEMPOTENT (`store.ts`'s `selectDie` DISARMS an
already-armed die), and a spec asserting a retired trigger is REWRITTEN around the durable
property (read the engine's own `spent` flag), never deleted.
