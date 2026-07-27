import { test, expect, type Page } from '@playwright/test';

// T-1605c acceptance — the WRITE side of save honesty.
//
// T-1605a made a save that would not LOAD tell the player (`recovery.spec.ts`).
// This is the other half. `store.ts autosave()` runs after EVERY mutating action
// and swallowed its failure in a bare catch, which is the right call for "keep
// playing" and the wrong call for "keep quiet": the cockpit went on accepting
// actions while writing nothing, and the whole career vanished on the next
// reload.
//
// This is not a hypothetical failure at the horizon T-1605c is about. A 1,000-day
// career serializes to ~10.9 MiB of JSON (measured in
// engine/src/__tests__/save-perf.test.ts); Chromium allows ~5 MB of localStorage
// per origin. A real long career crosses the quota around day ~420 and every
// autosave after that throws QuotaExceededError.
//
// Driven entirely through the real cockpit UI, with NO product-code backdoor: the
// failure is induced by wrapping `localStorage.setItem` in the page so that
// writes to the autosave key throw exactly the DOMException a full store throws.
// Everything else — slots, settings, onboarding — keeps working, which is also
// what makes the test specific: it proves the banner tracks the AUTOSAVE key and
// not "any storage error anywhere".
//
// READER asserted here: `CockpitState.saveWriteFailed` → `App.tsx`
// `SaveWriteFailedNotice` → `format.ts saveWriteFailedMessage()`.
//
// NOT tagged @tour-one: the flake gate's denominator (e2e/support/flake.ts) is
// scoped to that tag and must not be diluted.

const SAVE_KEY = 'sq.save.v1';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/**
 * Make every write to the autosave key throw a QuotaExceededError, before any
 * app code runs. `addInitScript` is the same storage-stubbing pattern
 * `recovery.spec.ts` uses to inject its fixtures.
 *
 * Only `SAVE_KEY` is poisoned, deliberately: the store writes several other keys
 * (settings, onboarding, slots) through the same API, and a blanket failure
 * would not distinguish "the autosave is failing" from "storage is gone".
 */
async function breakAutosaveWrites(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    const original = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = (k: string, v: string) => {
      if (k === key) {
        // The real thing Chromium throws when the origin's quota is exhausted.
        throw new DOMException('quota exceeded (T-1605c stub)', 'QuotaExceededError');
      }
      original(k, v);
    };
  }, SAVE_KEY);
}

/** Take one ordinary, fully diegetic cockpit action: spend a die on a manifest
 *  contract. Every mutating action autosaves, so any of them would do. */
async function playOneAction(page: Page): Promise<void> {
  const contracts = page.getByTestId('contract');
  await expect(contracts.first()).toBeVisible();
  await page.getByTestId('die').first().click();
  await contracts.first().click();
}

test.describe('T-1605c · autosave write failure is surfaced, not swallowed', () => {
  test('a career that can no longer be saved says so', async ({ page }) => {
    await breakAutosaveWrites(page);
    await page.goto('/');
    await expect(page.getByTestId('day')).toHaveText('1');

    // Boot itself only READS the autosave, so nothing is wrong yet.
    await expect(page.getByTestId('save-write-failed-notice')).toHaveCount(0);

    await playOneAction(page);

    const notice = page.getByTestId('save-write-failed-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('role', 'alert');
    // The three clauses of `format.ts saveWriteFailedMessage()`: cause,
    // consequence, remedy. Asserted on substrings so the prose can be re-voiced
    // without re-pinning the test to a sentence.
    await expect(notice).toContainText('no longer being saved automatically');
    await expect(notice).toContainText('lost when you close or reload');
    await expect(notice).toContainText('Save to a slot');

    // NON-FATAL FOR PLAY, which is the other half of the contract: the cockpit is
    // still a working cockpit, not an error screen.
    await expect(page.getByTestId('die')).toHaveCount(5);
    await expect(page.getByTestId('crash-screen')).toHaveCount(0);

    // The banner is PERSISTENT — the condition is still true — so a further
    // action must not clear it.
    await page.getByTestId('die').nth(1).click();
    await expect(notice).toBeVisible();
  });

  test('a healthy cockpit never shows the banner', async ({ page }) => {
    // The false-positive guard: without it the banner could be unconditional and
    // the test above would still pass.
    await page.goto('/');
    await expect(page.getByTestId('day')).toHaveText('1');
    await expect(page.getByTestId('save-write-failed-notice')).toHaveCount(0);

    await playOneAction(page);

    await expect(page.getByTestId('save-write-failed-notice')).toHaveCount(0);
    // ...and the write really did land, which is why there is nothing to warn
    // about.
    expect(await page.evaluate((k) => window.localStorage.getItem(k), SAVE_KEY)).not.toBeNull();
  });
});
