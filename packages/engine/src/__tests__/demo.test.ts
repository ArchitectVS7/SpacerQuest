import { describe, expect, it } from 'vitest';
import {
  DEMO_FINAL_DAY,
  DEMO_LOCKED_FEATURES,
  DEMO_POST_RESOLUTION_DAYS,
  TOUR_ONE_RESOLUTION_DAY,
} from '@spacerquest/content';
import { applyPlayerAction, endDay, startDay } from '../day.js';
import { createInitialState, deserializeState, serializeState } from '../state.js';
import { createSave, loadSave } from '../save.js';
import { evaluateDeeds } from '../deeds.js';
import {
  demoConcluded,
  demoDaysRemaining,
  demoLocked,
  demoLocks,
  isDemo,
  promoteEdition,
} from '../demo.js';
import { applySuccession } from '../legacy.js';
import { cloneState } from '../clone.js';
import { DayPhase, type EarnedDeedState, type GameEvent, type GameState } from '../types.js';

// ---------------------------------------------------------------------------
// T-1703 · THE DEMO GATE, PROVED HEADLESSLY.
//
// Every rule the demo build depends on lives in the engine, so every rule is
// provable here with no cockpit and no browser. The cockpit spec
// (`packages/ui/e2e/demo-gate.spec.ts`) proves the PLAYER can see it; this proves
// the gate itself.
// ---------------------------------------------------------------------------

/** A DAY-phase state at Sun-3 in the given edition, with an optional pre-day
 *  mutation (credits, day, crew). Mirrors `crew.test.ts` / `port.test.ts`'s
 *  `dayState` so the three read alike. */
function dayState(
  edition: 'full' | 'demo',
  seed: number,
  mutate?: (state: GameState) => void,
): GameState {
  const state = createInitialState(seed, edition);
  mutate?.(state);
  return startDay(state).state;
}

function blocked(events: GameEvent[]): Extract<GameEvent, { type: 'ActionBlocked' }>[] {
  return events.filter(
    (e): e is Extract<GameEvent, { type: 'ActionBlocked' }> => e.type === 'ActionBlocked',
  );
}

function firstUnspent(state: GameState): number {
  return state.player.dawnHand!.spent.findIndex((s) => !s);
}

/** N synthetic earned deeds — the `deeds.test.ts` helper, reused so the registry
 *  is populated the same way `deserializeState` reconstructs a high-rank one. */
function syntheticEarned(count: number): EarnedDeedState[] {
  return Array.from({ length: count }, (_unused, i) => ({
    id: `synthetic-${i}`,
    title: 'x',
    citation: 'x',
    day: 1,
    eventIndex: i,
  }));
}

/** A signed manifest — the `first_manifest` deed's trigger. */
function signContractEvent(): GameEvent {
  return {
    type: 'TradeEvent',
    characterId: 'player',
    action: 'sign-contract',
    success: true,
    destination: 2,
    cargoType: 1,
    payment: 100,
    actionDetails: 'Signed contract to deliver cargo to 2 for 100 credits.',
  };
}

describe('T-1703 · the demo shape', () => {
  it('is Tour One plus exactly three post-resolution days', () => {
    // The Accept's own arithmetic, pinned so neither half can drift alone.
    expect(TOUR_ONE_RESOLUTION_DAY).toBe(30);
    expect(DEMO_POST_RESOLUTION_DAYS).toBe(3);
    expect(DEMO_FINAL_DAY).toBe(33);
  });

  it('a full career is never a demo career, at any day', () => {
    for (const day of [1, 30, 33, 34, 500]) {
      const state = createInitialState(1);
      state.day = day;
      expect(isDemo(state)).toBe(false);
      expect(demoConcluded(state)).toBe(false);
      expect(demoDaysRemaining(state)).toBeNull();
      expect(demoLocks(state)).toEqual([]);
    }
  });

  it('locks exactly the three named features in a demo career', () => {
    const demo = createInitialState(1, 'demo');
    expect([...demoLocks(demo)]).toEqual([...DEMO_LOCKED_FEATURES]);
    expect([...DEMO_LOCKED_FEATURES]).toEqual(['crew-progression', 'port-ownership', 'conqueror']);
  });

  it('demoConcluded flips at the day-33/34 boundary, not before', () => {
    // Day 33 is PLAYED — its dusk is the demo's last. The roll to 34 is where the
    // cockpit takes over. Off by one here and the player loses a day they were
    // promised (or gains one they were not).
    const state = createInitialState(1, 'demo');
    for (const day of [1, 30, 31, 32, 33]) {
      state.day = day;
      expect(demoConcluded(state)).toBe(false);
    }
    for (const day of [34, 35, 100]) {
      state.day = day;
      expect(demoConcluded(state)).toBe(true);
    }
  });

  it('counts down the days remaining, and clamps at zero', () => {
    const state = createInitialState(1, 'demo');
    state.day = 1;
    expect(demoDaysRemaining(state)).toBe(33);
    state.day = 33;
    expect(demoDaysRemaining(state)).toBe(1);
    state.day = 34;
    expect(demoDaysRemaining(state)).toBe(0);
    state.day = 99;
    expect(demoDaysRemaining(state)).toBe(0); // never negative
  });
});

