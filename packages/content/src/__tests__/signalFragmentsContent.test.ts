import { describe, expect, it } from 'vitest';
import {
  BEACON_FRAGMENT_POOL,
  DERELICT_FRAGMENT_POOL,
  SIGNAL_FRAGMENTS,
  defineSignalFragments,
  validateFragmentPools,
  validateSignalFragments,
  type SignalFragmentLore,
} from '../index.js';

// T-238 · Relocated from packages/engine/src/__tests__/nemesis.test.ts. These
// are content-validator fixtures and do not need engine state or projections.

describe('T-1505a · Signal Fragment content validation', () => {
  function goodTable(): Record<string, SignalFragmentLore> {
    return {
      'frag-a': { id: 'frag-a', order: 1, title: 'A', signal: 'raw a', decoded: 'lore a' },
      'frag-b': { id: 'frag-b', order: 2, title: 'B', signal: 'raw b', decoded: 'lore b' },
    };
  }

  it('accepts the SHIPPED twelve-fragment table (it loaded, so it validated)', () => {
    expect(validateSignalFragments(SIGNAL_FRAGMENTS)).toEqual([]);
    expect(() => defineSignalFragments(SIGNAL_FRAGMENTS)).not.toThrow();
    expect(Object.keys(SIGNAL_FRAGMENTS)).toHaveLength(12);
    expect(
      Object.values(SIGNAL_FRAGMENTS)
        .map((f) => f.order)
        .sort((a, b) => a - b),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('rejects a fragment whose id disagrees with its key (the ALL_FRAGMENT_IDS desync)', () => {
    const table = goodTable();
    table['frag-a'] = { ...table['frag-a'], id: 'frag-typo' };
    expect(validateSignalFragments(table).join('\n')).toContain('must equal its key');
    expect(() => defineSignalFragments(table)).toThrow(/Invalid Signal Fragment content/);
  });

  it('rejects a duplicate order (nemesisLoreIndex would sort the two non-deterministically)', () => {
    const table = goodTable();
    table['frag-b'] = { ...table['frag-b'], order: 1 };
    expect(validateSignalFragments(table).join('\n')).toContain('duplicates');
    expect(() => defineSignalFragments(table)).toThrow();
  });

  it('rejects a non-positive or non-integer order', () => {
    for (const order of [0, -3, 1.5]) {
      const table = goodTable();
      table['frag-a'] = { ...table['frag-a'], order };
      expect(validateSignalFragments(table).join('\n')).toContain('must be a positive integer');
    }
  });

  it('rejects an empty title / signal / decoded (they render as blank pane rows)', () => {
    for (const field of ['title', 'signal', 'decoded'] as const) {
      const table = goodTable();
      table['frag-a'] = { ...table['frag-a'], [field]: '' };
      expect(validateSignalFragments(table).join('\n')).toContain(
        `signalFragments.frag-a.${field} must be a non-empty string`,
      );
    }
  });

  it('rejects decoded === signal (decoding would be invisible to the player)', () => {
    const table = goodTable();
    table['frag-a'] = { ...table['frag-a'], decoded: table['frag-a'].signal };
    expect(validateSignalFragments(table).join('\n')).toContain('must differ from');
  });

  it('accepts the shipped loot pools and rejects an unknown or duplicated pool id', () => {
    expect(
      validateFragmentPools(SIGNAL_FRAGMENTS, {
        DERELICT_FRAGMENT_POOL,
        BEACON_FRAGMENT_POOL,
      }),
    ).toEqual([]);
    expect(DERELICT_FRAGMENT_POOL).toContain('frag-nemesis-06');
    expect(DERELICT_FRAGMENT_POOL).toContain('frag-nemesis-07');
    expect(BEACON_FRAGMENT_POOL).toContain('frag-nemesis-08');

    const bad = validateFragmentPools(SIGNAL_FRAGMENTS, {
      pool: ['frag-nemesis-02', 'frag-nope', 'frag-nemesis-02'],
    });
    expect(bad.join('\n')).toContain("pool[1] ('frag-nope') is not a known Signal Fragment id");
    expect(bad.join('\n')).toContain('is duplicated in the pool');
  });
});
