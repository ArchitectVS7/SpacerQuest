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

### T-100 · Spec the Explore system: engine/content framework + the time cost — `status: DONE` · `coder: opus` · `after: —`

**Delivered (2026-07-30):** Wrote `docs/EXPLORE_REDESIGN.md`, settling all four required designs against the owner's two rulings without re-opening either: §2 the value-headed outcome row (one typed content shape, five engine resolvers, zero instance knowledge in the engine); §3 the anchored single-slot recovery (the new `player.recovery` state, the `recoveryDays(valuePoints)` band-table rule, save v13 + `MIGRATIONS[12]`, and explicit rulings on all four interaction questions — travel-away forfeits by location predicate, death forfeits at succession, a second recovery refuses the verb, and an open recovery survives the day-30 era flip untouched); §4 two effect classes (unbounded Class-A ship-element deltas plus a Class-B die effect bounded at exactly three modules through the existing `DiceBenefit`/`EQUIPMENT_DICE_BENEFITS` hook, with Finding F-100-1 recording the one real cost that bound carries and its recommended second-loop resolution); and §5 the `valuePoints` → band → everything ladder (one dial per row, five bands, a 100-row spread across T-113/114/115, and the reachability arithmetic that makes it a property check rather than a tuning exercise). Deliberate scope boundary: this is a specification only — no engine, content, sim, or UI source file was touched, and Explore's fuel cost, nav DC, NPC interaction, and the 0.5.2 version bump are all explicitly left unsettled for later tasks (§7).

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading the Explore engine/content pair, `dice.ts`/`crew.ts`/`upgrades. · attempts=1/4.

Audit today's Explore end to end (`packages/engine/src/actions/exploration.ts`,
`packages/content/src/exploration.ts`, `POI_KINDS`, `POI_LOOT`, `EXPLORATION_NAV_DC`,
`EXPLORATION_FUEL_COST`, and the fragment pools in `content/nemesis.ts`) and write
`docs/EXPLORE_REDESIGN.md`: a spec, not an implementation. **The owner has already ruled the two load-bearing questions (rulings 1 and 2 above) — spec
the ruled design, do not re-open it.** It must settle four things.
**(1) The outcome taxonomy** — the brief names _unique item_, _questline_, _NPC_, _lore bit_,
and plain _salvage/credits_, with "dead end" meaning lore with no mechanical payoff. Define
each as a typed content shape the engine can resolve without knowing any instance.
**(2) The multi-day recovery, in detail** — ruling 1 fixes the model; the spec owes the
mechanics. Exactly what state is added and where; how N is derived from an outcome's power by
a rule rather than a per-row constant; and the four interaction answers: **travelling away
mid-recovery, dying mid-recovery, starting a second recovery while one is open, and a recovery
still open when the day-30 Tour One marker resolves** (`day.ts` fires `TourOneResolved` and
flips the era at dusk of day 30 unconditionally — settle whether an open recovery survives the
era flip, pays out early, or is forfeit). Name the save version it lands on and what the
migration backfills. **(3) The effect surface** —
_+x to a ship element_ has a home (`ShipState`, `SPECIAL_EQUIPMENT`); the die effect uses the
existing `DiceBenefit` / `EQUIPMENT_DICE_BENEFITS` hook per ruling 2. Show concretely how
three different items of different power map onto `floor` / `extra-die` / `reroll`, and state
the expressive limit that mapping has. **(4) The value ladder** — how a 100-row table spreads
across power levels, and how recovery time and effect strength stay correlated, without a
hand-tuned constant per row. Do not implement.

**Accept:** `docs/EXPLORE_REDESIGN.md` exists and settles all four with a named design each;
every engine/content symbol it cites resolves (`grep` each and confirm a hit); the recovery
section names the added state, the derivation rule for N, the save version, AND answers all
four interaction questions explicitly (including the day-30 marker case); the effect section maps three worked example items
onto the existing `DiceBenefit` kinds and states that mapping's expressive limit; **the spec
implements the owner's ruled options 1 and 2 — if either proves unworkable the task FAILS
with the reason rather than documenting an alternative**; no engine, content or sim source
file is modified; gate green.

### T-101 · Spec the Hangout system: engine vs content, parameterised per port — `status: DONE` · `coder: opus` · `after: T-100`

**Delivered (2026-07-30):** Wrote `docs/HANGOUT_REDESIGN.md`, implementing ruling 3 without
re-opening it. It settles all five required questions: the typed `PortHangout` parameter
surface (§2, "the port row, defaults resolved," field-wise default resolution against
`DEFAULT_PORT_HANGOUT`); the engine/content line as an explicit 35-row two-column table (§3,
"deltas are content, application is engine"); the reach change from 1-of-28 to 14-of-28 core
ports with its blast-radius table across goldens, sim policies, `legalActions`, and the
capstone/save-version position (§4, no `CURRENT_SAVE_VERSION` bump owed by this track); the
three known VisitHangout defects, all ruled DEFERRED with two measurement obligations handed
to T-125 (§5); and the 14-port content brief across six axes including governance as an
axis independent of `isRim` (§6). Five framework findings (F-101-1…F-101-5) record the
parameter-only surface's real expressive limits — most notably that the wager ceiling is
dealer-purse-bound, not band-bound, and that conditional per-port house rules are
out-of-scope by ruling 3 — rather than routing around them. Scope boundary: this is a spec
only; no engine, content, or sim source file was touched, and the NPC-side Hangout question
stays deferred to the owner per the standing gate.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading the Hangout engine/content pair, `day.ts`'s gate, the sim polic · attempts=1/4.

Audit today's Hangout (`packages/engine/src/actions/hangout.ts` — 413 lines, six venues:
`dare`, `befriend`, `insult`, `meet`, `rumor`, plus `borrow`/`repay`; and
`packages/content/src/hangout.ts`) and write `docs/HANGOUT_REDESIGN.md`. The target the owner
set: **a bar at every one of the 14 core spaceports**, each with its own clientele and vibe,
driven by parameters rather than by 14 code paths. **Ruling 3 above fixes the parameter surface — spec it, do not re-open it.** Settle:
**(1) the parameter surface in detail** — the typed shape of a port venue definition carrying
exactly what ruling 3 lists (venues offered, wager band, per-venue DCs, per-venue disposition
deltas, drawable clientele, prose/tone), such that a new port is one content row and nothing
else. **(2) The engine/content line, as an explicit two-column list** naming every current
behaviour on one side or the other. Per ruling 3 the engine keeps opposed-GUILE resolution,
the loan ledger, die spending and disposition application; note that per-venue disposition
DELTAS are content while how a delta is APPLIED is engine. **(3) The reach change and its consequence** — going from 1 venue to 14
makes a currently-unreachable feature reachable, which will move the player's economy and
every golden; say so and size it. **(4) The three known defects**, recorded under the vacated
VisitHangout ruling in `docs/NPC_REDESIGN.md` — decide whether each is in scope for this
track or explicitly deferred with the NPC question: the NPC-side faucet, the missing
`hasHangout` check on the NPC path, and the 150cr ante that locks out the captains it would
help. **(5) The content brief for 14 ports** — the owner asked for exotic, dangerous and
humorous among them; propose the spread and the axes that differentiate a port, without
writing the ports. **A port's governance/lawfulness is a candidate axis independent of the
rim/contraband flag** — core systems need not be uniformly safe; a partisan faction, a seedy
underbelly, or a strict garrison world are all core-compatible story hooks and are open
territory for "exotic" or "dangerous" ports rather than reserving those for rim-flavoured
reskins.

**Accept:** `docs/HANGOUT_REDESIGN.md` exists and settles all five with a named
recommendation each; the engine-vs-content line is drawn as an explicit two-column list
naming every current behaviour on one side or the other; the reach section states the
expected blast radius (which goldens, which bands, whether a capstone is owed); each of the
three defects is marked in-scope or deferred WITH a reason; the 14-port brief names the
differentiating axes and proposes a spread; **the spec implements ruling 3 — no per-port
house-rule mechanism is specced, and if a proposed port concept needs one that is recorded
as a finding**; no engine, content or sim source file is modified; gate green.

### T-102 · Spec consistency check — do the two specs honour the rulings, and do they collide? — `status: DONE` · `coder: opus` · `after: T-101`

**This was a human gate until the owner ruled all three questions up front; it is now the
automated check that the specs actually built what was ruled.** Read both specs against THE
THREE DESIGN RULINGS and against each other, and write `docs/0.5.2-SPEC-REVIEW.md`: a short
cross-check, not a re-analysis. Two jobs. **(1) Ruling compliance** — confirm each spec
implements its ruled option, and name any place one quietly substituted a different design.
**(2) Collision** — both systems touch the day loop and both may want persistent state; say
whether they can share ONE save bump or need two, and in which order they must land so the
second does not invalidate the first's migration. Flag any place the two specs use different
names for the same concept.

**Accept:** `docs/0.5.2-SPEC-REVIEW.md` exists with both sections; **the task FAILS if either
spec departed from its ruling** — a departure is escalated, never documented as an
alternative and never accepted by this task; the save-bump collision question is answered
with a specific recommendation (one bump or two, and the landing order); no engine, content
or sim source file is modified; gate green.

**Delivered (2026-07-30):** Wrote `docs/0.5.2-SPEC-REVIEW.md`, cross-checking
`EXPLORE_REDESIGN.md` (T-100) and `HANGOUT_REDESIGN.md` (T-101) against THE THREE DESIGN
RULINGS and against each other. Verdict: all three rulings HONOURED, with one recorded
precondition on ruling 2 (D2) and five near-misses examined and cleared as not departures.
Collision section recommends ONE save bump for the whole 0.5.2 track (v12→v13, taken by
T-111; Hangout takes none), closes a second-order save question left open by both specs
(D3), corrects the Hangout spec's shared-file count from zero to four (D6), and finds one
real naming collision — `PortHangout.portId` vs. the repo's settled `systemId` — resolved as
a rename directive (D7). Eight directives (D1–D8) carried forward to their owning
downstream tasks. Scope boundary, deliberate: this task re-analysed neither spec's design,
edited neither spec, opened no new design question, and touched no engine, content, sim or
UI source file — corrections live only as directives in the review doc, per its own §4.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading both specs end to end plus TASKS.md's ruling block, and grounde · attempts=1/4.

---

## M2 — Explore: build the system, then fill it

### T-110 · The Explore outcome framework, extracted behaviour-preserving — `status: DONE` · `coder: opus` · `after: T-102`

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

**Delivered (2026-07-30):** An explore payoff is now a content row the engine resolves
generically. `packages/content/src/exploration.ts` gains `ExploreOutcomeDefinition` /
`ExploreOutcomePayload` and `EXPLORE_OUTCOMES` (the two shipped POI tables re-expressed as 12
`legacy-` rows — two salvage bands, eight lore rows derived by `.map` over the two fragment
pools in pool order, two contraband pods), plus `POI_DISCOVERY_TABLE` (which retires
`BEACON_DISCOVERY_CHANCE` and takes the last POI-type literal out of the engine) and
`LEGACY_POI_LOOT` (the three-leg draw kept alive as DATA pointing at row ids, per spec §2.4).
`POI_LOOT` / `PoiLootTable` / `SalvageLoot` / `FragmentLoot` / `LootComponentChance` are
deleted. The new `packages/engine/src/exploreOutcomes.ts` owns `drawPoiKind`,
`drawLegacyLoot` and `resolveExploreOutcome` — an exhaustive switch with a `never` default,
one arm per kind — and `applyEffects` is exported from `storylets.ts` so four of the five
kinds reduce to a `StoryletEffects` payload applied through the one authoritative
implementation (synthetic pair: `storyletId` = the row id, `choiceId` = `'explore'`).
`actions/exploration.ts` keeps only the refusals, the die, the fuel and the nav check: 124
lines lighter, `resolveLoot` and the beacon/derelict ternary gone, and a case-insensitive
`grep -ni 'beacon\|derelict'` over it returns **nothing at all**, not even in comments.

BEHAVIOUR-PRESERVING, EVIDENCED: `packages/engine/src/__tests__/exploration.test.ts` has a
**zero-line diff** and all 18 of its tests pass unchanged; all four `day-loop-golden.ts`
hashes, both `replay-golden.ts` pins and `campaign-degraded`'s seven `PINNED_FINGERPRINTS`
(explorer included) are byte-identical — the fixture directories show a zero-line diff. A new
`exploreOutcomes.test.ts` pins the WHOLE per-seed result (credits, nemesis file, contraband
flag, charted POI, ordered event stream) over 300 boarded seeds to a sha256 stamped from the
PRE-refactor tree, plus the readable aggregate (202 salvage / 96 fragment / 57 contraband
events, 346,939cr) — both were authored and run green against `main` before a line moved.
Gate: 1,369 tests green across all four workspaces (engine 810, up 15), `tsc -b` clean, lint
clean, `format:check` clean.

Four findings, each carried in code comments at the site:
- **F-110-A · the settled five-kind taxonomy cannot express today's contraband leg.** No
  settled kind emits `ContrabandFound`, and routing the flag through `lore.effects` would
  emit `StoryletEffectApplied` instead, breaking two pre-existing `exploration.test.ts`
  assertions and moving the replay goldens. Since "every pre-existing exploration test passes
  unchanged" is a hard accept clause, a **sixth, explicitly transitional** `{ kind:
  'contraband' }` payload ships, marked at its declaration and its resolver arm for
  **retirement by T-113** once the weighted draw lands and no row uses it.
- **F-110-B · the legacy rows carry `wireFound: ''` and the resolver guards on non-empty.**
  Emitting a line for them would add a `WireEntry` per boarded POI and move
  `REPLAY_GOLDEN_RESPONSES` (its `REPLAY_LOG` charts a derelict). §2.4's "never charged 80
  fuel for total silence" fix arrives with the authored copy at T-113, exactly as the spec
  sequences it; T-113/T-115 should assert no authored row has empty copy.
- **F-110-C · `rulesFingerprint` moved despite the extraction being inert**, because the hash
  covers code, not outcomes (`b6f27d2bceabde59` → `e58d5afd90b43ad5`). Remedied by
  `npm run balance:extract -- --aggregate docs/balance/baseline-n11-shipped.json` (the T-021
  precedent), NOT by a capstone and NOT by editing the fixture: the resulting
  `docs/balance/smoke/tiers.json` diff is fingerprints + `gitCommit` + `productVersion` and
  **every recorded checkpoint number is identical**, which is itself evidence of inertness.
  No sweep was taken, so T-116's capstone batching is untouched.
- **F-110-D · `unique-item` has no grant surface until T-112.** `hasSpecialEquipment` reads a
  fixed set of named `ShipState` booleans and `EXPLORE_MODULES` does not exist yet, so the
  arm resolves to its wire line and mutates nothing, with a named `// T-112 seam:` comment
  rather than an invented stand-in grant. A test compares whole state before/after to hold
  that line.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading `docs/EXPLORE_REDESIGN.md` §0–§5/§8, `docs/0.5.2-SPEC-REVIEW.md · attempts=1/4.

### T-111 · The time cost of recovery — `status: DONE` · `coder: opus` · `after: T-110`

**Delivered (2026-07-30):** Multi-day committed recovery now runs end to end through the
real day loop: a drawn outcome with `recoveryDays(valuePoints) > 0` (a content-driven band
rule in `exploreOutcomes.ts`, never a per-row constant) opens the single `player.recovery`
slot instead of resolving same-day, and the payoff fires at the dusk of `dueDay` through the
existing `resolveExploreOutcome` payload roll. The four ruled interactions from
`docs/EXPLORE_REDESIGN.md` §3.3 are each driven through `startDay`/`applyPlayerAction`/`endDay`
in `recovery.test.ts` rather than by poking state: travelling away forfeits the op at dusk,
death clears the slot via succession without touching the chart, a second `Explore` while one
recovery is open is refused with a typed `recovery-in-progress` event and charges neither die
nor fuel, and the day-30 Tour One marker passes through an open recovery untouched. State grew
by one field, so the save version bumped to v13 with a `.strict()` `RecoveryStateSchema`, a
migration backfilling `recovery: null` for v12 saves, and the same backfill in
`deserializeState`, all covered by round-trip tests. Deliberate scope boundary: a stored
recovery whose `outcomeId` or `poiId` no longer resolves against current content (a drift
case, not a normal path) clears the slot as `unknown-outcome` rather than crashing or
fabricating a payout, and T-112's unique-item grant surface is untouched — this task only
moves value-point payouts onto the recovery clock.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading `docs/EXPLORE_REDESIGN.md` §2–§5, `docs/0.5.2-SPEC-REVIEW.md` § · attempts=1/4.

Implement the **multi-day committed recovery** of ruling 1, to the mechanics T-100 specced,
so recovering a valuable find occupies real calendar days rather than resolving free inside
one day. This needs persistent state (an in-progress recovery survives a save) and therefore
a save bump with a migration and a round-trip test. It must interact honestly with the day
loop, in the four ways the spec settled: travelling away mid-recovery, dying mid-recovery,
starting a second recovery while one is open, and a recovery still open when the day-30 Tour
One marker resolves. `N` derives from the outcome's power by the
spec's rule — **never a per-row constant.**

**Accept:** a recovery that spans days is driven end to end in a test (start → intervening
days → payout) through the real `startDay`/`applyPlayerAction`/`endDay` loop, never by poking
state; the travel-away, death, second-recovery, AND day-30-marker paths each have a test
asserting the ruled behaviour; if state was added, `CURRENT_SAVE_VERSION` is bumped with a migration, a
round-trip test, and `deserializeState` performing the same backfill pinned by a test;
recovery time scales with outcome value by a content-driven rule, not a per-row constant;
gate green.

### T-112 · The unique-item effect surface — `status: DONE` · `coder: opus` · `after: T-111`

**Delivered (2026-07-30):** Both effect classes ship as a framework, and the promise
`EQUIPMENT_DICE_BENEFITS` has carried since T-1601c is now cashed. **Class B** is exactly
F-100-1's recommended shape: a second content table the shipyard never reads
(`EXPLORE_MODULE_DICE_BENEFITS`, three modules spanning floor/reroll/extra-die), folded in by
a **second loop inside `equipmentDiceBenefits`** — no new accumulator, no new call site,
`dawnDiceModifiers` and `rollDawnHand` untouched, so the modules reach the dealt hand, the
re-roll floor and the HandDock badges for free. **Class A** is one engine resolver
(`applyUniqueItem`) over a declared `ShipElementDelta` list, switching only on engine-owned
kinds. `check()` is byte-identical (`grep -n "export function check" packages/engine/src/dice.ts`
→ `check(die, statValue, dc)`; the whole `dice.ts` diff is `equipmentDiceBenefits` plus
comments), and **no branch anywhere in the engine is keyed on an item id** — the Class-B grant
is a list append and the Class-A grant a `delta.element` switch
(`grep -rn "'item-\|'module-" packages/engine/src` outside tests hits only one prose comment).
The acceptance dice tests drive the **real `startDay`**: a granted berth-couch deals 6 dice,
an ephemeris banks a re-roll, a tally-slate floors every die at 3, and a Second **plus** the
berth-couch deals exactly `MAX_DAWN_HAND_SIZE` — the cap still binds with an item equipped,
in the engine and (via `dawnHandModifiers`) in the cockpit. The cockpit is not silent about
it: a `SALVAGED FITTINGS` block in the ship pane (`data-testid="explore-modules"`) names each
fitted module and its benefit off the same content table the engine reads, and
`explorationOutcome` names the item on the day it is recovered — both asserted in
`packages/ui/src/__tests__/format-modules.test.ts`. No `unique-item` outcome ROWS are
authored here; T-113/T-114/T-115 own those, and the Class-A resolver is proved with
test-local rows through the exported resolver rather than by shipping speculative content.

**Findings:**

- **F-112-A · fitted modules are a LIST on `ShipState`, not three booleans.** F-100-1
  sketched "three optional booleans mirroring the existing seven". Three booleans force *two*
  id-keyed switches — one to read, one to **write** the grant — and the write-side switch is
  literally "an effect applied by a branch keyed on a specific item id", which this task's
  acceptance forbids. `exploreModules?: readonly ExploreModuleContentId[]` removes the write
  branch entirely (membership, not a case) and removes F-100-1's whole per-instance engine
  cost (a union member, a flag, a `hasSpecialEquipment` case, a schema field, a backfill) —
  which was the friction that capped Class B at three. **The three-module bound is unchanged**;
  it now rests on §4.2's design argument (the `MAX_EXTRA_DICE` clamp, the three-kind
  vocabulary) and on a content test, rather than on how tedious a fourth would be to add.
- **F-112-B · `maxFuel` is DERIVED, so §4.1's `{ maxFuel: +40 }` needed a term, not a write.**
  `syncMaxFuel` recomputes `maxFuel` from the hull at the end of *every* `applyPlayerAction`
  and again on load, so a delta written onto `ship.maxFuel` would be erased inside the same
  action. It is implemented as a stored `bonusMaxFuel` added **inside** that one chokepoint,
  so there is still exactly one place `maxFuel` is decided. A dead hull (base 0) still holds
  nothing. NPC hulls never set the field, so `npc.ts` is byte-identical. Both the direct
  `syncMaxFuel` call and a real `applyPlayerAction` are asserted.
- **F-112-C · §5.2's `Class-A ceiling` / `Class-B permitted` band columns are DEFERRED to
  T-114, deliberately.** T-112 authored no `unique-item` rows, so those columns would have had
  zero consumers and nothing to validate — a field added to raise a coverage signal rather
  than a rule. The `ExploreValueBand` doc-comment previously attributed them to T-112 and is
  re-targeted to T-114, where the validator has rows to check.
- **T-110's F-110-D is CLOSED** — the `// T-112 SEAM` comment is gone and the arm grants real
  items. Its whole-state no-op test survives, retargeted to the content-drift half (an
  *unknown* item id must still resolve to prose and mutate nothing), so the changed test reads
  as the deliverable rather than a regression.
