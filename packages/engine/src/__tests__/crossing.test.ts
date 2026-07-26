import { describe, expect, it } from 'vitest';
import {
  ALL_FRAGMENT_IDS,
  CROSSING_DECODED_REQUIREMENT,
  CROSSING_REQUIRED_RANK,
  CROSSING_STAKE_MIN_CREDITS,
  CROSSING_WIRE,
  NEMESIS_CROSSING_DC,
  NEMESIS_SYSTEM_ID,
  distance as systemDistance,
} from '@spacerquest/content';
import { applyPlayerAction, startDay } from '../day.js';
import { createInitialState } from '../state.js';
import { createSave, loadSave } from '../save.js';
import { jumpFuelCost, syncMaxFuel } from '../economy.js';
import {
  commitCrossingStake,
  decodeFragment,
  grantFragment,
  quoteCrossingStake,
} from '../nemesis.js';
import { travelDc } from '../actions/travel.js';
import type { CrossingRefusal, GameEvent, GameState } from '../types.js';

// ---------------------------------------------------------------------------
// T-1505b · The crossing & the stake.
//
// The stake is a pure ledger act (no rng), so everything here is exact rather
// than seeded-statistical. Two invariants carry most of the weight:
//
//   1. A REFUSAL MUTATES NOTHING. Every refusal case asserts the state is
//      byte-identical (JSON-deep-equal) after the attempt AND that exactly one
//      NemesisCrossing{stake-refused} was emitted. That is what makes the
//      acceptance's "declining or failing the stake leaves state consistent and
//      re-attemptable" mechanical rather than a claim.
//   2. NO NUMBER IS SPELLED HERE. The rank, the decoded requirement, the credit
//      floor, the DC and both wire lines are imported from content, so T-1603's
//      rebalance moves the assertions with the game instead of rotting them.
// ---------------------------------------------------------------------------

const MIZAR = 18; // the Sage's bench — where the crossing is signed

/**
 * A DAY-phase state standing at Mizar-9 with EVERY stake clause satisfied. Each
 * `with*` helper below then breaks exactly one clause, so a refusal test proves
 * the clause it names and nothing else.
 *
 * Scenario input only: the fragments are granted and decoded through the engine's
 * OWN `grantFragment` / `decodeFragment` (never hand-written records), the rank is
 * set on the registry, and the ship is fitted as a veteran's. That the CONQUEROR
 * rank is reachable from real play is proven elsewhere and not re-paid here —
 * `packages/sim/src/__tests__/deed-coverage.test.ts` crosses it in an unguided
 * career.
 */
function readyToCross(seed = 77): GameState {
  const state = startDay(createInitialState(seed)).state;
  state.player.currentSystemId = MIZAR;
  state.player.registry.renownRank = CROSSING_REQUIRED_RANK;
  state.player.credits = CROSSING_STAKE_MIN_CREDITS * 2;
  state.player.debt = 0;
  state.player.loan = null;
  // A fitted drive so the burn is payable, and a hull whose tank can hold it.
  // The capacity is SYNCED through the engine's own chokepoint rather than set by
  // hand, because `applyPlayerAction` re-syncs it on every action — a hand-set
  // maxFuel would be silently clamped back to the junker's 300 mid-test.
  state.player.ship.drives = { strength: 60, condition: 9 };
  state.player.ship.hull = { strength: 30, condition: 9 };
  syncMaxFuel(state.player.ship);
  state.player.ship.fuel = state.player.ship.maxFuel;
  for (const id of ALL_FRAGMENT_IDS) {
    grantFragment(state.player.nemesisFile, id, 'sage', state.day);
    decodeFragment(state.player.nemesisFile, id);
  }
  return state;
}

/** The crossing burn from wherever the ship is standing. */
function burnFor(state: GameState): number {
  return jumpFuelCost(
    state.player.ship.drives,
    systemDistance(state.player.currentSystemId, NEMESIS_SYSTEM_ID),
    state.player.ship.hasTransWarpDrive ?? false,
  );
}

