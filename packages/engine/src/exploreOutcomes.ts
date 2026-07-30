/**
 * T-110 · THE EXPLORE OUTCOME FRAMEWORK — the engine half.
 *
 * An explore payoff is a CONTENT ROW (`ExploreOutcomeDefinition`) carrying a
 * discriminated payload; this module is the generic resolver for it. The engine
 * knows what a payload KIND means and nothing about which instances exist, so
 * authoring the 74th explore outcome is a row in
 * `packages/content/src/exploration.ts` and zero lines here
 * (docs/EXPLORE_REDESIGN.md §2.3).
 *
 * DETERMINISM CONTRACT (unchanged from T-111b, §2.4): every draw runs off the
 * same forked action rng (`day.ts` forks on the action's event index) in a fixed
 * documented order — (1) POI type, (2) flavour name, (3) outcome row, (4) any
 * within-payload roll. A seed plus an action sequence reproduces the board
 * exactly.
 *
 * T-111 · THE CLAIM/PAYOFF SPLIT. `resolveExploreOutcome` is unchanged and is the
 * PAYOFF resolver — the dusk payout in `day.ts` calls it too. In front of it sits
 * `claimOutcome`, which decides whether a drawn row is delivered today or opens
 * the multi-day recovery slot; `bandFor` / `recoveryDays` are the rule it reads
 * (docs/EXPLORE_REDESIGN.md §3).
 */

import {
  EXPLORE_OUTCOMES,
  EXPLORE_VALUE_BANDS,
  ExploreOutcomeDefinition,
  ExploreValueBand,
  LEGACY_POI_LOOT,
  POI_DISCOVERY_TABLE,
  POI_KINDS,
  PoiType,
} from '@spacerquest/content';
import { DiscoveredPoi, GameEvent, GameState } from './types.js';
import { SeededRng } from './rng.js';
import { fragmentCount, grantFragment } from './nemesis.js';
import { applyEffects } from './storylets.js';

/** Row lookup by id — built once; the draw tables address rows by id only. */
const OUTCOMES_BY_ID: ReadonlyMap<string, ExploreOutcomeDefinition> = new Map(
  EXPLORE_OUTCOMES.map((outcome) => [outcome.id, outcome]),
);

/** Row lookup by id, as a narrow accessor. The MAP stays module-scoped — a
 *  caller that needs one row asks for one row; nothing outside this module gets
 *  to iterate or mutate the index. READER: the dusk payout in `day.ts`, which
 *  holds only a stored `outcomeId` and must tolerate it no longer resolving. */
export function outcomeById(id: string): ExploreOutcomeDefinition | undefined {
  return OUTCOMES_BY_ID.get(id);
}

/**
 * THE BAND A `valuePoints` FALLS IN — the highest band whose `minValuePoints` is
 * satisfied. This is `rankForDeedCount` (deeds.ts) with a different table: walk
 * the ordered content list, keep the LAST satisfied entry.
 *
 * NOT EXPORTED, and deliberately so: the Hangout track has its own band lookup
 * (`wagerBandFor`) and a bare `bandFor` on a barrel would collide. If it ever
 * must be imported widely, it gets the name `valueBandFor` — not a re-export.
 */
function bandFor(valuePoints: number): ExploreValueBand {
  // The first band is the floor. `EXPLORE_VALUE_BANDS[0]` starts at 0 and
  // `valuePoints` is non-negative, so the walk always satisfies at least it —
  // but the seed keeps the return type honest without a non-null assertion.
  let band = EXPLORE_VALUE_BANDS[0];
  for (const candidate of EXPLORE_VALUE_BANDS) {
    if (valuePoints >= candidate.minValuePoints) {
      band = candidate;
    }
  }
  return band;
}

/**
 * N — how many CALENDAR DAYS a find of this value takes to recover
 * (docs/EXPLORE_REDESIGN.md §3.2). A rule over a content band table, NEVER a
 * per-row constant: `ExploreOutcomeDefinition` has no `recoveryDays` key, so
 * hand-tuning one row's clock is a compile error rather than a review catch.
 *
 * 0 ⇒ resolved same-day, exactly like the pre-T-111 instant loot.
 */
export function recoveryDays(valuePoints: number): number {
  return bandFor(valuePoints).recoveryDays;
}

/** Deterministically pick one flavor name off the forked action rng. */
function chooseName(rng: SeededRng, names: readonly string[]): string {
  const name = names[Math.floor(rng.next() * names.length)];
  return name ?? names[0] ?? 'an uncharted signal';
}

/**
 * Draw the POI type and its flavour name — TWO rng draws, in that order. The
 * type comes off `POI_DISCOVERY_TABLE` as a cumulative walk, so which types
 * exist is content: the engine never names one.
 */
