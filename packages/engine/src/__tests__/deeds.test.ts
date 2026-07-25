import { describe, expect, it } from 'vitest';
import { DEEDS, RENOWN_DEED_THRESHOLDS, RENOWN_RANKS } from '@spacerquest/content';
import {
  EVENT_PATHS,
  RENOWN_RANK_ORDER,
  STATE_PATHS,
  evaluateDeeds,
  nextRankFor,
  rankForDeedCount,
} from '../deeds.js';
import { createInitialState, deserializeState, serializeState } from '../state.js';
import { EarnedDeedState, GameEvent } from '../types.js';

/** Fabricate `count` earned-deed records with ids that cannot collide with any
 *  real DEED id, so a genuine deed (e.g. first_manifest) can still be earned on
 *  top of them. Rank is a pure function of earned.length, so this is the same
 *  machinery deserialize uses to reconstruct a high-rank registry. */
function syntheticEarned(count: number): EarnedDeedState[] {
  return Array.from({ length: count }, (_unused, i) => ({
    id: `synthetic-${i}`,
    title: 'x',
    citation: 'x',
    day: 1,
    eventIndex: i,
  }));
}

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

/** A successful player jump — matches the `first_jump` and (at count >= 5)
 *  `road_regular` deed triggers. Used to prove the cost guard actually bites. */
function travelEvent(destination: number): GameEvent {
  return {
    type: 'TravelEvent',
    characterId: 'player',
    origin: 1,
    destination,
    fuelUsed: 10,
    success: true,
  };
}

