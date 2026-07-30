import {
  RenownRankId,
  SPECIAL_EQUIPMENT,
  YARD_COMPONENT_TIER_PRICES,
  YARD_COMPONENT_TRADE_IN,
} from '@spacerquest/content';
import {
  GameEvent,
  GameState,
  PlayerAction,
  ShipComponentId,
  ShipState,
  ShipyardFail,
  SpecialEquipmentId,
} from '../types.js';
import { spendDie } from '../dice.js';
import { renownRankIndex } from '../deeds.js';
import { jumpFuelCost, maxJumpDistance } from '../economy.js';
import { crewCapacity, hasSpecialEquipment, navFuelFactor, repairRate } from '../components.js';
import { cloneState } from '../clone.js';

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

/**
 * N2 · THE CAPTAIN A SHIPYARD ACTION IS PRICED AND APPLIED AGAINST.
 *
 * WHY THIS TYPE EXISTS. Every function below used to take `(state: GameState, …)`
 * and read `state.player.ship` / `.credits` / `.registry` directly, so **an NPC
 * could not be priced through any of them.** That made N2's instruction to price
 * NPC upgrades "through the engine's own `quoteShipyard`, never a parallel cost
 * model" literally impossible, and the path of least resistance was exactly the
 * parallel cost model the standing constraint forbids (NPC_REDESIGN,
 * "same rules, no exemptions"; R2c is the warning — the sim's private copy of this
 * yard ladder had inherited the engine's own bug and so agreed with it *for the
 * wrong reason*, hiding a live economy defect for months).
 *
 * IT IS DELIBERATELY STRUCTURAL, NOT AN ADAPTER. `PlayerState` satisfies it as-is
 * (`ship`, `credits`, and a `registry` that carries a `renownRank` among its other
 * fields) and so does `NpcState` (the same three, from save v12 on). So both
 * captains are passed to the SAME functions with no wrapper object on either side —
 * which matters for more than tidiness: `applyShipyardMutation` DEBITS
 * `actor.credits`, and a wrapper would have made that debit land on a copy.
 *
 * `registry` IS REQUIRED — N11 CHANGED THAT, AND WHAT IT REPLACED IS THE POINT. It
 * used to be optional, and the comment here argued that its absence was "a rule, not
 * a gap": an NPC held no Renown, so `actorRankIndex` returned −1, and every
 * rank-gated purchase was refused. The 2026-07-29 audit named that for what it
 * actually was — a gate the actor could never open, which the track's standing
 * constraint defines as an exemption, because the player can EARN the key and the
 * captain could not. N11 gives every captain a real registry fed by their real
 * actions (`NpcState.registry`), so the captain now ranks on the standing they
 * EARNED and the rung they clear is the same rung the player clears. Making the field
 * required is what removes the −1 branch entirely: with no way to hold no registry,
 * the gate can no longer be quietly unopenable.
 */
export interface ShipyardActor {
  ship: ShipState;
  credits: number;
  registry: { renownRank: RenownRankId };
}

/** Where the actor stands on the Renown ladder. ONE expression for both captains
 *  since N11 — there is no longer a "holds no Renown" case to special-case, so the
 *  gate in {@link specialEquipmentFailure} compares earned standing against the
 *  content requirement and nothing else.
 *
 *  EXPORTED (T-021) so the removal of the −1 case is ASSERTABLE rather than inferred:
 *  a −1 and a 0 produce the identical `INSUFFICIENT_RENOWN` refusal from a quote, so
 *  a test reading the outcome cannot tell the dead end from a real bottom rung — which
 *  is precisely how the lockout stayed invisible. `shipyard.test.ts` pins that a
 *  captain's index is >= 0 and equals `renownRankIndex(actor.registry.renownRank)`. */
export function actorRankIndex(actor: ShipyardActor): number {
  return renownRankIndex(actor.registry.renownRank);
}

/**
 * What the yard allows against the fit being traded in.
 *
 * TWO SCALES, which is the whole point — see `YARD_COMPONENT_TRADE_IN` (content)
 * for the measured bug this split fixes:
 *   - **Junker sub-tier range, strengths 1..9.** A component the yard has never
 *     touched. Indexed by strength, exactly as before, so every junker-start
 *     component (hull, weapons, shields, cabin) is priced byte-identically to
 *     the pre-fix behavior.
 *   - **Bought range, strength >= 10.** `applyShipyardMutation` sets
 *     `strength = tier * 10`, so the OWNED TIER is `floor(strength / 10)` and the
 *     ladder is indexed by that. Previously this range fell through to a flat
 *     3,000 catch-all, which exceeded the list price of tiers 1-7 and made them
 *     free — on a fresh save the four components that start at strength 10
 *     (drives, navigation, lifeSupport, robotics) could all be taken to tier 7
 *     for 0 credits.
 *
 * Clamped at tier 9 so a titanium-boosted hull (strength + 10, up to 100) cannot
 * index past the end of the ladder.
 */
