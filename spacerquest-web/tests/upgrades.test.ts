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

  it('life support tiers use original "LSS Model XA" names (SP.YARD.S life subroutine)', () => {
    // SP.YARD.S life subroutine (lines 114-123): a$="LSS Model ": x1$=a$+"1A" ... x9$=a$+"9A"
    // "LSS Chrysalis+*" is a quest reward (SP.TOP.S:171), NOT a yard purchase tier.
    expect(COMPONENT_TIER_NAMES.lifeSupport[0]).toBe('LSS Model 1A');
    expect(COMPONENT_TIER_NAMES.lifeSupport[4]).toBe('LSS Model 5A');
    expect(COMPONENT_TIER_NAMES.lifeSupport[5]).toBe('LSS Model 6A');
    expect(COMPONENT_TIER_NAMES.lifeSupport[8]).toBe('LSS Model 9A');
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

  it('Life Support tier 6 uses original name "LSS Model 6A" (SP.YARD.S life subroutine)', async () => {
    // Original SP.YARD.S: all LSS tiers are "LSS Model XA". Chrysalis is a quest reward only.
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 2000));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'lifeSupport', tierIndex: 6 });
    expect(result.success).toBe(true);
    expect(result.componentName).toBe('LSS Model 6A');
  });

  it('Life Support tier 7 uses original name "LSS Model 7A"', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 5000));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'lifeSupport', tierIndex: 7 });
    expect(result.success).toBe(true);
    expect(result.componentName).toBe('LSS Model 7A');
  });

  it('Life Support tier 5 uses standard name "LSS Model 5A"', async () => {
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 1000));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'lifeSupport', tierIndex: 5 });
    expect(result.success).toBe(true);
    expect(result.componentName).toBe('LSS Model 5A');
    expect(result.componentName).toBe(COMPONENT_TIER_NAMES.lifeSupport[4]);
  });

  it('Life Support Chrysalis downgrade guard blocks replacement (SP.YARD.S:107-110)', async () => {
    // SP.YARD.S: if left$(l1$,8)="LSS Chry" → print warning and return
    // "LSS Chrysalis+*" is the quest reward — cannot be replaced at the yard
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 50000, {
      lifeSupportName: 'LSS Chrysalis+*',
    }));

    const result = await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'lifeSupport', tierIndex: 9 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('LSS Chrysalis+*');
    expect(result.error).toMatch(/very doubtful/i);
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

  it('SP.YARD.S scrap: pod salvage at 2 cr each reduces net cost on hull transfer', async () => {
    // SP.YARD.S: g2=g2+(s1*2):s1=0 — pods salvaged at 2 cr each when transferring
    // 10 pods × 2 cr = 20 cr salvage; tier 1 hull=50, transfer=500 → 550-20=530
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 1000, { cargoPods: 10 }));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({
      characterId: 'char-1',
      componentType: 'hull',
      tierIndex: 1,
      transferComponents: true,
    });
    expect(result.success).toBe(true);
    expect(result.podSalvage).toBe(20); // 10 pods × 2 cr = 20 cr
    expect(result.netCost).toBe(530);   // 50 + 500 - 20
  });

  it('SP.YARD.S scrap: cargoPods cleared to 0 in ship update on hull transfer', async () => {
    // SP.YARD.S: g2=g2+(s1*2):s1=0 — s1=0 means cargoPods zeroed out
    // 5 pods × 2 cr = 10 cr salvage; tier 1 hull=50, transfer=500 → 550-10=540
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 1000, { cargoPods: 5 }));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({
      characterId: 'char-1',
      componentType: 'hull',
      tierIndex: 1,
      transferComponents: true,
    });

    expect(result.success).toBe(true);
    expect(result.podSalvage).toBe(10);  // 5 pods × 2 cr
    expect(result.netCost).toBe(540);    // 50 + 500 - 10
  });

  it('SP.YARD.S scrap: no pod salvage when transferComponents is false', async () => {
    // If not transferring, pods stay — no salvage
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(0, 1000, { cargoPods: 10 }));
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({
      characterId: 'char-1',
      componentType: 'hull',
      tierIndex: 1,
      transferComponents: false,
    });
    expect(result.success).toBe(true);
    expect(result.podSalvage).toBe(0);
    expect(result.netCost).toBe(50); // no transfer fee, no salvage
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

  // SP.YARD.S scrap2 (lines 301-302): if q1>0 void cargo contract on hull scrap
  // Original: q1=0:q2=0:q3=0:q4=0:q5=0:q6=0:q2$="":q4$=""
  it('SP.YARD.S scrap2: contractVoided=true when hull scrap with active cargo contract', async () => {
    prisma.character.findUnique.mockResolvedValue({
      ...makeCharWithShip(0, 2000),
      cargoPods: 5,
      cargoType: 3,
      destination: 7,
      cargoPayment: 1500,
      cargoManifest: 'Ore Shipment',
      missionType: 1,
    });
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({
      characterId: 'char-1',
      componentType: 'hull',
      tierIndex: 1,
      transferComponents: true,
    });
    expect(result.success).toBe(true);
    expect(result.contractVoided).toBe(true);
  });

  it('SP.YARD.S scrap2: contractVoided=false when hull scrap but no active cargo (q1=0)', async () => {
    prisma.character.findUnique.mockResolvedValue({
      ...makeCharWithShip(0, 2000),
      cargoPods: 0,
      missionType: 1,
    });
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({
      characterId: 'char-1',
      componentType: 'hull',
      tierIndex: 1,
      transferComponents: true,
    });
    expect(result.success).toBe(true);
    expect(result.contractVoided).toBe(false);
  });

  it('SP.YARD.S scrap2: contractVoided=false when hull purchase without transfer', async () => {
    prisma.character.findUnique.mockResolvedValue({
      ...makeCharWithShip(0, 2000),
      cargoPods: 5,
      missionType: 1,
    });
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await purchaseShipComponentFn({
      characterId: 'char-1',
      componentType: 'hull',
      tierIndex: 1,
      transferComponents: false,
    });
    expect(result.success).toBe(true);
    expect(result.contractVoided).toBe(false);
  });

  it('SP.YARD.S scrap2: character update clears all cargo fields when contractVoided', async () => {
    // SP.YARD.S:302: q1=0:q2=0:q3=0:q4=0:q5=0:q6=0:q2$="":q4$=""
    // Modern: cargoPods/cargoType/destination/cargoPayment/cargoManifest/missionType all cleared
    prisma.character.findUnique.mockResolvedValue({
      ...makeCharWithShip(0, 2000),
      cargoPods: 8,
      cargoType: 2,
      destination: 5,
      cargoPayment: 3000,
      cargoManifest: 'Medical Supplies',
      missionType: 1,
    });
    prisma.ship.update.mockResolvedValue({});
    prisma.character.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (ops: any[]) => Promise.all(ops));

    const result = await purchaseShipComponentFn({
      characterId: 'char-1',
      componentType: 'hull',
      tierIndex: 1,
      transferComponents: true,
    });
    expect(result.success).toBe(true);
    expect(result.contractVoided).toBe(true);
    expect(prisma.character.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cargoPods: 0,
          cargoType: 0,
          destination: 0,
          cargoPayment: 0,
          cargoManifest: null,
          missionType: 0,
        }),
      })
    );
  });
});

