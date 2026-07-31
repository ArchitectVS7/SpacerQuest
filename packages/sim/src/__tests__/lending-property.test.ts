import {
  applyDisposition,
  createInitialState,
  endDay,
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
    // T-123 · THE PRECONDITION IS NOW EXPLICIT, AND IT IS THE ENGINE'S OWN.
    // Until T-123 every `hasHangout` port offered all seven venues, so "a loan is
    // always an out" and "a loan is an out at every port" were the same sentence.
    // Arcturus-6's garrison mess (`content/portHangouts.ts`, §6.2) withholds
    // `borrow`, and `resolveVisitHangout` typed-refuses the action there BEFORE the
    // die is spent. The property is therefore restated with the precondition the
    // rule actually carries — `venueOffered(systemId,'borrow')` — rather than with
    // a narrowed sample or a softened bound. The sample is unchanged in size except
    // for the ports the engine now refuses, and the next test asserts what happens
    // at those instead of quietly skipping them.
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

  it('T-123 · at a port with NO desk the refusal is typed and costs nothing — and the strand persists (F-123-2)', () => {
    // THE OTHER HALF OF THE PROPERTY, written down rather than left as a gap. At a
    // port whose row omits `borrow` the §7.5 bad-day out is simply not available,
    // so a captain who arrives with an empty purse and a dry tank stays stranded
    // there. That is a real consequence of §6.2's strict garrison and it is
    // REPORTED (`docs/HANGOUT_REDESIGN.md` §7, F-123-2), not tuned away: the fix
    // would be either a predicate on the row (out by ruling 3) or a rule that no
    // port may withhold the desk (out by §2.2 ruling 5, which grants exactly that
    // bit). What IS asserted here is that the refusal is well-behaved — typed, no
    // die spent, no credits moved, no loan written — so the dead end is a design
    // question and never a crash or a silent burn.
    const deskless = travelableSystemIds().filter((id) => !venueOffered(id, 'borrow'));
    expect(deskless.length).toBeGreaterThan(0); // non-vacuity, and it is Arcturus-6
    for (const systemId of deskless) {
      const state = driveableState(1, systemId);
      state.player.credits = 0;
      state.player.ship.fuel = 0;
      expect(cannotAffordCheapestJump(state)).toBe(true);

      const refused = borrow(state, LOAN_MAX_PRINCIPAL, 1);
      expect(refused.player.credits).toBe(0);
      expect(refused.player.loan ?? null).toBeNull();
      expect(refused.player.dawnHand?.spent[0]).toBe(false);
      expect(cannotAffordCheapestJump(refused)).toBe(true);
    }
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
