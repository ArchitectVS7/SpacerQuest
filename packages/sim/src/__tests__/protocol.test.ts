import { Readable, Writable } from 'node:stream';
import {
  DayPhase,
  SeededRng,
  createInitialState,
  rollDawnHand,
  type EncounterState,
  type GameState,
  type PlayerAction,
  type ShipyardActionKind,
} from '@spacerquest/engine';
import { isGatedDestination } from '@spacerquest/content';
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
  REPLAY_GOLDEN_COMBAT_RESPONSES,
  REPLAY_GOLDEN_COMBAT_SESSION,
  REPLAY_GOLDEN_RESPONSES,
  REPLAY_GOLDEN_SESSION,
  REPLAY_LOG,
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

  it('the two golden logs cover every PlayerAction type and sub-action', () => {
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
    for (const request of [...REPLAY_LOG, ...REPLAY_LOG_COMBAT]) {
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

    // Shipyard's buy-special-equipment is offered with its full 7-value domain.
    const buySpecial = legal.actions.find(
      (action) => action.type === 'Shipyard' && action.action === 'buy-special-equipment',
    );
    expect(buySpecial).toBeDefined();
    const equipment = buySpecial?.params.equipment;
    expect(equipment?.kind).toBe('enum');
    if (equipment?.kind === 'enum') {
      expect(equipment.choices).toEqual([
        'CLOAKER',
        'AUTO_REPAIR',
        'STAR_BUSTER',
        'ARCH_ANGEL',
        'ASTRAXIAL_HULL',
        'TITANIUM_HULL',
        'TRANS_WARP',
      ]);
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

  it('T-1101 · offers gated destinations once the Nemesis crossing is unlocked', () => {
    const state = createInitialState(7);
    state.dayPhase = DayPhase.DAY;
    state.player.dawnHand = rollDawnHand(new SeededRng(7), { handSize: 5, floor: 0, rerolls: 0 });
    state.flags['nemesis.crossing.unlocked'] = true;

    const legal = legalActions(state);
    const travel = legal.actions.find((action) => action.type === 'Travel');
    const destParam = travel?.params.destinationId;
    if (destParam?.kind === 'system-id') {
      expect(destParam.choices.some((id) => isGatedDestination(id))).toBe(true);
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
