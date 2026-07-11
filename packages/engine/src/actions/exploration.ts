import {
  BEACON_DISCOVERY_CHANCE,
  EXPLORATION_FUEL_COST,
  EXPLORATION_NAV_DC,
  POI_KINDS,
  POI_LOOT,
  PoiType,
  Stat,
} from '@spacerquest/content';
import { DiscoveredPoi, GameEvent, GameState, PlayerAction } from '../types.js';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';
import { fragmentCount, grantFragment } from '../nemesis.js';

/**
 * Roll a boarded POI's loot table (T-111b, PRD §7.2). Each of the three loot
 * components — salvage / fragment / contraband — is rolled INDEPENDENTLY off the
 * action rng in a fixed order, so a given seed always yields the identical loot.
 * Mutates `state` (credits, nemesisFile, the contraband flag) and pushes typed
 * events. The `Contraband` pod is not stowed here: it arms the
 * `derelict.sealed-pod` storylet (the carrying choice) via a flag.
 */
function resolveLoot(
  state: GameState,
  poi: DiscoveredPoi,
  rng: SeededRng,
  events: GameEvent[],
): void {
  const table = POI_LOOT[poi.type];

  // 1. SALVAGE — real credits.
  if (rng.next() < table.salvage.chance) {
    const span = table.salvage.maxCredits - table.salvage.minCredits + 1;
    const amount = table.salvage.minCredits + Math.floor(rng.next() * span);
    state.player.credits += amount;
    events.push({
      type: 'SalvageRecovered',
      day: state.day,
      poiId: poi.id,
      systemId: poi.systemId,
      amount,
    });
  }

  // 2. FRAGMENT — the treasure. Seeded pick from the type's pool; dedupe keeps
  //    the count monotonic, so a repeat id emits nothing.
  if (table.fragment.pool.length > 0 && rng.next() < table.fragment.chance) {
    const pool = table.fragment.pool;
    const fragmentId = pool[Math.floor(rng.next() * pool.length)];
    const added = grantFragment(state.player.nemesisFile, fragmentId, poi.type, state.day);
    if (added) {
      events.push({
        type: 'FragmentAcquired',
        day: state.day,
        fragmentId,
        source: poi.type,
        fragmentCount: fragmentCount(state.player.nemesisFile),
        poiId: poi.id,
      });
      events.push({
        type: 'WireEntry',
        day: state.day,
        message: `Player's Nemesis file logged a new Signal Fragment recovered off ${poi.name}.`,
      });
    }
  }

  // 3. CONTRABAND — a sealed pod. Arms the carry-choice storylet via a flag.
  if (rng.next() < table.contraband.chance) {
    state.flags['signal.contraband.pending'] = true;
    events.push({
      type: 'ContrabandFound',
      day: state.day,
      poiId: poi.id,
      systemId: poi.systemId,
    });
  }
}

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

  // T-111b: attach loot to the fresh discovery. Continues on the SAME action rng
  // so the loot is deterministic for the seed + action sequence.
  resolveLoot(nextState, poi, rng, events);

  return { state: nextState, events };
}
