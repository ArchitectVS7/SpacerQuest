import { Readable, Writable } from 'node:stream';
import {
  DayPhase,
  SeededRng,
  createInitialState,
  endDay,
  quotePort,
  quoteShipyard,
  rollDawnHand,
  shipyardFailure,
  startDay,
  travelPreview,
  type Edition,
  type EncounterState,
  type GameState,
  type PlayerAction,
  type ShipyardActionKind,
} from '@spacerquest/engine';
import {
  DEMO_FINAL_DAY,
  NEMESIS_SYSTEM_ID,
  PURCHASABLE_PORTS,
  STAR_SYSTEMS,
  isGatedDestination,
} from '@spacerquest/content';
import { describe, expect, it } from 'vitest';
import {
  buildStateSummary,
  deserializeSession,
  handleMessage,
  legalActions,
  serializeSession,
  type LegalActions,
  type ProtocolRequest,
  type ProtocolResponse,
  type ProtocolSession,
  type StateSummary,
} from '../protocol.js';
import { makeSessionHandler, processLine, runStdioAdapter } from '../protocol-stdio.js';
import {
  REPLAY_GOLDEN_ABANDON_RESPONSES,
  REPLAY_GOLDEN_ABANDON_SESSION,
  REPLAY_GOLDEN_COMBAT_RESPONSES,
  REPLAY_GOLDEN_COMBAT_SESSION,
  REPLAY_GOLDEN_RESPONSES,
  REPLAY_GOLDEN_SESSION,
  REPLAY_LOG,
  REPLAY_LOG_ABANDON,
  REPLAY_LOG_COMBAT,
} from './fixtures/replay-golden.js';

// ---------------------------------------------------------------------------
// Narrowing helpers — keep the tests type-safe over the response union.
// ---------------------------------------------------------------------------

function expectSummary(response: ProtocolResponse): StateSummary {
  if (response.type !== 'state-summary') {
    throw new Error(`expected state-summary, got ${response.type}`);
  }
  return response.summary;
}

function expectActionResult(
  response: ProtocolResponse,
): Extract<ProtocolResponse, { type: 'action-result' }> {
  if (response.type !== 'action-result') {
    throw new Error(
      `expected action-result, got ${response.type}` +
        (response.type === 'error' ? ` (${response.code}: ${response.message})` : ''),
    );
  }
  return response;
}

/** The reason on the first ExplorationFailed event in an action-result, or null. */
function explorationFailReason(response: ProtocolResponse): string | null {
  const result = expectActionResult(response);
  for (const event of result.events) {
    if (event.type === 'ExplorationFailed') return event.reason;
  }
  return null;
}

function expectLegal(response: ProtocolResponse): LegalActions {
  if (response.type !== 'legal-actions') {
    throw new Error(`expected legal-actions, got ${response.type}`);
  }
  return response.legalActions;
}

/** Round-trip a message through JSON to prove it is wire-serializable. */
function wireRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * T-1604a F5 · EVERY action a spec can legally be filled into — the cartesian
 * product of its declared parameter domains, merged with its fixed discriminants.
 * This is the caller's side of the enumerator's contract written out in full, so a
 * test can assert the contract over all fillings rather than over one witness a
 * fixture happened to pick. `spendDie` is excluded from the product: it is a die
 * index, never a business-rule discriminant, and including it would multiply every
 * case by the hand size for no added coverage.
 */
function fillsOf(spec: LegalActions['actions'][number]): Record<string, unknown>[] {
  let fills: Record<string, unknown>[] = [
    {
      type: spec.type,
      ...(spec.action === undefined ? {} : { action: spec.action }),
      spendDie: 0,
    },
  ];
  for (const [key, param] of Object.entries(spec.params)) {
    if (key === 'spendDie') continue;
    let values: unknown[];
    if (param.kind === 'fixed') values = [param.value];
    else if (param.kind === 'int') {
      values = [];
      for (let v = param.min; v <= param.max; v += 1) values.push(v);
    } else values = [...param.choices];
    fills = fills.flatMap((base) => values.map((value) => ({ ...base, [key]: value })));
  }
  return fills;
}

/** A DAY-phase state carrying an active interceptor encounter — mirrors the
 *  engine's own combat fixture so trade/travel/shipyard get blocked. */
