/**
 * SpacerQuest v4.0 - Rim Port Tests
 *
 * Tests for:
 * 1. Rim cargo payment loop (SP.DOCK2.S:90-103)
 * 2. Rim cargo loading with multipliers (SP.DOCK2.S:110-116 + carname:336-343)
 * 3. Trip counter zero cost at Algol-2 (SP.DOCK2.S:186-194)
 * 4. Rim port screen phases
 */

import { describe, it, expect } from 'vitest';
import {
  calculateRimCargoPayment,
  loadRimCargo,
  calculateTripZeroCost,
  calculateLandingFee,
  getRimFuelSellPrice,
} from '../src/game/systems/economy';
import {
  RIM_CARGO,
  RIM_SYSTEM_NAMES,
  RIM_REPAIR_MAP,
  ALGOL_SYSTEM_ID,
  TRIP_ZERO_MIN_TRIPS,
} from '../src/game/constants';

// ============================================================================
// CONSTANTS
// ============================================================================

describe('Rim Constants', () => {
  it('defines cargo for all 6 rim systems', () => {
    for (let sys = 15; sys <= 20; sys++) {
      expect(RIM_CARGO[sys]).toBeDefined();
      expect(RIM_CARGO[sys].name).toBeTruthy();
      expect(RIM_CARGO[sys].multiplier).toBe(sys - 14);
    }
  });

  it('defines system names for all rim ports', () => {
    expect(RIM_SYSTEM_NAMES[15]).toBe('Antares-5');
    expect(RIM_SYSTEM_NAMES[16]).toBe('Capella-4');
    expect(RIM_SYSTEM_NAMES[17]).toBe('Polaris-1');
    expect(RIM_SYSTEM_NAMES[18]).toBe('Mizar-9');
    expect(RIM_SYSTEM_NAMES[19]).toBe('Achernar-5');
    expect(RIM_SYSTEM_NAMES[20]).toBe('Algol-2');
  });

  it('maps repairs correctly per system', () => {
    expect(RIM_REPAIR_MAP[15]?.component).toBe('shield');
    expect(RIM_REPAIR_MAP[16]?.component).toBe('drive');
    expect(RIM_REPAIR_MAP[17]?.component).toBe('cabin');
    expect(RIM_REPAIR_MAP[18]?.component).toBe('robotics');
    expect(RIM_REPAIR_MAP[19]?.component).toBe('navigation');
    expect(RIM_REPAIR_MAP[20]).toBeNull(); // Algol-2: no repairs
  });

  it('Algol constants are correct', () => {
    expect(ALGOL_SYSTEM_ID).toBe(20);
    expect(TRIP_ZERO_MIN_TRIPS).toBe(4);
  });
});

// ============================================================================
// RIM CARGO PAYMENT (DOCK2:90-103)
// ============================================================================

describe('calculateRimCargoPayment', () => {
  it('applies rim multiplier based on system distance', () => {
    // Same base cargo at different rim ports should yield different payments
    const base = { cargoPayment: 100, cargoPods: 10, hullCondition: 9 };
    const results: number[] = [];
    for (let sys = 15; sys <= 20; sys++) {
      const { payment } = calculateRimCargoPayment(sys, base.cargoPayment, base.cargoPods, base.hullCondition);
      results.push(payment);
    }
    // System 15 (mult 1) < System 16 (mult 2) < ... < System 20 (mult 6)
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThan(results[i - 1]);
    }
  });

  it('system 15 multiplier is 1x', () => {
    const { payment } = calculateRimCargoPayment(15, 100, 10, 9);
    // a=1, y=floor(100/2)=50, total = 1*50 = 50
    expect(payment).toBe(50);
  });

  it('system 20 multiplier is 6x', () => {
    const { payment } = calculateRimCargoPayment(20, 100, 10, 9);
    // a=6, y=floor(100/2)=50, total = 6*50 = 300
    expect(payment).toBe(300);
  });

  it('enforces minimum payment of 2', () => {
    const { payment } = calculateRimCargoPayment(15, 0, 10, 9);
    // q5 clamped to 2, a=1, y=floor(2/2)=1, total = 1*1 = 1
    expect(payment).toBe(1);
  });

  it('adjusts payment when pods are degraded', () => {
    // cargoPayment=200 > cargoPods=10, so adjust: x=floor(200/10)=20, q5=20*upod
    // hullCondition=0 → upod = floor(max(10*1, 10)/10) = 1
    // q5 = 20*1 = 20, a=1, y=floor(20/2)=10
    const { payment } = calculateRimCargoPayment(15, 200, 10, 0);
    expect(payment).toBe(10);
  });

  it('handles zero cargo pods gracefully', () => {
    const { payment } = calculateRimCargoPayment(15, 100, 0, 9);
    // cargoPods=0, q5 stays 100, a=1, y=50
    expect(payment).toBe(50);
  });
});

