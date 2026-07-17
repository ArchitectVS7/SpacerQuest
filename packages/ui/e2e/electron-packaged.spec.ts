import { _electron as electron, test, expect, type ElectronApplication } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================================
//  T-1701 · Electron shell — PACKAGED-BUILD acceptance proof
// ============================================================================
//
// The sibling `electron-shell.spec.ts` launches the raw `dist/main.js` with the bare
// `electron` binary, so it runs with `app.isPackaged === false` and never exercises
// main.ts's packaged renderer-resolution branch (`process.resourcesPath/dist-web`) —
// the exact code path a real installed app takes to find its renderer. This spec
// closes that gap: it launches the ACTUAL packaged `.app` produced by
// `electron-builder --dir` (via `executablePath`, which makes `app.isPackaged` true)
// and plays Tour One through the real cockpit DOM. This is the proof that a packaged
// Spacer Quest build boots and runs the tour end-to-end.
//
//   1. Packaged app RUNS Tour One      → boots the cockpit from Contents/Resources.
//   2. app.isPackaged is TRUE          → asserts the packaged code path really ran.
//   3. Saves land in the OS app-data   → asserts store.json under the userData dir.
//
// Requires the packaged app to exist first: `npm run package:dir -w @spacerquest/desktop`
// (the desktop CI job runs it before this spec). When no packaged app is present (a
// plain local `--project=electron` run without packaging), the spec skips with guidance
// rather than hard-failing — CI's required package step guarantees it runs there.

const here = path.dirname(fileURLToPath(import.meta.url));
const RELEASE_DIR = path.resolve(here, '../../desktop/release');

/** Locate the packaged macOS app binary under `release/` (arch-agnostic: mac-arm64 or
 *  mac for x64). Returns null when no `--dir` build exists yet. */
function findPackagedBinary(): string | null {
  if (!fs.existsSync(RELEASE_DIR)) return null;
  for (const entry of fs.readdirSync(RELEASE_DIR)) {
    const outDir = path.join(RELEASE_DIR, entry);
    if (!fs.statSync(outDir).isDirectory()) continue;
    const appName = fs.readdirSync(outDir).find((n) => n.endsWith('.app'));
    if (!appName) continue;
    const bin = path.join(outDir, appName, 'Contents', 'MacOS', appName.replace(/\.app$/, ''));
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

function makeUserDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sq-electron-pkg-'));
}

function storeFileFor(userData: string): string {
  return path.join(userData, 'saves', 'store.json');
}

/** Every descendant pid of `pid`, leaves last — so a forced teardown reaps the whole
 *  Electron process tree (renderer + GPU + helpers), not just the main process. */
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

/** Tear the shell down robustly: ask Electron to quit; if it lingers, SIGKILL the
 *  whole process tree. Every test asserts its state BEFORE teardown, so a forced kill
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

test('the electron-builder-packaged app boots Tour One and saves into the OS app-data dir', async () => {
  const binary = findPackagedBinary();
  test.skip(
    binary === null,
    `No packaged app under ${RELEASE_DIR}. Build one first: ` +
      `CSC_IDENTITY_AUTO_DISCOVERY=false npm run package:dir -w @spacerquest/desktop`,
  );

  const userData = makeUserDataDir();
  const app = await electron.launch({
    // Launch the packaged binary directly → app.isPackaged === true, so the renderer
    // resolves from Contents/Resources/dist-web (the packaged-only branch in main.ts).
    executablePath: binary!,
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

    // --- Acceptance #1 · the packaged shell boots and RUNS Tour One -----------
    await expect(page.getByRole('heading', { name: 'Spacer Quest' })).toBeVisible();
    await expect(page.getByTestId('day')).toHaveText('1');
    await expect(page.getByTestId('debt-chip')).toContainText('25,000');
    await expect(page.getByTestId('die')).toHaveCount(5);

    // Play through the real cockpit: sign the first contract, then close the day.
    await expect(page.getByTestId('active-contract-empty')).toBeVisible();
    await page.getByTestId('die').first().click();
    await page.getByTestId('contract').first().click();
    await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);

    await page.getByTestId('end-day').click();
    await expect(page.getByTestId('day')).toHaveText('2');

    // --- Acceptance #2 · the save landed in the OS app-data dir ----------------
    const storeFile = storeFileFor(userData);
    await expect.poll(() => fs.existsSync(storeFile), { timeout: 5000 }).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(storeFile, 'utf8')) as Record<string, string>;
    expect(parsed['sq.save.v1']).toBeTruthy();

    // And the renderer really used the native store, not browser localStorage.
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
