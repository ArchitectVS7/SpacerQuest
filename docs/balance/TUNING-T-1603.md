# Balance Tuning — T-1603 (Parts B and C) — **FINAL**

**This is the tuning memo. `BASELINE-T-1603a.md` is the measurement it tunes against**
— that document opens by declaring that it moved no number, so this one exists rather
than appending to it. **Part B (T-1603b), §§1–8, covers economy and pacing. Part C
(T-1603c), §§9–14, covers combat and survival and FINALIZES this document.** Nothing
further is planned to append here; a later tuning pass should open its own memo and
cite this one as its before-column.

Two things this memo tries hard to do. First, **ratifications are first-class**: a
constant measured across 4,200 careers and deliberately left where it stands is a
canonical value, and §2 / §10 list it as such rather than omitting it. Second, it is
**explicit about what could not be measured** — §5 names one change the sweep is
structurally incapable of grading, and §12 records where Part C's own plan turned out
to be measuring the wrong quantity, rather than dressing an arithmetic argument up as
evidence.

---

## 1. Provenance

| | |
|---|---|
| Measured against | the T-1603b working tree, whose only diff from `62463c36` (T-1603a) is this task's own changes |
| Date | 2026-07-26 |
| Machine | Windows 10, 8 logical cores, 16 GB |
| Node | v22.16.0 |
| Instrument | `packages/sim/src/balance/sweep.ts` + the pure `packages/sim/src/balance/aggregate.ts` — **unchanged by this task.** The aggregator is the measuring device; moving it would have made before and after incomparable |
| **Before** | `docs/balance/baseline-tour-one.json`, `docs/balance/baseline-veteran.json` (T-1603a, committed, **not overwritten**) |
| **After** | `docs/balance/baseline-tour-one-1603b.json`, `docs/balance/baseline-veteran-1603b.json` |
| Raw rows | `.scratch/balance/rows-<label>-shard<i>of<N>.json` (gitignored) |

Exact commands, both arms as four concurrent shards, **same seeds, same horizons, same
fleet as T-1603a** — otherwise the diff would not be a diff:

```
npm run balance:sweep -w @spacerquest/sim -- --label tour-one-1603b --seeds 500 --days 35 --shard 1/4
# ...2/4, 3/4, 4/4...
npm run balance:sweep -w @spacerquest/sim -- --label tour-one-1603b --merge

npm run balance:sweep -w @spacerquest/sim -- --label veteran-1603b --seeds 100 --days 120 --shard 1/4
# ...2/4, 3/4, 4/4...
npm run balance:sweep -w @spacerquest/sim -- --label veteran-1603b --merge
```

Wall time: Tour One arm **5m32s**, veteran arm **8m58s** — within seconds of T-1603a's
5m30s / 8m35s, which is itself a small check that nothing structural changed.

Quantiles are nearest-rank, no interpolation, exactly as defined in
`BASELINE-T-1603a.md` § Method. Every median below is an actually-observed datum.

---

## 2. What moved and what did not

| constant (file) | before | after | | evidence | reader |
|---|---|---|---|---|---|
| `RENOWN_DEED_THRESHOLDS` (`content/deeds.ts`) | 0,1,2,3,5,7,9,12,15,30 | 0,1,5,9,13,17,21,26,31,38 | **MOVED** | §4 deed pacing; Flag 1 | `rankForDeedCount` → rank citation + Registry readout; `renownRankIndex` → `tier.ts` → matchmaking; `CROSSING_REQUIRED_RANK` |
| `PURCHASABLE_PORTS[].purchasePrice` (`content/ports.ts`) | flat 25,000 | 7,150 – 43,500 | **MOVED** | §5 (arithmetic; **not sweep-graded**) | `resolvePortPurchase` / `quotePort` → Port Ledger pane |
| `PURCHASABLE_PORTS[].baseDuskIncome` | flat 300 | 65 – 290 | **MOVED** | §5 | `portDuskIncome` (day.ts endDay); `eraPortIncomeMultiplier` |
| `DARE_MAX_WAGER` (`content/hangout.ts`) | 500 | 1,000 | **MOVED** | §5 | `planDare` (sim) + engine Dare resolver → Hangout pane |
| `SPECIAL_EQUIPMENT` ASTRAXIAL_HULL gate (`content/upgrades.ts`) | GIGA_HERO | TOP_DOG | **MOVED (fallout)** | §5 | `resolveShipyard` renown gate → shipyard pane |
| `CURRENT_SAVE_VERSION` (`engine/save.ts`) | 7 | 8 | **MOVED (migration)** | §5 | `loadSave` → the UI store's save/load |
| `ROUTE_DANGER_CHANCE` tiers 2/4/5 (`content/systems.ts`) | 0.35 / 0.50 / 0.60 | *unchanged* | **RATIFIED** | §3 | `calculateRouteDanger` → `generateEncounter` |
| `LOAN_DAILY_RATE`, `LOAN_TERM_DAYS`, `LOAN_MIN/MAX_PRINCIPAL`, `LOAN_DEFAULT_DISPOSITION`, `COLLECTION_ENCOUNTER_MULTIPLIER` (`content/lending.ts`) | — | *unchanged* | **RATIFIED** | §3 | borrow/repay resolver; day-loop accrual; `generateEncounter` default flag |
| `GUILD_DEBT_DAILY_RATE`, `GUILD_FLAG_ENCOUNTER_MULTIPLIER`, `GUILD_FLAG_MANIFEST_PENALTY`, `GUILD_PRESSURE_FLAG_WEIGHTS`, `GUILD_STANDING_NEUTRAL`, `GUILD_SEVERITY_STEP/MIN/MAX` (`content/guild.ts`) | — | *unchanged* | **RATIFIED** | §3 | `computeGuildStanding`; `rollContract`; `generateEncounter` |
| `DARE_MIN_WAGER` (`content/hangout.ts`) | 25 | *unchanged* | **RATIFIED** | §5 | as above |

**One change is fallout, not tuning**, and is marked as such: the ASTRAXIAL_HULL renown
gate. See §5.

---

## 3. The ratifications, with their evidence

### Danger tiers 2 / 4 / 5 — held at 0.35 / 0.50 / 0.60

First, a correction to a natural misreading: **these tiers are not dead lanes.**
`calculateRouteDanger` is `max(origin, destination) + distanceBump + cargoBump +
eraDelta`, clamped 1–5, so a core→core delivery lands on **tier 2 — the most-flown lane
class in the game** — and a rim run under an active contract lands on tier 4 or 5.

Nothing in either arm asked for a move:

| | before | after |
|---|---|---|
| encounters per 35-day run (fleet) | 5.19 | 5.22 |
| encounters per 120-day run (fleet) | 23.88 | 23.92 |
| `travelCompleted`, worst parity cell (Tour One) | 81.7% | 84.4% |
| fleet route EV median, cr/day | 1,630 | 1,650 |
| fleet top-route share | 1.3% | 1.3% |

The interpolation from the two foundation anchors (0.30 core / 0.40 rim,
`f2f95fa9:foundation/rules/constants.ts:187-188`) is **kept deliberately** and remains
the divergence rationale of record under Standing constraint 5; what T-1603b adds is
the measurement behind it. Tier 2 is documented at the definition site as the
designated counter-lever if a future change ever drops the trader's median clear day
toward the [22, 30] floor. **It was not needed** — see §4.

### Lending band — held

The Penny Wise desk over the Tour One arm (seeds 1..40 × 35 days × five policies; the
sweep aggregator does not carry `loanUsage`, so this is a separate cut of the same
drives and is labelled as such):

| policy | loans taken | principal | interest accrued | repaid | cleared | defaults | days carrying a loan |
|---|---|---|---|---|---|---|---|
| trader | 41 | 85,000 | 52,350 | 124,100 | 39 | 15 | 507 |
| smuggler | 42 | 81,762 | 50,819 | 131,573 | 41 | 13 | 518 |
| gambler | 45 | 82,365 | 28,975 | 109,559 | 43 | 3 | 321 |
| fighter | 0 | — | — | — | — | — | — |
| veteran | 0 | — | — | — | — | — | — |
| **all five** | **128** | **249,127** | **132,144** | **365,232** | **123** | **31** | **1,346** |

Read it as: 128 advances, **123 cleared** (96%), against 31 defaults along the way. The
band is steep — 132,144 credits of interest on 249,127 of principal, the ~53% the
0.05/dusk × 15-dusk term predicts — and it is **demonstrably clearable**. Defaults
happen and are then repaid, which is the consequence branch working, not a trap. The
rate is deliberately *not* softened: the trader's median clear day is already inside its
band, and easing lending would push it toward the floor.

