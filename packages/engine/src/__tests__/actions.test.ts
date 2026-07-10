import { describe, it, expect } from 'vitest';
import { resolveTrade } from '../actions/trade.js';
import { resolveTravel } from '../actions/travel.js';
import { resolveCombat } from '../actions/combat.js';
import { createInitialState } from '../state.js';
import { SeededRng } from '../rng.js';
import { rollDawnHand } from '../dice.js';

describe('Player Actions', () => {
  it('resolves buying fuel', () => {
    const state = createInitialState(123);
    state.player.dawnHand = rollDawnHand(new SeededRng(123), 5);
    
    // Set up
    state.player.credits = 1000;
    state.market.localFuelPrice = 5;
    state.player.ship.maxFuel = 10000; // Mock max fuel
    const initialFuel = state.player.ship.fuel;

    const { state: nextState, events } = resolveTrade(state, {
      type: 'Trade',
      action: 'buy-fuel',
      fuelAmount: 100,
      spendDie: 0
    }, new SeededRng(123));

    expect(nextState.player.credits).toBe(500); // 100 * 5 = 500 spent
    expect(nextState.player.ship.fuel).toBe(initialFuel + 100);
    expect(events.some(e => e.type === 'TradeEvent')).toBe(true);
  });

  it('resolves travel', () => {
    const state = createInitialState(123);
    state.player.dawnHand = rollDawnHand(new SeededRng(123), 5);
    state.player.currentSystemId = 1;
    const initialFuel = state.player.ship.fuel;

    const { state: nextState, events } = resolveTravel(state, {
      type: 'Travel',
      destinationId: 5,
      spendDie: 0
    }, new SeededRng(123));

    // Either traveled or failed (based on die), but fuel should be deducted
    expect(nextState.player.ship.fuel).toBeLessThan(initialFuel);
    expect(events.some(e => e.type === 'TravelEvent')).toBe(true);
  });

  it('resolves combat run', () => {
    const state = createInitialState(123);
    state.player.dawnHand = rollDawnHand(new SeededRng(123), 5);
    const initialFuel = state.player.ship.fuel;

    const { state: nextState, events } = resolveCombat(state, {
      type: 'Combat',
      stance: 'run',
      targetId: 'npc-1',
      spendDie: 0
    }, new SeededRng(123));

    expect(nextState.player.ship.fuel).toBe(initialFuel - 10);
    expect(events.some(e => e.type === 'CombatEvent' && e.stance === 'run')).toBe(true);
  });
});
