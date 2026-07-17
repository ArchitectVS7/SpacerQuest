import { _electron as electron, test, expect, type ElectronApplication } from '@playwright/test';
import { createInitialState, startDay, createSave, type GameState } from '@spacerquest/engine';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================================
//  T-1701 · Electron shell — save-location + migration proof (real Electron DOM)
// ============================================================================
//
// Driven the way the global "validate the UX, never the API" rule demands: it launches
// the Electron main entry (`packages/desktop/dist/main.js`) with the `electron` binary
// and plays Tour One through the actual cockpit DOM — no engine call bypasses a screen.
// This runs UNPACKAGED (`app.isPackaged === false`), so it proves the shell's
// storage behaviour; the packaged-boot code path (process.resourcesPath/dist-web) is
// proven separately by `electron-packaged.spec.ts`, which launches the real .app.
//   1. Shell RUNS Tour One                    → boots the cockpit, plays through it.
//   2. Saves land in the OS APP-DATA dir      → asserts store.json under userData.
//   3. localStorage saves MIGRATE in          → asserts a pre-seeded career imports.
//
// The ONLY engine use is OFFLINE save-fixture construction (createInitialState →
// startDay → createSave) for the migration fixture — the exact allowance the
// tour-one / onboarding specs already stand on (state SETUP, never an in-page call).
//
// Runs only under `SQ_ELECTRON=1` (its own Playwright project); the web e2e run
// never spawns Electron. Requires `packages/desktop/dist/main.js` and
// `packages/ui/dist-web` to be built first (the desktop CI job builds both).

const here = path.dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = path.resolve(here, '../../desktop/dist/main.js');
const DIST_WEB_INDEX = path.resolve(here, '../dist-web/index.html');

/** Fail loudly with actionable guidance if the shell/renderer aren't built. */
function assertBuilt(): void {
  if (!fs.existsSync(MAIN_ENTRY)) {
    throw new Error(
      `Electron main not built at ${MAIN_ENTRY}. Run: npm run build:main -w @spacerquest/desktop`,
    );
  }
  if (!fs.existsSync(DIST_WEB_INDEX)) {
    throw new Error(
      `Renderer not built at ${DIST_WEB_INDEX}. Run: npm run build -w @spacerquest/ui`,
    );
  }
}

/** A throwaway OS userData dir per launch — proves saves land in app-data, not the
 *  browser's localStorage, and keeps each test hermetic. */
function makeUserDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sq-electron-'));
}

function storeFileFor(userData: string): string {
  return path.join(userData, 'saves', 'store.json');
}

async function launch(userData: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [MAIN_ENTRY],
    env: {
      ...process.env,
      SQ_USER_DATA_DIR: userData,
      // Quit the moment the window closes so `app.close()` tears down deterministically
      // on macOS (where the app otherwise stays resident and Playwright force-kills it).
      SQ_QUIT_ON_WINDOW_CLOSE: '1',
    },
  });
}

/** Every descendant pid of `pid` (renderer + GPU + utility helpers), leaves last. */
function descendantPids(pid: number): number[] {
  let children: number[] = [];
  try {
    const out = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' });
    children = out
      .split('\n')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    /* pgrep exits non-zero when there are no children — benign */
  }
  return children.flatMap((c) => [...descendantPids(c), c]);
}

