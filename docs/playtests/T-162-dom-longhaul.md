# T-162 · The browser/DOM-level long-horizon check — run report

**Date:** 2026-08-04 · **Branch:** `redesign/explore-hangout` · **Milestone:** M7
**Artifacts:** [`results/T-162-longhaul-runs.json`](results/T-162-longhaul-runs.json) ·
[`results/T-162-run-console.txt`](results/T-162-run-console.txt)

`docs/TESTING-STRATEGY.md`'s bridge-blind-spot warning called "a real browser/DOM-level check" a
"distinct, still-open need — do not fold it into Tier 2 by assumption," citing the worldbreaker
precedent where an HTTP-bridge testing tier missed the single worst bug in its registry (a
client-crashing type error in `useWorldSync.ts`) that only a separate real-browser audit caught.
Until this task, the item appeared in no task's Accept criteria anywhere in `TASKS.md`. It now has
an owner and a shipped mechanism.

---

## 1 · What was built, and where

| Piece | File | What it is |
| --- | --- | --- |
| The battery (pure) | `packages/ui/e2e/support/longhaul-invariants.ts` | Eight named claims as pure functions of a snapshot pair plus the step's console/pageerror tape. No `@playwright/test` import, no `page`. |
| The proof of the battery | `packages/ui/e2e/long-haul-invariants.spec.ts` | One seeded-bad fixture **per invariant**, each a single named mutation off a clean baseline, plus a totality guard. Never launches Chromium. |
| The driver (DOM) | `packages/ui/e2e/support/longhaul.ts` | One `page.evaluate()` snapshot; a table of parameterized moves; a modal resolver; the once-per-day hittability sweep; the artifact writer and the non-vacuity guards. |
| The spec | `packages/ui/e2e/long-haul.spec.ts` | One test per seed. Asserts the violation list is empty and the run is non-degenerate. |
| The regressions it found | `packages/ui/e2e/dead-affordance.spec.ts` | F-162-1 and F-162-2, encoded as deterministic tests (see §3). |
| The invocation | `packages/ui/package.json` → `test:e2e:longhaul` | `playwright test long-haul` (matches both long-haul specs). |
| The CI artifact | `.github/workflows/ci.yml` → `long-haul-run-report` | Sibling of the Tour One upload, same `always()` + `if-no-files-found: error` discipline. |

**Scope note:** every file this task touched lives in `packages/ui/e2e/**`, `packages/ui/src/`
(the two bug fixes), `docs/**` and `.github/workflows/ci.yml`.
`packages/sim/src/balance/rules-fingerprint.ts` hashes `packages/engine` + `packages/content`
(rules) and `packages/sim/src` (instrument) — **`packages/ui` is not hashed at all**, so no
fingerprint moves and **no capstone is owed**.

### What it is NOT, stated up front

The repo already had 111 real-Chromium specs, including a scripted 30-day `tour-one-career.spec.ts`
and a 20-run flake gate. The still-open need was never "any browser test." It was the class those
specs cannot catch: **a scripted scenario asserts only what its author foresaw**, and the
blind-spot bug is the *unanticipated* client-side crash deep into a career. This is the
long-horizon counterpart — randomized-but-legal play holding blanket claims that are true after
*every* action, whatever the action was.

It is deliberately **not** tagged `@tour-one`: `e2e/support/flake.ts:175` scopes the 20-run flake
gate to that tag, and `playwright.config.ts` is explicit that a gate whose threshold is a RATE must
not have its denominator moved by an unrelated task.

---

## 2 · The named invariant set

Quoted from `LONGHAUL_INVARIANTS` in `packages/ui/e2e/support/longhaul-invariants.ts` — the doc and
the code render the same strings, because the driver copies the claims into the artifact rather
than a human re-typing them.

| Invariant | Claim |
| --- | --- |
| `inv_no_uncaught_exception` | no uncaught exception reached the page during the step |
| `inv_no_console_error` | the step logged no console error (no allowlist — real noise is a finding, not a filter) |
| `inv_no_crash_screen` | the ErrorBoundary's crash screen never mounts |
| `inv_cockpit_reachable` | the cockpit stays takeable (end-day + hand mounted) unless a declared screen replaces it |
| `inv_no_dead_affordance` | a control that passed the actionability trial and was clicked moved the cockpit |
| `inv_blocked_shows_reason` | every disabled control exposes a non-empty reason a player can read |
| `inv_no_placeholder_text` | no NaN / undefined / [object Object] / Infinity is rendered to the player |
| `inv_day_monotonic` | the day never goes backwards and never advances by more than one per step |

Three properties of the battery are load-bearing and are themselves tested:

1. **Every violation carries its own invariant's name** (the `gate.ts` discipline), so a failure is
   always traceable to the claim it broke.
