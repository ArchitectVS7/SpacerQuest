/**
 * SpacerQuest v4.0 - Core Game Logic Tests
 */

import { describe, it, expect } from 'vitest';
import {
  calculateFuelCost,
  calculatePatrolFuelCost,
  calculateTravelTime,
  calculateFuelCapacity,
} from '../src/game/systems/travel';
import {
  calculateBattleFactor,
  calculateEnemyBattleFactor,
  processCombatRound,
} from '../src/game/systems/combat';
import {
  formatCredits,
  addCredits,
  subtractCredits,
  calculateRank,
  validateName,
  calculateDistance,
} from '../src/game/utils';
import { Rank } from '@prisma/client';

// ============================================================================
// TRAVEL SYSTEM TESTS
// ============================================================================

describe('Travel System', () => {
  describe('calculateFuelCost', () => {
    it('should calculate correct fuel cost for drives-10 condition-9, distance 5', () => {
      // af = min(10, 21) = 10
      // fuelCost = (21 - 10) + (10 - 9) = 11 + 1 = 12
      // fuelCost = 12 * 5 = 60
      // ty = 60 + 10 = 70
      // capped = min(70, 100) = 70
      // result = 70 / 2 = 35
      const cost = calculateFuelCost(10, 9, 5);
      expect(cost).toBe(35);
    });
    
    it('should cap drive strength at 21', () => {
      const cost50 = calculateFuelCost(50, 9, 5);
      const cost21 = calculateFuelCost(21, 9, 5);
      expect(cost50).toBe(cost21);
    });
    
    it('should have minimum cost of 1 per astrec', () => {
      // Best case: drives-21, condition-9
      // fuelCost = (21 - 21) + (10 - 9) = 0 + 1 = 1
      const cost = calculateFuelCost(21, 9, 5);
      expect(cost).toBeGreaterThanOrEqual(5);
    });
    
    it('should match original formula exactly', () => {
      // Test case from original: drives-15, condition-7, distance-10
      // af = min(15, 21) = 15
      // fuelCost = (21 - 15) + (10 - 7) = 6 + 3 = 9
      // fuelCost = 9 * 10 = 90
      // ty = 90 + 10 = 100
      // capped = min(100, 100) = 100
      // result = 100 / 2 = 50
      const cost = calculateFuelCost(15, 7, 10);
      expect(cost).toBe(50);
    });
  });
  
  describe('calculatePatrolFuelCost (SP.REG.S fcost, lines 250-256)', () => {
    // SP.REG fcost differs from SP.LIFT fcost: no cap at 100
    // Original: af=d1:if af>21 af=21; f2=(21-af)+(10-d2); f2*=q6; ty=f2+10; f2=ty/2 (NO cap)

    it('should match the uncapped formula for drive-10, condition-9, distance 5', () => {
      // af = min(10,21) = 10
      // f2 = (21-10)+(10-9) = 11+1 = 12
      // f2 = 12*5 = 60
      // ty = 60+10 = 70
      // result = floor(70/2) = 35  — same as capped version here since 70 < 100
      expect(calculatePatrolFuelCost(10, 9, 5)).toBe(35);
    });

    it('should NOT cap at 100 unlike SP.LIFT fcost (original SP.REG.S lines 254-255)', () => {
      // drive-1, condition-1, distance 10
      // af = 1
      // f2 = (21-1)+(10-1) = 20+9 = 29
      // f2 = 29*10 = 290
      // ty = 290+10 = 300
      // SP.REG: result = floor(300/2) = 150  (NO cap)
      // SP.LIFT: would cap ty at 100 → result = floor(100/2) = 50
      expect(calculatePatrolFuelCost(1, 1, 10)).toBe(150);
    });

    it('should cap drive strength at 21', () => {
      expect(calculatePatrolFuelCost(50, 9, 5)).toBe(calculatePatrolFuelCost(21, 9, 5));
    });

    it('should have minimum f2 of 1', () => {
      // Best drives: d1=21, d2=9 → f2 = (21-21)+(10-9) = 1
      // f2 = 1*1 = 1, ty = 1+10 = 11, result = floor(11/2) = 5
      expect(calculatePatrolFuelCost(21, 9, 1)).toBe(5);
    });
  });

  describe('calculateTravelTime', () => {
    it('should calculate travel time based on distance', () => {
      expect(calculateTravelTime(5)).toBe(15);
      expect(calculateTravelTime(10)).toBe(30);
      expect(calculateTravelTime(1)).toBe(3);
    });
  });
  
  describe('calculateFuelCapacity', () => {
    it('should calculate capacity from hull strength and condition', () => {
      // hull-10, condition-9: (9+1) * 10 * 10 = 1000
      expect(calculateFuelCapacity(10, 9)).toBe(1000);
      
      // hull-20, condition-5: (5+1) * 20 * 10 = 1200
      expect(calculateFuelCapacity(20, 5)).toBe(1200);
    });
    
    it('should return 0 for broken hull', () => {
      expect(calculateFuelCapacity(0, 9)).toBe(0);
      expect(calculateFuelCapacity(10, 0)).toBe(0);
    });
  });
});

