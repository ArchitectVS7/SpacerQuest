import { test, expect, type Page } from '@playwright/test';
import { signOpeningMarker, skipFirstTurnWalkthrough } from './support/career';

// ---------------------------------------------------------------------------
// T-215 · THE GLOBE, PROVED ON THE RUNNING PAGE.
//
// The pure geometry has its own suites (`src/__tests__/starmap-globe.test.ts`
// and `starmap-label-overlap.test.ts`), but two of this task's accept clauses
// cannot be discharged without a browser and are discharged here:
//
//  1. "REAL drag/zoom, not a static frame." A pure function cannot be dragged.
//     Every rotation below is a real pointer gesture through `page.mouse`.
//  2. "REAL rendered text metrics for the collision boxes, not a fixed-character
//     -width approximation." The unit suite runs in vitest's DOM-less `node`
//     environment and can only assert a PESSIMISTIC BOUND. Here the labels are
//     laid out by the browser, in the loaded webfont, and read back through
//     `getBoundingClientRect()` — the actual rendered boxes, no model of them.
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await skipFirstTurnWalkthrough(page);
});

/** Boot the cockpit and wait until the map — and its FONT — are really settled.
 *  Measuring before `document.fonts.ready` measures the fallback stack, which is
 *  precisely the shortcut this spec exists to rule out. */
async function bootStarmap(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('starmap-system').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function svgBox(page: Page) {
  const box = await page.locator('.smsvg').boundingBox();
  expect(box, 'the starmap SVG has no layout box').not.toBeNull();
  return box!;
}

/** A real pointer drag across the globe. */
async function drag(page: Page, dx: number, dy: number): Promise<void> {
  const box = await svgBox(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 10 });
  await page.mouse.up();
}

interface Rect {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Every label the browser is ACTUALLY painting, with its ACTUAL box. */
async function renderedLabels(page: Page): Promise<Rect[]> {
  return page.$$eval('.smsvg .smlabel:not(.probe)', (els) =>
    els
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { name: el.textContent ?? '', x: r.x, y: r.y, w: r.width, h: r.height };
      }),
  );
}

function intersects(a: Rect, b: Rect, tolerance: number): boolean {
  return (
    a.x < b.x + b.w - tolerance &&
    a.x + a.w - tolerance > b.x &&
    a.y < b.y + b.h - tolerance &&
    a.y + a.h - tolerance > b.y
  );
}

test('the globe really rotates under a pointer drag', async ({ page }) => {
  await bootStarmap(page);
  const node = page.locator('[data-testid="starmap-system"][data-system-id="20"]');
  const before = await node.getAttribute('transform');
  const countBefore = await page.getByTestId('starmap-system').count();

  await drag(page, 140, 0);

  const after = await node.getAttribute('transform');
  expect(after, 'the drag moved nothing — this is a static frame').not.toBe(before);
  // Rotation is not culling: every charted system is still on the map.
  expect(await page.getByTestId('starmap-system').count()).toBe(countBefore);
  // …and the box it is drawn in did NOT resize, so the map does not breathe.
  expect(await page.locator('.smsvg').getAttribute('viewBox')).toBe('0 0 260 200');
});

test('no two RENDERED labels overlap, across successive real rotations', async ({ page }) => {
  await bootStarmap(page);
  // Eight rotations, boxes read straight off the layout engine. Tolerance is a
  // half pixel of antialiasing/rounding slack, not a licence to overlap: a real
  // collision is many pixels wide (T-188 measured an average of four per frame
  // on the un-suppressed map).
  const TOLERANCE_PX = 0.5;
  for (let i = 0; i < 8; i += 1) {
    await drag(page, 40 + i * 7, i % 2 === 0 ? 18 : -14);
    const rects = await renderedLabels(page);
    expect(rects.length, 'no labels rendered at all — the check would be vacuous').toBeGreaterThan(
      1,
    );
    const collisions: string[] = [];
    for (let a = 0; a < rects.length; a += 1) {
      for (let b = a + 1; b < rects.length; b += 1) {
        if (intersects(rects[a], rects[b], TOLERANCE_PX)) {
          collisions.push(`${rects[a].name} overlaps ${rects[b].name}`);
        }
      }
    }
    expect(collisions, `rotation ${i}: ${collisions.join('; ')}`).toEqual([]);
  }
});

test('the current system keeps its label at every rotation', async ({ page }) => {
  await bootStarmap(page);
  const hereLabel = page.locator('[data-testid="starmap-system"][data-here="1"] .smlabel');
  for (let i = 0; i < 6; i += 1) {
    await drag(page, 55, i % 2 === 0 ? 22 : -22);
    await expect(hereLabel).toBeVisible();
  }
});

test('zoom is real — wheel and the pointer-free buttons both move the geometry', async ({
  page,
}) => {
  await bootStarmap(page);
  const node = page.locator('[data-testid="starmap-system"][data-system-id="20"]');
  const home = await node.getAttribute('transform');

  const box = await svgBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  const zoomed = await node.getAttribute('transform');
  expect(zoomed).not.toBe(home);

  await page.getByTestId('globe-zoom-out').click();
  expect(await node.getAttribute('transform')).not.toBe(zoomed);

  await page.getByTestId('globe-reset').click();
  expect(await node.getAttribute('transform')).toBe(home);

  // The viewBox is fixed by construction — zoom scales inside it.
  expect(await page.locator('.smsvg').getAttribute('viewBox')).toBe('0 0 260 200');
});

