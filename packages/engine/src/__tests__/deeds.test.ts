import { describe, expect, it } from 'vitest';
import { DEEDS, RENOWN_DEED_THRESHOLDS, RENOWN_RANKS } from '@spacerquest/content';
import { RENOWN_RANK_ORDER, evaluateDeeds, nextRankFor, rankForDeedCount } from '../deeds.js';
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
    expect(events[2]).toMatchObject({
      type: 'WireEntry',
      message: 'Registry confirms Player as Commander after First Manifest.',
    });
  });

  // T-1308 · Conqueror capstone.
  it('exposes Conqueror as a defined-but-unreached capstone at current deed counts', () => {
    // The rank ladder exposes Conqueror with a citation...
    expect(RENOWN_RANKS.CONQUEROR).toMatchObject({ id: 'CONQUEROR', label: 'Conqueror' });
    expect(RENOWN_RANKS.CONQUEROR.citation).toBeTruthy();
    expect(RENOWN_RANKS.CONQUEROR.citation?.length ?? 0).toBeGreaterThan(0);

    // ...at a threshold above the current authored deed set, so it is out of
    // reach today. Reachability THROUGH PLAY (a ≥30-deed set + long veteran sim)
    // is proven by T-1504's sweep, not here.
    expect(RENOWN_DEED_THRESHOLDS.CONQUEROR).toBe(30);
    expect(RENOWN_DEED_THRESHOLDS.CONQUEROR).toBeGreaterThan(DEEDS.length);

    // Earning every current deed saturates at GIGA_HERO — never Conqueror.
    expect(rankForDeedCount(DEEDS.length)).toBe('GIGA_HERO');
    expect(rankForDeedCount(DEEDS.length)).not.toBe('CONQUEROR');

    // But the ladder IS wired to select Conqueror once the headroom exists.
    expect(rankForDeedCount(RENOWN_DEED_THRESHOLDS.CONQUEROR)).toBe('CONQUEROR');
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
