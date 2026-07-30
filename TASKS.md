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

### T-011 · Memo: the VisitHangout verb — `status: DONE` · `coder: opus` · `after: T-010`

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

**Delivered (2026-07-29):** Added the "VisitHangout — decision memo" section to
`docs/NPC_REDESIGN.md`, covering all five parts (a)–(e). Part (a) decomposes the player's
`resolveVisitHangout` into its six separable parts (venue gate, die spend, presence, the
dare/wager loop, disposition beats, the rumor host slot) plus the loan mechanics
(borrow/repay/accrual/default) with their content-derived arithmetic. Part (b) shows
`executeSocialize` reproduces only the GUILE check, with a measured cast probe (n =
424,695 living simulated captain-days) quantifying the counterparty-less faucet at +44.1cr
per action / +4.86cr per captain-day, and that 95.91% of cast Socialize actions resolve
where no Hangout exists. Part (c) prices all three options (full parity, algorithmic
fast-forward, exclude-with-reason), including both the nullable and optional forms of an
`NpcState.loan` save-shape addition. Part (d) recommends option 2 over option 1, gated on
the N4 `loan-default`/`contraband-caught` ruling being resolved first, and explicitly
flags the counterparty faucet as the strongest independent finding. Part (e) closes with
`**DECISION: OWED**` — the memo characterizes and prices the options but does not itself
choose among them, matching T-012's identical pattern for Storylet. Scope boundary: no
engine or save-shape code was touched — this task is documentation-only, as scoped; the
`NpcState.loan` field, shared accrual extraction, and N4 re-siting ruling all remain for
whichever future task the owner selects.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent) · attempts=1/4.

### T-012 · Memo: the Storylet verb — `status: DONE` · `coder: opus` · `after: T-011`

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

**Delivered (2026-07-29):** Added the "Storylet — decision memo" section to
`docs/NPC_REDESIGN.md`, covering all five parts (a)–(e). Part (a) decomposes the player's
storylet pipeline (dispatch, the constantly-running offer refresh, `triggerMatches`'
player-and-world-scoped inputs, the die-gated entry, the refusal ladder, `applyEffects`'
ten write targets, the once-only `completed` ledger, and the multi-step scheduling
mechanism) with content-derived arithmetic from a gitignored census script (114 storylets,
254 choices, 40 die-gated, 112 of 114 `repeat: 'never'`). Part (b) shows the cast has no
Storylet verb or intent at all — "0 by construction" — and that the 41 `NpcState` records
exist only as the storylet system's lookup subject, not as participants; it also verifies
the `NPC_PROFILES`/`QUEST_PROFILES` split is live (10/10 storylet-referenced npc ids are
quest profiles, 0/30 are simulated captains) and flags that the `dead` check is missing at
three storylet call sites plus that storylet events carry no actor and get folded into the
player's smuggling counters. Part (c) prices all three options, showing option 1 requires a
per-captain `StoryletState` sub-state, a save-version bump queued behind N11, and a sixth
`NPC_INTENT_TYPES` member, while option 2 reduces to the narrow `resolveAbandonedChains`
precedent once its two sub-shapes are separated. Part (d) recommends option 3
(exclude-with-reason) on four grounds, chiefly that the shared once-only `completed` ledger
makes cast participation subtractive rather than additive for the player. Part (e) closes
with `**DECISION: OWED**` — the memo prices and recommends but does not itself choose,
matching T-011's pattern. Scope boundary: no engine or save-shape code was touched — this
task is documentation-only, as scoped; the two flagged defects (unfiltered `dead` lookups,
actor-less storylet events) and the option-1/option-2 implementation work all remain for
whichever future task the owner selects.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent) · attempts=1/4.

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

### T-020 · NPC deed registry, fed by the actions captains already perform — `status: DONE` · `coder: opus` · `after: T-012`

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

