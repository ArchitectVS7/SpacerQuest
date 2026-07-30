# NPC Redesign — the 30 NPCs play the full player loop

**Status:** active work list. The NPC parity track (N-series), extracted whole from
`BALANCE-REDESIGN-WORKLIST.md` on 2026-07-29 by owner decision, so the track has one
document and one target. Every step entry below was moved verbatim in that extraction;
nothing was re-graded or re-measured in the move. The R-series (the balance redesign
proper) stays in `BALANCE-REDESIGN-WORKLIST.md`, PAUSED behind this track's N8 — see
"After N8" at the end of this document.
**Companions:** `BALANCE-REDESIGN-WORKLIST.md` (the R-series record, and the two
known-red `it.fails` tripwires the battery carries — both R-owned; the N-series runs
against a green gate and any third failure is unambiguously the N-task's),
`BALANCE-POLICY.md` (governance, plus the archetype vocabulary and measured baseline in
its Part D), `PRD-REIMAGINED.md` (design intent), `docs/VERSIONING.md` (the N-series is
the named gate for 0.5.0).
**Cross-references:** `R#` step references resolve to `BALANCE-REDESIGN-WORKLIST.md`.
`OI-#` items are the 2026-07-29 doc-vs-code audit; these entries are its whole record
(grep the OI number, here and in the worklist). Fuller per-step records than the pruned
"Still binds" blocks: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md` for
N0–N2/N6/N7/N9, and `git show a9cffd85 -- docs/NPC_REDESIGN.md` for N3/N4/N7-RIG/N10.

**THE PRUNE RULE, since this document is the record and records grow.** A SHIPPED step
keeps its verdict, its "Still binds" bullets and a `git show` pointer — nothing else. The
test is PROSPECTIVE vs RETROSPECTIVE: *does this text change what the next step does?* If
yes it stays; if it only says what happened, git has it losslessly at a hash. Three things
are explicitly NOT prunable, because they are the reason the record exists: **lessons that
changed method** (e.g. "a status board is not evidence"), **superseded-formula landmines**
(e.g. "do not re-derive `2 + 2·tier`", "31 is the BOARD size and is not to be 'fixed'"),
and **owner rulings**. Full measurement tables, red-test enumerations and hash-by-hash
re-pin logs go to git — most are already duplicated at their definition site in code,
which is the copy that cannot go stale. Both `#### The audit that reopened this step`
blocks are kept in full by owner decision (2026-07-29).

---

## THE SINGLE TARGET, and what "done" means

The 30 NPCs operate with the full player loop — same rules, same prices, same
functions, to simulate a multiplayer field. THE PARITY LEDGER below is the completion
criterion: **this track is DONE when every ledger row is SHIPPED, fast-forwarded under
the standing constraint, or EXCLUDED by a recorded owner ruling — and N8 has re-pinned
the baseline of record against that field.** Three rows are UNRULED today (Explore,
VisitHangout, Storylet); they are owner decisions owed, and they gate N8.


## THE NPC PARITY TRACK (N-series)

**Why this track exists, and why it interrupted the R-series.** The balance work kept
producing findings that were really one finding: the 30 NPCs are not playing the game.
They are an economic texture generator wearing a captain's name. Owner's framing, and
it is the right one — *"an NPC needs to trade, so they need to upgrade their ship. They
need to fly, so they need to interact with pirates. That means they pay bribes, with
either credits or cargo, or fight, or flee. They literally MUST act like a player."*

**STATUS BOARD** — updated as each step lands; the per-step `**Result:**` blocks below are
the detail. Run order is N0 → N1 → **N7** → N2 → N6 → N3 → **N4** → **N10** → **N11 → N12 → N13** →
N5 → N8 (see "Sequencing at a glance" for why N7 moved and why N4 kept its early slot;
N10–N13 added by owner ruling 2026-07-29 — see THE PARITY LEDGER below). **Next unblocked
step: N11.**

| step | status | outcome |
| --- | --- | --- |
| N0 — copy-on-write discipline | **SHIPPED** | clone flat in NPC richness, not linear; killed the quadratic |
| N1 — NPCs own a real ship | **SHIPPED** `b438096b` | change accepted, **hypothesis disproved** — capstone byte-identical; found the N2 blocker + the fuel exemption |
| N7 — capstone diff + smoke rig | **SHIPPED** | **accepted** — 1.5 s smoke vs 2 min capstone; staleness fails loudly; found N9 |
| N2 — NPCs upgrade their ships | **SHIPPED** | **ACCEPTED** — spread max/median 13.4→155, fits 5→144, Honor List 2/8→8/8 contested; found R10 |
| N6 — Honor List, 31-way board | **SHIPPED** | **accepted** — actor-shaped board; found 6 of 8 titles uncontestable by construction |
| N3 — NPCs meet pirates | **SHIPPED 2026-07-29 (rebuilt)** | encounters on every NPC jump, stance triangle on the shared rules, permanent death, four dead-field skips; **capstone discharged at N4** (the two steps share one capstone, and the cost of that is under N3's own Result) |
| N4 — NPC archetypes | **SHIPPED 2026-07-29 (rebuilt)** | **ACCEPTED** — the Ideal×archetype blend, a hand-curated 6/6/5/5/4/4 roster, and a control arm that makes the effect attributable: median wealth trader +43% / veteran +31% / gambler −38% / explorer −99% / fighter −71% against the neutral arm. Found the **verb payout asymmetry** (only Trade pays) and two live instrument bugs |
| N5 — NPC proficiency spread | TODO | reuses R1's `PilotDegradationProfile`; **GATED BY N13** — its die-allocation lever needs a decision surface to act on |
| **N10 — NPCs work the contract board** | **SHIPPED 2026-07-29** | **CHANGE ACCEPTED · HYPOTHESIS DISPROVED** — the shared per-system pool is built and the cast works it galaxy-wide, but competition is not a force: cast demand is ~6% of the galaxy's job supply, and neither throttle was ever the binding constraint. The step's real effect was the parity gap it was not looking for — the cast now CHOOSES its contract (`pickContract`), worth +247% on cast median wealth. **The non-trader floor did not move (p10 126 → 126)** |
| **N11 — NPCs earn deeds and Renown** | **TODO · MUST-HAVE** | removes the rank −1 dead end; the yard's Renown gate becomes reachable with no NPC branch |
| **N12 — NPCs buy ports** | **TODO · MUST-HAVE** | lands BEFORE N8; pulls N8's aggregate-sees-assets task forward as its own first task |
| **N13 — NPC decision surface (dawn-hand parity)** | **TODO · MUST-HAVE** | literal reduced hand vs algorithmic equivalent — owner accepts algorithmic fast-forward; gates N5 |
| **N14 — captain voice: the daily wire boast** | **TODO · EXPERIMENT** | owner spec 2026-07-29 — 3 boasts × 30 captains, top-3 candidates, one per day, 2-day cooldown + line rotation; **not** PvP messaging (PRD non-goal) |
| **N9 — the instrument's three unplayed actions** | **SHIPPED** | **hypothesis REJECTED** — verbs cost 38% of fleet cash, not gain; found the aggregate cannot see an asset |
| N8 — re-pin against a living field | TODO | **must first teach the aggregate to see ports**; re-pin against the post-N9 instrument; **follows N10–N12** (owner ruling 2026-07-29) |

> [!NOTE]
> **MEASUREMENT DEBT DISCHARGED (2026-07-29).** The caution that stood here recorded
> `balance:smoke` RED on the N7 staleness gate, because N3's roster split and N4's
> archetype field moved hashed rule sources and **neither step ran its capstone**. It
> was resolved the way the gate demands — **a new capstone, never a refreshed
> number**: `docs/balance/baseline-n4-shipped.json` (1,000 seeds × 120 days × 8
> policies = 8,000 runs, both `--milestone-days` and `--aggregate` honoured, fixture
> re-extracted FROM it with `spreads harvested`). Fingerprints moved to rules
> `c9530236d51b237e` / instrument `75e73b1e7d32168c` / docs `774c91af0fbdecc0`.
>
> **The battery stands at 1,312 passing / 0 failing** (engine 769 · sim 306 · ui 135
> · desktop 102) with `balance:smoke` green — **updated at N10**, which entered at
> 1,287/0 and left at 1,312/0. N4 entered at **1,184 / 23 failing**; both steps
> summarise their inherited reds under their own Result and the red-by-red account is
> in git at the pointer each carries. One `it.fails` tripwire was filed at N4 — see
> that Result; it is still correctly red at N10's widened sample.
>
> **BASELINE OF RECORD RE-PINNED AT N10** to
> `docs/balance/baseline-n10-shipped.json` (1,000 seeds × 120 days × 8 policies =
> 8,000 runs, both `--milestone-days` and `--aggregate` honoured, fixture
> re-extracted FROM it with `spreads harvested`). Fingerprints are now rules
> `3079dec9aa5a4af0` / instrument `979f28907cf89d1d` / docs `db4715d924429106`.

**WHAT AN NPC ACTUALLY IS TODAY (measured 2026-07-28, `packages/engine/src/npc.ts`):**

> **PARTLY SUPERSEDED (2026-07-29 audit, item OI-10) — kept as the track's baseline
> description.**
> N1 gave every captain a real ship and N2 a real upgrade decision, so the "no ship, no
> components, phantom trading" bullets below describe the field as the track FOUND it,
> not HEAD. **Superseded further by N3** (encounters and permanent death are real) and
> **by N10** (captains claim off the shared per-system job pool wherever they fly, and
> choose which job by archetype). Still true at HEAD: **no deeds or rank (N11), no
> ports (N12), and one coarse d20 action per day (N13)** — and note that the last
> bullet below, *"the NPC field does not face the game's central decision"*, is the one
> statement here that nothing has yet touched.

- `NpcState` is `{ id, name, profileId, currentSystemId, credits, fuel, disposition,
  lastAction }`. **No ship. No components. No XP.**
- It trades against a **phantom ship** derived from a static profile tier —
  `npcCargoPods(tier)`, `hullCondition: 9`, `npcDrives(tier)` — that never changes for
  the whole career. So an NPC's income cannot grow with investment, because there is no
  investment.
- `executeTravel` picks a random destination, burns fuel from that phantom drive, rolls
  a PILOT check for "clean vs rough jump", and arrives. **It generates no encounter.**
  An NPC has never met a pirate.
- `executeCombat` is an abstract GUNS check against no one, paying a flat `150 x tier`
  bounty. No interceptor, no stance, no damage, no repair, no ship loss.
- One action per day, on a random d20 — against the player's five-die hand with
  allocation. **The NPC field does not face the game's central decision.**

**The measured performance envelope this track has to live inside** (all taken
2026-07-28; see the N0 result for the change that bought the headroom):

| | per game day | 1,000-seed sweep, 8 cores |
| --- | --- | --- |
| today (abstract NPCs) | 1.07 ms | ~2.5 min |
| 30 full-fidelity NPCs, naive | 51.4 ms | ~103 min |
| 30 full-fidelity NPCs, post-N0 | ~40 ms | ~80 min |

**Full fidelity is affordable for PLAYING and expensive for MEASURING** — 40 ms/day is
imperceptible, an 80-minute sweep cannot be an iteration loop. That asymmetry is not a
problem to solve, it is the shape of the plan: the full sweep becomes an infrequent
CAPSTONE and the fast loop is staged smoke tests seeded from its output (N7).

### THE STANDING CONSTRAINT FOR THE WHOLE TRACK — same rules, no exemptions

*Owner ruling, 2026-07-28. This governs every N step and outranks any per-step
convenience.* **An NPC plays by the rules a player plays by.** Not "similar rules",
not "rules calibrated to produce similar outcomes" — the same functions, the same
costs, the same constraints. Where an NPC cannot use the engine's own function today,
the fix is to make the function usable by both (give it an actor parameter), never to
write the NPC a private one. R2c is the standing warning: the sim kept a private copy
of the yard ladder that had inherited the same bug as the engine, so it agreed with the
engine **for the wrong reason** and hid a live economy defect for months.

**Two consequences that are easy to miss, both already live:**

1. **Capability is a property of the SHIP, not of the captain's tier.** Tier and
   capability correlate only because a tier-5 captain *earned* a tier-5 ship. So cargo
   capacity is **objectively not a static per-captain value** — an NPC that profits from
   a delivery can buy pods, and its capacity changes. Any step that treats capacity as a
   function of `profile.tier` has re-introduced the phantom. N1 removed the last such
   read (`npcCargoPods`/`npcDrives` are now seed-only); N2 is what makes the value
   actually move.
2. **A number chosen so that a rule will NOT bite is a rule exemption, even when the
   resulting state is legal.** N1's `npcHullStrength` is the live example, and it is
   flagged at its own definition site: the ramp was calibrated against the phantom's
   *unbounded* tank rather than against what a player's ship of that capability would be.
   The seeded ships pass `maxCargoPodsForShip` — but a tier-1 NPC holds 4 cargo pods and
   a **1,200-unit tank**, where a player with comparable capacity (the junker: 10 pods,
   hull strength 1) holds **300**. **NPCs currently fly on ~4× a player's fuel.** That is
   an exemption, and N2 owns removing it (see N2's first two tasks).

### THE PARITY LEDGER — which player verbs the cast must play (owner ruling 2026-07-29)

*Recorded from the owner directly, after the 2026-07-29 doc-vs-code audit of the shipped
N steps. This ruling adds four MUST-HAVE steps (N10–N13) and turns "all or most of a full
player's actions" from a preamble sentence into a checkable ledger.*

**The ruling.** The 30 NPCs must perform all or most of the actions of a full player, to
simulate a multiplayer field. Specifically MUST-HAVE: NPCs **interact with trade
contracts** (N10), **gain Renown** (N11), and **buy ports** (N12) — the owner had assumed
ports were already NPC-purchasable; they never were. *"If these actions can be
fast-forwarded algorithmically that is fine, but they must happen"* — the coarse
one-action day may stand in for hour-by-hour play, but the ACTION itself must occur, under
the same rules and the same prices, priced through the engine's own functions and never
through a private parallel model (the standing constraint above is unchanged by this
ruling; it is what makes the fast-forward honest).

**The ledger** — the player's eleven verbs, audited against the cast at HEAD (2026-07-29):

| player verb | NPC today | owed by |
| --- | --- | --- |
| Trade | coarse haul, but on the SHARED pool: every captain draws the local board through the player's own `generateManifestBoard` and CHOOSES off it by archetype (`pickContract`), and the claim debits a per-system ledger that sizes the next board the player sees there. The co-location gate no longer gates participation — it governs only the visible snipe | shipped (N10) |
| Travel | real fuel, real routes, real encounters, real permanent death | shipped (N3) |
| Combat | interdiction on the SHARED rules, one-tick — same DC, tribute, damage, salvage, retreat. **NOT `resolveCombat`**: gives up die CHOICE only, closed by N13. **GAP FOUND AT N4:** that is the verb a captain is FORCED into; the one they CHOOSE (`executeCombat`) is still the pre-N3 abstract GUNS check + flat `150 × tier`, with no interceptor, no damage and no ship loss — so the six fighters take 6.4 interdictions each and **0 deaths** | shipped (N3) · N13 closes the die gap · **`executeCombat` still owed** |
| Shipyard | full price/gate parity via `ShipyardActor` — **but the refit spends no die** where a player burns 1 of 5 even on a refusal (watch item **OI-9**, argued under N2's Result) | shipped (N2) · OI-9 open |
| Explore | never | **UNRULED — owner decides by N8** |
| VisitHangout | Socialize stand-in; no borrow/repay | **UNRULED — owner decides by N8** |
| Crew | never (meaningless without a hand) | N13 decides |
| Port | never — the player is the only possible port owner | **N12** |
| Reroll | n/a without a hand | N13 decides |
| Storylet | authored player-facing content | **UNRULED — owner decides by N8** |
| Wait | Idle | shipped |

Renown is the verb-less twelfth row: every rank gate applies to NPCs (`actorRankIndex`
returns −1 without a registry) but no deed can ever accrue — a no-recourse lockout, which
consequence 2 above already defines as an exemption. **N11** removes it.

The three UNRULED rows are deliberately not defaulted: "most" is only honest if every
exclusion is a recorded decision rather than a silent gap. Rule on each (implement,
fast-forward, or exclude with a reason) before N8 pins the living-field baseline.

---

## UNRULED VERBS — decision memos (prepared 2026-07-29)

The ledger leaves three rows UNRULED (Explore, VisitHangout, Storylet). These memos cost
each row out so that the owner's eventual call lands against measured numbers rather than
an intuition about symmetry. **They make no call and change no code.** Each memo lays out
(a) what the player's verb does, (b) what the cast has instead, (c) the three options with
their real prices, (d) a recommendation with its reason, and (e) nothing further — it
closes on `DECISION: OWED` and stops there. The ledger rows above are left untouched on
purpose: a memo is an input to a decision, not the decision.

### Explore — decision memo

**(a) What the PLAYER's Explore actually does.**

- Reached only from `applyPlayerAction` (`packages/engine/src/day.ts:206`; the Explore
  branch is at `:409`), which dispatches into `resolveExploration`
  (`packages/engine/src/actions/exploration.ts:103`).
- **Entry cost is a die out of the dawn hand.** `spendDie(currentHand, index)`
  (`packages/engine/src/dice.ts`) is the gate, and three typed failure paths short-circuit
  before anything at all is spent: `no-die`, `invalid-die-index`, `die-already-spent`.
- **Then a fuel gate.** `EXPLORATION_FUEL_COST = 80`
  (`packages/content/src/exploration.ts:43`, imported at `actions/exploration.ts:3`). The
  die is spent anyway on a dry tank, deliberately mirroring Travel's dry-tank path.
- **Then a PILOT nav check through the shared `check()`** — `player.stats[Stat.PILOT] +
  navBonus(ship)` (`navBonus` in `packages/engine/src/components.ts`) against
  `EXPLORATION_NAV_DC = 12` (`packages/content/src/exploration.ts:42`). It emits a
  `StatCheck` with a hardcoded `actor: 'Player'` (`actions/exploration.ts:194`).
- On success a seeded POI (`BEACON_DISCOVERY_CHANCE = 0.5`,
  `packages/content/src/exploration.ts:47`) is pushed into
  **`nextState.player.charts.discoveredPois`** (`ChartsState` / `DiscoveredPoi`,
  `packages/engine/src/types.ts:1238-1259`) — a field whose own doc comment defines it as
  persistent knowledge that "survives death and passes wholesale to the successor".
- Then `resolveLoot` (`actions/exploration.ts:25`) rolls `POI_LOOT`
  (`packages/content/src/exploration.ts:106`) three times independently, in a fixed order:
  - **salvage** — beacon 0.55 x 40-180, derelict 0.8 x 120-520 -> `state.player.credits`,
    plus a `SalvageRecovered` event;
  - **fragment** — beacon 0.30, derelict 0.35 -> `grantFragment(state.player.nemesisFile,
    ...)` (`packages/engine/src/nemesis.ts`), feeding the authored Nemesis arc;
  - **contraband** — derelict 0.40 -> sets the *global* flag
    `state.flags['signal.contraband.pending']`, which arms the `derelict.sealed-pod`
    storylet (the carry choice).
- Content-derived EV per **discovered** POI: `0.5 x (0.55 x 110) + 0.5 x (0.8 x 320)` =
  **158cr**. That figure is derived from the content table, not measured; the measured
  per-*attempt* number in (d) is far lower, because two attempts in three never reach a POI
  at all.

**(b) What the cast has instead.**

- `npc.ts` has **no exploration verb**. It has five, dispatched by `resolveNpcDay`
  (`packages/engine/src/npc.ts:1604`, if/else chain at `:1675-1687`) off `pickIntent`
  (`npc.ts:583`): `executeTrade` (`:1324`), `executeTravel` (`:1462`), `executeCombat`
  (`:1509`), `executePatrol` (`:1545`), `executeSocialize` (`:1573`).
- `NPC_INTENT_TYPES` (`packages/content/src/ideals.ts:14`, imported at `npc.ts:10`) has
  exactly five members — `Trade | Travel | Combat | Patrol | Socialize`. There is no
  Explore member, so **the cast's Explore frequency is 0 by construction**. That is the
  honest statement; "0.00 measured" off a small arm is what standing amendment 1 forbids.
- The nearest analogue is `executePatrol` (`npc.ts:1545`): it burns `NPC_PATROL_FUEL = 10`
  (`npc.ts:493` — note this one is an *engine* constant, not content), rolls GRIT through
  the shared check against `NPC_CHECK_DCS.Patrol = 11` (`ideals.ts:46`), and pays
  `NPC_PATROL_SUCCESS_CREDITS = 40` or costs `NPC_PATROL_FAIL_CREDITS = 20`
  (`ideals.ts:66,69`). So the cast already owns a cheap "sweep" verb at 10 fuel; the
  player's Explore is 80.
- `NpcState` (`packages/engine/src/types.ts:1153-1206`) carries **no `charts`, no
  `nemesisFile`, and no `registry`** (the last is N11's). Its fields are id / name /
  profileId / currentSystemId / credits / ship / disposition / lastAction / dead.
- Fuel is not free for the cast either: `refuelIfNeeded` (`npc.ts:714-725`) buys at
  `localFuelPrice` (`packages/engine/src/economy.ts:119`) — the same function the player's
  market uses, sourcing `FUEL_DEFAULT_BUY_PRICE = 5` and `RIM_FUEL_BUY_PRICE = 8`
  (`packages/content/src/systems.ts:209,220`). An NPC exploring would face the identical
  bill: 80 fuel is **400cr core / 640cr rim**.

**(c) The three options, each with its real cost.**

**Option 1 — implement (full parity).** `resolveExploration` would gain an actor
parameter, which means parameterising seven player-scoped touches: `player.dawnHand`,
`player.ship.fuel`, `player.stats[PILOT]` + `navBonus(ship)`,
`player.charts.discoveredPois`, and inside `resolveLoot` — `player.credits`,
`player.nemesisFile`, and the *global* `state.flags['signal.contraband.pending']` (an NPC's
derelict would otherwise arm the **player's** storylet) — plus the `StatCheck` event's
hardcoded `actor: 'Player'`. The prices, stated plainly:

- **A dawn hand the cast does not hold.** `spendDie` is the verb's entry gate, and NPCs
  have no hand until **N13**. That is exactly why the ledger already defers `Crew` and
  `Reroll` to N13, so full-parity Explore is not reachable before N13 either.
- **A save-shape change.** Giving `NpcState` a `charts` (and/or `nemesisFile`) field is a
  version bump plus a migration plus a round-trip test, with the migration *calling* a
  seeding rule shared with `createInitialState` / `deserializeState` — the
  `MIGRATIONS[9]` / `[10]` precedent. There is also a semantic mismatch worth recording:
  `ChartsState` is defined as knowledge that survives death and passes to the successor,
  while N3's ruling (owner, 2026-07-28) is that an NPC death is permanent with no
  succession — so the field's own inheritance contract is void for the cast.
- **Deed cross-contamination, which is an ordering dependency rather than a detail.**
  `evaluateDeeds(nextState, events)` at `day.ts:1239` folds the whole dusk batch into the
  **player's** registry with no actor scoping, and `day.ts:822` pushes `npcEvents` into
  that same array. `rich_hulk` (`packages/content/src/deeds.ts:792-798`) triggers on
  `SalvageRecovered` with `amount >= 400` and no actor filter, so an NPC's salvage would
  earn the player a deed. Actor-scoping the deed path is **N11's** deliverable.
- **40 authored table rows.** Adding an `Explore` member to `NPC_INTENT_TYPES` makes every
  `Record<NpcIntentType, ...>` table incomplete — a compile error until each row is
  filled: `INTENT_STAT_AFFINITY` (1), `NPC_CHECK_DCS` (1), `DEFAULT_IDEAL_WEIGHTS` (1),
  `IDEAL_WEIGHTS` (**30**, one per authored Ideal), `ARCHETYPE_INTENT_MULTIPLIERS` (6),
  `NEUTRAL_INTENT_MULTIPLIERS` (1). It also re-weights every captain's verb mix, so the
  N10 baseline of record stops being comparable and **a new capstone becomes owed** — a
  new one, never a refreshed number, per this doc's own rule at line 82.

**Option 2 — algorithmic fast-forward.** A credits-only Explore intent shaped like
`executePatrol`: burn fuel through the shared `localFuelPrice`, roll the shared `check()`
against `EXPLORATION_NAV_DC`, and call an actor-parameterised `resolveLoot` for the salvage
leg only — POI and fragment dropped, because the cast has nowhere to put either. Cheaper,
since no save shape moves. But it would have to be recorded as a **partial**: the actor
plays the same *rules* over a *smaller reward set*. The standing constraint's consequence 2
is the reason that matters — a reward the actor can never collect is the shape of an
exemption, so this option's honesty rests entirely on the partial being **recorded** rather
than silent. It still leaves the die question open (N13), or needs a ruled substitute for
the die cost.

**Option 3 — exclude with a reason.** Zero code. The cost, in the ledger's own terms: one
of the player's eleven verbs stays player-only, and N8's "all or most of a full player's
actions" has to count Explore as a **ruled exclusion** rather than a gap. The reason
available to be stated is that all three of Explore's rewards are player-scoped by
design — an authored Nemesis arc, a successor-inheriting chart, and a player-facing
storylet flag — and the standing constraint requires the same rules *where the verb
applies*, not that every verb apply.

**(d) Recommendation, with its reason.**

Two MEASURED numbers bear on this, both stated with provenance.

**Measurement 1 — the ablation probe** (`.scratch/t010-ablate.ts`, gitignored; re-runnable
with `npx tsx`). Two arms over **seeds 1..120 x 120 days**, identical except that arm B
filters `Explore` out of the actions `explorerPolicy` returns. The probe drives the
engine's own `startDay` -> `applyPlayerAction` -> `endDay` and reproduces `runCampaign`'s
day-loop ordering, including the per-day fork
`new SeededRng(seed).fork('policy').fork('day-'+state.day).fork('index-'+dayIndex)` and the
`Combat`-with-no-encounter skip. It is hand-rolled for a specific reason: `resolvePolicy`
(`packages/sim/src/index.ts:4387`) returns `dawnBlind: true` for *any function* policy, so
handing `explorerPolicy` to `runCampaign` as a lambda runs it against the pre-`startDay`
state and collapses the arm (480 / 480 / 910 on seeds 1-3, against the named policy's
5,315 / 38,486 / 74,997). **Its R2c admissibility comes from a fidelity check carried in
the probe itself:** arm A's `finalCredits` is byte-equal to
`runCampaign(seed, 120, 'explorer').finalState.credits` on seeds 1-5 — 5/5 MATCH
(5,315 / 38,486 / 74,997 / 74,866 / 30,639).

| quantity (n = 120 seeds x 120 days) | value |
| --- | --- |
| Explore attempts / run | 180.2 |
| POIs discovered / run (nav-check pass rate) | 60.5 (**0.336**) |
| `SalvageRecovered` events / run | 41.0 |
| GROSS salvage credits / run | mean **9,688** · median 9,418 · p25 7,873 · p75 11,112 |
| **GROSS salvage per _attempt_** | **53.8cr**, against 80 fuel = **400-640cr** |
| POI-sourced fragments / run | 6.33 |
| `ExplorationFailed` reasons (totals) | `nav-check` 3,275 · `insufficient-fuel` 923 |
| finalCredits **with** Explore | median **60,391** · mean 57,847 |
| finalCredits **without** Explore | median **90,135** · mean 90,198 |
| seeds that ended **richer without** Explore | **101 / 120** |

**Measurement 2 — the committed capstone.** `docs/balance/baseline-n10-shipped.json`,
`fleet.milestones[day = 120]`, n = **240,000** captain-samples (8,000 runs x 30 captains):
`npcCredits` p10 **126**, p25 **150**, median 76,049; `npcFuel` p10 **0**, p25 **4**,
median **27**, p75 69, p90 100. Against `EXPLORATION_FUEL_COST = 80`, that means on day 120
**the median captain cannot pay the fuel gate for a single Explore**, and the p25 captain's
150cr cannot buy the 80 fuel at either depot price (400cr core / 640cr rim).

Three honesty caveats on measurement 1, none of which the recommendation leans past:

1. **The ablation is not rng-paired.** Removing actions shifts the within-day event-index
   forks, so the arms diverge rather than tracking each other. That is why the result is
   reported distributionally *and* as a paired sign count (101/120), never as a single mean
   difference.
2. **Arm B leaves the freed dice unspent.** It measures Explore's own net contribution, not
   "Explore against its best substitute".
3. **`explorerPolicy` is a _player_ policy** in `packages/sim/src`; it is not the NPC
   explorer archetype. What transfers to the cast is the **per-attempt** economics (53.8cr
   gross against 400-640cr of fuel), not the whole-run figure.

On that evidence, the recommendation — offered as a recommendation, not as a ruling:

- **The destitute-explorer argument does not survive measurement.** It was the strongest
  case for implementing: explorers are one of the two destitute archetypes (medians 167 for
  explorers and 132 for fighters, as N10's Result records under "THE MONOPOLY LIMB IS NOW
  ARCHETYPE-SPLIT"), and salvage looked like income they cannot reach. Measured, Explore is
  a net credit **sink** for the actor that plays it — 53.8cr gross per attempt against
  400-640cr of fuel — and removing the verb from the shipped explorer policy leaves it
  **richer**
  (median 90,135 against 60,391; 101 of 120 seeds). So salvage is measurably a **cost the
  cast cannot afford**, not income they are missing.
- **It is doubly unreachable for the captains it was meant to help.** At day 120 the
  capstone's median captain carries 27 fuel (p25 = 4, p10 = 0) against an 80-fuel gate, and
  the p25 captain's 150cr buys none of it.
- **Therefore Explore is not the floor fix N11/N12 are hunting.** Worth saying plainly,
  because it removes a candidate from that search rather than leaving it open — the
  non-trader floor that did not move at N10 (p10 126 -> 126) will not move here.
- What stays genuinely open, and belongs to the owner: whether the *authored* rewards
  (fragments, charts) are worth carrying to the cast at all, and whether the verb is worth
  revisiting **after N13** gives the cast a hand — at which point the die-cost question
  that blocks option 1 has an answer.

**(e)**

**DECISION: OWED**

The owner is choosing between: **option 1** implement at full parity (blocked on N13 and
N11, costs a save migration and a new capstone), **option 2** algorithmic fast-forward
recorded as a partial (no save change, still needs the die question answered), and
**option 3** exclude with the stated reason (zero code, and N8 counts it as a ruled
exclusion). Nothing in this memo selects among them.

---

### VisitHangout — decision memo

**(a) What the PLAYER's VisitHangout actually does.**

**Seven venues behind one action**, split by which event reads them: `dare | meet |
befriend | insult | rumor` report a `HangoutEvent`; `borrow | repay` report a `LoanEvent`
(the `isLending` / `failVenue` split, `packages/engine/src/actions/hangout.ts:139-145` —
the lending venues' reader is Penny Wise's desk pane, not the Hangout social pane). Six
separable parts:

- **Entry part 1 — a VENUE gate that actually bites.** `applyPlayerAction`'s
  `hasHangout` gate (`packages/engine/src/day.ts:376-394`) refuses the action anywhere
  `STAR_SYSTEMS[...].hasHangout !== true`, as a typed `ActionBlocked` with **no die
  spent**. Content read (counted, `.scratch/t011-sys.ts`): **1 of 28 systems carries the
  flag — Sun-3, id 1** (`packages/content/src/systems.ts:79`), and it is 1 of the 20 in
  the cast's own travel pool (`NPC_SYSTEM_IDS`, `packages/engine/src/npc.ts:94-96`). So
  the player is refused at 27 of 28 systems.
- **Entry part 2 — a die out of the dawn hand.** `spendDie(hand, index)`
  (`packages/engine/src/dice.ts:165`), with the same three typed no-spend fails as
  Explore: `no-die`, `invalid-die-index`, `die-already-spent`.
- **Presence — a living, co-located counterparty.** For the four social venues the dealer
  must be an NPC whose *simulated* `currentSystemId` equals the player's and who is not
  `dead` (`hangout.ts:171-191`); otherwise `failReason: 'no-opponent'`, no die burned.
  `rumor`, `borrow` and `repay` are opponent-less — Penny Wise is the lender-of-record
  (a **desk**), not a captain at the table (`hangout.ts:168-172`).
- **The dare/wager loop** (`hangout.ts:227-296`). Opposed GUILE through the shared
  `check()` (`dice.ts:137`), each side's check framed against the *other's* total,
  mirroring `resolveRun`; there is deliberately **no fixed DC** — the dealer's live GUILE
  total IS the difficulty (the argument is at the resolver's definition site). The wager is
  the requested stake clamped into `[DARE_MIN_WAGER = 25, DARE_MAX_WAGER = 1000]`
  (`packages/content/src/hangout.ts:65-66`) **and down to
  `min(player.credits, dealer.credits)`**. Credits then move **both directions off the
  same wager**, and the dealer's purse is debited through `mutableNpc`
  (`packages/engine/src/npc.ts:649`, copy-on-write) — i.e. **a zero-sum transfer between
  two purses**, not a payout.
- **Disposition beats, all through `applyDisposition`** (`npc.ts:657`):
  `DARE_WIN_DISPOSITION = -2` / `DARE_LOSS_DISPOSITION = +2` (both outcomes move it),
  `BEFRIEND_DISPOSITION = +3` behind a real `BEFRIEND_DC = 12` GUILE check,
  `INSULT_DISPOSITION = -4` uncontested (no roll), `MEET_DISPOSITION = +1`
  (`packages/content/src/hangout.ts:78-100`). **These have live readers**: T-1204's
  interceptor grudge weighting (`chooseWeighted` + `dispositionOf`,
  `packages/engine/src/actions/travel.ts:339-360,379`) and the tribute DCs.
- **The rumor host slot.** `hangoutRumors` (`hangout.ts:69`) synthesises ≥1 authored line
  per co-located NPC out of live `lastAction` / `currentSystemId` / `disposition`, filtering
  `dead`. **NPCs are its SUBJECT, never its reader.**
- **The loan mechanics** — the half the ledger row calls out.
  - **borrow** (`hangout.ts:354-384`): principal clamped into
    `[LOAN_MIN_PRINCIPAL = 250, LOAN_MAX_PRINCIPAL = 5000]`
    (`packages/content/src/lending.ts:76-77`) and advanced; `player.loan` is written
    `{ lender: LENDER_ID = 'npc-penny-wise' (lending.ts:56), dailyRate:
    LOAN_DAILY_RATE = 0.05 (lending.ts:63), dueDay: day + LOAN_TERM_DAYS = 15
    (lending.ts:69), status: 'active' }` and `credits += principal`.
  - **repay** (`hangout.ts:386-409`): payment clamped to
    `min(requested, credits, outstanding)`; a balance driven to `<= 0` clears the whole
    loan. Both venues' preconditions (`hangout.ts:193-218`) fail typed and spend
    **nothing** — the debt-as-ledger law: a loan can only ever add an out.
  - **dusk accrual + default** (`packages/engine/src/day.ts:907-948`): simple interest
    `ceil(principal * dailyRate)` accrues to `outstanding`, **never** to credits; crossing
    `dueDay` still owing flips `active → defaulted` **once** and fires
    `applyDisposition(LENDER_ID, LOAN_DEFAULT_DISPOSITION = -5, 'loan-default')`
    (`lending.ts:85`) plus a `LoanEvent{defaulted}` and a WireEntry.
  - **The default has exactly two readers**: the disposition hit (interceptor grudge
    weighting, `travel.ts` `chooseWeighted`) and the collection flag, which multiplies the
    realized encounter chance by `COLLECTION_ENCOUNTER_MULTIPLIER = 1.5`
    (`lending.ts:92`, read at `travel.ts:495-503`).

**Content-derived arithmetic** (derived from the tables, not measured — labelled as such,
and it is what part (d) prices the loan against). At `LOAN_MIN_PRINCIPAL = 250` the carry
is `ceil(250 × 0.05)` = **13cr every dusk**; held the full 15-dusk term that is **195cr of
interest on 250cr borrowed (78%)**, 445cr to clear. (`lending.ts`'s own header says "~75%
simple interest over a full term"; the `ceil` is what makes it 78% at the band floor.) At
the ceiling, 5,000cr carries **250cr/dusk**, 3,750cr over a term. What 250cr *buys*: at
`localFuelPrice` (`FUEL_DEFAULT_BUY_PRICE = 5` core / `RIM_FUEL_BUY_PRICE = 8` rim,
`packages/content/src/systems.ts:209,220`) it is **31–50 fuel**, i.e. **3–5 NPC patrols**
at `NPC_PATROL_FUEL = 10` (`npc.ts:493`) — and **not one** player-style 80-fuel Explore in
the rim. Against the yard ladder `YARD_COMPONENT_TIER_PRICES =
[50, 100, 200, 400, 800, 1500, 3000, 5000, 10000]`
(`packages/content/src/upgrades.ts:4`) it reaches the **tier-3 rung and no further**;
`LOAN_MAX_PRINCIPAL` reaches tier-8.

**(b) What the cast has instead.**

`executeSocialize` (`packages/engine/src/npc.ts:1573-1601`), dispatched by `resolveNpcDay`
(`npc.ts:1604`, if/else chain `:1675-1687`) off `pickIntent` (`npc.ts:583`). Of the parts
in (a) it reproduces **one**:

- **One GUILE check through the SHARED `check()`**, via `rollNpcCheck` (`npc.ts:1214`)
  against the content DC `NPC_CHECK_DCS.Socialize = 14` (`packages/content/src/ideals.ts:51`),
  paying `NPC_SOCIALIZE_WIN_CREDITS = 150` or costing `NPC_SOCIALIZE_LOSS_CREDITS = 50`
  (`ideals.ts:73,76`).
- Plus an **ante gate**: `npc.credits < NPC_BROKE_CREDITS + 50` (i.e. **< 150**;
  `NPC_BROKE_CREDITS = 100` at `npc.ts:463`) falls through to `brokeIdle` (`npc.ts:1172`,
  which pays `NPC_ODD_JOB_CREDITS = 25`, `npc.ts:490`) — preserving T-1201's
  verb⟺StatCheck invariant, because a returned `Socialize` always means a check was
  rolled. Worth recording as an observation rather than a finding: the `+ 50` is an
  **engine-side literal**, so the ante itself is not a content-tunable number the way
  every payoff around it is.

Nine parts it does **not** reproduce. The reasons differ in kind, which is why they are
enumerated rather than summed:

1. **The opposed roll.** A fixed DC 14 against the player's live-dealer-GUILE-as-DC. A
   strong dealer is not a hard table for the cast.
2. **The wager.** Fixed +150 / −50; no `[25, 1000]` band, no choice of stake, no clamp to
   what either side can actually cover.
3. **No counterparty — the deeper one.** The player's dare *moves* credits between two
   purses. `executeSocialize` **mints or burns credits against nothing**, so the cast's
   social verb is not zero-sum where the player's is. This is a field-credit-conservation
   question **independent of the loan decision**; it is measured below.
4. **No `hasHangout` gate.** The player is refused at 27 of 28 systems; the cast plays
   "the Hangout tables" at any of the 20 `NPC_SYSTEM_IDS` systems, and the action's own
   flavour text names the local system. This is consequence 2's exact shape — a gate that
   never bites — and it is the **cheapest real parity item in this memo** (one
   `STAR_SYSTEMS` read). It is not free: it deletes ~96% of the verb's occurrences
   (measured below), which moves the verb mix, stales the N10 baseline of record and owes
   **a new capstone, never a refreshed number** (this doc, line 82).
5. **No presence requirement.** No co-located captain is needed; nobody is across the
   table.
6. **No die cost.** The same shape as watch item **OI-9** (the NPC refit spends no die);
   blocked on **N13** for a real fix.
7. **No disposition movement — and structurally none available.** `disposition` is defined
   on `NpcState` as standing **toward the player** (`packages/engine/src/types.ts:1179-1181`;
   the note at `travel.ts:343`). NPC↔NPC standing is an *absent model*, not a number left
   at zero.
8. **No rumor consumption — and none owed.** NPCs are `hangoutRumors`' subject, never its
   reader. Recorded so it counts as considered rather than skipped.
9. **No borrow and no repay at all.** `NpcState` (`packages/engine/src/types.ts:1153-1206`)
   carries `id / name / profileId / currentSystemId / credits / ship / disposition /
   lastAction? / dead?` — **there is no `loan` field**. This is a **field absence on the
   save shape**, not a policy choice: a captain can neither borrow nor default, and no
   amount of engine work reaches it without moving the record.

**MEASURED — the cast probe** (`.scratch/t011-cast-probe.ts`, gitignored; re-runnable with
`npx tsx`). Seeds **1..120 × 120 days**, folding over every **living simulated** captain's
`lastAction` each dusk (the eleven storyline records are excluded via `isSimulatedCaptain`,
`packages/content/src/cast.ts:660` — they take no turn and sit at seed credits, and
including them was exactly the dilution N4 recorded). It drives the engine's own
`startDay` → `applyPlayerAction` → `endDay` and reproduces `runCampaign`'s day-loop
ordering including the per-day fork
`new SeededRng(seed).fork('policy').fork('day-'+state.day).fork('index-'+dayIndex)` and the
`Combat`-with-no-encounter skip. **R2c admissibility is carried in the probe itself**: its
`finalCredits` is byte-equal to `runCampaign(seed, 120, 'trader').finalState.credits` on
seeds 1-5 — **5/5 MATCH** (15,836 / 67,482 / 60,556 / 31,537 / 51,925). The named policy
string is deliberate: `resolvePolicy` (`packages/sim/src/index.ts:4387`) returns
`dawnBlind: true` for *any function* policy, so handing the lambda to `runCampaign` would
collapse the arm.

| quantity (n = **424,695** living simulated captain-days; 120 seeds × 120 days) | value |
| --- | --- |
| verb mix — `FlawOverride` / `Trade` / `Travel` | 129,500 · 65,802 · 62,180 |
| … `Idle` / `Socialize` / `Combat` / `Patrol` | 51,793 · **46,757** · 34,943 · 33,720 |
| Socialize share of captain-days | **0.1101** |
| Socialize resolved where `hasHangout !== true` | **44,843 / 46,757 = 0.9591** |
| Socialize win rate (vs DC 14) | **0.4705** (21,999 wins / 24,758 losses) |
| **EV per Socialize action** | `0.4705 × 150 − 0.5295 × 50` = **+44.1cr** |
| **NET credits Socialize adds to the field** | **+2,061,950** = **+4.86cr / captain-day** |
| `brokeIdle` days (`Idle` + "hard up for credits") | 51,793 = **0.1220** of captain-days |
| T-1201 cross-check: `actionContext === 'npc-socialize'` | **46,757** = the `Socialize` tally |
| player `dare` HangoutEvents in this arm (would also emit one) | **0** |
| living field **under the 150 ante** | day 30 **0.2301** · 60 **0.2682** · 120 **0.2389** |
| living field under `NPC_BROKE_CREDITS` (100) | day 30 0.0098 · 60 0.0130 · 120 0.0075 |

Two of those rows carry more than a number. The NET figure is credits the field gains
against **no counterparty at all** — the faucet in part (d)'s third bullet. And the
`brokeIdle` count is **identical to the whole `Idle` tally**, i.e. **every idle day in the
sample is a broke day**; the `npc-socialize` StatCheck count matching the `Socialize` tally
exactly, with zero player dares in this arm to confound it, is the T-1201 verb⟺StatCheck
invariant holding at n = 46,757.

Two honesty notes on the probe, neither of which (d) leans past. The field figures are
conditioned on a **single player policy** (`trader`) sharing the world, so the absolute
verb counts are one arm, not the fleet; and `brokeIdle` is a **lower bound** on
intent-level rejection — it is the fallback for the underfunded Trade and Patrol paths too,
so it cannot be read as the Socialize-intent rejection rate (and modelling that by calling
`pickIntent` here would be exactly the private parallel model the standing constraint
forbids).

**FREE — the committed capstone.** `docs/balance/baseline-n10-shipped.json`,
`fleet.milestones[day = 120]`, n = **240,000** captain-samples (8,000 runs × 30 captains):
`npcCredits` p10 **126**, p25 **150**, median 76,049; `npcFuel` p10 0, p25 4, median 27.
Against the Socialize ante of **150** that is this memo's sharpest free datum — **the
bottom quartile of the field sits at or below the ante** (p25 is the ante, to the credit),
which the probe's independent 0.24 share corroborates. N10's Result records the two
destitute archetype medians as **fighter 132** and **explorer 167**: the fighter's median
captain is *below* the ante and the explorer's is barely above one losing hand of it. Also
worth stating as a verified negative: the capstone carries **no loan metric at all** — not
in `fleet`, not in any of the eight `byPolicy` rows.

**(c) The three options, each with its real cost.**

**Option 1 — implement (full parity).** The pieces, each with its price:

- **`NpcState.loan`** — priced in full under the save-shape heading below. It is the
  gating cost, and it is unavoidable for any option that lets a captain owe money.
- **One shared accrual/default function.** The dusk block at `day.ts:907-948` must be
  **extracted and given an actor parameter so both sides call it**, never copied into
  `npc.ts`. That is the standing constraint and R2c, and it is the difference between
  parity and a second definition of interest.
- **An NPC-side collection reader, into a slot that already exists and is already
  commented.** `resolveNpcEncounter` (`npc.ts:869`) says at its multiplier chain: *"Two of
  the player's four terms have NO NPC ANALOGUE and are absent rather than zeroed: a
  defaulted Penny Wise loan and a Guild debt flag are player-only mechanics, so there is
  nothing to read. That is an absent INPUT, not a threshold tuned so a rule will not
  bite."* That comment is the definition-site argument this option is buying out; an
  `NpcState.loan` turns the absent input into a present one and the
  `COLLECTION_ENCOUNTER_MULTIPLIER` term becomes readable for the cast.
- **The lender needs no roster work.** `LENDER_ID` is a **desk**, not a co-located
  captain (`hangout.ts:168-172`), so the cast can borrow wherever a Hangout exists without
  touching N4's roster split.
- **An actor discriminator on `LoanEvent`, or the instrument lies.** `LoanEvent`
  (`packages/engine/src/types.ts:612-630`) has **no actor field**, and the sim folds it
  unconditionally: `packages/sim/src/index.ts:892-903` credits every `borrowed` /
  `accrued` / `repaid` / `defaulted` into `LoanUsageStats` (`index.ts:146`) as the
  **player's**. Emit NPC loan events without an actor and every loan number this project
  has measured silently absorbs the cast — the same shape as the Explore memo's deed
  cross-contamination finding, and it must be closed in the same commit.
- **The non-loan parity items:** the `hasHangout` read, the opposed roll with a real
  counterparty transfer through `mutableNpc`, and the die (**blocked on N13**).
- **And a new sim limb plus a new capstone.** N9's lesson applies directly: the instrument
  cannot currently see an NPC loan at all, and a mechanism the instrument cannot see cannot
  be graded.

**Option 2 — algorithmic fast-forward.** The loan **ledger** without the rest: a captain
under the ante takes `LOAN_MIN_PRINCIPAL` through the same clamp, accrues through the same
shared function, and expresses default **only** as the encounter multiplier. It buys the
verb's *consequence* without its *scene*. State the asymmetry with the Explore memo's
option 2 plainly: **a debt IS persistent state, so there is no save-free version of this
option** — `NpcState.loan` is owed either way, and the only thing option 2 saves is the
wager, the counterparty and the disposition beat. It must be recorded as a **partial** for
the same reason Explore's is: an actor playing the same rules over a smaller surface is
honest only while the smaller surface is written down.

**Option 3 — exclude the loan half with a reason.** Zero code for lending. The three cheap
non-loan parity items (venue gate, opposed roll + counterparty, the die at N13) stay
separately decidable, because none of them touches the save shape. Note that this exclusion
is **not symmetric with Explore's**: the cast already plays this verb, so the ledger row
becomes a **ruled partial** — "Socialize stand-in; lending ruled player-only" — rather than
a ruled absence, and that is what N8's "all or most of a full player's actions" would have
to count. The reason available to be stated is that Penny Wise's desk is authored
player-facing content whose quest line (PRD §7.5) has no cast-side expression, and that the
default's grudge reader is the very thing N4 left open.

**The borrow/repay gap and the OPEN N4 question — the live connection.**

`state.npcs` is seeded from **all 41** profiles, `[...NPC_PROFILES, ...QUEST_PROFILES]`
(`packages/engine/src/state.ts:79`), and Penny Wise (`npc-penny-wise`) is one of the eleven
storyline captains — **not** a simulated captain (`isSimulatedCaptain`,
`packages/content/src/cast.ts:660`). So the player's `loan-default` write **still lands on
her record**; what it lost is a reader. Precisely: of the default's two consequences,
**one survives and one is unreachable.**

- **Survives:** the collection flag. `travel.ts:495-503` multiplies the player's realized
  encounter chance by `COLLECTION_ENCOUNTER_MULTIPLIER` off `loan.status === 'defaulted'`,
  which has nothing to do with who Penny Wise is.
- **Unreachable:** the interceptor identity. `buildNamedCandidates`
  (`travel.ts:275-301`) filters on `NPC_PROFILES`, so the −5 disposition hit that
  `LOAN_DEFAULT_DISPOSITION`'s own comment says exists to make her "far likelier to BE your
  interceptor" now feeds `chooseWeighted` for a candidate that can never be drawn.

That is **N4's already-open owner question**, recorded in this doc at the N4 ruling
("**OPEN, and an owner design question:** `applyDisposition`'s `loan-default` (Penny Wise)
and `contraband-caught` (a named patrol captain) reasons were written so T-1204's
interception weighting could read them … those grudges need a storylet-side expression or
the writes need re-siting") and again under N4's Result as "**an owner design question, not
a number**". It covers **`contraband-caught`** (`packages/engine/src/actions/patrol.ts:115`)
in exactly the same way, and T-040's checkpoint already carries it.

**The two questions are separable but one constrains the other, so they should be ruled
together:**

- **(i) NPC borrowing needs an NPC-side collection consequence.** The multiplier slot
  exists and is commented (`npc.ts:869-886`), so the *flag* half transfers cleanly. The
  *grudge* half does not, because it has nowhere to point.
- **(ii) The N4 re-siting ruling decides whether it ever will.** If the owner rules
  "express the grudge storylet-side / re-site the writes", then an NPC default has no
  disposition target either and NPC lending inherits a half-consequence. If the owner rules
  "Penny Wise becomes drawable", both readers return and NPC lending inherits a working
  consequence chain on day one. Ruling (ii) first is strictly cheaper than ruling (i)
  first.

**The save-shape cost of an `NpcState.loan`, both forms, so the owner is pricing the real
thing.**

- **Nullable (`loan: LoanState | null`, matching `PlayerState`)** — a save-shape change,
  and the precedent is exact: **`MIGRATIONS[2]` is the v2→v3 entry that added
  `PlayerState.loan`** by backfilling the key to `null`
  (`packages/engine/src/save.ts:157-166`). The bill is a `CURRENT_SAVE_VERSION` bump, a
  `MIGRATIONS[n]` entry backfilling every `npcs[]` element to `null`, a **round-trip
  test**, and `deserializeState` performing the same backfill pinned by a test. The
  migration must **call** the rule rather than restate it — the `MIGRATIONS[9]` /
  `MIGRATIONS[10]` discipline (`save.ts:276-327`).
- **Optional (`loan?: LoanState`, absent = no loan)** — the **`dead?: boolean`** precedent
  (`types.ts:1183-1205`; `schema.ts:482-486`): a pure addition, **no migration and no
  version bump**, because an old save having no key is exactly what `undefined` means.
  The key must still be declared in the `.strict()` `NpcStateSchema`
  (`packages/engine/src/schema.ts:466-487`) or a save carrying it is rejected as unknown.
  The honest trade-off: an optional field makes "this captain has no loan" indistinguishable
  from "this save predates NPC lending", where the nullable form states it. Either way
  `LoanStateSchema` (`schema.ts:319-331`) is reusable **as-is** — it is already the shape
  the player's loan validates against.
- **Sequencing the owner is actually pricing.** `CURRENT_SAVE_VERSION = 11`
  (`save.ts:331`), and **N11's T-020 already claims 11 → 12 with `MIGRATIONS[11]`**. So a
  nullable `NpcState.loan` lands at **v13 after N11**, or must be folded into N11's bump.
  The optional form sidesteps the ordering entirely, which is the strongest argument in its
  favour.

**(d) Recommendation, with its reason.**

The task's sharp question is whether NPC borrowing gives the destitute archetypes a real
recourse or merely a more elaborate bankruptcy. The arithmetic answers it, and it answers
it differently for the two halves of the field:

- **For a captain below the ante, the loan is a rope, not a lever.** A captain locked out
  of Socialize is on `brokeIdle`, which pays **`NPC_ODD_JOB_CREDITS = 25`/day**. The carry
  on the *smallest loan the band allows* is **13cr/dusk** — **52% of that captain's entire
  daily income**, before a single credit of principal. They cannot service it, so they
  reach `dueDay` owing 445cr, default, and collect a 1.5× encounter multiplier they have no
  ship to survive (the same capstone puts `npcFuel` p25 at 4 and `npcHullStrength` p10 at
  10 against a 90 ceiling). That is the elaborate bankruptcy, arrived at by content
  arithmetic rather than by intuition.
- **The recourse it does buy is one step wide, and the step is real but small.** 250cr
  clears the 150 ante immediately, which unlocks a verb worth a measured **+44.1cr per
  action** at a measured **0.1101** frequency — about **+4.9cr per captain-day**. Against
  13cr/dusk of carry, the unlocked verb pays back **~37% of the interest** it was borrowed
  to reach. It also buys **31–50 fuel = 3–5 patrols** (at +40/−20 a sweep), which is the
  more plausible route out. Neither reaches a hull: 250cr stops at the **tier-3** yard rung,
  and **R10 (the tier-1 hull cliff) is R-owned and confounds any "buy a hull" arm** of this
  question outright, so that arm should not be run under this track.
- **So the destitute-borrower case is weak on the numbers, and the strongest case for
  lending is a different one.** It is the **counterparty defect**, which the probe measures
  independently of the loan question: `executeSocialize` adds **+4.86cr per captain-day**
  to the field against no counterparty at all — a pure **faucet** where the player's dare is
  a zero-sum transfer. That is a parity break in the verb the cast *already plays*, it needs
  no save-shape change, and it is arguably worth more than lending is. Recorded here rather
  than folded into the recommendation, because it is not the question the owner was asked.
- **And the cheapest item on the list is the venue gate.** **95.91% of the cast's
  Socialize actions resolve at a system with no Hangout.** One `STAR_SYSTEMS` read closes
  it — but it deletes ~96% of the verb's occurrences, so it moves the verb mix and owes a
  new capstone. That is a real price, and it is the reason the gate should not be treated as
  a free drive-by fix.

On that evidence, offered as a recommendation and not as a ruling: **option 2 over option
1, and only after the N4 ruling** — the ledger (borrow, shared accrual, default expressed
as the encounter multiplier) is where the parity value is, the wager and the disposition
beat are where the cost is, and the disposition beat in particular is unbuildable until (ii)
above is answered. The `NpcState.loan` field is owed by option 1 and option 2 alike, so the
**optional-field form** is the one to price first, because it is the only route that does
not queue behind N11's version bump.

What stays genuinely open, and belongs to the owner: whether Penny Wise's authored quest
line tolerates thirty captains at her desk at all; the N4 `loan-default` /
`contraband-caught` pairing, which should be ruled **with** this row rather than after it;
the die cost, which is **N13's** and which no option here can close; and whether the
counterparty faucet in bullet three is a separate work item or part of whatever this row
becomes.

**(e)**

**DECISION: OWED**

The owner is choosing between: **option 1** implement at full parity (an `NpcState.loan`
plus a migration or the optional-field route, an actor-parameterised accrual function, an
actor discriminator on `LoanEvent` before the instrument mis-attributes NPC debt to the
player, a new sim limb, a new capstone, the N4 ruling as an input, and the die still blocked
on N13), **option 2** the loan ledger fast-forwarded and recorded as a partial (same field
cost — a debt is persistent state — but no wager, no counterparty, no disposition beat), and
**option 3** exclude lending with the stated reason (zero code, and N8 counts the row as a
ruled **partial**, not a ruled absence, because the cast already plays the verb). Nothing in
this memo selects among them.

---

### N0 — One copy-on-write discipline for player and NPC turns (SHIPPED 2026-07-28)

- **Why first:** NPC records are about to grow a ship, and `cloneState` deep-copied all
  thirty of them on every player action. Adding ships without this would have taxed the
  player 3.5x (`cloneState` 0.0294 -> 0.0955 ms) and made 30 captains each acting
  **quadratic** — measured 1.6 / 11.6 / 43.1 ms per day at 10 / 30 / 60 NPCs.
- **Change:** `cloneState` shares NPC records between snapshots (fresh array, shared
  records). All cross-boundary NPC writes route through one door, `mutableNpc`.
- **Result:** clone 0.0294 -> 0.0125 ms today, 0.0955 -> **0.0121** ms with fat NPC
  records — i.e. **flat in NPC richness instead of linear**, which is what kills the
  quadratic. Player-day 1.394 -> 1.066 ms as a side effect.
- **Two things worth carrying forward.** I asserted there was ONE cross-boundary NPC
  writer; there were FOUR (a grep keyed on variable names missed `dealerNpc.credits`
  and three `rescuer.*` writes — searching by FIELD found them). And it shook out a real
  engine bug: `storylets.ts` computed a clamped disposition delta from a handle taken
  before the update, reporting **0 for every clamped change**. `clone.test.ts` now holds
  the line with a source scan, verified by reintroducing a violation and watching it fail.

### N1 — NPCs own a real ship (SHIPPED 2026-07-28 · `b438096b`)

**Result (2026-07-28): CHANGE ACCEPTED — HYPOTHESIS DISPROVED** (the wording standing
amendment 2 counts in its ratio). `NpcState.ship: ShipState` shipped and `NpcState.fuel` was
**removed** rather than kept beside it — two fuel numbers on one captain would have been two
sources of truth — under save schema **9 -> 10** via `MIGRATIONS[9]`, the first registry entry
that MOVES a field rather than adding one. The capstone came back **byte-identical to
`baseline-r2c-final.json` apart from `label`**, which was arithmetic rather than a null
result: a ship seeded from profile tier and never mutated *is* the phantom wearing a struct,
so the step's *"NPC wealth spread widens"* clause was mis-assigned and belongs to N2.

**Still binds:**

- **SUPERSEDED HULL FORMULA — do not re-derive it.** N1 shipped
  `hull.strength = 2 + 2·tier`, calibrated against the phantom's *unbounded* tank so the
  clamp could not bind. **N2's second task deliberately replaced it** — `npcHullStrength` is
  now a search for the smallest hull strength whose `maxCargoPodsForShip` covers the tier's
  pod count, removing the fuel-tank exemption. See N2. *A reader grepping current `npc.ts`
  for `2 + 2 * tier` will not find it.*
- **OI-1 — the clone measurement, one number in three places.** Re-measured 2026-07-29 over
  10 seeds × 120 days of the ambient NPC loop, three alternated runs per side, node v24.13.1:
  **0.355 ms/game-day for the JSON round trip against 0.399 for `structuredClone` — ~12%
  more**, non-overlapping spreads; an independent verifier reproduced the direction with
  board generation hoisted out of the timed region (**0.307 vs 0.358, +16.3%**) and on the
  clone alone (**3.47 µs vs 5.02 µs, +45%**), identical simulation checksums both ways. **Read
  ~12% as a FLOOR, not the effect size.** The clone stays as `JSON.parse(JSON.stringify(npc))`.
  The false comment at `packages/engine/src/npc.ts:1031-1039` and the duplicate figures at
  `packages/engine/src/__tests__/clone.test.ts:363-367` were rewritten to agree — one
  measurement, three places, no third copy left to drift.
- **OI-1 precision corrections, both easy to "fix" back into being wrong.** The SIMULATION
  roster is **30 captains, not 31**; **31 is the BOARD size** (the player plus the 30), so
  **N6's heading is correct and is not to be "fixed"**.
  > **AMENDED BY N3's ROSTER SPLIT (2026-07-29).** This bullet used to read
  > `createInitialState(seed).npcs.length === 30`, and that identity is now FALSE:
  > `state.npcs` carries **41** records — the 30 simulation captains plus the 11
  > `QUEST_PROFILES` characters, who need `NpcState` records because storylet triggers
  > and dispositions look them up by id, but who take no turn. **The three numbers are
  > now distinct and conflating any two of them has already caused two live bugs:** the
  > Honor List silently became a 42-way board ranking eleven captains frozen at their
  > day-1 fit, and `balance-rig.test.ts` lost 52 tests to a hardcoded 30. Read
  > `NPC_PROFILES.length` for the simulation field (30), `state.npcs.length` for the
  > record count (41), and 31 for the board.
  And where the code says N1 grew the NPC record "~10x", that is an **object count, not a
  size**: 229 -> 745 bytes, **3.3× in bytes**, with exactly eight nested component objects
  added (`types.ts:1139-1146`).
- **Restated Proves for N1**, since the shipped one contradicted itself: *no behaviour moves;
  NPC capability becomes mutable state the captain owns instead of a constant recomputed from
  their profile.*
- **`MIGRATIONS[9]` is the precedent N7 leans on** to keep `save.ts`/`schema.ts` out of
  `rulesFingerprint`: it *calls* `npcShipForTier` rather than restating it, so the rule itself
  lives in a hashed file. Anything that inlines a rule into a migration breaks that.
  **Idempotent, never throws**, and it shares ONE seeding function with `createInitialState`
  and `deserializeState`, so a migrated roster cannot drift from a freshly created one — the
  three properties the next migration to touch this registry is expected to match.
- **The guard was blind to nested writes and N1 closed it.** `clone.test.ts`'s scan matched
  only `handle.field = …`, so `rescuer.ship.fuel -= amount` — the exact write this step
  introduced — was structurally invisible. It now matches an assignment anywhere down a
  member path rooted at an NPC handle while still permitting comparisons.
- **Costs, measured, so a later step does not re-litigate them.** Save roster 4,129 -> 19,569
  bytes (+519/ship × 30): +4.2% on a real 30-day save, +0.14% on a 1,000-day one, load time
  unchanged. Per-day +8% on a 1,000-day career (1.40 -> 1.51 ms), ~0.1 ms of the ~39 ms of
  headroom N0 bought.
- **Baseline of record UNCHANGED (`baseline-r2c-final.json`)** — per R1's precedent a
  disproved hypothesis re-pins nothing. `baseline-n1.json` is committed as this step's
  capstone provenance only; that it diffs to nothing is the finding.
- **What N1 found and handed on:** the shipyard API is player-shaped and blocks N2, and NPCs
  fly on ~4× a player's fuel. Both are written into **N2's entry**, per standing amendment 4,
  and the audit's OI-5 precision on the blocker is recorded there too.

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N2 — NPCs upgrade their ships (SHIPPED 2026-07-29)

**Result (2026-07-29): ACCEPTED** — all three Proves limbs hold, neither Disproves limb fires.
The step's first two tasks landed as stated: the `ShipyardActor { ship, credits, registry? }`
refactor of four player-shaped shipyard functions, and the hull/component re-seed that
**removed N1's fuel-tank exemption** — N1 had seeded `hull.strength = 2 + 2·tier` to clear the
phantom's unbounded tank, **leaving NPCs on ~4× a player's fuel for comparable capacity** (see
the standing constraint above), and this step re-seeded the hull to what a player's ship of
that capability would be. On top of them sits `considerRefit`, an upgrade decision priced through
the engine's own `quoteShipyard` with no parallel cost model. Day-120 NPC wealth spread
**max/median 13.4 -> 155**, **distinct fits 5 -> 144**, richest captains median 282,247cr
against 132cr in the bottom quartile — **and the poorest still exist** (p10 = 127, min hull
strength still 1); the Honor List went **2 of 8 contested to 8 of 8**, which was N6's hand-off
criterion. Arm A (actor param alone) diffed against `baseline-n9-shipped.json` as *"NOTHING
MOVED"*, so the player did not move across the refactor. The step also found **R10**.

**Still binds:**

- **The refactor is structural, not an adapter, and that is load-bearing.** `PlayerState` and
  `NpcState` both satisfy `ShipyardActor` as-is, so there is no wrapper on either side —
  `applyShipyardMutation` *debits* `actor.credits`, and a wrapper would have banked the debit
  on a copy. **`quoteShipyard`'s throwaway is now one ship (`structuredClone`) instead of a
  whole `GameState` (`cloneState`), which is what makes quoting 30 captains a day
  affordable** — tidying it back onto `cloneState` re-introduces the per-day cost N0 exists to
  have killed, and N11's richer refit ladder, N12's per-NPC port pricing and N13's dawn hand
  are all measured inside the envelope it bought.

- **WATCH ITEM OI-9 — the NPC refit pays no die.** `considerRefit` applies
  `applyShipyardMutation` directly; `resolveShipyard` is never called, and the `spendDie: 0`
  sitting beside it is a placeholder, not a cost. A player buying at the yard burns 1 of
  their 5 dice **even when the purchase is refused.** Everything else is at parity — same
  prices, same gates, the engine's own functions on both sides, no location rule on either —
  and the asymmetry is argued at its definition site (`npc.ts:648-673`: one coarse action
  stands in for a whole NPC day, so charging a die would double-charge the abstraction). It
  is recorded rather than closed because that argument is genuinely reasonable **and**
  because the caveat below was measured against a field that gets one FREE purchase every
  single day. *Trigger: if N3+ sweeps show the field out-fitting the player, the first knob
  is making the refit displace the day's verb some fraction of the time — not re-pricing the
  ladder.* Carried as a verb-parity question in THE PARITY LEDGER.
- **THE CAVEAT, and it should govern N3's sequencing.** The *top* of the field converges on
  an identical maxed fit. Across three seeds the first captains max out **on day 69 in every
  one** — 72 rungs (8 components × 9 tiers) at one purchase per day. **Purchase opportunities
  are the binding constraint, not money**: the yard's whole ladder costs ~132,400cr against
  captains ending near 2M. (Distinct NPC holders on the Honor List peak at 12.3 on day 30 and
  fall back to 5.4 by day 120 for the same reason.) A design correction was made mid-step and
  reported rather than hidden — filling every hold before the ladder drove 20 of 31 onto an
  identical fit, and moving pods onto the hull rung barely helped (18 of 31), **which is what
  proves the root cause is the ladder's pricing, not the ordering** (see R10). No constant was
  tuned to hide it.
- **`greedy` IS NOT A VALID CONTROL FOR AN N-SERIES CHANGE — carry this forward.** It moved
  in every arm. R0a introduced it as the control for *policy* changes, but it shares a galaxy
  with the cast and reaches it through contract competition and the shared dusk RNG stream, so
  an NPC-side change *should* move it. Written into `campaign-degraded.test.ts` so the next
  step does not misread it.
- **Save schema: no bump, decided deliberately** — recorded at `npcShipForProfile` and in
  `save.ts`'s registry header. Existing v10 rosters are **not** re-seeded, because post-N1
  `npc.ship` is owned mutable state and a migration **could not tell an issued fit from a
  bought one — it would confiscate purchases.** `MIGRATIONS[9]` picks up the new ramp
  automatically (it calls `seedNpcShip`), which is correct: a v9 roster never had ships.
- **`registry` optional is a rule, not a gap.** A captain without one ranks `-1`, strictly
  below every Renown rung, so rank-gated purchases refuse with **no NPC branch** — which is
  also the permanent lockout **N11** exists to remove.
- **OI-5 precision (2026-07-29 audit).** The first task originally named `maxCargoPodsForShip`
  as a fifth blocked function. It takes a bare `ShipState`
  (`packages/engine/src/actions/shipyard.ts:182`), never took `GameState`, and correctly never
  got an actor parameter — **four** functions gained `ShipyardActor`, not five.
- **Contract competition: no out-competition, and N10 reads this number.** 295 -> 301
  `ContractClaimed` events (**+2.0%**) over 10 seeds × 120 dusks. The mechanism is capped at
  one claim per dusk and gated on co-location, and richer NPCs actually trade *less* (the
  poverty Trade boost stops firing), so an 8× wealth increase moves it by noise.
  > **READ AT N10, AND THE DIAGNOSIS HERE WAS HALF RIGHT.** N10 removed both the cap's
  > and the gate's hold on participation and swept both as knobs: neither was ever the
  > binding constraint (lifting the cap to unbounded buys 69 extra snipes in 2,000 days).
  > The binding constraint is that the cast consumes ~6% of the galaxy's daily job
  > supply. The *"richer NPCs actually trade less"* half stands and matters — see N10's
  > Result for the verb mix that makes it decisive.
- **Test pin taken deliberately:** `campaign.test.ts`'s NPC wealth-spread ceiling raised
  10 -> 25 against measured ratios 7.52–15.99, i.e. **pinned ~56% above the worst observed
  rather than at the last measurement.** `rulesFingerprint` `76ac9179…` -> `2273d380…`.
- **Baseline of record re-pinned to `docs/balance/baseline-n2-final.json`** at this step
  (standing amendment 1 as refined); it has since been superseded — the amendment is
  authoritative.

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N3 — NPCs meet pirates, and answer them (SHIPPED 2026-07-29, rebuilt)

**Result (2026-07-29): ACCEPTED on behaviour, CAPSTONE DISCHARGED AT N4.** Rebuilt from
the ground up after the audit below found the step marked SHIPPED with none of its core
change built. Encounters now roll on every NPC jump through `routeDangerFor` (the extracted
content-only core of the player's `calculateRouteDanger`, loaded-run bump included); the
talk/run/fight triangle resolves on the shared rules — `tributeForRound`,
`interceptorRefusesTribute`, `weaponVolleyDamage`, the real fuel costs, the player's salvage
rate and the opposed PILOT retreat; and death is permanent.

**MEASURED (3 seeds × 200 days, engine-level probe):** ~700 interdictions and 1–4 permanent
deaths per 200 days, the living field ending at 26–29 of 30. Tribute is **5–7% of gross
field wealth** — a real cost, not an economy-breaker. **The Disproves does not fire: the
roster does not empty out.**

**Still binds:**

- **THE RULES LIVE IN A MODULE NEITHER SIDE OWNS, and that is the point of the step.**
  `applyInterceptorHit`, `interceptorPressureDc`, `damageComponentForHit`, `tributeForRound`
  and `interceptorRefusesTribute` sit in `combatRules.ts`, called by BOTH the player's
  `applyEnemyPressure` and the cast's interdiction — one definition of the damage rule, not
  two. A separate module because `actions/combat.ts` imports `npc.ts`, so importing back
  would close a cycle. The extraction was verified behaviour-preserving FIRST: 726/726 with
  every golden hash unmoved before any NPC encounter was wired in.
- **FIRST TASK: the copy-on-write scan is widened by SHAPE, not by another name** —
  provenance-based tainting over all of engine AND sim, a sibling test driving each of its
  three historical blind spots, and argued block-scoped `COW-EXEMPT:` markers with the set
  pinned. **It landed BEFORE the death write, which is the whole reason it was folded in
  here.** Third instance of one lesson: N0 asserted one cross-boundary writer and found
  four, N1 found the guard blind to nested paths.
- **Permanent death forced FOUR SKIPS, each a live bug otherwise:** `honorField` (the OI-2
  seam), the interceptor pool, the dusk turn loop, Hangout presence. A fifth decision
  recorded rather than drifted into: **a dead captain's disposition STOPS MOVING** rather
  than decaying to neutral, because the grudge is part of what the record is for.
- **THE PARITY GAP THIS STEP LEFT OPEN, and it is N3-shaped rather than N4-shaped.** N3
  wired the shared rules into the two verbs that TRAVEL (`executeTravel`, `executeTrade`)
  and **left the cast's own Combat verb an abstraction** — `executeCombat` is still the
  pre-N3 GUNS check paying a flat `150 × tier` with no interceptor, no damage and no ship
  loss. So the six fighters absorb 6.4 interdictions each and take **0 deaths** while five
  explorers take 0.2 each. Recorded in the PARITY LEDGER's Combat row as still owed.
- **THE INTERDICTION WIRE IS SPLIT FROM THE VERB CONTEXTS DELIBERATELY.** Rolls carry their
  own `npc-encounter-{fight,run,talk}` contexts so a nat-20 still makes the wire (PRD §6
  holds for the cast), while the T-1201 verb ⟺ StatCheck invariant counts only checks
  carrying the verb's OWN context — otherwise an interdiction would inflate the sim's
  trade-failure denominator.
- **THE COST OF SHIPPING WITHOUT A CAPSTONE, recorded rather than papered over.** N3 and the
  reopened N4 both moved the same hashed rule sources, so they share one capstone
  (`baseline-n4-shipped.json`). Because N3 never pinned one of its own, **the diff from
  `baseline-r2c-explorer-remit.json` carries N3's and N4's deltas tangled together and there
  is no honest way to separate them after the fact.** N4's own effect IS separable, through
  its control arm. N3's per-archetype interdiction rates were re-measured under the blend
  and live in N4's table.
- **A defect worth the retelling: a discovery call that was really a validation call.**
  `balance-rig.test.ts` learned the roster size by calling `synthesizeTierState` with a
  hardcoded 30 — but that function VALIDATES the spread against the roster before
  returning, so the discovery call became a throw the moment the roster hit 41, taking the
  whole file (52 tests) down. It now reads `createInitialState(1).npcs.length`.

*Full record — the per-deliverable landing notes, N3's original by-archetype interdiction
counts and the two root-cause blocks: `git show a9cffd85 -- docs/NPC_REDESIGN.md`.*

---

#### The audit that reopened this step (2026-07-29)

> [!CAUTION]
> **CORRECTION (2026-07-29 doc-vs-code audit). This step was marked SHIPPED /
> ACCEPTED at `8324d85c` and its core change was never built.** The Result block
> claimed *"NPCs now meet pirates, face damage and lose ships"*, and the PARITY
> LEDGER was edited to read *"real encounters, real death"* and *"full parity via
> resolveCombat"*. All of that was false at the commit that wrote it. What the
> commit actually landed was the `QUEST_PROFILES` roster split — one bullet of
> this step. Verified absent at `6d8647b2`:
>
> | N3 deliverable | state |
> | --- | --- |
> | encounters generated on NPC jumps | **absent** — `executeTravel` (`npc.ts:1041`) has no encounter call |
> | stance choice resolved by shared combat rules | **absent** — `resolveCombat` (`actions/combat.ts:371`) is never called from `npc.ts`; `executeCombat` is still the pre-N3 abstract GUNS check + flat `150 × tier` bounty |
> | damage / repair / ship loss | **absent** |
> | `dead` on `NpcState` | **absent** — `types.ts` still reads "N3 WILL ADD `dead` HERE" |
> | `honorField` `.filter((n) => !n.dead)` | **absent** — `ui/src/format.ts:2617` still names its own unfixed remedy |
> | FIRST TASK: widen `clone.test.ts`'s scan to `npc.ts`/`state.ts`/`packages/sim` | **absent** — the scan is still `[...actionFiles, 'day.ts', 'storylets.ts']`, and `clone.test.ts:360` still says npc.ts is "DELIBERATELY outside the scanned set" |
> | Simulate: full sweep + NPC deaths/1k days | **never run** |
>
> The track's own preamble at line 69 contradicted the SHIPPED marking the whole
> time — *"Still true at HEAD: no encounters (N3)"*. **The lesson to carry: a
> status board is not evidence.** This audit's method was to grep for the named
> function at the named call site, and every falsified row failed that check in
> one command.
>
> **WHAT LANDED AND STAYS:** the `QUEST_PROFILES` roster split. It implements the
> owner's ruling recorded below (SETTLED 2026-07-29) and is a better answer than a
> mortality exemption inside the sim. `NPC_PROFILES` (30) / `QUEST_PROFILES` (11) /
> `ALL_NPC_PROFILES` (41, for global lookups) is the shape to build the rest of N3
> on top of.

- **Hypothesis:** routing NPC travel through real encounter generation, with a real
  stance choice, makes the NPC field carry the same risk the player does — which is the
  precondition for their wealth spread meaning anything.
- **FIRST TASK — widen `clone.test.ts`'s copy-on-write scan before adding a new
  cross-boundary NPC writer.** Filed by the 2026-07-29 audit as **OI-8** and deliberately
  folded in here rather than fixed on its own: N3 introduces death marking, which IS a new
  cross-boundary NPC write, and the guard should be ahead of it rather than behind it.
  What the scan covers today is `day.ts`, `storylets.ts` and `actions/*.ts` — **`npc.ts`,
  `state.ts` and the whole of `packages/sim` are unscanned** — and both the handle names
  and the field names it matches are hard-coded allowlists, so a writer named `captain`, or
  a field like `name` or `profileId`, walks straight past it. This document has already
  recorded the same lesson twice: N0 asserted one cross-boundary writer and found four (a
  grep keyed on variable names), and N1 found the pattern blind to nested paths. The third
  instance is the one to fix by widening the scan's SHAPE, not by adding another name to a
  list. **Known benign escapee, named so it is not discovered as a surprise:**
  `packages/sim/src/balance/synthesize.ts:158-164` writes NPC records raw. It is safe today
  only because the state is fresh from `createInitialState`, so there is no snapshot for it
  to corrupt — but that is a property of its caller, not of the write, and it sits outside
  the door and outside the scan.
- **Change (programmatic):** generate encounters on NPC jumps; give the NPC a stance
  (pay with credits, pay with cargo, fight, flee) resolved by the SAME combat rules;
  apply damage, repair and — the sharp end — **ship loss**.
- **SETTLED (owner, 2026-07-28): an NPC death is PERMANENT. No succession, no
  replacement, no respawn.** The player gets succession; an NPC does not. The framing is
  *"in many real-world multiplayer games, sometimes a player quits"* — the seat empties
  and stays empty. Consequences to build deliberately rather than discover:
  - **The field shrinks over a career.** Contract competition falls, and the Honor List
    (N6) loses contenders. That is the intended fiction, not drift — but N8 must measure
    the shrink rate, because a roster that empties by day 60 is a different game from one
    that loses two captains in 120 days.
  - **Authored content attached to the dead. SETTLED (owner, 2026-07-29): The eleven
    mechanically-referenced captains are moved to a separate `QUEST_PROFILES` roster. The 30
    captains in `NPC_PROFILES` are fully simulated and mortal.**

    *The real failure mode was mid-chain death.* Storylets are
    multi-step chains with scheduled follow-ups: answer Doc Salvage's ping on day 12
    (`chain.doc-salvage.ping_answered`), Doc Salvage dies on day 40, and on day 41 the
    scheduled beat fires — *"Doc Salvage answers a day later…"*. **A dead captain talks.**

    Instead of exempting them from mortality within the simulation, which creates an awkward
    exemption in the simulation logic, the 11 characters were extracted entirely from
    `NPC_PROFILES` into `QUEST_PROFILES`. The 30 captains in `NPC_PROFILES` are subject to the
    exact same rules as the player. `QUEST_PROFILES` only exist for authored side quests.

    **THE OWNER'S REASONING, recorded directly (2026-07-29) because the split keeps being
    read as a mortality exemption in disguise:** the alternative on the table was *eleven
    immortal NPCs*, and it was rejected *"because it didn't make thematic sense"* — a cast
    where a third of the names cannot die is not a harder rule, it is a worse fiction.
    So the eleven are **set aside for storyline only**. They are not immortal captains;
    they are not captains in the simulation at all. Anything that reads them as part of
    the field is the bug, which is why `isSimulatedCaptain` (content `cast.ts`) is now one
    shared predicate with the tally of what that conflation has cost written at its
    definition site.

    **TWO CONSEQUENCES, both found at N4 and both filed rather than drifted into.** (1)
    `buildNamedCandidates` filters on `NPC_PROFILES`, so the eleven stopped being drawable
    as random lane interdictions — *correct* under this ruling, and worth 0.52 → 0.73
    deaths/1,000 on the combat-survival slice if it were undone (measured). (2) **OPEN, and
    an owner design question:** `applyDisposition`'s `loan-default` (Penny Wise) and
    `contraband-caught` (a named patrol captain) reasons were written so T-1204's
    interception weighting could read them. With those captains out of the pool that reader
    is unreachable for them, so those grudges need a storylet-side expression or the writes
    need re-siting.

    **The eleven quest characters:** `npc-silk-dagger`, `npc-lucky-seven`, `npc-rattlesnake`,
    `npc-penny-wise`, `npc-doc-salvage`, `npc-wild-card`, `npc-smuggler-ray`,
    `npc-stellar-monk`, `npc-void-whisper`, `npc-the-broker`, `npc-rust-bucket`.
  - **A dead captain's record stays** (for the wire, the Honor List's history and any
    grudge the player still carries); it is marked dead, not deleted.

    **— and the Honor List must then SKIP it. This is a N3 deliverable, not a N6 one.**
    Read alone, the bullet above argues only that the record persists, and a reader who
    implements `dead` and stops there ships a board that ranks corpses forever. Skipping
    marked records is the **fifth 1991 behaviour N6 deliberately left as a seam** (filed by
    the 2026-07-29 audit as **OI-2**; see N6's correction block). `honorField`
    (`packages/ui/src/format.ts:2611`) applies no dead filter, says so in its own words,
    and names the exact remedy — `.filter((n) => !n.dead)`. **One clause, in a file N3
    otherwise has no reason to open**, which is precisely why it is written down here.
- **Simulate:** full sweep + NPC deaths/1k days beside the player's.
- **Proves:** NPCs lose ships at a rate in the same order as the player's archetypes;
  contract competition drops when captains die; the wire narrates it.
- **Disproves:** NPC death rate is wildly off the player's (the stance logic is not
  player-like), or the roster empties out over a long career.

### N4 — NPC archetypes (SHIPPED 2026-07-29, rebuilt)

**Result (2026-07-29): ACCEPTED.** Both Proves limbs hold, the Disproves does not
fire, and — unlike the first attempt — the step was *gradeable*, because the
multiplicative design leaves a real control arm. Rebuilt against the two owner rulings
below after the audit found the field machine-generated and the selection logic collapsed
to a constant per archetype.

**THE CONTROL ARM IS THE HEADLINE, because it is what the deterministic switch
destroyed.** Two full capstones, 1,000 seeds × 120 days × 8 policies each, identical in
every respect except `ARCHETYPE_INTENT_MULTIPLIERS`: the shipped table against
`NEUTRAL_INTENT_MULTIPLIERS` (every archetype scaled by 1, i.e. captains driven by `ideal`
alone). `docs/balance/baseline-n4-control.json` is that control, committed as grading
evidence and **not** a baseline — the things that define the baseline of record are
standing amendment 1's pointer and `balance-targets.test.ts`'s path, never mere presence
in `docs/balance/`. (`baseline-n4-shipped.json` WAS the baseline of record at this step;
N10 superseded it.)

Archetype's attributable effect on the CAST (10 seeds × 200 days, medians over the
simulated field; control → shipped). **Later steps grade against this table** — N10 did:

| archetype | n | interdictions/captain/run | median credits | median hull |
| --- | --- | --- | --- | --- |
| trader | 6 | 39.5 → **43.5** | 596,006 → **851,930** (+43%) | 90 → 90 |
| smuggler | 4 | 31.1 → **29.8** | 394,909 → **413,723** (+5%) | 90 → 90 |
| veteran | 5 | 15.8 → **21.6** | 158,465 → **206,987** (+31%) | 90 → 90 |
| gambler | 4 | 21.3 → **18.5** | 208,472 → **129,544** (−38%) | 90 → 90 |
| explorer | 5 | 30.9 → **26.2** | 27,873 → **206** (−99%) | 90 → **80** |
| fighter | 6 | 8.8 → **6.4** | 592 → **170** (−71%) | 70 → **50** |

Every archetype moves in its own direction and none is noise, so *"archetype makes no
measurable difference"* does not fire. The control arm already separates the six groups
(they were curated to correlate with `ideal`), which is exactly why the arm was needed:
without it, "archetype works" and "the ideals underneath it work" are one measurement.
**Proves limb 2 holds** — 8 of 8 Honor List titles contested on every seed, 8.8 distinct
holders. **The PLAYER's game barely moves** (control → shipped, 1,000 seeds: fleet clear
0.5145 → 0.5199, credits median 30,533 → 30,425, deaths/1,000 0.6573 → 0.6448).

**Still binds:**

- **THE FINDING THAT OUTRANKS THE VERDICT — ONLY TRADE PAYS, so specialising away from it
  is a wealth penalty rather than a different strategy.** The two archetypes that
  specialise *out* of Trade end at **206 and 170 credits median** — twelve of the thirty
  captains destitute — and they are the two whose median HULL also falls, because a captain
  with no purse buys no ship. The cause is the NPC verb payout table, not the blend:
  `executeTravel` pays **nothing**, `executePatrol` 40, `executeCombat` a flat
  `150 × tier`, and only `executeTrade` a real contract. So an archetype is currently a
  choice about *how poor to be*. **Same shape as N9's finding that the player's combat pays
  nothing** — R2c fixed the player side with wreck salvage; the cast never got the
  equivalent. Deliberately NOT tuned here (one change per step; re-pricing a verb is a
  design call). **N10 has since spent one of the three chances and the floor did not move**
  (cast p10 126 → 126) — see N10's Result. If N11 and N12 do not close it, the fighter's
  `150 × tier` is the first knob and it belongs to the owner.
- **The wealth-spread ceiling is intact but its headroom has thinned, and N8 owns the
  call.** `campaign.test.ts`'s 25× top/median ceiling is **unmoved**; re-measured over the
  simulated living field, seeds 1..10 worst 20.09, so 25 now sits 24% above the worst
  observed where N2 chose it for ~56%. A PASS, not raised; the direction is the finding
  above arriving in a second instrument.
- **THE THREE NUMBERS, and conflating any two has now caused four live bugs.** Read
  `NPC_PROFILES.length` for the simulated field (**30**), `state.npcs.length` for the
  record count (**41**), **31** for the board. Two instrument bugs of exactly this class
  were found and fixed here — `sampleMilestone` sampled all 41 records, so every NPC
  percentile since N3's roster split was diluted by eleven captains frozen at day 1 (they
  cluster mid-distribution, so they *set the median*: 5,000cr against the field's 167,421,
  reporting a 344× wealth spread where the field's is 10.3×). **The fix was the SHAPE, not
  the instance:** one exported `isSimulatedCaptain` predicate replaced four local
  spellings, and its definition site carries the tally of what the conflation has cost.
- **THE STAT-AFFINITY TERM IS GONE FROM `pickIntent` — a deliberate divergence from the
  pre-N4 formula, measured rather than assumed.** Pre-N4 the weight was
  `IDEAL_WEIGHTS × (1 + affinity stat)`; the blend replaces that second factor with the
  archetype multiplier instead of stacking on it. Keeping the stat term concentrates the
  average captain onto **3.1** verbs at ≥5% against **4.3** without it, and takes a TRADE-5
  trader to 89% Trade with ONE live verb — i.e. it re-creates by a subtler route the "ten
  traders are the same function" collapse this step exists to undo. `INTENT_STAT_AFFINITY`
  keeps its honest reader: which stat ROLLS the day's check.
- **THE RULING'S WORKED EXAMPLES REPRODUCE EXACTLY, and one has an arithmetic slip.** Cargo
  King draws Trade 12/16 = **75%** / Travel **13%**; Zero Risk Trade 8/13 = **62%** /
  Patrol **15%** — both pinned by tests. Iron Vex's row divides by 17 where the weights sum
  to 18, so the ruling's *"Combat ~59%, Patrol ~35%"* is really **56% / 33%**. The design is
  unaffected; flagged **so a reader does not "fix" the code to match the prose.**
- **The poverty override is a MULTIPLIER (×3), never the old flat `+10`** — a
  rule-exemption question, not a tuning one. `0 + 10` hands The Warden (`Justice`, Trade
  weight an authored **0**) the one verb his worldview forbids the moment his purse dips:
  an exemption bought with a constant, which is what standing-constraint consequence 2
  names. The scale was also wrong by an order of magnitude (pre-N4 weights ran to ~70, the
  blend's top out near 12). A legitimate knob for a later sweep, **but it must stay a
  multiplier.**
- **ONE `it.fails` TRIPWIRE, the battery's third, and the capstone is what proves it is
  not N4's.** `balance-combat-survival`'s fleet death-rate FLOOR (0.8/1,000 sim days, a
  T-1603c design target) is breached — but at 1,000 seeds the fleet rate is **0.6448**, and
  it was **0.6323** at `baseline-r2c-explorer-remit`, which predates N3 entirely. So the
  capstone has been under 0.8 since before either N-step touched the cast, and N3+N4
  together moved it **UP** 2.0%. The 60-day/4-policy slice measures a harder-than-fleet
  corner and 0.8 was calibrated on that corner; reconciling the two is a calibration
  decision for **R2.5/N8**, not a number for this step to pick.
- **A DELIBERATE DESIGN CONSEQUENCE, with an OPEN owner question inside it.**
  `buildNamedCandidates` filters on `NPC_PROFILES`, which N3's split shrank 41 → 30, so the
  eleven storyline captains stopped being drawable as random interdictions. That follows
  from what the split IS, so it is intended (putting all 41 back moves the slice
  0.52 → 0.73/1,000, still short of 0.8). **What IS genuinely open:** two
  `applyDisposition` reasons are written for storyline captains — `loan-default` (Penny
  Wise) and `contraband-caught` (a named patrol captain) — and T-1204's interception
  weighting was their reader, now unreachable for them. Those grudges need a storylet-side
  expression or the writes need re-siting. **An owner design question, not a number.**
- **`archetype` has FIVE readers and the split between them is the design.** Two are
  content-driven and belong to this step (`ARCHETYPE_INTENT_MULTIPLIERS` in `pickIntent`;
  the poverty weight on the same numbers). Three are engine-side destination/stance biases,
  kept because they are the half an intent weight cannot express: `pickNpcStance`,
  `executeTrade`'s smuggler rim preference, `executeTravel`'s explorer rim preference.
  **The explorer one is why explorers own 10 of 12 deaths** — `routeDangerFor` prices a rim
  lane as the dangerous thing it is, so the preference BUYS the archetype its own mortality
  rather than being free flavour. N10's `pickContract` joined them as the sixth, which is
  why N4 keeps its early slot.
- **A METHOD PRECEDENT worth reusing: a chronically re-pinned assertion becomes a sweep
  PROPERTY, not a luckier seed.** `alliance-arcs`' organic-reputation test had been re-pinned
  five times (3→6→2→3→1) by five upstream changes with one cause. It now asserts that every
  seed of 1..20 moves reputation and ≥5 of 20 fire an organic mover — both halves *stronger*
  than any single seed, and 1.9s for all twenty.

*Provenance: capstone `docs/balance/baseline-n4-shipped.json`, control arm
`docs/balance/baseline-n4-control.json`. Full record — the 23-red-test account, the
day-loop golden diff, the per-test re-sweep protocols and the added-coverage list:
`git show a9cffd85 -- docs/NPC_REDESIGN.md`.*


---

#### The audit that reopened this step (2026-07-29)

> [!CAUTION]
> **CORRECTION (2026-07-29 doc-vs-code audit).** Marked SHIPPED / ACCEPTED at
> `6d8647b2`. The `archetype` field is real and stays; the assignment, the
> selection logic, and the grading were all unsound. **Every finding below was
> independently re-confirmed by measurement before the rebuild** — the
> distribution table, the `switch`, and the staleness — so the correction is
> accurate as written and is kept whole.
>
> **1. The Result text was false.** It claimed *"The 30 `NPC_PROFILES` were assigned
> archetypes spanning Trader, Smuggler, Fighter, Explorer, Gambler, and Veteran."*
> Measured across the sim roster:
>
> | trader | fighter | explorer | gambler | smuggler | veteran |
> | --- | --- | --- | --- | --- | --- |
> | 10 | 12 | 4 | 3 | **1** | **0** |
>
> **`veteran` has zero members**, so its `pickIntent` branch is unreachable for
> every simulation captain. The roster's only veteran sits in `QUEST_PROFILES`,
> which the dusk loop skips by construction.
>
> **2. The assignment was machine-generated, not authored.** A one-off regex script
> (`modify_cast.js`, committed to the repo root and since deleted) mapped profiles
> by a first-match branch chain whose ordering starves the last two archetypes.
>
> **3. Two questions were raised in the step's own plan and shipped unanswered** —
> the archetype distribution, and the fate of `ideal`. Both are ruled below.
>
> **4. A deterministic `switch` was the wrong medium for this step's hypothesis.**
> `pickIntent` was rewritten to return a fixed verb per archetype. Ten trader
> captains became *literally the same function* — `return 'Trade'`, every day,
> forever, zero variance. The step's hypothesis is *"a field that behaves like 30
> different people rather than 30 samples of one distribution"*; collapsing 30
> authored `ideal` profiles into 6 constant branches is **further** from that than
> the weight table it replaced. It also destroys the step's own grading: with a
> deterministic switch there is no control arm, so *"archetype makes no measurable
> difference"* (the Disproves) cannot be distinguished from *"archetype is the only
> input left"*.
>
> **5. Nothing was measured.** No sweep was run, and N3+N4 together moved hashed
> rule sources (`cast.ts`, `npc.ts`, `day.ts`, `travel.ts`, `hangout.ts`, `wire.ts`,
> `state.ts`), so `npm run balance:smoke` now fails the N7 staleness gate: *"STALE
> FIXTURE … these checkpoints describe a game that no longer exists."* The fixture
> was fresh at `b6b568f3` and went stale across these two commits. Both steps were
> graded on nothing, which is the failure mode this track built the rig to prevent.
>
> **6. Resequencing, recorded rather than drifted into.** The run order has N4
> *after* N10–N13. N4 landing first is now deliberate and load-bearing: N10's
> archetype-driven `pickContract` reads `profile.archetype`, so the field has to
> exist before the board step can use it. N4 keeps its early slot.

#### OWNER RULINGS (2026-07-29) — the two questions N4 shipped without

**RULING 1 — `ideal` stays live, and archetype BIASES it rather than replacing it.**
*Context the ruling rests on:* `ideal` is not a second personality axis, it is
**this step's own predecessor at 30-value resolution.** `ideals.ts:6` — *"an NPC's
Ideal steers what they want to do with their day"* — and `IDEAL_WEIGHTS` maps each
worldview to relative weights over the five verbs, where a `0` vetoes a verb
outright (the Stellar Monk's `Balance` never initiates combat). It had exactly one
mechanical reader, `IDEAL_WEIGHTS[profile.ideal]` in the old `pickIntent`, and it is
**never surfaced to the player** — `format.ts:809-810` builds the player-facing
temperament line from `bond` + `flaw` only.

So the design is multiplicative, not substitutive: **archetype scales the captain's
own `IDEAL_WEIGHTS`, and the engine draws from the combined distribution.**

```
Iron Vex   · fighter · Dominance   {T:1, Tr:1, C:5, P:3, S:0}
  ×archetype                       {  1,    1,  10,   6,   0}  → Combat ~59%, Patrol ~35%
Cargo King · trader  · Wealth      {T:6, Tr:2, C:0, P:1, S:1}
  ×archetype                       { 12,    2,   0,   1,   1}  → Trade ~75%, Travel ~13%
Zero Risk  · trader  · Survival    {T:4, Tr:2, C:0, P:2, S:1}
  ×archetype                       {  8,    2,   0,   2,   1}  → Trade ~62%, Patrol ~15%
```

Two traders remain measurably different captains, every captain keeps a distinct
profile, `ideal`'s authored `0` vetoes survive the multiply, and archetype becomes a
**separable** effect the sweep can attribute. The poverty override stays.

**RULING 2 — archetypes are hand-curated from each captain's stats / ideal / bond,
with a floor guaranteeing every archetype has enough members for its branch to be
live and measurable** (roughly 4–6 each across the 30). No machine assignment.

- **Hypothesis:** assigning each of the 30 a playstyle (trader / fighter / explorer /
  smuggler / gambler / veteran) produces a field that behaves like 30 different people
  rather than 30 samples of one distribution.
- **Change:** an archetype per NPC at world creation, driving its turn. Reuse the sim
  policies' *logic* where possible — they already encode these styles — without paying
  the player's full day loop (see the performance envelope above).
- **Proves:** per-archetype NPC outcomes differ measurably (wealth, deaths, fit); the
  Honor List (N6) shows different captains topping different titles.
- **Disproves:** archetype makes no measurable difference — the NPC turn is too coarse
  for the distinction to survive.

### N5 — NPC proficiency spread

- **Hypothesis:** *"some will play very well, some will make mistakes."* This is already
  built and calibrated: R1's `PilotDegradationProfile` models exactly this (noisy die
  allocation, thin fuel margin, greedy contract overreach) and measured a **7.6x**
  survival difference between a sharp and a sloppy pilot.
- **Change:** a proficiency profile per NPC at world creation, spread across the roster.
- **Proves:** NPC outcomes correlate with proficiency, not just archetype; the field has
  a visible top and bottom that is not purely luck.
- **Disproves:** proficiency washes out — the NPC turn has too few decisions for skill to
  express itself, which would itself be a finding about the turn's depth.
- **GATED BY N13 (2026-07-29).** "Noisy die allocation" presupposes a hand the cast does
  not hold — the very Disproves clause above was at risk of firing *by construction*.
  Grade this step against whichever decision surface N13 ships, and rewrite the lever
  list here at N13's close to name which degradation levers survive the translation.
- **WHAT N4 HANDS TO N5 (standing amendment 4): the Disproves clause needs re-reading,
  because the axis N5 wants now has a rival that works.** N4 established that per-captain
  *style* produces a very large outcome spread (median wealth from 170 to 851,930 across
  archetypes) with the coarse one-verb turn unchanged. So *"the NPC turn has too few
  decisions for skill to express itself"* can no longer be read off a flat field — the
  field is not flat. The risk N5 actually runs is the opposite one: **archetype variance
  may swamp proficiency variance**, and a sweep that only reports outcome spread will not
  tell them apart. Grade proficiency WITHIN archetype (does a sloppy trader differ from a
  sharp trader?), not across the roster, and reuse N4's control-arm trick — an arm with
  proficiency neutral — for the same reason N4 needed one.

### N10 — NPCs work the contract board (SHIPPED 2026-07-29)

**Result (2026-07-29): CHANGE ACCEPTED — HYPOTHESIS DISPROVED** (the wording standing
amendment 2 counts in its ratio; N1 is the precedent). The shared per-system pool is
built, the cast works it everywhere, and the player's board is shaped by it. What does
not hold is *"makes contract competition a real economic force"* — **and the reason is
neither throttle the Change clause suspected. The cast consumes ~6% of the galaxy's
daily job supply (4.61 claims against 20 systems × 4 offers), spread almost evenly, so
79% of system-days still open on a full board.** Sweeping both knobs confirms it: the
snipe cap at 1 / 2 / unbounded gives 354 / 420 / 423 visible snipes per 2,000 days, and
`JOB_POOL_REGEN_PER_DAY` at 1 / 2 / 4 gives galaxy mean board depth 3.740 / 3.768 /
3.770. A pool's memory length cannot matter at ~0.2 claims/system/day.

**The step's real effect was a parity gap it was not looking for.** Pre-N10 an NPC took
ONE randomly-rolled contract where the player picks from four — not a different rule,
just *less of the game*. `pickContract` closes it, and it is worth **+247% on the cast's
day-120 median wealth** (21,884 → 76,049 at 1,000 seeds).

**Still binds:**

- **THE FINDING THAT OUTRANKS THE VERDICT — THE NON-TRADER FLOOR DID NOT MOVE, and one
  of its three chances is spent.** At day 120 the cast's median wealth tripled while its
  **p10 did not move: 126 → 126**. Everyone already trading got much richer; nobody
  destitute stopped being destitute. The cause is the verb mix, not the board — a fighter
  chooses Trade on **3.0%** of days and an explorer on **7.6%**, against a trader's 41.1%
  — so **a fix routed through Trade cannot reach a captain who does not trade.** That is
  the corollary to N4's *"only Trade pays"*, and it is what N11 and N12 have to answer;
  both carry a hand-off block. If they do not close it, the fighter's `150 × tier` is the
  owner's knob (N4's Result).
- **The player's game barely moved, which is what makes this an NPC-side change.** Fleet
  Tour One clear 0.5199 → 0.5180, fleet final credits median 30,425 → 30,915, deaths/1,000
  0.6448 → 0.6573; no policy's clear rate moves more than ~2 points.
- **THE ONE CHANGE THAT WOULD UNDO THIS STEP: decoupling depth from the ledger.** The
  away-claim path calls `generateManifestBoard` per trading captain — *literally what the
  reverted attempt did* (`7334c5d5`). The difference is the coupling in BOTH directions:
  depth is READ from the shared ledger (`jobPoolDepth`) and the claim is WRITTEN back to it
  (`debitJobPool` via `NpcDayResult.claimedFromPool`). Remove either and this silently
  becomes the private board the standing constraint forbids. The tests that would notice
  are in `livingGalaxy.test.ts` under *"the shared job pool is galaxy-wide, persists, and
  restocks"*.
- **Regeneration runs AFTER the board is drawn, and that order is load-bearing** —
  restocking first would refill the pool before anyone could see it drained, deleting
  T-106's mechanism instead of generalising it. At
  `JOB_POOL_REGEN_PER_DAY >= JOB_POOL_BOARD_SIZE` the rule reduces exactly to T-106's dawn
  reset, so pre-N10 is a value of this knob rather than a different mechanism.
- **`market.npcClaims` → `market.jobPoolClaims` is a MOVE (save v10 → v11)** — the second
  in `MIGRATIONS` after N1's `fuel` → `ship.fuel`, with the same two-directional strictness
  making a half-done migration fail loudly. `deserializeState` performs the same move and a
  test pins both paths to one answer, because N1's `fuel` backfill is the precedent for them
  drifting.
- **THE `dist` TRAP — read this before measuring any future N step.** A probe importing
  `@spacerquest/engine` resolves to `packages/engine/dist`, so `git stash`-ing `packages/`
  and re-running yields a "control" **byte-identical to the shipped arm**: the stash reverts
  `src` and the stale build stays. It cost two control arms here, and the tell both times
  was output matching to the last decimal, which is not what a shifted rng stream looks
  like. Fixes: import `../packages/engine/src/index.js` directly, or `npx tsc -b` between
  arms.
- **`rulesFingerprint` IS NOT FORMATTING-INVARIANT, contradicting standing amendment 3's
  N7-FP note.** A `prettier --write` moved it `bed3c00ac19f43d7` → `3079dec9aa5a4af0` and
  staled a fixture extracted minutes earlier. N7-FP argues that hashing the TypeScript
  *emit* normalises formatting away; that is evidently not fully true. Handled without
  touching a fingerprint — the capstone was re-run on the formatted tree and diffed:
  **"NOTHING MOVED"** across 8,000 runs. *Procedural consequence: format BEFORE the
  capstone, not after.*
- **The instrument had never counted contract competition at all.** `day.ts` emitted
  `ContractClaimed` and nothing in `packages/sim` read it, which is why N2's *"+2.0%"* was
  an ad-hoc probe and no baseline has ever carried the number. Same class as N9's *"the
  aggregate cannot see an asset"*, closed the same way — ahead of the capstone, not after.
  `contractClaims` / `boardDepth` now ride the report, the per-day series and every
  aggregate row; named reader `campaign-contracts.test.ts`. **This is the worked example
  N12's FIRST TASK is asked to copy for `ports`.**
- **No pool claim emits an event, deliberately.** ~4.6 claims/day would add ~550 events to
  a persisted `eventLog` for a signal the player cannot act on, so away-claims are measured
  through state and the wire still narrates only the visible snipe — the one a player can
  actually watch. Per-claim provenance would be a new event type with its own cost
  argument, never a widening of `ContractClaimed`.
- **18 red tests inherited, battery 1,287 / 0 → 1,312 / 0.** Nine were the N7 staleness
  gate (cleared by the capstone), seven `campaign-degraded` fingerprints (logged entry 9),
  three protocol goldens, two day-loop goldens, and **three live bands that were sample
  size rather than regression** — `spacers die`, `deed-coverage` and the `campaign-reach`
  port hunt were all re-measured on widened samples with **every threshold byte-identical**,
  each recorded in its own file. The R-owned death-rate tripwire is still correctly red.
- **Baseline of record re-pinned to `docs/balance/baseline-n10-shipped.json`**, with
  `balance-targets.test.ts`'s path and standing amendment 1's pointer moved in the same
  commit.

*Full record — the per-archetype control table, the complete knob sweeps, the per-policy
capstone rows and the red-test-by-red-test account: `git show a9cffd85 --
docs/NPC_REDESIGN.md`. The measurement numbers themselves live in
`docs/balance/baseline-n10-shipped.json`; the knob sweeps, the golden diffs and the band
widenings are each argued at their own definition sites in code, which is the copy that
cannot go stale.*

---

**DISCHARGED — N4's hand-off, both clauses answered NO.** N4 asked this step to watch the
non-trader wealth FLOOR (opportunity) and the per-archetype income MIX (risk: that a
shared board turns every archetype back into a trader). The floor did not move (cast p10
126 → 126); no archetype turned back into a trader (the verb mix barely shifted and N4's
separation is intact). The income mix is what explains both — see the first Still-binds
bullet above.

> [!WARNING]
> **REVERTED ATTEMPT (`7334c5d5`, reverted 2026-07-29) — the anti-pattern, kept because
> the rebuilt code looks almost identical to it.** An unfinished implementation was
> committed and rolled back, leaving the engine at 154 failing tests. Three failure modes,
> **all three avoided in the 2026-07-29 rebuild**:
>
> 1. **A PRIVATE board** — `generateManifestBoard` per captain that depleted nothing and
>    was invisible to the player, i.e. the parallel cost model the standing constraint
>    forbids. *Rebuilt:* depth is read from `market.jobPoolClaims` and every claim written
>    back to it. **That two-way coupling is the whole difference, and the code reads the
>    same without it** — argued at `executeTrade`'s definition site.
> 2. **It silently killed the one competition signal that existed** — with `systemBoard`
>    always non-null the `ctx.claimableBoard` branch became unreachable and
>    `ContractClaimed` would have gone to ZERO, failing this step's Proves by construction.
>    *Rebuilt:* that branch is intact and still the only route to the event.
> 3. **`pickContract` hardcoded the origin** (`systemDistance(0, …)`), throwing
>    `Unknown star system route: 0 -> 11`. *Rebuilt:* origin is a parameter, pinned by a
>    test that drives one board from two origins to two answers.

### N11 — NPCs earn deeds and Renown (MUST-HAVE · owner ruling 2026-07-29 · NEXT)

> [!IMPORTANT]
> **WHAT N10 HANDS TO N11** (standing amendment 4). **The non-trader floor is
> untouched and one of its three chances is spent.** N10 gave the cast a shared board
> and the right to choose off it; measured at the 1,000-seed capstone, cast median
> wealth at day 120 went **21,884 → 76,049 (+247%)** while its **p10 did not move
> (126 → 126)**. Twelve of the thirty captains are still destitute. The reason is in
> the verb mix, not the board: a fighter chooses Trade on **3.0%** of days and an
> explorer on **7.6%**, so improving Trade's payout reaches them almost never.
>
> **THE CONSEQUENCE FOR THIS STEP'S DESIGN.** N4's finding was *"only Trade pays"*,
> and N10 has now established the corollary: **a fix routed through Trade cannot
> reach a captain who does not trade.** So N11's deed economy is worth more to this
> track than its own Proves clause suggests — a deed sourced from *fights won* and
> *careers survived* is the first income-adjacent reward a fighter or a veteran earns
> on the days they actually choose. Grade it that way: **report the per-archetype
> wealth FLOOR (p10) beside the rank distribution**, not just the ranks, and expect
> the fighter and explorer rows to be where the step either works or does not.
>
> **AND A WARNING ABOUT ITS OWN DISPROVES.** *"Zero accrual (the coarse turn cannot
> reach the thresholds)"* is the limb at risk, for a reason N10 makes concrete: a
> destitute fighter with hull strength 40 loses fights. If deeds are sourced mainly
> from *winning*, the captains who most need the income are the least able to earn
> it, and the step will report a floor that did not move for the third time. Check
> the deed sources against what a poor captain can actually achieve BEFORE measuring.

- **The dead end, measured (2026-07-29 audit):** `ShipyardActor.registry` is optional and
  no NPC has one, so `actorRankIndex` returns −1 — strictly below every rung — forever.
  No NPC deed source exists anywhere in the engine. Every rank gate therefore applies to
  the cast as a permanent lockout with no recourse, which is precisely what standing-
  constraint consequence 2 defines as an exemption ("a number chosen so that a rule will
  NOT bite…" has a mirror: a gate the actor can never open is not the same rule the player
  plays under, because the player can EARN the key). Dormant today only because
  `considerRefit` never requests special equipment; N3's combat and the Honor List's top
  end will make it bite.
- **Hypothesis:** captains who accrue deeds from their real actions produce a field whose
  top end contests the player's endgame — rank-gated gear stops being a player monopoly.
- **Change (programmatic):** give captains a deed registry fed by the actions they already
  perform, through the same deed definitions and thresholds (`deeds.ts`) — hauls
  delivered, fights won (N3), careers survived. The fast-forward allowance applies to the
  SOURCE (the coarse verbs stand in for played days); it does not license synthetic
  backfill of unearned rank at world creation — that is the phantom pattern again, and a
  tier-5 captain seeded with a rank they never earned is exactly the "constant recomputed
  from profile" N1 existed to kill. Rank-gated purchases then flow through the EXISTING
  gate with no NPC branch — `considerRefit`'s ladder learns about special equipment and
  nothing else changes.
- **Simulate:** full sweep + rank distribution at day 30/60/120 + special-equipment
  purchase counts.
- **Proves:** by day 120 some captains hold real ranks and buy through the Renown gate;
  the Honor List's top end includes rank-gated fits; the player's progression spine is
  contested, not copied.
- **Disproves:** renown inflation (the median captain outranks a competent player — deed
  pacing is wrong for a 30-seat field), or zero accrual (the coarse turn cannot reach the
  thresholds — a finding about deed pacing, not a reason to seed ranks).

> [!WARNING]
> **REVERTED ATTEMPT (`7334c5d5`, reverted 2026-07-29) — read before rebuilding.**
> Committed unfinished alongside the N10 attempt. The `NpcState.registry` field, the
> schema entry and the save migration were all the right *idea*; five things went wrong.
>
> **1. It wrote the NPC a private deed evaluator.** `evaluateNpcDeeds` reimplemented
> `evaluateDeeds` inline — the matcher, the dotted-path reader, the count logic and the
> rank-up emission. The standing constraint is explicit: *"Where an NPC cannot use the
> engine's own function today, the fix is to make the function usable by both (give it
> an actor parameter), **never to write the NPC a private one**."* This is the R2c
> failure mode verbatim: a second copy that agrees with the first until it drifts.
>
> **2. It granted itself two exemptions, both in its own comments.** The T-1703
> CONQUEROR demo cap *"is NOT applied"*, and any deed carrying a `state` matcher was
> skipped outright — which makes those deeds **easier** for an NPC than for the player,
> against this step's own renown-inflation Disproves. Either remove them or record them
> as ruled exclusions; do not leave them as silent code comments.
>
> **3. It inlined the registry shell in three places** — `createInitialState`,
> `deserializeState`, and `MIGRATIONS[10]`. N1's recorded precedent is the opposite:
> `MIGRATIONS[9]` *"calls `npcShipForTier` rather than restating it … **Anything that
> inlines a rule into a migration breaks that**"*, and it shares ONE seeding function
> with `createInitialState` and `deserializeState` so a migrated roster cannot drift
> from a freshly created one. Write one seeding function; call it three times.
>
> **4. `ShipyardActor.registry` was left optional.** The step's own plan said make it
> required once every NPC has one. Left optional, `actorRankIndex` can still return −1
> and the gate stays quietly closable — the dead end this step exists to remove.
>
> **5. The new `TradeEvent` was emitted before the stat check with `success: true`
> hardcoded**, so a *failed* Trade check still credited a delivery deed. And
> `eventIndex: 0` was stuffed into every earned deed as a placeholder.

### N12 — NPCs buy ports (MUST-HAVE · owner ruling 2026-07-29 · LANDS BEFORE N8)

- **Why, and why the owner flagged it:** N9 measured port stakes as the game's biggest
  asset lever — the port arm alone converted 22% of fleet cash into perpetual dusk income
  — and the player is structurally the only possible owner (`resolvePortPurchase` exists
  only behind the player's `Port` action). The owner had assumed the cast could already
  buy ports. Ports are finite and per-system: they are the single best multiplayer-
  scarcity surface the game owns, and today the player bids against nobody.
- **FIRST TASK — pull N8's asset-visibility task forward to here.** `sampleMilestone`
  records `crew` but not `ports`; the aggregate cannot see an asset for the player, let
  alone for a captain. If the cast starts buying ports before the instrument can count
  them, this step's own sweep cannot see its own effect — the R0a/R2a class of mistake,
  one more time. Milestones learn `ports` (player AND per-NPC) as the opening move, and
  N8 inherits the net-worth question with the plumbing already laid.
- **Change (programmatic):** the NPC turn may buy a stake through the same pricing and
  the same rules — `isPurchasablePort`, the standing-in-the-system co-location rule the
  player obeys, one stake per port, first come first served. `NPC_YARD_RESERVE` (the
  cast's existing discretionary-money line) throttles it the same way it throttles the
  yard; no new pacing constant unless the sweep demands one.
- **Simulate:** full sweep + port-ownership counts by day + who owns what at day 120.
- **Proves:** some ports end the career NPC-owned; the player faces real scarcity (the
  port they wanted can be gone); NPC wealth spread becomes partly asset-shaped rather
  than purely cash-shaped.
- **Disproves:** a day-N land grab locks the player out of every port before Tour One
  resolves (pacing wrong), or no captain ever crosses the price line and ports stay a
  player monopoly de facto (the reserve line is mis-set for six-figure assets).

> [!IMPORTANT]
> **WHAT N10 HANDS TO N12** (standing amendment 4), and it sharpens BOTH Disproves
> limbs in opposite directions — the field N12 will meet is much richer at the top and
> exactly as poor at the bottom.
>
> - **THE LAND-GRAB LIMB IS NOW THE LIVE RISK, not the theoretical one.** N10 nearly
>   doubled-to-tripled the top of the field: at day 120 the cast's median wealth is
>   **76,049** against N4's 21,884, and the richest captains run past 3.8M (10 seeds ×
>   200 days). The dearest stake is 140,000 (R2d's recovered 1991 curve). So a
>   meaningful slice of the cast can now afford ports EARLY, where against the N4 field
>   almost none could — **the pacing question N12 was going to ask theoretically is
>   about to be answered by a field with real money.** Measure port-ownership counts by
>   DAY from the first sweep, not just at day 120.
> - **THE MONOPOLY LIMB IS NOW ARCHETYPE-SPLIT.** Traders, smugglers, veterans and
>   gamblers can plausibly cross the price line; explorers and fighters (medians 167 and
>   132) cannot come close, and **N10 confirmed at 1,000 seeds that the floor does not
>   move when Trade's payout improves** (cast p10 unchanged at 126). So a port economy
>   funded out of cash will be a FOUR-ARCHETYPE economy. If that is the outcome, say so
>   as a finding about the floor rather than as a fact about ports — it is the third
>   instrument to report the same gap, and at that point the fighter's `150 × tier` is
>   the owner's call, as N4's Result already records.
>
> Also relevant to this step's FIRST TASK: N10 closed the equivalent blind spot for
> contract competition (the instrument had never counted `ContractClaimed` at all) and
> the lesson generalised cleanly — **close the instrument gap in the same step, ahead of
> the capstone, or the step cannot see its own effect.** `contractClaims` / `boardDepth`
> on `PolicyAggregate` are the worked example to copy for `ports`.

### N13 — The NPC decision surface: dawn-hand parity (MUST-HAVE · owner ruling 2026-07-29 · GATES N5)

- **The gap, in this track's own words:** the preamble says *"the NPC field does not face
  the game's central decision"* — and no step before this one addressed it. N5's premise
  (R1's `PilotDegradationProfile`, whose signature lever is noisy die ALLOCATION) silently
  presupposed a hand the cast does not hold.
- **Owner ruling (2026-07-29):** the decision must be represented; an algorithmic
  fast-forward is acceptable. The choice between the two designs below is the owner's,
  made at step start and recorded here — not drifted into.
  - **(a) A literal reduced hand** — 2–3 dice per captain-day, allocated across the day's
    verb, the refit, and overhead. *Pro:* the same rules literally; N5/R1's levers apply
    verbatim; `Crew` and `Reroll` become real NPC verbs (fold crew hiring in here, which
    also resolves the ledger's two "N13 decides" rows). *Con:* real per-day cost against
    the ~40 ms envelope (measure before committing); a genuinely new balance surface.
  - **(b) An algorithmic equivalent** — keep the one-verb day; derive the day's quality
    from a virtual hand drawn under the same RNG discipline, with proficiency (N5)
    expressed as allocation noise on it. *Pro:* envelope-cheap; N5 gets its medium
    anyway. *Con:* it is a MODEL of the decision, not the decision — it must be flagged
    at its definition site as the one sanctioned abstraction in the parity design, and
    `Crew`/`Reroll` then stay player-only, which the PARITY LEDGER must record as a ruled
    exclusion rather than a gap.
- **Simulate:** full sweep + per-captain outcome variance decomposition (verb-weight luck
  vs skill).
- **Proves:** NPC day outcomes gain a skill-sensitive spread that N5 can then widen;
  per-captain variance stops being pure verb-weight luck.
- **Disproves:** outcomes statistically indistinguishable from the pre-N13 turn — the
  added surface carried no decision, and N5 should not be graded on top of it.

### N14 — Captain voice: the daily wire boast (EXPERIMENT · owner spec 2026-07-29)

*Added by the owner during the 2026-07-29 audit, out of the question "what per-captain
axis do we NOT have yet?". Framed by the owner as **an experiment that will likely
mutate** — grade it on whether the wire reads better, not on a sweep.*

- **The gap.** The cast has six mechanical axes (`archetype`, `ideal`, `stats`, `flaw`
  + `flawDc`, `bond`, `tier`) and **no voice**. `wireStories.ts` keys its authored lines
  by verb CATEGORY with an `{actor}` placeholder, so all 30 captains speak identically:
  *"Iron Vex turned a legendary profit on a single haul"* reads word-for-word the same as
  *"The Chef turned a legendary profit on a single haul."*
- **NOT PvP messaging, and that is a deliberate exclusion.** `PRD-REIMAGINED.md:231`
  lists *"Multiplayer of any kind"* under non-goals, with the async arena *"parked
  deliberately"* for a future Season. Greetings / threats / victory / retreat lines for
  player-to-player contact are therefore **out of scope**. The Galactic Wire is the live
  player-facing surface that needs voice today; encounter narration becomes the second
  once N3 is actually built.
- **Change (owner spec):**
  - **Three authored boast lines per captain**, voiced individually and informed by that
    captain's name and archetype. 30 × 3 = 90 lines, in `content/` as pure data.
  - **One boast per day reaches the player, not thirty.** The owner's constraint is
    explicit: *"at the player's start, the player should NOT see 30 messages from NPC
    actions, but a top 3 based on actions that day."*
  - **Selection:** rank the day's captains by their actions, take the **top 3** as
    candidates, and emit the boast of the **first candidate not on cooldown**.
  - **Cooldown:** a captain who boasts is barred for **2 days**. This is what the top-3
    candidate list is for — if #1 is cooling down you fall to #2, then #3.
  - **Line rotation:** mark the emitted line used, so a captain's next boast draws a
    fresh one of their three. Together with the cooldown this is what *"makes those three
    text blurbs last a long time."*
- **OPEN — must be pinned before implementation, not drifted into:**
  > [!IMPORTANT]
  > **(a) What does "top 3 based on actions that day" rank ON?** Credits earned that
  > day? Contract value? A nat-20 in the day's check? Deed progress (N11)? The rank
  > function is the whole feature — a boast is only interesting if it is attached to
  > something the player can see the captain actually did.
  >
  > **(b) What happens when all three candidates are on cooldown?** Silence for the day,
  > or fall through to candidate #4+? Silence is cheaper and arguably better texture;
  > falling through guarantees a daily beat. Owner's call.
- **Proves:** the wire reads like 30 people rather than one narrator; a captain's boast
  is recognisably theirs; the 90 lines do not visibly repeat over a 120-day career.
- **Disproves:** the cooldown + rotation still cycles visibly inside one career (90 lines
  is too few), or the boast reads as noise because the rank function attached it to a day
  the player had no stake in.

### N6 — The Honor List becomes a real 31-way board (SHIPPED 2026-07-28)

**Result (2026-07-28): ACCEPTED** — and it measured the field's flatness as a number, which was
the most useful thing it produced. The board is **actor-shaped, not player-shaped**
(`HonorCaptain`, `honorField(game)` building `[player, ...npcs]`, a `rankTitle` that never
touches `game.player.*`), so one scoring path applies the engine's own `effectiveScore` whoever
the captain is and **there is no NPC branch to drift**; no `packages/engine` change was needed,
and **nothing outside `packages/ui` imports UI source**, verified, so that is the complete
affected scope — which is what warrants a scope-limited battery for the next UI change, N3's
`.filter((n) => !n.dead)` included.
Its finding — six of the eight titles uncontestable **by construction**, because
`npcShipForTier` varied only hull, drives and pods — became N2's premise and N2's acceptance
criterion, and N2 discharged it (2 of 8 -> 8 of 8 contested).

**Still binds:**

- **OI-2 — the fifth 1991 behaviour is a SEAM owned by N3, not a delivery.** Four behaviours
  were recovered from the original BASIC (`7ca606d7^:Decompile/Source-Text/SP.TOP.txt`, quoted
  at the definition site): the whole-registry walk, per-component max, co-held ties, and the
  40-character holder-line budget. The fifth — **skip-don't-delete for marked records**
  (`if (left$(na$,1)="*") … next`) — is **not implemented**: `honorField`
  (`packages/ui/src/format.ts:2620`) applies no dead filter, and `NpcState` has no `dead`
  field to read. The code says so in its own words at `format.ts:2611` — *"DEAD CAPTAINS (N3,
  not yet landed — this is the seam, not the feature)"* — and names the exact remedy,
  `.filter((n) => !n.dead)`. **Do not implement it here, and do not ask another step to
  implement it early:** the `dead` field is N3's state shape, and building it ahead of N3 is
  the ahead-of-the-step smuggling this track polices. **N3 owns it.**
- **OI-11 — KNOWN COSMETIC GAP in the holder-line budget, recorded not fixed.** The
  40-character budget counts **one** character per separator (`format.ts:2687`:
  `line += (holders.length > 0 ? 1 : 0) + captain.name.length`), exactly what the BASIC
  counted for its `"/"` join — so **the data-level 1991 parity is exact and the fidelity claim
  stands unqualified.** The UI then renders the separator as `" / "`, three characters, so the
  RENDERED line can exceed 40 visible characters. One surface, no rule depends on it. It is
  filed rather than patched because closing it means deciding whether the budget is a DATA
  rule (keep 1, the divergence moves to the renderer) or a DISPLAY rule (count 3, and 1991
  parity is what bends) — a decision, not a typo.
- **Ties are CO-HELD, not broken.** Any tiebreak available here (roster index, profile tier,
  credits) would be *this file inventing a rule about who is the better captain* — the R2c
  failure mode. Determinism comes from ordering: holders sort by name on a plain code-unit
  compare with **no locale collator**, so the board cannot depend on the machine that rendered
  it. Roster order is deliberately unused, asserted by a test that reverses `game.npcs` and
  requires a byte-identical board — which also means **N3 marking captains dead cannot
  reshuffle the display**.
- **`playerRank` is computed blind to `isPlayer`, to holder order and to the line budget**
  (`1 + captains scoring strictly higher`), so the player can never out-rank someone they
  merely tied. The player is pinned first among co-holders for honesty, not favour: on a
  31-way tie the 40-character budget prints ~3 of 31 names.
- **One documented divergence from foundation** (BALANCE-POLICY Part B rule 3): 1991 credited
  the **ship** (`nz$`); this board credits the **captain**, because Rimward's wire, dossier,
  Hangout and grudges all name the captain. Scoring, ties and budget untouched.
- **PROCESS: parallel agents need isolated worktrees.** N6 and N9 were run in parallel in one
  shared working tree, so N6's full-suite and `balance:smoke` runs were contaminated by N9's
  half-finished edits. The UI work itself was isolated and unaffected; the fix is cheap and it
  cost real confidence.
- **Out of scope, reported not fixed, and MEASURED ON THE CONTAMINATED TREE:** three shipped
  policies allegedly never buy a component upgrade in 120 days (`trader` ending at 3,000cr on
  the untouched day-1 junker, `veteran` at 1,085cr, only `smuggler` upgrading drives 10 -> 30).
  That reading is hard to reconcile with the baseline's 80,305cr median trader, which is
  itself a reason to distrust it. **Re-measure on a clean tree before acting.**

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N7 — The measurement rig: capstone sweep + staged smoke tests (SHIPPED 2026-07-28)

**Result (2026-07-28): ACCEPTED.** The loop the owner designed — capstone sweep -> differ ->
checkpoint extraction -> fast staged smoke tiers — ships as `npm run balance:diff` /
`balance:extract` / `balance:smoke` plus `--milestone-days` on the sweep, with 94 new tests
(71 smoke + 23 rig guards). **A full sweep is only warranted as a capstone after a series of
green smoke tests.** It immediately found that the instrument had never played three of the
game's eleven actions (see N9).

**Still binds:**

- **SUPERSEDED IN MECHANISM BY N7-FP (2026-07-29 · `b7b52116`), audit item OI-3.** N7 shipped
  the fingerprint as a hash over **raw file bytes**, and explicitly refused comment-stripping
  on the grounds that "a parser that mis-parses fails silently, in the one direction this
  whole design exists to prevent." That is no longer HEAD: `rulesFingerprint` is now taken
  over the TypeScript printer's re-emission with comments stripped, and the raw-byte hash
  survives demoted as `docsFingerprint`. **The refused warning was RIGHT and was honoured, not
  discarded** — the silent-mis-parse hole was real, was filed as **OI-7**, and is closed by a
  hard `parseDiagnostics` assertion. See **N7-FP** and **N7-RIG**.
- **The fixture contract.** Fixtures live in `docs/balance/smoke/` (see its README) and every
  one records `productVersion`, `saveSchemaVersion`, a `rulesFingerprint` and its sweep
  provenance. **A stale fixture fails loudly and is never silently used** — there is no
  `--force`, no env override, no auto-refresh, and a rig test asserts that checking a stale
  fixture leaves the file on disk untouched. Staleness was verified independently by moving
  the hash and watching every tier fail in `beforeAll`, so **the 64 tier assertions did not
  run at all** — nothing can report green about a game that no longer exists.
- **Two fingerprints, not one.** `rulesFingerprint` covers `packages/content/src` + the
  engine's rule modules; **`packages/sim` is deliberately OUT of it and into a separate
  `instrumentFingerprint`** — the sim is the thermometer, not the weather, so folding it in
  would assert "the ruleset changed" every time a policy was tuned. `save.ts`/`schema.ts` are
  excluded because persistence is versioned by `saveSchemaVersion` (safe only on the N1
  precedent, where `MIGRATIONS[9]` *calls* `npcShipForTier`); `types.ts` and `clone.ts` are
  IN, on the N1 and N0 precedents. **The classification is total and reviewer-checkable:**
  three tests enumerate `packages/{engine,content,sim}/src` and fail on any `.ts` that is
  neither hashed nor named in the exclusion map with a reason, **so a new engine module cannot
  land unclassified.** *Read that totality claim alongside N7-RIG: it was true for FILES
  inside declared directories and silently untrue for DIRECTORIES until OI-6 landed, and it is
  still untrue for a whole new hashed ROOT.*
- **THE HONEST CAVEAT, enforced structurally rather than documented.** You cannot start a
  career at day 21 without simulating days 1–20, so mid-game tiers use SYNTHESIZED states, and
  **a synthesized run must never be used to grade balance.** `runCampaign`'s only door to a
  mid-game start stamps `syntheticStart: true`, `summarizeReport` carries the stamp to the
  `SeedRow`, and `aggregateRows` **throws** on any synthetic row, naming seed and policy.
  Since a `BaselineAggregate` is the artefact every balance number in this document comes
  from, a synthesized run cannot become a balance number by any route. Filtering was
  considered and rejected: a silent drop turns *"you measured something you may not measure"*
  into *"your sample was smaller than you thought"*. **Smoke tests catch regressions; the
  capstone sweep remains the only authority on numbers.**
- **What the smoke suite MISSES, stated because a breakage detector that oversells its
  coverage is the failure mode here.** *Ship loss and succession: zero coverage* — at 0.57
  deaths/1,000 days, 672 sim-days expects 0.38 deaths, so no seconds-scale tier can cover the
  death path. *A synthesized captain has an empty deed registry and LIEUTENANT rank*, so
  deed-gated storylets, rank-driven `player.tier` and the progression spine are untested in
  the three mid-game tiers (fabricating deeds would be authoring content inside a fixture).
  *The spread is rank-coupled marginals, not joint samples*, so the `max` slot holds 83,701
  credits **and** 25,000 debt. *The recorded-outcome half only catches drift while the rules
  hold still* — which is why the **invariants** are a separate half, including a per-tier "not
  measuring a stalled field" check so the goldens cannot quietly become tautologies.
- **The `days-29-31` tier is declared per tier, not inferred from the day window.** `day.ts`
  forks the career at `day === player.debtDueDay` (30) into cleared/unpaid, and the unpaid
  branch sets `guild.debt-flagged`, which re-prices every board and encounter thereafter:
  **56/56 runs resolve Tour One on that tier, 0/56 on each of the other three.** If
  `debtDueDay` moves, the assertion fails and is re-decided instead of silently re-deriving.
- **Every capstone harvests real milestone samples to replace the estimated spreads**, so the
  fixtures get truer with each capstone. The shipped fixture is `spreadSource: "harvested"`;
  the `estimatedSpread` fallback was verified and correctly reports `spreadSource:
  "estimated"` with a re-run note. `--milestone-days` is proven non-invasive: 0 numeric
  changes, 0 value changes, 3,699 shape changes — all of them added `milestones[…]` paths.
- **Reading a differ report: `label` is the sole deliberate ignore, and the report names what
  it ignored.** Keying `topRoutes` by route id once produced 192 phantom "shape changes" — a
  route dropping out of the top five is a value change, not a schema difference. Check the
  shape/value split before believing a moved row.
- **Baseline of record UNCHANGED at this step** (`baseline-r2c-final.json`); the harvest
  capstone was numerically identical to `baseline-n1.json` and was deliberately left
  uncommitted in `.scratch/`, because **writing a `baseline-*.json` into `docs/balance/` reads
  as a re-pin, and a re-pin is a decision, not a side effect.**

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N7-FP — The rules fingerprint hashes code, not bytes (SHIPPED 2026-07-29)

**This is not a graded N-series step** — no hypothesis, no sweep, no verdict, no re-pin. It is
a defect and its fix, recorded beside N7-RIG because both change *the instrument that decides
whether a fixture still describes HEAD*. `rules-fingerprint.ts` used to hash raw file text, so
editing a COMMENT in any rule source moved `rulesFingerprint` and declared every balance
fixture stale — answering *"this is a different game"* when the truth was *"same game, better
sentence"*, and taxing exactly the definition-site commentary BALANCE-POLICY Part B rule 3
requires. **The fix (option C of three considered):** comments are now stripped before hashing
**using the TypeScript parser rather than a regex** (`//` and `/* */` occur inside string
literals here, so text-stripping would corrupt real code), and the re-print also normalises
quote style, so a Prettier pass cannot move a rules fingerprint either.

**Still binds:**

- **The raw-byte hash is NOT deleted, it is demoted.** It survives as `docsFingerprint`,
  recorded in fixture provenance and reported when it moves, but **never a
  `FreshnessProblem`** — a commentary change is worth dating, not worth failing.
  `fixtureFreshness` never reads it; its only reader, `fixtureDocsDrift`, returns
  `string | null`.
- **ACCEPTED COST: treat a `typescript` MAJOR bump as a re-stamp event.** The printer's output
  can shift across TypeScript major versions, moving every fingerprint at once on a dependency
  bump — loud, one-time, obviously attributable, remedied by the same re-stamp. This trades a
  rare loud false positive for a frequent quiet one.
- **What holds it honest, and only the pair is meaningful.** `balance-rig.test.ts` pins BOTH
  directions against a synthetic tree (a comment edit does NOT move `rulesFingerprint`; a
  `140000 -> 130000` edit in the same file DOES), plus a guard that a string literal containing
  comment markers is still hashed as code, and two tests that docs drift stays informational.
  Comment-insensitivity alone is satisfied by a hash that ignores everything.
- **Changing the hash ALGORITHM is not a re-measure.** Both fingerprints moved, so the fixture
  was re-extracted from the unchanged baseline of record — no rule changed, no new capstone
  committed. Stated because *"re-stamped without re-measuring"* is exactly the move
  `docs/VERSIONING.md` forbids doing silently.
- **OI-4 — how to quote a battery total in this document.** This entry originally read "1,233
  passing", N2's figure copied forward; `b7b52116`'s own commit message says **1,239** and the
  audit re-measured 1,239 at that HEAD. Root `npm test` is
  `npm run test --workspaces --if-present`, and **exactly four workspaces have a `test`
  script** — desktop 102, engine 725, sim 277, ui 135 at `b7b52116`. `packages/content` has no
  test script at all (only `build`), so a "content 102" arm in any note is `packages/desktop`
  mislabelled. *Post-remediation the battery stands at **1,262 passing / 0 failing** — sim
  **300**; the +23 is the OI-6 / OI-6b / OI-7 rig tests recorded in N7-RIG below.*

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N7-RIG — Two blind spots in the fingerprint, closed by audit (REMEDIATION · 2026-07-29)

**This is not a graded N-series step** — no hypothesis, no sweep, no verdict, no re-pin. It
is remediation of three items (**OI-6**, **OI-6b**, **OI-7**) from the 2026-07-29 doc-vs-code
audit: five verification passes over every step marked SHIPPED, which raised **13 items
(OI-1 … OI-12 plus OI-6b), all closed the same day**. The audit's own working file was never
committed — **this document is the whole record**, and every item is traceable by grepping its
OI-number: `OI-1`/`OI-5` under N1/N2, `OI-2` under N6 and N3, `OI-3` under N7 and standing
amendment 3, `OI-4` under N7-FP, `OI-6`/`OI-6b`/`OI-7` here, `OI-8` under N3, `OI-9` under N2
and THE PARITY LEDGER, `OI-10` in the track preamble, `OI-11` under N6, `OI-12` under N8.
Where an item stayed open by decision it is filed under the step that owns it. **Nothing was
re-stamped and nothing was owed** — both fingerprints unmoved, and the stamped
`docsFingerprint` reproduced exactly against a pristine `git archive HEAD` tree, so the
working-tree drift was 100% attributable to OI-1's comment rewrite in `npc.ts`.

**Still binds** (all in `packages/sim/src/balance/rules-fingerprint.ts`, deliberately without
the line citations the full record carries — they rot):

- **OI-6 — every directory under a hashed root is a decision on record.** The walk read only
  the declared directories, so `packages/engine/src/rules/` would have been invisible to the
  hash **and** to the enumeration tests that exist to make the classification total. The guard
  **fails rather than auto-recursing**, deliberately: auto-recursion would let a whole subtree
  join the fingerprint with nobody having decided it should. It lives in the PRODUCTION MODULE
  rather than a test, and that is load-bearing — `checkpoints.ts` and `smoke-extract.ts` stamp
  fixtures from the command line, and a vitest-only guard cannot reach a CLI stamp.
- **SHARP BUT INTENTIONAL, and a future step will hit this:** an empty, `.d.ts`-only or
  asset-only directory THROWS, and it hard-fails `smoke-extract` at the CLI rather than only in
  a test. Adding e.g. `packages/content/src/data/*.json` will stop a fixture extraction dead
  until someone declares the directory. Conservative-safe and consistent with the module's
  doctrine, but a real cost; the remedy is one line in `HASHED_ROOT_IGNORED_DIRECTORIES` or in
  the declared set.
- **OI-6b — the four symlink rules, settled.** `readdirSync(withFileTypes)` types a symlink by
  ITSELF, not its target, so a symlinked directory slipped both the guard and the walk. Every
  entry is now classified ONCE via `statSync` — which FOLLOWS the link where `lstatSync` would
  not, and that is the entire reason for choosing it. (1) A symlinked *directory* trips the
  guard and escapes it exactly as a real one does. (2) A symlinked `.ts` file is HASHED —
  `readFileSync` follows the link, so it is real rule code deciding real outcomes. (3) The
  repo-relative path IN THIS TREE enters the manifest, not the target's, because a fingerprint
  describes this tree. (4) A dangling or non-regular link fails loudly with a named
  `UNRESOLVABLE SYMLINK` message rather than letting a bare `ENOENT` escape from inside a
  fixture stamp.
- **OI-7 — a file TypeScript cannot parse used to hash silently.** `ts.createSourceFile` does
  not throw on bad syntax: it RECOVERS, and the printer prints the recovered tree
  (`export const A = (` prints as `export const A = ();`). Two different broken states can
  recover to the same tree — **a fingerprint collision between rulesets that are not the same
  ruleset.** `assertParseClean` now fails with the file, line:column and the parser's own
  message before anything is hashed. An assertion rather than a documented mitigation for the
  same reason as OI-6: `tsc -b` runs in the battery, not before `smoke-extract` stamps a
  fixture. **Its own failure mode is covered** — if `parseDiagnostics` ever stops being
  readable (a TypeScript upgrade renaming that `@internal` field) it throws rather than
  silently stopping checking.
- **ONE HOLE OF THE SAME CLASS IS STILL OPEN — recorded, not closed.** The guard catches a new
  *subdirectory* under a hashed root. A whole new hashed **root** — a new package, say
  `packages/economy/src` — is caught by nothing: it would never be walked, and every
  enumeration test would pass while describing a game that had grown a limb. Closing it needs a
  different mechanism (the workspace list is what would have to be totality-checked, not a
  directory listing). **It belongs to whichever step first adds a package** — that step must
  either declare the new root here or record why it holds no rule code.

*Full record — the per-item line citations, the hashed-corpus pin, test counts and fingerprint
values: `git show a9cffd85 -- docs/NPC_REDESIGN.md`.*


### N9 — The instrument has never played three of the eleven actions (SHIPPED 2026-07-28 · `55233e15`)

> **Found by N7, 2026-07-28. Sequenced BEFORE N8** — N-IDs are labels, not an order
> (`docs/VERSIONING.md` §4).

**Result (2026-07-28): HYPOTHESIS REJECTED — but the code SHIPPED and was retained**, which is
the case standing amendment 1's refinement was written for: it moved **7 of 8 policy rows** —
`greedy`, the untouched control, is the eighth and is byte-identical. `packages/sim` emitted
`Crew`, `Port` and `Reroll` **zero** times, so no standing policy's economy had ever included
port income, crew dice or a rerolled hand; all three now fire, priced through engine/content
functions throughout (`planReroll` on the sharpest unspent die below `expectedFreshDieFace`;
`planCaptainOverhead` arbitrating **one** die-costed purchase per day — berth -> crew -> port
— on the dullest remaining die, queued last so income actions are never displaced). The
direction was wrong: fleet final credits **50,448 -> 31,205 (−38.1%)** with Tour One
essentially frozen (≤0.3% on every clear rate) and `encountersPerRun` 24.33 -> 24.37 — **the
extra deaths are a thinner purse, not more fights**. `player.crew.length` was **0 at every
percentile** across 8,000 careers at days 21/29/41; it is now **median 2 / p75 3 at day 41** —
the post-state N13 has to grade a hand-bearing cast against.

**Still binds:**

- **Per-verb attribution, four capstones at 1,000 seeds × 120 days** — N12 reads the port
  figure: **Port only** 39,193cr (**−22.3%**, ships +0.5%), **Crew + berths only** 37,888
  (−24.9%, ships +10.9%), **+ Reroll** a further −0.2%, all three shipped 31,205 (−38.1%,
  ships +13.3%).
- **Why the three verbs are ONE change, and why they had never fired.** `rerollsRemaining` is
  seeded only from `dawnDiceModifiers`, whose only live source is the crew roster; crew is
  gated by `crewCapacity = 1 + floor(cabin.strength/10)`, so the junker berths exactly **one**
  and a full three-role roster needs cabin tier 2. **Nothing could have fired them** — the
  blind spot was structural, not an oversight in any one policy. Their named readers, for the
  steps that follow: **`Crew`** is T-1306's dice-progression source, read by `dice.ts`
  `dawnDiceModifiers`; **`Port`** is T-1307's dusk income, read by `port.ts` `portDuskIncome`.
- **Every balance number in this document was produced by that instrument — but this is not a
  blanket invalidation, and the carve-out is on record.** R2d's port re-pricing measured
  *affordability* against the real field and re-ran its reach probe with appended buy actions,
  **so it is not invalidated**. What IS scoped by the blind spot are the numbers the aggregate
  produced: the fleet's income ceiling, its dice distribution and its clear-day medians were
  all measured on a strictly narrower game than the one that ships.

- **THE FINDING THAT OUTRANKS THE VERDICT — the instrument measures CASH, not NET WORTH.**
  `finalCredits` cannot see an asset. The trader's ~13,500cr of port spend is still on its
  balance sheet yielding 65–290/dusk in perpetuity, and the aggregate scores it as a 100% loss.
  So *"the fleet got poorer"* is unambiguously true only of the **crew** arm (wages, ~15,100
  out and ~1,500 back — a genuine operating loss); the **port** arm is balance-sheet conversion
  the instrument structurally cannot read. **`sampleMilestone` records `crew` but not `ports`,
  so port ownership is invisible to every aggregate this project produces.** Same class as R0a
  and R2a. **This must be fixed before N8 re-pins** — the milestone half is now N12's first
  task, the net-worth question stays with N8.
- **The marker HOLD, not a hard block — a judgment call made, reversed, and documented at the
  site.** The overhead first shipped *without* a marker gate, on the argument that crew is a
  throughput purchase. A full capstone refuted it — trader clear 0.916 -> 0.759 and clear day
  21 -> 25, smuggler 0.535 -> 0.210 and day 30 -> 44, fleet ships 571 -> 816 — and the premise
  failed on its own terms: a trader's day is a two-run plan capped at five dice, so the sixth
  die a First Officer grants buys no extra contract. It was restored as a **hold**
  (`spendable` subtracts the outstanding marker) rather than a hard block, **because a hard
  block silences all three verbs for the explorer (clears 0.00) and veteran (0.001) *forever*,
  re-creating the very blind spot this step removes.**
- **Reading `greedy` as a control.** It is untouched here and its row is byte-identical — but
  *the differ reports `greedy` under MOVED when the arm carries `--milestone-days`*, because
  the added `milestones[…]` paths are a shape change. Strip that key and the values are equal.
  **Check the shape/value split before reading a control as broken.**
- **The reroll is arithmetically marginal, not badly played.** Played strictly +EV it can only
  fire when the *sharpest* die is already below the fresh expectation, and
  `P(max of 5d20 < 11) = 0.5⁵ ≈ 3.1%` — verified independently. A career sees ~1.2 charges
  worth ~2 pips: −0.2% credits, +1.7% ships, both inside noise. **The verb is now exercised; it
  is not a lever.** Zero crew walkouts in 280 careers.
- **Out of scope, reported not fixed.** (1) N7's fingerprint over-sensitivity cost **three
  re-runs in one step** here, which is the evidence N7-FP was granted on; closed by N7-FP.
  (2) **The extra-die crew role is near-worthless to trader-shaped policies by construction**:
  their day is a fixed two-run plan capped at five dice, so a sixth die has no queued use. If
  the First Officer is meant to be the strongest hire, something needs a use for the die.
  (3) **Ports are unreachable for two archetypes structurally** — under the marker hold the
  explorer (clears 0.00) and veteran (0.001) never accumulate surplus above debt, so any
  fleet-wide port-ownership criterion is measured on five policies, not seven.
- **Provenance pointers.** Baseline re-pinned to `docs/balance/baseline-n9-shipped.json` (the
  refinement in standing amendment 1); `campaign-degraded` fingerprints re-pinned deliberately
  with **logged entry #5** (trader `467a83d4->2e4f1623`, fighter `b6ef1dc0->620348f8`, explorer
  `90d35d3c->6f4d8c17`, smuggler `b480fc6f->49d98c00`, gambler `de62c310->29fc3a0c`), **greedy
  and veteran unchanged**. `rulesFingerprint` unchanged at `76ac9179…` — the proof no
  engine/content rule moved — while `instrumentFingerprint` moved `34453d51…->37f920ed…` and
  the smoke fixture was re-extracted. **The `balance-targets` tripwire did NOT fire:** trader
  clear day 21 -> 21 at 1,000 seeds, so it still fails its assertion and still passes as
  `it.fails`.
- **Corroborating measurement still cited elsewhere:** at day 41 across 8,000 careers
  `playerShipRating` median AND p75 are both **1** (≥75% of careers never buy a combat
  component) and `playerCargoPods` runs **min 10 / max 11** against a starting 10 — cargo pods
  are effectively never bought, which is why R10 stayed invisible for the whole project.

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N8 — Re-pin the baseline against a living field

- Everything above changes the world the player trades in — captains claiming contracts,
  buying ships, dying. **Every balance number in this document moves.** Re-pin at 1,000
  seeds (the R0b standing amendment) and re-read the R-series conclusions against it,
  especially R2.5, whose escalation ladder was designed against a field that took no risk.
- **FIRST TASK — teach the aggregate to see an asset, before re-pinning anything.** N9
  found that `sampleMilestone` records `crew` but not `ports`, so **port ownership is
  invisible to every aggregate this project produces** and `finalCredits` scores a bought
  port as a 100% loss. The policies now buy ports (N9), so re-pinning first would bake a
  blind spot on a live asset class into the yardstick every R-series conclusion is
  re-read against. Same class as R0a and R2a, and both of those had to precede the work
  they graded. A `ports: state.player.ports.length` on the milestone is the minimum;
  consider whether the fleet needs a net-worth figure alongside the cash one, since
  **"the fleet got poorer" is currently unfalsifiable for any purchase of an asset.**
  *2026-07-29: the milestone half of this task is pulled forward into N12's first task
  (the cast starts buying ports there and the sweep must see it); the net-worth question
  stays here.*
- **SECOND PRECONDITION — N10, N11 and N12 land first (owner ruling 2026-07-29, THE
  PARITY LEDGER).** A "living field" whose captains cannot work the contract board, hold
  a rank, or own a port is not the field the player actually ships against. Re-pinning
  before those verbs exist would bake three known absences into the yardstick every
  R-series conclusion is re-read against — the same class of mistake this step's first
  task exists to prevent. Rule on the ledger's three UNRULED verbs (Explore,
  VisitHangout, Storylet) before pinning, so every exclusion is a decision on record.
- **The post-N9 re-pin is DONE** — `baseline-n9-shipped.json`, taken fresh at HEAD. N8
  re-pins again on top of the living field; it no longer has to unpick N9.
  *(2026-07-29, doc audit item **OI-12**: this bullet named `baseline-n9-shipped.json` as
  the baseline OF RECORD, which was true when it was written and is now stale by two
  re-pins — N2 and then R2c-follow-up. The current baseline of record is
  `docs/balance/baseline-r2c-explorer-remit.json`, which is what **standing amendment 1**
  names and what `packages/sim/src/__tests__/balance-targets.test.ts:103` reads at runtime.
  **The amendment is authoritative; read it before diffing anything.** The N9 re-pin itself
  genuinely happened and its rule refinement is the reason amendment 1 reads the way it
  does, so it is left on the record here rather than overwritten.)*

---

## The sweep command and the standing discipline (moved with the track, 2026-07-29)

**The sweep command.** 1,000 seeds since R0b — see that step (in the worklist) for why 100 cannot grade this.
Eight shards run in ~2.5 min on a 10-core box; the fleet now includes `trader-degraded` as a
second lens (a fix should hold up for the sloppy pilot too).

```sh
# ×8, one per shard
npm run balance:sweep -w @spacerquest/sim -- --label <label> --seeds 1000 --days 120 \
  --milestone-days 21,29,30,41,60,120 \
  --policies trader,trader-degraded,fighter,explorer,veteran,smuggler,gambler,greedy --shard i/8
npm run balance:sweep -w @spacerquest/sim -- --label <label> --merge

# THEN re-extract the smoke fixture FROM THE CAPSTONE YOU JUST WROTE — not bare.
npm run balance:extract -w @spacerquest/sim -- --aggregate docs/balance/baseline-<label>.json
```

> **BOTH FLAGS ARE LOAD-BEARING, and this block omitted both until 2026-07-29.**
> Copy-pasting the old version cost a re-run in the R2c-follow-up step, twice:
> - **No `--milestone-days`** and the capstone carries no milestone samples, so it is
>   ~7,400 fields SHORT of its predecessor. `balance:diff` reports those as removed
>   paths, which is easy to mistake for diff noise and filter away — that is exactly
>   how it got missed the first time.
> - **A bare `balance:extract`** defaults to `--aggregate docs/balance/baseline-n1.json`,
>   which has no milestones — so it silently rewrites the fixture with
>   `spreadSource: "estimated"` and downgrades a `"harvested"` one. The extractor
>   prints which it did (`spreads harvested` vs `spreads estimated`); read that line.
>   The fixture's own `provenance.spreadSource` is the durable record.

## Sequencing at a glance

```
DONE: R1 ──► R0a ──► R0b ──► R2 ──► R2c ──► R2d ──► N0

NPC PARITY TRACK (in progress — the R-series is PAUSED behind it, see below):
  N0 (copy-on-write) ......................... DONE
   └─► N1 (NPCs own a real ship) ............. DONE  (change accepted, hypothesis disproved)
        ├─► N7 (capstone diff + smoke rig) ... DONE  (accepted; 1.5 s smoke, 2 min capstone)
        │    └─► N9 (the instrument's three unplayed actions) ... DONE  (rejected; found the cash-vs-net-worth gap)
        ├─► N6 (Honor List, 31-way board) ... DONE  (accepted; 6/8 titles frozen until N2)
        └─► N2 (NPCs upgrade + shipyard actor param + ramp re-seed) ... DONE  (accepted)
             └─► N3 (NPCs meet pirates + answer them) ... DONE  (accepted on behaviour;
                  |                                        capstone shared with N4)
                  └─► N4 (archetypes) .......................... DONE  (accepted)
                       └─► N10 (NPCs work the contract board) ... DONE  (change accepted,
                            |                                     hypothesis disproved — the
                            |                                     board is not where the
                            |                                     non-trader floor gets fixed)
                            └─► N11 (NPCs earn deeds + Renown) .. MUST-HAVE ◄── NEXT
                                 └─► N12 (NPCs buy ports; the aggregate
                                      learns to see assets FIRST) MUST-HAVE, before N8
                                      └─► N13 (NPC decision surface:
                                           dawn-hand parity) .... MUST-HAVE, gates N5
                                           └─► N5 (proficiency spread)
                                                └─► N8 (re-pin against a living field)
                                                     ▲ N9 MUST LAND FIRST — see below
                                                     ▲ N10–N12 + the ledger's UNRULED
                                                       verbs MUST BE SETTLED FIRST
                                                       (owner 2026-07-29)

WHY N4 SITS BEFORE N10 (owner ruling 2026-07-29, and it is load-bearing rather than
tidy): N10's archetype-driven `pickContract` reads `profile.archetype`, so the field
has to exist — and be measurably distinct — before the board step can key off it. N4
also had to precede the shared N3+N4 capstone, since both move the same hashed rule
sources.

WHY N9 GATES N8: N8 re-pins the baseline that every R-series conclusion gets re-read
against. The instrument that would produce it has never emitted Crew, Port or Reroll
(N7's finding), so re-pinning first would bake a known blind spot into the yardstick.
Same class as R0a/R2a, and both of those had to precede the steps they graded.

WHY N7 MOVED (owner decision 2026-07-28): the doc originally ran it after N4/N5. Every
step from N2 on is graded by diffing a sweep, and at full NPC fidelity that capstone is
projected at ~80 min — unusable as an iteration loop. N7's fingerprinted smoke fixtures
turn it into a seconds-long check, so building it SECOND gives N2–N6 a real fast gate
instead of grading them on faith. N1 first regardless: N7's checkpoints need a world
with ships in it to harvest from.

THEN the R-series resumes, re-read against N8's baseline:
  R2.5 (escalation ladder + demand menu) ──► R4 (predation) ──► R5b (smuggler tariff)

WHY THE PAUSE: R2.5's ladder was designed against a field that takes no risk and never
upgrades. Landing it before N8 would tune the player's world against captains who are
not in it.
R3 (explorer)  — CLOSED 2026-07-29 by the R2c-follow-up (clear rate 0.00 -> 0.777)
R6 (instrument) — any time, goldens-identical
R5a (fighter deeds) — after R2 lands
R7 — ABSORBED into R2.5.  R8/R9 — opportunistic
```

One change per step. One sweep per change. Re-pin the baseline only on an accepted
hypothesis, and append the result under the step before moving on.

**Two standing amendments from the R1/bake-off work (2026-07-28) — since grown to four — binding on
every step in this document and, on resumption, every R step in `BALANCE-REDESIGN-WORKLIST.md`:**

1. **Grade at 1,000 seeds × 120 days, not 100 — DONE (R0b).** The 100-seed arm cannot resolve
   the clear-day target to the ±1 day the [22, 30] band is graded at, and its "0 ships / 0
   cargo" headline was a sampling artifact (19 ships and 17 routes at n=1,000). **Corollary
   for every future step: never report a rate as 0.00 off a small arm — report `< 1/n`, or
   re-run bigger.**
   > **Baseline of record is `docs/balance/baseline-n10-shipped.json`** (1,000 seeds ×
   > 120 days × 8 policies = 8,000 runs, re-pinned at N10 2026-07-29).
   > `baseline-n4-shipped`, `baseline-r2c-explorer-remit`, `baseline-n2-final`,
   > `baseline-n9-shipped`, `baseline-r2c-final` and `baseline-vet-1k*` are its
   > predecessors.
   > **`baseline-n4-control.json` sits beside it and is NOT a baseline** — it is N4's
   > control arm (the same capstone with every archetype multiplier set to 1), kept as
   > that step's grading evidence. Presence in `docs/balance/` never makes a file the
   > baseline of record; this pointer and `balance-targets.test.ts`'s path do.
   > **It is also read at runtime by `balance-targets.test.ts`'s band block**, so re-pinning
   > means updating that path in the same commit. **Update this pointer in the same commit that re-pins the baseline** —
   > a stale yardstick silently mis-grades every step that diffs against it.
   >
   > **RULE REFINED 2026-07-28 — re-pin on SHIPPED CODE, not on an accepted hypothesis.**
   > The old wording ("re-pin the baseline only on an accepted hypothesis") was written for
   > R1 and R2's lever, which were **measure-only or never shipped** — for those, re-pinning
   > nothing is right. **N9 is the case it did not anticipate: hypothesis REJECTED, code
   > SHIPPED and retained**, moving 7 of 8 policy rows. Under the old wording the baseline
   > stayed at `r2c-final`, which no longer described HEAD, and N2's differ would have shown
   > N9's deltas tangled with N2's own. **The test is "does the baseline describe HEAD?",
   > not "did we like the answer?"** A verdict is a judgement about a hypothesis; a baseline
   > is a description of the tree.
   >
   > *Provenance:* `baseline-n9-shipped.json` was taken fresh at HEAD and diffed against
   > N9's own shipped arm — **"NO MEASURED VALUE MOVED"**, an independent reproduction of
   > N9's figures from a clean run rather than a copied artefact.
2. **A rejected hypothesis is a result.** R1's was rejected and produced the re-scope that
   this document now runs on. Record outcomes under the step, including the ones that say
   "the premise was wrong". **Two of the four graded steps so far were disproved** (R1, R2's
   lever) and a third was accepted-with-hypothesis-disproved (N1); that ratio is the method
   working, not a problem to fix.
3. **Re-extract the smoke fixture ONCE, at the end of a step** (owner decision 2026-07-28).
   N7's `rulesFingerprint` hashes raw file bytes, so a comment or a `prettier --write`
   stales the fixture — and Part B rule 3 *requires* commenting at definition sites, so this
   fires constantly. N9 paid it **three times in one step**. The mechanism is correct and
   deliberately not being "optimised": stripping comments needs a parser, and a parser that
   mis-parses fails **silently**, in the one direction the whole design exists to prevent.
   So the fix is procedural — finish the code, *then* re-extract. A capstone is 1m46s, not
   the 80 minutes that motivated the rig, so the tax is small if it is paid once.
   *If it still hurts after N2, the option with real data behind it is hashing the
   TypeScript **emit** rather than source bytes — `tsc` re-prints from the AST, so comments
   and formatting normalise away while real code changes still move the hash, and it is the
   same compiler that builds the product rather than a bespoke parser.*
   > **THE MECHANISM ABOVE IS SUPERSEDED BY N7-FP (2026-07-29 · `b7b52116`) — and this
   > amendment predicted its own supersession.** *Flagged by the 2026-07-29 doc audit as
   > item **OI-3**; annotated rather than rewritten, because the cost it records is the
   > evidence that motivated the change.*
   >
   > **The procedural rule stands, unchanged: re-extract ONCE, at the end of a step.** What
   > no longer describes HEAD is its premise. `rulesFingerprint` does not hash raw file
   > bytes any more — the raw-byte hash was **demoted to `docsFingerprint`**, which is
   > informational only and cannot fail a test (`fixtureFreshness` never reads it; its one
   > reader, `fixtureDocsDrift`, returns `string | null` and is explicitly not a
   > `FreshnessProblem`). So a comment or a `prettier --write` no longer stales the fixture
   > at all, and the tax N9 paid three times in one step is gone. The closing paragraph
   > directly above is what shipped: *"hashing the TypeScript **emit** rather than source
   > bytes"* is precisely option C of N7-FP, using the same compiler that builds the
   > product rather than a bespoke parser.
   >
   > Its stated risk — "a parser that mis-parses fails **silently**" — was real, and N7-FP
   > did **not** discharge it: `ts.createSourceFile` recovers from broken syntax and prints
   > the recovered tree without complaint. The audit filed that as **OI-7** and it is now
   > closed by a hard `parseDiagnostics` assertion ahead of the hash. See the **N7-RIG**
   > entry (immediately after N7-FP) for OI-7 and for OI-6/OI-6b.
4. **Close the loop on the step before starting the next one** (added 2026-07-28, after
   this was caught drifting). Landing a step means all four of: the heading carries
   `(SHIPPED <date> · <sha>)`, a `**Result:**` block is appended under it, the sequencing
   diagram above reflects reality, and **anything learned that changes DIRECTION is written
   into the step it affects** — not just recorded under the step that found it. N1 found the
   shipyard API blocks N2 and that NPCs fly on ~4× a player's fuel; both belong in N2's
   entry, and are there.

---

## After N8 — the seam back to the R-series

N8's re-pin ends this track. The R-series in `BALANCE-REDESIGN-WORKLIST.md` then
resumes, re-read against N8's living-field baseline: R2.5 ─► R4 ─► R5b (that
document's "Sequencing at a glance" carries the R-side resumption order). Two things
it owns that this track must not forget:

- **The two known-red `it.fails` tripwires** (`balance-targets`' clear-day band, owned
  by R2.5; `balance-combat-survival`'s Auto-Repair threshold, owned by R2c) live
  there. Flip a tripwire back to `it` only in the commit that fixes its defect.
- **R10 (the 25-credit tier-1 hull cliff)** is R-owned but confounds this track's
  sweeps — it is the root cause of the top-of-field convergence in N2's Result, and it
  shapes every NPC refit outcome until it is fixed.
