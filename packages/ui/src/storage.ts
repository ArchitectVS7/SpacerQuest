// ---------------------------------------------------------------------------
// T-1701a · THE STORAGE SEAM.
//
// WHY THIS FILE EXISTS. Until this task the cockpit talked to `localStorage`
// directly from ~30 call sites in `store.ts` and `sound.ts`. T-1605c measured
// the consequence: a 1,000-day career serializes to ~10.9 MiB of JSON against
// Chromium's ~5 MB per-origin localStorage quota, so a long career silently
// stops autosaving around day ~420. T-1605c's own Delivered note handed the cure
// to this task ("moving saves off localStorage entirely … is T-1701a"). The cure
// is a desktop shell whose saves are ORDINARY FILES in the OS app-data dir, with
// no quota — and this module is the one seam that lets the same cockpit code
// address either store.
//
// THE CONTRACT, and why it is SYNCHRONOUS. `store.ts` calls `init()` at module
// scope (`let state: CockpitState = init()`), and `sound.ts` builds its mixer
// snapshot at module scope too. An async storage API would mean rewriting the
// store's boot contract and every one of its actions. So the seam is
// deliberately synchronous, exactly like the `localStorage` it replaces: on
// desktop it is backed by `ipcRenderer.sendSync` through the preload bridge,
// which blocks the renderer per call — the SAME blocking profile
// `localStorage.setItem` already had. The win T-1605c measured is the QUOTA, not
// the latency, so a write-behind/debounced bridge is a deliberate NON-GOAL here
// and is named as a candidate follow-up rather than built.
//
// THROWING IS PART OF THE CONTRACT. `localStorage` throws when the store is
// blocked (private mode) or full (QuotaExceededError), and three shipped
// behaviours are built on that: `store.ts readSaveResult`'s
// `recovery: 'storage-unavailable'` (T-1605a), `quarantineAutosave`'s honest
// `preserved: false`, and `CockpitState.saveWriteFailed` (T-1605c). So BOTH
// backends must throw on failure and neither may swallow — the desktop bridge in
// `packages/desktop/src/preload.ts` converts a failed IPC envelope back into a
// thrown Error for exactly this reason. Every existing `try/catch` in `store.ts`
// and `sound.ts` is therefore preserved verbatim.
//
// WEB IS UNAFFECTED BY CONSTRUCTION. When `window.sqDesktop` is absent the seam
// IS `window.localStorage`, same calls, same order, same throws. No behavioural
// change on the web build is possible from this file, which is the acceptance
// criterion "web build unaffected" discharged structurally rather than by
// inspection. `__tests__/storage.test.ts` additionally source-scans
// `packages/ui/src` to forbid any other file from reaching around this seam.
//
// NO SAVE-FORMAT MIGRATION IS OWED. The "migration" this task's title names is a
// STORAGE-MEDIUM migration (localStorage → app-data files) of already-versioned
// save envelopes. No `GameState` field is added, `CURRENT_SAVE_VERSION` does not
// move, and no `MIGRATIONS` entry is owed (standing constraint 3, N/A with the
// reason stated).
//
// ORDERING INVARIANT (load-bearing): the localStorage→app-data migration runs in
// this module's BODY, before `storage` is handed out. `store.ts` and `sound.ts`
// both `import` this module, and ES module evaluation is depth-first, so this
// file's body has finished before either of theirs begins. That is what
// guarantees the first `getItem` a booting cockpit performs already sees the
// migrated career.
// ---------------------------------------------------------------------------

/**
 * The only storage surface the cockpit may use.
 *
 * Modelled on `localStorage` on purpose — it is the surface every existing call
 * site already expects, so swapping onto it is a rename, not a rewrite.
 *
 * READERS: `store.ts` (autosave, save slots, settings, onboarding) and
 * `sound.ts` (the mixer). Nothing else in `packages/ui/src` may touch a store
 * directly; `__tests__/storage.test.ts` asserts that structurally.
 */
export interface KeyValueStore {
  /** @throws when the store itself is unreachable (blocked / unreadable). */
  getItem(key: string): string | null;
  /** @throws when the write fails (quota, blocked, I/O error). */
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Enumerate every key present. Needed only by the migration. */
  keys(): string[];
}

/** Which store the cockpit actually got. READER: `App.tsx`'s Settings "Saves"
 *  row (`data-storage-backend`), and `format.ts`'s storage prose, which must say
 *  "this browser" or "the desktop app" and never guess. */
