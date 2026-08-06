import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@spacerquest/engine';
import { cuesForEvents, type Cue } from '../sound';

// ---------------------------------------------------------------------------
// T-185 · `cuesForEvents` — the event→cue mapping, finally pinned.
//
// This function has been the entire audio side of every player action since
// T-310 (`store.ts`'s `reactToEvents` plays exactly what it returns) and it had
// NO vitest coverage anywhere: the only audio tests in the tree were the
// Playwright mixer specs, which never call it. T-185 opened `sound.ts` to fix
// three measured audibility defects, and a level pass through a function nobody
// tests is how the NEXT edit silently drops a cue.
//
// It is the one part of `sound.ts` that is pure — no DOM, no `AudioContext`, no
// side effects — which is why it is the part that belongs here. Persistence and
// the mixer are NOT testable in this node environment (`sound.ts`'s `hasWindow()`
// is false, so `storage` is never reached); those live in `e2e/sound.spec.ts`
// against a real browser, and `e2e/sound-audible.spec.ts` covers the graph.
// ---------------------------------------------------------------------------

/** A `StatCheck` whose roll is whatever the caller needs. */
function statCheck(actor: string, nat: 'nat20' | 'nat1' | 'plain'): GameEvent {
  return {
    type: 'StatCheck',
    actor,
    stat: 'GUILE',
    dc: 10,
    result: {
      roll: nat === 'nat20' ? 20 : nat === 'nat1' ? 1 : 11,
      modifier: 0,
      total: 11,
      dc: 10,
      success: true,
      nat20: nat === 'nat20',
      nat1: nat === 'nat1',
    },
  } as unknown as GameEvent;
}

const travel = (success: boolean, interrupted?: boolean): GameEvent =>
  ({
    type: 'TravelEvent',
    characterId: 'player',
    origin: 3,
    destination: 4,
    fuelUsed: 2,
    success,
    ...(interrupted === undefined ? {} : { interrupted }),
  }) as unknown as GameEvent;

const wire = (message: string): GameEvent =>
  ({ type: 'WireEntry', day: 1, message, kind: 'trade' }) as unknown as GameEvent;

const trade = (success: boolean): GameEvent =>
  ({
    type: 'TradeEvent',
    characterId: 'player',
    actionDetails: 'x',
    success,
  }) as unknown as GameEvent;

const encounterRound = (round: number): GameEvent =>
  ({
    type: 'EncounterRound',
    encounterId: 'e1',
    round,
    stance: 'fight',
    continues: true,
    success: true,
    fuelUsed: 0,
  }) as unknown as GameEvent;

const dareBid = (): GameEvent =>
  ({
    type: 'DareBidPlaced',
    day: 1,
    handId: 'h1',
    actor: 'player',
    move: 'bid',
    quantity: 2,
    face: 4,
    antePaid: 10,
    potPlayer: 10,
    potDealer: 10,
  }) as unknown as GameEvent;

const dareResolved = (creditsDelta: number): GameEvent =>
  ({
    type: 'DareHandResolved',
    day: 1,
    handId: 'h1',
    opponentId: 'npc-1',
    outcome: creditsDelta < 0 ? 'challenge-loss' : 'challenge-win',
    bid: null,
    playerDice: [1, 2, 3, 4, 5],
    creditsDelta,
  }) as unknown as GameEvent;

const shipyardFail = (): GameEvent =>
  ({
    type: 'ShipyardFail',
    action: 'upgrade',
    reason: 'insufficient-credits',
  }) as unknown as GameEvent;

const encounterStarted = (): GameEvent =>
  ({ type: 'EncounterStarted', encounter: { round: 1 } }) as unknown as GameEvent;

const count = (cues: Cue[], cue: Cue): number => cues.filter((c) => c === cue).length;

