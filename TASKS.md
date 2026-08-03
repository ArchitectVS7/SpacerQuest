# SpacerQuest — 0.5.2: the Explore and Hangout systems

Two player-facing systems are being rebuilt from near-stubs into real content-driven
features. Both follow the same shape — **spec the engine/content split first, extract
behaviour-preserving, then author content in passes** — and both are deliberately
multi-pass: no task here tries to design a system and fill it in one go.

**Source of truth:** `docs/EXPLORE_REDESIGN.md` and `docs/HANGOUT_REDESIGN.md` (both
authored by the first two tasks below; until then, this file and the audit findings in
`docs/NPC_REDESIGN.md`'s vacated-ruling block are the brief). Companions:
`docs/PRD-REIMAGINED.md` (design intent), `docs/VERSIONING.md` (fingerprints, save
versions), `docs/BALANCE-POLICY.md` (governance), `docs/NPC_REDESIGN.md` (the N-series,
paused behind this track for the two verbs in question).

**Why this track exists — the two measurements that scoped it**, both taken 2026-07-30 and
recorded under THE THREE VERB RULINGS in `docs/NPC_REDESIGN.md`:

- **Explore costs ~10x what it returns.** 80 fuel (400–640cr) plus a die, a PILOT DC-12 nav
  check that passes **33.6%** of the time with the fuel burnt _before_ the check, for an
  expected **53.8cr** of salvage per attempt. Removing it from the shipped explorer policy
  leaves that policy **richer on 101 of 120 seeds**. The verb is not mistuned income — it is
  the Nemesis-lore faucet wearing an income action's costume, and the redesign is to give it
  a payoff worth the price.
- **The Hangout exists at ONE system out of 28** (Sun-3, the starting system). The social
  pillar has never been tested at a size where it could matter. It is also the only
  _voluntary_ input to disposition — every other disposition change is a by-product of
  violence or competition — and disposition demonstrably weights **who intercepts you**
  (`chooseWeighted` in `actions/travel.ts`).

## THE THREE DESIGN RULINGS (owner, 2026-07-30) — settled before any task ran

Every task below is built on these. They are recorded here rather than only in the specs
because a sub-agent gets this file and its named pointers, and nothing else.

1. **Explore recovery costs CALENDAR DAYS — a multi-day committed recovery.** Starting a
   salvage op occupies N future days, N scaling with the outcome's power. This is expected
   to need persistent state (`player.recovery` or equivalent) and therefore a save bump.
   It was chosen over a same-day scaling die cost because the game's tension is already
   fuel + days + a marker due on day 30, and a recovery that eats days trades directly
   against that clock. **The three questions it owes answers to — travel away mid-recovery,
   die mid-recovery, start a second one — are the spec's job, not the owner's.**
   **AMENDED by D1 (owner, 2026-07-31): this ruling now governs band 2 only.** Bands 3-4
   move to a same-day extra-dice cost (T-131, M4a) — the D1 bakeoff found their multi-day
   holds price the deep ladder upside-down (band 4: zero collections in 14,400 sim-days).
   **DISCHARGED by T-131 (2026-07-31):** the dated amendments landed on the "zero-die
   commitment" comment in `packages/engine/src/types.ts` (the `RecoveryState` header) and on
   `docs/EXPLORE_REDESIGN.md` §3.3 — plus, in the same pass, §5.2's band table (an `apCost`
   column, bands 3/4's `N` retired), §5.4 (the correlation restated over the combined cost,
   which the old `recoveryDays`-only form would have made vacuous) and §3.2(b) (the sketch,
   the grep clause and the same-day share, now 58% unconditional + 18% conditional on the
   hand). The invariant survives narrowed to band 2: nothing charges a die per recovery *day*,
   and a same-day claim cost is not a per-day cost.
   **SWEEP COMPLETED (T-131 fix round 1, 2026-07-31)** — review found the first pass amended
   the sections it edited but left four sibling passages asserting the retired rule as current
   fact. All now carry dated D1 notes: `docs/EXPLORE_REDESIGN.md` **§3's opening** ("nothing
   charges a second die" — true of band 2 only now), **§3.3(d)** (the band-4 `N = 6` marker
   justification, and the test-owed scenario, which named a day-27 / N = 6 open no authored
   content can construct any more — the shipped straddle test uses band 2's `dueDay` 31),
   **§4.2's worked-item table** (items 2-3 read "band 3 / N = 3" and "band 4 / N = 6"; the
   column is now the band's claim cost in its own currency), **§5.5's caveat 1** (the "14.1%
   of attempts" figure, stale twice over — the live figure is band 2's 24% of boards ≈ 8.1% of
   attempts), and a header on **§9** marking the whole T-116 appendix as a dated pre-D1
   measurement whose §9.6 leak is what D1 answered — its numbers are left exactly as taken.
   Also corrected: §3.2(b)'s same-day total read **82%**; 58 + 18 = **76%**, which is the
   figure §9.6's own title independently carries. And `recovery.test.ts:394`'s cross-reference
   to "section 7 drives the N = 6 clock" now names what section 7 actually tests.
2. **A unique item's die effect uses the EXISTING, SHIPPED-EMPTY hook.** `DiceBenefit`
   (`packages/content/src/crew.ts`) is already
   `{ kind: 'extra-die' } | { kind: 'reroll' } | { kind: 'floor'; floor: number }`, and
   `EQUIPMENT_DICE_BENEFITS` is an empty table whose own comment says *"a future
   die-granting module joins with one entry — no engine change, no new call site"*. It
   folds through `dice.ts` `equipmentDiceBenefits` → `dawnDiceModifiers`, the same
   accumulators as the crew roster, and an existing cap stops content inflating the hand.
   **"+y on a roll" is expressed as a floor / extra die / reroll. NO new check-level
   modifier surface is to be built.** If a content row provably cannot be expressed this
   way, that is a finding to REPORT, and adding the second surface is a fresh owner call.
3. **A Hangout port definition controls OUTCOMES, not RULES.** It carries: which of the six
   venues are offered, the wager band, per-venue check DCs, per-venue disposition deltas,
   the drawable clientele, and the prose/tone. The engine keeps the opposed-GUILE dare
   resolution, the loan ledger, die spending, and how disposition is applied. **A dangerous
   bar is dangerous through numbers.** Per-port "house rules" needing an engine special
   case are explicitly OUT — if a content pass hits a port it cannot express, report it;
   that finding is what would earn a richer surface later.
   **AMENDED by D2 (owner, 2026-07-31): the "engine keeps the opposed-GUILE dare
   resolution" clause is superseded** — M4d replaces the Dare's single check with a
   multi-turn Liar's Dice scene (T-134-T-137). Everything else in this ruling (venues,
   band, DCs, disposition deltas, clientele, prose as content; no per-port engine special
   cases) stands unchanged and binds the new game too.

## Orchestrator protocol

1. **Check out** the first task with `status: TODO` whose `after:` tasks are all DONE. Set it IN-PROGRESS.
2. **Plan** — hand the coder the task block plus the pointers named in the intro. Nothing else.
3. **Code** — implement per the plan and the Standing constraints.
4. **Review** — check the diff against the task's **Accept** criteria (written to be mechanically checkable).
5. On pass: run the gate, commit as `<ID>: <title>`, set `status: DONE`, update this file in the same commit. On fail: one fix round, then escalate, then halt.

**Gate (every task):** `npm test`, `npx tsc -b`, `npm run lint`, and `npm run format:check`
must all exit 0 (format:check joined the mandatory gate by owner ruling at the T-130 gate,
2026-07-31, closing V-2's class — `rulesFingerprint` is not formatting-invariant, so an
unformatted tree silently changes what a capstone hashes). A green battery means ZERO failing
tests. The known-red `it.fails` tripwires are R-owned and are _expected_ to fail-as-designed;
if one flips to unexpectedly PASSING, halt and escalate — do not flip it to `it`.

**Standing constraints** (the reviewer enforces on every task):

- **ENGINE OWNS RULES, CONTENT OWNS INSTANCES — this is the whole point of the track.** A
  new _kind_ of outcome is engine work; a new _instance_ of one is a content row. If
  authoring the 74th explore outcome requires an engine change, the framework is wrong and
  that is a finding to report, not a branch to add. `packages/content` is data: a `grep` for
  `if (` over a new content file should find nothing that decides an outcome.
- **Extract behaviour-preserving BEFORE adding anything** — the N3 `combatRules.ts`
  precedent, which is the model for both refactors: the engine suite stayed at 726/726 with
  **every golden hash unmoved** before one new behaviour was wired in. Prove the move is
  inert, in its own commit, then build on it.
- **CONTENT IS HASHED WHOLESALE into `rulesFingerprint`**, so _every_ content pass stales
  the smoke fixture. Do NOT take a capstone per content task — that is six capstones for
  work that should cost two. Batch it: the milestone's final task takes one capstone and
  re-extracts once (standing amendment 3's "re-extract ONCE, at the end"). Run
  `npm run format` BEFORE that capstone, never after — `rulesFingerprint` is not
  formatting-invariant (found at N10).
- **Never edit a fingerprint, band, threshold or golden to make a test pass**
  (`docs/VERSIONING.md`). A stale fixture gets a new capstone; a red live band gets a WIDER
  SAMPLE, never a moved threshold (precedent at N4 and N10).
- **A save-shape change owes a migration and a round-trip test**, and a migration CALLS a
  rule rather than restating one. `CURRENT_SAVE_VERSION` is **12** at the start of this
  track; two tasks below are expected to need it.
- **Sweep invocation, exactly.** Shards are **1-indexed** (`--shard 1/8` … `8/8`), then
  `--merge`; verify the merge reports **8,000 rows**. Both `--milestone-days` and
  `--aggregate` are load-bearing.
- **Never mark a task DONE without grepping for its named deliverable at its named call
  site.** Two N-series steps were once marked SHIPPED with the core change absent; the audit
  that caught them did it in one command per row.

Statuses: `TODO` | `IN-PROGRESS` | `DONE` | `BLOCKED(reason)`

---

## Completed — the N-series parity run (2026-07-29 → 30)

Ten tasks, T-001 … T-040, delivered the N10 doc prune, the three UNRULED-verb decision memos,
N11 (NPCs earn deeds and Renown) end to end, and N12's FIRST TASK (the instrument learning to
see ports). Battery went 1,312 → **1,354 passing / 0 failing**; the baseline of record moved
to `docs/balance/baseline-n11-shipped.json`.

**Full record: `git show 1bf86bc6 -- TASKS.md`** (task-by-task bodies, Accept criteria and
Delivered notes). The outcomes are recorded permanently under their steps in
`docs/NPC_REDESIGN.md`.

**Two of the three verb rulings that run produced were VACATED the same day** — Explore and
VisitHangout, because this track replaces the systems they were ruled against. Storylet's
exclusion stands. See the caution block above THE PARITY LEDGER.

---

## Deliberately deferred

Out of scope for 0.5.2 — recorded so a coder does not re-scope them in:

- **Whether NPCs interact with Explore or the Hangout.** The owner's explicit sequencing: the
  systems become functional first, and only then is the cast question asked. This gates
  re-ruling the two vacated PARITY LEDGER rows, and therefore gates **N8**.
  **UPDATE (T-150, 2026-08-01): the sequencing precondition is MET and the re-ask has been
  MADE.** Both systems are functional and capstoned, and T-150 restated each row against them
  with current numbers (`docs/HANGOUT_REDESIGN.md` §11.4, `docs/EXPLORE_REDESIGN.md` §10.4).
  **Both rows remain UNRULED — N8 un-gates on the owner's ruling, not on T-150.**
- **The three Hangout defects — status updated at the T-130 gate (2026-07-31):** the missing
  `hasHangout` check is now SCHEDULED (T-149, the fiction fix only); the faucet's mint stays
  deferred by D3's ruling (<0.3% of NPC wealth, not worth breaking `resolveNpcDay`'s
  single-NPC-mutation model); the 150cr ante lockout stays deferred by explicit owner ruling
  (see the D3 log row). The two deferred halves ride the cast question above, re-asked at T-150.
  **RE-MEASURED AT T-150 (2026-08-01) and all three still open:** the `hasHangout` gate shipped,
  but it fixed the FICTION and not the VERB — the off-Hangout Socialize share is unmoved at
  **37.97%**; the mint re-measures at **+3.44cr/captain-day**, i.e. **0.22%** of terminal NPC
  wealth, so D3's "<0.3%" verdict stands; and the 150cr ante locks out **17.49%** of live
  captain-days, five-sixths of that from the undocumented inline `+ 50` rather than the named
  `NPC_BROKE_CREDITS` floor. All three ride the still-unruled cast question.
- **The rest of the N-series: N12 (NPCs buy ports), N13 (dawn-hand parity), N5 (proficiency),
  N8 (re-pin).** N12's FIRST TASK is already done, so that step is ready to resume when this
  track ends.
- **`executeCombat`'s missing shared rules** — fighters still take 0 deaths on their chosen
  Combat day. A real PARITY LEDGER gap; whether it lands as an N3 follow-up or at N13 is an
  owner sequencing call.
- **Explore being a net loss for the PLAYER as a balance question.** T-116 re-measures it, but
  _re-pricing_ is R-series work and an owner call, not something a content pass does.
  **UPDATE (2026-08-02): named in T-158's pre-UAT brief** — still deferred as a build item, but
  the owner's UAT pass now meets it with T-116's numbers (85/120 seeds richer without the verb)
  in hand, since UAT is the "playtest by feel" D1 chose over sim pre-validation.