- **No save bump, and it is pinned.** Both new fields are optional and absent-means-none/zero
  (the `NpcState.dead?` precedent), so `CURRENT_SAVE_VERSION` **stays 13** — asserted in
  `save.test.ts`. `starterShip` gains no default and `deserializeState` gains no backfill:
  doing *neither* keeps `serializeState` byte-identical for every module-free career, which is
  why **the four `day-loop-golden.ts` hashes, both `replay-golden.ts` pins and
  `campaign-degraded`'s `PINNED_FINGERPRINTS` are all UNMOVED by this task** (`git status`
  confirms none of those files is touched). `docs/balance/smoke/tiers.json` was re-extracted,
  not capstoned (the F-110-C remedy): its diff is fingerprints + `gitCommit` only and **every
  recorded checkpoint number is identical** — the evidence of inertness. T-116 still owns the
  milestone's single sweep.
- **F-112-D · the e2e suite was RED ON `main` before this task touched it, and is repaired
  here (fix round 1).** T-112 is the first task since 2026-07-28 whose gate required
  `test:e2e` (it touches the cockpit), and it failed 7 of 95 specs. All seven reproduce on
  `main@74403ab4` with this branch stashed — none is T-112 fallout. Two upstream causes, both
  "the rule moved and the e2e fixtures were never re-derived": **(1) T-1605 "an ordinary jump
  always arrives"** deleted the travel PILOT check, so `starmap.spec.ts`'s honest-check
  assertion had been measuring a mechanic that no longer exists (rewritten to the inverse
  claim — no roll happened, so the cockpit must render no check — the same "rewrite to the new
  contract, never delete" the T-1605 commit applied to its engine and sim tests but missed
  here), and seed 8's fuel-drain bounce now draws an interception (re-swept offline, seed 9).
  **(2) The N-series parity merge** re-cut interceptor stat blocks and NPC movement:
  `combat.spec.ts`'s miracle-burn fixture could no longer reach `interceptor-escaped` (seed 2's
  tier-1 now carries PILOT 0 — re-derived by sweeping seeds 1..400, seed 16), and
  `tour-one-death.spec.ts` pinned the casting rather than the claim (the two `'Lucky Seven'`
  literals now resolve through the shipped cast, so a re-cast is not a regression). A third,
  independent hole: **`support/career.ts` could not finish an encounter that was still open at
  dawn** — standing down IS the dusk but does not end the interdiction, so every later click
  landed on the overlay backdrop and the Tour One driver stalled to its timeout; `playDay`
  gained a step 1b that fights it through, adding no click on any day that does not open
  mid-fight, and **seed 21's pin survived unmoved on both branches**. `wire.spec.ts` read its
  headline at rest from a VIRTUALIZED log that now files ~58 lines per dusk; it scrolls to it,
  as a player does. No assertion was lowered, no test deleted, no seed re-anchored to dodge an
  outcome. Suite: **95/95 in 22s** (the 15.4m runtime was three 300s timeouts × retries).
- **Home note:** §6's proposed-symbol table pencilled the three module symbols into
  `exploration.ts`; they ship in `crew.ts` beside `EQUIPMENT_DICE_BENEFITS` and the shared
  `DiceBenefit` vocabulary, so the dice axis reads in one file. The spec's table is corrected
  in place. Nothing else about F-100-1's shape changed.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked with `ls`; absent), so I oriented by reading `docs/EXPLORE_REDESIGN.md` §4/§5.2/§6 (F-100-1)/§8 an · attempts=2/4.

Build the two effect classes the brief names. **+x to a ship element** has a home in
`ShipState` / `SPECIAL_EQUIPMENT`. **The die effect is ruling 2 and is deliberately NOT a new
engine surface**: an explore item grants a `DiceBenefit` (`extra-die` / `reroll` / `floor`)
through the shipped-empty `EQUIPMENT_DICE_BENEFITS` table, which already folds into
`dawnDiceModifiers` — *"a future die-granting module joins with one entry, no engine change,
no new call site"* is its own comment, and this task is that entry. **This task is therefore
mostly wiring and UI, not new rules.** The effect must be visible in the cockpit rather than
a silent buff, and the existing hand cap must still hold.

**Accept:** an explore-granted item produces a real `DiceBenefit` at dawn, asserted by a test
driving the actual `startDay` hand roll (not a stub of the formula); **no new check-level
modifier surface was added** — a `grep` confirms `check()`'s signature is unchanged; the
existing hand cap still binds with an item equipped, asserted by a test; the effect is
surfaced in `packages/ui` and asserted by a UI test; no effect is applied by a branch keyed on
a specific item id; gate green.

### T-113 · Explore content pass 1 of 3 — the spine (~34 outcomes) — `status: DONE` · `coder: opus` · `after: T-112`

**Delivered (2026-07-30):** **34 authored rows — bands 0 and 1 exactly** (§5.3 pass 1): 14
dead ends (`{ kind: 'lore' }` with neither optional field, `valuePoints: 0`), 12 salvage rows
(6 per pool, credit bands inside §5.2's authored 40–260cr, midpoints averaging 140cr against
§5.5's 150cr band-1 credit-equivalent), and 8 lore rows carrying one Signal Fragment each —
ids derived by `.map` over `BEACON_FRAGMENT_POOL` / `DERELICT_FRAGMENT_POOL` so a pool edit
cannot orphan a fragment. **Zero lines changed under `packages/engine/src`** outside
`__tests__` (`git diff --stat HEAD~1 -- packages/engine/src ':!packages/engine/src/__tests__'`
is empty), and `grep -c "if (" packages/content/src/exploration.ts` is **0**.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked with `ls`; absent), so I oriented by reading `docs/EXPLORE_REDESIGN.md` §1.3/§2/§5/§8, `TASKS.md`  · attempts=1/4.

- **THE HOUSE VOICE IS A SET OF RULES, NOT A TASTE**, and every one falls out of the engine:
  third person past tense with the literal subject `Player` (`wire.ts` treats that string as
  the player actor); `{name}` at most once per row (`String.replace` substitutes the first
  occurrence only); a salvage row names **what was stripped**, never the credit figure (the
  amount rides `SalvageRecovered`); a lore row's copy is the **second** line on a new fragment
  and the **only** line on a repeat, so it is written to read correctly both ways. All four
  are asserted, not just described.
- **F-110-B IS CLOSED.** Every authored row carries non-empty, mutually distinct copy, so
  §2.4's "a board is never 80 fuel and a die for total silence" is now a property of the rows
  rather than a promise. A sweep asserts no boarded POI emits an empty wire line.
