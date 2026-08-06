import { describe, expect, it } from 'vitest';
import { createInitialState, maxJumpDistance } from '@spacerquest/engine';
import { STAR_SYSTEMS, NEMESIS_SYSTEM_ID, coordinates3D, distance } from '@spacerquest/content';

import {
  clampGlobeView,
  starmapGlobe,
  suppressLabels,
  GLOBE_MAX_HIT_RADIUS,
  GLOBE_MAX_PITCH,
  GLOBE_MAX_ZOOM,
  GLOBE_MIN_ZOOM,
  type GlobeView,
  type LabelMetrics,
} from '../format';

// ---------------------------------------------------------------------------
// T-215 · THE GLOBE'S GEOMETRY INVARIANTS.
//
// `starmapGlobe` is a pure function precisely so the properties that matter can
// be asserted without a browser: that the rotation is a RIGID motion (so T-188's
// radius-from-Sol balance invariant survives being drawn), that the viewBox does
// not breathe under drag, that the lane hub is the ship and not Sol, and that the
// wireframe never draws the silhouette ring the ruling forbids.
//
// Label COLLISION behaviour is the sibling file `starmap-label-overlap.test.ts`;
// the real-font proof is `e2e/starmap-globe.spec.ts`. This file is geometry.
// ---------------------------------------------------------------------------

/** A deliberately generous fake metric — this file asserts geometry, not text. */
const METRICS: LabelMetrics = {
  widthOf: (t) => t.length * 4.8,
  ascent: 6.4,
  descent: 2.4,
};

const VIEWS: GlobeView[] = [
  { yaw: 0, pitch: 0, zoom: 1 },
  { yaw: 0.7, pitch: 0.35, zoom: 1 },
  { yaw: 2.4, pitch: -0.9, zoom: 1.8 },
  { yaw: 5.1, pitch: 1.1, zoom: 0.7 },
];

function fresh() {
  return createInitialState(1);
}

/** The node-set predicate `starmapProjection` shipped and `starmapGlobe` inherits. */
function expectedShown(game: ReturnType<typeof fresh>): number[] {
  const here = game.player.currentSystemId;
  const visited = new Set(game.player.charts.visitedSystemIds);
  const crossingOpen = game.flags['nemesis.crossing.unlocked'] === true;
  return Object.values(STAR_SYSTEMS)
    .filter(
      (s) =>
        (s.id >= 1 && s.id <= 20) ||
        s.id === here ||
        visited.has(s.id) ||
        (crossingOpen && s.id === NEMESIS_SYSTEM_ID),
    )
    .map((s) => s.id)
    .sort((a, b) => a - b);
}

describe('T-215 · the camera is clamped into a legal range', () => {
  it('wraps yaw and clamps pitch short of the poles and zoom to its band', () => {
    const v = clampGlobeView({ yaw: -0.5, pitch: 3, zoom: 99 });
    expect(v.yaw).toBeGreaterThanOrEqual(0);
    expect(v.yaw).toBeLessThan(Math.PI * 2);
    expect(v.pitch).toBe(GLOBE_MAX_PITCH);
    expect(v.zoom).toBe(GLOBE_MAX_ZOOM);
    expect(clampGlobeView({ yaw: 0, pitch: -3, zoom: 0.01 }).pitch).toBe(-GLOBE_MAX_PITCH);
    expect(clampGlobeView({ yaw: 0, pitch: 0, zoom: 0.01 }).zoom).toBe(GLOBE_MIN_ZOOM);
  });
});

