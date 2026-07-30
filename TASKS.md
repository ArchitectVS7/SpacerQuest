# SpacerQuest — NPC Parity Track (N-series) Task List

Continues the NPC parity track defined in **`docs/NPC_REDESIGN.md`** — read the track
preamble, THE STANDING CONSTRAINT, THE PARITY LEDGER, and the target step's own section
before implementing anything. That document is the source of truth and the record: every
step's outcome is appended there. Companion docs: `docs/BALANCE-REDESIGN-WORKLIST.md`
(the R-series and the known-red tripwires), `docs/BALANCE-POLICY.md` (governance),
`docs/VERSIONING.md` (fingerprints, bands, save versions), `docs/PRD-REIMAGINED.md`
(design intent).

Baseline of record at the time of writing: `docs/balance/baseline-n10-shipped.json`
(8,000 runs). Battery at the time of writing: **1,312 passing / 0 failing**
(engine 769 · sim 306 · ui 135 · desktop 102).

## Orchestrator protocol

1. **Check out** the first task with `status: TODO` whose `after:` tasks are all DONE. Set it `IN-PROGRESS`.
2. **Plan** — hand the coder the task block plus the pointers named in the intro. Nothing else.
3. **Code** — implement per the plan and the Standing constraints.
4. **Review** — check the diff against the task's **Accept** criteria (written to be mechanically checkable).
5. On pass: run the gate, commit as `<ID>: <title>`, set `status: DONE`, update this file in the same commit. On fail: one fix round, then escalate, then halt.

**Gate (every task):** `npm test`, `npx tsc -b`, and `npm run lint` must all exit 0.
A green battery means ZERO failing tests, not "the ones we care about". The two known-red
`it.fails` tripwires are R-owned and are *expected* to fail-as-designed (vitest counts them
as passing); if one flips to unexpectedly PASSING, halt and escalate — do not flip it to
`it`.

**Format check (optional):** `npm run format`

**Standing constraints** (the reviewer enforces on every task):

- **Same rules, no exemptions.** An NPC uses the engine's own function, or that function
  gains an actor parameter so both sides call it. Never write the cast a private parallel
  model — R2c is the standing warning (the sim kept a private copy of the yard ladder that
  had inherited the same bug, so it agreed with the engine *for the wrong reason* and hid a
  live defect for months).
- **Content is data, not logic.** Read the content tables (`DEEDS`,
  `RENOWN_DEED_THRESHOLDS`, `CARGO_TYPES`, `PURCHASABLE_PORTS`, …). Never restate an
  id→value mapping inside the engine.
- **Argue at the definition site.** A rule's reasoning lives in a comment next to the rule,
  not only in `docs/NPC_REDESIGN.md`. The doc is pruned; the code comment is the copy that
  cannot go stale.
- **Never edit a fingerprint, band, threshold or golden to make a test pass**
  (`docs/VERSIONING.md`, "The rule that matters most"). A **stale fixture** gets a new
  capstone. A **live band** that goes red gets re-measured on a **wider sample** — standing
  amendment 1's corollary, *"never report a rate as 0.00 off a small arm — report `< 1/n`,
  or re-run bigger"*. Widening the SAMPLE while every threshold stays byte-identical is the
  sanctioned fix and has precedent at N4 and N10; moving a threshold is not.
- **A save-shape change owes a migration and a round-trip test**, and a migration **calls**
  a rule rather than restating one (the `MIGRATIONS[9]`/`[10]` precedent). `deserializeState`
  must perform the same move as the migration, pinned by a test — the two paths drifting is
  a known hazard.
- **Run `npm run format` BEFORE taking a capstone, never after.** `rulesFingerprint` is
  **not** formatting-invariant (found at N10, contradicting standing amendment 3's N7-FP
  note): a `prettier --write` moves it and stales a fixture extracted minutes earlier.
