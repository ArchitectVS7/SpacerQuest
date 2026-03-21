/**
 * SpacerQuest v4.0 - SP.MAL Battle Engine Tests
 *
 * Verifies the Maligna/Raid/Nemesis battle simulation against SP.MAL.S formulas.
 *
 * SP.MAL.S key formulas:
 *   lines 57-79:  enemy stat initialization by mission type
 *   lines 82-88:  player weapon/shield effectiveness (k8, x8, k9, x9)
 *   lines 93-98:  penetration calculation (wj, wk)
 *   lines 288-293: mc5 weapon/shield condition recalculation after battle
 *   lines 337-343: malwin defeat consequences (all stats zeroed)
 *   lines 312-319: mallosex victory rewards
 */

import { describe, it, expect } from 'vitest';
import {
  initEnemyStats,
  calcPlayerWeapon,
  calcPlayerShield,
  simulateMalignaBattle,
} from '../src/game/systems/maligna-battle';

// ============================================================================
// ENEMY STAT INITIALIZATION (SP.MAL.S lines 57-79)
// ============================================================================

describe('initEnemyStats', () => {
  it('Maligna (missionType=3): p7=10, p8=60, s7=10, s8=15, p9=12, s9=12, p6=2000', () => {
    const e = initEnemyStats(3);
    expect(e.weaponStrength).toBe(10);
    expect(e.weaponCondition).toBe(60);
    expect(e.shieldStrength).toBe(10);
    expect(e.shieldCondition).toBe(15);
    expect(e.innerShield1).toBe(12);
    expect(e.innerShield2).toBe(12);
    expect(e.fuel).toBe(2000);
    expect(e.name).toBe('MALIGNA');
  });

  it('Nemesis (missionType=9): p7=25, p8=10, s7=25, s8=10, p9=30, s9=40, p6=2000', () => {
    const e = initEnemyStats(9);
    expect(e.weaponStrength).toBe(25);
    expect(e.weaponCondition).toBe(10);
    expect(e.shieldStrength).toBe(25);
    expect(e.shieldCondition).toBe(10);
    expect(e.innerShield1).toBe(30);
    expect(e.innerShield2).toBe(40);
    expect(e.fuel).toBe(2000);
    expect(e.name).toBe('NEMESIS');
  });

  it('Raid (missionType=4) with defconLevel=2: p7=20, s7=20, p8=s8=10, p9=s9=9, p6=200', () => {
    const e = initEnemyStats(4, 2);
    expect(e.weaponStrength).toBe(20);
    expect(e.weaponCondition).toBe(10);
    expect(e.shieldStrength).toBe(20);
    expect(e.shieldCondition).toBe(10);
    expect(e.innerShield1).toBe(9);
    expect(e.innerShield2).toBe(9);
    expect(e.fuel).toBe(200);
  });

  it('Raid defconLevel=1 gives p7=10, p6=100', () => {
    const e = initEnemyStats(4, 1);
    expect(e.weaponStrength).toBe(10);
    expect(e.fuel).toBe(100);
  });

  it('Raid defconLevel=0 gives minimum stats', () => {
    const e = initEnemyStats(4, 0);
    expect(e.weaponStrength).toBe(1);
    expect(e.fuel).toBe(100);
  });
});

// ============================================================================
// PLAYER WEAPON EFFECTIVENESS (SP.MAL.S lines 82-83, 87)
// ============================================================================

describe('calcPlayerWeapon', () => {
  it('without STAR-BUSTER: k8=w1, x8=k8*w2 (line 87)', () => {
    const { k8, x8 } = calcPlayerWeapon(10, 9, false);
    expect(k8).toBe(10);
    expect(x8).toBe(90); // 10*9
  });

  it('with STAR-BUSTER: k8=w1+18 (line 82)', () => {
    const { k8, x8 } = calcPlayerWeapon(10, 9, true);
    expect(k8).toBe(28); // 10+18
    expect(x8).toBe(252); // 28*9
  });

  it('w1=0: x8=0 regardless of condition', () => {
    const { x8 } = calcPlayerWeapon(0, 9, false);
    expect(x8).toBe(0);
  });

  it('w2=0: x8=k8 (weapon condition at zero passes through strength)', () => {
    const { k8, x8 } = calcPlayerWeapon(10, 0, false);
    expect(x8).toBe(k8); // condition=0, so x8=k8 (from line 87 guard)
  });
});

// ============================================================================
// PLAYER SHIELD EFFECTIVENESS (SP.MAL.S lines 84, 88)
// ============================================================================

describe('calcPlayerShield', () => {
  it('without ARCH-ANGEL: k9=p1, x9=k9*p2 (line 88)', () => {
    const { k9, x9 } = calcPlayerShield(8, 7, false);
    expect(k9).toBe(8);
    expect(x9).toBe(56); // 8*7
  });

  it('with ARCH-ANGEL: k9=p1+18 (line 84)', () => {
    const { k9 } = calcPlayerShield(8, 7, true);
    expect(k9).toBe(26); // 8+18
  });
});

// ============================================================================
// BATTLE SIMULATION — WIN CONDITION (SP.MAL.S lines 303-327)
// ============================================================================

