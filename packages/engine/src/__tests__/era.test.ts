import { describe, it, expect } from 'vitest';
import { generateManifestBoard, localFuelPrice } from '../economy.js';
import { advanceEraSchedule } from '../era.js';
import { calculateRouteDanger } from '../actions/travel.js';
import { advanceDay } from '../day.js';
import { createInitialState, serializeState, deserializeState } from '../state.js';
import { SeededRng } from '../rng.js';
import { EraEventState, ShipState } from '../types.js';

const SHIP_STUB = {
  fuel: 100,
  cargoPods: 10,
  hull: { strength: 1, condition: 9 },
  drives: { strength: 10, condition: 9 },
} as ShipState;

describe('era events — modifier plumbing', () => {
  it('plague raises Medicinals payments INTO the afflicted system vs no-era baseline', () => {
    const seed = 12345;
    const baseline = generateManifestBoard(1, new SeededRng(seed), SHIP_STUB, 120);

    // Find a Medicinals (cargo type 4) offer bound somewhere other than origin.
    const idx = baseline.findIndex((offer) => offer.cargoType === 4 && offer.destination !== 1);
    expect(idx).toBeGreaterThanOrEqual(0);
    const afflicted = baseline[idx].destination;

    const plague: EraEventState = {
      defId: 'plague',
      startedDay: 1,
      endsDay: 20,
      affectedSystemIds: [afflicted],
    };
    const eraBoard = generateManifestBoard(1, new SeededRng(seed), SHIP_STUB, 120, plague);

    // Same seed → identical cargo/destination draws; only payment is re-priced.
    expect(eraBoard[idx].cargoType).toBe(4);
    expect(eraBoard[idx].destination).toBe(afflicted);
    expect(eraBoard[idx].payment).toBeGreaterThan(baseline[idx].payment);

    // A Medicinals run to a DIFFERENT system is untouched by this plague.
    const otherIdx = baseline.findIndex(
      (offer) =>
        offer.cargoType === 4 && offer.destination !== afflicted && offer.destination !== 1,
    );
    if (otherIdx >= 0) {
      expect(eraBoard[otherIdx].payment).toBe(baseline[otherIdx].payment);
    }
  });

  it('fuel crisis raises localFuelPrice in scope and leaves out-of-scope depots alone', () => {
    const base = localFuelPrice(1); // Sun-3 canon buy price
    const crisis: EraEventState = {
      defId: 'fuel_crisis',
      startedDay: 1,
      endsDay: 10,
      affectedSystemIds: Array.from({ length: 14 }, (_, i) => i + 1),
    };
    expect(localFuelPrice(1, crisis)).toBe(base * 2);
    // A rim depot (system 15) is out of the core-scoped crisis.
    expect(localFuelPrice(15, crisis)).toBe(localFuelPrice(15));
  });

  it('patrol crackdown lowers calculateRouteDanger galaxy-wide', () => {
    const state = createInitialState(1);
    const before = calculateRouteDanger(state, 15, 16).routeDangerLevel; // rim lane, danger 3
    state.eraEvent = {
      defId: 'patrol_crackdown',
      startedDay: 1,
      endsDay: 10,
      affectedSystemIds: Array.from({ length: 14 }, (_, i) => i + 1),
    };
    const after = calculateRouteDanger(state, 15, 16).routeDangerLevel;
    expect(after).toBe(before - 1);
  });
});