- **The manifest version.** Already at 0.5.2 (commit `9d9ff47e`, 2026-07-30, under the amended
  `docs/VERSIONING.md:53` policy — PATCH marks the active work track, not only a shipped one).
  **T-130 ruling (owner, 2026-07-31): no advance to 0.5.3 and no tag while this track's own
  findings are still open** — D1 (Explore time-cost rebalance), D2 (Dare redesign), D3 (the
  Hangout faucet/`hasHangout` untangle, via `/bakeoff`), D6 (the Hangout UI surfacing job) and
  D7 (Arcturus-6's credit desk) are all still outstanding. Re-check this bullet when they close.
  **RE-CHECKED AND ADVANCED (owner, 2026-08-02): 0.5.3.** The ruling's own condition is
  discharged — all five named findings closed (D1→T-131, D2→M4d/M4e, D3→T-149, D6→T-132,
  D7→T-133) — and the owner directed the bump. Under the amended `docs/VERSIONING.md` policy
  PATCH marks the active work track: **0.5.3 is the M7 focusing arc** (T-153…T-162: sweep-gate
  proof, dawn-hand parity, the F-137-1/F-159-1 fixes, the LLM pilot, and the T-158 UAT halt).
  Bumped via the documented one-command procedure (both manifests + regenerated lockfile).
  **Still no tag** — a tag is a stage marker cut by the ceremony, and the first (`alpha`) waits
  on T-158's own UAT pass per `docs/VERSIONING.md`'s stage table.
- **Anything R-owned:** R10's tier-1 hull cliff and the known-red `it.fails` tripwires.

---

## T-130 OWNER RULINGS — running log (owner, started 2026-07-31)

Live status of the D1–D7 decisions `docs/0.5.2-REVIEW.md` §1 asked for. Updated in place as each
closes; do not archive until every row is DONE or explicitly dropped. This is the log the owner
asked to keep across a multi-session ruling process — check here before re-asking a question
already answered below.

| # | Decision | Status | Notes |
| --- | --- | --- | --- |
| **D1** | Re-rule the Explore parity-ledger row | **DECIDED (owner, 2026-07-31) — hybrid, scheduled as T-131** | Confirmed already-shipped and NOT part of the gap: per-route fuel cost already scales with distance (`economy.ts jumpFuelCost`), and pirate/encounter chance already varies by route (`SYSTEM_DANGER_LEVELS`, a distance bump, a loaded-run cargo bump, an era-event delta, feeding `ROUTE_DANGER_CHANCE` 0.30→0.60) — surfaced pre-jump in the route preview. **Bakeoff (3 independent reviewers)** converged: bands 3-4's calendar-day holds are the real failure (EV math: opportunity cost 475-1,480cr/day held vs. band-3/4 paying ~0 realized EV, 100% non-credit rows, band-4 never once collected in 14,400 sim-days) — the cost is *inverted*, not mistuned. A literal day→die 1:1 breaks on hand size (base 5, max 7). Split 2-1 on whether band 2 (1-day, 42.1% collection, not catastrophic) should also convert; **owner ruling: ship the hybrid** — band 2 stays on its existing, working calendar-day machinery untouched (no save-migration risk, death/travel-away forfeit code untouched); bands 3-4 move to a same-day action-point (extra dice) cost instead of calendar days. **Logged alternative, not chosen:** the full uniform conversion (all non-zero bands → same-day AP, band 2 included) — ranked below for now because it forces a `player.recovery` schema removal (v13→v14 migration) and a bigger single diff; revisit if the hybrid's own playtest shows band 2 still underpriced. **Owner: we will playtest this rather than pre-validate with a balance-sim rerun** — scheduled as **T-131** below, numbers to be tuned by feel. **The ledger row ITSELF (does the cast get the Explore verb?) stays DEFERRED (owner, 2026-07-31)** — this ruling rebuilds the player-side system the row was vacated for; the cast question is re-asked when T-150's post-fix capstone hands back fresh numbers |
| **D2** | Re-rule the VisitHangout row | **CLOSED (owner, 2026-07-31) — replace the Dare with Liar's Dice, scheduled as two milestones (M4d: T-134-T-137 base game; M4e: T-144-T-148 roster/archetypes/unlock ladder)** | `executeSocialize` (NPC econ) confirmed NOT the same mechanic as the player's Dare. Bakeoff (4 reviewers, two rounds) on the current single-check Dare found it empirically favorable (57.3% win rate, +120-159cr EV/dare) and mechanically thin. **Owner rejected the "fix the check" path** ("kind of dumb") and chose **Liar's Dice**. Base ruleset in M4d (4d6/side, raise-face/quantity/both, challenge, fold, exploit closed by requiring fixed quantity + adjacent-face-only raises). A SECOND bakeoff round on top of that added: opponent AI archetypes (optimal/bad/random/mixed) + a new 3-per-port fixed opponent roster (42 total, beat-once, feeds new port-clear/game-clear achievements via the existing Deed/Registry system) layered alongside the existing 30 roaming `NPC_PROFILES` captains (unchanged, unlimited replay, not tracked); a doubling unlock ladder (5/10/20/40/80 games) for 5th die → 6th die (hard cap six) → "Read the Table" → bigger bounded bets → unlimited bets (band-clamp removed, solvency clamp kept). **Wildcards (ones-as-wild) are OUT OF SCOPE, permanently** — found to reopen a WORSE version of the already-closed exploit (a held 1 gives a guaranteed floor on every face at once, ~3.5x more common, unbounded in scope) that the existing fix does nothing against; replaced in the unlock ladder by **"Read the Table" — CONFIRMED by owner, 2026-07-31** (see the archetype before sitting down — mathematically inert, pays off the new archetype system; the second-Peek alternative was not chosen). "Ports get more dangerous with distance" clarified: no rim system has a Hangout today, so ante scaling rides each port's own already-authored wager band, not a literal distance formula. **GUILE-as-investable is CLOSED OUT OF THIS ITEM** — the owner reframed it as a bigger question (should ANY player stat be modifiable by equipment, not just GUILE) and asked for its own design track; see the new milestone **M6** below, not part of D2. **The ledger row ITSELF (does the cast get VisitHangout?) stays DEFERRED (owner, 2026-07-31)** — same sequencing as D1: the cast question is re-asked at T-150, against the Liar's Dice system rather than the stub |
| **D3** | The NPC Hangout faucet | **CLOSED — scheduled as T-149 (confirmed present, M4f)** — ship the `hasHangout` gate now (`executeSocialize`, one boolean read + a re-flavored non-Hangout fallback line, zero save impact); defer closing the mint itself — three independent reviewers converged that it's <0.3% of NPC wealth by day 120 and not worth the architectural cost of breaking `resolveNpcDay`'s single-NPC-mutation model. **The review's THIRD sub-decision here — the 150cr socialize ante (`npc.ts:1831`'s inline `+ 50` over `NPC_BROKE_CREDITS = 100`) that locks destitute captains out — is explicitly DEFERRED with the cast question (owner, 2026-07-31)**, same class as the mint; it rides the parity-ledger re-ask at T-150, not any M4 task |
| **D4** | The manifest version | **DONE** | Stale "stays at 0.5.1" sentence removed from `TASKS.md`, `docs/EXPLORE_REDESIGN.md`, `docs/HANGOUT_REDESIGN.md`. Ruling recorded above: no 0.5.3, no tag, until D1/D2/D3/D6/D7 close |
| **D5** | Pull T-125's four levers | **CLOSED — extracted as T-150 (M4g); DISCHARGED at T-150, 2026-08-01** | Of the four, two are already discharged by other tasks (F-101-4 by T-132, the faucet by T-149). The remaining two (F-116-1, F-123-3) plus a fresh named-pool-gate/decay-interval measurement are bundled into T-150, gated after every other fix task so it can't run before the tree is actually green — the original "hold until green" deferral, now a dependency instead of an open-ended note. **T-150 delivered (2026-08-01): F-116-1 and F-123-3 both FIXED with tests; the named-pool-gate/decay measurement re-filed as F-150-1 for a fresh owner ruling with NEITHER constant touched; a twin defect found and filed as F-150-2. All four levers now accounted for.** |
| **D6** | The Hangout UI surfacing job (F-101-4/5/6, F-123-1) | **SCHEDULED — T-132** | Owner: yes, fix the UI. One task, not four, per the review's own recommendation — F-101-4 (meet/befriend/insult dispatch), F-101-5 (dead-NPC filter), F-101-6 (prose finally rendered), F-123-1 (loan desk gated on `venueOffered`, both notice helpers gain a `'venue-not-offered'` arm) |
| **D7** | Arcturus-6's credit desk (F-123-2) | **DECIDED (owner, 2026-07-31) — scheduled as T-133** | **Confirmed direction: keep per-port variation, via a per-port loan principal band** (`PortHangout.loanBand`, mirroring the Dare's `wager` band) — Arcturus-6 keeps its desk, just a tighter one. **Logged alternative, not chosen (for the record, per owner's ask):** a per-port interest-rate multiplier on `LOAN_DAILY_RATE`, instead of or alongside the band — not ruled out, just not built first (the principal band reuses the `wager`-band pattern byte-for-byte, lowest engine risk). Revisit after this playtest if a tight band alone doesn't read as enough distinction |

**Findings filed BY T-150 and handed to the owner (2026-08-01) — the open items this track ends on:**

| # | Finding | Status | Where |
| --- | --- | --- | --- |
| **F-150-1** | The **0.25 named-pool interceptor gate** (`actions/travel.ts`) and **`DISPOSITION_DECAY_INTERVAL_DAYS = 3`** (`content/disposition.ts`), read together now that the faucet is gated, the UI speaks, Explore's recovery model changed and the Dare is Liar's Dice | **OPEN — a DESIGN QUESTION for the owner, not a tuning knob (T-125's own ruling). NEITHER CONSTANT CHANGED BY T-150.** Measured: named share **25.07%** vs the analytic 25.00%, inertness **71.52%**, wronged-captain lift **2.358×**; the cast sits at exactly 0 on **96.52%** of live captain-days and a standing survives a **median 3 days**, with decay outrunning interaction **1.53 : 1** — so widening the gate alone would mostly buy more *inert* draws. **SCHEDULED FOR A RECORDED RULING AT T-158 (2026-08-02)** — the UAT checkpoint's brief now carries these numbers and its Accept requires the ruling | `docs/HANGOUT_REDESIGN.md` §11.3, with a levers-not-pulled table |
| **F-150-2** | `smugglerPolicy` carries a byte-identical copy of F-116-1's unguarded Explore loop (**3,891 of 23,192 queued on a recovery dawn**) | **OPEN — the fix was written, MEASURED, and deliberately backed out.** It re-seeds that policy's stream onto a pre-existing five-day stall in the SHARED `planPacifistCombat`, tripping the poverty-trap invariant; root-fixing that means editing a planner five policies share, which would move every fingerprint and destroy T-150's containment claim. **Pinned by an explicit tripwire test** so it cannot be closed by accident | `docs/EXPLORE_REDESIGN.md` §10.3 |
| **The two PARITY LEDGER rows** | **Explore** and **VisitHangout**, RE-ASKED against the systems as they now are, with fresh numbers beside them and the three VisitHangout-deferred defects re-measured (faucet **+3.44cr/captain-day = 0.22%** of terminal NPC wealth; off-Hangout Socialize **37.97%** — T-149 fixed the FICTION, not the VERB; the 150cr ante locks out **17.49%** of live captain-days) | **STILL DEFERRED — UNRULED. Owner's call, not a build task's.** This is what un-gates **N8**; no N-series task's status was changed | `docs/HANGOUT_REDESIGN.md` §11.4, `docs/EXPLORE_REDESIGN.md` §10.4, and the two ledger rows in `docs/NPC_REDESIGN.md` |

**Non-D findings from the same review, tracked here too since they're part of the same gate:**
**V-1** (`docs/VERSIONING.md:229` stale "currently `12`") — **CLOSED, 2026-07-31.** One-line fix to
`13` (matching `CURRENT_SAVE_VERSION`); verified no test asserts the stale text; `tsc -b` clean;
full suite re-run green (1,638/1,638) after the change. **V-2** (a `format:check`-red commit landed
because the orchestrator's format step is optional) — already closed at commit `125fc84f`, per its
own original finding; **its residue is also ruled (owner, 2026-07-31): `format:check` joins the
mandatory gate** — the Gate block above is amended accordingly.

---

## M7 — Testing strategy: the sweep as a gate, an owner ruling on N13, and a UAT checkpoint before the LLM pilot

Sequenced per `docs/TESTING-STRATEGY.md` Part G (2026-07-31 addendum): the cheap, mechanical,
already-spec'd testing-infra work (T-152, T-153, T-157) runs first and protects everything else
from silently regressing. Two genuine human decisions sit after it, each a hard gate per the
skill's `[BLOCKED BY = ...]` convention — neither is this track's to decide, and the run halts at
each rather than guessing: **T-156** is `NPC_REDESIGN.md`'s own N13 ruling, explicitly recorded as
"the owner's, made at step start and recorded here — not drifted into" (`NPC_REDESIGN.md:1477-1479`)
— it is not new scope, just scheduled here so it isn't skipped. **T-158** is the owner's first UAT
pass, which Part G's own analysis says neither the sweep nor an LLM pilot can substitute for.
**T-155** (running the native LLM pilot) is resequenced to run **after** T-158, not before — Part G's
recommendation #6: the owner's own first UAT is a better first Tier-2 pass than a cold LLM run, and
funding the pilot before knowing what a human finds risks measuring the wrong thing. **T-154**
(building the driver) is **not** part of that gate (owner, 2026-08-01) — Part G's argument is about
not *running* the pilot cold, which doesn't bear on standing up the code; see the resequencing note on
T-154 itself.

**ADDED 2026-08-02 (owner-directed, from the outside assessment of the 0.5.2 arc): T-160, T-161,
T-162, plus amendments to T-158.** The assessment's five attention items land here as follows.
(1) **T-160** fixes F-137-1 (the Liar's Dice dealer's certain-loss structure) and runs BEFORE the
UAT halt — the owner's first human read of the bar must not be taken against a dealer who plays to
lose; T-158's `after:` names it, machine-enforced per the T-155 lesson. (2) N13 and the two
distinctive verbs' fleet coverage were already captured (T-156, T-157, and T-158's brief) — no new
task. (3) Explore's still-net-loss status and (4) F-150-1's disposition-inertness numbers join
T-158's pre-UAT brief, and F-150-1 is promoted to a second recorded-ruling ask at that checkpoint,
alongside Combat's. (5) **T-161** closes F-159-1 (veteranPolicy, the last un-relaxed contract
filter — sim-side only, so it sits above T-158 for run order but does NOT gate it) and **T-162**
finally gives the TESTING-STRATEGY bridge-blind-spot's "still-open" browser/DOM-level check an
owner (after T-158, so it cannot compete with pre-UAT work). Resulting run order:
T-153 → T-157 → T-156 → T-154 → T-160 → T-161 → T-158 (halt for UAT) → T-155, T-162.

### T-156 · Build: N13 dawn-hand parity — the algorithmic virtual hand — `status: DONE` · `coder: opus` · `after: T-130`
Owner ruling recorded 2026-07-31 (`NPC_REDESIGN.md` N13 section and STATUS BOARD): design **(b)**, the algorithmic equivalent. Keep the NPC's one-verb day; derive the day's quality from a virtual hand drawn under the same RNG discipline the player's hand uses, with N5's proficiency lever (`PilotDegradationProfile`, once N5 lands) expressed as allocation noise on that virtual hand. Flag the virtual-hand function at its definition site as the one sanctioned abstraction in the parity design — a comment or doc-block making clear it is a MODEL of the decision, not the decision itself, so it doesn't get mistaken for real parity later. `Crew` and `Reroll` stay player-only as a **ruled exclusion**: update THE PARITY LEDGER in `NPC_REDESIGN.md` to record both rows as excluded-by-ruling rather than open gaps. This task is **not gated on N12** (port-buying) — the run order in `NPC_REDESIGN.md` sequences N12 before N13 for measurement-sequencing reasons, not a technical dependency; the virtual-hand mechanism doesn't read NPC port state. Simulate per the doc's own spec: full sweep + per-captain outcome variance decomposition (verb-weight luck vs. skill).
**Accept:** the virtual-hand function exists, is grep-able, and is flagged at its definition site as the sanctioned abstraction; `NPC_REDESIGN.md`'s PARITY LEDGER records `Crew`/`Reroll` as ruled exclusions (not TODO/gap rows); a sweep-based capstone reports the variance decomposition per the doc's "Simulate/Proves/Disproves" spec, with the result (proved or disproved) reported plainly either way; gate green.

**DONE 2026-08-02.** `packages/engine/src/npcHand.ts` — `npcVirtualHand()` built once per captain-day in `resolveNpcDay`, `allocateVirtualDie()` spent at BOTH check sites (`rollNpcCheck`, `rollEncounterCheck`), dealt through the player's own `rollDawnHand` and spent through the player's own `spendDie`, flagged at its definition site under the marker `THE ONE SANCTIONED ABSTRACTION` (the same string `npc.ts` already carried, so one grep finds both). PARITY LEDGER `Crew` and `Reroll` now read `**EXCLUDED (owner ruling 2026-07-31, shipped at N13 / T-156)**`, transcribed as `'excluded'` in `coverage.ts` and mirrored in `TESTING-STRATEGY.md` Part C — the drift test enforces all three in both directions. Reroll's exclusion is STRUCTURAL: the hand is dealt with `rerolls: 0`.
**Result: CHANGE ACCEPTED · HYPOTHESIS DISPROVED AS STATED**, reported plainly in `NPC_REDESIGN.md`'s N13 Result. Three 8,000-row arms (`baseline-n13-pre` / `-control` / `-shipped`, `--merge` reporting `wrote aggregate for 8000 rows` on each, both flags honoured); fleet-wide skillShare 0.7527 → 0.7407 → 0.7452, so the SHIPPED−CONTROL gap (+0.0045) is inside the 8-shard noise floor and the dominant effect is that the HAND ITSELF is a variance reducer. WITHIN archetype — the axis standing amendment 4 named — the gap is positive in 8/8 independent shards for explorer (+0.0432), fighter (+0.0306) and veteran (+0.0165) and a coin flip for trader/smuggler/gambler, and the structural cause is N4's verb payout asymmetry (`NPC_CHECK_DCS`: the Trade check carries no credit consequence). Cast median wealth +8.7% attributably, mean unmoved (+0.0%), ships lost −6.8%, player clear rate unmoved; **the p10 floor did not move for the FOURTH time (126 → 127)**. Hand exhaustion measured at 3.48% of allocations. Baseline of record re-pinned to `baseline-n13-shipped.json` in all four places, smoke fixture re-extracted FROM it with `spreads harvested`. N5 is UN-GATED and its lever list rewritten at N13's close as its own section instructed. **OI-9 stays open.** No save-shape change. Gate green: 2,149 passing / 0 failing.
**Found and filed, not fixed here: F-156-1 → T-182** (`spendDie` drops `rerollsRemaining`), with the written risk analysis on that task.

**Delivered (2026-08-02):** `packages/engine/src/npcHand.ts` — `npcVirtualHand()` (lazily-dealt so a day that rolls nothing consumes nothing) and `allocateVirtualDie()`, spent at both NPC check sites (`rollNpcCheck`, `rollEncounterCheck` in `npc.ts`), dealt through the player's own `rollDawnHand` and spent through the player's own `spendDie`. `resolveNpcEncounter` and `executeTrade`/`executeCombat`'s stance checks now thread the day's `NpcVirtualHand` instead of drawing a bare `rng.d20()`, and `npc.ts`'s definition-site comment (`THE DIE GAP, CLOSED AT N13`) records what N13 closed and what remains open (`executeCombat`'s branch choice). Calibration lives in `packages/content/src/ideals.ts` as two measured constants, `NPC_ALLOCATION_PIVOT_STAT` (2, the roster's measured median stat) and `NPC_ALLOCATION_SHARPNESS_PER_STAT` (0.1), chosen so a median-stat captain's allocation is distributionally neutral (E[middle of 5 sorted d20s] = 10.5, a plain d20's mean) and the step moves outcome SPREAD without moving the fleet economy. PARITY LEDGER `Crew`/`Reroll` recorded as ruled exclusions in `NPC_REDESIGN.md`, transcribed as `'excluded'` in `packages/sim/src/balance/coverage.ts`, and mirrored in `docs/TESTING-STRATEGY.md` Part C with a drift test enforcing all three in both directions. Sweep capstone: three 8,000-row arms (`docs/balance/baseline-n13-{pre,control,shipped}.json`) show the SHIPPED−CONTROL fleet-wide skillShare gap (+0.0045) inside the 8-shard noise floor — HYPOTHESIS DISPROVED AS STATED — while the gap is positive in 8/8 shards within explorer/fighter/veteran, reported plainly in `NPC_REDESIGN.md`'s N13 Result section; baseline-of-record and the balance smoke fixture (`docs/balance/smoke/tiers.json`, `docs/balance/smoke/README.md`) re-pinned/re-extracted from `baseline-n13-shipped.json`. Test coverage added in `packages/engine/src/__tests__/npc-virtual-hand.test.ts` plus updates to `npc.test.ts`, `recovery.test.ts`, and the affected `packages/sim` suites (`alliance-arcs`, `archetype-coverage`, `balance-report`, `balance-targets`, `campaign-degraded`, `campaign-reach`, `era-storylet-coverage`) and both golden fixtures (`day-loop-golden.ts`, `replay-golden.ts`) regenerated against the shipped hand. **Deliberate scope boundary:** F-156-1, the `spendDie`/`rerollsRemaining` bug found while building this, is filed to T-182 and NOT fixed here — it is a player-side die-spending defect the virtual hand never reads, and folding it in would move `rulesFingerprint` and confound N13's variance decomposition with a second, unrelated rule change (written risk analysis on T-182 itself).

Orchestration: graphify=none — no graphify-out/graph.json in the repo root · attempts=1/4.

### T-182 · Fix F-156-1: `spendDie` silently destroys the day's re-roll charges — `status: DONE` · `coder: opus` · `after: —`

**Delivered (2026-08-02):** `packages/engine/src/dice.ts` `spendDie` now returns a complete copy of the input `DawnHand` — `rerollsRemaining` is carried across (preserving true absence rather than coercing to `0`, and spread last to keep key order matching `rollDawnHand` for the serialized-hand golden hashes) instead of the old `{ dice, spent }` rebuild that silently dropped it. A definition-site contract comment documents both call-site families (assign-the-returned-hand vs. mutate-`spent`-in-place) and why the invariant reconciles them without rewriting either. Coverage: `packages/engine/src/__tests__/dice.test.ts` pins the contract directly (charge survives every spend, absence stays absent, the two call-site families produce `toStrictEqual` hands); `packages/engine/src/__tests__/crew.test.ts` adds the end-to-end player path (hire the reroll role → sleep to next dawn → spend a die on a real assign-family action → `Reroll` still succeeds); and the new `packages/engine/src/__tests__/spend-die-rerolls.test.ts` drives every one of the six assign-family call sites through `applyPlayerAction` to guard the site list against drift. Because the fix touches `dice.ts` (inside `ENGINE_RULE_DIRECTORIES['']`), `rulesFingerprint` moved and a full capstone was owed regardless of whether any balance number moved: a fresh 8,000-row sweep (`docs/balance/baseline-t182-reroll-fix.json`, `sweepLabel t182-reroll-fix`) was taken and `balance:diff` against `n13-shipped` reports **NOTHING MOVED** across all 8,000 careers — predicted in advance, not just discovered, because the sim's `withReroll` prepends its `Reroll` to the dawn batch and no sim policy ever reads `rerollsRemaining` after a die is spent, the only window the bug lived in. All five baseline-of-record pointers (BR-14 now names five, not four — this task added the rule's own "current baseline of record" sentence as the fifth after it was found to be a fifth untracked copy) were re-pinned in this commit: `packages/sim/src/__tests__/balance-targets.test.ts`, `docs/BALANCE-RIG-DECISIONS.md` BR-14's own text, `docs/NPC_REDESIGN.md`'s status banner and Result-section pointer, and `docs/balance/smoke/README.md` plus the re-extracted `docs/balance/smoke/tiers.json`. **Deliberate scope boundary:** the six call sites were fixed by correcting `spendDie`'s single rebuild, not individually; the four already-safe mutate-in-place call sites (`crew.ts`, `port.ts`, `hangout.ts`, `dare.ts`) were left untouched by design and proven equivalent by test rather than refactored to match the assign family, per the Accept criteria's "reconciled or documented" clause.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root · attempts=1/4.

**Found at T-156 (2026-08-02) while reading `dice.ts` for the virtual hand's RNG discipline. PLAYER-SIDE bug, not an NPC one.** `spendDie` (`packages/engine/src/dice.ts:188`) rebuilds the hand as `{ dice, spent }` and **drops `rerollsRemaining`**:

```ts
const newHand = {
  dice: [...hand.dice],
  spent: [...hand.spent],
};
```

Six call sites assign that returned hand straight back onto the save — `actions/trade.ts:23,76,122,163`, `actions/travel.ts:586`, `actions/shipyard.ts:629`, `actions/exploration.ts:115`, `actions/combat.ts:267`, `storylets.ts:238` — so **the first die a player spends on any of those actions wipes the day's re-roll charges**. `actions/crew.ts` `resolveReroll` then reads `(hand.rerollsRemaining ?? 0) <= 0` and refuses with `no-rerolls-left`. The charge is reachable and paid for: `packages/content/src/crew.ts:97` ships a crew role whose benefit is `{ kind: 'reroll' }`, and `EXPLORE_MODULE_DICE_BENEFITS['module-marked-ephemeris']` (`crew.ts:240`) grants a second. The call sites that mutate in place instead (`crew.ts:138,161`, `port.ts:66`, `hangout.ts:319`, `dare.ts:380`) are accidentally safe, which is why this survived — the two families disagree and only one of them is right.

**Why it is deferred out of T-156 rather than fixed inside it (the written risk analysis the Bug Discovery Policy requires, both limbs):**
(a) **Out of scope.** T-156 is NPC parity. The defect is in the PLAYER's die-spending path; the virtual hand deals with `rerollsRemaining: 0` by ruling and never reads the field back, so nothing T-156 ships depends on the broken behaviour or on the fix.
(b) **It does not roll up debt — and folding it in would create some.** `dice.ts` is inside `ENGINE_RULE_DIRECTORIES['']`, so the fix moves `rulesFingerprint`; restoring a charge the sim's `legalActions` advertises (`Reroll` is offered only while `rerollsRemaining > 0`) can change seeded careers. Landing it in T-156's commit would put **two** rule changes under one capstone and make N13's variance decomposition unattributable — precisely the confound N4's control arm exists to prevent. It needs its own inert-extraction commit, its own golden regeneration and its own capstone, which is a task, not a rider.

**Accept:** `spendDie` preserves `rerollsRemaining` on the hand it returns; a test spends a die on each of the six assign-the-returned-hand call sites and asserts a crew-granted charge survives, and a second test drives hire-reroll-role → spend a die → `Reroll` end to end and sees it succeed; the two call-site families (assign vs. mutate-in-place) are reconciled or the divergence is documented at `spendDie`'s definition site; capstone re-taken and the four baseline-of-record pointers re-pinned if the sweep moves; gate green.

### T-154 · Build: native LLM pilot policy for the player seat — `status: DONE` · `coder: opus` · `after: T-130`

**RESEQUENCED (owner, 2026-08-01):** originally `after: T-158`, matching Part G recommendation #6
("run the pilot after the first human UAT, not before"). On review, that reasoning is a
*prioritization* argument about the pilot **run** (T-155) — don't spend a cold Tier-2 pass before you
know what the owner finds by hand — not a technical or data dependency of the **driver build** itself.
Neither this task's Accept criteria nor T-155's reference anything T-158 produces. Split accordingly:
T-154 (build only) now runs as soon as its real prerequisites (T-130) are met, so the driver exists
before UAT rather than after it; **T-155 stays gated on T-158**, preserving the actual intent — the
pilot's first real run still waits so it can reproduce/extend what the owner's own UAT surfaces
instead of running cold.

**BLOCK MOVED ABOVE T-158 (2026-08-02) — the resequencing above was inert until this.** The split was
recorded in the `after:` fields but not in block ORDER, and the orchestrator picks the first eligible
TODO *in file order*. T-158 carries `[BLOCKED BY = Human UAT]` and HALTS the entire run — so with T-154
sitting below it, this task was unreachable and the driver would not have existed at UAT time, which is
the exact outcome the split was written to prevent. Do not move this block back below T-158. The
companion fix is on T-155, whose `after:` now names T-158 explicitly rather than relying on prose.

Implement a `SimPolicy` (or a driver against `packages/sim/src/protocol-stdio.ts`) that has an LLM pick the player's actions each day from the real legal-actions list, in-repo — no dependency on the external UGT package. Reuse the adapter discipline from `packages/sim/PROTOCOL.md`: an unmapped/illegal action must be rejected, never fabricated. Log state deltas per action (mirroring T-1604a's JSONL shape) so a run's findings are reviewable after the fact. Note the bridge-blind-spot risk recorded in the UGT after-action report (`/Users/vs7/Dev/Games/_UGT Universal Game Tester/AFTER-ACTION-REPORT.md` §Addendum): a protocol/state-level driver like this one cannot see UI-only bugs (a real browser/DOM-level check is a separate, still-open need, not covered by this task). This task builds the driver only — T-155 proves it's trustworthy before it's relied on.
**Accept:** the driver runs against the real engine via the protocol seam and produces a reviewable action/state-delta log; illegal-action attempts are rejected and logged, never silently applied; a short README documents how to invoke a run and states plainly that this covers protocol/state-level behaviour only, not the UI.

