import { describe, it, expect } from 'vitest';
import {
  EXPLORE_ITEM_BY_ID,
  ExploreItemDefinition,
  ExploreOutcomeDefinition,
  MAX_DAWN_HAND_SIZE,
} from '@spacerquest/content';
import { applyUniqueItem, resolveExploreOutcome } from '../exploreOutcomes.js';
import { maxCargoPodsForShip } from '../actions/shipyard.js';
import { calculateFuelCapacity, syncMaxFuel } from '../economy.js';
import { hasExploreModule } from '../components.js';
import { navBonus } from '../components.js';
import { applyPlayerAction, startDay } from '../day.js';
import { cloneState } from '../clone.js';
import { createInitialState } from '../state.js';
import { SeededRng } from '../rng.js';
import { DiscoveredPoi, GameEvent, GameState } from '../types.js';

// ---------------------------------------------------------------------------
// T-112 · THE UNIQUE-ITEM EFFECT SURFACE (docs/EXPLORE_REDESIGN.md §4).
//
// Two effect classes. CLASS A is a declared list of ship-element deltas applied
// by one engine resolver; CLASS B is a `DiceBenefit` granted through the ruled
// hook — the shipped-empty `EQUIPMENT_DICE_BENEFITS`'s sibling table — which
// folds into `dawnDiceModifiers` with no new call site and no change to
// `check()`.
//
// THE DICE TESTS BELOW DRIVE THE REAL `startDay`. That is deliberate and is the
// task's acceptance: asserting `dawnDiceModifiers` directly would prove the
// formula, not that a recovered item reaches the hand a player is actually dealt.
// ---------------------------------------------------------------------------

const POI: DiscoveredPoi = {
  id: 'poi-test-1',
  type: 'derelict',
  systemId: 1,
  name: 'a gutted freighter hulk',
  day: 3,
};

function itemRow(itemId: string): ExploreOutcomeDefinition {
  return {
    id: `t-item-${itemId}`,
    valuePoints: 40,
    pools: ['derelict'],
    wireFound: 'Player prised {name} loose of the wreck.',
    payload: { kind: 'unique-item', itemId },
  };
}

/** Grant one item through the REAL payoff resolver, exactly as a boarded POI (or
 *  a dusk recovery payout) would. Returns the mutated state and its events. */
function grant(state: GameState, itemId: string): { state: GameState; events: GameEvent[] } {
  const next = cloneState(state);
  const events: GameEvent[] = [];
  resolveExploreOutcome(next, itemRow(itemId), POI, new SeededRng(7), events);
  return { state: next, events };
}

function baseState(): GameState {
  const state = createInitialState(1);
  state.day = 3;
  return state;
}

describe('T-112 · Class B — an explore-granted item reaches the DEALT hand', () => {
  it('the berth-couch adds a real die to the hand `startDay` deals', () => {
    const granted = grant(baseState(), 'item-berth-couch');
    const { state: dawn } = startDay(granted.state);
    expect(dawn.player.dawnHand?.dice).toHaveLength(6);
    expect(dawn.player.dawnHand?.spent).toHaveLength(6);
    // The baseline, so the 6 above is a delta and not a coincidence.
    const { state: bare } = startDay(baseState());
    expect(bare.player.dawnHand?.dice).toHaveLength(5);
  });

  it('the marked ephemeris banks a real re-roll charge for the day', () => {
    const granted = grant(baseState(), 'item-marked-ephemeris');
    const { state: dawn } = startDay(granted.state);
    expect(dawn.player.dawnHand?.rerollsRemaining).toBe(1);
    const { state: bare } = startDay(baseState());
    expect(bare.player.dawnHand?.rerollsRemaining).toBe(0);
  });

  it('the tally-slate floors every die `startDay` rolls, order intact', () => {
    const granted = grant(baseState(), 'item-tally-slate');
    const { state: dawn } = startDay(granted.state);
    const dice = dawn.player.dawnHand!.dice;
    expect(Math.min(...dice)).toBeGreaterThanOrEqual(3);
    // Flooring is monotonic, so `rollHand`'s descending order survives it.
    expect([...dice]).toEqual([...dice].sort((a, b) => b - a));
  });

  it('THE HAND CAP STILL BINDS with an item equipped', () => {
    // A Second (+1 die) plus the berth-couch (+1 die) is the exact point §4.2
    // says the clamp lands: base 5 + MAX_EXTRA_DICE 2 = MAX_DAWN_HAND_SIZE.
    const state = baseState();
    state.player.crew = [{ roleId: 'crew-second', hiredDay: 1 }];
    const granted = grant(state, 'item-berth-couch');
    const { state: dawn } = startDay(granted.state);
    expect(dawn.player.dawnHand?.dice).toHaveLength(MAX_DAWN_HAND_SIZE);
    // Never a literal: the cap is content's number, read here, not restated.
    expect(MAX_DAWN_HAND_SIZE).toBe(7);
  });
});

