import {
  DEEDS,
  RENOWN_DEED_THRESHOLDS,
  RENOWN_RANKS,
  type DeedDefinition,
  type FieldMatcher,
  type RenownRankDefinition,
  type RenownRankId,
  type StateMatcher,
} from '@spacerquest/content';
import { DeedRegistryState, GameEvent, GameState, ShipState } from './types.js';
// T-1703 · The demo gate's ONE predicate set. This import and `demo.ts`'s import
// of `rankForDeedCount` form a two-module ESM cycle, deliberately and safely:
// both files export nothing but FUNCTION DECLARATIONS, which are hoisted, and
// neither calls into the other at module scope — so whichever loads first
// completes its evaluation before either function is ever invoked. The
// alternative was a second copy of the demo predicate inside `deeds.ts`, and a
// gate that exists in two places is a gate that drifts.
import { demoLocked } from './demo.js';

/**
 * The per-event-type field ALLOWLIST a deed's matchers may name. A matcher whose
 * path is not listed here makes `matchesEvent` return false, so the deed can
 * never fire — which is why this list, and not content, is the single source of
 * truth for "which deeds are earnable at all".
 *
 * EXPORTED (T-1504) so the engine deed test can assert every shipped deed's
 * eventType and matcher paths against it — the mechanical proof that no deed is
 * silently unearnable. Not re-exported from the package barrel: it is an internal
 * mechanism, not a UI/sim surface.
 *
 * T-1504 added the new-verb event types (gambling / smuggling / lending /
 * exploration / property / crew / tribute / signal fragments). Adding a type here
 * grants nothing on its own — a deed must still name it.
 */
export const EVENT_PATHS: Readonly<Record<string, readonly string[]>> = {
  TradeEvent: [
    'action',
    'success',
    'amount',
    'fuelAmount',
    'cost',
    'destination',
    'cargoType',
    'payment',
  ],
  TravelEvent: [
    'success',
    'origin',
    'destination',
    'fuelUsed',
    'interrupted',
    'resumedFromEncounterId',
  ],
  EncounterResolved: ['resolution', 'round', 'interceptorId'],
  DebtPayment: ['amount', 'remaining'],
  TourOneResolved: ['outcome', 'debtOutstanding'],
  StatCheck: ['actor', 'stat', 'dc', 'result.success', 'result.total', 'actionContext'],
  ShipyardEvent: ['action', 'cost', 'component', 'tier', 'repairMode', 'quantity', 'equipment'],
  StoryletDeedProgress: ['storyletId', 'choiceId', 'deedId', 'amount'],
  // --- T-1504 · new-verb event types ---------------------------------------
  // T-1303 Spacers Hangout. NOTE for content authors: a FAILED hangout action
  // (malformed die / absent opponent) emits the same `venue` with a `failReason`
  // and no `wager`, so a gambling deed guards on `wager` (or `playerWon`) to
  // require a Dare that actually happened.
  HangoutEvent: ['venue', 'opponentId', 'wager', 'playerWon', 'creditsDelta', 'success'],
  // T-1304 Penny Wise lending — one event type covering the whole loan
  // lifecycle via `kind` ('borrowed' | 'accrued' | 'repaid' | 'defaulted').
  LoanEvent: [
    'kind',
    'lender',
    'principal',
    'dailyRate',
    'interest',
    'amountPaid',
    'outstanding',
    'cleared',
  ],
  // T-1307 port stakes — `kind` splits the purchase from the dusk launch-fee
  // income accrual.
  PortEvent: ['kind', 'systemId', 'cost', 'income', 'portCount'],
  // T-1306 crew.
  CrewEvent: ['kind', 'roleId', 'cost', 'amount', 'berths', 'crewCount'],
  // T-111a/b off-lane exploration.
  PoiDiscovered: ['poiId', 'poiType', 'systemId', 'name'],
  SalvageRecovered: ['poiId', 'systemId', 'amount'],
  FragmentAcquired: ['fragmentId', 'source', 'fragmentCount', 'poiId'],
  // T-1305 patrol contraband scans (emitted inside a Travel action's event
  // batch, so they reach evaluateDeeds through the normal action path).
  ContrabandScan: ['caught', 'interceptorId', 'encounterId'],
  ContrabandConfiscated: [
    'fine',
    'creditsRemaining',
    'confiscatedContract',
    'confiscatedPod',
    'encounterId',
  ],
  // T-1207 combat tribute.
  TributePaid: ['amount', 'round', 'creditsRemaining', 'encounterId'],
  // T-147 · the Liar's Dice completion signal. `scope` discriminates the two deed
  // families (a house cleared vs the whole roster); `systemId` is the
  // port-discriminating path the fourteen per-port deeds need.
  // `opponentId`/`beatenCount` are DELIBERATELY UNLISTED — an allowlist grants
  // exactly what a matcher names, and no shipped deed names either. This is an
  // ALLOWLIST ENTRY, not a DSL change: `matchesEvent`, `readPath`, `FieldMatcher`
  // and `DeedTrigger` are untouched, and a numeric `equals` already worked.
  LiarsDiceSetCleared: ['scope', 'systemId'],
};

