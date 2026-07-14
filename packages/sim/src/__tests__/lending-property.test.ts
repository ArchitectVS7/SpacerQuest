import {
  applyDisposition,
  createInitialState,
  endDay,
  resolveVisitHangout,
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
  it('a borrow within the band clears a state that cannot afford the cheapest jump', () => {
    // Force a stateless dead-end at every travelable hub: no credits, dry tank.
    for (const systemId of travelableSystemIds()) {
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
