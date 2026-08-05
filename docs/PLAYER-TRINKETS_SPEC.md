# Player-Modifying Trinkets — the bakeoff, and the spec it produced

**Status:** SPECIFICATION + BAKEOFF REPORT (T-151, 2026-08-01). **It is a spec, not an
implementation** — T-151 changed no engine, content, sim or UI source file. The only two paths
this task touched are this document and `TASKS.md`.

**The verdict is NOT this task's to make.** Four independent reviewers recommend **candidate C —
do not build**, unanimously, and a full-engine rig at `n` = 19,200 campaigns does not overturn
them. That recommendation is recorded here with its blast radius so the owner can rule; **§12 is
the handback, and it is where the decision belongs.** §§3–8 nevertheless settle the design in full,
with no open question left for an implementer, so that a ruling either way is immediately
actionable. Nothing in §§3–8 ships until §12 is answered.

**Companions:** `docs/EXPLORE_REDESIGN.md` (§4.1's sanctioned re-authoring, §6's Finding F-100-1,
§7's reserved owner call), `docs/PRD-REIMAGINED.md` (§6, the five stats and their declared
`-2 … +5` range), `docs/VERSIONING.md` (save versions §2, `rulesFingerprint` §3),
`docs/BALANCE-POLICY.md` (governance), `docs/NPC_REDESIGN.md` (THE PARITY LEDGER, §9.4 below).

**The five things the owner asked this task to settle:**

| § | Question | The named design |
| --- | --- | --- |
| §3 | Slot count and economy | **No slot. One lifetime grant, forfeited on death** |
| §4 | Delta bounds, per stat | **`+1`, as a literal type, never `number`** |
| §5 | Which stats are in scope | **Two in, three out — GRIT by ratification, GUNS and GUILE by measurement** |
| §6 | Acquisition path | **The Explore unique-item row, band 4 only** |
| §7 | The engine/content split | **A third `ExploreItemDefinition` arm + a switched dispatch** |

> [!IMPORTANT]
> **THE HEADLINE.** The task's own sizing premise — *"a ±1-2 range, mirroring how ship-component
> deltas are bounded"* — **is false, and it is false twice over.** Ship-component deltas are
> **damped 10:1** before they reach a check (`navBonus` divides by `NAV_BONUS_DIVISOR = 10`); a
> stat delta is **undamped** — it *is* the check input. And a component point feeds **one**
> reader, where a stat point feeds **every** site that reads that stat at once. A `+1` stat
> trinket is therefore worth **more than the single most expensive item the Explore ladder can
> currently grant**, and the exchange rate is not a rounding difference — it is an order of
> magnitude. Every reviewer computed this independently and every reviewer reached the same
> number. See §2.4 and F-151-2.

---

## §0 · Symbol conventions — how to read the code in this document

Every backticked identifier is one of two things, and the two are never mixed.

**1 · EXISTING symbols.** These resolve in `packages/*/src` today; every one was grepped while
writing this spec.

| Symbol | Where | What it is |
| --- | --- | --- |
| `player.stats` | `types.ts` `PlayerState`, schema at `schema.ts:469` / `:614` | `StatBlock = Record<Stat, number>`. All five keys always serialized |
| `StatBlockSchema` | `schema.ts:174-182` | `z.object({PILOT,GUNS,TRADE,GRIT,GUILE: z.number()}).strict()` — **no numeric bounds at all** |
| `check(die, statValue, dc)` | `dice.ts:160-174` | `die + statValue >= dc`, nat 20 auto-succeeds, nat 1 auto-fails. **Out of bounds for this track** |
| `navBonus(ship)` | `components.ts:208-210` | `max(0, floor((effectiveScore(navigation) - 10) / NAV_BONUS_DIVISOR))` |
| `NAV_BONUS_DIVISOR` | `content/components.ts:103` | `10`. The damping factor this whole spec turns on |
| `LIFE_SUPPORT_SURVIVAL_DC` | `content/components.ts:168` | `10`. Read at `day.ts:725` |
| `interceptorPressureDc(defenderStats)` | `combatRules.ts:96-97` | `10 + defenderStats[Stat.GRIT]`. **One definition, shared by player and NPC** |
| `applyUniqueItem(state, item, poi, events)` | `exploreOutcomes.ts:219-266` | Grants one unique item. Dispatches on `item.class` with an **`if`/`else`, not a `switch`** |
| `ExploreItemDefinition` | `content/exploration.ts:1353-1355` | A **two**-arm union: `class: 'ship'` \| `class: 'module'` |
| `ShipElementDelta` | `content/exploration.ts` | The `'ship'` arm's payload: `component` / `maxFuel` / `cargoPods` |
| `COMPONENT_STRENGTH_MIN` / `_MAX` | `exploreOutcomes.ts:70-71` | `1` / `199`. The clamp the `'ship'` arm uses |
| `EXPLORE_VALUE_BANDS` | `content/exploration.ts:18-22` | The only place a band's day-count or extra-dice cost is written |
| `applySuccession` | `legacy.ts` | **RESETS** `ship` to `starterShip()` (`legacy.ts:86`); **CARRIES** `stats` untouched (`legacy.ts:28`, *"stats (v1: no reset)"*) |
| `CURRENT_SAVE_VERSION` | `save.ts:509` | **`15`** |
| `MIGRATIONS` | `save.ts:246` | `Record<number, MigrationFn>`; a migration **calls** a rule, never restates one |
| `DiceBenefit` | `content/crew.ts` | `{extra-die} \| {reroll} \| {floor}`. Cannot be scoped to a stat (limit L4) |
| `HangoutVenueId` | `content/portHangouts.ts:60` | Exactly seven ids, compile-pinned to `VisitHangout` by `AssertEqual` (`hangoutRules.ts:47-49`) |
| `SPECIAL_EQUIPMENT_TABLE` | `content/upgrades.ts:150-158` | Module-private; read through `hasSpecialEquipment` (`components.ts:54`), a switch over named `ShipState` booleans |
| `applyEffects` | `storylets.ts:326` | The typed storylet effect vocabulary (`StoryletEffects`, `content/storylets.ts:102`) |
| `CONTENT_NON_RULE_SOURCES` | `sim/balance/rules-fingerprint.ts:111-113` | Excludes **only** `index.ts`; all other content files are hashed wholesale |
| `NPC_COMPONENT_STAT_AFFINITY` | `content/upgrades.ts:87` | Makes an NPC's purchase ladder a function of its stats |

**2 · PROPOSED symbols.** These do **not** exist. They are named here so that, if the owner rules
"build it", downstream tasks do not each invent a name. They appear nowhere else in the repo.

| Proposed symbol | Introduced by | Shape |
| --- | --- | --- |
| `StatDelta` | §7 | `{ stat: TrinketStat; delta: 1 }` |
| `TrinketStat` | §5 | `Stat.PILOT \| Stat.TRADE` — the three excluded stats are **not members** |
| `class: 'trinket'` | §7 | The third arm of `ExploreItemDefinition` |
| `TRINKET_DELTA_MAX` | §4 | The clamp constant that does not exist today |
| `effectiveStats(player)` | §2.5 (candidate B only) | The derived-stat reader. **Not recommended** |
| `player.trinkets` | §8 (candidate B only) | `TrinketId[]`. **Not recommended** |

**The FIELD names of a proposed type are proposed too.** `stat`, `delta`, and `class: 'trinket'`
do not resolve today and are not expected to.

---

## §1 · The audit — what the five stats actually are today

Eleven claims were put to four independent reviewers as *"these are claims; verify them, and
report any that are wrong."* Six survived intact. **Five were corrected, and three of the
corrections change the answer.** The corrections are here, at the top, not in a footnote.

### 1.1 Verified CORRECT, by at least three independent reviewers

- **A1 · Stats are not rolled.** `state.ts:147-153` hard-codes `PILOT 1, GUNS 0, TRADE 1, GRIT 1,
  GUILE 0`. There is no roll anywhere in engine or content. **`TASKS.md`'s M6 header saying stats
  are "rolled once at character creation" is wrong** and is corrected by this spec.
- **A2 · `player.stats` is write-once.** Zero writes outside `createInitialState`. This is not an
  omission; `legacy.ts:28` names stats among what a successor inherits, *"(v1: no reset)"*.
- **A3 · GRIT collides, and the collision is documented and ratified.** Two player-facing reads:
  the dusk life-support save (`day.ts:725`) and the combat defence DC (`combatRules.ts:96-97`),
  the latter **one definition shared by player and NPC**. `content/components.ts:150-167` pins the
  band and says it is *"RATIFIED … and held where it stands."*
- **A4 · The acquisition paths are not equally cheap.** Explore item ≪ quest reward < shipyard ≪
  new Hangout venue. Verified in every particular (§6).
