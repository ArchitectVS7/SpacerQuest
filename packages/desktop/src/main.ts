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
// T-1701b · WHAT A PACKAGED BUILD NOW DOES. The scope boundary T-1701a held
// (`resolveRendererUrl` refused to guess when `app.isPackaged`, and the window
// showed an error page naming this task) is GONE. A packaged build serves the
// bundled cockpit over the privileged `app://` scheme registered below, and
// resolves an updater status at boot (`updater.ts`) that the player can read in
// Settings → Build.
//
// WHY `app://` AND NOT `file://` — the load-bearing call of T-1701b. Two
// concrete failure modes, both SILENT, neither caught by a dev-mode run:
//
//   1. `packages/ui/vite.config.ts` emits `base: '/'`, so `<script
//      src="/assets/…">` under `file://` resolves against the FILESYSTEM ROOT
//      and the cockpit renders a blank tube. The `file://` fix is `base: './'`
//      — i.e. mutating the WEB build's config to serve the desktop build, the
//      exact coupling T-1701a's "web unaffected by construction" property
//      exists to prevent. Under `app://` (registered `standard: true`) URL
//      parsing is real, `/assets/x.js` resolves against the app origin, and
//      `vite.config.ts` is untouched.
//   2. `file://` is an OPAQUE ORIGIN in Chromium. `packages/ui/src/storage.ts`
//      probes `window.localStorage` at MODULE SCOPE; an opaque origin makes
//      that getter throw `SecurityError`, `selectStorage` throws during module
//      init, and the cockpit never boots — a total, packaging-only failure.
//      (That probe is now also individually hardened, but the origin is the
//      real cure: `secure: true` gives a trustworthy origin, so `localStorage`,
//      `crypto.subtle` and the `AudioContext` behave exactly as they do on
//      `http://localhost:5173`.)
//
// A real origin also keeps `will-navigate`'s same-origin guard MEANINGFUL
// instead of degenerating into "block everything".
// ---------------------------------------------------------------------------

import {
  app,
  autoUpdater,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  shell,
  type IpcMainEvent,
} from 'electron';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSaveStore, type SaveStore } from './saveStore';
import { initUpdater, type UpdaterStatus } from './updater';

/**
 * The product name. Set BEFORE `whenReady`, because `app.getPath('userData')`
 * is derived from it — leave it unset and saves land in a folder called
 * "Electron", shared with every other unbranded Electron app on the machine.
 */
const APP_NAME = 'Rimward';

/** Dev-mode renderer. `packages/ui`'s `vite` dev server and its `vite preview`
 *  both bind port 5173 with `strictPort`, so one constant covers both. */
const DEFAULT_RENDERER_URL = 'http://localhost:5173';

/** T-1701b · The custom scheme the PACKAGED renderer is served over. See the
 *  header for why this is not `file://`. */
const APP_SCHEME = 'app';
/** The packaged renderer's ORIGIN. A real origin (not a path prefix) is what
 *  makes the `will-navigate` check below mean something. */
const APP_ORIGIN = `${APP_SCHEME}://rimward`;
const PACKAGED_RENDERER_URL = `${APP_ORIGIN}/index.html`;
/** The bundled cockpit, relative to the compiled main. `scripts/copy-renderer.mjs`
 *  puts `packages/ui/dist-web` here; inside an asar archive this resolves to
 *  `resources/app.asar/renderer`, which `net.fetch` reads through transparently. */
const RENDERER_DIR = join(__dirname, '..', 'renderer');
/** Served when the request path is the origin root. */
const INDEX_FILE = '/index.html';

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
  // T-1701b · Not a store channel: the shell's own version and updater state,
  // for Settings → Build. Registered on `replyRaw` because it needs no store.
  about: 'sq-shell:about',
} as const;

/** What the `about` channel answers with. TWIN: `preload.ts`'s `ShellAbout` and
 *  `packages/ui/src/storage.ts`'s `DesktopStorageBridge.about`. */
interface ShellAbout {
  version: string;
  updates: UpdaterStatus['state'];
}

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
 * T-1701b · What the updater resolved to on this launch.
 *
 * READER CHAIN (standing constraint 7), end to end: this variable → the
 * {@link CHANNELS.about} IPC channel → `preload.ts`'s `about()` →
 * `packages/ui/src/storage.ts`'s `updateStatus` → `App.tsx`'s `BuildRow`, which
 * is a line the player reads in Settings. Asserted by `e2e/packaged.spec.ts`
 * (`inert` in a real package) and `e2e/shell.spec.ts` (`unsupported` in dev).
 *
 * Seeded `not-started` so a read that somehow beats `whenReady` is honest
 * rather than optimistic.
 */
let updaterStatus: UpdaterStatus = { state: 'unsupported', reason: 'not-started', feed: null };

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
 * T-1701b: a packaged build gets the bundled renderer over `app://` (see the
 * header); a dev build still gets the vite server, and `SQ_RENDERER_URL` lets
 * the e2e point at whatever port Playwright's `webServer` came up on.
 */
