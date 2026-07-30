# Explore Redesign — the engine/content framework and the time cost

**Status:** SPECIFICATION (T-100, 2026-07-30). This document is the source of truth for the
M2 milestone of the 0.5.2 track (`TASKS.md` T-110 … T-116). **It is a spec, not an
implementation** — T-100 changed no engine, content, sim or UI source file.

**It builds on THE THREE DESIGN RULINGS** recorded in `TASKS.md` (owner, 2026-07-30). Two of
them govern this document and are **not re-opened here**:

- **Ruling 1 — Explore recovery costs CALENDAR DAYS.** Starting a salvage op occupies N
  future days, N scaling with the outcome's power. §3 specifies the mechanics.
- **Ruling 2 — a unique item's die effect uses the EXISTING, SHIPPED-EMPTY hook**
  (`DiceBenefit` / `EQUIPMENT_DICE_BENEFITS`). No new check-level modifier surface. §4
  specifies the mapping and reports the one cost the ruled option carries.

**Both rulings were checked against the source before being specified and both are
workable.** Ruling 1 needs one additive nullable field plus one dusk predicate. Ruling 2's
hook is live, injectable and folds through the same three accumulators as the crew roster;
its only cost is a bounded id-namespace constraint, recorded as **Finding F-100-1** in §6
rather than routed around. Neither is documented with an alternative design, because neither
proved unworkable.

**Companions:** `docs/PRD-REIMAGINED.md` (design intent, §7.2 off-lane exploration),
`docs/VERSIONING.md` (save versions §2, `rulesFingerprint` §3), `docs/BALANCE-POLICY.md`
(governance), `docs/NPC_REDESIGN.md` (the vacated Explore ruling — the audit input this spec
answers), `docs/HANGOUT_REDESIGN.md` (the sibling spec, T-101).

**The four things this document settles, each with a named design:**

| § | Question | The named design |
| --- | --- | --- |
| §2 | The outcome taxonomy | **The value-headed outcome row** |
| §3 | The multi-day recovery | **The anchored single-slot recovery** |
| §4 | The effect surface | **Two effect classes and a bounded module tier** |
| §5 | The value ladder | **`valuePoints` → band → everything** |

---

## §0 · Symbol conventions — how to read the code in this document

Every backticked identifier in this document is one of two things, and the two are never
mixed:

1. **An EXISTING symbol.** It resolves in `packages/*/src` today. Every one was grepped
   while writing this spec. Two are worth flagging because a grep finds their definition but
   no `export`:
   - `applyEffects` (`packages/engine/src/storylets.ts:316`) is **module-private**. §2 asks
     T-110 to export it; that export is behaviour-preserving and inert.
   - `SPECIAL_EQUIPMENT_TABLE` (`packages/content/src/upgrades.ts:150`) is **module-private**
     — deliberately, so the `as const` exists only to derive `SpecialEquipmentContentId`.
     The widened `SPECIAL_EQUIPMENT` is the public export.
2. **A PROPOSED symbol.** It does **not** exist yet; this spec names it so the downstream
   tasks do not each invent a name. Every proposed symbol appears in the table below and
   nowhere else, and every code block introducing one is labelled **PROPOSED**.

**The FIELD names of a proposed type are proposed too** — `valuePoints`, `minValuePoints`,
`wireFound`, `itemId`, `outcomeId`, `dispositionDelta`, and the `bandWeight` / `rowsInBand`
of §5.1's arithmetic do not resolve today and are not expected to. Every other field name in
this document's code blocks (`storyletId`, `delayDays`, `fragmentId`, `profileId`,
`minCredits`, `maxCredits`, `poiId`, `systemId`, `startedDay`, `dueDay`, `cargoPods`,
`maxFuel`, `component`, `strength`) is an existing one, reused deliberately.

### Proposed symbols (do not exist yet — introduced by T-110 / T-111 / T-112)

| Proposed symbol | Home | Introduced by | § |
| --- | --- | --- | --- |
| `ExploreOutcomeDefinition` | `packages/content/src/exploration.ts` | T-110 | §2 |
| `ExploreOutcomePayload` | `packages/content/src/exploration.ts` | T-110 | §2 |
| `EXPLORE_OUTCOMES` | `packages/content/src/exploration.ts` | T-110 | §2, §5 |
| `EXPLORE_VALUE_BANDS` | `packages/content/src/exploration.ts` | T-111 | §3b, §5 |
| `bandFor` | `packages/engine/src/exploreOutcomes.ts` | T-111 | §3b |
| `recoveryDays` | `packages/engine/src/exploreOutcomes.ts` | T-111 | §3b |
| `RecoveryState` | `packages/engine/src/types.ts` | T-111 | §3a |
| `PlayerState.recovery` | `packages/engine/src/types.ts` | T-111 | §3a |
| `RecoveryStateSchema` | `packages/engine/src/schema.ts` | T-111 | §3d |
| `RecoveryStarted` / `RecoveryPaidOut` / `RecoveryAbandoned` | `GameState` event union | T-111 | §3e |
| `ExplorationFailed{reason:'recovery-in-progress'}` | `packages/engine/src/types.ts` | T-111 | §3c(c) |
| `EXPLORE_MODULES` | `packages/content/src/crew.ts` (shipped) | T-112 | §4, §6 |
| `EXPLORE_MODULE_DICE_BENEFITS` | `packages/content/src/crew.ts` (shipped) | T-112 | §4, §6 |
| `ExploreModuleContentId` | `packages/content/src/crew.ts` (shipped) | T-112 | §6 |
| `EXPLORE_ITEMS` / `EXPLORE_ITEM_BY_ID` / `ExploreItemDefinition` | `packages/content/src/exploration.ts` | T-112 | §4 |
| `applyUniqueItem` | `packages/engine/src/exploreOutcomes.ts` | T-112 | §4 |
| `ShipState.exploreModules` / `ShipState.bonusMaxFuel` | `packages/engine/src/types.ts` | T-112 | §4 (F-112-A/B) |

> The three module symbols were pencilled into `exploration.ts` above and SHIPPED in
> `crew.ts` instead, beside `EQUIPMENT_DICE_BENEFITS` and the `DiceBenefit` vocabulary both
> tables are keyed on — so the whole dice axis reads in one file and `exploration.ts` imports
> the dice types rather than exporting them. Nothing else about F-100-1's recommended shape
> changed.

---

## §1 · The audit — what Explore is today

READER: this section is the baseline §2 replaces and the number T-116 re-measures against.
Every figure carries provenance.

### 1.1 The pipeline, in order

`resolveExploration` (`packages/engine/src/actions/exploration.ts`, 250 lines) is the only
resolver. In execution order:

1. **Four typed refusals**, each returning early with an `ExplorationFailed` event plus a
   `WireEntry`: `no-die` (no die assigned — **no die spent, no fuel burned**),
   `invalid-die-index`, `die-already-spent`, then — after `spendDie` — `insufficient-fuel`.
2. `spendDie(currentHand, index)` (`packages/engine/src/dice.ts:165`) burns the die.
3. `EXPLORATION_FUEL_COST = 80` (`packages/content/src/exploration.ts:43`) is subtracted
   **before** the nav check. The detour is paid for whether or not it finds anything.
4. `check(die, stats[PILOT] + navBonus(ship), EXPLORATION_NAV_DC)` with
   `EXPLORATION_NAV_DC = 12`. `navBonus` (`packages/engine/src/components.ts:170`) is the
   T-1205 nav reader — `0` on a junker fit. A `StatCheck` event is emitted either way; a
   failure returns with `ExplorationFailed{reason:'nav-check'}`.
5. **The POI type split**: `rng.next() < BEACON_DISCOVERY_CHANCE` (`0.5`) → `'beacon'` else
   `'derelict'`, then `chooseName` draws one flavour string from `POI_KINDS[type].names`.
