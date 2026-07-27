# Balance Policy & Foundation Reference of Record

**Status:** Standing policy for the Rimward redesign. Companion to `docs/PRD-REIMAGINED.md` and the standing constraints in `docs/ENGINEERING-POLICY.md`.

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

States `docs/ENGINEERING-POLICY.md` standing constraint 5 in full. The precedence is:

1. **PRD-REIMAGINED wins over foundation numbers.** Where the redesign's design intent (`docs/PRD-REIMAGINED.md`) calls for a different number than the 1991 rule, the PRD number is correct. Foundation is the starting point and the fallback, not a straitjacket.
2. **Foundation is consulted first.** Before diverging, read the foundation rule at `f2f95fa9`. A "divergence" you introduce because you never checked foundation is a bug, not a design decision — and half the time (see the hull-price cap errata below) there is no divergence at all, only a misremembered foundation rule.
3. **Every divergence is commented at its definition site.** If the engine's number differs from foundation, the difference must be documented *where the value is defined*, with the PRD rationale for the change and the foundation figure it departs from. An undocumented balance divergence is a review failure.
4. **A comment must not assert a divergence that does not exist.** The inverse of rule 3, and just as binding: if the code matches foundation, no comment may claim it diverges. A false divergence note sends future readers hunting for a design decision that was never made (this exact failure is errata #1).
5. **Interim thresholds hold until T-1603.** Balance thresholds and probabilities in place before T-1603 are interim. T-1603 sets the canonical targets; until then, the current values stand and are not to be "corrected" toward foundation or toward intuition without a task.

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
