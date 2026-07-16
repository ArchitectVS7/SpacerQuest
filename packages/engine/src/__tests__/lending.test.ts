import { describe, it, expect } from 'vitest';
import {
  COLLECTION_ENCOUNTER_MULTIPLIER,
  LENDER_ID,
  LOAN_DAILY_RATE,
  LOAN_DEFAULT_DISPOSITION,
  LOAN_MAX_PRINCIPAL,
  LOAN_MIN_PRINCIPAL,
  LOAN_TERM_DAYS,
} from '@spacerquest/content';
import { createInitialState } from '../state.js';
import { resolveVisitHangout } from '../actions/hangout.js';
import { generateEncounter } from '../actions/travel.js';
import { endDay } from '../day.js';
import { SeededRng } from '../rng.js';
import { DawnHand, DayPhase, GameEvent, GameState, LoanState, PlayerAction } from '../types.js';

// ---------------------------------------------------------------------------
// T-1304 · Penny Wise lending (PRD §7.5). Borrow → per-dusk accrual → repay,
// default consequences that are READ (disposition hit + collection flag), and
// the debt-as-ledger law (credits never negative, a loan is only ever an out).
// ---------------------------------------------------------------------------

/** A DAY-phase state at Sun-3 (a hasHangout hub) with a hand-picked dawn hand so
 *  `spendDie` indices resolve to real, unspent dice. */
function lendingState(dice: number[] = [5, 5, 5, 5, 5]): GameState {
  const state = createInitialState(1);
  state.dayPhase = DayPhase.DAY;
  state.dayEventCount = 0;
  state.player.currentSystemId = 1; // Sun-3
  const spent = new Array<boolean>(dice.length).fill(false);
  state.player.dawnHand = { dice: [...dice], spent } satisfies DawnHand;
  return state;
}

type VisitHangoutAction = Extract<PlayerAction, { type: 'VisitHangout' }>;

function loanAction(
  venue: 'borrow' | 'repay',
  extra: Partial<VisitHangoutAction> = {},
): VisitHangoutAction {
  return { type: 'VisitHangout', venue, spendDie: 0, ...extra };
}

/** Run one dusk (endDay) starting from a DAY-phase state, returning the next
 *  DAY-phase state (phase forced back so the next dusk can run) + its events. */
function oneDusk(state: GameState): { state: GameState; events: GameEvent[] } {
  const result = endDay(state);
  result.state.dayPhase = DayPhase.DAY;
  return result;
}

describe('ledger — borrow → 10-dusk accrual → repay', () => {
  it('accrues simple interest per dusk and clears exactly on full repay', () => {
    const principal = 500;
    // Term must exceed 10 so this isolates pure accrual from a default.
    expect(LOAN_TERM_DAYS).toBeGreaterThan(10);

    let state = lendingState();
    const startCredits = state.player.credits;

    // Borrow.
    const borrow = resolveVisitHangout(
      state,
      loanAction('borrow', { amount: principal }),
      new SeededRng(1),
    );
    state = borrow.state;
    expect(state.player.credits).toBe(startCredits + principal);
    expect(state.player.loan).toMatchObject({
      lender: LENDER_ID,
      principal,
      outstanding: principal,
      status: 'active',
      borrowedDay: 1,
      dueDay: 1 + LOAN_TERM_DAYS,
    });
    expect(borrow.events).toContainEqual(
      expect.objectContaining({ type: 'LoanEvent', kind: 'borrowed', principal }),
    );

    // Advance exactly 10 dusks of pure accrual.
    const perDusk = Math.ceil(principal * LOAN_DAILY_RATE);
    let accrued = 0;
    for (let i = 0; i < 10; i += 1) {
      const dusk = oneDusk(state);
      state = dusk.state;
      accrued += dusk.events.filter((e) => e.type === 'LoanEvent' && e.kind === 'accrued').length;
    }
    expect(accrued).toBe(10);
    expect(state.player.loan?.status).toBe('active'); // no default within the term
    expect(state.player.loan?.outstanding).toBe(principal + 10 * perDusk);

    // Repay in full. Give the repay action a fresh unspent die.
    state.player.dawnHand = { dice: [5, 5, 5, 5, 5], spent: [false, false, false, false, false] };
    const owed = state.player.loan!.outstanding;
    const creditsBefore = state.player.credits;
    const repay = resolveVisitHangout(state, loanAction('repay'), new SeededRng(1));

    expect(repay.state.player.credits).toBe(creditsBefore - owed); // delta = −outstanding
    expect(repay.state.player.loan).toBeNull(); // loan cleared → collection status gone
    expect(repay.events).toContainEqual(
      expect.objectContaining({
        type: 'LoanEvent',
        kind: 'repaid',
        amountPaid: owed,
        cleared: true,
      }),
    );
  });

  it('borrow clamps the requested principal into the content band', () => {
    const below = resolveVisitHangout(
      lendingState(),
      loanAction('borrow', { amount: 1 }),
      new SeededRng(1),
    );
    expect(below.state.player.loan?.principal).toBe(LOAN_MIN_PRINCIPAL);

    const above = resolveVisitHangout(
      lendingState(),
      loanAction('borrow', { amount: 999999 }),
      new SeededRng(1),
    );
    expect(above.state.player.loan?.principal).toBe(LOAN_MAX_PRINCIPAL);
  });
});

