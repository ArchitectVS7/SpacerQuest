# Balance Baseline — T-1603a

> **The tuning that followed is in [`TUNING-T-1603.md`](./TUNING-T-1603.md).** This
> document is the *before*; every figure here still describes the game as it stood at
> the commit in Provenance, and it is deliberately not updated in place. T-1603b (economy
> and pacing) is written up there, with the after-arms committed alongside as
> `baseline-tour-one-1603b.json` / `baseline-veteran-1603b.json`. **If you are tuning
> combat or survival, read that memo's §6 first** — the renown rescale moved the tier
> band, so §3 and §4 below are no longer the current parity and death numbers.

**Measurement only. No balance number was moved by this task.** Not a constant, not a
DC, not a price. Every figure below describes the game exactly as it stands at the
commit named in Provenance; the tuning is T-1603b's (economy and pacing) and
T-1603c's (combat and survival). Where a number looks wrong, this memo says so and
hands it forward as a flag — it does not fix it.

---

## Provenance

| | |
|---|---|
| Measured against | `6d8681d3ec840226657c107e1669c7c30821ae2c` (the T-1603a working tree; the only diff from that commit is this task's own instrumentation, which changes no game behavior) |
| Date | 2026-07-26 |
| Machine | Windows 10, 8 logical cores, 16 GB |
| Node | v22.16.0 |
| Sweep script | `packages/sim/src/balance/sweep.ts` (+ the pure `packages/sim/src/balance/aggregate.ts`) |
| Committed aggregates | `docs/balance/baseline-tour-one.json`, `docs/balance/baseline-veteran.json` |
| Raw rows | `.scratch/balance/rows-<label>-shard<i>of<N>.json` (gitignored — 3,500 runs of raw encounter and route records are not a repo artifact) |

Exact commands, both run as four concurrent shards:

```
# Tour One arm — 500 seeds x 7 policies x 35 days = 3,500 runs, 122,500 sim days
npx tsx packages/sim/src/balance/sweep.ts --label tour-one --seeds 500 --days 35 --shard 1/4
npx tsx packages/sim/src/balance/sweep.ts --label tour-one --seeds 500 --days 35 --shard 2/4
npx tsx packages/sim/src/balance/sweep.ts --label tour-one --seeds 500 --days 35 --shard 3/4
npx tsx packages/sim/src/balance/sweep.ts --label tour-one --seeds 500 --days 35 --shard 4/4
npx tsx packages/sim/src/balance/sweep.ts --label tour-one --merge

# Veteran arm — 100 seeds x 7 policies x 120 days = 700 runs, 84,000 sim days
npx tsx packages/sim/src/balance/sweep.ts --label veteran --seeds 100 --days 120 --shard 1/4
... (2/4, 3/4, 4/4) ...
npx tsx packages/sim/src/balance/sweep.ts --label veteran --merge
```

Wall time: Tour One arm **5m30s** across four shards (≈17 min single-threaded);
veteran arm **8m35s** across four shards (≈27 min single-threaded).

---

## Method

### What a "run" is

One `runCampaign(seed, days, policy)` from `packages/sim/src/index.ts` — a full
headless career from day 1 with a single policy driving every decision. The report
it returns carries four blocks this task added, all **derived and unpersisted** (no
`GameState` field, no save migration): `tourOne`, `combatEncounters`, `routeLegs`,
`survival`. `summarizeReport` folds one report into one `SeedRow`; `aggregate` folds
the rows into the distributions below.

### The fleet

`trader, fighter, explorer, veteran, smuggler, gambler` — the six competent policies,
which are the balance instruments — plus **`greedy`** as a naive control, so the memo
can say what playing badly costs. `idle` and `random` are excluded from the default
fleet: they are protocol/robustness instruments, and folding them in would drag every
distribution toward noise. Both remain available via `--policies`.

Read the per-policy rows as **seven different players**, not seven attempts at the
same thing. The `veteran` policy in particular is built for the post-Tour-One game
and is deliberately bad at clearing the marker; `explorer` optimises for fragments
and never pays the marker at all. The **fleet** row is the union, and is the right row
only for questions that are genuinely fleet-wide (route diversity, death rate).

### Why two arms, and why not 300 days

`runCampaign` is roughly **quadratic in days** — the day loop rescans a growing event
log. Measured on this machine (trader policy, one run each):

| days | 35 | 60 | 100 | 120 | 150 |
|---|---|---|---|---|---|
| ms/run | 283 | 614 | 1,639 | 2,292 | 3,322 |

So "500 seeds × 7 policies × 300 days" is roughly **10 hours**, which is not a
re-runnable script. The baseline is taken as two arms instead: a wide, short
**Tour One arm** (500 seeds × 35 days — the shortest horizon that carries through the
day-30 resolution) and a narrow, long **veteran arm** (100 seeds × 120 days). The
quadratic cost is itself a finding; see Flag 6.

### Definitions T-1603b/T-1603c will be graded against

All exported from `packages/sim/src/balance/aggregate.ts`, deliberately from exactly
one place, and pinned by fixture tests in
`packages/sim/src/__tests__/balance-sweep.test.ts`.

**Quantiles — nearest rank, no interpolation.** For a sample of n values sorted
ascending, the reported quantile q is `sorted[clamp(ceil(q*n) - 1, 0, n - 1)]`. Every
reported quantile is therefore an actually-observed datum. `median` is `p50` under the
same rule, so for even n it is the **lower** of the two middle values, not their
average. T-1603b's "median trader debt-clear day in [22, 30]" is graded against *this*
median.

**Tier parity — the sign convention.** `below` means the **interceptor outranks the
player** (the player is outgunned). `above` means the player outranks the interceptor.
This is T-1603c's target bucket, so the convention is pinned in both directions by
test.

**`prepared`** — `weaponVolleyDamage(ship) > 1` sampled on the ship as it stood when
the encounter opened. By the T-1205 baseline-subtraction invariant a junker's volley
damage is exactly 1, so `> 1` means a bought weapon tier or a STAR_BUSTER was actually
in play. It is a fit measurement, not a purchase receipt.

**Repair valuation — engine-anchored.** A damaged component is priced at
`ComponentDamaged.amount × strength`, because `packages/engine/src/actions/shipyard.ts`
`repairCost` in `'all'` mode charges `(9 - condition) × strength` — exactly `strength`
credits per condition point restored. This is the price of *undoing* the damage.
Mitigated points are excluded automatically: `ComponentDamaged.amount` is already net
of shields.

**Combat EV.** `-(fuelCredits + repairCredits + tributeCredits + fineCredits + successionCredits)`.

Two things about that definition, both load-bearing:

1. **It is not the purse delta.** An encounter opens mid-jump and stays open for one or
   more whole days, during which a delivery pays out, a port earns, a storylet grants.
   The naive `credits(close) - credits(open)` is contaminated by all of it — measured on
   seed 1 / fighter / day 1, a purse delta of **+1,700** that is, to the credit, a
   delivery payment on a contract signed before the interception. The raw purse delta is
   still recorded (as `creditsDelta`) and is reported beside the attributed EV in the
   combat table, precisely to show that gap.
2. **It is ≤ 0 by construction, because the engine pays nothing for winning a fight.**
   There is no bounty, no wreck salvage, no loot: `resolveEncounter`
   (`packages/engine/src/actions/combat.ts`) moves disposition and reputation and
   nothing else, and the only salvage table in the game belongs to exploration. See
   Flag 2 — this reshapes what T-1603c's acceptance can mean.

**Route EV.** `(paidPayment - fuelUnitsWhileOpen × fuelPriceAtSigning) / max(1, deliveredDay - signedDay)`
credits per elapsed day, over **delivered legs only**. Legs that were lost or still
open at the horizon return `null` and are counted separately rather than scored as
zero — folding them in as zeros would reward a policy for signing contracts it never
ran. `fuelPriceAtSigning` is the local price at the signing port; it is an
approximation (the tank may be topped up mid-leg elsewhere at a different price), and
it is carried on the record specifically so this figure needs no hard-coded
credits-per-unit constant. The `max(1, …)` floor is what keeps a same-day delivery
from putting an Infinity in the table.

**Death rate.** Computed by the sweep from raw counts against the sim-day denominator,
two ways: deaths per 1,000 sim days, and the share of runs that lost at least one
ship. No rate is baked into a per-run report, where the denominator would be invisible.

---

## 1. Tour One clear day

*PRD §5.1: a 25,000-credit Guild marker, due in 30 days. T-1603b's target is
"clearable by competent play in 25–30 days (not 10, not never)".*

Two different questions, reported separately because they have different answers:
`debtClearedDay` is the **first day the debt reached zero** (which can be after day
30); `tourOne.outcome` is the **day-30 branch the Guild actually took**.

| policy | runs | day-30 clear rate | cleared inside 35 days |
|---|---|---|---|
| trader | 500 | **79.4%** | 83.2% |
| gambler | 500 | 63.2% | 72.8% |
| fighter | 500 | 45.6% | 50.8% |
| smuggler | 500 | 40.8% | 52.8% |
| veteran | 500 | 0.2% | 0.2% |
| explorer | 500 | 0.0% | 0.0% |
| greedy | 500 | 0.0% | 0.0% |
| fleet | 3500 | 32.7% | 37.1% |

**Day the debt first reached zero** (over the runs that cleared inside the horizon)

| policy | n | min | p10 | p25 | median | p75 | p90 | max | mean |
|---|---|---|---|---|---|---|---|---|---|
| trader | 416 | 11 | 17 | 20 | **23** | 27 | 30 | 36 | 23 |
| fighter | 254 | 12 | 19 | 22 | 26 | 29 | 32 | 36 | 26 |
| gambler | 364 | 17 | 21 | 24 | 27 | 29 | 32 | 36 | 27 |
| smuggler | 264 | 17 | 21 | 25 | 28 | 31 | 34 | 36 | 28 |
| veteran | 1 | 25 | 25 | 25 | 25 | 25 | 25 | 25 | 25 |
| explorer | 0 | — | — | — | — | — | — | — | — |
| greedy | 0 | — | — | — | — | — | — | — | — |
| fleet | 1299 | 11 | 19 | 22 | 26 | 29 | 32 | 36 | 26 |

**Debt still outstanding at the day-30 resolution** (unpaid branch only)

| policy | n | min | p25 | median | p75 | max | mean |
|---|---|---|---|---|---|---|---|
| trader | 103 | 62 | 1,841 | 4,643 | 8,009 | 25,000 | 5,921 |
| gambler | 184 | 31 | 1,745 | 3,904 | 7,510 | 25,000 | 5,452 |
| smuggler | 296 | 11 | 2,660 | 5,441 | 8,903 | 19,853 | 6,103 |
| fighter | 272 | 40 | 5,622 | 18,722 | 21,518 | 25,000 | 14,568 |
| veteran | 499 | 655 | 16,852 | 20,145 | 23,160 | 25,000 | 19,618 |
| greedy | 500 | 13,935 | 20,045 | 21,395 | 22,845 | 25,000 | 21,348 |
| explorer | 500 | 25,000 | 25,000 | 25,000 | 25,000 | 25,000 | 25,000 |

**Credits at the 35-day horizon** (median / mean): explorer 19,946 / 20,301 ·
trader 15,790 / 15,822 · gambler 10,990 / 11,714 · fighter 8,630 / 9,450 ·
smuggler 7,195 / 8,779 · veteran 4,750 / 4,646 · greedy 1,125 / 1,753.

**Reading.**

- **Harness sanity check passes.** `campaign-policies.test.ts:63-85` measured trader
  42/50 = 84% clearing at the day-30 boundary on 2026-07-26 using a different
  criterion (`finalState.debt <= 0` at a 30-day horizon). The 500-seed
  day-30-branch figure is 79.4%, and the 35-day debt-cleared figure is 83.2% — the
  same game, measured two ways, agreeing within sampling. The instrument is sound.
- **The trader is already inside T-1603b's band.** Median first-debt-free day 23,
  p25 20, p75 27, against a target median in [22, 30]. T-1603b's economy work should
  be careful not to move this out of a band it is currently in.
- **The tail is long on both ends.** The fastest clear in the sweep is day 11 (trader);
  the slowest inside the horizon is day 36. "Not 10, not never" is satisfied at the
  median but a small minority genuinely does clear in 11–12 days.
- **`explorer` pays the marker exactly zero credits in 500 careers** — its
  outstanding-debt distribution is 25,000 flat, min to max. That is a policy-shape
  finding, not an economy finding (the explorer routes toward fragments and the Sage),
  but it means the explorer row is uninformative for every debt question and should
  not be counted against the economy in T-1603b.

---

## 2. Route EVs

*PRD §2: "No trade route stays optimal." T-1603b's target is "no dominant route (era
churn working)".*

