import { test, expect, type CDPSession, type Page } from '@playwright/test';
import { skipFirstTurnWalkthrough } from './support/career';

// ---------------------------------------------------------------------------
// T-215 · THE T-188 MOBILE FAILURE, ROOT-CAUSED AND THEN GATED.
//
// The open risk this task inherited, verbatim from T-188's record: "the
// interactive HTML prototypes (4a/4b, sent as standalone files) did not work
// when opened on the owner's mobile app/device. Not investigated." The
// prototypes were never committed and are gone from disk, so the artefact cannot
// be inspected — but the failure MODE can be reproduced, and that is what the
// first test below does rather than asserting a cause.
//
// TWO CANDIDATE CAUSES. Both are addressed; only one is a product defect.
//
//   (a) A REAL CODE DEFECT — mouse-only handlers and no `touch-action`. A drag
//       built on `mousedown/mousemove/mouseup` receives nothing from a touch
//       device, and without `touch-action: none` the browser claims the gesture
//       for scrolling before any handler could run. `the shape the T-188
//       prototype had does not rotate under touch` reproduces exactly that shape
//       from first principles and shows it dead under a real touch drag; the
//       tests after it show the SHIPPED globe alive under the identical input.
//       That pair is what turns "never root-caused" into a measured cause plus a
//       standing regression test, and it is why the negative control is here
//       rather than in a scratch file that would rot.
//
//   (b) A DISTRIBUTION ARTEFACT, not a product defect — and explicitly
//       RE-SCOPED, not silently dropped. The prototypes were sent as standalone
//       HTML attachments, and mobile mail/chat clients routinely preview an HTML
//       attachment in a sandboxed viewer with scripting disabled, in which case
//       nothing interactive can work however it is coded. This cause cannot
//       apply to the shipped build: the shipped surfaces are the Electron app
//       and the Vite-served web build, and `index.html` already carries
//       `<meta name="viewport" content="width=device-width, initial-scale=1">`.
//       Recorded in the T-215 TASKS.md entry with that reason.
//
// WHY THIS VIEWPORT AND NOT `devices['Pixel 5']`. The risk under test is TOUCH
// INPUT, and that is what is emulated here (`hasTouch` + `isMobile`, so the page
// gets the mobile viewport treatment and real touch events). At Pixel 5's 393px
// the COCKPIT AS A WHOLE overlaps itself — the manifest board paints across the
// starmap — which is a pre-existing, task-independent limitation of a fixed
// console layout, filed in TASKS.md rather than quietly worked around here. A
// touch test run inside a broken layout would be measuring the layout, not the
// gesture.
//
// A second Playwright PROJECT was deliberately not added: it would double the
// runtime of all 40+ specs and move the `@tour-one` denominator that
// `flake-rate.spec.ts` gates on. Per-file `test.use` costs nothing else.
// ---------------------------------------------------------------------------

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 1024, height: 800 },
  deviceScaleFactor: 2,
});

/** A real touch drag, dispatched through CDP so the browser sees genuine touch
 *  input — not a synthesised `PointerEvent`, which would prove nothing about
 *  whether a touch device can drive this control. */
async function touchDrag(
  cdp: CDPSession,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 8,
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y, id: 1 }],
  });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
          id: 1,
        },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** A real two-finger pinch, opening from `gap` to `gap * factor`. */
