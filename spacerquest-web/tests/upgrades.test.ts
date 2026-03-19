/**
 * SpacerQuest v4.0 - Upgrades System Tests
 *
 * Tests for upgradeShipComponent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { COMPONENT_PRICES } from '../src/game/constants';
import { getTotalCredits } from '../src/game/utils';
import { calculateUpgradeMultiplier, calculateUpgradePrice } from '../src/game/systems/upgrades';

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

  describe('Exponential and tiered pricing', () => {
    it('multiplier = 1 for strength ≤ 9', () => {
      expect(calculateUpgradeMultiplier(0)).toBe(1);
      expect(calculateUpgradeMultiplier(5)).toBe(1);
      expect(calculateUpgradeMultiplier(9)).toBe(1);
    });

    it('multiplier = floor(strength/10) + 1 for strength > 9', () => {
      expect(calculateUpgradeMultiplier(10)).toBe(2);
      expect(calculateUpgradeMultiplier(15)).toBe(2);
      expect(calculateUpgradeMultiplier(20)).toBe(3);
      expect(calculateUpgradeMultiplier(50)).toBe(6);
      expect(calculateUpgradeMultiplier(100)).toBe(11);
    });

    it('uses exponential array for tiers 1-9 (strength 0-89)', () => {
      expect(calculateUpgradePrice(0, 5000)).toBe(50); // Tier 1
      expect(calculateUpgradePrice(10, 5000)).toBe(100); // Tier 2
      expect(calculateUpgradePrice(20, 5000)).toBe(200); // Tier 3
      expect(calculateUpgradePrice(80, 5000)).toBe(10000); // Tier 9
    });

    it('falls back to multiplier logic for tiers > 9 (strength 90+)', () => {
      expect(calculateUpgradePrice(90, 5000)).toBe(50000); // Tier 10 * 5000 = 50000
      expect(calculateUpgradePrice(100, 5000)).toBe(55000); // Tier 11 * 5000 = 55000
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
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 49));
    const result = await upgradeShipComponent('char-1', 'HULL', 'STRENGTH');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not enough credits');
  });

  it('succeeds with STRENGTH upgrade for HULL (tiered pricing)', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(10, 0));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await upgradeShipComponent('char-1', 'HULL', 'STRENGTH');
    expect(result.success).toBe(true);
    expect(result.cost).toBe(200);
    expect(result.newStrength).toBe(30); // 20 + 10
  });

  it('succeeds with CONDITION upgrade for DRIVES (tiered pricing)', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(10, 0));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await upgradeShipComponent('char-1', 'DRIVES', 'CONDITION');
    expect(result.success).toBe(true);
    expect(result.cost).toBe(100);
    expect(result.newCondition).toBe(8); // 7 + 1
  });

  it('caps condition at 9', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(10, 0, { hullCondition: 9 }));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await upgradeShipComponent('char-1', 'HULL', 'CONDITION');
    expect(result.success).toBe(true);
    expect(result.newCondition).toBe(9); // Already max
  });

  it('handles case-insensitive component names', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(10, 0));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await upgradeShipComponent('char-1', 'hull', 'STRENGTH');
    expect(result.success).toBe(true);
  });

  it('deducts correct tiered price for each component', async () => {
    // Map component names to the mock ship's starting strength values
    const strengthMap: Record<string, number> = {
      HULL: 20, DRIVES: 15, CABIN: 10, LIFE_SUPPORT: 12,
      WEAPONS: 25, NAVIGATION: 18, ROBOTICS: 8, SHIELDS: 20,
    };

    for (const [comp, basePrice] of Object.entries(COMPONENT_PRICES)) {
      vi.clearAllMocks();
      prisma.character.findUnique.mockResolvedValue(makeCharWithShip(100, 0));
      prisma.$transaction.mockResolvedValue(undefined);

      const strength = strengthMap[comp];
      const expectedPrice = calculateUpgradePrice(strength, basePrice);

      const result = await upgradeShipComponent('char-1', comp, 'STRENGTH');
      expect(result.success).toBe(true);
      expect(result.cost).toBe(expectedPrice);
    }
  });
});
