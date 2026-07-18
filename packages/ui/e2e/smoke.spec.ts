import { test, expect } from '@playwright/test';

// T-301 boot-smoke: the cockpit boots to a playable day, the dawn roll is
// visible, and the day-advance control actually advances the engine.
test.beforeEach(async ({ page }) => {
  // Fresh career every run — clear any autosave the store may have persisted.
  await page.addInitScript(() => window.localStorage.clear());
});

test('cockpit boots to a playable day', async ({ page }) => {
  await page.goto('/');

  // The one-screen cockpit is present.
  await expect(page.getByRole('heading', { name: 'Spacer Quest' })).toBeVisible();
  await expect(page.getByTestId('wire')).toBeVisible();

  // T-1704 · the build-time version stamp is rendered in the always-visible bezel.
  await expect(page.getByTestId('app-version')).toHaveText(/^v\d+\.\d+\.\d+/);

  // Dawn roll: five d20 dice in the hand.
  await expect(page.getByTestId('die')).toHaveCount(5);

  // A fresh Tour One career opens on Day 1 with the 25,000cr debt on the bezel.
  await expect(page.getByTestId('day')).toHaveText('1');
  await expect(page.getByTestId('debt-chip')).toContainText('25,000');
});

test('ending the day advances the engine and rolls a new hand', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('day')).toHaveText('1');

  await page.getByTestId('end-day').click();

  // Day advanced, and a fresh unspent hand of five was rolled.
  await expect(page.getByTestId('day')).toHaveText('2');
  await expect(page.getByTestId('die')).toHaveCount(5);
  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  expect(spent.every((s) => s === '0')).toBe(true);
});

test('signing a contract requires a die and then consumes it', async ({ page }) => {
  await page.goto('/');
  const contracts = page.getByTestId('contract');
  await expect(contracts.first()).toBeVisible();

  // Pick the first die, then sign the first contract.
  await page.getByTestId('die').first().click();
  await contracts.first().click();

  // The die is now spent (one fewer unspent die in the hand).
  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  expect(spent.filter((s) => s === '1').length).toBe(1);
});
