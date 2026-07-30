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