6. A `DiscoveredPoi` is pushed onto `player.charts.discoveredPois` — the **persistent
   knowledge namespace that survives death** (`ChartsState`, carried whole by
   `applySuccession`). `PoiDiscovered` + a `WireEntry` built from
   `POI_KINDS[type].wireDiscovered` are emitted.
7. `resolveLoot` — the thing being replaced.

### 1.2 `resolveLoot` — why it is an engine branch and not a framework

`resolveLoot` reads `POI_LOOT[poi.type]` (a `PoiLootTable`) and rolls **three independent
components in a fixed order**, each its own `rng.next()`:

| leg | content shape | engine effect |
| --- | --- | --- |
| `salvage` | `SalvageLoot { chance, minCredits, maxCredits }` | `player.credits += amount`; `SalvageRecovered` |
| `fragment` | `FragmentLoot { chance, pool }` | `grantFragment(player.nemesisFile, id, poi.type, day)`; `FragmentAcquired` + `WireEntry` |
| `contraband` | `LootComponentChance { chance }` | sets `flags['signal.contraband.pending']`; `ContrabandFound` |

The three legs are **hard-coded engine control flow keyed on a fixed table shape**. A fourth
kind of payoff — an item, a questline, an NPC — is not a content row today; it is an `if`
block in `exploration.ts` plus a fourth key on `PoiLootTable`. That is precisely the failure
mode the track's standing constraint names ("if authoring the 74th explore outcome requires
an engine change, the framework is wrong"), and it is why T-110 exists.

### 1.3 The fragment pools, and the silent-return problem

`BEACON_FRAGMENT_POOL` (`packages/content/src/nemesis.ts:205`) holds 3 ids
(`frag-nemesis-02/05/08`); `DERELICT_FRAGMENT_POOL` (`:194`) holds 5
(`frag-nemesis-02/03/04/06/07`). **They overlap on `frag-nemesis-02`**, and `grantFragment`
(`packages/engine/src/nemesis.ts:66`) dedupes by id and returns `false` on a repeat — the
count is monotonic by design. So a repeat draw **emits nothing at all**: no event, no wire
line, no state change, and the player is charged 80 fuel and a die for it. This is a real
contributor to the measured return sitting below the nominal table value, and it is a
property the new framework must not reproduce silently (see §2.4).

### 1.4 The measurements that scoped the track

All from `docs/NPC_REDESIGN.md` (the vacated Explore ruling, lines 264–276, and finding 1 at
line 310), measured 2026-07-30 over 120 seeds × 120 days, fidelity-checked byte-equal to
`runCampaign` on 5 seeds before any number was believed:

| Measurement | Value |
| --- | --- |
| Fuel cost per attempt | **80 fuel ≈ 400–640cr**, plus a die |
| Nav check pass rate | **33.6%**, with the fuel burnt **before** the check |
| Expected gross salvage per attempt | **53.8cr** |
| Ablation: `explorerPolicy` with Explore removed | **richer on 101 of 120 seeds** (median finalCredits 90,135 vs 60,391) |
| Reachability of the 80-fuel gate | day-120 median captain carries **27 fuel** (p25 = 4, p10 = 0) |

**Analytic cross-check of the 53.8cr** (so the figure is not taken on faith). The salvage
band's mean is exactly `(min+max)/2` because `min + floor(rng*span)` with
`span = max-min+1` is uniform over the inclusive range. Beacon: `0.55 × (40+180)/2 = 60.5`.
Derelict: `0.80 × (120+520)/2 = 256.0`. At the even type split: `(60.5+256.0)/2 = 158.25`
per successful board, `× 0.336 = 53.2cr` per attempt. That reproduces the measured **53.8cr**
to within 1.2%, so the content tables and the pass rate together account for essentially the
whole of the measured return. §5.5 uses the same arithmetic on the proposed ladder.

**These are facts about the OLD verb.** T-116 re-measures. Re-pricing fuel or the DC is
explicitly **out of scope** (§7).

### 1.5 Where Explore is advertised

`packages/sim/src/protocol.ts` `legalActions` (the `--- Explore ---` block at line 660)
offers the action gated on `hasDie && ship.fuel >= EXPLORATION_FUEL_COST`. That gate is the
sibling site §3c(c)'s refusal must also land at, or the policies will burn actions on a
guaranteed refusal and T-116's ablation will be measuring noise.

---

## §2 · Design 1 — the outcome taxonomy

> [!IMPORTANT]
> **THE NAMED DESIGN: "the value-headed outcome row."** One shared header carrying the single
> tuning number, one discriminated payload, five engine resolvers, zero instance knowledge in
> the engine and zero rules in content.

### 2.1 The typed content shape

**PROPOSED** — illustrative TypeScript, authored by T-110 in
`packages/content/src/exploration.ts`. The shape is normative; the field comments are not.

```ts
// PROPOSED (T-110) — does not exist yet.
export interface ExploreOutcomeDefinition {
  /** Stable content id. The ONLY thing a save ever stores about an outcome. */
  id: string;
  /** 0..100 — THE ladder axis (§5). The ONLY tuning dial an author writes per row. */
  valuePoints: number;
  /** Which POI types can surface this row. Reuses today's `PoiType`. */
  pools: readonly PoiType[];
  /** Period-voice line; `{name}` is resolved by the engine, the POI_KINDS precedent. */
  wireFound: string;
  payload: ExploreOutcomePayload;
}

// PROPOSED (T-110) — does not exist yet.
export type ExploreOutcomePayload =
  | { kind: 'salvage';     minCredits: number; maxCredits: number }
  | { kind: 'lore';        fragmentId?: string; effects?: StoryletEffects }
  | { kind: 'unique-item'; itemId: string }
  | { kind: 'questline';   storyletId: string; delayDays: number }
  | { kind: 'npc';         profileId: string; dispositionDelta: number };
```

Note what is **absent** and must stay absent: there is no `recoveryDays` key, no `weight`
key, and no predicate of any kind. Those absences are load-bearing and are argued in §3b and
§5.1 respectively.

### 2.2 The five kinds, and what the engine reads for each

| kind | the engine resolver reads | existing machinery it reuses | degenerate / "dead end" case |
| --- | --- | --- | --- |
| `salvage` | the credit band, one `rng.next()` | today's salvage leg verbatim; `SalvageRecovered` | `minCredits === maxCredits` ⇒ a fixed payout, no roll needed |
| `lore` | `fragmentId` → `grantFragment` + `fragmentCount`; `effects` → `applyEffects` | `packages/engine/src/nemesis.ts` `grantFragment` / `fragmentCount`; `FragmentSource`; `FragmentAcquired` | **DEAD END** = `{ kind: 'lore' }` with *neither* field: prose and a `WireEntry`, no mechanical payoff, `valuePoints: 0` |
| `unique-item` | `itemId` → the §4 item table | `ShipState`, `SPECIAL_EQUIPMENT`, `EQUIPMENT_DICE_BENEFITS`, `hasSpecialEquipment` | — |
| `questline` | `storyletId` + `delayDays` → schedule it | `StoryletEffects.schedule` → `StoryletScheduleState`, `refreshAvailableStorylets`, and `wireResolution` / `resolveAbandonedChains` for the abandonment path | `delayDays: 0` ⇒ offered at the very next dawn |
| `npc` | `profileId` + `dispositionDelta` | `ALL_NPC_PROFILES` (`packages/content/src/cast.ts`), `applyDisposition` | `dispositionDelta: 0` ⇒ an introduction with no standing change |

**"Dead end" is a `lore` row, not a sixth kind.** The brief defines it as lore with no
mechanical payoff, and that is exactly a `lore` payload with both optional fields omitted. It
needs no resolver of its own; the `lore` resolver's two `if (field !== undefined)` guards
already produce it. A dead end still emits `wireFound` and still charts the POI — the player
learns something and keeps the coordinate.

### 2.3 The structural claim that makes the framework real

**Four of the five kinds reduce to a `StoryletEffects` payload applied through the engine's
existing `applyEffects`** (`packages/engine/src/storylets.ts:316`), which already covers
`credits`, `fuel`, `cargo`, `flags`, `disposition`, `reputation`, `deedProgress`, `schedule`,
`grantFragment` / `fragmentSource`, `decodeFragment`, and `commitCrossingStake`.

