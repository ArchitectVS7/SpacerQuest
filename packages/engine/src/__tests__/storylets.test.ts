import { describe, expect, it } from 'vitest';
import { STORYLETS, Stat, defineStorylets } from '@spacerquest/content';
import { applyPlayerAction, endDay, startDay } from '../day.js';
import {
  eligibleStorylets,
  refreshAvailableStorylets,
  resolveStoryletChoice,
} from '../storylets.js';
import { SeededRng } from '../rng.js';
import { createInitialState, deserializeState, serializeState } from '../state.js';
import { DayPhase, GameState } from '../types.js';

function readyState(): GameState {
  const state = createInitialState(110);
  state.dayPhase = DayPhase.DAY;
  state.player.dawnHand = { dice: [20, 12, 6, 3, 1], spent: [false, false, false, false, false] };
  return state;
}

describe('storylet content validation', () => {
  it('accepts exported STORYLETS', () => {
    expect(STORYLETS.map((storylet) => storylet.id)).toEqual([
      'cargo.medicinals.quarantine-seal',
      'port.sun3.guild-auditor',
      'chain.doc-salvage.distress-ping',
      'chain.doc-salvage.follow-up',
    ]);
  });

  it('throws loudly for malformed data', () => {
    expect(() =>
      defineStorylets([
        {
          id: 'bad.storylet',
          title: 'Bad',
          prose: 'Bad data.',
          trigger: { systemIds: [999] },
          choices: [{ id: 'only', label: 'Only', prose: 'One choice.' }],
        },
        {
          id: 'bad.storylet',
          title: 'Duplicate',
          prose: 'Bad data.',
          trigger: { scheduledOnly: true },
          choices: [
            { id: 'a', label: 'A', prose: 'A.' },
            { id: 'a', label: 'A again', prose: 'A again.' },
          ],
        },
      ]),
    ).toThrow(/Invalid storylet content:\n - .*duplicated/s);
  });
});

