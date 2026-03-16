/**
 * SpacerQuest v4.0 - Travel Hazard System
 *
 * Random hazards that occur during space travel
 * Ported from original SP.WARP.S lines 346-369
 *
 * Original mechanics:
 *   - Hazards trigger at 1/4 and 1/2 of travel time
 *   - With shields: 50% evade, otherwise shields drain -1 condition
 *   - Without shields: random component takes -1 condition damage
 *   - 4 hazard types: X-Rad Shower, Plasma-Ion Cloud, Proton Radiation, Micro-Asteroid
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ShipComponents {
  hullCondition: number;
  driveCondition: number;
  cabinCondition: number;
  lifeSupportCondition: number;
  weaponCondition: number;
  navigationCondition: number;
  roboticsCondition: number;
  shieldCondition: number;
  shieldStrength: number;
}

export interface HazardResult {
  hazardName: string;
  component: string;
  action: string; // "Damages" or "Drains"
  newCondition: number;
  evaded: boolean;
}

// ============================================================================
// HAZARD TYPES
// ============================================================================

/**
 * Original from SP.WARP.S lines 359-362:
 *   if x=1 print"X-Rad Shower"
 *   if x=2 print"Plasma-Ion Cloud"
 *   if x=3 print"Proton Radiation"
 *   if x=4 print"Micro-Asteroid"
 */
export const HAZARD_TYPES = [
  { name: 'X-Rad Shower' },
  { name: 'Plasma-Ion Cloud' },
  { name: 'Proton Radiation' },
  { name: 'Micro-Asteroid' },
] as const;

// Damageable components (original: drives, robotics, navigation, weapons, hull)
const DAMAGEABLE_COMPONENTS = [
  'drives',
  'robotics',
  'navigation',
  'weapons',
  'hull',
] as const;

// ============================================================================
// HAZARD TRIGGER CHECK
// ============================================================================

/**
 * Check if a hazard should trigger at this point in travel
 *
 * Original from SP.WARP.S lines 328-334:
 *   if tt=(ty/4) hh=1:return
 *   if tt=(ty/2) hh=1:return
 */
export function checkHazardTrigger(elapsed: number, travelTime: number): boolean {
  if (travelTime <= 0) return false;
  const quarterMark = Math.floor(travelTime / 4);
  const halfMark = Math.floor(travelTime / 2);

  if (quarterMark > 0 && elapsed === quarterMark) return true;
  if (halfMark > 0 && elapsed === halfMark) return true;
  return false;
}

// ============================================================================
// HAZARD GENERATION
// ============================================================================

/**
 * Generate a hazard event for the ship
 *
 * Original from SP.WARP.S lines 346-367:
 *   With shields (p2>0):
 *     50% chance "All Clear" (evade)
 *     50% chance shields drain -1 condition
 *   Without shields:
 *     Random component (1-5) takes -1 condition
 */
export function generateHazard(ship: ShipComponents): HazardResult | null {
  // Pick a random hazard type
  const hazardIndex = Math.floor(Math.random() * HAZARD_TYPES.length);
  const hazardName = HAZARD_TYPES[hazardIndex].name;

  // With shields: 50% chance to evade completely
  if (ship.shieldCondition > 0 && ship.shieldStrength > 0) {
    const evadeRoll = Math.random();
    if (evadeRoll < 0.5) {
      // All Clear - shields hold
      return {
        hazardName,
        component: 'none',
        action: 'Deflected by',
        newCondition: ship.shieldCondition,
        evaded: true,
      };
    }
    // Shields drain -1 condition
    const newCondition = Math.max(0, ship.shieldCondition - 1);
    return {
      hazardName,
      component: 'shields',
      action: 'Drains',
      newCondition,
      evaded: false,
    };
  }

  // No shields: random component takes damage
  // Original: r=5:gosub rand — picks 1-5 mapping to drives/robotics/nav/weapons/hull
  const componentIndex = Math.floor(Math.random() * DAMAGEABLE_COMPONENTS.length);
  const component = DAMAGEABLE_COMPONENTS[componentIndex];

  const conditionKey = `${component === 'hull' ? 'hull' : component === 'drives' ? 'drive' : component === 'weapons' ? 'weapon' : component === 'navigation' ? 'navigation' : component === 'robotics' ? 'robotics' : component}Condition` as keyof ShipComponents;

  const currentCondition = ship[conditionKey] as number;
  const newCondition = Math.max(0, currentCondition - 1);

  return {
    hazardName,
    component,
    action: 'Damages',
    newCondition,
    evaded: false,
  };
}

// ============================================================================
// APPLY HAZARD DAMAGE
// ============================================================================

/**
 * Apply hazard damage to ship components, returns updated components
 */
export function applyHazardDamage(
  ship: ShipComponents,
  component: string,
  damage: number
): ShipComponents {
  const updated = { ...ship };

  switch (component) {
    case 'hull':
      updated.hullCondition = Math.max(0, updated.hullCondition - damage);
      break;
    case 'drives':
      updated.driveCondition = Math.max(0, updated.driveCondition - damage);
      break;
    case 'cabin':
      updated.cabinCondition = Math.max(0, updated.cabinCondition - damage);
      break;
    case 'lifesupport':
      updated.lifeSupportCondition = Math.max(0, updated.lifeSupportCondition - damage);
      break;
    case 'weapons':
      updated.weaponCondition = Math.max(0, updated.weaponCondition - damage);
      break;
    case 'navigation':
      updated.navigationCondition = Math.max(0, updated.navigationCondition - damage);
      break;
    case 'robotics':
      updated.roboticsCondition = Math.max(0, updated.roboticsCondition - damage);
      break;
    case 'shields':
      updated.shieldCondition = Math.max(0, updated.shieldCondition - damage);
      break;
  }

  return updated;
}
