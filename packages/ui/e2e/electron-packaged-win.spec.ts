import { _electron as electron, test, expect, type ElectronApplication } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================================
//  T-1705 · Windows packaging CI proof — PACKAGED-EXE cockpit smoke (windows-latest)
// ============================================================================
//
// This is the Windows sibling of `electron-packaged.spec.ts`. T-1701 shipped the
// `package:win` NSIS target and the mac `desktop` CI job proves the packaged `.app`
// on macOS, but no CI had ever exercised the Windows target — where the large
// majority of Steam players are. This spec launches the ACTUAL packaged
// `win-unpacked/*.exe` produced by `electron-builder --dir` (via `executablePath`,
// which makes `app.isPackaged` true) and plays a short cockpit smoke — boot, dawn
// roll, sign, end day — through the real packaged renderer.
//
//   1. Packaged exe RUNS Tour One         → boots the cockpit from resources/dist-web.
//   2. app.isPackaged is TRUE             → asserts the packaged code path really ran.
//   3. Saves land in the Windows userData → asserts store.json under the userData dir
//                                           AND app.getPath('userData') === override.
//   4. steamworks.js win-x64 prebuild     → asserts the .node addon survived packaging
//      present in the packaged app          into resources/app.asar.unpacked (guards
//                                            the T-1702 file-map + asarUnpack path,
//                                            whose EEXIST class regressed once already).
//
// Why the `@win` tag + the `process.platform` self-skip: the mac `desktop` job runs
// the whole `electron` Playwright project, whose glob (`/electron-.*\.spec\.ts/`)
// also matches THIS file. The top guard makes it a no-op off Windows so the mac job
// stays byte-behaviourally unchanged; the Windows CI job selects ONLY this test with
// `--grep "@win"`.
//
// Why teardown uses `taskkill /T` not `pgrep`: the sibling specs reap the Electron
// process tree with unix `pgrep` + SIGKILL, which does not exist on Windows. Here we
// force-kill the tree with `taskkill /PID <pid> /T /F` (`/T` reaps renderer/GPU/helper
// children — the Windows equivalent of the unix tree kill).
//
// Requires the packaged app to exist first: `npm run package:dir -w @spacerquest/desktop`
// (the Windows CI job runs it before this spec). When no packaged app is present the
// spec skips with build guidance rather than hard-failing.

const here = path.dirname(fileURLToPath(import.meta.url));
const RELEASE_DIR = path.resolve(here, '../../desktop/release');

/** Locate the packaged Windows exe under `release/win-unpacked/`. Globs the single
 *  top-level `*.exe` (do NOT hardcode the em-dash productName `Spacer Quest — Rimward.exe`
 *  — brittle). Returns null when no `--dir` build exists yet. */
function findPackagedExe(): string | null {
  if (!fs.existsSync(RELEASE_DIR)) return null;
  for (const entry of fs.readdirSync(RELEASE_DIR)) {
    const outDir = path.join(RELEASE_DIR, entry);
    if (!fs.statSync(outDir).isDirectory()) continue;
    if (!entry.includes('win-unpacked')) continue;
    const exeName = fs.readdirSync(outDir).find((n) => n.toLowerCase().endsWith('.exe'));
    if (!exeName) continue;
    const exe = path.join(outDir, exeName);
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

function makeUserDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sq-electron-pkg-win-'));
}

function storeFileFor(userData: string): string {
  return path.join(userData, 'saves', 'store.json');
}

/** The unpacked steamworks.js native prebuild that MUST ship beside the packaged exe.
 *  `asarUnpack: node_modules/steamworks.js/**` extracts the whole module out of the
 *  asar; this is the exact win-x64 `.node` binary the runtime `require('steamworks.js')`
 *  dlopen's. Its presence proves the T-1702 file-map + asarUnpack path holds on Windows. */
function steamworksPrebuildFor(exe: string): string {
  return path.join(
    path.dirname(exe),
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'steamworks.js',
    'dist',
    'win64',
    'steamworksjs.win32-x64-msvc.node',
  );
}

/** Tear the shell down robustly on Windows: ask Electron to quit gracefully; if it
 *  lingers, force-kill the WHOLE process tree with `taskkill /T` (reaps renderer/GPU/
 *  helper children). Every test asserts its state BEFORE teardown, so a forced kill
 *  never loses a proof. */
async function closeApp(app: ElectronApplication): Promise<void> {
  const proc = app.process();
  const pid = proc.pid;
  const exited = new Promise<void>((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) return resolve();
    proc.once('exit', () => resolve());
  });
  const closed = app.close().catch(() => {});
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), 8000)),
  ]);
  if (!graceful && pid) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F']);
    } catch {
      /* already gone / not found — benign */
    }
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
  }
  await Promise.race([closed, new Promise((r) => setTimeout(r, 3000))]);
}

