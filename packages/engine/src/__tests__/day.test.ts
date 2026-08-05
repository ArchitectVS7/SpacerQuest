import { describe, it, expect } from 'vitest';
import {
  NEMESIS_SYSTEM_ID,
  QUEST_PROFILES,
  STAR_SYSTEMS,
  isGatedDestination,
  isSimulatedCaptain,
} from '@spacerquest/content';
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
      { type: 'Trade', action: 'buy-fuel', fuelAmount: 12 },
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

// ---------------------------------------------------------------------------
// T-208 · QUEST CAPTAINS ARE STATIONARY — the machine check, not the claim.
// ---------------------------------------------------------------------------
//
// The eleven `QUEST_PROFILES` records never move, and T-208 established that they
// never did: the only two writers of `NpcState.currentSystemId` in the repo
// (`npc.ts`'s `executeTrade` and `executeTravel`) are reachable only through
// `resolveNpcDay`, whose one production caller is `day.ts`'s dusk loop, which is
// gated by `if (!isSimulatedCaptain(npc.profileId)) continue`.
//
// That chain is three links long and a future refactor could break any of them
// silently, which is what this block exists to stop. It asserts the GUARANTEE
// (nobody moved over a long career) and the STRUCTURE that produces it (a quest
// captain is never simulated and authors no dusk decision), so a refactor that
// re-derived the gate differently reddens here rather than shipping a wandering
// captain nobody noticed.

