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

// ── Dueling ─────────────────────────────────────────────────────────────────

export const duelChallengeBody = z.object({
  targetId: z.number().int().optional(),
  stakesType: z.string().min(1),
  stakesAmount: z.number().int().min(0),
  arenaType: z.number().int().min(1).max(6),
});
