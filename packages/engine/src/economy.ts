import {
  FUEL_DEFAULT_BUY_PRICE,
  RIM_FUEL_BUY_PRICE,
  STAR_SYSTEMS,
  distance as systemDistance,
} from '@spacerquest/content';
import { CargoContract, ShipState } from './types.js';
import { SeededRng } from './rng.js';

/** A drive block, the only part of a ship the jump-cost math cares about. */
export interface DriveBlock {
  strength: number;
  condition: number;
}

/**
 * Fuel required for a jump — the ONE travel-cost function (T-106 binding
 * constraint 3): the player (actions/travel.ts), the manifest-board payment
 * math, and the NPC simulation all price jumps through here. Legacy math:
 * SP.TRAVEL.S af/f2/ty chain.
 */
export function jumpFuelCost(
  drives: DriveBlock,
  routeDistance: number,
  hasTransWarp = false,
): number {
  const effectiveStrength = drives.strength + (hasTransWarp ? 10 : 0);
  const af = Math.min(effectiveStrength, 21);
  let cost = 21 - af + (10 - drives.condition);
  if (cost < 1) cost = 1;
  cost = cost * routeDistance;
  const ty = cost + 10;
  return Math.floor(Math.min(ty, 100) / 2);
}

/** Local depot fuel price from canon tables — shared by the player's market
 *  and NPC refueling (no free NPC economics). */
export function localFuelPrice(systemId: number): number {
  const system = STAR_SYSTEMS[systemId];
  if (!system) return FUEL_DEFAULT_BUY_PRICE;
  if (system.isRim) return RIM_FUEL_BUY_PRICE;
  return system.fuelBuyPrice ?? FUEL_DEFAULT_BUY_PRICE;
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
): CargoContract[] {
  const board: CargoContract[] = [];
  const spec = contractSpecFromShip(shipState);

  for (let i = 0; i < count; i++) {
    board.push(rollContract(originSystem, rng, spec));
  }

  return board;
}
