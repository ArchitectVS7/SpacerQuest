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
"Still binds" blocks: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`.

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
| N3 — NPCs meet pirates | **SHIPPED 2026-07-29 (rebuilt)** | encounters on every NPC jump, stance triangle on the shared rules, permanent death, four dead-field skips; **capstone discharged at N4** (the two steps share one capstone — see N4's Result) |
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
> 1,287/0 and left at 1,312/0. N4 entered at **1,184 / 23 failing**; what those 23
> were and why each moved is under N4's Result, and the 18 N10 inherited are under
> N10's. One `it.fails` tripwire was filed at N4, with its evidence — see that
> Result; it is still correctly red at N10's widened sample.
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

**Result (2026-07-29): ACCEPTED on behaviour, CAPSTONE OWED.** Rebuilt from the
ground up after the audit below found the step marked SHIPPED with none of its core
change built. What landed:

- **FIRST TASK discharged.** The copy-on-write scan is widened by SHAPE, not by
  another name: provenance-based tainting (any handle bound from a `.npcs` read,
  propagated through re-bindings and alias casts, untainted only by a real copy),
  scanning all of engine AND sim. A sibling test drives the same scan over each of
  its three historical blind spots. The two legitimate raw writers now carry
  argued `COW-EXEMPT:` markers, block-scoped, with the set pinned in the test.
  Verified by injecting `captain.profileId = 'tampered'` into `day.ts` and watching
  the guard name the file and line. *This landed BEFORE the death write, which is
  the whole reason it was folded in here.*
- **Encounters on every NPC jump** — `executeTravel` and `executeTrade` both roll,
  through `routeDangerFor`, the extracted content-only core of the player's
  `calculateRouteDanger`. **Including the loaded-run bump**: a captain hauling INTO
  the delivery port raises the lane a full danger level, the player's own rule.
- **The stance triangle, on the shared rules.** `resolveNpcEncounter` runs
  talk/run/fight against `10 + tier`, `tributeForRound` (class and tier-gap
  modifiers included), `interceptorRefusesTribute` (so a Bloodthirsty pirate slams
  the tribute door on a captain as it does on the player), `weaponVolleyDamage`,
  `RUN_FUEL_COST`/`FIGHT_FUEL_COST`, `COMBAT_SALVAGE_PER_TIER`, and the opposed
  PILOT retreat with `RETREAT_KILL_EDGE`.
- **The rules moved to a module neither side owns.** `applyInterceptorHit`,
  `interceptorPressureDc`, `damageComponentForHit`, `tributeForRound` and
  `interceptorRefusesTribute` now live in `combatRules.ts` and are called by BOTH
  the player's `applyEnemyPressure` and the cast's interdiction — one definition of
  the damage rule, not two. The extraction was verified behaviour-preserving: the
  engine suite stayed at 726/726 with **every golden hash unmoved** before any NPC
  encounter was wired in.
- **Permanent death.** `NpcState.dead` (optional, so no migration is owed — absent
  means alive), `NpcShipLost`, no succession. **Plus the four skips that marking a
  record dead makes mandatory**, each of which would otherwise have been a live bug:
  `honorField` (the OI-2 seam, closed), the interceptor pool, the dusk turn loop,
  and Hangout presence. A fifth decision recorded rather than drifted into: **a
  dead captain's disposition STOPS MOVING** rather than decaying to neutral, because
  the grudge is part of what the record is for.
- **The wire narrates it.** Interdiction rolls carry their own
  `npc-encounter-{fight,run,talk}` contexts so a nat-20 still makes the wire (PRD
  §6's guarantee holds for the cast), routed per stance to the combat / travel /
  haggle buckets. Split from the `npc-*` VERB contexts deliberately: the T-1201
  verb ⟺ StatCheck invariant now counts checks carrying the verb's OWN context, so
  an interdiction cannot inflate the sim's trade-failure denominator.

**MEASURED (3 seeds × 200 days, engine-level probe):** ~700 interdictions and 1–4
permanent deaths per 200 days; the living field ends at 26–29 of 30. Tribute is
**5–7% of gross field wealth** — a real cost, not an economy-breaker. **The
Disproves does not fire: the roster does not empty out.**

> [!IMPORTANT]
> **WHAT N3 FOUND AND HANDED TO N4 — DISCHARGED, AND RE-MEASURED** (standing
> amendment 4). N3 measured interdictions distributed by archetype as **trader 465,
> explorer ~110, gambler ~60, smuggler ~20, fighter 32** and diagnosed the cause
> correctly: it was not N3 but N4's deterministic `pickIntent`, under which a fighter
> returned Combat or Patrol and therefore **never jumped**. Risk exposure was
> allocated by a bug.
>
> **RE-MEASURED under the blend** (10 seeds × 200 days, engine-level probe, the same
> shape of probe N3 used), as interdictions per captain per run so the numbers survive
> the roster re-curation:
>
> | | trader | smuggler | explorer | veteran | gambler | fighter |
> | --- | --- | --- | --- | --- | --- | --- |
> | members | 6 | 4 | 5 | 5 | 4 | 6 |
> | interdictions / captain / run | 43.5 | 29.8 | 26.2 | 21.6 | 18.5 | **6.4** |
>
> **The bug is gone: no archetype is at zero, and every captain now has a positive
> Travel share** (lowest 5.6%, Iron Vex — pinned by a test). The trader share of all
> interdictions falls from ~68% to ~36%, and fighters go from *structurally
> unreachable* to 6.4 per captain per run.
>
> **The remaining 6.8× trader-to-fighter gap is CORRECT and is not the same finding.**
> A captain who spends the day patrolling their own lanes should not meet the risk of
> one hauling cargo across the map — unequal exposure is the archetype working. What
> *is* still open is the sharper thing N4 found underneath it: a fighter's chosen
> Combat day cannot kill them at all, because `executeCombat` is still the pre-N3
> abstract GUNS check paying a flat `150 × tier` with no interceptor, no damage and no
> ship loss. **N3 wired the shared rules into the two verbs that TRAVEL (`executeTravel`
> and `executeTrade`) and left the cast's own Combat verb an abstraction** — so the six
> fighters absorb 6.4 interdictions each and take **0 deaths**, while five explorers
> take 0.2 each. That is a real parity gap in the PARITY LEDGER's Combat row, it is
> N3-shaped rather than N4-shaped, and it is recorded there.

> [!NOTE]
> **CAPSTONE DISCHARGED AT N4 (2026-07-29), and the two steps deliberately share
> one.** N3 and the reopened N4 both moved the same hashed rule sources, so a
> capstone taken between them would have measured a ruleset about to change. The
> combined capstone is `docs/balance/baseline-n4-shipped.json`; because N3 never
> pinned one of its own, **the diff from `baseline-r2c-explorer-remit.json` carries
> N3's and N4's deltas tangled together and there is no honest way to separate them
> after the fact** — that is the cost of shipping N3 without its capstone, recorded
> rather than papered over. N4's own effect IS separable, through its control arm;
> see N4's Result. Both root causes below were cleared there. **N3's rate numbers
> were re-measured under the blend, as this step required — the new table is in the
> IMPORTANT block above, updated in place.**
>
> The two root causes as N3 recorded them, kept for the diagnosis:
> 1. **Stale fixture** (8 of them, `balance-smoke` + `balance-rig`) — the N7
>    staleness gate firing exactly as designed. The fix is a new capstone.
> 2. **Shared-RNG stream shift** (the rest) — the roster split shuffles 41 records
>    where it used to shuffle 30, so every seeded player career diverges. The
>    visible symptom is `balance-combat-survival`'s live band: the player death
>    rate reads 0.28 per 1,000 sim days against a guarded floor of 0.8. These are
>    LIVE BANDS, not fixtures ("bands with visible headroom, never pinned digits"),
>    so they are a real signal about a shifted sample and must be re-measured, not
>    re-pinned. **Do not edit a band to make it pass** (docs/VERSIONING.md).
>
> One genuine defect was found and fixed on the way: `balance-rig.test.ts` learned
> the roster size by calling `synthesizeTierState` with a hardcoded 30 — but that
> function VALIDATES the spread against the roster before returning, so the
> discovery call became a throw the moment the roster hit 41, taking the whole file
> (52 tests) down. It now reads `createInitialState(1).npcs.length`.

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
multiplicative design leaves a real control arm. Rebuilt against the two owner
rulings below after the audit found the field machine-generated and the selection
logic collapsed to a constant per archetype.

**THE CONTROL ARM IS THE HEADLINE, because it is what the deterministic switch
destroyed.** Two full capstones, 1,000 seeds × 120 days × 8 policies each, identical
in every respect except `ARCHETYPE_INTENT_MULTIPLIERS`: the shipped table, against
`NEUTRAL_INTENT_MULTIPLIERS` (every archetype scaled by 1, i.e. captains driven by
`ideal` alone). `docs/balance/baseline-n4-shipped.json` is the **baseline of record**;
`docs/balance/baseline-n4-control.json` is the control, committed as this step's
grading evidence and **not** a baseline — the three things that define the baseline of
record are standing amendment 1's pointer, `balance-targets.test.ts`'s path, and this
sentence, never mere presence in `docs/balance/`.

Archetype's attributable effect on the CAST (10 seeds × 200 days, medians over the
simulated field; control → shipped):

| archetype | n | interdictions/captain/run | median credits | median hull |
| --- | --- | --- | --- | --- |
| trader | 6 | 39.5 → **43.5** | 596,006 → **851,930** (+43%) | 90 → 90 |
| smuggler | 4 | 31.1 → **29.8** | 394,909 → **413,723** (+5%) | 90 → 90 |
| veteran | 5 | 15.8 → **21.6** | 158,465 → **206,987** (+31%) | 90 → 90 |
| gambler | 4 | 21.3 → **18.5** | 208,472 → **129,544** (−38%) | 90 → 90 |
| explorer | 5 | 30.9 → **26.2** | 27,873 → **206** (−99%) | 90 → **80** |
| fighter | 6 | 8.8 → **6.4** | 592 → **170** (−71%) | 70 → **50** |

Every archetype moves in its own direction and none is noise: **the Disproves —
*"archetype makes no measurable difference"* — does not fire.** Note the control arm
already separates the six groups (they were curated to correlate with `ideal`), which
is exactly why the arm was needed: without it, "archetype works" and "the ideals
underneath it work" are the same measurement.

**Proves limb 2 holds** — the Honor List shows different captains topping different
titles: **8 of 8 titles contested** on every seed, **8.8 distinct holders** across the
8 titles (5 seeds × 120 days), and Best All-Around is topped by a wholly different set
(Dust Devil / Junk Lord / Nebula Rose / Rogue Star) than the component titles (Admiral
Stern / Black Tide / Cargo King). N2's 8-of-8 hand-off is preserved, not spent.

**The PLAYER's game barely moves, which is the correct result for an NPC-side
personality change.** Control → shipped, at 1,000 seeds: fleet Tour One clear
0.5145 → 0.5199, fleet final credits median 30,533 → 30,425 (−0.4%), encounters/run
23.93 → 24.01, deaths/1,000 days 0.6573 → 0.6448. Against the *previous* baseline of
record (`baseline-r2c-explorer-remit`, so N3+N4 tangled): clear 0.5116 → 0.5199,
credits median 29,604 → 30,425 (+2.8%), deaths/1,000 0.6323 → 0.6448 (+2.0%). No
policy's clear rate moves more than a few points; the yardstick is intact.

**Still binds:**

- **THE FINDING THAT OUTRANKS THE VERDICT — ONLY TRADE PAYS, so specialising away
  from it is a wealth penalty rather than a different strategy.** Look at the table
  again: the two archetypes that specialise *out* of Trade end at **206 and 170
  credits median** — twelve of the thirty captains are destitute — and they are the two
  whose median HULL also falls (90→80, 70→50), because a captain with no purse buys no
  ship. The cause is the NPC verb payout table, not the blend: `executeTravel` pays
  **nothing** (it is pure fuel cost), `executePatrol` pays 40, `executeCombat` pays a
  flat `150 × tier`, and `executeTrade` pays a real contract. So an archetype is
  currently a choice about *how poor to be*. **This is the same shape as N9's finding
  that the player's combat pays nothing** — R2c fixed the player side by giving a
  destroyed interceptor salvage, and the cast never got the equivalent. It is
  deliberately NOT tuned here (one change per step, and re-pricing a verb is a design
  call), and it is the direct reason the next three steps matter: **N10** gives the
  non-traders a real board to work, **N11** gives fighters and veterans a deed economy,
  **N12** gives everyone an asset that is not cash. If those three do not close it, the
  fighter's `150 × tier` is the first knob and it belongs to the owner.
- **The wealth-spread ceiling is intact but its headroom has thinned, and N8 owns
  the call.** `campaign.test.ts`'s 25× top/median ceiling is **unmoved**; re-measured
  over the simulated living field, seeds 1..10 give 10.29 · 15.51 · 9.05 · 13.24 ·
  11.92 · 17.30 · 20.09 · 9.54 · 9.87 · 10.00 — worst 20.09, so 25 now sits 24% above
  the worst observed where N2 chose it for ~56%. It is a PASS and it is not raised;
  the direction is the finding above arriving in a second instrument.
- **TWO LIVE INSTRUMENT BUGS FOUND AND FIXED, both the same class as N9's "the
  aggregate cannot see an asset", and both had to close BEFORE this step's own
  capstone could mean anything.**
  1. **`sampleMilestone` sampled all 41 records, so every NPC wealth, hull and
     position percentile this project has produced since N3's roster split was
     diluted by eleven captains frozen at day 1.** They cluster mid-distribution, so
     they did not merely add noise — they *set the median*: at seed 1 / day 200 the
     41-record median reads **5,000cr** against the simulated field's **167,421**, and
     `campaign.test.ts` therefore graded a **344×** wealth spread where the field's is
     **10.3×**. It passed before N4 only because the pre-blend field was poor enough
     for 5,000 to look like a plausible median — i.e. it was already measuring the
     wrong thing and getting away with it. Fixed at the source (`sampleField`).
  2. **The same conflation at a fourth site**, `balance-rig.test.ts`'s milestone
     field-size assertion, which read the record count. It now pins
     `NPC_PROFILES.length` *and* asserts it is strictly less than `state.npcs.length`,
     so a future re-conflation goes red.
  **The fix is the SHAPE, not the instance** — N3's lesson about the copy-on-write
  scan, applied to this: one exported `isSimulatedCaptain` predicate in
  `content/cast.ts` replaces four local spellings (`day.ts`'s dusk loop, `format.ts`'s
  `honorField`, `sampleMilestone`, `campaign.test.ts`), and its definition site
  carries the tally of what conflating the three numbers has already cost. Read
  `NPC_PROFILES.length` for the field (30), `state.npcs.length` for the records (41),
  31 for the board.
- **THE STAT-AFFINITY TERM IS GONE FROM `pickIntent`, and that is a deliberate
  divergence from the pre-N4 formula — measured, not assumed.** Pre-N4 the weight was
  `IDEAL_WEIGHTS × (1 + the verb's affinity stat)`; the blend replaces that second
  factor with the archetype multiplier rather than stacking on top of it. Measured
  over the curated roster, keeping the stat term concentrates the average captain onto
  **3.1** verbs at ≥5% against **4.3** without it, and takes a TRADE-5 trader to 89%
  Trade with **one** live verb — i.e. it re-creates the "ten traders are the same
  function" collapse this step exists to undo, by a subtler route. It also contradicts
  the arithmetic RULING 1 recorded. `INTENT_STAT_AFFINITY` keeps its other and more
  honest reader: which stat ROLLS the day's check, so a captain's stats decide how
  WELL the day goes rather than how often they choose it.
- **THE RULING'S OWN WORKED EXAMPLES REPRODUCE EXACTLY, and one of its three has an
  arithmetic slip worth knowing about.** Cargo King draws Trade 12/16 = **75%**,
  Travel **13%**; Zero Risk Trade 8/13 = **62%**, Patrol **15%** — both exactly as
  recorded, and both pinned by tests. Iron Vex's row divides by 17 where the weights
  sum to 18, so the ruling's *"Combat ~59%, Patrol ~35%"* is really **56% / 33%**. The
  design is unaffected; it is flagged so a reader does not "fix" the code to match the
  prose. The two multiplier rows the ruling worked out by hand (trader, fighter) are
  reproduced in the table verbatim rather than re-derived.
- **The poverty override is a MULTIPLIER (×3), never the old flat `+10`** — and this
  is a rule-exemption question, not a tuning one. `0 + 10` hands The Warden (`Justice`,
  Trade weight an authored **0**) the one verb his worldview forbids the moment his
  purse dips: a rule exemption bought with a constant, which is what standing-constraint
  consequence 2 names. The scale was also wrong by an order of magnitude — pre-N4
  weights carried the stat term and ran to ~70, where the blend's top out near 12. ×3
  lands a broke fighter near the behaviour it replaces (Iron Vex ~15% Trade against
  pre-N4's ~22%) and leaves a broke trader effectively committed (~90%). It is a
  legitimate knob for a later sweep, **but it must stay a multiplier.**
- **THE 23 RED TESTS THIS STEP INHERITED, and what each one actually was.** The
  battery entered at 1,184 passing / 23 failing and leaves at **1,287 / 0**. Grouped
  by what was really wrong, because "the rng stream moved" was the proximate cause of
  all of them and the *right response differed*:
  - **8 stale-fixture (`balance-smoke` + `balance-rig`)** — the N7 gate firing as
    designed. Cleared by the capstone, never by a refreshed number.
  - **7 `campaign-degraded` policy fingerprints + 1 poverty-trap** — re-pinned with
    **logged entry 8**, which names N3 *and* N4 together because **N3 shipped without
    re-pinning this table**, so no intermediate column was ever measured. `greedy`
    moved for the third consecutive NPC-side step; entry 6 already explains why that is
    expected and not a leak.
  - **3 `protocol` replay goldens** — regenerated via `fixtures/gen-golden.ts`.
  - **4 single-seed "first qualifier" hunts** (`campaign-reach` ×3,
    `campaign-policies`' fighter) — re-swept and re-pinned in each test's own
    documented protocol, driving **the exact committed test** through a temporary
    env-var seed override so the swept code is the shipped code. Every one came back
    *more* reachable, not less: port 2→3 of 20, bond 7-of-45→8-of-30, fighter kit
    5→8 of 20, fuel-starvation 8 of 10 unchanged.
  - **1 `era-storylet-coverage`** — re-swept 1..40, pinned [4, 22], both individually
    total on both unions.
  - **1 `alliance-arcs` organic-reputation** — **converted to a sweep property
    instead of re-pinned.** It had been re-pinned *five* times (3→6→2→3→1) by five
    different upstream changes with one cause, and its own comment called it the most
    seed-sensitive assertion in the file; a sixth lucky seed guarantees a seventh
    re-pin. Now every seed of 1..20 must move reputation (20/20 measured) and ≥5 of 20
    must fire an organic mover (10/20 measured) — both halves *stronger* than any
    single seed, and 1.9s for all twenty. The precedent is this repo's own route-churn
    test: *"Rather than re-pick a lucky seed, this asserts the property over a seed
    sweep."*
  - **1 `campaign.test` wealth spread** — the instrument bug above, not a re-pin.
  - **2 `balance-combat-survival`** — the one genuinely unresolved item; see below.
- **ONE NEW `it.fails` TRIPWIRE, and it is the third the battery carries — which the
  track's preamble says should make it N4's. It is not, and the capstone is what
  proves that.** `balance-combat-survival`'s fleet death-rate FLOOR (0.8 per 1,000 sim
  days, a T-1603c design target) is breached. Two separate things were wrong and they
  got different answers:
  1. **The parity-monotonicity assertion was UNDER-POWERED, not inverted** — it graded
     a 0.5% gap (1,073.9 vs 1,078.8) on cells of n=169 and n=81. The slice was widened
     15 → **40 seeds** and it resolves cleanly in the designed direction (below 1,842.9
     > even 1,161.4 > above 1,019.8). **Not one band moved**; this is a power increase,
     which is the fix amendment 1's corollary prescribes.
  2. **The death rate is genuinely under its floor, and THE FLOOR NEVER DESCRIBED THE
     FULL SWEEP.** At 1,000 seeds the fleet rate is **0.6448** — and it was **0.6323**
     at `baseline-r2c-explorer-remit`, which predates N3 entirely. So the capstone has
     been under 0.8 since before either N-step touched the cast, and N3+N4 together
     moved it **UP** by 2.0%. What the 60-day/4-policy slice measures is a
     harder-than-fleet corner, and 0.8 was calibrated on that corner. Reconciling the
     slice with the capstone is a calibration decision for **R2.5/N8**, not a number
     for this step to pick — so the floor is held as a tripwire with the measurement
     at its site, and only the floor: everything else in that test still grades.
- **A DELIBERATE DESIGN CONSEQUENCE, quantified so it is not rediscovered as a bug.**
  `buildNamedCandidates` (`actions/travel.ts`) filters on `NPC_PROFILES`, which N3's
  split shrank 41 → 30, so the eleven named captains stopped being drawable as random
  interdictions. **That follows from what the split IS** (owner, 2026-07-29: the eleven
  are set aside for STORYLINE ONLY, replacing an earlier "eleven immortal captains"
  idea that was dropped because immortality made no thematic sense), so it is the
  intended shape. Quantified only because it is part of the death-rate arithmetic:
  putting all 41 back moves the slice 5 → 7 ships lost (0.52 → 0.73/1,000), still short
  of 0.8. **What IS genuinely open:** two `applyDisposition` reasons are written for
  storyline captains — `loan-default` (Penny Wise) and `contraband-caught` (a named
  patrol captain) — and T-1204's interception weighting was their reader. Those grudges
  now need a storylet-side expression or the writes need re-siting. **An owner design
  question, not a number to tune.**
- **The day-loop golden was re-recorded with a measured note, in the fixture's own
  established style.** 1,482 → 1,451 events; `NpcAction` **unchanged at 330** (11 days
  × 30 captains — the cast still takes exactly one action each, only WHICH moved);
  `StatCheck` 260 → 288 and `FlawCheck` 199 → 156, because the blend lands captains on
  verbs their flaw triggers less often. **The player side is identical in count and
  kind** (DawnRoll 11, DayAdvanced 11, DebtPayment 4, DeedEarned 6, RenownRankUp 3,
  TradeEvent 8, TravelEvent 6, all three Storylet events), which is the check that this
  is an NPC-side change and not a quiet player rebalance.
- **`archetype` now has FIVE readers, and the split between them is the design.**
  Two are content-driven and belong to this step (`ARCHETYPE_INTENT_MULTIPLIERS` in
  `pickIntent`; the poverty weight riding on the same numbers). Three are engine-side
  destination/stance biases inherited from the first attempt and kept because they are
  the half an intent weight cannot express: `pickNpcStance` (N3's triangle),
  `executeTrade`'s smuggler rim preference, and `executeTravel`'s explorer rim
  preference. **The explorer one is why explorers own 10 of 12 deaths** — a rim
  destination is priced as the dangerous lane it is by `routeDangerFor`, so the
  preference BUYS the archetype its own mortality rather than being free flavour.
  **N10's `pickContract` is the fourth of that kind** and should read `profile.archetype`
  the same way, which is why N4 keeps its early slot.
- **Test coverage added: 11 engine tests** (`npc.test.ts`), one per property the two
  rulings turn on — the ≥4 member floor, a multiplier row per archetype, the three
  owner-fixed assignments, the two worked distributions, two traders staying distinct,
  the `Justice` veto surviving both the multiply *and* poverty, the poverty lean
  without an order, **every captain having a non-zero Travel share** (N3's hand-off,
  held by assertion), the all-zero → `Idle` corner, and **separability** (neutral
  multipliers reproduce the pure `ideal` draw, so the control arm really is a control).
  The N3 death test was also fixed rather than re-pinned: it asserted `losses > 0` on
  **one seed** for a ~1.4-per-200-day event, which is a coin flip dressed as a test —
  it now samples seeds 1, 7, 42.

*Provenance: capstone `docs/balance/baseline-n4-shipped.json`, control arm
`docs/balance/baseline-n4-control.json`, fixture re-extracted from the capstone
(`spreads harvested`), `rulesFingerprint` `91cfa4adc626ba54` → `c9530236d51b237e`,
`instrumentFingerprint` `79adfd2417aa9fcd` → `75e73b1e7d32168c`, `docsFingerprint`
`774c91af0fbdecc0`.*

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
amendment 2 counts in its ratio; N1 is the precedent). The shared pool is built, the
cast works it everywhere, and the player's board is shaped by it. What does not hold is
the hypothesis: *"makes contract competition a real economic force"*. **It does not, and
the step measured why — the reason is neither of the two throttles the Change clause
suspected.**

**THE ARITHMETIC THAT DECIDES IT, and it is a structural fact rather than a tuning
miss.** The galaxy generates `20 systems × 4 offers = 80 jobs a day`. The cast consumes
**4.61 of them** (10 seeds × 200 days, engine-level probe) — about **6%** — and spreads
that almost perfectly evenly: the hottest port carries **0.303** outstanding claims per
system-day against the coldest's **0.191**, a 1.6× spread with no hub effect in it. So
**79.2% of system-days still offer a full four-job board** and the galaxy-wide mean depth
is **3.768**. No pool rule can make 6% of supply feel like scarcity.

**BOTH THROTTLES SWEPT, and the Disproves' stated cause is REFUTED** — its second limb
reads *"the cap was the binding constraint and still is"*, and the measurement says it
never was:

| knob | value | visible snipes / 2,000 days | player board depth (mean) |
| --- | --- | --- | --- |
| `MAX_VISIBLE_SNIPES_PER_DUSK` | **1** (shipped) | 354 | 3.63 |
| | 2 | 420 | 3.58 |
| | unbounded | 423 | 3.58 |

Lifting the cap entirely buys **69 more snipes in 2,000 days** and 2-vs-unbounded is
noise (420 against 423) — two co-located trading captains on one dusk is simply rare. The
regen knob is even flatter, which is the sharper finding: `JOB_POOL_REGEN_PER_DAY` of
**1 / 2 / 4** gives galaxy mean depth **3.740 / 3.768 / 3.770**. A pool's MEMORY LENGTH
cannot matter when the per-system claim rate (~0.2/day) is an order of magnitude under a
four-job daily board. Both knobs keep their shipped values, and the reason is recorded at
their definition sites rather than inferred from the numbers surviving.

**WHAT THE STEP ACTUALLY DELIVERED — a parity gap it was not looking for.** Pre-N10 an
NPC took ONE randomly-rolled contract; the player picks from four. That is not a
different rule, it is *less of the game*, and `pickContract` closes it. Measured against
a true control arm (the pre-N10 tree, both arms rebuilt so neither read a stale `dist` —
see the caution below), 10 seeds × 200 days, medians over the living simulated field:

| archetype | n | median credits, control → N10 | median hull |
| --- | --- | --- | --- |
| trader | 6 | 851,930 → **1,355,994** (+59%) | 90 → 90 |
| smuggler | 4 | 413,723 → **629,706** (+52%) | 90 → 90 |
| veteran | 5 | 175,878 → **365,407** (+108%) | 90 → 90 |
| gambler | 4 | 129,544 → **248,749** (+92%) | 90 → 90 |
| explorer | 5 | 1,286 → **167** | 90 → 90 |
| fighter | 6 | 168 → **132** | 50 → **40** |

The control's trader median reproduces N4's shipped table **exactly** (851,930), which is
what certifies the arm as the real pre-N10 state rather than a re-derivation.

**THE FINDING THAT MATTERS MOST — THE NON-TRADER FLOOR DID NOT MOVE, and the capstone
says so at 1,000 seeds.** N4 handed this step the non-trader wealth floor as its success
measure, ahead of `ContractClaimed`. At day 120 the cast's median wealth goes
**21,884 → 76,049 (+247%)** and its **p10 is UNCHANGED at 126**. One number, two
readings: everyone who was already trading got much richer, and nobody who was destitute
stopped being destitute. The engine probe agrees (field p10 128 → 127; captain-runs under
1,000cr **80 → 86 of 286**). The cause is visible in the verb mix and is not the board:
a fighter chooses Trade on **3.0%** of days and an explorer on **7.6%**, against a
trader's 41.1%, so a better board is a lever they almost never pull.

**So the opportunity clause is answered NO, and the risk clause is answered NO.** N10 did
not turn every archetype into a trader (the verb mix barely moved, and N4's archetype
separation survives intact); it also did not lift the floor. *"If N10–N12 together do not
close it, the fighter's `150 × tier` is the first knob and it belongs to the owner"* —
one of the three is now spent and the gap is untouched. See the hand-offs written into
N11 and N12.

**THE PLAYER'S GAME BARELY MOVES, which is the correct result for an NPC-side change.**
Capstone, `baseline-n4-shipped` → `baseline-n10-shipped`, 8,000 runs: fleet Tour One
clear **0.5199 → 0.5180**, fleet final credits median **30,425 → 30,915** (+1.6%),
encounters/run **24.01 → 23.94**, deaths/1,000 days **0.6448 → 0.6573** (+1.9%).
Per-policy clear rates: trader 0.9050 → 0.9210, trader-degraded 0.7810 → 0.7670, fighter
0.3700 → 0.3480, explorer 0.7970 → 0.7910, veteran 0.0010 → 0.0000, smuggler
0.5150 → 0.5400, gambler 0.7900 → 0.7770, greedy 0.0000 → 0.0000. **No policy moves more
than ~2 points; the yardstick is intact.**

**Still binds:**

- **THE INSTRUMENT HAD NEVER COUNTED CONTRACT COMPETITION AT ALL, and that had to close
  before this step's own capstone.** `day.ts` emitted `ContractClaimed` and **nothing in
  `packages/sim` read it** — which is why N2's *"+2.0%"* had to be an ad-hoc probe and why
  no committed baseline has ever carried the number. Same class as N9's *"the aggregate
  cannot see an asset"* and N4's `sampleMilestone` defect, and closed the same way, ahead
  of the measurement rather than after it: `CampaignStatsReport.contractClaims`,
  `CampaignDayStats.boardDepth` / `contractsSniped`, and
  `contractClaims` / `contractClaimsPerRun` / `boardDepth` (a full Distribution, because
  competition shows up in the TAIL long before the median) on every aggregate row. Named
  reader: `packages/sim/src/__tests__/campaign-contracts.test.ts`. The capstone now
  carries **22.6–26.2 claims per 120-day run** and **boardDepth p10 3 / median 4 / mean
  3.756–3.793** per policy.
- **`market.npcClaims` → `market.jobPoolClaims`, and it is a MOVE (save v10 → v11).** The
  second field move in `MIGRATIONS` after N1's `fuel` → `ship.fuel`, and it inherits that
  precedent's strictness in both directions: an orphan `npcClaims` is an unknown key, a
  missing `jobPoolClaims` a missing one, so a half-done migration fails loudly. The old
  scalar is credited to `player.currentSystemId` as a **statement of fact** — the
  co-located snipe was its only writer and that dawn's board its only reader — and clamped
  through the engine's own `JOB_POOL_MAX_CLAIMS` rather than a literal, keeping `save.ts`'s
  exclusion from `rulesFingerprint` honest. `deserializeState` performs the SAME move and a
  test pins the two paths to the same answer, because N1's `fuel` backfill is the precedent
  for them drifting.
- **THE ONE THING THAT WOULD UNDO THIS STEP: decoupling depth from the ledger.** The
  away-claim path calls `generateManifestBoard` per trading captain, which is *literally
  what the reverted attempt did* (`7334c5d5`). The difference is the coupling in BOTH
  directions — the depth is READ from the shared ledger (`jobPoolDepth`) and the claim is
  WRITTEN back to it (`debitJobPool` via `NpcDayResult.claimedFromPool`). Remove either and
  this becomes the private board the standing constraint forbids, with no test necessarily
  going red on the day it happens. The three tests that would notice are in
  `livingGalaxy.test.ts` under *"the shared job pool is galaxy-wide, persists, and
  restocks"*.
- **The pool REGENERATES, and pre-N10 is a value of that knob rather than a different
  mechanism.** At `JOB_POOL_REGEN_PER_DAY >= JOB_POOL_BOARD_SIZE` the rule reduces exactly
  to T-106's dawn reset. Regeneration is applied AFTER the board is drawn, and that order
  is load-bearing: restocking first would refill the pool before anyone could see it
  drained, silently deleting T-106's mechanism instead of generalising it. Tallies are
  clamped and zeroes are DELETED, so a quiet galaxy serializes as `{}`.
- **THE `dist` TRAP, and it invalidated a control arm before it was caught — read this
  before measuring any future N step.** Probes that import `@spacerquest/engine` resolve
  to `packages/engine/dist`, so `git stash`-ing `packages/` and re-running produces a
  control that is **byte-identical to the shipped arm** — the stash reverts `src` and the
  built `dist` stays. It happened twice here (once on the archetype table, once on the
  combat-cell slice) and in both cases the tell was output identical to the last decimal,
  which is not what a shifted rng stream looks like. Two fixes, both used: import
  `../packages/engine/src/index.js` directly from a probe, and `npx tsc -b` between arms
  when the import is by package name.
- **`rulesFingerprint` IS NOT FORMATTING-INVARIANT, which contradicts standing amendment
  3's N7-FP note.** A `prettier --write` over the tree (fixing 3 pre-existing violations in
  files this step never touched, plus its own) moved it **`bed3c00ac19f43d7` →
  `3079dec9aa5a4af0`** and staled a fixture extracted minutes earlier. N7-FP's argument is
  that hashing the TypeScript *emit* normalises formatting away; that is evidently not
  fully true. **Handled without touching a fingerprint**: the capstone was re-run on the
  formatted tree and diffed against the pre-format one — **"NOTHING MOVED. Every compared
  field is equal on both sides"** across 8,000 runs — and the fixture re-extracted from
  the re-run. So the reformat is *proven* measurement-neutral rather than asserted, and
  the amendment's premise is filed as newly-doubtful rather than quietly relied upon.
  *Procedural consequence for the next step: format BEFORE the capstone, not after.*
- **THE 18 RED TESTS THIS STEP INHERITED, grouped by what was really wrong.** The battery
  entered at 1,287 / 0 and leaves at **1,312 / 0**.
  - **9 stale-fixture (`balance-smoke` ×5 + `balance-rig` ×4)** — the N7 gate firing as
    designed against the moved rules/instrument/save fingerprints. Cleared by the capstone,
    never by a refreshed number.
  - **7 `campaign-degraded` policy fingerprints** — re-pinned with **logged entry 9**,
    which separates the two routes into those hashes: the report SHAPE (new fields) and the
    dusk STREAM (more rng draws per trading captain). `greedy` moved for the fourth
    consecutive NPC-side step; entry 6 remains the standing explanation.
  - **3 `protocol` replay goldens** — regenerated, and **one RESPONSES array moved**, which
    the N2 note says should not happen for an NPC-side change. Diffed rather than waved
    through: of 22 responses exactly one differs, everything outside its `manifestBoard` is
    identical, the board's DEPTH is unchanged at 3, and 1 of its 3 offers was re-rolled.
    N2's responses held still because N2 changed no rng draw COUNTS; N10 does. Recorded at
    the fixture.
  - **2 goldens (`day.test.ts`)** — re-recorded with the event-count diff the convention
    asks for: DAY_LOOP 1,310 → 1,301 events, `NpcAction` unchanged at 300, and **every
    player-side event unchanged in count and kind**, which is the check that this is an
    NPC-side change.
  - **1 `balance-combat-survival` (`spacers die`)** — a live band on a rare event, and the
    honest answer was to WIDEN THE SAMPLE, exactly as the same file's N4 block prescribes.
    Measured on both arms at 40 seeds: pre-N10 lost 5 ships / 9,600 sim days with **one** in
    below/unprepared; post-N10 lost 3 with **none**. The assertion was being graded on an
    expected count of about one — and that file's own N4 note already recorded that it only
    became nonzero when the slice widened from 15 to 40 seeds, so it has been one unlucky
    resample from red since it started passing. Re-measured at 120 seeds / 28,800 sim days:
    16 ships lost, below/unprepared **n=1,774 at 0.338%** — six expected deaths, a sample
    that can resolve the claim. **Every threshold in that file is byte-identical, and the
    death-rate floor is still breached (0.556 against 0.8), so the R-owned tripwire stays
    correctly red** rather than being papered over by the widening.
  - **1 `deed-coverage`** — same shape, same answer. Re-swept over the 1..16 range the
    file's own provenance establishes: **the union is still 44/44 with nothing missing** (no
    coverage regression — the design property this file guards is intact) and six careers
    are individually total (7, 9, 11, 12, 15, 16) against seven before, but seeds 1..8 now
    hold only ONE of them. Range widened 1..8 → 1..12 (holding four), threshold unmoved.
    Its "~8.5s per career" runtime note is stale by an order of magnitude — twelve 300-day
    careers now run in 5.7s — and that is recorded there.
  - **1 `campaign-reach` (veteran buys a port)** — a documented single-seed hunt, re-swept
    in its own protocol (seeds 1..80 through the exact committed test, via a temporary
    env-var seed override so the swept code IS the shipped code). **Zero of seeds 1..20
    qualify**, which is why the sweep had to widen rather than the horizon; 9 of 21..80 do
    (22, 26, 27, 51, 55, 67, 69, 71, 79). That is 9/80 = 11% against N4's 3/20 = 15% —
    the same rate inside sampling error on counts this small, so the pillar is no harder to
    reach. Re-pinned to seed 22. **The 150-day horizon is deliberately unmoved**: widening
    it would enshrine the number that test's own T-1504a note warns keeps moving.