**Delivered (2026-07-29):** Every simulated captain now accrues deeds through the exact
same machinery the player uses. `deeds.ts`'s `evaluateDeeds` was generalized into
`accrueDeeds(actor: DeedActor, sourceEvents, ctx)`, an actor-shaped function taking either
`state.player` or an `NpcState` with no wrapper object, backed by one matcher
(`matchesState` now reads a `{ player: actor }` view so `STATE_PATHS` stays literally true
for both sides), one count ladder, and one `rankForDeedCount` rank derivation — content's
`DEEDS` and `RENOWN_DEED_THRESHOLDS` remain the only source of truth, with no NPC-only deed
table (`grep -rn "RENOWN_DEED_THRESHOLDS" packages/engine/src` shows no second copy).
`NpcState` gained a `registry: DeedRegistryState` field, written at the real verb call
sites in `npc.ts` (haul delivery, jump arrival, interdiction combat, socialize) via a new
`accrueDeeds(updatedNpc, deedSource, ctx)` write site, and every captain is seeded through
one shared `emptyDeedRegistry()` (called from `createInitialState`, `deserializeState`, and
the new `MIGRATIONS[11]` entry) so no captain is born or migrated with unearned rank —
`createInitialState` gives every captain zero deeds and rank `LIEUTENANT`, pinned by a
test. `CURRENT_SAVE_VERSION` bumped 11 → 12 with a `MIGRATIONS[11]` backfill, a v11→v12
round-trip test, and a test asserting the migration and `deserializeState` agree.
`docs/NPC_REDESIGN.md` records three ruled scope boundaries rather than silent exemptions:
a captain's `deliver-cargo` legitimately carries `success: true` regardless of the Trade
check (matching the player's own delivery event and the existing "no economic swing"
ruling on that check); "careers survived" is left **unsourced** because content ships no
survival/day-count deed and inventing an NPC-only one would recreate the second deed table
this task exists to prevent; and encounter/yard verbs that emit no matching deed source
are named as the cheapest next widening lever rather than fabricated. A measured 3-seed x
120-day ambient run shows the reachable set is bounded to 13 deed ids with ADMIRAL as the
observed ceiling — a structural finding for T-021/T-023, not a threshold to retune. The
smoke fixture (`docs/balance/smoke/tiers.json`) was re-extracted from a fresh 8,000-row
capstone (`docs/balance/baseline-t020-registry.json`) because the registry moved
`rulesFingerprint` and `saveSchemaVersion`; `balance:diff` against the shipped baseline
reports nothing moved, which is expected since no `PolicyAggregate` field can see an NPC
deed until a later task wires one in — the baseline of record is unchanged. Scope boundary:
this task delivers the registry and its accrual plumbing only; the Renown gate itself
(rank-gated equipment in `considerRefit`) remains T-021's, untouched here.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root. · attempts=2/4.

### T-021 · The Renown gate becomes reachable — `considerRefit` learns rank-gated equipment — `status: DONE` · `coder: opus` · `after: T-020`

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

**Delivered (2026-07-30):** `considerRefit` (`packages/engine/src/npc.ts`) now walks
`SPECIAL_EQUIPMENT` filtered to rows declaring a `requiredRenownRank` — a data filter read
off content, not an NPC-side id list — and asks the yard for each one BEFORE the component
ladder, so the ask is exercised every career rather than only after all eight components
are maxed. The ask itself carries no rank comparison: `actorRankIndex`
(`packages/engine/src/actions/shipyard.ts`) was exported so "returns ≥ 0 for a captain" is
directly assertable, and `specialEquipmentFailure`'s `requiredRank` check remains the one
and only gate on both sides (`grep -n "if (isNpc"` on the `shipyard.ts` diff returns
nothing). New tests in `npc.test.ts` and `shipyard.test.ts` earn a captain's rank through
real `accrueDeeds` deed sources (never a hand-set `renownRank`) and show the earned captain
purchasing a rank-gated item through `resolveNpcDay` while a zero-deed twin is refused on
every one of 20 seeded days. Scope boundary: the four ungated special-equipment items
(CLOAKER, AUTO_REPAIR, TITANIUM_HULL, TRANS_WARP) are deliberately deferred — TITANIUM_HULL
alone adds +50 cargo pods, which would put a non-Renown economy swing inside the arm T-023
must attribute to the Renown gate — and OI-9 (the NPC refit spends no die) remains
untouched, per the task's own exclusion. The smoke fixture and two campaign fixtures were
re-pinned against the moved `rulesFingerprint`/`docsFingerprint` and policy fingerprints;
no `expected` number or baseline of record moved.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; nothing to query). · attempts=1/4.

### T-022 · Instrument: rank distribution and special-equipment purchases — `status: DONE` · `coder: sonnet` · `after: T-021`

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

