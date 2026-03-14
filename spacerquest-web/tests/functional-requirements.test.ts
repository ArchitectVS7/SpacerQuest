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
  calculateFuelBuyCost,
  calculateFuelSaleProceeds,
  calculateCargoPayment,
  calculatePortPrice,
  calculatePortResaleValue,
  calculateLandingFee,
  calculatePatrolPay,
  getCargoDescription,
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
      expect(result.remainingTrips).toBe(3);
    });

    it('blocks travel at 3 trips today', () => {
      const today = new Date();
      const result = canTravel(3, today);
      expect(result.canTravel).toBe(false);
      expect(result.remainingTrips).toBe(0);
    });

    it('returns correct remainingTrips at 1 trip today', () => {
      const today = new Date();
      const result = canTravel(1, today);
      expect(result.canTravel).toBe(true);
      expect(result.remainingTrips).toBe(2);
    });

    it('resets trip counter on a new calendar day', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const result = canTravel(3, yesterday);
      expect(result.canTravel).toBe(true);
      expect(result.remainingTrips).toBe(3);
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
    it('cloaker provides ~70% escape when player drive is weaker', () => {
      // Player slower → only cloaker can save. Success rate ≈ 70%.
      let successes = 0;
      const trials = 2000;
      for (let i = 0; i < trials; i++) {
        if (attemptRetreat(10, 50, true).success) successes++;
      }
      const rate = successes / trials;
      expect(rate).toBeGreaterThan(0.55);
      expect(rate).toBeLessThan(0.85);
    });

    it('always fails when player is slower and has no cloaker', () => {
      for (let i = 0; i < 100; i++) {
        expect(attemptRetreat(10, 50, false).success).toBe(false);
      }
    });

    it('faster player has ~50% escape chance without cloaker', () => {
      let successes = 0;
      const trials = 2000;
      for (let i = 0; i < trials; i++) {
        if (attemptRetreat(100, 10, false).success) successes++;
      }
      const rate = successes / trials;
      expect(rate).toBeGreaterThan(0.35);
      expect(rate).toBeLessThan(0.65);
    });
  });

  describe('enemyDemandsTribute', () => {
    it('tribute = combatRounds × 1000', () => {
      expect(enemyDemandsTribute(5, 1_000_000).tributeDemanded).toBe(5000);
    });

    it('tribute is capped at TRIBUTE_MAX (20000) for many rounds', () => {
      expect(enemyDemandsTribute(30, 1_000_000).tributeDemanded).toBe(20000);
    });

    it('rounds > 12 immediately trigger TRIBUTE_MAX cap', () => {
      expect(enemyDemandsTribute(13, 1_000_000).tributeDemanded).toBe(20000);
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
    it('enemy BF = (weaponStr × weaponCond) + (shieldStr × shieldCond)', () => {
      const enemy = makeEnemy({
        weaponStrength: 20, weaponCondition: 8,
        shieldStrength: 15, shieldCondition: 7,
      });
      // 20×8 + 15×7 = 160 + 105 = 265
      expect(calculateEnemyBattleFactor(enemy)).toBe(265);
    });
  });

  describe('processCombatRound - no damage when weapon ≤ shield', () => {
    it('player deals 0 damage when weapon power ≤ enemy shield power', () => {
      const enemy = makeEnemy({
        weaponStrength: 5, weaponCondition: 5, // 25 weapon power
        shieldStrength: 10, shieldCondition: 5, // 50 shield power
      });
      // player weapon: 5×5=25, enemy shield: 10×5=50 → no penetration
      const round = processCombatRound(100, 5, 5, 20, 8, enemy, 1);
      expect(round.playerDamage).toBe(0);
    });

    it('enemy deals 0 damage when weapon power ≤ player shield power', () => {
      const enemy = makeEnemy({
        weaponStrength: 5, weaponCondition: 3, // 15 weapon power
        shieldStrength: 5, shieldCondition: 3,
      });
      // player shield: 50×9=450 → enemy 15 cannot penetrate
      const round = processCombatRound(100, 20, 8, 50, 9, enemy, 1);
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

    it('unspecified system returns default 25 cr', () => {
      expect(getFuelPrice(5)).toBe(25);
      expect(getFuelPrice(10)).toBe(25);
    });

    it('port owner price overrides system price', () => {
      expect(getFuelPrice(1, 15)).toBe(15); // overrides system 1's 8 cr
      expect(getFuelPrice(5, 10)).toBe(10); // overrides default 25 cr
    });
  });

  describe('calculateFuelBuyCost', () => {
    it('cost = units × pricePerUnit', () => {
      expect(calculateFuelBuyCost(100, 8)).toBe(800);
      expect(calculateFuelBuyCost(50, 25)).toBe(1250);
    });
  });

  describe('calculateFuelSaleProceeds', () => {
    it('proceeds = floor(units × buyPrice × 0.5)', () => {
      expect(calculateFuelSaleProceeds(100, 8)).toBe(400);
      expect(calculateFuelSaleProceeds(100, 25)).toBe(1250);
      expect(calculateFuelSaleProceeds(3, 25)).toBe(37); // floor(37.5)
    });
  });

  describe('calculateCargoPayment', () => {
    const contract = {
      pods: 10,
      cargoType: 1,
      origin: 1,
      destination: 5,
      payment: 10000,
      description: 'Titanium Ore',
    };

    it('correct destination: full payment + 10% bonus', () => {
      const result = calculateCargoPayment(contract, 5);
      expect(result.bonus).toBe(1000);
      expect(result.total).toBe(11000);
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
    it('fee = (hullStrength × 10) + ((15 - systemId) × 10)', () => {
      // hull=10, system=1: 100 + 140 = 240
      expect(calculateLandingFee(10, 1)).toBe(240);
      // hull=1, system=14: 10 + 10 = 20
      expect(calculateLandingFee(1, 14)).toBe(20);
    });

    it('minimum fee is 10 cr', () => {
      // hull=0, system=15: 0 + 0 = 0 → min 10
      expect(calculateLandingFee(0, 15)).toBe(10);
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
    it('maps cargo type numbers to names', () => {
      expect(getCargoDescription(1)).toBe('Titanium Ore');
      expect(getCargoDescription(2)).toBe('Capellan Herbals');
      expect(getCargoDescription(3)).toBe('Raw Dilithium');
      expect(getCargoDescription(4)).toBe('Mizarian Liquor');
      expect(getCargoDescription(10)).toBe('Contraband');
    });

    it('returns "Unknown Cargo" for unrecognised types', () => {
      expect(getCargoDescription(99)).toBe('Unknown Cargo');
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

    it('Top Dog at score 900', () => {
      expect(calculateRank(900)).toBe(Rank.TOP_DOG);
    });

    it('Grand Mufti at score 1100', () => {
      expect(calculateRank(1100)).toBe(Rank.GRAND_MUFTI);
    });

    it('Mega Hero at score 1350', () => {
      expect(calculateRank(1350)).toBe(Rank.MEGA_HERO);
    });

    it('score just below a threshold stays at lower rank', () => {
      expect(calculateRank(149)).toBe(Rank.LIEUTENANT);
      expect(calculateRank(449)).toBe(Rank.CAPTAIN);
      expect(calculateRank(2699)).toBe(Rank.MEGA_HERO);
    });
  });

  describe('getHonorarium', () => {
    it('returns correct honorarium for all 9 ranks', () => {
      expect(getHonorarium(Rank.LIEUTENANT)).toBe(0);
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
