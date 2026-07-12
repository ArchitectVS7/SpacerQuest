import { test, expect, type Page, type Locator } from '@playwright/test';

// T-312 acceptance: save slots + autosave, seed entry/display, settings
// (audio/CRT/reduced-motion/text-size) and a delete-confirm. Everything is driven
// THROUGH the cockpit UI (never the engine): the player opens Settings, clicks a
// slot, mutates the game via the real controls and reads the displayed state — a
// UX test, not an API test (global test-intent rules). Exactness of load is
// guaranteed by the T-112b createSave/loadSave round-trip; here it is asserted
// via the displayed day / credits / fuel.

/** Start a fresh, deterministic career on a chosen seed, through the UI only. */
async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

/** Select the first unspent die in the hand. */
async function selectUnspentDie(page: Page): Promise<void> {
  await page.locator('[data-testid="die"][data-spent="0"]').first().click();
}

/** The save-slot row for slot n, inside the Settings popover. */
function slotRow(page: Page, n: number): Locator {
  return page.locator(`[data-testid="save-slot"][data-slot="${n}"]`);
}

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
}

async function closeSettings(page: Page): Promise<void> {
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toHaveCount(0);
}

/** Buy a little fuel through the depot — a mutation that moves credits AND fuel,
 *  and (via the store) rewrites the autosave. */
async function buyFuel(page: Page, amount: number): Promise<void> {
  await selectUnspentDie(page);
  await page.getByTestId('fuel-amount').fill(String(amount));
  await page.getByTestId('buy-fuel').click();
}

