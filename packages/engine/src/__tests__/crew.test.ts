import { describe, it, expect } from 'vitest';
import { createInitialState, serializeState, deserializeState } from '../state.js';
import { startDay, applyPlayerAction, endDay } from '../day.js';
import { GameEvent, GameState } from '../types.js';

/** Build a DAY-phase state (dawn hand rolled from the crew) with an optional
 *  pre-day mutation (crew roster, credits). */
function dayState(seed: number, mutate?: (state: GameState) => void): GameState {
  const state = createInitialState(seed);
  mutate?.(state);
  return startDay(state).state;
}

function crewEvents(events: GameEvent[]): Extract<GameEvent, { type: 'CrewEvent' }>[] {
  return events.filter(
    (e): e is Extract<GameEvent, { type: 'CrewEvent' }> => e.type === 'CrewEvent',
  );
}

function firstUnspent(state: GameState): number {
  const spent = state.player.dawnHand!.spent;
  return spent.findIndex((s) => !s);
}

describe('T-1306 · crew hiring', () => {
  it('hires a die-granting crew: die spent, credits down, crew appended, CrewEvent{hired}', () => {
    const state = dayState(1, (s) => {
      s.player.credits = 5000;
    });
    const before = state.player.credits;
    const { state: next, events } = applyPlayerAction(state, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-second',
      spendDie: 0,
    });
    expect(next.player.crew).toEqual([{ roleId: 'crew-second', hiredDay: 1 }]);
    expect(next.player.credits).toBe(before - 3000);
    expect(next.player.dawnHand!.spent[0]).toBe(true);
    const ce = crewEvents(events);
    expect(ce).toHaveLength(1);
    expect(ce[0]).toMatchObject({ kind: 'hired', roleId: 'crew-second', cost: 3000, crewCount: 1 });
  });

  it('refuses a second hire past the junker cabin berth (no-berth), no die spent', () => {
    const state = dayState(1, (s) => {
      s.player.credits = 20000;
      s.player.crew = [{ roleId: 'crew-quartermaster', hiredDay: 1 }];
    });
    const die = firstUnspent(state);
    const { state: next, events } = applyPlayerAction(state, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-second',
      spendDie: die,
    });
    expect(crewEvents(events)[0]).toMatchObject({ kind: 'failed', failReason: 'no-berth' });
    expect(next.player.crew).toHaveLength(1);
    expect(next.player.dawnHand!.spent[die]).toBe(false); // die untouched
    expect(next.player.credits).toBe(20000);
  });

  it('refuses a duplicate role (already-hired), no die spent', () => {
    const state = dayState(1, (s) => {
      s.player.credits = 20000;
      s.player.ship.cabin.strength = 30; // berth several
      s.player.crew = [{ roleId: 'crew-second', hiredDay: 1 }];
    });
    const die = firstUnspent(state);
    const { state: next, events } = applyPlayerAction(state, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-second',
      spendDie: die,
    });
    expect(crewEvents(events)[0]).toMatchObject({ kind: 'failed', failReason: 'already-hired' });
    expect(next.player.dawnHand!.spent[die]).toBe(false);
  });

  it('refuses an unaffordable hire (insufficient-credits), no die spent', () => {
    const state = dayState(1, (s) => {
      s.player.credits = 100;
    });
    const die = firstUnspent(state);
    const { state: next, events } = applyPlayerAction(state, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-second',
      spendDie: die,
    });
    expect(crewEvents(events)[0]).toMatchObject({
      kind: 'failed',
      failReason: 'insufficient-credits',
    });
    expect(next.player.crew).toHaveLength(0);
    expect(next.player.dawnHand!.spent[die]).toBe(false);
    expect(next.player.credits).toBe(100);
  });

  it('refuses an unknown role (unknown-role), no die spent', () => {
    const state = dayState(1, (s) => {
      s.player.credits = 20000;
    });
    const die = firstUnspent(state);
    const { events } = applyPlayerAction(state, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-nope',
      spendDie: die,
    });
    expect(crewEvents(events)[0]).toMatchObject({ kind: 'failed', failReason: 'unknown-role' });
  });

  it('dismisses a hired crew (removed, no refund), and rejects dismissing an absent role', () => {
    const state = dayState(1, (s) => {
      s.player.credits = 5000;
      s.player.crew = [{ roleId: 'crew-second', hiredDay: 1 }];
    });
    const credits = state.player.credits;
    const die0 = firstUnspent(state);
    const dismissed = applyPlayerAction(state, {
      type: 'Crew',
      action: 'dismiss',
      roleId: 'crew-second',
      spendDie: die0,
    });
    expect(dismissed.state.player.crew).toHaveLength(0);
    expect(dismissed.state.player.credits).toBe(credits); // no refund
    expect(crewEvents(dismissed.events)[0]).toMatchObject({
      kind: 'dismissed',
      roleId: 'crew-second',
    });

    const absent = applyPlayerAction(dismissed.state, {
      type: 'Crew',
      action: 'dismiss',
      roleId: 'crew-navigator',
      spendDie: firstUnspent(dismissed.state),
    });
    expect(crewEvents(absent.events)[0]).toMatchObject({ kind: 'failed', failReason: 'not-hired' });
  });

  it('malformed die input typed-fails (die-already-spent), no crew change', () => {
    const state = dayState(1, (s) => {
      s.player.credits = 5000;
    });
    // Spend die 0 first via a real hire, then reuse it.
    const first = applyPlayerAction(state, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-second',
      spendDie: 0,
    });
    const reused = applyPlayerAction(first.state, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-navigator',
      spendDie: 0,
    });
    expect(crewEvents(reused.events)[0]).toMatchObject({
      kind: 'failed',
      failReason: 'die-already-spent',
    });
    expect(reused.state.player.crew).toHaveLength(1); // only the first hire stuck
  });

  it('a die-granting crew rolls 6 dice at the next dawn, headlessly (acceptance #1, end-to-end)', () => {
    // Hire the extra-die First Officer, run the day loop through dusk, then the
    // NEXT dawn's hand is 6 dice — the whole progression driven headlessly.
    const state = dayState(1, (s) => {
      s.player.credits = 5000;
    });
    const hired = applyPlayerAction(state, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-second',
      spendDie: 0,
    }).state;
    const dusk = endDay(hired).state;
    expect(dusk.player.crew).toEqual([{ roleId: 'crew-second', hiredDay: 1 }]);
    const nextDawn = startDay(dusk).state;
    expect(nextDawn.player.dawnHand!.dice).toHaveLength(6);
  });
});

