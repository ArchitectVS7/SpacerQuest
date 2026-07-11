import { SPECIAL_EQUIPMENT, YARD_COMPONENT_TIER_PRICES } from '@spacerquest/content';
import {
  GameEvent,
  GameState,
  PlayerAction,
  ShipComponentId,
  ShipyardFail,
  SpecialEquipmentId,
} from '../types.js';
import { spendDie } from '../dice.js';
import { renownRankIndex } from '../deeds.js';

const COMPONENT_IDS: readonly ShipComponentId[] = [
  'hull',
  'drives',
  'cabin',
  'lifeSupport',
  'weapons',
  'navigation',
  'robotics',
  'shields',
];

function isComponentId(value: unknown): value is ShipComponentId {
  return typeof value === 'string' && COMPONENT_IDS.includes(value as ShipComponentId);
}

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function tradeInValue(strength: number): number {
  if (strength < 1) return 0;
  if (strength === 1) return 25;
  if (strength === 2) return 50;
  if (strength === 3) return 100;
  if (strength === 4) return 200;
  if (strength === 5) return 400;
  if (strength === 6) return 700;
  if (strength === 7) return 1000;
  if (strength === 8) return 2000;
  return 3000;
}

function componentTierCost(state: GameState, component: ShipComponentId, tier: number): number {
  const price = YARD_COMPONENT_TIER_PRICES[tier - 1];
  if (price === undefined) {
    throw new Error('Invalid shipyard component tier');
  }

  const current = state.player.ship[component];
  let tradeStrength = current.strength;
  if (component === 'hull' && state.player.ship.hasTitaniumHull && tradeStrength > 9) {
    tradeStrength -= 10;
  }

  return Math.max(0, price - tradeInValue(tradeStrength));
}

function rebuildFee(condition: number): number {
  return condition === 0 ? 2000 : 0;
}

function repairCost(state: GameState, component: ShipComponentId, mode: 'all' | 'single'): number {
  const current = state.player.ship[component];
  if (mode === 'single') {
    return current.strength + rebuildFee(current.condition);
  }
  return (9 - current.condition) * current.strength + rebuildFee(current.condition);
}

function repairAllCost(state: GameState): number {
  let cost = 100;
  for (const component of COMPONENT_IDS) {
    const current = state.player.ship[component];
    if (current.condition < 9) {
      cost += repairCost(state, component, 'all');
    }
  }
  return cost;
}

export function maxCargoPodsForShip(state: GameState): number {
  const ship = state.player.ship;
  let hullCapacity = ship.hull.strength;
  if (hullCapacity > 9) {
    hullCapacity -= 10;
  }
  if (ship.hasTitaniumHull) {
    hullCapacity += 5;
  }
  return (ship.hull.condition + 1) * hullCapacity;
}

// Hull-scaled equipment (AUTO_REPAIR, TITANIUM_HULL) prices at
// `hull.strength * priceMultiplier` (multiplier 1000, per foundation
// constants.ts:91/116). The `Math.min(..., 20000)` ceiling is an INTENTIONAL
// engine divergence: foundation defines the multiplier but no cap, which lets
// the price run away at high hull tiers; the 20,000 cap keeps late-game
// refits affordable relative to the credit economy. See the boundary test in
// shipyard.test.ts.
const HULL_SCALED_EQUIPMENT_PRICE_CAP = 20000;

function specialEquipmentCost(state: GameState, equipment: SpecialEquipmentId): number {
  if (equipment === 'CLOAKER') return 500;
  if (equipment === 'AUTO_REPAIR')
    return Math.min(state.player.ship.hull.strength * 1000, HULL_SCALED_EQUIPMENT_PRICE_CAP);
  if (equipment === 'ASTRAXIAL_HULL') return 100000;
  if (equipment === 'TITANIUM_HULL')
    return Math.min(state.player.ship.hull.strength * 1000, HULL_SCALED_EQUIPMENT_PRICE_CAP);
  return 10000;
}

