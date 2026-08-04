import { test, expect, type Page } from '@playwright/test';
import { skipFirstTurnWalkthrough } from './support/career';
import { createInitialState, startDay, createSave } from '@spacerquest/engine';

// T-1605a acceptance — the two ways the cockpit can fail a player's career, and
// the recovery each one owes them:
//
//   A. CORRUPT SAVE. Until this task the boot path swallowed every save-load
//      failure (`store.ts readSave`'s bare `catch { return null }`) and handed the
//      player a fresh career with NO notice — and the fresh career's first
//      autosave then OVERWROTE the damaged bytes. Now the failure is named, using
//      the ENGINE's own typed `SaveError.code`, and the unreadable blob is copied
//      to `sq.save.v1.corrupt` before anything can write over it.
//
//   B. CRASH. A render-time fault used to tear the tree down to a blank tube.
//      Now the error boundary shows a fault screen with three exits, and the
//      autosave is proved BYTE-IDENTICAL across the fault — "recovers without
//      save loss" asserted on the bytes, not on the vibe.
//
// Both halves are driven entirely through the real cockpit UI. No product code
// has a test backdoor: the crash is forced by poisoning a JS builtin the shipped
// bezel already calls (see `poisonRenderer`).
//
// NOT tagged @tour-one: the flake gate's denominator (e2e/support/flake.ts) is
// scoped to that tag and must not be diluted.

const SAVE_KEY = 'sq.save.v1';
const QUARANTINE_KEY = 'sq.save.v1.corrupt';

test.beforeEach(async ({ page }) => {
  // Settle the dawn-roll scramble. Playwright gives every test an isolated
  // context, so localStorage starts empty — each test injects its own fixture.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // T-187 · This spec is NOT testing the first-time flow — retire the scripted
  // first-turn walkthrough before the app boots, or its rails would make the
  // panes below inert. See `support/career.ts`.
  await skipFirstTurnWalkthrough(page);
});

/** Boot the store straight onto a fixture in the autosave key, then navigate.
 *  The `progression.spec.ts` injection pattern. */
async function bootWithSave(page: Page, save: string): Promise<void> {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    SAVE_KEY,
    save,
  ] as const);
  await page.goto('/');
}

async function readKey(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => window.localStorage.getItem(k), key);
}

// ---------------------------------------------------------------------------
// A · corrupt-save recovery
// ---------------------------------------------------------------------------

test.describe('T-1605a · corrupt-save recovery', () => {
  test('a corrupt autosave tells the player instead of silently resetting', async ({ page }) => {
    const damaged = '{not json';
    await bootWithSave(page, damaged);

    const notice = page.getByTestId('recovery-notice');
    await expect(notice).toBeVisible();
    // The engine decided the cause (`SaveError.code`); the UI only carries it.
    await expect(notice).toHaveAttribute('data-recovery-code', 'corrupt-json');
    await expect(notice).toHaveAttribute('data-recovery-preserved', '1');
    await expect(notice).toContainText('could not be loaded');
    await expect(notice).toContainText('kept');

    // The fallback career is a real, playable day-1 cockpit — the notice explains
    // the reset, it does not replace the game.
    await expect(page.getByTestId('day')).toHaveText('1');
    await expect(page.getByTestId('die')).toHaveCount(5);

    // The save-PRESERVING half: the damaged bytes were copied out verbatim before
    // the fresh career could autosave over them.
    expect(await readKey(page, QUARANTINE_KEY)).toBe(damaged);
  });

  test('a save from a newer build is named as such, not as damage', async ({ page }) => {
    // Proof the UI forwards the engine's TYPED code rather than collapsing every
    // failure into one catch-all sentence: this save is perfectly well-formed.
    await bootWithSave(page, JSON.stringify({ version: 999, state: {}, seed: 1 }));

    const notice = page.getByTestId('recovery-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('data-recovery-code', 'future-version');
    await expect(notice).toContainText('NEWER build');
  });

  test('a schema-invalid save is reported and quarantined', async ({ page }) => {
    const bad = JSON.stringify({ version: 8, state: {}, seed: 1 });
    await bootWithSave(page, bad);

    const notice = page.getByTestId('recovery-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('data-recovery-code', 'invalid-state');
    expect(await readKey(page, QUARANTINE_KEY)).toBe(bad);
  });

  test('a healthy save boots with no notice and quarantines nothing', async ({ page }) => {
    // The false-positive guard. Without it the banner could be unconditional and
    // every other test in this block would still pass.
    const seed = 7;
    await bootWithSave(page, createSave(startDay(createInitialState(seed)).state, seed));

    await expect(page.getByTestId('day')).toHaveText('1');
    await expect(page.getByTestId('recovery-notice')).toHaveCount(0);
    expect(await readKey(page, QUARANTINE_KEY)).toBeNull();
  });

  test('a first run shows no notice — an absent save is not a failure', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('die')).toHaveCount(5);
    await expect(page.getByTestId('recovery-notice')).toHaveCount(0);
    expect(await readKey(page, QUARANTINE_KEY)).toBeNull();
  });

  test('the notice dismisses', async ({ page }) => {
    await bootWithSave(page, '{not json');
    await expect(page.getByTestId('recovery-notice')).toBeVisible();

    await page.getByTestId('recovery-dismiss').click();

    await expect(page.getByTestId('recovery-notice')).toHaveCount(0);
    // Dismissing is presentation-only: the quarantined evidence stays put.
    expect(await readKey(page, QUARANTINE_KEY)).toBe('{not json');
  });
});

