/**
 * SpacerQuest v4.0 - Top Gun Rankings System Tests
 *
 * Tests for getTopGunRankings
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma', () => ({
  prisma: {
    character: {
      findFirst: vi.fn(),
    },
  },
}));

describe('Top Gun rankings system', () => {
  let prisma: any;
  let getTopGunRankings: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const topgunMod = await import('../src/game/systems/topgun');
    getTopGunRankings = topgunMod.getTopGunRankings;
  });

  it('returns 12 categories', async () => {
    // All queries return null (no characters)
    prisma.character.findFirst.mockResolvedValue(null);

    const result = await getTopGunRankings();
    expect(result.categories).toHaveLength(12);
  });

  it('returns N/A for empty categories', async () => {
    prisma.character.findFirst.mockResolvedValue(null);

    const result = await getTopGunRankings();
    for (const cat of result.categories) {
      expect(cat.leader).toBe('N/A');
      expect(cat.value).toBe(0);
    }
  });

  it('includes all expected category names', async () => {
    prisma.character.findFirst.mockResolvedValue(null);

    const result = await getTopGunRankings();
    const names = result.categories.map((c: any) => c.name);
    expect(names).toContain('Fastest Drives');
    expect(names).toContain('Strongest Weapons');
    expect(names).toContain('Strongest Shields');
    expect(names).toContain('Strongest Hull');
    expect(names).toContain('Fanciest Cabin');
    expect(names).toContain('Best Life Support');
    expect(names).toContain('Best Navigation');
    expect(names).toContain('Best Robotics');
    expect(names).toContain('Most Cargo');
    expect(names).toContain('Top Rescuer');
    expect(names).toContain('Battle Champion');
    expect(names).toContain('Most Promotions');
  });

  it('returns leader name and value when character exists', async () => {
    // Mock the first query (topDrives) to return a character
    let callCount = 0;
    prisma.character.findFirst.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call = topDrives
        return Promise.resolve({
          shipName: 'SpeedDemon',
          ship: { driveStrength: 150 },
        });
      }
      return Promise.resolve(null);
    });

    const result = await getTopGunRankings();
    const drives = result.categories.find((c: any) => c.name === 'Fastest Drives');
    expect(drives.leader).toBe('SpeedDemon');
    expect(drives.value).toBe(150);
  });

  it('handles character stats (rescues, battles, promotions)', async () => {
    let callCount = 0;
    prisma.character.findFirst.mockImplementation(() => {
      callCount++;
      if (callCount === 10) {
        // 10th call = topRescues
        return Promise.resolve({ name: 'Lifesaver', rescuesPerformed: 42 });
      }
      if (callCount === 11) {
        // 11th call = topBattles
        return Promise.resolve({ name: 'Warrior', battlesWon: 99 });
      }
      if (callCount === 12) {
        // 12th call = topPromotions
        return Promise.resolve({ name: 'PromoKing', promotions: 15 });
      }
      return Promise.resolve(null);
    });

    const result = await getTopGunRankings();
    const rescues = result.categories.find((c: any) => c.name === 'Top Rescuer');
    expect(rescues.leader).toBe('Lifesaver');
    expect(rescues.value).toBe(42);

    const battles = result.categories.find((c: any) => c.name === 'Battle Champion');
    expect(battles.leader).toBe('Warrior');
    expect(battles.value).toBe(99);

    const promos = result.categories.find((c: any) => c.name === 'Most Promotions');
    expect(promos.leader).toBe('PromoKing');
    expect(promos.value).toBe(15);
  });

  it('makes 12 parallel database queries', async () => {
    prisma.character.findFirst.mockResolvedValue(null);

    await getTopGunRankings();
    expect(prisma.character.findFirst).toHaveBeenCalledTimes(12);
  });
});
