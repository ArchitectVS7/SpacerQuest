# Content / Engine Boundary — standing rulings

**Status:** Standing decisions for the Rimward codebase, harvested 2026-08-02 from the
0.5.2/0.5.3 task log. Companion to `docs/ENGINEERING-POLICY.md` (standing constraint 4,
"content is data", and constraint 7, "every field must name its reader") and to the
subsystem specs these rulings are cited from — `docs/EXPLORE_REDESIGN.md`,
`docs/HANGOUT_REDESIGN.md`, `docs/LIARS-DICE_REDESIGN.md`.

Every ruling below was made once, on a named task, against a stated alternative. They are
not advice. A change that wants to go the other way needs an owner ruling and a dated
amendment here, not a fresh argument in a task block.

---

## 1. Where a rule lives

**CE-1 — Deltas are content, application is engine.** (T-101) The line is drawn as a
35-row two-column table in `docs/HANGOUT_REDESIGN.md` §3. Wager bands, per-venue DCs,
per-venue disposition *deltas*, venue sets, clientele and prose are content; opposed-GUILE
resolution, the loan ledger, die spending and *how* a delta is applied are engine.
`packages/content` stays data.

**CE-2 — A content surface is parameter-only; it carries no predicate field.** (T-101
ruling 3) A new port is exactly one `PORT_HANGOUTS` row resolved field-wise against
`DEFAULT_PORT_HANGOUT`. Conditional per-port house rules ("smugglers pay double", "the
house bars debtors") are unexpressible *by design*. **Rejected alternative:** a predicate
field on `PortHangout`. A port concept that needs one is reported as an `F-101-3x` finding
in `docs/HANGOUT_REDESIGN.md` §7 using the pre-registered format — never routed around by
adding a predicate. Vindicated on 14 instances: **zero `F-101-3x` reports were raised
across all fourteen authored ports** (T-130), so the boundary stands unamended.

**CE-3 — No per-port engine branch, anywhere.** (T-123, T-132, T-133, T-135) A content
pass makes zero engine changes; the scope claim is verified with
`git diff --stat HEAD -- packages/engine/src ':!packages/engine/src/__tests__'` printing
nothing. Where the UI needs a port's house it reads a `hangoutHouse()` accessor over the
engine's `portHangoutFor`, so even the generic-house fallback is the engine's and never a
UI restatement. In the Liar's Dice resolver (`packages/engine/src/actions/dare.ts`) **no
literal a port could have authored may appear** — every number comes from
`liarsDiceRules.ts` or `hangoutRules.ts`.

**CE-4 — Rows resolve field-wise against a DEFAULT row, and an authored `0` survives.**
(T-120, T-124) `DEFAULT_PORT_HANGOUT` is built entirely from the pre-existing R-owned
constants, so any field a row omits inherits today's shipped number *by construction* and
an unauthored port is behaviour-preserving. Consequence for authors: a row states only its
deviations, and an intended zero must be written explicitly, because `venueParamsFor`'s
`??` preserves an authored `0` (Denebola-5's `dare.dispositionOnFailure: 0` is the
deliberate mirror of Arcturus-6's `meet: 0`).

**CE-5 — Every consumer reads the accessor, never a restated constant.** (T-120, T-123,
T-133) When a constant moves into content behind an accessor, every mirror of it moves in
the same change: `packages/sim/src/protocol.ts`'s `legalActions` and
`packages/ui/src/format.ts`'s `dareWagerBounds` / `hangoutNpcs` / `lendingTerms` all read
`wagerBandFor` / `venueParamsFor` / `venueOffered` / `loanBandFor`. Keeping the bare
`DARE_MIN_WAGER` / `DARE_MAX_WAGER` / `BEFRIEND_DC` constants at the edges was **rejected**
— the UGT harness and the cockpit must never advertise or clamp against a value the engine
no longer reads. Tests state such claims as comparisons between ports or against the
accessor, never against a literal, so an authored number can move without a test rewrite.

**CE-6 — A sim policy guard exists only as a MIRROR of an engine guard.** (T-123, F-121-1
idiom) It is read through the engine's own accessor and never against a hard-coded id or a
restated venue list — e.g. `isLendingDeskSystem(systemId, venue) = isHangoutSystem(...) &&
venueOffered(...)` in `packages/sim/src/index.ts`. A policy guard that is not an engine
guard is a new rule, and inventing one is out of bounds for a content pass.

**CE-7 — The two sides of a split are pinned by the compiler, not by convention.** (T-120)
Content's `HangoutVenueId` and the engine's `VisitHangout` venue union are held equal by an
`AssertEqual` (`_hangoutVenueIdsAgree`, `packages/engine/src/hangoutRules.ts`).

**CE-8 — World-state gating reads content, never a per-system id ladder.** (T-149) Exactly
one `STAR_SYSTEMS[...]?.hasHangout === true` read — the same content source `day.ts` gates
`VisitHangout` on and `ui/format.ts`'s `hangoutOpen` reads — so the bar-less rim ports are
*derived*, not enumerated. An `if (systemId === ...)` ladder is prohibited and is asserted
against in test.

**CE-9 — A content flag selects PROSE only, and branches below the roll.** (T-149) In
`executeSocialize` the GUILE `rollNpcCheck` sits above and outside the `hasBar` branch on
purpose: same rng draw, same DC, same credit mint on both sides. This preserves the T-1201
verb⟺StatCheck invariant. Any future world-state gating of NPC flavor must branch below
the roll, never around it.

**CE-10 — Engine flavor that reaches the player is player-facing prose.** (T-149)
`NpcState.lastAction.details` is interpolated verbatim into `RUMOR_TEMPLATES`, so any
string in it that asserts a venue or facility is gated on the same content flag the UI
reads.

**CE-25 — The NPC virtual hand models only the PICK, and that is THE ONE SANCTIONED
ABSTRACTION.** (T-156) The deal is the player's own `rollDawnHand` at `DAWN_BASE_HAND_SIZE`
and the spend is the player's own `spendDie`; only the allocation — which die a captain
puts where — is modelled rather than played. It is flagged at its definition site in
`packages/engine/src/npcHand.ts` with the exact string `THE ONE SANCTIONED ABSTRACTION`,
the same string `npc.ts` already carried, so **one grep finds both**. The deal is LAZY by
design: an Idle day, a FlawOverride or a broke captain rolls nothing at all. A second
abstraction may not be added to the NPC path without the same marker and its own argued
definition-site note — the marker is what stops "the cast approximates the player" from
becoming an unbounded licence.

**CE-26 — A shared-state defect is fixed at the DEFINITION site, and divergent call-site
conventions are proved equivalent rather than unified.** (T-182, closing F-156-1)
`spendDie`'s single rebuild was the fix; the six assign-the-returned-hand call sites were
not touched individually, and the four mutate-`spent`-in-place callers
(`actions/crew.ts`, `actions/port.ts`, `actions/hangout.ts`, `actions/dare.ts`) were left
alone and pinned equivalent by a `toStrictEqual` test. **Rejected alternative:** refactoring
the mutate family to match the assign family for uniformity — that adds churn to
already-correct code inside a `rulesFingerprint`-moving commit, which is exactly what BR-13
and BR-61 make expensive. The divergence is instead documented in the CONTRACT comment at
`spendDie`'s definition site, so the next reader learns it from the code rather than from a
bug.

---

## 2. What may be added to a content table

**CE-11 — A column with no consumer is a stub, not a rule.** (T-112 / F-112-C, upheld
T-113, T-114, discharged T-117) A spec column is not transcribed into a content table until
a runtime consumer exists — adding it early raises a coverage signal while checking
nothing. Concretely: `ExploreValueBand.classACeiling` / `classB` landed at T-114 *because
the content validator reads them*; `permittedKinds` landed at T-113 with its validator;
`weight` was withheld twice and landed only at T-117, when `drawOutcome` became its
consumer.

**CE-12 — A value-scaled knob lives on the band/tier table, never on the authored row.**
(T-111, T-131) `recoveryDays(valuePoints)` and `apCost(valuePoints)` read
`EXPLORE_VALUE_BANDS`; `ExploreOutcomeDefinition` deliberately carries neither key, so
authored rows cannot disagree with the ladder and power/cost correlation is structural
rather than hand-tuned. The absence of the key is asserted in a content test — a comment is
not enforcement.

**CE-13 — Effects reduce to ONE authoritative application path.** (T-110) Explore outcome
kinds resolve to a `StoryletEffects` payload applied through the single exported
`applyEffects`, using a synthetic pair (`storyletId` = the content row id, `choiceId` =
`'explore'`), rather than each kind growing its own mutation code.

**CE-14 — A Class-B (die) grant is a content-table APPEND, not a new modifier surface.**
(T-112) `EXPLORE_MODULE_DICE_BENEFITS` in `packages/content/src/crew.ts` is folded in by a
second loop inside `equipmentDiceBenefits`: no new accumulator, no new call site,
`dawnDiceModifiers` and `rollDawnHand` untouched, and `check(die, statValue, dc)` keeps its
signature. **No engine branch may be keyed on an item id** — Class-A grants switch on
`delta.element`, Class-B is a list append.

**CE-15 — Keep a validator rule intact and give it a SEAM rather than weakening it.**
(T-114) `validateStorylets` / `defineStorylets` take `externalScheduledIds`, and
`packages/content/src/storylets.ts` passes the *derived* `EXPLORE_SCHEDULED_STORYLET_IDS`,
so a `scheduledOnly` beat scheduled by something other than a storylet still validates. The
ids are derived from the rows, never transcribed.

**CE-16 — A resolver arm with no grant surface yet resolves to its wire line and mutates
nothing.** (T-110 / F-110-D) It carries a named seam comment naming the owning task, and is
pinned by a test comparing whole state before and after. An invented stand-in grant, or a
field added only to raise a coverage signal, is forbidden. The same argument was reused
verbatim at F-112-C and F-113-A to refuse consumer-less spec columns; when the dependency
lands, the surviving no-op test is re-targeted to content drift (an unknown id must still
resolve to prose and mutate nothing).

**CE-17 — A new deed event type is an `EVENT_PATHS` allowlist entry, never a change to the
deed matcher DSL.** (T-147) The `deeds.test.ts` guard is SATISFIED, not loosened; this is
what kept fifteen new `DeedDefinition` rows off `matchesEvent` / `readPath`.

**CE-18 — Every new `GameEvent` variant owes an `AssertEventKeys` guard.** (T-134)
`GameEventSchema`'s variants are deliberately non-strict (unlike STATE schemas, which are
`.strict()`), so the compile-time guards in `packages/engine/src/schema.ts` are their ONLY
drift protection. Cite the symbol, never the line.

**CE-19 — A transitional union member is allowed only when it is marked at BOTH sites with
a named retirement task.** (T-110 / F-110-A) When a settled taxonomy cannot express shipped
behaviour and a hard "every pre-existing test passes unchanged" clause is in force, ship an
explicitly transitional member marked at its declaration *and* its resolver arm — do not
bend existing behaviour into a settled kind. **Rejected alternative:** routing the
contraband flag through `lore.effects`, which would have emitted the wrong event and moved
the replay goldens. The `{ kind: 'contraband' }` member was duly retired at T-117.

**CE-27 — A calibration constant is content, and its criterion is DISTRIBUTIONAL
NEUTRALITY, not a number that looked right.** (T-156) The virtual hand's allocation
calibration lives in `packages/content/src/ideals.ts` as two measured constants:
`NPC_ALLOCATION_PIVOT_STAT = 2` (the roster's measured median stat) and
`NPC_ALLOCATION_SHARPNESS_PER_STAT = 0.1`, chosen so a median-stat captain's allocation is
distributionally neutral — E[middle of 5 sorted d20s] = 10.5, which is a plain d20's mean.
The step is therefore designed to move outcome SPREAD without moving the fleet economy.
Re-tuning either constant must **re-establish that neutrality**, not just pick a new number:
a knob whose criterion is forgotten becomes a tuning lever aimed at whichever metric is
currently embarrassing.

---

## 3. Naming

**CE-20 — `systemId` is the settled name for a `STAR_SYSTEMS` id.** (T-102) `PortHangout`'s
proposed `portId` was rejected and renamed. No new type may reintroduce `portId` for the
same concept.

**CE-21 — "band" is ambiguous across subsystems, so `bandFor` stays module-scoped.** (T-102)
`bandFor` in `packages/engine/src/exploreOutcomes.ts` is never re-exported bare from a
barrel; if it must be widely imported it is renamed `valueBandFor`. The Hangout's
`wagerBandFor` (a numeric range) and Explore's band (a value tier) are different concepts,
and two engine-root modules exporting "band" for both is a legibility hazard.

**CE-22 — Symbols live beside their vocabulary, not beside their feature.** (T-112) Explore
module symbols live in `packages/content/src/crew.ts` beside `EQUIPMENT_DICE_BENEFITS` and
the shared `DiceBenefit` type — not in `exploration.ts` — so the whole dice axis reads in
one file. `docs/EXPLORE_REDESIGN.md` §6's proposed-symbol table was corrected in place.

---

## 4. Authoring voice

**CE-23 — The house voice is a set of RULES, not a taste, and every one falls out of the
engine.** (T-113) Third person past tense with the literal subject `Player` (`wire.ts`
treats that string as the player actor); `{name}` at most once per row (`String.replace`
substitutes the first occurrence only, so a second ships a literal brace to the wire); a
salvage row names what was stripped, never the credit figure (the amount rides
`SalvageRecovered`); a lore row's copy is the second line on a new fragment and the only
line on a repeat, so it is written to read correctly both ways. This binds all future
authored copy.

**CE-24 — Humour is period-voiced and dry.** (T-124) A plain sentence with one deflating
clause at the end, matching `wireStories.ts`'s `NAT_WIRE_TEMPLATES` and `flaws.ts`'s
`detail` lines. No puns, no exclamation marks, nothing winked at the player. Read the
existing voice before authoring a comic line.
