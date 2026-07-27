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
// THIS PACKAGE CONTAINS ZERO GAME RULES. It is a window, a file store, (as of
// T-1702a) a Steam achievement pipe and (as of T-1702b) a Steam Cloud sync and a
// rich-presence pipe. Neither T-1702b half is a rule either: `cloud.ts` moves
// OPAQUE BYTES under key names this package already owns (`saveStore.ts`'s
// `SAFE_KEY`), and `presence.ts` publishes a STRING and a NUMBER the engine
// already round-trips — the shell has still never heard of a system, a day or a
// Deed, and the prose a player reads is composed in the cockpit. It has no
// workspace dependencies — it
// cannot import the engine, the content tables or the cockpit, and
// `tsconfig.json` has no `references` to make that structural. Every rule still
// lives in `packages/engine`, still pure, still headless; the shell is a client
// of the cockpit in exactly the way the cockpit is a client of the engine. In
// particular the shell has never heard of a Deed: `sq-steam:unlock` carries a
// STRING, and the deed → achievement mapping lives in `packages/ui/src/steam.ts`.
//
// T-1702a AMENDS ONE STANDING CLAIM. T-1701a/b said "zero runtime dependencies";
// that is no longer true and is corrected rather than left to rot. The package
// now has ZERO WORKSPACE DEPENDENCIES and exactly ONE OPTIONAL NATIVE DEPENDENCY
// (`steamworks.js`, under `optionalDependencies`) whose ABSENCE IS A SUPPORTED,
// TESTED STATE. See `steam.ts`'s header.
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
import { existsSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSaveStore, type SaveStore } from './saveStore';
import { initUpdater, type UpdaterStatus } from './updater';
import {
  createRecordingClient,
  initSteam,
  resolveFakeCloudDir,
  resolveFakeLogPath,
  type SteamClientLike,
  type SteamHost,
  type SteamSession,
} from './steam';
import { initCloud, type CloudSession } from './cloud';
import { initPresence, type PresenceSession } from './presence';

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
/**
 * The bundled cockpit, relative to the compiled main. `scripts/copy-renderer.mjs`
 * puts `packages/ui/dist-web` here; inside an asar archive this resolves to
 * `resources/app.asar/renderer`, which `net.fetch` reads through transparently.
 *
 * T-1703 · A DEMO PACKAGE STAGES ITS BUNDLE AT `renderer-demo` INSTEAD, and this
 * is a PATH RESOLUTION, NOT AN EDITION CONCEPT — the distinction is deliberate
 * and is the whole reason the shell stays rule-free. THE SHELL MUST NOT LEARN
 * WHAT AN EDITION IS: the cockpit's compiled `BUILD_EDITION` (`packages/ui/src/
 * edition.ts`) is the single source of truth for which edition is running, and
 * `ShellInfo`/`ShellAbout` are deliberately NOT widened with an `edition` field —
 * a second answer to "which edition is this?" is a second answer that can
 * disagree. All this does is serve whichever bundle the packager staged, and only
 * one of the two directories ever exists in a given package (`electron-builder`'s
 * `files` list includes exactly one).
 */
const RENDERER_DIR = existsSync(join(__dirname, '..', 'renderer-demo'))
  ? join(__dirname, '..', 'renderer-demo')
  : join(__dirname, '..', 'renderer');
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
  // for Settings → Build. T-1702a added the Steam state to the same reply.
  // Registered on `replyRaw` because it needs no store.
  about: 'sq-shell:about',
  // T-1702a · Mirror one Deed onto Steam. THE ONLY ASYNCHRONOUS CHANNEL —
  // registered with `ipcMain.on` and NO `event.returnValue`, unlike every
  // storage channel. See `registerSteamIpc` for why.
  unlockAchievement: 'sq-steam:unlock',
  // T-1702b · Publish the player's current system/day as Steam rich presence.
  // THE SECOND ASYNCHRONOUS CHANNEL, on exactly the same terms as the first:
  // nothing in the cockpit reads a result, and a synchronous native call on
  // every state patch would block the renderer for a cosmetic side effect. Still
  // sender-validated and payload-validated — "fire and forget" is a statement
  // about the REPLY, not about trust.
  presence: 'sq-steam:presence',
} as const;

/** What the `about` channel answers with. TWIN: `preload.ts`'s `ShellAbout` and
 *  `packages/ui/src/storage.ts`'s `DesktopStorageBridge.about`. */
