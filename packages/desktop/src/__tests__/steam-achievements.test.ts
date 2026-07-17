// ============================================================================
//  T-1702 · Pure achievement/presence derivation — runs in CI, no Steam needed
// ============================================================================

import { describe, expect, it } from 'vitest';
import { DEEDS } from '@spacerquest/content';
import type { GameEvent } from '@spacerquest/engine';
import {
  CONQUEROR_ACHIEVEMENT_ID,
  achievementIdForDeed,
  achievementIdForEvent,
  allAchievementIds,
  presenceFor,
} from '../steam-achievements';

describe('achievementIdForEvent', () => {
  it('maps a DeedEarned to DEED_<ID> (uppercased deed id)', () => {
    const event: GameEvent = {
      type: 'DeedEarned',
      day: 3,
      deedId: 'first_manifest',
      title: 'First Manifest',
      citation: 'On day 3, the Guild ledger first trusted this captain.',
      renownRank: 'LIEUTENANT',
    };
    expect(achievementIdForEvent(event)).toBe('DEED_FIRST_MANIFEST');
  });

  it('maps a RenownRankUp into CONQUEROR to RANK_CONQUEROR', () => {
    const event: GameEvent = {
      type: 'RenownRankUp',
      day: 300,
      previousRank: 'GIGA_HERO',
      newRank: 'CONQUEROR',
      deedCount: 30,
    };
    expect(achievementIdForEvent(event)).toBe(CONQUEROR_ACHIEVEMENT_ID);
    expect(CONQUEROR_ACHIEVEMENT_ID).toBe('RANK_CONQUEROR');
  });

  it('does NOT map a rank-up below Conqueror (the set is deeds + Conqueror only)', () => {
    const event: GameEvent = {
      type: 'RenownRankUp',
      day: 120,
      previousRank: 'ADMIRAL',
      newRank: 'TOP_DOG',
      deedCount: 20,
    };
    expect(achievementIdForEvent(event)).toBeNull();
  });

  it('returns null for unrelated events (e.g. DayAdvanced)', () => {
    const event: GameEvent = { type: 'DayAdvanced', day: 5 };
    expect(achievementIdForEvent(event)).toBeNull();
  });
});

describe('allAchievementIds (the drift guard vs. Steamworks partner config)', () => {
  it('contains exactly one id per authored deed plus the Conqueror capstone', () => {
    const ids = allAchievementIds();
    expect(ids).toHaveLength(DEEDS.length + 1);
    // Set-equality with the derived ids: every deed maps, plus RANK_CONQUEROR, no more.
    const expected = new Set([
      ...DEEDS.map((d) => achievementIdForDeed(d.id)),
      CONQUEROR_ACHIEVEMENT_ID,
    ]);
    expect(new Set(ids)).toEqual(expected);
    expect(ids).toContain(CONQUEROR_ACHIEVEMENT_ID);
  });

  it('covers the ≥30-deed set the task names (well over 30 deeds authored)', () => {
    // The task calls for "the ≥30-Deed set including Conqueror" — assert the content
    // actually carries enough deeds that the Steam set is the substantial one intended.
    expect(DEEDS.length).toBeGreaterThanOrEqual(30);
  });

  it('produces no duplicate ids', () => {
    const ids = allAchievementIds();
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('presenceFor', () => {
  it('formats the current system name and day', () => {
    // Sun-3 is system id 1 in content STAR_SYSTEMS.
    const p = presenceFor(1, 42);
    expect(p.system).toBe('Sun-3');
    expect(p.day).toBe(42);
    expect(p.steamDisplay).toBe('Sun-3 · Day 42');
  });

  it('falls back gracefully for an unknown system id (never throws)', () => {
    const p = presenceFor(9999, 7);
    expect(p.system).toBe('System 9999');
    expect(p.steamDisplay).toBe('System 9999 · Day 7');
  });
});
