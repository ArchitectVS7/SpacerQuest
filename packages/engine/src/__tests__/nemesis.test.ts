import { describe, it, expect } from 'vitest';
import {
  ALL_FRAGMENT_IDS,
  BEACON_FRAGMENT_POOL,
  DERELICT_FRAGMENT_POOL,
  SIGNAL_FRAGMENTS,
  STORYLETS,
  defineSignalFragments,
  validateFragmentPools,
  validateSignalFragments,
  type SignalFragmentLore,
  type StoryletDefinition,
} from '@spacerquest/content';
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
// T-1310 / T-1505a · Every fragment has a Sage DECODE path exercised end-to-end
// through the storylet engine (not just the pure decodeFragment helper). Before
// T-1310 only fragment 01 had a decode storylet; 02–05 (everything the explorer
// pulls off derelicts/beacons) were permanently stuck undecoded.
//
// T-1505a made the map CONTENT-DERIVED rather than hand-written: it is scanned
// out of STORYLETS, and the coverage assertion below is over ALL_FRAGMENT_IDS.
// That is the "all N fragments have working decode paths" acceptance clause as a
// mechanical guard — authoring a 13th fragment without a decode storylet turns
// this red automatically, where the old literal table would have stayed green.
// ---------------------------------------------------------------------------

/** Fragment id → the storylet + choice that carries `decodeFragment` for it,
 *  scanned out of the shipped content (choice effects + both check branches). */
function decodeStoryletsByFragment(): Map<string, { storyletId: string; choiceId: string }> {
  const map = new Map<string, { storyletId: string; choiceId: string }>();
  for (const storylet of STORYLETS as readonly StoryletDefinition[]) {
    for (const choice of storylet.choices) {
      for (const effects of [choice.effects, choice.successEffects, choice.failureEffects]) {
        const fragmentId = effects?.decodeFragment;
        if (fragmentId !== undefined && !map.has(fragmentId)) {
          map.set(fragmentId, { storyletId: storylet.id, choiceId: choice.id });
        }
      }
    }
  }
  return map;
}

describe('T-1310 / T-1505a · Sage decode paths for every fragment', () => {
  const DECODE_STORYLETS = decodeStoryletsByFragment();

  it('every authored fragment has at least one decode path in the shipped content', () => {
    const missing = ALL_FRAGMENT_IDS.filter((id) => !DECODE_STORYLETS.has(id));
    expect(missing, `fragments with no decode storylet: ${missing.join(', ')}`).toEqual([]);
    // The arc is twelve pieces after T-1505a (01–05 + the seven net-new).
    expect(ALL_FRAGMENT_IDS).toHaveLength(12);
  });

  for (const [fragmentId, { storyletId, choiceId }] of DECODE_STORYLETS) {
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
        { type: 'Storylet', storyletId, choiceId },
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

// ---------------------------------------------------------------------------
// T-1505a · The fragment table LOADS AND VALIDATES.
//
// `defineSignalFragments` throws at import, so `@spacerquest/content` importing
// green anywhere in this file is already half the proof. These tests pin the
// other half: that each rule actually rejects the malformation it claims to, so
// the guard cannot rot into a no-op.
//
// T-164 · HOSTED HERE, AND IT NO LONGER HAS TO BE. The old reason ("content has
// no test runner of its own") stopped being true when T-164 stood one up. This
// block reads only `@spacerquest/content`, so under `docs/TESTING-STRATEGY.md`
// Part I it QUALIFIES to move beside its rows — it is on that ruling's migration
// ledger (F-164-1) rather than in T-164's scope, which was chartered to stand up
// the runner and split the Explore validator, not to relocate every eligible
// block at once.
// ---------------------------------------------------------------------------
describe('T-1505a · Signal Fragment content validation', () => {
  /** A minimal well-formed table, cloned per test and then broken one way. */
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
    // The keys and ids agree, and the orders are exactly 1..12 with no gaps —
    // which is what makes the lore index a stable, readable arc in the pane.
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
    // READER of a pool entry: POI_LOOT → engine resolveLoot's seeded pick, whose
    // result feeds grantFragment (which returns false — silently — on a bad id).
    expect(
      validateFragmentPools(SIGNAL_FRAGMENTS, {
        DERELICT_FRAGMENT_POOL,
        BEACON_FRAGMENT_POOL,
      }),
    ).toEqual([]);
    // The T-1505a growth: the new pool entries are actually in the pools.
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

// ---------------------------------------------------------------------------
// T-1505a · The decoded-lore index at FULL arc length (12).
// ---------------------------------------------------------------------------
describe('T-1505a · the lore index holds the whole twelve-fragment arc', () => {
  it('is 12 rows, strictly ascending 1..12, regardless of the order they were granted', () => {
    const file = emptyFile();
    // Grant in a deliberately scrambled order — reverse, then interleaved.
    const scrambled = [...ALL_FRAGMENT_IDS].reverse();
    scrambled.forEach((id, i) => {
      expect(grantFragment(file, id, i % 2 === 0 ? 'sage' : 'npc', i + 1)).toBe(true);
    });

    const index = nemesisLoreIndex(file);
    expect(index).toHaveLength(12);
    expect(index.map((e) => e.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // Strictly ascending, not merely sorted-with-ties.
    for (let i = 1; i < index.length; i += 1) {
      expect(index[i].order).toBeGreaterThan(index[i - 1].order);
    }
  });

  it("a decoded row's text is the content's decoded lore, never a literal", () => {
    const file = emptyFile();
    for (const id of ALL_FRAGMENT_IDS) grantFragment(file, id, 'derelict', 1);

    // Undecoded rows read the raw signal…
    for (const entry of nemesisLoreIndex(file)) {
      expect(entry.text).toBe(SIGNAL_FRAGMENTS[entry.fragmentId].signal);
      expect(entry.decoded).toBe(false);
    }
    // …and every decoded row swaps to the authored decoded lore.
    for (const id of ALL_FRAGMENT_IDS) expect(decodeFragment(file, id)).toBe(true);
    for (const entry of nemesisLoreIndex(file)) {
      expect(entry.text).toBe(SIGNAL_FRAGMENTS[entry.fragmentId].decoded);
      expect(entry.decoded).toBe(true);
    }
    expect(fragmentCount(file)).toBe(12);
  });

  it("carries the storylet-authored SOURCE onto every row ('sage' and 'npc' are live now)", () => {
    // READER of SignalFragmentRecord.source: this projection — the Nemesis pane
    // and the sim's acquisition-mode sweep both read the row's `source`.
    const file = emptyFile();
    grantFragment(file, 'frag-nemesis-09', 'npc', 4);
    grantFragment(file, 'frag-nemesis-11', 'sage', 5);
    const bySource = new Map(nemesisLoreIndex(file).map((e) => [e.fragmentId, e.source]));
    expect(bySource.get('frag-nemesis-09')).toBe('npc');
    expect(bySource.get('frag-nemesis-11')).toBe('sage');
  });
});
