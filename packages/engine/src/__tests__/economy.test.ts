import { describe, it, expect } from 'vitest';
import { distance } from '@spacerquest/content';
import {
  calculateFuelCapacity,
  generateManifestBoard,
  jumpFuelCost,
  maxJumpDistance,
} from '../economy.js';
import { resolveShipyard } from '../actions/shipyard.js';
import { travelDc } from '../actions/travel.js';
import { createInitialState, starterShip } from '../state.js';
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

    // T-1101: real 2D coordinates — Deneb-4 (5) moved off the y=0 line, so the
    // NGC-44 -> Deneb-4 distance (and the distance-priced payment) shifted.
    expect(distance(21, 5)).toBe(51);
    // T-1102: fuel-scarcity overhaul removed the 50-fuel jump cap, so the
    // distance-priced fuelRequired (now 12·51 = 612, was capped at 50) lifts the
    // fuel component of the payment (612·5 vs 50·5): 459·10 + 612·5 + 1000 = 8650.
    expect(board[0]).toMatchObject({
      destination: 5,
      cargoType: 9,
      pods: 10,
      payment: 8650,
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

    it('reaches distance 25 at full starter fuel (300)', () => {
      // T-1102: cost is now strictly per-distance (12·d for starter drives), so
      // 300 fuel reaches exactly distance 25 (12·25 = 300, 12·26 = 312 > 300).
      // The old 50-fuel cap that let 300 cover the full 60-unit span is gone —
      // this IS the scarcity curve ("fuel is the plot").
      expect(maxJumpDistance(starterDrives, 300)).toBe(25);
    });

    it('returns the exact boundary distance the ship can afford', () => {
      // fuel 20: cost(1)=12<=20, cost(2)=24>20 → 1.
      expect(maxJumpDistance(starterDrives, 20)).toBe(1);
      expect(jumpFuelCost(starterDrives, 1)).toBeLessThanOrEqual(20);
      expect(jumpFuelCost(starterDrives, 2)).toBeGreaterThan(20);
    });

    it('returns 0 when even a 1-unit jump is unaffordable', () => {
      // fuel 10: cost(1)=12>10 → 0.
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

  // T-1102: fuel scarcity overhaul — "fuel is the plot" (PRD §4 differentiator 3).
  describe('fuel scarcity (T-1102)', () => {
    const starterDrives = { strength: 10, condition: 9 };

    it('reproduces the §7.1 scenario: two jumps cost ~240 against a ~300 tank', () => {
      // PRD §7.1: "two jumps costs 240 units; you're carrying 300."
      // Sun-3 (1) -> Vega-6 (14): distance 14 → 168; Vega-6 -> Pollux-7 (9):
      // distance 6 → 72; total 240 against the starter tank of 300.
      const legOne = jumpFuelCost(starterDrives, distance(1, 14));
      const legTwo = jumpFuelCost(starterDrives, distance(14, 9));
      expect(legOne).toBe(168);
      expect(legTwo).toBe(72);
      expect(legOne + legTwo).toBe(240);
      expect(starterShip().maxFuel).toBe(300);
    });

    it('derives the starter tank from the hull via calculateFuelCapacity', () => {
      // (condition 9 + 1) × strength 1 × 30 = 300.
      expect(calculateFuelCapacity(1, 9)).toBe(300);
      expect(starterShip().maxFuel).toBe(calculateFuelCapacity(1, 9));
    });

    it('a hull upgrade raises the fuel ceiling monotonically', () => {
      // A/B at the capacity math: a tier-3 hull (strength 20) holds far more fuel
      // than the junker (strength 1) at the same condition.
      const junker = calculateFuelCapacity(1, 9);
      const upgraded = calculateFuelCapacity(20, 9);
      expect(upgraded).toBeGreaterThan(junker);
      expect(upgraded).toBe(6000); // (9+1) × 20 × 30
    });

    it('prices a cross-map jump beyond a starter tank (typed fail territory)', () => {
      // Algol-2 (20, rim corner) -> Antares-5 (15): distance 43 → 516 fuel,
      // unaffordable on the 300 starter tank.
      const cost = jumpFuelCost(starterDrives, distance(20, 15));
      expect(cost).toBe(516);
      expect(cost).toBeGreaterThan(starterShip().maxFuel);
    });

    it('cost rises without a ceiling (no flat-50 plateau)', () => {
      // The defect this task fixes: the old cap flattened every jump of distance
      // ≥ 8 to a constant 50. Now distance always matters.
      expect(jumpFuelCost(starterDrives, 8)).toBe(96);
      expect(jumpFuelCost(starterDrives, 16)).toBe(192);
      expect(jumpFuelCost(starterDrives, 8)).toBeLessThan(jumpFuelCost(starterDrives, 16));
    });

    it('returns 0 capacity for a destroyed hull', () => {
      expect(calculateFuelCapacity(0, 9)).toBe(0);
      expect(calculateFuelCapacity(1, 0)).toBe(0);
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