/** Attempt the stake and assert the refusal shape: one typed event, zero mutation. */
function expectRefusal(state: GameState, reason: CrossingRefusal): void {
  expect(quoteCrossingStake(state).reason).toBe(reason);

  const before = JSON.stringify(state);
  const events: GameEvent[] = [];
  const committed = commitCrossingStake(state, events);

  expect(committed).toBe(false);
  expect(JSON.stringify(state)).toBe(before); // NOTHING moved
  expect(events).toEqual([
    { type: 'NemesisCrossing', day: state.day, kind: 'stake-refused', reason },
  ]);
}

describe('Crossing stake — the refusal ladder (T-1505b)', () => {
  it('refuses a captain below the capstone rank', () => {
    const state = readyToCross();
    state.player.registry.renownRank = 'GIGA_HERO';
    expectRefusal(state, 'not-conqueror');
  });

  it('refuses an incomplete decoded set', () => {
    const state = readyToCross();
    // Un-decode exactly one fragment: the file still HOLDS all twelve, so this
    // isolates the decode clause from the fragment-count one.
    state.player.nemesisFile.fragments[0].decoded = false;
    expectRefusal(state, 'fragments-undecoded');
  });

  it('refuses while Guild debt is outstanding', () => {
    const state = readyToCross();
    state.player.debt = 1;
    expectRefusal(state, 'debt-outstanding');
  });

  it('refuses while a Penny Wise loan is live', () => {
    const state = readyToCross();
    state.player.loan = {
      lender: 'npc-penny-wise',
      principal: 500,
      outstanding: 500,
      dailyRate: 0.05,
      borrowedDay: 1,
      dueDay: 20,
      status: 'active',
    };
    expectRefusal(state, 'debt-outstanding');
  });

  it('refuses a balance below the stake floor', () => {
    const state = readyToCross();
    state.player.credits = CROSSING_STAKE_MIN_CREDITS - 1;
    expectRefusal(state, 'insufficient-stake');
  });

  it('refuses a tank that cannot already carry the burn', () => {
    const state = readyToCross();
    state.player.ship.fuel = burnFor(state) - 1;
    expectRefusal(state, 'ship-cannot-carry-the-burn');
  });

  it('refuses a second commit (idempotent — the balance is not re-zeroed)', () => {
    const state = readyToCross();
    expect(commitCrossingStake(state, [])).toBe(true);
    // The captain has traded their way back to a balance since. A second signature
    // must not take it: the gate is already open.
    state.player.credits = CROSSING_STAKE_MIN_CREDITS * 3;
    expectRefusal(state, 'already-committed');
    expect(state.player.credits).toBe(CROSSING_STAKE_MIN_CREDITS * 3);
  });
});

describe('Crossing stake — T-1308 reader (b), both ways (T-1505b)', () => {
  // T-1308 authored CONQUEROR with TWO intended readers and deliberately left (b),
  // "the Nemesis-crossing stake gate", unstubbed so no fake reader could game the
  // reader-consumption signal. This pair discharges it: the ONLY thing that differs
  // between the two states is the rank.
  it('GIGA_HERO is refused and CROSSING_REQUIRED_RANK is accepted, all else equal', () => {
    const under = readyToCross();
    under.player.registry.renownRank = 'GIGA_HERO';
    expect(quoteCrossingStake(under).ok).toBe(false);
    expect(quoteCrossingStake(under).reason).toBe('not-conqueror');

    // Flip ONLY the rank — imported from content, never the literal 'CONQUEROR'.
    under.player.registry.renownRank = CROSSING_REQUIRED_RANK;
    expect(quoteCrossingStake(under).ok).toBe(true);
    expect(quoteCrossingStake(under).reason).toBeNull();
  });
});

