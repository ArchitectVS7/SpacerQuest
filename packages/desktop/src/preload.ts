// ---------------------------------------------------------------------------
// T-1701a/b · THE SHELL BRIDGE (preload, sandboxed, contextIsolated).
//
// The renderer's ONLY privileged capability. Six methods, each a synchronous
// round trip to `main.ts`'s validated `ipcMain` handlers. Five are storage —
// `main.ts` is the only thing that touches `saveStore.ts`. The sixth, `about`,
// was added by T-1701b: it reports the shell's version and what the updater
// resolved to, so Settings → Build can say whether this build updates itself.
// It is READ-ONLY and touches no store.
//
// TWIN: `packages/ui/src/storage.ts`'s `DesktopStorageBridge`. The two interfaces
// are duplicated ON PURPOSE — `packages/ui` must not depend on
// `@spacerquest/desktop`, not even type-only, or the WEB build acquires a desktop
// dependency (asserted by the source scan in
// `packages/ui/src/__tests__/storage.test.ts`). Drift between the twins is caught
// instead by `e2e/shell.spec.ts`, which asserts `Object.keys(window.sqDesktop)`
// equals this exact method list.
//
// THROWING IS THE CONTRACT. `localStorage` throws when a write fails, and three
// shipped cockpit behaviours are built on that — `recovery:
// 'storage-unavailable'` (T-1605a), `quarantineAutosave`'s honest `preserved`
// flag, and `CockpitState.saveWriteFailed` (T-1605c). So every failed envelope
// from main is rethrown here rather than folded into a `null`. A bridge that
// swallowed would make the desktop build silently lose careers, which is the
// exact class of bug T-1605a/c existed to end.
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
} as const;

type StoreReply<T> = { ok: true; value: T } | { ok: false; error: string };

/** T-1701b · What `about()` answers with. TWIN: `main.ts`'s `ShellAbout` and the
 *  `about` member of `packages/ui/src/storage.ts`'s `DesktopStorageBridge`.
 *  `updates` mirrors `updater.ts`'s `UpdaterState`. */
interface ShellAbout {
  version: string;
  updates: 'unsupported' | 'inert' | 'armed';
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