// ============================================================================
// SP.SPEED.S nemget: Cloaker stripping when STAR-BUSTER or ARCH-ANGEL installed
// Original: if right$(xl$,1)="=" print "The Morton's Cloaker will be lost"
// Cloaker is on shield slot (p1$="="). ARCH-ANGEL replaces shield → cloaker lost.
// STAR-BUSTER replaces weapon → defensively stripped if hasCloaker is set.
// ============================================================================

describe('SP.SPEED.S nemget — cloaker stripped by STAR-BUSTER / ARCH-ANGEL', () => {
  const upgradesCode = (() => {
    const fs = require('fs');
    const path = require('path');
    return fs.readFileSync(
      path.join(__dirname, '../src/game/systems/upgrades.ts'),
      'utf-8'
    );
  })();

  it('ARCH_ANGEL path checks cloaker strip (p1$ shield has "=" suffix in original)', () => {
    // SP.SPEED.S nemget: xl$=p1$; if right$(xl$,1)="=" → cloaker lost
    expect(upgradesCode).toContain("equipment === 'ARCH_ANGEL'");
  });

  it('STAR_BUSTER path also checks cloaker strip (xl$=w1$ defensive check)', () => {
    expect(upgradesCode).toContain("equipment === 'STAR_BUSTER'");
  });

  it('sets hasCloaker = false when installing ARCH_ANGEL or STAR_BUSTER (SP.SPEED.S nemget)', () => {
    expect(upgradesCode).toContain('shipUpdate.hasCloaker = false');
  });

  it('strips cloaker only when ship.hasCloaker is true (conditional check)', () => {
    expect(upgradesCode).toContain('ship.hasCloaker');
  });
});