// ---------------------------------------------------------------------------
// B · crash recovery
// ---------------------------------------------------------------------------

/**
 * Force a genuine RENDER-TIME fault with no product code changed and no test
 * backdoor shipped: poison `Number.prototype.toLocaleString`, which the
 * ALWAYS-MOUNTED bezel calls while drawing the seed chip (`App.tsx` Bezel,
 * `seed.toLocaleString()`) and again for credits and fuel. That is exactly the
 * class of unexpected runtime error an error boundary exists for.
 *
 * Applied with `page.evaluate` and NOT `addInitScript`, so a reload lands on a
 * clean page — which is what makes the reload/fresh-career tests meaningful.
 */
async function poisonRenderer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const proto = Number.prototype as unknown as { toLocaleString: () => string };
    (globalThis as unknown as { __sqOrigTLS?: () => string }).__sqOrigTLS = proto.toLocaleString;
    proto.toLocaleString = () => {
      throw new Error('forced render fault (T-1605a)');
    };
  });
}

async function healRenderer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = globalThis as unknown as { __sqOrigTLS?: () => string };
    const proto = Number.prototype as unknown as { toLocaleString: () => string };
    if (g.__sqOrigTLS) proto.toLocaleString = g.__sqOrigTLS;
  });
}

/**
 * Boot a fresh career and play ONE mutating action so the autosave holds a real
 * career, then return the exact bytes on disk. Every crash test compares against
 * these bytes — "without save loss" is asserted byte-for-byte.
 */
async function bootAndPlay(page: Page): Promise<{ before: string; credits: string }> {
  await page.goto('/');
  await expect(page.getByTestId('day')).toHaveText('1');
  const contracts = page.getByTestId('contract');
  await expect(contracts.first()).toBeVisible();
  await page.getByTestId('die').first().click();
  await contracts.first().click();

  const before = await readKey(page, SAVE_KEY);
  expect(before).not.toBeNull();
  const credits = (await page.getByTestId('credits').textContent()) ?? '';
  return { before: before as string, credits };
}

/** Crash the cockpit from a playable state, with an RNG-free interaction (a die
 *  selection costs nothing and rolls nothing, so the career is untouched). */
async function crash(page: Page): Promise<void> {
  await poisonRenderer(page);
  await page.getByTestId('die').nth(1).click();
  await expect(page.getByTestId('crash-screen')).toBeVisible();
}

test.describe('T-1605a · crash recovery', () => {
  test('a render fault shows the recovery screen and does not touch the save', async ({ page }) => {
    const { before, credits } = await bootAndPlay(page);

    await crash(page);

    await expect(page.getByTestId('crash-detail')).toContainText('forced render fault');
    await expect(page.getByTestId('crash-screen')).toContainText('Your career is safe');

    // THE ACCEPTANCE: the autosave is byte-identical across the fault, and
    // nothing was quarantined or cleared behind the player's back.
    expect(await readKey(page, SAVE_KEY)).toBe(before);
    expect(await readKey(page, QUARANTINE_KEY)).toBeNull();

    // Resume re-mounts the cockpit on the same live career.
    await healRenderer(page);
    await page.getByTestId('crash-resume').click();
    await expect(page.getByTestId('crash-screen')).toHaveCount(0);
    await expect(page.getByTestId('day')).toBeVisible();
    await expect(page.getByTestId('credits')).toHaveText(credits);
    expect(await readKey(page, SAVE_KEY)).toBe(before);
  });

  test('reload from the crash screen restores the career from the autosave', async ({ page }) => {
    const { before, credits } = await bootAndPlay(page);
    const day = await page.getByTestId('day').textContent();

    await crash(page);
    await page.getByTestId('crash-reload').click();
    await page.waitForLoadState('load');

    await expect(page.getByTestId('day')).toHaveText(day ?? '1');
    await expect(page.getByTestId('credits')).toHaveText(credits);
    await expect(page.getByTestId('crash-screen')).toHaveCount(0);
    // The reload re-read the SAME bytes — the career was never rewritten.
    expect(await readKey(page, SAVE_KEY)).toBe(before);
    // A crash is not a corrupt save: the boot notice must not appear.
    await expect(page.getByTestId('recovery-notice')).toHaveCount(0);
  });

  test('the fresh-career escape hatch preserves the damaged save', async ({ page }) => {
    // The only exit that removes the live career — the one that would brick a
    // player whose save faults on every boot if it did not exist, and the only
    // place the crash path can destroy data. It routes through the quarantine
    // copy, so it cannot.
    const { before } = await bootAndPlay(page);

    await crash(page);
    await page.getByTestId('crash-fresh').click();
    await page.waitForLoadState('load');

    await expect(page.getByTestId('day')).toHaveText('1');
    await expect(page.getByTestId('die')).toHaveCount(5);
    expect(await readKey(page, QUARANTINE_KEY)).toBe(before);
    // A DELIBERATELY cleared save is not a corrupt one — the notice must not lie.
    await expect(page.getByTestId('recovery-notice')).toHaveCount(0);
  });
});