export type StorageBackend = 'browser' | 'desktop';

/**
 * The bridge the Electron preload exposes on `window`.
 *
 * TWIN: `packages/desktop/src/preload.ts` — the two are kept in sync by hand and
 * BY DESIGN: `packages/ui` must not depend on `@spacerquest/desktop`, not even
 * type-only, or the web build would grow a desktop dependency (asserted by the
 * source scan in `__tests__/storage.test.ts`). `packages/desktop`'s e2e asserts
 * `Object.keys(window.sqDesktop)` equals this exact method list, so drift
 * between the twins fails a test rather than silently breaking saves.
 */
export interface DesktopStorageBridge {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
  /** Absolute path of the OS app-data save directory (for the Settings row). */
  dir(): string;
}

/** The window shape this module reads. Kept minimal so the unit test can hand in
 *  a plain object instead of a DOM. */
export interface StorageWindow {
  localStorage?: Storage;
  sqDesktop?: DesktopStorageBridge;
}

/**
 * Marker written into the DESKTOP store once the one-time localStorage import
 * has completed. Its presence is the whole idempotence check; its value is the
 * JSON list of keys that were copied, so a bug report can say what moved.
 */
export const MIGRATION_MARKER_KEY = 'sq.migrated.from-localstorage.v1';

/** Every cockpit key lives under this prefix — `store.ts`'s nine
 *  (`sq.save.v1`, `sq.save.v1.corrupt`, `sq.save.seed`, `sq.fx`,
 *  `sq.onboarding.v1`, `sq.reduced-motion`, `sq.text-size`, `sq.slot.N.v1`,
 *  `sq.slot.N.meta`) and `sound.ts`'s four (`sq.vol.*`, `sq.audio.muted`). The
 *  migration copies by prefix rather than by an enumerated list so a key added
 *  later cannot be forgotten here. */
const KEY_PREFIX = 'sq.';

/** `localStorage`, wrapped without swallowing anything. Every method reads
 *  `window.localStorage` AT CALL TIME rather than caching the object, so a test
 *  (or a browser extension) that replaces or patches the store is honoured —
 *  `e2e/save-write-failure.spec.ts` induces its quota failure exactly that way. */
function browserStore(win: StorageWindow): KeyValueStore {
  return {
    getItem: (key) => win.localStorage!.getItem(key),
    setItem: (key, value) => {
      win.localStorage!.setItem(key, value);
    },
    removeItem: (key) => {
      win.localStorage!.removeItem(key);
    },
    keys: () => {
      const ls = win.localStorage!;
      const out: string[] = [];
      for (let i = 0; i < ls.length; i += 1) {
        const k = ls.key(i);
        if (k !== null) out.push(k);
      }
      return out;
    },
  };
}

/** The Electron bridge, wrapped. The bridge already throws on failure (see the
 *  header), so there is nothing to translate — this is a pure narrowing from
 *  `DesktopStorageBridge` to `KeyValueStore` (it drops `dir`). */
function desktopStore(bridge: DesktopStorageBridge): KeyValueStore {
  return {
    getItem: (key) => bridge.getItem(key),
    setItem: (key, value) => {
      bridge.setItem(key, value);
    },
    removeItem: (key) => {
      bridge.removeItem(key);
    },
    keys: () => bridge.keys(),
  };
}

/**
 * In-memory fallback. UNREACHABLE IN THE COCKPIT: both the web build and the
 * Electron renderer always have a `window` with a `localStorage`. It exists only
 * so importing this module from a node context (vitest, a future SSR probe)
 * cannot throw at module scope — which would take `store.ts` down with it.
 */
function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    keys: () => [...map.keys()],
  };
}

/**
 * Copy every cockpit key from `source` into `target`, once.
 *
 * Returns the keys actually copied (empty when the migration was already done,
 * was not needed, or could not be completed).
 *
 * SEMANTICS, each one covered by a test in `__tests__/storage.test.ts`:
 *  1. No-op when {@link MIGRATION_MARKER_KEY} is already in the target — even
 *     when nothing was copied on the first pass. The marker is what makes the
 *     import ONE-TIME, and one-time is load-bearing: semantic 3 alone would
 *     re-copy on every boot, which would RESURRECT keys the player deleted on
 *     the desktop side (a deleted save slot coming back from the stale browser
 *     copy is a bug, not a rescue).
 *  2. Copies every `sq.`-prefixed source key and only those.
 *  3. NEVER overwrites a key already present in the target — a desktop career
 *     already in progress beats a stale browser one.
 *  4. COPY, not move. The browser keys are left intact, matching the
 *     `quarantineAutosave` precedent: a player who goes back to the web build
 *     still has their career, and a failed import can be retried by hand.
 *  5. A source that throws (blocked store) aborts WITHOUT writing the marker, so
 *     the next boot retries — and never throws out of module init.
 *  6. A target write that throws aborts the same way, for the same reason.
 *  7. The marker is written LAST, carrying the copied key list as JSON.
 *
 * Exported for the unit test; the cockpit reaches it only through
 * {@link selectStorage}.
 */
