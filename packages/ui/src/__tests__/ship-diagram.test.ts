import { describe, expect, it } from 'vitest';
import { createInitialState, quoteShipyard, type GameState } from '@spacerquest/engine';
import { SHIP_COMPONENTS } from '@spacerquest/content';
import {
  SHIP_DIAGRAM_GEOMETRY,
  SHIP_DIAGRAM_VIEWBOX,
  crewRoster,
  shipComponents,
  shipDiagram,
  type ShipDiagramRegionId,
} from '../format';

// ---------------------------------------------------------------------------
// T-189 · THE SHIP DIAGRAM
//
// Selector tests over `format.ts`, never over `../store` (the store runs `init()`
// at module load and reaches for storage and sound) — the same discipline
// `hangout-pane.test.ts` keeps. There is no `@testing-library/react` in this
// repo, so the model living in `format.ts` rather than in JSX is precisely what
// makes the diagram testable at all; the browser half (a real ship pane, real
// clicks, real screenshots) lives in `packages/ui/e2e/ship-diagram.spec.ts`.
//
// The contract these tests defend: the diagram RE-PRESENTS the pane's existing
// numbers and INVENTS none of its own.
// ---------------------------------------------------------------------------

const ALL_REGION_IDS: readonly ShipDiagramRegionId[] = [
  ...SHIP_COMPONENTS.map((c) => c.id),
  'pods',
  'fuel',
];

/** A deterministic starting career (the junker: hull str1/cond9, drives str10,
 *  10 cargo pods, 300 fuel) — the same state `shipyard.spec.ts` drives. */
function junker(): GameState {
  return createInitialState(1);
}

/** Clone with one component's condition forced, without touching the original. */
function withCondition(
  game: GameState,
  id: (typeof SHIP_COMPONENTS)[number]['id'],
  condition: number,
): GameState {
  return {
    ...game,
    player: {
      ...game.player,
      ship: { ...game.player.ship, [id]: { ...game.player.ship[id], condition } },
    },
  };
}

describe('shipDiagram · region coverage', () => {
  it('carries every content component exactly once, plus the hold and the fuel load', () => {
    const model = shipDiagram(junker());
    const componentIds = model.regions
      .filter((r) => r.componentId !== null)
      .map((r) => r.componentId);
    // Exhaustive against CONTENT, so a ninth component can never be silently
    // missing from the diagram — it would fail here before anyone saw the pane.
    expect([...componentIds].sort()).toEqual([...SHIP_COMPONENTS.map((c) => c.id)].sort());
    expect(componentIds).toHaveLength(new Set(componentIds).size);

    const ids = model.regions.map((r) => r.id);
    expect(ids).toContain('pods');
    expect(ids).toContain('fuel');
    expect(ids).toHaveLength(SHIP_COMPONENTS.length + 2);
    expect(model.regions.find((r) => r.id === 'pods')?.componentId).toBeNull();
    expect(model.regions.find((r) => r.id === 'fuel')?.componentId).toBeNull();
  });

  it('gives every region a label and at least one readout', () => {
    for (const region of shipDiagram(junker()).regions) {
      expect(region.label.length).toBeGreaterThan(0);
      expect(region.readouts.length).toBeGreaterThan(0);
      for (const readout of region.readouts) expect(readout.value.length).toBeGreaterThan(0);
    }
  });
});

