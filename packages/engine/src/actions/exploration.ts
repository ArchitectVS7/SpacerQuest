import { EXPLORATION_FUEL_COST, EXPLORATION_NAV_DC, POI_KINDS, Stat } from '@spacerquest/content';
import { DiscoveredPoi, GameEvent, GameState, PlayerAction } from '../types.js';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';
import { drawLegacyLoot, drawPoiKind } from '../exploreOutcomes.js';
import { navBonus } from '../components.js';
import { cloneState } from '../clone.js';

/**
 * T-111a · Off-lane exploration (PRD §7.2). The player burns a die on a PILOT
 * nav check to leave the trade lane and chart a point of interest.
 *
 * WHAT THIS FILE OWNS, and only this: the four typed refusals, the die spend,
 * the fuel burn, and the nav check. WHICH kinds of point of interest exist, and
 * WHAT a board pays out, are content — drawn through `exploreOutcomes.ts`
 * (`drawPoiKind` reads `POI_DISCOVERY_TABLE`, `drawLegacyLoot` reads
 * `LEGACY_POI_LOOT` and hands the drawn rows to the generic resolver). T-110
 * removed the hard-coded type ternary and the three-leg loot branch that used to
 * live here; adding a POI type or a payoff now touches no engine file
 * (docs/EXPLORE_REDESIGN.md §2).
 *
 * Determinism: the POI type/name are drawn off `rng` (the day rng forked on the
 * action's event index in day.ts), so the same seed + action sequence surfaces
 * the identical POI and the identical payoff. The nav check reads the player's
 * PILOT modifier through the SAME `check` idiom as Travel (die + modifier vs DC).
 */
export function resolveExploration(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Explore' }>,
  rng: SeededRng,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = cloneState(state);

  // Encounter gating lives in day.ts applyPlayerAction (the only runtime caller),
  // which emits a typed ActionBlocked event before this resolver is reached.
  const systemId = nextState.player.currentSystemId;

  // T-1003 · Malformed die selection is a type-valid player input (the Explore
  // action shape carries an optional/free-form spendDie), so it must resolve to a
  // typed fail event — NOT a raw throw that crashes the UGT adapter. No die is
  // spent and no fuel is burned: there was no usable die to spend on a detour.
  if (action.spendDie === undefined) {
    events.push({ type: 'ExplorationFailed', day: nextState.day, systemId, reason: 'no-die' });
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      kind: 'plain',
      message: `Player queued an off-lane sweep near system ${systemId} but assigned no die to fly it.`,
    });
    return { state: nextState, events };
  }
  const currentHand = nextState.player.dawnHand;
  const index = action.spendDie;
  if (!currentHand || index < 0 || index >= currentHand.dice.length) {
    events.push({
      type: 'ExplorationFailed',
      day: nextState.day,
      systemId,
      reason: 'invalid-die-index',
    });
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      kind: 'plain',
      message: `Player's off-lane sweep near system ${systemId} named a die that isn't in the dawn hand.`,
    });
    return { state: nextState, events };
  }
  if (currentHand.spent[index]) {
    events.push({
      type: 'ExplorationFailed',
      day: nextState.day,
      systemId,
      reason: 'die-already-spent',
    });
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      kind: 'plain',
      message: `Player's off-lane sweep near system ${systemId} named a die already burned this dawn.`,
    });
    return { state: nextState, events };
  }

  const { die, hand } = spendDie(currentHand, index);
  nextState.player.dawnHand = hand;

  // Fuel gate (PRD §7.2: reaching an off-lane POI burns fuel). The die is spent
  // regardless — the detour was attempted — mirroring Travel's dry-tank path.
  if (nextState.player.ship.fuel < EXPLORATION_FUEL_COST) {
    events.push({
      type: 'ExplorationFailed',
      day: nextState.day,
      systemId,
      reason: 'insufficient-fuel',
    });
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      kind: 'plain',
      message: `Player broke off an off-lane sweep near system ${systemId} — not enough fuel to reach it.`,
    });
    return { state: nextState, events };
  }
  nextState.player.ship.fuel -= EXPLORATION_FUEL_COST;

  // PILOT nav check — same die + modifier vs DC idiom as Travel. T-1205: the ship's
  // navigation adds its bonus (junker → +0, so the goldens are unchanged; upgraded
  // nav charts more reliably). READER OF `navigation`: this line (components.ts).
  const result = check(
    die,
    nextState.player.stats[Stat.PILOT] + navBonus(nextState.player.ship),
    EXPLORATION_NAV_DC,
  );
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
      kind: 'plain',
      message: `Player's nav sweep off system ${systemId} turned up nothing but static.`,
    });
    return { state: nextState, events };
  }

  // Seeded POI: the content-weighted type draw, then a flavor name — both off the
  // forked action rng so the discovery is identical for a given seed.
  const { type, name } = drawPoiKind(rng);
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
    // T-1401 wire-line kind: a world/system discovery line. → 'plain'.
    kind: 'plain',
    message: POI_KINDS[type].wireDiscovered.replace('{name}', name),
  });

  // Attach the payoff to the fresh discovery. Continues on the SAME action rng so
  // it is deterministic for the seed + action sequence. T-113 swaps this one call
  // for the single weighted draw over EXPLORE_OUTCOMES (spec §2.4).
  drawLegacyLoot(nextState, poi, rng, events);

  return { state: nextState, events };
}
