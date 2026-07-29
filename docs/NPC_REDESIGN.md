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
the detail. Run order is N0 → N1 → **N7** → N2 → N6 → N3 → **N10 → N11 → N12 → N13** → N4 →
N5 → N8 (see "Sequencing at a glance" for why N7 moved; N10–N13 added by owner ruling
2026-07-29 — see THE PARITY LEDGER below).

| step | status | outcome |
| --- | --- | --- |
| N0 — copy-on-write discipline | **SHIPPED** | clone flat in NPC richness, not linear; killed the quadratic |
| N1 — NPCs own a real ship | **SHIPPED** `b438096b` | change accepted, **hypothesis disproved** — capstone byte-identical; found the N2 blocker + the fuel exemption |
| N7 — capstone diff + smoke rig | **SHIPPED** | **accepted** — 1.5 s smoke vs 2 min capstone; staleness fails loudly; found N9 |
| N2 — NPCs upgrade their ships | **SHIPPED** | **ACCEPTED** — spread max/median 13.4→155, fits 5→144, Honor List 2/8→8/8 contested; found R10 |
| N6 — Honor List, 31-way board | **SHIPPED** | **accepted** — actor-shaped board; found 6 of 8 titles uncontestable by construction |
| N3 — NPCs meet pirates | TODO | permanent death SETTLED; **the 11 mechanically-referenced captains are EXEMPT**, the other 19 mortal |
| N4 — NPC archetypes | TODO | — |
| N5 — NPC proficiency spread | TODO | reuses R1's `PilotDegradationProfile`; **GATED BY N13** — its die-allocation lever needs a decision surface to act on |
| **N10 — NPCs work the contract board** | **TODO · MUST-HAVE** | owner ruling 2026-07-29 — NPCs interact with trade contracts as players do; the co-location gate and 1-claim/dusk cap get measured, not assumed |
| **N11 — NPCs earn deeds and Renown** | **TODO · MUST-HAVE** | removes the rank −1 dead end; the yard's Renown gate becomes reachable with no NPC branch |
| **N12 — NPCs buy ports** | **TODO · MUST-HAVE** | lands BEFORE N8; pulls N8's aggregate-sees-assets task forward as its own first task |
| **N13 — NPC decision surface (dawn-hand parity)** | **TODO · MUST-HAVE** | literal reduced hand vs algorithmic equivalent — owner accepts algorithmic fast-forward; gates N5 |
| **N9 — the instrument's three unplayed actions** | **SHIPPED** | **hypothesis REJECTED** — verbs cost 38% of fleet cash, not gain; found the aggregate cannot see an asset |
| N8 — re-pin against a living field | TODO | **must first teach the aggregate to see ports**; re-pin against the post-N9 instrument; **follows N10–N12** (owner ruling 2026-07-29) |

**WHAT AN NPC ACTUALLY IS TODAY (measured 2026-07-28, `packages/engine/src/npc.ts`):**

> **PARTLY SUPERSEDED (2026-07-29 audit, item OI-10) — kept as the track's baseline
> description.**
> N1 gave every captain a real ship and N2 a real upgrade decision, so the "no ship, no
> components, phantom trading" bullets below describe the field as the track FOUND it,
> not HEAD. Still true at HEAD: no encounters (N3), no deeds or rank (N11), no board
> claims away from the player (N10), no ports (N12), and one coarse d20 action per day
> (N13).

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
| Trade | coarse haul; claims the player's board only when co-located, 1 claim/dusk fleet cap | **N10** |
| Travel | real fuel, real routes, no encounters yet | N3 |
| Combat | abstract GUNS check vs no one, flat bounty | N3 |
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
- **OI-1 precision corrections, both easy to "fix" back into being wrong.** The roster is
  **30 captains, not 31** (`createInitialState(seed).npcs.length === 30`); **31 is the BOARD
  size** (the player plus the 30), so **N6's heading is correct and is not to be "fixed"**.
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
- **Test pin taken deliberately:** `campaign.test.ts`'s NPC wealth-spread ceiling raised
  10 -> 25 against measured ratios 7.52–15.99, i.e. **pinned ~56% above the worst observed
  rather than at the last measurement.** `rulesFingerprint` `76ac9179…` -> `2273d380…`.
- **Baseline of record re-pinned to `docs/balance/baseline-n2-final.json`** at this step
  (standing amendment 1 as refined); it has since been superseded — the amendment is
  authoritative.