describe('shipDiagram · geometry', () => {
  it('has an entry for every region, inside the viewBox', () => {
    for (const id of ALL_REGION_IDS) {
      const g = SHIP_DIAGRAM_GEOMETRY[id];
      expect(g, `no geometry for ${id}`).toBeDefined();
      for (const [name, v] of [
        ['x', g.x],
        ['y', g.y],
        ['labelX', g.labelX],
        ['labelY', g.labelY],
      ] as const) {
        expect(Number.isFinite(v), `${id}.${name} is not finite`).toBe(true);
      }
      expect(g.x).toBeGreaterThanOrEqual(0);
      expect(g.x).toBeLessThanOrEqual(SHIP_DIAGRAM_VIEWBOX.width);
      expect(g.labelX).toBeGreaterThanOrEqual(0);
      expect(g.labelX).toBeLessThanOrEqual(SHIP_DIAGRAM_VIEWBOX.width);
      expect(g.y).toBeGreaterThanOrEqual(0);
      expect(g.y).toBeLessThanOrEqual(SHIP_DIAGRAM_VIEWBOX.height);
      expect(g.labelY).toBeGreaterThanOrEqual(0);
      expect(g.labelY).toBeLessThanOrEqual(SHIP_DIAGRAM_VIEWBOX.height);
    }
  });

  it('never stacks two callouts on top of each other', () => {
    // A cheap guard against the exact failure this task exists to fix: callouts
    // piled into an unreadable blur. 20 viewBox units is a touch under two
    // callout line-heights.
    const MIN_SEPARATION = 20;
    for (let i = 0; i < ALL_REGION_IDS.length; i++) {
      for (let j = i + 1; j < ALL_REGION_IDS.length; j++) {
        const a = SHIP_DIAGRAM_GEOMETRY[ALL_REGION_IDS[i]];
        const b = SHIP_DIAGRAM_GEOMETRY[ALL_REGION_IDS[j]];
        const d = Math.hypot(a.labelX - b.labelX, a.labelY - b.labelY);
        expect(
          d,
          `${ALL_REGION_IDS[i]} and ${ALL_REGION_IDS[j]} callouts are ${d.toFixed(1)} apart`,
        ).toBeGreaterThanOrEqual(MIN_SEPARATION);
      }
    }
  });

  it('draws a mark for every region except the hull, which IS the silhouette', () => {
    for (const id of ALL_REGION_IDS) {
      const marks = SHIP_DIAGRAM_GEOMETRY[id].marks;
      if (id === 'hull') expect(marks).toHaveLength(0);
      else expect(marks.length).toBeGreaterThan(0);
    }
  });
});

describe('shipDiagram · invents no numbers', () => {
  it('re-projects the grid rows, the shipyard quote, the ship and the roster', () => {
    const game = junker();
    const model = shipDiagram(game);
    const rows = shipComponents(game);
    const before = quoteShipyard(game.player, {
      type: 'Shipyard',
      action: 'repair',
      repairMode: 'all',
      spendDie: 0,
    }).before;

    for (const row of rows) {
      const region = model.regions.find((r) => r.componentId === row.id);
      expect(region, `no region for ${row.id}`).toBeDefined();
      expect(region?.strength).toBe(row.strength);
      expect(region?.condition).toBe(row.condition);
      expect(region?.damaged).toBe(row.damaged);
    }

    expect(model.podsOwned).toBe(game.player.ship.cargoPods);
    expect(model.podsMax).toBe(before.maxCargoPods);
    expect(model.fuel).toBe(game.player.ship.fuel);
    expect(model.maxFuel).toBe(game.player.ship.maxFuel);
    expect(model.crewBerths).toBe(crewRoster(game).berths);
    expect(model.crewUsed).toBe(crewRoster(game).berthsUsed);

    // The two ids that moved off the deleted flat instrument strip carry the
    // quote's own numbers, bare — `shipyard.spec.ts` reads `fuel-per-jump` with
    // `Number(...innerText())`, so anything but a bare number breaks it.
    const drives = model.regions.find((r) => r.id === 'drives');
    const fuelPerJump = drives?.readouts.find((r) => r.testId === 'fuel-per-jump');
    const range = drives?.readouts.find((r) => r.testId === 'jump-range');
    expect(fuelPerJump?.value).toBe(`${before.fuelPerJump}`);
    expect(range?.value).toBe(`${before.maxJumpDistance}`);
    expect(Number(fuelPerJump?.value)).not.toBeNaN();

    const cabin = model.regions.find((r) => r.id === 'cabin');
    expect(cabin?.readouts.find((r) => r.testId === 'crew-capacity')?.value).toBe(
      `${before.crewCapacity}`,
    );
  });

  it('shows the hold as owned/capacity', () => {
    const model = shipDiagram(junker());
    const pods = model.regions.find((r) => r.id === 'pods');
    expect(pods?.readouts[0].value).toBe(`${model.podsOwned}/${model.podsMax}`);
  });
});