/** Tear the shell down robustly. `app.close()` asks Electron to quit gracefully (the
 *  path CI runners take, which also lets Chromium flush its localStorage to disk); if
 *  the process ignores the graceful signal and lingers, force-kill the WHOLE Electron
 *  process tree — killing only the main process leaves renderer/GPU helpers alive,
 *  which keep Playwright's connection open and hang its worker-teardown disposal. Every
 *  test asserts its saved state BEFORE teardown, so a forced kill never loses a proof. */
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
    for (const p of [...descendantPids(pid), pid]) {
      try {
        process.kill(p, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
  }
  // Let Playwright settle its own close bookkeeping now that the process is gone.
  await Promise.race([closed, new Promise((r) => setTimeout(r, 3000))]);
}

/** Build a Tour One save blob offline (the sanctioned fixture allowance). */
function buildSaveFixture(
  seed: number,
  opts: { day?: number; credits?: number; mutate?: (s: GameState) => void } = {},
): string {
  const base = createInitialState(seed);
  if (opts.day !== undefined) base.day = opts.day;
  if (opts.credits !== undefined) base.player.credits = opts.credits;
  const dawn = startDay(base).state;
  opts.mutate?.(dawn);
  return createSave(dawn, seed);
}

test('packaged shell runs Tour One and autosaves into the OS app-data dir', async () => {
  assertBuilt();
  const userData = makeUserDataDir();
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // --- Acceptance #1 · the packaged shell boots and RUNS Tour One -----------
    // A fresh install (empty userData) opens a fresh Tour One career on Day 1.
    await expect(page.getByRole('heading', { name: 'Spacer Quest' })).toBeVisible();
    await expect(page.getByTestId('day')).toHaveText('1');
    await expect(page.getByTestId('debt-chip')).toContainText('25,000');
    await expect(page.getByTestId('die')).toHaveCount(5);

    // Play through the real cockpit: sign the first contract (die → contract), then
    // close out the day. Both mutate the career and trigger an autosave.
    await expect(page.getByTestId('active-contract-empty')).toBeVisible();
    await page.getByTestId('die').first().click();
    await page.getByTestId('contract').first().click();
    await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);

    await page.getByTestId('end-day').click();
    await expect(page.getByTestId('day')).toHaveText('2');

    // --- Acceptance #2 · the save landed in the OS app-data dir ----------------
    // The store flush is debounced (~150ms); poll for the file, then assert the
    // autosave key is in it — NOT in browser localStorage.
    const storeFile = storeFileFor(userData);
    await expect.poll(() => fs.existsSync(storeFile), { timeout: 5000 }).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(storeFile, 'utf8')) as Record<string, string>;
    expect(parsed['sq.save.v1']).toBeTruthy();
    // And the renderer really used the native store, not localStorage.
    const usedNative = await page.evaluate(
      () => (window as unknown as { sqNative?: unknown }).sqNative !== undefined,
    );
    expect(usedNative).toBe(true);
    const localCopy = await page.evaluate(() => window.localStorage.getItem('sq.save.v1'));
    expect(localCopy).toBeNull();
  } finally {
    await closeApp(app);
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('first launch migrates an existing localStorage career into the app-data store', async () => {
  assertBuilt();
  const userData = makeUserDataDir();

  // A distinctive mid-tour career the web build would have left in localStorage.
  const fixture = buildSaveFixture(4242, { day: 12, credits: 12000 });

  // --- Launch 1 · seed the Chromium localStorage, as an old web save would sit --
  const app1 = await launch(userData);
  try {
    const page1 = await app1.firstWindow();
    await expect(page1.getByTestId('day')).toBeVisible();
    await page1.evaluate((blob) => window.localStorage.setItem('sq.save.v1', blob), fixture);
  } finally {
    await closeApp(app1);
  }

  // Simulate the pre-file-store state: the file store does not yet exist, but the
  // Chromium localStorage (in the same userData profile) still holds the career.
  fs.rmSync(storeFileFor(userData), { force: true });

  // --- Launch 2 · the shell must migrate the localStorage save into the file store
  const app2 = await launch(userData);
  try {
    const page2 = await app2.firstWindow();
    await page2.emulateMedia({ reducedMotion: 'reduce' });

    // The migrated career loaded (day 12, not a fresh day-1 career).
    await expect(page2.getByTestId('day')).toHaveText('12');
    await expect(page2.getByTestId('credits')).toHaveText('12,000');

    // And the migration wrote the exact save blob into the OS app-data file store.
    const storeFile = storeFileFor(userData);
    await expect.poll(() => fs.existsSync(storeFile), { timeout: 5000 }).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(storeFile, 'utf8')) as Record<string, string>;
    expect(parsed['sq.save.v1']).toBe(fixture);
  } finally {
    await closeApp(app2);
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