- **Control arms must not read a stale build.** A probe importing `@spacerquest/engine`
  resolves to `packages/engine/dist`, so `git stash`-ing `packages/` and re-running yields a
  "control" byte-identical to the shipped arm. Import `../packages/engine/src/index.js`
  directly, or run `npx tsc -b` between arms. **The tell is output matching to the last
  decimal** — that is not what a shifted rng stream looks like.
- **Sweep invocation, exactly.** Shards are **1-indexed**: `--shard 1/8` … `--shard 8/8`,
  then `--merge`; verify the merge line reports **8,000 rows** before believing a capstone.
  Both `--milestone-days` and `--aggregate` are load-bearing (see the doc's "sweep command"
  section for why each was missed before).
- **NEVER mark a step SHIPPED without grepping for the named deliverable at the named call
  site.** N3 and N4 were *both* marked SHIPPED with their core change absent; the audit that
  caught them did it in one command per row. A status board is not evidence.

Statuses: `TODO` | `IN-PROGRESS` | `DONE` | `BLOCKED(reason)`

---

## M0 — Housekeeping

### T-001 · Commit the N-series doc prune — `status: DONE` · `coder: sonnet` · `after: —`

`docs/NPC_REDESIGN.md` has an uncommitted prune in the working tree: the N3, N4, N10 and
N7-RIG Result blocks were reduced to `Result` + `Still binds` + a `git show a9cffd85`
pointer, the prune rule was written into the preamble, and two cross-references that
promised now-pruned detail were repointed. Both `#### The audit that reopened this step`
blocks, the parity ledger, the standing constraint, the owner rulings and the N11/N12
hand-offs are deliberately untouched. Commit it as its own logical change. Do not alter the
content — only commit it.

**Accept:** `git status --porcelain docs/NPC_REDESIGN.md` is empty after the commit; a
section-by-section line-count comparison against `a9cffd85` shows changes ONLY in the four
named sections (`### N3`, `### N4`, `### N10`, `### N7-RIG`) with every other `##`/`###`/`####`
section byte-identical; `grep -c "git show a9cffd85" docs/NPC_REDESIGN.md` returns 4; gate green.

**Delivered (2026-07-29):** `2ccbe494`. Committed ahead of the run rather than by it — the
runner halts on a dirty tree as a precondition, and this task's whole deliverable *was* the
dirty tree, so leaving it TODO would have stopped the run before it started. All Accept
clauses verified: prune confined to the four sections, 4 pointers present, 2,054 → 1,717
lines, battery green at 1,312 / 0.

---

## M1 — Owner decision memos: the three UNRULED parity-ledger verbs

THE PARITY LEDGER leaves three rows **UNRULED**, and they gate N8: *"'most' is only honest
if every exclusion is a recorded decision rather than a silent gap. Rule on each (implement,
fast-forward, or exclude with a reason) before N8 pins the living-field baseline."* These
three tasks **do not make the decisions** — they cost each option out with measured evidence
so the owner can rule quickly. Sequenced first because they are cheap, they are the N8
critical path, and they need no capstone.

Each memo goes in `docs/NPC_REDESIGN.md` under a new `## UNRULED VERBS — decision memos
(prepared <date>)` section placed immediately after THE PARITY LEDGER. Each must state, for
its verb: (a) what the PLAYER's version does, by named function and file; (b) what the cast
does today, by named function, with a measured frequency where one is cheap to get; (c) the
three options — implement / algorithmic fast-forward / exclude — each with a concrete
sketch of what it would take and what it would cost; (d) a recommendation with its reason;
(e) an explicit `**DECISION: OWED**` line. **No option may be presented as chosen.**

### T-010 · Memo: the Explore verb — `status: DONE` · `coder: opus` · `after: T-001`

