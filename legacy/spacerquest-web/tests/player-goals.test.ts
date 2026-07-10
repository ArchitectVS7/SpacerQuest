/**
 * Player goals & objective surfacing — pure logic (no prisma).
 * Verifies next-rank progress (from score) and the priority-ordered objective nudge.
 */

import { describe, it, expect } from 'vitest';
import { getNextRankInfo, selectObjective, rankTitle, GoalSnapshot } from '../src/game/systems/player-goals';
import { RANK_THRESHOLDS } from '../src/game/constants';

const snap = (over: Partial<GoalSnapshot>): GoalSnapshot => ({
  score: 0, fuel: 100, credits: 0, cargoPods: 0, destination: 0, isConqueror: false, ...over,
});

describe('getNextRankInfo', () => {
  it('reports the next rank + points needed at each boundary', () => {
    expect(getNextRankInfo(0)).toEqual({ nextRank: 'COMMANDER', pointsToNext: 150 });
    expect(getNextRankInfo(149)).toEqual({ nextRank: 'COMMANDER', pointsToNext: 1 });
    expect(getNextRankInfo(150)).toEqual({ nextRank: 'CAPTAIN', pointsToNext: 150 });
    expect(getNextRankInfo(300)).toEqual({ nextRank: 'COMMODORE', pointsToNext: 150 });
    expect(getNextRankInfo(1200)).toEqual({ nextRank: 'GRAND_MUFTI', pointsToNext: 450 });
  });

  it('handles the sc=14 gap (2100-2249 still climbs toward Mega Hero)', () => {
    expect(getNextRankInfo(2100)).toEqual({ nextRank: 'MEGA_HERO', pointsToNext: 150 });
    expect(getNextRankInfo(2249)).toEqual({ nextRank: 'MEGA_HERO', pointsToNext: 1 });
    expect(getNextRankInfo(2250)).toEqual({ nextRank: 'GIGA_HERO', pointsToNext: 450 });
  });

  it('caps out at Giga Hero', () => {
    expect(getNextRankInfo(RANK_THRESHOLDS.GIGA_HERO)).toEqual({ nextRank: null, pointsToNext: 0 });
    expect(getNextRankInfo(50000)).toEqual({ nextRank: null, pointsToNext: 0 });
  });
});

describe('rankTitle', () => {
  it('title-cases enum ranks', () => {
    expect(rankTitle('TOP_DOG')).toBe('Top Dog');
    expect(rankTitle('GIGA_HERO')).toBe('Giga Hero');
  });
});

describe('selectObjective — priority order', () => {
  it('low fuel is the top priority (safety)', () => {
    expect(selectObjective(snap({ fuel: 5, cargoPods: 5, destination: 8, score: 9500 })))
      .toMatch(/Refuel/);
  });
  it('the Conqueror win is surfaced in the final stretch, above the routine loop', () => {
    expect(selectObjective(snap({ score: 9500, cargoPods: 5, destination: 8 })))
      .toMatch(/500 pts to CONQUEROR/);
  });
  it('no cargo → sign a contract', () => {
    expect(selectObjective(snap({ cargoPods: 0 }))).toMatch(/Sign a cargo contract/);
  });
  it('has cargo → deliver it, named destination (rim-aware)', () => {
    expect(selectObjective(snap({ cargoPods: 5, destination: 8 }))).toMatch(/Deliver your cargo to Mira-9/);
    expect(selectObjective(snap({ cargoPods: 5, destination: 15 }))).toMatch(/Deliver your cargo to Antares-5/);
  });
  it('idle + flush → suggest an upgrade', () => {
    // cargo with no destination falls through the delivery rule
    expect(selectObjective(snap({ cargoPods: 1, destination: 0, credits: 50000 })))
      .toMatch(/afford a ship upgrade/);
  });
  it('near next rank → the "so close" nudge', () => {
    expect(selectObjective(snap({ cargoPods: 1, destination: 0, credits: 0, score: 130 })))
      .toMatch(/20 pts to Commander/);
  });
  it('otherwise a rotating tip', () => {
    const out = selectObjective(snap({ cargoPods: 1, destination: 0, credits: 0, score: 500 }), () => 0);
    expect(out).toMatch(/Tip:/);
  });
});