describe('T-208 · quest captains are stationary', () => {
  const QUEST_IDS = QUEST_PROFILES.map((p) => p.id);

  /** `{ profileId -> currentSystemId }` for the eleven, in roster order. */
  function questPositions(state: GameState): Record<string, number> {
    const out: Record<string, number> = {};
    for (const npc of state.npcs) {
      if (QUEST_IDS.includes(npc.profileId)) out[npc.profileId] = npc.currentSystemId;
    }
    return out;
  }

  function simulatedPositions(state: GameState): Record<string, number> {
    const out: Record<string, number> = {};
    for (const npc of state.npcs) {
      if (isSimulatedCaptain(npc.profileId)) out[npc.profileId] = npc.currentSystemId;
    }
    return out;
  }

  it('none of the eleven moves across a 40-day career, on several seeds', () => {
    // SEVERAL SEEDS, because one lucky stream is not evidence: a dusk that simply
    // happened to roll every captain into a Patrol would pass a single-seed test
    // while a real drift bug sat underneath it.
    for (const seed of [11, 2026, 777, 90210]) {
      let state = createInitialState(seed);
      const day1 = questPositions(state);
      expect(Object.keys(day1)).toHaveLength(QUEST_IDS.length);
      const simDay1 = simulatedPositions(state);

      for (let day = 0; day < 40; day += 1) {
        state = startDay(state).state;
        state = endDay(state).state;
      }
      expect(state.day).toBe(41);

      // The guarantee: byte-identical, not merely "still a core port".
      expect(questPositions(state), `seed ${seed}: quest captains moved`).toEqual(day1);

      // THE ANTI-VACUITY CHECK. Without it, a bug that froze the WHOLE roster —
      // a dusk loop that stopped running at all — would pass the assertion above
      // silently. At least one SIMULATED captain must have relocated over 40 days
      // for the stillness of the eleven to mean anything.
      const simEnd = simulatedPositions(state);
      const movers = Object.keys(simDay1).filter((id) => simDay1[id] !== simEnd[id]);
      expect(
        movers.length,
        `seed ${seed}: no simulated captain moved — dusk is inert`,
      ).toBeGreaterThan(0);
    }
  });

  it('is structural: no quest captain is simulated, and none authors a dusk decision', () => {
    // The T-140 trace sink is a free, precise probe that a captain took no turn:
    // an entry exists if and only if `resolveNpcDay` ran for that record.
    const entries: NpcDecisionTrace[] = [];
    let state = startDay(createInitialState(5150)).state;
    for (let day = 0; day < 15; day += 1) {
      state = endDay(state, { npcDecisionTrace: (entry) => entries.push(entry) }).state;
      state = startDay(state).state;
    }
    expect(entries.length).toBeGreaterThan(0);

    const tracedProfileIds = new Set(
      entries.map((entry) => state.npcs.find((n) => n.id === entry.npcId)!.profileId),
    );
    for (const id of QUEST_IDS) {
      expect(isSimulatedCaptain(id), `${id} must not be simulated`).toBe(false);
      expect(tracedProfileIds.has(id), `${id} authored a dusk decision`).toBe(false);
    }
  });

  it('all eleven sit at a CORE PORT WITH A CANTINA from the day they are born', () => {
    // The placement half of T-208. Content owns the values (`homePortSystemId`) and
    // `castValidation.ts` proves them well-formed at import; this asserts the ENGINE
    // actually reads them at birth rather than falling back to the `% 20` spread.
    const state = createInitialState(4);
    for (const profile of QUEST_PROFILES) {
      const npc = state.npcs.find((n) => n.profileId === profile.id)!;
      expect(npc.currentSystemId, `${profile.id} is at its declared home port`).toBe(
        profile.homePortSystemId,
      );
      expect(STAR_SYSTEMS[npc.currentSystemId]?.hasHangout, `${profile.id} has a bar`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// T-196a · THE FREE ACTIONS AND THE DAY LOOP'S BOOKKEEPING
// ---------------------------------------------------------------------------

/**
 * M17 (`docs/DAWN-HAND-REDESIGN.md` §3) freed nine administrative action types
 * from the dawn hand. The rule change lives in the four resolvers; THIS block owns
 * the acceptance criterion that is about `day.ts` rather than about any one of
 * them — that `applyPlayerAction`'s per-day bookkeeping stays correct for a day
 * that takes ZERO of them, and for a day that takes MANY (more than the hand
 * holds), and that a player whose hand is completely spent on Main Actions can
 * still run the whole administrative desk.
 *
 * Everything here goes through `applyPlayerAction` — the seam a player presses —
 * never through a resolver directly and never by poking `dawnHand`.
 */
describe('T-196a · Free Actions through the day loop', () => {
  const SUN3 = 1;

  /** A DAY-phase state at the start port with money, berths and a damaged part —
   *  everything the five freed desks need in order to actually resolve. */
  function equippedDay(seed = 7): GameState {
    const state = createInitialState(seed);
    state.player.credits = 500_000;
    state.player.ship.cabin.strength = 30; // berths for a hire
    state.player.ship.weapons = { strength: 5, condition: 4 }; // something to repair
    const day = startDay(state).state;
    expect(day.player.currentSystemId).toBe(SUN3);
    expect(day.market.manifestBoard.length).toBeGreaterThan(0);
    return day;
  }

  /**
   * Put the hand in the EXHAUSTED state this block's premise needs, and advance
   * `dayEventCount` by one per die exactly as the old burner did.
   *
   * T-197 · `VisitHangout{'rumor'}` used to be the read-only die burner; T-197
   * freed all seven Hangout venues (docs/DAWN-HAND-REDESIGN.md §3), so no
   * read-only action spends a die any more and none is left to burn with. The two
   * jobs are now done separately and honestly: the rumor calls are KEPT (they
   * still emit exactly one event each, so `dayEventCount` advances identically and
   * this block's counter assertion still means what it meant), and the dice are
   * marked spent directly — a FIXTURE, since "an exhausted hand" is a STATE and
   * what this block actually tests is that the Free Actions ignore it.
   */
  function spendWholeHand(state: GameState): GameState {
    let live = state;
    for (let i = 0; i < live.player.dawnHand!.dice.length; i += 1) {
      live = applyPlayerAction(live, { type: 'VisitHangout', venue: 'rumor' }).state;
    }
    live.player.dawnHand!.spent = live.player.dawnHand!.spent.map(() => true);
    expect(live.player.dawnHand!.spent.every(Boolean)).toBe(true);
    return live;
  }

  it('an EMPTY dawn hand still signs, fuels, repairs, hires and buys a port', () => {
    // The headline acceptance criterion, asserted rather than claimed: five dice
    // spent on Main Actions, then the whole administrative desk, in one day.
    let live = spendWholeHand(equippedDay());
    const handAfterBurn = [...live.player.dawnHand!.spent];

    const steps: { action: PlayerAction; expect: (events: unknown[]) => void }[] = [
      {
        action: { type: 'Trade', action: 'sign-contract', contractIndex: 0 },
        expect: (events) =>
          expect(
            events.some(
              (e) =>
                (e as { type: string; action?: string; success?: boolean }).type === 'TradeEvent' &&
                (e as { action?: string }).action === 'sign-contract' &&
                (e as { success?: boolean }).success === true,
            ),
          ).toBe(true),
      },
      {
        action: { type: 'Trade', action: 'buy-fuel', fuelAmount: 1 },
        expect: (events) =>
          expect(
            events.some(
              (e) =>
                (e as { type: string }).type === 'TradeEvent' &&
                (e as { action?: string }).action === 'buy-fuel' &&
                (e as { success?: boolean }).success === true,
            ),
          ).toBe(true),
      },
      {
        action: { type: 'Shipyard', action: 'repair', repairMode: 'all' },
        expect: (events) =>
          expect(events.some((e) => (e as { type: string }).type === 'ShipyardEvent')).toBe(true),
      },
      {
        action: { type: 'Crew', action: 'hire', roleId: 'crew-second' },
        expect: (events) =>
          expect(
            events.some(
              (e) =>
                (e as { type: string }).type === 'CrewEvent' &&
                (e as { kind?: string }).kind === 'hired',
            ),
          ).toBe(true),
      },
      {
        action: { type: 'Port', action: 'buy', systemId: SUN3 },
        expect: (events) =>
          expect(
            events.some(
              (e) =>
                (e as { type: string }).type === 'PortEvent' &&
                (e as { kind?: string }).kind === 'purchased',
            ),
          ).toBe(true),
      },
    ];

    for (const step of steps) {
      const result = applyPlayerAction(live, step.action);
      step.expect(result.events);
      // Nothing consumed AND nothing un-consumed: the exhausted hand is returned
      // byte-identical by every one of the five.
      expect(result.state.player.dawnHand!.spent, `${step.action.type} touched the hand`).toEqual(
        handAfterBurn,
      );
      live = result.state;
    }

    // …and the day's real effects all landed.
    expect(live.player.activeContract).not.toBeNull();
    expect(live.player.crew).toHaveLength(1);
    expect(live.player.ports).toHaveLength(1);
    expect(live.player.ship.weapons.condition).toBeGreaterThan(4);
  });

  it('a day that takes NONE of them leaves the hand and the counters exactly as before', () => {
    const day = equippedDay();
    const before = {
      spent: [...day.player.dawnHand!.spent],
      dayEventCount: day.dayEventCount,
      day: day.day,
    };
    // A day of pure Main Actions, then dusk.
    const burned = spendWholeHand(day);
    const dusk = endDay(burned);

    expect(before.spent.every((s) => !s)).toBe(true); // premise: started clean
    expect(burned.dayEventCount).toBe(before.dayEventCount + 5); // one event per rumor visit
    expect(dusk.state.day).toBe(before.day + 1);
    expect(dusk.state.dayPhase).toBe(DayPhase.DAWN);
    expect(dusk.state.dayEventCount).toBe(0);
  });

  it('MANY in sequence — more free actions than the hand holds — all resolve', () => {
    let live = equippedDay();
    const handBefore = [...live.player.dawnHand!.spent];
    const before = live.dayEventCount;

    // Eight free actions, against a five-die hand.
    const script: PlayerAction[] = [
      { type: 'Trade', action: 'buy-fuel', fuelAmount: 1 },
      { type: 'Trade', action: 'sign-contract', contractIndex: 0 },
      { type: 'Trade', action: 'abandon-contract' },
      { type: 'Trade', action: 'sign-contract', contractIndex: 0 },
      { type: 'Shipyard', action: 'repair', repairMode: 'all' },
      { type: 'Shipyard', action: 'buy-component-tier', component: 'weapons', tier: 6 },
      { type: 'Crew', action: 'hire', roleId: 'crew-second' },
      { type: 'Port', action: 'buy', systemId: SUN3 },
    ];

    let emitted = 0;
    for (const action of script) {
      const result = applyPlayerAction(live, action);
      expect(result.events.length, `${action.type} emitted nothing`).toBeGreaterThan(0);
      emitted += result.events.length;
      live = result.state;
    }

    // The hand never moved across eight actions…
    expect(live.player.dawnHand!.spent).toEqual(handBefore);
    // …and `dayEventCount` advanced once per emitted event, which is the number
    // `day.ts` forks the action rng on.
    expect(live.dayEventCount).toBe(before + emitted);
    expect(live.player.activeContract).not.toBeNull();
    expect(live.player.crew).toHaveLength(1);
    expect(live.player.ports).toHaveLength(1);

    // Same-seed determinism: replay the identical script and compare the SAVE.
    let replay = equippedDay();
    for (const action of script) replay = applyPlayerAction(replay, action).state;
    expect(serializeState(replay)).toBe(serializeState(live));
  });

  it('Trade · haggle STILL costs its die — the control that proves the cut was surgical', () => {
    const day = equippedDay();
    const result = applyPlayerAction(day, {
      type: 'Trade',
      action: 'haggle',
      contractIndex: 0,
      spendDie: 0,
    });
    expect(result.state.player.dawnHand!.spent[0]).toBe(true);
    expect(result.events.some((e) => e.type === 'StatCheck')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-197 · BOTH DAILY HANGOUT CAPS RESET AT DAWN, THROUGH THE EXISTING CHOKEPOINT
// (`docs/DAWN-HAND-REDESIGN.md` §4a/§4b)
//
// The caps are what replaced the Hangout's die, so a cap that failed to roll over
// would silently end the Hangout for the rest of the career — the single worst
// failure mode this task can have, and the reason it gets its own block beside the
// day loop rather than riding the resolver's suite.
// ---------------------------------------------------------------------------
describe('T-197 · both Hangout caps reset at dawn', () => {
  it('a spent-out pool and a used-up round allowance are both full again next dawn', () => {
    const day = startDay(createInitialState(1)).state;
    const perDay = day.player.socialPlaysRemaining;
    expect(perDay).toBeGreaterThan(0); // NON-VACUITY: a zero pool resets trivially

    // Spend the day out on both axes.
    day.player.socialPlaysRemaining = 0;
    day.player.dareRoundsToday = 3;

    const dusk = endDay(day);
    expect(dusk.state.dayPhase).toBe(DayPhase.DAWN);
    expect(dusk.state.player.socialPlaysRemaining).toBe(perDay);
    expect(dusk.state.player.dareRoundsToday).toBe(0);
  });

  it('the reset is the NEXT-DAY-PREP chokepoint’s — `startDay` must not have a second one', () => {
    // ONE write site. If `startDay` acquired a matching reset, a mid-day reload
    // (which re-enters dawn) would refill an allowance the player already spent,
    // and the caps would be advisory. Driven by observation, not by grep: spend the
    // pool AT DAWN, run `startDay`, and require the spend to SURVIVE it.
    const dawn = createInitialState(1);
    dawn.player.socialPlaysRemaining = 0;
    dawn.player.dareRoundsToday = 2;

    const started = startDay(dawn).state;
    expect(started.player.socialPlaysRemaining, 'startDay refilled the social pool').toBe(0);
    expect(started.player.dareRoundsToday, 'startDay cleared the rounds counter').toBe(2);
  });

  it('nothing carries over — an UNSPENT pool does not bank into tomorrow', () => {
    // §4a: both values are absolute, not deltas. A pool that accumulated would let
    // a captain save up a week of grudges and spend them in one afternoon.
    const day = startDay(createInitialState(1)).state;
    const perDay = day.player.socialPlaysRemaining;
    const dusk = endDay(day); // a day on which NOTHING was spent
    expect(dusk.state.player.socialPlaysRemaining).toBe(perDay);
  });
});