function fail(
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
  failEvent: Omit<ShipyardFail, 'type' | 'action'>,
): ShipyardFail {
  return {
    type: 'ShipyardFail',
    action: action.action,
    component: action.component,
    tier: action.tier,
    repairMode: action.repairMode,
    quantity: action.quantity,
    equipment: action.equipment,
    ...failEvent,
  };
}

function ensureCredits(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
  cost: number,
): ShipyardFail | null {
  if (state.player.credits >= cost) return null;
  return fail(action, {
    reason: 'INSUFFICIENT_CREDITS',
    cost,
    credits: state.player.credits,
  });
}

function validateTierPurchase(action: Extract<PlayerAction, { type: 'Shipyard' }>): {
  component: ShipComponentId;
  tier: number;
} {
  const tier = action.tier;
  if (!isComponentId(action.component)) {
    throw new Error('Must specify component for shipyard component tier purchase');
  }
  if (typeof tier !== 'number' || !Number.isInteger(tier) || tier < 1 || tier > 9) {
    throw new Error('Component tier must be an integer from 1 to 9');
  }
  return { component: action.component, tier };
}

function validateRepair(action: Extract<PlayerAction, { type: 'Shipyard' }>): {
  component?: ShipComponentId;
  repairMode: 'all' | 'single';
} {
  if (action.repairMode !== 'all' && action.repairMode !== 'single') {
    throw new Error('Must specify repairMode for shipyard repair');
  }
  if (action.component !== undefined && !isComponentId(action.component)) {
    throw new Error('Invalid shipyard repair component');
  }
  if (action.repairMode === 'single' && action.component === undefined) {
    throw new Error('Must specify component for single-component repair');
  }
  return { component: action.component, repairMode: action.repairMode };
}

function validateCargoPods(action: Extract<PlayerAction, { type: 'Shipyard' }>): number {
  const quantity = action.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
    throw new Error('Cargo pod quantity must be a positive integer');
  }
  return quantity;
}

function validateSpecialEquipment(
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
): SpecialEquipmentId {
  if (!action.equipment) {
    throw new Error('Must specify equipment for shipyard special equipment purchase');
  }
  return action.equipment;
}

function installSpecialEquipment(state: GameState, equipment: SpecialEquipmentId): void {
  const ship = state.player.ship;
  if (equipment === 'CLOAKER') {
    ship.hasCloaker = true;
    ship.hull.condition = 9;
    ship.shields.condition = 9;
  } else if (equipment === 'AUTO_REPAIR') {
    ship.hasAutoRepair = true;
  } else if (equipment === 'STAR_BUSTER') {
    ship.hasStarBuster = true;
    ship.weapons.condition = 9;
  } else if (equipment === 'ARCH_ANGEL') {
    ship.hasArchAngel = true;
    ship.shields.condition = 9;
  } else if (equipment === 'ASTRAXIAL_HULL') {
    ship.isAstraxialHull = true;
    ship.hull.strength = 29;
    ship.hull.condition = 9;
    ship.cargoPods = 190;
    ship.fuel = 2900;
  } else if (equipment === 'TITANIUM_HULL') {
    ship.hasTitaniumHull = true;
    ship.cargoPods += 50;
  } else {
    ship.hasTransWarpDrive = true;
  }
}

function alreadyInstalled(state: GameState, equipment: SpecialEquipmentId): boolean {
  const ship = state.player.ship;
  if (equipment === 'CLOAKER') return ship.hasCloaker === true;
  if (equipment === 'AUTO_REPAIR') return ship.hasAutoRepair === true;
  if (equipment === 'STAR_BUSTER') return ship.hasStarBuster === true;
  if (equipment === 'ARCH_ANGEL') return ship.hasArchAngel === true;
  if (equipment === 'ASTRAXIAL_HULL') return ship.isAstraxialHull === true;
  if (equipment === 'TITANIUM_HULL') return ship.hasTitaniumHull === true;
  return ship.hasTransWarpDrive === true;
}

