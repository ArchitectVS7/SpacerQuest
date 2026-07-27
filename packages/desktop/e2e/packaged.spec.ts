import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bezel,
  cleanupTempDirs,
  closeSettings,
  expectQuitsCleanly,
  launch,
  openSettings,
  payDebt,
  startCareer,
  tempDir,
  windowShown,
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
    // Waited, not sampled — `show()` rides `ready-to-show`, which can land after
    // `launch()`'s `domcontentloaded`. See `windowShown`.
    const shown = await windowShown(app);
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
    expect(shown).toBe(true);
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
    // T-1704 · WHICH of the two version sources answered. The cockpit now also
    // carries a COMPILED stamp (`ui/src/version.ts`), so "the row shows a
    // version" stopped being proof that the shell was asked at all — the two
    // numbers agree in this repository, and agreement is exactly what would hide
    // a regression. Under a package the SHELL wins, because a packaged binary
    // knows the version of the installer the player actually ran. The web half
    // (`bundle`) is `packages/ui/e2e/settings-saves.spec.ts`.
    await expect(page.getByTestId('app-version')).toHaveAttribute('data-version-source', 'shell');

    // "UPDATER STUB PRESENT AND INERT WITHOUT A FEED", as a player sees it.
    const updates = page.getByTestId('update-status');
    await expect(updates).toHaveAttribute('data-update-status', 'inert');
    await expect(updates).toHaveText('Automatic updates are off in this build.');

    // T-1702a · "NO APP ID IS COMPILED IN", as a player sees it. `COMPILED_STEAM_APP_ID`
    // is `null`, so a real package resolves `unavailable` — and the recording
    // client cannot rescue it either, because `resolveFakeLogPath` refuses the
    // `SQ_STEAM_FAKE` flag outright when `app.isPackaged`. This launch passes no
    // Steam environment at all, so it is also the packaged half of "the app runs
    // identically without Steam present".
    const steam = page.getByTestId('steam-status');
    await expect(steam).toHaveAttribute('data-steam-status', 'unavailable');
    await expect(steam).toHaveText('Not connected — Deeds are still kept in your Registry.');

    // T-1702b · The same, for both halves of Cloud & rich presence. `SQ_STEAM_FAKE`
    // AND `SQ_STEAM_FAKE_CLOUD` are refused outright when `app.isPackaged` — a
    // packaged build whose cloud store an env var could redirect would have an
    // attacker-chosen save directory — so a real package cannot be talked into
    // either fake, and one client load means both features degrade with Steam.
    const cloud = page.getByTestId('steam-cloud');
    await expect(cloud).toHaveAttribute('data-cloud-status', 'unavailable');
    await expect(cloud).toHaveText('Not synced — your saves are kept on this machine.');
    await expect(page.getByTestId('steam-presence')).toHaveText(
      'Not connected — nothing is shown to friends.',
    );

    // T-1704 · THE LICENCES SHIP WITH THE ARTIFACT. This is the legally
    // meaningful case: the OFL and the MIT licence require their notice to
    // travel with the DISTRIBUTED work, and the packaged binary is the thing a
    // player receives — a credits list that only rendered under `vite preview`
    // would satisfy nobody. Asserted inside the real package, off the `app://`
    // scheme, with no dev server behind it.
    //
    // The ids are written out rather than imported from `packages/ui`: this
    // package has ZERO workspace dependencies by design (`tsconfig.json` has no
    // `references`), and a credits import would be the first crack in that. If a
    // row is renamed, the web suite — which does import the constant — fails
    // first and loudly, so the duplication cannot silently rot.
    await expect(page.getByTestId('credits-panel')).toBeVisible();
    for (const id of [
      'font-chakra-petch',
      'font-ibm-plex-mono',
      'audio',
      'react',
      'electron',
      'steamworks-js',
      'spacer-quest-1991',
    ]) {
      await expect(page.locator(`[data-credit-id="${id}"]`)).toHaveCount(1);
    }
    await expect(page.locator('[data-credit-id="font-chakra-petch"]')).toContainText(
      'SIL Open Font License 1.1',
    );
    await expect(page.locator('[data-credit-id="electron"]')).toContainText('MIT');
    await closeSettings(page);

    // …and as the renderer can read it back through the same bridge the main
    // process answers on — `inert` here can only come from `initUpdater`
    // resolving `no-feed`, and `unavailable` from `initSteam` resolving
    // `no-app-id`, in the packaged main process.
    const about = await page.evaluate(() =>
      (
        window as unknown as {
          sqDesktop: {
            about(): {
              version: string;
              updates: string;
              steam: string;
              cloud: string;
              cloudRestored: number;
            };
          };
        }
      ).sqDesktop.about(),
    );
    expect(about).toEqual({
      version: shell.version,
      updates: 'inert',
      steam: 'unavailable',
      // T-1702b · `unavailable` here can only come from `initCloud` resolving
      // `no-steam` off a null client, and `0` from a restore that never ran.
      cloud: 'unavailable',
      cloudRestored: 0,
    });

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

    // --- quitting QUITS the packaged process -------------------------------
    // T-1701a's regression guard, carried forward into a DIFFERENT binary: the
    // `closed`-handler bug it caught was invisible on screen and only showed up
    // as a lingering process. Per-platform, for the reason in the helper's
    // header — this is the assertion that made the mac packaging job time out.
    await expectQuitsCleanly(app);

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
