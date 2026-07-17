// ============================================================================
//  T-1701 · Electron main process — the desktop shell for Spacer Quest Rimward
// ============================================================================
//
// This process owns three things and nothing more (the engine stays pure and the
// UI stays the client of every rule — this file adds NO game logic):
//
//   1. WINDOW MANAGEMENT — one BrowserWindow that loads the SAME renderer the web
//      build ships (`packages/ui/dist-web`). In dev it loads the Vite server via
//      ELECTRON_RENDERER_URL; packaged it loads the bundled `dist-web/index.html`.
//   2. A FILE-BACKED KEY/VALUE STORE — every `sq.*` persistence key the UI writes
//      (autosave, slots, settings, mixer) is mirrored to a JSON file in the OS
//      app-data dir (`app.getPath('userData')/saves/store.json`) instead of the
//      browser's localStorage. The renderer talks to it through the preload's
//      `window.sqNative` bridge (see preload.ts + packages/ui/src/storage.ts).
//   3. AN AUTO-UPDATER STUB — guarded no-op in v1 (no feed configured); real feed
//      + code-signing wiring is a follow-up release task.
//
// The store is SYNCHRONOUSLY seeded at renderer boot: the preload uses
// `ipcRenderer.sendSync('sq:load-all')` so `window.sqNative.initialData` is
// populated BEFORE the renderer's `store.ts` runs its module-load `init()` (which
// reads the autosave synchronously). That timing constraint is why the load
// channel is synchronous and the IPC handlers are registered before the window
// loads.

import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---- custom renderer protocol ---------------------------------------------
// The renderer is Vite's ES-module bundle. Chromium refuses to load `<script
// type="module">` over `file://` (module scripts demand a real, non-"null" origin),
// so a plain `loadFile` yields a blank window. We serve the SAME dist-web bundle
// through a privileged `app://` scheme instead — a proper secure origin where module
// scripts, relative asset URLs and the localStorage the migration reads all work. The
// scheme must be registered before `app` is ready, hence this top-level call.
const APP_SCHEME = 'app';
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

// ---- userData override (tests / portable installs) ------------------------
// A dedicated env override so an e2e run can point the whole shell at a throwaway
// userData dir and assert saves land there. Set BEFORE `app` is ready so
// `app.getPath('userData')` resolves to it everywhere below.
const userDataOverride = process.env.SQ_USER_DATA_DIR;
if (userDataOverride) {
  app.setPath('userData', userDataOverride);
}

// ---- file-backed key/value store ------------------------------------------

/** In-memory mirror of `store.json`, loaded once at startup and flushed on write. */
let store: Record<string, string> = {};
/** Whether `store.json` already existed at startup — the renderer uses this to
 *  decide whether to run the one-time localStorage → file-store migration. */
let storeFileExisted = false;

function saveDir(): string {
  return path.join(app.getPath('userData'), 'saves');
}
function storeFile(): string {
  return path.join(saveDir(), 'store.json');
}

/** Synchronously load the store from disk. A missing/unreadable/corrupt file is
 *  benign — a fresh install — and leaves `storeFileExisted = false`, which arms
 *  the renderer's localStorage import path. */
function loadStore(): void {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    store = parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
    storeFileExisted = true;
  } catch {
    store = {};
    storeFileExisted = false;
  }
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Atomically write the store to disk (temp file + rename) so a crash mid-write
 *  never leaves a truncated JSON blob. */
function flushStore(): void {
  try {
    fs.mkdirSync(saveDir(), { recursive: true });
    const tmp = storeFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, storeFile());
  } catch (err) {
    console.error('sq: store flush failed', err);
  }
}

/** Debounce writes (~150ms) so a burst of setItem calls in one action coalesces
 *  into a single disk write. */
function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushStore();
  }, 150);
}

function registerIpc(): void {
  // SYNCHRONOUS load channel — the preload calls this via `sendSync` before the
  // renderer's own scripts run, so the seed is ready for store.ts's module-load init.
  ipcMain.on('sq:load-all', (event) => {
    event.returnValue = { data: store, fileExisted: storeFileExisted };
  });
  ipcMain.on('sq:write', (_event, key: string, value: string) => {
    store[key] = value;
    scheduleFlush();
  });
  ipcMain.on('sq:remove', (_event, key: string) => {
    delete store[key];
    scheduleFlush();
  });
}

