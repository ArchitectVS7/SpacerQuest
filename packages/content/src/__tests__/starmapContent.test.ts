import { describe, expect, it } from 'vitest';
import {
  STAR_SYSTEMS,
  calculateDistance,
  distance,
  isGatedDestination,
  NEMESIS_SYSTEM_ID,
  type StarCoordinates,
} from '../index.js';

// T-238 · Relocated from the engine suite under docs/TESTING-STRATEGY.md Part I:
// this block reads only authored content and content-owned helpers.

const CORE_IDS = Array.from({ length: 14 }, (_unused, index) => index + 1);
const RIM_IDS = [15, 16, 17, 18, 19, 20];

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe('Starmap geography (T-1101)', () => {
  it('no two systems share coordinates', () => {
    const keys = Object.values(STAR_SYSTEMS).map((s) => `${s.coordinates.x},${s.coordinates.y}`);
    expect(new Set(keys).size).toBe(28);
    expect(keys).toHaveLength(28);
  });

  it('degenerate id-line is gone: distance no longer equals |id difference|', () => {
    let divergences = 0;
    for (const a of [...CORE_IDS, ...RIM_IDS]) {
      for (const b of [...CORE_IDS, ...RIM_IDS]) {
        if (a >= b) continue;
        if (distance(a, b) !== Math.abs(a - b)) divergences += 1;
      }
    }
    expect(divergences).toBeGreaterThan(0);
  });

  it('rim mean distance-from-core exceeds core-core mean distance', () => {
    const coreCentroid: StarCoordinates = {
      x: mean(CORE_IDS.map((id) => STAR_SYSTEMS[id].coordinates.x)),
      y: mean(CORE_IDS.map((id) => STAR_SYSTEMS[id].coordinates.y)),
    };

    const rimMeanFromCore = mean(
      RIM_IDS.map((id) => calculateDistance(STAR_SYSTEMS[id].coordinates, coreCentroid)),
    );

    const coreCorePairs: number[] = [];
    for (const a of CORE_IDS) {
      for (const b of CORE_IDS) {
        if (a >= b) continue;
        coreCorePairs.push(
          calculateDistance(STAR_SYSTEMS[a].coordinates, STAR_SYSTEMS[b].coordinates),
        );
      }
    }

    expect(rimMeanFromCore).toBeGreaterThan(mean(coreCorePairs));
  });

  it('NEMESIS is remote, not home-adjacent (regression for the (0,0) collision)', () => {
    expect(STAR_SYSTEMS[28].coordinates).not.toEqual(STAR_SYSTEMS[1].coordinates);
    const farthestRim = Math.max(...RIM_IDS.map((id) => distance(1, id)));
    expect(distance(1, 28)).toBeGreaterThan(farthestRim);
  });

  it('gates Andromeda (21-26) and the special systems (27-28)', () => {
    for (let id = 1; id <= 20; id += 1) expect(isGatedDestination(id)).toBe(false);
    for (let id = 21; id <= 28; id += 1) expect(isGatedDestination(id)).toBe(true);
  });

  it('T-1505b · NEMESIS_SYSTEM_ID names the black hole and is still a GATED id', () => {
    expect(NEMESIS_SYSTEM_ID).toBe(28);
    expect(STAR_SYSTEMS[NEMESIS_SYSTEM_ID].name).toBe('NEMESIS');
    expect(isGatedDestination(NEMESIS_SYSTEM_ID)).toBe(true);
  });
});
