import {
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
  /**
   * T-1702b · Directory the shell's recording Steam client uses as a FAKE STEAM
   * CLOUD — one file per name, so `writeFile`/`readFile` are a genuine round
   * trip through the filesystem and survive a relaunch (which an in-memory stub
   * could not). Test-only, refused outright when packaged (`src/steam.ts`'s
   * `resolveFakeCloudDir`), and ABSENT BY DEFAULT so every pre-existing launch
   * in this suite still runs with no cloud at all — which is what keeps the
   * T-1701a/T-1702a tests honest evidence for "runs identically without Steam".
   */
  steamFakeCloud?: string;
  /**
   * T-141 · Directory the shell writes opt-in playtest logs into
   * (`docs/PLAYTEST-TELEMETRY_SPEC.md` §4, `SQ_LOG_DIR`). Test-only, and the
   * sibling of {@link LaunchOpts.saveDir} — in a real install it is `logs/`
   * beside `saves/` under `userData`.
   *
   * ABSENT BY DEFAULT, like the Steam options above and for the same reason: a
   * launch that does not ask for it must behave exactly as every pre-existing
   * launch in this suite does. Even when it IS set, nothing is written unless
   * the player turns the toggle on in Settings — that is the property the test
   * that uses this exists to prove.
   */
  logDir?: string;
}

/** One line of the shell's recording client log. Achievements and presence share
 *  the file, so one read is the whole record of what crossed into the main
 *  process. */
interface SteamLogLine {
  achievement?: string;
  presence?: { key: string; value: string | null };
}

function logLines(path: string): SteamLogLine[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SteamLogLine);
}

/** T-1702a · Every achievement the shell's recording client was asked to
 *  activate, in order. Reads the far side of the REAL IPC bridge in the REAL
 *  Electron main process — nothing here reaches into the store or the engine.
 *  T-1702b: filtered to the achievement lines, because presence now shares the
 *  same log. */
export function steamLog(path: string): string[] {
  return logLines(path)
    .filter((line): line is { achievement: string } => typeof line.achievement === 'string')
    .map((line) => line.achievement);
}

/** T-1702b · Every rich-presence key the shell published, in order. The far side
 *  of the real IPC bridge again — this is what makes the Settings row and the
 *  friends list two independent observations of the same value. */
export function presenceLog(path: string): { key: string; value: string | null }[] {
  return logLines(path)
    .filter((line): line is { presence: { key: string; value: string | null } } => !!line.presence)
    .map((line) => line.presence);
}

/** T-1702b · What the fake Steam Cloud holds, sorted. */
export function cloudFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort();
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
      // T-1702b · Absent by default too, for the same reason.
      ...(opts.steamFakeCloud ? { SQ_STEAM_FAKE_CLOUD: opts.steamFakeCloud } : {}),
      // T-141 · Absent by default too, on the same terms.
      ...(opts.logDir ? { SQ_LOG_DIR: opts.logDir } : {}),
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

/**
 * Wait until the shell's window has actually been SHOWN, and answer whether it
 * was.
 *
 * `src/main.ts` creates the window with `show: false` and calls `win.show()` from
 * `ready-to-show` — which fires after the first frame is COMPOSITED. `launch()`
 * awaits `domcontentloaded`, and that is an earlier milestone: the DOM exists,
 * the compositor may not have produced a frame yet. Sampling `isVisible()` at
 * that moment is therefore a RACE, not an observation — one this suite lost on
 * the headless ubuntu runner (`window-all-closed` xvfb job, 3/3 attempts) while
 * winning it on every developer's mac.
 *
 * POLLING rather than sampling keeps the assertion's teeth exactly where they
 * were. The claim under test is "the paint-then-show path ran"; a window that
 * never shows still fails, because this returns `false` and the caller asserts
 * on it. All that changes is that a slow compositor stops reading as a broken
 * one.
 */
