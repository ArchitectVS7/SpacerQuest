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

## Orchestrator protocol

1. **Check out** the first task with `status: TODO` whose `after:` tasks are all DONE. Set it IN-PROGRESS.
2. **Plan** — hand the coder the task block plus the pointers named in the intro. Nothing else.
3. **Code** — implement per the plan and the Standing constraints.
4. **Review** — check the diff against the task's **Accept** criteria (written to be mechanically checkable).
5. On pass: run the gate, commit as `<ID>: <title>`, set `status: DONE`, update this file in the same commit. On fail: one fix round, then escalate, then halt.

**Gate (every task):** `npm test`, `npx tsc -b`, and `npm run lint` must all exit 0. A green
battery means ZERO failing tests. The known-red `it.fails` tripwires are R-owned and are
_expected_ to fail-as-designed; if one flips to unexpectedly PASSING, halt and escalate — do
not flip it to `it`.

**Format check (optional):** `npm run format`

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

## M1 — Specification (both systems, before any implementation)

### T-100 · Spec the Explore system: engine/content framework + the time cost — `status: TODO` · `coder: opus` · `after: —`

Audit today's Explore end to end (`packages/engine/src/actions/exploration.ts`,
`packages/content/src/exploration.ts`, `POI_KINDS`, `POI_LOOT`, `EXPLORATION_NAV_DC`,
`EXPLORATION_FUEL_COST`, and the fragment pools in `content/nemesis.ts`) and write
`docs/EXPLORE_REDESIGN.md`: a spec, not an implementation. It must settle four things.
**(1) The outcome taxonomy** — the owner's brief names _unique item_, _questline_, _NPC_,
_lore bit_, and plain _salvage/credits_, with "dead end" meaning lore with no mechanical
payoff. Define each as a typed content shape the engine can resolve without knowing any
instance. **(2) The time cost, which is the sharp new mechanic** — _"recovering said items
should consume time, especially if powerful"_. Today Explore resolves inside one day. Cost
out at least three shapes (a multi-day committed recovery that occupies future days; a
repeated-visit model; a single day whose die cost scales with value), and say what each does
to the day loop, to `GameState`, and to the save version. **(3) The unique-item effect
surface** — the brief names _+x to a ship element_ and _+y on a die roll_. The first has a
home (`ShipState` components, `SPECIAL_EQUIPMENT`); the second **does not exist in the engine
today** and is the harder half — say where a die-roll modifier would live and what reads it.
**(4) The value ladder** — how a 100-row table spreads across power levels without a
hand-tuned constant per row. Recommend one option per question with reasons; do not
implement.

**Accept:** `docs/EXPLORE_REDESIGN.md` exists and settles all four questions with a named
recommendation each; every engine/content symbol it cites resolves (`grep` each and confirm a
hit); the time-cost section costs out at least three shapes with their `GameState` and
save-version consequences; the die-roll-modifier section states explicitly that no such
surface exists today and names where it would live; no engine, content or sim source file is
modified by this task; gate green.

### T-101 · Spec the Hangout system: engine vs content, parameterised per port — `status: TODO` · `coder: opus` · `after: T-100`

Audit today's Hangout (`packages/engine/src/actions/hangout.ts` — 413 lines, six venues:
`dare`, `befriend`, `insult`, `meet`, `rumor`, plus `borrow`/`repay`; and
`packages/content/src/hangout.ts`) and write `docs/HANGOUT_REDESIGN.md`. The target the owner
set: **a bar at every one of the 14 core spaceports**, each with its own clientele and vibe,
driven by parameters rather than by 14 code paths. Settle: **(1) the parameter surface** —
what a port's venue definition carries (which venues it offers, wager band, check DCs,
clientele, tone, house rules), such that a new port is a content row and nothing else.
**(2) What stays hard-coded** — the opposed-GUILE dare resolution and the disposition deltas
are RULES and belong to the engine; the prose, the tone and the odds bands are content. Draw
that line explicitly. **(3) The reach change and its consequence** — going from 1 venue to 14
makes a currently-unreachable feature reachable, which will move the player's economy and
every golden; say so and size it. **(4) The three known defects**, recorded under the vacated
VisitHangout ruling in `docs/NPC_REDESIGN.md` — decide whether each is in scope for this
track or explicitly deferred with the NPC question: the NPC-side faucet, the missing
`hasHangout` check on the NPC path, and the 150cr ante that locks out the captains it would
help. **(5) The content brief for 14 ports** — the owner asked for exotic, dangerous and
humorous among them; propose the spread and the axes that differentiate a port, without
writing the ports.

