import { describe, expect, it } from 'vitest';
import { YARD_COMPONENT_TIER_PRICES } from '@spacerquest/content';
import { applyPlayerAction, startDay } from '../day.js';
import { maxCargoPodsForShip, quoteShipyard, resolveShipyard } from '../actions/shipyard.js';
import { createInitialState } from '../state.js';
import { GameState, PlayerAction, ShipyardFail } from '../types.js';

type ShipyardAction = Extract<PlayerAction, { type: 'Shipyard' }>;

function shipyardState(credits = 200000): GameState {
  const state = createInitialState(123);
  state.player.credits = credits;
  state.player.dawnHand = {
    dice: [20, 19, 18, 17, 16],
    spent: [false, false, false, false, false],
  };
  return state;
}

function expectSpentDie(state: GameState, index = 0): void {
  expect(state.player.dawnHand?.spent[index]).toBe(true);
}

describe('shipyard', () => {
  it('buys component tiers 1 through 9 with net trade-in pricing', () => {
    for (let tier = 1; tier <= 9; tier += 1) {
      const state = shipyardState();
      state.player.ship.weapons = { strength: 3, condition: 2 };
      const startingCredits = state.player.credits;
      const expectedCost = Math.max(0, YARD_COMPONENT_TIER_PRICES[tier - 1] - 100);

      const result = resolveShipyard(state, {
        type: 'Shipyard',
        action: 'buy-component-tier',
        component: 'weapons',
        tier,
        spendDie: 0,
      });

      expect(result.state.player.credits).toBe(startingCredits - expectedCost);
      expect(result.state.player.ship.weapons).toEqual({ strength: tier * 10, condition: 9 });
      expectSpentDie(result.state);
      expect(result.events).toEqual([
        {
          type: 'ShipyardEvent',
          action: 'buy-component-tier',
          component: 'weapons',
          tier,
          cost: expectedCost,
        },
      ]);
    }
  });

  it('clears an installed cloaker when buying a stronger hull tier', () => {
    const state = shipyardState();
    state.player.ship.hasCloaker = true;
    state.player.ship.hull = { strength: 1, condition: 3 };

    const result = resolveShipyard(state, {
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'hull',
      tier: 1,
      spendDie: 0,
    });

    expect(result.state.player.ship.hull).toEqual({ strength: 10, condition: 9 });
    expect(result.state.player.ship.hasCloaker).toBe(false);
  });

  it('raises maxFuel when a hull tier is bought through the day loop (T-1102 A/B)', () => {
    // The fuel ceiling is derived from the hull and recomputed at the
    // applyPlayerAction chokepoint. A tier-2 hull (strength 20, condition 9) must
    // lift the tank from the junker's 300 to (9+1)·20·30 = 6000.
    const { state } = startDay(shipyardState());
    const before = state.player.ship.maxFuel;
    expect(before).toBe(300);

    const { state: after } = applyPlayerAction(state, {
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'hull',
      tier: 2,
      spendDie: 0,
    });

    expect(after.player.ship.hull.strength).toBe(20);
    expect(after.player.ship.maxFuel).toBeGreaterThan(before);
    expect(after.player.ship.maxFuel).toBe(6000);
  });

  it.each([
    ['CLOAKER', 500],
    ['AUTO_REPAIR', 1000],
    ['STAR_BUSTER', 10000],
    ['ARCH_ANGEL', 10000],
    ['ASTRAXIAL_HULL', 100000],
    ['TITANIUM_HULL', 1000],
    ['TRANS_WARP', 10000],
  ] as const)('buys %s with prerequisite setup and exact pricing', (equipment, expectedCost) => {
    const state = shipyardState();
    state.player.ship.hull = { strength: 1, condition: 4 };
    state.player.ship.shields = { strength: 1, condition: 3 };
    state.player.ship.weapons = { strength: 1, condition: 2 };
    state.player.registry.renownRank = 'GIGA_HERO';
    state.player.ship.drives.strength = 25;
    state.player.ship.cargoPods = 10;
    state.player.ship.fuel = 300;
    const startingCredits = state.player.credits;

    const result = resolveShipyard(state, {
      type: 'Shipyard',
      action: 'buy-special-equipment',
      equipment,
      spendDie: 0,
    });

    expect(result.state.player.credits).toBe(startingCredits - expectedCost);
    expectSpentDie(result.state);
    expect(result.events).toEqual([
      {
        type: 'ShipyardEvent',
        action: 'buy-special-equipment',
        equipment,
        cost: expectedCost,
      },
    ]);

    if (equipment === 'CLOAKER') {
      expect(result.state.player.ship.hasCloaker).toBe(true);
      expect(result.state.player.ship.hull.condition).toBe(9);
      expect(result.state.player.ship.shields.condition).toBe(9);
    } else if (equipment === 'AUTO_REPAIR') {
      expect(result.state.player.ship.hasAutoRepair).toBe(true);
    } else if (equipment === 'STAR_BUSTER') {
      expect(result.state.player.ship.hasStarBuster).toBe(true);
      expect(result.state.player.ship.weapons.condition).toBe(9);
    } else if (equipment === 'ARCH_ANGEL') {
      expect(result.state.player.ship.hasArchAngel).toBe(true);
      expect(result.state.player.ship.shields.condition).toBe(9);
    } else if (equipment === 'ASTRAXIAL_HULL') {
      expect(result.state.player.ship.isAstraxialHull).toBe(true);
      expect(result.state.player.ship.hull).toEqual({ strength: 29, condition: 9 });
      expect(result.state.player.ship.cargoPods).toBe(190);
      expect(result.state.player.ship.fuel).toBe(2900);
    } else if (equipment === 'TITANIUM_HULL') {
      expect(result.state.player.ship.hasTitaniumHull).toBe(true);
      expect(result.state.player.ship.cargoPods).toBe(60);
    } else {
      expect(result.state.player.ship.hasTransWarpDrive).toBe(true);
    }
  });

  it.each([['AUTO_REPAIR'], ['TITANIUM_HULL']] as const)(
    'caps %s hull-scaled price at 20,000 for a high-strength hull (T-105 boundary)',
    (equipment) => {
      // Price is min(hull.strength * 1000, 20000). A strength-25 hull would price
      // at 25,000 without the cap; the 20,000 ceiling holds it there. The cap
      // matches foundation (f2f95fa9:foundation/rules/upgrades.ts ~L731,
      // hullStrength > 20 ? 20000 : hullStrength * 1000) — not an engine invention.
      const state = shipyardState();
      state.player.ship.hull = { strength: 25, condition: 4 };
      const startingCredits = state.player.credits;

      const result = resolveShipyard(state, {
        type: 'Shipyard',
        action: 'buy-special-equipment',
        equipment,
        spendDie: 0,
      });

      expect(result.state.player.credits).toBe(startingCredits - 20000);
      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: 'ShipyardEvent',
          action: 'buy-special-equipment',
          equipment,
          cost: 20000,
        }),
      );
    },
  );

  it.each([
    ['STAR_BUSTER', 'LIEUTENANT', 'CAPTAIN'],
    ['ARCH_ANGEL', 'LIEUTENANT', 'CAPTAIN'],
    ['ASTRAXIAL_HULL', 'CAPTAIN', 'GIGA_HERO'],
  ] as const)(
    'refuses %s below the required renown rank with a typed failure',
    (equipment, currentRank, requiredRank) => {
      const state = shipyardState();
      state.player.registry.renownRank = currentRank;
      state.player.ship.drives.strength = 25; // isolate the renown gate for ASTRAXIAL_HULL
      const startingCredits = state.player.credits;
      const startingShip = structuredClone(state.player.ship);

      const result = resolveShipyard(state, {
        type: 'Shipyard',
        action: 'buy-special-equipment',
        equipment,
        spendDie: 0,
      });

      expect(result.state.player.credits).toBe(startingCredits);
      expect(result.state.player.ship).toEqual(startingShip);
      // Shipyard spends the die before business checks (established ShipyardFail
      // convention) — the refusal still consumes the die.
      expectSpentDie(result.state);
      expect(result.events).toEqual([
        {
          type: 'ShipyardFail',
          action: 'buy-special-equipment',
          equipment,
          reason: 'INSUFFICIENT_RENOWN',
          requiredRank,
        },
      ]);
    },
  );

  it.each([
    ['AUTO_REPAIR', 'CLOAKER', 'AUTO_REPAIR'],
    ['CLOAKER', 'AUTO_REPAIR', 'CLOAKER'],
    ['ARCH_ANGEL', 'CLOAKER', 'ARCH_ANGEL'],
    ['CLOAKER', 'ARCH_ANGEL', 'CLOAKER'],
    ['STAR_BUSTER', 'CLOAKER', 'STAR_BUSTER'],
    ['CLOAKER', 'STAR_BUSTER', 'CLOAKER'],
    ['TITANIUM_HULL', 'AUTO_REPAIR', 'TITANIUM_HULL'],
    ['AUTO_REPAIR', 'TITANIUM_HULL', 'AUTO_REPAIR'],
  ] as const)(
    'hard-fails %s/%s conflicts with typed events instead of stripping equipment',
    (installed, attempted, conflictingEquipment) => {
      // T-105 intentionally diverges from foundation strip-and-proceed side
      // effects: mutual exclusions are hard failures for clearer headless UX.
      // VERIFIED against foundation (f2f95fa9:foundation/rules/upgrades.ts,
      // purchaseSpecialEquipment): foundation strips the OLD part and proceeds
      // when the new purchase displaces it — AUTO_REPAIR strips Titanium
      // (~L768-776), TITANIUM_HULL strips Auto-Repair (~L778-783), ARCH_ANGEL /
      // STAR_BUSTER strip the Cloaker (~L790-793) — and has no gate at all for
      // buying a CLOAKER while STAR_BUSTER is installed. The reverse direction
      // (buying CLOAKER over AUTO_REPAIR ~L686-688 / ARCH_ANGEL ~L691-693, or
      // AUTO_REPAIR over CLOAKER ~L701-703) hard-fails in foundation too, so
      // only the strip-and-proceed rows below are true divergences.
      const state = shipyardState();
      state.player.ship.hull.strength = 1;
      state.player.ship.shields.strength = 1;
      state.player.registry.renownRank = 'GIGA_HERO';
      if (installed === 'AUTO_REPAIR') state.player.ship.hasAutoRepair = true;
      if (installed === 'CLOAKER') state.player.ship.hasCloaker = true;
      if (installed === 'ARCH_ANGEL') state.player.ship.hasArchAngel = true;
      if (installed === 'STAR_BUSTER') state.player.ship.hasStarBuster = true;
      if (installed === 'TITANIUM_HULL') state.player.ship.hasTitaniumHull = true;
      const startingCredits = state.player.credits;
      const startingShip = structuredClone(state.player.ship);

      const result = resolveShipyard(state, {
        type: 'Shipyard',
        action: 'buy-special-equipment',
        equipment: attempted,
        spendDie: 0,
      });

      expect(result.state.player.credits).toBe(startingCredits);
      expect(result.state.player.ship).toEqual(startingShip);
      expectSpentDie(result.state);
      expect(result.events).toEqual([
        {
          type: 'ShipyardFail',
          action: 'buy-special-equipment',
          equipment: attempted,
          reason: 'MUTUALLY_EXCLUSIVE_EQUIPMENT',
          conflictingEquipment,
        },
      ]);
    },
  );

  it('buys cargo pods within hull capacity and fails over capacity', () => {
    const state = shipyardState();
    state.player.ship.hull = { strength: 1, condition: 9 };
    state.player.ship.cargoPods = 5;
    const success = resolveShipyard(state, {
      type: 'Shipyard',
      action: 'buy-cargo-pods',
      quantity: 3,
      spendDie: 0,
    });

    expect(success.state.player.ship.cargoPods).toBe(8);
    expect(success.state.player.credits).toBe(199970);
    expect(success.events).toEqual([
      { type: 'ShipyardEvent', action: 'buy-cargo-pods', quantity: 3, cost: 30 },
    ]);

    const overCapacity = shipyardState();
    overCapacity.player.ship.hull = { strength: 1, condition: 9 };
    overCapacity.player.ship.cargoPods = 10;
    const failed = resolveShipyard(overCapacity, {
      type: 'Shipyard',
      action: 'buy-cargo-pods',
      quantity: 1,
      spendDie: 0,
    });

    expect(failed.state.player.ship.cargoPods).toBe(10);
    expect(failed.events).toEqual([
      {
        type: 'ShipyardFail',
        action: 'buy-cargo-pods',
        quantity: 1,
        reason: 'CAPACITY_EXCEEDED',
        maxPods: 10,
      },
    ]);
  });

  it('repairs components with exact formulas', () => {
    const single = shipyardState();
    single.player.ship.drives = { strength: 10, condition: 8 };
    const singleResult = resolveShipyard(single, {
      type: 'Shipyard',
      action: 'repair',
      component: 'drives',
      repairMode: 'single',
      spendDie: 0,
    });
    expect(singleResult.state.player.credits).toBe(199990);
    expect(singleResult.state.player.ship.drives.condition).toBe(9);
    expect(singleResult.events).toEqual([
      {
        type: 'ShipyardEvent',
        action: 'repair',
        component: 'drives',
        repairMode: 'single',
        cost: 10,
      },
    ]);

    const rebuild = shipyardState();
    rebuild.player.ship.drives = { strength: 10, condition: 0 };
    const rebuildResult = resolveShipyard(rebuild, {
      type: 'Shipyard',
      action: 'repair',
      component: 'drives',
      repairMode: 'single',
      spendDie: 0,
    });
    expect(rebuildResult.state.player.credits).toBe(197990);
    expect(rebuildResult.state.player.ship.drives.condition).toBe(1);

    const allOne = shipyardState();
    allOne.player.ship.drives = { strength: 10, condition: 7 };
    const allOneResult = resolveShipyard(allOne, {
      type: 'Shipyard',
      action: 'repair',
      component: 'drives',
      repairMode: 'all',
      spendDie: 0,
    });
    expect(allOneResult.state.player.credits).toBe(199980);
    expect(allOneResult.state.player.ship.drives.condition).toBe(9);

    const allComponents = shipyardState();
    allComponents.player.ship.hull = { strength: 1, condition: 8 };
    allComponents.player.ship.drives = { strength: 10, condition: 0 };
    const allComponentsResult = resolveShipyard(allComponents, {
      type: 'Shipyard',
      action: 'repair',
      repairMode: 'all',
      spendDie: 0,
    });
    expect(allComponentsResult.state.player.credits).toBe(197809);
    expect(allComponentsResult.state.player.ship.hull.condition).toBe(9);
    expect(allComponentsResult.state.player.ship.drives.condition).toBe(9);
    expect(allComponentsResult.events).toEqual([
      { type: 'ShipyardEvent', action: 'repair', repairMode: 'all', cost: 2191 },
    ]);
  });

  it('emits AT_MAX_CONDITION when repairing an undamaged component', () => {
    const state = shipyardState();
    const result = resolveShipyard(state, {
      type: 'Shipyard',
      action: 'repair',
      component: 'hull',
      repairMode: 'single',
      spendDie: 0,
    });

    expect(result.events).toEqual([
      {
        type: 'ShipyardFail',
        action: 'repair',
        component: 'hull',
        repairMode: 'single',
        reason: 'AT_MAX_CONDITION',
      },
    ]);
    expectSpentDie(result.state);
  });

  it('emits typed insufficient-credit failures without mutating ship or credits', () => {
    const state = shipyardState(49);
    const startingShip = structuredClone(state.player.ship);

    const result = resolveShipyard(state, {
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'weapons',
      tier: 2,
      spendDie: 0,
    });

    expect(result.state.player.credits).toBe(49);
    expect(result.state.player.ship).toEqual(startingShip);
    expectSpentDie(result.state);
    expect(result.events[0]).toMatchObject({
      type: 'ShipyardFail',
      action: 'buy-component-tier',
      component: 'weapons',
      tier: 2,
      reason: 'INSUFFICIENT_CREDITS',
      cost: 75,
      credits: 49,
    } satisfies Partial<ShipyardFail>);
  });

  it('routes shipyard actions through applyPlayerAction', () => {
    const dawn = startDay(createInitialState(321));
    dawn.state.player.credits = 2000;
    dawn.state.player.ship.cargoPods = 9;

    const result = applyPlayerAction(dawn.state, {
      type: 'Shipyard',
      action: 'buy-cargo-pods',
      quantity: 1,
      spendDie: 0,
    });

    expect(result.state.player.ship.cargoPods).toBe(10);
    expect(result.events[0]).toEqual({
      type: 'ShipyardEvent',
      action: 'buy-cargo-pods',
      quantity: 1,
      cost: 10,
    });
    expect(
      result.events.filter((event) => event.type === 'DeedEarned').map((event) => event.deedId),
    ).toEqual(['yard_rat', 'cargo_expansion']);
    expect(result.state.eventLog.slice(-result.events.length)).toEqual(result.events);
  });
});

