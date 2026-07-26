import { describe, expect, it } from 'vitest';
import {
  ALL_FRAGMENT_IDS,
  CROSSING_DECODED_REQUIREMENT,
  DEEDS,
  RENOWN_DEED_THRESHOLDS,
  CROSSING_ENDING,
  CROSSING_REQUIRED_RANK,
  CROSSING_STAKE_MIN_CREDITS,
  CROSSING_WIRE,
  NEMESIS_CROSSING_DC,
  NEMESIS_SYSTEM_ID,
  RENOWN_RANKS,
  distance as systemDistance,
} from '@spacerquest/content';
import { applyPlayerAction, startDay } from '../day.js';
import { rankForDeedCount } from '../deeds.js';
import { createInitialState } from '../state.js';
import { createSave, loadSave } from '../save.js';
import { jumpFuelCost, syncMaxFuel } from '../economy.js';
import {
  careerEnded,
  careerEpilogue,
  commitCrossingStake,
  decodeFragment,
  grantFragment,
  quoteCrossingStake,
} from '../nemesis.js';
import { travelDc } from '../actions/travel.js';
import type { CrossingRefusal, GameEvent, GameState, PlayerAction } from '../types.js';

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

// ---------------------------------------------------------------------------
// T-1505c · THE FAR SIDE IS TERMINAL.
//
// Design call D7: the terminus is DERIVED (`careerEnded` reads the ship's own
// position), so no GameState field ships and no migration is needed. Design call
// D8: the ENGINE owns "the career is over" — every blockable verb is refused with
// a typed `ActionBlocked{'career-ended'}` that spends nothing, and the epilogue is
// a pure read the UI merely renders.
// ---------------------------------------------------------------------------

/** An ARRIVED career: the stake signed, the jump flown, the ship on the far side.
 *
 *  The registry is stood up by its DEED LEDGER here (not by `readyToCross`'s bare
 *  rank write), because the jump below runs `evaluateDeeds`, which RE-DERIVES
 *  `renownRank` from `earned.length` — a hand-set rank would be silently demoted
 *  in flight and the epilogue would report the wrong rank. Both the count and the
 *  rank are derived from content, so T-1603's threshold rescale moves this with
 *  the game. (Same fixture shape as `sim/__tests__/nemesis-crossing.test.ts`.) */
function crossed(seed = 77): GameState {
  const state = readyToCross(seed);
  state.player.registry.earned = DEEDS.slice(0, RENOWN_DEED_THRESHOLDS.CONQUEROR).map(
    (deed, index) => ({
      id: deed.id,
      title: deed.title,
      citation: deed.citationTemplate,
      day: 1,
      eventIndex: index,
    }),
  );
  state.player.registry.renownRank = rankForDeedCount(state.player.registry.earned.length);
  expect(commitCrossingStake(state, [])).toBe(true);
  state.player.ship.navigation = { strength: 90, condition: 9 };
  const jump = applyPlayerAction(state, {
    type: 'Travel',
    destinationId: NEMESIS_SYSTEM_ID,
    spendDie: 0,
  });
  const check = jump.events.find((event) => event.type === 'StatCheck');
  if (check?.type !== 'StatCheck' || !check.result.success) {
    throw new Error('fixture regression: the pinned hand no longer clears the crossing DC');
  }
  expect(jump.state.player.currentSystemId).toBe(NEMESIS_SYSTEM_ID);
  return jump.state;
}

/** The six blockable verbs — exactly the members of `ActionBlocked.actionType`. */
const BLOCKABLE: PlayerAction[] = [
  { type: 'Trade', action: 'buy-fuel', fuelAmount: 1, spendDie: 0 },
  { type: 'Travel', destinationId: 1, spendDie: 0 },
  { type: 'Shipyard', action: 'repair', component: 'hull', spendDie: 0 },
  { type: 'Storylet', storyletId: 'sage.mizar.decode-first', choiceId: 'decode' },
  { type: 'Explore', spendDie: 0 },
  { type: 'VisitHangout', venue: 'rumor', spendDie: 0 },
];

