import { CargoContract, ShipState } from './types.js';
import { SeededRng } from './rng.js';

/**
 * Generates the daily manifest board of 4 contracts.
 * Matches original logic: random cargo type (1-9), random destination (not current system).
 * Payment scales with distance, cargo type value, and serviceable cargo pods.
 */
export function generateManifestBoard(
  originSystem: number,
  rng: SeededRng,
  shipState: ShipState,
): CargoContract[] {
  const board: CargoContract[] = [];

  for (let i = 0; i < 4; i++) {
    // Cargo type 1-9
    const cargoType = Math.floor(rng.next() * 9) + 1;

    // Destination 1-14, excluding origin
    let destination = Math.floor(rng.next() * 14) + 1;
    if (destination === originSystem) {
      if (originSystem < 14) destination += 1;
      else destination -= 1;
    }

    // Distance = |origin - destination|
    const distance = Math.max(1, Math.abs(destination - originSystem));

    // Serviceable pods = cargoPods * (hullCondition + 1) / 10
    const cargoPods = shipState.cargoPods;
    const hullCondition = shipState.hull.condition;
    let upodX: number = 1;
    if (cargoPods >= 1 && hullCondition >= 1) {
      const y = hullCondition + 1;
      let rawX = cargoPods * y;
      if (rawX < 10) rawX = 10;
      upodX = Math.floor(rawX / 10);
    }

    // Fuel required for calculation
    const driveStrength = shipState.drives.strength;
    const driveCondition = shipState.drives.condition;
    const af = Math.min(driveStrength, 21);
    let f2 = 21 - af + (10 - driveCondition);
    if (f2 < 1) f2 = 1;
    f2 = f2 * distance;
    const ty = f2 + 10;
    const fuelRequired = Math.floor(Math.min(ty, 100) / 2);

    // Payment formula
    const valuePerPod = cargoType * 3;
    let payment = valuePerPod * distance;
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

    board.push({
      destination,
      cargoType,
      payment,
      pods: upodX,
    });
  }

  return board;
}
