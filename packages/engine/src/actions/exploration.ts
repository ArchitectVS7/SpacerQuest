import {
  BEACON_DISCOVERY_CHANCE,
  EXPLORATION_FUEL_COST,
  EXPLORATION_NAV_DC,
  POI_KINDS,
  PoiType,
  Stat,
} from '@spacerquest/content';
import { DiscoveredPoi, GameEvent, GameState, PlayerAction } from '../types.js';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';

/** Deterministically pick one flavor name off the forked action rng. */
function chooseName(rng: SeededRng, names: readonly string[]): string {
  const name = names[Math.floor(rng.next() * names.length)];
  return name ?? names[0] ?? 'an uncharted signal';
}

/**
 * T-111a · Off-lane exploration (PRD §7.2). The player burns a die on a PILOT
 * nav check to leave the trade lane and chart a point of interest — a
 * transmitting BEACON or a boardable DERELICT.
 *
 * Determinism: the POI type/name are drawn off `rng` (the day rng forked on the
 * action's event index in day.ts), so the same seed + action sequence surfaces
 * the identical POI. The nav check reads the player's PILOT modifier through the
 * SAME `check` idiom as Travel (die + modifier vs DC).
 *
 * T-111b seam: a discovered POI is a bare charted coordinate here. Loot
 * (salvage, Contraband, Signal fragments) and the Nemesis file attach to it by
 * id/type in T-111b — nothing rewarded here.
 */
export function resolveExploration(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Explore' }>,
  rng: SeededRng,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = JSON.parse(JSON.stringify(state)) as GameState;

  // Encounter gating lives in day.ts applyPlayerAction (the only runtime caller),
  // which emits a typed ActionBlocked event before this resolver is reached.
  if (action.spendDie === undefined) {
    throw new Error('Must spend a die to explore');
  }

  const { die, hand } = spendDie(nextState.player.dawnHand!, action.spendDie);
  nextState.player.dawnHand = hand;

  const systemId = nextState.player.currentSystemId;

  // Fuel gate (PRD §7.2: reaching an off-lane POI burns fuel). The die is spent
  // regardless — the detour was attempted — mirroring Travel's dry-tank path.
  if (nextState.player.ship.fuel < EXPLORATION_FUEL_COST) {
    events.push({ type: 'ExplorationFailed', day: nextState.day, systemId, reason: 'insufficient-fuel' });
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      message: `Player broke off an off-lane sweep near system ${systemId} — not enough fuel to reach it.`,
    });
    return { state: nextState, events };
  }
  nextState.player.ship.fuel -= EXPLORATION_FUEL_COST;

  // PILOT nav check — same die + modifier vs DC idiom as Travel.
  const result = check(die, nextState.player.stats[Stat.PILOT], EXPLORATION_NAV_DC);
  events.push({
    type: 'StatCheck',
    actor: 'Player',
    stat: Stat.PILOT,
    dc: EXPLORATION_NAV_DC,
    result,
  });

  if (!result.success) {
    events.push({ type: 'ExplorationFailed', day: nextState.day, systemId, reason: 'nav-check' });
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      message: `Player's nav sweep off system ${systemId} turned up nothing but static.`,
    });
    return { state: nextState, events };
  }

  // Seeded POI: the beacon/derelict split, then a flavor name — both drawn off
  // the forked action rng so the discovery is identical for a given seed.
  const type: PoiType = rng.next() < BEACON_DISCOVERY_CHANCE ? 'beacon' : 'derelict';
  const kind = POI_KINDS[type];
  const name = chooseName(rng, kind.names);
  // Stable per (system, day, action-index, type). dayEventCount is the action's
  // event index at dispatch time (day.ts sets the running total afterward), so
  // repeated explores in one day get distinct ids.
  const poi: DiscoveredPoi = {
    id: `poi-${systemId}-d${nextState.day}-e${nextState.dayEventCount}-${type}`,
    type,
    systemId,
    name,
    day: nextState.day,
  };
  nextState.player.charts.discoveredPois.push(poi);

  events.push({
    type: 'PoiDiscovered',
    day: nextState.day,
    poiId: poi.id,
    poiType: type,
    systemId,
    name,
  });
  events.push({
    type: 'WireEntry',
    day: nextState.day,
    message: kind.wireDiscovered.replace('{name}', name),
  });

  return { state: nextState, events };
}
