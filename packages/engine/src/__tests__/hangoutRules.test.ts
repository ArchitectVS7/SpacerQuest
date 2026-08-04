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
  LOAN_MAX_PRINCIPAL,
  LOAN_MIN_PRINCIPAL,
  MEET_DISPOSITION,
  NEMESIS_SYSTEM_ID,
  PORT_HANGOUTS,
  STAR_SYSTEMS,
  type HangoutVenueId,
  type PortHangout,
} from '@spacerquest/content';
import { createInitialState } from '../state.js';
import {
  loanBandFor,
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
// THE POINT OF THIS FILE IS INERTNESS. Sol-3's row omits `wager`, `venueParams`
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

describe('Sol-3 resolves to today’s shipped constants (the behaviour-preserving proof)', () => {
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

  it('T-133 · inherits the shipped LOAN band, because its row omits `loanBand`', () => {
    expect(PORT_HANGOUTS[SUN_3]?.loanBand).toBeUndefined();
    expect(loanBandFor(SUN_3)).toEqual({ min: LOAN_MIN_PRINCIPAL, max: LOAN_MAX_PRINCIPAL });
    // …and the default row is BUILT from those two constants rather than restating
    // them, which is what makes the inheritance a construction and not a match.
    expect(loanBandFor(SUN_3)).toEqual(DEFAULT_PORT_HANGOUT.loanBand);
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
    // Sol-3 authors no clientele at all — that is what keeps T-120 inert.
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
  it('the default row, Sol-3’s row and the engine’s accessor all use the same seven', () => {
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

/** ids 1–14, Sol-3 … Vega-6 — the fourteen CORE ports §4.5 rules in. */
const CORE_HANGOUT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
/** The first rim id. Named rather than spelled inline, because it is what keeps
 *  `ActionBlocked{'no-hangout'}` reachable. */
const RIM_SYSTEM = 15;

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
      // T-133 · the same well-orderedness for the credit desk. A band with
      // `min > max` would make `Math.max(min, Math.min(max, x))` return the FLOOR
      // for every request, silently — the one shape of authored nonsense the
      // clamp algebra cannot report.
      const loan = loanBandFor(id);
      expect(loan.min).toBeLessThanOrEqual(loan.max);
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

  it('T-124 · the baseline row is retired — every core port carries an authored voice', () => {
    // THE REPLACEMENT for T-121's "the unauthored rows are still BASELINE rows",
    // which T-124 was expected to empty. An empty loop over an empty id list is a
    // vacuous test, so the claim is INVERTED rather than deleted: the property
    // T-121 tracked (how many ports are still generated) is now pinned at zero by
    // asserting the positive over all fourteen.
    //
    // `baselineHangout` built `the <system> Hangout` per port, so the generated
    // name is the shape to test against — read off `STAR_SYSTEMS` rather than
    // restated, so a renamed system cannot make this pass by accident. This test
    // is about the VOICE; Sol-3's and Altair-3's numeric inertness is pinned in
    // `hangoutContent.test.ts`, which is where the content axes live.
    //
    // NON-VACUITY: the list must be the fourteen, or the loop says nothing.
    expect(CORE_HANGOUT_IDS.length).toBe(14);
    for (const id of CORE_HANGOUT_IDS) {
      const prose = portHangoutFor(id).prose;
      expect(prose.houseName, `port ${id} is still a generated baseline house`).not.toBe(
        `the ${STAR_SYSTEMS[id]?.name} Hangout`,
      );
      expect((prose.roomLine ?? '').trim().length, `port ${id} has no room line`).toBeGreaterThan(
        0,
      );
      expect(Object.keys(prose.flavour).length, `port ${id} has no flavour`).toBeGreaterThan(0);
    }
  });

  it('T-133 · the venue set is narrowed at exactly two ports, and everywhere else all seven run', () => {
    // The POSITIVE form of T-122's "no port has yet narrowed its venue set", which
    // T-123 rewrote at two ports and T-124 extended to three. T-133 (owner ruling
    // D7) takes it BACK to two, deliberately and not by attrition:
    //   * Deneb-4 (5) will not seat a stranger — §6.1's named "no `meet`" room.
    //   * Spica-3 (13) tolerates no insults — §6.1's named "no `insult`" house.
    //   * Arcturus-6 (4) is NO LONGER NARROWED. It ran no credit desk because a
    //     withheld venue was the only per-port lending control ruling 5 granted;
    //     D7 gives a row its own `loanBand`, so the garrison runs the desk against
    //     a tight ceiling instead. Its band is pinned in the T-133 block below —
    //     the identity moved axes, it was not dropped.
    // This is a rules-level statement (which venues resolve as offered), not a
    // content one; the axis assertions live in `hangoutContent.test.ts`.
    const NARROWED: Record<number, readonly string[]> = {
      5: ['meet'],
      13: ['insult'],
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

// ---------------------------------------------------------------------------
// T-133 · THE PER-PORT LOAN BAND (owner ruling D7, `docs/HANGOUT_REDESIGN.md`
// §2.2 ruling 5 as amended).
//
// Ruling 5 as originally written kept the loan band GLOBAL and gave a port
// exactly one bit of lending control: whether the desk was there at all. D7
// narrows it — the RATE, the TERM and the LENDER stay global (one lender of
// record, one `LoanState` slot), and only the PRINCIPAL BAND becomes content. A
// band is a clamp, not a counterparty.
//
// THE POINT OF THIS BLOCK IS THE SAME AS THE FILE'S: INERTNESS EVERYWHERE BUT ONE
// PORT. Thirteen authored rows and the rowless fallback must still read exactly
// the two shipped constants, asserted against those constants rather than against
// restated literals, and the one authored deviation is stated as a STRICT SUBSET
// of the global band rather than as a number — so 1,000 can move to 800 or 1,200
// without this file needing an edit.
// ---------------------------------------------------------------------------
describe('T-133 · the per-port loan band', () => {
  /** Arcturus-6 — the garrison mess, and the only row that authors a `loanBand`. */
  const THE_TIGHT_DESK = 4;
  const OTHER_PORTS = CORE_HANGOUT_IDS.filter((id) => id !== THE_TIGHT_DESK);

  it.each(OTHER_PORTS)('port %i still reads the GLOBAL band — behaviour-preserving', (id) => {
    expect(PORT_HANGOUTS[id]?.loanBand, `port ${id} authored a band it was not meant to`).toBe(
      undefined,
    );
    expect(loanBandFor(id)).toEqual({ min: LOAN_MIN_PRINCIPAL, max: LOAN_MAX_PRINCIPAL });
  });

  it('a port with no row at all reads the global band too', () => {
    // The rowless fallback is what a `hasHangout` port would get if content ever
    // forgot it — and what every non-core id resolves to. `portHangoutFor` never
    // throws, so `loanBandFor` must never return undefined bounds either.
    expect(PORT_HANGOUTS[UNROWED_SYSTEM]).toBeUndefined();
    expect(loanBandFor(UNROWED_SYSTEM)).toEqual({
      min: LOAN_MIN_PRINCIPAL,
      max: LOAN_MAX_PRINCIPAL,
    });
    expect(loanBandFor(RIM_SYSTEM)).toEqual(loanBandFor(SUN_3));
  });

  it('Arcturus-6 deals a band STRICTLY INSIDE the global one', () => {
    // Threshold-free, and stated against Sol-3's resolved band rather than against
    // the constants, so this reads as "tighter than everyone else" rather than as
    // "tighter than 5,000". The floor may match; the ceiling may not.
    const tight = loanBandFor(THE_TIGHT_DESK);
    const global = loanBandFor(SUN_3);
    expect(tight.min).toBeGreaterThanOrEqual(global.min);
    expect(tight.max).toBeLessThan(global.max);
    expect(tight.min).toBeLessThanOrEqual(tight.max);
  });

  it('…and it is the ONLY port that narrows the desk — the axis reads unambiguously', () => {
    for (const id of OTHER_PORTS) {
      expect(
        loanBandFor(id).max,
        `port ${id} also fronts less than the galaxy's ceiling`,
      ).toBeGreaterThan(loanBandFor(THE_TIGHT_DESK).max);
    }
    // …and the desk is genuinely OPEN there, which is the whole of D7: the
    // tightness is a number now, not an absence.
    expect(venueOffered(THE_TIGHT_DESK, 'borrow')).toBe(true);
    expect(venueOffered(THE_TIGHT_DESK, 'repay')).toBe(true);
  });
});