So T-110's engine surface is:

- **one export change** — `applyEffects` becomes exported. Behaviour-preserving and inert;
  this is exactly what the extraction commit is for.
- **one genuinely new resolver** — `unique-item`, because no `StoryletEffects` member grants
  a ship module or a `DiceBenefit`. §4 specifies it.

Everything else is a mapping from an `ExploreOutcomePayload` onto a `StoryletEffects` object
the engine already knows how to apply. **That is what makes "the 74th outcome is a content
row" true**, and it is the sentence T-113, T-114 and T-115 should be held against: each of
those tasks must change **zero lines** under `packages/engine/src`.

Two mechanical details `applyEffects` imposes on the caller, both verified:

- Its signature is `(state, storyletId, choiceId, effects)`, and both ids are stamped onto
  every `StoryletEffectApplied` / `StoryletScheduled` event it emits. An explore-sourced call
  must therefore supply a **synthetic pair**: `storyletId = outcome.id`,
  `choiceId = 'explore'`. This is the same idiom `resolveAbandonedChains` already uses
  (`applyEffects(nextState, def.id, 'wire-resolution', wire.effects)` at `storylets.ts:776`),
  so it is a precedent and not an invention.
- `StoryletScheduleState` requires `sourceStoryletId` and `sourceChoiceId` (both
  non-optional). The synthetic pair fills them. **Verified safe:**
  `resolveAbandonedChains` reads only `entry.storyletId` and `entry.dueDay` — it never reads
  either source field — so a schedule entry whose "source" is an explore outcome cannot
  confuse the abandonment sweep.

### 2.4 How an outcome is DRAWN — and the one place the extraction is not free

**The design: one weighted draw per successful board.** A row is the whole payoff, not one of
three optional legs. The engine filters `EXPLORE_OUTCOMES` to rows whose `pools` include the
drawn `PoiType`, then draws one by band weight (§5.1).

**This is not behaviour-preserving on its own**, and T-110 must not pretend otherwise. Today's
three legs are *independent*, so a lucky board yields salvage **and** a fragment **and** a
contraband pod; a single weighted draw cannot. T-110's extraction step therefore keeps the
three-component structure alive:

> The extraction commit re-expresses `POI_LOOT`'s beacon and derelict tables as rows in the
> new shape **and keeps the three-independent-roll draw** for them, so the exploration tests
> pass unchanged and the day-loop goldens are byte-identical. The single-weighted-draw model
> is switched on when the new pools are authored (T-113). Both draw models therefore coexist
> for exactly the span T-110 → T-113, and the switch is a one-line change of draw function,
> not a rewrite.

**CORRECTION (T-113, 2026-07-30): the flip did NOT land at T-113, and it has no owner.** The
sentence above pencilled it into T-113, but T-113's acceptance is *"zero lines changed under
`packages/engine/src`"* and §8's per-task handoff row asks only for the rows. A
`drawOutcome(rows, poiType, rng)` reading a new `weight` column, plus the call-site swap in
`actions/exploration.ts`, are both engine lines. T-113 therefore re-pointed the transitional
carrier's beacon-salvage and both fragment legs at the authored rows and reported the gap as
**finding F-113-A** (recorded in `packages/content/src/exploration.ts` beside
`LEGACY_POI_LOOT`). **Consequence for the milestone, stated here so it is not discovered
late:** T-115's accept clause *"a seeded sweep finds at least one instance of every outcome"*
is arithmetically impossible under a three-leg draw — the 14 band-0 dead ends have no leg to
be drawn from. The flip needs a dedicated engine task between T-114 and T-115, or T-115's
first commit.

Stating this here is the point of the spec: without it, T-110's "byte-identical goldens"
acceptance and its "outcome is a content-supplied payload" acceptance are in direct conflict
and the coder has to guess which one to break.

