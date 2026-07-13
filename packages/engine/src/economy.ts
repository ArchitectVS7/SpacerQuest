import {
  FUEL_DEFAULT_BUY_PRICE,
  RIM_FUEL_BUY_PRICE,
  STAR_SYSTEMS,
  distance as systemDistance,
} from '@spacerquest/content';
import { CargoContract, EraEventState, ShipState } from './types.js';
import { SeededRng } from './rng.js';
import { eraFuelPriceMultiplier, eraPaymentMultiplier } from './era.js';

/** A drive block, the only part of a ship the jump-cost math cares about. */
export interface DriveBlock {
  strength: number;
  condition: number;
}

/**
 * Fuel required for a jump — the ONE travel-cost function (T-106 binding
 * constraint 3): the player (actions/travel.ts), the manifest-board payment
 * math, and the NPC simulation all price jumps through here.
 *
 * T-1102 · Fuel scarcity overhaul (PRD-REIMAGINED §4 differentiator 3 — "fuel is
 * the plot" — and §7.1 "two jumps costs 240 units; you're carrying 300").
 * DIVERGENCE FROM FOUNDATION (ref f2f95fa9:foundation/rules/travel.ts
 * `calculateFuelCost`): foundation computed `floor(min(perUnit·dist + 10, 100)/2)`.
 * The `min(…,100)` cap flattened every jump of distance ≥ 8 to a constant 50 fuel
 * — which made fuel INERT, the exact defect this task fixes: distance stopped
 * mattering, so scarcity never bit. We drop the cap entirely (cost rises without
 * ceiling) AND the `+10`/`÷2` packaging (unnecessary once the cap is gone; it only
 * existed to keep the pre-cap number in the 0–50 band). Result: a strictly
 * per-distance cost, `perUnit × distance`. Starter drives (strength 10, condition
 * 9) → perUnit 12, so a two-jump route of distance 14 + 6 = 240 fuel against a 300
 * starter tank, exactly the §7.1 scenario.
 */
export function jumpFuelCost(
  drives: DriveBlock,
  routeDistance: number,
  hasTransWarp = false,
): number {
  const effectiveStrength = drives.strength + (hasTransWarp ? 10 : 0);
  const af = Math.min(effectiveStrength, 21);
  let perUnit = 21 - af + (10 - drives.condition);
  if (perUnit < 1) perUnit = 1;
  return perUnit * routeDistance;
}

/**
 * Maximum fuel a hull can hold — derived from the hull's strength and condition
 * so a fresh junker's tank and a fitted freighter's tank both fall out of the
 * ship, not a hardcoded constant. T-1102: this replaces the old flat
 * `maxFuel: 10000`.
 *
 * PORTED FROM FOUNDATION (ref f2f95fa9:foundation/rules/travel.ts
 * `calculateFuelCapacity`): `(condition + 1) × strength × MULT`.
 * DIVERGENCE: foundation used MULT = 10, which puts the fresh junker (strength 1,
 * condition 9) at only 100 fuel — below even a single starter jump under the new
 * per-distance cost. PRD §7.1 pins the fresh tank at ~300 ("you're carrying 300"),
 * so MULT = 30. Chosen over bumping the starter `hull.strength`, because
 * `hull.strength` is load-bearing elsewhere (cargo-pod serviceable-capacity in
 * economy `rollContract`, shipyard tier gates and equipment pricing), and moving
 * it would ripple through the economy and combat. The ×30 scales every hull
 * uniformly and keeps the hull-upgrade A/B monotonic: a stronger/healthier hull
 * always holds strictly more fuel.
 */
export const FUEL_CAPACITY_HULL_MULTIPLIER = 30;

export function calculateFuelCapacity(hullStrength: number, hullCondition: number): number {
  if (hullStrength < 1 || hullCondition < 1) return 0;
  return (hullCondition + 1) * hullStrength * FUEL_CAPACITY_HULL_MULTIPLIER;
}

/**
 * Recompute a ship's `maxFuel` from its (possibly just-changed) hull and clamp
 * the current fuel to the new ceiling. T-1102 single chokepoint: called once at
 * the end of `applyPlayerAction` (day.ts) so every player action that touched the
 * hull — shipyard upgrade, astraxial/cloaker fits, repairs, combat damage —
 * propagates to the tank, and again on load (`deserializeState`) as the
 * fuel-capacity save migration. Deliberately NOT invoked inside the low-level
 * resolvers: several unit tests build a ship with a manual `maxFuel` and call
 * resolvers directly, and that must stay honoured.
 */
export function syncMaxFuel(ship: ShipState): void {
  ship.maxFuel = calculateFuelCapacity(ship.hull.strength, ship.hull.condition);
  if (ship.fuel > ship.maxFuel) ship.fuel = ship.maxFuel;
}