describe('simulateMalignaBattle win condition', () => {
  const strongPlayer = {
    weaponStrength: 99,
    weaponCondition: 9,
    shieldStrength: 99,
    shieldCondition: 9,
    hasStarBuster: true,
    hasArchAngel: true,
    fuel: 9999,
    lifeSupportCond: 9,
    cargoPods: 5,
    driveCondition: 9,
    cabinCondition: 9,
    navigationCondition: 9,
    roboticsCondition: 9,
    hullCondition: 9,
  };

  it('overwhelmingly strong player wins against Maligna (missionType=3)', () => {
    // Use seeded always-max rng so every hit is maximum
    const alwaysMax = () => 0.9999;
    const result = simulateMalignaBattle(3, 1, strongPlayer, alwaysMax);
    expect(result.playerWon).toBe(true);
    expect(result.playerLost).toBe(false);
  });

  it('overwhelmingly strong player wins against Nemesis (missionType=9)', () => {
    const alwaysMax = () => 0.9999;
    const result = simulateMalignaBattle(9, 1, strongPlayer, alwaysMax);
    expect(result.playerWon).toBe(true);
  });

  it('overwhelmingly strong player wins Raid (missionType=4)', () => {
    const alwaysMax = () => 0.9999;
    const result = simulateMalignaBattle(4, 2, strongPlayer, alwaysMax);
    expect(result.playerWon).toBe(true);
  });
});

// ============================================================================
// BATTLE SIMULATION — LOSE CONDITION (SP.MAL.S lines 329-343)
// ============================================================================

describe('simulateMalignaBattle lose condition', () => {
  const weakPlayer = {
    weaponStrength: 0,
    weaponCondition: 0,
    shieldStrength: 0,
    shieldCondition: 0,
    hasStarBuster: false,
    hasArchAngel: false,
    fuel: 9999,
    lifeSupportCond: 1,
    cargoPods: 5,
    driveCondition: 9,
    cabinCondition: 9,
    navigationCondition: 9,
    roboticsCondition: 9,
    hullCondition: 9,
  };

  it('player with no weapons/shields eventually loses to Maligna', () => {
    // Enemy always hits at max; player cannot win
    const alwaysMax = () => 0.9999;
    const result = simulateMalignaBattle(3, 1, weakPlayer, alwaysMax);
    expect(result.playerLost).toBe(true);
    expect(result.playerWon).toBe(false);
  });
});

// ============================================================================
// MC5 WEAPON/SHIELD CONDITION RECALCULATION (SP.MAL.S lines 288-293)
// ============================================================================

describe('mc5 weapon/shield condition recalculation', () => {
  it('finalWeaponCondition = 0 when weaponEffective <= weaponStrength', () => {
    // If battle damage reduces x8 below k8, w2 back-calc → 0
    const result = simulateMalignaBattle(
      3,
      1,
      {
        weaponStrength: 10, weaponCondition: 9, hasStarBuster: false,
        shieldStrength: 99, shieldCondition: 9, hasArchAngel: false,
        fuel: 9999, lifeSupportCond: 9, cargoPods: 5,
        driveCondition: 9, cabinCondition: 9, navigationCondition: 9,
        roboticsCondition: 9, hullCondition: 9,
      },
      () => 0.9999, // always max rng → player wins quickly
    );
    // After player wins, x8 should be above k8 (since max rng means max effectiveness kept)
    // finalWeaponCondition = x8/k8 when x8>k8
    if (result.weaponEffective > 10 + 18) {  // 10 (no star-buster)
      expect(result.finalWeaponCondition).toBeGreaterThan(0);
    } else {
      expect(result.finalWeaponCondition).toBe(0);
    }
  });

  it('finalWeaponCondition capped at 9 per SP.MAL.S line 290', () => {
    // Use a player who wins in one round before any damage
    const alwaysMax = () => 0.9999;
    const result = simulateMalignaBattle(4, 0, {
      weaponStrength: 99, weaponCondition: 9, hasStarBuster: false,
      shieldStrength: 99, shieldCondition: 9, hasArchAngel: false,
      fuel: 9999, lifeSupportCond: 9, cargoPods: 5,
      driveCondition: 9, cabinCondition: 9, navigationCondition: 9,
      roboticsCondition: 9, hullCondition: 9,
    }, alwaysMax);
    expect(result.finalWeaponCondition).toBeLessThanOrEqual(9);
    expect(result.finalShieldCondition).toBeLessThanOrEqual(9);
  });
});

// ============================================================================
// BATTLE LOG
// ============================================================================

describe('battle log', () => {
  it('log is non-empty after any battle', () => {
    const result = simulateMalignaBattle(3, 1, {
      weaponStrength: 10, weaponCondition: 9, hasStarBuster: false,
      shieldStrength: 10, shieldCondition: 9, hasArchAngel: false,
      fuel: 9999, lifeSupportCond: 9, cargoPods: 5,
      driveCondition: 9, cabinCondition: 9, navigationCondition: 9,
      roboticsCondition: 9, hullCondition: 9,
    });
    expect(result.log.length).toBeGreaterThan(0);
  });

  it('log includes final outcome message', () => {
    const alwaysMax = () => 0.9999;
    const result = simulateMalignaBattle(3, 1, {
      weaponStrength: 99, weaponCondition: 9, hasStarBuster: true,
      shieldStrength: 99, shieldCondition: 9, hasArchAngel: true,
      fuel: 9999, lifeSupportCond: 9, cargoPods: 5,
      driveCondition: 9, cabinCondition: 9, navigationCondition: 9,
      roboticsCondition: 9, hullCondition: 9,
    }, alwaysMax);
    const lastLog = result.log[result.log.length - 1];
    expect(lastLog).toContain('Battle over');
  });
});