test.describe('T-312 settings, saves & new-game UX', () => {
  test('save, mutate, load restores exactly (asserted via displayed state)', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await newGameSeed(page, 424242);

    // Record the pre-save displayed state.
    const day0 = await page.getByTestId('day').innerText();
    const credits0 = await page.getByTestId('credits').innerText();
    const fuel0 = await page.getByTestId('fuel-hold').innerText();

    // Save into slot 1.
    await openSettings(page);
    await slotRow(page, 1).getByTestId('slot-save').click();
    await expect(slotRow(page, 1)).toHaveAttribute('data-empty', '0');
    await closeSettings(page);

    // Mutate through the UI so the displayed state changes: burn fuel (credits +
    // fuel move) and end the day (the day counter moves).
    await buyFuel(page, 10);
    await expect(page.getByTestId('fuel-hold')).not.toHaveText(fuel0);
    await expect(page.getByTestId('credits')).not.toHaveText(credits0);
    await page.getByTestId('end-day').click();
    await expect(page.getByTestId('day')).not.toHaveText(day0);

    // Load slot 1 back.
    await openSettings(page);
    await slotRow(page, 1).getByTestId('slot-load').click();
    await closeSettings(page);

    // Restored EXACTLY to the pre-save displayed state.
    await expect(page.getByTestId('day')).toHaveText(day0);
    await expect(page.getByTestId('credits')).toHaveText(credits0);
    await expect(page.getByTestId('fuel-hold')).toHaveText(fuel0);
  });

  test('autosave survives a hard reload mid-career', async ({ page }) => {
    // Fresh only on the FIRST load — the reload is the very thing under test, so a
    // sessionStorage sentinel (survives reload within the tab) gates the clear.
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem('sq.test.cleared')) {
        window.localStorage.clear();
        window.sessionStorage.setItem('sq.test.cleared', '1');
      }
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await newGameSeed(page, 424242);

    // Advance the career: burn fuel and close a day. Every action rewrites the
    // autosave (sq.save.v1) the store boots from.
    await buyFuel(page, 10);
    await page.getByTestId('end-day').click();
    const day = await page.getByTestId('day').innerText();
    const credits = await page.getByTestId('credits').innerText();
    const fuel = await page.getByTestId('fuel-hold').innerText();

    // Hard reload — the app must boot straight back into the autosaved career.
    await page.reload();

    await expect(page.getByTestId('day')).toHaveText(day);
    await expect(page.getByTestId('credits')).toHaveText(credits);
    await expect(page.getByTestId('fuel-hold')).toHaveText(fuel);
  });

  test('deleting a slot asks first', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto('/');
    await newGameSeed(page, 424242);

    // Save into slot 1, confirm it is non-empty and the envelope is on disk.
    await openSettings(page);
    await slotRow(page, 1).getByTestId('slot-save').click();
    await expect(slotRow(page, 1)).toHaveAttribute('data-empty', '0');
    expect(await page.evaluate(() => window.localStorage.getItem('sq.slot.1.v1'))).not.toBeNull();

    // First click on Delete only ASKS — the confirm appears and the data is still
    // present (nothing deleted yet).
    await slotRow(page, 1).getByTestId('slot-delete').click();
    await expect(slotRow(page, 1).getByTestId('delete-confirm')).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem('sq.slot.1.v1'))).not.toBeNull();
    await expect(slotRow(page, 1)).toHaveAttribute('data-empty', '0');

    // Cancel dismisses the confirm and leaves the slot intact.
    await slotRow(page, 1).getByTestId('slot-delete-cancel').click();
    await expect(slotRow(page, 1).getByTestId('delete-confirm')).toHaveCount(0);
    await expect(slotRow(page, 1)).toHaveAttribute('data-empty', '0');

    // Delete → Confirm actually removes it, and the envelope leaves localStorage.
    await slotRow(page, 1).getByTestId('slot-delete').click();
    await slotRow(page, 1).getByTestId('slot-delete-confirm').click();
    await expect(slotRow(page, 1)).toHaveAttribute('data-empty', '1');
    expect(await page.evaluate(() => window.localStorage.getItem('sq.slot.1.v1'))).toBeNull();
  });

  test('settings (reduced motion, text size, CRT) persist across reload', async ({ page }) => {
    // NB: no reducedMotion media emulation here — the OS preference would force
    // data-motion='reduced' regardless, masking whether the SETTING drives it.
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem('sq.test.cleared')) {
        window.localStorage.clear();
        window.sessionStorage.setItem('sq.test.cleared', '1');
      }
    });
    await page.goto('/');

    const root = page.locator(':root');
    await expect(root).toHaveAttribute('data-motion', 'full');

    await openSettings(page);

    // Reduced motion.
    await page.getByTestId('set-reduced-motion').click();
    await expect(root).toHaveAttribute('data-motion', 'reduced');
    expect(await page.evaluate(() => window.localStorage.getItem('sq.reduced-motion'))).toBe('on');

    // Text size.
    await page.getByTestId('set-text-size-large').click();
    await expect(root).toHaveAttribute('data-text-size', 'large');
    expect(await page.evaluate(() => window.localStorage.getItem('sq.text-size'))).toBe('large');

    // CRT off.
    await page.getByTestId('set-crt').click();
    await expect(root).toHaveAttribute('data-fx', 'off');

    // A hard reload keeps every setting applied.
    await page.reload();
    await expect(root).toHaveAttribute('data-motion', 'reduced');
    await expect(root).toHaveAttribute('data-text-size', 'large');
    await expect(root).toHaveAttribute('data-fx', 'off');
  });

  test('seed entry and display, persisted across reload', async ({ page }) => {
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem('sq.test.cleared')) {
        window.localStorage.clear();
        window.sessionStorage.setItem('sq.test.cleared', '1');
      }
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // Enter a seed for a new career; the bezel shows it.
    await newGameSeed(page, 777);
    await expect(page.getByTestId('seed')).toContainText('777');
    expect(await page.evaluate(() => window.localStorage.getItem('sq.save.seed'))).toBe('777');

    // The seed survives a hard reload (recovered from sq.save.seed).
    await page.reload();
    await expect(page.getByTestId('seed')).toContainText('777');
  });
});
