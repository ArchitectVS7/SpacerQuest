// ---------------------------------------------------------------------------
// T-1701a · THE ELECTRON MAIN PROCESS.
//
// WHY ELECTRON, AND WHY NOW. TECH-STACK §3 commits to "a desktop shell build
// target" from the start, and the Deferred table's lean is Electron over Tauri —
// "uniform Chromium protects the CRT aesthetic; Tauri's per-machine webviews
// risk it". The cockpit IS a CRT simulation (scanlines, bloom, phosphor decay in
// `theme.css`), so a per-machine webview is a per-machine aesthetic, which is
// not a trade this project can make. That decision is taken here, unchanged.
//
// PACKAGE SHAPE. `packages/desktop/` is an ADDITION to the four packages listed
// in TECH-STACK §4 (`engine/ ui/ content/ sim/`), not a divergence from a
// number; §4's code block is updated in the same commit to name it. There is no
// PRD divergence to document: `docs/PRD-REIMAGINED.md` says nothing about
// desktop shells, Electron or save files — the PRD is about the experience, and
// the experience here is unchanged.
//
// THIS PACKAGE CONTAINS ZERO GAME RULES. It is a window and a file store. It has
// no workspace dependencies — it cannot import the engine, the content tables or
// the cockpit, and `tsconfig.json` has no `references` to make that structural.
// Every rule still lives in `packages/engine`, still pure, still headless; the
// shell is a client of the cockpit in exactly the way the cockpit is a client of
// the engine.
//
// SCOPE BOUNDARY, HELD EXPLICITLY. Packaging, `file://` loading and the
// auto-updater are T-1701b. Rather than half-ship a `file://` path that would
// silently fail, `resolveRendererUrl` refuses to guess when `app.isPackaged` and
// shows an error page that names T-1701b. An honest dead end beats a broken
// build that looks alive.
// ---------------------------------------------------------------------------

import { app, BrowserWindow, ipcMain, shell, type IpcMainEvent } from 'electron';
import { join } from 'node:path';
import { createSaveStore, type SaveStore } from './saveStore';

/**
 * The product name. Set BEFORE `whenReady`, because `app.getPath('userData')`
 * is derived from it — leave it unset and saves land in a folder called
 * "Electron", shared with every other unbranded Electron app on the machine.
 */
const APP_NAME = 'Rimward';

/** Dev-mode renderer. `packages/ui`'s `vite` dev server and its `vite preview`
 *  both bind port 5173 with `strictPort`, so one constant covers both. */
const DEFAULT_RENDERER_URL = 'http://localhost:5173';

const WINDOW = {
  width: 1280,
  height: 800,
  // The cockpit's instrument grid stops being readable below this; a smaller
  // window would clip the bezel rather than reflow it.
  minWidth: 1024,
  minHeight: 640,
} as const;

/** The IPC channels the preload bridge calls. One per `KeyValueStore` method,
 *  plus `dir` for the Settings row. Named as a const so `main` and `preload`
 *  cannot drift apart silently. */
const CHANNELS = {
  get: 'sq-store:get',
  set: 'sq-store:set',
  remove: 'sq-store:remove',
  keys: 'sq-store:keys',
  dir: 'sq-store:dir',
} as const;

/**
 * The reply shape for every channel. The bridge turns `{ ok: false }` back into
 * a THROWN error in the renderer, which is what preserves `localStorage`'s
 * throwing contract and keeps `store.ts`'s `saveWriteFailed` / `recovery`
 * honest (see `packages/ui/src/storage.ts`'s header).
 */
type StoreReply<T> = { ok: true; value: T } | { ok: false; error: string };

/** Every webContents we created and will therefore answer storage IPC for. A
 *  renderer is the surface an attacker reaches first in an Electron app; an
 *  unvalidated `ipcMain` handler is a file-write primitive for anything that
 *  gets a frame into the process. */
const trustedContents = new Set<number>();

let saveStore: SaveStore | null = null;
let mainWindow: BrowserWindow | null = null;

/**
 * Where saves live.
 *
 * `app.getPath('userData')` IS the OS app-data directory —
 * `%APPDATA%\Rimward` on Windows, `~/Library/Application Support/Rimward` on
 * macOS, `~/.config/Rimward` on Linux — which is the "saves land in OS app-data"
 * acceptance criterion. `SQ_SAVE_DIR` overrides it for tests only; there is no
 * player-facing setting, because a save location a player can move is a support
 * burden this task's Accept does not ask for.
 */
function resolveSaveDir(): string {
  return process.env.SQ_SAVE_DIR ?? join(app.getPath('userData'), 'saves');
}

/**
 * Where the cockpit is served from.
 *
 * Returns `null` when packaged — see the header. `SQ_RENDERER_URL` lets the e2e
 * point at whatever port Playwright's `webServer` came up on.
 */
function resolveRendererUrl(): string | null {
  if (app.isPackaged) return null;
  return process.env.SQ_RENDERER_URL ?? DEFAULT_RENDERER_URL;
}

/** The honest dead end for a packaged build. Inline so it needs no asset, which
 *  a packaged build is precisely what does not have yet. */
function packagedPlaceholder(): string {
  const body = `<!doctype html><html><head><meta charset="utf-8"><title>${APP_NAME}</title></head>
<body style="background:#0b0906;color:#ffb000;font:14px ui-monospace,monospace;padding:48px">
<h1 style="font-size:16px;letter-spacing:.16em">RIMWARD — SHELL ONLY</h1>
<p>This build has the desktop shell (T-1701a) but not the packaged renderer.</p>
<p>Packaging and the updater are <strong>T-1701b</strong>.</p>
<p>To run the shell in dev mode: start the cockpit with
<code>npm run dev -w @spacerquest/ui</code>, then
<code>npm run dev -w @spacerquest/desktop</code>.</p>
</body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(body)}`;
}