describe('T-1306 · dawn-die reroll', () => {
  it('consumes its single charge deterministically, floors the result, and serializes mid-day (acceptance #2)', () => {
    // A navigator (reroll) + quartermaster (floor 5) crew.
    const build = () =>
      dayState(42, (s) => {
        s.player.crew = [
          { roleId: 'crew-navigator', hiredDay: 1 },
          { roleId: 'crew-quartermaster', hiredDay: 1 },
        ];
      });
    const state = build();
    expect(state.player.dawnHand!.rerollsRemaining).toBe(1);
    // Every dawn die is already >= floor 5 (the quartermaster floor applied at dawn).
    for (const d of state.player.dawnHand!.dice) expect(d).toBeGreaterThanOrEqual(5);

    const idx = firstUnspent(state);
    const previous = state.player.dawnHand!.dice[idx];
    const { state: rolled, events } = applyPlayerAction(state, { type: 'Reroll', dieIndex: idx });

    const rr = events.find((e) => e.type === 'DiceRerolled');
    expect(rr).toBeDefined();
    expect(rr!.failReason).toBeUndefined();
    expect(rr!.dieIndex).toBe(idx);
    expect(rr!.previous).toBe(previous);
    expect(rr!.result).toBeGreaterThanOrEqual(5); // floor still applies to the reroll
    expect(rr!.result).toBeLessThanOrEqual(20);
    expect(rolled.player.dawnHand!.dice[idx]).toBe(rr!.result);
    expect(rolled.player.dawnHand!.rerollsRemaining).toBe(0);
    // The die is NOT marked spent — a reroll costs a charge, not a die.
    expect(rolled.player.dawnHand!.spent[idx]).toBe(false);

    // Determinism: rebuilding + re-rolling the same die yields the same face.
    const again = applyPlayerAction(build(), { type: 'Reroll', dieIndex: idx });
    const rr2 = again.events.find((e) => e.type === 'DiceRerolled') as Extract<
      GameEvent,
      { type: 'DiceRerolled' }
    >;
    expect(rr2.result).toBe(rr!.result);

    // Serialize the MID-DAY state and assert the spent charge round-trips.
    const restored = deserializeState(serializeState(rolled));
    expect(restored.player.dawnHand!.rerollsRemaining).toBe(0);
    expect(restored.player.dawnHand!.dice[idx]).toBe(rr!.result);

    // A second reroll typed-fails (no-charge) with no mutation.
    const second = applyPlayerAction(rolled, { type: 'Reroll', dieIndex: firstUnspent(rolled) });
    const rrFail = second.events.find((e) => e.type === 'DiceRerolled') as Extract<
      GameEvent,
      { type: 'DiceRerolled' }
    >;
    expect(rrFail.failReason).toBe('no-charge');
    expect(second.state.player.dawnHand!.dice).toEqual(rolled.player.dawnHand!.dice);
  });

  it('typed-fails on a bad die index / a spent die, no charge consumed', () => {
    const state = dayState(42, (s) => {
      s.player.crew = [{ roleId: 'crew-navigator', hiredDay: 1 }];
    });
    const bad = applyPlayerAction(state, { type: 'Reroll', dieIndex: 99 });
    const badEv = bad.events.find((e) => e.type === 'DiceRerolled') as Extract<
      GameEvent,
      { type: 'DiceRerolled' }
    >;
    expect(badEv.failReason).toBe('invalid-die-index');
    expect(bad.state.player.dawnHand!.rerollsRemaining).toBe(1); // charge intact
  });

  it('a crew with no reroll role banks no charge, so Reroll typed-fails no-charge', () => {
    const state = dayState(42); // no crew
    expect(state.player.dawnHand!.rerollsRemaining).toBe(0);
    const { events } = applyPlayerAction(state, { type: 'Reroll', dieIndex: 0 });
    const ev = events.find((e) => e.type === 'DiceRerolled') as Extract<
      GameEvent,
      { type: 'DiceRerolled' }
    >;
    expect(ev.failReason).toBe('no-charge');
  });
});

