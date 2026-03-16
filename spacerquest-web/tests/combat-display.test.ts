/**
 * SpacerQuest v4.0 - Combat Display Screen Tests
 *
 * Tests for the Combat Display terminal screen rendering
 * Based on original SP.FIGHT1.S / SP.FIGHT2.S
 *
 * Original screen features:
 *   - Encounter detection with enemy class/name
 *   - Battle status bar: fuel, weapons, shields, B/F
 *   - Round-by-round combat log
 *   - Damage reports per round
 *   - Post-battle summary with loot/damage
 *   - Combat action prompts: Attack, Retreat, Surrender
 */

import { describe, it, expect } from 'vitest';
import {
  renderEncounterAlert,
  renderBattleStatusBar,
  renderCombatRound,
  renderPostBattleSummary,
  renderCombatActions,
  renderDamageReport,
  type CombatDisplayState,
  type RoundDisplayData,
  type PostBattleData,
} from '../src/game/systems/combat-display';

// ============================================================================
// ENCOUNTER ALERT TESTS
// ============================================================================

describe('Combat Display Screen', () => {
  describe('renderEncounterAlert', () => {
    it('should show enemy type and name', () => {
      const output = renderEncounterAlert({
        enemyType: 'PIRATE',
        enemyClass: 'SPX',
        enemyName: 'Black Star',
        enemyCommander: 'Captain Vex',
      });
      expect(output).toContain('Black Star');
      expect(output).toContain('Captain Vex');
    });

    it('should show enemy class', () => {
      const output = renderEncounterAlert({
        enemyType: 'PIRATE',
        enemyClass: 'SPZ',
        enemyName: 'Void Hunter',
        enemyCommander: 'Commander Shadow',
      });
      expect(output).toContain('SPZ');
    });

    it('should show sensor detection message', () => {
      const output = renderEncounterAlert({
        enemyType: 'PIRATE',
        enemyClass: 'SPX',
        enemyName: 'Dark Matter',
        enemyCommander: 'Admiral Void',
      });
      expect(output).toMatch(/sensor|detect|scan/i);
    });

    it('should differentiate enemy types', () => {
      const pirate = renderEncounterAlert({
        enemyType: 'PIRATE',
        enemyClass: 'SPX',
        enemyName: 'Test',
        enemyCommander: 'Test',
      });
      const patrol = renderEncounterAlert({
        enemyType: 'PATROL',
        enemyClass: 'SPX',
        enemyName: 'Space Patrol',
        enemyCommander: 'Patrol Commander',
      });
      expect(pirate).toMatch(/pirate/i);
      expect(patrol).toMatch(/patrol/i);
    });
  });

  // ============================================================================
  // BATTLE STATUS BAR TESTS
  // ============================================================================

  describe('renderBattleStatusBar', () => {
    const testState: CombatDisplayState = {
      shipName: 'MILLENNIA',
      fuel: 1500,
      weaponPower: 180,
      shieldPower: 225,
      battleFactor: 85,
    };

    it('should show ship name', () => {
      const output = renderBattleStatusBar(testState);
      expect(output).toContain('MILLENNIA');
    });

    it('should show fuel status', () => {
      const output = renderBattleStatusBar(testState);
      expect(output).toContain('1500');
    });

    it('should show weapon power', () => {
      const output = renderBattleStatusBar(testState);
      expect(output).toContain('180');
    });

    it('should show shield power', () => {
      const output = renderBattleStatusBar(testState);
      expect(output).toContain('225');
    });

    it('should show battle factor', () => {
      const output = renderBattleStatusBar(testState);
      expect(output).toContain('85');
    });

    it('should use original format labels F:, W:, S:, B/F:', () => {
      // Original: [F:XXXX]=[W:XXX]=[S:XXX]: B/F:XXX
      const output = renderBattleStatusBar(testState);
      expect(output).toContain('F:');
      expect(output).toContain('W:');
      expect(output).toContain('S:');
      expect(output).toMatch(/B\/F:/);
    });
  });

  // ============================================================================
  // COMBAT ROUND DISPLAY TESTS
  // ============================================================================

  describe('renderCombatRound', () => {
    const testRound: RoundDisplayData = {
      round: 3,
      battleAdvantage: 'PLAYER',
      playerDamageDealt: 15,
      enemyDamageDealt: 8,
      playerShieldHit: true,
      enemyShieldHit: false,
      combatLog: [
        'Your weapons hit for 15 damage!',
        'Enemy weapons hit for 8 damage!',
      ],
    };

    it('should show round number', () => {
      const output = renderCombatRound(testRound);
      expect(output).toContain('3');
    });

    it('should show battle advantage', () => {
      const output = renderCombatRound(testRound);
      expect(output).toMatch(/advantage/i);
    });

    it('should include combat log messages', () => {
      const output = renderCombatRound(testRound);
      expect(output).toContain('15 damage');
      expect(output).toContain('8 damage');
    });

    it('should indicate shield hits', () => {
      const output = renderCombatRound(testRound);
      // When shields absorb, should indicate that
      expect(output).toMatch(/shield/i);
    });
  });

  // ============================================================================
  // COMBAT ACTIONS
  // ============================================================================

  describe('renderCombatActions', () => {
    it('should show attack, retreat, and surrender options', () => {
      const output = renderCombatActions(false);
      expect(output).toMatch(/attack|continue/i);
      expect(output).toMatch(/retreat/i);
      expect(output).toMatch(/surrender/i);
    });

    it('should show cloaker option when available', () => {
      const output = renderCombatActions(true);
      expect(output).toMatch(/cloak/i);
    });

    it('should not show cloaker when unavailable', () => {
      const output = renderCombatActions(false);
      expect(output).not.toMatch(/cloak/i);
    });
  });

  // ============================================================================
  // DAMAGE REPORT
  // ============================================================================

  describe('renderDamageReport', () => {
    it('should list damaged components', () => {
      const output = renderDamageReport([
        { component: 'Drives', conditionLost: 1 },
        { component: 'Weapons', conditionLost: 2 },
      ]);
      expect(output).toContain('Drives');
      expect(output).toContain('Weapons');
    });

    it('should show condition lost per component', () => {
      const output = renderDamageReport([
        { component: 'Hull', conditionLost: 3 },
      ]);
      expect(output).toContain('3');
    });

    it('should show no damage message when empty', () => {
      const output = renderDamageReport([]);
      expect(output).toMatch(/no.?damage|all.?clear|intact/i);
    });
  });

  // ============================================================================
  // POST-BATTLE SUMMARY
  // ============================================================================

  describe('renderPostBattleSummary', () => {
    const testVictory: PostBattleData = {
      result: 'VICTORY',
      rounds: 5,
      playerName: 'Captain Fox',
      playerShip: 'MILLENNIA',
      enemyName: 'Black Star',
      enemyClass: 'SPZ',
      lootCredits: 2500,
      lootFuel: 100,
      damagesTaken: [
        { component: 'Shields', conditionLost: 2 },
        { component: 'Cabin', conditionLost: 1 },
      ],
      scoreChange: 15,
    };

    it('should declare battle result', () => {
      const output = renderPostBattleSummary(testVictory);
      expect(output).toMatch(/victory|won/i);
    });

    it('should show round count', () => {
      const output = renderPostBattleSummary(testVictory);
      expect(output).toContain('5');
    });

    it('should show loot on victory', () => {
      const output = renderPostBattleSummary(testVictory);
      expect(output).toContain('2500');
    });

    it('should show damages taken', () => {
      const output = renderPostBattleSummary(testVictory);
      expect(output).toContain('Shields');
      expect(output).toContain('Cabin');
    });

    it('should show score change', () => {
      const output = renderPostBattleSummary(testVictory);
      expect(output).toContain('15');
    });

    it('should show defeat message for losses', () => {
      const defeat: PostBattleData = {
        ...testVictory,
        result: 'DEFEAT',
        lootCredits: 0,
        lootFuel: 0,
        scoreChange: -10,
      };
      const output = renderPostBattleSummary(defeat);
      expect(output).toMatch(/defeat|lost/i);
    });

    it('should show retreat message for escapes', () => {
      const retreat: PostBattleData = {
        ...testVictory,
        result: 'RETREAT',
        lootCredits: 0,
        lootFuel: 0,
        scoreChange: 0,
      };
      const output = renderPostBattleSummary(retreat);
      expect(output).toMatch(/retreat|escap/i);
    });
  });
});
