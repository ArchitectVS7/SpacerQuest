import { describe, expect, it } from 'vitest';
import {
  DEEDS,
  RENOWN_DEED_THRESHOLDS,
  RENOWN_RANKS,
  defineDeeds,
  defineStorylets,
  validateDeeds,
  type DeedDefinition,
} from '@spacerquest/content';
import {
  EVENT_PATHS,
  RENOWN_RANK_ORDER,
  STATE_PATHS,
  accrueDeeds,
  computeMatchCounts,
  emptyDeedRegistry,
  evaluateDeeds,
  nextRankFor,
  rankForDeedCount,
  renownRankIndex,
} from '../deeds.js';
import { createInitialState, deserializeState, serializeState } from '../state.js';
import { npcShipForProfile } from '../npc.js';
import { ALL_NPC_PROFILES } from '@spacerquest/content';
import { EarnedDeedState, GameEvent, NpcState } from '../types.js';
import type { DeedActor } from '../deeds.js';

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
    // DERIVED (T-1603b): the reconstructed rank is whatever the CONTENT table
    // selects for three earned deeds. Naming a rank here would pin a balance
    // number in a serialization test — the fact under test is "the rank is
    // recomputed from the earned count", not which rank three deeds buys.
    expect(restored.player.registry.renownRank).toBe(rankForDeedCount(3));
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
    // DERIVED (T-1603b) from the two reconstructed deeds — see the sibling
    // deserialize test above for why this is not a rank name.
    expect(restored.player.registry.renownRank).toBe(rankForDeedCount(2));
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

    // T-1603b: this used to continue `rankForDeedCount(2) === 'CAPTAIN'` etc. —
    // three literals that were really a copy of the threshold table, and that the
    // canonical rescale reddened without any defect. The BEHAVIOUR under test is
    // "rank is a pure function of the count", so it is now asserted as such,
    // derived from content across the whole ladder:
    //   - every threshold selects exactly its own rank;
    //   - one deed short of a threshold still selects the rank BELOW it, so a
    //     rank is earned and never rounded up to;
    //   - the mapping is monotone in the count (more deeds never demotes).
    for (const rank of RENOWN_RANK_ORDER) {
      const threshold = RENOWN_DEED_THRESHOLDS[rank];
      expect(rankForDeedCount(threshold)).toBe(rank);
      if (threshold > 0) expect(rankForDeedCount(threshold - 1)).not.toBe(rank);
    }
    const ceiling = RENOWN_DEED_THRESHOLDS.CONQUEROR + 5;
    for (let count = 1; count <= ceiling; count += 1) {
      expect(
        renownRankIndex(rankForDeedCount(count)),
        `rank went DOWN between ${count - 1} and ${count} deeds`,
      ).toBeGreaterThanOrEqual(renownRankIndex(rankForDeedCount(count - 1)));
    }
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

    // ...at a threshold the authored slate can actually clear. T-1308 authored it
    // ABOVE the then-17 deed set, so it was defined-but-unreachable and this test
    // asserted the gap. T-1504a closed it STRUCTURALLY: earning the slate selects
    // CONQUEROR. Reachability THROUGH PLAY (a long veteran sim that actually
    // climbs there) is `packages/sim/src/__tests__/deed-coverage.test.ts`'s.
    //
    // T-1603b: the literal `toBe(30)` that used to sit here is GONE. It pinned a
    // balance number as a fixture, so the canonical rescale (30 → 38) reddened it
    // for no defect. What is asserted instead is the set of INVARIANTS that make
    // any threshold table correct — all derived from content, so the next rescale
    // moves them for free and a genuinely broken one still fails:
    //   - the capstone is inside the authored slate (never strandable);
    //   - earning everything tops the ladder out;
    //   - the threshold is the exact crossing point, in both directions.
    expect(RENOWN_DEED_THRESHOLDS.CONQUEROR).toBeLessThanOrEqual(DEEDS.length);

    // Earning every authored deed now tops the ladder out at Conqueror.
    expect(rankForDeedCount(DEEDS.length)).toBe('CONQUEROR');
    // ...and the threshold itself is the exact crossing point: one deed short is
    // still GIGA_HERO, so the capstone is earned, never rounded up to.
    expect(rankForDeedCount(RENOWN_DEED_THRESHOLDS.CONQUEROR)).toBe('CONQUEROR');
    expect(rankForDeedCount(RENOWN_DEED_THRESHOLDS.CONQUEROR - 1)).toBe('GIGA_HERO');
  });

  // T-1603b · MONOTONICITY GUARD. `rankForDeedCount` walks RENOWN_RANK_ORDER and
  // takes the LAST rank whose threshold the count meets, so a table that dips —
  // say a GRAND_MUFTI below its TOP_DOG — selects the wrong rank with no error and
  // no red test anywhere. Cheap to assert, and it protects every future rescale
  // (T-1603b's own included). Derived entirely from content: no literal thresholds.
  it('renown thresholds are non-decreasing across the declared rank order', () => {
    for (let i = 1; i < RENOWN_RANK_ORDER.length; i += 1) {
      const previous = RENOWN_RANK_ORDER[i - 1];
      const current = RENOWN_RANK_ORDER[i];
      expect(
        RENOWN_DEED_THRESHOLDS[current],
        `${current} (${RENOWN_DEED_THRESHOLDS[current]}) must not sit below ${previous} (${RENOWN_DEED_THRESHOLDS[previous]})`,
      ).toBeGreaterThanOrEqual(RENOWN_DEED_THRESHOLDS[previous]);
    }
    // ...and the ladder actually climbs: the capstone is strictly above the floor,
    // so a table flattened to all-zeros (which is monotone) still fails.
    expect(RENOWN_DEED_THRESHOLDS[RENOWN_RANK_ORDER[RENOWN_RANK_ORDER.length - 1]]).toBeGreaterThan(
      RENOWN_DEED_THRESHOLDS[RENOWN_RANK_ORDER[0]],
    );
    // Every rank is SELECTABLE — no two ranks share a threshold, which would make
    // the lower one unreachable (rankForDeedCount takes the last match).
    for (const rank of RENOWN_RANK_ORDER) {
      expect(rankForDeedCount(RENOWN_DEED_THRESHOLDS[rank]), `${rank} is unreachable`).toBe(rank);
    }
  });

  it('reaching Conqueror fires the unique capstone wire plus a Registry entry', () => {
    const state = createInitialState(1308);
    // Stand the captain one deed short of the Conqueror threshold with a rank of
    // GIGA_HERO, then earn a real deed to cross it. The counts are DERIVED from
    // the content threshold (T-1603b) so a rescale moves the fixture with it.
    const capstone = RENOWN_DEED_THRESHOLDS.CONQUEROR;
    state.player.registry.earned = syntheticEarned(capstone - 1);
    state.player.registry.renownRank = 'GIGA_HERO';

    const events = evaluateDeeds(state, [signContractEvent()]);

    // rank-up emits both the RenownRankUp and the Registry entry (DeedEarned +
    // the pushed earned record).
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'RenownRankUp',
        previousRank: 'GIGA_HERO',
        newRank: 'CONQUEROR',
        deedCount: capstone,
      }),
    );
    expect(state.player.registry.renownRank).toBe('CONQUEROR');
    expect(state.player.registry.earned).toHaveLength(capstone);
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
    // A capstone-worth of earned deeds keeps rankForDeedCount === CONQUEROR stable
    // through the deserialize-time rank reconstruction, so the value must clear the
    // schema enum end-to-end. DERIVED from content (T-1603b) — the recompute at
    // deserialize is exactly what makes a threshold rescale save-compatible without
    // a migration, so this fixture must follow the table rather than pin a number.
    state.player.registry.earned = syntheticEarned(RENOWN_DEED_THRESHOLDS.CONQUEROR);
    state.player.registry.renownRank = 'CONQUEROR';
    const rankUp: GameEvent = {
      type: 'RenownRankUp',
      day: 5,
      previousRank: 'GIGA_HERO',
      newRank: 'CONQUEROR',
      deedCount: RENOWN_DEED_THRESHOLDS.CONQUEROR,
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
// T-1504a · The launch-quantity deed pass. Two layers of guard live here:
//
//   (1) CONTENT-SHAPE guards — the count, the "no deed is silently unearnable"
//       allowlist proof in BOTH directions, the new-verb spread (so the count
//       can't be padded with more trade deeds), and the ten rank citations.
//   (2) PER-DEED TRIGGER proofs — every net-new deed fired from a constructed
//       qualifying state through the real `evaluateDeeds`, with the event shapes
//       copied from the actual resolvers, plus threshold-bite and boundary pairs
//       so a `gte` is proven to be load-bearing rather than decorative.
//
// The play-level coverage proofs (every deed earned across a seed sweep; a long
// veteran sim reaching Conqueror) are T-1504d's, deliberately NOT here: they are
// multi-minute sweeps and this file is the fast unit gate.
// ---------------------------------------------------------------------------

/**
 * The deed slate as it stood BEFORE T-1504a. Frozen on purpose: the net-new set
 * is derived as `DEEDS` minus this list, and the per-deed trigger table below is
 * asserted to cover that derived set exactly. That is what stops the table from
 * rotting — authoring deed #45 without a trigger test fails this file rather
 * than shipping untested.
 */
const PRE_T1504_DEED_IDS: readonly string[] = [
  'first_manifest',
  'first_delivery',
  'mercy_runner',
  'first_jump',
  'road_regular',
  'rimward_bound',
  'fuel_fumes_arrival',
  'first_combat_win',
  'silver_tongue',
  'clean_getaway',
  'debt_first_payment',
  'debt_cleared',
  'tour_one_cleared',
  'broker_shark',
  'yard_rat',
  'cargo_expansion',
  'beacon_keeper',
];

// --- Event factories. Every shape below is copied from the emitter named in its
//     comment, NOT invented: a fabricated field that the resolver never sets
//     would make these tests prove nothing about the shipped game. ---

/** actions/hangout.ts — a resolved Spacer's Dare. A FAILED dare carries
 *  `failReason` and no `wager`, which is the discriminating case tested below. */
function hangoutDare(wager: number, playerWon: boolean): GameEvent {
  return {
    type: 'HangoutEvent',
    day: 1,
    venue: 'dare',
    opponentId: 'npc-iron-vex',
    wager,
    playerWon,
    creditsDelta: playerWon ? wager : -wager,
  };
}

/** T-147 · actions/dare.ts `settleDareHand` — a Liar's Dice set closing. The
 *  shape is copied from the emitter: `opponentId`/`beatenCount` ride along even
 *  though no deed names them (they are deliberately absent from EVENT_PATHS), so
 *  a matcher that reached for one would fail here rather than in a career. */
function liarsDiceSetCleared(scope: 'port' | 'roster', systemId: number): GameEvent {
  return {
    type: 'LiarsDiceSetCleared',
    day: 1,
    scope,
    systemId,
    opponentId: `ld-${systemId}-3`,
    beatenCount: scope === 'roster' ? 42 : 3,
  };
}

/** actions/lending.ts — the Penny Wise desk advancing a marker. */
function loanBorrowed(principal: number): GameEvent {
  return {
    type: 'LoanEvent',
    day: 1,
    kind: 'borrowed',
    lender: 'penny-wise',
    principal,
    dailyRate: 2,
    outstanding: principal,
  };
}

/** actions/ports.ts — a stake purchase. */
function portPurchase(systemId: number): GameEvent {
  return {
    type: 'PortEvent',
    day: 1,
    kind: 'purchased',
    systemId,
    cost: 25000,
    portCount: systemId,
  };
}

/** day.ts endDay — the dusk launch-fee accrual across owned stakes. */
function portIncome(): GameEvent {
  return { type: 'PortEvent', day: 1, kind: 'income', income: 120, portCount: 2 };
}

/** actions/exploration.ts — a charted point of interest. */
function poiDiscovered(index: number, poiType: 'beacon' | 'derelict'): GameEvent {
  return {
    type: 'PoiDiscovered',
    day: 1,
    poiId: `poi-${index}`,
    poiType,
    systemId: 3,
    name: 'a cold mark off the lane',
  };
}

/** actions/exploration.ts — the loot roll's credit payout. */
function salvageRecovered(amount: number): GameEvent {
  return { type: 'SalvageRecovered', day: 1, poiId: 'poi-1', systemId: 3, amount };
}

/** actions/exploration.ts — a NEW fragment entering the Nemesis file. */
function fragmentAcquired(index: number): GameEvent {
  return {
    type: 'FragmentAcquired',
    day: 1,
    fragmentId: `fragment-${index}`,
    source: 'derelict',
    fragmentCount: index,
    poiId: `poi-${index}`,
  };
}

/** actions/travel.ts — a completed delivery. */
function deliverCargo(destination: number, cargoType: number, payment: number): GameEvent {
  return {
    type: 'TradeEvent',
    characterId: 'player',
    action: 'deliver-cargo',
    success: true,
    destination,
    cargoType,
    payment,
    actionDetails: `Delivered cargo! Earned ${payment} credits.`,
  };
}

/** actions/patrol.ts — a patrol sweep of the hold (rides the Travel batch). */
function contrabandScan(caught: boolean): GameEvent {
  return {
    type: 'ContrabandScan',
    encounterId: 'enc-1',
    interceptorId: 'npc-patrol-1',
    caught,
    check: {
      die: 14,
      modifier: 2,
      total: 16,
      dc: 12,
      success: caught,
      margin: 4,
      nat20: false,
      nat1: false,
    },
  };
}

/** actions/patrol.ts — the caught path's seizure. Note `fine` is clamped to the
 *  player's credits, so a broke captain's seizure levies 0. */
function contrabandConfiscated(fine: number): GameEvent {
  return {
    type: 'ContrabandConfiscated',
    encounterId: 'enc-1',
    fine,
    creditsRemaining: 500,
    confiscatedContract: true,
    confiscatedPod: false,
  };
}

/** actions/combat.ts — tribute handed over instead of trading fire. NOTE: this
 *  event genuinely carries no `day` field. */
function tributePaid(amount: number): GameEvent {
  return { type: 'TributePaid', encounterId: 'enc-1', round: 2, amount, creditsRemaining: 1200 };
}

/** actions/crew.ts — a berth filled. */
function crewHired(): GameEvent {
  return {
    type: 'CrewEvent',
    day: 1,
    kind: 'hired',
    roleId: 'extra-die',
    cost: 800,
    berths: 2,
    crewCount: 1,
  };
}

/** storylets.ts — Smuggler Ray's fence choices crediting `ray_s_ledger`. */
function rayLedgerProgress(amount: number): GameEvent {
  return {
    type: 'StoryletDeedProgress',
    day: 1,
    storyletId: 'fence.ray.sealed-pod',
    choiceId: 'sell-it',
    deedId: 'ray_s_ledger',
    amount,
  };
}

function repeat(count: number, make: (index: number) => GameEvent): GameEvent[] {
  return Array.from({ length: count }, (_unused, index) => make(index + 1));
}

/** Run the REAL evaluator over a constructed batch on a fresh initial state, and
 *  return both the earned ids and the mutated state (for matchCounts checks). */
function runDeeds(
  events: readonly GameEvent[],
  seed = 1504,
): { state: ReturnType<typeof createInitialState>; earned: string[] } {
  const state = createInitialState(seed);
  const emitted = evaluateDeeds(state, events);
  return {
    state,
    earned: emitted.flatMap((event) => (event.type === 'DeedEarned' ? [event.deedId] : [])),
  };
}

function earnedFrom(events: readonly GameEvent[], seed = 1504): string[] {
  return runDeeds(events, seed).earned;
}

type DeedCase = { deedId: string; events: GameEvent[] };

/**
 * One row per NET-NEW deed: the smallest batch of real-shape events that should
 * earn it. Assertions use `toContain`, never `toEqual` — a single qualifying
 * event legitimately earns several deeds at once (a 300cr Dare win earns
 * `dare_first`, `dare_won` and `high_roller` in one batch), so equality would
 * make the table brittle for no gain.
 */
const NET_NEW_DEED_CASES: readonly DeedCase[] = [
  // --- gambling ------------------------------------------------------------
  { deedId: 'dare_first', events: [hangoutDare(25, false)] },
  { deedId: 'dare_won', events: [hangoutDare(50, true)] },
  { deedId: 'high_roller', events: [hangoutDare(250, true)] },
  { deedId: 'table_regular', events: repeat(5, () => hangoutDare(25, false)) },
  // --- smuggling -----------------------------------------------------------
  { deedId: 'contraband_run', events: [deliverCargo(3, 10, 900)] },
  { deedId: 'slipped_the_scan', events: [contrabandScan(false)] },
  { deedId: 'known_to_the_league', events: [contrabandScan(true)] },
  { deedId: 'run_seized', events: [contrabandConfiscated(250)] },
  { deedId: 'ray_s_ledger', events: [rayLedgerProgress(1)] },
  // --- lending -------------------------------------------------------------
  { deedId: 'first_marker', events: [loanBorrowed(1200)] },
  {
    deedId: 'paid_in_full',
    events: [
      {
        type: 'LoanEvent',
        day: 1,
        kind: 'repaid',
        amountPaid: 1250,
        outstanding: 0,
        cleared: true,
      },
    ],
  },
  {
    deedId: 'bad_paper',
    events: [{ type: 'LoanEvent', day: 1, kind: 'defaulted', outstanding: 900 }],
  },
  { deedId: 'deep_water', events: [loanBorrowed(5000)] },
  // --- exploration ---------------------------------------------------------
  { deedId: 'first_chart', events: [poiDiscovered(1, 'beacon')] },
  { deedId: 'derelict_boarder', events: [poiDiscovered(1, 'derelict')] },
  { deedId: 'beacon_chaser', events: [poiDiscovered(1, 'beacon')] },
  { deedId: 'cartographer', events: repeat(5, (index) => poiDiscovered(index, 'derelict')) },
  { deedId: 'rich_hulk', events: [salvageRecovered(400)] },
  // --- property ------------------------------------------------------------
  { deedId: 'port_authority', events: [portPurchase(1)] },
  { deedId: 'landlord', events: [portPurchase(1), portPurchase(2)] },
  { deedId: 'rentier', events: repeat(20, () => portIncome()) },
  // --- career headroom -----------------------------------------------------
  { deedId: 'signed_the_crew', events: [crewHired()] },
  { deedId: 'fat_manifest', events: [deliverCargo(3, 1, 5000)] },
  { deedId: 'rim_runner', events: [deliverCargo(15, 1, 900)] },
  { deedId: 'toll_paid', events: [tributePaid(300)] },
  { deedId: 'signal_hunter', events: [fragmentAcquired(1)] },
  { deedId: 'cold_case', events: repeat(3, (index) => fragmentAcquired(index)) },
  // --- T-147 · Liar's Dice set completion -----------------------------------
  // One row per port, plus the roster capstone. The PORT rows are fed a
  // `scope:'port'` event at their own systemId, which is also what proves the
  // `systemId` matcher is load-bearing: `liars_dice_grand_slam` is NOT in any of
  // their batches, and the negative direction is asserted below.
  { deedId: 'liars_dice_cleared_sun_3', events: [liarsDiceSetCleared('port', 1)] },
  { deedId: 'liars_dice_cleared_aldebaran_1', events: [liarsDiceSetCleared('port', 2)] },
  { deedId: 'liars_dice_cleared_altair_3', events: [liarsDiceSetCleared('port', 3)] },
  { deedId: 'liars_dice_cleared_arcturus_6', events: [liarsDiceSetCleared('port', 4)] },
  { deedId: 'liars_dice_cleared_deneb_4', events: [liarsDiceSetCleared('port', 5)] },
  { deedId: 'liars_dice_cleared_denebola_5', events: [liarsDiceSetCleared('port', 6)] },
  { deedId: 'liars_dice_cleared_fomalhaut_2', events: [liarsDiceSetCleared('port', 7)] },
  { deedId: 'liars_dice_cleared_mira_9', events: [liarsDiceSetCleared('port', 8)] },
  { deedId: 'liars_dice_cleared_pollux_7', events: [liarsDiceSetCleared('port', 9)] },
  { deedId: 'liars_dice_cleared_procyon_5', events: [liarsDiceSetCleared('port', 10)] },
  { deedId: 'liars_dice_cleared_regulus_6', events: [liarsDiceSetCleared('port', 11)] },
  { deedId: 'liars_dice_cleared_rigel_8', events: [liarsDiceSetCleared('port', 12)] },
  { deedId: 'liars_dice_cleared_spica_3', events: [liarsDiceSetCleared('port', 13)] },
  { deedId: 'liars_dice_cleared_vega_6', events: [liarsDiceSetCleared('port', 14)] },
  { deedId: 'liars_dice_grand_slam', events: [liarsDiceSetCleared('roster', 14)] },
];

/** The count-gated deeds, with the threshold RE-STATED here and cross-checked
 *  against content, so the bite tests below cannot go vacuous if a `gte` moves. */
const COUNT_DEED_CASES: readonly { deedId: string; gte: number; make: (i: number) => GameEvent }[] =
  [
    { deedId: 'table_regular', gte: 5, make: () => hangoutDare(25, false) },
    { deedId: 'cartographer', gte: 5, make: (i) => poiDiscovered(i, 'derelict') },
    { deedId: 'landlord', gte: 2, make: (i) => portPurchase(i) },
    { deedId: 'rentier', gte: 20, make: () => portIncome() },
    { deedId: 'cold_case', gte: 3, make: (i) => fragmentAcquired(i) },
    { deedId: 'ray_s_ledger', gte: 1, make: () => rayLedgerProgress(1) },
  ];

/** One pair per `gte` gate: the value one short must earn nothing, the gate
 *  value must earn. This is the only thing that catches a threshold that reads
 *  like a design decision but is never actually consulted. */
const BOUNDARY_CASES: readonly { deedId: string; below: GameEvent; at: GameEvent }[] = [
  { deedId: 'high_roller', below: hangoutDare(249, true), at: hangoutDare(250, true) },
  { deedId: 'deep_water', below: loanBorrowed(4999), at: loanBorrowed(5000) },
  { deedId: 'rich_hulk', below: salvageRecovered(399), at: salvageRecovered(400) },
  { deedId: 'fat_manifest', below: deliverCargo(3, 1, 4999), at: deliverCargo(3, 1, 5000) },
  { deedId: 'rim_runner', below: deliverCargo(14, 1, 900), at: deliverCargo(15, 1, 900) },
  { deedId: 'toll_paid', below: tributePaid(0), at: tributePaid(1) },
  { deedId: 'run_seized', below: contrabandConfiscated(0), at: contrabandConfiscated(1) },
];

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
      expect(
        allowed,
        `${deed.id}: eventType '${deed.trigger.eventType}' is not allowlisted`,
      ).toBeDefined();
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
    // task asked for. Every family the slate CLAIMS is named here, and the
    // smuggling clause requires BOTH routes (a patrol scan AND a Contraband
    // delivery) rather than either — a slate with only one of them would leave
    // half the verb unrepresented.
    const has = (predicate: (deed: (typeof DEEDS)[number]) => boolean): boolean =>
      DEEDS.some(predicate);
    const ofType = (eventType: string) => (deed: (typeof DEEDS)[number]) =>
      deed.trigger.eventType === eventType;

    expect(has(ofType('HangoutEvent')), 'no gambling deed').toBe(true);
    expect(has(ofType('LoanEvent')), 'no lending deed').toBe(true);
    expect(has(ofType('PortEvent')), 'no property deed').toBe(true);
    expect(has(ofType('CrewEvent')), 'no crew deed').toBe(true);
    expect(has(ofType('TributePaid')), 'no tribute deed').toBe(true);
    expect(has(ofType('FragmentAcquired')), 'no signal-fragment deed').toBe(true);
    expect(
      has(ofType('PoiDiscovered')) && has(ofType('SalvageRecovered')),
      'no exploration deed',
    ).toBe(true);
    expect(has(ofType('ContrabandScan')), 'no patrol-scan smuggling deed').toBe(true);
    expect(has(ofType('ContrabandConfiscated')), 'no seizure smuggling deed').toBe(true);
    expect(
      has(
        (deed) =>
          deed.trigger.eventType === 'TradeEvent' &&
          (deed.trigger.match ?? []).some((m) => m.path === 'cargoType' && m.equals === 10),
      ),
      'no Contraband-delivery smuggling deed',
    ).toBe(true);
  });

  it('every renown rank carries a distinct, non-empty citation', () => {
    const citations = RENOWN_RANK_ORDER.map((rank) => RENOWN_RANKS[rank].citation);
    for (const [index, rank] of RENOWN_RANK_ORDER.entries()) {
      expect(citations[index], `${rank} has no citation`).toBeTruthy();
      expect(citations[index].length).toBeGreaterThan(0);
      // T-1504c · The SHIPPED table checked by the same rule `validateRenownRanks`
      // enforces on any table: both readers (the rank-up WireEntry below, and
      // `deedRegistry().rankCitation` → the Records rank readout) print a rank
      // citation VERBATIM — no {day}-style substitution ever runs on it — so a
      // placeholder would ship literal braces to the player.
      expect(citations[index], `${rank}'s citation carries a {…} placeholder`).not.toMatch(/[{}]/);
    }
    expect(new Set(citations).size).toBe(RENOWN_RANK_ORDER.length);
    // The capstone line is pinned by T-1308 and must not drift.
    expect(RENOWN_RANKS.CONQUEROR.citation).toBe(
      'Registry seals the Conqueror rank: the frontier keeps one name now, and it is Player.',
    );
  });

  it('every allowlisted event/state path is named by at least one deed', () => {
    // The REVERSE of the guard above, and the half that keeps the allowlist
    // honest. `EVENT_PATHS` grants nothing on its own — an entry no deed names
    // is a receipt for a feature that does not exist, and it is exactly how a
    // "we support gambling deeds" claim survives with no gambling deed shipped.
    for (const eventType of Object.keys(EVENT_PATHS)) {
      expect(
        DEEDS.some((deed) => deed.trigger.eventType === eventType),
        `EVENT_PATHS['${eventType}'] is allowlisted but no deed names it`,
      ).toBe(true);
    }
    for (const statePath of STATE_PATHS) {
      expect(
        DEEDS.some((deed) => (deed.trigger.state ?? []).some((m) => m.path === statePath)),
        `STATE_PATHS '${statePath}' is allowlisted but no deed names it`,
      ).toBe(true);
    }
  });

  it('the per-deed trigger table covers exactly the net-new deed set', () => {
    // The anti-rot guard. Derive the net-new ids rather than listing them, so a
    // deed authored tomorrow lands in this set automatically and fails here
    // until it gets a trigger test — which is the acceptance criterion
    // ("every net-new deed has a unit test proving its trigger fires").
    const netNew = DEEDS.map((deed) => deed.id).filter((id) => !PRE_T1504_DEED_IDS.includes(id));
    expect(netNew.length).toBeGreaterThanOrEqual(13);
    expect(new Set(NET_NEW_DEED_CASES.map((testCase) => testCase.deedId))).toEqual(new Set(netNew));
    // ...and the frozen "before" list really is the 17 that shipped pre-T-1504.
    expect(PRE_T1504_DEED_IDS).toHaveLength(17);
    expect(DEEDS.filter((deed) => PRE_T1504_DEED_IDS.includes(deed.id))).toHaveLength(17);
  });

  it.each(NET_NEW_DEED_CASES)(
    'earns $deedId from a constructed qualifying state',
    ({ deedId, events }) => {
      // Each batch goes through the REAL evaluateDeeds on a REAL createInitialState
      // with event shapes copied from the resolvers — so a deed that matches a
      // field the emitter never sets fails here rather than shipping unearnable.
      expect(earnedFrom(events)).toContain(deedId);
    },
  );

  it.each(COUNT_DEED_CASES)(
    '$deedId does not fire until its count threshold is crossed',
    ({ deedId, gte, make }) => {
      // The threshold is pinned to content, so this cannot silently go vacuous.
      expect(DEEDS.find((deed) => deed.id === deedId)?.trigger.count?.gte).toBe(gte);

      const short = runDeeds(repeat(gte - 1, make));
      expect(short.earned).not.toContain(deedId);
      expect(short.state.player.registry.matchCounts[deedId] ?? 0).toBe(gte - 1);

      const exact = runDeeds(repeat(gte, make));
      expect(exact.earned.filter((id) => id === deedId)).toHaveLength(1);
      expect(exact.state.player.registry.matchCounts[deedId]).toBe(gte);
    },
  );

  it.each(BOUNDARY_CASES)('$deedId bites exactly at its gte gate', ({ deedId, below, at }) => {
    expect(earnedFrom([below])).not.toContain(deedId);
    expect(earnedFrom([at])).toContain(deedId);
  });

  it('refuses a Dare deed for a FAILED hangout action (no wager was ever laid)', () => {
    // The gambling deeds guard on `wager`/`playerWon` precisely because a
    // malformed or opponent-less VisitHangout still emits venue:'dare'. This is
    // the discriminating case: a fail event must earn nothing. It also pins
    // `matchesValue`'s closing `isComparableValue(value)` — an ABSENT field must
    // fail every matcher, which is what makes `wager: { gte: 0 }` an existence
    // guard rather than a no-op.
    expect(
      earnedFrom([{ type: 'HangoutEvent', day: 1, venue: 'dare', failReason: 'no-opponent' }]),
    ).toHaveLength(0);
  });

  it('T-147 · the two LiarsDiceSetCleared scopes are actually discriminated', () => {
    // Both families ride ONE event type, so `scope` is the only thing keeping a
    // port clear from paying out the whole-roster capstone. Asserted in BOTH
    // directions, because a missing matcher fails silently in only one of them.
    const port = earnedFrom([liarsDiceSetCleared('port', 1)]);
    expect(port).toContain('liars_dice_cleared_sun_3');
    expect(port).not.toContain('liars_dice_grand_slam');
    // ...and a port clear at Sol-3 earns no OTHER port's deed.
    expect(port.filter((id) => id.startsWith('liars_dice_cleared_'))).toEqual([
      'liars_dice_cleared_sun_3',
    ]);

    const roster = earnedFrom([liarsDiceSetCleared('roster', 14)]);
    expect(roster).toContain('liars_dice_grand_slam');
    expect(roster.filter((id) => id.startsWith('liars_dice_cleared_'))).toEqual([]);
  });

  it('files no citation for any typed-fail event', () => {
    // Every new-verb resolver emits a typed `kind: 'failed'` / `failReason` event
    // on malformed player input instead of throwing, so these are emitted often.
    // None of them may ever earn a deed.
    expect(
      earnedFrom([{ type: 'LoanEvent', day: 1, kind: 'failed', failReason: 'no-loan' }]),
    ).toHaveLength(0);
    expect(
      earnedFrom([{ type: 'PortEvent', day: 1, kind: 'failed', failReason: 'no-die' }]),
    ).toHaveLength(0);
    expect(
      earnedFrom([{ type: 'CrewEvent', day: 1, kind: 'failed', failReason: 'no-berth' }]),
    ).toHaveLength(0);
  });

  it('a new-verb registry survives JSON round-trip and rebuilds from a raw log', () => {
    // No NEW GameState field is introduced by the T-1504a slate — `registry.earned`
    // and `registry.matchCounts` already exist and already migrate — so there is no
    // migration to add. What IS new is the set of event types feeding them, so this
    // drives a new-verb registry (including a 20-deep matchCounts entry) through the
    // zod schema and back, and then rebuilds the same counts from the raw log, which
    // is the path save-compat actually uses.
    const state = createInitialState(15040);
    const source: GameEvent[] = [hangoutDare(300, true), ...repeat(20, () => portIncome())];
    const emitted = evaluateDeeds(state, source);
    state.eventLog.push(...source, ...emitted);

    const earnedIds = state.player.registry.earned.map((deed) => deed.id);
    expect(earnedIds).toContain('high_roller');
    expect(earnedIds).toContain('rentier');
    expect(state.player.registry.matchCounts['rentier']).toBe(20);

    const restored = deserializeState(serializeState(state));

    expect(restored.player.registry).toEqual(state.player.registry);
    // The reconstruct-from-raw-log path agrees with the incrementally cached counts.
    expect(computeMatchCounts(restored.eventLog)).toEqual(state.player.registry.matchCounts);
  });
});

