/**
 * SpacerQuest v4.0 - Space Patrol HQ System (SP.REG.S patrol subroutine)
 *
 * Pure game logic — no I/O. All formulas ported from SP.REG.S lines 177-321.
 *
 * Original variable mapping:
 *   cs  → hasPatrolCommission
 *   q4  → destination (system ID)
 *   q4$ → CORE_SYSTEM_NAMES[destination]
 *   q5  → cargoPayment (base pay, 500)
 *   q6  → distance (computed on-the-fly)
 *   q1  → cargoPods (1 = docs safe, 0 = lost)
 *   q2$ → cargoManifest ("Secret Battle Codes")
 *   wb  → patrolBattlesWon
 *   lb  → patrolBattlesLost
 *   z1  → tripCount
 *   kk  → missionType (2 = patrol)
 */

import {
  PATROL_BASE_PAY,
  PATROL_BATTLE_BONUS,
  PATROL_SCORE_PROMOTION_INTERVAL,
} from '../constants.js';
import { addCredits } from '../utils.js';

// ============================================================================
// DISTANCE — SP.REG.S dist1 subroutine (lines 245-248)
// ============================================================================

/**
 * Calculate patrol distance between two systems.
 *
 * Original:
 *   if sp>x y=(sp-x):return
 *   if sp<x y=(x-sp):return
 *   y=1:return   ← same system = 1 (not 0)
 */
export function calculatePatrolDistance(currentSystem: number, destination: number): number {
  if (currentSystem === destination) return 1;
  return Math.abs(currentSystem - destination);
}

// ============================================================================
// FUEL COST — SP.REG.S fcost subroutine (lines 250-256)
// Re-exported from travel.ts for single-import convenience.
// ============================================================================

export { calculatePatrolFuelCost } from './travel.js';

// ============================================================================
// ENTRY VALIDATION — SP.REG.S pat1 guards (lines 188-204)
// ============================================================================

export interface PatrolEntryValidation {
  canEnter: boolean;
  reason?: string;
}

/**
 * Validate whether a character can use Space Patrol HQ.
 *
 * Original checks at pat1 (lines 195-197):
 *   if (h2<1) or (d2<1) print"No functional ship":goto pat1
 *   if z1>2 print"Only 3 completed trips allowed per day":goto pat1
 *   if kk=9 print"You already have 'The Mission'":goto pat1
 */
export function validatePatrolEntry(character: {
  hullCondition: number;
  driveCondition: number;
  tripCount: number;
  missionType: number;
}): PatrolEntryValidation {
  if (character.hullCondition < 1 || character.driveCondition < 1) {
    return { canEnter: false, reason: 'No functional ship' };
  }
  if (character.tripCount > 2) {
    return { canEnter: false, reason: 'Only 3 completed trips allowed per day' };
  }
  if (character.missionType === 9) {
    return { canEnter: false, reason: "You already have 'The Mission'" };
  }
  return { canEnter: true };
}

// ============================================================================
// SCORE PROMOTION — SP.REG.S score subroutine (lines 456-459)
// ============================================================================

/**
 * Check whether a score promotion fires.
 *
 * Original:
 *   y = e1 + b1   (battlesWon + rescuesPerformed)
 *   x = y mod 100
 *   if (y>0) and (x=0): sc+=1, w1+=1, p1+=1, d1+=1
 *
 * Ship variable mapping (confirmed from combat/fcost formulas):
 *   d1 = driveStrength
 *   w1 = weaponStrength
 *   p1 = shieldStrength
 */
export function checkScorePromotion(
  battlesWon: number,
  rescuesPerformed: number,
): { promoted: boolean } {
  const total = battlesWon + rescuesPerformed;
  if (total > 0 && total % PATROL_SCORE_PROMOTION_INTERVAL === 0) {
    return { promoted: true };
  }
  return { promoted: false };
}

// ============================================================================
// PATROL PAYOFF — SP.REG.S payoff subroutine (lines 286-321)
// ============================================================================

export interface PatrolPayoffResult {
  creditsEarned: number;        // q5 (+ 1000*wb on win)
  newCreditsHigh: number;
  newCreditsLow: number;
  newScore: number;             // s2 = (s2+wb+q6+1)-lb, floor 0
  newAstrecsTraveled: number;   // j1+q6, cap 29999
  newCargoDelivered: number;    // k1+q1, cap 29999
  newTripsCompleted: number;    // u1+1
  newBattlesWon: number;        // e1+wb
  newBattlesLost: number;       // m1+lb
  won: boolean;                 // wb >= 1
  promoted: boolean;            // checkScorePromotion result
  docsSafe: boolean;            // q1 === 1
  reportLines: string[];        // ANSI lines for the payoff screen
}