*Full record: `git show 433ffce3 -- docs/BALANCE-REDESIGN-WORKLIST.md`*

### N3 — NPCs meet pirates, and answer them

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
  - **Authored content attached to the dead. SETTLED (owner, 2026-07-28): the eleven
    mechanically-referenced captains are EXEMPT from mortality in N3. The other 19 are
    mortal.**

    *The original note here named "Penny Wise, Smuggler Ray, the Sage" and warned that
    killing the lender must not strand the loan verb. **All three parts of that were
    wrong**, and the measurement is why the ruling is narrow:*

    | claim | reality (measured 2026-07-28) |
    | --- | --- |
    | three service NPCs | **eleven** cast ids are referenced by mechanics |
    | the Sage is at risk | **the Sage is not a captain** — it lives in the nemesis-fragment decode content, not the 30-roster. It cannot die. |
    | killing the lender strands the loan verb | **it does not.** `LENDER_ID` is only a disposition/grudge key; `lending.ts` states at its definition site that the desk is available at any Hangout because "Penny Wise is the lender, not a co-located NPC". |

    **The eleven:** `npc-silk-dagger`, `npc-lucky-seven`, `npc-rattlesnake`,
    `npc-penny-wise`, `npc-doc-salvage`, `npc-wild-card`, `npc-smuggler-ray`,
    `npc-stellar-monk`, `npc-void-whisper`, `npc-the-broker`, `npc-rust-bucket`. Ten are
    referenced **only** in `storylets.ts` as `trigger: { npc: { id } }`; Penny Wise only in
    `lending.ts`.

    **The real failure mode is mid-chain death, not a missing verb.** The storylets are
    multi-step chains with scheduled follow-ups: answer Doc Salvage's ping on day 12
    (`chain.doc-salvage.ping_answered`), Doc Salvage dies on day 40, and on day 41 the
    scheduled beat fires — *"Doc Salvage answers a day later…"*. **A dead captain talks.**

    **Why exempt rather than seal the chains** (the alternative, kept visible per
    BALANCE-POLICY Part B rule 3): sealing them properly — resolving a dead captain's
    pending storylets as unreachable, reusing the existing `wireResolution` "you never
    answered" path — is the *right* long-term answer and is its own authored-content task.
    Bundling it into N3 would make one step change NPC combat **and** narrative resolution
    at once, and neither result would be attributable. **Ship mortality for the 19, measure
    the shrink rate, then decide whether the eleven join them.** Revisit with that number.
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

### N4 — NPC archetypes

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

### N10 — NPCs work the contract board (MUST-HAVE · owner ruling 2026-07-29)

*Found by the 2026-07-29 audit: the owner's parity intent assumed fuller contract
interaction than the cast has.*

- **What exists today, measured:** `executeTrade` synthesizes a private offer via
  `rollContract` for every haul EXCEPT when the NPC shares the player's system, in which
  case it may claim one visible offer off the player's live board — capped at **one claim
  per dusk across the whole fleet** and gated on co-location (`NpcDayContext.claimableBoard`,
  `day.ts`). N2 measured the consequence: an 8× wealth increase across the field moved
  `ContractClaimed` by +2.0% — noise. Competition is a texture, not a force.
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

### N11 — NPCs earn deeds and Renown (MUST-HAVE · owner ruling 2026-07-29)

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
             └─► N3 (NPCs meet pirates + answer them)
                  └─► N10 (NPCs work the contract board) ......... MUST-HAVE (owner 2026-07-29)
                       └─► N11 (NPCs earn deeds + Renown) ........ MUST-HAVE
                            └─► N12 (NPCs buy ports; the aggregate
                                 learns to see assets FIRST) ..... MUST-HAVE, lands before N8
                                 └─► N13 (NPC decision surface:
                                      dawn-hand parity) .......... MUST-HAVE, gates N5
                                      └─► N4 (archetypes) ──► N5 (proficiency spread)
                                           └─► N8 (re-pin the baseline against a living field)
                                                ▲ N9 MUST LAND FIRST — see below
                                                ▲ N10–N12 + the ledger's UNRULED verbs
                                                  MUST BE SETTLED FIRST (owner 2026-07-29)

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
   > **Baseline of record is `docs/balance/baseline-r2c-explorer-remit.json`** (1,000 seeds
   > × 120 days). `baseline-n2-final`, `baseline-n9-shipped`, `baseline-r2c-final` and
   > `baseline-vet-1k*` are its predecessors.
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