- **`permittedKinds` lands on `ExploreValueBand`** (the fourth of §5.2's seven columns),
  populated from the spec and read by the new validator. The `weight` column is still absent
  on F-112-C's exact argument: it has no consumer until the draw flips, and a column with no
  consumer is a stub raising a coverage signal.
- **The validator is `packages/engine/src/__tests__/exploreContent.test.ts`** (19 tests).
  Well-formedness: id uniqueness + convention, integer `valuePoints` on 0–100, real POI pools,
  non-empty/unique/`{name}`-safe copy, no `recoveryDays` key **and** `recoveryDays === 0` for
  every row, ordered credit bands inside 40–260, fragment ids resolving against
  `ALL_FRAGMENT_IDS`. Ladder: the 14/20/0/0/0 band counts, `permittedKinds` per band, the
  dead-end shape, the band's floor and ceiling actually **reached**, the 130–170 mean, and a
  monotone rank property tying `valuePoints` to mid-credits (a property, not a threshold).
  **It lives in the engine suite because `packages/content` has no test runner at all** — its
  `package.json` carries only `build` and there is not one `*.test.ts` under it. Flagged as an
  observation; building that infra is not a content pass's job.
- **Each outcome TYPE in this pass is driven through the REAL Explore path** — a 2,000-seed
  sweep of `resolveExploration`, asserting an authored `salvage` row paid inside its own band
  and an authored `lore` row granted its fragment, each identified by its unique wire copy,
  plus full coverage of every row the carrier can draw.

**Four findings, reported rather than routed around:**

- **F-113-A · the single band-weighted draw is UNOWNED.** §2.4 pencilled the flip into T-113,
  but it is two engine changes (`drawOutcome` + a call-site swap) and this task forbids engine
  lines; §8's handoff row never asked for it. `docs/EXPLORE_REDESIGN.md` §2.4 and §8 are
  corrected in place. **Consequence:** the 14 dead ends are authored but undrawable — the
  three-leg carrier has no "nothing else fired" arm — and **T-115's "a sweep finds every
  outcome" clause is arithmetically impossible until the flip lands.** Recommend a dedicated
  engine task between T-114 and T-115.
- **F-113-B · `contraband` cannot be retired by a content pass.** F-110-A assigned it here,
  but deleting the union member makes the engine's exhaustive `case 'contraband':` a `tsc`
  error. The two rows survive — which also preserves the sealed-pod carry-choice storylet
  instead of silently deleting it. Retire it with F-113-A.
- **F-113-C · a spec-sequenced income dip, recorded and NOT tuned around.** §5.2 authors
  band-1 salvage at 40–260, below the shipped beacon top, and band 2's 240–700 is T-114's.
  Measured on the `campaign-degraded` window (5 seeds × 40 days): explorer median final
  credits 25,013 → 9,094, smuggler 9,802 → 4,841. Re-pricing Explore is R-series and an owner
  call; T-116 owns the verdict.
- **F-113-D · the DERELICT salvage leg is staged to T-114, and this is the one place the plan
  was overruled by a measurement.** The `rich_hulk` deed fires on a `SalvageRecovered` of
  400cr+, and its own comment cites this file's 120–520 derelict band as what makes 400
  "reachable, never automatic". Retiring `legacy-salvage-derelict` makes the deed
  arithmetically unreachable; merely **diluting** its leg with the six authored rows cut it to
  missed-by-21-of-24 careers and dropped whole-slate careers to one, redding
  `deed-coverage.test.ts` for a reason **no wider sample could fix**. Lowering the deed
  threshold is what `docs/BALANCE-POLICY.md` forbids. So the beacon salvage leg and both
  fragment legs were re-pointed and `legacy-salvage-beacon` retired, while the derelict
  salvage leg was left whole. **T-114 owes:** author band 2, then delete
  `legacy-salvage-derelict` and re-point that leg. The validator's surviving-legacy-rows
  tripwire names all three remaining ids and fails loudly if it is forgotten.

**Fixtures moved, each re-derived with a ledger entry — never edited to go green:**

- `exploreOutcomes.test.ts` `LEGACY_PARITY_HASH` + the aggregate, with entry **T-113** naming
  both mechanisms (the fragment legs re-pointed at rows that now speak; the beacon salvage leg
  holding six ids where it held one, consuming an extra index draw). The derelict half of every
  board is byte-identical to T-111, which is why only `fragmentEvents` (102 → 97) and
  `totalCredits` (308,941 → 309,047) move at all. Its "every lore row has a `fragmentId`"
  assertion was **retargeted, not deleted** — the claim that mattered ("no pool entry can lose
  its row") is now asserted leg by leg, in pool order.
- `recovery.test.ts` — **one seed of three** (`SEED_OPENS` 4 → 36), re-found by re-running the
  file's own documented scan against the real loop with the extra condition that the opened row
  is still `legacy-salvage-derelict`. No assertion changed shape or value.
- `campaign-degraded.test.ts` `PINNED_FINGERPRINTS` — ledger entry **14**. **Exactly the two
  sweeping policies move** (explorer, smuggler); trader/fighter/veteran/gambler/greedy are
  byte-identical, which is the control that says a verb-yield change moved the callers and not
  the world.
- `docs/balance/smoke/tiers.json` re-extracted from the stored N11 aggregate (**not** a
  capstone — standing amendment 3 gives the milestone's single capstone to T-116). Its
  checkpoint numbers therefore describe the new ruleset's replay of a stored sweep, not a fresh
  measurement of the new content.
- **`replay-golden.ts` did NOT move**, and that is a real signal rather than luck: the primary
  log's day-1 Explore charts a derelict and every derelict leg is untouched by this pass.

**Two collateral tests were investigated to root cause rather than dismissed.**
`nemesis-fragments.test.ts`'s Sage seed and `deed-coverage.test.ts` both went red on the first
attempt (which diluted the derelict leg); both are green with **zero edits** under the staged
shape above — the second was what surfaced F-113-D, and it is exactly the regression that test
exists to catch.

Author the first third of the 100-outcome table in `packages/content`, weighted toward the
**common and low-value** end: salvage rows, lore/dead-end rows, and a small number of
low-tier unique items. Establish the house voice and the row shape the next two passes
follow. No engine change is permitted in this task — if a row cannot be expressed, that is a
framework finding to report, not a branch to add.

**Accept:** ~34 outcomes committed as content rows; a content-validation test asserts every
row is well-formed and that the table's value distribution matches the spec's ladder; zero
lines changed under `packages/engine/src`; a test drives at least one instance of each
outcome TYPE present in this pass through the real Explore path; gate green.

### T-114 · Explore content pass 2 of 3 — the middle (~33 outcomes) — `status: DONE` · `coder: opus` · `after: T-113`

**Delivered (2026-07-30):** **33 authored rows — band 2 exactly** (§5.3 pass 2), for **67
authored rows** in the table: 14 mid salvage (6 beacon / 8 derelict, credit bands inside
§5.2's authored 240–700cr, floor and ceiling both **reached**, midpoints averaging **475cr**
against §5.5's 470cr band-2 credit-equivalent), 8 unique items (7 Class A + the one Class-B
`item-tally-slate`), 6 NPC introductions, 3 questline hooks and 2 lore rows carrying
`effects`. **Zero lines changed under `packages/engine/src`** outside `__tests__`
(`git diff --stat HEAD -- packages/engine/src ':!packages/engine/src/__tests__'` is empty),
and `grep -c "if (" packages/content/src/exploration.ts` is **0**.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked with `ls`; absent), so I oriented from `docs/EXPLORE_REDESIGN.md` §2/§4/§5/§8, `TASKS.md`, and the · attempts=1/4.

- **F-113-D IS DISCHARGED, arithmetically rather than by hope.** `legacy-salvage-derelict` is
  **deleted** and the derelict salvage leg re-pointed at the 14 authored derelict salvage rows
  (6 band-1 + 8 band-2), derived by `.filter`/`.map` and never transcribed. P(`SalvageRecovered`
  ≥ 400) — the `rich_hulk` trigger — goes **0.302 → 0.3837** over that leg, so band 2 restores
  the deed with room instead of diluting it. `deed-coverage.test.ts` and
  `nemesis-fragments.test.ts` are both green with **zero edits**. The leg is kept
  **salvage-only** and a validator assertion pins that, because it is the only leg in the game
  calibrated on a credit distribution.
- **THE BEACON LEG BECOMES THE "FIND" LEG (31 ids)** — the 12 beacon salvage rows plus all 19
  non-salvage band-2 rows. `drawLegacyLoot` resolves whatever id a leg names without caring
  what KIND the row is, which is what makes the whole of pass 2 reachable through the real
  Explore verb with no engine line. A new validator assertion pins the structural guard: every
  id on a leg for pool *P* names a row whose own `pools` include *P*.
- **QUESTLINES RESOLVE INTO THE REAL STORYLET SYSTEM, end to end.** Three new `explore.*`
  storylets in `packages/content/src/storylets.ts`, each `scheduledOnly` with a
  `wireResolution` and a requirement-free choice. **The blocker and its fix:**
  `validateStorylets` built its scheduled-target set only from other storylets'
  `effects.schedule` and threw on a `scheduledOnly` beat nothing schedules — a rule written
  when a storylet was the only possible scheduler. `validateStorylets`/`defineStorylets` now
  take `externalScheduledIds`, and `storylets.ts` passes the **derived**
  `EXPLORE_SCHEDULED_STORYLET_IDS` from `exploration.ts`. The rule is kept intact rather than
  weakened. No import cycle: `exploration.ts`'s only runtime import is `./nemesis.js`.
- **Asserted end to end, through the player-reachable path**: the 2,000-seed
  `resolveExploration` sweep reaches **all 53 leg-addressed rows** (band-2 rows via their
  `RecoveryStarted`, because band 2 defers), and a second block drives a band-2 row of each
  kind to **payout through the real dusk** (`startDay`/`applyPlayerAction`/`endDay`, never a
  hand-called resolver) asserting `RecoveryPaidOut` plus `SalvageRecovered` inside band,
  `UniqueItemAcquired`, `DispositionChanged`, and — for the questline — `StoryletScheduled`
  → the day arrives → `refreshAvailableStorylets` → **`StoryletOffered` for that exact id**.
  NPC profile ids are resolved against **both** `ALL_NPC_PROFILES` and the live
  `createInitialState().npcs` roster, because `applyEffects` silently `continue`s on a roster
  miss.
- **The two §5.2 effect-ceiling columns landed** (`classACeiling` / `classB`), transcribed
  verbatim, closing F-112-C. The validator checks every item row against its own band's
  column. The `draw weight` column is still absent on F-113-A's argument.
- **UI:** `explorationOutcome` gains an NPC-introduction clause and a questline-hook clause
  (name lookups on `DispositionChanged` / `StoryletScheduled`, never a re-derived effect), with
  three new tests. §4.4: a committed find the player cannot see is a trap.

**Findings, reported rather than routed around:**

- **F-114-A · the spec collided with itself on band 2 and `questline`.** §5.2's band-2 cell
  omitted it; §5.3's pass-2 bullet, §8's handoff row and T-114's own Accept clause all say
  band 2 authors the first questline hooks. Nothing was red, and `permittedKinds` has exactly
  one reader in the tree (the content validator) — no engine line reads it, so no seeded career
  changes either way. Closed in the direction the majority of the spec agrees on;
  `docs/EXPLORE_REDESIGN.md` §5.2 corrected **in place** (the T-113 precedent). The
  alternative — authoring zero questline rows so the clause is vacuously true — is
  metric-gaming.
- **F-114-B · band 2's `+1` Class-A strength ceiling is below its own readers' granularity.**
  `navBonus` divides component strength by `NAV_BONUS_DIVISOR = 10`, so `navigation +1` yields
  **+0** to a PILOT check; every other strength reader divides too. The `maxFuel +20` arm is
  the only unconditionally perceptible Class-A grant at this tier, so the mix leans on it (3 of
  7). **Biasing the mix inside the ceiling is authoring; raising the ceiling would not be** —
  the ceiling is authored verbatim. Recommend the question go to T-115/T-116 or the owner.
- **F-113-A · still unowned, and now the ONLY thing between the table and full reachability.**
  The inert set is exactly the **14 band-0 dead ends** and nothing else. The three-leg carrier
  has no "nothing else fired" arm, and inventing one is an engine branch. T-115's "a sweep
  finds every outcome" clause remains arithmetically impossible until the single band-weighted
  draw lands.
- **F-113-B · `contraband` still cannot be retired by a content pass** — deleting the union
  member makes the engine's exhaustive `case 'contraband':` a `tsc` error. The two rows survive
  and the tripwire now names exactly them.
- **F-113-C deepens on BOTH halves, and the sign flipped up.** Every band-2 row is
  `recoveryDays: 1`, so a successful board now also costs the next day's Explore (the fifth
  typed refusal). Measured on the `campaign-degraded` window (5 seeds × 40 days): explorer
  median final credits **9,094 → 34,234**, smuggler **4,841 → 5,650**. **Nothing was re-priced
  in response** — five seeds cannot separate that from stream noise, re-pricing Explore is
  R-series and an owner call, and T-116 owns the verdict.
- **Nothing had to be dropped.** Every band-2 row §5.3 asks for was expressible as a row; the
  only thing that needed a code change was the validator seam above, and it is content-side.

**Fixtures moved, each re-derived with a ledger entry — never edited to go green:**

- `exploreOutcomes.test.ts` `LEGACY_PARITY_HASH` + the aggregate, entry **T-114** naming the
  three mechanisms (the derelict leg going from 1 id to 14 and so consuming an index draw it
  never used to; the beacon leg becoming the 31-id find leg; 33 deferring rows each skipping a
  payload roll). salvage 79 → 70, fragments 97 → 93, contraband 44 → 26, credits 309,047 →
  310,192, RecoveryStarted 136 → 167.
- `recovery.test.ts` — **one seed of three** (`SEED_OPENS` 36 → 82); 10 and 24 are **unmoved**.
  No assertion changed shape; two literals moved because they *name the drawn row* and the row
  they named was deleted. A new test asserts the **in-flight save** holding
  `legacy-salvage-derelict` resolves to `RecoveryAbandoned{unknown-outcome}` and mutates
  nothing — so the retirement owes **no save bump**.
- `exploration.test.ts` — the three-explore determinism seed (2024 → 1), because three boards
  in a day now only chart three POIs when none of them opens an op. Both assertions unchanged.
- `campaign-degraded.test.ts` `PINNED_FINGERPRINTS` — ledger entry **15**. **Exactly the two
  sweeping policies move** (explorer, smuggler); trader/fighter/veteran/gambler/greedy are
  byte-identical, which is the control that says a verb-yield change moved the callers.
- `uniqueItem.test.ts`'s "all three are Class-B modules" **retargeted, not deleted** — the
  claim that mattered is §4.2's cap, so it now asserts the Class-B tier is exactly three.
- `docs/balance/smoke/tiers.json` re-extracted from the stored N11 aggregate (**not** a
  capstone — standing amendment 3 gives the milestone's single capstone to T-116). Its
  checkpoint numbers therefore describe the new ruleset's **replay of a stored sweep**, not a
  fresh measurement of the new content.
- **`replay-golden.ts` did NOT move, and the reason is checkable rather than lucky:** the
  primary log's day-1 Explore charts a derelict on which **no leg fired at all** (the fixture
  contains one `PoiDiscovered` and zero `SalvageRecovered` / `FragmentAcquired` /
  `ContrabandFound` / `RecoveryStarted`). A leg that never fires never reaches its index draw,
  so re-pointing the ids behind it cannot re-phase that board.

The second third, weighted toward **mid-value**: unique items with real effects, the first
questline hooks, and NPC-introduction outcomes. Questline and NPC outcomes must connect to
the existing storylet and cast machinery rather than inventing a parallel one.

**Accept:** ~33 outcomes committed; every questline outcome resolves into the existing
storylet system and every NPC outcome references a real cast or quest profile id (asserted by
a test that resolves the ids against content); zero lines changed under
`packages/engine/src`; gate green.

### T-117 · The single band-weighted draw — the F-113-A engine flip — `status: DONE` · `coder: opus` · `after: T-114`

**Why this task exists, and why its number is out of order.** It was inserted after T-114 had
already shipped, as the fix round of T-115's review. `docs/EXPLORE_REDESIGN.md` §2.4 (T-113,
already committed and gated) says the flip *"needs a dedicated engine task between T-114 and
T-115, or T-115's first commit"*, and **F-113-A recommended the dedicated task explicitly**.
That recommendation was not acted upon when T-115 was scheduled, so T-115 absorbed the engine
work and then amended its own **Accept** clause to permit it. **A task rewriting its own bar
in the same commit as the work being judged is not a legitimate amendment** — the precedents
it cited (F-113-A, F-114-A) amended the *design spec*, not acceptance criteria. This block is
the process gap being closed the way F-113-A asked for: the engine change gets an owner other
than the content pass, and **T-115's Accept clause is restored verbatim** (see F-115-A).

**Delivered (2026-07-30):** F-113-A and F-113-B discharged. Explore now draws **one
band-weighted row per board** out of `EXPLORE_OUTCOMES`, and the transitional three-leg
carrier is gone.

- `weight` joins `ExploreValueBand` — **25/33/24/15/3**, §5.2 verbatim, summing to 100. This
  discharges **F-112-C**'s "a column with no consumer is a stub" objection, which is exactly
  why T-113 and T-114 both refused to add it: `drawOutcome` is now the consumer.
- **`drawOutcome(poiType, rng)`** in `packages/engine/src/exploreOutcomes.ts`. Filters
  `EXPLORE_OUTCOMES` by pool, groups by band, spends **one** `rng.next()` on a band weighted
  over the bands actually present in that pool (**renormalised**, so an empty band cannot
  swallow probability) and **one** on a uniform pick inside it. **A flat two draws, always** —
  the legacy single-id short-circuit died with the model it reproduced. The row goes to
  `claimOutcome`, so a band-2+ find opens the recovery slot. Determinism order is §2.4's:
  POI type → flavour name → band → row → within-payload roll.
- **The call-site swap** in `packages/engine/src/actions/exploration.ts`: `drawLegacyLoot` out,
  `drawOutcome` + `claimOutcome` in. These **two files are the whole engine-source diff** —
  `git diff --stat packages/engine/src -- ':!**/__tests__/**'` names exactly them.
- **DELETED:** `drawLegacyLoot`, `LEGACY_POI_LOOT`, `LegacyLootLeg`, `LegacyPoiLootTable`,
  `authoredSalvageLeg`, `band2NonSalvageLeg`, the two `legacy-contraband-*` rows, the
  `contraband` member of `ExploreOutcomePayload` and the engine's `case 'contraband':`.