function fixtureEncounter(): EncounterState {
  return {
    id: 'enc-fixture',
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
}

function dayStateWithEncounter(fuel: number): GameState {
  const state = createInitialState(9);
  state.dayPhase = DayPhase.DAY;
  state.player.ship.fuel = fuel;
  state.player.dawnHand = rollDawnHand(new SeededRng(9), { handSize: 5, floor: 0, rerolls: 0 });
  state.encounter = fixtureEncounter();
  return state;
}

// ---------------------------------------------------------------------------
// Echo test: drive a FULL DAY through the pure core.
// ---------------------------------------------------------------------------

describe('protocol echo — full day', () => {
  it('drives new-game → start-day → legal-actions → apply → end-day, wire-serializable throughout', () => {
    // new-game
    const r1 = handleMessage(null, { type: 'new-game', seed: 1 });
    const session1 = r1.session;
    expect(session1).not.toBeNull();
    const summary1 = expectSummary(r1.response);
    expect(summary1.day).toBe(1);
    expect(summary1.phase).toBe(DayPhase.DAWN);
    expect(wireRoundTrip(r1.response)).toEqual(r1.response);

    // start-day → DAY phase, a full dawn hand of 5 dice
    const r2 = handleMessage(session1, { type: 'start-day' });
    const session2 = r2.session;
    const summary2 = expectSummary(r2.response);
    expect(summary2.phase).toBe(DayPhase.DAY);
    expect(summary2.diceRemaining).toHaveLength(5);
    expect(summary2.dawnHand?.dice).toHaveLength(5);
    expect(wireRoundTrip(r2.response)).toEqual(r2.response);

    // legal-actions offers meaningful choices
    const r3 = handleMessage(session2, { type: 'legal-actions' });
    const legal = expectLegal(r3.response);
    expect(legal.phase).toBe(DayPhase.DAY);
    expect(legal.actions.length).toBeGreaterThan(0);
    expect(legal.lifecycle).toContain('end-day');
    expect(wireRoundTrip(r3.response)).toEqual(r3.response);

    // apply-action #1: buy fuel, spending die 0
    const buyReq: ProtocolRequest = {
      type: 'apply-action',
      action: { type: 'Trade', action: 'buy-fuel', fuelAmount: 1, spendDie: 0 },
    };
    expect(wireRoundTrip(buyReq)).toEqual(buyReq);
    const r4 = handleMessage(session2, buyReq);
    const session4 = r4.session;
    const result4 = expectActionResult(r4.response);
    expect(result4.summary.diceRemaining).not.toContain(0);
    expect(result4.summary.diceRemaining).toHaveLength(4);
    expect(wireRoundTrip(r4.response)).toEqual(r4.response);

    // apply-action #2: travel, spending die 1 (may or may not hit an encounter)
    const r5 = handleMessage(session4, {
      type: 'apply-action',
      action: { type: 'Travel', destinationId: 2, spendDie: 1 },
    });
    const session5 = r5.session;
    expectActionResult(r5.response);

    // end-day → advances to the next DAWN
    const dayBefore = session5!.state.day;
    const r6 = handleMessage(session5, { type: 'end-day' });
    const summary6 = expectSummary(r6.response);
    expect(summary6.phase).toBe(DayPhase.DAWN);
    expect(summary6.day).toBe(dayBefore + 1);
    expect(wireRoundTrip(r6.response)).toEqual(r6.response);
  });
});

// ---------------------------------------------------------------------------
// Deterministic replay from a logged session.
// ---------------------------------------------------------------------------

function replay(log: ProtocolRequest[]): {
  session: ProtocolSession | null;
  responses: ProtocolResponse[];
} {
  let session: ProtocolSession | null = null;
  const responses: ProtocolResponse[] = [];
  for (const request of log) {
    const result = handleMessage(session, request);
    session = result.session;
    responses.push(result.response);
  }
  return { session, responses };
}

describe('protocol deterministic replay', () => {
  // The replay contract is proven against COMMITTED golden fixtures (not a second
  // live replay of the same code, which would be tautological). REPLAY_LOG +
  // REPLAY_LOG_COMBAT together exercise every PlayerAction type. A mismatch here
  // is a real determinism regression or an undeclared rebalance — regenerate the
  // golden deliberately via fixtures/gen-golden.ts.
  it('replays REPLAY_LOG to the committed golden session and responses', () => {
    const { session, responses } = replay(REPLAY_LOG);
    expect(session).not.toBeNull();
    expect(serializeSession(session!)).toBe(REPLAY_GOLDEN_SESSION);
    expect(JSON.stringify(responses)).toBe(REPLAY_GOLDEN_RESPONSES);
  });

  it('replays REPLAY_LOG_COMBAT (Combat coverage) to its committed golden', () => {
    const { session, responses } = replay(REPLAY_LOG_COMBAT);
    expect(session).not.toBeNull();
    expect(serializeSession(session!)).toBe(REPLAY_GOLDEN_COMBAT_SESSION);
    expect(JSON.stringify(responses)).toBe(REPLAY_GOLDEN_COMBAT_RESPONSES);
  });

  it('replays REPLAY_LOG_ABANDON (T-1604b hold release) to its committed golden', () => {
    const { session, responses } = replay(REPLAY_LOG_ABANDON);
    expect(session).not.toBeNull();
    expect(serializeSession(session!)).toBe(REPLAY_GOLDEN_ABANDON_SESSION);
    expect(JSON.stringify(responses)).toBe(REPLAY_GOLDEN_ABANDON_RESPONSES);
  });

  it('the golden logs cover every PlayerAction type and sub-action', () => {
    // Guards the fixture against silently losing coverage of an action shape.
    // Exhaustive BY CONSTRUCTION: each expectation table is a
    // `Record<Union, true>` validated by `satisfies`, so adding a discriminant
    // to `PlayerAction` (or a sub-action to its unions) fails `tsc` right here
    // until this guard — and therefore the fixture — is extended.
    const expectedTypes = {
      Trade: true,
      Travel: true,
      Combat: true,
      Shipyard: true,
      Storylet: true,
      Explore: true,
      VisitHangout: true,
      Reroll: true,
      Crew: true,
      Port: true,
      Wait: true,
    } satisfies Record<PlayerAction['type'], true>;
    const expectedTradeSubActions = {
      'buy-fuel': true,
      'sign-contract': true,
      haggle: true,
      'pay-debt': true,
      // T-1604b · covered by REPLAY_LOG_ABANDON (refusal + success + re-let).
      'abandon-contract': true,
    } satisfies Record<Extract<PlayerAction, { type: 'Trade' }>['action'], true>;
    const expectedShipyardKinds = {
      'buy-component-tier': true,
      repair: true,
      'buy-cargo-pods': true,
      'buy-special-equipment': true,
    } satisfies Record<ShipyardActionKind, true>;
    const expectedCombatStances = {
      run: true,
      talk: true,
      fight: true,
    } satisfies Record<Extract<PlayerAction, { type: 'Combat' }>['stance'], true>;

    const types = new Set<string>();
    const tradeSubActions = new Set<string>();
    const shipyardKinds = new Set<string>();
    const combatStances = new Set<string>();
    for (const request of [...REPLAY_LOG, ...REPLAY_LOG_COMBAT, ...REPLAY_LOG_ABANDON]) {
      if (request.type !== 'apply-action') continue;
      const action = request.action;
      types.add(action.type);
      if (action.type === 'Trade') tradeSubActions.add(action.action);
      if (action.type === 'Shipyard') shipyardKinds.add(action.action);
      if (action.type === 'Combat') combatStances.add(action.stance);
    }
    expect([...types].sort()).toEqual(Object.keys(expectedTypes).sort());
    expect([...tradeSubActions].sort()).toEqual(Object.keys(expectedTradeSubActions).sort());
    expect([...shipyardKinds].sort()).toEqual(Object.keys(expectedShipyardKinds).sort());
    expect([...combatStances].sort()).toEqual(Object.keys(expectedCombatStances).sort());
  });

  it('replay stays deterministic across independent runs', () => {
    // A lightweight determinism check (separate from the fixture assertion).
    const first = replay(REPLAY_LOG);
    const second = replay(REPLAY_LOG);
    expect(serializeSession(second.session!)).toBe(serializeSession(first.session!));
    expect(JSON.stringify(second.responses)).toBe(JSON.stringify(first.responses));
  });

  it('returns a typed error (never a throw) for an illegal action', () => {
    // Wrong-phase: apply-action while still in DAWN.
    const opened = handleMessage(null, { type: 'new-game', seed: 1 });
    const wrongPhase = handleMessage(opened.session, {
      type: 'apply-action',
      action: { type: 'Wait' },
    });
    expect(wrongPhase.response.type).toBe('error');
    if (wrongPhase.response.type === 'error') {
      expect(wrongPhase.response.code).toBe('wrong-phase');
    }

    // Encounter-blocked: a trade during an active encounter is REFUSED, but the
    // refusal is surfaced (T-1003 parity) as an action-result whose events carry
    // the typed ActionBlocked — and the block is committed to the session's
    // eventLog so the protocol's event stream matches the UI's.
    const encSession: ProtocolSession = { seed: 9, state: dayStateWithEncounter(300) };
    const spentBefore = [...(encSession.state.player.dawnHand?.spent ?? [])];
    const logLenBefore = encSession.state.eventLog.length;
    const blocked = handleMessage(encSession, {
      type: 'apply-action',
      action: { type: 'Trade', action: 'buy-fuel', fuelAmount: 1, spendDie: 0 },
    });
    const blockedResult = expectActionResult(blocked.response);
    const blockEvent = blockedResult.events.find((e) => e.type === 'ActionBlocked');
    expect(blockEvent && blockEvent.type === 'ActionBlocked' && blockEvent.actionType).toBe(
      'Trade',
    );
    expect(blockEvent && blockEvent.type === 'ActionBlocked' && blockEvent.reason).toBe(
      'active-encounter',
    );
    // Parity: the committed session now records the block in its eventLog…
    expect(blocked.session).not.toBeNull();
    expect(blocked.session!.state.eventLog.length).toBe(logLenBefore + 1);
    expect(blocked.session!.state.eventLog.some((e) => e.type === 'ActionBlocked')).toBe(true);
    // …but no die was spent (a pure log-append, no other state change).
    expect(blocked.session!.state.player.dawnHand?.spent).toEqual(spentBefore);
    expect(blockedResult.summary.diceRemaining).toEqual([0, 1, 2, 3, 4]);

    // A malformed action (missing required die) is a typed error, not a crash.
    const startDayed = handleMessage(opened.session, { type: 'start-day' });
    const malformed = handleMessage(startDayed.session, {
      type: 'apply-action',
      action: { type: 'Trade', action: 'buy-fuel', fuelAmount: 1 },
    });
    expect(malformed.response.type).toBe('error');
    if (malformed.response.type === 'error') {
      expect(malformed.response.code).toBe('apply-failed');
    }
  });

  // -------------------------------------------------------------------------
  // T-1604a · ActionBlocked PROTOCOL parity, all four reasons.
  //
  // `active-encounter` is proven through `handleMessage` directly above. The
  // other three were only ever proven as NON-ADVERTISEMENT (the enumerator
  // refuses to offer them — see the `legal-actions enumerator` describe) and as
  // engine-level emission (day.test.ts / crossing.test.ts). Nothing asserted
  // that a driver which BYPASSES the legal list — a mis-written client, a stale
  // cached action list — gets the T-1003 commit contract back rather than a bare
  // `error`. These three deliberately bypass it and assert that contract:
  //   1. the response is `action-result`, NOT `error`;
  //   2. `events` carry ActionBlocked with the exact actionType + reason;
  //   3. the block is committed to `session.state.eventLog` (exactly one entry);
  //   4. no die is spent and `dayEventCount` is unchanged (a pure log-append).
  // -------------------------------------------------------------------------

  /** A DAY-phase session with a full unspent dawn hand, ready to be refused. */
  function blockableSession(seed: number, mutate: (state: GameState) => void): ProtocolSession {
    const state = createInitialState(seed);
    state.dayPhase = DayPhase.DAY;
    state.player.dawnHand = rollDawnHand(new SeededRng(seed), {
      handSize: 5,
      floor: 0,
      rerolls: 0,
    });
    mutate(state);
    return { seed, state };
  }

  /** Apply `action` off the legal list and assert the whole T-1003 block contract. */
  function expectBlocked(
    session: ProtocolSession,
    action: PlayerAction,
    actionType: string,
    reason: string,
  ): void {
    const spentBefore = [...(session.state.player.dawnHand?.spent ?? [])];
    const logLenBefore = session.state.eventLog.length;
    const dayEventsBefore = session.state.dayEventCount;

    const blocked = handleMessage(session, { type: 'apply-action', action });

    // 1 · an action-result, never a bare `error`.
    const result = expectActionResult(blocked.response);
    // 2 · the typed event, with the exact actionType + reason.
    const event = result.events.find((e) => e.type === 'ActionBlocked');
    expect(event).toBeDefined();
    expect(event && event.type === 'ActionBlocked' && event.actionType).toBe(actionType);
    expect(event && event.type === 'ActionBlocked' && event.reason).toBe(reason);
    // 3 · committed to the session's own event log — exactly one entry.
    expect(blocked.session).not.toBeNull();
    expect(blocked.session!.state.eventLog.length).toBe(logLenBefore + 1);
    const committed = blocked.session!.state.eventLog[logLenBefore];
    expect(committed?.type).toBe('ActionBlocked');
    // 4 · pure log-append: no die spent, no day-event bump.
    expect(blocked.session!.state.player.dawnHand?.spent).toEqual(spentBefore);
    expect(result.summary.diceRemaining).toEqual([0, 1, 2, 3, 4]);
    expect(blocked.session!.state.dayEventCount).toBe(dayEventsBefore);
  }

  it('T-1604a · ActionBlocked parity — destination-locked commits, spends no die', () => {
    const session = blockableSession(11, (state) => {
      state.player.ship.fuel = state.player.ship.maxFuel;
      expect(state.flags['nemesis.crossing.unlocked']).toBeUndefined();
    });
    // A sealed Andromeda system: `legalActions` never advertises it (T-1101), and
    // a driver that sends it anyway is refused with no die spent.
    const sealed = 21;
    expect(isGatedDestination(sealed)).toBe(true);
    expectBlocked(
      session,
      { type: 'Travel', destinationId: sealed, spendDie: 0 },
      'Travel',
      'destination-locked',
    );
  });

  it('T-1604a · ActionBlocked parity — no-hangout commits, spends no die', () => {
    const session = blockableSession(12, (state) => {
      state.player.currentSystemId = 2; // Aldebaran-1 — no Spacers Hangout.
    });
    expectBlocked(
      session,
      { type: 'VisitHangout', venue: 'rumor', spendDie: 0 },
      'VisitHangout',
      'no-hangout',
    );
  });

  it('T-1604a · ActionBlocked parity — career-ended commits, spends no die', () => {
    const session = blockableSession(13, (state) => {
      // The far side of the Nemesis shear — engine `careerEnded` (nemesis.ts),
      // built exactly the way the enumerator's stop-signal test builds it.
      state.player.currentSystemId = NEMESIS_SYSTEM_ID;
      state.player.debt = 0;
    });
    // The enumerator advertises NOTHING here — this is the bypass case.
    expect(legalActions(session.state).actions).toEqual([]);
    expectBlocked(session, { type: 'Explore', spendDie: 0 }, 'Explore', 'career-ended');
  });
});

// ---------------------------------------------------------------------------
// T-1003 · Malformed Explore inputs through the UGT adapter.
//
// Three type-valid Explore inputs (no die / bad index / already-spent die) used
// to throw raw Errors and crash the adapter. They must now come back as
// action-results carrying a typed ExplorationFailed event — never `error`, never
// a throw.
// ---------------------------------------------------------------------------

describe('explore malformed inputs through the adapter', () => {
  /** A fresh session in DAY phase with a full dawn hand (seed 7). */
  function dayStartedSession(): ProtocolSession {
    const opened = handleMessage(null, { type: 'new-game', seed: 7 });
    const started = handleMessage(opened.session, { type: 'start-day' });
    if (!started.session) throw new Error('start-day produced no session');
    return started.session;
  }

  it('no die: emits ExplorationFailed(no-die) with no crash', () => {
    const session = dayStartedSession();
    let out: ReturnType<typeof handleMessage> | undefined;
    expect(() => {
      out = handleMessage(session, { type: 'apply-action', action: { type: 'Explore' } });
    }).not.toThrow();
    expect(out!.response.type).toBe('action-result');
    expect(explorationFailReason(out!.response)).toBe('no-die');
  });

  it('bad index: emits ExplorationFailed(invalid-die-index) with no crash', () => {
    const session = dayStartedSession();
    let out: ReturnType<typeof handleMessage> | undefined;
    expect(() => {
      out = handleMessage(session, {
        type: 'apply-action',
        action: { type: 'Explore', spendDie: 99 },
      });
    }).not.toThrow();
    expect(out!.response.type).toBe('action-result');
    expect(explorationFailReason(out!.response)).toBe('invalid-die-index');
  });

  it('already-spent die: emits ExplorationFailed(die-already-spent) with no crash', () => {
    // Spend die 0 first (a successful buy-fuel), then Explore on the same index.
    const session = dayStartedSession();
    const spent = handleMessage(session, {
      type: 'apply-action',
      action: { type: 'Trade', action: 'buy-fuel', fuelAmount: 1, spendDie: 0 },
    });
    expectActionResult(spent.response);
    let out: ReturnType<typeof handleMessage> | undefined;
    expect(() => {
      out = handleMessage(spent.session, {
        type: 'apply-action',
        action: { type: 'Explore', spendDie: 0 },
      });
    }).not.toThrow();
    expect(out!.response.type).toBe('action-result');
    expect(explorationFailReason(out!.response)).toBe('die-already-spent');
  });
});

// ---------------------------------------------------------------------------
// T-1003 · Session serialization resume — the deterministic-replay backbone.
// ---------------------------------------------------------------------------

describe('session serialization resume', () => {
  it('serialize → deserialize → resume continues byte-identically', () => {
    // Build a mid-DAY session with unspent dice (seed 11).
    const original = replay([
      { type: 'new-game', seed: 11 },
      { type: 'start-day' },
      {
        type: 'apply-action',
        action: { type: 'Trade', action: 'buy-fuel', fuelAmount: 1, spendDie: 0 },
      },
    ]).session;
    expect(original).not.toBeNull();

    const wire = serializeSession(original!);
    const resumed = deserializeSession(wire);
    // Immediate round-trip is byte-identical (rngState and all reconstructed).
    expect(serializeSession(resumed)).toBe(wire);

    // The SAME next request applied to both drives the seeded rng identically.
    const nextRequest: ProtocolRequest = {
      type: 'apply-action',
      action: { type: 'Explore', spendDie: 1 },
    };
    const contOriginal = handleMessage(original, nextRequest);
    const contResumed = handleMessage(resumed, nextRequest);

    expect(contOriginal.session).not.toBeNull();
    expect(contResumed.session).not.toBeNull();
    expect(serializeSession(contResumed.session!)).toBe(serializeSession(contOriginal.session!));
    // The responses (events + summary) are byte-identical too.
    expect(JSON.stringify(contResumed.response)).toBe(JSON.stringify(contOriginal.response));
  });
});

// ---------------------------------------------------------------------------
// Legal-actions correctness.
// ---------------------------------------------------------------------------

describe('legal-actions enumerator', () => {
  it('during an active encounter, blocks trade/travel/shipyard/explore but offers combat', () => {
    const legal = legalActions(dayStateWithEncounter(300));
    expect(legal.inEncounter).toBe(true);

    const types = legal.actions.map((action) => action.type);
    expect(types).toContain('Combat');
    expect(types).not.toContain('Trade');
    expect(types).not.toContain('Travel');
    expect(types).not.toContain('Shipyard');
    expect(types).not.toContain('Explore');

    // The combat spec targets the interceptor and offers stances gated by fuel.
    const combat = legal.actions.find((action) => action.type === 'Combat');
    expect(combat?.params.targetId).toEqual({ kind: 'fixed', value: 'anon-pirate-1' });
    const stance = combat?.params.stance;
    expect(stance?.kind).toBe('enum');
    if (stance?.kind === 'enum') {
      expect(stance.choices).toEqual(['talk', 'run', 'fight']);
    }
  });

  it('a dry-tank encounter offers only the no-fuel talk stance', () => {
    const legal = legalActions(dayStateWithEncounter(0));
    const combat = legal.actions.find((action) => action.type === 'Combat');
    const stance = combat?.params.stance;
    if (stance?.kind === 'enum') {
      expect(stance.choices).toEqual(['talk']);
    }
  });

  it('a dice-exhausted state offers only day-end', () => {
    const state = createInitialState(1);
    state.dayPhase = DayPhase.DAY;
    state.player.debt = 0;
    state.player.dawnHand = { dice: [10, 10, 10, 10, 10], spent: [true, true, true, true, true] };

    const legal = legalActions(state);
    expect(legal.diceRemaining).toEqual([]);
    expect(legal.actions).toEqual([]);
    expect(legal.lifecycle).toEqual(['end-day']);
  });

  // T-1505c · D8 · The headless STOP SIGNAL. On the far side of the Nemesis shear
  // the engine refuses every blockable verb with `ActionBlocked{'career-ended'}`,
  // so the protocol must advertise nothing at all — otherwise a UGT driver would
  // spin forever picking "legal" actions that are guaranteed refusals. This is the
  // named reader of engine `careerEnded`.
  it('an ended career (the far side of NEMESIS) offers nothing at all', () => {
    const state = createInitialState(1);
    state.dayPhase = DayPhase.DAY;
    state.player.currentSystemId = NEMESIS_SYSTEM_ID;
    state.player.debt = 0;
    state.player.dawnHand = {
      dice: [20, 18, 12, 9, 2],
      spent: [false, false, false, false, false],
    };

    const legal = legalActions(state);

    expect(legal.phase).toBe(DayPhase.DAY);
    expect(legal.actions).toEqual([]);
    expect(legal.canWait).toBe(false);
    expect(legal.lifecycle).toEqual([]);
    // The dice are still in the hand — the career is over, not the day.
    expect(legal.diceRemaining).toEqual([0, 1, 2, 3, 4]);
  });

  it('DAWN offers no player actions, only the start-day transition', () => {
    const state = createInitialState(1);
    const legal = legalActions(state);
    expect(legal.phase).toBe(DayPhase.DAWN);
    expect(legal.actions).toEqual([]);
    expect(legal.lifecycle).toEqual(['start-day']);
    expect(legal.canWait).toBe(false);
  });

  it('offers a bounded fuel amount and unbounded params as shapes, not enumerations', () => {
    const opened = handleMessage(null, { type: 'new-game', seed: 3 });
    const dayStarted = handleMessage(opened.session, { type: 'start-day' });
    // T-1102: a fresh ship now starts with a FULL hull-derived tank (300/300), so
    // buy-fuel is not a legal action at game start. Burn some fuel with a clean
    // jump first (seed 3, Sun-3 → Aldebaran-1 is encounter-free and clears the
    // pilot DC on die 0), leaving 240/300 so the depot has room to sell.
    const afterJump = handleMessage(dayStarted.session, {
      type: 'apply-action',
      action: { type: 'Travel', destinationId: 2, spendDie: 0 },
    });
    const legal = expectLegal(handleMessage(afterJump.session, { type: 'legal-actions' }).response);

    const buyFuel = legal.actions.find(
      (action) => action.type === 'Trade' && action.action === 'buy-fuel',
    );
    expect(buyFuel?.params.fuelAmount.kind).toBe('int');

    // Travel exposes the destination domain rather than one action per system.
    const travel = legal.actions.find((action) => action.type === 'Travel');
    expect(travel?.params.destinationId.kind).toBe('system-id');
    expect(travel?.params.spendDie.kind).toBe('die-index');

    // Shipyard's buy-special-equipment is offered as an enum domain rather than one
    // action per item — that shape is what this test is about. T-1604a F5 narrowed
    // WHICH items are in it (the purse, renown and mutual exclusion now filter the
    // enum, so a starting captain sees the three it can actually buy, not all
    // seven); the exact membership is asserted by the F5 tests below, not here.
    const buySpecial = legal.actions.find(
      (action) => action.type === 'Shipyard' && action.action === 'buy-special-equipment',
    );
    expect(buySpecial).toBeDefined();
    const equipment = buySpecial?.params.equipment;
    expect(equipment?.kind).toBe('enum');
    if (equipment?.kind === 'enum') {
      expect(equipment.choices.length).toBeGreaterThan(0);
      expect(equipment.choices).toEqual(
        equipment.choices.filter((item) =>
          [
            'CLOAKER',
            'AUTO_REPAIR',
            'STAR_BUSTER',
            'ARCH_ANGEL',
            'ASTRAXIAL_HULL',
            'TITANIUM_HULL',
            'TRANS_WARP',
          ].includes(item as string),
        ),
      );
    }
    expect(buySpecial?.params.spendDie.kind).toBe('die-index');
  });

  it('T-1101 · never advertises a sealed destination the engine gate would refuse', () => {
    const state = createInitialState(7);
    state.dayPhase = DayPhase.DAY;
    state.player.dawnHand = rollDawnHand(new SeededRng(7), { handSize: 5, floor: 0, rerolls: 0 });

    const legal = legalActions(state);
    const travel = legal.actions.find((action) => action.type === 'Travel');
    expect(travel).toBeDefined();
    const destParam = travel?.params.destinationId;
    expect(destParam?.kind).toBe('system-id');
    if (destParam?.kind === 'system-id') {
      // Gated systems (Andromeda 21–26, specials 27–28) must be absent while
      // 'nemesis.crossing.unlocked' is unset — day.ts would ActionBlock them.
      expect(destParam.choices.some((id) => isGatedDestination(id))).toBe(false);
      // The player's own system is never offered either.
      expect(destParam.choices).not.toContain(state.player.currentSystemId);
      // Ungated systems are still offered.
      expect(destParam.choices.length).toBeGreaterThan(0);
    }
  });

  it('T-1101/T-1505b · offers NEMESIS — and ONLY NEMESIS — once the crossing is unlocked', () => {
    const state = createInitialState(7);
    state.dayPhase = DayPhase.DAY;
    state.player.dawnHand = rollDawnHand(new SeededRng(7), { handSize: 5, floor: 0, rerolls: 0 });
    state.flags['nemesis.crossing.unlocked'] = true;
    // T-1604a F3 · The enumerator now filters by reachability as well as by the
    // lock, and the crossing is the longest jump on the map — a starter tank
    // cannot cover it, so this fixture would fail for a reason that has nothing
    // to do with what it asserts. Fuelled to exactly the engine's own quote for
    // the jump, so the assertion below is about the LOCK and only the lock.
    const crossingQuote = travelPreview(state, NEMESIS_SYSTEM_ID);
    state.player.ship.maxFuel = Math.max(state.player.ship.maxFuel, crossingQuote.fuelCost);
    state.player.ship.fuel = crossingQuote.fuelCost;

    const legal = legalActions(state);
    const travel = legal.actions.find((action) => action.type === 'Travel');
    const destParam = travel?.params.destinationId;
    expect(destParam?.kind).toBe('system-id');
    if (destParam?.kind === 'system-id') {
      expect(destParam.choices.some((id) => isGatedDestination(id))).toBe(true);
      // T-1505b · The lift is NEMESIS-only, mirroring the day.ts gate exactly: the
      // black hole is advertised, and Andromeda (21–26) / MALIGNA (27) are NOT —
      // they stay sealed for the expansion, and the engine would ActionBlock them,
      // so advertising one would hand a UGT client a die-burning dead end.
      expect(destParam.choices).toContain(NEMESIS_SYSTEM_ID);
      for (let id = 21; id <= 27; id += 1) {
        expect(destParam.choices, `system ${id} was advertised post-unlock`).not.toContain(id);
      }
    }
  });

  it('T-1604a F3 · never advertises a jump the tank cannot cover', () => {
    const state = createInitialState(7);
    state.dayPhase = DayPhase.DAY;
    state.player.dawnHand = rollDawnHand(new SeededRng(7), { handSize: 5, floor: 0, rerolls: 0 });
    // A part-full tank, which is where the finding actually lives: a FULL starter
    // tank reaches every ungated system on the map, so the filter is a no-op at
    // dawn on day 1 and only engages once the fuel is spent — the measured trap
    // state was 29 fuel of 300 (T-1604a §7 F2/F3).
    state.player.ship.fuel = 80;

    // Split the map at the current tank: what the quote says is affordable, and
    // what it says is not. Both halves must be non-empty or the assertion below
    // proves nothing — a filter that removed everything, or nothing, would pass a
    // one-sided check.
    const candidates = Object.keys(STAR_SYSTEMS)
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => id !== state.player.currentSystemId && !isGatedDestination(id));
    const affordable = candidates.filter((id) => travelPreview(state, id).reachable);
    const unaffordable = candidates.filter((id) => !travelPreview(state, id).reachable);
    expect(affordable.length, 'fixture: nothing was affordable').toBeGreaterThan(0);
    expect(unaffordable.length, 'fixture: everything was affordable').toBeGreaterThan(0);

    const destParam = legalActions(state).actions.find((a) => a.type === 'Travel')?.params
      .destinationId;
    expect(destParam?.kind).toBe('system-id');
    if (destParam?.kind === 'system-id') {
      for (const id of unaffordable) {
        expect(destParam.choices, `system ${id} is unaffordable but was advertised`).not.toContain(
          id,
        );
      }
      for (const id of affordable) {
        expect(destParam.choices, `system ${id} is affordable but was withheld`).toContain(id);
      }
    }
  });

  it('T-1604a F3 · every advertised destination passes the resolver’s own fuel predicate', () => {
    // The property rather than two witnesses: whatever the tank, the advertised set
    // is exactly the reachable set. This is what closes the finding class — a future
    // destination filter that forgets fuel fails here even if it picks systems this
    // fixture happens not to name.
    for (const fuel of [300, 120, 60, 20]) {
      const state = createInitialState(3);
      state.dayPhase = DayPhase.DAY;
      state.player.dawnHand = rollDawnHand(new SeededRng(3), { handSize: 5, floor: 0, rerolls: 0 });
      state.player.ship.fuel = fuel;

      const destParam = legalActions(state).actions.find((a) => a.type === 'Travel')?.params
        .destinationId;
      if (destParam?.kind === 'system-id') {
        for (const id of destParam.choices) {
          expect(
            travelPreview(state, id).reachable,
            `fuel ${fuel}: system ${id} advertised but unreachable`,
          ).toBe(true);
        }
      }
    }
  });

  it('T-1604a F3 · a dry tank is offered no Travel at all, not an unfillable one', () => {
    const state = createInitialState(7);
    state.dayPhase = DayPhase.DAY;
    state.player.dawnHand = rollDawnHand(new SeededRng(7), { handSize: 5, floor: 0, rerolls: 0 });
    state.player.ship.fuel = 0;

    const legal = legalActions(state);
    expect(legal.actions.find((a) => a.type === 'Travel')).toBeUndefined();
    // …and the captain is not stranded by the withholding: the verbs that get a
    // dry tank moving again are still on the list.
    expect(legal.canWait).toBe(true);
    expect(legal.lifecycle).toContain('end-day');
  });

  it('T-1604a F5 · every advertised Shipyard spec can be filled and will be honoured', () => {
    // The contract, stated as a property over the whole yard: take each advertised
    // spec, fill every declared domain with EVERY legal value, and the engine must
    // not typed-fail any of them. 482 of 707 shipyard applies used to fail this way.
    for (const [seed, credits] of [
      [3, 1_000],
      [3, 120],
      [3, 0],
      [11, 60_000],
    ] as const) {
      const state = createInitialState(seed);
      state.dayPhase = DayPhase.DAY;
      state.player.credits = credits;
      state.player.dawnHand = rollDawnHand(new SeededRng(seed), {
        handSize: 5,
        floor: 0,
        rerolls: 0,
      });

      const yardSpecs = legalActions(state).actions.filter((a) => a.type === 'Shipyard');
      for (const spec of yardSpecs) {
        for (const filled of fillsOf(spec)) {
          expect(
            shipyardFailure(state.player, filled as Extract<PlayerAction, { type: 'Shipyard' }>),
            `credits ${credits}: advertised ${JSON.stringify(filled)} would have failed`,
          ).toBeNull();
        }
      }
    }
  });

  it('T-1604a F5 · the yard offer narrows with the purse, and a broke captain is offered only free work', () => {
    const yardFills = (credits: number): Record<string, unknown>[] => {
      const state = createInitialState(3);
      state.dayPhase = DayPhase.DAY;
      state.player.credits = credits;
      state.player.dawnHand = rollDawnHand(new SeededRng(3), { handSize: 5, floor: 0, rerolls: 0 });
      return legalActions(state)
        .actions.filter((a) => a.type === 'Shipyard')
        .flatMap((spec) => fillsOf(spec));
    };

    // The offer is a function of the purse — it was constant before, which is the
    // whole finding.
    expect(yardFills(0).length).toBeLessThan(yardFills(1_000).length);
    expect(yardFills(1_000).length).toBeLessThan(yardFills(60_000).length);

    // R2c · THIS CLAUSE USED TO ASSERT A BUG. It previously required that SOMETHING
    // still be advertised at zero credits and that all of it be free, reasoning that
    // "the trade-in on a fresh junker's components can price a tier-1 swap at 0".
    // That was true, and it was the defect: the yard's trade-in ladder was indexed
    // by component STRENGTH rather than by owned TIER, so a fresh save could buy
    // four components up to tier 7 for nothing (see `YARD_COMPONENT_TRADE_IN` in
    // content). With the ladder corrected, every rung costs real credits and a
    // captain with an empty purse is correctly offered NOTHING.
    //
    // The property under test is unchanged and is now asserted in its stronger
    // form: the yard never advertises what the purse cannot cover — checked at
    // every purse level, not just at zero.
    const broke = createInitialState(3);
    broke.dayPhase = DayPhase.DAY;
    broke.player.credits = 0;
    broke.player.dawnHand = rollDawnHand(new SeededRng(3), { handSize: 5, floor: 0, rerolls: 0 });
    const brokeFills = legalActions(broke)
      .actions.filter((a) => a.type === 'Shipyard')
      .flatMap((spec) => fillsOf(spec));
    expect(brokeFills.length, 'a broke captain is offered no yard work at all').toBe(0);

    // ...and nothing unaffordable is ever advertised, at any purse.
    for (const credits of [1_000, 60_000]) {
      const state = createInitialState(3);
      state.dayPhase = DayPhase.DAY;
      state.player.credits = credits;
      state.player.dawnHand = rollDawnHand(new SeededRng(3), { handSize: 5, floor: 0, rerolls: 0 });
      const fills = legalActions(state)
        .actions.filter((a) => a.type === 'Shipyard')
        .flatMap((spec) => fillsOf(spec));
      expect(fills.length, `fixture: nothing advertised at ${credits}cr`).toBeGreaterThan(0);
      for (const fill of fills) {
        const quote = quoteShipyard(
          state.player,
          fill as Extract<PlayerAction, { type: 'Shipyard' }>,
        );
        expect(
          quote.cost,
          `a captain with ${credits} credits was offered ${JSON.stringify(fill)}`,
        ).toBeLessThanOrEqual(credits);
      }
    }
  });

  it('T-1604a F5 · repairMode "all" carries no component key to fill', () => {
    // The F-R2-2 defect made unrepresentable: `execute` branches on the mere
    // PRESENCE of `component`, so a repair-all spec that declared one could be
    // filled into a single-part repair by a caller doing nothing wrong.
    const state = createInitialState(3);
    state.dayPhase = DayPhase.DAY;
    state.player.dawnHand = rollDawnHand(new SeededRng(3), { handSize: 5, floor: 0, rerolls: 0 });

    const repairAll = legalActions(state).actions.find(
      (a) =>
        a.type === 'Shipyard' &&
        a.action === 'repair' &&
        a.params.repairMode?.kind === 'fixed' &&
        a.params.repairMode.value === 'all',
    );
    expect(repairAll).toBeDefined();
    expect(repairAll?.params.component).toBeUndefined();
  });

  it('T-1604a F5 · Crew/hire lists only roles the purse can cover', () => {
    const state = createInitialState(1);
    state.dayPhase = DayPhase.DAY;
    state.player.dawnHand = rollDawnHand(new SeededRng(1), { handSize: 5, floor: 0, rerolls: 0 });
    state.player.credits = 0;

    const hire = legalActions(state).actions.find((a) => a.type === 'Crew' && a.action === 'hire');
    expect(hire, 'a captain with no credits was offered a hire').toBeUndefined();

    state.player.credits = 1_000_000;
    const richHire = legalActions(state).actions.find(
      (a) => a.type === 'Crew' && a.action === 'hire',
    );
    expect(richHire, 'a captain who can afford every role was offered none').toBeDefined();
    const roleParam = richHire?.params.roleId;
    if (roleParam?.kind === 'enum') {
      expect(roleParam.choices.length).toBeGreaterThan(0);
    }
  });

  it('T-1303 · advertises VisitHangout at a Hangout system with an in-system NPC', () => {
    const state = createInitialState(1); // player at Sun-3 (hasHangout); Iron Vex co-located
    state.dayPhase = DayPhase.DAY;
    state.player.dawnHand = rollDawnHand(new SeededRng(1), { handSize: 5, floor: 0, rerolls: 0 });

    const legal = legalActions(state);
    const hangout = legal.actions.find((action) => action.type === 'VisitHangout');
    expect(hangout).toBeDefined();
    // opponentId is enumerated to the ids of NPCs actually in-system.
    const opponentParam = hangout?.params.opponentId;
    expect(opponentParam?.kind).toBe('enum');
    if (opponentParam?.kind === 'enum') {
      const inSystemIds = state.npcs
        .filter((npc) => npc.currentSystemId === state.player.currentSystemId)
        .map((npc) => npc.id);
      expect(opponentParam.choices).toEqual(inSystemIds);
      expect(opponentParam.choices).toContain('npc-iron-vex');
    }
    expect(hangout?.params.venue.kind).toBe('enum');
    expect(hangout?.params.spendDie.kind).toBe('die-index');
  });

  it('T-1303 · does NOT advertise VisitHangout at a non-Hangout system', () => {
    const state = createInitialState(1);
    state.dayPhase = DayPhase.DAY;
    state.player.currentSystemId = 2; // Aldebaran-1 — no Hangout
    state.player.dawnHand = rollDawnHand(new SeededRng(1), { handSize: 5, floor: 0, rerolls: 0 });

    const legal = legalActions(state);
    expect(legal.actions.some((action) => action.type === 'VisitHangout')).toBe(false);
  });

  it('T-1304 · advertises VisitHangout (lending/rumor) with no in-system NPC, but not the social beats', () => {
    const state = createInitialState(1); // Sun-3
    state.dayPhase = DayPhase.DAY;
    state.player.dawnHand = rollDawnHand(new SeededRng(1), { handSize: 5, floor: 0, rerolls: 0 });
    // Scatter every NPC off Sun-3 — no one to face at the tables.
    for (const npc of state.npcs) npc.currentSystemId = 5;

    const legal = legalActions(state);
    const hangout = legal.actions.find((action) => action.type === 'VisitHangout');
    // T-1304: Penny Wise is the lender-of-record (the desk), so the §7.5 loan out
    // and the rumor host slot ARE reachable with no co-located NPC — but the
    // opponent-driven beats (dare/meet/befriend/insult) are NOT offered.
    expect(hangout).toBeDefined();
    const venue = hangout?.params.venue;
    expect(venue?.kind).toBe('enum');
    if (venue?.kind === 'enum') {
      expect(venue.choices).toContain('borrow'); // no loan yet → borrow offered
      expect(venue.choices).toContain('rumor');
      expect(venue.choices).not.toContain('dare');
      expect(venue.choices).not.toContain('befriend');
    }
    // opponentId enumerates to the empty set (no one in-system).
    const opponentParam = hangout?.params.opponentId;
    if (opponentParam?.kind === 'enum') {
      expect(opponentParam.choices).toHaveLength(0);
    }
  });

  it('T-1304 · advertises repay (not borrow) while a loan is active', () => {
    const state = createInitialState(1); // Sun-3, has Hangout
    state.dayPhase = DayPhase.DAY;
    state.player.dawnHand = rollDawnHand(new SeededRng(1), { handSize: 5, floor: 0, rerolls: 0 });
    state.player.loan = {
      lender: 'npc-penny-wise',
      principal: 500,
      outstanding: 525,
      dailyRate: 0.05,
      borrowedDay: 1,
      dueDay: 16,
      status: 'active',
    };

    const legal = legalActions(state);
    const hangout = legal.actions.find((action) => action.type === 'VisitHangout');
    expect(hangout).toBeDefined();
    const venue = hangout?.params.venue;
    expect(venue?.kind).toBe('enum');
    if (venue?.kind === 'enum') {
      expect(venue.choices).toContain('repay'); // a loan is active → repay offered
      expect(venue.choices).not.toContain('borrow');
    }
  });
});

