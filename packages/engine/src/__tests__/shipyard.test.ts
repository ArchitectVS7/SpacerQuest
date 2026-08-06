import { describe, expect, it } from 'vitest';
import {
  ALL_NPC_PROFILES,
  SPECIAL_EQUIPMENT,
  YARD_COMPONENT_TIER_PRICES,
} from '@spacerquest/content';
import { applyPlayerAction, startDay } from '../day.js';
import {
  actorRankIndex,
  componentTierForStrength,
  maxCargoPodsForShip,
  quoteShipyard,
  applyShipyardMutation,
  resolveShipyard,
} from '../actions/shipyard.js';
import {
  RENOWN_RANK_ORDER,
  accrueDeeds,
  emptyDeedRegistry,
  rankForDeedCount,
  renownRankIndex,
} from '../deeds.js';
import { npcShipForProfile } from '../npc.js';
import { hasSpecialEquipment } from '../components.js';
import { createInitialState } from '../state.js';
import {
  GameEvent,
  GameState,
  NpcState,
  PlayerAction,
  ShipyardFail,
  SpecialEquipmentId,
} from '../types.js';

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

/**
 * T-196a · INVERTED, NOT DELETED. This helper asserted `spent[index] === true` until
 * M17 made the whole yard a FREE ACTION (docs/DAWN-HAND-REDESIGN.md §3). Every one of
 * its ~20 call sites is a place the old rule was proven, so each is now a place the
 * NEW rule is proven: a yard order — bought, refused, conflicted or rank-gated —
 * leaves the dawn hand exactly as it found it. The name changed with the meaning.
 */
