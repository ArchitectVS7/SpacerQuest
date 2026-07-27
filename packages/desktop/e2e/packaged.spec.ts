import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bezel,
  cleanupTempDirs,
  closeSettings,
  launch,
  openSettings,
  payDebt,
  startCareer,
  tempDir,
} from './support/cockpit';

// ---------------------------------------------------------------------------
// T-1701b ACCEPTANCE — the PACKAGED app, driven as a player drives it.
//
// This is where "packaged app runs Tour One" and "updater stub present and
// inert without a feed" stop being claims. There is no vite server behind this
// run (`playwright.packaged.config.ts` has no `webServer` at all): the cockpit
// comes out of the package, over the `app://` scheme `src/main.ts` registers.
//
// The helpers in `support/cockpit.ts` are the SAME ones `shell.spec.ts` uses, so
// any difference between the dev shell and the package is a difference in the
// BUILD and not in the test.
//
// NO `test.skip` WHEN THE BINARY IS MISSING. This suite is the entire purpose of
// the CI job that runs it; a skip there would report green while proving
// nothing. A missing package is a hard failure with the command that fixes it.
// ---------------------------------------------------------------------------

const RELEASE = join(__dirname, '..', 'release');

/** Where electron-builder's `dir` target puts the launchable binary, per
 *  platform. Probed in order; `SQ_PACKAGED_APP` overrides everything. */
const CANDIDATES = [
  join(RELEASE, 'mac-arm64', 'Rimward.app', 'Contents', 'MacOS', 'Rimward'),
  join(RELEASE, 'mac', 'Rimward.app', 'Contents', 'MacOS', 'Rimward'),
  join(RELEASE, 'win-unpacked', 'Rimward.exe'),
  join(RELEASE, 'linux-unpacked', 'rimward'),
];

function packagedBinary(): string {
  const override = process.env.SQ_PACKAGED_APP;
  if (override) {
    if (!existsSync(override)) {
      throw new Error(`SQ_PACKAGED_APP points at nothing: ${override}`);
    }
    return override;
  }
  const found = CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      'No packaged Rimward build found. Build one first:\n' +
        '  npm run package:mac   (macOS)\n' +
        '  npm run package:win   (Windows)\n' +
        `Looked in:\n${CANDIDATES.map((p) => `  ${p}`).join('\n')}`,
    );
  }
  return found;
}

test.afterEach(() => cleanupTempDirs());

test.describe('T-1701b · the packaged app', () => {
  test('runs Tour One from a packaged build with no dev server', async () => {
    const executablePath = packagedBinary();
    const saveDir = join(tempDir('saves'), 'saves');
    const userDataDir = tempDir('userdata');

    const { app, page } = await launch({ saveDir, userDataDir, executablePath });

    // --- it really is a package -------------------------------------------
    const shell = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
      const all = BrowserWindow.getAllWindows();
      return {
        packaged: electronApp.isPackaged,
        name: electronApp.getName(),
        version: electronApp.getVersion(),
        windows: all.map((w) => ({ visible: w.isVisible(), min: w.getMinimumSize() })),
      };
    });
    // `isPackaged` is the flag `main.ts` branches the renderer URL on AND the
    // one `updater.ts` requires before it will consider a feed — so it is the
    // hinge of both halves of this task.
    expect(shell.packaged).toBe(true);
    // The app NAME still derives `getPath('userData')` after packaging; the
    // `extraMetadata.name: "rimward"` electron-builder needs for artifact
    // naming must NOT have moved it (`main.ts` calls `setName` pre-ready).
    expect(shell.name).toBe('Rimward');
    expect(shell.windows).toHaveLength(1);
    expect(shell.windows[0].visible).toBe(true);
    expect(shell.windows[0].min).toEqual([1024, 640]);

    // --- the renderer is BUNDLED: no localhost, no vite --------------------
    expect(page.url().startsWith('app://')).toBe(true);
    expect(page.url()).not.toContain('localhost');

    // --- "packaged app runs Tour One" --------------------------------------
    await startCareer(page, 1701);

    // --- Settings: the readers, in a real package --------------------------
    await openSettings(page);
    const location = page.getByTestId('save-location');
    await expect(location).toHaveAttribute('data-storage-backend', 'desktop');
    await expect(location).toHaveText(saveDir);

    await expect(page.getByTestId('app-version')).toHaveText(shell.version);
    await expect(page.getByTestId('app-version')).toHaveText(/^\d+\.\d+\.\d+$/);

    // "UPDATER STUB PRESENT AND INERT WITHOUT A FEED", as a player sees it.
    const updates = page.getByTestId('update-status');
    await expect(updates).toHaveAttribute('data-update-status', 'inert');
    await expect(updates).toHaveText('Automatic updates are off in this build.');
    await closeSettings(page);

    // …and as the renderer can read it back through the same bridge the main
    // process answers on — `inert` here can only come from `initUpdater`
    // resolving `no-feed` in the packaged main process.
    const about = await page.evaluate(() =>
      (
        window as unknown as { sqDesktop: { about(): { version: string; updates: string } } }
      ).sqDesktop.about(),
    );
    expect(about).toEqual({ version: shell.version, updates: 'inert' });

    // --- packaging did not break the save path -----------------------------
    const autosave = join(saveDir, 'sq.save.v1');
    expect(existsSync(autosave)).toBe(true);
    const firstBytes = readFileSync(autosave, 'utf8');

    const before = await bezel(page);
    await payDebt(page, 500);
    await expect(page.getByTestId('credits')).not.toHaveText(before.credits);
    const after = await bezel(page);
    await expect
      .poll(() => readFileSync(autosave, 'utf8'), { timeout: 10_000 })
      .not.toBe(firstBytes);

    // --- the `app://` handler GATES, and does not fall back to index.html --
    // A 200 here would mean either a traversal-friendly handler or a silent SPA
    // rewrite masking every broken asset path as a blank tube.
    const missing = await page.evaluate(() =>
      fetch('/definitely-not-here.js').then((r) => r.status),
    );
    expect(missing).toBe(404);

    // --- closing every window QUITS the packaged process -------------------
    // T-1701a's regression guard, carried forward into a DIFFERENT binary: the
    // `closed`-handler bug it caught was invisible on screen and only showed up
    // as a lingering process.
    const exited = new Promise<number | null>((resolve) =>
      app.process().once('exit', (code) => resolve(code)),
    );
    await app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) w.close();
    });
    expect(await exited).toBe(0);

    // --- THE CRITERION'S TEETH: the career came off disk -------------------
    // Same save dir, WIPED user-data dir (so the renderer's localStorage is
    // empty). If the career comes back, it came out of the app-data file.
    const freshProfile = tempDir('userdata2');
    const second = await launch({ saveDir, userDataDir: freshProfile, executablePath });
    await expect(second.page.getByTestId('day')).toBeVisible();
    expect(await bezel(second.page)).toEqual(after);
    await second.app.close();
  });
});