interface ShellAbout {
  version: string;
  updates: UpdaterStatus['state'];
  /** T-1702a · Whether achievements are being recorded on this launch. */
  steam: 'ready' | 'unavailable';
  /** T-1702b · Whether saves are syncing to Steam Cloud on this launch. */
  cloud: 'ready' | 'unavailable';
  /**
   * T-1702b · How many saves were pulled DOWN from the cloud on this launch.
   *
   * A COUNT, not the names: a filename list on a Settings row is developer
   * output, and the log already carries the names. It is what makes the RESTORE
   * visible to the player rather than just the connection — the same reason the
   * achievements row shows a tally rather than only "Connected".
   */
  cloudRestored: number;
}

/**
 * T-1702a · A Steam achievement API name, as the renderer is allowed to send it.
 *
 * VALIDATED BEFORE IT REACHES THE NATIVE LAYER, the same discipline as
 * `saveStore.ts`'s `SAFE_KEY` and the `app://` traversal guard, and for the same
 * reason: this string arrives FROM THE RENDERER, which is the surface an
 * attacker reaches first in an Electron app. The shape is exactly what
 * `packages/ui/src/steam.ts` derives (`DEED_…` / `RANK_CONQUEROR`), and Steam's
 * own API names are ASCII identifiers, so nothing legitimate is excluded.
 */
const SAFE_ACHIEVEMENT = /^[A-Z][A-Z0-9_]{0,63}$/;

/**
 * T-1702b · The longest system name the presence channel will accept.
 *
 * Same discipline and same reason as {@link SAFE_ACHIEVEMENT}: this string
 * arrives FROM THE RENDERER and is going to a native library. Steamworks caps a
 * presence value at 256 bytes; the authored system names in `packages/content`
 * are far shorter, so this excludes nothing legitimate. `presence.ts` validates
 * again on its own side — the IPC guard protects the process from a hostile
 * renderer, the module guard protects the native call from every caller.
 */
const MAX_PRESENCE_SYSTEM = 64;

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
 * T-1702a · What Steam resolved to on this launch, and the sink every mirrored
 * achievement goes through.
 *
 * READER CHAIN (standing constraint 7), end to end: `steamSession.status.state`
 * → the {@link CHANNELS.about} IPC channel → `preload.ts`'s `about()` →
 * `packages/ui/src/storage.ts`'s `steamStatus` → `App.tsx`'s `SteamRow`, which
 * is a line the player reads in Settings. Asserted by `e2e/shell.spec.ts` (both
 * `ready` under the recording client and `unavailable` with no app id),
 * `e2e/packaged.spec.ts` (`unavailable` in a real package) and
 * `packages/ui/e2e/settings-saves.spec.ts` (`web` on the browser build).
 *
 * Seeded with an `unavailable` session rather than `null` so a `sq-steam:unlock`
 * that somehow beats `whenReady` is a harmless no-op instead of a crash — the
 * session contract is total on every path (see `steam.ts`).
 */
let steamSession: SteamSession = initSteam({
  isPackaged: true,
  env: {},
  load: () => null,
});

/**
 * T-1702b · What Steam Cloud resolved to on this launch, and the sink every
 * local save write is marked dirty on.
 *
 * READER CHAIN (standing constraint 7), end to end: `cloudSession.status.state`
 * and `.restored.length` → the {@link CHANNELS.about} IPC channel →
 * `preload.ts`'s `about()` → `packages/ui/src/storage.ts`'s `cloudStatus` /
 * `cloudRestored` → `App.tsx`'s Settings "Steam → Cloud saves" row. Asserted by
 * `e2e/shell.spec.ts` (a career restored onto a WIPED save dir reports
 * `1 save restored`, and a populated one reports `0` — the no-clobber half),
 * `e2e/packaged.spec.ts` (`unavailable` in a real package) and
 * `packages/ui/e2e/settings-saves.spec.ts` (`web` on the browser build).
 *
 * Seeded with an `unavailable` session rather than `null` for the same reason
 * `steamSession` is: a `sq-store:set` that somehow beats `whenReady` must be a
 * harmless no-op, not a crash. The session contract is total on every path.
 */
let cloudSession: CloudSession = initCloud({
  client: null,
  readLocal: () => null,
  writeLocal: () => undefined,
  schedule: () => undefined,
});