/** The allowlist for `trigger.state` matchers (read off GameState, not the
 *  event). Exported alongside EVENT_PATHS for the same T-1504 test guard. */
export const STATE_PATHS = ['player.ship.fuel'] as const;

export const RENOWN_RANK_ORDER = Object.keys(RENOWN_RANKS) as RenownRankId[];

type ComparableValue = string | number | boolean;
type DeedCandidate = {
  deed: DeedDefinition;
  definitionIndex: number;
  anchorIndex: number;
};

function readPath(source: unknown, path: string): unknown {
  let current = source;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isAllowedEventPath(eventType: string, path: string): boolean {
  return EVENT_PATHS[eventType]?.includes(path) === true;
}

function isAllowedStatePath(path: string): boolean {
  return STATE_PATHS.includes(path as (typeof STATE_PATHS)[number]);
}

function isComparableValue(value: unknown): value is ComparableValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function matchesValue(value: unknown, matcher: FieldMatcher | StateMatcher): boolean {
  if (matcher.equals !== undefined && value !== matcher.equals) {
    return false;
  }
  if (matcher.gte !== undefined && (typeof value !== 'number' || value < matcher.gte)) {
    return false;
  }
  if (matcher.lte !== undefined && (typeof value !== 'number' || value > matcher.lte)) {
    return false;
  }
  return isComparableValue(value);
}

/** Storylet deed progress carries an explicit `amount` and is keyed by `deedId`,
 *  so it is credited directly to matchCounts rather than counted as a generic
 *  trigger match. Clamp to a positive integer so content can't stall or reverse
 *  a count. */
function clampProgressAmount(amount: number): number {
  return Math.max(1, Math.floor(amount));
}

function matchesEvent(event: GameEvent, deed: DeedDefinition): boolean {
  // StoryletDeedProgress never counts as a generic trigger match — it advances
  // the named deed's count directly (see evaluateDeeds / computeMatchCounts).
  if (event.type === 'StoryletDeedProgress') {
    return false;
  }
  if (event.type !== deed.trigger.eventType) {
    return false;
  }

  for (const matcher of deed.trigger.match ?? []) {
    if (!isAllowedEventPath(deed.trigger.eventType, matcher.path)) {
      return false;
    }
    if (!matchesValue(readPath(event, matcher.path), matcher)) {
      return false;
    }
  }

  return true;
}

/**
 * N11 · The `trigger.state` matcher, evaluated against ONE ACTOR.
 *
 * `STATE_PATHS` is the single allowlist and it names `player.ship.fuel`. The
 * source is a `{ player: actor }` view rather than the whole `GameState`, so the
 * allowlisted string stays LITERALLY TRUE for both sides: the player's own
 * evaluation passes `state.player` and reads its own tank; a captain's passes the
 * `NpcState` and reads theirs. `fuel_fumes_arrival` is therefore earnable by a
 * captain limping in on fumes on exactly the same terms.
 *
 * The reverted attempt (`7334c5d5`) SKIPPED every deed carrying a `state` matcher
 * for the NPC path, which made those deeds strictly easier for a captain than for
 * the player — an exemption in the direction of N11's own renown-inflation
 * Disproves limb. Scoping the read is what removes the need for a skip at all.
 */
function matchesState(actor: DeedActor, matchers: readonly StateMatcher[] | undefined): boolean {
  const source = { player: actor };
  for (const matcher of matchers ?? []) {
    if (!isAllowedStatePath(matcher.path)) {
      return false;
    }
    if (!matchesValue(readPath(source, matcher.path), matcher)) {
      return false;
    }
  }
  return true;
}

function citationFor(deed: DeedDefinition, day: number): string {
  return deed.citationTemplate.replaceAll('{day}', String(day));
}

/** A single unit of count progress for a deed within the source batch: a real
 *  trigger match weighs 1, a StoryletDeedProgress weighs its clamped amount. */
type CountContribution = { index: number; amount: number };

function anchorIndexFor(
  deed: DeedDefinition,
  contributions: readonly CountContribution[],
  previousCount: number,
): number {
  const first = contributions[0]?.index ?? 0;
  if (!deed.trigger.count) {
    return first;
  }

  // The threshold is crossed by the contribution that carries the running total
  // to count.gte. If the batch never reaches it (crossed in history), fall back
  // to the first contribution — matches legacy behavior.
  let running = previousCount;
  for (const contribution of contributions) {
    running += contribution.amount;
    if (running >= deed.trigger.count.gte) {
      return contribution.index;
    }
  }

  return first;
}

export function renownRankIndex(rank: RenownRankId): number {
  return RENOWN_RANK_ORDER.indexOf(rank);
}

/**
 * T-1401 · The next renown rank above `rank` in the canonical RENOWN_RANK_ORDER,
 * or null at the top (CONQUEROR). The single engine-owned source for "what rank
 * comes next", reading the same ordered rank list the whole engine ranks against.
 * CONSUMER: T-1402's `deedRegistry` (ui format.ts, ~L801), which today re-sorts
 * RENOWN_DEED_THRESHOLDS by threshold to find the next rank — a parallel ordering
 * the UI shouldn't own; it consumes this instead.
 */
export function nextRankFor(rank: RenownRankId): RenownRankId | null {
  return RENOWN_RANK_ORDER[renownRankIndex(rank) + 1] ?? null;
}

export function rankForDeedCount(deedCount: number): RenownRankId {
  let rank: RenownRankId = 'LIEUTENANT';
  for (const candidate of RENOWN_RANK_ORDER) {
    if (deedCount >= RENOWN_DEED_THRESHOLDS[candidate]) {
      rank = candidate;
    }
  }
  return rank;
}

/**
 * N11 · THE CAPTAIN A DEED IS ACCRUED AGAINST.
 *
 * IT IS DELIBERATELY STRUCTURAL, NOT AN ADAPTER — the same argument
 * `ShipyardActor` (`actions/shipyard.ts`) records at its own definition site.
 * `PlayerState` satisfies this as-is (it has a `registry` and a `ship`) and so
 * does `NpcState` (from v12 on it has both), so BOTH captains are passed to the
 * SAME function with no wrapper object on either side. That matters for more than
 * tidiness: {@link accrueDeeds} PUSHES onto `actor.registry.earned`, and a wrapper
 * would have made that write land on a copy.
 *
 * `ship` is here because a deed's `trigger.state` matchers read the actor's tank
 * (`STATE_PATHS` = `player.ship.fuel`); see {@link matchesState}.
 */
export interface DeedActor {
  registry: DeedRegistryState;
  ship: ShipState;
}

/**
 * N11 · The ONE deed-registry seed, called from all three sites that can bring a
 * registry into existence: `createInitialState` (world creation, player AND every
 * captain), `deserializeState` (the raw JSON path) and `MIGRATIONS[11]` (the
 * envelope path). N1's recorded precedent is why it is a function and not three
 * inline literals — `MIGRATIONS[9]` "calls `npcShipForTier` rather than restating
 * it", and the reverted attempt (`7334c5d5`) inlined this shell in three places so
 * a migrated roster could drift from a freshly created one.
 *
 * THE RANK COMES FROM {@link rankForDeedCount}, never from the literal
 * `'LIEUTENANT'`. That is what makes "no second ladder" true at the SEED site too:
 * a rescale of `RENOWN_DEED_THRESHOLDS` that ever moved the zero-deed rung would
 * be honoured here without an edit.
 */
export function emptyDeedRegistry(): DeedRegistryState {
  return { earned: [], renownRank: rankForDeedCount(0), matchCounts: {} };
}

/** One-time scan used only when reconstructing a registry from a raw event log
 *  (deserialize/save-compat). Runtime evaluation never calls this — it relies on
 *  the cached registry.matchCounts. */
export function computeMatchCounts(eventLog: readonly GameEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of eventLog) {
    if (event.type === 'StoryletDeedProgress') {
      counts[event.deedId] = (counts[event.deedId] ?? 0) + clampProgressAmount(event.amount);
      continue;
    }
    for (const deed of DEEDS) {
      if (matchesEvent(event, deed)) {
        counts[deed.id] = (counts[deed.id] ?? 0) + 1;
      }
    }
  }
  return counts;
}

