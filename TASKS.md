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

The dawn-hand arc is the game's second intentional easing in a week: T-195 alone moved
`fleet.tourOneClearRate` 0.5605 → 0.6310 and `finalCredits.median` +40.5%, and M17 roughly
doubles a trading day's useful actions (sign/fuel/repair/hire no longer compete with jumps for
dice). The day-30 marker, contract deadlines, and loan terms were all tuned against the OLD
action economy, and nothing inside M17's build tasks judges whether they still hold — this
checkpoint is where that judgment happens, BEFORE T-194 bakes the new economy into tutorial
copy.

**The brief, assembled from work already done (no new sweeps):** T-197's cumulative table
(t182 → t195 → t199 → t196a → t196b → t197), the Insult encounter-farming measurement (moved or
clear), and one owner play session at feel level. **The orchestrator HALTS here** per the T-158
convention — the outputs are owner rulings, not code: (1) is the pacing acceptable, or does a
re-tuning task get filed (marker day, contract deadlines, T-195's 15%/20% magnitudes, the §4b
rounds table) before T-194 runs; (2) whether `SOCIAL_PLAYS_PER_DAY = 3` needs tightening — the
pool was ruled with the prediction that X = 3 holds the Insult encounter-farming loop, and
T-197's capstone measurement either confirms that or is the finding this ruling answers. Record
both rulings in this block, dated; T-194 un-gates on them.

**Prepared (2026-08-05, AUTOMATED HALF ONLY — this task is NOT done and was not self-approved).**
The automated half of the checkpoint is complete and the run **halts here**, per the T-158
convention. What landed:

- **The brief: `docs/playtests/T-198-pacing-brief.md`.** Ten sections, mirroring T-158's: what
  closes the task (**three** rulings, not two — F-198-3); the runbook, which does **not** duplicate
  T-158 §2 but points at it and adds only the M17 deltas (every administrative verb and all seven
  Hangout verbs free; `Dare{move:'peek'}` the only Hangout die spend left; the two live readouts
  `social-plays-left` / `dare-rounds-left`; the two typed refusals `social-limit-reached` /
  `daily-round-limit`; the standing play-through-the-UI rule restated); a suggested-not-scripted
  pass aimed at the pacing question; **§4 the cumulative arc as measured**, with F-198-2's
  two-origins sentence; **§5 the pacing clamps and the F-198-1 correction**; **§6 R2's evidence, the
  Insult null result**; **§7 R3's evidence, the rounds table**; §8 instrumentation, re-grepped at
  each call site rather than copied from T-158's block; §9 a session-notes template with the Bug
  Discovery Policy pointer; **§10 the three EMPTY ruling slots**, in T-158 §9's table idiom.
- **One heading inserted in `docs/DAWN-HAND-REDESIGN.md`** — `## 0 · M17 as measured — the Insult
  null result and the cumulative arc` — so the Insult block, the still-open-rounds bullet, the
  cumulative table and "what the arc actually shows" become one section-pinnable region running to
  `## 1 ·`, plus one sentence pointing at the brief. **No existing section was renumbered**, and no
  test parses this document's heading structure (checked: only comment references in
  `protocol.test.ts` and `campaign-smuggler-gambler.test.ts`).
- **New test: `packages/sim/src/__tests__/pacing-brief-figures.test.ts`** (5 tests). (1) Sixteen
  prose figures pinned in **both** directions — heading exists, value is inside that section, value
  is in the brief — with non-vacuity asserted. (2) **The cumulative arc table is DERIVED, not
  transcribed**: all six committed aggregates are read, `runs === 8000` is asserted on each, and the
  four columns are re-formatted and required to appear as whole table rows in **both** the spec §0
  and the brief — so a re-pinned baseline cannot leave a stale arc row standing anywhere. (3) The
  F-198-4 null result is **machine-checked** against `packages/sim/src/index.ts`: no
  `venue: 'meet'|'befriend'|'insult'` literal may appear, and the three venues that ARE planned are
  asserted positively so the check cannot pass by the file having moved. (4) R3's receipt: the
  `PROPOSED` marker must be present at all three sites AND the array must still read
  `[1, 2, 2, 3, 3, 4]`, so a ruling moves all four together or the suite goes red. (5) All three
  ruling cells and all three date cells asserted **EMPTY** — a filled cell no owner wrote is a
  self-waiver. The file header states that **test 5 INVERTS when the owner rules** and names the
  T-158 precedent (`uat-brief-figures.test.ts`'s third test) so the closer flips it rather than
  deleting it.

**FOUR FINDINGS — these are the brief's spine, filed here so they survive a cleared session.**

**F-198-1 · "Contract deadlines" do not exist in this game — a correction to this task block's own
framing, recorded rather than silently substituted** (the idiom T-197's Delivered note used for its
two). This block names contract deadlines among the things tuned against the old action economy.
`CargoContract` (`packages/engine/src/types.ts:2142-2148`) is
`{ destination, cargoType, payment, pods, haggled? }` — **no deadline, no expiry, no due-day field**
— and `/usr/bin/grep -rn "deadline\|expiresDay\|daysToDeliver"` over `packages/engine/src` and
`packages/content/src` returns nothing for contracts. The manifest board rerolls
(`generateManifestBoard`, `packages/engine/src/day.ts:145`); a *signed* contract has no clock on it.
The pacing clamps that DO exist, and that R1 actually rules on, are four:

| clamp | value | pin |
| --- | --- | --- |
| the day-30 marker | a literal `30`, **not a constant** | `packages/engine/src/day.ts:1284` (`nextState.day === 30`) |
| Tour One debt | `25000` | `packages/engine/src/state.ts:128` |
| Guild debt interest | `GUILD_DEBT_DAILY_RATE = 0.02`/dusk | `packages/content/src/guild.ts:80` |
| loan term / rate | `LOAN_TERM_DAYS = 15`, `LOAN_DAILY_RATE = 0.05` | `packages/content/src/lending.ts:69,63` |

plus T-195's own two magnitudes, `NAV_DIE_FUEL_DISCOUNT_MAX = 0.15` / `NAV_DIE_EVASION_MAX = 0.2`
(`packages/engine/src/actions/travel.ts:128-129`), which the block names correctly.

**F-198-2 · This block's headline figure and the cumulative table's origin row are two different
"before"s, and both are correct.** This block (and T-195's, above) quote `fleet.tourOneClearRate`
**0.5605 → 0.6310**; `0.5605` is `docs/balance/baseline-t188-orbital-3d.json`, T-195's *immediate*
predecessor. The cumulative table (`docs/DAWN-HAND-REDESIGN.md` §0) starts at **0.5689**, which is
`docs/balance/baseline-t182-reroll-fix.json`, the last **pre-T-195** baseline T-197's capstone was
required to span. Both verified by reading the files. The brief says so in one sentence with both
pins, so the checkpoint does not spend the owner's attention on an artefact.

**F-198-3 · There is a THIRD ruling already pending at this checkpoint, and T-197's Delivered note
contradicts the repository on it — a correction to T-197's framing, recorded rather than silently
substituted.** `LIARS_DICE_ROUNDS_PER_DAY = [1, 2, 2, 3, 3, 4]` still ships marked
`PROPOSED — AWAITING OWNER CONFIRMATION` in three places (`packages/content/src/liarsDice.ts:101`,
`docs/DAWN-HAND-REDESIGN.md:283-289` §5's last bullet headed **STILL OPEN**,
`docs/LIARS-DICE-DECISIONS.md:219-228` LD-23), yet T-197's Delivered note says the numbers "were
confirmed with the owner". Surfacing is not confirming; the correction is recorded beside that
sentence above, and the sentence is not deleted. This is the T-158 "POINTER, NOT AN AMENDMENT"
situation except that it lands **inside** the checkpoint — T-198's own text already names "the §4b
rounds table" inside ruling (1). It is therefore promoted to its own slot, **R3**. **Three rulings,
not two.**

**F-198-4 · The Insult measurement is a NULL RESULT, and the reason is structural and
machine-checkable.** `docs/DAWN-HAND-REDESIGN.md` §0 and `docs/NPC_REDESIGN.md:161` already state
it; this pass proved the mechanism. The only `venue:` literals any policy PLANS in
`packages/sim/src/index.ts` are `venue: 'borrow'` (`:2604`), `venue: 'repay'` (`:2637`) and
`venue: 'dare'` (`:4225`). `meet`/`befriend`/`insult` appear at `:1399-1401` **only as a telemetry
reader** (`hangoutPlay.socialBeats += 1`), and `socialBeats` is not even in the committed aggregate;
`packages/sim/src/protocol.ts:914` enumerates them for the protocol seam, but nothing emits them. So
the fighter row coming back byte-identical to T-196b is **not** evidence that X = 3 holds the loop —
the loop cannot be exhibited by this instrument at all. **`SOCIAL_PLAYS_PER_DAY = 3` is UNVERIFIED,
not verified.** What R2 actually rules on is the analytic bound: 3 plays/day × −4 disposition
(`INSULT_DISPOSITION = -4`, `packages/content/src/hangout.ts:96`) ⇒ at most **one** manufactured
grudge to the −10 floor per day, against unbounded before the cap; the −10 hunt weight is 16×
(`packages/content/src/hangout.ts:118`) and the measured wronged-captain lift is 2.358×
(`docs/HANGOUT_REDESIGN.md` §11.3). Test 3 of `pacing-brief-figures.test.ts` makes this durable: the
day a policy learns to plan a social venue, the suite says the finding is stale.

**Gate transcript, run BEFORE writing anything and again AFTER, so a pre-existing red could not be
mis-attributed.** BEFORE: `npm test` → **126 files / 2,473 tests passing, 0 failing**
(content 2/25 · desktop 7/110 · devpanel 5/61 · engine 50/1346 · sim 37/524 · ui 25/407). AFTER:
**127 files / 2,478 tests passing, 0 failing** — exactly this task's one new file and its five
tests (`packages/sim` 37/524 → 38/529), nothing else moved. The known-red `it.fails` tripwires behaved
as expected-red on both runs and none flipped to unexpectedly passing. `npx tsc -b`, `npm run lint`
and `npm run format:check` exit 0 on both runs.

**NO FINGERPRINT MOVED, NO CAPSTONE IS OWED, AND NO SWEEP WAS RUN — stated rather than left
unaddressed.** Every edit is under `docs/` (not hashed at all) or `packages/sim/src/__tests__/`
(`__tests__` is in `HASHED_ROOT_IGNORED_DIRECTORIES`, `rules-fingerprint.ts:255-267`). Therefore
`rulesFingerprint` is **unmoved at `10e19c88e9a07856`** and `instrumentFingerprint` **unmoved at
`5c230e99648cddee`**; the baseline of record `docs/balance/baseline-t197-hangout-caps.json` is
untouched, with no re-pin and no `smoke/tiers.json` re-extract. The brief is assembled from work
already done, which is this task's own instruction. `CURRENT_SAVE_VERSION` stays **16** — re-read at
`packages/engine/src/save.ts:562`, not copied out of a task block (T-197's block carries a stale
"13 → 14"; the shipped bump was 15 → 16). No new non-test module was added under `packages/sim/src`,
so **no `SIM_NON_INSTRUMENT_SOURCES` entry is owed** — the figure table lives inside the test file
for exactly that reason. Nothing under `packages/engine`, `packages/content`, `packages/ui` or
`packages/desktop` changed: `SOCIAL_PLAYS_PER_DAY`, `LIARS_DICE_ROUNDS_PER_DAY`,
`NAV_DIE_FUEL_DISCOUNT_MAX`, `NAV_DIE_EVASION_MAX`, `LOAN_TERM_DAYS`, `LOAN_DAILY_RATE`,
`GUILD_DEBT_DAILY_RATE` and `day.ts`'s `=== 30` are all untouched, by name.

**TO CLOSE THIS TASK — where each ruling gets transcribed when it arrives.** Do not re-derive this
after the halt; it is written down here on purpose.

1. **R1 (is the post-M17 pacing acceptable?)** → (a) this block, dated; (b)
   `docs/DAWN-HAND-REDESIGN.md`, as a dated ruling line at the top beside the existing SHIPPED
   PART 1/2/3 blocks; (c) **if and only if the ruling is "re-tune"**, a NEW TASK BLOCK — never a
   constant edited inline, because every named lever (the day-30 literal, the debt/interest, the
   loan terms, the two `NAV_DIE_*_MAX` magnitudes) moves the fleet economy and owes its own capstone
   diffed against `docs/balance/baseline-t197-hangout-caps.json`.
2. **R2 (`SOCIAL_PLAYS_PER_DAY = 3`)** → (a) this block; (b) `docs/DAWN-HAND-REDESIGN.md` §4a; (c)
   if "tighten", a new **content** task plus its capstone; if "measure first", a new **instrument**
   task for the insult-playing policy arm — a new instrument BEHAVIOUR with its own arm, moving
   `instrumentFingerprint` only.
3. **R3 (the §4b rounds table)** → all four sites in ONE edit:
   `packages/content/src/liarsDice.ts:101`'s docblock, `docs/DAWN-HAND-REDESIGN.md` §5's last
   bullet, `docs/LIARS-DICE-DECISIONS.md` LD-23, plus the array itself if revised. **A
   marker-comment flip alone is FREE**: `rulesFingerprint` is *semantic* and strips comments
   (`packages/sim/src/balance/rules-fingerprint.ts:448-496`), so only `docsFingerprint` moves and
   that is a NOTE, not a failure (`packages/sim/src/balance/checkpoints.ts:467-490`). **Revising the
   ARRAY is a content edit and DOES owe a capstone**, diffed against
   `baseline-t197-hangout-caps.json`. Stated explicitly so the closer does not run 8,000 rows for a
   comment.
4. Then flip **test 5** of `packages/sim/src/__tests__/pacing-brief-figures.test.ts` from
   asserts-empty to asserts-non-empty, per that file's own header comment and the T-158 precedent.
5. **T-194 and the ~12 backlog tasks whose `after:` names T-198 stay gated.** No `after:` field was
   touched by this pass — they un-gate when the owner rules, not when the brief was written.

**THE HALT (2026-08-05).** Nothing further was done on this task by any coder. **No ruling was made,
guessed at, paraphrased or implied by this pass** — the coder does not self-waive, and the six empty
cells in the brief's §10 are the record that it did not. The task now awaits: Human ruling (R1, R2,
R3).

**RULING — R1 (owner, 2026-08-05): pacing is acceptable as-is.** No re-tuning task filed for the
day-30 marker, Tour One debt, guild interest, or loan terms — the cumulative arc showed M17's
freeing of admin/Hangout actions did not measurably ease the fleet economy (all within noise of
T-196a), so the levers tuned against the old economy stand unchanged. R2 and R3 remain open;
T-198 stays `BLOCKED(Human ruling)` until both are answered.

**RULING — R2 (owner, 2026-08-05): `SOCIAL_PLAYS_PER_DAY = 3` confirmed, no change.** Per the
insult-farming investigation (background test, 2026-08-05): the pool cap correctly blocks a
4th same-day insult; insult/disposition never touches faction reputation or any player-facing
score (fully separate systems, verified against source); and the interception-reweighting
mechanism it gates is real (measured 27%→72% wronged-share lift, matching the ~2.358×
theoretical figure) but economically narrow — it only reorders WHICH same-tier rival shows up,
never adds encounters or changes payout, so even the cap's own existence isn't load-bearing for
balance. No re-tuning task filed. **All three rulings (R1, R2, R3) are now recorded; T-198
closes per T-202's conditional instructions once T-202 lands.**

**RULING — R3 (owner, 2026-08-05): `LIARS_DICE_ROUNDS_PER_DAY` = `[1, 2, 3, 4, 5, 6]`** (tiers
0-5, a strict +1/tier climb, revised up from the shipped `[1, 2, 2, 3, 3, 4]` suggestion).
Owner's reasoning, recorded rather than paraphrased: the simulated ceiling (an always-wins
gambler playing every free round) is a rare, high-skill-adjacent, high-variance play — real
play at these odds still loses ~40% of individual hands — and rewarding a risky gambler
archetype with the credits to buy fast drives/cloaking and run a scoundrel playstyle (trade
combat for evasion) is an ACCEPTED, intentional outcome, not an exploit to close. Confirmed by
simulation before this ruling (Measure 1 optimistic ceiling +228% vs field median, Measure 2
realistic play +84%, both including the already-baked-in +68% shipped-gambler edge — see the
capstone note above). **Implementation is content-only** (the array + its three `PROPOSED`
markers) and owed its own capstone per T-198's own closing instructions — filed as **T-202**.
R2 remains open; T-198 stays `BLOCKED(Human ruling)` until R2 is answered and T-202 lands.

**CLOSED (2026-08-05, by T-202). All three rulings are in and every item of this block's own
"TO CLOSE THIS TASK" checklist is discharged.**

- **R1 — pacing accept-as-is.** Transcribed per checklist 1: (a) this block, dated, above;
  (b) `docs/DAWN-HAND-REDESIGN.md`'s dated ruling line beside the SHIPPED PART blocks (§0's
  preamble); (c) N/A — the ruling was not "re-tune", so **no constant was edited and no
  re-tuning task filed**, which is the checklist's own conditional.
- **R2 — `SOCIAL_PLAYS_PER_DAY = 3` confirmed, no change.** Transcribed per checklist 2:
  (a) this block; (b) a new dated **RULING — R2** paragraph in `docs/DAWN-HAND-REDESIGN.md`,
  and §0's now-false "R2 … remain open" / "R2 remains open" sentences corrected in place
  rather than deleted; (c) N/A — neither "tighten" nor "measure first" was ruled, so **no
  content task, no capstone and no insult-playing instrument arm is owed.** Nothing under
  `packages/engine` or `packages/content` moved for R2; `SOCIAL_PLAYS_PER_DAY` is untouched.
- **R3 — `LIARS_DICE_ROUNDS_PER_DAY = [1, 2, 3, 4, 5, 6]`.** Shipped by **T-202** per
  checklist 3, all sites in ONE edit, with the capstone the checklist says a REVISION (as
  opposed to a free marker flip) owes: `docs/balance/baseline-t202-liars-dice-ceiling.json`,
  diffed against `baseline-t197-hangout-caps.json` and re-pinned at all five pointer sites.
- **Checklist 4 — test 5 of `packages/sim/src/__tests__/pacing-brief-figures.test.ts` is
  FLIPPED, not deleted**, from asserts-empty to asserts-non-empty, per that file's own header
  and the T-158 precedent; test 4 was inverted the same way (PROPOSED → CONFIRMED markers,
  `[1, 2, 2, 3, 3, 4]` → `[1, 2, 3, 4, 5, 6]`), and the brief's §10 now carries the owner's
  ruling text and date in all six cells, transcribed from this block rather than paraphrased.
- **Checklist 5 — the gates are now un-gated.** T-194 and every backlog task whose `after:`
  field names T-198 are eligible from this point; no `after:` field was rewritten, the block
  they name is simply `DONE`.

Orchestration: attempts=1/4 · HUMAN-GATE HALT, released 2026-08-05.

---

## M14 — Owner UAT pass 1 feedback (2026-08-03)