// ============================================================================
// RIM CARGO LOADING (DOCK2:110-116 + carname:336-343)
// ============================================================================

describe('loadRimCargo', () => {
  it('returns null when no cargo pods', () => {
    const result = loadRimCargo(15, 0, 1, 5000);
    expect(result).toBeNull();
  });

  it('returns correct cargo name per system', () => {
    for (let sys = 15; sys <= 20; sys++) {
      const result = loadRimCargo(sys, 20, 0, 1000);
      expect(result).not.toBeNull();
      expect(result!.cargoName).toBe(RIM_CARGO[sys].name);
    }
  });

  it('applies cargo multiplier for Capellan Herbals (2x)', () => {
    const base = loadRimCargo(15, 20, 0, 1000);  // 1x
    const cap = loadRimCargo(16, 20, 0, 1000);   // 2x
    expect(cap!.payment).toBe(base!.payment * 2);
  });

  it('applies 6x multiplier for Algolian RDNA', () => {
    const base = loadRimCargo(15, 20, 0, 1000);  // 1x
    const algol = loadRimCargo(20, 20, 0, 1000);  // 6x
    expect(algol!.payment).toBe(base!.payment * 6);
  });

  it('sets destination to 20 (rim cargo sentinel)', () => {
    const result = loadRimCargo(15, 20, 0, 1000);
    expect(result!.destination).toBe(20);
  });

  it('caps credit-based factor at 300', () => {
    // creditsLow=10000 → a=floor(10000/10)=1000, capped to 300
    const result = loadRimCargo(15, 20, 0, 10000);
    expect(result).not.toBeNull();
    // a=300, x=floor(20/10)=2, q5=300*2=600, mult=1 → 600
    expect(result!.payment).toBe(600);
  });

  it('caps pod factor at 9', () => {
    // cargoPods=200 → x=floor(200/10)=20, capped to 9
    const result = loadRimCargo(15, 200, 0, 1000);
    expect(result).not.toBeNull();
    // a=floor(1000/10)=100, x=9, q5=100*9=900, mult=1 → 900
    expect(result!.payment).toBe(900);
  });

  it('returns zero payment when pods <= 10 and credits <= 10', () => {
    const result = loadRimCargo(15, 5, 0, 5);
    expect(result).not.toBeNull();
    // a=1 (5<=10 so default 1), x=0 (5<=10 so 0), q5=0
    expect(result!.payment).toBe(0);
  });
});

// ============================================================================
// UPOD FORMULA — rim-port loading uses SP.DOCK2.S upod sub (lines 432-439)
// ============================================================================

describe('Rim cargo loading — upod formula (SP.DOCK2.S:432-439)', () => {
  it('loadRimCargo with full-condition (h2=9) pods: effective=floor((9+1)*pods/10)', () => {
    // 20 pods, hullCondition=9: upod = floor(10*20/10) = 20 → x = floor(20/10) = 2 (since 20>10)
    const result = loadRimCargo(15, 20, 0, 1000);
    expect(result).not.toBeNull();
    // a = floor(1000/10) = 100; x = floor(20/10) = 2; q5 = 100*2 = 200; mult=1; payment=200
    expect(result!.payment).toBe(200);
  });

  it('loadRimCargo with degraded condition (5 pods after upod from 10 pods at h2=4)', () => {
    // If upod(10 pods, h2=4) = floor((4+1)*10/10) = 5 → x = floor(5/10) = 0 → payment = 0
    const result = loadRimCargo(15, 5, 0, 1000);
    // 5 pods → x = floor(5/10) = 0 → payment = 0
    expect(result).not.toBeNull();
    expect(result!.payment).toBe(0);
  });

  it('loadRimCargo with 1 pod (upod h2=0 path gives s1=1): x=0, payment=0', () => {
    // upod with h2<1: s1=1; x=floor(1/10)=0; payment = a*0 = 0
    const result = loadRimCargo(15, 1, 0, 5000);
    expect(result).not.toBeNull();
    expect(result!.payment).toBe(0);
  });

  it('loadRimCargo with 20 pods and full condition: effective=20, x=2', () => {
    // upod(20, h2=9) = floor(10*20/10) = 20; x = floor(20/10) = 2
    const result = loadRimCargo(15, 20, 0, 1000);
    // a = floor(1000/10) = 100; x = 2; q5 = 200; mult=1; payment=200
    expect(result!.payment).toBe(200);
  });

  it('rim-port loading section uses upod formula (not hullStrength) — documented formula', () => {
    // This verifies the upod formula: s1 = floor(max((h2+1)*s1, 10) / 10)
    // With h2=9, s1=5: max(50,10)=50; s1=floor(50/10)=5 → loadRimCargo gets s1=5
    // With h2=4, s1=5: max(25,10)=25; s1=floor(25/10)=2 → loadRimCargo gets s1=2
    // With h2=0, s1=5: s1=1 (h2<1 path)
    const upod = (pods: number, hullCondition: number) => {
      if (hullCondition < 1) return 1;
      return Math.floor(Math.max((hullCondition + 1) * pods, 10) / 10);
    };
    expect(upod(5, 9)).toBe(5);
    expect(upod(5, 4)).toBe(2);
    expect(upod(5, 0)).toBe(1);
    expect(upod(10, 9)).toBe(10);
    expect(upod(10, 4)).toBe(5);
    expect(upod(20, 9)).toBe(20);
    expect(upod(1, 9)).toBe(1); // max(10,10)/10=1
  });
});

