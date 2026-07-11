import {
  DEEDS,
  RENOWN_DEED_THRESHOLDS,
  RENOWN_RANKS,
  type DeedDefinition,
  type FieldMatcher,
  type RenownRankId,
  type StateMatcher,
} from '@spacerquest/content';
import { GameEvent, GameState } from './types.js';

const EVENT_PATHS: Readonly<Record<string, readonly string[]>> = {
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
};

const STATE_PATHS = ['player.ship.fuel'] as const;

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

function matchesState(state: GameState, matchers: readonly StateMatcher[] | undefined): boolean {
  for (const matcher of matchers ?? []) {
    if (!isAllowedStatePath(matcher.path)) {
      return false;
    }
    if (!matchesValue(readPath(state, matcher.path), matcher)) {
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

export function rankForDeedCount(deedCount: number): RenownRankId {
  let rank: RenownRankId = 'LIEUTENANT';
  for (const candidate of RENOWN_RANK_ORDER) {
    if (deedCount >= RENOWN_DEED_THRESHOLDS[candidate]) {
      rank = candidate;
    }
  }
  return rank;
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

export function evaluateDeeds(state: GameState, sourceEvents: readonly GameEvent[]): GameEvent[] {
  if (sourceEvents.length === 0) {
    return [];
  }

  const emitted: GameEvent[] = [];
  const registry = state.player.registry;
  const earnedIds = new Set(registry.earned.map((deed) => deed.id));
  const sourceStartIndex = state.eventLog.length;
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
    if (!matchesState(state, deed.trigger.state)) {
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
    const deedCount = state.player.registry.earned.length + 1;
    const previousRank = state.player.registry.renownRank;
    const nextRank = rankForDeedCount(deedCount);
    const citation = citationFor(deed, state.day);

    state.player.registry.earned.push({
      id: deed.id,
      title: deed.title,
      citation,
      day: state.day,
      eventIndex: anchorIndex,
    });
    earnedIds.add(deed.id);

    emitted.push({
      type: 'DeedEarned',
      day: state.day,
      deedId: deed.id,
      title: deed.title,
      citation,
      renownRank: nextRank,
    });

    if (nextRank !== previousRank) {
      state.player.registry.renownRank = nextRank;
      emitted.push({
        type: 'RenownRankUp',
        day: state.day,
        previousRank,
        newRank: nextRank,
        deedCount,
      });
      emitted.push({
        type: 'WireEntry',
        day: state.day,
        message: `Registry confirms Player as ${RENOWN_RANKS[nextRank].label} after ${deed.title}.`,
      });
    }
  }

  return emitted;
}