function specialEquipmentFailure(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
  equipment: SpecialEquipmentId,
): ShipyardFail | null {
  const ship = state.player.ship;

  if (alreadyInstalled(state, equipment)) {
    return fail(action, { reason: 'ALREADY_INSTALLED' });
  }

  // T-105 acceptance requires mutual exclusions to emit typed fail events.
  // Foundation strips conflicting equipment and proceeds for some purchases;
  // v1 keeps these installs atomic so headless callers can show a clear choice.
  if (equipment === 'CLOAKER' && ship.hasAutoRepair) {
    return fail(action, {
      reason: 'MUTUALLY_EXCLUSIVE_EQUIPMENT',
      conflictingEquipment: 'AUTO_REPAIR',
    });
  }
  if (equipment === 'AUTO_REPAIR' && ship.hasCloaker) {
    return fail(action, {
      reason: 'MUTUALLY_EXCLUSIVE_EQUIPMENT',
      conflictingEquipment: 'CLOAKER',
    });
  }
  if (equipment === 'CLOAKER' && ship.hasArchAngel) {
    return fail(action, {
      reason: 'MUTUALLY_EXCLUSIVE_EQUIPMENT',
      conflictingEquipment: 'ARCH_ANGEL',
    });
  }
  if (equipment === 'CLOAKER' && ship.hasStarBuster) {
    return fail(action, {
      reason: 'MUTUALLY_EXCLUSIVE_EQUIPMENT',
      conflictingEquipment: 'STAR_BUSTER',
    });
  }
  if (equipment === 'STAR_BUSTER' && ship.hasCloaker) {
    return fail(action, {
      reason: 'MUTUALLY_EXCLUSIVE_EQUIPMENT',
      conflictingEquipment: 'CLOAKER',
    });
  }
  if (equipment === 'ARCH_ANGEL' && ship.hasCloaker) {
    return fail(action, {
      reason: 'MUTUALLY_EXCLUSIVE_EQUIPMENT',
      conflictingEquipment: 'CLOAKER',
    });
  }
  if (equipment === 'AUTO_REPAIR' && ship.hasTitaniumHull) {
    return fail(action, {
      reason: 'MUTUALLY_EXCLUSIVE_EQUIPMENT',
      conflictingEquipment: 'TITANIUM_HULL',
    });
  }
  if (equipment === 'TITANIUM_HULL' && ship.hasAutoRepair) {
    return fail(action, {
      reason: 'MUTUALLY_EXCLUSIVE_EQUIPMENT',
      conflictingEquipment: 'AUTO_REPAIR',
    });
  }

  // Renown gate: special equipment unlocks are driven by Deeds/Renown rank
  // (declared in content SPECIAL_EQUIPMENT), replacing foundation's vestigial
  // score/conqueror gates that were never incremented.
  const requiredRank = SPECIAL_EQUIPMENT.find(
    (entry) => entry.id === equipment,
  )?.requiredRenownRank;
  if (
    requiredRank &&
    renownRankIndex(state.player.registry.renownRank) < renownRankIndex(requiredRank)
  ) {
    return fail(action, { reason: 'INSUFFICIENT_RENOWN', requiredRank });
  }

  if (equipment === 'CLOAKER') {
    if (ship.hull.strength < 1 || ship.hull.strength > 4) {
      return fail(action, { reason: 'PREREQUISITE_NOT_MET', prerequisite: 'HULL_STRENGTH_1_TO_4' });
    }
    if (ship.shields.strength < 1) {
      return fail(action, { reason: 'PREREQUISITE_NOT_MET', prerequisite: 'SHIELDS' });
    }
  } else if (equipment === 'AUTO_REPAIR' && ship.hull.strength < 1) {
    return fail(action, { reason: 'NO_HULL' });
  } else if (equipment === 'ASTRAXIAL_HULL' && ship.drives.strength < 25) {
    return fail(action, { reason: 'PREREQUISITE_NOT_MET', prerequisite: 'DRIVES_STRENGTH_25' });
  }

  return null;
}