**Delivered (2026-07-30):** `MilestoneSample` now carries `npcDeedCount` and
`npcRenownRank` per simulated captain, added to `sampleField`'s single
traversal/filter alongside the existing four arrays so all six stay index-aligned;
`CampaignStatsReport` gained `npcSpecialEquipmentPurchases` (summed from a new
per-day `CampaignDayStats.npcSpecialEquipmentBought` state-diff over the
rank-gated `SPECIAL_EQUIPMENT` rows, read off content rather than an id list);
both surfaced on `PolicyAggregate` (`npcSpecialEquipmentPurchases(PerRun)`) and
`MilestoneAggregate` (`npcDeedCount` distribution, `npcRenownRanks` histogram);
the new headline metric was added to `diff.ts`. A named-reader test,
`packages/sim/src/__tests__/campaign-renown.test.ts`, asserts the
scalar-equals-its-own-series identity, the 30-vs-41 field/roster distinction,
six-array index alignment, monotonicity across milestone days, the JSON
round-trip, and the one live band (the gate is actually walked through, not
merely offered). The deliberate scope boundary: `MilestoneSample`'s per-captain
data is measurement-only and is NOT restored by the synthesizer, so a
synthesized captain in the smoke-tier fixtures still reads as a zero-deed
LIEUTENANT — that gap is documented on the type rather than silently left; the
smoke `tiers.json` fixture was re-extracted (instrument/docs fingerprints moved,
`rulesFingerprint` unchanged since no engine/content file was touched) and
`balance-degraded`'s fingerprint log carries the before/after hashes with a
locally-verified proof that the new fields are the only cause of the move.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; nothing to query). · attempts=1/4.

### T-023 · N11 closeout: capstone, verdict, re-pin, Result block — `status: DONE` · `coder: opus` · `after: T-022`

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

**Delivered (2026-07-30):** N11 is SHIPPED — **CHANGE ACCEPTED, HYPOTHESIS HELD, both
Disproves limbs survived**, and N10's hand-off is discharged with a NO for the third time.

Order kept: `npm run format` FIRST (**a no-op** — `prettier --check .` was already clean, so
no fingerprint moved on the formatting pass), then `npx tsc -b`, then a dist-freshness probe
(`CURRENT_SAVE_VERSION 12`, registry present on all 41 records) because the sweep resolves
`@spacerquest/engine` to `dist` — N10's recorded trap. Stale `rows-n11-shipped-shard*` were
removed before sweeping so the merge glob could not double-count.

**The capstone.** Exactly the doc's sweep block: 1,000 seeds × 120 days × 8 policies,
`--milestone-days 21,29,30,41,60,120`, all eight 1-indexed shards (each logged `wrote 1000
rows`, ~2m57s), then `--merge`, which reported eight `merged 1000 rows` lines and *"wrote
aggregate for 8000 rows to docs/balance/baseline-n11-shipped.json"*. Asserted off the
artefact itself: `runs 8000`, `seeds 1000`, `days 120`, 8 policies, `byPolicy.length 8`,
every `byPolicy[*].milestones.length 6`, `fleet.milestones` days `21,29,30,41,60,120`.

