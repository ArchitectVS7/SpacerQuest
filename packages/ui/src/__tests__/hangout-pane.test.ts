import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  liarsDiceRoundsRemaining,
  loanBandFor,
  portHangoutFor,
  socialPlaysRemaining,
  venueOffered,
} from '@spacerquest/engine';
import {
  DEFAULT_PORT_HANGOUT,
  PORT_HANGOUTS,
  SOCIAL_PLAYS_PER_DAY,
  STAR_SYSTEMS,
  type HangoutVenueId,
} from '@spacerquest/content';
import {
  hangoutDareRounds,
  hangoutFailExplanation,
  hangoutHouse,
  hangoutNpcs,
  hangoutSocialPlays,
  hangoutVenueOffered,
  lendingTerms,
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
  // T-197 · the two DAILY CAPS that replaced the Hangout's die
  // (docs/DAWN-HAND-REDESIGN.md §4a/§4b). They are refusals a player can hit on a
  // perfectly ordinary day, so silence here would be worse than for any reason
  // above it — which is why they are added to this sweep in the same commit as the
  // refusals themselves.
  'social-limit-reached',
  'daily-round-limit',
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

  // T-197 · THE TWO CAPS GET TWO DISTINCT VOICES, and that is a requirement rather
  // than a flourish: a spent-out social pool and a table closed for the night are
  // different refusals with different remedies (come back tomorrow vs. play better
  // and earn more rounds). The check above already forbids them collapsing into one
  // another; these two pin what each actually says.
  it('T-197 · social-limit-reached says the room has heard enough, not that a die is missing', () => {
    const line = hangoutFailExplanation('social-limit-reached');
    expect(line).not.toMatch(/die/i);
    expect(line).toMatch(/today|room/i);
    expect(line).not.toBe(hangoutFailExplanation('daily-round-limit'));
  });

  it('T-197 · daily-round-limit says the HOUSE closed the table, not that the player is broke', () => {
    const line = hangoutFailExplanation('daily-round-limit');
    expect(line).not.toMatch(/die/i);
    expect(line).toMatch(/table|tonight|tomorrow/i);
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

/** A live state standing at a chosen port. The selectors under test are all
 *  functions of `player.currentSystemId`, so this is the whole fixture. */
function at(id: number) {
  const game = createInitialState(1);
  game.player.currentSystemId = id;
  return game;
}

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

  it('reports the two authored narrowings, which are content’s and not the UI’s', () => {
    // Deneb-4 seats no stranger; Spica-3 takes no insult. Read off the rows so
    // re-authoring moves the test with the content.
    //
    // T-133 (owner ruling D7) · IT WAS THREE. Arcturus-6's garrison mess used to
    // withhold the credit desk; it now runs it against a tighter `loanBand`, so
    // the desk is back on screen there and the tightness is a number the terms
    // line reports. Pinned positively below rather than deleted.
    expect(hangoutVenueOffered(at(5), 'meet')).toBe(false);
    expect(hangoutVenueOffered(at(13), 'insult')).toBe(false);
    expect(portHangoutFor(5).venues).not.toContain('meet');
    expect(portHangoutFor(13).venues).not.toContain('insult');
    expect(hangoutVenueOffered(at(4), 'borrow')).toBe(true);
    expect(hangoutVenueOffered(at(4), 'repay')).toBe(true);

    // …and the home hall offers all four social venues plus the desk.
    for (const venue of ['dare', 'meet', 'befriend', 'insult', 'borrow', 'repay'] as const) {
      expect(hangoutVenueOffered(at(1), venue), venue).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// T-133 · THE DESK'S TERMS ARE THE PORT'S (owner ruling D7).
//
// `lendingTerms` used to return four raw content constants and took no argument at
// all, so Penny Wise's desk read identically at every port in the galaxy. D7 makes
// the PRINCIPAL BAND content and leaves the price alone, and this block is the
// assertion that says which half moved: the band follows the port, the rate, the
// term and the lender do not.
//
// Threshold-free — nothing here names 1,000 or 5,000. The claim is a comparison
// between two ports, read through the engine's own accessor.
// ---------------------------------------------------------------------------
describe('T-133 · the pane’s loan control reads the live port’s band', () => {
  const SUN_3 = 1;
  const ARCTURUS_6 = 4;

  it('reports a lower ceiling at the garrison mess than at the home hall', () => {
    const tight = lendingTerms(at(ARCTURUS_6));
    const home = lendingTerms(at(SUN_3));
    expect(tight.maxPrincipal).toBeLessThan(home.maxPrincipal);
    expect(tight.minPrincipal).toBeGreaterThanOrEqual(home.minPrincipal);
  });

  it('agrees with the engine’s `loanBandFor` at every core port — no UI restatement', () => {
    for (const id of CORE_HANGOUT_IDS) {
      const band = loanBandFor(id);
      const terms = lendingTerms(at(id));
      expect({ min: terms.minPrincipal, max: terms.maxPrincipal }, `port ${id}`).toEqual(band);
    }
  });

  it('…and the RATE, the TERM and the LENDER are still global — the half D7 did NOT move', () => {
    const tight = lendingTerms(at(ARCTURUS_6));
    const home = lendingTerms(at(SUN_3));
    expect(tight.ratePercent).toBe(home.ratePercent);
    expect(tight.termDays).toBe(home.termDays);
    expect(tight.lenderId).toBe(home.lenderId);
    // NON-VACUITY: a schedule of zeroes would satisfy the three equalities above.
    expect(home.ratePercent).toBeGreaterThan(0);
    expect(home.termDays).toBeGreaterThan(0);
    expect(home.lenderId.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// T-197 · THE TWO DAILY CAPS, MADE VISIBLE
// (docs/DAWN-HAND-REDESIGN.md §4a/§4b)
//
// The Accept clause is "never a silent dead button": a freed Hangout verb has no
// armed die for the player to look at, so the caps must be READABLE BEFORE THE
// CLICK or a typed refusal is the first they hear of them. These two selectors are
// what the pane renders (`social-plays-left` / `dare-rounds-left`), and every
// assertion below is that they REPORT THE ENGINE rather than restating it — the
// `lendingTerms` → `loanBandFor` discipline the block above holds `format.ts` to.
// ---------------------------------------------------------------------------

describe('T-197 · the social pool readout reports the engine, never its own arithmetic', () => {
  it('a fresh day reads the full CONTENT allowance', () => {
    const plays = hangoutSocialPlays(createInitialState(1));
    expect(plays.perDay).toBe(SOCIAL_PLAYS_PER_DAY);
    expect(plays.remaining).toBe(SOCIAL_PLAYS_PER_DAY);
    // NON-VACUITY: a pool of zero would satisfy an equality between the two.
    expect(plays.perDay).toBeGreaterThan(0);
  });

  it('tracks the engine accessor exactly as the pool is drawn down, and floors at 0', () => {
    for (const spent of [0, 1, 2, 3, 4]) {
      const game = createInitialState(1);
      game.player.socialPlaysRemaining = SOCIAL_PLAYS_PER_DAY - spent;
      const plays = hangoutSocialPlays(game);
      expect(plays.remaining, `after ${spent} plays`).toBe(socialPlaysRemaining(game));
      expect(plays.remaining).toBeGreaterThanOrEqual(0);
      expect(plays.perDay).toBe(SOCIAL_PLAYS_PER_DAY);
    }
  });
});

describe('T-197 · the Liar’s Dice rounds readout reports the engine, never its own arithmetic', () => {
  it('a fresh captain has their whole tier-0 allowance, and it is at least one hand', () => {
    const rounds = hangoutDareRounds(createInitialState(1));
    expect(rounds.remaining).toBe(liarsDiceRoundsRemaining(createInitialState(1)));
    expect(rounds.remaining).toBeGreaterThan(0);
    expect(rounds.perDay).toBe(rounds.remaining);
  });

  it('remaining + opened === perDay at every point in a day, and never goes negative', () => {
    const game = createInitialState(1);
    const cap = liarsDiceRoundsRemaining(game);
    for (let opened = 0; opened <= cap + 2; opened += 1) {
      game.player.dareRoundsToday = opened;
      const rounds = hangoutDareRounds(game);
      expect(rounds.remaining, `after ${opened} opens`).toBe(liarsDiceRoundsRemaining(game));
      expect(rounds.remaining).toBeGreaterThanOrEqual(0);
      // `perDay` is derived as remaining + opened rather than by re-reading the
      // tier — a second tier read in the UI is the drift `liarsDiceRules.ts`'s
      // header forbids. It therefore only equals the true cap while the player is
      // AT or under it, which is the only state a real save can be in.
      if (opened <= cap) expect(rounds.perDay).toBe(cap);
    }
  });

  it('a HIGHER unlock tier reads a bigger allowance — the "rewarding good play" shape', () => {
    const novice = createInitialState(1);
    const veteran = createInitialState(1);
    veteran.player.liarsDiceGamesPlayed = 500; // top rung, whatever the thresholds are
    expect(hangoutDareRounds(veteran).perDay).toBeGreaterThan(hangoutDareRounds(novice).perDay);
  });
});
