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
import { jumpFuelCost, maxJumpDistance } from '../economy.js';

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
// `hull.strength * 1000`, capped at 20,000. This is FAITHFUL to foundation,
// NOT a divergence: foundation (f2f95fa9:foundation/rules/upgrades.ts ~L731)
// sets `price = hullStrength > 20 ? 20000 : hullStrength * 1000`. Because the
// multiplier is 1000, `hull*1000` reaches 20,000 exactly at hull=20 (foundation's
// threshold), so the `Math.min(hull.strength * 1000, 20000)` form below is
// mathematically identical to foundation's branch. (Corrects an earlier, false
// "intentional engine divergence" note — see docs/BALANCE-POLICY.md v0.1 errata.)
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

/** Validate the ACTION SHAPE (throws on malformed input) without touching state
 *  or spending a die. Shared by `resolveShipyard` and the pure `quoteShipyard`
 *  preview so both reject the same malformed actions identically. */
function validateShipyardShape(action: Extract<PlayerAction, { type: 'Shipyard' }>): void {
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
}

/**
 * The credit cost of a shipyard action, read from the ship's CURRENT state — no
 * mutation, no die. The single source of truth for pricing shared by the
 * resolver, the failure check (INSUFFICIENT_CREDITS), and the preview quote.
 */
export function shipyardCost(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
): number {
  if (action.action === 'buy-component-tier') {
    const { component, tier } = validateTierPurchase(action);
    return componentTierCost(state, component, tier);
  }
  if (action.action === 'repair') {
    const { component, repairMode } = validateRepair(action);
    return component ? repairCost(state, component, repairMode) : repairAllCost(state);
  }
  if (action.action === 'buy-cargo-pods') {
    return validateCargoPods(action) * 10;
  }
  return specialEquipmentCost(state, validateSpecialEquipment(action));
}

/**
 * The FIRST blocking failure for a shipyard action, or null if it would succeed.
 * Runs exactly the checks `resolveShipyard` runs — the structural gate (at-max,
 * no-hull, capacity, equipment exclusion/prereq/renown) then the credit check —
 * in the same order, reading current state without mutation or die spend. This
 * is the single rule surface: both the resolver and the UI preview call it, so
 * the "disabled, not hidden — here's why" reasons the pane shows are the exact
 * typed reasons the engine would emit on a real purchase.
 */
export function shipyardFailure(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
): ShipyardFail | null {
  if (action.action === 'buy-component-tier') {
    const { component, tier } = validateTierPurchase(action);
    return ensureCredits(state, action, componentTierCost(state, component, tier));
  }

  if (action.action === 'repair') {
    const { component, repairMode } = validateRepair(action);
    if (component) {
      if (state.player.ship[component].condition >= 9) {
        return fail(action, { reason: 'AT_MAX_CONDITION' });
      }
      return ensureCredits(state, action, repairCost(state, component, repairMode));
    }
    return ensureCredits(state, action, repairAllCost(state));
  }

  if (action.action === 'buy-cargo-pods') {
    const quantity = validateCargoPods(action);
    if (state.player.ship.hull.strength < 1) {
      return fail(action, { reason: 'NO_HULL' });
    }
    const maxPods = maxCargoPodsForShip(state);
    if (state.player.ship.cargoPods + quantity > maxPods) {
      return fail(action, { reason: 'CAPACITY_EXCEEDED', maxPods });
    }
    return ensureCredits(state, action, quantity * 10);
  }

  const equipment = validateSpecialEquipment(action);
  const equipmentFailure = specialEquipmentFailure(state, action, equipment);
  if (equipmentFailure) return equipmentFailure;
  return ensureCredits(state, action, specialEquipmentCost(state, equipment));
}

/**
 * Apply the pure state mutation of a shipyard purchase, ASSUMING it has already
 * passed `shipyardFailure` (caller's responsibility). Mutates `state` in place —
 * `resolveShipyard` runs it on its clone, and `quoteShipyard` runs it on a
 * throwaway clone to project the "after". No die, no events, no validation.
 */
export function applyShipyardMutation(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
): void {
  const ship = state.player.ship;

  if (action.action === 'buy-component-tier') {
    const { component, tier } = validateTierPurchase(action);
    state.player.credits -= componentTierCost(state, component, tier);
    ship[component].strength = tier * 10;
    ship[component].condition = 9;
    if (component === 'hull' && ship.hull.strength > 4) {
      ship.hasCloaker = false;
    }
    return;
  }

  if (action.action === 'repair') {
    const { component, repairMode } = validateRepair(action);
    if (component) {
      const current = ship[component];
      state.player.credits -= repairCost(state, component, repairMode);
      current.condition = repairMode === 'single' ? Math.min(9, current.condition + 1) : 9;
      return;
    }
    state.player.credits -= repairAllCost(state);
    for (const repairComponent of COMPONENT_IDS) {
      ship[repairComponent].condition = 9;
    }
    return;
  }

  if (action.action === 'buy-cargo-pods') {
    const quantity = validateCargoPods(action);
    state.player.credits -= quantity * 10;
    ship.cargoPods += quantity;
    return;
  }

  const equipment = validateSpecialEquipment(action);
  state.player.credits -= specialEquipmentCost(state, equipment);
  installSpecialEquipment(state, equipment);
}

