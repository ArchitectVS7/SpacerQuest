// ---------------------------------------------------------------------------
// T-1701a/b · T-1702a · THE SHELL BRIDGE (preload, sandboxed, contextIsolated).
//
// The renderer's ONLY privileged capability. Seven methods, each a round trip to
// `main.ts`'s validated `ipcMain` handlers. Five are storage — `main.ts` is the
// only thing that touches `saveStore.ts`. The sixth, `about`, was added by
// T-1701b: it reports the shell's version, what the updater resolved to and (as
// of T-1702a) what Steam resolved to, so Settings → Build and Settings → Steam
// can say whether this build updates itself and whether achievements are being
// recorded. It is READ-ONLY and touches no store.
//
// THE SEVENTH, `unlockAchievement`, IS THE ONE ASYNCHRONOUS METHOD (T-1702a),
// and the asymmetry is deliberate. Storage is `sendSync` because `store.ts` runs
// `init()` at MODULE SCOPE and has ~25 synchronous call sites (see
// `packages/ui/src/storage.ts`'s header); an achievement has no such constraint,
// and a synchronous native Steam call on every `DeedEarned` would block the
// renderer mid-action for a cosmetic side effect. It is FIRE-AND-FORGET: it
// returns nothing, and it cannot throw into the cockpit — which is the second
// deliberate break from the rule below, for the reason stated there.
//
// TWIN: `packages/ui/src/storage.ts`'s `DesktopStorageBridge`. The two interfaces
// are duplicated ON PURPOSE — `packages/ui` must not depend on
// `@spacerquest/desktop`, not even type-only, or the WEB build acquires a desktop
// dependency (asserted by the source scan in
// `packages/ui/src/__tests__/storage.test.ts`). Drift between the twins is caught
// instead by `e2e/shell.spec.ts`, which asserts `Object.keys(window.sqDesktop)`
// equals this exact method list.
//
// THROWING IS THE CONTRACT — FOR STORAGE. `localStorage` throws when a write
// fails, and three shipped cockpit behaviours are built on that — `recovery:
// 'storage-unavailable'` (T-1605a), `quarantineAutosave`'s honest `preserved`
// flag, and `CockpitState.saveWriteFailed` (T-1605c). So every failed envelope
// from main is rethrown here rather than folded into a `null`. A bridge that
// swallowed would make the desktop build silently lose careers, which is the
// exact class of bug T-1605a/c existed to end.
//
// `unlockAchievement` IS THE ONE EXCEPTION, stated rather than smuggled: no
// cockpit behaviour keys off it, nothing is lost when it fails, and a failed
// achievement must never be able to cost a player their action. It uses
// `ipcRenderer.send`, which has no reply to fail.
//
// CommonJS, not ESM: an Electron preload must be CJS unless `sandbox: false`,
// and trading the sandbox for import syntax is not a trade worth making.
// ---------------------------------------------------------------------------

import { contextBridge, ipcRenderer } from 'electron';

const CHANNELS = {
  get: 'sq-store:get',
  set: 'sq-store:set',
  remove: 'sq-store:remove',
  keys: 'sq-store:keys',
  dir: 'sq-store:dir',
  about: 'sq-shell:about',
  // T-1702a · Fire-and-forget, `send` not `sendSync`. See the header.
  unlockAchievement: 'sq-steam:unlock',
} as const;

type StoreReply<T> = { ok: true; value: T } | { ok: false; error: string };

/** T-1701b/T-1702a · What `about()` answers with. TWIN: `main.ts`'s `ShellAbout`
 *  and the `about` member of `packages/ui/src/storage.ts`'s
 *  `DesktopStorageBridge`. `updates` mirrors `updater.ts`'s `UpdaterState`;
 *  `steam` mirrors `steam.ts`'s `SteamState`. */
interface ShellAbout {
  version: string;
  updates: 'unsupported' | 'inert' | 'armed';
  steam: 'ready' | 'unavailable';
}

function call<T>(channel: string, ...args: unknown[]): T {
  const reply = ipcRenderer.sendSync(channel, ...args) as StoreReply<T> | undefined;
  if (!reply) throw new Error(`Save storage did not answer on ${channel}`);
  if (!reply.ok) throw new Error(`Save storage failed: ${reply.error}`);
  return reply.value;
}

const bridge = {
  getItem: (key: string): string | null => call<string | null>(CHANNELS.get, key),
  setItem: (key: string, value: string): void => {
    call<null>(CHANNELS.set, key, value);
  },
  removeItem: (key: string): void => {
    call<null>(CHANNELS.remove, key);
  },
  keys: (): string[] => call<string[]>(CHANNELS.keys),
  dir: (): string => call<string>(CHANNELS.dir),
  about: (): ShellAbout => call<ShellAbout>(CHANNELS.about),
  // T-1702a · Mirror one Deed (or the Conqueror capstone) onto Steam. No reply,
  // no throw, no return value — see the header for both asymmetries. `main.ts`
  // still validates the SENDER and the payload shape on the far side; an
  // unvalidated `ipcMain.on` is a privileged primitive regardless of how
  // harmless the payload looks.
  unlockAchievement: (apiName: string): void => {
    ipcRenderer.send(CHANNELS.unlockAchievement, apiName);
  },
};

// TEST-ONLY ESCAPE HATCH — the second half of the one in `main.ts`, which
// already declines to load this file when `SQ_STORAGE=web`. Kept here as belt
// and braces, and written defensively because a SANDBOXED preload gets only a
// polyfilled subset of `process` and `env` is not guaranteed to be in it. Either
// half alone is sufficient; neither costs anything.
//
// Both halves live in `packages/desktop` on purpose: the cockpit has no test
// flag anywhere, and its only question stays "does `window.sqDesktop` exist".
const storageMode: string | undefined =
  typeof process === 'undefined' ? undefined : process.env?.SQ_STORAGE;
if (storageMode !== 'web') {
  contextBridge.exposeInMainWorld('sqDesktop', bridge);
}
