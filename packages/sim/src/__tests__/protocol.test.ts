import { Readable, Writable } from 'node:stream';
import {
  DayPhase,
  SeededRng,
  createInitialState,
  rollDawnHand,
  type EncounterState,
  type GameState,
} from '@spacerquest/engine';
import { describe, expect, it } from 'vitest';
import {
  buildStateSummary,
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

// ---------------------------------------------------------------------------
// Narrowing helpers — keep the tests type-safe over the response union.
// ---------------------------------------------------------------------------

function expectSummary(response: ProtocolResponse): StateSummary {
  if (response.type !== 'state-summary') {
    throw new Error(`expected state-summary, got ${response.type}`);
  }
  return response.summary;
}

function expectActionResult(response: ProtocolResponse): { summary: StateSummary } {
  if (response.type !== 'action-result') {
    throw new Error(`expected action-result, got ${response.type}`);
  }
  return response;
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
  state.player.dawnHand = rollDawnHand(new SeededRng(9), 5);
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

const REPLAY_LOG: ProtocolRequest[] = [
  { type: 'new-game', seed: 5 },
  { type: 'start-day' },
  {
    type: 'apply-action',
    action: { type: 'Trade', action: 'buy-fuel', fuelAmount: 2, spendDie: 0 },
  },
  { type: 'apply-action', action: { type: 'Travel', destinationId: 2, spendDie: 1 } },
  { type: 'end-day' },
  { type: 'start-day' },
  { type: 'apply-action', action: { type: 'Wait' } },
  { type: 'end-day' },
];

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
  it('replays a logged session byte-identically from a fresh session', () => {
    const first = replay(REPLAY_LOG);
    const second = replay(REPLAY_LOG);

    expect(first.session).not.toBeNull();
    expect(second.session).not.toBeNull();
    // The whole serialized session is byte-identical across independent replays.
    expect(serializeSession(second.session!)).toBe(serializeSession(first.session!));
    // Every response — including the final state-summary — is byte-identical.
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

    // Encounter-blocked: a trade during an active encounter is refused, session
    // is left untouched (no commit).
    const encSession: ProtocolSession = { seed: 9, state: dayStateWithEncounter(300) };
    const blocked = handleMessage(encSession, {
      type: 'apply-action',
      action: { type: 'Trade', action: 'buy-fuel', fuelAmount: 1, spendDie: 0 },
    });
    expect(blocked.response.type).toBe('error');
    if (blocked.response.type === 'error') {
      expect(blocked.response.code).toBe('action-blocked');
    }
    expect(blocked.session).toBe(encSession);

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
    const legal = expectLegal(
      handleMessage(dayStarted.session, { type: 'legal-actions' }).response,
    );

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