describe('T-215 · the projection is a rigid motion', () => {
  it('preserves every pairwise 3D distance (screen span / scale === true span)', () => {
    const game = fresh();
    for (const view of VIEWS) {
      const g = starmapGlobe(game, view, METRICS);
      const byId = new Map(g.nodes.map((n) => [n.id, n]));
      for (const a of g.nodes) {
        for (const b of g.nodes) {
          if (a.id >= b.id) continue;
          const A = byId.get(a.id)!;
          const B = byId.get(b.id)!;
          // Screen dx/dy plus the retained depth reconstitute the full rotated
          // vector; its length must equal the untransformed 3D separation.
          const projected =
            Math.hypot(B.sx - A.sx, B.sy - A.sy, (B.depth - A.depth) * g.scale) / g.scale;
          const ca = coordinates3D(a.id);
          const cb = coordinates3D(b.id);
          const truth = Math.hypot(cb.x - ca.x, cb.y - ca.y, cb.z - ca.z);
          expect(projected).toBeCloseTo(truth, 6);
        }
      }
    }
  });

  it('keeps Sol at the centre of the viewBox at every rotation and zoom', () => {
    const game = fresh();
    for (const view of VIEWS) {
      const sol = starmapGlobe(game, view, METRICS).nodes.find((n) => n.id === 1)!;
      expect(sol.sx).toBeCloseTo(130, 6);
      expect(sol.sy).toBeCloseTo(96, 6);
    }
  });

  it("preserves T-188's radius-from-Sol invariant on screen", () => {
    // The whole reason the sphere is Sol-centred rather than ship-centred: every
    // Sol-relative balance number this repo is tuned against is the radius.
    const game = fresh();
    const g = starmapGlobe(game, VIEWS[1], METRICS);
    const sol = g.nodes.find((n) => n.id === 1)!;
    for (const n of g.nodes) {
      if (n.id === 1) continue;
      const r = Math.hypot(n.sx - sol.sx, n.sy - sol.sy, (n.depth - sol.depth) * g.scale) / g.scale;
      expect(Math.round(r)).toBe(distance(1, n.id));
    }
  });
});