export function migrateInto(source: KeyValueStore, target: KeyValueStore): string[] {
  try {
    if (target.getItem(MIGRATION_MARKER_KEY) !== null) return [];
  } catch {
    // The TARGET is unreachable. Nothing can be imported and nothing may be
    // marked done; the next boot tries again.
    return [];
  }

  let sourceKeys: string[];
  try {
    sourceKeys = source.keys();
  } catch {
    return []; // blocked source — retry next boot (semantic 5)
  }

  const copied: string[] = [];
  try {
    for (const key of sourceKeys) {
      if (!key.startsWith(KEY_PREFIX)) continue; // semantic 2
      if (key === MIGRATION_MARKER_KEY) continue; // never import the marker itself
      if (target.getItem(key) !== null) continue; // semantic 3
      const value = source.getItem(key);
      if (value === null) continue; // vanished between enumerate and read
      target.setItem(key, value); // semantic 4: read, write, do not delete
      copied.push(key);
    }
    target.setItem(MIGRATION_MARKER_KEY, JSON.stringify(copied)); // semantic 7
  } catch {
    // Semantics 5/6: a partial import is fine (every copy is idempotent and
    // never overwrites), but the marker must NOT land, so the next boot resumes.
    return [];
  }
  return copied;
}

/** What {@link selectStorage} resolves. Returned as a value (rather than set as
 *  module state) so the unit test can drive it with a fake window. */
export interface SelectedStorage {
  storage: KeyValueStore;
  backend: StorageBackend;
  /** The desktop save directory, for the Settings row. `null` on web, where
   *  there is no path a player could open. */
  saveLocation: string | null;
  /** Keys imported from localStorage on this boot (empty on every later boot). */
  migrated: string[];
}

/**
 * Pick the backing store for this process and, on desktop, perform the one-time
 * localStorage import before handing the store out.
 *
 * TOTAL over any window: a missing `localStorage`, a bridge whose `dir()`
 * throws, and a fully blocked store all resolve to a usable seam rather than a
 * throw, because this runs at module scope where nothing could catch it.
 */
export function selectStorage(win: StorageWindow | null): SelectedStorage {
  const bridge = win?.sqDesktop;
  if (win && bridge) {
    const target = desktopStore(bridge);
    // The import can only run when there is a localStorage to import FROM. In
    // the Electron renderer there always is; the guard is for completeness.
    const migrated = win.localStorage ? migrateInto(browserStore(win), target) : [];
    let saveLocation: string | null = null;
    try {
      saveLocation = bridge.dir();
    } catch {
      // A shell that cannot name its own save dir is still a usable shell; the
      // Settings row falls back to the generic label rather than crashing boot.
      saveLocation = null;
    }
    return { storage: target, backend: 'desktop', saveLocation, migrated };
  }
  if (win?.localStorage) {
    return { storage: browserStore(win), backend: 'browser', saveLocation: null, migrated: [] };
  }
  return { storage: memoryStore(), backend: 'browser', saveLocation: null, migrated: [] };
}

const selected = selectStorage(typeof window === 'undefined' ? null : window);

/** The cockpit's one storage surface. READERS: `store.ts`, `sound.ts`. */
export const storage: KeyValueStore = selected.storage;

/** READER: `App.tsx`'s Settings "Saves" row (`data-storage-backend`) and its two
 *  `format.ts` message calls (`saveRecoveryMessage`, `saveWriteFailedMessage`),
 *  which must name the right container for the failure. Asserted consumed by
 *  `packages/desktop/e2e/shell.spec.ts`. */
export const storageBackend: StorageBackend = selected.backend;

/** READER: `App.tsx`'s Settings "Saves" row — the answer to "where did my saves
 *  go?", and the player-facing reachability of this whole task. Asserted
 *  consumed by `packages/desktop/e2e/shell.spec.ts`. */
export const saveLocation: string | null = selected.saveLocation;