**Delivered (2026-08-02):** A `SimPolicy`-shaped native pilot driving the player's seat over the real protocol seam (`packages/sim/src/protocol.ts`, `handleMessage`), split pure/IO per the repo's own discipline: `src/pilot.ts` (candidate enumeration off the live `legal-actions` response, the decision gate, the day loop, the JSONL emitter, and three deterministic brains — `first-legal`, `random`, `recorded`-replay), `src/pilot-anthropic.ts` (the sole file that talks to the Anthropic API — a `json_schema`-constrained `actionId` enum of exactly the enumerated candidates, zero-arg client construction so an `ant auth login` profile works with no key hardcoded), and `src/pilot-cli.ts` (argv, transport wiring, JSONL file, exit code). No-fabrication is structural, not a convention: `resolveDecision` maps a model answer to a candidate or rejects it (`unknown-candidate-id` / `unparseable` / `refusal` / `brain-error` / `illegal-candidate`), there is no code path that builds a `PlayerAction` field from a model-supplied value, and `assertCandidateIsLegal` re-checks every filled parameter against the live spec immediately before dispatch. After `maxBrainRetries` the driver falls back to a deterministic legal candidate and marks the step `fellBack: true`, recorded rather than silent (T-1604a's P4 finding, applied here before it could recur). Three counters the sweep cannot observe (`balance/gate.ts`'s `SWEEP_INVARIANT_DISPOSITIONS` names T-154/T-155 as owner) are now measured directly off the JSONL: `blockedFromLegal`, `protocolErrors`, `diceBoundsViolations` — the CLI exits non-zero if any of these or `illegalAttempts` is nonzero. `npm run pilot -- --seed 1 --days 30` runs the free `first-legal` brain by default so an accidental invocation costs nothing; an unrecognised `--brain` is a hard error rather than a silent fall-back. Determinism is pinned and tested: seed/rng inside `state.rngState`, candidate enumeration order, the day loop and fallback rule, and `--brain recorded` replays a prior run's JSONL byte-for-byte against the same seed; LLM sampling itself is explicitly NOT pinned, documented rather than glossed over. Coverage: `src/__tests__/pilot.test.ts`, including a spy-transport test proving four hostile brains (unknown id, prose, thrown error, out-of-domain candidate) each produce a logged rejection and zero `apply-action` requests reaching the engine, plus the byte-identical-JSONL determinism test. `packages/sim/PILOT.md` documents invocation, the schema, the pinned/not-pinned table, and states plainly in its own §2 that this is a protocol/state-level driver that cannot see UI-only bugs by construction, citing the UGT after-action report's addendum on exactly that bridge-blind-spot risk — a real browser/DOM tier remains a separate, still-open need. `rules-fingerprint.ts` records `pilot.ts` / `pilot-anthropic.ts` / `pilot-cli.ts` as non-instrument sources (never called by `runCampaign`, never exported by `index.ts`) so no sweep or smoke number depends on them; no `rulesFingerprint` move, no capstone owed. **Deliberate scope boundary:** this task builds the driver only. Proving it trustworthy at volume — a real multi-seed live run, illegal/crash/hang confirmation, and the twice-run determinism check — is T-155, which stays gated on T-158 and must not be treated as satisfied by this task's own unit tests. The stdio-subprocess transport and the browser/DOM-level tier are both named-and-deferred in `PILOT.md` §7/§2 as distinct, still-open needs, not gaps in this task's Accept criteria.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I grounded the plan in `packages/sim/PROTOCOL.md`, `protocol.ts`, `balance/rules-fing · attempts=1/4.

### T-160 · Fix F-137-1: the dealer's certain-loss structure — bakeoff the two sanctioned shapes, ship the winner — `status: DONE` · `coder: opus` · `after: T-148`

**Scheduled 2026-08-02 (owner-directed): runs BEFORE the T-158 UAT halt**, because UAT's whole
purpose is the owner's first honest read of pacing and dice-tension, and the bar as shipped
distorts that read — playing it now means paying for a second UAT pass on the game's biggest new
system after the fix lands anyway.

**The finding** (`docs/LIARS-DICE_REDESIGN.md` §16.2, filed at T-137; still live at T-148 per
`docs/LIARS-DICE-PROGRESSION_SPEC.md` §12 — win rate 80.07% post-roster, 100.00% of pool-B openers
still guaranteed true): the defect is the *conjunction* of two individually-defensible choices.
`planDareMove` branch (b) (`packages/sim/src/index.ts:~3593-3607`) opens at
`quantity = own(bestFace)`, which `resolveChallenge`'s eight-dice count makes guaranteed true; and
`dealerMove`'s terminal fallback (`packages/engine/src/liarsDiceRules.ts:~345-350`) is CHALLENGE —
so the dealer challenged a true claim on 90.48% of its decisions and lost 94.68% of those. Result
at T-137: 94.66% player win rate, +737.53cr EV/hand, gambler `finalCredits.median` +67.2%. §16.2's
own verdict: "a bidding game in which the opening claim can be made risk-free, against an opponent
whose default answer is to call it, has no bluffing in it at all."

**The two candidates are §16.2's first two shapes, verbatim — no third:** (a) **the dealer's
fallback** — terminal fallback becomes the cheapest legal *raise*, CHALLENGE reserved for the
surplus test; (b) **the opening lattice** — an opening claim must exceed what the bidder holds
(`quantity > own(face)`), removing the risk-free claim at its source. §16.2's third shape (teach
the baseline planner to lie) is explicitly NOT a candidate — it moves the measurement without
moving the game. Bakeoff both per the /bakeoff discipline: implement each candidate in isolation,
simulate, and judge on named criteria — the conjunction is broken (openers no longer risk-free, or
the dealer no longer auto-calls them); the win rate lands in a defensible band; the challenger-won
split is no longer 5.32%-vs-94.92% lopsided; **F-137-2's wronged share is EXPECTED TO FALL and
must not be read as a regression** (§16.8 item 2, pre-committed here); FOLD and the player-side
clamp re-measured (§16.8 items 5-6 — if FOLD is still dead post-fix, that is a finding to FILE for
the owner, not a license to redesign FOLD in this task). If the numbers cannot arbitrate between
the shapes — i.e. both close the defect and the residual difference is player-experience taste —
HALT and escalate to the owner rather than picking; log the not-chosen shape either way, per the
D1/D7 precedent.

**Cost discipline:** shape (b), and possibly (a), edits `packages/engine/src` — `rulesFingerprint`
MOVES, so this task takes its own capstone (implement + 8,000-row re-pin in ONE task, per the
batch rule; `npm run format` BEFORE extraction). Predict the moved rows before the run: expect
`gambler` and `fleet`, expect the gambler median to FALL from t148's level, and expect the
archetype ordering re-check to come back un-inverted (F-148-1 traced the `optimal`-softer-than-
`bad` inversion to F-137-1; if it survives the fix, that is a distinct finding to file). Also
restate `liars_dice_grand_slam` reachability (0 in 720 careers at T-148) on the post-fix arm — a
harder dealer makes it *less* reachable, and the owner should get that number next to the ruling
it will eventually need.

**Accept:** the shipped shape is grep-able at its named site (`dealerMove`'s fallback or the
opening-lattice rule); a capstone re-measures win rate, EV/hand, dealer-challenge share and the
challenger-won split against `baseline-t148-roster-ladder.json`, with moved rows predicted before
the run; F-137-2 re-read with the expected fall-back stated as such; FOLD and clamp restated
post-fix (fixed or filed); the archetype-ordering re-check reported either way;
`docs/LIARS-DICE_REDESIGN.md` §16.2's status updated to fixed-at-T-160 with the not-chosen shape
logged; gate green.

**Delivered (2026-08-02):** **Shipped §16.2 shape (b), THE OPENING LATTICE.** New engine rule
`minOpeningQuantity(own) = own + 1` in `packages/engine/src/liarsDiceRules.ts`, enforced in
`isLatticeMove`'s `bid` arm through a new **required** `ownOfClaimedFace` parameter (the T-146
`maxQuantity` precedent — a required parameter turns the call-site sweep into compile errors). All
four sites threaded: `engine/actions/dare.ts` (the refusal, still `illegal-dare-move`, still spends
nothing — asserted byte-for-byte on credits, both escrow pots and the dawn hand),
`sim/protocol.ts` (the advertised `quantity.min`, derived as `1 + min over faces of own(face)`
since the params are advertised independently), `ui/App.tsx` (`claimOk` + the opening composer's
seed, so the pane does not open on a claim the engine refuses), `sim/index.ts` (`planDareMove`
branch (b) opens at the floor — the *rule* moved under the planner, which is why this is **not**
§16.2's banned third shape; the code comment says so at the site). **Extraction before addition:**
the signature widening landed first with the `bid` arm unchanged, whole engine suite green and
every behavioural golden unmoved, before the predicate flipped.

**The bakeoff** (`docs/LIARS-DICE_REDESIGN.md` §17.3): three **git worktrees** off the same
commit — `control` / `cand-a` / `cand-b` — each with isolated `node_modules/@spacerquest` links, so
the main tree stayed byte-clean throughout (`git status` verified before and after). Identical
seeds, one harness, `gambler` 1..200 × 120 days per arm (33.6k–34.0k hands each). The rig was
validated on predictions it did not produce: the control reproduced T-148's **100.00%** openers-
guaranteed-true exactly and its sampled figures within ~0.5 pp (80.30% vs 80.07% win rate,
`optimal` 84.51% vs 84.69%, `bad` 69.13% vs 68.78%, wronged lift 2.933× vs 2.875×, 0 grand slams).
Fidelity gates asserted to **zero on every arm**: `dareGuardHits`, hands left open,
`timeout-fold`, unresolved hands, per-`handId` join misses, interceptor reconstruct misses; plus a
six-channel `runCampaign` check on 5 (seed, policy) pairs.

**Shape (a), the dealer's fallback, was implemented in full and LOST on two pre-committed
criteria** (logged per D1/D7 in `docs/LIARS-DICE-DECISIONS.md` **LD-21**): it leaves openers
**100.00% guaranteed true on both pools** — it changes the answer to the claim, never the claim —
and its **73.04%** win rate fell outside the pre-committed 55–70% band. Scoped to `dealerMove`, it
also leaves pool A (57% of hands played) untouched. It is not dead: it is an independent lever
still available on top of (b), noted under F-160-2. §16.2's third shape was never a candidate.
**The HALT rule did not fire** — the numbers arbitrated on two named criteria, not on taste.

**The four owed numbers, Arm 2 (`gambler`, 600 careers, n = 101,616 hands):** openers guaranteed
true **100.00% → 0.00%** (both pools); player win rate **80.30% → 61.07%**; EV/hand **+565.8 →
+197.3 cr**; dealer challenge share of its own decisions 60.18% → 81.81%; **challenger-won split
18.46%/70.84% → 40.73%/82.43%** — the dealer's own challenge-win rate is off T-137's 5.32% and
close to a coin flip. Diffed against **`baseline-t182-reroll-fix.json`** (the actual baseline of
record at HEAD — the task block's `baseline-t148-roster-ladder.json` was two capstones stale) for
attribution, and against `t148` for the economic read.

**Predictions, written down before the first run** (§17.1) — five of six correct: moved rows
`gambler` + `fleet` only ✅ (`balance:diff` reports exactly those two, seven rows byte-identical);
`gambler.finalCredits.median` 97,930 → **67,716** (−30.9%) ✅, `tourOneClearRate` 0.9690 → 0.9020 ✅,
`portOwnershipRate` 0.9870 → 0.9100 ✅, `survival.shipsLost` 22 → 16 ✅; F-137-2's share falls ✅;
grand slam less reachable ✅. **Prediction 6 was WRONG** — see F-160-1.

**F-137-2 re-read, with the fall stated as pre-committed** (§17.6): wronged share fell (gambler
26.63% → **19.82%**, fleet 8.87% → **7.66%**), which §16.8 item 2 pre-committed as EXPECTED and NOT
a regression. The number that measures the weighting rather than the roster's mood did **not**
collapse: the lift over uniform ROSE on the gambler arm (2.933× → **2.985×**, above T-148's 2.875×
and T-125's 2.956×) and is flat on the fleet arm (2.455× → 2.416×, above T-148's 2.379×).
Reconstruct misses **0 / 4,491** and **0 / 5,756** — the copied `chooseWeighted` arithmetic
validated, not assumed. No disposition constant touched.

**FOLD and the clamp restated** (§17.7): FOLD's legality is still 100.00% and its take rate rose
0.32% → **3.51%** of post-bid decision points, but §16.3's dominance derivation is untouched by
this fix, so it is still never the better credit play — **FILED as F-160-3**, not redesigned. The
clamp's §16.5 premise inverted: shape (b) makes hands **shorter** (1.980 → 1.301 bids/hand), and
the measured clamp rate is **0 on both sides** (player 0/11,950, dealer 0/18,678) — a cleaner
statement than §16.5's, with the F-137-1 confound gone. `liars_dice_grand_slam` restated on the
post-fix arm: **0 / 600 and 0 / 960 careers**, seats-beaten median 29 → 26, ports-cleared median
3 → 1 — harder, as predicted.

**Capstone gate.** `npm run format` BEFORE extraction; `npm test` + `npx tsc -b` + `npm run lint` +
`npm run format:check` all exit 0 with **zero failing tests**; 8 shards **1-indexed** with
`--milestone-days 21,29,30,41,60,120` and the full eight-policy list, `--merge` reporting exactly
**8000 rows**, gate **PASS** with 0 invariant violations, `balance:extract --aggregate`.
`rulesFingerprint` `d0388cb50b0f9a11` → `fbcfe11ab7772555`, `instrumentFingerprint`
`e81bc730c94b1fce` → `70d2ccbad279ff08`, `docsFingerprint` → `e2efb468b7e8bcba`. Baseline of record
re-pinned in all four sites (`balance-targets.test.ts`, `docs/NPC_REDESIGN.md` ×2,
`docs/balance/smoke/README.md`). **`CURRENT_SAVE_VERSION` does NOT move (15)** — no persisted shape
changed, so no migration is owed; stated rather than left unaddressed.

**Two re-derivations, both with their containment proved rather than asserted, and NO threshold,
band, fingerprint or golden edited to make anything pass.** (1) `campaign-degraded.test.ts`'s
gambler fingerprint, entry **28**: exactly ONE of seven rows moves, because the rule is reachable
only through an open Liar's Dice hand and `planDare` is queued by `gamblerPolicy` alone — the six
unmoved rows are the proof. (2) `deed-coverage.test.ts` **WIDENED 1..65 → 1..76**, which is a
widening and not a re-pin: every number in the file is byte-identical, the union is still 44/44,
and a 160-seed re-sweep found **ten** individually-total careers where T-115's found two (the slate
got *easier* to complete in one life); 1..76 is the shortest contiguous range holding two. The long
pole is still `slipped_the_scan`, and **no dice deed is a near-miss pole** — the direct check that
this is trajectory re-phasing, not harder dice.

**Test re-authoring, done the way the plan required — derived from state, never seed-chasing.**
Every hardcoded opening claim across `liarsDice.test.ts` (22 sites), `liarsDiceLadder.test.ts`,
`liarsDiceAchievements.test.ts`, `protocol.test.ts` and `liars-dice-pane.test.ts` now derives its
quantity from the hand the seed actually rolled via `minOpeningQuantity`. The two dealer-blindness
experiments needed real thought rather than a literal bump: a claim derived from the varied hidden
dice would change the dealer's INPUT, and a claim tall enough to clear every variant gets CALLED on
move one and makes the experiment vacuous — so the variant table now spans the five faces that are
NOT the claimed one (30 variants, up from 20), `own(3) = 0` on every one, and the public claim is
both fixed and minimal, with `assertBlindOpenIsLegal` proving both properties so a later edit
cannot quietly re-break it. `liarsDiceAchievements.test.ts`'s header claim that "seed 1 wins" was
true only *because of* F-137-1, so the win is now DERIVED (`playWonHand` searches and throws if no
seed wins) rather than hoped for. New T-160 block in `liarsDice.test.ts`: the floor's arithmetic,
refusal-at-or-under / acceptance-at-own+1 across `dicePerSide` 4/5/6, the **totality** proof
executed on a six-dice all-distinct hand and a four-of-a-kind hand, the resolver's refusal spending
nothing, **the defect gone at its source** over 2,000 sampled hands (guaranteed-true = 0, false-
opener rate > 0), and the dealer-never-opens property asserted rather than argued.

**Also fixed, because the fix was free on a line already being edited** (Bug Discovery Policy):
`sim/protocol.ts` advertised the dare `quantity.max` as a hardcoded `8` instead of
`hand.maxQuantity`, under-advertising the domain at every tier ≥ 1 (where it is 10 or 12). It sat
on the same object literal the opening floor had to be threaded through. `protocol.test.ts` now
derives both bounds from the hand.

**Three findings filed** (§17.8, and as backlog rows T-175/T-176/T-177 below): **F-160-1** the
archetype inversion SURVIVES the fix (prediction 6 was wrong — `optimal` 64.48% vs `bad` 51.98%,
z = −21.02 at n = 52,021; narrowed from −15.38 pp to −12.50 pp but neither closed nor flipped, so
it is only partly downstream of F-137-1 and `archetypeMove`/`BAD_CREDULITY` were NOT touched);
**F-160-2** the challenger-won split does not reach the pre-committed ≤20 pp under either shape
(41.7 pp; the criterion did not price the player planner's selectivity — reported as a miss, no
threshold edited); **F-160-3** FOLD is still never the better credit play.

**Delivered (2026-08-02):** Shape (b), the opening lattice (`minOpeningQuantity(own) = own + 1`),
was chosen from the two sanctioned bakeoff candidates after shape (a) — the dealer's fallback —
lost on both pre-committed criteria (openers still 100% guaranteed true; win rate outside the
55–70% band); the fix threads through `liarsDiceRules.ts`, `dare.ts`, `sim/protocol.ts`,
`sim/index.ts`, and `App.tsx`, closes F-137-1 at its source (openers guaranteed-true 100.00% →
0.00%), and re-pins the full capstone (`rulesFingerprint`/`instrumentFingerprint`/`docsFingerprint`,
diffed against `baseline-t182-reroll-fix.json` for attribution). **Deliberate scope boundary:**
shape (a) was implemented and measured but not shipped — it is logged as an independent lever
(F-160-2) rather than discarded, and FOLD's dominance/clamp behavior and the archetype-ordering
inversion (F-160-1) were restated post-fix but explicitly not redesigned, per the task's own Accept
criteria.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; only `.scratch/`, `docs/`, `packages/` present), so I grounded the plan directly in `docs/LIARS-D · attempts=1/4.

