/**
 * SpacerQuest v4.0 - Port Ownership System Tests
 *
 * Tests for buyPort, collectPortDividends
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subtractCredits } from '../src/game/utils';

// ============================================================================
// PURE LOGIC TESTS
// ============================================================================

describe('Port ownership - pure logic', () => {
  const PORT_BASE_PRICE = 500000; // from port-ownership.ts

  describe('Port purchase affordability', () => {
    it('player with 500,000 credits can afford a port', () => {
      const result = subtractCredits(50, 0, PORT_BASE_PRICE); // 50*10000 = 500,000
      expect(result.success).toBe(true);
      expect(result.high).toBe(0);
      expect(result.low).toBe(0);
    });

    it('player with 499,999 credits cannot afford a port', () => {
      const result = subtractCredits(49, 9999, PORT_BASE_PRICE);
      expect(result.success).toBe(false);
    });

    it('player with excess credits retains remainder', () => {
      const result = subtractCredits(60, 5000, PORT_BASE_PRICE); // 605,000 total
      expect(result.success).toBe(true);
      expect(result.high * 10000 + result.low).toBe(105000);
    });
  });
});

// ============================================================================
// MOCKED DB TESTS
// ============================================================================

vi.mock('../src/db/prisma', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    allianceSystem: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    gameLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe('Port ownership - DB functions', () => {
  let prisma: any;
  let buyPort: any;
  let collectPortDividends: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const portMod = await import('../src/game/systems/port-ownership');
    buyPort = portMod.buyPort;
    collectPortDividends = portMod.collectPortDividends;
  });

  describe('buyPort', () => {
    it('returns error when character not found', async () => {
      prisma.character.findUnique.mockResolvedValue(null);
      const result = await buyPort('char-1', 5);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Character not found');
    });

    it('returns error when port already owned', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        name: 'TestPilot',
        creditsHigh: 100,
        creditsLow: 0,
      });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        ownerCharacterId: 'char-other',
      });

      const result = await buyPort('char-1', 5);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Port is already owned');
    });

    it('returns error when insufficient credits', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        name: 'TestPilot',
        creditsHigh: 0,
        creditsLow: 1000,
      });
      prisma.allianceSystem.findUnique.mockResolvedValue(null);

      const result = await buyPort('char-1', 5);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not enough credits to buy port');
    });

    it('succeeds when port is unowned and player has enough credits', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        name: 'TestPilot',
        creditsHigh: 60,
        creditsLow: 0,
      });
      prisma.allianceSystem.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await buyPort('char-1', 5);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Port 5');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('allows purchase when port exists but has no owner', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        name: 'TestPilot',
        creditsHigh: 60,
        creditsLow: 0,
      });
      prisma.allianceSystem.findUnique.mockResolvedValue({
        systemId: 5,
        ownerCharacterId: null,
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await buyPort('char-1', 5);
      expect(result.success).toBe(true);
    });
  });

  describe('collectPortDividends', () => {
    it('returns error - dividends collect automatically', async () => {
      const result = await collectPortDividends('char-1', 5);
      expect(result.success).toBe(false);
      expect(result.error).toContain('automatically');
    });
  });
});
