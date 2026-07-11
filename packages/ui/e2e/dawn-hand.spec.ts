import { test, expect } from '@playwright/test';

// T-303: the signature interaction. The dawn hand is honest and visible — a
// specific die is assigned to a specific action, every check shows its full
// breakdown (die + stat + DC + margin), and the day-end (all-spent) state is
// communicated unmistakably. These tests drive the real cockpit UI end to end;
// nothing calls the engine directly.
test.beforeEach(async ({ page }) => {
  // Fresh, deterministic career every run (default seed 424242 in the store).
  await page.addInitScript(() => window.localStorage.clear());
  // Reduced motion settles the dawn roll immediately, so the displayed die face
  // equals the engine's dealt value the instant we read it (no scramble flake).
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** The visible face value of the die at index `i` (first span holds the number). */
async function dieValue(page: import('@playwright/test').Page, i: number): Promise<string> {
  return (await page.getByTestId('die').nth(i).locator('span').first().innerText()).trim();
}

test('assigning a specific die spends exactly that index, value preserved', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('die')).toHaveCount(5);

  // Pick a deliberately non-first die so "it spent a die" can't masquerade as
  // "it spent THE die we chose".
  const idx = 2;
  const chosen = await dieValue(page, idx);

  const die = page.getByTestId('die').nth(idx);
  await die.click();
  await expect(die).toHaveClass(/\bsel\b/);

  // Assign it to the first contract by signing.
  await page.getByTestId('contract').first().click();

  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  // Exactly one die spent, and it is the one we chose.
  expect(spent.filter((s) => s === '1').length).toBe(1);
  expect(spent[idx]).toBe('1');
  spent.forEach((s, i) => {
    if (i !== idx) expect(s).toBe('0');
  });
  // The spent die still carries its dealt value — proof the engine consumed
  // that index, not a re-rolled or shifted one.
  expect(await dieValue(page, idx)).toBe(chosen);
});

test('haggle shows the honest check breakdown built from the assigned die', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('contract').first()).toBeVisible();

  // Assign a specific die and haggle the first contract (the reachable action
  // that produces a real d20 check in the single-system cockpit).
  const idx = 1;
  const chosen = await dieValue(page, idx);
  await page.getByTestId('die').nth(idx).click();
  await page.getByTestId('haggle').first().click();

  const breakdown = page.getByTestId('check-breakdown');
  await expect(breakdown).toBeVisible();

  // The die shown in the breakdown IS the die we assigned.
  await expect(page.getByTestId('check-die')).toHaveText(chosen);
  // Stat, DC, margin and verdict are all explicit and non-empty.
  await expect(page.getByTestId('check-stat')).toHaveText('TRADE');
  await expect(page.getByTestId('check-dc')).toHaveText('12');
  await expect(page.getByTestId('check-margin')).not.toBeEmpty();
  await expect(page.getByTestId('check-result')).not.toBeEmpty();
  await expect(page.getByTestId('check-result')).toHaveText(/SUCCESS|FAILURE/);
});

test('day-end: an exhausted hand is clearly communicated', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('die')).toHaveCount(5);

  // Spend every die through real actions: haggle each of the four contracts
  // (dice 0-3, haggle leaves the board populated), then sign one (die 4).
  for (let i = 0; i < 4; i++) {
    await page.getByTestId('die').nth(i).click();
    await page.getByTestId('haggle').nth(i).click();
  }
  await page.getByTestId('die').nth(4).click();
  await page.getByTestId('contract').first().click();

  // Every die spent.
  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  expect(spent.every((s) => s === '1')).toBe(true);

  // The all-spent state is surfaced explicitly, not just implied.
  await expect(page.getByTestId('day-end')).toBeVisible();
  await expect(page.getByTestId('hand')).toHaveAttribute('data-hand-spent', '1');
  await expect(page.getByTestId('end-day')).toHaveText('Begin next day');
});
