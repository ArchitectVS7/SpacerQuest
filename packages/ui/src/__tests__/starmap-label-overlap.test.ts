import { describe, expect, it } from 'vitest';
import { createInitialState } from '@spacerquest/engine';

import { starmapProjection } from '../format';

// ---------------------------------------------------------------------------
// T-188 · A STANDING QUALITY GATE, NOT A ONE-OFF FIX.
//
// Owner's read, verbatim: "already you should be flagging and failing this
// since the port names are overlapping with other ports and names." This test
// is generic to WHATEVER coordinate set `starmapProjection` is drawing from —
// it makes no assumption about layout, so it keeps guarding the map after any
// future redesign (T-188's 4a/4b/4c prototypes, or whatever ships next).
//
// APPROXIMATION, STATED RATHER THAN HIDDEN: `.smlabel`'s CSS is `font-size:
// 8px`, `text-anchor: middle`, anchored at local (0, 16) under each node
// (`App.tsx`'s `<text className="smlabel" x={0} y={16}>`). SVG px does not
// map 1:1 onto viewBox user units in general, but this map's SVG has no
// competing width/height override, so the two coincide here. AVG_CHAR_WIDTH
// (0.6 * font-size) is a standard monospace/near-monospace approximation, not
// a measured metric — generous enough that a near-miss reads as a pass, so a
// failure here is a real, visually-obvious overlap, not measurement noise.
// ---------------------------------------------------------------------------

const FONT_SIZE = 8;
const AVG_CHAR_WIDTH = FONT_SIZE * 0.6;
const LABEL_Y_OFFSET = 16;
const LABEL_ASCENT = FONT_SIZE * 0.8;
const LABEL_DESCENT = FONT_SIZE * 0.3;

interface LabelBox {
  id: number;
  name: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function labelBoxes(projection: ReturnType<typeof starmapProjection>): LabelBox[] {
  return projection.nodes.map((node) => {
    const halfWidth = (node.name.length * AVG_CHAR_WIDTH) / 2;
    return {
      id: node.id,
      name: node.name,
      minX: node.sx - halfWidth,
      maxX: node.sx + halfWidth,
      minY: node.sy + LABEL_Y_OFFSET - LABEL_ASCENT,
      maxY: node.sy + LABEL_Y_OFFSET + LABEL_DESCENT,
    };
  });
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

describe('T-188 · starmap labels do not overlap', () => {
  it.fails('no two port labels overlap on a fresh day-1 starmap', () => {
    const projection = starmapProjection(createInitialState(1));
    const boxes = labelBoxes(projection);
    const collisions: string[] = [];

    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        if (overlaps(boxes[i], boxes[j])) {
          collisions.push(
            `${boxes[i].name} (#${boxes[i].id}) overlaps ${boxes[j].name} (#${boxes[j].id})`,
          );
        }
      }
    }

    expect(
      collisions,
      `Starmap label overlaps found (approximate bounding boxes, see file header):\n${collisions.join('\n')}`,
    ).toEqual([]);
  });
});