describe('Crossing stake — the full decoded set, both ways (T-1505b)', () => {
  it('one short of the set is refused; decoding the last one opens it', () => {
    const state = readyToCross();
    const last = state.player.nemesisFile.fragments[CROSSING_DECODED_REQUIREMENT - 1];
    last.decoded = false;

    const short = quoteCrossingStake(state);
    expect(short.ok).toBe(false);
    expect(short.reason).toBe('fragments-undecoded');
    expect(short.decoded).toBe(CROSSING_DECODED_REQUIREMENT - 1);
    expect(short.decodedRequired).toBe(ALL_FRAGMENT_IDS.length);

    // The Sage's own decode path — the engine helper the decode storylets call.
    expect(decodeFragment(state.player.nemesisFile, last.fragmentId)).toBe(true);
    expect(quoteCrossingStake(state).ok).toBe(true);
  });
});

describe('Crossing stake — the commit (T-1505b)', () => {
  it('signs the whole balance over, sets the three flags, and files the authored wire line', () => {
    const state = readyToCross();
    const balance = state.player.credits;
    const events: GameEvent[] = [];

    expect(commitCrossingStake(state, events)).toBe(true);

    expect(state.player.credits).toBe(0);
    expect(state.flags['nemesis.crossing.unlocked']).toBe(true);
    expect(state.flags['nemesis.crossing.stake.credits']).toBe(balance);
    expect(state.flags['nemesis.crossing.stake.day']).toBe(state.day);

    expect(events).toContainEqual({
      type: 'NemesisCrossing',
      day: state.day,
      kind: 'stake-committed',
      stakeCredits: balance,
    });
    // The prose is CONTENT's, filed verbatim — compared against the import.
    expect(events).toContainEqual({
      type: 'WireEntry',
      day: state.day,
      kind: 'plain',
      message: CROSSING_WIRE.stakeCommitted,
    });
  });

  it('a refused stake is RE-ATTEMPTABLE: fix the clause and the same state commits', () => {
    const state = readyToCross();
    state.player.credits = CROSSING_STAKE_MIN_CREDITS - 1;
    expectRefusal(state, 'insufficient-stake');

    // Same state object lineage — a run, not a fresh fixture. The captain hauls.
    state.player.credits = CROSSING_STAKE_MIN_CREDITS;
    const events: GameEvent[] = [];
    expect(commitCrossingStake(state, events)).toBe(true);
    expect(state.flags['nemesis.crossing.unlocked']).toBe(true);
    expect(state.flags['nemesis.crossing.stake.credits']).toBe(CROSSING_STAKE_MIN_CREDITS);
  });
});

describe('Crossing stake — JSON round-trip (T-1505b, standing constraint 3)', () => {
  // NO new GameState field ships with this task (design call D5) and therefore NO
  // save migration: the crossing's persistent state is the already-versioned
  // `flags` map. The round-trip test still ships, because the flags are only worth
  // anything if the LIFTED GATE survives a reload.
  it('the three flags and the lifted gate survive createSave → loadSave', () => {
    const state = readyToCross();
    expect(commitCrossingStake(state, [])).toBe(true);
    const stake = state.flags['nemesis.crossing.stake.credits'];

    const reloaded = loadSave(createSave(state, 77)).state;

    expect(reloaded.flags['nemesis.crossing.unlocked']).toBe(true);
    expect(reloaded.flags['nemesis.crossing.stake.credits']).toBe(stake);
    expect(reloaded.flags['nemesis.crossing.stake.day']).toBe(state.day);

    // The gate is genuinely lifted on the RELOADED state, not merely recorded.
    const jump = applyPlayerAction(reloaded, {
      type: 'Travel',
      destinationId: NEMESIS_SYSTEM_ID,
      spendDie: 0,
    });
    expect(
      jump.events.some(
        (event) => event.type === 'ActionBlocked' && event.reason === 'destination-locked',
      ),
    ).toBe(false);
  });

  it('a NemesisCrossing event in the log survives the round trip', () => {
    const state = readyToCross();
    const events: GameEvent[] = [];
    commitCrossingStake(state, events);
    state.eventLog.push(...events);

    const reloaded = loadSave(createSave(state, 77)).state;
    expect(reloaded.eventLog).toContainEqual({
      type: 'NemesisCrossing',
      day: state.day,
      kind: 'stake-committed',
      stakeCredits: state.flags['nemesis.crossing.stake.credits'],
    });
  });
});