describe('T-112 · Class B — the grant itself', () => {
  it('fits the module, records it, and emits UniqueItemAcquired before the wire line', () => {
    const res = grant(baseState(), 'item-berth-couch');
    expect(res.state.player.ship.exploreModules).toEqual(['module-berth-couch']);
    expect(hasExploreModule(res.state.player.ship, 'module-berth-couch')).toBe(true);
    expect(res.events.map((e) => e.type)).toEqual(['UniqueItemAcquired', 'WireEntry']);
    const acquired = res.events[0];
    expect(acquired.type === 'UniqueItemAcquired' && acquired.itemId).toBe('item-berth-couch');
    expect(acquired.type === 'UniqueItemAcquired' && acquired.poiId).toBe(POI.id);
    expect(acquired.type === 'UniqueItemAcquired' && acquired.systemId).toBe(POI.systemId);
    expect(acquired.type === 'UniqueItemAcquired' && acquired.day).toBe(3);
    // The row's own prose still follows, resolved against the POI's name.
    const wire = res.events[1];
    expect(wire.type === 'WireEntry' && wire.message).toBe(
      'Player prised a gutted freighter hulk loose of the wreck.',
    );
  });

  it('is IDEMPOTENT — the same module granted twice leaves one entry', () => {
    const once = grant(baseState(), 'item-berth-couch');
    const twice = grant(once.state, 'item-berth-couch');
    expect(twice.state.player.ship.exploreModules).toEqual(['module-berth-couch']);
    const { state: dawn } = startDay(twice.state);
    expect(dawn.player.dawnHand?.dice).toHaveLength(6); // not 7
  });

  it('an unknown item id mutates nothing but still speaks', () => {
    const state = baseState();
    const res = grant(state, 'item-does-not-exist');
    expect(res.events.map((e) => e.type)).toEqual(['WireEntry']);
    expect(res.state).toEqual(cloneState(state));
  });

  it('every shipped item resolves, and the Class-B tier is still exactly three', () => {
    // T-114 RETARGETED, intent preserved. The old form asserted that EVERY
    // shipped item is a Class-B module — true while T-112's three modules were
    // the whole table, and false the moment T-114 authored the first Class-A
    // items to go with its band-2 `unique-item` rows. The claim that actually
    // mattered is §4.2's CAP: Class B is bounded at three because each instance
    // costs engine work (finding F-100-1), and that is asserted directly.
    for (const item of Object.values(EXPLORE_ITEM_BY_ID)) {
      expect(EXPLORE_ITEM_BY_ID[item.id]).toBe(item);
    }
    const modules = Object.values(EXPLORE_ITEM_BY_ID).filter((item) => item.class === 'module');
    expect(modules).toHaveLength(3);
    expect(modules.map((item) => item.id).sort()).toEqual([
      'item-berth-couch',
      'item-marked-ephemeris',
      'item-tally-slate',
    ]);
  });
});

