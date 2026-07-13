import { describe, it, expect } from 'vitest';
import { resolveTrade } from '../actions/trade.js';
import { resolveTravel } from '../actions/travel.js';
import { resolveCombat } from '../actions/combat.js';
import { createInitialState } from '../state.js';
import { SeededRng } from '../rng.js';
import { rollDawnHand } from '../dice.js';
import { EncounterState } from '../types.js';

function fixtureEncounter(): EncounterState {
  return {
    id: 'enc-action',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
    interceptor: {
      id: 'anon-pirate-1',
      source: 'anonymous',
      name: 'K)(akj',
      shipName: 'K1++++',
      shipClass: 'Maligna Bat',
      homeSystem: 'Pollux-7',
      kind: 'PIRATE',
      rosterIndex: 1,
      stats: { PILOT: 1, GUNS: 0, TRADE: 0, GRIT: 0, GUILE: 1 },
      tier: 1,
    },
    routeDangerLevel: 1,
    routeDangerChance: 0.08,
    encounterRoll: 0.01,
    round: 1,
    enemyHull: 1,
  };
}

describe('Player Actions', () => {
  it('resolves buying fuel', () => {
    const state = createInitialState(123);
    state.player.dawnHand = rollDawnHand(new SeededRng(123), 5);

    // Set up
    state.player.credits = 1000;
    state.market.localFuelPrice = 5;
    state.player.ship.maxFuel = 10000; // Mock max fuel
    const initialFuel = state.player.ship.fuel;

    const { state: nextState, events } = resolveTrade(
      state,
      {
        type: 'Trade',
        action: 'buy-fuel',
        fuelAmount: 100,
        spendDie: 0,
      },
      new SeededRng(123),
    );

    expect(nextState.player.credits).toBe(500); // 100 * 5 = 500 spent
    expect(nextState.player.ship.fuel).toBe(initialFuel + 100);
    expect(events.some((e) => e.type === 'TradeEvent')).toBe(true);
  });

  it('resolves travel', () => {
    const state = createInitialState(123);
    state.player.dawnHand = rollDawnHand(new SeededRng(123), 5);
    state.player.currentSystemId = 1;
    const initialFuel = state.player.ship.fuel;

    const { state: nextState, events } = resolveTravel(
      state,
      {
        type: 'Travel',
        destinationId: 5,
        spendDie: 0,
      },
      new SeededRng(123),
    );

    // Either traveled or failed (based on die), but fuel should be deducted
    expect(nextState.player.ship.fuel).toBeLessThan(initialFuel);
    expect(events.some((e) => e.type === 'TravelEvent')).toBe(true);
  });

  it('uses starmap distance for travel fuel', () => {
    const state = createInitialState(123);
    state.player.dawnHand = rollDawnHand(new SeededRng(123), 5);
    state.player.currentSystemId = 1;
    state.player.ship.fuel = 1000;
    state.player.ship.drives = { strength: 21, condition: 10 };

    const { state: nextState, events } = resolveTravel(
      state,
      {
        type: 'Travel',
        destinationId: 21,
        spendDie: 0,
      },
      new SeededRng(123),
    );

    // T-1102: strictly per-distance cost, no cap/packaging. Maxed drives
    // (strength 21, condition 10) → perUnit floored to 1; distance(1,21) = 50, so
    // fuelUsed = 1 × 50 = 50 (was 30 under the old +10/÷2 packaging).
    const travel = events.find((e) => e.type === 'TravelEvent');
    expect(travel).toMatchObject({ fuelUsed: 50 });
    expect(nextState.player.ship.fuel).toBe(950);
  });

  it('refuses a cross-map jump the starter tank cannot afford (T-1102 typed fail)', () => {
    const state = createInitialState(123);
    state.player.dawnHand = rollDawnHand(new SeededRng(123), 5);
    // Rim corner Algol-2 (20) → Antares-5 (15): distance 43 → 516 fuel, beyond
    // the 300 starter tank. (Called via the resolver directly, so the T-1101
    // destination gate — which only applies to ids ≥ 21 — is not in play here.)
    state.player.currentSystemId = 20;
    state.player.ship.fuel = 300;
    const fuelBefore = state.player.ship.fuel;

    const { state: nextState, events } = resolveTravel(
      state,
      { type: 'Travel', destinationId: 15, spendDie: 0 },
      new SeededRng(123),
    );

    const travel = events.find((e) => e.type === 'TravelEvent');
    expect(travel).toMatchObject({ success: false, fuelUsed: 0, insufficientFuel: true });
    // No fuel spent and the ship stays put.
    expect(nextState.player.ship.fuel).toBe(fuelBefore);
    expect(nextState.player.currentSystemId).toBe(20);
  });

  it('resolves combat run', () => {
    const state = createInitialState(123);
    state.player.dawnHand = rollDawnHand(new SeededRng(123), 5);
    state.encounter = fixtureEncounter();
    const initialFuel = state.player.ship.fuel;

    const { state: nextState, events } = resolveCombat(
      state,
      {
        type: 'Combat',
        stance: 'run',
        targetId: state.encounter.interceptor.id,
        spendDie: 0,
      },
      new SeededRng(123),
    );

    expect(nextState.player.ship.fuel).toBe(initialFuel - 10);
    expect(events.some((e) => e.type === 'CombatEvent' && e.stance === 'run')).toBe(true);
  });
});
