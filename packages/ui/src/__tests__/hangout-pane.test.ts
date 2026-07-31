import { describe, expect, it } from 'vitest';
import { createInitialState, portHangoutFor, venueOffered } from '@spacerquest/engine';
import {
  DEFAULT_PORT_HANGOUT,
  PORT_HANGOUTS,
  STAR_SYSTEMS,
  type HangoutVenueId,
} from '@spacerquest/content';
import {
  hangoutFailExplanation,
  hangoutHouse,
  hangoutNpcs,
  hangoutVenueOffered,
  loanFailExplanation,
} from '../format';

// ---------------------------------------------------------------------------
// T-132 · SURFACING THE DARK HALF OF THE HANGOUT
// (docs/HANGOUT_REDESIGN.md F-101-4 … F-101-6, F-123-1).
//
// Everything here is a selector over `format.ts`, never over `store.ts`: the store
// runs `init()` at module load and reaches for storage and sound, which is exactly
// why T-131 moved its fail prose into the pure-prose module and why T-132 moves the
// two Hangout ones. The e2e half (real clicks on the new venue controls) lives in
// `packages/ui/e2e/hangout.spec.ts`; this file guards the parts a browser cannot
// cheaply reach — a dead captain on the roster, a rowless port's fallback voice,
// and the two fail unions in full.
// ---------------------------------------------------------------------------

/** The fourteen core `hasHangout` ports (`hangout-gate.test.ts`'s set). */
const CORE_HANGOUT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
/** Antares-5 — a rim id, `hasHangout: false`, and (by `hangoutRules.test.ts`'s
 *  "every hasHangout port has a row" assertion) the only cheap way to probe the
 *  ROWLESS resolution path at all. */
const ROWLESS_SYSTEM = 15;
const ALL_VENUES: readonly HangoutVenueId[] = [
  'dare',
  'meet',
  'befriend',
  'insult',
  'rumor',
  'borrow',
  'repay',
];

// ---------------------------------------------------------------------------
// F-123-1 part 2 — "typed fails render, never silence", over the WHOLE union.
// ---------------------------------------------------------------------------

/** Compile-time lock: a sixth `HangoutEvent.failReason` fails `tsc` here (the
 *  literal array is checked against the parameter type) and again inside
 *  `hangoutFailExplanation`'s `default`-less switch. */
const HANGOUT_REASONS = [
  'no-die',
  'invalid-die-index',
  'die-already-spent',
  'no-opponent',
  'venue-not-offered',
] as const;

const LOAN_REASONS = [
  'no-die',
  'invalid-die-index',
  'die-already-spent',
  'already-has-loan',
  'no-loan',
  'insufficient-credits',
  'venue-not-offered',
] as const;

describe('T-132 · every Hangout fail reason renders a visible notice', () => {
  it.each(HANGOUT_REASONS)('%s renders a real sentence, never silence', (reason) => {
    const line = hangoutFailExplanation(reason);
    expect(typeof line).toBe('string');
    expect(line.trim().length, `${reason} rendered empty`).toBeGreaterThan(0);
  });

  it('THE HOLE THAT SHIPPED: venue-not-offered is no longer silence', () => {
    // The store's old inline switch had no arm for this at all and fell through
    // to `return null` — the exact shape of the bug T-131 found in exploration.
    const line = hangoutFailExplanation('venue-not-offered');
    expect(line.trim().length).toBeGreaterThan(0);
    expect(line).toMatch(/no one here/i);
    expect(line).toMatch(/wager/i);
  });

  it('no two reason classes collapse into one indistinguishable line', () => {
    // The three malformed-die reasons deliberately share a line (one player-facing
    // situation); everything else must be tellable apart.
    const lines = new Set(HANGOUT_REASONS.map(hangoutFailExplanation));
    expect(lines.size).toBe(HANGOUT_REASONS.length - 2);
  });
});

describe("T-132 · every Penny Wise refusal renders in the desk's own voice", () => {
  it.each(LOAN_REASONS)('%s renders a real sentence, never silence', (reason) => {
    const line = loanFailExplanation(reason);
    expect(typeof line).toBe('string');
    expect(line.trim().length, `${reason} rendered empty`).toBeGreaterThan(0);
  });

  it('THE MISLEADING LINE THAT SHIPPED: venue-not-offered means no desk, not a refusal', () => {
    // The old `default` arm answered this with "Penny Wise turned that request
    // down" — a sentence about a lender who considered and declined, at a port
    // where there is no lender to consider it.
    const line = loanFailExplanation('venue-not-offered');
    expect(line).toMatch(/no credit desk/i);
    expect(line).not.toBe('Penny Wise turned that request down.');
  });

  it('no two reason classes collapse into one indistinguishable line', () => {
    const lines = new Set(LOAN_REASONS.map(loanFailExplanation));
    expect(lines.size).toBe(LOAN_REASONS.length - 2);
  });
});

// ---------------------------------------------------------------------------
// F-101-5 — the opponent list can offer a dead captain.
// ---------------------------------------------------------------------------