The ledger records Explore as **"never"** for the cast. Read the player's implementation
(`resolveExploration`, `packages/engine/src/actions/exploration.ts`) and establish what it
actually yields — salvage, Nemesis-file signal fragments, POI discovery into
`player.charts.discoveredPois`, and its fuel cost (`EXPLORATION_FUEL_COST`). Establish what
the cast has instead: `npc.ts` has no exploration verb at all, and `NPC_INTENT_TYPES` has no
member for it. Assess honestly whether an NPC exploring is *meaningful*: fragments feed the
player's Nemesis arc (authored, player-facing), and POI discovery writes to a per-actor
charts structure NPCs do not carry — so "implement" may mean inventing a reward that only
exists to be symmetrical, which the standing constraint does NOT require (it requires the
same rules where the verb applies, not that every verb apply). Weigh that against the
opposite reading: explorers are one of the two destitute archetypes (median 167cr) and
salvage is income they currently cannot reach. Quantify the second point — measure the
explorer policy's realised Explore income per 120-day run from the committed capstone or a
short probe — because it decides between "exclude with a reason" and "this is the floor fix
N11/N12 are hunting".

**Accept:** the memo section exists in `docs/NPC_REDESIGN.md` with all five parts (a)–(e)
for Explore; every engine function it names resolves (`grep` each named symbol in
`packages/engine/src` and confirm a hit); it cites at least one MEASURED number with its
provenance (capstone path, or probe shape + seeds × days); it contains the literal string
`**DECISION: OWED**`; no sentence asserts a decision has been made; gate green.

**Delivered (2026-07-29):** Added the "UNRULED VERBS — decision memos" section to
`docs/NPC_REDESIGN.md` with the Explore memo covering all five required parts: what the
player's `resolveExploration` does (die spend, fuel gate, PILOT nav check, POI discovery,
and the three-leg loot roll), what the cast lacks (no `Explore` member in
`NPC_INTENT_TYPES`, no `charts`/`nemesisFile` on `NpcState`), the three costed options
(full parity blocked on N13's dice and N11's actor-scoped deeds; an algorithmic
fast-forward recorded as a partial; exclusion as a ruled decision), a recommendation
grounded in two measured numbers (a from-scratch ablation probe over 120 seeds × 120 days
showing Explore nets 53.8cr/attempt against 400–640cr fuel, and the committed N10 capstone
showing the median day-120 captain cannot afford the fuel gate at all), and a closing
`**DECISION: OWED**` line. Scope boundary: this memo makes no ruling and changes no engine
code — Explore's status for the cast remains unimplemented pending the owner's decision
among the three options.
Orchestration: graphify=none — no graphify-out/graph.json in the repo root · attempts=1/4.

### T-011 · Memo: the VisitHangout verb — `status: TODO` · `coder: opus` · `after: T-010`

The ledger records VisitHangout as **"Socialize stand-in; no borrow/repay"**. Read the
player's implementation (`resolveVisitHangout`, `packages/engine/src/actions/hangout.ts`)
and separate its parts: the dare/wager loop, the loan mechanics (`LOAN_MIN_PRINCIPAL` /
`LOAN_MAX_PRINCIPAL`, `player.loan`, and Penny Wise as the lender), reputation/disposition
effects, and hangout presence. Then read the cast's `executeSocialize` in
`packages/engine/src/npc.ts` and state exactly which of those parts it already reproduces
and which it does not. The sharp question for the memo is the **loan** half: `NpcState` has
no `loan` field, so a captain can neither borrow nor default — and note the live connection
to an ALREADY-OPEN owner question recorded under N4, that `applyDisposition`'s
`loan-default` reason (Penny Wise) lost its reader when the eleven storyline captains left
`NPC_PROFILES`. Assess whether NPC borrowing would give the destitute archetypes a real
recourse (a fighter at 132cr cannot buy fuel, let alone a hull) or merely a way to go
bankrupt more elaborately. Note the save-shape cost of an `NpcState.loan` (a v-bump plus a
migration) so the owner is pricing the real thing.

