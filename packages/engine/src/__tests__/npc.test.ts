import { describe, it, expect } from 'vitest';
import { IDEAL_WEIGHTS, NPC_PROFILES, distance } from '@spacerquest/content';
import { applyDisposition, npcDrives, resolveNpcDay } from '../npc.js';
import { jumpFuelCost } from '../economy.js';
import { createInitialState } from '../state.js';
import { SeededRng } from '../rng.js';
import { GameEvent, NpcState } from '../types.js';

function npcFor(profileId: string, overrides: Partial<NpcState> = {}): NpcState {
  const profile = NPC_PROFILES.find((p) => p.id === profileId)!;
  return {
    id: profile.id,
    name: profile.name,
    profileId: profile.id,
    currentSystemId: 1,
    credits: 5000,
    fuel: 1000,
    disposition: 0,
    ...overrides,
  };
}

const NO_BOARD = { day: 1, claimableBoard: null, eraEvent: null };

describe('NPC Resolution', () => {
  it('resolves an NPC day deterministically and handles Flaw overrides', () => {
    const first = resolveNpcDay(npcFor('npc-iron-vex'), new SeededRng(42), NO_BOARD);
    const second = resolveNpcDay(npcFor('npc-iron-vex'), new SeededRng(42), NO_BOARD);

    expect(second.npc).toEqual(first.npc);
    expect(second.events).toEqual(first.events);

    expect(first.npc.id).toBe('npc-iron-vex');
    expect(first.events.length).toBeGreaterThan(0);
    expect(first.events.find((e) => e.type === 'NpcAction')).toBeDefined();
    expect(first.npc.lastAction).toBeDefined();
  });

  it('has an intent weight entry for every distinct Ideal in the cast', () => {
    for (const profile of NPC_PROFILES) {
      expect(
        IDEAL_WEIGHTS[profile.ideal],
        `missing weights for Ideal "${profile.ideal}"`,
      ).toBeDefined();
    }
  });

  it('never lets an NPC spend credits or fuel it does not have', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { npc } = resolveNpcDay(
        npcFor('npc-lucky-seven', { credits: 30, fuel: 5 }),
        new SeededRng(seed),
        NO_BOARD,
      );
      expect(npc.credits).toBeGreaterThanOrEqual(0);
      expect(npc.fuel).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Intent weights steer behavior (property, 300 seeds)', () => {
  function actionRates(profileId: string): Record<string, number> {
    const counts: Record<string, number> = {};
    const seeds = 300;
    for (let seed = 1; seed <= seeds; seed++) {
      const { npc } = resolveNpcDay(npcFor(profileId), new SeededRng(seed), NO_BOARD);
      const type = npc.lastAction!.type;
      counts[type] = (counts[type] ?? 0) + 1;
    }
    const rates: Record<string, number> = {};
    for (const [type, count] of Object.entries(counts)) {
      rates[type] = count / seeds;
    }
    return rates;
  }

  it('Cargo King (Wealth, TRADE 5) trades far more often than he fights', () => {
    const rates = actionRates('npc-cargo-king');
    expect(rates['Trade'] ?? 0).toBeGreaterThan(rates['Combat'] ?? 0);
    expect(rates['Trade'] ?? 0).toBeGreaterThan(0.5);
  });

  it('Iron Vex (Dominance, GUNS 4) fights far more often than he trades', () => {
    // Bloodthirsty (dc 14) overrides many combat days outright, so the
    // resolved Combat rate is deflated — the property still holds by a wide
    // margin: fighting dwarfs trading.
    const rates = actionRates('npc-iron-vex');
    expect(rates['Combat'] ?? 0).toBeGreaterThan(2 * (rates['Trade'] ?? 0));
    expect(rates['Combat'] ?? 0).toBeGreaterThan(0.15);
  });
});

describe('NPC economics are real (T-106)', () => {
  it('pays the same jump fuel cost the player would for the same route', () => {
    // Warp Hound (Discovery/PILOT 5) travels most days — find a travel day.
    for (let seed = 1; seed <= 100; seed++) {
      const before = npcFor('npc-warp-hound');
      const { npc } = resolveNpcDay(before, new SeededRng(seed), NO_BOARD);
      if (npc.lastAction?.type !== 'Travel') continue;

      const profile = NPC_PROFILES.find((p) => p.id === 'npc-warp-hound')!;
      const expectedCost = jumpFuelCost(
        npcDrives(profile.tier),
        distance(before.currentSystemId, npc.currentSystemId),
      );
      expect(npc.currentSystemId).not.toBe(before.currentSystemId);
      expect(npc.fuel).toBe(before.fuel - expectedCost);
      return;
    }
    throw new Error('no travel day found in 100 seeds');
  });

  it('a trade day moves the NPC to the contract destination and pays real credits', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const before = npcFor('npc-cargo-king');
      const { npc } = resolveNpcDay(before, new SeededRng(seed), NO_BOARD);
      if (npc.lastAction?.type !== 'Trade') continue;

      expect(npc.currentSystemId).not.toBe(before.currentSystemId);
      expect(npc.credits).toBeGreaterThan(before.credits);
      expect(npc.fuel).toBeLessThan(before.fuel);
      return;
    }
    throw new Error('no trade day found in 100 seeds');
  });

  it('a broke, dry NPC idles on odd jobs instead of flying for free', () => {
    let sawBeggingWire = false;
    for (let seed = 1; seed <= 100; seed++) {
      const before = npcFor('npc-rust-bucket', { credits: 10, fuel: 0 });
      const { npc, events } = resolveNpcDay(before, new SeededRng(seed), NO_BOARD);
      if (npc.lastAction?.type === 'FlawOverride' || npc.lastAction?.type === 'Socialize') {
        continue;
      }

      // No free economics: he cannot jump (no fuel, no credits for fuel).
      expect(npc.currentSystemId).toBe(before.currentSystemId);
      expect(npc.lastAction?.type).toBe('Idle');
      expect(npc.credits).toBeGreaterThan(before.credits); // odd-job alms
      if (
        events.some((e) => e.type === 'WireEntry' && e.message.includes('begging for fuel money'))
      ) {
        sawBeggingWire = true;
      }
    }
    expect(sawBeggingWire).toBe(true);
  });
});

