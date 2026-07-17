// ============================================================================
//  T-1701 · Persistence storage adapter — the single UI persistence choke point
// ============================================================================
//
// Every `sq.*` persistence key (autosave, save slots, settings, audio mixer) flows
// through THIS module. It has two backends, chosen at load time:
//
//   • WEB (default): a byte-for-byte passthrough to `window.localStorage`. The web
//     build is therefore completely unchanged — same keys, same synchronous reads,
//     same benign behaviour when storage is blocked/absent.
//   • ELECTRON: when the desktop preload has exposed `window.sqNative`, reads/writes
//     go to an in-memory Map seeded from the OS app-data file store, mirrored back to
//     that file on every write (via `native.write`/`native.remove`). This is where
//     "saves in OS app-data" comes from.
//
// The whole API is SYNCHRONOUS and never throws — the existing try/catch wrappers in
// store.ts / sound.ts keep behaving identically. It is deliberately a dumb key/value
// surface (no game logic, no engine import): the UI stays the client, the engine
// stays pure, and no new GameState field or event is introduced — the only new
// persisted surface is the desktop file store, whose reader is this adapter.

/** The bridge the desktop preload exposes (see packages/desktop/src/preload.ts). */
interface SqNative {
  /** The whole `sq.*` store as it stood at process start. */
  initialData: Record<string, string>;
  /** Whether the file store already existed — false on first desktop launch, which
   *  arms the one-time localStorage → file-store migration below. */
  fileExisted: boolean;
  write(key: string, value: string): void;
  remove(key: string): void;
  /**
   * T-1702 · Steam bridge (desktop only; undefined on the web build). A dumb
   * fire-and-forget forwarder — the renderer passes the typed engine events it already
   * scans plus a (system, day) presence snapshot, and ALL Steam logic lives in the
   * main process. No game logic here; the engine stays pure and the UI stays a client.
   */
  steam?: {
    sendEvents(events: unknown[]): void;
    setPresence(systemId: number, day: number): void;
  };
}

const native: SqNative | undefined =
  typeof window !== 'undefined'
    ? (window as unknown as { sqNative?: SqNative }).sqNative
    : undefined;

/** True when running inside the Electron shell (file-backed persistence). */
export const isNative = !!native;

/**
 * T-1702 · The desktop Steam forwarder, or undefined on the web build (no preload, so
 * `window.sqNative` is undefined) and on an older desktop build without the bridge.
 * `store.ts` reaches Steam through THIS accessor with optional chaining, so the web
 * build is byte-for-byte unchanged. Deliberately a dumb bridge — no engine import
 * beyond the event payload, no rule ownership.
 */
export const nativeSteam = native?.steam;

// In native mode, an in-memory mirror of the file store. Reads hit this Map (so they
// stay synchronous); writes update it AND forward to the main process for the disk
// flush. Null in web mode (localStorage is the source of truth there).
const mem: Map<string, string> | null = native
  ? new Map<string, string>(Object.entries(native.initialData))
  : null;

// ---- one-time migration: browser localStorage → desktop file store ---------
// On the FIRST desktop launch the file store does not yet exist, but the Chromium
// profile's localStorage may already hold a career saved by the web build (or a
// prior packaged build that wrote to localStorage). Copy every `sq.*` key across so
// the player's saves and settings survive the move to the desktop shell. Guarded and
// idempotent: it only runs when `!fileExisted`, and it never overwrites a key already
// present in the (freshly seeded) file store.
if (native && mem && !native.fileExisted) {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith('sq.')) continue;
      if (mem.has(key)) continue;
      const value = window.localStorage.getItem(key);
      if (value === null) continue;
      mem.set(key, value);
      native.write(key, value);
    }
  } catch {
    /* localStorage unavailable — nothing to migrate, benign */
  }
}

export function getItem(key: string): string | null {
  if (native && mem) {
    return mem.has(key) ? (mem.get(key) as string) : null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string): void {
  if (native && mem) {
    mem.set(key, value);
    try {
      native.write(key, value);
    } catch {
      /* main process unreachable — the in-memory mirror still holds this session */
    }
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — non-fatal for play */
  }
}

export function removeItem(key: string): void {
  if (native && mem) {
    mem.delete(key);
    try {
      native.remove(key);
    } catch {
      /* main process unreachable — the in-memory mirror still reflects the delete */
    }
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — non-fatal for play */
  }
}