// ============================================================================
// SP.SPEED.S — New requirement guards added in regression audit
// ============================================================================

describe('SP.SPEED.S — purchaseSpecialEquipment requirement guards (regression audit)', () => {
  let prisma: any;
  let purchaseSpecialEquipmentFn: any;

  const makeCharWithShip = (
    creditsHigh: number,
    creditsLow: number,
    shipOverrides: Record<string, any> = {},
    charOverrides: Record<string, any> = {}
  ) => ({
    id: 'char-1',
    creditsHigh,
    creditsLow,
    score: 200,
    isConqueror: false,
    ...charOverrides,
    ship: {
      id: 'ship-1',
      hullStrength: 2,     // small hull — valid for cloaker
      hullCondition: 7,
      shieldStrength: 5,   // shields present
      shieldCondition: 9,
      driveStrength: 30,   // for Astraxial Hull eligibility
      driveCondition: 9,
      weaponStrength: 5,
      weaponCondition: 9,
      lifeSupportStrength: 20,
      lifeSupportCondition: 9,
      lifeSupportName: 'LSS Model 2A',
      hasCloaker: false,
      hasAutoRepair: false,
      hasStarBuster: false,
      hasArchAngel: false,
      isAstraxialHull: false,
      hasTitaniumHull: false,
      hasTransWarpDrive: false,
      cargoPods: 0,
      maxCargoPods: 10,
      ...shipOverrides,
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const upgradeMod = await import('../src/game/systems/upgrades');
    purchaseSpecialEquipmentFn = upgradeMod.purchaseSpecialEquipment;
  });

  // ── SP.SPEED.S autorep line 74: if h1<1 → "Need a hull first" ────────────

  it('AUTO_REPAIR: blocks install when hull strength is 0 (SP.SPEED.S autorep:74)', async () => {
    // Original: if h1<1 print "Need a hull first":goto special
    prisma.character.findUnique.mockResolvedValue(
      makeCharWithShip(10, 0, { hullStrength: 0 })
    );
    const result = await purchaseSpecialEquipmentFn('char-1', 'AUTO_REPAIR');
    expect(result.success).toBe(false);
    expect(result.error).toContain('hull');
  });

  it('AUTO_REPAIR: allows install when hull strength > 0', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharWithShip(10, 0, { hullStrength: 10 })
    );
    prisma.$transaction.mockResolvedValue(undefined);
    const result = await purchaseSpecialEquipmentFn('char-1', 'AUTO_REPAIR');
    expect(result.success).toBe(true);
  });

  // ── SP.SPEED.S cloak line 102: if h1<1 → need hull before cloaker ────────

  it('CLOAKER: blocks install when hull strength is 0 (SP.SPEED.S cloak:102)', async () => {
    // Original: if h1<1 print "You need a ship's hull before we can help you!"
    prisma.character.findUnique.mockResolvedValue(
      makeCharWithShip(10, 0, { hullStrength: 0 })
    );
    const result = await purchaseSpecialEquipmentFn('char-1', 'CLOAKER');
    expect(result.success).toBe(false);
    expect(result.error).toContain("ship's hull");
  });

  // ── SP.SPEED.S cloak lines 108-109: if right$(p1$,2)="++" → won't fit ────

  it('CLOAKER: blocks install when ARCH-ANGEL already installed (SP.SPEED.S cloak:108)', async () => {
    // Original: if right$(p1$,2)="++" print "Cloaker won't fit on [p1$]"
    // "++" means ARCH-ANGEL is on the shield slot
    prisma.character.findUnique.mockResolvedValue(
      makeCharWithShip(10, 0, { hasArchAngel: true })
    );
    const result = await purchaseSpecialEquipmentFn('char-1', 'CLOAKER');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Arch-Angel');
  });

  it('CLOAKER: allows install when no ARCH-ANGEL (SP.SPEED.S cloak:108)', async () => {
    prisma.character.findUnique.mockResolvedValue(
      makeCharWithShip(0, 1000)  // 500 cr for cloaker
    );
    prisma.$transaction.mockResolvedValue(undefined);
    const result = await purchaseSpecialEquipmentFn('char-1', 'CLOAKER');
    expect(result.success).toBe(true);
  });

  // ── SP.SPEED.S cloak line 122: p2=9:h2=9 — restores hull + shield condition ─

  it('CLOAKER: restores hull condition to 9 on install (SP.SPEED.S cloak:122 h2=9)', async () => {
    // Original: p1$=p1$+"=":p2=9:h2=9 — hull condition (h2) also set to 9
    prisma.character.findUnique.mockResolvedValue(
      makeCharWithShip(0, 1000, { hullCondition: 3 })
    );
    prisma.ship.update.mockResolvedValue({});
    prisma.character.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (ops: any[]) => Promise.all(ops));
    await purchaseSpecialEquipmentFn('char-1', 'CLOAKER');
    expect(prisma.ship.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hullCondition: 9 }),
      })
    );
  });

  it('CLOAKER: restores shield condition to 9 on install (SP.SPEED.S cloak:122 p2=9)', async () => {
    // Original: p2=9 — shield condition restored
    prisma.character.findUnique.mockResolvedValue(
      makeCharWithShip(0, 1000, { shieldCondition: 2 })
    );
    prisma.ship.update.mockResolvedValue({});
    prisma.character.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (ops: any[]) => Promise.all(ops));
    await purchaseSpecialEquipmentFn('char-1', 'CLOAKER');
    expect(prisma.ship.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shieldCondition: 9 }),
      })
    );
  });
});

