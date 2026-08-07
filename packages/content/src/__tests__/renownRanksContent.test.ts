import { describe, expect, it } from 'vitest';
import {
  RENOWN_RANKS,
  defineRenownRanks,
  validateRenownRanks,
  type RenownRankDefinition,
  type RenownRankId,
} from '../index.js';

// T-238 · Relocated from packages/engine/src/__tests__/deeds.test.ts. The rank
// ladder validator is pure content and belongs beside the authored rows.

describe('T-1504c renown rank content validation', () => {
  function fixtureRanks(
    overrides: Record<string, Partial<RenownRankDefinition>> = {},
  ): Record<string, RenownRankDefinition> {
    const base: Record<string, RenownRankDefinition> = {
      LIEUTENANT: { id: 'LIEUTENANT', label: 'Lieutenant', citation: 'Registry opens a file.' },
      COMMANDER: { id: 'COMMANDER', label: 'Commander', citation: 'Registry confirms the name.' },
    };
    for (const [key, patch] of Object.entries(overrides)) {
      base[key] = { ...base[key], ...patch };
    }
    return base;
  }

  const define = (ranks: Record<string, RenownRankDefinition>) =>
    defineRenownRanks(ranks as Record<RenownRankId, RenownRankDefinition>);

  it('the shipped rank table loads and validates with zero errors', () => {
    expect(validateRenownRanks(RENOWN_RANKS)).toEqual([]);
    expect(Object.keys(RENOWN_RANKS)).toHaveLength(10);
  });

  it('rejects an empty citation', () => {
    expect(() => define(fixtureRanks({ COMMANDER: { citation: '' } }))).toThrow(
      /citation must be a non-empty string/,
    );
  });

  it('rejects a citation carrying a {day} placeholder', () => {
    expect(() =>
      define(fixtureRanks({ COMMANDER: { citation: 'On day {day}, Registry confirmed it.' } })),
    ).toThrow(/must not contain a \{…\} placeholder/);
  });

  it('rejects two ranks sharing a citation', () => {
    expect(() =>
      define(fixtureRanks({ COMMANDER: { citation: 'Registry opens a file.' } })),
    ).toThrow(/identical to renownRanks.LIEUTENANT.citation/);
  });

  it('rejects a rank whose id disagrees with its key', () => {
    expect(() => define(fixtureRanks({ COMMANDER: { id: 'CAPTAIN' } }))).toThrow(
      /id must equal its key/,
    );
  });

  it('rejects an empty label', () => {
    expect(() => define(fixtureRanks({ LIEUTENANT: { label: '' } }))).toThrow(
      /label must be a non-empty string/,
    );
  });
});
