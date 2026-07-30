import { describe, expect, it } from 'vitest';
import { createInitialState } from '@spacerquest/engine';
import type { GameEvent, GameState } from '@spacerquest/engine';
import { explorationOutcome, recoveryReadout } from '../format';

// ---------------------------------------------------------------------------
// T-111 · The cockpit's view of an open multi-day recovery.
//
// The rule this file guards: a committed multi-day op the player CANNOT SEE is a
// trap rather than a trade. Both readers below are pure — they recompute no rule,
// they read the engine's own `dueDay` — so the tests are about what the player is
// shown, not about the clock.
// ---------------------------------------------------------------------------

function stateWithRecovery(day: number, dueDay: number): GameState {
  const state = createInitialState(1);
  state.day = day;
  state.player.charts.discoveredPois = [
    {
      id: 'poi-1-d1-e3-derelict',
      type: 'derelict',
      systemId: 1,
      name: 'a gutted freighter hulk',
      day: 1,
    },
  ];
  state.player.recovery = {
    outcomeId: 'legacy-salvage-derelict',
    poiId: 'poi-1-d1-e3-derelict',
    systemId: 1,
    startedDay: 1,
    dueDay,
  };
  return state;
}

describe('T-111 · recoveryReadout', () => {
  it('is null when no recovery is open', () => {
    expect(recoveryReadout(createInitialState(1))).toBeNull();
  });

  it('names the CHARTED POI and its anchor system, with days remaining', () => {
    const readout = recoveryReadout(stateWithRecovery(1, 4));
    expect(readout).not.toBeNull();
    // The name comes off `charts`, never off the outcome row — every legacy row's
    // `wireFound` is deliberately empty, so inventing a name here would be fiction.
    expect(readout!.outcomeName).toBe('a gutted freighter hulk');
    expect(readout!.systemName).toBe('Sun-3');
    expect(readout!.daysRemaining).toBe(3);
  });

  it('clamps days remaining at 0 for a due or OVERDUE recovery', () => {
    // The engine pays a past-due slot at the NEXT dusk (`day >= dueDay`), so "0
    // days" is the honest reading of both cases — a negative countdown would be a
    // number the rules never produce.
    expect(recoveryReadout(stateWithRecovery(4, 4))!.daysRemaining).toBe(0);
    expect(recoveryReadout(stateWithRecovery(9, 4))!.daysRemaining).toBe(0);
  });

  it('falls back honestly when the charted POI is missing', () => {
    const state = stateWithRecovery(1, 2);
    state.player.charts.discoveredPois = [];
    expect(recoveryReadout(state)!.outcomeName).toBe('an uncharted salvage claim');
  });
});

describe('T-111 · explorationOutcome names a deferred find', () => {
  const discovered: GameEvent = {
    type: 'PoiDiscovered',
    day: 1,
    poiId: 'poi-1-d1-e3-derelict',
    poiType: 'derelict',
    systemId: 1,
    name: 'a gutted freighter hulk',
  };

  it('reports the salvage op and the day it lifts, instead of a bare "Charted X."', () => {
    const line = explorationOutcome([
      discovered,
      {
        type: 'RecoveryStarted',
        day: 1,
        outcomeId: 'legacy-salvage-derelict',
        poiId: 'poi-1-d1-e3-derelict',
        systemId: 1,
        dueDay: 2,
      },
    ]);
    expect(line).toBe(
      'Charted a gutted freighter hulk · a salvage op under way — holds station to day 2.',
    );
  });

  it('still reads a same-day payoff exactly as before', () => {
    const line = explorationOutcome([
      discovered,
      {
        type: 'SalvageRecovered',
        day: 1,
        poiId: 'poi-1-d1-e3-derelict',
        systemId: 1,
        amount: 1200,
      },
    ]);
    expect(line).toBe('Charted a gutted freighter hulk · 1,200cr in salvage.');
  });
});
