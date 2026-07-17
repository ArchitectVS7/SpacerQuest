import { describe, it, expect } from 'vitest';
import {
  ALL_FRAGMENT_IDS,
  CROSSING_BANK_STAKE,
  CROSSING_BURN_FUEL,
  CROSSING_MIN_DECODED,
  SIGNAL_FRAGMENTS,
  STORYLETS,
} from '@spacerquest/content';
import {
  decodeFragment,
  fragmentCount,
  fragmentsDecodedCount,
  grantFragment,
  hasAnyUndecoded,
  hasDecodedFragment,
  hasFragment,
  hasUndecodedFragment,
  nemesisLoreIndex,
} from '../nemesis.js';
import {
  eligibleStorylets,
  quoteStoryletChoice,
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

// ---------------------------------------------------------------------------
// T-1505 · The full twelve-fragment arc and the crossing endgame.
// ---------------------------------------------------------------------------

/** Grant every fragment (all twelve) into a file, optionally decoding them all. */
function fullFile(decoded: boolean): NemesisFileState {
  const file = emptyFile();
  for (const id of ALL_FRAGMENT_IDS) {
    grantFragment(file, id, 'derelict', 1);
    if (decoded) decodeFragment(file, id);
  }
  return file;
}

describe('T-1505 · the arc grew to twelve fragments', () => {
  it('content defines exactly twelve fragments and a full file indexes all twelve', () => {
    expect(ALL_FRAGMENT_IDS).toHaveLength(12);
    const file = fullFile(false);
    expect(fragmentCount(file)).toBe(12);
    expect(nemesisLoreIndex(file)).toHaveLength(12);
    // Arc order is 1..12, ascending, no gaps.
    expect(nemesisLoreIndex(file).map((e) => e.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it('fragmentsDecodedCount and hasDecodedFragment read the decode bit precisely', () => {
    const file = emptyFile();
    expect(fragmentsDecodedCount(file)).toBe(0);

    grantFragment(file, 'frag-nemesis-04', 'derelict', 1);
    grantFragment(file, 'frag-nemesis-11', 'npc', 1);
    // Held but undecoded — neither reader counts them yet.
    expect(fragmentsDecodedCount(file)).toBe(0);
    expect(hasDecodedFragment(file, 'frag-nemesis-04')).toBe(false);

    decodeFragment(file, 'frag-nemesis-04');
    expect(fragmentsDecodedCount(file)).toBe(1);
    expect(hasDecodedFragment(file, 'frag-nemesis-04')).toBe(true);
    // A held-but-undecoded fragment is not a decoded one.
    expect(hasDecodedFragment(file, 'frag-nemesis-11')).toBe(false);
    // An unheld fragment is never decoded.
    expect(hasDecodedFragment(file, 'frag-nemesis-12')).toBe(false);
  });
});

describe('T-1505 · Sage decode paths for fragments 06–11', () => {
  const DECODE_STORYLETS: Record<string, string> = {
    'frag-nemesis-06': 'sage.mizar.decode-06',
    'frag-nemesis-07': 'sage.mizar.decode-07',
    'frag-nemesis-08': 'sage.mizar.decode-08',
    'frag-nemesis-09': 'sage.mizar.decode-09',
    'frag-nemesis-10': 'sage.mizar.decode-10',
    'frag-nemesis-11': 'sage.mizar.decode-11',
  };

  for (const [fragmentId, storyletId] of Object.entries(DECODE_STORYLETS)) {
    it(`${fragmentId} decodes via ${storyletId} at Mizar-9`, () => {
      const state = storyletReadyState();
      state.player.currentSystemId = 18;
      expect(grantFragment(state.player.nemesisFile, fragmentId, 'npc', 1)).toBe(true);

      const refreshed = refreshAvailableStorylets(state);
      expect(refreshed.state.storylets.available.map((o) => o.storyletId)).toContain(storyletId);

      const resolved = resolveStoryletChoice(
        refreshed.state,
        { type: 'Storylet', storyletId, choiceId: 'decode' },
        new SeededRng(1),
      );
      expect(resolved.events).toContainEqual(
        expect.objectContaining({ type: 'FragmentDecoded', fragmentId }),
      );
      expect(hasUndecodedFragment(resolved.state.player.nemesisFile, fragmentId)).toBe(false);
    });
  }
});

describe('T-1505 · the acquisition funnel for fragments 06–11', () => {
  // A state past the minDecoded:5 chokepoint (01–05 decoded), so the deep-arc
  // acquisitions are offered.
  function pastChokepoint(systemId: number): GameState {
    const state = storyletReadyState();
    state.player.currentSystemId = systemId;
    for (const id of [
      'frag-nemesis-01',
      'frag-nemesis-02',
      'frag-nemesis-03',
      'frag-nemesis-04',
      'frag-nemesis-05',
    ]) {
      grantFragment(state.player.nemesisFile, id, 'derelict', 1);
      decodeFragment(state.player.nemesisFile, id);
    }
    return state;
  }

  const ACQUISITIONS: {
    storyletId: string;
    choiceId: string;
    system: number;
    fragmentId: string;
  }[] = [
    {
      storyletId: 'nemesis.derelict-log.silent-fleet',
      choiceId: 'pull-the-log',
      system: 19,
      fragmentId: 'frag-nemesis-06',
    },
    {
      storyletId: 'nemesis.derelict-log.cartographer',
      choiceId: 'take-the-log',
      system: 20,
      fragmentId: 'frag-nemesis-07',
    },
    {
      storyletId: 'nemesis.beacon-echo.answer',
      choiceId: 'record-the-echo',
      system: 16,
      fragmentId: 'frag-nemesis-08',
    },
  ];

  for (const acq of ACQUISITIONS) {
    it(`${acq.storyletId} grants ${acq.fragmentId} past the chokepoint`, () => {
      const state = pastChokepoint(acq.system);
      const refreshed = refreshAvailableStorylets(state);
      expect(refreshed.state.storylets.available.map((o) => o.storyletId)).toContain(
        acq.storyletId,
      );
      const resolved = resolveStoryletChoice(
        refreshed.state,
        { type: 'Storylet', storyletId: acq.storyletId, choiceId: acq.choiceId },
        new SeededRng(1),
      );
      expect(resolved.events).toContainEqual(
        expect.objectContaining({ type: 'FragmentAcquired', fragmentId: acq.fragmentId }),
      );
    });
  }

  it('the deep-arc acquisitions stay dormant BELOW the minDecoded:5 chokepoint', () => {
    // Hold 5 fragments but decode only four — the chokepoint is DECODED count.
    const state = storyletReadyState();
    state.player.currentSystemId = 19;
    for (const id of [
      'frag-nemesis-01',
      'frag-nemesis-02',
      'frag-nemesis-03',
      'frag-nemesis-04',
      'frag-nemesis-05',
    ]) {
      grantFragment(state.player.nemesisFile, id, 'derelict', 1);
    }
    for (const id of ['frag-nemesis-01', 'frag-nemesis-02', 'frag-nemesis-03', 'frag-nemesis-04']) {
      decodeFragment(state.player.nemesisFile, id);
    }
    expect(fragmentsDecodedCount(state.player.nemesisFile)).toBe(4);
    expect(eligibleStorylets(state).map((o) => o.storyletId)).not.toContain(
      'nemesis.derelict-log.silent-fleet',
    );
  });

  it('an NPC-held grant surfaces only when co-located AND past the chokepoint', () => {
    const state = storyletReadyState();
    state.player.currentSystemId = 5;
    for (const id of [
      'frag-nemesis-01',
      'frag-nemesis-02',
      'frag-nemesis-03',
      'frag-nemesis-04',
      'frag-nemesis-05',
    ]) {
      grantFragment(state.player.nemesisFile, id, 'derelict', 1);
      decodeFragment(state.player.nemesisFile, id);
    }
    // Move Rust Bucket into the player's system.
    const rust = state.npcs.find((n) => n.id === 'npc-rust-bucket');
    expect(rust).toBeDefined();
    rust!.currentSystemId = 5;

    const refreshed = refreshAvailableStorylets(state);
    expect(refreshed.state.storylets.available.map((o) => o.storyletId)).toContain(
      'nemesis.npc-held.rust-bucket',
    );
    const resolved = resolveStoryletChoice(
      refreshed.state,
      {
        type: 'Storylet',
        storyletId: 'nemesis.npc-held.rust-bucket',
        choiceId: 'take-the-sliver',
      },
      new SeededRng(1),
    );
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'FragmentAcquired',
        fragmentId: 'frag-nemesis-09',
        source: 'npc',
      }),
    );
  });
});

describe('T-1505 · the Sage reconstructs the final line (frag-12)', () => {
  it('grants AND decodes frag-12 in one beat once frag-11 is decoded', () => {
    const state = storyletReadyState();
    state.player.currentSystemId = 18;
    // Hold and decode 01–11 (frag-11 decoded is the reconstruction gate).
    for (let i = 1; i <= 11; i += 1) {
      const id = `frag-nemesis-${String(i).padStart(2, '0')}`;
      grantFragment(state.player.nemesisFile, id, 'derelict', 1);
      decodeFragment(state.player.nemesisFile, id);
    }
    expect(hasDecodedFragment(state.player.nemesisFile, 'frag-nemesis-11')).toBe(true);
    expect(hasFragment(state.player.nemesisFile, 'frag-nemesis-12')).toBe(false);

    const refreshed = refreshAvailableStorylets(state);
    expect(refreshed.state.storylets.available.map((o) => o.storyletId)).toContain(
      'sage.mizar.reconstruct-final-line',
    );
    const resolved = resolveStoryletChoice(
      refreshed.state,
      {
        type: 'Storylet',
        storyletId: 'sage.mizar.reconstruct-final-line',
        choiceId: 'reconstruct',
      },
      new SeededRng(1),
    );
    // Both a grant AND a decode fired for frag-12, source 'sage'.
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'FragmentAcquired',
        fragmentId: 'frag-nemesis-12',
        source: 'sage',
      }),
    );
    expect(resolved.events).toContainEqual(
      expect.objectContaining({ type: 'FragmentDecoded', fragmentId: 'frag-nemesis-12' }),
    );
    expect(hasDecodedFragment(resolved.state.player.nemesisFile, 'frag-nemesis-12')).toBe(true);
    expect(fragmentsDecodedCount(resolved.state.player.nemesisFile)).toBe(12);
  });
});

