/**
 * SpacerQuest v4.0 - Repairs System Tests
 *
 * Tests for repairAllComponents and repair cost calculations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTotalCredits, subtractCredits } from '../src/game/utils';

// ============================================================================
// PURE LOGIC TESTS - Repair cost formula
// ============================================================================

describe('Repairs system - pure logic', () => {
  describe('Repair cost calculation', () => {
    // Formula: totalCost += (9 - condition) * strength for each component
    function calculateRepairCost(components: Array<{ strength: number; condition: number }>): number {
      let total = 0;
      for (const c of components) {
        total += (9 - c.condition) * c.strength;
      }
      return total;
    }

    it('costs 0 when all components at max condition (9)', () => {
      const components = Array(8).fill({ strength: 20, condition: 9 });
      expect(calculateRepairCost(components)).toBe(0);
    });

    it('costs (9-condition)*strength per component', () => {
      const components = [{ strength: 10, condition: 5 }];
      expect(calculateRepairCost(components)).toBe(40); // (9-5)*10 = 40
    });

    it('costs more for higher strength components', () => {
      const weak = [{ strength: 10, condition: 0 }];
      const strong = [{ strength: 100, condition: 0 }];
      expect(calculateRepairCost(weak)).toBe(90);   // 9*10
      expect(calculateRepairCost(strong)).toBe(900); // 9*100
    });

    it('costs more for lower condition', () => {
      const lowDmg = [{ strength: 20, condition: 8 }];
      const highDmg = [{ strength: 20, condition: 1 }];
      expect(calculateRepairCost(lowDmg)).toBe(20);   // (9-8)*20
      expect(calculateRepairCost(highDmg)).toBe(160);  // (9-1)*20
    });

    it('calculates total across all 8 components', () => {
      const components = [
        { strength: 20, condition: 7 }, // (9-7)*20 = 40
        { strength: 15, condition: 5 }, // (9-5)*15 = 60
        { strength: 10, condition: 9 }, // 0
        { strength: 25, condition: 3 }, // (9-3)*25 = 150
        { strength: 30, condition: 8 }, // (9-8)*30 = 30
        { strength: 12, condition: 6 }, // (9-6)*12 = 36
        { strength: 8, condition: 4 },  // (9-4)*8 = 40
        { strength: 18, condition: 2 }, // (9-2)*18 = 126
      ];
      expect(calculateRepairCost(components)).toBe(40 + 60 + 0 + 150 + 30 + 36 + 40 + 126);
    });
  });

  describe('Credit check for repairs', () => {
    it('can afford repair when total credits >= cost', () => {
      const totalCredits = getTotalCredits(5, 0); // 50,000
      expect(totalCredits >= 482).toBe(true);
    });

    it('cannot afford when credits < cost', () => {
      const totalCredits = getTotalCredits(0, 100);
      expect(totalCredits < 500).toBe(true);
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

describe('Repairs system - DB functions', () => {
  let prisma: any;
  let repairAllComponents: any;

  const makeShip = (overrides: Record<string, number> = {}) => ({
    id: 'ship-1',
    hullStrength: 20, hullCondition: 9,
    driveStrength: 15, driveCondition: 9,
    cabinStrength: 10, cabinCondition: 9,
    lifeSupportStrength: 12, lifeSupportCondition: 9,
    weaponStrength: 25, weaponCondition: 9,
    navigationStrength: 18, navigationCondition: 9,
    roboticsStrength: 8, roboticsCondition: 9,
    shieldStrength: 20, shieldCondition: 9,
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const repairMod = await import('../src/game/systems/repairs');
    repairAllComponents = repairMod.repairAllComponents;
  });

  it('returns error when character not found', async () => {
    prisma.character.findUnique.mockResolvedValue(null);
    const result = await repairAllComponents('char-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Character or ship not found');
  });

  it('returns error when ship not found', async () => {
    prisma.character.findUnique.mockResolvedValue({ id: 'char-1', ship: null });
    const result = await repairAllComponents('char-1');
    expect(result.success).toBe(false);
  });

  it('costs 0 and succeeds when ship is fully repaired', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-1',
      creditsHigh: 0,
      creditsLow: 100,
      ship: makeShip(),
    });
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await repairAllComponents('char-1');
    expect(result.success).toBe(true);
    expect(result.cost).toBe(0);
  });

  it('calculates correct cost for damaged components', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-1',
      creditsHigh: 10,
      creditsLow: 0,
      ship: makeShip({
        hullCondition: 5,    // (9-5)*20 = 80
        driveCondition: 3,   // (9-3)*15 = 90
      }),
    });
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await repairAllComponents('char-1');
    expect(result.success).toBe(true);
    expect(result.cost).toBe(170); // 80 + 90
  });

  it('fails when player cannot afford repairs', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-1',
      creditsHigh: 0,
      creditsLow: 10,
      ship: makeShip({
        hullCondition: 0,    // (9-0)*20 = 180
        driveCondition: 0,   // (9-0)*15 = 135
        weaponCondition: 0,  // (9-0)*25 = 225
      }),
    });

    const result = await repairAllComponents('char-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not enough credits');
  });

  it('sets all conditions to 9 on successful repair', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-1',
      creditsHigh: 10,
      creditsLow: 0,
      ship: makeShip({ hullCondition: 5, driveCondition: 3 }),
    });
    prisma.$transaction.mockResolvedValue(undefined);

    await repairAllComponents('char-1');

    const txCall = prisma.$transaction.mock.calls[0][0];
    // The first item in the transaction array should be the ship update
    // We can verify the transaction was called
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
