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
- **The Hangout exists at ONE system out of 28** (Sol-3, the starting system). The social
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
  track; two tasks below are expected to need it. **That 12 is a frozen anchor, not a live
  reading** — it moved to 15 at T-145 (`59833a40`, 2026-07-31) and has moved again since.
  **No number in this bullet is a live reading, and neither is any number in the version-history
  JSDoc at the top of `save.ts` — those record past bumps.** The only live reading is the
  `export const CURRENT_SAVE_VERSION = …` declaration further down `packages/engine/src/save.ts`.
  Never copy a number out of this bullet, out of that JSDoc, or out of an older Delivered note
  into a new Delivered note: grep the declaration, quote what it says, and pin its file:line, per
  `LESSONS.md`'s resolvable-pin rule. (T-255 fix round 1 shipped a note quoting "15,
  `save.ts:509`" lifted from exactly those two stale sources; the declaration read 17 at
  `save.ts:627`.)
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
  **RULED (owner, 2026-08-05): YES — NPCs get both verbs.** Both PARITY LEDGER rows (Explore,
  VisitHangout) close as "cast included," against the fresh T-150 numbers already on record. This
  un-gates **N8** (T-180) and the rest of the deferred N-series bullet below (N12, N5, N13) for
  scheduling — none of their `status:` fields are flipped by this bullet alone; each still needs
  its own task pass to close, including re-measuring the three VisitHangout-deferred defects
  (faucet mint, off-Hangout Socialize share, 150cr ante lockout) now that the cast is in. Record
  this ruling in `docs/HANGOUT_REDESIGN.md` §11.4, `docs/EXPLORE_REDESIGN.md` §10.4 and the two
  PARITY LEDGER rows in `docs/NPC_REDESIGN.md` the next time either doc is touched.
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
  owner sequencing call. **RULED (owner, 2026-08-03, at T-158): DEFER.** Not fixed this pass —
  the owner is prioritizing UI/visual-design iteration (T-186, T-188, T-189, T-190, T-191)
  first, and will revisit sequencing (N3 follow-up vs. N13) afterward. Recorded in
  `packages/sim/src/balance/coverage.ts`'s `ACKNOWLEDGED_COVERAGE_GAPS.fighter.owner` and
  `docs/NPC_REDESIGN.md`'s `| Combat |` PARITY LEDGER row.
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
  **Still no tag** — a tag is a stage marker cut by the ceremony, and the first (`alpha`) waits on
  a **start-to-finish career UAT pass** per `docs/VERSIONING.md`'s stage table. *(Corrected
  2026-08-06: this read "waits on T-158's own UAT pass". T-158's UAT closed 2026-08-03 — the owner
  played two live sessions and recorded both rulings — and its block was pruned by that day's
  harvest, so the pointer named a deleted block AND a discharged condition. What is actually unmet
  is the start-to-finish pass; see T-234, and T-233 for this reconciliation.)*
- **Anything R-owned:** R10's tier-1 hull cliff and the known-red `it.fails` tripwires.
- **Outer-rim Cantina venues, with pirates as clientele (owner, 2026-08-05).** Raised while
  reviewing the pirate/anonymous-interceptor roster: the rim is smuggling territory by design
  (`allowsContraband` flags exactly the six rim systems), so the owner finds it "exactly on
  flavor" that those ports would have their own — dangerous — Cantinas. **This directly reopens
  a standing ruling, not a gap:** `packages/content/src/systems.ts`'s `hasHangout` doc states
  outright that the rim (15–20), Andromeda, Maligna and Nemesis carry NO venue **"and that is a
  design requirement rather than an omission"** — fourteen core ports was the owner's own target
  verbatim, with an explicit "do not finish the job by flagging the rim" instruction, because an
  empty un-flagged set is what keeps `ActionBlocked{reason:'no-hangout'}` a real, tested path.
  Flagged here as a genuine future-expansion idea (a new venue archetype, not a reachability
  fix), explicitly NOT scheduled — it needs its own fresh owner ruling before any task is filed,
  since it supersedes rather than extends the T-121 ruling above.

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
| **F-150-1** | The **0.25 named-pool interceptor gate** (`actions/travel.ts`) and **`DISPOSITION_DECAY_INTERVAL_DAYS = 3`** (`content/disposition.ts`), read together now that the faucet is gated, the UI speaks, Explore's recovery model changed and the Dare is Liar's Dice | **OPEN — a DESIGN QUESTION for the owner, not a tuning knob (T-125's own ruling). NEITHER CONSTANT CHANGED BY T-150.** Measured: named share **25.07%** vs the analytic 25.00%, inertness **71.52%**, wronged-captain lift **2.358×**; the cast sits at exactly 0 on **96.52%** of live captain-days and a standing survives a **median 3 days**, with decay outrunning interaction **1.53 : 1** — so widening the gate alone would mostly buy more *inert* draws. **RULED (owner, 2026-08-03, at T-158): DEFER.** Neither constant fixed or accepted-as-final — the owner is prioritizing UI/visual-design iteration (T-186, T-188, T-189, T-190, T-191) first and will revisit afterward | `docs/HANGOUT_REDESIGN.md` §11.3, with a levers-not-pulled table |
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

## FILE ORDER — re-sequenced 2026-08-06

The 2026-08-06 harvest pruned 46 DONE blocks and left the survivors grouped by harvest batch,
not by run order; it also left four visual-arc tasks filed under the owner-gated M20 header and
two halt-on-sight human gates (T-232, T-234) sitting ABOVE fifteen runnable tasks — the exact
T-154/T-158 file-order failure T-229 exists to catch (that check is still unbuilt; it is the
first M8 task below). This re-sequence is ordering and grouping only: no task body, Accept
criterion, status, or harvested marker was altered, except two dated notes (T-233, T-251) and
T-251's `after:` gaining the motion-tier gate its own design doc states in prose.

The file order is now the run order:

1. **The visual/core-loop arc (M17, M14 → M19)** — the owner's standing priority (ruled
   2026-08-03 at T-158, restated 2026-08-05 in the M20 header). All autonomous. M17's
   completed checkpoint record leads the arc because T-186, T-193 and T-194 are gated
   `after: T-198` and file order must agree with `after:`.
2. **The harvested process guards (M8)**, then the Liar's Dice / instrument / policy
   remainders (M9 → M12), then the un-gated but unscheduled builds (M13). All autonomous.
3. **THE OWNER GATE** — every open task whose Accept needs a human ruling, pick, playtest read
   or session, so no `/orchestrate` run ever strands runnable work below a human halt.
4. **M20 last, behind its T-209 checkpoint**, exactly as the owner gated it.

File order agrees with every `after:` field (verified 2026-08-06).

---

## M17 — Owner ruling: the dawn-hand action economy (2026-08-04)

