import { test, expect, type Page } from '@playwright/test';

// T-1605 acceptance (Playwright half): corrupt-save UX + forced-crash recovery.
// Everything is driven THROUGH the cockpit UI (never the engine) per the global
// test-intent rules — a real player boots into a damaged save and must be TOLD, and a
// real player who hits a crash must get their career back after a reboot. The
// save-preservation guarantee is asserted the way a player would feel it: the visible
// day / credits / seed after recovery match what they were before the crash.

const SAVE_KEY = 'sq.save.v1';

/** Start a fresh, deterministic career on a chosen seed, through the UI only. */
async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

test.describe('T-1605 · corrupt-save notice', () => {
  test('a damaged autosave shows a visible boot notice instead of silently resetting', async ({
    page,
  }) => {
    // Seed a syntactically-corrupt save BEFORE the app boots — the exact "save present
    // but unloadable" case that used to fall back to a fresh career in silence.
    await page.addInitScript(() => {
      window.localStorage.setItem('sq.save.v1', '{ not valid json');
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // The reset is now VISIBLE: an honest boot banner, not a silent fresh career.
    const banner = page.getByTestId('boot-notice');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/could not be loaded/i);

    // The game still booted to a playable day-1 cockpit (the fresh-career fallback).
    await expect(page.getByTestId('day')).toContainText('1');

    // The damaged blob was NOT silently overwritten on boot — it is left untouched on
    // disk (read it immediately, before any action autosaves over it).
    const rawAfterBoot = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
    expect(rawAfterBoot).toBe('{ not valid json');

    // The banner is dismissible and stays gone once dismissed.
    await page.getByTestId('boot-notice-dismiss').click();
    await expect(page.getByTestId('boot-notice')).toHaveCount(0);
  });

  test('a future-version save reports the honest "newer version" reason', async ({ page }) => {
    // A well-formed envelope from a NEWER build (version far above the supported one)
    // — loadSave throws SaveError 'future-version', a distinct honest line.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'sq.save.v1',
        JSON.stringify({ version: 999, state: {}, seed: 1 }),
      );
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const banner = page.getByTestId('boot-notice');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/newer version/i);
    await expect(page.getByTestId('day')).toContainText('1');
  });

  test('a clean first boot shows NO boot notice', async ({ page }) => {
    // Regression guard: an ABSENT save is benign and must never raise the banner.
    await page.addInitScript(() => window.localStorage.clear());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByTestId('day')).toBeVisible();
    await expect(page.getByTestId('boot-notice')).toHaveCount(0);
  });
});

test.describe('T-1605 · forced-crash recovery without save loss', () => {
  test('a render crash recovers to the exact pre-crash career on reboot', async ({ page }) => {
    // Clear ONLY on the first load. addInitScript runs before EVERY navigation, so an
    // unconditional clear would also wipe the autosave on the crash boot and the
    // recovery reboot — the very save whose survival is under test. A sessionStorage
    // sentinel (survives reload within the tab) gates the clear to the first boot only.
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem('sq.test.cleared')) {
        window.localStorage.clear();
        window.sessionStorage.setItem('sq.test.cleared', '1');
      }
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // Play a real, state-changing, autosaving action through the UI: start a career
    // and close a day (end-day advances the day counter AND rewrites the autosave).
    await newGameSeed(page, 424242);
    await expect(page.getByTestId('day')).toHaveText('1');
    await page.getByTestId('end-day').click();
    await expect(page.getByTestId('day')).not.toHaveText('1'); // the day advanced

    // Capture the visible career state the player would expect to come back to.
    const day = await page.getByTestId('day').innerText();
    const credits = await page.getByTestId('credits').innerText();
    const seed = await page.getByTestId('seed').innerText();

    // Force a deterministic render fault via the test-only `?crash=1` injector. The
    // error boundary must catch it and show the save-preserving fallback — NOT a
    // white screen, and NOT a reset (it never touches the autosave).
    await page.goto('/?crash=1');
    await expect(page.getByTestId('crash-fallback')).toBeVisible();

    // Reboot from the intact autosave via the fallback's own affordance.
    await page.getByTestId('crash-reload').click();

    // Recovered to EXACTLY the pre-crash career — proving no save loss.
    await expect(page.getByTestId('crash-fallback')).toHaveCount(0);
    await expect(page.getByTestId('day')).toHaveText(day);
    await expect(page.getByTestId('credits')).toHaveText(credits);
    await expect(page.getByTestId('seed')).toHaveText(seed);
    // And recovery is clean: booting the good save raised no corrupt-save banner.
    await expect(page.getByTestId('boot-notice')).toHaveCount(0);
  });
});
