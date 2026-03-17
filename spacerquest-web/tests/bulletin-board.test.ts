/**
 * SpacerQuest v4.0 - Alliance Bulletin Board Tests
 *
 * Based on original SP.TOP.S:175-239
 */

import { describe, it, expect } from 'vitest';
import { AllianceType } from '@prisma/client';
import {
  canAccessBoard,
  formatBulletinPost,
  validateMessage,
  ALLIANCE_BOARD_NAMES,
  MAX_MESSAGE_LENGTH,
} from '../src/game/systems/bulletin-board';

describe('Bulletin Board System', () => {
  // ============================================================================
  // ACCESS CONTROL
  // ============================================================================

  describe('canAccessBoard', () => {
    it('should allow alliance members to access their own board', () => {
      // Original SP.TOP.S:198-203: check alliance symbol matches board
      expect(canAccessBoard(AllianceType.ASTRO_LEAGUE, AllianceType.ASTRO_LEAGUE)).toBe(true);
      expect(canAccessBoard(AllianceType.REBEL_ALLIANCE, AllianceType.REBEL_ALLIANCE)).toBe(true);
    });

    it('should deny access to other alliance boards', () => {
      expect(canAccessBoard(AllianceType.ASTRO_LEAGUE, AllianceType.SPACE_DRAGONS)).toBe(false);
    });

    it('should deny access to players not in an alliance', () => {
      // Original SP.TOP.S:203: "You must belong to an alliance to read bulletins"
      expect(canAccessBoard(AllianceType.NONE, AllianceType.ASTRO_LEAGUE)).toBe(false);
    });
  });

  // ============================================================================
  // BOARD NAMES
  // ============================================================================

  describe('ALLIANCE_BOARD_NAMES', () => {
    it('should have names for all four alliances', () => {
      // Original SP.TOP.S:199-202
      expect(ALLIANCE_BOARD_NAMES[AllianceType.ASTRO_LEAGUE]).toBe('Astro League Bulletins');
      expect(ALLIANCE_BOARD_NAMES[AllianceType.SPACE_DRAGONS]).toBe('Space Dragons Bulletins');
      expect(ALLIANCE_BOARD_NAMES[AllianceType.WARLORD_CONFED]).toBe('Warlord Confed Bulletins');
      expect(ALLIANCE_BOARD_NAMES[AllianceType.REBEL_ALLIANCE]).toBe('Rebel Alliance Bulletins');
    });
  });

  // ============================================================================
  // MESSAGE FORMATTING
  // ============================================================================

  describe('formatBulletinPost', () => {
    it('should prepend date and player name', () => {
      // Original SP.TOP.S:233: i$=da$+": "+na$+":"
      const post = formatBulletinPost('Firefox', 'Attack tonight at Vega-6!');
      expect(post).toMatch(/^\d{2}\/\d{2}\/\d{2}: Firefox: Attack tonight at Vega-6!$/);
    });
  });

  describe('validateMessage', () => {
    it('should accept messages up to 79 characters', () => {
      // Original SP.TOP.S:230: if (lw<1) or (lw>79) print "Outta Range!"
      expect(validateMessage('Hello alliance members!')).toEqual({ valid: true });
      expect(validateMessage('A'.repeat(79))).toEqual({ valid: true });
    });

    it('should reject empty messages', () => {
      expect(validateMessage('')).toEqual({ valid: false, error: 'Message too short' });
    });

    it('should reject messages over 79 characters', () => {
      expect(validateMessage('A'.repeat(80))).toEqual({ valid: false, error: 'Message too long (79 chars max)' });
    });

    it('should have MAX_MESSAGE_LENGTH of 79', () => {
      expect(MAX_MESSAGE_LENGTH).toBe(79);
    });
  });
});
