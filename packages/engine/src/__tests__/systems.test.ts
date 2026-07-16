import { describe, expect, it } from 'vitest';
import {
  STAR_SYSTEMS,
  calculateDistance,
  distance,
  isGatedDestination,
  type StarCoordinates,
} from '@spacerquest/content';

// T-1101 · Real 2D starmap geometry. The content package has no test runner of
// its own, so the "content test" for the authored coordinates lives here in the
// engine vitest suite (the established pattern — encounter.test.ts already
// imports from @spacerquest/content).

const CORE_IDS = Array.from({ length: 14 }, (_, index) => index + 1); // 1–14
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
    // The shipped layout put every core/rim system at (id-1, 0), so distance
    // collapsed to |id diff|. Assert the spread genuinely diverges from that.
    let divergences = 0;
    for (const a of [...CORE_IDS, ...RIM_IDS]) {
      for (const b of [...CORE_IDS, ...RIM_IDS]) {
        if (a >= b) continue;
        if (distance(a, b) !== Math.abs(a - b)) divergences += 1;
      }
    }
    expect(divergences).toBeGreaterThan(0);
  });

  it('rim mean distance-from-core exceeds core–core mean distance', () => {
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
    const coreCoreMean = mean(coreCorePairs);

    expect(rimMeanFromCore).toBeGreaterThan(coreCoreMean);
  });

  it('NEMESIS is remote, not home-adjacent (regression for the (0,0) collision)', () => {
    // NEMESIS (28) sat at (0,0) — identical to Sun-3 (1), one jump from home.
    expect(STAR_SYSTEMS[28].coordinates).not.toEqual(STAR_SYSTEMS[1].coordinates);
    // Farther from home than the farthest rim port.
    const farthestRim = Math.max(...RIM_IDS.map((id) => distance(1, id)));
    expect(distance(1, 28)).toBeGreaterThan(farthestRim);
  });

  it('gates Andromeda (21–26) and the special systems (27–28)', () => {
    for (let id = 1; id <= 20; id += 1) expect(isGatedDestination(id)).toBe(false);
    for (let id = 21; id <= 28; id += 1) expect(isGatedDestination(id)).toBe(true);
  });
});