/**
 * Largest integer jump distance (>=1) whose fuel cost the ship can currently
 * afford, or 0 if it cannot afford even a 1-unit jump. The starmap fuel-range
 * ring (T-304) is drawn at this radius; per-system reachability there also uses
 * `jumpFuelCost`, and the two agree because core/rim systems sit at integer
 * distances. `jumpFuelCost` is monotonic non-decreasing in distance, so the
 * first distance the ship cannot afford ends the reachable range.
 */
export function maxJumpDistance(
  drives: DriveBlock,
  fuel: number,
  hasTransWarp = false,
  maxSpan = 60,
): number {
  let best = 0;
  for (let d = 1; d <= maxSpan; d++) {
    if (jumpFuelCost(drives, d, hasTransWarp) <= fuel) best = d;
    else break; // monotonic — first unaffordable distance ends the range
  }
  return best;
}

/** Local depot fuel price from canon tables — shared by the player's market
 *  and NPC refueling (no free NPC economics). An active era event (e.g. a fuel
 *  crisis) can re-price the depot when the system is in scope (T-107). */
export function localFuelPrice(systemId: number, eraEvent: EraEventState | null = null): number {
  const system = STAR_SYSTEMS[systemId];
  let price: number;
  if (!system) price = FUEL_DEFAULT_BUY_PRICE;
  else if (system.isRim) price = RIM_FUEL_BUY_PRICE;
  else price = system.fuelBuyPrice ?? FUEL_DEFAULT_BUY_PRICE;
  return Math.round(price * eraFuelPriceMultiplier(eraEvent, systemId));
}

/** The parts of a ship the contract-payment math cares about. NPC hulls are
 *  abstracted to the same shape so their contract income scales exactly like
 *  the player's manifest payments. */
export interface ContractShipSpec {
  cargoPods: number;
  hullCondition: number;
  drives: DriveBlock;
}

export function contractSpecFromShip(ship: ShipState): ContractShipSpec {
  return {
    cargoPods: ship.cargoPods,
    hullCondition: ship.hull.condition,
    drives: { strength: ship.drives.strength, condition: ship.drives.condition },
  };
}

/**
 * Rolls a single cargo contract offer from a system's job pool.
 * Matches original logic: random cargo type (1-9), random destination (not
 * current system). Payment scales with distance, cargo type value, and
 * serviceable cargo pods.
 */
export function rollContract(
  originSystem: number,
  rng: SeededRng,
  spec: ContractShipSpec,
  eraEvent: EraEventState | null = null,
): CargoContract {
  // Cargo type 1-9
  const cargoType = Math.floor(rng.next() * 9) + 1;

  // Destination 1-14, excluding origin
  let destination = Math.floor(rng.next() * 14) + 1;
  if (destination === originSystem) {
    if (originSystem < 14) destination += 1;
    else destination -= 1;
  }

  const routeDistance = systemDistance(originSystem, destination);

  // Serviceable pods = cargoPods * (hullCondition + 1) / 10
  const cargoPods = spec.cargoPods;
  const hullCondition = spec.hullCondition;
  let upodX: number = 1;
  if (cargoPods >= 1 && hullCondition >= 1) {
    const y = hullCondition + 1;
    let rawX = cargoPods * y;
    if (rawX < 10) rawX = 10;
    upodX = Math.floor(rawX / 10);
  }

  // Fuel required for calculation — same math as the actual jump
  const fuelRequired = jumpFuelCost(spec.drives, routeDistance);

  // Payment formula
  const valuePerPod = cargoType * 3;
  let payment = valuePerPod * routeDistance;
  if (payment < 3) payment = 3;
  payment = Math.floor(payment / 3);
  payment = payment * upodX;
  payment = payment + fuelRequired * 5 + 1000;
  if (payment > 15000) payment = 15000;

  // T-107: an active era event re-prices the run. Applied AFTER the base cap so
  // "the economy fights back" — a plague can push medicine past the normal
  // ceiling — then re-normalized to a pod multiple below.
  const eraMultiplier = eraPaymentMultiplier(eraEvent, destination, cargoType);
  if (eraMultiplier !== 1) {
    payment = Math.floor(payment * eraMultiplier);
  }

  // Normalize to pod multiple
  if (cargoPods > 0) {
    const perPod = Math.floor(payment / cargoPods);
    payment = perPod * cargoPods;
  }

  return {
    destination,
    cargoType,
    payment,
    pods: upodX,
  };
}

/**
 * Generates the daily manifest board. Normally 4 contracts; T-106 contract
 * competition drains the pool — each board offer claimed by an NPC at the
 * previous dusk shrinks today's board by one (floor of 1 so a port never
 * goes completely dark).
 */
export function generateManifestBoard(
  originSystem: number,
  rng: SeededRng,
  shipState: ShipState,
  count = 4,
  eraEvent: EraEventState | null = null,
): CargoContract[] {
  const board: CargoContract[] = [];
  const spec = contractSpecFromShip(shipState);

  for (let i = 0; i < count; i++) {
    board.push(rollContract(originSystem, rng, spec, eraEvent));
  }

  return board;
}
