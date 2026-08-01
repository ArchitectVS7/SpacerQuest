import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  bezel,
  cleanupTempDirs,
  closeSettings,
  cloudFiles,
  endDay,
  expectQuitsCleanly,
  launch as launchShell,
  openSettings,
  payDebt,
  presenceLog,
  startCareer,
  steamLog,
  tempDir,
  windowShown,
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

/** The version this package claims to be, read from the manifest rather than
 *  restated — a hard-coded copy here would be a third place to update and the
 *  one nobody remembers. `packages/ui/src/__tests__/version.test.ts` pins this
 *  to the root manifest and the cockpit's compiled stamp, so asserting the shell
 *  against it asserts all three agree. */
const MANIFEST_VERSION = (
  JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }
).version;

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
    // BEFORE the snapshot: `show()` happens on `ready-to-show`, which can land
    // after the `domcontentloaded` that `launch()` awaits. See `windowShown`.
    const shown = await windowShown(app);
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
    // Visibility proves the paint-then-show path ran: the window is created with
    // `show: false` and only shown on `ready-to-show`, so a window that is
    // visible is one that has painted. Asserted on the WAITED answer — a window
    // that never shows makes this `false` and fails, same as before.
    expect(shown).toBe(true);
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
    // T-1701b added `about`; T-1702a added `unlockAchievement`; T-1702b added
    // `setPresence`; T-141 added `appendPlaytestLog` (the opt-in playtest log's
    // desktop sink, `docs/PLAYTEST-TELEMETRY_SPEC.md` §4). The list is asserted
    // EXACTLY so the three twins (`preload.ts`, `storage.ts`'s
    // `DesktopStorageBridge`, this) cannot drift — which is why each task
    // UPDATES it rather than loosening it.
    expect(bridgeMethods).toEqual([
      'about',
      'appendPlaytestLog',
      'dir',
      'getItem',
      'keys',
      'removeItem',
      'setItem',
      'setPresence',
      'unlockAchievement',
    ]);

    // --- Tour One, start of career ----------------------------------------
    await startCareer(page, 1701);

    // --- the READER of `saveLocation` / `storageBackend` -------------------
    await openSettings(page);
    const row = page.getByTestId('save-location');
    await expect(row).toHaveAttribute('data-storage-backend', 'desktop');
    await expect(row).toHaveText(saveDir);

    // --- T-1701b · the READER of `shellVersion` / `updateStatus` ------------
    // THE GAME's version, asserted against the manifest rather than a shape.
    // `/^\d+\.\d+\.\d+$/` was the old assertion and it was not one: a dev shell
    // has no package.json at its app path, so `app.getVersion()` returned the
    // ELECTRON BINARY's version, and `33.4.11` satisfies that pattern happily.
    // The row named Electron's release as the game's on every developer's
    // machine, and only the CI runner's Electron — which reports a bare `0.0` —
    // ever made it look wrong. An exact value is the only version assertion with
    // teeth. (`src/main.ts`'s `resolveAppVersion` is the fix.)
    await expect(page.getByTestId('app-version')).toHaveText(MANIFEST_VERSION);
    // And it is the SHELL answering, not the cockpit's compiled stamp falling
    // through — the two agree in this repository, and that agreement is exactly
    // what would hide a shell that stopped answering at all.
    await expect(page.getByTestId('app-version')).toHaveAttribute('data-version-source', 'shell');
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
    // showed up here. `expectQuitsCleanly` asserts exactly that, per platform —
    // see its header for why "closing the last window exits" is not the mac
    // gesture.
    await expectQuitsCleanly(second.app);
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

// ---------------------------------------------------------------------------
// T-1702a ACCEPTANCE — Steam achievements, and the no-Steam build.
//
// "Achievements fire from deed events in the Steam dev sandbox" and "the app
// runs identically without Steam present" (the Accept). Both are proved THROUGH
// THE REAL WINDOW, driven by clicks: `startCareer` + `payDebt` earn a real Deed
// (`debt_first_payment`, whose trigger is `DebtPayment{amount ≥ 1}` — die-free
// and RNG-insensitive, which is why `payDebt` is the driver), the store maps it
// to an API name, the preload sends it over the real IPC bridge, and the real
// main process hands it to `SteamSession.unlock`. Nothing here reaches into the
// store, the engine or a save file to SET state.
//
// THE SANDBOX. `SQ_STEAM_APP_ID=480` is Spacewar, Valve's public dev app.
// Achievement delivery to a LIVE Steam client cannot be evidence CI holds — no
// runner has Steam installed — so the far end here is the shell's recording
// client (`src/steam.ts`'s `createRecordingClient`), which answers `isActivated`
// from its own log so the dedupe path is exercised for real. A live-client run
// is recorded in the Delivered note under the same CI-evidence rule T-1701b set
// for macOS packaging.
// ---------------------------------------------------------------------------