| policy | legs | delivered | lost | open at end | distinct routes | top-route share | median cr/day |
|---|---|---|---|---|---|---|---|
| trader | 15,064 | 14,857 | 0 | 207 | 287 | 1.4% | 1,500 |
| gambler | 12,860 | 12,595 | 60 | 205 | 266 | 2.1% | 1,480 |
| smuggler | 12,284 | 11,999 | 68 | 217 | 250 | 1.2% | 1,814 |
| fighter | 7,149 | 6,828 | 0 | 321 | 379 | 1.7% | 1,800 |
| explorer | 7,137 | 6,741 | 189 | 207 | 375 | 1.5% | 2,100 |
| veteran | 2,513 | 2,270 | 53 | 190 | 340 | 1.9% | 1,560 |
| greedy | 1,719 | 1,241 | 142 | 336 | 296 | 4.0% | 410 |
| **fleet** | **58,726** | **56,531** | **512** | **1,683** | **397** | **1.3%** | **1,630** |

**Route EV per delivered leg (credits/day)**

| policy | n | min | p10 | p25 | median | p75 | p90 | max | mean |
|---|---|---|---|---|---|---|---|---|---|
| explorer | 6,741 | -1,080 | 968 | 1,595 | 2,100 | 2,872 | 4,846 | 22,254 | 2,575 |
| smuggler | 11,999 | 76 | 1,250 | 1,488 | 1,814 | 2,260 | 2,885 | 10,620 | 2,021 |
| fighter | 6,828 | -1,050 | 928 | 1,360 | 1,800 | 2,480 | 4,155 | 23,228 | 2,249 |
| veteran | 2,270 | -516 | 585 | 1,200 | 1,560 | 2,100 | 3,713 | 18,695 | 1,923 |
| trader | 14,857 | -2,117 | 940 | 1,240 | 1,500 | 1,830 | 2,130 | 9,000 | 1,551 |
| gambler | 12,595 | -1,474 | 1,056 | 1,240 | 1,480 | 1,780 | 2,080 | 9,040 | 1,549 |
| greedy | 1,241 | -49 | 169 | 244 | 410 | 702 | 1,236 | 5,590 | 573 |
| **fleet** | **56,531** | **-2,117** | **960** | **1,300** | **1,630** | **2,050** | **2,820** | **23,228** | **1,850** |