export function resolveShipyard(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
): { state: GameState; events: GameEvent[] } {
  const nextState = cloneState(state);
  const events: GameEvent[] = [];

  if (action.spendDie === undefined) {
    throw new Error('Must spend a die for shipyard action');
  }

  if (action.action === 'buy-component-tier') {
    validateTierPurchase(action);
  } else if (action.action === 'repair') {
    validateRepair(action);
  } else if (action.action === 'buy-cargo-pods') {
    validateCargoPods(action);
  } else if (action.action === 'buy-special-equipment') {
    validateSpecialEquipment(action);
  } else {
    throw new Error('Unknown shipyard action');
  }

  const { hand } = spendDie(nextState.player.dawnHand!, action.spendDie);
  nextState.player.dawnHand = hand;

  if (action.action === 'buy-component-tier') {
    const { component, tier } = validateTierPurchase(action);
    const cost = componentTierCost(nextState, component, tier);
    const creditFailure = ensureCredits(nextState, action, cost);
    if (creditFailure) {
      events.push(creditFailure);
      return { state: nextState, events };
    }

    nextState.player.credits -= cost;
    nextState.player.ship[component].strength = tier * 10;
    nextState.player.ship[component].condition = 9;
    if (component === 'hull' && nextState.player.ship.hull.strength > 4) {
      nextState.player.ship.hasCloaker = false;
    }
    events.push({ type: 'ShipyardEvent', action: action.action, component, tier, cost });
    return { state: nextState, events };
  }

  if (action.action === 'repair') {
    const { component, repairMode } = validateRepair(action);
    if (component) {
      const current = nextState.player.ship[component];
      if (current.condition >= 9) {
        events.push(fail(action, { reason: 'AT_MAX_CONDITION' }));
        return { state: nextState, events };
      }
      const cost = repairCost(nextState, component, repairMode);
      const creditFailure = ensureCredits(nextState, action, cost);
      if (creditFailure) {
        events.push(creditFailure);
        return { state: nextState, events };
      }

      nextState.player.credits -= cost;
      current.condition = repairMode === 'single' ? Math.min(9, current.condition + 1) : 9;
      events.push({ type: 'ShipyardEvent', action: action.action, component, repairMode, cost });
      return { state: nextState, events };
    }

    const cost = repairAllCost(nextState);
    const creditFailure = ensureCredits(nextState, action, cost);
    if (creditFailure) {
      events.push(creditFailure);
      return { state: nextState, events };
    }

    nextState.player.credits -= cost;
    for (const repairComponent of COMPONENT_IDS) {
      nextState.player.ship[repairComponent].condition = 9;
    }
    events.push({ type: 'ShipyardEvent', action: action.action, repairMode, cost });
    return { state: nextState, events };
  }

  if (action.action === 'buy-cargo-pods') {
    const quantity = validateCargoPods(action);
    if (nextState.player.ship.hull.strength < 1) {
      events.push(fail(action, { reason: 'NO_HULL' }));
      return { state: nextState, events };
    }

    const maxPods = maxCargoPodsForShip(nextState);
    if (nextState.player.ship.cargoPods + quantity > maxPods) {
      events.push(fail(action, { reason: 'CAPACITY_EXCEEDED', maxPods }));
      return { state: nextState, events };
    }

    const cost = quantity * 10;
    const creditFailure = ensureCredits(nextState, action, cost);
    if (creditFailure) {
      events.push(creditFailure);
      return { state: nextState, events };
    }

    nextState.player.credits -= cost;
    nextState.player.ship.cargoPods += quantity;
    events.push({ type: 'ShipyardEvent', action: action.action, quantity, cost });
    return { state: nextState, events };
  }

  const equipment = validateSpecialEquipment(action);
  const equipmentFailure = specialEquipmentFailure(nextState, action, equipment);
  if (equipmentFailure) {
    events.push(equipmentFailure);
    return { state: nextState, events };
  }

  const cost = specialEquipmentCost(nextState, equipment);
  const creditFailure = ensureCredits(nextState, action, cost);
  if (creditFailure) {
    events.push(creditFailure);
    return { state: nextState, events };
  }

  nextState.player.credits -= cost;
  installSpecialEquipment(nextState, equipment);
  events.push({ type: 'ShipyardEvent', action: action.action, equipment, cost });
  return { state: nextState, events };
}
