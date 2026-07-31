import {
  applyDisposition,
  createInitialState,
  endDay,
  loanBandFor,
  resolveVisitHangout,
  venueOffered,
  DayPhase,
  SeededRng,
  type GameEvent,
  type GameState,
  type LoanState,
  type PlayerAction,
} from '@spacerquest/engine';
import {
  LENDER_ID,
  LOAN_DAILY_RATE,
  LOAN_DEFAULT_DISPOSITION,
  LOAN_MAX_PRINCIPAL,
  LOAN_MIN_PRINCIPAL,
  LOAN_TERM_DAYS,
} from '@spacerquest/content';
import { describe, expect, it } from 'vitest';
import { cannotAffordCheapestJump, travelableSystemIds } from '../index.js';

// ---------------------------------------------------------------------------
// T-1304 · Anti-poverty property test (acceptance #4). Proves the Penny Wise
// loan mechanism can NEVER manufacture a stateless dead-end:
//   P1 — every intermediate state of a loan lifecycle keeps credits >= 0 and
//        fuel >= 0 (borrow only adds credits; repay is clamped to credits;
//        interest accrues to the loan, never to credits or fuel).
//   P2 — a loan is always an OUT (a borrow within the band clears a state that
//        cannot afford the cheapest jump) AND default never strands (applying the
//        default consequences to any state never flips cannotAffordCheapestJump
//        false → true — default touches only the flag / disposition / odds).
//
// T-123 · P2's first limb now carries the precondition the engine carries: the
// port must actually run a credit desk. Arcturus-6 withholds it (§6.2's strict
// garrison), and the port-with-no-desk case is asserted in its own test rather
// than dropped from the sample. See F-123-2 in docs/HANGOUT_REDESIGN.md §7.
//
// The sim package is the right home: it can import BOTH the engine loan API and
// `cannotAffordCheapestJump` (the engine cannot import sim).
// ---------------------------------------------------------------------------

/** A DAY-phase state with a fresh unspent dawn hand, ready to drive borrow/repay
 *  through the real resolver and endDay through the real dusk loop. */
function driveableState(seed: number, systemId = 1): GameState {
  const state = createInitialState(seed);
  state.dayPhase = DayPhase.DAY;
  state.player.currentSystemId = systemId;
  freshHand(state);
  return state;
}

function freshHand(state: GameState): void {
  state.player.dawnHand = { dice: [5, 5, 5, 5, 5], spent: [false, false, false, false, false] };
}

function borrow(state: GameState, amount: number, seed: number): GameState {
  const action: PlayerAction = { type: 'VisitHangout', venue: 'borrow', amount, spendDie: 0 };
  return resolveVisitHangout(state, action, new SeededRng(seed)).state;
}

function repay(state: GameState, amount: number, seed: number): GameState {
  const action: PlayerAction = { type: 'VisitHangout', venue: 'repay', amount, spendDie: 0 };
  return resolveVisitHangout(state, action, new SeededRng(seed)).state;
}

function assertSolvent(state: GameState): void {
  expect(state.player.credits).toBeGreaterThanOrEqual(0);
  expect(state.player.ship.fuel).toBeGreaterThanOrEqual(0);
}

describe('P1 — a loan lifecycle never drives credits or fuel negative', () => {
  it('borrow → deep-default accrual → arbitrary partial repays stay non-negative', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const rng = new SeededRng(seed);
      let state = driveableState(seed);
      assertSolvent(state);

      // A varied principal within the band.
      const principal =
        LOAN_MIN_PRINCIPAL + Math.floor(rng.next() * (LOAN_MAX_PRINCIPAL - LOAN_MIN_PRINCIPAL));
      state = borrow(state, principal, seed);
      assertSolvent(state);
      expect(state.player.loan?.principal).toBe(
        Math.max(LOAN_MIN_PRINCIPAL, Math.min(LOAN_MAX_PRINCIPAL, principal)),
      );

      // Deep run: past the due day (forces a default) and well beyond (deep
      // accrual). Invariant holds at EVERY intermediate dusk.
      const duskCount = LOAN_TERM_DAYS + 1 + Math.floor(rng.next() * 20);
      for (let d = 0; d < duskCount; d += 1) {
        state = endDay(state).state;
        state.dayPhase = DayPhase.DAY;
        assertSolvent(state);
      }
      expect(state.player.loan?.status).toBe('defaulted'); // the deep run defaulted

      // Arbitrary partial repays — some larger than owed (must clamp, never
      // overpay into negative credits), some tiny.
      for (let r = 0; r < 4 && state.player.loan; r += 1) {
        freshHand(state);
        const owed = state.player.loan.outstanding;
        const amount = Math.floor(rng.next() * owed * 1.5); // sometimes > owed
        state = repay(state, amount, seed * 100 + r);
        assertSolvent(state);
      }
    }
  });
});