// ---------------------------------------------------------------------------
// State-summary shape.
// ---------------------------------------------------------------------------

describe('state summary', () => {
  it('is compact and fully wire-serializable', () => {
    const summary = buildStateSummary(createInitialState(1));
    expect(summary.credits).toBe(1000);
    expect(summary.debt).toBe(25000);
    expect(summary.systemName).toBe('Sun-3');
    expect(summary.encounter).toBeNull();
    expect(summary.activeContract).toBeNull();
    expect(wireRoundTrip(summary)).toEqual(summary);
  });
});

// ---------------------------------------------------------------------------
// Stdio transport shell.
// ---------------------------------------------------------------------------

describe('stdio transport', () => {
  it('processLine dispatches JSON and reports invalid JSON as a typed error', () => {
    const handler = makeSessionHandler();
    const newGame = processLine(JSON.stringify({ type: 'new-game', seed: 1 }), handler);
    expect(newGame).not.toBeNull();
    const parsed = JSON.parse(newGame!) as ProtocolResponse;
    expect(parsed.type).toBe('state-summary');

    expect(processLine('   ', handler)).toBeNull();

    const bad = processLine('{ not json', handler);
    const badParsed = JSON.parse(bad!) as ProtocolResponse;
    expect(badParsed.type).toBe('error');
  });

  it('runStdioAdapter drives a day over line-delimited JSON streams', async () => {
    const input = `${[
      JSON.stringify({ type: 'new-game', seed: 1 }),
      JSON.stringify({ type: 'start-day' }),
      JSON.stringify({ type: 'end-day' }),
      'not json',
    ].join('\n')}\n`;

    const chunks: string[] = [];
    const output = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });

    const rl = runStdioAdapter(Readable.from([input]), output);
    await new Promise<void>((resolve) => rl.on('close', () => resolve()));

    const responses = chunks
      .join('')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as ProtocolResponse);

    expect(responses).toHaveLength(4);
    expect(responses[0]?.type).toBe('state-summary');
    expect(responses[1]?.type).toBe('state-summary');
    expect(responses[2]?.type).toBe('state-summary');
    expect(responses[3]?.type).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// T-1604b · F2 — the poverty/immobility trap has an exit.
//
// The REGRESSION for the state UGT actually witnessed (docs/playtests/
// T-1604a-ugt-campaign.md §7 F2, seed 20260728): day 16 at Mira-9 (system 8, no
// Hangout), 0 credits, 29/300 fuel, and an undeliverable Pollux-7 contract
// nailing the hold shut. Left to run, that career reached day 401 still at 0
// credits in the same system, 385 days without moving.
//
// Asserted through `legalActions` — the surface a headless driver actually sees —
// because F2 is a defect of what the game OFFERS, not only of what it does.
//
// SCOPE, per the report's own split: this is the regression for the witnessed
// state. The exhaustive "no sequence escapes" INVARIANT is T-1605b's, which
// already owns the poverty-trap property test over adversarial states.
// ---------------------------------------------------------------------------

describe('T-1604b · F2 poverty/immobility trap', () => {
  const MIRA_9 = 8;
  const POLLUX_7 = 9;

  /** The audited trap, rebuilt field for field. */
  function trapState(seed = 20260728): GameState {
    const state = startDay(createInitialState(seed)).state;
    state.day = 16;
    state.player.currentSystemId = MIRA_9;
    state.player.credits = 0;
    state.player.ship.fuel = 29;
    state.player.ship.maxFuel = 300;
    state.player.activeContract = {
      destination: POLLUX_7,
      cargoType: 3,
      payment: 2200,
      pods: 10,
    };
    return state;
  }

  function hasTrade(legal: LegalActions, action: string): boolean {
    return legal.actions.some((spec) => spec.type === 'Trade' && spec.action === action);
  }

  it('the trap is real: at dawn with a full hand, no income verb is advertised', () => {
    const legal = legalActions(trapState());
    expect(legal.diceRemaining).toEqual([0, 1, 2, 3, 4]);

    // The three income routes, each shut for its own reason:
    expect(hasTrade(legal, 'buy-fuel')).toBe(false); // floor(0 / price) === 0
    expect(hasTrade(legal, 'sign-contract')).toBe(false); // the hold is full
    expect(legal.actions.some((s) => s.type === 'VisitHangout')).toBe(false); // Mira-9 has no desk
    expect(hasTrade(legal, 'pay-debt')).toBe(false); // nothing to pay with
  });

  it('the ESCAPE HATCH is advertised: abandon-contract, and it re-opens signing', () => {
    // RED before T-1604b — `abandon-contract` did not exist on this line at all,
    // so this state had no advertised way to free the hold.
    const trap = trapState();
    const legal = legalActions(trap);
    expect(hasTrade(legal, 'abandon-contract')).toBe(true);

    const session: ProtocolSession = { seed: 20260728, state: trap };
    const dumped = handleMessage(session, {
      type: 'apply-action',
      action: { type: 'Trade', action: 'abandon-contract', spendDie: 0 },
    });
    const result = expectActionResult(dumped.response);
    expect(
      result.events.some(
        (e) => e.type === 'TradeEvent' && e.action === 'abandon-contract' && e.success === true,
      ),
    ).toBe(true);
    expect(dumped.session!.state.player.activeContract).toBeNull();

    // The point of the verb: the board is available again.
    const after = legalActions(dumped.session!.state);
    expect(hasTrade(after, 'sign-contract')).toBe(true);
    expect(hasTrade(after, 'abandon-contract')).toBe(false); // nothing left to dump
  });

  it('the world provides a floor: dusks restore an income verb within days, not never', () => {
    // RED before T-1604b — the purse stayed at exactly 0 through every dusk, so
    // `buy-fuel` was never advertised again and the ship never moved.
    let state = trapState();
    let buyFuelDay: number | null = null;

    for (let i = 0; i < 5; i += 1) {
      state = endDay(state).state;
      state = startDay(state).state;
      // The floor holds at EVERY dawn, not just eventually.
      expect(state.player.credits).toBeGreaterThan(0);
      if (buyFuelDay === null && hasTrade(legalActions(state), 'buy-fuel')) {
        buyFuelDay = state.day;
      }
    }

    expect(buyFuelDay).not.toBeNull();
    // A handful of days, not the 385 the campaign measured.
    expect(buyFuelDay! - 16).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// T-1703 · The demo gate, as the HEADLESS side sees it.
//
// Two claims, and they are different claims: (1) `legalActions` never advertises
// a verb the engine will refuse — the T-1101 law, which is what keeps a UGT
// driver from stalling on a guaranteed wall; and (2) a concluded demo returns the
// protocol's stop signal FROM DAWN, which is the thing the placement of the check
// above the phase branch exists to guarantee.
// ---------------------------------------------------------------------------

describe('T-1703 · demo gate — legal-actions and the summary', () => {
  /** A DAY-phase state at Sun-3 (a purchasable port with a Hangout) with money in
   *  hand, so both gated verbs WOULD be advertised on a full career. */
  function richDayState(edition: 'full' | 'demo', seed = 1703): GameState {
    const state = startDay(createInitialState(seed, edition)).state;
    state.player.credits = 200_000;
    return state;
  }

  function hasPortBuy(legal: LegalActions): boolean {
    return legal.actions.some((s) => s.type === 'Port' && s.action === 'buy');
  }
  function hasCrew(legal: LegalActions, action: string): boolean {
    return legal.actions.some((s) => s.type === 'Crew' && s.action === action);
  }

  it('a FULL career IS offered both gated verbs (the control)', () => {
    // Without this the demo assertions below prove nothing — an enumerator that
    // offered neither verb to anyone would pass them.
    const legal = legalActions(richDayState('full'));
    expect(hasPortBuy(legal)).toBe(true);
    expect(hasCrew(legal, 'hire')).toBe(true);
  });

  it('a DEMO career is offered neither, but keeps everything else', () => {
    const legal = legalActions(richDayState('demo'));
    expect(hasPortBuy(legal)).toBe(false);
    expect(hasCrew(legal, 'hire')).toBe(false);
    // The demo is a full Tour One, not a crippled one: trade, travel, explore and
    // the Hangout are all still on the table.
    const types = legal.actions.map((s) => s.type);
    expect(types).toContain('Trade');
    expect(types).toContain('Travel');
    expect(types).toContain('VisitHangout');
    expect(legal.canWait).toBe(true);
    expect(legal.lifecycle).toEqual(['end-day']);
  });

  it('a DEMO career carrying crew is still offered the DISMISS', () => {
    const state = richDayState('demo', 1704);
    state.player.crew = [{ roleId: 'crew-quartermaster', hiredDay: 1 }];
    const legal = legalActions(state);
    expect(hasCrew(legal, 'hire')).toBe(false);
    expect(hasCrew(legal, 'dismiss')).toBe(true);
  });

  it('a CONCLUDED demo returns the stop signal FROM DAWN', () => {
    // THE PLACEMENT TEST. A demo ends at a DAY BOUNDARY, so the state a driver
    // holds is DAWN — and the phase branch (which sits BELOW the demo check) would
    // otherwise advertise `start-day` forever, spinning a headless driver through
    // day 34, 35, 36… of a career whose every verb is refused. Unlike the T-1505c
    // terminus, which is only ever observed mid-DAY.
    const state = createInitialState(1705, 'demo');
    state.day = 34;
    expect(state.dayPhase).toBe(DayPhase.DAWN);

    const legal = legalActions(state);
    expect(legal.actions).toEqual([]);
    expect(legal.canWait).toBe(false);
    expect(legal.lifecycle).toEqual([]);
  });

  it('a concluded demo is silent in the DAY phase too', () => {
    const state = startDay(createInitialState(1706, 'demo')).state;
    state.day = 34;
    const legal = legalActions(state);
    expect(legal.actions).toEqual([]);
    expect(legal.canWait).toBe(false);
    expect(legal.lifecycle).toEqual([]);
  });

  it('a FULL career at day 34 keeps playing (the control)', () => {
    const state = createInitialState(1707);
    state.day = 34;
    expect(legalActions(state).lifecycle).toEqual(['start-day']);
  });

  it('the summary reports the edition and the countdown, and stays wire-safe', () => {
    const full = buildStateSummary(createInitialState(1708));
    expect(full.edition).toBe('full');
    expect(full.demoDaysRemaining).toBeNull();

    const demoState = createInitialState(1709, 'demo');
    demoState.day = 31;
    const demo = buildStateSummary(demoState);
    expect(demo.edition).toBe('demo');
    expect(demo.demoDaysRemaining).toBe(3);
    expect(wireRoundTrip(demo)).toEqual(demo);
  });

  it('the summary publishes every port stake still for sale, priced (T-1604a F10)', () => {
    // Before this field the wire said only which stakes you ALREADY OWN, so a
    // headless client could not learn that the property tier exists, where a
    // stake is sold, or what one costs — `Port/buy` is advertised only once you
    // are already standing in a purchasable system with the price covered. A UGT
    // ladder ran 600 in-game days, peaked at 12,680cr against a 7,150cr cheapest
    // stake, and never once coincided with a port it could buy.
    const summary = buildStateSummary(createInitialState(1711));

    // every core port is on offer at the start of a career, none owned yet
    expect(summary.ports).toEqual([]);
    expect(summary.portOffers).toHaveLength(PURCHASABLE_PORTS.length);

    // the offer carries the price the purchase gate will actually charge
    const cheapest = [...summary.portOffers].sort((a, b) => a.price - b.price)[0];
    expect(cheapest.price).toBe(Math.min(...PURCHASABLE_PORTS.map((port) => port.purchasePrice)));
    const def = PURCHASABLE_PORTS.find((port) => port.systemId === cheapest.systemId);
    expect(def).toBeDefined();
    expect(cheapest.price).toBe(def?.purchasePrice);
    // and it is the SAME number the engine's own purchase quote charges, so the
    // published ledger cannot drift from the gate that spends the credits
    const atPort = createInitialState(1711);
    atPort.player.currentSystemId = cheapest.systemId;
    expect(quotePort(atPort, cheapest.systemId).cost).toBe(cheapest.price);

    // a stake you own leaves the offer list and appears in `ports`
    const owned = createInitialState(1712);
    owned.player.credits = 100_000;
    owned.player.currentSystemId = cheapest.systemId;
    owned.player.ports.push({ systemId: cheapest.systemId, purchaseDay: owned.day });
    const after = buildStateSummary(owned);
    expect(after.ports).toContain(cheapest.systemId);
    expect(after.portOffers.map((offer) => offer.systemId)).not.toContain(cheapest.systemId);
    expect(after.portOffers).toHaveLength(PURCHASABLE_PORTS.length - 1);

    expect(wireRoundTrip(after)).toEqual(after);
  });

  it('an apply-action a demo driver forces anyway comes back as a typed refusal', () => {
    // The harness should never reach here (nothing above advertises it), but the
    // protocol's contract is that a refusal is an `action-result` carrying a typed
    // `ActionBlocked` — never an error code, and never a throw.
    const state = richDayState('demo', 1710);
    const { response } = handleMessage(
      { seed: 1710, state },
      { type: 'apply-action', action: { type: 'Port', action: 'buy', systemId: 1, spendDie: 0 } },
    );
    const result = expectActionResult(response);
    expect(result.events).toContainEqual({
      type: 'ActionBlocked',
      day: state.day,
      actionType: 'Port',
      reason: 'demo-locked',
    });
    expect(result.summary.edition).toBe('demo');
  });
});

describe('T-1703 · starting a demo career over the wire', () => {
  // Every fixture in the describe above reaches for `createInitialState(seed,
  // edition)` directly, because until now that was the ONLY way in: `new-game`
  // passed the seed and nothing else, so a protocol client — the harness that
  // would regression-test the shipped demo build — could not open a demo session
  // at all. These drive `handleMessage` and nothing else.

  it('new-game accepts an edition and stamps it on the career', () => {
    const { session, response } = handleMessage(null, {
      type: 'new-game',
      seed: 1711,
      edition: 'demo',
    });
    const summary = expectSummary(response);
    expect(summary.edition).toBe('demo');
    expect(summary.demoDaysRemaining).toBe(DEMO_FINAL_DAY);
    expect(session?.state.edition).toBe('demo');
    expect(wireRoundTrip(response)).toEqual(response);
  });

  it('an omitted edition is still a full career — every existing caller unchanged', () => {
    const summary = expectSummary(handleMessage(null, { type: 'new-game', seed: 1711 }).response);
    expect(summary.edition).toBe('full');
    expect(summary.demoDaysRemaining).toBeNull();
  });

  it('reset carries the edition too, so an episode loop can re-open a demo', () => {
    const opened = handleMessage(null, { type: 'new-game', seed: 1712, edition: 'demo' });
    const reset = handleMessage(opened.session, { type: 'reset', seed: 1713, edition: 'demo' });
    expect(expectSummary(reset.response).edition).toBe('demo');
    // …and a reset without one goes back to full rather than inheriting silently:
    // the request says what it wants, and nothing is carried over from the session
    // it replaced.
    const full = handleMessage(reset.session, { type: 'reset', seed: 1714 });
    expect(expectSummary(full.response).edition).toBe('full');
  });

  it('an unknown edition is refused, not quietly downgraded to full', () => {
    const { response } = handleMessage(null, {
      type: 'new-game',
      seed: 1715,
      edition: 'deluxe' as Edition,
    });
    expect(response.type).toBe('error');
    if (response.type === 'error') {
      expect(response.message).toContain('deluxe');
    }
  });

  it('the whole demo licence is now reachable from the wire alone', () => {
    // The point of the change, end to end: open a demo, and the gated verbs are
    // absent and the countdown is live — all of it observed through protocol
    // responses, with no direct engine call anywhere in the test.
    let session = handleMessage(null, { type: 'new-game', seed: 1703, edition: 'demo' }).session;
    session = handleMessage(session, { type: 'start-day' }).session;
    const legal = expectLegal(handleMessage(session, { type: 'legal-actions' }).response);
    expect(legal.actions.some((s) => s.type === 'Port')).toBe(false);
    expect(legal.actions.some((s) => s.type === 'Crew' && s.action === 'hire')).toBe(false);
    expect(legal.actions.length).toBeGreaterThan(0);

    const summary = expectSummary(handleMessage(session, { type: 'state-summary' }).response);
    expect(summary.demoDaysRemaining).toBeGreaterThan(0);
  });
});