// ---- renderer resolution --------------------------------------------------

/** The dist-web root on disk. Packaged: copied into app resources by electron-builder
 *  (`extraResources`). Dev/unpackaged (electron . / the e2e `_electron.launch`):
 *  the ui package's built bundle, relative to this file (packages/desktop/dist). */
function rendererRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'dist-web');
  }
  // __dirname === packages/desktop/dist → ../../ui/dist-web
  return path.join(__dirname, '..', '..', 'ui', 'dist-web');
}

/** Minimal extension → MIME map. Module scripts require a JS MIME type (Chromium
 *  enforces it strictly), so we set Content-Type explicitly rather than trusting a
 *  generic file fetch. */
function mimeFor(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs'))
    return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.woff2')) return 'font/woff2';
  if (filePath.endsWith('.woff')) return 'font/woff';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.ico')) return 'image/x-icon';
  return 'application/octet-stream';
}

/** Serve a dist-web asset for an `app://` request, resolved safely under the renderer
 *  root (path traversal outside the bundle is refused). */
async function serveRendererAsset(requestUrl: string): Promise<Response> {
  const url = new URL(requestUrl);
  let rel = decodeURIComponent(url.pathname);
  if (!rel || rel === '/') rel = '/index.html';
  const root = rendererRoot();
  const filePath = path.normalize(path.join(root, rel));
  if (!filePath.startsWith(root)) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    const data = await fs.promises.readFile(filePath);
    return new Response(data, { headers: { 'Content-Type': mimeFor(filePath) } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    // Match the CRT dark theme so there is no white flash before the renderer paints.
    backgroundColor: '#0a0e0a',
    autoHideMenuBar: true,
    title: 'Spacer Quest — Rimward',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    // Dev: Vite over http — module scripts load fine from a real http origin.
    void win.loadURL(devUrl);
  } else {
    // Packaged / e2e: the dist-web bundle over the privileged app:// scheme.
    void win.loadURL(`${APP_SCHEME}://bundle/index.html`);
  }
  return win;
}

// ---- auto-updater stub (T-1701) -------------------------------------------
// No update feed is configured in v1, so this is a guarded no-op that only logs
// intent. Real feed URL + code-signing wiring belongs to the release task. The
// try/catch guarantees a missing/misconfigured feed can never crash launch.
function maybeCheckForUpdates(): void {
  if (!app.isPackaged) return; // never in dev / e2e
  try {
    const feed = process.env.SQ_UPDATE_FEED;
    if (feed) {
      autoUpdater.setFeedURL({ provider: 'generic', url: feed });
      void autoUpdater.checkForUpdatesAndNotify();
    } else {
      console.log('sq: auto-update stub — no feed configured (T-1701)');
    }
  } catch (err) {
    console.warn('sq: auto-update stub error (ignored)', err);
  }
}

// ---- lifecycle ------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another instance (for this userData dir) already owns the window — defer to it.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    loadStore();
    registerIpc();
    // Serve the renderer bundle over app:// (unless running against the Vite dev URL).
    if (!process.env.ELECTRON_RENDERER_URL) {
      protocol.handle(APP_SCHEME, (request) => serveRendererAsset(request.url));
    }
    mainWindow = createWindow();
    maybeCheckForUpdates();

    app.on('activate', () => {
      // macOS: re-create a window when the dock icon is clicked and none are open.
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    // Standard macOS convention: apps stay alive with no windows until Cmd+Q. A
    // headless/e2e run sets SQ_QUIT_ON_WINDOW_CLOSE so the harness can tear the
    // process down deterministically (Playwright's `close()` closes the window and
    // waits for the app to exit — on darwin it otherwise lingers and force-kills).
    if (process.platform !== 'darwin' || process.env.SQ_QUIT_ON_WINDOW_CLOSE) app.quit();
  });

  // Never lose the last autosave: flush synchronously on quit (in addition to the
  // debounced per-write flushes).
  app.on('before-quit', () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushStore();
  });
}