describe('default — flips once, applies the disposition hit exactly once', () => {
  it('crossing the due day defaults the loan and drops Penny Wise once', () => {
    let state = lendingState();
    // A loan already due tomorrow so the default fires quickly and deterministically.
    state.player.loan = {
      lender: LENDER_ID,
      principal: 500,
      outstanding: 500,
      dailyRate: LOAN_DAILY_RATE,
      borrowedDay: 1,
      dueDay: 2,
      status: 'active',
    } satisfies LoanState;

    const pennyBefore = state.npcs.find((n) => n.id === LENDER_ID)!.disposition;
    let defaultDrops = 0;
    let defaultedEvents = 0;
    let accruedAfterDefault = 0;

    for (let i = 0; i < 5; i += 1) {
      const dusk = oneDusk(state);
      state = dusk.state;
      for (const e of dusk.events) {
        if (e.type === 'DispositionChanged' && e.reason === 'loan-default') {
          defaultDrops += 1;
          expect(e.npcId).toBe(LENDER_ID);
          expect(e.delta).toBe(LOAN_DEFAULT_DISPOSITION);
        }
        if (e.type === 'LoanEvent' && e.kind === 'defaulted') defaultedEvents += 1;
        if (
          e.type === 'LoanEvent' &&
          e.kind === 'accrued' &&
          state.player.loan?.status === 'defaulted'
        ) {
          accruedAfterDefault += 1;
        }
      }
    }

    expect(state.player.loan?.status).toBe('defaulted');
    expect(defaultDrops).toBe(1); // the hit fires exactly once
    expect(defaultedEvents).toBe(1);
    expect(accruedAfterDefault).toBeGreaterThan(0); // accrual continues after default
    expect(state.npcs.find((n) => n.id === LENDER_ID)!.disposition).toBeLessThan(pennyBefore);
  });
});

