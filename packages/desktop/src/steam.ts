// ============================================================================
//  T-1702 · Steam native surface — the injectable backend + graceful no-Steam fallback
// ============================================================================
//
// steamworks.js is a NATIVE prebuilt addon (`.node` binaries per platform), so it can
// only load in the Node main process (never the sandboxed renderer) and is the ONE new
// exception to the "everything inlined, zero runtime node_modules" packaging rule
// (see esbuild.mjs / electron-builder.yml): it is `external` in the bundle and shipped
// unpacked out of the asar.
//
// EVERYTHING here is wrapped so ANY failure — module absent, Steam not running,
// `init` throwing, an API signature mismatch — degrades to a no-op, NEVER a crash.
// That is the whole "app runs identically without Steam present" acceptance criterion,
// centralised at this lowest level: `createSteamBackend` returns null on any failure,
// and `SteamService` no-ops on every method when the backend is null.

import { CONQUEROR_ACHIEVEMENT_ID, achievementIdForEvent, presenceFor } from './steam-achievements';
import type { GameEvent } from '@spacerquest/engine';

/** The narrow Steam capabilities the app uses. Injectable so `SteamService` and the
 *  cloud-sync helpers are unit-testable with an in-memory fake (no Steam client). */
export interface SteamBackend {
  /** Unlock an achievement id (idempotent — a re-unlock is harmless). */
  unlock(id: string): void;
  /** Set the friends-list rich presence to the current system + day. */
  setRichPresence(systemId: number, day: number): void;
  /** Write a blob to Steam Cloud under `name`. */
  cloudWrite(name: string, content: string): void;
  /** Read a blob from Steam Cloud, or null when absent/unreadable. */
  cloudRead(name: string): string | null;
}

/** The Steam Cloud filename the T-1002 seed-carrying autosave envelope round-trips
 *  through. Matches the autosave key so the cloud copy is unmistakably the same blob. */
export const CLOUD_SAVE_FILE = 'sq.save.v1.json';

/** The rich-presence key Steam reads for the friends-list display line. */
const RICH_PRESENCE_KEY = 'steam_display';

/**
 * Construct the real Steam backend, or null if Steam is unavailable for ANY reason.
 * The native module is `require`d lazily (it is `external` in the esbuild bundle) so a
 * missing binary throws here and is caught — the app then runs with no Steam at all.
 *
 * `deps` is injectable purely so tests can exercise the wiring without the real addon;
 * production passes nothing and the real `require('steamworks.js')` is used.
 */
export function createSteamBackend(
  appId: number | undefined,
  deps?: { requireSteamworks?: () => unknown },
): SteamBackend | null {
  try {
    // A runtime `require` (not a static import) is deliberate: steamworks.js is
    // `external` in the esbuild bundle (a native `.node` addon), and loading it lazily
    // inside this try means a missing/broken module degrades to the null fallback
    // rather than crashing at module load. This is a CJS main process, so `require`
    // is the correct loader here.
    const loadSteamworks = (): unknown =>
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('steamworks.js');
    const steamworks = (deps?.requireSteamworks?.() ?? loadSteamworks()) as Record<string, unknown>;
    const sw = steamworks as {
      init: (appId?: number) => SteamClient;
      electronEnableSteamOverlay?: () => void;
    };
    const client = sw.init(appId);
    // Enable the in-game overlay for the Electron window (documented in steamworks.js's
    // Electron guide). Guarded: an overlay-enable failure must not sink Steam init.
    try {
      sw.electronEnableSteamOverlay?.();
    } catch (err) {
      console.warn('sq/steam: overlay enable failed (ignored)', err);
    }
    return realBackend(client);
  } catch (err) {
    // The graceful fallback: no module, no Steam client, or an init throw. Log once at
    // low volume and return null — every caller then no-ops.
    console.log('sq/steam: Steam unavailable — running without Steam integration', errText(err));
    return null;
  }
}

