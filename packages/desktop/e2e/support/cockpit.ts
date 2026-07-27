import {
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// T-1701b · Shared driving helpers for the desktop suite.
//
// EXTRACTED (not written new) from `shell.spec.ts`, so the dev-mode spec and the
// PACKAGED spec drive the cockpit through the same clicks and assert the same
// start-of-career markers. If one suite passed and the other did not, the
// difference has to be the BUILD, not the test.
//
// Still DUPLICATED from `packages/ui/e2e/support/career.ts` rather than imported
// across the two Playwright roots — that reasoning is unchanged by this
// extraction (which is entirely within `packages/desktop`): `career.ts` lives
// under a different tsconfig with its own `RunReport` flake instrumentation, and
// importing it here would couple the desktop suite to the web suite's
// bookkeeping. If the cockpit's start-of-career markers ever move, both copies
// fail loudly, which is the behaviour we want.
//
// NOTHING here reaches into the store, the engine or a save file to SET state.
// Files are read only to assert; every mutation is a click. That is the same
// rule `packages/ui/e2e/support/career.ts` states for the web suite.
// ---------------------------------------------------------------------------

/** Temp roots created during a test, torn down by {@link cleanupTempDirs}. */
let scratch: string[] = [];

export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `sq-${prefix}-`));
  scratch.push(dir);
  return dir;
}

/**
 * BEST-EFFORT teardown, on purpose. A Chromium profile directory keeps file
 * handles open for a beat after the process exits, and on Windows that is an
 * EBUSY, not a leak — failing the test on it would turn every green run into a
 * coin flip over an OS detail the product does not care about. The dirs live
 * under `os.tmpdir()` and the OS reclaims them.
 */
export function cleanupTempDirs(): void {
  for (const dir of scratch) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* see above */
    }
  }
  scratch = [];
}

export interface LaunchOpts {
  saveDir: string;
  userDataDir: string;
  /**
   * DEV launch: the compiled `dist/main.js` plus the `vite preview` URL.
   * PACKAGED launch: a built binary that carries its own renderer. Exactly one
   * of the two is given — a packaged app that still needed a renderer URL would
   * not be packaged.
   */
  main?: string;
  executablePath?: string;
  rendererUrl?: string;
  /** `'web'` launches the shell with NO storage bridge, so the cockpit falls
   *  through to `localStorage` exactly as the web build does. Test-only; see
   *  `src/main.ts`'s `webPreferences.preload`. */
  storage?: 'web';
  /**
   * T-1702a · The Steam dev sandbox. `480` is Spacewar, Valve's public test app.
   * Omitted, there is NO app id at all and the shell resolves `unavailable` —
   * which is the state every build this repo produces ships in, and the state
   * the two T-1701a tests exercise unchanged.
   */
  steamAppId?: number;
  /**
   * T-1702a · Path to a JSONL file the shell's RECORDING Steam client appends
   * every `activate` to. Test-only, refused outright when the build is packaged
   * (`src/steam.ts`'s `resolveFakeLogPath`), and the reason it lives in
   * `packages/desktop`: the cockpit carries no test flag anywhere.
   */
  steamFakeLog?: string;
}

/** T-1702a · Every achievement the shell's recording client was asked to
 *  activate, in order. Reads the far side of the REAL IPC bridge in the REAL
 *  Electron main process — nothing here reaches into the store or the engine. */
export function steamLog(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => (JSON.parse(line) as { achievement: string }).achievement);
}

export async function launch(opts: LaunchOpts): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    // `--no-sandbox`: GitHub's ubuntu containers cannot use Chromium's setuid
    // sandbox. It is a launch flag, not a product setting — `main.ts` still sets
    // `contextIsolation`, `nodeIntegration: false` and `sandbox: true` on the
    // window, and those are what keep the renderer unprivileged.
    args: opts.main ? ['--no-sandbox', opts.main] : ['--no-sandbox'],
    ...(opts.executablePath ? { executablePath: opts.executablePath } : {}),
    env: {
      ...process.env,
      SQ_SAVE_DIR: opts.saveDir,
      SQ_USER_DATA_DIR: opts.userDataDir,
      ...(opts.rendererUrl ? { SQ_RENDERER_URL: opts.rendererUrl } : {}),
      ...(opts.storage ? { SQ_STORAGE: opts.storage } : {}),
      // T-1702a · Both absent by default, so every pre-existing launch in this
      // suite still runs with NO Steam — which is what keeps the two T-1701a
      // tests honest evidence for "the app runs identically without Steam".
      ...(opts.steamAppId ? { SQ_STEAM_APP_ID: String(opts.steamAppId) } : {}),
      ...(opts.steamFakeLog ? { SQ_STEAM_FAKE: opts.steamFakeLog } : {}),
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

// ---- player-level driving (no store, no engine, no save file) ---------------

/**
 * Tour One, start of career — the same four assertions
 * `packages/ui/e2e/support/career.ts`'s `startCareer` makes, minus its
 * `page.goto('/')` (the Electron window is already showing the cockpit).
 */
export async function startCareer(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();

  await expect(page.getByTestId('day')).toHaveText('1');
  await expect(page.getByTestId('debt-chip')).toContainText('25,000');
  await expect(page.getByTestId('campaign-era')).toHaveText('Frontier Era');
  await expect(page.getByTestId('hand')).toBeVisible();
}

/** A die-free mutating action: pay down the guild debt. Every mutating action
 *  autosaves, so any would do; this one needs no die and no RNG-sensitive
 *  targeting, which keeps the spec robust to balance changes. */
export async function payDebt(page: Page, amount: number): Promise<void> {
  await page.getByTestId('debt-amount').fill(String(amount));
  await page.getByTestId('pay-debt').click();
}

export async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
}

export async function closeSettings(page: Page): Promise<void> {
  await page.getByTestId('settings-toggle').click();
  await expect(page.getByTestId('settings-panel')).toHaveCount(0);
}

/** Everything the bezel shows that a save has to restore. */
export async function bezel(page: Page): Promise<{ day: string; credits: string; seed: string }> {
  return {
    day: await page.getByTestId('day').innerText(),
    credits: await page.getByTestId('credits').innerText(),
    seed: await page.getByTestId('seed').innerText(),
  };
}