- **A5 · `CURRENT_SAVE_VERSION` is 15**, at `save.ts:509` — not the `12` the T-151 task block
  inherited from the start of the track.
- **A6 · A markdown-only task stales nothing.** `computeDocsFingerprint`, despite its name, hashes
  the **raw bytes of the TypeScript rule sources**, not the `docs/` tree
  (`rules-fingerprint.ts:11-17`: the byte hash was *"DEMOTED to `computeDocsFingerprint`"*). This
  document moves no fingerprint and owes no capstone.

### 1.2 CORRECTED — and these change the answer

> [!IMPORTANT]
> **C1 · "±1-2 mirrors ship-component deltas" is a false premise, not an imprecise one.**
> The framing assumed a stat delta and a component delta are the same size. They are not, on two
> independent axes at once:
>
> - **Damping.** `navBonus` divides component strength by `NAV_BONUS_DIVISOR = 10` and **floors**.
>   A raw stat point is added with no divisor. At `exploration.ts:142` and `travel.ts:626` the two
>   are *literally summed into one `check()` call* — `stats[PILOT] + navBonus(ship)` — so the
>   exchange rate is exact, not approximate: **10 component strength = 1 stat point.**
> - **Breadth.** A component point feeds the one reader function that consumes that component. A
>   stat point fires at **every** site that reads the stat, simultaneously. GRIT alone is two
>   independently-tuned formulas.
>
> **And the floor makes the per-item comparison worse than linear.** Band 2's Class-A ceiling is
> `+1 strength`, which `floor(1/10)` rounds to **exactly `+0`** on a check — the Explore spec's
> own Finding F-114-B says so. The first item anywhere that buys a whole `+1` on a PILOT check is
> `item-lane-computer` (`navigation +10`), one of only five **band-4** items in the game. So a
> `+1` stat trinket is not "worth ten band-2 items"; it is worth **more than the single most
> expensive item the Explore ladder can grant**, because it is undamped *and* wider.

**C2 · The prose band at `content/components.ts:164` is arithmetically wrong.** It claims *"at
GRIT 1 a spacer saves on 9+ (55%)"*. The survival roll is `d20 + GRIT >= 10`, so GRIT 1 passes on
`d20 >= 9` = 12/20 = **60%**. `55%` is 11/20 — the **GRIT 0** figure, which no player can have.
The `"9+"` is right; the percentage is off by exactly one stat point. The GRIT 4 half of the same
sentence (*"6+ (75%)"*) is correct. **All four reviewers found this independently.** Filed as
**F-151-1**. It is a comment, so fixing it moves no fingerprint, band, threshold or golden — but
this task does not fix it, because T-151 touches no content source.

**C3 · `applyUniqueItem` does NOT dispatch on `item.class` exhaustively.** The framing implied a
`switch` with a `never`. The truth (`exploreOutcomes.ts:226-231`): it is
`if (item.class === 'module') { … } else { for (const delta of item.deltas) … }`. **The `never`
exhaustiveness guard is on the inner `delta.element` switch, not on `item.class`.** A third arm
therefore falls silently into the `else` branch. "One engine arm" undersells the diff by one
refactor: the dispatch must first be converted to a `switch (item.class)` with a `never` default.
Filed as **F-151-3**.

**C4 · GUILE is thin, not inert — and the Liar's Dice claim was wrong.** The framing said
`liarsDiceRules.ts` reads *"no stat at all."* Literally, it contains zero `Stat.` references — but
it consumes a GUILE **value** extensively (`DARE_AI_GUILE_PATIENCE`, `DARE_AI_GUILE_BLUFF`, folded
into `dealerMove`), threaded in as `dealerGuile: npcGuile(dealerNpc)` at `dare.ts:513`. That is
the **NPC dealer's** GUILE, never the player's. Corrected claim: *the player's own GUILE is thin —
three sites: the contraband patrol scan (`patrol.ts:56`), the `befriend` venue (`hangout.ts:322`)
and the optional Dare Peek (`dare.ts:385`) — but GUILE as a stat is load-bearing on the NPC side.*
This strengthens the parity question in §9.4 rather than weakening it.

**C5 · A new content file does NOT fail the balance rig.** The framing said
`packages/content/src/trinkets.ts` would fail `balance-rig.test.ts` until classified. It would
not. Content is hashed **wholesale**: `CONTENT_NON_RULE_SOURCES` excludes only `index.ts`, so a
new flat content file is already in `hashed` and never reaches `unclassified`. The requirement is
real for **engine** sources in an unhashed directory only. What a new content file *does* do is
move `computeRulesFingerprint`, staling every balance fixture and owing a capstone re-measure —
a real cost, correctly incurred, but not a test failure. Filed as **F-151-4**.

### 1.3 Two further corrections found by reviewers, outside the claim list

- **C6 · Routine travel is no longer a PILOT check.** `travel.ts:610-629` documents the T-1605
  redesign: navigation became a *deterministic fuel-burn discount* (`navFuelFactor`) because the
  old hazard roll failed 34% of jumps even on the player's best die. The **only** surviving PILOT
  check on the travel path is the one-time **Nemesis Crossing**. PILOT's live check surface is
  therefore *one recurring site* (Explore nav, DC 12) plus combat retreat — not "every jump".
  Anyone sizing PILOT off travel hazards is sizing a mechanic that no longer exists.
- **C7 · Finding F-100-1 lives in `EXPLORE_REDESIGN.md` §6**, not §4.3. §4.3 is *"The expressive
  limits of this mapping"* (limits L1–L4), a different discussion. The substance of the shipyard
  cost claim is accurate.

### 1.4 The read sites, enumerated — the blast radius of any derived-stat design

**Player-side (13 distinct call sites):** `day.ts:725` (GRIT) · `storylets.ts:245` (any, via
`statCheck.stat`) · `actions/hangout.ts:322` (GUILE) · `actions/dare.ts:385` (GUILE) ·
`actions/patrol.ts:56` (GUILE) · `actions/trade.ts:167` (TRADE) · `actions/exploration.ts:142`
(PILOT + `navBonus`) · `actions/travel.ts:626` (PILOT + `navBonus`, **Nemesis Crossing only**) ·
`actions/combat.ts:156` (GRIT via `interceptorPressureDc`), `:342` (GUNS), `:387`, `:395`, `:482`
(PILOT), `:617` (TRADE). Plus read-only display: `ui/format.ts:248`, `ui/App.tsx` `CheckBreakdown`.

**NPC-side (8 more):** `hangoutRules.ts:148` · `day.ts:628` · `combatRules.ts:97` ·
`npc.ts:1209`, `:1210`, `:1231`, `:1380`, `:1490` — plus `NPC_COMPONENT_STAT_AFFINITY`
(`content/upgrades.ts:87`), which makes a captain's whole purchase ladder a function of its stats.

---

## §2 · The bakeoff

Reported in the skill's own order: the rig and its validation, the agreement table, the results
table, what reversed at scale, the recommendation with its blast radius, and the honest caveats.

### 2.1 The rig, and how it was validated

**Four independent reviewers**, same prompt, isolated context, no shared state, diversified by
**domain role** — systems programmer / engine owner (R1), game designer, economy and progression
(R2), balance analyst (R3), QA lead and regression owner (R4). Each was given the eleven claims of
§1 as *claims to verify, not facts*, the exact files, the scope constraints, and a required output
shape. None could see another's output.

**The four candidate architectures, named in the prompt so the reviews would be comparable rather
than four different conversations.** Reviewers were told to score all four and invent none.

| id | Candidate | What it is |
| --- | --- | --- |
| **A** | **Baked delta, no new state** | A third arm on `ExploreItemDefinition`; `applyUniqueItem` clamps straight into `player.stats`. No slots, no unequip, no provenance. No save bump. One engine arm, then unlimited content rows |
| **B** | **Worn slots, derived effective stats** | `player.trinkets: TrinketId[]` + a new `effectiveStats(player)` reader with all 13 player read sites routed through it. Save bump, migration, succession rule, round-trip test. **The only candidate with a real slot economy** |
| **C** | **Status quo / no-change control** | Do nothing. Stat ambitions keep being re-authored as ship-element deltas per `EXPLORE_REDESIGN.md` §4.1. **Mandatory in the comparison** — this procedure has killed a recommendation that lost to doing nothing before |
| **D** | **Dice-side only** | Express "better at X" through the shipped `DiceBenefit` hook. Zero new surface, honours ruling 2 — but limit L4 means a benefit cannot be scoped to a stat, so it can only mean "better in general" |

**Two instruments, in order.**

**(a) The exact solve.** Every stat effect is `d20 + stat vs DC`, so the marginal value of `+1` is
closed-form; it was computed, not sampled. This is what caught **C2** (the 55% / 60% prose error)
and what separated the two check families in §2.4.

