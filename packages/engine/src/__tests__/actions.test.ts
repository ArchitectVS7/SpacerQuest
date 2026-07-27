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

  // -------------------------------------------------------------------------
  // T-1604b · F2 (part B) — the player-initiated hold release.
  //
  // UGT finding F2 (docs/playtests/T-1604a-ugt-campaign.md §7): a captain carrying
  // an undeliverable contract had NO way to free the hold — `sign-contract` is
  // refused while `activeContract` is set, and only delivery, a storylet, a patrol
  // seizure or succession ever cleared it. Half of the measured poverty trap.
  // -------------------------------------------------------------------------
  describe('T-1604b · abandon-contract', () => {
    function heldState(): ReturnType<typeof createInitialState> {
      const state = createInitialState(123);
      state.player.dawnHand = rollDawnHand(new SeededRng(123), {
        handSize: 5,
        floor: 0,
        rerolls: 0,
      });
      state.player.activeContract = { destination: 7, cargoType: 3, payment: 2200, pods: 10 };
      state.market.manifestBoard = [
        { destination: 4, cargoType: 1, payment: 1500, pods: 10 },
        { destination: 5, cargoType: 2, payment: 1800, pods: 10 },
      ];
      return state;
    }

    it('clears the hold, spends a die, and emits the typed event', () => {
      const state = heldState();
      const boardBefore = state.market.manifestBoard.length;

      const { state: next, events } = resolveTrade(
        state,
        { type: 'Trade', action: 'abandon-contract', spendDie: 0 },
        new SeededRng(123),
      );

      expect(next.player.activeContract).toBeNull();
      expect(next.player.dawnHand!.spent[0]).toBe(true);
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'TradeEvent',
          action: 'abandon-contract',
          success: true,
          destination: 7,
          cargoType: 3,
          payment: 2200,
        }),
      );
      // The wire reader for the beat (UI format.ts consumes kind 'plain').
      expect(events.some((e) => e.type === 'WireEntry' && e.kind === 'plain')).toBe(true);
      // No credit fee — charging one would re-strand the captain this verb frees.
      expect(next.player.credits).toBe(state.player.credits);
      // The dumped run does NOT come back to the board: the crates are vented,
      // not un-signed.
      expect(next.market.manifestBoard).toHaveLength(boardBefore);
      expect(next.market.manifestBoard.some((c) => c.destination === 7)).toBe(false);
    });

    it('with an EMPTY hold is a typed refusal that spends no die', () => {
      const state = heldState();
      state.player.activeContract = null;

      const { state: next, events } = resolveTrade(
        state,
        { type: 'Trade', action: 'abandon-contract', spendDie: 0 },
        new SeededRng(123),
      );

      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'TradeEvent',
          action: 'abandon-contract',
          success: false,
          actionDetails: 'Nothing in the hold to abandon.',
        }),
      );
      expect(next.player.dawnHand!.spent[0]).toBe(false);
      expect(next.player.activeContract).toBeNull();
    });

    it('frees the hold so a fresh contract can be signed the same day', () => {
      // The point of the whole verb: the trap is a hold that cannot be re-let.
      const state = heldState();
      const { state: dumped } = resolveTrade(
        state,
        { type: 'Trade', action: 'abandon-contract', spendDie: 0 },
        new SeededRng(123),
      );
      const { state: signed, events } = resolveTrade(
        dumped,
        { type: 'Trade', action: 'sign-contract', contractIndex: 0, spendDie: 1 },
        new SeededRng(123),
      );

      expect(signed.player.activeContract).toMatchObject({ destination: 4, payment: 1500 });
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'TradeEvent', action: 'sign-contract', success: true }),
      );
    });
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
