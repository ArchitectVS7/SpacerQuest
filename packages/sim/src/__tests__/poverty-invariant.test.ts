import {
  applyPatrolContrabandScan,
  cheapestJumpFuelCost,
  createInitialState,
  endDay,
  isStranded,
  DayPhase,
  SeededRng,
  type EncounterState,
  type GameEvent,
  type GameState,
  type LoanState,
} from '@spacerquest/engine';
import {
  CONTRABAND_FINE,
  LENDER_ID,
  LOAN_DAILY_RATE,
  Stat,
  SUBSISTENCE_STIPEND,
} from '@spacerquest/content';
import { describe, expect, it } from 'vitest';
import { cannotAffordCheapestJump } from '../index.js';

// ---------------------------------------------------------------------------
// T-1605 · Anti-poverty-trap invariant over the NEW adversarial states.
//
// PRD-REIMAGINED law ("Scarcity of choices, never a poverty trap"): no actor gets
// permanently trapped at zero with no move left; the world provides floors. T-1304's
// lending-property.test.ts already machine-checks that the Penny Wise loan lifecycle
// never manufactures a dead-end. This suite EXTENDS the guarantee over the adversarial
// states T-16xx introduced, asserting the machine-checkable form of the law:
//
//   From each named adversarial state, the ship is NOT a permanent dead-end — a
//   bounded run of `isStranded`-gated subsistence dusks provably restores mobility
//   (isStranded / cannotAffordCheapestJump flips true → false within a bounded cap),
//   and credits/fuel never go negative anywhere along the recovery (P1-style).
//
// The named states: indebted-to-Penny-Wise, post-confiscation, zero-fuel-rim.
//
// Readers of record (standing constraint 7): the invariant reads the already-shipped
// engine exports `isStranded` / `cheapestJumpFuelCost` and the `SUBSISTENCE_STIPEND`
// floor day.ts endDay applies under `isStranded`. No new state field is introduced, so
// this test is itself the reader; nothing new to name.
//
// The sim package is the right home: it can import BOTH the engine adversarial-state
// API and `cannotAffordCheapestJump` (the engine cannot import sim). Runs in the sim
// vitest suite, which the CI `npm test` job executes.
// ---------------------------------------------------------------------------

const RIM_CORNER = 20; // the far rim corner — the seed-77 strand's system
const RECOVERY_DUSK_CAP = 30; // a strand must un-strand well within this many dusks

/** A DAY-phase state at a chosen system (mirrors lending-property's driveableState)
 *  so the real dusk loop (endDay) can be driven over it. */
function driveableState(seed: number, systemId = RIM_CORNER): GameState {
  const state = createInitialState(seed);
  state.dayPhase = DayPhase.DAY;
  state.player.currentSystemId = systemId;
  return state;
}

function assertSolvent(state: GameState): void {
  expect(state.player.credits).toBeGreaterThanOrEqual(0);
  expect(state.player.ship.fuel).toBeGreaterThanOrEqual(0);
}

/**
 * Drive the REAL dusk loop over a genuinely stranded state until the subsistence floor
 * restores mobility, asserting (a) it never exceeds `cap` dusks, and (b) credits/fuel
 * never go negative at any intermediate dusk. Returns the number of dusks it took.
 * Precondition asserted by the callers: `isStranded(state)` is true on entry (the state
 * is genuinely adversarial), so the floor is actually the thing doing the rescue.
 */
function recoverFromStrand(state: GameState, cap = RECOVERY_DUSK_CAP): number {
  let dusks = 0;
  while (isStranded(state) && dusks < cap) {
    const before = state.player.credits;
    state = endDay(state).state;
    state.dayPhase = DayPhase.DAY;
    assertSolvent(state);
    // The floor is a real income while stranded: each stranded dusk must credit the
    // stipend, so recovery is monotone and bounded (never an infinite grind).
    expect(state.player.credits).toBeGreaterThanOrEqual(before + SUBSISTENCE_STIPEND);
    dusks += 1;
  }
  // Mobility restored within the cap — the strand was recoverable, not a dead-end.
  expect(isStranded(state)).toBe(false);
  expect(cannotAffordCheapestJump(state)).toBe(false);
  expect(dusks).toBeLessThan(cap);
  return dusks;
}