function expectDieUntouched(state: GameState, index = 0): void {
  expect(state.player.dawnHand?.spent[index]).toBe(false);
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
      });

      expect(result.state.player.credits).toBe(startingCredits - expectedCost);
      expect(result.state.player.ship.weapons).toEqual({ strength: tier * 10, condition: 9 });
      expectDieUntouched(result.state);
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
    });

    expect(result.state.player.credits).toBe(startingCredits - expectedCost);
    expectDieUntouched(result.state);
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

  // T-1603b: the required rank (and the rank to stand one step below it) used to
  // be hand-written per row — a second copy of the content gate that reddened this
  // test when the canonical threshold rescale re-anchored ASTRAXIAL_HULL from
  // GIGA_HERO to TOP_DOG (see the RENOWN GATES RE-ANCHORED block in content
  // `upgrades.ts`). Both are now DERIVED: the row names only the equipment, the
  // gate is read from `SPECIAL_EQUIPMENT`, and `currentRank` is the rank exactly
  // ONE step below it in `RENOWN_RANK_ORDER` — the tightest possible refusal, and
  // one that follows any future re-gating for free.
  const gatedEquipment = SPECIAL_EQUIPMENT.filter(
    (item) => item.requiredRenownRank !== undefined,
  ).map((item) => {
    const required = item.requiredRenownRank!;
    const below = RENOWN_RANK_ORDER[renownRankIndex(required) - 1];
    // `SPECIAL_EQUIPMENT` is widened to the declared interface (so `id` is
    // `string`); the engine's own `SpecialEquipmentId` union is the narrower type
    // the action takes. The narrowing is asserted, not assumed — `quoteShipyard`
    // and the resolver would reject an unknown id, and the ShipyardFail assertion
    // below is what proves this id reached the real gate.
    return [item.id as SpecialEquipmentId, below, required] as const;
  });
  // Guard the derivation itself: an empty table would make this whole block a
  // silent no-op, and a gate at the very bottom rank has no rank below it to
  // stand on.
  it('every renown-gated equipment has a rank below it to be refused from', () => {
    expect(gatedEquipment.length).toBeGreaterThan(0);
    for (const [id, below] of gatedEquipment) {
      expect(below, `${id} is gated at the lowest rank — nothing can be refused`).toBeDefined();
    }
  });

  it.each(gatedEquipment)(
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
      });

      expect(result.state.player.credits).toBe(startingCredits);
      expect(result.state.player.ship).toEqual(startingShip);
      // Shipyard spends the die before business checks (established ShipyardFail
      // convention) — the refusal still consumes the die.
      expectDieUntouched(result.state);
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
      });

      expect(result.state.player.credits).toBe(startingCredits);
      expect(result.state.player.ship).toEqual(startingShip);
      expectDieUntouched(result.state);
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
    expectDieUntouched(result.state);
  });

  it('emits typed insufficient-credit failures without mutating ship or credits', () => {
    const state = shipyardState(49);
    const startingShip = structuredClone(state.player.ship);

    const result = resolveShipyard(state, {
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'weapons',
      tier: 2,
    });

    expect(result.state.player.credits).toBe(49);
    expect(result.state.player.ship).toEqual(startingShip);
    expectDieUntouched(result.state);
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

    const quote = quoteShipyard(state.player, {
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'weapons',
      tier: 4,
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
    };
    const quote = quoteShipyard(shipyardState().player, action);
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

    const quote = quoteShipyard(state.player, {
      type: 'Shipyard',
      action: 'buy-cargo-pods',
      quantity: 3,
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

    const quote = quoteShipyard(state.player, {
      type: 'Shipyard',
      action: 'buy-special-equipment',
      equipment: 'AUTO_REPAIR',
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

    const quote = quoteShipyard(state.player, {
      type: 'Shipyard',
      action: 'buy-special-equipment',
      equipment: 'STAR_BUSTER',
    });

    expect(quote.ok).toBe(false);
    expect(quote.failure?.reason).toBe('INSUFFICIENT_RENOWN');
    expect(quote.failure?.requiredRank).toBe('CAPTAIN');
  });

  it('reports the capacity ceiling for a full default hold', () => {
    const state = startDay(createInitialState(424242)).state;
    // Default ship: hull str1 cond9 → max pods (9+1)*1 = 10, and it starts full.
    const quote = quoteShipyard(state.player, {
      type: 'Shipyard',
      action: 'buy-cargo-pods',
      quantity: 1,
    });

    expect(quote.ok).toBe(false);
    expect(quote.failure?.reason).toBe('CAPACITY_EXCEEDED');
    expect(quote.failure?.maxPods).toBe(10);
  });

  it('shows the fuel curve dropping after a drives-strength upgrade', () => {
    const state = shipyardState();
    state.player.ship.drives = { strength: 10, condition: 9 };

    const quote = quoteShipyard(state.player, {
      type: 'Shipyard',
      action: 'buy-component-tier',
      component: 'drives',
      tier: 2, // strength 10 → 20
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
    const before = maxCargoPodsForShip(state.player.ship);
    state.player.ship.hasTitaniumHull = true;
    const after = maxCargoPodsForShip(state.player.ship);
    expect(after).toBeGreaterThan(before);
  });

  // T-1402 REGRESSION — the tier-1-hull→0-pods trap. Foundation's `> 9` boundary
  // parked a strength-10 (tier-1) hull at hx=0, so buying a tier-1 hull yielded 0
  // pods — strictly worse than the junker's 10. The `> 10` boundary gives it a
  // real, monotonic capacity while leaving every pinned value untouched.
  it('a tier-1 hull (strength 10) has non-zero cargo capacity (pod-trap fixed)', () => {
    const cases: [number, number][] = [
      [1, 10], // junker str1 cond9 → (9+1)*1
      [10, 100], // tier-1 str10 → (9+1)*10 — was 0 before the fix
      [20, 100], // tier-2 str20 → (9+1)*10
      [30, 200], // tier-3 str30 → (9+1)*20
    ];
    for (const [strength, expectedPods] of cases) {
      const state = shipyardState();
      state.player.ship.hull = { strength, condition: 9 };
      state.player.ship.hasTitaniumHull = false;
      expect(maxCargoPodsForShip(state.player.ship)).toBe(expectedPods);
    }
  });
});

describe('componentTierForStrength (T-1401 export pack)', () => {
  it('maps bought multiples of 10 to their exact tier', () => {
    const cases: [number, number][] = [
      [10, 1],
      [20, 2],
      [29, 2],
      [90, 9],
    ];
    for (const [strength, tier] of cases) {
      expect(componentTierForStrength(strength)).toBe(tier);
    }
  });

  it('resolves a junker (strength 1-9) to tier 0, not tier 1', () => {
    // REGRESSION: the UI invented `max(1, ceil(strength/10))`, which mapped a
    // junker hull (strength 1) to tier 1 → nextTier 2, making TIER 1 UNBUYABLE.
    // floor maps it to 0 → nextTier 1 is buyable.
    expect(componentTierForStrength(1)).toBe(0);
    expect(componentTierForStrength(9)).toBe(0);
    // Contrast with the old broken inverse:
    expect(Math.max(1, Math.ceil(1 / 10))).toBe(1);
  });

  it('is the exact inverse of the buy mutation (strength = tier * 10) for tiers 1-9', () => {
    for (let tier = 1; tier <= 9; tier++) {
      expect(componentTierForStrength(tier * 10)).toBe(tier);
    }
  });

  it('clamps a stripped component (strength 0) to tier 0', () => {
    expect(componentTierForStrength(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// N11/T-021 · A CAPTAIN GOES THROUGH THE SAME RENOWN GATE, BOTH DIRECTIONS.
//
// The gate at `specialEquipmentFailure`'s `requiredRank` check is the ONE gate for
// both actors, so these cases run an `NpcState` through `quoteShipyard` /
// `applyShipyardMutation` with no NPC-specific branch anywhere in `shipyard.ts` to
// support them. THE RANK IS EARNED, NEVER ASSIGNED: every deed below is accrued
// through the player's own `accrueDeeds` from real deed-source events, because a
// hand-set `renownRank` would prove only that the comparison compiles.
// ---------------------------------------------------------------------------
describe('N11 · a captain goes through the SAME renown gate', () => {
  /** A live captain record, seeded exactly as `createInitialState` seeds one, and
   *  passed as the `ShipyardActor` ITSELF — no wrapper, which is what proves the
   *  real record satisfies the interface structurally (and keeps the credit debit
   *  landing on the real purse). */
  function captain(credits = 500_000): NpcState {
    const profile = ALL_NPC_PROFILES.find((p) => p.id === 'npc-cargo-king')!;
    const ship = npcShipForProfile(profile);
    // Isolate the RENOWN gate for ASTRAXIAL_HULL, whose other prerequisite is
    // drives >= 25 — without this a refusal could be the prereq rather than the rank.
    ship.drives = { strength: 30, condition: 9 };
    return {
      id: profile.id,
      name: profile.name,
      profileId: profile.id,
      currentSystemId: 1,
      credits,
      ship,
      registry: emptyDeedRegistry(),
      disposition: 0,
    };
  }

  /** A signed manifest, a delivery and five arrivals (one of them rimward) — the
   *  shapes `npc.ts` `executeTrade` / `executeTravel` really emit. Enough real deed
   *  sources to carry a captain past the CAPTAIN threshold without naming a rank. */
  function deedSourceBatch(characterId: string): GameEvent[] {
    const arrive = (destination: number): GameEvent => ({
      type: 'TravelEvent',
      characterId,
      origin: 1,
      destination,
      fuelUsed: 40,
      success: true,
    });
    return [
      {
        type: 'TradeEvent',
        characterId,
        action: 'sign-contract',
        success: true,
        destination: 2,
        cargoType: 1,
        payment: 900,
        actionDetails: 'Signed a manifest.',
      },
      {
        type: 'TradeEvent',
        characterId,
        action: 'deliver-cargo',
        success: true,
        destination: 2,
        cargoType: 1,
        payment: 900,
        actionDetails: 'Delivered cargo!',
      },
      arrive(2),
      arrive(3),
      arrive(4),
      arrive(5),
      arrive(17),
    ];
  }

  /** Every renown-gated row, derived from content exactly as the player-side block
   *  above derives it — hand-writing STAR_BUSTER here would be a second gate table. */
  const gated = SPECIAL_EQUIPMENT.filter((item) => item.requiredRenownRank !== undefined).map(
    (item) => [item.id as SpecialEquipmentId, item.requiredRenownRank!] as const,
  );

  const buyAction = (equipment: SpecialEquipmentId): ShipyardAction => ({
    type: 'Shipyard',
    action: 'buy-special-equipment',
    equipment,
  });

  it('actorRankIndex returns a REAL standing (>= 0) for a captain carrying a registry', () => {
    // THE REGRESSION THIS PINS: `ShipyardActor.registry` used to be optional and no
    // captain held one, so this returned −1 — strictly below every rung, forever.
    // It has to be asserted DIRECTLY: a −1 and a 0 produce the identical
    // INSUFFICIENT_RENOWN refusal from a quote, so no outcome-level test can tell
    // the permanent lockout from a real bottom rung.
    const fresh = captain();
    expect(actorRankIndex(fresh)).toBeGreaterThanOrEqual(0);
    expect(actorRankIndex(fresh)).toBe(renownRankIndex(fresh.registry.renownRank));

    // …and it tracks the standing the captain EARNS, rather than being pinned.
    accrueDeeds(fresh, deedSourceBatch(fresh.id), { day: 4, conquerorLocked: false });
    expect(actorRankIndex(fresh)).toBeGreaterThan(0);
    expect(actorRankIndex(fresh)).toBe(renownRankIndex(fresh.registry.renownRank));
  });

  it.each(gated)(
    'REFUSES %s to a captain with no deeds, however rich (the gate bites)',
    (equipment, requiredRank) => {
      const noDeeds = captain();
      expect(noDeeds.registry.earned).toEqual([]);
      const beforeCredits = noDeeds.credits;
      const beforeShip = structuredClone(noDeeds.ship);

      const quote = quoteShipyard(noDeeds, buyAction(equipment));

      expect(quote.ok).toBe(false);
      // Money is emphatically not the blocker at half a million credits.
      expect(quote.failure).toMatchObject({ reason: 'INSUFFICIENT_RENOWN', requiredRank });
      // `applyShipyardMutation` is never reached, and the QUOTE itself mutates
      // nothing — the projection runs on a throwaway.
      expect(noDeeds.credits).toBe(beforeCredits);
      expect(noDeeds.ship).toEqual(beforeShip);
      expect(hasSpecialEquipment(noDeeds.ship, equipment)).toBe(false);
    },
  );

  it('SELLS a captain every gated item their EARNED rank clears, and refuses the rest', () => {
    // The partition is derived from the rank the captain actually earned, so no row
    // is dropped: each gated item is asserted either as a purchase (gate cleared) or
    // as a rank refusal at that same standing. ASTRAXIAL_HULL is expected in the
    // second group — TOP_DOG is 17 deeds, above the 13-id source ceiling T-020
    // measured for the cast, which is a finding about deed supply and never a reason
    // to move a threshold or hand the captain a rank.
    const earner = captain();
    accrueDeeds(earner, deedSourceBatch(earner.id), { day: 4, conquerorLocked: false });
    // The rank was EARNED and DERIVED — `rankForDeedCount` is the only derivation.
    expect(earner.registry.earned.length).toBeGreaterThan(0);
    expect(earner.registry.renownRank).toBe(rankForDeedCount(earner.registry.earned.length));

    let purchased = 0;
    let refused = 0;
    for (const [equipment, requiredRank] of gated) {
      const clears = actorRankIndex(earner) >= renownRankIndex(requiredRank);
      const quote = quoteShipyard(earner, buyAction(equipment));

      if (!clears) {
        expect(quote.ok).toBe(false);
        expect(quote.failure).toMatchObject({ reason: 'INSUFFICIENT_RENOWN', requiredRank });
        refused += 1;
        continue;
      }

      expect(quote.ok).toBe(true);
      const before = earner.credits;
      applyShipyardMutation(earner, buyAction(equipment));
      // Debited by exactly the quoted cost, on the captain's own purse.
      expect(earner.credits).toBe(before - quote.cost);
      // Read through the SHARED fitted-equipment reader, so the test does not
      // restate the id→flag mapping.
      expect(hasSpecialEquipment(earner.ship, equipment)).toBe(true);
      // The repeat purchase is impossible with no NPC bookkeeping — the yard refuses
      // it, which is why `considerRefit` pre-filters nothing.
      const second = quoteShipyard(earner, buyAction(equipment));
      expect(second.ok).toBe(false);
      expect(second.failure?.reason).toBe('ALREADY_INSTALLED');
      purchased += 1;
    }

    // Non-vacuous in both directions: the block would otherwise pass on an empty
    // table or on an all-refusals run (the dormant gate, which is the bug).
    expect(purchased).toBeGreaterThan(0);
    expect(purchased + refused).toBe(gated.length);
  });
});
