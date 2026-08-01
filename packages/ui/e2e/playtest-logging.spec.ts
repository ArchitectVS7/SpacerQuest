import { test, expect, type Page } from '@playwright/test';
// T-141 · The settled copy, imported from the SOURCE constant rather than
// re-typed — the `settings-saves.spec.ts` / `credits.ts` precedent. A spec that
// duplicated the sentence would go on passing after the sentence drifted from
// `docs/PLAYTEST-TELEMETRY_SPEC.md` §3, which is the one thing this assertion
// exists to catch.
import { PLAYTEST_DISCLOSURE, PLAYTEST_TOGGLE_LABEL } from '../src/playtestLog';

// ---------------------------------------------------------------------------
// T-141 · OPT-IN PLAYTEST LOGGING, driven the way a tester actually drives it.
//
// Everything here goes THROUGH THE UI: the player opens Settings, reads the
// disclosure, presses the toggle, takes a real cockpit action, types a note,
// presses Flag, presses Export and receives a file. Nothing calls the store, the
// recorder or the engine directly — the claim under test is that the FEATURE is
// reachable and works, and an API-level drive would prove only that functions
// exist (global test-intent rules).
//
// The unit suite (`src/__tests__/playtest-log.test.ts`) owns the SHAPE of what
// is captured; this owns the fact that a human can get at it.
// ---------------------------------------------------------------------------

async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
}

async function closeSettings(page: Page): Promise<void> {
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toHaveCount(0);
}

/** A real cockpit action that needs no die and always resolves — the ledger
 *  payment `settings-saves.spec.ts` already uses for the same reason. */
async function payDebt(page: Page, amount: number): Promise<void> {
  await page.getByTestId('debt-amount').fill(String(amount));
  await page.getByTestId('pay-debt').click();
}

test.describe('T-141 opt-in playtest logging', () => {
  test.beforeEach(async ({ page }) => {
    // Fresh only on the FIRST load of the tab: one test below RELOADS, and a
    // bare `localStorage.clear()` init script runs on every navigation — it
    // would wipe the very preference that test is checking survives. The
    // sessionStorage sentinel (survives a reload, dies with the context)
    // is `settings-saves.spec.ts`'s answer to exactly this.
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem('sq.test.cleared')) {
        window.localStorage.clear();
        window.sessionStorage.setItem('sq.test.cleared', '1');
      }
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await newGameSeed(page, 424242);
  });

  test('is OFF by default and shows the disclosure before you opt in', async ({ page }) => {
    await openSettings(page);

    // Spec §3: OFF by default, with the disclosure copy AT the toggle.
    const toggle = page.getByTestId('set-playtest-logging');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveText('Off');
    await expect(page.getByTestId('playtest-disclosure')).toHaveText(PLAYTEST_DISCLOSURE);
    await expect(page.getByTestId('playtest-panel')).toContainText(PLAYTEST_TOGGLE_LABEL);

    // Nothing to flag and nothing to export until the player opts in — a control
    // that would refuse is worse than a control that is not there.
    await expect(page.getByTestId('playtest-flag')).toHaveCount(0);
    await expect(page.getByTestId('playtest-export-json')).toHaveCount(0);
  });

  test('captures real actions, flags a moment and exports a file', async ({ page }) => {
    await openSettings(page);
    await page.getByTestId('set-playtest-logging').click();
    await expect(page.getByTestId('set-playtest-logging')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('playtest-entry-count')).toHaveText('0 captured');
    await closeSettings(page);

    // A REAL action, taken the way a player takes it.
    await payDebt(page, 100);

    // The count is live the moment Settings reopens — no control touched.
    await openSettings(page);
    await expect(page.getByTestId('playtest-entry-count')).toHaveText('1 captured');

    // "Flag this moment", typed and submitted like a tester would.
    await page.getByTestId('playtest-flag-input').fill('the debt row did not update');
    await page.getByTestId('playtest-flag').click();
    await expect(page.getByTestId('playtest-entry-count')).toHaveText('2 captured');
    // The field clears, so the next note starts empty.
    await expect(page.getByTestId('playtest-flag-input')).toHaveValue('');

    // Export: a real download, with the name the feature promises.
    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('playtest-export-json').click(),
    ]).then(([d]) => d);
    expect(download.suggestedFilename()).toMatch(/^rimward-playtest-.+-2\.jsonl$/);

    // …and the CSV flavour of the same record.
    const csv = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('playtest-export-csv').click(),
    ]).then(([d]) => d);
    expect(csv.suggestedFilename()).toMatch(/^rimward-playtest-.+-2\.csv$/);
  });

  test('the toggle survives a reload, and capture stays off until it is on', async ({ page }) => {
    // Spec §3: the toggle is a CLIENT PREFERENCE — it lives in the local
    // preference store, not the save file, so it survives a reload of the career
    // without ever having ridden the envelope.
    await openSettings(page);
    await page.getByTestId('set-playtest-logging').click();
    await closeSettings(page);

    await page.reload();
    await openSettings(page);
    await expect(page.getByTestId('set-playtest-logging')).toHaveAttribute('aria-pressed', 'true');

    // Turn it back off: the controls retract and nothing further is captured.
    await page.getByTestId('set-playtest-logging').click();
    await expect(page.getByTestId('playtest-export-json')).toHaveCount(0);
    await closeSettings(page);
    await payDebt(page, 100);
    await openSettings(page);
    await page.getByTestId('set-playtest-logging').click();
    await expect(page.getByTestId('playtest-entry-count')).toHaveText('0 captured');
  });
});
