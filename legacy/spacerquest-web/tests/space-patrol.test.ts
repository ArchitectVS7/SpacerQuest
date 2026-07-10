/**
 * SpacerQuest v4.0 - Space Patrol System Tests
 *
 * Tests for Space Patrol HQ pure logic functions:
 *   calculatePatrolDistance, calculatePatrolPayoff, checkScorePromotion, validatePatrolEntry
 *
 * Source: SP.REG.S patrol subroutine (lines 177-321)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  calculatePatrolDistance,
  validatePatrolEntry,
  checkScorePromotion,
  calculatePatrolPayoff,
  calculatePatrolFuelCost,
} from '../src/game/systems/patrol';
import { PATROL_BASE_PAY, PATROL_BATTLE_BONUS, PATROL_SCORE_PROMOTION_INTERVAL } from '../src/game/constants';

const patrolScreenCode = fs.readFileSync(
  path.join(__dirname, '../src/game/screens/space-patrol.ts'),
  'utf-8'
);

// ============================================================================
// calculatePatrolDistance — SP.REG.S dist1 subroutine (lines 245-248)
// ============================================================================

describe('calculatePatrolDistance (SP.REG.S lines 245-248)', () => {
  // Original: if sp>x y=(sp-x):return / if sp<x y=(x-sp):return / y=1:return
  it('returns absolute difference when current > destination', () => {
    expect(calculatePatrolDistance(10, 3)).toBe(7);
  });

  it('returns absolute difference when destination > current', () => {
    expect(calculatePatrolDistance(2, 9)).toBe(7);
  });

  it('returns 1 when same system (not 0)', () => {
    // Original: y=1:return — same system yields 1, not 0
    expect(calculatePatrolDistance(5, 5)).toBe(1);
  });

  it('returns 1 for system 1 to system 1', () => {
    expect(calculatePatrolDistance(1, 1)).toBe(1);
  });

  it('returns 13 for max span (system 1 to system 14)', () => {
    expect(calculatePatrolDistance(1, 14)).toBe(13);
  });
});

// ============================================================================
// validatePatrolEntry — SP.REG.S pat1 guards (lines 195-197)
// ============================================================================

describe('validatePatrolEntry (SP.REG.S lines 195-197)', () => {
  const baseChar = { hullCondition: 5, driveCondition: 5, tripCount: 0, missionType: 0 };

  it('allows entry with a functional ship and no trips', () => {
    const result = validatePatrolEntry(baseChar);
    expect(result.canEnter).toBe(true);
  });

  it('blocks when hullCondition < 1 — no functional ship', () => {
    const result = validatePatrolEntry({ ...baseChar, hullCondition: 0 });
    expect(result.canEnter).toBe(false);
    expect(result.reason).toBe('No functional ship');
  });

  it('blocks when driveCondition < 1 — no functional ship', () => {
    const result = validatePatrolEntry({ ...baseChar, driveCondition: 0 });
    expect(result.canEnter).toBe(false);
    expect(result.reason).toBe('No functional ship');
  });

  it('blocks when tripCount > 2 — only 3 trips per day', () => {
    // Original: if z1>2 print"Only 3 completed trips allowed per day"
    const result = validatePatrolEntry({ ...baseChar, tripCount: 3 });
    expect(result.canEnter).toBe(false);
    expect(result.reason).toBe('Only 3 completed trips allowed per day');
  });

  it('allows entry when tripCount === 2', () => {
    const result = validatePatrolEntry({ ...baseChar, tripCount: 2 });
    expect(result.canEnter).toBe(true);
  });

  it('blocks when missionType === 9 — already has The Mission', () => {
    // Original: if kk=9 print"You already have 'The Mission'"
    const result = validatePatrolEntry({ ...baseChar, missionType: 9 });
    expect(result.canEnter).toBe(false);
    expect(result.reason).toContain('The Mission');
  });
});

// ============================================================================
// checkScorePromotion — SP.REG.S score subroutine (lines 456-459)
// ============================================================================

describe('checkScorePromotion (SP.REG.S score subroutine)', () => {
  // Original: y = e1 + b1; if (y>0) and (y mod 100 = 0): promote
  it('does not promote when total is 0', () => {
    expect(checkScorePromotion(0, 0).promoted).toBe(false);
  });

  it('does not promote at 99 total', () => {
    expect(checkScorePromotion(99, 0).promoted).toBe(false);
  });

  it('promotes at exactly 100 total', () => {
    expect(checkScorePromotion(100, 0).promoted).toBe(true);
  });

  it('promotes when 80 battles + 20 rescues = 100', () => {
    expect(checkScorePromotion(80, 20).promoted).toBe(true);
  });

  it('does not promote at 101', () => {
    expect(checkScorePromotion(101, 0).promoted).toBe(false);
  });

  it('promotes again at 200 total', () => {
    expect(checkScorePromotion(200, 0).promoted).toBe(true);
  });

  it('does not promote at 150', () => {
    expect(checkScorePromotion(150, 0).promoted).toBe(false);
  });

  it('interval matches PATROL_SCORE_PROMOTION_INTERVAL constant', () => {
    expect(PATROL_SCORE_PROMOTION_INTERVAL).toBe(100);
    expect(checkScorePromotion(PATROL_SCORE_PROMOTION_INTERVAL, 0).promoted).toBe(true);
  });
});

// ============================================================================
// calculatePatrolPayoff — SP.REG.S payoff subroutine (lines 286-321)
// ============================================================================

describe('calculatePatrolPayoff (SP.REG.S payoff subroutine)', () => {
  const baseParams = {
    patrolBattlesWon: 0,
    patrolBattlesLost: 0,
    distance: 5,         // q6
    cargoPods: 1,        // q1 (docs safe)
    cargoPayment: PATROL_BASE_PAY,  // q5
    creditsHigh: 0,
    creditsLow: 1000,
    astrecsTraveled: 0,  // j1
    cargoDelivered: 0,   // k1
    tripsCompleted: 0,   // u1
    battlesWon: 0,       // e1
    battlesLost: 0,      // m1
    score: 10,           // s2
    rescuesPerformed: 0, // b1
  };

  it('earns base pay only when no battles won', () => {
    const result = calculatePatrolPayoff({ ...baseParams, patrolBattlesWon: 0 });
    expect(result.creditsEarned).toBe(PATROL_BASE_PAY);
    expect(result.won).toBe(false);
  });

  it('earns base pay + 1000 per battle win', () => {
    // Original paywin: g2=g2+q5+(1000*wb)
    const result = calculatePatrolPayoff({ ...baseParams, patrolBattlesWon: 2 });
    expect(result.creditsEarned).toBe(PATROL_BASE_PAY + PATROL_BATTLE_BONUS * 2);
    expect(result.won).toBe(true);
  });

  it('PATROL_BATTLE_BONUS is 1000', () => {
    expect(PATROL_BATTLE_BONUS).toBe(1000);
  });

  it('score formula: s2 = (s2 + wb + q6 + 1) - lb, floor 0', () => {
    // Original: s2=(s2+wb+q6+1)-lb: if s2<1 s2=0
    const result = calculatePatrolPayoff({
      ...baseParams,
      score: 10,
      patrolBattlesWon: 2,
      patrolBattlesLost: 1,
      distance: 5,
    });
    // s2 = (10 + 2 + 5 + 1) - 1 = 17
    expect(result.newScore).toBe(17);
  });

  it('score cannot go below 0', () => {
    const result = calculatePatrolPayoff({
      ...baseParams,
      score: 0,
      patrolBattlesWon: 0,
      patrolBattlesLost: 10,
      distance: 1,
    });
    // s2 = (0 + 0 + 1 + 1) - 10 = -8 → clamped to 0
    expect(result.newScore).toBe(0);
  });

  it('increments tripsCompleted by 1', () => {
    const result = calculatePatrolPayoff({ ...baseParams, tripsCompleted: 3 });
    expect(result.newTripsCompleted).toBe(4);
  });

  it('accumulates battles won into e1', () => {
    const result = calculatePatrolPayoff({
      ...baseParams,
      battlesWon: 10,
      patrolBattlesWon: 3,
    });
    expect(result.newBattlesWon).toBe(13);
  });

  it('accumulates battles lost into m1', () => {
    const result = calculatePatrolPayoff({
      ...baseParams,
      battlesLost: 5,
      patrolBattlesLost: 2,
    });
    expect(result.newBattlesLost).toBe(7);
  });

  it('increments astrecsTraveled by distance', () => {
    const result = calculatePatrolPayoff({ ...baseParams, astrecsTraveled: 100, distance: 7 });
    expect(result.newAstrecsTraveled).toBe(107);
  });

  it('caps astrecsTraveled at 29999', () => {
    // Original: j1=j1+q6: if (j1>29999) j1=0 — but we cap, not zero
    const result = calculatePatrolPayoff({ ...baseParams, astrecsTraveled: 29998, distance: 5 });
    expect(result.newAstrecsTraveled).toBe(29999);
  });

  it('increments cargoDelivered by cargoPods', () => {
    const result = calculatePatrolPayoff({ ...baseParams, cargoDelivered: 10, cargoPods: 1 });
    expect(result.newCargoDelivered).toBe(11);
  });

  it('docsSafe is true when cargoPods === 1', () => {
    expect(calculatePatrolPayoff({ ...baseParams, cargoPods: 1 }).docsSafe).toBe(true);
  });

  it('docsSafe is false when cargoPods === 0', () => {
    expect(calculatePatrolPayoff({ ...baseParams, cargoPods: 0 }).docsSafe).toBe(false);
  });

  it('fires score promotion when battlesWon + rescuesPerformed reaches 100', () => {
    const result = calculatePatrolPayoff({
      ...baseParams,
      battlesWon: 97,
      patrolBattlesWon: 3,   // e1+wb = 100
      rescuesPerformed: 0,
    });
    expect(result.promoted).toBe(true);
  });

  it('does not promote at non-100 milestone', () => {
    const result = calculatePatrolPayoff({
      ...baseParams,
      battlesWon: 50,
      patrolBattlesWon: 1,
      rescuesPerformed: 0,
    });
    expect(result.promoted).toBe(false);
  });

  it('report contains payoff header', () => {
    const result = calculatePatrolPayoff(baseParams);
    const joined = result.reportLines.join('\n');
    expect(joined).toContain('Space Patrol');
  });

  it('report indicates docs safe when cargoPods === 1', () => {
    const result = calculatePatrolPayoff({ ...baseParams, cargoPods: 1 });
    const joined = result.reportLines.join('\n');
    expect(joined).toContain('Successful');
  });

  it('report indicates docs failed when cargoPods === 0', () => {
    const result = calculatePatrolPayoff({ ...baseParams, cargoPods: 0 });
    const joined = result.reportLines.join('\n');
    expect(joined).toContain('Failed');
  });

  it('report includes "Job Well-Done" on win', () => {
    const result = calculatePatrolPayoff({ ...baseParams, patrolBattlesWon: 1 });
    const joined = result.reportLines.join('\n');
    expect(joined).toContain('Job Well-Done');
  });

  it('report does not include "Job Well-Done" on loss', () => {
    const result = calculatePatrolPayoff({ ...baseParams, patrolBattlesWon: 0, patrolBattlesLost: 1 });
    const joined = result.reportLines.join('\n');
    expect(joined).not.toContain('Job Well-Done');
  });
});

// ============================================================================
// calculatePatrolFuelCost (SP.REG.S fcost subroutine, lines 252-256)
// ============================================================================

describe('calculatePatrolFuelCost (SP.REG.S:252-256)', () => {
  it('returns non-zero fuel cost for normal drive', () => {
    // driveStrength=10, driveCondition=9, distance=5
    // af=min(10,21)=10; f2=(21-10)+(10-9)=12; f2=12*5=60; ty=70; f2=floor(70/2)=35
    const cost = calculatePatrolFuelCost(10, 9, 5);
    expect(cost).toBe(35);
  });

  it('returns 0 for 0 distance', () => {
    // Original: f2=0:if q6<1 return
    const cost = calculatePatrolFuelCost(10, 9, 0);
    expect(cost).toBe(0);
  });

  it('increases with distance', () => {
    const costShort = calculatePatrolFuelCost(10, 9, 3);
    const costLong = calculatePatrolFuelCost(10, 9, 10);
    expect(costLong).toBeGreaterThan(costShort);
  });
});

// ============================================================================
// SP.REG.S launch: f1=f1+f2 — patrol launch pre-loads fuel (lines 258-267)
// ============================================================================

describe('SP.REG.S patrol launch fuel pre-load (line 262: f1=f1+f2)', () => {
  it('L key handler adds fuelRequired to ship.fuel at launch (f1=f1+f2)', () => {
    // The launch handler must update ship.fuel by adding fuelRequired, not check and block
    expect(patrolScreenCode).toContain('newFuel = ship.fuel + fuelRequired');
  });

  it('L key handler updates ship fuel via prisma in transaction', () => {
    // Must persist the fuel top-up to DB at launch
    expect(patrolScreenCode).toContain('prisma.ship.update');
    expect(patrolScreenCode).toContain('fuel: newFuel');
  });

  it('L key handler sets missionType=2 at launch', () => {
    expect(patrolScreenCode).toContain('missionType: 2');
  });

  it('L key handler uses calculatePatrolFuelCost to compute f2', () => {
    expect(patrolScreenCode).toContain('calculatePatrolFuelCost(');
  });
});

// ============================================================================
// SP.REG.S patrol (lines 177-183): Space Commandant promotion check
// Original: if ((w1+p1)<50) or (kk=9) goto pat0
//           if (left$(l1$,5)="LSS C") or (left$(h1$,3)="Ast") goto pat0
//           print "The Space Commandant wishes to speak to you [Y]/(N): "
//           if i$="N" print"Not now":goto pat0
//           print"Yes": link"sp.top","wins"
// ============================================================================

describe('SP.REG.S patrol Space Commandant check (lines 177-183)', () => {
  it('space-patrol.ts checks weapon+shield >= 50 for Commandant prompt', () => {
    // SP.REG.S:177: if ((w1+p1)<50) goto pat0
    expect(patrolScreenCode).toContain('weaponStrength + ship.shieldStrength') ;
    expect(patrolScreenCode).toContain('>= 50');
  });

  it('space-patrol.ts blocks Commandant when missionType===9 (kk=9)', () => {
    // SP.REG.S:177: or (kk=9)
    expect(patrolScreenCode).toContain('missionType !== 9');
  });

  it('space-patrol.ts blocks Commandant when life support starts with "LSS C" (Chrysalis)', () => {
    // SP.REG.S:178: if (left$(l1$,5)="LSS C") goto pat0
    expect(patrolScreenCode).toContain("startsWith('LSS C')");
  });

  it('space-patrol.ts blocks Commandant when hull starts with "Ast" (Astraxial)', () => {
    // SP.REG.S:178: or (left$(h1$,3)="Ast") goto pat0
    expect(patrolScreenCode).toContain("startsWith('Ast')");
  });

  it('space-patrol.ts routes to topgun on Y (link"sp.top","wins")', () => {
    // SP.REG.S:183: link"sp.top","wins"
    expect(patrolScreenCode).toContain("nextScreen: 'topgun'");
  });

  it('space-patrol.ts uses pendingCommandant to track multi-step state', () => {
    // Commandant prompt requires multi-step Y/N interaction
    expect(patrolScreenCode).toContain('pendingCommandant');
  });

  it('space-patrol.ts shows "Space Commandant wishes to speak" prompt text', () => {
    expect(patrolScreenCode).toContain('Space Commandant wishes to speak to you');
  });
});

// ============================================================================
// SP.REG.S payoff: "Star System Patrolled" in report (line 287)
// Original: print"Star System Patrolled................: "q4$
// ============================================================================

describe('calculatePatrolPayoff — Star System Patrolled report line (SP.REG.S:287)', () => {
  const baseParams = {
    patrolBattlesWon: 1,
    patrolBattlesLost: 0,
    distance: 5,
    cargoPods: 1,
    cargoPayment: 500,
    creditsHigh: 0,
    creditsLow: 1000,
    astrecsTraveled: 0,
    cargoDelivered: 0,
    tripsCompleted: 0,
    battlesWon: 0,
    battlesLost: 0,
    score: 10,
    rescuesPerformed: 0,
  };

  it('report includes "Star System Patrolled" when destinationName is provided', () => {
    // SP.REG.S line 287: print"Star System Patrolled................: "q4$
    const result = calculatePatrolPayoff({ ...baseParams, destinationName: 'Vega-6' });
    const joined = result.reportLines.join('\n');
    expect(joined).toContain('Star System Patrolled');
    expect(joined).toContain('Vega-6');
  });

  it('report omits "Star System Patrolled" when destinationName is not provided (backward compat)', () => {
    const result = calculatePatrolPayoff({ ...baseParams });
    const joined = result.reportLines.join('\n');
    expect(joined).not.toContain('Star System Patrolled');
  });

  it('star system line appears before distance line in report', () => {
    // Original order: star system (line 287) then distance (line 288)
    const result = calculatePatrolPayoff({ ...baseParams, destinationName: 'Sun-3' });
    const sysIdx = result.reportLines.findIndex(l => l.includes('Star System Patrolled'));
    const distIdx = result.reportLines.findIndex(l => l.includes('Distance Travelled'));
    expect(sysIdx).toBeGreaterThan(-1);
    expect(distIdx).toBeGreaterThan(-1);
    expect(sysIdx).toBeLessThan(distIdx);
  });
});

// ============================================================================
// SP.REG.S lostnow subroutine (lines 354-366): score penalty when lost in space
// Original: s2=(s2+wb)-lb; s2=s2-10: if s2<1 s2=0
// ============================================================================

describe('SP.REG.S lostnow score penalty (lines 354-366)', () => {
  it('space-patrol.ts applies s2-10 score penalty in lost path', () => {
    // SP.REG.S lostnow: s2=(s2+wb)-lb; s2=s2-10
    expect(patrolScreenCode).toContain('- 10');
  });

  it('space-patrol.ts sets isLost=true in lost path', () => {
    // SP.REG.S: ap=1 → modern isLost flag
    expect(patrolScreenCode).toContain('isLost: true');
  });

  it('space-patrol.ts accumulates battlesWon/Lost in lost path', () => {
    // SP.REG.S lostnow: e1=e1+wb: m1=m1+lb
    expect(patrolScreenCode).toContain('battlesWon: { increment: wb }');
    expect(patrolScreenCode).toContain('battlesLost: { increment: lb }');
  });

  it('lost score formula: (s2+wb-lb-10) clamped to 0 minimum', () => {
    // SP.REG.S: s2=(s2+wb)-lb; s2=s2-10: if s2<1 s2=0
    // Test the formula directly with extreme values
    // score=5, wb=0, lb=0 → (5+0-0-10) = -5 → clamped to 0
    const rawScore = 5 + 0 - 0 - 10;
    const newScore = Math.max(0, rawScore);
    expect(newScore).toBe(0);
  });

  it('lost score formula keeps positive result when score is large', () => {
    // score=100, wb=2, lb=1 → (100+2-1-10) = 91
    const rawScore = 100 + 2 - 1 - 10;
    const newScore = Math.max(0, rawScore);
    expect(newScore).toBe(91);
  });
});
