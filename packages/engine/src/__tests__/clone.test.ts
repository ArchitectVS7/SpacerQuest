import { describe, expect, it } from 'vitest';
import { cloneState } from '../clone.js';
import { advanceDay } from '../day.js';
import { createInitialState } from '../state.js';
import { GameEvent, GameState } from '../types.js';

/** A state with a non-trivial event log and mutated nested containers. */
function playedState(days: number): GameState {
  let state = createInitialState(1);
  for (let day = 0; day < days; day += 1) {
    state = advanceDay(state, [{ type: 'Wait' }]).state;
  }
  return state;
}

// ---------------------------------------------------------------------------
// cloneState is the copy-on-write snapshot behind day.ts, storylets.ts,
// actions/combat.ts and actions/shipyard.ts. It has two obligations, and both
// are asserted here because breaking either is silent at the type level:
//   1. PURITY — nothing the resolvers do to the snapshot may reach the input.
//   2. COST — the append-only eventLog must be pointer-copied, not deep-copied.
//      It was a `JSON.parse(JSON.stringify(state))` before, which made every
//      simulated day cost O(days-so-far): a 300-day sim reached ~27,000 events /
//      ~3.4 MB (against ~12 KB for every other field combined) and spent ~99% of
//      its runtime in the round-trip, pushing `npm test` past ten minutes.
// ---------------------------------------------------------------------------
describe('cloneState (copy-on-write snapshot)', () => {
  it('produces a value-equal snapshot', () => {
    const state = playedState(12);
    expect(cloneState(state)).toEqual(state);
  });

  it('keeps the eventLog entries shared rather than deep-copied (the O(1)-per-event contract)', () => {
    const state = playedState(12);
    expect(state.eventLog.length).toBeGreaterThan(0);

    const clone = cloneState(state);

    // Same entries, by identity — this is what makes a clone cost one pointer
    // copy per event instead of a full serialize+parse of the whole log.
    expect(clone.eventLog).not.toBe(state.eventLog);
    for (let i = 0; i < state.eventLog.length; i += 1) {
      expect(clone.eventLog[i]).toBe(state.eventLog[i]);
    }
  });

  it('does not deep-copy the log yet still isolates appends to it', () => {
    const state = playedState(6);
    const before = state.eventLog.length;

    const clone = cloneState(state);
    const appended: GameEvent = {
      type: 'WireEntry',
      day: 999,
      message: 'clone-test entry',
      kind: 'plain',
    };
    clone.eventLog.push(appended);

    expect(clone.eventLog.length).toBe(before + 1);
    expect(state.eventLog.length).toBe(before);
  });

  it('deep-copies every non-log field, so nested writes never reach the source', () => {
    const state = playedState(6);
    const credits = state.player.credits;
    const firstNpcDisposition = state.npcs[0].disposition;

    const clone = cloneState(state);
    clone.player.credits = credits + 5_000;
    clone.npcs[0].disposition = firstNpcDisposition + 7;
    clone.flags['clone-test-flag'] = true;

    expect(state.player.credits).toBe(credits);
    expect(state.npcs[0].disposition).toBe(firstNpcDisposition);
    expect(state.flags['clone-test-flag']).toBeUndefined();
    expect(clone.npcs[0]).not.toBe(state.npcs[0]);
  });

  it('leaves the input state untouched when the real day loop runs on it', () => {
    const state = playedState(6);
    const snapshot = JSON.stringify(state);

    advanceDay(state, [{ type: 'Wait' }]);

    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