### Guild bands — held

T-1601c's structural argument (the severity clamp means the reachable band is 0.5…1.6
and never touches MAX; the debt is a non-blocking ledger that never touches
`player.credits`) plus the fleet evidence T-1601c deferred:

| debt-cleared rate | day 35 | day 120 (before) | day 120 (after) |
|---|---|---|---|
| smuggler | 52.8% → 64.6% | 91.0% | 98.0% |
| gambler | 72.8% → 81.6% | 93.0% | 90.0% |
| trader | 83.2% → 86.2% | 86.0% | 94.0% |
| veteran | 0.2% | 14.0% | 33.0% |
| **fleet** | **37.1% → 40.7%** | **49.9%** | **54.0%** |

The unpaid marker is **a slope, not a wall**: most policies eventually walk up it, and
`veteran` — a policy built for the post-Tour-One game — more than doubles its eventual
clear rate. One consequence is now written down at the definition site rather than left
to be re-derived in a panic: 2%/dusk **compounding** turns an untouched 25,000 marker
into roughly 147,000 by day 120, which is exactly why Flag 7's `explorer` (the one
policy that never pays a credit) is permanently underwater. That is intended teeth on a
ledger that cannot soft-lock.

---

## 4. The graded criteria

### (a) Median trader debt-clear day ∈ [22, 30] — **PASS, and protected**

This criterion was **already passing at 23** before the task began. The work here was to
*keep* it there while the renown rescale moved the tier band underneath it. It held
exactly:

| policy | before | after | Δ |
|---|---|---|---|
| **trader (the graded row)** | **23** | **23** | **0** |
| gambler | 27 | 26 | −1 |
| fighter | 26 | 25 | −1 |
| smuggler | 28 | 28 | 0 |
| fleet | 26 | 25 | −1 |

*(Tour One arm, n = 431 cleared trader careers after. p25 20 → 20, p75 27 → 27 — the
whole distribution is stationary, not just its midpoint.)* The veteran arm reads 23 → 24
for the trader, still inside the band and within its coarser 100-seed resolution.

Clear **rates** rose across the fleet (trader 83.2% → 86.2%, smuggler 52.8% → 64.6%,
gambler 72.8% → 81.6%, fleet 37.1% → 40.7%). Tour One got kinder without getting
shorter — the tail of careers that *never* cleared shrank, while the day a competent
trader clears did not move. That is the intended shape.

### (b) No stable optimal route across the fleet — **PASS, by a wide margin, both arms**

| | Tour One before | Tour One after | veteran before | veteran after |
|---|---|---|---|---|
| legs | 58,726 | 59,979 | 33,757 | 35,239 |
| distinct routes | 397 | 396 | 394 | 395 |
| **top-route share** | **1.3%** | **1.3%** | **1.0%** | **1.1%** |
| T-107 `topShare` median | 0.143 | 0.143 | 0.110 | 0.110 |
| route EV median, cr/day | 1,630 | 1,650 | 1,560 | 1,608 |

**Fleet, five most-flown routes — Tour One after** (of 396 pairs)

| route | legs | share | delivered | median cr/day |
|---|---|---|---|---|
| 1→14 (Sun-3 → Vega-6) | 807 | 1.35% | 789 | 1,518 |
| 1→11 (Sun-3 → Regulus-6) | 804 | 1.34% | 789 | 1,528 |
| 1→9 (Sun-3 → Pollux-7) | 751 | 1.25% | 746 | 1,340 |
| 1→13 (Sun-3 → Spica-3) | 731 | 1.22% | 723 | 1,440 |
| 1→2 (Sun-3 → Aldebaran-1) | 678 | 1.13% | 665 | 1,170 |

**Fleet, five most-flown routes — veteran after** (post-era-flip)

| route | legs | share | delivered | median cr/day |
|---|---|---|---|---|
| 14→15 (Vega-6 → Antares-5) | 383 | 1.09% | 379 | 2,212 |
| 1→2 (Sun-3 → Aldebaran-1) | 330 | 0.94% | 327 | 1,100 |
| 8→9 (Mira-9 → Pollux-7) | 320 | 0.91% | 318 | 1,746 |
| 10→11 (Procyon-5 → Regulus-6) | 313 | 0.89% | 312 | 1,690 |
| 1→3 (Sun-3 → Altair-3) | 293 | 0.83% | 291 | 1,272 |

The Tour One arm's all-Sun-3 top five is a **start bias**, not a dominant route, and the
veteran arm proves it: once careers have had time to leave the home port the leader
becomes a non-home rim run, three of the top five no longer touch Sun-3 at all, and the
top share *falls*. Era churn is doing its job.

### (c) Deed pacing — **the real work of this task, and the criterion that actually moved**

T-1603a Flag 1 was blunt: the ladder was finished during the tutorial. 1,798 of 3,500
**thirty-five-day** careers ended at GIGA_HERO — rank 9 of 10 — and two smugglers
reached the CONQUEROR capstone before day 35.

**Renown at the 35-day horizon, fleet (n = 3,500)**

| | LIEUT | CMDR | CAPT | CMDRE | ADM | TOP DOG | G.MUFTI | MEGA | **GIGA** | **CONQ** |
|---|---|---|---|---|---|---|---|---|---|---|
| **before** | 0 | 1 | 101 | 3 | 310 | 215 | 291 | 779 | **1,798** | **2** |
| **after** | 0 | 101 | 526 | 505 | 985 | 736 | 493 | 154 | **0** | **0** |

**Renown at the 120-day horizon, fleet (n = 700)**

| | LIEUT | CMDR | CAPT | CMDRE | ADM | TOP DOG | G.MUFTI | MEGA | **GIGA** | **CONQ** |
|---|---|---|---|---|---|---|---|---|---|---|
| **before** | 0 | 0 | 17 | 1 | 34 | 36 | 59 | 70 | **475** | **8** |
| **after** | 0 | 17 | 69 | 71 | 122 | 123 | 199 | 97 | **2** | **0** |

Against the design targets stated at the threshold table's definition site:

| target | result |
|---|---|
| day-35 mode lands mid-ladder, not rank 9 | **ADMIRAL** (985/3,500 = 28%), rank 5 of 10 ✅ |
| day-120 mode lands at TOP_DOG–GRAND_MUFTI | **GRAND_MUFTI** (199/700 = 28%), rank 7 of 10 ✅ |
| < 10% of 35-day careers reach GIGA_HERO | **0.0%** (0 of 3,500) ✅ |
| zero reach CONQUEROR inside Tour One | **0** ✅ |
| CONQUEROR still reachable through play | seeds 1 and 6 of `deed-coverage.test.ts` each earn all 44 deeds, crossing on days 87 and 88 ✅ |
| the ladder still discriminates between policies | greedy tops out at CAPTAIN/COMMODORE; smuggler at GRAND_MUFTI/MEGA_HERO ✅ |

**The deed triggers were not touched, and the sweep proves it.** Deeds by day 30 is a
fleet median of 14 before *and* after; the 5th deed still lands on day 4; deeds per 100
days is 42.6 → 42.8. What changed is what a deed count *buys*.

**What this fixed and what it could not.** Only ~5 deeds separate the fleet's day-30
median (14) from its day-120 median (19) — four fifths of a 120-day career's deeds are
earned in its first quarter, because the authored slate saturates. **No threshold table
can make the ladder both slow at day 30 and still climbing at day 120 across a five-deed
gap.** The rescale buys the best available split (two ranks); the residue is a **deed
supply** problem — the slate has no late-career earnables — which is content authoring
and outside T-1603b's scope line. It is handed forward in §7 and recorded at the
definition site rather than tuned away.

---

## 5. Design calls, with rationale

### Renown thresholds: 0,1,**5,9,13,17,21,26,31,38**

- **COMMANDER held at 1 on purpose.** `RENOWN_RANKS.COMMANDER.citation` states the
  number in prose ("one deed on the board"), and prose cannot be re-derived at runtime.
  Holding it keeps that line true, keeps the first-deed promotion as a real early
  reward, and costs no string edit and no golden.
- **Spacing widens up the ladder** (4,4,4,4,4 then 5,5,7). The deed supply is dense
  early and saturating late, so equal spacing would have compressed the top.
