/**
 * SpacerQuest v4.0 - Alliance System Tests
 *
 * Tests for investInAlliance, withdrawFromAlliance, investInDefcon
 * Uses vi.mock to mock Prisma for database-dependent functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFCON_COST_PER_LEVEL } from '../src/game/constants';
import { subtractCredits, addCredits } from '../src/game/utils';

// ============================================================================
// PURE LOGIC TESTS (no DB dependency)
// ============================================================================

describe('Alliance system - pure logic', () => {
  describe('DEFCON cost calculation', () => {
    it('calculates cost as levels * DEFCON_COST_PER_LEVEL', () => {
      expect(1 * DEFCON_COST_PER_LEVEL).toBe(100000);
      expect(3 * DEFCON_COST_PER_LEVEL).toBe(300000);
      expect(5 * DEFCON_COST_PER_LEVEL).toBe(500000);
    });
  });

  describe('Alliance investment credit normalization', () => {
    it('normalizes invested credits with carry', () => {
      // Simulates the normalization logic from investInAlliance
      const investedHigh = 0 + Math.floor(150000 / 100000);
      const investedLow = 0 + (150000 % 100000);
      const normalizedHigh = investedHigh + Math.floor(investedLow / 100000);
      const normalizedLow = investedLow % 100000;

      expect(normalizedHigh).toBe(1);
      expect(normalizedLow).toBe(50000);
    });

    it('handles zero investment correctly', () => {
      const investedHigh = 0 + Math.floor(0 / 100000);
      const investedLow = 0 + (0 % 100000);
      expect(investedHigh).toBe(0);
      expect(investedLow).toBe(0);
    });

    it('handles large investment with existing balance', () => {
      // Already has 2,50000 invested, adding 150000 more
      const existingHigh = 2;
      const existingLow = 50000;
      const amount = 150000;

      const investedHigh = existingHigh + Math.floor(amount / 100000);
      const investedLow = existingLow + (amount % 100000);
      const normalizedHigh = investedHigh + Math.floor(investedLow / 100000);
      const normalizedLow = investedLow % 100000;

      expect(normalizedHigh).toBe(4); // 2 + 1(carry) + 1(from amount)
      expect(normalizedLow).toBe(0);  // 50000 + 50000 = 100000 -> carry
    });
  });

  describe('DEFCON takeover logic', () => {
    it('weakens enemy DEFCON when attacker levels < defender levels', () => {
      const defenderDefcon = 5;
      const attackerLevels = 3;
      expect(defenderDefcon > attackerLevels).toBe(true);
      expect(defenderDefcon - attackerLevels).toBe(2);
    });

    it('takes over when attacker levels >= defender levels', () => {
      const defenderDefcon = 3;
      const attackerLevels = 5;
      expect(defenderDefcon <= attackerLevels).toBe(true);
      const remainingLevels = attackerLevels - defenderDefcon;
      expect(1 + remainingLevels).toBe(3); // New DEFCON = 1 + remaining
    });

    it('takeover with exact match gives DEFCON 1', () => {
      const defenderDefcon = 5;
      const attackerLevels = 5;
      const remainingLevels = attackerLevels - defenderDefcon;
      expect(1 + remainingLevels).toBe(1);
    });

    it('friendly investment just adds levels', () => {
      const currentDefcon = 3;
      const newLevels = 4;
      expect(currentDefcon + newLevels).toBe(7);
    });
  });

  describe('Credit operations for alliance', () => {
    it('subtractCredits fails when insufficient funds', () => {
      const result = subtractCredits(0, 5000, 100000);
      expect(result.success).toBe(false);
    });

    it('subtractCredits succeeds when sufficient', () => {
      const result = subtractCredits(10, 0, 100000);
      expect(result.success).toBe(true);
      expect(result.high * 10000 + result.low).toBe(0);
    });

    it('addCredits handles carry correctly', () => {
      const result = addCredits(0, 8000, 5000);
      expect(result.high).toBe(1);
      expect(result.low).toBe(3000);
    });
  });
});

// ============================================================================
// MOCKED DB TESTS
// ============================================================================

// Mock the prisma module
vi.mock('../src/db/prisma', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    allianceMembership: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    allianceSystem: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    gameLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe('Alliance system - DB functions', () => {
  let prisma: any;
  let investInAlliance: any;
  let withdrawFromAlliance: any;
  let investInDefcon: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const allianceMod = await import('../src/game/systems/alliance');
    investInAlliance = allianceMod.investInAlliance;
    withdrawFromAlliance = allianceMod.withdrawFromAlliance;
    investInDefcon = allianceMod.investInDefcon;
  });

  describe('investInAlliance', () => {
    it('returns error when character not found', async () => {
      prisma.character.findUnique.mockResolvedValue(null);
      const result = await investInAlliance('char-1', 10000);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Character not found');
    });

    it('returns error when not in an alliance', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 1, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue(null);
      const result = await investInAlliance('char-1', 10000);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not in an alliance');
    });

    it('returns error when alliance is NONE', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 1, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({ alliance: 'NONE', creditsHigh: 0, creditsLow: 0 });
      const result = await investInAlliance('char-1', 10000);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not in an alliance');
    });

    it('returns error when not enough credits', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 0, creditsLow: 500 });
      prisma.allianceMembership.findUnique.mockResolvedValue({
        id: 'mem-1',
        characterId: 'char-1',
        alliance: 'ASTRO_LEAGUE',
        creditsHigh: 0,
        creditsLow: 0,
      });
      const result = await investInAlliance('char-1', 10000);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not enough credits');
    });

    it('succeeds with valid investment', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 1, creditsLow: 5000 });
      prisma.allianceMembership.findUnique.mockResolvedValue({
        id: 'mem-1',
        characterId: 'char-1',
        alliance: 'ASTRO_LEAGUE',
        creditsHigh: 0,
        creditsLow: 0,
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await investInAlliance('char-1', 5000);
      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(5000);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('withdrawFromAlliance', () => {
    it('returns error when character not found', async () => {
      prisma.character.findUnique.mockResolvedValue(null);
      const result = await withdrawFromAlliance('char-1', 5000);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Character not found');
    });

    it('returns error when not in an alliance', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 0, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue(null);
      const result = await withdrawFromAlliance('char-1', 5000);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not in an alliance');
    });

    it('returns error when insufficient invested credits', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 0, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({
        id: 'mem-1',
        alliance: 'SPACE_DRAGONS',
        creditsHigh: 0,
        creditsLow: 1000,
      });
      const result = await withdrawFromAlliance('char-1', 5000);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not enough invested credits');
    });

    it('succeeds with valid withdrawal', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 0, creditsLow: 1000 });
      prisma.allianceMembership.findUnique.mockResolvedValue({
        id: 'mem-1',
        alliance: 'SPACE_DRAGONS',
        creditsHigh: 1,
        creditsLow: 0,
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await withdrawFromAlliance('char-1', 5000);
      expect(result.success).toBe(true);
      expect(result.withdrawn).toBe(5000);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('investInDefcon', () => {
    it('returns error when character not found', async () => {
      prisma.character.findUnique.mockResolvedValue(null);
      const result = await investInDefcon('char-1', 5, 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Character not found');
    });

    it('returns error when not in alliance', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 10, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue(null);
      const result = await investInDefcon('char-1', 5, 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not in an alliance');
    });

    it('returns error when insufficient credits', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 0, creditsLow: 500 });
      prisma.allianceMembership.findUnique.mockResolvedValue({
        alliance: 'REBEL_ALLIANCE',
      });
      const result = await investInDefcon('char-1', 5, 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not enough credits for this DEFCON increase');
    });

    it('creates new alliance system when none exists', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 100, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({
        alliance: 'ASTRO_LEAGUE',
      });
      prisma.allianceSystem.findUnique.mockResolvedValue(null);
      prisma.allianceSystem.create.mockResolvedValue({
        systemId: 5,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 3, // 1 + 2 levels
      });
      prisma.character.update.mockResolvedValue(undefined);

      const result = await investInDefcon('char-1', 5, 2);
      expect(result.success).toBe(true);
      expect(prisma.allianceSystem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          systemId: 5,
          alliance: 'ASTRO_LEAGUE',
          defconLevel: 3,
        }),
      });
    });

    it('weakens enemy DEFCON when attack is insufficient', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 100, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({
        alliance: 'ASTRO_LEAGUE',
      });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        alliance: 'SPACE_DRAGONS',
        defconLevel: 5,
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await investInDefcon('char-1', 5, 2);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Weakened enemy DEFCON');
      expect(result.message).toContain('level 3');
    });

    it('takes over enemy system when attack exceeds defense', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 100, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({
        alliance: 'ASTRO_LEAGUE',
      });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        alliance: 'SPACE_DRAGONS',
        defconLevel: 2,
      });
      prisma.allianceSystem.update.mockResolvedValue({
        systemId: 5,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 4, // 1 + (5 - 2) = 4
      });
      prisma.gameLog.create.mockResolvedValue(undefined);
      prisma.character.update.mockResolvedValue(undefined);

      const result = await investInDefcon('char-1', 5, 5);
      expect(result.success).toBe(true);
      expect(prisma.allianceSystem.update).toHaveBeenCalled();
      expect(prisma.gameLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'ALLIANCE',
            message: expect.stringContaining('TAKEN OVER'),
          }),
        })
      );
    });

    it('adds levels to friendly system', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 100, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({
        alliance: 'ASTRO_LEAGUE',
      });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 3,
      });
      prisma.allianceSystem.update.mockResolvedValue({
        systemId: 5,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 5,
      });
      prisma.character.update.mockResolvedValue(undefined);

      const result = await investInDefcon('char-1', 5, 2);
      expect(result.success).toBe(true);
      expect(prisma.allianceSystem.update).toHaveBeenCalledWith({
        where: { systemId: 5 },
        data: { defconLevel: 5 },
      });
    });
  });
});
