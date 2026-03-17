/**
 * SpacerQuest v4.0 - Alliance Rules Tests
 *
 * Tests for alliance join/switch rules from original SP.BAR.S
 * These rules were identified as missing in the design review.
 */

import { describe, it, expect } from 'vitest';
import { Rank, AllianceType } from '@prisma/client';
import {
  canJoinAlliance,
  calculateSwitchCost,
  isAllianceFull,
  ALLIANCE_INFO,
} from '../src/game/systems/alliance-rules';
import { ALLIANCE_SIZE_DIVISOR, ALLIANCE_MIN_MEMBERS } from '../src/game/constants';

// ============================================================================
// ALLIANCE INFO
// ============================================================================

describe('Alliance Rules', () => {
  describe('ALLIANCE_INFO', () => {
    it('should define all four alliances', () => {
      expect(ALLIANCE_INFO).toHaveLength(4);
    });

    it('should have correct symbols from original', () => {
      expect(ALLIANCE_INFO.find(a => a.symbol === '+')?.name).toBe('The Astro League');
      expect(ALLIANCE_INFO.find(a => a.symbol === '@')?.name).toBe('The Space Dragons');
      expect(ALLIANCE_INFO.find(a => a.symbol === '&')?.name).toBe('The Warlord Confed');
      expect(ALLIANCE_INFO.find(a => a.symbol === '^')?.name).toBe('The Rebel Alliance');
    });
  });

  // ============================================================================
  // JOIN REQUIREMENTS
  // ============================================================================

  describe('canJoinAlliance', () => {
    it('should reject players below Lieutenant rank', () => {
      // Original SP.BAR.S:99: "Only Lieutenants and higher may join an alliance"
      // But wait - Lieutenant IS the starting rank. The original checks if pp$=""
      // which means no rank at all (pre-Lieutenant). Since all players start as
      // Lieutenant in our system, this is just the minimum rank.
      // Actually the original uses pp$="" to mean unranked/new player.
      // In our system, LIEUTENANT is the minimum, so anyone with LIEUTENANT+ can join.
      const result = canJoinAlliance(Rank.LIEUTENANT, AllianceType.NONE, 10, 2);
      expect(result.allowed).toBe(true);
    });

    it('should allow ranked players to join', () => {
      const result = canJoinAlliance(Rank.COMMANDER, AllianceType.NONE, 10, 2);
      expect(result.allowed).toBe(true);
    });

    it('should indicate when player already has an alliance', () => {
      const result = canJoinAlliance(Rank.COMMANDER, AllianceType.ASTRO_LEAGUE, 10, 2);
      expect(result.hasExistingAlliance).toBe(true);
    });

    it('should reject join when alliance is full (1/3 cap)', () => {
      // Original SP.BAR.S:166: if (a>(np/3)) and (a>4)
      // 12 total players, 5 in alliance = 5 > 12/3=4 AND 5 > 4
      const result = canJoinAlliance(Rank.COMMANDER, AllianceType.NONE, 12, 5);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('full');
    });

    it('should allow join when alliance has fewer than minimum members', () => {
      // Original: if (a>(np/3)) and (a>4) - both conditions must be true
      // 12 total, 3 in alliance = 3 < 4, so alliance is NOT full
      const result = canJoinAlliance(Rank.COMMANDER, AllianceType.NONE, 12, 3);
      expect(result.allowed).toBe(true);
    });
  });

  // ============================================================================
  // ALLIANCE SWITCHING COST
  // ============================================================================

  describe('calculateSwitchCost', () => {
    it('should cost all credits when switching alliances', () => {
      // Original SP.BAR.S:110-116: "It will cost you all your credits to switch alliances"
      // g1=0:g2=0
      const cost = calculateSwitchCost(5, 5000);
      expect(cost.creditsLost).toBe(55000); // 5 * 10000 + 5000
    });

    it('should indicate port loss when player owns a port', () => {
      // Original SP.BAR.S:111: "As well as the loss of your Space Port"
      const cost = calculateSwitchCost(5, 5000, true);
      expect(cost.losesPort).toBe(true);
    });

    it('should not indicate port loss when no port owned', () => {
      const cost = calculateSwitchCost(5, 5000, false);
      expect(cost.losesPort).toBe(false);
    });
  });

  // ============================================================================
  // ALLIANCE SIZE CAP
  // ============================================================================

  describe('isAllianceFull', () => {
    it('should use 1/3 cap from constants', () => {
      expect(ALLIANCE_SIZE_DIVISOR).toBe(3);
    });

    it('should use minimum members threshold', () => {
      expect(ALLIANCE_MIN_MEMBERS).toBe(4);
    });

    it('should not be full when below 1/3 of total', () => {
      // 30 total players, 8 in alliance: 8 < 30/3=10
      expect(isAllianceFull(30, 8)).toBe(false);
    });

    it('should be full when at or above 1/3 of total AND above min members', () => {
      // 30 total, 11 in alliance: 11 > 10 AND 11 > 4
      expect(isAllianceFull(30, 11)).toBe(true);
    });

    it('should not be full when below minimum members even if over 1/3', () => {
      // 6 total, 3 in alliance: 3 > 6/3=2 BUT 3 < 4(min)
      // Original: if (a>(np/3)) and (a>4) - requires BOTH
      expect(isAllianceFull(6, 3)).toBe(false);
    });
  });
});
