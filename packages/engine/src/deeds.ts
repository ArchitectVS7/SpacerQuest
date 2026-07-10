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
  StatCheck: ['actor', 'stat', 'dc', 'result.success', 'result.total', 'actionContext'],
  ShipyardEvent: ['action', 'cost', 'component', 'tier', 'repairMode', 'quantity', 'equipment'],
};

const STATE_PATHS = ['player.ship.fuel'] as const;

export const RENOWN_RANK_ORDER = Object.keys(RENOWN_RANKS) as RenownRankId[];

type ComparableValue = string | number | boolean;
type EventMatch = { event: GameEvent; index: number };
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

function matchesEvent(event: GameEvent, deed: DeedDefinition): boolean {
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

function anchorForCandidate(
  deed: DeedDefinition,
  sourceMatches: readonly EventMatch[],
  historyMatches: readonly EventMatch[],
  sourceStartIndex: number,
): EventMatch | undefined {
  if (!deed.trigger.count) {
    return sourceMatches[0];
  }

  const thresholdMatch = historyMatches[deed.trigger.count.gte - 1];
  if (thresholdMatch && thresholdMatch.index >= sourceStartIndex) {
    return thresholdMatch;
  }

  return sourceMatches[0];
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

export function evaluateDeeds(state: GameState, sourceEvents: readonly GameEvent[]): GameEvent[] {
  if (sourceEvents.length === 0) {
    return [];
  }

  const emitted: GameEvent[] = [];
  const history = [...state.eventLog, ...sourceEvents];
  const earnedIds = new Set(state.player.registry.earned.map((deed) => deed.id));
  const sourceStartIndex = state.eventLog.length;
  const candidates: DeedCandidate[] = [];

  for (const [definitionIndex, deed] of DEEDS.entries()) {
    if (earnedIds.has(deed.id)) {
      continue;
    }

    const sourceMatches = sourceEvents
      .map((event, index) => ({ event, index: sourceStartIndex + index }))
      .filter(({ event }) => matchesEvent(event, deed));
    if (sourceMatches.length === 0) {
      continue;
    }

    const historyMatches = history
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => matchesEvent(event, deed));
    if (deed.trigger.count && historyMatches.length < deed.trigger.count.gte) {
      continue;
    }
    if (!matchesState(state, deed.trigger.state)) {
      continue;
    }

    const anchor = anchorForCandidate(deed, sourceMatches, historyMatches, sourceStartIndex);
    if (!anchor) {
      continue;
    }

    candidates.push({ deed, definitionIndex, anchorIndex: anchor.index });
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