**(b) The full-engine rig, by anchored substitution.** The shipped tree was copied to a scratch
directory (`rsync -a`, with `.git`, packaged release artefacts and the scratch tree excluded — no
source, no `node_modules`, and no content table was omitted); the workspace links
`node_modules/@spacerquest/*` are
**relative** symlinks, verified, so each copy self-resolves to its own patched packages. The
starting-stats literal at `state.ts:147-153` is the anchor — *worn from day 1*, which is the
**upper bound** on a trinket's effect, not its expected value. Each substitution was asserted to
match **exactly once**, and each variant was rebuilt (`npx tsc -b packages/engine`) before use.
The rule was never re-implemented; only the shipped source was patched.

**Rig self-assertions, all of which passed:**

| Assertion | Result |
| --- | --- |
| Each anchor matched exactly once, else abort | PASS (8/8 variants) |
| The no-change **control** is byte-identical to production | **PASS** — 9/9 (policy × seed) full-JSON hashes identical across `trader`/`fighter`/`explorer` × seeds 1/7/42 |
| Each patched build actually differs from the control | see §2.3 — **this is where the rig earned its keep** |
| The repo is untouched throughout | PASS — `git diff --stat` shows only this file and `TASKS.md` |

**The rig caught its own first draft.** An initial run reported every patched variant as
*identical* to the control. That is precisely the failure mode the skill warns about — *"a no-op
patch and a real one look identical downstream"* — and only the explicit "must differ" assertion
surfaced it. Two real defects were behind it: the harness called `runCampaign({seed, days,
policy})` when the shipped signature is **positional**, `runCampaign(seed, days, policy, extras)`;
and low-seed `trader` runs genuinely never reach a GRIT branch, so a small sample looked like a
dead patch. Both were fixed before any number below was taken. **No number in §2.3 comes from a
run whose variant was not first proven live.**

### 2.2 Agreement table — published before any number

Status: **AGREED** (bank it) · **LONE CLAIM** (hypothesis, unverified) · **DISAGREEMENT**
(measured in §2.3) · **FRAMING CORRECTION** (surfaced in §1).

| Claim | R1 | R2 | R3 | R4 | Status |
| --- | --- | --- | --- | --- | --- |
| **Verdict: C — do not build now** | C | C | C | C | **AGREED, 4/4, unanimous** |
| Ruling 2 is **not** violated by a stat trinket | NO | NO | NO | NO | **AGREED, 4/4** |
| The `±1-2` premise is wrong by ~an order of magnitude | ✓ | ✓ | ✓ | ✓ | **AGREED, 4/4** |
| `content/components.ts:164` says 55%, truth is 60% | ✓ | ✓ | ✓ | ✓ | **AGREED, 4/4 — FRAMING CORRECTION (C2)** |
| GRIT must be **excluded** | ✓ | ✓ | ✓ | ✓ | **AGREED, 4/4** |
| If built at all: **`+1` only, never `+2`** | ✓ | ✓ | ✓ | ✓ | **AGREED, 4/4** |
| Explore item is the cheapest acquisition path | ✓ | ✓ | ✓ | ✓ | **AGREED, 4/4** |
| Candidate **B** should not be built | ✓ | ✓ | ✓ | ✓ | **AGREED, 4/4** |
| Candidate A needs **no** save bump; B needs 15 → 16 | ✓ | ✓ | ✓ | ✓ | **AGREED, 4/4** |
| `player.stats` has **no clamp today**; one must be invented | ✓ | — | ✓ | ✓ | **AGREED, 3/4** |
| Routine travel is no longer a PILOT check (C6) | ✓ | — | ✓ | — | **AGREED, 2/2 who checked — FRAMING CORRECTION** |
| A new content file does **not** fail the rig (C5) | — | ✓ | ✓ | — | **AGREED, 2/2 who checked — FRAMING CORRECTION** |
| Band 2 is the wrong tier; band 4 is the floor | — | ✓ | ✓ | — | **AGREED, 2/2 who raised it** |
| `applyUniqueItem` is `if/else`, not an exhaustive switch (C3) | — | ✓ | — | — | **LONE CLAIM → VERIFIED TRUE at `exploreOutcomes.ts:226-231`** |
| GUILE is thin-but-real (3 sites), not inert (C4) | ✓ | ✓ | — | — | **AGREED, 2/2 — corrects the claim as posed** |
| `clone.ts` needs **no** change under B (generic structural clone) | — | — | ✓ | — | **LONE CLAIM → VERIFIED TRUE** — corrects the task's own cost estimate |
| No existing test pins `player.stats` across a run | — | — | — | ✓ | **LONE CLAIM — plausible; the stat references in the suites are scenario setup, not invariants** |
| **What happens on succession** | flag the permanence as a risk | **must RESET** | must be **forfeited** (gear, not a Deed) | must be **stated**; there is no default | **DISAGREEMENT on the mechanism, AGREEMENT on the defect** — see §3.2 |

**The disagreement is narrower than it looks.** No reviewer thinks a trinket should silently
persist. R2 reaches the sharpest form of it: `applySuccession` **RESETS** the ship to
`starterShip()` (`legacy.ts:86`) but **CARRIES** stats untouched (`legacy.ts:28`). So a baked stat
delta would be *the only acquired bonus in the game that outlives its owner* — strictly more
permanent than the ship upgrade it is supposed to "mirror". That asymmetry is decisive, and it is
resolved in §3.2.

### 2.3 Results table — every variant, identical seeds, identical metrics

**8 variants × 8 policies × 300 seeds × 35 days = `n` 2,400 campaigns per variant, 19,200 total.**
Every variant ran the same seeds through the same harness. `+1` variants patch one stat; `grit_p2`
and `trade_p2` are the `+2` dose-response arms.

**(a) Is the variant even live?** Rows whose outcome differs from the control on any metric. This
is the assertion that caught the rig's own first draft (§2.1), and it is also the first real
result: **two of the five stats barely move the game at all.**

| variant | rows differing from control | |
| --- | --- | --- |
| `trade_p2` (+2) | 1678 / 2400 | **69.9%** |
| `trade_p1` | 1609 / 2400 | **67.0%** |
| `grit_p2` (+2) | 738 / 2400 | 30.8% |
| `pilot_p1` | 517 / 2400 | 21.5% |
| `grit_p1` | 450 / 2400 | 18.8% |
| `guns_p1` | 60 / 2400 | **2.5%** |
| `guile_p1` | **2 / 2400** | **0.1%** |

**(b) Median final credits, by policy** (`n` = 300 per cell):

| policy | control | pilot +1 | guns +1 | trade +1 | grit +1 | guile +1 | grit +2 | trade +2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| explorer | 16847 | 17421 | 16847 | 17112 | 17223 | 16847 | 17360 | **17572** |
| fighter | 2825 | 2825 | 2825 | 2825 | 2825 | 2825 | 2825 | 2825 |
| gambler | 21418 | 21487 | 21418 | 22378 | 21856 | 21418 | 22081 | **22908** |
| greedy | 1120 | 1120 | 1120 | 1130 | 1120 | 1120 | 1120 | 1130 |
| smuggler | 6451 | **7592** | 6451 | 6564 | 6267 | 6478 | 6267 | 6766 |
| trader | 12725 | 12545 | 12725 | 13438 | 13094 | 12725 | 13289 | **13406** |
| trader-degraded | 8836 | 8861 | 8836 | 10346 | 8972 | 8836 | 9516 | **11762** |
| veteran | 4860 | 4852 | 4875 | 4815 | 4835 | 4860 | 4820 | 4772 |

> **This table is now a test fixture (T-167, 2026-08-04).** It is transcribed verbatim as
> `TRINKET_RIG_MEDIANS` in `packages/sim/src/__tests__/support/gate-fixtures.ts` and replayed
> through `assertVariantsPerturbEveryPolicy` (`packages/sim/src/balance/gate.ts`), which names
> `fighter` — and nothing else — as flat. Note that four other rows (`explorer`, `greedy`,
> `trader`, `veteran`) are *also* byte-identical to the control under some arm and none of them
> is a defect; that is exactly why the check requires flatness under **all** live arms. The
> numbers above are EVIDENCE: if the fixture and this table ever disagree, the fixture is wrong.

**(c) Survival — the GRIT question, answered** (totals over `n` = 2,400 campaigns each):

| variant | ships lost | combat defeats | life-support failures | life-support scares | successions |
| --- | --- | --- | --- | --- | --- |
| control | 35 | 33 | 2 | 7 | 35 |
| pilot +1 | 34 | 32 | 2 | 7 | 34 |
| guns +1 | 36 | 34 | 2 | 7 | 36 |
| guile +1 | 36 | 34 | 2 | 7 | 36 |
| trade +1 | 33 | 33 | 0 | 0 | 33 |
| **grit +1** | **28** | 27 | 1 | 4 | **28** |
| **grit +2** | **19** | 18 | 1 | 4 | **19** |

