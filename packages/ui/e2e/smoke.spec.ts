import { test, expect } from '@playwright/test';
import { skipFirstTurnWalkthrough } from './support/career';

// T-301 boot-smoke: the cockpit boots to a playable day, the dawn roll is
// visible, and the day-advance control actually advances the engine.
test.beforeEach(async ({ page }) => {
  // Fresh career every run — clear any autosave the store may have persisted.
  await page.addInitScript(() => window.localStorage.clear());
  // T-187 · This spec is NOT testing the first-time flow — retire the scripted
  // first-turn walkthrough before the app boots, or its rails would make the
  // panes below inert. See `support/career.ts`.
  await skipFirstTurnWalkthrough(page);
});

test('cockpit boots to a playable day', async ({ page }) => {
  await page.goto('/');

  // The one-screen cockpit is present.
  await expect(page.getByRole('heading', { name: 'Spacer Quest' })).toBeVisible();
  await expect(page.getByTestId('wire')).toBeVisible();

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

test('signing a contract is FREE: the hold fills and the hand is untouched', async ({ page }) => {
  // T-196a · This test used to be "signing a contract requires a die and then
  // consumes it". M17 (docs/DAWN-HAND-REDESIGN.md §3) freed the signature, so the
  // assertion is INVERTED rather than deleted: signing must still WORK, and must
  // now leave every die unspent. The cockpit still asks for an armed die before it
  // will submit — that gating is UI-only and T-196c retires it.
  await page.goto('/');
  const contracts = page.getByTestId('contract');
  await expect(contracts.first()).toBeVisible();

  // Pick the first die, then sign the first contract.
  await page.getByTestId('die').first().click();
  await contracts.first().click();

  // The contract landed…
  await expect(page.getByTestId('active-contract')).toBeVisible();
  // …and NO die was consumed.
  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  expect(spent.filter((s) => s === '1').length).toBe(0);
});