**Fleet: the five most-flown routes** (out of 397 distinct origin→destination pairs)

| route | legs | share of all legs | delivered | median cr/day | median payment |
|---|---|---|---|---|---|
| 1→14 (Sun-3 → Vega-6) | 777 | 1.3% | 756 | 1,476 | 2,820 |
| 1→11 (Sun-3 → Regulus-6) | 774 | 1.3% | 765 | 1,456 | 2,560 |
| 1→13 (Sun-3 → Spica-3) | 721 | 1.2% | 707 | 1,420 | 2,300 |
| 1→9 (Sun-3 → Pollux-7) | 721 | 1.2% | 713 | 1,340 | 2,300 |
| 1→2 (Sun-3 → Aldebaran-1) | 688 | 1.2% | 676 | 1,180 | 1,700 |

**T-107 route-diversity `topShare`** (share of dawns whose best-paying offer named the
single most-frequent destination, days 1–35): fleet median **0.143**, p90 0.200,
max 0.429. Every policy sits in the same 0.13–0.16 mean band.

**Reading.**

- **There is no dominant route, by a wide margin.** The most-flown route in 58,726
  legs carries 1.3% of them; the top five together carry 6.2%; 397 distinct routes are
  in use. `topShare` medians at 0.143 against a theoretical floor near 0.09 (all 35
  dawns naming different destinations would be lower still). The Tour One arm cannot
  see era churn (era flips at day 30), so this is the *pre-churn* baseline — and it is
  already healthy — and §6 shows it gets *better* after the flip (top route 1.0%,
  `topShare` median 0.110). T-1603b starts from a pass here, not a problem.
- **All five top routes originate at system 1 (Sun-3).** That is the starting port and
  the only Hangout, so it is where every career begins and where the loan desk is: a
  *start bias*, not a dominant route. Confirmed by the veteran arm (§6), where a
  non-home route (Vega-6 → Antares-5) rises to second place once careers have had time
  to leave the Sun.