/** Build the success event with exactly the fields the action carries — the
 *  shape the resolver has always emitted (kept branch-specific so no undefined
 *  keys leak into the event log). */
function shipyardEvent(
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
  cost: number,
): GameEvent {
  if (action.action === 'buy-component-tier') {
    return {
      type: 'ShipyardEvent',
      action: action.action,
      component: action.component,
      tier: action.tier,
      cost,
    };
  }
  if (action.action === 'repair') {
    return action.component
      ? {
          type: 'ShipyardEvent',
          action: action.action,
          component: action.component,
          repairMode: action.repairMode,
          cost,
        }
      : { type: 'ShipyardEvent', action: action.action, repairMode: action.repairMode, cost };
  }
  if (action.action === 'buy-cargo-pods') {
    return { type: 'ShipyardEvent', action: action.action, quantity: action.quantity, cost };
  }
  return { type: 'ShipyardEvent', action: action.action, equipment: action.equipment, cost };
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
  validateShipyardShape(action);

  // Established ShipyardFail convention: the die is spent BEFORE the business
  // checks, so even a refused purchase consumes it. The UI avoids wasting a die
  // on a predictable refusal by gating its buttons on `quoteShipyard().ok`.
  const { hand } = spendDie(nextState.player.dawnHand!, action.spendDie);
  nextState.player.dawnHand = hand;

  const failure = shipyardFailure(nextState, action);
  if (failure) {
    events.push(failure);
    return { state: nextState, events };
  }

  // Cost is snapshot BEFORE mutation (trade-in / hull-scaled prices read current
  // strength); the mutation recomputes it against the same pre-mutation state.
  const cost = shipyardCost(nextState, action);
  applyShipyardMutation(nextState, action);
  events.push(shipyardEvent(action, cost));
  return { state: nextState, events };
}

/**
 * A DISPLAY sample-point on the fuel curve — the reference jump distance the
 * shipyard preview prices `fuelPerJump` at so a drives upgrade shows a concrete
 * before→after fuel number. It is NOT a balance constant (no rule reads it); the
 * real per-jump cost of any real route always comes from `jumpFuelCost` against
 * that route's distance. Chosen mid-range so both weak and strong drives differ.
 */
export const REF_JUMP_DISTANCE = 5;

/** A projected snapshot of the ship's cargo/fuel instruments (and, when the
 *  action targets one, the affected component) — everything the pane's
 *  before→after preview reads. Pure derivation; nothing here is persisted. */
export interface ShipPreview {
  cargoPods: number;
  maxCargoPods: number;
  fuel: number;
  maxFuel: number;
  /** Sample of the fuel curve at REF_JUMP_DISTANCE (display only). */
  fuelPerJump: number;
  maxJumpDistance: number;
  component?: { id: ShipComponentId; strength: number; condition: number };
}

/** The preview a purchase button needs: whether it is allowed and why not, its
 *  cost, and the ship instruments before and (if allowed) after the purchase. */
export interface ShipyardQuote {
  /** No blocking failure — affordable and all rules satisfied. */
  ok: boolean;
  cost: number;
  /** The typed reason when `!ok`, for the pane to translate to prose. */
  failure: ShipyardFail | null;
  before: ShipPreview;
  /** Projected post-purchase instruments; identical to `before` when `!ok`. */
  after: ShipPreview;
}

function shipPreview(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
): ShipPreview {
  const ship = state.player.ship;
  const preview: ShipPreview = {
    cargoPods: ship.cargoPods,
    maxCargoPods: maxCargoPodsForShip(state),
    fuel: ship.fuel,
    maxFuel: ship.maxFuel,
    fuelPerJump: jumpFuelCost(ship.drives, REF_JUMP_DISTANCE, ship.hasTransWarpDrive ?? false),
    maxJumpDistance: maxJumpDistance(ship.drives, ship.fuel, ship.hasTransWarpDrive ?? false),
  };
  if (
    (action.action === 'buy-component-tier' || action.action === 'repair') &&
    action.component &&
    isComponentId(action.component)
  ) {
    const c = ship[action.component];
    preview.component = {
      id: action.component,
      strength: c.strength,
      condition: c.condition,
    };
  }
  return preview;
}

/**
 * PURE preview of a shipyard purchase — the engine function the ship pane reads
 * for its before→after numbers and its "disabled, here's why" reasons. It spends
 * no die and MUST NOT mutate the input: the projected `after` is taken from a
 * throwaway clone. Every rule (cost, exclusion, prereq, renown, capacity) is the
 * same code `resolveShipyard` runs, so the preview can never disagree with the
 * real purchase.
 */
export function quoteShipyard(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
): ShipyardQuote {
  validateShipyardShape(action);
  const cost = shipyardCost(state, action);
  const failure = shipyardFailure(state, action);
  const ok = failure === null;
  const before = shipPreview(state, action);
  let after = before;
  if (ok) {
    const clone = cloneState(state);
    applyShipyardMutation(clone, action);
    after = shipPreview(clone, action);
  }
  return { ok, cost, failure, before, after };
}
