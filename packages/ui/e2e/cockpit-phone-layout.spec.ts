import { test, expect, devices, type Page } from '@playwright/test';
import { skipFirstTurnWalkthrough, skipOpeningMarker } from './support/career';

// ---------------------------------------------------------------------------
// T-219 · THE COCKPIT AT PHONE WIDTH, PINNED.
//
// WHAT WAS BROKEN. At `devices['Pixel 5']` (393x851, clientHeight 727) the
// cockpit overlapped ITSELF — not overflowed, overlapped, which is why
// `document.scrollWidth === clientWidth` the whole time and nothing looked
// wrong to a scroll-based check. Two independent causes, both in `theme.css`:
//
//   (i) `.screen` is `display: grid` with no `grid-template-columns`, so its one
//       IMPLICIT track took a `min-content` automatic minimum. `.bezel`, `.wire`
//       and `.dock` do not wrap, so that minimum was 398px — inside a 341px
//       parent. Every child was blown out to 398px and the Settings and New game
//       switches measured `right: 424` against a 393px viewport, clipped
//       invisibly by `.tube { overflow: hidden }`.
//
//  (ii) The `@media (max-width: 900px)` block stacked `.main` into one column
//       while `.col.left` still carried `grid-template-rows: 200px auto`. The
//       bezel (237.6px) and dock (225.7px) left the `1fr` row 144.8px, so a
//       200px starmap row was forced into a 66.4px column: `pane starmap`
//       painted across `pane manifest-board` (h=25.3) and `pane trade`
//       (h=20.2), and `pane ship` was crushed to 2px.
//
// A third symptom, same family: three overlays are pinned a fixed distance up
// from the bottom of the tube (132-150px, all chosen against a desktop dock) and
// the phone dock is ~210px tall, so all three landed inside the dawn-hand tray.
//
// WHY THIS FILE EXISTS RATHER THAN A UNIT TEST. Every claim above is a measured
// BOUNDING BOX in a real engine, and a CSS grid's automatic minimum cannot be
// computed from source text. `src/__tests__/phone-layout.test.ts` is the
// complementary half — it guards the three declarations in `theme.css` that this
// geometry rests on, and it runs inside `npm test`, which this file does not.
// Neither replaces the other.
//
// NO NEW PLAYWRIGHT PROJECT, deliberately: a project would re-run all 40+ specs
// at this viewport and move the `@tour-one` denominator `flake-rate.spec.ts`
// gates on. Per-file `test.use` costs nothing else. Every test here is untagged
// for the same reason.
//
// RULING: UI-41 in `docs/UI-PRESENTATION-DECISIONS.md` — phone width IS a
// supported surface for the web build.
// ---------------------------------------------------------------------------

test.use({ ...devices['Pixel 5'] });

/** Every `.pane` box, plus every pair of them that overlaps. Computed in the
 *  page so one round trip returns a self-describing failure message. */
async function paneGeometry(page: Page) {
  return page.evaluate(() => {
    const panes = [...document.querySelectorAll('.pane')].map((p) => ({
      name: p.className,
      r: p.getBoundingClientRect(),
    }));
    const overlaps: string[] = [];
    for (let i = 0; i < panes.length; i += 1) {
      for (let j = i + 1; j < panes.length; j += 1) {
        const a = panes[i].r;
        const b = panes[j].r;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 0 && h > 0) {
          overlaps.push(`${panes[i].name} X ${panes[j].name} = ${w.toFixed(1)}x${h.toFixed(1)}`);
        }
      }
    }
    return {
      count: panes.length,
      heights: panes.map((p) => `${p.name}: ${p.r.height.toFixed(1)}`),
      shortest: Math.min(...panes.map((p) => p.r.height)),
      overlaps,
    };
  });
}

/** Do two live elements' boxes intersect? `null` for either means "not mounted",
 *  which is not an overlap. */
async function overlapArea(page: Page, a: string, b: string): Promise<number> {
  const boxA = await page.locator(a).first().boundingBox();
  const boxB = await page.locator(b).first().boundingBox();
  if (!boxA || !boxB) return 0;
  const w = Math.min(boxA.x + boxA.width, boxB.x + boxB.width) - Math.max(boxA.x, boxB.x);
  const h = Math.min(boxA.y + boxA.height, boxB.y + boxB.height) - Math.max(boxA.y, boxB.y);
  return w > 0 && h > 0 ? w * h : 0;
}