- **CONQUEROR at 38 was sized off a measurement, not a feel.** The binding constraint is
  `deed-coverage.test.ts`, which requires two pinned seeds to reach the capstone
  *through play*. Both pinned seeds earn **all 44** authored deeds inside 300 days, so 38
  keeps **six deeds of headroom** below the binding total. Measured after: the capstone
  now arrives on days 87 and 88 rather than 53 and 47 — eight more deeds, about a month
  later, which is the rescale working.
- **The second-order effect was expected, is real, and is documented at the definition
  site.** `tier.ts` derives `player.tier` from `floor(renownRankIndex/2)+1`, and
  `player.tier` is the *only* input to encounter matchmaking. Slowing the ladder delays
  the player's power band — a median day-30 career now matches at tier 3, not tier 5.
  This is the intended direction (a tutorial graduate should not be dragging tier-5
  hunters) and it is why Tour One's clear *rates* rose. It also reshapes every
  combat/parity distribution; see §6.
- **A save migration was owed, and the first instinct was wrong.** The rescale adds and
  removes no `GameState` field, which reads like "no migration needed". But
  `registry.renownRank` is a *derived* value that happens to be persisted, and this
  change moved the rule that derives it — so every existing save carries a rank its deed
  count no longer buys. `deserializeState` recomputes the rank, but **`loadSave` does not
  go through it** (it runs `migrate` → `validateGameState`, and that is the path the
  shipped UI store takes). Left alone, a returning player's next deed would have driven
  `evaluateDeeds` from GIGA_HERO *down* to ADMIRAL and emitted that demotion as a
  `RenownRankUp` with a promotion citation on the wire. **`CURRENT_SAVE_VERSION` 7 → 8**,
  with a v7→v8 migration that recomputes the rank and resyncs the `player.tier` band
  derived from it — the first migration in this codebase that adds no field and instead
  repairs the meaning of two it finds. Recorded in `save.ts` as precedent: *a migration
  is owed whenever the rule behind a persisted derived value moves, not only when a key
  appears or disappears.*

### Port curve: from fourteen identical purchases to a real board

Two independent defects, only one of which is about choice:

1. **No decision.** Fourteen ports at 25,000 / 300 differ only by their `alliance` tag.
2. **Aggregate runaway.** 14 × 300 = **4,200 cr/dusk** against a measured fleet median
   route EV of **1,630 cr/day**. A rich veteran who bought the board out-earned *flying*
   by ~2.6×, forever, for zero further decisions — in a game whose veteran arm already
   shows the wealth brake missing.

**Derivation.** Canon defines the launch fee as income from other spacers *departing*
that system, so the income ordering is taken from measured traffic: T-1603a's preserved
raw rows (92,483 contract legs across both arms) folded by `originSystem`. **Honest
caveat, stated at the definition site too:** outside the home port that spread is under
±10%, which cannot by itself carry a purchase decision. So the fourteen are *banded* by
measured share and the bands are spaced wider than the raw traffic. **The ordering is
measured; the spacing is a design call.**

| systems | share of core departures | income | price | payback (dusks) |
|---|---|---|---|---|
| 1 Sun-3 | 14.3% | 290 | 43,500 | 150.0 |
| 11 Regulus-6 | 7.2% | 135 | 19,000 | 140.7 |
| 8, 9, 12 | 6.8% | 115 | 15,500 | 134.8 |
| 7, 4, 10 | 6.7% | 105 | 13,600 | 129.5 |
| 13, 5, 2 | 6.6% | 95 | 12,000 | 126.3 |
| 14 Vega-6 | 6.4% | 85 | 10,200 | 120.0 |
| 3 Altair-3 | 6.1% | 75 | 8,600 | 114.7 |
| 6 Denebola-5 | 5.9% | 65 | 7,150 | 110.0 |

Three invariants, all derivable from content and pinned by `engine/__tests__/port.test.ts`:

- **aggregate ceiling** — Σ income = **1,595 cr/dusk < 1,630**, the fleet median route
  EV. Owning the entire board (211,750 credits of capital) still earns less than flying;
- **payback window** — every port in **[110, 150] dusks**, up from a flat 83;
- **the hub pays a premium** — payback *rises* with traffic, so quiet ports are the value
  play and busy ones the absolute-income play. That is where the decision now lives.

**Why prices fell, stated plainly:** the ceiling fixes total income near 1,600/dusk
(~114 per port); a sane payback window then forces prices to roughly 7k–44k. There is
**no** table that keeps a 25,000 price, a ≥110-dusk payback, *and* a sub-1,630 board
total at fourteen ports. The ceiling addresses the measured defect, so it wins.

> **⚠️ THE ONE THING THIS SWEEP CANNOT GRADE.** *No sim policy buys a port.* There is no
> `Port` action in any shipped policy in `packages/sim/src/index.ts` — port buying exists
> only in a test-local driver (`campaign-reach.test.ts` `portBuyingVeteranPolicy`). So
> **the before/after distributions in §4 do not move for this change at all**, and no
> line of this memo should be read as sweep evidence for the port curve. It is graded by
> the three arithmetic invariants above and by the unit test that derives them, and its
> reachability is proven by `engine/__tests__/port.test.ts` and
> `campaign-reach.test.ts`. **"No policy exercises the port verb" is a genuine coverage
> hole**, flagged forward in §7; it is not T-1603b's to fill.

### Dare cap: 500 → 1,000, raised *and* measured

PRD §7.5 makes the Hangout a social venue and one of the bad day's three outs, not a
casino; a 500 cap against a 25,000 marker meant a mid-career captain could never put a
meaningful stake down. Both grading conditions were checked before shipping it:

- **`gambler` did not become the fastest debt-clear policy.** Median clear day stayed at
  25 on the tuning cut, above the trader's 23; clear rate moved 79% → 80%, inside
  sampling. **Tour One tables are bound by the *dealer's* purse, not by this ceiling**,
  which is why the raise barely touches the tutorial.
- **The veteran game is where it lands.** Seeds 1..10 × 120 days: the gambler plays the
  same **184** hands either way, but mean stake rises **405 → 697** credits — so the cap
  *was* binding late — while expected value per hand moves **+12.2 → −5.6**. Both are
  ~1% of stake in opposite directions: the Dare is a near-fair coin flip, and raising the
  ceiling changes the size of the swing, not its sign.

### ASTRAXIAL_HULL gate: GIGA_HERO → TOP_DOG — **fallout, not tuning**

A `requiredRenownRank` is a rank *name*, but what it costs a player is the **deed count**
behind that name, and the rescale changed every one of those counts. Old GIGA_HERO = 15
deeds; new TOP_DOG = 17. Leaving the gate at GIGA_HERO would have meant **31** deeds —
more than double the old cost — and would have made the game's deepest equipment
**structurally unreachable**: measured over seeds 1..20 of
`driveCompetentCampaign(veteranPolicy, seed, 500)`, the shipped veteran caps at **23**
earned deeds after five hundred days while banking 400k–565k credits. The money is
there; only the rank would block. So the gate was re-anchored to hold its real cost,
which is the same principle the rescale itself is built on. It remains the deepest gate
in the table — a property the T-114a test now asserts *derived from content* rather than
by naming a rank. STAR_BUSTER / ARCH_ANGEL keep `CAPTAIN`, a deliberate 2 → 5 deed
tightening; 5 deeds still lands in the first week for every competent policy.

---

## 6. Handed to T-1603c

**Read this first: T-1603c's baseline is the AFTER column of this memo, not
`BASELINE-T-1603a.md`.** The renown rescale moved `player.tier`, and `player.tier` is
the only input to encounter matchmaking, so the entire parity distribution shifted.

**Fleet combat by tier parity — Tour One arm, before → after**

| parity | prepared | n | mean EV | win rate | jump completed |
|---|---|---|---|---|---|
| below | no | 2,638 → **6,253** | −1,029 → −1,050 | 2.5% → 1.7% | 82.3% → 84.4% |
| below | yes | 1,254 → 1,355 | −858 → −714 | 73.4% → 77.0% | 84.9% → 85.4% |
| even | no | 7,362 → 5,345 | −1,084 → −946 | 1.1% → 2.2% | 81.7% → 87.9% |
| even | yes | 991 → 984 | −672 → −364 | 77.5% → 85.2% | 85.9% → 91.2% |
| above | no | 5,361 → 3,745 | −987 → −886 | 0.9% → 0.3% | 86.4% → 91.0% |
| above | yes | 563 → 576 | −380 → −338 | 79.2% → 82.3% | 87.4% → 88.9% |

