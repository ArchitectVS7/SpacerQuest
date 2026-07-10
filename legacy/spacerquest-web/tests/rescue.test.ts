/**
 * SpacerQuest v4.0 - Rescue Service Tests
 *
 * Tests for the rescue service system and screen rendering
 * Based on original SP.REG.S lines 368-415
 */

import { describe, it, expect } from 'vitest';
import {
  validateRescueAttempt,
  calculateRescueRewards,
  renderRescueScreen,
  type LostShip,
} from '../src/game/systems/rescue';
import {
  RESCUE_FEE,
  RESCUE_FUEL_COST,
  RESCUE_POINTS_BONUS,
} from '../src/game/constants';

// ============================================================================
// RESCUE VALIDATION TESTS
// ============================================================================

describe('Rescue Service', () => {
  describe('validateRescueAttempt', () => {
    it('should allow rescue with sufficient fuel and not lost', () => {
      const result = validateRescueAttempt({
        fuel: 100,
        isLost: false,
      });
      expect(result.canRescue).toBe(true);
    });

    it('should deny rescue if rescuer is also lost', () => {
      const result = validateRescueAttempt({
        fuel: 100,
        isLost: true,
      });
      expect(result.canRescue).toBe(false);
      expect(result.reason).toMatch(/lost/i);
    });

    it('should deny rescue with insufficient fuel', () => {
      const result = validateRescueAttempt({
        fuel: RESCUE_FUEL_COST - 1,
        isLost: false,
      });
      expect(result.canRescue).toBe(false);
      expect(result.reason).toMatch(/fuel/i);
    });

    it('should accept exactly the minimum fuel', () => {
      const result = validateRescueAttempt({
        fuel: RESCUE_FUEL_COST,
        isLost: false,
      });
      expect(result.canRescue).toBe(true);
    });
  });

  describe('calculateRescueRewards', () => {
    it('should return correct fee from constants', () => {
      const rewards = calculateRescueRewards();
      expect(rewards.creditsFee).toBe(RESCUE_FEE);
    });

    it('should return correct fuel cost', () => {
      const rewards = calculateRescueRewards();
      expect(rewards.fuelCost).toBe(RESCUE_FUEL_COST);
    });

    it('should return correct score bonus', () => {
      // Original: s2=s2+11
      const rewards = calculateRescueRewards();
      expect(rewards.scoreBonus).toBe(RESCUE_POINTS_BONUS);
    });
  });

  describe('renderRescueScreen', () => {
    it('should show "no lost ships" when list is empty', () => {
      const output = renderRescueScreen([], 'TestRescuer');
      expect(output).toMatch(/no.*lost/i);
    });

    it('should list lost ships with their names and locations', () => {
      const lostShips: LostShip[] = [
        { id: '1', name: 'Captain Fox', shipName: 'MILLENNIA', lostLocation: 5, lostAt: new Date() },
        { id: '2', name: 'Admiral Vex', shipName: 'DARKSTAR', lostLocation: 12, lostAt: new Date() },
      ];
      const output = renderRescueScreen(lostShips, 'TestRescuer');

      expect(output).toContain('Captain Fox');
      expect(output).toContain('MILLENNIA');
      expect(output).toContain('Admiral Vex');
      expect(output).toContain('DARKSTAR');
    });

    it('should include entry numbers for selection', () => {
      const lostShips: LostShip[] = [
        { id: '1', name: 'Captain Fox', shipName: 'MILLENNIA', lostLocation: 5, lostAt: new Date() },
      ];
      const output = renderRescueScreen(lostShips, 'TestRescuer');
      expect(output).toMatch(/1\./);
    });

    it('should show rescue fee information', () => {
      const lostShips: LostShip[] = [
        { id: '1', name: 'Captain Fox', shipName: 'MILLENNIA', lostLocation: 5, lostAt: new Date() },
      ];
      const output = renderRescueScreen(lostShips, 'TestRescuer');
      expect(output).toContain(String(RESCUE_FEE));
    });

    it('should show fuel cost information', () => {
      const lostShips: LostShip[] = [
        { id: '1', name: 'Captain Fox', shipName: 'MILLENNIA', lostLocation: 5, lostAt: new Date() },
      ];
      const output = renderRescueScreen(lostShips, 'TestRescuer');
      expect(output).toContain(String(RESCUE_FUEL_COST));
    });
  });
});
