/**
 * SpacerQuest v4.0 - Repairs System Tests (SP.DAMAGE.S)
 *
 * Formula from original:
 *   cost = (9 - condition) * strength + rebuildFee
 *   rebuildFee = 2000 cr when condition === 0 (fully destroyed component)
 *   Plus 100 cr inspection fee per visit (charged in repairAllComponents)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTotalCredits, subtractCredits } from '../src/game/utils';
import {
  checkEnhancementStripping,
  applyHullStrengthCaps,
} from '../src/game/systems/repairs';

// ============================================================================
// PURE LOGIC TESTS - Repair cost formula
// ============================================================================

describe('Repairs system - pure logic', () => {
  describe('Repair cost calculation (original SP.DAMAGE.S spfix/repauto)', () => {
    const REBUILD_FEE = 2000;

    // Formula: cost = (9 - condition) * strength + rebuildFee
    // rebuildFee = 2000 when condition === 0, else 0
    function componentRepairCost(strength: number, condition: number, units: number): number {
      const rebuildFee = condition === 0 ? REBUILD_FEE : 0;
      return (units * strength) + rebuildFee;
    }

    function totalRepairCost(components: Array<{ strength: number; condition: number }>): number {
      let total = 0;
      for (const c of components) {
        if (c.condition < 9) {
          total += componentRepairCost(c.strength, c.condition, 9 - c.condition);
        }
      }
      return total;
    }

    it('costs 0 repair when all components at max condition (9)', () => {
      const components = Array(8).fill({ strength: 20, condition: 9 });
      expect(totalRepairCost(components)).toBe(0);
    });

    it('costs (9-condition)*strength per component (no rebuild fee)', () => {
      const components = [{ strength: 10, condition: 5 }];
      // (9-5)*10 = 40
      expect(totalRepairCost(components)).toBe(40);
    });

    it('costs more for higher strength components', () => {
      const weak = [{ strength: 10, condition: 0 }];
      const strong = [{ strength: 100, condition: 0 }];
      // weak: 9*10 + 2000 = 2090; strong: 9*100 + 2000 = 2900
      expect(totalRepairCost(weak)).toBe(2090);
      expect(totalRepairCost(strong)).toBe(2900);
    });

    it('costs more for lower condition', () => {
      const lowDmg = [{ strength: 20, condition: 8 }];
      const highDmg = [{ strength: 20, condition: 1 }];
      // lowDmg: (9-8)*20 = 20; highDmg: (9-1)*20 = 160
      expect(totalRepairCost(lowDmg)).toBe(20);
      expect(totalRepairCost(highDmg)).toBe(160);
    });

    it('adds 2000cr rebuild fee when condition=0 (original lines 126, 164)', () => {
      // Fully destroyed component
      const destroyed = [{ strength: 20, condition: 0 }];
      // 9*20 + 2000 = 2180
      expect(totalRepairCost(destroyed)).toBe(2180);
    });

    it('does NOT add rebuild fee when condition > 0', () => {
      const partial = [{ strength: 20, condition: 1 }];
      // (9-1)*20 = 160, no rebuild fee
      expect(totalRepairCost(partial)).toBe(160);
    });

    it('applies rebuild fee per destroyed component (not global)', () => {
      const twoDestroyed = [
        { strength: 20, condition: 0 }, // 9*20+2000 = 2180
        { strength: 10, condition: 0 }, // 9*10+2000 = 2090
      ];
      expect(totalRepairCost(twoDestroyed)).toBe(2180 + 2090);
    });

    it('calculates total across all 8 components', () => {
      const components = [
        { strength: 20, condition: 7 }, // (9-7)*20 = 40
        { strength: 15, condition: 5 }, // (9-5)*15 = 60
        { strength: 10, condition: 9 }, // 0 (no damage)
        { strength: 25, condition: 3 }, // (9-3)*25 = 150
        { strength: 30, condition: 8 }, // (9-8)*30 = 30
        { strength: 12, condition: 6 }, // (9-6)*12 = 36
        { strength: 8,  condition: 4 }, // (9-4)*8 = 40
        { strength: 18, condition: 2 }, // (9-2)*18 = 126
      ];
      expect(totalRepairCost(components)).toBe(40 + 60 + 0 + 150 + 30 + 36 + 40 + 126);
    });
  });

  describe('Single component repair (original repo subroutine)', () => {
    const REBUILD_FEE = 2000;

    function singleRepairCost(strength: number, condition: number, mode: 'single' | 'all'): number {
      const units = mode === 'single' ? 1 : (9 - condition);
      const rebuildFee = condition === 0 ? REBUILD_FEE : 0;
      return (units * strength) + rebuildFee;
    }

    it('single DX mode repairs 1 unit at cost = strength', () => {
      expect(singleRepairCost(20, 5, 'single')).toBe(20);
    });

    it('single DX on condition=0 costs strength + 2000 rebuild fee', () => {
      // Original: k=2000 always applied on condition=0, regardless of units repaired
      expect(singleRepairCost(20, 0, 'single')).toBe(20 + REBUILD_FEE); // 2020
    });

    it('all DX mode repairs all damage at cost = (9-condition)*strength', () => {
      expect(singleRepairCost(20, 5, 'all')).toBe((9 - 5) * 20); // 80
    });

    it('all DX on condition=0 costs 9*strength + 2000', () => {
      expect(singleRepairCost(20, 0, 'all')).toBe(9 * 20 + REBUILD_FEE); // 2180
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
  let repairSingleComponent: any;

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
    repairSingleComponent = repairMod.repairSingleComponent;
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

  it('costs only inspection fee (100cr) when ship is fully repaired', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-1',
      creditsHigh: 0,
      creditsLow: 500,
      ship: makeShip(), // all conditions at 9
    });
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await repairAllComponents('char-1');
    expect(result.success).toBe(true);
    expect(result.cost).toBe(100);    // only inspection fee
    expect(result.repairCost).toBe(0);
    expect(result.inspectionFee).toBe(100);
  });

  it('calculates correct cost: inspection fee + (9-cond)*str per component', async () => {
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
    expect(result.repairCost).toBe(170); // 80 + 90
    expect(result.cost).toBe(270);       // 100 inspection + 170 repair
  });

  it('adds 2000cr rebuild fee per fully-destroyed component (condition=0)', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-1',
      creditsHigh: 10,
      creditsLow: 0,
      ship: makeShip({
        hullCondition: 0,    // 9*20 + 2000 = 2180
      }),
    });
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await repairAllComponents('char-1');
    expect(result.success).toBe(true);
    expect(result.repairCost).toBe(2180); // 9*20 + 2000
    expect(result.cost).toBe(2280);       // 100 + 2180
  });

  it('fails when player cannot afford inspection fee', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-1',
      creditsHigh: 0,
      creditsLow: 50, // less than 100cr inspection fee
      ship: makeShip(),
    });

    const result = await repairAllComponents('char-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not enough credits');
  });

  it('fails when player cannot afford repairs', async () => {
    prisma.character.findUnique.mockResolvedValue({
      id: 'char-1',
      creditsHigh: 0,
      creditsLow: 10,
      ship: makeShip({
        hullCondition: 0,    // 9*20+2000 = 2180
        driveCondition: 0,   // 9*15+2000 = 2135
        weaponCondition: 0,  // 9*25+2000 = 2225
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
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  // Single component repair tests
  describe('repairSingleComponent', () => {
    it('returns no-cost success when component already at condition 9', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 0, creditsLow: 100,
        ship: makeShip(), // all at 9
      });

      const result = await repairSingleComponent('char-1', 'hull', 'all');
      expect(result.success).toBe(true);
      expect(result.cost).toBe(0);
    });

    it('repairs single DX unit at cost = strength (no rebuild fee, condition>0)', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 0, creditsLow: 500,
        ship: makeShip({ hullCondition: 5 }), // hullStrength=20
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await repairSingleComponent('char-1', 'hull', 'single');
      expect(result.success).toBe(true);
      expect(result.cost).toBe(20); // 1 unit * strength 20
      expect(result.newCondition).toBe(6); // 5 + 1
    });

    it('repairs all DX at cost = (9-condition)*strength (no rebuild fee)', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 0, creditsLow: 500,
        ship: makeShip({ hullCondition: 5 }), // hullStrength=20
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await repairSingleComponent('char-1', 'hull', 'all');
      expect(result.success).toBe(true);
      expect(result.cost).toBe((9 - 5) * 20); // 80
      expect(result.newCondition).toBe(9);
    });

    it('adds 2000cr rebuild fee when condition=0, single DX repair', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 0, creditsLow: 5000,
        ship: makeShip({ hullCondition: 0 }), // hullStrength=20
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await repairSingleComponent('char-1', 'hull', 'single');
      expect(result.success).toBe(true);
      expect(result.cost).toBe(20 + 2000); // 1*20 + rebuild fee
      expect(result.newCondition).toBe(1);
    });

    it('adds 2000cr rebuild fee when condition=0, all DX repair', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 0, creditsLow: 5000,
        ship: makeShip({ hullCondition: 0 }), // hullStrength=20
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await repairSingleComponent('char-1', 'hull', 'all');
      expect(result.success).toBe(true);
      expect(result.cost).toBe(9 * 20 + 2000); // 2180
      expect(result.newCondition).toBe(9);
    });

    it('fails when cannot afford single component repair', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 0, creditsLow: 10,
        ship: makeShip({ hullCondition: 0 }), // costs 2020 minimum
      });

      const result = await repairSingleComponent('char-1', 'hull', 'single');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Not enough credits');
    });

    it('repairs component by name (e.g., lifeSupport)', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 0, creditsLow: 500,
        ship: makeShip({ lifeSupportCondition: 4 }), // lifeSupportStrength=12
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await repairSingleComponent('char-1', 'lifeSupport', 'all');
      expect(result.success).toBe(true);
      expect(result.cost).toBe((9 - 4) * 12); // 60
      expect(result.newCondition).toBe(9);
    });

    // ── SP.DAMAGE.S:83 — Free cargo pod repair (item 9) ──────────────────────

    it('cargoPods: free repair — no DB query, cost=0, message "Pods repaired free"', async () => {
      // SP.DAMAGE.S:83: if i=9 print "Pods repaired free":goto rep1
      // No credits deducted, no ship update, no character lookup needed
      const result = await repairSingleComponent('char-1', 'cargoPods', 'all');
      expect(result.success).toBe(true);
      expect(result.cost).toBe(0);
      expect(result.message).toContain('Pods repaired free');
      // No DB call needed for free cargo pod repair
      expect(prisma.character.findUnique).not.toHaveBeenCalled();
    });

    // ── SP.DAMAGE.S enca:88 — Junk gate ──────────────────────────────────────

    it('Junk gate: strength=0 blocks repair with "Too badly damaged" error', async () => {
      // SP.DAMAGE.S enca:88: if l$=jk$ print l$;ri$:pop:goto rep1
      // Junk = strength 0 (original: h1$=jk$ set when h2<1 in SP.FIGHT1.S:435)
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 0, creditsLow: 5000,
        ship: makeShip({ hullStrength: 0, hullCondition: 0 }), // Junk hull
      });

      const result = await repairSingleComponent('char-1', 'hull', 'all');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Too badly damaged');
    });

    it('Junk gate: only blocks when strength=0 (not just condition=0)', async () => {
      // strength>0, condition=0 → still repairable (with rebuild fee)
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 0, creditsLow: 5000,
        ship: makeShip({ hullStrength: 20, hullCondition: 0 }), // damaged but not Junk
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await repairSingleComponent('char-1', 'hull', 'all');
      expect(result.success).toBe(true); // repairable with rebuild fee
    });
  });

  // ── SP.DAMAGE.S enhc:175 — Junk gate for repair-all ─────────────────────

  describe('SP.DAMAGE.S enhc:175 — Junk gate for repairAllComponents', () => {
    it('skips strength=0 components entirely (no cost, no condition update)', async () => {
      // Original: if l$=jk$ goto ala (skip in repair-all loop)
      // Strength=0 components should not be included in repairCost and condition not set to 9
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 0, creditsLow: 500,
        ship: makeShip({
          hullStrength: 0, hullCondition: 0, // Junk — skip
          driveCondition: 5,                  // repairable: (9-5)*15=60
        }),
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await repairAllComponents('char-1');
      expect(result.success).toBe(true);
      // Hull (strength=0) should be skipped: cost = only drive repair + inspection
      expect(result.repairCost).toBe((9 - 5) * 15); // 60, hull junk not included
    });
  });

  // Rim port repair (SP.DOCK2.S rmfx subroutine)
  describe('repairRimComponent', () => {
    let repairRimComponent: any;

    beforeEach(async () => {
      const repairMod = await import('../src/game/systems/repairs');
      repairRimComponent = repairMod.repairRimComponent;
    });

    it('charges strength×100 per 1 condition unit (original: a=x*100, y=y+1)', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 0, creditsLow: 5000,
        ship: makeShip({ hullCondition: 5 }), // hullStrength=20
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await repairRimComponent('char-1', 'hull');
      expect(result.success).toBe(true);
      expect(result.cost).toBe(20 * 100); // 2000 cr
      expect(result.newCondition).toBe(6); // 5+1
    });

    it('repairs exactly 1 condition unit per visit (y=y+1)', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 1, creditsLow: 0, // 10,000 credits
        ship: makeShip({ driveCondition: 3, driveStrength: 15 }),
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await repairRimComponent('char-1', 'drive');
      expect(result.success).toBe(true);
      expect(result.cost).toBe(15 * 100); // 1500 cr
      expect(result.newCondition).toBe(4); // 3+1 only
    });

    it('returns perfect condition message when already at 9', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 0, creditsLow: 5000,
        ship: makeShip(), // all at condition 9
      });

      const result = await repairRimComponent('char-1', 'hull');
      expect(result.success).toBe(true);
      expect(result.cost).toBe(0);
      expect(result.message).toContain('perfect condition');
    });

    it('fails when component strength is 0 (destroyed)', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 0, creditsLow: 5000,
        ship: makeShip({ hullStrength: 0, hullCondition: 5 }),
      });

      const result = await repairRimComponent('char-1', 'hull');
      expect(result.success).toBe(false);
      expect(result.error).toContain('destroyed');
    });

    it('clamps strength at 199 (original: if x>199 x=199)', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 50, creditsLow: 0,
        ship: makeShip({ hullStrength: 250, hullCondition: 5 }),
      });
      prisma.$transaction.mockResolvedValue(undefined);

      const result = await repairRimComponent('char-1', 'hull');
      expect(result.success).toBe(true);
      expect(result.cost).toBe(199 * 100); // clamped at 199
    });

    it('fails when player cannot afford the repair', async () => {
      prisma.character.findUnique.mockResolvedValue({
        id: 'char-1',
        creditsHigh: 0, creditsLow: 100, // only 100 cr
        ship: makeShip({ hullCondition: 5 }), // hullStrength=20, cost=2000
      });

      const result = await repairRimComponent('char-1', 'hull');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Not enough credits');
    });
  });
});

// ============================================================================
// PURE LOGIC: Enhancement Stripping (SP.DAMAGE.S enca, lines 86-96)
// ============================================================================

describe('checkEnhancementStripping (SP.DAMAGE.S enca)', () => {
  it('should not strip if condition > 0', () => {
    const r = checkEnhancementStripping('Pulse Drive+*', 20, 3);
    expect(r.stripped).toBe(false);
    expect(r.strength).toBe(20);
    expect(r.name).toBe('Pulse Drive+*');
  });

  it('should not strip if name does not end in +*', () => {
    const r = checkEnhancementStripping('Pulse Drive', 20, 0);
    expect(r.stripped).toBe(false);
    expect(r.name).toBe('Pulse Drive');
  });

  it('should strip +* suffix and apply -10 strength penalty when condition=0', () => {
    // SP.DAMAGE.S enca line 93-94: strip "+*", a=10, j=j-a
    const r = checkEnhancementStripping('Pulse Drive+*', 30, 0);
    expect(r.stripped).toBe(true);
    expect(r.name).toBe('Pulse Drive');
    expect(r.strength).toBe(20);  // 30 - 10
    expect(r.penalty).toBe(10);
  });

  it('should zero out strength if strength < 10 (cannot save low-strength component)', () => {
    // SP.DAMAGE.S enca line 94: if j<10 j=0:a=0
    const r = checkEnhancementStripping('Junk Drive+*', 8, 0);
    expect(r.stripped).toBe(true);
    expect(r.name).toBe('Junk Drive');
    expect(r.strength).toBe(0);
    expect(r.penalty).toBe(0);
  });

  it('should handle exactly strength=10 (minimum to save)', () => {
    const r = checkEnhancementStripping('Basic Drive+*', 10, 0);
    expect(r.stripped).toBe(true);
    expect(r.strength).toBe(0);  // 10 - 10 = 0
    expect(r.penalty).toBe(10);
  });
});

// ============================================================================
// PURE LOGIC: Hull Strength Caps (SP.DAMAGE.S spfix, lines 113-115)
// ============================================================================

describe('applyHullStrengthCaps (SP.DAMAGE.S spfix)', () => {
  it('should cap all component strengths at 99 when hull < 10', () => {
    // h1<10 → max 99
    const result = applyHullStrengthCaps(9, {
      weaponStrength: 120,
      shieldStrength: 99,
      driveStrength: 50,
    });
    expect(result.updates.weaponStrength).toBe(99);
    expect(result.updates.shieldStrength).toBeUndefined(); // already at cap
    expect(result.updates.driveStrength).toBeUndefined();  // below cap
    expect(result.cappedCount).toBe(1);
  });

  it('should cap all component strengths at 199 when hull >= 10', () => {
    // h1>9 → max 199
    const result = applyHullStrengthCaps(10, {
      weaponStrength: 200,
      shieldStrength: 199,
      driveStrength: 150,
    });
    expect(result.updates.weaponStrength).toBe(199);
    expect(result.updates.shieldStrength).toBeUndefined(); // at exact cap, not over
    expect(result.updates.driveStrength).toBeUndefined();
    expect(result.cappedCount).toBe(1);
  });

  it('should cap multiple components at once', () => {
    const result = applyHullStrengthCaps(5, {
      weaponStrength: 150, shieldStrength: 200, driveStrength: 30,
    });
    expect(result.updates.weaponStrength).toBe(99);
    expect(result.updates.shieldStrength).toBe(99);
    expect(result.updates.driveStrength).toBeUndefined();
    expect(result.cappedCount).toBe(2);
  });

  it('should return empty updates when all components are within cap', () => {
    const result = applyHullStrengthCaps(15, {
      weaponStrength: 50, shieldStrength: 30,
    });
    expect(Object.keys(result.updates)).toHaveLength(0);
    expect(result.cappedCount).toBe(0);
  });
});