**Fleet combat by tier parity — veteran arm, before → after**

| parity | prepared | n | mean EV | win rate | jump completed |
|---|---|---|---|---|---|
| below | no | 730 → **5,174** | −991 → −1,255 | 1.8% → 0.5% | 83.7% → 89.3% |
| below | yes | 938 → 1,712 | −585 → −561 | 90.1% → 88.9% | 95.5% → 95.1% |
| even | no | 7,118 → 4,521 | −1,261 → −1,127 | 0.3% → 0.5% | 88.2% → 92.8% |
| even | yes | 1,593 → 1,178 | −668 → −412 | 84.4% → 92.4% | 93.0% → 96.3% |
| above | no | 5,481 → 3,489 | −1,135 → −970 | 0.3% → 0.1% | 89.9% → 96.3% |
| above | yes | 857 → 668 | −478 → −324 | 88.4% → 93.7% | 94.5% → 96.3% |

The **encounter rate did not move** (5.19 → 5.22 per 35-day run; 23.88 → 23.92 per
120-day run). What moved is the **mix**: `below`-parity encounters roughly double in
Tour One and rise sevenfold in the veteran arm, because a lower-tier player is outranked
by more of the interceptor pool. Fleet mean combat EV improves −987 → −902 (Tour One) and
−1,073 → −994 (veteran).

**Survival — veteran arm, before → after**

| | before | after |
|---|---|---|
| ships lost | 18 | **10** |
| combat defeats | 1 | 1 |
| life-support failures | 17 | 9 |
| life-support scares | 22 | 13 |
| deaths / 1,000 sim days | 0.21 | **0.12** |

**Flags restated against the after numbers:**

- **Flag 2 (combat has no payout) — unchanged and unchangeable by tuning.**
  `resolveEncounter` still grants no credits under any resolution, so `combatEv ≤ 0`
  everywhere by construction and T-1603c's acceptance as written is true vacuously. It
  must be restated as a *comparison between cells* — the numbers to beat are the AFTER
  column above — or a payout must be introduced, which is a design change.
- **Flag 3 (preparation pays off backwards in Tour One) — improved, not fixed.** Prepared
  vs unprepared now saves 62% at `above` parity (−338 vs −886) and 32% at `below` (−714
  vs −1,050), against 61% / 17% before. The gun still helps you punish the weak more than
  it helps you survive the strong, but the gap has roughly halved.
- **Flag 4 (death rate) — got *harder*, and T-1603c must plan for it.** The rate fell
  0.21 → **0.12** per 1,000 sim days, because a lower-tier career takes less damage.
  Combat defeats are still **1 in 34,000+ encounters across both arms**. T-1603c's
  acceptance ("nonzero death rate across 1,200 sim days") would now expect **0.14 deaths**
  in 1,200 days — it would report zero the large majority of the time. **Either the
  denominator grows to ~30,000 sim days or the rate must move.** Do not let a flaky
  assertion into the suite.
- **Flag 5 (Auto-Repair switches off the life-support death path) — unchanged.** Still 9
  of 10 deaths from life support, still the path AUTO_REPAIR makes unreachable.
- **Flag 6 (`runCampaign` is quadratic in days) — unchanged.**
- **Flag 7 (`explorer` never pays the marker) — unchanged.** 500 careers, 25,000
  outstanding in every one, before and after.

**New, from this task:**

- **Wealth ran further up, not down.** Veteran-arm median final credits rose 33,107 →
  45,492 fleet-wide (fighter 90,620 → 115,838). The lower tier band means cheaper
  encounters, so the veteran game got *richer*. The port ceiling in §5 caps one source of
  runaway; the rest of the wealth curve is still unbraked and is worth someone's
  attention.
- **No shipped sim policy exercises the `Port` verb** (§5). Until one does, no sweep can
  grade port balance. This is a coverage hole in the instrument, not in the feature.
- **The deed slate saturates** (§4c). The ladder cannot be paced properly until the slate
  has late-career earnables. Content authoring, not tuning.

---

## 7. INTERIM marker inventory

**Replaced with a canonical-value comment** (each states the value, the evidence, the
date, the memo section, and re-names its readers):

| location | disposition |
|---|---|
| `content/systems.ts` — tier 2/4/5 block + three inline `(T-1603)` tags | ratified canonical §3 |
| `content/ports.ts` — file header + the `INTERIM (T-1603b)` flat-curve note | moved, canonical §5 |
| `content/lending.ts` — header + five `Interim (T-1603)` tags | ratified canonical §3 |
| `content/guild.ts` — header + seven `Interim (T-1603b)` tags | ratified canonical §3 |
| `content/deeds.ts` — the "T-1603 owns the threshold rescale" note, the CONQUEROR block, and the T-1504a `RECOMMENDED FOLLOW-UP` | discharged, canonical §4c/§5 |
| `content/hangout.ts` — the wager band (carried no marker) | given a canonical-value comment §5 |

**Fallout re-pins made in the same commit** (rebalance fallout rule — each carries its
own re-pin block naming the mechanism, and no assertion was widened, banded or dropped):
`deeds.test.ts` (three literal-threshold assertions replaced with derived invariants, plus
a new monotonicity + reachability guard), `encounter.test.ts` (the tier band now read from
`ROUTE_DANGER_CHANCE`), `tier.test.ts`, `shipyard.test.ts` (the renown-gate table derived
from `SPECIAL_EQUIPMENT`), `save.test.ts`, `port.test.ts` (new curve invariants),
`campaign-reach.test.ts` (three seeds), `alliance-arcs.test.ts`, `deed-coverage.test.ts`
(seed pair 1/7 → 1/6), `nemesis-fragments.test.ts` (a re-measured fragment id),
`ui/e2e/progression.spec.ts` (port constants derived from content),
`ui/e2e/nemesis-funnel.spec.ts` (seed 5 → 15), and both golden fixtures
(`day-loop-golden.ts`, `replay-golden.ts`).

**Every seed re-pin and every golden has the same single cause**, stated once here so the
diff is legible: the rescale changes how many `RenownRankUp`/`WireEntry` events a day
emits, and (a) rank drives `player.tier`, the only input to encounter matchmaking, while
(b) per-action rngs are forked on the **action event index**
(`dayRng.fork('action-<verb>-<index>')`, engine `day.ts`). Both session `rngState`s in
`replay-golden.ts` are **unchanged**, which is the standing proof that no determinism
regression hides inside that.

**Deliberately left in place**, each with a one-line reason:

| location | why it stays |
|---|---|
| `content/crew.ts` (wages) | names T-1603b as owner but is **not in this task's scope line** (danger tiers / ports / lending / guild / hangout wagers). Deferred rather than silently swept in; it needs its own measurement of the wage-vs-benefit trade, which no policy currently exercises well |
| `content/factions.ts`, `content/nemesis.ts`, `content/storylets.ts` | reputation / nemesis / narrative tuning — not economy or pacing |
| `engine/actions/travel.ts` `TOUR_ONE_ENCOUNTER_MULTIPLIER` | encounter *damping* is combat pacing — **T-1603c's** |
| `engine/economy.ts` `PAYMENT_CAP_PER_DANGER`, `RIM_DESTINATION_CHANCE`, `CONTRABAND_CONTRACT_CHANCE` | contract-generation shape rather than a price/income band; untouched so the route-diversity before/after stays a clean comparison |

---

## 8. Known limits

- **The port curve is ungraded by the sweep** (§5). Its evidence is arithmetic plus a
  unit test, and the memo says so rather than borrowing credibility from tables it did
  not move.
- **The port income ORDERING is measured; the SPACING is a design call** (§5). Measured
  traffic outside the home port varies by under ±10%.
- **The Tour One arm still cannot see the veteran loop**, and the veteran arm is still
  100 seeds with five-times-coarser quantiles. Both limits are inherited unchanged from
  `BASELINE-T-1603a.md § Known limits`, which applies to this memo in full.
- **Seven policies are not seven players.** Every distribution here bounds the *policy*
  space, not the player space.
- **The loan table in §3 is a separate 40-seed cut**, not a fold of the committed
  aggregates — `aggregate.ts` does not carry `loanUsage`, and extending the instrument
  mid-tuning would have broken the before/after comparison.
- **This is one machine and one node version.** Every campaign is seeded and
  deterministic, so the numbers reproduce exactly anywhere; only the wall-clock figures
  in §1 are machine-specific.

---

# Part C — Combat & Survival Tuning (T-1603c)