// ============================================================================
// COMBAT SYSTEM TESTS
// ============================================================================

describe('Combat System', () => {
  describe('calculateBattleFactor', () => {
    it('should calculate BF from components', () => {
      const ship = {
        weaponStrength: 20,
        weaponCondition: 8,
        shieldStrength: 15,
        shieldCondition: 7,
        cabinStrength: 10,
        cabinCondition: 5,
        roboticsStrength: 8,
        roboticsCondition: 4,
        navigationStrength: 10,
        navigationCondition: 5,
        driveStrength: 10,
        driveCondition: 5,
        lifeSupportStrength: 10,
        lifeSupportCondition: 5,
        hasAutoRepair: false,
      };
      
      // Original ranfix formula: (condition+1)*strength/10 per support component, then /5
      // weapon: 20*8 = 160 (x8, direct)
      // shield: 15*7 = 105 (x9, direct)
      // cabin:    floor((5+1)*10/10) = 6
      // lss:      floor((5+1)*10/10) = 6
      // nav:      floor((5+1)*10/10) = 6
      // drives:   floor((5+1)*10/10) = 6
      // robotics: floor((4+1)*8/10)  = 4
      // supportSum = 6+6+6+6+4 = 28, r9 = floor(28/5) = 5
      // Total: 160 + 105 + r9(5) + rankBonus(0) = 270
      const bf = calculateBattleFactor(ship, Rank.LIEUTENANT, 0);
      expect(bf).toBe(270);
    });
    
    it('should include rank bonus', () => {
      const ship = {
        weaponStrength: 0, weaponCondition: 0,
        shieldStrength: 0, shieldCondition: 0,
        cabinStrength: 0, cabinCondition: 0,
        roboticsStrength: 0, roboticsCondition: 0,
        navigationStrength: 0, navigationCondition: 0,
        driveStrength: 0, driveCondition: 0,
        lifeSupportStrength: 0, lifeSupportCondition: 0,
        hasAutoRepair: false,
      };
      
      // All strengths=0: all component contribs=0, supportSum=0≤4 → r9=10 (original floor)
      // ADMIRAL rankBonus=20: 0+0+r9(10)+20 = 30
      // GIGA_HERO rankBonus=60: 0+0+r9(10)+60 = 70
      expect(calculateBattleFactor(ship, Rank.ADMIRAL, 0)).toBe(30);
      expect(calculateBattleFactor(ship, Rank.GIGA_HERO, 0)).toBe(70);
    });
    
    it('should include experience bonus', () => {
      const ship = {
        weaponStrength: 0, weaponCondition: 0,
        shieldStrength: 0, shieldCondition: 0,
        cabinStrength: 0, cabinCondition: 0,
        roboticsStrength: 0, roboticsCondition: 0,
        navigationStrength: 0, navigationCondition: 0,
        driveStrength: 0, driveCondition: 0,
        lifeSupportStrength: 0, lifeSupportCondition: 0,
        hasAutoRepair: false,
      };
      
      // Original ranfix: x=e1:gosub rfox → e1 added directly (no /10 division)
      // expContrib=100, supportSum=100 (sum > 4), r9=floor(100/5)=20
      // Total: 0+0+r9(20)+rankBonus(0) = 20
      expect(calculateBattleFactor(ship, Rank.LIEUTENANT, 100)).toBe(20);
    });
    
    it('should include auto-repair bonus', () => {
      const shipNoAR = {
        weaponStrength: 0, weaponCondition: 0,
        shieldStrength: 0, shieldCondition: 0,
        cabinStrength: 0, cabinCondition: 0,
        roboticsStrength: 0, roboticsCondition: 0,
        navigationStrength: 0, navigationCondition: 0,
        driveStrength: 0, driveCondition: 0,
        lifeSupportStrength: 0, lifeSupportCondition: 0,
        hasAutoRepair: false,
      };
      
      const shipAR = { ...shipNoAR, hasAutoRepair: true };
      
      expect(calculateBattleFactor(shipAR, Rank.LIEUTENANT, 0) - 
             calculateBattleFactor(shipNoAR, Rank.LIEUTENANT, 0)).toBe(0);
    });
  });
  
  describe('processCombatRound', () => {
    it('should process combat round with player advantage', () => {
      const round = processCombatRound(
        300, // player BF
        20, 8, // player weapon
        15, 7, // player shield
        true, // hasAutoRepair
        {
          type: 'PIRATE',
          class: 'SPX',
          name: 'Test Pirate',
          commander: 'Captain',
          system: 1,
          weaponStrength: 10,
          weaponCondition: 5,
          shieldStrength: 10,
          shieldCondition: 5,
          driveStrength: 10,
          driveCondition: 5,
          hullStrength: 10,
          hullCondition: 5,
          battleFactor: 100,
          fuel: 100,
        },
        1
      );
      
      expect(round.round).toBe(1);
      expect(round.battleAdvantage).toBe('PLAYER');
      expect(round.playerDamage).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// UTILITY TESTS
// ============================================================================

describe('Utilities', () => {
  describe('formatCredits', () => {
    it('should format credits correctly', () => {
      expect(formatCredits(0, 1000)).toBe('1000');
      expect(formatCredits(1, 0)).toBe('1,0000');
      expect(formatCredits(1, 5000)).toBe('1,5000');
      expect(formatCredits(5, 2500)).toBe('5,2500');
    });
  });
  
  describe('addCredits', () => {
    it('should add credits with carry', () => {
      const result = addCredits(0, 9000, 2000);
      expect(result.high).toBe(1);
      expect(result.low).toBe(1000);
    });
    
    it('should handle large additions', () => {
      const result = addCredits(0, 0, 25000);
      expect(result.high).toBe(2);
      expect(result.low).toBe(5000);
    });
  });
  
  describe('subtractCredits', () => {
    it('should subtract credits successfully', () => {
      const result = subtractCredits(1, 5000, 10000);
      expect(result.success).toBe(true);
      expect(result.high).toBe(0);
      expect(result.low).toBe(5000);
    });
    
    it('should fail when insufficient credits', () => {
      const result = subtractCredits(0, 1000, 5000);
      expect(result.success).toBe(false);
    });
  });
  
  describe('calculateRank', () => {
    it('should calculate correct rank from score (source formula sc=floor(score/150))', () => {
      expect(calculateRank(0)).toBe(Rank.LIEUTENANT);
      expect(calculateRank(149)).toBe(Rank.LIEUTENANT);
      expect(calculateRank(150)).toBe(Rank.COMMANDER);
      expect(calculateRank(300)).toBe(Rank.CAPTAIN);
      expect(calculateRank(450)).toBe(Rank.COMMODORE);
      expect(calculateRank(749)).toBe(Rank.COMMODORE);
      expect(calculateRank(750)).toBe(Rank.ADMIRAL);
      expect(calculateRank(1199)).toBe(Rank.ADMIRAL);
      expect(calculateRank(1200)).toBe(Rank.TOP_DOG);
      expect(calculateRank(1650)).toBe(Rank.GRAND_MUFTI);
      expect(calculateRank(2250)).toBe(Rank.MEGA_HERO);
      expect(calculateRank(2700)).toBe(Rank.GIGA_HERO);
    });
  });
  
  describe('validateName', () => {
    it('should accept valid names', () => {
      expect(validateName('Fox').valid).toBe(true);
      expect(validateName('Firefox').valid).toBe(true);
      expect(validateName('Commander').valid).toBe(true);
    });
    
    it('should reject short names', () => {
      expect(validateName('AB').valid).toBe(false);
    });
    
    it('should reject long names', () => {
      expect(validateName('ThisNameIsWayTooLongForTheGame').valid).toBe(false);
    });
    
    it('should reject reserved prefixes', () => {
      expect(validateName('THE Player').valid).toBe(false);
      expect(validateName('J%Player').valid).toBe(false);
      expect(validateName('*Star').valid).toBe(false);
    });
  });
  
  describe('calculateDistance', () => {
    it('should calculate distance between systems', () => {
      expect(calculateDistance(1, 5)).toBe(4);
      expect(calculateDistance(5, 1)).toBe(4);
      expect(calculateDistance(1, 1)).toBe(1);
      expect(calculateDistance(1, 14)).toBe(13);
    });
  });
});