describe('T-1703 · the two reachable locks (demo-locked)', () => {
  it('refuses a port purchase with no die spent, no rng fork and no state change', () => {
    const state = dayState('demo', 1, (s) => {
      s.player.credits = 200_000; // affordable — the refusal is the LOCK, not the price
    });
    const die = firstUnspent(state);
    const { state: next, events } = applyPlayerAction(state, {
      type: 'Port',
      action: 'buy',
      systemId: state.player.currentSystemId,
      spendDie: die,
    });

    expect(blocked(events)).toEqual([
      { type: 'ActionBlocked', day: state.day, actionType: 'Port', reason: 'demo-locked' },
    ]);
    // The gate's shape, asserted rather than described: nothing was consumed.
    expect(next.player.dawnHand!.spent[die]).toBe(false);
    expect(next.player.credits).toBe(state.player.credits);
    expect(next.player.ports).toEqual([]);
    expect(next.rngState).toBe(state.rngState); // no fork
    expect(next.dayEventCount).toBe(state.dayEventCount);
    // Logged, exactly like every sibling refusal.
    expect(next.eventLog.at(-1)).toEqual(blocked(events)[0]);
  });

  it('refuses a crew HIRE but still permits a DISMISS', () => {
    const state = dayState('demo', 2, (s) => {
      s.player.credits = 200_000;
      // Carried in from a promoted save — the case the dismiss exemption exists
      // for. You may always let someone go.
      s.player.crew = [{ roleId: 'crew-quartermaster', hiredDay: 1 }];
    });

    const hire = applyPlayerAction(state, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-second',
      spendDie: firstUnspent(state),
    });
    expect(blocked(hire.events)).toEqual([
      { type: 'ActionBlocked', day: state.day, actionType: 'Crew', reason: 'demo-locked' },
    ]);
    expect(hire.state.player.crew).toHaveLength(1);
    expect(hire.state.player.credits).toBe(state.player.credits);

    const dismiss = applyPlayerAction(state, {
      type: 'Crew',
      action: 'dismiss',
      roleId: 'crew-quartermaster',
      spendDie: firstUnspent(state),
    });
    expect(blocked(dismiss.events)).toEqual([]);
    expect(dismiss.state.player.crew).toEqual([]);
  });

  it('leaves both verbs alone in a FULL career (the control)', () => {
    // Without this the lock tests prove nothing: a gate that refuses everyone is
    // not a gate.
    const state = dayState('full', 1, (s) => {
      s.player.credits = 200_000;
    });
    const port = applyPlayerAction(state, {
      type: 'Port',
      action: 'buy',
      systemId: state.player.currentSystemId,
      spendDie: firstUnspent(state),
    });
    expect(blocked(port.events)).toEqual([]);
    expect(port.state.player.ports).toHaveLength(1);

    const crew = applyPlayerAction(state, {
      type: 'Crew',
      action: 'hire',
      roleId: 'crew-second',
      spendDie: firstUnspent(state),
    });
    expect(blocked(crew.events)).toEqual([]);
    expect(crew.state.player.crew).toHaveLength(1);
  });

  it('does not gate the Hangout itself — dare/rumor/borrow stay open', () => {
    // The reading recorded in content demo.ts: "Hangout progression" is the CREW
    // progression bought at the Hangout, not the Hangout. Shutting the venue would
    // cut two authored Tour One beats (PRD §7.3's Day-23 Dare, §7.5's bad-day
    // loan) out of the demo's Tour One.
    const state = dayState('demo', 3, (s) => {
      s.player.credits = 5000;
    });
    for (const venue of ['rumor', 'borrow'] as const) {
      const { events } = applyPlayerAction(state, {
        type: 'VisitHangout',
        venue,
        spendDie: firstUnspent(state),
      });
      expect(blocked(events)).toEqual([]);
    }
  });
});

