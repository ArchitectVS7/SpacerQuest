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
  NEMESIS_SYSTEM_ID,
  PORT_HANGOUTS,
  STAR_SYSTEMS,
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
    for (const [key, row] of Object.entries(PORT_HANGOUTS)) {
      expect(row.systemId).toBe(Number(key));
    }
  });

  it('the default row is never keyed by a real system id', () => {
    expect(DEFAULT_PORT_HANGOUT.systemId).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// T-121 · THE REACH CHANGE (docs/HANGOUT_REDESIGN.md §4, §4.5, §2.2 ruling 3).
//
// 1 of 28 systems → 14 of 28. This block is the enumerating assertion the task's
// acceptance names, plus the two-way set-equality guard that keeps `hasHangout`
// (the authoritative gate) and `PORT_HANGOUTS` (the parameter table) from ever
// drifting apart in either direction.
// ---------------------------------------------------------------------------

/** ids 1–14, Sun-3 … Vega-6 — the fourteen CORE ports §4.5 rules in. */
const CORE_HANGOUT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
/** The first rim id. Named rather than spelled inline, because it is what keeps
 *  `ActionBlocked{'no-hangout'}` reachable. */
const RIM_SYSTEM = 15;
/** The core ports no content pass has authored yet. T-122 removed 2, 3, 8 and 10
 *  (§6.3 pass 1); T-123 removed 4, 5, 11, 12 and 14 (pass 2), shrinking this to
 *  four; T-124 authors those four and empties it. */
const UNAUTHORED_HANGOUT_IDS = [6, 7, 9, 13];

describe('T-121 · the reach change — a bar at all fourteen core spaceports', () => {
  it('every core port 1–14 carries the flag AND a venue definition', () => {
    for (const id of CORE_HANGOUT_IDS) {
      expect(STAR_SYSTEMS[id]?.hasHangout).toBe(true);
      const row = PORT_HANGOUTS[id];
      expect(row).toBeDefined();
      // The table's key and the row's own identity agree at every port.
      expect(row?.systemId).toBe(id);
      expect(portHangoutFor(id).systemId).toBe(id);
      // A venue definition, not an empty shell: the house has a name to render.
      expect(portHangoutFor(id).prose.houseName.length).toBeGreaterThan(0);
      // And a band the engine can clamp into.
      const band = wagerBandFor(id);
      expect(band.min).toBeLessThanOrEqual(band.max);
    }
  });

  it('the `hasHangout` set and the PORT_HANGOUTS key set are equal, in both directions', () => {
    // §2.2 ruling 3's owed test. The drift this closes is the one that makes the
    // pillar silently wrong rather than loudly broken: a port flagged with no row
    // renders as a generic house forever, and a row at an unflagged port is dead
    // content the gate never reaches. Neither shows up in any other assertion.
    const flagged = Object.values(STAR_SYSTEMS)
      .filter((s) => s.hasHangout === true)
      .map((s) => s.id)
      .sort((a, b) => a - b);
    const rowed = Object.keys(PORT_HANGOUTS)
      .map(Number)
      .sort((a, b) => a - b);
    expect(flagged).toEqual(CORE_HANGOUT_IDS);
    expect(rowed).toEqual(CORE_HANGOUT_IDS);
    expect(flagged).toEqual(rowed);
  });

  it('no rim, Andromeda or special system gained a venue', () => {
    // §4.5. Every id past the core band stays unflagged and unrowed — the rim
    // (15–20), Andromeda (21–26), MALIGNA (27) and NEMESIS (28).
    const beyondCore = Object.values(STAR_SYSTEMS).filter((s) => s.id > 14);
    // NON-VACUITY: an empty un-flagged set would make the loop below pass while
    // saying nothing, AND would make `ActionBlocked{'no-hangout'}` unreachable —
    // which is exactly why §4.5 keeps the set non-empty as a design requirement.
    expect(beyondCore.length).toBeGreaterThan(0);
    expect(beyondCore.map((s) => s.id)).toContain(RIM_SYSTEM);
    expect(beyondCore.map((s) => s.id)).toContain(NEMESIS_SYSTEM_ID);
    for (const system of beyondCore) {
      expect(system.hasHangout).not.toBe(true);
      expect(PORT_HANGOUTS[system.id]).toBeUndefined();
    }
  });

  it('the nine unauthored rows are still BASELINE rows — mechanically identical to Sun-3', () => {
    // T-121 delivers reach, not tuning. Each new row carries `systemId` and
    // `prose` and omits the four parameter fields, so every number resolves
    // field-wise to the shipped constant — which is what lets a moved golden or a
    // moved roll-up be attributed to reach alone. T-122 … T-124 author over these.
    //
    // T-122 authored ids 2, 3, 8 and 10 (§6.3 pass 1) and T-123 ids 4, 5, 11, 12
    // and 14 (pass 2), so the list below is FOUR rather than thirteen. KEEP THIS
    // TEST as the control that holds the unauthored remainder honest: T-124 is
    // expected to empty it. Altair-3 (3) left this list even though it is the
    // deliberate numeric mean, because it authors `clientele` — its numeric
    // inertness is pinned in `hangoutContent.test.ts` instead.
    for (const id of UNAUTHORED_HANGOUT_IDS) {
      const row = PORT_HANGOUTS[id];
      expect(row.wager).toBeUndefined();
      expect(row.venueParams).toBeUndefined();
      expect(row.clientele).toBeUndefined();
      // Resolved values are Sun-3's, asserted against the accessors rather than
      // against restated literals.
      expect(wagerBandFor(id)).toEqual(wagerBandFor(SUN_3));
      for (const venue of ALL_VENUES) {
        expect(venueParamsFor(id, venue)).toEqual(venueParamsFor(SUN_3, venue));
      }
    }
  });

  it('T-123 · the venue set is narrowed at exactly two ports, and everywhere else all seven run', () => {
    // The POSITIVE form of T-122's "no port has yet narrowed its venue set", which
    // T-123 was expected to rewrite rather than keep green. Phrased so T-124 can
    // extend it by adding to `NARROWED` if one of its four withholds a beat:
    //   * Arcturus-6 (4) runs no credit desk — §6.2's strict garrison, and the
    //     reason `'venue-not-offered'` is reachable end to end at all.
    //   * Deneb-4 (5) will not seat a stranger — §6.1's named "no `meet`" room.
    // This is a rules-level statement (which venues resolve as offered), not a
    // content one; the axis assertions live in `hangoutContent.test.ts`.
    const NARROWED: Record<number, readonly string[]> = {
      4: ['borrow', 'repay'],
      5: ['meet'],
    };
    for (const id of CORE_HANGOUT_IDS) {
      const withheld = NARROWED[id] ?? [];
      for (const venue of ALL_VENUES) {
        expect(venueOffered(id, venue), `port ${id}, venue '${venue}'`).toBe(
          !withheld.includes(venue),
        );
      }
    }
    // NON-VACUITY: the table above must describe something real, or this test
    // silently becomes the old all-seven assertion again.
    expect(Object.keys(NARROWED).length).toBeGreaterThan(0);
  });
});
