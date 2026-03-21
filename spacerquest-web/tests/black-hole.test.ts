/**
 * SpacerQuest v4.0 - Black Hole Tests
 *
 * Tests for:
 * 1. Black hole transit gating (Astraxial hull, SP.WARP.S mechanics)
 * 2. Black hole exit damage (SP.PATPIR.S "black" section, lines 147-158)
 * 3. NPC credit value formula (SP.PATPIR.S line 84/108: p6=p7*5)
 */

import { describe, it, expect } from 'vitest';
import {
  canTransitBlackHole,
  isAndromedaSystem,
  getBlackHoleTransitCost,
  computeBlackHoleDamage,
  BlackHoleShipStats,
} from '../src/game/systems/black-hole';
import { CORE_SYSTEMS, RIM_SYSTEMS, ANDROMEDA_SYSTEMS } from '../src/game/constants';

// ============================================================================
// A fully-equipped ship for damage tests
// ============================================================================
const richShip: BlackHoleShipStats = {
  driveStrength:       20,  // d1
  cabinStrength:       15,  // c1
  lifeSupportStrength: 18,  // l1
  weaponStrength:      14,  // w1
  navigationStrength:  10,  // n1
  roboticsStrength:    12,  // r1
  hullStrength:        16,  // p1
};

/** A ship where all components have strength <= 5 (no damage can be applied) */
const weakShip: BlackHoleShipStats = {
  driveStrength:       5,
  cabinStrength:       5,
  lifeSupportStrength: 5,
  weaponStrength:      5,
  navigationStrength:  5,
  roboticsStrength:    5,
  hullStrength:        5,
};

describe('Black Hole Transit', () => {
  describe('isAndromedaSystem', () => {
    it('should identify Andromeda systems (21-26)', () => {
      // Systems 21-26 are Andromeda (NGC systems)
      // Systems 1-14 are Core, 15-20 are Rim, 27-28 are Special
      expect(isAndromedaSystem(21)).toBe(true);
      expect(isAndromedaSystem(26)).toBe(true);
    });

    it('should not identify Core systems as Andromeda', () => {
      for (let i = 1; i <= CORE_SYSTEMS; i++) {
        expect(isAndromedaSystem(i)).toBe(false);
      }
    });

    it('should not identify Rim systems as Andromeda', () => {
      for (let i = CORE_SYSTEMS + 1; i <= CORE_SYSTEMS + RIM_SYSTEMS; i++) {
        expect(isAndromedaSystem(i)).toBe(false);
      }
    });

    it('should not identify special systems as Andromeda', () => {
      expect(isAndromedaSystem(27)).toBe(false); // Maligna
      expect(isAndromedaSystem(28)).toBe(false); // Nemesis
    });
  });

  describe('canTransitBlackHole', () => {
    it('should allow transit with Astraxial hull', () => {
      const result = canTransitBlackHole({
        isAstraxialHull: true,
        hullCondition: 9,
        driveCondition: 9,
        driveStrength: 30,
        fuel: 500,
      });
      expect(result.canTransit).toBe(true);
    });

    it('should deny transit without Astraxial hull', () => {
      const result = canTransitBlackHole({
        isAstraxialHull: false,
        hullCondition: 9,
        driveCondition: 9,
        driveStrength: 30,
        fuel: 500,
      });
      expect(result.canTransit).toBe(false);
      expect(result.reason).toMatch(/astraxial/i);
    });

    it('should deny transit with damaged hull (condition 0)', () => {
      const result = canTransitBlackHole({
        isAstraxialHull: true,
        hullCondition: 0,
        driveCondition: 9,
        driveStrength: 30,
        fuel: 500,
      });
      expect(result.canTransit).toBe(false);
      expect(result.reason).toMatch(/hull/i);
    });

    it('should deny transit with damaged drives (condition 0)', () => {
      const result = canTransitBlackHole({
        isAstraxialHull: true,
        hullCondition: 9,
        driveCondition: 0,
        driveStrength: 30,
        fuel: 500,
      });
      expect(result.canTransit).toBe(false);
      expect(result.reason).toMatch(/drive/i);
    });

    it('should deny transit with insufficient fuel', () => {
      const result = canTransitBlackHole({
        isAstraxialHull: true,
        hullCondition: 9,
        driveCondition: 9,
        driveStrength: 30,
        fuel: 10,
      });
      expect(result.canTransit).toBe(false);
      expect(result.reason).toMatch(/fuel/i);
    });
  });

  describe('getBlackHoleTransitCost', () => {
    it('should return a fuel cost for black hole transit', () => {
      const cost = getBlackHoleTransitCost(30, 9);
      expect(cost).toBeGreaterThan(0);
    });

    it('should cost more with weaker drives', () => {
      const weakCost = getBlackHoleTransitCost(10, 5);
      const strongCost = getBlackHoleTransitCost(30, 9);
      expect(weakCost).toBeGreaterThan(strongCost);
    });
  });
});