**`+1` GRIT cuts ship losses 35 → 28 (−20%); `+2` cuts them 35 → 19 (−46%).** No other stat moves
survival at all. This is the largest single effect anywhere in the rig, and it lands precisely on
the curve `content/components.ts` says is *"held where it stands."*

**(d) Best-response vector — is there a decision to make?** Δ median credits vs control:

| policy | pilot | guns | trade | grit | guile | best |
| --- | --- | --- | --- | --- | --- | --- |
| explorer | **+574** | +0 | +266 | +376 | +0 | pilot |
| fighter | +0 | +0 | +0 | +0 | +0 | *(none — all flat)* |
| gambler | +68 | +0 | **+959** | +438 | +0 | trade |
| greedy | +0 | +0 | **+10** | +0 | +0 | trade |
| smuggler | **+1140** | +0 | +113 | −184 | +27 | pilot |
| trader | −180 | +0 | **+712** | +370 | +0 | trade |
| trader-degraded | +25 | +0 | **+1510** | +136 | +0 | trade |
| veteran | −8 | **+15** | −45 | −25 | +0 | guns *(noise)* |

**Three distinct best-responses across eight policies** — so a stat delta is *not* a single
dominant answer. But the structure is thin: `trade` wins four, `pilot` wins two, `fighter` is
**flat for every variant**, and `guns`'s single "win" is `+15cr` on one policy, which is noise.

**(e) Regret of the naive choice** — credits lost by always taking the same trinket instead of the
best one for that policy, averaged over the eight policies:

| always take | mean regret |
| --- | --- |
| trade +1 | **174 cr** |
| pilot +1 | 413 cr |
| grit +1 | 476 cr |
| guile +1 | 612 cr |
| guns +1 | 613 cr |

**Regret is non-zero, so a decision exists — but it is small**, and "always take TRADE" is within
174cr of optimal against day-35 medians of 1,120–21,418. **The value of deciding is roughly 1–3%
of the purse.** That is not nothing; it is also not a slot economy.

**(f) Dead options** — does this `+1` ever beat the control on any policy?

| variant | policies where it beats control |
| --- | --- |
| trade +1 | 6 / 8 |
| pilot +1 | 4 / 8 |
| grit +1 | 4 / 8 |
| **guns +1** | **1 / 8** (and that one is `+15cr`) |
| **guile +1** | **1 / 8** (and that one is `+27cr`) |

**(g) Dose-response, `+1` vs `+2`** (all policies pooled, Δ median vs control):

| stat | +1 | +2 |
| --- | --- | --- |
| TRADE | +456 | +808 — **roughly linear** |
| GRIT | −0 | +144 — **GRIT's value is survival, not credits** (see (c)) |

### 2.4 The exact solve — and the reversal that matters most

**This is the most transferable finding in the report, and the rig did not produce it — the exact
solve did, and the rig then confirmed it.**

There are **two check families** in this engine and they behave *completely differently* under a
`+1` stat. The task's framing — and the intuition that `+1` is worth `+5pp` — is true of only one.

**Family 1 — a RANDOM `d20`. The roller does not choose the die.** Only GRIT lives here.

| GRIT | needs | P(survive the dusk life-support save) | shipped prose |
| --- | --- | --- | --- |
| 0 | `d20 >= 10` | 55.00% | — |
| **1** | `d20 >= 9` | **60.00%** | claims **55%** — **wrong (F-151-1)** |
| 2 | `d20 >= 8` | 65.00% | — |
| 3 | `d20 >= 7` | 70.00% | — |
| 4 | `d20 >= 6` | 75.00% | claims 75% — correct |

Marginal value of `+1` GRIT: **exactly +5.00pp**, and it applies **twice** — once on the survival
save, and again as `interceptorPressureDc = 10 + GRIT`, which drops an attacking interceptor's hit
rate by a flat **-5.00pp** per point.

**Family 2 — a SPENT DIE. The player CHOOSES which of five dawn dice to spend.** PILOT, GUNS,
TRADE and GUILE all live here. **This is where the `+5pp` intuition breaks.**

| Check (DC 12) | stat | needs | P(passable with a 5-die hand) | E\[cheapest clearing die\] |
| --- | --- | --- | --- | --- |
| Explore nav | PILOT 1 | `11+` | **96.88%** | 13.58 |
| Explore nav | PILOT 2 | `10+` | **98.15%** | 12.68 |
| Haggle | TRADE 1 | `11+` | 96.88% | 13.58 |
| Haggle | TRADE 2 | `10+` | 98.15% | 12.68 |
| Befriend / Peek | GUILE 0 | `12+` | 94.97% | 14.46 |
| Befriend / Peek | GUILE 1 | `11+` | 96.88% | 13.58 |

**`+1` PILOT buys `+1.28pp` of pass rate, not `+5pp`** — because a five-die hand already clears
DC 12 **96.88%** of the time. The hand, not the stat, is doing the work; the passable-rate at
PILOT 1 is *already above* `check()`'s own 95% single-die ceiling (nat 1 auto-fails). What `+1`
actually buys in Family 2 is **die economy** — it frees ≈**0.9 die-pips**, letting a cheaper die
service the check so a better one survives for something else.

> [!IMPORTANT]
> **THE INVERSION.** The task assumed GRIT was the dangerous stat to be *excluded on collision
> grounds*, and that the other four were interchangeable at `±1-2`. The arithmetic says the
> opposite is the load-bearing fact: **GRIT is the only stat whose `+1` is worth a full 5pp,
> twice over, because it is the only one read on rolls the player does not choose.** A uniform
> `±1-2` band across five stats is not merely too generous — it is **wrong by a factor of ~4
> between stats**, and it is most generous exactly where the game has ratified a band and said
> *"held where it stands."*

**The exchange rate, closed form.** `navBonus = floor((strength - 10) / 10)`, and at full
condition `effectiveScore = strength` exactly, so **10 raw component strength = +1 check = the
same +5pp as +1 PILOT**. Band 2's ceiling is `+1 strength` → `floor(1/10)` = **+0**. Band 4's
`item-lane-computer` (`navigation +10`) is *the first delta anywhere* that buys a whole `+1`. A
`+1` stat trinket matches the rarest item in the game **and** is wider, **and** is undamped.

### 2.5 What reversed at scale, and what did not

- **The `+5pp` rule reversed on inspection, not on sample size.** It survives for GRIT and
  collapses to `+1.28pp` for every spent-die stat. **All four reviewers independently reported
  `+5pp` uniformly across all five stats** — R3 explicitly as *"closed-form, no sampling needed"*.
  That is correct for the *roll* and wrong for the *game*, because it ignores that the player
  picks which of five dawn dice to spend. **This is the one correction the bakeoff contributes
  that no individual reviewer made**, and it is the reason four independent agreements on a number
  still had to be checked against the engine rather than banked.
- **The rig's first draft reversed completely** (§2.1) — from "no variant has any effect" to
  measurable effects, once the harness signature bug was fixed and the sample was widened past the
  seeds where the patched branch is never reached.
- **GUNS reversed against this spec's own pre-measurement draft.** §5 originally put GUNS *in*
  scope, on the reasonable ground that no collision could be found for it. At `n` = 2,400 it
  changes 2.5% of campaigns and beats the control on 1 of 8 policies by 15 credits. **The spec was
  rewritten to follow the measurement**, which is the whole reason the rig runs before the spec is
  finished rather than after. Absence of a reason to exclude is not a reason to include.
- **What did NOT reverse:** the unanimous verdict (C), the GRIT exclusion, and the `+1` bound.
  GRIT's survival effect got *stronger* with the `+2` arm — ships lost 35 → 28 → **19** — which is
  the dose-response confirming it is a real causal effect and not seed noise.

### 2.6 The recommendation, and its blast radius

**Recommended: candidate C — do not build player-modifying trinkets now.** Unanimous, 4/4, and the
rig does not overturn it. The design goal is already served — more safely, with damping and with a
death-reset the trinket lacks — by the shipped Class-A ship-element-delta path
(`EXPLORE_REDESIGN.md` §4.1). **Blast radius of C: zero.** No file changes.

**What the rig adds to the reviewers' verdict, and it is not "nothing happens".** A `+1` stat is a
real, measurable effect — but the effect is *lopsided and mostly small*: two of five stats
(**GUNS, GUILE**) are dead options at 2.5% and 0.1% of campaigns; one (**GRIT**) is potent but
lands entirely on the one curve the game has ratified and closed, cutting ship losses **20%** at
`+1` and **46%** at `+2`; and the two live stats buy a naive-choice regret of only **174–413cr**
against day-35 medians of 1,120–21,418. **So the honest summary is: the stat that works is the one
that must not be touched, and the stats that may be touched buy a 1–3% decision.** That is the
measured case for C, and it is stronger than "we found no effect" would have been.

