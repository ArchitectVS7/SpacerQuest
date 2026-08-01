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
Wise turned that request down."* Worse, `hangoutFailNoticeFrom` (`store.ts:478`) has **no arm** for
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

### T-125 · Hangout: measure the reach, and re-read disposition — `status: DONE` · `coder: opus` · `after: T-124`

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

**Delivered (2026-07-30).** `npm run format` FIRST — it changed **zero files**, the tree was
already clean — then the milestone's single capstone: `docs/balance/baseline-t125-hangout.json`,
1,000 seeds × 120 days × 8 policies from eight **1-indexed** shards through `--merge`,
`--milestone-days 21,29,30,41,60,120`, verbatim `[balance] wrote aggregate for 8000 rows`.
Fixture re-extracted **from that file**: `[smoke] 4 tiers, spreads harvested, rules
6e8c9973fa7a4238 / instrument 4e7184c378da068f / docs 1002d9efefacf7fb`; `tiers.json`
`provenance` reads `sweepLabel: "t125-hangout"`, `runs: 8000`, `spreadSource: "harvested"`.
The full write-up is `docs/HANGOUT_REDESIGN.md` **§10** (§10.0–§10.10), which replaces the
reserved stub; §9's T-125 row is annotated and §5.1 / §5.2 carry forward pointers to §10.5 /
§10.6.

**The capstone aggregate cannot answer any of this task's five questions** — `SeedRow` carries
no hangout and no disposition field, `MilestoneSample` no `npcDisposition`, and
`CombatEncounterRecord` no interceptor id or `source`. Adding them would move
`instrumentFingerprint` in the same commit that takes the capstone. So the capstone discharges
the baseline/fixture obligation and a **gitignored two-arm probe** (`.scratch/t125-hangout.ts`,
source fenced at §10.7) produces the result — the T-116 split exactly. Arms: HEAD vs
**`e0dbd40a`** (T-116, Hangout at 1 of 28) in a `git worktree` built with its **own**
`node_modules` and its own `tsc -b` output, because a shared `node_modules` resolves through
`realpath` and would have run `e0dbd40a`'s sim against HEAD's engine. Seeds 1..120 × 120 days ×
8 policies = **960 runs per arm**. Fidelity **5/5 MATCH in both arms** on four channels
(`finalState.credits`, `deedCount`, `hangoutPlay.dares`, `combatEncounters.length`).

**The verdict: YES, for the captain who plays the tables.** Named interceptions flown by a
captain the player had **wronged**: `gambler` **4.22% → 29.28%** (n = 876 → 929) against an
**analytic uniform counterfactual** over the same reconstructed pools of 1.78% → 9.90%, a
**2.37× → 2.96× lift**; the chosen captain's mean disposition −0.067 → **−1.378** against a pool
mean of −0.294. Fleet-wide 5.87% → **10.13%** against 2.76% → 4.22%. **The inertness rate is
stated before the lift and bounds all of it:** only **24.70%** of the fleet's 23,100
interceptions reach the named pool at all (the `rng.next() < 0.25` gate, `travel.ts:394`), and
**69.56%** of those saw a pool where every candidate sat at 0 — a draw on which `chooseWeighted`
is byte-identical to the old uniform pick. The gambler's inertness falls 76.26% → **31.65%**;
`fighter`/`explorer`/`veteran`/`greedy` are **byte-identical across both arms** on every M5
figure, the exact control. Also reported: `fighter` has the highest wronged share of any policy
(35.14%) and got there entirely through violence — the shape of the problem §1.5 named.

Hangout usage per run (fleet, 960 runs/arm): `VisitHangout` actions 4,276 → **16,783**, dares/run
3.40 → **16.11**, `expectedValuePerDare` **+159.56 → +120.14**, and the gambler walks into
**13.87 of the 14** ports per career (was 1.00 of 1). Disposition spread: non-neutral at day 120
1.91% → **2.81%**, and the movement is **entirely in the grudge tail** — deeply negative
(`d ≤ −5`) **20 → 143**, deeply positive 42 → 50 — which falls out of `DARE_WIN_DISPOSITION = −2`
and a 57.3% player win rate. `DispositionChanged` by `reason`: **voluntary movement is now 28.49%
of all non-decay disposition, up from 8.45%** — the single cleanest statement of what the reach
bought, since §1.5 scoped the track on "the Hangout is the only voluntary input". Counter-evidence
reported rather than buried: `BondIntervention` fired **42 → 34**, because the one reachable
verb pushes standing *away* from the hook.

**§5.1 discharged (§10.5):** over 15,461 dares the binding term of
`min(bandMax, playerCredits, dealerCredits)` is the **BAND on 88.93%** and the **DEALER on
10.97%**; the player's own credits bound **zero** stakes (`< 1/15,461`). Dealer purses at
milestone dawn (n = 121,526): min 0 / p25 1,000 / median 5,000 / p75 17,228 / max 2,307,108.
This confirms T-123's addendum at 11.7× its sample and **makes §5.1's third, load-bearing reason
to defer the faucet the minor term**. **§5.2 discharged (§10.6): 95.91% → 37.96%** — the BEFORE
arm re-measures the recorded figure at **96.07%**, within 0.16 points, which validates the
method; the AFTER figure is well below §5.2's predicted ~50% because the cast concentrates on
the core lane that gained the bars. Reported, not predicted.

**Nothing was tuned, and the two things it was tempting to fix are filed.** `git diff --stat`
shows **zero lines** under `packages/engine/src/`, `packages/content/src/`,
`packages/sim/src/index.ts` and `packages/sim/src/balance/`; the only source change in the commit
is the one re-pin path string in `balance-targets.test.ts:103`. `INTERCEPT_GRUDGE_WEIGHT` 1.5 /
`INTERCEPT_FRIEND_WEIGHT` 0.15 / `INTERCEPT_MIN_WEIGHT` 0.1 /
`DISPOSITION_DECAY_INTERVAL_DAYS` 3 / `DARE_MIN_WAGER` 25 / `DARE_MAX_WAGER` 1,000 /
`DARE_WIN_DISPOSITION` −2 / `DARE_LOSS_DISPOSITION` +2, the 0.25 named-pool gate and all fourteen
authored port rows are untouched at their shipped values. `CURRENT_SAVE_VERSION` stays **13**;
no save shape moved, so no migration is owed. **F-123-3 re-measured at 413 of 15,461 hands
(2.67%)** — stable against T-123's 2.6% — and **NOT fixed**, for the reason T-116 filed F-116-1:
`planDare` is a shipped policy, `expectedValuePerDare` is a number this task is chartered to
read, and the capstone is taken in this same commit. Routed to its own commit. **No new test
file, deliberately:** a capstone may carry only the re-pin path string; anything else here would
touch a hashed source or be a stub written to a checklist.

**Baseline of record RE-PINNED** to `baseline-t125-hangout.json` under standing amendment 1
("does the baseline describe HEAD?"). `balance:diff t116-explore → t125-hangout` moves exactly
**five** rows — `fleet` (439), `gambler` (544), `smuggler` (527), `trader` (444),
`trader-degraded` (451) — and leaves `explorer`, `fighter`, `greedy`, `veteran` with **zero**
changed fields, the same control the probe found independently. Headlines: gambler
`finalCredits.median` 45,343 → **56,634** (+24.9%) and `tourOneClearRate` 0.7790 → **0.8480**;
fleet 34,213 → 37,961 and 0.5411 → 0.5670. **`trader` moved too, and through a verb it never
plays** — zero dares, 289 lending actions — which is the Penny Wise desk, corroborated from the
disposition side by `loan-default` collapsing 186 → **17**. The 5 reported shape changes are all
sparse `renownRanks.*` histogram buckets, not an instrument change; no phantom `milestones[i]`
paths appear. **All three pointers move in this commit:** `balance-targets.test.ts:103`,
`docs/NPC_REDESIGN.md:107` + `:1992`, and `docs/balance/smoke/README.md:95`.

**The `it.fails` clear-day tripwire is still correctly RED** — trader `debtClearedDay.median`
**21** against `[22, 30]` at **n = 987**, unmoved from T-116 and N11. Not converted to `it`; the
baseline was not chosen to make it pass. The live 40-seed block at `:180` is green.

Gate: `npx tsc -b`, `npm run lint`, `npm run format:check` (`npm run format` was **not** re-run
after the capstone) and all four workspaces' vitest suites green (**1,636 tests, 0 failures** —
engine 1,051 / sim 326 / ui 157 / desktop 102), including `balance-smoke.test.ts` (71) and
`balance-rig.test.ts` (52), which grade the newly extracted `tiers.json`, and
`balance-targets.test.ts` (4), which reads the re-pinned baseline off disk.
`packages/ui/e2e/hangout.spec.ts` green (3/3). The three `packages/ui/e2e/onboarding.spec.ts`
failures are the pre-existing **F-121-2** T-121 regression, re-confirmed **unchanged in cause and
count** (`:94`, `:243`, `:274`, each failing on the coach resolving to `first-hangout` where the
spec expects `first-port` / `first-contraband`). This commit touches no UI source at all, so its
state could not have moved; **still escalated rather than absorbed**, and no fixture was
pre-seeded to route around it.

**Four levers left on the owner's desk for T-130, none pulled:** (1) the **0.25 named-pool gate**
and `DISPOSITION_DECAY_INTERVAL_DAYS` — three quarters of interceptions cannot see disposition
at all and 69.56% of the rest are inert, both one constant; (2) **F-101-4** — surface
`befriend`/`meet`/`insult`, since the only reachable Hangout verb pushes standing *down* and the
bond hook fired *less* after the reach change; (3) **§5.1's faucet**, now re-arguable on a
measured 10.97%; (4) **F-123-3**, a cheap sim-policy fix that needs a commit allowed to move a
capstone.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented from `docs/HANGOUT_REDESIGN.md` §1.5/§4.2/§5/§9/§10, the T-116 capstone pr · attempts=1/4.

---

## M4 — Close out

### T-130 · CHECKPOINT — owner review of both systems — `status: DONE` · `coder: sonnet` · `after: T-125`

**CLOSED (owner, 2026-07-31).** The human half is resolved: all seven §1 decisions are ruled in
the T-130 OWNER RULINGS log below (D1–D7, each either closed outright or scheduled as a written
task in M4a–M4g), the two vacated PARITY LEDGER rows are explicitly ruled DEFERRED until T-150's
re-ask, V-1 is fixed, V-2's residue is ruled (`format:check` joins the mandatory gate), and the
review's D2 sub-decision on the 150cr NPC ante is explicitly deferred with the cast question.
Every OPEN finding in `docs/0.5.2-REVIEW.md` §4 now maps to a task or a dated deferral ruling.
M5 (T-140/T-141) and M6 (T-151) are un-gated by this closure.

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