test('a rotation does not also plot a course, but a tap does', async ({ page }) => {
  await bootStarmap(page);
  // The drag surface is the SVG and node clicks bubble through it, so this is the
  // single most likely functional regression on the whole task.
  await drag(page, 120, 30);
  await expect(page.getByTestId('route-preview')).toHaveCount(0);

  await page.locator('[data-testid="starmap-system"][data-system-id="2"]').click();
  await expect(page.getByTestId('route-preview')).toBeVisible();
});

test('the course lane is BRIGHT and the hub lanes are DIM', async ({ page }) => {
  await bootStarmap(page);
  await page.locator('[data-testid="starmap-system"][data-system-id="5"]').click();
  await expect(page.getByTestId('route-preview')).toBeVisible();

  const bright = page.locator('.smsvg line[data-lane-bright="1"]');
  await expect(bright).toHaveCount(1);
  await expect(bright).toHaveAttribute('data-lane-to', '5');

  const dim = page.locator('.smsvg line[data-lane-bright="0"]').first();
  const [brightStyle, dimStyle] = await Promise.all([
    bright.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { stroke: cs.stroke, opacity: cs.opacity };
    }),
    dim.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { stroke: cs.stroke, opacity: cs.opacity };
    }),
  ]);
  expect(brightStyle.stroke).not.toBe(dimStyle.stroke);
  expect(Number(brightStyle.opacity)).toBeGreaterThan(Number(dimStyle.opacity));

  // The bright lane really ends on the plotted system, not somewhere near it.
  const [end, node] = await Promise.all([
    bright.evaluate((el) => ({
      x: Number(el.getAttribute('x2')),
      y: Number(el.getAttribute('y2')),
    })),
    page
      .locator('[data-testid="starmap-system"][data-system-id="5"]')
      .evaluate((el) => el.getAttribute('transform') ?? ''),
  ]);
  const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(node)!;
  expect(end.x).toBeCloseTo(Number(m[1]), 3);
  expect(end.y).toBeCloseTo(Number(m[2]), 3);
});

test('the hub is the CURRENT system, not always Sol', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill('1');
  await page.getByRole('button', { name: 'Roll' }).click();
  await signOpeningMarker(page);
  await page.evaluate(() => document.fonts.ready);

  // Every lane starts at Sol while the ship is docked at Sol …
  const solNode = await page
    .locator('[data-testid="starmap-system"][data-system-id="1"]')
    .getAttribute('transform');
  const solXy = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(solNode!)!;
  let origins = await page.$$eval('.smsvg .lanes line', (els) =>
    els.map((el) => [Number(el.getAttribute('x1')), Number(el.getAttribute('y1'))]),
  );
  expect(origins.length).toBeGreaterThan(0);
  for (const [x, y] of origins) {
    expect(x).toBeCloseTo(Number(solXy[1]), 3);
    expect(y).toBeCloseTo(Number(solXy[2]), 3);
  }

  // … and every lane starts at Aldebaran-1 the moment the ship is docked there.
  await page.getByTestId('die').first().click();
  await page.locator('[data-testid="starmap-system"][data-system-id="2"]').click();
  await page.getByTestId('confirm-jump').click();
  await expect(page.locator('[data-testid="starmap-system"][data-here="1"]')).toHaveAttribute(
    'data-system-id',
    '2',
  );

  const hereNode = await page
    .locator('[data-testid="starmap-system"][data-here="1"]')
    .getAttribute('transform');
  const hereXy = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(hereNode!)!;
  origins = await page.$$eval('.smsvg .lanes line', (els) =>
    els.map((el) => [Number(el.getAttribute('x1')), Number(el.getAttribute('y1'))]),
  );
  expect(origins.length).toBeGreaterThan(0);
  for (const [x, y] of origins) {
    expect(x).toBeCloseTo(Number(hereXy[1]), 3);
    expect(y).toBeCloseTo(Number(hereXy[2]), 3);
  }
});

test('a far-hemisphere system is dimmed but still charted and still clickable', async ({
  page,
}) => {
  await bootStarmap(page);
  let backId: string | null = null;
  for (let i = 0; i < 10 && backId === null; i += 1) {
    backId = await page.$$eval('[data-testid="starmap-system"]', (els) => {
      const hit = els.find(
        (el) =>
          Number(el.getAttribute('data-depth')) < 0 &&
          el.getAttribute('data-reachable') === '1' &&
          el.getAttribute('data-here') === '0',
      );
      return hit ? hit.getAttribute('data-system-id') : null;
    });
    if (backId === null) await drag(page, 60, 0);
  }
  expect(backId, 'no far-hemisphere system found in ten rotations').not.toBeNull();

  const node = page.locator(`[data-testid="starmap-system"][data-system-id="${backId}"]`);
  await expect(node).toHaveClass(/\bback\b/);
  await node.click();
  await expect(page.getByTestId('route-preview')).toBeVisible();
});

test('hovering a system whose label was suppressed brings the label back', async ({ page }) => {
  await bootStarmap(page);
  const hiddenId = await page.$$eval('[data-testid="starmap-system"]', (els) => {
    const hit = els.find(
      (el) =>
        el.getAttribute('data-label-hidden') === '1' && el.getAttribute('data-reachable') === '1',
    );
    return hit ? hit.getAttribute('data-system-id') : null;
  });
  expect(hiddenId, 'nothing was suppressed — the suppressor is not doing any work').not.toBeNull();

  const node = page.locator(`[data-testid="starmap-system"][data-system-id="${hiddenId}"]`);
  await expect(node.locator('.smlabel')).toBeHidden();
  await node.hover();
  await expect(node.locator('.smlabel')).toBeVisible();
});