function tradeInValue(strength: number): number {
  if (strength < 1) return 0;
  if (strength < 10) return YARD_COMPONENT_TRADE_IN[strength - 1];
  const ownedTier = Math.min(9, Math.floor(strength / 10));
  return YARD_COMPONENT_TRADE_IN[ownedTier - 1];
}

function componentTierCost(ship: ShipState, component: ShipComponentId, tier: number): number {
  const price = YARD_COMPONENT_TIER_PRICES[tier - 1];
  if (price === undefined) {
    throw new Error('Invalid shipyard component tier');
  }

  const current = ship[component];
  let tradeStrength = current.strength;
  if (component === 'hull' && ship.hasTitaniumHull && tradeStrength > 9) {
    tradeStrength -= 10;
  }

  return Math.max(0, price - tradeInValue(tradeStrength));
}

function rebuildFee(condition: number): number {
  return condition === 0 ? 2000 : 0;
}

function repairCost(ship: ShipState, component: ShipComponentId, mode: 'all' | 'single'): number {
  const current = ship[component];
  if (mode === 'single') {
    return current.strength + rebuildFee(current.condition);
  }
  return (9 - current.condition) * current.strength + rebuildFee(current.condition);
}

function repairAllCost(ship: ShipState): number {
  let cost = 100;
  for (const component of COMPONENT_IDS) {
    const current = ship[component];
    if (current.condition < 9) {
      cost += repairCost(ship, component, 'all');
    }
  }
  return cost;
}

/**
 * T-1401 · Inverse of the shipyard's tier→strength mapping. `applyShipyardMutation`
 * (buy-component-tier) sets `strength = tier * 10`, so a bought component sits at an
 * exact multiple of 10 and `floor(strength / 10)` recovers its CURRENT owned tier:
 * 0 for a junker (starting strength 1–9), 1 at strength 10, … 9 at strength 90.
 * `Math.max(0, …)` guards a stripped hull (strength 0).
 *
 * WHY floor and 0-based (the bug this fixes): the UI (format.ts `shipComponents`,
 * ~L623, the T-1402 consumer) invented `Math.max(1, Math.ceil(strength / 10))` as
 * the inverse — which maps a junker (strength 1) to tier 1, so its computed
 * `nextTier` was 2 and TIER 1 WAS UNBUYABLE. floor maps a junker to tier 0, so
 * `nextTier = tier + 1 = 1` is buyable, and every bought multiple-of-10 strength
 * still round-trips exactly (10→1, 90→9). READER: T-1402's `shipComponents` /
 * buy-tier affordance, which replaces the `ceil` inverse with this function.
 */
export function componentTierForStrength(strength: number): number {
  return Math.max(0, Math.floor(strength / 10));
}

/**
 * T-1402 · PRD-over-foundation divergence (commented at the definition site).
 * Foundation `SP.YARD.S:213` computes hold capacity as `hx = h1; if (h1 > 9) hx =
 * h1 - 10`, which parks a strength-10 hull at `hx = 0` → `(cond+1)*0 = 0` pods.
 * The original game reached strength 10 only TRANSIENTLY (hulls grew +1 at a time,
 * so strength 10 was a fleeting waypoint on the climb past it). The Rimward
 * tier-jump model (`applyShipyardMutation` sets `strength = tier * 10`) instead
 * PARKS a tier-1 hull exactly on strength 10 — the foundation zero point — making
 * a bought tier-1 hull yield 0 pods, strictly worse than the junker's 10. That is
 * the tier-1-hull→0-pods trap. Shifting the boundary from `> 9` to `> 10` gives a
 * tier-1 hull (strength 10) a real capacity of 10 (`(0+1... )` → `hx = 10`,
 * `(cond+1)*10`) while leaving every pinned balance value untouched: junker str1
 * → hx1 (10 pods), tier-2 str20 → hx10, tier-3 str30 → hx20, ASTRAXIAL str29 →
 * hx19, TITANIUM str1 → hx1+5. Only strength 10 (the fix) and the unreachable
 * 11–19 band move. READERS: the `buy-cargo-pods` capacity cap (below),
 * `ShipPreview.maxCargoPods`, and UI `format.ts` `shipComponents`.
 *
 * N2 · Takes the SHIP, not the state. It never needed anything else, and an NPC's
 * pod ceiling has to come from this same rule — `npc.ts` `npcHullStrength` reads it
 * to seed a hull that licenses the captain's pods instead of guessing one.
 */
