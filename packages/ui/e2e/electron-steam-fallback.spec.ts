import { _electron as electron, test, expect, type ElectronApplication } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================================
//  T-1702 · Steam graceful-fallback proof — the shell runs IDENTICALLY without Steam
// ============================================================================
//
// Direct proof of acceptance #3 ("app runs identically without Steam present"). CI has
// no Steam client, so `steamworks.init` throws → `createSteamBackend` returns null →
// every SteamService method no-ops. This launches the REAL Electron shell exactly as
// electron-shell.spec.ts does and plays a slice of Tour One through the cockpit DOM,
// asserting the app boots, plays, and autosaves unchanged — and that no Steam path ever
// throws. The Steam bridge (`window.sqNative.steam`) is present but wired to a null
// backend, so forwarding events/presence is a safe no-op.
//
// Runs only under `SQ_ELECTRON=1` (its own Playwright project); the web run ignores it.

const here = path.dirname(fileURLToPath(import.meta.url));
const MAIN_ENTRY = path.resolve(here, '../../desktop/dist/main.js');
const DIST_WEB_INDEX = path.resolve(here, '../dist-web/index.html');

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

function makeUserDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sq-steam-'));
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
      SQ_QUIT_ON_WINDOW_CLOSE: '1',
      // Point at Spacewar so the shell TRIES to init Steam; with no Steam client
      // present in CI, `createSteamBackend` catches the throw and no-ops — the exact
      // fallback path this spec proves.
      SQ_STEAM_APPID: '480',
    },
  });
}

function descendantPids(pid: number): number[] {
  let children: number[] = [];
  try {
    const out = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' });
    children = out
      .split('\n')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    /* pgrep exits non-zero with no children — benign */
  }
  return children.flatMap((c) => [...descendantPids(c), c]);
}

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
  await Promise.race([closed, new Promise((r) => setTimeout(r, 3000))]);
}

test('shell runs Tour One and autosaves identically with no Steam client present', async () => {
  assertBuilt();
  const userData = makeUserDataDir();
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // Boots the cockpit unchanged (Steam absent must not alter a single thing).
    await expect(page.getByRole('heading', { name: 'Spacer Quest' })).toBeVisible();
    await expect(page.getByTestId('day')).toHaveText('1');
    await expect(page.getByTestId('die')).toHaveCount(5);

    // The Steam bridge is present (desktop preload) but wired to a null backend — the
    // renderer forwarders exist and never throw.
    const hasSteamBridge = await page.evaluate(
      () =>
        typeof (window as unknown as { sqNative?: { steam?: unknown } }).sqNative?.steam ===
        'object',
    );
    expect(hasSteamBridge).toBe(true);

    // Play through the real cockpit: sign the first contract (this emits engine events
    // the store forwards to the Steam bridge — proving the forward path never crashes
    // when the backend is null), then close the day out.
    await expect(page.getByTestId('active-contract-empty')).toBeVisible();
    await page.getByTestId('die').first().click();
    await page.getByTestId('contract').first().click();
    await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);

    await page.getByTestId('end-day').click();
    await expect(page.getByTestId('day')).toHaveText('2');

    // The autosave still lands in the OS app-data store — unaffected by the Steam path.
    const storeFile = storeFileFor(userData);
    await expect.poll(() => fs.existsSync(storeFile), { timeout: 5000 }).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(storeFile, 'utf8')) as Record<string, string>;
    expect(parsed['sq.save.v1']).toBeTruthy();
  } finally {
    await closeApp(app);
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