2. **`evaluateInvariants` is a map over the array**, so a ninth entry is wired by construction; the
   totality guard in `long-haul-invariants.spec.ts` fails if an invariant is declared without a
   seeded-bad fixture.
3. **Each seeded-bad fixture trips exactly one invariant** — a check that trips its neighbours
   produces failures nobody can read.

### Two carve-outs, declared rather than hidden

- **`inv_blocked_shows_reason` covers button-like controls only** (`<button>`, `<input>`,
  `[role="button"]`). That is a *structural* rule computed in the browser, not a hand-maintained
  allowlist that could drift: an SVG map node (`<g data-testid="starmap-system" aria-disabled>`)
  communicates cartographically and is excluded by the same rule that would exclude any future
  non-button. Reason sources are ranked `title` → `data-reason` → `aria-describedby` →
  sibling `*-reason` → the control's own label, and the artifact reports the distribution
  (**59,681 `title` vs 2,906 own-text** over the wide run) so a reviewer can see how much weight
  the weakest source carries.
- **`inv_no_placeholder_text`'s `Infinity` probe requires the token not be preceded by a word
  character or a dot**, because `SPZ.Infinity` is a real ship name in
  `packages/content/src/cast.ts`. That is a content fact, not a filter over a bug.

---

## 3 · The run

**Invocation:** `LONGHAUL_SEEDS=1,2,3,4,5 LONGHAUL_DAYS=35 npm run test:e2e:longhaul -w @spacerquest/ui`
**Environment:** Chromium via Playwright, `devices['Desktop Chrome']`, five parallel workers against
the shared Vite preview server. Full transcript: `results/T-162-run-console.txt`.

| Game seed | Choice seed | In-game days | Steps dispatched | Invariant checks | Distinct verbs | Violations | Hittability failures | Idle-digest instability | Wall clock |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 7932 | 35 | 528 | 4,224 | 35 | 0 | 0 | 0 | 47.0s |
| 2 | 15851 | 35 | 567 | 4,536 | 34 | 0 | 0 | 0 | 49.0s |
| 3 | 23770 | 35 | 562 | 4,496 | 32 | 0 | 0 | 0 | 48.9s |
| 4 | 31689 | 35 | 530 | 4,240 | 32 | 0 | 0 | 0 | 47.7s |
| 5 | 39608 | 36 | 639 | 5,112 | 34 | 0 | 0 | 0 | 52.2s |
| **total** | — | **176** | **2,826** | **22,608** | **36 (union)** | **0** | **0** | **0** | **244.8s** |

**Violations: 0.** Not "0 after filtering" — the battery has no allowlist and no suppression list.

The 36 verbs actually dispatched, from the artifact's own union:
`abandon-contract, arm-die, buy-equipment, buy-fuel, buy-pods, combat-dismiss, combat-stance,
dare-leave, dare-move, end-day, explore-sweep, haggle, hangout-close, hangout-social,
hangout-toggle, jump, loan-borrow, loan-repay, manifest-toggle, onboarding-dismiss, pay-debt,
preview-route, records-close, records-tab, records-toggle, repair-component, resolution-choice,
seat-dare, settings-toggle, sign-contract, storylet-choice, storylet-close, storylet-open,
upgrade-component, wire-log-close, wire-log-toggle`.

Verbs the move table offers that **did not** fire in this run, stated rather than glossed:
`die-reroll`, `repair-all`, `buy-port`, `hire-crew`, `dismiss-crew`, `succession-ack`,
`ending-return`, `recovery-dismiss`, `walkthrough-skip`. Each is gated on a state the five seeds
never randomly reached (a re-roll charge, an all-damaged ship, an affordable port stake, a solvent
crew hire, a ship loss, a career terminus, a corrupt save, an armed walkthrough). Seed breadth is
the lever for those, which is exactly what §4's on-demand cadence buys.

### Non-vacuity — asserted, not narrated

`assertNonDegenerate` in `support/longhaul.ts` fails the run unless all of the following hold, so a
hollow pass is impossible:

- `daysReached >= targetDays`, and the loop runs **through** the final day (arriving at day 30 with
  nothing played there would be 29 days of play, not 30);
- `distinctVerbs >= 8` — the direct analogue of T-155's `first-legal` 3-verb finding;
- `checksRun === steps × 8` — the battery really ran on every step;
- `stepsWithCandidates / steps >= 0.9` — the cockpit was live, not a blank page;
- `dailyTrialSweeps + trialSweepsSkipped === daysReached`, with at least half the days genuinely
  swept (a skip is recorded only when a blocking surface — an encounter, the ceremony, a
  succession, a live dare — legitimately owned the pointer, because sweeping cockpit controls
  behind an encounter would assert the opposite of what `action-blocked-parity.spec.ts` proves);
- `hittabilityFailures` is empty — every control the cockpit rendered live accepted a pointer, each
  failure re-probed once after a settle so a single mid-render miss is not mistaken for a defect;