**Accept:** the memo section exists with all five parts (a)–(e) for VisitHangout; it names
and correctly characterises `executeSocialize` and `resolveVisitHangout` (both greppable);
it explicitly addresses the borrow/repay gap AND its link to the open N4
`loan-default`/`contraband-caught` question; it states the save-migration cost of an
`NpcState.loan`; it contains `**DECISION: OWED**`; gate green.

### T-012 · Memo: the Storylet verb — `status: TODO` · `coder: opus` · `after: T-011`

The ledger records Storylet as **"authored player-facing content"**. This is the row most
likely to be correctly EXCLUDED, and the memo's job is to make that a recorded decision
with a reason rather than an assumption. Establish: storylets are authored prose with
player-facing choices (`packages/content/src/storylets.ts`, resolved by
`packages/engine/src/storylets.ts`), they carry `spendDie` requirements and stat checks
against a hand the cast does not hold until N13, and they are multi-step chains with
scheduled follow-ups — the exact mechanism whose interaction with NPC mortality forced the
`NPC_PROFILES` / `QUEST_PROFILES` split at N3 (a dead captain talking). Note what the cast
DOES already have: dispositions and storylet triggers look them up by id, which is why all
41 records exist. Then assess whether any *non-authored* subset could be fast-forwarded
(e.g. a captain's disposition or flags moving as if a beat had resolved) and whether that
would be a rule the player plays under or a private parallel model the standing constraint
forbids. Recommend, and say plainly what the cost of exclusion is: one of the eleven player
verbs stays player-only, and N8's "most of a full player's actions" claim must count it as
a ruled exclusion.

**Accept:** the memo section exists with all five parts (a)–(e) for Storylet; it names the
`NPC_PROFILES`/`QUEST_PROFILES` split and the mid-chain-death failure mode as the reason the
question is not hypothetical; it addresses the N13 hand dependency; it states the cost of
exclusion in the ledger's own terms; it contains `**DECISION: OWED**`; the three memos now
present cover exactly Explore, VisitHangout and Storylet and no other verb; gate green.

---

## M2 — N11: NPCs earn deeds and Renown (MUST-HAVE)

Implements `### N11` in `docs/NPC_REDESIGN.md` — **read that section and its
`[!IMPORTANT]` hand-off block from N10 first.** The dead end being removed: `ShipyardActor.
registry` is optional and no NPC has one, so `actorRankIndex`
(`packages/engine/src/actions/shipyard.ts:73`) returns −1 — strictly below every rung —
forever, and no NPC deed source exists anywhere in the engine. Every rank gate is therefore
a permanent lockout with **no recourse**, which standing-constraint consequence 2 defines as
an exemption: a gate the actor can never open is not the same rule the player plays under,
because the player can EARN the key.

### T-020 · NPC deed registry, fed by the actions captains already perform — `status: TODO` · `coder: opus` · `after: T-012`

Give every simulated captain a deed registry that accrues from their real actions, through
the **same** deed definitions and thresholds the player uses (`DEEDS` and
`RENOWN_DEED_THRESHOLDS` from `@spacerquest/content`; `rankForDeedCount` from
`packages/engine/src/deeds.ts`). Sources are the ones N11 names: hauls delivered, fights won
(N3's interdictions), careers survived.

**The design tension to resolve, named because it is the whole task:** the player's
`evaluateDeeds` (`packages/engine/src/deeds.ts:270`) is hard-wired to
`state.player.registry` and scans `state.eventLog` from a source index. Re-running that per
captain per dusk over an unbounded log for 30 captains is not affordable (see the doc's
performance envelope: ~40 ms/day total is the budget N0 bought). Resolve it **without** a
private parallel model: either give the deed machinery an actor parameter so both sides call
one function, or accrue per-captain counters on the `NpcState` record and evaluate them
against the SAME content thresholds through a shared predicate. Whichever you choose, the
THRESHOLDS and the DEED DEFINITIONS must come from content and the rank must come from
`rankForDeedCount` — no second ladder, no NPC-only deed table. **Do NOT synthetically
backfill rank at world creation**: N11 is explicit that the fast-forward allowance applies
to the SOURCE (coarse verbs standing in for played days), never to unearned rank, and a
tier-5 captain seeded with a rank they never earned is exactly the "constant recomputed from
profile" N1 existed to kill. `createInitialState` must start every captain at zero deeds.
This is a save-shape change: bump `CURRENT_SAVE_VERSION` 11 → 12 with a `MIGRATIONS[11]`
entry that backfills an empty registry (a statement of fact — no existing save has NPC
deeds), and make `deserializeState` perform the same backfill, pinned by a test.

**Accept:** `grep -n "registry" packages/engine/src/npc.ts` shows a real per-captain
registry being written by the verb paths (not merely typed); a simulated captain's deed
count is > 0 after a 120-day ambient run in a test, and every earned id is a member of
content `DEEDS`; `rankForDeedCount` is the only rank derivation for NPCs (no second
threshold table anywhere — `grep -rn "RENOWN_DEED_THRESHOLDS" packages/engine/src` shows no
NPC-specific copy); `createInitialState(1)` gives every captain zero deeds and rank
`LIEUTENANT`, asserted by a test; `CURRENT_SAVE_VERSION === 12` with a `MIGRATIONS[11]`
entry, a v11→v12 round-trip test, and a test asserting `deserializeState` and the migration
agree; gate green.

### T-021 · The Renown gate becomes reachable — `considerRefit` learns rank-gated equipment — `status: TODO` · `coder: opus` · `after: T-020`

With a registry in place, make the gate actually bite and actually open. `considerRefit`
(`packages/engine/src/npc.ts`) currently never requests special equipment, which is the only
reason the −1 lockout has been dormant. Extend its ladder to consider rank-gated special
equipment (`SPECIAL_EQUIPMENT`), routed through the EXISTING gate in
`quoteShipyard`/`applyShipyardMutation` — the `requiredRank` check at
`packages/engine/src/actions/shipyard.ts:397` must be the one and only gate, with **no NPC
branch**. Pass the captain's registry through `ShipyardActor` so `actorRankIndex` reads a
real standing instead of returning −1. Respect `NPC_YARD_RESERVE` as the existing
discretionary-money line; add no new pacing constant unless the sweep demands one, and if
you do, argue it at its definition site. Note the open watch item **OI-9** (the NPC refit
spends no die) is deliberately NOT in scope — do not "fix" it here.

**Accept:** `grep -n "SPECIAL_EQUIPMENT" packages/engine/src/npc.ts` returns a hit inside
the refit path; a test shows a captain with sufficient deeds PURCHASING a rank-gated item
and a captain without them being REFUSED, both through `quoteShipyard`/
`applyShipyardMutation` with no NPC-specific branch in `shipyard.ts` (diff shows no new
`if (isNpc…)`-shaped code); `actorRankIndex` returns ≥ 0 for a captain carrying a registry,
asserted directly; no new pacing constant, or one with a definition-site argument; gate green.

### T-022 · Instrument: rank distribution and special-equipment purchases — `status: TODO` · `coder: sonnet` · `after: T-021`

N11's Simulate clause asks for **rank distribution at day 30/60/120** and
**special-equipment purchase counts**, and this must land BEFORE the capstone — the lesson
N9, N4 and N10 each paid for is that a mechanism the instrument cannot see cannot be graded
(N9: "the aggregate cannot see an asset"; N4: `sampleMilestone` sampled all 41 records;
N10: nothing in `packages/sim` counted `ContractClaimed` at all). Copy N10's worked example:
add the per-captain rank/deed-count to `MilestoneSample` alongside the existing
`npcCredits`/`npcHullStrength`/`npcFuel`/`npcSystemId` arrays (via `sampleField`, so the
arrays cannot fall out of step), add a special-equipment purchase count to
`CampaignStatsReport`, and surface both on `PolicyAggregate` in
`packages/sim/src/balance/aggregate.ts`. Sample the FIELD, not the record count —
`isSimulatedCaptain` from `@spacerquest/content` is the shared predicate; `NPC_PROFILES.
length` is 30, `state.npcs.length` is 41, and 31 is the board. Write a named-reader test in
the style of `packages/sim/src/__tests__/campaign-contracts.test.ts` (bands and structural
invariants, never pinned digits).

**Accept:** `MilestoneSample` carries per-captain rank/deed data and it is populated via
`sampleField` (diff shows one traversal, one filter); the report carries a
special-equipment purchase count; both appear on `PolicyAggregate`; a named-reader test file
exists and asserts the scalar-equals-its-own-series identity plus bounds; a test asserts the
sampled field length equals `NPC_PROFILES.length` AND is strictly less than
`state.npcs.length`; gate green.

### T-023 · N11 closeout: capstone, verdict, re-pin, Result block — `status: TODO` · `coder: opus` · `after: T-022`

Close the step per standing amendment 4 (all four of: heading carries `(SHIPPED <date>)`, a
`**Result:**` block is appended, the sequencing diagram reflects reality, and anything that
changes DIRECTION is written into the step it affects). Order matters: **`npm run format`
FIRST**, then the capstone, then the fixture. Take the capstone exactly as the doc's "sweep
command" section specifies (1,000 seeds × 120 days × 8 policies, `--milestone-days
21,29,30,41,60,120`, all eight 1-indexed shards, `--merge`, confirm 8,000 rows), diff it
against `docs/balance/baseline-n10-shipped.json`, then re-extract the smoke fixture FROM the
new capstone and confirm the extractor prints `spreads harvested`. Grade **both** Proves
limbs and **both** Disproves limbs explicitly — *renown inflation* (does the median captain
outrank a competent player? compare against the player's rank distribution in the same
capstone) and *zero accrual*. Then answer N10's hand-off, which is the thing that outranks
the verdict: **report the per-archetype wealth FLOOR (p10) beside the rank distribution**,
because a deed economy sourced from *winning* may be unreachable for the captains who most
need it (a fighter at 132cr flies a hull-40 ship and loses fights). Do not tune deed
weights to make the floor move — measure and report; a re-pricing is an owner call. If the
baseline is re-pinned, move `balance-targets.test.ts`'s path and standing amendment 1's
pointer **in the same commit**. Follow the prune rule in the doc preamble when writing the
Result: verdict + Still binds + a `git show` pointer, not a narration.

**Accept:** the capstone exists at `docs/balance/baseline-n11-*.json` and its merge reported
8,000 rows; `npm run balance:diff` output against `baseline-n10-shipped.json` is recorded in
the Result; the fixture was re-extracted from THAT capstone with `spreads harvested`; the
Result block explicitly grades all four Proves/Disproves limbs by name and reports both the
rank distribution at day 30/60/120 and the per-archetype p10 wealth floor; if the baseline
moved, `grep -rn "baseline-n11" packages/sim/src/__tests__/balance-targets.test.ts` returns
a hit AND standing amendment 1's pointer names the same file; the status board row, the
sequencing diagram and any hand-off into N12/N13 are updated; **every deliverable named in
T-020 and T-021 is re-verified by grep at its call site and the greps are recorded in the
Result**; battery green with zero failures and no threshold, band, golden or fingerprint
edited to achieve it (any live-band red was fixed by widening the sample, with the widening
argued in that test file).

---

## M3 — N12 groundwork

### T-030 · FIRST TASK: the instrument learns to see ports — `status: TODO` · `coder: sonnet` · `after: T-023`

N12's own FIRST TASK, pulled forward by owner ruling because it is a precondition rather
than part of the port change: `sampleMilestone` (`packages/sim/src/index.ts`) records `crew`
but **not `ports`**, so the aggregate cannot see an asset for the player, let alone for a
captain. If the cast starts buying ports before the instrument can count them, N12's sweep
cannot see its own effect — the R0a/R2a class of mistake, one more time. Teach milestones
`ports` for the PLAYER and per-NPC, following the shape T-022 and N10 established: extend
`MilestoneSample` (per-NPC arrays through `sampleField` so they cannot fall out of step with
each other), surface a port-ownership aggregate on `PolicyAggregate`, and add a named-reader
test. Note that per-NPC port data will read as empty until N12 proper lands — that is
correct and expected; assert the SHAPE and the player's side now, so N12 inherits working
plumbing. `MilestoneSample`'s own doc comment states it carries only fields
`balance/synthesize.ts` can write back, so either extend the synthesizer to restore ports or
amend that comment to record precisely why ports are exempt — do not leave the invariant
silently false.

**Accept:** `MilestoneSample` carries player ports AND a per-NPC port array populated via
`sampleField`; a port-ownership figure appears on `PolicyAggregate`; a named-reader test
asserts the player's port count tracks a career that buys one (drive it, or reuse the
`portBuyingVeteranPolicy` pattern from `packages/sim/src/__tests__/campaign-reach.test.ts`);
the `MilestoneSample` doc comment is either satisfied by an extended `synthesize.ts` or
amended with the stated exemption — verify by reading it; gate green.

---

## M4 — Checkpoint

### T-040 · CHECKPOINT — owner review: three rulings + N11's verdict — `status: TODO` · `coder: sonnet` · `after: T-030` · `[BLOCKED BY = Human Gate]`

Automated preparation only: assemble a single review brief at
`docs/N-SERIES-REVIEW-<date>.md` that collects, with no new analysis and no decisions, (1)
the three UNRULED verb memos' recommendations and their `DECISION: OWED` lines, (2) N11's
verdict with its four graded limbs and the per-archetype p10 floor, (3) the still-open items
this run did not touch: `executeCombat` remains the pre-N3 abstraction so fighters take 0
deaths (a PARITY LEDGER Combat-row gap), watch item **OI-9** (the NPC refit spends no die),
the N4 `loan-default`/`contraband-caught` re-siting question, N7-RIG's still-open new-hashed-
ROOT hole, and R-owned **R10** (the tier-1 hull cliff) which confounds this track's sweeps.
Commit the brief. Then the run **halts** — every item in it is an owner decision and the
runner must never self-approve one.

**Accept:** (human-checked) the brief is committed and contains all three parts with the
still-open list complete; the owner has ruled on Explore, VisitHangout and Storylet, and has
accepted or rejected N11's verdict.

---

## Deliberately deferred

Out of scope for this run — recorded so they are not re-scoped in by a coder:

- **N12 proper (NPCs buy ports).** Only its FIRST TASK (T-030) is in scope. The step itself
  needs the owner's read on N11's floor result first, because N10 established that a fix
  routed through Trade cannot reach a captain who does not trade, and ports funded out of
  cash may be a four-archetype economy.
- **N13 (dawn-hand parity) and N5 (proficiency spread).** N5 is gated by N13, and N13 is the
  step that closes the die-choice gap in the Combat row.
- **N14 (captain-voice wire boast).** An EXPERIMENT, outside the MUST-HAVE chain.
- **N8 (re-pin against a living field).** Blocked until N10–N12 are done AND the three
  UNRULED rows are ruled.
- **`executeCombat`'s missing shared rules.** A real parity gap (N3-shaped, not N4-shaped),
  but whether it lands as an N3 follow-up or at N13 is a sequencing decision for the owner.
- **OI-9** (the NPC refit spends no die) — a recorded watch item with a reasonable argument
  on both sides; its trigger is the field out-fitting the player, which has not fired.
- **Anything R-owned:** R10's tier-1 hull cliff and the known-red `it.fails` tripwires. Flip
  a tripwire back to `it` only in the commit that fixes its defect.
