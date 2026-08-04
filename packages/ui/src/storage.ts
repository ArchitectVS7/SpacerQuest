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
// T-1702a ADDED THE FIRST EXCEPTION, T-1702b THE SECOND AND T-141 THE THIRD, all
// stated rather than smuggled: {@link unlockAchievement}, {@link setRichPresence}
// and {@link appendPlaytestLogLine} SWALLOW.
// None is storage — nothing is persisted THAT THE COCKPIT READS BACK, and no
// cockpit behaviour keys off any of them. The rule above exists because a lost
// SAVE must be visible; a lost achievement (or a stale friends-list line) is
// cosmetic, and letting one throw would let a Steam hiccup cost a player their
// action. The THIRD is the opt-in playtest log line
// (`docs/PLAYTEST-TELEMETRY_SPEC.md` §4): a lost log line is DIAGNOSTIC, a lost
// save is a CAREER, and a diagnostic that can throw into an action is a bug
// generator rather than a bug finder. The in-renderer buffer in
// `playtestLog.ts` still holds the entry either way, so an export loses nothing.
// The asymmetry is the point: everything that can lose a career throws, and the
// three things that cannot, do not. Steam CLOUD is not on this list at all — it is
// performed entirely in the shell's main process, off the storage path, and
// reaches the cockpit only as the read-only {@link cloudStatus} /
// {@link cloudRestored} pair.
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
 * T-1701b · What the desktop shell's updater resolved to on this launch.
 *
 * TWIN of `packages/desktop/src/updater.ts`'s `UpdaterState`, duplicated for
 * the same reason the bridge interface is (see {@link DesktopStorageBridge}):
 * `packages/ui` must never import from `@spacerquest/desktop`.
 *
 * READER: `App.tsx`'s Settings "Build → Updates" row (`data-update-status`) via
 * `format.ts`'s `updateStatusMessage`.
 */
export type UpdateStatus = 'unsupported' | 'inert' | 'armed';

/**
 * T-1702a · Whether Steam is recording this launch's achievements.
 *
 * TWIN of `packages/desktop/src/steam.ts`'s `SteamState`, duplicated for the
 * same reason {@link UpdateStatus} is: `packages/ui` must never import from
 * `@spacerquest/desktop`.
 *
 * Two states, not five: the player-facing question is binary. The five
 * distinguishable CAUSES (`no-app-id` / `not-loaded` / `load-failed` / `init`)
 * stay on the shell side, where a developer reads them in the log.
 *
 * READER: `App.tsx`'s Settings "Steam → Status" row (`data-steam-status`) via
 * `format.ts`'s `steamStatusMessage`.
 */
export type SteamStatus = 'ready' | 'unavailable';

/**
 * T-1702b · Whether this launch's saves are syncing to Steam Cloud.
 *
 * TWIN of `packages/desktop/src/cloud.ts`'s `CloudState`, duplicated for the
 * same stated reason {@link UpdateStatus} and {@link SteamStatus} are:
 * `packages/ui` must NEVER import from `@spacerquest/desktop`, not even
 * type-only, or the web build acquires a desktop dependency — asserted by the
 * source scan in `__tests__/storage.test.ts`, which must not be weakened to make
 * a shared type compile.
 *
 * READER: `App.tsx`'s Settings "Steam → Cloud saves" row (`data-cloud-status`)
 * via `format.ts`'s `cloudStatusMessage`.
 */
export type CloudStatus = 'ready' | 'unavailable';

/** T-1701b/T-1702a/T-1702b · The shell's self-description, as `about()` reports
 *  it. */
