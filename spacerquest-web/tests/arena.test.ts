/**
 * SpacerQuest v4.0 - Dueling Arena Screen Tests
 *
 * Tests for the Dueling Arena terminal screen rendering
 * Based on original SP.ARENA1.S / SP.ARENA2.S
 *
 * Original screen features:
 *   (1) Contender - Post a duel challenge
 *   (2) Challenger - Accept a duel
 *   (R) Roster - View pending duels
 *   (B) Battle Log - View past duel results
 *   (L) List - List all ships
 *   (Q) Quit
 */

import { describe, it, expect } from 'vitest';
import {
  renderArenaHeader,
  renderDuelRoster,
  renderBattleLog,
  renderArenaOptions,
  renderDuelResult,
  ARENA_NAMES,
  STAKES_NAMES,
  type DuelRosterEntry,
  type DuelBattleLogEntry,
  type DuelResultDisplay,
} from '../src/game/systems/arena';
import { ARENA_REQUIREMENTS } from '../src/game/constants';

// ============================================================================
// ARENA HEADER TESTS
// ============================================================================

describe('Dueling Arena Screen', () => {
  describe('renderArenaHeader', () => {
    it('should include Spacer Arena title', () => {
      const output = renderArenaHeader();
      expect(output).toMatch(/spacer.?arena/i);
    });

    it('should include contender and challenger menu options', () => {
      const output = renderArenaHeader();
      expect(output).toMatch(/contender/i);
      expect(output).toMatch(/challenger/i);
    });

    it('should include roster and battle log options', () => {
      const output = renderArenaHeader();
      expect(output).toContain('(R)');
      expect(output).toContain('(B)');
      expect(output).toContain('(Q)');
    });
  });

  // ============================================================================
  // ARENA OPTIONS
  // ============================================================================

  describe('ARENA_NAMES', () => {
    it('should define 6 arena types from original', () => {
      // Original: Ion Cloud, Proton Storm, Cosmic Radiation, Black Hole Proximity, Super-Nova Flare, Deep Space
      expect(ARENA_NAMES).toHaveLength(6);
      expect(ARENA_NAMES[0]).toMatch(/ion.?cloud/i);
      expect(ARENA_NAMES[1]).toMatch(/proton.?storm/i);
      expect(ARENA_NAMES[2]).toMatch(/cosmic.?radiation/i);
      expect(ARENA_NAMES[3]).toMatch(/black.?hole/i);
      expect(ARENA_NAMES[4]).toMatch(/super.?nova/i);
      expect(ARENA_NAMES[5]).toMatch(/deep.?space/i);
    });
  });

  describe('STAKES_NAMES', () => {
    it('should define stakes types from original', () => {
      // Original: Total Points, Ship Component Strength, Credits
      expect(STAKES_NAMES).toHaveLength(3);
      expect(STAKES_NAMES[0]).toMatch(/point/i);
      expect(STAKES_NAMES[1]).toMatch(/component/i);
      expect(STAKES_NAMES[2]).toMatch(/credit/i);
    });
  });

  describe('renderArenaOptions', () => {
    it('should list all arena types with numbers', () => {
      const output = renderArenaOptions();
      expect(output).toContain('(1)');
      expect(output).toContain('(2)');
      expect(output).toContain('(3)');
      expect(output).toContain('(4)');
      expect(output).toContain('(5)');
      expect(output).toContain('(6)');
    });

    it('should list all stakes types', () => {
      const output = renderArenaOptions();
      expect(output).toMatch(/point/i);
      expect(output).toMatch(/component/i);
      expect(output).toMatch(/credit/i);
    });

    it('should show access requirements from constants', () => {
      const output = renderArenaOptions();
      expect(output).toContain(String(ARENA_REQUIREMENTS.ION_CLOUD.trips));
      expect(output).toContain(String(ARENA_REQUIREMENTS.PROTON_STORM.astrecs));
    });
  });

  // ============================================================================
  // DUEL ROSTER
  // ============================================================================

  describe('renderDuelRoster', () => {
    const testRoster: DuelRosterEntry[] = [
      {
        id: 'duel-1',
        challengerName: 'Captain Fox',
        challengerShip: 'MILLENNIA',
        stakesType: 'credits',
        stakesAmount: 5000,
        arenaType: 1,
        handicap: 25,
        createdAt: new Date('2026-03-15'),
      },
      {
        id: 'duel-2',
        challengerName: 'Admiral Vex',
        challengerShip: 'DARKSTAR',
        stakesType: 'points',
        stakesAmount: 100,
        arenaType: 3,
        handicap: 42,
        createdAt: new Date('2026-03-14'),
      },
    ];

    it('should display roster header', () => {
      const output = renderDuelRoster(testRoster);
      expect(output).toMatch(/roster/i);
    });

    it('should list challenger names and ships', () => {
      const output = renderDuelRoster(testRoster);
      expect(output).toContain('Captain Fox');
      expect(output).toContain('MILLENNIA');
      expect(output).toContain('Admiral Vex');
      expect(output).toContain('DARKSTAR');
    });

    it('should show stakes info for each duel', () => {
      const output = renderDuelRoster(testRoster);
      expect(output).toContain('5000');
      expect(output).toContain('100');
    });

    it('should show arena type for each duel', () => {
      const output = renderDuelRoster(testRoster);
      expect(output).toMatch(/ion.?cloud/i);
      expect(output).toMatch(/cosmic.?radiation/i);
    });

    it('should show handicap values', () => {
      const output = renderDuelRoster(testRoster);
      expect(output).toContain('25');
      expect(output).toContain('42');
    });

    it('should handle empty roster', () => {
      const output = renderDuelRoster([]);
      expect(output).toMatch(/no.*duel|empty/i);
    });
  });

  // ============================================================================
  // BATTLE LOG
  // ============================================================================

  describe('renderBattleLog', () => {
    const testLog: DuelBattleLogEntry[] = [
      {
        winnerName: 'Captain Fox',
        winnerShip: 'MILLENNIA',
        loserName: 'Admiral Vex',
        loserShip: 'DARKSTAR',
        arenaType: 2,
        stakesType: 'credits',
        stakesAmount: 5000,
        completedAt: new Date('2026-03-15'),
      },
    ];

    it('should display battle log header', () => {
      const output = renderBattleLog(testLog);
      expect(output).toMatch(/battle.?log/i);
    });

    it('should show winner and loser names', () => {
      const output = renderBattleLog(testLog);
      expect(output).toContain('Captain Fox');
      expect(output).toContain('Admiral Vex');
    });

    it('should show arena and stakes', () => {
      const output = renderBattleLog(testLog);
      expect(output).toMatch(/proton.?storm/i);
      expect(output).toContain('5000');
    });

    it('should handle empty log', () => {
      const output = renderBattleLog([]);
      expect(output).toMatch(/no.*battle|empty/i);
    });
  });

  // ============================================================================
  // DUEL RESULT
  // ============================================================================

  describe('renderDuelResult', () => {
    const testResult: DuelResultDisplay = {
      winnerName: 'Captain Fox',
      winnerShip: 'MILLENNIA',
      winnerHits: 12,
      loserName: 'Admiral Vex',
      loserShip: 'DARKSTAR',
      loserHits: 5,
      arenaType: 4,
      stakesType: 'points',
      stakesAmount: 100,
    };

    it('should declare the winner', () => {
      const output = renderDuelResult(testResult);
      expect(output).toContain('Captain Fox');
      expect(output).toMatch(/win|victor|beats/i);
    });

    it('should show hit counts', () => {
      const output = renderDuelResult(testResult);
      expect(output).toContain('12');
      expect(output).toContain('5');
    });

    it('should show arena name', () => {
      const output = renderDuelResult(testResult);
      expect(output).toMatch(/black.?hole/i);
    });

    it('should show stakes transferred', () => {
      const output = renderDuelResult(testResult);
      expect(output).toContain('100');
    });
  });
});