describe('T-1505c · the far side is terminal', () => {
  it('careerEnded is false everywhere but the far side', () => {
    const beforeCrossing = readyToCross();
    expect(careerEnded(beforeCrossing)).toBe(false);
    // Even with the stake signed and the gate open, the career runs until arrival.
    expect(commitCrossingStake(beforeCrossing, [])).toBe(true);
    expect(careerEnded(beforeCrossing)).toBe(false);

    expect(careerEnded(crossed())).toBe(true);
  });

  it.each(BLOCKABLE.map((action) => [action.type, action] as const))(
    'refuses %s with a typed career-ended block that spends nothing',
    (_label, action) => {
      const state = crossed();
      const before = JSON.parse(JSON.stringify(state)) as GameState;

      const result = applyPlayerAction(state, action);

      const blocked = {
        type: 'ActionBlocked',
        day: state.day,
        actionType: action.type,
        reason: 'career-ended',
      };
      expect(result.events).toEqual([blocked]);
      // The log gained exactly the refusal, and NOTHING else moved: no die spent,
      // no fuel burned, no credits, no rng fork, dayEventCount untouched.
      expect(result.state.eventLog).toEqual([...before.eventLog, blocked]);
      expect(result.state.dayEventCount).toBe(before.dayEventCount);
      expect(result.state.rngState).toEqual(before.rngState);
      expect(result.state.player.credits).toBe(before.player.credits);
      expect(result.state.player.ship.fuel).toBe(before.player.ship.fuel);
      expect(result.state.player.currentSystemId).toBe(before.player.currentSystemId);
      // The hand is byte-identical: the crossing jump spent die 0 and the refusal
      // spent nothing further.
      expect(result.state.player.dawnHand).toEqual(before.player.dawnHand);
    },
  );

  it('reports the epilogue: content prose verbatim, and the career’s own numbers', () => {
    const state = crossed();
    const epilogue = careerEpilogue(state);

    // The prose is CONTENT's, compared against the import — never re-typed here.
    expect(epilogue.kicker).toBe(CROSSING_ENDING.kicker);
    expect(epilogue.title).toBe(CROSSING_ENDING.title);
    expect(epilogue.prose).toEqual(CROSSING_ENDING.prose);
    expect(epilogue.signOff).toBe(CROSSING_ENDING.signOff);
    // The arrival wire line rides the epilogue: the cockpit ticker that used to
    // read it is replaced by the ending screen, so this is now its only
    // player-facing reader.
    expect(epilogue.lastWire).toBe(CROSSING_WIRE.crossed);

    // …and every number is derived from the state the crossing left behind.
    expect(epilogue.day).toBe(state.day);
    expect(epilogue.rankId).toBe(CROSSING_REQUIRED_RANK);
    expect(epilogue.rankLabel).toBe(RENOWN_RANKS[CROSSING_REQUIRED_RANK].label);
    expect(epilogue.deedCount).toBe(state.player.registry.earned.length);
    expect(epilogue.fragmentsHeld).toBe(ALL_FRAGMENT_IDS.length);
    expect(epilogue.fragmentsDecoded).toBe(CROSSING_DECODED_REQUIREMENT);
    // The stake receipt is read off the flags `commitCrossingStake` wrote.
    expect(epilogue.stakeCredits).toBe(state.flags['nemesis.crossing.stake.credits']);
    expect(epilogue.stakeDay).toBe(state.flags['nemesis.crossing.stake.day']);
    expect(epilogue.successionCount).toBe(state.player.legacy.successionCount);
    expect(epilogue.systemsCharted).toBe(state.player.charts.visitedSystemIds.length);
    // The arrival is in the charts, so the far side is counted.
    expect(state.player.charts.visitedSystemIds).toContain(NEMESIS_SYSTEM_ID);
  });

  it('careerEpilogue is a pure read — it mutates nothing', () => {
    const state = crossed();
    const before = JSON.stringify(state);
    careerEpilogue(state);
    expect(JSON.stringify(state)).toBe(before);
  });

  // Standing constraint 3. NO migration ships with this task because NO GameState
  // field was added (design call D7): the terminus is derived from
  // `player.currentSystemId`, which the save schema has always round-tripped.
  it('an ended career survives createSave → loadSave, still ended', () => {
    const state = crossed();
    // The refusal event must survive too — the autosave an ended career writes
    // contains it, and `loadSave` would reject an unknown reason literal.
    const refused = applyPlayerAction(state, { type: 'Explore', spendDie: 0 }).state;

    const reloaded = loadSave(createSave(refused, 77)).state;

    expect(JSON.parse(JSON.stringify(reloaded))).toEqual(JSON.parse(JSON.stringify(refused)));
    expect(careerEnded(reloaded)).toBe(true);
    expect(careerEpilogue(reloaded)).toEqual(careerEpilogue(refused));
    expect(reloaded.eventLog).toContainEqual({
      type: 'ActionBlocked',
      day: refused.day,
      actionType: 'Explore',
      reason: 'career-ended',
    });
  });
});