export function maxCargoPodsForShip(ship: ShipState): number {
  let hullCapacity = ship.hull.strength;
  if (hullCapacity > 10) {
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

function specialEquipmentCost(ship: ShipState, equipment: SpecialEquipmentId): number {
  if (equipment === 'CLOAKER') return 500;
  if (equipment === 'AUTO_REPAIR')
    return Math.min(ship.hull.strength * 1000, HULL_SCALED_EQUIPMENT_PRICE_CAP);
  if (equipment === 'ASTRAXIAL_HULL') return 100000;
  if (equipment === 'TITANIUM_HULL')
    return Math.min(ship.hull.strength * 1000, HULL_SCALED_EQUIPMENT_PRICE_CAP);
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
  actor: ShipyardActor,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
  cost: number,
): ShipyardFail | null {
  if (actor.credits >= cost) return null;
  return fail(action, {
    reason: 'INSUFFICIENT_CREDITS',
    cost,
    credits: actor.credits,
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

function installSpecialEquipment(ship: ShipState, equipment: SpecialEquipmentId): void {
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

function specialEquipmentFailure(
  actor: ShipyardActor,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
  equipment: SpecialEquipmentId,
): ShipyardFail | null {
  const ship = actor.ship;

  // T-1601c: the fitted-equipment mapping this guard used to keep private now
  // lives in components.ts `hasSpecialEquipment`, shared with the dice
  // extensibility point so the purchase guard and the dawn-hand equipment leg can
  // never disagree about what "fitted" means.
  if (hasSpecialEquipment(ship, equipment)) {
    return fail(action, { reason: 'ALREADY_INSTALLED' });
  }

  // T-105 acceptance requires mutual exclusions to emit typed fail events.
  // Foundation strips conflicting equipment and proceeds for some purchases;
  // v1 keeps these installs atomic so headless callers can show a clear choice.
  // Verified divergence (f2f95fa9:foundation/rules/upgrades.ts,
  // purchaseSpecialEquipment): foundation strip-and-proceeds when the NEW
  // purchase displaces the old — AUTO_REPAIR strips Titanium (~L768-776),
  // TITANIUM_HULL strips Auto-Repair (~L778-783), ARCH_ANGEL/STAR_BUSTER strip
  // the Cloaker (~L790-793) — and never gates CLOAKER against an installed
  // STAR_BUSTER. It already hard-fails the reverse direction (CLOAKER over
  // AUTO_REPAIR ~L686-688 / ARCH_ANGEL ~L691-693; AUTO_REPAIR over CLOAKER
  // ~L701-703), which v1 matches.
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
  if (requiredRank && actorRankIndex(actor) < renownRankIndex(requiredRank)) {
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
  actor: ShipyardActor,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
): number {
  if (action.action === 'buy-component-tier') {
    const { component, tier } = validateTierPurchase(action);
    return componentTierCost(actor.ship, component, tier);
  }
  if (action.action === 'repair') {
    const { component, repairMode } = validateRepair(action);
    return component ? repairCost(actor.ship, component, repairMode) : repairAllCost(actor.ship);
  }
  if (action.action === 'buy-cargo-pods') {
    return validateCargoPods(action) * 10;
  }
  return specialEquipmentCost(actor.ship, validateSpecialEquipment(action));
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
  actor: ShipyardActor,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
): ShipyardFail | null {
  const ship = actor.ship;

  if (action.action === 'buy-component-tier') {
    const { component, tier } = validateTierPurchase(action);
    return ensureCredits(actor, action, componentTierCost(ship, component, tier));
  }

  if (action.action === 'repair') {
    const { component, repairMode } = validateRepair(action);
    if (component) {
      if (ship[component].condition >= 9) {
        return fail(action, { reason: 'AT_MAX_CONDITION' });
      }
      return ensureCredits(actor, action, repairCost(ship, component, repairMode));
    }
    return ensureCredits(actor, action, repairAllCost(ship));
  }

  if (action.action === 'buy-cargo-pods') {
    const quantity = validateCargoPods(action);
    if (ship.hull.strength < 1) {
      return fail(action, { reason: 'NO_HULL' });
    }
    const maxPods = maxCargoPodsForShip(ship);
    if (ship.cargoPods + quantity > maxPods) {
      return fail(action, { reason: 'CAPACITY_EXCEEDED', maxPods });
    }
    return ensureCredits(actor, action, quantity * 10);
  }

  const equipment = validateSpecialEquipment(action);
  const equipmentFailure = specialEquipmentFailure(actor, action, equipment);
  if (equipmentFailure) return equipmentFailure;
  return ensureCredits(actor, action, specialEquipmentCost(ship, equipment));
}

/**
 * Apply the pure state mutation of a shipyard purchase, ASSUMING it has already
 * passed `shipyardFailure` (caller's responsibility). Mutates the ACTOR in place —
 * `resolveShipyard` runs it on its clone's player, `quoteShipyard` runs it on a
 * throwaway copy to project the "after", and `npc.ts` runs it on the captain's own
 * private turn copy. No die, no events, no validation.
 *
 * IT DOES NOT SYNC `maxFuel`. That is the caller's chokepoint, deliberately and
 * unchanged from before this took an actor: `day.ts` calls `syncMaxFuel` once at
 * the end of `applyPlayerAction` so every hull-touching action propagates to the
 * tank in one place, and several unit tests build a ship with a hand-set `maxFuel`
 * and call the resolvers directly. The NPC turn honours the same contract by
 * calling `syncMaxFuel` at its own end of day.
 */
export function applyShipyardMutation(
  actor: ShipyardActor,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
): void {
  const ship = actor.ship;

  if (action.action === 'buy-component-tier') {
    const { component, tier } = validateTierPurchase(action);
    actor.credits -= componentTierCost(ship, component, tier);
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
      actor.credits -= repairCost(ship, component, repairMode);
      // T-1205 robotics → repair rate: a single repair restores `repairRate`
      // condition, not a flat +1. Junker robotics (score 10) restores 1
      // (unchanged); upgraded robotics restores more per action. READER OF
      // `robotics`: this line (via components.ts repairRate).
      current.condition =
        repairMode === 'single' ? Math.min(9, current.condition + repairRate(ship)) : 9;
      return;
    }
    actor.credits -= repairAllCost(ship);
    for (const repairComponent of COMPONENT_IDS) {
      ship[repairComponent].condition = 9;
    }
    return;
  }

  if (action.action === 'buy-cargo-pods') {
    const quantity = validateCargoPods(action);
    actor.credits -= quantity * 10;
    ship.cargoPods += quantity;
    return;
  }

  const equipment = validateSpecialEquipment(action);
  actor.credits -= specialEquipmentCost(ship, equipment);
  installSpecialEquipment(ship, equipment);
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

  // N2 · The player is one ShipyardActor among two; `PlayerState` satisfies the
  // interface as-is, so this is the same object the rules already read — no
  // wrapper, which is what keeps `applyShipyardMutation`'s credit debit landing
  // on the real purse.
  const failure = shipyardFailure(nextState.player, action);
  if (failure) {
    events.push(failure);
    return { state: nextState, events };
  }

  // Cost is snapshot BEFORE mutation (trade-in / hull-scaled prices read current
  // strength); the mutation recomputes it against the same pre-mutation state.
  const cost = shipyardCost(nextState.player, action);
  applyShipyardMutation(nextState.player, action);
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
  /** T-1205 cabin → crew capacity: berths the cabin provides, shown in the ship
   *  pane so a cabin upgrade reads as a concrete before→after number. The T-1306
   *  socket for real crew rules consumes the same `crewCapacity` reader. */
  crewCapacity: number;
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
  ship: ShipState,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
): ShipPreview {
  const preview: ShipPreview = {
    cargoPods: ship.cargoPods,
    maxCargoPods: maxCargoPodsForShip(ship),
    fuel: ship.fuel,
    maxFuel: ship.maxFuel,
    fuelPerJump: jumpFuelCost(
      ship.drives,
      REF_JUMP_DISTANCE,
      ship.hasTransWarpDrive ?? false,
      navFuelFactor(ship), // T-1605: nav prices the jump, so the preview must say so
    ),
    maxJumpDistance: maxJumpDistance(ship.drives, ship.fuel, ship.hasTransWarpDrive ?? false),
    crewCapacity: crewCapacity(ship),
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
  actor: ShipyardActor,
  action: Extract<PlayerAction, { type: 'Shipyard' }>,
): ShipyardQuote {
  validateShipyardShape(action);
  const cost = shipyardCost(actor, action);
  const failure = shipyardFailure(actor, action);
  const ok = failure === null;
  const before = shipPreview(actor.ship, action);
  let after = before;
  if (ok) {
    // N2 · The throwaway is now the ACTOR, not the whole `GameState`. Nothing
    // outside `{ ship, credits }` is either mutated by `applyShipyardMutation` or
    // read by `shipPreview`, so this projects exactly what the old `cloneState`
    // did — for the cost of one ship instead of one world, which is what makes
    // quoting 30 captains a day affordable.
    const projected: ShipyardActor = {
      ship: structuredClone(actor.ship),
      credits: actor.credits,
      registry: actor.registry,
    };
    applyShipyardMutation(projected, action);
    after = shipPreview(projected.ship, action);
  }
  return { ok, cost, failure, before, after };
}
