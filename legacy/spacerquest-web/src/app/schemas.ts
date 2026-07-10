/**
 * SpacerQuest v4.0 - Zod Request Body Schemas
 *
 * Centralized input validation for all API routes.
 */

import { z } from 'zod';

// ── Auth ────────────────────────────────────────────────────────────────────

export const createCharacterBody = z.object({
  name: z.string().min(3).max(15),
  shipName: z.string().min(3).max(15),
});

// ── Navigation ──────────────────────────────────────────────────────────────

export const launchBody = z.object({
  destinationSystemId: z.number().int().min(1).max(28),
  cargoContract: z
    .object({
      pods: z.number().int().min(1),
      type: z.number().int().min(0),
      payment: z.number().int().min(0),
    })
    .optional(),
});

export const courseChangeBody = z.object({
  newSystemId: z.number().int().min(1).max(28),
});

// ── Combat ──────────────────────────────────────────────────────────────────

export const engageBody = z.object({
  attack: z.boolean(),
});

export const combatActionBody = z.object({
  action: z.enum(['FIRE', 'RETREAT', 'SURRENDER']),
  round: z.number().int().min(1).optional(),
  enemy: z.record(z.string(), z.unknown()).optional(),
});

// ── Economy ─────────────────────────────────────────────────────────────────

export const fuelBody = z.object({
  units: z.number().int().min(1),
});

// ── Fuel Depot (port owner) ─────────────────────────────────────────────────

export const depotSetPriceBody = z.object({
  price: z.number().int().min(0).max(50),
});

export const depotBuyBody = z.object({
  units: z.number().int().min(1),
});

export const depotTransferBody = z.object({
  units: z.number().int().min(1),
});

export const allianceInvestBody = z.object({
  amount: z.number().int().min(0).optional(),
  type: z.enum(['DEFCON', 'INVEST']).optional(),
  systemId: z.number().int().min(1).max(28).optional(),
  levels: z.number().int().min(1).max(10).optional(),
});

export const allianceWithdrawBody = z.object({
  amount: z.number().int().min(1),
});

export const wheelBody = z.object({
  betNumber: z.number().int().min(1).max(20),
  betAmount: z.number().int().min(1).max(1000),
  rolls: z.number().int().min(3).max(7),
});

export const dareBody = z.object({
  rounds: z.number().int().min(3).max(10),
  multiplier: z.number().int().min(1).max(3),
});

export const rescueBody = z.object({
  targetId: z.string().min(1),
});

// ── Character ───────────────────────────────────────────────────────────────

export const shipNameBody = z.object({
  shipName: z.string().min(3).max(15),
});

export const allianceBody = z.object({
  alliance: z.enum(['NONE', '+', '@', '&', '^']),
});

// ── Ship ────────────────────────────────────────────────────────────────────

export const upgradeBody = z.object({
  component: z.string().min(1),
  upgradeType: z.enum(['STRENGTH', 'CONDITION']),
});

export const repairBody = z.object({
  // SP.DAMAGE.S item 9: 'cargoPods' → free repair (no cost, no condition field)
  component: z.enum(['hull', 'drive', 'cabin', 'lifeSupport', 'weapon', 'navigation', 'robotics', 'shield', 'cargoPods']).optional(),
  mode: z.enum(['single', 'all']).optional().default('all'),
});

// ── Dueling ─────────────────────────────────────────────────────────────────

export const duelChallengeBody = z.object({
  targetId: z.number().int().optional(),
  stakesType: z.enum(['POINTS', 'CREDITS', 'COMPONENTS']),
  stakesAmount: z.number().int().min(0),
  arenaType: z.number().int().min(1).max(6),
});

// ── Admin ──────────────────────────────────────────────────────────────────

export const adminUpdateCharacterBody = z.object({
  name: z.string().min(3).max(15).optional(),
  shipName: z.string().min(3).max(15).optional(),
  creditsHigh: z.number().int().min(0).optional(),
  creditsLow: z.number().int().min(0).optional(),
  bankHigh: z.number().int().min(0).optional(),
  bankLow: z.number().int().min(0).optional(),
  rank: z.enum(['LIEUTENANT', 'COMMANDER', 'CAPTAIN', 'COMMODORE', 'ADMIRAL', 'TOP_DOG', 'GRAND_MUFTI', 'MEGA_HERO', 'GIGA_HERO']).optional(),
  score: z.number().int().min(0).optional(),
  currentSystem: z.number().int().min(1).max(28).optional(),
  tripsCompleted: z.number().int().min(0).optional(),
  battlesWon: z.number().int().min(0).optional(),
  battlesLost: z.number().int().min(0).optional(),
  cargoPods: z.number().int().min(0).optional(),
  isConqueror: z.boolean().optional(),
});

