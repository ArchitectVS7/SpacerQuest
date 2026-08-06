import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState } from '@spacerquest/engine';

import {
  starmapGlobe,
  suppressLabels,
  GLOBE_LABEL_Y_OFFSET,
  GLOBE_MAX_PITCH,
  type GlobeView,
  type LabelMetrics,
} from '../format';

// ---------------------------------------------------------------------------
// T-188 → T-215 · A STANDING QUALITY GATE, NOW MEASURING THE GLOBE.
//
// Owner's read, verbatim (T-188): "already you should be flagging and failing
// this since the port names are overlapping with other ports and names." That
// tripwire shipped as an `it.fails` against the flat SVG map, which really did
// collide four pairs of labels. T-215 replaced that map with the ruled 3D globe
// and its label-collision suppressor, so this file is its 3D successor.
//
// THE `it.fails` → `it` FLIP IS PRE-AUTHORISED, NOT A SOFTENED TEST. A tripwire
// turning green is normally a halt-and-escalate. T-188's own delivered record
// warrants this one in advance, verbatim: "It currently fails against today's
// live map … Flips green the moment a redesigned map (4a/4b/4c) ships." T-215 is
// that ship — the ruled candidate 4B — so the flip is the tripwire doing exactly
// what it was written to do. Nothing about the claim was weakened: the sample
// went from ONE static frame to NINETY rotations, and the boxes got WIDER.
//
// WHY NINETY ROTATIONS. The T-188 ruling measured label placement across 90
// sampled angles (18 yaws × 5 pitches) and found 97.8% of them produce at least
// one collision among the 20 charted systems — "spin to a clean angle" is not a
// fallback that exists. The suppressor therefore has to hold at EVERY angle, and
// this file samples the same grid the ruling did.
//
// THE METRICS HERE ARE A PESSIMISTIC BOUND, NOT AN APPROXIMATION. vitest runs
// `environment: 'node'` (see `vitest.config.ts`) — there is no DOM and no canvas,
// which is precisely why `starmapGlobe` takes its `LabelMetrics` as an argument.
// The provider below is deliberately WIDER than any face the app can render:
// 0.62em per character (IBM Plex Mono is 0.6em, and every fallback in
// `--font-data` is narrower still) plus a viewBox unit of padding on each side,
// with a taller ascent/descent than the real font box. Suppression that clears a
// WIDER box necessarily clears the real one, so a pass here is a lower bound on
// the shipped behaviour rather than an estimate of it. The complementary proof
// against REAL `getBoundingClientRect()` boxes in the real font — which the
// ruling explicitly demanded, and which no DOM-less runner can give — is
// `e2e/starmap-globe.spec.ts`. Neither file replaces the other.
// ---------------------------------------------------------------------------

const UI_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

const FONT_SIZE = 8;
/** Strictly wider than IBM Plex Mono's 0.6em advance and every fallback. */
const PESSIMISTIC_CHAR_WIDTH = FONT_SIZE * 0.62;
/** A viewBox unit of slack on each side, so a near-miss counts as a collision. */
const BOX_PADDING = 1;

const METRICS: LabelMetrics = {
  widthOf: (text) => text.length * PESSIMISTIC_CHAR_WIDTH + BOX_PADDING * 2,
  ascent: FONT_SIZE * 0.9,
  descent: FONT_SIZE * 0.4,
};

/** The 90-angle grid the T-188 ruling measured on. */
const ROTATIONS: GlobeView[] = [];
for (let y = 0; y < 18; y += 1) {
  for (const pitch of [-GLOBE_MAX_PITCH, -0.6, 0, 0.6, GLOBE_MAX_PITCH]) {
    ROTATIONS.push({ yaw: (y * 20 * Math.PI) / 180, pitch, zoom: 1 });
  }
}