describe('shipDiagram · damage flags', () => {
  it('flags exactly the damaged component', () => {
    const model = shipDiagram(withCondition(junker(), 'drives', 4));
    for (const region of model.regions) {
      if (region.id === 'drives') {
        expect(region.damaged).toBe(true);
        expect(region.critical).toBe(false);
      } else {
        expect(region.damaged, `${region.id} should not be damaged`).toBe(false);
      }
    }
  });

  it('flags a dead component as critical AND damaged', () => {
    const drives = shipDiagram(withCondition(junker(), 'drives', 0)).regions.find(
      (r) => r.id === 'drives',
    );
    expect(drives?.damaged).toBe(true);
    expect(drives?.critical).toBe(true);
  });

  it('leaves the two non-component regions unflagged', () => {
    const model = shipDiagram(withCondition(junker(), 'hull', 0));
    for (const id of ['pods', 'fuel'] as const) {
      const region = model.regions.find((r) => r.id === id);
      expect(region?.damaged).toBe(false);
      expect(region?.critical).toBe(false);
      expect(region?.strength).toBeNull();
      expect(region?.condition).toBeNull();
    }
  });
});

describe('shipDiagram · the hold', () => {
  it('reads the active contract for pods in use', () => {
    const game = junker();
    expect(shipDiagram(game).podsInUse).toBe(0);

    const loaded: GameState = {
      ...game,
      player: {
        ...game.player,
        activeContract: { destination: 4, cargoType: 1, payment: 500, pods: 4 },
      },
    };
    const model = shipDiagram(loaded);
    expect(model.podsInUse).toBe(4);
    expect(model.regions.find((r) => r.id === 'pods')?.readouts).toContainEqual({
      key: 'IN USE',
      value: '4',
    });
  });

  it('never produces NaN in an SVG attribute when a denominator is zero', () => {
    const game = junker();
    const empty: GameState = {
      ...game,
      player: {
        ...game.player,
        ship: {
          ...game.player.ship,
          // A hull that holds nothing and a tank of no capacity: both fractions
          // must resolve to a finite 0, never NaN.
          hull: { ...game.player.ship.hull, strength: 0 },
          cargoPods: 0,
          fuel: 0,
          maxFuel: 0,
        },
      },
    };
    const model = shipDiagram(empty);
    expect(model.podsMax).toBe(0);
    expect(model.podFill).toBe(0);
    expect(model.podUseFill).toBe(0);
    expect(model.fuelFill).toBe(0);
    expect(Number.isFinite(model.podFill)).toBe(true);
    expect(Number.isFinite(model.fuelFill)).toBe(true);
  });

  it('clamps the fills to 0..1', () => {
    const model = shipDiagram(junker());
    for (const f of [model.podFill, model.podUseFill, model.fuelFill]) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});

describe('shipDiagram · hull variant', () => {
  it('is the junker by default and the Astraxial once that hull is installed', () => {
    const game = junker();
    expect(shipDiagram(game).hullVariant).toBe('junker');

    const astraxial: GameState = {
      ...game,
      player: { ...game.player, ship: { ...game.player.ship, isAstraxialHull: true } },
    };
    expect(shipDiagram(astraxial).hullVariant).toBe('astraxial');
  });

  it('states its own viewBox', () => {
    expect(shipDiagram(junker()).viewBox).toBe(
      `0 0 ${SHIP_DIAGRAM_VIEWBOX.width} ${SHIP_DIAGRAM_VIEWBOX.height}`,
    );
  });
});
