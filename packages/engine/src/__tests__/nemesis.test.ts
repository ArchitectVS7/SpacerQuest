import { describe, it, expect } from 'vitest';
import { SIGNAL_FRAGMENTS } from '@spacerquest/content';
import {
  decodeFragment,
  fragmentCount,
  grantFragment,
  hasAnyUndecoded,
  hasFragment,
  hasUndecodedFragment,
  nemesisLoreIndex,
} from '../nemesis.js';
import {
  eligibleStorylets,
  refreshAvailableStorylets,
  resolveStoryletChoice,
} from '../storylets.js';
import { createInitialState } from '../state.js';
import { SeededRng } from '../rng.js';
import { DayPhase, GameState, NemesisFileState } from '../types.js';

function emptyFile(): NemesisFileState {
  return { fragments: [] };
}

/** A day-state ready to offer/resolve storylets (mirrors storylets.test readyState). */
function storyletReadyState(): GameState {
  const state = createInitialState(77);
  state.dayPhase = DayPhase.DAY;
  state.player.dawnHand = { dice: [20, 12, 6, 3, 1], spent: [false, false, false, false, false] };
  return state;
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

// ---------------------------------------------------------------------------
// T-1310 · Every fragment 01–05 has a Sage DECODE path exercised end-to-end
// through the storylet engine (not just the pure decodeFragment helper). Before
// T-1310 only fragment 01 had a decode storylet; 02–05 (everything the explorer
// pulls off derelicts/beacons) were permanently stuck undecoded.
// ---------------------------------------------------------------------------
describe('T-1310 · Sage decode paths for every fragment', () => {
  // Fragment id → the Sage storylet that decodes it at Mizar-9 (system 18).
  const DECODE_STORYLETS: Record<string, string> = {
    'frag-nemesis-01': 'sage.mizar.decode-first',
    'frag-nemesis-02': 'sage.mizar.decode-02',
    'frag-nemesis-03': 'sage.mizar.decode-03',
    'frag-nemesis-04': 'sage.mizar.decode-04',
    'frag-nemesis-05': 'sage.mizar.decode-05',
  };

  for (const [fragmentId, storyletId] of Object.entries(DECODE_STORYLETS)) {
    it(`${fragmentId} decodes via ${storyletId} at Mizar-9`, () => {
      const state = storyletReadyState();
      state.player.currentSystemId = 18; // Mizar-9 — the Sage's workshop.
      // Hold the fragment, still undecoded (as if pulled off a derelict/beacon).
      expect(grantFragment(state.player.nemesisFile, fragmentId, 'derelict', 1)).toBe(true);
      expect(hasUndecodedFragment(state.player.nemesisFile, fragmentId)).toBe(true);

      // The matching Sage storylet surfaces because there is something to decode.
      const refreshed = refreshAvailableStorylets(state);
      expect(refreshed.state.storylets.available.map((o) => o.storyletId)).toContain(storyletId);

      // Resolve its decode choice through the engine (headless, legal action).
      const resolved = resolveStoryletChoice(
        refreshed.state,
        { type: 'Storylet', storyletId, choiceId: 'decode' },
        new SeededRng(1),
      );

      // A real FragmentDecoded event fires and the fragment is now decoded.
      expect(resolved.events).toContainEqual(
        expect.objectContaining({ type: 'FragmentDecoded', fragmentId }),
      );
      expect(hasFragment(resolved.state.player.nemesisFile, fragmentId)).toBe(true);
      expect(hasUndecodedFragment(resolved.state.player.nemesisFile, fragmentId)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// T-1310 · A LATE visit still opens the Nemesis arc. The old day-30 knife-edge
// (eras:['TOUR_ONE'] + day:{equals:30}) closed the arc forever if missed; the
// windowed hook must still fire for a VETERAN-era captain arriving on day 60+.
// ---------------------------------------------------------------------------
describe('T-1310 · late Wise One visit still opens the arc', () => {
  it('a day-60 VETERAN-era visit to Polaris-1 grants frag-nemesis-01 (source wise-one)', () => {
    const state = storyletReadyState();
    state.day = 60;
    state.era = 'VETERAN'; // the era has long since flipped past Tour One
    state.player.currentSystemId = 17; // Polaris-1
    state.player.credits = 5000;

    const refreshed = refreshAvailableStorylets(state);
    expect(refreshed.state.storylets.available.map((o) => o.storyletId)).toContain(
      'wise-one.polaris.signal-hook',
    );

    const resolved = resolveStoryletChoice(
      refreshed.state,
      { type: 'Storylet', storyletId: 'wise-one.polaris.signal-hook', choiceId: 'buy-fragment' },
      new SeededRng(1),
    );

    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'FragmentAcquired',
        fragmentId: 'frag-nemesis-01',
        source: 'wise-one',
      }),
    );
    expect(hasFragment(resolved.state.player.nemesisFile, 'frag-nemesis-01')).toBe(true);
  });

  it('the hook is dormant before the day-25 window opens, even at Polaris-1', () => {
    const early = storyletReadyState();
    early.day = 24;
    early.player.currentSystemId = 17;
    expect(eligibleStorylets(early).map((o) => o.storyletId)).not.toContain(
      'wise-one.polaris.signal-hook',
    );
  });
});