export interface ShellInfo {
  version: string;
  updates: UpdateStatus;
  steam: SteamStatus;
  cloud: CloudStatus;
  /** How many saves this launch pulled down from Steam Cloud. A COUNT, not the
   *  names — a filename list on a Settings row is developer output. */
  cloudRestored: number;
}

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
  /** T-1701b/T-1702a · The shell's version, updater state and Steam state (for
   *  the Settings "Build" and "Steam" sections). Read-only; touches no store. */
  about(): ShellInfo;
  /**
   * T-1702a · Mirror one earned Deed onto Steam, by its API name.
   *
   * FIRE AND FORGET — no return value, and it must never throw. This is the ONE
   * deliberate exception to this file's "throwing is the contract" rule (see the
   * header): three shipped behaviours depend on STORAGE throwing, but nothing
   * depends on an achievement, and a failed achievement must never be able to
   * cost a player their action. Backed by `ipcRenderer.send` (asynchronous), not
   * `sendSync`, so a native Steam call cannot block the renderer mid-action.
   *
   * READER of the values sent here: `packages/desktop/src/main.ts`'s
   * `sq-steam:unlock` handler → `steam.ts`'s `SteamSession.unlock`.
   */
  unlockAchievement(apiName: string): void;
  /**
   * T-1702b · Publish the player's current system and day as Steam rich
   * presence.
   *
   * The SECOND deliberate exception to this file's "throwing is the contract"
   * rule, on exactly the terms the {@link DesktopStorageBridge.unlockAchievement}
   * paragraph above states — nothing is persisted, nothing is read back, no
   * cockpit behaviour keys off it, and a friends-list line must never be able to
   * cost a player their action. Also `ipcRenderer.send`, so there is no reply to
   * fail.
   *
   * READER of the values sent here: `packages/desktop/src/main.ts`'s
   * `sq-steam:presence` handler → `presence.ts`'s `PresenceSession.set`.
   */
  setPresence(system: string, day: number): void;
  /**
   * T-141 · Append one JSONL line to this session's opt-in playtest log file.
   *
   * The THIRD deliberate exception to this file's "throwing is the contract"
   * rule, on the terms the header states: a lost log line is diagnostic, a lost
   * save is a career. Also `ipcRenderer.send`, so there is no reply to fail.
   *
   * NOT A STORAGE METHOD, even though it writes a file — nothing is keyed,
   * nothing is read back, and the cockpit never asks the shell what is in the
   * log. It is a SINK, exactly like {@link DesktopStorageBridge.unlockAchievement}.
   *
   * READER of the values sent here: `packages/desktop/src/main.ts`'s
   * `sq-playtest:append` handler → `playtestLog.ts`'s `PlaytestLog.append`.
   */
  appendPlaytestLog(sessionId: string, line: string): void;
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
 *  `sq.slot.N.meta`) and `sound.ts`'s five (`sq.vol.*` — master/sfx/ambient and,
 *  since T-185, `music` — plus `sq.audio.muted`). The
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
  /** T-1701b · What the shell says about itself. `null` on web (and on a shell
   *  whose `about()` call failed) — there is no version a browser tab could
   *  honestly report. */
  shell: ShellInfo | null;
  /**
   * T-1702a · The achievement sink for this process: the shell bridge under
   * Electron, a no-op in a browser tab (where there is no Steam to talk to).
   *
   * Resolved as a VALUE here, like every other field, so the unit test can drive
   * it with a fake window rather than a real bridge.
   */
  unlockAchievement: (apiName: string) => void;
  /**
   * T-1702b · The rich-presence sink for this process: the shell bridge under
   * Electron, a no-op in a browser tab. Resolved as a VALUE here, like every
   * other field, so the unit test can drive it with a fake window.
   */
  setRichPresence: (system: string, day: number) => void;
  /**
   * T-141 · The opt-in playtest log sink for this process: the shell bridge
   * under Electron (which appends to a per-session JSONL file under
   * `userData`, spec §4), a no-op in a browser tab (which has no filesystem, so
   * the log lives only in `playtestLog.ts`'s buffer until the player exports
   * it, spec §4's browser half).
   *
   * Resolved as a VALUE here, like every other field, so the unit test can drive
   * it with a fake window rather than a real bridge.
   */
  appendPlaytestLog: (sessionId: string, line: string) => void;
}

/** The web build's achievement sink. Not a stub awaiting an implementation — a
 *  browser tab has no Steam client, and the Settings row says so in words. */
function noUnlock(): void {
  /* no Steam in a browser tab — see `format.ts`'s `steamStatusMessage(null)` */
}

/** The web build's rich-presence sink. Sibling of {@link noUnlock}, and honest
 *  for the same reason: a browser tab has no Steam client and no friends list to
 *  publish to, and the Settings row says exactly that. */
function noPresence(): void {
  /* no Steam in a browser tab — see `format.ts`'s `presenceMessage(null, …)` */
}

/** T-141 · The web build's playtest-log sink. Sibling of {@link noUnlock} and
 *  {@link noPresence}, and honest for the same reason: a browser tab has no
 *  filesystem to append to. `docs/PLAYTEST-TELEMETRY_SPEC.md` §4 settles that
 *  case explicitly — on the web the log accumulates in memory for the session
 *  and is only ever materialized at export time, which is exactly what
 *  `playtestLog.ts`'s buffer does with or without this sink. */
