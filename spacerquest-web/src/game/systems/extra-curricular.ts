/**
 * SpacerQuest v4.0 - Extra-Curricular System (SP.END.txt lines 36-134, sp.menu11)
 *
 * Modes: Pirate, Star Patrol, Smuggler Patrol
 * Ship Guards: 10,000 cr hire cost; prevents vandalism on quit
 * Vandalism: without guard, random component damage on quit
 */

import { prisma } from '../../db/prisma.js';
import {
  SHIP_GUARD_COST,
} from '../constants.js';
import { getTotalCredits, subtractCredits } from '../utils.js';

export type ExtraCurricularMode = 'pirate' | 'star_patrol' | 'smuggler_patrol' | null;

/**
 * Set a character's extra-curricular mode and patrol sector.
 * Original SP.END.txt: pirate writes q4 (system id) to pirates file (line 91),
 * patrol writes q4 to sp.pat (line 188). Both void cargo contracts.
 *
 * @param patrolSector — target system 1-14, or null to clear
 */
export async function setMode(characterId: string, mode: ExtraCurricularMode, patrolSector: number | null = null) {
  // Original SP.END.txt line 96: q1=0:q2=0:q3=0:q4=0:q5=0:q6=0 — void cargo on mode set
  const data: Record<string, unknown> = {
    extraCurricularMode: mode,
    patrolSector: patrolSector,
  };
  if (mode) {
    // Void cargo contracts (original fcc3 warning + variable reset)
    data.cargoPods = 0;
    data.cargoType = 0;
    data.cargoPayment = 0;
    data.destination = 0;
    data.cargoManifest = null;
  }
  await prisma.character.update({
    where: { id: characterId },
    data,
  });
  return { success: true, mode, patrolSector };
}

/**
 * Hire a ship guard (SP.END.txt line 100: g1=g1-1 → 10,000 cr)
 */
export async function hireShipGuard(characterId: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });

  if (!character || !character.ship) {
    return { success: false, error: 'Character or ship not found' };
  }

  if (character.ship.hasShipGuard) {
    return { success: false, error: 'Ship guard already hired' };
  }

  const totalCredits = getTotalCredits(character.creditsHigh, character.creditsLow);
  if (totalCredits < SHIP_GUARD_COST) {
    return { success: false, error: 'Not enough credits (10,000 cr required)' };
  }

  const { high, low } = subtractCredits(character.creditsHigh, character.creditsLow, SHIP_GUARD_COST);

  await prisma.$transaction([
    prisma.ship.update({
      where: { id: character.ship.id },
      data: { hasShipGuard: true },
    }),
    prisma.character.update({
      where: { id: characterId },
      data: { creditsHigh: high, creditsLow: low },
    }),
  ]);

  return { success: true, cost: SHIP_GUARD_COST };
}

export interface VandalShipStats {
  cargoPods: number;
  hullCondition: number;
  cabinCondition: number;
  driveStrength: number;
  lifeSupportCondition: number;
  lifeSupportStrength: number;
}

export interface VandalDamage {
  vandalized: boolean;
  component?: string;
  damageDescription?: string;
  /** The Prisma field to update and its new value */
  field?: string;
  newValue?: number;
}

/**
 * Pure function: whether vandalism can happen at all.
 * Original SP.END.S vaca: if s2<2000 goto vat — no risk below 2000 score.
 */
export function isVandalismEligible(score: number): boolean {
  return score >= 2000;
}

/**
 * Pure function: determine vandalism damage from roll x (1-10) and ship stats.
 * Source: SP.END.txt lines 125-133 (vand subroutine)
 *   x < 4 and cargoPods > x*10   → cargoPods -= x*10   (Pods damaged)
 *   x = 4 and hullCondition > 3  → hullCondition -= 4   (Hull damaged)
 *   x = 5 and cabinCondition > 4 → cabinCondition -= 5  (Cabin damaged)
 *   x = 6 and driveStrength > 0  → driveStrength -= 1   (Drives damaged)
 *   x = 7 and lifeSupportCondition > 6 → lifeSupportStrength -= 7 (Life Support damaged)
 *   x = 8,9,10                   → no damage
 */
export function computeVandalDamage(x: number, ship: VandalShipStats): VandalDamage {
  if (x < 4 && ship.cargoPods > x * 10) {
    return { vandalized: true, component: 'Pods', damageDescription: `${x * 10} cargo pods stolen`, field: 'cargoPods', newValue: ship.cargoPods - x * 10 };
  }
  if (x === 4 && ship.hullCondition > 3) {
    return { vandalized: true, component: 'Hull', damageDescription: 'condition -4', field: 'hullCondition', newValue: Math.max(0, ship.hullCondition - 4) };
  }
  if (x === 5 && ship.cabinCondition > 4) {
    return { vandalized: true, component: 'Cabin', damageDescription: 'condition -5', field: 'cabinCondition', newValue: Math.max(0, ship.cabinCondition - 5) };
  }
  if (x === 6 && ship.driveStrength > 0) {
    return { vandalized: true, component: 'Drives', damageDescription: 'strength -1', field: 'driveStrength', newValue: Math.max(0, ship.driveStrength - 1) };
  }
  if (x === 7 && ship.lifeSupportCondition > 6) {
    return { vandalized: true, component: 'Life Support', damageDescription: 'strength -7', field: 'lifeSupportStrength', newValue: Math.max(0, ship.lifeSupportStrength - 7) };
  }
  // x=8,9,10 or conditions not met → no damage
  return { vandalized: false };
}

/**
 * Apply vandalism on quit if no ship guard (SP.END.txt lines 110-134)
 */
export async function applyVandalism(characterId: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true },
  });

  if (!character || !character.ship) {
    return { vandalized: false };
  }

  // Original SP.END.S vaca: if s2<2000 goto vat — no vandalism risk for low-score characters
  if (!isVandalismEligible(character.score)) {
    return { vandalized: false };
  }

  // Guard prevents vandalism and is consumed for the session
  if (character.ship.hasShipGuard) {
    await prisma.ship.update({
      where: { id: character.ship.id },
      data: { hasShipGuard: false },
    });
    return { vandalized: false, guardConsumed: true };
  }

  const ship = character.ship;
  const x = Math.floor(Math.random() * 10) + 1; // 1-10

  const damage = computeVandalDamage(x, ship);
  if (!damage.vandalized) {
    return { vandalized: false };
  }

  await prisma.ship.update({
    where: { id: ship.id },
    data: { [damage.field!]: damage.newValue! },
  });

  return {
    vandalized: true,
    component: damage.component,
    damageDescription: damage.damageDescription,
  };
}