## 9. Provenance (Part C)

| | |
|---|---|
| Measured against | the T-1603c working tree, whose only diff from `7aa7b106` (T-1603b) is this task's own changes |
| Date | 2026-07-26 |
| Machine | Windows 10, 8 logical cores, 16 GB |
| Node | v22.16.0 |
| Instrument | `packages/sim/src/balance/sweep.ts` + the pure `packages/sim/src/balance/aggregate.ts` — **unchanged by this task, again.** No definition in the aggregator moved, no field was added to `CombatEncounterRecord`, and no bucket boundary was touched. That is what keeps Part B's after-column usable as Part C's before-column |
| **Before** | `docs/balance/baseline-tour-one-1603b.json`, `docs/balance/baseline-veteran-1603b.json` (Part B's after-arms, committed, **not overwritten**) |
| **After** | `docs/balance/baseline-tour-one-1603c.json`, `docs/balance/baseline-veteran-1603c.json` |
| Raw rows | `.scratch/balance/rows-<label>-shard<i>of<N>.json` (gitignored) |

Exact commands, both arms as four concurrent shards, **same seeds, same horizons, same
fleet as T-1603a and T-1603b**:

```
npm run balance:sweep -w @spacerquest/sim -- --label tour-one-1603c --seeds 500 --days 35 --shard 1/4
# ...2/4, 3/4, 4/4...
npm run balance:sweep -w @spacerquest/sim -- --label tour-one-1603c --merge

npm run balance:sweep -w @spacerquest/sim -- --label veteran-1603c --seeds 100 --days 120 --shard 1/4
# ...2/4, 3/4, 4/4...
npm run balance:sweep -w @spacerquest/sim -- --label veteran-1603c --merge
```

Wall time: Tour One arm **5m44s**, veteran arm **9m08s** — against Part B's 5m32s /
8m58s. Quantiles are nearest-rank, exactly as in `BASELINE-T-1603a.md § Method`.

**One thing to know before reading any number below.** Part C's *plan* assumed the
combat bill was dominated by repairs, so that damage levers would move it. It is not.
§11's line-item split shows tribute is ~95% of what an unprepared encounter costs and
repairs are ~1%. The plan's two levers were kept — they are what makes combat *lethal*
— and a third was added for what makes combat *expensive*. §12 records that correction
in full rather than presenting the final lever set as if it had been obvious.

---

## 10. What moved and what did not (Part C)

| constant (file) | before | after | | evidence | reader |
|---|---|---|---|---|---|
| `HULL_DAMAGE_WEIGHT` / `SYSTEM_DAMAGE_WEIGHT` (`content/components.ts`) | *did not exist* (uniform 1-in-8) | 4 : 1 | **MOVED (new)** | §11 survival; §12 | engine `combat.ts` `damageComponentForHit` → `applyEnemyPressure` |
| `TIER_GAP_DAMAGE_BONUS` (`content/combat.ts`) | *did not exist* | 1 | **MOVED (new)** | §11 survival; §12 | engine `combat.ts` `applyEnemyPressure` |
| `TRIBUTE_TIER_GAP_STEP` (`content/combat.ts`) | *did not exist* | 0.75 | **MOVED (new)** | §11 combat grid; §12 | engine `combat.ts` `tributeForRound` → `resolveTalk`; UI `format.ts` `tributeThisRound` (client) |
| AUTO_REPAIR dusk ordering (`engine/day.ts`) | regen **before** the life-support gate | regen **after** it | **MOVED (design call)** | §12; §13 Flag 5 | `endDay`; covered by `engine/__tests__/components.test.ts` |
| `BIG_HIT_MARGIN` (`content/combat.ts`) | hard-coded `10` in `engine/combat.ts` | `10` in content | **MOVED (location only)** | constraint 4 | engine `combat.ts` `applyEnemyPressure` |
| `TOUR_ONE_ENCOUNTER_MULTIPLIER` (`content/combat.ts`) | `0.5`, INTERIM, in `engine/travel.ts` | `0.5`, canonical, in content | **MOVED (location) + RATIFIED** | §12 | engine `travel.ts` `generateEncounter` |
| `LIFE_SUPPORT_SURVIVAL_DC` (`content/components.ts`) | 10 | *unchanged* | **RATIFIED** | §13 Flag 5 | `lifeSupportCritical` gate + `day.ts` |
| `AUTO_REPAIR_REGEN` (`content/components.ts`) | 1 | *unchanged* | **RATIFIED (magnitude)** | §12 | `autoRepairRegen` → `day.ts` `endDay` |
| `RUN_FUEL_COST` / `FIGHT_FUEL_COST` (`content/combat.ts`) | 10 / 50 | *unchanged* | **RATIFIED** | §11 line-item split | engine `combat.ts` `resolveCombat` |
| `TRIBUTE_BASE_MULTIPLIER` / `TRIBUTE_MAX` (`content/combat.ts`) | 1,000 / 10,000 | *unchanged* | **RATIFIED** | §11 line-item split | `tributeForRound` → UI preview |
| `TRIBUTE_CLASS_MULTIPLIER` (`content/combat.ts`) | Brigand ÷2, Reptiloid ×2 | *unchanged* | **RATIFIED** | §12 | `tributeForRound` |
| `RETREAT_KILL_EDGE` (`content/combat.ts`) | 15 | *unchanged* | **RATIFIED** | §11 win rates | engine `combat.ts` post-kill retreat |
| `WEAPON_DAMAGE_DIVISOR` (`content/components.ts`) | 20 | *unchanged* | **RATIFIED** | §12 | `weaponVolleyDamage` → combat fight branch; **and the sweep's `prepared` axis** |
| `SHIELD_MITIGATION_DIVISOR` (`content/components.ts`) | 15 | *unchanged* | **RATIFIED** | §12 | `shieldMitigation` → `applyEnemyPressure` |
| `STAR_BUSTER_VOLLEY_BONUS` (`content/components.ts`) | 2 | *unchanged* | **RATIFIED** | §10 note | `weaponVolleyDamage` |
| `ARCH_ANGEL_MITIGATION_FLOOR` (`content/components.ts`) | 2 | *unchanged* | **RATIFIED (invariant re-derived)** | §12 | `shieldMitigation` |
| `CLOAK_ENCOUNTER_MULTIPLIER` (`content/components.ts`) | 0.4 | *unchanged* | **RATIFIED** | §10 note | engine `travel.ts` `generateEncounter` |
| smuggler policy: stranded-recovery drive refit (`sim/src/index.ts`) | *did not exist* | added | **MOVED (fallout)** | §12 | the poverty-trap invariant in `campaign-smuggler-gambler.test.ts` |

**No `GameState` field was added, removed or re-derived by this task**, so there is
**no save migration and no round-trip test** — and that is a deliberate statement, not
an omission. Every input the new rules read (`player.tier`, `interceptor.tier`, each
component's `condition`, `hasAutoRepair`) already existed and was already persisted or
derived. `CURRENT_SAVE_VERSION` is untouched at 8.

Two module ratifications are worth a sentence each, because both got *better* without
their numbers moving. **STAR_BUSTER** shortens fights, and a shorter fight is worth
strictly more now that each landed enemy hit is likelier to be a hull hit.
**CLOAKER** avoids interdictions, and an avoided interdiction is worth more now that an
interdiction costs more. Neither needed a number; both were re-checked and left.

---

## 11. The graded criteria

### 11a. The line-item split — where combat's money actually goes

This is the measurement that reshaped the task, so it comes first. Mean credits per
encounter, by line item, folded from the preserved raw rows of both Tour One arms
(18,125 encounters after / 18,258 before):

| cell | fuel | repair | tribute | fine | succession | **total** | rounds |
|---|---|---|---|---|---|---|---|
| below / unprepared | 26 → 28 | 7 → 11 | **1,005 → 1,589** | 12 → 9 | 0 → 7 | 1,050 → **1,645** | 2.26 → 2.38 |
| below / prepared | 592 → 604 | 14 → 45 | 108 → 120 | 0 → 0 | 0 → 29 | 714 → **798** | 3.42 → 3.48 |
| even / unprepared | 14 → 15 | 6 → 5 | 915 → 912 | 11 → 12 | 0 → 0 | 946 → **943** | 2.17 → 2.18 |
| even / prepared | 308 → 307 | 6 → 6 | 50 → 49 | 0 → 0 | 0 → 3 | 364 → **365** | 2.15 → 2.13 |
| above / unprepared | 4 → 4 | 5 → 4 | 865 → 868 | 12 → 12 | 0 → 0 | 886 → **887** | 2.01 → 2.00 |
| above / prepared | 272 → 271 | 4 → 4 | 61 → 57 | 0 → 0 | 0 → 0 | 338 → **333** | 1.99 → 1.99 |

Read it as: **an unprepared spacer talks and pays; a prepared one fights and burns
fuel.** Tribute is 96% of the unprepared bill and fuel is 76% of the prepared one.
Repairs are noise in both — sim policies buy repairs only when crippled — which is why
a damage lever cannot move this table and a tribute lever can. Note also what did NOT
move: the `even` and `above` rows are within 1% of Part B end to end. The tier-gap
levers are one-sided by construction, so they are visible only in the `below` rows.

### 11b. Combat by tier parity × preparation — Tour One arm (3,500 careers, 35 days)

| parity | prepared | n | mean EV | median EV | win rate | ship-lost rate | jump completed |
|---|---|---|---|---|---|---|---|
| below | no | 6,253 → 6,097 | −1,050 → **−1,645** | −950 → −1,400 | 1.7% → 1.7% | 0.00% → **0.54%** | 84.4% → 80.6% |
| below | yes | 1,355 → 1,352 | −714 → **−798** | −560 → −631 | 77.0% → 75.4% | 0.00% → **1.48%** | 85.4% → 83.3% |
| even | no | 5,345 → 5,301 | −946 → −943 | −851 → −850 | 2.2% → 2.2% | 0.00% → 0.04% | 87.9% → 87.2% |
| even | yes | 984 → 967 | −364 → −365 | −300 → −300 | 85.2% → 85.6% | 0.00% → 0.21% | 91.2% → 91.3% |
| above | no | 3,745 → 3,851 | −886 → −887 | −900 → −950 | 0.3% → 0.3% | 0.00% → 0.00% | 91.0% → 91.0% |
| above | yes | 576 → 557 | −338 → −333 | −251 → −251 | 82.3% → 82.8% | 0.00% → 0.00% | 88.9% → 89.0% |

| graded quantity | before | after | target | |
|---|---|---|---|---|
| `below/no` is the strictly worst cell | yes | **yes** | required | ✅ |
| parity monotonicity, unprepared (`below` > `even` > `above` cost) | yes | **yes** | required | ✅ |
| below/above unprepared cost ratio | 1.186× | **1.854×** | ≥ 1.4× | ✅ |
| preparation saving at `below` parity | 32.0% | **51.5%** | ≥ 50% | ✅ |
| preparation saving at `above` parity | 61.9% | 62.5% | — | — |
| full ordering `below/no` > `below/yes` > `above/yes` | yes | **yes** | required | ✅ |
| `shipLostRate`, `below`/unprepared | 0.00% | **0.54%** | > 0 | ✅ |
| encounters per run (rate must not move) | 5.22 | 5.18 | unchanged | ✅ |

### 11c. Combat by tier parity × preparation — veteran arm (700 careers, 120 days)

| parity | prepared | n | mean EV | median EV | win rate | ship-lost rate | jump completed |
|---|---|---|---|---|---|---|---|
| below | no | 5,174 → 5,382 | −1,255 → **−2,008** | −1,410 → −2,450 | 0.5% → 0.4% | 0.02% → **0.54%** | 89.3% → 86.7% |
| below | yes | 1,712 → 1,731 | −561 → **−674** | −400 → −400 | 88.9% → 86.4% | 0.00% → **0.75%** | 95.1% → 92.7% |
| even | no | 4,521 → 4,301 | −1,127 → −1,089 | −1,300 → −1,299 | 0.5% → 0.6% | 0.00% → 0.12% | 92.8% → 91.0% |
| even | yes | 1,178 → 1,166 | −412 → −423 | −400 → −400 | 92.4% → 91.3% | 0.00% → 0.51% | 96.3% → 95.9% |
| above | no | 3,489 → 3,596 | −970 → −971 | −950 → −1,001 | 0.1% → 0.1% | 0.00% → 0.11% | 96.3% → 95.4% |
| above | yes | 668 → 689 | −324 → −348 | −250 → −250 | 93.7% → 93.2% | 0.00% → 0.15% | 96.3% → 95.9% |

| graded quantity | before | after | target | |
|---|---|---|---|---|
| below/above unprepared cost ratio | 1.293× | **2.068×** | ≥ 1.4× | ✅ |
| preparation saving at `below` parity | 55.3% | **66.4%** | ≥ 50% | ✅ |
| preparation saving at `above` parity | 66.6% | 64.1% | — | — |
| ...and the Flag 3 comparison: does the gun help MORE when outgunned? | no (55.3 < 66.6) | **yes (66.4 > 64.1)** | at least one arm | ✅ |
| `shipLostRate`, `below`/unprepared | 0.02% | **0.54%** | > 0 | ✅ |
| encounters per run (rate must not move) | 23.92 | 24.09 | unchanged | ✅ |

### 11d. Survival — Tour One arm

| policy | ships lost | combat defeats | LS failures | LS scares | deaths / 1,000 days | careers with a death |
|---|---|---|---|---|---|---|
| trader | 0 → 2 | 0 → 1 | 0 → 1 | 0 → 1 | 0.00 → 0.11 | 0.0% → 0.4% |
| fighter | 0 → 15 | 0 → 15 | 0 → 0 | 0 → 0 | 0.00 → 0.86 | 0.0% → 3.0% |
| explorer | 0 → 4 | 0 → 3 | 0 → 1 | 0 → 1 | 0.00 → 0.23 | 0.0% → 0.8% |
| veteran | 0 → 20 | 0 → 20 | 0 → 0 | 0 → 0 | 0.00 → 1.14 | 0.0% → 4.0% |
| smuggler | 0 → 7 | 0 → 7 | 0 → 0 | 0 → 0 | 0.00 → 0.40 | 0.0% → 1.4% |
| gambler | 0 → 1 | 0 → 1 | 0 → 0 | 0 → 0 | 0.00 → 0.06 | 0.0% → 0.2% |
| greedy | 0 → 10 | 0 → 10 | 0 → 0 | 0 → 0 | 0.00 → 0.57 | 0.0% → 2.0% |
| **fleet** | **0 → 59** | **0 → 57** | 0 → 2 | 0 → 2 | **0.00 → 0.48** | **0.0% → 1.7%** |

### 11e. Survival — veteran arm

| policy | ships lost | combat defeats | LS failures | LS scares | deaths / 1,000 days | careers with a death |
|---|---|---|---|---|---|---|
| trader | 2 → 1 | 0 → 1 | 2 → 0 | 5 → 0 | 0.17 → 0.08 | 2.0% → 1.0% |
| fighter | **0 → 13** | 0 → 13 | 0 → 0 | 0 → 0 | **0.00 → 1.08** | **0.0% → 11.0%** |
| explorer | 5 → 7 | 0 → 4 | 5 → 3 | 6 → 7 | 0.42 → 0.58 | 5.0% → 7.0% |
| veteran | 0 → 11 | 0 → 10 | 0 → 1 | 0 → 1 | 0.00 → 0.92 | 0.0% → 9.0% |
| smuggler | 1 → 18 | 0 → 15 | 1 → 3 | 0 → 4 | 0.08 → 1.50 | 1.0% → 16.0% |
| gambler | 1 → 6 | 0 → 5 | 1 → 1 | 2 → 0 | 0.08 → 0.50 | 1.0% → 5.0% |
| greedy | 1 → 10 | 1 → 10 | 0 → 0 | 0 → 0 | 0.08 → 0.83 | 1.0% → 9.0% |
| **fleet** | **10 → 66** | **1 → 58** | 9 → 8 | 13 → 12 | **0.12 → 0.79** | **1.4% → 8.3%** |

Against the target bands the plan proposed for this arm:

| target | before | after | band | |
|---|---|---|---|---|
| fleet deaths / 1,000 sim days | 0.12 | **0.79** | 0.8 – 4.0 | ~ (0.01 short; see below) |
| 120-day careers with ≥ 1 succession | 1.4% | **8.3%** | 10% – 40% | ~ (1.7 points short) |
| combat defeats as a share of all deaths | 10% (1 of 10) | **88% (58 of 66)** | ≥ 15% | ✅ |
| `fighter` deaths in 12,000 veteran-arm days | **0** | **13** | > 0 | ✅ |
| life-support path still reachable | 9 failures | **8 failures, 12 scares** | > 0 | ✅ |

The first two land a hair under their proposed bands and are reported that way rather
than rounded into them. The rate is 0.79 against a floor of 0.80 — a difference of two
thousandths of a death per career, i.e. inside the noise of a 100-seed arm — and both
were deliberately not chased further: the next increment of lethality available was
`TRIBUTE_TIER_GAP_STEP = 1.00`, which §12c shows costs eight points of the trader's
Tour One clear rate for it. A 6.6× increase in the death rate and a 6× increase in the
share of careers that end in a succession is the change that was asked for; the last
1% of it is not worth the guard rail.

**The wealth curve moved too, and downward for the first time.** Part B's §6 recorded
"wealth ran further up, not down" as an open concern (fleet median final credits rose
33,107 → 45,492). Part C reverses it: **45,492 → 25,903** fleet-wide, trader
76,978 → 65,427, smuggler 50,710 → 33,051. Combat is now a real running cost of a
veteran career rather than a rounding error. This was not a target and is recorded as
an observed consequence, not a claim of success — a future pass may find it has gone
too far.

### 11f. The T-1603b guard rails, which were not allowed to move

`packages/sim/src/__tests__/balance-targets.test.ts` is green **unmodified**. On the
committed Tour One arm:

| | before | after | Part B's band |
|---|---|---|---|
| trader median debt-clear day | 23 | **24** | [22, 30] |
| trader debt-cleared rate | 86.2% | 79.0% | — (non-degeneracy floor 50%) |
| fleet top-route share | 1.35% | 1.34% | ≤ 5% |
| smuggler median clear day | 28 | 28 | ≥ trader's |
| gambler median clear day | 26 | 26 | ≥ trader's |

The clear-RATE drop is real and is recorded rather than buried: tribute is now more
expensive for an outranked spacer, and Tour One is where every spacer is outranked. It
is inside the band Part B guarded (the *median day*, which is what "clearable by
competent play in 25–30 days" means), and it is the price paid for the parity axis
existing at all. `TRIBUTE_TIER_GAP_STEP`'s own comment records the 0.50 / 0.75 / 1.00
sweep behind choosing the smallest step that clears the criteria.

### 11g. The committed, pinned proof

`packages/sim/src/__tests__/balance-combat-survival.test.ts` — seeds 1..15 ×
{fighter, smuggler, veteran, explorer} × 60 days = **3,600 sim days**, three times the
acceptance's 1,200. Measured there at authoring time: **7 ships lost (1.94 per 1,000
sim days), all 7 combat defeats, 10.0% of careers**; below/above unprepared cost ratio
**2.321×**; preparation saving **63.1%** at `below` against 55.7% at `above` — on that
slice the gun is now worth *more* when outgunned than when outranking, which is
`BASELINE-T-1603a.md` Flag 3 inverted rather than merely narrowed.

---

## 12. Design calls, with rationale

### 12a. Auto-Repair — **RETUNED, not ratified** *(the named acceptance item)*

**The call: the AUTO_REPAIR dusk regen was MOVED to run AFTER the life-support survival
gate in `engine/day.ts`, where it previously ran before it.**

The T-1804 audit flagged, and T-1804's own comment in `day.ts` *ratified*, that a
fitted Auto-Repair healed `lifeSupport` 0→1 before the dusk `lifeSupportCritical` gate
could fire — making the entire life-support death path **structurally unreachable** for
any ship carrying the module. That is not a strong module. It is a switch that turns a
death path off, and life support was **9 of 10 deaths** in the T-1603a veteran arm. The
evidence that it mattered is Flag 5's: `fighter`, the only shipped policy that buys the
module early, posted **zero deaths and zero life-support scares in 12,000 simulated
days** — not because it played well, but because it had bought immunity for 25,000
credits.

PRD-REIMAGINED line 85 asks that death be "a real loss, not a soft reset … a decision
you dread rather than shrug off." A module that removes the dread for anyone who can
afford it is the opposite of that.

**Foundation fidelity is intact.** Foundation's `applyAutoRepair` patches every fitted
system, life support included, and it still does. What changed is *when*: the module
now repairs life support **after** the dusk roll instead of before it, so a critical
life support costs a fitted spacer exactly **one GRIT save** instead of nothing at all.
On a survived roll the 0→1 regen still fires, so they are not re-rolled the next dusk —
that is the module's remaining, real, legible benefit. **Auto-Repair turns a death
spiral into a single roll; it no longer switches the death path off.**

Three mechanics were checked rather than assumed, and all three are asserted in
`engine/__tests__/components.test.ts` (which now proves the retuned contract over a
50-seed scan, replacing the test that asserted the old one):

1. with the module fitted and life support at 0, the gate **fires on every seed**;
2. **both branches are reachable** — some seeds survive, some are lost;
3. on a failed roll `applySuccession` has already reset the ship to `starterShip()`, so
   `hasAutoRepair` is false and life support is back at 9 — the regen block naturally
   no-ops on the successor rather than handing them a free repair. Asserted, not
   defended with a redundant guard.

The `day.ts` comment block that recorded the T-1804 ratification was **rewritten in
full**, not edited: leaving a comment that asserts the opposite ordering as settled
would have been an undocumented divergence.

**Honest limit.** This call is graded by the engine test above and by `fighter` no
longer being death-proof (it loses ships in both the Tour One arm — 15 — and the pinned
slice — 1). It is *not* strongly graded by the life-support death count, because the
other two levers moved the fleet's dominant death path from life-support attrition to
combat defeat: LS failures are 2 of 59 fleet deaths in the Tour One arm. The path is
reachable and no longer switchable-off, which is what the call was about; it is simply
no longer the common way to die. Recorded in §14 as a known limit.

### 12b. No combat payout — **deliberately not added**

`resolveEncounter` grants no credits under any resolution, so `combatEv` is `−combatCost`
in every cell and "combat EV is negative below tier parity unprepared" is true *by
construction*. It would have been easy to make that criterion non-vacuous by adding a
bounty or wreck salvage. **That was not done**, for two reasons, and the criterion was
regraded as a comparison *between* cells instead (§11b):

- PRD-REIMAGINED §7.4's combat vignette ends "*Nobody died; the story compounds
  instead*" — combat's payoff in this game is narrative and positional (a grudge, a
  reputation, a lane held), not monetary;
- PRD line 223 lists **salvage** among what survives from the original, and salvage
  belongs to **exploration** — the only salvage table in the game. A combat bounty
  would be a second one.

Adding a payout is a *design* change requiring a PRD reading, not a tuning change.
T-1603c is a tuning task, so it declined.

### 12c. The lever set, and the correction that produced it

Part C's plan proposed two levers — hull-weighted damage targeting and a tier-gap
damage bonus — and predicted they would serve all three criteria, on the reasoning that
below-parity repair bills would roughly double.

**They do not, and the plan's reasoning was wrong on a fact.** §11a shows repairs are
~1% of an encounter's cost. Doubling the damage doubles about ten credits. Both levers
were kept and both do exactly what they should — they are what makes combat **lethal**,
and they moved the fleet death rate from a flat zero — but neither can move the credit
table. That required a third lever, `TRIBUTE_TIER_GAP_STEP`, on the term that is 96% of
the bill.

Each magnitude was chosen against a measured sweep, not picked:

- **`HULL_DAMAGE_WEIGHT = 4`** (hull share 4/11 = 36%, each system 9.1%). Driven at
  w = 3 / 4 / 5 through the same 105-run / 6,300-sim-day cut: 3 gives 0.63 deaths per
  1,000 days and zero life-support events anywhere; 4 gives 0.95 and re-opens the
  life-support gate; 5 gives 0.79 *and* drops preparation's payoff back under 50%,
  because past that point the hull dies faster than a refit can matter. 4 is the
  interior value. No component is removed from the table.
- **`TIER_GAP_DAMAGE_BONUS = 1`**. The matchmaker bands interceptors to
  [playerTier−1, playerTier+1], so this is a ×2 lever on the base hit and never more.
  At 2 it is *worse* on both graded measures (spread 1.31× vs 1.47×, preparation saving
  47% vs 53%) — counter-intuitive enough to record: at raw 3 an ordinary below-parity
  hit already carries nat-20 severity, saturating the `MAX_SHIELD_MITIGATION` cap of 2,
  so a refit can no longer buy back a proportional share and the lever stops
  discriminating exactly where it should discriminate hardest.
- **`TRIBUTE_TIER_GAP_STEP = 0.75`**. Three steps through the same 420-run /
  14,700-sim-day cut:

  | step | below/above unprepared cost ratio | preparation saving at `below` | trader clear rate |
  |---|---|---|---|
  | 0.50 | 1.76× | 48.9% | 83% |
  | **0.75** | **2.03×** | **54.7%** | **75%** |
  | 1.00 | 2.24× | 58.2% | 73% |

  0.75 is the **smallest** step that clears both graded targets. 0.50 leaves the
  preparation criterion a point and a half short; 1.00 buys three more points of it for
  another eight points of the trader's Tour One clear rate, which is a bad trade,
  because a tuning pass tunes **inside** the previous pass's guard rails.

**Why the tribute lever is also the right rule, not merely the effective one.** An
interceptor that outranks its mark knows it and prices accordingly. The game already
expresses exactly this idea through `TRIBUTE_CLASS_MULTIPLIER` — a Reptiloid doubles, a
Brigand halves, a foundation restore. This is that idea keyed to the *matchup* instead
of the species. It is deliberately **one-sided**: an interceptor the player outranks
does **not** discount, because a discount would pay the player for being strong, and
the fleet's wealth curve is already unbraked (§6).

**Reachability, both ways.** The engine owns the rule (`tributeForRound`); the cockpit
is a **client** of it. `format.ts` `tributeThisRound` and `App.tsx` now forward the tier
gap for exactly the reason T-1402 forwarded the class modifier — a preview that dropped
it would quote a number the engine never charges.

### 12d. `TOUR_ONE_ENCOUNTER_MULTIPLIER` — **moved to content, RATIFIED at 0.5**

The T-1103 INTERIM marker handed to Part C (§7) is discharged. The constant moved from
`engine/travel.ts` to `content/combat.ts` because a balance number is data, and its
value is ratified where it stands: the Part C levers make a Tour One fight materially
more dangerous *and* more expensive, and this damping is the counterweight that keeps
the guarded trader band intact. `generateEncounter` remains the named reader, riding on
`state.era`; no new state field.

**The honest tension, recorded rather than fixed.** PRD-REIMAGINED §"Tour One" (line 73)
authors the onboarding arc around exactly **one** full combat, while the measured Tour
One arm sees **5.18** encounters per 35-day career. 0.5 is already a compromise between
the authored beat and foundation's 0.30/0.40 table. Closing that gap properly is an
encounter-*authoring* question — which jumps are supposed to be dangerous — not a
multiplier, and it is not Part C's.

### 12e. The smuggler's stranded-recovery refit — **fallout, not tuning**

Making death reachable made a previously-unreachable policy corner reachable, and it is
marked as fallout rather than folded in silently. Succession claims the successor's
licence *where the wreck was towed in* (`legacy.ts`), which for the smuggler is a rim
port, and hands them a fresh junker. On junker drives every leg off a rim port costs
12 fuel per unit of distance, so `net = payment − fuel × price` is negative across the
whole board, no contract is signable, and the day plans nothing. Seed 2 idled **66
consecutive days** against the invariant's bar of 5.

The fix is one narrow branch in `smugglerPolicy`, and the measurement that justifies it
is blunt: at the rim port where the strand happens, `quoteShipyard` prices the tier-3
drive refit at **0 credits** (the strength-10 trade-in covers the sticker) and the
policy refuses it over a 1,500-credit floor it will never reach again. The branch fires
**only** on a day that produced no income action at all and **only** when the quote is
covered by the purse, so no working day changes — verified: seeds 1 and 3 of the
invariant sweep are bit-identical before and after, and seed 2's streak falls 66 → 2.
This is a policy fix (the instrument was refusing a free upgrade), not a game-data
change.

---

## 13. Flag disposition

| flag | status | after-numbers |
|---|---|---|
| **Flag 2 — combat has no payout** | **CLOSED as unchangeable-by-tuning, and regraded** | Still no payout, deliberately (§12b). The criterion is now graded as a comparison between cells: `below/no` is the strictly worst cell at **1.854×** the `above/no` cost (was 1.186×) |
| **Flag 3 — preparation pays off backwards** | **CLOSED** | Preparation saving at `below` parity **32.0% → 51.5%** on the Tour One arm and **63.1%** on the pinned slice, where it now *exceeds* the `above`-parity saving (55.7%). The plan asked for ≥50% and for it to beat the `above` saving in at least one arm; both hold |
| **Flag 4 — death rate** | **CLOSED** | Tour One arm **0 → 59 ships lost, 0.48 per 1,000 sim days**, 1.7% of careers; veteran arm **10 → 66 ships lost, 0.12 → 0.79 per 1,000 sim days**, 1.4% → 8.3% of careers. Combat defeats are **57 of 59** fleet deaths (was 1 in 34,000+ encounters). The committed assertion runs over 3,600 sim days — 3× the acceptance's denominator — with 7 deaths, so it is not marginal |
| **Flag 5 — Auto-Repair switches the death path off** | **CLOSED** | Retuned, not ratified (§12a). The gate now fires for every module-fitted ship on every seed, both branches reachable, and `fighter` loses ships in both the Tour One arm (15) and the pinned slice (1) |
| **Flag 6 — `runCampaign` is quadratic in days** | **UNCHANGED — not Part C's.** Owner: T-1605c | Unmoved; it is why the veteran arm is 100 seeds |
| **Flag 7 — `explorer` never pays the marker** | **UNCHANGED — not Part C's.** No owner yet | 500 careers, 25,000 outstanding in every one, before and after |

---

## 14. Known limits, and the finalization note

- **The life-support death path is reachable but no longer common.** §12a's call
  removed the structural immunity; the targeting levers then moved the fleet's dominant
  death from life-support attrition to combat defeat (LS is 2 of 59 Tour One deaths).
  Both facts are true and both are recorded. A future pass that wants life support to
  matter again should look at repair pricing, not at the gate.
- **Repairs are ~1% of combat's cost** (§11a) because no shipped sim policy buys
  repairs except when crippled. That makes every damage-side lever ungradeable *in
  credits* by this instrument. It is a coverage hole in the policies, not in the game —
  a sibling of Part B's "no policy exercises the `Port` verb" — and it is what a future
  repair-economy pass has to fix first.
- **The `prepared` axis is a WEAPONS measurement** (`weaponVolleyDamage > 1`), not a
  shields one. So "preparation" in every table above means "bought a better gun". The
  T-1603c damage levers land on shields, and their effect on that axis is therefore
  indirect. `WEAPON_DAMAGE_DIVISOR` was ratified rather than moved specifically to keep
  the axis stable across the before/after comparison.
- **Deaths are not evenly distributed across policies**, and the spread is itself a
  finding: `veteran` (1.14 per 1,000 days) and `fighter` (0.86) die an order of
  magnitude more than `trader` (0.11) or `gambler` (0.06). Poverty kills — the policies
  that cannot afford to repair or to refit are the ones that lose ships.
- **Every limit inherited from Part B and from `BASELINE-T-1603a.md § Known limits`
  still applies in full**: seven policies are not seven players; the veteran arm is 100
  seeds with five-times-coarser quantiles; this is one machine and one Node version
  (every campaign is seeded, so only the wall-clock figures reproduce differently).

**Finalization.** Part C is landed and **this document is final.** The Part C entries in
§7's INTERIM inventory are discharged as follows:

| §7 entry | disposition |
|---|---|
| `engine/actions/travel.ts` `TOUR_ONE_ENCOUNTER_MULTIPLIER` — "encounter damping is combat pacing — T-1603c's" | **discharged**: moved to `content/combat.ts`, ratified at 0.5 with a canonical-value comment (§12d) |
| `content/crew.ts` (wages) | **still deferred** — not combat or survival, and no policy exercises the wage-vs-benefit trade. Carried forward to whichever task owns crew balance |
| `content/factions.ts`, `content/nemesis.ts`, `content/storylets.ts` | **still deferred** — reputation / nemesis / narrative tuning, neither economy, pacing, combat nor survival |
| `engine/economy.ts` `PAYMENT_CAP_PER_DANGER`, `RIM_DESTINATION_CHANCE`, `CONTRABAND_CONTRACT_CHANCE` | **still deferred** — contract-generation shape; untouched by Part C for the same reason Part B left them, so the route-diversity comparison stays clean |

Every other combat and survival constant in `content/combat.ts` and
`content/components.ts` now carries a canonical-value comment naming its value, its
evidence, its date, this memo's section, and its reader.
