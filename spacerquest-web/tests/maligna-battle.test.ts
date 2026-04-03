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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
    ship: {
      update: vi.fn(),
    },
    gameLog: {
      create: vi.fn(),
    },
  },
}));
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

  it('with alien weapon mark (hasWeaponMark): k8=(k8+150) — SP.MAL.S line 83', () => {
    // Original: if left$(w1$,1)="?" k8=(k8+150)
    // With weaponStrength=10, no STAR-BUSTER, but alien mark: k8=10+150=160
    const { k8, x8 } = calcPlayerWeapon(10, 9, false, true);
    expect(k8).toBe(160); // 10 + 150
    expect(x8).toBe(1440); // 160 * 9
  });

  it('with both STAR-BUSTER and alien mark: k8=w1+18+150 — SP.MAL.S lines 82-83', () => {
    // STAR-BUSTER applies first: k8=10+18=28, then alien mark: k8=28+150=178
    const { k8 } = calcPlayerWeapon(10, 9, true, true);
    expect(k8).toBe(178); // 10+18+150
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

// ============================================================================
// SP.MAL.S nemgem subroutine — Nemesis Lattice Puzzle
// SP.MAL.S:379-405: crystal lattice puzzle after defeating Nemesian Forces
// ============================================================================

describe('SP.MAL.S nemgem — Nemesis Lattice Puzzle (nemesis-lattice.ts)', () => {
  // Source-code parity checks
  const latticeCode = fs.readFileSync(
    path.join(__dirname, '../src/game/screens/nemesis-lattice.ts'),
    'utf-8'
  );

  it('source contains "INFINITY" as the correct answer (SP.MAL.S:385)', () => {
    expect(latticeCode).toContain("=== 'INFINITY'");
  });

  it('source contains lattice shatters message (SP.MAL.S:402)', () => {
    expect(latticeCode).toContain('crystal lattice shatters into fine dust');
  });

  it('source contains "Nothing happens!" for wrong answers (SP.MAL.S:396)', () => {
    expect(latticeCode).toContain('.....Nothing happens!');
  });

  it('source contains FINIT hint "Very warm" (SP.MAL.S:388)', () => {
    expect(latticeCode).toContain('Very warm');
  });

  it('source contains ETERN hint "no cigar" (SP.MAL.S:390)', () => {
    expect(latticeCode).toContain('no cigar');
  });

  it('source contains "Leave without the jewels?" abandon prompt (SP.MAL.S:398)', () => {
    expect(latticeCode).toContain('Leave without the jewels?');
  });

  it('source awards pendingLattice=false, score+25, promotions+1, tripCount=0 on solve (mallosex SP.MAL.S:316-321)', () => {
    expect(latticeCode).toContain('pendingLattice: false');
    expect(latticeCode).toContain('score: character.score + 25');
    expect(latticeCode).toContain('promotions: character.promotions + 1');
    expect(latticeCode).toContain('tripCount: 0');
  });

  it('source awards shieldStrength=25, weaponStrength=25, hasStarBuster, hasArchAngel on solve (SP.TOP.S:169-172)', () => {
    expect(latticeCode).toContain('shieldStrength: 25');
    expect(latticeCode).toContain('weaponStrength: 25');
    expect(latticeCode).toContain('hasStarBuster: true');
    expect(latticeCode).toContain('hasArchAngel: true');
  });

  it('source sets component names on gems award (SP.TOP.S:171 w1$="STAR-BUSTER++", p1$="ARCH-ANGEL++", l1$="LSS Chrysalis+*")', () => {
    // These names drive gameplay guards (lifeSupportName startsWith "LSS C" = airlock immunity)
    expect(latticeCode).toContain("weaponName: 'STAR-BUSTER++'");
    expect(latticeCode).toContain("shieldName: 'ARCH-ANGEL++'");
    expect(latticeCode).toContain("lifeSupportName: 'LSS Chrysalis+*'");
  });

  it('source clears cargoPods, cargoType, cargoPayment on gems zerout (SP.TOP.S:169 q1=0:q2=0:q5=0)', () => {
    // Full zerout: q1=0, q2=0, q4=0, q5=0, q6=0
    expect(latticeCode).toContain('cargoPods: 0');
    expect(latticeCode).toContain('cargoType: 0');
    expect(latticeCode).toContain('cargoPayment: 0');
  });

  it('source awards +150,000 cr (NEMESIS_REWARD_CREDITS) on solve (SP.TOP.S:169 g1+15)', () => {
    expect(latticeCode).toContain('NEMESIS_REWARD_CREDITS');
    expect(latticeCode).toContain('addCredits');
  });

  it('source contains awaitingAbandon state tracking for 3-attempt limit (SP.MAL.S:396 i<3)', () => {
    expect(latticeCode).toContain('awaitingAbandon');
    expect(latticeCode).toContain('attempts >= 3');
  });

  it('source abandons mission on Y (pendingLattice=false, missionType=0) — SP.MAL.S:399 pb=3:kk=1', () => {
    expect(latticeCode).toContain("pendingLattice: false");
    expect(latticeCode).toContain('missionType: 0');
    expect(latticeCode).toContain("nextScreen: 'main-menu'");
  });

  // Behavioural tests using prisma mock
  describe('screen behaviour', () => {
    let prisma: any;

    beforeEach(async () => {
      const mod = await import('../src/db/prisma.js');
      prisma = (mod as any).prisma;
      vi.clearAllMocks();
    });

    it('render() resets state and shows lattice prompt', async () => {
      const { NemesisLatticeScreen } = await import('../src/game/screens/nemesis-lattice.js');
      const result = await NemesisLatticeScreen.render('test-char');
      expect(result.output).toContain('What say you to The Lattice?');
      expect(result.output).toContain('N E M E S I S');
    });

    it('handleInput("INFINITY") awards gems and routes to main-menu', async () => {
      const { NemesisLatticeScreen } = await import('../src/game/screens/nemesis-lattice.js');
      await NemesisLatticeScreen.render('char-inf');

      prisma.character.findUnique.mockResolvedValue({
        id: 'char-inf',
        name: 'TestPilot',
        score: 10,
        creditsHigh: 0, creditsLow: 0,
        promotions: 1, tripsCompleted: 5, tripCount: 2,
        astrecsTraveled: 100,
        ship: {
          lifeSupportStrength: 10, lifeSupportCondition: 5,
          shieldStrength: 10, shieldCondition: 5,
          weaponStrength: 10, weaponCondition: 5,
          hasStarBuster: false, hasArchAngel: false,
        },
      });
      prisma.character.update.mockResolvedValue(undefined);
      prisma.ship.update.mockResolvedValue(undefined);
      prisma.gameLog.create.mockResolvedValue(undefined);

      const result = await NemesisLatticeScreen.handleInput('char-inf', 'INFINITY');
      expect(result.nextScreen).toBe('main-menu');
      expect(result.output).toContain('crystal lattice shatters');
      expect(result.output).toContain('150,000');
    });

    it('handleInput with wrong answer shows "Nothing happens!" and increments counter', async () => {
      const { NemesisLatticeScreen } = await import('../src/game/screens/nemesis-lattice.js');
      await NemesisLatticeScreen.render('char-wrong');

      const result = await NemesisLatticeScreen.handleInput('char-wrong', 'WRONG');
      expect(result.output).toContain('Nothing happens!');
      expect(result.nextScreen).toBeUndefined();
    });

    it('handleInput with FINIT hint prints "Very warm" then "Nothing happens!" (fall-through)', async () => {
      const { NemesisLatticeScreen } = await import('../src/game/screens/nemesis-lattice.js');
      await NemesisLatticeScreen.render('char-hint');

      const result = await NemesisLatticeScreen.handleInput('char-hint', 'FINITE');
      expect(result.output).toContain('Very warm');
      expect(result.output).toContain('Nothing happens!');
    });

    it('after 3 wrong answers, shows "Leave without the jewels?" abandon prompt (SP.MAL.S:396-398)', async () => {
      const { NemesisLatticeScreen } = await import('../src/game/screens/nemesis-lattice.js');
      await NemesisLatticeScreen.render('char-3x');

      await NemesisLatticeScreen.handleInput('char-3x', 'WRONG1');
      await NemesisLatticeScreen.handleInput('char-3x', 'WRONG2');
      const result = await NemesisLatticeScreen.handleInput('char-3x', 'WRONG3');
      expect(result.output).toContain('Leave without the jewels?');
    });

    it('Y after abandon prompt clears pendingLattice and routes main-menu (SP.MAL.S:399)', async () => {
      const { NemesisLatticeScreen } = await import('../src/game/screens/nemesis-lattice.js');
      await NemesisLatticeScreen.render('char-quit');

      // QUIT → awaitingAbandon
      await NemesisLatticeScreen.handleInput('char-quit', 'QUIT');

      prisma.character.update.mockResolvedValue(undefined);
      const result = await NemesisLatticeScreen.handleInput('char-quit', 'Y');
      expect(result.nextScreen).toBe('main-menu');
      // pendingLattice cleared
      const updateCall = prisma.character.update.mock.calls[0][0];
      expect(updateCall.data.pendingLattice).toBe(false);
      expect(updateCall.data.missionType).toBe(0);
    });
  });
});