describe('T-215 · the node set is unchanged from the retired flat projection', () => {
  it('charts ids 1-20 on a fresh day-1 state', () => {
    const game = fresh();
    const ids = starmapGlobe(game, VIEWS[0], METRICS)
      .nodes.map((n) => n.id)
      .sort((a, b) => a - b);
    expect(ids).toEqual(expectedShown(game));
    expect(ids).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('adds a charted out-of-band system', () => {
    const game = fresh();
    game.player.charts.visitedSystemIds = [...game.player.charts.visitedSystemIds, 22];
    const ids = starmapGlobe(game, VIEWS[0], METRICS).nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining([22]));
    expect(ids.sort((a, b) => a - b)).toEqual(expectedShown(game));
  });

  it('charts NEMESIS only once the crossing stake is paid', () => {
    const sealed = fresh();
    expect(starmapGlobe(sealed, VIEWS[0], METRICS).nodes.map((n) => n.id)).not.toContain(
      NEMESIS_SYSTEM_ID,
    );
    const open = fresh();
    open.flags['nemesis.crossing.unlocked'] = true;
    const ids = starmapGlobe(open, VIEWS[0], METRICS).nodes.map((n) => n.id);
    expect(ids).toContain(NEMESIS_SYSTEM_ID);
    // The lift is NEMESIS-only: Andromeda and MALIGNA stay off the chart.
    expect(ids.filter((id) => id >= 21 && id <= 27)).toEqual([]);
  });
});

describe('T-215 · the fuel ring is still the engine number', () => {
  it('reads maxJumpDistance and scales it uniformly', () => {
    const game = fresh();
    const g = starmapGlobe(game, VIEWS[1], METRICS);
    const ship = game.player.ship;
    expect(g.ringUnits).toBe(
      maxJumpDistance(ship.drives, ship.fuel, ship.hasTransWarpDrive ?? false),
    );
    expect(g.ringRadius).toBeCloseTo(g.ringUnits * g.scale, 9);
  });

  it('collapses to zero radius on a dry tank', () => {
    const game = fresh();
    game.player.ship.fuel = 0;
    const g = starmapGlobe(game, VIEWS[1], METRICS);
    expect(g.ringUnits).toBe(0);
    expect(g.ringRadius).toBe(0);
  });
});

describe('T-215 · lanes radiate from the SHIP, and exactly one is bright', () => {
  it('every lane starts at the current system, never at Sol by assumption', () => {
    const game = fresh();
    game.player.currentSystemId = 7;
    const reachable = new Set([2, 3, 4]);
    const g = starmapGlobe(game, VIEWS[1], METRICS, { reachable });
    const hub = g.here!;
    expect(hub.id).toBe(7);
    expect(g.lanes.length).toBeGreaterThan(0);
    for (const lane of g.lanes) {
      expect(lane.x1).toBeCloseTo(hub.sx, 9);
      expect(lane.y1).toBeCloseTo(hub.sy, 9);
      expect(lane.toId).not.toBe(7);
    }
    expect(g.lanes.map((l) => l.toId).sort((a, b) => a - b)).toEqual([2, 3, 4]);
  });

  it('draws a dim lane to every reachable system and none to unreachable ones', () => {
    const game = fresh();
    const reachable = new Set([2, 5, 9]);
    const g = starmapGlobe(game, VIEWS[1], METRICS, { reachable });
    expect(g.lanes.every((l) => !l.bright)).toBe(true);
    expect(g.lanes.map((l) => l.toId).sort((a, b) => a - b)).toEqual([2, 5, 9]);
  });

  it('lights exactly the set-course lane', () => {
    const game = fresh();
    const reachable = new Set([2, 5, 9]);
    const g = starmapGlobe(game, VIEWS[1], METRICS, { reachable, courseId: 5 });
    expect(g.lanes.filter((l) => l.bright).map((l) => l.toId)).toEqual([5]);
    expect(g.lanes.filter((l) => l.bright)[0].reachable).toBe(true);
  });

  it('still draws the course lane when the course is unaffordable', () => {
    // Today's `route-line blocked` behaviour: a plot the tank cannot fly is
    // still a plot the player must be able to SEE.
    const game = fresh();
    const reachable = new Set([2]);
    const g = starmapGlobe(game, VIEWS[1], METRICS, { reachable, courseId: 17 });
    const course = g.lanes.find((l) => l.toId === 17);
    expect(course).toBeDefined();
    expect(course!.bright).toBe(true);
    expect(course!.reachable).toBe(false);
  });
});

describe('T-215 · the viewBox never breathes', () => {
  it('is byte-identical across every rotation and zoom', () => {
    const game = fresh();
    const boxes = new Set<string>();
    for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.3) {
      for (const zoom of [GLOBE_MIN_ZOOM, 1, 2, GLOBE_MAX_ZOOM]) {
        boxes.add(starmapGlobe(game, { yaw, pitch: 0.4, zoom }, METRICS).viewBox);
      }
    }
    expect([...boxes]).toEqual(['0 0 260 200']);
  });
});

describe('T-215 · no node can swallow another node’s click', () => {
  // A REGRESSION, MEASURED. The first build used one fixed 22-unit hit rect for
  // every node — the flat map's approach, where a lane spaced nodes evenly. On a
  // globe the on-screen spacing changes with every degree of rotation, and three
  // `starmap.spec.ts` jumps went un-clickable because Fomalhaut-2's rect covered
  // its neighbour's centre. The fix is geometric, so pin it geometrically.
  it("no node's hit circle ever reaches another node's centre, at any rotation", () => {
    const game = fresh();
    for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.25) {
      for (const pitch of [-1.2, -0.6, 0, 0.6, 1.2]) {
        for (const zoom of [GLOBE_MIN_ZOOM, 1, GLOBE_MAX_ZOOM]) {
          const g = starmapGlobe(game, { yaw, pitch, zoom }, METRICS);
          for (const a of g.nodes) {
            for (const b of g.nodes) {
              if (a.id === b.id) continue;
              const d = Math.hypot(b.sx - a.sx, b.sy - a.sy);
              expect(
                a.hitRadius,
                `#${a.id} would intercept #${b.id} at yaw ${yaw.toFixed(2)} pitch ${pitch}`,
              ).toBeLessThan(d);
            }
          }
        }
      }
    }
  });

  it('still gives an isolated node a full-sized target', () => {
    const g = starmapGlobe(fresh(), VIEWS[1], METRICS);
    expect(Math.max(...g.nodes.map((n) => n.hitRadius))).toBe(GLOBE_MAX_HIT_RADIUS);
    expect(Math.min(...g.nodes.map((n) => n.hitRadius))).toBeGreaterThan(0);
  });
});

