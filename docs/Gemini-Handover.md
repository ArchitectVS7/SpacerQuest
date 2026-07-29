# N3 Implementation Completed

We have successfully finished the N3 milestone: allowing the 30 simulation NPCs to meet pirates, engage in combat, and permanently die, while extracting the 11 storylet characters into a separate `QUEST_PROFILES` roster so they don't get awkwardly killed off outside their narrative arcs.

## What was completed in this final session:

### 1. Test Suite Reconciliation
We fixed the remaining test regressions caused by the roster split:
- **`encounter.test.ts` and `disposition.test.ts`**: These tests historically used `Rattlesnake` (who is now in the `QUEST_PROFILES` array) to verify combat flaws and grudges. We updated these tests to use `Iron Vex` instead. `Iron Vex` is a named tier-3 NPC in the `NPC_PROFILES` simulation array who has the `Bloodthirsty` flaw, making him a perfect drop-in replacement for the tests.
- **Golden Hashes**: With the new roster architecture in place, we regenerated the day-loop state and event hashes using `gen-day-loop-golden.ts` to ensure `day.test.ts` passes against the new snapshot.
- **Full suite pass**: All 725 tests in `@spacerquest/engine` now pass cleanly!

### 2. Documentation Updates
We updated `docs/NPC_REDESIGN.md` to formally mark **N3** as `SHIPPED`:
- Updated the status board to reflect that all 30 simulation captains are completely mortal and engage with pirates.
- Updated the Parity Ledger to confirm that **Travel** (real encounters, real death) and **Combat** (full parity via `resolveCombat`) are now shipped.

### 3. Review of the overall N3 solution
As requested, we implemented your elegant solution:
- **`NPC_PROFILES` (30 captains)**: The core simulation cast. They can accumulate experience, buy spaceports, trade, upgrade ships, meet pirates, and even die permanently.
- **`QUEST_PROFILES` (11 captains)**: Characters like Silk Dagger, Doc Salvage, and Penny Wise who exist strictly for their authored side quests. They are excluded from random encounters and the daily simulation churn, preserving their narrative integrity.

The `ALL_NPC_PROFILES` array combines both lists for global lookups (like saving/loading), ensuring the underlying data structures remain intact while neatly separating simulation behavior from authored storytelling.

---

# N4 — NPC Archetypes Implementation Plan

This plan addresses the **N4 — NPC archetypes** task from the NPC redesign worklist, moving NPCs from a uniform `IDEAL_WEIGHTS` probability distribution to distinct archetypes that mirror the sim policies (`trader`, `fighter`, `explorer`, `smuggler`, `gambler`, `veteran`).

## Proposed Changes

### 1. Define Archetypes in `packages/content/src/cast.ts`
- **[MODIFY]** Add a new type `NpcArchetype = 'trader' | 'fighter' | 'explorer' | 'smuggler' | 'gambler' | 'veteran'`.
- **[MODIFY]** Update `NpcProfile` to include an `archetype: NpcArchetype` field.
- **[MODIFY]** Assign one of the six archetypes to each of the 30 `NPC_PROFILES` manually based on their existing stats and ideal (e.g., Cargo King -> `trader`, Iron Vex -> `fighter`, Neon Fox -> `gambler`).

### 2. Update Intent Selection in `packages/engine/src/npc.ts`
- **[MODIFY]** Rewrite `pickIntent(profile, credits, rng)` to use the `archetype` to dictate the intent instead of (or as an override to) the generic `IDEAL_WEIGHTS` table.
- **Logic Mapping (mirroring sim policies without the heavy player loop):**
  - **`trader`**: Always returns `'Trade'`.
  - **`smuggler`**: Returns `'Trade'`.
  - **`fighter`**: Returns `'Combat'` or `'Patrol'` (e.g., based on rng or fuel reserves).
  - **`explorer`**: Returns `'Travel'` (or `'Patrol'` if broke).
  - **`gambler`**: Returns `'Socialize'` (Hangout).
  - **`veteran`**: Evaluates `credits` to dynamically pick between `'Trade'`, `'Combat'`, and `'Shipyard'` (representing their opportunistic, balanced approach).