describe('deed registry', () => {
  it('fires each deed exactly once across repeated matching events', () => {
    const state = createInitialState(1);

    const first = evaluateDeeds(state, [signContractEvent()]);
    state.eventLog.push(...first);
    const second = evaluateDeeds(state, [signContractEvent()]);

    expect(first.filter((event) => event.type === 'DeedEarned')).toHaveLength(1);
    expect(second.filter((event) => event.type === 'DeedEarned')).toHaveLength(0);
    expect(state.player.registry.earned.map((deed) => deed.id)).toEqual(['first_manifest']);
  });

  it('survives serializeState and deserializeState', () => {
    const state = createInitialState(2);
    const events = evaluateDeeds(state, [signContractEvent()]);
    state.eventLog.push(...events);

    const restored = deserializeState(serializeState(state));

    expect(restored.player.registry).toEqual(state.player.registry);
    expect(restored.player.registry.earned[0]?.citation).toContain('day 1');
  });

  it('normalizes a missing rank from existing earned deeds during deserialize', () => {
    const state = createInitialState(22);
    state.player.registry.earned = [
      { id: 'first_manifest', title: 'First Manifest', citation: 'One.', day: 1, eventIndex: 4 },
      { id: 'first_jump', title: 'First Jump', citation: 'Two.', day: 2, eventIndex: 8 },
      { id: 'first_delivery', title: 'First Delivery', citation: 'Three.', day: 3, eventIndex: 12 },
    ];

    const raw = JSON.parse(serializeState(state)) as {
      player: { registry: { renownRank?: string } };
    };
    delete raw.player.registry.renownRank;

    const restored = deserializeState(JSON.stringify(raw));

    expect(restored.player.registry.earned).toEqual(state.player.registry.earned);
    expect(restored.player.registry.renownRank).toBe('COMMODORE');
  });

  it('reconstructs missing registry from unique DeedEarned event-log entries', () => {
    const state = createInitialState(23);
    state.eventLog = [
      {
        type: 'DeedEarned',
        day: 1,
        deedId: 'first_manifest',
        title: 'First Manifest',
        citation: 'On day 1, the Guild ledger opened.',
        renownRank: 'COMMANDER',
      },
      {
        type: 'WireEntry',
        day: 1,
        kind: 'plain',
        message: 'Registry confirms Player as Commander.',
      },
      {
        type: 'DeedEarned',
        day: 2,
        deedId: 'first_jump',
        title: 'First Jump',
        citation: 'On day 2, the ship broke orbit.',
        renownRank: 'CAPTAIN',
      },
      {
        type: 'DeedEarned',
        day: 3,
        deedId: 'first_manifest',
        title: 'First Manifest',
        citation: 'Duplicate entries are ignored.',
        renownRank: 'CAPTAIN',
      },
      {
        type: 'TravelEvent',
        characterId: 'player',
        origin: 1,
        destination: 2,
        fuelUsed: 10,
        success: true,
      },
    ];

    const raw = JSON.parse(serializeState(state)) as { player: { registry?: unknown } };
    delete raw.player.registry;

    const restored = deserializeState(JSON.stringify(raw));

    expect(restored.player.registry.earned).toEqual([
      {
        id: 'first_manifest',
        title: 'First Manifest',
        citation: 'On day 1, the Guild ledger opened.',
        day: 1,
        eventIndex: 0,
      },
      {
        id: 'first_jump',
        title: 'First Jump',
        citation: 'On day 2, the ship broke orbit.',
        day: 2,
        eventIndex: 2,
      },
    ]);
    expect(restored.player.registry.renownRank).toBe('CAPTAIN');
    // matchCounts is rebuilt from the raw log: the successful TravelEvent matches
    // first_jump, road_regular (count deed), and fuel_fumes_arrival (its state
    // matcher is not part of event matching); DeedEarned/WireEntry match nothing.
    expect(restored.player.registry.matchCounts).toEqual({
      first_jump: 1,
      road_regular: 1,
      fuel_fumes_arrival: 1,
    });
  });

  it('fires first delivery and Mercy Runner from structured delivery events', () => {
    const state = createInitialState(3);
    const delivery: GameEvent = {
      type: 'TradeEvent',
      characterId: 'player',
      action: 'deliver-cargo',
      success: true,
      destination: 7,
      cargoType: 4,
      payment: 500,
      actionDetails: 'Delivered cargo! Earned 500 credits.',
    };

    const events = evaluateDeeds(state, [delivery]);

    expect(
      events.filter((event) => event.type === 'DeedEarned').map((event) => event.deedId),
    ).toEqual(['first_delivery', 'mercy_runner']);
    expect(state.player.registry.earned.map((deed) => deed.id)).toEqual([
      'first_delivery',
      'mercy_runner',
    ]);
  });

  it('orders deeds by source event stream before content definition order', () => {
    const state = createInitialState(31);
    const travel: GameEvent = {
      type: 'TravelEvent',
      characterId: 'player',
      origin: 1,
      destination: 2,
      fuelUsed: 10,
      success: true,
    };
    const delivery: GameEvent = {
      type: 'TradeEvent',
      characterId: 'player',
      action: 'deliver-cargo',
      success: true,
      destination: 2,
      cargoType: 1,
      payment: 100,
      actionDetails: 'Delivered cargo! Earned 100 credits.',
    };

    expect(DEEDS.findIndex((deed) => deed.id === 'first_delivery')).toBeLessThan(
      DEEDS.findIndex((deed) => deed.id === 'first_jump'),
    );

    const events = evaluateDeeds(state, [travel, delivery]);

    expect(
      events.filter((event) => event.type === 'DeedEarned').map((event) => event.deedId),
    ).toEqual(['first_jump', 'first_delivery']);
    expect(state.player.registry.earned.map((deed) => deed.id)).toEqual([
      'first_jump',
      'first_delivery',
    ]);
    expect(state.player.registry.earned.map((deed) => deed.eventIndex)).toEqual([0, 1]);
  });

  it('credits storylet deedProgress by a clamped amount and earns the count deed once', () => {
    const state = createInitialState(9);
    const progress = (amount: number): GameEvent => ({
      type: 'StoryletDeedProgress',
      day: 1,
      storyletId: 'chain.doc-salvage.follow-up',
      choiceId: 'accept-thanks',
      deedId: 'beacon_keeper',
      amount,
    });

    // A malformed non-positive amount is clamped up to 1, still crossing the
    // gte:1 threshold and earning beacon_keeper exactly once.
    const first = evaluateDeeds(state, [progress(-5)]);
    state.eventLog.push(...first);

    expect(state.player.registry.matchCounts['beacon_keeper']).toBe(1);
    expect(
      first.filter((event) => event.type === 'DeedEarned' && event.deedId === 'beacon_keeper'),
    ).toHaveLength(1);

    // Once earned, further progress cannot re-earn it.
    const second = evaluateDeeds(state, [progress(3)]);
    expect(second.filter((event) => event.type === 'DeedEarned')).toHaveLength(0);
    expect(state.player.registry.earned.map((deed) => deed.id)).toEqual(['beacon_keeper']);
  });

  it('derives renown rank purely from earned deed count', () => {
    const state = createInitialState(4);

    expect(state.player.registry.earned).toHaveLength(0);
    expect(state.player.registry.renownRank).toBe('LIEUTENANT');
    expect(rankForDeedCount(0)).toBe('LIEUTENANT');

    evaluateDeeds(state, [signContractEvent()]);

    // Rank tracks the number of earned deeds and nothing else.
    expect(state.player.registry.earned).toHaveLength(1);
    expect(state.player.registry.renownRank).toBe('COMMANDER');
    expect(rankForDeedCount(2)).toBe('CAPTAIN');
    expect(rankForDeedCount(3)).toBe('COMMODORE');
    expect(rankForDeedCount(4)).toBe('COMMODORE');
  });

  it('evaluates deeds from the source events only, never re-scanning the event log', () => {
    const emptyLog = createInitialState(7);
    const bigLog = createInitialState(7);
    // The historical log is padded with 5,000 entries that DO match deed
    // triggers (successful player jumps → first_jump, and >= 5 of them →
    // road_regular). A correct O(source) implementation reads the cached
    // matchCounts and ignores the log entirely, so both states emit the same
    // events for the same source. A quadratic implementation that re-scanned
    // `state.eventLog` would fold these 5,000 matches into bigLog's counts —
    // firing first_jump/road_regular and diverging — so this test now actually
    // guards the complexity invariant (the old DayAdvanced filler matched
    // nothing and couldn't tell the two implementations apart).
    bigLog.eventLog = Array.from({ length: 5000 }, (_unused, i): GameEvent =>
      travelEvent((i % 20) + 1),
    );

    const source = [signContractEvent()];
    const emptyEvents = evaluateDeeds(emptyLog, source);
    const bigEvents = evaluateDeeds(bigLog, source);

    expect(bigEvents).toEqual(emptyEvents);
    expect(bigLog.player.registry.earned.map((deed) => deed.id)).toEqual(
      emptyLog.player.registry.earned.map((deed) => deed.id),
    );
    expect(bigLog.player.registry.renownRank).toBe(emptyLog.player.registry.renownRank);
    expect(bigLog.player.registry.matchCounts).toEqual(emptyLog.player.registry.matchCounts);
  });

  it('emits a rank-up wire entry when a deed crosses a threshold', () => {
    const state = createInitialState(5);

    const events = evaluateDeeds(state, [signContractEvent()]);

    expect(events.map((event) => event.type)).toEqual(['DeedEarned', 'RenownRankUp', 'WireEntry']);
    expect(events[1]).toMatchObject({
      type: 'RenownRankUp',
      previousRank: 'LIEUTENANT',
      newRank: 'COMMANDER',
      deedCount: 1,
    });
    // T-1504 READER ASSERTION (non-capstone rank): the rank-up wire is the
    // reached rank's authored `citation` verbatim. Before T-1504 only CONQUEROR
    // carried one and every other rank fell back to an engine-authored generic
    // line; content now owns all ten and the fallback is gone.
    expect(events[2]).toMatchObject({
      type: 'WireEntry',
      message: RENOWN_RANKS.COMMANDER.citation,
    });
    expect(events[2].type === 'WireEntry' && events[2].message).not.toContain(
      'Registry confirms Player as Commander after',
    );
  });

  // T-1308 · Conqueror capstone — UPDATED BY T-1504, which filled the headroom.
  it('exposes Conqueror as a capstone the authored deed set can now reach', () => {
    // The rank ladder exposes Conqueror with a citation...
    expect(RENOWN_RANKS.CONQUEROR).toMatchObject({ id: 'CONQUEROR', label: 'Conqueror' });
    expect(RENOWN_RANKS.CONQUEROR.citation.length).toBeGreaterThan(0);

    // ...at the threshold T-1308 pinned. T-1308 authored it ABOVE the then-17
    // deed set, so it was defined-but-unreachable and this test asserted the gap.
    // T-1504 is the task that closes it: the authored slate now clears 30, so
    // earning the set is enough to select CONQUEROR. Reachability THROUGH PLAY
    // (a long veteran sim that actually climbs there) is proven in
    // `packages/sim/src/__tests__/campaign-reach.test.ts`, not here.
    expect(RENOWN_DEED_THRESHOLDS.CONQUEROR).toBe(30);
    expect(DEEDS.length).toBeGreaterThanOrEqual(RENOWN_DEED_THRESHOLDS.CONQUEROR);

    // Earning every authored deed now tops the ladder out at Conqueror.
    expect(rankForDeedCount(DEEDS.length)).toBe('CONQUEROR');
    // ...and the threshold itself is the exact crossing point: one deed short is
    // still GIGA_HERO, so the capstone is earned, never rounded up to.
    expect(rankForDeedCount(RENOWN_DEED_THRESHOLDS.CONQUEROR)).toBe('CONQUEROR');
    expect(rankForDeedCount(RENOWN_DEED_THRESHOLDS.CONQUEROR - 1)).toBe('GIGA_HERO');
  });

  it('reaching Conqueror fires the unique capstone wire plus a Registry entry', () => {
    const state = createInitialState(1308);
    // Stand the captain one deed short of the Conqueror threshold with a rank of
    // GIGA_HERO, then earn a real deed to cross to 30.
    state.player.registry.earned = syntheticEarned(29);
    state.player.registry.renownRank = 'GIGA_HERO';

    const events = evaluateDeeds(state, [signContractEvent()]);

    // rank-up emits both the RenownRankUp and the Registry entry (DeedEarned +
    // the pushed earned record).
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'RenownRankUp',
        previousRank: 'GIGA_HERO',
        newRank: 'CONQUEROR',
        deedCount: 30,
      }),
    );
    expect(state.player.registry.renownRank).toBe('CONQUEROR');
    expect(state.player.registry.earned).toHaveLength(30);
    expect(events.some((e) => e.type === 'DeedEarned' && e.deedId === 'first_manifest')).toBe(true);

    // The reader assertion: the rank-up wire is the CONQUEROR citation verbatim,
    // NOT the generic "Registry confirms Player as …" line. This proves the
    // engine consumes RENOWN_RANKS.CONQUEROR.citation.
    const wire = events.find((e) => e.type === 'WireEntry');
    expect(wire).toBeDefined();
    expect(wire?.type === 'WireEntry' && wire.message).toBe(RENOWN_RANKS.CONQUEROR.citation);
    expect(wire?.type === 'WireEntry' && wire.message).not.toContain('Registry confirms Player as');
  });

  it('a Conqueror registry and rank-up event survive JSON round-trip', () => {
    const state = createInitialState(1309);
    // 30 earned deeds keep rankForDeedCount === CONQUEROR stable through the
    // deserialize-time rank reconstruction, so the value must clear the schema
    // enum end-to-end.
    state.player.registry.earned = syntheticEarned(30);
    state.player.registry.renownRank = 'CONQUEROR';
    const rankUp: GameEvent = {
      type: 'RenownRankUp',
      day: 5,
      previousRank: 'GIGA_HERO',
      newRank: 'CONQUEROR',
      deedCount: 30,
    };
    const deedEarned: GameEvent = {
      type: 'DeedEarned',
      day: 5,
      deedId: 'first_manifest',
      title: 'First Manifest',
      citation: 'On day 5, the ledger closed the ladder.',
      renownRank: 'CONQUEROR',
    };
    state.eventLog.push(rankUp, deedEarned);

    const restored = deserializeState(serializeState(state));

    expect(restored.player.registry.renownRank).toBe('CONQUEROR');
    expect(restored.eventLog).toContainEqual(rankUp);
    expect(restored.eventLog).toContainEqual(deedEarned);
  });
});

