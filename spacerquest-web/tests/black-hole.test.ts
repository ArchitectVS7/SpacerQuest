/**
 * SpacerQuest v4.0 - Black Hole Transit Tests
 *
 * Tests for Andromeda galaxy access gating via Astraxial hull
 * Based on original SP.WARP.S mechanics
 */

import { describe, it, expect } from 'vitest';
import {
  canTransitBlackHole,
  isAndromedaSystem,
  getBlackHoleTransitCost,
} from '../src/game/systems/black-hole';
import { CORE_SYSTEMS, RIM_SYSTEMS, ANDROMEDA_SYSTEMS } from '../src/game/constants';

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
      const result = canTransitBlackHole({
        isAstraxialHull: true,
        hullCondition: 9,
        driveCondition: 9,
        driveStrength: 30,
        fuel: 10,
      });
      expect(result.canTransit).toBe(false);
      expect(result.reason).toMatch(/fuel/i);
    });
  });

  describe('getBlackHoleTransitCost', () => {
    it('should return a fuel cost for black hole transit', () => {
      const cost = getBlackHoleTransitCost(30, 9);
      expect(cost).toBeGreaterThan(0);
    });

    it('should cost more with weaker drives', () => {
      const weakCost = getBlackHoleTransitCost(10, 5);
      const strongCost = getBlackHoleTransitCost(30, 9);
      expect(weakCost).toBeGreaterThan(strongCost);
    });
  });
});
