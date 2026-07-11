import { describe, it, expect } from 'vitest';
import { SIGNAL_FRAGMENTS } from '@spacerquest/content';
import {
  decodeFragment,
  fragmentCount,
  grantFragment,
  hasAnyUndecoded,
  hasUndecodedFragment,
  nemesisLoreIndex,
} from '../nemesis.js';
import { NemesisFileState } from '../types.js';

function emptyFile(): NemesisFileState {
  return { fragments: [] };
}

describe('T-111b · Nemesis file — monotonic fragment growth', () => {
  it('each new fragment grows the decoded-lore index by exactly one', () => {
    const file = emptyFile();
    expect(fragmentCount(file)).toBe(0);
    expect(nemesisLoreIndex(file)).toHaveLength(0);

    expect(grantFragment(file, 'frag-nemesis-01', 'wise-one', 1)).toBe(true);
    expect(fragmentCount(file)).toBe(1);
    expect(nemesisLoreIndex(file)).toHaveLength(1);

    expect(grantFragment(file, 'frag-nemesis-02', 'derelict', 2)).toBe(true);
    expect(fragmentCount(file)).toBe(2);
    expect(nemesisLoreIndex(file)).toHaveLength(2);
  });

  it('a duplicate grant never shrinks, dupes, or grows the index', () => {
    const file = emptyFile();
    grantFragment(file, 'frag-nemesis-01', 'wise-one', 1);
    grantFragment(file, 'frag-nemesis-02', 'derelict', 2);
    const countBefore = fragmentCount(file);
    const indexBefore = nemesisLoreIndex(file);

    // Re-grant an already-held fragment: no-op, no growth.
    expect(grantFragment(file, 'frag-nemesis-01', 'derelict', 5)).toBe(false);
    expect(fragmentCount(file)).toBe(countBefore);
    expect(nemesisLoreIndex(file)).toHaveLength(indexBefore.length);
    // No duplicate id snuck in.
    const ids = file.fragments.map((f) => f.fragmentId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('an unknown fragment id is rejected and never bloats the count', () => {
    const file = emptyFile();
    expect(grantFragment(file, 'frag-does-not-exist', 'npc', 1)).toBe(false);
    expect(fragmentCount(file)).toBe(0);
  });

  it('a randomized grant sequence is strictly non-decreasing in count', () => {
    const file = emptyFile();
    const ids = Object.keys(SIGNAL_FRAGMENTS);
    let previous = 0;
    // Grant every id twice in an interleaved order; count must never drop.
    for (const id of [...ids, ...ids].sort()) {
      grantFragment(file, id, 'derelict', 1);
      expect(fragmentCount(file)).toBeGreaterThanOrEqual(previous);
      previous = fragmentCount(file);
    }
    // Ends at exactly the distinct-id count — every id present once.
    expect(fragmentCount(file)).toBe(ids.length);
  });
});

describe('T-111b · Nemesis file — decoding', () => {
  it('decode flips a held fragment to decoded and swaps its lore text', () => {
    const file = emptyFile();
    grantFragment(file, 'frag-nemesis-01', 'wise-one', 1);

    expect(hasUndecodedFragment(file, 'frag-nemesis-01')).toBe(true);
    expect(hasAnyUndecoded(file)).toBe(true);
    // Raw signal text before decode.
    expect(nemesisLoreIndex(file)[0].text).toBe(SIGNAL_FRAGMENTS['frag-nemesis-01'].signal);
    expect(nemesisLoreIndex(file)[0].decoded).toBe(false);

    expect(decodeFragment(file, 'frag-nemesis-01')).toBe(true);
    expect(hasUndecodedFragment(file, 'frag-nemesis-01')).toBe(false);
    expect(hasAnyUndecoded(file)).toBe(false);
    // Decoded lore text after decode; count unchanged.
    expect(nemesisLoreIndex(file)[0].text).toBe(SIGNAL_FRAGMENTS['frag-nemesis-01'].decoded);
    expect(nemesisLoreIndex(file)[0].decoded).toBe(true);
    expect(fragmentCount(file)).toBe(1);
  });

  it('decode is a no-op for an absent or already-decoded fragment', () => {
    const file = emptyFile();
    expect(decodeFragment(file, 'frag-nemesis-01')).toBe(false); // absent

    grantFragment(file, 'frag-nemesis-01', 'wise-one', 1);
    expect(decodeFragment(file, 'frag-nemesis-01')).toBe(true);
    expect(decodeFragment(file, 'frag-nemesis-01')).toBe(false); // already decoded
  });

  it('the lore index is sorted by the fragment arc order regardless of grant order', () => {
    const file = emptyFile();
    grantFragment(file, 'frag-nemesis-03', 'derelict', 1);
    grantFragment(file, 'frag-nemesis-01', 'wise-one', 2);
    grantFragment(file, 'frag-nemesis-02', 'derelict', 3);
    expect(nemesisLoreIndex(file).map((e) => e.order)).toEqual([1, 2, 3]);
  });
});