**§§3–8 specify candidate A anyway, in full and with no open question**, because the Accept
criterion requires a settled spec and because the owner may overrule. They are the *conditional*
design: if §12 rules "build it", §13 says which task builds which section.

**The two blockers that must be answered by an owner ruling before any content ships** — neither
is an implementer's judgment call:

1. **The exchange rate.** *"Mirrors ship-component deltas"* is not a coherent instruction once
   computed (§2.4). A number must be set deliberately. §4 proposes one.
2. **The write-once break.** `player.stats` has had zero writes outside `createInitialState` for
   the life of the track, **by design**, and `applySuccession` carries it while resetting the
   ship. Opening that field is a fresh owner call in its own right — and it is *not* the ruling-2
   call the task asked about (§12.2).

### 2.7 Honest caveats

- **The rig's anchor is `state.ts`, i.e. worn from day 1.** That is the **upper bound**, not the
  expected value: a real trinket is acquired mid-run and is worth strictly less. Every effect
  reported in §2.3 should be read as a ceiling.
- **The rig measures a stat delta, not a trinket economy.** Candidate B's slot/swap behaviour
  cannot be measured without building it, which step 3 forbids. B is rejected on cost and on the
  absence of any demonstrated need — not on a measurement of B.
- **`n` is reported on every figure in §2.3.** Where a cell is flat, that is a measurement, not an
  omission — **except for `fighter`, where flatness is an instrument defect** (F-151-9), and it is
  labelled as such rather than read as a result.
- **The screening `n` is 2,400 campaigns per variant, not the 10× re-run the method asks for on a
  winner.** That re-run was not owed here: the recommendation is **C**, and no candidate was
  selected whose margin needed confirming. **If the owner overrules to A, the `+1` bound of §4 and
  the PILOT/TRADE selection of §5.4 must be re-run at 10× before a content row ships** — the
  small-`n`-reverses-conclusions rule is a correctness property, and this track has already seen
  one reversal (GUNS, above) inside this very bakeoff.
- **The reviewers were all one model family at one prompt, diversified by role.** Role diversity
  did produce genuinely different findings (R2 alone caught the `if/else` dispatch; R3 alone caught
  `clone.ts` and the content-hashing correction), but this is not model diversity and should not be
  reported as such.

---

## §3 · RULING 1 — SLOT COUNT AND ECONOMY

> [!IMPORTANT]
> **THE NAMED DESIGN: NO SLOT. ONE LIFETIME GRANT, FORFEITED ON DEATH.**
> A trinket is not worn, swapped or unequipped. It is a one-time, irreversible grant that is
> **consumed into `player.stats` at payout**, exactly as a Class-A ship delta is consumed into
> `component.strength`. There is no inventory, no provenance and no slot economy.

**Slot count: 0 — the concept does not apply.** The integer the task asked for is the *grant cap*,
and it is **one per stat per career**, enforced in the engine by the clamp of §4: a second grant
for a stat already at its ceiling is a no-op, not a stack.

**Why no slots.** A slot economy is only worth its cost if choosing between slots is a *decision*.
§2.3's best-response vector and regret figures are the test, and the rig does not find a decision
worth a save bump, a migration, a succession rule and a new indirection over 21 read sites. A
candidate that raises option *variety* while leaving the value-of-deciding flat is worse than it
looks, and B is that candidate.

**Can a trinket be unequipped or sold? No.** There is nothing to unequip: no item identity
survives the grant. This is the same property the Class-A ship arm already has.

### 3.2 Succession — the ruling the reviewers forced

**A trinket-granted delta is FORFEITED on death.** `applySuccession` must reset the trinket
contribution, and the enforcing line is a **one-line addition to `legacy.ts`** beside the existing
`state.player.ship = starterShip()` at `legacy.ts:86`.

**This is mandatory, not polish.** Today `applySuccession` **RESETS** the ship (`legacy.ts:86`)
and **CARRIES** stats (`legacy.ts:28`, *"stats (v1: no reset)"*). Under candidate A, saying
nothing about succession does not produce "the same as everything else" — it produces the
opposite: a trinket would become **the only acquired bonus in the game that outlives its owner**,
strictly more permanent than the ship upgrade it claims to mirror, ratcheting across an unbounded
number of successions. Silence here is not a smaller feature; it is a bigger one shipped by
omission.

**The exact rule, so an implementer has nothing to decide:** `applySuccession` resets
`player.stats` to the base row `createInitialState` writes — through the *same* function, never a
restated literal (the `MIGRATIONS[9]` precedent: *a rule is called, never restated*). Because
`legacy.ts` already resets `ship` this way, the shape is established.

**No save bump is incurred by this** — it resets an existing field's value; it adds no field.

---

## §4 · RULING 2 — DELTA BOUNDS, PER STAT

> [!IMPORTANT]
> **THE NAMED DESIGN: `+1`, EXPRESSED AS A LITERAL TYPE.** The `delta` field's type is the literal
> `1` — not `number`, not `1 | 2`. A `+2` must be a **compile error**, not a code-review catch.
> Negatives are **out of scope** (§4.2).

| Stat | min | max | Reason, anchored to the measurement |
| --- | --- | --- | --- |
| **PILOT** | +1 | **+1** | The only stat with a *sanctioned* existing equivalent (`navigation.strength`, §4.1). `+1` = the band-4 ceiling, undamped, plus 3 extra combat-retreat read sites. Family 2: +1.28pp pass rate, ≈0.9 die-pips freed. Rig: 21.5% of campaigns, 4/8 policies, `smuggler` **+1140cr** |
| **TRADE** | +1 | **+1** | The strongest live stat in the rig: 67% of campaigns, 6/8 policies, lowest regret (174cr), roughly linear to `+2` (+456 → +808). Reads at `trade.ts:167` and `combat.ts:617` |
| **GUNS** | — | **EXCLUDED** | §5.3. Measured dead (2.5% of campaigns; 1/8 policies by 15cr) **and** no existing content-authorable bonus path. Instrument caveat filed as F-151-9 |
| **GRIT** | — | **EXCLUDED** | §5.1. The collision is real, doubled, shared with the cast, and ratified. Not a member of `TrinketStat` |
| **GUILE** | — | **EXCLUDED** | §5.2. Measured dead: 2 campaigns in 2,400 (0.1%) |

**Why `+1` and not `±1-2` — three independent reasons, and the third is measured.**

1. **Against the shipped ladder.** `+1` already equals the entire band-4 ceiling
   (`item-lane-computer`, `navigation +10`), undamped and wider. `+2` is **two band-4 items in a
   single draw with none of the rarity gate** — the game has no tier above band 4 to price it in.
2. **Against the declared design range.** The PRD's stat band is `-2 … +5`, a 7-point spread; a
   `±2` trinket claims **2 of 7 points (≈29%) of the entire design range for one piece of loot**.
3. **Against the rig.** The `+2` arms are not a shrug: `trade_p2` moves **69.9%** of all campaigns
   and lifts `trader-degraded` by **+2,926cr** (8,836 → 11,762, a **33%** swing on one policy from
   one item). `grit_p2` cuts ship losses **46%**. Whatever `+2` is, it is not a trinket-sized
   effect — it is a difficulty setting.

**Both in-scope stats are Family 2** (§2.4), where the marginal pass-rate of `+1` is `+1.28pp` and
the real currency is die economy. `+1` is therefore already at the top of what the shipped ladder
can price, *not* a conservative opening bid that `+2` would sensibly extend.

### 4.2 Negatives (cursed trinkets) — OUT OF SCOPE

Mechanically free; refused on permanence grounds. An undamped debuff on a field with no removal
path is a soft-lock generator. Under §3.2's forfeit-on-death rule a curse would also be *cured by
dying*, which inverts its intent. If the owner wants cursed items, they belong on the ship
(damped, and already reset by `starterShip()`), not on the player.

### 4.3 Where the clamp lives — and that it does not exist yet

**The clamp is a NEW rule and must be authored and defended, not inherited.** The framing assumed
a trinket would clamp *"exactly as it clamps `component.strength` today"*. It cannot:
`COMPONENT_STRENGTH_MIN/MAX = 1/199` are about component strength, and **`player.stats` has no
clamp anywhere** — `StatBlockSchema` (`schema.ts:174-182`) is bare `z.number()`, `.strict()` on
keys only. That is safe today *only* because nothing ever writes the field.

- **The constant:** `TRINKET_DELTA_MAX`, in `packages/content/src/exploration.ts` beside the other
  band ceilings. Value **`+1`**.
