# Balance Policy & Foundation Reference of Record

**Status:** Standing policy for the Rimward redesign. Companion to `docs/PRD-REIMAGINED.md` and the standing constraints in `docs/ENGINEERING-POLICY.md`.

This document records where the game's balance numbers come from, how the PRD and the 1991 foundation rules rank against each other when they disagree, a running errata of claims in the code and task log that turned out to be false, and — Part D — the archetype vocabulary and measured baseline the balance work is graded against.

---

## Part A — Foundation Reference of Record

The 1991 rules are the *foundation*. The reference of record is the repository at commit **`f2f95fa9`**. Foundation rule source is consulted directly from that commit, e.g.:

```
git show f2f95fa9:foundation/rules/upgrades.ts
git show f2f95fa9:foundation/rules/<rule>.ts
```

- Foundation lives under `foundation/` at `f2f95fa9`; it is the transcription of the original Apple II / BBS *Spacer Quest* rules and constants and is the authority on what the 1991 game actually did.
- The Museum Edition (the faithful-port build) is **quarantined in `legacy/`** and is not the balance authority; it is history, not spec.
- When a balance question arises — a price, a DC, a probability, a cap — the first move is to read the foundation rule at `f2f95fa9`, not to guess, and not to trust a downstream comment or task note (see Part C for why).

## Part B — PRD-over-Foundation Balance Policy

States `docs/ENGINEERING-POLICY.md` standing constraint 5 in full. The precedence is:

1. **PRD-REIMAGINED wins over foundation numbers.** Where the redesign's design intent (`docs/PRD-REIMAGINED.md`) calls for a different number than the 1991 rule, the PRD number is correct. Foundation is the starting point and the fallback, not a straitjacket.
2. **Foundation is consulted first.** Before diverging, read the foundation rule at `f2f95fa9`. A "divergence" you introduce because you never checked foundation is a bug, not a design decision — and half the time (see the hull-price cap errata below) there is no divergence at all, only a misremembered foundation rule.
3. **Every divergence is commented at its definition site.** If the engine's number differs from foundation, the difference must be documented *where the value is defined*, with the PRD rationale for the change and the foundation figure it departs from. An undocumented balance divergence is a review failure.
4. **A comment must not assert a divergence that does not exist.** The inverse of rule 3, and just as binding: if the code matches foundation, no comment may claim it diverges. A false divergence note sends future readers hunting for a design decision that was never made (this exact failure is errata #1).
5. **Interim thresholds held until T-1603.** Balance thresholds and probabilities in place before T-1603 were interim; T-1603 set the canonical targets (`docs/balance/BASELINE-T-1603a.md`, `docs/balance/TUNING-T-1603.md`). The balance-redesign track has since moved past even those — `docs/NPC_REDESIGN.md` (standing amendment 1) carries the current baseline-of-record, and it and `docs/BALANCE-REDESIGN-WORKLIST.md` supersede any figure here that they have re-pinned.

---

## Part C — v0.1 Errata

Corrections to claims made in the codebase and the task log during v0.1 that were found to be false or inaccurate. Source: the v0.1 truth audit of 2026-07-12. The errata is the correction vehicle; the task log it corrects is the retired v0.1 list, quoted here rather than linked, because that list is no longer a document this repository carries.

**Citations here name SYMBOLS, not line numbers.** They used to name line numbers, and by 2026-07-27 every one of them was stale — E5 pointed at `types.ts:760` for a union that had moved to `:989`, E6 at `systems.ts:176` for a constant at `:203`. The corrections themselves were all still true, which is the trap: a precise-looking pointer that lands on the wrong line reads as a refuted claim rather than a moved one. A symbol name is greppable and survives every edit above it.

### E1 — The hull-scaled equipment price cap is NOT a divergence

**Claim (false):** `packages/engine/src/actions/shipyard.ts` (at `HULL_SCALED_EQUIPMENT_PRICE_CAP`) and the v0.1 task log's T-115 finding documented the `min(hull.strength * 1000, 20000)` price on `AUTO_REPAIR` / `TITANIUM_HULL` as an *intentional engine divergence* from a foundation rule that "has no cap."

**Correction:** Foundation **does** cap these prices at 20,000. `f2f95fa9:foundation/rules/upgrades.ts` (~L731) computes `price = ship.hullStrength > 20 ? 20000 : ship.hullStrength * 1000`. Because the multiplier is 1000, `hull * 1000` reaches 20,000 exactly at `hull = 20` — foundation's threshold — so the engine's `Math.min(hull.strength * 1000, 20000)` form is *mathematically identical* to foundation's branch. The code is **faithful**; the comment and the T-115 finding were the errors. The false comment has been corrected at its definition site in `shipyard.ts` (and the companion note in `shipyard.test.ts`). No behavior changed.

### E2 — T-101 "payments shifted" is false

**Claim (false):** the v0.1 task log's T-101 states that "manifest payments and fuel costs shift accordingly."

**Correction:** Nothing shifted. No payment or fuel-cost values were changed by T-101. The claim describes an effect that did not occur.

### E3 — T-106 "shared per-system job pool" is inaccurate

**Claim (inaccurate):** T-106 describes a "shared per-system job pool" that NPCs draw from.

**Correction:** There is no pool. NPCs claim contracts **from the player's own manifest board**, and only when co-located in the player's system, at **most one claim per dusk** — the dusk block in `packages/engine/src/day.ts` that increments `market.npcClaims`, fed by the `T-106 contract competition` branch in `packages/engine/src/npc.ts`. This is the Contract Competition mechanic now named in PRD §2 — a rival taking a job off *your* board, not a shared regional pool being drained.

### E4 — T-201 poverty-trap criterion scoping

**Claim (overstated):** T-201's anti-poverty-trap acceptance criterion is phrased as "no policy" gets trapped at zero.

**Correction:** The phrasing overstates the guarantee. The test suite scopes the anti-poverty-trap check to the **three competent NPC policies**, not to every possible policy (a deliberately self-destructive or degenerate policy is not in scope). The design law — debt as a ledger, income floors so competent actors are never stranded at zero (now stated in PRD §2, "Scarcity of choices, never a poverty trap") — holds for the policies the game actually ships; the criterion's universal wording is the inaccuracy, not the mechanic.

### E5 — T-1003 "all 7 action types" undercounts

_Source: T-1804 audit (Rimward)._

**Claim (inaccurate):** T-1003's Delivered note describes the UGT adapter as covering "all 7 action types."

**Correction:** The count is **11, not 7**. `PlayerAction` (`packages/engine/src/types.ts`) is an 11-member discriminated union: **Trade, Travel, Combat, Shipyard, Storylet, Explore, VisitHangout, Reroll, Crew, Port, Wait**. The exhaustiveness guard `} satisfies Record<PlayerAction['type'], true>` in **`packages/sim/src/__tests__/protocol.test.ts`** lists and enforces all 11 — adding a discriminant to the union fails `tsc` there until the table (and therefore the coverage) is extended. The adapter covers all members; the "7" was a stale count.

### E6 — T-1101 "engine exports isGatedDestination / GATED_DESTINATION_MIN_ID" misattributes the owner

_Source: T-1804 audit (Rimward)._

**Claim (inaccurate):** T-1101 states that the engine exports `isGatedDestination` / `GATED_DESTINATION_MIN_ID`.

**Correction:** Both are **`@spacerquest/content`** exports, defined in `packages/content/src/systems.ts` (`GATED_DESTINATION_MIN_ID = 21`, and `isGatedDestination` just below it). The engine *consumes* the predicate — `packages/engine/src/day.ts` imports `isGatedDestination` from `@spacerquest/content` and calls it in its `Travel` guard; it never imports the constant at all, naming it only in a comment. Content owns them; the engine reads them and neither exports nor re-exports them.

### E7 — T-1307 era-income "A/B test" is a lever test, not a statistical experiment

_Source: T-1804 audit (Rimward)._

**Claim (imprecise):** T-1307 describes an era-income "A/B test."

**Correction:** It is an **in-scope-vs-base lever comparison** — the same seeded run evaluated with the era-income lever engaged versus the base configuration — not a statistical A/B experiment. There are no cohorts, no randomized assignment, and no significance testing; the "A/B" label denotes only the two-arm deterministic comparison of one lever against baseline.

### E8 — `SUBSISTENCE_FLOOR_CREDITS` is a post-T-1603 economy number

_Source: T-1604b (Rimward), fixing UGT finding F2._

**Not a correction — a disclosure.** Rule 5 of Part B makes T-1603 the owner of the canonical balance targets, and T-1603a–c's sweeps ran before this constant existed. `SUBSISTENCE_FLOOR_CREDITS = 100` (`packages/content/src/subsistence.ts`) was introduced **after** that pass, so **no canonical sweep has ever seen it**. Recording that here is the honesty requirement; the number is not thereby exempt from a future T-1603-style pass.

**Why it was allowed to land outside a balance task.** It is not a tuning knob but a *floor*, and the design law it implements is PRD-REIMAGINED §"Scarcity of choices, never a poverty trap": "the world provides floors … no actor in the simulation, **player or cast**, gets permanently trapped at zero." The cast has had this floor since T-106 (`npc.ts` `NPC_ODD_JOB_CREDITS`); the player did not, and the UGT campaign measured a career pinned at 0 credits for 385 consecutive days as a result. Fixing that is a correctness repair, not a rebalance.

**Why it moves no canonical target.** The dusk block is guarded on `credits < SUBSISTENCE_FLOOR_CREDITS` and raises credits **to** the line, never by it, so it is unfarmable and structurally invisible to any solvent career (one contract pays 2,200+). Measured: the whole T-1603 balance suite (`balance-targets`, `balance-sweep`, `campaign-policies`, `lending-property`, `balance-combat-survival`) passes **unchanged** with the floor in place, and both protocol replay goldens and the day-loop golden are byte-identical. The one assertion that moved is a *structural* one — `campaign-reach.test.ts`'s scripted broke-and-dry career now ends at 100 credits instead of 0, and its seed was re-pinned 1 → 3 with the seeds-1..10 sweep recorded at the site (8 of 10 seeds still register fuel starvation, so the T-1004 metric remains reachable).

**The value's provenance.** 100 is not a new invention: it is `NPC_BROKE_CREDITS` (`packages/engine/src/npc.ts`), the game's existing "broke" line for the cast. Player and cast now share one definition of broke.

---

## Part D — Archetype Reference & Measured Baseline

*Folded in from the retired standalone `ARCHETYPE-BALANCE-MATRIX.md` (written 2026-07-28); companion to `docs/balance/` (the committed sweep artifacts), `docs/BALANCE-REDESIGN-WORKLIST.md` (the R-series work log) and `docs/NPC_REDESIGN.md` (the NPC parity track, and the current baseline-of-record), and `docs/PRD-REIMAGINED.md` §7 (combat), §9 (property).*

This part exists because a balance discussion kept stalling on vocabulary. "The fighter lost 21 ships" reads like a squadron of drones being expended. It is not. It states, in one place, what each simulated archetype actually *does* on a turn, what every column of the balance matrix *measures*, and where the numbers below said the design was out of true at the time this was written. **The figures in D.4/D.5 are a snapshot, not a live dashboard** — `docs/BALANCE-REDESIGN-WORKLIST.md` and `docs/NPC_REDESIGN.md` are where the baseline-of-record has since moved (R2c, R2d and the N-series — the current pointer is `NPC_REDESIGN.md`'s standing amendment 1); read this part for vocabulary and method, those for current numbers.

### D.1 Terminology, stated once

**An "archetype" is a scripted player, not an in-game entity.** The balance sweep
(`packages/sim/src/balance/sweep.ts`) runs seven `SimPolicy` functions. A policy is handed
the live `GameState` each day and returns the actions that captain takes. They are stand-ins
for play *styles* — the ways a human might choose to spend a dawn hand.

**There are no purchasable fighters, drones, escorts or squadrons anywhere in the game.**
The player has exactly one ship.

**"Ship lost" is the player's ship, and it ends the career.** It fires `ShipLost` →
succession (`packages/engine/src/legacy.ts`). The successor inherits deeds, renown rank,
charts, Signal Fragments, NPC grudges — *and the debts*, including the Guild marker and any
Penny Wise loan. The player loses the ship, the fit, and their position; they keep their
name and their bills. Closer to "escape in a pod and start over" than to losing a unit.

**Rates are per 1,000 simulated days, not per career.** A career in the veteran arm is 120
days, so `0.83 deaths / 1,000 days` ≈ **one ship lost per ten 120-day careers**. Always
translate before reasoning about difficulty.

### D.2 The seven archetypes — what each actually decides

Descriptions are taken from the policy implementations in `packages/sim/src/index.ts`, not
from their names. Line numbers are where each is defined.

**`trader` (L1643) — route + fuel planner.**
Keeps the tank topped, signs the **richest net-value contract** on the board, flies it to
delivery the same day (a second run while the debt is heavy and the hand/tank allow), then
remits everything above a fuel reserve to the Guild marker. Once the marker clears it
prefers a **rim** run over a core one inside the same fundable set. On a bad day at a Hangout
it takes a **Penny Wise advance** sized to the shortfall and clears it before term.
**Combat: never fights.** Weak hull by choice — it talks past interceptors.

**`smuggler` (L2049) — a trader that runs dirty.**
Same fuel/contract machinery as the trader, but inside the fundable set it prefers, in
order: a **contraband run** (cargo type 10, top of the value band), then any rim-bound run.
Takes every sealed pod an Explore sweep turns up and sells to Ray. Pays the Guild out of
those runs. **Combat: talks its way past.** Rim preference is *not* gated on the marker —
the rim is this policy's career.

**`gambler` (L2535) — a working trader who plays the tables.**
The trader's day (refuel → repair if crippled → richest fundable run → fly → pay Guild),
with two changes: inside the fundable set it prefers runs **ending at a Hangout system**, and
while at a Hangout it queues up to `GAMBLER_MAX_DARES_PER_DAY` wagers as extra actions. The
working day is planned first so sign/travel dice are reserved before the tables get what is
left.

**`fighter` (L2797) — upgrade-then-hunt.**
Funds itself with a contract run each day, **reinvests surplus into weapon/hull/shield/drive
tiers**, and when intercepted it *fights the ones it can drop* — one volley per point of
enemy hull, spending the sharpest dice, but only when the tank covers the whole exchange.
Outmatched (fuel or hand insufficient for the kill) it runs; if it cannot run it talks.
**This is the only policy that routinely buys weapons.**

**`explorer` (L2927) — fragment chaser.**
Off-lane sweeps are a **credit sink** (80 fuel for a thin salvage roll), so it funds itself
with one contract run a day and pours surplus fuel and dice into Explore attempts, chasing
Signal Fragments and the Sage's decode storylets. Carries a deadhead-flight guard against
stranding.

**`greedy` (L1196, `greedyTraderPolicy`) — the cautionary path.**
Takes income opportunistically and **buys no upgrades**. Present as a control: what happens
to a captain who accumulates nothing.

**`veteran` (L3258) — endgame grinder, not a baseline.**
**Registry-driven**: each dawn it reads which Deeds are still unearned and steers at them
(haggle for `broker_shark`, a mercy/rim contract when offered, varied combat stances for the
encounter deeds, a deliberate low-fuel arrival for `fuel_fumes_arrival`), trading to fund the
renown-gated fit up to `ASTRAXIAL_HULL`. **Deliberately excluded from `COMPETENT_POLICIES`**
and exempt from the poverty-trap sweep — it is a reachability instrument, not a lean baseline.
**T-161 narrows what that exemption ever meant**: out of scope for the gate never licensed a
missing fallback. The veteran was the last policy in `index.ts` whose contract filter had no
full-tank second pass (F-159-1, fixed at T-161); it still stalls, but for a *different* and
separately-filed reason (F-161-1), and `balance/gate.ts` now carries the measured number
instead of the dice-banking story it used to tell.

### D.2a The one-prime-focus property — a norm, not an observation (T-159)

> Line numbers in D.2 above are as of the original authoring pass and have drifted; the
> anchors in THIS subsection were re-derived against the tree on **2026-08-01**.

**Every archetype has one prime focus and a spread of secondary actions. None is a
single-verb monoculture.** The name is the *emphasis*, not the action set. Re-checked
against current source, not carried forward from a prior pass:

| policy | anchor | prime focus | the secondary spread that is already there |
| --- | --- | --- | --- |
| `trader` | `index.ts:2515` | richest net contract run | rim preference once the marker clears, head-home-to-settle routing, Penny Wise advance + early repay, captain overhead, Guild remittance |
| `fighter` | `index.ts:4100` | fight the ones it can drop | a funding contract run every day, special equipment (debt-gated), component tiers, captain overhead, debt payment, and — from T-159 — a homeward repositioning burn |
| `smuggler` | `index.ts:3010` | contraband | ordinary rim runs, sealed pods sold to Ray, Guild remittance, upgrades, an idle-day Explore floor |
| `explorer` | `index.ts:4396` | Explore sweeps | one funding contract run a day, decode storylets, a drives upgrade it buys **only** on a day that produced no income (`index.ts:3336`), arc pursuit to Polaris-1 |
| `gambler` | `index.ts:3767` | the tables | a full trader working day planned FIRST, then the wagers; plus an explicit anti-idle travel-toward-Hangout (`index.ts:3899`) |
| `veteran` | `index.ts:4848` | deed-registry steering | trades to fund a renown-gated fit; the T-1104 full-tank relaxation from T-161 (`index.ts:4956`) — still **exempt** from the stall gate, on a re-justified and re-numbered note (`balance/gate.ts:187-211`) |
| `greedy` | `index.ts:1579` | naive control | none, on purpose — it accumulates nothing, and it is excluded from the gate for exactly that reason |

**Why this must hold, mechanically.** `isIncomeAction` (`packages/sim/src/index.ts:1659`)
counts only four verbs: sign-contract, `Travel`, `Explore`, and `Combat` at `fight`/`talk`.
A policy whose only income verb is gated — by fuel, by renown, by an encounter that did not
roll — therefore has **no income action at all** on a gated day, and `assertNoIncomeStall`
(`packages/sim/src/balance/gate.ts:447`, `INCOME_STALL_LIMIT = 5`) fires. A monoculture is
not a style choice; it is a poverty trap with a rationale attached.

**The check any new or edited archetype owes.** Every gate on the headline verb needs a
non-empty fallback, and there are exactly two accepted shapes in this file:

1. **A second-pass relaxation of the gate** — the T-1104 full-tank pattern, now carried by
   all six contract-signing policies (`trader`, `smuggler`, `gambler`, `explorer`, from T-159
   `fighter`, and from T-161 `veteran` — the last one that lacked it): when nothing fits the
   `SIGN_FUEL_FRACTION` re-flight margin, relax to the full tank and take the run the ship
   can actually complete.
2. **An explicit anti-idle move** — the gambler's travel-toward-Hangout, the explorer's
   income-day-only drives refit, the fighter's homeward repositioning burn. Each fires only
   when the day has queued no income action at all, so it can never displace real work.

**T-159 is the case that proved the norm.** `fighter` already had the spread — it falls back
to trade, refuel, equipment, component tiers, overhead and debt payment when it is not
fighting — but it lacked the *reachability* of that spread: stranded at a rim port where
every leg exceeded 0.6 of the tank, the contract filter came back empty every day and the
policy read as a monoculture from the outside for exactly one missing branch. The audit
answer is therefore **no, none of the archetypes is a monoculture**, and the property is
recorded here so it is a stated norm rather than a fact re-derived from source each time it
is asked.

**The two exclusions are deliberate and already stated elsewhere; do not re-litigate them
here — but the veteran's rationale was re-written at T-161 and the old wording is dead.**
`veteran` is exempt at its own definition site, and it KEEPS that exemption after T-161
because it still stalls; what changed is that the reason is now measured rather than
asserted. It is *not* "an endgame grinder banking dice for a gated refit" — that story was
wrong in both the number (6-8 days claimed, 31 measured) and the mechanism, and it is
replaced in `GATE_COMPETENT_POLICIES` (`balance/gate.ts`) by the pre-fix/post-fix figures
and by F-161-1, the defect that actually holds the residual up. `greedy` is unchanged: the
naive control whose whole job is to show what playing badly costs.

#### Findings opened by the T-159 audit — F-159-1 FIXED at T-161, F-159-2 closed at T-178

**F-159-1 · `veteranPolicy` carries the last un-relaxed contract filter (reachability gap,
NOT a monoculture). — FIXED at T-161 (2026-08-02).** `index.ts` filtered `rankedContracts` to
`ship.maxFuel * SIGN_FUEL_FRACTION` and `net > 0` with **no second pass** — structurally the
identical defect T-159 repaired in the fighter. (`reachableByFullTank` sits two lines below
but only vets a *deed-steered* pick; it never relaxed the default filter.) It was out of
`GATE_COMPETENT_POLICIES` by recorded exemption, so it was never a gate failure. **Measured**
over seeds 1..200 × 35 days on the post-T-159 tree: longest zero-income streak **31**, with
**197 of 200 seeds at ≥ 5** — materially worse than the "6-8 consecutive zero-income days"
the exemption comment then recorded, which is itself why it was re-opened rather than widened.

**The fix.** T-161 ported the T-1104 full-tank relaxation verbatim from the five policies that
already carried it (`index.ts:4956`, `let reachable = signableWithin(...)` followed by
`if (reachable.length === 0) reachable = signableWithin(ship.maxFuel)`), extracting the inline
filter chain to a `signableWithin(cap)` closure first and **proving that extract inert** —
`PINNED_FINGERPRINTS.veteran` came back at `8db1029399f20ed8` byte for byte — before adding
the branch. `net > 0` is kept in the relaxed pass, as it is for trader/smuggler/gambler.

**The re-measured streak table** (same rig, seeds 1..200 × 35 days, `--days 35`), restated
against the before-numbers rather than carried forward from T-159:

| policy | pre-fix worst streak | seeds ≥ 5 | post-fix worst streak | seeds ≥ 5 |
| --- | --- | --- | --- | --- |
| `trader` | 3 | 0 | 3 | 0 |
| `fighter` | 19 | 1 (seed 157, F-159-2) | 0 | 0 |
| `explorer` | 3 | 0 | 3 | 0 |
| `smuggler` | 4 | 0 | 4 | 0 |
| `gambler` | 2 | 0 | 2 | 0 |
| `veteran` | **31** | **198 of 200** | **13** | **197 of 200** |

Two honest notes on that row. (a) The pre-fix number on the T-161 tree is **198**, not the 197
T-159 recorded — one seed of drift across T-154/T-156/T-160, re-measured rather than assumed.
(b) The relaxation owns **depth**, and depth is what it fixed: the nine seeds that each held a
31-day strand (4, 10, 56, 62, 82, 91, 135, 155, 185) fall to 5-10, pinned as a live-run
regression test in `sweep-gate.test.ts`. The **count** of stalling seeds barely moves because
the residual is a different defect — see F-161-1.

**The second branch was measured, not assumed, and REJECTED.** T-159's brief was one branch
short, so T-161 tested the obvious candidate: the fighter's anti-idle homeward burn, ported
into `veteranPolicy` after the sign/travel block with all three guards intact. Measured on the
same rig it moved the worst streak 13 → 11 but moved seeds ≥ 5 **the wrong way, 18 → 19**
(re-phasing gained seeds 50 and 132 while closing 105). It cannot close the residual class
because that class is not a travel problem, so it was reverted rather than landed. Recorded
here so the next reader does not re-run the same experiment.

**F-159-2 · A fuel-starvation strand no policy branch could escape (T-1004 mechanism) —
CLOSED at T-178 (2026-08-07).** On the post-T-159 tree, seed 157 × 35 days was the
single remaining `fighter` stall at ≥ 5 (19 consecutive zero-income days) and it was
**not** a reachability failure. Repeated interceptions at Regulus-6 chipped the hull until
`maxFuel` fell 270 → 210 → 150 → 90; the ship then arrived at Achernar-5 (a rim port)
where the cheapest jump in the map exceeded a *full* 90-unit tank, so
`cannotAffordCheapestJump` (`index.ts:919`) was true for 19 straight days and the engine
would refuse every jump the policy could queue. Both T-159 branches were behaving
correctly: the relaxation found nothing because nothing was flyable, and the anti-idle
burn correctly refused to queue a jump the tank could not fund.

**The closure.** The later fighter duress work added the two outs this finding named:
`planCrippledRepair` before refuel so the collapsed hull ceiling is restored before the
tank is filled, and the tail `planStrandedExplore` so a ship with no flyable leg but enough
fuel to work the port has an income verb. Re-run for T-178 on this tree:
`runCampaign(157, 35, 'fighter')` reports `longestZeroIncomeStreak = 0` and
`fuelStarvationDays = 0`; the 1..200 × 35-day competent-policy scan reports zero seeds at
or over the five-day stall bar (worst streaks: trader 1, fighter 1, explorer 0, smuggler 0,
gambler 0). The workflow gate is widened from seeds 1..60 to 1..200 so seed 157 is now a
live CI member rather than an out-of-range note.

#### Findings opened by T-161 — recorded, not fixed

**F-161-1 · `veteranPolicy` takes EVERY offered storylet as a standalone day.**
`index.ts:4936`. The branch reads `if (storyletAction) return withReroll(state,
[storyletAction]);` under a comment claiming a standalone day "matches the other policies".
**It does not.** `smugglerPolicy` (`index.ts:3026`), `gamblerPolicy` (`index.ts:3795`) and
`explorerPolicy` (`index.ts:4455`) all carry the SPLIT: a choice that spends no die resolves
**inline** and the trade day continues around it; only a die-spending choice takes the day,
because only that can collide with the trade-day ledger — which is the reason the veteran's
own comment gives for a rule it then applies far too widely.

**This is what holds the veteran's residual stall up, and it is measured.** After F-159-1's
relaxation the veteran's worst streak fell 31 → 13, but **197 of 200 seeds** are still at ≥ 5.
The instrumented worst seed says why: on seed 89, from day 23 at Polaris-3, the policy never
*reaches* the contract block at all. On every day it did reach it, `reachable` was four offers
deep. The queue simply handed it a die-free storylet every dawn (`passenger.false-name.*`,
`guild.pressure.*`, `chain.silk-dagger.*`, `veteran.*`, `alliance.confederation.*`) and each
one ate the whole day. A `Storylet` is not an income action (`isIncomeAction`, `index.ts:1660`),
so a career spent entirely on free narrative beats is a career of zero-income days.

**A trial fix was measured and is NOT landed, and this is the reason.** Porting the three-line
split verbatim from `gamblerPolicy` closes most of it — seeds ≥ 5 over 1..200 × 35 days fall
**197 → 18** — but it costs the deed slate. `deed-coverage.test.ts`'s "the slate is earnable by
a single career" measures full slates over seeds 1..76 × 300 days through `deedHunterPolicy`,
which wraps `veteranPolicy`; measured **2 → 0**, with `liars_dice_grand_slam` missed 19 → 63
times and `ray_s_ledger` 27 → 54, because the Liar's Dice ROSTER TOUR errand needs idle days
and the split leaves almost none. (Control: F-159-1's relaxation alone moves that count **2 →
3**, i.e. the relaxation is a strict improvement and the storylet split is the regression.)
Closing F-161-1 therefore belongs to a task that owns the deed-hunter instrument and may
re-pin `deed-coverage.test.ts` — the same shape of scope call T-159 made when it left F-159-1
to T-161. Not fixed here.

**Say which kind of gap this is when citing it.** It is neither a reachability gap (F-159-1,
closed) nor the fighter fuel-starvation strand (F-159-2, closed at T-178). Of the 18 seeds that still stall with the
trial fix applied, **16 are a fourth mechanism again**: the purse is pinned at ≤ 163 credits
with a large tank and 0 fuel, so the veteran picks the best-net contract on the board and then
refuses it at the existing `availableFuel >= primaryFuelNeed` guard, never falling back to a
cheaper leg it could fuel today. That is a spend-ordering-under-duress problem — the same
family as F-159-2's original closing sentence — and is recorded here rather than fixed, because no
policy in this file carries an "afford it today" fallback to port from.

### D.3 What every matrix column measures

| column | source | meaning |
| --- | --- | --- |
| **clears** | `tourOneClearRate` | fraction of careers that paid the 25,000cr Guild marker to zero |
| **clear day** | `debtClearedDay.median` | in-game day the marker hit zero. Design band for the trader is **[22, 30]** — below 22 the marker is trivial, above 30 it is not clearable inside Tour One |
| **final credits** | `finalCredits.median` | purse at the horizon |
| **deeds** | `deedCount.median` | authored Deeds earned (44 exist). Deeds drive renown rank, and rank drives `player.tier` |
| **enc/career** | `encountersPerRun` | interceptions per career |
| **combat EV** | `combatEvAll.median` | credits an encounter cost, itemised by event. **Negative by construction** — the engine pays nothing for winning a fight (no bounty, no salvage). The baseline compares the *magnitude* of loss across cells. This is recorded as a finding in its own right |
| **parity** | `combatCells[].parity` | interceptor tier vs player tier, **from the player's view**: `below` = player outgunned (the target bucket), `even`, `above` = interceptor outmatched |
| **prepared** | `combatCells[].prepared` | `weaponVolleyDamage(ship) > 1` at the moment the encounter opened. A junker's volley is exactly 1, so `prepared` means a bought weapon tier or STAR_BUSTER was actually in play |
| **ships lost** | `survival.shipsLost` | player ships destroyed → successions. Asserted equal to `successions`: a loss that did not hand on the career would be a silent break in the T-108 legacy path |
| **deaths/1k** | `survival.deathsPer1000Days` | ships lost per 1,000 simulated days |
| **routes lost** | `routesLost` | signed contracts never delivered (dumped or taken) |

**Difficulty scaling at the time this was written** (`packages/engine/src/tier.ts`): `player.tier` is a 1–5 power
band derived from **renown rank + combat ship fit**. It is the *only* input to encounter
matchmaking — `selectEncounterInterceptor` reads it and `chooseTargetTier` clamps candidates
to `[tier−1, tier+1]`. **Wealth is not an input** (this is the gap the predation-pressure brief in D.6 is about).

### D.4 The measured matrix (snapshot — see `BALANCE-REDESIGN-WORKLIST.md` / `NPC_REDESIGN.md` for current numbers)

**BASELINE OF RECORD AT THE TIME OF WRITING — 1,000 careers per archetype × 120 in-game days (8,000 careers,
960,000 sim-days), `docs/balance/baseline-vet-1k-r2a.json`, taken 2026-07-28 after the R0a
tribute-oracle fix and the R2a fighter-upgrade-ceiling fix.** This table supersedes the
100-seed arm below it. NOTE the `fighter`/`veteran` rows moved again at R2a (they share the
upgrade wishlist); every other row is byte-identical to the post-R0a arm.

| archetype | clears | clear day | final cr | deeds | enc/career | combat EV | ships lost | deaths/1k |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| trader | 0.92 | 21 | 80,305 | 17 | 31.6 | −1,245 | **19** | **0.16** |
| smuggler | 0.55 | 30 | 42,769 | **28** | 34.2 | −1,400 | 66 | 0.55 |
| gambler | 0.80 | 26 | 68,436 | 23 | 30.1 | −1,300 | 27 | 0.23 |
| fighter | 0.61 | **23** | **155,059** | 13 | 26.4 | −400 | 41 | 0.34 |
| explorer | 0.00 | — | 91,669 | 23 | **40.1** | −1,500 | 65 | 0.54 |
| greedy | 0.00 | — | 1,000 | 8 | 2.0 | −27 | 111 | **0.93** |
| veteran | 0.00 | 96 | 8,372 | 20 | 16.2 | −400 | 103 | 0.86 |
| trader-degraded | 0.76 | 23 | 57,619 | 18 | 29.4 | −1,400 | 120 | 1.00 |
| **fleet** | 0.47 | 25 | 57,959 | 19 | 26.2 | −850 | 548 | 0.57 |

`trader-degraded` is the R1 measurement instrument (a human-plausible pilot), not an
archetype — read it only against the `trader` row.

<details><summary>RETIRED — the original 100-seed arm (<code>baseline-vet-t1605.json</code>),
kept for provenance. Do not quote it.</summary>

100 careers per archetype × 120 in-game days (700 careers), taken 2026-07-28 against the
T-1605 travel change.

| archetype | clears | clear day | final cr | deeds | enc/career | combat EV | ships lost | deaths/1k | top rank |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| trader | 0.90 | 21 | 79,954 | 17 | 32.5 | −1,299 | **0** | **0.00** | TOP_DOG |
| smuggler | 0.61 | 29 | 44,027 | **28** | 33.1 | −1,400 | 9 | 0.75 | MEGA_HERO |
| gambler | 0.82 | 26 | 66,413 | 22 | 30.2 | −1,309 | 2 | 0.17 | GRAND_MUFTI |
| fighter | 0.71 | **19** | **151,972** | 14 | 25.4 | −400 | 5 | 0.42 | ADMIRAL |
| explorer | 0.00 | — | 93,342 | 23 | **40.2** | −1,500 | 7 | 0.58 | GRAND_MUFTI |
| greedy | 0.00 | — | 1,000 | 8 | 2.0 | −32 | **12** | **1.00** | CAPTAIN |
| veteran | 0.01 | 93 | 12,195 | 20 | 15.8 | −400 | 11 | 0.92 | TOP_DOG |
| **fleet** | 0.44 | 25 | 59,023 | 20 | 25.6 | −800 | 46 | 0.55 | — |

**Why it was retired (R0b, 2026-07-28).** Its zeros are sampling artifacts: the trader's true
outgunned loss rate is 0.00119, whose expected count in a 12,000-day arm is ~1, so observing
0 was the single likeliest outcome. A 100-seed arm also cannot resolve the clear-day median
to ±1 day, which is the resolution the [22, 30] target is graded at.

</details>

### D.5 The finding this matrix was built to expose

**An unprepared trader wins the game at a fraction of everyone else's risk.**

Figures below are the 1,000-seed baseline of record at the time this was written. The original 100-seed wording —
"without ever being at risk", "0 ships", "0 cargo" — was **overstated by sampling**, and the
corrected numbers are given here instead. The finding survives the correction; the absolutes
did not.

- **0.92** clear rate, 80,305 credits, TOP_DOG rank, clears the marker on **day 21**
- **19 ships lost across 120,000 simulated days** — a rate of **0.16 deaths/1k** against a
  **0.57 fleet average** and greedy's **0.93**
- **17 cargo routes lost out of 89,967 delivered** (0.019%)
- Its `prepared = true` combat cells are **empty** — across 1,000 careers and 31.6
  encounters each, it **never fits a weapon, ever**
- It fought **10,106 encounters while outgunned and unprepared** at a `shipLostRate` of
  **0.00119**

Compare `greedy` (**0.12934** when outgunned — ~109× the trader) and `fighter` (**0.00425**,
~3.6×). The trader is not avoiding pirates: at 31.6 encounters per career it meets **more of
them than the fighter does (26.4)**. It survives essentially all of them at trivial cost.

**And the exit is a purchase, not a getaway** (R1): 93% of its outgunned encounters end
`talked-down` — paying tribute — and under 6% end in flight. Read D.6's "escape" claims with
that substitution in mind.

So the gap is **not attraction, it is consequence**. A wealthy captain currently buys
immunity by declining to engage. Adding more interceptions to the trader's day would produce
more encounters it also escapes.

### D.6 Open research brief — "predation pressure"

**The idea.** Wealth should attract predators on its own axis, separate from renown and fit,
so that a captain who is *rich relative to their combat power* becomes a mark. This nudges
every archetype through the whole game: a fighter must trade to fund guns, a trader must
eventually arm up or accept losses.

**What the data says to aim at.** Because the trader already meets plenty of interceptors,
the lever with teeth is not interception *rate* but **escapability**. Suggested shape, to be
designed and costed by the game side:

1. A **wealth-to-power ratio** (credits vs combat fit / tier). High ratio = a mark.
2. That ratio raises interception rate *modestly*, and more importantly raises the chance the
   interceptor is a **pursuer** — one where `combat_run` is opposed at a penalty, or refused.
3. It self-corrects: bank the purse into weapons and the ratio falls; hoard while soft and
   the rim notices.
4. **Constraint: touch matchmaking only, not combat maths.** The combat EV table is tuned
   (T-1603c) and should not move as a side effect.

**Questions to settle before building:**
- Is the trader's perfect escape record the *engine* (running is near-free) or the *policy*
  (the sim is a better pilot than a human)? The mechanic should be tuned against a
  human-plausible pilot, not against an optimal one. (Since answered — see R1 in
  `docs/BALANCE-REDESIGN-WORKLIST.md`.)
- Should predation scale with liquid credits only, or with total assets (ship fit, port
  stakes, cargo in hold)? A port-owning captain is visibly wealthy in a way a purse is not.
- Does an unescapable pursuer break the T-1605b anti-poverty-trap invariant for a captain who
  is rich but low on fuel? That invariant has already been broken once this cycle by a
  travel-cost change.
- `greedy` currently dies most and earns least. Does predation make it strictly worse, and is
  that acceptable for a control policy?

*(This brief predates R4's re-scope in `docs/BALANCE-REDESIGN-WORKLIST.md` — read that
document's R4 entry for where this idea currently stands.)*

### D.7 Cross-references

- Policies: `packages/sim/src/index.ts` (line numbers in D.2)
- Tier / matchmaking: `packages/engine/src/tier.ts`, `actions/travel.ts`
- Metric definitions: `packages/sim/src/balance/aggregate.ts`
- Committed baselines: `docs/balance/baseline-*.json`
- Sweep runner + runtime budget: `packages/sim/src/balance/sweep.ts`
- Death/legacy: `packages/engine/src/legacy.ts`

**Reproduce the matrix:**

```sh
npm run balance:sweep -w @spacerquest/sim -- --label vet --seeds 100 --days 120 --shard i/4  # ×4
npm run balance:sweep -w @spacerquest/sim -- --label vet --merge
```