### 3. Inject Archetype Specific Logic into Execution Verbs (`packages/engine/src/npc.ts`)
To truly "reuse the sim policies' logic where possible", we will add lightweight archetype-specific logic to the coarse execution functions:
- **`executeTrade`**: For the **`smuggler`** archetype, when generating a contract using `rollContract`, we will attempt to enforce a rim destination (simulating the smuggler's "one more run to the rim" policy) if they have sufficient fuel.
- **`executeTravel`**: For the **`explorer`** archetype, we will favor destinations with unboarded POIs or outside the immediate core (simulating off-lane charting).

## User Review Required
> [!IMPORTANT]
> **Archetype Assignment:** I will map the 30 existing captains to these 6 archetypes. Do you have a specific distribution in mind (e.g., exactly 5 of each), or should I map them organically based on their existing stats (e.g., high GUNS -> fighter)?
>
> **Intent vs Ideal:** With Archetypes driving the turn, the `ideal` field (`IDEAL_WEIGHTS`) becomes largely obsolete for action selection. Should we keep `ideal` for flavor/narrative (or future use), or fully replace it with `archetype`?

## Verification Plan

### Automated Tests
- Run all tests in `@spacerquest/engine` (`npm run test`) to ensure the intent changes don't break the solvency invariants in `npc.test.ts` or `day.test.ts`.
- The golden hashes in `day-loop-golden.ts` will need to be regenerated because NPC day resolution choices will deterministically change based on archetypes instead of the old distribution.

### Manual Verification
- Review the `NpcDayResult` logs in a generated day loop to verify that an NPC like Cargo King consistently trades, while Iron Vex fights/patrols, and the wealth spread shows different captains topping different categories (as hypothesized by N4).

# N4 Implementation Walkthrough

## N4 - Archetypes (COMPLETED)
We successfully integrated archetypes into the NPC simulation.

### Changes Made:
- Added `archetype` (`'trader' | 'fighter' | 'explorer' | 'smuggler' | 'gambler' | 'veteran'`) to `NpcProfile` in [cast.ts](file:///Users/vs7/Dev/Games/SpacerQuest/packages/content/src/cast.ts).
- Re-assigned archetypes to all 30 simulation captains (e.g. Iron Vex -> `fighter`, Cargo King -> `trader`, Silk Dagger -> `gambler`).
- Refactored `pickIntent` in [npc.ts](file:///Users/vs7/Dev/Games/SpacerQuest/packages/engine/src/npc.ts) to read the archetype directly rather than relying on probability weight matrices. Poverty limits are enforced to drive broke captains to trade for survival.
- `executeTrade` and `executeTravel` behavior in [npc.ts](file:///Users/vs7/Dev/Games/SpacerQuest/packages/engine/src/npc.ts) was augmented so smugglers prioritize Rim sectors for illicit trade, and explorers chart routes off the established shipping lanes.
- Fixed test suite regressions caused by the shift in `pickIntent`, passing all checks in [npc.test.ts](file:///Users/vs7/Dev/Games/SpacerQuest/packages/engine/src/__tests__/npc.test.ts).
- Rebuilt `@spacerquest/content` and regenerated simulation loop hashes in [day-loop-golden.ts](file:///Users/vs7/Dev/Games/SpacerQuest/packages/engine/src/__tests__/fixtures/day-loop-golden.ts).
- **Marked N4 as SHIPPED** in [NPC_REDESIGN.md](file:///Users/vs7/Dev/Games/SpacerQuest/docs/NPC_REDESIGN.md).

---
# N10 + N11 — NPCs Work the Contract Board & Earn Renown

## Overview

N10 lifts contract competition off the co-location gate and the 1-claim/dusk floor,
letting each NPC claim from a system-local pool wherever they fly. N11 gives every
captain a deed registry, fed by their real actions, so rank-gated yard purchases become
reachable and the Honor List's top end is genuinely contested.

The user's constraint added to the work plan: **when an NPC faces multiple board offers,
the contract they pick is driven by their archetype/persona** — a reckless captain
chases the biggest payday, a wise one picks the safe run, a long-game player prefers
the route that builds toward their next upgrade.

---

## Open Questions

> [!IMPORTANT]
> **Contract selection strategy — how many options should trigger a pick?**
> Today, `executeTrade` takes a single index off a board (the whole `claimableBoard`
> is the candidate pool). Under N10, each NPC gets their own system-local board with
> up to 4 offers. Does the archetype picker always run, or only when ≥2 offers exist?
> Recommendation: always run it — even 1 offer is a "pick", and the branching logic
> is cleaner if the picker is always responsible.

> [!IMPORTANT]
> **System-local board generation — NPC ship spec or player ship spec?**
> `generateManifestBoard` takes a `ShipState`. The player's board uses the player's
> ship. For an NPC's per-system board, should contracts be sized against **the NPC's
> own ship** (true parity — the same `contractSpecFromShip(npc.ship)` call the
> synthesized-contract path already uses) or a normalized spec?
> Recommendation: use `contractSpecFromShip(npc.ship)` — this is the N-track's
> standing constraint: same rules, no special cases.

> [!IMPORTANT]
> **The 1-claim/dusk fleet cap and the co-location gate — what do we do with them?**
> Per N10's spec, both are "throttles from the texture era" and should be "swept as
> knobs". Options:
> (a) Remove both entirely — every NPC claims from their local pool independently.
> (b) Keep the co-location gate (player's board stays the player's), remove the 1-claim cap.
> (c) Remove both, but add a `NPC_BOARD_CLAIM_CHANCE` probability throttle.
> Recommendation: (a) with measurement — let the sweep tell us if it's too hot.

---

## Proposed Changes

### N10 — NPC Contract Board

#### [MODIFY] [npc.ts](file:///Users/vs7/Dev/Games/SpacerQuest/packages/engine/src/npc.ts)

**1. `NpcDayContext` — add system-local board**

The existing `claimableBoard` field is only non-null when co-located with the player.
We extend it (or replace it) with a board the caller generates for each NPC's current
system:

```diff
export interface NpcDayContext {
  day: number;
-  /** The player's live manifest board when this NPC is allowed to claim from
-   *  it (same system as the player, no claim spent today); null otherwise. */
-  claimableBoard: readonly CargoContract[] | null;
+  /** The system-local job board for this NPC's current system (generated
+   *  by the caller from rollContract × boardSize, sized against the NPC's
+   *  own ship). Non-null whenever the NPC intends Trade. */
+  systemBoard: readonly CargoContract[] | null;
+  /** Legacy player-board claim hook — kept for backward compat during the
+   *  N10 transition; callers set this when the NPC is co-located with the
+   *  player AND the player's board still has offers. */
+  claimableBoard: readonly CargoContract[] | null;
  eraEvent: EraEventState | null;
}
```

**2. `pickContract(contracts, profile, rng)` — new archetype-driven selector**

A new exported function (testable in isolation):

```typescript
/**
 * N10 · Archetype-driven contract selection. Given ≥1 offers, each archetype
 * applies its own ranking and picks the one that fits its worldview.
 *
 * CONSUMES ONE RNG DRAW when the archetype is 'gambler' (picks randomly among
 * the top half) or 'veteran' (weighted by safety margin). All other archetypes
 * are deterministic (no rng). Pass the archetype's own rng fork so the draw
 * is attributed and does not bleed into the action-level stream.
 *
 * SCORING axes (all derived from CargoContract fields, no engine calls):
 *   - payment      (raw income — what the reckless see)
 *   - distance     (fuel cost proxy — what the cautious avoid)
 *   - payment/dist (efficiency — what the long-game players optimise)
 */
export function pickContract(
  contracts: readonly CargoContract[],
  profile: NpcProfile,
  rng: SeededRng,
): CargoContract
```

**Archetype → criterion mapping:**

| Archetype | Strategy | Rationale |
|-----------|----------|-----------|
| `trader`  | Best payment/distance (efficiency) | Long game — maximise income per fuel |
| `smuggler` | Highest payment (preferring rim) | Already rim-preferring in `executeTrade`; greed drives the pick |
| `fighter` | Shortest distance | Wants to stay close for Combat days; trade is a chore |
| `explorer` | Farthest destination (rim preferred) | Distance = adventure |
| `gambler` | Random pick from top-half by payment | Reckless, picks a "good enough" run by feel |
| `veteran` | Balanced: weight by `payment - fuelCost * 5` | Experienced, knows fuel matters |

**3. `executeTrade` — consume both boards**

```typescript
// Priority: system board (N10) > player board (legacy T-106 co-location)
const candidates: CargoContract[] =
  ctx.systemBoard && ctx.systemBoard.length > 0
    ? [...ctx.systemBoard]
    : ctx.claimableBoard && ctx.claimableBoard.length > 0
    ? [...ctx.claimableBoard]
    : [];

let claimedContractIndex: number | undefined;
let contract: CargoContract;

if (candidates.length > 0) {
  contract = pickContract(candidates, profile, rng.fork(`pick-${npc.id}`));
  // If taken from the player's live board, track the splice index for day.ts
  if (ctx.claimableBoard) {
    claimedContractIndex = ctx.claimableBoard.indexOf(contract);
  }
} else {
  // Fall back to synthesizing a private offer (no board available)
  contract = rollContract(npc.currentSystemId, rng, contractSpecFromShip(npc.ship), ctx.eraEvent);
}
```

#### [MODIFY] [day.ts](file:///Users/vs7/Dev/Games/SpacerQuest/packages/engine/src/day.ts)

In the NPC dusk loop (`endDay`), generate a per-NPC system board and pass it through
`NpcDayContext.systemBoard`. The existing `canClaim` / `boardClaimSpent` / co-location
logic stays alive as the legacy hook (backward-compatible, and swept as a knob in the
sweep):

```typescript
// N10: per-NPC system-local board, sized to the NPC's own ship
const npcSystemBoard = (intent === 'Trade')
  ? generateManifestBoard(
      npc.currentSystemId,
      npcRng.fork('npc-board'),
      npc.ship,
      4,              // standard board size; swept as a knob
      nextState.eraEvent,
    )
  : null;

const { npc: updatedNpc, events: npcEvents, claimedContractIndex } =
  resolveNpcDay(npc, npcRng, {
    day: nextState.day,
    systemBoard: npcSystemBoard,
    claimableBoard: canClaim ? nextState.market.manifestBoard : null,
    eraEvent: nextState.eraEvent,
  });
```

> [!NOTE]
> Generating `manifestBoard` 30× per dusk costs `30 × 4 × rollContract` per day.
> `rollContract` is pure arithmetic (no I/O), and `quoteShipyard` over 30 captains
> (which is more expensive) is already in the envelope. Measure in the smoke run
> before deciding if a cap is needed.

#### [MODIFY] [npc.ts](file:///Users/vs7/Dev/Games/SpacerQuest/packages/engine/src/npc.ts) — remove dead-path guard

`NpcDayContext.intent` is not currently threaded to the context. For the board
generation in `day.ts` we need to know the intended verb before calling `resolveNpcDay`.
Two options:

**(a) Expose `pickIntent` from `resolveNpcDay` as an early return value** — add an
`intent` field to `NpcDayResult` so `day.ts` can read it post-hoc. *Con: the board is
generated after the fact; we'd need a second pass.*

**(b) Call `pickIntent` in `day.ts` before `resolveNpcDay`** — the same RNG draw must
happen in the same order inside `resolveNpcDay`, so we'd need the fork key to be
deterministic. *Con: double RNG consumption if the flaw fires.*

**(c) Always generate the board; let `executeTrade` ignore it if the day's verb is
not Trade.** — `systemBoard` is passed regardless; the internal branch in `executeTrade`
is already guarded. *Pro: simplest; board generation is cheap.*

**Recommendation: (c)** — always generate, internally ignored. The cost is 30 ×
`generateManifestBoard(…, 4)` calls per dusk regardless of verb split, which is
bounded and measurable.

---

### N11 — NPC Deed Registry

#### [MODIFY] [types.ts](file:///Users/vs7/Dev/Games/SpacerQuest/packages/engine/src/types.ts)

Add `registry` to `NpcState` — the SAME shape as `PlayerState.registry`:

```typescript
export interface NpcState {
  id: string;
  name: string;
  profileId: string;
  currentSystemId: number;
  credits: number;
  ship: ShipState;
  disposition: number;
  lastAction?: NpcAction;
  dead?: boolean;   // N3 seam (already documented here)
  /** N11 · Deed registry, same shape as PlayerState.registry. Fed by the
   *  NPC's real actions via evaluateNpcDeeds (npc.ts). Null until N11 ships
   *  (existing saves get a backfill via MIGRATIONS). */
  registry: DeedRegistryState;
}
```

#### [MODIFY] [state.ts](file:///Users/vs7/Dev/Games/SpacerQuest/packages/engine/src/state.ts) — `createInitialState`

Seed every NPC's registry at `{ earned: [], renownRank: 'LIEUTENANT', matchCounts: {} }`,
the same empty shell the player gets.

#### [MODIFY] [save.ts](file:///Users/vs7/Dev/Games/SpacerQuest/packages/engine/src/save.ts) — migration

Add `MIGRATIONS[current]` to backfill `npc.registry` on older saves:
```typescript
for (const npc of state.npcs) {
  npc.registry ??= { earned: [], renownRank: 'LIEUTENANT', matchCounts: {} };
}
```
Idempotent (the `??=` guard). No data is confiscated; no save throws.

#### [MODIFY] [schema.ts](file:///Users/vs7/Dev/Games/SpacerQuest/packages/engine/src/schema.ts)

Extend `NpcStateSchema` with `registry: DeedRegistryStateSchema` (the same schema
already used for `PlayerState.registry`).

#### [MODIFY] [npc.ts](file:///Users/vs7/Dev/Games/SpacerQuest/packages/engine/src/npc.ts) — `evaluateNpcDeeds`

A new function mirroring `evaluateDeeds` but operating on an `NpcState`:

```typescript
/**
 * N11 · Evaluate deed progress for an NPC against the events their day
 * produced. The SAME deed definitions and thresholds as the player — the
 * standing constraint demands it. Returns any DeedEarned / RenownRankUp
 * events to append to the day's event batch (for the wire and the Honor List).
 *
 * NOT the full evaluateDeeds function: NPCs never earn storylet deeds (no
 * authored content fires for them), so StoryletDeedProgress handling is
 * omitted. The subset that can fire: TradeEvent (hauls delivered),
 * EncounterResolved (fights won via N3's combat path), TravelEvent (jumps
 * completed). These are the events `resolveNpcDay` already emits.
 */
function evaluateNpcDeeds(
  npc: NpcState,
  sourceEvents: readonly GameEvent[],
  day: number,
): GameEvent[]
```

This function is called at the **end of `resolveNpcDay`**, after the verb and the refit,
so the deed check sees the day's full event batch:

```typescript
// N11 · Evaluate the day's events against the NPC's deed registry
const deedEvents = evaluateNpcDeeds(updatedNpc, events, ctx.day);
events.push(...deedEvents);
```

The deed events go into the returned `NpcDayResult.events`, and `day.ts` already
pushes those into the global event log — no change needed in `day.ts`.

**Rank-gated yard purchases:** `considerRefit` already calls `quoteShipyard(npc, action)`.
`quoteShipyard` gates special equipment on `actorRankIndex` (the rank index of the
actor's registry). Once `npc.registry` is populated, the existing gate opens naturally
with **no NPC branch** — which is the exact outcome N11's spec demands.

> [!NOTE]
> The `ShipyardActor` interface currently defines `registry?: DeedRegistryState`
> (optional, per the N2 "registry optional is a rule, not a gap" note). We change it
> to required now that every NPC has one. Check `quoteShipyard` and
> `applyShipyardMutation` to confirm no callers pass a partial actor.

---

## File Summary

| File | Change |
|------|--------|
| `packages/engine/src/npc.ts` | Add `pickContract`, extend `NpcDayContext.systemBoard`, update `executeTrade`, add `evaluateNpcDeeds`, call it at end of `resolveNpcDay` |
| `packages/engine/src/day.ts` | Generate per-NPC system board in the dusk loop; pass `systemBoard` to `NpcDayContext` |
| `packages/engine/src/types.ts` | Add `registry: DeedRegistryState` to `NpcState` |
| `packages/engine/src/state.ts` | Seed NPC registry in `createInitialState` |
| `packages/engine/src/save.ts` | Migration to backfill `npc.registry` on old saves |
| `packages/engine/src/schema.ts` | Add `registry` to `NpcStateSchema` |

---

## Verification Plan

### Automated Tests (smoke gate)
```sh
npm run balance:smoke -w @spacerquest/sim
npm test -w @spacerquest/engine
```

The smoke suite runs in ~1.5 s and will catch:
- `rulesFingerprint` moves (expected — we changed engine rule files)
- Solvency invariant violations (NPC broke due to board mispricing)
- Stat-check count invariant (every Trade/Travel/Combat day emits exactly 1 StatCheck)

### Capstone sweep (after smoke is green)
```sh
npm run balance:sweep -w @spacerquest/sim -- --label n10-n11 \
  --seeds 1000 --days 120 \
  --milestone-days 21,29,30,41,60,120 \
  --policies trader,trader-degraded,fighter,explorer,veteran,smuggler,gambler,greedy \
  --shard i/8   # × 8 shards
npm run balance:sweep -w @spacerquest/sim -- --label n10-n11 --merge
```

**Proves to check in the diff:**
- `ContractClaimed` rates scale with field size (not just when co-located)
- NPC wealth spread at day 60/120 is still within the solvency band
- At least some NPC `renownRank` progresses past `LIEUTENANT` by day 120
- `considerRefit` logs at least one special-equipment purchase by day 120

**Disproves to watch:**
- Boards empty at the player's system (cap too hot → tighten `NPC_BOARD_CLAIM_CHANCE`)
- Zero NPC deed accrual (event type mismatch in `evaluateNpcDeeds`)
- Wealth distribution collapses (all NPCs converge — archetype picker is a no-op)

### Re-extract smoke fixture (once, at the end)
```sh
npm run balance:extract -w @spacerquest/sim -- \
  --aggregate docs/balance/baseline-n10-n11.json
```