async function touchPinch(
  cdp: CDPSession,
  centre: { x: number; y: number },
  gap: number,
  factor: number,
  steps = 8,
): Promise<void> {
  const points = (half: number) => [
    { x: centre.x - half, y: centre.y, id: 1 },
    { x: centre.x + half, y: centre.y, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(gap / 2) });
  for (let i = 1; i <= steps; i += 1) {
    const half = (gap / 2) * (1 + ((factor - 1) * i) / steps);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(half) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function bootStarmap(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await skipFirstTurnWalkthrough(page);
  await page.goto('/');
  await expect(page.getByTestId('starmap-system').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function svgCentre(page: Page) {
  const box = await page.locator('.smsvg').boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, box: box! };
}

// --- (a), the negative control: the shape the prototype had, proved dead ----

const MOUSE_ONLY_PROTOTYPE = `
  <style>#stage { width: 300px; height: 300px; background: #111; }</style>
  <div id="stage"></div><output id="yaw">0</output>
  <script>
    // Exactly the T-188 prototype's shape: mouse-only listeners, no touch-action.
    let yaw = 0, dragging = false, lastX = 0;
    const stage = document.getElementById('stage');
    const out = document.getElementById('yaw');
    stage.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      yaw += e.clientX - lastX; lastX = e.clientX; out.textContent = String(yaw);
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  </script>`;

const POINTER_FIX = `
  <style>#stage { width: 300px; height: 300px; background: #111; touch-action: none; }</style>
  <div id="stage"></div><output id="yaw">0</output>
  <script>
    // The shipped globe's shape: Pointer Events plus touch-action: none.
    let yaw = 0, dragging = false, lastX = 0;
    const stage = document.getElementById('stage');
    const out = document.getElementById('yaw');
    stage.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      yaw += e.clientX - lastX; lastX = e.clientX; out.textContent = String(yaw);
    });
    window.addEventListener('pointerup', () => { dragging = false; });
  </script>`;

// These two are a PAIR and must be read together: the first shows the failure,
// the second shows the same gesture working, which is what makes the first a
// measurement rather than a broken harness. They are separate tests because a
// CDP touch sequence is only good for one gesture per page — a second sequence
// after a `setContent` is swallowed by the renderer, which would have made a
// two-phase test silently green for the wrong reason.
test('ROOT CAUSE (a): a mouse-only, touch-action-less drag is DEAD under touch', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await page.setContent(MOUSE_ONLY_PROTOTYPE);
  await touchDrag(cdp, { x: 60, y: 150 }, { x: 240, y: 150 });
  expect(
    await page.locator('#yaw').textContent(),
    'the reproduction rotated — the negative control is not reproducing the failure',
  ).toBe('0');
});

test('ROOT CAUSE (a): the SAME touch drag drives Pointer Events + touch-action:none', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  await page.setContent(POINTER_FIX);
  await touchDrag(cdp, { x: 60, y: 150 }, { x: 240, y: 150 });
  expect(Number(await page.locator('#yaw').textContent())).not.toBe(0);
});

// --- the shipped globe, under the identical touch input ---------------------

test('the shipped globe rotates under a real touch drag', async ({ page }) => {
  await bootStarmap(page);
  const cdp = await page.context().newCDPSession(page);
  const node = page.locator('[data-testid="starmap-system"][data-system-id="20"]');
  const before = await node.getAttribute('transform');

  const { x, y } = await svgCentre(page);
  await touchDrag(cdp, { x: x - 80, y }, { x: x + 80, y });

  expect(await node.getAttribute('transform')).not.toBe(before);
});

test('a two-finger pinch zooms the globe', async ({ page }) => {
  await bootStarmap(page);
  const cdp = await page.context().newCDPSession(page);
  const node = page.locator('[data-testid="starmap-system"][data-system-id="20"]');
  const before = await node.getAttribute('transform');

  const { x, y } = await svgCentre(page);
  await touchPinch(cdp, { x, y }, 80, 1.9);

  expect(await node.getAttribute('transform')).not.toBe(before);
});

test('a TAP still plots a course — a tap is not a drag', async ({ page }) => {
  await bootStarmap(page);
  const node = page.locator('[data-testid="starmap-system"][data-system-id="2"]');
  const box = await node.boundingBox();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByTestId('route-preview')).toBeVisible();
});

test('the starmap pane does not scroll the page sideways at a touch viewport', async ({ page }) => {
  await bootStarmap(page);
  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

  // The pointer-free controls are reachable without a gesture at all — the
  // standing fallback if a platform ever swallows touch the way (a) did.
  await expect(page.getByTestId('globe-zoom-in')).toBeVisible();
  await expect(page.getByTestId('globe-reset')).toBeVisible();
});
