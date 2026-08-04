import { describe, it, expect } from 'vitest';
import { NEMESIS_SYSTEM_ID, isGatedDestination, isSimulatedCaptain } from '@spacerquest/content';
import { advanceDay, applyPlayerAction, endDay, startDay } from '../day.js';
import type { NpcDecisionTrace } from '../npc.js';
import { createInitialState, serializeState, deserializeState } from '../state.js';
import { DayPhase, GameState, PlayerAction } from '../types.js';
import {
  DAY_LOOP_GOLDEN_EVENTS_HASH,
  DAY_LOOP_GOLDEN_STATE_HASH,
  SEED,
  STORYLET_GOLDEN_EVENTS_HASH,
  STORYLET_GOLDEN_STATE_HASH,
  STORYLET_SCRIPT,
  STORYLET_SEED,
  TEN_DAY_SCRIPT,
  runDayLoopGolden,
} from './fixtures/day-loop-golden.js';

describe('Day loop', () => {
  it('advances day deterministically', () => {
    const state1 = createInitialState(123);
    const state2 = createInitialState(123);

    const result1 = advanceDay(state1, []);
    const result2 = advanceDay(state2, []);

    // Should increment day
    expect(result1.state.day).toBe(2);
    expect(result1.state.dayPhase).toBe(DayPhase.DAWN);
    expect(result1.state.dayEventCount).toBe(0);
    expect(result1.events[result1.events.length - 1]).toEqual({ type: 'DayAdvanced', day: 2 });
    expect(result1.state.eventLog[result1.state.eventLog.length - 1]).toEqual({
      type: 'DayAdvanced',
      day: 2,
    });
    expect(result1.state.eventLog).toEqual(result1.events);

    // Hand should be populated and marked fully spent because player waited
    expect(result1.state.player.dawnHand).toBeDefined();
    expect(result1.state.player.dawnHand?.spent).toEqual([true, true, true, true, true]);

    // Should be deterministic
    expect(result1.state).toEqual(result2.state);
    expect(result1.events).toEqual(result2.events);
  });

  it('serializes and deserializes', () => {
    const state = createInitialState(999);
    const { state: nextState } = advanceDay(state, []);

    const json = serializeState(nextState);
    const restored = deserializeState(json);

    expect(restored).toEqual(nextState);
    expect(restored.dayPhase).toBe(DayPhase.DAWN);
    expect(restored.dayEventCount).toBe(0);
  });

  it('emits DayAdvanced after dusk events in returned events and eventLog', () => {
    const state = createInitialState(321);
    state.player.debtDueDay = 1;

    const result = advanceDay(state, []);
    const dayAdvanced = { type: 'DayAdvanced', day: 2 };
    const returnedDebtDueIndex = result.events.findIndex((event) => event.type === 'DebtDue');
    const returnedDayAdvancedIndex = result.events.findIndex(
      (event) => event.type === 'DayAdvanced',
    );
    const loggedDebtDueIndex = result.state.eventLog.findIndex((event) => event.type === 'DebtDue');
    const loggedDayAdvancedIndex = result.state.eventLog.findIndex(
      (event) => event.type === 'DayAdvanced',
    );

    expect(result.events[result.events.length - 1]).toEqual(dayAdvanced);
    expect(result.state.eventLog[result.state.eventLog.length - 1]).toEqual(dayAdvanced);
    expect(result.state.eventLog).toEqual(result.events);
    expect(returnedDebtDueIndex).toBeGreaterThan(-1);
    expect(loggedDebtDueIndex).toBeGreaterThan(-1);
    expect(returnedDayAdvancedIndex).toBeGreaterThan(returnedDebtDueIndex);
    expect(loggedDayAdvancedIndex).toBeGreaterThan(loggedDebtDueIndex);
  });

  it('matches the committed golden for a 10-day scripted batch advance', () => {
    // Replaces the old batch-vs-stepped equivalence test, which compared
    // advanceDay against a hand-inlined copy of its own body (startDay ->
    // applyPlayerAction* -> endDay) — a tautology that can never go red because a
    // rule change moves both sides identically. Here the final state and the
    // day-event stream are pinned to COMMITTED hashes (fixtures/day-loop-golden),
    // so any drift in the real day loop is caught. Regenerate the golden via
    // gen-day-loop-golden.ts when a rule deliberately changes.
    const golden = runDayLoopGolden(SEED, TEN_DAY_SCRIPT);
    expect(golden.stateHash).toBe(DAY_LOOP_GOLDEN_STATE_HASH);
    expect(golden.eventsHash).toBe(DAY_LOOP_GOLDEN_EVENTS_HASH);
  });

  it('matches the committed golden across a Storylet action', () => {
    // Anchors the Storylet action path (Sol-3 guild-auditor is deterministically
    // available on day 1 at seed 555) against committed golden hashes — the
    // coverage the deleted batch-vs-stepped storylet test provided, now guarded
    // by a golden instead of a tautological self-comparison.
    const availability = startDay(createInitialState(STORYLET_SEED));
    expect(availability.state.storylets.available.map((offer) => offer.storyletId)).toContain(
      'port.sun3.guild-auditor',
    );

    const golden = runDayLoopGolden(STORYLET_SEED, STORYLET_SCRIPT);
    expect(golden.stateHash).toBe(STORYLET_GOLDEN_STATE_HASH);
    expect(golden.eventsHash).toBe(STORYLET_GOLDEN_EVENTS_HASH);
  });

  it('can serialize and resume mid-day with the same final state as batch advance', () => {
    const state = createInitialState(789);
    const actions: PlayerAction[] = [
      { type: 'Trade', action: 'buy-fuel', fuelAmount: 12, spendDie: 0 },
      { type: 'Travel', destinationId: 2, spendDie: 1 },
      { type: 'Trade', action: 'pay-debt', amount: 25 },
    ];

    const batch = advanceDay(state, actions);

    const dawn = startDay(state);
    const firstAction = applyPlayerAction(dawn.state, actions[0]);
    const restored = deserializeState(serializeState(firstAction.state));

    expect(restored.dayPhase).toBe(DayPhase.DAY);
    expect(restored.rngState).toBe(firstAction.state.rngState);
    expect(restored.dayEventCount).toBe(firstAction.state.dayEventCount);

    let resumedState = restored;
    for (const action of actions.slice(1)) {
      const result = applyPlayerAction(resumedState, action);
      resumedState = result.state;
    }

    const resumed = endDay(resumedState);

    expect(resumed.state).toEqual(batch.state);
  });

  it('serializes and resumes mid-day across a Storylet action', () => {
    const actions: PlayerAction[] = [
      { type: 'Storylet', storyletId: 'port.sun3.guild-auditor', choiceId: 'argue', spendDie: 0 },
      { type: 'Travel', destinationId: 2, spendDie: 1 },
      { type: 'Trade', action: 'pay-debt', amount: 25 },
    ];

    const batch = advanceDay(createInitialState(777), actions);

    const dawn = startDay(createInitialState(777));
    const firstAction = applyPlayerAction(dawn.state, actions[0]);
    const restored = deserializeState(serializeState(firstAction.state));

    expect(restored.dayPhase).toBe(DayPhase.DAY);
    expect(restored.rngState).toBe(firstAction.state.rngState);
    expect(restored.dayEventCount).toBe(firstAction.state.dayEventCount);

    let resumedState = restored;
    for (const action of actions.slice(1)) {
      resumedState = applyPlayerAction(resumedState, action).state;
    }
    const resumed = endDay(resumedState);

    expect(resumed.state).toEqual(batch.state);
  });

  it('persists active encounters across day end', () => {
    const state = createInitialState(246);
    const dawn = startDay(state);
    dawn.state.encounter = {
      id: 'enc-persist',
      pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
      interceptor: {
        id: 'anon-pirate-1',
        source: 'anonymous',
        name: 'K)(akj',
        shipName: 'K1++++',
        shipClass: 'Maligna Bat',
        homeSystem: 'Pollux-7',
        kind: 'PIRATE',
        rosterIndex: 1,
        stats: { PILOT: 1, GUNS: 0, TRADE: 0, GRIT: 0, GUILE: 1 },
        tier: 1,
      },
      routeDangerLevel: 1,
      routeDangerChance: 0.08,
      encounterRoll: 0.01,
      round: 1,
      enemyHull: 1,
    };

    const dusk = endDay(dawn.state);

    expect(dusk.state.dayPhase).toBe(DayPhase.DAWN);
    expect(dusk.state.encounter?.round).toBe(2);
    expect(dusk.events).toContainEqual(
      expect.objectContaining({ type: 'EnemyCounterAction', pressure: 'day-end' }),
    );
  });
});

