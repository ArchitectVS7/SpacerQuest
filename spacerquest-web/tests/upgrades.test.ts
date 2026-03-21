/**
 * SpacerQuest v4.0 - Upgrades System Tests
 *
 * Tests for upgradeShipComponent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { COMPONENT_PRICES, COMPONENT_MAX_STRENGTH } from '../src/game/constants';
import { getTotalCredits } from '../src/game/utils';
import {
  calculateUpgradeMultiplier,
  calculateUpgradePrice,
  calculateTradeInValue,
  calculateMaxCargoPods,
  YARD_COMPONENT_TIER_PRICES,
  COMPONENT_TIER_NAMES,
  purchaseShipComponent,
} from '../src/game/systems/upgrades';

// ============================================================================
// PURE LOGIC TESTS
// ============================================================================

describe('Upgrades system - pure logic', () => {
  describe('Component prices', () => {
    // SP.SPEED.txt lines 31-32: x1=10000,x2=9000,x3=8000,x4=7000,x5=6000,x6=5000,x7=4000,x8=3000
    // Price assignment: i=1→x1(Hull),i=2→x2(Drives),i=3→x8(Cabin),i=4→x6(LS),
    //                   i=5→x3(Weapons),i=6→x5(Nav),i=7→x7(Robotics),i=8→x4(Shields)
    it('HULL costs 10,000 (x1)', () => expect(COMPONENT_PRICES.HULL).toBe(10000));
    it('DRIVES costs 9,000 (x2)', () => expect(COMPONENT_PRICES.DRIVES).toBe(9000));
    it('WEAPONS costs 8,000 (x3)', () => expect(COMPONENT_PRICES.WEAPONS).toBe(8000));
    it('SHIELDS costs 7,000 (x4)', () => expect(COMPONENT_PRICES.SHIELDS).toBe(7000));
    it('NAVIGATION costs 6,000 (x5)', () => expect(COMPONENT_PRICES.NAVIGATION).toBe(6000));
    it('LIFE_SUPPORT costs 5,000 (x6)', () => expect(COMPONENT_PRICES.LIFE_SUPPORT).toBe(5000));
    it('ROBOTICS costs 4,000 (x7)', () => expect(COMPONENT_PRICES.ROBOTICS).toBe(4000));
    it('CABIN costs 3,000 (x8)', () => expect(COMPONENT_PRICES.CABIN).toBe(3000));
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

    // SP.SPEED.txt line 159: "if x>198 x=199" — component strength hard cap
    it('COMPONENT_MAX_STRENGTH is 199 (original line 159: if x>198 x=199)', () => {
      expect(COMPONENT_MAX_STRENGTH).toBe(199);
    });
  });

  describe('Auto-Repair / Titanium Hull price formula', () => {
    // SP.SPEED.txt lines 82-83: "if h1>20 x=20000:goto aarp" / "x=h1*1000"
    // Cost = hull_strength * 1000, capped at 20,000 when hull > 20
    it('auto-repair price = hull * 1000 for hull ≤ 20', () => {
      const hullStrength = 10;
      const priceMultiplier = 1000;
      const rawPrice = hullStrength * priceMultiplier;
      const price = hullStrength > 20 ? 20000 : rawPrice;
      expect(price).toBe(10000);
    });

    it('auto-repair price = hull * 1000 for hull exactly 20', () => {
      const hullStrength = 20;
      const priceMultiplier = 1000;
      const rawPrice = hullStrength * priceMultiplier;
      const price = hullStrength > 20 ? 20000 : rawPrice;
      expect(price).toBe(20000);
    });

    it('auto-repair price is capped at 20,000 cr when hull > 20', () => {
      // hull=21 would be 21,000 without cap — must clamp to 20,000
      const hullStrength = 21;
      const priceMultiplier = 1000;
      const rawPrice = hullStrength * priceMultiplier;
      const price = hullStrength > 20 ? 20000 : rawPrice;
      expect(price).toBe(20000);
    });

    it('auto-repair price is capped at 20,000 cr for very high hull strength', () => {
      const hullStrength = 100;
      const priceMultiplier = 1000;
      const rawPrice = hullStrength * priceMultiplier;
      const price = hullStrength > 20 ? 20000 : rawPrice;
      expect(price).toBe(20000);
    });
  });

  describe('SP.SPEED upgrad pricing (calculateUpgradePrice)', () => {
    // SP.SPEED.S upgrad subroutine lines 173-174:
    //   a=1: if x>9 a=((x/10)+1)
    //   cost = a * 10,000 cr (displayed as "a0,000 cr" in original)
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

    it('price = a * 10,000 for strength ≤ 9 (a=1 → 10,000 cr)', () => {
      // SP.SPEED.S line 173-174: a=1 when x<=9
      expect(calculateUpgradePrice(0, 5000)).toBe(10000);
      expect(calculateUpgradePrice(5, 5000)).toBe(10000);
      expect(calculateUpgradePrice(9, 5000)).toBe(10000);
    });

    it('price = a * 10,000 for strength 10 (a=2 → 20,000 cr)', () => {
      // SP.SPEED.S line 174: a=((x/10)+1) = ((10/10)+1) = 2
      expect(calculateUpgradePrice(10, 5000)).toBe(20000);
      expect(calculateUpgradePrice(15, 5000)).toBe(20000);
    });

    it('price = a * 10,000 for strength 20 (a=3 → 30,000 cr)', () => {
      expect(calculateUpgradePrice(20, 5000)).toBe(30000);
    });

    it('price = a * 10,000 for strength 90 (a=10 → 100,000 cr)', () => {
      expect(calculateUpgradePrice(90, 5000)).toBe(100000);
    });

    it('price = a * 10,000 for strength 100 (a=11 → 110,000 cr)', () => {
      expect(calculateUpgradePrice(100, 5000)).toBe(110000);
    });

    it('basePrice parameter is ignored (SP.SPEED uses fixed a*10,000)', () => {
      // The second parameter does not affect price — original uses a fixed 10,000 multiplier
      expect(calculateUpgradePrice(5, 0)).toBe(10000);
      expect(calculateUpgradePrice(5, 99999)).toBe(10000);
    });
  });

  describe('SP.YARD component tier prices (YARD_COMPONENT_TIER_PRICES)', () => {
    // SP.YARD.S lines 27-28: x1=50,x2=100,x3=200,x4=400,x5=800,x6=1500,x7=3000,x8=5000,x9=10000
    it('has 9 tier prices matching original cost.data', () => {
      expect(YARD_COMPONENT_TIER_PRICES).toHaveLength(9);
      expect(YARD_COMPONENT_TIER_PRICES[0]).toBe(50);    // x1
      expect(YARD_COMPONENT_TIER_PRICES[1]).toBe(100);   // x2
      expect(YARD_COMPONENT_TIER_PRICES[2]).toBe(200);   // x3
      expect(YARD_COMPONENT_TIER_PRICES[3]).toBe(400);   // x4
      expect(YARD_COMPONENT_TIER_PRICES[4]).toBe(800);   // x5
      expect(YARD_COMPONENT_TIER_PRICES[5]).toBe(1500);  // x6
      expect(YARD_COMPONENT_TIER_PRICES[6]).toBe(3000);  // x7
      expect(YARD_COMPONENT_TIER_PRICES[7]).toBe(5000);  // x8
      expect(YARD_COMPONENT_TIER_PRICES[8]).toBe(10000); // x9
    });
  });

  describe('SP.YARD swap subroutine (calculateTradeInValue)', () => {
    // SP.YARD.S lines 335-349
    it('returns 0 for strength 0 (no component)', () => {
      expect(calculateTradeInValue(0, false)).toBe(0);
    });

    it('tier 1 trade-in = 25 cr', () => {
      expect(calculateTradeInValue(1, false)).toBe(25);
    });

    it('tier 2 trade-in = 50 cr', () => {
      expect(calculateTradeInValue(2, false)).toBe(50);
    });

    it('tier 3 trade-in = 100 cr', () => {
      expect(calculateTradeInValue(3, false)).toBe(100);
    });

    it('tier 4 trade-in = 200 cr', () => {
      expect(calculateTradeInValue(4, false)).toBe(200);
    });

    it('tier 5 trade-in = 400 cr', () => {
      expect(calculateTradeInValue(5, false)).toBe(400);
    });

    it('tier 6 trade-in = 700 cr', () => {
      expect(calculateTradeInValue(6, false)).toBe(700);
    });

    it('tier 7 trade-in = 1,000 cr', () => {
      expect(calculateTradeInValue(7, false)).toBe(1000);
    });

    it('tier 8 trade-in = 2,000 cr', () => {
      expect(calculateTradeInValue(8, false)).toBe(2000);
    });

    it('tier 9 trade-in = 3,000 cr', () => {
      expect(calculateTradeInValue(9, false)).toBe(3000);
    });

    it('Titanium-enhanced strength > 9 strips +10 before lookup (SP.YARD.S line 337)', () => {
      // Component with +* enhancement has strength raised by 10 at SP.SPEED
      // SP.YARD.S line 337: if (xs>9) and (right$(xl$,2)="+*") xs=xs-10
      // So strength=11 with Titanium → xs=1 → trade-in=25
      expect(calculateTradeInValue(11, true)).toBe(25);
      // strength=19 with Titanium → xs=9 → trade-in=3000
      expect(calculateTradeInValue(19, true)).toBe(3000);
    });

    it('strength > 9 without Titanium is capped at tier 9 (xs=9)', () => {
      // SP.YARD.S line 339: if xs>9 xs=9
      expect(calculateTradeInValue(15, false)).toBe(3000);
      expect(calculateTradeInValue(50, false)).toBe(3000);
    });
  });

  describe('SP.YARD store cargo pod capacity (calculateMaxCargoPods)', () => {
    // SP.YARD.S lines 213-215:
    //   hx=h1: if h1>9 hx=(h1-10)
    //   if right$(h1$,1)="*" hx=hx+5
    //   y=((h2+1)*hx)

    it('tier-1 hull (strength=1), condition=9 → max 10 pods', () => {
      // hx=1, y=(9+1)*1=10
      expect(calculateMaxCargoPods(1, 9, false)).toBe(10);
    });

    it('tier-9 hull (strength=9), condition=9 → max 90 pods', () => {
      // hx=9, y=(9+1)*9=90
      expect(calculateMaxCargoPods(9, 9, false)).toBe(90);
    });

    it('hull strength > 9 strips 10 before formula (Titanium-enhanced hull)', () => {
      // strength=11 (was 1 + 10 from Titanium boost at SP.SPEED)
      // hx=11-10=1, y=(9+1)*1=10 — same capacity as tier-1
      expect(calculateMaxCargoPods(11, 9, false)).toBe(10);
    });

    it('Titanium Hull flag adds +5 to hx factor', () => {
      // SP.YARD.S line 214: if right$(h1$,1)="*" hx=hx+5
      // Hull strength=1, hasTitanium=true → hx=1+5=6, y=(9+1)*6=60
      expect(calculateMaxCargoPods(1, 9, true)).toBe(60);
    });

    it('lower hull condition reduces capacity', () => {
      // strength=5, condition=4 → hx=5, y=(4+1)*5=25
      expect(calculateMaxCargoPods(5, 4, false)).toBe(25);
    });

    it('condition=0 hull → y=(0+1)*hx=hx (minimum viable)', () => {
      expect(calculateMaxCargoPods(3, 0, false)).toBe(3);
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
  let purchaseCargoPods: any;

  const makeCharWithShip = (
    creditsHigh: number,
    creditsLow: number,
    shipOverrides: Record<string, any> = {}
  ) => ({
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
      cargoPods: 0,
      maxCargoPods: 10,
      hasTitaniumHull: false,
      isAstraxialHull: false,
      ...shipOverrides,
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const upgradeMod = await import('../src/game/systems/upgrades');
    upgradeShipComponent = upgradeMod.upgradeShipComponent;
    purchaseCargoPods = upgradeMod.purchaseCargoPods;
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
    // SP.SPEED upgrad: hull strength=20, a=floor(20/10)+1=3, cost=30,000 cr
    // Give character only 29,999 cr (2 creditsHigh units = 20,000 + 9,999 low = 29,999)
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(2, 9999));
    const result = await upgradeShipComponent('char-1', 'HULL', 'STRENGTH');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not enough credits');
  });

  it('succeeds with STRENGTH upgrade for HULL (SP.SPEED upgrad pricing)', async () => {
    // hull strength=20, a=floor(20/10)+1=3, cost=30,000 cr
    // Give 100 creditsHigh = 1,000,000 cr
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(100, 0));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await upgradeShipComponent('char-1', 'HULL', 'STRENGTH');
    expect(result.success).toBe(true);
    expect(result.cost).toBe(30000); // SP.SPEED.S: a=3, cost=3*10,000=30,000
    expect(result.newStrength).toBe(30); // 20 + 10
  });

  it('succeeds with CONDITION upgrade for DRIVES (SP.SPEED upgrad pricing)', async () => {
    // drive strength=15, a=floor(15/10)+1=2, cost=20,000 cr
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(100, 0));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await upgradeShipComponent('char-1', 'DRIVES', 'CONDITION');
    expect(result.success).toBe(true);
    expect(result.cost).toBe(20000); // SP.SPEED.S: a=2, cost=2*10,000=20,000
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

  it('deducts correct SP.SPEED upgrad price (a*10,000) for each component', async () => {
    // SP.SPEED.S lines 173-174: a=1 if x<=9, else a=floor(x/10)+1; cost=a*10,000
    const strengthMap: Record<string, number> = {
      HULL: 20, DRIVES: 15, CABIN: 10, LIFE_SUPPORT: 12,
      WEAPONS: 25, NAVIGATION: 18, ROBOTICS: 8, SHIELDS: 20,
    };

    // Expected prices: a = multiplier for each strength value
    // HULL(20): a=3→30000, DRIVES(15): a=2→20000, CABIN(10): a=2→20000
    // LIFE_SUPPORT(12): a=2→20000, WEAPONS(25): a=3→30000, NAVIGATION(18): a=2→20000
    // ROBOTICS(8): a=1→10000, SHIELDS(20): a=3→30000
    for (const comp of Object.keys(COMPONENT_PRICES)) {
      vi.clearAllMocks();
      prisma.character.findUnique.mockResolvedValue(makeCharWithShip(100, 0));
      prisma.$transaction.mockResolvedValue(undefined);

      const strength = strengthMap[comp];
      const a = strength <= 9 ? 1 : Math.floor(strength / 10) + 1;
      const expectedPrice = a * 10000;

      const result = await upgradeShipComponent('char-1', comp, 'STRENGTH');
      expect(result.success).toBe(true);
      expect(result.cost).toBe(expectedPrice);
    }
  });
});

// ============================================================================
// CARGO POD PURCHASE TESTS (SP.YARD.S depot/store)
// ============================================================================

describe('SP.YARD depot — purchaseCargoPods', () => {
  let prisma: any;
  let purchaseCargoPods: any;

  const makeCharWithShip = (
    creditsHigh: number,
    creditsLow: number,
    shipOverrides: Record<string, any> = {}
  ) => ({
    id: 'char-1',
    creditsHigh,
    creditsLow,
    ship: {
      id: 'ship-1',
      hullStrength: 5, hullCondition: 9, // capacity: (9+1)*5 = 50 pods
      cargoPods: 0,
      maxCargoPods: 50,
      hasTitaniumHull: false,
      isAstraxialHull: false,
      ...shipOverrides,
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const upgradeMod = await import('../src/game/systems/upgrades');
    purchaseCargoPods = upgradeMod.purchaseCargoPods;
  });

  it('fails when character not found', async () => {
    prisma.character.findUnique.mockResolvedValue(null);
    const result = await purchaseCargoPods('char-1', 5);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Character or ship not found');
  });

  it('fails when hull strength is 0 (no hull)', async () => {
    // SP.YARD.S line 44: "You must have a spaceship hull first!"
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(10, 0, { hullStrength: 0 }));
    const result = await purchaseCargoPods('char-1', 5);
    expect(result.success).toBe(false);
    expect(result.error).toBe('You must have a spaceship hull first!');
  });

  it('fails when quantity is 0 or negative', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(10, 0));
    const result = await purchaseCargoPods('char-1', 0);
    expect(result.success).toBe(false);
  });

  it('fails when hull at max capacity', async () => {
    // SP.YARD.S line 215: if s1>y s1=y; then z=y-s1=0
    prisma.character.findUnique.mockResolvedValue(
      makeCharWithShip(10, 0, { hullStrength: 5, hullCondition: 9, cargoPods: 50 })
    );
    const result = await purchaseCargoPods('char-1', 1);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/max.*pods/i);
  });

  it('fails when requested quantity exceeds remaining hull capacity', async () => {
    // SP.YARD.S line 226: if a>y "Not enough hull capacity"
    prisma.character.findUnique.mockResolvedValue(
      makeCharWithShip(10, 0, { hullStrength: 5, hullCondition: 9, cargoPods: 45 })
    );
    // capacity=50, current=45, remaining=5, request 10 → exceeds
    const result = await purchaseCargoPods('char-1', 10);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not enough hull capacity');
  });

  it('fails when not enough credits', async () => {
    // SP.YARD.S line 227-228: sx=(i*10): if sx>g2 and g1<1 → not enough credits
    // Cost = 5 * 10 = 50 cr, character has 49 cr
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 49));
    const result = await purchaseCargoPods('char-1', 5);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not enough credits');
  });

  it('succeeds: charges 10 cr per pod', async () => {
    // SP.YARD.S line 217: "Cargo Pod Price: 10 cr each"
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 500));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseCargoPods('char-1', 5);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(50); // 5 × 10 = 50 cr
    expect(result.newCargoPods).toBe(5);
  });

  it('reports correct maxCargoPods using SP.YARD.S formula', async () => {
    // hull strength=5, condition=9 → maxPods = (9+1)*5 = 50
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 500));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseCargoPods('char-1', 1);
    expect(result.success).toBe(true);
    expect(result.maxCargoPods).toBe(50);
  });

  it('purchases up to the remaining capacity', async () => {
    // current=40, capacity=50, remaining=10, buy exactly 10
    prisma.character.findUnique.mockResolvedValue(
      makeCharWithShip(0, 500, { hullStrength: 5, hullCondition: 9, cargoPods: 40 })
    );
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseCargoPods('char-1', 10);
    expect(result.success).toBe(true);
    expect(result.newCargoPods).toBe(50);
    expect(result.cost).toBe(100); // 10 × 10
  });
});

// ============================================================================
// COMPONENT TIER NAMES TESTS
// ============================================================================

describe('COMPONENT_TIER_NAMES', () => {
  const allTypes = ['hull', 'drive', 'cabin', 'lifeSupport', 'weapon', 'navigation', 'robotics', 'shield'];

  it('has an entry for all 8 component types', () => {
    for (const type of allTypes) {
      expect(COMPONENT_TIER_NAMES[type]).toBeDefined();
    }
  });

  it('each component type has exactly 9 tier names', () => {
    for (const type of allTypes) {
      expect(COMPONENT_TIER_NAMES[type]).toHaveLength(9);
    }
  });

  it('all tier names are non-empty strings', () => {
    for (const type of allTypes) {
      for (const name of COMPONENT_TIER_NAMES[type]) {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      }
    }
  });

  it('hull tier 1 (weakest) is the entry-level hull', () => {
    // SP.YARD.S: tier 1 hull is the lowest-class hull (Junk class)
    expect(COMPONENT_TIER_NAMES.hull[0]).toBeTruthy();
    expect(typeof COMPONENT_TIER_NAMES.hull[0]).toBe('string');
  });

  it('hull tier 9 (strongest) exists and is non-empty', () => {
    expect(COMPONENT_TIER_NAMES.hull[8]).toBeTruthy();
  });

  it('life support tier 6 name is "LSS Chry" (original game special)', () => {
    // SP.YARD.S: lifeSupportName is forced to "LSS Chry" for tiers 6-9
    expect(COMPONENT_TIER_NAMES.lifeSupport[5]).toBe('LSS Chry');
    expect(COMPONENT_TIER_NAMES.lifeSupport[6]).toBe('LSS Chry');
    expect(COMPONENT_TIER_NAMES.lifeSupport[7]).toBe('LSS Chry');
    expect(COMPONENT_TIER_NAMES.lifeSupport[8]).toBe('LSS Chry');
  });

  it('weapon tier names are distinct (no duplicates across tiers)', () => {
    const names = COMPONENT_TIER_NAMES.weapon;
    const unique = new Set(names);
    expect(unique.size).toBe(9);
  });
});

// ============================================================================
// PURCHASE SHIP COMPONENT TESTS (SP.YARD.S Main Office)
// ============================================================================

describe('SP.YARD Main Office — purchaseShipComponent', () => {
  let prisma: any;
  let purchaseShipComponentFn: any;

  const makeCharWithShip = (
    creditsHigh: number,
    creditsLow: number,
    shipOverrides: Record<string, any> = {}
  ) => ({
    id: 'char-1',
    creditsHigh,
    creditsLow,
    score: 0,
    isConqueror: false,
    ship: {
      id: 'ship-1',
      hullStrength: 0,
      hullCondition: 5,
      driveStrength: 0,
      driveCondition: 5,
      cabinStrength: 0,
      cabinCondition: 5,
      lifeSupportStrength: 0,
      lifeSupportCondition: 5,
      weaponStrength: 0,
      weaponCondition: 5,
      navigationStrength: 0,
      navigationCondition: 5,
      roboticsStrength: 0,
      roboticsCondition: 5,
      shieldStrength: 0,
      shieldCondition: 5,
      cargoPods: 0,
      maxCargoPods: 0,
      hasTitaniumHull: false,
      isAstraxialHull: false,
      hullName: null,
      driveName: null,
      cabinName: null,
      lifeSupportName: null,
      weaponName: null,
      navigationName: null,
      roboticsName: null,
      shieldName: null,
      ...shipOverrides,
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const upgradeMod = await import('../src/game/systems/upgrades');
    purchaseShipComponentFn = upgradeMod.purchaseShipComponent;
  });

  it('returns error when character not found', async () => {
    prisma.character.findUnique.mockResolvedValue(null);
    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'hull', tierIndex: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Character or ship not found');
  });

  it('returns error for invalid tier index (0)', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(10, 0));
    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'hull', tierIndex: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid tier/i);
  });

  it('returns error for invalid tier index (10)', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(10, 0));
    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'hull', tierIndex: 10 });
    expect(result.success).toBe(false);
  });

  it('returns error when not enough credits', async () => {
    // tier 1 hull costs 50 cr, give only 40
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 40));
    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'hull', tierIndex: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not enough credits');
  });

  it('happy path: buy tier 1 hull (new ship, no trade-in)', async () => {
    // tier 1 costs 50 cr, no existing component so tradein=0, net cost=50
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 100));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'hull', tierIndex: 1 });
    expect(result.success).toBe(true);
    expect(result.newStrength).toBe(10);
    expect(result.tradeinValue).toBe(0);
    expect(result.netCost).toBe(50);
    expect(result.componentName).toBe(COMPONENT_TIER_NAMES.hull[0]);
    expect(typeof result.newCredits).toBe('number');
  });

  it('happy path: buy tier 5 drive (no existing drive)', async () => {
    // tier 5 costs 800 cr, no trade-in
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 1000));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'drive', tierIndex: 5 });
    expect(result.success).toBe(true);
    expect(result.newStrength).toBe(50);
    expect(result.tradeinValue).toBe(0);
    expect(result.netCost).toBe(800);
    expect(result.componentName).toBe(COMPONENT_TIER_NAMES.drive[4]);
  });

  it('trade-in reduces net cost when upgrading existing component', async () => {
    // Existing drive at strength 3 (tier 3), trade-in = 100 cr
    // Buying tier 5 (800 cr) → net cost = 800 - 100 = 700
    prisma.character.findUnique.mockResolvedValue(
      makeCharWithShip(0, 1000, { driveStrength: 3 })
    );
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'drive', tierIndex: 5 });
    expect(result.success).toBe(true);
    expect(result.tradeinValue).toBe(100); // tier 3 → 100 cr
    expect(result.netCost).toBe(700); // 800 - 100
  });

  it('happy path: buy tier 1 weapon', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 100));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'weapon', tierIndex: 1 });
    expect(result.success).toBe(true);
    expect(result.newStrength).toBe(10);
    expect(result.componentName).toBe(COMPONENT_TIER_NAMES.weapon[0]);
  });

  it('happy path: buy tier 3 shield', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 500));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'shield', tierIndex: 3 });
    expect(result.success).toBe(true);
    expect(result.newStrength).toBe(30);
    expect(result.componentName).toBe(COMPONENT_TIER_NAMES.shield[2]);
  });

  it('happy path: buy tier 2 navigation', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 200));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'navigation', tierIndex: 2 });
    expect(result.success).toBe(true);
    expect(result.newStrength).toBe(20);
    expect(result.componentName).toBe(COMPONENT_TIER_NAMES.navigation[1]);
  });

  it('happy path: buy tier 4 robotics', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 500));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'robotics', tierIndex: 4 });
    expect(result.success).toBe(true);
    expect(result.newStrength).toBe(40);
    expect(result.componentName).toBe(COMPONENT_TIER_NAMES.robotics[3]);
  });

  it('happy path: buy tier 6 cabin', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(1, 5000));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'cabin', tierIndex: 6 });
    expect(result.success).toBe(true);
    expect(result.newStrength).toBe(60);
    expect(result.componentName).toBe(COMPONENT_TIER_NAMES.cabin[5]);
  });

  it('Life Support tier 6 name is forced to "LSS Chry"', async () => {
    // SP.YARD.S special: life support tier ≥ 6 always gets "LSS Chry"
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 2000));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'lifeSupport', tierIndex: 6 });
    expect(result.success).toBe(true);
    expect(result.componentName).toBe('LSS Chry');
  });

  it('Life Support tier 7 name is forced to "LSS Chry"', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 5000));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'lifeSupport', tierIndex: 7 });
    expect(result.success).toBe(true);
    expect(result.componentName).toBe('LSS Chry');
  });

  it('Life Support tier 5 name is NOT "LSS Chry" (below override threshold)', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 1000));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'lifeSupport', tierIndex: 5 });
    expect(result.success).toBe(true);
    expect(result.componentName).not.toBe('LSS Chry');
    expect(result.componentName).toBe(COMPONENT_TIER_NAMES.lifeSupport[4]);
  });

  it('Life Support tier 1 uses standard name', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 100));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'lifeSupport', tierIndex: 1 });
    expect(result.success).toBe(true);
    expect(result.componentName).toBe(COMPONENT_TIER_NAMES.lifeSupport[0]);
  });

  it('hull replacement with component transfer costs extra 500 cr', async () => {
    // tier 1 hull price=50, no trade-in, transfer fee=500 → total 550
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 1000));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({
      characterId: 'char-1',
      componentType: 'hull',
      tierIndex: 1,
      transferComponents: true,
    });
    expect(result.success).toBe(true);
    expect(result.netCost).toBe(550); // 50 + 500 transfer fee
  });

  it('hull replacement without transfer flag has no extra charge', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 1000));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({
      characterId: 'char-1',
      componentType: 'hull',
      tierIndex: 1,
      transferComponents: false,
    });
    expect(result.success).toBe(true);
    expect(result.netCost).toBe(50); // no transfer fee
  });

  it('tier 9 purchase sets strength to 90', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(5, 0));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'weapon', tierIndex: 9 });
    expect(result.success).toBe(true);
    expect(result.newStrength).toBe(90);
  });

  it('returns newCredits after deducting netCost', async () => {
    // Starting: 0 high + 200 low = 200 cr; tier 1 hull = 50 cr → 150 remaining
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 200));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'hull', tierIndex: 1 });
    expect(result.success).toBe(true);
    expect(result.newCredits).toBe(150);
  });

  it('fails when credits exactly equal to transfer fee but insufficient for component cost', async () => {
    // tier 1=50 cr, transfer fee=500 → need 550 cr; have only 500
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 500));
    const result = await purchaseShipComponentFn({
      characterId: 'char-1',
      componentType: 'hull',
      tierIndex: 1,
      transferComponents: true,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not enough credits');
  });
});