function noPlaytestLog(): void {
  /* no filesystem in a browser tab — the in-memory buffer is the whole record */
}

/**
 * T-1701b · Read `win.localStorage` WITHOUT letting a throwing getter take
 * module init down.
 *
 * This is not defensive padding. `localStorage` is a getter that THROWS
 * (`SecurityError`) on an opaque origin — which is what a `file://` page is, and
 * what any sandboxed/partitioned embedding can be. Every probe of it in this
 * module used to be a bare property read at module scope, so a single throw
 * there meant `selectStorage` threw during module evaluation and the cockpit
 * never booted at all. The packaged desktop build is served over a SECURE
 * origin precisely so this cannot happen (`main.ts`'s `app://` header), but the
 * seam must not depend on that being true forever.
 */
function safeLocalStorage(win: StorageWindow): Storage | null {
  try {
    return win.localStorage ?? null;
  } catch {
    return null;
  }
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
    const migrated = safeLocalStorage(win) ? migrateInto(browserStore(win), target) : [];
    let saveLocation: string | null = null;
    try {
      saveLocation = bridge.dir();
    } catch {
      // A shell that cannot name its own save dir is still a usable shell; the
      // Settings row falls back to the generic label rather than crashing boot.
      saveLocation = null;
    }
    let shell: ShellInfo | null = null;
    try {
      shell = bridge.about();
    } catch {
      // Same rule as `dir()` above: a shell that cannot name its own version is
      // still a usable shell. The Build row falls back to the web wording.
      shell = null;
    }
    return {
      storage: target,
      backend: 'desktop',
      saveLocation,
      migrated,
      shell,
      // T-1702a · The one swallowing call in this file, and the reason is in the
      // header: an achievement is cosmetic, and a bridge hiccup must not be able
      // to throw out of a player's action. The `try` also covers a preload older
      // than this method (`bridge.unlockAchievement` undefined), which is the
      // shape a version-skewed shell would take.
      unlockAchievement: (apiName) => {
        try {
          bridge.unlockAchievement(apiName);
        } catch {
          /* no achievement is worth an action — see the header */
        }
      },
      // T-1702b · The second swallowing call, on the same terms as the first.
      // The `try` also covers a preload OLDER than this method (where
      // `bridge.setPresence` is `undefined`), which is the shape a
      // version-skewed shell takes.
      setRichPresence: (system, day) => {
        try {
          bridge.setPresence(system, day);
        } catch {
          /* a friends-list line is not worth an action — see the header */
        }
      },
      // T-141 · The third swallowing call, on the same terms as the first two.
      // The `try` also covers a preload OLDER than this method (where
      // `bridge.appendPlaytestLog` is `undefined`), which is the shape a
      // version-skewed shell takes.
      appendPlaytestLog: (sessionId, line) => {
        try {
          bridge.appendPlaytestLog(sessionId, line);
        } catch {
          /* a log line is not worth an action — see the header */
        }
      },
    };
  }
  if (win && safeLocalStorage(win)) {
    return {
      storage: browserStore(win),
      backend: 'browser',
      saveLocation: null,
      migrated: [],
      shell: null,
      unlockAchievement: noUnlock,
      setRichPresence: noPresence,
      appendPlaytestLog: noPlaytestLog,
    };
  }
  return {
    storage: memoryStore(),
    backend: 'browser',
    saveLocation: null,
    migrated: [],
    shell: null,
    unlockAchievement: noUnlock,
    setRichPresence: noPresence,
    appendPlaytestLog: noPlaytestLog,
  };
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

/** T-1701b · The shell's version, or `null` on the web build (no shell, nothing
 *  to ask).
 *
 *  T-1704 · The web build is NO LONGER VERSIONLESS: `version.ts`'s
 *  `BUILD_VERSION` is compiled into the bundle from the root `package.json`, so
 *  the earlier reasoning here — that a version string on the web would be a
 *  fiction — no longer holds and has been removed rather than left to mislead.
 *  THIS ONE STILL WINS WHENEVER IT IS NON-NULL: a packaged binary reports the
 *  version of the installer the player actually ran, which can be older than any
 *  bundle in this repository, and that older number is the true answer to "what
 *  am I running?".
 *
 *  READER: `App.tsx`'s Settings "Build → Version" row
 *  (`data-testid="app-version"`, `data-version-source`), asserted consumed by
 *  `packages/desktop/e2e/shell.spec.ts` and `e2e/packaged.spec.ts` (desktop,
 *  `shell`) and `packages/ui/e2e/settings-saves.spec.ts` (web, `bundle`). */
