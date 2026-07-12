import { describe, it, expect } from 'vitest';
import { distance } from '@spacerquest/content';
import { generateManifestBoard, jumpFuelCost, maxJumpDistance } from '../economy.js';
import { resolveShipyard } from '../actions/shipyard.js';
import { travelDc } from '../actions/travel.js';
import { createInitialState } from '../state.js';
import { SeededRng } from '../rng.js';
import { ShipState } from '../types.js';

describe('economy', () => {
  it('generates a deterministic manifest board', () => {
    const rng = new SeededRng(12345);
    const originSystem = 1;
    const shipState = {
      fuel: 100,
      cargoPods: 10,
      hull: { strength: 1, condition: 9 },
      drives: { strength: 10, condition: 9 },
    } as ShipState; // Minimal stub

    const board = generateManifestBoard(originSystem, rng, shipState);

    expect(board.length).toBe(4);
    // Deterministic checks
    expect(board[0].destination).not.toBe(originSystem);
    expect(board[0].payment).toBeGreaterThan(0);
    expect(board[0].pods).toBe(10);
  });

  it('prices manifests from non-core origins with starmap distance', () => {
    const rng = new SeededRng(12345);
    const originSystem = 21;
    const shipState = {
      fuel: 100,
      cargoPods: 10,
      hull: { strength: 1, condition: 9 },
      drives: { strength: 10, condition: 9 },
    } as ShipState; // Minimal stub

    const board = generateManifestBoard(originSystem, rng, shipState);

    expect(distance(21, 5)).toBe(46);
    expect(board[0]).toMatchObject({
      destination: 5,
      cargoType: 9,
      pods: 10,
      payment: 5390,
    });
  });

  it('uses repaired hull condition when generating manifest pod counts', () => {
    const state = createInitialState(777);
    state.player.credits = 1000;
    state.player.dawnHand = { dice: [20], spent: [false] };
    state.player.ship.cargoPods = 20;
    state.player.ship.hull.condition = 4;

    const damagedBoard = generateManifestBoard(1, new SeededRng(2468), state.player.ship);
    expect(damagedBoard[0].pods).toBe(10);

    const repaired = resolveShipyard(state, {
      type: 'Shipyard',
      action: 'repair',
      component: 'hull',
      repairMode: 'all',
      spendDie: 0,
    });

    const repairedBoard = generateManifestBoard(1, new SeededRng(2468), repaired.state.player.ship);
    expect(repaired.state.player.ship.hull.condition).toBe(9);
    expect(repairedBoard[0].pods).toBe(20);
  });

  // T-304: the starmap fuel-range ring is drawn at maxJumpDistance and per-system
  // reachability uses jumpFuelCost — these must agree exactly at the boundary.
  describe('maxJumpDistance (starmap fuel ring)', () => {
    const starterDrives = { strength: 10, condition: 9 };

    it('reaches the whole map at full starter fuel (300)', () => {
      // Every jump is capped at 50 fuel, so 300 covers the full 60-unit span.
      expect(maxJumpDistance(starterDrives, 300)).toBe(60);
    });

    it('returns the exact boundary distance the ship can afford', () => {
      // fuel 20: cost(2)=17<=20, cost(3)=23>20 → 2.
      expect(maxJumpDistance(starterDrives, 20)).toBe(2);
      expect(jumpFuelCost(starterDrives, 2)).toBeLessThanOrEqual(20);
      expect(jumpFuelCost(starterDrives, 3)).toBeGreaterThan(20);
    });

    it('returns 0 when even a 1-unit jump is unaffordable', () => {
      // fuel 10: cost(1)=11>10 → 0.
      expect(maxJumpDistance(starterDrives, 10)).toBe(0);
      expect(jumpFuelCost(starterDrives, 1)).toBeGreaterThan(10);
    });

    it('agrees with jumpFuelCost at every reachable distance', () => {
      const fuel = 35;
      const reach = maxJumpDistance(starterDrives, fuel);
      for (let d = 1; d <= reach; d++) {
        expect(jumpFuelCost(starterDrives, d)).toBeLessThanOrEqual(fuel);
      }
      expect(jumpFuelCost(starterDrives, reach + 1)).toBeGreaterThan(fuel);
    });
  });

  describe('travelDc (starmap DC preview)', () => {
    it('scales DC 8 + floor(distance/2)', () => {
      expect(travelDc(1)).toBe(8);
      expect(travelDc(2)).toBe(9);
      expect(travelDc(8)).toBe(12);
    });
  });
});
