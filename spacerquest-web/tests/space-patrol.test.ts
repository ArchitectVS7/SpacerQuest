/**
 * SpacerQuest v4.0 - Space Patrol System Tests
 *
 * Tests for Space Patrol HQ pure logic functions:
 *   calculatePatrolDistance, calculatePatrolPayoff, checkScorePromotion, validatePatrolEntry
 *
 * Source: SP.REG.S patrol subroutine (lines 177-321)
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePatrolDistance,
  validatePatrolEntry,
  checkScorePromotion,
  calculatePatrolPayoff,
} from '../src/game/systems/patrol';
import { PATROL_BASE_PAY, PATROL_BATTLE_BONUS, PATROL_SCORE_PROMOTION_INTERVAL } from '../src/game/constants';

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