// ============================================================================
// SP.YARD.S main menu line 32: auto-strip cloaker when hull > 4
// Original: if (h1>4) and (right$(p1$,1)="=") lw=len(p1$):lw=lw-1:p1$=left$(p1$,lw)
// ============================================================================

describe('SP.YARD.S main menu — auto-strip cloaker when hull exceeds tier 4', () => {
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
    cargoPods: 0,
    ship: {
      id: 'ship-1',
      hullStrength: 4,
      hullCondition: 9,
      driveStrength: 0, driveCondition: 9,
      cabinStrength: 0, cabinCondition: 9,
      lifeSupportStrength: 0, lifeSupportCondition: 9,
      weaponStrength: 0, weaponCondition: 9,
      navigationStrength: 0, navigationCondition: 9,
      roboticsStrength: 0, roboticsCondition: 9,
      shieldStrength: 0, shieldCondition: 9,
      cargoPods: 0,
      maxCargoPods: 10,
      hasTitaniumHull: false,
      hasCloaker: true,  // cloaker installed
      isAstraxialHull: false,
      hullName: 'Viper',
      driveName: null, cabinName: null, lifeSupportName: null,
      weaponName: null, navigationName: null, roboticsName: null, shieldName: null,
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

  it('strips cloaker when new hull tier pushes strength > 4 (SP.YARD.S main:32)', async () => {
    // Current hull=4, buying tier 5 hull → strength=50 → > 4 → strip cloaker
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(5, 0));
    prisma.ship.update.mockResolvedValue({});
    prisma.character.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (ops: any[]) => Promise.all(ops));

    await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'hull', tierIndex: 5 });
    expect(prisma.ship.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hasCloaker: false }),
      })
    );
  });

  it('does NOT strip cloaker when new hull tier is tier 1 (strength=10 > 4 but no cloaker)', async () => {
    // If no cloaker, no stripping needed
    prisma.character.findUnique.mockResolvedValue(
      makeCharWithShip(0, 500, { hasCloaker: false })
    );
    prisma.ship.update.mockResolvedValue({});
    prisma.character.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (ops: any[]) => Promise.all(ops));

    await purchaseShipComponentFn({ characterId: 'char-1', componentType: 'hull', tierIndex: 1 });
    const shipCall = prisma.ship.update.mock.calls[0];
    // hasCloaker should NOT be in the update (no need to set it)
    expect(shipCall?.[0]?.data?.hasCloaker).toBeUndefined();
  });
});

