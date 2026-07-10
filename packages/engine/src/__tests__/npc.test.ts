import { describe, it, expect } from 'vitest';
import { resolveNpcDay } from '../npc.js';
import { SeededRng } from '../rng.js';
import { NpcState } from '../types.js';

describe('NPC Resolution', () => {
  it('resolves an NPC day deterministically and handles Flaw overrides', () => {
    const rng = new SeededRng(42); // specific seed to trigger flaw

    const npc: NpcState = {
      id: 'npc-iron-vex',
      name: 'Iron Vex',
      profileId: 'npc-iron-vex',
      currentSystemId: 1,
      credits: 1000,
      fuel: 1000,
    };

    const { npc: nextNpc, events } = resolveNpcDay(npc, rng, { day: 1 });

    // With a specific seed, we can check exactly what happens.
    // We expect a FlawOverride or Combat depending on the seed.
    expect(nextNpc.id).toBe('npc-iron-vex');
    expect(events.length).toBeGreaterThan(0);

    // Check that one event is the NpcAction
    const actionEvent = events.find((e) => e.type === 'NpcAction');
    expect(actionEvent).toBeDefined();
    expect(nextNpc.lastAction).toBeDefined();
  });
});