- **The enforcing rule:** one engine function in `packages/engine/src/exploreOutcomes.ts`, applied
  inside `applyUniqueItem`'s new `'trinket'` arm, mirroring the existing `Math.min`/`Math.max`
  discipline of the `'component'` case.
- **The invariant it enforces:** a stat may exceed neither its base value plus `TRINKET_DELTA_MAX`
  nor the PRD's declared `+5` ceiling.

**Open, and deliberately so:** whether `StatBlockSchema` should gain numeric bounds. It is a real
validation hole the instant anything writes the field (a hand-edited save could set a stat to
`1e9` and pass `deserializeState` clean) — but it is a *save-validation* question, not a trinket
question. Filed as **F-151-5**, escalated, not closed here.

---

## §5 · RULING 3 — WHICH STATS ARE IN SCOPE

> [!IMPORTANT]
> **THE NAMED DESIGN: TWO IN, THREE OUT.** `TrinketStat = Stat.PILOT | Stat.TRADE`. GRIT, GUILE
> and GUNS are **not members of the type**, so an excluded stat is a compile error rather than a
> convention someone can forget.

**This section was rewritten by the rig.** The pre-measurement draft of this spec put GUNS in
scope on the grounds that no *collision* could be found for it. The measurement says a missing
collision is not the same as a live effect: `guns_p1` changes the outcome of **2.5%** of campaigns
and beats the control on **1 of 8 policies, by 15 credits**. Absence of a reason to exclude is not
a reason to include.

### 5.1 GRIT — EXCLUDED. The collision is real, doubled, shared, and ratified

The task asked whether a GRIT trinket collides with what the engine assumes about GRIT. **It does,
four ways at once:**

1. **It is the only stat in Family 1.** Every other stat is read off a die the player *chooses*
   (§2.4), where `+1` is worth `+1.28pp`. GRIT is read off `survivalRng.d20()` and off the
   interceptor's `rng.d20()`, where `+1` is worth the full **`+5.00pp`**. GRIT is therefore worth
   roughly **4× any other stat per point** — the exact inverse of the uniform band the task
   assumed.
2. **It pays twice from one delta.** `day.ts:725` (survive at 60% → 65%) **and**
   `interceptorPressureDc` (enemy hit rate −5pp). No other stat moves two independently-tuned
   formulas with one point.
3. **The DC function is shared with the cast.** `interceptorPressureDc(defenderStats)`
   (`combatRules.ts:96-97`) is *one definition* deliberately serving both the player's
   `applyEnemyPressure` and the NPC dusk encounter — its own comment says a second copy *"is
   exactly the drift R2c warns about."* A player-only GRIT trinket is a permanent, no-NPC-
   equivalent reduction in incoming hit rate.
4. **The band is explicitly ratified and closed.** `content/components.ts:150-167`: *"RATIFIED at
   10 … held where it stands."* A GRIT trinket silently re-tunes a closed, cited ratification.

**A GRIT trinket is not a content row; it is a rebalance.** If the owner wants one, the correct
sequence is: reopen the ratification, re-measure the survival curve, and answer the parity
question of §9.4 — *before* a single row ships.

### 5.2 GUILE — EXCLUDED, as a MEASURED dead option

Three real player-facing sites (`patrol.ts:56`, `hangout.ts:322`, `dare.ts:385`) against six-plus
for PILOT, and all three are Family 2, where `+1` buys `+1.91pp`. **The rig makes this concrete:
`guile_p1` changes the outcome of 2 campaigns out of 2,400 — 0.1% — and moves exactly one policy
median, by 27 credits.** A GUILE trinket is the weakest item the game could ship, and players
correctly read weakest-in-class as a trap. **Excluded by measurement, and named as such** rather
than shipped silently.

**Note the asymmetry this creates**, per C4: GUILE is *load-bearing on the NPC side* (the Liar's
Dice dealer AI is driven by `dealerGuile`). "GUILE is a weak stat" is true of the player only.

### 5.3 GUNS — EXCLUDED, as a measured dead option, with an instrument caveat

`guns_p1` changes **2.5%** of campaigns and beats the control on **1 of 8 policies by 15
credits** (§2.3(d), (f)). On the measurement, a GUNS trinket is a dead option.

> [!IMPORTANT]
> **The honest caveat, filed as F-151-9 rather than buried.** The `fighter` policy's median is
> **2,825 credits in every one of the eight variants** — bit-for-bit flat. A policy that does not
> move under *any* stat change is not measuring what a stat change does to combat. So the rig
> cannot distinguish *"GUNS is a dead option"* from *"the instrument cannot see GUNS."* The
> exclusion therefore rests on **two independent legs**: the measurement above, **and** the
> structural fact that GUNS has no existing content-authorable bonus pathway at all (§5.4), so a
> GUNS trinket would be the *first* way content can move a GUNS check — a materially larger design
> step than "one more way". **If the owner wants GUNS in scope, the honest prerequisite is fixing
> or replacing the `fighter` instrument first, not authoring a row.**

### 5.4 PILOT and TRADE — IN SCOPE

The two stats the rig finds live. **TRADE is the strongest by a wide margin** — it changes 67% of
campaigns, beats the control on 6 of 8 policies, carries the lowest naive-choice regret (174cr),
and scales roughly linearly to `+2`. **PILOT is second** — 21.5% of campaigns, 4 of 8 policies,
and it owns the single largest per-policy swing in the rig (`smuggler` **+1140cr**).

**One caveat the framing did not surface:** only PILOT has an existing content-authorable
check-bonus pathway (`navBonus`). For TRADE, a trinket would be the **first** way content can move
those checks at all. Two reviewers independently proposed the alternative — give TRADE a
`navBonus`-shaped component reader instead — and it is recorded unruled in §11 and §13.

---

## §6 · RULING 4 — ACQUISITION PATH

> [!IMPORTANT]
> **THE NAMED DESIGN: ONE PATH — the Explore `unique-item` row, gated to BAND 4.** Not the
> shipyard, not a new Hangout venue, and not band 2.

**The four paths, priced. This is why the other three are rejected:**

| Path | Per-instance cost | Verdict |
| --- | --- | --- |
| **Explore unique item** | **One engine change** (a third `ExploreItemDefinition` arm + the §7 dispatch refactor), then **unlimited content rows** | **CHOSEN** |
| Quest reward (`applyEffects`) | One new `StoryletEffects` field + one engine branch, then pure content. The only path that can be *narratively gated* | **Rejected as primary; viable second** (§13) |
| Shipyard special equipment | **Engine work per instance** — table row, `SpecialEquipmentId` union member, `ShipState` boolean, `hasSpecialEquipment` case, schema field, `deserializeState` backfill, `EQUIPMENT_DICE_BENEFITS` entry. Documented as **Finding F-100-1** (`EXPLORE_REDESIGN.md` **§6**, per C7). It also puts a unique find *on every yard's shelf* | **Rejected** — the exact anti-pattern this track exists to avoid |
| New Hangout venue | A new `VisitHangout` action variant, a new resolver arm, UI, and sim-protocol support — `HangoutVenueId` is compile-pinned to the action union by `AssertEqual` (`hangoutRules.ts:47-49`) | **Rejected** — most expensive of the four |

**Band 4 only, and this is load-bearing.** §2.4 shows a `+1` trinket matches or beats
`item-lane-computer`, the rarest thing the ladder grants. Band 2 draws on ≈24% of boards — far too
common a tap for an undamped, multi-site, permanent-until-forfeited bonus. **A trinket that can be
farmed is not a trinket; it is a stat editor.** The row's band is authored in content against
`EXPLORE_VALUE_BANDS`, and the existing per-band validator is what keeps it honest.

---

## §7 · RULING 5 — THE ENGINE/CONTENT SPLIT

> [!IMPORTANT]
> **THE NAMED DESIGN: a third arm on `ExploreItemDefinition`, and a dispatch converted from
> `if`/`else` to an exhaustive `switch`.** No new table, no new file. The engine owns the clamp
> and the grant; content owns every instance.

**Content — `packages/content/src/exploration.ts`, beside `ShipElementDelta`:**

```ts
// PROPOSED (T-151) — content. Illustrative.
export type TrinketStat = Stat.PILOT | Stat.TRADE; // GUNS/GRIT/GUILE are NOT members
export type StatDelta = { stat: TrinketStat; delta: 1 };       // literal 1 — +2 is a compile error

export type ExploreItemDefinition =
  | { id: string; name: string; class: 'ship'; deltas: readonly ShipElementDelta[] }
  | { id: string; name: string; class: 'module'; moduleId: ExploreModuleContentId }
  | { id: string; name: string; class: 'trinket'; deltas: readonly StatDelta[] }; // NEW
```