export const shellVersion: string | null = selected.shell?.version ?? null;

/** T-1701b · Whether this build updates itself, or `null` on web (the browser
 *  handles that). READER: `App.tsx`'s Settings "Build → Updates" row
 *  (`data-update-status`) through `format.ts`'s `updateStatusMessage`, asserted
 *  consumed on BOTH backends by the same three specs as {@link shellVersion}. */
export const updateStatus: UpdateStatus | null = selected.shell?.updates ?? null;

/** T-1702a · Whether Steam is recording achievements on this launch, or `null`
 *  on web (a browser tab has no Steam client, and claiming otherwise would be a
 *  fiction). READER: `App.tsx`'s Settings "Steam → Status" row
 *  (`data-steam-status`) through `format.ts`'s `steamStatusMessage`, asserted
 *  consumed on ALL THREE backends: `packages/desktop/e2e/shell.spec.ts` (dev
 *  shell, both `ready` and `unavailable`), `packages/desktop/e2e/packaged.spec.ts`
 *  (a real package → `unavailable`) and `packages/ui/e2e/settings-saves.spec.ts`
 *  (web → `web`). */
export const steamStatus: SteamStatus | null = selected.shell?.steam ?? null;

/**
 * T-1702a · Mirror one earned Deed onto Steam by its API name.
 *
 * A NO-OP ON WEB and a swallowing send under the shell — it never throws, by
 * contract (see the header's stated exception). READER: `steam.ts`'s `unlock`,
 * which is the only caller and dedupes before it gets here.
 */
export const unlockAchievement: (apiName: string) => void = selected.unlockAchievement;

/**
 * T-1702b · Whether this launch's saves are syncing to Steam Cloud, or `null` on
 * web (a browser tab has no Steam client, and claiming otherwise would be a
 * fiction — the same rule {@link steamStatus} follows).
 *
 * READER: `App.tsx`'s Settings "Steam → Cloud saves" row (`data-cloud-status`)
 * through `format.ts`'s `cloudStatusMessage`, asserted consumed on ALL THREE
 * backends: `packages/desktop/e2e/shell.spec.ts` (dev shell, both `ready` under
 * the fake cloud and `unavailable` with no app id),
 * `packages/desktop/e2e/packaged.spec.ts` (a real package → `unavailable`) and
 * `packages/ui/e2e/settings-saves.spec.ts` (web → `web`).
 */
export const cloudStatus: CloudStatus | null = selected.shell?.cloud ?? null;

/**
 * T-1702b · How many saves were pulled DOWN from Steam Cloud on this launch.
 *
 * This is what makes the RESTORE visible rather than just the connection — the
 * same argument the achievements tally makes. READER: the same Settings row as
 * {@link cloudStatus}, asserted consumed by `packages/desktop/e2e/shell.spec.ts`
 * (a wiped save dir reports `1 save restored`; a populated one reports `0`,
 * which is the no-clobber policy proved rather than asserted in a comment).
 */
export const cloudRestored: number = selected.shell?.cloudRestored ?? 0;

/**
 * T-1702b · Publish the player's current system and day as Steam rich presence.
 *
 * A NO-OP ON WEB and a swallowing send under the shell — it never throws, by
 * contract (see the header's stated exceptions). READER: `steam.ts`'s
 * `syncPresence`, which is its only caller and dedupes before it gets here.
 */
export const setRichPresence: (system: string, day: number) => void = selected.setRichPresence;

/**
 * T-141 · Append one JSONL line to this session's opt-in playtest log file
 * (`docs/PLAYTEST-TELEMETRY_SPEC.md` §4).
 *
 * A NO-OP ON WEB (there is no filesystem in a browser tab, so the log lives in
 * `playtestLog.ts`'s buffer until the player exports it) and a swallowing send
 * under the shell — it never throws, by contract (see the header's THIRD stated
 * exception). READER: `playtestLog.ts`'s recorders, which are its only callers
 * and which check the opt-in toggle before they get here.
 *
 * NOTHING IS UPLOADED. This writes a local file on the player's own machine,
 * through the shell's main process. Spec §5 settles submission as an explicit
 * player-triggered export; there is no network path in or out of this seam, and
 * `__tests__/playtest-no-network.test.ts` scans for one.
 */
export const appendPlaytestLogLine: (sessionId: string, line: string) => void =
  selected.appendPlaytestLog;
