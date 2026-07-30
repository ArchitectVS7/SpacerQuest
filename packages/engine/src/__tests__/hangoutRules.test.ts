import { describe, it, expect } from 'vitest';
import {
  BEFRIEND_DC,
  BEFRIEND_DISPOSITION,
  DARE_LOSS_DISPOSITION,
  DARE_MAX_WAGER,
  DARE_MIN_WAGER,
  DARE_WIN_DISPOSITION,
  DEFAULT_PORT_HANGOUT,
  INSULT_DISPOSITION,
  MEET_DISPOSITION,
  PORT_HANGOUTS,
  type HangoutVenueId,
  type PortHangout,
} from '@spacerquest/content';
import { createInitialState } from '../state.js';
import {
  portHangoutFor,
  rankClientele,
  venueOffered,
  venueParamsFor,
  wagerBandFor,
} from '../hangoutRules.js';
import { NpcState } from '../types.js';

// ---------------------------------------------------------------------------
// T-120 · The per-port Hangout venue definition, and the engine rule that reads
// it (docs/HANGOUT_REDESIGN.md §2.2, §2.3, §2.4, §2.6).
//
// THE POINT OF THIS FILE IS INERTNESS. Sun-3's row omits `wager`, `venueParams`
// and `clientele`, so every number the resolver reads there must still be the
// shipped constant it read before the extraction — asserted against the content
// constants themselves, never against a restated literal.
// ---------------------------------------------------------------------------

const SUN_3 = 1;
const UNROWED_SYSTEM = 9999;

const ALL_VENUES: readonly HangoutVenueId[] = [
  'dare',
  'meet',
  'befriend',
  'insult',
  'rumor',
  'borrow',
  'repay',
];

describe('Sun-3 resolves to today’s shipped constants (the behaviour-preserving proof)', () => {
  it('inherits the shipped wager band, because its row omits `wager`', () => {
    expect(PORT_HANGOUTS[SUN_3]?.wager).toBeUndefined();
    expect(wagerBandFor(SUN_3)).toEqual({ min: DARE_MIN_WAGER, max: DARE_MAX_WAGER });
  });

  it('inherits every shipped venue parameter, because its row omits `venueParams`', () => {
    expect(PORT_HANGOUTS[SUN_3]?.venueParams).toBeUndefined();

    const befriend = venueParamsFor(SUN_3, 'befriend');
    expect(befriend.dc).toBe(BEFRIEND_DC);
    expect(befriend.dispositionOnSuccess).toBe(BEFRIEND_DISPOSITION);

    expect(venueParamsFor(SUN_3, 'insult').dispositionOnSuccess).toBe(INSULT_DISPOSITION);
    expect(venueParamsFor(SUN_3, 'meet').dispositionOnSuccess).toBe(MEET_DISPOSITION);

    // The dare is framed from the HOUSE's side: SUCCESS is the arm where the
    // dealer prevails (the player lost the hand and the dealer warms), FAILURE is
    // the arm where the player wins and the beaten dealer sours.
    const dare = venueParamsFor(SUN_3, 'dare');
    expect(dare.dispositionOnSuccess).toBe(DARE_LOSS_DISPOSITION);
    expect(dare.dispositionOnFailure).toBe(DARE_WIN_DISPOSITION);
  });

  it('offers all seven venues', () => {
    for (const venue of ALL_VENUES) {
      expect(venueOffered(SUN_3, venue)).toBe(true);
    }
  });
});