**Accept:** `docs/HANGOUT_REDESIGN.md` exists and settles all five with a named
recommendation each; the engine-vs-content line is drawn as an explicit two-column list
naming every current behaviour on one side or the other; the reach section states the
expected blast radius (which goldens, which bands, whether a capstone is owed); each of the
three defects is marked in-scope or deferred WITH a reason; the 14-port brief names the
differentiating axes and proposes a spread; no engine, content or sim source file is
modified; gate green.

### T-102 · CHECKPOINT — owner review of both specs — `status: TODO` · `coder: sonnet` · `after: T-101` · `[BLOCKED BY = Human Gate]`

Automated preparation only: assemble `docs/0.5.2-SPEC-REVIEW.md` collecting, with no new
analysis, each spec's open questions and its recommended option, flagging every place the two
specs disagree or overlap (both touch the day loop and both may want a save bump — say
whether they can share one). Commit it. Then the run **halts**: the owner picks the time-cost
model, the die-modifier home, and the hangout parameter surface before any implementation
starts, because every task in M2 and M3 is built on those three answers.

**Accept:** (human-checked) the review doc is committed and lists each spec's recommendations
and the cross-spec conflicts; the owner has ruled on the time-cost model, the
die-roll-modifier surface, and the hangout parameter surface.

---

## M2 — Explore: build the system, then fill it

### T-110 · The Explore outcome framework, extracted behaviour-preserving — `status: TODO` · `coder: opus` · `after: T-102`

Restructure `resolveExploration` so an outcome is a **content-supplied typed payload the
engine resolves generically**, replacing today's hard-coded three-component roll (salvage /
fragment / contraband). Land it **behaviour-preserving first**: the existing beacon and
derelict tables are re-expressed in the new shape and every existing exploration test and
golden must be unmoved before any new outcome type is wired in. Then add the taxonomy the
spec settled (unique item, questline, NPC, lore, dead-end) as resolvable types with no
instances yet.

**Accept:** the diff shows the two existing POI types re-expressed as content rows, not as
engine branches; **every pre-existing exploration test passes unchanged and the day-loop
goldens are byte-identical in the extraction commit** (state this explicitly in the commit
body, the N3 `combatRules.ts` precedent); each new outcome type has a resolver and a unit
test proving an instance of it resolves; a `grep` for `beacon`/`derelict` in
`packages/engine/src/actions/exploration.ts` returns nothing outside comments; gate green.

### T-111 · The time cost of recovery — `status: TODO` · `coder: opus` · `after: T-110`

Implement the time-cost model the owner ruled at T-102, so that recovering a valuable find
occupies real time rather than resolving free inside one day. This is expected to need
persistent state (an in-progress recovery survives a save) and therefore a save bump with a
migration and a round-trip test. It must interact honestly with the day loop: state what
happens if the player travels away mid-recovery, dies mid-recovery, or starts a second one.

**Accept:** a recovery that spans days is driven end to end in a test (start → intervening
days → payout) through the real `startDay`/`applyPlayerAction`/`endDay` loop, never by poking
state; the travel-away, death and second-recovery paths each have a test asserting the ruled
behaviour; if state was added, `CURRENT_SAVE_VERSION` is bumped with a migration, a
round-trip test, and `deserializeState` performing the same backfill pinned by a test;
recovery time scales with outcome value by a content-driven rule, not a per-row constant;
gate green.

### T-112 · The unique-item effect surface — `status: TODO` · `coder: opus` · `after: T-111`

Build the two effect classes the brief names: **+x to a ship element** (which has a home in
`ShipState` / `SPECIAL_EQUIPMENT`) and **+y on a die roll** (which does not exist today —
this is the new surface, and T-100 named where it should live). A die-roll modifier must read
through the engine's own `check()` / dice path so player and NPC are affected by one rule,
and must be visible to the player in the cockpit rather than a silent buff.

**Accept:** both effect classes are content-declared and engine-resolved; a test shows a
die-roll modifier changing a `check()` outcome through the real path (not a unit-test stub of
the formula); the modifier is surfaced in `packages/ui` and asserted by a UI test; no effect
is applied by a branch keyed on a specific item id (a `grep` for item ids in
`packages/engine/src` returns nothing); gate green.

### T-113 · Explore content pass 1 of 3 — the spine (~34 outcomes) — `status: TODO` · `coder: opus` · `after: T-112`

Author the first third of the 100-outcome table in `packages/content`, weighted toward the
**common and low-value** end: salvage rows, lore/dead-end rows, and a small number of
low-tier unique items. Establish the house voice and the row shape the next two passes
follow. No engine change is permitted in this task — if a row cannot be expressed, that is a
framework finding to report, not a branch to add.