- `idleDigestUnstable === 0` — two reads with no input between them must match, because a digest
  that drifted on its own would make `inv_no_dead_affordance` vacuous;
- every per-day action log is non-empty.

### Findings — both filed before the run continued

The **first** 30-day run (seed 1) went red with 12 `inv_no_dead_affordance` hits. Per the Bug
Discovery Policy both root causes were written into `TASKS.md` before anything else happened, then
fixed, then encoded as deterministic regressions in `packages/ui/e2e/dead-affordance.spec.ts`, then
the run was repeated. Neither is in `packages/engine` or `packages/content`.

| ID | Finding | Where it was |
| --- | --- | --- |
| **F-162-1** | An unaffordable fuel purchase left the whole cockpit falsely "armed". `resolveTrade` spends the die *before* the affordability gate (`packages/engine/src/actions/trade.ts:23`), so a "Not enough credits" refusal still burns it — but `store.ts`'s `buyFuel` inferred the spend from the refusal and kept `selectedDie` pointing at a die the engine had already consumed. `armed` is `selectedDie !== null` at all six of its definitions in `App.tsx`, so one unaffordable fill left the manifest, the yard bench, the crew bench, the port desk, the lend desk, the social venues, `explore-sweep` and `confirm-jump` **all rendering enabled**, with every click throwing the raw engine string `Die already spent` into the notice bar. Nine sibling handlers already read the authoritative `next.player.dawnHand.spent[die]`; this one did not. | `packages/ui/src/store.ts` `buyFuel` — fixed there, and `signContract`/`abandonContract` hardened to the same authoritative read so the assumption is removed rather than restated. |
| **F-162-2** | A repeated *identical* refusal changed nothing on screen at all — the notice banner had no identity, so a second "Not enough credits to make that payment." produced a byte-identical DOM and the cockpit read as inert rather than as refusing again. | `packages/ui/src/store.ts` + `App.tsx` — `CockpitState.noticeKey` is bumped at the store's single `set()` choke point whenever a notice is raised (same device and same argument as the existing `lastCheckKey`), and the banner carries it as its React `key` and as `data-notice-key`. |

Both regression tests were confirmed to **fail** against the pre-fix code and pass after — the fix
is proven by a failing-then-passing check, not by assertion.

**Two more findings came out of running the gate this task owes** (not out of the sweep itself, and
recorded here so the provenance is not blurred):

- **F-162-3** — six e2e specs were already RED on this branch. Baselined by stashing this task's own
  `packages/ui/src` changes and re-running: the same six fail without them. Root cause is **T-195**
  (`navDieFuelDiscount` + `navDieEvasionFactor`) shipping a rules change without an e2e run — the
  **T-163** gap, live. All six are repaired: four had pinned a rules-owned literal they never
  claimed to own and now read the live value instead; the two genuinely seed-dependent fixtures
  (`starmap.spec.ts`, `tour-one-death.spec.ts`) were **re-hunted offline against the built engine**,
  replaying each test's exact decision rule, rather than having their assertions loosened.
- **F-162-4** — the starmap's route preview shows the *undiscounted* fuel ceiling while the resolver
  charges the die's discount, so T-195's own feature is invisible to the player. Deferred to the
  M17 owner **with** the written out-of-scope / does-not-compound analysis the Bug Discovery Policy
  requires for a deferral; see `TASKS.md`.

---

## 4 · Invocation and cadence — which, and why

**Per-push CI (the default): one seed × 30 days, inside the existing `e2e` job.**
`npm run test:e2e` already collects `long-haul.spec.ts`; no new job, no new trigger, no new
scheduler. **Reason:** the bug class is a *regression* class — a client crash introduced today
should fail today's build, not tomorrow's cron. A nightly would also be the wrong instrument here
for a second reason recorded in `TASKS.md` **F-153-1**: a `cron:` job does not fire off a
non-default branch at all. Measured cost: **~48 s** for one seed × 35 days on a workstation, inside
an `e2e` job whose budget is `timeout-minutes: 20`.

**On demand (the wide sweep): five seeds × 35 days.**

```
LONGHAUL_SEEDS=1,2,3,4,5 LONGHAUL_DAYS=35 npm run test:e2e:longhaul -w @spacerquest/ui
```

**Reason:** seed *breadth* is what makes a randomized sweep find the unanticipated (see the nine
verbs §3 records as unfired), and it is cheap to buy on demand — the whole five-seed sweep is 53 s
wall clock at five workers. This is the run whose artifact is committed. Run it before a release
and after any change to the cockpit's action surface.