**Determinism contract, unchanged from today:** every draw stays on the same forked action
rng (`day.ts` forks on the action's event index), in a fixed documented order —
`(1)` POI type, `(2)` flavour name, `(3)` outcome row, `(4)` any within-payload roll. A seed
plus an action sequence reproduces the outcome exactly, which is the invariant
`resolveExploration`'s own header promises.

**The silent-return problem (§1.3) is fixed by shape, not by a branch.** A `lore` row whose
`fragmentId` is already held emits no `FragmentAcquired` today. Under the new shape the row
still emits its `wireFound` line, so the player is never charged 80 fuel for total silence.
That is a consequence of the header carrying the prose, not of a new rule.

### 2.5 `packages/content` stays data

The row carries **no predicate**. Any condition a row wants — era, rank, faction, a held
flag — is expressed through the existing `StoryletTrigger` gates on the storylet the
`questline` payload points at, never in the exploration content file. The mechanical test:
**a `grep` for `if (` in `packages/content/src/exploration.ts` must find nothing that decides
an outcome.**

---

## §3 · Design 2 — the multi-day committed recovery

> [!IMPORTANT]
> **THE NAMED DESIGN: "the anchored single-slot recovery."** One open recovery at a time,
> anchored to the system it was found in, ticked by a **location predicate** rather than by
> the Travel verb, and paid out at dusk.

This implements **ruling 1** as ruled: the cost is calendar days, N scales with the outcome's
power, and nothing charges a second die.

### 3.1 (a) The state added, and exactly where

```ts
// PROPOSED (T-111) — packages/engine/src/types.ts. Does not exist yet.

/** Sibling of `loan: LoanState | null` — one at a time (the T-1304 precedent). */
recovery: RecoveryState | null;

export interface RecoveryState {
  /** The content row being recovered. The PAYLOAD is looked up at payout, never stored. */
  outcomeId: string;
  /** The DiscoveredPoi this hangs off (already on charts, already survives death). */
  poiId: string;
  /** THE ANCHOR — the system the op is moored at. Read by the dusk predicate in §3c(a). */
  systemId: number;
  startedDay: number;
  /** startedDay + N, N from the rule in §3b. */
  dueDay: number;
}
```

**The save stores the id and the clock, never the payload.** This is the discipline `crew`
(which stores only `roleId`) and `EQUIPMENT_DICE_BENEFITS` (whose own comment says "nothing
is stored on the save") already keep. Two consequences worth naming: re-tuning a row's
`valuePoints` never has to rewrite a live save, and there is no phantom copy of a content
number on the save to drift — the N1 "constant recomputed from profile" failure class.

**The POI is charted immediately; only the payoff waits.** `resolveExploration` still pushes
the `DiscoveredPoi` and emits `PoiDiscovered` on the day of the find. This is what makes the
death ruling in §3c(b) coherent: the *knowledge* is in the charts namespace and survives
succession, the *salvage* is a claim against a live captain and does not.

**Touch list for T-111** — named per file so none is missed:

| File | What lands there |
| --- | --- |
| `packages/engine/src/types.ts` | `RecoveryState`, `PlayerState.recovery`, three new `GameEvent` variants, the fifth `ExplorationFailed` reason |
| `packages/engine/src/schema.ts` | `RecoveryStateSchema` (`.strict()`), `recovery: RecoveryStateSchema.nullable()` **non-optional** in `PlayerStateSchema`, the three event mirrors, and the `keyof AssertEqual` guards (`_covPlayer` already exists at `schema.ts:1329`) |
| `packages/engine/src/state.ts` | `createInitialState` (`recovery: null`) and `deserializeState` (`??= null`) |
| `packages/engine/src/save.ts` | `CURRENT_SAVE_VERSION`, `MIGRATIONS[12]`, the registry header ledger comment |
| `packages/engine/src/day.ts` | the dusk tick/payout block (§3c(d) pins its position) |
| `packages/engine/src/legacy.ts` | `applySuccession` clears the slot |
| `packages/engine/src/actions/exploration.ts` | the fifth refusal; opening a recovery instead of paying out |
| `packages/engine/src/exploreOutcomes.ts` | `bandFor`, `recoveryDays` (new module, or an addition to `exploration.ts`) |
| `packages/content/src/exploration.ts` | `EXPLORE_VALUE_BANDS` |
| `packages/sim/src/protocol.ts` | `legalActions` stops advertising Explore while a recovery is open |
| `packages/ui/src/format.ts` + the cockpit | the open-recovery readout (§4.4) |

### 3.2 (b) How N is derived — a rule reading a band table, never a per-row constant

**`recoveryDays(valuePoints)`** is an engine function over a content band table.

```ts
// PROPOSED (T-111) — packages/content/src/exploration.ts. Does not exist yet.
// The ONLY place in the codebase a recovery day-count is written.
export const EXPLORE_VALUE_BANDS = [
  { band: 0, minValuePoints:  0, recoveryDays: 0, /* + the §5 columns */ },
  { band: 1, minValuePoints:  1, recoveryDays: 0 },
  { band: 2, minValuePoints: 11, recoveryDays: 1 },
  { band: 3, minValuePoints: 31, recoveryDays: 3 },
  { band: 4, minValuePoints: 61, recoveryDays: 6 },
] as const;
```

```ts
// PROPOSED (T-111) — engine. bandFor: the HIGHEST band whose minValuePoints <= vp.
export function recoveryDays(valuePoints: number): number {
  return bandFor(valuePoints).recoveryDays;
}
```

**In-repo precedent, deliberately copied:** `RENOWN_DEED_THRESHOLDS`
(`packages/content/src/deeds.ts:238`) is a content band table and `rankForDeedCount`
(`packages/engine/src/deeds.ts:257`) is the one-line engine rule that reads it by walking the
ordered list and keeping the last satisfied entry. `bandFor` is that function with a
different table. Content owns where the bands sit; the engine owns what a band means.

**`ExploreOutcomeDefinition` has no `recoveryDays` key at all, and the enforcement is the
type.** A content author cannot hand-tune a row's N because there is nowhere to write it.
That is a stronger guarantee than a test — a test can be edited to accommodate a field; a
missing field is a compile error. This is what T-111's and T-115's "never a per-row constant"
acceptance is asking for, and it is how it should be checked: `grep recoveryDays
packages/content/src/exploration.ts` must hit **only** inside `EXPLORE_VALUE_BANDS`.

**`recoveryDays: 0` means resolved same-day**, so bands 0 and 1 — 58% of successful boards
under §5's weights — behave exactly like today's instant loot and never touch
`player.recovery`. That matters for reachability: the audit found the median day-120 captain
carrying 27 fuel (p25 = 4), and a verb that always cost a multi-day commitment on top of an
80-fuel gate would be unusable for exactly the captain it is meant to serve. **The slot is
occupied on 42% of successful boards, i.e. 42% × 33.6% ≈ 14.1% of Explore attempts.**

**The ordering property that makes T-115's whole-table test a property check rather than a
tuning exercise:** `recoveryDays` and the effect ceiling (§5.2) are **both functions of the
same band**, and both are monotone non-decreasing in `band`. So "the most powerful outcomes
are the slowest to recover" is true *by construction* across any 100 rows anyone authors. See
§5.4 for the exact assertion.

### 3.3 (c) The four interaction answers

Each is a ruling, its reason, the rejected alternative, and the test T-111 owes.

---

#### (a) Travelling away mid-recovery → **FORFEIT**, decided by a location predicate

**Ruling.** At dusk, `endDay` checks `player.recovery !== null && player.currentSystemId !==
player.recovery.systemId`. If true: clear the slot, emit
`RecoveryAbandoned { reason: 'departed' }` and a `WireEntry`. No payout, no partial credit.

**Why a location predicate and not a hook on Travel.** The rule reads **position**, not the
verb that changed it. One rule therefore covers `resolveTravel` (which writes
`player.currentSystemId = destination` at `travel.ts:542` / `:697`), any future storylet that
relocates the captain, and anything else that ever moves them — with **zero per-caller
wiring**. This is the same argument `equipmentDiceBenefits` makes about deriving a grant from
the fitted flags rather than storing it: derive from state, don't notify from call sites.

**Verified consequence, stated rather than hidden:** a jump that is *interrupted* and fled
returns the captain to the origin (`actions/combat.ts:130` sets
`currentSystemId = encounter.pendingTravel.origin`), so dusk sees the anchor system and the
recovery **survives**. Likewise a completed round trip that ends back at the anchor before
dusk is not punished. Position at dusk is the rule; that is the price of not wiring the
departure into every mover, and it is a legible one ("you only forfeit if you actually
left").

**Rejected alternative:** *pause the clock while away.* Rejected because a commitment that
can be parked costs nothing, and it deletes the tension ruling 1 selected the day-cost model
for.

**Test T-111 owes:** start a recovery at system A, drive `Travel` to B through the real
`applyPlayerAction`, run `endDay`, assert `player.recovery === null` and exactly one
`RecoveryAbandoned{reason:'departed'}`.

---

#### (b) Dying mid-recovery → **FORFEIT at succession**

**Ruling.** `applySuccession` (`packages/engine/src/legacy.ts:64`) clears
`player.recovery` and emits `RecoveryAbandoned { reason: 'succession' }`.

**Why.** It is an explicit sibling of the two forfeitures `applySuccession` already performs:
`activeContract` is voided ("the signed cargo was destroyed with the ship") and
`storylets.scheduled = []` ("appointments the dead spacer will never keep",
`legacy.ts:109–111`). An in-progress salvage op moored to a ship that no longer exists is the
same category as both. The knowledge half is untouched and inherited: the `DiscoveredPoi` is
already in `charts` (§3a).

**Ordering is already safe, verified.** Both `applySuccession` call sites run *before* the
dusk recovery block would: `day.ts:655` is the life-support dusk death at ~line 627–660, well
above the §3c(d) block's position, and `actions/combat.ts:216` is a DAY-phase death. So the
slot is cleared before the departure predicate could fire, and there is no double-emit — even
though `applySuccession` itself writes `currentSystemId = originSystem` (`legacy.ts:88`),
which would otherwise have tripped the departure check.

**Rejected alternative:** *carry the knowledge half* — pay out only a `lore` row's fragment,
by analogy with the deliberate `nemesisFile` carry. Rejected twice over: it makes death a
free fragment, and because the payload is looked up at payout, a partial payout needs a
second resolver path (a "knowledge-only" mode) for one edge case.

**Test T-111 owes:** open a recovery, drive the ship to loss through the real loop, assert the
slot is null, one `RecoveryAbandoned{reason:'succession'}`, and that the `DiscoveredPoi` is
still on the successor's charts.

---

#### (c) Starting a second recovery while one is open → **the Explore VERB is refused**

**Ruling.** A **fifth typed refusal** at the very top of `resolveExploration`, alongside
`no-die`: `ExplorationFailed { reason: 'recovery-in-progress' }`, with **no die spent and no
fuel burned**. The ship is committed; there was nothing to fly, so there is nothing to
charge. This mirrors the `no-die` branch's own justification verbatim ("No die is spent and no
fuel is burned: there was no usable die to spend on a detour").

**Mirrored in the sim.** `packages/sim/src/protocol.ts` `legalActions` gains
`player.recovery === null` to its Explore gate. Without this the policies spend actions on a
guaranteed refusal and T-116's ablation measures noise rather than the verb.

**Why refuse the verb rather than the outcome.** It is one rule instead of two, it is
knowable *before* the player commits resources, and it has an exact in-repo precedent: one
loan at a time, `borrow` blocked while a loan is active (`LoanState`'s own header:
"one loan at a time; borrow is blocked while a loan is active").

**Rejected alternative:** *allow the explore and degrade any second recovery-bearing outcome
to its salvage floor.* Rejected as two rules where one suffices, and because it hides the
commitment from the player behind a silent downgrade.

**Test T-111 owes:** open a recovery, attempt `Explore`, assert
`ExplorationFailed{reason:'recovery-in-progress'}`, assert the dawn hand is **unchanged**
(no die spent) and `ship.fuel` is **unchanged**, and assert `legalActions` does not list
`Explore`.

---

#### (d) A recovery still open when the day-30 Tour One marker resolves → **it SURVIVES the era flip, untouched**

**Ruling.** The era flip does nothing to an open recovery. No early payout, no forfeit, no
clock change.

**Why — the reasoning in full.** `day.ts` `endDay` fires `TourOneResolved` and sets
`nextState.era = 'VETERAN'` at the dusk of day 30, unconditionally on both the `cleared` and
`unpaid` branches, guarded exactly once by the `flags['tour-one.resolved']` it sets
(`day.ts:1091–1132`). What that flip *governs* is enumerated in its own comment: era-gated
content eligibility (`triggerMatches`'s `trigger.eras`) and `generateEncounter`'s TOUR_ONE
0.5× damp. A recovery's payout predicate is `state.day >= recovery.dueDay` — **era-blind by
construction**. There is nothing for the flip to invalidate, and forfeiting on it would be a
rule invented for a calendar coincidence.

**Ordering inside `endDay` is pinned, and the position is load-bearing.** The recovery block
goes **immediately after the T-1307 port-income block (`day.ts:1001–1020`) and immediately
before the T-1604b subsistence floor (`day.ts:1053`)**, which puts it above the `DebtDue`
check and well above the Tour One resolution. Two reasons, both from comments already in the
file:

- The subsistence floor's comment asserts it is "a true END-of-dusk floor" because the port
  income above it "is the LAST credit mutation of the dusk". A recovery payout *is* a credit
  mutation, so it must land above the floor or that invariant becomes false. **T-111 must
  update that comment** to name the recovery payout as the new last mutation — a comment that
  lies about ordering is how the next person introduces a bug.
- Landing above the Tour One block means the marker check and `evaluateDeeds` both see the
  paid-out state, consistent with how the floor is positioned for the same reason.

**The honest consequence, stated rather than hidden.** A payout landing on day 30's dusk
**cannot** retroactively clear the marker. `cleared = nextState.player.debt <= 0` reads
`debt`, and a recovery pays **credits**; credits become debt reduction only through a DAY-phase
`pay-debt` act, which a dusk arrival is not. So a recovery whose `dueDay >= 30` is a
**deliberate bet against the marker** — which is precisely the trade ruling 1 says the day
cost exists to create, and it is the sharpest instance of it in the game. §5.2 keeps band-4's
N at 6 days partly for this reason: a day-24 find must still read as a legible gamble rather
than an unreadable one.

**Two adjacent edges, settled while here:**

- A `dueDay` beyond `DEMO_FINAL_DAY` simply never pays. No special case — the demo licence
  expiring is not a rule about recoveries, and `demoConcluded` is already a derived predicate
  rather than a flag.
- A `dueDay` in the **past** on load (a save edited, or a migration from a hypothetical future
  shape) pays at the next dusk, because the predicate is `>=` and not `==`. Stating this is
  what stops someone writing `===` and creating a permanently stuck slot.

**Test T-111 owes:** open a recovery on day 27 with N = 6 (`dueDay` 33), run the real loop
across day 30, assert `TourOneResolved` fired, `era === 'VETERAN'`, and
`player.recovery` is **still present and unchanged**; then run to day 33 and assert
`RecoveryPaidOut`.

### 3.4 (d) Save version and migration

- **This lands on `CURRENT_SAVE_VERSION = 13`.** The track opens at 12
  (`packages/engine/src/save.ts:364`).
- **`MIGRATIONS[12]` backfills `player.recovery = null`.**
- **Null is a statement of fact, not a convenience default** — the phrase the save registry
  header already uses for `edition`. No save that exists can contain a recovery, because until
  T-111 none could exist. The model is `MIGRATIONS[2]` (`loan` → `null`) and `MIGRATIONS[3]`
  (`crew` → `[]`), which are additive one-key backfills of exactly this shape.
- **On "a migration CALLS a rule rather than restating one":** here the backfilled value is a
  literal `null`, so there is no rule to call — and that is worth saying explicitly rather
  than leaving a reviewer to wonder. The moment the backfill becomes anything other than
  `null`, the `MIGRATIONS[11]` / `emptyDeedRegistry` pattern applies: call the engine's own
  constructor, never an inline literal.
- **`deserializeState` must perform the SAME backfill** (`parsed.player.recovery ??= null`),
  pinned by its own test. The loader path is separate from the envelope path — `loadSave` runs
  `migrate` → `validateGameState` and does **not** go through `deserializeState` (spelled out
  in `MIGRATIONS[7]`'s comment). Every additive player field in the file has both halves; see
  `state.ts:260` (`loan`), `:266` (`crew`), `:271` (`ports`).
- **`PlayerStateSchema` is `.strict()`** (`schema.ts:547`), so the key must be added there in
  the *same* commit or every save fails to load. `RecoveryStateSchema` is `.strict()` too, per
  the T-1002 drift rule that "every ENGINE-owned state container is `.strict()`"
  (`schema.ts:52`).

**Golden blast radius — the precedent to expect.** Adding one key to the serialized player
moves `DAY_LOOP_GOLDEN_STATE_HASH` and `STORYLET_GOLDEN_STATE_HASH`
(`packages/engine/src/__tests__/fixtures/day-loop-golden.ts`) while the **events** hashes must
stay byte-identical. That is precisely the T-1306 `rerollsRemaining: 0` situation recorded in
`dice.ts`'s `rollDawnHand` header. The mechanism that *guarantees* the events side: the dusk
recovery block is **rng-free** (pure arithmetic and a compare) and guarded on
`recovery !== null`, so for every existing golden it draws nothing, emits nothing and mutates
nothing — the same argument the AUTO_REPAIR dusk block makes at `day.ts:712` and the
subsistence floor makes at `day.ts:1031`.

**Flag for T-102, explicitly.** If T-101's Hangout spec also needs persistent state, **one
bump to 13 covering both is preferable to 13 then 14**. Recommended ordering: Explore's shape
lands first, since T-110 → T-112 all precede T-120. The ruling belongs to T-102, which is
chartered to answer it; this paragraph exists so T-102 has a concrete recommendation to
accept or overturn rather than a blank question.

### 3.5 (e) The three new events

| Event | Payload | Emitted at |
| --- | --- | --- |
| `RecoveryStarted` | `day, outcomeId, poiId, systemId, dueDay` | `resolveExploration`, on a band-2+ outcome |
| `RecoveryPaidOut` | `day, outcomeId, poiId, valuePoints` | `endDay`, when `day >= dueDay` |
| `RecoveryAbandoned` | `day, outcomeId, reason: 'departed' \| 'succession' \| 'unknown-outcome'` | `endDay` (departed), `applySuccession` (succession), `endDay` (unknown-outcome) |

Each needs a `schema.ts` mirror plus the compile-time `keyof AssertEqual` pairing the file's
event section already applies to every variant. All three carry `outcomeId` so the wire, the
UI and the sim roll-up can attribute a payout without re-deriving it.

**`'unknown-outcome'` — content-drift safety, not a hypothetical.** `RecoveryState` stores an
`outcomeId`; a save made when a row existed can be loaded after the row is renamed or
removed. The payout resolver must therefore tolerate a miss: clear the slot, emit
`RecoveryAbandoned{reason:'unknown-outcome'}`, mutate nothing else. The precedent is exactly
one line long and already in the file this design leans on —
`const benefit = CREW_BY_ID[member.roleId]?.benefit; if (!benefit) continue;`
(`dice.ts:107–108`), the same defensive shape for the same class of stored-content-id.

**A recovery is a ZERO-DIE commitment after the initiating Explore die.** Ruling 1 chose
calendar days *instead of* a scaling die cost, so nothing may charge a die per recovery day.
This is stated as a constraint because it is the easiest thing for an implementer to add "for
flavour" and it would silently substitute the design the owner rejected.

---

## §4 · Design 3 — the effect surface

> [!IMPORTANT]
> **THE NAMED DESIGN: "two effect classes and a bounded module tier."** **Class A**
> (ship-element deltas) is unbounded and pure content — it carries the ladder. **Class B**
> (the die effect) is engine-enumerated per instance and is therefore deliberately capped at
> **exactly three items**, enumerated once in T-112.

### 4.1 Class A — `+x to a ship element`, the workhorse tier

`ShipState` (`packages/engine/src/types.ts:1258`) carries `fuel`, `maxFuel`, `cargoPods`, and
eight `ComponentState { strength, condition }` components — `hull`, `drives`, `cabin`,
`lifeSupport`, `weapons`, `navigation`, `robotics`, `shields`. A unique item's Class-A effect
is a declared delta list applied by one engine resolver at payout:

```ts
// PROPOSED (T-112) — content. Illustrative.
{ id: 'item-…', class: 'ship', deltas: [{ component: 'navigation', strength: +6 }] }
{ id: 'item-…', class: 'ship', deltas: [{ maxFuel: +40 }] }
{ id: 'item-…', class: 'ship', deltas: [{ cargoPods: +1 }] }
```

**This is where stat-scoped ambitions go, and it is the sanctioned re-authoring.** The engine
already turns component strength into check-relevant bonuses through
`packages/engine/src/components.ts`: `effectiveScore`, `navBonus` (→ the PILOT nav-check
bonus, `NAV_BONUS_DIVISOR = 10`), `weaponVolleyDamage`, `shieldMitigation`, `navFuelFactor`,
`repairRate`, `crewCapacity`. So a row that reaches for "+2 to PILOT checks" is re-authored as
`navigation.strength +20`, which is expressible **today, as content, with no new surface**.

### 4.2 Class B — the die effect, through the ruled hook, with three worked items

Per **ruling 2**, an item grants a `DiceBenefit`
(`{kind:'extra-die'} | {kind:'reroll'} | {kind:'floor'; floor: number}`,
`packages/content/src/crew.ts:52`) via the `EQUIPMENT_DICE_BENEFITS` table, which
`equipmentDiceBenefits(ship)` (`packages/engine/src/dice.ts:52`) folds into
`dawnDiceModifiers` at all three of its call sites: `day.ts` `startDay`,
`actions/crew.ts` `resolveReroll`, and `packages/ui/src/format.ts` `dawnHandModifiers`.

**The three worked items, ordered by power.** Each names its band, its N from §3b, and — the
part that makes this a real mapping rather than a list — its interaction with the shipped crew
roster it shares accumulators with.

| # | Item | Band / N | `DiceBenefit` | Why this kind, and its ceiling |
| --- | --- | --- | --- | --- |
| 1 | **a salvaged gunnery tally-slate** (low) | band 2 / **N = 1** | `{ kind: 'floor', floor: 3 }` | Floors take **MAX** (`floor = Math.max(floor, benefit.floor)`), and `crew-quartermaster` already grants **floor 5** at a 2,000cr hire — so this is strictly a poor captain's item and goes **completely inert** the day a quartermaster is aboard. `floor` is the **only** kind with an integer dial, so it is the only place fine power gradations can live. |
| 2 | **an astrogator's marked ephemeris** (mid) | band 3 / **N = 3** | `{ kind: 'reroll' }` | Rerolls **SUM** and are unclamped, so this is strictly additive with `crew-navigator` and can never be redundant. That makes it the safest mid-tier grant and the one whose realized value does not depend on what the player has hired. |
| 3 | **a Confederation staff pilot's berth-couch** (top) | band 4 / **N = 6** | `{ kind: 'extra-die' }` | The strongest benefit in the game — a whole extra action, priced at 3,000cr as `crew-second`. Extra dice **SUM then CLAMP**: with `crew-second` aboard the combined extra is 2 = `MAX_EXTRA_DICE`, hand size 7 = `MAX_DAWN_HAND_SIZE`. **The cap binds exactly here**, and a *second* extra-die item would be silently swallowed. That is the direct reason the tier is three items and not thirty. |

The existing hand cap therefore still holds with an item equipped, which is T-112's
acceptance — and it holds because `dawnDiceModifiers` clamps the **combined** sum, not each
source, exactly as its own header promises.

### 4.3 The expressive limits of this mapping — all four

This is the accept criterion "states that mapping's expressive limit", answered exhaustively
rather than with one line.

**L1 · Vocabulary is three kinds wide.** Power is finely tunable on `floor` alone (an integer
1–20). `extra-die` and `reroll` are **boolean-grained per source**: a source either grants one
or does not. A 100-row ladder therefore **cannot express "a slightly better reroll"**, and
any content row that wants one must be re-authored as Class A or dropped.

**L2 · The accumulator makes realized strength depend on player state.** Floors take MAX and
so do not stack; extra dice SUM then clamp at `MAX_EXTRA_DICE = 2` / `MAX_DAWN_HAND_SIZE = 7`;
rerolls SUM without a clamp. An item's *realized* strength therefore depends on the crew
already hired — item 1 above is worth nothing to a captain with a quartermaster, and item 3
is worth nothing to a captain who already has a Second **and** any other extra-die source.
**§5's ladder is calibrated on NOMINAL strength, not realized strength**, and that is a
limitation of the ladder, not a defect in it: pricing an item by the crew the player happens
to have would make `valuePoints` a function of live state and destroy the whole one-dial
design.

**L3 · The carrier's id namespace is the real constraint.** `EQUIPMENT_DICE_BENEFITS` is keyed
by `SpecialEquipmentContentId`, which is **derived from the module-private
`SPECIAL_EQUIPMENT_TABLE`** — the shipyard's purchasable table. `equipmentDiceBenefits` reads
it through `hasSpecialEquipment(ship, id)` (`components.ts:53`), a `switch` over named
`ShipState` booleans. So **a die-granting explore item cannot get a key without also becoming
a yard purchase**, and each one costs a hand-written engine addition. This is the framework
finding this spec produces; it is written up with its full cost and its recommended (small)
resolution as **Finding F-100-1 in §6**, and it is why Class B is bounded at three modules
while the 100-row table leans on Class A.

**L4 · Nothing scopes a `DiceBenefit`.** There is no way to make a benefit apply only to a
PILOT check, only in the veteran era, only against a patrol, or only once. Such rows are
re-authored as Class A (see `navBonus` in §4.1) or dropped. **Building the scoping surface is
a fresh owner call**, per ruling 2's own escape clause — and this spec does not propose it.
`check()`'s signature (`dice.ts:137`) is untouched by everything in this document, which is
the mechanical form T-112's acceptance checks.

### 4.4 The effect must be visible in the cockpit

Class B surfaces **for free**: `packages/ui/src/format.ts` `dawnHandModifiers` (line 351)
already computes `dawnDiceModifiers(game.player.crew, equipmentDiceBenefits(game.player.ship))`
and feeds the HandDock badges, so a module's floor/reroll/extra-die appears the moment the
flag is set. `crewBenefitLabel` (`format.ts:363`) is the existing label switch to mirror for
the module's own name.

**Class A needs a line in the ship pane**, and the **open recovery needs its own readout** —
outcome name, anchor system, and days remaining. A committed multi-day op that the player
cannot see is a trap rather than a trade, which is the whole reason ruling 1 chose it.

---

## §5 · Design 4 — the value ladder

> [!IMPORTANT]
> **THE NAMED DESIGN: "`valuePoints` → band → everything."** One integer per row. Five bands.
> No other per-row dial anywhere in the table.

### 5.1 One dial per row; weights are per band

`valuePoints` (0–100) is the only tuning number a content author writes. `EXPLORE_VALUE_BANDS`
supplies everything else, per band: `recoveryDays`, the permitted payload kinds, the
effect-strength ceiling, and **the draw weight**.

**There is deliberately no row-level `weight` field.** Rows inside a band are drawn
uniformly. This is the mechanism by which "no hand-tuned constant per row" is enforced *by the
type* rather than by review, and it has a second payoff: per-row probability is
`bandWeight ÷ rowsInBand`, so **T-115's reachability test is analytically checkable** rather
than empirically guessed at (§5.3 does the arithmetic).

### 5.2 The band table, in full

| band | `minValuePoints` | `recoveryDays` (N) | payload kinds permitted | Class-A ceiling | Class-B permitted | draw weight |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | **0** | `lore` (dead end only) | — | — | **25** |
| 1 | 1 | **0** | `salvage`, `lore` (+fragment) | — | — | **33** |
| 2 | 11 | **1** | `salvage`, `unique-item`, `npc`, `lore`, `questline` | +1 strength / +20 `maxFuel` | `floor ≤ 3` | **24** |
| 3 | 31 | **3** | `unique-item`, `questline`, `npc` | +6 strength / +40 `maxFuel` / +1 pod | `reroll` | **15** |
| 4 | 61 | **6** | `unique-item`, `questline` | +10 strength / +80 `maxFuel` / +1 pod | `extra-die` | **3** |

Weights sum to 100, so a weight reads directly as a percentage of successful boards.

**CORRECTION (T-114, 2026-07-30) — finding F-114-A: band 2's `payload kinds permitted` cell
gains `questline`, and it is corrected here in place.** As shipped, this table cell omitted
`questline` while **three other places in this document plus T-114's charter** said band 2
authors the first questline hooks: §5.3's pass-2 bullet ("NPC introductions, the first
questline hooks"), §8's per-task handoff row ("questlines resolve into the real storylet
system"), and T-114's Accept clause ("every questline outcome resolves into the existing
storylet system"). That is an internal collision in the spec, not a test to satisfy — nothing
was red, and `permittedKinds` has exactly one reader in the tree (the content validator), so
no engine line and no seeded career reads it either way. It is closed in the direction the
majority of the spec agrees on, on the T-113 precedent (F-113-A corrected §2.4 and §8 in
place). The alternative — authoring zero questline rows so the Accept clause is vacuously
true — would be metric-gaming and is forbidden by the standing constraints.

**PROVENANCE FOR THE TWO EFFECT-CEILING COLUMNS (T-114).** `Class-A ceiling` and `Class-B
permitted` were transcribed verbatim from this table onto `ExploreValueBand` at T-114
(`classACeiling` / `classB`), which is the pass with the first `unique-item` rows to check
them against — finding F-112-C re-targeted them here from T-112 for exactly that reason. The
`draw weight` column is still **not** on the type: it has no consumer until the engine draws
one weighted row per board (F-113-A), and a column with no consumer is a stub.

**Provenance for the credit bands** (§5.5 uses them): band 1 salvage is authored at
**40–260cr** and band 2 at **240–700cr**, anchored on the two bands that actually ship today
(beacon 40–180, derelict 120–520) rather than invented — band 1 is today's beacon widened at
the top, band 2 today's derelict widened at both ends. Bands 3 and 4 are non-salvage by
design.

**Provenance for the Class-B placement**: `CREW_ROLES` prices exactly these three benefits at
`crew-second` 3,000cr (extra-die), `crew-navigator` 2,500cr (reroll), `crew-quartermaster`
2,000cr (floor 5). The band ordering `floor < reroll < extra-die` is the game's own price
ordering, not a fresh judgement — and a *found module* is strictly better than the equivalent
hire because it pays no `dailyWage` (40 / 30 / 25 per dusk).

### 5.3 The 100-row spread, and the three passes

| band | rows | per-row draw probability (of a successful board) | authored by |
| --- | --- | --- | --- |
| 0 | **14** | 25 ÷ 14 = **1.786%** | T-113 |
| 1 | **20** | 33 ÷ 20 = **1.650%** | T-113 |
| 2 | **33** | 24 ÷ 33 = **0.727%** | T-114 |
| 3 | **25** | 15 ÷ 25 = **0.600%** | T-115 |
| 4 | **8** | 3 ÷ 8 = **0.375%** | T-115 |
| — | **100** | — | — |

**The pass split falls on whole band boundaries**, deliberately, so each content task's
acceptance is a one-line count:

- **T-113 — the spine (34 rows) = bands 0 + 1 exactly.** Dead ends, lore, low salvage. This
  pass establishes the house voice; it authors no items, no questlines and no NPCs, so no row
  in it can open a recovery (`recoveryDays: 0` throughout).
- **T-114 — the middle (33 rows) = band 2 exactly.** Mid salvage, the low unique items
  (including Class-B item 1 from §4.2), NPC introductions, the first questline hooks.
- **T-115 — the tail (33 rows) = bands 3 + 4.** Real-effect items (Class-B items 2 and 3),
  the top questlines, the slowest recoveries.

Rows per band are a **property of the table**, not a field on the band: the band table carries
only the six columns in §5.2. A validation test asserts the counts.

**Reachability arithmetic, so T-115 can design its sweep instead of guessing.** The rarest
row is any band-4 row at **0.375%** per successful board. Two sweep shapes:

- **Driving whole Explore attempts** (nav check included, 33.6% pass): per-row per-attempt
  probability = `0.375% × 33.6% = 0.126%`. Expected attempts to first sighting of a *given*
  row ≈ **794**. For all 8 band-4 rows seen with 95% confidence:
  `8 × (1 − 0.00126)^n < 0.05` ⇒ **n ≈ 4,025 attempts**. Budget **6,000** for margin.
- **Driving successful boards directly** (feeding a die that clears DC 12, so only the outcome
  draw varies): `8 × (1 − 0.00375)^n < 0.05` ⇒ **n ≈ 1,351 boards**. Budget **2,000**.

**Recommendation: the second shape.** It is three times cheaper and it isolates the table
from the nav check, which is what the test is actually about. **Any row the arithmetic says is
unreachable at the sweep size is a content-shape defect** — a band whose weight is too small
for its row count — and that is what T-115's "any unreachable row fails the test" means: the
fix is to move a row between bands or re-cut a band weight, never to widen the test.

### 5.4 Correlation is structural, not asserted per row

`recoveryDays` and the effect ceiling are both functions of `band`, and `band` is a monotone
function of `valuePoints`. So the correlation T-115 must demonstrate is **true by
construction** for any 100 rows anyone authors. The assertion to write is a whole-table
property, in two parts:

1. **Monotonicity:** for all pairs of rows, `a.valuePoints <= b.valuePoints ⇒
   recoveryDays(a.valuePoints) <= recoveryDays(b.valuePoints)`.
2. **Strictness where it matters:** the mean `recoveryDays` of the top `valuePoints` quartile
   is strictly greater than that of the bottom quartile.

Neither is a tuned threshold, so neither can rot — which is the point. (`docs/BALANCE-POLICY.md`
and the standing constraint both forbid moving a band to make a test pass; a property that
cannot fail for tuning reasons cannot tempt anyone to.)

### 5.5 The EV the ladder implies — and where this spec stops

Credit-equivalent per band, using §5.2's authored salvage bands and, for the non-salvage
bands, the `CREW_ROLES` hire prices as the in-game market comparable (flagged as an
**estimate**, because an item's value to a career is not a price):

| band | weight | credit-equivalent | contribution |
| --- | --- | --- | --- |
| 0 | 0.25 | 0 | 0.0 |
| 1 | 0.33 | 150 (mid of 40–260) | 49.5 |
| 2 | 0.24 | 470 (mid of 240–700) | 112.8 |
| 3 | 0.15 | ~1,200 (est.) | 180.0 |
| 4 | 0.03 | ~3,500 (est.) | 105.0 |
| — | — | — | **≈ 447 per successful board** |

At the shipped 33.6% pass rate: **≈ 150cr per Explore attempt**, against the audited
**53.8cr** — a **2.8× improvement** — and against the **400–640cr** fuel cost.

**So the ladder does NOT by itself make Explore credit-positive.** It closes the gap from
roughly 8–12× underwater to roughly 2.7–4.3×. Three honest caveats in both directions:

- The **day cost is a further cost not counted here** (14.1% of attempts open a recovery),
  which makes the figure above optimistic.
- Class-A and Class-B items are **permanent**, so a credit-equivalent understates them badly
  over a long career and overstates them near its end. A one-number EV cannot express that.
- Fragments and questlines are the payoffs the audit itself said were "player-scoped by
  design" and are not income at all. Explore is being rebuilt as **the lore-and-item faucet**,
  not as an income verb.

**This spec does not re-price fuel or the DC.** `TASKS.md`'s deferred list is explicit that
"Explore being a net loss for the PLAYER as a balance question" is R-series work and an owner
call. **T-116 measures; if the answer is still negative, that is the finding**, and the lever
is not a content pass's to pull. The 150cr figure above exists so T-116 has a *predicted*
number to measure against rather than only a historical one.

---

## §6 · Framework findings

### Finding F-100-1 · A die-granting explore item cannot get a content id without becoming a shipyard purchase

**Reported, not routed around**, per the standing constraint. **This does not re-open ruling
2**: the ruled hook works exactly as its comment claims, `dawnDiceModifiers` needs no change,
`check()`'s signature is untouched, and no new check-level modifier surface is proposed.

**The finding.** `EQUIPMENT_DICE_BENEFITS` is keyed by `SpecialEquipmentContentId`, which is
`(typeof SPECIAL_EQUIPMENT_TABLE)[number]['id']` — derived from the **shipyard's purchasable
equipment table**. And `SPECIAL_EQUIPMENT` (the widened export of that table) is what
`packages/ui/src/format.ts:1257` maps over to build the shipyard's special-equipment pane. So
adding a row to obtain a key **also puts the item on every yard's shelf**, which is the one
thing a unique find recovered from a derelict must not be.

**The full per-instance cost of a Class-B module, as the code stands:** one
`SPECIAL_EQUIPMENT_TABLE` row, one member of the engine's hand-written `SpecialEquipmentId`
union, one `ShipState` boolean flag, one `hasSpecialEquipment` `switch` case, one
`ShipStateSchema` field, one `deserializeState` backfill, one `EQUIPMENT_DICE_BENEFITS` entry
— and, if it lands in the yard table, a price branch and a mutual-exclusion review in
`actions/shipyard.ts` (which resolves both by `if (equipment === …)` chains at `:216` / `:302`
/ `:354`, so a new id that reaches the yard silently matches nothing). **That is engine work
per instance**, which is exactly why §4 caps Class B at three modules.

**Recommended resolution for T-112 — one pure function gains a second loop.** Introduce a
second content table that the shipyard does **not** read:

```ts
// PROPOSED (T-112) — content. Not read by SPECIAL_EQUIPMENT / the yard pane.
const EXPLORE_MODULES = [ /* three rows */ ] as const;
export type ExploreModuleContentId = (typeof EXPLORE_MODULES)[number]['id'];
export const EXPLORE_MODULE_DICE_BENEFITS:
  Readonly<Partial<Record<ExploreModuleContentId, DiceBenefit>>> = { /* three entries */ };
```

and give `equipmentDiceBenefits` a **second loop over that second table**, returning the
combined `readonly DiceBenefit[]`. Why this shape and not another:

- **Zero call-site changes.** All three callers already pass
  `equipmentDiceBenefits(ship)` into `dawnDiceModifiers`; they keep doing so and pick up the
  modules for free, including the UI badges.
- **Zero new accumulator.** The benefits fold through the same `applyBenefit`, so the clamps
  still apply to the combined extra-die count and floors still take MAX across every source.
- **The injectable `table` parameter survives** for the crew-parity test that proves the
  shipped-empty path is byte-identical; the second table gets a sibling default.
- **The three flags ride §3d's save bump** and owe no second one: they are optional booleans
  mirroring the existing seven on `ShipState` and are backfilled by `deserializeState`
  alongside them (`state.ts:227–233`), pinned by the round-trip test.

**Rejected alternative:** add the three rows to `SPECIAL_EQUIPMENT_TABLE` with a sentinel
"not for sale" price. Rejected because a sentinel price **is** a new engine rule in the yard's
price resolution, and because a unique find that is also on every shelf is not unique.

### Finding F-100-2 · The overlapping fragment pools charge for silence

Recorded in §1.3 and fixed by shape in §2.4 rather than by a branch, so it is closed by this
spec's design rather than left open — noted here so the audit trail is complete.

---

## §7 · What this spec deliberately does not settle

- **Whether NPCs interact with Explore.** Deferred by the owner (`TASKS.md`, Deliberately
  deferred). This gates re-ruling the vacated PARITY LEDGER row and therefore gates **N8**.
  Nothing in this document gives the cast an Explore verb, and nothing in it should be read as
  a step toward one.
- **Explore's pricing.** `EXPLORATION_FUEL_COST = 80` and `EXPLORATION_NAV_DC = 12` are
  untouched. R-series, owner call. §5.5 predicts; T-116 measures.
- **The manifest version bump to 0.5.2.** `docs/VERSIONING.md` is explicit that it is its own
  commit immediately before tagging. T-130 asks the owner.
- **Anything about the Hangout.** `docs/HANGOUT_REDESIGN.md` (T-101) owns it.
- **A scoping surface for `DiceBenefit`** (limit L4). A fresh owner call, per ruling 2.

**Crossover risk for T-102 to check.** The two concepts this spec names that the Hangout spec
could independently re-name are (1) the persistent slot, **`player.recovery`** — a nullable
single-slot sibling of `loan`, and (2) the **band-table idiom** (`EXPLORE_VALUE_BANDS` +
`bandFor`, modelled on `RENOWN_DEED_THRESHOLDS` + `rankForDeedCount`). They are pinned here so
T-102's collision check has concrete names to compare rather than two prose descriptions.
The save-bump recommendation for T-102 to rule on is in §3d.

---

## §8 · Handoff — which task implements which section

| Task | Implements | The accept criterion it satisfies from this spec |
| --- | --- | --- |
| **T-110** | §2 (all), §2.4 in particular | Two POI types re-expressed as content rows; `applyEffects` exported; five resolvers; **the three-independent-roll draw survives the extraction commit** so the goldens are byte-identical |
| **T-111** | §3 (all) | `player.recovery`, `EXPLORE_VALUE_BANDS` + `recoveryDays`, save v13 + `MIGRATIONS[12]` + `deserializeState` backfill; four interaction tests; the dusk block positioned per §3c(d) and the subsistence-floor comment updated |
| **T-112** | §4 (all), §6 F-100-1 | Class A resolver; three Class-B modules via the second-loop shape; cockpit readouts; `check()` unchanged; hand cap still binds |
| **T-113** | §5.3 pass 1 | 34 rows = bands 0 + 1 exactly; house voice; zero engine lines **(delivered; the draw flip did not land here — F-113-A)** |
| **T-114** | §5.3 pass 2 | 33 rows = band 2 exactly; questlines resolve into the real storylet system; NPC ids resolve against `ALL_NPC_PROFILES`; **F-113-D discharged** — `legacy-salvage-derelict` deleted and the derelict salvage leg re-pointed at the 14 authored derelict rows (`rich_hulk` P(≥400) 0.302 → 0.384). §5.2 corrected in place (**F-114-A**); the two effect-ceiling columns landed; zero engine lines **(delivered)** |
| **T-115** | §5.3 pass 3, §5.4 | 33 rows = bands 3 + 4; table totals 100; the two-part monotonicity property of §5.4; the reachability sweep at the size §5.3 computes |
| **T-116** | §5.5, §9 | Capstone after `npm run format`; re-run the ablation; append the before/after to §9; **do not tune to reach an answer** |

---

## §9 · Appendix: T-116 re-measurement

*(Reserved. T-116 appends the re-measured ablation — before/after, with provenance — here.)*
