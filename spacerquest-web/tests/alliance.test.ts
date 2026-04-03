/**
 * SpacerQuest v4.0 - Alliance System Tests
 *
 * Tests for investInAlliance, withdrawFromAlliance, investInDefcon
 * Uses vi.mock to mock Prisma for database-dependent functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DEFCON_MAX } from '../src/game/constants';
import { subtractCredits, addCredits } from '../src/game/utils';
import { calculateDefconCostPerLevel, calculateTakeoverCost, getDefconTier } from '../src/game/systems/alliance';
import { ALLIANCE_STARTUP_INVESTMENT } from '../src/game/constants';
import { renderAllianceHelp } from '../src/game/screens/alliance-invest';

const allianceInvestCode = fs.readFileSync(
  path.join(__dirname, '../src/game/screens/alliance-invest.ts'),
  'utf-8'
);
const dockingCode = fs.readFileSync(
  path.join(__dirname, '../src/game/systems/docking.ts'),
  'utf-8'
);

// ============================================================================
// PURE LOGIC TESTS (no DB dependency)
// ============================================================================

describe('Alliance system - pure logic', () => {
  describe('DEFCON cost calculation (SP.VEST.S lines 83, 85)', () => {
    // Original: j=1 if o7<=9, j=2 if o7>9.
    // Cost per level = j * 100,000 cr.
    // Asset requirement per level = j * 10 (in 10k units).
    // Cost is deducted from system assets (o3), NOT player credits.
    it('returns tier j=1 when current DEFCON is 0', () => {
      expect(getDefconTier(0)).toBe(1);
    });
    it('returns tier j=1 when current DEFCON is 9 (tier 1 boundary)', () => {
      expect(getDefconTier(9)).toBe(1);
    });
    it('returns tier j=2 when current DEFCON is 10 (tier 2)', () => {
      expect(getDefconTier(10)).toBe(2);
    });
    it('returns tier j=2 when current DEFCON is 19 (tier 2)', () => {
      expect(getDefconTier(19)).toBe(2);
    });
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
    it('tier-1 asset requirement is j*10 = 10 (100k cr in assets)', () => {
      // SP.VEST.S line 84: if (j*10)>o3 → need ≥10 assets (≥100,000 cr)
      expect(getDefconTier(5) * 10).toBe(10);
    });
    it('tier-2 asset requirement is j*10 = 20 (200k cr in assets)', () => {
      expect(getDefconTier(15) * 10).toBe(20);
    });
  });

  describe('Hostile takeover cost formula (SP.VEST.S lines 180-182)', () => {
    // Original: if o3<1 y=1; if o3>0 y=(o3*2); cost = y * 10,000 cr
    it('returns 10,000 cr when assetsHigh is 0 (minimum cost y=1)', () => {
      expect(calculateTakeoverCost(0)).toBe(10000);
    });

    it('returns 10,000 cr when assetsHigh is negative (edge case, y=1)', () => {
      expect(calculateTakeoverCost(-1)).toBe(10000);
    });

    it('returns 20,000 cr when assetsHigh is 1 (y=1*2=2)', () => {
      expect(calculateTakeoverCost(1)).toBe(20000);
    });

    it('returns 100,000 cr when assetsHigh is 5 (y=5*2=10)', () => {
      expect(calculateTakeoverCost(5)).toBe(100000);
    });

    it('returns 2,000,000 cr when assetsHigh is 100 (y=100*2=200)', () => {
      expect(calculateTakeoverCost(100)).toBe(2000000);
    });

    it('returns 3,980,000 cr when assetsHigh is 199 (max before safe)', () => {
      // y = 199*2 = 398; cost = 398 * 10,000 = 3,980,000
      expect(calculateTakeoverCost(199)).toBe(3980000);
    });
  });

  describe('ALLIANCE_STARTUP_INVESTMENT constant', () => {
    it('is 10,000 cr (SP.VEST.S line 59: g1=g1-1)', () => {
      expect(ALLIANCE_STARTUP_INVESTMENT).toBe(10000);
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

  describe('DEFCON fortification logic (SP.VEST.S fortpass loop)', () => {
    // SP.VEST.S lines 89: o7=(o7+1):o3=(o3-(10*j))
    // Each level costs 10*j from system assets (o3)
    it('tier-1 level costs 10 asset units (o3 -= 10*1)', () => {
      const j = getDefconTier(5); // j=1
      const assetCost = 10 * j;
      expect(assetCost).toBe(10);
    });

    it('tier-2 level costs 20 asset units (o3 -= 10*2)', () => {
      const j = getDefconTier(12); // j=2
      const assetCost = 10 * j;
      expect(assetCost).toBe(20);
    });

    it('tier transition: adding DEFCON 10 (crossing from tier 1 to tier 2)', () => {
      // Starting at DEFCON 9, adding 1 level: j=1 (since 9 ≤ 9), costs 10 assets
      const j1 = getDefconTier(9);
      expect(j1).toBe(1);
      // After DEFCON becomes 10, next level: j=2, costs 20 assets
      const j2 = getDefconTier(10);
      expect(j2).toBe(2);
    });

    it('friendly investment just adds levels (capped at DEFCON_MAX)', () => {
      const currentDefcon = 3;
      const newLevels = 4;
      expect(Math.min(currentDefcon + newLevels, DEFCON_MAX)).toBe(7);
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
    // SP.VEST.S fortify (lines 69-95):
    // - System must exist and be owned by player's alliance
    // - Cost deducted from SYSTEM ASSETS (o3), not player credits
    // - j=1 for DEFCON 0-9, j=2 for DEFCON 10-19
    // - Asset requirement: (j*10) <= o3
    // - Each level: o7+=1, o3-=(10*j)

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

    it('returns error when system is unowned (SP.VEST.S line 71)', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 100, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({ alliance: 'REBEL_ALLIANCE' });
      prisma.allianceSystem.findUnique.mockResolvedValue(null);
      const result = await investInDefcon('char-1', 5, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('open for investment');
    });

    it('returns error when system belongs to different alliance (SP.VEST.S line 72)', async () => {
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 100, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({ alliance: 'ASTRO_LEAGUE' });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        alliance: 'SPACE_DRAGONS',
        defconLevel: 3,
        assetsHigh: 50,
        assetsLow: 0,
      });
      const result = await investInDefcon('char-1', 5, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('You are not in The SPACE_DRAGONS');
    });

    it('adds 1 level to friendly system, deducting 10 asset units (tier 1)', async () => {
      // DEFCON 3 → j=1, costs 10 from assetsHigh. assetsHigh: 50 → 40
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', name: 'TestPilot', creditsHigh: 10, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({ alliance: 'ASTRO_LEAGUE' });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 3,
        assetsHigh: 50,
        assetsLow: 0,
      });
      prisma.allianceSystem.update.mockResolvedValue({});
      prisma.gameLog.create.mockResolvedValue({});

      const result = await investInDefcon('char-1', 5, 1);
      expect(result.success).toBe(true);
      expect(result.newDefcon).toBe(4);
      expect(result.levelsAdded).toBe(1);
      // Assets should be decremented: 50 - 10 = 40
      expect(prisma.allianceSystem.update).toHaveBeenCalledWith({
        where: { systemId: 5 },
        data: { defconLevel: 4, assetsHigh: 40, assetsLow: 0 },
      });
    });

    it('adds 2 levels to friendly system, deducting 20 asset units (tier 1)', async () => {
      // DEFCON 5, add 2 → j=1 each, costs 10+10=20. assetsHigh: 50 → 30
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', name: 'TestPilot', creditsHigh: 10, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({ alliance: 'ASTRO_LEAGUE' });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 5,
        assetsHigh: 50,
        assetsLow: 0,
      });
      prisma.allianceSystem.update.mockResolvedValue({});
      prisma.gameLog.create.mockResolvedValue({});

      const result = await investInDefcon('char-1', 5, 2);
      expect(result.success).toBe(true);
      expect(result.newDefcon).toBe(7);
      expect(result.levelsAdded).toBe(2);
      expect(prisma.allianceSystem.update).toHaveBeenCalledWith({
        where: { systemId: 5 },
        data: { defconLevel: 7, assetsHigh: 30, assetsLow: 0 },
      });
    });

    it('tier transition: crossing from DEFCON 9 to 10 changes cost (j=1 then j=2)', async () => {
      // DEFCON 9, add 2 levels:
      // Level 1: j=1, costs 10 → DEFCON 10, assetsHigh 50→40
      // Level 2: j=2, costs 20 → DEFCON 11, assetsHigh 40→20
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', name: 'TestPilot', creditsHigh: 10, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({ alliance: 'ASTRO_LEAGUE' });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 9,
        assetsHigh: 50,
        assetsLow: 0,
      });
      prisma.allianceSystem.update.mockResolvedValue({});
      prisma.gameLog.create.mockResolvedValue({});

      const result = await investInDefcon('char-1', 5, 2);
      expect(result.success).toBe(true);
      expect(result.newDefcon).toBe(11);
      expect(result.levelsAdded).toBe(2);
      // Total asset cost: 10 + 20 = 30, so 50 - 30 = 20
      expect(prisma.allianceSystem.update).toHaveBeenCalledWith({
        where: { systemId: 5 },
        data: { defconLevel: 11, assetsHigh: 20, assetsLow: 0 },
      });
    });

    it('fails when assets insufficient (SP.VEST.S line 84: (j*10)>o3)', async () => {
      // DEFCON 5, j=1, need (1*10)=10 but assetsHigh=5
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', name: 'TestPilot', creditsHigh: 10, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({ alliance: 'ASTRO_LEAGUE' });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 5,
        assetsHigh: 5, // need 10, only have 5
        assetsLow: 0,
      });

      const result = await investInDefcon('char-1', 5, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Need more assets');
    });

    it('tier-2 fails when assets insufficient for j=2 requirement', async () => {
      // DEFCON 12, j=2, need (2*10)=20 but assetsHigh=15
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', name: 'TestPilot', creditsHigh: 10, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({ alliance: 'ASTRO_LEAGUE' });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 12,
        assetsHigh: 15, // need 20
        assetsLow: 0,
      });

      const result = await investInDefcon('char-1', 5, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Need more assets');
    });

    it('partial fortification: stops when assets run out mid-loop', async () => {
      // DEFCON 7, add 5 levels: j=1 each costs 10.
      // assetsHigh=25 → can only afford 2 levels (cost 20), 3rd would need 10 but only 5 left
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', name: 'TestPilot', creditsHigh: 10, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({ alliance: 'ASTRO_LEAGUE' });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 7,
        assetsHigh: 25,
        assetsLow: 0,
      });
      prisma.allianceSystem.update.mockResolvedValue({});
      prisma.gameLog.create.mockResolvedValue({});

      const result = await investInDefcon('char-1', 5, 5);
      expect(result.success).toBe(true);
      expect(result.levelsAdded).toBe(2); // only 2 levels affordable
      expect(result.newDefcon).toBe(9);
      expect(prisma.allianceSystem.update).toHaveBeenCalledWith({
        where: { systemId: 5 },
        data: { defconLevel: 9, assetsHigh: 5, assetsLow: 0 },
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
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', name: 'TestPilot', creditsHigh: 100, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({ alliance: 'ASTRO_LEAGUE' });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 20, // already at max
        assetsHigh: 100,
        assetsLow: 0,
      });

      const result = await investInDefcon('char-1', 5, 1);
      expect(result.success).toBe(false);
      // Original: "Maximum DEFCON achieved for <system>" or "No DEFCON levels could be added"
      expect(result.error).toBeDefined();
    });

    it('stops at DEFCON_MAX when requesting more levels than remaining', async () => {
      // DEFCON 18, add 5 → can only add 2 (to reach 20)
      prisma.character.findUnique.mockResolvedValue({ id: 'char-1', name: 'TestPilot', creditsHigh: 10, creditsLow: 0 });
      prisma.allianceMembership.findUnique.mockResolvedValue({ alliance: 'ASTRO_LEAGUE' });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        alliance: 'ASTRO_LEAGUE',
        defconLevel: 18,
        assetsHigh: 100,
        assetsLow: 0,
      });
      prisma.allianceSystem.update.mockResolvedValue({});
      prisma.gameLog.create.mockResolvedValue({});

      const result = await investInDefcon('char-1', 5, 5);
      expect(result.success).toBe(true);
      expect(result.newDefcon).toBe(20);
      expect(result.levelsAdded).toBe(2);
      // j=2 for both levels, each costs 20 assets → 40 total
      expect(prisma.allianceSystem.update).toHaveBeenCalledWith({
        where: { systemId: 5 },
        data: { defconLevel: 20, assetsHigh: 60, assetsLow: 0 },
      });
    });
  });
});

// ============================================================================
// SP.VEST.S H key — renderAllianceHelp (copy"sp.help" Alliance Holdings section)
// ============================================================================

describe('renderAllianceHelp (SP.VEST.S H key → sp.help Alliance Holdings section)', () => {
  it('contains the Alliance Holdings Section header', () => {
    // SP.HELP: "Alliance Holdings Section:"
    const output = renderAllianceHelp();
    expect(output).toContain('Alliance Holdings Section:');
  });

  it('describes fortification against other alliances', () => {
    // SP.HELP: "can be a headquarters which can be fortified against attack by other alliances"
    const output = renderAllianceHelp();
    expect(output).toContain('fortified against attack');
  });

  it('describes guard ship mechanic on exit', () => {
    // SP.HELP: "given a choice which includes standing guard over one of his alliance planets"
    const output = renderAllianceHelp();
    expect(output).toContain('standing guard');
  });

  it('lists available commands', () => {
    // Command summary: I, T, D, W, F, S, N, P, Q
    const output = renderAllianceHelp();
    expect(output).toContain('(I)nvest');
    expect(output).toContain('(T)akeover');
    expect(output).toContain('(D)eposit');
    expect(output).toContain('(W)ithdraw');
    expect(output).toContain('(F)ort');
    expect(output).toContain('(Q)uit');
  });
});

// ============================================================================
// SP.VEST.S pz$ free takeover (lines 35, 168, 179, 186-192)
// Original: pz$=q4$ set at docking → Investment Center skips cost for docs holder
// ============================================================================

describe('SP.VEST.S pz$ free takeover — two-step flow (SP.DOCK1.S:135 + SP.VEST.S:179)', () => {
  it('docking.ts sets raidDocument to system name (pz$=q4$)', () => {
    // SP.DOCK1.S:135: pz$=q4$  (q4$ = system name)
    expect(dockingCode).toContain('raidDocument: targetSystem.name');
  });

  it('docking.ts does NOT call allianceSystem.update during raid (no immediate ownership transfer)', () => {
    // Ownership must happen later at Investment Center
    // The $transaction in completeRaid should be absent / not contain allianceSystem.update
    const completeRaidSection = dockingCode.slice(dockingCode.indexOf('async function completeRaid'));
    // No allianceSystem.update in completeRaid
    const noUpdate = !completeRaidSection.includes('allianceSystem.update');
    expect(noUpdate).toBe(true);
  });

  it('docking.ts message includes "Please take them immediately to Alliance Investment Ltd"', () => {
    // SP.DOCK1.S:132: print "Please take them immediately to Alliance Investment Ltd"
    expect(dockingCode).toContain('Please take them immediately to Alliance Investment Ltd');
  });

  it('alliance-invest.ts render greets player with raid documents (SP.VEST.S:35)', () => {
    // SP.VEST.S:35: if pz$<>"" print "Ah...you have the new owner documents for {pz$}":goto invtak
    expect(allianceInvestCode).toContain('Ah...you have the new owner documents for');
    expect(allianceInvestCode).toContain('character.raidDocument');
  });

  it('alliance-invest.ts auto-starts takeover flow when raidDocument set', () => {
    // render() sets pendingTakeover when raidDocument is present
    expect(allianceInvestCode).toContain("pendingTakeover.set(characterId, { step: 'system' })");
  });

  it('alliance-invest.ts skips credit cost when raidDocument === systemName (SP.VEST.S:179)', () => {
    // SP.VEST.S:179: if pz$=o3$ goto invtak2  (skip cost deduction)
    expect(allianceInvestCode).toContain("character?.raidDocument === systemName");
  });

  it('alliance-invest.ts executes takeover without confirm prompt for raid docs', () => {
    // Original invtak2 path has no Y/N prompt when pz$=o3$
    // Verified by: raidDocument path does NOT set pendingTakeover to confirm step
    const raidBlock = allianceInvestCode.slice(
      allianceInvestCode.indexOf("character?.raidDocument === systemName"),
      allianceInvestCode.indexOf("// SP.VEST.S takeover eligibility")
    );
    expect(raidBlock).not.toContain("step: 'confirm'");
  });

  it('alliance-invest.ts clears raidDocument after takeover (pz$="")', () => {
    // SP.VEST.S:191: pz$=""
    expect(allianceInvestCode).toContain('raidDocument: null');
  });

  it('alliance-invest.ts writes ALLIANCE GameLog on raid takeover (SP.VEST.S invtak2 news)', () => {
    // SP.VEST.S:187: i$=": ["+ln$+"] - Take-Over "+o3$+" from "+o4$+" by "+na$:gosub news
    expect(allianceInvestCode).toContain('RAID_TAKEOVER');
    expect(allianceInvestCode).toContain('Take-Over');
  });
});

// ============================================================================
// SP.SAVE.S lm$<>o4$ membership cross-check parity
// Original SP.SAVE.S:59,96: if lm$<>o4$ print\"You are not in The "o4$:goto invest1
// Modern: per-player allianceMembership record — cross-alliance access is
// architecturally impossible (findUnique({where:{characterId}}) = own record only)
// ============================================================================

describe('SP.SAVE.S lm$<>o4$ — alliance membership cross-check parity', () => {
  let prismaInstance: any;

  beforeEach(async () => {
    const mod = await import('../src/db/prisma');
    prismaInstance = (mod as any).prisma;
    vi.clearAllMocks();
  });

  it('investInAlliance returns error if player has no alliance membership (lm$="" in original)', async () => {
    prismaInstance.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 10, creditsLow: 0 });
    prismaInstance.allianceMembership.findUnique.mockResolvedValue(null);

    const { investInAlliance } = await import('../src/game/systems/alliance.js');
    const result = await investInAlliance('char-1', 10000);
    expect(result.success).toBe(false);
    expect(result.error).toContain('alliance');
  });

  it('investInAlliance returns error if player alliance is NONE (not a member — lm$="" equivalent)', async () => {
    prismaInstance.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 10, creditsLow: 0 });
    prismaInstance.allianceMembership.findUnique.mockResolvedValue({
      id: 'mem-1', characterId: 'char-1', alliance: 'NONE', creditsHigh: 0, creditsLow: 0,
    });

    const { investInAlliance } = await import('../src/game/systems/alliance.js');
    const result = await investInAlliance('char-1', 10000);
    expect(result.success).toBe(false);
    expect(result.error).toContain('alliance');
  });

  it('withdrawFromAlliance returns error if player has no alliance membership', async () => {
    prismaInstance.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 10, creditsLow: 0 });
    prismaInstance.allianceMembership.findUnique.mockResolvedValue(null);

    const { withdrawFromAlliance } = await import('../src/game/systems/alliance.js');
    const result = await withdrawFromAlliance('char-1', 10000);
    expect(result.success).toBe(false);
    expect(result.error).toContain('alliance');
  });

  it('withdrawFromAlliance returns error if player alliance is NONE', async () => {
    prismaInstance.character.findUnique.mockResolvedValue({ id: 'char-1', creditsHigh: 10, creditsLow: 0 });
    prismaInstance.allianceMembership.findUnique.mockResolvedValue({
      id: 'mem-1', characterId: 'char-1', alliance: 'NONE', creditsHigh: 0, creditsLow: 0,
    });

    const { withdrawFromAlliance } = await import('../src/game/systems/alliance.js');
    const result = await withdrawFromAlliance('char-1', 10000);
    expect(result.success).toBe(false);
    expect(result.error).toContain('alliance');
  });

  it('invest/withdraw always operate on own allianceMembership record — cross-alliance bank access impossible by design', () => {
    // Verify the source uses findUnique({where:{characterId}}) — own record only
    const allianceCode = fs.readFileSync(
      path.join(__dirname, '../src/game/systems/alliance.ts'),
      'utf-8'
    );
    // Both investInAlliance and withdrawFromAlliance use characterId lookup
    const findCalls = [...allianceCode.matchAll(/allianceMembership\.findUnique\(\{[\s\S]*?where:\s*\{\s*characterId\s*\}/g)];
    expect(findCalls.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// SP.SAVE.S news log parity tests
// Original SP.SAVE.S lines 88-89 (withdraw) and 119-120 (deposit):
//   i$=" "+o6$+" "+ll$+"Withdraws"+yj$+" cr___"+zj$:gosub news
//   i$=" "+o6$+" "+ll$+"Deposits_"+yj$+" cr___"+zj$:gosub news
// The news subroutine writes to sp.balance (alliance transaction file).
// Modern equivalent: prisma.gameLog.create with type=ALLIANCE.
// ============================================================================

describe('SP.SAVE.S news log — deposit/withdraw write ALLIANCE GameLog', () => {
  let prismaInstance: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prismaInstance = (prismaMod as any).prisma;
  });

  it('investInAlliance writes ALLIANCE GameLog entry after successful deposit (SP.SAVE.S lines 119-120)', async () => {
    prismaInstance.character.findUnique.mockResolvedValue({
      id: 'char-1', name: 'Zara', creditsHigh: 5, creditsLow: 0,
    });
    prismaInstance.allianceMembership.findUnique.mockResolvedValue({
      id: 'mem-1', characterId: 'char-1', alliance: 'ASTRO_LEAGUE',
      creditsHigh: 0, creditsLow: 0,
    });
    prismaInstance.$transaction.mockResolvedValue(undefined);
    prismaInstance.gameLog.create.mockResolvedValue({});

    const { investInAlliance: invest } = await import('../src/game/systems/alliance.js');
    const result = await invest('char-1', 10000);

    expect(result.success).toBe(true);
    expect(prismaInstance.gameLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ALLIANCE',
          characterId: 'char-1',
          message: expect.stringContaining('Deposits'),
        }),
      })
    );
  });

  it('withdrawFromAlliance writes ALLIANCE GameLog entry after successful withdrawal (SP.SAVE.S lines 88-89)', async () => {
    prismaInstance.character.findUnique.mockResolvedValue({
      id: 'char-2', name: 'Rex', creditsHigh: 0, creditsLow: 0,
    });
    prismaInstance.allianceMembership.findUnique.mockResolvedValue({
      id: 'mem-2', characterId: 'char-2', alliance: 'REBEL_ALLIANCE',
      creditsHigh: 3, creditsLow: 0,
    });
    prismaInstance.$transaction.mockResolvedValue(undefined);
    prismaInstance.gameLog.create.mockResolvedValue({});

    const { withdrawFromAlliance: withdraw } = await import('../src/game/systems/alliance.js');
    const result = await withdraw('char-2', 5000);

    expect(result.success).toBe(true);
    expect(prismaInstance.gameLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ALLIANCE',
          characterId: 'char-2',
          message: expect.stringContaining('Withdraws'),
        }),
      })
    );
  });

  it('investInAlliance log message includes player name and deposit amount (SP.SAVE.S yj$/ll$ format)', async () => {
    prismaInstance.character.findUnique.mockResolvedValue({
      id: 'char-3', name: 'Nova', creditsHigh: 10, creditsLow: 0,
    });
    prismaInstance.allianceMembership.findUnique.mockResolvedValue({
      id: 'mem-3', characterId: 'char-3', alliance: 'WARLORD_CONFED',
      creditsHigh: 0, creditsLow: 0,
    });
    prismaInstance.$transaction.mockResolvedValue(undefined);
    prismaInstance.gameLog.create.mockResolvedValue({});

    const { investInAlliance: invest } = await import('../src/game/systems/alliance.js');
    await invest('char-3', 25000);

    const call = prismaInstance.gameLog.create.mock.calls[0][0];
    expect(call.data.message).toContain('Nova');
    expect(call.data.message).toContain('25000');
  });

  it('withdrawFromAlliance log message includes player name and withdrawal amount (SP.SAVE.S yj$/ll$ format)', async () => {
    prismaInstance.character.findUnique.mockResolvedValue({
      id: 'char-4', name: 'Vex', creditsHigh: 0, creditsLow: 0,
    });
    prismaInstance.allianceMembership.findUnique.mockResolvedValue({
      id: 'mem-4', characterId: 'char-4', alliance: 'SPACE_DRAGONS',
      creditsHigh: 5, creditsLow: 0,
    });
    prismaInstance.$transaction.mockResolvedValue(undefined);
    prismaInstance.gameLog.create.mockResolvedValue({});

    const { withdrawFromAlliance: withdraw } = await import('../src/game/systems/alliance.js');
    await withdraw('char-4', 15000);

    const call = prismaInstance.gameLog.create.mock.calls[0][0];
    expect(call.data.message).toContain('Vex');
    expect(call.data.message).toContain('15000');
  });

  it('deposit GameLog is NOT written when deposit fails (insufficient credits)', async () => {
    prismaInstance.character.findUnique.mockResolvedValue({
      id: 'char-5', name: 'Broke', creditsHigh: 0, creditsLow: 100,
    });
    prismaInstance.allianceMembership.findUnique.mockResolvedValue({
      id: 'mem-5', characterId: 'char-5', alliance: 'ASTRO_LEAGUE',
      creditsHigh: 0, creditsLow: 0,
    });

    const { investInAlliance: invest } = await import('../src/game/systems/alliance.js');
    const result = await invest('char-5', 50000);

    expect(result.success).toBe(false);
    expect(prismaInstance.gameLog.create).not.toHaveBeenCalled();
  });
});