/**
 * N11 · What an accrual needs to know that is NOT a property of the captain: the
 * day it is, where the source batch sits in the log (if anywhere), and whether the
 * career's licence withholds CONQUEROR.
 */
export interface DeedAccrualContext {
  day: number;
  /**
   * The index in `state.eventLog` the source batch will occupy, when the batch IS
   * going into the log. OMITTED means it is not: a captain's accrual batch is
   * per-captain and local (see `npc.ts`), so there is no index into the shared log
   * to record and none is written. That absence is the whole reason
   * `EarnedDeedState.eventIndex` is optional — the reverted attempt (`7334c5d5`)
   * stuffed `eventIndex: 0` into every NPC row, which is a fabricated pointer into
   * a log that does not contain the event.
   */
  sourceStartIndex?: number;
  /** Whether this career's edition withholds the CONQUEROR capstone. Passed in
   *  rather than derived here so both sides go through the SAME `demoLocked`
   *  predicate (`demo.ts`) — see the ceiling comment at the write site below. */
  conquerorLocked: boolean;
}

/**
 * N11 · THE DEED MACHINERY, actor-shaped. One matcher, one count ladder, one rank
 * derivation, one set of emitted events — for the player and for all thirty
 * captains. {@link evaluateDeeds} is now a three-line wrapper over this.
 *
 * WHY IT IS THIS AND NOT A SECOND EVALUATOR. The standing constraint
 * (`docs/NPC_REDESIGN.md`, "same rules, no exemptions"): *"Where an NPC cannot use
 * the engine's own function today, the fix is to make the function usable by both
 * (give it an actor parameter), never to write the NPC a private one."* The
 * reverted attempt's `evaluateNpcDeeds` reimplemented the matcher, the dotted-path
 * reader, the count logic and the rank-up emission — the R2c failure mode verbatim,
 * a second copy that agrees with the first until it drifts.
 *
 * COST, because the NPC path calls it thirty times a day. It is O(sourceEvents ×
 * DEEDS) and NOTHING here scans `eventLog`: the historical count comes from the
 * cached `registry.matchCounts`. A captain's batch is at most four events against the 44 shipped `DEEDS`,
 * and the accrual DRAWS NO RNG — which is what keeps the day-loop event goldens
 * byte-identical (see `fixtures/day-loop-golden.ts`). The `sourceEvents.length === 0`
 * early return means an Idle / Patrol / Socialize day costs nothing at all.
 */
