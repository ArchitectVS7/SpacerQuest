import { describe, it, expect } from 'vitest';
import { CARGO_TYPES, distance, SYSTEM_DANGER_LEVELS } from '@spacerquest/content';
import {
  calculateFuelCapacity,
  generateManifestBoard,
  isCarryingContraband,
  jumpFuelCost,
  maxJumpDistance,
} from '../economy.js';
import { resolveShipyard } from '../actions/shipyard.js';
import { travelDc } from '../actions/travel.js';
import { createInitialState, deserializeState, serializeState, starterShip } from '../state.js';
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

    // T-1104: the rollContract RNG draw order changed (cargo pool → contraband
    // gate → destination, and destination now rolls 1–20 not 1–14), so the
    // seeded output for this origin moved. NGC-44 (21) is non-rim/non-contraband,
    // so the pool is core 1–9 and no contraband draw is taken — the destination
    // is now Fomalhaut-2 (7), a core (danger-tier-1) system, so the payment keeps
    // the exact core shape: valueMult·dist·upodX·dangerMult + fuelRequired·5 + 1000
    // with dangerMult = 1. This recomputes (not deletes) the old assertion.
    const distTo7 = distance(21, 7); // NGC-44 -> Fomalhaut-2
    const fuel7 = jumpFuelCost({ strength: 10, condition: 9 }, distTo7);
    // 9 (valueMult) · distTo7 · 10 (upodX) · 1 (dangerMult) + fuel7·5 + 1000.
    const expected = 9 * distTo7 * 10 * 1 + fuel7 * 5 + 1000;
    expect(board[0]).toMatchObject({
      destination: 7,
      cargoType: 9,
      pods: 10,
      payment: expected,
    });
    expect(expected).toBe(9100); // pinned literal (guards the formula from drift)
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

    // T-1206 completeness gate — every purchasable module has a reader test. The
    // Trans-Warp drive was purchasable + priced but only ever checked here at the
    // fuel-cost reader; this asserts its consumption. A +10 effective drive
    // strength cuts per-unit fuel, so a jump costs strictly less with the drive.
    it('TRANS_WARP drive reduces jump fuel cost (jumpFuelCost reads hasTransWarp)', () => {
      const drives = { strength: 5, condition: 9 }; // low strength → the +10 moves perUnit
      const dist = 10;
      const withoutWarp = jumpFuelCost(drives, dist, false);
      const withWarp = jumpFuelCost(drives, dist, true);
      expect(withWarp).toBeLessThan(withoutWarp);
    });
  });

  // T-1104: Rim & contraband contract economy. Before this task rollContract
  // only issued destinations 1–14 and cargo types 1–9 — no rim payday, no
  // smuggling supply. These tests are the acceptance harness.
  describe('rim & contraband contracts (T-1104)', () => {
    const spec: ShipState = {
      fuel: 100,
      cargoPods: 10,
      hull: { strength: 1, condition: 9 },
      drives: { strength: 10, condition: 9 },
    } as ShipState; // full-pod stub

    it('a 200-seed sweep issues every destination 1–20 and every cargo type incl. Contraband', () => {
      const destSeen = new Set<number>();
      const cargoSeen = new Set<number>();
      const contrabandOrigins = new Set<number>();
      for (let seed = 1; seed <= 200; seed += 1) {
        for (let origin = 1; origin <= 20; origin += 1) {
          const board = generateManifestBoard(origin, new SeededRng(seed), spec);
          for (const c of board) {
            destSeen.add(c.destination);
            cargoSeen.add(c.cargoType);
            if (c.cargoType === 10) contrabandOrigins.add(origin);
          }
        }
      }
      // Every rim system (15–20) receives at least one contract — the namesake
      // region finally has a payday.
      for (let dest = 15; dest <= 20; dest += 1) {
        expect(destSeen.has(dest)).toBe(true);
      }
      // Every cargo type is issued, including the six rim goods AND Contraband
      // (10) — the smuggling pillar now has supply.
      for (const type of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 17, 18, 19, 20]) {
        expect(cargoSeen.has(type)).toBe(true);
      }
      // Contraband is PORT-GATED: it only ever originates from the six rim
      // systems (the allowsContraband ports), never a core port.
      expect([...contrabandOrigins].sort((a, b) => a - b)).toEqual([15, 16, 17, 18, 19, 20]);
    });

    it('rim EV premium sits inside a stated band (3× danger + 5× fuel)', () => {
      let coreSum = 0;
      let coreN = 0;
      let rimSum = 0;
      let rimN = 0;
      for (let seed = 1; seed <= 200; seed += 1) {
        for (let origin = 1; origin <= 20; origin += 1) {
          const board = generateManifestBoard(origin, new SeededRng(seed), spec);
          for (const c of board) {
            const danger = SYSTEM_DANGER_LEVELS[c.destination];
            if (danger === 3) {
              rimSum += c.payment;
              rimN += 1;
            } else if (danger === 1) {
              coreSum += c.payment;
              coreN += 1;
            }
          }
        }
      }
      const coreMean = coreSum / coreN;
      const rimMean = rimSum / rimN;
      const ratio = rimMean / coreMean;
      // Measured at authoring time: coreMean ≈ 2588, rimMean ≈ 6295, ratio ≈ 2.43.
      // The premium comes from dangerMult (rim = 3, core = 1) times the value term
      // plus the far larger fuelRequired·5 term on long rim jumps. The band is a
      // REAL premium (>1.8×) that is not a runaway (<4.5×). Not tuned to pass —
      // the measured 2.43 sits comfortably inside.
      expect(ratio).toBeGreaterThan(1.8);
      expect(ratio).toBeLessThan(4.5);
    });

    it('a Contraband active contract sets the carrying state and survives JSON round-trip', () => {
      // Signing a Contraband contract sets player.activeContract (trade.ts); the
      // derived isCarryingContraband reader (T-1305 patrol scans) reads it.
      const state = createInitialState(1);
      state.player.activeContract = { destination: 15, cargoType: 10, payment: 5000, pods: 10 };
      expect(CARGO_TYPES[10].isContraband).toBe(true);
      expect(isCarryingContraband(state)).toBe(true);

      // The carrying state is derived from a serialized field, so it survives the
      // JSON round-trip with no dedicated GameState boolean / migration.
      const roundTripped = deserializeState(serializeState(state));
      expect(isCarryingContraband(roundTripped)).toBe(true);

      // A legal rim-cargo contract (type 20) is NOT contraband.
      const legal = createInitialState(1);
      legal.player.activeContract = { destination: 15, cargoType: 20, payment: 5000, pods: 10 };
      expect(isCarryingContraband(legal)).toBe(false);
      // No active contract → not carrying.
      legal.player.activeContract = null;
      expect(isCarryingContraband(legal)).toBe(false);
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