/** The subset of the steamworks.js client shape this app touches (see
 *  node_modules/steamworks.js/client.d.ts). Declared locally so the desktop build has
 *  no hard type dependency on the native package's declarations. */
interface SteamClient {
  achievement: {
    activate(id: string): boolean;
    isActivated(id: string): boolean;
  };
  cloud: {
    writeFile(name: string, content: string): boolean;
    readFile(name: string): string;
    fileExists(name: string): boolean;
  };
  localplayer: {
    setRichPresence(key: string, value?: string | null): void;
  };
}

/** Wrap a live steamworks.js client as a `SteamBackend`. Every call is individually
 *  guarded so a single API mismatch degrades to a no-op instead of crashing play. */
function realBackend(client: SteamClient): SteamBackend {
  return {
    unlock(id: string): void {
      try {
        if (!client.achievement.isActivated(id)) {
          client.achievement.activate(id);
        }
      } catch (err) {
        console.warn('sq/steam: achievement unlock failed (ignored)', id, errText(err));
      }
    },
    setRichPresence(systemId: number, day: number): void {
      try {
        client.localplayer.setRichPresence(
          RICH_PRESENCE_KEY,
          presenceFor(systemId, day).steamDisplay,
        );
      } catch (err) {
        console.warn('sq/steam: rich presence failed (ignored)', errText(err));
      }
    },
    cloudWrite(name: string, content: string): void {
      try {
        client.cloud.writeFile(name, content);
      } catch (err) {
        console.warn('sq/steam: cloud write failed (ignored)', name, errText(err));
      }
    },
    cloudRead(name: string): string | null {
      try {
        if (!client.cloud.fileExists(name)) return null;
        return client.cloud.readFile(name);
      } catch (err) {
        console.warn('sq/steam: cloud read failed (ignored)', name, errText(err));
        return null;
      }
    },
  };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The main-process façade over the Steam backend. Owns achievement de-duplication and
 * rich-presence throttling, and is a TOTAL no-op when `backend` is null (the no-Steam
 * fallback). Injectable backend keeps it unit-testable with a fake.
 *
 * READERS of the events it consumes: `handleEvents` derives ids via
 * `steam-achievements.ts` and unlocks each once; `updatePresence` pushes the current
 * `state.player.currentSystemId` / `state.day` snapshot forwarded by the renderer.
 */
export class SteamService {
  private readonly backend: SteamBackend | null;
  /** Achievements already unlocked this process — a fast in-memory de-dupe on top of
   *  Steam's own idempotency, so a re-earned deed never re-fires an unlock call. */
  private readonly unlocked = new Set<string>();
  /** Last presence pushed, to skip redundant rich-presence writes when the renderer
   *  forwards a snapshot for a system/day that has not changed. */
  private lastPresence: string | null = null;

  constructor(backend: SteamBackend | null) {
    this.backend = backend;
  }

  /** True when a live Steam client is attached (false = the graceful fallback path). */
  get enabled(): boolean {
    return this.backend !== null;
  }

  /** Unlock achievements for every achievement-bearing event in the stream, once each.
   *  A no-op when Steam is absent. Fire-and-forget: never throws to the caller. */
  handleEvents(events: readonly GameEvent[]): void {
    if (!this.backend) return;
    for (const event of events) {
      const id = achievementIdForEvent(event);
      if (!id || this.unlocked.has(id)) continue;
      this.unlocked.add(id);
      this.backend.unlock(id);
    }
  }

  /** Push the current system + day as rich presence, skipping unchanged snapshots.
   *  A no-op when Steam is absent. */
  updatePresence(systemId: number, day: number): void {
    if (!this.backend) return;
    const key = `${systemId}:${day}`;
    if (key === this.lastPresence) return;
    this.lastPresence = key;
    this.backend.setRichPresence(systemId, day);
  }

  /** The backend for the cloud-sync helpers (null when Steam is absent). */
  get cloudBackend(): SteamBackend | null {
    return this.backend;
  }
}

export { CONQUEROR_ACHIEVEMENT_ID };
