// ============================================================================
//  T-1702 · Steam Cloud sync for the T-1002 seed-carrying save envelope — pure helpers
// ============================================================================
//
// The autosave key `sq.save.v1` in the file-backed store IS `createSave(...)` output —
// the versioned T-1002 SaveEnvelope with the `seed` field. That exact blob is what
// Steam Cloud must round-trip. These helpers are pure functions over the in-memory
// store map + an injectable `SteamBackend`, so the round-trip is mechanically testable
// with an in-memory fake cloud (cloud-sync.test.ts) — no Steam client needed.
//
// The only new persisted surface T-1702 adds is this Steam Cloud copy of `sq.save.v1`;
// its READER is `importEnvelopeFromCloud` at boot (asserted by the round-trip test).
//
// CONFLICT POLICY (kept minimal and honest for this release):
//   • local ABSENT  → adopt the cloud copy (fresh machine restores a career).
//   • both present  → LOCAL WINS (no merge invented that cannot be tested).
// Richer last-write-wins by envelope timestamp is a documented follow-up (see the
// T-1702 Delivered note) rather than a fabricated merge.

import { CLOUD_SAVE_FILE, type SteamBackend } from './steam';

/** The autosave key the renderer writes and the cloud copy mirrors. */
export const SAVE_KEY = 'sq.save.v1';

/**
 * Mirror the local autosave envelope to Steam Cloud. Called after every autosave disk
 * flush. A no-op when there is no backend (Steam absent) or no local envelope yet.
 */
export function syncEnvelopeToCloud(
  store: Record<string, string>,
  backend: SteamBackend | null,
): void {
  if (!backend) return;
  const blob = store[SAVE_KEY];
  if (typeof blob !== 'string' || blob.length === 0) return;
  backend.cloudWrite(CLOUD_SAVE_FILE, blob);
}

/**
 * On boot, when the local autosave is ABSENT, adopt the Steam Cloud copy so a fresh
 * machine restores the player's career before the renderer reads state. Returns true
 * when a cloud envelope was imported into `store` (so the caller can log/observe it),
 * false otherwise. A no-op — returning false — when Steam is absent, when a local
 * envelope already exists (local wins), or when the cloud has no copy.
 *
 * `localFileExisted` mirrors the store-file-existed signal main.ts already tracks; the
 * import runs only for a genuinely fresh store (no local envelope), never overwriting a
 * present local career.
 */
export function importEnvelopeFromCloud(
  store: Record<string, string>,
  backend: SteamBackend | null,
): boolean {
  if (!backend) return false;
  // Local career already present — local wins, do not clobber it.
  if (typeof store[SAVE_KEY] === 'string' && store[SAVE_KEY].length > 0) return false;
  const cloud = backend.cloudRead(CLOUD_SAVE_FILE);
  if (typeof cloud !== 'string' || cloud.length === 0) return false;
  store[SAVE_KEY] = cloud;
  return true;
}