interface LabelBox {
  id: number;
  name: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function visibleLabelBoxes(globe: ReturnType<typeof starmapGlobe>): LabelBox[] {
  return globe.nodes
    .filter((n) => n.labelVisible)
    .map((n) => ({
      id: n.id,
      name: n.name,
      minX: n.sx - n.labelW / 2,
      maxX: n.sx + n.labelW / 2,
      minY: n.sy + GLOBE_LABEL_Y_OFFSET - METRICS.ascent,
      maxY: n.sy + GLOBE_LABEL_Y_OFFSET + METRICS.descent,
    }));
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function collisions(boxes: LabelBox[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (overlaps(boxes[i], boxes[j])) {
        out.push(`${boxes[i].name} (#${boxes[i].id}) overlaps ${boxes[j].name} (#${boxes[j].id})`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The box maths above is only valid while the rendered label keeps the geometry
// it is derived from. Pin both ends, so a CSS or JSX edit fails HERE and loudly
// rather than silently invalidating every assertion in the file.
// ---------------------------------------------------------------------------
describe('T-215 · the constants this file measures against are still the shipped ones', () => {
  const THEME = readFileSync(join(UI_SRC, 'theme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const APP = readFileSync(join(UI_SRC, 'App.tsx'), 'utf8');

  it('`.smsys .smlabel` still renders at 8px, anchored middle', () => {
    const rule = /\.smsys \.smlabel\s*\{([^}]*)\}/.exec(THEME);
    expect(rule, 'no `.smsys .smlabel` rule in theme.css').not.toBeNull();
    expect(rule![1]).toMatch(new RegExp(`font-size:\\s*${FONT_SIZE}px`));
    expect(rule![1]).toMatch(/text-anchor:\s*middle/);
  });

  it('the label is still anchored at the projection’s own y offset', () => {
    expect(GLOBE_LABEL_Y_OFFSET).toBe(16);
    expect(APP).toMatch(/className="smlabel"[\s\S]{0,200}?y=\{16\}/);
  });
});

describe('T-215 · no two port labels overlap, at ANY rotation of the globe', () => {
  const game = createInitialState(1);
  const here = game.player.currentSystemId;
  const COURSE = 14; // an arbitrary charted system, never the current one

  it('clears all 90 sampled rotations with no course set', () => {
    const failures: string[] = [];
    for (const view of ROTATIONS) {
      const found = collisions(visibleLabelBoxes(starmapGlobe(game, view, METRICS)));
      if (found.length > 0) {
        failures.push(`yaw ${view.yaw.toFixed(2)} pitch ${view.pitch}: ${found.join('; ')}`);
      }
    }
    expect(failures, `Starmap label overlaps found:\n${failures.join('\n')}`).toEqual([]);
  });

  it('clears all 90 sampled rotations with a course plotted', () => {
    const failures: string[] = [];
    for (const view of ROTATIONS) {
      const globe = starmapGlobe(game, view, METRICS, { courseId: COURSE });
      const found = collisions(visibleLabelBoxes(globe));
      if (found.length > 0) {
        failures.push(`yaw ${view.yaw.toFixed(2)} pitch ${view.pitch}: ${found.join('; ')}`);
      }
    }
    expect(failures, `Starmap label overlaps found:\n${failures.join('\n')}`).toEqual([]);
  });

  it('never suppresses the CURRENT system’s label, at any rotation', () => {
    for (const view of ROTATIONS) {
      const node = starmapGlobe(game, view, METRICS).nodes.find((n) => n.id === here)!;
      expect(node.labelVisible, `here-label hidden at yaw ${view.yaw}`).toBe(true);
    }
  });

  it('never suppresses the SET COURSE’s label, at any rotation', () => {
    for (const view of ROTATIONS) {
      const globe = starmapGlobe(game, view, METRICS, { courseId: COURSE });
      const node = globe.nodes.find((n) => n.id === COURSE)!;
      expect(node.labelVisible, `course-label hidden at yaw ${view.yaw}`).toBe(true);
      expect(globe.nodes.find((n) => n.id === here)!.labelVisible).toBe(true);
    }
  });

  it('suppresses a LABEL, never a NODE — every charted system is still drawn', () => {
    for (const view of ROTATIONS) {
      const ids = starmapGlobe(game, view, METRICS)
        .nodes.map((n) => n.id)
        .sort((a, b) => a - b);
      expect(ids).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    }
  });

  it('is NOT vacuously green — the suppressor really does drop labels', () => {
    // If this ever fails, either the map got sparse enough that suppression is
    // dead code, or the boxes stopped being measured. Both invalidate the file.
    const suppressing = ROTATIONS.filter((view) =>
      starmapGlobe(game, view, METRICS).nodes.some((n) => !n.labelVisible),
    );
    expect(suppressing.length).toBeGreaterThan(0);
  });
});

describe('T-215 · the ruled priority order, constructed', () => {
  // The ruling's order: current system → set course → nearest-to-camera, with
  // the hovered/selected system ahead of all of them ("until hovered/selected").
  const box = (id: number, depth: number) => ({
    id,
    minX: 0,
    maxX: 10,
    minY: 0,
    maxY: 8,
    depth,
  });

  it('resolves focus > here > course > nearest-to-camera', () => {
    const all = [box(1, -5), box(2, 9), box(3, 0), box(4, 5)];
    expect([...suppressLabels(all, { focusId: 4, hereId: 1, courseId: 3 })]).toEqual([4]);
    expect([...suppressLabels(all, { hereId: 1, courseId: 3 })]).toEqual([1]);
    expect([...suppressLabels(all, { courseId: 3 })]).toEqual([3]);
    expect([...suppressLabels(all, {})]).toEqual([2]);
  });
});