describe('era events — scheduler', () => {
  it('expires at the day boundary (natural expiry)', () => {
    const era: EraEventState = {
      defId: 'plague',
      startedDay: 2,
      endsDay: 4,
      affectedSystemIds: [5],
    };
    // currentDay 2 → upcoming day 3 < endsDay 4: still active.
    const stays = advanceEraSchedule(
      { eraEvent: era, lastEraEventEndedDay: 0, currentDay: 2 },
      new SeededRng(1),
    );
    expect(stays.eraEvent).not.toBeNull();
    expect(stays.events.some((e) => e.type === 'EraEventEnded')).toBe(false);

    // currentDay 3 → upcoming day 4 >= endsDay 4: expires.
    const expires = advanceEraSchedule(
      { eraEvent: era, lastEraEventEndedDay: 0, currentDay: 3 },
      new SeededRng(1),
    );
    expect(expires.eraEvent).toBeNull();
    expect(expires.lastEraEventEndedDay).toBe(3);
    expect(expires.events.some((e) => e.type === 'EraEventEnded')).toBe(true);
    expect(expires.events.some((e) => e.type === 'WireEntry')).toBe(true);
  });

  it('respects the cooldown: no onset within COOLDOWN days of the last end', () => {
    for (let s = 0; s < 60; s += 1) {
      const r = advanceEraSchedule(
        { eraEvent: null, lastEraEventEndedDay: 10, currentDay: 12 },
        new SeededRng(s),
      );
      expect(r.eraEvent).toBeNull();
    }
  });

  it('can begin an event once the cooldown has elapsed, with a start wire entry', () => {
    let fired = false;
    for (let s = 0; s < 200 && !fired; s += 1) {
      const r = advanceEraSchedule(
        { eraEvent: null, lastEraEventEndedDay: 10, currentDay: 20 },
        new SeededRng(s),
      );
      if (r.eraEvent) {
        fired = true;
        expect(r.eraEvent.startedDay).toBe(21);
        expect(r.eraEvent.endsDay).toBeGreaterThan(21);
        expect(r.events.some((e) => e.type === 'EraEventStarted')).toBe(true);
        expect(r.events.some((e) => e.type === 'WireEntry')).toBe(true);
      }
    }
    expect(fired).toBe(true);
  });

  it('is deterministic and keeps at most one event active over a 300-day run', () => {
    function run(seed: number): { t: string; day: number; defId: string }[] {
      let state = createInitialState(seed);
      const timeline: { t: string; day: number; defId: string }[] = [];
      for (let d = 0; d < 300; d += 1) {
        const result = advanceDay(state, [{ type: 'Wait' }]);
        state = result.state;
        for (const e of result.events) {
          if (e.type === 'EraEventStarted' || e.type === 'EraEventEnded') {
            timeline.push({ t: e.type, day: e.day, defId: e.defId });
          }
        }
      }
      return timeline;
    }

    const first = run(7);
    const second = run(7);
    expect(second).toEqual(first);

    // Eras actually fire, and starts/ends strictly alternate → one at a time.
    expect(first.some((e) => e.t === 'EraEventStarted')).toBe(true);
    expect(first.some((e) => e.t === 'EraEventEnded')).toBe(true);
    let active = false;
    for (const e of first) {
      if (e.t === 'EraEventStarted') {
        expect(active).toBe(false);
        active = true;
      } else {
        expect(active).toBe(true);
        active = false;
      }
    }
  }, 30000);
});

describe('era events — serialization', () => {
  it('round-trips a mid-era state', () => {
    const state = createInitialState(1);
    state.eraEvent = {
      defId: 'blockade',
      startedDay: 3,
      endsDay: 9,
      affectedSystemIds: [1, 2, 3],
    };
    state.lastEraEventEndedDay = 2;
    const restored = deserializeState(serializeState(state));
    expect(restored.eraEvent).toEqual(state.eraEvent);
    expect(restored.lastEraEventEndedDay).toBe(2);
  });

  it('defaults older states with no era fields to null / 0', () => {
    const obj = JSON.parse(serializeState(createInitialState(1))) as Record<string, unknown>;
    delete obj.eraEvent;
    delete obj.lastEraEventEndedDay;
    const restored = deserializeState(JSON.stringify(obj));
    expect(restored.eraEvent).toBeNull();
    expect(restored.lastEraEventEndedDay).toBe(0);
  });
});