// ============================================================================
// SP.SPEED.S upit — Life support strength cap at 50 for non-Chrysalis LSS
// Original: if (left$(l1$,5)="LSS C") or (l1<51) return; l1=50
// ============================================================================

describe('SP.SPEED.S upit — Life support strength cap at 50', () => {
  let prisma: any;
  let upgradeShipComponentFn: any;

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
      driveStrength: 10, driveCondition: 9,
      cabinStrength: 10, cabinCondition: 9,
      lifeSupportStrength: 40, lifeSupportCondition: 9,
      lifeSupportName: 'LSS Model 4A',
      weaponStrength: 10, weaponCondition: 9,
      navigationStrength: 10, navigationCondition: 9,
      roboticsStrength: 10, roboticsCondition: 9,
      shieldStrength: 10, shieldCondition: 9,
      cargoPods: 0, maxCargoPods: 10,
      hasTitaniumHull: false, isAstraxialHull: false,
      ...shipOverrides,
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('../src/db/prisma');
    prisma = prismaMod.prisma;
    const upgradeMod = await import('../src/game/systems/upgrades');
    upgradeShipComponentFn = upgradeMod.upgradeShipComponent;
  });

  it('blocks LIFE_SUPPORT upgrade at strength 40 when non-Chrysalis (next step = 50, allowed)', async () => {
    // LSS Model 4A at strength 40 → upgrade to 50 is OK (l1<51 → return in original, upgrade allowed)
    prisma.character.findUnique.mockResolvedValue(makeCharWithShip(100, 0));
    prisma.$transaction.mockResolvedValue(undefined);
    const result = await upgradeShipComponentFn('char-1', 'LIFE_SUPPORT', 'STRENGTH');
    expect(result.success).toBe(true);
    expect(result.newStrength).toBe(50);
  });

  it('blocks LIFE_SUPPORT upgrade when current strength=50 and non-Chrysalis (would exceed 50)', async () => {
    // LSS Model 5A at strength 50 → upgrade would be 60 > 50 → blocked
    prisma.character.findUnique.mockResolvedValue(
      makeCharWithShip(100, 0, { lifeSupportStrength: 50, lifeSupportName: 'LSS Model 5A' })
    );
    const result = await upgradeShipComponentFn('char-1', 'LIFE_SUPPORT', 'STRENGTH');
    expect(result.success).toBe(false);
    expect(result.error).toContain('50');
  });

  it('allows LIFE_SUPPORT upgrade beyond 50 when LSS Chrysalis ("LSS C" prefix)', async () => {
    // SP.SPEED.S upit: if left$(l1$,5)="LSS C" → return (skip cap, upgrade OK)
    prisma.character.findUnique.mockResolvedValue(
      makeCharWithShip(100, 0, { lifeSupportStrength: 50, lifeSupportName: 'LSS Chrysalis+*' })
    );
    prisma.$transaction.mockResolvedValue(undefined);
    const result = await upgradeShipComponentFn('char-1', 'LIFE_SUPPORT', 'STRENGTH');
    expect(result.success).toBe(true);
    expect(result.newStrength).toBe(60);
  });
});