describe('T-215 · the wireframe reads as a sphere and draws no emphasis ring', () => {
  it('emits both latitude and longitude curves, all non-empty', () => {
    const g = starmapGlobe(fresh(), VIEWS[1], METRICS);
    expect(g.graticule.some((c) => c.kind === 'lat')).toBe(true);
    expect(g.graticule.some((c) => c.kind === 'lon')).toBe(true);
    for (const c of g.graticule) {
      expect(c.d.length).toBeGreaterThan(0);
      expect(c.d.startsWith('M')).toBe(true);
    }
  });

  it('splits curves at the depth sign change, so a far half exists to dim', () => {
    const g = starmapGlobe(fresh(), VIEWS[1], METRICS);
    // 5 latitudes + 12 meridians = 17 base curves; splitting must produce more.
    expect(g.graticule.length).toBeGreaterThan(17);
    expect(g.graticule.some((c) => c.back)).toBe(true);
    expect(g.graticule.some((c) => !c.back)).toBe(true);
  });

  it('NEVER closes a stroke around the silhouette — the ruling forbids that ring', () => {
    // "No bright emphasis ring" as a test. The outline of an orthographically
    // projected sphere is the CLOSED circle at the screen radius; the wireframe
    // is only ever open arcs strictly inside that disc. (An in-plane meridian
    // does lie ON the rim at pitch 0 — that is a real half-meridian of the
    // globe, 180° of it, not an outline, so the assertion is closure, not
    // tangency.)
    for (const view of VIEWS) {
      const g = starmapGlobe(fresh(), view, METRICS);
      const r = 84 * clampGlobeView(view).zoom;
      for (const c of g.graticule) {
        const pts = c.d
          .split(/[ML]/)
          .filter((s) => s.trim().length > 0)
          .map((s) => s.trim().split(/\s+/).map(Number));
        // Nothing is ever drawn outside the sphere's own disc.
        for (const [x, y] of pts) {
          expect(Math.hypot(x - 130, y - 96)).toBeLessThanOrEqual(r + 0.5);
        }
        const first = pts[0];
        const last = pts[pts.length - 1];
        const closed = Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.5;
        const onRim = pts.every(([x, y]) => Math.abs(Math.hypot(x - 130, y - 96) - r) < 0.5);
        expect(
          closed && onRim,
          `a curve closed around the silhouette at view ${JSON.stringify(view)}`,
        ).toBe(false);
      }
    }
  });
});

describe('T-215 · the suppressor resolves ties in the ruled order', () => {
  const box = (id: number, x: number, depth: number) => ({
    id,
    minX: x,
    maxX: x + 10,
    minY: 0,
    maxY: 8,
    depth,
  });

  it('focus beats here beats course beats nearest-to-camera', () => {
    // Four mutually overlapping boxes: exactly one label can survive.
    const all = [box(1, 0, -5), box(2, 1, 9), box(3, 2, 0), box(4, 3, 5)];
    expect([...suppressLabels(all, { focusId: 4, hereId: 1, courseId: 3 })]).toEqual([4]);
    expect([...suppressLabels(all, { hereId: 1, courseId: 3 })]).toEqual([1]);
    expect([...suppressLabels(all, { courseId: 3 })]).toEqual([3]);
    // No priorities at all → nearest to camera (greatest depth) wins.
    expect([...suppressLabels(all, {})]).toEqual([2]);
  });

  it('keeps every label that does not actually collide', () => {
    const all = [box(1, 0, 0), box(2, 40, 0), box(3, 80, 0)];
    expect([...suppressLabels(all, {})].sort()).toEqual([1, 2, 3]);
  });
});