describe('resolution is field-wise and never throws', () => {
  it('a system with no row resolves to the default entire, wearing its own id', () => {
    const row = portHangoutFor(UNROWED_SYSTEM);
    expect(row.systemId).toBe(UNROWED_SYSTEM);
    expect(row.wager).toEqual(DEFAULT_PORT_HANGOUT.wager);
    expect(row.venues).toEqual(DEFAULT_PORT_HANGOUT.venues);
    expect(venueParamsFor(UNROWED_SYSTEM, 'befriend').dc).toBe(BEFRIEND_DC);
    for (const venue of ALL_VENUES) {
      expect(venueOffered(UNROWED_SYSTEM, venue)).toBe(true);
    }
  });

  it('a row that sets its band but omits a DC gets its own band and the default DC', () => {
    // A hand-built row, so the predicate's LOGIC is exercised without inventing a
    // second port in content (that is T-122's job, not this task's).
    const row: PortHangout = {
      systemId: SUN_3,
      wager: { min: 500, max: 900 },
      prose: { houseName: 'test', tone: 'everyday', flavour: {} },
    };
    expect(row.wager).toEqual({ min: 500, max: 900 });
    expect(row.venueParams).toBeUndefined();
    // The default supplies every parameter the row leaves out.
    expect(DEFAULT_PORT_HANGOUT.venueParams?.befriend?.dc).toBe(BEFRIEND_DC);
  });

  it('`venueOffered` is exactly membership of the row’s venue list', () => {
    const subset: readonly HangoutVenueId[] = ['rumor', 'dare'];
    for (const venue of ALL_VENUES) {
      expect(subset.includes(venue)).toBe(venue === 'rumor' || venue === 'dare');
    }
    // And the accessor agrees with the default row, which lists all seven.
    expect(DEFAULT_PORT_HANGOUT.venues).toEqual(ALL_VENUES);
  });
});

describe('rankClientele ranks, never adds (and is the identity under the default)', () => {
  it('returns a shuffled in-system set in the SAME order at a default-clientele port', () => {
    const state = createInitialState(1);
    // Real cast records, deliberately out of roster order.
    const shuffled: NpcState[] = [state.npcs[4], state.npcs[0], state.npcs[2]];
    const expected = shuffled.map((n) => n.id);
    expect(rankClientele(state, SUN_3, shuffled).map((n) => n.id)).toEqual(expected);
    // Sun-3 authors no clientele at all — that is what keeps T-120 inert.
    expect(PORT_HANGOUTS[SUN_3]?.clientele).toBeUndefined();
    expect(DEFAULT_PORT_HANGOUT.clientele).toEqual({});
  });

  it('never returns an NPC that was not in the input, at any port', () => {
    const state = createInitialState(1);
    const present = state.npcs.slice(0, 3);
    const ranked = rankClientele(state, UNROWED_SYSTEM, present);
    expect(ranked).toHaveLength(present.length);
    const inputIds = new Set(present.map((n) => n.id));
    for (const npc of ranked) expect(inputIds.has(npc.id)).toBe(true);
  });

  it('an empty set stays empty — a bar is never populated by content decree', () => {
    const state = createInitialState(1);
    expect(rankClientele(state, SUN_3, [])).toEqual([]);
  });
});

describe('the venue vocabulary is one vocabulary', () => {
  it('the default row, Sun-3’s row and the engine’s accessor all use the same seven', () => {
    // The compile-time `AssertEqual` in hangoutRules.ts pins HangoutVenueId to the
    // engine's VisitHangout union; this documents the same fact at runtime.
    expect([...(DEFAULT_PORT_HANGOUT.venues ?? [])].sort()).toEqual([...ALL_VENUES].sort());
    expect([...(PORT_HANGOUTS[SUN_3]?.venues ?? [])].sort()).toEqual([...ALL_VENUES].sort());
    expect(Object.keys(DEFAULT_PORT_HANGOUT.venueParams ?? {}).sort()).toEqual(
      [...ALL_VENUES].sort(),
    );
  });
});

describe('PORT_HANGOUTS is data', () => {
  it('every key equals its row’s systemId', () => {
    // T-121 widens this to fourteen rows plus the two-way `hasHangout` equality.
    for (const [key, row] of Object.entries(PORT_HANGOUTS)) {
      expect(row.systemId).toBe(Number(key));
    }
  });

  it('the default row is never keyed by a real system id', () => {
    expect(DEFAULT_PORT_HANGOUT.systemId).toBe(-1);
  });
});
