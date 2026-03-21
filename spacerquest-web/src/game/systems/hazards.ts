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
 * Original from SP.WARP.S lines 328-338 (getime subroutine):
 *
 * Normal travel (mx=0):
 *   if tt=(ty/4) hh=1:return          ← hazard at 1/4
 *   if (tt=(ty/3)) and (mx<1) tp=1    ← encounter trigger at 1/3 (NOT hazard)
 *   if tt=(ty/2) hh=1:return          ← hazard at 1/2
 *
 * Mission travel (mx>0):
 *   if tt=(ty/3) hh=1:return          ← hazard at 1/3 (ONLY on missions)
 *   if tt=(ty/9) hh=1:return          ← hazard at 1/9
 *   if tt=(ty/8) hh=1:return          ← etc.
 *   if tt=(ty/7) hh=1:return
 *   if tt=(ty/6) hh=1:return
 *   if tt=(ty/5) hh=1:return
 *
 * NOTE: ty/3 is only a hazard trigger on missions. On normal trips it is the
 * encounter trigger (tp=1), not a hazard trigger (hh=1).
 *
 * @param elapsed - Current travel time counter (tt)
 * @param travelTime - Total travel time (ty)
 * @param onMission - Whether player is on a mission (mx>0)
 */
export function checkHazardTrigger(elapsed: number, travelTime: number, onMission: boolean = false): boolean {
  if (travelTime <= 0) return false;
  const quarterMark = Math.floor(travelTime / 4);
  const halfMark = Math.floor(travelTime / 2);

  // 1/4 mark — always a hazard trigger
  if (quarterMark > 0 && elapsed === quarterMark) return true;
  // 1/2 mark — always a hazard trigger
  if (halfMark > 0 && elapsed === halfMark) return true;

  // Mission-only hazard triggers (SP.WARP.S lines 332-338: if mx>0)
  if (onMission) {
    const thirdMark  = Math.floor(travelTime / 3);
    const ninthMark  = Math.floor(travelTime / 9);
    const eighthMark = Math.floor(travelTime / 8);
    const seventhMark = Math.floor(travelTime / 7);
    const sixthMark  = Math.floor(travelTime / 6);
    const fifthMark  = Math.floor(travelTime / 5);

    if (thirdMark  > 0 && elapsed === thirdMark)  return true;
    if (ninthMark  > 0 && elapsed === ninthMark)  return true;
    if (eighthMark > 0 && elapsed === eighthMark) return true;
    if (seventhMark > 0 && elapsed === seventhMark) return true;
    if (sixthMark  > 0 && elapsed === sixthMark)  return true;
    if (fifthMark  > 0 && elapsed === fifthMark)  return true;
  }

  return false;
}

// ============================================================================
// HAZARD GENERATION
// ============================================================================

/**
 * Generate a hazard event for the ship
 *
 * Original from SP.WARP.S lines 346-367 (haza/hazl subroutines):
 *
 *   With shields (p2>0):
 *     r=10:gosub rand:if x<>5 "All Clear!" (9/10 = 90% evade)
 *     Otherwise (x=5, 10% chance): shields drain -1 condition (l$=p1$, gosub hazl)
 *   Without shields (haz0):
 *     r=5:gosub rand → picks component x (1-5):
 *       x=1 → drives (d2)
 *       x=2 → robotics (r2)
 *       x=3 → navigation (n2)
 *       x=4 → weapons (w2)
 *       x=5 → hull (h2)
 *     If the chosen component's condition > 0: condition -1 (gosub hazl)
 *     If all conditions = 0: "All Clear!!!"
 */
export function generateHazard(ship: ShipComponents): HazardResult | null {
  // Pick a random hazard type (x=1-4 from r=4:gosub rand in hazl)
  const hazardIndex = Math.floor(Math.random() * HAZARD_TYPES.length);
  const hazardName = HAZARD_TYPES[hazardIndex].name;

  // With shields (p2>0): r=10:gosub rand → x=1-10, "All Clear" if x<>5 (90% evade)
  if (ship.shieldCondition > 0 && ship.shieldStrength > 0) {
    // Simulate r=10:gosub rand — random integer 1-10
    const roll = Math.floor(Math.random() * 10) + 1;
    if (roll !== 5) {
      // 9/10 = 90% "All Clear" — shields hold
      return {
        hazardName,
        component: 'none',
        action: 'Deflected by',
        newCondition: ship.shieldCondition,
        evaded: true,
      };
    }
    // x=5 (10% chance): shields drain -1 condition
    const newCondition = Math.max(0, ship.shieldCondition - 1);
    return {
      hazardName,
      component: 'shields',
      action: 'Drains',
      newCondition,
      evaded: false,
    };
  }

  // No shields (haz0): r=5:gosub rand — picks component x=1-5
  // Original lines 353-357: only damages if component condition > 0
  // If chosen component is at 0, falls through to "All Clear!!!" (line 358)
  const componentIndex = Math.floor(Math.random() * DAMAGEABLE_COMPONENTS.length);
  const component = DAMAGEABLE_COMPONENTS[componentIndex];

  const conditionKey = `${component === 'hull' ? 'hull' : component === 'drives' ? 'drive' : component === 'weapons' ? 'weapon' : component === 'navigation' ? 'navigation' : component === 'robotics' ? 'robotics' : component}Condition` as keyof ShipComponents;

  const currentCondition = ship[conditionKey] as number;

  // Original: "if (x=N) and (cond>0) gosub hazl" — skip damage if already at 0
  if (currentCondition <= 0) {
    // Component already destroyed — "All Clear!!!" (original line 358)
    return {
      hazardName,
      component: 'none',
      action: 'Deflected by',
      newCondition: 0,
      evaded: true,
    };
  }

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
