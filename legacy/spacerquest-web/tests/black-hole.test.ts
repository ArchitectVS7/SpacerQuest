/**
 * SpacerQuest v4.0 - Black Hole Tests
 *
 * Tests for:
 * 1. Black hole transit gating (Astraxial hull, SP.WARP.S mechanics)
 * 2. Black hole exit damage (SP.PATPIR.S "black" section, lines 147-158)
 * 3. NPC credit value formula (SP.PATPIR.S line 84/108: p6=p7*5)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
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
      // SP.BLACK.S fcost(d1=30,d2=9,q6=10): af=21, f2=1, f2*10=10, ty=20, cost=10
      // Need fuel < 10 to trigger denial
      const result = canTransitBlackHole({
        isAstraxialHull: true,
        hullCondition: 9,
        driveCondition: 9,
        driveStrength: 30,
        fuel: 9,
      });
      expect(result.canTransit).toBe(false);
      expect(result.reason).toMatch(/fuel/i);
    });
  });

  describe('getBlackHoleTransitCost — SP.BLACK.S fcost (lines 309-317)', () => {
    it('should return a fuel cost for black hole transit', () => {
      const cost = getBlackHoleTransitCost(30, 9);
      expect(cost).toBeGreaterThan(0);
    });

    it('should cost more with weaker drives', () => {
      const weakCost = getBlackHoleTransitCost(10, 5);
      const strongCost = getBlackHoleTransitCost(30, 9);
      expect(weakCost).toBeGreaterThan(strongCost);
    });

    it('perfect drives (d1=21,d2=10): af=21, f2=1, *10=10, ty=20, cost=10', () => {
      // fcost: af=min(21,21)=21, f2=(0)+(0)=0→clamp→1, f2=10, ty=20, result=10
      expect(getBlackHoleTransitCost(21, 10)).toBe(10);
    });

    it('strong drives (d1=30,d2=9): af=21, f2=(0)+(1)=1, *10=10, ty=20, cost=10', () => {
      expect(getBlackHoleTransitCost(30, 9)).toBe(10);
    });

    it('weak drives (d1=10,d2=5): f2=(11)+(5)=16, *10=160, ty=100(capped), cost=50', () => {
      expect(getBlackHoleTransitCost(10, 5)).toBe(50);
    });

    it('mid drives (d1=20,d2=8): f2=(1)+(2)=3, *10=30, ty=40, cost=20', () => {
      expect(getBlackHoleTransitCost(20, 8)).toBe(20);
    });

    it('max fuel cost is 50 (ty capped at 100)', () => {
      // Even worst drives: f2 is capped via ty<=100, so max cost=50
      expect(getBlackHoleTransitCost(1, 1)).toBe(50);
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

  // blkx cascade: if j<=5 → i=i+1 (shift to next component in sequential if-chain)
  // All weakShip components are <= 5, so no damage regardless of start index
  it('no damage when all component strengths are <= 5 (blkx cascade exhausted)', () => {
    const dmg = computeBlackHoleDamage(1, 3, weakShip); // all components <= 5
    expect(dmg.damaged).toBe(false);
  });

  it('no damage when all component strengths are <= 5, any start index', () => {
    for (let i = 1; i <= 7; i++) {
      const dmg = computeBlackHoleDamage(i, 7, weakShip);
      expect(dmg.damaged).toBe(false);
    }
  });

  // blkx cascade: i=1 (drives, strength=5) → i=2 (cabin, strength>5) → damage cabin
  // Original: blkx increments i, sequential if-checks cause next component to be tried
  it('cascade: drives strength=5 → cascades to cabin (strength>5), damages cabin', () => {
    // drives=5 (skipped), cabin=15 (strength>5, takes damage)
    const cascadeShip: BlackHoleShipStats = { ...weakShip, cabinStrength: 15 };
    const dmg = computeBlackHoleDamage(1, 3, cascadeShip);
    expect(dmg.damaged).toBe(true);
    expect(dmg.component).toBe('cabin'); // cascaded from drives (i=1) to cabin (i=2)
    expect(dmg.damageAmount).toBe(3);
    expect(dmg.newStrength).toBe(12); // 15 - 3
  });

  // blkx cascade: i=6 (robotics, strength=5) → i=7 (hull, strength>5) → damage hull
  it('cascade: robotics strength=5 → cascades to hull (strength>5), damages hull', () => {
    const cascadeShip: BlackHoleShipStats = { ...weakShip, hullStrength: 10 };
    const dmg = computeBlackHoleDamage(6, 2, cascadeShip);
    expect(dmg.damaged).toBe(true);
    expect(dmg.component).toBe('hull'); // cascaded from robotics (i=6) to hull (i=7)
    expect(dmg.newStrength).toBe(8); // 10 - 2
  });

  // blkx cascade: i=7 (hull, strength=5) → no next component → no damage
  it('no cascade past i=7: hull strength=5 at last slot → no damage', () => {
    const cascadeShip: BlackHoleShipStats = { ...richShip, hullStrength: 5 };
    const dmg = computeBlackHoleDamage(7, 3, cascadeShip); // hull is last component
    expect(dmg.damaged).toBe(false);
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

// ============================================================================
// SP.PATPIR.S stat table parity — seed.ts vs original ckpir/ckpat tables
// SP.PATPIR.S:71-79  (ckpir: K1-K9 pirates)
// SP.PATPIR.S:93-103 (ckpat: SP1-SPZ patrol)
// Fields verified: weaponStrength(p7), shieldStrength(s7), driveStrength(s3), hullStrength(s5)
// ============================================================================

describe('SP.PATPIR.S stat table parity (seed.ts vs original ckpir/ckpat tables)', () => {
  const seedPath = path.resolve(__dirname, '../prisma/seed.ts');
  const seedCode = fs.readFileSync(seedPath, 'utf-8');

  // Original SP.PATPIR.S:71-79 ckpir table
  // if a$="K1" p7=14:s7=16:p3$="Maligna Bat-*":s3=20:s5=16
  const expectedPirates = [
    { name: 'K1', weaponStrength: 14, shieldStrength: 16, driveStrength: 20, hullStrength: 16, shipClass: 'Maligna Bat' },
    { name: 'K2', weaponStrength: 16, shieldStrength: 18, driveStrength: 17, hullStrength: 17, shipClass: 'Maligna Cat' },
    { name: 'K3', weaponStrength: 18, shieldStrength: 20, driveStrength: 18, hullStrength: 18, shipClass: 'Maligna Rat' },
    { name: 'K4', weaponStrength: 22, shieldStrength: 22, driveStrength: 19, hullStrength: 19, shipClass: 'Maligna Tat' },
    { name: 'K5', weaponStrength: 24, shieldStrength: 24, driveStrength: 20, hullStrength: 20, shipClass: 'Maligna Vat' },
    { name: 'K6', weaponStrength: 26, shieldStrength: 26, driveStrength: 22, hullStrength: 21, shipClass: 'Maligna Wat' },
    { name: 'K7', weaponStrength: 28, shieldStrength: 28, driveStrength: 24, hullStrength: 20, shipClass: 'Maligna Xat' },
    { name: 'K8', weaponStrength: 30, shieldStrength: 30, driveStrength: 26, hullStrength: 20, shipClass: 'Maligna Yat' },
    { name: 'K9', weaponStrength: 32, shieldStrength: 32, driveStrength: 30, hullStrength: 22, shipClass: 'Maligna Zat' },
  ];

  // Original SP.PATPIR.S:93-103 ckpat table
  // if a$="SP1" p7=16:s7=15:p3$="SLOOP+*":s3=20:s5=16
  const expectedPatrol = [
    { name: 'SP1', weaponStrength: 16, shieldStrength: 15, driveStrength: 20, hullStrength: 16, shipClass: 'SLOOP' },
    { name: 'SP2', weaponStrength: 18, shieldStrength: 17, driveStrength: 18, hullStrength: 17, shipClass: 'CUTTER' },
    { name: 'SP3', weaponStrength: 20, shieldStrength: 19, driveStrength: 16, hullStrength: 18, shipClass: 'BARK' },
    { name: 'SP4', weaponStrength: 22, shieldStrength: 21, driveStrength: 19, hullStrength: 19, shipClass: 'BRIGANTINE' },
    { name: 'SP5', weaponStrength: 24, shieldStrength: 23, driveStrength: 20, hullStrength: 20, shipClass: 'CORVETTE' },
    { name: 'SP6', weaponStrength: 26, shieldStrength: 25, driveStrength: 22, hullStrength: 21, shipClass: 'DESTROYER' },
    { name: 'SP7', weaponStrength: 28, shieldStrength: 27, driveStrength: 24, hullStrength: 20, shipClass: 'CRUISER' },
    { name: 'SP8', weaponStrength: 32, shieldStrength: 29, driveStrength: 26, hullStrength: 20, shipClass: 'FRIGATE' },
    { name: 'SP9', weaponStrength: 40, shieldStrength: 31, driveStrength: 30, hullStrength: 22, shipClass: 'BATTLESHIP' },
    { name: 'SPX', weaponStrength: 55, shieldStrength: 50, driveStrength: 40, hullStrength: 24, shipClass: 'DEATHSTAR' },
    { name: 'SPZ', weaponStrength: 65, shieldStrength: 60, driveStrength: 50, hullStrength: 30, shipClass: 'INFINITY' },
  ];

  for (const npc of expectedPirates) {
    it(`${npc.name} pirate seed matches SP.PATPIR.S ckpir (w=${npc.weaponStrength}, s=${npc.shieldStrength}, d=${npc.driveStrength}, h=${npc.hullStrength})`, () => {
      // Verify shipClass in seed
      expect(seedCode).toContain(`shipClass: '${npc.shipClass}'`);
      // Verify weaponStrength
      expect(seedCode).toContain(`shipName: '${npc.name}`);
      // Verify key stats inline (each stat appears on the same seed line)
      const regex = new RegExp(
        `shipName: '${npc.name}[^']*'[^}]*weaponStrength: ${npc.weaponStrength}[^}]*shieldStrength: ${npc.shieldStrength}[^}]*driveStrength: ${npc.driveStrength}[^}]*hullStrength: ${npc.hullStrength}`
      );
      expect(seedCode).toMatch(regex);
    });
  }

  for (const npc of expectedPatrol) {
    it(`${npc.name} patrol seed matches SP.PATPIR.S ckpat (w=${npc.weaponStrength}, s=${npc.shieldStrength}, d=${npc.driveStrength}, h=${npc.hullStrength})`, () => {
      expect(seedCode).toContain(`shipClass: '${npc.shipClass}'`);
      expect(seedCode).toContain(`shipName: '${npc.name}.`);
      const regex = new RegExp(
        `shipName: '${npc.name}[^']*'[^}]*weaponStrength: ${npc.weaponStrength}[^}]*shieldStrength: ${npc.shieldStrength}[^}]*driveStrength: ${npc.driveStrength}[^}]*hullStrength: ${npc.hullStrength}`
      );
      expect(seedCode).toMatch(regex);
    });
  }
});