describe('T-1605 · anti-poverty-trap invariant over the adversarial states', () => {
  // -------------------------------------------------------------------------
  // zero-fuel-rim — a broke ship at a rim corner with a tank below the cheapest
  // jump out and credits below even a single unit of fuel. Genuinely stranded, yet
  // the subsistence floor must climb it back to a legal jump within the cap.
  // -------------------------------------------------------------------------
  it('zero-fuel-rim: bounded subsistence recovery restores a legal jump', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const state = driveableState(seed, RIM_CORNER);
      state.player.credits = 0;
      state.player.ship.fuel = 0;

      // The state is genuinely adversarial: no jump now, no credit to buy the fuel.
      expect(state.player.ship.fuel).toBeLessThan(cheapestJumpFuelCost(state));
      expect(isStranded(state)).toBe(true);

      recoverFromStrand(state);
    }
  });

  // -------------------------------------------------------------------------
  // post-confiscation — the ship survived a caught PATROL contraband scan (cargo
  // seized + fine levied via the REAL resolver), stranded at a rim corner with a
  // dry tank. The seizure is what pins it at zero; the floor must still free it.
  // -------------------------------------------------------------------------
  it('post-confiscation: a seized hold at a dry rim corner still recovers', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const state = driveableState(seed, RIM_CORNER);
      // Carry a sealed contraband pod (the derelict-pod source isCarryingIllicit
      // reads), a thin purse the fine can wipe, a dry tank, and low concealment.
      state.flags['signal.contraband.carrying'] = true;
      state.player.credits = CONTRABAND_FINE; // the fine can seize all of it → 0
      state.player.ship.fuel = 0;
      state.player.stats[Stat.GUILE] = 1; // easily scanned (low DC)

      // A PATROL interceptor with high GUILE — so the scan reliably CATCHES (the
      // patrol beats the low DC on all but a nat1). Drive the REAL resolver so the
      // seizure is the engine's, not a hand-rolled mutation that could drift.
      const encounter = patrolEncounter();
      const caught = driveCaughtScan(state, encounter);
      expect(caught).toBe(true);

      // Confiscation actually landed: the pod flag is cleared and the fine took credits.
      expect(state.flags['signal.contraband.carrying']).toBeUndefined();
      expect(state.player.credits).toBe(0);

      // Genuinely stranded post-seizure, then recoverable by the floor.
      expect(isStranded(state)).toBe(true);
      recoverFromStrand(state);
    }
  });

  // -------------------------------------------------------------------------
  // indebted-to-Penny-Wise — a maximally-indebted, DEFAULTED loan at a rim corner
  // with a dry tank. lending-property.test.ts already proves the loan lifecycle never
  // strands; this ties the loan state to the STRAND recovery it does not cover: even a
  // deep-defaulted debtor escapes the dry-tank strand via the floor, and the loan's
  // interest (which accrues only to `outstanding`, never to credits — day.ts) never
  // eats the stipend that funds the escape.
  // -------------------------------------------------------------------------
  it('indebted-to-Penny-Wise: a defaulted debtor still escapes the strand via the floor', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const state = driveableState(seed, RIM_CORNER);
      state.player.credits = 0;
      state.player.ship.fuel = 0;
      const loan: LoanState = {
        lender: LENDER_ID,
        principal: 5000,
        outstanding: 50_000, // maximally indebted — a deep, defaulted balance
        dailyRate: LOAN_DAILY_RATE,
        borrowedDay: 1,
        dueDay: 2,
        status: 'defaulted',
      };
      state.player.loan = loan;

      expect(isStranded(state)).toBe(true);
      recoverFromStrand(state);

      // The escape did NOT clear the debt (the floor is a lifeline, not a bailout):
      // the loan is still owed and has only grown with interest — yet the ship moved.
      expect(state.player.loan).not.toBeNull();
      expect(state.player.loan?.outstanding).toBeGreaterThanOrEqual(50_000);
    }
  });
});

/** A minimal PATROL interceptor whose GUILE is high enough that its scan beats a
 *  low-concealment player's DC on any non-nat1 roll — so the caught path is reliable
 *  across seeds without depending on a lucky die. */
function patrolEncounter(): EncounterState {
  const stats: Record<Stat, number> = {
    [Stat.PILOT]: 10,
    [Stat.GUNS]: 10,
    [Stat.TRADE]: 10,
    [Stat.GRIT]: 10,
    [Stat.GUILE]: 20,
  };
  return {
    id: 'patrol-test',
    pendingTravel: { origin: RIM_CORNER, destination: 1, fuelUsed: 0 },
    interceptor: {
      id: 'patrol-test-npc',
      source: 'anonymous',
      name: 'Patrol Cutter',
      shipName: 'Enforcer',
      kind: 'PATROL',
      stats,
      tier: 3,
    },
    routeDangerLevel: 3,
    routeDangerChance: 1,
    encounterRoll: 1,
    round: 1,
    enemyHull: 3,
  };
}

/** Roll the REAL patrol scan against `state` (mutating it) until it CATCHES, so the
 *  seizure is produced by the engine resolver, not a hand-rolled edit. Returns true
 *  once the `ContrabandConfiscated` consequence has landed. */
function driveCaughtScan(state: GameState, encounter: EncounterState): boolean {
  for (let k = 0; k < 200; k += 1) {
    const events: GameEvent[] = [];
    applyPatrolContrabandScan(state, encounter, new SeededRng(k), events);
    if (events.some((e) => e.type === 'ContrabandConfiscated')) return true;
  }
  return false;
}
