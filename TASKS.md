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

### T-102 · Spec consistency check — do the two specs honour the rulings, and do they collide? — `status: TODO` · `coder: opus` · `after: T-101`

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

### T-112 · The unique-item effect surface — `status: TODO` · `coder: opus` · `after: T-111`

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
