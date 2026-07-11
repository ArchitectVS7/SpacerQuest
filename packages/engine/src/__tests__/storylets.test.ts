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
      'guild.pressure.tour-one.day10',
      'guild.pressure.tour-one.day20',
      'guild.pressure.tour-one.day25',
      'wise-one.polaris.signal-hook',
      'sage.mizar.decode-first',
      'derelict.sealed-pod',
      'resolution.tour-one.cleared',
      'resolution.tour-one.unpaid',
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

  it('reports the ACTUAL clamped disposition delta, not the requested one', () => {
    let state = readyState();
    state.player.currentSystemId = 1;
    state = refreshAvailableStorylets(state).state;

    const initial = applyPlayerAction(state, {
      type: 'Storylet',
      storyletId: 'chain.doc-salvage.distress-ping',
      choiceId: 'answer',
    });
    const nextDawn = startDay(endDay(initial.state).state);

    // Doc already adores the player: +9, one step below the clamp ceiling.
    // The follow-up's +2 effect can only land 1 of it.
    nextDawn.state.npcs.find((npc) => npc.id === 'npc-doc-salvage')!.disposition = 9;

    const resolved = applyPlayerAction(nextDawn.state, {
      type: 'Storylet',
      storyletId: 'chain.doc-salvage.follow-up',
      choiceId: 'accept-thanks',
    });

    const doc = resolved.state.npcs.find((npc) => npc.id === 'npc-doc-salvage');
    expect(doc?.disposition).toBe(10);
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'StoryletEffectApplied',
        effect: 'disposition',
        npcId: 'npc-doc-salvage',
        amount: 1,
      }),
    );
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'DispositionChanged',
        npcId: 'npc-doc-salvage',
        delta: 1,
        disposition: 10,
        reason: 'storylet',
      }),
    );
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

describe('T-113a Tour One guild pressure and Wise One hook', () => {
  it('surfaces each guild beat and the Wise One hook only on its target day', () => {
    // Guild wires follow the captain anywhere, so location is irrelevant for the
    // three pressure beats; the Wise One hook is gated to Polaris-1 (system 17).
    const beats: Array<{ day: number; systemId: number; id: string }> = [
      { day: 10, systemId: 2, id: 'guild.pressure.tour-one.day10' },
      { day: 20, systemId: 2, id: 'guild.pressure.tour-one.day20' },
      { day: 25, systemId: 2, id: 'guild.pressure.tour-one.day25' },
      { day: 30, systemId: 17, id: 'wise-one.polaris.signal-hook' },
    ];

    for (const beat of beats) {
      const state = readyState();
      state.day = beat.day;
      state.player.currentSystemId = beat.systemId;

      const eligible = eligibleStorylets(state).map((offer) => offer.storyletId);
      expect(eligible).toContain(beat.id);

      // Not eligible the day before or the day after — day-triggered, deterministic.
      const early = readyState();
      early.day = beat.day - 1;
      early.player.currentSystemId = beat.systemId;
      expect(eligibleStorylets(early).map((o) => o.storyletId)).not.toContain(beat.id);

      const late = readyState();
      late.day = beat.day + 1;
      late.player.currentSystemId = beat.systemId;
      expect(eligibleStorylets(late).map((o) => o.storyletId)).not.toContain(beat.id);
    }
  });

  it('gates the Wise One hook to Polaris-1', () => {
    const away = readyState();
    away.day = 30;
    away.player.currentSystemId = 1; // Sun-3, not Polaris-1
    expect(eligibleStorylets(away).map((o) => o.storyletId)).not.toContain(
      'wise-one.polaris.signal-hook',
    );
  });

  it('grants the first Signal fragment flag when the hook is bought at Polaris-1', () => {
    const state = readyState();
    state.day = 30;
    state.player.currentSystemId = 17;
    state.player.credits = 5000;

    const refreshed = refreshAvailableStorylets(state);
    expect(refreshed.state.storylets.available.map((o) => o.storyletId)).toContain(
      'wise-one.polaris.signal-hook',
    );

    const resolved = resolveStoryletChoice(
      refreshed.state,
      {
        type: 'Storylet',
        storyletId: 'wise-one.polaris.signal-hook',
        choiceId: 'buy-fragment',
      },
      new SeededRng(1),
    );

    expect(resolved.state.flags['signal.fragment.wise-one-01']).toBe(true);
    expect(resolved.state.player.credits).toBe(4500);
    // T-111b: the hook now grants a REAL fragment into the Nemesis file.
    expect(resolved.state.player.nemesisFile.fragments.map((f) => f.fragmentId)).toEqual([
      'frag-nemesis-01',
    ]);
    expect(resolved.state.player.nemesisFile.fragments[0].decoded).toBe(false);
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'FragmentAcquired',
        fragmentId: 'frag-nemesis-01',
        source: 'wise-one',
        fragmentCount: 1,
      }),
    );
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'StoryletChoiceResolved',
        storyletId: 'wise-one.polaris.signal-hook',
        choiceId: 'buy-fragment',
      }),
    );
  });
});