// ---------------------------------------------------------------------------
// T-1504a · Content validation. `defineDeeds` runs at module import, so a
// malformed slate fails the BUILD rather than a test — these fixtures prove each
// rule actually rejects, and the positive case proves the shipped slate passes.
// ---------------------------------------------------------------------------
describe('T-1504a deed content validation', () => {
  function fixtureDeed(overrides: Partial<DeedDefinition> = {}): DeedDefinition {
    return {
      id: 'fixture_deed',
      title: 'Fixture Deed',
      citationTemplate: 'On day {day}, a fixture happened.',
      trigger: { eventType: 'TradeEvent', match: [{ path: 'success', equals: true }] },
      ...overrides,
    };
  }

  it('the shipped slate loads and validates with zero errors', () => {
    // The literal "≥30 deeds load and validate" acceptance, asserted rather than
    // implied by the fact that the import didn't blow up.
    expect(validateDeeds(DEEDS)).toEqual([]);
    expect(DEEDS.length).toBeGreaterThanOrEqual(30);
  });

  it('rejects a duplicated deed id', () => {
    expect(() => defineDeeds([fixtureDeed(), fixtureDeed()])).toThrow(/duplicated/);
  });

  it('rejects an empty title', () => {
    expect(() => defineDeeds([fixtureDeed({ title: '' })])).toThrow(/title must be a non-empty/);
  });

  it('rejects a citation template with no {day} placeholder', () => {
    expect(() => defineDeeds([fixtureDeed({ citationTemplate: 'Something happened.' })])).toThrow(
      /must contain the \{day\} placeholder/,
    );
  });

  it('rejects a matcher with no condition at all', () => {
    expect(() =>
      defineDeeds([
        fixtureDeed({ trigger: { eventType: 'TradeEvent', match: [{ path: 'payment' }] } }),
      ]),
    ).toThrow(/must define at least one condition/);
  });

  it('rejects a non-integer threshold', () => {
    expect(() =>
      defineDeeds([
        fixtureDeed({
          trigger: { eventType: 'TradeEvent', match: [{ path: 'payment', gte: 1.5 }] },
        }),
      ]),
    ).toThrow(/gte must be a finite integer/);
  });

  it('rejects a count threshold below 1', () => {
    expect(() =>
      defineDeeds([fixtureDeed({ trigger: { eventType: 'TradeEvent', count: { gte: 0 } } })]),
    ).toThrow(/count.gte must be at least 1/);
  });

  it('rejects a StoryletDeedProgress deed with no count (it could never be earned)', () => {
    // READER of this rule: the `deed.trigger.count ? storyletProgress.get(deed.id) : []`
    // branch in evaluateDeeds — without a count that branch never runs and
    // matchesEvent hard-returns false for the event type, so the deed is dead.
    expect(() =>
      defineDeeds([fixtureDeed({ trigger: { eventType: 'StoryletDeedProgress' } })]),
    ).toThrow(/count is required for a StoryletDeedProgress deed/);
  });

  it('rejects a StoryletDeedProgress deed carrying a match (the engine never event-matches it)', () => {
    expect(() =>
      defineDeeds([
        fixtureDeed({
          trigger: {
            eventType: 'StoryletDeedProgress',
            count: { gte: 1 },
            match: [{ path: 'amount', gte: 1 }],
          },
        }),
      ]),
    ).toThrow(/match is not supported for a StoryletDeedProgress deed/);
  });

  it('rejects a storylet deedProgress aimed at a deed the engine cannot credit', () => {
    // The other half of the same wire, on the storylet side: naming a REAL deed
    // is not enough — it must be a counted StoryletDeedProgress deed, or the
    // emitted progress event advances nothing.
    // Otherwise-valid in every other respect, so the only thing under test is the
    // deedProgress rule.
    const storylet = (deedId: string) => [
      {
        id: 'fixture.deed-wire',
        title: 'Fixture',
        prose: 'x',
        trigger: { systemIds: [1] },
        choices: [
          {
            id: 'go',
            label: 'Go',
            prose: 'p',
            effects: { deedProgress: [{ deedId, amount: 1 }] },
          },
          { id: 'pass', label: 'Pass', prose: 'p' },
        ],
      },
    ];

    expect(() => defineStorylets(storylet('first_manifest'))).toThrow(
      /must name a counted StoryletDeedProgress deed/,
    );
    // The positive control: a genuine storylet-fed deed is accepted.
    expect(() => defineStorylets(storylet('ray_s_ledger'))).not.toThrow();
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

// ---------------------------------------------------------------------------
// N11 · THE DEED MACHINERY IS ACTOR-SHAPED.
//
// The standing constraint's whole point, tested at the seam it turns on: there is
// ONE `accrueDeeds`, and a captain goes through it. The four cases below are chosen
// to be exactly the four the reverted attempt (`7334c5d5`) got wrong — a private
// evaluator, a skipped `state` matcher, an un-applied CONQUEROR cap, and a rank
// derived somewhere other than `rankForDeedCount`.
// ---------------------------------------------------------------------------
describe('N11 · the deed machinery is actor-shaped', () => {
  /** A live captain record, seeded exactly as `createInitialState` seeds one. */
  function captain(profileId = 'npc-cargo-king'): NpcState {
    const profile = ALL_NPC_PROFILES.find((p) => p.id === profileId)!;
    return {
      id: profile.id,
      name: profile.name,
      profileId: profile.id,
      currentSystemId: 1,
      credits: 5000,
      ship: npcShipForProfile(profile),
      registry: emptyDeedRegistry(),
      disposition: 0,
    };
  }

  /** A captain's delivery, in the shape `npc.ts` `executeTrade` emits. */
  function deliverEvent(characterId: string): GameEvent {
    return {
      type: 'TradeEvent',
      characterId,
      action: 'deliver-cargo',
      success: true,
      destination: 2,
      cargoType: 1,
      payment: 900,
      actionDetails: 'Delivered cargo! Earned 900 credits.',
    };
  }

  /** An arrival, in the shape `npc.ts` emits on a completed jump. */
  function arriveEvent(characterId: string, destination = 2): GameEvent {
    return {
      type: 'TravelEvent',
      characterId,
      origin: 1,
      destination,
      fuelUsed: 40,
      success: true,
    };
  }

  it("writes the ACTOR's registry and leaves the player's untouched", () => {
    const state = createInitialState(4);
    const npc = captain();

    const emitted = accrueDeeds(npc, [deliverEvent(npc.id)], {
      day: 7,
      conquerorLocked: false,
    });

    // The captain earned it, through the same content definition the player uses.
    expect(npc.registry.earned.map((deed) => deed.id)).toContain('first_delivery');
    expect(npc.registry.matchCounts.first_delivery).toBe(1);
    expect(npc.registry.renownRank).toBe(rankForDeedCount(npc.registry.earned.length));
    // …and the player, who did nothing, holds nothing.
    expect(state.player.registry.earned).toEqual([]);
    expect(state.player.registry.matchCounts).toEqual({});
    // The events come back for the CALLER to decide about; nothing is pushed to a
    // log by the accrual itself.
    expect(emitted.some((event) => event.type === 'DeedEarned')).toBe(true);
    expect(state.eventLog).toEqual([]);
  });

  it('records no eventIndex when the batch is local (no sourceStartIndex)', () => {
    const npc = captain();
    accrueDeeds(npc, [deliverEvent(npc.id)], { day: 3, conquerorLocked: false });
    // The reverted attempt stuffed `eventIndex: 0` here. There is no index into a
    // log that does not contain the event, so the field is absent.
    expect(npc.registry.earned.every((deed) => deed.eventIndex === undefined)).toBe(true);
    expect(npc.registry.earned[0].day).toBe(3);
  });

  it("the `state` matcher reads the ACTOR's tank — fuel_fumes_arrival is earnable by a captain", () => {
    // The deed the reverted attempt skipped outright, which made every `state`-gated
    // deed strictly EASIER for an NPC than for the player.
    const onFumes = captain();
    onFumes.ship.fuel = 20;
    accrueDeeds(onFumes, [arriveEvent(onFumes.id)], { day: 5, conquerorLocked: false });
    expect(onFumes.registry.earned.map((deed) => deed.id)).toContain('fuel_fumes_arrival');

    // Same actor, same event, a full tank: the matcher refuses it.
    const fullTank = captain();
    fullTank.ship.fuel = fullTank.ship.maxFuel;
    accrueDeeds(fullTank, [arriveEvent(fullTank.id)], { day: 5, conquerorLocked: false });
    expect(fullTank.registry.earned.map((deed) => deed.id)).not.toContain('fuel_fumes_arrival');
    // …but the un-gated arrival deed still lands, so the refusal is the matcher and
    // not a dead path.
    expect(fullTank.registry.earned.map((deed) => deed.id)).toContain('first_jump');
  });

  it('the CONQUEROR ceiling applies to a captain exactly as to the player', () => {
    // The mirror of `demo.test.ts`'s player case: CONQUEROR's threshold is 38, so 37
    // synthetic deeds plus one real one is exactly the crossing.
    const npc = captain();
    npc.registry.earned = syntheticEarned(37);
    npc.registry.renownRank = 'GIGA_HERO';

    const emitted = accrueDeeds(npc, [deliverEvent(npc.id)], {
      day: 9,
      conquerorLocked: true,
    });

    // The deed IS earned — the lock is on the RANK, not on playing the game.
    expect(npc.registry.earned).toHaveLength(38);
    expect(npc.registry.renownRank).toBe('GIGA_HERO');
    expect(
      emitted.filter((event) => event.type === 'RenownRankUp' && event.newRank === 'CONQUEROR'),
    ).toHaveLength(0);
  });

  it('a captain at the same deed count on a FULL licence reaches CONQUEROR (the control)', () => {
    const npc = captain();
    npc.registry.earned = syntheticEarned(37);
    npc.registry.renownRank = 'GIGA_HERO';
    accrueDeeds(npc, [deliverEvent(npc.id)], { day: 9, conquerorLocked: false });
    expect(npc.registry.renownRank).toBe('CONQUEROR');
  });

  it('emptyDeedRegistry derives its rank through rankForDeedCount, not a literal', () => {
    const registry = emptyDeedRegistry();
    expect(registry).toEqual({ earned: [], renownRank: rankForDeedCount(0), matchCounts: {} });
    expect(registry.renownRank).toBe('LIEUTENANT');
    // Two calls hand back independent objects — three sites seed from this and none
    // of them may share a shell.
    expect(emptyDeedRegistry().earned).not.toBe(registry.earned);
  });

  it('the player satisfies DeedActor structurally, with no wrapper', () => {
    // The `ShipyardActor` argument restated as a test: if this ever needs an adapter,
    // the write would land on a copy and the registry would silently stop growing.
    const state = createInitialState(11);
    const playerActor: DeedActor = state.player;
    const npcActor: DeedActor = captain();
    expect(playerActor.registry).toBe(state.player.registry);
    expect(npcActor.registry.earned).toEqual([]);
  });

  it('evaluateDeeds is a wrapper: it still stamps the player row with a real eventIndex', () => {
    const state = createInitialState(12);
    state.eventLog.push({ type: 'DayAdvanced', day: 1 });
    evaluateDeeds(state, [deliverEvent('player')]);
    const earned = state.player.registry.earned.find((deed) => deed.id === 'first_delivery');
    expect(earned?.eventIndex).toBe(1);
  });
});