describe('storylet engine', () => {
  it('finds and resolves the cargo demo headlessly', () => {
    const state = readyState();
    state.player.currentSystemId = 2;
    state.player.activeContract = { destination: 7, cargoType: 4, payment: 3000, pods: 10 };

    const refreshed = refreshAvailableStorylets(state);

    expect(refreshed.state.storylets.available.map((offer) => offer.storyletId)).toEqual([
      'cargo.medicinals.quarantine-seal',
    ]);
    const offer = refreshed.state.storylets.available[0];
    expect(offer?.title).toBe('Quarantine Seal');
    expect(offer?.prose).toContain('quarantine seal');
    expect(offer?.choices).toEqual([
      expect.objectContaining({
        id: 'inspect',
        label: 'Inspect the seal',
        requirements: { statCheck: { stat: Stat.GRIT, dc: 11 } },
      }),
      expect.objectContaining({ id: 'leave', label: 'Leave it alone' }),
    ]);
    expect(refreshed.events).toEqual([
      {
        type: 'StoryletOffered',
        day: 1,
        storyletId: 'cargo.medicinals.quarantine-seal',
        scheduled: false,
      },
    ]);

    const resolved = resolveStoryletChoice(
      refreshed.state,
      {
        type: 'Storylet',
        storyletId: 'cargo.medicinals.quarantine-seal',
        choiceId: 'inspect',
        spendDie: 0,
      },
      new SeededRng(1),
    );

    expect(resolved.state.player.credits).toBe(1250);
    expect(resolved.state.flags['cargo.medicinals.seal_verified']).toBe(true);
    expect(resolved.state.player.dawnHand?.spent[0]).toBe(true);
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'StatCheck',
        stat: Stat.GRIT,
        actionContext: 'storylet',
      }),
    );
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'StoryletChoiceResolved',
        storyletId: 'cargo.medicinals.quarantine-seal',
        choiceId: 'inspect',
        success: true,
      }),
    );
  });

  it('offers the Sun-3 port storylet and applies credits, flags, and checks', () => {
    const state = readyState();
    const dawn = startDay(createInitialState(110));

    expect(dawn.state.storylets.available.map((offer) => offer.storyletId)).toContain(
      'port.sun3.guild-auditor',
    );

    state.player.currentSystemId = 1;
    const refreshed = refreshAvailableStorylets(state);
    const result = applyPlayerAction(refreshed.state, {
      type: 'Storylet',
      storyletId: 'port.sun3.guild-auditor',
      choiceId: 'argue',
      spendDie: 0,
    });

    expect(result.state.player.credits).toBe(1050);
    expect(result.state.flags['port.sun3.audit_outargued']).toBe(true);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'StatCheck',
        stat: Stat.GUILE,
        actionContext: 'storylet',
      }),
    );
  });

  it('schedules a chained follow-up due the next day and resolves its effects', () => {
    let state = readyState();
    state.player.currentSystemId = 1;
    state = refreshAvailableStorylets(state).state;

    const initial = applyPlayerAction(state, {
      type: 'Storylet',
      storyletId: 'chain.doc-salvage.distress-ping',
      choiceId: 'answer',
    });

    expect(initial.events).toContainEqual({
      type: 'StoryletScheduled',
      day: 1,
      storyletId: 'chain.doc-salvage.distress-ping',
      choiceId: 'answer',
      scheduledStoryletId: 'chain.doc-salvage.follow-up',
      dueDay: 2,
    });

    const dusk = endDay(initial.state);
    const nextDawn = startDay(dusk.state);

    expect(nextDawn.state.storylets.available.map((offer) => offer.storyletId)).toContain(
      'chain.doc-salvage.follow-up',
    );

    const resolved = applyPlayerAction(nextDawn.state, {
      type: 'Storylet',
      storyletId: 'chain.doc-salvage.follow-up',
      choiceId: 'accept-thanks',
    });

    const doc = resolved.state.npcs.find((npc) => npc.id === 'npc-doc-salvage');
    expect(resolved.state.player.credits).toBe(1125);
    expect(doc?.disposition).toBe(2);
    expect(resolved.events).toContainEqual({
      type: 'StoryletDeedProgress',
      day: 2,
      storyletId: 'chain.doc-salvage.follow-up',
      choiceId: 'accept-thanks',
      deedId: 'beacon_keeper',
      amount: 1,
    });
    // The deedProgress wire is real: the count deed advances and earns.
    expect(resolved.state.player.registry.matchCounts['beacon_keeper']).toBe(1);
    expect(resolved.events).toContainEqual(
      expect.objectContaining({ type: 'DeedEarned', deedId: 'beacon_keeper' }),
    );
    expect(resolved.state.player.registry.earned.map((deed) => deed.id)).toContain('beacon_keeper');
  });

  it('keeps deterministic eligibility in content order', () => {
    const state = readyState();
    state.player.currentSystemId = 1;
    state.player.activeContract = { destination: 7, cargoType: 4, payment: 3000, pods: 10 };

    expect(eligibleStorylets(state).map((offer) => offer.storyletId)).toEqual([
      'cargo.medicinals.quarantine-seal',
      'port.sun3.guild-auditor',
      'chain.doc-salvage.distress-ping',
    ]);
  });

  it('blocks insufficient credits without spending a die', () => {
    const state = readyState();
    state.player.currentSystemId = 1;
    state.player.credits = 50;
    const refreshed = refreshAvailableStorylets(state);

    const result = resolveStoryletChoice(
      refreshed.state,
      {
        type: 'Storylet',
        storyletId: 'port.sun3.guild-auditor',
        choiceId: 'pay',
        spendDie: 0,
      },
      new SeededRng(1),
    );

    expect(result.events).toEqual([
      {
        type: 'StoryletChoiceBlocked',
        day: 1,
        storyletId: 'port.sun3.guild-auditor',
        choiceId: 'pay',
        reason: 'insufficient-credits',
      },
    ]);
    expect(result.state.player.dawnHand?.spent[0]).toBe(false);
    expect(result.state.player.credits).toBe(50);
  });

  it('preserves flags, schedules, completion, and NPC disposition through serialization', () => {
    const state = createInitialState(110);
    state.flags['test.flag'] = true;
    state.storylets.completed['port.sun3.guild-auditor'] = 1;
    state.storylets.scheduled.push({
      storyletId: 'chain.doc-salvage.follow-up',
      dueDay: 2,
      sourceStoryletId: 'chain.doc-salvage.distress-ping',
      sourceChoiceId: 'answer',
    });
    state.npcs[0].disposition = -2;

    const restored = deserializeState(serializeState(state));

    expect(restored.flags).toEqual(state.flags);
    expect(restored.storylets).toEqual(state.storylets);
    expect(restored.npcs[0].disposition).toBe(-2);
  });
});