**Engine — `packages/engine/src/exploreOutcomes.ts`:** `applyUniqueItem` gains a `'trinket'` arm
that clamps into `state.player.stats[delta.stat]` through the §4.3 rule and emits the existing
`UniqueItemAcquired` event unchanged.

**The mandatory refactor, which the framing missed (C3, F-151-3).** `applyUniqueItem` today is
`if (item.class === 'module') { … } else { … }` — the `never` guard is on the **inner**
`delta.element` switch, not on `item.class`. **A third arm would compile silently into the `else`
and do the wrong thing.** So the first commit is a **behaviour-preserving extraction**: convert
the dispatch to `switch (item.class)` with a `never` default, prove it inert against the existing
goldens, and only then add the arm. That ordering is the standing constraint *"extract
behaviour-preserving before adding anything"*, and here it is not ceremony — it is the difference
between a compiler-enforced arm and a silent fall-through.

**The proof that the 74th trinket is a content row, not an engine change.** After the arm lands:
adding a trinket is one entry in `EXPLORE_ITEMS` plus one `unique-item` outcome row pointing at
it. No engine file is touched, no union is widened, no switch gains a case, no schema field is
added, no save version moves. The engine holds exactly three rules — *which stats are eligible*
(the `TrinketStat` type), *how big a delta may be* (`TRINKET_DELTA_MAX` + the clamp), and *what
happens on death* (§3.2) — and content holds every instance. The `grep -c 'if ('` discipline
applies unchanged: the new content rows add **zero** branches.

---

## §8 · SAVE SHAPE — stated explicitly

> [!IMPORTANT]
> **NO SAVE-SHAPE CHANGE.** Under the recommended candidate C, nothing changes at all. Under
> candidate A (§3–§7), **`CURRENT_SAVE_VERSION` stays at 15** (`save.ts:509`).

**Why A needs no bump.** A trinket's delta is baked into `player.stats`, a field that already
exists, is already covered by `StatBlockSchema` (`schema.ts:469`, `:614`), is already serialized
with all five keys, and already round-trips. No key is added, so no migration is owed and no
round-trip test is owed. §3.2's succession reset writes an existing field's *value*; it is not a
shape change.

**Correcting the task block:** it inherited *"`CURRENT_SAVE_VERSION` is 12 at track start."* The
live value is **15** (T-111, T-135 and T-145 have each bumped it since). Any future work must read
`save.ts:509`, not the task text.

**The debt candidate B WOULD owe, written down here even though this spec does not recommend
paying it.** If the owner rules for worn slots:

- `CURRENT_SAVE_VERSION` **15 → 16** (`save.ts:509`);
- `MIGRATIONS[15]` backfilling `player.trinkets` to `[]` — following the additive one-key shape of
  `MIGRATIONS[2]`/`[3]`/`[4]`, and **calling** the §4.3 clamp rather than restating it
  (`MIGRATIONS[9]` precedent);
- a `deserializeState` backfill and a `schema.ts` addition;
- an explicit succession rule in `legacy.ts` (§3.2 applies to B too);
- **a save round-trip test** — mandatory under the standing constraint;
- a new `effectiveStats(player)` reader, plus the **behaviour-preserving routing of all 13 player
  read sites** through it as a separate, provably-inert commit with every golden unmoved, *before*
  one trinket exists.
