import { test, expect, type Page } from '@playwright/test';
import { createInitialState, startDay, createSave } from '@spacerquest/engine';
import { OPENING_KEY, signOpeningMarker } from './support/career';

// FIRST_RUN_WALKTHROUGH: tests-first-run — the marker and rails handoff are the
// subject of this suite, so skipping them would erase the behavior under test.

// ---------------------------------------------------------------------------
// T-200 acceptance: THE OPENING MARKER — the debt as a cold open.
//
// The Accept's clauses, one test each:
//   A · the debt is on the FIRST screen of a new run — no navigation, no menu,
//       no click, and the figure is the ENGINE's, asserted as an identity;
//   B · the treatment is MEASURABLY distinct from the routine in-play readouts
//       (the bezel chip and the Trade pane's GUILD DEBT ledger);
//   C · signing it releases the cockpit — and hands off to T-187's walkthrough,
//       which proves the suppression is ORDERING, not suppression-for-good;
//   D · it does not re-fire on reload;
//   E · a returning player booting a save never sees it at all;
//   F · a fresh career through the REAL masthead control re-arms it, because
//       every career is out there under a marker of its own.
//
// This is the ONE suite (with `walkthrough.spec.ts`) that does not stamp the
// first-time overlays away — it is the suite that boots them armed and drives
// them. Everything below goes through the DOM a player sees; nothing calls the
// store. The only engine import is FIXTURE CONSTRUCTION (test E's save blob, and
// test A's read of the opening position), never a shortcut for a player action.
// ---------------------------------------------------------------------------

const marker = (page: Page) => page.getByTestId('opening-marker');

/** The engine's own opening position — the source of truth this UI presents.
 *  Read here so no assertion below can pin an economy constant: if
 *  `state.ts`'s `debt` is ever tuned, this spec follows it instead of failing. */
const OPENING = startDay(createInitialState(424242)).state;

/** Computed font size in px for the first match of a testid. */
async function fontSize(page: Page, testId: string): Promise<number> {
  return page
    .getByTestId(testId)
    .first()
    .evaluate((el) => Number.parseFloat(window.getComputedStyle(el).fontSize));
}