- **Baseline of record re-pinned to `docs/balance/baseline-n10-shipped.json`**, with
  `balance-targets.test.ts`'s path and standing amendment 1's pointer moved in the same
  commit, as that amendment requires.
- **WHAT WAS NOT DONE, so it is not mistaken for an oversight.** No pool claim emits an
  event. ~4.6 claims/day over a 120-day career would add ~550 events to a persisted
  `eventLog` for a signal the player cannot act on, so the away-claims are measured through
  state (`boardDepth`) and the WIRE still narrates only the visible snipe — the one the
  player can actually watch. If a later step wants per-claim provenance, that is a new event
  type with its own cost argument, not a widening of `ContractClaimed`.

*Measurement provenance: capstone `docs/balance/baseline-n10-shipped.json` (8,000 runs).
The per-archetype and pool-depth figures come from a throwaway engine-level probe of the
ambient NPC loop (10 seeds × 200 days, no player actions, medians over
`isSimulatedCaptain` records only) — the same shape of probe N3 and N4 used, and it is
NOT committed: the numbers are the durable artefact and a scripts/ file nothing imports
would rot. Rebuild it from this paragraph if N11 needs the same table.*

---

*Below is the step as specified, kept for the record.*

*Found by the 2026-07-29 audit: the owner's parity intent assumed fuller contract
interaction than the cast has.*