export function drawPoiKind(rng: SeededRng): { type: PoiType; name: string } {
  const roll = rng.next();
  let cumulative = 0;
  let type = POI_DISCOVERY_TABLE[POI_DISCOVERY_TABLE.length - 1].type;
  for (const entry of POI_DISCOVERY_TABLE) {
    cumulative += entry.chance;
    if (roll < cumulative) {
      type = entry.type;
      break;
    }
  }
  return { type, name: chooseName(rng, POI_KINDS[type].names) };
}

/**
 * Resolve ONE outcome row against the live state. Mutates `state` (credits, the
 * nemesis file, flags, schedules, standing) and pushes typed events. Every arm
 * below is a rule the ENGINE owns; the row supplies only its parameters.
 */
export function resolveExploreOutcome(
  state: GameState,
  outcome: ExploreOutcomeDefinition,
  poi: DiscoveredPoi,
  rng: SeededRng,
  events: GameEvent[],
): void {
  const payload = outcome.payload;
  switch (payload.kind) {
    case 'salvage': {
      // Uniform over the INCLUSIVE band: `min + floor(rng * (max - min + 1))`.
      const span = payload.maxCredits - payload.minCredits + 1;
      const amount = payload.minCredits + Math.floor(rng.next() * span);
      state.player.credits += amount;
      events.push({
        type: 'SalvageRecovered',
        day: state.day,
        poiId: poi.id,
        systemId: poi.systemId,
        amount,
      });
      break;
    }

    case 'lore': {
      // Either field may be absent; BOTH absent is the §2.2 DEAD END — prose and
      // the wire line only, which is a shape, not a branch of its own.
      if (payload.fragmentId !== undefined) {
        const added = grantFragment(
          state.player.nemesisFile,
          payload.fragmentId,
          poi.type,
          state.day,
        );
        // Dedupe keeps the count monotonic, so a repeat id emits nothing.
        if (added) {
          events.push({
            type: 'FragmentAcquired',
            day: state.day,
            fragmentId: payload.fragmentId,
            source: poi.type,
            fragmentCount: fragmentCount(state.player.nemesisFile),
            poiId: poi.id,
          });
          events.push({
            type: 'WireEntry',
            day: state.day,
            kind: 'plain',
            message: `Player's Nemesis file logged a new Signal Fragment recovered off ${poi.name}.`,
          });
        }
      }
      if (payload.effects !== undefined) {
        // §2.3's synthetic pair — the `resolveAbandonedChains` idiom
        // (`applyEffects(state, def.id, 'wire-resolution', …)`).
        events.push(...applyEffects(state, outcome.id, 'explore', payload.effects));
      }
      break;
    }

    case 'contraband': {
      // F-110-A · TRANSITIONAL, retired by T-113. A sealed pod arms the
      // carry-choice storylet via a flag; the pod is not stowed here.
      state.flags['signal.contraband.pending'] = true;
      events.push({
        type: 'ContrabandFound',
        day: state.day,
        poiId: poi.id,
        systemId: poi.systemId,
      });
      break;
    }

    case 'unique-item': {
      // T-112 SEAM · There is no grant surface for an explore module yet: the
      // ship's special equipment is a fixed set of named `ShipState` booleans
      // read by `hasSpecialEquipment`, and the three explore modules
      // (`EXPLORE_MODULES` / `EXPLORE_MODULE_DICE_BENEFITS`, spec §4/§6) do not
      // exist. T-112 fills this arm; until then the find is prose only — the
      // wire line below is emitted and NOTHING else is mutated. Inventing a
      // stand-in grant here would be a rule the framework has not settled.
      break;
    }

    case 'questline': {
      // A questline find SCHEDULES its episode; the storylet's own
      // `StoryletTrigger` gates decide whether it is offerable (§2.5).
      events.push(
        ...applyEffects(state, outcome.id, 'explore', {
          schedule: [{ storyletId: payload.storyletId, delayDays: payload.delayDays }],
        }),
      );
      break;
    }

    case 'npc': {
      events.push(
        ...applyEffects(state, outcome.id, 'explore', {
          disposition: [{ npcId: payload.profileId, delta: payload.dispositionDelta }],
        }),
      );
      break;
    }

    default: {
      // Exhaustiveness: a new payload kind is a compile error here, which is how
      // the framework refuses to silently swallow an unresolvable row.
      const unreachable: never = payload;
      return unreachable;
    }
  }

  // The row's own prose, AFTER its mechanical effect. Guarded on non-empty
  // (F-110-B): the legacy rows carry no copy, because emitting a line for them
  // would add a WireEntry per boarded POI and move the shipped replay goldens.
  if (outcome.wireFound !== '') {
    events.push({
      type: 'WireEntry',
      day: state.day,
      kind: 'plain',
      message: outcome.wireFound.replace('{name}', poi.name),
    });
  }
}

