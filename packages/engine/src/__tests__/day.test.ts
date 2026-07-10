import { describe, it, expect } from 'vitest';
import { advanceDay } from '../day.js';
import { createInitialState, serializeState, deserializeState } from '../state.js';

describe('Day loop', () => {
  it('advances day deterministically', () => {
    const state1 = createInitialState(123);
    const state2 = createInitialState(123);

    const result1 = advanceDay(state1, []);
    const result2 = advanceDay(state2, []);

    // Should increment day
    expect(result1.state.day).toBe(2);

    // Hand should be populated and marked fully spent because player waited
    expect(result1.state.player.dawnHand).toBeDefined();
    expect(result1.state.player.dawnHand?.spent).toEqual([true, true, true, true, true]);

    // Should be deterministic
    expect(result1.state).toEqual(result2.state);
    expect(result1.events).toEqual(result2.events);
  });

  it('serializes and deserializes', () => {
    const state = createInitialState(999);
    const { state: nextState } = advanceDay(state, []);

    const json = serializeState(nextState);
    const restored = deserializeState(json);

    expect(restored).toEqual(nextState);
  });
});
