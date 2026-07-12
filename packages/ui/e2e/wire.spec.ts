import { test, expect, type Page } from '@playwright/test';
import {
  createInitialState,
  startDay,
  endDay,
  applyPlayerAction,
  createSave,
} from '@spacerquest/engine';
import { FLAWS } from '@spacerquest/content';

// T-306 acceptance: a flaw-override headline made at dusk appears the next dawn
// in the browsable day log, and that log paginates 100+ days without rendering
// every row (virtualized). Every expected value is derived from the engine here
// — the UI must match the rules, never the other way round (repo test charter).

// SEED 1 overrides several NPCs on the day-1 dusk (e.g. Silk Dagger), filed under
// day 1 and surfaced at the day-2 dawn. Discovered by scanning seeds against the
// engine mirror below; fixed here so every run is deterministic.
const SEED = 1;

// The past-tense flaw fragments the engine files after an NPC's name — the same
// authored content the UI classifies a flaw-override headline from.
const FLAW_DETAILS: readonly string[] = Object.values(FLAWS).map((f) => f.detail);
const isFlawOverride = (message: string): boolean =>
  FLAW_DETAILS.some((detail) => message.endsWith(detail));

/** Advance idle dusks against the engine until a flaw-override wire entry lands,
 *  mirroring the store's idle-day loop so the UI stays in lockstep. */
function findFlawOverride(): { daysToAdvance: number; headline: string; duskDay: number } {
  let state = startDay(createInitialState(SEED)).state;
  for (let day = 1; day <= 40; day++) {
    const { state: dusk, events } = endDay(state);
    const fo = events.find((e) => e.type === 'WireEntry' && isFlawOverride(e.message));
    if (fo && fo.type === 'WireEntry') {
      return { daysToAdvance: day, headline: fo.message, duskDay: fo.day };
    }
    state = startDay(dusk).state;
  }
  throw new Error(`no flaw override generated within 40 days for seed ${SEED}`);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  // Settle the dawn roll + ticker so DOM reads are stable, not mid-animation.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Start a fresh, deterministic career on a chosen seed, entirely through the UI. */
async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

test('a flaw-override headline from dusk appears next dawn', async ({ page }) => {
  const { daysToAdvance, headline, duskDay } = findFlawOverride();

  await page.goto('/');
  await newGameSeed(page, SEED);

  // Close each day; dusk makes the news, dawn brings it to the wire.
  for (let i = 0; i < daysToAdvance; i++) await page.getByTestId('end-day').click();
  // Fresh careers start on day 1, so each closed day advances the counter by one.
  await expect(page.getByTestId('day')).toHaveText(String(1 + daysToAdvance));

  // Open the browsable log and find the exact dusk headline, tagged as a flaw
  // override (classified in format.ts from the authored FLAWS details).
  await page.getByTestId('wire-log-toggle').click();
  const entry = page.locator('[data-testid="wire-entry"][data-wire-kind="flaw-override"]', {
    hasText: headline,
  });
  await expect(entry).toBeVisible();

  // …and it is filed under the day whose dusk produced it.
  await expect(page.locator(`[data-testid="wire-day"][data-day="${duskDay}"]`)).toBeVisible();
});

test('log paginates 100+ days without rendering every row (virtualized)', async ({ page }) => {
  // Build a 100+ day career headlessly and boot the store straight into it via
  // the save envelope — deterministic, and far faster than 100 UI clicks.
  let state = startDay(createInitialState(SEED)).state;
  for (let i = 0; i < 110; i++) state = startDay(endDay(state).state).state;
  expect(state.day).toBeGreaterThanOrEqual(100);

  // A real 110-day career has acknowledged the forced day-30 Tour One resolution
  // (T-311) — its ceremony is a full-screen beat the player clears before flying
  // on. Acknowledge it once here (a no-op mutation to the day trajectory: it only
  // sets an ack flag) so this boots-into-day-110 fixture reflects real play;
  // otherwise the still-open ceremony would cover the cockpit this test drives.
  const resolution = state.storylets.available.find((o) =>
    o.storyletId.startsWith('resolution.tour-one.'),
  );
  if (resolution) {
    state = applyPlayerAction(state, {
      type: 'Storylet',
      storyletId: resolution.storyletId,
      choiceId: resolution.choices[0].id,
    }).state;
  }

  const save = createSave(state);
  await page.addInitScript((s) => window.localStorage.setItem('sq.save.v1', s), save);
  await page.goto('/');

  // The career really advanced past 100 days.
  await expect(page.getByTestId('day')).toHaveText(String(state.day));

  await page.getByTestId('wire-log-toggle').click();

  // Virtualization: only a bounded window of rows is in the DOM even though the
  // log spans 100+ days of headlines (thousands of entries).
  const rendered = await page.getByTestId('wire-entry').count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThanOrEqual(60);

  // The log reads chronologically: the oldest day sits at the top, and the
  // freshest days are not rendered until scrolled to.
  const lastNewsDay = state.day - 1; // wire entries file under the dusk day
  await expect(page.locator('[data-testid="wire-day"][data-day="1"]')).toBeVisible();
  await expect(page.locator(`[data-testid="wire-day"][data-day="${lastNewsDay}"]`)).toHaveCount(0);

  // Scroll the windowed viewport to the bottom → a late day appears while the
  // earliest day leaves the DOM. That is windowing, not a full render.
  await page
    .locator('[data-testid="wire-log"] .wire-log-view')
    .evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.locator(`[data-testid="wire-day"][data-day="${lastNewsDay}"]`)).toBeVisible();
  await expect(page.locator('[data-testid="wire-day"][data-day="1"]')).toHaveCount(0);
});

test('NPC names link to a mini dossier of hints, not raw stats', async ({ page }) => {
  await page.goto('/');
  await newGameSeed(page, SEED);
  // One dusk is enough to fill the wire with NPC headlines.
  await page.getByTestId('end-day').click();

  await page.getByTestId('wire-log-toggle').click();
  const link = page.getByTestId('npc-link').first();
  await expect(link).toBeVisible();
  await link.click();

  const dossier = page.getByTestId('npc-dossier');
  await expect(dossier).toBeVisible();
  await expect(dossier.getByTestId('dossier-name')).not.toBeEmpty();
  await expect(dossier.getByTestId('dossier-ship')).toContainText('SHIP');
  await expect(dossier.getByTestId('dossier-standing')).not.toBeEmpty();

  // "disposition hints — not raw stats": no stat label leaks into the dossier.
  const text = await dossier.innerText();
  for (const stat of ['PILOT', 'GUNS', 'TRADE', 'GRIT', 'GUILE']) {
    expect(text).not.toContain(stat);
  }

  // The dossier dismisses on its close control.
  await dossier.getByTestId('dossier-close').click();
  await expect(page.getByTestId('npc-dossier')).toHaveCount(0);
});