describe('typed fails — no die spent, no credit change', () => {
  it('borrow while already carrying a loan → already-has-loan', () => {
    const state = lendingState();
    state.player.loan = {
      lender: LENDER_ID,
      principal: 500,
      outstanding: 500,
      dailyRate: LOAN_DAILY_RATE,
      borrowedDay: 1,
      dueDay: 16,
      status: 'active',
    };
    const credits = state.player.credits;
    const { state: after, events } = resolveVisitHangout(
      state,
      loanAction('borrow', { amount: 500 }),
      new SeededRng(1),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'LoanEvent',
        kind: 'failed',
        failReason: 'already-has-loan',
      }),
    );
    expect(after.player.dawnHand!.spent[0]).toBe(false); // NO die spent
    expect(after.player.credits).toBe(credits); // NO credit change
  });

  it('repay with no active loan → no-loan', () => {
    const state = lendingState();
    state.player.loan = null;
    const { state: after, events } = resolveVisitHangout(
      state,
      loanAction('repay'),
      new SeededRng(1),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'LoanEvent', kind: 'failed', failReason: 'no-loan' }),
    );
    expect(after.player.dawnHand!.spent[0]).toBe(false);
  });

  it('repay with zero credits → insufficient-credits', () => {
    const state = lendingState();
    state.player.credits = 0;
    state.player.loan = {
      lender: LENDER_ID,
      principal: 500,
      outstanding: 500,
      dailyRate: LOAN_DAILY_RATE,
      borrowedDay: 1,
      dueDay: 16,
      status: 'active',
    };
    const { state: after, events } = resolveVisitHangout(
      state,
      loanAction('repay'),
      new SeededRng(1),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'LoanEvent',
        kind: 'failed',
        failReason: 'insufficient-credits',
      }),
    );
    expect(after.player.dawnHand!.spent[0]).toBe(false);
    expect(after.player.credits).toBe(0); // never driven negative
  });

  it('the three die-validation fails route to a LoanEvent (no die spent)', () => {
    // no-die
    const noDie = resolveVisitHangout(
      lendingState(),
      { type: 'VisitHangout', venue: 'borrow', amount: 500 },
      new SeededRng(1),
    );
    expect(noDie.events).toContainEqual(
      expect.objectContaining({ type: 'LoanEvent', kind: 'failed', failReason: 'no-die' }),
    );

    // invalid-die-index
    const badIndex = resolveVisitHangout(
      lendingState(),
      loanAction('borrow', { amount: 500, spendDie: 99 }),
      new SeededRng(1),
    );
    expect(badIndex.events).toContainEqual(
      expect.objectContaining({
        type: 'LoanEvent',
        kind: 'failed',
        failReason: 'invalid-die-index',
      }),
    );

    // die-already-spent
    const spentState = lendingState();
    spentState.player.dawnHand!.spent[0] = true;
    const alreadySpent = resolveVisitHangout(
      spentState,
      loanAction('borrow', { amount: 500 }),
      new SeededRng(1),
    );
    expect(alreadySpent.events).toContainEqual(
      expect.objectContaining({
        type: 'LoanEvent',
        kind: 'failed',
        failReason: 'die-already-spent',
      }),
    );
  });
});

describe('A/B — a defaulted loan measurably raises interception odds', () => {
  it('generateEncounter fires more often when loan.status === defaulted', () => {
    // Fixed seed sweep, identical route + first encounter draw per seed across
    // both arms — only loan.status differs. This isolates the generateEncounter
    // collection-flag reader. MUTATION NOTE: revert the COLLECTION_ENCOUNTER_
    // MULTIPLIER multiply in travel.ts and the two counts become equal → red.
    const ORIGIN = 1;
    const DEST = 2;
    const SEEDS = 500;

    const defaultedLoan: LoanState = {
      lender: LENDER_ID,
      principal: 500,
      outstanding: 800,
      dailyRate: LOAN_DAILY_RATE,
      borrowedDay: 1,
      dueDay: 2,
      status: 'defaulted',
    };

    function count(defaulted: boolean): number {
      let n = 0;
      for (let s = 0; s < SEEDS; s += 1) {
        const state = createInitialState(s + 1);
        state.era = 'VETERAN'; // full encounter rate (no Tour One damp) for signal
        state.player.loan = defaulted ? { ...defaultedLoan } : null;
        if (generateEncounter(state, ORIGIN, DEST, 50, new SeededRng(s + 1000))) n += 1;
      }
      return n;
    }

    const baseline = count(false);
    const defaulted = count(true);

    expect(baseline).toBeGreaterThan(0); // the route is genuinely dangerous
    expect(defaulted).toBeGreaterThan(baseline); // measurably shifted
    // The realized lift tracks the multiplier (>1); assert a clear, non-noise margin.
    expect(defaulted / baseline).toBeGreaterThan(1.2);
    expect(COLLECTION_ENCOUNTER_MULTIPLIER).toBeGreaterThan(1);
  });
});