**The honest caveat, stated rather than glossed.** `.github/workflows/ci.yml` triggers `push` only
on `[main, rimward-redesign]` and skips same-repo PRs, so on the current `redesign/explore-hangout`
branch **the `e2e` job does not run at all** — this spec inherits that gap exactly as every other
spec in the suite does. That is already filed as **T-163** ("Working branches never run e2e before
merge"); it is cited here by number rather than re-discovered, and no CI coverage is claimed for
this branch that does not exist.

**CLOSED (T-163, 2026-08-04).** The paragraph above is left standing because it is what was true
when this report was written, and because the correction is the point: all three workflows now
trigger on `branches: ['**']`, so the `e2e` job — and with it this spec — runs per push on
`redesign/explore-hangout` and every other working branch. The same-repo-PR skip is unchanged and
is now correct, because the push run it defers to actually exists. Enforced by
`packages/ui/src/__tests__/ci-workflow.test.ts`; reasoning and declined alternatives in
`docs/TESTING-STRATEGY.md` **Part H**.

---

## 5 · The shape that was NOT chosen, and why

The task offered two shapes. **Shape (b) — a long-horizon invariant sweep in Playwright — was
built.** **Shape (a) — driving the T-154 pilot's action choices through the real DOM instead of the
protocol seam — was not.** Four reasons, in order of weight:

1. **Shape (a) needs a second adapter surface, which is the exact thing `TESTING-STRATEGY.md`
   Part B warns against.** The T-154 pilot (`packages/sim/src/pilot.ts`) enumerates candidates off
   a `legal-actions` protocol response and dispatches typed `PlayerAction` objects. Driving those
   through the DOM requires a hand-maintained protocol-action → cockpit-control map that no test
   forces anyone to update — a drift surface of precisely the class Part B says not to depend on.
2. **Cost and reproducibility.** Shape (a)'s only interesting brain (`--brain anthropic`) is still
   unvalidated against the real API (`TASKS.md` **F-155-1**, OPEN, owner-gated on a key), costs
   money per step, and is explicitly non-reproducible. None of that can sit in a per-push suite.
   Shape (b) is free, offline, and 48 s a seed.
3. **Blind-spot fit.** The bug class is an *unanticipated* client-side crash deep into a career.
   Blanket invariants over randomized-but-legal play catch that by construction; an LLM choosing
   *sensible* actions does not catch it any better and costs orders of magnitude more.
4. **It reuses a harness that already works.** `playwright.config.ts` already builds the engine,
   boots the preview server and drives real Chromium; `e2e/support/career.ts` already proves the
   DOM idioms (die strip off `aria-label`, contract rows off `data-*`, combat overlay handling,
   `test-results/` report emission). Shape (b) is new *decision logic* over a proven driver
   surface.

**What shape (a) would have bought that this does not:** *judged* play deep into a career — an
agent that buys the right upgrade before the fight rather than a random one. That capability is not
lost; it stays available at the protocol seam via `npm run pilot` (Tier 2, `docs/PILOT.md`), which
is where it is cheap and reproducible.

---

## 6 · Honest limitations

- **Randomized play is not *competent* play.** This sweep will not find economic dead ends, unwinnable
  boards or a broken difficulty curve — that is Tier 1's job (the balance sweep) and Tier 2's
  (the pilot). It walks legally, not well.
- **A run is reviewable evidence, not a byte-reproducible pin.** Two seeds are recorded (the game
  seed typed into the New game control, and the driver's own `mulberry32` choice seed), so the
  *intended* move sequence is reproducible — but move *availability* depends on Playwright
  actionability timing against a live React tree, so the realised sequence can differ between runs.
  Nothing in the spec asserts a pinned outcome; it asserts invariants, which is why that is
  tolerable here and would not be in `tour-one-career.spec.ts`.
- **`inv_no_dead_affordance` is a proxy.** It asks "did the click move anything a player can see?",
  measured as a digest over every `data-testid` element's normalised text plus a declared set of
  state attributes. It cannot distinguish a control that did nothing from a control whose *only*
  effect is invisible in the DOM. F-162-2 was exactly that gap in the product, and fixing it made
  the proxy honest for refusals; a future control with a purely off-DOM effect would need the same
  treatment rather than an exemption.
- **The daily hittability sweep probes one element per testid.** A 14-node starmap would otherwise
  dominate it. Every *kind* of control is covered every day; not every instance.
- **Overlay scoping is a driver behaviour, discovered by running it.** The first smoke run stalled
  because the walk opened Records and then kept picking cockpit controls the overlay correctly
  refused. While a surface owns the screen the walk now plays inside that surface — which is what a
  player does — and the surface's own close control is always in the pool, so it can never trap the
  run. This does mean the walk is not uniformly random over all moves; it is uniformly random over
  the moves *reachable from the current screen*.
- **Nine of the table's verbs did not fire in the committed run** (§3). The sweep covers what the
  seeds reach; it does not guarantee coverage of every verb, and this report does not claim it does.