function resolveRendererUrl(): string {
  if (app.isPackaged) return PACKAGED_RENDERER_URL;
  return process.env.SQ_RENDERER_URL ?? DEFAULT_RENDERER_URL;
}

/**
 * T-1701b · Serve the bundled cockpit over `app://`.
 *
 * Registered only when packaged: a dev build must keep loading from vite so the
 * hot-reload loop and the desktop e2e both keep working against the SAME
 * artifact the web suite tests.
 */
function registerAppProtocol(): void {
  void protocol.handle(APP_SCHEME, async (request) => {
    let rel: string;
    try {
      rel = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response('bad request', { status: 400 });
    }
    if (rel === '/' || rel === '') rel = INDEX_FILE;

    // PATH-TRAVERSAL GUARD, the same discipline as `saveStore.ts`'s `SAFE_KEY`
    // and for the same reason: the renderer is the surface an attacker reaches
    // first in an Electron app, and this handler is a FILE-READ PRIMITIVE. A
    // request for `app://rimward/../../../etc/passwd` must not become a read.
    const target = normalize(join(RENDERER_DIR, rel));
    if (target !== RENDERER_DIR && !target.startsWith(RENDERER_DIR + sep)) {
      return new Response('forbidden', { status: 403 });
    }

    try {
      // `net.fetch` reads through an asar archive transparently and infers the
      // MIME type, which is the whole reason it is preferred over `readFile`
      // plus a hand-rolled extension table.
      return await net.fetch(pathToFileURL(target).toString());
    } catch {
      // NO SPA FALLBACK, deliberately: the cockpit has no client-side router,
      // so 404 is the honest answer. Rewriting a miss to index.html would make
      // a broken asset path render as a blank tube instead of failing loudly —
      // and `e2e/packaged.spec.ts` probes for exactly that 404.
      return new Response(null, { status: 404 });
    }
  });
}

/** Answer one IPC call, converting any throw into a transport envelope the
 *  bridge can rethrow on the renderer side. Sender-validated: an unvalidated
 *  `ipcMain` handler is a privileged primitive for anything that gets a frame
 *  into the process. */
function replyRaw<T>(event: IpcMainEvent, work: () => T): void {
  if (!trustedContents.has(event.sender.id)) {
    event.returnValue = { ok: false, error: 'untrusted sender' } satisfies StoreReply<never>;
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

/** {@link replyRaw} plus the save-store readiness check every storage channel
 *  needs. Kept separate so the `about` channel — which touches no store — is
 *  answerable before (and independently of) the store existing. */
function reply<T>(event: IpcMainEvent, work: () => T): void {
  if (!saveStore && trustedContents.has(event.sender.id)) {
    event.returnValue = { ok: false, error: 'save store not ready' } satisfies StoreReply<never>;
    return;
  }
  replyRaw(event, work);
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
  // T-1701b · The shell's own identity. `replyRaw`, not `reply`: it needs no
  // save store, and a shell that cannot open its save dir should still be able
  // to tell the player what build it is.
  ipcMain.on(CHANNELS.about, (event) =>
    replyRaw(event, (): ShellAbout => ({
      version: app.getVersion(),
      updates: updaterStatus.state,
    })),
  );
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
  // T-1701b: an ORIGIN comparison, not a prefix test. The packaged renderer URL
  // is a full URL (`app://rimward/index.html`), so `startsWith` would reject
  // every legitimate in-app navigation; origin is the property that actually
  // matters, on both schemes. Anything unparseable is refused.
  win.webContents.on('will-navigate', (event, url) => {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(url).origin === new URL(rendererUrl).origin;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) event.preventDefault();
  });

  void win.loadURL(rendererUrl);
  return win;
}

// ---- boot ------------------------------------------------------------------

// Both of these MUST run before `app.whenReady()`: `getPath('userData')` is
// resolved from the app name, and `setPath` is only honoured pre-ready.
app.setName(APP_NAME);

// T-1701b · MUST run before `app.whenReady()` too — Chromium reads the scheme
// registry once, while it boots. Registered unconditionally (the handler is
// not), because a dev build that registered a different scheme table than the
// packaged one would be testing a different browser.
//
// `standard`: real URL parsing, so vite's `base: '/'` absolute asset paths
//   resolve against the app origin and `vite.config.ts` stays untouched.
// `secure`: a trustworthy origin, so `localStorage`, `crypto.subtle` and the
//   AudioContext behave exactly as on `http://localhost:5173`.
// `supportFetchAPI`/`stream`: the cockpit's own `fetch` and streamed responses.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

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
    // Before the window: the first request the window makes is for the renderer
    // itself, and it goes through this handler.
    if (app.isPackaged) registerAppProtocol();
    mainWindow = createWindow();

    // T-1701b · Resolve (and, only with a feed, arm) the updater. Inert in every
    // build this repo produces — see `updater.ts`'s header for the two
    // independent reasons. `initUpdater` never throws by contract, so this can
    // never take the boot down.
    updaterStatus = initUpdater({
      isPackaged: app.isPackaged,
      platform: process.platform,
      env: process.env,
      autoUpdater,
      log: (message) => console.log(`[updater] ${message}`),
    });

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