// ---------------------------------------------------------------------------
// T-1504 · The launch-quantity deed pass. These are the CONTENT-shape guards:
// the count, the "no deed is silently unearnable" allowlist proof, the new-verb
// spread (so the count can't be padded with more trade deeds), and the ten rank
// citations. The play-level proofs — every deed earned in a 200-seed sweep, and
// a long veteran sim reaching Conqueror — live in the sim package.
// ---------------------------------------------------------------------------
describe('T-1504 deed slate', () => {
  it('ships at least 30 deeds with unique ids', () => {
    expect(DEEDS.length).toBeGreaterThanOrEqual(30);
    const ids = DEEDS.map((deed) => deed.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every deed names an allowlisted event type and only allowlisted paths', () => {
    // THE anti-dead-deed guard. A deed whose eventType is absent from EVENT_PATHS,
    // or whose matcher names a path outside that type's list, makes `matchesEvent`
    // return FALSE — the deed compiles, validates, renders in the Registry preview
    // and can never be earned. Asserting the whole slate against the engine's own
    // allowlist is the mechanical proof that no shipped deed is unearnable BY
    // CONSTRUCTION (the 200-seed sim sweep proves it in play).
    for (const deed of DEEDS) {
      const allowed = EVENT_PATHS[deed.trigger.eventType];
      expect(allowed, `${deed.id}: eventType '${deed.trigger.eventType}' is not allowlisted`).toBeDefined();
      for (const matcher of deed.trigger.match ?? []) {
        expect(
          allowed,
          `${deed.id}: match path '${matcher.path}' is not allowlisted for ${deed.trigger.eventType}`,
        ).toContain(matcher.path);
      }
      for (const matcher of deed.trigger.state ?? []) {
        expect(
          STATE_PATHS as readonly string[],
          `${deed.id}: state path '${matcher.path}' is not allowlisted`,
        ).toContain(matcher.path);
      }
    }
  });

  it('covers each new verb — gambling, smuggling, lending, exploration, property, crew', () => {
    // The count alone could be met with thirteen more trade deeds. This asserts
    // the slate actually spans the verbs T-1303..T-1307 added, which is what the
    // task asked for.
    const has = (predicate: (deed: (typeof DEEDS)[number]) => boolean): boolean => DEEDS.some(predicate);
    const ofType = (eventType: string) => (deed: (typeof DEEDS)[number]) =>
      deed.trigger.eventType === eventType;

    expect(has(ofType('HangoutEvent')), 'no gambling deed').toBe(true);
    expect(has(ofType('LoanEvent')), 'no lending deed').toBe(true);
    expect(has(ofType('PortEvent')), 'no property deed').toBe(true);
    expect(has(ofType('CrewEvent')), 'no crew deed').toBe(true);
    expect(
      has(ofType('PoiDiscovered')) && has(ofType('SalvageRecovered')),
      'no exploration deed',
    ).toBe(true);
    expect(
      has(ofType('ContrabandScan')) ||
        has(
          (deed) =>
            deed.trigger.eventType === 'TradeEvent' &&
            (deed.trigger.match ?? []).some((m) => m.path === 'cargoType' && m.equals === 10),
        ),
      'no smuggling deed',
    ).toBe(true);
  });

  it('every renown rank carries a distinct, non-empty citation', () => {
    const citations = RENOWN_RANK_ORDER.map((rank) => RENOWN_RANKS[rank].citation);
    for (const [index, rank] of RENOWN_RANK_ORDER.entries()) {
      expect(citations[index], `${rank} has no citation`).toBeTruthy();
      expect(citations[index].length).toBeGreaterThan(0);
    }
    expect(new Set(citations).size).toBe(RENOWN_RANK_ORDER.length);
    // The capstone line is pinned by T-1308 and must not drift.
    expect(RENOWN_RANKS.CONQUEROR.citation).toBe(
      'Registry seals the Conqueror rank: the frontier keeps one name now, and it is Player.',
    );
  });

  it('fires representative new-verb deeds from real engine event shapes', () => {
    // Deterministic proof that the allowlist additions are LIVE: each fabricated
    // event is the exact shape the corresponding resolver emits.
    const fires = (event: GameEvent, deedId: string): boolean => {
      const state = createInitialState(1504);
      const events = evaluateDeeds(state, [event]);
      return events.some((e) => e.type === 'DeedEarned' && e.deedId === deedId);
    };

    expect(
      fires(
        {
          type: 'HangoutEvent',
          day: 1,
          venue: 'dare',
          opponentId: 'npc-iron-vex',
          wager: 300,
          playerWon: true,
          creditsDelta: 300,
        },
        'high_roller',
      ),
    ).toBe(true);
    expect(
      fires(
        { type: 'LoanEvent', day: 1, kind: 'repaid', amountPaid: 250, outstanding: 0, cleared: true },
        'paid_in_full',
      ),
    ).toBe(true);
    expect(
      fires({ type: 'PortEvent', day: 1, kind: 'purchased', systemId: 1, cost: 25000 }, 'port_authority'),
    ).toBe(true);
    expect(
      fires(
        { type: 'PoiDiscovered', day: 1, poiId: 'poi-1', poiType: 'derelict', systemId: 3, name: 'a hulk' },
        'derelict_boarder',
      ),
    ).toBe(true);
    expect(fires({ type: 'CrewEvent', day: 1, kind: 'hired', roleId: 'extra-die' }, 'signed_the_crew')).toBe(
      true,
    );
    expect(
      fires(
        {
          type: 'ContrabandScan',
          encounterId: 'enc-1',
          interceptorId: 'npc-1',
          caught: false,
          check: {
            die: 10,
            modifier: 2,
            total: 12,
            dc: 11,
            success: true,
            margin: 1,
            nat20: false,
            nat1: false,
          },
        },
        'slipped_the_scan',
      ),
    ).toBe(true);
  });

  it('refuses a Dare deed for a FAILED hangout action (no wager was ever laid)', () => {
    // The gambling deeds guard on `wager`/`playerWon` precisely because a
    // malformed or opponent-less VisitHangout still emits venue:'dare'. This is
    // the discriminating case: a fail event must earn nothing.
    const state = createInitialState(1505);
    const events = evaluateDeeds(state, [
      { type: 'HangoutEvent', day: 1, venue: 'dare', failReason: 'no-opponent' },
    ]);
    expect(events.filter((e) => e.type === 'DeedEarned')).toHaveLength(0);
  });
});

describe('nextRankFor (T-1401 export pack)', () => {
  it('returns the immediately higher rank', () => {
    expect(nextRankFor('LIEUTENANT')).toBe('COMMANDER');
    expect(nextRankFor('COMMANDER')).toBe('CAPTAIN');
  });

  it('returns null at the top rank (CONQUEROR)', () => {
    expect(nextRankFor('CONQUEROR')).toBeNull();
  });

  it('walks the full canonical order exactly once, ending in null', () => {
    for (let i = 0; i < RENOWN_RANK_ORDER.length - 1; i++) {
      expect(nextRankFor(RENOWN_RANK_ORDER[i])).toBe(RENOWN_RANK_ORDER[i + 1]);
    }
    expect(nextRankFor(RENOWN_RANK_ORDER[RENOWN_RANK_ORDER.length - 1])).toBeNull();
  });
});