test.describe('T-1702a · Steam achievements', () => {
  test('a deed earned in play fires its Steam achievement, and a relaunch backfills it', async () => {
    const saveDir = join(tempDir('saves'), 'saves');
    const userDataDir = tempDir('userdata');
    const steamFakeLog = join(tempDir('steam'), 'steam.jsonl');

    const first = await launch({ saveDir, userDataDir, steamAppId: 480, steamFakeLog });

    // --- the READER of `steamStatus`, before anything is earned -------------
    await startCareer(first.page, 1702);
    await openSettings(first.page);
    const status = first.page.getByTestId('steam-status');
    await expect(status).toHaveAttribute('data-steam-status', 'ready');
    // The count is what makes the MIRROR visible rather than just the connection.
    await expect(first.page.getByTestId('steam-achievements')).toHaveText(
      /^0 of \d+ mirrored to Steam\.$/,
    );
    await closeSettings(first.page);
    // Nothing was earned yet, so nothing was sent — the mirror is driven by
    // events, not by boot.
    expect(steamLog(steamFakeLog)).toEqual([]);

    // --- ONE CLICK EARNS ONE DEED ------------------------------------------
    await payDebt(first.page, 500);

    // The engine earned it (the count is read straight from
    // `player.registry.earned`)…
    await openSettings(first.page);
    await expect(first.page.getByTestId('steam-achievements')).toHaveText(
      /^1 of \d+ mirrored to Steam\.$/,
    );
    await closeSettings(first.page);

    // …and it crossed the bridge into the main process. THIS is the Accept.
    await expect
      .poll(() => steamLog(steamFakeLog), { timeout: 10_000 })
      .toEqual(['DEED_DEBT_FIRST_PAYMENT']);

    // A second payment earns no second deed, and sends nothing more — the
    // per-session dedupe and the engine's own once-only registry agree.
    await payDebt(first.page, 500);
    await expect(first.page.getByTestId('credits')).toBeVisible();
    expect(steamLog(steamFakeLog)).toEqual(['DEED_DEBT_FIRST_PAYMENT']);
    await first.app.close();

    // --- THE BACKFILL, proved from a REAL career ---------------------------
    // Same save dir, a FRESH fake log (i.e. a Steam account that has never seen
    // this achievement). The `DeedEarned` event is in the loaded save's past and
    // will never be re-emitted, so if the name shows up here it can only have
    // come from `achievementsForState` reconciling the loaded Registry. Without
    // that path a veteran's first Steam launch would mirror nothing, ever.
    const freshLog = join(tempDir('steam2'), 'steam.jsonl');
    const second = await launch({ saveDir, userDataDir, steamAppId: 480, steamFakeLog: freshLog });
    await expect(second.page.getByTestId('day')).toBeVisible();
    await expect
      .poll(() => steamLog(freshLog), { timeout: 10_000 })
      .toEqual(['DEED_DEBT_FIRST_PAYMENT']);

    await openSettings(second.page);
    await expect(second.page.getByTestId('steam-status')).toHaveAttribute(
      'data-steam-status',
      'ready',
    );
    await expect(second.page.getByTestId('steam-achievements')).toHaveText(
      /^1 of \d+ mirrored to Steam\.$/,
    );
    await closeSettings(second.page);
    await second.app.close();
  });

  test('the app runs identically without Steam present', async () => {
    // No app id and no fake: the shell takes the same path a player's copy takes
    // with Steam uninstalled, Steam closed, or the optional native dependency
    // never installed. All of those are one state, and it is not a degraded one.
    const saveDir = join(tempDir('saves'), 'saves');
    const userDataDir = tempDir('userdata');

    const { app, page } = await launch({ saveDir, userDataDir });

    // --- the whole game still works, start to autosave ---------------------
    // Deliberately the SAME start-of-career markers and the SAME autosave
    // assertion the T-1701a test makes, re-run on the no-Steam path: "runs
    // identically" is a claim about the game, not about the Steam row.
    await startCareer(page, 1703);
    const autosave = join(saveDir, 'sq.save.v1');
    expect(existsSync(autosave)).toBe(true);
    const firstBytes = readFileSync(autosave, 'utf8');

    await openSettings(page);
    const status = page.getByTestId('steam-status');
    await expect(status).toHaveAttribute('data-steam-status', 'unavailable');
    // The exact sentence, because the wording is the deliverable here: it must
    // not read as a fault (this is a supported way to play) and it must not
    // imply the Registry stopped working.
    await expect(status).toHaveText('Not connected — Deeds are still kept in your Registry.');
    // The tally is still honest off Steam — the Deeds are earned either way.
    await expect(page.getByTestId('steam-achievements')).toHaveText(
      /^0 of \d+ earned — they will mirror when you play on Steam\.$/,
    );
    // T-1702b · "The no-Steam fallback still clean for BOTH features" is a clause
    // of that task's Accept, and this is where it is discharged: one client load
    // means cloud and presence are `unavailable` exactly when Steam is, and both
    // rows say so in words that do not read as a fault.
    const cloud = page.getByTestId('steam-cloud');
    await expect(cloud).toHaveAttribute('data-cloud-status', 'unavailable');
    await expect(cloud).toHaveText('Not synced — your saves are kept on this machine.');
    await expect(page.getByTestId('steam-presence')).toHaveText(
      'Not connected — nothing is shown to friends.',
    );

    // The rest of Settings is untouched by the new section.
    await expect(page.getByTestId('save-location')).toHaveAttribute(
      'data-storage-backend',
      'desktop',
    );
    await expect(page.getByTestId('save-slot')).toHaveCount(3);
    await closeSettings(page);

    const before = await bezel(page);
    await payDebt(page, 500);
    await expect(page.getByTestId('credits')).not.toHaveText(before.credits);
    await expect
      .poll(() => readFileSync(autosave, 'utf8'), { timeout: 10_000 })
      .not.toBe(firstBytes);

    // A deed WAS earned — the Registry is unaffected by Steam's absence. This is
    // the half that makes "identically" mean something.
    await openSettings(page);
    await expect(page.getByTestId('steam-achievements')).toHaveText(
      /^1 of \d+ earned — they will mirror when you play on Steam\.$/,
    );
    await closeSettings(page);

    // …and quitting still exits 0 with no Steam session to tear down —
    // T-1702b: and with a cloud session to flush and a presence session to clear
    // in `before-quit`, both of which are on the quit path this asserts.
    await expectQuitsCleanly(app);
  });
});

