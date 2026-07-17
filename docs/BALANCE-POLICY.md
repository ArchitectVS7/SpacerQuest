# Balance Policy & Foundation Reference of Record

**Status:** Standing policy for the Rimward redesign. Companion to `docs/PRD-REIMAGINED.md` and the standing constraints in `TASKS.md`.

This document records where the game's balance numbers come from, how the PRD and the 1991 foundation rules rank against each other when they disagree, and a running errata of claims in the code and task log that turned out to be false.

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

Mirrors `TASKS.md` standing constraint 5. The precedence is:

1. **PRD-REIMAGINED wins over foundation numbers.** Where the redesign's design intent (`docs/PRD-REIMAGINED.md`) calls for a different number than the 1991 rule, the PRD number is correct. Foundation is the starting point and the fallback, not a straitjacket.
2. **Foundation is consulted first.** Before diverging, read the foundation rule at `f2f95fa9`. A "divergence" you introduce because you never checked foundation is a bug, not a design decision — and half the time (see the hull-price cap errata below) there is no divergence at all, only a misremembered foundation rule.
3. **Every divergence is commented at its definition site.** If the engine's number differs from foundation, the difference must be documented *where the value is defined*, with the PRD rationale for the change and the foundation figure it departs from. An undocumented balance divergence is a review failure.
4. **A comment must not assert a divergence that does not exist.** The inverse of rule 3, and just as binding: if the code matches foundation, no comment may claim it diverges. A false divergence note sends future readers hunting for a design decision that was never made (this exact failure is errata #1).
5. **Interim thresholds were finalized by T-1603.** Balance thresholds and probabilities in place before T-1603 were interim. **T-1603 has now run** (500-seed sweep against the PRD targets, `docs/balance/tuning-memo.md`) and set the canonical targets: every constant it owned — danger tiers 2/4/5 (`content/systems.ts`), port price/income (`content/ports.ts`), the lending and guild bands (`content/lending.ts`, `content/guild.ts`), the hangout wagers (`content/hangout.ts`), and `TOUR_ONE_ENCOUNTER_MULTIPLIER` (`engine/actions/travel.ts`) — was measured and **ratified at its interim value** (the sim already met every target, so nothing moved), with its definition-site comment rewritten from "INTERIM" to a finalized T-1603-canonical rationale. These values are now canonical, not interim; changing one requires a new task and a re-measure against the tuning memo's distributions.

---

## Part C — v0.1 Errata

Corrections to claims made in the codebase and the task log during v0.1 that were found to be false or inaccurate. Source: `TASKS_v0.1_Audit.md` (2026-07-12 audit). The errata is the correction vehicle; the original `TASKS_v0.1.md` task-description lines are left as the historical record and are cited here by line number.

### E1 — The hull-scaled equipment price cap is NOT a divergence

**Claim (false):** `packages/engine/src/actions/shipyard.ts:96` and `TASKS_v0.1.md:129` (and the T-115 finding) documented the `min(hull.strength * 1000, 20000)` price on `AUTO_REPAIR` / `TITANIUM_HULL` as an *intentional engine divergence* from a foundation rule that "has no cap."

**Correction:** Foundation **does** cap these prices at 20,000. `f2f95fa9:foundation/rules/upgrades.ts` (~L731) computes `price = ship.hullStrength > 20 ? 20000 : ship.hullStrength * 1000`. Because the multiplier is 1000, `hull * 1000` reaches 20,000 exactly at `hull = 20` — foundation's threshold — so the engine's `Math.min(hull.strength * 1000, 20000)` form is *mathematically identical* to foundation's branch. The code is **faithful**; the comment and the T-115 finding were the errors. The false comment has been corrected at its definition site in `shipyard.ts` (and the companion note in `shipyard.test.ts`). No behavior changed.

### E2 — T-101 "payments shifted" is false

**Claim (false):** `TASKS_v0.1.md:43` (T-101) states that "manifest payments and fuel costs shift accordingly."

**Correction:** Nothing shifted. No payment or fuel-cost values were changed by T-101. The claim describes an effect that did not occur.

### E3 — T-106 "shared per-system job pool" is inaccurate

**Claim (inaccurate):** T-106 describes a "shared per-system job pool" that NPCs draw from.

**Correction:** There is no pool. NPCs claim contracts **from the player's own manifest board**, and only when co-located in the player's system, at **most one claim per dusk** (`packages/engine/src/day.ts:258-303`). This is the Contract Competition mechanic now named in PRD §2 — a rival taking a job off *your* board, not a shared regional pool being drained.

### E4 — T-201 poverty-trap criterion scoping

**Claim (overstated):** T-201's anti-poverty-trap acceptance criterion is phrased as "no policy" gets trapped at zero.

**Correction:** The phrasing overstates the guarantee. The test suite scopes the anti-poverty-trap check to the **three competent NPC policies**, not to every possible policy (a deliberately self-destructive or degenerate policy is not in scope). The design law — debt as a ledger, income floors so competent actors are never stranded at zero (now stated in PRD §2, "Scarcity of choices, never a poverty trap") — holds for the policies the game actually ships; the criterion's universal wording is the inaccuracy, not the mechanic.

### E5 — T-1003 "all 7 action types" undercounts

_Source: T-1804 audit (Rimward)._

**Claim (inaccurate):** T-1003's Delivered note describes the UGT adapter as covering "all 7 action types."

**Correction:** The count is **11, not 7**. `PlayerAction` (`packages/engine/src/types.ts:760`) is an 11-member discriminated union: **Trade, Travel, Combat, Shipyard, Storylet, Explore, VisitHangout, Reroll, Crew, Port, Wait**. The exhaustiveness guard `} satisfies Record<PlayerAction['type'], true>` at **`packages/sim/src/__tests__/protocol.test.ts:234`** lists and enforces all 11 — adding a discriminant to the union fails `tsc` there until the table (and therefore the coverage) is extended. The adapter covers all members; the "7" was a stale count.

### E6 — T-1101 "engine exports isGatedDestination / GATED_DESTINATION_MIN_ID" misattributes the owner

_Source: T-1804 audit (Rimward)._

**Claim (inaccurate):** T-1101 states that the engine exports `isGatedDestination` / `GATED_DESTINATION_MIN_ID`.

**Correction:** Both are **`@spacerquest/content`** exports, defined in `packages/content/src/systems.ts:176` (`GATED_DESTINATION_MIN_ID = 21`) and `:178` (`isGatedDestination`). The engine *consumes* them — imported in `packages/engine/src/day.ts:13` from `@spacerquest/content` and read at `day.ts:180`. Content owns them; the engine reads them and neither exports nor re-exports them.

### E7 — T-1307 era-income "A/B test" is a lever test, not a statistical experiment

_Source: T-1804 audit (Rimward)._

**Claim (imprecise):** T-1307 describes an era-income "A/B test."

**Correction:** It is an **in-scope-vs-base lever comparison** — the same seeded run evaluated with the era-income lever engaged versus the base configuration — not a statistical A/B experiment. There are no cohorts, no randomized assignment, and no significance testing; the "A/B" label denotes only the two-arm deterministic comparison of one lever against baseline.

### E8 — The T-1804 Auto-Repair "ratified design call" was reversed by T-1603

_Source: T-1603 balance pass (`docs/balance/tuning-memo.md` §6)._

**Prior state (superseded):** T-1804 ratified, as a design call in `packages/engine/src/day.ts`, that `autoRepairRegen` runs BEFORE the `lifeSupportCritical` dusk gate — healing life support 0→1 first — which made the life-support succession death path **unreachable whenever the Auto-Repair module is fitted**, and flagged it for T-1603 as a possible "always-rescue module is too strong."

**Resolution:** T-1603 **reversed the ordering**. The life-support survival gate now runs BEFORE the Auto-Repair regen, so a fitted ship at lifeSupport 0 rolls the GRIT survival check that night (it can die and trigger succession); the module then heals lifeSupport 0→1 afterward for the next day. The module stays valuable (overnight recovery of every fitted system, life support included — faithful to foundation) but is no longer an immortality switch, closing the audit's structural zero-deaths concern. The reversal is golden-neutral for every module-absent ship (it swaps a block that is a no-op unless `hasAutoRepair`), verified by the full engine + sim suites staying green. Covered by `components.test.ts` "the dusk survival gate fires even with Auto-Repair fitted (T-1603 nerf)".