- **`clone.ts` needs NO change** — it is a generic `{...state}` + structural clone, so any new
  field on `player` round-trips with zero code (R3's lone claim, verified). This corrects the
  task's own cost estimate.

---

## §9 · Blast radius

### 9.1 Engine and content

- **13 player-side stat read sites and 8 NPC-side sites** (§1.4). Candidate A touches **none** of
  them — it changes the value they already read. Candidate B touches **all 21**.
- `applyUniqueItem` (`exploreOutcomes.ts:219-266`) — the dispatch refactor of §7.
- `legacy.ts` `applySuccession` — the one-line forfeit of §3.2.
- **Two callers, for free:** `resolveExploreOutcome` is reached by both the same-day resolve and
  T-111's deferred dusk payout, so a band-4 trinket grants at the dusk of `dueDay` with no second
  code path — but that is also **the double-application risk**: any implementation must assert the
  grant is idempotent, exactly as the `'module'` arm already is.

### 9.2 Tests, goldens and fixtures

- **No existing test pins `player.stats` across a run** (R4). The stat references in the engine
  suites are scenario *setup*, not invariants. **A missing clamp or a double-applied delta would
  be caught by nothing that exists today.** Any implementation task must add that pin itself; it
  cannot be inherited. Filed as **F-151-6**.
- Adding a content row moves `computeRulesFingerprint`, staling every balance fixture and owing a
  **capstone re-measure** — correctly, since new content *is* a ruleset change. It does **not**
  fail `balance-rig.test.ts` (C5): content is hashed wholesale.
- `packages/sim/src/__tests__/fixtures/replay-golden.ts` and the two golden STATE hashes are at
  risk from the §7 dispatch refactor **only if it is not inert** — which is exactly what the
  extraction commit must prove.

### 9.3 UI

`ui/format.ts:248` (`effectiveModifier: stats[PILOT] + navBonus(ship)`) and `App.tsx`
`CheckBreakdown` (`:3504`, `:4133`) already render the stat honestly, so a baked delta surfaces
with no UI change. **Candidate B would need a new pane** to show what is worn — a cost B's
advocates should not be allowed to omit.

### 9.4 THE NPC PARITY QUESTION — unruled, and this spec does not rule it

If the player can wear trinkets and the cast cannot, that is **a new row on THE PARITY LEDGER**
(`docs/NPC_REDESIGN.md:284`) — the twelfth verb beside Trade, Travel, Combat, Shipyard, Explore,
VisitHangout, Crew, Port, Reroll, Storylet and Wait. It is sharpened by two facts:

- `interceptorPressureDc` is **one shared definition**, so a player-only GRIT trinket would be a
  permanent asymmetry inside a function explicitly built to keep both sides on the same terms
  (this is one more reason GRIT is excluded, §5.1);
- `NPC_COMPONENT_STAT_AFFINITY` (`content/upgrades.ts:87`) makes a captain's purchase ladder a
  function of its stats, so a trinket-wearing NPC raises a second question nobody has asked —
  does it re-derive its affinity live, or freeze it at spawn?

**Deliberately not ruled here.** The Explore and VisitHangout parity rows are *already* deferred
pending an owner ruling (`NPC_REDESIGN.md`, re-asked at T-150); adding a trinket row is the
owner's call, not this task's.

---

## §10 · Findings

| id | Finding | Evidence | Status |
| --- | --- | --- | --- |
| **F-151-1** | `content/components.ts:164`'s prose says the GRIT-1 life-support save is *"9+ (55%)"*. It is **60%** (12/20); 55% is the GRIT-**0** figure. The `"9+"` and the GRIT-4 *"6+ (75%)"* are both correct | Exact solve, §2.4; found independently by all four reviewers | **OPEN — filed, not fixed.** A comment, so a fix moves no fingerprint/band/threshold/golden. T-151 touches no content source |
| **F-151-2** | *"±1-2, mirroring ship-component deltas"* is a false premise: component deltas are damped 10:1 by `NAV_BONUS_DIVISOR` and feed one reader; a stat delta is undamped and feeds every reader of that stat | §2.4; `components.ts:208-210`; `EXPLORE_REDESIGN.md` F-114-B | **CLOSED by this spec** — §4 sets `+1` as a literal type |
| **F-151-3** | `applyUniqueItem` dispatches on `item.class` with `if`/`else`; the `never` guard is on the inner `delta.element` switch. A third arm falls through silently | `exploreOutcomes.ts:226-231` | **CLOSED by this spec** — §7 makes the switch conversion a prerequisite commit |
| **F-151-4** | A new content file does **not** fail `balance-rig.test.ts`; content is hashed wholesale (`CONTENT_NON_RULE_SOURCES` excludes only `index.ts`). It does stale every balance fixture and owe a capstone | `rules-fingerprint.ts:104-113`; `balance-rig.test.ts:78-90` | **CLOSED** — corrects the task's own framing |
| **F-151-5** | `StatBlockSchema` (`schema.ts:174-182`) has **no numeric bounds**. Safe only while nothing writes `player.stats`; a real validation hole the instant anything does | Read directly | **ESCALATED** — a save-validation question, not a trinket question |
| **F-151-6** | No existing test pins `player.stats` across a run, so a missing clamp or a double-applied delta would be caught by nothing | R4; the engine suites use stats as scenario setup | **ESCALATED** — any implementation task must add the pin |
| **F-151-7** | Routine travel is no longer a PILOT check (`travel.ts:610-629`, T-1605); only the one-time Nemesis Crossing survives. PILOT's recurring check surface is the Explore nav DC 12 plus combat retreat | Read directly; confirmed by two reviewers | **CLOSED** — corrects the task's own MEASURE framing |
| **F-151-8** | `TASKS.md`'s M6 header says stats are *"rolled once at character creation."* They are hard-coded literals (`state.ts:147-153`); nothing rolls them | Read directly; confirmed by four reviewers | **OPEN** — a `TASKS.md` prose correction for the owner |
| **F-151-9** | **The `fighter` sim policy's day-35 median is 2,825cr in all eight rig variants — bit-for-bit flat under every stat change, including `+2` GRIT.** A policy that does not move under any stat perturbation cannot measure what a stat does to combat, so the rig cannot separate *"GUNS is a dead option"* from *"the instrument cannot see GUNS"* | §2.3(b), (d); `n` = 300 per cell | **ESCALATED — an INSTRUMENT finding, not a balance one.** It is the reason §5.3's GUNS exclusion is argued on two independent legs. Fixing the instrument is the prerequisite for any future GUNS ruling. **An automated detector now exists (T-167, 2026-08-04):** `assertVariantsPerturbEveryPolicy` (`packages/sim/src/balance/gate.ts`) fails when a policy is bit-for-bit identical to the control across every live variant, and is replayed against this exact §2.3(b) matrix in `packages/sim/src/__tests__/sweep-gate.test.ts`. **The finding itself is still OPEN — T-174 owns fixing `fighter`;** what changed is that it can no longer go unnoticed |
| **F-151-10** | `trade_p1`/`trade_p2` drive **life-support failures and scares to zero** (2→0, 7→0) despite TRADE touching neither formula — a second-order routing effect, not a direct one | §2.3(c) | **CLOSED as observed** — evidence for *"check how outcomes are reached, not just who wins"*: a stat delta changes which days happen, not just how well they go |

---

## §11 · What this spec deliberately does not settle

- **Whether to build any of this.** §12. The bakeoff recommends **C**; the ruling is the owner's.
- **Whether NPCs get trinkets.** §9.4 — a new PARITY LEDGER row, deferred with the Explore and
  VisitHangout rows already awaiting the same owner.
- **Whether `StatBlockSchema` should gain bounds** (F-151-5). A save-validation question.
- **Whether the `content/components.ts:164` prose error is fixed now or batched** (F-151-1).
- **Whether GUNS and TRADE should get a `navBonus`-shaped component pathway** — three of five
  stats have *no* content-authorable bonus route today, trinkets or otherwise. Two reviewers
  independently proposed this as *smaller and more consistent* than a trinket system. It is a
  genuinely different answer to the owner's underlying want and is recorded, unruled, in §13.
- **Explore's pricing, the manifest version, and anything about the Hangout** — owned elsewhere,
  untouched here.

---

## §12 · OWNER DECISION REQUIRED

**No ruling was made by this task.** Three questions, each as a named option list.

### 12.1 The go/no-go

| Option | What it means | Cost | Who recommends it |
| --- | --- | --- | --- |
| **C — do nothing** | Stat ambitions keep being re-authored as ship-element deltas per `EXPLORE_REDESIGN.md` §4.1 — damped, band-gated, and reset on death | **Zero** | **All four reviewers, and the rig does not overturn it. RECOMMENDED** |
| **A — build §3–§7 as specified** | `+1` only, **PILOT and TRADE only**, band 4 only, forfeited on death, no save bump | One engine refactor + one arm + one `legacy.ts` line, then content. Owes a capstone **and a 10× re-run of §4/§5** (§2.7) | Second choice of all four, *only* with §4's bound and §5's exclusions |
| **B — worn slots** | The only candidate with a real slot economy | Save 15 → 16, migration, round-trip test, succession rule, `effectiveStats` routing over 21 read sites, a new UI pane | **None. Refused by all four** |
| **D — dice-side only** | Reskin a `DiceBenefit` as a trinket | Zero new surface | Only if the owner reframes the ask: L4 means it cannot be scoped to a stat, so it can only mean *"better in general"* |

### 12.2 The ruling-2 question, answered as asked

> *Is a stat trinket the second check-level modifier surface that ruling 2 reserved for a fresh
> owner call — or is it a different thing?*

**NO — unanimous, 4/4.** Ruling 2 reserves a **scoping surface for `DiceBenefit`** (limit L4): a
way to narrow a floor/reroll/extra-die to a named check. A stat trinket touches no `DiceBenefit`,
no `dawnDiceModifiers`, and not `check()`'s signature. It changes the value of `statValue`, the
argument `check()` has always taken, through the struct every read site already consults — the
same pattern as the already-sanctioned Class-A ship delta, one noun over.

**But answering NO does not clear it.** Both throttles that keep Class A and Class B honest — the
`/10` divisor and the three-module cap — are inapplicable to a stat delta *by construction*. It is
not the forbidden surface, yet it can trivially out-power what the forbidden surface would have
delivered. **The guardrail that would normally catch this does not apply, so the bound must be set
by hand, deliberately** — which is what §4 does, and what the owner must confirm.

### 12.3 The write-once ruling — a fresh call the task did not ask for

`player.stats` has had **zero writes outside `createInitialState`** for the life of the track, by
design, and `applySuccession` **carries** it while **resetting** the ship. Several things quietly
depend on that contract: the ratified GRIT band, `NPC_COMPONENT_STAT_AFFINITY`, and the
succession split itself.

**Option W1 — keep write-once.** Ruling C follows automatically.
**Option W2 — open the field, with §3.2's forfeit-on-death as the price.** Required by A and by B.

**This is the decision, not the trinket.** Every reviewer arrived at it from a different direction.

### 12.4 One thing the owner should know before ruling on GUNS

If the ruling is **A**, §5.3 excludes GUNS partly on a measurement the instrument may not be able
to make (**F-151-9**: the `fighter` policy is flat at 2,825cr across all eight variants). The
exclusion is *safe* either way — it ships nothing — but **it should not be read as a settled fact
about GUNS.** If the owner wants GUNS in scope, the honest order is: fix the instrument, re-measure,
then rule. This spec does not ask the owner to decide that now; it asks that the ambiguity not be
laundered into a certainty later.

---

## §13 · Handoff — which future task implements which section

**Nothing below is scheduled.** These rows exist so that if §12 rules for A, the task list writes
itself; if it rules for C, this table is the record of what was declined.

| Task | Implements | The accept criterion it would satisfy |
| --- | --- | --- |
| *(prerequisite)* | §7's dispatch refactor **alone** | `applyUniqueItem` converted from `if`/`else` to `switch (item.class)` with a `never` default. **Behaviour-preserving and provably inert** — every golden and both STATE hashes byte-identical, zero content rows added. This commit must land and be proven inert *before* any arm exists (F-151-3) |
| *(engine)* | §4.3, §5, §7's arm, §3.2 | `TrinketStat` (GUNS/GRIT/GUILE not members), `StatDelta` with literal `1`, `TRINKET_DELTA_MAX`, the clamp rule, the `'trinket'` arm, the idempotence assertion for the two-caller payout path, and the one-line forfeit in `legacy.ts`. **No save bump; `CURRENT_SAVE_VERSION` stays 15.** Adds the `player.stats` pin F-151-6 says does not exist |
| *(content)* | §6 | Band-4 `trinket` rows + their `unique-item` outcome rows, against the existing per-band validator. **Zero engine lines.** Proves §7's claim that the 74th trinket is a content row |
| *(capstone)* | §9.2 | One batch capstone per milestone, **after `npm run format`**, re-pinning the baseline of record; the fingerprint moves because content moved, which is correct |
| *(owner, unruled)* | §9.4 | The PARITY LEDGER row: do NPCs wear trinkets, and does a trinket-wearing NPC re-derive `NPC_COMPONENT_STAT_AFFINITY` live or freeze it at spawn |
| *(owner, unruled)* | §11 | The alternative two reviewers preferred: give GUNS/TRADE a `navBonus`-shaped component pathway instead of a trinket system — damped and death-reset by construction, no `player.stats` write, no save question |
| *(instrument, prerequisite to any GUNS ruling)* | F-151-9 | Fix or replace the `fighter` sim policy, whose day-35 median is **flat at 2,825cr across all eight rig variants**. Until it moves under a stat perturbation, no measurement can say anything about GUNS — including this spec's own exclusion, which is why §5.3 argues on two legs. The DETECTOR shipped at T-167 (`assertVariantsPerturbEveryPolicy`, `packages/sim/src/balance/gate.ts`); that predicate returning zero violations over the fixed rig's arms is T-174's exit check |
| *(housekeeping)* | F-151-1, F-151-8 | The `content/components.ts:164` 55% → 60% prose fix, and the `TASKS.md` M6 "rolled once at character creation" correction |
