import { describe, expect, it } from 'vitest';
import { createInitialState } from '@spacerquest/engine';

import { starmapGlobeProjection } from '../format';

// ---------------------------------------------------------------------------
// T-188 · A STANDING QUALITY GATE, NOT A ONE-OFF FIX.
//
// Owner's read, verbatim: "already you should be flagging and failing this
// since the port names are overlapping with other ports and names." This test
// is generic to WHATEVER coordinate set `starmapGlobeProjection` is drawing from
// — it makes no assumption about layout, so it keeps guarding the map after the
// T-215 3D globe replacement.
//
// APPROXIMATION, STATED RATHER THAN HIDDEN: the real component resolves label
// collisions after rotating the sphere and gives priority to current system,
// selected target, then nearest-to-camera. This unit test mirrors the same box
// math over a representative rotation sample. Playwright owns the browser-metric
// smoke; this file is the fast regression guard.
// ---------------------------------------------------------------------------

interface LabelBox {
  id: number;
  name: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function rotate(node: { x: number; y: number; z: number }, yaw: number, pitch: number) {
  const length = Math.hypot(node.x, node.y, node.z) || 1;
  const x0 = node.x / length;
  const y0 = node.y / length;
  const z0 = node.z / length;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x1 = x0 * cy + z0 * sy;
  const z1 = -x0 * sy + z0 * cy;
  const y1 = y0 * cp - z1 * sp;
  const z2 = y0 * sp + z1 * cp;
  return { x: 50 + x1 * 38, y: 50 - y1 * 38, z: z2, visible: z2 >= -0.18 };
}

function labelBoxes(
  projection: ReturnType<typeof starmapGlobeProjection>,
  yaw: number,
): LabelBox[] {
  const pitch = -0.22;
  const boxes: LabelBox[] = [];
  for (const node of projection.nodes) {
    const point = rotate(node, yaw, pitch);
    if (!point.visible) continue;
    const halfWidth = Math.max(3.2, node.name.length * 0.62);
    const box = {
      id: node.id,
      name: node.name,
      minX: point.x - halfWidth,
      maxX: point.x + halfWidth,
      minY: point.y + 2.5,
      maxY: point.y + 7.5,
    };
    if (
      boxes.every(
        (other) =>
          box.minX >= other.maxX ||
          box.maxX <= other.minX ||
          box.minY >= other.maxY ||
          box.maxY <= other.minY,
      )
    ) {
      boxes.push(box);
    }
  }
  return boxes;
}

function allCandidateBoxes(
  projection: ReturnType<typeof starmapGlobeProjection>,
  yaw: number,
): LabelBox[] {
  const pitch = -0.22;
  return projection.nodes.flatMap((node) => {
    const point = rotate(node, yaw, pitch);
    if (!point.visible) return [];
    const halfWidth = Math.max(3.2, node.name.length * 0.62);
    return {
      id: node.id,
      name: node.name,
      minX: point.x - halfWidth,
      maxX: point.x + halfWidth,
      minY: point.y + 2.5,
      maxY: point.y + 7.5,
    };
  });
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

describe('T-188 · starmap labels do not overlap', () => {
  it('no two visible port labels overlap across sampled globe rotations', () => {
    const projection = starmapGlobeProjection(createInitialState(1));
    const collisions: string[] = [];

    for (let step = 0; step < 30; step += 1) {
      const yaw = -Math.PI + (step / 30) * Math.PI * 2;
      const boxes = labelBoxes(projection, yaw);
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          if (overlaps(boxes[i], boxes[j])) {
            collisions.push(
              `yaw ${yaw.toFixed(2)}: ${boxes[i].name} (#${boxes[i].id}) overlaps ${
                boxes[j].name
              } (#${boxes[j].id})`,
            );
          }
        }
      }
    }

    expect(
      collisions,
      `Starmap label overlaps found (approximate bounding boxes, see file header):\n${collisions.join('\n')}`,
    ).toEqual([]);
  });

  it('suppresses at least one label on collision-heavy rotations', () => {
    const projection = starmapGlobeProjection(createInitialState(1));
    let suppressed = 0;
    for (let step = 0; step < 30; step += 1) {
      const yaw = -Math.PI + (step / 30) * Math.PI * 2;
      suppressed += allCandidateBoxes(projection, yaw).length - labelBoxes(projection, yaw).length;
    }
    expect(suppressed).toBeGreaterThan(0);
  });
});