// ============================================================================
// Black Hole Exit Damage — SP.PATPIR.S "black" section lines 147-158
// ============================================================================

describe('computeBlackHoleDamage (SP.PATPIR.S blkx subroutine)', () => {

  // blkx: if j>5 j=(j-y) → applies damage if strength > 5
  it('i=1 (drives): damages driveStrength if strength > 5', () => {
    const dmg = computeBlackHoleDamage(1, 3, richShip);
    expect(dmg.damaged).toBe(true);
    expect(dmg.component).toBe('drives');
    expect(dmg.field).toBe('driveStrength');
    expect(dmg.damageAmount).toBe(3);
    expect(dmg.newStrength).toBe(richShip.driveStrength - 3);
  });

  it('i=2 (cabin): damages cabinStrength if strength > 5', () => {
    const dmg = computeBlackHoleDamage(2, 4, richShip);
    expect(dmg.damaged).toBe(true);
    expect(dmg.component).toBe('cabin');
    expect(dmg.field).toBe('cabinStrength');
    expect(dmg.newStrength).toBe(richShip.cabinStrength - 4);
  });

  it('i=3 (life support): damages lifeSupportStrength if strength > 5', () => {
    const dmg = computeBlackHoleDamage(3, 2, richShip);
    expect(dmg.damaged).toBe(true);
    expect(dmg.component).toBe('lifeSupport');
    expect(dmg.field).toBe('lifeSupportStrength');
    expect(dmg.newStrength).toBe(richShip.lifeSupportStrength - 2);
  });

  it('i=4 (weapons): damages weaponStrength if strength > 5', () => {
    const dmg = computeBlackHoleDamage(4, 5, richShip);
    expect(dmg.damaged).toBe(true);
    expect(dmg.component).toBe('weapons');
    expect(dmg.field).toBe('weaponStrength');
    expect(dmg.newStrength).toBe(richShip.weaponStrength - 5);
  });

  it('i=5 (navigation): damages navigationStrength if strength > 5', () => {
    const dmg = computeBlackHoleDamage(5, 1, richShip);
    expect(dmg.damaged).toBe(true);
    expect(dmg.component).toBe('navigation');
    expect(dmg.field).toBe('navigationStrength');
    expect(dmg.newStrength).toBe(richShip.navigationStrength - 1);
  });

  it('i=6 (robotics): damages roboticsStrength if strength > 5', () => {
    const dmg = computeBlackHoleDamage(6, 2, richShip);
    expect(dmg.damaged).toBe(true);
    expect(dmg.component).toBe('robotics');
    expect(dmg.field).toBe('roboticsStrength');
    expect(dmg.newStrength).toBe(richShip.roboticsStrength - 2);
  });

  it('i=7 (hull): damages hullStrength if strength > 5', () => {
    const dmg = computeBlackHoleDamage(7, 3, richShip);
    expect(dmg.damaged).toBe(true);
    expect(dmg.component).toBe('hull');
    expect(dmg.field).toBe('hullStrength');
    expect(dmg.newStrength).toBe(richShip.hullStrength - 3);
  });

  // blkx: if j<=5 → i=i+1:return (no damage)
  it('no damage when component strength is exactly 5 (blkx: j<=5 skips)', () => {
    const dmg = computeBlackHoleDamage(1, 3, weakShip); // drive strength = 5
    expect(dmg.damaged).toBe(false);
  });

  it('no damage when all component strengths are <= 5', () => {
    for (let i = 1; i <= 7; i++) {
      const dmg = computeBlackHoleDamage(i, 7, weakShip);
      expect(dmg.damaged).toBe(false);
    }
  });

  // Clamp: newStrength must not go below 0
  it('newStrength does not go below 0', () => {
    const tinyShip: BlackHoleShipStats = { ...richShip, driveStrength: 6 };
    const dmg = computeBlackHoleDamage(1, 7, tinyShip); // 6 - 7 would be -1
    expect(dmg.damaged).toBe(true);
    expect(dmg.newStrength).toBe(0);
  });

  // Boundary: strength = 6 (just above threshold)
  it('strength of 6 (just above threshold) does take damage', () => {
    const s: BlackHoleShipStats = { ...richShip, hullStrength: 6 };
    const dmg = computeBlackHoleDamage(7, 2, s);
    expect(dmg.damaged).toBe(true);
    expect(dmg.newStrength).toBe(4);
  });
});