test.beforeEach(async ({ page }) => {
  // Settle the dawn-roll scramble AND put this beat's own bloom/read-in on its
  // instant rail, so the settled DOM exists on the very next render. The CSS
  // keeps every animation inside `@media not (prefers-reduced-motion: reduce)`
  // precisely so this is "never created", not "created and skipped".
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

// ---------------------------------------------------------------------------
// A · it is on the first screen of a new run
// ---------------------------------------------------------------------------

test('a new run opens on the Guild marker, with the debt as the headline', async ({ page }) => {
  // A genuinely virgin profile: isolated context, empty localStorage, no stamp.
  await page.goto('/');

  // No navigation, no menu, no click — this is the first screen.
  await expect(marker(page)).toBeVisible();

  // THE FIGURE IS THE ENGINE'S. Asserted as an identity against
  // `createInitialState`, never against a literal 25000 — a UI spec that pinned
  // the number would quietly make an economy constant un-tunable from here.
  await expect(marker(page)).toHaveAttribute('data-opening-debt', String(OPENING.player.debt));
  await expect(marker(page)).toHaveAttribute('data-opening-due', String(OPENING.player.debtDueDay));
  await expect(page.getByTestId('opening-marker-debt')).toHaveText(
    `${OPENING.player.debt.toLocaleString()} CR`,
  );
  await expect(page.getByTestId('opening-marker-due')).toContainText(
    `DAY ${OPENING.player.debtDueDay}`,
  );

  // THE FRAMING THE ASK NAMES: the debt is why you are out here, and it comes
  // from obligations you took on before the game began.
  const prose = page.getByTestId('opening-marker-prose');
  await expect(prose.first()).toContainText('prior obligations');
  await expect(prose.first()).toContainText('Merchant Guild of Sol-3');
  // …and the tone is a called marker, not a ledger line.
  await expect(page.getByTestId('opening-marker-kicker')).toContainText('MARKER CALLED');
  await expect(page.getByTestId('opening-marker-signoff')).not.toBeEmpty();

  // The human-checked artefact. `test-results/` is gitignored — nothing binary
  // is committed; this is the screenshot the Accept's "prominent placement, tone
  // that reads as ominous" clause is judged from, and it is READ, not just
  // written (see the task's Delivered note).
  await page.screenshot({ path: 'test-results/T-200-opening-marker.png', fullPage: true });
});

// ---------------------------------------------------------------------------
// B · measurably distinct from the routine in-play readouts
// ---------------------------------------------------------------------------

test('the marker is a different register from the bezel chip and the debt ledger', async ({
  page,
}) => {
  await page.goto('/');
  await expect(marker(page)).toBeVisible();

  // The frame owns the middle of the tube. A comparison, not a vibe: the
  // viewport centre must land inside it.
  const box = await page.locator('.om-frame').boundingBox();
  const size = page.viewportSize();
  expect(box).not.toBeNull();
  expect(size).not.toBeNull();
  const cx = size!.width / 2;
  const cy = size!.height / 2;
  expect(box!.x).toBeLessThanOrEqual(cx);
  expect(box!.x + box!.width).toBeGreaterThanOrEqual(cx);
  expect(box!.y).toBeLessThanOrEqual(cy);
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(cy);

  // …and the SAME number, in its routine ledger voice, is still on the bezel
  // underneath — unchanged, because this task changed how the debt is first
  // shown, never what it is. The measured gap is what "distinct treatment"
  // means here: the dispatch's figure is at least 2.5x the chip's type.
  await expect(page.getByTestId('debt-chip')).toContainText(OPENING.player.debt.toLocaleString());
  const headline = await fontSize(page, 'opening-marker-debt');
  const chip = await fontSize(page, 'debt-chip');
  expect(chip).toBeGreaterThan(0);
  expect(headline / chip).toBeGreaterThanOrEqual(2.5);
});

// ---------------------------------------------------------------------------
// C · signing it releases the cockpit, and hands off to the walkthrough
// ---------------------------------------------------------------------------

test('signing the marker releases the cockpit and hands off to the first-turn walkthrough', async ({
  page,
}) => {
  await page.goto('/');
  await expect(marker(page)).toBeVisible();

  // While the dispatch stands, T-187's card is suppressed — one first-time
  // overlay at a time.
  await expect(page.getByTestId('walkthrough')).toHaveCount(0);

  await signOpeningMarker(page);
  await expect(marker(page)).toHaveCount(0);

  // The suppression was ORDERING, not suppression-for-good: the walkthrough is
  // sitting exactly where it always was, on step 1.
  await expect(page.getByTestId('walkthrough')).toBeVisible();
  await expect(page.getByTestId('walkthrough')).toHaveAttribute(
    'data-walkthrough-step',
    'w1-dawn-hand',
  );
  // The cockpit underneath is live — the dawn hand takes a click.
  await page.getByTestId('walkthrough-next').click();
  await expect(page.getByTestId('walkthrough')).toHaveAttribute(
    'data-walkthrough-step',
    'w2-assign-die',
  );

  await page.screenshot({ path: 'test-results/T-200-cockpit-after-dismiss.png', fullPage: true });
});

// ---------------------------------------------------------------------------
// D · it does not re-fire on reload
// ---------------------------------------------------------------------------

test('a signed marker stays signed across a reload', async ({ page }) => {
  await page.goto('/');
  await signOpeningMarker(page);
  await expect(marker(page)).toHaveCount(0);

  // Persisted the moment it was signed, so a mid-day-1 reload does not drop the
  // dispatch a second time.
  expect(await page.evaluate((key) => window.localStorage.getItem(key), OPENING_KEY)).toBe(
    JSON.stringify({ v: 1, status: 'seen' }),
  );

  await page.reload();
  await expect(marker(page)).toHaveCount(0);
  // …and the career underneath resumed where it was.
  await expect(page.getByTestId('walkthrough')).toHaveAttribute(
    'data-walkthrough-step',
    'w1-dawn-hand',
  );
});

// ---------------------------------------------------------------------------
// E · a returning player never sees it
// ---------------------------------------------------------------------------

test('a returning player booting a save never sees the marker', async ({ page }) => {
  // Offline save-fixture construction only (the walkthrough/wire/combat
  // precedent); NO marker key is written, so the ARMING RULE is what has to keep
  // this cockpit clean — not a stamp the test applied.
  const base = startDay(createInitialState(424242)).state;
  base.day = 9;
  const save = createSave(base, 424242);
  await page.addInitScript((s) => {
    if (!window.localStorage.getItem('sq.save.v1')) window.localStorage.setItem('sq.save.v1', s);
  }, save);
  await page.goto('/');

  await expect(page.getByTestId('day')).toHaveText('9');
  await expect(marker(page)).toHaveCount(0);
  // The debt is still on the bezel in its routine voice, which is the point:
  // nothing about the in-play readouts moved.
  await expect(page.getByTestId('debt-chip')).toBeVisible();
});

// ---------------------------------------------------------------------------
// F · every career opens under its own marker
// ---------------------------------------------------------------------------

test('a fresh career rolled from the masthead re-arms the marker', async ({ page }) => {
  await page.goto('/');
  await signOpeningMarker(page);
  await expect(marker(page)).toHaveCount(0);

  // Through the UI, not the store: this is the per-career arming rule, and it is
  // the one thing about T-200 most likely to regress into the walkthrough's
  // once-per-profile rule.
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill('887');
  await page.getByRole('button', { name: 'Roll' }).click();

  await expect(marker(page)).toBeVisible();
  // A new career, a new marker — carrying that career's own opening figure.
  await expect(marker(page)).toHaveAttribute(
    'data-opening-debt',
    String(startDay(createInitialState(887)).state.player.debt),
  );
  await signOpeningMarker(page);
  await expect(marker(page)).toHaveCount(0);
});