**Accept:** ~34 outcomes committed as content rows; a content-validation test asserts every
row is well-formed and that the table's value distribution matches the spec's ladder; zero
lines changed under `packages/engine/src`; a test drives at least one instance of each
outcome TYPE present in this pass through the real Explore path; gate green.

### T-114 · Explore content pass 2 of 3 — the middle (~33 outcomes) — `status: TODO` · `coder: opus` · `after: T-113`

The second third, weighted toward **mid-value**: unique items with real effects, the first
questline hooks, and NPC-introduction outcomes. Questline and NPC outcomes must connect to
the existing storylet and cast machinery rather than inventing a parallel one.

**Accept:** ~33 outcomes committed; every questline outcome resolves into the existing
storylet system and every NPC outcome references a real cast or quest profile id (asserted by
a test that resolves the ids against content); zero lines changed under
`packages/engine/src`; gate green.

### T-115 · Explore content pass 3 of 3 — the tail (~33 outcomes) — `status: TODO` · `coder: opus` · `after: T-114`

The final third, weighted toward the **rare and powerful** end, where the time cost bites
hardest. This pass proves the ladder: the most powerful outcomes must be the slowest to
recover, by the content-driven rule from T-111 rather than by hand.

**Accept:** the table totals **100 outcomes**, asserted by a test; a test asserts recovery
time correlates with outcome value across the whole table (not row by row); the rarest tier
is reachable — a seeded sweep finds at least one instance of every outcome across N seeds,
and any unreachable row fails the test; zero lines changed under `packages/engine/src`; gate
green.

### T-116 · Explore: measure it, and answer the question that started this — `status: TODO` · `coder: opus` · `after: T-115`

Run `npm run format`, THEN one capstone for the whole milestone (the content passes have been
staling the fixture since T-113 — this is the single re-extraction standing amendment 3 asks
for). Re-measure the number that scoped this track: **is Explore still a net loss?** Re-run
the T-010 ablation shape (an arm with Explore filtered out of the explorer policy, 120 seeds
× 120 days) and report the before/after. Append the result to `docs/EXPLORE_REDESIGN.md`. Do
NOT tune a payout to make it positive — if it is still negative, that is the finding and the
lever is an owner call.

**Accept:** capstone taken after formatting, merge reports 8,000 rows, fixture re-extracted
from it with `spreads harvested`; the ablation is re-run in the documented shape and the
before/after is recorded with provenance; the result explicitly answers whether Explore still
loses money and does not tune a constant to reach an answer; if the baseline is re-pinned,
`balance-targets.test.ts`'s path and standing amendment 1's pointer move in the same commit;
gate green.

---

## M3 — Hangout: parameterise it, spread it, fill it

### T-120 · Extract the Hangout engine from its content, behaviour-preserving — `status: TODO` · `coder: opus` · `after: T-116`

Split today's `resolveVisitHangout` along the line T-101 drew: the engine keeps the rules
(opposed-GUILE dare resolution, disposition deltas, the loan ledger, die spending), content
gains a **per-port venue definition** carrying which venues exist, the wager band, the check
DCs, the clientele and the tone. **Behaviour-preserving first:** Sun-3's venue definition must
reproduce today's Hangout exactly, with every existing hangout test and golden unmoved,
before any second port exists.

**Accept:** a port venue definition exists in `packages/content` and Sun-3's row reproduces
current behaviour with **every pre-existing hangout test passing unchanged and the goldens
byte-identical** (stated in the commit body); the engine reads venue parameters and contains
no port-specific branch (a `grep` for `Sun-3` / `systemId === 1` in
`packages/engine/src/actions/hangout.ts` returns nothing); the dare's opposed-GUILE
resolution and the disposition deltas are still engine-side; gate green.

### T-121 · A bar at all 14 spaceports — the reach change — `status: TODO` · `coder: opus` · `after: T-120`

Set `hasHangout` on all 14 core spaceports (ids 1–14, Sun-3 … Vega-6) with a **placeholder
venue definition** per port — real parameters, not yet the authored voice, so the reach change
and the content authoring are separable and separately reviewable. This is the task that
makes a previously-unreachable feature reachable, so it is expected to move the player's
economy: measure and report rather than absorb it. Say explicitly which goldens moved and
why.

**Accept:** all 14 core systems carry `hasHangout: true` and a venue definition, asserted by a
test enumerating them; a test drives `VisitHangout` successfully at a port that is not Sun-3;
any moved golden is re-recorded with the event-count diff the fixture convention asks for, and
the commit body states which player-side counts moved; **no rim or gated system gained a
venue** unless the spec ruled otherwise; gate green.

### T-122 · Hangout content pass 1 of 3 — the core worlds (5 ports) — `status: TODO` · `coder: opus` · `after: T-121`