export const adminUpdateShipBody = z.object({
  hullStrength: z.number().int().min(0).optional(),
  hullCondition: z.number().int().min(0).optional(),
  driveStrength: z.number().int().min(0).optional(),
  driveCondition: z.number().int().min(0).optional(),
  cabinStrength: z.number().int().min(0).optional(),
  cabinCondition: z.number().int().min(0).optional(),
  lifeSupportStrength: z.number().int().min(0).optional(),
  lifeSupportCondition: z.number().int().min(0).optional(),
  weaponStrength: z.number().int().min(0).optional(),
  weaponCondition: z.number().int().min(0).optional(),
  navigationStrength: z.number().int().min(0).optional(),
  navigationCondition: z.number().int().min(0).optional(),
  roboticsStrength: z.number().int().min(0).optional(),
  roboticsCondition: z.number().int().min(0).optional(),
  shieldStrength: z.number().int().min(0).optional(),
  shieldCondition: z.number().int().min(0).optional(),
  fuel: z.number().int().min(0).optional(),
  cargoPods: z.number().int().min(0).optional(),
  maxCargoPods: z.number().int().min(0).optional(),
  hasCloaker: z.boolean().optional(),
  hasAutoRepair: z.boolean().optional(),
  hasStarBuster: z.boolean().optional(),
  hasArchAngel: z.boolean().optional(),
  isAstraxialHull: z.boolean().optional(),
  hasTitaniumHull: z.boolean().optional(),
  hasTransWarpDrive: z.boolean().optional(),
  hasShipGuard: z.boolean().optional(),
});

export const adminUpdateNpcBody = z.object({
  shipClass: z.string().min(1).optional(),
  commander: z.string().min(1).optional(),
  shipName: z.string().min(1).optional(),
  creditValue: z.number().int().min(0).optional(),
  fuelCapacity: z.number().int().min(0).optional(),
  weaponStrength: z.number().int().min(0).optional(),
  weaponCondition: z.number().int().min(0).optional(),
  shieldStrength: z.number().int().min(0).optional(),
  shieldCondition: z.number().int().min(0).optional(),
  hullCondition: z.number().int().min(0).optional(),
  lifeSupportCond: z.number().int().min(0).optional(),
  driveStrength: z.number().int().min(0).optional(),
  driveCondition: z.number().int().min(0).optional(),
  hullStrength: z.number().int().min(0).optional(),
});

export const adminCreateNpcBody = z.object({
  type: z.enum(['PIRATE', 'PATROL', 'RIM_PIRATE', 'BRIGAND', 'REPTILOID']),
  shipClass: z.string().min(1).max(30),
  commander: z.string().min(1).max(30),
  shipName: z.string().min(1).max(30),
  homeSystem: z.string().min(1).max(30),
  alliance: z.enum(['NONE', 'ASTRO_LEAGUE', 'SPACE_DRAGONS', 'WARLORD_CONFED', 'REBEL_ALLIANCE']).default('NONE'),
  creditValue: z.number().int().min(0),
  fuelCapacity: z.number().int().min(0),
  weaponStrength: z.number().int().min(0),
  weaponCondition: z.number().int().min(0),
  shieldStrength: z.number().int().min(0),
  shieldCondition: z.number().int().min(0),
  hullCondition: z.number().int().min(0),
  hullStrength: z.number().int().min(0),
  lifeSupportCond: z.number().int().min(0),
  driveStrength: z.number().int().min(0),
  driveCondition: z.number().int().min(0),
});

export const adminGameConfigBody = z.object({
  battleDifficulty: z.number().int().min(1).max(9).optional(),
  maxCombatRounds: z.number().int().min(1).max(15).optional(),
  pirateAttackThreshold: z.number().int().min(1).max(100).optional(),
  patrolAttackThreshold: z.number().int().min(1).max(100).optional(),
  attackRandomMin: z.number().int().min(1).max(9).optional(),
  attackRandomMax: z.number().int().min(1).max(9).optional(),
});