- **KEPT deliberately:** the `ContrabandFound` event variant in `types.ts`/`schema.ts`.
  Removing an event shape is save/schema surface and would drag a version bump into a content
  pass; it simply stops being emitted. `packages/ui/src/format.ts`'s clause for it survives
  with a comment saying so. **No save-shape change, so no migration and no bump** —
  `CURRENT_SAVE_VERSION` stays 13 and `packages/engine/src/save.ts` is untouched. An in-flight
  save naming a deleted `legacy-contraband-*` id resolves to
  `RecoveryAbandoned{unknown-outcome}` and mutates nothing — the test T-114 shipped for
  `legacy-salvage-derelict` already covers the shape.
- **THE SEALED POD IS RE-HOMED, NOT DELETED, and it is the one real risk this task carried.**
  `flags['signal.contraband.pending']` — the only supply line for `derelict.sealed-pod` →
  `smuggling.podsTaken` — moves onto **three already-authored band-1 derelict `lore` rows**
  through `effects.flags` (`DERELICT_POD_EFFECTS`). No row was added: §5.3's per-band counts
  are fixed. The three are chosen on **fiction** and each is argued in the comment — the cargo
  manifest off the purser's station, the burn schedule with all figures and no destination,
  and the survey file stowed well away from the log. The other two derelict fragments (a
  choral pattern on a dead bus, the wreck's flight log) are deliberately NOT on the list.
  **MEASURED: 20% → 4.4% of successful boards** (6,000-board sweep through the real verb,
  asserted with a wide window). The tripwire held without any tuning:
  `campaign-smuggler-gambler.test.ts` `podsTaken > 0` is green at **7 pods, 95 days carrying
  illicit, 7 scans (2 evaded)** on seed 1, against 17/151/9 before.

**F-117-A · THIS TASK AND T-115 LAND IN ONE COMMIT, AND THAT IS RECORDED RATHER THAN
DRESSED UP.** They are separate tasks because the engine change needed an owner other than the
content pass. They are not separable into two *green* commits: the flip alone would leave the
suite red until every fixture in T-115's "Fixtures moved" list is re-derived against a 67-row
table, and every one of them would then have to be re-derived a second time at 100 rows — two golden regenerations and two
fingerprint ledger entries for one behaviour change, which is precisely the fixture churn
`docs/VERSIONING.md` and standing amendment 3 exist to prevent. So the fixture ledger entries
in the source tree name the combined move, and each names **both** mechanisms. The reviewer
should read the two Accept clauses against one diff, with the engine-source lines charged
here.

**Accept:** `drawOutcome` exists in `packages/engine/src/exploreOutcomes.ts` and is the sole
outcome draw at `resolveExploration`'s call site (grep both); `drawLegacyLoot`,
`LEGACY_POI_LOOT` and the `contraband` payload kind are gone from the tree entirely; the
engine-source diff is **exactly** `exploreOutcomes.ts` and `actions/exploration.ts`; a test
drives `drawOutcome` directly and asserts the renormalised band split and the flat two-draw
cost; `CURRENT_SAVE_VERSION` unchanged; gate green.

### T-115 · Explore content pass 3 of 3 — the tail (~33 outcomes) — `status: DONE` · `coder: opus` · `after: T-117`

**Delivered (2026-07-30):** **the table totals 100 rows and every one is authored** — no
`legacy-` prefixed row survives.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root. · attempts=2/4.

**The 33 rows of bands 3 and 4 — zero engine-source lines** (the draw flip that makes them
drawable is **T-117**, the dedicated engine task F-113-A asked for).

- **Band 3 (25 rows, N = 3):** 14 unique items (13 Class A + `item-marked-ephemeris`, §4.2's
  `reroll` module, granted by no row until now), 6 questline hooks (`delayDays` 1-5), 5 NPC
  rows at `dispositionDelta` **3-4** against band 2's 1-2 — a band-2 row is an INTRODUCTION,
  a band-3 row is a DEBT, and the validator now checks the delta **per band** so a band-2 row
  cannot quietly buy band-3 standing.
- **Band 4 (8 rows, N = 6):** 6 unique items (5 Class A + `item-berth-couch`, the `extra-die`
  module) and 2 questlines.
- **18 new `EXPLORE_ITEMS`**, every one inside its granting row's band ceiling, and the
  ceilings are **reached** on all three `ShipElementDelta` element classes: `+6`/`+10`
  strength, `+40`/`+80` maxFuel, and **the table's first `cargoPods: +1` grants** (3 of them,
  clamped by the shipyard's own `maxCargoPodsForShip`). Every shipped item is now granted by
  exactly one row — a new test asserts no item is orphaned and none is granted twice.
- **8 new `explore.*` storylets** in `storylets.ts`, each `scheduledOnly` with a
  `wireResolution`, reaching `EXPLORE_SCHEDULED_STORYLET_IDS` by the existing `.flatMap`.
- **Pool discipline:** every band-3/4 row is `pools: ['beacon', 'derelict']`, and a new test
  asserts **every band has at least one row in every pool** — which is a reachability property
  under `drawOutcome`'s renormalisation, not a style rule.

**The three Accept criteria, and the test that satisfies each:**

- *table totals 100* — `exploreContent.test.ts` asserts `EXPLORE_OUTCOMES` **and** `authored`
  are both 100 and the per-band spread is **14/20/33/25/8**, plus the per-kind spreads for
  bands 3 and 4. The "names EXACTLY the two legacy rows still owed a retirement" tripwire is
  **kept and flipped** to assert zero survive.
- *recovery time correlates with value across the whole table* —
  `exploreOutcomes.test.ts` keeps §5.4 part 1 (monotone over all pairs, now 100 rows) and adds
  **part 2**: the mean `recoveryDays` of the top `valuePoints` quartile is strictly greater
  than the bottom's (0 → ≥3). Both are structural properties of a function of a band, so
  neither is a tuned threshold and neither can rot. `recovery.test.ts` additionally drives
  **N = 6 end to end through the real day loop** for the first time — six duskes, the verb
  refused on every dawn between, payout on the sixth.
- *the rarest tier is reachable* — the sweep is raised **2,000 → 6,000** boards (§5.3 computes
  1,351 for 95% confidence on the 8 band-4 rows at 0.375%; 6,000 is margin) and the three
  partial-reachability tests collapse into **one**: all 100 rows observed, failure message
  lists the missing ids. The "records EXACTLY which rows are still inert" ledger is **kept and
  taken to zero** rather than deleted.

**Findings, reported rather than routed around:**

- **F-115-A · T-115's two Accept clauses could not both hold, and the resolution was to give
  the engine work its own task — NOT to rewrite this task's bar.** "A seeded sweep finds at
  least one instance of every outcome" is arithmetically impossible under the three-leg
  carrier — the 14 band-0 dead ends are on no leg, and five of them are derelict-specific, so
  re-pooling them onto the beacon "find" leg would be false fiction. This is not a discovery:
  it is **F-113-A**, recorded by T-113, re-confirmed by T-114, written into §2.4, and it
  **recommended a dedicated engine task between T-114 and T-115**, which was never scheduled.
  The first attempt at this task absorbed the flip and amended the Accept clause below in
  place; **review rejected that, correctly** — the precedents cited (F-113-A, F-114-A) amended
  the design spec, and a task may not amend its own acceptance criteria in the same commit as
  the work being judged. **The fix acts on F-113-A instead: the flip is now `T-117`, a task
  with its own Accept clause, and the clause below is restored VERBATIM.** T-115's own diff
  therefore contains **zero lines under `packages/engine/src`** outside `__tests__`, and its
  reachability clause is satisfiable and satisfied because T-117 precedes it. See F-117-A for
  the one thing this does not paper over: both tasks land in a single commit.
- **F-114-B · CLOSED BY AUTHORING, and no ceiling moved.** T-114 recommended band 2's `+1`
  Class-A strength ceiling to T-115. The ceiling was never the problem: §5.2 already
  authorises `+10` at band 4, and `item-lane-computer` (`navigation +10`) is the **first
  perceptible component grant in the whole table** — `navBonus` divides by
  `NAV_BONUS_DIVISOR = 10`, so it is the first delta anywhere worth a whole `+1` on a PILOT
  check. A ladder is supposed to have a tier where a component grant is a rounding error and a
  tier where it is permanent. §5.2 is unchanged.
- **F-115-B · EXPLORE'S PER-OUTCOME EVENT RATE FALLS BY ROUGHLY 10x, BY DESIGN, AND IT MOVES
  TWO SEPARATE DEED SUPPLY LINES.** A board used to walk three independent legs and now draws
  one row of a hundred. `rich_hulk` (a 400cr+ `SalvageRecovered`) came off a leg firing on 80%
  of derelict boards and is now a band-2 derelict salvage row at ~3.6% of boards;
  `slipped_the_scan` / `known_to_the_league` / `run_seized` are all downstream of the sealed
  pod, at 20% → 4.4%. Measured on `deed-coverage.test.ts`'s own driver over **seeds 1..160**:
  the union is **still 44/44** (and 44/44 inside 1..28 alone), so no deed is dead content — but
  the number of careers that earn the whole slate alone fell from *four in twelve* to **two in
  sixty-five** (seeds 31 and 65), and twelve of the fourteen near-misses miss
  `slipped_the_scan`, the same long pole every previous sweep names. **The sample was widened,
  never the threshold** — `>= 2` is byte-identical and every other number in that file is
  untouched. Re-pricing Explore or the pod supply to flatter it would be metric-gaming; T-116
  owns the verdict.
- **F-113-C, final measurement.** On the `campaign-degraded` window (5 seeds × 40 days) the
  explorer's median final credits go **34,234 → 10,553** and the smuggler's **5,650 → 5,844**.
  The explorer's fall is expected and is not tuned around: 25% of boards are now dead ends
  (drawable for the first time), 42% open a multi-day recovery, and §5.5's ~447cr of value per
  board is mostly permanent items, hooks and standing that a final-credits figure cannot see
  inside 40 days. **T-116 owns the verdict.**
- **Nothing had to be dropped.** Every row §5.3 pass 3 asks for was expressible as a row. Two
  incidental repairs were needed and both are recorded where they happened: the Astro League
  is `league` (there is no `guild` `FactionId`, so the bonded-crate episode was re-authored
  around the real faction), and `storylets.test.ts`'s
  `STORYLETS.find(...)!.wireResolution.wireMessage` needed splitting into a named binding
  because eight more entries widened the `as const` tuple past where TypeScript carried the
  non-null assertion through the chained access. The split asserts strictly more than the line
  it replaced.

**Fixtures moved, each re-derived with a ledger entry — never edited to go green.** Every
entry below is charged to the **combined** T-117 + T-115 commit and names both mechanisms,
per F-117-A: separating them would mean re-deriving each fixture twice for one behaviour
change.

- `exploreOutcomes.test.ts` — the "legacy parity (T-110)" describe **retires with the table it
  pinned** and is re-pointed at the mechanism that replaced it, as **"the WEIGHTED DRAW
  aggregate (T-117)"**, with a ledger entry naming the four mechanisms. Over the same
  300 seeds: salvage 70 → 78, fragments 93 → 38, contraband **26 → 0**, podFlagged 26 → 15,
  RecoveryStarted 167 → 134, credits 310,192 → 310,219. `contrabandEvents` is still counted,
  at zero, so a re-emission would show up rather than pass silently. Each figure is read
  against its predicted share (RecoveryStarted 44.7% vs the 42% of the table in bands 2-4;
  podFlagged 5.0% vs 4.5%) rather than reported as a verdict.
- `replay-golden.ts` — **regenerated via `gen-golden.ts`, and it moved exactly as T-114's own
  note predicted it would.** Only the PRIMARY pair changed: its day-1 board fired no leg under
  the carrier and now draws `explore-item-field-coils` (band 3, dueDay 4). Of 22 responses
  exactly ONE differs, gaining `RecoveryStarted` and its wire line; **all three `rngState`s are
  unchanged**; purse, fuel, charted POI, flags, deeds and rank are identical; the only other
  state change is two `registry.earned[].eventIndex` anchors moving by exactly 2. The op is
  then forfeited by the §3.3(a) location predicate when the log travels away on day 2 — the
  recovery rule working end to end inside a fixture written before it existed.
- `campaign-degraded.test.ts` `PINNED_FINGERPRINTS` — ledger **entry 16**. **Exactly the two
  sweeping policies move** (explorer `735e77e3` → `2537a7aa`, smuggler `e3319430` → `edab634b`);
  trader/fighter/veteran/gambler/greedy are byte-identical, the control that says an Explore
  change moved the callers and not the world.
- `recovery.test.ts` — **two seeds of three re-derived** (`SEED_OPENS` 82 → 52, `SEED_DIES`
  24 → 12; `SEED_TRAVELS_AWAY` 10 is **unmoved**). No assertion changed shape; two literals
  moved because they NAME THE DRAWN ROW. A new `SEED_BAND4 = 2` drives the N = 6 clock.
- `nemesis-fragments.test.ts` — `DERELICT_SEED` 17 → 18 and `SAGE_SEED` 2 → 5, both re-swept
  with the same driver and horizon. Mode 1 still lands a net-new pool addition on day 1; mode 3
  still crosses its `minFragments` gate **organically** and now lands a day earlier.
- `deed-coverage.test.ts` — `COVERAGE_SEEDS` **widened 1..12 → 1..65** (see F-115-B). No
  threshold, band or assertion moved.
- `exploration.test.ts` — the three-explore determinism seed 1 → 3 (42% of boards now commit
  the ship, so which seeds thread three uncommitted boards moved); the contraband sweep and the
  sealed-pod test **retargeted onto the flag** the storylet actually triggers on, and the
  latter additionally asserts the board **speaks** — which the empty-`wireFound` legacy rows
  never did, so the retirement is a strict improvement on the player's side.
- `storylets.test.ts` — a `T115_STORYLET_IDS` batch line beside T-114's, same seam.
- `docs/balance/smoke/tiers.json` re-extracted from the **stored N11 aggregate** (`npm run
  balance:extract -- --aggregate docs/balance/baseline-n11-shipped.json`), **not** a capstone —
  standing amendment 3 gives the milestone's single capstone to T-116. `npm run format` was run
  BEFORE the re-extract so the recorded `rulesFingerprint` (`bbf007a6bf38a932`) describes the
  formatted tree.

**No save-shape change, so no migration and no bump.** `CURRENT_SAVE_VERSION` stays 13 and
`packages/engine/src/save.ts` is untouched — adding rows to a content table is not save
surface. (The one deletion that touches an id a save can hold is T-117's, and it is ruled on
there.)

The final third, weighted toward the **rare and powerful** end, where the time cost bites
hardest. This pass proves the ladder: the most powerful outcomes must be the slowest to
recover, by the content-driven rule from T-111 rather than by hand.

**Accept:** the table totals **100 outcomes**, asserted by a test; a test asserts recovery
time correlates with outcome value across the whole table (not row by row); the rarest tier
is reachable — a seeded sweep finds at least one instance of every outcome across N seeds,
and any unreachable row fails the test; zero lines changed under `packages/engine/src`; gate
green.

### T-116 · Explore: measure it, and answer the question that started this — `status: DONE` · `coder: opus` · `after: T-115`

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

**Delivered (2026-07-30):** `npm run format` first (zero files changed — the tree was already
prettier-clean), THEN the M2 capstone: eight 1-indexed shards × 1,000 seeds × 120 days × 8
policies with `--milestone-days 21,29,30,41,60,120`, merged to
`docs/balance/baseline-t116-explore.json` — `wrote aggregate for 8000 rows`. The smoke fixture
was re-extracted **from that file** (`spreads harvested`; `provenance.sweepLabel t116-explore`,
`runs 8000`), fingerprints rules `bbf007a6bf38a932` / instrument `313fde95fc5ee9db` / docs
`d8cec298cd93f909`. **The answer is that Explore is STILL a net loss, and the gap narrowed
rather than closed:** the paired sign count moved **101/120 → 85/120** seeds richer *without*
Explore (arm A median finalCredits 60,391 → 69,310; arm B 90,135 → 88,107, which is drift, not
signal, because the arms are not rng-paired). The ablation was re-run in the documented shape —
same two arms, same seeds 1..120 × 120 days, same arm-B `action.type !== 'Explore'` filter,
same hand-rolled loop, fidelity **5/5 MATCH** against `runCampaign(seed, 120, 'explorer')` —
with counters added and nothing else. The full before/after, the fenced probe source, the five
honesty caveats and the capstone provenance are appended as **`docs/EXPLORE_REDESIGN.md` §9**.
Two things the measurement found that §5.5 did not predict: the recovery ladder forfeits
**75.8%** of everything it defers (1,553 of 2,049 resolved recoveries, essentially all
`departed`), with **zero band-4 payouts in 14,400 simulated days**; and **F-116-1** —
`explorerPolicy` (`packages/sim/src/index.ts:4208-4222`) plans Explores without consulting
`state.player.recovery`, so **22.5%** of the Explores it queues are guaranteed
`recovery-in-progress` refusals, even though both the engine
(`packages/engine/src/actions/exploration.ts:52`) and `legalActions`
(`packages/sim/src/protocol.ts:666`) gate correctly. **F-116-1 is filed, not fixed** — it is a
policy change and would have invalidated the capstone taken in this same commit. Baseline of
record **re-pinned** to `baseline-t116-explore.json` under amendment 1's "does the baseline
describe HEAD?" rule (the diff moves exactly three rows — `fleet`, `explorer`, `smuggler` — and
leaves `trader` and the other five with zero changed fields); `balance-targets.test.ts:103`,
amendment 1's pointer, the `NPC_REDESIGN.md` status banner and the stale `smoke/README.md`
"current baseline" line all move in this commit. **Zero constants, DCs, prices, band weights,
thresholds, goldens or fingerprints were edited to reach the answer** — `git diff --stat` shows
zero lines under `packages/engine/src/`, `packages/content/src/`, `packages/sim/src/index.ts`
and `packages/sim/src/balance/`; the only source change is one path string. `CURRENT_SAVE_VERSION`
stays 13; no save shape moved. The `it.fails` clear-day tripwire is still correctly red on the
new capstone (trader median 21 against `[22, 30]`, n = 987) and was not converted. The pricing
lever remains an owner call, now with F-116-1 beside it.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading the spec, TASKS.md, the sweep/extract/fingerprint rig, and the  · attempts=1/4.