describe('T-1703 · the day ceiling (demo-ended)', () => {
  it('refuses every blockable verb past the ceiling, with no die spent', () => {
    const state = dayState('demo', 4, (s) => {
      s.day = DEMO_FINAL_DAY + 1;
      s.player.credits = 200_000;
    });
    const die = firstUnspent(state);
    const attempts: { action: Parameters<typeof applyPlayerAction>[1]; type: string }[] = [
      {
        action: { type: 'Trade', action: 'buy-fuel', fuelAmount: 5, spendDie: die },
        type: 'Trade',
      },
      { action: { type: 'Travel', destinationId: 2, spendDie: die }, type: 'Travel' },
      {
        action: { type: 'Shipyard', action: 'repair', repairMode: 'all', spendDie: die },
        type: 'Shipyard',
      },
      {
        action: { type: 'Storylet', storyletId: 'x', choiceId: 'y', spendDie: die },
        type: 'Storylet',
      },
      { action: { type: 'Explore', spendDie: die }, type: 'Explore' },
      { action: { type: 'VisitHangout', venue: 'rumor', spendDie: die }, type: 'VisitHangout' },
      {
        action: { type: 'Port', action: 'buy', systemId: 1, spendDie: die },
        type: 'Port',
      },
      {
        action: { type: 'Crew', action: 'hire', roleId: 'crew-second', spendDie: die },
        type: 'Crew',
      },
    ];

    for (const { action, type } of attempts) {
      const { state: next, events } = applyPlayerAction(state, action);
      expect(blocked(events)).toEqual([
        { type: 'ActionBlocked', day: state.day, actionType: type, reason: 'demo-ended' },
      ]);
      expect(next.player.dawnHand!.spent[die]).toBe(false);
      expect(next.rngState).toBe(state.rngState);
      expect(next.dayEventCount).toBe(state.dayEventCount);
    }
  });

  it('a CREW DISMISS is refused past the ceiling too — the licence, not the verb', () => {
    // Distinct from the demo-LOCKED case above, and the distinction is the point:
    // a live demo licence withholds a PURCHASE; an expired one makes the whole
    // career inert, exactly as the Nemesis shear does.
    const state = dayState('demo', 5, (s) => {
      s.day = DEMO_FINAL_DAY + 1;
      s.player.crew = [{ roleId: 'crew-quartermaster', hiredDay: 1 }];
    });
    const { state: next, events } = applyPlayerAction(state, {
      type: 'Crew',
      action: 'dismiss',
      roleId: 'crew-quartermaster',
      spendDie: firstUnspent(state),
    });
    expect(blocked(events)[0].reason).toBe('demo-ended');
    expect(next.player.crew).toHaveLength(1);
  });

  it('a FULL career past day 33 is completely unaffected (the control)', () => {
    const state = dayState('full', 4, (s) => {
      s.day = DEMO_FINAL_DAY + 1;
      s.player.credits = 200_000;
    });
    const { events } = applyPlayerAction(state, {
      type: 'Trade',
      action: 'buy-fuel',
      fuelAmount: 5,
      spendDie: firstUnspent(state),
    });
    expect(blocked(events)).toEqual([]);
  });
});