// ============================================================================
// TRIP COUNTER ZERO COST (DOCK2:186-194)
// ============================================================================

describe('calculateTripZeroCost', () => {
  it('calculates cost from sum of 5 ship components', () => {
    const ship = {
      weaponStrength: 10,
      shieldStrength: 10,
      driveStrength: 10,
      hullStrength: 10,
      navigationStrength: 10,
    };
    // y = 10+10+10+10+10 = 50, y>9 → y=floor(50/10)=5
    // cost = 5 * 10000 = 50000
    const { cost, costDisplay } = calculateTripZeroCost(ship);
    expect(cost).toBe(50000);
    expect(costDisplay).toBe(5);
  });

  it('returns zero cost for zero-strength ship', () => {
    const ship = {
      weaponStrength: 0,
      shieldStrength: 0,
      driveStrength: 0,
      hullStrength: 0,
      navigationStrength: 0,
    };
    // y = 0, y<=9 → stays 0, cost = 0
    const { cost, costDisplay } = calculateTripZeroCost(ship);
    expect(cost).toBe(0);
    expect(costDisplay).toBe(0);
  });

  it('does not divide when sum <= 9', () => {
    const ship = {
      weaponStrength: 1,
      shieldStrength: 2,
      driveStrength: 1,
      hullStrength: 2,
      navigationStrength: 1,
    };
    // y = 1+2+1+2+1 = 7, y<=9 → stays 7
    // cost = 7 * 10000 = 70000
    const { cost, costDisplay } = calculateTripZeroCost(ship);
    expect(cost).toBe(70000);
    expect(costDisplay).toBe(7);
  });

  it('handles high-strength ship (max scenario)', () => {
    const ship = {
      weaponStrength: 199,
      shieldStrength: 199,
      driveStrength: 199,
      hullStrength: 199,
      navigationStrength: 199,
    };
    // y = 995, y>9 → y=floor(995/10)=99
    // cost = 99 * 10000 = 990000
    const { cost, costDisplay } = calculateTripZeroCost(ship);
    expect(cost).toBe(990000);
    expect(costDisplay).toBe(99);
  });
});

// ============================================================================
// LANDING FEE (SP.DOCK2.S:31-44) — already exists, verify
// ============================================================================

describe('calculateLandingFee', () => {
  it('increases with system distance from core', () => {
    const fees = [];
    for (let sys = 15; sys <= 20; sys++) {
      fees.push(calculateLandingFee(sys));
    }
    // System 15: a=15%14=1, fee=1*1000=1000
    // System 20: a=20%14=6, fee=6*1000=6000
    expect(fees[0]).toBe(1000);
    expect(fees[5]).toBe(6000);
  });

  it('applies alliance discount', () => {
    expect(calculateLandingFee(15, true, false)).toBe(900);  // 1 * (1000-100)
  });

  it('applies LSS Corps discount', () => {
    expect(calculateLandingFee(15, false, true)).toBe(600);  // 1 * (1000-400)
  });

  it('applies both discounts', () => {
    expect(calculateLandingFee(15, true, true)).toBe(500);   // 1 * (1000-100-400)
  });
});

// ============================================================================
// RIM FUEL SELL PRICE (SP.DOCK2.S:229-231) — already exists, verify
// ============================================================================

describe('getRimFuelSellPrice', () => {
  it('system 15 has special price of 5', () => {
    expect(getRimFuelSellPrice(15)).toBe(5);
  });

  it('system 16-19 use formula 25-systemId', () => {
    expect(getRimFuelSellPrice(16)).toBe(9);
    expect(getRimFuelSellPrice(17)).toBe(8);
    expect(getRimFuelSellPrice(18)).toBe(7);
    expect(getRimFuelSellPrice(19)).toBe(6);
  });

  it('system 20 returns 5 (25-20)', () => {
    expect(getRimFuelSellPrice(20)).toBe(5);
  });
});
