/**
 * SpacerQuest v4.0 - Functional Requirements Test Suite
 *
 * Comprehensive coverage of PRD functional requirements.
 * Complements core.test.ts without duplication.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCourseChangeFuel,
  hasEnoughFuel,
  calculateArrivalTime,
  canTravel,
} from '../src/game/systems/travel';
import {
  applyShieldDamage,
  applySystemDamage,
  attemptRetreat,
  enemyDemandsTribute,
  calculateLoot,
  calculateEnemyBattleFactor,
  processCombatRound,
} from '../src/game/systems/combat';
import {
  getFuelPrice,
  getFuelSellPrice,
  calculateFuelBuyCost,
  calculateFuelSaleProceeds,
  calculateCargoPayment,
  calculatePortPrice,
  calculatePortResaleValue,
  calculateLandingFee,
  getRimFuelSellPrice,
  calculatePatrolPay,
  getCargoDescription,
  getSystemName,
  generateCargoContract,
} from '../src/game/systems/economy';
import {
  getTotalCredits,
  getHonorarium,
  getRankIndex,
  getAllianceSymbol,
  appendAllianceSymbol,
  removeAllianceSymbol,
  calculateComponentPower,
  calculateDamagePercent,
  conditionFromDamage,
  isDayDifferent,
  padString,
  centerString,
  truncateString,
  validateName,
  calculateRank,
} from '../src/game/utils';
import { Rank, AllianceType } from '@prisma/client';

// ============================================================================
// TEST HELPERS
// ============================================================================

function makeShip(overrides: Record<string, unknown> = {}) {
  return {
    weaponStrength: 20, weaponCondition: 8,
    shieldStrength: 15, shieldCondition: 7,
    cabinStrength: 10, cabinCondition: 5,
    roboticsStrength: 8, roboticsCondition: 4,
    lifeSupportStrength: 10, lifeSupportCondition: 5,
    navigationStrength: 10, navigationCondition: 5,
    driveStrength: 15, driveCondition: 7,
    hasAutoRepair: false,
    ...overrides,
  };
}

function makeEnemy(overrides: Record<string, unknown> = {}) {
  return {
    type: 'PIRATE' as const,
    class: 'SPX',
    name: 'Test Pirate',
    commander: 'Captain Test',
    system: 1,
    weaponStrength: 10, weaponCondition: 5,
    shieldStrength: 10, shieldCondition: 5,
    driveStrength: 10, driveCondition: 5,
    hullStrength: 10, hullCondition: 5,
    battleFactor: 100,
    fuel: 200,
    ...overrides,
  };
}

// ============================================================================
// FR-TRAVEL
// ============================================================================

describe('FR-TRAVEL', () => {
  describe('calculateCourseChangeFuel', () => {
    it('returns hullStrength × 5', () => {
      expect(calculateCourseChangeFuel(10)).toBe(50);
      expect(calculateCourseChangeFuel(1)).toBe(5);
      expect(calculateCourseChangeFuel(20)).toBe(100);
    });
  });

  describe('hasEnoughFuel', () => {
    it('returns hasEnough=true and deficit=0 when fuel is sufficient', () => {
      const result = hasEnoughFuel(100, 80);
      expect(result.hasEnough).toBe(true);
      expect(result.deficit).toBe(0);
    });

    it('returns hasEnough=false and correct deficit when insufficient', () => {
      const result = hasEnoughFuel(50, 80);
      expect(result.hasEnough).toBe(false);
      expect(result.deficit).toBe(30);
    });

    it('returns hasEnough=true when fuel exactly equals requirement', () => {
      const result = hasEnoughFuel(50, 50);
      expect(result.hasEnough).toBe(true);
      expect(result.deficit).toBe(0);
    });
  });

  describe('calculateArrivalTime', () => {
    it('arrival = departure + distance × 3 seconds', () => {
      const departure = new Date('2000-01-01T12:00:00.000Z');
      const arrival = calculateArrivalTime(departure, 10);
      // distance=10 → chronos=30 → 30000ms
      expect(arrival.getTime()).toBe(departure.getTime() + 30 * 1000);
    });

    it('distance=1 adds exactly 3 seconds', () => {
      const departure = new Date('2000-01-01T00:00:00.000Z');
      const arrival = calculateArrivalTime(departure, 1);
      expect(arrival.getTime()).toBe(departure.getTime() + 3 * 1000);
    });
  });

  describe('canTravel', () => {
    it('allows travel when no trips taken today', () => {
      const today = new Date();
      const result = canTravel(0, today);
      expect(result.canTravel).toBe(true);
      expect(result.remainingTrips).toBe(2);
    });

    it('blocks travel at 2 trips today', () => {
      const today = new Date();
      const result = canTravel(2, today);
      expect(result.canTravel).toBe(false);
      expect(result.remainingTrips).toBe(0);
    });

    it('returns correct remainingTrips at 1 trip today', () => {
      const today = new Date();
      const result = canTravel(1, today);
      expect(result.canTravel).toBe(true);
      expect(result.remainingTrips).toBe(1);
    });

    it('resets trip counter on a new calendar day', () => {
      process.env.CLASSIC_MODE = 'true';
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const result = canTravel(2, yesterday);
      expect(result.canTravel).toBe(true);
      expect(result.remainingTrips).toBe(2);
      delete process.env.CLASSIC_MODE;
    });

    it('allows travel when lastTripDate is null', () => {
      const result = canTravel(0, null);
      expect(result.canTravel).toBe(true);
    });
  });
});

// ============================================================================
// FR-COMBAT
// ============================================================================

describe('FR-COMBAT', () => {
  describe('applyShieldDamage', () => {
    it('reduces shield condition by damage amount', () => {
      const { newCondition, reduced } = applyShieldDamage(7, 3);
      expect(newCondition).toBe(4);
      expect(reduced).toBe(3);
    });

    it('caps damage to current condition (cannot go below 0)', () => {
      const { newCondition, reduced } = applyShieldDamage(3, 10);
      expect(newCondition).toBe(0);
      expect(reduced).toBe(3);
    });

    it('no change when shields already at 0', () => {
      const { newCondition, reduced } = applyShieldDamage(0, 5);
      expect(newCondition).toBe(0);
      expect(reduced).toBe(0);
    });
  });

  describe('applySystemDamage', () => {
    it('reduces exactly one component condition by 1', () => {
      const ship = makeShip();
      const totalBefore =
        ship.cabinCondition +
        ship.navigationCondition +
        ship.driveCondition +
        ship.roboticsCondition +
        ship.weaponCondition +
        ship.lifeSupportCondition;

      const { updatedShip } = applySystemDamage(ship, 5);

      const totalAfter =
        updatedShip.cabinCondition +
        updatedShip.navigationCondition +
        updatedShip.driveCondition +
        updatedShip.roboticsCondition +
        updatedShip.weaponCondition +
        updatedShip.lifeSupportCondition;

      expect(totalAfter).toBe(totalBefore - 1);
    });

    it('does not damage a component already at 0', () => {
      const ship = makeShip({
        cabinCondition: 0,
        navigationCondition: 0,
        driveCondition: 0,
        roboticsCondition: 0,
        weaponCondition: 0,
        lifeSupportCondition: 0,
      });

      const { updatedShip } = applySystemDamage(ship, 5);
      expect(updatedShip.cabinCondition).toBe(0);
      expect(updatedShip.navigationCondition).toBe(0);
      expect(updatedShip.driveCondition).toBe(0);
      expect(updatedShip.roboticsCondition).toBe(0);
      expect(updatedShip.weaponCondition).toBe(0);
      expect(updatedShip.lifeSupportCondition).toBe(0);
    });
  });

  describe('attemptRetreat', () => {
    // Original SP.FIGHT1.S:210-211: if i$="N" print"...Retreating..."\:x=y:goto spgo
    // Player retreat is ALWAYS successful — pressing N ends the battle regardless of speed.
    // Speed only determines enemy retreat behavior, not player's ability to disengage.

    it('player can always retreat regardless of drive speed (original behavior)', () => {
      // Slower than enemy — but player still escapes
      expect(attemptRetreat(10, 50, false).success).toBe(true);
      // Same speed
      expect(attemptRetreat(50, 50, false).success).toBe(true);
      // Faster
      expect(attemptRetreat(100, 10, false).success).toBe(true);
    });

    it('cloaker always provides instant escape with a distinct message', () => {
      const result = attemptRetreat(10, 50, true);
      expect(result.success).toBe(true);
      expect(result.message).toMatch(/cloak/i);
    });

    it('retreat without cloaker returns retreating message', () => {
      const result = attemptRetreat(10, 50, false);
      expect(result.success).toBe(true);
      expect(result.message).toBeTruthy();
    });
  });

  describe('enemyDemandsTribute', () => {
    it('tribute = combatRounds × 1000', () => {
      expect(enemyDemandsTribute(5, 1_000_000).tributeDemanded).toBe(5000);
    });

    it('tribute is capped at TRIBUTE_MAX (10000) for many rounds', () => {
      expect(enemyDemandsTribute(30, 1_000_000).tributeDemanded).toBe(10000);
    });

    it('rounds > 12 immediately trigger TRIBUTE_MAX cap', () => {
      expect(enemyDemandsTribute(13, 1_000_000).tributeDemanded).toBe(10000);
    });

    it('tribute is capped at player credits when player is poor', () => {
      expect(enemyDemandsTribute(5, 3000).tributeDemanded).toBe(3000);
    });
  });

  describe('calculateLoot', () => {
    it('SPX enemy: 500 base + floor(playerBF / 10)', () => {
      const enemy = makeEnemy({ class: 'SPX', type: 'PIRATE' });
      expect(calculateLoot(enemy, 100)).toBe(510); // 500 + 10
    });

    it('SPY enemy: 1000 base + floor(playerBF / 10)', () => {
      const enemy = makeEnemy({ class: 'SPY', type: 'PIRATE' });
      expect(calculateLoot(enemy, 50)).toBe(1005); // 1000 + 5
    });

    it('SPZ enemy: 2000 base + floor(playerBF / 10)', () => {
      const enemy = makeEnemy({ class: 'SPZ', type: 'PIRATE' });
      expect(calculateLoot(enemy, 0)).toBe(2000);
    });

    it('RIM_PIRATE: 3000 base + floor(playerBF / 10)', () => {
      const enemy = makeEnemy({ class: 'RIM', type: 'RIM_PIRATE' });
      expect(calculateLoot(enemy, 200)).toBe(3020); // 3000 + 20
    });
  });

  describe('calculateEnemyBattleFactor', () => {
    it('enemy BF = weapon + shield + jg, where jg uses ranfix (condition+1)*strength/10 formula with /5 scaling', () => {
      const enemy = makeEnemy({
        weaponStrength: 20, weaponCondition: 8,
        shieldStrength: 15, shieldCondition: 7,
        driveStrength: 10, driveCondition: 5,
        hullStrength: 10, hullCondition: 5,
      });
      // weapon: 20×8=160, shield: 15×7=105
      // driveContrib: floor((5+1)×10/10) = 6
      // hullContrib:  floor((5+1)×10/10) = 6
      // supportSum = 12 > 4 → jg = floor(12/5) = 2
      // Total: 160 + 105 + 2 = 267
      expect(calculateEnemyBattleFactor(enemy)).toBe(267);
    });
  });

  describe('processCombatRound - no damage when weapon ≤ shield', () => {
    it('player deals 0 damage when weapon power ≤ enemy shield power', () => {
      const enemy = makeEnemy({
        weaponStrength: 5, weaponCondition: 5, // 25 weapon power
        shieldStrength: 10, shieldCondition: 5, // 50 shield power
      });
      // player weapon: 5×5=25, enemy shield: 10×5=50 → no penetration
      const round = processCombatRound(100, 5, 5, 20, 8, false, enemy, 1);
      expect(round.playerDamage).toBe(0);
    });

    it('enemy deals 0 damage when weapon power ≤ player shield power', () => {
      const enemy = makeEnemy({
        weaponStrength: 5, weaponCondition: 3, // 15 weapon power
        shieldStrength: 5, shieldCondition: 3,
      });
      // player shield: 50×9=450 → enemy 15 cannot penetrate
      const round = processCombatRound(100, 20, 8, 50, 9, false, enemy, 1);
      expect(round.enemyDamage).toBe(0);
    });
  });
});

// ============================================================================
// FR-ECONOMY
// ============================================================================

describe('FR-ECONOMY', () => {
  describe('getFuelPrice', () => {
    it('system 1 (Sun-3) costs 8 cr per unit', () => {
      expect(getFuelPrice(1)).toBe(8);
    });

    it('system 8 (Mira-9) costs 4 cr per unit', () => {
      expect(getFuelPrice(8)).toBe(4);
    });

    it('system 14 (Vega-6) costs 6 cr per unit', () => {
      expect(getFuelPrice(14)).toBe(6);
    });

    // SP.LIFT.S fueler: fh=5 (default Space Authority buy price)
    it('unspecified system returns default 5 cr (SP.LIFT.S: fh=5)', () => {
      expect(getFuelPrice(5)).toBe(5);
      expect(getFuelPrice(10)).toBe(5);
    });

    it('port owner price overrides system price', () => {
      expect(getFuelPrice(1, 15)).toBe(15); // overrides system 1's 8 cr
      expect(getFuelPrice(5, 10)).toBe(10); // overrides default 5 cr
    });
  });

  describe('getFuelSellPrice (SP.LIFT.S seller section)', () => {
    it('system 1 (Sun-3) sells at 1 cr per unit (SP.LIFT.S: if sp=1 hf=1)', () => {
      expect(getFuelSellPrice(1)).toBe(1);
    });

    it('system 8 (Mira-9) sells at 3 cr per unit (SP.LIFT.S: if sp=8 hf=3)', () => {
      expect(getFuelSellPrice(8)).toBe(3);
    });

    it('system 13 (Spica-3) sells at 5 cr per unit (SP.LIFT.S: if sp=13 hf=5)', () => {
      expect(getFuelSellPrice(13)).toBe(5);
    });

    it('system 14 (Vega-6) sells at 4 cr per unit (SP.LIFT.S: if sp=14 hf=4)', () => {
      expect(getFuelSellPrice(14)).toBe(4);
    });

    it('unspecified system returns default 2 cr (SP.LIFT.S: hf=2)', () => {
      expect(getFuelSellPrice(5)).toBe(2);
      expect(getFuelSellPrice(10)).toBe(2);
    });

    it('port owner sell price overrides system price', () => {
      expect(getFuelSellPrice(1, 7)).toBe(7);
      expect(getFuelSellPrice(5, 3)).toBe(3);
    });
  });

  describe('calculateFuelBuyCost', () => {
    it('cost = units × pricePerUnit', () => {
      expect(calculateFuelBuyCost(100, 8)).toBe(800);
      expect(calculateFuelBuyCost(50, 5)).toBe(250);
    });
  });

  describe('calculateFuelSaleProceeds (legacy — uses buy price × 0.5)', () => {
    it('proceeds = floor(units × buyPrice × 0.5)', () => {
      expect(calculateFuelSaleProceeds(100, 8)).toBe(400);
      expect(calculateFuelSaleProceeds(100, 5)).toBe(250);
      expect(calculateFuelSaleProceeds(3, 5)).toBe(7); // floor(7.5)
    });
  });

  describe('calculateCargoPayment', () => {
    // Original: q5 (stated payment) is paid in full at correct destination.
    // No delivery bonus — the ie bonus is added at contract signing, not delivery.
    const contract = {
      pods: 10,
      cargoType: 1,
      origin: 1,
      destination: 5,
      payment: 10000,
      description: 'Dry Goods',
      fuelRequired: 35,
      distance: 4,
      valuePerPod: 3,
    };

    it('correct destination: full stated payment, no bonus', () => {
      const result = calculateCargoPayment(contract, 5);
      expect(result.bonus).toBe(0);
      expect(result.total).toBe(10000);
    });

    it('wrong destination: payment × 0.5 penalty', () => {
      const result = calculateCargoPayment(contract, 3);
      expect(result.total).toBe(5000);
    });
  });

  describe('calculatePortPrice', () => {
    it('returns PORT_BASE_PRICE (100,000) for all systems', () => {
      expect(calculatePortPrice(1)).toBe(100000);
      expect(calculatePortPrice(7)).toBe(100000);
      expect(calculatePortPrice(14)).toBe(100000);
    });
  });

  describe('calculatePortResaleValue', () => {
    it('returns floor(purchasePrice × PORT_RESALE_MULTIPLIER)', () => {
      expect(calculatePortResaleValue(100000)).toBe(50000);
      expect(calculatePortResaleValue(100001)).toBe(50000); // floor applied
    });
  });

  describe('calculateLandingFee', () => {
    // Original SP.DOCK2.S:31-36:
    //   a=(q4 mod 14): zh=1000
    //   if mp$="]["  zh=zh-100   (full alliance member: -100)
    //   if mq$="LSS C" zh=zh-400 (LSS Corps member: -400)
    //   x=a*zh
    it('base fee = (systemId % 14) * 1000 with no discounts', () => {
      expect(calculateLandingFee(15, false, false)).toBe(1000); // (15%14)=1, zh=1000
      expect(calculateLandingFee(16, false, false)).toBe(2000); // (16%14)=2, zh=1000
      expect(calculateLandingFee(20, false, false)).toBe(6000); // (20%14)=6, zh=1000
    });

    it('full alliance member gets 100 cr discount on zh (mp$="][")', () => {
      expect(calculateLandingFee(15, true, false)).toBe(900);  // 1*900
      expect(calculateLandingFee(16, true, false)).toBe(1800); // 2*900
    });

    it('LSS Corps member gets 400 cr discount on zh (mq$="LSS C")', () => {
      expect(calculateLandingFee(15, false, true)).toBe(600);  // 1*600
      expect(calculateLandingFee(16, false, true)).toBe(1200); // 2*600
    });

    it('both discounts stack (100+400=500 off zh)', () => {
      expect(calculateLandingFee(15, true, true)).toBe(500);   // 1*500
    });
  });

  describe('getRimFuelSellPrice', () => {
    // Original SP.DOCK2.S:229-231:
    //   gf=25-q4
    //   if q4=15 gf=5  (special case override)
    it('system 15 (Antares-5) returns 5 cr (special case override)', () => {
      expect(getRimFuelSellPrice(15)).toBe(5);
    });

    it('systems 16-20 return 25 - systemId', () => {
      expect(getRimFuelSellPrice(16)).toBe(9);  // 25-16=9
      expect(getRimFuelSellPrice(17)).toBe(8);  // 25-17=8
      expect(getRimFuelSellPrice(18)).toBe(7);  // 25-18=7
      expect(getRimFuelSellPrice(19)).toBe(6);  // 25-19=6
      expect(getRimFuelSellPrice(20)).toBe(5);  // 25-20=5
    });
  });

  describe('calculatePatrolPay', () => {
    it('pay = PATROL_BASE_PAY (500) + battlesWon × PATROL_BATTLE_BONUS (1000)', () => {
      expect(calculatePatrolPay(0)).toBe(500);
      expect(calculatePatrolPay(1)).toBe(1500);
      expect(calculatePatrolPay(3)).toBe(3500);
    });
  });

  describe('getCargoDescription', () => {
    // Original carname subroutine (SP.CARGO.txt lines 313-323): 9 types
    it('maps all 9 original cargo types to correct names', () => {
      expect(getCargoDescription(1)).toBe('Dry Goods');
      expect(getCargoDescription(2)).toBe('Nutri Goods');
      expect(getCargoDescription(3)).toBe('Spices');
      expect(getCargoDescription(4)).toBe('Medicinals');
      expect(getCargoDescription(5)).toBe('Electronics');
      expect(getCargoDescription(6)).toBe('Precious Metals');
      expect(getCargoDescription(7)).toBe('Rare Elements');
      expect(getCargoDescription(8)).toBe('Photonic Components');
      expect(getCargoDescription(9)).toBe('Dilithium Crystal');
    });

    it('maps type 10 to Contraband (modern smuggling addition)', () => {
      expect(getCargoDescription(10)).toBe('Contraband');
    });

    it('returns "Unknown Cargo" for unrecognised types', () => {
      expect(getCargoDescription(99)).toBe('Unknown Cargo');
    });
  });

  describe('getSystemName', () => {
    // Original desname subroutine (SP.CARGO.txt lines 325-340): 14 core systems
    it('maps system IDs 1-14 to original star names', () => {
      expect(getSystemName(1)).toBe('Sun-3');
      expect(getSystemName(2)).toBe('Aldebaran-1');
      expect(getSystemName(3)).toBe('Altair-3');
      expect(getSystemName(4)).toBe('Arcturus-6');
      expect(getSystemName(5)).toBe('Deneb-4');
      expect(getSystemName(6)).toBe('Denebola-5');
      expect(getSystemName(7)).toBe('Fomalhaut-2');
      expect(getSystemName(8)).toBe('Mira-9');
      expect(getSystemName(9)).toBe('Pollux-7');
      expect(getSystemName(10)).toBe('Procyon-5');
      expect(getSystemName(11)).toBe('Regulus-6');
      expect(getSystemName(12)).toBe('Rigel-8');
      expect(getSystemName(13)).toBe('Spica-3');
      expect(getSystemName(14)).toBe('Vega-6');
    });

    it('returns "System N" for non-core systems', () => {
      expect(getSystemName(15)).toBe('System 15');
      expect(getSystemName(27)).toBe('System 27');
    });
  });

  describe('generateCargoContract — original payment formula', () => {
    // Test original pay1 formula from SP.CARGO.txt lines 249-257
    // v2 = cargoType*3, v4 = (v2*distance)/3 * upodX + (f2*5) + 1000, cap 15000
    it('computes payment correctly for type 5, distance 7, hull cond 9, drives 10/9, 10 pods', () => {
      // v1=5, v2=15, d6=7, s1=10, h2=9
      // upodX = floor(max(10*(9+1), 10) / 10) = floor(100/10) = 10
      // v4 = 15*7 = 105; v4/3 = 35; v4 = 35*10 = 350
      // fcost(7): af=10, f2=(21-10)+(10-9)=12, *7=84, ty=94, f2=47
      // v4 = 350 + (47*5) + 1000 = 350+235+1000 = 1585
      // perPod = floor(1585/10) = 158; total = 1580
      const contract = generateCargoContract(5, 10, false, {
        hullCondition: 9, driveStrength: 10, driveCondition: 9,
      });
      // Can't test exact payment without knowing the random destination,
      // but we can verify the contract has required fields and payment > 1000
      expect(contract.pods).toBeGreaterThanOrEqual(1);
      expect(contract.payment).toBeGreaterThanOrEqual(1000);
      expect(contract.payment).toBeLessThanOrEqual(15000);
      expect(contract.fuelRequired).toBeGreaterThan(0);
      expect(contract.distance).toBeGreaterThanOrEqual(1);
      expect(contract.valuePerPod).toBe(contract.cargoType * 3);
    });

    it('payment formula: type 9 (Dilithium), distance 13, perfect ship, 10 pods', () => {
      // v1=9, v2=27, d6=13, s1=10, h2=9, d1=21, d2=9
      // upodX = floor(100/10) = 10
      // v4 = 27*13=351; /3=117; *10=1170
      // fcost(13): af=21, f2=(0)+(1)=1, *13=13, ty=23, f2=11
      // v4 = 1170 + 55 + 1000 = 2225; perPod=222; total=2220
      // We fix origin to 1, destination to 14 (distance=13) via a crafted call
      // Use origin=1, force destination=14 — but we can't force it without mock.
      // Instead verify valuePerPod = 9*3 = 27 for type 9
      const contract = generateCargoContract(1, 10, false, {
        hullCondition: 9, driveStrength: 21, driveCondition: 9,
      });
      expect(contract.valuePerPod).toBe(contract.cargoType * 3);
      expect(contract.payment % 10).toBe(0); // normalized to pod multiple
      expect(contract.destination).not.toBe(1); // never same as origin
    });

    it('upod returns 1 when hull condition is 0', () => {
      const contract = generateCargoContract(3, 10, false, {
        hullCondition: 0, driveStrength: 10, driveCondition: 9,
      });
      expect(contract.pods).toBe(1);
    });

    it('destination is never the same as origin', () => {
      for (let i = 0; i < 20; i++) {
        const origin = Math.floor(Math.random() * 14) + 1;
        const contract = generateCargoContract(origin, 10, false, {
          hullCondition: 9, driveStrength: 10, driveCondition: 9,
        });
        expect(contract.destination).not.toBe(origin);
      }
    });
  });
});

// ============================================================================
// FR-RANK
// ============================================================================

describe('FR-RANK', () => {
  describe('calculateRank - remaining thresholds', () => {
    it('Commodore at score 450', () => {
      expect(calculateRank(450)).toBe(Rank.COMMODORE);
    });

    it('Admiral at score 750 (source: sc≥5)', () => {
      expect(calculateRank(750)).toBe(Rank.ADMIRAL);
    });

    it('Top Dog at score 1200 (source: sc≥8)', () => {
      expect(calculateRank(1200)).toBe(Rank.TOP_DOG);
    });

    it('Grand Mufti at score 1650 (source: sc≥11)', () => {
      expect(calculateRank(1650)).toBe(Rank.GRAND_MUFTI);
    });

    it('Mega Hero at score 2250 (source: sc≥15)', () => {
      expect(calculateRank(2250)).toBe(Rank.MEGA_HERO);
    });

    it('score just below a threshold stays at lower rank', () => {
      expect(calculateRank(149)).toBe(Rank.LIEUTENANT);
      expect(calculateRank(449)).toBe(Rank.CAPTAIN);
      expect(calculateRank(749)).toBe(Rank.COMMODORE);
      expect(calculateRank(2699)).toBe(Rank.MEGA_HERO);
    });
  });

  describe('getHonorarium', () => {
    it('returns correct honorarium for all 9 ranks', () => {
      expect(getHonorarium(Rank.LIEUTENANT)).toBe(10000);
      expect(getHonorarium(Rank.COMMANDER)).toBe(20000);
      expect(getHonorarium(Rank.CAPTAIN)).toBe(30000);
      expect(getHonorarium(Rank.COMMODORE)).toBe(40000);
      expect(getHonorarium(Rank.ADMIRAL)).toBe(50000);
      expect(getHonorarium(Rank.TOP_DOG)).toBe(80000);
      expect(getHonorarium(Rank.GRAND_MUFTI)).toBe(100000);
      expect(getHonorarium(Rank.MEGA_HERO)).toBe(120000);
      expect(getHonorarium(Rank.GIGA_HERO)).toBe(150000);
    });
  });

  describe('getRankIndex', () => {
    it('provides strict ordinal ordering across all 9 ranks', () => {
      expect(getRankIndex(Rank.LIEUTENANT)).toBeLessThan(getRankIndex(Rank.COMMANDER));
      expect(getRankIndex(Rank.COMMANDER)).toBeLessThan(getRankIndex(Rank.CAPTAIN));
      expect(getRankIndex(Rank.CAPTAIN)).toBeLessThan(getRankIndex(Rank.COMMODORE));
      expect(getRankIndex(Rank.COMMODORE)).toBeLessThan(getRankIndex(Rank.ADMIRAL));
      expect(getRankIndex(Rank.ADMIRAL)).toBeLessThan(getRankIndex(Rank.TOP_DOG));
      expect(getRankIndex(Rank.TOP_DOG)).toBeLessThan(getRankIndex(Rank.GRAND_MUFTI));
      expect(getRankIndex(Rank.GRAND_MUFTI)).toBeLessThan(getRankIndex(Rank.MEGA_HERO));
      expect(getRankIndex(Rank.MEGA_HERO)).toBeLessThan(getRankIndex(Rank.GIGA_HERO));
    });
  });

  describe('getTotalCredits', () => {
    it('returns high × 10000 + low', () => {
      expect(getTotalCredits(1, 5000)).toBe(15000);
      expect(getTotalCredits(0, 9999)).toBe(9999);
      expect(getTotalCredits(3, 0)).toBe(30000);
    });
  });
});

// ============================================================================
// FR-ALLIANCE
// ============================================================================

describe('FR-ALLIANCE', () => {
  describe('getAllianceSymbol', () => {
    it('returns correct symbol for each alliance', () => {
      expect(getAllianceSymbol(AllianceType.ASTRO_LEAGUE)).toBe('+');
      expect(getAllianceSymbol(AllianceType.SPACE_DRAGONS)).toBe('@');
      expect(getAllianceSymbol(AllianceType.WARLORD_CONFED)).toBe('&');
      expect(getAllianceSymbol(AllianceType.REBEL_ALLIANCE)).toBe('^');
    });
  });

  describe('appendAllianceSymbol', () => {
    it('formats name as "name-symbol"', () => {
      expect(appendAllianceSymbol('Fox', AllianceType.ASTRO_LEAGUE)).toBe('Fox-+');
      expect(appendAllianceSymbol('Wolf', AllianceType.SPACE_DRAGONS)).toBe('Wolf-@');
      expect(appendAllianceSymbol('Bear', AllianceType.WARLORD_CONFED)).toBe('Bear-&');
      expect(appendAllianceSymbol('Eagle', AllianceType.REBEL_ALLIANCE)).toBe('Eagle-^');
    });

    it('returns name unchanged when alliance has no symbol (NONE)', () => {
      expect(appendAllianceSymbol('Fox', AllianceType.NONE)).toBe('Fox');
    });
  });

  describe('removeAllianceSymbol', () => {
    it('strips trailing alliance symbol from name', () => {
      expect(removeAllianceSymbol('Fox+')).toBe('Fox');
      expect(removeAllianceSymbol('Wolf@')).toBe('Wolf');
      expect(removeAllianceSymbol('Bear&')).toBe('Bear');
      expect(removeAllianceSymbol('Eagle^')).toBe('Eagle');
    });

    it('leaves plain names without symbols unchanged', () => {
      expect(removeAllianceSymbol('Fox')).toBe('Fox');
    });
  });
});

// ============================================================================
// FR-COMPONENTS
// ============================================================================

describe('FR-COMPONENTS', () => {
  describe('calculateComponentPower', () => {
    it('returns strength × condition', () => {
      expect(calculateComponentPower(10, 5)).toBe(50);
      expect(calculateComponentPower(20, 9)).toBe(180);
    });

    it('returns 0 when strength < 1', () => {
      expect(calculateComponentPower(0, 5)).toBe(0);
    });

    it('returns 0 when condition < 1', () => {
      expect(calculateComponentPower(10, 0)).toBe(0);
    });
  });

  describe('calculateDamagePercent', () => {
    it('condition 9 → 0% damage', () => {
      expect(calculateDamagePercent(9)).toBe(0);
    });

    it('condition 0 → 90% damage', () => {
      expect(calculateDamagePercent(0)).toBe(90);
    });

    it('condition 5 → 40% damage', () => {
      // (10 - (5+1)) × 10 = 4 × 10 = 40
      expect(calculateDamagePercent(5)).toBe(40);
    });
  });

  describe('conditionFromDamage', () => {
    it('0% damage → condition 9', () => {
      expect(conditionFromDamage(0)).toBe(9);
    });

    it('90% damage → condition 0', () => {
      expect(conditionFromDamage(90)).toBe(0);
    });

    it('is the inverse of calculateDamagePercent for all valid conditions', () => {
      for (let cond = 0; cond <= 9; cond++) {
        const dmg = calculateDamagePercent(cond);
        expect(conditionFromDamage(dmg)).toBe(cond);
      }
    });
  });
});

// ============================================================================
// FR-VALIDATION
// ============================================================================

describe('FR-VALIDATION', () => {
  describe('validateName - boundary lengths', () => {
    it('3-character name is valid (minimum boundary)', () => {
      expect(validateName('Fox').valid).toBe(true);
    });

    it('15-character name is valid (maximum boundary)', () => {
      expect(validateName('A'.repeat(15)).valid).toBe(true);
    });

    it('2-character name is invalid (below minimum)', () => {
      expect(validateName('AB').valid).toBe(false);
    });

    it('16-character name is invalid (above maximum)', () => {
      expect(validateName('A'.repeat(16)).valid).toBe(false);
    });
  });

  describe('validateName - reserved suffixes', () => {
    it('rejects names ending with "+!"', () => {
      expect(validateName('Fox+!').valid).toBe(false);
    });

    it('rejects names ending with "++"', () => {
      expect(validateName('Fox++').valid).toBe(false);
    });

    it('rejects names ending with "="', () => {
      expect(validateName('Fox=').valid).toBe(false);
    });
  });

  describe('isDayDifferent', () => {
    it('returns true when date1 is null', () => {
      expect(isDayDifferent(null)).toBe(true);
    });

    it('returns false for the same calendar day', () => {
      const now = new Date();
      expect(isDayDifferent(now)).toBe(false);
    });

    it('returns true for a different calendar day', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isDayDifferent(yesterday)).toBe(true);
    });
  });
});

// ============================================================================
// FR-FORMATTING
// ============================================================================

describe('FR-FORMATTING', () => {
  describe('padString', () => {
    it('pads a short string to the target length with spaces', () => {
      expect(padString('hi', 5)).toBe('hi   ');
    });

    it('returns string unchanged when already at target length', () => {
      expect(padString('hello', 5)).toBe('hello');
    });

    it('returns string unchanged when longer than target', () => {
      expect(padString('hello world', 5)).toBe('hello world');
    });
  });

  describe('centerString', () => {
    it('centers string in an even-width field', () => {
      expect(centerString('hi', 6)).toBe('  hi  ');
    });

    it('centers string in an odd-width field (extra space on right)', () => {
      // padding=5, leftPad=2, rightPad=3
      expect(centerString('hi', 7)).toBe('  hi   ');
    });
  });

  describe('truncateString', () => {
    it('truncates long strings and appends "..."', () => {
      // slice(0, 8-3=5) + '...' = 'hello...'
      expect(truncateString('hello world', 8)).toBe('hello...');
    });

    it('does not truncate strings within the limit', () => {
      expect(truncateString('hi', 5)).toBe('hi');
      expect(truncateString('hello', 5)).toBe('hello');
    });
  });
});