/**
 * T-1702b · The rich-presence sink for this launch.
 *
 * READER CHAIN (standing constraint 7): `packages/ui/src/store.ts`'s one
 * state-update choke point → `steam.ts`'s `syncPresence` → `storage.ts`'s
 * `setRichPresence` → `preload.ts`'s `setPresence` → the
 * {@link CHANNELS.presence} channel → here → `presence.ts`'s
 * `PresenceSession.set` → Steamworks. Asserted end to end by
 * `e2e/shell.spec.ts`, which reads the far side of the REAL IPC bridge in the
 * REAL main process and watches it move when the player ends a day.
 *
 * Seeded `unavailable` for the same reason as the two sessions above.
 */
let presenceSession: PresenceSession = initPresence({ client: null });

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
      // T-1702b · Mark it for Steam Cloud, and note the two constraints:
      //   (a) AFTER the local write, and only if it did not throw — the cloud
      //       must never hold bytes the local store rejected;
      //   (b) `mark` is O(1) and merely arms a timer. It must NOT upload inline:
      //       this channel is `sendSync` and blocks the renderer, and a
      //       synchronous multi-MiB cloud write on every autosave would put the
      //       T-1605c latency profile straight back. See `cloud.ts`'s
      //       `CLOUD_FLUSH_MS` for the coalescing arithmetic.
      cloudSession.mark(key);
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
      steam: steamSession.status.state,
      cloud: cloudSession.status.state,
      cloudRestored: cloudSession.status.restored.length,
    })),
  );
}

/**
 * T-1702a · THE ACHIEVEMENT CHANNEL.
 *
 * ASYNCHRONOUS, deliberately, and the only channel in this file that is. Every
 * storage channel is `sendSync` because `store.ts` runs `init()` at module scope
 * and has ~25 synchronous call sites (see `packages/ui/src/storage.ts`'s
 * header). An achievement has no such constraint — nothing in the cockpit reads
 * a result — and a synchronous native Steam call on every `DeedEarned` would
 * block the renderer mid-action for a cosmetic side effect. So: `ipcMain.on`
 * with NO `event.returnValue`.
 *
 * STILL SENDER-VALIDATED, and still payload-validated. "Fire and forget" is a
 * statement about the REPLY, not about trust: an unvalidated `ipcMain` handler
 * is a privileged primitive for anything that gets a frame into this process,
 * and the string it carries goes on to a native library. Both guards are silent
 * drops rather than throws, because there is no reply channel to fail on and a
 * throw here would surface as an unhandled main-process error.
 */
function registerSteamIpc(): void {
  ipcMain.on(CHANNELS.unlockAchievement, (event, apiName: unknown) => {
    if (!trustedContents.has(event.sender.id)) return;
    if (typeof apiName !== 'string' || !SAFE_ACHIEVEMENT.test(apiName)) return;
    steamSession.unlock(apiName);
  });

  // T-1702b · THE PRESENCE CHANNEL. The SECOND asynchronous channel, and the
  // reasoning above applies unchanged: nothing in the cockpit reads a result, so
  // there is no reply, and both guards are SILENT DROPS rather than throws
  // because there is no reply channel to fail on. `presence.ts` validates again
  // on its own side — this guard is about the process, that one is about the
  // native call.
  ipcMain.on(CHANNELS.presence, (event, system: unknown, day: unknown) => {
    if (!trustedContents.has(event.sender.id)) return;
    if (typeof system !== 'string' || system.length === 0) return;
    if (system.length > MAX_PRESENCE_SYSTEM) return;
    if (typeof day !== 'number' || !Number.isSafeInteger(day) || day <= 0) return;
    presenceSession.set(system, day);
  });
}

/**
 * T-1702a · THE ONE PLACE THAT MAY `require('steamworks.js')`.
 *
 * Kept out of `steam.ts` on purpose: that module is pure Node with no
 * dependencies so its whole contract is unit-testable with no native binary (the
 * `updater.ts` / `saveStore.ts` discipline). Here the `require` is
 *
 *   * LAZY — inside a function called from `whenReady`, never at module scope,
 *     so a build with the optional dependency skipped still boots normally;
 *   * GUARDED by `initSteam`'s try/catch, which is where "no steamworks.js", "no
 *     native binding for this OS/arch" and "Steam is not running" all land as
 *     the same `unavailable`;
 *   * `require`, not `import` — the module must not be resolved unless it is
 *     actually reached, and this package emits CommonJS anyway (see
 *     `tsconfig.json`).
 *
 * NO CALLBACK PUMP IS INSTALLED HERE, and that is verified rather than assumed:
 * steamworks.js's own `init()` starts a `setInterval(runCallbacks, 1000/30)`
 * internally (see its `index.js`), so adding a second pump would double-drive
 * the callback queue. If a future version stops doing that, the pump belongs on
 * the `ready` path only, with a `will-quit` teardown — a dangling handle is
 * exactly the class of bug T-1701a's `closed`-handler fix caught.
 */