test('@win packaged win-unpacked exe boots Tour One and saves into the Windows userData dir', async () => {
  // Belt-and-suspenders: the Windows CI job selects this with `--grep "@win"`, but the
  // mac `desktop` job's `electron` project glob also matches this file — so self-skip
  // anywhere but Windows to keep the mac job's behaviour byte-unchanged.
  test.skip(
    process.platform !== 'win32',
    'Windows packaged-exe smoke — runs on windows-latest only',
  );

  const exe = findPackagedExe();
  test.skip(
    exe === null,
    `No packaged Windows app under ${RELEASE_DIR}. Build one first: ` +
      `CSC_IDENTITY_AUTO_DISCOVERY=false npm run package:dir -w @spacerquest/desktop`,
  );

  const userData = makeUserDataDir();
  const app = await electron.launch({
    // Launch the packaged exe directly → app.isPackaged === true, so the renderer
    // resolves from resources/dist-web (the packaged-only branch in main.ts).
    executablePath: exe!,
    args: [],
    env: {
      ...process.env,
      SQ_USER_DATA_DIR: userData,
      SQ_QUIT_ON_WINDOW_CLOSE: '1',
    },
  });
  try {
    // Prove the packaged code path really ran (not the unpackaged dev branch).
    const isPackaged = await app.evaluate(({ app: a }) => a.isPackaged);
    expect(isPackaged).toBe(true);

    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // --- Cockpit smoke · boot + dawn roll -------------------------------------
    await expect(page.getByRole('heading', { name: 'Spacer Quest' })).toBeVisible();
    await expect(page.getByTestId('day')).toHaveText('1');
    await expect(page.getByTestId('debt-chip')).toContainText('25,000');
    await expect(page.getByTestId('die')).toHaveCount(5);

    // --- Cockpit smoke · sign the first contract, then end the day ------------
    await expect(page.getByTestId('active-contract-empty')).toBeVisible();
    await page.getByTestId('die').first().click();
    await page.getByTestId('contract').first().click();
    await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);

    await page.getByTestId('end-day').click();
    await expect(page.getByTestId('day')).toHaveText('2');

    // --- Saves land in the WINDOWS userData dir --------------------------------
    const storeFile = storeFileFor(userData);
    await expect.poll(() => fs.existsSync(storeFile), { timeout: 5000 }).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(storeFile, 'utf8')) as Record<string, string>;
    expect(parsed['sq.save.v1']).toBeTruthy();

    // The renderer used the native store, not browser localStorage.
    const usedNative = await page.evaluate(
      () => (window as unknown as { sqNative?: unknown }).sqNative !== undefined,
    );
    expect(usedNative).toBe(true);
    const localCopy = await page.evaluate(() => window.localStorage.getItem('sq.save.v1'));
    expect(localCopy).toBeNull();

    // Explicit proof the userData MECHANISM resolved to the Windows override dir (not
    // just that a temp file happens to exist): app.getPath('userData') === our dir.
    const resolvedUserData = await app.evaluate(({ app: a }) => a.getPath('userData'));
    expect(path.resolve(resolvedUserData)).toBe(path.resolve(userData));

    // --- steamworks.js win-x64 prebuild survived packaging ---------------------
    // Guards the T-1702-fix EEXIST/file-map regression class on Windows: the native
    // addon must be unpacked beside the exe, or `require('steamworks.js')` fails.
    const prebuild = steamworksPrebuildFor(exe!);
    expect(fs.existsSync(prebuild)).toBe(true);
  } finally {
    await closeApp(app);
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