---

## M3 — Hangout: parameterise it, spread it, fill it

### T-120 · Extract the Hangout engine from its content, behaviour-preserving — `status: DONE` · `coder: opus` · `after: T-116`

Split today's `resolveVisitHangout` along ruling 3, to the shape T-101 specced: the engine keeps the rules
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

**Delivered (2026-07-30):** split `resolveVisitHangout` along ruling 3 — content gained a new
`packages/content/src/portHangouts.ts` (`PortHangout`, `HangoutVenueParams`, `HangoutClientele`,
`HangoutProse`, a fully-resolved `DEFAULT_PORT_HANGOUT` built entirely from `hangout.ts`'s existing
R-owned constants, and Sun-3's `SUN_3_HANGOUT` row keyed into `PORT_HANGOUTS`), and the engine
gained `packages/engine/src/hangoutRules.ts` (`portHangoutFor`, `wagerBandFor`, `venueParamsFor`,
`venueOffered`, `rankClientele`), all field-wise-resolved against the default so an omitted field
inherits today's shipped number by construction. `actions/hangout.ts` now reads the wager band, the
befriend DC and every venue's disposition deltas through those accessors instead of the old bare
`DARE_MIN_WAGER` / `DARE_MAX_WAGER` / `BEFRIEND_DC` / `*_DISPOSITION` constants, adds one new typed
refusal (`venue-not-offered`, checked before `spendDie`, routed through the existing `failVenue`
split so it lands on `HangoutEvent` for the five social venues and `LoanEvent` for borrow/repay),
and contains no port-specific branch. `packages/sim/src/protocol.ts`'s `legalActions` and
`packages/ui/src/format.ts`'s `dareWagerBounds` / `hangoutNpcs` were moved onto the same accessors
so the UGT harness and the Hangout pane never advertise or clamp against a value the engine no
longer reads from a constant. A compile-time `AssertEqual` pin ties content's `HangoutVenueId` to
the engine's `VisitHangout` venue union so the two can never drift. Deliberate scope boundary: only
Sun-3 has a row today (`PORT_HANGOUTS = { 1: SUN_3_HANGOUT }`), it reproduces current behaviour
exactly (every pre-existing hangout test passes unchanged), and the new `venue-not-offered` path is
proven only at the serialization layer (`hangout.test.ts`'s round-trip pair) — it is not reachable
end to end while every known port offers all seven venues, and the resolver-level assertion is
explicitly deferred to T-123's Arcturus-6 row. `docs/balance/smoke/tiers.json`'s `rulesFingerprint`
and `docsFingerprint` moved accordingly (new engine-root module, `hangoutRules.ts`, auto-hashed by
`ENGINE_RULE_DIRECTORIES`); no save shape moved and `CURRENT_SAVE_VERSION` is untouched.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented from `docs/HANGOUT_REDESIGN.md`, `docs/0.5.2-SPEC-REVIEW.md`, `TASKS.md` a · attempts=1/4.

### T-121 · A bar at all 14 spaceports — the reach change — `status: DONE` · `coder: opus` · `after: T-120`

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

**Delivered (2026-07-30):** `hasHangout: true` on ids 2–14 in `packages/content/src/systems.ts`
(fourteen hits, ids 1–14, Sun-3 … Vega-6) and thirteen baseline rows in
`packages/content/src/portHangouts.ts`, built by a branch-free `baselineHangout(systemId)` helper
and written out key by key so `PORT_HANGOUTS` stays greppable and T-122 … T-124 can replace one
line at a time. **Reach went 1 of 28 → 14 of 28.** The rim (15–20), Andromeda (21–26), MALIGNA (27)
and NEMESIS (28) gained nothing, per §4.5 and because a non-empty un-flagged set is what keeps
`ActionBlocked{'no-hangout'}` reachable at all. Deliberate scope boundary: the thirteen rows carry
`systemId` and `prose` only and OMIT `venues` / `wager` / `venueParams` / `clientele`, so every
number resolves field-wise to `DEFAULT_PORT_HANGOUT` and is mechanically identical to Sun-3's —
which is what lets every moved number below be attributed to reach rather than to tuning. All
authored voice, bands, DCs, dispositions and clientele are T-122 … T-124.

Tests: `packages/engine/src/__tests__/hangoutRules.test.ts` gains
`describe('T-121 · the reach change …')` with the enumerating assertion (all fourteen carry the
flag, a row, `key === systemId`, a non-empty house name and a well-ordered band), the **two-way
`hasHangout` ↔ `PORT_HANGOUTS` set equality** §2.2 ruling 3 owed, a non-vacuous "no rim or gated
system gained a venue" sweep over every id > 14, and a baseline-inertness check asserting the
thirteen rows resolve to Sun-3's values through the accessors rather than through restated
literals. `hangout.test.ts` generalises `hangoutState(dice, systemId = 1)` and drives
`applyPlayerAction` (not the resolver — the gate is what changed) for a **Dare at Vega-6 (id 14)**
and a **borrow at Mira-9 (id 8) with the port emptied of NPCs**. New
`packages/ui/src/__tests__/hangout-gate.test.ts` pins `hangoutOpen()` to the `hasHangout` set port
for port. Six retargets: the two `no-hangout` refusal tests (`hangout.test.ts`,
`sim/protocol.test.ts`) and the enumerator's negative case moved from Aldebaran-1 to Antares-5 (15);
`e2e/hangout.spec.ts`'s gate test was **inverted** to "the Hangout pane follows the engine gate to a
second port" (§4.2's own recommendation — a rim hop is unfundable from a fresh start, so the
negative case moved to the new unit test); the stale "the only `hasHangout` system" prose in
`deed-hunter.ts`, `poverty-invariant.test.ts` and the e2e fixture header was corrected.
`deed-hunter.ts` keeps `HANGOUT_SYSTEM = 1` and its fixed routing deliberately — §4.2's
"route to the nearest Hangout" option was **not** taken, so the veteran's deed errand stays
deterministic across this measurement.

Goldens, stated explicitly. `packages/engine/src/__tests__/fixtures/day-loop-golden.ts` — **not
regenerated, byte-identical**, as §4.2 predicted: neither script issues a `VisitHangout` and
`hasHangout` never enters `serializeState`. All six `replay-golden.ts` constants — **byte-identical
and not regenerated**, which CONTRADICTS §4.2's prediction and is recorded rather than hidden: the
replay logs only ever emit `state-summary` and `action-result` responses (verified — the generator's
output matches the committed constants exactly), never a `legal-actions` enumeration, so the thirteen
new `VisitHangout` advertisements have nowhere to appear. **Event-count diff: 0 added `VisitHangout`
advertisements, response counts unchanged 22/12/7, and all three session `rngState`s unchanged
(-163636262 / 268015010 / -1231248819).** `campaign-degraded.test.ts`'s `PINNED_FINGERPRINTS`
**did** move and were re-recorded with ledger entry 17: trader `f3e01b2a843c1c0f → 1b4e953468311f40`,
smuggler `edab634b451035f3 → faa0c778be299406`, gambler `fbb8b4df794fa5f4 → 8950ea1dfd8d318e`;
fighter / explorer / veteran / greedy byte-identical — the control that says the change is reach and
nothing else.

Player-side counts that moved (10 seeds × 120 days, before → after). Trader: loan defaults 6 → **0**,
interest accrued 19,866 → 2,833, days carrying a loan 181 → 32, mean final credits 40,082 → 43,903,
mean debt-cleared day 28.2 → 23.0. Smuggler: loans taken 10 → 16, defaults 3 → **0**, interest
14,100 → 3,091, days with a loan 141 → 38, mean final credits 38,003 → 34,278, subsistence days
0 → 14. Gambler: visits/dares 272 → **1,314**, wagered 186,626 → 867,112, dare net credits
54,024 → 132,746, `expectedValuePerDare` **198.62 → 101.02** (still firmly positive), mean final
credits 44,519 → 53,221. Veteran unchanged in every field. **The headline is that the Penny Wise
desk stopped being a trap** — defaults fall to zero because a captain can now repay where it stands
rather than only where it started — **and that the tables stopped being free money**, because the
law of large numbers finally reaches a verb the gambler could previously play a handful of times.
Nothing was tuned in response.

**F-121-1, found by this measurement and fixed here.** `planDare` (`sim/index.ts`), `legalActions`
(`sim/protocol.ts`) and the deed hunter's `dealerHere` all picked an in-system dealer **without** the
resolver's N3 `!npc.dead` guard, so all three could name a dead captain the engine then typed-fails
with `'no-opponent'` — exactly the drift `hangoutPlay.failedVisits === 0` exists to catch. Latent
while one port had a bar (0 failures over 10 seeds × 120 days); live after the reach change
(2 failures, seed 7, day 75, `npc-black-tide`). All three now mirror the engine; `failedVisits` is
back to 0. Also carried over from T-120 per §4.2: `planDare` now clamps with `wagerBandFor(portId)`
instead of the bare `DARE_MIN_WAGER` / `DARE_MAX_WAGER` (arithmetically inert today — every row
inherits the default band — and it lands while it is provably so, ahead of T-123's authored bands).

Fixture position: `docs/balance/smoke/tiers.json` was **re-extracted** from the stored
`t116-explore` aggregate after `npm run format` (`rulesFingerprint`
`d458b149c4ae2c64 → bdc51a44e6df92f0`, `instrumentFingerprint`
`313fde95fc5ee9db → 537f29b61ecc9719`, `docsFingerprint` `e79d7f5b4cd69818 → f0d2fa636fdbd10d`;
`provenance.sweepLabel` stays `t116-explore`). **This is not a capstone** — no sweep was run and no
baseline was re-pinned; the milestone's single capstone is owed at T-125. Checkpoint deltas repeat
the same control: fighter / explorer / veteran / greedy are IDENTICAL at all four tiers, and only
trader, trader-degraded, smuggler and gambler moved (e.g. days-1-3 gambler `deedsEarned` 41 → 57,
`outcomeHash` `71e4619ff5df056c → f846d60ca1bab5ab`; days-41-43 trader `debtTotal` 22,209 → 7,280,
`outcomeHash` `15c2af2c8f8c4708 → 236f75db23e0b91a`).

Obligations honoured: **no `packages/engine/src/npc.ts` edit** (§5.2 — the `executeSocialize`
`hasHangout` defect stays open for T-130, and T-125 re-measures the 95.91% figure this task has just
halved by construction); **no save-shape change**, `CURRENT_SAVE_VERSION` untouched (§4.3). The
`balance-targets.test.ts:180` live 40-seed "the trader clears the marker, and clears it fastest" —
§4.2's one to watch — stayed green, as did the `it.fails` [22,30] band at `:225`. Fiction consequence
created and knowingly accepted (§5.2): the rumor mill will now name a Hangout at ports where the
player is told there is none — recorded here, not fixed in this task. Gate green: typecheck, lint,
`format:check`, all four workspaces' vitest suites (1,509 tests) and the Hangout/onboarding
Playwright specs.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented from `docs/HANGOUT_REDESIGN.md` §2/§4/§5/§6, `TASKS.md` T-120/T-121, and t · attempts=1/4.

### T-122 · Hangout content pass 1 of 3 — the core worlds (5 ports) — `status: DONE` · `coder: opus` · `after: T-121`

Author the first five ports' clientele, tone and house rules over the placeholder parameters.
These are the everyday bars — the baseline the exotic and dangerous ones are exotic and
dangerous _against_. Voice must match the game's period register (see the wire templates and
storylet prose for the house voice).

**Accept:** five ports carry authored content; a test asserts each has distinct parameters (no
two ports identical) and that all authored prose is non-empty and placeholder-free (a `grep`
for `TODO` / `TBD` / `placeholder` in the content returns nothing); zero lines changed under
`packages/engine/src`; gate green.

**Delivered (2026-07-30):** four authored rows in `packages/content/src/portHangouts.ts` —
`ALDEBARAN_1_HANGOUT` (id 2), `ALTAIR_3_HANGOUT` (3), `MIRA_9_HANGOUT` (8), `PROCYON_5_HANGOUT`
(10) — swapped into `PORT_HANGOUTS` keys `2` / `3` / `8` / `10` over T-121's `baselineHangout(id)`
calls. With Sun-3 (authored at T-120) that is **five ports carrying authored content**. Axis
vectors, each deviation carrying its one-line reason in the row's own comment:
**Aldebaran-1, the exchange-floor bar (`the Weighbridge`)** — band 50/750 (narrowed at both ends:
the floor deals no 25cr hands and nobody bets a hold), `meet` +1→+2 (introductions are the point of
the room), `befriend` DC 12→11, `insult` −4→−3, `dare` untouched, clientele `['trader']`.
**Altair-3, the lane-side stopover (`the Waypost`)** — the deliberate NUMERIC MEAN: `wager` and
`venueParams` OMITTED (not restated), distinct on clientele `['smuggler','explorer']` alone.
**Mira-9, the fuellers' canteen (`the Dry Tank`)** — §6.1's dive shape, band 5/200; `befriend`
DC 12→10 and +3→+4; `meet` +1→+2; `insult` −4→−3; `dare` +2/−2 → +3/−1 (the forgiving pole);
clientele `['trader','veteran']`. **Procyon-5, the freight-guild room (`the Bonded Room`)** —
band 100/500 (the narrowest in pass 1), `befriend` DC 12→9 (§6.1's named easy pole), `insult`
−4→−7 (dear; −8 and below deliberately left to T-123's garrison), `dare` failure arm −2→−3;
clientele `['explorer','trader']`. All four offer all seven venues (§6.3 narrows no venue set
until T-123's Arcturus-6), each carries a house name, a room line and seven flavour lines in the
period register, and no two of the five share an axis vector.

**Sun-3 is unchanged, proved rather than asserted:** `PORT_HANGOUTS[1].wager` / `.venueParams` /
`.clientele` are all still `undefined` and `wagerBandFor(1)` / `venueParamsFor(1, v)` equal
`DEFAULT_PORT_HANGOUT`'s for all seven venues (`hangoutContent.test.ts`, "Sun-3 is still the
DEFAULT row plus prose"). **Zero lines changed under `packages/engine/src` outside `__tests__`:**
`git diff --stat HEAD -- packages/engine/src ':!packages/engine/src/__tests__'` prints **nothing**
(empty output, exit 0). No `packages/engine/src/npc.ts` edit (§5.2 stays open for T-130); no
`packages/ui/src` edit; no save-shape change — `CURRENT_SAVE_VERSION` stays **13** and no
migration is owed.

Tests: new `packages/engine/src/__tests__/hangoutContent.test.ts` (38 assertions) is the T-122…
T-124 content validator — well-formedness per port, the §6.4 **set-cardinality check over
resolved axis vectors** (which reports the colliding ids by house name rather than a bare count),
a "every authored deviation is a real deviation" check over ids 2/8/10, the Altair-3 numeric-mean
pin, band well-formedness, archetype/regular membership, and the literal
TODO/TBD/FIXME/placeholder file scan with a non-vacuity guard. T-123/T-124 extend
`AUTHORED_PORTS` and change nothing else. `hangoutRules.test.ts`'s baseline-inertness test was
narrowed from thirteen rows to the **nine** still-unauthored ones (4, 5, 6, 7, 9, 11, 12, 13, 14)
and kept as the control; its "no port has yet narrowed its venue set" test is unchanged and still
green. `hangout.test.ts` needed no edit — T-121's borrow-at-Mira-9 and Dare-at-Vega-6 tests both
still pass, as the plan required.

Fingerprints: **exactly one policy moved.** `gambler 8950ea1dfd8d318e → f10a74640899d867`;
`trader` / `smuggler` / `fighter` / `explorer` / `veteran` / `greedy` are **byte-identical**.
That control is the headline result: T-121 moved three rows because reach moved three verbs
(borrow, repay, dare); T-122 moves only stakes and disposition deltas, and `borrow` / `repay`
read the GLOBAL loan band and no `venueParams` at all, so the two lending policies cannot feel
it. Mechanism per policy is written up as **ledger entry 18** in `campaign-degraded.test.ts`,
in the voice of entries 16/17, with the measured deltas (gambler final credits median
6,672 → 6,849, mean 6,739 → 7,158; dares 218 → 220; wagered 51,680 → 52,005; dare net
−2,120 → −1,927; `failedVisits` 0 → 0). The narrowed bands very nearly cancel — which is what a
pass of EVERYDAY bars should look like.

Goldens, stated explicitly: **both regenerated through their own generators and both
byte-identical, so neither was re-recorded.** `packages/sim/src/__tests__/fixtures/replay-golden.ts`
— all six constants identical (verified by JSON-comparing the generator's output against the
committed module, not by string-matching the prettier-wrapped file); the replay logs emit only
`state-summary` / `action-result`, never `legal-actions`, so an authored band has nowhere to
appear. `packages/engine/src/__tests__/fixtures/day-loop-golden.ts` — all four hashes identical
(`3405f608…`, `7274873…`, `9e332c2e…`, `3e96fe90…`); neither script issues a `VisitHangout`.
**Event-count diff: zero events added or removed in either fixture.**

Fixture position: `docs/balance/smoke/tiers.json` **re-extracted** from the stored `t116-explore`
aggregate after `npm run format` (`npm run balance:extract -w @spacerquest/sim -- --aggregate
docs/balance/baseline-t116-explore.json`): `rulesFingerprint` `bdc51a44e6df92f0 →
5b2f53a8c30edbd9`, `instrumentFingerprint` `537f29b61ecc9719 → 537f29b61ecc9719` (**unchanged** —
no instrument moved), `docsFingerprint` `f0d2fa636fdbd10d → 840187f2e76d8438`;
`provenance.sweepLabel` stays `t116-explore`. **This is not a capstone — T-125 owns the
milestone's single capstone**, its sweep, its re-pinned baseline and its verdict. Checkpoint
deltas repeat the fingerprint control exactly: **only `gambler` moved, in 2 of the 4 tiers** —
days-1-3 `creditsMin` 3,456 → 3,451 and `outcomeHash` `f846d60ca1bab5ab → b39529cb43e10a21`;
days-41-43 `outcomeHash` `b9f846f72655601a → e2e7419ce6eaa54a`; days-21-23 and days-29-31
identical for all eight policies. `balance-targets.test.ts`'s live 40-seed "the trader clears the
marker, and clears it fastest" (`:180`) stayed green and the `it.fails` [22, 30] band (`:225`)
still fails as pinned — neither was touched.

Spec correction taken in the open, not silently: **`docs/HANGOUT_REDESIGN.md` §6.3's Altair-3
axis note is corrected in place** to "numerically the mean; distinct on clientele alone", with a
block under the table stating the §6.3/§6.4 tension ("fully generic" vs cardinality 14 with
Sun-3's tuple fixed) and the resolution — §6.4's own closing sentence settles it, and `clientele`
is the one axis no sim policy reads, so Altair-3 satisfies §6.4 while staying a clean measurement
control. Pinned by a named test so a later pass cannot quietly tune it.

Findings recorded in §7, reported and not fixed: **F-101-6 — `prose` has no reader.**
`houseName` / `roomLine` / `flavour` are authored by T-120, T-121 and now T-122 (four houses,
four room lines, twenty-eight flavour lines) and rendered nowhere; `App.tsx:1805` prints
`"Spacers Hangout · {systemName}"` and `grep` finds no consumer of `prose` outside content.
With F-101-4 that means a port's identity reaches the player through `wager` and `venues` alone
— a real limit on what any content pass can deliver, and a T-130 surfacing job.
**F-101-7 — the `high_roller` deed (250cr stake, `deeds.ts:604`) is unreachable at Mira-9** once
its ceiling is 200; reachable at the other four. That is a correct consequence of a dive bar and
is **not** a reason to inflate the band — recorded so T-125's deed coverage reads a Mira-9 zero
as expected. No `F-101-3x` was raised: none of the four concepts wanted a predicate.

**ESCALATION — F-121-2, a T-121 regression this task found and deliberately did not fix.**
Three `packages/ui/e2e/onboarding.spec.ts` tests are red (`:94`, `:243`, `:274`), and they are
red **at the T-121 commit with T-122's whole diff stashed** — reproduced both ways before any
conclusion was drawn. One defect behind all three: `activeOnboardingPrompt`
(`packages/ui/src/format.ts:2121`) picks ONE global winner, and `first-loan` — whose predicate is
`hangoutOpen(game) && loan == null` and whose mount is inside the *closed* Hangout panel — takes
that slot at every `hasHangout` port, rendering nothing and blocking `first-contraband`,
`first-port` and `first-explore`. Verified directly: the winner at Aldebaran-1 with the delivery
chain and `first-hangout` pre-seen is `first-loan`, mount `hangout`. Latent at 1 of 28 ports;
live at 14 of 28 since T-121 — the same class as F-121-1, and the second latent single-port
assumption reach has exposed. **Not fixed here because the repair is a `packages/ui/src` design
ruling** (mount-aware selector, or move `first-loan` down the registry) that changes what the
player is taught and in what order, which the standing constraint requires to be a named task;
and because pre-seeding `first-loan` in the fixtures would turn the specs green while leaving the
coach dark for real players. Written up in full, with the recommended repair, as §7's
**F-121-2** — re-open T-121 or fold into T-130.

Gate: `typecheck`, `lint`, `format:check` and all four workspaces' vitest suites green
(**1,547 tests, 0 failures**); `packages/ui/e2e/hangout.spec.ts` green (3/3). The three
onboarding e2e failures above are the pre-existing F-121-2 regression, escalated rather than
absorbed.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented from `docs/HANGOUT_REDESIGN.md` §2/§6/§7, `TASKS.md` T-120…T-125, and the  · attempts=1/4.

### T-123 · Hangout content pass 2 of 3 — the exotic and the dangerous (5 ports) — `status: DONE` · `coder: opus` · `after: T-122`

The next five, leaning into the axes the spec named: ports where the clientele is unusual, the
house rules are hostile, or the wager band is out of proportion to the rest of the galaxy. A
dangerous bar must be dangerous **through parameters** (odds, DCs, disposition consequences),
never through a special case in the engine.

**Accept:** five more ports authored; at least one is measurably hostile and one measurably
exotic on their parameters, asserted by a test against the spec's axes; **zero engine
changes** — if a port's concept needed one, it is reported as a framework finding instead;
gate green.

**Delivered (2026-07-30):** five authored rows in `packages/content/src/portHangouts.ts` —
`ARCTURUS_6_HANGOUT` (id 4), `DENEB_4_HANGOUT` (5), `REGULUS_6_HANGOUT` (11), `RIGEL_8_HANGOUT`
(12), `VEGA_6_HANGOUT` (14) — swapped into `PORT_HANGOUTS` keys `4` / `5` / `11` / `12` / `14`
over T-121's `baselineHangout(id)` calls. With pass 1 that is **ten of the fourteen ports
carrying authored content**; four baselines remain (6, 7, 9, 13) for T-124. Axis vectors, each
deviation carrying its one-line reason in the row's own comment:
**Arcturus-6, the garrison mess (`the Garrison Mess`, `dangerous`)** — venues **minus `borrow`
and `repay`** (§6.2's strict garrison; §2.2 ruling 5's one bit of per-port lending control, the
first narrowed venue set in the game), band 100/400 (the narrowest anywhere), `befriend` DC
12→16 and +3→+2, `insult` −4→−9, `dare` +2/−2 → +1/−7 (beating the garrison's dealer is the
worst sin in the galaxy; losing to him earns almost nothing), `meet` +1→**0** (an authored zero,
which `venueParamsFor`'s `??` preserves), clientele `['veteran','fighter']`.
**Deneb-4, the partisan hall (`the Standing Hall`, `exotic`)** — venues minus **`meet`** (§6.1's
"a room that will not seat a stranger"), band 25/2000, `befriend` DC 12→14 and +3→+5, `insult`
−4→−6, `dare` +1/−6 (§6.2's asymmetric consequence), **the first row with `regulars`** — the four
Astro League captains (`npc-cargo-king`, `npc-admiral-stern`, `npc-zero-risk`, `npc-the-warden`),
which is what makes the port partisan rather than decorative — plus `['veteran']`.
**Regulus-6, the high table (`the High Table`, `exotic`)** — band 500/3000: the floor is half a
Tour One captain's whole starting purse (`engine/state.ts:125`, credits 1,000) and the ceiling is
three times the galaxy's; the highest floor of any authored port and a band strictly outside the
default envelope at BOTH ends. `befriend` DC 15, `insult` −5, `dare` +1/−3; regulars
`npc-nebula-rose` + `npc-neon-fox`, archetypes `['gambler','trader']`. All seven venues, so its
identity rests on stakes alone and the F-101-1 measurement is clean.
**Rigel-8, the underbelly (`the Underhold`, `dangerous`)** — band 10/3000, **the widest span in
the galaxy**; `befriend` DC 12→8 (the cheapest room anywhere to charm) beside `insult` −4→−8 (the
most expensive place bar the garrison to say the wrong thing) — easy in, hard to leave; `dare`
failure arm −2→−4; clientele `['smuggler','gambler']`.
**Vega-6, the outfitters' long room (`the Long Room`, `exotic`)** — §6.3's "long memories, large
deltas both ways": band 250/1500, `befriend` DC 12→15 and +3→**+6**, `insult` −4→−8, `dare`
+2/−2 → **+4/−4**, `meet` +1→+2; regulars `npc-star-gazer` + `npc-stellar-drift`, archetypes
`['veteran','explorer']`. `storylets.ts:2186` ("The Homecoming Gantry") is the port's own
established voice and the row is written against it. All ten authored bands and all ten full
axis vectors are distinct; the §6.4 cardinality check confirms it.

**The Accept clause is mechanical, and threshold-free.** Three new describe blocks in
`hangoutContent.test.ts`, every assertion read through `venueParamsFor` / `wagerBandFor` /
`venueOffered` against **Sun-3's resolved defaults** or against the other authored ports — never
a restated literal, so an authored number can move without editing a test. **Hostile:**
Arcturus-6 is strictly harsher than the default on all five hostility axes (DC, insult,
dare-failure, meet, venue count) AND is the **unique per-axis maximum** on every one of them
across all authored ports (failures name the offending port by house name); it is the only port
that withholds the credit desk, and every other authored port still offers both lending venues.
**Exotic:** Regulus-6's band is strictly outside the default envelope at both ends and has the
strictly highest floor of any authored port, with a non-empty `regulars` list; Rigel-8 holds the
strictly widest span and a floor below the default. **Tone correlates with the numbers (§6.1),
quantified over ALL authored ports so T-124 inherits it unedited:** a non-`everyday` port moves
at least two of the six axes; a `dangerous` port is strictly harsher than the default on at least
one consequence axis; an `exotic` port is unusual on stakes, regulars or venue set; plus a
non-vacuity guard that at least one of each exists.

**Zero lines changed under `packages/engine/src` outside `__tests__`:**
`git diff --stat HEAD -- packages/engine/src ':!packages/engine/src/__tests__'` prints **nothing**.
No `packages/engine/src/npc.ts` edit (§5.2 stays open for T-130); no `packages/ui/src` edit; no
save-shape change — `CURRENT_SAVE_VERSION` stays **13** and no migration is owed.

**The one sim change, and why it is not an engine change.** Withdrawing the desk at one port put
three policy planners out of step with the engine, so `packages/sim/src/index.ts` gains
`isLendingDeskSystem(systemId, venue)` = `isHangoutSystem(...) && venueOffered(...)` beside
`isHangoutSystem`, used by `planLoanBorrow` (`borrow`), `planLoanRepay` (`repay`) and the
trader's and smuggler's two "head home to settle up" preferences (`repay`). This is the F-121-1
idiom — **a policy guard made equal to an engine guard, read through the engine's own accessor**,
never a new rule — and it is proven load-bearing rather than asserted: driven headlessly over 5
seeds × 40 days the trader emits **one** `LoanEvent{failReason:'venue-not-offered'}` without the
mirror and **zero** with it, and the trader's fingerprint differs between the two
(`4519a706ae2dc8a2` content-only vs `7ee040b0931caff9` with the mirror). Widened to **10 seeds ×
120 days across all seven policies with the mirror in: zero refusals of either event variant**.
`planDare` and the gambler's "go where the tables are" preference also gained
`venueOffered(..., 'dare')`; those are **arithmetically inert today** (all fourteen ports deal)
and the gambler's hash is identical with and without them — landed while provably inert, on the
T-121 precedent, and the comments say so.

Tests: `hangoutContent.test.ts` 84 assertions (was 38) — `AUTHORED_PORTS` and
`MECHANICALLY_DEVIANT_PORTS` extended, plus the three new blocks above.
`hangoutRules.test.ts`'s baseline-inertness list shrank 9 → **4** (6, 7, 9, 13), and its
"BASELINE ONLY — no port has yet narrowed its venue set" test — which its own comment said T-123
was expected to rewrite — is replaced by the positive form: a `NARROWED` table naming
Arcturus-6's `borrow`/`repay` and Deneb-4's `meet`, asserted across all fourteen core ports with
a non-vacuity guard, phrased so T-124 extends it by adding a row. `hangout.test.ts` **discharges
the resolver-level assertion F-120-1 recorded as owed**: `borrow` and `repay` at Arcturus-6 →
`LoanEvent{kind:'failed', failReason:'venue-not-offered'}` (and `repay` is refused for the VENUE,
above the lending preconditions, so a captain with no marker still gets the port's answer rather
than `no-loan`); `meet` at Deneb-4 → `HangoutEvent{failReason:'venue-not-offered'}`, no
`DispositionChanged`; in every case **no die spent, no credits moved, no loan written**, plus a
control that the beats those ports DO run still resolve and DO spend the die. `protocol.test.ts`
gains the harness mirror at Arcturus-6 — `legalActions` advertises `dare`/`rumor` but neither
`borrow` nor `repay`, and the `wager` domain is the port's 100/400 read through `wagerBandFor`,
with a non-vacuity check that the port band differs from the global one. **Two existing tests
were repaired rather than re-recorded**, both by reading an accessor where a literal used to be:
T-121's "a Dare plays at Vega-6" restated its stake as `wagerBandFor(14).min` (Vega-6's authored
floor of 250 clamps the old 100cr request up), and `lending-property.test.ts` P2 now carries the
precondition the ENGINE carries — see F-123-2 below.

Fingerprints: **exactly two policies moved.** `trader 1b4e953468311f40 → 7ee040b0931caff9` and
`gambler f10a74640899d867 → 40fa56c309b70e74`; `smuggler` / `fighter` / `explorer` / `veteran` /
`greedy` are **byte-identical**. The smuggler holding still is the sharp control: it borrows and
repays at the same desks the trader does, so the trader's move is about WHERE the desk is, not
about lending. Mechanism per policy is written up as **ledger entry 19** in
`campaign-degraded.test.ts` in the voice of entries 17/18, including the content-only vs
content+mirror decomposition above and the measured deltas (trader final credits median
16,667 → 16,667, mean 15,508 → 14,809, loans 7 → 7, interest 1,107 → 1,236, defaults 0 → 0;
gambler median 6,849 → 6,314, mean 7,158 → 11,453, dares 220 → 236, wagered 52,005 → 62,305, dare
net −1,927 → **+2,573**, loans and interest unchanged; `failedVisits` 0 → 0 everywhere). Nothing
was tuned to produce it and nothing is tuned in response — five seeds cannot separate a shift of
this size from stream noise, and the gambler's mean-up/median-down signature is one seed running
hot. T-125 owns the verdict.

Goldens, stated explicitly: **both regenerated through their own generators and both
byte-identical, so neither was re-recorded.**
`packages/sim/src/__tests__/fixtures/replay-golden.ts` — all six constants identical (verified by
JSON-comparing the generator's output against the committed module, not by string-matching the
prettier-wrapped file); `packages/engine/src/__tests__/fixtures/day-loop-golden.ts` — all four
hashes identical (`3405f608…`, `7274873…`, `9e332c2e…`, `3e96fe90…`). **Event-count diff: zero
events added or removed in either fixture**, and no `rngState` moved.

Fixture position: `docs/balance/smoke/tiers.json` **re-extracted** from the stored `t116-explore`
aggregate after `npm run format` (`npm run balance:extract -w @spacerquest/sim -- --aggregate
docs/balance/baseline-t116-explore.json`): `rulesFingerprint` `5b2f53a8c30edbd9 →
b9b83a6a67cbfdde`, `instrumentFingerprint` `537f29b61ecc9719 → 4e7184c378da068f`, `docsFingerprint`
`840187f2e76d8438 → c807452107b9ff16`, `gitCommit` `a4c5901e… → b5dab264…`;
`provenance.sweepLabel` stays `t116-explore`. **The instrument fingerprint DID move this time,
and that is expected rather than a slip** — unlike T-122 this task changes
`packages/sim/src/index.ts` (the §4 policy mirror), which is a hashed instrument source; T-122's
"unchanged" held only because it touched no sim file. Checkpoint deltas repeat the fingerprint
control: **only `gambler` moved, and in all four tiers** — days-1-3 `deedsEarned` 57 → 58 and
`outcomeHash` `b39529cb43e10a21 → 4a7817b488cd52ac`; days-21-23 `creditsMax` 17,041 → 15,986,
hash `7569c38771802113 → 19b6c394b35abe87`; days-29-31 `creditsMax` 43,068 → 42,068, `debtTotal`
15,040 → 15,262, hash `e7553a3147267a18 → 8e8bcd93d50a88de`; days-41-43 `debtTotal` 5,355 →
5,320, `deedsEarned` 53 → 56, hash `e2e7419ce6eaa54a → d70479f96122e514`. The other seven
policies are identical in all four tiers. **This is not a capstone — T-125 owns the milestone's
single capstone**, its sweep, its re-pinned baseline and its verdict.
`balance-targets.test.ts`'s live 40-seed "the trader clears the marker, and clears it fastest"
(`:180`) stayed green and the `it.fails` [22, 30] band (`:225`) still fails as pinned; neither
was touched, and no threshold, band or golden was edited to make anything pass.

**F-101-1 measured, as the Accept clause requires — and the measurement partly REFUTES the
finding as written.** The gambler driven headlessly, seeds 1..10 × 120 days, 1,319 hands, every
realized stake recorded (throwaway script, not committed). At **Regulus-6**: declared 500/3,000,
99 hands, realized min 0 / median 1,383 / **max 3,000** — the declared ceiling is reached on 41
of 99 hands and the **dealer's purse binds on only 5 (5%)**. The plain gap sentence is therefore
*declared max 3,000 versus realized max 3,000 — no gap at the top at all*. Rigel-8: 108 hands,
53 / 865 / 3,000, dealer-capped 5. Sun-3 (the default band): 124 hands, 39 / 1,000 / 1,000, and
the **band ceiling is the operative limit on 60% of hands** while the dealer's purse binds on
0.8%. The reason is the N-series: N2/N10/T-021 moved the cast's day-120 median wealth
21,884 → 76,049, and a dealer that rich caps almost nothing. **The floor does not price the run
out either** — at Regulus-6 the gambler played on 50 of its 65 docked days, and on the 15 idle
ones its median dawn purse was 32,038 credits (the dice budget, not the 500 floor); in Tour One
itself it was docked with a dealer on 18 days and played 29 hands. **Nothing was compensated in
either direction** — the band was neither lowered because the floor proved affordable nor raised
because the ceiling proved reachable. Written up as a dated addendum under **F-101-1** in
`docs/HANGOUT_REDESIGN.md` §7. The evidence it contributes to T-125: the dealer-purse cap is a
problem the N-series already solved, and **the wager band itself is now the live constraint** —
which is exactly the lever ruling 3 gives content.

Findings recorded in §7, reported and not fixed. **F-123-1 — the Hangout pane offers a credit
desk at a port that has none.** `packages/ui/src/format.ts:340` gates on `hasHangout` alone and
`store.ts`'s `borrowLoan` (`:1333`) / `repayLoan` (`:1369`) build the action unconditionally with
**no `venueOffered` filter anywhere in the UI**; at Arcturus-6 the engine answers
`venue-not-offered` and `loanFailNoticeFrom`'s `default:` arm (`:514`) renders the vague *"Penny
Wise turned that request down."* Worse, `hangoutFailNoticeFrom` (`:478`) has **no arm** for
`'venue-not-offered'`, so a social-venue refusal would render **silence** — a violation of the
"typed fails render, never silence" guarantee, unreachable today only because the pane issues no
social venue but `dare` (F-101-4), and Deneb-4's omitted `meet` is precisely the row that makes
it reachable the day `meet` is surfaced. Not fixed: a `packages/ui/src` product change that would
move `packages/ui/e2e/hangout.spec.ts`, and surfacing must be a named task. **Recommended: fold
into T-130 with F-101-4/5/6 — it is one surfacing job, not four.**
**F-123-2 — a port with no credit desk removes the §7.5 bad-day out at that port.**
`lending-property.test.ts` P2 went red on the authored row: at Arcturus-6 a captain with an empty
purse and a dry tank is typed-refused and stays stranded. **The property was restated, not
narrowed** — it now carries the engine's own precondition (`venueOffered(...,'borrow')`), and the
desk-less case is asserted in a test of its own (typed refusal, no die, no credits, no loan, the
strand persists) instead of being dropped from the sample. Both candidate repairs are out by
rulings this spec already made (a row predicate is F-101-3's category and out by ruling 3; "no
port may withhold the desk" contradicts §2.2 ruling 5), and an engine-side floor is a new rule a
content pass may not add. **Recommended: an owner ruling at T-130** — *may a core port remove the
anti-poverty out, or is the desk a galaxy-wide guarantee?* Exposure is bounded: one port of
fourteen, and zero `venue-not-offered` events in any driven career.
**F-123-3 — the gambler's second hand of the day can be a ZERO-credit stake.** An INSTRUMENT
defect found by the F-101-1 rig: `planDare` picks the richest dealer once off the dawn state and
the caller subtracts queued stakes from the player's purse but not the dealer's, so with
`GAMBLER_MAX_DARES_PER_DAY = 2` the first hand can empty the dealer and the second clamps to
zero — **34 of 1,319 hands (2.6%)**, plus 3 more below their port's floor. It is exactly the
pathology `planDare`'s own comment says the richest-dealer pick exists to avoid, with the guard
evaluated once a day instead of once a hand, and it is not a typed failure so `failedVisits`
stays correctly 0. Not fixed here: it changes a shipped policy's planning and would contaminate
the `expectedValuePerDare` number **T-125** is chartered to read. **Recommended: T-125, with its
own before/after.**
No `F-101-3x` was raised — none of the five concepts wanted a predicate; the garrison's "no
desk", the hall's "no introductions" and the high table's floor were all expressible as
parameters, which is the surface working as designed.

Spec corrections taken in the open, not silently: **`docs/HANGOUT_REDESIGN.md` §6.3's five T-123
rows are annotated in place** with what actually shipped, plus a block under the table recording
three deviations from the axis notes — (1) Deneb-4 **also** omits `meet`, so the venue-set axis
is exercised for a reason other than hostility rather than being a synonym for the garrison;
(2) Rigel-8 is graded on **span**, not on floor, because Mira-9's dive (T-122, floor 5) already
holds the lowest floor and the testable form of "low min, high ceiling" is the widest `max−min`;
(3) pass 2's register is two `dangerous` and three `exotic`, with `comic` left to T-124.
**F-101-7 gains its mirror image**, recorded so T-125's deed coverage reads both as expected:
Mira-9's 200 ceiling makes the 250cr `high_roller` deed unreachable there, while Regulus-6's 500
floor makes **every** hand deed-eligible — the port that guarantees the deed is the port an early
captain cannot sit down at, so expect a Mira-9 zero, a Regulus-6 saturation, and a Regulus-6
count that rises with career age.

Gate: `npx tsc -b`, `npm run lint`, `npm run format:check` and all four workspaces' vitest suites
green (**1,599 tests, 0 failures**); `packages/ui/e2e/hangout.spec.ts` green (3/3). The three
`packages/ui/e2e/onboarding.spec.ts` failures are the pre-existing **F-121-2** T-121 regression,
re-confirmed unchanged and still escalated rather than absorbed — they were not routed around by
pre-seeding fixtures.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented from `docs/HANGOUT_REDESIGN.md` §2/§4/§6/§7, the authored T-122 rows in `p · attempts=1/4.

### T-124 · Hangout content pass 3 of 3 — the last four, and the humour — `status: DONE` · `coder: opus` · `after: T-123`

The final four ports, including the comic register the owner asked for. Humour in this game is
period-voiced and dry — read the existing flaw-override and wire lines for the register before
writing. This pass closes the table at 14.

**Accept:** all **14** core ports carry authored, distinct content, asserted by a test that
enumerates them and fails on any placeholder; the tonal spread (everyday / exotic / dangerous
/ comic) is asserted against the spec's axes; zero engine changes; gate green.

**Delivered (2026-07-30):** four authored rows in `packages/content/src/portHangouts.ts` —
`DENEBOLA_5_HANGOUT` (id 6), `FOMALHAUT_2_HANGOUT` (7), `POLLUX_7_HANGOUT` (9),
`SPICA_3_HANGOUT` (13) — swapped into `PORT_HANGOUTS` keys `6` / `7` / `9` / `13` over T-121's
last four `baselineHangout(id)` calls. **The table is CLOSED at fourteen authored rows**, and
the builder is DELETED along with its `STAR_SYSTEMS` import, so there is no way left to add an
unauthored port silently. Axis vectors, each deviation carrying its one-line reason in the row's
own comment:
**Denebola-5, the incident book (`the Incident Book`, `comic`)** — the FORGIVING POLE and the
deliberate mirror of Arcturus-6. Band 25/1000 → 20/300, **`dare` failure arm −2 → 0** (an
authored zero, which `venueParamsFor`'s `??` preserves — beating the house here costs nothing at
all), `meet` +1 → **+3** (the highest in the game: a stranger is an event at the quietest core
port), `insult` −4 → **−2** (the softest in the game), `befriend` DC 12 → 11, regular
`npc-nova-blitz` + `['trader']`. All seven venues. The joke, played straight: *the quietest port
in the core keeps a real incident book, and the last entry in it records a spillage.*
**Fomalhaut-2, the fittings (`the Fittings`, `comic`)** — the bar at the edge of the dust market
`storylets.ts:2157` already established, where everything carries a chalked price including the
stools. Band 15/1200, `befriend` DC 12 → 10, `meet` +1 → +2, `insult` −4 → −3, **`dare` left at
the default entirely** (the T-122 Aldebaran-1 idiom for "the tables are not what this room
sells"); regulars `npc-junk-lord` + `npc-dust-devil`, archetypes `['smuggler','trader']`.
**Pollux-7, the turnaround (`the Turnaround`, `everyday`)** — the concourse bar of the busiest
League civil port, and pass 3's one everyday room. Band 75/900, `dare` success arm +2 → +1 (the
dealer is on shift, not on a run), `meet` +1 → +2, `befriend` DC 12 → 14 (nobody invests in a
face they will not see again); `['explorer','fighter']`, the one archetype pair no port had
taken. **Not a second Altair-3** — Altair-3 is the numeric mean and moves on `clientele` alone;
this port moves four axes. They share a register, not a vector.
**Spica-3, the second watch (`the Second Watch`, `exotic`)** — venues **minus `insult`**, §6.1's
third and last venue-set expression ("a house that tolerates no insults") after the garrison's
withdrawn desk and the hall's withheld `meet`. Band 200/1800, `dare` +2/−2 → **+3/−5**, `meet`
+1 → +2, `befriend` DC left at the default so the row's identity rests on the three axes above;
`['gambler','veteran']`, the other unused pair.

**The register spread, which §6.3 left to this task:** two `comic` (6, 7), one `everyday` (9),
one `exotic` (13) — closing the fourteen-port table at **6 everyday / 4 exotic / 2 dangerous /
2 comic**, all four of §6.1's registers represented. Two comic rooms rather than one because a
single one is a novelty and two are a register. The voice was read before it was written, as
§6.3 instructed: `wireStories.ts`'s `NAT_WIRE_TEMPLATES` ("*{loser} unavailable for comment.*")
and `flaws.ts`'s `detail` lines ("*gambled the day's profits away at the nearest Hangout
table.*") are both a plain sentence with one deflating clause at the end, and every comic line
here is built the same way — no puns, no exclamation marks, nothing winked at the player.

Tests. `hangoutContent.test.ts` extends `AUTHORED_PORTS` to fourteen and
`MECHANICALLY_DEVIANT_PORTS` to twelve and **restructures nothing** — every T-122/T-123 block is
quantified over `AUTHORED_PORTS`, so the last four inherited every rule for free (the file now
runs **119 tests**), which is the extension contract that file's header promised. Two new describe blocks. **T-124 · the
table closes at fourteen:** the enumeration is pinned to `Object.keys(PORT_HANGOUTS)` in both
directions (so a row dropped from the list can never silently shrink every `it.each`); **no row
is a baseline row**, asserted as `houseName !== 'the <system> Hangout'` — the shape
`baselineHangout` generated, which the existing "not the DEFAULT house name" check does NOT
catch because a baseline row already had a name of its own; and cardinality is **exactly 14**
with the colliding-ids report. **T-124 · the tonal spread (§6.1):** every register has at least
one port (failure names the missing ones); a `comic` port is **no harsher than the default on
any** of the four clauses the `dangerous` test uses — the exact negation, so both registers are
graded on one axis set; Denebola-5 is the strict per-axis **softest** authored port on `insult`
and on the dare-failure arm, mirroring the Arcturus-6 maximality test; and Spica-3 is the only
port withholding `insult` while still offering `meet`/`borrow`/`repay`, mirroring the Deneb-4
block. All threshold-free, all non-vacuity-guarded. The source grep now anchors on the four new
row constants and asserts **`baselineHangout` is absent from the file**.
`hangoutRules.test.ts` **inverts rather than empties** T-121's "the unauthored rows are still
BASELINE rows" — an empty loop over an empty id list is a vacuous test, so the claim is now the
positive over all fourteen (no generated house name, a room line, flavour) with
`CORE_HANGOUT_IDS.length === 14` as the non-vacuity guard; `NARROWED` gains `13: ['insult']` and
is retitled "narrowed at exactly three ports", with the three reasons recorded.
`hangout.test.ts` discharges the resolver-level refusal at the new port — `insult` at Spica-3 is
a typed `HangoutEvent{'venue-not-offered'}` with no die spent, no `DispositionChanged` and no
disposition moved — plus a control that a beat Spica-3 DOES run (`befriend`) still resolves and
still spends the die. A second social venue at a different port is what says the refusal is a
property of `venueOffered` rather than of Deneb-4's row. `protocol.test.ts` gains the harness
mirror at Spica-3: `legalActions` advertises `dare`/`meet`/`befriend`/`rumor`/`borrow` and **not
`insult`**, and the `wager` domain is 200/1800 read through `wagerBandFor(13)`, with the same
non-vacuity check. **Two ports narrowed in two different directions** — the garrison withholds
the lending pair, the watch withholds a social beat — is what says the filter is a filter and
not a special case for the credit desk.

Fingerprints: **exactly one policy moved.** `gambler 40fa56c309b70e74 → 0c0c4fc26124fbc0`;
`trader` / `smuggler` / `fighter` / `explorer` / `veteran` / `greedy` are **byte-identical**.
That one-row control is sharper than entry 19's two-row one and is the real result of the pass:
T-124 narrows a venue set too, but **all four of its ports keep `borrow` and `repay`**, so no
lending guard can see this pass and `isLendingDeskSystem` is untouched; and the narrowing itself
is invisible to every driver twice over, because the instrument and the cockpit both issue only
`dare`/`borrow`/`repay` (F-101-4, F-123-1). The gambler moves anyway, and alone, which says the
pass reached the simulation through its **bands** and nothing else. `venueOffered(…,'dare')` is
still true at all fourteen, so entry 19's dare guards stay arithmetically inert. Written up as
**ledger entry 20** in `campaign-degraded.test.ts` in the voice of entries 17/18/19, with the
measured deltas (gambler final credits median 6,314 → 6,314 — **the median does not move at
all** — mean 11,453 → 9,880, dares 236 → 234, wagered 62,305 → 63,563, dare net +2,573 →
**+5,473**, loans 5 → 5 and interest 1,400 → 1,400 unchanged; trader median 16,667 / mean 14,809
/ loans 7 / interest 1,236 and smuggler 7,492 / 6,440 / 9 / 1,628 **identical**, as the hashes
already say; `failedVisits` 0 → 0 for every policy, re-confirmed at 10 seeds × 120 days with a
THIRD narrowed port in the table, and `expectedValuePerDare` 151.82 over that window). Nothing
was tuned to produce it and nothing is tuned in response. **This is not a capstone — T-125 owns
the milestone's single capstone**, its sweep, its re-pinned baseline and its verdict.

Goldens, stated explicitly: **both regenerated through their own generators and both
byte-identical, so neither was re-recorded.** `packages/engine/src/__tests__/fixtures/day-loop-golden.ts`
— all four hashes identical (`3405f608…`, `72748730…`, `9e332c2e…`, `3e96fe90…`), which is
expected because both generator scripts run at Sun-3.
`packages/sim/src/__tests__/fixtures/replay-golden.ts` — all six constants identical, verified by
JSON-comparing the generator's output against the committed module rather than string-matching
the prettier-wrapped file. **Event-count diff: zero events added or removed in either fixture**,
and **no `rngState` moved** in either direction — no replay log docks at 6, 7, 9 or 13.

Fixture position: `docs/balance/smoke/tiers.json` **re-extracted** from the stored `t116-explore`
aggregate after `npm run format` (`npm run balance:extract -w @spacerquest/sim -- --aggregate
docs/balance/baseline-t116-explore.json`): `rulesFingerprint` `b9b83a6a67cbfdde →
6e8c9973fa7a4238`, `docsFingerprint` `c807452107b9ff16 → 1002d9efefacf7fb`, `gitCommit`
`b5dab264… → f8a7fb17…`; `provenance.sweepLabel` stays `t116-explore`. **`instrumentFingerprint`
did NOT move** (`4e7184c378da068f`, unchanged) — the T-123 contrast, and the mechanical proof
that this task edited no `packages/sim/src` non-test file. Checkpoint deltas repeat the
fingerprint control exactly: **only `gambler`, and only its `outcomeHash`, in only two of the
four tiers** — days-1-3 `4a7817b488cd52ac → 65381601dc66af8e` and days-21-23
`19b6c394b35abe87 → 33965eb346230640`; days-29-31 and days-41-43 are unchanged entirely, and
**every scalar in all four tiers is byte-identical** (credits min/median/max, debt, income days,
encounters, ships lost, delivered legs, fuel starvation, deeds, Tour One). The other seven
policies are identical in all four tiers. `balance-targets.test.ts`'s live 40-seed trader
assertion (`:180`) stayed green and the `it.fails` [22, 30] band (`:225`) still fails as pinned;
neither was touched, and no threshold, band, golden or fingerprint was edited to make anything
pass.

Zero engine changes, proven mechanically:
`git diff --stat HEAD -- packages/engine/src ':!packages/engine/src/__tests__'` prints **nothing**,
and so does the same command over `packages/sim/src ':!packages/sim/src/__tests__'`. No
`packages/ui/src` edit. No save-shape change — `CURRENT_SAVE_VERSION` stays **13**, no migration
owed.

Finding recorded in §7 — and this one was **found and CLOSED here**, not reported and deferred.
**F-124-1 — a `clientele.regulars` entry naming a QUEST captain is permanently dead content.**
The cast splits 30 simulated / 11 quest-frozen (`isSimulatedCaptain`, `content/cast.ts`), and the
eleven take no turn in the dusk loop (`engine/day.ts:758`) — they **sit frozen at their day-1
system for an entire career**. `rankClientele` ranks and never adds, so a quest captain named as
a regular can only ever rank at the single system `(index % 20) + 1` seeded them at, with **no
symptom**: an empty intersection returns the input unchanged, so the row looks authored, passes
every well-formedness check and ranks nobody forever. Both thematically obvious regulars for
these ports hit it exactly — `npc-wild-card` (Denebola-5's own storylet captain,
`storylets.ts:2950`) is frozen at system **16**, a rim system with no bar at all, and
`npc-rust-bucket` (Fomalhaut-2's, `storylets.ts:4549`) at **Sun-3**. Both would have shipped
dead. T-123's three `regulars` lists were correct by luck rather than by rule. **Closed by**
authoring simulated captains at both ports and by a new assertion —
`isSimulatedCaptain(profileId)` for every `regulars` entry at every authored port, reporting the
offending house and profile id by name. A real-but-frozen id was previously indistinguishable
from a real-and-mobile one, because the only check was membership of `ALL_NPC_PROFILES`.
**No `F-101-3x` was raised** — none of the four concepts wanted a predicate. "The quietest port
keeps a book", "everything here has a price", "the interval between two gates" and "the room that
opens at four in the morning" are all expressible as numbers plus prose. **Two passes running
with no F-101-3 report is evidence the parameter-only surface is the right size for this
content**, which is that finding's own stated purpose.

Spec corrections taken in the open, not silently: **`docs/HANGOUT_REDESIGN.md` §6.3's four T-124
rows are annotated in place** with what shipped, plus a six-point block under the table
recording (a) the register spread chosen and why, (b) `comic` graded as the exact negation of
`dangerous`, (c) Denebola-5's authored `dare.dispositionOnFailure: 0` as the forgiving pole and
the mirror of Arcturus-6's `meet: 0`, (d) Spica-3's `insult` omission as §6.1's third and last
venue-set expression **with the F-101-4 caveat taken in the open** — the venue has no player UI,
so the row also carries a stakes identity rather than concentrating its character in an
invisible venue, and it does **not** trip F-123-1's silence bug because the pane never issues
`insult` — (e) the baseline builder deleted rather than left unused with its test inverted rather
than emptied, and (f) no concept wanting a predicate. §9's T-124 row is annotated with the two
things the criterion did not ask for and the work required.

Gate: `npx tsc -b`, `npm run lint`, `npm run format:check` and all four workspaces' vitest suites
green (**1,636 tests, 0 failures** — engine 1,051 / sim 326 / ui 157 / desktop 102);
`packages/ui/e2e/hangout.spec.ts` green (3/3). The three `packages/ui/e2e/onboarding.spec.ts`
failures are the pre-existing **F-121-2** T-121 regression, re-confirmed **unchanged in cause and
count**: the same three specs (`:94`, `:243`, `:274`), each failing on the same assertion — the
coach resolves to `first-hangout` where the spec expects `first-port` / `first-contraband`,
because T-121 put the Hangout affordance out at 14 of 28 ports and the hangout coach now
pre-empts the two that used to fire there. **Still escalated rather than absorbed** — they were
not routed around by pre-seeding fixtures, and T-124's diff changed nothing about their symptom
in either direction.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented from `docs/HANGOUT_REDESIGN.md` §6.1–§6.4/§7, the ten authored rows in `packages/content/src/portHangouts.ts`, and the T-122/T-123 delivered blocks in `TASKS.md` · attempts=1/4.

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
and which is the gate on re-ruling the two vacated PARITY LEDGER rows. **Name the NPC Hangout
faucet explicitly, as its own callout, not folded into the generic deferred list**:
`executeSocialize` pays NPCs with no `hasHangout` gate and no counterparty, which was easy to
leave open when the player-facing verb barely existed (1 of 28 systems) and reads very
differently now that the player's Hangout is a real, authored 14-port system — say so plainly
so it is a decision at this gate, not a bullet that rolls forward unread. Commit it, then
halt.

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

---

## M5 — Telemetry & Dev Tooling (new initiative, gated behind this track's T-130)

Four specs, sequenced, written outside this track and living at the repo root under `docs/`:
`docs/BALANCE-TELEMETRY_SPEC.md`, `docs/PLAYTEST-TELEMETRY_SPEC.md`,
`docs/TELEMETRY-REPORT_SPEC.md`, `docs/DEV-CONTROL-PANEL_SPEC.md`. Each settles its own
design; these four tasks implement them in the order the specs themselves already require.
**Every task here implements its named spec's settled design — it does not re-open it.** The
Gate and Standing constraints in this file's header still apply (ENGINE OWNS RULES / CONTENT
OWNS INSTANCES, extract behaviour-preserving, never edit a fingerprint, etc.) to whichever
task touches engine/content source.

**Naming note:** this file already has an `M3` (Hangout) earlier on — this milestone is
labeled `M5` to avoid a duplicate heading, since the orchestrator resolves a milestone scope
by heading-text match and two identical headings would be ambiguous.

### T-140 · Implement NPC decision tracing — `status: TODO` · `coder: opus` · `after: T-130`

Implement `docs/BALANCE-TELEMETRY_SPEC.md` end to end: settle §4's open design question (the
callback-injection vs. always-return-the-distribution choice for `pickIntent`/`pickContract`)
and record the reason chosen; wire the trace sink so only `packages/sim`'s sweep/campaign
runner ever supplies one, gated behind an explicit `--trace-npc-decisions` flag; write traces
as gitignored JSONL per the spec's §4(4) location convention.

**Accept:** per `docs/BALANCE-TELEMETRY_SPEC.md` §6 — the `NpcDecisionTrace` shape (§3) is
implemented and unit-tested against a known weight table; an UNTRACED sweep run is
byte-identical to pre-change (goldens, `campaign-degraded` pins); `rulesFingerprint`'s move
is the ONLY expected diff in `docs/balance/smoke/tiers.json` when re-extracted, stated
explicitly in the commit body; a `grep` for the trace-sink parameter under `packages/ui` and
`packages/desktop` returns nothing; a dedicated traced sweep run produces the gitignored
JSONL; gate green.

### T-141 · Implement opt-in playtest logging — `status: TODO` · `coder: opus` · `after: T-130`

Implement `docs/PLAYTEST-TELEMETRY_SPEC.md` end to end: the settings toggle (OFF by default,
disclosure copy per §3), the local JSONL capture over `applyPlayerAction` plus the manual
"flag this moment" annotation and `ErrorBoundary` capture (§1), and the player-triggered
"Export Playtest Log" action producing JSON/CSV (§5-6) — no network call anywhere in this
task.

**Accept:** per `docs/PLAYTEST-TELEMETRY_SPEC.md` §8 — toggle defaults OFF and persists via
`storage.ts`'s `KeyValueStore`, not the save file (asserted by a save-round-trip test); a test
drives real actions through `applyPlayerAction` and asserts the resulting JSONL matches §6's
shape; the flag-action and `ErrorBoundary` entry kinds are each asserted by a test; export
produces a file with no network call anywhere in the feature; the disclosure copy matches
what's settled in the spec; no save version bump; no engine source file touched; gate green.

### T-142 · Build the Tier 1 telemetry report generator — `status: TODO` · `coder: opus` · `after: T-140, T-141`

Implement `docs/TELEMETRY-REPORT_SPEC.md` end to end: the leaderboard, option-frequency, and
before/after views (§1) over the real inputs T-140/T-141 now produce (§2), generated as
self-contained provenance-stamped static HTML to a gitignored path (§3), using the `dataviz`
skill's palette/method for the actual chart work (§4).

**Accept:** per the spec's intent — the three views in §1 render correctly against real
sample inputs from T-140/T-141's output; a report comparing two aggregates with different
`rulesFingerprint`s visibly says so; before/after deltas display each input's seed count
alongside the numbers (no bare-delta display); nothing is committed to the repo by running
the generator; read-only over its inputs — no source file it reads is modified by running it;
gate green.

### T-143 · Build the Tier 1.5 dev control panel — `status: TODO` · `coder: opus` · `after: T-142`

Implement `docs/DEV-CONTROL-PANEL_SPEC.md` end to end: the five-command surface (§1), shard
orchestration for `balance:sweep` (§2), gitignored-by-default run output with a deliberate
promote-to-baseline step (§3), and the local dev-only server + UI (§4). Settle §5's open
question (whether `lint:fix`/`format` belong in the panel) explicitly and record the reason.

**Accept:** per `docs/DEV-CONTROL-PANEL_SPEC.md` §6 — every §1 command is triggerable with a
flag set that is a verified subset of its script's real parsed arguments; a sweep run
launches shards concurrently and only merges after every shard exits 0; panel-triggered
output is byte-for-byte identical to the same command run directly by hand; a `grep` for the
panel's entry point under `packages/desktop`'s packaging config and any production build
output returns nothing; no source file outside the panel's own new code is modified by
running any panel action; gate green.