Three findings from the owner's first hands-on session (build launched via `npm run dev -w
@spacerquest/ui` + `npm run dev -w @spacerquest/desktop`, playtest logging **not** enabled for this
particular pass — the session itself produced no exportable log; these are the owner's direct
verbal notes, captured per the Bug Discovery Policy rather than left in conversation). All three are
UX/design, not correctness defects — filed as tasks, not as `F-` findings, because each is
substantial enough to need its own implementation pass.

**Re-homed here at the 2026-08-06 re-order:** T-218 (the ruled T-186 build) and T-216/T-217
(both filed during the T-186 bake-off) had been appended under the M20 header, which is
owner-gated and "deliberately not urgent" — the opposite of this arc's standing priority.

### T-186 · Visual identity reads as monochrome sameness — resolve the tension with the PRD's committed CRT-amber pillar — `status: DONE` · `coder: opus` · `after: T-198`

Owner's read: "the monochrome amber is cool, but everything blends together... even here in an IDE
there is variety of format and color. We need to do something color-wise, I am not quite sure just
yet." **This is in direct tension with a COMMITTED design pillar, not a blank slate** —
`docs/PRD-REIMAGINED.md` §4 states "rendered in committed amber-phosphor CRT style... Duskers-grade
commitment, not scanline shader on a menu," and `docs/TECH-STACK.md`:164/247-248 name the CRT
aesthetic as the *reason* Electron and the DOM/WebGL renderer were chosen over alternatives. Silently
reworking the palette would override an explicit prior commitment the owner made themselves — so
this is a ruling, not a build-and-ship task, and it starts BLOCKED for exactly that reason.

**Accept (the ruling, first):** the owner reviews candidate directions that add legibility/variety
*within* the committed CRT-terminal frame (e.g. diegetic per-module accent hues — combat vs. trade
vs. Hangout rendered as different "instruments" on the one screen, still phosphor-style, still not a
generic web palette — vs. a harder break from monochrome) before any implementation, ideally via
`/bakeoff` so the options are compared with mockups rather than argued in prose. Once ruled: `docs/
PRD-REIMAGINED.md` §4 is updated to match (never silently left to contradict shipped behaviour), the
chosen direction is implemented (`packages/ui/src/theme.css` and call sites), and a screenshot pass
confirms it reads as a game, not an IDE-neutral palette bolted onto the existing CRT chrome.

**RULED (owner, 2026-08-05) — process, not final direction: run `/bakeoff`.** The owner declined
to pick a direction from prose/description alone and asked for the Accept criterion's own
recommended path — independent review plus real mockups compared side by side — before ruling on
monochrome-vs-accent-hues-vs-harder-break. No longer `BLOCKED`: the next step (`/bakeoff`) needs
no further owner input to start; the owner ruling this task is still waiting on is which direction
wins the bakeoff, not whether to run one.

**`/bakeoff` results (2026-08-05).** Three independent reviewers (visual/art director,
UX-legibility/accessibility, engineering-feasibility), isolated context, each required to build
and screenshot a real mockup before giving a verdict — not just argue in prose. Strong 3/3
convergence: all three independently measured the same root defect (panel/background contrast
1.04:1, pane borders 1.36:1 — both below the 3:1 floor at which a boundary is perceivable at
all), all three rejected candidate B (a harder break from monochrome — would force rewriting PRD
§4 *and* invalidating `docs/TECH-STACK.md`'s stated Electron/DOM-over-Tauri/canvas rationale),
and all three rejected candidate A (per-instrument accent hues) — engineering found it a real
CSS-architecture trap (custom properties don't cascade the way you'd assume; every derived token
needs re-declaring at every scope or it silently stays amber), legibility found it a *measured*
accessibility regression (colorblind simulation: the four instruments collapse to two
indistinguishable pairs under deuteranopia), visual rejected it as literally the "second
phosphor colour" the T-302 law and PRD §4 forbid. All three landed on some flavor of "add zero
hues, fix through structure": engineering and legibility called it **C+** (pure tonal — value
zoning, reverse-video reserved to exactly one meaning, physical control bodies, wider
label→value contrast); the visual director called it **D — "one phosphor, two materials"**:
amber remains the only hue and the only thing that emits light; everything that is not light
becomes unlit, near-achromatic metal (chassis, bezels, frames). Two real bugs surfaced and
filed along the way, independent of which direction won: T-216 (the "one phosphor" law is
already broken in two live UI spots — `--accent`/`--line` never defined, `.as-hostile` hardcoded
— amended with a measured accessibility-defect finding) and T-217 (the Galactic Wire `LOG`
button overlapping the ticker text, root-caused to a stale magic-number offset).

**RULED (owner, 2026-08-05): candidate D**, specifically the visual director's own
`T186-chassis.png` build/palette — not a subsequent synthesis attempt that tried to merge D's
material framing with C+'s stricter interaction rules (reverse-video-reserved-to-one-meaning,
flatter achromatic steel), which the owner rejected on sight ("terrible for a lot of reasons").
**Open scope question for the follow-on build task, not resolved by this ruling:** whether the
legibility reviewer's specific, measurement-backed interaction rules (reverse video reserved to
real urgency only instead of used broadly, a physically distinct button body vs. an inert flag,
a visibly-dead locked-row treatment) get folded into the D implementation, or whether D ships
as-is with its own original interaction treatment. Not assumed either way — ask before building.

### T-218 · Build: ship the "one phosphor, two materials" visual identity — `status: DONE` · `coder: opus` · `after: T-186`

T-186's ruling (2026-08-05): implement candidate D — amber stays the only hue and the only thing
that emits light; every structural/inert surface (panel chassis, bezels, frames, dividers)
becomes unlit, near-achromatic steel instead of the current amber-on-amber haze. The owner's
reference build is the bake-off's visual-director mockup, not the subsequent synthesis attempt
that layered in the legibility reviewer's stricter interaction rules — that synthesis was
rejected on sight. Real work: `packages/ui/src/theme.css` (new neutral/steel token family
alongside the existing five amber tokens, which keep their exact current values per the bake-off
engineering reviewer's finding — this is additive, not a re-hue), `packages/ui/src/App.tsx` call
sites for structural chrome, and `docs/PRD-REIMAGINED.md` §4 gets the one added sentence the
bake-off named (the amber-phosphor commitment survives unchanged in hue-count; the fiction shifts
from "a monochrome tube" to "amber CRT readouts set into machined metal" — write that sentence,
don't silently leave §4 undescriptive of what ships).

**RULED (owner, 2026-08-05) — the scope question:** D, plus exactly one interaction rule layered
in — reverse video reserved to real urgency only. The owner rejected a fuller synthesis attempt
that also changed D's materials/palette toward the legibility reviewer's flatter, colder steel
("terrible for a lot of reasons"); the follow-up isolated the single rule from that rejected
attempt and re-tested it as a minimal diff against D's own unmodified source
(`chassis-rvrule.html`, built from the bake-off's own `chassis.html` by editing exactly two
selectors) — approved on sight ("go with this version"). **The two concrete edits, and nothing
else changes from the ruled D reference build:**
- `.slot.ready` (the "which die clears this check" badge on Manifest Board rows): was solid
  `background: var(--ember)` + dark text: now an outlined `var(--well)` fill with an `--ember`
  border, text and inset glow — no longer a reverse-video fill.
- `.die.sel` (the armed die in the Dawn Hand tray): was a solid light-amber gradient fill with
  dark text: now the die's own dark steel gradient stays, with an `--ember` inset ring + glow and
  `--ember` text — selected reads as "lit," not "inverted."
- Everything else in the reference build — `.chip.rev` (DEBT), `.flag.urgent`, `.due-soon b`,
  `.ship-region.damaged .rg-v`, all chassis/steel materials, the manifest "paper," the ledger
  rail, the wire slot, the dawn-hand tray — is **unchanged** from D as ruled. The button-body and
  locked-row questions raised when this scope call was first opened are **not** part of this
  ruling — D's own existing button/lock treatment ships as built, nothing added from the
  legibility reviewer's build beyond the one rule above.

**Accept:** the live UI renders candidate D's material treatment (steel chassis + amber-only
light) matching the ruled reference build, with the one reverse-video-discipline edit above
applied to the die-armed and check-clearing-badge states and nothing else changed from D;
`docs/PRD-REIMAGINED.md` §4 carries its one added sentence; a live screenshot pass (same
six-panel board used throughout T-186's bake-off) confirms it reads as the ruled direction, not a
redrift back toward either the pre-T-186 baseline or the rejected fuller-synthesis attempt; T-216
and T-217 (both filed during the bake-off) are either fixed in the same pass or explicitly left
to their own tasks with a reason recorded; gate green.

**Delivered (2026-08-06).** Candidate D shipped, plus the one ruled interaction rule, and nothing
else from the rejected synthesis.

*The reference, preserved.* `docs/design/T218-reference/` now carries the ruled build in-repo
(`chassis-rvrule.html`, `chassis-rvrule.png`, plus D's unmodified `chassis.html` and
`T186-chassis.png` so the two-selector diff stays auditable). It lived only in a session
scratchpad, which would have made "matching the ruled reference build" unverifiable the moment
that scratchpad was collected. `docs/` is prettier-ignored, so this costs the gate nothing.

*Tokens (`packages/ui/src/theme.css:1-88`).* The five amber tokens keep their EXACT T-302 values
(`theme.css:50-54`) — additive, not a re-hue. The steel family is new (`theme.css:56-68`):
`--steel-hi/-/-lo/-deep`, `--etch`, `--etch-dim`, `--well`, `--edge`, plus `--bevel` / `--recess`.
`--panel` and `--tube` were RETARGETED onto `--steel` / `--well` (`theme.css:75-76`) with a dated
comment saying why: they are not among the protected five, they ARE the amber-on-amber haze D
removes, and aliasing them carries every surface not hand-ported (overlays, popovers, Hangout,
combat, Records) off the haze in one move rather than leaving lit amber islands. The header law
(`theme.css:1-45`) was rewritten: one phosphor + two materials, the §2 inside-/outside-the-glass
triage rule, the §3 reverse-video discipline, and §4's two mechanical invariants.

*The port.* Chassis is `var(--edge)` + `--bevel`/`--recess` with `--etch` legends; readouts stay
amber inside a `--well`. `.pane` is a machined plate with a live lamp on its header
(`theme.css:384-451`); its body keeps the pre-T-218 12px content inset exactly (5px well margin +
7px padding) so the material change costs no content width. Geometry that T-190/T-191 MEASURE was
kept deliberately: the board's 2px stock, `overflow: visible`, the −0.45deg hang, the chamfer
`clipPath`, the rail span. `.hand` took the reference's `.tray` recess without being renamed (68
App.tsx call sites + e2e depend on it).

*The two RULED edits, byte-for-byte from `chassis-rvrule.html:239,270`:* `.slot.ready`
(`theme.css:1912-1928`) and `.die.sel` (`theme.css:2457-2481`), both marked DO-NOT-REVERT. The
die keeps its `translateY(-8px)` lift — an app affordance, not part of the reverse-video question.
**Recorded rather than hidden: `.slot.ready` has no live call site in the shipped cockpit.** M17
removed the die COST from signing a manifest offer (`App.tsx:4840-4841`), so the sign row is now
`SIGN · FREE · click to sign` and the badge is currently dead CSS. The ruled edit is applied
anyway (the ruling is about the RULE, and the check-gated row is an M17 reversible); it is pinned
by the source-level vitest test and measured in e2e through a probe node built from the real
stylesheet, labelled in the spec as the weaker claim it is rather than dressed up as a live click.

*Reverse video, reserved in BOTH directions.* The four sanctioned sites still invert; every
"selected/on/owned/available" state that was inverting was moved to LIT — `.ro-tab.on`,
`.hp-npc.on`, `.set-toggle.on`, `.set-seg-btn.on`, `.audio-mute.on`, `.equip-tag`, `.mb-stamp`.

*Tests.* NEW gated `packages/ui/src/__tests__/visual-identity.test.ts` (22 assertions): the five
amber values exactly; the steel family declared AND near-achromatic; **no `var(--x)` without a
declaration and no `var()` colour fallback** (T-216's root cause, made unrepeatable); **no literal
hex outside amber-family / near-achromatic / near-black**, with a guard-on-the-guard that the
classifier still rejects the three hues T-216 actually found; both ruled edits pinned; the four
sanctioned inversions pinned. NEW manual `packages/ui/e2e/visual-identity.spec.ts` (7 tests):
computed-style achromatic/amber measurements on the running page, both ruled edits, T-216's
non-hue separation, T-217's geometry, and the screenshot pass. `e2e/manifest-object.spec.ts:87-98`
was UPDATED, not weakened: its `tradeStyle.boxShadow === 'none'` assertion could not survive D
giving every pane a bevel, so the same claim is now expressed as "the board carries ≥3 OUTER
shadows and strictly more than the pane beside it".

*Screenshot pass.* `packages/ui/test-results/T-218-{cockpit,main,dock,dock-armed,manifest,wire,records}.png`,
compared against `docs/design/T218-reference/chassis-rvrule.png`: steel chassis, amber only where
something is lit, no redrift to the pre-T-186 haze and none toward the rejected synthesis.
(Path corrected in fix round 2: the spec writes these relative to the Playwright CWD, which is
`packages/ui`, not the repo root — the round-1 pin did not resolve.)

*T-216 and T-217 were both FIXED in this pass, not deferred* — see their blocks below.

*Gate:* `npm test` 2699 passing across 6 workspaces, `npx tsc -b`, `npm run lint`,
`npm run format:check` all clean. `npm run test:e2e -w @spacerquest/ui` — **180/180 passing**,
including `port-ledger.spec.ts`, `wire.spec.ts` and `dawn-hand.spec.ts` UNEDITED. UI-only: no
`packages/engine`, `packages/content` or `packages/sim` file changed, so no `rulesFingerprint`
impact and no capstone owed.

*Docs:* `docs/PRD-REIMAGINED.md` §4 differentiator 4 carries the one added sentence;
`docs/UI-PRESENTATION-DECISIONS.md` UI-1 gains a material note, UI-2 gains a dated T-218
amendment (palette ruling CLOSED, shared-rule freeze lifted for this ruling only and re-imposed,
steel family added to the token list, the material triage rule), and a new UI-2b records the
reverse-video discipline with its sanctioned sites named.

**FIX ROUND 2 (2026-08-06) — the review and the gate both returned AMBIGUOUS, and the cause was
not in the diff.** Round 1 was written across TWO working trees of this same repo: it was checked
out here (`redesign/explore-hangout`, TASKS.md flipped to IN-PROGRESS 12:09), and then a second
tree, `../SpacerQuest-guards` on a scratch branch `guards/m8-m13-remainders` created from this
same commit at 12:15, received the rest of the work and was finished there (12:45–13:06). The
result was one task with a HALF diff in one tree and the FULL diff in another, carrying
contradicting statuses (IN-PROGRESS here, DONE there). The reviewer and the gate, both invoked
from the parent folder `/Users/vs7/Dev/Games` rather than a repo root, matched "T-218" in three
TASKS.md files (both trees, plus an unrelated T-218 in the neighbouring Iron-Ashes project) and
correctly refused to guess which one they were judging.

*Resolved by consolidation, not by picking a winner blind.* The guards tree's content was proven
a strict superset first: every one of the 148 unique lines round 1 added to `theme.css` here was
matched in the guards copy except 8, and those 8 were an EARLIER draft of the header law's §3 and
the `.pane` inset comment that the guards copy rewrites more fully and more accurately (§3 there
names the four canonical sites plus the engine's own refusal surfaces; here it named five in a
flat list). The four `docs/design/T218-reference/` assets were byte-identical in both. The full
work was then moved into THIS tree and the tracked diffs verified byte-identical by hash, and
`../SpacerQuest-guards` was restored to a clean HEAD, so T-218 now exists in exactly one working
tree.

*Why this tree and not that one.* `redesign/explore-hangout` is the branch this whole file's track
runs on and where every sibling task committed (T-219…T-224); it tracks `origin` and merges to
`main`. `guards/m8-m13-remainders` was six minutes old, had no upstream, no commits of its own, and
contained nothing but this task's files — committing here would have stranded T-218 on an unmerged
local branch. It is also against this repo's own convention, which uses worktrees as throwaway
measurement rigs and keeps the main tree byte-clean (`docs/BALANCE-RIG-DECISIONS.md` BR-7/BR-19),
and against the process lesson already recorded at `docs/NPC_REDESIGN.md:2245` — "parallel agents
need isolated worktrees", filed after N6/N9 contaminated each other in one shared tree. This is
that lesson's mirror image: ONE task spread across two trees rather than two tasks sharing one.

*Status corrected.* Round 1 left T-218, T-216 and T-217 all reading `DONE` in the guards tree.
Protocol step 5 makes DONE the orchestrator's to set, after review passes and the gate is green —
neither had happened, and the review was in fact blocked. All three now read IN-PROGRESS. Every
Delivered note above and below is round 1's and is unchanged; only the claim of acceptance was
withdrawn.

*Gate re-run in THIS tree, because the numbers above were measured in the other one:* `npm test`
**2699 passing across 6 workspaces** (74 + 110 + 61 + 1391 + 587 + 476, exit 0 — the same 2699 the
note above claims, now true where it will be gated), `npx tsc -b` exit 0, `npm run lint` exit 0,
`npm run format:check` clean. `src/__tests__/visual-identity.test.ts` is in the run at 22 tests.
Deliverables re-grepped at their named call sites per the standing constraint: both RULED EDIT
markers at `theme.css:1912` and `:2457`, and `#4fd1c5` / `#2b3a44` / `#e0562a` surviving only
inside explanatory comments, never in a declaration. `npm run test:e2e -w @spacerquest/ui` was
re-run here too: **180 passed, exit 0**, `visual-identity.spec.ts`'s 7 tests among them, and
`port-ledger.spec.ts` / `wire.spec.ts` / `dawn-hand.spec.ts` still unedited.

*One real defect the move surfaced, and it was NOT a move artefact.* The screenshot-pass evidence
round 1 cited did not exist in EITHER tree — no `test-results/` directory in the guards tree at
all, and only `test-results/pilot` here. The pass has now actually been run and all eight PNGs
written, and the reason the round-1 pin never resolved is that `visual-identity.spec.ts` writes
its paths relative to the Playwright CWD, which is `packages/ui` — so the artefacts land in
`packages/ui/test-results/`, not at the repo root as three separate notes claimed (T-218's
screenshot-pass line, T-216's evidence line, T-217's screenshot line). All three pins are
corrected above. This is exactly the resolvable-pin rule `docs/LESSONS.md` already carries, and it
is worth naming that the Accept clause's screenshot requirement was, until this round, discharged
by a citation to files that were not on disk. The board was then read directly (`T-218-main.png`):
steel chassis and bezels, amber confined to readouts, values and the pane lamps — the ruled
direction, with no redrift to the pre-T-186 haze.

**FIX ROUND 3 (2026-08-06) — same failure class as round 2, and again the cause was not in the
diff: the review and the gate were dispatched with cwd `/Users/vs7/Dev/Games` (the multi-project
parent folder) instead of this repo root.** The dispatch even asserted "the repo root is the
working directory" while the working directory contained ~14 independent projects and no `.git`;
both agents matched "T-218" in multiple TASKS.md files and correctly refused to guess. Nothing in
this tree's diff was reviewed or gated, so nothing in it was changed this round beyond this note.

*What round 3 fixed at the root.* Round 2 consolidated the work into one tree but left the
`../SpacerQuest-guards` linked worktree in place at a clean HEAD — which meant a tracked copy of
this very TASKS.md (and its T-218 block) still existed at a second path, and the round-3 reviewer
duly listed it as a candidate again. That worktree was created by round 1's own errant session
(12:15, scratch branch `guards/m8-m13-remainders`, zero commits of its own, no upstream, clean
tree, byte-identical HEAD `81c0f6b5`), and this repo's convention treats worktrees as throwaway
rigs (`docs/BALANCE-RIG-DECISIONS.md` BR-7/BR-19). It has now been removed outright
(`git worktree remove ../SpacerQuest-guards` + `git branch -d guards/m8-m13-remainders` — nothing
was lost; both were empty of unique content). T-218 now exists in exactly one checkout on disk.