### T-161 · Fix F-159-1: veteranPolicy's un-relaxed contract filter — the last of the class — `status: DONE` · `coder: opus` · `after: T-159`

**Scheduled 2026-08-02 (owner-directed).** F-159-1 (filed at T-159, recorded at
`docs/BALANCE-POLICY.md` D.2a): `veteranPolicy` (`packages/sim/src/index.ts:~4903-4909`) is the
last un-relaxed contract filter in the file, structurally identical to the fighter defect T-159
fixed — measured at 31-day stalls on **197 of 200 seeds ≥ 5**, materially worse than the "6-8
days" its exemption note in `gate.ts` `GATE_COMPETENT_POLICIES` claims. Sim-side only, so it does
not gate UAT (T-158's `after:` deliberately omits it); it sits above T-158 for run order, and if
ever reordered below the halt it simply runs post-UAT — acceptable, documented here.

Port the T-1104 full-tank relaxation (the same two-pass pattern all five other gated policies now
carry). **Measure before assuming one branch suffices** — T-159's brief was one branch short and
its commit says so; check whether veteran also needs the anti-idle homeward-burn second branch on
the same seeds-1..200 × 35-day rig. Then correct the stale "6-8 days" exemption comment in
`gate.ts` to post-fix measured reality, and decide WITH the measurement whether veteran now joins
`GATE_COMPETENT_POLICIES` or keeps a re-justified, re-numbered exemption — either is fine; an
exemption whose stated number is off by 4x is not. Fingerprint discipline per T-159's precedent
exactly: `instrumentFingerprint`/`docsFingerprint`/`provenance.gitCommit` move, `rulesFingerprint`
must NOT (sim only); expect exactly the veteran row of `campaign-degraded.test.ts`
`PINNED_FINGERPRINTS` to move, all other archetypes byte-identical as the containment cross-check.
**Do NOT touch** F-150-2 (`smugglerPolicy`/`planPacifistCombat`, pinned by tripwire) — same
out-of-scope reason as at T-159.

**Accept:** the relaxation (and, if measurement demands it, the second branch) is grep-able in
`veteranPolicy`; seeds 1..200 × 35 days re-measured with the streak table restated against the
before-numbers (31 days / 197 of 200 ≥ 5); the `gate.ts` exemption comment matches post-fix
reality, with veteran either joining the gate or carrying a re-justified exemption; F-159-1's
record in `docs/BALANCE-POLICY.md` updated to fixed; the exact CI sweep-gate invocation PASS on
all legs; only the veteran fingerprint row moves; gate green.

**Delivered (2026-08-02):** ported the T-1104 full-tank relaxation into `veteranPolicy`
(`packages/sim/src/index.ts`) — the same `signableWithin(cap)` two-pass pattern the other five
gated policies already carry — closing F-159-1, the last un-relaxed contract filter in the file.
Re-measured seeds 1..200 × 35 days: worst zero-income streak fell 31 → 13 (the nine seeds that
held the 31-day strand drop to 5-10), and the count at ≥ 5 barely moved, 198 → 197, because a
second candidate branch (the fighter's anti-idle homeward burn) was tried and measured, not
assumed, and rejected — it moved the worst streak 13 → 11 but seeds ≥ 5 the wrong way, 18 → 19,
so it was reverted. `balance/gate.ts`'s exemption comment was corrected from the stale,
unmeasured "6-8 days" to the re-measured pre-/post-fix figures, and the veteran deliberately
stays exempt rather than joining `GATE_COMPETENT_POLICIES` — the residual 197-of-200 is a
second, separately-filed defect (F-161-1: the un-split storylet branch takes every offered
storylet as a standalone day, eating dawns before the contract block is ever reached), recorded
in `docs/BALANCE-POLICY.md` D.2a as open rather than folded into this fix. **Deliberate scope
boundary:** a trial fix for F-161-1 (porting the gambler's die-free-inline split) was measured
and explicitly NOT landed — it closes seeds ≥ 5 197 → 18 but costs the deed slate
(`deed-coverage.test.ts` full slates 2 → 0 over seeds 1..76), so closing it is left to a task
that owns the deed-hunter instrument, per this task's own scope line. Fingerprint discipline
held: only the veteran row of `campaign-degraded.test.ts` `PINNED_FINGERPRINTS` moved (the
extract-then-relax step was proven inert first, byte-identical at `8db1029399f20ed8`); all
other archetypes byte-identical.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked); oriented directly from `packages/sim/src/index.ts`, `balance/gate.ts`, `docs/BALANCE-POLICY.md`  · attempts=1/4.

### T-158 · CHECKPOINT — human UAT, plus recorded rulings on Combat's chosen branch and F-150-1 — `status: BLOCKED(Human UAT)` · `coder: sonnet` · `after: T-150, T-153, T-157, T-140, T-141, T-160` · `[BLOCKED BY = Human UAT]`
**`after:` gained T-160 (2026-08-02, owner-directed):** UAT must be played against the fixed
Liar's Dice dealer, not the F-137-1 one that volunteers a certain loss on nine decisions in ten —
otherwise the owner's first read of the bar is a read of a defect already known and scheduled. The
gate is in the field, not prose, per the T-155 lesson. (T-161 is deliberately NOT named here — it
is sim-side only and cannot affect what the owner plays; it precedes this task by file order
alone.)
**POINTER, NOT AN AMENDMENT (2026-08-02): a third ruling ask is now pending, and it lands BEFORE this
checkpoint, not inside it.** T-157 is `BLOCKED` on a one-decision owner ruling — the PARITY LEDGER's
`| VisitHangout |` row, re-asked with all three defects re-measured at `docs/HANGOUT_REDESIGN.md`
§11.4 — because one of its Accept clauses (`gambler` "passes cleanly") is unmet as written; see
**F-157-1** and THE RULING in T-157's block for the two ways to close it. `T-157` is already named in
this task's `after:` field, so the ordering is machine-enforced: this checkpoint cannot open until
that ruling is taken. **This task's Accept clause is NOT amended** — the ask belongs to T-157 and is
graded there; it is recorded here only so the owner arriving at the UAT checkpoint sees the queue it
is already gated on.
Per `docs/TESTING-STRATEGY.md` Part G: neither the sweep nor an LLM pilot can judge whether pacing or dice-tension *feels* right, and `docs/RELEASE-CHECKLIST.md` already states "nobody has played this build end to end yet." Automated preparation: confirm the build is green, confirm T-140/T-141 (decision tracing, opt-in playtest logging) are wired and active so the owner's session produces a reviewable log rather than only an impression, and assemble a short pre-UAT brief naming what's known-uncovered going in (Combat's chosen `executeCombat` branch is still an abstract GUNS check with 0 modeled deaths per `NPC_REDESIGN.md`'s Parity Ledger; Explore/VisitHangout have zero fleet coverage; N13's status per T-156). **The brief also carries two items added 2026-08-02 so the owner's play pass meets them with numbers in hand:** (a) **Explore is still a net credit loss** — T-116's re-measure: 85 of 120 seeds richer WITHOUT the verb (down from 101/120 pre-rebuild), with the non-credit payoff (unique items, POI fragments) stated beside it and re-pricing (`EXPLORATION_FUEL_COST` 80, `EXPLORATION_NAV_DC` 12) an open R-series owner call per `docs/EXPLORE_REDESIGN.md` §10.4 — UAT is the "playtest by feel" D1 chose over sim pre-validation, so the feel-read belongs in the session notes; (b) **F-150-1's disposition-inertness numbers** (`docs/HANGOUT_REDESIGN.md` §11.3): the cast sits at exactly 0 disposition on 96.52% of live captain-days, a nonzero standing survives a median 3 days, decay outruns interaction 1.53:1, and 71.52% of named-pool draws are inert — with T-125's own ruling that this is a design question, not a knob, and the levers-not-pulled table attached. Then halt for the owner's own UAT pass, and — per Part G item 4, extended 2026-08-02 — **two deliberate, recorded rulings**: one on Combat's chosen branch, and one on F-150-1 (the 0.25 named-pool gate + `DISPOSITION_DECAY_INTERVAL_DAYS = 3`, read together), even if either ruling is "not this pass." This is a hard gate: **T-155** (running the native LLM pilot for real) is sequenced after it and must not start until it closes. **T-154 (building the driver) is NOT gated on this** — see the resequencing note on T-154, which as of 2026-08-02 sits ABOVE this block precisely so this task's halt cannot strand it.
**Accept:** (human-checked) the pre-UAT brief is committed and includes the Explore net-loss and F-150-1 items with their numbers; T-140/T-141 confirmed active; the run halts with this task `BLOCKED`, never self-approved; closes only once the owner has played a UAT pass and recorded BOTH rulings — Combat's chosen branch and F-150-1 (fix, defer, or accept-as-is all count as a ruling for each).

**Delivered (2026-08-02, PRE-UAT HALF ONLY — this task is NOT done and was not self-approved):**
The automated half of the checkpoint is complete and the run **halts here**. What landed:

- **The brief: `docs/playtests/T-158-pre-uat-brief.md`.** Nine sections: what closes the task; the
  runbook (launch, turning logging on, flagging a moment, the concrete macOS log path, export, and
  how to turn the export into a report); a suggested-not-scripted pass; **§4 what is known-uncovered
  going in** (Combat's chosen branch, Explore/VisitHangout zero fleet coverage with T-157's
  three-not-two correction and the owner's 2026-08-02 option-(B) ruling recorded as **closed**, N13's
  residual, and the fact that the bar being played is the **fixed** T-160 one with F-160-1/2/3 still
  open); **§5 the Explore net-loss item**; **§6 the F-150-1 item**; §7 the instrumentation evidence;
  §8 a session-notes template with the Bug Discovery Policy pointer; **§9 the two empty ruling slots**
  in `RELEASE-CHECKLIST.md` §G's verbatim idiom.
- **§5, with its numbers, all transcribed from `docs/EXPLORE_REDESIGN.md` itself:** `85 of 120`
  seeds richer without the verb, down from `101 of 120` (§9.1) — **carrying §9's own pre-D1 caveat,
  because no post-D1 sign count exists**; the current-at-HEAD read from §10.4 (median `60,638cr`,
  `tourOneClearRate` `0.795`, `26.53` deeds, `7.69%` of queued Explores still refused); the
  non-credit payoff (100 authored rows, several unique) and why that same fact argues for keeping
  the cast out; and the still-unpulled R-series levers `EXPLORATION_FUEL_COST` **80** /
  `EXPLORATION_NAV_DC` **12**.
- **§6, with its numbers, all transcribed from `docs/HANGOUT_REDESIGN.md` §11.3:** 0 disposition on
  **96.52%** of live captain-days, a standing surviving a **median 3 days**, decay outrunning
  interaction **1.53 : 1**, **71.52%** of named-pool draws inert against a **25.07%** named share
  (analytic 25.00%) — so disposition alters roughly **7%** of interceptions — with the `gambler`
  counter-case (**41.46%** inertness, **2.806×** lift), T-125's design-question ruling restated, and
  §11.3's **levers-not-pulled table reproduced in full**. §11.4's companion figures (+3.44cr faucet /
  0.22% of NPC wealth, 37.97% off-Hangout, 17.49% ante lockout) are carried as context.
- **T-141 CONFIRMED ACTIVE**, by grep at each named call site, not by reading its task block:
  `packages/ui/src/playtestLog.ts:88,96,207,219,235,307,345`; `packages/ui/src/App.tsx:402` with
  `set-playtest-logging` :415, the always-rendered disclosure :422-423, `playtest-flag-input` :436 /
  `playtest-flag` :445, `playtest-export-json` :454 / `playtest-export-csv` :461;
  `packages/ui/src/store.ts:2453,2472,2524`; `packages/desktop/src/main.ts:179,377-378,574,801`
  (`SQ_LOG_DIR ?? userData/logs`, and `app.setName('Rimward')` at :753 fixes the macOS path to
  `~/Library/Application Support/Rimward/logs`). Its three suites are green in the gate run below.
- **T-140 CONFIRMED WIRED, and its client absence recorded as a RULED LIMITATION rather than filed
  as a gap.** Live at `packages/engine/src/npc.ts:552-578,630,2110-2113` →
  `packages/engine/src/day.ts:547,879` → `packages/sim/src/index.ts:797,5442` →
  `packages/sim/src/balance/sweep.ts:204,299,307,529,539`, behind `--trace-npc-decisions`.
  **It is `packages/sim`-only by T-140's own Accept criterion**, which required that a grep for the
  trace-sink parameter under `packages/ui` / `packages/desktop` return nothing — re-run here, and it
  still does (only `packages/ui/src/__tests__/npc-trace-absent.test.ts`, the test enforcing the
  absence). So **a human UAT session produces a T-141 export and no NPC decision trace**; the brief
  §7 says so in those words, and `docs/TESTING-STRATEGY.md` Part G item 5 is annotated with the same
  correction (its sentence is true of the *pair*, not of one human session — the F-157-2 drift class).
  **No trace sink was wired into the client and no bug was filed for its absence.**
- **New test: `packages/sim/src/__tests__/uat-brief-figures.test.ts`** (3 tests). It pins **26**
  measured figures in **both directions**: each `section` heading must still exist in the live source
  document, each `value` must appear **inside that section** (heading → next same-or-shallower
  heading, so `####` subsections stay in — deliberately NOT `coverage.ts`'s last-column table
  resolver, which would read §11.3's decay table's `explorer only` 96.47% instead of the fleet's
  96.52%), and each `value` must still appear **in the brief**, so a pin cannot outlive the prose it
  guards. Non-vacuity is asserted (`pinned === UAT_BRIEF_FIGURES.length`), and a third test asserts
  both ruling slots exist and their answer cells are **empty** — a filled cell that no owner wrote is
  a self-waiver and fails the suite. The file header states the no-escape-hatch rule explicitly.
- **Annotations:** `docs/TESTING-STRATEGY.md` Part G item 5 (dated, with the T-140 correction) and
  one sentence in `docs/RELEASE-CHECKLIST.md`'s ⛔ pre-alpha header pointing at the brief. **No §G row
  or Status cell was touched.**

**Gate transcript, run BEFORE writing anything and again AFTER, so a pre-existing red could not be
mis-attributed.** BEFORE: `npm test` → **110 files / 2,185 tests passing, 0 failing**
(7/110 · 5/61 · 50/1313 · 32/444 · 16/257 across the workspaces). AFTER: **111 files / 2,188 tests
passing, 0 failing** — exactly this task's one new file and its three tests
(`packages/sim` 32/444 → 33/447), nothing else moved. The known-red `it.fails` tripwires behaved as
expected-red on both runs and none flipped to unexpectedly passing. `npx tsc -b`, `npm run lint` and
`npm run format:check` exit 0 on both runs.

**NO FINGERPRINT MOVED, NO CAPSTONE IS OWED, AND NO SWEEP WAS RUN — stated rather than left
unaddressed.** Every edit is under `docs/` (not hashed at all) or `packages/sim/src/__tests__/`
(`__tests__` is in `HASHED_ROOT_IGNORED_DIRECTORIES`, `rules-fingerprint.ts:250-254`). So
`rulesFingerprint`, `instrumentFingerprint` and `docsFingerprint` are all unmoved, the baseline of
record is untouched, and **`CURRENT_SAVE_VERSION` stays 15 with no migration owed** — no persisted
shape changed. No new non-test module was added under `packages/sim/src`, so no
`SIM_NON_INSTRUMENT_SOURCES` entry is owed; the figure table lives inside the test file for exactly
that reason. **No constant, band, threshold, golden or fingerprint was edited**, and nothing under
`packages/engine`, `packages/content`, `packages/ui` or `packages/desktop` was changed
(`executeCombat`, `rng.next() < 0.25`, `DISPOSITION_DECAY_INTERVAL_DAYS`, `EXPLORATION_FUEL_COST`
and `EXPLORATION_NAV_DC` are all untouched).

**TO CLOSE THIS TASK — where each ruling gets transcribed when it arrives.** Do not re-derive this
after the halt; it is written down here on purpose.

1. **R1 (Combat's chosen branch)** → (a) `ACKNOWLEDGED_COVERAGE_GAPS.fighter.owner` in
   `packages/sim/src/balance/coverage.ts:442-443`, whose text already reads *"scheduled for a
   recorded ruling at T-158"* — that string is the machine-checked receipt and must be updated to the
   ruling actually taken; (b) the `| Combat |` row of `docs/NPC_REDESIGN.md`'s PARITY LEDGER; (c) the
   **`executeCombat`'s missing shared rules** bullet under this file's "Deliberately deferred".
2. **R2 (F-150-1)** → (a) the **STATUS** line at `docs/HANGOUT_REDESIGN.md` §11.3; (b) the
   **F-150-1** row in this file's "Findings filed BY T-150" table; (c) **if and only if the ruling is
   "fix"**, a new task block — never a constant edited inline, because either constant moves every
   disposition-reading system at once and owes its own capstone.
3. Then update `packages/sim/src/__tests__/uat-brief-figures.test.ts`'s third test, which currently
   asserts both ruling cells are **empty**.
4. **The third ruling ask this block's POINTER paragraph flagged is ALREADY CLOSED** — T-157 option
   (B), commit `75004d33`: the PARITY LEDGER's `| VisitHangout |` row stays Deferred and N8 is
   unblocked-but-unscheduled. **The queue at this checkpoint is TWO rulings, not three.**

**THE HALT.** Nothing further is done on this task by any coder. `T-155` and `T-162` stay `TODO` and
must not start. Neither ruling was made, guessed at, paraphrased or implied by this pass — the coder
does not self-waive, and the two empty cells in the brief's §9 are the record that it did not.

**Prepared (2026-08-02):** This automated pass wrote `docs/playtests/T-158-pre-uat-brief.md` (the
UAT runbook, the known-uncovered-going-in list, the Explore net-loss and F-150-1 figure sections, and
two empty ruling slots for Combat's chosen branch and F-150-1), added
`packages/sim/src/__tests__/uat-brief-figures.test.ts` (3 tests pinning 26 measured figures back to
their source documents in both directions and asserting both ruling cells stay empty), confirmed by
grep at each named call site that T-140 and T-141 are wired and active, added one pointer sentence
each to `docs/TESTING-STRATEGY.md` Part G and `docs/RELEASE-CHECKLIST.md`, and set this task's status
in `TASKS.md` to `BLOCKED(Human UAT)`. No gameplay constant, fingerprint, or persisted-shape file was
touched, and no ruling was recorded by this pass. The task now awaits: Human UAT.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked, absent); oriented from `TASKS.md`, `docs/TESTING-STRATEGY.md` Part G, `docs/EXPLORE_REDESIGN.md`  · attempts=1/4 · HUMAN-GATE HALT.

### T-155 · Validate: run the pilot end-to-end and confirm it's trustworthy — `status: TODO` · `coder: opus` · `after: T-154, T-158`
**`after:` corrected (2026-08-02):** this field previously read `after: T-154` alone, and the T-158
gate existed only as prose in T-154's resequencing note. The orchestrator selects on the `after:` field
and never reads prose, so the owner's "the pilot's first real run waits for UAT" ruling was not actually
machine-enforced — it was masked only by T-158 happening to halt the run first. `T-158` is now named in
the field, so the gate holds regardless of block ordering.
Run the T-154 driver for real: at least 30 simulated days across at least 3 seeds. Confirm zero illegal/fabricated actions were accepted and zero crashes or hangs occurred. Then run one seed twice, independently, and confirm the two runs produce identical action sequences (the same determinism check T-1604a used on the UGT side) — an audit tool that isn't reproducible can't be trusted to diagnose a regression later. If any part of the pipeline is inherently nondeterministic (e.g. the LLM call itself), the run log must document exactly what's pinned/replayable and what isn't, rather than silently passing on a lucky match. Only once this task's Accept criteria are met does M7 close; update Part D of `docs/TESTING-STRATEGY.md` with the confirmed cadence and the exact command to invoke a run.
**Accept:** a committed run artifact (e.g. under `docs/playtests/` or a `packages/sim` output path) shows ≥30 days × ≥3 seeds completed with zero illegal actions and zero crashes; a same-seed determinism check shows two independent runs producing identical action sequences, or the run log explicitly documents which part of the pipeline is nondeterministic and how that's bounded; `docs/TESTING-STRATEGY.md` Part D updated with the confirmed cadence and invocation command.

### T-162 · Build: the browser/DOM-level long-horizon check — the bridge blind spot gets an owner — `status: TODO` · `coder: opus` · `after: T-158`

**Scheduled 2026-08-02 (owner-directed): until now, no task owned this.**
`docs/TESTING-STRATEGY.md`'s bridge-blind-spot warning calls "a real browser/DOM-level check" a
"distinct, still-open need — do not fold it into Tier 2 by assumption," citing the worldbreaker
precedent where a protocol-level tier missed a client-crashing type error that only a real-browser
audit caught — yet the item appeared in no task's Accept criteria anywhere in this file. It is
sequenced after T-158 so it cannot compete with pre-UAT work, and it **complements T-155, never
substitutes for it** (nor the reverse — the two cover disjoint failure classes by construction).

**Scope it honestly against what already exists.** The repo already has 111 real-Chromium
Playwright specs including a scripted 30-day `tour-one-career.spec.ts` and a 20-run flake gate —
so the still-open need is NOT "any browser test." It is the class those specs cannot catch:
scripted scenarios assert only what they were written to see, while the blind-spot bug class is
the *unanticipated* client-side crash deep into a career. Build the long-horizon counterpart:
either (a) drive the T-154 pilot's action choices through the real DOM instead of the protocol
seam, or (b) a long-horizon invariant sweep in Playwright — randomized-but-legal play over ≥30
in-game days holding blanket invariants (zero console errors, zero uncaught exceptions/crashes,
no dead affordance: every enabled control dispatches, every blocked action shows its reason, per
the existing `action-blocked-parity` pattern). Pick whichever is cheaper to make reliable and say
why; log the other as the not-chosen shape. Any bug it finds is filed per the Bug Discovery
Policy before the run continues. Then update the TESTING-STRATEGY blind-spot paragraph from
"still-open need" to a pointer at this task and its shipped mechanism.

**Accept:** a committed run artifact shows ≥30 in-game days driven through the real DOM with the
invariant set named and green (or any violation filed as a finding, not skipped past); the
invocation and its cadence (CI, nightly, or manual — stated which, with the reason) are
documented; `docs/TESTING-STRATEGY.md`'s bridge-blind-spot paragraph points at this task instead
of calling the need still-open; the not-chosen shape is logged; gate green.

---

## M8 — Harvested: testing, CI and gate coverage

Transplanted 2026-08-02 out of completed blocks before they were pruned. Each body carries its
`harvested:` provenance marker verbatim — do not reword the markers.

### T-163 · Working branches never run e2e before merge — widen the CI trigger or gate rule-deleting changes — `status: TODO` · `coder: opus` · `after: —`

Write the check that would have caught F-112-D. Nothing runs the e2e suite on the branch that
breaks it: `.github/workflows/ci.yml` triggers on `push` only for `branches: [main, rimward-redesign]`,
and both the `ci` and `e2e` jobs carry
`if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name != github.repository`,
which skips every same-repo PR — so a `redesign/*` branch gets no `npm run test:e2e` at all.
`docs/ENGINEERING-POLICY.md` §2 only requires `npm run test:e2e -w @spacerquest/ui` locally for
changes "touching the cockpit", which is why T-1605 (a rule change, not a cockpit change) could
leave `starmap.spec.ts` asserting a deleted travel PILOT check and 7 of 95 specs sat red on
`main@74403ab4` from 2026-07-28 until T-112 tripped over them. Either widen the CI push/PR trigger
to cover working branches or make the gate require e2e for rule-deleting changes. Respect the
standing `ci-no-duplicate-runs` norm — concurrency-cancel and no double runs on the same commit.
[harvested: T-112/e2e-never-runs-before-merge]

**Accept:** a rule-deleting change on a `redesign/*` branch provably runs `npm run test:e2e` in CI
(the workflow trigger widened, or `docs/ENGINEERING-POLICY.md` §2's local requirement replaced by
an enforced gate step); no duplicate runs are introduced on an already-tested commit; the chosen
shape and the not-chosen one are recorded; gate green.

### T-164 · `packages/content` has no test runner — stand one up, or record engine-suite hosting as permanent — `status: TODO` · `coder: opus` · `after: —`

`packages/content` has no test runner at all — its `package.json` carries only a `build` script and
there is not one `*.test.ts` under it (verified still true at harvest time). Consequence: the
Explore content validator lives in the engine suite at
`packages/engine/src/__tests__/exploreContent.test.ts` rather than beside the rows it validates.
T-113 flagged this as an observation and explicitly deferred it ("building that infra is not a
content pass's job"); no later task picked it up. Either stand up a test runner in
`packages/content` or record that engine-suite hosting is the permanent home.
[harvested: T-113/content-package-has-no-test-runner]

**Accept:** either `packages/content` has a working `test` script wired into the workspace run
(with at least the Explore content validator moved or mirrored beside its rows), or a written
ruling in `docs/TESTING-STRATEGY.md` states that content validators live in the engine suite
permanently and why; gate green.

### T-165 · Baseline-of-record pointer consistency check — fail when the four sites disagree — `status: TODO` · `coder: opus` · `after: —`

Write the check that catches a stale baseline-of-record pointer. T-137 found
`docs/balance/smoke/README.md` still pointing at `baseline-t125-hangout.json` — missed by BOTH
T-131 and T-133 — while re-pinning the four sites
(`packages/sim/src/__tests__/balance-targets.test.ts:103`, `docs/NPC_REDESIGN.md` ×2,
`docs/balance/smoke/README.md`). No automated check exists today: `BASELINE_OF_RECORD_PATH`'s own
comment in `balance-targets.test.ts` names only two of the four sites, and nothing in
`packages/sim/src/balance/gate.ts` or the `npm test` suites cross-checks the doc pointers. A test
or gate step that fails when the four sites disagree would close the class.
This is the task behind the same-named backlog bullet in `TODO.md`.
[harvested: T-137/repin-consistency-check]

**Accept:** a test (or gate step) reads all four pointer sites and fails when any disagrees,
demonstrated by deliberately de-syncing one and watching it go red; `BASELINE_OF_RECORD_PATH`'s
comment names all four; gate green.

### T-166 · An Accept criterion citing a precedent commit is never checked against that commit — `status: TODO` · `coder: opus` · `after: —`

Write the missing check for the F-140-3 defect class: nothing in the repo verifies that an Accept
criterion citing a precedent commit actually matches that commit's diff. §6 of
`docs/BALANCE-TELEMETRY_SPEC.md` was transcribed from a summary (`docs/TESTING-STRATEGY.md`) and
asserted "`rulesFingerprint`'s move is the ONLY expected diff", which
`git show 3468ef5f -- docs/balance/smoke/tiers.json` (T-110) contradicts — four fields moved.
Candidate enforcement: a gate/review step (or a test over `docs/balance/smoke/tiers.json`
re-extraction) asserting only fingerprints + `provenance` move and every recorded measurement is
byte-identical. Until that check exists there is no lesson, only this gap.
[harvested: T-140/accept-criterion-precedent-check]

**Accept:** a committed check enforces the "only fingerprints + `provenance` move, every recorded
measurement byte-identical" rule over a smoke-fixture re-extraction (or an equivalent gate step is
documented and wired); `docs/BALANCE-TELEMETRY_SPEC.md` §6's wrong claim is corrected against
`3468ef5f`'s real diff; gate green.

### T-167 · Rig sensitivity check — fail when a policy is bit-for-bit flat across variants that should perturb it — `status: TODO` · `coder: opus` · `after: —`

Write the check that would have caught F-151-9 automatically: a rig/gate assertion (natural home
`packages/sim/src/balance/gate.ts`, alongside the nine named `assert*` predicates and
`EXPECTED_EVENT_RATES`) that FAILS when a policy's aggregate is bit-for-bit identical across
variants that were supposed to perturb it. No such sensitivity check exists today — verified:
`gate.ts` asserts only invariants and event rates, nothing about a control-vs-variant delta being
non-zero. [harvested: T-151/write-rig-flatness-check]

**Accept:** a named `assert*`-style predicate in `packages/sim/src/balance/gate.ts` fails on a
control-vs-variant pair whose aggregate is byte-identical, demonstrated against the F-151-9 case
(`fighter` day-35 median 2,825cr flat under all eight rig variants); `gate.ts` is registered
NON-INSTRUMENT as its siblings are, so `rulesFingerprint` does not move; gate green.

---

## M9 — Harvested: Liar's Dice, roster and ladder

### T-168 · F-146-1 / F-148-4: the raised tier-4/5 ceiling is never staked into — amend §4.6 first, then fix — `status: TODO` · `coder: opus` · `after: —`

The sim and the UGT protocol can never request a tier-4/tier-5 stake. `planDare`
(`packages/sim/src/index.ts:3524`, seating logic at `:3487-3513`) and
`packages/sim/src/protocol.ts:869` both size the `wager` domain off `wagerBandFor(...)`, the tier-0
band, so no sweep row and no UGT career ever exercises the raised bounded-betting ceiling or the
removed band clamp — tiers 4 and 5 are unmeasurable as played, and the ×3 ceiling plus the removed
clamp are, in play today, worth +43.7% bids/hand and nothing else. `planDare`'s
`if (dealer.credits < band.min) return null` gate is wrong-ish at tier 5 for the same reason.
Fixing it requires a THIRD `liarsDiceTier` call site, which `docs/LIARS-DICE-PROGRESSION_SPEC.md`
§4.6 rules is a bug — so it needs an explicit **§4.6 amendment (or a rule that hands out the
effective band without a third read) BEFORE any code**, not improvised. Scope recorded in §12.9
(F-148-4) and the levers table row for `planDare`'s tier-0 band sizing. Named as the natural
companion to T-150's parity row; T-150 is DONE and this was not closed there.
[harvested: T-146/F-146-1] [harvested: T-148/F-148-4]

**Accept:** `docs/LIARS-DICE-PROGRESSION_SPEC.md` §4.6 carries an explicit amendment (or a
no-third-read rule) committed BEFORE the code change; `planDare` and `packages/sim/src/protocol.ts`
size the wager domain off the *effective* tier band; a sweep arm demonstrably requests tier-4 and
tier-5 stakes with the measurement recorded; the `dealer.credits < band.min` gate is re-derived
against the effective band; fingerprint discipline stated and the expected rows named; gate green.

### T-169 · F-148-2: the 42-seat gauntlet is played but never completed — `liars_dice_grand_slam` is unreachable — `status: TODO` · `coder: opus` · `after: —`

Median 29 of 42 seats beaten, 3 of 14 ports cleared, **0 grand slams in 720 careers**, median 0
seats drained — not a purse-depletion problem. `planDare`
(`packages/sim/src/index.ts:3487-3513`) seats the richest candidate and has no idea a *set* exists,
so hands scatter across 31 distinct seats. Owner call, two named shapes: give `planDare` a
set-completion preference (an instrument change that owes its own inert-first commit) OR accept the
fifteen deeds as deliberate-play rewards and say so in the spec. Reachability for a *human* player
is UNMEASURED by this rig. No task owns this; T-160 only restates the 0-in-720 number on its
post-fix arm. [harvested: T-148/F-148-2]

**Accept:** one of the two named shapes is chosen and the choice recorded with its reason in
`docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.9 — either `planDare` gains a set-completion preference
(landed as its own inert-first commit with the fingerprint rows named, then re-measured for grand
slams per 720 careers) or the spec states the fifteen deeds are deliberate-play rewards the sim is
not expected to reach; the not-chosen shape is logged; gate green.

### T-170 · F-148-5: `CONQUEROR = 38` is unreached at 120 days by every policy — run the 300-day arm — `status: TODO` · `coder: opus` · `after: —`

`RENOWN_DEED_THRESHOLDS.CONQUEROR` = 38 (`packages/content/src/deeds.ts:289`) is unreached at 120
days by every policy, dice or not. `gambler` deedCount median 25 → 28 (max 34 at n=1,000, GIGA_HERO
129, CONQUEROR 0); controls `veteran` 20, `trader` 20. The threshold was sized off a **300-day** arm
against a **44**-deed slate and is now being read against a 120-day horizon and a **59**-deed slate.
The number that would settle it is a 300-day arm this rig does not run — so the open work is the
300-day arm, not a retune. No task owns it. [harvested: T-148/F-148-5]

**Accept:** a 300-day arm is run and committed with `deedCount` and `CONQUEROR` attainment reported
per policy against the 59-deed slate; the threshold is then either confirmed as correctly sized or
re-derived with the new number stated; `docs/LIARS-DICE-PROGRESSION_SPEC.md` §12 updated; no retune
lands without the measurement behind it; gate green.

### T-175 · F-160-1: the archetype ordering SURVIVES the F-137-1 fix — `optimal` is still the softest seat — `status: TODO` · `coder: opus` · `after: T-160`

**Filed at T-160 (2026-08-02), `docs/LIARS-DICE_REDESIGN.md` §17.8.** F-148-1 traced the inversion
to F-137-1 and instructed: "close F-137-1 … and re-measure; if the inversion survives that, the
archetypes are the right place to look." **T-160 closed F-137-1 (openers guaranteed true 100.00% →
0.00%) and the inversion survived.** Measured on the post-fix Arm 2 (n = 101,616 hands): the player
wins **64.48%** against `optimal` (n = 43,733) and **51.98%** against `bad` (n = 8,288) —
bad − optimal = **−12.50 pp, SE 0.59, z = −21.02**. The T-160 control arm reproduced the pre-fix
figure at −15.38 pp / z = −16.96, so the gap NARROWED by ~3 pp but neither closed nor flipped. The
inversion is therefore only PARTLY downstream of F-137-1; the residual belongs to `archetypeMove`
and `BAD_CREDULITY = 1`. **Nothing was tuned at T-160** — §12.9 and §3.8 both forbid it there, and
tuning inside the task that removed the confound would have papered over the result. `optimal`
(64.48%) is no longer softer than the roaming dealer by the old margin (56.94% post-fix) but is
still softer, so LD-20's "the 14 `optimal` rows are the easiest opponents in the game" reading
still stands in kind, if not in degree. This is the SECOND step of LD-20's fixed order and is now
unblocked. [harvested: T-148/F-148-1] [filed: T-160/F-160-1]

**Accept:** the mechanism is measured (not asserted) at n ≥ 10,000 hands per archetype cell, split
by pool and tier; any change to `archetypeMove` / `BAD_CREDULITY` / the four tone mixes is
behaviour-preserving-first with the golden hashes unmoved at the extraction step; the ordering is
re-measured with SE and z on both arms and reported either way; `rulesFingerprint` moves so the
task takes its own capstone with the moved rows predicted before the run;
`docs/LIARS-DICE-PROGRESSION_SPEC.md` F-148-1 and `docs/LIARS-DICE_REDESIGN.md` §17.8 both updated
with the outcome; gate green.

### T-176 · F-160-2: the challenger-won split is still 41.7 pp apart — price the planner's selectivity or re-derive the criterion — `status: TODO` · `coder: opus` · `after: T-160`

**Filed at T-160 (2026-08-02), `docs/LIARS-DICE_REDESIGN.md` §17.8.** T-160 pre-committed a ≤20 pp
criterion for the challenger-won split (against T-137's 5.32% vs 94.92%) and **neither sanctioned
shape met it**. Shipped post-fix at Arm 2: dealer-as-challenger **40.73%** (n = 92,909),
player-as-challenger **82.43%** (n = 6,072) — **41.7 pp**, down from control's 52.4 pp. **No
threshold was edited to absorb the miss.** The residual has a named cause the criterion never
priced: the player's `planDareMove` challenges SELECTIVELY (only when
`bid.quantity > own(face) + dicePerSide/6 + SIM_DARE_CHALLENGE_MARGIN`) while `dealerMove`
challenges by DEFAULT out of its terminal fallback, and a selective challenger should beat a
default one — so some gap is correct and the question is how much. **The not-chosen bakeoff shape
(a) is exactly the lever here**: making `dealerMove`'s terminal fallback the cheapest legal raise
moved pool B's dealer-as-challenger win rate 22.32% → 55.51% in the T-160 bakeoff. (a) and (b) are
independent and not mutually exclusive; (a) is now available on top of the shipped (b) and would
need its own bakeoff and its own capstone. [filed: T-160/F-160-2]

**Accept:** the criterion is either re-derived with the planner's selectivity priced into it (a
defensible expected gap, argued from the two policies rather than picked), or shape (a) is
bakeoff'd on top of shipped (b) and shipped if it passes; the split is re-measured per pool with
`n` on every cell; `docs/LIARS-DICE-DECISIONS.md` LD-22 updated; if `packages/engine/src` is
touched the task takes its own capstone with the moved rows predicted first; gate green.

### T-177 · F-160-3: FOLD is still never the better credit play — an owner design call — `status: TODO` · `coder: opus` · `after: T-160`

**Filed at T-160 (2026-08-02), `docs/LIARS-DICE_REDESIGN.md` §17.7 / §17.8; the standing version of
§16.8 item 6.** T-160 re-measured FOLD post-fix as the task required. It is **less dead than at
T-137 but still credit-dominated**: legal at **100.00%** of the 18,678 post-bid player decision
points (Arm 2, n = 101,616 hands) and taken at **3.51%**, up from control's 0.91% and T-137's
0.32%; hand-level player-fold rate 0.50% → 0.65%; pre-bid folds **0** on every arm. §16.3's
dominance argument is a DERIVATION about escrow, not a constant, and the opening floor does not
touch it: the escrow is debited at contribution time, a fold forfeits it with certainty, CHALLENGE
costs nothing, so `EV_challenge − EV_fold = P_false · (potPlayer + potDealer) ≥ 0` everywhere.
FOLD's only positive payoff remains `DARE_FOLD_DISPOSITION = +1`, and its stated §6.1 concealment
benefit is still mechanically inert — `dealerMove` and `archetypeMove` take no history parameter
and no cross-hand memory, so there is no channel through which a past reveal could reach a future
decision. **Whether a move that is never the better credit play is acceptable is a design
question, not a constant**, and T-160 was explicitly forbidden from redesigning it.
[harvested: T-137/§16.8-6] [filed: T-160/F-160-3]

**Accept:** an owner ruling is recorded in `docs/LIARS-DICE-DECISIONS.md` (accept FOLD as a
disposition/flavour move and say so in the spec, OR give concealment a real channel, OR change
FOLD's economics); if anything ships, the dominance derivation is re-run against the new rule
rather than re-sampled, and the fold rate is re-measured at n ≥ 10,000 decision points;
`docs/LIARS-DICE_REDESIGN.md` §16.3 and §17.7 updated with the outcome; if `packages/engine/src` is
touched the task takes its own capstone with the moved rows predicted first; gate green.

---

## M10 — Harvested: Explore, deeds and the recovery ladder

### T-171 · Deed supply after Explore's 10× event-rate drop — an owner ruling on the sealed-pod line — `status: TODO` · `coder: opus` · `after: —`

F-115-B left an unanswered supply question. Explore's per-outcome event rate fell ~10× by design
(a board now draws one row of 100 instead of walking three legs), and on
`deed-coverage.test.ts`'s own driver the number of careers that earn the whole 44-deed slate alone
fell from four in twelve to **two in sixty-five** (seeds 31 and 65); twelve of the fourteen
near-misses miss `slipped_the_scan`, the same long pole every previous sweep names. The union is
still 44/44 so no deed is dead content, and the sample was widened (`COVERAGE_SEEDS` 1..12 → 1..65)
rather than the `>= 2` threshold moved. T-115 deferred the verdict to T-116, but T-116's delivered
note rules only on whether Explore is a net loss and never addresses deed supply or
`slipped_the_scan`. Needs an explicit owner ruling on the sealed-pod supply line
(`slipped_the_scan` / `known_to_the_league` / `run_seized`, all downstream of the sealed pod at
20% → 4.4% of boards). [harvested: T-115/deed-supply-slipped-the-scan]

**Accept:** a recorded owner ruling on the sealed-pod supply line (raise the pod rate, re-home the
three deeds, move the `>= 2` threshold, or accept as-is — any of the four counts as a ruling), with
the post-ruling per-career slate-completion number re-measured on `COVERAGE_SEEDS` and stated
beside the pre-ruling two-in-sixty-five; the ruling written into the Explore spec beside §10.4's
other open calls; gate green.

### T-172 · Re-measure per-band recovery collection and forfeiture — prove band 4 is reachable after T-131 — `status: TODO` · `coder: opus` · `after: —`

T-116 measured that the recovery ladder forfeits 75.8% of everything it defers (1,553 of 2,049
resolved recoveries, essentially all `departed`) with ZERO band-4 payouts in 14,400 simulated days
— max `valuePoints` ever collected was 60 against a band-4 floor of 61
(`docs/EXPLORE_REDESIGN.md` §9.4). That drove owner ruling D1 → T-131 (bands 3-4 moved off
calendar-day holds onto a same-day extra-dice cost). No task since has re-measured per-band
collection/forfeiture, so it is still unproven that band 4 is reachable after T-131; T-150's
post-fix capstone measured Hangout/named-pool numbers and the F-116-1 refusal rate, not
`RecoveryPaidOut` by band. [harvested: T-116/band4-reachability-remeasure]

**Accept:** a committed measurement reports `RecoveryPaidOut` collection and forfeiture BY BAND on
a stated seeds × days window, with band 4's post-T-131 payout count stated explicitly against
T-116's zero-in-14,400-days baseline; `docs/EXPLORE_REDESIGN.md` §9.4 updated with the post-T-131
numbers; if band 4 is still unreachable that is filed as a finding rather than smoothed over; gate
green.

---

## M11 — Harvested: the instrument and its blind spots

### T-173 · The capstone instrument is blind to Hangout and disposition — add the fields, pay the re-pin — `status: TODO` · `coder: opus` · `after: —`

The capstone instrument still cannot answer any Hangout/disposition question: `SeedRow` carries no
hangout and no disposition field, `MilestoneSample` no `npcDisposition`, and
`CombatEncounterRecord` no interceptor id or `source`. Every measurement since (T-125, then T-137,
T-148, T-150) has had to descend from a **gitignored** `.scratch/` probe (`.scratch/t125-hangout.ts`,
source fenced only at `docs/HANGOUT_REDESIGN.md` §10.7). Adding the fields moves
`instrumentFingerprint`, so it needs its own commit plus a fixture re-extract and baseline re-pin —
never a capstone commit. [harvested: T-125/capstone-blind-to-disposition]

**Accept:** `SeedRow`, `MilestoneSample` and `CombatEncounterRecord` carry the hangout/disposition/
interceptor-source fields the four prior probes needed; the change lands as its own commit with the
`balance:extract` re-extract and the four-site baseline re-pin done in it; `instrumentFingerprint`
moves and `rulesFingerprint` does NOT; the `.scratch/` probe is retired or its §10.7 fence points at
the shipped fields; gate green.

### T-174 · F-151-9: the `fighter` sim policy is bit-for-bit flat under every stat change — fix or replace it — `status: TODO` · `coder: opus` · `after: —`

INSTRUMENT defect: the `fighter` sim policy's day-35 median is 2,825cr in ALL eight rig variants —
bit-for-bit flat under every stat change, including +2 GRIT. The rig therefore cannot separate
"GUNS is a dead option" from "the instrument cannot see GUNS", which is why
`docs/PLAYER-TRINKETS_SPEC.md` §5.3 argues the GUNS exclusion on two independent legs. Fixing or
replacing `fighter` is the stated prerequisite to any future GUNS ruling (§13, instrument row).
[harvested: T-151/F-151-9]

**Accept:** the `fighter` policy (or its replacement) demonstrably moves its day-35 median under a
GUNS/GRIT perturbation, shown as a control-vs-variant delta on a stated rig; the two-leg workaround
in `docs/PLAYER-TRINKETS_SPEC.md` §5.3 and the instrument row in §13 are updated to point at the
fixed instrument; fingerprint discipline stated (instrument moves, rules does not) and the expected
pinned rows named; gate green.

### T-175 · F-142-1: a merged aggregate carries no `rulesFingerprint`/`gitCommit` — stamp it at write time — `status: TODO` · `coder: opus` · `after: —`

A `BaselineAggregate` does NOT carry its own `rulesFingerprint`/`gitCommit` —
`packages/sim/src/balance/aggregate.ts` defines seven top-level keys
(`label, policies, seeds, days, runs, fleet, byPolicy`) and every committed
`docs/balance/baseline-*.json` carries only those; the stamps live on the smoke FIXTURE
`docs/balance/smoke/tiers.json`, a different artefact. Consequence: a report over two committed
aggregates renders the loud "RULESET UNKNOWN FOR ONE OR BOTH INPUTS" banner, and a
panel-PROMOTED baseline (T-143) inherits the same gap. Recommended resolution is sweep-side:
`packages/sim/src/balance/sweep.ts --merge` should stamp `rulesFingerprint`/`gitCommit` onto the
aggregate at write time. Verified still open — `sweep.ts` has zero hits for either field.
Deliberately not fixed at T-142 or T-143 because touching `sweep.ts` moves
`instrumentFingerprint`, which T-143 was forbidden to do — so this task must be one that can pay
the capstone/`balance:extract` cost. [harvested: T-142/F-142-1] [harvested: T-143/F-142-1]

**Accept:** `sweep.ts --merge` stamps `rulesFingerprint` and `gitCommit` onto the merged aggregate
at write time and `BaselineAggregate`'s type/schema carries them; a `balance:report` over two
freshly merged aggregates renders WITHOUT the "RULESET UNKNOWN" banner; `instrumentFingerprint`'s
move is paid for with the re-extract and baseline re-pin in the same commit; `rulesFingerprint`
does NOT move; `docs/TELEMETRY-REPORT_SPEC.md` §3's now-corrected claim matches reality; gate green.

### T-176 · Smuggler contract options are `chosen` more often than they were `offered` — the all-weights-zero corner — `status: TODO` · `coder: opus` · `after: —`

Real T-140 trace data shows several smuggler contract options are CHOSEN more often than they were
reachable (`chosen > offered`, share above 100%) — the all-weights-zero corner of the picker handing
back a weight-0 option. This is a finding about the decision function (see
`packages/engine/src/npc.ts` `pickIntent`, the all-weights-zero Idle corner around lines 559/657/2149),
NOT about preference. It was deliberately left VISIBLE on the report rather than clamped
(`packages/sim/src/balance/report-model.ts:670-672`, `packages/sim/src/balance/report-html.ts:342`),
and is tracked nowhere else in the repo. [harvested: T-142/smuggler-chosen-over-offered]

**Accept:** `pickIntent`'s all-weights-zero corner is either fixed (a weight-0 option can no longer
be returned as `chosen`) or ruled correct-as-is with the reason recorded; the trace data is
re-measured and no `chosen/offered` share exceeds 100%, or the report's deliberate
leave-it-visible clamp comments are updated to point at the ruling; this touches
`packages/engine/src/npc.ts`, so `rulesFingerprint` moves and the expected pinned rows are named up
front; gate green.

---

## M12 — Harvested: sim policies under duress

### T-177 · F-150-2: `smugglerPolicy`'s unguarded Explore loop, and the shared `planPacifistCombat` stall behind it — `status: TODO` · `coder: opus` · `after: —`

`smugglerPolicy` in `packages/sim/src/index.ts` carries a byte-identical copy of F-116-1's
unguarded Explore loop (3,891 of 23,192 queued on a recovery dawn, 17.90% refused), written up at
`docs/EXPLORE_REDESIGN.md` §10.3. The guard was written, MEASURED and deliberately BACKED OUT: it
re-seeds that policy's deterministic stream onto a PRE-EXISTING five-day stall in the SHARED
`planPacifistCombat` (seed 3, Sirius-16, days 45-49, `anon-rim-pirate-15` escalating rounds 2→10
while tribute climbs 2,000→10,000 against a 1,071cr purse, five consecutive `run` stances),
tripping the poverty-trap invariant (`longestZeroIncomeStreak < 5`). Root fix means editing a
planner five policies share, moving every fingerprint. Pinned by the tripwire
`packages/sim/src/__tests__/campaign-policies.test.ts:492` ('F-150-2 TRIPWIRE · smugglerPolicy still
queues the refusable Explore, on purpose'), which whoever fixes it must delete deliberately in the
same change that fixes the combat stall. [harvested: T-150/F-150-2]

**Accept:** the `planPacifistCombat` stall is fixed first (the seed-3 / Sirius-16 / days-45-49 case
re-run and shown clear), THEN `smugglerPolicy` gains the Explore guard; the tripwire at
`campaign-policies.test.ts:492` is deleted deliberately in that same commit with the reason stated;
the poverty-trap invariant holds; the queued-on-recovery-dawn count is re-measured against
3,891/23,192; every moved fingerprint row is named up front as expected (a shared planner change
moves them all) and `docs/EXPLORE_REDESIGN.md` §10.3 is updated to fixed; gate green.

### T-178 · F-159-2: the fuel-starvation strand no policy branch can escape — the fighter's spend ordering under duress — `status: TODO` · `coder: opus` · `after: —`

A fuel-starvation strand no policy branch can escape. On the post-T-159 tree, seed 157 × 35 days is
the single remaining `fighter` stall at ≥ 5 (19 consecutive zero-income days) and it is NOT a
reachability failure — repeated interceptions at Regulus-6 chip the hull until `maxFuel` falls
270 → 210 → 150 → 90, the ship then sits at Achernar-5 where the cheapest jump in the map exceeds a
full 90-unit tank, so `cannotAffordCheapestJump` (`packages/sim/src/index.ts:919`) is true for 19
straight days and the engine would refuse every jump a policy could queue. Both T-159 branches
behave correctly. Only escapes are a hull/drive tier that lifts the fuel ceiling or a port-side
earner; the day the ship arrived it spent its purse down to 400 credits on a component tier plus a
debt payment. Outside the gate's 1..60 seed range so it does not fail CI. Recorded at
`docs/BALANCE-POLICY.md` D.2a and in the `.github/workflows/sweep-gate.yml` header block; filed for
whoever owns the fighter's spend ordering under duress. No task owns it today.
[harvested: T-159/F-159-2]

**Accept:** seed 157 × 35 days is re-run and the 19-day zero-income strand either resolves (via a
spend-ordering rule that reserves fuel-ceiling headroom before a component tier, or a port-side
earner the stranded ship can reach) or is ruled an accepted terminal state with the reason
recorded; `docs/BALANCE-POLICY.md` D.2a and the `sweep-gate.yml` header updated to match; the gate's
seed range is revisited so the class is measurable rather than merely outside CI; fingerprint
discipline stated; gate green.

---

## M13 — Harvested: owner rulings and unscheduled builds

### T-179 · Record the three unruled `docs/PLAYER-TRINKETS_SPEC.md` §12 questions — `status: TODO` · `coder: sonnet` · `after: —` · `[BLOCKED BY = Owner ruling]`

`docs/PLAYER-TRINKETS_SPEC.md` §12 hands back THREE questions UNRULED and no ruling has been
recorded since 2026-08-01: **(12.1)** the go/no-go — C "do nothing" recommended 4/4, A costs one
engine refactor + one arm + one `legacy.ts` line plus a capstone AND a 10× re-run of §4/§5 (§2.7);
**(12.2)** the ruling-2 question, answered NO but requiring the owner to confirm the by-hand bound
in §4 because the `/10` `NAV_BONUS_DIVISOR` damping and the three-module cap are inapplicable to a
stat delta by construction; **(12.3)** the fresh write-once call on `player.stats` — W1 keep
write-once (C follows automatically) vs W2 open the field with §3.2's forfeit-on-death as the price.
Prepare the ask (the three questions restated with their costs), then halt for the owner.
[harvested: T-151/owner-ruling-sec12]

**Accept:** (human-checked) all three §12 questions carry a recorded owner ruling in
`docs/PLAYER-TRINKETS_SPEC.md` — "not this pass" counts as a ruling for each — with the date and
the consequence of each ruling stated (notably whether W2 opens `player.stats`, which would make
F-151-5's missing `StatBlockSchema` bounds and F-151-6's missing stats pin immediately due); the
task halts `BLOCKED` for the owner and is never self-approved.

### T-180 · N8 — the actor-parameterised `resolveVisitHangout`, un-gated but unscheduled — `status: TODO` · `coder: opus` · `after: —`

N8 is now UN-GATED but NOT scheduled: the owner's 2026-08-02 ruling on `docs/NPC_REDESIGN.md`'s
PARITY LEDGER `| VisitHangout |` row explicitly does not commit to the build — "unblocked as future
work, not scheduled here". N8 = an actor-parameterised `resolveVisitHangout`/Liar's Dice resolver
replacing the `executeSocialize` stub, the 42-seat roster made zero-sum by construction, its own
capstone. Until it lands, `gambler` warns permanently in the coverage gate
(`packages/sim/src/balance/coverage.ts`). Currently tracked only as a `TODO` row on
`docs/NPC_REDESIGN.md`'s STATUS BOARD ("N8 — re-pin against a living field") plus §11.4 of
`docs/HANGOUT_REDESIGN.md`. Landing it also discharges the three deferred NPC-side defects that
ride the same row (the `executeSocialize` faucet's counterparty-free mint, the off-Hangout
Socialize verb, and the 150cr ante lockout). [harvested: T-157/n8-visithangout-parity]

**Accept:** `resolveVisitHangout` (and the Liar's Dice resolver behind it) is actor-parameterised
and replaces the `executeSocialize` stub, with the 42-seat roster zero-sum by construction — no
counterparty-free mint remains; the off-Hangout verb and the 150cr ante are each resolved or
explicitly re-deferred with a reason; `gambler` no longer needs its entry in
`ACKNOWLEDGED_COVERAGE_GAPS`; its own capstone is run and the four baseline pointers re-pinned;
`docs/NPC_REDESIGN.md`'s STATUS BOARD and PARITY LEDGER row updated; gate green.

### T-181 · D7's not-built alternative: a per-port interest-rate multiplier on `LOAN_DAILY_RATE` — `status: TODO` · `coder: opus` · `after: —`

The per-port INTEREST RATE multiplier on `LOAN_DAILY_RATE` — the alternative logged under owner
ruling D7 and explicitly NOT built by T-133 ("the previously-logged interest-rate-multiplier
alternative was not built") — is still open. Revisit after this playtest if Arcturus-6's tight
principal band alone doesn't read as enough per-port distinction, or if a later port wants to vary
predatory/generous terms rather than just loan size. It was not ruled out, only deferred because the
principal band reuses the `wager`-band pattern byte-for-byte (lowest engine risk).
[harvested: T-133/loan-interest-rate-axis]

**Accept:** the UAT/playtest read on whether the principal band alone gives enough per-port
distinction is recorded first; then either a per-port `LOAN_DAILY_RATE` multiplier ships as content
(read through an accessor, never an `if (systemId === ...)` branch in the engine, per T-133's
standing rule) with its band pinned by accessor rather than literal, or the alternative is closed
with the reason recorded in the D7 log; gate green.

---

## Completed (pruned — full blocks in git history)

Retrieve any block with `git log --grep="^<ID>:" -1 -p -- TASKS.md`.

| ID | Title | Milestone | Delivered | Commit | Harvested to |
|----|-------|-----------|-----------|--------|--------------|
| T-100 | Spec the Explore system: engine/content framework + the time cost | M1 | 2026-07-30 | `0493ff88` | explore-s7-unsettled |
| T-101 | Spec the Hangout system: engine vs content, parameterised per port | M1 | 2026-07-30 | `6213cdb8` | hangout-npc-defects-two-of-three, f-101-2-port-aware-npc-movement, lesson |
| T-102 | Spec consistency check — do the two specs honour the rulings, and do they collide? | M1 | 2026-07-30 | `6d051bb8` | dusk-ordering-check |
| T-110 | The Explore outcome framework, extracted behaviour-preserving | M2 | 2026-07-30 | `3468ef5f` | vacuous-wirefound-guard, lesson, lesson |
| T-111 | The time cost of recovery | M2 | 2026-07-30 | `dc0b2908` | lesson |
| T-112 | The unique-item effect surface | M2 | 2026-07-30 | `b1ab4284` | e2e-never-runs-before-merge, lesson |
| T-113 | Explore content pass 1 of 3 — the spine (~34 outcomes) | M2 | 2026-07-30 | `87579155` | content-package-has-no-test-runner, house-voice-two-rules-unasserted, lesson, lesson |
| T-114 | Explore content pass 2 of 3 — the middle (~33 outcomes) | M2 | 2026-07-30 | `6136bf5d` | explore-ui-clause-exhaustive-check, f-113-c-explore-repricing-owner-call, lesson, lesson |
| T-117 | The single band-weighted draw — the F-113-A engine flip | M2 | 2026-07-30 | — | contraband-event-variant, lesson, lesson, lesson |
| T-115 | Explore content pass 3 of 3 — the tail (~33 outcomes) | M2 | 2026-07-30 | `74a421d1` | deed-supply-slipped-the-scan, explore-pricing-owner-call, lesson |
| T-116 | Explore: measure it, and answer the question that started this | M2 | 2026-07-30 | `e0dbd40a` | explore-repricing-owner-call, band4-reachability-remeasure, baseline-pointer-check, trader-clear-day-21, lesson |
| T-120 | Extract the Hangout engine from its content, behaviour-preserving | M3 | 2026-07-30 | `08defa50` | hangout-engine-no-port-id-check, lesson |
| T-121 | A bar at all 14 spaceports — the reach change | M3 | 2026-07-30 | `a4c5901e` | lesson |
| T-122 | Hangout content pass 1 of 3 — the core worlds (5 ports) | M3 | 2026-07-30 | `b5dab264` | lesson, lesson, lesson |
| T-123 | Hangout content pass 2 of 3 — the exotic and the dangerous (5 ports) | M3 | 2026-07-30 | `f8a7fb17` | accessor-not-literal-guard, lesson, lesson |
| T-124 | Hangout content pass 3 of 3 — the last four, and the humour | M3 | 2026-07-30 | `e5107b51` | lesson, lesson, lesson, lesson |
| T-125 | Hangout: measure the reach, and re-read disposition | M3 | 2026-07-30 | `36104fde` | f-150-1-ruling, capstone-blind-to-disposition, two-arm-probe-recipe, trader-clear-day-tripwire, lesson, lesson |
| T-130 | CHECKPOINT — owner review of both systems | M4 | 2026-07-30 | `cefe13df` | parity-ledger-rows-unruled, hangout-npc-deferred-defects, f-150-1-owner-ruling, f-150-2-smuggler-explore-loop, clear-day-tripwire-red, lesson |
| T-131 | Bands 3-4 pay in dice, not days | M4a | 2026-07-31 | `b8f184f7` | apcost-playtest-tune, forfeit-vs-downgrade, band2-uniform-conversion-revisit, lesson, lesson |
| T-132 | Surface the dark half of the Hangout | M4b | 2026-07-31 | `47d406e0` | lesson, lesson |
| T-133 | A per-port loan band, Arcturus-6 first | M4c | 2026-07-31 | `bb239809` | loan-interest-rate-axis, per-port-branch-guard, lesson |
| T-134 | Spec the Liar's Dice Dare | M4d | 2026-07-31 | `34355c21` | lesson, lesson |
| T-135 | Build the Liar's Dice engine | M4d | 2026-07-31 | `45459981` | lesson |
| T-136 | Build the Liar's Dice UI | M4d | 2026-07-31 | `2cc35b87` | lesson |
| T-137 | Capstone: measure the new Dare | M4d | 2026-07-31 | `38764e16` | F-137-1-F-137-2, repin-consistency-check, liars-dice-unmeasured-channels |
| T-144 | Spec the roster & progression system | M4e | 2026-07-31 | `eed4cf30` | — |
| T-145 | Build the fixed opponent roster (content pass 1 of 1: 42) | M4e | 2026-07-31 | `59833a40` | liars-dice-roster-growth |
| T-146 | Build the unlock ladder | M4e | 2026-07-31 | `19ae5aa6` | F-146-1, liars-dice-tier-callsite-guard, lesson |
| T-147 | Achievement hooks | M4e | 2026-07-31 | `c27cf3bc` | — |
| T-148 | Capstone: measure the roster & ladder | M4e | 2026-07-31 | `3bf3dd19` | F-148-1, F-148-2, F-148-3, F-148-4, F-148-5, casual-dice-policy, lesson |
| T-149 | The rumor mill knows where the bars aren't | M4f | 2026-07-31 | `bc406f47` | socialize-ante-lockout, socialize-verb-off-hangout, lesson, lesson |
| T-150 | Re-measure post-fix, and put the named-pool gate to the owner | M4g | 2026-07-31 | `d85aaf9a` | F-150-1, F-150-2, parity-ledger-re-asks-unruled, socialize-verb-off-hangout, socialize-ante-150cr, explore-within-day-residual, known-red-itfails-tripwires, lesson, lesson |
| T-140 | Implement NPC decision tracing | M5 | 2026-08-01 | `786d1284` | F-140-1, F-140-2, accept-criterion-precedent-check, lesson |
| T-141 | Implement opt-in playtest logging | M5 | 2026-08-01 | `d95a7673` | playtest-log-web-inmemory-only |
| T-142 | Build the Tier 1 telemetry report generator | M5 | 2026-08-01 | `21b16c57` | F-142-1, telemetry-spec-3-parenthetical, smuggler-chosen-over-offered, f140-1-attribution-carried, lesson, lesson |
| T-143 | Build the Tier 1.5 dev control panel | M5 | 2026-08-01 | `9ea1d74a` | F-142-1, spec-s1-table-stale, lesson, lesson, lesson, lesson, lesson |
| T-151 | Bakeoff + spec: player-modifying trinkets | M6 | 2026-08-01 | `a82fa74f` | F-151-1, F-151-8, F-151-5, F-151-6, F-151-9, F-151-3-latent, owner-ruling-sec12, navbonus-alternative, npc-parity-row, write-rig-flatness-check, write-exhaustiveness-lint |
| T-152 | Build: fold sweep invariants into a pass/fail gate | M7 | 2026-08-01 | `ab7d3f91` | protocol-seam-invariants-unowned, lesson |
| T-159 | Fix: fighterPolicy's missing T-1104 relaxation, plus an archetype fallback-spread audit | M7 | 2026-08-01 | `b93a7af7` | F-159-2, F-159-1, d2a-check-for-gate-excluded-policies, lesson, lesson |
| T-153 | Validate: prove the sweep gate catches known regressions | M7 | 2026-08-02 | `3ec39470` | F-153-1, no-fresh-ci-run-post-T-159, doc-ci-state-staleness-check, lesson, lesson, lesson |
| T-157 | Coverage-matrix gate: cross-check sweep archetypes against verb parity | M7 | 2026-08-02 | `75004d33` | n8-visithangout-parity, npc-redesign-stale-magnitudes, explore-parity-warn, lesson, lesson, lesson |