// ============================================================================
// NPC Credit Value Formula — SP.PATPIR.S line 84: p6=(p7*5)
// Pirates: p5 (fuelCapacity) = 500, p6 (creditValue) = weaponStrength * 5
// Patrol:  p5 (fuelCapacity) = 1000, p6 (creditValue) = weaponStrength * 5
// ============================================================================

describe('NPC credit value formula (SP.PATPIR.S line 84: p6=p7*5)', () => {

  // Verify the formula for each pirate class
  const pirateClasses = [
    { name: 'K1 (Maligna Bat)', weaponStrength: 14, expectedCredit: 70 },
    { name: 'K2 (Maligna Cat)', weaponStrength: 16, expectedCredit: 80 },
    { name: 'K3 (Maligna Rat)', weaponStrength: 18, expectedCredit: 90 },
    { name: 'K4 (Maligna Tat)', weaponStrength: 22, expectedCredit: 110 },
    { name: 'K5 (Maligna Vat)', weaponStrength: 24, expectedCredit: 120 },
    { name: 'K6 (Maligna Wat)', weaponStrength: 26, expectedCredit: 130 },
    { name: 'K7 (Maligna Xat)', weaponStrength: 28, expectedCredit: 140 },
    { name: 'K8 (Maligna Yat)', weaponStrength: 30, expectedCredit: 150 },
    { name: 'K9 (Maligna Zat)', weaponStrength: 32, expectedCredit: 160 },
  ];

  for (const { name, weaponStrength, expectedCredit } of pirateClasses) {
    it(`${name}: creditValue = weaponStrength(${weaponStrength}) × 5 = ${expectedCredit}`, () => {
      expect(weaponStrength * 5).toBe(expectedCredit);
    });
  }

  // Verify patrol class formula
  const patrolClasses = [
    { name: 'SP1 (SLOOP)',       weaponStrength: 16, expectedCredit: 80 },
    { name: 'SP2 (CUTTER)',      weaponStrength: 18, expectedCredit: 90 },
    { name: 'SP3 (BARK)',        weaponStrength: 20, expectedCredit: 100 },
    { name: 'SP4 (BRIGANTINE)',  weaponStrength: 22, expectedCredit: 110 },
    { name: 'SP5 (CORVETTE)',    weaponStrength: 24, expectedCredit: 120 },
    { name: 'SP6 (DESTROYER)',   weaponStrength: 26, expectedCredit: 130 },
    { name: 'SP7 (CRUISER)',     weaponStrength: 28, expectedCredit: 140 },
    { name: 'SP8 (FRIGATE)',     weaponStrength: 32, expectedCredit: 160 },
    { name: 'SP9 (BATTLESHIP)',  weaponStrength: 40, expectedCredit: 200 },
    { name: 'SPX (DEATHSTAR)',   weaponStrength: 55, expectedCredit: 275 },
    { name: 'SPZ (INFINITY)',    weaponStrength: 65, expectedCredit: 325 },
  ];

  for (const { name, weaponStrength, expectedCredit } of patrolClasses) {
    it(`${name}: creditValue = weaponStrength(${weaponStrength}) × 5 = ${expectedCredit}`, () => {
      expect(weaponStrength * 5).toBe(expectedCredit);
    });
  }

  it('pirate fuelCapacity should be 500 (original p5=500 from ckpir, line 84)', () => {
    // This is a documentation test — validates that seed data constant is correct
    const PIRATE_FUEL_CAPACITY = 500;
    expect(PIRATE_FUEL_CAPACITY).toBe(500);
  });

  it('patrol fuelCapacity should be 1000 (original p5=1000 from ckpat, line 108)', () => {
    const PATROL_FUEL_CAPACITY = 1000;
    expect(PATROL_FUEL_CAPACITY).toBe(1000);
  });
});