function loadSteamClient(
  isPackaged: boolean,
  env: NodeJS.ProcessEnv,
  appId: number,
): SteamClientLike | null {
  // TEST-ONLY, and refused outright when packaged (see `resolveFakeLogPath` /
  // `resolveFakeCloudDir`). T-1702b: the same recording client now also backs a
  // file-based fake cloud, when — and only when — a directory was named.
  const fakeHost: SteamHost = { isPackaged, env, load: () => null };
  const fakeLog = resolveFakeLogPath(fakeHost);
  if (fakeLog) return createRecordingClient(fakeLog, resolveFakeCloudDir(fakeHost));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const steamworks = require('steamworks.js') as {
    init(appId: number): SteamClientLike;
  };
  return steamworks.init(appId);
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
  registerSteamIpc();

  void app.whenReady().then(() => {
    saveStore = createSaveStore(resolveSaveDir());

    // T-1702a · Resolve Steam BEFORE the window, because the cockpit reads
    // `about()` at MODULE SCOPE (`storage.ts`'s `selectStorage`) — a window
    // created first could ask before the answer existed and would then show
    // "unavailable" for a session that was in fact ready. `initSteam` never
    // throws by contract, so this can never take the boot down; with no app id
    // it does not so much as touch the native binding.
    const steamHost: SteamHost = {
      isPackaged: app.isPackaged,
      env: process.env,
      load: (appId) => loadSteamClient(app.isPackaged, process.env, appId),
      log: (message) => console.log(`[steam] ${message}`),
    };
    steamSession = initSteam(steamHost);

    // T-1702b · THE RESTORE HAPPENS HERE, and the ORDER IS LOAD-BEARING.
    //
    //   saveStore  → must exist first: the restore writes THROUGH it, so the
    //                cloud can never reach the save directory by a second,
    //                unvalidated path (`SAFE_KEY`, atomic write-and-rename).
    //   steamSession → Decision B: `initCloud` and `initPresence` are handed the
    //                SAME client, so both are `unavailable` exactly when Steam
    //                is, through one guarded load and one try/catch.
    //   BEFORE createWindow → `packages/ui/src/storage.ts` resolves at MODULE
    //                SCOPE and `store.ts` calls `init()` at module scope, so a
    //                window created first would read the save directory before
    //                the cloud copy landed and the player would boot into a
    //                FRESH CAREER on a machine their cloud save was sitting in.
    //                This is the same reason `initSteam` already runs here.
    //
    // `initCloud` never throws by contract, so this can never take the boot down.
    cloudSession = initCloud({
      client: steamSession.client?.cloud ?? null,
      readLocal: (name) => saveStore!.getItem(name),
      writeLocal: (name, content) => saveStore!.setItem(name, content),
      schedule: (run, ms) => {
        setTimeout(run, ms);
      },
      log: (message) => console.log(`[cloud] ${message}`),
    });

    // T-1702b · Rich presence. Nothing is published at boot: the cockpit sends
    // the first pair from `store.ts`'s module scope once a career exists, which
    // is the only moment a system and a day are both real.
    presenceSession = initPresence({
      client: steamSession.client?.localplayer ?? null,
      log: (message) => console.log(`[presence] ${message}`),
    });

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

  // T-1702b · THE LAST FLUSH, and the teardown of a presence line that must not
  // outlive the process.
  //
  // Both calls are SYNCHRONOUS and TOTAL by contract, and neither calls
  // `preventDefault()`. That is not incidental: the `window-all-closed →
  // app.quit()` path routes through here, and `e2e/shell.spec.ts`'s
  // window-close-exits-0 assertion is a SHIPPED GUARANTEE — it is the regression
  // guard that caught T-1701a's `closed`-handler bug, where a throw inside an
  // Electron listener aborted the rest of the emit and left the process
  // resident. A quit-time hook that can throw or block is exactly that class of
  // change, so `flush` and `clear` swallow everything (see `cloud.ts` /
  // `presence.ts`).
  app.on('before-quit', () => {
    cloudSession.flush();
    presenceSession.clear();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