describe('T-132 · hangoutNpcs never offers a dead captain', () => {
  it('drops the dead in-system NPCs and keeps every live one', () => {
    const game = createInitialState(1);
    const here = game.player.currentSystemId;
    const inSystem = game.npcs.filter((n) => n.currentSystemId === here);
    expect(inSystem.length).toBeGreaterThan(1);

    const buried = inSystem[0];
    const survivors = inSystem.slice(1);
    buried.dead = true;
    // Also bury someone ELSEWHERE, so a filter that accidentally became the
    // identity (or that dropped every dead NPC from a list it never contained)
    // cannot pass by coincidence.
    const away = game.npcs.find((n) => n.currentSystemId !== here);
    expect(away).toBeDefined();
    away!.dead = true;

    const ids = hangoutNpcs(game).map((n) => n.id);
    expect(ids).not.toContain(buried.id);
    expect(ids).not.toContain(away!.id);
    for (const alive of survivors) expect(ids).toContain(alive.id);
    expect(ids).toHaveLength(survivors.length);
  });

  it("honours rankClientele's contract: the set handed in is already live and in-system", () => {
    // `rankClientele` (hangoutRules.ts) documents that the CALLER passes the
    // already-filtered live, in-system, non-dead set. The engine's own opponent
    // resolution (`actions/hangout.ts`) requires `!n.dead`, so a dead row offered
    // here was a button that could only ever spend nothing and return
    // `no-opponent`.
    const game = createInitialState(1);
    for (const n of game.npcs) n.dead = true;
    expect(hangoutNpcs(game)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// F-101-6 — the authored house voice, and F-123-1 part 1 — the venue gate.
// ---------------------------------------------------------------------------

describe('T-132 · the pane reads the house’s authored voice', () => {
  it('renders the authored house name and room line at a port that has them', () => {
    const game = createInitialState(1);
    game.player.currentSystemId = 1;
    const house = hangoutHouse(game);
    // Expectations come from CONTENT, not from a hard-coded literal: re-authoring
    // the prose must not break the RENDERING PATH this test is actually guarding.
    expect(house.houseName).toBe(PORT_HANGOUTS[1].prose.houseName);
    expect(house.tone).toBe(PORT_HANGOUTS[1].prose.tone);
    expect(house.roomLine).toBe(PORT_HANGOUTS[1].prose.roomLine);
    expect(house.roomLine?.length ?? 0).toBeGreaterThan(0);
  });

  it('follows content to a second, differently-voiced port', () => {
    const game = createInitialState(1);
    game.player.currentSystemId = 4;
    const house = hangoutHouse(game);
    expect(house.houseName).toBe(PORT_HANGOUTS[4].prose.houseName);
    expect(house.houseName).not.toBe(PORT_HANGOUTS[1].prose.houseName);
    expect(house.flavour.dare).toBe(PORT_HANGOUTS[4].prose.flavour.dare);
  });

  it('falls back to the default house at a port with no row, and offers no room line', () => {
    const game = createInitialState(1);
    game.player.currentSystemId = ROWLESS_SYSTEM;
    expect(PORT_HANGOUTS[ROWLESS_SYSTEM]).toBeUndefined();
    const house = hangoutHouse(game);
    expect(house.houseName).toBe(DEFAULT_PORT_HANGOUT.prose.houseName);
    // Absent ⇒ null ⇒ the pane renders NOTHING extra, never a placeholder.
    expect(house.roomLine).toBeNull();
  });

  it('authors a house name at every port the engine opens a Hangout at', () => {
    for (const id of CORE_HANGOUT_IDS) {
      expect(STAR_SYSTEMS[id]?.hasHangout).toBe(true);
      const game = createInitialState(1);
      game.player.currentSystemId = id;
      expect(hangoutHouse(game).houseName.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('T-132 · the pane never advertises a venue the engine would refuse', () => {
  it('agrees with the engine venue-for-venue at every core port', () => {
    // The pass-through can never drift: 14 ports × 7 venues against
    // `venueOffered` itself, the SAME predicate `resolveVisitHangout` refuses on.
    for (const id of CORE_HANGOUT_IDS) {
      const game = createInitialState(1);
      game.player.currentSystemId = id;
      for (const venue of ALL_VENUES) {
        expect(hangoutVenueOffered(game, venue), `${id}/${venue}`).toBe(venueOffered(id, venue));
      }
    }
  });

  it('reports the three authored narrowings, which are content’s and not the UI’s', () => {
    const at = (id: number) => {
      const game = createInitialState(1);
      game.player.currentSystemId = id;
      return game;
    };
    // Arcturus-6 runs no credit desk; Deneb-4 seats no stranger; Spica-3 takes no
    // insult. Read off the rows so re-authoring moves the test with the content.
    expect(hangoutVenueOffered(at(4), 'borrow')).toBe(false);
    expect(hangoutVenueOffered(at(4), 'repay')).toBe(false);
    expect(hangoutVenueOffered(at(5), 'meet')).toBe(false);
    expect(hangoutVenueOffered(at(13), 'insult')).toBe(false);
    expect(portHangoutFor(4).venues).not.toContain('borrow');
    expect(portHangoutFor(5).venues).not.toContain('meet');
    expect(portHangoutFor(13).venues).not.toContain('insult');

    // …and the home hall offers all four social venues plus the desk.
    for (const venue of ['dare', 'meet', 'befriend', 'insult', 'borrow', 'repay'] as const) {
      expect(hangoutVenueOffered(at(1), venue), venue).toBe(true);
    }
  });
});