describe('The crossing jump (T-1505b)', () => {
  /** A state with the stake paid and a die guaranteed to clear the crossing DC. */
  function readyToJump(seed = 77): GameState {
    const state = readyToCross(seed);
    expect(commitCrossingStake(state, [])).toBe(true);
    // A fitted navigation suite — the fiction's "etched corridor", and the reason
    // the endgame roll is winnable. Modifier, not a rigged die.
    state.player.ship.navigation = { strength: 90, condition: 9 };
    return state;
  }

  it('rolls the content crossing DC, not the ~DC-70 distance DC', () => {
    const raw = systemDistance(MIZAR, NEMESIS_SYSTEM_ID);
    // The distance rule would price this jump out of reach entirely — the reason
    // design call D3 exists.
    expect(travelDc(raw)).toBeGreaterThan(60);
    expect(travelDc(raw, NEMESIS_SYSTEM_ID)).toBe(NEMESIS_CROSSING_DC);

    const state = readyToJump();
    const result = applyPlayerAction(state, {
      type: 'Travel',
      destinationId: NEMESIS_SYSTEM_ID,
      spendDie: 0,
    });
    const check = result.events.find((event) => event.type === 'StatCheck');
    expect(check).toBeDefined();
    if (check?.type === 'StatCheck') expect(check.dc).toBe(NEMESIS_CROSSING_DC);
  });

  it('nothing patrols the event horizon — the crossing route takes no encounter', () => {
    // Sweep enough seeds that an ordinary tier-1 lane would certainly interdict.
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = readyToJump(seed);
      const result = applyPlayerAction(state, {
        type: 'Travel',
        destinationId: NEMESIS_SYSTEM_ID,
        spendDie: 0,
      });
      expect(result.events.some((event) => event.type === 'EncounterStarted')).toBe(false);
      expect(result.state.encounter).toBeFalsy();
    }
  });

  it('arriving files the crossed event and the authored wire line', () => {
    const state = readyToJump();
    // Arm the best die in the hand — a real hand, a real check, just not a wasted
    // one. `rollHand` returns descending order, so index 0 is the highest roll.
    const result = applyPlayerAction(state, {
      type: 'Travel',
      destinationId: NEMESIS_SYSTEM_ID,
      spendDie: 0,
    });

    const check = result.events.find((event) => event.type === 'StatCheck');
    if (check?.type !== 'StatCheck' || !check.result.success) {
      throw new Error('fixture regression: the pinned hand no longer clears the crossing DC');
    }

    expect(result.state.player.currentSystemId).toBe(NEMESIS_SYSTEM_ID);
    expect(result.events).toContainEqual({
      type: 'NemesisCrossing',
      day: state.day,
      kind: 'crossed',
    });
    expect(result.events).toContainEqual({
      type: 'WireEntry',
      day: state.day,
      kind: 'plain',
      message: CROSSING_WIRE.crossed,
    });
  });

  it('burns the fuel the stake quote promised', () => {
    const state = readyToJump();
    const burn = quoteCrossingStake(state).burnRequired;
    const before = state.player.ship.fuel;
    const result = applyPlayerAction(state, {
      type: 'Travel',
      destinationId: NEMESIS_SYSTEM_ID,
      spendDie: 0,
    });
    expect(result.state.player.ship.fuel).toBe(before - burn);
  });
});