describe('Destination gate (T-1101)', () => {
  /** A DAY-phase state with a fresh dawn hand and a full tank. */
  function dayState(seed = 42): ReturnType<typeof startDay>['state'] {
    const state = startDay(createInitialState(seed));
    const next = state.state;
    next.player.ship.fuel = next.player.ship.maxFuel;
    return next;
  }

  it.each([
    ['NEMESIS', 28],
    ['Andromeda', 22],
  ])('blocks Travel to a gated destination (%s) with a typed fail, not a throw', (_label, dest) => {
    const state = dayState();
    const before = structuredClone(state);

    let result: ReturnType<typeof applyPlayerAction> | undefined;
    expect(() => {
      result = applyPlayerAction(state, { type: 'Travel', destinationId: dest, spendDie: 0 });
    }).not.toThrow();
    if (!result) throw new Error('unreachable');

    const blocked = {
      type: 'ActionBlocked',
      day: state.day,
      actionType: 'Travel',
      reason: 'destination-locked',
    };
    // Typed fail — the only event, appended to the log, and NOTHING else moved:
    // no die spent, dayEventCount unchanged, system unchanged (mirrors the
    // encounter-block precedent).
    expect(result.events).toEqual([blocked]);
    expect(result.state.eventLog).toEqual([...before.eventLog, blocked]);
    expect(result.state.dayEventCount).toBe(before.dayEventCount);
    expect(result.state.player.currentSystemId).toBe(before.player.currentSystemId);
    expect(result.state.player.dawnHand?.spent).toEqual(before.player.dawnHand?.spent);
    expect(result.state.player.dawnHand?.spent.some(Boolean)).toBe(false);
  });

  it('the nemesis.crossing.unlocked flag lifts the gate (the consumed reader)', () => {
    const state = dayState();
    state.flags['nemesis.crossing.unlocked'] = true;

    const result = applyPlayerAction(state, { type: 'Travel', destinationId: 28, spendDie: 0 });

    // No refusal: travel proceeds down the normal pilot-check path.
    expect(
      result.events.some(
        (event) => event.type === 'ActionBlocked' && event.reason === 'destination-locked',
      ),
    ).toBe(false);
    expect(result.events.some((event) => event.type === 'StatCheck')).toBe(true);
  });

  // T-1505b · The other half of "the gate lift asserted both ways": the flag lifts
  // NEMESIS (28) and NOTHING ELSE. Andromeda (21–26) and MALIGNA (27) stay sealed
  // for the expansion (PRD §10) even with the crossing paid, so a post-stake Travel
  // to any of them is still a typed 'destination-locked' refusal. Design call D1,
  // stated at `GATED_DESTINATION_MIN_ID` (content systems.ts) and in the day.ts gate.
  it.each([21, 22, 23, 24, 25, 26, 27])(
    'the lift is NEMESIS-only — system %i stays sealed even with the crossing paid',
    (dest) => {
      const state = dayState();
      state.flags['nemesis.crossing.unlocked'] = true;
      const before = structuredClone(state);

      const result = applyPlayerAction(state, {
        type: 'Travel',
        destinationId: dest,
        spendDie: 0,
      });

      expect(result.events).toEqual([
        {
          type: 'ActionBlocked',
          day: state.day,
          actionType: 'Travel',
          reason: 'destination-locked',
        },
      ]);
      // Nothing moved: no die spent, no fuel burned, still at the origin.
      expect(result.state.player.currentSystemId).toBe(before.player.currentSystemId);
      expect(result.state.player.ship.fuel).toBe(before.player.ship.fuel);
      expect(result.state.player.dawnHand?.spent.some(Boolean)).toBe(false);
    },
  );

  it('core travel is unaffected by the gate', () => {
    const state = dayState();
    const result = applyPlayerAction(state, { type: 'Travel', destinationId: 2, spendDie: 0 });

    expect(result.events.some((event) => event.type === 'ActionBlocked')).toBe(false);
    // T-1605: an ordinary jump takes no pilot check any more, so the signal that
    // travel actually RESOLVED is the TravelEvent itself, not a StatCheck.
    expect(result.events.some((event) => event.type === 'TravelEvent')).toBe(true);
  });

  // T-1505c · GUARD ORDER. The terminal guard sits ABOVE the destination gate, so
  // a jump attempted from the far side reports the true reason (the career is
  // over) rather than a sealed door that could still notionally open. Both refusals
  // would otherwise fire on this exact action, which is what makes the ordering
  // observable — and worth pinning.
  it('from the far side a gated jump reads career-ended, not destination-locked', () => {
    const state = dayState();
    state.player.currentSystemId = NEMESIS_SYSTEM_ID;
    state.flags['nemesis.crossing.unlocked'] = true;

    const result = applyPlayerAction(state, { type: 'Travel', destinationId: 21, spendDie: 0 });

    expect(result.events).toEqual([
      {
        type: 'ActionBlocked',
        day: state.day,
        actionType: 'Travel',
        reason: 'career-ended',
      },
    ]);
    // The destination genuinely IS gated — the ordering, not the target, is what
    // decides which refusal the player sees.
    expect(isGatedDestination(21)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-140 · The dusk hands the trace sink down (docs/BALANCE-TELEMETRY_SPEC.md).
// ---------------------------------------------------------------------------
//
// `endDay` is the only door between a run and `resolveNpcDay`, so this is where
// the sink either reaches the cast or does not. Two claims, and the second is the
// load-bearing one: the day a traced dusk plays is the day an untraced dusk plays.

describe('T-140 · endDay decision tracing', () => {
  /** A DAY-phase state whose dusk will actually run the cast. */
  function duskReady(seed = 20260731): GameState {
    return startDay(createInitialState(seed)).state;
  }

  it('collects entries for the simulated captains and nobody else', () => {
    const state = duskReady();
    const entries: NpcDecisionTrace[] = [];
    const before = state.day;
    const dusk = endDay(state, { npcDecisionTrace: (entry) => entries.push(entry) });

    expect(entries.length).toBeGreaterThan(0);
    const traced = new Set(entries.map((entry) => entry.npcId));
    for (const id of traced) {
      const npc = state.npcs.find((candidate) => candidate.id === id)!;
      expect(npc, `${id} is on the roster`).toBeDefined();
      // Quest characters and the dead take no turn, so they can author no entry.
      expect(isSimulatedCaptain(npc.profileId), `${id} is simulated`).toBe(true);
      expect(npc.dead ?? false, `${id} is alive`).toBe(false);
    }
    // §3's `day` is the day the decision was MADE — the pre-dusk day, not the
    // dawn `endDay` rolls the state into.
    for (const entry of entries) expect(entry.day).toBe(before);
    expect(dusk.state.day).toBe(before + 1);
  });

  it('is inert: a traced dusk produces the same state and the same events', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const quiet = endDay(duskReady(seed));
      const loud = endDay(duskReady(seed), { npcDecisionTrace: () => {} });
      const empty = endDay(duskReady(seed), {});
      expect(JSON.stringify(loud.state)).toBe(JSON.stringify(quiet.state));
      expect(JSON.stringify(loud.events)).toBe(JSON.stringify(quiet.events));
      expect(JSON.stringify(empty.state)).toBe(JSON.stringify(quiet.state));
      expect(JSON.stringify(empty.events)).toBe(JSON.stringify(quiet.events));
    }
  });
});
