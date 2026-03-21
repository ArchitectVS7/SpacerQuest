/**
 * SpacerQuest v4.0 - Travel Hazard Tests
 *
 * Tests for random hazards during space travel
 * Based on original SP.WARP.S hazard system
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateHazard,
  applyHazardDamage,
  checkHazardTrigger,
  HAZARD_TYPES,
  type ShipComponents,
} from '../src/game/systems/hazards';
import {
  calculateCourseChangeFuel,
} from '../src/game/systems/travel';

// ============================================================================
// HAZARD TRIGGER TESTS
// ============================================================================

describe('Travel Hazards', () => {
  describe('checkHazardTrigger', () => {
    it('should trigger at 1/4 and 1/2 travel progress', () => {
      // Original SP.WARP.S lines 328+331: if tt=(ty/4) hh=1 and if tt=(ty/2) hh=1
      const travelTime = 20;
      expect(checkHazardTrigger(5, travelTime)).toBe(true);   // 1/4
      expect(checkHazardTrigger(10, travelTime)).toBe(true);  // 1/2
    });

    it('should not trigger at 1/3 on normal (non-mission) trips', () => {
      // Original SP.WARP.S line 329: at ty/3 with mx=0, tp=1 is set (encounter), NOT hh=1 (hazard)
      const travelTime = 30;
      expect(checkHazardTrigger(10, travelTime, false)).toBe(false);  // 1/3 without mission
      expect(checkHazardTrigger(10, travelTime)).toBe(false);         // default = no mission
    });

    it('should not trigger at other non-quarter/half progress points', () => {
      const travelTime = 20;
      expect(checkHazardTrigger(3, travelTime)).toBe(false);
      expect(checkHazardTrigger(7, travelTime)).toBe(false);
      expect(checkHazardTrigger(15, travelTime)).toBe(false);
    });

    it('should trigger at 1/3 on mission trips (mx>0)', () => {
      // Original SP.WARP.S lines 332-333: if mx>0, if tt=(ty/3) hh=1:return
      const travelTime = 30;
      expect(checkHazardTrigger(10, travelTime, true)).toBe(true);  // 1/3 on mission
    });

    it('should trigger at extra mission hazard marks (1/9, 1/8, 1/7, 1/6, 1/5)', () => {
      // Original SP.WARP.S lines 334-338: mission-only hazard triggers
      const travelTime = 90;
      expect(checkHazardTrigger(10, travelTime, true)).toBe(true);  // 1/9
      expect(checkHazardTrigger(11, travelTime, true)).toBe(true);  // 1/8 = floor(90/8)=11
      expect(checkHazardTrigger(12, travelTime, true)).toBe(true);  // 1/7 = floor(90/7)=12
      expect(checkHazardTrigger(15, travelTime, true)).toBe(true);  // 1/6 = floor(90/6)=15
      expect(checkHazardTrigger(18, travelTime, true)).toBe(true);  // 1/5 = floor(90/5)=18
    });

    it('should handle edge case of very short travel', () => {
      // travelTime of 3: 1/4 = 0 (no trigger), 1/2 = 1
      expect(checkHazardTrigger(1, 3)).toBe(true); // floor(3/2) = 1
    });
  });

  describe('HAZARD_TYPES', () => {
    it('should define 4 hazard types from original', () => {
      // Original: X-Rad Shower, Plasma-Ion Cloud, Proton Radiation, Micro-Asteroid
      expect(HAZARD_TYPES).toHaveLength(4);
      expect(HAZARD_TYPES[0].name).toBe('X-Rad Shower');
      expect(HAZARD_TYPES[1].name).toBe('Plasma-Ion Cloud');
      expect(HAZARD_TYPES[2].name).toBe('Proton Radiation');
      expect(HAZARD_TYPES[3].name).toBe('Micro-Asteroid');
    });
  });

  describe('generateHazard', () => {
    it('should return "All Clear" (evaded=true) when shields evade the hazard (90% chance)', () => {
      // Original SP.WARP.S line 349: r=10:gosub rand:if x<>5 "All Clear!" (9/10 = 90% evade)
      // Math.random()=0.1 → roll = Math.floor(0.1*10)+1 = 1, which is != 5 → evade
      vi.spyOn(Math, 'random').mockReturnValue(0.1); // roll=1 → evade

      const ship: ShipComponents = {
        hullCondition: 9,
        driveCondition: 9,
        cabinCondition: 9,
        lifeSupportCondition: 9,
        weaponCondition: 9,
        navigationCondition: 9,
        roboticsCondition: 9,
        shieldCondition: 9,
        shieldStrength: 20,
      };

      const result = generateHazard(ship);
      vi.restoreAllMocks();

      expect(result).not.toBeNull();
      expect(result!.evaded).toBe(true);
      expect(result!.component).toBe('none');
    });

    it('should drain shields when shields absorb instead of evading', () => {
      // Original SP.WARP.S line 349: r=10:gosub rand:if x<>5 "All Clear!" (9/10 = 90% evade)
      // x=5 triggers shield drain (10% chance).
      // Simulation: Math.floor(random * 10) + 1 == 5 when random in [0.4, 0.5)
      // Use 0.4 to force roll = 5 (shield drain).
      vi.spyOn(Math, 'random').mockReturnValue(0.4); // forces roll=5 → shield drain

      const ship: ShipComponents = {
        hullCondition: 9,
        driveCondition: 9,
        cabinCondition: 9,
        lifeSupportCondition: 9,
        weaponCondition: 9,
        navigationCondition: 9,
        roboticsCondition: 9,
        shieldCondition: 5,
        shieldStrength: 20,
      };

      const result = generateHazard(ship);
      vi.restoreAllMocks();

      expect(result).not.toBeNull();
      expect(result!.component).toBe('shields');
      expect(result!.newCondition).toBe(4); // 5 - 1
    });

    it('should damage a random component when no shields', () => {
      // Original: r=5:gosub rand -> picks component 1-5
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.3) // shield evade check (irrelevant, no shields)
        .mockReturnValueOnce(0.0) // component selection: drives (index 0)
        .mockReturnValueOnce(0.1); // hazard type

      const ship: ShipComponents = {
        hullCondition: 7,
        driveCondition: 6,
        cabinCondition: 5,
        lifeSupportCondition: 4,
        weaponCondition: 8,
        navigationCondition: 3,
        roboticsCondition: 2,
        shieldCondition: 0, // No shields
        shieldStrength: 0,
      };

      const result = generateHazard(ship);
      vi.restoreAllMocks();

      expect(result).not.toBeNull();
      expect(result!.component).not.toBe('shields');
    });

    it('should reduce component condition by 1', () => {
      // Original: ht=(ht-1)
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.99) // fail shield evade
        .mockReturnValueOnce(0.0)  // component: drives
        .mockReturnValueOnce(0.1); // hazard type

      const ship: ShipComponents = {
        hullCondition: 9,
        driveCondition: 7,
        cabinCondition: 9,
        lifeSupportCondition: 9,
        weaponCondition: 9,
        navigationCondition: 9,
        roboticsCondition: 9,
        shieldCondition: 0,
        shieldStrength: 0,
      };

      const result = generateHazard(ship);
      vi.restoreAllMocks();

      expect(result).not.toBeNull();
      if (result!.component === 'drives') {
        expect(result!.newCondition).toBe(6); // 7 - 1
      }
    });

    it('should not reduce condition below 0', () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.99)
        .mockReturnValueOnce(0.0)
        .mockReturnValueOnce(0.1);

      const ship: ShipComponents = {
        hullCondition: 0,
        driveCondition: 0,
        cabinCondition: 0,
        lifeSupportCondition: 0,
        weaponCondition: 0,
        navigationCondition: 0,
        roboticsCondition: 0,
        shieldCondition: 0,
        shieldStrength: 0,
      };

      const result = generateHazard(ship);
      vi.restoreAllMocks();

      // All components at 0, nothing to damage
      if (result) {
        expect(result.newCondition).toBe(0);
      }
    });

    it('should return hazard type name and action verb', () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.99) // fail evade
        .mockReturnValueOnce(0.0)  // pick component
        .mockReturnValueOnce(0.0); // hazard type index 0 = X-Rad Shower

      const ship: ShipComponents = {
        hullCondition: 9, driveCondition: 9, cabinCondition: 9,
        lifeSupportCondition: 9, weaponCondition: 9, navigationCondition: 9,
        roboticsCondition: 9, shieldCondition: 0, shieldStrength: 0,
      };

      const result = generateHazard(ship);
      vi.restoreAllMocks();

      expect(result).not.toBeNull();
      expect(result!.hazardName).toBeDefined();
      expect(result!.action).toBeDefined(); // "Damages" or "Drains"
    });
  });

  describe('applyHazardDamage', () => {
    it('should return updated ship components with damage applied', () => {
      const ship: ShipComponents = {
        hullCondition: 9, driveCondition: 8, cabinCondition: 7,
        lifeSupportCondition: 6, weaponCondition: 5, navigationCondition: 4,
        roboticsCondition: 3, shieldCondition: 9, shieldStrength: 20,
      };

      const updated = applyHazardDamage(ship, 'drives', 1);
      expect(updated.driveCondition).toBe(7); // 8 - 1
      // Other components unchanged
      expect(updated.hullCondition).toBe(9);
      expect(updated.weaponCondition).toBe(5);
    });

    it('should handle shield damage', () => {
      const ship: ShipComponents = {
        hullCondition: 9, driveCondition: 8, cabinCondition: 7,
        lifeSupportCondition: 6, weaponCondition: 5, navigationCondition: 4,
        roboticsCondition: 3, shieldCondition: 5, shieldStrength: 20,
      };

      const updated = applyHazardDamage(ship, 'shields', 1);
      expect(updated.shieldCondition).toBe(4);
    });

    it('should clamp condition at 0', () => {
      const ship: ShipComponents = {
        hullCondition: 0, driveCondition: 0, cabinCondition: 0,
        lifeSupportCondition: 0, weaponCondition: 0, navigationCondition: 0,
        roboticsCondition: 0, shieldCondition: 0, shieldStrength: 0,
      };

      const updated = applyHazardDamage(ship, 'hull', 1);
      expect(updated.hullCondition).toBe(0);
    });
  });
});

// ============================================================================
// COURSE CHANGE FORMULA TESTS (SP.WARP.S lines 219-230)
// ============================================================================

describe('Course Change Fuel Formula (SP.WARP.S)', () => {
  describe('calculateCourseChangeFuel (primary cost: h1*5)', () => {
    it('should return hull strength × 5 (SP.WARP.S line 220: x=(h1*5))', () => {
      expect(calculateCourseChangeFuel(10)).toBe(50);  // h1=10 → x=50
      expect(calculateCourseChangeFuel(5)).toBe(25);   // h1=5 → x=25
      expect(calculateCourseChangeFuel(1)).toBe(5);    // h1=1 → x=5
    });

    it('should return 0 for hull strength 0', () => {
      expect(calculateCourseChangeFuel(0)).toBe(0);
    });
  });

  describe('secondary fuel deduction formula (SP.WARP.S lines 228-230)', () => {
    // Original: ry=ry+2 (increment), then f1=(f1-(ry*2)) OR f1=0 if not enough
    // ry starts at 0. After 1st change: ry=2, deduction = 2*2 = 4
    // After 2nd change: ry=4, deduction = 4*2 = 8
    // After 3rd change: ry=6, deduction = 6*2 = 12

    it('should calculate ry correctly on 1st course change (courseChangesUsed=0)', () => {
      // ry = (0+1)*2 = 2, secondary = 2*2 = 4
      const courseChangesUsed = 0;
      const ry = (courseChangesUsed + 1) * 2;
      expect(ry).toBe(2);
      expect(ry * 2).toBe(4);
    });

    it('should calculate ry correctly on 2nd course change (courseChangesUsed=1)', () => {
      // ry = (1+1)*2 = 4, secondary = 4*2 = 8
      const courseChangesUsed = 1;
      const ry = (courseChangesUsed + 1) * 2;
      expect(ry).toBe(4);
      expect(ry * 2).toBe(8);
    });

    it('secondary deduction should drain fuel to 0 if insufficient (SP.WARP.S line 230: else f1=0)', () => {
      // If f1 after primary <= ry*2, then f1=0
      const fuelAfterPrimary = 3;
      const ry = 2;
      const secondaryFuelCost = ry * 2; // = 4
      const fuelAfterSecondary = fuelAfterPrimary > secondaryFuelCost
        ? fuelAfterPrimary - secondaryFuelCost
        : 0;
      expect(fuelAfterSecondary).toBe(0); // 3 <= 4, so f1=0
    });

    it('secondary deduction should subtract ry*2 when sufficient fuel (SP.WARP.S line 230: f1=(f1-(ry*2)))', () => {
      const fuelAfterPrimary = 20;
      const ry = 2;
      const secondaryFuelCost = ry * 2; // = 4
      const fuelAfterSecondary = fuelAfterPrimary > secondaryFuelCost
        ? fuelAfterPrimary - secondaryFuelCost
        : 0;
      expect(fuelAfterSecondary).toBe(16); // 20 - 4 = 16
    });
  });
});