export function accrueDeeds(
  actor: DeedActor,
  sourceEvents: readonly GameEvent[],
  ctx: DeedAccrualContext,
): GameEvent[] {
  if (sourceEvents.length === 0) {
    return [];
  }

  const emitted: GameEvent[] = [];
  const registry = actor.registry;
  const earnedIds = new Set(registry.earned.map((deed) => deed.id));
  // Absent ⇒ the batch is local and 0-based indices order the candidates without
  // ever being recorded. See DeedAccrualContext.sourceStartIndex.
  const sourceStartIndex = ctx.sourceStartIndex ?? 0;
  const recordEventIndex = ctx.sourceStartIndex !== undefined;
  const candidates: DeedCandidate[] = [];

  // Storylet deed progress advances a named count deed directly (dead wire fix):
  // collect each StoryletDeedProgress as a weighted contribution keyed by deedId.
  const storyletProgress = new Map<string, CountContribution[]>();
  sourceEvents.forEach((event, index) => {
    if (event.type !== 'StoryletDeedProgress') {
      return;
    }
    const contributions = storyletProgress.get(event.deedId) ?? [];
    contributions.push({
      index: sourceStartIndex + index,
      amount: clampProgressAmount(event.amount),
    });
    storyletProgress.set(event.deedId, contributions);
  });

  for (const [definitionIndex, deed] of DEEDS.entries()) {
    if (earnedIds.has(deed.id)) {
      continue;
    }

    const triggerMatches = sourceEvents
      .map((event, index) => ({ event, index: sourceStartIndex + index }))
      .filter(({ event }) => matchesEvent(event, deed));

    // Only count-gte deeds can be advanced by storylet progress that names them.
    const progress = deed.trigger.count ? (storyletProgress.get(deed.id) ?? []) : [];

    if (triggerMatches.length === 0 && progress.length === 0) {
      continue;
    }

    // Event-ordered contribution list: real matches weigh 1, storylet progress
    // weighs its clamped amount. Cached cumulative counts keep evaluation
    // O(sourceEvents), independent of eventLog length.
    const contributions: CountContribution[] = [
      ...triggerMatches.map((match) => ({ index: match.index, amount: 1 })),
      ...progress,
    ].sort((left, right) => left.index - right.index);

    const previousCount = registry.matchCounts[deed.id] ?? 0;
    const increment = contributions.reduce((sum, contribution) => sum + contribution.amount, 0);
    const totalCount = previousCount + increment;
    registry.matchCounts[deed.id] = totalCount;

    if (deed.trigger.count && totalCount < deed.trigger.count.gte) {
      continue;
    }
    if (!matchesState(actor, deed.trigger.state)) {
      continue;
    }

    candidates.push({
      deed,
      definitionIndex,
      anchorIndex: anchorIndexFor(deed, contributions, previousCount),
    });
  }

  candidates.sort(
    (left, right) =>
      left.anchorIndex - right.anchorIndex || left.definitionIndex - right.definitionIndex,
  );

  for (const { deed, anchorIndex } of candidates) {
    const deedCount = registry.earned.length + 1;
    const previousRank = registry.renownRank;
    // T-1703 · THE CONQUEROR CEILING, applied at this ONE write site and nowhere
    // else. A demo licence does not carry the career capstone — "Conqueror
    // content" is the third name on the task's gate list, and CONQUEROR is a
    // Registry row AND a Steam achievement, so it is reachable as CONTENT no
    // matter how few days are played (which is why it needs a lock of its own
    // rather than being held out by the day ceiling like the rest of the veteran
    // game).
    //
    // DELIBERATELY NOT applied in `rankForDeedCount`, `deserializeState` or the
    // v7→v8 migration: those three are edition-BLIND by design (they answer "what
    // does this deed count buy?", which has one true answer), and capping them
    // would bake the demo's ceiling into a save that a full build then reads back
    // as gospel. Keeping the cap here means `promoteEdition` heals the rank on
    // import with a single re-derive — proved non-vacuously in `demo.test.ts`,
    // which drives one state to 38 deeds, asserts it tops out BELOW Conqueror,
    // then promotes it and asserts it lands ON Conqueror.
    //
    // N11 · IT APPLIES TO A CAPTAIN TOO. `ctx.conquerorLocked` comes from the same
    // `demoLocked` predicate on both sides — a demo licence belongs to the WORLD,
    // not to who is flying it, exactly as `NpcDayContext.era` already argues for the
    // interdiction multiplier. The reverted attempt's comment said the cap "is NOT
    // applied" to NPCs; that exemption is not re-granted.
    const uncappedRank = rankForDeedCount(deedCount);
    const nextRank =
      uncappedRank === 'CONQUEROR' && ctx.conquerorLocked ? previousRank : uncappedRank;
    const citation = citationFor(deed, ctx.day);

    registry.earned.push({
      id: deed.id,
      title: deed.title,
      citation,
      day: ctx.day,
      ...(recordEventIndex ? { eventIndex: anchorIndex } : {}),
    });
    earnedIds.add(deed.id);

    emitted.push({
      type: 'DeedEarned',
      day: ctx.day,
      deedId: deed.id,
      title: deed.title,
      citation,
      renownRank: nextRank,
    });

    if (nextRank !== previousRank) {
      registry.renownRank = nextRank;
      emitted.push({
        type: 'RenownRankUp',
        day: ctx.day,
        previousRank,
        newRank: nextRank,
        deedCount,
      });
      // READER of a rank definition's `citation`: the reached rank's authored
      // period-voice line IS the rank-up wire.
      //
      // T-1308 introduced this as an OPTIONAL field carried only by CONQUEROR,
      // with a generic "Registry confirms Player as …" fallback for the other
      // nine, and DEFERRED authoring the rest to T-1504. T-1504 consumed that
      // deferral: content now guarantees a citation for every rank (the field is
      // required, so a citation-less rank cannot be represented), and the
      // fallback branch is GONE — no engine-authored prose remains here.
      const rankDef: RenownRankDefinition = RENOWN_RANKS[nextRank];
      emitted.push({
        type: 'WireEntry',
        day: ctx.day,
        kind: 'plain',
        message: rankDef.citation,
      });
    }
  }

  return emitted;
}

/**
 * The PLAYER's dusk deed evaluation — a thin wrapper over {@link accrueDeeds},
 * with the same signature it has always had.
 *
 * The three things it supplies are exactly the three that used to be hard-wired
 * into the body: the actor (`state.player`), the log index the source batch will
 * occupy, and the demo licence's CONQUEROR lock, asked through `demoLocked` so the
 * gate still lives in one place (`demo.ts`).
 */
export function evaluateDeeds(state: GameState, sourceEvents: readonly GameEvent[]): GameEvent[] {
  return accrueDeeds(state.player, sourceEvents, {
    day: state.day,
    sourceStartIndex: state.eventLog.length,
    conquerorLocked: demoLocked(state, 'conqueror'),
  });
}