describe('P2 — a loan is always an out, and default never strands', () => {
  it('a borrow within the band clears a state that cannot afford the cheapest jump — WHEREVER THE DESK IS', () => {
    // T-123 · THE PRECONDITION IS EXPLICIT, AND IT IS THE ENGINE'S OWN. Until
    // T-123 every `hasHangout` port offered all seven venues, so "a loan is always
    // an out" and "a loan is an out at every port" were the same sentence; the
    // garrison mess then withheld `borrow` and the two came apart. T-133 (owner
    // ruling D7) closes them back up — no authored row withholds the desk any more
    // — but the precondition STAYS WRITTEN DOWN rather than being simplified away,
    // because it is the precondition the rule actually carries and a later row may
    // exercise it again. The next test is the one that pins today's answer.
    //
    // T-133 · the amount asked for is the GLOBAL ceiling and the engine clamps it
    // to each port's band, so at the tightest desk this is a 1,000cr rescue rather
    // than a 5,000cr one — and it still has to clear the strand.
    const deskPorts = travelableSystemIds().filter((id) => venueOffered(id, 'borrow'));
    // NON-VACUITY: if a later content pass withdrew every desk, this loop would
    // pass while proving nothing.
    expect(deskPorts.length).toBeGreaterThan(0);
    for (const systemId of deskPorts) {
      const state = driveableState(1, systemId);
      state.player.credits = 0;
      state.player.ship.fuel = 0;
      expect(cannotAffordCheapestJump(state)).toBe(true); // genuinely stranded

      // Penny Wise's band has the headroom to be a real out: borrowing clears it.
      const rescued = borrow(state, LOAN_MAX_PRINCIPAL, 1);
      expect(cannotAffordCheapestJump(rescued)).toBe(false);
      // And the loan never DROVE credits negative doing so.
      expect(rescued.player.credits).toBeGreaterThanOrEqual(0);
    }
  });

  it('T-133 · F-123-2 IS CLOSED — every port runs a desk, and the TIGHTEST one still clears a strand', () => {
    // THE OTHER HALF OF THE PROPERTY, INVERTED BY OWNER RULING D7. Until T-133 the
    // garrison mess withheld `borrow` outright, so a captain who arrived there with
    // an empty purse and a dry tank stayed stranded — a real dead end, REPORTED as
    // F-123-2 (`docs/HANGOUT_REDESIGN.md` §7) rather than tuned away, because the
    // only fixes available under ruling 5 as written were out of bounds. D7 gives a
    // row its own `loanBand` instead of an all-or-nothing desk, and the garrison
    // re-opens against a tight ceiling. The dead end is gone, and this test is the
    // place that says so.
    //
    // The claim is NOT "the refusal is unreachable" — a later row may close a desk
    // again, and the resolver's typed refusal is pinned in the engine suite either
    // way. The claim is that TODAY the §7.5 bad-day out exists at every port a
    // captain can reach, and that the SHALLOWEST desk in the galaxy is still deep
    // enough to be an out rather than a gesture.
    const deskless = travelableSystemIds().filter((id) => !venueOffered(id, 'borrow'));
    expect(deskless, 'ports where the §7.5 out is unavailable').toEqual([]);

    // The tightest authored ceiling, found rather than named, so the assertion
    // below is about the WORST case and not about Arcturus-6 in particular.
    const ports = travelableSystemIds();
    const tightest = ports.reduce((worst, id) =>
      loanBandFor(id).max < loanBandFor(worst).max ? id : worst,
    );
    // NON-VACUITY: some port must actually deal below the global ceiling, or this
    // is the first test over again.
    expect(loanBandFor(tightest).max).toBeLessThan(LOAN_MAX_PRINCIPAL);

    const state = driveableState(1, tightest);
    state.player.credits = 0;
    state.player.ship.fuel = 0;
    expect(cannotAffordCheapestJump(state)).toBe(true);

    // Ask for the galaxy's ceiling; the engine clamps to this desk's. The strand
    // still clears, and the clamped advance is what did it.
    const rescued = borrow(state, LOAN_MAX_PRINCIPAL, 1);
    expect(rescued.player.loan?.principal).toBe(loanBandFor(tightest).max);
    expect(cannotAffordCheapestJump(rescued)).toBe(false);
    expect(rescued.player.credits).toBeGreaterThanOrEqual(0);
  });

  it('applying the default consequences never flips cannotAffordCheapestJump false → true', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const rng = new SeededRng(seed);
      const state = driveableState(seed);
      // Arbitrary solvency: sometimes flush, sometimes lean (but never stranded
      // by construction — a fresh junker at a hub can always afford a hop).
      state.player.credits = Math.floor(rng.next() * 2000);
      const loan: LoanState = {
        lender: LENDER_ID,
        principal: 500,
        outstanding: 500 + Math.floor(rng.next() * 2000),
        dailyRate: LOAN_DAILY_RATE,
        borrowedDay: 1,
        dueDay: 2,
        status: 'active',
      };
      state.player.loan = loan;

      const before = cannotAffordCheapestJump(state);

      // Apply the exact default consequences: flip the collection flag + take the
      // one-time disposition hit. Neither touches credits/fuel/maxFuel/price, so
      // the affordability predicate is invariant under them.
      loan.status = 'defaulted';
      const events: GameEvent[] = [];
      applyDisposition(state, LENDER_ID, LOAN_DEFAULT_DISPOSITION, 'loan-default', events);

      const after = cannotAffordCheapestJump(state);
      expect(after).toBe(before); // never false → true (in fact, never changes)
    }
  });
});