- **`paidPayment - quotedPayment` is exactly 0 on all 56,531 delivered legs.** This is
  correct and should not be read as T-1202 being broken: T-1202's margin surface lives
  on the **haggle** (`actions/trade.ts:127`, which raises `contract.payment` *at
  signing*, so it is already inside `quotedPayment`), on **tribute**
  (`actions/combat.ts:702`) and on **combat damage** (`actions/combat.ts:227`). The
  delivery payout is `contract.payment` verbatim (`actions/travel.ts` × 2). There is no
  margin scaling between signing and delivery, by design. The column stays in the
  instrument because a future T-1603b change *could* put one there.
- **Route EV can be negative.** The p10 is comfortably positive for every policy, but
  the minimum is −2,117 cr/day: a contract whose fuel bill exceeded its payment. Rare
  (well under 10% of legs for every policy) but real, and consistent with the T-1102
  fuel-scarcity intent.
- **`greedy`, the control, earns 410 cr/day against the fleet's 1,630** — a 4×
  penalty for taking the first contract on the board and never planning fuel. The
  spread between naive and competent play is real and large.

---

## 3. Combat EV by tier parity

*T-1603c's target: "combat EV negative below tier parity without preparation."*

**Fleet, 18,169 encounters, 3 parity buckets × prepared/unprepared**

| parity | prepared | n | mean EV | median EV | p10 EV | min EV | win rate | ship-lost | jump completed | mean rounds | mean purse delta |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **below** | **no** | **2,638** | **-1,029** | **-860** | -2,000 | -6,842 | **2.5%** | **0.0%** | 82.3% | 2.7 | +1,391 |
| below | yes | 1,254 | -858 | -750 | -1,600 | -10,266 | 73.4% | 0.0% | 84.9% | 3.9 | +3,409 |
| even | no | 7,362 | -1,084 | -1,000 | -2,010 | -9,035 | 1.1% | 0.0% | 81.7% | 2.2 | +1,201 |
| even | yes | 991 | -672 | -500 | -1,201 | -8,800 | 77.5% | 0.0% | 85.9% | 3.2 | +3,373 |
| above | no | 5,361 | -987 | -910 | -1,901 | -7,031 | 0.9% | 0.0% | 86.4% | 2.2 | +1,041 |
| above | yes | 563 | -380 | -260 | -691 | -3,759 | 79.2% | 0.0% | 87.4% | 2.2 | +2,816 |

**Encounters per policy**

| policy | encounters | per run | mean EV | median EV | worst single |
|---|---|---|---|---|---|
| explorer | 3,882 | 7.8 | -1,144 | -1,000 | -9,035 |
| trader | 3,803 | 7.6 | -1,039 | -1,210 | -7,084 |
| smuggler | 3,597 | 7.2 | -1,123 | -1,400 | -8,002 |
| gambler | 3,174 | 6.3 | -990 | -1,003 | -5,600 |
| fighter | 2,639 | 5.3 | -695 | -500 | -10,266 |
| veteran | 782 | 1.6 | -598 | -250 | -7,763 |
| greedy | 292 | 0.6 | -214 | -30 | -1,800 |
| **fleet** | **18,169** | **5.2** | **-987** | **-800** | **-10,266** |

