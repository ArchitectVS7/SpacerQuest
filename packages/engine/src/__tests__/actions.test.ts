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
    state.player.dawnHand = rollDawnHand(new SeededRng(123), { handSize: 5, floor: 0, rerolls: 0 });

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
    state.player.dawnHand = rollDawnHand(new SeededRng(123), { handSize: 5, floor: 0, rerolls: 0 });
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
    state.player.dawnHand = rollDawnHand(new SeededRng(123), { handSize: 5, floor: 0, rerolls: 0 });
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
    state.player.dawnHand = rollDawnHand(new SeededRng(123), { handSize: 5, floor: 0, rerolls: 0 });
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
    state.player.dawnHand = rollDawnHand(new SeededRng(123), { handSize: 5, floor: 0, rerolls: 0 });
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

// T-1604 · Player-initiated contract abandonment — the escape hatch out of a
// carried-contract soft-lock (a run whose destination the ship can no longer
// reach in a single jump). Before this action, `activeContract` could only be
// cleared by delivery, a storylet, patrol confiscation, or a succession reset,
// so a ship stranded holding an undeliverable contract was permanently wedged.
describe('forfeit-cargo (contract abandonment)', () => {
  function withContract(destination: number) {
    const state = createInitialState(123);
    state.player.dawnHand = rollDawnHand(new SeededRng(123), { handSize: 5, floor: 0, rerolls: 0 });
    state.player.activeContract = {
      destination,
      cargoType: 8,
      payment: 3230,
      pods: 10,
    };
    return state;
  }

  it('clears the active contract and spends the die on success', () => {
    const state = withContract(5);
    const { state: next, events } = resolveTrade(
      state,
      { type: 'Trade', action: 'forfeit-cargo', spendDie: 0 },
      new SeededRng(123),
    );

    expect(next.player.activeContract).toBeNull();
    // The die was consumed (abandonment is a meaningful action, PRD §7).
    expect(next.player.dawnHand!.spent[0]).toBe(true);
    const ev = events.find((e) => e.type === 'TradeEvent');
    expect(ev).toMatchObject({
      type: 'TradeEvent',
      action: 'forfeit-cargo',
      success: true,
      destination: 5,
      payment: 3230,
    });
    // No credits are paid for a forfeited run.
    expect(next.player.credits).toBe(state.player.credits);
  });

  it('frees a ship soft-locked on an undeliverable contract to sign a reachable run', () => {
    // Rim corner Algol-2 (20) carrying a run to Denebola-5 (6): the single jump
    // costs more than even a full (hull-damage-shrunk) tank can hold, so every
    // Travel is a dry-tank no-op — the seed-77 wedge. Forfeiting voids the run so
    // a new contract can be signed next.
    const state = withContract(6);
    state.player.currentSystemId = 20;
    state.player.ship.maxFuel = 240;
    state.player.ship.fuel = 240;

    const { state: next } = resolveTrade(
      state,
      { type: 'Trade', action: 'forfeit-cargo', spendDie: 0 },
      new SeededRng(123),
    );
    expect(next.player.activeContract).toBeNull();

    // With the hold clear, the sign gate no longer refuses a new contract.
    next.market.manifestBoard = [{ destination: 13, cargoType: 3, payment: 900, pods: 2 }];
    const { state: signed, events } = resolveTrade(
      next,
      { type: 'Trade', action: 'sign-contract', contractIndex: 0, spendDie: 1 },
      new SeededRng(123),
    );
    expect(signed.player.activeContract).toMatchObject({ destination: 13 });
    expect(
      events.some((e) => e.type === 'TradeEvent' && e.action === 'sign-contract' && e.success),
    ).toBe(true);
  });

  it('refuses with no die spent when the hold carries no contract', () => {
    const state = createInitialState(123);
    state.player.dawnHand = rollDawnHand(new SeededRng(123), { handSize: 5, floor: 0, rerolls: 0 });
    state.player.activeContract = null;

    const { state: next, events } = resolveTrade(
      state,
      { type: 'Trade', action: 'forfeit-cargo', spendDie: 0 },
      new SeededRng(123),
    );

    // Typed refusal — NO die spent (mirrors the sign-contract already-carrying
    // refusal), so the player never burns a die on an empty hold.
    expect(next.player.dawnHand!.spent[0]).toBe(false);
    expect(
      events.some((e) => e.type === 'TradeEvent' && e.action === 'forfeit-cargo' && !e.success),
    ).toBe(true);
  });
});
