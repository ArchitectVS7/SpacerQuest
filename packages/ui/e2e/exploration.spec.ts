import { test, expect, type Page } from '@playwright/test';
import { EXPLORATION_NAV_DC, EXPLORATION_FUEL_COST } from '@spacerquest/content';

// T-1403 acceptance: the engine's Explore action — nav check, fuel, beacons /
// derelicts, salvage / contraband pods / Signal Fragments — is reached ENTIRELY
// through the real UI (no state injection, no API calls), the sealed-pod choice
// is taken with its risk visible, a fragment is gained, and the Nemesis File
// renders non-empty. A typed exploration fail renders as a visible notice.
//
// SEED FIXTURE (found via the exact UI dispatch path — startDay(createInitialState)
// then applyPlayerAction Explore, the same fork stream the store calls): seed 45
// deals the dawn hand [20,18,12,9,2] on Sol. Sweeping die 0 (value 20 → 20+PILOT 1
// = 21, clears nav DC 12) discovers a DERELICT whose seeded loot roll yields BOTH a
// Signal Fragment AND a sealed contraband pod. Die 3 (value 9 → 10 < 12) fails the
// nav check — the typed ExplorationFailed(nav-check) path for the notice test.
const SEED = 45;
const HIGH_DIE = 0; // value 20 — clears the nav check, derelict + fragment + pod
const LOW_DIE = 3; // value 9 — fails the nav check

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Start a fresh, deterministic career on a chosen seed, entirely through the UI. */
async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

/** Page the storylet launcher across its offers until the sealed-pod is shown. */
async function openSealedPod(page: Page): Promise<void> {
  await page.getByTestId('storylet-toggle').click();
  const panel = page.getByTestId('storylet-panel');
  await expect(panel).toBeVisible();
  for (let i = 0; i < 8; i++) {
    if ((await panel.getAttribute('data-storylet-id')) === 'derelict.sealed-pod') return;
    await page.getByTestId('storylet-next').click();
  }
  throw new Error('derelict.sealed-pod storylet was not reachable via the launcher');
}

test('sweep off-lane through the UI: fragment gained, sealed pod taken, Nemesis File non-empty', async ({
  page,
}) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  // 1) Arm a die from the hand, then read the sweep's cost off the engine preview.
  await page.getByTestId('die').nth(HIGH_DIE).click();
  await expect(page.getByTestId('explore-cost')).toContainText(`PILOT DC ${EXPLORATION_NAV_DC}`);
  await expect(page.getByTestId('explore-cost')).toContainText(`FUEL ${EXPLORATION_FUEL_COST}`);

  // 2) Commit the off-lane sweep — the missing Explore verb, reached via the UI.
  await page.getByTestId('explore-sweep').click();

  // 3) The nav check rides the shared PILOT CheckBreakdown and reads SUCCESS.
  await expect(page.getByTestId('check-breakdown')).toBeVisible();
  await expect(page.getByTestId('check-stat')).toHaveText('PILOT');
  await expect(page.getByTestId('check-result')).toHaveText('SUCCESS');

  // 4) The loot outcome (fragment + contraband pod) is surfaced alongside it.
  const outcome = page.getByTestId('exploration-outcome');
  await expect(outcome).toBeVisible();
  await expect(outcome).toContainText('Signal Fragment');
  await expect(outcome).toContainText('sealed pod');

  // Exactly one die was spent by the sweep.
  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  expect(spent.filter((s) => s === '1').length).toBe(1);

  // 5) The contraband pod armed derelict.sealed-pod the same day — take it, with
  //    the patrol-scan risk visible on the choice prose (never a hidden cost).
  await openSealedPod(page);
  const take = page.locator('[data-testid="storylet-choice"][data-choice-id="take"]');
  await expect(take.locator('.sl-choice-prose')).toContainText(
    'a patrol captain who scans your hold will roll against you for it',
  );
  await take.getByTestId('storylet-choice-btn').click();

  // 6) The Nemesis File renders NON-EMPTY: the empty state is gone and a fragment
  //    row is present with a non-zero FRAGMENTS count.
  await page.getByTestId('records-toggle').click();
  await page.getByTestId('records-tab-nemesis').click();
  await expect(page.getByTestId('nemesis')).toBeVisible();
  await expect(page.getByTestId('nemesis-empty')).toHaveCount(0);
  await expect(page.getByTestId('nemesis-fragment')).toHaveCount(1);
  await expect(page.getByTestId('nemesis-count')).not.toHaveText('0 FRAGMENTS · 0 DECODED');
  await expect(page.getByTestId('nemesis-count')).toContainText('1 FRAGMENT');
});

test('a failed nav sweep renders its typed fail as a visible notice, never silence', async ({
  page,
}) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  // Arm a low die (value 9 → total 10 < DC 12) and sweep: the engine emits a typed
  // ExplorationFailed(nav-check). It must reach the player as a visible notice.
  await page.getByTestId('die').nth(LOW_DIE).click();
  await page.getByTestId('explore-sweep').click();

  await expect(page.getByTestId('notice')).toBeVisible();
  await expect(page.getByTestId('notice')).toContainText('The sweep turned up nothing but static.');

  // The nav check rendered too, reading FAILURE — the fail is surfaced, not swallowed.
  await expect(page.getByTestId('check-breakdown')).toBeVisible();
  await expect(page.getByTestId('check-stat')).toHaveText('PILOT');
  await expect(page.getByTestId('check-result')).toHaveText('FAILURE');

  // No discovery, so no loot summary is shown.
  await expect(page.getByTestId('exploration-outcome')).toHaveCount(0);
});
