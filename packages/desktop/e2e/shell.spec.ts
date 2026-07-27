import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  bezel,
  cleanupTempDirs,
  closeSettings,
  launch as launchShell,
  openSettings,
  payDebt,
  startCareer,
  tempDir,
  type LaunchOpts,
} from './support/cockpit';

// ---------------------------------------------------------------------------
// T-1701a ACCEPTANCE — the Electron shell in DEV MODE, driven as a player
// drives it. (The PACKAGED build is `packaged.spec.ts`, T-1701b.)
//
// Three claims, all through the real window:
//   1. dev-mode Electron runs Tour One start-of-career;
//   2. saves land in the OS app-data dir — proved by WIPING localStorage and
//      watching the career come back anyway;
//   3. a localStorage career migrates in on first desktop boot — proved by
//      PLAYING one in a bridge-less launch first, so the fixture is a real
//      browser career and not a hand-written blob.
//
// The driving helpers live in `support/cockpit.ts` (T-1701b extracted them so
// the packaged spec drives the identical clicks). NOTHING here reaches into the
// store, the engine or a save file to SET state.
// ---------------------------------------------------------------------------

/** The compiled main process. `npm run build` (tsc -b) produces it; the gate's
 *  `npx tsc -b` at the root does too, which is why the CI job needs no extra
 *  build step for this package. */
const MAIN = join(__dirname, '..', 'dist', 'main.js');

/** The renderer the shell points at — the SAME `vite preview` artifact the web
 *  e2e suite tests, started by `playwright.config.ts`'s `webServer`. */
const RENDERER_URL = 'http://localhost:5173';

function launch(opts: Omit<LaunchOpts, 'main' | 'rendererUrl' | 'executablePath'>) {
  return launchShell({ ...opts, main: MAIN, rendererUrl: RENDERER_URL });
}

test.afterEach(() => cleanupTempDirs());

// ---------------------------------------------------------------------------