// ---------------------------------------------------------------------------
// T-1702b ACCEPTANCE — Steam Cloud, and rich presence.
//
// "Cloud round-trip verified in the dev sandbox" and "rich presence shows
// current system/day" (the Accept). Both are proved THROUGH THE REAL WINDOW,
// driven by clicks: nothing here reaches into the store, the engine or a save
// file to SET state — files are read only to assert.
//
// THE SANDBOX, and the same CI-evidence rule T-1702a set. No runner has a Steam
// client, so delivery to a LIVE Steam Cloud (or a real friends list) cannot be a
// CI assertion. The far end here is the shell's recording client
// (`src/steam.ts`'s `createRecordingClient`), whose cloud is REAL FILES in a
// directory — which is what lets the round trip survive a relaunch, the only
// form in which "round trip" means anything. A live-client run is recorded in
// the Delivered note.
// ---------------------------------------------------------------------------

test.describe('T-1702b · Steam Cloud & rich presence', () => {
  test('a career survives a wiped machine: the Steam Cloud round trip', async () => {
    const saveDirA = join(tempDir('savesA'), 'saves');
    const userDataA = tempDir('userdataA');
    const cloudDir = join(tempDir('cloud'), 'cloud');
    const steamFakeLog = join(tempDir('steam'), 'steam.jsonl');

    const first = await launch({
      saveDir: saveDirA,
      userDataDir: userDataA,
      steamAppId: 480,
      steamFakeLog,
      steamFakeCloud: cloudDir,
    });

    // --- play a real career, by clicks -------------------------------------
    await startCareer(first.page, 1702);
    await payDebt(first.page, 500); // die-free and RNG-insensitive
    const played = await bezel(first.page);

    // --- the READER of `cloudStatus` / `cloudRestored`, on a fresh machine ---
    await openSettings(first.page);
    const cloudRow = first.page.getByTestId('steam-cloud');
    await expect(cloudRow).toHaveAttribute('data-cloud-status', 'ready');
    // Nothing came DOWN on this launch — there was nothing up there yet.
    await expect(cloudRow).toHaveText('Synced — your careers are backed up to Steam Cloud.');
    await closeSettings(first.page);

    // --- the upload is COALESCED, so this is eventually-consistent by design.
    // `expect.poll`, never a sleep: the flush window is a product decision
    // (`cloud.ts`'s CLOUD_FLUSH_MS), not a timing this spec should encode.
    await expect.poll(() => cloudFiles(cloudDir), { timeout: 15_000 }).toContain('sq.save.v1');
    // Closing the app flushes anything still dirty, synchronously, in
    // `before-quit`.
    await first.app.close();

    // --- THE CRITERION'S TEETH: a brand-new machine ------------------------
    // A WIPED save dir AND a wiped user-data dir (so localStorage is empty too),
    // pointed at the same cloud. If the career comes back it can only have come
    // down from Steam Cloud — there is nowhere else left.
    const saveDirB = join(tempDir('savesB'), 'saves');
    const userDataB = tempDir('userdataB');
    const second = await launch({
      saveDir: saveDirB,
      userDataDir: userDataB,
      steamAppId: 480,
      steamFakeLog: join(tempDir('steam2'), 'steam.jsonl'),
      steamFakeCloud: cloudDir,
    });

    await expect(second.page.getByTestId('day')).toBeVisible();
    // The SEED is the direct proof that what round-tripped is the seed-carrying
    // T-1002 envelope: for a v2+ save the seed lives nowhere but the envelope.
    expect(await bezel(second.page)).toEqual(played);
    // …and it really landed as a FILE, through the same validated save store.
    expect(existsSync(join(saveDirB, 'sq.save.v1'))).toBe(true);

    await openSettings(second.page);
    await expect(second.page.getByTestId('steam-cloud')).toHaveText(
      'Synced — 1 save restored from Steam Cloud this launch.',
    );
    await closeSettings(second.page);
    await second.app.close();

    // --- THE NO-CLOBBER HALF (semantic 3), proved rather than commented ----
    // Same save dir, now POPULATED, with a cloud copy sitting there. The restore
    // must skip it: a career in progress on this machine beats whatever the
    // cloud holds, because `listFiles()` carries no timestamp and "newest wins"
    // cannot be implemented honestly.
    const localBytes = readFileSync(join(saveDirB, 'sq.save.v1'), 'utf8');
    const third = await launch({
      saveDir: saveDirB,
      userDataDir: userDataB,
      steamAppId: 480,
      steamFakeLog: join(tempDir('steam3'), 'steam.jsonl'),
      steamFakeCloud: cloudDir,
    });
    await expect(third.page.getByTestId('day')).toBeVisible();
    await openSettings(third.page);
    await expect(third.page.getByTestId('steam-cloud')).toHaveText(
      'Synced — your careers are backed up to Steam Cloud.',
    );
    await closeSettings(third.page);
    expect(readFileSync(join(saveDirB, 'sq.save.v1'), 'utf8')).toBe(localBytes);
    await third.app.close();
  });

  test('rich presence follows the player’s day and system', async () => {
    const saveDir = join(tempDir('saves'), 'saves');
    const userDataDir = tempDir('userdata');
    const steamFakeLog = join(tempDir('steam'), 'steam.jsonl');

    const { app, page } = await launch({ saveDir, userDataDir, steamAppId: 480, steamFakeLog });

    await startCareer(page, 1702);

    // --- what the PLAYER is shown ------------------------------------------
    await openSettings(page);
    const row = page.getByTestId('steam-presence');
    await expect(row).toHaveText(/^Day 1 — .+$/);
    const dayOneLine = await row.innerText();
    await closeSettings(page);

    // --- what STEAM was actually handed, on the far side of the real bridge --
    // Two observations of the same value from opposite ends is what makes this
    // evidence rather than a snapshot of our own render.
    await expect
      .poll(() => presenceLog(steamFakeLog), { timeout: 10_000 })
      .toEqual([
        { key: 'system', value: dayOneLine.replace('Day 1 — ', '') },
        { key: 'day', value: '1' },
        // The reserved key carries a partner-site TOKEN, never prose — the
        // sentence itself is authored in App Admin (see docs/STEAM-ACHIEVEMENTS.md).
        { key: 'steam_display', value: '#Status_InSystem' },
      ]);

    // --- and it MOVES when the player does ---------------------------------
    await endDay(page);

    await openSettings(page);
    await expect(row).toHaveText(/^Day 2 — .+$/);
    await closeSettings(page);

    await expect
      .poll(() => presenceLog(steamFakeLog).filter((p) => p.key === 'day'), { timeout: 10_000 })
      .toEqual([
        { key: 'day', value: '1' },
        { key: 'day', value: '2' },
      ]);

    // …and the quit clears it, so a stale "Day 2 — Sun-3" does not outlive the
    // process on the player's friends list.
    await app.close();
    expect(presenceLog(steamFakeLog).at(-1)).toEqual({ key: 'steam_display', value: null });
  });
});