describe('T-111b Nemesis Signal — fragment brokers', () => {
  it('the Sage of Mizar-9 decodes the Wise One fragment into lore', () => {
    // Hold the Wise One fragment (undecoded); dock at Mizar-9 (system 18).
    const state = readyState();
    state.player.currentSystemId = 18;
    state.player.nemesisFile.fragments.push({
      fragmentId: 'frag-nemesis-01',
      source: 'wise-one',
      day: 1,
      decoded: false,
    });

    const refreshed = refreshAvailableStorylets(state);
    // The Sage surfaces only because there is an undecoded fragment to decode.
    expect(refreshed.state.storylets.available.map((o) => o.storyletId)).toContain(
      'sage.mizar.decode-first',
    );

    const resolved = resolveStoryletChoice(
      refreshed.state,
      { type: 'Storylet', storyletId: 'sage.mizar.decode-first', choiceId: 'decode' },
      new SeededRng(1),
    );

    const fragment = resolved.state.player.nemesisFile.fragments.find(
      (f) => f.fragmentId === 'frag-nemesis-01',
    );
    expect(fragment?.decoded).toBe(true);
    expect(resolved.events).toContainEqual(
      expect.objectContaining({ type: 'FragmentDecoded', fragmentId: 'frag-nemesis-01' }),
    );
    expect(resolved.events).toContainEqual(
      expect.objectContaining({ effect: 'fragment-decoded', fragmentId: 'frag-nemesis-01' }),
    );
    // Fragment count is unchanged by decoding — it upgrades, never adds.
    expect(resolved.state.player.nemesisFile.fragments).toHaveLength(1);
  });

  it('the Sage does not surface without an undecoded fragment to decode', () => {
    const away = readyState();
    away.player.currentSystemId = 18; // at Mizar-9, but nemesisFile is empty
    expect(eligibleStorylets(away).map((o) => o.storyletId)).not.toContain(
      'sage.mizar.decode-first',
    );

    // Already decoded → no longer eligible either.
    const decoded = readyState();
    decoded.player.currentSystemId = 18;
    decoded.player.nemesisFile.fragments.push({
      fragmentId: 'frag-nemesis-01',
      source: 'wise-one',
      day: 1,
      decoded: true,
    });
    expect(eligibleStorylets(decoded).map((o) => o.storyletId)).not.toContain(
      'sage.mizar.decode-first',
    );
  });

  it('the derelict sealed-pod storylet is playable headless and grants loot', () => {
    // The Explore loot roll arms the storylet by setting the pending flag.
    const state = readyState();
    state.flags['signal.contraband.pending'] = true;
    state.player.credits = 1000;

    const refreshed = refreshAvailableStorylets(state);
    expect(refreshed.state.storylets.available.map((o) => o.storyletId)).toContain(
      'derelict.sealed-pod',
    );

    const resolved = resolveStoryletChoice(
      refreshed.state,
      { type: 'Storylet', storyletId: 'derelict.sealed-pod', choiceId: 'take' },
      new SeededRng(1),
    );

    // Loot: real credits, the carrying flag, and the pending flag cleared.
    expect(resolved.state.player.credits).toBe(1300);
    expect(resolved.state.flags['signal.contraband.carrying']).toBe(true);
    expect(resolved.state.flags['signal.contraband.pending']).toBeUndefined();
    expect(resolved.events).toContainEqual(
      expect.objectContaining({ type: 'StoryletEffectApplied', effect: 'credits', amount: 300 }),
    );
  });
});
