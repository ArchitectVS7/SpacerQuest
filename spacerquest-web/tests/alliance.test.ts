/**
 * SpacerQuest v4.0 - Alliance System Tests
 *
 * Tests for investInAlliance, withdrawFromAlliance, investInDefcon
 * Uses vi.mock to mock Prisma for database-dependent functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFCON_MAX } from '../src/game/constants';
import { subtractCredits, addCredits } from '../src/game/utils';
import { calculateDefconCostPerLevel } from '../src/game/systems/alliance';

// ============================================================================
// PURE LOGIC TESTS (no DB dependency)
// ============================================================================

describe('Alliance system - pure logic', () => {
  describe('DEFCON cost calculation (SP.VEST.S lines 83, 85)', () => {
    // Original: j=1 if o7<=9, j=2 if o7>9. Cost per level = j * 10 * 10,000 cr.
    // Tier 1 (currentDefcon <= 9): 100,000 cr per level (j=1).
    // Tier 2 (currentDefcon > 9): 200,000 cr per level (j=2).
    it('returns 100,000 cr per level when current DEFCON is 0 (tier 1)', () => {
      expect(calculateDefconCostPerLevel(0)).toBe(100000);
    });
    it('returns 100,000 cr per level when current DEFCON is 9 (tier 1 boundary)', () => {
      expect(calculateDefconCostPerLevel(9)).toBe(100000);
    });
    it('returns 200,000 cr per level when current DEFCON is 10 (tier 2)', () => {
      expect(calculateDefconCostPerLevel(10)).toBe(200000);
    });
    it('returns 200,000 cr per level when current DEFCON is 19 (tier 2)', () => {
      expect(calculateDefconCostPerLevel(19)).toBe(200000);
    });
    it('DEFCON_MAX is 20', () => {
      expect(DEFCON_MAX).toBe(20);
    });
  });

  describe('Alliance investment credit normalization (SP.SAVE lines 113-114)', () => {
    // Original SP.SAVE: o4=o4+ia:o3=o3+ib then invfix normalizes at 10,000 boundary.
    // Modern equivalent: addCredits(membership.creditsHigh, membership.creditsLow, amount)
    // The split unit is 10,000 (same as player g1/g2), NOT 100,000.

    it('normalizes invested credits using 10,000-unit split with carry', () => {
      // 15,000 cr invested into empty account → high=1, low=5000
      const result = addCredits(0, 0, 15000);
      expect(result.high).toBe(1);
      expect(result.low).toBe(5000);
      // Total balance returned = high * 10000 + low = 15000
      expect(result.high * 10000 + result.low).toBe(15000);
    });

    it('handles zero investment correctly', () => {
      const result = addCredits(0, 0, 0);
      expect(result.high).toBe(0);
      expect(result.low).toBe(0);
    });

    it('handles investment with existing balance and carry at 10,000 boundary', () => {
      // Existing: 2 high (20,000 cr), 5000 low — total 25,000 cr.
      // Invest 15,000 more → total 40,000 cr → high=4, low=0
      const result = addCredits(2, 5000, 15000);
      expect(result.high).toBe(4);
      expect(result.low).toBe(0);
      expect(result.high * 10000 + result.low).toBe(40000);
    });

    it('returns correct newBalance using 10,000-unit multiplier', () => {
      // Verify the balance formula: newBalance = high * 10000 + low
      const result = addCredits(3, 7500, 5000);
      // 30000 + 7500 + 5000 = 42500 → high=4, low=2500
      expect(result.high).toBe(4);
      expect(result.low).toBe(2500);
      expect(result.high * 10000 + result.low).toBe(42500);
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

    it('succeeds with valid investment and returns correct balance (10,000-unit split)', async () => {
      // SP.SAVE lines 113-114: o4=o4+ia:o3=o3+ib
      // Starting membership balance: high=0, low=0. Invest 5000 cr.
      // Result: high=0, low=5000 → newBalance = 0 * 10000 + 5000 = 5000
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

    it('correctly carries at 10,000 boundary (not 100,000)', async () => {
      // Investing 15,000 into a balance of high=0, low=0.
      // With correct 10,000-unit split: result should be high=1, low=5000 → newBalance=15000.
      // Old buggy code (100,000 divisor): result would be high=0, low=15000 → newBalance=15000.
      // To catch the bug we need an existing balance that causes a carry at 10,000.
      // Existing: high=0, low=8000. Invest 5000 → total=13000 → high=1, low=3000 → newBalance=13000
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 2, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({
        id: 'mem-1',
        characterId: 'char-1',
        alliance: 'ASTRO_LEAGUE',
        creditsHigh: 0,
        creditsLow: 8000,
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await investInAlliance('char-1', 5000);
      expect(result.success).toBe(true);
      // Correct: 8000 + 5000 = 13000 → high=1, low=3000 → newBalance = 13000
      expect(result.newBalance).toBe(13000);
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

    // SP.VEST.S line 219: system range 1-14 only
    it('returns error for system 0 (out of range)', async () => {
      const result = await investInDefcon('char-1', 0, 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe('System must be 1–14');
    });

    it('returns error for system 15 (out of range)', async () => {
      const result = await investInDefcon('char-1', 15, 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe('System must be 1–14');
    });

    it('returns error for system 28 (out of range, original max was 14)', async () => {
      const result = await investInDefcon('char-1', 28, 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe('System must be 1–14');
    });

    // SP.VEST.S line 82: maximum DEFCON is 20
    it('returns error when system is already at DEFCON max (20)', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 100, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({
        alliance: 'ASTRO_LEAGUE',
      });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 20, // already at max
      });

      const result = await investInDefcon('char-1', 5, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum DEFCON');
    });

    // SP.VEST.S lines 83, 85: tier-based cost — tier 1 (<=9) = 100k, tier 2 (>9) = 200k
    it('uses tier-1 cost (100,000 cr/level) when system DEFCON is 0 (new system)', async () => {
      // 2 levels at 100,000 each = 200,000 cr. Character has 200,000 cr exactly.
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 20, creditsLow: 0 }); // 20 * 10000 = 200,000
      prisma.allianceMembership.findUnique.mockResolvedValue({ alliance: 'ASTRO_LEAGUE' });
      prisma.allianceSystem.findUnique.mockResolvedValue(null);
      prisma.allianceSystem.create.mockResolvedValue({
        systemId: 3,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 3, // 1 + 2
      });
      prisma.character.update.mockResolvedValue(undefined);

      const result = await investInDefcon('char-1', 3, 2);
      expect(result.success).toBe(true);
      // creditsHigh=20, low=0 minus 200,000 = 0
      expect(prisma.character.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ creditsHigh: 0, creditsLow: 0 }),
        })
      );
    });

    it('uses tier-2 cost (200,000 cr/level) when system DEFCON is 10', async () => {
      // 1 level at 200,000 cr. Character has 200,000 cr.
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 20, creditsLow: 0 }); // 200,000 cr
      prisma.allianceMembership.findUnique.mockResolvedValue({ alliance: 'ASTRO_LEAGUE' });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 3,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 10, // tier 2
      });
      prisma.allianceSystem.update.mockResolvedValue({
        systemId: 3,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 11,
      });
      prisma.character.update.mockResolvedValue(undefined);

      const result = await investInDefcon('char-1', 3, 1);
      expect(result.success).toBe(true);
      expect(prisma.character.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ creditsHigh: 0, creditsLow: 0 }),
        })
      );
    });

    it('fails tier-2 DEFCON with only tier-1 amount (100k not enough for 200k tier)', async () => {
      // 1 level at 200,000 cr needed, but character only has 100,000 cr
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 10, creditsLow: 0 }); // 100,000 cr
      prisma.allianceMembership.findUnique.mockResolvedValue({ alliance: 'ASTRO_LEAGUE' });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 3,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 10, // tier 2 costs 200k
      });

      const result = await investInDefcon('char-1', 3, 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not enough credits for this DEFCON increase');
    });
  });
});