/**
 * T-111 · DELIVER A DRAWN ROW — the CLAIM half, sitting in front of the PAYOFF
 * half above (docs/EXPLORE_REDESIGN.md §3). One of two things happens:
 *
 *  - `recoveryDays(valuePoints) === 0` (bands 0-1) → the row resolves TODAY,
 *    byte-for-byte as it did before T-111;
 *  - otherwise → the row OPENS the single recovery slot and is delivered N days
 *    from now, at the dusk of `dueDay`, by `day.ts` endDay.
 *
 * THE DEFER PATH CONSUMES NO RNG. That is load-bearing, not incidental — the
 * payload rolls at PAYOUT, off a fork of the dusk rng, which is what lets the
 * value be rolled fresh from the CURRENT content row rather than frozen onto the
 * save. The determinism contract at the top of this file is unchanged: a board
 * still draws (1) POI type, (2) flavour name, (3) outcome row, (4) any
 * within-payload roll — step (4) simply happens N days later.
 *
 * MEASURED CONSEQUENCE, stated rather than glossed: in the LEGACY multi-leg draw
 * the three legs share one rng, so a deferred row's skipped payload roll shifts
 * every subsequent leg's chance roll on that board. A 300-seed sweep moves from
 * 202/96/57 salvage/fragment/contraband events to 79/102/44 plus 136 deferred
 * recoveries. That is a real behaviour change (T-111 is not an inert extraction),
 * it is re-pinned in `__tests__/exploreOutcomes.test.ts` with a ledger entry, and
 * it disappears with the multi-leg draw itself at T-113.
 *
 * THE SLOT-FREE PREDICATE is the same `player.recovery === null` the Explore verb
 * refuses on — one rule, not two. It matters only for the legacy MULTI-LEG draw,
 * which is the sole way one board can produce two recovery-bearing rows; a second
 * such row resolves immediately rather than being dropped.
 * T-113: unreachable once the draw is a single weighted row.
 */
export function claimOutcome(
  state: GameState,
  outcome: ExploreOutcomeDefinition,
  poi: DiscoveredPoi,
  rng: SeededRng,
  events: GameEvent[],
): void {
  const days = recoveryDays(outcome.valuePoints);
  if (days > 0 && state.player.recovery === null) {
    const dueDay = state.day + days;
    state.player.recovery = {
      outcomeId: outcome.id,
      poiId: poi.id,
      systemId: poi.systemId,
      startedDay: state.day,
      dueDay,
    };
    events.push({
      type: 'RecoveryStarted',
      day: state.day,
      outcomeId: outcome.id,
      poiId: poi.id,
      systemId: poi.systemId,
      dueDay,
    });
    events.push({
      type: 'WireEntry',
      day: state.day,
      kind: 'plain',
      message:
        `Player's crew rigged a salvage op on ${poi.name} — too much to lift in a day. ` +
        `The ship holds station until day ${dueDay}.`,
    });
    return;
  }
  resolveExploreOutcome(state, outcome, poi, rng, events);
}

/**
 * THE LEGACY DRAW (T-111b's model, kept alive for the extraction span).
 *
 * §2.4: today's three legs are INDEPENDENT — a lucky board yields salvage AND a
 * fragment AND a pod — so a single weighted draw is not behaviour-preserving.
 * This walks `LEGACY_POI_LOOT`'s three legs in the shipped order, each its own
 * chance roll off the action rng, and hands whatever fires to the generic
 * resolver above. T-113 replaces this ONE CALL with the weighted draw over
 * `EXPLORE_OUTCOMES` and this function goes away with the table it reads.
 *
 * Determinism, leg by leg, matching the pre-T-110 resolver draw for draw:
 *  - the empty-leg guard SHORT-CIRCUITS the chance roll (no ids ⇒ no draw);
 *  - a single-id leg consumes NO pick draw, only its chance roll;
 *  - a multi-id leg consumes exactly one further draw for the index;
 *  - a zero-chance leg still CONSUMES its chance roll (the beacon's contraband).
 */
export function drawLegacyLoot(
  state: GameState,
  poi: DiscoveredPoi,
  rng: SeededRng,
  events: GameEvent[],
): void {
  const table = LEGACY_POI_LOOT[poi.type];
  for (const leg of [table.salvage, table.fragment, table.contraband]) {
    if (leg.outcomeIds.length === 0) continue;
    if (rng.next() >= leg.chance) continue;
    const id =
      leg.outcomeIds.length === 1
        ? leg.outcomeIds[0]
        : leg.outcomeIds[Math.floor(rng.next() * leg.outcomeIds.length)];
    const row = OUTCOMES_BY_ID.get(id);
    // A dangling id resolves to nothing and consumes nothing — content integrity
    // is asserted in `__tests__/exploreOutcomes.test.ts`, not enforced by a throw.
    // T-111: through `claimOutcome`, not `resolveExploreOutcome` — a band-2+ row
    // opens the recovery slot instead of paying out today. The leg chance rolls
    // and index draws in THIS function are untouched; the shift a deferred row
    // causes downstream comes from its skipped PAYLOAD roll, which the three legs
    // share an rng with. See `claimOutcome`'s header for the measured size of it.
    if (row) claimOutcome(state, row, poi, rng, events);
  }
}
