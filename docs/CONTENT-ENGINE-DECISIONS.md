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

---

## 5. Harvested 2026-08-06 (T-179 … T-208)

**CE-28 — Player-stat-modifying trinkets are NOT built.** (Owner ruling 2026-08-05 on
`docs/PLAYER-TRINKETS_SPEC.md` §12.1: **C — do nothing**.) Candidates A/B/D are declined and
stat-trinket ambitions stay served by the shipped Class-A ship-element-delta path. §§3–8's
candidate-A design stays specified but UNBUILT (conditional design, per §2.6) and nothing
schedules a build task. Rejected alternative A cost one engine refactor + one arm + one
`legacy.ts` line plus a capstone AND the §2.7 10× re-run of §4/§5; if a future owner pass reopens
12.1 to A, **that 10× re-run is still owed** before any content ships.

**CE-29 — If a stat trinket were ever built, its ceiling is a HAND-SET +1.** (Owner ruling
2026-08-05 on §12.2: **NO** confirmed, §4's ceiling accepted.) A stat trinket is not the
`DiceBenefit`-scoping surface Ruling 2 reserved. The number is +1 and not +2 precisely because no
live throttle constrains it: the `/10` `NAV_BONUS_DIVISOR` damping and the three-module cap are
inapplicable to a stat delta by construction, so +1 stands as a deliberately hand-set number.

**CE-30 — When a rule change makes an action field meaningless, DELETE the field from the type
AND the zod schema rather than leaving it optional-and-ignored.** (T-196a.) A field that silently
does nothing is its own future bug, and the deletion turns every stale call site into a `tsc`
error — 184 `TS2353` errors across engine, sim and ui, which is the point. Where only PART of a
union keeps the field, SPLIT the union member: `Trade` was split so `haggle` keeps `spendDie` (its
die IS the `check(die, TRADE, 12)`) while `buy-fuel` / `sign-contract` / `pay-debt` /
`abandon-contract` reject it.

**CE-31 — A shape split inside one `type` is expressed as a NESTED `z.discriminatedUnion` in
`packages/engine/src/schema.ts`,** because zod rejects two options of a discriminated union that
share a discriminator value. (T-196a.) A stale caller's dropped field is STRIPPED, not accepted —
pinned by the `T-196a · the freed actions neither require nor accept spendDie` block in
`schema.test.ts` (11 cases, plus `haggle` keeping its die and the outer discriminator still
rejecting `{type:'Teleport'}`).

**CE-32 — `lastAction.details` is a DISPLAY-ONLY field with zero computational readers.**
(T-204.) Every consumer is a render path (`day.ts:658,701,1007`, `actions/hangout.ts:99`,
`npc.ts:2255`, `ui/store.ts:672`); deed triggers match `eventType` + `path`/`equals`, never text.
The two Socialize clauses at `npc.ts:2064,2072` are therefore player-facing COPY — interpolated
verbatim into the rumor mill — and were pulled into T-204's rename scope deliberately, because
deferring them would have forced a SECOND golden re-derivation for the same rename.

**CE-33 — Quest captains get NO voice fields at all — absent, never an empty array or an `''`
stub.** (T-205.) `tableTalk` / `catchphrases` are optional on `NpcProfile` and ABSENT on all 11
`QUEST_PROFILES` rows: an empty array games the "field exists" signal and reads as authored
content that is not. Absent MEANS "no voiced surface" (a quest captain takes no simulated turn,
is never dealt a roaming Liar's Dice seat, and is excluded from the named-interceptor pool), the
same way `bondHook?` means "no player-facing obligation". Voice is not FORBIDDEN on them —
`validateQuestVoices` checks quest rows for well-formedness IF PRESENT and never for presence —
but a test pins that all eleven are unvoiced, so adding one is visible.

**CE-34 — The captain-voice authoring contract, machine-enforced in
`packages/content/src/castValidation.ts`.** (T-205.) `tableTalk` 2–4 lines
(`TABLE_TALK_RANGE`); each catchphrase slot (`enter` / `duringBattle` / `win` / `loss`) 1–3 lines
(`CATCHPHRASE_RANGE`); every line non-empty after `trim`, ≤ 120 chars (`MAX_BARK_LENGTH`), no
`{…}` placeholder since lines print verbatim, and no duplicate line within a slot. Voice is
ALL-OR-NOTHING — half a voice is an error even when waived, because the UI would otherwise render
a captain who enters a fight silently and quips on the win. The dice-count ban applies to
`tableTalk` ONLY (the count moves with the unlock ladder), never to catchphrases. Coverage emits
five distinct messages, one per slot, so a failure names which slot is missing.

**CE-35 — A content-coverage rule that must be UNCONDITIONAL but cannot turn the gate red is
waived through an explicit, self-staling ID WORKLIST, not a ratcheting count.** (T-205, retired
at T-206.) `VOICE_AUTHORING_PENDING` (27 literal ids) was chosen over `MIN_VOICED = 2` because a
count fails only on the aggregate, not "on any of the 30 missing a slot"; and a throwing
`defineNpcProfiles` with no waiver would make `import '@spacerquest/content'` throw and every
suite in the repo red. The worklist cannot rot silently — an id not on the roster is an error, an
id that HAS been authored is an error whose message says to delete it, and a `QUEST_PROFILES` id
on it is an error — and its retirement instruction lives in the set's own docblock. **Retiring a
waiver means deleting the set AND the branch that reads it, then pinning its ABSENCE** with an
anti-refill test asserting the symbol is not in the module namespace, while leaving the history
trail in docblocks (mark resolved, do not wipe).

**CE-36 — The `DICE_COUNT_PHRASE` regex is duplicated across `liarsDiceValidation.ts`
(`LIARS_DICE_DICE_COUNT_PHRASE`) and `castValidation.ts` (`CAST_DICE_COUNT_PHRASE`) BY FORCE, not
by style.** (T-205.) `liarsDiceValidation.ts` does a RUNTIME `import { ALL_NPC_PROFILES } from
'./cast.js'`, so importing it from `castValidation.ts` would close
`cast.ts → castValidation.ts → liarsDiceValidation.ts → cast.ts`, a real module-init cycle with a
TDZ hazard; `castValidation.ts` imports `cast.ts` TYPE-ONLY (erased), so the wrapper direction
carries no runtime edge. Both copies are EXPORTED and pinned equal (`.source` and `.flags`) in a
test file, because a test file is a leaf and adds no edge to the module graph. A comment naming
the other copy is not enforcement.

**CE-37 — Voiced content is authored off the captain's OWN authored fields.** (T-206.) `ideal` /
`bond` / `flaw` / `flawDc` / `archetype` / stat line in `packages/content/src/cast.ts`, with the
read written into a short docblock at the entry rather than left to be re-derived. Captains
sharing an ideal or flaw are authored back to back (Iron Vex / Iron Clad, Nova Blitz / Crimson
Hawk, The Phantom / Neon Shade, Star Gazer / Star Chaser, Warp Hound / Star Chaser, Gold Rush /
Dust Devil, Cargo King / Comet Tail) so the contrast is deliberate rather than lucky.

**CE-38 — When the per-captain signature-token rule goes red, the fix is to give that captain a
line that EARNS a signature word.** (T-206.) Lowering the 4+ letter word floor or deleting the
check is explicitly rejected — it is the same move as widening a band to clear a gate. The
"not a template / real variety" criterion is mechanized before it is claimed: global raw
uniqueness, normalized uniqueness (lowercased, punctuation stripped, whitespace collapsed), a
per-author signature token, and a named hardest-pair spot-check.

**CE-39 — An authored line shown by the UI is picked DETERMINISTICALLY by the shared
non-exported `pickAuthoredLine(lines, seed)` (FNV-1a over the seed string), seeded on the id of
the THING the line belongs to.** (T-207, `packages/ui/src/format.ts:605`; seeds `dareHand.id`,
`encounter.id`, `${encounter.id}:${round}`, `EncounterResolved.encounterId`.) `Math.random()` is
rejected because `format.ts` runs on EVERY React paint and would reshuffle a captain's line while
the player was still reading it; forking the engine RNG is rejected because a display projection
that pulled from the engine's stream would change the world by being rendered. Corollary for
tests: a variety sweep must vary the axis the value is actually KEYED on — a hand id of
`dare-${day}-${dealerId}-${dayEventCount}` is not a function of the world seed, so 40 seeds are a
sample of size one.

**CE-40 — Combat bark cadence: `enterLine` on round 1 ONLY; `battleLine` null on round 1 and
thereafter only on EVEN rounds.** (T-207.) The enter line is what a captain says arriving, not a
banner over the whole fight; a bark every round is wallpaper — the player stops reading it, which
costs the enter and resolution lines their weight too.

**CE-41 — `CAPTAIN_OUTCOME` is a TOTAL `Record<CombatAftermath['resolution'], 'win'|'loss'>`,
deliberately not a `switch`.** (T-207, `format.ts:1947`.) A sixth resolution arm must fail to
COMPILE rather than fall through a `default` and quote the wrong half of a captain's voice. The
orientation is the CAPTAIN's and inverts twice: `escaped` is a captain WIN (the player fled, the
captain held the field) and `interceptor-escaped` is a captain LOSS. The same rule bars a ternary
chain keyed on a union: map a union member to its data with a total `Record<Union, T>`, never a
chain whose final `else` is one arbitrary member (T-185's `setVolume` persistence keys).

**CE-42 — Quest-captain placement is DECLARED CONTENT applied by ONE engine expression.**
(T-208.) `NpcProfile.homePortSystemId` carries the eleven values in `cast.ts` and
`createInitialState` reads `p.homePortSystemId ?? (index % 20) + 1` — the rule in the engine, the
instances in content, with zero `if (` added to `cast.ts`. The 30 `NPC_PROFILES` keep the
`(index % 20) + 1` spread and are FORBIDDEN to declare a home port; the mirror is machine-checked
in both directions. This closes the defect where index arithmetic froze six of eleven quest
captains at rim systems with no `hasHangout` — unreachable at a bar in every career on every
seed, with no test able to fail because arithmetic always produces a legal-looking number.

**CE-43 — A quest captain's home port is validated against the FLAG
`STAR_SYSTEMS[id].hasHangout === true`, NOT against the numeric range `id <= 14`,** because the
Cantina is the reason the rule exists. (T-208.) Enforced at IMPORT in two layers in
`castValidation.ts`: `defineQuestProfiles` takes
`QuestProfile = NpcProfile & { homePortSystemId: number }` so a missing value is a `tsc` error at
the authoring site, and `validateQuestHomePorts` checks present / integer / real system /
`hasHangout`. The added `castValidation.ts → systems.ts` import closes no cycle (`systems.ts` has
zero imports).

**CE-44 — Each of the eleven home ports carries a one-line comment naming its REASON.** (T-208,
`cast.ts`.) Ten are sourced to the captain's own content — e.g. `npc-silk-dagger` → 3 Altair-3 via
`chain.silk-dagger.marker` `systemIds: [3]`; `npc-lucky-seven` → 8 Mira-9 via
`passenger.gambler.debt`; `npc-penny-wise` → 1 Sol-3 via `SUN_3_HANGOUT`'s `borrow` flavour — and
exactly ONE, `npc-smuggler-ray` → 12 Rigel-8 (the Underhold), is declared "no location implied"
in the open. Sol-3 and Mira-9 each take two captains; nothing requires uniqueness. (Dated
correction: T-208's Delivered note said "NINE content-implied, TWO no-location"; the shipped
`cast.ts` comments are ten and one. The comments are the record.)