Authority: `docs/DAWN-HAND-REDESIGN.md`. The owner's board-game-designer pass on the whole
dawn-hand system: most of today's 15 die-costed actions were administrative overhead riding the
same scarce resource as the decisions that actually vary a run. The ruling splits every action
into **Main Actions** (cost a die — the actions that make a day's shape a real choice) and
**Free Actions** (bounded by something else already: credits, inventory slots, one-contract-at-
a-time, one-loan-at-a-time), plus new caps on the Free actions that had no bound besides the
die today. See the spec doc for the full table, the reasoning per action, and §5's open
questions.

**Amended at the owner-approved review pass, 2026-08-04.** Five changes, all reflected in the
blocks below and in the spec doc's own amendment header: (1) T-196 is split into T-196a/b/c —
the original task was engine + types + protocol + sim policies + UI + capstone in one commit,
and the a/b arms now double as a control-arm pair (rules-eased vs instruments-exploiting,
N13's own discipline). (2) The owner ruled a **single daily social pool**
(`SOCIAL_PLAYS_PER_DAY = 3`, a content constant) over Meet, Befriend, AND Insult — the three
disposition movers with no other bound — superseding the same-day per-NPC-per-day draft (spec
§4a records both the ruling and the logged not-chosen shapes); the capstone still measures the
Insult encounter-farming loop, now as verification that X = 3 holds it. (3) The spec's §5
Befriend-check question is RESOLVED in the same ruling: free Befriend rolls an internal d20
from the action's rng against the port's authored DC — the check and its content stay live.
(4) T-197 carries the save bump (13 → 14) its
two persistent caps imply, per the standing migration constraint. (5) T-198, a pacing
checkpoint, sits between the capstone and T-194 — T-195 already moved clear rate +12.6% and
median credits +40.5%, M17 roughly doubles a trading day's useful actions, and the day-30
marker/contract deadlines/loan terms were all tuned against the old economy; nobody should
write tutorial copy against numbers the owner may still re-tune.

**Moved at the 2026-08-06 re-order:** T-237 (the route-preview fuel-bill call, harvested from
T-162 into this section) needs an owner decision and now sits in the OWNER GATE section below.

### T-198 · CHECKPOINT — owner pacing read on the post-M17 economy — `status: DONE` · `coder: opus` · `after: T-197`

Compacted 2026-08-06 — kept only as a dependency anchor for open `after:` references; triaged first (no open work found, everything below already had a permanent home). Full record: `git show 0ba0fe8f` or `git log --grep="^T-198:" -p -- TASKS.md`. Rulings/findings duplicated in `docs/DAWN-HAND-REDESIGN.md`, `docs/LIARS-DICE-DECISIONS.md` (LD-23), `docs/NPC_REDESIGN.md`, `docs/playtests/T-198-pacing-brief.md`.

---

## M15 — Owner UAT pass 2: board-quadrant feedback (2026-08-03)

Four findings from the owner's second live session, one per board quadrant. Captured verbatim per
the Bug Discovery Policy. All four are UX/design, filed as tasks rather than `F-` findings for the
same reason as M14: each is substantial enough to need its own implementation pass.

**Re-homed here at the 2026-08-06 re-order:** T-215 (the ruled T-188 globe build) had been
appended under the owner-gated M20 header; it is this milestone's build-out.

### T-215 · Build: the 3D lat/long globe Starmap, replacing the flat 2D projection — `status: DONE` · `coder: opus` · `after: T-188`

Compacted 2026-08-06 — kept only as a dependency anchor for open `after:` references; triaged first (no open work found, everything below already had a permanent home). Full record: `git show 428fa274` or `git log --grep="^T-215:" -p -- TASKS.md`. Rulings/findings duplicated in `docs/UI-PRESENTATION-DECISIONS.md` (UI-1, UI-39).

### T-219 · BUG: the cockpit's panes overlap each other at phone width — `status: DONE` · `coder: opus` · `after: T-215`

Found during T-215's mobile root-cause pass (2026-08-06) and filed rather than folded into it —
it is out of that task's scope (T-215 is the starmap's geometry and gestures, and this reproduces
on every pane) and deferring it rolls up no debt, because nothing T-215 shipped builds on or
routes around the broken layout: the globe is `width: 100%` inside its pane and inherits whatever
the pane's box becomes.

**Reproduce:** open the cockpit under Playwright's `devices['Pixel 5']` (393×851). The manifest
board and port-ledger panes paint across the starmap pane, the masthead's control cluster runs
off the right edge, and the dawn-hand tray sits under the overlay. `document.scrollWidth` still
equals `clientWidth`, so this is overlap inside a fixed grid, not horizontal overflow.

**Scope note:** this is the whole cockpit's responsive story, not one pane's — `.col` /
`.col.left`'s grid rows, `.pane` sizing and the masthead. Whether phone width is even a supported
surface is an owner call (the shipped surfaces today are the Electron app and the web build);
"decide it is not supported, and say so in `docs/UI-PRESENTATION-DECISIONS.md`" is a legitimate
resolution of this task.

**Accept:** either (a) at 393×851 no two panes' bounding boxes intersect and every masthead
control is inside the viewport, with an e2e spec pinning it; or (b) a recorded owner ruling that
phone width is out of scope, written into `docs/UI-PRESENTATION-DECISIONS.md` with the reason,
and `starmap-globe-touch.spec.ts`'s viewport comment re-pointed at that ruling. Gate green.

**Delivered — route (a), the fix. Route (b) was not available: it requires "a recorded owner
ruling", no owner was in this loop, and writing a ruling the owner never made would fabricate a
decision record.** The defect is CSS-only. **No file under `packages/engine`, `packages/content` or
`packages/sim` was touched** — so no `rulesFingerprint` staling, no content capstone, no save-shape
change, no migration, and no `CURRENT_SAVE_VERSION` reading is quoted here because none is relevant.

*Root cause, measured at `devices['Pixel 5']` (393×851, clientHeight 727) against the real preview
build — two independent defects, both in `packages/ui/src/theme.css`:*

1. **Horizontal.** `.screen` is `display: grid` with no `grid-template-columns`, so its one implicit
   `auto` track took a `min-content` automatic minimum. `.bezel`/`.wire`/`.dock` do not wrap, so
   that minimum was 398px inside a 341px parent: every child blew out to 398px and the Settings and
   New game switches measured `right: 424` against a 393px viewport, clipped silently by
   `.tube { overflow: hidden }` — which is exactly why `document.scrollWidth === clientWidth` while
   controls sat off screen.
2. **Vertical.** The `@media (max-width: 900px)` block stacked `.main` to one column while
   `.col.left` still carried `grid-template-rows: 200px auto`. Bezel 237.6 + dock 225.7 of 727 left
   the `1fr` row 144.8px, so a 200px starmap row was forced into a 66.4px column: `pane starmap`
   painted across `pane manifest-board` (h=25.3) and `pane trade` (h=20.2), `pane ship` was 2px.

*Changes:*

- **Tier 1 — structure**, the amended `@media (max-width: 900px)` block, `packages/ui/src/theme.css:3323`
  (comment) / `3361` (rules). The `200px` row is DELETED, not re-tuned. `.screen` and `.main` take
  `minmax(0, 1fr)`; `.col`/`.col.left` take `grid-auto-rows: min-content`; `.main` becomes the
  scroll container (`overflow-y: auto; overflow-x: hidden`) so `body { overflow: hidden }` and
  `.tube`'s viewport-sized positioning context survive for every absolutely-positioned overlay.
- **Tier 2 — density**, a new `@media (max-width: 560px)` block, `theme.css:3395` (comment) / `3412`
  (rules). No structural rules; chrome only. Returns ~100px to the board: bezel 265.8 → 181.5,
  `.main` 116.7 → 253. Includes `.smsvg { max-height: 190px }`; the T-215 ruling at the `.smsvg`
  declaration (`theme.css:559`, note at `:569`) forbids RAISING that ceiling, and the comment there now records
  that this phone-only lowering is that ruling applied, not waived.
- **The bottom-anchored overlays**, a consolidated `@media (max-width: 560px)` block at
  `theme.css:4855` (comment) / `4889` (rules). `.storylet-panel` (150px), `.walkthrough[…='hand']` (150px) and
  `.onboarding[…='hand']` (132px) all held distances chosen against a desktop dock; the phone dock
  is ~210px, so all three sat on the dawn-hand tray — and the walkthrough card is not
  `pointer-events: none`, so it ate the die clicks step w2 asks for. Re-anchored to the TOP
  (`top: 8px; bottom: auto`), not given a bigger `bottom:`, because dock height is content-driven.
  The block must stay LAST in source: identical specificity means source order is the whole
  mechanism, and the first cut of the fix put it 500 lines too early, left `bottom: 132px` in force,
  and produced a 567px-tall coach (a box with both `top` and `bottom` resolved STRETCHES).
- **`packages/ui/e2e/cockpit-phone-layout.spec.ts`** (new, 7 tests, untagged, per-file `test.use`
  and no new Playwright project so the `@tour-one` flake denominator does not move). Anti-gaming
  guards included: pane count must be 4 (unmounting one would satisfy everything else) and the
  shortest pane ≥ 40px (crushing one also removes its overlaps). **Negative control run:** against
  the pre-fix `theme.css`, 6 of the 7 fail (`pane starmap: 200.0 | pane ship: 2.0 |
  pane manifest-board: 25.3 | pane trade: 20.2`); the one that passes is the
  `scrollWidth <= clientWidth` test, which is the invariant the fix had to PRESERVE.
- **`packages/ui/src/__tests__/phone-layout.test.ts`** (new, 6 tests). `npm test` is vitest only, so
  the e2e spec above is outside the mandatory gate; this source scan closes that hole and pins the
  three declarations the geometry rests on — no pixel `grid-template-rows` on `.col.left`,
  `minmax(0, 1fr)` on `.screen`/`.main`, and the source-order dependency of the overlay overrides.
  Negative control: 5 of 6 fail against the pre-fix file.
- **`docs/UI-PRESENTATION-DECISIONS.md` — new ruling UI-41** (§1, after UI-39; UI-40 was the prior
  maximum). Records that **phone width IS a supported surface for the web build**, which is the
  substance of the fork this task was handed, plus the measured evidence and both readers.
- **`packages/ui/e2e/starmap-globe-touch.spec.ts:37-51`** — the comment claiming the cockpit
  overlaps itself at 393px was false after this task. Re-pointed at UI-41 and at the new spec; the
  surviving reason for the 1024px viewport (1024 is above the 900px breakpoint, so the gesture is
  measured in the layout it was designed in) is stated in its own right.

*Verified unchanged at desktop:* both media tiers are inert above 900px, and every other e2e spec
runs at 1280×720 except `starmap-globe-touch.spec.ts` at 1024×800.

**Delivered (2026-08-06):** shipped route (a), the CSS-only fix, not route (b) — no owner ruling on
phone-support was in this loop to record, so writing one would have fabricated a decision. Two
independent `theme.css` defects (an unconstrained `.screen` grid track blowing controls off-viewport,
and a fixed 200px starmap row forced into a 66.4px column under the 900px breakpoint) are corrected
with two new responsive tiers (structure at 900px, density at 560px) plus a re-anchor of three
bottom-docked overlays; `cockpit-phone-layout.spec.ts` (7 e2e tests, with anti-gaming pane-count and
min-height guards) and `phone-layout.test.ts` (6 unit tests) pin the geometry, both with negative
controls proven red against the pre-fix file. `docs/UI-PRESENTATION-DECISIONS.md` records ruling UI-41
that phone width IS a supported surface for the web build, and the stale overlap comment in
`starmap-globe-touch.spec.ts` is re-pointed at it. No file under `packages/engine`, `packages/content`
or `packages/sim` was touched, so no `rulesFingerprint` move, no capstone, and no `CURRENT_SAVE_VERSION`
change is owed. Scope boundary: this closes the whole cockpit's phone-width layout, not just the
starmap pane that surfaced it — desktop (>900px) is verified inert under both new media tiers.

Orchestration: attempts=1/4.

---

## M16 — Owner UAT pass 3: the dawn-hand die is illegible (2026-08-04)

### T-260 · Promote the haggle and combat-stance DCs to exported content constants — `status: TODO` · `coder: opus` · `after: —`

**Deferred extraction, filed by T-194 with its measured evidence, and BATCHED — never a
standalone sweep.** Two DCs the cockpit now previews live as un-exported literals inside their
resolvers: `const haggleDc = 12;` (`packages/engine/src/actions/trade.ts`) and
`const dc = 10 + encounter.interceptor.tier;` (`packages/engine/src/actions/combat.ts`). T-194
needed both to render "[14] + TRADE 2 = 16 vs DC 12 → CLEARS IT" and could not import either, so
it MIRRORS them in `packages/ui/src/format.ts` (`HAGGLE_DC`, `combatStanceDc`).

**Why it was not done inside T-194 (measured, not assumed):** `packages/sim/src/balance/
rules-fingerprint.ts` hashes the semantic source of `packages/engine/src/**` plus
`packages/content/src` wholesale, and T-193 probed it — appending one line of *code* to a resolver
flips `balance-smoke.test.ts`'s "is not stale" assertion red. Exporting a constant for a READOUT
would therefore owe a full 8,000-run capstone sweep on its own. **Does not compound:**
`packages/ui/src/__tests__/engine-dc-pins.test.ts` reads both resolvers' SOURCE and fails the
build the moment either literal drifts, naming the mirror to update — so the duplication cannot go
stale silently, and nothing downstream can build on a wrong number. [harvested: T-194/T-260]

**Accept:** both DCs live as exported constants in `packages/content/src` (beside
`TALK_DC_PER_DISPOSITION`, which already models the shape), read by their resolvers AND by
`format.ts`, with the two mirrors and `engine-dc-pins.test.ts` DELETED rather than weakened; a
test pins the cockpit's previewed DC to the imported constant; **batched into the next milestone
capstone together with T-258 and T-259** (one fingerprint move, one sweep) with `npm run format`
run BEFORE the capstone; gate green.

### T-261 · Explore's extra-dice toll is invisible until the claim fails — `status: TODO` · `coder: opus` · `after: —`

**Filed by T-194 under its own Accept part 3 ("if not, FILE the cleanup rather than widening this
one").** The two richest exploration outcome bands charge 2–3 EXTRA dice at CLAIM
(`apCost`, `packages/engine/src/exploreOutcomes.ts`), out of the same hand, AFTER the nav roll has
already succeeded. A player with a thin hand can pass the check, chart the find, and still lose it.

**What T-194 did do, and why it stopped there.** The copy is now honest — the
`insufficient-dice` notice, the w6 walkthrough line and the `first-explore` prompt all say those
dice are a TOLL paid to lift a find rather than a roll — because that much needed no number. What
it did NOT do is surface the toll BEFORE the claim, because the band is drawn at resolution: any
number shown at sweep time would be UI fiction, and the honest version needs the engine to quote
the band (or a bound on it) as part of the discovery.

**Bug Discovery Policy risk analysis, written not asserted.** (a) OUT OF SCOPE for T-194: T-194 is
UI-only by design and a quote helper is an engine/content read that moves `rulesFingerprint`
(see T-260). (b) DOES NOT COMPOUND: nothing builds on the toll being hidden; the failure already
renders as a typed notice rather than silence, and the copy no longer mis-teaches it as a roll.
[harvested: T-194/T-261]

**Accept:** the cockpit can state, before the claim, what lifting a find may cost — either the
drawn band's real `apCost` (if the engine can quote it at discovery) or the authored WORST CASE
named as a worst case, never a fabricated point estimate; a test pins the shown number to the
engine's own value for at least one band and asserts nothing is shown where nothing is known;
batched with T-260 into one capstone; gate green.

### T-262 · FLAKE: `e2e/visual-identity.spec.ts` "the wire cap never overlaps the ticker" measures before layout settles — `status: TODO` · `coder: opus` · `after: —`

**Found by T-194 while running the e2e suite at its gate, and PROVED pre-existing rather than
assumed.** `e2e/visual-identity.spec.ts:285` asserts `capBox.x + capBox.width <= trackBox.x + 1`
on the FIRST measurement after `page.goto('/')`, with no bulletin chip in the wire. It fails
intermittently (~1 in 6 runs) with the cap measuring ~9px wider than the settled layout
(observed: 234.27 vs 225.03), then passes on Playwright's retry.

**Proof it is not T-194's.** Reproduced with T-194's entire `theme.css` block removed
(`npx playwright test visual-identity --repeat-each=6 --grep "wire cap"` → 1 flaky, 5 passed), and
T-194 changed no wire markup and no `.wire` rule. The likely cause is the display webfont: the cap
contains "GALACTIC WIRE" in `--font-display`, so a measurement taken before `document.fonts.ready`
sizes it against the fallback face. The starmap already handles exactly this class of problem by
re-measuring on `document.fonts` `loadingdone` (`App.tsx`'s `Starmap`).

**Bug Discovery Policy risk analysis for deferring.** (a) OUT OF SCOPE for T-194: the defect is in
a T-217/T-218 geometry spec that T-194 neither wrote nor touched, and fixing a flake by editing
someone else's assertion inside an unrelated task is how a real geometry regression gets hidden.
(b) DOES NOT COMPOUND: it is a TEST-side race, not a product defect (the settled layout is
correct); it is confined to one assertion; and it is loud rather than silent — Playwright reports
it as flaky rather than green. No other work routes around it. [harvested: T-194/T-262]

**Accept:** the spec waits for the settled layout before measuring (`await
page.evaluate(() => document.fonts.ready)`, or the equivalent poll on the cap's own box), the
assertion itself is UNCHANGED and not widened, and `--repeat-each=20 --grep "wire cap"` reports
zero flaky; gate green.

### T-258 · BUG: `travelPreview` discounts the crossing's fuel bill; `resolveTravel` does not — `status: TODO` · `coder: opus` · `after: T-237`

**Found by T-193 while reading the two functions side by side. LATENT, NOT LIVE — see the risk
analysis.** `travelPreview` (`packages/engine/src/actions/travel.ts:253-255`) applies
`navDieFuelDiscount(die)` to `fuelCost` whenever a `die` argument is passed, with no crossing
exclusion. `resolveTravel` (same file, `:676-678`) deliberately excludes it —
`isCrossing ? baseFuelRequired : discounted` — because the Nemesis crossing has its own quoted burn
(`quoteCrossingStake`) that must not drift out from under the quote. So
`travelPreview(state, NEMESIS_SYSTEM_ID, die)` **understates** the crossing's bill, breaking
`travelPreview`'s own stated contract ("reads only existing engine functions, so it invents no rule
and can never disagree with `resolveTravel`").

**Bug Discovery Policy risk analysis, written not asserted.** (a) OUT OF SCOPE for T-193: the fix is
a code edit to `packages/engine/src/**`, which `packages/sim`'s `rulesFingerprint` hashes wholesale
— T-193 measured that appending a single line of code to `travel.ts` flips `balance-smoke.test.ts`'s
"the fixture describes the ruleset in the working tree · is not stale" assertion red, so even this
one-line guard owes a full 8,000-run capstone sweep and must be batched into one. (b) DOES NOT
COMPOUND: **no caller passes a die today.** Every `routePreview`/`travelPreview` call site in the UI
uses the two-argument form (`App.tsx`'s starmap preview, the manifest rows, the contract cards), and
T-193 deliberately did not start passing one — it reads the die's effect through
`navDieFuelDiscount`/`navDieEvasionFactor` directly and never asks the preview to apply it. The bug
becomes reachable **only** if T-237 rules "pass the armed die", which is why it is gated
`after: T-237` and named as a prerequisite inside T-237's Accept rather than left free-floating.
[harvested: T-193/T-258]

**Accept:** `travelPreview` excludes the crossing from the die discount by the same predicate
`resolveTravel` uses (ideally the one T-259 extracts, so the exclusion is stated once, not twice); a
test pins `travelPreview(state, NEMESIS_SYSTEM_ID, 20).fuelCost === travelPreview(state,
NEMESIS_SYSTEM_ID).fuelCost` **and** that an ordinary destination still discounts, so a fix that
disabled the discount everywhere fails; the fingerprint move is predicted up front and folded into
the milestone capstone (never a standalone sweep); gate green.

### T-259 · Extract `travelRollsPilotCheck(destination)` so the resolver and the UI stop restating the same predicate — `status: TODO` · `coder: opus` · `after: —`

**Deferred extraction, filed by T-193 with its measured evidence.** Since T-1605, "does this jump
roll a Pilot check?" is `destination === NEMESIS_SYSTEM_ID`, and that predicate is now written in
two places: `resolveTravel`'s `isCrossing` (`packages/engine/src/actions/travel.ts:662`) and
`routeCheckReadout` in `packages/ui/src/format.ts`, which T-193 added so the starmap would stop
advertising a dead DC. The clean shape is a single exported `travelRollsPilotCheck(destination)` in
`travel.ts`, read by `resolveTravel`, by `travelPreview`, and by the UI selector.

**Why it was not done inside T-193 (measured, not assumed):** `packages/sim/src/balance/
rules-fingerprint.ts` hashes the semantic source of `packages/engine/src/**` plus
`packages/content/src` wholesale. T-193 probed it — appending one line of *code* (not comment) to
`travel.ts` flips `balance-smoke.test.ts`'s "is not stale" assertion from pass to fail — so a
provably inert extraction would owe an 8,000-run capstone sweep on its own. T-193 therefore stayed
UI-only and had the selector branch on the same **content** constant (`NEMESIS_SYSTEM_ID`) the
resolver branches on, reading the DC itself out of `travelPreview` so the two cannot quietly
disagree. Does not compound: the duplication is one comparison against a content id, both sides name
each other in comments, and any future change to which routes roll a check would fail T-193's
`packages/ui/src/__tests__/route-preview.test.ts` negative-control loop. [harvested: T-193/T-259]

**Accept:** `travelRollsPilotCheck(destination)` lives in `packages/engine/src/actions/travel.ts`,
exported through the engine barrel, and is the ONLY place the predicate is written — `resolveTravel`
consumes it in place of the inline `isCrossing` comparison, and `packages/ui/src/format.ts`'s
`routeCheckReadout` consumes it in place of its own `NEMESIS_SYSTEM_ID` comparison; the move is
proved behaviour-preserving in its own commit; **batched into the next milestone capstone together
with T-258 and any other engine-source work** (never a standalone sweep) with `npm run format` run
BEFORE the capstone; gate green.

---

## M18 — Owner feature requests, filed at the T-198 pacing review (2026-08-05)

Two feel/onboarding requests the owner raised while reviewing T-198's pacing brief. Independent
of the M17 dawn-hand arc and of R2/R3 — both are eligible now, not gated behind T-198.

**Moved at the 2026-08-06 re-order:** T-251 (needs the owner's treatment pick before any build)
and T-254 (an owner vocabulary ruling) now sit in the OWNER GATE section below.

### T-252 · The third motion tier — SpacerQuest ships a binary motion model against a three-tier rule — `status: DONE` · `coder: opus` · `after: —`

Compacted 2026-08-06 — kept only as a dependency anchor for open `after:` references; triaged first (no open work found, everything below already had a permanent home). Full record: `git show f7300e6a` or `git log --grep="^T-252:" -p -- TASKS.md`. Rulings/findings duplicated in `docs/UI-PRESENTATION-DECISIONS.md` (UI-31, UI-23 amended), `docs/design/T-201-dawn-hand-roll.md`, `docs/LESSONS.md` (L-061), `docs/TEST-TIER-DECISIONS.md` (TT-17).

## M8 — Harvested: testing, CI and gate coverage

Transplanted 2026-08-02 out of completed blocks before they were pruned. Each body carries its
`harvested:` provenance marker verbatim — do not reword the markers.

### T-229 · Write the check that a task's file ORDER in TASKS.md agrees with its `after:` field — `status: TODO` · `coder: opus` · `after: —`

Write the check that a task's ORDER in `TASKS.md` agrees with its `after:` field. T-154's
resequencing (originally `after: T-158`, split so the build could precede UAT) was recorded ONLY in
the `after:` fields, and was INERT for a day: the orchestrator picks the first eligible `TODO` in
FILE order, and T-158 carries `[BLOCKED BY = Human UAT]` and HALTS the run — so T-154 sitting below
it in the file was unreachable no matter what its `after:` said. No test or script audits `TASKS.md`
ordering against `after:` today, so this class recurs silently: a task can be correctly unblocked on
paper and still never be picked up. [harvested: T-154/write-tasks-order-vs-after-check]

**Accept:** an automated check (test or script, wired into `npm test` or the gate) parses
`TASKS.md`'s task headers and fails when a `TODO` task appears in the file BEFORE a task it depends
on via `after:`, and also flags a `TODO` task sitting below a halting/`BLOCKED` task it does not
depend on; the T-154/T-158 case is used as the regression fixture and provably fails the check as
written before the fix; whether the fix is re-ordering the file or teaching the runner to look past
a halt is recorded either way; gate green.

### T-230 · Write the check that symbols and paths named in a Delivered note actually resolve — `status: TODO` · `coder: opus` · `after: —`

Write the check that symbols/paths named in a **Delivered** note actually resolve in the tree.
T-154's Delivered note claimed "three deterministic brains — `first-legal`, `random`,
`recorded`-replay" when `packages/sim/src/pilot.ts` exported `firstLegalBrain` / `scriptedBrain` /
`recordedBrain` and `pilot-cli.ts`'s `BRAIN_NAMES` was `['first-legal', 'anthropic', 'recorded']` —
no `random` brain existed at all (**F-155-3**). It was caught by the VALIDATE task, not by the build
task's own gate. The only check that exists today is instance-level
(`packages/sim/src/__tests__/pilot.test.ts` "accepts --brain random", line 496); nothing audits the
CLASS, so any Delivered note can name a symbol or path that is not in the tree and no gate notices.
[harvested: T-154/write-delivered-note-claim-audit]

**Accept:** an automated check extracts backticked path- and symbol-shaped tokens from `Delivered`
notes in `TASKS.md` and fails when a named path does not exist or a named exported symbol does not
resolve in the workspace, with a documented ignore convention for prose tokens that are
deliberately not code; T-154's `random`-brain claim is used as the regression fixture and provably
fails the check; false-positive rate on the existing Delivered notes is measured and stated, and
the check is wired where it will actually run; gate green.

### T-238 · F-164-1: three pure-content test blocks are still hosted in the engine suite — `status: TODO` · `coder: opus` · `after: —`

**F-164-1 (OPEN, carried forward from T-164).** Three pure-content test blocks are still hosted in
the engine suite and qualify to move under the `docs/TESTING-STRATEGY.md` Part I rule, each
importing only `@spacerquest/content`: `packages/engine/src/__tests__/systems.test.ts:11` (T-1101
starmap geometry), `packages/engine/src/__tests__/nemesis.test.ts:253` (T-1505a Signal Fragment
validation), `packages/engine/src/__tests__/deeds.test.ts:1179` (T-1504c renown-rank validation).
This was deliberately out of T-164's scope (its charter was the runner plus the Explore split, not a
mass relocation), and it rolls up no debt: each block is green where it sits, nothing builds on its
location, and moving it later is a file move with no behaviour change. Each of the three carries an
in-file comment pointing at this ledger. Explicitly NOT on this ledger, so it is not re-litigated:
`hangoutContent.test.ts` and `liarsDiceContent.test.ts` assert through `../hangoutRules.js` /
`../liarsDiceRules.js` and are engine-hosted PERMANENTLY. The ledger is mirrored as a table in
`docs/TESTING-STRATEGY.md` ("The migration ledger (F-164-1)"), but that document points at
`TASKS.md` as the repo-side ledger, so this entry is that ledger.
[harvested: T-164/F-164-1]

**Accept:** the three named blocks are either relocated into `packages/content`'s own test suite or
their engine-suite hosting is ruled permanent with the reason recorded; the in-file comments in
`systems.test.ts`, `nemesis.test.ts` and `deeds.test.ts` are updated to point at the outcome rather
than at this open ledger; `docs/TESTING-STRATEGY.md`'s "The migration ledger (F-164-1)" table is
updated to match, and its pointer at `TASKS.md` is re-aimed or retired;
`hangoutContent.test.ts` / `liarsDiceContent.test.ts` are NOT moved and their permanent-hosting note
survives; test counts before and after are stated so no block is silently dropped; gate green.

### T-239 · Write the check that doc→source line pins still resolve — `status: TODO` · `coder: opus` · `after: —`

Write a check that doc→source line pins resolve, so `docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.9's
levers row and similar pins cannot go stale silently. T-169 found `sim/index.ts:3487-3513` had
rotted to `4219-4263` and caught it only because the pin was re-read by hand rather than copied; the
same block's own spec pins (§12.9 F-148-2 blockquote cited at line 2087, levers row at 2178, §12.10
item 2 at 2194) have since rotted to 2367 / 2466 / 2486.
`packages/sim/src/__tests__/baseline-pointers.test.ts` enforces only the five BALANCE-RIG BR-14
baseline-of-record pointer sites, not doc-to-source line pins, so no check exists today.
[harvested: T-169/doc-source-pin-rot-check]

**Accept:** an automated check (test or script, wired where it will actually run) extracts
`path:line` and `path:line-line` pins from `docs/**` and fails when the path does not exist or the
cited line no longer contains the symbol/anchor the prose names; the T-169 rot cases
(`sim/index.ts:3487-3513` → `4219-4263`, and §12.9's own 2087/2178/2194 pins) are used as regression
fixtures and provably fail the check as written; a documented ignore convention exists for pins
deliberately frozen to a historical commit; the false-positive rate over the current `docs/` tree is
measured and stated; gate green.

### T-240 · Write the check that every Playwright suite declares its first-run walkthrough stance — `status: TODO` · `coder: opus` · `after: —`

T-187's Delivered note claimed "all 33 other specs declare they are not testing the first-time flow"
via `packages/ui/e2e/support/career.ts`'s `skipFirstTurnWalkthrough(page)`, but
`packages/desktop/e2e` was left out entirely — `packages/desktop/e2e/shell.spec.ts` went red from
commit `eed2f3fe` (6/8 failing on `<div class="body"> intercepts pointer events` at `payDebt`,
because the `debt-ledger` block carries `inert` + `data-rails-off="1"`) and stayed red until T-189
added the desktop suite's own `skipFirstTurnWalkthrough` in
`packages/desktop/e2e/support/cockpit.ts`. Write the check that every Playwright suite/spec that
boots a virgin profile declares its first-run walkthrough stance — call the skip, or opt out
explicitly the way `packages/ui/e2e/walkthrough.spec.ts` and
`packages/ui/e2e/opening-marker.spec.ts` do. Today nothing catches the next suite that omits it.
Sibling of the existing T-229 / T-230 process checks.
[harvested: T-187/e2e-first-run-gate-check]

**Accept:** an automated check enumerates every spec under `packages/ui/e2e` AND
`packages/desktop/e2e` and fails when a spec that boots a virgin profile neither calls its suite's
`skipFirstTurnWalkthrough` helper nor carries the documented explicit opt-out marker; the
`packages/desktop/e2e/shell.spec.ts` state at commit `eed2f3fe` is used as the regression fixture
and provably fails the check; the opt-out convention is documented where spec authors will see it
(`docs/TESTING-STRATEGY.md`); both suites' current specs pass without edits beyond adding the
opt-out marker where the stance is genuinely deliberate; gate green.

### T-241 · Write the check that a Delivered note's claims agree with the tree — `status: TODO` · `coder: opus` · `after: —`

Write the check that catches a `TASKS.md` Delivered note asserting something the tree contradicts.
T-197's block produced TWO instances of the class: (a) it claimed the Liar's Dice rounds numbers were
"confirmed with the owner" while `LIARS_DICE_ROUNDS_PER_DAY = [1, 2, 2, 3, 3, 4]` still shipped
marked `PROPOSED — AWAITING OWNER CONFIRMATION` in all three places T-197 itself put the marker —
`packages/content/src/liarsDice.ts:101` (docblock; array at `:111-112`, now `:132`),
`docs/DAWN-HAND-REDESIGN.md` §5's last bullet (headed **STILL OPEN**), and
`docs/LIARS-DICE-DECISIONS.md` LD-23; and (b) it claimed the save shape bumped
`CURRENT_SAVE_VERSION` 13 → 14, whereas `packages/engine/src/save.ts:238` records T-197 bumping to
16 (v15→v16, `MIGRATIONS[15]`, per `docs/VERSIONING.md`). Both were caught only by a human review
pass at T-198. Nothing machine-checks this today: `scripts/check-signoff.mjs`
(`npm run release:signoff`) only gates `docs/RELEASE-CHECKLIST.md` §G waiver rows, and TP-28 in
`docs/TASK-PROCESS-DECISIONS.md` prescribes the correction ritual but nothing detects the need for
it. [harvested: T-197/delivered-note-claim-check]

**Accept:** an automated check fails when a DONE block's Delivered note claims an owner confirmation
while a `PROPOSED — AWAITING OWNER CONFIRMATION` marker naming that task still ships anywhere in
`packages/` or `docs/`, and fails when a Delivered note's `CURRENT_SAVE_VERSION` N → N+1 claim
disagrees with `packages/engine/src/save.ts`; T-197's two instances are used as regression fixtures
and provably fail the check as written; the check is wired where it will actually run and its
relationship to `scripts/check-signoff.mjs` and TP-28's correction ritual is stated; false positives
over the existing Delivered notes are measured and stated; gate green.

### T-242 · Write the check that `castValidation.ts` never acquires the cycle-closing runtime import — `status: TODO` · `coder: opus` · `after: —`

Write the check that `packages/content/src/castValidation.ts` never acquires a RUNTIME import of
`./liarsDiceValidation.js` (or any other module that runtime-imports `./cast.js`). T-205's
`CAST_DICE_COUNT_PHRASE` is a forced duplicate of `LIARS_DICE_DICE_COUNT_PHRASE` because importing it
would close the init cycle `cast.ts → castValidation.ts → liarsDiceValidation.ts → cast.ts` (a TDZ
hazard). Today the only guard is the docblock at `packages/content/src/castValidation.ts:78` — and
per L-020 prose is not enforcement. The existing pin at
`packages/content/src/__tests__/castValidation.test.ts:307-308` asserts `.source`/`.flags` match,
which a real import would trivially satisfy, so the cycle would ship green.
`contentPackageBoundary.test.ts` covers only PACKAGE-level cycles, and `eslint.config.mjs` has no
`import/no-cycle` rule (verified: no import plugin is configured).
[harvested: T-205/content-cycle-check]

**Accept:** an automated check (a source-scanning test in `packages/content/src/__tests__`, or an
`import/no-cycle` lint rule if the plugin is added) fails on a MODULE-level import cycle inside
`packages/content/src`, and specifically on a runtime import of `./liarsDiceValidation.js` from
`castValidation.ts`; the cycle is introduced deliberately in a scratch arm and shown to fail the new
check while the existing `castValidation.test.ts:307-308` `.source`/`.flags` pin still passes,
proving the old pin was not enough; the `CAST_DICE_COUNT_PHRASE` duplication is re-commented to point
at the check rather than at prose; type-only imports are explicitly permitted and that carve-out is
documented; gate green.

### T-263 · Write the check that every artefact path cited in a Delivered/Accept note resolves on disk — `status: TODO` · `coder: opus` · `after: —`

Write the check that every artefact path cited in a `TASKS.md` **Delivered** or **Accept** note
actually resolves on disk. `docs/LESSONS.md:54` states the resolvable-pin rule, but nothing
EXECUTES it: for three consecutive rounds T-218's screenshot-pass Accept clause — plus T-216's
evidence line and T-217's screenshot line — was discharged by citing `test-results/*.png` at the
REPO ROOT, when Playwright's CWD is `packages/ui` and therefore the files existed in NEITHER tree.
The claim read as satisfied and the artefacts were never there. Neither the vitest suite nor
`~/.claude/skills/orchestrate/orchestrate-tasks.js` has a step that greps cited evidence paths, so
the class is entirely unguarded. This is the ARTEFACT-path sibling of T-230 (symbols and source
paths in Delivered notes); they may share one implementation.
[harvested: T-218/evidence-pin-resolves-check]

**Accept:** an automated check extracts artefact-shaped paths (screenshots, JSON reports, logs,
`test-results/**`) from `Delivered` and `Accept` notes in `TASKS.md` and fails when a cited path
does not exist on disk, resolving relative paths against the package that actually produces them
rather than assuming the repo root; the T-218/T-216/T-217 `test-results/*.png` citations are used
as the regression fixture and provably fail the check as written; the false-positive rate over the
existing notes is measured and stated, with a documented ignore convention for illustrative
(non-artefact) paths; the check is wired where it will actually run; gate green.

### T-264 · Write the check that an interim deviation marker has an open restore entry — `status: TODO` · `coder: opus` · `after: —`

Write the check that catches an UNTRACKED temporary deviation. Nothing automated fails today when a
self-labelled interim marker (`INTERIM DEVIATION`, `pre-public`, `revert before public`) sits in the
tree with no open entry in `TASKS.md` or `TODO.md` naming its restore — which is exactly how the
`5b430136` playtest-logging flip survived three days until F-185-4 found it by hand. Verified at
filing time: `scripts/` contains only `check-signoff.mjs`, `prose-scan.mjs`, `tag-rc.mjs` and
`verify-clean-clone.mjs`, and none of them greps for these markers. The surviving live markers are
`docs/PLAYTEST-TELEMETRY_SPEC.md:13,15` and `packages/ui/src/playtestLog.ts:17` — all part of
T-250's CLOSED record — so the check must treat a dated `..., CLOSED (T-###, date)` marker as
SATISFIED rather than flagging it. [harvested: T-250/interim-deviation-marker-check]

**Accept:** an automated check (a `scripts/` scanner wired into the gate, or a source-scanning test)
fails when a marker matching `INTERIM DEVIATION` / `pre-public` / `revert before public` exists with
neither a dated `CLOSED (T-###, date)` annotation nor an open `TASKS.md`/`TODO.md` entry naming the
restore; the three surviving CLOSED markers pass unflagged (proving the closed-form carve-out
works); a deliberately re-introduced untracked marker in a scratch arm provably fails the check,
demonstrated against the `5b430136` shape; gate green.

### T-265 · Write the source-scan guard that no e2e test title outside the tour-one specs contains an `@tag` — `status: TODO` · `coder: opus` · `after: —`

Write the source-scan guard that no Playwright test TITLE outside the tour-one specs contains an
`@word`. Playwright lifts `@tag` out of a title and treats it as a REAL tag, so a stray `@tour-one`
(or anything the grep expression matches) in an unrelated title would silently enrol that spec in
the denominator `packages/ui/e2e/flake-rate.spec.ts` gates on (`TOUR_ONE_TAG`, defined in
`packages/ui/e2e/support/flake.ts`) — moving the measured flake rate without anyone editing the
gate. Today this is only a header comment at `flake-rate.spec.ts:20-24` and a convention T-255
observed by hand; nothing fails when it is broken. `packages/ui/e2e/derule.spec.ts` is the in-suite
precedent for a page-less source-scan guard and should be the shape copied.
[harvested: T-255/e2e-tag-guard]

**Accept:** a page-less source-scan guard in `packages/ui/e2e/` (modelled on `derule.spec.ts`) reads
every `packages/ui/e2e/**/*.spec.ts` and fails when a `test(...)`/`test.describe(...)` title outside
the allowed tour-one specs contains an `@word`, with the allow-list stated in one place and named in
the failure message; an `@tour-one` added to an unrelated title in a scratch arm provably fails the
guard; the header comment at `flake-rate.spec.ts:20-24` is re-pointed at the guard rather than
restating the convention as prose; gate green.

### T-266 · Write the check that a testid rendering authored copy has at least one e2e assertion — `status: TODO` · `coder: opus` · `after: —`

Write the check that any testid in `packages/ui/src/App.tsx` which renders AUTHORED content copy has
at least one assertion somewhere in `packages/ui/e2e/`. T-207 shipped four such player-visible
surfaces — `dare-dealer-table-talk`, `combat-enemy-bark`, `combat-enemy-battle-bark`,
`combat-aftermath-bark` — with UNIT coverage only, and its own Delivered note asserted "No e2e change
was needed or made". The gap survived until T-255 grepped `packages/ui/e2e/` by hand. No gate catches
the CLASS, so the next player-visible copy surface can ship exactly the same way.
[harvested: T-255/player-visible-copy-dom-coverage-check]

**Accept:** an automated check enumerates the `data-testid` values in `packages/ui/src/App.tsx` that
render authored content copy and fails when one has no assertion in any `packages/ui/e2e/**` spec,
with a documented, justified opt-out list for testids that are deliberately unit-only; the four
T-207 testids are used as the regression fixture and the check provably fails on the pre-T-255 tree
(with their e2e assertions removed in a scratch arm) while passing on the current tree; the
selection rule for "renders authored content copy" is stated explicitly rather than left to
judgement; gate green.

---

## M9 — Harvested: Liar's Dice, roster and ladder

**Moved at the 2026-08-06 re-order:** T-224, T-225, T-226 and T-227 — the four findings filed
by T-222/T-223, each Accept requiring an owner ruling — now sit in the OWNER GATE section
below. Their delivered evidence (the T-222/T-223 blocks) stays here.

### T-222 · F-219-1: the house's raise evidence bar is set by the PLAYER's own stake — `status: DONE` · `coder: opus` · `after: T-219`

Compacted 2026-08-06 — kept only as a dependency anchor for open `after:` references; triaged first (no open work found, everything below already had a permanent home). Full record: `git show b7aa97e7` or `git log --grep="^T-222:" -p -- TASKS.md`. Rulings/findings duplicated in `docs/LIARS-DICE-DECISIONS.md` (LD-29), `docs/LIARS-DICE_REDESIGN.md` §21.

### T-223 · F-220-1: the ROSTER pool is a net credit SINK, and nothing names or bounds the price — `status: DONE` · `coder: opus` · `after: T-220`

Compacted 2026-08-06 — kept only as a dependency anchor for open `after:` references; triaged first (no open work found, everything below already had a permanent home). Full record: `git show 38ad6d3a` or `git log --grep="^T-223:" -p -- TASKS.md`. Rulings/findings duplicated in `docs/LIARS-DICE-DECISIONS.md` (LD-30), `docs/LIARS-DICE_REDESIGN.md` §22.

### T-243 · Write the check that keeps §4.6a's closed list closed — `status: TODO` · `coder: opus` · `after: —`

T-168's only enforcement of the §4.6a amendment was a MANUAL DONE-gate grep
(`grep -rn "liarsDiceTier(" packages/ --include="*.ts" | grep -v dist | grep -v __tests__`,
returning exactly `engine/actions/hangout.ts:416`, `engine/liarsDiceRules.ts:268`,
`engine/liarsDiceRules.ts:302`, `ui/src/format.ts:568`). Verified: no automated check exists for
EITHER half of the rule — nothing asserts the four-item licensed live-tier list in
`docs/LIARS-DICE-PROGRESSION_SPEC.md` §4.6a / LD-24, and nothing asserts the NEW bug §4.6a defines
(any caller outside `packages/engine/src` that sizes a Dare stake domain off raw `wagerBandFor(...)`
instead of `preHandWagerBand(state)`, or that re-derives `band.max × LIARS_DICE_RAISED_CEILING_MULT`
itself). `packages/engine/src/__tests__/liarsDiceLadder.test.ts`'s `T-168 · preHandWagerBand`
describe proves the accessor is correct, not that callers use it. The existing shape to copy is a
source-scanning test: `packages/content/src/__tests__/contentPackageBoundary.test.ts` or
`packages/ui/src/__tests__/npc-trace-absent.test.ts`. Until this exists, the T-168 defect class — a
spec rule stated as a COUNT of textual call sites rather than as the invariant, which simultaneously
forbade the only correct fix and permitted the bug (`planDare` and `packages/sim/src/protocol.ts`
never called `liarsDiceTier` at all) — has no enforcement and cannot be filed as a lesson.
[harvested: T-168/write-4-6a-closed-list-check]

**Accept:** a source-scanning check asserts BOTH halves of §4.6a — the licensed `liarsDiceTier`
call-site list matches the four sites §4.6a/LD-24 name (and fails on a fifth), AND no module outside
`packages/engine/src` sizes a Dare stake domain off raw `wagerBandFor(...)` or re-derives
`band.max × LIARS_DICE_RAISED_CEILING_MULT` instead of calling `preHandWagerBand(state)`; both halves
are proven non-vacuous by introducing each violation in a scratch arm and watching the check go red;
the pre-fix `packages/sim/src/protocol.ts` shape is used as the regression fixture for the second
half; §4.6a is reworded to state the INVARIANT rather than a call-site count, with LD-24 updated to
match; the manual grep is retired from the DONE gate and the lesson this unblocks is filed in
`docs/LESSONS.md` with this check as its "Enforced by:" line; gate green.

### T-244 · Re-home the concealment deferral — its named owner M4e has already shipped — `status: TODO` · `coder: opus` · `after: —`

T-177's ruling defers the concealment channel with "M4e still owns the memory that would make it
worth something" — also written into `docs/LIARS-DICE-DECISIONS.md` LD-26 and
`docs/LIARS-DICE_REDESIGN.md` §16.3 (line ~1913: "Concealment will become worth something when M4e
gives archetypes memory") — and rejected shape (B) on the grounds that "M4e already owns the memory;
the correct move is to wait for it". **That pointer is stale:** M4e is T-144–T-148, all shipped
2026-07-31 (the `TASKS.md` ledger rows), and `dealerMove`
(`packages/engine/src/liarsDiceRules.ts:785`) and `archetypeMove` (`:1082`) still take no history
parameter and hold no cross-hand memory as of 2026-08-06. The deferral must be re-homed onto a live
owner, or §6.1's concealment benefit retired outright — this is the same failure mode T-219's block
already names, a finding aimed at an owner that will not do it.
[harvested: T-177/concealment-memory-owner]

**Accept:** the concealment deferral is either given a live owner (a named task that will actually
add cross-hand memory to `dealerMove` / `archetypeMove`) or §6.1's concealment benefit is retired
with the reason recorded; `docs/LIARS-DICE-DECISIONS.md` LD-26 and `docs/LIARS-DICE_REDESIGN.md`
§16.3's "when M4e gives archetypes memory" sentence are both corrected so no reader is sent to a
milestone that shipped on 2026-07-31; the rejected shape (B) is re-read against the new owner (its
rejection rested on M4e being imminent, which is no longer true) and either re-rejected on fresh
grounds or adopted; if any rule moves, the task takes its own capstone with the moved rows predicted
first; fingerprint discipline stated; gate green.

---

## M10 — Harvested: Explore, deeds and the recovery ladder

**Moved at the 2026-08-06 re-order:** T-171 (an explicit owner ruling on the sealed-pod line)
now sits in the OWNER GATE section below.

### T-172 · Re-measure per-band recovery collection and forfeiture — prove band 4 is reachable after T-131 — `status: TODO` · `coder: opus` · `after: T-198`

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

### T-174 · F-151-9: the `fighter` sim policy is bit-for-bit flat under every stat change — fix or replace it — `status: TODO` · `coder: opus` · `after: T-198`

INSTRUMENT defect: the `fighter` sim policy's day-35 median is 2,825cr in ALL eight rig variants —
bit-for-bit flat under every stat change, including +2 GRIT. The rig therefore cannot separate
"GUNS is a dead option" from "the instrument cannot see GUNS", which is why
`docs/PLAYER-TRINKETS_SPEC.md` §5.3 argues the GUNS exclusion on two independent legs. Fixing or
replacing `fighter` is the stated prerequisite to any future GUNS ruling (§13, instrument row).
[harvested: T-151/F-151-9]

**Accept:** the `fighter` policy (or its replacement) demonstrably moves its day-35 median under a
GUNS/GRIT perturbation, shown as a control-vs-variant delta on a stated rig **and verified by
`assertVariantsPerturbEveryPolicy` (`packages/sim/src/balance/gate.ts`, shipped at T-167) returning
zero violations over that rig's arms** — a median that merely looks different in a memo is not the
bar; the two-leg workaround
in `docs/PLAYER-TRINKETS_SPEC.md` §5.3 and the instrument row in §13 are updated to point at the
fixed instrument; fingerprint discipline stated (instrument moves, rules does not) and the expected
pinned rows named; gate green.

### T-184 · Smuggler contract options are `chosen` more often than they were `offered` — the all-weights-zero corner — `status: TODO` · `coder: opus` · `after: T-198`

**RENUMBERED (2026-08-03):** this block was filed as `T-176`, colliding with the earlier `T-176`
(F-160-2, line 911) — same collision as the T-175→T-183 renumber above. No other file referenced
the old number (checked).

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

### T-245 · The rig sensitivity check has NO production caller — wire it into a multi-arm entry point — `status: TODO` · `coder: opus` · `after: —`

`assertVariantsPerturbEveryPolicy` (`packages/sim/src/balance/gate.ts:748`) has NO caller outside
tests — verified by grep over `packages/sim/src`, `scripts/`, `.github/` and `package.json`: the only
non-test hits are doc comments in `packages/sim/src/balance/sweep.ts:105,461` and `gate.ts:46`, plus
its own `ARM_LEVEL_ASSERTIONS` registration at `gate.ts:699`. It is deliberately absent from
`runGate` (a sweep has one arm), but nothing was wired in its place: neither
`packages/sim/src/balance/diff-cli.ts` (`balance:diff`) nor
`packages/sim/src/balance/report-cli.ts` (`balance:report`) — the only multi-arm entry points —
invokes it. A future rig can therefore still publish a bit-for-bit flat policy with no automated
reader firing, and T-174's Accept clause ("verified by `assertVariantsPerturbEveryPolicy` … returning
zero violations over that rig's arms") is a manual step with no command behind it.
[harvested: T-167/sensitivity-check-has-no-production-caller]

**Accept:** `assertVariantsPerturbEveryPolicy` is invoked by a real multi-arm entry point —
`balance:diff`, `balance:report`, or a new named script — so that running a control-vs-variant rig
checks the predicate automatically; the command that discharges T-174's Accept clause is named
explicitly and shown to run; the wiring is proven non-vacuous with a deliberately flat arm that makes
the new caller exit non-zero, and with a genuinely perturbed rig that passes; the doc comments at
`sweep.ts:105,461` and `gate.ts:46` are updated to name the caller rather than describe an unwired
predicate; `docs/TESTING-STRATEGY.md`'s rig sensitivity block and
`docs/BALANCE-RIG-DECISIONS.md` BR-57 record where it now runs; no rule source is touched, so no
capstone is owed — state that explicitly; gate green.

### T-246 · Write the check for filed numbers that predate an intervening shipped change — `status: TODO` · `coder: opus` · `after: —`

Write the check for the defect class T-176's framing correction (1) names: F-160-2's filed headline
numbers (dealer-as-challenger 40.73% n=92,909, player-as-challenger 82.43% n=6,072, 41.7 pp)
described a game that no longer existed once T-175 shipped `probClaimTrue` between the filing and the
run, and nothing in the repo flags that a block's cited measurements predate an intervening shipped
change. Candidate enforcement: a gate or review step that resolves the numbers a `TASKS.md` block
argues from against the current baseline of record (`BASELINE_OF_RECORD_PATH` in
`packages/sim/src/__tests__/balance-targets.test.ts`), or against the tasks shipped since the filing
date. T-166 (`packages/sim/src/__tests__/smoke-reextraction.test.ts`) is the precedent for the shape
of such a task. Until that check exists there is no lesson, only this gap.
[harvested: T-176/stale-filed-numbers-check]

**Accept:** an automated check flags a `TODO` block whose cited measurements were taken against a
baseline or fingerprint older than the current `BASELINE_OF_RECORD_PATH` (or older than a rule change
shipped since the block's filing date), so a coder is told to re-measure before arguing from the
numbers; the F-160-2 case (numbers filed pre-T-175, run post-T-175) is used as the regression fixture
and provably trips the check; the check's shape follows T-166's precedent
(`packages/sim/src/__tests__/smoke-reextraction.test.ts`) and is wired where it will actually run; the
convention for stamping a block's measurements with the baseline they came from is documented in
`docs/BALANCE-POLICY.md` or `docs/TASK-PROCESS-DECISIONS.md`; the resulting lesson is filed in
`docs/LESSONS.md` with this check as its "Enforced by:" line; gate green.

### T-247 · `combat-win-share` FAILs by construction on a gambler-only arm — report N/A instead — `status: TODO` · `coder: opus` · `after: —`

The `combat-win-share` gate FAILs by construction on any single-policy `--policies gambler` arm (that
policy plans almost no combat), and it has now been logged as a "known gambler-only-arm artefact" in
at least four places — T-219 §19.9, T-220 §20.0 correction 4, T-222/T-223, and
`docs/LIARS-DICE_REDESIGN.md` (`combat-win-share 0.0019`) — without ever being fixed or filed. The
gate is defined at `packages/sim/src/balance/gate.ts:1015`; it should report N/A (or be skipped) for
arms that plan no combat rather than emitting a FAIL every reader is now trained to ignore. A gate
result readers are trained to ignore is worse than no gate.
[harvested: T-220/combat-win-share-gambler-arm]

**Accept:** `combat-win-share` (`packages/sim/src/balance/gate.ts:1015`) reports N/A — or is
explicitly skipped with a stated reason on the report — for an arm whose policy set plans no combat,
instead of emitting a FAIL; the N/A condition is derived from the arm's own data (e.g. an engagement
count below a named floor), never from a hardcoded policy name list, or if a name list is chosen the
reason is recorded; a gambler-only arm is re-run and shown to produce N/A while a full-fleet arm
still FAILs when the win share genuinely drops; the four places that log this as a known artefact
(T-219 §19.9, T-220 §20.0 correction 4, T-222/T-223, `docs/LIARS-DICE_REDESIGN.md`'s
`combat-win-share 0.0019`) are corrected to point at the fix; the gate change is instrument-only so
no rule fingerprint moves — state that explicitly; gate green.

### T-248 · `checkpoints.ts` does not cross-check an aggregate's stamp against the tree at extract time — `status: TODO` · `coder: opus` · `after: —`

**FINDING, new at T-183 and not folded in:** `packages/sim/src/balance/checkpoints.ts` does not
cross-check an aggregate's stamp against the tree at extract time, so extracting a fixture from a
capstone taken under a DIFFERENT ruleset is still silent. The check only became POSSIBLE at T-183 —
before it, a merged aggregate carried no `rulesFingerprint`/`instrumentFingerprint`/`gitCommit` to
check against — and was explicitly left as a separate task. Verified not logged in `TODO.md` and not
covered by any other `TASKS.md` block. [harvested: T-183/checkpoints-stamp-crosscheck]

**Accept:** `packages/sim/src/balance/checkpoints.ts` compares the aggregate's stamped
`rulesFingerprint` / `instrumentFingerprint` / `gitCommit` against the tree it is extracting into and
fails loudly (or requires an explicit, recorded override) when they disagree; pre-T-183 aggregates
that carry no stamp are handled by a named, documented policy rather than silently passing; the
failure path is proven with a fixture aggregate stamped from a different ruleset, and the success
path with a matching one; `docs/BALANCE-RIG-DECISIONS.md` records the rule and the override
convention; the override, if any, is auditable in the extracted fixture itself; gate green.

### T-249 · F-202-1: the sim instrument cannot exhibit `LIARS_DICE_ROUNDS_PER_DAY` above 2 — `status: TODO` · `coder: opus` · `after: —`

**F-202-1 (OPEN, carried forward from T-202 — keep this finding id, it is cited from elsewhere.)**
The committed sim instrument cannot exhibit `LIARS_DICE_ROUNDS_PER_DAY` above 2, so T-202's capstone
is an instrument-gap NULL RESULT and not a verdict on R3's ceiling. The gambler is the only policy
that plans `venue: 'dare'` (`packages/sim/src/index.ts:4225`) and its day loop is bounded by
`Math.min(GAMBLER_MAX_DARES_PER_DAY, liarsDiceRoundsRemaining(state))` (`:4584`) with
`GAMBLER_MAX_DARES_PER_DAY = 2` (`:4058`), a deliberate dice-budget guard — so it plays `1,2,2,2,2,2`
hands by tier under BOTH `[1, 2, 2, 3, 3, 4]` and `[1, 2, 3, 4, 5, 6]`, and tiers 2-5 of the ruled
table are never exercised. Measuring the ruled ceiling needs a gambler-policy arm whose dare bound is
the engine's own `liarsDiceRoundsRemaining`; that is a new instrument BEHAVIOUR, it moves
`instrumentFingerprint`, and it owes its own capstone. Deliberately deferred at T-202 with a written
risk analysis (out of scope: mixing an instrument-constant raise into a content capstone conflates two
arms in one diff, the failure T-196a/T-196b were split to avoid; no debt rolls up: the sim's dare
bound is read at one site and is not a rule, and the ENGINE cap players meet is fully exercised by
`packages/engine/src/__tests__/hangout.test.ts` and `packages/ui/src/__tests__/hangout-pane.test.ts`).
`docs/LIARS-DICE-DECISIONS.md` LD-23 and `docs/BALANCE-RIG-DECISIONS.md` (BR-14 baseline-of-record
narrative, ~line 210) both cite it as "F-202-1, `TASKS.md` T-202" — those pointers must be re-aimed
here. [harvested: T-202/F-202-1]

**Accept:** a gambler-policy arm exists whose dare bound is the engine's own
`liarsDiceRoundsRemaining` rather than `GAMBLER_MAX_DARES_PER_DAY = 2`, and tiers 2-5 of the ruled
`[1, 2, 3, 4, 5, 6]` table are shown to be exercised (hands/day by tier stated against the
`1,2,2,2,2,2` null-result baseline); the instrument change is taken as its own arm, never mixed with a
content change in the same diff, and `instrumentFingerprint`'s move is predicted up front and paid
with its own capstone; R3's ceiling is finally graded on that arm and the verdict recorded in
`docs/LIARS-DICE-DECISIONS.md` LD-23; the `docs/BALANCE-RIG-DECISIONS.md` BR-14 narrative and LD-23's
"F-202-1, `TASKS.md` T-202" citations are re-aimed at this task; the F-202-1 id is preserved
verbatim; gate green.

---

## M12 — Harvested: sim policies under duress

### T-178 · F-159-2: the fuel-starvation strand no policy branch can escape — the fighter's spend ordering under duress — `status: TODO` · `coder: opus` · `after: T-198`

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

### T-231 · F-161-1: `veteranPolicy` takes EVERY offered storylet as a standalone day — `status: TODO` · `coder: opus` · `after: —`

F-161-1 was OPENED by T-161 and deliberately NOT fixed. `veteranPolicy`
(`packages/sim/src/index.ts:4936`) takes every offered storylet as a STANDALONE DAY, where
`smugglerPolicy` (`index.ts:3026`), `gamblerPolicy` (`index.ts:3795`) and `explorerPolicy`
(`index.ts:4455`) each resolve a die-free choice INLINE and let the trade day continue. On a port
with a live storylet queue the veteran never reaches its contract block at all — which is why
**197 of 200 seeds still stall at ≥ 5** even after F-159-1's fix. A trial fix — porting the
gambler's three-line die-free-inline split verbatim — was MEASURED and deliberately NOT LANDED: it
moves seeds ≥ 5 over 1..200 × 35 days from **197 → 18**, but costs the deed slate —
`deed-coverage.test.ts`'s "the slate is earnable by a single career" goes **2 → 0** full slates over
seeds 1..76 × 300 days (`liars_dice_grand_slam` missed 19 → 63, `ray_s_ledger` 27 → 54) because the
Liar's Dice ROSTER TOUR errand in `packages/sim/src/__tests__/support/deed-hunter.ts` needs idle
days. Closing it therefore belongs to a task that OWNS the deed-hunter instrument and may re-pin
`deed-coverage.test.ts`. Full record, including the 16-of-18 credit-starvation residual behind it,
at `docs/BALANCE-POLICY.md` D.2a; also filed in `TODO.md`. [harvested: T-161/F-161-1]

**Accept:** the veteran's storylet handling is brought into line with the other three policies (or
the asymmetry is ruled deliberate with a recorded reason), with seeds 1..200 × 35 days re-measured
and the ≥ 5-stall count stated against the 197 baseline and the 18 trial figure; the deed-slate
consequence is OWNED, not absorbed — `deed-coverage.test.ts`'s single-career slate count is
re-measured over seeds 1..76 × 300 days and either held at ≥ 2 or re-pinned with the deed-hunter
errand's idle-day requirement adjusted and the change justified (`liars_dice_grand_slam` and
`ray_s_ledger` named explicitly); the 16-of-18 credit-starvation residual is re-read and filed as
its own finding if it survives; `docs/BALANCE-POLICY.md` D.2a updated; fingerprint discipline
stated; gate green.

### T-235 · F-199-1: `veteranPolicy`'s rim-strand hole is deliberately not wired to the shared anti-idle rungs — `status: TODO` · `coder: opus` · `after: —`

**F-199-1 (OPEN, carried forward from T-199).** `veteranPolicy` in `packages/sim/src/index.ts` has
the rim-strand hole and is deliberately NOT wired to the shared anti-idle rungs. VERIFIED STILL OPEN
ON HEAD: `veteranPolicy` calls `planCrippledRepair` (`packages/sim/src/index.ts:6253`) but calls
NEITHER `planHomewardBurn` NOR `planStrandedExplore`, unlike `traderPolicy`, `smugglerPolicy`,
`fighterPolicy` and `gamblerPolicy`. It is exempt from `assertNoIncomeStall` via
`GATE_COMPETENT_POLICIES` in `packages/sim/src/balance/gate.ts` ("an endgame grinder, not a lean
balance instrument") and strands badly in its own right — 198 of 200 seeds at or over a streak of 5
on a 200 × 35 scan, both before and after T-199, unmoved. Wiring it is a THREE-LINE change and it
WORKS, but it moved `balance-combat-survival.test.ts`'s preparation band **0.5333 → 0.4801** against
a bar of 0.50, so whoever closes it OWNS re-grading that band on a widened sample. **Note the id
collision recorded in `TODO.md`:** in T-199's planner table F-199-1 meant the trader rim strand
(CLOSED), and `packages/sim/src/index.ts:6434` uses the label for the netting hole — this task is
the veteran anti-idle reading. [harvested: T-199/F-199-1]

**Accept:** `veteranPolicy` either gains the `planHomewardBurn` / `planStrandedExplore` rungs the
other four policies carry, or the asymmetry is ruled deliberate with a recorded reason; the 200 × 35
scan is re-run and the ≥ 5-streak seed count stated against the 198/200 baseline;
`balance-combat-survival.test.ts`'s preparation band is RE-GRADED on a widened sample rather than
absorbed — the 0.5333 → 0.4801 move against the 0.50 bar is explained and the band either held or
re-pinned with justification; `GATE_COMPETENT_POLICIES`' exemption note in
`packages/sim/src/balance/gate.ts` is re-justified against the new measurement; fingerprint
discipline stated; gate green.

### T-236 · F-199-2: the fighter's Guild-marker payment is not netted against the yard spend queued moments earlier — `status: TODO` · `coder: opus` · `after: —`

**F-199-2 (OPEN, carried forward from T-199).** `fighterPolicy`'s Guild-marker payment is not netted
against the yard spend queued moments earlier. `planDebtPayment`'s third argument is documented as
"everything already committed this day" (T-1601a), but the fighter's call
(`packages/sim/src/index.ts` ~5626) passes only `(refuel?.cost ?? 0) + overhead.cost`, omitting the
component tier / special equipment queued twenty lines above — so both spenders respect
`FIGHTER_RESERVE` individually and clear it together (seed 74, day 15: a 2,600cr tier AND a 3,412cr
marker payment out of a 6,652cr purse). The same unnetted hole exists in `veteranPolicy`
(`packages/sim/src/index.ts:6434`). The correct fix is NOT "add the `yardCost` term" — that was
MEASURED and REJECTED, see the recorded decision on that backout — but "pay the compounding marker
BEFORE discretionary kit", which is a policy-shape question T-199 had no mandate to settle. **Note
the id collision recorded in `TODO.md`:** the code comments at `packages/sim/src/index.ts:6434` and
`:5623` label this hole "F-199-1"; this task is the netting reading.
[harvested: T-199/F-199-2]

**Accept:** the policy-shape question is settled explicitly — either the marker is paid before
discretionary kit in `fighterPolicy` (and the same ordering applied or explicitly declined in
`veteranPolicy`), or the current shape is ruled deliberate with the reason recorded; the rejected
`yardCost`-term fix is named as rejected so it is not re-attempted; seed 74 day 15 is re-run as the
regression fixture and the combined spend is shown to respect `FIGHTER_RESERVE`; the swapped
F-199-1/F-199-2 labels at `packages/sim/src/index.ts:5623` and `:6434` are corrected or explicitly
pinned to a single definition; fingerprint discipline stated; gate green.

---

## M13 — Harvested: owner rulings and unscheduled builds

**Moved at the 2026-08-06 re-order:** T-181 (needs the owner's playtest read first), T-232 and
T-234 (both explicitly human-gated, halt `BLOCKED`) now sit in the OWNER GATE section below.
T-233 stays here: commit `b0112472` already did most of its doc reconciliation, and T-234's
`after: T-233` needs it above the gate.

### T-180 · N8 — the actor-parameterised `resolveVisitHangout`, un-gated but unscheduled — `status: TODO` · `coder: opus` · `after: T-198`

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

### T-228 · N5 — NPC proficiency spread, un-gated at N13 but unscheduled — `status: TODO` · `coder: opus` · `after: —`

N5 — NPC proficiency spread — was UN-GATED by N13/T-156 (2026-08-02) and its lever list rewritten
at N13's close, but unlike N8 (which has T-180) it has NO task in `TASKS.md`. The seam is already
wired and INERT: `npcVirtualHand(rng, dullDieChance?)` in `packages/engine/src/npcHand.ts` takes
R1's `PilotDegradationProfile.dullDieChance` directly, so the build is a parameterisation rather
than a new mechanism. Per the STATUS BOARD row and `docs/NPC_REDESIGN.md` §"N5 — NPC proficiency
spread", it must be graded **WITHIN archetype** and must reuse **N13's control arm**.
[harvested: T-156/n5-proficiency-unscheduled]

**Accept:** the proficiency spread is driven through the existing
`npcVirtualHand(rng, dullDieChance?)` seam (no second mechanism), with `dullDieChance` sourced from
R1's `PilotDegradationProfile`; the result is graded WITHIN archetype against N13's control arm,
not across archetypes; the measurement states what the spread moved and what it did not (the
`npcCredits.p10` floor named explicitly, since it has been flat for four steps);
`docs/NPC_REDESIGN.md`'s STATUS BOARD N5 row and its §"N5 — NPC proficiency spread" lever list are
updated with the outcome; fingerprint discipline stated and any baseline re-pin paid; gate green.

### T-233 · The pre-alpha stage record was never reconciled after T-158's UAT closed — `status: TODO` · `coder: opus` · `after: —`

The pre-alpha stage record was never reconciled after T-158's UAT closed (the owner played two live
sessions on 2026-08-03). `docs/RELEASE-CHECKLIST.md:8` still reads "nobody has played this build end
to end yet", and its lines 11-13 still say "`TASKS.md` T-158 can close"; `docs/VERSIONING.md:136`'s
stage table still marks **pre-alpha** as "we are here"; and `TASKS.md`'s "Deliberately deferred"
manifest-version bullet still says the first (`alpha`) tag "waits on T-158's own UAT pass per
`docs/VERSIONING.md`'s stage table" — a pointer that DANGLES the moment the T-158 block is deleted.
Either advance the stage and cut the tag, or record why pre-alpha still stands.
[harvested: T-158/post-uat-stage-docs-stale]

**Largely discharged in advance (2026-08-06, commit `b0112472` — verified, not assumed):**
the reconciliation commit corrected all three named sites. `docs/RELEASE-CHECKLIST.md`'s header
now carries a dated correction block, `docs/VERSIONING.md:136`'s stage row reads "we are here
(see note below)", and the `TASKS.md` manifest bullet was re-aimed at the start-to-finish pass.
The stage itself was deliberately NOT advanced. What remains here is the verification pass and
the explicit either/or closure; the advance-or-not ruling stays T-234's, which depends on this
task.

**Accept:** `docs/RELEASE-CHECKLIST.md:8` and its lines 11-13, `docs/VERSIONING.md:136`'s stage
table, and `TASKS.md`'s "Deliberately deferred" manifest-version bullet all agree with reality — no
site still claims the build is unplayed or that T-158 is pending, and no site points at a deleted
block; EITHER the stage advances and the `alpha` tag is cut per `docs/VERSIONING.md`'s own criteria,
OR a dated statement records why pre-alpha still stands (and what would end it); gate green.

### T-268 · A jump to a port is imperceptible — nothing marks that a game action happened — `status: TODO` · `coder: opus` · `after: —`

The second half of T-188's title, and of the owner's original quote — "we just have instant jump to
port, and it is barely noticeable that any game action has happened" — was never addressed by
anything. The owner's superseding spec (2026-08-04) and the 4B ruling (2026-08-05) both scoped
themselves to the MAP's geometry and visual question only (that scoping is already recorded at
`docs/TASK-PROCESS-DECISIONS.md` TP-43), and T-215 shipped the globe with no jump-transition
feedback of any kind. No task block and no `TODO.md` line currently carries it — grepping for
"imperceptible" hits only the T-188 header and two unrelated docs — so deleting the T-188 block
would erase the request entirely. [harvested: T-188/imperceptible-jump]

**Accept:** a jump between systems is PERCEPTIBLE as an event in the cockpit — the transition reads
as something that happened rather than an instant state swap — with the treatment chosen against
the existing motion tiers (`docs/` motion rules; Cinematic / Snappy / the third tier T-252 shipped)
and honouring reduced-motion; an e2e assertion in `packages/ui/e2e/` proves the transition surface
appears on a real jump and is skipped/collapsed at the reduced-motion tier; UI-only unless the owner
rules otherwise, so `rulesFingerprint` stays unmoved and no capstone sweep is owed (if any
engine/content change becomes necessary, it is filed rather than folded in); gate green.

---

## OWNER GATE — open tasks that need a human ruling or session

Every task below requires owner input to close: a design ruling, a treatment pick, a playtest
read, or a live session. They sit BELOW all autonomous work so a run never queues runnable
tasks behind a human halt. Several carry real preparation work (re-measurements, write-ups) a
runner can complete before halting `BLOCKED` for the ruling; none may be self-approved. The
first four are one owner sitting: they are the Liar's Dice findings T-222/T-223 filed, and
share one evidence base (`docs/LIARS-DICE_REDESIGN.md` §21/§22).

Provenance (harvest grouping, for the record): T-224–T-227 from M9; T-171 from M10; T-237 from
M17; T-254 from M18; T-256/T-257 from M19; T-251 from M18; T-181, T-232, T-234 from M13;
T-267 from T-188 (the 4B map ruling).

### T-224 · F-222-1: the top 3% of every wager band is a DEAD ZONE, and sitting in it is the best play in the game — `status: TODO` · `coder: opus` · `after: T-222`

**Filed at T-222 (2026-08-06), `docs/LIARS-DICE_REDESIGN.md` §21.4b / §21.7,
`docs/LIARS-DICE-DECISIONS.md` LD-29, `docs/LIARS-DICE-PROGRESSION_SPEC.md` §3.3d.** `headroomFor`
is `max(0, bandMax − pot)` and **the seed counts against it** (§4.3: `band.max` is a whole-hand
exposure ceiling, not a seed ceiling). So a seed within **one ante** of the ceiling leaves **both**
sides unable to cover a raise: `legalMovesFrom` offers only `challenge` and `fold`, and the hand is
**one claim long by construction**. The zone is exactly one ante wide — i.e. exactly
`DARE_ANTE_BAND_FRACTION` (3%) of the ceiling, because that is what the ante *is*.

**The consequence is a dominant player strategy that skips the mechanic.** The hand resolves at
`probAtLeast(1, u)`, which is **in the player's favour at every width**, at **the largest stake the
port allows**. Measured on identical seeds, n = 40,000 per cell:

| dice | stake | house net / seed | player win | `probAtLeast(1, u)` |
| --- | --- | --- | --- | --- |
| 4 | 75% of band | **+0.445** | 28.02% | — |
| 4 | **the exact ceiling** | **−0.045** | **52.27%** | 51.77% |
| 6 | 75% of band | **+0.373** | 31.35% | — |
| 6 | **the exact ceiling** | **−0.321** | **66.04%** | 66.51% |

At the default band at tier 4 that is **+962 cr/hand to the player against −842** one quarter-band
lower — a **1,804 cr/hand swing, and a sign flip, from a 25%-of-band change in stake**. This is
F-134-1's band clamp **priced for the first time**: §16.5 measured it firing on the house at 53.12%
with the gambler's median stake-to-band ratio at **100.00%**, and §17.7 re-measured the rate but
never the price. It also mechanically corroborates LD-28's ply-1 derivation from an angle §20 could
not see. **T-222 could not fix it**: the lever is §4.3's whole-hand exposure ruling, not the ante —
§21.4a proves the one ante-side alternative leaves the zone byte-identical — and re-opening §4.3
inside a measurement task is §16.2's banned third shape. [filed: T-222/F-222-1]

**Accept:** the share of shipped hands actually seated **inside** the dead zone is measured rather
than bounded — §21.4c bounds it at ≤ 49.6% from `bids/hand = 1.504` and says the exact figure needs
a `dareCells` stake/headroom cut, so **this task owns that instrument change** and takes its
`instrumentFingerprint` move deliberately, with the moved rows predicted first; the player's gain
from seating there is re-priced on HEAD with `n` on every cell; the owner then either **rules the
zone intended** — in which case §4.3's "whole-hand exposure ceiling" ruling is restated in
`docs/LIARS-DICE-DECISIONS.md` with the derivation of why a one-claim maximum-stake hand is a
feature, and a standing invariant bounds the player's edge there — or **rules it a defect**, in
which case the fix is **bakeoff'd against at least one named alternative on identical seeds** (e.g.
a seed ceiling separate from the exposure ceiling, or an exposure ceiling that reserves at least one
ante), LD-27's `k`-gate derivation is re-run against the new numbers, the archetype ordering
(`bad − optimal` = +15.79 pp, z = 35.93) is re-scored and must not re-invert, and **LD-28's two
standing invariants are re-scored alongside** because the fix moves the player's EV directly; §21.4b
and §21.7 gain the outcome; if any rule moves the task takes its own capstone with the moved rows
predicted first; gate green.

### T-225 · F-222-2: at tier 5 nothing caps the pot/ante ratio, and past `k ≤ 3` the house's own gate misprices — `status: TODO` · `coder: opus` · `after: T-222`

**Filed at T-222 (2026-08-06), `docs/LIARS-DICE_REDESIGN.md` §21.4 / §21.7,
`docs/LIARS-DICE-DECISIONS.md` LD-29, `docs/LIARS-DICE-PROGRESSION_SPEC.md` §3.3d.** Every **bounded**
tier stops at `k ≤ 3` for a structural reason: `anteFor` makes the ante a fixed fraction `f` of the
same ceiling the stake is capped at, so the ceiling ratio is `f / (2 + f)` and the band cancels out.
**Tier 5 removes the ceiling** (`effectiveWagerBand → {min: 0, max: null}`, §4.8 / T-146) while the
ante stays **frozen at the tier-4 reference**, so the ratio → 0 as the stake grows and the gate keeps
opening.

**Past `k ≤ 3` the direction reverses**, measured on identical seeds at n = 40,000 per cell:

| stake (multiples of the ante) | gate | house net / seed | player win | `bad − optimal` |
| --- | --- | --- | --- | --- |
| 57× — 1,026 cr at the 5–200 port, 5,127 at the default band | `k ≤ 4` | **+0.220** | 38.67% | +13.29 pp |
| 752× | `k ≤ 4` opening, `k = 5` reached mid-hand | **−0.139** | 56.91% | **−4.95 pp** |
| 2,000× | `k ≤ 5` | **−0.119** | 55.95% | **−3.98 pp** |
| 23,328× | `k = u`, fully dissolved | **−0.244** | 62.21% | **−10.25 pp** |

against **+0.373 / 31.35% / +20.61 pp** at `k ≤ 3`. Both `k = 4` boundaries sit **inside** the
**32,510** largest stake measured over 1,600 careers, so this is reachable rather than theoretical;
full dissolution needs ≥ 419,896 and is **not** reached. The mechanism is LD-27's own — the
immediate-challenge premise is a *conservative* error at tight gates and an *expensive* one once the
pot/ante ratio admits raises whose truth probability is under 1%. **T-222 predicted this would not
happen and was wrong** (§21.6, prediction 3), which is why LD-29 is scoped to bounded tiers.
**T-222 could not fix it**: the lever is §4.8's removed ceiling, not the ante, and §21.4a shows the
ante's reference cannot be moved to reach it without changing every other tier as well.
[filed: T-222/F-222-2]

**Accept:** the tier-5 stake distribution is measured on the shipped instrument with `n` on every
cell (how many hands actually sit past the `k ≤ 4` boundary, and at which ports); the owner either
**rules the uncapped ratio intended** — in which case §4.8's "unlimited betting" ruling is restated
in `docs/LIARS-DICE-DECISIONS.md` with the derivation of why a veteran table should price raises
this way, and a standing invariant bounds the house's loss there — or **rules it a defect**, in
which case the fix is **bakeoff'd against at least one named alternative on identical seeds** (§21.4a
records the strongest candidate: reference the ante to `seedWager`, which caps the ratio at
`f / (2 + f)` without capping the stake — and **its LD-28 exposure must be scored on a full capstone
rather than argued**, since it moves the table against the player at every measured cell), LD-27's
`k`-gate derivation is re-run against the new numbers rather than re-sampled, the archetype ordering
(+15.79 pp, z = 35.93) is re-scored and must not re-invert, and LD-28's two standing invariants are
re-scored alongside; §21.4 and §21.7 gain the outcome; if any rule moves the task takes its own
capstone with the moved rows predicted first; gate green.

### T-226 · F-222-3: the archetype ordering is STAKE-CONDITIONAL, and no test covers it off the stakes the sweep happens to play — `status: TODO` · `coder: opus` · `after: T-222`

**Filed at T-222 (2026-08-06), `docs/LIARS-DICE_REDESIGN.md` §21.4 / §21.7,
`docs/LIARS-DICE-DECISIONS.md` LD-29.** LD-25 publishes `bad − optimal > 0` as a property of the
**archetypes**, and every task since (T-148 F-148-1, T-160 F-160-1, T-175, T-176, T-219 K2, T-220 C6)
has scored it on one arm at one stake distribution. Measured across the stake axis it is a property
of the archetypes **at a stake**:

| regime | `bad − optimal` |
| --- | --- |
| band floor, 4 dice (`k ≤ 0` / `k ≤ 1`) | **−21.15 / −15.69 pp** |
| band floor, 6 dice | **−13.32 / −9.47 pp** |
| mid-band (`k ≤ 2` / `k ≤ 3`) | +2.61 … **+20.61 pp** |
| the ceiling dead zone | **0.00 pp** — both arms can only challenge |
| deep tier 5 (`k ≥ 5`) | **−4.95 / −3.98 / −10.25 pp** |

`bad` reads **no pot at all** (`BAD_CREDULITY` is a count rule), so the entire stake-dependence is
`optimal`'s. The shipped arm sits at +15.79 pp (z = 35.93) because the gambler's stakes sit
mid-band-and-above — per-career mean seated stake p10/p50/p90 = **1,537 / 2,477 / 3,876** — and
**"unexercised by today's gambler policy" is not "unreachable by a player"**: a human may stake the
band floor at any time. The bar has never been stated with the stake range it holds over, and no
test would notice if a retune moved that range. [filed: T-222/F-222-3]

**Accept:** the ordering is re-measured across the stake axis with `n` on every cell and the range
over which `bad − optimal > 0` holds is stated explicitly per dice width; the owner either **rules
the ordering a mid-band property** — in which case LD-25 is amended in place (kept verbatim,
superseded) to name the stake range, and the enforcing test asserts the bar **over that range**
rather than at one point, computed from `probAtLeast` and the accessors with no literal stake — or
**rules the inversion a defect**, in which case the fix is bakeoff'd rather than tuned against at
least one named alternative on identical seeds and LD-28's invariants are re-scored alongside;
either way `packages/engine/src/__tests__/liarsDiceArchetypes.test.ts` gains an assertion that goes
RED if the range moves; §21.7 gains the outcome; if any rule moves the task takes its own capstone
with the moved rows predicted first; gate green.

### T-227 · F-223-1: the player is never told which of the house's three seats is the hard one — `status: TODO` · `coder: opus` · `after: T-223`

**Filed at T-223 (2026-08-06), `docs/HANGOUT_REDESIGN.md` §7 Finding F-223-1 /
`docs/LIARS-DICE_REDESIGN.md` §22.6 / `docs/LIARS-DICE-DECISIONS.md` LD-30.** Content authors a
**strict difficulty ladder** at every one of the fourteen Liar's Dice ports — seat 1 the journeyman
(`bad`/`random`, `3 × wager.max`), seat 2 the regular (`mixed`, `5 ×`), seat 3 the house
(`optimal`, `8 ×`), with the table's own header saying *"difficulty rises monotonically with the
purse"* — and T-223 **pinned that ladder with a test**, so it is now a guaranteed property rather
than an authoring convention. **The UI surfaces none of it.** `hangoutRosterOpponents`
(`packages/ui/src/format.ts:571`) projects name / beaten / **purse** / broke plus a tier-≥-3 `read`,
and the pane (`packages/ui/src/App.tsx:2470-2510`) renders **four of those five — not the purse**
(`grep -n purse packages/ui/src/App.tsx` returns one comment). The row's own `seat`, and content's
`journeyman / regular / house` role table, are **not in `HangoutRosterOpponent` at all**.
`liarsDiceDealerReadout` hard-nulls on any `ld-` id (correctly — §7.6). So **before tier 3 the three
seats are distinguished by their authored NAMES alone**, and **after tier 3 the one cue that arrives
describes STYLE, not difficulty**, with its connotation running the wrong way: `optimal` — the
hardest and richest seat — reads **"This one plays it safe."**
(`packages/engine/src/liarsDiceRules.ts:335`).

**This is a disclosure finding, not a pricing one, and that is deliberate.** LD-30 measures the
roster at **+21.5 cr/hand (n = 11,021)** for the set-seeking instrument that buys what it sells, so
the seat is **not** a trap in credits — which is exactly why the obvious "this seat is expensive" cue
must not be shipped: it would print a claim the measurement contradicts. T-223 pre-committed
(§22.2, criterion A4) to answering the disclosure question **independently of the sign**, on LD-26 /
T-221's standing rule that *"a purchase whose price the buyer cannot see is not a design, it is a
trap"*. A ladder the game guarantees and never mentions fails that test whether the rungs are cheap
or dear. [filed: T-223/F-223-1]

**Accept:** the owner rules what the player should be told about the seat ladder and when, and the
ruling is written into `docs/HANGOUT_REDESIGN.md` §7 beside F-223-1 (accept-as-is counts as a
ruling, in writing, with its reason); if a disclosure ships it is **UI-only** so `rulesFingerprint`
stays unmoved, it reads the engine's or content's own value rather than a copied string (T-221's
precedent), it is pinned in `packages/ui/src/__tests__/hangout-pane.test.ts` or
`liars-dice-pane.test.ts` against that value, and it does **not** surface a `'mixed'` seat's resolved
arm before the hand exists (§4.5 ruling 1), does **not** move `readTheTableLine`'s tier-3 unlock or
its three authored strings (T-146's), and does **not** import a content constant into the pane;
§22.6 and the F-223-1 finding gain the outcome; if any rule moves the task takes its own capstone
with the moved rows predicted first; gate green.

### T-171 · Deed supply after Explore's 10× event-rate drop — an owner ruling on the sealed-pod line — `status: TODO` · `coder: opus` · `after: T-198`

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

### T-237 · F-162-4: the route preview shows a fuel bill the resolver will not charge — `status: TODO` · `coder: opus` · `after: —`

**The route preview shows a fuel bill the resolver will not charge.** `travelPreview(state,
destination, die?)` documents its no-die default as the UNDISCOUNTED ceiling ("never an
understatement"), but `App.tsx` calls `routePreview(game, target)` with **no die**, while
`resolveTravel` applies `navDieFuelDiscount` for the armed die — so the cockpit previews 60 fuel and
charges 59, making **T-195's headline feature invisible**. Still live as of this harvest:
`packages/ui/src/App.tsx:3731` (the T-162 block cites 3500; the call has moved), plus
`App.tsx:3799`, `:4774`, `:5089` and `:5116`. The UI DOES know the armed die — `dieArmed` /
`state.selectedDie` is in the same component. **Owner action:** decide whether the starmap preview
should pass the armed die (making the discount visible) or stay a ceiling, and say which in
`docs/DAWN-HAND-REDESIGN.md`. Deferred by T-162 with the Bug Discovery Policy risk analysis: out of
scope (a T-195/M17 feature-visibility question, not a Tier-3 testing one) and does-not-compound
(nothing builds on the previewed figure; the specs that pinned it no longer do per F-162-3, the
long-haul sweep reads the depot readout, and `travelPreview`'s contract guarantees the preview is
never an *under*statement). [harvested: T-162/F-162-4]

**Accept:** the owner's call — preview the armed die's discounted figure, or keep the preview as an
undiscounted ceiling — is recorded dated in `docs/DAWN-HAND-REDESIGN.md`; the code matches the
ruling at every call site (`packages/ui/src/App.tsx:3731`, `:3799`, `:4774`, `:5089`, `:5116`, at
their then-current lines), with no site left silently disagreeing with another; a test pins
preview-vs-charge agreement (or, if the ceiling is ruled, pins that the preview is never an
understatement) so the divergence cannot re-open unnoticed; if the discount is shown, T-195's
feature is verified visible in the cockpit rather than only asserted; **and, if and only if the
ruling is "pass the armed die", T-258 is fixed FIRST or in the same pass** — `travelPreview` applies
the die discount to the Nemesis crossing while `resolveTravel` does not, so passing a die would make
the crossing quote an understated bill the moment this ruling lands (T-258 carries the full
analysis); gate green.

### T-254 · F-204-2: the internal vocabulary is split — Hangout in code, Cantina on screen — `status: TODO` · `coder: opus` · `after: —`

**F-204-2 (OPEN, carried forward from T-204).** The rename stops at the player's eye, so the internal
vocabulary is now split: `hangout.ts`/`hangoutRules.ts`, `resolveVisitHangout`, `HangoutEvent`,
`HangoutTone`/`HangoutProse`, `hasHangout`/`PORT_HANGOUTS` and the `'VisitHangout'` save literal all
still say "Hangout" while every rendered string says "Cantina". This is exactly what the owner scoped,
and the save literal genuinely cannot move without a migration — but a future reader will hit the
mismatch. Closing it is its own task with its own save-shape decision, and it must be taken
deliberately, never drifted into as a "while I'm here" rename.
[harvested: T-204/F-204-2]

**Accept:** the owner rules whether the internal vocabulary follows the player-facing rename; if it
does, the rename is taken as a single deliberate pass covering `hangout.ts`/`hangoutRules.ts`,
`resolveVisitHangout`, `HangoutEvent`, `HangoutTone`/`HangoutProse`, `hasHangout`/`PORT_HANGOUTS`, and
the `'VisitHangout'` save literal is moved ONLY behind a `CURRENT_SAVE_VERSION` bump with a migration
that is tested against a pre-bump save fixture; if it does not, the split is ruled permanent and a note
is left where a future reader meets it first (the module docblocks and
`docs/HANGOUT_REDESIGN.md`); either way no partial rename ships; `rulesFingerprint` movement is
predicted up front and any moved pins are named before the run; gate green.

### T-256 · Should a quest captain be a regular anywhere? — the content-design question T-208 raised — `status: TODO` · `coder: opus` · `after: —`

**LIVE CONTENT-DESIGN QUESTION RAISED BUT NOT ANSWERED BY T-208.** Now that each of the 11
`QUEST_PROFILES` sits at exactly one Cantina forever, a `clientele.regulars` entry naming one would rank
at that port every day instead of being permanently dead content (the original F-124-1 trap). T-208 held
scope: `clientele.regulars` is untouched and `hangoutContent.test.ts`'s `isSimulatedCaptain(profileId)`
assertion still forbids it. It is recorded only as a dated RECORD CORRECTION under F-124-1 in
`docs/HANGOUT_REDESIGN.md`, which explicitly says the question "has its own capstone" and is not the
question T-208 was asked. [harvested: T-208/quest-captain-regulars]

**Accept:** the question is answered explicitly — either `clientele.regulars` is opened to quest captains
at their pinned home port (with `hangoutContent.test.ts`'s `isSimulatedCaptain(profileId)` assertion
relaxed deliberately and re-shaped so it still forbids the F-124-1 dead-content trap for everyone else),
or it stays forbidden with the reason recorded; the F-124-1 RECORD CORRECTION in
`docs/HANGOUT_REDESIGN.md` gains the outcome and its "has its own capstone" pointer is discharged or
retired; if content changes, the capstone that correction names is actually paid, with the moved rows
predicted before the run; fingerprint discipline stated; gate green.

### T-257 · Rule whether all eleven quest captains being permanent Dare dealers is intended — `status: TODO` · `coder: opus` · `after: —`

**UNRULED CONSEQUENCE OF PINNING.** `resolveVisitHangout` (`packages/engine/src/actions/hangout.ts`, the
pool-B filter `(n) => !n.dead && n.currentSystemId === nextState.player.currentSystemId` at `:263-265`)
resolves its Dare dealer / social target from co-located NPCs with NO `isSimulatedCaptain` filter, and the
BOND HOOK likewise only requires co-location. So all eleven quest captains are now permanent seatable
dealers and bond-hook sources at their declared home ports. This was MEASURED on T-208's capstone, not
theorised: gambler `hangoutPlay.visits` 281 → 301 and credits 127,628 → 147,288; and it moved
`campaign-degraded.test.ts` ENTRY 34's declared CONTROL row (greedy — only seed 1 differs, divergence
begins day 7, player fuel 136 → 86, a 50-unit gap that is exactly Doc Salvage's `bondHook.fuelAmount`,
while the greedy trader stood at Antares-5). Nobody has ruled whether a quest captain being a permanent
Dare dealer is intended or an accident of the filter's absence.
[harvested: T-208/quest-captains-seatable-dealers]

**Accept:** the owner rules whether quest captains are seatable Dare dealers and bond-hook sources at their
home ports; if the answer is no, `resolveVisitHangout`'s pool-B filter
(`packages/engine/src/actions/hangout.ts:263-265`) and the bond hook gain the `isSimulatedCaptain`
exclusion and the rule change is taken as a rules edit — `rulesFingerprint` moves, the moved rows are
predicted up front, and the capstone is paid; if the answer is yes, the behaviour is documented at the
filter site and in `docs/HANGOUT_REDESIGN.md` so it reads as designed rather than as an accident, and the
measured effects (gambler `hangoutPlay.visits` 281 → 301, credits 127,628 → 147,288, and
`campaign-degraded.test.ts` ENTRY 34's greedy control divergence) are recorded as accepted; either way the
ENTRY 34 control-row consequence is re-read rather than absorbed; gate green.

### T-251 · Build the dawn-hand roll — the ceremony T-201 only designed — `status: TODO` · `coder: opus` · `after: T-252`

The dawn-hand roll itself is UNBUILT. T-201 delivered only the proposal
(`docs/design/T-201-dawn-hand-roll.md`); its Accept reserves the follow-up `code`-type task for the
owner's pick, and no such task existed anywhere in `TASKS.md` until this one. The owner picks a
treatment first — the doc recommends **Option C, "built as Option B first"**: ship B's full form and
A's short form in one task with the predicate stubbed to "always full" behind a dev toggle, then set
the predicate. The screenshot loop (`tabletop-ui` §7: build → screenshot → self-critique, 2–3 full
variants, "never self-approve aesthetics") is owed by THIS task, not by T-201.
[harvested: T-201/dawn-roll-implementation]

**Sequenced `after: T-252` at the 2026-08-06 re-order.** `docs/design/T-201-dawn-hand-roll.md` (Q4/§3.6, restated in T-252's block) warns that this
ceremony must not ship a cinematic-only beat while the motion-tier question is unanswered. That
gate existed only as prose — the exact failure class the harvested `after-field-gate-check`
lesson names (`/orchestrate` selects on `after:` and never reads prose) — so it is now encoded.

**Accept:** the owner's treatment pick is recorded before implementation starts; the ceremony ships in
`packages/ui` against that pick, with the doc's §7 open questions either already ruled (see the
`docs/design/T-201-dawn-hand-roll.md` §7 entry in `TODO.md`) or ruled inside this task and written back
into the doc; the `tabletop-ui` §7 screenshot loop is actually run — 2–3 full variants, screenshots
attached, self-critique recorded, no self-approved aesthetics; the doc's file:line pins are re-verified
against HEAD at the START of the task rather than trusted (they were pinned to commit `b8343150` and
have drifted); the hand renders N dice, not a hard-coded 5, with a 6- and 7-die render covered by a
test; the beat respects the motion model in force and does not ship cinematic-only; if nothing but UI
moves, state that no capstone or `balance:extract` is owed; gate green.

### T-181 · D7's not-built alternative: a per-port interest-rate multiplier on `LOAN_DAILY_RATE` — `status: TODO` · `coder: opus` · `after: T-198`

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

### T-232 · The R1/R2 revisit the owner deferred behind the UI iteration is now DUE — `status: TODO` · `coder: opus` · `after: —`

The owner's 2026-08-03 rulings on **R1 (Combat's chosen `executeCombat` branch)** and **R2 (F-150-1
— the 0.25 named-pool interceptor gate in `packages/engine/src/actions/travel.ts`, read together
with `DISPOSITION_DECAY_INTERVAL_DAYS = 3` in `packages/engine/src/content/disposition.ts`)** were
both DEFER-and-revisit-after-UI-iteration, naming **T-186, T-188, T-189, T-190 and T-191** as the
work they were deferred behind. All five are now `status: DONE`, so the revisit is DUE — and
neither ruling has been re-asked. The deferral text lives in `TASKS.md`'s "Deliberately deferred"
`executeCombat` bullet and in the **F-150-1** row of the "Findings filed BY T-150" table, and is
mirrored at `packages/sim/src/balance/coverage.ts`'s `ACKNOWLEDGED_COVERAGE_GAPS.fighter.owner`, in
`docs/NPC_REDESIGN.md`'s `| Combat |` PARITY LEDGER row, and in `docs/HANGOUT_REDESIGN.md` §11.3's
STATUS line. [harvested: T-158/r1-r2-revisit-now-due]

**Accept:** (human-gated) both R1 and R2 are re-asked against the post-UI tree and carry a fresh
dated owner ruling — "unchanged" counts as a ruling for each — recorded in
`docs/HANGOUT_REDESIGN.md` §11.3 and `docs/NPC_REDESIGN.md`'s PARITY LEDGER; the deferral text in
`TASKS.md`'s "Deliberately deferred" section, `ACKNOWLEDGED_COVERAGE_GAPS.fighter.owner` and
§11.3's STATUS line are updated so none of them still names the completed T-186/T-188/T-189/T-190/
T-191 gate as pending; any constant the ruling moves is paid with its capstone; the task halts
`BLOCKED` for the owner and is never self-approved.

### T-234 · No start-to-finish career UAT pass exists — schedule it or rule the two feel-level sessions sufficient — `status: TODO` · `coder: opus` · `after: T-233`

T-158 closed with the owner giving both rulings directly and "choosing not to prolong the checkpoint
into a full scripted career playthrough", so NO start-to-finish career pass exists.
`docs/VERSIONING.md:137`'s alpha criterion is "the owner's own UAT passes — played start to finish,
holds together", which the two feel-level sessions (feedback filed as **M14** and **M15**) do not
obviously meet. Schedule the start-to-finish pass, or record an explicit ruling that passes 1 and 2
discharge the criterion. [harvested: T-158/uat-start-to-finish-remainder]

**Accept:** (human-gated) either a start-to-finish career UAT pass is run and its outcome recorded
against `docs/VERSIONING.md:137`'s alpha criterion, or a dated owner ruling records that the M14 and
M15 feel-level sessions discharge that criterion and says why; whichever way it goes,
`docs/VERSIONING.md`'s stage table and `docs/RELEASE-CHECKLIST.md` are left consistent with the
decision (coordinate with T-233 so the two do not contradict each other); the task halts `BLOCKED`
for the owner and is never self-approved.

### T-267 · `distance3D` was built but never wired into the live travel formula — rule the swap or close it — `status: TODO` · `coder: opus` · `after: —`

T-188 item 3d built `distance3D` in `packages/content/src/systems.ts` as **additive only**, and
explicitly deferred wiring it into the LIVE travel formula to "whichever map (4a/4b/4c) the owner
picks". The owner picked **4B**, and T-215 then shipped the globe UI-only with NO `rulesFingerprint`
move — so the swap is now owned by no task at all. Verified still open:
`packages/engine/src/actions/travel.ts:17` imports `distance as systemDistance` (the **2D**
function) and feeds it to `jumpFuelCost`, `travelDc` and `calculateRouteDanger`. This is the ONLY
lever that changes non-Sol-to-non-Sol route numbers — the owner's own note says 3d "will directly
affect" contract-run distances — i.e. it is the "basically zero payoff to travelling between ports"
half of T-188's own title. Swapping it is a rulesFingerprint-MOVING change: it owes an 8,000-run
capstone sweep and re-tuning against `docs/balance/BASELINE-T-1603a.md`.
[harvested: T-188/distance3d-live-formula]

**Accept:** (human-gated) the owner rules EITHER that the 3D swap proceeds — in which case it is
filed as its own balance task with the capstone sweep and the re-tune against
`docs/balance/BASELINE-T-1603a.md` written into its Accept, never folded into unrelated work — OR
that `distance3D` stays additive-only, in which case a dated statement records why and
`packages/content/src/systems.ts` is re-commented so the function is not read as pending wiring; the
before/after route-number effect on at least two non-Sol-to-non-Sol runs is measured and presented
to the owner BEFORE the ruling is asked for; the task halts `BLOCKED` for the owner and is never
self-approved.

---

## M20 — Admin/balance authoring panel: the "Tier 2 levers dashboard" (owner, 2026-08-05)

**Deliberately gated, not urgent.** The owner is prioritizing visual presentation and the core
game loop first; this becomes a "must have" after a full 30-day Tour One playthrough, not before.
`docs/TELEMETRY-REPORT_SPEC.md` §7 already named and deferred this exact idea (a UI where a
content/balance lever is adjusted and a sweep fires on demand) when `packages/devpanel` (T-143,
the read-only Tier 1.5 panel) shipped, and named the real difficulty: editing what are today
plain, git-committed, fingerprinted TypeScript constants without breaking their provenance. This
milestone is that idea, scoped as the owner described it 2026-08-05: select a few levers (captain
stats, ship upgrades, port distances, fuel costs, Liar's Dice payouts, pirate aggression, Explore
rewards — eventually most of `packages/content`), run against a **cloned** config that never
overwrites the committed source, click a test button that runs the real balance sweep, and see
results — ideally visualized — before deciding whether to actually make the change for real.

**Corrected at the 2026-08-06 re-order:** T-215, T-216, T-217 and T-218 had been appended
under this header ABOVE the T-209 checkpoint. None is admin-panel work — all four are the
M14/M15 visual arc, the owner's stated priority — so they were re-homed to those milestones.
This milestone is now exactly what its header says: the checkpoint, then T-210 → T-214.

### T-209 · CHECKPOINT — do not start M20 until the owner says so — `status: TODO` · `coder: —` · `after: —` · `[BLOCKED BY = Owner priority — resume after visual/core-loop work]`

This task exists ONLY to keep every other task in this milestone from being picked up by
`/orchestrate all`. It has no automated deliverable — the runner will find nothing to prepare and
should commit it `BLOCKED(Owner priority — resume after visual/core-loop work)` and halt
immediately per the standard human-gate protocol. **Do not build anything for this task.** The
owner un-gates the milestone by flipping this task's status directly (not via the orchestrator) or
by explicitly re-scoping a future `/orchestrate` call to name T-210 onward.

### T-210 · Design: the sandboxed hypothesis/clone architecture — `status: TODO` · `coder: fable` · `type: design` · `after: T-209`

Before any of this is built, the hardest question needs an actual answer, not an assumption: HOW
does "select a lever, run a hypothesis, never touch committed source" actually work given this
project's fingerprint/provenance discipline? Research and propose, with competing options and a
recommendation: (1) where a cloned config lives (the existing `packages/devpanel` precedent writes
ad hoc runs to a gitignored `.scratch/balance/panel-runs/` — is that the right model, or does a
lever-adjusted content clone need its own location/lifecycle); (2) how a "lever" is represented —
a small typed override layered on top of the real committed content at read time, vs. a full
file-copy-and-edit, and what that means for reusing the existing `defineX`/`validateX` content
validators (`packages/content`'s hand-rolled per-file validation, not zod) against a hypothesis
that was never committed; (3) how the sweep CLI (`packages/sim/src/balance/sweep.ts`) is pointed at
a hypothesis instead of real content — an env var, a CLI flag, a config-resolution seam that
doesn't exist yet; (4) what "results, ideally visualized" means concretely — reuse
`packages/sim/src/balance/report-html.ts`'s existing rendering, or something new; (5) an HONEST
read on how much of `packages/content`'s ~22 editable-shaped files (per the earlier survey) a
FIRST slice should cover — the owner named many domains at once, but a pilot should probably be 2-3
levers, not all of them, and the design should say which and why. Ground every claim in the actual
code (`packages/devpanel/src/*`, `packages/sim/src/balance/*`), not assumption.

**Accept:** a written proposal under `docs/design/`, citing real file:line throughout, presenting
genuinely competing options with a recommendation per open question above, and naming its own
first-slice scope recommendation. `.md`-only diff (design gate). Gate green.

### T-211 · Build: lever selection + the clone-write backend — `status: TODO` · `coder: opus` · `after: T-210`

Implement T-210's recommended architecture for the FIRST-SLICE lever set it named. Extends
`packages/devpanel` rather than starting a new package, per the existing foundation. No commit to
the real repo ever happens as a side effect of selecting/adjusting a lever — this is the task
where that guarantee gets its own test.

**Accept:** a lever can be selected and adjusted through the panel's backend API/CLI without
`git status` on the real repo ever showing a change; the clone is validated against the same
content-validator functions the real files use. Gate green.

### T-212 · Build: wire the "test" action to the real sweep — `status: TODO` · `coder: opus` · `after: T-211`

The panel's "test" button runs the actual balance-sweep program (not a reimplementation) against
the cloned/hypothesis config from T-211, at a seed/day count practical for interactive use (the
owner's own example was "1000 headless games" — confirm that's a reasonable interactive-latency
target or recommend a smaller default with an "expand" option).

**Accept:** clicking test runs a real sweep against the hypothesis config and returns a result
distinguishable from the baseline (committed) sweep; the committed baseline files are never
overwritten by a test run. Gate green.

### T-213 · Build: results visualization — hypothesis vs. baseline — `status: TODO` · `coder: opus` · `after: T-212`

Graphs/comparison view: the hypothesis run's results against the current committed baseline,
across whatever metrics the existing balance-report tooling already tracks (clear rate, median
credits, ships lost, encounters/run, etc. — the same figures this session's capstones have been
quoting all day). Reuse `report-html.ts`/`report-model.ts` rendering conventions rather than
inventing a new visual language for the same numbers.

**Accept:** a hypothesis test's results render as a real comparison (not just two raw JSON blobs)
against the current baseline. Gate green.

### T-214 · Expand lever coverage beyond the pilot slice — `status: TODO` · `coder: opus` · `after: T-213`

Once T-210 through T-213 prove the pipeline on its first-slice levers, extend coverage toward the
owner's full list: captain stats, ship upgrades, port distances, fuel costs, Liar's Dice payouts,
pirate aggression/stats, Explore rewards. Likely several sub-tasks in practice (`T-214a`,
`T-214b`, …) rather than one — split at whatever the actual pilot reveals about per-domain cost,
not decided in advance here.

**Accept:** at minimum one additional content domain beyond the T-210 pilot slice is a working
lever. Gate green.

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
| T-156 | Build: N13 dawn-hand parity — the algorithmic virtual hand | M7 | 2026-08-02 | `7f113934` | n5-proficiency-unscheduled, npc-p10-floor-fourth-time, npc-hand-exhaustion-fallback, lesson |
| T-182 | Fix F-156-1: `spendDie` silently destroys the day's re-roll charges | M7 | 2026-08-02 | `70fe9341` | lesson, lesson |
| T-154 | Build: native LLM pilot policy for the player seat | M7 | 2026-08-02 | `d9b3a1bc` | f-155-1-live-anthropic-leg, sweep-invariant-ownership-pointer, write-tasks-order-vs-after-check, write-delivered-note-claim-audit |
| T-160 | Fix F-137-1: the dealer's certain-loss structure — bakeoff the two sanctioned shapes, ship the winner | M7 | 2026-08-02 | `345870d1` | protocol-quantity-max-vacuous-at-tier-0, protocol-opening-floor-refusal-branch-unreachable, todo-md-t160-anchors-go-stale-on-prune, lesson |
| T-161 | Fix F-159-1: veteranPolicy's un-relaxed contract filter — the last of the class | M7 | 2026-08-02 | `bf95ac80` | F-161-1, lesson |
| T-158 | CHECKPOINT — human UAT, plus recorded rulings on Combat's chosen branch and F-150-1 | M7 | 2026-08-02 | `5a8792a3` | r1-r2-revisit-now-due, post-uat-stage-docs-stale, uat-start-to-finish-remainder, lesson |
| T-155 | Validate: run the pilot end-to-end and confirm it's trustworthy | M7 | 2026-08-04 | `da1190ec` | F-155-1, after-field-gate-check, lesson, lesson, lesson |
| T-199 | F-150-2: `smugglerPolicy`'s unguarded Explore loop, and the shared `planPacifistCombat` stall behind it | M7 | 2026-08-04 | `a55edd53` | F-199-1, F-199-2, f199-id-collision, t199-remote-sweep-gate-unconfirmed, write-tasks-line-ref-check, lesson, lesson |
| T-162 | Build: the browser/DOM-level long-horizon check — the bridge blind spot gets an owner | M7 | 2026-08-04 | `c1133bbd` | F-162-4, longhaul-unfired-verbs, lesson, lesson, lesson |
| T-163 | Working branches never run e2e before merge — widen the CI trigger or gate rule-deleting changes | M8 | 2026-08-04 | `c447cbcd` | t163-ci-evidence, f-153-1-cron |
| T-164 | `packages/content` has no test runner — stand one up, or record engine-suite hosting as permanent | M8 | 2026-08-04 | `13fbe892` | F-164-1, lesson, lesson |
| T-165 | Baseline-of-record pointer consistency check — fail when the four sites disagree | M8 | 2026-08-04 | `8ca62b8d` | lesson, lesson |
| T-166 | An Accept criterion citing a precedent commit is never checked against that commit | M8 | 2026-08-04 | `b9331a2e` | lesson, lesson |
| T-167 | Rig sensitivity check — fail when a policy is bit-for-bit flat across variants that should perturb it | M8 | 2026-08-04 | `e55ea3ad` | sensitivity-check-has-no-production-caller, trinket-rig-fixture-weaker-than-real-rig, fighter-flat-defect-still-open, lesson |
| T-168 | F-146-1 / F-148-4: the raised tier-4/5 ceiling is never staked into — amend §4.6 first, then fix | M9 | 2026-08-06 | `cd08c2e5` | F-168-1, write-4-6a-closed-list-check, lessons-l014-stale-pointers |
| T-169 | F-148-2: the 42-seat gauntlet is played but never completed — `liars_dice_grand_slam` is unreachable | M9 | 2026-08-05 | `196dd26c` | doc-source-pin-rot-check, f148-siblings-owner-call, lesson |
| T-170 | F-148-5: `CONQUEROR = 38` is unreached at 120 days by every policy — run the 300-day arm | M9 | 2026-08-05 | `9af7aa3c` | lesson |
| T-175 | F-160-1: the archetype ordering SURVIVES the F-137-1 fix — `optimal` is still the softest seat | M9 | 2026-08-06 | `bb21fa97` | optimal-bluff-exposure-revisit, lesson, lesson |
| T-176 | F-160-2: the challenger-won split is still 41.7 pp apart — price the planner's selectivity or re-derive the criterion | M9 | 2026-08-06 | `d795339b` | stale-filed-numbers-check, lesson, lesson |
| T-177 | F-160-3: FOLD is still never the better credit play — an owner design call | M9 | 2026-08-06 | `4e644798` | concealment-memory-owner, lesson, lesson, lesson |
| T-219 | F-176-1: `optimal`'s RAISE valuation prices a counterparty that does not exist | M9 | 2026-08-06 | `3e592a89` | lesson |
| T-220 | F-176-2: the table's player win rate has fallen through T-160's 55–70% band, unremarked | M9 | 2026-08-06 | `32303e90` | combat-win-share-gambler-arm, docsfingerprint-scope-check, t160-head-composition-decomposition, dare-cells-low-tier-underpowered, lesson, lesson |
| T-221 | F-177-1: the FOLD trade is invisible to the player | M9 | 2026-08-06 | `94ee723b` | lesson, lesson |
| T-173 | The capstone instrument is blind to Hangout and disposition — add the fields, pay the re-pin | M11 | 2026-08-04 | `5d8ed5f4` | strip-proof-not-asserted, lesson |
| T-183 | F-142-1: a merged aggregate carries no `rulesFingerprint`/`gitCommit` — stamp it at write time | M11 | 2026-08-04 | `a7e87dd1` | checkpoints-stamp-crosscheck, aggregate-productversion-stamp, tasks-id-uniqueness-check, lesson, lesson |
| T-179 | Record the three unruled `docs/PLAYER-TRINKETS_SPEC.md` §12 questions | M13 | 2026-08-06 | — | f151-5-6-parked-by-ruling |
| T-185 | Zero audio feedback in play — investigate before rebuilding, then add music | M14 | 2026-08-03 | `ea6ef932` | playtest-logging-default-off, owner-audio-scripted-pass-residue, setdrivehum-false-dead-branch, lesson, lesson, lesson, lesson |
| T-187 | No literal walked-through first turn — the existing onboarding coach is contextual, not sequenced | M14 | 2026-08-03 | `eed2f3fe` | e2e-first-run-gate-check, lesson, lesson |
| T-189 | Ship state panel is an unreadable ledger — replace the number-blur with a real ship diagram | M15 | 2026-08-04 | `e357abdb` | ship-diagram-damaged-e2e, lesson |
| T-190 | Contract manifest should feel like a discrete, port-bound object, not a permanent fixture | M15 | 2026-08-04 | `776f3bf4` | lesson, lesson, lesson, lesson |
| T-191 | The lower-right menus read as flat and interchangeable | M15 | 2026-08-04 | `82376e0e` | ui-render-unit-gap, keyed-input-guard, lesson, lesson |
| T-192 | The manifest's "not docked" state — the half of T-190 that needs a travel duration to exist | M15 | 2026-08-06 | — | — |
| T-195 | The travel die matters again — fuel discount + encounter evasion, both monotonic | M16 | 2026-08-06 | `8ba4e83a` | preview-resolver-die-agreement-test, nav-die-monotonicity-property-test, travel-ts-stale-capstone-directive, tasks-md-baseline-name-check, lesson |
| T-196a | Free the administrative actions — engine rules, action shapes, and the compile-error sweep | M17 | 2026-08-06 | `80214616` | tsc-shorthand-property-blindspot, legacy-die-fail-reasons-await-save-bump, t196a-ships-lost-rise, lesson, lesson, lesson |
| T-196b | Teach the instruments the free actions — sim policy day-budgets + the protocol enumerator | M17 | 2026-08-05 | `cfb61590` | F-196b-2, homeward-burn-nav-gate, pin-f196b1-seeds, lesson |
| T-196c | Free the administrative actions in the UI — stop demanding a die, stop clearing the armed one | M17 | 2026-08-05 | `ee0db4fc` | dawn-hand-doc-t196c-shipped, lesson |
| T-197 | Free the Hangout actions, add the social pool and the rounds cap, and close the milestone capstone | M17 | 2026-08-05 | `ec2248c9` | delivered-note-claim-check |
| T-200 | Make the opening debt read as ominous, not as a stat line | M18 | 2026-08-05 | `aeadf5b7` | t200-packaged-ci-evidence, lesson, lesson |
| T-201 | Design: an animated dawn-hand dice roll for the day transition | M18 | 2026-08-05 | `0abe9028` | dawn-roll-implementation, dawn-roll-open-questions, motion-tier-third-rail, pre-floor-face-not-observable, hand-size-n-render-check, design-doc-pins-stale |
| T-202 | Ship R3: revise `LIARS_DICE_ROUNDS_PER_DAY` to `[1, 2, 3, 4, 5, 6]` and pay its capstone | M18 | 2026-08-05 | `67b45fc6` | F-202-1, pacing-brief-fifth-site, lesson |
| T-203 | Surface a named rival's history at the Liar's Dice table — the insult-to-showdown connection is real but invisible | M18 | 2026-08-05 | `fe9ee6aa` | — |
| T-204 | Rename "Hangout" to "Cantina" in every PLAYER-FACING surface | M18 | 2026-08-05 | `9cc14097` | F-204-1, F-204-2, tasks-path-citation-check-t204-instance, lesson, lesson |
| T-205 | Schema: give the 30 named captains table-talk and battle-catchphrase slots | M19 | 2026-08-05 | `5336af0d` | content-cycle-check, lesson |
| T-206 | Content pass: author table-talk and catchphrases for all 30 captains | M19 | 2026-08-05 | `818cb60f` | content-data-only-check, lesson, lesson, lesson |
| T-207 | UI: surface table-talk and catchphrases at the table and in combat | M19 | 2026-08-05 | `6301747f` | t207-e2e-bark-dom, lesson, lesson, lesson |
| T-208 | Pin quest captains stationary, at a port sane for their questline | M19 | 2026-08-05 | `85e91ad3` | quest-captain-regulars, quest-captains-seatable-dealers, quest-captain-voice, lesson, lesson |
| T-186 | Visual identity reads as monochrome sameness — resolve the tension with the PRD's committed CRT-amber pillar | M14 | 2026-08-06 | — | contrast-floor-check |
| T-218 | Build: ship the "one phosphor, two materials" visual identity | M14 | 2026-08-06 | `f66dac20` | slot-ready-dead-css, evidence-pin-resolves-check, lesson, lesson |
| T-216 | BUG: `theme.css`'s "one phosphor colour" law is already broken in two live UI spots | M14 | 2026-08-06 | — | lesson, lesson |
| T-217 | BUG: the Galactic Wire ticker scrolls underneath the LOG button | M14 | 2026-08-06 | — | lesson |
| T-250 | F-185-4: the playtest-logging default is still the interim ON | M14 | 2026-08-06 | `50395347` | interim-deviation-marker-check, lesson |
| T-188 | Galaxy map: port spacing gives near-zero travel payoff, and a jump is imperceptible — an owner design decision | M15 | 2026-08-04 | `6327a5e3` | distance3d-live-formula, imperceptible-jump, lesson |
| T-193 | BUG: the starmap shows a "PILOT DC" for every jump, but ordinary jumps never roll against it | M16 | 2026-08-06 | `1f8872dd` | T-258, T-259, real-browser-tier, lesson |
| T-194 | The dawn hand's die-value mechanic is illegible — teach it, and make success visible | M16 | 2026-08-06 | `14ff8fde` | T-260, T-261, T-262, lesson, lesson, lesson |
| T-253 | F-204-1: `wireStories.ts`'s "VERBATIM PRD §6 sample" no longer matches the PRD | M18 | 2026-08-06 | `45190db0` | lesson |
| T-255 | The four captain-voice surfaces have unit coverage only — prove them in real DOM | M19 | 2026-08-06 | `a075e59a` | e2e-tag-guard, player-visible-copy-dom-coverage-check |