describe('T-1306 · crew wage upkeep at dusk', () => {
  it('deducts the summed wage and logs CrewEvent{wage} when affordable', () => {
    const state = dayState(1, (s) => {
      s.player.credits = 5000;
      s.player.ship.cabin.strength = 30;
      s.player.crew = [
        { roleId: 'crew-second', hiredDay: 1 }, // wage 40
        { roleId: 'crew-navigator', hiredDay: 1 }, // wage 30
      ];
    });
    const before = state.player.credits;
    const { state: dusk, events } = endDay(state);
    const wageEv = events.find((e) => e.type === 'CrewEvent' && e.kind === 'wage') as Extract<
      GameEvent,
      { type: 'CrewEvent' }
    >;
    expect(wageEv).toBeDefined();
    expect(wageEv.amount).toBe(70);
    expect(dusk.player.credits).toBe(before - 70);
    expect(dusk.player.crew).toHaveLength(2);
  });

  it('the crew WALK when payroll is unaffordable — dismissed, credits never negative', () => {
    const state = dayState(1, (s) => {
      s.player.credits = 10; // can't cover a 40-wage crew
      s.player.crew = [{ roleId: 'crew-second', hiredDay: 1 }];
    });
    const { state: dusk, events } = endDay(state);
    const dismissed = events.filter((e) => e.type === 'CrewEvent' && e.kind === 'dismissed');
    expect(dismissed).toHaveLength(1);
    expect(dusk.player.crew).toHaveLength(0);
    expect(dusk.player.credits).toBe(10); // no charge on a walk
    expect(dusk.player.credits).toBeGreaterThanOrEqual(0);
  });

  it('a crew-free dusk emits no CrewEvent', () => {
    const state = dayState(1);
    const { events } = endDay(state);
    expect(events.some((e) => e.type === 'CrewEvent')).toBe(false);
  });
});
