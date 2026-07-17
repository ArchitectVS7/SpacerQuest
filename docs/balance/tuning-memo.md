# T-1603 — Balance Tuning Memo

**Task:** T-1603 · Balance tuning from sim.
**Date:** 2026-07 (Rimward redesign, `rimward-redesign` branch).
**Scope:** Run the policy fleet across the seed sweep and tune the game — now that its numbers bind (fuel scarcity T-1102, foundation-anchored encounters T-1103, load-bearing components T-1205, margin scaling T-1202) — against the PRD-REIMAGINED targets. This task owns the canonical values for every constant previously marked INTERIM: danger tiers 2/4/5 (`content/systems.ts`), port pricing/income (`content/ports.ts`), lending and guild bands (`content/lending.ts`, `content/guild.ts`), and hangout wagers (`content/hangout.ts`). It also evaluates the T-1804 audit flag on the Auto-Repair module.

---

## 1. Headline result

Measured against the current (finalized) constant tree, **every PRD balance target is already met**, so this pass **ratifies the interim constants as canonical unchanged** and makes exactly one behavioral change: it **nerfs the Auto-Repair module** so the life-support death path is reachable even when the module is fitted (the audit's finding). Ratifying-in-place — rather than moving numbers that already hit their targets and thereby churning the golden/replay fixtures — is the correct outcome under Standing-constraint 5 (interim thresholds are finalized by this task) and the Rebalance-fallout rule (do not perturb passing balance without cause).

| Acceptance criterion | Target | Measured | Verdict |
| --- | --- | --- | --- |
| Median trader debt-clear day | in [22, 30] | **23** (120 seeds × 40d) | ✅ |
| Combat EV below tier parity, unprepared | negative | reckless mean **1,586cr** vs pacifist trader **67,304cr** (>40× gap) | ✅ negative |
| Death rate across 1,200 sim-days | nonzero | reckless arm **130 deaths / 2,400 sim-days**, 20/20 seeds | ✅ |
| No stable optimal route | topShare < 0.5, optimum churns | topShare max **~0.27**, temporal churn **≥4/8 seeds** | ✅ |
| All prior tests green | pass | pass (see §6) | ✅ |

---

## 2. Methodology

- **Engine:** the shipped `runCampaign` (headless, seeded, deterministic) for the naming policies, plus a local `driveCampaign` that plans on the fresh day-state (mirroring `combat-ab.test.ts`) for the two custom arms below. The engine is pure; every run is reproducible from its seed.
- **Policy fleet:** `trader`, `fighter`, `veteran` (competent archetypes), plus two instruments:
  - **Reckless junker** — funds like the trader but never upgrades and **fights every interceptor to the death** on every die. This is the robust vehicle for the two combat-facing criteria (unprepared negative EV, nonzero death rate); the timid shipped policies talk/run past interceptors and so almost never die.
  - **Pacifist trader baseline** — the same funding loop that talks/runs, as the EV control.
- **Horizons:** 40 days for debt-clear (past the day-30 marker); 120 days for the death/EV sweep; 300 days (three 100-day windows) for route diversity.
- **Sweep size:** the offline grounding sweep ran to 500 seeds; the committed acceptance test (`balance-tuning.test.ts`) uses smaller representative counts (120/12/8 seeds) so the suite stays inside a sane wall-clock. The medians and rates below are stable across the sweep — the smaller in-test counts reproduce them.

---

## 3. Distributions (the evidence that grounds ratification)

### 3.1 Trader debt-clear (Tour One pacing) — 120 seeds × 40 days

| Bucket | Count |
| --- | --- |
| clears before day 22 | 45 |
| clears in [22, 30] | 46 |
| clears after day 30 | 9 |
| never clears within 40d | 20 |

- **Median = 23**, min 11, max 41. 100/120 (83%) clear within the horizon.
- Median 23 sits inside the accept band [22, 30] and honors the PRD's "25–30, **not 10**, not never" (§5.1): the fastest run is day 11, not a day-1 cakewalk, and the distribution's mass spans the intended range (the PRD's own §5.1 sample shows 22,400/25,000 banked at day 30 — a slow-but-competent archetype, which the >day-25 tail reflects).
- **No clean lever moves this median without collateral.** The pre-day-30 marker (`player.debt`) accrues **no interest** during Tour One — `GUILD_DEBT_DAILY_RATE` is guarded on the post-day-30 `guild.debt-flagged` flag (`day.ts`), so it bites only the *already-unpaid* branch and cannot shift the median of on-time clearers. Debt-clear day is therefore purely an income-rate function; the only levers are encounter rate (proven weak, §5) or contract payments (huge golden blast radius). Since 23 ∈ [22, 30], the constants stand.

### 3.2 Death rate — reckless junker, 20 seeds × 120 days

- **130 deaths across 2,400 sim-days; 20/20 seeds see at least one death.** This closes the T-1804 "zero deaths in the sim" finding decisively — the death path is reachable and firing under sustained unprepared combat.
- The shipped fleet is near-immortal by contrast (trader 0, fighter 0, veteran 1 death per ~6,000 sim-days) — **not** because of Auto-Repair (no shipped policy fits it) but because the timid policies avoid sustained combat. This is intended: a competent captain rarely dies; a reckless one reliably does.

### 3.3 Combat EV, unprepared vs prepared — 20 seeds × 120 days

- Reckless (fights unprepared): mean end credits **1,585.55**.
- Pacifist trader (same funding, talks/runs): mean end credits **67,304.45**.
- A >40× gap. Fighting below tier parity with no weapons/shields has **decisively negative** credit EV — each hull-kill halves the bank via `applySuccession`, and the junker's weapons rarely win a volley. Now testable precisely because components are load-bearing (T-1205).

### 3.4 Route diversity — 8 seeds × 300 days (three 100-day windows)

- Every window: single most-frequent best-paying destination holds **≤ 0.5** of the dawns (measured max ~0.27) — no route approaches a monopoly.
- Temporal churn: the top destination differs across the three windows for **≥ 4 of 8** seeds — era onset/expiry keeps the optimum moving. No stable optimal route. (Owning test: `campaign.test.ts` "churns routes"; re-asserted in the T-1603 suite.)

---

## 4. Canonical constant table (before → after)

Every constant this task owns was measured and **ratified at its current value** — the "after" equals the "before". The definition-site comments were rewritten from "INTERIM / owned by T-1601 / T-1603 owns final target" to a finalized T-1603-canonical rationale citing this memo.

| Constant | File | Before | After | Rationale |
| --- | --- | --- | --- | --- |
| `ROUTE_DANGER_CHANCE` tier 2 | `content/systems.ts` | 0.35 | 0.35 | interpolates core↔rim anchors; reached by loaded/long core lanes |
| `ROUTE_DANGER_CHANCE` tier 4 | `content/systems.ts` | 0.50 | 0.50 | beyond-rim: loaded/long rim lanes + Andromeda |
| `ROUTE_DANGER_CHANCE` tier 5 | `content/systems.ts` | 0.60 | 0.60 | most dangerous: special systems, doubly-bumped rim |
| `purchasePrice` (all 14 ports) | `content/ports.ts` | 25,000 | 25,000 | affordable mid-veteran-run; ~83-dusk payback annuity |
| `baseDuskIncome` (all 14 ports) | `content/ports.ts` | 300 | 300 | slow annuity, kept flat so no single "best port" dominates |
| `LOAN_DAILY_RATE` | `content/lending.ts` | 0.05 | 0.05 | bites over a term, clears inside it (borrow/repay loop) |
| `LOAN_TERM_DAYS` | `content/lending.ts` | 15 | 15 | trader repays well before term |
| `LOAN_MIN/MAX_PRINCIPAL` | `content/lending.ts` | 250 / 5,000 | 250 / 5,000 | covers the §7.5 bad-day gap; caps a single advance |
| `LOAN_DEFAULT_DISPOSITION` | `content/lending.ts` | −5 | −5 | a stiffed lender remembers (grudge-weight scale) |
| `COLLECTION_ENCOUNTER_MULTIPLIER` | `content/lending.ts` | 1.5 | 1.5 | collector pressure on a defaulted loan |
| `GUILD_DEBT_DAILY_RATE` | `content/guild.ts` | 0.02 | 0.02 | compounds only on the *unpaid* branch — not a pacing lever |
| Guild severity/flag bands | `content/guild.ts` | — | unchanged | consequence scaling for the indebted branch |
| `DARE_MIN/MAX_WAGER` | `content/hangout.ts` | 25 / 500 | 25 / 500 | texture/variance instrument, near-zero EV — not a route |
| Dare disposition deltas | `content/hangout.ts` | ±2 / +3 / −4 / +1 | unchanged | sized to the `DISPOSITION_DELTAS` scale |
| `TOUR_ONE_ENCOUNTER_MULTIPLIER` | `engine/actions/travel.ts` | 0.5 | 0.5 | holds median debt-clear in band; weak lever (§5) |

**Important correction to a prior assumption.** The interim comments (and the T-1603 plan) treated tiers 2/4/5 as "unused / gated Andromeda-only." That is false: `computeRouteDanger` derives the tier as `clampDanger(baseDanger + distanceBump + cargoBump + eraDelta)`, so tier 2 is reached on any loaded or ≥8-unit **core** lane and tier 4/5 on loaded/long/era-hit **rim** lanes — all reachable in normal play. Consequently these tiers **do** feed live encounter generation and the sim/replay goldens, which is a further reason not to move them: a change would churn every affected fixture for no target-improvement.

---

## 5. Candidate changes considered and rejected

- **Bump `TOUR_ONE_ENCOUNTER_MULTIPLIER` 0.5 → 0.7 to nudge the debt-clear median up toward 25.** Measured: median stayed at 23 with a near-identical distribution; the 30-day clear rate barely moved. A talk/run trader passes interceptors cheaply, so extra interdictions rarely cost a whole delivery. **Rejected — weak lever, no benefit.**
- **Bump `ROUTE_DANGER_CHANCE` tiers 4/5 (0.50/0.60 → 0.55/0.65) to make beyond-rim lanes clearly punishing.** Because these tiers are reachable in live play (§4), the change would alter encounter generation on loaded rim runs and **churn the sim/replay goldens** — with no acceptance target to gain (unprepared combat is already decisively negative-EV, and the escalating 0.30/0.35/0.40/0.50/0.60 gradient already punishes the loaded rim band). **Rejected — golden churn for no target-improvement.**
- **Raise `GUILD_DEBT_DAILY_RATE` to center the debt-clear median.** It accrues only on the post-day-30 unpaid marker, so it cannot move on-time clearers' median (§3.1). **Rejected — wrong lever.**

---

## 6. Auto-Repair decision (T-1804 audit flag)

**Finding.** A fitted Auto-Repair module did **not** cause the sim's near-zero death rate (no shipped policy buys it), but the audit's structural concern was real: in the old `day.ts` dusk order the module healed `lifeSupport` 0→1 **before** the life-support survival gate, so the life-support succession death path was **unreachable by construction** whenever the module was fitted — an always-rescue immortality switch on an end-game reward.

**Decision — nerf by reordering (option B).** The `day.ts` dusk sequence now runs the **life-support survival gate BEFORE the Auto-Repair regen**. A ship whose life support was driven to 0 this dusk rolls the GRIT survival check that night whether or not the module is fitted (it can die and trigger succession); the module then heals `lifeSupport` 0→1 afterward for the next day. The module stays valuable (overnight recovery of every fitted system, life support included — faithful to foundation, where Auto-Repair repairs life support) but is no longer an immortality switch, and the death path is reachable even for a kitted end-game ship.

**Before → after.**

| | Before | After |
| --- | --- | --- |
| Fitted ship at lifeSupport 0, dusk | healed 0→1 first; gate never rolls; **cannot die** | rolls GRIT gate (can die); **then** healed 0→1 if it survived |
| `LifeSupportCritical` event when fitted | never fires | fires on every critical dusk |
| Death path reachable when fitted | no | yes |

**Purity / goldens.** For a ship **without** the module — every existing golden — the Auto-Repair block is skipped, so swapping the two blocks is byte-identical: the gate consumes the same `life-support-${day}` rng fork in the same stream position. Only an Auto-Repair-fitted ship (no golden fits one) now takes that fork; that perturbation is the intended nerf. Verified: the full engine + sim suites, including the golden/replay fixtures, stay green (§7).

**Test.** `components.test.ts` "the dusk survival gate fires even with Auto-Repair fitted (T-1603 nerf)" asserts (1) the gate fires across a seed sweep with the module fitted, (2) the death path (`ShipLost`) is reachable with it fitted, and (3) a survived roll still leaves the module's 0→1 heal in place.

---

## 7. Prior tests

All engine and sim suites pass, including `campaign-policies.test.ts` (trader ≥60% clear, poverty-trap streak, specialty metrics), `combat-ab.test.ts`, `lending-property.test.ts`, `campaign.test.ts` route churn, `components.test.ts`, and the golden/replay fixtures. No constant value moved, so no golden regenerated; the Auto-Repair reorder is golden-neutral for all module-absent ships (§6).

## 8. Reachability (Standing-constraint 6)

This is a tuning/measurement task; it adds no player verb. Every constant it finalizes is already surfaced to the player by an existing reader — the Traders board (contract payments, guild-flag penalty), the route read-out (danger chance), Penny Wise's desk and the Hangout pane (lending, Dare wagers), the port buy-preview (price/income), and the wire (guild interest, Auto-Repair / life-support beats). The Auto-Repair nerf is reachable through the same dusk wire the player already reads. No new UI is required.