describe('T-1703 · the last dusk', () => {
  it('emits DemoConcluded exactly once, at the dusk of the final day', () => {
    const state = dayState('demo', 6, (s) => {
      s.day = DEMO_FINAL_DAY;
    });
    const { state: next, events } = endDay(state);
    const concluded = events.filter((e) => e.type === 'DemoConcluded');
    expect(concluded).toEqual([
      { type: 'DemoConcluded', day: DEMO_FINAL_DAY, edition: 'demo', daysPlayed: DEMO_FINAL_DAY },
    ]);
    // NO special-cased rollover: the day rolls normally, and the DERIVED predicate
    // is what the cockpit and the sim read from the next dawn on.
    expect(next.day).toBe(DEMO_FINAL_DAY + 1);
    expect(next.dayPhase).toBe(DayPhase.DAWN);
    expect(demoConcluded(next)).toBe(true);
  });

  it('does not fire on any other day, nor on a full career’s day 33', () => {
    for (const day of [DEMO_FINAL_DAY - 1, DEMO_FINAL_DAY + 1]) {
      const { events } = endDay(dayState('demo', 7, (s) => (s.day = day)));
      expect(events.filter((e) => e.type === 'DemoConcluded')).toEqual([]);
    }
    const { events } = endDay(dayState('full', 7, (s) => (s.day = DEMO_FINAL_DAY)));
    expect(events.filter((e) => e.type === 'DemoConcluded')).toEqual([]);
  });

  it('still resolves Tour One at day 30 — the teaser days are the point', () => {
    // The demo must SHOW the veteran lanes opening: day 30's dusk fires
    // TourOneResolved, flips the era and sets veteran.unlocked exactly as the full
    // game does. A demo that ended at day 30 would end one beat too early.
    const state = dayState('demo', 8, (s) => {
      s.day = TOUR_ONE_RESOLUTION_DAY;
      s.player.debt = 0; // clear the marker so the CLEAN branch runs
    });
    const { state: next, events } = endDay(state);
    expect(events.some((e) => e.type === 'TourOneResolved')).toBe(true);
    expect(next.era).toBe('VETERAN');
    expect(next.flags['veteran.unlocked']).toBe(true);
    // …and the career is still playable for the three teaser days.
    expect(demoConcluded(next)).toBe(false);
    expect(demoDaysRemaining(next)).toBe(DEMO_POST_RESOLUTION_DAYS);
  });
});

describe('T-1703 · the CONQUEROR ceiling and its healing', () => {
  it('caps a demo career below CONQUEROR, and promotion gives the rank back', () => {
    // ONE TEST, BOTH HALVES — deliberately, so neither can pass vacuously: a cap
    // that also capped the full game, or a promotion that healed nothing, fails
    // here. CONQUEROR's threshold is 38, so 37 synthetic deeds plus one real one
    // is exactly the crossing.
    const demo = createInitialState(9, 'demo');
    demo.player.registry.earned = syntheticEarned(37);
    demo.player.registry.renownRank = 'GIGA_HERO';
    const emitted = evaluateDeeds(demo, [signContractEvent()]);

    // The deed IS earned — the lock is on the RANK, not on playing the game.
    expect(emitted.filter((e) => e.type === 'DeedEarned')).toHaveLength(1);
    expect(demo.player.registry.earned).toHaveLength(38);
    // …and the rank stops short, with no rank-up event to a rank never reached.
    expect(demo.player.registry.renownRank).not.toBe('CONQUEROR');
    expect(demo.player.registry.renownRank).toBe('GIGA_HERO');
    expect(
      emitted.filter((e) => e.type === 'RenownRankUp' && e.newRank === 'CONQUEROR'),
    ).toHaveLength(0);

    // THE CARRY: the same career, opened by the full build.
    const promoted = promoteEdition(demo, 'full');
    expect('refused' in promoted).toBe(false);
    if ('refused' in promoted) return;
    expect(promoted.state.edition).toBe('full');
    expect(promoted.state.player.registry.renownRank).toBe('CONQUEROR');
    expect(demoLocked(promoted.state, 'conqueror')).toBe(false);
  });

  it('a FULL career at the same deed count reaches CONQUEROR (the control)', () => {
    const full = createInitialState(9);
    full.player.registry.earned = syntheticEarned(37);
    full.player.registry.renownRank = 'GIGA_HERO';
    const emitted = evaluateDeeds(full, [signContractEvent()]);
    expect(full.player.registry.renownRank).toBe('CONQUEROR');
    expect(
      emitted.filter((e) => e.type === 'RenownRankUp' && e.newRank === 'CONQUEROR'),
    ).toHaveLength(1);
  });
});

