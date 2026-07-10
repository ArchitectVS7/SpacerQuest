import { describe, expect, it } from 'vitest';
import { DEEDS } from '@spacerquest/content';
import { evaluateDeeds, rankForDeedCount } from '../deeds.js';
import { createInitialState, deserializeState, serializeState } from '../state.js';
import { GameEvent } from '../types.js';

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
      { type: 'WireEntry', day: 1, message: 'Registry confirms Player as Commander.' },
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

  it('advances renown by deed count, not score', () => {
    const state = createInitialState(4);
    state.player.score = 9999;

    expect(state.player.registry.renownRank).toBe('LIEUTENANT');
    expect(rankForDeedCount(0)).toBe('LIEUTENANT');

    evaluateDeeds(state, [signContractEvent()]);

    expect(state.player.registry.renownRank).toBe('COMMANDER');
    expect(rankForDeedCount(2)).toBe('CAPTAIN');
    expect(rankForDeedCount(3)).toBe('COMMODORE');
    expect(rankForDeedCount(4)).toBe('COMMODORE');
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
});