describe('Disposition helper', () => {
  function stateWithNpc(disposition: number) {
    const state = createInitialState(1);
    state.npcs[0].disposition = disposition;
    return { state, npcId: state.npcs[0].id };
  }

  it('applies deltas and emits DispositionChanged', () => {
    const { state, npcId } = stateWithNpc(0);
    const events: GameEvent[] = [];
    applyDisposition(state, npcId, 2, 'tribute', events);

    expect(state.npcs[0].disposition).toBe(2);
    expect(events).toContainEqual({
      type: 'DispositionChanged',
      day: state.day,
      npcId,
      delta: 2,
      disposition: 2,
      reason: 'tribute',
    });
  });

  it('clamps to [-10, +10] and reports the applied delta', () => {
    const { state, npcId } = stateWithNpc(9);
    const events: GameEvent[] = [];
    applyDisposition(state, npcId, 5, 'tribute', events);
    expect(state.npcs[0].disposition).toBe(10);
    expect(events[0]).toMatchObject({ type: 'DispositionChanged', delta: 1, disposition: 10 });

    state.npcs[0].disposition = -9;
    const negEvents: GameEvent[] = [];
    applyDisposition(state, npcId, -5, 'defeat', negEvents);
    expect(state.npcs[0].disposition).toBe(-10);
    expect(negEvents[0]).toMatchObject({ type: 'DispositionChanged', delta: -1, disposition: -10 });
  });

  it('emits nothing when already pinned at a clamp bound', () => {
    const { state, npcId } = stateWithNpc(10);
    const events: GameEvent[] = [];
    applyDisposition(state, npcId, 3, 'tribute', events);
    expect(state.npcs[0].disposition).toBe(10);
    expect(events).toHaveLength(0);
  });
});