async function bootCockpit(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await skipFirstTurnWalkthrough(page);
  await page.goto('/');
  await expect(page.getByTestId('starmap-system').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test('no two cockpit panes overlap at phone width', async ({ page }) => {
  await bootCockpit(page);
  const geom = await paneGeometry(page);

  // The anti-gaming guard, and it comes FIRST: unmounting a pane would satisfy
  // every other assertion in this file. All four instruments must be on screen.
  expect(geom.count, 'a pane was unmounted rather than laid out').toBe(4);
  expect(geom.overlaps, geom.heights.join(' | ')).toEqual([]);
});

test('every cockpit pane still renders at a usable height at phone width', async ({ page }) => {
  await bootCockpit(page);
  const geom = await paneGeometry(page);

  // The second anti-gaming guard, and the one that fails loudest on the broken
  // build: crushing a pane to nothing also removes its overlaps. Pre-fix,
  // `pane ship` measured 2.0px and `pane trade` 20.2px. 40px is roughly one
  // header strip — below that the instrument is not present, it is a seam.
  expect(geom.shortest, geom.heights.join(' | ')).toBeGreaterThanOrEqual(40);
});

test('every masthead control is inside the viewport at phone width', async ({ page }) => {
  await bootCockpit(page);
  const width = page.viewportSize()!.width;

  const controls = page.locator('.ctrls button');
  const n = await controls.count();
  expect(n, 'the control cluster is empty — nothing was measured').toBeGreaterThanOrEqual(4);
  for (let i = 0; i < n; i += 1) {
    const label = (await controls.nth(i).textContent())?.trim() ?? `#${i}`;
    const box = (await controls.nth(i).boundingBox())!;
    expect(box.x, `${label} runs off the left edge`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${label} runs off the right edge`).toBeLessThanOrEqual(width);
  }

  // The bezel is the box whose blown-out `min-content` track carried the
  // switches off screen in the first place, so measure the cause too.
  const bezel = (await page.locator('.bezel').boundingBox())!;
  expect(bezel.x + bezel.width).toBeLessThanOrEqual(width);
});

test('the cockpit does not scroll the page sideways at phone width', async ({ page }) => {
  await bootCockpit(page);
  // The invariant the fix has to PRESERVE, not trade away: `.main` scrolls, the
  // document does not. `starmap-globe-touch.spec.ts` asserts the same thing at
  // its own viewport; if the board had been made to scroll by letting the
  // document overflow, both would fail here.
  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test('the dawn-hand tray is clear of the onboarding coach and operable', async ({ page }) => {
  await bootCockpit(page);

  // The day-1 dawn-hand coach is up at this point (`ONBOARDING_PROMPTS`
  // `dawn-roll`), which is exactly the overlay the bug report caught sitting on
  // the tray.
  await expect(page.getByTestId('onboarding')).toBeVisible();
  expect(await overlapArea(page, '.onboarding', '.dock'), 'the coach covers the tray').toBe(0);

  // Operable, not merely visible: every die inside the viewport, and End day
  // reachable without a scroll and accepting a real click.
  const width = page.viewportSize()!.width;
  const dice = page.locator('.die');
  const diceCount = await dice.count();
  expect(diceCount).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < diceCount; i += 1) {
    const box = (await dice.nth(i).boundingBox())!;
    expect(box.x, `die ${i} runs off the left edge`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `die ${i} runs off the right edge`).toBeLessThanOrEqual(width);
  }
  await expect(page.getByTestId('end-day')).toBeInViewport();
  await page.getByTestId('end-day').click({ trial: true });
});

test('an open storylet panel is clear of the tray at phone width', async ({ page }) => {
  await bootCockpit(page);

  // The panel is pinned `bottom: 150px`, a distance chosen against a desktop
  // dock; the phone dock is ~210px tall, so it landed on the tray like the two
  // coaches did. Driven through a real diegetic opener, never by forcing state.
  const openers = page.locator('[data-storylet-open]');
  expect(await openers.count(), 'no storylet was on offer — nothing was measured').toBeGreaterThan(
    0,
  );
  await openers.first().click();
  await expect(page.getByTestId('storylet-panel')).toBeVisible();

  expect(await overlapArea(page, '.storylet-panel', '.dock'), 'the panel covers the tray').toBe(0);
});

test('the first-turn walkthrough card is clear of the tray it teaches', async ({ page }) => {
  // Steps w1/w2 TEACH the dawn hand ("click any die in the hand to arm it") and
  // the card is NOT `pointer-events: none` — a card over the tray would eat the
  // clicks it asks for, so this rail is unplayable on a phone if it regresses.
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await skipOpeningMarker(page);
  await page.goto('/');
  await expect(page.getByTestId('starmap-system').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  await expect(page.locator('.walkthrough')).toBeVisible();
  expect(await overlapArea(page, '.walkthrough', '.dock'), 'the rails card covers the tray').toBe(
    0,
  );
});
