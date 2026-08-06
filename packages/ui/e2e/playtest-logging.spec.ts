import { test, expect, type Page } from '@playwright/test';
import { signOpeningMarker, skipFirstTurnWalkthrough } from './support/career';
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
  // T-200 · Sign the Guild marker this new career opened under. `newGame` arms
  // it unconditionally (every career has its own), so this is the click a player
  // makes too; it calls no engine action, so the pinned RNG stream is unmoved.
  await signOpeningMarker(page);
}

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
}

/**
 * Put the logging toggle into a known state, through the real control.
 *
 * WHY THIS EXISTS (found at T-185, kept at T-250). These tests used to CLICK the
 * toggle and assume the click turned it on, which silently encoded the build
 * default into every one of them; `5b430136` (2026-08-03, "Playtest logging
 * defaults on for internal UAT") flipped that default and the whole file went
 * red. T-250 restored spec §3's OFF, and this helper stays: a test that wants a
 * KNOWN state should establish it, not assume it.
 *
 * It is deliberately NOT used for the default itself. The first test below
 * asserts `aria-pressed` literally, because a default-agnostic assertion is
 * exactly how a future flip would land unnoticed.
 */
async function setLogging(page: Page, on: boolean): Promise<void> {
  const toggle = page.getByTestId('set-playtest-logging');
  const pressed = (await toggle.getAttribute('aria-pressed')) === 'true';
  if (pressed !== on) await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', String(on));
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
    // T-187 · This spec is NOT testing the first-time flow — retire the scripted
    // first-turn walkthrough BEFORE the first navigation, or its rails would make
    // the panes below inert. See `support/career.ts`.
    await skipFirstTurnWalkthrough(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await newGameSeed(page, 424242);
  });

  test('defaults OFF (spec §3), with the disclosure at the toggle and no controls until opt-in', async ({
    page,
  }) => {
    await openSettings(page);

    const toggle = page.getByTestId('set-playtest-logging');
    // SPEC §3: "OFF by default." Asserted LITERALLY on a virgin profile — the
    // `beforeEach` clears `localStorage`, so no `sq.playtest.logging` key exists
    // and this is the build's own default, not a stored preference. Between
    // `5b430136` (2026-08-03, "Playtest logging defaults on for internal UAT")
    // and T-250 (2026-08-06) this read `'true'` / `'On'`; the restore had to
    // change these two lines, which is the whole point of pinning the default
    // here rather than reading it through `setLogging`. A default-agnostic
    // assertion would let the next flip land silently.
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveText('Off');
    // The disclosure copy sits AT the toggle in either state, which is the part
    // spec §3 actually requires of the UI.
    await expect(page.getByTestId('playtest-disclosure')).toHaveText(PLAYTEST_DISCLOSURE);
    await expect(page.getByTestId('playtest-panel')).toContainText(PLAYTEST_TOGGLE_LABEL);

    // In that default state there is nothing to flag and nothing to export — a
    // control that would refuse is worse than a control that is not there. Under
    // OFF-by-default this is a claim about the VIRGIN profile, which is stronger
    // than the old version's claim about a profile that had been toggled off.
    await expect(page.getByTestId('playtest-flag')).toHaveCount(0);
    await expect(page.getByTestId('playtest-export-json')).toHaveCount(0);

    // Opting in reveals them, and opting back out retracts them again.
    await setLogging(page, true);
    await expect(page.getByTestId('playtest-export-json')).toBeVisible();
    await setLogging(page, false);
    await expect(page.getByTestId('playtest-flag')).toHaveCount(0);
    await expect(page.getByTestId('playtest-export-json')).toHaveCount(0);
  });

  test('captures real actions, flags a moment and exports a file', async ({ page }) => {
    await openSettings(page);
    // OFF and then ON, rather than one click: the claim under test is that a
    // tester who opts in captures FROM THAT POINT, so the buffer has to be empty
    // at a known moment regardless of what the build defaults to. (The default
    // itself is pinned by the test above; this one is deliberately agnostic so
    // it keeps testing capture rather than re-testing the default.)
    await setLogging(page, false);
    await setLogging(page, true);
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
    // Persistence is asserted in the direction that is NOT the build's default,
    // deliberately — and T-250's restore INVERTED which direction that is. While
    // the interim default was ON, "still on after a reload" would have passed
    // with nothing written at all, so the test stored OFF. Now the default is
    // OFF (spec §3), so the vacuous direction is the other one: "still ON after a
    // reload" can only be true if the preference really was stored.
    await setLogging(page, true);
    await closeSettings(page);

    await page.reload();
    await openSettings(page);
    await expect(page.getByTestId('set-playtest-logging')).toHaveAttribute('aria-pressed', 'true');

    // …and the controls the opt-in unlocks came back with it.
    await expect(page.getByTestId('playtest-export-json')).toBeVisible();

    // Turn it back off: the controls retract and nothing further is captured.
    await setLogging(page, false);
    await expect(page.getByTestId('playtest-export-json')).toHaveCount(0);
    await closeSettings(page);
    await payDebt(page, 100);
    await openSettings(page);
    await setLogging(page, true);
    await expect(page.getByTestId('playtest-entry-count')).toHaveText('0 captured');
  });
});