/**
 * Calculate patrol payoff.
 *
 * Original SP.REG.S payoff (lines 286-321):
 *   print report
 *   f2=0
 *   k1=k1+q1: if (k1>29999) k1=0
 *   j1=j1+q6: if (j1>29999) j1=0
 *   u1=u1+1
 *   e1=e1+wb: m1=m1+lb
 *   s2=(s2+wb+q6+1)-lb: if s2<1 s2=0
 *   cs=0
 *   paywin: if (wb>=1): g2=g2+q5+(1000*wb); gosub crfix; gosub score
 *   paylose/paylose1 (wb<1): g2=g2+q5; gosub crfix; gosub score
 */
export function calculatePatrolPayoff(params: {
  patrolBattlesWon: number;      // wb
  patrolBattlesLost: number;     // lb
  distance: number;              // q6
  cargoPods: number;             // q1 (1=safe, 0=lost)
  cargoPayment: number;          // q5 (= PATROL_BASE_PAY = 500)
  creditsHigh: number;
  creditsLow: number;
  astrecsTraveled: number;       // j1
  cargoDelivered: number;        // k1
  tripsCompleted: number;        // u1
  battlesWon: number;            // e1
  battlesLost: number;           // m1
  score: number;                 // s2
  rescuesPerformed: number;      // b1 — for score promotion check
  destinationName?: string;      // q4$ — for report display (SP.REG.S line 287)
}): PatrolPayoffResult {
  const {
    patrolBattlesWon: wb,
    patrolBattlesLost: lb,
    distance: q6,
    cargoPods: q1,
    cargoPayment: q5,
    creditsHigh,
    creditsLow,
    astrecsTraveled,
    cargoDelivered,
    tripsCompleted,
    battlesWon,
    battlesLost,
    score,
    rescuesPerformed,
    destinationName,
  } = params;

  // Credits earned
  const won = wb >= 1;
  const creditsEarned = won ? q5 + PATROL_BATTLE_BONUS * wb : q5;
  const { high: newCreditsHigh, low: newCreditsLow } = addCredits(creditsHigh, creditsLow, creditsEarned);

  // Stat updates
  const newCargoDelivered = Math.min(29999, cargoDelivered + q1);
  const newAstrecsTraveled = Math.min(29999, astrecsTraveled + q6);
  const newTripsCompleted = tripsCompleted + 1;
  const newBattlesWon = battlesWon + wb;
  const newBattlesLost = battlesLost + lb;

  // s2 = (s2 + wb + q6 + 1) - lb; if s2<1 s2=0
  const newScore = Math.max(0, score + wb + q6 + 1 - lb);

  // Score promotion (check against updated totals)
  const { promoted } = checkScorePromotion(newBattlesWon, rescuesPerformed);

  // Payoff report lines
  const docsSafe = q1 === 1;
  const reportLines: string[] = [
    '\x1b[36;1m' + '─'.repeat(38) + '\x1b[0m',
    '\x1b[33;1mReport on Your Space Patrol Activities\x1b[0m',
    '\x1b[36;1m' + '─'.repeat(38) + '\x1b[0m',
    // SP.REG.S line 287: print"Star System Patrolled................: "q4$
    ...(destinationName ? [`Star System Patrolled................: ${destinationName}`] : []),
    `Distance Travelled (Astrecs).........: ${q6}`,
    `Successful Attacks...................: ${wb}`,
    `Unsuccessful Attacks.................: ${lb}`,
    `Patrol Pay...........................: ${q5}`,
    `Bonus for Successful Attacks.........: ${PATROL_BATTLE_BONUS * wb}`,
    `Secret Documents Safe-Guarded........: ${docsSafe ? 'Successful!' : 'Failed!'}`,
    '\x1b[36;1m' + '─'.repeat(38) + '\x1b[0m',
  ];

  if (won) {
    reportLines.push('\x1b[32;1mJob Well-Done!\x1b[0m');
    reportLines.push('Never Have So Many Owed So Much To So Few!');
  } else if (lb > 0) {
    reportLines.push('\x1b[33mGood Effort!\x1b[0m');
    reportLines.push('However...Your ship was damaged and will need repairs');
    reportLines.push(`Your pay comes to ${q5} cr`);
    reportLines.push('The Space Patrol needs a few good Spacers.');
  } else {
    reportLines.push(`Your pay comes to ${q5} cr`);
    reportLines.push('The Space Patrol needs a few good Spacers.');
  }

  if (promoted) {
    reportLines.push('');
    reportLines.push('\x1b[32;1m*** PROMOTION! Combat experience pays off! ***\x1b[0m');
    reportLines.push('+1 Weapon Strength  +1 Shield Strength  +1 Drive Strength');
  }

  return {
    creditsEarned,
    newCreditsHigh,
    newCreditsLow,
    newScore,
    newAstrecsTraveled,
    newCargoDelivered,
    newTripsCompleted,
    newBattlesWon,
    newBattlesLost,
    won,
    promoted,
    docsSafe,
    reportLines,
  };
}