describe('T-1703 · promoteEdition', () => {
  it('refuses to open a FULL save in the DEMO build — the gate’s closed hole', () => {
    // Without this a player flies veteran content on a demo licence just by having
    // played the full game first.
    const full = createInitialState(10);
    const result = promoteEdition(full, 'demo');
    expect(result).toEqual({ refused: 'demo-build-rejects-full-save' });
  });

  it('is identity with NO event when the editions already agree', () => {
    // A load is not a promotion: an `EditionPromoted` on every boot would be a wire
    // line the player earns by doing nothing.
    for (const edition of ['full', 'demo'] as const) {
      const state = createInitialState(11, edition);
      const result = promoteEdition(state, edition);
      expect('refused' in result).toBe(false);
      if ('refused' in result) return;
      expect(result.state).toBe(state); // identity, not a clone
      expect(result.events).toEqual([]);
    }
  });

  it('emits EditionPromoted plus a wire line, and does not mutate the input', () => {
    const demo = createInitialState(12, 'demo');
    const before = serializeState(demo);
    const result = promoteEdition(demo, 'full');
    expect('refused' in result).toBe(false);
    if ('refused' in result) return;
    expect(result.events[0]).toEqual({
      type: 'EditionPromoted',
      day: demo.day,
      from: 'demo',
      to: 'full',
    });
    expect(result.events[1]).toMatchObject({ type: 'WireEntry', kind: 'plain' });
    // Both events are LOGGED, so a promoted career carries the record.
    expect(result.state.eventLog.slice(-2)).toEqual(result.events);
    // PURITY: the input is untouched (`cloneState`, like every other resolver).
    expect(serializeState(demo)).toBe(before);
  });

  it('a promoted career keeps playing past the ceiling', () => {
    // The whole promise of "demo-save carries into full game", at the engine level:
    // day 34 is a normal day again.
    const demo = createInitialState(13, 'demo');
    demo.day = DEMO_FINAL_DAY + 1;
    expect(demoConcluded(demo)).toBe(true);
    const result = promoteEdition(demo, 'full');
    if ('refused' in result) throw new Error('unexpected refusal');
    expect(demoConcluded(result.state)).toBe(false);
    const playable = startDay(result.state).state;
    const { events } = applyPlayerAction(playable, {
      type: 'Trade',
      action: 'buy-fuel',
      fuelAmount: 5,
      spendDie: firstUnspent(playable),
    });
    expect(blocked(events)).toEqual([]);
  });
});

describe('T-1703 · the edition survives persistence', () => {
  it('round-trips exactly through createSave → loadSave (constraint 3)', () => {
    const demo = dayState('demo', 14, (s) => {
      s.day = DEMO_FINAL_DAY;
    });
    // Play the last dusk so the save carries a `DemoConcluded` event too — a
    // schema that rejected the new event would fail here, which is exactly the
    // autosave a real demo player's final day writes.
    const played = endDay(demo).state;
    const restored = loadSave(createSave(played, 14));
    expect(restored.state).toEqual(played);
    expect(restored.state.edition).toBe('demo');
    expect(restored.seed).toBe(14);
    expect(demoConcluded(restored.state)).toBe(true);
  });

  it('round-trips through serializeState → deserializeState', () => {
    const demo = createInitialState(15, 'demo');
    expect(deserializeState(serializeState(demo)).edition).toBe('demo');
  });

  it('defaults to full when a legacy state carries no edition', () => {
    // Every save that exists predates the demo build, so this is a statement of
    // fact, not a convenience default.
    const legacy = JSON.parse(serializeState(createInitialState(16))) as Record<string, unknown>;
    delete legacy.edition;
    expect(deserializeState(JSON.stringify(legacy)).edition).toBe('full');
  });

  it('survives cloneState by identity of value', () => {
    const demo = createInitialState(17, 'demo');
    expect(cloneState(demo).edition).toBe('demo');
  });

  it('survives succession — a demo death cannot launder into a full career', () => {
    // A SAFETY property, not an inheritance: `edition` lives at the root of
    // GameState, outside everything `applySuccession` touches, so it survives by
    // construction — which is why it is asserted rather than trusted.
    const demo = createInitialState(18, 'demo');
    applySuccession(demo, { originSystem: 1, interceptorId: 'anon-brigand-1' });
    expect(demo.edition).toBe('demo');
    expect(isDemo(demo)).toBe(true);
  });
});