// ---------------------------------------------------------------------------

test.describe('T-141 · opt-in playtest logging', () => {
  // `docs/PLAYTEST-TELEMETRY_SPEC.md` §4 names the desktop store as the shipping
  // target: "an append-only JSONL file under the existing
  // `app.getPath('userData')` directory … Rotate per session". The unit suites
  // own the module (`src/__tests__/playtest-log.test.ts`) and the bridge
  // (`packages/ui/src/__tests__/storage.test.ts`); THIS owns the link between
  // them — the real preload, the real sender-validated IPC channel, the real
  // file — driven by a player who opens Settings and presses the toggle.

  test('writes nothing until the player opts in, then appends the real action stream', async () => {
    const saveDir = join(tempDir('saves'), 'saves');
    const userDataDir = tempDir('userdata');
    const logDir = join(tempDir('logs'), 'logs');

    const { app, page } = await launch({ saveDir, userDataDir, logDir });
    await startCareer(page, 141);

    // --- OFF BY DEFAULT, and off means NOTHING ON DISK ----------------------
    await payDebt(page, 100);
    expect(existsSync(logDir)).toBe(false);

    await openSettings(page);
    const toggle = page.getByTestId('set-playtest-logging');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    // The sentence is SPELLED OUT here rather than imported from
    // `packages/ui/src/playtestLog.ts`, unlike the web spec's copy: this package
    // must not grow a source dependency on the cockpit. A literal is safe
    // BECAUSE it fails loudly on drift — the golden in
    // `packages/ui/src/__tests__/playtest-log.test.ts` is the authority, and if
    // the spec's wording ever changes, both this and that must move together.
    await expect(page.getByTestId('playtest-disclosure')).toHaveText(
      'Gameplay actions only — no personally identifying information, no location.',
    );

    // --- the player opts in --------------------------------------------------
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await closeSettings(page);

    // --- a real action, taken the way a player takes it ---------------------
    await payDebt(page, 100);

    // The file is named for the session and appended line by line, so the last
    // line before a crash is already on disk.
    await expect
      .poll(() => (existsSync(logDir) ? readdirSync(logDir) : []), { timeout: 10_000 })
      .toHaveLength(1);
    const [file] = readdirSync(logDir);
    expect(file).toMatch(/^playtest-[A-Za-z0-9-]{1,64}\.jsonl$/);

    const entries = readFileSync(join(logDir, file), 'utf8')
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as { kind: string; day: number; action?: { type: string } });
    expect(entries).toHaveLength(1); // the action taken AFTER opting in, and only it
    expect(entries[0].kind).toBe('action');
    expect(entries[0].day).toBe(1);
    expect(entries[0].action?.type).toBe('Trade');

    // --- and a flagged moment lands in the same file -------------------------
    await openSettings(page);
    await page.getByTestId('playtest-flag-input').fill('the debt row read oddly');
    await page.getByTestId('playtest-flag').click();
    await closeSettings(page);

    await expect
      .poll(() => readFileSync(join(logDir, file), 'utf8').trimEnd().split('\n').length, {
        timeout: 10_000,
      })
      .toBe(2);
    const flagged = JSON.parse(
      readFileSync(join(logDir, file), 'utf8').trimEnd().split('\n')[1],
    ) as { kind: string; note: string };
    expect(flagged).toMatchObject({ kind: 'annotation', note: 'the debt row read oddly' });

    // --- no PII: the OS username never reaches the file ---------------------
    // Spec §2 excludes it outright, and the session id is minted fresh rather
    // than derived from anything about the machine.
    const raw = readFileSync(join(logDir, file), 'utf8');
    expect(raw).not.toContain(userDataDir);
    expect(raw).not.toContain(saveDir);

    await app.close();
  });
});