**The below-parity/unprepared cell, per policy** (T-1603c's named target)

| policy | n | mean EV | median EV | win rate |
|---|---|---|---|---|
| trader | 1,083 | -1,139 | -1,401 | 0.0% |
| gambler | 543 | -1,029 | -1,000 | 0.0% |
| explorer | 468 | -1,047 | -701 | 0.0% |
| smuggler | 195 | -1,215 | -1,500 | 0.0% |
| fighter | 146 | -848 | -803 | 45.9% |
| veteran | 117 | -496 | -60 | 0.0% |
| greedy | 86 | -140 | -21 | 0.0% |

Only two policies ever fight below parity while *prepared*: fighter (1,075 encounters,
81.6% win rate, mean EV −860) and veteran (179, 24.0%, −848).

**Reading — this is the section with the most for T-1603c.**

- **Combat EV is negative in every cell, and T-1603c's criterion is therefore already
  met — but vacuously.** Because the engine pays nothing for winning a fight, EV
  cannot be positive anywhere. "Negative below tier parity unprepared" is true; so is
  "negative above tier parity prepared." T-1603c should restate its acceptance as a
  **comparison** (below-parity/unprepared materially worse than above-parity/prepared)
  or introduce a combat payout. See Flag 2.
- **Tier parity barely moves the cost.** Unprepared mean EV runs −1,029 (below),
  −1,084 (even), −987 (above): the spread is under 10%, and even/unprepared is the
  *worst* cell, not below/unprepared. Whatever the tier matchmaking is doing, it is not
  making outgunned fights meaningfully more expensive. **Preparation, by contrast,
  matters and matters most when you are ahead**: prepared vs unprepared is −380 vs
  −987 at `above` parity (a 61% saving) but only −858 vs −1,029 at `below` (17%). The
  gun helps you punish the weak far more than it helps you survive the strong. That is
  backwards from the design intent and is Flag 3.
- **Win rate is the axis that actually separates the cells, and it is bimodal.**
  Unprepared: 0.9–2.5%. Prepared: 73–79%. There is essentially no middle. An unarmed
  ship effectively cannot win a fight at any parity; an armed one wins three times in
  four at any parity. Tier is close to irrelevant next to whether a weapon was bought.
- **`travelCompleted` sits at 82–87% in every cell.** Even a fight the player cannot
  win usually ends with the jump completing (talked down or, at dusk, driven off), so
  the opportunity cost of an interception is smaller than the credit cost suggests.
- **The purse-delta column is the contamination proof.** Mean purse delta is *positive*
  in every single cell (+1,041 to +3,409) while the attributed EV is negative in every
  cell. A memo built on `credits(close) - credits(open)` would have concluded that
  combat is profitable and that fighting above parity while prepared is the most
  profitable thing in the game. It is the delivery payout landing mid-encounter.

---

## 4. Death rate

*T-1603c's target: "nonzero death rate across 1,200 sim days," closing the audit's
zero-deaths finding.*

| policy | sim days | ships lost | combat defeats | life-support failures | life-support scares | successions | deaths/1,000 days | runs with ≥1 death |
|---|---|---|---|---|---|---|---|---|
| trader | 17,500 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.0% |
| fighter | 17,500 | 0 | 0 | 0 | **2** | 0 | 0.00 | 0.0% |
| explorer | 17,500 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.0% |
| veteran | 17,500 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.0% |
| smuggler | 17,500 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.0% |
| gambler | 17,500 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.0% |
| greedy | 17,500 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.0% |
| **fleet** | **122,500** | **0** | **0** | **0** | **2** | **0** | **0.00** | **0.0%** |

**Fuel starvation (T-1004 `cannotAffordCheapestJump`)**, days per run: fleet median 0,
p90 0, max 33. Mean under 1 day for every policy. Stranding exists in the tail
(fighter max 33 days, veteran max 24, trader max 28) but is not a typical experience.

**Reading.**

- **The audit's zero-deaths finding is confirmed at scale for Tour One.** **Zero ship
  losses in 122,500 simulated days** across seven policies and 3,500 careers. The death
  machinery is provably reachable — `tour-one-death.spec.ts` (T-1602b) plays both death
  paths through the real UI on pinned seeds 192 and 3 — but it is not reachable *by
  ordinary play inside Tour One*.
- **It is not zero forever.** The veteran arm (§6) finds **18 deaths in 84,000 days**
  — 0.21 per 1,000 days — of which **17 are life-support failures and exactly one is a
  combat defeat**. So "zero deaths" is a Tour One statement, not a game-wide one, and
  the two halves of the death system are in wildly different states: life support kills
  occasionally, combat effectively never. Read §4 and §6 together before tuning either.
- **The `below`-parity/unprepared ship-lost rate is 0.0% over 2,638 encounters.** A
  junker with no gun, fighting something a full tier above it, 2,638 times, never dies.
- **Life support is the closer of the two paths, even inside Tour One.** Two
  `LifeSupportCritical` scares fired (both fighter): life support was driven to
  condition 0 twice in 122,500 days and survived its dusk GRIT roll both times. Over the
  longer horizon that same path is the one that actually kills (§6). Note what the
  scare-with-no-failure pattern means in combination with T-1804's flag:
  `autoRepairRegen` runs *before* the life-support dusk gate
  (`packages/engine/src/day.ts` ~435–449), so a fitted AUTO_REPAIR module lifts
  lifeSupport 0→1 and the survival roll is never taken at all. T-1603c owns this call.
- **Why no deaths: the arithmetic.** A death needs the hull driven to condition 0
  (`actions/combat.ts:258`). Enemy pressure rolls at most once per round plus once at
  dusk; a landed hit picks **one of eight components uniformly**
  (`DAMAGE_COMPONENTS`, hull is 1-in-8) and removes **1** condition — 2 only on a
  margin ≥ 10 and 3 only on a natural 20, both deliberately out of reach for the
  rank-and-file per the comment at `combat.ts:227-235`. A junker hull starts at
  condition 9. So an ordinary interceptor needs roughly **9 × 8 ≈ 72 landed hits** to
  kill, against a mean encounter length of **2.2–3.9 rounds**. Interceptions end (by
  tribute, flight, defeat or dusk) more than an order of magnitude before the hull can
  be worn through. This is a structural gap, not a tuning-dial-off-by-20% gap — see
  Flag 4.

---

## 5. Deed pacing

*Deeds are the renown ladder (`content/deeds.ts` → `RENOWN_RANKS`, ten ranks from
LIEUTENANT to CONQUEROR).*

**Deeds earned by day 30**

| policy | n | min | p25 | median | p75 | max | mean |
|---|---|---|---|---|---|---|---|
| smuggler | 500 | 19 | 22 | 23 | 24 | 29 | 23 |
| explorer | 500 | 5 | 19 | 19 | 20 | 22 | 19 |
| gambler | 500 | 5 | 15 | 16 | 17 | 21 | 16 |
| trader | 500 | 4 | 11 | 13 | 14 | 17 | 13 |
| fighter | 500 | 1 | 9 | 11 | 12 | 15 | 11 |
| veteran | 500 | 2 | 10 | 12 | 13 | 17 | 11 |
| greedy | 500 | 2 | 5 | 6 | 7 | 12 | 6 |
| **fleet** | **3500** | **1** | **10** | **14** | **19** | **29** | **14** |

**Deeds per 100 days**: smuggler 70.4 · explorer 55.3 · gambler 49.4 · trader 39.7 ·
veteran 32.7 · fighter 32.5 · greedy 17.8 (means).

**Day the Nth deed landed — fleet**

| N | runs reaching it | min | p25 | median | p75 | p90 | max | mean |
|---|---|---|---|---|---|---|---|---|
| 1 | 3,500 | 2 | 2 | 2 | 2 | 4 | 4 | 2.3 |
| 2 | 3,499 | 2 | 2 | 2 | 5 | 6 | 21 | 3.1 |
| 3 | 3,398 | 2 | 2 | 2 | 5 | 7 | 23 | 3.5 |
| 4 | 3,397 | 2 | 2 | 3 | 5 | 7 | 23 | 3.8 |
| 5 | 3,395 | 2 | 3 | 4 | 6 | 10 | 24 | 5.2 |

Per-policy median day of the 5th deed: smuggler 2 · trader 3 · explorer / fighter /
gambler 4 · veteran 7 · greedy 10.

**Renown rank at the 35-day horizon** (run counts; ranks ordered worst→best)

| policy | CAPTAIN | COMMODORE | ADMIRAL | TOP_DOG | GRAND_MUFTI | MEGA_HERO | GIGA_HERO | CONQUEROR |
|---|---|---|---|---|---|---|---|---|
| explorer | 0 | 0 | 2 | 1 | 4 | 9 | 484 | 0 |
| smuggler | 0 | 0 | 0 | 0 | 0 | 0 | 498 | 2 |
| gambler | 0 | 0 | 1 | 2 | 4 | 31 | 462 | 0 |
| trader | 0 | 1 | 0 | 1 | 39 | 265 | 194 | 0 |
| fighter | 10 | 0 | 43 | 42 | 85 | 270 | 49 | 0 |
| veteran | 56 | 2 | 3 | 14 | 111 | 203 | 111 | 0 |
| greedy | 35 | 0 | 261 | 155 | 48 | 1 | 0 | 0 |

(One `COMMANDER` run, fighter. No `LIEUTENANT` — every career leaves the opening rank.)

**Reading.**

- **Deed pacing is far too fast, and this is the loudest finding in the memo.** The
  fleet's **5th deed lands on day 4** (median), and by the end of Tour One a median
  career holds **14 deeds** — a smuggler holds 23. The first five deeds are not a
  progression; they are an opening cutscene.
- **The renown ladder is effectively exhausted inside Tour One.** 1,798 of 3,500
  35-day careers end at **GIGA_HERO, the 9th of 10 ranks**, and two smuggler careers
  reach **CONQUEROR** — the terminal rank — before day 35. The rank that is supposed to
  gate special equipment and mark a veteran career is the *default* outcome of the
  tutorial. See Flag 5.
- **The ladder does still discriminate between policies**, which is the good news:
  greedy tops out at ADMIRAL (261/500) while smuggler is at GIGA_HERO (498/500). The
  ordering is meaningful; the scale is not.
- **`veteran` is the only policy with a slow start** (median 1st deed day 4 vs day 2
  for everyone else, and only 442/500 runs reach a 5th deed) because it opens by
  banking rather than by acting.

---

## 6. The veteran arm — 100 seeds × 7 policies × 120 days

*84,000 sim days past the day-30 era flip. Coarser (100 seeds, so quantiles are five
times coarser than §1–§5) but it is the only view of the game the Tour One arm cannot
see: un-damped encounter rates (T-1802), era churn, and enough elapsed time for a
career to actually go wrong.*

**Tour One, re-measured at a longer horizon.** The day-30 branch is unchanged within
sampling (trader 77.0% vs 79.4%; gambler 65.0% vs 63.2%; fighter 40.0% vs 45.6%) —
which is the expected result, since the branch is decided by day 30 either way, and is
a second confirmation that the 500-seed and 100-seed samples describe the same game.
What the longer horizon adds is the **tail past day 30**: the fleet's debt-cleared
rate rises from 37.1% to 49.9%, smuggler from 52.8% to **91.0%**, gambler to **93.0%**,
and even `veteran` finally clears 14% of its careers (median day 89). The marker is not
a wall; it is a slope, and most policies eventually walk up it. `explorer` and `greedy`
still never clear.

Median first-debt-free day, over runs that cleared: trader **23** (unchanged), gambler
28, fighter 31, smuggler 34, veteran 89, fleet 29. The trader's median is stable
across both arms at 23 — a useful fixed point for T-1603b.

**Credits diverge enormously by day 120.** Median final credits: fighter 90,620 ·
trader 70,283 · gambler 59,435 · explorer 47,311 · smuggler 35,600 · veteran 4,386 ·
greedy 1,000. The fighter's maximum is **597,807**. Whatever brake exists on wealth in
Tour One is gone by the veteran game.

**Route diversity holds up past the era flip — it gets *better*.** 394 distinct routes
over 33,757 legs; top route 1.0% of legs (down from 1.3%); top five 4.6% (down from
6.2%); `topShare` median 0.110 (down from 0.143). Era churn is doing its job. The
top-five list has also moved off the home port — **14→15 (Vega-6 → Antares-5)** is now
the second most-flown route at 333 legs, and it carries the best median EV in the top
five at 2,097 cr/day. The Tour One arm's all-Sun-3 top five was indeed a start bias.

Fleet route EV per delivered leg: median 1,560 cr/day, mean 1,886 — within 5% of the
Tour One arm's 1,630 / 1,850. Delivery economics do not shift materially across the
era flip.

**Combat gets more frequent and slightly more expensive.** 23.9 encounters per run
(vs 5.2 per 35-day run — i.e. roughly 0.20/day vs 0.15/day, consistent with the T-1802
un-damping) and fleet mean EV −1,073 (vs −987). The parity picture is unchanged in
shape and slightly sharper: prepared win rates rise to 84–90% and unprepared fall to
0.3–1.8%. Notably, **below-parity/prepared is now the *cheapest* below-parity option by
a wide margin** (−585 vs −991) and completes the jump 95.5% of the time. The worst
single encounter in the sweep is −40,028 credits (trader, above parity, unprepared) —
the long tail is very long.

| parity | prepared | n | mean EV | median EV | win rate | jump completed |
|---|---|---|---|---|---|---|
| below | no | 730 | -991 | -810 | 1.8% | 83.7% |
| below | yes | 938 | -585 | -400 | 90.1% | 95.5% |
| even | no | 7,118 | -1,261 | -1,500 | 0.3% | 88.2% |
| even | yes | 1,593 | -668 | -400 | 84.4% | 93.0% |
| above | no | 5,481 | -1,135 | -1,400 | 0.3% | 89.9% |
| above | yes | 857 | -478 | -400 | 88.4% | 94.5% |

**Deaths exist here — and they are almost entirely life support.** This is the finding
that the Tour One arm could not have produced.

| policy | sim days | ships lost | combat defeats | life-support failures | scares | deaths/1,000 days | runs with ≥1 death |
|---|---|---|---|---|---|---|---|
| explorer | 12,000 | 7 | 0 | 7 | 6 | 0.58 | 7.0% |
| gambler | 12,000 | 5 | 0 | 5 | 8 | 0.42 | 5.0% |
| greedy | 12,000 | 3 | **1** | 2 | 1 | 0.25 | 3.0% |
| smuggler | 12,000 | 1 | 0 | 1 | 1 | 0.08 | 1.0% |
| trader | 12,000 | 1 | 0 | 1 | 0 | 0.08 | 1.0% |
| veteran | 12,000 | 1 | 0 | 1 | 6 | 0.08 | 1.0% |
| fighter | 12,000 | 0 | 0 | 0 | 0 | 0.00 | 0.0% |
| **fleet** | **84,000** | **18** | **1** | **17** | **22** | **0.21** | **2.6%** |

- **17 of 18 deaths are life-support failures. One — exactly one, on the naive control
  policy — is a combat defeat.** In 16,717 encounters. The combat death path is not
  merely rare; it is a rounding error, and §4's arithmetic explains why.
- **0.21 deaths per 1,000 sim days.** T-1603c's acceptance asks for "nonzero death rate
  across 1,200 sim days"; at this rate 1,200 days yields an *expected 0.25 deaths*, so
  a 1,200-day test would report zero more often than not. The acceptance needs either a
  much larger denominator or a materially higher rate. See Flag 4.
- **`fighter` is the only policy with zero deaths** — and it is the policy that buys
  AUTO_REPAIR first. That is exactly the fingerprint Flag 5 predicts: the module makes
  the life-support path unreachable, and the life-support path is where 94% of deaths
  come from. `fighter` also logged zero scares, meaning its life support never even
  reached condition 0 at a dusk without being healed first.
- Deaths cluster on the policies that fly the most days away from a shipyard
  (explorer 7, gambler 5).

**Deed pacing does not improve with a longer horizon — it saturates.** Median deeds by
day 120 is 19 (vs 14 by day 30): four fifths of a 120-day career's deeds are earned in
its first quarter. Deeds per 100 days falls from 42.6 (Tour One arm) to 14.8 — not
because the later game is stingier by design, but because the earnable deeds have run
out. `smuggler` tops out at 28 of them. The day-of-Nth-deed table is identical to the
Tour One arm's to the day (5th deed, fleet median, day 4), as it must be.

Renown at day 120: **475 of 700 careers at GIGA_HERO**, and **8 at CONQUEROR** — the
terminal rank — all of them smugglers. Only 17 careers are still below ADMIRAL. The
ladder is finished long before the career is.

---


---

## Flags for T-1603b and T-1603c

Measurement only — nothing below was changed. These are handed forward.

**Flag 1 — deed and renown pacing (T-1603b, "deed pacing").** Five deeds by day 4;
GIGA_HERO (rank 9 of 10) by day 35 in more than half of all careers; by day 120,
475/700 careers at GIGA_HERO and 8 already at CONQUEROR, the terminal rank. And the
supply is finite: a 120-day career earns only 19 deeds against 14 by day 30, so four
fifths of the ladder is climbed in the first quarter and then it saturates. Both the
deed triggers and the `RENOWN_RANKS` thresholds (`content/deeds.ts`) look sized for a
much longer career than the game plays. This is the largest single gap between the
baseline and the PRD's intent, and it is T-1603b's by scope.

**Flag 2 — combat has no payout at all (T-1603c).** `resolveEncounter` grants no
credits under any resolution; there is no bounty, no salvage, no wreck loot. This
makes `combatEv ≤ 0` by construction and makes T-1603c's acceptance ("combat EV
negative below tier parity without preparation") true everywhere and therefore
non-discriminating. T-1603c must either (a) restate the acceptance as a *comparison*
between cells — the numbers to beat are in §3 — or (b) introduce a payout, which is a
design change and needs a PRD reading before it is a tuning change.

**Flag 3 — preparation pays off backwards in Tour One, and rights itself later
(T-1603c).** In the Tour One arm, buying a gun saves 61% of the encounter cost when you
outrank the interceptor but only 17% when it outranks you — the weapon rewards punching
down, not surviving punching up. In the veteran arm the same comparison is 58% (above)
vs 41% (below), which is much closer to the design intent. So this is a *Tour One*
problem specifically: early, when preparation matters most to a player, it helps least
where they most need it. Whether that is acceptable is a design call; it is at minimum
not what "components are load-bearing" was aiming at.

**Flag 4 — the death rate is nonzero but tiny, and the COMBAT death path specifically
is structurally unreachable (T-1603c).** Two separate problems, and they need separate
answers:

- *Combat deaths.* One combat defeat in **34,886 encounters across both arms**. Zero in
  2,638 below-parity/unprepared Tour One fights and 730 veteran-arm ones. The
  arithmetic in §4 says a kill needs ~72 landed enemy hits against 2–4-round
  encounters. This is not a 20% dial turn; it needs one of: much heavier hull damage,
  hull-weighted targeting instead of the uniform 1-in-8 pick, a lower hull-condition
  ceiling, or a distinct death condition.
- *Overall rate.* 0.21 deaths per 1,000 sim days (veteran arm). **T-1603c's acceptance
  as written — "nonzero death rate across 1,200 sim days" — would fail most of the time
  at this rate** (expected 0.25 deaths in 1,200 days). Either the denominator in that
  acceptance grows to ~20,000 sim days, or the rate has to move. Say which in the
  Delivered note; do not let a flaky assertion into the suite.
- Note the interaction with the next flag before choosing: 94% of the deaths that *do*
  happen come from the path AUTO_REPAIR switches off.

**Flag 5 — the Auto-Repair / life-support interaction, carried forward from T-1804,
now with evidence.** `autoRepairRegen` runs before the life-support dusk gate
(`day.ts` ~435–449), so a fitted AUTO_REPAIR module makes the life-support death path
unreachable outright. The veteran arm is exactly the shape that predicts: **`fighter`
— the one policy that buys AUTO_REPAIR early — is the only policy with zero deaths and
zero scares in 12,000 days**, while every other policy loses ships to life support.
Since life support is 17 of the 18 deaths in the game, the module is not "a strong
module"; it is *the* survival switch. **Do not tune the life-support DC before deciding
the Auto-Repair question** — with the module fitted that DC is never rolled, so moving
it changes nothing for the players most able to buy their way out.

**Flag 6 — `runCampaign` is quadratic in days (T-1605c).** 283 ms at 35 days,
3,322 ms at 150, 12+ s at 300. The event log grows and is rescanned. This is why the
baseline is two arms rather than one 300-day sweep, and it is the same growth curve
T-1605c's "1,000-day save loads < 2s" acceptance will meet. Recorded here as a
measurement, not as a task.

**Flag 7 — `explorer` never pays the Guild marker.** 500 careers, 25,000 outstanding
in every one. It is a policy-shape issue rather than an economy issue, but it means
the explorer row is meaningless for every debt question, and any fleet-wide debt
statistic in T-1603b's before/after should be computed over the policies that
actually try.

**Not a flag: `paidPayment == quotedPayment` on all 56,531 delivered legs.** This is
correct. T-1202's margin surface is on the haggle (which is inside the quote), on
tribute, and on combat damage — not between signing and delivery. Recorded so a
future reader does not mistake a flat column for a broken feature.

---

## How to re-run

```
# From the repo root. Four shards of each arm can run concurrently on an 8-core box.
npm run balance:sweep -w @spacerquest/sim -- --label tour-one --seeds 500 --days 35 --shard 1/4
# ...repeat for 2/4, 3/4, 4/4...
npm run balance:sweep -w @spacerquest/sim -- --label tour-one --merge

npm run balance:sweep -w @spacerquest/sim -- --label veteran --seeds 100 --days 120 --shard 1/4
# ...repeat for 2/4, 3/4, 4/4...
npm run balance:sweep -w @spacerquest/sim -- --label veteran --merge

npm run balance:sweep -w @spacerquest/sim -- --help
```

- **Sharding**: seed *s* belongs to shard `(s - seedStart) % N`, 1-indexed — an
  interleave, not a contiguous block, so every shard sees the same mix of seeds and
  they finish together.
- **Raw rows** land in `.scratch/balance/rows-<label>-shard<i>of<N>.json` (gitignored).
  They carry every encounter and route record, so T-1603b/T-1603c can **re-cut the
  same sweep** — a different parity split, a per-cargo-type route table — without
  re-running it. Override with `--out`.
- **`--merge`** reads every shard file for the label, sorts rows by (seed, policy) so
  the result is independent of which shard finished first, and writes
  `docs/balance/baseline-<label>.json`. That file is the committed artifact and the
  thing to diff.
- **Other flags**: `--policies a,b,c` (validated against the policy union — an unknown
  name throws rather than silently sweeping the random policy), `--seed-start`,
  `--aggregate-out`.
- Progress goes to **stderr**; stdout stays clean.

---

## Known limits

- **The 35-day arm cannot see the veteran loop.** The era flips to VETERAN at the
  day-30 resolution, which un-damps encounter rates (T-1802) and opens era churn. Every
  §1–§5 figure is a *pre-flip* measurement with at most five post-flip days on it. The
  veteran arm (§6) is the counterweight, at coarser resolution — and it changes the
  answer on death rate outright, so do not read §4 alone.
- **The veteran arm is 100 seeds, not 500.** Its quantiles are five times coarser;
  treat p10/p90 there as indicative and the median as sound. Its 18 deaths are a
  small-count statistic: the per-policy split (7/5/3/1/1/1/0) is well inside Poisson
  noise and should not be read as a policy ranking.
- **Neither arm reaches 300 days.** Late-career dynamics — the Nemesis arc's terminus,
  fully-fitted ships, the deepest era events — are outside both windows.
- **Seven policies are not seven players.** A policy is a fixed decision rule with no
  learning and no reaction to a bad run. Real play will find lines none of them take,
  and will make mistakes none of them make. Distributions here bound the *policy*
  space, not the player space.
- **The succession-haircut term in combat EV is essentially untested.** Exactly one
  combat death occurred across both arms, so `successionCredits` contributed to one
  record out of 34,886. If T-1603c makes combat deaths common, that term becomes the
  dominant cost line and this baseline says nothing about its magnitude.
- **`fuelPriceAtSigning` prices a whole leg's burn at the origin port's price.** Legs
  that refuel mid-route at a different price are mispriced by the difference. The error
  is bounded by the map's fuel-price spread and is the same in every arm, so it does
  not affect before/after comparisons.
- **This is one machine and one node version.** Nothing here is timing-dependent —
  every campaign is seeded and deterministic — so the *numbers* reproduce exactly
  anywhere. Only the wall-clock table in Method is machine-specific.