/** Answer one synchronous storage call, converting any throw into a transport
 *  envelope the bridge can rethrow on the renderer side. */
function reply<T>(event: IpcMainEvent, work: () => T): void {
  if (!trustedContents.has(event.sender.id)) {
    event.returnValue = { ok: false, error: 'untrusted sender' } satisfies StoreReply<never>;
    return;
  }
  const store = saveStore;
  if (!store) {
    event.returnValue = { ok: false, error: 'save store not ready' } satisfies StoreReply<never>;
    return;
  }
  try {
    event.returnValue = { ok: true, value: work() } satisfies StoreReply<T>;
  } catch (err) {
    event.returnValue = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies StoreReply<never>;
  }
}

/**
 * SYNCHRONOUS IPC, deliberately. `ipcRenderer.sendSync` blocks the renderer for
 * the round trip, and `store.ts` autosaves after EVERY action — but that is the
 * same blocking profile `localStorage.setItem` already had, and the win T-1605c
 * measured is the QUOTA, not the latency. Going async would mean rewriting
 * `store.ts`'s module-scope `init()` and all ~25 call sites. A write-behind or
 * debounced bridge is a named candidate follow-up, not this task's job.
 */
function registerStorageIpc(): void {
  ipcMain.on(CHANNELS.get, (event, key: string) => reply(event, () => saveStore!.getItem(key)));
  ipcMain.on(CHANNELS.set, (event, key: string, value: string) =>
    reply(event, () => {
      saveStore!.setItem(key, value);
      return null;
    }),
  );
  ipcMain.on(CHANNELS.remove, (event, key: string) =>
    reply(event, () => {
      saveStore!.removeItem(key);
      return null;
    }),
  );
  ipcMain.on(CHANNELS.keys, (event) => reply(event, () => saveStore!.keys()));
  ipcMain.on(CHANNELS.dir, (event) => reply(event, () => saveStore!.dir));
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: WINDOW.width,
    height: WINDOW.height,
    minWidth: WINDOW.minWidth,
    minHeight: WINDOW.minHeight,
    title: APP_NAME,
    // The tube is black. A default-white background flashes white for the frame
    // before the first paint, which on a CRT simulation reads as a fault — and
    // the CRT aesthetic is the stated reason Electron was chosen at all.
    backgroundColor: '#0b0906',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      // TEST-ONLY: `SQ_STORAGE=web` launches the shell with NO bridge, so the
      // cockpit falls through to `localStorage` exactly as the web build does.
      // `e2e/shell.spec.ts` needs one such launch to produce a GENUINE
      // localStorage career by real play before it can prove the import works.
      // The switch lives here (and in the preload, belt and braces) rather than
      // in `packages/ui`, so the cockpit has no test flag anywhere: its only
      // question stays "does `window.sqDesktop` exist".
      preload: process.env.SQ_STORAGE === 'web' ? undefined : join(__dirname, 'preload.js'),
      // The three settings that make the renderer a renderer and nothing more.
      // The cockpit needs no Node: its ONLY privileged capability is the save
      // store, and that goes through one validated, narrow bridge.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // CAPTURE THE ID NOW, not in the `closed` handler. By the time `closed`
  // fires the window's `webContents` has been destroyed, and reading
  // `win.webContents` then THROWS "Object has been destroyed" — from inside an
  // Electron event listener, which aborts the rest of that emit. The observable
  // symptom is that `window-all-closed` never runs, so `app.quit()` is never
  // called and the process LINGERS after the player closes the window (found by
  // `e2e/shell.spec.ts` — closing every window left the process alive).
  const contentsId = win.webContents.id;
  trustedContents.add(contentsId);
  // Paint-then-show: `ready-to-show` fires after the first frame is composited,
  // so the player never sees an empty tube.
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    trustedContents.delete(contentsId);
    if (mainWindow === win) mainWindow = null;
  });

  // A game window is not a browser: nothing may open a second window, and
  // nothing may navigate the cockpit away from its own origin. External links
  // (there are none today) would go to the real browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  const rendererUrl = resolveRendererUrl();
  win.webContents.on('will-navigate', (event, url) => {
    if (rendererUrl === null || !url.startsWith(rendererUrl)) event.preventDefault();
  });

  void (rendererUrl === null ? win.loadURL(packagedPlaceholder()) : win.loadURL(rendererUrl));
  return win;
}

// ---- boot ------------------------------------------------------------------

// Both of these MUST run before `app.whenReady()`: `getPath('userData')` is
// resolved from the app name, and `setPath` is only honoured pre-ready.
app.setName(APP_NAME);
if (process.env.SQ_USER_DATA_DIR) {
  // Test-only. Playwright needs a throwaway Chromium profile per launch so it
  // can produce a genuinely EMPTY localStorage (to prove the career came out of
  // app-data) or a genuinely POPULATED one (to prove the import ran).
  app.setPath('userData', process.env.SQ_USER_DATA_DIR);
}

// ONE instance, because two instances would write the same save directory and
// interleave two careers into one set of files. The second launch hands its
// focus to the first rather than corrupting saves.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  registerStorageIpc();

  void app.whenReady().then(() => {
    saveStore = createSaveStore(resolveSaveDir());
    mainWindow = createWindow();

    // macOS convention: the app stays alive with no windows, and the dock icon
    // reopens one.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