**Delivered (automated half, 2026-07-30):** `docs/0.5.2-REVIEW.md` — nine sections, assembling
`docs/EXPLORE_REDESIGN.md` §9 and `docs/HANGOUT_REDESIGN.md` §10 without restating their method.
§1 puts **seven** decisions to the owner as a table (the two vacated ledger rows, the faucet, the
manifest, the four levers, the surfacing job, F-123-2). §2 carries Explore's verdict — **still a
net loss, 101/120 → 85/120 seeds richer without it**, with the not-rng-paired caveat stated
beside the headline, plus the 75.8% recovery forfeiture and **zero band-4 payouts in 14,400
simulated days**. §3 carries the Hangout's, **with the inertness bound stated before the lift**
per §10.0 (only 24.70% of interceptions reach the named pool and 69.56% of those are inert;
gambler wronged-captain share **4.22% → 29.28%** against a 9.90% uniform counterfactual), the
four byte-identical control policies, the `BondIntervention` 42 → 34 counter-evidence, and both
discharged obligations (**BAND binds 88.93% / DEALER 10.97% / player ZERO of 15,461**;
**95.91% → 37.96%**). §4 is the framework roster: **36 findings** — 33 from the two milestones
plus three this task found — of which **25 CLOSED, 3 BOUNDARY (working as ruled), 8 OPEN**. It
leads with the result that **zero `F-101-3x` reports were raised across all 14 authored ports**,
so ruling 3 is vindicated on 14 instances, and it names F-101-4/5/6/F-123-1 as **one** surfacing
job. **§5 is the NPC Hangout faucet as its own top-level callout**, not folded into the deferred
list: `executeSocialize` (`packages/engine/src/npc.ts:1824`, called `:1950`) mints +4.86cr per
captain-day with no counterparty and **no `hasHangout` read anywhere in `npc.ts`** (grepped —
no match), with every deferral reason re-argued on the measured numbers (§5.1's load-bearing
reason 3 is measured away by the 10.97%; §5.2's magnitude halved) and the ask stated as three
named options with their costs. §6 is the deferred list, chief among it whether NPCs interact
with Explore and the Hangout, and it names the widening gap: the cast plays a **stub** of a
system that grew 14× under it. §7 reports that the manifest **already reads 0.5.2** (commit
`9d9ff47e`, an owner decision, with `docs/VERSIONING.md:53` amended the same day) and that three
documents still carry the stale "stays at 0.5.1" sentence.

**Zero lines of BEHAVIOUR under `packages/`. No capstone owed and none taken** —
`computeDocsFingerprint` (`packages/sim/src/balance/rules-fingerprint.ts:607-618`) hashes the
rules and instrument `.ts` bytes, not `docs/`, so a new `.md` moves no fingerprint and
`docs/balance/smoke/tiers.json` stays fresh. No constant, band, DC, threshold, golden or
fingerprint touched; no spec edited; no ledger row re-ruled. The **one** file under `packages/`
this commit touches is `packages/ui/src/__tests__/format-modules.test.ts`, reflowed by
`npm run format` — whitespace only, in a UI **test** file that is neither a rules source nor an
instrument source. **Three record corrections made in the review doc rather than by editing the
specs:** **F-121-2 is CLOSED** by `125fc84f` (mount-aware onboarding coach) though four
documents still record it ESCALATED — re-run at this gate, `onboarding.spec.ts` **14/14 green**;
**`docs/VERSIONING.md:229` still says save version `12`** while HEAD ships
`CURRENT_SAVE_VERSION = 13`, reported as finding **V-1** and deliberately **not** fixed; and
**`125fc84f` landed with `npm run format:check` RED** (finding **V-2**, confirmed by re-running
it against HEAD with this commit stashed) — repaired here rather than absorbed, and recorded
because the standing "run `npm run format` BEFORE the capstone" constraint assumes the tree is
already formatted, and `rulesFingerprint` is not formatting-invariant.

Gate at HEAD (`125fc84f`, UI-only, so the T-125 fixture still describes HEAD): `npx tsc -b`,
`npm run lint`, `npm run format:check` and all four workspaces' vitest suites green —
**1,638 tests, 0 failures** (engine 1,051 / sim 326 / ui 159 / desktop 102).
`packages/ui/e2e/onboarding.spec.ts` 14/14. The `it.fails` clear-day tripwire at
`balance-targets.test.ts:225` is **still correctly red** (trader `debtClearedDay.median` 21
against `[22, 30]`, n = 987) and was not converted.

**The human half is UNRESOLVED and this task does not close.** The owner has not ruled on the
two vacated PARITY LEDGER rows (`docs/NPC_REDESIGN.md:228`, `:229`), on the faucet (D3), or on
the manifest residue (D4). **M5 (T-140/T-141) stays gated.**

**Prepared (2026-07-30):** This pass assembled `docs/0.5.2-REVIEW.md` (nine sections collecting
both milestones' measured results, the 36-finding framework roster, and the seven decisions
put to the owner), reflowed `packages/ui/src/__tests__/format-modules.test.ts` via `npm run
format`, and reconfirmed the gate at HEAD (`npx tsc -b`, `npm run lint`, `npm run format:check`,
and all four workspaces' vitest suites — 1,638 tests, 0 failures — plus `onboarding.spec.ts`
14/14). No file under `packages/` other than that one whitespace-only test file was touched, no
spec was edited, and no ledger row was re-ruled. The task now awaits: Human Gate.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading `TASKS.md` (protocol, standing constraints, the T-110…T-125 Del · attempts=1/4 · HUMAN-GATE HALT.

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
- **The manifest version.** Already at 0.5.2 (commit `9d9ff47e`, 2026-07-30, under the amended
  `docs/VERSIONING.md:53` policy — PATCH marks the active work track, not only a shipped one).
  **T-130 ruling (owner, 2026-07-31): no advance to 0.5.3 and no tag while this track's own
  findings are still open** — D1 (Explore time-cost rebalance), D2 (Dare redesign), D3 (the
  Hangout faucet/`hasHangout` untangle, via `/bakeoff`), D6 (the Hangout UI surfacing job) and
  D7 (Arcturus-6's credit desk) are all still outstanding. Re-check this bullet when they close.
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
| **F-150-1** | The **0.25 named-pool interceptor gate** (`actions/travel.ts`) and **`DISPOSITION_DECAY_INTERVAL_DAYS = 3`** (`content/disposition.ts`), read together now that the faucet is gated, the UI speaks, Explore's recovery model changed and the Dare is Liar's Dice | **OPEN — a DESIGN QUESTION for the owner, not a tuning knob (T-125's own ruling). NEITHER CONSTANT CHANGED BY T-150.** Measured: named share **25.07%** vs the analytic 25.00%, inertness **71.52%**, wronged-captain lift **2.358×**; the cast sits at exactly 0 on **96.52%** of live captain-days and a standing survives a **median 3 days**, with decay outrunning interaction **1.53 : 1** — so widening the gate alone would mostly buy more *inert* draws | `docs/HANGOUT_REDESIGN.md` §11.3, with a levers-not-pulled table |
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

## M4a — D1's hybrid: action points for the deep end of the Explore ladder

### T-131 · Bands 3-4 pay in dice, not days — `status: DONE` · `coder: opus` · `after: T-125`

**Delivered (2026-07-31):** `ExploreValueBand` gained the `apCost` field alongside
`recoveryDays` (band 2 untouched at `recoveryDays: 1, apCost: 0`; bands 3-4 flipped to
`recoveryDays: 0, apCost: 2` and `apCost: 3`), with a content-table test asserting no band
carries both fields non-zero. `claimOutcome` now splits three ways: bands 0-1 resolve
same-day as before, band 2 still opens the untouched calendar-day recovery slot, and
bands 3-4 spend `apCost` more dice out of the same dawn hand (lowest-value unspent dice
first, looped through the existing single-index `spendDie`) and resolve immediately
through `resolveExploreOutcome` — or, if the hand can't cover it, forfeit the find with a
new `ExplorationFailed{reason:'insufficient-dice'}` and a real UI notice, while
`PoiDiscovered` still fires either way. The pre-existing silent fallthrough for
`'recovery-in-progress'` in `explorationFailNoticeFrom` was fixed in the same pass. The
`types.ts`/`schema.ts` zero-die-commitment invariant and `docs/EXPLORE_REDESIGN.md` §3/§3.3
carry the dated D1 amendment narrowing the rule to band 2, replay goldens were
regenerated for the new at-claim RNG draw on bands 3-4, and `CURRENT_SAVE_VERSION` did not
move since `apCost` is a content constant, not save state. Deliberate scope boundary: the
band-2 calendar-day machinery, its four T-111 interaction rulings, and
`campaign-degraded.test.ts:411`'s band-2 sentinel were left untouched per the owner's
hybrid ruling — the rejected full-uniform-conversion alternative (band 2 folded in too,
forcing a `player.recovery` schema removal) was logged, not built; the extra-dice
values (2 and 3) are first-pass numbers to be tuned by playtest feel, not re-derived
from the bakeoff's EV math; and the Explore-verb ledger row itself stays DEFERRED,
re-asked only once T-150 hands back fresh post-fix numbers.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented from `docs/EXPLORE_REDESIGN.md` §3/§5, `TASKS.md`'s D1 ruling block, and t · attempts=2/4.

(Deliberately depends on T-125, not T-130 — T-130 is a still-open human gate with D2/D6/D7
pending, but this task is self-contained and ready to run the moment the owner wants it,
independent of when T-130 itself closes.)

Owner ruling (D1, `/bakeoff`, 2026-07-31): the calendar-day recovery ladder T-111 shipped is
kept for **band 2 only** (1 day, 42.1% measured collection — not broken). **Bands 3 and 4 stop
opening a multi-day `player.recovery` and instead cost extra dice from the SAME dawn hand, paid
immediately** — a band-3 find costs the sweep's own die plus **2 more**, a band-4 find costs the
sweep's own die plus **3 more** (first-pass numbers, expected to move once played — this is a
playtest, not a re-derivation of the bakeoff's EV math). This is the smaller of the two options
the bakeoff scored: it leaves `player.recovery`, `RecoveryState`, the save v13 schema, and the
travel-away/death/day-30 forfeit rulings (`docs/EXPLORE_REDESIGN.md` §3.3) **completely
untouched** — they still govern band 2 exactly as T-111 built them. The **rejected alternative**
(all non-zero bands converted, band 2 included) is logged above under D1 and is NOT this task;
do not fold it in.

**The mechanism, content side.** Add one new field to `ExploreValueBand`
(`packages/content/src/exploration.ts`) — `apCost: number`, next to `recoveryDays`, following the
exact discipline the file already enforces for `recoveryDays` itself (a band-table rule, never a
per-row constant; the file's own comment says a `grep` for the field must hit only inside
`EXPLORE_VALUE_BANDS`— extend that comment to cover `apCost` too). Bands 0/1/2 get `apCost: 0`
(unchanged behaviour). Band 3 gets `recoveryDays: 0, apCost: 2`. Band 4 gets `recoveryDays: 0,
apCost: 3`. **Assert the invariant a reviewer flagged as load-bearing: no band may have BOTH
`recoveryDays > 0` AND `apCost > 0`** — an apCost row can only ever resolve same-day (bands are
drawn AFTER the nav check, with the sweep's die and fuel already spent, so there is no dawn hand
left to charge against at a later dusk). Write this as a content-table test
(`exploreContent.test.ts` or wherever the band table's own shape is already asserted), not a
comment.

**The mechanism, engine side** (`packages/engine/src/exploreOutcomes.ts` `claimOutcome`,
`:391`). Add an `apCost(valuePoints)` reader beside `recoveryDays(valuePoints)` (`:110`) — same
shape, and match the house naming (no `-For` suffix here; `bandFor` stays unexported). In
`claimOutcome`, after the existing `recoveryDays > 0` branch (band 2, unchanged), add: if
`apCost > 0`, attempt to spend that many MORE dice from `state.player.dawnHand` (`claimOutcome`
already receives full `GameState` — no new parameter; note `dawnHand` is OPTIONAL,
`types.ts:1672`, and a missing hand counts as insufficient). **Spend the LOWEST-VALUE unspent
dice first** — the payment ignores die values, and lowest-first deterministically preserves the
player's best dice for later checks; state this as the rule so the pick is never
implementation-defined. There is no multi-die primitive today (`spendDie`, `dice.ts:188`, is
one-index-at-a-time and every action carries a scalar `spendDie`) — loop the existing helper,
do not invent a second spend surface. If the hand has enough unspent dice, spend them and
resolve the outcome today via the existing `resolveExploreOutcome`, exactly as a band-0/1
same-day find does. If it does not, the find is **forfeited** — no downgrade, no partial payout
(a reviewer's alternative; log it as a design option to revisit if forfeiting reads badly in
play, but build the simpler forfeit path first) — emit the new typed reason below.
`PoiDiscovered` still fires either way: the player is told what was found, only its recovery
failed.

**The written invariant this reverses — amend it, don't leave it lying.**
`packages/engine/src/types.ts:1501-1503` states *"A RECOVERY IS A ZERO-DIE COMMITMENT after the
initiating Explore die… nothing may charge a die per recovery day"*, and
`docs/EXPLORE_REDESIGN.md` §3.3 carries the same rule; ruling 1 in this file's header is already
amended (see above). Both the comment and the spec get a dated D1 amendment in this task's
commit — the invariant survives narrowed to band 2, it does not silently disappear. Note the
distinction the amendment should keep: bands 3-4 charge dice AT CLAIM, same-day — still nothing
charges a die per recovery *day*.

**Known ripple, enumerated (verified against HEAD, 2026-07-31)** — update these deliberately,
never to "make them pass": `exploreOutcomes.test.ts:509-517` pins the exact ladder
(`recoveryDays(31) === 3`, `recoveryDays(61) === 6`) and `:523-528` its monotonicity;
`recovery.test.ts:496-506` expects a band-4 row to open a `recoveryDays`-length recovery;
`exploreContent.test.ts:176-186` asserts per-row band/clock agreement;
`campaign-degraded.test.ts:411` (every band-2 row is `recoveryDays: 1`) must still pass
UNMODIFIED — it is the band-2-untouched sentinel. Replay goldens will move: the defer path was
deliberately zero-RNG-cost at claim (`exploreOutcomes.ts:362-390`) and bands 3-4 now consume
RNG at claim via `resolveExploreOutcome` — regenerate the goldens with the behaviour change
named in the commit body, per the N3 precedent for a deliberate stream change.

**New typed reason.** Extend `ExplorationFailed`'s `reason` union (`packages/engine/src/types.ts:501-513`,
and the matching `z.enum` at `schema.ts:787-799`) with `'insufficient-dice'`. Give it a real UI
notice in `explorationFailNoticeFrom` (`packages/ui/src/store.ts:453`) — per this project's own
"typed fails render, never silence" rule. **While in that helper, fix the hole it already has:**
its switch handles only five of the six shipped reasons — `'recovery-in-progress'` falls through
to `return null` today, silence, despite the docstring at `:449` claiming full coverage. This
task closes BOTH gaps (an exhaustiveness-style test or compile-time check preferred, so the
seventh reason can never regress the same way).

**Accept:** `apCost` lands on `ExploreValueBand` per the values above; a test asserts no band
carries both `recoveryDays > 0` and `apCost > 0`; a band-3/4 discovery with enough remaining dice
resolves same-day and spends exactly `1 + apCost` dice total, driven through the real
`startDay`/`applyPlayerAction` loop (never by poking state), with a test for each band; a band-3/4
discovery with an insufficient hand emits `ExplorationFailed{reason:'insufficient-dice'}`,
`PoiDiscovered` still fires, no partial/downgraded payout, and the UI renders a real notice (not
silence) — each asserted by a test; the pre-existing `'recovery-in-progress'` silent fallthrough
in `explorationFailNoticeFrom` is fixed and asserted alongside it; the AP payment provably spends
the lowest-value unspent dice (asserted on a hand with mixed values); band 2's existing recovery
path (T-111's four interaction rulings) is untouched, its existing tests still pass unmodified,
and `campaign-degraded.test.ts:411` passes unmodified; `types.ts:1501-1503` and
`docs/EXPLORE_REDESIGN.md` §3.3 carry the dated D1 amendment; replay goldens, if regenerated, are
regenerated with the RNG-stream change named in the commit body; `CURRENT_SAVE_VERSION` does
NOT move (no state was added — `apCost` is a content constant, not a per-save field); gate green.
Re-run the balance capstone (`rulesFingerprint` will move — expected, re-extract once per this
track's own standing constraint) so the next measurement has a fresh baseline for the eventual
playtest read.

---

## M4b — D6: the Hangout pane finally speaks

### T-132 · Surface the dark half of the Hangout — `status: DONE` · `coder: opus` · `after: T-125`

**Delivered (2026-07-31):** All four bundled findings shipped as one task. `visitSocial(venue,
opponentId)` (`packages/ui/src/store.ts`) dispatches `meet`/`befriend`/`insult` through the exact
`VisitHangout` shape `visitDare` already established — one function, venue as a parameter, no
per-venue rule branch — with a new `socialOutcome` client-presentation slot (cleared alongside
`dareOutcome` on selection/travel/new-day/a fresh Dare) carrying the honest engine-read
`StatCheck` (`befriend` only) and signed `DispositionChanged` delta; matching buttons landed in
`HangoutPanel` (`App.tsx`) beside the existing Dare controls, asserted end-to-end by real clicks
in `packages/ui/e2e/hangout.spec.ts` (dice armed, buttons clicked, `social-outcome`/`social-check`
readouts asserted — no API shortcut). `hangoutNpcs` (`format.ts`) now filters `!n.dead` before
`rankClientele`, closing the dead-opponent hole against `hangoutRules.ts`'s own documented
contract, unit-tested with a mixed live/dead roster in the new
`packages/ui/src/__tests__/hangout-pane.test.ts`. The pane header now renders the port's authored
`houseName` in place of the generic literal, a standing `roomLine` when authored, and a per-venue
`flavour` line beside each venue's controls (nothing rendered when empty, never a placeholder) —
all read through a new `hangoutHouse()` accessor over the engine's `portHangoutFor`, so the
generic-house fallback is the engine's, not a UI restatement. The loan desk
(`loan-terms`/`loan-borrow`/`loan-repay`) is now gated on `venueOffered(systemId, 'borrow')`, the
same predicate applied to the three new social controls; both `hangoutFailNoticeFrom` and
`loanFailNoticeFrom` moved their switches into new exhaustive-by-compilation `format.ts` functions
(`hangoutFailExplanation`, `loanFailExplanation`) so a `'venue-not-offered'` reason can no longer
fall through to silence (the old bug) or land the misleading "turned that request down" line (the
old `default` arm) — each given an honest, house-voiced line and asserted by its own test. No
per-port engine branch was added anywhere; every difference is a `PortHangout` content field. No
save version bump — `socialOutcome` is client presentation state, not `GameState`. Deliberate
scope boundary: the seventh venue, `'rumor'`, was NOT given a dispatch — `VisitHangout{rumor}`
would spend a die to emit exactly the free `hangoutRumors` output the pane already renders every
frame, so a paid affordance would be strictly dominated; a one-line comment marks the omission at
the dispatch site rather than leaving it to be rediscovered as a gap. T-133's per-port loan band
was left untouched, as scheduled.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root · attempts=1/4.

Owner ruling (D6, 2026-07-31): fix the UI. Bundles **F-101-4, F-101-5, F-101-6, F-123-1** as
**ONE task, not four** — this is `docs/0.5.2-REVIEW.md`'s own recommendation (the F-113-A
governance lesson: a finding whose fix is "a new task" gets scheduled as one, not left for the
next pass to trip over), and the four defects are one underlying gap: **14 authored ports are
not yet player-visible.** Independent of T-131 (different subsystem); depends only on T-125
being functional, same reasoning as T-131.

**F-101-4 — three of six venues have no player affordance.** `packages/ui/src/store.ts` dispatches
`VisitHangout{venue: 'dare'}` (`:1269`), `'borrow'` (`:1342`), `'repay'` (`:1378`) — and nothing
else. Add `meet`, `befriend`, and `insult` dispatch functions (mirroring `dare`'s shape: pick an
opponent from `hangoutNpcs`, spend a die, read the resulting `HangoutEvent`) and the matching
buttons/controls in `HangoutPanel` (`packages/ui/src/App.tsx`, beside the existing `hp-dare-controls`
block, `:1857`). Reuse the existing venue-gating pattern already established for `borrow`/`repay`
below.

**F-101-5 — the opponent list can offer a dead captain.** `hangoutNpcs` (`packages/ui/src/format.ts:364-378`)
filters live NPCs by `currentSystemId` only — no `!n.dead` check. The engine's own `rankClientele`
doc comment (`packages/engine/src/hangoutRules.ts:116-117`) states its contract explicitly: *"the
caller passes the ALREADY-FILTERED live in-system, non-dead set"* — the UI caller is the one
violating it. One-line fix: filter `n.dead` out before ranking.

**F-101-6 — every authored `HangoutProse` field renders nowhere.** The pane header
(`packages/ui/src/App.tsx:1803`) is the literal `"Spacers Hangout · {systemName}"` — `houseName`,
`roomLine`, and per-venue `flavour` (`packages/content/src/portHangouts.ts`'s `HangoutProse`,
`:111-118`, authored at all 14 ports) have no reader anywhere in the UI. Render `houseName` in
the header in place of the generic literal, `roomLine` as a standing line in the pane, and the
relevant `flavour[venue]` line alongside each venue's controls when present (empty ⇒ render
nothing extra, never a placeholder). (Correction to the review doc's assumption, verified at
HEAD: `packages/ui/e2e/hangout.spec.ts` locates by `data-testid` only and never asserts the
header literal, so the header swap moves NO existing test — the new prose assertions this task's
Accept requires are additions, not fix-ups.)

**The seventh venue, deliberately NOT surfaced — record it, don't leave it silent.** The engine's
venue union is seven, not six: `'rumor'` (`portHangouts.ts:57`) spends a die to emit the same
`hangoutRumors(nextState)` output the pane already renders for free via `format.ts:385` — a paid
dispatch would be strictly dominated. This task adds no `rumor` affordance; it leaves a one-line
comment at the dispatch site saying exactly that, so F-101-4's "three of six venues" arithmetic
and the missing seventh are both explained in place rather than rediscovered.

**F-123-1 — a credit desk is offered at a port that has none, and a refusal for it would render
silence.** Two parts:
1. Gate the `loan-terms`/`loan-borrow`/`loan-repay` block (`App.tsx:1927+`) behind
   `venueOffered(systemId, 'borrow')` (`packages/engine/src/hangoutRules.ts:103-106`) — the same
   pattern this task is establishing for `meet`/`befriend`/`insult` above, applied to the desk
   that's currently unconditional.
2. `hangoutFailNoticeFrom` (`packages/ui/src/store.ts:478-491`) has **no case at all** for
   `'venue-not-offered'` — its switch falls through and the loop returns `null`: silence, a direct
   violation of this project's "typed fails render, never silence" rule. `loanFailNoticeFrom`
   (`:500-519`) has a `default` arm covering it, so it isn't silent, but its message ("Penny Wise
   turned that request down") is misleading — it implies a refusal, not an absent desk. Give BOTH
   an honest `'venue-not-offered'` case in the house's own voice (e.g. "There is no credit desk in
   this room." / "No one here takes that kind of wager.").

**Accept:** `meet`/`befriend`/`insult` are each dispatchable through the real UI and asserted by an
e2e test (real clicks, not an API call, per this project's standing UX-test rule); `hangoutNpcs`
never offers a dead NPC (unit test with a mixed live/dead roster); the pane renders `houseName` and
`roomLine` at a port that authors them and falls back to the generic default at one that doesn't
(both asserted); at least one authored `flavour` line renders next to its venue; the loan desk
controls render only where `venueOffered(..., 'borrow')` is true, asserted at both an offering and
a non-offering port; both `hangoutFailNoticeFrom` and `loanFailNoticeFrom` render a real,
venue-specific `'venue-not-offered'` notice (never `null`), each asserted by a test; no per-port
engine branch is added anywhere (every difference is a `PortHangout` content field, per ruling 3);
no save version bump; gate green, including `packages/ui/e2e/hangout.spec.ts` updated to match.

---

## M4c — D7: Arcturus-6 keeps its desk, on tighter terms

Owner ruling (D7, 2026-07-31): **confirmed — keep the per-port credit desk variation.** Direction
confirmed as proposed: a **per-port loan PRINCIPAL BAND**, mirroring the Dare's existing `wager`
band exactly. `PortHangout` gains an optional `loanBand?: { min: number; max: number }` (alongside
`wager`), defaulting through `DEFAULT_PORT_HANGOUT` to the current global
`LOAN_MIN_PRINCIPAL`/`LOAN_MAX_PRINCIPAL` (`packages/content/src/lending.ts:76-77`) exactly as
`wager` already defaults to `DARE_MIN_WAGER`/`DARE_MAX_WAGER` — so every port but Arcturus-6 is
behaviour-preserving by construction. Arcturus-6 authors a tighter `loanBand` instead of omitting
`'borrow'`/`'repay'` from its `venues` list, so the anti-poverty escape hatch (F-123-2) survives
there, just at a stingier ceiling than the core-world default.

**Logged alternative, not chosen (owner asked to keep this for the record):** a per-port INTEREST
RATE multiplier on `LOAN_DAILY_RATE`, instead of or alongside the principal band. Not ruled out —
the owner's exact words were "confirm the direction… is there something else we can vary" — but
the principal band is the one being built first because it reuses the `wager`-band pattern
byte-for-byte (lowest engine risk, F-101-1's own precedent for how a band clamps). **Revisit the
interest-rate axis after this playtest** if a tight principal band alone doesn't read as enough
per-port distinction, or if a later port wants to vary predatory/generous terms rather than just
loan size.

### T-133 · A per-port loan band, Arcturus-6 first — `status: DONE` · `coder: opus` · `after: T-132`

**Delivered (2026-07-31):** Added `loanBand?: { min: number; max: number }` to `PortHangout`
(`packages/content/src/portHangouts.ts`), defaulted on `DEFAULT_PORT_HANGOUT` to
`{ min: LOAN_MIN_PRINCIPAL, max: LOAN_MAX_PRINCIPAL }` so the thirteen rows that don't author one
inherit today's shipped bounds by construction; added `loanBandFor(systemId)` beside
`wagerBandFor` in `hangoutRules.ts`, and swapped `borrowLoan`'s global
`Math.max(LOAN_MIN_PRINCIPAL, Math.min(LOAN_MAX_PRINCIPAL, requested))` clamp in
`actions/hangout.ts` for one reading `loanBandFor(systemId)` — a rule, not a per-port branch, same
pattern as the Dare's `wagerBandFor` clamp. Re-authored `ARCTURUS_6_HANGOUT`: `venues` goes back
to `ALL_HANGOUT_VENUES` (the garrison mess no longer withholds `borrow`/`repay` outright) and it
now carries the first per-port `loanBand` in the game, `{ min: LOAN_MIN_PRINCIPAL, max: 1000 }` —
tight, not absent. The Hangout pane (`App.tsx`) reads the live port's band through
`lendingTerms(game)` for its principal control's bounds and display, and re-clamps (not resets)
the in-flight principal figure on port change so a captain who reopens the desk elsewhere never
sees a number the local quartermaster won't honour. Scope boundary, deliberate: the rate
(`LOAN_DAILY_RATE`), the term (`LOAN_TERM_DAYS`) and the lender (`LENDER_ID`) stay global per D7 —
a port decides how deep the desk goes, never what it charges — so there is still exactly one
lender of record and one `LoanState` slot; the previously-logged interest-rate-multiplier
alternative was not built. Balance smoke run at `docs/balance/baseline-t133-loanband.json`
confirms the narrower Arcturus-6 band doesn't destabilize Tour One clear rates. Tests updated
across `hangout.test.ts`, `hangoutRules.test.ts`, `hangoutContent.test.ts`, `lending.test.ts`,
the sim's lending-property/protocol/campaign-degraded suites, and `hangout-pane.test.ts` +
`e2e/hangout.spec.ts`, including a test asserting `loanBandFor` resolves to the global constants
at all 13 other authored ports plus the default row, and a real-`applyPlayerAction` test that a
requested principal above Arcturus-6's ceiling clamps rather than errors.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading `portHangouts.ts`, `hangoutRules.ts`, `actions/hangout.ts`, the · attempts=1/4.

Depends on T-132 because both touch `PortHangout`/`DEFAULT_PORT_HANGOUT` and the Hangout pane's
loan-desk rendering — sequence to avoid two tasks editing the same content row and pane block at
once. Add `loanBand?: { min: number; max: number }` to `PortHangout`
(`packages/content/src/portHangouts.ts:133-145`), defaulted in `DEFAULT_PORT_HANGOUT` to
`{ min: LOAN_MIN_PRINCIPAL, max: LOAN_MAX_PRINCIPAL }`. Add a `loanBandFor(systemId)` engine
reader beside the existing `wagerBandFor` (`packages/engine/src/hangoutRules.ts:70`), and replace
the global clamp in `borrowLoan` (`packages/engine/src/actions/hangout.ts:403-404`, currently
`Math.max(LOAN_MIN_PRINCIPAL, Math.min(LOAN_MAX_PRINCIPAL, requested))`) with a clamp against
`loanBandFor`, mirroring how `dare`'s wager clamps to `wagerBandFor` at `:279-282` — a rule, not
a per-port branch. Author Arcturus-6's row (`ARCTURUS_6_HANGOUT`, `portHangouts.ts:482-484`):
its `venues` list currently OMITS `'borrow'`/`'repay'` — this task ADDS them back alongside the
new, tighter `loanBand` (e.g. a lower `max` than the global 5,000cr ceiling — exact number is a
content call at authoring time, not specified here). Update the pane (from T-132) to read the
port's own band for its principal-amount control instead of the global constants.

**Accept:** every port but Arcturus-6 is behaviour-preserving (a test asserting `loanBandFor`
resolves to the global constants at all 13 other authored ports plus the default row); Arcturus-6's
band is tighter than the global default and a requested principal above its `max` clamps rather
than errors (asserted by a test through the real `applyPlayerAction` path); the pane's loan control
reflects the live port's band, not a hardcoded global; no per-port engine branch (the clamp reads
`loanBandFor`, never an `if (systemId === ...)`); gate green.

---

## M4d — D2: the Spacer's Dare becomes Liar's Dice

Owner ruling (D2, 2026-07-31, after a two-round `/bakeoff`): replace the Dare's single opposed
GUILE check with a real Liar's Dice bluffing game. This is scoped as its own milestone — spec,
then engine, then UI, then a capstone — because it is genuinely bigger than any other task in
this track: a new persisted multi-turn scene (architecturally like Combat's `EncounterState`, not
the Dare's current one-shot call), a real save migration, new `GameEvent` variants, a new AI
dealer policy, a new animated-dice UI subsystem, and (per the owner's explicit "real dice,
sci-fi themed, not just text" requirement) a new dependency this repo doesn't currently carry
anywhere. Load `~/.claude/skills/tabletop-ui/SKILL.md` before any UI work here — it is this
project's own house style for exactly this class of build.

**THE SETTLED RULESET** (two bakeoff rounds; the first ruleset had a real exploit, found and
closed — recorded here so it is never reintroduced):

- **4 hidden d6 per side** (8 total), no wildcards, quantity capped at 8 (total dice in play),
  face capped at 6. One hand = one Dare (not a Perudo-style dice-losing ladder across many hands).
  Player opens.
- Each turn, exactly one of:
  1. **RAISE FACE** — move to **exactly the next face up** (F→F+1 only, never a further jump —
     see the exploit note below), claimed quantity **stays exactly the same**.
  2. **RAISE QUANTITY** — same face, quantity strictly increases (by any amount).
  3. **RAISE BOTH** — face up by exactly one AND quantity up — costs **2× the normal ante**.
  4. **CALL THE BLUFF** (challenge) — both hands reveal; actual count of the claimed face ≥
     claimed quantity → bidder wins the pot, else the challenger wins.
  5. **FOLD** — forfeit the hand without revealing. Costs the player the **seed wager plus every
     ante-raise accumulated so far this hand**, paid to the opponent; no further penalty, no
     reveal. (Deliberately more than "just the pot so far" — a free-to-walk-away fold would let a
     player open a huge bluff and bail the instant it looked risky, hollowing out the ante.)
- **THE EXPLOIT THIS CLOSES, stated so it is never reopened.** The original ruleset let a
  face-raise DROP quantity, which meant "restate my own known count on a new face" was always a
  risk-free claim (actual ≥ own count, always) — chainable until a player ran out of held faces.
  Requiring quantity to stay **exactly the same** on a face-raise closes it (P(also holding the
  same count on the next face) drops to single digits for any quantity ≥ 3, and is literally
  impossible for quantity ≥ 3 with only 4 own dice on two faces at once). **The fix depends on
  RAISE FACE being restricted to the immediate next face only** — allowing an arbitrary jump
  (F→F+3, say) would let a player search across faces for one where their own count still
  matches, partially reopening the same loophole. RAISE BOTH introduces no equivalent problem: a
  free RAISE BOTH requires a strictly harder joint condition than a free RAISE FACE, so it is
  always the objectively riskier claim, matched by its 2× cost.
- **Ante**: proportional to the venue's own wager band (≈3% of `band.max`, floor 1cr), added to
  the pot per raise (doubled for RAISE BOTH), clamped each raise against remaining headroom
  (`band.max − potSoFar`) — once headroom hits zero, the next action must be CALL or FOLD, never
  another free-of-clamp raise. This is how "ports further away/more dangerous carry steeper
  stakes" is expressed: **not** a literal distance formula (no rim system has a Hangout today —
  all 14 authored ports sit at `SYSTEM_DANGER_LEVELS` 1, i.e. core, uniform danger; there is no
  existing distance gradient among Hangout ports to hook into), but each port's own already-authored
  wager band, which already encodes a rough danger/exoticism gradient by content choice (Mira-9's
  dive-bar 5-200 vs. Regulus-6's high table 500-3000). A stricter literal-distance re-author of
  all 14 bands is logged as **optional future work, not part of this milestone**.
- **GUILE — origin finding, worth recording.** The owner asked where GUILE's value comes from if
  nothing can affect it. Confirmed: EVERY player stat (`PILOT`/`GUNS`/`TRADE`/`GRIT`/`GUILE`) is
  set once at character creation and **never mutated anywhere in the shipped engine** — verified
  by grep, zero writes to `player.stats[...]` anywhere outside `createInitialState`. NPC GUILE is
  the same shape: a fixed, hand-authored 0-5 value per profile (`packages/content/src/cast.ts`),
  a permanent personality trait, not something that grows. The game's ONE progression axis is the
  **ship** (component upgrades, Class-A/B explore items) — character stats are a fixed sheet, like
  a tabletop character's ability scores. So "GUILE modifiable by a unique item/questline" is **not
  wiring up an existing vector — it would be a genuinely new kind of progression** the game has
  nowhere else. Not required to ship the ruleset below (Peek works fine off a fixed GUILE, exactly
  as the current Dare already reads a fixed GUILE) — **flagged as a separate, later decision**,
  not blocking this milestone.
- **GUILE integration: "Peek."** Spend a GUILE check (die + `playerGUILE` vs. a DC) at hand-open to
  secretly see one of the opponent's four hidden dice before the first bid. Ranked above a passive
  dealer-bluff-rate multiplier (no player agency) and a post-challenge "tell" (undermines the one
  thing a dice game must protect — that the reveal is real).

### T-134 · Spec the Liar's Dice Dare — `status: DONE` · `coder: opus` · `after: T-125`

Write `docs/LIARS-DICE_REDESIGN.md`, settling everything the ruleset above leaves to
implementation detail: the exact `DareHandState` shape (both hidden hands, current bid, whose
turn, pot, resolved ante value, `peekedDealerDie`) and where it lives on `GameState` (a new
top-level field, sibling to `encounter` (`types.ts:1758`) — NOT nested under `player`, since a
Dare hand is a scene like Combat, not player-owned data like `dawnHand`); the save-migration
shape (`CURRENT_SAVE_VERSION` bump, `MIGRATIONS[n]` entry, a `.strict()` zod STATE schema —
note the event side is different: `GameEventSchema`'s variants are deliberately non-strict, and
their only drift protection is the compile-time `AssertEventKeys` guards at `schema.ts:1463+`,
so every new event variant owes one); the **seed wager** (player-chosen within the port band at
hand-open, as the current Dare's `amount` is today, or a fixed table stake — settle it); the new
`GameEvent` variants needed (at minimum a bid-placed and a challenge-resolved shape — decide
whether these fold into a richer `HangoutEvent` venue variant or are their own types) and their
`schema.ts` + `AssertEventKeys` coverage; **the disposition deltas — the clause that keeps this
track's own headline result alive.** The old Dare's `DARE_WIN_DISPOSITION = −2` /
`DARE_LOSS_DISPOSITION = +2` are what drive T-125's measured interceptor lift (voluntary
disposition was the reason the Hangout got 14 ports); the replacement MUST specify per-outcome
deltas (win, loss, and what a FOLD does — a fold is a social act too) through the existing
`venueParamsFor` surface, or explicitly rule the Liar's Dice Dare disposition-neutral WITH the
consequence for T-125's result stated; the AI dealer's bid/raise/fold/challenge policy (a pure
function of the dealer's hidden dice, the current bid, and `dealerGuile` — must never read the
player's hidden dice, a distinct cheating-AI bug class from anything existing verbs guard
against); **the sim-side player policy** — `planDare` and the gambler policy queue a one-shot
`VisitHangout{venue:'dare'}` today, and once that opens a multi-turn scene every sweep breaks
unless the sim can play a hand to completion: spec the baseline sim strategy (it need not be
clever, it must be total — every reachable scene state has a legal move) as part of this design,
not as a T-135 improvisation; the Peek check's exact DC; and the exact ante formula
(`round(band.max * 0.03)`, floor 1, doubled for RAISE BOTH, clamped to remaining headroom
per raise) as a `PortHangout`-readable rule, never a per-port constant. This is a spec only —
no engine, content, sim, or UI source file touched, mirroring T-100/T-101's own precedent for a
new subsystem in this track.

**Accept:** `docs/LIARS-DICE_REDESIGN.md` settles every open shape above with no unresolved
question left to the coder's judgement at implementation time; the exploit-closure reasoning
(RAISE FACE restricted to F→F+1, quantity unchanged) is restated as a rule, not just referenced;
FOLD's economics (seed + accumulated antes forfeited) are specified exactly; the per-outcome
disposition deltas (or an explicit disposition-neutral ruling with its stated cost to T-125's
result) are settled; the baseline sim-player strategy is specified and total over the scene's
state space; zero source files touched.

**Delivered (2026-07-31):** `docs/LIARS-DICE_REDESIGN.md` settles the full scene design: the
`GameState.dareHand` shape as a new top-level field (sibling to `encounter`, not nested under
`player`); the seed wager kept player-chosen inside the port band as today; the ante formula
(`round(band.max * 0.03)`, floor 1, doubled for RAISE BOTH, clamped to remaining headroom) read
from `PortHangout` rather than hardcoded; the bid lattice with the exploit closure restated as a
rule (RAISE FACE pinned to F→F+1, quantity unchanged) and wildcards confirmed permanently out of
scope; FOLD's exact economics (seed + accumulated antes forfeited to escrow); disposition ruled
NOT neutral — three per-outcome arms (win/loss/fold) through a new content field, with the T-125
interceptor-lift clause stated explicitly as an Accept criterion; the Peek check as a second die
before the first bid at DC 12; the AI dealer's anti-cheat policy shape (pure function of its own
hidden dice, the current bid, and `dealerGuile` — never the player's hand); four new scene event
variants (not a richer `HangoutEvent`) with their `schema.ts` + `AssertEventKeys` coverage; the
save-version bump and migration entry; and a total baseline sim-player strategy covering every
reachable scene state, so `planDare`/the gambler policy keep working once the one-shot venue call
becomes a multi-turn scene. Deliberate scope boundary: this is a spec only — zero engine, sim, or
UI source files touched (verified: `git diff` shows only `TASKS.md` and the new doc), matching
the T-100/T-101 precedent this task explicitly mirrors; T-135 owes the implementation.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented from `TASKS.md`'s M4d ruleset block plus the real source: `actions/hangout · attempts=1/4.

### T-135 · Build the Liar's Dice engine — `status: DONE` · `coder: opus` · `after: T-134`

**Delivered (2026-07-31):** Implemented `docs/LIARS-DICE_REDESIGN.md` end to end on the engine side — the `dareHand` scene state and schema, the multi-call resolver (open/bid/raise/raise-both/challenge/fold) each as its own `applyPlayerAction` mirroring Combat's multi-turn shape, the AI dealer policy (verified via a test that it never reads the player's hidden dice), the FACE/QUANTITY/BOTH raise-ladder exploit closure, disposition deltas on win/loss/fold, a save-version bump with a mid-hand `dareHand` migration and round-trip test, and typed events, all driven through real `startDay`/`applyPlayerAction` loops rather than poked state. The old single-check Dare case in `hangout.ts` is fully replaced, not kept alongside it. `packages/sim`'s dare-playing path (`planDare`, the gambler policy, and the protocol) was updated to play full hands to completion through the new scene, and the smuggler-gambler sweep suite was extended accordingly. Scope boundary: the visual/UI layer for the scene (CSS-3D dice, bid history, reveal animation) is deliberately out of scope here and left to T-136, which depends on this task.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading the spec plus the real engine/content/sim sources it names. · attempts=1/4.

Implement `docs/LIARS-DICE_REDESIGN.md` end to end on the engine side: the `dareHand` scene state,
the multi-call resolver (open/bid/raise/raise-both/challenge/fold, each a separate
`applyPlayerAction`, mirroring Combat's multi-turn shape), the AI dealer policy, the save migration
+ round-trip test, and the new typed events. The OLD single-check Dare (`hangout.ts:243-318`'s
current `'dare'` case) is fully replaced, not kept alongside it — `venue: 'dare'` now opens a
`dareHand` scene instead of resolving inline. **This task also updates `packages/sim`'s
dare-playing path** (`planDare` and the gambler policy) to the spec's baseline sim strategy —
the sweeps are part of this task's gate, so leaving the sim queuing a one-shot dare against a
scene-opening engine is not an option. Every port-authorable number (ante formula inputs, Peek
DC) is a rule reading content, never a per-port branch, per this whole track's standing
constraint.

**Accept:** a full hand (open → several raises across FACE/QUANTITY/BOTH → a challenge or a fold)
is driven end to end through the real `startDay`/`applyPlayerAction` loop in a test, never by
poking state; a test asserts the exploit stays closed (a face-raise that changes quantity is
rejected, a face-raise that jumps more than one value is rejected); FOLD forfeits exactly the seed
wager plus accumulated antes, asserted by a test; the AI dealer's policy never reads the player's
hidden dice (asserted by a test inspecting the function's inputs, not just its outputs); the
spec's disposition deltas apply on win/loss/fold exactly as settled, asserted by a test; a save
round-trip test covers a mid-hand `dareHand` surviving serialization; `CURRENT_SAVE_VERSION` bumps
with a migration; the sim's gambler policy plays full hands to completion through the new scene
and the sweep still runs (asserted by the sim suite, not just claimed); gate green.

### T-136 · Build the Liar's Dice UI — `status: DONE` · `coder: opus` · `after: T-135`

Load `~/.claude/skills/tabletop-ui/SKILL.md` first. Build the visual scene inside `HangoutPanel`
(`packages/ui/src/App.tsx`): real CSS-3D d6s (no WebGL/3D-engine dependency — `transform-style:
preserve-3d`, sci-fi glow via gradient/filter, a reveal animation on challenge), the bid history,
and the current-bid/whose-turn readout. The dealer's hidden dice must not exist face-up in the DOM
until the reveal frame (the same "hidden until resolved" discipline the engine already keeps
server-side). Per the tabletop-ui skill's prescribed stack, this is expected to add an animation
dependency (e.g. GSAP) that is **new to this repo** — call this out explicitly in the PR/commit
body as a dependency addition, not a silent one.

**Accept:** a full hand is playable end to end through the real UI (real clicks, not an API call,
per this project's standing UX-test rule) and asserted by an e2e test; the dealer's dice are
verifiably absent from the DOM before reveal (an e2e assertion, not just a code-review claim); the
new dependency (if any) is named in the commit; gate green.

**Delivered (2026-07-31):** Built the Liar's Dice visual scene inside `HangoutPanel`
(`packages/ui/src/App.tsx`): real CSS-3D d6s via `transform-style: preserve-3d` (no WebGL/3D-engine
dependency), sci-fi glow via gradient/filter, the bid history, and the current-bid/whose-turn
readout, wired to the T-135 engine's `dareMove`/`darePeek` actions and `DareHand` state rather than
poked state. The dealer's hidden dice render as shrouded placeholders and are verifiably absent
from the DOM (no face values) until the reveal frame, matching the engine's server-side "hidden
until resolved" discipline. GSAP (`gsap@^3.15.0`) was added as a new dependency, exactly as the
tabletop-ui skill's prescribed stack anticipated, scoped to the one job CSS keyframes can't do
cleanly — the staggered, callback-bearing reveal timeline — with every other visual (cubes, pips,
glow, shroud) staying plain CSS; it is credited in `docs/CREDITS.md` and named here as required.
A synchronous instant-mode rail (no timeline object created under reduced motion) keeps the settled
DOM available on the very next render so the e2e suite can assert real state, not animation timing.
`store.ts` and `format.ts` gained the read-model/formatting glue for the new scene, `hangout.spec.ts`
was updated for the replaced Dare flow, and a new `liars-dice.spec.ts` e2e plus a
`liars-dice-pane.test.ts` unit suite cover a full hand played end to end through real clicks. Scope
boundary: capstone measurement of the new Dare's win-rate/EV is deliberately out of scope here and
left to T-137, which depends on this task.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading `docs/LIARS-DICE_REDESIGN.md`, the T-135 engine sources, and th · attempts=1/4.

### T-137 · Capstone: measure the new Dare — `status: DONE` · `coder: opus` · `after: T-136`

The old Dare's 57.3%-win-rate / +120-159cr-EV measurement is now irrelevant — this is a different
game. Run a fresh balance-sim capstone (same shape as T-116/T-125's) measuring: the real player
win rate and EV per hand under the settled ante/Peek-DC numbers; how often FOLD is taken and
whether it is ever strictly dominant or dominated across hand strengths (the open risk the
economy bakeoff flagged); how often the RAISE BOTH 2× ante is used; and whether the ante-clamp
(forced CALL/FOLD once a port's band headroom is exhausted) fires often enough to matter. `npm run
format` first, then re-extract `rulesFingerprint` once (this milestone's engine/content touch
already moves it — this is the one capstone owed for the whole milestone, not one per task).

**Accept:** a fresh `docs/balance/baseline-<label>-liars-dice.json` exists; the measured numbers
above are reported in `docs/LIARS-DICE_REDESIGN.md` as a dated addendum, not asserted without
evidence; no constant is retuned to chase a target number (a genuinely broken result is reported
and left for a fresh owner call, per this whole track's "never edit a fingerprint, band, or
threshold to make a test pass" rule); gate green.

**Result (2026-07-31).** `npm run format` first — **zero files changed**. 8 × 1,000-seed × 120-day
shards over all eight policies with `--milestone-days 21,29,30,41,60,120`, merged to
`docs/balance/baseline-t137-liars-dice.json` with `[balance] wrote aggregate for 8000 rows`;
`balance:extract --aggregate` re-stamped `docs/balance/smoke/tiers.json` to
`sweepLabel: t137-liars-dice` / `runs: 8000` / `spreadSource: harvested`. **The three fingerprints
did NOT move** (rules `a5ec29dba6457f77` / instrument `4de222a04b05a537` / docs `b8ed2b1cdefceaf7`)
— T-135 already re-stamped them when it landed the engine (§15's "smoke re-extract only") and
T-136 was UI-only, which is not hashed; T-137's contribution is the fresh aggregate underneath
them. `balance:diff` from `t133-loanband` (the aggregate immediately before the engine landed)
isolates the mechanic exactly: **precisely two rows move, `gambler` and `fleet`**, and the seven
policies that never sit at a table are byte-identical. Baseline of record re-pinned in four places
(`balance-targets.test.ts:103`, `docs/NPC_REDESIGN.md` ×2, `docs/balance/smoke/README.md` — the
last was **stale at `baseline-t125-hangout.json`**, missed by both T-131 and T-133, corrected
here). The `it.fails` trader tripwire stays correctly RED (median 21 at n=990) and was not
flipped.

**The measurement** is `docs/LIARS-DICE_REDESIGN.md` **§16** — 15,235 hands off a gitignored
960-run probe (`.scratch/t137-liars-dice.ts`, seeds 1..120 × 120 days × 8 policies, descended from
T-125's so §16.6 is like-for-like), **fidelity 5/5 MATCH** against `runCampaign` on five channels,
`dareGuardHits` 0, `timeout-fold` 0. Headlines: **win rate 94.66%, EV/hand +737.53 cr**;
**FOLD 0.03%** and — by derivation, since `EV_challenge − EV_fold = P_false · pot ≥ 0` always —
**never strictly dominant, weakly dominated by CHALLENGE everywhere, strictly dominated wherever
`P_false > 0`** (5/5 observed folds were in the strictly-dominated set; ablating FOLD entirely
moves EV/hand by +0.16%); **RAISE BOTH 23.18% of dealer raises** (player-side 0 by construction,
§12.5); **the ante clamp fires on 53.12% of the dealer's 16,485 decisions and 0.00% of the
player's 1,570** — F-134-1 is now MEASURED, its ~69.7% prediction landing at 70.05%, and §4.4's
0.64 derivation cross-checking with zero violations across 18,055 decision points.

**Two findings filed and NOT fixed, per the Accept's "report and leave for a fresh owner call":**
**F-137-1** (§16.2) — the baseline planner's opening claim is guaranteed true by construction
(15,235/15,235 measured) and the dealer's terminal fallback is CHALLENGE, so the house volunteers
a certain loss on 90.48% of its decisions and loses 94.68% of them; the gambler's
`finalCredits.median` moved 56,686 → 94,798 (+67.2%). **F-137-2** (§16.6) — §7.5's interceptor
lift GREW (gambler wronged-captain share 29.28% → 47.50%) as a symptom of F-137-1 rather than an
independent win, while the lift over *uniform* slipped 2.956× → 2.623×. Both recommended for
M4e's owner call. **Zero lines changed in `packages/engine/src`, `packages/content/src`,
`packages/sim/src/index.ts` or `packages/sim/src/balance` (§16.7's `git diff --stat` proof); the
only source line touched is the re-pin path string.**

**Delivered (2026-07-31):** The M4d capstone measurement shipped end to end — `npm run format`
clean, an 8 × 1,000-seed × 120-day sweep over all eight policies merged into
`docs/balance/baseline-t137-liars-dice.json`, `docs/balance/smoke/tiers.json` re-extracted to
`t137-liars-dice` / 8000 runs, and the baseline of record re-pinned in the four places that
reference it (`balance-targets.test.ts`, `docs/NPC_REDESIGN.md` ×2, `docs/balance/smoke/README.md`
— the last one caught and fixed a stale pointer left behind by T-131/T-133). The headline numbers
— 94.66% win rate, +737.53cr EV/hand, FOLD taken 0.03% of the time and never dominant, RAISE BOTH
at 23.18% of dealer raises, the ante clamp firing on 53.12% of dealer decisions — are written up
as a dated addendum in `docs/LIARS-DICE_REDESIGN.md` §16, independently cross-validated against a
gitignored 15,235-hand probe at 5/5 fidelity. Deliberate scope boundary: per the Accept criterion,
two genuinely lopsided findings (F-137-1, the dealer's guaranteed-loss opening claim; F-137-2, the
interceptor lift growing as a symptom rather than a win) were measured, filed, and left untouched
rather than retuned to chase a nicer number — no line in `packages/engine/src`,
`packages/content/src`, or `packages/sim/src/{index,balance}` was touched; the only source change
is the re-pin path string, with both findings referred to M4e's owner call.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading `docs/LIARS-DICE_REDESIGN.md` (§1.3, §4.4/§4.5, §5.1, §6.1/§6.3 · attempts=1/4.

---

## M4e — D2 continued: the opponent roster, archetypes, and the unlock ladder

Owner ruling (2026-07-31, after a second `/bakeoff` round on top of M4d's base build). Depends on
M4d (T-134-T-137) shipping first — this milestone adds a roster and a progression system on top
of an already-working Liar's Dice engine, it does not change the core resolution rules again.

**SETTLED, this round:**

- **Wildcards (ones-as-wild) are OUT OF SCOPE, permanently, not deferred-quietly.** A dedicated
  bakeoff pass found it reopens a WORSE version of the exploit M4d already closed: holding *m*
  ones gives a guaranteed floor on every non-one face SIMULTANEOUSLY (not one adjacent pair), ~3.5x
  more common than the closed exploit and unbounded in scope — the fixed-quantity/adjacent-face-only
  fix does nothing against it, because the guarantee never comes from restating a known count on
  one next face, it comes from every held 1 backing every face at once. Do not resurrect this
  without a fresh, dedicated design pass — it is not a tuning knob.
- **Two opponent pools, layered, not merged:**
  1. **A new, dedicated, non-roaming roster: 3 fixed opponents per `hasHangout` port (42 total)**,
     each with an AI bidding archetype (`'optimal' | 'bad' | 'random' | 'mixed'`, a mixed archetype
     taking a percentage split across the other three) and three authored lines (table-talk,
     win, lose). **Cannot be built on the existing simulated `NPC_PROFILES` cast** — verified: NPCs
     move `currentSystemId` daily via the roam simulation and can die, so "fixed, always at this
     port, beat-once-forever" is structurally impossible on that pool. New content table,
     `PortHangout`-shaped (keyed by systemId), always resolvable, no `currentSystemId`, no dusk
     mutation. **Beat-once tracked**: `player.liarsDiceBeaten: string[]`, a new persisted field
     (save migration). Feeds the port-clear and whole-game-clear achievements — ONLY this pool
     counts toward them.
  2. **The existing 30 `NPC_PROFILES` roaming captains, unchanged mechanism.** Whoever's
     simulated-present at a `hasHangout` port that day is Dare-able exactly as today (via
     `hangoutNpcs`/`rankClientele`) — freely re-challengeable, NOT beat-once, NOT tracked toward
     the roster achievements. A captain currently simulated at a rim system (no Hangout) is simply
     unreachable that day — deliberate, accepted as in-fiction continuity ("that captain's out at
     the rim right now"), not a bug to route around.
- **Roster opponents have a PERSISTED PER-OPPONENT PURSE (owner ruling, 2026-07-31).** Each of
  the 42 rows authors a starting bankroll; the live balance is saved state, debited/credited by
  hand outcomes exactly like a roaming dealer's purse — the roster is zero-sum with the player,
  not a mint. Their side of the solvency clamp reads the live balance, so "unlimited betting"
  keeps a real cap against the roster too. **T-144 must settle the two questions this opens:**
  where the balances live on the save (one map, keyed by opponent id, landing inside T-145's
  single migration alongside the other new fields), and what a BROKE opponent does (cannot cover
  the ante/seed — refuses to sit? sits at stakes clamped to their remaining credits? does a
  beaten-and-broke opponent regenerate?) — settled in the spec, not improvised at the table.
- **`player.liarsDiceGamesPlayed: number`** — a global counter, EVERY Liar's Dice hand played
  against EITHER pool, drives the unlock ladder below. Decoupled from the 42-opponent achievement
  set on purpose: the roaming pool supplies effectively unlimited replay games, so the ladder is
  never bottlenecked by the fixed roster's size.
- **The unlock ladder — doubling, exact owner numbers: 5 / 10 / 20 / 40 / 80 cumulative games.**
  In order: **5th die → 6th die (cap: six, never more) → "read the table" (see below, replaces
  wildcards) → increased bounded betting (a raised, still-finite wager-band ceiling) → unlimited
  betting (remove the port's wager-band MIN/MAX clamp only; the existing solvency clamp — capped
  by what both sides can actually cover in credits — stays, so the pot can never literally run
  away).**
- **The wildcard slot's replacement: "Read the Table."** At unlock, before a hand's first bid the
  player sees the dealer's AI archetype (not their dice) — "this one plays it safe / this one's
  reckless / can't get a read on this one" for optimal/bad/random/mixed respectively. Chosen over
  a second Peek (the alternative considered) because it is mathematically inert — touches no dice
  or count logic at all, so it carries none of wildcards' risk — and it directly pays off the
  archetype system this same round just designed, rather than doubling down on an already-shipped
  mechanic.
- **Achievement hooks reuse the existing Deed/Registry system, with one addition — and the
  signal MUST be an EVENT, not a state flag (verified against HEAD, 2026-07-31).** The deed
  engine cannot express "a distinct set reaching a known total" directly, and the state-matcher
  route is closed: `DeedTrigger.state` is a FILTER applied after an event match, never a
  standalone trigger (`accrueDeeds` early-returns with no events), and `STATE_PATHS`
  (`packages/engine/src/deeds.ts:104`) is a one-element allowlist (`player.ship.fuel`) rooted at
  the actor — a `state.flags` path can never fire. What works cleanly: Liar's Dice keeps its own
  completion tracker (the `liarsDiceBeaten` set, sized against the authored roster per
  port/globally) and emits a **one-time synthesized `GameEvent`** (e.g. a
  `LiarsDicePortCleared`-shaped variant, or a new field on the hand-resolved event) once a set
  closes — a deed with that `eventType` and no `match` array fires on it with zero matcher-DSL
  changes. If the port-clear deed needs to discriminate WHICH port, the matched field must be
  added to `EVENT_PATHS`, and `packages/engine/src/__tests__/deeds.test.ts` asserts every shipped
  deed's paths against it — T-144 enumerates this exactly.

### T-144 · Spec the roster & progression system — `status: DONE` · `coder: opus` · `after: T-137`

Write the addendum to `docs/LIARS-DICE_REDESIGN.md` (or a new `docs/LIARS-DICE-PROGRESSION_SPEC.md`
if it reads cleaner split out) settling: the new content table's exact shape and file
(`packages/content/src/liarsDice.ts`, `LIARS_DICE_OPPONENTS: Readonly<Record<number,
LiarsDiceOpponent[]>>`, 3 entries per of the 14 `hasHangout` ports); the AI archetype behaviors as
concrete bid/raise/fold/challenge decision rules (not just labels — "optimal" needs an actual
policy, not a vague better-than-random heuristic); the mixed-archetype percentage-split shape;
`player.liarsDiceBeaten`/`liarsDiceGamesPlayed`'s exact types and their save migration —
**ONE version bump covering BOTH fields, implemented in T-145** (T-146 and T-147 then read
existing fields; two parallel tasks must never race on `CURRENT_SAVE_VERSION`) — with backfill
and round-trip test per the `dareHand` precedent T-135 already set; the doubling ladder's
five thresholds and what each unlock actually changes in the resolver (dice-count unlocks mean
`DareHandState`'s dice arrays and the quantity/face caps become a function of live unlock tier, not
a literal constant — every validation site needs to read it, not just the deal); "Read the Table"'s
exact copy per archetype; "increased bounded betting"'s exact new ceiling multiplier; the
achievement completion-signal shape as a synthesized `GameEvent` (per the settled block above —
the state-flag route is closed), its two `DeedDefinition` entries (port-clear ×14, one
whole-game-clear), and any `EVENT_PATHS` addition the port-discriminating matcher needs, named
against `packages/engine/src/__tests__/deeds.test.ts`'s guard; and **the fixed roster's
persisted-purse model** per the owner ruling in this milestone's settled block — the save-side
shape of the per-opponent balances, the authored starting bankrolls' place in the content table,
the broke-opponent rule, and whether a beaten-and-broke opponent regenerates. Zero
source files touched — spec only, same discipline as T-100/T-101/T-134.

**Accept:** every shape above is settled with nothing left to the coder's judgement; the
"beat-once tracked only for the 42-roster, not the 30 roaming captains" distinction is stated
explicitly as a rule (not assumed); the dynamic-dice-count ripple into the resolver's validation
sites is enumerated by file/function, not just asserted to exist; zero source files touched.

**Delivered (2026-07-31):** wrote `docs/LIARS-DICE-PROGRESSION_SPEC.md` as the split-out M4e
addendum (chosen over a §17 append because `LIARS-DICE_REDESIGN.md` closes on the dated §16
capstone), settling every shape the task called for against ground truth re-verified at HEAD: the
42-row `LIARS_DICE_OPPONENTS` content table shape (3 per of the 14 `hasHangout` ports), the four
AI archetypes as concrete decision rules plus the mixed-archetype split, the exact types and the
single `v14 → v15` migration for `player.liarsDiceBeaten`/`liarsDiceGamesPlayed`, the five-rung
doubling unlock ladder and every resolver site the dynamic dice-count ripples into, "Read the
Table" copy per archetype, the bounded-betting ceiling multiplier, the synthesized-`GameEvent`
achievement signal with its two `DeedDefinition` entries and `EVENT_PATHS` addition against
`deeds.test.ts`'s guard, and the persisted per-opponent purse model (save shape, starting
bankrolls, broke-opponent rule, no regeneration on beaten-and-broke). Deliberate scope boundary,
same discipline as T-100/T-101/T-134: zero source files touched, `docs/LIARS-DICE_REDESIGN.md`
got only a short cross-reference addendum pointing at the new file, and the parent redesign doc's
existing §16 capstone was left untouched — implementation is T-145 onward, not this task.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading `TASKS.md`'s M4e settled block, `docs/LIARS-DICE_REDESIGN.md`'s · attempts=2/4.

### T-145 · Build the fixed opponent roster (content pass 1 of 1: 42) — `status: DONE` · `coder: opus` · `after: T-144`

**Delivered (2026-07-31):** Authored `packages/content/src/liarsDice.ts`'s 42-row fixed roster
(3 per `hasHangout` port, seat/archetype/bankroll fully determined by port per T-144's table —
bad x7 / random x7 / mixed x14 / optimal x14), validated by `liarsDiceValidation.ts`, and wired
the engine's opponent resolver to look this table up alongside the existing 30-captain roaming
path without touching it. Implemented the three concrete archetype policies plus the mixed
meta-archetype, landed all new persisted state (`liarsDiceBeaten`, `liarsDiceGamesPlayed`,
per-opponent purse balances) in the single save migration T-144 specced, and covered the roster
with new engine/content/e2e tests. Deliberate scope boundary: this is content pass 1 of 1 for the
42-opponent baseline only — growing the roster further, wiring the unlock ladder (T-146), and
achievement hooks (T-147) are explicitly out of scope here and deferred to their own tasks.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading `docs/LIARS-DICE-PROGRESSION_SPEC.md` (the T-144 spec, which is · attempts=1/4.

Author `packages/content/src/liarsDice.ts`'s 42 rows (3 per `hasHangout` port) per the spec, and
wire the engine's opponent resolution (T-135's resolver) to look up this table alongside the
existing roaming-NPC path — a parallel lookup branch, not a replacement of the roaming path.
Implement the three concrete AI archetype policies (not placeholders). **This task also lands
ALL the new persisted state** — `player.liarsDiceBeaten` (recorded exactly once per roster
opponent on first defeat), `player.liarsDiceGamesPlayed` (initialised; T-146 wires its increment
into the unlock ladder), and the roster's per-opponent purse balances (seeded from the authored
bankrolls, debited/credited per hand, read by the solvency clamp, broke-opponent rule per
T-144's spec) — **in ONE save migration per T-144's spec**, so T-146 and T-147 stay
parallelizable without racing on `CURRENT_SAVE_VERSION`. A LATER content pass can grow this
toward more opponents per port; this task ships the full 3/port baseline, not a partial first
slice.

**Accept:** all 42 opponents are reachable through the real UI at their authored port (e2e-asserted
for a sample, unit-asserted for full table shape/uniqueness); each archetype's policy is
distinguishable by an actual behavioral test (e.g. "optimal" never takes a -EV line an "always
fold on any risk" baseline would decline, "bad" measurably underperforms "optimal" over many
simulated hands); catchphrases render at table-talk/win/lose per opponent; beating a roster
opponent records them in `liarsDiceBeaten` exactly once (a rematch win does not duplicate,
asserted by a test); a roster hand is zero-sum against that opponent's persisted purse and the
solvency clamp reads the live balance (both asserted by a test through the real action loop);
the broke-opponent rule behaves per spec (asserted); `CURRENT_SAVE_VERSION` bumps once with all
new fields, backfill and round-trip test; the roaming-NPC Dare path is unchanged and its
existing tests still pass; gate green.

### T-146 · Build the unlock ladder — `status: DONE` · `coder: opus` · `after: T-145`

**Delivered (2026-07-31):** `player.liarsDiceGamesPlayed` now increments on every
resolved hand, and `liarsDiceTier(gamesPlayed)` derives the five-rung doubling
ladder (5/10/20/40/80) from `LIARS_DICE_UNLOCK_GAMES`, off-by-one pinned so the
settling hand itself still plays at its old tier. `liarsDiceTier` is called at
exactly two sites in the repo — `actions/hangout.ts`'s open arm (which freezes
the tier's effects onto `dicePerSide`, `maxQuantity`, and `bandMax` once, at
open, so a mid-hand threshold crossing or content edit can never move a hand
already in progress) and `format.ts`'s pre-hand `dareWagerBounds` (legitimate
because there is no hand yet to read a frozen field off) — a third call site is
a bug per the spec's own ruling. Landed: dice count 4→5→6 (hard-capped at six
forever), "Read the Table" (a mixed opponent's resolved archetype for the
roster pool, a GUILE-derived read for the roaming pool, mathematically inert —
one string, no dice/cost/legality change), the raised bounded-betting ceiling
at tier 4 (`effectiveWagerBand` returns `max × LIARS_DICE_RAISED_CEILING_MULT`,
and the ante scales with it so a raise doesn't go free relative to a tripled
pot), and unlimited betting at tier 5 (`bandMax: null`, band clamp removed at
both ends, the pre-existing solvency clamp is the sole remaining ceiling). No
save-shape change — both fields shipped in T-145's migration; this task only
reads and increments them, and `CURRENT_SAVE_VERSION` does not move. Also
repaired a regression T-145 left in the smoke rig (F-146-0: a missing
`--aggregate` flag had silently flipped `docs/balance/smoke/tiers.json`'s
`spreadSource` from `harvested` to `estimated`; re-extracted with the M4d
baseline named explicitly and restored `harvested`). New
`packages/engine/src/__tests__/liarsDiceLadder.test.ts` (714 lines) drives every
assertion through the real `applyPlayerAction` loop, covering each unlock at
threshold−1/threshold, the six-dice hard cap, the tier-5 solvency clamp, the
freeze-at-open behavior, the increment-once-per-hand invariant, and the save
round-trip across tiers. Deliberate scope boundary: the sim and the UGT
protocol still size every wager off the tier-0 band (F-146-1, `T-144 §4.6`'s
ruling that a third `liarsDiceTier` call site is a bug forecloses adding one
there), so no sweep row or UGT career will exercise the tier-4/5 ceiling as
played — T-148 can only measure games-to-unlock pacing, not tiers 4/5 in
actual play, and that gap is reported rather than routed around.
Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading `docs/LIARS-DICE-PROGRESSION_SPEC.md` §4/§5/§8/§9 (the T-144 sp · attempts=1/4.

Implement `player.liarsDiceGamesPlayed`'s increment (every resolved hand, either opponent pool) and
the five-threshold doubling ladder (5/10/20/40/80) gating: dice count (4→5→6, hard-capped at six),
"Read the Table," the raised bounded-betting ceiling, and the unlimited-betting band-clamp removal
(solvency clamp stays). Every gated behavior reads live unlock state, not a build-time constant —
per T-144's enumerated ripple sites. **No save-shape change here** — both persisted fields landed
with T-145's single migration; this task only reads and increments them.

**Accept:** each of the five unlocks is reachable ONLY at its threshold and never before (asserted
by a test at threshold−1 and at threshold); dice count never exceeds six regardless of further
play; unlimited betting still respects the solvency clamp (a test asserting a wager can never
exceed either side's actual credits); save round-trip covers `liarsDiceGamesPlayed` at various
tiers; `CURRENT_SAVE_VERSION` does NOT move (the field shipped in T-145); gate green.

**Findings — reported, not routed around:**

- **F-146-0 (regression left by T-145, REPAIRED here).** T-145 ran `balance:extract` with **no
  `--aggregate`**, so it defaulted to `docs/balance/baseline-n1.json` (`smoke-extract.ts:53`),
  which carries no `fleet.milestones`. That flipped `provenance.spreadSource` from `harvested` to
  `estimated` and replaced the harvested tier spreads with synthetic ones — a silent quality
  regression in the smoke rig. T-146's re-extract names the M4d capstone explicitly
  (`--aggregate docs/balance/baseline-t137-liars-dice.json`, which does carry milestones at days
  21/29/30/41/60/120), and `docs/balance/smoke/tiers.json` is back to
  `"spreadSource": "harvested"` / `"sweepLabel": "t137-liars-dice"`. **T-148 should assert
  `spreadSource === 'harvested'` after its own extract** so this cannot recur silently.
- **F-146-1 — the sim and the UGT protocol can never request a tier-4/5 stake.**
  `sim/src/index.ts` `planDare` and `sim/src/protocol.ts:869` both size the `wager` domain off
  `wagerBandFor(...)`, the tier-0 band. T-144 §8 assigns neither to T-146, and §4.6 rules that a
  **third** `liarsDiceTier` call site is a bug, so no third one was added. Consequence, stated
  because T-148 depends on it: no sweep row and no UGT career will ever exercise the raised ceiling
  or the removed clamp, so **T-148 cannot measure tiers 4 and 5 as played** — only games-to-unlock
  pacing (which the gambler does reach: `GAMBLER_MAX_DARES_PER_DAY = 2` × 120 days ≫ 80).
  `planDare`'s `if (dealer.credits < band.min) return null` gate is wrong-ish at tier 5 for the
  same reason. Needs a follow-up task or an explicit §4.6 amendment; not improvised here.
- **F-146-2 — tier 4's ×3 triples per-side WHOLE-HAND exposure, not just the seed**, because
  `headroomFor` reads the same ceiling (T-144 §4.4 records this as a consequence of the ruling, not
  a reason to change it). T-148 owes mean-bids-per-hand at tier 0 vs tier 4 against T-137's
  1.19 bids/hand baseline.
- **F-146-3 — the ladder LOWERS the baseline's Dare win rate, and that is the honest direction.**
  Measured on the pinned gambler fingerprint runs (5 seeds × 40 days), tier pinned at 0 vs. ladder
  live: 299 → 284 hands, 82.6% → 80.6% player win rate, +109,380 → +61,134 net (EV/hand 366 → 215),
  `dareGuardHits` 0 on every row at six dice as at four. Cause: the baseline opener claims
  `(own(F*), F*)` — dice it actually holds, true by construction — and a bigger hand makes that
  claim a smaller share of the dice in play, so the dealer believes it less often and the free wins
  F-135-1 named get rarer. **Nothing was tuned in response**; T-148 owns the read.

### T-147 · Achievement hooks — `status: DONE` · `coder: opus` · `after: T-145`

Independent of T-146 (different subsystem — can run in parallel via `/orchestrate` once T-145 is
done; neither task touches the save shape, which shipped with T-145). Implement the
completion-signal-to-deed path designed in T-144: the one-time synthesized `GameEvent` emitted
when a set closes (reading T-145's `liarsDiceBeaten` against the authored roster), a port-clear
deed ×14 (one per `hasHangout` port) and one whole-game-clear deed (all 42 beaten), each appearing
in the existing Registry of Deeds UI (`RecordsOverlay`, `App.tsx:1990`) with a real citation, per
the established `DeedDefinition` pattern — no change to the deed matcher DSL itself (an
`EVENT_PATHS` allowlist entry per T-144's spec is an allowlist entry, not a DSL change, and its
`deeds.test.ts` guard must be satisfied, not loosened).

**Accept:** beating the last of a port's 3 opponents fires that port's deed exactly once (not once
per remaining game against the roaming pool); beating all 42 across all 14 ports fires the
whole-game deed exactly once; both render in the Registry with a citation, asserted by a test;
gate green.

**Delivered (2026-07-31):** Wired the completion-signal-to-deed path designed in T-144: `settleDareHand`
now emits a one-time `LiarsDiceSetCleared` event (`scope:'port'`, then `scope:'roster'` when it's also
the 42nd) driven by two new pure engine rules, `liarsDicePortCleared` and `liarsDiceRosterCleared` in
`liarsDiceRules.ts`, both derived from the authored roster rather than a literal count so a later
content pass can't silently desync them. Fifteen new `DeedDefinition` rows in `packages/content/src/deeds.ts`
(14 port-clear + 1 whole-roster) consume that event via a new `EVENT_PATHS` allowlist entry — no change
to the deed matcher DSL itself — and render in the existing Registry of Deeds UI with real citations.
One-time-ness rides entirely on T-145's existing `includes` de-dup guard and the roaming-pool gate; this
block deliberately adds no de-dup logic of its own. Deliberate scope boundary: T-148's roster/ladder
pacing measurement is explicitly out of scope here and stays deferred to its own task, as T-147's
description specified.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading `docs/LIARS-DICE-PROGRESSION_SPEC.md` §6/§8 and the real call s · attempts=1/4.

### T-148 · Capstone: measure the roster & ladder — `status: DONE` · `coder: opus` · `after: T-146, T-147`

Same discipline as T-137, extended: measure real games-to-unlock pacing against the doubling
ladder (does a typical playstyle actually cross 80 games in a normal career, or does the ladder's
top rung go the way of Explore's band-4 — authored but practically unreachable?), the realized
win-rate per archetype (does "optimal" actually outperform "random" by a measurable margin,
validating the archetypes aren't cosmetic labels), and how often the roaming-pool games vs. the
fixed-roster games are actually played (does the unlimited-replay pool dominate play, leaving the
42-opponent gauntlet mostly untouched — a real design question to report, not silently accept).
`npm run format` first, re-extract `rulesFingerprint` once.

**Accept:** a fresh dated addendum to the spec reports the measured numbers above, including
naming any lever left unpulled (per this track's own house discipline — a bad number is reported,
not silently tuned around); no constant is retuned to chase a target; gate green.

**Result.** Delivered as **`docs/LIARS-DICE-PROGRESSION_SPEC.md` §12 (dated 2026-08-01)**,
replacing the reserved stub and mirroring `docs/LIARS-DICE_REDESIGN.md` §16's shape. §11's T-148
row now reads DELIVERED and points at it; the redesign's §15 table carries one M4e cross-reference
row (§16 itself is history and its numbers are untouched).

**The gate work, in order.** `npm run format` FIRST — **zero files changed**. 8 × `balance:sweep
--label t148-roster-ladder --seeds 1000 --days 120 --policies trader,trader-degraded,fighter,
explorer,veteran,smuggler,gambler,greedy --milestone-days 21,29,30,41,60,120 --shard i/8` (1-indexed)
then `--merge` → `[balance] wrote aggregate for 8000 rows`. `balance:diff` from `t137-liars-dice`
**moves precisely two rows, `gambler` and `fleet`**, and leaves `explorer`, `fighter`, `greedy`,
`smuggler`, `trader`, `trader-degraded`, `veteran` **byte-identical** — the prediction stated
before the run (M4e adds no rule a non-gambler career touches; seeding 42 purse keys perturbs no
rng stream). ONE `balance:extract --aggregate …` → `4 tiers, spreads harvested, rules
09deb1e41c99bdeb / instrument c80ebc59869406bb / docs 350d78708243b524`. **All three fingerprints
UNMOVED**, because T-145/T-146/T-147 each re-stamped `tiers.json` as they landed; the milestone's
one extract is discharged as a provenance re-pin onto a fresh 8,000-row aggregate. Baseline of
record re-pinned in all four places (`balance-targets.test.ts:103`, `docs/NPC_REDESIGN.md` ×2,
`docs/balance/smoke/README.md:95`).

**The instrument.** `.scratch/t148-roster-ladder.ts` (gitignored), descended from
`.scratch/t137-liars-dice.ts` with T-125's interceptor block kept verbatim, so §12.6 is
like-for-like. **Fidelity 5/5 on SIX channels** — T-137's five plus Σ of the per-hand `creditsDelta`
joined by `handId`, the channel that proves the join is lossless. Join misses **0**, hands left open
**0**, arithmetic-tier vs frozen-field disagreements **0**, `dareGuardHits` **0**, `timeout-fold`
**0**. `liarsDiceTier` was NOT called a third time (§4.6): the probe derives the tier from the
imported `LIARS_DICE_UNLOCK_GAMES` and cross-checks it against the hand's frozen
`dicePerSide`/`bandMax`. Two arms: **Arm 1** = seeds 1..120 × 120 days × 8 policies (960 runs,
20,477 hands, T-137's exact shape); **Arm 2** = `gambler` × seeds 1..600 (600 runs, **101,904
hands**) for cell depth. Smallest reported cell `n = 6,577` hands, past the `n ≥ 1,000` sizing rule;
no cell needed widening and no claim was softened.

**What it measured.**
- **Ladder pacing (§12.1).** Rung 5 (80 games) is crossed by **99.50%** of dice careers at **median
  day 55**; the median career finishes at **171 games**. Tier 5 carries **53.04%** of all hands — the
  top rung is the *default state* of a dice career, not its endgame, so it does **not** go the way of
  Explore's band-4. **Bounded, and said so:** seven of eight shipped policies play **zero** hands
  (`planDare` has one call site, `gamblerPolicy`), so this is the maximal playstyle, not a typical
  one. The analytic read-across is given (`day 80/k` at `k` hands/day; measured 1.415/day).
- **Archetypes (§12.2) — the verdict comes back INVERTED.** Player win rate **84.69%** vs `optimal`
  (n 42,494) and **68.78%** vs `bad` (n 9,054): **z = −30.76**, replicated independently in Arm 1 at
  z = −12.88. `optimal` (84.69%) is softer than the *undesigned* roaming dealer (76.91%). Not
  cosmetic — backwards. Mechanism traced to F-137-1's guaranteed-true opener, not to `archetypeMove`.
- **Pool share (§12.3) — the opposite of the fear.** The 42-seat gauntlet takes **57.04%** of hands
  (72.62% in days 1-30, decaying to 47.89% by days 61-120) because `planDare` seats the *richest*
  candidate and roster bankrolls out-bank roaming captains early. But it is **played, not
  completed**: median **29 of 42** seats beaten, **3 of 14** ports cleared, **0 grand slams in 720
  careers**, and median **0** seats drained.
- **Tier shape (§12.4, discharging F-146-2).** Like-for-like inside the roaming pool (T-137's 1.19
  was 100% roaming × 100% tier 0): **1.527 → 2.194 bids/hand, +43.7%**. Mean frozen `bandMax`
  1,248 → 3,541 cr (2.837×) and mean ante 37 → 106 cr (2.86×) — both just under ×3 because tier 4 is
  reached at a different port mix. All 54,047 tier-5 hands carry `bandMax: null`.
- **`netCredits` split (§12.5).** roaming **39.77%** / roster **60.23%**, reconciling exactly to
  `hangoutPlay.netCredits`. §2.6's cap **summed from the table = 280,800 cr, AGREES with the prose**;
  realised draw 2.58% (day 30) → 8.89% (day 60) → **20.24%** (day 120).
- **Interceptor (§12.6) — F-137-2 got BETTER.** Wronged-captain share **47.50% → 26.19%** (back
  below T-125's 29.28%) and the lift over uniform **2.623× → 2.875×** (back toward T-125's 2.956×) —
  exactly the fall-back §16.6 warned not to read as a regression. Mechanism split by pool as §7.6
  requires: 57.55% of hands are roster hands that move **zero** disposition, and the win rate fell.
  `DispositionChanged{dare}` 13,758 → **7,949** off a third *more* hands; souring share 94.08% →
  **75.78%**.
- **CONQUEROR (§12.7).** **Unreached at 120 days by every policy, dice or not.** `gambler` deedCount
  median 25 → **28** (max 34 at n=1,000, GIGA_HERO 129, CONQUEROR **0**); controls `veteran` 20,
  `trader` 20. Reported, not retuned — the threshold was sized off a **300-day** arm this rig does
  not run.

**Five findings filed, NOT fixed (§12.9): F-148-1** (archetype ordering inverted; `optimal` is the
softest seat) · **F-148-2** (the gauntlet is played but never completed; `liars_dice_grand_slam`
unreachable through the sim's seating policy) · **F-148-3** (the roster is the softer *and* richer
pool) · **F-148-4** (F-146-1 confirmed with exact scope — the raised ceiling is never staked into;
fixing it needs a §4.6 amendment first, since it would be a third `liarsDiceTier` read) ·
**F-148-5** (CONQUEROR unreached at this horizon). §12.9 also carries a table of **ten levers
considered and deliberately left alone**, each against the number that tempted it:
`LIARS_DICE_UNLOCK_GAMES`, `LIARS_DICE_RAISED_CEILING_MULT`, `planDare`'s richest-candidate rule,
`planDare`'s tier-0 band sizing, `dealerMove`/`DARE_AI_*`, `BAD_CREDULITY`+`archetypeMove`, the four
tone mixes, the 42-row bankroll table, `RENOWN_DEED_THRESHOLDS.CONQUEROR`, `GAMBLER_MAX_DARES_PER_DAY`.

**What was NOT tuned (§12.8).** `git diff --stat -- packages/engine/src packages/content/src
packages/sim/src/index.ts packages/sim/src/protocol.ts packages/sim/src/balance packages/ui/src`
→ **zero files, zero lines**. The only shipped-source line changed is the baseline path string at
`balance-targets.test.ts:103`. One assertion was **ADDED** (never widened) at
`balance-smoke.test.ts` — `provenance.spreadSource === 'harvested'`, F-146-0's explicit ask, so an
extract that silently drops `--aggregate` fails loudly instead of surviving a milestone **without
moving a fingerprint**; the pre-existing enum assertion stayed, because it documents the enum's
legal range and the new one documents the committed rig's state. Both test files are outside all
three hashed corpora. The `it.fails` trader tripwire stays correctly **RED** (day 21 vs [22,30] at
n=990, identical to the outgoing baseline); the two combat-survival tripwires stay red. No band,
threshold, fingerprint or golden was edited.

**Gate:** `npm test` **exit 0 — 1,918 tests, 95 files, zero failures** · `npx tsc -b` 0 ·
`npm run lint` 0 · `npm run format:check` 0.

**Deliverable grepped at its named call site:** `grep -n "^## §12" docs/LIARS-DICE-PROGRESSION_SPEC.md`
→ line 1495; `grep -rn "baseline-t148-roster-ladder" packages docs` → the test path re-pin plus the
four doc pins; `jq '.provenance' docs/balance/smoke/tiers.json` → `sweepLabel t148-roster-ladder`,
`runs 8000`, `spreadSource harvested`.

**Delivered (2026-07-31):** Shipped `docs/LIARS-DICE-PROGRESSION_SPEC.md` §12, the capstone
measurement addendum that extends T-137's discipline to the full roster and unlock ladder off a
fresh 8,000-row `t148-roster-ladder` sweep: rung-5 pacing (99.50% of careers cross it by median day
55, tier 5 carrying 53.04% of hands), an archetype verdict that comes back inverted (`optimal` is
softer than the undesigned roaming dealer, z = −30.76), pool share (the 42-seat gauntlet takes
57.04% of hands but is played, not completed — 0 grand slams in 720 careers), tier-shape and
`netCredits` splits, an interceptor re-read, and CONQUEROR still unreached at 120 days. Five
findings (F-148-1..F-148-5) were filed and left unfixed, and a table of ten tempting levers was
recorded as deliberately left alone. Deliberate scope boundary: no constant was retuned to chase a
target — `git diff --stat` over all shipped-source packages is zero files, zero lines, with the
only production-facing change being the baseline path re-pin and one added (never widened) test
assertion; the CONQUEROR read stays bounded to this rig's 120-day horizon rather than being
re-sized to the 300-day arm that would actually exercise it.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading `docs/LIARS-DICE-PROGRESSION_SPEC.md` (§1, §2.6, §3.9, §4.4/§4. · attempts=1/4.

---

## M4f — D3: gate the NPC Hangout faucet on `hasHangout`

Owner ruling (D3, via `/bakeoff`, 2026-07-31): ship the gate now, defer closing the mint. This was
decided in the FIRST audit pass of this session but never actually scheduled as a task — logged
here so it isn't lost. Independent of every other M4* task; can run any time after T-125.

### T-149 · The rumor mill knows where the bars aren't — `status: DONE` · `coder: opus` · `after: T-125`

`executeSocialize` (`packages/engine/src/npc.ts:1824`) never reads `hasHangout`, so its "cleaned up
at the {system} Hangout tables" / "bought a round at the {system} Hangout tables" flavor text
(`npc.ts:1845,1851`) feeds the player-facing rumor mill (`hangoutRumors`, `actions/hangout.ts:62`,
whose rumor lines interpolate the NPC's `lastAction.details` verbatim)
at 18 of 28 ports that the game's own UI tells the player have no bar. Add a
`STAR_SYSTEMS[npc.currentSystemId]?.hasHangout` read before the roll; on `false`, still roll the
same GUILE check (preserves the verb⟺StatCheck invariant) but emit new non-Hangout flavor text
naming no venue (e.g. "swapped stories at the {system} docks" / "drank alone at {system}, poorer
for it"). **Do not touch the credit mint itself** (`NPC_SOCIALIZE_WIN_CREDITS`/`LOSS_CREDITS`) —
three independent bakeoff reviewers measured it at <0.3% of NPC wealth by day 120, not worth the
architectural cost of breaking `resolveNpcDay`'s deliberately single-NPC-mutation model to make it
zero-sum. This task is the fiction fix only.

**Accept:** `executeSocialize` never narrates a Hangout at a `hasHangout: false` system (asserted
by a test); the GUILE check still fires unconditionally (the verb⟺StatCheck invariant holds); no
change to the credit amounts or the check's win/loss thresholds; no per-system engine branch (a
single boolean read, not an `if (systemId === ...)` ladder); gate green.

**Delivered (2026-07-31):** `executeSocialize` (`packages/engine/src/npc.ts`) now reads a single
`STAR_SYSTEMS[npc.currentSystemId]?.hasHangout` boolean above the existing Socialize (GUILE) roll
and branches only the flavor text: at a `hasHangout: false` port the win/loss lines become
"swapped stories at the {system} docks" / "drank alone at {system}, poorer for it", naming no
venue, while `hasHangout: true` ports keep the original "cleaned up at the {system} Hangout
tables" / "bought a round at the {system} Hangout" lines — since `hangoutRumors`
(`actions/hangout.ts`) interpolates `lastAction.details` verbatim into the player-facing rumor
mill, this closes the fiction contradiction at the six reachable bar-less rim ports (Antares-5,
Capella-4, Polaris-1, Mizar-9, Achernar-5, Algol-2). The roll itself sits above and outside the
`hasBar` branch on purpose, so the verb⟺StatCheck invariant holds and both branches pay the
identical `NPC_SOCIALIZE_WIN_CREDITS`/`LOSS_CREDITS` mint. Six new tests in `npc.test.ts` cover
both outcome branches on both port sets, the non-vacuous-port-set precondition, and the
single-boolean-not-a-ladder shape. Scope boundary, deliberate: the credit mint itself
(`NPC_SOCIALIZE_WIN_CREDITS`/`LOSS_CREDITS`) is untouched — three independent bakeoff reviewers
measured it at <0.3% of NPC wealth by day 120, not worth breaking `resolveNpcDay`'s
single-NPC-mutation model to zero out; this task is the fiction fix only, and the 150cr socialize
ante rides the T-150 parity-ledger re-ask instead.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading `npc.ts` `executeSocialize`, `actions/hangout.ts` `hangoutRumor · attempts=1/4.`

---

## M4g — D5: the levers T-125 left on the desk

Owner ruling (D5, 2026-07-31): extract this out of "deferred, no task" limbo into a real, properly
gated task, so T-130 itself can close even though the actual measurement can't run yet. Of T-125's
original four levers, two are ALREADY discharged by other tasks in this same set — **F-101-4**
(surfacing befriend/meet/insult) by **T-132**, and **the NPC Hangout faucet** by **T-149** — so
only two remain live here.

### T-150 · Re-measure post-fix, and put the named-pool gate to the owner — `status: DONE` · `coder: opus` · `after: T-131, T-132, T-133, T-137, T-148, T-149`

Gated after every fix/build task in M4a–M4f so it cannot run until the tree actually reflects all
of them — this IS the "hold until green" deferral D5 named, just expressed as a dependency instead
of prose. Three things, in order:

1. **F-116-1** — `explorerPolicy` (`packages/sim/src/index.ts`, the Explore-queuing branch) queues
   Explore actions without checking `state.player.recovery`, producing a measured 22.5% guaranteed
   `recovery-in-progress` refusal rate. Add the check before queuing. One line, per the finding's
   own sizing.
2. **F-123-3** — **check whether this is still applicable before touching it.** As filed, it was
   `planDare` picking the richest dealer once off dawn state, so a second hand of the day could be
   a zero-stake wager if that dealer's purse drained in the first hand. **M4d/M4e replace the
   single-check Dare's dealer-pick flow with the Liar's Dice resolver entirely** — if the sim's
   equivalent dealer-selection logic for a Liar's Dice hand has the same shape (pick once off dawn
   state, no re-check), re-derive the fix against the NEW resolver; if the new resolver's shape
   already avoids it, say so and close the finding as moot rather than patching code that no longer
   has the bug.
3. **The 0.25 named-pool interceptor gate** (`travel.ts:389`) and `DISPOSITION_DECAY_INTERVAL_DAYS
   = 3`. T-125 itself ruled this a DESIGN QUESTION, not a tuning knob — **this task does NOT change
   either constant.** Re-run the balance capstone now that the faucet is gated, the Hangout UI
   speaks, Explore's recovery model changed, and the Dare is Liar's Dice, and report the fresh
   named-pool/decay numbers as a NEW finding for a fresh owner ruling — the same "measure, then
   hand the ruling back" shape as every other lever in this track. The same report RE-ASKS the
   two vacated PARITY LEDGER rows (owner ruling at T-130: deferred until exactly this moment) —
   restate the cast question against the systems as they now are, with the fresh numbers beside
   it, for the owner to rule on; this is what un-gates **N8** and the N-series resumption.

**Accept:** F-116-1 is fixed and a test asserts the sim no longer queues an unpayable Explore;
F-123-3 is either fixed against the real (possibly new) dealer-selection code path or explicitly
closed as moot with the reasoning stated, not silently dropped; a fresh capstone dataset exists and
the named-pool/decay question is restated with current numbers, still unruled (owner's call, not
this task's); no constant is retuned to chase a target; gate green.

**Result.** Delivered as **two fixes, one 8,000-row capstone and three write-ups**:
`docs/EXPLORE_REDESIGN.md` **§10** and `docs/HANGOUT_REDESIGN.md` **§11** (both dated 2026-08-01),
plus the ledger and baseline updates in `docs/NPC_REDESIGN.md`.

**What was delivered.**
1. **F-116-1 — CLOSED, FIXED.** `explorerPolicy`'s Explore loop now carries
   `state.player.recovery === null` as a term of its `while` condition, mirroring the engine's
   `ExplorationFailed{'recovery-in-progress'}` refusal onto the path `runCampaign` actually takes
   (`sim/protocol.ts`'s `legalActions` already had the gate, but the runner never calls it).
   Scoped to the Explore QUEUE, not the policy, so a recovery day still trades, refuels, hires and
   remits. **§9.7's 22.5% was NOT restated** — owner ruling D1 moved bands 3-4 off calendar
   recoveries, so `player.recovery` now governs band 2 alone and the rate was re-measured against
   the current model: **3,204 of 23,858 queued Explores landed on a recovery dawn before, 0 of
   101,557 after**, and the guaranteed-refusal rate against queued Explores halves 14.46% → 7.85%.
2. **F-123-3 — CLOSED, FIXED, and applicability CHECKED rather than assumed.** It was NOT moot:
   M4d/M4e replaced the HAND, not the DEALER PICK, and both T-145's own parameter doc and
   `docs/LIARS-DICE_REDESIGN.md` §16 record the ROAMING case as surviving the redesign. Fixed by
   the finding's option A — `planDare` takes a `committedStakes` map and the roaming loop reads the
   dealer's purse net of stakes already queued against them, the same worst-case convention the
   caller applies to the player's own purse. Option B (`GAMBLER_MAX_DARES_PER_DAY`) was refused as
   a pacing change by fiat, per PROGRESSION §12.9.
3. **The capstone.** `docs/balance/baseline-t150-postfix.json`, baseline of record re-pinned in all
   four places.

**The gate work, in order.** `npm run format` FIRST (every file unchanged; **not** re-run
afterwards — only markdown was touched after the capstone, and markdown is in no fingerprint
corpus) → 8 **1-indexed** shards → `--merge` printing **`wrote aggregate for 8000 rows`** →
`balance:diff` with the moved set **written down before the run** → one `--aggregate` extract
printing **`spreads harvested`**. **The prediction held exactly: MOVED = `{explorer, gambler,
fleet}`; `trader`, `trader-degraded`, `fighter`, `veteran`, `smuggler` and `greedy` came back
byte-identical.** Fingerprints, verified against a `git worktree` at the parent commit rather than
asserted: **rules `30956ac30326f246` UNMOVED** (this task edits no engine and no content source;
the move away from T-148's recorded value belongs to T-149), **instrument
`c80ebc59869406bb` → `342e248189f7ac34` MOVED** (`sim/src/index.ts` is inside the instrument
corpus — the "stale fixture gets a new capstone" case that forced the fixes and the capstone into
one task), **docs MOVED** (raw bytes; informational, never a failure).

**What it measured.** Named-pool share **25.07%** against the analytic 25.00%; inertness
**71.52%** of named draws; wronged-captain share **9.61%** against a uniform **4.075%** — a
**2.358×** lift, all like-for-like against HANGOUT §10.4's AFTER column and unmoved by everything
M4a–M4f shipped. Decay: the cast sits at exactly 0 on **96.52%** of live captain-days, a nonzero
standing survives a **median of 3 days** (one decay interval), and decay outruns interaction
**1.53 : 1**. The `gambler` arm is the existence proof the system is reachable — 41.46% inertness
and a 2.806× lift. Zero-stake hands: **0 of 101,791**, reported as **`< 1/101,791`** and never as
0.00%, with the honest finding recorded that **T-145's two-pool candidate set, not this fix, is
what collapsed the rate** — the fix is preventive and structural, and `expectedValuePerDare` did
not measurably move.

**Findings filed, not fixed.**
- **F-150-1** (`HANGOUT §11.3`) — the **0.25 named-pool gate** and **`DISPOSITION_DECAY_INTERVAL_DAYS
  = 3`** read together, with the numbers above and a **levers-not-pulled table** in PROGRESSION
  §12.9's shape (four levers, each against the number that tempted it). **Stated as a DESIGN
  QUESTION, not a tuning knob — T-125's own ruling. NEITHER CONSTANT CHANGED.**
- **F-150-2** (`EXPLORE §10.3`) — `smugglerPolicy` carries a byte-identical unguarded Explore loop
  (**3,891 of 23,192 queued on a recovery dawn, 17.90% refused**). The fix was written, **measured,
  and backed out**: it re-seeds that policy's stream onto a PRE-EXISTING five-day stall in the
  SHARED `planPacifistCombat` (seed 3, Sirius-16, days 45-49 — one interceptor escalating rounds
  2 → 10 while the tribute climbs 2,000 → 10,000 against a 1,071cr purse, five consecutive `run`
  stances), which trips the poverty-trap invariant. The stall is not an Explore problem — the
  policy returns at `if (state.encounter)` long before that loop. Root-fixing it means editing a
  planner five policies share, which would move every fingerprint and destroy this task's own
  containment claim. **Pinned by an explicit tripwire test so it cannot be closed by accident.**
- **The two PARITY LEDGER re-asks** (`HANGOUT §11.4`, `EXPLORE §10.4`) — restated against the
  systems as they now are, with the three defects deferred alongside the VisitHangout row
  re-measured: the faucet is **+3.44cr/captain-day** and **0.22%** of terminal NPC wealth (D3's
  "under 0.3%" verdict re-measures and stands); the off-Hangout Socialize share is **37.97%**, i.e.
  **T-149 fixed the FICTION, not the VERB**; and the **150cr ante** locks out **17.49%** of live
  captain-days, five-sixths of that from the undocumented inline `+ 50`. **Both rows LEFT UNRULED —
  owner's call, not this task's.**

**D5 is discharged.** All four of its levers are now accounted for: F-101-4 shipped at T-132, the
NPC faucet was gated at T-149, and the remaining two (the 0.25 gate + decay interval, and F-123-3)
are respectively re-filed as F-150-1 for a fresh owner ruling and fixed here. **N8 un-gates on the
owner's ruling, not on this task** — no N-series task's status was changed.

**What was NOT tuned.** `git diff --stat` over `packages/engine/src`, `packages/content/src` and
`packages/ui/src` is **zero files, zero lines** (asserted, not claimed). The only shipped-source
diff is `packages/sim/src/index.ts`, the baseline path re-pin and new tests.
`CURRENT_SAVE_VERSION` is unmoved and **no migration is owed** — both fixes are sim-policy-only and
touch no save shape, stated explicitly because the absence of a migration is a claim here, not an
omission. Two `campaign-degraded.test.ts` fingerprints were re-pinned (`explorer`, `gambler`) with
a dated entry naming the cause of each and the five rows that did not move — never by widening an
assertion. The three known-red `it.fails` tripwires were not touched and are still correctly red.

**Gate:** `npm test` **exit 0 — 1,929 tests, 95 files, zero failures** · `npx tsc -b` 0 ·
`npm run lint` 0 · `npm run format:check` 0.

**Deliverable grepped at its named call site:** `grep -n "player.recovery" packages/sim/src/index.ts`
→ the term inside `explorerPolicy`'s Explore loop; `grep -n "committedStakes" packages/sim/src/index.ts`
→ `planDare`'s signature, its roaming loop and the `gamblerPolicy` call site;
`grep -n "^## §11" docs/HANGOUT_REDESIGN.md` and `grep -n "^## §10" docs/EXPLORE_REDESIGN.md` → the
two appendices; `grep -rn "baseline-t150-postfix" packages docs` → the test path re-pin plus the
three doc pins and the aggregate; `jq '.provenance' docs/balance/smoke/tiers.json` →
`sweepLabel t150-postfix`, `runs 8000`, `spreadSource harvested`.

**Delivered (2026-07-31):** Both fixes from T-125's four-lever list shipped with tests —
`explorerPolicy` now halts its Explore queue on `state.player.recovery`, and `planDare`'s
roaming dealer pick reads a `committedStakes` map instead of a stale dawn-state purse — plus a
fresh 8,000-row post-fix capstone (`docs/balance/baseline-t150-postfix.json`, re-pinned in all
four places) that restates the named-pool/decay numbers and the two vacated PARITY LEDGER rows
for a fresh owner ruling, and files a twin defect (F-150-2) discovered along the way. Deliberate
scope boundary: the 0.25 named-pool gate and the 3-day decay interval are measured and reported,
never retuned — T-125 ruled that a design question, not a tuning knob, and this task does not
relitigate it; F-150-2's own root fix (editing the five-policy-shared `planPacifistCombat`) was
written, measured, and explicitly backed out rather than shipped, to avoid moving every other
policy's fingerprint.

Orchestration: graphify=none — no `graphify-out/graph.json` in the repo root (checked; absent), so I oriented by reading `TASKS.md` (T-131/T-137/T-148/T-149/T-150 blocks + D1/D2/D3/D5 · attempts=1/4.

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

---

## M6 — Player-modifying trinkets (new initiative, out of D2's scope, no implementation yet)

Owner ruling (2026-07-31): GUILE came up as a candidate for "investable" during the Liar's Dice
design pass (D2), but every player stat (`PILOT`/`GUNS`/`TRADE`/`GRIT`/`GUILE`) is rolled once at
character creation and never mutated anywhere in the shipped engine — verified by grep, zero
writes to `player.stats[...]` outside `createInitialState`. The owner does not want a
GUILE-only fix bolted on in isolation while every other stat stays frozen; this deserves its own
complete design pass — rings, headbands, trinkets, and similar wearables that shift ANY player
stat up or down, not just GUILE. **This milestone schedules the DESIGN step only. No
implementation task exists yet** — what ships, if anything, is whatever this bakeoff and spec
settle on.

The closest existing precedent, worth citing to whichever coder/reviewer takes this: Explore's
unique-item framework (`docs/EXPLORE_REDESIGN.md` §4, `packages/engine/src/exploreOutcomes.ts`
`applyUniqueItem`) already splits a granted item into Class-A (bounded ship-ELEMENT deltas —
component strength, maxFuel, cargo pods) and Class-B (a die-effect hook, `DiceBenefit`). A
player-stat trinket is the same SHAPE of problem — a bounded delta to a named, engine-owned
quantity — one class-A/class-B step removed from ship components to character stats. Ruling 2
from this track's own header ("no new check-level modifier surface") was scoped to the Explore
item system specifically; whether it also constrains a stat-trinket design, or whether a
stat-modifying trinket IS the second surface ruling 2 explicitly reserved for "a fresh owner
call," is exactly the kind of question this bakeoff should surface, not assume.

### T-151 · Bakeoff + spec: player-modifying trinkets — `status: TODO` · `coder: opus` · `after: T-130`

Run `/bakeoff` (or the coder's own equivalent independent-review process) on: what a trinket
slot/economy looks like (how many worn at once, where they're found/bought — Explore items,
Shipyard, a new Hangout venue, quest rewards), the bounds on a stat delta (a ±1-2 range, mirroring
how ship-component deltas are bounded, vs. something else), whether ALL five stats are equally
in-scope or some are deliberately excluded (does a GRIT trinket collide with anything
`packages/engine`'s combat/life-support math assumes about GRIT being fixed?), and the exact
engine/content split (a new `ExploreItemDefinition`-adjacent shape, or its own table). Produce a
settled spec (`docs/PLAYER-TRINKETS_SPEC.md` or an addendum to an existing one) — this task does
NOT implement anything.

**Accept:** the bakeoff's independent reviews, agreement table, and (if a simulable subsystem
exists) any measured comparison are reported per the skill's own reporting order; the spec settles
slot count, delta bounds per stat, acquisition path, and the engine/content split with no open
question left for an implementer; whether this needs a save-shape change is stated explicitly; NO
engine/content/UI source file is touched by this task, per the skill's own "never implement during
steps 1-3" rule; the design verdict and its blast radius are handed back to the owner for a
ruling, not decided by the task itself.

## M7 — Testing strategy: the sweep as a gate, an owner ruling on N13, and a UAT checkpoint before the LLM pilot

Sequenced per `docs/TESTING-STRATEGY.md` Part G (2026-07-31 addendum): the cheap, mechanical,
already-spec'd testing-infra work (T-152, T-153, T-157) runs first and protects everything else
from silently regressing. Two genuine human decisions sit after it, each a hard gate per the
skill's `[BLOCKED BY = ...]` convention — neither is this track's to decide, and the run halts at
each rather than guessing: **T-156** is `NPC_REDESIGN.md`'s own N13 ruling, explicitly recorded as
"the owner's, made at step start and recorded here — not drifted into" (`NPC_REDESIGN.md:1477-1479`)
— it is not new scope, just scheduled here so it isn't skipped. **T-158** is the owner's first UAT
pass, which Part G's own analysis says neither the sweep nor an LLM pilot can substitute for. T-154
and T-155 (the native LLM pilot) are resequenced to run **after** T-158, not before — Part G's
recommendation #6: the owner's own first UAT is a better first Tier-2 pass than a cold LLM run, and
funding the pilot before knowing what a human finds risks measuring the wrong thing.

### T-152 · Build: fold sweep invariants into a pass/fail gate — `status: TODO` · `coder: opus` · `after: T-130`
Take the invariant set already used in the T-1604a UGT campaign (`docs/playtests/T-1604a-ugt-campaign.md` §4 — credits floor, no-negative-cargo, and the rest of the 8) and wire them into `packages/sim/src/balance/sweep.ts` as hard assertions the sweep run itself fails on, not just numbers it reports. Add a statistical-anomaly check for any event whose expected rate is known (e.g. an encounter type expected at ~30% reading 0% across a full shard) so a probability regression fails the run instead of silently changing the reported baseline. Wire this sweep-as-gate into CI (or document why it's too slow for CI and instead into a scheduled/nightly job) so Tier-1 coverage (`docs/TESTING-STRATEGY.md` Part D) runs without a human remembering to invoke it. This task builds the mechanism only — T-153 proves it works.
**Accept:** `sweep.ts` contains a named assertion function per invariant, each grep-able by name; an expected-event-rate table with named thresholds exists for the anomaly check; a CI workflow file or documented scheduled-job config invokes the gate.

### T-153 · Validate: prove the sweep gate catches known regressions — `status: TODO` · `coder: opus` · `after: T-152`
Build one seeded-bad fixture per invariant class from T-152 (e.g. a synthetic state with negative credits, a synthetic event log reading 0% against an expected ~30% rate) plus one clean/current-state fixture, and write a committed, automated test suite that runs the gate against all of them. This suite is permanent — it runs as part of `npm test` going forward, so the gate's own correctness is continuously re-verified rather than confirmed once and trusted forever. Also confirm the CI/scheduled wiring from T-152 actually executes the gate script (a dry run or CI log), not merely references it.
**Accept:** a committed test file (e.g. `packages/sim/src/__tests__/sweep-gate.test.ts`) asserts every seeded-bad fixture fails the gate (non-zero exit / thrown assertion) and the clean fixture passes (zero exit); this test file runs under `npm test`; CI/scheduled-job evidence (log or dry run) shows the wiring from T-152 actually fires, not just exists.

### T-157 · Coverage-matrix gate: cross-check sweep archetypes against verb parity — `status: TODO` · `coder: opus` · `after: T-153`
Per `docs/TESTING-STRATEGY.md` Part C, the sweep's 8 policies (trader, trader-degraded, fighter, explorer, veteran, smuggler, gambler, greedy) each have a defining verb, and two of them (fighter → Combat's chosen branch, explorer → Explore) currently have no real NPC parity per `NPC_REDESIGN.md`'s Parity Ledger. Build a small script/test that cross-references each sweep archetype against its defining verb's current parity status and fails or emits a named warning when a headline verb isn't marked Shipped, so "is archetype balance actually tested" is something CI asserts instead of something re-derived by reading two documents side by side. Wire it into the same gate as T-152/T-153.
**Accept:** the check is committed and runs under `npm test` or the sweep gate; it fails/warns (documented which) for `fighter` and `explorer` against the parity status as of this task; it passes cleanly for `trader`, `trader-degraded`, `veteran`, `smuggler`, `gambler`, `greedy`; the parity-status source it reads from is named so it can be kept current as `NPC_REDESIGN.md`'s ledger changes.

### T-156 · Build: N13 dawn-hand parity — the algorithmic virtual hand — `status: TODO` · `coder: opus` · `after: T-130`
Owner ruling recorded 2026-07-31 (`NPC_REDESIGN.md` N13 section and STATUS BOARD): design **(b)**, the algorithmic equivalent. Keep the NPC's one-verb day; derive the day's quality from a virtual hand drawn under the same RNG discipline the player's hand uses, with N5's proficiency lever (`PilotDegradationProfile`, once N5 lands) expressed as allocation noise on that virtual hand. Flag the virtual-hand function at its definition site as the one sanctioned abstraction in the parity design — a comment or doc-block making clear it is a MODEL of the decision, not the decision itself, so it doesn't get mistaken for real parity later. `Crew` and `Reroll` stay player-only as a **ruled exclusion**: update THE PARITY LEDGER in `NPC_REDESIGN.md` to record both rows as excluded-by-ruling rather than open gaps. This task is **not gated on N12** (port-buying) — the run order in `NPC_REDESIGN.md` sequences N12 before N13 for measurement-sequencing reasons, not a technical dependency; the virtual-hand mechanism doesn't read NPC port state. Simulate per the doc's own spec: full sweep + per-captain outcome variance decomposition (verb-weight luck vs. skill).
**Accept:** the virtual-hand function exists, is grep-able, and is flagged at its definition site as the sanctioned abstraction; `NPC_REDESIGN.md`'s PARITY LEDGER records `Crew`/`Reroll` as ruled exclusions (not TODO/gap rows); a sweep-based capstone reports the variance decomposition per the doc's "Simulate/Proves/Disproves" spec, with the result (proved or disproved) reported plainly either way; gate green.

### T-158 · CHECKPOINT — human UAT, plus a recorded ruling on Combat's chosen branch — `status: TODO` · `coder: sonnet` · `after: T-150, T-153, T-157, T-140, T-141` · `[BLOCKED BY = Human UAT]`
Per `docs/TESTING-STRATEGY.md` Part G: neither the sweep nor an LLM pilot can judge whether pacing or dice-tension *feels* right, and `docs/RELEASE-CHECKLIST.md` already states "nobody has played this build end to end yet." Automated preparation: confirm the build is green, confirm T-140/T-141 (decision tracing, opt-in playtest logging) are wired and active so the owner's session produces a reviewable log rather than only an impression, and assemble a short pre-UAT brief naming what's known-uncovered going in (Combat's chosen `executeCombat` branch is still an abstract GUNS check with 0 modeled deaths per `NPC_REDESIGN.md`'s Parity Ledger; Explore/VisitHangout have zero fleet coverage; N13's status per T-156). Then halt for the owner's own UAT pass, and — per Part G item 4 — a deliberate, recorded ruling on Combat's chosen branch, even if the ruling is "not fixing the model this pass." This is a hard gate: T-154/T-155 (the native LLM pilot) are sequenced after it and must not start until it closes.
**Accept:** (human-checked) the pre-UAT brief is committed; T-140/T-141 confirmed active; the run halts with this task `BLOCKED`, never self-approved; closes only once the owner has both played a UAT pass and recorded a Combat-branch ruling (fix, defer, or accept-as-is all count as a ruling).

### T-154 · Build: native LLM pilot policy for the player seat — `status: TODO` · `coder: opus` · `after: T-158`
Implement a `SimPolicy` (or a driver against `packages/sim/src/protocol-stdio.ts`) that has an LLM pick the player's actions each day from the real legal-actions list, in-repo — no dependency on the external UGT package. Reuse the adapter discipline from `packages/sim/PROTOCOL.md`: an unmapped/illegal action must be rejected, never fabricated. Log state deltas per action (mirroring T-1604a's JSONL shape) so a run's findings are reviewable after the fact. Note the bridge-blind-spot risk recorded in the UGT after-action report (`/Users/vs7/Dev/Games/_UGT Universal Game Tester/AFTER-ACTION-REPORT.md` §Addendum): a protocol/state-level driver like this one cannot see UI-only bugs (a real browser/DOM-level check is a separate, still-open need, not covered by this task). This task builds the driver only — T-155 proves it's trustworthy before it's relied on.
**Accept:** the driver runs against the real engine via the protocol seam and produces a reviewable action/state-delta log; illegal-action attempts are rejected and logged, never silently applied; a short README documents how to invoke a run and states plainly that this covers protocol/state-level behaviour only, not the UI.

### T-155 · Validate: run the pilot end-to-end and confirm it's trustworthy — `status: TODO` · `coder: opus` · `after: T-154`
Run the T-154 driver for real: at least 30 simulated days across at least 3 seeds. Confirm zero illegal/fabricated actions were accepted and zero crashes or hangs occurred. Then run one seed twice, independently, and confirm the two runs produce identical action sequences (the same determinism check T-1604a used on the UGT side) — an audit tool that isn't reproducible can't be trusted to diagnose a regression later. If any part of the pipeline is inherently nondeterministic (e.g. the LLM call itself), the run log must document exactly what's pinned/replayable and what isn't, rather than silently passing on a lucky match. Only once this task's Accept criteria are met does M7 close; update Part D of `docs/TESTING-STRATEGY.md` with the confirmed cadence and the exact command to invoke a run.
**Accept:** a committed run artifact (e.g. under `docs/playtests/` or a `packages/sim` output path) shows ≥30 days × ≥3 seeds completed with zero illegal actions and zero crashes; a same-seed determinism check shows two independent runs producing identical action sequences, or the run log explicitly documents which part of the pipeline is nondeterministic and how that's bounded; `docs/TESTING-STRATEGY.md` Part D updated with the confirmed cadence and invocation command.