describe('T-1505 · the commit storylet literals stay pinned to the balance constants', () => {
  it("the crossing.commit trigger + choice mirror nemesis.ts's CROSSING_* constants", () => {
    // The `nemesis.crossing.commit` storylet lives in an `as const` table and so
    // cannot import the constants; this guard fails the moment a literal drifts from
    // its source of truth (the PRD-wins numbers documented in content nemesis.ts).
    const commit = STORYLETS.find((s) => s.id === 'nemesis.crossing.commit');
    expect(commit).toBeDefined();
    expect(commit?.trigger.nemesis?.minDecoded).toBe(CROSSING_MIN_DECODED);
    const choice = commit?.choices.find((c) => c.id === 'commit');
    expect(choice?.requirements?.credits?.gte).toBe(CROSSING_BANK_STAKE);
    expect(choice?.requirements?.minFuel).toBe(CROSSING_BURN_FUEL);
    expect(choice?.effects?.credits).toBe(-CROSSING_BANK_STAKE);
  });
});

describe('T-1505 · the crossing requires the stake (rank + bank + ship)', () => {
  /** A state at Polaris-1 with the whole signal decoded, at a given rank/credits/fuel. */
  function crossingState(opts: {
    rank?: GameState['player']['registry']['renownRank'];
    credits: number;
    fuel: number;
  }): GameState {
    const state = storyletReadyState();
    state.player.currentSystemId = 17; // Polaris-1
    state.player.registry.renownRank = opts.rank ?? 'CONQUEROR';
    state.player.credits = opts.credits;
    state.player.ship.fuel = opts.fuel;
    state.player.nemesisFile = fullFile(true); // all twelve decoded
    return state;
  }

  it('is NOT offered below CONQUEROR even with the whole signal decoded', () => {
    const state = crossingState({ rank: 'GIGA_HERO', credits: 999999, fuel: 9999 });
    expect(eligibleStorylets(state).map((o) => o.storyletId)).not.toContain(
      'nemesis.crossing.commit',
    );
  });

  it('is NOT offered until minDecoded is met (11 decoded is not enough)', () => {
    const state = crossingState({ credits: 999999, fuel: 9999 });
    // Undecode one fragment → only 11 decoded.
    state.player.nemesisFile.fragments[0].decoded = false;
    expect(fragmentsDecodedCount(state.player.nemesisFile)).toBe(CROSSING_MIN_DECODED - 1);
    expect(eligibleStorylets(state).map((o) => o.storyletId)).not.toContain(
      'nemesis.crossing.commit',
    );
  });

  it('the Commit choice is blocked without the bank stake', () => {
    const state = crossingState({ credits: CROSSING_BANK_STAKE - 1, fuel: CROSSING_BURN_FUEL });
    const refreshed = refreshAvailableStorylets(state);
    expect(refreshed.state.storylets.available.map((o) => o.storyletId)).toContain(
      'nemesis.crossing.commit',
    );
    const quote = quoteStoryletChoice(refreshed.state, 'nemesis.crossing.commit', 'commit');
    expect(quote.ok).toBe(false);
    expect(quote.reason).toBe('insufficient-credits');

    const resolved = resolveStoryletChoice(
      refreshed.state,
      { type: 'Storylet', storyletId: 'nemesis.crossing.commit', choiceId: 'commit' },
      new SeededRng(1),
    );
    expect(resolved.events).toEqual([
      expect.objectContaining({ type: 'StoryletChoiceBlocked', reason: 'insufficient-credits' }),
    ]);
    // No flag set on a blocked commit.
    expect(resolved.state.flags['nemesis.crossing.unlocked']).toBeUndefined();
  });

  it('the Commit choice is blocked without the ship (fuel) stake — insufficient-fuel', () => {
    const state = crossingState({ credits: CROSSING_BANK_STAKE, fuel: CROSSING_BURN_FUEL - 1 });
    const refreshed = refreshAvailableStorylets(state);
    const quote = quoteStoryletChoice(refreshed.state, 'nemesis.crossing.commit', 'commit');
    expect(quote.ok).toBe(false);
    expect(quote.reason).toBe('insufficient-fuel');
    expect(quote.requiredFuel).toBe(CROSSING_BURN_FUEL);

    const resolved = resolveStoryletChoice(
      refreshed.state,
      { type: 'Storylet', storyletId: 'nemesis.crossing.commit', choiceId: 'commit' },
      new SeededRng(1),
    );
    expect(resolved.events).toEqual([
      expect.objectContaining({ type: 'StoryletChoiceBlocked', reason: 'insufficient-fuel' }),
    ]);
    expect(resolved.state.flags['nemesis.crossing.unlocked']).toBeUndefined();
  });

  it("a junker's 300-fuel tank cannot meet the burn, but a fully-staked ship can commit", () => {
    // A fresh junker maxes at 300 fuel — provably short of the burn.
    expect(CROSSING_BURN_FUEL).toBeGreaterThan(300);

    const state = crossingState({ credits: CROSSING_BANK_STAKE, fuel: CROSSING_BURN_FUEL });
    const refreshed = refreshAvailableStorylets(state);
    const quote = quoteStoryletChoice(refreshed.state, 'nemesis.crossing.commit', 'commit');
    expect(quote.ok).toBe(true);

    const resolved = resolveStoryletChoice(
      refreshed.state,
      { type: 'Storylet', storyletId: 'nemesis.crossing.commit', choiceId: 'commit' },
      new SeededRng(1),
    );
    // The bank is spent and the crossing is unlocked (the one-way point of no return).
    expect(resolved.state.player.credits).toBe(0);
    expect(resolved.state.flags['nemesis.crossing.unlocked']).toBe(true);
    // After committing, the one-shot commit no longer re-offers.
    const after = refreshAvailableStorylets(resolved.state);
    expect(after.state.storylets.available.map((o) => o.storyletId)).not.toContain(
      'nemesis.crossing.commit',
    );
  });
});