export async function windowShown(app: ElectronApplication, timeout = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const visible = await app.evaluate(({ BrowserWindow }) => {
      const [win] = BrowserWindow.getAllWindows();
      return win ? win.isVisible() : false;
    });
    if (visible || Date.now() >= deadline) return visible;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Close every window, then assert the process exited 0 — on the platform's own
 * terms.
 *
 * THE GUARANTEE BEING GUARDED is unchanged and is a shipped one: closing the
 * game must run `before-quit` (which flushes the Steam cloud session and clears
 * presence) and must leave NO resident process. It is the guard that caught
 * T-1701a's `closed`-handler bug, where a throw inside an Electron listener
 * aborted the rest of the emit, `window-all-closed` never ran, and the process
 * lingered after the player closed the game.
 *
 * WHAT WAS WRONG: the guard asserted that path on EVERY platform, and on macOS
 * it cannot hold by design. `src/main.ts` deliberately implements the mac
 * convention — `window-all-closed` quits only when `process.platform !==
 * 'darwin'`, and an `activate` handler reopens the window from the dock. So on a
 * mac the closed-windows app is SUPPOSED to stay resident, the `exit` event
 * never came, and the test sat there until Playwright's 180s timeout. Three
 * tests encoded that assumption (both here and in `packaged.spec.ts`), which is
 * why a mac was the only place the desktop suite could not go green.
 *
 * WHAT THIS DOES INSTEAD: asserts the same guarantee through each platform's
 * real quit gesture. Everywhere, `window-all-closed` must FIRE (that is the
 * regression guard's actual content, and it is now asserted on mac explicitly
 * rather than inferred from an exit that never comes). On mac the app must then
 * still be alive — the shipped convention, worth asserting rather than merely
 * tolerating — and Cmd-Q (`app.quit()`) must take it down through `before-quit`.
 * Everywhere else, closing the last window must do that by itself. Both paths
 * end on the same `expect(exit).toBe(0)`.
 */
export async function expectQuitsCleanly(app: ElectronApplication): Promise<void> {
  const isMac = process.platform === 'darwin';
  const exited = new Promise<number | null>((resolve) =>
    app.process().once('exit', (code) => resolve(code)),
  );

  // Armed BEFORE the close, and additive: `main.ts` keeps its own listener and
  // runs first (this one is appended). On the platforms that quit from it, the
  // emit is synchronous and `app.quit()` is not, so the flag is still set.
  await app.evaluate(({ app: electronApp }) => {
    const flags = globalThis as { __sqWindowAllClosed?: boolean };
    flags.__sqWindowAllClosed = false;
    electronApp.once('window-all-closed', () => {
      flags.__sqWindowAllClosed = true;
    });
  });

  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) w.close();
  });

  if (isMac) {
    // The app is still alive here, so it can still be asked — which is the whole
    // reason this branch can assert the event directly.
    await expect
      .poll(
        () =>
          app.evaluate(
            () => (globalThis as { __sqWindowAllClosed?: boolean }).__sqWindowAllClosed ?? false,
          ),
        { timeout: 10_000 },
      )
      .toBe(true);
    // No window, and STILL RUNNING: the mac convention, asserted.
    expect(app.process().exitCode).toBeNull();
    // Cmd-Q. Routes through `before-quit` exactly as the window-close path does
    // on the other platforms, so the flush/clear guarantee is proved here too.
    //
    // DEFERRED A TICK, deliberately: quitting inside the call can tear the
    // inspector connection down underneath this evaluate's own reply, which
    // surfaces as a "Target closed" rejection instead of the clean exit the next
    // line is waiting for. Scheduling it lets the call return first. The
    // window-close path on the other platforms has the same shape and has always
    // relied on `close()` being the last thing in its callback.
    await app.evaluate(({ app: electronApp }) => {
      setTimeout(() => electronApp.quit(), 0);
    });
  }

  expect(await exited).toBe(0);
}

// ---- player-level driving (no store, no engine, no save file) ---------------

/**
 * T-187 · RETIRE THE FIRST-TURN WALKTHROUGH, THROUGH ITS OWN CONTROL.
 *
 * WHY THIS EXISTS. T-187 arms a scripted seven-step walkthrough for a genuinely
 * first-time player — no save in storage — and while its rails are up every
 * non-scripted pane carries React's `inert`, so a click into one lands on a dead
 * subtree (Playwright reports it as `<div class="body"> intercepts pointer
 * events`). EVERY launch in this suite is that boot: a fresh `SQ_SAVE_DIR` and a
 * fresh Chromium profile is the definition of a first-time player. T-187 made
 * the same declaration in the web suite (`packages/ui/e2e/support/career.ts`'s
 * `skipFirstTurnWalkthrough`) for all twenty of its specs but left this suite
 * out, which is what turned the desktop battery red: the shell tests are about
 * saves, achievements, cloud and logging, not about the tutorial.
 *
 * WHY IT IS A CLICK RATHER THAN THE WEB SUITE'S STORAGE STAMP. The web helper
 * writes the walkthrough record with `page.addInitScript` before its own
 * `page.goto('/')`. There is no such seam here — Electron's window has already
 * navigated by the time `app.firstWindow()` hands it over, and the desktop
 * backend is a FILE in the save dir, not `localStorage`, so a stamp would mean
 * this suite writing into a save dir it otherwise only ever reads (the header's
 * rule: files are read only to assert; every mutation is a click). Pressing the
 * card's own "Skip tutorial" is the gesture a player who does not want the
 * tutorial makes, so the suite keeps driving the product rather than its state.
 *
 * Tolerant by design and NOT racy: the card renders in the same React pass as
 * the bezel, so once `day` is on screen the walkthrough is either up or was
 * never armed (a launch that loads an existing save — every relaunch in this
 * suite — is by definition not a first-time player's).
 */
export async function skipFirstTurnWalkthrough(page: Page): Promise<void> {
  await expect(page.getByTestId('day')).toBeVisible();
  const card = page.getByTestId('walkthrough');
  if ((await card.count()) === 0) return;
  await page.getByTestId('walkthrough-skip').click();
  await expect(card).toHaveCount(0);
}

/**
 * Tour One, start of career — the same four assertions
 * `packages/ui/e2e/support/career.ts`'s `startCareer` makes, minus its
 * `page.goto('/')` (the Electron window is already showing the cockpit).
 *
 * The walkthrough is retired FIRST, for the reason {@link
 * skipFirstTurnWalkthrough} states: `newGame` re-arms only a record that has
 * never run (`store.ts`), so a skip taken before the roll stays taken through
 * this career and every relaunch of it.
 */
export async function startCareer(page: Page, seed: number): Promise<void> {
  await skipFirstTurnWalkthrough(page);

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

/**
 * T-1702b · Close the day, through the same control a player uses — the driving
 * idiom `packages/ui/e2e/settings-saves.spec.ts` already uses. Lives here rather
 * than inline so the packaged spec could reuse it unchanged.
 *
 * Waits for the day counter to actually move: the dusk resolution can raise a
 * notice, and a helper that returned before the day advanced would make its
 * caller's assertion a race.
 */
export async function endDay(page: Page): Promise<void> {
  const before = await page.getByTestId('day').innerText();
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('day')).not.toHaveText(before);
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
