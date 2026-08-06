// ---------------------------------------------------------------------------
// T-141 · THE APP-DATA PLAYTEST LOG.
//
// `docs/PLAYTEST-TELEMETRY_SPEC.md` §4 names the desktop store exactly: "an
// append-only JSONL file under the existing `app.getPath('userData')`
// directory … Rotate per session so a long UAT campaign doesn't accumulate one
// unbounded file." This is that file. The renderer holds a bounded in-memory
// buffer (`packages/ui/src/playtestLog.ts`) for the export; the COMPLETE record
// lives here, on the shipping target, written line by line as it is produced —
// so a crash that takes the renderer down does not take the log with it.
//
// PURE NODE — NO `electron` IMPORT, and that is enforced by a test in
// `__tests__/playtest-log.test.ts`, copied from `saveStore.ts`'s own guard and
// kept for the same two reasons: this module unit-tests without an Electron
// binary (so `npm test` needs nothing new), and the shell's file handling stays
// independent of the process model.
//
// ONE FILE PER SESSION, named for the session id the renderer minted. That IS
// the rotation §4 asks for: a session is the natural unit of a playtest sitting,
// the id is already the correlator inside the file, and a per-session file needs
// no size checks, no rename dance and no clock.
//
// APPEND-ONLY, AND UNBUFFERED. `appendFileSync` per line, deliberately: the
// whole value of a crash log is that the last line before the crash is already
// on disk. The write happens on the MAIN process, off the renderer's action
// path, reached by a fire-and-forget `ipcRenderer.send` (see `main.ts`'s
// `registerPlaytestLogIpc`).
//
// FAILURES PROPAGATE FROM HERE. Nothing is swallowed in this module; the
// swallowing happens at the IPC edge, where there is no reply channel to fail on
// and where a throw would surface as an unhandled main-process error. Keeping
// the module honest is what makes it testable.
//
// NO NETWORK. Spec §5 settles submission as a player-triggered export; this file
// writes to the local disk and imports nothing that could reach further.
// `packages/ui/src/__tests__/playtest-no-network.test.ts` scans it by name.
// ---------------------------------------------------------------------------

import { appendFileSync, mkdirSync } from 'node:fs';
import { join, sep } from 'node:path';

/** The append surface `main.ts` holds for the life of the process. */
export interface PlaytestLog {
  /** Append one already-serialized JSONL line for `sessionId`. A trailing
   *  newline is added here so the caller can never forget one. */
  append(sessionId: string, line: string): void;
  /** The directory the log files live in — for a bug report, and for the test. */
  readonly dir: string;
}

/**
 * The only session-id shape allowed to reach a path.
 *
 * A PATH-TRAVERSAL GUARD, not a style rule, and the same discipline as
 * `saveStore.ts`'s `SAFE_KEY`: this string arrives FROM THE RENDERER, which is
 * the surface an attacker reaches first in an Electron app, and it is about to
 * be concatenated into a filename. `..`, `/`, `\`, a drive letter or a NUL byte
 * must never get as far as `path.join`.
 *
 * A whitelist rather than a blacklist, for the reason `saveStore.ts` states: a
 * blacklist of traversal tricks is a list you can be wrong about. `crypto
 * .randomUUID()` and the arithmetic fallback in `packages/ui/src/playtestLog.ts`
 * both satisfy it.
 */
const SAFE_SESSION = /^[A-Za-z0-9-]{1,64}$/;

/** The longest line the file will accept. A JSONL entry is one action plus the
 *  engine events it produced; a megabyte of it is a bug, not a log line. */
const MAX_LINE = 256 * 1024;

function sessionToFile(dir: string, sessionId: string): string {
  if (!SAFE_SESSION.test(sessionId)) {
    throw new Error(`Unsafe playtest session id: ${JSON.stringify(sessionId)}`);
  }
  const file = join(dir, `playtest-${sessionId}.jsonl`);
  // Belt and braces, exactly as `saveStore.ts` does it: even with the whitelist,
  // assert the resolved path stayed inside the log dir. The regex is only the
  // means; this is the invariant that matters.
  if (!file.startsWith(dir.endsWith(sep) ? dir : dir + sep)) {
    throw new Error(`Playtest session id escaped the log directory: ${JSON.stringify(sessionId)}`);
  }
  return file;
}

/**
 * Open (creating on demand) the playtest log directory at `dir`.
 *
 * The directory is created on the first APPEND, not here — a shell that merely
 * starts should not scatter empty folders, and with logging off (the default)
 * no append ever happens, so an opted-out player's `userData` gains nothing at
 * all. That is the same rule `createSaveStore` follows.
 */
export function openPlaytestLog(dir: string): PlaytestLog {
  return {
    dir,
    append(sessionId: string, line: string): void {
      if (typeof line !== 'string' || line.length === 0 || line.length > MAX_LINE) {
        throw new Error('Playtest log line is empty or oversized');
      }
      // A line containing a newline would silently become two records and
      // corrupt the JSONL. The renderer serializes with `JSON.stringify`, which
      // escapes them — so this is the invariant, not the expectation.
      if (/[\r\n]/.test(line)) {
        throw new Error('Playtest log line contains a newline');
      }
      const file = sessionToFile(dir, sessionId);
      mkdirSync(dir, { recursive: true });
      appendFileSync(file, `${line}\n`, 'utf8');
    },
  };
}