**The diff** (`balance:diff` vs `baseline-n10-shipped.json`, epsilon 0): **9 moved rows,
757 shape changes** — the added paths are exactly T-022's fields
(`fleet.npcSpecialEquipmentPurchases(PerRun)` and per-milestone `npcDeedCount.*` /
`npcRenownRanks.*`), reported as present-on-one-side rather than as equal. NOT "NOTHING
MOVED", and the asymmetry is the evidence this is an NPC-side change: player rows barely
move (fleet Tour One clear 0.5180 → 0.5172, final credits median 30,915 → 30,518, deaths per
1,000 days 0.6573 → 0.6417; no policy's clear rate moves more than 2.4 points) while
NPC-facing rows move by tens of percent (`fleet.milestones[day 60].npcCredits.p75` 16,641 →
5,967, −64%). Per policy, `finalCredits.median`: explorer 58,533→58,119 · gambler
45,869→45,343 · smuggler 27,147→26,623 · trader 50,856→51,561 · trader-degraded
33,508→35,343 · veteran 5,552→5,640.

**The fixture** was re-extracted FROM that capstone (never bare) and printed
`[smoke] 4 tiers, spreads harvested, rules b6f27d2bceabde59 / instrument db515475e166a538 /
docs 118e033b2c04807a`. `provenance` now reads `sweepLabel n11-shipped` / `runs 8000` /
`spreadSource harvested`. **All three fingerprints unmoved** — T-023 touches no hashed rule
source, so only the harvested spreads and the provenance changed.

**The four limbs, each by name.** *Proves 1 (real ranks + purchases through the gate)* —
**HELD**, with the rank distribution (`npcRenownRanks`, 240,000 captain-slots at each day)
reported at ALL THREE days: **day 30** COMMODORE 43.5% / CAPTAIN 39.5% / COMMANDER 15.4% /
LIEUTENANT 1.6% / ADMIRAL 0.0% (8 slots) · **day 60** COMMODORE 66.4% / CAPTAIN 22.6% /
COMMANDER 9.5% / LIEUTENANT 1.4% / ADMIRAL 0.0% (105) · **day 120** COMMODORE 75.4% /
CAPTAIN 14.8% / COMMANDER 8.1% / LIEUTENANT 1.3% / ADMIRAL 0.4% (881). An earned rank above
the zero-deed rung is held by 98.4% → 98.6% → 98.7% of slots and CAPTAIN or better by
82.9% → 89.0% → 90.5% (exact day-120 value 90.53%; an earlier draft's "90.6%" was a
rounding slip, corrected); `npcSpecialEquipmentPurchases` 342,168 over 8,000 runs
= **42.771 per run**. *Proves 2 (Honor List top end / spine contested)* — **HELD as an
intersection**: 73.3% of captain-slots own a gated fit at day 120, owners sit at mean
component rank 11.73 vs non-owners 25.06, gated owners are in the component top 5 in 20/20
seeds and a waiting player holds 0 of the 8 titles — graded as an intersection because
`honorList` scores `SHIP_COMPONENTS` only and is **structurally blind** to
`hasStarBuster`/`hasArchAngel` (recorded as a finding and handed to N12; not "fixed" here).
*Disproves · renown inflation* — **NOT DEMONSTRATED**: off the same distribution the cast's
median rung runs CAPTAIN → COMMODORE → COMMODORE across days 30/60/120 and never exceeds
COMMODORE; at day 120 that is cast median COMMODORE (9 deeds) vs player median TOP_DOG (17),
two rungs apart, and **no cast slot reaches TOP_DOG or above at any milestone day**; even
the pathological `greedy` arm is CAPTAIN 55.2% / COMMODORE 43.1%. *Disproves · zero accrual* — **NOT DEMONSTRATED**: the
limb N10 flagged as most at risk clears most clearly — the fighter's deed count is p10
1→2→2 / median 5→7→8 across days 30/60/120, the explorer's p10 4→5→5; fleet `npcDeedCount`
p10 3/4/5, median 8/9/10.

**N10's hand-off, which outranks the verdict — THE PER-ARCHETYPE p10 FLOOR, and it did not
move for the THIRD time.** Measured with a gitignored probe over the two capstones' own row
sets, importing `quantile` from `packages/sim/src/balance/aggregate.ts` rather than
re-deriving it, and **self-checked before any before/after number was believed**: the
probe's pooled p10/median equalled both committed artefacts exactly at all three days
(n11 126/1007 · 126/1311 · 126/55437; n10 126/1024 · 126/2655 · 126/76049). p10 day 120,
n10 → n11: trader 382,939 → 329,990 · **fighter 125 → 125** · **explorer 125 → 125** ·
veteran 127 → 127 · gambler 128 → 126 · smuggler 132 → 130 · **POOLED 126 → 126**. Flat at
day 30 and day 60 too, and flat to ±1cr across all eight policy arms.

**The structural reason, which is the finding to carry forward: A DEED PAYS NO CREDITS.**
`deeds.ts` never touches `credits` — a deed is a rank counter and rank is a *spending
unlock*, so N11's only possible cash effect is OUTWARD, and that is what the capstone
measures: cast median wealth **FELL** 76,049 → 55,437 (−27%) and the trader floor fell
382,939 → 329,990, because the captains who could afford the gate bought through it. N10
hoped a deed sourced from fights won would be "the first income-adjacent reward a fighter
earns"; no such reward exists in the engine, for player or NPC. **No deed weight,
`RENOWN_DEED_THRESHOLDS` entry, `150 × tier` or pacing constant was touched** — measured and
reported; a re-pricing is an owner call.

**The re-pin,** in this one commit: `balance-targets.test.ts:103` (the path string only — it
is deliberately data, not code) and standing amendment 1's pointer both now name
`docs/balance/baseline-n11-shipped.json`, with `baseline-n10-shipped` joining the predecessor
list and the `baseline-n4-control.json` "is NOT a baseline" note untouched. The trader
`debtClearedDay` median is **21 at both capstones**, so `balance-targets`' clear-day band is
still correctly red for the same R-owned reason and `TRADER_CLEAR_DAY_MIN/MAX` were not
touched. `docs/BALANCE-REDESIGN-WORKLIST.md:15`'s stale R-series pointer was deliberately
left alone — it carries its own caveat at line 734, and amendment 1 plus the test path are
the two authoritative pointers.

**The T-020/T-021 re-verification greps, all ten at the closing tree.** `registry` in
`npc.ts` (the `accrueDeeds(updatedNpc, deedSource, {…})` write site at `npc.ts:2000`, with
the rule reasoning at `:1969-1999`) · `accrueDeeds` one definition (`deeds.ts:366`) called by
both the NPC path (`npc.ts:2000`) and the player's dusk wrapper (`deeds.ts:536`) ·
`RENOWN_DEED_THRESHOLDS` in engine src is `deeds.ts` only plus comments in
`npc.ts`/`save.ts`/`types.ts` — **no NPC-specific copy**, and `npc.ts:781` still carries the
"appear nowhere in this file" comment · `emptyDeedRegistry` one definition (`deeds.ts:300`),
call sites `state.ts:101`/`158`/`309` and `save.ts:358` (`MIGRATIONS[11]`) — never inlined ·
`CURRENT_SAVE_VERSION = 12` (`save.ts:364`) with `11: (v11State) =>` at `save.ts:352` ·
`rankForDeedCount` the only rank derivation on both sides (`deeds.ts:257`, read by
`state.ts:221`, `save.ts:270`, `demo.ts:110`, `deeds.ts:301`/`472`) ·
`SPECIAL_EQUIPMENT`/`requiredRenownRank` as a **data filter** in the refit path
(`npc.ts:890-891`) · `actorRankIndex` exported at `shipyard.ts:85` with the single gate at
`:406-410` · **`grep -rn "isNpc" packages/engine/src/actions/shipyard.ts` returns NOTHING**
(exit 1) — no NPC branch · `grep -rn "baseline-n11" packages/sim/src/__tests__/balance-targets.test.ts`
hits `:103`.

**Battery: 1,347 passing / 0 failing** (engine 795 · sim 315 · ui 135 · desktop 102), plus
`balance:smoke` green (123 in `balance-smoke` + `balance-rig`). **No threshold, band, golden
or fingerprint was edited and no sample needed widening** — the step touches no engine or
content source, so nothing re-derived. Three `it.fails` tripwires are still correctly red
and all three are R-owned: `balance-targets`' clear-day band and
`balance-combat-survival`'s death-rate floor and Auto-Repair assertions.

**Docs.** N11's heading carries `(SHIPPED 2026-07-30)`; the Result block is appended and
pruned per the doc preamble's prune rule (verdict + Still binds + a `git show` pointer) —
the two `#### RULINGS RECORDED AT T-02x` narration subsections were collapsed to
`git show 57fe2dcb 67b5f4eb 7f7cc5d0 -- docs/NPC_REDESIGN.md TASKS.md` with every
prospective clause carried into Still binds (the three ruled exclusions, the removal of the
reverted attempt's two self-granted exemptions, the 13-deed/ADMIRAL ceiling as a structural
fact and never a reason to touch `RENOWN_DEED_THRESHOLDS`, T-021's four rulings including
OI-9 still open, and the `honorList` blindness); both `> [!WARNING] REVERTED ATTEMPT` blocks
kept (superseded-landmine class). Status board row, run-order line and "Next unblocked step:
N12" updated; the measurement-debt `[!NOTE]` re-pinned at N11 with the new battery count;
the PARITY LEDGER's Shipyard row now reads **gate shipped (N11)** with OI-9 open and the
Renown twelfth row is rewritten from "N11 removes it" to removed-at-N11 plus the
deed-pays-no-credits fact; `WHAT AN NPC ACTUALLY IS TODAY` loses "no deeds or rank (N11)"
from *still true at HEAD*; the sequencing diagram marks N11 DONE and N12 `◄── NEXT`.

**Hand-off written into the step it affects** (amendment 4's fourth clause): a
`> [!IMPORTANT] WHAT N11 HANDS TO N12` block with four items — (1) **N12 is the last
MUST-HAVE that could move the floor, and a cash-funded port economy is a two-archetype
economy, not a six**, so port ownership must be measured PER ARCHETYPE from the first task
(a fleet-wide count would hide it, the same class of blind spot as N4's 41-record bug);
(2) **the field is now armed and 27% poorer**, so a land-grab paced against N10's
`npcCredits` distribution is paced against a purse that no longer exists; (3) **`honorList`
is blind to non-component assets**, so a port will be invisible on the board too — N12 will
hit this before N13 does; and (4) for **N13**, the cast is nearly deed-saturated (median 10
of an available 13), so a five-die hand raises *choice*, not rank.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; nothing to query). · attempts=4/4.

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