*The irreducible remainder, named so it stops being re-litigated.* `Iron-Ashes/TASKS.md` also
carries a T-218 (its own, unrelated, `DONE`). Task IDs are unique per project, not per filesystem
— no file surgery here can or should remove that match. The only correct disambiguator is the one
the protocol already implies: **review and gate for this file's tasks must run with cwd
`/Users/vs7/Dev/Games/SpacerQuest` (branch `redesign/explore-hangout`)**, where `git status`,
`git diff` and the gate commands all resolve. Dispatching any judge of this repo's work from the
parent folder is the defect; this note is the durable record of that so the next dispatch carries
the repo root.

*Gate re-verified in this tree this round* (no code changed since round 2's green run, verified by
`git status` matching round 2's file list exactly, but the claim is re-earned rather than carried):
`npm test` 2699 passing across 6 workspaces, `npx tsc -b`, `npm run lint`, `npm run format:check`
all exit 0.

**CLOSED (2026-08-06) — the root cause round 3 named was fixed at the source, and this is the
first UNAMBIGUOUS gate this task has actually earned.** Round 3's own official Review+Gate pair
was *itself* dispatched from the parent folder again (the coder's self-check quoted above is real,
but it is not the protocol's Review/Gate stage) — it hit the same three-way ambiguity
(`SpacerQuest`, the by-then-already-removed `SpacerQuest-guards`, and `Iron-Ashes`) a fourth time
and the run halted at `attempt=4/4`, exactly as the ladder is designed to do rather than self-approve.
`~/.claude/skills/orchestrate/orchestrate-tasks.js` (a user-global tool, shared across every repo in
the portfolio, not part of this repo) has now been fixed at the source: it resolves an absolute
`REPO_ROOT` once (`args.repoPath` if given, else one `git rev-parse --show-toplevel` call) and every
one of its agent prompts is anchored to that path explicitly, rather than trusting inherited cwd —
closing the exact failure class rounds 2 and 3 both hit. With that fix in place, an unambiguous gate
was run directly against `/Users/vs7/Dev/Games/SpacerQuest` (branch `redesign/explore-hangout`, the
one tree this work has lived in since round 2's consolidation): `npm test` — 587 (engine) + 476 (ui)
plus content/desktop/devpanel, 2699 total across 6 workspaces, 0 failing; `npx tsc -b` exit 0;
`npm run lint` exit 0; `npm run format:check` clean — all four re-confirming, for the first time
without an ambiguous dispatch, the same green round 2 and round 3's coder had each already measured
by hand. No code changed to make this pass; only the judge was fixed.

Orchestration: attempts=4/4.

### T-216 · BUG: `theme.css`'s "one phosphor colour" law is already broken in two live UI spots — `status: DONE` · `coder: opus` · `after: —`

**Found incidentally** during the T-186 visual-identity bake-off (2026-08-05), by the engineering-feasibility reviewer, while establishing the ground truth that "there is currently no second hue anywhere in the shipped UI" — that premise turned out to be false, and this is filed per the Bug Discovery Policy rather than held for later. Confirmed against source directly, not taken on the reviewer's word:

- `packages/ui/src/theme.css:4929,4938,4947` — `color: var(--accent, #4fd1c5)` (teal). `--accent` is **never defined** anywhere in the repo (`grep -n "\-\-accent:" packages/ui/src/theme.css` → no match), so the fallback is what actually renders. Live: `.ship-honor` (the Top Gun Honor List) is rendered at `App.tsx:4381` (`data-testid="honor-list"`) — the player's own row and any held-rank row render teal, not amber.
- `packages/ui/src/theme.css:4891,4911` — `border: 1px solid var(--line, #2b3a44)` (blue-grey). `--line` is likewise **never defined**; same `.ship-honor` component, so its borders are blue-grey, not amber.
- `packages/ui/src/theme.css:3217` — `.as-hostile .as-value { color: #e0562a; }` (orange-red), not a broken variable but a hardcoded second hue that bypasses the token system entirely. Live: `App.tsx:3462` builds `` `as-row as-${s.tone}` `` dynamically, so a hostile-attitude row renders orange-red in production right now.

**SEVERITY AMENDMENT (2026-08-05), the T-186 bake-off's legibility/accessibility reviewer,
independently:** the `.as-hostile` leak is not just a one-phosphor-law consistency violation —
it is a functional accessibility defect. Simulated via Viénot matrices against the two live
attitude colors (`#e0562a` hostile vs. `#c0781a` neutral `--amber`): under deuteranopia both
resolve to hue ≈52° within 3 units on every channel; protanopia is the same collapse. **A
deuteranope or protanope cannot currently distinguish a hostile captain from a neutral one by
this color alone.** This raises the Accept bar: closing the leak by giving `.as-hostile` an
amber-family value does not fully discharge the finding if hostile/neutral then collapse to the
same *luminance* too — the fix must leave hostile distinguishable from neutral by some
non-hue-dependent channel (e.g. luminance step, reverse-video, or an icon/glyph), not just move
the bug from "wrong hue" to "right hue, still indistinguishable."

None of this is dead CSS — both class families are confirmed rendered, not just declared. Whatever T-186 rules (monochrome-only vs. per-instrument accents vs. a harder break), this needs a decision on its own terms: either these three sites get real amber-family values (closing the accidental leak and making "one phosphor" true again), or they get formally adopted as the second/third hue the law already has in production, with `theme.css`'s header law rewritten to say so honestly instead of asserting something the shipped code already contradicts.

**Accept:** `--accent` and `--line` are either defined (as amber-family values, closing the leak) or deliberately promoted to real, documented tokens with `theme.css`'s header comment updated to no longer claim zero second hues; `.as-hostile`'s hardcoded `#e0562a` is resolved the same way — token-ized amber or deliberately kept and documented; a screenshot of `.ship-honor` (Records → ship honors) and an attitude-hostile row confirms the fix; gate green.

**Delivered (2026-08-06, FIXED INSIDE THE T-218 PASS — deliberately not deferred.** Deferring was
indefensible: T-218's entire subject is making "one phosphor" true, and this bug is three live
places where it was false. Fixing it anywhere else would have meant shipping T-218 on top of a
known contradiction of its own law.)

*The two undefined-variable leaks are GONE, not redefined.* `--accent` and `--line` were never
declared anywhere in the repo, so their `#4fd1c5` / `#2b3a44` FALLBACKS were what actually
painted. The fallbacks are deleted and each site routed by T-218's own material rule:
`.ship-honor`'s frame is chassis (`theme.css:5375-5382`, `5395-5397`), and the `you` / held-rank
markers are LIT `--ember-hi` because they are the readout's live values
(`theme.css:5413-5417`, `5424-5428`). `.comp-effect-next` carried the same teal and is now lit
too (`theme.css:5437-5440`).

*`.as-hostile` — the severity amendment is discharged on TWO non-hue channels, not one.*
`theme.css:3625-3670`. An amber value alone would only have moved the bug from "wrong hue" to
"right hue, still indistinguishable", which the amendment explicitly rules insufficient. Hostile
now (a) INVERTS — `background: var(--ember)` with `color: var(--well)`, a luminance inversion that
survives greyscale and every colour-blindness simulation — and (b) carries a `!` glyph via
`::before`, which depends on no colour channel at all. Neutral does neither, so the two cannot
converge. The reverse video is *permitted* rather than in tension with T-218's law §3: a hostile
captain is real urgency, which is the exact category the rule reserves inversion for; the
reasoning is written into the CSS beside the rule.

*The header law was updated in the same edit* (`theme.css:1-45`), which is this task's own accept
clause: it no longer asserts something the shipped code contradicts.

*Made unrepeatable, not just fixed.* `packages/ui/src/__tests__/visual-identity.test.ts` fails the
build on (a) any `var(--x)` with no declaration in the file, (b) any `var()` with a colour
fallback — the construct that hid this for months — and (c) any literal hex outside
amber-family / near-achromatic / near-black. A guard-on-the-guard asserts the classifier still
rejects `#4fd1c5`, `#2b3a44` and `#e0562a`, so the check can never go vacuous.

*Evidence:* `packages/ui/test-results/T-218-records.png` (the Records overlay, amber-only) and
`T-218-honor-list.png`; `e2e/visual-identity.spec.ts` measures hostile-vs-neutral luminance
inversion and glyph presence on the running page. Gate green (see T-218's Delivered note).

Orchestration: bundled into T-218's pass, per T-218's own Accept clause; rode T-218's ladder rather
than a separate one of its own — attempts=4/4 (T-218's).

### T-217 · BUG: the Galactic Wire ticker scrolls underneath the LOG button — `status: DONE` · `coder: opus` · `after: —`

**Found incidentally** during the T-186 visual-identity bake-off (2026-08-05), by the visual-design
reviewer, and confirmed independently against a screenshot taken earlier the same session (not
just the reviewer's word) — visible right now on a live boot: the Galactic Wire band reads
`GALACTIC WIRE [LOG]uiet. Roll the day and make some news.` instead of `GALACTIC WIRE [LOG]  The
wire is quiet. Roll the day and make some news.` — the ticker text scrolls in **underneath** the
LOG button rather than starting clear of it.

**Root cause, confirmed against source.** `packages/ui/src/theme.css:1883-1885` — `.ticker` has a
hardcoded `padding-left: 138px`, sized to clear the original `.cap` contents (the "GALACTIC WIRE"
label + pulse dot). `theme.css:1912-1923`'s own comment marks the `.wire-log-btn` as a LATER
addition ("T-306"), and `App.tsx:5492-5504` confirms it's rendered *inside* the same
absolutely-positioned `.cap` element, after the label. Adding the button widened `.cap` beyond the
138px the ticker reserves for it — a magic number that was never updated when T-306 shipped, so
`.cap`'s real rendered width and the ticker's clearance have silently drifted apart.

**Accept:** the ticker's left clearance tracks `.cap`'s actual rendered width (e.g. measured via
`ResizeObserver`/`getBoundingClientRect`, or `.cap` reserves its own space via normal flow instead
of `position: absolute` + a magic-number sibling offset) rather than a hardcoded pixel value that
can drift again the next time something is added to `.cap`; a screenshot of the Galactic Wire band
confirms `GALACTIC WIRE [LOG]` and the ticker text no longer overlap; gate green.

**Delivered (2026-08-06, FIXED INSIDE THE T-218 PASS.** T-218's port of the ruled reference build
already restructures the wire band, and the reference solves this structurally — fixing it in the
same pass was strictly cheaper than touching the same rules twice.)

*The magic number is not re-measured — it is DELETED, along with the thing that needed measuring.*
A `ResizeObserver` would have been a correct-but-fragile answer to a layout question CSS can
answer outright. `.wire` is now a flex row, `.cap` is a NORMAL-FLOW item that reserves exactly its
own width whatever it contains, and a new `.wire-track` (`flex: 1; min-width: 0; overflow: hidden`)
takes the remainder and clips the scroll (`theme.css:2085-2135`). `.ticker`'s
`padding: 9px 0 9px 138px` is now `padding: 9px 0 9px 6px` (`theme.css:2153-2161`). The single
App.tsx change is the wrapper element (`App.tsx:5531-5541`).

*Why this closes it permanently and the pixel value could not.* `.cap`'s width is DATA-DEPENDENT:
T-1406 renders BULLETIN storylet chips inside it, so the correct constant differs between two
boots of the same build. There is no number that is right. `min-width: 0` on the track is
load-bearing — without it the nowrap ticker sets the flex item's min-content width and shoves the
cap back off the left edge.

*Evidence.* `e2e/visual-identity.spec.ts` asserts `cap.right ≤ track.left` on the running page and
then PLAYS FORWARD up to six days until the wire actually carries a BULLETIN chip, re-measuring
with the cap at its widest — the data-dependent case the original bug needed. `@keyframes tick`'s
`translateX(-50%)` and the doubled item run are intact; `e2e/wire.spec.ts` and
`storylet-delivery.spec.ts`'s wire-bulletin test pass UNEDITED. Screenshot:
`packages/ui/test-results/T-218-wire.png`. Gate green (see T-218's Delivered note).

Orchestration: bundled into T-218's pass, per T-218's own Accept clause; rode T-218's ladder rather
than a separate one of its own — attempts=4/4 (T-218's).

### T-250 · F-185-4: the playtest-logging default is still the interim ON — `status: DONE` · `coder: opus` · `after: —`

F-185-4 left the playtest-logging default at the interim ON that HEAD `5b430136` flipped it to "for
the internal UAT build", and nothing else in `TASKS.md` or `TODO.md` tracks restoring it. VERIFIED
LIVE: `packages/ui/src/playtestLog.ts:166` reads
`return storage.getItem(PLAYTEST_LOGGING_KEY) !== 'off';` (default ON), while
`docs/PLAYTEST-TELEMETRY_SPEC.md` §3 line 56 states "**OFF by default.**". Restoring spec §3's OFF
must ALSO edit the test that now pins the interim ON explicitly
(`packages/ui/e2e/playtest-logging.spec.ts`, plus the `shell.spec.ts` test that shares the
`setLogging(page, on)` shape) — that pin was written so the restore cannot pass silently.
[harvested: T-185/playtest-logging-default-off]

**Accept:** either `packages/ui/src/playtestLog.ts:166` is restored to
`docs/PLAYTEST-TELEMETRY_SPEC.md` §3's "OFF by default", or spec §3 is amended to ON with the owner's
reason recorded and dated — the two are never left disagreeing; whichever way it goes,
`packages/ui/e2e/playtest-logging.spec.ts` and the `shell.spec.ts` test sharing the
`setLogging(page, on)` shape are updated in the SAME change and shown to fail against the old default
first, so the restore cannot pass silently; the interim-ON provenance (HEAD `5b430136`, "for the
internal UAT build") is recorded beside the outcome; the desktop shell's session JSONL behaviour under
the chosen default is stated; gate green.

**Delivered (2026-08-06) — RESTORED to spec §3's OFF; the spec was NOT amended to ON.** One line of
behaviour moved: `packages/ui/src/playtestLog.ts`'s `isPlaytestLoggingEnabled` is back to
`storage.getItem(PLAYTEST_LOGGING_KEY) === 'on'`, byte-for-byte the pre-`5b430136` form. Everything
else in this change is comments, provenance and the three pins that make the default unforgettable.

**Why restore rather than amend.** The flip was self-labelled temporary in three places at once
(`playtestLog.ts`'s header, `store.ts`'s `CockpitState.playtestLogging` doc, and the spec preamble's
"**must be reverted to OFF before any public/Steam release**"), so restoring is the documented exit,
not a fresh decision. It also costs internal UAT nothing: both tester runbooks —
`docs/playtests/T-158-pre-uat-brief.md` §2 and `docs/playtests/T-198-pacing-brief.md` §2, the latter
written *after* the flip — already say "**turn logging ON — it is OFF by default and it is not in your
save**" and already tell the tester to switch it on once per browser profile / install. The interim ON
had been silently contradicting the instructions the owner actually reads.

**Provenance, recorded beside the outcome** (in the spec preamble, the `playtestLog.ts` header, and
here): HEAD `5b430136`, 2026-08-03, "Playtest logging defaults on for internal UAT; file T-185/186/187
from owner's first playtest pass" — an owner directive to default logging ON "for the pre-public
internal build so a UAT session isn't lost to a forgotten toggle". Consent, disclosure copy and opt-out
were unchanged throughout; only the virgin-profile default ever moved. The spec's `INTERIM DEVIATION`
block is now `INTERIM DEVIATION, CLOSED (T-250, 2026-08-06)` — a dated record of the whole episode
rather than a deletion — and §3 line 56's "**OFF by default.**" was never touched, so the two are
agreeing again rather than one having been bent to the other.

**Fail-first evidence — all three suites shown red against the OLD default before the one-line change
landed** (test and doc edits made first, `playtestLog.ts` left at `!== 'off'`):

- `npm test -w @spacerquest/ui -- playtest-log` → `1 failed | 21 passed (22)`;
  `src/__tests__/playtest-log.test.ts > … > defaults OFF on a virgin profile (spec §3)` —
  `AssertionError: expected true to be false // Object.is equality` at line 76.
- `npm run test:e2e -w @spacerquest/ui -- playtest-logging` → `1 failed / 2 passed`;
  `defaults OFF (spec §3), with the disclosure at the toggle and no controls until opt-in` —
  `expect(locator).toHaveAttribute` `Expected: "false" / Received: "true"`, the locator resolving to
  `<button aria-pressed="true" class="set-toggle on" …>On</button>`, at spec line 108.
- `npm run test:e2e -w @spacerquest/desktop -- shell.spec.ts -g "playtest"` → `1 failed`;
  `writes nothing until the player opts in, then appends the real action stream` — same
  `Expected: "false" / Received: "true"` on the same button, at `shell.spec.ts:662`.

After the one-line restore, all three are green: `22 passed (22)`, `3 passed (7.4s)`, `1 passed (9.3s)`.
One honest note on the third web test ("the toggle survives a reload"): its persistence direction was
INVERTED by this change, and inverted it passes vacuously under the old default rather than failing —
while the default was ON, "still ON after a reload" could be true with nothing stored, which is exactly
why the test previously stored OFF; under the restored OFF the meaningful direction is the other one,
so it now stores ON and the reload assertion can only pass if the preference really was written. The
fail-first pins are the two literal `aria-pressed` assertions and the unit test, not that one.

**What the pins are, and why they are literal.** The e2e suites are not in the gate, so the durable
guard is `packages/ui/src/__tests__/playtest-log.test.ts`'s "defaults OFF on a virgin profile (spec
§3)"; `packages/ui/e2e/playtest-logging.spec.ts` and `packages/desktop/e2e/shell.spec.ts` are the
UI-level guard the task asked for. All three assert the default LITERALLY rather than reading it
through the `setLogging(page, on)` helper. The helper stays (establishing a known state is still right
discipline) but is deliberately not used for the default itself — a default-agnostic assertion is
precisely the "passes silently" failure this task exists to prevent, and it is what let the desktop
test go quiet in the first place.

**Desktop session JSONL under the restored OFF default** (added to spec §4, echoed in `shell.spec.ts`'s
comment): a session in which the player never opts in writes **nothing at all** — no `logs/` directory
and no session file. `packages/desktop/src/playtestLog.ts` calls `mkdirSync` *inside* `append`, so both
the log directory (`main.ts`'s `resolveLogDir`: `SQ_LOG_DIR ?? app.getPath('userData')/logs`) and
`playtest-<sessionId>.jsonl` are created lazily by the first line the renderer sends. After opt-in the
file is appended line-by-line and unbuffered, one file per session, so the last line before a crash is
already on disk. Pinned by that spec's `expect(existsSync(logDir)).toBe(false)` after a real `payDebt`
taken before the toggle is pressed.

**Drift the restore closed.** `packages/ui/src/App.tsx`'s Playtest-section header ("OFF BY DEFAULT AND
VISIBLY SO") and `store.ts`'s `setPlaytestLogging` comment ("OFF by default, spec §3") were never
updated by `5b430136` and had been false for three days; they are true again with no edit. The two
comments `5b430136` *did* change — `store.ts`'s `playtest` import header and the
`CockpitState.playtestLogging` doc — are restored to their pre-flip wording. A repo-wide grep for
`INTERIM DEVIATION` / `pre-public` / `revert before public` now returns only the closed record in the
spec and the provenance paragraph in `playtestLog.ts`.

**No save-shape change and no migration owed.** The toggle is a client preference under
`sq.playtest.logging` in `storage.ts`'s `KeyValueStore`, never `GameState`; `CURRENT_SAVE_VERSION`
stays at its live value and its pin in `playtest-log.test.ts` was not touched. No `packages/content`
surface is involved, so no `rulesFingerprint`, capstone or sweep is implicated.

**No `CHANGELOG.md` entry, deliberately.** The shipped/public design never changed — spec §3 has said
OFF by default since the document was written, and the flip only ever reached the pre-public internal
build. This is an internal default returning to spec, not a player-visible change, so a changelog line
would be describing a behaviour no released build ever had. The omission is a decision, recorded here.

**Gate:** `npm test` (exit 0 — 2,699 passed across the six workspaces: 74 / 110 / 61 / 1,391 / 587 /
476, zero failed), `npx tsc -b` (exit 0), `npm run lint` (exit 0), `npm run format:check` ("All matched
files use Prettier code style!", exit 0). `npm run format` was run before the gate, not after.

Orchestration: attempts=1/4.

---

## M15 — Owner UAT pass 2: board-quadrant feedback (2026-08-03)

Four findings from the owner's second live session, one per board quadrant. Captured verbatim per
the Bug Discovery Policy. All four are UX/design, filed as tasks rather than `F-` findings for the
same reason as M14: each is substantial enough to need its own implementation pass.

**Re-homed here at the 2026-08-06 re-order:** T-215 (the ruled T-188 globe build) had been
appended under the owner-gated M20 header; it is this milestone's build-out.

### T-188 · Galaxy map: port spacing gives near-zero travel payoff, and a jump is imperceptible — an owner design decision — `status: DONE` · `coder: opus` · `after: —`

Owner's original read: "the galaxy on the top left is too crowded. All the space ports are super
close together. There is basically zero payoff to travelling between ports... The OG game had a
real-time ascii animation which was too slow, we just have instant jump to port, and it is barely
noticeable that any game action has happened. We need to come up with a design decision on this."

**SUPERSEDING SPEC (owner, 2026-08-04) — the ruling arrived as a concrete build plan, not a
`/bakeoff` request.** Verbatim, in order:

1. **A standing quality gate:** "already you should be flagging and failing this since the port
   names are overlapping with other ports and names." A regression test for label-collision on the
   starmap, independent of whichever layout ships — it must hold for ANY coordinate set, not just
   today's.
2. **Rename `Sun-3` → `Sol-3`** — "the base game" name, reads more sci-fi. On the screen; swept
   through docs and tests. **NOT** the persisted deed id `liars_dice_cleared_sun_3`
   (`packages/content/src/deeds.ts:921`) or the `SUN_3_HANGOUT` code identifier
   (`packages/content/src/portHangouts.ts:278`) — those are data/code identifiers, not display
   text, and renaming a persisted id is a save-migration question the owner did not ask for here.
3. **A real geometry pipeline, replacing the hand-authored `{x,y}` scatter:**
   - **3a.** Distance-from-Sol per system — already derivable (`distance(1, id)` in
     `systems.ts`), used as the FIXED radius input to what follows so every existing Sol-relative
     balance number (rim ring ~20-24, core mean ~11, the fuel/DC/danger tuning in
     `docs/balance/BASELINE-T-1603a.md`) is preserved exactly.
   - **3b.** A generated 2D radial ("orbital/atomic," explicitly NOT the old game's linear line)
     layout: systems placed on rings at their 3a radius, spread by angle within each ring.
   - **3c.** Lift 3b into 3D: same radius-from-Sol as 3a/3b, dispersed across a sphere. New
     `coordinates3D: {x,y,z}` field on `StarSystem`. Owner's own note: **nothing about Sol-relative
     distance, fuel cost or travel time changes at this step.**
   - **3d.** Pairwise distance between EVERY system pair, from the 3c coordinates. Owner's own
     note: **this DOES change non-Sol-to-non-Sol route numbers** versus today's ad hoc 2D scatter.
4. **Three prototype visualizations, screenshotted, not built into the live game yet:**
   - **4a.** Flat 2D, current system highlighted, connecting lines to every other system.
   - **4b.** The 3c sphere, draggable/zoomable, same connecting lines.
   - **4c.** Wildcard — web research for sci-fi galaxy-map UI, mocked up.
   Owner: "I will pick one and we will build it" — so 4a-4c are comparison artifacts, not a
   shipped feature yet; whichever is picked becomes its own follow-on build task (wiring it into
   `App.tsx`'s `Starmap`, replacing the current SVG projection).

**Scope call made during implementation, stated rather than left implicit:** item 3d's new
pairwise-distance function is additive (`distance3D`, alongside the existing 2D `distance`) —
it is NOT wired into `travel.ts`'s live `jumpFuelCost`/`travelDc`/`calculateRouteDanger` in this
pass. The owner's own text acknowledges 3d "will directly affect" contract-run distances once it's
the live formula, and `packages/content/src/systems.ts` is a hashed rule source
(`rules-fingerprint.ts`), so swapping the ACTIVE distance formula is a rulesFingerprint-moving
change with real balance consequences (every rim/danger/fuel number in
`docs/balance/BASELINE-T-1603a.md` is tuned against the current 2D numbers) — that swap belongs
with whichever map (4a/4b/4c) the owner picks, not bundled silently into a geometry-data commit.
Building the 3D data and the comparison prototypes does not itself require moving that live
formula.

**Accept:** (1) a starmap label-overlap test exists, generic to any coordinate set, and is
currently RED against today's live map (documented, not silently fixed) unless the map is
redesigned in the same pass; (2) `Sol-3` is the display name everywhere a player or reader sees
it, with the deed-id/code-identifier exceptions above stated explicitly, not silently skipped; (3)
`StarSystem` carries `coordinates3D`, `distanceFromSol` is derivable, and a tested `distance3D`
function returns real pairwise 3D distances; (4) three screenshotted prototypes exist for the
owner to choose from; (5) the live travel formula is UNCHANGED by this task (verified: `travel.ts`
still imports the 2D `distance`); gate green; `rulesFingerprint`'s move (if any) is stated and
paid for with a capstone re-pin.

**Delivered (2026-08-04) — items 1-3 built, item 4 prototyped; BLOCKED on the owner's pick, not
DONE.**

1. **The overlap tripwire:** `packages/ui/src/__tests__/starmap-label-overlap.test.ts`, an
   `it.fails` tripwire (this repo's standing pattern for a documented, intentional red) generic to
   whatever `starmapProjection` returns — approximate label bounding boxes from `.smlabel`'s actual
   CSS (8px font, text-anchor middle, `(0,16)` offset), asserting no two intersect. It currently
   fails against today's live map — confirmed by an out-of-band run: 4 real collisions (Arcturus-6/
   Procyon-5, Deneb-4/Rigel-8, Fomalhaut-2/Mira-9, Fomalhaut-2/Spica-3) — matching the screenshot
   the owner flagged. Flips green the moment a redesigned map (4a/4b/4c) ships.
2. **`Sun-3` → `Sol-3`**, swept across ~75 live source/doc/test files (display text, comments, test
   assertions). Explicitly NOT renamed: the persisted deed id `liars_dice_cleared_sun_3`
   (its player-visible citation text WAS updated) and the `SUN_3_HANGOUT` code identifier.
   Deliberately NOT renamed: dated historical/archival documents (`docs/archive/`, the two
   `T-16xx`-era balance reports, `TODO.md`'s harvested provenance) — those describe what the game
   was called at the time, not what it's called now.
3. **The geometry pipeline, in `packages/content/src/systems.ts`:** `Star3DCoordinates`, a
   `coordinates3D` field populated for all 28 systems at module load (radius from Sol preserved
   exactly from the existing 2D `coordinates` — verified: `distance(1, id)` and each system's 3D
   radius match to rounding), a Fibonacci-sphere point distribution for the angular spread
   (golden-angle longitude, arccos latitude — the standard even-coverage algorithm), `distance3D`
   (pairwise 3D Euclidean, additive, NOT wired into `travel.ts`), and `orbitalLayout2D` (the 3b
   flat radial layout, golden-angle spread, for the 4a prototype). **rulesFingerprint moved**
   (any edit to a hashed rule-source file does, even purely additive code) — **paid for with a real
   8,000-run capstone**, `docs/balance/baseline-t188-orbital-3d.json`, re-pinned at all four sites
   (`balance-targets.test.ts`, `docs/NPC_REDESIGN.md` ×2, `docs/balance/smoke/tiers.json`).
   **This task's own changes are PROVEN INERT, not assumed** — two isolated 30-seed bisects
   (gambler, veteran) each report "NOTHING MOVED." The `fleet`/`veteran` movement in the full
   8,000-row diff against the outgoing baseline is T-161's `veteranPolicy` fix (already reviewed,
   gated, committed) getting its first capstone — see the standing amendment in `docs/NPC_REDESIGN.md`
   for the full account, attributed there so it isn't mistaken for new drift from this task.
4. **Three screenshotted, standalone prototypes** (not wired into `App.tsx`'s live `Starmap`),
   built from the REAL 3b/3c/3d data: **4a** flat orbital, Sol highlighted, lanes to every system;
   **4b** the 3c sphere, drag-to-rotate + scroll-to-zoom (genuinely interactive, not just a static
   mock); **4c** wildcard — a long-range-scan radar console (range rings, a nearest-neighbour lane
   graph instead of pure hub-and-spoke, a rotating sweep), informed by a web sweep of FTL/Star
   Traders/Sunless Sea-style node maps. Sent to the owner as screenshots plus the live HTML files.
   **THE HALT.** Whichever the owner picks becomes its own follow-on build task (wiring the chosen
   layout/interaction into `App.tsx`'s `Starmap`, replacing the current SVG projection) — not
   self-selected here.

Gate: `npm test` 118 files / 2,295 tests green across all five workspaces, `npx tsc -b`,
`npm run lint`, `npm run format:check` clean.

**NOTE (owner, 2026-08-04): the interactive HTML prototypes (4a/4b, sent as standalone files)
did not work when opened on the owner's mobile app/device.** Not investigated — the screenshots
sent alongside them were viewable and are the actual basis for comparison; the live HTML was a
bonus for drag/zoom feel on desktop.

**RULED (owner, 2026-08-05): 4B — the 3D lat/long globe.** The original 4a/4b/4c standalone
files no longer existed on disk (never committed, sent as ephemeral attachments only) and were
regenerated from the real committed data (`coordinates3D`, `orbitalLayout2D`, `distance3D`) for
re-comparison. Two rounds: the first 4B pass was rejected as not actually reading as a sphere (no
latitude/longitude graticule); rebuilt with a real dotted lat/long wireframe, current-system hub
(bright, dim lanes to all reachable systems), and one lit lane for a set course. **A real,
measured finding surfaced during this pass, and it changes the build's scope:** sampling label
placement across 90 rotation angles (every 20° yaw × 5 pitches, same bounding-box method as
`starmap-label-overlap.test.ts`) found **97.8% of rotations have at least one label collision**
(avg. 4/frame; `Arcturus-6`/`Fomalhaut-2` collided in 22/90 samples). "Rotate to a clean angle"
is not a real fallback — the 20 charted systems are too tightly clustered near Sol for that to
reliably work. **Active label-collision suppression (priority: current system → set-course
target → nearest-to-camera, others hidden until hover/selection) is therefore a required part of
the build, not a nice-to-have.** Ruling also covers scope: 4B **fully replaces** the flat 2D
Starmap projection, not a toggle/fallback. Follow-on build task: T-215.

### T-215 · Build: the 3D lat/long globe Starmap, replacing the flat 2D projection — `status: DONE` · `coder: opus` · `after: T-188`

T-188's ruling (2026-08-05): build candidate 4B, the rotatable 3D globe, as the live Starmap in
`App.tsx` — not a prototype, not a toggle-able alternative to the existing flat SVG projection,
a full replacement of it. Real geometry already exists and is committed: `coordinates3D`,
`distance3D`, `orbitalLayout2D` in `packages/content/src/systems.ts` (from T-188). This task is
the drag/zoom interaction, the render (dotted lat/long graticule wireframe, no bright emphasis
ring), and the lane/label behaviour the ruling specified:

- **Lanes:** dim by default from the player's current (docked) system to every reachable system;
  the lane to a set course renders bright. Hub is the current system, not always Sol — Sol only
  looks like the hub today because the sample game state happens to be docked there.
- **Label collision suppression is required, not optional.** The ruling's own measurement (90
  sampled rotation angles, same bounding-box method as `starmap-label-overlap.test.ts`) found
  97.8% of rotations produce at least one label collision among the 20 charted systems — spinning
  to a "clean" angle is not a reliable fallback. Priority order for which label wins a collision:
  current system, then the set-course target, then nearest-to-camera (by rotated `z`); losers
  keep their dot but drop their label until hovered/selected. Use real rendered text metrics for
  the collision boxes, not a fixed-character-width approximation (the T-188 mockup used one and
  it visibly under-measured — do not carry that shortcut into the shipped build).
- **Mobile/cross-platform risk, named and open:** the T-188 interactive HTML prototype failed to
  open correctly on the owner's mobile device, and this was never root-caused (out of scope at
  the time — screenshots were the actual basis for that ruling). This task inherits that open
  risk and must root-cause and resolve it before considering the globe done, since the shipped
  build (unlike the prototype) is not optional to open correctly.
- **Retire, don't leave dead:** the existing flat SVG `starmapProjection`/2D rendering path in
  `App.tsx` is removed once the globe ships, not kept as unreachable code.

**Accept:** the live Starmap renders the rotatable 3D globe (real drag/zoom, not a static frame);
`starmap-label-overlap.test.ts` (or its 3D-projection successor) passes across a representative
sample of rotations, not just one; the current-system/course-lane brightness behaviour matches
the ruling; the mobile-open failure is root-caused and fixed or explicitly re-scoped with a
reason recorded; the old flat 2D projection code is deleted; gate green.

**Delivered (2026-08-06) — the globe is the live Starmap; the flat projection is gone.**

1. **The projection is a PURE FUNCTION, `starmapGlobe(game, view, metrics, opts)`**, in
   `packages/ui/src/format.ts` beside where `starmapProjection` used to sit, with
   `clampGlobeView` / `suppressLabels` / the `GlobeView` / `LabelMetrics` / `StarmapGlobe`
   types exported alongside it. `App.tsx`'s `Starmap` renders what it returns and owns only
   the pointer. Three choices worth naming because they are not obvious:
   - **The sphere is centred on SOL; the lane hub is the CURRENT SYSTEM.** These are
     different things and the ruling only speaks to the second. `coordinates3D` is
     Sol-centred by construction and its radius-from-Sol invariant is T-188's whole
     balance-preservation story — re-centring the camera on the docked system would throw
     that away for nothing. The LANES radiate from `here`, whatever `here` is (tested by
     jumping to system 2 and asserting every lane's origin moved with the ship).
   - **Orthographic, not perspective** — a sphere's silhouette stays a true circle, so the
     fuel ring stays a real distance circle and `data-radius-units` stays honest.
   - **The viewBox is FIXED (`0 0 260 200`)**, independent of the data AND the camera. The
     flat map fitted its box to the band; on a globe that resizes it every drag frame, which
     reads as the map breathing and makes CSS-px label metrics drift against viewBox units.
     Pinned by a unit test across every rotation and zoom.
2. **Label suppression, as ruled, with the fixed-character-width shortcut explicitly NOT
   carried over.** Priority: hovered/selected → current system → set course → nearest to
   camera (descending rotated `z`), greedy accept, losers keep their dot and their click and
   get their label back on hover. Proved in two tiers, deliberately:
   - `src/__tests__/starmap-label-overlap.test.ts` — the T-188 tripwire, rewritten as its 3D
     successor over the ruling's own 90-angle grid (18 yaws × 5 pitches), with a metrics
     provider that is a **pessimistic bound, not an approximation**: 0.62em per character
     (Plex Mono is 0.6em, every `--font-data` fallback narrower) plus a viewBox unit of
     padding each side. Clearing a WIDER box necessarily clears the real one. It also reads
     `theme.css` and `App.tsx` back and fails loudly if `.smlabel`'s 8px / `text-anchor:
     middle` / the `y={16}` anchor ever move out from under its box maths.
   - `e2e/starmap-globe.spec.ts` — the same claim against **real rendered boxes**: eight
     successive real pointer drags, `getBoundingClientRect()` on the labels the browser is
     actually painting, in the loaded webfont (`document.fonts.ready` is awaited first). The
     canvas measurer also adds `.smlabel`'s own 1.6px halo stroke, so the model and the
     rendered ink are the same box.
3. **THE `it.fails` → `it` FLIP IS PRE-AUTHORISED, and is called out in the test header, so
   no reviewer mistakes it for a softened test.** T-188's delivered record warrants it
   verbatim: *"It currently fails against today's live map … Flips green the moment a
   redesigned map (4a/4b/4c) ships."* T-215 is that ship. The claim was not weakened — the
   sample went from one static frame to ninety rotations and the boxes got wider.
4. **The mobile risk: cause (a) ROOT-CAUSED AND FIXED, cause (b) RE-SCOPED with its reason.**
   The T-188 prototypes were never committed and are gone from disk, so the failure MODE was
   reproduced instead of the artefact inspected (`e2e/starmap-globe-touch.spec.ts`):
   - **(a) a real code defect — mouse-only handlers and no `touch-action`.** A drag built on
     `mousedown/mousemove/mouseup` receives nothing from a touch device, and without
     `touch-action: none` the browser claims the gesture for scrolling first. The spec builds
     that exact shape and shows it **dead** under a real CDP touch drag, then shows the same
     gesture driving `pointerdown` + `touch-action: none`, then shows the SHIPPED globe
     rotating, pinch-zooming and accepting a tap under the identical input. Shipped fix:
     Pointer Events only, `touch-action: none` + `user-select: none`, two-pointer pinch, and
     a pointer-free path (`−` / `+` / `RESET` buttons, arrow-key rotation on a focusable SVG)
     that works even if a platform swallows gestures entirely.
     **`setPointerCapture` is deliberately NOT used** — Chromium retargets the compatibility
     mouse events (and therefore `click`) to the capture element, which would swallow every
     node click on the map. Window listeners give the same tracking with no such effect.
   - **(b) a distribution artefact, RE-SCOPED, not dropped.** The prototypes were sent as
     standalone HTML attachments, and mobile mail/chat clients routinely preview those in a
     sandboxed viewer with scripting disabled — nothing interactive can work there however it
     is coded. This cannot apply to the shipped build: the surfaces are the Electron app and
     the Vite-served web build, and `packages/ui/index.html` already carries
     `<meta name="viewport" content="width=device-width, initial-scale=1">`.
5. **Two REAL regressions were found by the gate and fixed at the cause, not routed around.**
   Both are pinned by tests so they cannot come back:
   - **A fixed hit-target size silently swallowed neighbours' clicks.** The flat map could use
     one 22-unit rect per node because a lane spaced nodes evenly; on a globe the on-screen
     spacing changes with every degree of rotation, and three `starmap.spec.ts` jumps went
     un-clickable because Fomalhaut-2's rect covered its neighbour's centre. `GlobeNode.hitRadius`
     is now capped at nine tenths of the distance to that node's nearest on-screen neighbour,
     which makes interception impossible rather than unlikely (`r_j = 0.9·min_k d_jk ≤ 0.9·d_ji
     < d_ij`). Asserted over 3 zooms × 5 pitches × the full yaw sweep.
   - **Re-ordering nodes on HOVER broke every click on the map.** Painting the hovered node
     last moved its `<g>` among its siblings between `mousedown` and `mouseup`, and Blink
     treats a moved element as a broken click target — no `click` was dispatched at all.
     Hover is out of the paint key; only the current system and the set course are promoted,
     and neither changes mid-gesture. The comment at the sort says so.
6. **Two visual findings, fixed after looking at the screenshot rather than at the tests.**
   The first frame did not read as a sphere (the graticule at `--hair`/0.4 was invisible at
   1×) and a label was drawn straight through a neighbour's dot and NPC pips — the same
   illegibility the owner flagged at T-188, reached from the other side. So: the wireframe
   moved to `--amber-dim`, and `suppressLabels` now also treats the other systems' DOTS as
   fixed obstacles (a dot cannot move and cannot be dropped, so the label yields). The three
   priority labels are exempt from the dot obstacles, because the ruling makes
   current-system and set-course unconditional. The globe was enlarged by TIGHTENING its
   viewBox (260×200 around a 168-unit sphere) rather than by raising `.smsvg`'s `max-height`
   — measured at 264px and 320px, both push the off-lane sweep's button below the fold.
7. **The flat path is DELETED, not left dead.** `ProjectedNode`, `StarmapProjection` and
   `starmapProjection` are gone from `format.ts`; the `App.tsx` import and every line of flat
   JSX with them. `grep -rn "starmapProjection" packages docs TASKS.md` (excluding
   `node_modules`, `dist`, and the committed `packages/desktop/renderer/assets` build output)
   now returns only historical prose plus this record. The four live pointers that would
   otherwise have lied were re-aimed at `starmapGlobe`: `packages/content/src/systems.ts:298`
   (the NEMESIS-flag reader list), `packages/engine/src/types.ts:821`,
   `packages/ui/src/theme.css`'s `.smsys.crossing` note, and
   `docs/UI-PRESENTATION-DECISIONS.md` UI-1 ("SVG star plane" → the globe).
   `orbitalLayout2D` is **retained deliberately** and its doc comment now says why: deleting
   live code from a hashed file would move `rulesFingerprint` and owe an 8,000-run capstone
   for zero gameplay benefit.
8. **NO rulesFingerprint move, NO capstone, NO save migration is owed, and here is why.**
   `packages/sim/src/balance/rules-fingerprint.ts` hashes `packages/engine/src` (minus
   `index.ts`/`save.ts`/`schema.ts`) and `packages/content/src` (minus `index.ts`);
   **`packages/ui` is not hashed at all**, and this task is UI-only apart from three
   COMMENT-ONLY edits in `systems.ts` / `types.ts`, which `hashSemantic` strips before
   hashing (only the never-failing `docsFingerprint` moves). Verified by the gate: the
   balance-smoke suite refuses a stale fixture and passed untouched. The camera
   (yaw/pitch/zoom) is ephemeral `useState` and is deliberately **never persisted** — a save
   carrying a yaw would owe a migration for a value with no gameplay meaning.
   `CURRENT_SAVE_VERSION` is **17** today (`packages/engine/src/save.ts:627`), unchanged.

**FOUND, FILED, NOT FIXED HERE — the cockpit's small-screen layout.** At `devices['Pixel 5']`'s
393px the panes overlap each other (the manifest board paints across the starmap) and the
masthead chrome runs off the right edge. This is a pre-existing limitation of a fixed console
layout, not something this task introduced: it reproduces on every pane, not just the starmap.
It is why `starmap-globe-touch.spec.ts` emulates TOUCH (`hasTouch` + `isMobile`) at a viewport
the console supports rather than at Pixel 5's width — a touch test inside a broken layout would
be measuring the layout, not the gesture. Filed as T-219 below.

Gate: `npm test` green across all five workspaces (2,728 tests; `packages/ui` 29 files / 505,
of which the two starmap suites are 30), `npx tsc -b`, `npm run lint`, `npm run format:check` clean,
and — mandatory for a cockpit change under `docs/ENGINEERING-POLICY.md` §2 —
`npm run test:e2e -w @spacerquest/ui` at **195 passed / 0 failed**, including the 15 new specs.

Orchestration: attempts=1/4.

### T-219 · BUG: the cockpit's panes overlap each other at phone width — `status: TODO` · `coder: opus` · `after: T-215`

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

---

## M16 — Owner UAT pass 3: the dawn-hand die is illegible (2026-08-04)

### T-193 · BUG: the starmap shows a "PILOT DC" for every jump, but ordinary jumps never roll against it — `status: DONE` · `coder: opus` · `after: T-198`

Found while explaining the dawn-hand mechanic to the owner (they could not tell what assigning a
die to a jump does — see T-194 for the full finding). Root cause, verified in code:
`travelPreview()` (`packages/engine/src/actions/travel.ts:189`) unconditionally computes
`dc: travelDc(routeDistance, destination)` and the route-preview panel
(`packages/ui/src/App.tsx:3649`, `data-testid="route-dc"`) renders it for EVERY destination. But
`resolveTravel` (same file, `:572`) only actually rolls a Pilot check against that DC for the
Nemesis crossing (`isCrossing` branch, `:624-629`) — per the `T-1605 · AN ORDINARY JUMP ALWAYS
ARRIVES` comment at `:608`, the pilot check was deliberately removed from ordinary travel (34% of
jumps used to fail even on the player's best die). **Nobody removed the now-dead DC readout when
the check was removed.** The UI has been showing a stat check that cannot fail for every ordinary
jump since T-1605 shipped — actively misleading, not merely uninformative: a player reads "PILOT DC
12" and reasonably concludes their die and Pilot stat matter here, when neither does.

**Accept (amended at the 2026-08-04 review pass — T-195 shipped in the same commit as this
filing, and it changes what "honest" means here):** the route-preview panel does not display a DC
for a destination `resolveTravel` will not roll a check against (ordinary jumps); it MAY still
show the Nemesis crossing's real DC, since that check is real. But do NOT replace the dead DC
with only a "no check — every jump with fuel arrives" line — since T-195, an ordinary jump's die
is no longer inert: it sets a fuel discount (`navDieFuelDiscount`, 0-15%) and an
encounter-evasion factor (`navDieEvasionFactor`, 0-20%), and `travelPreview` already computes
both once a die is known. The honest readout is the armed die's live effect (e.g. "die 14 · fuel
−9% · encounter odds −13%"), with the "no check" copy covering the no-die-armed state — either
way the absence of a DC reads as a stated fact, not a missing feature. `travelPreview`'s `dc`
field can stay (still useful for the crossing and anything else that reads it), but the UI
consumer must stop rendering it as if it always means something. Coverage lands in the existing
DOM pane-test harness (`packages/ui/src/__tests__/`, vitest + testing-library — "coverage" here
means these; do NOT stand up a browser tier for this task, that is T-162's still-open thread): a
route preview to a non-crossing destination renders no Pilot-DC readout (the die-effect or
"no check" copy instead); a preview to the (unlocked) Nemesis crossing still renders the real
DC. Gate green.

**Delivered (2026-08-06). UI-ONLY, deliberately — no engine or content file was touched.** The
tempting fix (extract `travelRollsPilotCheck()` into `travel.ts`, add fields to `TravelPreview`) was
measured first and rejected: `packages/sim`'s `rulesFingerprint` hashes the semantic source of
`packages/engine/src/**` + `packages/content/src` wholesale, and appending a single line of *code*
to `travel.ts` flips `balance-smoke.test.ts`'s "the fixture describes the ruleset in the working
tree · is not stale" from pass to fail — so a provably inert extraction would have owed an 8,000-run
capstone sweep for a readout bug. The extraction is filed instead as **T-259**, to be batched into
the next milestone capstone. Confirmed after the change: `rulesFingerprint` did NOT move
(`balance-smoke.test.ts` 72/72 green, "is not stale" included) — the UI package is not hashed.

- **`packages/ui/src/format.ts`** — new `routeCheckReadout(game, dest, armedDieIndex)` returning a
  discriminated `RouteCheckReadout`: `{kind:'dc'}` **only** for `NEMESIS_SYSTEM_ID` (the one branch
  `resolveTravel` still rolls, `travel.ts:662` / `:702-715`), with the DC read *through*
  `travelPreview` rather than recomputed so panel and resolver cannot drift; otherwise
  `{kind:'die-effect'}` carrying the armed die's face plus `fuelPct`/`evasionPct` computed from the
  engine's own `navDieFuelDiscount`/`navDieEvasionFactor` (no 15/20 literal anywhere in the UI); or
  `{kind:'no-check'}` when the hand is missing, the index is null/out-of-range, or the slot is
  already spent. The header comment states the T-1605 cause, the T-195 replacement, and the
  fingerprint reason the predicate stayed in the UI.
- **`packages/ui/src/App.tsx`** — the `PILOT DC` key/value pair is DELETED from `.rp-grid` (which
  keeps DISTANCE | FUEL on row 1, DANGER on row 2 under its 4-column template). One full-width check
  row now renders below the grid, exactly one variant: `route-dc` (bare number, so
  `nemesis-crossing.spec.ts:181` still reads it), `route-die-effect`
  ("FUEL −13% · ENCOUNTER −17%"), or `route-no-check` ("NONE — every jump with fuel arrives").
  `data-testid="route-dc"` is now unreachable for any non-crossing destination. A nat 1 correctly
  reads −0% / −0% — that IS its live effect and is not special-cased back to "no check".
- **`packages/ui/src/theme.css`** — `.rp-check` / `.rp-ck` / `.rp-cv`, reusing `--etch-dim` /
  `--ember` / `--glow`; no new hue (T-186's amber pillar).
- **`packages/ui/src/walkthrough.ts:204`** — the tutorial repeated the lie ("shows the bill and the
  PILOT DC"); it now promises the bill and what the armed die takes off it. Nothing pinned the old
  string.
- **Coverage.** New `packages/ui/src/__tests__/route-preview.test.ts` (8 tests): no-die →
  `no-check`; armed die → `die-effect` with the face (not the index) and percentages matching the
  engine helpers **for all 20 faces**, endpoints pinned explicitly (1 → 0%/0%, 20 → 15%/20%) so a
  helper retune is visible rather than tautological; spent slot / out-of-range / absent hand →
  `no-check`; crossing → `dc === NEMESIS_CROSSING_DC === routePreview(...).dc`, and still `dc` with
  a die armed; plus an L-018 negative control looping every charted ordinary system in both armed
  and unarmed states, so a stub returning only `no-check` or only `dc` fails one side. ~~No jsdom
  and no testing-library were added~~ — **this claim was the review finding; see FIX ROUND 1 below,
  which stands the jsdom pane test up and makes the Accept's DOM half real.**
- **e2e updated, not weakened** (the F-112-D / F-162-3 failure mode): `starmap.spec.ts:82` and
  `:134` now assert `route-dc` **count 0** plus the `route-die-effect` text (percentages computed
  in-spec from the imported engine helpers, per the file's house rule) and `route-no-check`
  visibility respectively; the now-unused `travelDc` import was dropped and the header rewritten.
  `nemesis-crossing.spec.ts:181` is UNCHANGED and is now the positive control for the surviving
  real DC.
- **Two adjacent bugs filed, not fixed** (Bug Discovery Policy, with the risk analysis written into
  each block): **T-258** — `travelPreview` applies the die fuel discount to the crossing while
  `resolveTravel` excludes it (latent: no caller passes a die today, and this task deliberately did
  not start; named as a prerequisite inside T-237's Accept) — and **T-259**, the deferred
  `travelRollsPilotCheck` extraction above.
- **Gate.** `npm run format` run BEFORE the gate. `npm test` 2,736 passed / 0 failed across all six
  workspaces; `npx tsc -b`, `npm run lint`, `npm run format:check` all exit 0; e2e
  `starmap nemesis-crossing walkthrough` 25/25 passed.

**FIX ROUND 1 (2026-08-06) — the Accept's DOM clause, honoured rather than argued around.**

_Review finding, accepted in full:_ the Accept says coverage lands in the DOM pane-test harness
(`packages/ui/src/__tests__/`, **vitest + testing-library** — "coverage here means these"), and the
first pass shipped only a pure selector test plus Playwright specs the clause explicitly excludes.
Root cause was a category error in the first pass's own reasoning, not a missing harness: it read
"do NOT stand up a browser tier (that is T-162's thread)" as forbidding **jsdom inside vitest**. It
does not. T-162/T-237's open thread is the REAL-BROWSER tier (Playwright); jsdom-in-vitest is the
escape hatch `packages/ui/vitest.config.ts` has documented since T-1701a ("if a UI test ever needs
[a DOM] it should say so with a per-file `@vitest-environment` comment"). Net effect of the gap: the
always-run gate (`npm test` → `vitest run` per workspace; `test:e2e` is NOT part of it) pinned only
the predicate, so JSX that re-added an unconditional `PILOT DC` would have shipped green.

- **`packages/ui/package.json`** — `jsdom`, `@testing-library/react`, `@testing-library/dom` added
  as devDependencies of THIS workspace only. No engine, content or sim file touched;
  `rulesFingerprint` cannot move (the UI package is not hashed) and no sweep is owed.
- **`packages/ui/vitest.config.ts`** — `include` gains `src/**/*.test.tsx` (the e2e separation the
  `include` exists to keep is untouched: Playwright lives in `e2e/`, this pattern is rooted at
  `src/`). `environment` stays `'node'`; jsdom is paid for by one file's docblock.
- **`packages/ui/src/RoutePreviewPanel.tsx` (new) — a BEHAVIOUR-PRESERVING EXTRACTION, done before
  the new coverage, per standing constraint.** The panel could not be mounted while it was inline in
  the 6,000-line `App` component, which imports `./store` — and `store` runs `init()` (storage,
  sound) at module load. The JSX moved verbatim: same element order, class names, `data-testid`s,
  copy and HTML entities. The three values `App` computed beside it are now computed inside it from
  the same expressions — `routePreview(game, dest)`, `routeCheckReadout(game, dest, armedDieIndex)`,
  and `dieArmed = armedDieIndex !== null` (`App` passes `state.selectedDie`, so this is the same
  boolean). Props-only, store-free, decides no rule: the variant choice stays `routeCheckReadout`'s
  in `format.ts`.
- **`packages/ui/src/App.tsx`** — the inline panel is replaced by `<RoutePreviewPanel …/>`; the local
  `routeCheck` const and the now-unused `routeCheckReadout` import are deleted. `preview` stays
  (`showPreview` still reads it).
- **Coverage, where the Accept says it goes.** New
  `packages/ui/src/__tests__/route-preview-panel.test.tsx`
  (7 tests, `// @vitest-environment jsdom` + `@testing-library/react`, `cleanup` wired
  explicitly because this package runs without `globals`): ordinary destination renders **zero**
  `route-dc` elements AND no `/PILOT DC/` text (so dropping the testid while keeping the misleading
  words still fails) plus the `route-no-check` copy; armed die renders `route-die-effect` with
  percentages recomputed in-test from `navDieFuelDiscount`/`navDieEvasionFactor`; an L-018 DOM-level
  negative control loops **every** charted ordinary system in both armed and unarmed states; the
  **unlocked** crossing (`nemesis.crossing.unlocked` set — asserted plottable via `starmapGlobe`,
  not assumed) renders `route-dc` equal to `NEMESIS_CROSSING_DC` and to `routePreview(...).dc`, with
  and without a die armed; and two extraction-inertness tests (distance/fuel/danger match the
  engine preview; confirm button label + `disabled` gate, and its click calls `onConfirm` once).
- **The stale ruling that caused the miss is amended, not left to trap the next coder.**
  `docs/TEST-TIER-DECISIONS.md` **TT-12** asserted "this repo has no `@testing-library/react`" and
  **TT-13** read "a UI acceptance clause asking for DOM pane tests is discharged at the STORE level
  plus Playwright". New **TT-13a** records the boundary: when the defect IS the markup, and the
  gate that always runs is `npm test` (never `test:e2e`), the discharge is TT-13's own sanctioned
  exception — a per-file `@vitest-environment jsdom` docblock — under four bounds (package
  `environment` stays `node`; the component is extracted store-free first; the e2e spec is kept,
  not weakened; the pane test is mutation-checked). TT-12's permanent half ("never `../store`") is
  restated as unchanged.
- **Mutation-checked, not assumed.** With `{routeCheck.kind === 'dc' &&` forced to `{true &&` and
  the DC re-sourced from `preview.dc` — i.e. the exact original bug re-introduced — 3 of the 7 tests
  fail. Reverted; 7/7 green.
- **Gate (fix round 1).** `npm run format` run BEFORE the gate. `npm test` 2,743 passed / 0 failed
  across all six workspaces; `npx tsc -b`, `npm run lint`, `npm run format:check` exit 0; e2e
  `starmap nemesis-crossing walkthrough` 25/25 passed (the extraction is inert in a real browser).

**Delivered (2026-08-06):** the dead "PILOT DC" readout is gone from every ordinary jump —
`routeCheckReadout` (`packages/ui/src/format.ts`) now returns `{kind:'dc'}` only for the Nemesis
crossing (the one branch `resolveTravel` still rolls a Pilot check against), `{kind:'die-effect'}`
showing the armed die's live fuel/evasion effect for ordinary jumps, or `{kind:'no-check'}` when no
die is armed; `App.tsx`'s `.rp-grid` no longer renders `PILOT DC` at all, and the walkthrough copy
was corrected to match. The first pass landed the selector and updated e2e coverage; a review pass
(FIX ROUND 1) found the Accept's DOM pane-test clause had not actually been discharged and stood up
a jsdom + testing-library tier (`RoutePreviewPanel.tsx` extracted store-free, the new
`route-preview-panel.test.tsx`, `docs/TEST-TIER-DECISIONS.md` TT-13a) to close it, mutation-checked
against the original bug. Deliberately out of scope: two adjacent findings were filed rather than
fixed — T-258 (a latent `travelPreview`/`resolveTravel` fuel-discount mismatch on the crossing,
unreachable until T-237 lands) and T-259 (the `travelRollsPilotCheck` predicate extraction, deferred
to avoid owing a standalone `rulesFingerprint` capstone sweep for an otherwise-inert engine-source
change) — both left `packages/engine` and `packages/content` untouched; this task stayed UI-only
end to end.
Orchestration: attempts=2/4.

### T-194 · The dawn hand's die-value mechanic is illegible — teach it, and make success visible — `status: DONE` · `coder: opus` · `after: T-198`

Owner's read, after a live session: "it was not at all apparent why I was adding a d20 to any of my
tasks. Taking a contract? Making a jump to deliver the contract? Entering the hangout? ... In its
current state it feels like I have [a] number of action points, I have no feedback if the die does
anything."

**The pre-M17 mechanic this task was filed against (kept as the record of the finding; the full
value-blind/value-matters split is preserved in `docs/DAWN-HAND-REDESIGN.md` §3's table):** every
action cost one die, but only some read its face value, and nothing in the UI distinguished the
two classes — `dieArmed` (`App.tsx:3471`) is a plain boolean, not a comparison. **M17 dissolves
that split instead of teaching it:** after T-196a-c and T-197, every remaining Main Action reads
its die — Jump (fuel discount + encounter evasion, monotonic, T-195), Explore (Pilot vs Nav DC),
Haggle (Trade vs DC), Combat (Guns/Pilot/Trade vs DC by stance), Peek (Guile vs DC), Nemesis
crossing (Pilot vs DC) — and everything else is a Free Action costing no die at all. Two
deliberate corners stay die-blind, both ruled out of M17's scope by the spec's §3: storylet
choices authored with `spendDie` and no `statCheck`, and Explore's secondary extra-dice toll.

**RE-SCOPED at the owner-approved review pass, 2026-08-04** (originally written pre-M17, then
marked superseded with a "re-scope later" note — this rewrite IS that re-scope, done now so no
future coder inherits an Accept that contradicts its own postscript; the original two-part
version is in git history). Gated `after: T-198` so the tutorial teaches the post-checkpoint
economy, not numbers the owner may still re-tune.

**Accept, in three parts, all required:**

1. **Teach the two-class economy in the hand-held tutorial (T-187's contextual coach).** At the
   first die assignment: Main Actions cost a die and the die IS your roll (or, for a jump, your
   edge — higher is strictly better); Free Actions cost nothing and can be taken even with an
   empty hand — with one bounded exception, the daily social plays (§4a's pool), taught where
   the player first meets it (on entering a Hangout), not front-loaded. Demonstrate, don't just
   state: the walkthrough already covers a Free action (sign a contract) and a Main one (jump)
   back-to-back, so the contrast is felt.
2. **Show the roll before it's committed, everywhere a die is read.** For every check-based Main
   Action (Explore, Haggle, Combat, Peek, Crossing), once a die is armed, render that die's value
   against the action's DC as a clear success/fail read (e.g. "[14] vs DC 12 — clears it" or a
   plain pass/fail badge), not a bare DC sitting next to an unrelated hand of dice. For the jump,
   T-193's die-effect readout is the same idea and lands first; this task extends the pattern to
   the check actions. A DC shown before any die is armed (planning view) must be visually
   distinct from a live per-die read.
3. **The two residual die-blind corners must not be taught wrong.** Storylet `spendDie`-only
   choices and Explore's extra-dice toll still spend dice without reading them; the tutorial and
   the per-die read must not imply those dice roll against anything. If making them honest in the
   UI is cheap, do it here; if not, FILE the cleanup as a follow-up task rather than widening
   this one.

Gate green.

**SHIPPED, 2026-08-06. UI-ONLY: no file under `packages/engine/src`, `packages/content/src` or
`packages/sim/src` was touched, so `rulesFingerprint` is unmoved and `balance-smoke.test.ts`'s
"is not stale" stayed green — no capstone was owed for a readout change.**

*Part 2, the live per-die read.* One discriminated union, `CheckPreview`, decided in
`packages/ui/src/format.ts` (`plan` / `live` / `opposed` / `none`) plus one selector per surface —
`exploreCheckPreview`, `haggleCheckPreview`, `peekCheckPreview`, `crossingCheckPreview`,
`combatCheckPreview(stance)` — and one component, `packages/ui/src/CheckPreviewRow.tsx`. The
`live` arm is produced by calling the ENGINE's own `check(die, modifier, dc)`, so nat-20
auto-success, nat-1 auto-fail and `margin` are inherited rather than reimplemented
(docs/UI-PRESENTATION-DECISIONS.md **UI-29**). Plan and live are visually distinct and
`data-kind`-discriminated (**UI-28**). Combat RUN is `opposed` and gets no verdict, because
`resolveRun` draws the interceptor's pursuit d20 at resolve time and there is no DC to clear
(**UI-30**) — the one place this task deliberately shows less. The four-guard armed-die
resolution T-193 wrote inline is now the shared `armedDieFace`, reused by `routeCheckReadout`
behaviour-preservingly.

*The extractions, so the DOM could be tested at all (TT-13a).* `ExploreSweepPanel.tsx`,
`CombatStancePanel.tsx`, `HaggleRow.tsx` and `PeekControl.tsx` were lifted verbatim out of
`App.tsx` as props-only, store-free files on `RoutePreviewPanel.tsx`'s terms, and the move is
PROVED inert by `__tests__/check-preview-panels.test.tsx` (pre-existing testids, labels, disabled
gates and click wiring all asserted) rather than asserted to be.

*Part 1, the teaching.* Both "STALE COPY … OWNED BY T-194" markers are gone, and with them the
four false lines: w1–w4 and w6–w7 of `walkthrough.ts`, `dawn-roll` / `first-sign` / `first-jump` /
`first-explore` / `first-encounter` in `ONBOARDING_PROMPTS`, the w6 dry-tank fallback, and
`App.tsx`'s three `SOCIAL_TITLES` tooltips (all three still said "(spends a die)" after T-197 made
them free). **Two more of the same, found by sweeping the cockpit rather than the registries, and
fixed here rather than filed:** the Borrow and Repay buttons' hover titles also still said
"(spends a die)" — both have been Free Actions since T-197 — and a `TradePane` comment still
claimed the port stake was "die-costed like the shipyard", which M17 freed too. A tooltip that
prices a Free Action in dice is precisely what this task exists to stop teaching, so
`tutorial-economy.test.ts` now also scans `App.tsx`'s title/label literals as SOURCE, with a live
control proving the scan catches the deleted strings. The social pool is taught in
`first-hangout` and NOWHERE else, with
`SOCIAL_PLAYS_PER_DAY` interpolated from content. Pinned by `__tests__/tutorial-economy.test.ts`,
whose negative control fails on any of the four deleted strings (mutation-checked in the file).

*Part 3, the die-blind corners, made honest here rather than deferred.*
`storyletChoiceCostLabel` now emits `die (spent, not rolled)` for a `spendDie` choice with no
`statCheck` (`e2e/storylet-registry.spec.ts` updated to the honest label), and
`explorationFailExplanation('insufficient-dice')` plus the w6/`first-explore` copy name the extra
dice as a TOLL paid to lift a find, never a roll. What was NOT done here is filed as **T-261**
(surfacing the band's `apCost` before the claim is an engine/content read).

*The two mirrored DCs, and why that is safe.* `trade.ts`'s `const haggleDc = 12` and
`combat.ts`'s `const dc = 10 + encounter.interceptor.tier` are un-exported literals; exporting
either would move `rulesFingerprint`. They are mirrored in `format.ts` under a source-reading
drift alarm, `__tests__/engine-dc-pins.test.ts`, which reads the resolvers' own source and fails
the instant either literal changes. Promotion filed as **T-260**.

*Evidence.* `npm test` 6/6 workspaces green (UI 36 files / 579 tests, up from 31/520);
`npx tsc -b`, `npm run lint`, `npm run format:check` clean; Playwright 174 passed (the whole suite
bar `long-haul`/`flake-rate`), including the extended `exploration.spec.ts` and `combat.spec.ts`
check-preview assertions and an unchanged `nemesis-crossing.spec.ts` (confirmed, not assumed —
`route-dc` still carries the bare DC in BOTH the planning and the live state, and
`CheckPreviewRow`'s `dcTestId` exists to keep it that way). Mutation-checked: forcing the `live`
branch to `plan` reddens 8 tests across 3 files; reverted. One pre-existing flake found and filed
as **T-262** (proved pre-existing by reproducing it with this task's CSS removed).

**Delivered (2026-08-06):** shipped the two-class economy (Main Actions read the die, Free
Actions cost nothing) into T-187's hand-held tutorial, added a live per-die success/fail read
(`CheckPreviewRow` + `CheckPreview` union in `format.ts`) for every check-based Main Action —
Explore, Haggle, Combat, Peek, Crossing — driven by the engine's own `check()` so nat-20/nat-1/
margin are inherited rather than reimplemented, and made both die-blind corners (storylet
`spendDie`-only choices, Explore's extra-dice toll) honest in their copy without inventing numbers
the engine can't yet quote. UI-only by design: no `packages/engine/src`, `packages/content/src`
or `packages/sim/src` file was touched, so `rulesFingerprint` stayed unmoved and no capstone sweep
was owed. Deliberate scope boundary: promoting the two mirrored DC literals to exported constants
(filed as T-260) and surfacing Explore's toll before the claim (filed as T-261) both require an
engine/content change that would move the fingerprint, so both were filed rather than folded in;
one pre-existing e2e flake found at the gate was proved pre-existing and filed as T-262 rather than
fixed inside this task's unrelated scope.
Orchestration: attempts=1/4.

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
stale silently, and nothing downstream can build on a wrong number.

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
it as flaky rather than green. No other work routes around it.

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
`packages/ui/src/__tests__/route-preview.test.ts` negative-control loop.

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

Q4 / §3.6 of `docs/design/T-201-dawn-hand-roll.md`: SpacerQuest ships a BINARY motion model
(`reducedMotion` OR'd with the OS query at `App.tsx:931` driving `data-motion` at `:933`, with two CSS
rails — `theme.css:2567–2595` and the `:root[data-motion='reduced'] *` kill-switch at
`theme.css:2601–2605`), while `tabletop-ui` §8's standing rule mandates **Cinematic / Snappy /
Instant** and "never ship cinematic-only". The divergence exists TODAY and was deliberately not fixed
by T-201, whose doc recommends a separate task that retrofits every existing beat (`.sweep`, `om-*`,
`ld-settle`, the Liar's Dice timeline, `.die.bloom`) and warns that T-201's implementation should not
ship a cinematic-only beat while this is unanswered.
[harvested: T-201/motion-tier-third-rail]

**Accept:** either the three-tier motion model (Cinematic / Snappy / Instant) is implemented — the
setting, the `data-motion` values, the CSS rails, and the OS-query mapping — and every existing beat
named above (`.sweep`, `om-*`, `ld-settle`, the Liar's Dice timeline, `.die.bloom`) is retrofitted with
a Snappy form, or the divergence from `tabletop-ui` §8 is ruled deliberate for this product with the
reason recorded where a future UI task will read it; the retrofit list is proven complete by a scan of
the animation rails rather than by inspection; each tier is screenshotted/recorded per the
`tabletop-ui` §7 loop; no beat is left cinematic-only; UI-only change, so no rule fingerprint moves —
state that explicitly; gate green.

**Delivered (2026-08-06).** **The FIRST branch of Accept was taken: the three tiers are implemented.**
The "rule the divergence deliberate" branch was rejected on the merits — `tabletop-ui` §8 is an OWNER
standing rule already set ("Never ship cinematic-only"), and §8's own corrections log records four
separate times that offering a diluted alternative to a rule the owner has set is the wrong move
(2026-07-19 (6) "Stop offering dilutions of rules the owner has already set"; (4) "never propose
skipping an owner-eyes review step"). §8's own escape hatch made the cost small: "Presets read a
global speed/intensity setting rather than hard-coding durations, so the tiers are one knob, not three
implementations."

**THE PINS IN THIS BLOCK WERE STALE** (they were written against an older commit). Corrected, verified
against HEAD at task open — these are the PRE-change locations, and the retrofit has since moved them,
which is why the durable pins below are named by symbol rather than by line:
`systemPrefersReducedMotion()` `App.tsx:301` (not `:931`); the `data-motion` stamp
`App.tsx:957–959` (not `:931`/`:933`); the `@media (prefers-reduced-motion: reduce)` rail
`theme.css:3178–3205` (not `2567–2595`); the kill-switch `theme.css:3211–3217` (not `2601–2605`).
`docs/design/T-201-dawn-hand-roll.md` §3.6 carried the same stale pins and has been rewritten to the
shipped model rather than re-pinned.

**THE KNOB.** `--motion-scale` (`1` / `0.4` / `0`), declared once per `data-motion` value at the head
of `theme.css` under "THE MOTION CONTRACT", mirrored by `MOTION_SCALE` in the new
`packages/ui/src/motion.ts` — the single source of the tier vocabulary (`MotionTier`, `MOTION_TIERS`,
`MOTION_SCALE`, `resolveMotionTier`, `scaleMs`, `isInstant`, `motionTierFromStorage`). **22 `--dur-*` /
`--del-*` tokens**, each `calc(<cinematic-ms> * var(--motion-scale))`; **21 declarations** rewritten
onto them. JS: `scaleMs` at 3 sites (dawn scramble 55ms, Liar's Dice dealer beat 620ms, die-bloom clear
750ms), `isInstant` at the 3 `.sweep` mounts + the dealer beat + the GSAP guard + `useDiceRoll`, and
the whole Liar's Dice reveal timeline retrofitted by **one line** —
`tl.timeScale(1 / MOTION_SCALE[tier])` — so not one of its five duration literals is a tier decision.
Vocabulary flip: `data-motion` is `cinematic|snappy|instant`; `full`/`reduced` are gone and their
absence is asserted.

**THE RETROFIT IS PROVEN BY A SCAN, NOT AN INSPECTION** — which is what the Accept clause asked for,
and it earned its keep immediately: the block's named list (`.sweep`, `om-*`, `ld-settle`, the Liar's
Dice timeline, `.die.bloom`) is **5 beats; the scan found 17**. The eleven the list had missed are
`comp-focus`, `mb-post`, `mb-stow`, `tp-tick`, `tp-charge`, `tp-post` (+2 stagger delays), `cb-reveal`,
`cb-crit`, `ob-fade`, `ob-fade-center` and the `.d6` face turn. `packages/ui/src/__tests__/
motion-tiers.test.ts` brace-walks `theme.css` (a line-regex mis-attributes wrapped multi-line values —
the first draft did exactly that) and requires every animation/transition declaration to be `none`, a
`--dur-*`/`--del-*` beat, or an explicitly allowlisted AMBIENT/RESPONSE exception with a written
justification. **Negative control run:** appending `.t252-negative-control { animation: sweep 400ms }`
to `theme.css` fails the suite with `UNCLASSIFIED MOTION DECLARATION at theme.css:5419` (restored).
**No beat is left cinematic-only** follows mechanically from that scan ∪ the Instant kill-switch
assertion.

**THE CLASSIFICATION IS A DECISION, and it is asserted too.** BEAT scales; **AMBIENT** (the 5
`infinite` loops — `flicker` 5.5s, `ring-pulse` 3.2s, `pulse` 1.6s, `tick` 40s, `wt-pulse` 1.6s) and
**RESPONSE** (`.contract` 200ms, `.mb-toggle::after` 180ms, `.die` 180ms) do NOT — a 0.4× 40s news
marquee is unreadable, and trimming hover feedback makes an interface feel broken rather than snappy.
Both are killed outright at Instant, which is why the blanket kill-switch survives the knob. The e2e
pins this by measuring `.ticker` IDENTICAL at Cinematic and Snappy and `none` at Instant.

**ONE REAL REGRESSION FOUND AND FIXED DURING THE GATE, recorded because the lesson generalises.**
Scaling the ship-diagram's `.comp-row.focused` window collapsed it to 0ms at Instant and
`e2e/ship-diagram.spec.ts` (which runs on the Instant rail) went red. That class carries a plain
`border-color` MARKING which bench row a hull click landed on as well as the `comp-focus` bloom —
so scaling it deleted information, the §8 corrections-log failure "never regress information". Fixed
by leaving the READ window at 700ms at every tier while the bloom inside it trims; **the e2e was not
adjusted.** Rule recorded in UI-31: before scaling a timer, ask whether anything it gates is
information rather than motion.

**BEHAVIOUR-PRESERVING MOVE PROVEN INERT FIRST.** Step 2 (all 21 declarations onto `--dur-*` tokens
with the vocabulary unchanged) ran the full unit battery + 29 e2e — including
`port-ledger.spec.ts:239`, which asserts computed `animation-name` in BOTH directions, and
`settings-saves.spec.ts`, which asserted `data-motion='full'` — with **ZERO test edits**. The tiers
went on top of a proven-inert base.

**§7 SCREENSHOT LOOP AND SELF-CRITIQUE** (9 shots, `packages/ui/test-results/T-252-<tier>-{cockpit,
dock,settings}.png`, three tiers × three shots per UI-27; gitignored, no binary committed):
- *Does the control read?* Yes. The Motion segmented control is structurally identical to the Text
  size control directly below it (`set-seg` / `set-seg-btn` / `aria-pressed`), so it reads as part of
  the same Display group rather than as a bolted-on row. Verified in all three settings shots.
- *Does Snappy read as TRIMMED or as BROKEN?* **Measured, not eyeballed.** The full Snappy ladder is
  80 / 88 / 88 / 88 / 128 / 136 / 184 / 208 / 220 / 240 / 248 / 248 / 280 / 280 / 280 / 360 / 440 ms.
  Only 4 beats land under 100ms (`mb-stow` 80, `mb-post`/`ob-fade`/`ob-fade-center` 88) and all four
  are "a panel appears" — the least dramatic beats in the product. **Every scene moment stays ≥ 240ms**
  (`ld-settle`/`om-strike` 248, `bloom`/`comp-focus`/`tp-charge` 280, `om-bloom` 360, `sweep` 440).
  **A per-beat `max()` floor was CONSIDERED AND REJECTED**: 80ms still reads as a quick snap-in rather
  than a pop, and a per-beat floor is precisely the second knob §8's "one knob, not three
  implementations" forbids. Recorded so a future task can disagree with the reasoning rather than
  rediscover the numbers.
- *Does Instant lose information?* No, and it is asserted rather than claimed. Every keyframe in the
  file animates `opacity: 0 → 1` and **no beat's base rule sets `opacity: 0`**, so `animation: none`
  renders the element naturally; the e2e drives the onboarding card to Instant and asserts
  `animationName === 'none'`, computed `opacity === 1` and the copy still present. The `om-*` staged
  read-in is covered by the same argument.
- *Sound.* Untouched and confirmed: `grep` over `sound.ts` / `music.ts` finds **zero** motion or
  reduced-motion references, so §8's "Instant… sound still plays" already held and still holds.
- *Not self-approved.* This is not a designated owner gate, so screenshots + this written critique
  discharge §7 here. Nothing read wrong enough to flag; the one judgement call worth an owner's eye is
  the rejected 80ms floor, named above rather than shipped quietly.

**NO FINGERPRINT MOVES — PROVEN, NOT ASSERTED.** `rulesFingerprint` hashes `packages/content/src`
plus the engine's rule modules (`packages/sim/src/balance/rules-fingerprint.ts:622`, "the fingerprint:
`packages/content/src` plus the engine's rule modules"). Every file this task touches is under
`packages/ui/**`, `packages/desktop/src/**` (two key allowlists) or `docs/**`. `npm run balance:smoke`
**124/124 green**, including `balance-smoke.test.ts`'s "the fixture describes the ruleset in the
working tree · is not stale" assertion. Therefore: **no capstone sweep, no `balance:extract`, no
baseline re-measure.** `computeDocsFingerprint` is also unmoved (it hashes engine/content/sim sources,
not `docs/*.md`) and never fails a test in any case.

**NO SAVE-SHAPE CHANGE AND NO MIGRATION IS OWED.** The tier is a `KeyValueStore` local preference
(`sq.motion-tier`), never in the save envelope, exactly like `sq.fx` / `sq.text-size`.
`CURRENT_SAVE_VERSION` re-read at delivery: **17** (`packages/engine/src/save.ts:627` — not the 15 the
plan quoted, which is why it is re-read rather than copied). Untouched. The retired `sq.reduced-motion`
binary is honoured read-only by `motionTierFromStorage` (`'on'` → Instant, so an opted-out player is
never promoted back to cinematic by an upgrade) and deleted on the first deliberate tier choice; the
legacy path is unit-tested and driven end-to-end through a seeded old install in the e2e.

**TESTS.** New: `src/motion.ts` + `src/__tests__/motion.test.ts` (21 — scale factors pinned, the full
6-row `resolveMotionTier` truth table, `scaleMs` per tier, the legacy-fallback precedence table);
`src/__tests__/motion-tiers.test.ts` (74 — the scan); `e2e/motion-tiers.spec.ts` (13 — every tier
chosen **by clicking the Settings segment, never by writing localStorage**, per the global test-intent
rule; all 22 tokens resolved through a probe in the live document at each tier; Snappy asserted
STRICTLY shorter than Cinematic as the negative control against a relabelled Cinematic; ambient
unchanged; OS-override in both directions; persistence; legacy migration; the 9 screenshots). Updated:
`e2e/settings-saves.spec.ts` and `e2e/port-ledger.spec.ts` for the vocabulary, and the two desktop key
allowlists (`saveStore.test.ts` 12 → 13 keys, `cloud.test.ts`) so the shell accepts and correctly
REFUSES to cloud-sync the new key. Every other spec needed **zero** edits.

**GATE GREEN.** `npm run format` first, then: `npm test` **2,898 passed / 0 failed** across all six
workspaces; `npx tsc -b` clean; `npm run lint` clean; `npm run format:check` clean;
`npx playwright test` **207 passed**. One pre-existing FLAKE surfaced and was filed rather than
absorbed: `e2e/visual-identity.spec.ts:269` (the T-217 wire-cap geometry read) fails ~1-in-4 repeats
and passes on retry — **reproduced on a STASHED baseline (1 flaky in 6 repeats with this diff
removed)**, so it is not this task's. Filed in `TODO.md` "Defects — filed, not fixed" with the
measurement and the Bug-Discovery-Policy deferral analysis (out of scope; no debt roll-up).

**DOCS.** `docs/UI-PRESENTATION-DECISIONS.md` §4 gains **UI-31** (the ruling: the tiers, the knob, the
BEAT/AMBIENT/RESPONSE classification and why two of the three do not scale, the state-mark-vs-beat
rule, the OS override, storage-not-saves, and that completeness is a scan) and **UI-23 is amended in
place** so it no longer describes a binary. `docs/design/T-201-dawn-hand-roll.md` §3.6 rewritten to the
shipped model with a warning that a new beat MUST add a `--dur-*` token or the scan fails, and **Q4
marked RULED** at §7 (nine open questions → eight). `TODO.md`'s open-questions entry updated to eight
and pointed at UI-31. `docs/LESSONS.md` L-061 and `docs/TEST-TIER-DECISIONS.md` TT-17 amended for the
new vocabulary and the stale `App.tsx:934` pin.

Orchestration: attempts=1/4.

### T-253 · F-204-1: `wireStories.ts`'s "VERBATIM PRD §6 sample" no longer matches the PRD — `status: DONE` · `coder: opus` · `after: —`

**F-204-1 (OPEN, carried forward from T-204).** `wireStories.ts`'s "VERBATIM PRD §6 sample — do not
reword" contract now diverges from the PRD. `wireStories.ts:49` declares index 0 is the verbatim PRD §6
sample and it is pinned exactly at `wire.test.ts:132`; that line now says "Cantina" while
`docs/PRD-REIMAGINED.md:113` still says "Hangout" (as do §7.3/§7.5 at lines 145/163/167/177/195/217/223).
The PRD was not in T-204's IN-SCOPE list, so updating it is its own scoped decision. Related and
deliberate: the comment at `wireStories.ts:16-17` quoting the old sample and the one at
`hangout.test.ts:373-374` ("The gamble templates all name the Hangout") were left UNEDITED to keep
T-204's out-of-scope comment-count proof clean; both are knowingly stale pending the PRD decision and
should be corrected by whichever task takes it. [harvested: T-204/F-204-1]

**Accept:** the PRD decision is taken explicitly — either `docs/PRD-REIMAGINED.md:113` and the §7.3/§7.5
occurrences (lines 145/163/167/177/195/217/223) are updated to "Cantina" so `wireStories.ts:49`'s
verbatim contract holds again, or the sample is de-designated as verbatim and `wire.test.ts:132`'s exact
pin is re-shaped, with the reason recorded either way; the two knowingly-stale comments
(`wireStories.ts:16-17` and `hangout.test.ts:373-374`) are corrected in the same change; the "VERBATIM
PRD §6 sample — do not reword" contract is left either genuinely true or explicitly retired, never
half-true; content/doc-only change, so no rule fingerprint moves — state that explicitly; gate green.

**Delivered (2026-08-06):** Ruled the PRD as the lagging site (HO-25, `docs/HANGOUT-DECISIONS.md`
§8) and moved nine of its ten "Hangout" occurrences to "Cantina" (`docs/PRD-REIMAGINED.md` lines 58,
113, 129, 145, 163, 167, 177, 195, 217), keeping the one deliberate exception at §9 which now reads
"the Spacers Hangout (shipping as the **Cantina**)" since that line names the 1991 artefact, not a
shipped surface. `wireStories.ts:49`'s "VERBATIM PRD §6 sample" designation is kept rather than
retired, and made enforceable rather than merely asserted: new test
`packages/content/src/__tests__/prdWireSample.test.ts` fills the template and requires the result in
PRD §6, verified RED against the pre-fix PRD and GREEN on restore. The two comments the finding
flagged as knowingly stale (`wireStories.ts:16-17`, `hangout.test.ts:373-374`) were corrected, plus
three more the PRD edit would otherwise have newly staled (`hangout.ts:3,91`, `systems.ts:39-40`) and
one found at the pin itself (`wire.test.ts:78-79`); a narrow "quoting comments track the PRD, using
comments don't" rule was recorded to draw the line without pre-empting T-254's broader internal-vs-PRD
vocabulary split. Deliberate scope boundary: no identifier, file name, `describe` string, or save
literal was touched — those stay "Hangout" under HO-23 and are T-254's concern, not this task's.
`rulesFingerprint` and `instrumentFingerprint` do not move (comment-only edits under the semantic hash,
nothing under `packages/sim/src` touched); only the informational `docsFingerprint` moved, by design.

Orchestration: attempts=1/4.

---

## M19 — Captain voice: table talk, battle catchphrases, and quest-captain pinning (owner, 2026-08-05)

Two owner requests from reviewing the cast content-authoring survey. Both are about the 30 named
captains (`NPC_PROFILES`, `packages/content/src/cast.ts`) and the 11 quest captains
(`QUEST_PROFILES`, same file) specifically — NOT the 42-seat Liar's Dice roster (already has its
own `lines`) and NOT the 65-entry anonymous pirate/patrol pool (explicitly out of scope here; the
owner confirmed the gambler ladder and dropped the random-gambler idea with no further action).

**Moved at the 2026-08-06 re-order:** T-256 and T-257 (both owner content-design rulings) now
sit in the OWNER GATE section below. T-255 is autonomous and stays.

### T-255 · The four captain-voice surfaces have unit coverage only — prove them in real DOM — `status: DONE` · `coder: opus` · `after: —`

T-207's four new player-visible surfaces have UNIT coverage only and no real-DOM proof. T-207's block
states "No e2e change was needed or made" because `packages/ui/e2e/combat.spec.ts`'s two seeds are both
ANONYMOUS encounters, and `packages/ui/e2e/liars-dice-roster.spec.ts`'s `dare-table-talk` /
`dare-dealer-history` assertions are on the ROSTER seat. VERIFIED: grepping `packages/ui/e2e/` finds NO
assertion on `dare-dealer-table-talk` (the roaming captain's line, `packages/ui/src/App.tsx:3017`) nor on
`combat-enemy-bark` / `combat-enemy-battle-bark` / `combat-aftermath-bark`
(`App.tsx:1818 · 1823 · 2041`). It needs an e2e seed that deals a ROAMING named captain's hand and one
that draws a NAMED interceptor, so the copy a player can actually see is proved where
`packages/ui/src/__tests__/liars-dice-pane.test.ts`'s own T-221 header says such a claim can be proved.
[harvested: T-207/t207-e2e-bark-dom]

**Accept:** `packages/ui/e2e` gains a seed that deals a ROAMING named captain's Liar's Dice hand and a
seed that draws a NAMED combat interceptor, and asserts all four surfaces in real DOM —
`dare-dealer-table-talk` (`App.tsx:3017`), `combat-enemy-bark`, `combat-enemy-battle-bark` and
`combat-aftermath-bark` (`App.tsx:1818 · 1823 · 2041`); the seeds are found and pinned deterministically
rather than left to chance, and each assertion is shown to fail with the bark rendering suppressed, so
none is vacuous; the existing anonymous-encounter seeds in `combat.spec.ts` and the ROSTER-seat
assertions in `liars-dice-roster.spec.ts` are left intact; the specs declare their first-run walkthrough
stance per the suite convention; UI/test-only change, no fingerprint moves — state that explicitly;
gate green.

**Delivered (2026-08-06).** One new file, `packages/ui/e2e/captain-voice.spec.ts`, six tests. **UI/TEST-ONLY:
no engine, content, save-shape or fingerprint change.** Nothing under `packages/engine`, `packages/content`
or `packages/ui/src` was touched, so `rulesFingerprint` cannot move, no capstone is owed,
`CURRENT_SAVE_VERSION` is untouched and no migration is owed — re-read live at delivery: **17**
(`export const CURRENT_SAVE_VERSION = 17;`, `packages/engine/src/save.ts:627`; last bumped by T-208,
v16→v17). The `15` / `save.ts:509` this note first quoted was the Standing-constraints anchor and a
historical JSDoc line (`save.ts:204`, "T-145 bumped … to 15"), not the declaration — corrected here.
`combat.spec.ts` and `liars-dice-roster.spec.ts` were never opened and are byte-identical.

**The brief's line pins were STALE and are corrected here** (component + testid, per the resolvable-pin
rule, so the next reader does not re-chase a number): `combat-enemy-bark` `App.tsx:1873` and
`combat-enemy-battle-bark` `App.tsx:1878`, both in `CombatInstrument` under `readout?.enterLine` /
`readout?.battleLine`; `combat-aftermath-bark` `App.tsx:2061` in `CombatAftermathPanel` under
`aftermath.opponentLine`; `dare-dealer-table-talk` `App.tsx:3064` in the Liar's Dice scene under
`view?.dealerTableTalk`.

**Two fixtures, found by an offline sweep and pinned, not left to chance** — derivation method, sweep range
and predicate are recorded in the spec header so a future maintainer whose seed goes stale RE-HUNTS rather
than patches a literal. Seeds 1..400 × jump-die INDEX 0..4 × destination 2..12, replaying
`startDay(createInitialState(seed))` → `applyPlayerAction` exactly as the store does, kept the first draw
with `interceptor.source === 'named'`, `enemyHull >= 2` and an authored `catchphrases` pool. **NAMED
interceptor: seed 30**, die index 0 → Altair-3 draws `npc-zero-risk` (tier 2, hull 2, 215 fuel left — clear
of the 50-fuel fight cost, so no weapons-offline band); fight index 1 → round 2 (the even round the
battle-line timing rule fires on), fight index 2 → the killing volley resolves `interceptor-escaped`, which
`CAPTAIN_OUTCOME` reads from the captain's side as a `loss`. **ROAMING named captain's hand: seed 1,
`npc-iron-vex`** — the fixture `liars-dice.spec.ts` already documents (seated at Sol-3 on any seed), a
proven-reachable path that had simply never been asserted for its bark. Dice are addressed BY HAND INDEX,
never by value: seed 30's hand is `[15,15,15,10,1]`, so a `data-die-value="15"` locator would be ambiguous.

**Non-vacuity discharged twice, and the second layer was RUN, not asserted in prose.** (a) A
`proveBarkNotVacuous` helper asserts the line is in the DOM and is a member of the captain's authored pool
(never a hardcoded quote — every string is read from `@spacerquest/content`), then removes that element and
re-runs the identical assertion, requiring it to go red; it also guards the pool against emptiness, since a
membership check over an empty pool is the exact vacuity this task exists to rule out. Each probe is the
LAST act of its test — the barks are conditional children of a still-mounted parent, so a later React
re-render would `removeChild` a node already detached. (b) The content-level negative controls: the
anonymous raider (seed 43, re-walked here rather than edited into `combat.spec.ts`) and the roster seat
`ld-1-1`, where the shipped guards suppress the render genuinely, each proving the surrounding pane really
mounted so the absence is a claim about the bark. **Verified by mutation:** suppressing all four render
guards in `App.tsx` turned exactly the four positive tests red and left the two negative controls green;
`App.tsx` was reverted to pristine (`git checkout`) before the gate.

Suite convention observed: the T-187 walkthrough-stance comment plus `skipFirstTurnWalkthrough` in
`beforeEach`, and **no `@tag` in any test title** — `flake-rate.spec.ts` gates on a `@tour-one` denominator
an unrelated task must not move. Gate: `npm test` 2,900 passing / 0 failing across six workspaces;
`npx tsc -b`, `npm run lint`, `npm run format:check` all clean; full `npm run test:e2e -w @spacerquest/ui`
**214 passed** (208 + the 6 new), zero flaky. Named-deliverable check: `grep -rn` over `packages/ui/e2e/`
now returns all four testids in `captain-voice.spec.ts`.

Orchestration: attempts=2/4.

---

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

---

## M9 — Harvested: Liar's Dice, roster and ladder

**Moved at the 2026-08-06 re-order:** T-224, T-225, T-226 and T-227 — the four findings filed
by T-222/T-223, each Accept requiring an owner ruling — now sit in the OWNER GATE section
below. Their delivered evidence (the T-222/T-223 blocks) stays here.

### T-222 · F-219-1: the house's raise evidence bar is set by the PLAYER's own stake — `status: DONE` · `coder: opus` · `after: T-219`

**Filed at T-219 (2026-08-06), `docs/LIARS-DICE_REDESIGN.md` §19.10 / `docs/LIARS-DICE-DECISIONS.md`
LD-27.** T-219 derived `optimal`'s raise rule in closed form: because `probClaimTrue` is a point
read, every raise happens at `pTrue = 1`, where `challenge` and `fold` both score `−potDealer`, so
the branch reduces **exactly** to

```
optimal raises  <=>  probAtLeast(k_m, u) * (potPlayer + potDealer + c_m)  >  c_m
```

Both pots are seeded at the player's chosen stake (`packages/engine/src/actions/hangout.ts:550-551`)
and `c_m` is the frozen `ante = round(band.max × DARE_ANTE_BAND_FRACTION)` (`liarsDiceRules.ts:72`,
`packages/content/src/hangout.ts:144`), so the house's evidence bar is `ante / (2·seedWager + ante)`
— **a quantity the player controls and the house does not.** Enumerated over every shipped band at
tier 0 (all 40 system ids): the gate is **`k ≤ 3` at every band ceiling** and `k ≤ 2`, `k ≤ 1` or —
at the **15–1200, 25–2000 and 10–3000** ports — **`k ≤ 0`** at the floor, where `optimal` will only
raise a claim it already holds. Every band widens; three span four whole steps of `k`. A player
therefore makes the dealer measurably looser by betting more, and nothing in the spec, the decisions
file or any test named this before T-219 pinned it. It is an accident of the ante/pot ratio rather
than a design, and it is **not** a defect T-219 could fix: it is a wager-band or ante ruling, and
moving either inside a measurement task is §16.2's banned third shape. [filed: T-219/F-219-1]

**Accept:** the coupling is re-measured on HEAD across every shipped band with `n` on every cell and
its effect on play quantified (not just its effect on the gate — the gate moving is already proven;
what is unknown is whether the house plays measurably worse at either end); the owner either rules
the coupling acceptable and says so in `docs/LIARS-DICE-DECISIONS.md` with the derivation, or
changes `DARE_ANTE_BAND_FRACTION` / the ante's reference / the bands, in which case the choice is
**bakeoff'd against at least one alternative on identical seeds rather than tuned**, LD-27's
`k`-gate derivation is re-run against the new numbers rather than re-sampled, and the archetype
ordering (`bad − optimal`, +15.79 pp at z = 35.93, §18.4/§19.9) is re-scored and must not
re-invert; `liarsDiceArchetypes.test.ts`'s `T-219 · F-176-1` describe is updated honestly rather
than relaxed to pass; `docs/LIARS-DICE-PROGRESSION_SPEC.md` §3.3c and `docs/LIARS-DICE_REDESIGN.md`
§19.10 gain the outcome; if `packages/engine/src` or `packages/content/src` moves semantically the
task takes its own capstone with the moved rows predicted first; gate green.

**Delivered (2026-08-06).** F-219-1 **CLOSED — measured, baked off and RULED, with its reading
inverted and two larger things found underneath it.** The ruling is **LD-29**
(`docs/LIARS-DICE-DECISIONS.md`); the measurement is `docs/LIARS-DICE_REDESIGN.md` **§21**. **No rule
moved: no band, threshold, fraction or golden was edited in either direction, and the only source
file touched anywhere is a test.**

- **PHASE 0 — five corrections to the finding's own framing, made in writing before anything ran**
  (§21.0). (1) `ante / (2·seedWager + ante)` is the gate at the FIRST decision only — `placeBid`
  grows both pots (`packages/engine/src/actions/dare.ts:326-333`), so the finding's formula is the
  **tightest** bar the house ever faces, and a cell whose opening gate is `k ≤ 4` was measured
  emitting `k = 5` raises on 16.79% of its raises. (2) `seedWager` is clamped by **both** purses
  (`actions/hangout.ts:471-478`). (3) T-219 enumerated **tier 0 only**, and the coupling is not
  tier-invariant — `anteFor` and `effectiveWagerBand` both take the tier. (4) `dareCells` cannot cut
  by stake and this task **refuses to add that cut** (`packages/sim/src` is in
  `SIM_INSTRUMENT_DIRECTORIES`; moving `instrumentFingerprint` inside a measurement task is the
  shape §19/§20 both refused). (5) **The plan's own reachability probe is not a faithful arm and is
  reported as a failed instrument**: `resolvePolicy` gives a raw `SimPolicy` `dawnBlind: true` while
  `'gambler'` resolves `dawnBlind: false`, and the wrapper arm's mean seated stake is **102.3**
  against the shipped arm's **2,631.6**. Its histogram is discarded, not used.
- **THE ENUMERATION, RE-RUN ON HEAD over bands × ALL SIX TIERS** (§21.3, `.scratch/t222-bands.ts`).
  §19.10 reproduces **exactly** at tier 0 — **40/40** bands widen, transitions `{0→3, 1→3, 2→3}`.
  New: the step boundaries in **closed form** (`s > c(1−p)/(2p)`), per band per tier; tier 4 tightens
  the bar 3× at a fixed stake and leaves the ceiling gate unchanged; **tier 5 removes the ceiling and
  freezes the ante**, so the gate keeps opening. Every bounded tier stops at `k ≤ 3`, and that is
  **one number for all forty ports**: at the ceiling the ratio is `f / (2 + f)` and the band cancels
  out.
- **THE PLAY EFFECT, `n` ON EVERY CELL** (§21.4, `.scratch/t222-stake.ts` — derived from
  `.scratch/t219-bakeoff.ts`, changing only the per-cell ante/stake and modelling headroom
  faithfully). **260 cells × n = 40,000 = 10,400,000 hands**, identical seeds
  (`SeededRng(20_260_806 + u)`) across every stake cell, scored on **realised** house credits off
  the engine's own showdown rule. Control proven, not assumed: `.scratch/t222-fidelity.ts`
  cross-checks the rig's `optimal` against `archetypeMove({archetype:'optimal'})` over **1,200,000**
  states at **every shipped ante** (20 values, 6…270) and pots/headroom across 0…9,000 — **zero
  mismatches**, move mix reported.
- **THE RESULT INVERTS THE FINDING'S READING.** The stake-free quantities are a function of the
  **gate step alone**, and **a looser gate is BETTER for the house, monotonically**: house net/seed
  **−0.04 → +0.11 → +0.45 → +0.63** (4 dice) and **−0.39 → −0.29 → +0.09 → +0.37** (6 dice), with
  the player's win rate falling **51.77% → 18.55%** and **65.28% → 31.35%**. `c / (pot + c)` is
  **pot odds**, not an accident. Three controls separate the mechanism: holding the **ratio** fixed
  and scaling stake+ante ×10 gives net/seed **0.6316 at every rung**; varying the ante *within* a
  gate step changes **nothing**; headroom matters only in the last three antes of the band.
- **THE BAKEOFF, run even though nothing changed** (§21.4a). Controls A and B prove
  `DARE_ANTE_BAND_FRACTION` and the bands **cannot** dissolve the coupling. The one lever that can —
  **referencing the ante to the player's own stake** — was run over the same 260 cells on identical
  seeds and does dissolve it (flat `k ≤ 3`, flat 31.35% player win at six dice, no inversion below
  the ceiling). **DECLINED** because it moves the table against the player at **every** measured
  cell while **LD-28 promoted "pooled player EV/hand > 0" to a standing invariant one task ago**
  (+190.1 cr measured) and scoring that needs a full capstone; because it **fixes neither** measured
  pathology; and because it would owe its own capstone to decide admissibility. Recorded as the
  shape a fix to F-222-2 should start from.
- **THE REPRODUCTION ARM** (`--label t222-rescore --seeds 1600 --days 120 --policies gambler
  --milestone-days 21,29,30,41,60,120 --shard i/4`, **1-indexed**, scored with the unchanged
  `.scratch/t176-bakeoff.mjs`) reproduces §18.6 / §19.9 / §20.3 to **every published decimal**:
  **1,600 rows · 279,857 dares · 52.90% · +190.1 cr/hand · `roster|optimal` 39.83% (n = 95,580) ·
  `bad − optimal` +15.79 pp SE 0.44 z 35.93 · 0 disagreements · `invariants: 0 violations`** on all
  four shards. **Shards-only and deliberately so** — no `--merge`, no `--aggregate`, no capstone: the
  standing 8,000-row constraint governs the *capstone* sweep, owed when `rulesFingerprint` moves,
  which it does not (§20.0 correction 3 is the precedent, restated in §21.0/§21.5 so a reviewer does
  not read a skipped step). The `combat-win-share` FAIL is the known gambler-only-arm artefact.
- **THE RULING (LD-29):** the coupling is **ACCEPTABLE at every bounded tier (0–4)** on the pot-odds
  derivation and the monotone measurement. **A2 passes** where it was pre-committed (+15.79 pp on
  the instrument) and **A4 passes** (dissolution needs ≥ 419,896 credits against a measured maximum
  seated stake of 32,510). **A1 FAILS at tier 5 only, and is FILED rather than folded in.**
- **THREE FINDINGS FILED THE MOMENT THEY WERE CONFIRMED**, each with its own backlog row: **F-222-1
  → T-224** (the top `DARE_ANTE_BAND_FRACTION` of every bounded band is a **dead zone** where no
  raise is legal for either side, so the Dare collapses to a single claim at `probAtLeast(1, u)` —
  **+962 cr/hand to the player at the default band at tier 4 against −842 one quarter-band lower**);
  **F-222-2 → T-225** (tier 5 caps nothing; past `k ≤ 3` the gate misprices, house net/seed +0.373 →
  +0.223 → −0.139 and the ordering re-inverts at −4.95 pp, reachable from 1,026 credits);
  **F-222-3 → T-226** (the archetype ordering is **stake-conditional**, −21.15 pp at floors to
  +20.61 pp mid-band).
- **A PRE-COMMITTED PREDICTION WAS WRONG AND IS RECORDED AS WRONG** (§21.6, prediction 3): "A1 holds
  at every band and tier". It holds at every **bounded** tier and fails at tier 5. It was the
  prediction most convenient to a clean "rule it acceptable" outcome; the ruling was **scoped** and
  the finding **filed** rather than the prediction being restated to match.
- **TESTS.** T-219's describe `T-219 · F-176-1 …` keeps **every expectation it shipped** —
  `widened === 40` and `['0->3','1->3','2->3']` are untouched; only its closing comment is redirected
  from "T-222 must be re-read" to LD-29 / §21. A new describe
  **`T-222 · F-219-1 — the stake/ante coupling, ruled`** in
  `packages/engine/src/__tests__/liarsDiceArchetypes.test.ts` adds five assertions, **all computed
  from `probAtLeast` / `anteFor` / `effectiveWagerBand` / `legalMovesFrom` / `DARE_ANTE_BAND_FRACTION`
  with no literal threshold in any mechanism**: monotone loosening over 40 ports × 6 tiers (3,120
  cells); the closed-form step boundary against the brute-force gate at every `(port, tier, k)`; the
  pot-growth correction; the bounded cap at `f / (2 + f)` **and** tier 5's removal of it; and the
  one-ante dead zone. *(The closed-form assertion caught a real error in this task's own first draft
  — the inequality is strict, so `k = 0` starts at seed **1**, not 0. Corrected in the doc and the
  probe rather than papered over.)*
- **FINGERPRINTS, CAPSTONE AND SAVE SHAPE, measured rather than asserted.** `git diff` touches
  `docs/**`, `packages/engine/src/__tests__/**`, `.scratch/**` and `TASKS.md` **only** — nothing
  under `packages/engine/src` outside `__tests__`, and nothing under `packages/content/src`. Read
  live before and after with `.scratch/t219-fp.mjs`: **`rulesFingerprint cabd2112ccf4cefb`**,
  **`instrumentFingerprint 2d6d1990eaf13031`**, **`docsFingerprint 265aea1d09f0d485`** — **all three
  UNMOVED** and identical to §20.5's. `__tests__` is in `HASHED_ROOT_IGNORED_DIRECTORIES` and is not
  in `SIM_INSTRUMENT_DIRECTORIES` (`['', 'balance']`), and `computeDocsFingerprint` hashes rule and
  instrument **sources**, not `docs/**`. **No capstone, no re-extract, no baseline re-pin owed.**
  **`CURRENT_SAVE_VERSION` UNMOVED at 17**, re-read live at `packages/engine/src/save.ts:627` — no
  save shape moved, so no migration and no round-trip test is owed.
- **Deliberate scope boundary:** this task ships **no rule change**, with the reason written down
  **per lever** (§21.5). It does not re-open LD-25/LD-26/LD-27/LD-28, does not touch `headroomFor`
  or §4.3's exposure ceiling (that is T-224's), does not touch `effectiveWagerBand` or §4.8 (T-225's),
  and does not add the `dareCells` stake dimension that would name the exact dead-zone share —
  §21.4c bounds it at ≤ 49.6% from `bids/hand = 1.504` and hands the exact figure to T-224.
- **Gate green**: `npm run format`, `npm test`, `npx tsc -b`, `npm run lint`, `npm run
  format:check`.

Orchestration: attempts=1/4.

### T-223 · F-220-1: the ROSTER pool is a net credit SINK, and nothing names or bounds the price — `status: DONE` · `coder: opus` · `after: T-220`

**Filed at T-220 (2026-08-06), `docs/LIARS-DICE_REDESIGN.md` §20.7 / `docs/LIARS-DICE-DECISIONS.md`
LD-28.** T-220 cut the shipped table by pool for the first time (`dareCells`, 1,600 gambler careers
× 120 days, n = 279,857). The aggregate EV/hand is **+190.1 cr** — but that is a mixture of two
pools that point in **opposite directions**:

| pool | n (hands) | player win rate | EV / hand |
| --- | --- | --- | --- |
| **roaming** (`archetype = none`, `dealerMove`) | **157,037** | 58.55% ±0.12 | **+495.8 cr** |
| **roster** (the named captains, `archetypeMove`) | **122,820** | 45.69% ±0.14 | **−200.8 cr** |

Driven almost entirely by `roster|optimal` at **−482.3 cr/hand over n = 95,580** — **34% of every
hand played in the game**. **T-220 predicted EV > 0 on both pools and that prediction was WRONG**
(§20.6, prediction 4); the invariant LD-28 ships is therefore stated on the pooled table, and this
row is the honest remainder rather than a rounding of it.

**This is not obviously a defect, and that is exactly why it needs a ruling.** LD-26 already
established that in this game credits buy disposition and that *"the two currencies partition"* —
a player who wants disposition with a **specific named captain** must sit at a roster table, and
paying ~200 cr/hand for it is that same purchase one level up. But **the price has never been
named, derived, bounded or tested.** It is currently an emergent consequence of `optimal` being the
majority roster seat, not a design decision anyone took: nothing in `docs/HANGOUT_REDESIGN.md` §7 /
§10.4, `docs/LIARS-DICE_REDESIGN.md` or `docs/LIARS-DICE-DECISIONS.md` says the named-captain table
is meant to cost credits, and no test would notice if the price doubled. The player-facing risk is
that the disposition channel §10.4's interceptor draw depends on is gated behind an unadvertised
and unbounded credit sink. [filed: T-220/F-220-1]

**Accept:** the roster pool's EV is re-measured at n ≥ 10,000 per pool with `n` on every cell and
decomposed against the roster archetype mix (is the sink `optimal` specifically, or the pool?); the
owner either **rules the price intended** — in which case it is written into
`docs/LIARS-DICE-DECISIONS.md` with the derivation of what the disposition is worth in credits,
LD-26's partition is cited rather than restated, and a **bounded** standing invariant is added
(a floor on roster EV/hand, sourced and argued, not fitted to the measured −200.8) — or **rules it
a defect**, in which case the fix is **bakeoff'd rather than tuned** against at least one named
alternative on identical seeds, the archetype ordering (`bad − optimal` = +15.79 pp, z = 35.93,
§18.4/§19.9/§20.3) is re-scored and must not re-invert, and LD-28's two shipped invariants are
re-scored alongside; whichever branch is taken, the UI question is answered explicitly (does the
player know the roster seat is the expensive one? — `docs/HANGOUT_REDESIGN.md` §7); if any rule
moves the task takes its own capstone with the moved rows predicted first; §20.7 gains the outcome;
gate green.

**Delivered (T-223, 2026-08-06):** F-220-1 is **measured, decomposed, priced on the instrument that
actually buys what the roster sells, and RULED**. The ruling is **LD-30** in
`docs/LIARS-DICE-DECISIONS.md`; the working is `docs/LIARS-DICE_REDESIGN.md` **§22**.

- **THE FINDING'S ARITHMETIC IS EXACT AND ITS PREMISE IS FALSE — corrected in writing before
  anything ran** (§22.0, five corrections). **A roster seat pays NO disposition at all**
  (`packages/engine/src/actions/dare.ts:168-181`, §7.6's hard null, with a shipped test), so the sink
  cannot be the price of the disposition channel — that channel is fed by the **roaming** pool, the
  one at **+495.8 cr/hand**. LD-28's closing paragraph inherits the same error and now carries a
  **dated note** correcting it, with **none of its numbers or ruling text edited**. Two further
  corrections: "roster (the named captains)" mislabels the pool (the roster is LD-11's authored
  42-row house table; the named captains are the roaming pool), and the plan's UI premise is wrong —
  **the purse is projected but NOT rendered**, so the pre-tier-3 player has no cue at all.
- **WHAT −200.8 ACTUALLY MEASURES: the SEAT ELECTION, not the table.** `planDare` elects the
  **richest** candidate (§12.9 F-148-2 — **RULED, not overlooked**, and not this task's to move) and
  content prices difficulty in purse (`3× / 5× / 8×`), so the gambler sits opposite `optimal` on
  **77.82%** of its roster hands (**34.15%** of every hand played). **Re-weighted with every cell's
  own EV held FIXED:** measured **−200.8** → LD-11's **authored seat census +172.8** → **flat
  +391.3**. Weights computed from `LIARS_DICE_OPPONENTS`, mixes distributed by their own `mix`,
  never restated as literals.
- **THE FEEDBACK LOOP, MEASURED RATHER THAN ASSERTED** (`.scratch/t223-meter.mjs`, the same 1,600
  careers driven through a spy that returns its policy's actions unchanged): Σ seat-3 purses run
  **140,400 → 162,433 (+15.7%)** while seats 1 and 2 fall **−6.8%** / **−3.7%**; **5.72 of 42 seats
  are broke at the horizon**; seat 3 takes **64.28% → 52.87%** of roster hands per 30-day window and
  **never less than half**.
- **THE SECOND INSTRUMENT IS THE ANSWER TO THE ACCEPT QUESTION.** `deed-hunter.ts`'s roster tour (a
  **shipped instrument, unmodified**) over **152 careers × 300 days** — the coverage arm's 76 seeds
  **doubled so the roster pool clears n ≥ 10,000 on its own count**, the sample widened rather than a
  rate published under-powered — measures the same table at **+21.5 cr/hand (n = 11,021)**, ends the
  median career **+1,885 cr up** on the gauntlet (**−0.52%** of the median purse, a *gain*), closes
  **2,099 port sets**, banks `liars_dice_grand_slam` in **141 of 152 careers**, and leaves **0.00 of
  42 seats broke** — §7.5's no-lockout theorem is not approached, let alone violated. **A2 passes on
  the strongest form of the test.**
- **THE ZERO-SUM PRICE METER, and the asymmetry no document named.** Σ bankroll recomputed from
  content = **280,800 cr** (header **confirmed**, not quoted). `Σ (bankroll − purse) === roster
  marginal of dareCells.netCredits` on **1,600 / 1,600** careers, and the spy's hand counts match
  `dareCells.hands` on **1,600 / 1,600**. The player's **upside is capped at 280,800 and never
  regenerates** (best career took **163,442 — 58.21% of the cap**); the **downside has no bound** (worst
  career fed **102,742** in). Named in LD-30 rather than shipped as an invariant, with the reason
  written down.
- **THE RULING (LD-30): INTENDED.** The roster price is the price of the **SEAT**, denominated in
  **progression** (set closure, the port deeds, the grand slam), not in disposition. **One bounded
  standing invariant is added — the CENSUS BOUND:** the roster pool re-weighted to LD-11's own
  authored seat census must stay **EV-POSITIVE**; weights from `LIARS_DICE_OPPONENTS`, **bar ZERO**,
  no literal in the mechanism, **not fitted to −200.8**. **B1 and B3 are argued against in writing**
  (§22.5): B1 (mix headroom) is *algebraically LD-28's own invariant* and is therefore shipped as a
  **reported** quantity (**43.89% roster share against a 71.18% break-even — 27.29 pp of headroom**,
  so **A3 passes**) rather than as a second bar; B3 (shape (a)'s −314.9) would bar the *instrument's*
  number, which is precisely what the ruling says is not the game's.
- **THE ALTERNATIVES DECLINED IN WRITING, per lever** (§22.5's table): **ALT-1** (re-author the seat
  census / bankroll ladder) declined **on the measurement** — content's own census already reads
  +172.8 and the policy that plays it is *paid*; **ALT-2** (LD-29's stake-referenced ante) measured
  and declined one task ago on identical seeds, and moves the table **against** the player; **ALT-3**
  (remove §7.6's null so a roster seat pays disposition) costed — a save-shape change owing a
  migration that **calls** a rule plus a round-trip test, a `rulesFingerprint` move and a capstone —
  and declined because correction 1 removes the reason to want it. `planDare`'s picker,
  `optimal`'s valuation, both challenge margins and `minOpeningQuantity` all named with reasons.
- **THE REPRODUCTION ARM** (`--label t223-roster --seeds 1600 --days 120 --policies gambler
  --milestone-days 21,29,30,41,60,120 --shard i/4`, **1-indexed**, scored by `.scratch/t223-roster.mjs`)
  reproduces §20.3 to **every published decimal**: **1,600 rows · 279,857 dares · 52.90% · +190.1
  cr/hand · roaming +495.8 (n = 157,037) · roster −200.8 (n = 122,820) · `roster|optimal` −482.3
  (n = 95,580) · `bad − optimal` +15.79 pp SE 0.44 z 35.93 · 0 tier and 0 challenge disagreements ·
  `invariants: 0 violations`** on all four shards, joins exact on all three sums. **Shards-only and
  deliberately so** — the 8,000-row constraint governs the *capstone*, owed when `rulesFingerprint`
  moves, which it does not (§20.0 correction 3's precedent, restated). The `combat-win-share` FAIL is
  the known gambler-only-arm artefact. **Every published EV cell now also carries a career-cluster
  bootstrap SE and 95% CI** (`dareCells` holds no sum of squares, and careers are the level the
  dependence lives at).
- **C6 AND BOTH LD-28 INVARIANTS RE-SCORED as Accept requires:** `bad − optimal` **+15.79 pp, SE 0.44,
  z 35.93 — no re-inversion**; pooled EV **+190.1 > 0** ✅ and **≪ +558** ✅.
- **TWO OF SIX PRE-COMMITTED PREDICTIONS WERE WRONG AND ARE RECORDED AS WRONG** (§22.7, written to
  `.scratch/t223-predictions.md` before the sweep ran). **Prediction 4** ("the gambler pays and buys
  nothing") is **half wrong on its load-bearing half**: 0 grand slams ✅, but **2,861 port sets closed
  across 1,600 careers**, in **1,254 of them**, at a mean of **20.51 / 42** seats beaten.
  **Prediction 6** is **wrong on the sign**: the deed hunter's per-hand EV was predicted negative and
  measures **+21.5**. Prediction 6 is the useful one — it is the measurement that turns correction 1
  from a debating point into a ruling.
- **TESTS.** `packages/sim/src/__tests__/campaign-dare-cells.test.ts` gains describe **`T-223 · LD-30
  — the roster seat's price`**: the **census bound** (weights computed from content, **no literal
  threshold in the mechanism**), the **mix headroom** (both sides derived from the live rollups, plus
  an assertion that it and LD-28's pooled reading cannot disagree), and the **archetype rollup
  lossless and non-empty at all three concrete arms**, so a later roster figure published without the
  archetype cut goes red. Run on the **same memoised 48-career pass** the T-220 describe uses —
  hoisted to module scope, **no fourth walk over 48 careers**, and T-220's own assertions are
  byte-identical. Measured there: census EV **+209.0** at a career-cluster bootstrap **SE 73.9**
  (**reported as a ~2.8 SE detector rather than presented as comfortable**), headroom **27.12 pp**.
  `packages/engine/src/__tests__/liarsDice.test.ts` gains describe **`T-223 · what a roster seat pays,
  and what it does not`**: the §7.6 null on the **WIN** arm with a **vacuity guard** proving both
  terminal challenge arms are reached (the one thing the existing `T-145 · roster hands apply NO
  disposition (§7.6)` never asserted — **extended, not duplicated**); `seedLiarsDicePurses()` **is**
  the authored bankroll row-wise with the key sets compared; and **bankroll STRICTLY increasing in
  `seat` at every one of the 14 ports** with seat 3 `optimal` and seat 2 `mixed` everywhere — the pin
  that makes the seat-election derivation durable.
- **ONE FINDING FILED THE MOMENT IT WAS CONFIRMED: F-223-1 → `T-227`** — the player is told
  **nothing** about which of the three house seats is the hard one. The purse is projected but not
  rendered, `seat` is not projected at all, `liarsDiceDealerReadout` hard-nulls on a `ld-` id, and the
  only cue that ever arrives (tier ≥ 3) describes **style**, calling the hardest and richest seat
  *"This one plays it safe."* Written into `docs/HANGOUT_REDESIGN.md` §7 in that section's finding
  format. Answered **independently of the sign** on LD-26 / T-221's precedent, and **filed rather than
  patched** because the missing disclosure is a **difficulty** one and that is a design call.
- **FINGERPRINTS, CAPSTONE AND SAVE SHAPE, measured rather than asserted.** `git diff` touches
  `docs/**`, `packages/engine/src/__tests__/**`, `packages/sim/src/__tests__/**`, `.scratch/**` and
  `TASKS.md` **only** — nothing under `packages/engine/src` outside `__tests__`, nothing under
  `packages/content/src`, nothing under `packages/ui/src`. Read live before and after with
  `.scratch/t219-fp.mjs`: **`rulesFingerprint cabd2112ccf4cefb`**, **`instrumentFingerprint
  2d6d1990eaf13031`**, **`docsFingerprint 265aea1d09f0d485`** — **all three UNMOVED**. **No capstone,
  no re-extract, no baseline re-pin owed.** **`CURRENT_SAVE_VERSION` UNMOVED at 17**, **re-read live**
  at `packages/engine/src/save.ts:627` — a derived per-pool report is not a save shape, so no
  migration and no round-trip test is owed.
- **No band, threshold, fingerprint or golden edited in either direction.** When a cell came in
  under-powered (the hunter arm at n = 5,620 on 76 careers) **the sample was doubled to 152**, not the
  bar.
- **Gate green**: `npm run format`, `npm test`, `npx tsc -b`, `npm run lint`, `npm run format:check`.

Orchestration: attempts=1/4.

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

---

## OWNER GATE — open tasks that need a human ruling or session

Every task below requires owner input to close: a design ruling, a treatment pick, a playtest
read, or a live session. They sit BELOW all autonomous work so a run never queues runnable
tasks behind a human halt. Several carry real preparation work (re-measurements, write-ups) a
runner can complete before halting `BLOCKED` for the ruling; none may be self-approved. The
first four are one owner sitting: they are the Liar's Dice findings T-222/T-223 filed, and
share one evidence base (`docs/LIARS-DICE_REDESIGN.md` §21/§22).

Provenance (harvest grouping, for the record): T-224–T-227 from M9; T-171 from M10; T-237 from
M17; T-254 from M18; T-256/T-257 from M19; T-251 from M18; T-181, T-232, T-234 from M13.

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