test.describe('T-1701a · the Electron shell', () => {
  test('runs Tour One start-of-career and lands its saves in the app-data dir', async () => {
    const saveDir = join(tempDir('saves'), 'saves');
    const userDataDir = tempDir('userdata');

    const { app, page } = await launch({ saveDir, userDataDir });

    // --- window management -------------------------------------------------
    const shell = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
      const all = BrowserWindow.getAllWindows();
      return {
        // The app NAME is what `app.getPath('userData')` is derived from, so it
        // is the load-bearing half of "saves land in OS app-data": leave it
        // unset and every unbranded Electron app shares a folder called
        // "Electron".
        name: electronApp.getName(),
        windows: all.map((w) => ({
          visible: w.isVisible(),
          title: w.getTitle(),
          min: w.getMinimumSize(),
        })),
      };
    });
    expect(shell.name).toBe('Rimward');
    expect(shell.windows).toHaveLength(1);
    // `isVisible()` proves the paint-then-show path ran: the window is created
    // with `show: false` and only shown on `ready-to-show`, so a window that is
    // visible here is one that has painted.
    expect(shell.windows[0].visible).toBe(true);
    // The RENDERER's `<title>` wins once the cockpit loads (that is ordinary
    // web behaviour, and the cockpit's own title is the one the player should
    // see) — so this asserts the shell is showing Rimward, not that the
    // BrowserWindow option survived. `main.ts`'s `title` is the pre-load
    // placeholder, which matters only for the frame before first paint.
    expect(shell.windows[0].title).toContain('Rimward');
    expect(shell.windows[0].min).toEqual([1024, 640]);

    // --- the bridge's shape, so the two twin interfaces cannot drift --------
    const bridgeMethods = await page.evaluate(() =>
      Object.keys((window as unknown as { sqDesktop: object }).sqDesktop).sort(),
    );
    // T-1701b added `about`; the list is asserted EXACTLY so the three twins
    // (`preload.ts`, `storage.ts`'s `DesktopStorageBridge`, this) cannot drift.
    expect(bridgeMethods).toEqual(['about', 'dir', 'getItem', 'keys', 'removeItem', 'setItem']);

    // --- Tour One, start of career ----------------------------------------
    await startCareer(page, 1701);

    // --- the READER of `saveLocation` / `storageBackend` -------------------
    await openSettings(page);
    const row = page.getByTestId('save-location');
    await expect(row).toHaveAttribute('data-storage-backend', 'desktop');
    await expect(row).toHaveText(saveDir);

    // --- T-1701b · the READER of `shellVersion` / `updateStatus` ------------
    await expect(page.getByTestId('app-version')).toHaveText(/^\d+\.\d+\.\d+$/);
    // A DEV shell is not packaged, so it can never self-update — worth
    // ASSERTING rather than assuming: an updater that armed itself against a
    // developer's working tree would overwrite it with a release.
    await expect(page.getByTestId('update-status')).toHaveAttribute(
      'data-update-status',
      'unsupported',
    );
    await closeSettings(page);

    // --- the save is a FILE, in the dir the player was shown ---------------
    const autosave = join(saveDir, 'sq.save.v1');
    expect(existsSync(autosave)).toBe(true);
    const firstBytes = readFileSync(autosave, 'utf8');
    expect(firstBytes.length).toBeGreaterThan(0);
    // Nothing went to localStorage on this launch.
    expect(await page.evaluate(() => window.localStorage.length)).toBe(0);

    // --- saves are LIVE, not a one-shot ------------------------------------
    const before = await bezel(page);
    await payDebt(page, 500);
    await expect(page.getByTestId('credits')).not.toHaveText(before.credits);
    const after = await bezel(page);
    await expect
      .poll(() => readFileSync(autosave, 'utf8'), { timeout: 10_000 })
      .not.toBe(firstBytes);

    await app.close();

    // --- THE CRITERION'S TEETH ---------------------------------------------
    // Relaunch against the SAME save dir but a WIPED user-data dir, so the
    // renderer's localStorage is empty. If the career comes back, it came out of
    // the app-data FILE and nowhere else.
    const freshProfile = tempDir('userdata2');
    const second = await launch({ saveDir, userDataDir: freshProfile });
    await expect(second.page.getByTestId('day')).toBeVisible();
    expect(await bezel(second.page)).toEqual(after);

    // --- closing the window QUITS the app ----------------------------------
    // Window management is half this task's Accept, and "quits when you close
    // it" is the half a player notices. This assertion is a REGRESSION GUARD,
    // not a formality: the first version of `main.ts` read `win.webContents.id`
    // inside the window's own `closed` handler, where the contents are already
    // destroyed. The throw aborted the rest of that emit, `window-all-closed`
    // never ran, `app.quit()` was never called, and the process stayed resident
    // after the player closed the game. It was invisible on screen and only
    // showed up here.
    const exited = new Promise<number | null>((resolve) =>
      second.app.process().once('exit', (code) => resolve(code)),
    );
    await second.app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) w.close();
    });
    expect(await exited).toBe(0);
  });

  test('imports a localStorage career into the app-data save dir on first desktop boot', async () => {
    const saveDir = join(tempDir('saves'), 'saves');
    const userDataDir = tempDir('userdata');

    // --- PHASE 1 · play a genuine browser career, in a bridge-less shell ----
    const first = await launch({ saveDir, userDataDir, storage: 'web' });
    await startCareer(first.page, 1702);
    await payDebt(first.page, 500);

    await openSettings(first.page);
    // The web backend names itself honestly, which is also the web-side reader
    // assertion for `storageBackend`.
    await expect(first.page.getByTestId('save-location')).toHaveAttribute(
      'data-storage-backend',
      'browser',
    );
    await expect(first.page.getByTestId('save-location')).toHaveText('Browser storage');
    // Two RNG-free settings and one slot save, so the import is proved over ALL
    // the `sq.*` families — saves, settings and the slot's display meta — not
    // just the autosave.
    await first.page.getByTestId('set-text-size-large').click();
    await first.page.getByTestId('set-crt').click();
    await first.page
      .locator('[data-testid="save-slot"][data-slot="2"]')
      .getByTestId('slot-save')
      .click();
    await expect(first.page.locator('[data-testid="save-slot"][data-slot="2"]')).toHaveAttribute(
      'data-empty',
      '0',
    );
    const slotSummary = await first.page
      .locator('[data-testid="save-slot"][data-slot="2"]')
      .innerText();
    // `aria-pressed`, not the label: the label is uppercased by CSS, so
    // `innerText()` and `toHaveText()` disagree about the same button. The
    // pressed state is the structural fact, and it is what the toggle persists.
    await expect(first.page.getByTestId('set-crt')).toHaveAttribute('aria-pressed', 'false');
    await closeSettings(first.page);

    const played = await bezel(first.page);
    // Nothing reached the app-data dir — this career is purely in localStorage.
    expect(existsSync(saveDir) ? readdirSync(saveDir) : []).toEqual([]);
    await first.app.close();

    // --- PHASE 1b · the fixture really is on disk in the browser profile ----
    // Separates "localStorage never flushed on close" from "the import failed",
    // which are otherwise the same red test with very different causes.
    const recheck = await launch({ saveDir, userDataDir, storage: 'web' });
    expect(await bezel(recheck.page)).toEqual(played);
    await recheck.app.close();

    // --- PHASE 2 · first DESKTOP boot: the import runs ---------------------
    const desktop = await launch({ saveDir, userDataDir });
    expect(await bezel(desktop.page)).toEqual(played);

    await openSettings(desktop.page);
    await expect(desktop.page.getByTestId('save-location')).toHaveAttribute(
      'data-storage-backend',
      'desktop',
    );
    await expect(desktop.page.getByTestId('save-location')).toHaveText(saveDir);
    // Settings came across…
    await expect(desktop.page.getByTestId('set-text-size-large')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(desktop.page.getByTestId('set-crt')).toHaveAttribute('aria-pressed', 'false');
    // …and so did the slot, meta and all.
    await expect(desktop.page.locator('[data-testid="save-slot"][data-slot="2"]')).toHaveAttribute(
      'data-empty',
      '0',
    );
    expect(await desktop.page.locator('[data-testid="save-slot"][data-slot="2"]').innerText()).toBe(
      slotSummary,
    );
    await closeSettings(desktop.page);

    // Every family is a file now, and the marker says the import is done.
    const onDisk = readdirSync(saveDir).sort();
    for (const key of [
      'sq.save.v1',
      'sq.slot.2.v1',
      'sq.slot.2.meta',
      'sq.text-size',
      'sq.fx',
      'sq.migrated.from-localstorage.v1',
    ]) {
      expect(onDisk).toContain(key);
    }
    const marker = readFileSync(join(saveDir, 'sq.migrated.from-localstorage.v1'), 'utf8');
    expect(JSON.parse(marker) as string[]).toContain('sq.save.v1');

    // COPY, not move: a player who goes back to the web build still has it.
    expect(
      await desktop.page.evaluate(() => window.localStorage.getItem('sq.save.v1')),
    ).not.toBeNull();
    await desktop.app.close();

    // --- PHASE 3 · idempotence --------------------------------------------
    const again = await launch({ saveDir, userDataDir });
    expect(await bezel(again.page)).toEqual(played);
    expect(readFileSync(join(saveDir, 'sq.migrated.from-localstorage.v1'), 'utf8')).toBe(marker);
    await again.app.close();
  });
});
