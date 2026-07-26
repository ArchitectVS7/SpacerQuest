# Economy & Pacing Tuning — T-1603 (Part B)

**This is the tuning memo. `BASELINE-T-1603a.md` is the measurement it tunes against**
— that document opens by declaring that it moved no number, so this one exists rather
than appending to it. Part B (T-1603b) covers economy and pacing; **Part C (T-1603c)
appends combat and survival to this same file and finalizes it.**

Two things this memo tries hard to do. First, **ratifications are first-class**: a
constant measured across 4,200 careers and deliberately left where it stands is a
canonical value, and §2 lists it as such rather than omitting it. Second, it is
**explicit about what could not be measured** — §5 names one change the sweep is
structurally incapable of grading, and says so rather than dressing an arithmetic
argument up as evidence.

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
