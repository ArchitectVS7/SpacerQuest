/**
 * SpacerQuest v4.0 - Combat State Persistence Tests
 *
 * Tests for combat disconnect mitigation.
 * When a player disconnects mid-combat, the combat should be resolved
 * server-side rather than cancelled.
 */

import { describe, it, expect } from 'vitest';
import {
  CombatState,
  createCombatState,
  resolveCombatOnDisconnect,
  isCombatActive,
} from '../src/game/systems/combat-state';

describe('Combat State Persistence', () => {
  // ============================================================================
  // STATE CREATION
  // ============================================================================

  describe('createCombatState', () => {
    it('should create a valid combat state', () => {
      const state = createCombatState(
        'char-123',
        { weaponPower: 160, shieldPower: 105, drivePower: 90, battleFactor: 278 },
        { weaponPower: 50, shieldPower: 50, drivePower: 45, battleFactor: 100, hullCondition: 5 },
        1
      );

      expect(state.characterId).toBe('char-123');
      expect(state.round).toBe(1);
      expect(state.active).toBe(true);
      expect(state.player.weaponPower).toBe(160);
      expect(state.enemy.battleFactor).toBe(100);
    });
  });

  // ============================================================================
  // ACTIVE CHECK
  // ============================================================================

  describe('isCombatActive', () => {
    it('should return true for active combat', () => {
      const state = createCombatState(
        'char-123',
        { weaponPower: 160, shieldPower: 105, drivePower: 90, battleFactor: 278 },
        { weaponPower: 50, shieldPower: 50, drivePower: 45, battleFactor: 100, hullCondition: 5 },
        1
      );
      expect(isCombatActive(state)).toBe(true);
    });

    it('should return false for resolved combat', () => {
      const state = createCombatState(
        'char-123',
        { weaponPower: 160, shieldPower: 105, drivePower: 90, battleFactor: 278 },
        { weaponPower: 50, shieldPower: 50, drivePower: 45, battleFactor: 100, hullCondition: 5 },
        1
      );
      state.active = false;
      expect(isCombatActive(state)).toBe(false);
    });

    it('should return false for null state', () => {
      expect(isCombatActive(null)).toBe(false);
    });
  });

  // ============================================================================
  // DISCONNECT RESOLUTION
  // ============================================================================

  describe('resolveCombatOnDisconnect', () => {
    it('should resolve combat to a final result', () => {
      const state = createCombatState(
        'char-123',
        { weaponPower: 160, shieldPower: 105, drivePower: 90, battleFactor: 278 },
        { weaponPower: 50, shieldPower: 50, drivePower: 45, battleFactor: 100, hullCondition: 5 },
        1
      );

      const result = resolveCombatOnDisconnect(state);

      expect(result.resolved).toBe(true);
      expect(['VICTORY', 'DEFEAT', 'DRAW']).toContain(result.outcome);
      expect(result.roundsPlayed).toBeGreaterThanOrEqual(1);
    });

    it('should not resolve already-resolved combat', () => {
      const state = createCombatState(
        'char-123',
        { weaponPower: 160, shieldPower: 105, drivePower: 90, battleFactor: 278 },
        { weaponPower: 50, shieldPower: 50, drivePower: 45, battleFactor: 100, hullCondition: 5 },
        1
      );
      state.active = false;

      const result = resolveCombatOnDisconnect(state);
      expect(result.resolved).toBe(false);
    });

    it('should mark combat as inactive after resolution', () => {
      const state = createCombatState(
        'char-123',
        { weaponPower: 160, shieldPower: 105, drivePower: 90, battleFactor: 278 },
        { weaponPower: 50, shieldPower: 50, drivePower: 45, battleFactor: 100, hullCondition: 5 },
        1
      );

      resolveCombatOnDisconnect(state);
      expect(state.active).toBe(false);
    });

    it('should favor player with higher battle factor', () => {
      // Run many trials to check statistical tendency
      let playerWins = 0;
      const trials = 100;

      for (let i = 0; i < trials; i++) {
        const state = createCombatState(
          'char-123',
          { weaponPower: 500, shieldPower: 400, drivePower: 200, battleFactor: 900 },
          { weaponPower: 10, shieldPower: 10, drivePower: 10, battleFactor: 20, hullCondition: 1 },
          1
        );

        const result = resolveCombatOnDisconnect(state);
        if (result.outcome === 'VICTORY') playerWins++;
      }

      // With overwhelming advantage, player should win most of the time
      expect(playerWins).toBeGreaterThan(50);
    });
  });
});
