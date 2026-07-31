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
 * DETERMINISM CONTRACT (§2.4): every draw runs off the same forked action rng
 * (`day.ts` forks on the action's event index) in a fixed documented order —
 * (1) POI type, (2) flavour name, (3) BAND, (4) ROW, (5) any within-payload roll.
 * A seed plus an action sequence reproduces the board exactly.
 *
 * T-111 · THE CLAIM/PAYOFF SPLIT. `resolveExploreOutcome` is unchanged and is the
 * PAYOFF resolver — the dusk payout in `day.ts` calls it too. In front of it sits
 * `claimOutcome`, which decides whether a drawn row is delivered today, delivered
 * today for EXTRA DICE, or opens the multi-day recovery slot; `bandFor` /
 * `recoveryDays` / `apCost` are the rule it reads (docs/EXPLORE_REDESIGN.md §3).
 *
 * T-131 (owner ruling D1, 2026-07-31) · THE CLAIM SPLIT IS THREE WAYS, NOT TWO.
 * The multi-day recovery is now BAND 2 only; bands 3-4 charge `apCost` extra dice
 * at claim and resolve same-day. See `claimOutcome`'s own header for the full
 * rule and for what that does to the rng stream.
 *
 * T-117 · THE DRAW IS NOW ONE WEIGHTED ROW PER BOARD. `drawOutcome` replaces the
 * transitional three-leg `drawLegacyLoot`, which is deleted with the content table
 * it read (`LEGACY_POI_LOOT`) and with the transitional `contraband` payload kind
 * — findings F-113-A and F-113-B, both discharged. Note what did NOT change with
 * them: the `ContrabandFound` EVENT VARIANT stays in `types.ts`/`schema.ts`.
 * Removing an event shape is save/schema surface and would drag a version bump
 * into a content pass; it simply stops being emitted.
 */

import {
  EXPLORE_ITEM_BY_ID,
  EXPLORE_OUTCOMES,
  EXPLORE_VALUE_BANDS,
  ExploreItemDefinition,
  ExploreOutcomeDefinition,
  ExploreValueBand,
  POI_DISCOVERY_TABLE,
  POI_KINDS,
  PoiType,
  ShipElementComponentId,
} from '@spacerquest/content';
import { DiscoveredPoi, GameEvent, GameState, ShipComponentId } from './types.js';
import { SeededRng } from './rng.js';
import { spendDie } from './dice.js';
import { fitExploreModule } from './components.js';
import { maxCargoPodsForShip } from './actions/shipyard.js';
import { fragmentCount, grantFragment } from './nemesis.js';
import { applyEffects } from './storylets.js';

/**
 * T-112 · COMPILE-TIME PIN between content's `ShipElementComponentId` (declared in
 * `exploration.ts`, because content must not import engine types) and the engine's
 * own `ShipComponentId`. If either union gains, loses or renames a member, this
 * fails `tsc` — so a Class-A row can never name a component the engine does not
 * have, and a renamed component can never leave a row silently dead.
 */
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _shipElementIdsAgree: AssertEqual<ShipComponentId, ShipElementComponentId> = true;
void _shipElementIdsAgree;

/** The documented `ComponentState.strength` bound — "1-199" on the interface in
 *  `types.ts`. Written once here so the Class-A clamp cites the type's own range
 *  rather than inventing a second ceiling. */
const COMPONENT_STRENGTH_MIN = 1;
const COMPONENT_STRENGTH_MAX = 199;

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
 *
 * T-131 (D1) · NARROWED TO BAND 2. Bands 3-4 return 0 here and charge `apCost`
 * below instead.
 */
export function recoveryDays(valuePoints: number): number {
  return bandFor(valuePoints).recoveryDays;
}

/**
 * T-131 (owner ruling D1, 2026-07-31) · HOW MANY EXTRA DICE a find of this value
 * costs AT CLAIM, on top of the sweep's own die, out of the SAME dawn hand
 * (docs/EXPLORE_REDESIGN.md §3.3, §5.2). Sibling of `recoveryDays` in every
 * respect: a rule over a content band table, NEVER a per-row constant —
 * `ExploreOutcomeDefinition` has no `apCost` key, so hand-tuning one row's dice
 * cost is a compile error rather than a review catch.
 *
 * 0 ⇒ the sweep's own die is the whole cost (bands 0-2).
 */
export function apCost(valuePoints: number): number {
  return bandFor(valuePoints).apCost;
}

/**
 * T-117 · THE DRAW INDEX — `EXPLORE_OUTCOMES` bucketed once, per POI type, by the
 * band each row's `valuePoints` falls in, in `EXPLORE_VALUE_BANDS` ORDER.
 *
 * Built at module load because the table is static, exactly as `OUTCOMES_BY_ID`
 * is: a 6,000-board reachability sweep re-filtering 100 rows per board is work
 * with no information in it. BANDS WITH NO ROW IN A POOL ARE ABSENT FROM THE
 * LIST, which is what `drawOutcome` renormalises over — the empty band is dropped
 * rather than special-cased at draw time.
 *
 * ORDER IS LOAD-BEARING: the cumulative walk in `drawOutcome` lands on whichever
 * entry the roll falls in, so the list must be built in one stable documented
 * order (ascending band) or a content edit could re-phase every seeded career.
 */
const ROWS_BY_POOL: ReadonlyMap<
  PoiType,
  readonly { band: ExploreValueBand; rows: readonly ExploreOutcomeDefinition[] }[]
> = new Map(
  (Object.keys(POI_KINDS) as PoiType[]).map((poiType) => [
    poiType,
    EXPLORE_VALUE_BANDS.map((band) => ({
      band,
      rows: EXPLORE_OUTCOMES.filter(
        (row) => row.pools.includes(poiType) && bandFor(row.valuePoints).band === band.band,
      ),
    })).filter((entry) => entry.rows.length > 0),
  ]),
);

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
 * T-112 · GRANT ONE UNIQUE ITEM — the `unique-item` resolver
 * (docs/EXPLORE_REDESIGN.md §4). Mutates the player's ship and pushes
 * `UniqueItemAcquired`.
 *
 * NO BRANCH ANYWHERE HERE IS KEYED ON A SPECIFIC ITEM ID. The two switches below
 * are on `item.class` and `delta.element` — ENGINE-OWNED KINDS, the same
 * discipline `resolveExploreOutcome` keeps over `payload.kind`. There is no
 * `itemId === …`, no `case 'item-…'` and no `moduleId === …` in the engine at
 * all: the Class-B grant is a list append (`fitExploreModule`), and the benefit
 * that append eventually buys is looked up from content at dawn.
 *
 * EXPORTED so the Class-A resolver is provable with test-local rows without
 * shipping speculative content — the same dependency-injection shape
 * `equipmentDiceBenefits(ship, table)` uses. `EXPLORE_ITEMS` ships only the three
 * Class-B modules at T-112; the authored item rows land with T-113/T-114/T-115.
 *
 * EVERY DELTA CALLS A RULE RATHER THAN RESTATING ONE: component strength clamps
 * to the `ComponentState` interface's own documented 1-199 bound, a `maxFuel`
 * grant accumulates into `bonusMaxFuel` and is realized by `economy.ts`
 * `syncMaxFuel` (F-112-B — writing `ship.maxFuel` here would be erased at the end
 * of the action), and a pod grant is capped by the SHIPYARD's own
 * `maxCargoPodsForShip`, never by a pod ceiling written a second time.
 *
 * ONE GRANT PATH, TWO CALLERS, FOR FREE: `resolveExploreOutcome` is reached both
 * by the same-day resolve and by T-111's deferred dusk payout, so a band-3/4 item
 * grants at the dusk of `dueDay` with no second code path.
 */
export function applyUniqueItem(
  state: GameState,
  item: ExploreItemDefinition,
  poi: DiscoveredPoi,
  events: GameEvent[],
): void {
  const ship = state.player.ship;
  if (item.class === 'module') {
    // Idempotent by construction — a repeated grant leaves one entry, so a
    // benefit can never be double-counted.
    fitExploreModule(ship, item.moduleId);
  } else {
    for (const delta of item.deltas) {
      switch (delta.element) {
        case 'component': {
          const component = ship[delta.component];
          component.strength = Math.min(
            COMPONENT_STRENGTH_MAX,
            Math.max(COMPONENT_STRENGTH_MIN, component.strength + delta.strength),
          );
          break;
        }
        case 'maxFuel': {
          // NOT `ship.maxFuel` — see F-112-B. The tank stays derived; this is the
          // stored additive term `syncMaxFuel` folds in at the end of the action.
          ship.bonusMaxFuel = (ship.bonusMaxFuel ?? 0) + delta.amount;
          break;
        }
        case 'cargoPods': {
          ship.cargoPods = Math.min(ship.cargoPods + delta.amount, maxCargoPodsForShip(ship));
          break;
        }
        default: {
          // Exhaustiveness: a new element class is a compile error here.
          const unreachable: never = delta;
          return unreachable;
        }
      }
    }
  }
  events.push({
    type: 'UniqueItemAcquired',
    day: state.day,
    itemId: item.id,
    poiId: poi.id,
    systemId: poi.systemId,
  });
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

    case 'unique-item': {
      // T-112 · The row names an ITEM; the engine owns what each ELEMENT CLASS
      // means. The lookup is DEFENSIVE — the `CREW_BY_ID[…]?.benefit` precedent
      // (dice.ts) for the same class of stored-content-id: a row (or a deferred
      // recovery) naming an item that no longer exists mutates nothing and still
      // emits the row's wire line below.
      const item = EXPLORE_ITEM_BY_ID[payload.itemId];
      if (item) applyUniqueItem(state, item, poi, events);
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
 * half above (docs/EXPLORE_REDESIGN.md §3). T-131 (owner ruling D1, 2026-07-31)
 * makes this a THREE-way split, not a two-way one:
 *
 *  - `recoveryDays === 0 && apCost === 0` (bands 0-1) → the row resolves TODAY,
 *    byte-for-byte as it did before T-111;
 *  - `recoveryDays > 0` (BAND 2 ONLY, since D1) → the row OPENS the single
 *    recovery slot and is delivered N days from now, at the dusk of `dueDay`, by
 *    `day.ts` endDay. Untouched by D1 in every particular;
 *  - `apCost > 0` (BANDS 3-4, new at D1) → the row resolves TODAY, but only
 *    after `apCost` MORE dice are spent out of the same dawn hand. If the hand
 *    cannot cover it the find is FORFEITED — `ExplorationFailed{reason:
 *    'insufficient-dice'}`, no downgrade and no partial payout.
 *
 * THE BAND-2 DEFER PATH CONSUMES NO RNG. That is load-bearing, not incidental —
 * the payload rolls at PAYOUT, off a fork of the dusk rng, which is what lets the
 * value be rolled fresh from the CURRENT content row rather than frozen onto the
 * save. The determinism contract at the top of this file is unchanged for it: a
 * board still draws (1) POI type, (2) flavour name, (3) outcome row, (4) any
 * within-payload roll — step (4) simply happens N days later.
 *
 * D1 · THE `apCost` PATH DOES CONSUME RNG AT CLAIM, and deliberately: it calls
 * `resolveExploreOutcome` on the spot, exactly as a band-0/1 find does, so step
 * (4) happens now. That is a real stream change for any seed whose board draws a
 * band-3/4 row and it is why the sim replay goldens moved with this task. The
 * FORFEIT path consumes none — nothing rolls, because nothing pays.
 *
 * T-117 · THE MULTI-LEG RE-PHASING IS GONE. While the transitional carrier lived,
 * a deferred row's skipped payload roll shifted every subsequent leg's chance roll
 * on the same board, because the three legs shared one rng. A board now draws
 * exactly one row, so the defer path's zero rng cost is the END of the board's
 * stream and cannot re-phase anything.
 *
 * THE SLOT-FREE PREDICATE is the same `player.recovery === null` the Explore verb
 * refuses on — one rule, not two. Under the single draw it is UNREACHABLE from the
 * Explore action (one board, one row, and the verb already refuses while a
 * recovery is open), and it is kept because `claimOutcome` is a general entry
 * point: a caller that ever delivers a second row must degrade to an immediate
 * resolve rather than silently dropping it.
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

  // T-131 (D1) · THE EXTRA-DICE CLAIM COST — bands 3-4. The sweep's own die is
  // already spent by `resolveExploration`; this charges `apCost` MORE out of the
  // same dawn hand, immediately.
  const extraDice = apCost(outcome.valuePoints);
  if (extraDice > 0) {
    // THE PICK IS A RULE, not an implementation detail: the LOWEST-VALUE unspent
    // dice first, ties broken by ascending index. The payment ignores die values
    // entirely (any die pays), so spending the cheapest ones deterministically
    // preserves the player's best dice for the checks still ahead in the day.
    // Read off the PRE-PAYMENT hand — the sort must not run against a hand being
    // mutated under it.
    const hand = state.player.dawnHand;
    const payable: number[] = [];
    if (hand) {
      for (let i = 0; i < hand.dice.length; i += 1) {
        if (!hand.spent[i]) payable.push(i);
      }
      payable.sort((a, b) => hand.dice[a] - hand.dice[b] || a - b);
    }

    if (payable.length < extraDice) {
      // FORFEITED. `dawnHand` is optional (`types.ts` `PlayerState`), and a
      // missing hand counts as insufficient — it falls out of the same compare.
      // `PoiDiscovered` and its wire line already fired upstream in
      // `resolveExploration` and are untouched: the player is told what was
      // found, only its recovery failed. No downgrade, no partial payout.
      events.push({
        type: 'ExplorationFailed',
        day: state.day,
        systemId: poi.systemId,
        reason: 'insufficient-dice',
      });
      events.push({
        type: 'WireEntry',
        day: state.day,
        kind: 'plain',
        message:
          `Player's crew could not raise the hands to lift the find off ${poi.name} — ` +
          `the haul was left where it lay.`,
      });
      return;
    }

    // Loop the ONE existing spend primitive (`dice.ts` `spendDie`, one index at a
    // time). There is deliberately no second multi-die spend surface.
    let paid = state.player.dawnHand!;
    for (const index of payable.slice(0, extraDice)) {
      paid = spendDie(paid, index).hand;
    }
    state.player.dawnHand = paid;
  }

  resolveExploreOutcome(state, outcome, poi, rng, events);
}

/**
 * T-117 · THE SINGLE BAND-WEIGHTED DRAW (docs/EXPLORE_REDESIGN.md §2.4, §5.1).
 * This is finding F-113-A discharged — the flip §2.4 pencilled into T-113,
 * re-reported by T-114, and owned by T-117 — the dedicated engine task F-113-A
 * recommended, inserted between T-114 and T-115.
 *
 * ONE ROW PER SUCCESSFUL BOARD. The transitional three-leg carrier it replaces
 * (`drawLegacyLoot` + `LEGACY_POI_LOOT`) is deleted with it, and so is the
 * transitional `contraband` payload kind that only that carrier could reach
 * (F-113-B).
 *
 * THE RULE, and every part of it reads content:
 *   1. filter `EXPLORE_OUTCOMES` to rows whose own `pools` include `poiType` —
 *      which pools exist and which rows are in them is content;
 *   2. group the survivors by `bandFor(valuePoints).band`;
 *   3. ONE `rng.next()` picks the BAND, weighted by `EXPLORE_VALUE_BANDS[].weight`
 *      RENORMALISED over the bands that actually have rows in this pool. The
 *      renormalisation is not a nicety: an empty band would otherwise swallow its
 *      share of the probability and the rarest rows would go unreachable;
 *   4. ONE `rng.next()` picks uniformly INSIDE the band. §5.1 is explicit that
 *      there is no row-level weight — rows in a band are equiprobable, which is
 *      what makes per-row probability (`bandWeight / rowsInBand`) analytically
 *      checkable rather than empirically guessed at.
 *
 * THE DRAW COST IS FIXED AT TWO `rng.next()` CALLS, always, even for a one-row
 * band. The legacy draw's single-id short-circuit existed only to reproduce the
 * pre-T-110 stream draw-for-draw and dies with the model it reproduced; a
 * conditional draw here would make the stream depend on how many rows an author
 * happened to write in a band.
 *
 * DETERMINISM ORDER, unchanged from §2.4: (1) POI type, (2) flavour name,
 * (3) band, (4) row, (5) any within-payload roll — where step (5) happens N days
 * later for a deferred find, off a fork of the dusk rng.
 *
 * THE ROW GOES TO `claimOutcome`, NOT to `resolveExploreOutcome`: a band-2+ row
 * opens the multi-day recovery slot instead of paying out today (T-111, §3).
 *
 * Returns `undefined` only if the pool is empty of rows — content integrity is
 * asserted in `__tests__/exploreContent.test.ts`, never enforced by a throw.
 */
export function drawOutcome(
  poiType: PoiType,
  rng: SeededRng,
): ExploreOutcomeDefinition | undefined {
  const byBand = ROWS_BY_POOL.get(poiType);
  if (!byBand || byBand.length === 0) return undefined;

  const totalWeight = byBand.reduce((sum, entry) => sum + entry.band.weight, 0);
  if (totalWeight <= 0) return undefined;

  const roll = rng.next() * totalWeight;
  let cumulative = 0;
  // The seed is the LAST entry, so a floating-point roll that lands exactly on
  // the total still resolves to a real band rather than to `undefined`.
  let chosen = byBand[byBand.length - 1];
  for (const entry of byBand) {
    cumulative += entry.band.weight;
    if (roll < cumulative) {
      chosen = entry;
      break;
    }
  }

  // Consumed UNCONDITIONALLY — see the fixed two-draw cost above.
  const index = Math.floor(rng.next() * chosen.rows.length);
  return chosen.rows[index] ?? chosen.rows[0];
}