// The Class-A resolver is proved with TEST-LOCAL rows handed straight to the
// exported `applyUniqueItem` — the same dependency-injection shape
// `equipmentDiceBenefits(ship, table)` uses. No speculative content ships ahead
// of the ladder that prices it (T-113/T-114/T-115 author the real rows).
describe('T-112 · Class A — declared ship-element deltas', () => {
  function shipItem(deltas: ExploreItemDefinition & { class: 'ship' }): ExploreItemDefinition {
    return deltas;
  }

  it('a component delta moves the component AND the reader hanging off it', () => {
    // §4.1's own worked example: "+2 to PILOT checks" is re-authored as
    // `navigation.strength +20`, which the EXISTING `navBonus` reader turns into a
    // check bonus — so the ambition is expressible with no new engine surface.
    const state = baseState();
    expect(navBonus(state.player.ship)).toBe(0);
    const events: GameEvent[] = [];
    applyUniqueItem(
      state,
      shipItem({
        id: 'item-test-nav',
        name: 'a survey astrogation core',
        class: 'ship',
        deltas: [{ element: 'component', component: 'navigation', strength: 20 }],
      }),
      POI,
      events,
    );
    expect(state.player.ship.navigation.strength).toBe(30);
    expect(navBonus(state.player.ship)).toBe(2);
    expect(events.map((e) => e.type)).toEqual(['UniqueItemAcquired']);
  });

  it('component strength clamps to the documented 1-199 bound in both directions', () => {
    const state = baseState();
    state.player.ship.weapons.strength = 195;
    applyUniqueItem(
      state,
      shipItem({
        id: 'item-test-gun',
        name: 'a siege lance',
        class: 'ship',
        deltas: [{ element: 'component', component: 'weapons', strength: 40 }],
      }),
      POI,
      [],
    );
    expect(state.player.ship.weapons.strength).toBe(199);

    applyUniqueItem(
      state,
      shipItem({
        id: 'item-test-drag',
        name: 'a seized mounting',
        class: 'ship',
        deltas: [{ element: 'component', component: 'weapons', strength: -1000 }],
      }),
      POI,
      [],
    );
    expect(state.player.ship.weapons.strength).toBe(1);
  });

  it('a pod grant is capped by the YARD’s own maxCargoPodsForShip', () => {
    const state = baseState();
    // The junker starts exactly full (10 of 10), so a pod grant is a no-op...
    const ship = state.player.ship;
    expect(ship.cargoPods).toBe(maxCargoPodsForShip(ship));
    const beforeFull = cloneState(state);
    applyUniqueItem(
      state,
      shipItem({
        id: 'item-test-pod',
        name: 'a bolted-on pod cradle',
        class: 'ship',
        deltas: [{ element: 'cargoPods', amount: 1 }],
      }),
      POI,
      [],
    );
    expect(state.player.ship.cargoPods).toBe(beforeFull.player.ship.cargoPods);
    expect(state.player.ship).toEqual(beforeFull.player.ship);

    // ...and lands for real once the hull licenses the room.
    state.player.ship.hull.strength = 20; // ceiling (9+1)·10 = 100
    const room = maxCargoPodsForShip(state.player.ship);
    expect(room).toBeGreaterThan(state.player.ship.cargoPods);
    applyUniqueItem(
      state,
      shipItem({
        id: 'item-test-pod',
        name: 'a bolted-on pod cradle',
        class: 'ship',
        deltas: [{ element: 'cargoPods', amount: 1 }],
      }),
      POI,
      [],
    );
    expect(state.player.ship.cargoPods).toBe(11);
  });

  it('a maxFuel grant SURVIVES the syncMaxFuel chokepoint (F-112-B)', () => {
    const state = baseState();
    applyUniqueItem(
      state,
      shipItem({
        id: 'item-test-tank',
        name: 'an auxiliary bunkerage',
        class: 'ship',
        deltas: [
          { element: 'maxFuel', amount: 40 },
          { element: 'maxFuel', amount: 40 },
        ],
      }),
      POI,
      [],
    );
    const ship = state.player.ship;
    expect(ship.bonusMaxFuel).toBe(80); // deltas accumulate
    syncMaxFuel(ship);
    expect(ship.maxFuel).toBe(calculateFuelCapacity(ship.hull.strength, ship.hull.condition) + 80);
    // A ship with no bonus is untouched by the added term.
    const bare = baseState().player.ship;
    syncMaxFuel(bare);
    expect(bare.maxFuel).toBe(calculateFuelCapacity(1, 9));
  });

  it("a maxFuel grant survives day.ts's END-OF-ACTION sync, not just a direct call", () => {
    // The failure mode F-112-B names: `applyPlayerAction` re-syncs the tank after
    // every action, so a grant written onto `maxFuel` would be erased within the
    // same day. Driven through a REAL action, the same shape economy.test.ts uses.
    const state = createInitialState(123);
    state.player.credits = 200000;
    const { state: dayState } = startDay(state);
    applyUniqueItem(
      dayState,
      {
        id: 'item-test-tank',
        name: 'an auxiliary bunkerage',
        class: 'ship',
        deltas: [{ element: 'maxFuel', amount: 40 }],
      },
      POI,
      [],
    );
    const { state: after } = applyPlayerAction(dayState, {
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'weapons',
      tier: 2,
      spendDie: 0,
    });
    expect(after.player.ship.bonusMaxFuel).toBe(40);
    expect(after.player.ship.maxFuel).toBe(340); // (9+1)·1·30 + 40
  });

  it('a dead hull holds nothing even with a bonus tank bolted on', () => {
    const ship = baseState().player.ship;
    ship.bonusMaxFuel = 80;
    ship.hull.condition = 0;
    syncMaxFuel(ship);
    expect(ship.maxFuel).toBe(0);
    expect(ship.fuel).toBe(0);
  });
});

describe('T-112 · save shape — a pure addition, no bump owed', () => {
  it('a fresh ship carries neither field, so a module-free career serializes as before', () => {
    const ship = createInitialState(1).player.ship;
    expect(ship.exploreModules).toBeUndefined();
    expect(ship.bonusMaxFuel).toBeUndefined();
    expect(Object.keys(ship)).not.toContain('exploreModules');
    expect(Object.keys(ship)).not.toContain('bonusMaxFuel');
  });
});
