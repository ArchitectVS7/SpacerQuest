// ---------------------------------------------------------------------------
// T-1701a · THE APP-DATA SAVE STORE.
//
// A synchronous key/value store backed by one flat directory of plain files. It
// is the whole reason the Electron shell exists: T-1605c measured a 1,000-day
// career at ~10.9 MiB against Chromium's ~5 MB per-origin localStorage quota, so
// a long career silently stopped autosaving on the web build around day ~420.
// Files have no such ceiling.
//
// PURE NODE — NO `electron` IMPORT, and that is enforced by a test in
// `__tests__/saveStore.test.ts`. Two things depend on it: this module unit-tests
// without an Electron binary (so CI's existing `Build, lint, test` job can run
// `npm test` untouched), and the shell's file handling stays independent of the
// process model, which T-1701b's packaging work will move around.
//
// FLAT DIRECTORY, RAW VALUES, ORIGINAL KEY NAMES. Values are the save envelopes
// exactly as `engine/save.ts createSave` produced them — already JSON text, so
// wrapping them in more JSON would only cost a parse and hide the payload from
// anyone reading the file. One file per key, named for the key, mirroring the
// flat `sq.*` namespace localStorage used: `sq.save.v1`, `sq.slot.2.v1`,
// `sq.save.v1.corrupt`. Those are the names the player, the recovery notice
// (`format.ts`'s `QUARANTINE_KEY_LABEL`) and every existing bug report already
// use, and keeping them identical is what makes the localStorage import a
// one-to-one copy rather than a translation.
//
// FAILURES PROPAGATE. Nothing here is swallowed. `store.ts` builds three shipped
// behaviours on storage throwing — `recovery: 'storage-unavailable'` (T-1605a),
// `quarantineAutosave`'s honest `preserved: false`, and
// `CockpitState.saveWriteFailed` (T-1605c) — so a store that returned `null` for
// an unreadable career would hand the player a fresh one in silence, which is
// the exact bug those tasks fixed.
// ---------------------------------------------------------------------------

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { join, sep } from 'node:path';

/** The synchronous surface the preload bridge exposes to the renderer. Mirrors
 *  `packages/ui/src/storage.ts`'s `KeyValueStore`, plus the directory the
 *  Settings panel shows. */
export interface SaveStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
  readonly dir: string;
}

/**
 * The only key shape allowed on disk.
 *
 * This is a PATH-TRAVERSAL GUARD, not a style rule. Keys arrive from the
 * renderer over IPC, and a renderer is the part of an Electron app an attacker
 * reaches first. `..`, `/`, `\`, a drive letter or a NUL byte must never get as
 * far as `path.join`, or a "save" could be written anywhere the user can write.
 * Every current key (`sq.save.v1`, `sq.slot.2.meta`, `sq.vol.master`,
 * `sq.migrated.from-localstorage.v1`) already satisfies it.
 *
 * Deliberately a whitelist rather than a blacklist: a blacklist of traversal
 * tricks is a list you can be wrong about.
 */
const SAFE_KEY = /^[A-Za-z0-9._-]+$/;

/** Suffix for the write-side temp file. Skipped by `keys()` so a crashed write
 *  never shows up as a phantom save. */
const TMP_SUFFIX = '.tmp';

function keyToFile(dir: string, key: string): string {
  if (!SAFE_KEY.test(key) || key === '.' || key === '..' || key.endsWith(TMP_SUFFIX)) {
    throw new Error(`Unsafe save key: ${JSON.stringify(key)}`);
  }
  const file = join(dir, key);
  // Belt and braces: even with the whitelist above, assert the resolved path
  // stayed inside the save dir. Cheap, and it is the invariant that actually
  // matters — the regex is only the means.
  if (!file.startsWith(dir.endsWith(sep) ? dir : dir + sep)) {
    throw new Error(`Save key escaped the save directory: ${JSON.stringify(key)}`);
  }
  return file;
}

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

/**
 * Open (creating on demand) the save directory at `dir`.
 *
 * The directory is NOT created here — a shell that merely starts should not
 * scatter empty folders, and `setItem` creates it on the first real write.
 */
export function createSaveStore(dir: string): SaveStore {
  return {
    dir,

    getItem(key: string): string | null {
      const file = keyToFile(dir, key);
      try {
        return readFileSync(file, 'utf8');
      } catch (err) {
        // A missing file is "no save", which is not a failure — a first run must
        // not look like a blocked store. ANY other error (EACCES on a locked
        // profile dir, EIO on a failing disk) is rethrown: swallowing it would
        // hand the player a fresh career and call it a clean boot.
        if (isEnoent(err)) return null;
        throw err;
      }
    },

    setItem(key: string, value: string): void {
      const file = keyToFile(dir, key);
      const tmp = file + TMP_SUFFIX;
      mkdirSync(dir, { recursive: true });
      try {
        // ATOMIC: write beside, then rename over. `rename` within one directory
        // is atomic on every platform we ship to, so a crash or a power cut
        // mid-write can leave the OLD career or the NEW one, never half of each.
        // This is the write-side twin of T-1605a's read-side custody rule.
        writeFileSync(tmp, value, 'utf8');
        renameSync(tmp, file);
      } catch (err) {
        // Clean up the debris, then let the failure through — `store.ts` needs
        // the throw to raise `saveWriteFailed`.
        rmSync(tmp, { force: true });
        throw err;
      }
    },

    removeItem(key: string): void {
      const file = keyToFile(dir, key);
      try {
        unlinkSync(file);
      } catch (err) {
        // Deleting what is not there is a success, matching `localStorage`.
        if (!isEnoent(err)) throw err;
      }
    },

    keys(): string[] {
      try {
        return readdirSync(dir).filter((name) => !name.endsWith(TMP_SUFFIX));
      } catch (err) {
        // No directory yet == no keys. Any other error propagates.
        if (isEnoent(err)) return [];
        throw err;
      }
    },
  };
}