describe('T-185 · cuesForEvents maps each event kind to its cue', () => {
  it('an empty stream is silent', () => {
    expect(cuesForEvents([])).toEqual([]);
  });

  it('EncounterStarted → combatStart, once per occurrence', () => {
    // NOT throttled, deliberately: two encounters in one batch is two stings.
    expect(cuesForEvents([encounterStarted()])).toEqual(['combatStart']);
    expect(cuesForEvents([encounterStarted(), encounterStarted()])).toEqual([
      'combatStart',
      'combatStart',
    ]);
  });

  it('a successful, uninterrupted jump → jump', () => {
    expect(cuesForEvents([travel(true)])).toEqual(['jump']);
  });

  it('a failed OR interrupted jump is silent', () => {
    // The player did not arrive anywhere. A whoosh here would be a lie about
    // what happened, which is the whole reason the guard exists.
    expect(cuesForEvents([travel(false)])).toEqual([]);
    expect(cuesForEvents([travel(true, true)])).toEqual([]);
    expect(cuesForEvents([travel(false, true)])).toEqual([]);
  });

  it('a natural 20 / natural 1 fires ONLY for the player', () => {
    expect(cuesForEvents([statCheck('Player', 'nat20')])).toEqual(['nat20']);
    expect(cuesForEvents([statCheck('Player', 'nat1')])).toEqual(['nat1']);
    // An NPC's day-resolution rolls stream through the same event type every
    // single day. Flourishing on those would make the crit cue meaningless.
    expect(cuesForEvents([statCheck('Vex', 'nat20')])).toEqual([]);
    expect(cuesForEvents([statCheck('Vex', 'nat1')])).toEqual([]);
  });

  it('an ordinary roll is silent, and nat20 wins over nat1 by construction', () => {
    expect(cuesForEvents([statCheck('Player', 'plain')])).toEqual([]);
  });
});

describe('T-185 · the throttles — one wire, one fail, one dice per batch', () => {
  it('a dusk full of wire entries crackles exactly once', () => {
    const events = [wire('a'), wire('b'), wire('c'), wire('d')];
    expect(count(cuesForEvents(events), 'wire')).toBe(1);
  });

  it('every route to `fail` shares ONE throttle', () => {
    // A refused trade, a lost hand and a refused shipyard purchase can all land
    // in the same batch. Three buzzes on top of each other is a mess, and the
    // shared flag is what prevents it — asserted across the three kinds, not
    // just repeated within one.
    const events = [trade(false), dareResolved(-40), shipyardFail(), trade(false)];
    expect(count(cuesForEvents(events), 'fail')).toBe(1);
  });

  it('every route to `dice` shares ONE throttle', () => {
    const events = [encounterRound(1), dareBid(), encounterRound(2), dareBid()];
    expect(count(cuesForEvents(events), 'dice')).toBe(1);
  });

  it('a SUCCESSFUL trade and a WINNING hand cost nothing, so neither buzzes', () => {
    expect(cuesForEvents([trade(true), dareResolved(120)])).toEqual([]);
    // `success` absent entirely is not a failure either — the guard is `=== false`.
    expect(
      cuesForEvents([
        { type: 'TradeEvent', characterId: 'p', actionDetails: 'x' } as unknown as GameEvent,
      ]),
    ).toEqual([]);
    // A hand that broke even is not a loss.
    expect(cuesForEvents([dareResolved(0)])).toEqual([]);
  });
});

describe('T-185 · unknown and unmapped events are silent, not broken', () => {
  it('an event kind with no cue yields nothing (the `default: break`)', () => {
    // The reason T-135's whole scene-event family was silent rather than a crash
    // when it landed. A new engine event must never be able to throw in here.
    const unmapped: GameEvent[] = [
      { type: 'DawnRoll', day: 1, hand: [1, 2, 3, 4, 5] } as unknown as GameEvent,
      { type: 'DebtDue', day: 1, outstanding: 500 } as unknown as GameEvent,
      { type: 'NotARealEvent' } as unknown as GameEvent,
    ];
    expect(cuesForEvents(unmapped)).toEqual([]);
  });

  it('order is preserved and unmapped events do not disturb it', () => {
    const cues = cuesForEvents([
      encounterStarted(),
      { type: 'DawnRoll', day: 1, hand: [] } as unknown as GameEvent,
      statCheck('Player', 'nat20'),
      travel(true),
    ]);
    expect(cues).toEqual(['combatStart', 'nat20', 'jump']);
  });

  it('is pure — the same stream answers the same way and is not mutated', () => {
    const events = [encounterStarted(), travel(true), wire('a'), wire('b')];
    const snapshot = JSON.stringify(events);
    expect(cuesForEvents(events)).toEqual(cuesForEvents(events));
    expect(JSON.stringify(events)).toBe(snapshot);
  });
});
