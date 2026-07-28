# Archetype balance matrix — what the policies do, what the numbers mean

**Status:** design reference + open research brief. Written 2026-07-28.
**Companion to:** `BALANCE-POLICY.md` (the rules for changing balance), `docs/balance/`
(the committed sweep artifacts), `PRD-REIMAGINED.md` §7 (combat), §9 (property).

This document exists because a balance discussion kept stalling on vocabulary. "The fighter
lost 21 ships" reads like a squadron of drones being expended. It is not. This file states,
in one place, what each simulated archetype actually *does* on a turn, what every column of
the balance matrix *measures*, and where the current numbers say the design is out of true.

---

## 1. Terminology, stated once

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

---

## 2. The seven archetypes — what each actually decides

Descriptions are taken from the policy implementations in `packages/sim/src/index.ts`, not
from their names. Line numbers are where each is defined.

### `trader` (L1643) — route + fuel planner
Keeps the tank topped, signs the **richest net-value contract** on the board, flies it to
delivery the same day (a second run while the debt is heavy and the hand/tank allow), then
remits everything above a fuel reserve to the Guild marker. Once the marker clears it
prefers a **rim** run over a core one inside the same fundable set. On a bad day at a Hangout
it takes a **Penny Wise advance** sized to the shortfall and clears it before term.
**Combat: never fights.** Weak hull by choice — it talks past interceptors.

### `smuggler` (L2049) — a trader that runs dirty
Same fuel/contract machinery as the trader, but inside the fundable set it prefers, in
order: a **contraband run** (cargo type 10, top of the value band), then any rim-bound run.
Takes every sealed pod an Explore sweep turns up and sells to Ray. Pays the Guild out of
those runs. **Combat: talks its way past.** Rim preference is *not* gated on the marker —
the rim is this policy's career.

### `gambler` (L2535) — a working trader who plays the tables
The trader's day (refuel → repair if crippled → richest fundable run → fly → pay Guild),
with two changes: inside the fundable set it prefers runs **ending at a Hangout system**, and
while at a Hangout it queues up to `GAMBLER_MAX_DARES_PER_DAY` wagers as extra actions. The
working day is planned first so sign/travel dice are reserved before the tables get what is
left.

### `fighter` (L2797) — upgrade-then-hunt
Funds itself with a contract run each day, **reinvests surplus into weapon/hull/shield/drive
tiers**, and when intercepted it *fights the ones it can drop* — one volley per point of
enemy hull, spending the sharpest dice, but only when the tank covers the whole exchange.
Outmatched (fuel or hand insufficient for the kill) it runs; if it cannot run it talks.
**This is the only policy that routinely buys weapons.**

### `explorer` (L2927) — fragment chaser
Off-lane sweeps are a **credit sink** (80 fuel for a thin salvage roll), so it funds itself
with one contract run a day and pours surplus fuel and dice into Explore attempts, chasing
Signal Fragments and the Sage's decode storylets. Carries a deadhead-flight guard against
stranding.

### `greedy` (L1196, `greedyTraderPolicy`) — the cautionary path
Takes income opportunistically and **buys no upgrades**. Present as a control: what happens
to a captain who accumulates nothing.

### `veteran` (L3258) — endgame grinder, not a baseline
**Registry-driven**: each dawn it reads which Deeds are still unearned and steers at them
(haggle for `broker_shark`, a mercy/rim contract when offered, varied combat stances for the
encounter deeds, a deliberate low-fuel arrival for `fuel_fumes_arrival`), trading to fund the
renown-gated fit up to `ASTRAXIAL_HULL`. **Deliberately excluded from `COMPETENT_POLICIES`**
and exempt from the poverty-trap sweep — it is a reachability instrument, not a lean baseline.

---

## 3. What every matrix column measures

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

**Difficulty scaling today** (`packages/engine/src/tier.ts`): `player.tier` is a 1–5 power
band derived from **renown rank + combat ship fit**. It is the *only* input to encounter
matchmaking — `selectEncounterInterceptor` reads it and `chooseTargetTier` clamps candidates
to `[tier−1, tier+1]`. **Wealth is not an input.**

---

## 4. The measured matrix

100 careers per archetype × 120 in-game days (700 careers), taken 2026-07-28 against the
T-1605 travel change (`docs/balance/baseline-vet-t1605.json`).

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

---

## 5. The finding this matrix was built to expose

**An unprepared trader wins the game without ever being at risk.**

- 0.90 clear rate, 80,000 credits, TOP_DOG rank, clears the marker on **day 21**
- **0 ships lost across 12,000 simulated days**
- **0 cargo routes lost to pirates out of 9,003 delivered**
- Its `prepared = true` combat cells are **empty** — it never fits a weapon, ever
- It fought **1,052 encounters while outgunned and unprepared** with a `shipLostRate` of
  **0.0000**

Compare `greedy` (0.0685 loss rate when outgunned) and `fighter` (0.0323). The trader is not
avoiding pirates — at 32.5 encounters per career it meets **more of them than the fighter
does (25.4)**. It is escaping all of them, permanently, at no cost.

So the gap is **not attraction, it is consequence**. A wealthy captain currently buys
immunity by declining to engage. Adding more interceptions to the trader's day would produce
more encounters it also escapes.

---

## 6. Open research brief — "predation pressure"

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
  human-plausible pilot, not against an optimal one. **This has not been measured.**
- Should predation scale with liquid credits only, or with total assets (ship fit, port
  stakes, cargo in hold)? A port-owning captain is visibly wealthy in a way a purse is not.
- Does an unescapable pursuer break the T-1605b anti-poverty-trap invariant for a captain who
  is rich but low on fuel? That invariant has already been broken once this cycle by a
  travel-cost change.
- `greedy` currently dies most and earns least. Does predation make it strictly worse, and is
  that acceptable for a control policy?

---

## 7. Cross-references

- Policies: `packages/sim/src/index.ts` (line numbers in §2)
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
