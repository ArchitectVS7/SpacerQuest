import { describe, it, expect } from 'vitest';
import { SUBSISTENCE_FLOOR_CREDITS } from '@spacerquest/content';
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
  it('hires a die-granting crew FREE: NO die spent, credits down, crew appended, CrewEvent{hired}', () => {
    // T-196a · This assertion was `spent[0] === true` before M17
    // (docs/DAWN-HAND-REDESIGN.md §3) freed the hire. It is INVERTED rather than
    // deleted: the hand must come out of a hire byte-identical to how it went in.
    const state = dayState(1, (s) => {
      s.player.credits = 5000;
    });
    const before = state.player.credits;
    const handBefore = [...state.player.dawnHand!.spent];
    const { state: next, events } = applyPlayerAction(state, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-second',
    });
    expect(next.player.crew).toEqual([{ roleId: 'crew-second', hiredDay: 1 }]);
    expect(next.player.credits).toBe(before - 3000);
    expect(next.player.dawnHand!.spent).toEqual(handBefore);
    expect(next.player.dawnHand!.spent.some(Boolean)).toBe(false);
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
    const { state: next, events } = applyPlayerAction(state, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-nope',
    });
    expect(crewEvents(events)[0]).toMatchObject({ kind: 'failed', failReason: 'unknown-role' });
    expect(next.player.dawnHand!.spent[die]).toBe(false); // T-196a: free — never spent
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
    });
    expect(dismissed.state.player.crew).toHaveLength(0);
    expect(dismissed.state.player.credits).toBe(credits); // no refund
    // T-196a: a dismiss is FREE — the hand is untouched (was: die0 spent).
    expect(dismissed.state.player.dawnHand!.spent[die0]).toBe(false);
    expect(crewEvents(dismissed.events)[0]).toMatchObject({
      kind: 'dismissed',
      roleId: 'crew-second',
    });

    const absent = applyPlayerAction(dismissed.state, {
      type: 'Crew',
      action: 'dismiss',
      roleId: 'crew-navigator',
    });
    expect(crewEvents(absent.events)[0]).toMatchObject({ kind: 'failed', failReason: 'not-hired' });
  });

  // T-196a · THE REPLACEMENT FOR THE OLD 'die-already-spent' CASE. That test asserted
  // a state that is now unreachable — a hire cannot be refused by the hand, because it
  // no longer reads the hand (docs/DAWN-HAND-REDESIGN.md §3). Its INTENT survives, and
  // is what these two assert: whatever the dawn hand looks like, the roster is decided
  // by the crew rules alone and is never corrupted.
  it('an ALREADY SPENT-OUT hand does not block a hire (M17 free action)', () => {
    const state = dayState(1, (s) => {
      s.player.credits = 20000;
      s.player.ship.cabin.strength = 30; // berth several
    });
    // T-197 · THE HAND IS SPENT OUT AS A FIXTURE, not by driving a burner action.
    // The rumor desk used to be the read-only die burner; T-197 freed all seven
    // Hangout venues (docs/DAWN-HAND-REDESIGN.md §3), so no read-only action
    // spends a die any more. The precondition this test needs is "a spent-out
    // hand" — which is a STATE, not an act — and stating it directly is both
    // honest and stronger: the assertion no longer depends on which verb happens
    // to still cost a die this milestone.
    const live = state;
    live.player.dawnHand!.spent = live.player.dawnHand!.spent.map(() => true);
    expect(live.player.dawnHand!.spent.every(Boolean)).toBe(true);

    const hired = applyPlayerAction(live, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-second',
    });
    expect(crewEvents(hired.events)[0]).toMatchObject({ kind: 'hired', roleId: 'crew-second' });
    expect(hired.state.player.crew).toHaveLength(1);
    // …and the exhausted hand is still exactly exhausted — nothing un-spent, nothing
    // spent twice.
    expect(hired.state.player.dawnHand!.spent).toEqual(live.player.dawnHand!.spent);
  });

  it('a hire with NO dawn hand at all still resolves on the crew rules', () => {
    const state = dayState(1, (s) => {
      s.player.credits = 20000;
      s.player.ship.cabin.strength = 30;
    });
    const handless = { ...state, player: { ...state.player, dawnHand: undefined } };
    const hired = applyPlayerAction(handless, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-second',
    });
    expect(crewEvents(hired.events)[0]).toMatchObject({ kind: 'hired', roleId: 'crew-second' });
    expect(hired.state.player.crew).toHaveLength(1);
    expect(hired.state.player.dawnHand).toBeUndefined();

    // The rules still bite with no hand: a second hire of the same role is refused.
    const dup = applyPlayerAction(hired.state, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-second',
    });
    expect(crewEvents(dup.events)[0]).toMatchObject({
      kind: 'failed',
      failReason: 'already-hired',
    });
    expect(dup.state.player.crew).toHaveLength(1);
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

  // T-182 · F-156-1 END TO END. Every step is a verb a player presses — hire,
  // sleep, buy fuel, reroll — because the defect lived in the SEAM between the
  // spend and the reroll, not in either one alone. On the unfixed tree the
  // buy-fuel at step 4 destroyed the charge and step 5 refused with `no-charge`.
  it('T-182 · hire the reroll role → next dawn → spend a die on a real action → Reroll still succeeds', () => {
    // 6,000 credits: 2,500 to hire plus wage runway through the dusk.
    const day1 = dayState(42, (s) => {
      s.player.credits = 6000;
    });
    expect(day1.player.dawnHand!.rerollsRemaining).toBe(0); // no crew yet

    const hired = applyPlayerAction(day1, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-navigator',
    }).state;
    expect(hired.player.crew).toEqual([{ roleId: 'crew-navigator', hiredDay: 1 }]);

    // Sleep on it — the charge is dealt at the NEXT dawn, off the new roster.
    const day2 = startDay(endDay(hired).state).state;
    expect(day2.player.dawnHand!.rerollsRemaining).toBe(1);

    // 4. Spend a die on an ASSIGN-family action. THIS is where the charge died.
    //    T-196a: `buy-fuel` was the assign-family caller here until M17 freed it
    //    (docs/DAWN-HAND-REDESIGN.md §3) and it stopped spending a die at all.
    //    `haggle` is the trade desk's surviving assign-family caller — it is the
    //    line `dice.ts`'s call-site ledger still names — so the F-156-1 regression
    //    is still driven through a real assign-and-reassign, not a synthetic one.
    const idx = firstUnspent(day2);
    const spent = applyPlayerAction(day2, {
      type: 'Trade',
      action: 'haggle',
      contractIndex: 0,
      spendDie: idx,
    }).state;
    expect(spent.player.dawnHand!.spent[idx]).toBe(true);
    expect(spent.player.dawnHand!.rerollsRemaining).toBe(1);

    // 5. The charge the player hired is still spendable.
    const rerollIdx = firstUnspent(spent);
    const { state: rolled, events } = applyPlayerAction(spent, {
      type: 'Reroll',
      dieIndex: rerollIdx,
    });
    const rr = events.find((e) => e.type === 'DiceRerolled') as Extract<
      GameEvent,
      { type: 'DiceRerolled' }
    >;
    expect(rr).toBeDefined();
    expect(rr.failReason).toBeUndefined();
    expect(rr.dieIndex).toBe(rerollIdx);
    expect(rr.result).toBeGreaterThanOrEqual(1);
    expect(rr.result).toBeLessThanOrEqual(20);
    expect(rolled.player.dawnHand!.dice[rerollIdx]).toBe(rr.result);
    expect(rolled.player.dawnHand!.rerollsRemaining).toBe(0);
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
    // "No charge on a walk" is still the claim, but it can no longer be read off
    // the closing balance: T-1604b's dusk subsistence floor (day.ts, content
    // SUBSISTENCE_FLOOR_CREDITS) fires on the same dusk because 10 < 100. So the
    // no-charge guarantee is asserted DIRECTLY — no CrewEvent{wage} at all — and
    // the closing balance is then fully accounted for by the floor's own top-up
    // (10 + 90 = 100). If the wage had been charged, `amount` would not be 90.
    expect(events.some((e) => e.type === 'CrewEvent' && e.kind === 'wage')).toBe(false);
    const floorEv = events.filter((e) => e.type === 'SubsistenceIncome');
    expect(floorEv).toEqual([
      { type: 'SubsistenceIncome', day: 1, amount: 90, creditsAfter: SUBSISTENCE_FLOOR_CREDITS },
    ]);
    expect(dusk.player.credits).toBe(SUBSISTENCE_FLOOR_CREDITS);
    expect(dusk.player.credits).toBeGreaterThanOrEqual(0);
  });

  it('a crew-free dusk emits no CrewEvent', () => {
    const state = dayState(1);
    const { events } = endDay(state);
    expect(events.some((e) => e.type === 'CrewEvent')).toBe(false);
  });
});