describe('quoteShipyard (T-308 preview)', () => {
  it('spends no die and does not mutate the input state', () => {
    const state = shipyardState();
    state.player.ship.weapons = { strength: 3, condition: 2 };
    const snapshot = structuredClone(state);

    const quote = quoteShipyard(state, {
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'weapons',
      tier: 4,
      spendDie: 0,
    });

    // Input untouched: no die spent, no credits deducted, no ship change.
    expect(state).toEqual(snapshot);
    expect(quote.ok).toBe(true);
  });

  it('quotes a component-tier cost matching the real purchase and projects the after', () => {
    const action: ShipyardAction = {
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'weapons',
      tier: 4,
      spendDie: 0,
    };
    const quote = quoteShipyard(shipyardState(), action);
    const resolved = resolveShipyard(shipyardState(), action);
    const spent = 200000 - resolved.state.player.credits;

    expect(quote.cost).toBe(spent);
    expect(quote.before.component).toEqual({ id: 'weapons', strength: 1, condition: 9 });
    expect(quote.after.component).toEqual({ id: 'weapons', strength: 40, condition: 9 });
  });

  it('quotes cargo pods: cost, and before/after pod + capacity numbers', () => {
    const state = shipyardState();
    state.player.ship.hull = { strength: 1, condition: 9 };
    state.player.ship.cargoPods = 5;

    const quote = quoteShipyard(state, {
      type: 'Shipyard',
      action: 'buy-cargo-pods',
      quantity: 3,
      spendDie: 0,
    });

    expect(quote.ok).toBe(true);
    expect(quote.cost).toBe(30);
    expect(quote.before.cargoPods).toBe(5);
    expect(quote.after.cargoPods).toBe(8);
    expect(quote.before.maxCargoPods).toBe(10);
    expect(quote.after.maxCargoPods).toBe(10);
  });

  it('reports a mutual-exclusion block with the conflicting equipment', () => {
    const state = shipyardState();
    state.player.ship.hasCloaker = true;

    const quote = quoteShipyard(state, {
      type: 'Shipyard',
      action: 'buy-special-equipment',
      equipment: 'AUTO_REPAIR',
      spendDie: 0,
    });

    expect(quote.ok).toBe(false);
    expect(quote.failure?.reason).toBe('MUTUALLY_EXCLUSIVE_EQUIPMENT');
    expect(quote.failure?.conflictingEquipment).toBe('CLOAKER');
    // A blocked quote leaves after === before (no projection).
    expect(quote.after).toEqual(quote.before);
  });

  it('reports the renown gate for a LIEUTENANT quoting Star Buster', () => {
    const state = shipyardState();
    state.player.registry.renownRank = 'LIEUTENANT';

    const quote = quoteShipyard(state, {
      type: 'Shipyard',
      action: 'buy-special-equipment',
      equipment: 'STAR_BUSTER',
      spendDie: 0,
    });

    expect(quote.ok).toBe(false);
    expect(quote.failure?.reason).toBe('INSUFFICIENT_RENOWN');
    expect(quote.failure?.requiredRank).toBe('CAPTAIN');
  });

  it('reports the capacity ceiling for a full default hold', () => {
    const state = startDay(createInitialState(424242)).state;
    // Default ship: hull str1 cond9 → max pods (9+1)*1 = 10, and it starts full.
    const quote = quoteShipyard(state, {
      type: 'Shipyard',
      action: 'buy-cargo-pods',
      quantity: 1,
      spendDie: 0,
    });

    expect(quote.ok).toBe(false);
    expect(quote.failure?.reason).toBe('CAPACITY_EXCEEDED');
    expect(quote.failure?.maxPods).toBe(10);
  });

  it('shows the fuel curve dropping after a drives-strength upgrade', () => {
    const state = shipyardState();
    state.player.ship.drives = { strength: 10, condition: 9 };

    const quote = quoteShipyard(state, {
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'drives',
      tier: 2, // strength 10 → 20
      spendDie: 0,
    });

    expect(quote.after.component?.strength).toBe(20);
    // Stronger drives burn less fuel per jump — the curve the pane previews.
    expect(quote.after.fuelPerJump).toBeLessThan(quote.before.fuelPerJump);
  });

  // T-1206 completeness gate — the Titanium Hull was reader-tested only at the
  // purchase (cargoPods bumped on install). This asserts the standing reader,
  // maxCargoPodsForShip (consumed by the buy-cargo-pods cap and ShipPreview),
  // reads hasTitaniumHull: a fitted Titanium hull raises the serviceable capacity.
  it('TITANIUM_HULL raises serviceable cargo capacity (maxCargoPodsForShip reader)', () => {
    const state = shipyardState();
    const before = maxCargoPodsForShip(state);
    state.player.ship.hasTitaniumHull = true;
    const after = maxCargoPodsForShip(state);
    expect(after).toBeGreaterThan(before);
  });
});