Author the first five ports' clientele, tone and house rules over the placeholder parameters.
These are the everyday bars — the baseline the exotic and dangerous ones are exotic and
dangerous _against_. Voice must match the game's period register (see the wire templates and
storylet prose for the house voice).

**Accept:** five ports carry authored content; a test asserts each has distinct parameters (no
two ports identical) and that all authored prose is non-empty and placeholder-free (a `grep`
for `TODO` / `TBD` / `placeholder` in the content returns nothing); zero lines changed under
`packages/engine/src`; gate green.

### T-123 · Hangout content pass 2 of 3 — the exotic and the dangerous (5 ports) — `status: TODO` · `coder: opus` · `after: T-122`

The next five, leaning into the axes the spec named: ports where the clientele is unusual, the
house rules are hostile, or the wager band is out of proportion to the rest of the galaxy. A
dangerous bar must be dangerous **through parameters** (odds, DCs, disposition consequences),
never through a special case in the engine.

**Accept:** five more ports authored; at least one is measurably hostile and one measurably
exotic on their parameters, asserted by a test against the spec's axes; **zero engine
changes** — if a port's concept needed one, it is reported as a framework finding instead;
gate green.

### T-124 · Hangout content pass 3 of 3 — the last four, and the humour — `status: TODO` · `coder: opus` · `after: T-123`

The final four ports, including the comic register the owner asked for. Humour in this game is
period-voiced and dry — read the existing flaw-override and wire lines for the register before
writing. This pass closes the table at 14.

**Accept:** all **14** core ports carry authored, distinct content, asserted by a test that
enumerates them and fails on any placeholder; the tonal spread (everyday / exotic / dangerous
/ comic) is asserted against the spec's axes; zero engine changes; gate green.

### T-125 · Hangout: measure the reach, and re-read disposition — `status: TODO` · `coder: opus` · `after: T-124`

Run `npm run format`, THEN one capstone for this milestone. Report what a reachable social
system did: hangout usage per run, the disposition distribution across the cast before and
after, and — the interesting one — whether disposition is now doing real work in
`chooseWeighted`'s interceptor draw, i.e. **whether who hunts you has started to depend on how
you have treated people.** Append to `docs/HANGOUT_REDESIGN.md`. Do not tune to a target;
report.

**Accept:** capstone taken after formatting, 8,000 rows, fixture re-extracted with
`spreads harvested`; the result records hangout usage per run, the before/after disposition
spread, and a measured statement about disposition's effect on interceptor selection; no
threshold, band or constant was tuned to produce a result; if the baseline is re-pinned, both
pointers move in the same commit; gate green.

---

## M4 — Close out

### T-130 · CHECKPOINT — owner review of both systems — `status: TODO` · `coder: sonnet` · `after: T-125` · `[BLOCKED BY = Human Gate]`

Automated preparation only: assemble `docs/0.5.2-REVIEW.md` collecting both milestones'
measured results, every framework finding reported during the content passes (a row that could
not be expressed is the most valuable output this track can produce), and the list of
questions this track deliberately did not answer — chief among them **whether NPCs interact
with Explore and the Hangout**, which the owner deferred until these systems are functional
and which is the gate on re-ruling the two vacated PARITY LEDGER rows. Commit it, then halt.

**Accept:** (human-checked) the review doc is committed with both milestones' results, the
framework findings, and the deferred-questions list; the owner has decided whether to re-open
the two vacated ledger rows and whether the manifest version bumps to 0.5.2.

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
- **The three Hangout defects** — the NPC-side faucet (+4.86cr/captain-day with no
  counterparty), the missing `hasHangout` check on the NPC path, and the 150cr ante that locks
  out the destitute captains. All three are NPC-side, so they defer with the question above
  unless T-101 rules one in scope.
- **The rest of the N-series: N12 (NPCs buy ports), N13 (dawn-hand parity), N5 (proficiency),
  N8 (re-pin).** N12's FIRST TASK is already done, so that step is ready to resume when this
  track ends.
- **`executeCombat`'s missing shared rules** — fighters still take 0 deaths on their chosen
  Combat day. A real PARITY LEDGER gap; whether it lands as an N3 follow-up or at N13 is an
  owner sequencing call.
- **Explore being a net loss for the PLAYER as a balance question.** T-116 re-measures it, but
  _re-pricing_ is R-series work and an owner call, not something a content pass does.
- **The manifest version bump to 0.5.2.** `docs/VERSIONING.md` is explicit that bumping is "a
  deliberate act, once per release cycle, as its own commit immediately before tagging" — so
  the manifest stays at 0.5.1 until this track ships. T-130 asks the owner to confirm.
- **Anything R-owned:** R10's tier-1 hull cliff and the known-red `it.fails` tripwires.
