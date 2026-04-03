/**
 * SpacerQuest v4.0 - Top Gun Rankings System Tests
 *
 * Tests for getTopGunRankings
 *
 * Original SP.TOP.S ranking formula: score = strength × condition (d1*d2, etc.)
 * tgfx guard (lines 107-108): skip if strength<1 or condition<1, or strength>199 or condition>9
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma', () => ({
  prisma: {
    character: {
      findMany: vi.fn(),
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

  it('returns 13 categories (8 original + 5 additions)', async () => {
    prisma.character.findMany.mockResolvedValue([]);
    prisma.character.findFirst.mockResolvedValue(null);

    const result = await getTopGunRankings();
    expect(result.categories).toHaveLength(13);
  });

  it('returns N/A and 0 for empty categories when no characters exist', async () => {
    prisma.character.findMany.mockResolvedValue([]);
    prisma.character.findFirst.mockResolvedValue(null);

    const result = await getTopGunRankings();
    for (const cat of result.categories) {
      expect(cat.leader).toBe('N/A');
      expect(cat.value).toBe(0);
    }
  });

  it('includes all original SP.TOP.S category names', async () => {
    prisma.character.findMany.mockResolvedValue([]);
    prisma.character.findFirst.mockResolvedValue(null);

    const result = await getTopGunRankings();
    const names = result.categories.map((c: any) => c.name);

    // Original SP.TOP.S categories (lines 79-102)
    expect(names).toContain('Fastest Drives');
    expect(names).toContain('Fanciest Cabin');
    expect(names).toContain('Best Life Support');
    expect(names).toContain('Strongest Weapons');
    expect(names).toContain('Best Navigation');
    expect(names).toContain('Best Robotics');
    expect(names).toContain('Strongest Shields');
    expect(names).toContain('Best All-Around Ship');

    // Modern additions (not in original):
    expect(names).toContain('Strongest Hull');
    expect(names).toContain('Most Cargo');
    expect(names).toContain('Top Rescuer');
    expect(names).toContain('Battle Champion');
    expect(names).toContain('Most Promotions');
  });

  it('ranks by strength × condition (SP.TOP.S tgfx formula: i=d1*d2)', async () => {
    // Two characters: one with high strength but low condition, one with balanced stats.
    // The balanced one should win because strength×condition is higher.
    prisma.character.findMany.mockResolvedValue([
      {
        id: '1',
        name: 'Speedy',
        shipName: 'FlashRocket',
        ship: {
          driveStrength: 100, driveCondition: 2,   // score = 200
          cabinStrength: 0,   cabinCondition: 0,
          lifeSupportStrength: 0, lifeSupportCondition: 0,
          weaponStrength: 0, weaponCondition: 0,
          navigationStrength: 0, navigationCondition: 0,
          roboticsStrength: 0, roboticsCondition: 0,
          shieldStrength: 0, shieldCondition: 0,
          hullStrength: 0, hullCondition: 0,
        },
      },
      {
        id: '2',
        name: 'Balanced',
        shipName: 'SteadyStarship',
        ship: {
          driveStrength: 50, driveCondition: 9,    // score = 450 — higher!
          cabinStrength: 0,   cabinCondition: 0,
          lifeSupportStrength: 0, lifeSupportCondition: 0,
          weaponStrength: 0, weaponCondition: 0,
          navigationStrength: 0, navigationCondition: 0,
          roboticsStrength: 0, roboticsCondition: 0,
          shieldStrength: 0, shieldCondition: 0,
          hullStrength: 0, hullCondition: 0,
        },
      },
    ]);
    prisma.character.findFirst.mockResolvedValue(null);

    const result = await getTopGunRankings();
    const drives = result.categories.find((c: any) => c.name === 'Fastest Drives');
    // SteadyStarship (50×9=450) beats FlashRocket (100×2=200)
    expect(drives.leader).toBe('SteadyStarship');
    expect(drives.value).toBe(450);
  });

  it('tgfx guard: skips components with strength<1 or condition<1 (SP.TOP.S lines 107-108)', async () => {
    prisma.character.findMany.mockResolvedValue([
      {
        id: '1',
        name: 'Empty',
        shipName: 'NakedHull',
        ship: {
          driveStrength: 0, driveCondition: 9,   // strength<1 → skip (score=0)
          cabinStrength: 50, cabinCondition: 0,  // condition<1 → skip (score=0)
          lifeSupportStrength: 0, lifeSupportCondition: 0,
          weaponStrength: 0, weaponCondition: 0,
          navigationStrength: 0, navigationCondition: 0,
          roboticsStrength: 0, roboticsCondition: 0,
          shieldStrength: 0, shieldCondition: 0,
          hullStrength: 0, hullCondition: 0,
        },
      },
    ]);
    prisma.character.findFirst.mockResolvedValue(null);

    const result = await getTopGunRankings();
    const drives = result.categories.find((c: any) => c.name === 'Fastest Drives');
    const cabin = result.categories.find((c: any) => c.name === 'Fanciest Cabin');
    expect(drives.leader).toBe('N/A');
    expect(drives.value).toBe(0);
    expect(cabin.leader).toBe('N/A');
    expect(cabin.value).toBe(0);
  });

  it('computes Best All-Around Ship as sum of all 8 components (SP.TOP.S lines 69-73)', async () => {
    prisma.character.findMany.mockResolvedValue([
      {
        id: '1',
        name: 'Elite',
        shipName: 'ThunderGod',
        ship: {
          hullStrength: 10,         hullCondition: 2,         // 20
          driveStrength: 20,        driveCondition: 3,        // 60
          cabinStrength: 5,         cabinCondition: 4,        // 20
          lifeSupportStrength: 15,  lifeSupportCondition: 2,  // 30
          weaponStrength: 25,       weaponCondition: 2,       // 50
          navigationStrength: 10,   navigationCondition: 5,   // 50
          roboticsStrength: 8,      roboticsCondition: 3,     // 24
          shieldStrength: 12,       shieldCondition: 4,       // 48
          // total = 20+60+20+30+50+50+24+48 = 302
        },
      },
    ]);
    prisma.character.findFirst.mockResolvedValue(null);

    const result = await getTopGunRankings();
    const allAround = result.categories.find((c: any) => c.name === 'Best All-Around Ship');
    expect(allAround.leader).toBe('ThunderGod');
    expect(allAround.value).toBe(302);
  });

  it('handles character stats (rescues, battles, promotions) via findFirst', async () => {
    prisma.character.findMany.mockResolvedValue([]);
    let callCount = 0;
    prisma.character.findFirst.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // 1st call = topCargo
        return Promise.resolve({ shipName: 'CargoKing', ship: { cargoPods: 200 } });
      }
      if (callCount === 2) {
        // 2nd call = topRescues
        return Promise.resolve({ name: 'Lifesaver', rescuesPerformed: 42 });
      }
      if (callCount === 3) {
        // 3rd call = topBattles
        return Promise.resolve({ name: 'Warrior', battlesWon: 99 });
      }
      if (callCount === 4) {
        // 4th call = topPromotions
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

  it('makes 4 stat-based findFirst queries (cargo, rescues, battles, promotions)', async () => {
    prisma.character.findMany.mockResolvedValue([]);
    prisma.character.findFirst.mockResolvedValue(null);

    await getTopGunRankings();
    expect(prisma.character.findFirst).toHaveBeenCalledTimes(4);
  });

  it('uses findMany for ship-based categories', async () => {
    prisma.character.findMany.mockResolvedValue([]);
    prisma.character.findFirst.mockResolvedValue(null);

    await getTopGunRankings();
    expect(prisma.character.findMany).toHaveBeenCalledTimes(1);
  });

  // SP.TOP.S tie logic (lines 49,52,55,58,61,64,67,72):
  //   if (td=i) and (len(td$)<40) td$=td$+"/"+nz$
  //   if td<i td$=nz$:td=i
  it('SP.TOP.S tie: appends /shipName when two ships tie on strength×condition', async () => {
    prisma.character.findMany.mockResolvedValue([
      {
        id: '1', name: 'Alpha', shipName: 'StarA',
        ship: {
          driveStrength: 50, driveCondition: 9,   // 450 — tied!
          cabinStrength: 0, cabinCondition: 0,
          lifeSupportStrength: 0, lifeSupportCondition: 0,
          weaponStrength: 0, weaponCondition: 0,
          navigationStrength: 0, navigationCondition: 0,
          roboticsStrength: 0, roboticsCondition: 0,
          shieldStrength: 0, shieldCondition: 0,
          hullStrength: 0, hullCondition: 0,
        },
      },
      {
        id: '2', name: 'Beta', shipName: 'StarB',
        ship: {
          driveStrength: 50, driveCondition: 9,   // 450 — tied!
          cabinStrength: 0, cabinCondition: 0,
          lifeSupportStrength: 0, lifeSupportCondition: 0,
          weaponStrength: 0, weaponCondition: 0,
          navigationStrength: 0, navigationCondition: 0,
          roboticsStrength: 0, roboticsCondition: 0,
          shieldStrength: 0, shieldCondition: 0,
          hullStrength: 0, hullCondition: 0,
        },
      },
    ]);
    prisma.character.findFirst.mockResolvedValue(null);

    const result = await getTopGunRankings();
    const drives = result.categories.find((c: any) => c.name === 'Fastest Drives');
    expect(drives.leader).toBe('StarA/StarB');
    expect(drives.value).toBe(450);
  });

  it('SP.TOP.S tie: does not append beyond 40 characters (len(td$)<40 guard)', async () => {
    // "Star" repeated in shipNames to fill up the 40-char limit
    const chars = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      name: `Pilot${i}`,
      shipName: `Ship${i}`,
      ship: {
        driveStrength: 50, driveCondition: 9,
        cabinStrength: 0, cabinCondition: 0,
        lifeSupportStrength: 0, lifeSupportCondition: 0,
        weaponStrength: 0, weaponCondition: 0,
        navigationStrength: 0, navigationCondition: 0,
        roboticsStrength: 0, roboticsCondition: 0,
        shieldStrength: 0, shieldCondition: 0,
        hullStrength: 0, hullCondition: 0,
      },
    }));
    prisma.character.findMany.mockResolvedValue(chars);
    prisma.character.findFirst.mockResolvedValue(null);

    const result = await getTopGunRankings();
    const drives = result.categories.find((c: any) => c.name === 'Fastest Drives');
    // Original: appends while len(td$)<40 — final append can push past 40, but
    // not all 10 ships should appear (the guard stops appending once cap is hit)
    const shipCount = (drives.leader.match(/\//g) || []).length + 1;
    expect(shipCount).toBeLessThan(10);
  });

  it('SP.TOP.S tie: new leader replaces old (td<i: td$=nz$:td=i)', async () => {
    prisma.character.findMany.mockResolvedValue([
      {
        id: '1', name: 'Old', shipName: 'SlowShip',
        ship: {
          driveStrength: 10, driveCondition: 9,   // 90
          cabinStrength: 0, cabinCondition: 0,
          lifeSupportStrength: 0, lifeSupportCondition: 0,
          weaponStrength: 0, weaponCondition: 0,
          navigationStrength: 0, navigationCondition: 0,
          roboticsStrength: 0, roboticsCondition: 0,
          shieldStrength: 0, shieldCondition: 0,
          hullStrength: 0, hullCondition: 0,
        },
      },
      {
        id: '2', name: 'New', shipName: 'FastShip',
        ship: {
          driveStrength: 50, driveCondition: 9,   // 450 — beats SlowShip
          cabinStrength: 0, cabinCondition: 0,
          lifeSupportStrength: 0, lifeSupportCondition: 0,
          weaponStrength: 0, weaponCondition: 0,
          navigationStrength: 0, navigationCondition: 0,
          roboticsStrength: 0, roboticsCondition: 0,
          shieldStrength: 0, shieldCondition: 0,
          hullStrength: 0, hullCondition: 0,
        },
      },
    ]);
    prisma.character.findFirst.mockResolvedValue(null);

    const result = await getTopGunRankings();
    const drives = result.categories.find((c: any) => c.name === 'Fastest Drives');
    // Only FastShip, not SlowShip/FastShip
    expect(drives.leader).toBe('FastShip');
    expect(drives.value).toBe(450);
  });
});
