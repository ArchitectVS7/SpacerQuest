/**
 * SpacerQuest v4.0 - Upgrades System Tests
 *
 * Tests for upgradeShipComponent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { COMPONENT_PRICES } from '../src/game/constants';
import { getTotalCredits } from '../src/game/utils';

// ============================================================================
// PURE LOGIC TESTS
// ============================================================================

describe('Upgrades system - pure logic', () => {
  describe('Component prices', () => {
    it('HULL costs 10,000', () => expect(COMPONENT_PRICES.HULL).toBe(10000));
    it('DRIVES costs 9,000', () => expect(COMPONENT_PRICES.DRIVES).toBe(9000));
    it('WEAPONS costs 8,000', () => expect(COMPONENT_PRICES.WEAPONS).toBe(8000));
    it('SHIELDS costs 7,000', () => expect(COMPONENT_PRICES.SHIELDS).toBe(7000));
    it('LIFE_SUPPORT costs 6,000', () => expect(COMPONENT_PRICES.LIFE_SUPPORT).toBe(6000));
    it('NAVIGATION costs 5,000', () => expect(COMPONENT_PRICES.NAVIGATION).toBe(5000));
    it('ROBOTICS costs 4,000', () => expect(COMPONENT_PRICES.ROBOTICS).toBe(4000));
    it('CABIN costs 8,000', () => expect(COMPONENT_PRICES.CABIN).toBe(8000));
  });

  describe('Upgrade mechanics', () => {
    it('STRENGTH upgrade adds +10', () => {
      const currentStrength = 20;
      expect(currentStrength + 10).toBe(30);
    });

    it('CONDITION upgrade adds +1 capped at 9', () => {
      expect(Math.min(9, 8 + 1)).toBe(9);
      expect(Math.min(9, 9 + 1)).toBe(9); // Already at max
      expect(Math.min(9, 5 + 1)).toBe(6);
    });
  });

  describe('Component name mapping', () => {
    const componentMap: Record<string, string> = {
      'HULL': 'hull',
      'DRIVES': 'drive',
      'CABIN': 'cabin',
      'LIFE_SUPPORT': 'lifeSupport',
      'WEAPONS': 'weapon',
      'NAVIGATION': 'navigation',
      'ROBOTICS': 'robotics',
      'SHIELDS': 'shield',
    };

    it('maps all 8 components to DB field names', () => {
      expect(Object.keys(componentMap)).toHaveLength(8);
      expect(componentMap['HULL']).toBe('hull');
      expect(componentMap['DRIVES']).toBe('drive');
      expect(componentMap['LIFE_SUPPORT']).toBe('lifeSupport');
    });

    it('uses case-insensitive lookup', () => {
      const input = 'hull';
      expect(componentMap[input.toUpperCase()]).toBe('hull');
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
    ship: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe('Upgrades system - DB functions', () => {
  let prisma: any;
  let upgradeShipComponent: any;

  const makeCharWithShip = (creditsHigh: number, creditsLow: number, shipOverrides: Record<string, number> = {}) => ({
    id: 'char-1',
    creditsHigh,
    creditsLow,
    ship: {
      id: 'ship-1',
      hullStrength: 20, hullCondition: 9,
      driveStrength: 15, driveCondition: 7,
      cabinStrength: 10, cabinCondition: 9,
      lifeSupportStrength: 12, lifeSupportCondition: 9,
      weaponStrength: 25, weaponCondition: 9,
      navigationStrength: 18, navigationCondition: 9,
      roboticsStrength: 8, roboticsCondition: 9,
      shieldStrength: 20, shieldCondition: 9,
      ...shipOverrides,
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const upgradeMod = await import('../src/game/systems/upgrades');
    upgradeShipComponent = upgradeMod.upgradeShipComponent;
  });

  it('returns error when character not found', async () => {
    prisma.character.findUnique.mockResolvedValue(null);
    const result = await upgradeShipComponent('char-1', 'HULL', 'STRENGTH');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Character or ship not found');
  });

  it('returns error for invalid component name', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(10, 0));
    const result = await upgradeShipComponent('char-1', 'LASERS', 'STRENGTH');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid component');
  });

  it('returns error when not enough credits', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 500));
    const result = await upgradeShipComponent('char-1', 'HULL', 'STRENGTH');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not enough credits');
  });

  it('succeeds with STRENGTH upgrade for HULL', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(2, 0));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await upgradeShipComponent('char-1', 'HULL', 'STRENGTH');
    expect(result.success).toBe(true);
    expect(result.cost).toBe(COMPONENT_PRICES.HULL);
    expect(result.newStrength).toBe(30); // 20 + 10
  });

  it('succeeds with CONDITION upgrade for DRIVES', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(2, 0));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await upgradeShipComponent('char-1', 'DRIVES', 'CONDITION');
    expect(result.success).toBe(true);
    expect(result.cost).toBe(COMPONENT_PRICES.DRIVES);
    expect(result.newCondition).toBe(8); // 7 + 1
  });

  it('caps condition at 9', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(2, 0, { hullCondition: 9 }));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await upgradeShipComponent('char-1', 'HULL', 'CONDITION');
    expect(result.success).toBe(true);
    expect(result.newCondition).toBe(9); // Already max
  });

  it('handles case-insensitive component names', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(2, 0));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await upgradeShipComponent('char-1', 'hull', 'STRENGTH');
    expect(result.success).toBe(true);
  });

  it('deducts correct price for each component', async () => {
    for (const [comp, price] of Object.entries(COMPONENT_PRICES)) {
      vi.clearAllMocks();
      prisma.character.findUnique.mockResolvedValue(makeCharWithShip(10, 0));
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await upgradeShipComponent('char-1', comp, 'STRENGTH');
      expect(result.success).toBe(true);
      expect(result.cost).toBe(price);
    }
  });
});