- **What exists today, measured:** `executeTrade` synthesizes a private offer via
  `rollContract` for every haul EXCEPT when the NPC shares the player's system, in which
  case it may claim one visible offer off the player's live board — capped at **one claim
  per dusk across the whole fleet** and gated on co-location (`NpcDayContext.claimableBoard`,
  `day.ts`). N2 measured the consequence: an 8× wealth increase across the field moved
  `ContractClaimed` by +2.0% — noise. Competition is a texture, not a force.
> [!IMPORTANT]
> **WHAT N4 FOUND AND HANDS TO N10** (standing amendment 4). **Only Trade pays.**
> `executeTravel` pays nothing (pure fuel cost), `executePatrol` 40, `executeCombat` a
> flat `150 × tier`, and `executeTrade` a real contract — so under N4's blend the two
> archetypes that specialise AWAY from Trade end at **206 and 170 credits median** at
> day 200 (explorer, fighter) against the trader's **851,930**, and their median hull
> falls with it (90→80, 70→50). Twelve of the thirty captains are destitute, and an
> archetype is currently a choice about how poor to be.
>
> That is this step's opportunity and its risk. **Opportunity:** a shared board the
> whole field can work is the first real income source for a non-trader, so watch the
> non-trader wealth floor as a success measure here, not just `ContractClaimed`.
> **Risk:** if the board is the only fix, N10 turns every archetype back into a trader
> — which would undo N4. Sweep the per-archetype INCOME MIX, not just the claim count.
> If N10–N12 together do not lift the floor, the fighter's `150 × tier` is the first
> knob and it is an owner call (see N4's Result).
>
> **DISCHARGED, and BOTH clauses answered NO.** Opportunity: the floor did not move —
> cast p10 **126 → 126** at the 1,000-seed capstone while the median went
> 21,884 → 76,049. Risk: no archetype turned back into a trader — the verb mix barely
> shifted and N4's separation is intact. The income mix was swept as asked, and it is
> what explains both answers: a fighter chooses Trade on **3.0%** of days and an
> explorer on **7.6%**, so a better board is a lever they almost never pull. **One of
> the three chances is spent.** Full numbers in N10's Result.

- **Hypothesis:** letting captains claim from the shared per-system job pool wherever they
  fly — not only under the player's nose — makes contract competition a real economic
  force and the market feel inhabited.
- **Change (programmatic):** NPCs claim against the same job pool that generates the
  player's board. If materializing live boards for 20 systems × 30 captains breaches the
  performance envelope, the sanctioned fast-forward (per the PARITY LEDGER ruling) is a
  shared depletion pool: a synthesized claim debits the same generation pool that shapes
  the next board the player sees — the player must be able to WATCH the competition, not
  just share a galaxy with it. The 1-claim/dusk cap and the co-location gate are throttles
  from the texture era: sweep them as knobs here rather than inheriting them silently.
- **Simulate:** full sweep + `ContractClaimed` rates + board-depth percentiles at the
  player's location.
- **Proves:** claims scale with field activity; offers the player saw disappear at rates
  that track the cast; the trader's clear-day band holds or moves attributably.
- **Disproves:** boards empty and Tour One clear collapses (competition tuned too hot), or
  nothing moves at all (the cap was the binding constraint and still is — a finding about
  the cap, to take back to the owner).

> [!WARNING]
> **REVERTED ATTEMPT (`7334c5d5`, reverted 2026-07-29) — read before rebuilding.**
> An unfinished implementation was committed and rolled back. It left the engine at
> **154 failing tests and a failing typecheck**. Three things to not repeat:
>
> **1. It built a PRIVATE board, which inverts the step.** Each NPC got its own
> `generateManifestBoard(npc.currentSystemId, …, 4)` that **depletes nothing and is
> invisible to the player**. This step's Change clause sanctions exactly one
> fast-forward — *"a shared depletion pool: a synthesized claim debits the same
> generation pool that shapes the next board the player sees — the player must be
> able to WATCH the competition, not just share a galaxy with it."* A private board
> is the parallel cost model the standing constraint forbids and R2c is the standing
> warning about.
>
> **2. It silently killed the one competition signal that already existed.** With
> `systemBoard` always non-null, the `ctx.claimableBoard` branch became unreachable,
> so `claimedContractIndex` was never set and `ContractClaimed` would have gone to
> **zero** — measurably *worse* than pre-N10, with this step's Proves failing by
> construction. The Change clause also asked for the 1-claim/dusk cap and the
> co-location gate to be **swept as knobs**; they were inherited as dead code instead.
>
> **3. `pickContract` hardcoded the origin system.** `systemDistance(0, c.destination)`
> — every archetype's distance reasoning measured from system 0 rather than
> `npc.currentSystemId`, and it threw `Unknown star system route: 0 -> 11` outright.
>
> **WHAT IS WORTH SALVAGING:** the *shape* of `pickContract` — an exported, pure,
> archetype-keyed selector that takes the offer list and returns one contract, so the
> per-archetype strategy is unit-testable in isolation. That matches the owner's
> constraint that *the contract an NPC picks is driven by their archetype/persona*.
> Keep the shape; fix the origin, and feed it the shared pool rather than a private one.
>
> **ALL THREE AVOIDED, and the salvage was taken (2026-07-29 rebuild).** (1) The pool is
> shared: depth is READ from `market.jobPoolClaims` and every claim is WRITTEN back to
> it, which is the coupling that separates this from a private board — spelled out at
> `executeTrade`'s definition site because the code otherwise looks identical. (2) The
> `ctx.claimableBoard` branch is intact and still the ONLY route to `ContractClaimed`;
> the capstone measures 22.6–26.2 claims per 120-day run, so it did not go to zero, and
> both throttles were swept rather than inherited. (3) `pickContract` takes
> `originSystemId` as a parameter and a test drives the same board from two origins to
> two different answers. It became the step's largest measured effect — see the Result
> above.

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

**This is not a graded N-series step** — no hypothesis, no sweep, no verdict, no re-pin. It is
remediation of three items (**OI-6**, **OI-6b**, **OI-7**) raised by the 2026-07-29 N-series
doc-vs-code audit: five independent verification passes over every step marked SHIPPED, run
against HEAD `5e4b9f0c` on a clean tree, which raised **13 items (OI-1 … OI-12 plus OI-6b),
all closed the same day**. The audit's own working file was never committed: **this document
is the whole record**, and every one of the 13 is traceable by grepping its OI-number here —
`OI-1` and `OI-5` under N1/N2, `OI-2` under N6 and N3, `OI-3` under N7 and standing amendment
3, `OI-4` under N7-FP, `OI-6`/`OI-6b`/`OI-7` here, `OI-8` under N3, `OI-9` under N2 and THE
PARITY LEDGER, `OI-10` in the track preamble, `OI-11` under N6, `OI-12` under N8. Where an
item stayed open by decision rather than being fixed, it is filed under the step that owns it
rather than in a list of its own. It is recorded here, beside N7-FP, because both are changes
to *the instrument that decides whether a fixture still describes HEAD*. **Nothing was
re-stamped and nothing was owed** — rules **`91cfa4adc626ba54`** (56 files) and instrument
**`79adfd2417aa9fcd`** (4 files) both unmoved and still matching
`docs/balance/smoke/tiers.json`; running the new module against a pristine `git archive HEAD`
tree reproduced the stamped `docsFingerprint` `e003c81c03bcd116` exactly, so the working-tree
drift was 100% attributable to OI-1's comment rewrite in `npc.ts` (recorded in N1). Battery
**1,239 -> 1,262 passing / 0 failing**; rig tests **29 -> 52**.

**Still binds:**

- **OI-6 — every directory under a hashed root is a decision on record.** `listTsFiles` read
  only the declared directories, so `packages/engine/src/rules/` would have been invisible to
  `computeRulesFingerprint` **and** to the three enumeration tests that exist to make the
  classification total. The guard **fails rather than auto-recursing**, deliberately:
  auto-recursion would let a whole subtree join the fingerprint with nobody having decided
  that it should. In `packages/sim/src/balance/rules-fingerprint.ts`: `:207`
  `HASHED_ROOT_IGNORED_DIRECTORIES` (`__tests__`, `node_modules`, `dist`), each carrying its
  stated reason; `:248` `assertNoUndeclaredSubdirectory()`, whose message names the offending
  directory and both remedies; `:352` `listTsFiles()`; `:523` `collect()` and `:625`
  `allSourceKeys()` both take the declared-subdirectory set through, **so the hash and the
  enumeration tests walk the same guarded tree**. `listTsFiles` is the module's only
  `readdirSync`. It lives in the PRODUCTION MODULE, not the test, and that is load-bearing:
  `checkpoints.ts` and `smoke-extract.ts` stamp fixtures from the command line, and a
  vitest-only guard cannot reach a CLI stamp. 8 tests, `balance-rig.test.ts:537`.
- **SHARP BUT INTENTIONAL — an empty, `.d.ts`-only or asset-only directory all THROW, and they
  hard-fail `smoke-extract` at the CLI, not just a test.** So adding e.g.
  `packages/content/src/data/*.json` will stop a fixture extraction dead until someone declares
  the directory. That is conservative-safe and consistent with the module's doctrine, but it is
  a real cost, and the remedy is one line in `HASHED_ROOT_IGNORED_DIRECTORIES` or in the
  declared set.
- **OI-6b — the four symlink rules, settled.** `readdirSync(withFileTypes)` types a symlink by
  ITSELF, not its target, so a symlinked directory slipped both the new guard and
  `listTsFiles`. `listTsFiles` now classifies every entry ONCE via `statSync` — which follows
  the link where `lstatSync` would not, and that is the entire reason for choosing it
  (`classifyEntries()` / `ClassifiedEntry`, `rules-fingerprint.ts:276-350`). (1) A **symlinked
  directory** trips the guard with the identical message and escapes it via
  `HASHED_ROOT_IGNORED_DIRECTORIES` exactly as a real one does. (2) A **symlinked `.ts` file**
  is HASHED like any other rule source — `readFileSync` follows the link, so it is real rule
  code deciding real outcomes. (3) **The repo-relative path IN THIS TREE enters the manifest,
  not the target's** — a fingerprint describes this tree. (4) A **dangling or
  non-regular-file** link fails loudly with a named `UNRESOLVABLE SYMLINK` message rather than
  letting a bare `ENOENT` escape from inside a fixture stamp. Cost on a healthy tree is zero
  and is pinned by a test. 9 tests, `balance-rig.test.ts:634`.
- **OI-7 — a file TypeScript cannot parse used to hash silently.** `ts.createSourceFile` does
  not throw on bad syntax: it RECOVERS, records the problem in the `@internal`
  `parseDiagnostics`, and the printer prints the recovered tree (`export const A = (` prints as
  `export const A = ();`). Two different broken states can recover to the same tree — **a
  fingerprint collision between rulesets that are not the same ruleset.** `assertParseClean`
  (`rules-fingerprint.ts:485`) now fails with the file, the line:column and the parser's own
  message before anything is hashed; `hashSemantic` (`:436`) calls it at `:444`, ahead of
  `printFile` at `:445`. It is an assertion rather than a documented mitigation for the same
  reason as OI-6: `tsc -b` is external and runs in the battery, not before `smoke-extract.ts`
  stamps a fixture. **The assertion's own failure mode is covered: if `parseDiagnostics` ever
  stops being readable (a TypeScript upgrade renaming that `@internal` field) it throws rather
  than silently stopping checking.** 6 tests, `balance-rig.test.ts:761`.
- **The hashed corpus, pinned as a test rather than remembered.** All **60** hashed files —
  **56** rule plus **4** instrument, the instrument set being exactly `sim/index.ts`,
  `balance/aggregate.ts`, `balance/smoke.ts`, `balance/synthesize.ts` — parse with **zero**
  diagnostics under the exact `ScriptTarget.Latest` / `ScriptKind.TS` pair the hash uses.
- **ONE HOLE OF THE SAME CLASS IS STILL OPEN — recorded, not closed.** The guard catches a new
  *subdirectory* under a hashed root. A whole new hashed **root** — a new package, say
  `packages/economy/src` — is caught by nothing: it would simply never be walked, and every
  enumeration test would pass while describing a game that had grown a limb. Closing it needs
  a different mechanism (the workspace list is the thing that would have to be
  totality-checked, not a directory listing). **It belongs to whichever step first adds a
  package** — that step must either declare the new root here or record why it holds no rule
  code.

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

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
