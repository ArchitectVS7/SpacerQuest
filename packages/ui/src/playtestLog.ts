// ---------------------------------------------------------------------------
// T-141 · OPT-IN PLAYTEST LOGGING.
//
// The implementation of `docs/PLAYTEST-TELEMETRY_SPEC.md`. Its whole purpose is
// internal UAT / Alpha / Beta: a tester who hits a dead end or a crash can hand
// back the exact action stream that produced it, instead of a paraphrase.
//
// OFF BY DEFAULT, AND THE DEFAULT IS STRUCTURAL. Every recorder below re-reads
// {@link isPlaytestLoggingEnabled} at CALL TIME rather than caching a boolean at
// module scope, so "the player never turned it on" and "the player turned it off
// mid-session" are the same code path, and a cached `true` cannot outlive the
// consent that produced it (spec §3).
//
// THE SEAM IS `store.ts`'s `applyAction`, not each action thunk. Spec §1 taps
// "every `PlayerAction` passed to `applyPlayerAction`" — the engine's existing,
// single, typed entry point. The store has ~20 action thunks; tapping each one
// would be twenty places the next action can forget. See `applyAction`'s own
// comment for the extraction that made that choke point exist.
//
// THE TOGGLE IS A CLIENT PREFERENCE, NOT GAME STATE. It lives under
// `sq.playtest.logging` in `storage.ts`'s `KeyValueStore` — the same
// local-preference layer `sq.reduced-motion` and `sq.text-size` already use —
// so it never round-trips through the save file and `CURRENT_SAVE_VERSION` does
// not move (spec §3/§7). The `sq.` prefix is load-bearing: `storage.ts`'s
// `migrateInto` copies by prefix, so a tester who moves from the web build to
// the desktop shell keeps their setting.
//
// NOTHING HERE CAN REACH THE NETWORK, and that is asserted rather than promised
// in prose: `__tests__/playtest-no-network.test.ts` source-scans this file (and
// its desktop sibling, and the cockpit) for every browser and Node transport by
// name — that file's own FORBIDDEN list is the authority, deliberately, so the
// names live in one place — and `__tests__/playtest-log.test.ts` installs
// throwing spies on all of them across a real export. Spec §5 settles
// submission as a PLAYER-TRIGGERED EXPORT: nothing leaves the machine until the
// player clicks a button, and there is no server in this repository to leave to.
//
// THE ENTRY SHAPE IS SHARED WITH `docs/BALANCE-TELEMETRY_SPEC.md` §6 — the same
// `kind` discriminant and the same `day` field — so one downstream analysis pass
// reads simulated-NPC traces and human playtest logs without a translation
// layer. That is why {@link PlaytestLogEntry} omits absent keys instead of
// setting them to `undefined`: a JSONL line must be literally the shape the spec
// prints, not that shape plus four nulls.
//
// PII: NONE, BY CONSTRUCTION (spec §2). No OS username, no hardware id, no IP,
// no Steam id. The only correlator is {@link playtestSessionId}, a random value
// minted fresh per session, never persisted and never written to the save. Error
// text is passed through {@link redactErrorMessage} first, because a raw stack
// trace embeds the player's home directory — which embeds their username.
// ---------------------------------------------------------------------------

import type { GameEvent, PlayerAction } from '@spacerquest/engine';
import { appendPlaytestLogLine, storage } from './storage';

/**
 * One line of the log. EXACTLY `docs/PLAYTEST-TELEMETRY_SPEC.md` §6's shape,
 * field for field and in that order — the order matters because `JSON.stringify`
 * preserves insertion order and the JSONL is read by eye as often as by script.
 *
 * The optional members are OMITTED when they do not apply rather than present
 * and `undefined`, so an `action` line carries no empty `note` and an
 * `annotation` line carries no empty `events`.
 */
export interface PlaytestLogEntry {
  /** Random, per-session, never persisted to the save (spec §2). */
  sessionId: string;
  day: number;
  kind: 'action' | 'annotation' | 'error';
  /** `kind === 'action'` — the engine action exactly as it was submitted. */
  action?: PlayerAction;
  /** `kind === 'action'` — the engine's own response to that action. */
  events?: GameEvent[];
  /** `kind === 'annotation'` — the tester's free-text "flag this moment" note. */
  note?: string;
  /** `kind === 'error'` — the message only, redacted; never a stack trace. */
  error?: string;
}

/**
 * Where the toggle lives. Under the `sq.` prefix DELIBERATELY: `storage.ts`'s
 * `migrateInto` copies by prefix, so this key rides the localStorage→app-data
 * import with everything else rather than being silently left behind on the web
 * profile. Values are `'on'` / `'off'`; anything else reads as OFF.
 */
export const PLAYTEST_LOGGING_KEY = 'sq.playtest.logging';

/** The Settings row's label. Spec §3's wording. Rendered by `App.tsx` from this
 *  constant, never re-typed, so the screen and the golden test cannot drift. */
export const PLAYTEST_TOGGLE_LABEL = 'Enable Playtest Logging';

/**
 * The disclosure shown at the toggle. SETTLED BY SPEC §3 (and restated in its
 * preamble) — it is what the player is promised, so it is pinned by a golden
 * test and must not be edited to make a test pass. If the capture ever grows
 * beyond gameplay actions, this sentence changes FIRST and the spec with it.
 */
export const PLAYTEST_DISCLOSURE =
  'Gameplay actions only — no personally identifying information, no location.';

/** The longest annotation the log will store. A tester's note, not an essay;
 *  the cap keeps one pasted stack trace from dominating an export. */
const MAX_NOTE = 500;

/** The longest error message the log will store, after redaction. */
const MAX_ERROR = 500;

/**
 * The in-renderer buffer's ceiling, with DROP-OLDEST when it is reached.
 *
 * A UAT session can run for hours, and an unbounded array in a renderer is a
 * memory leak wearing a diagnostic's clothes. 20,000 entries is far more than a
 * single sitting produces (an action is a deliberate human act, not a tick) and
 * costs a few MB at worst. The DESKTOP side keeps the complete record anyway:
 * spec §4's append-only per-session JSONL file under `userData` is written line
 * by line as they are produced, so nothing dropped here is lost on the shipping
 * target.
 */
const MAX_ENTRIES = 20_000;

/**
 * The per-session anonymous id (spec §2).
 *
 * Minted ONCE per module evaluation, from `crypto.randomUUID` where it exists.
 * NEVER derived from a Steam id, a hardware id or save data, never written to
 * `storage`, and never written into the save — so two exports from the same
 * player cannot be correlated with each other, while every line within ONE
 * export can.
 */
function mintSessionId(): string {
  try {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch {
    /* fall through to the arithmetic id below */
  }
  // Fallback for a runtime without WebCrypto. NOT a security primitive — this
  // id exists to group lines inside one file, and collisions across two exports
  // are a nuisance rather than a hazard.
  return `sq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const sessionId = mintSessionId();

let buffer: PlaytestLogEntry[] = [];

/** The id every entry in this session carries. READERS: `App.tsx`'s export
 *  filename and the feature's tests. */
export function playtestSessionId(): string {
  return sessionId;
}

/**
 * Is capture on right now?
 *
 * TOTAL over a blocked or unreadable store: a private-mode browser that throws
 * on `getItem` reads as OFF, which is the safe answer for a consent flag. This
 * mirrors `store.ts`'s `readReducedMotion` exactly — a settings read must never
 * cost a player their turn.
 */
export function isPlaytestLoggingEnabled(): boolean {
  try {
    return storage.getItem(PLAYTEST_LOGGING_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Turn capture on or off. Persisted through the ONE storage seam, never
 *  `localStorage` directly (asserted structurally by `storage.test.ts`). */
export function setPlaytestLoggingEnabled(on: boolean): void {
  try {
    storage.setItem(PLAYTEST_LOGGING_KEY, on ? 'on' : 'off');
  } catch {
    /* a blocked store must not cost a turn — the toggle simply does not stick */
  }
}

/** Serialize one entry and mirror it to the desktop's append-only session file
 *  (spec §4). A no-op on the web build, where `appendPlaytestLogLine` is the
 *  documented no-op sink, and never throws — see `storage.ts`'s header. */
function mirrorToDesktop(entry: PlaytestLogEntry): void {
  try {
    appendPlaytestLogLine(sessionId, JSON.stringify(entry));
  } catch {
    /* the in-memory buffer is still intact; an export loses nothing */
  }
}

function push(entry: PlaytestLogEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  mirrorToDesktop(entry);
}

/**
 * Record one action and the engine's response to it.
 *
 * RECORDED WHETHER OR NOT THE ENGINE ACCEPTED IT. A refusal — a failed
 * `TradeEvent`, a `HangoutEvent{failReason}`, a `StoryletChoiceBlocked` — is
 * precisely what a playtest log exists to capture: "I pressed the thing and it
 * would not let me" is the most common UAT report there is, and it is invisible
 * if only successful actions are logged.
 *
 * `day` is the PRE-action day, because that is the day the player took the
 * action on; an action that ends the day would otherwise be filed under the next
 * one.
 */
export function recordAction(day: number, action: PlayerAction, events: GameEvent[]): void {
  if (!isPlaytestLoggingEnabled()) return;
  push({ sessionId, day, kind: 'action', action, events });
}

/**
 * Record the tester's "flag this moment" note (spec §1) — the bug-report /
 * dead-end capture the ask names specifically.
 *
 * An empty or whitespace-only note is IGNORED rather than stored: a blank line
 * in an export tells the reader nothing and costs them a lookup.
 */
export function recordAnnotation(day: number, note: string): void {
  if (!isPlaytestLoggingEnabled()) return;
  const trimmed = note.trim().slice(0, MAX_NOTE);
  if (trimmed.length === 0) return;
  push({ sessionId, day, kind: 'annotation', note: trimmed });
}

/**
 * Record a caught fault (spec §1) — so a crash is in the export even when the
 * player never thinks to flag it.
 *
 * MESSAGE ONLY, AND REDACTED. A stack trace embeds absolute paths, and an
 * absolute path embeds the player's OS username, which spec §2 excludes
 * outright. {@link redactErrorMessage} is what makes that true of the message
 * too, since a thrown message frequently quotes the file it came from.
 */
export function recordError(day: number, error: unknown): void {
  if (!isPlaytestLoggingEnabled()) return;
  const raw = error instanceof Error ? error.message : String(error);
  push({ sessionId, day, kind: 'error', error: redactErrorMessage(raw) });
}

/**
 * Strip anything path-shaped out of an error message before it is stored.
 *
 * WHY, in spec §6's own words: "a raw stack trace can contain local file paths
 * that embed an OS username". `/Users/somebody/…`, `C:\Users\somebody\…` and
 * `file:///Users/somebody/…` all name the player. `http(s)://` URLs go too —
 * a dev-server URL is not PII but it is not gameplay either, and the disclosure
 * promises gameplay actions only.
 *
 * A WHITELIST OF WHAT SURVIVES is not possible here (the message is arbitrary
 * text from anywhere in the stack), so this is a blacklist — but it is a
 * blacklist of SHAPES rather than of names, and the replacement is visible
 * (`<path>`) so a reader can tell redaction happened rather than wondering why a
 * sentence stops mid-word.
 */
export function redactErrorMessage(message: string): string {
  return (
    message
      // Scheme-bearing locations first, so their path halves are not left behind
      // by the bare-path rules below.
      .replace(/\b(?:file|https?):\/\/\S*/gi, '<path>')
      // Windows absolute paths: a drive letter, a slash, then anything non-space.
      .replace(/\b[A-Za-z]:[\\/]\S*/g, '<path>')
      // POSIX absolute paths: a leading slash and at least two segments, so a
      // bare "and/or" or a lone "/" in prose survives.
      .replace(/\/[\w.@-]+(?:\/[\w.@-]+)+/g, '<path>')
      .slice(0, MAX_ERROR)
  );
}

/** A defensive copy of everything captured this session. The buffer itself is
 *  never handed out — an exporter that mutated it would corrupt the record. */
export function snapshotPlaytestLog(): PlaytestLogEntry[] {
  return buffer.slice();
}

/**
 * How many entries are captured, WITHOUT copying the buffer.
 *
 * It exists because `store.ts`'s `set()` — the cockpit's one state-update choke
 * point — reads it on EVERY patch so the Settings row's count is live rather
 * than stale-until-you-touch-a-control. That is a hot path, and
 * {@link snapshotPlaytestLog} is O(n): a 20,000-entry copy per keystroke would
 * turn a diagnostic into a performance bug, which is exactly the trade
 * `docs/BALANCE-TELEMETRY_SPEC.md` refuses for the NPC trace.
 */
export function playtestLogSize(): number {
  return buffer.length;
}

/**
 * TEST-ONLY. Empties the buffer so one suite's entries cannot leak into the
 * next assertion. It deliberately does NOT re-mint {@link sessionId}: the
 * session id's whole contract is "one per session", and a helper that quietly
 * broke that would make the tests prove something the shipped code does not do.
 */
export function resetPlaytestLogForTests(): void {
  buffer = [];
}

/**
 * The export format (spec §6): JSONL, one entry per line, trailing newline.
 *
 * An empty log serializes to the empty string rather than to a lone `\n`, so a
 * consumer counting lines is not off by one.
 */
export function toJsonl(entries: PlaytestLogEntry[]): string {
  if (entries.length === 0) return '';
  return `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
}

/** Fixed column order for {@link toCsv}. A flattening of the SAME entries, not a
 *  second capture path (spec §6) — which is why `action` and `events` ride as
 *  JSON text rather than being exploded into columns that would differ per
 *  action type. */
const CSV_COLUMNS = [
  'sessionId',
  'day',
  'kind',
  'actionType',
  'action',
  'events',
  'note',
  'error',
] as const;

/** RFC4180: double every quote, and wrap any field containing a comma, a quote
 *  or a newline. */
function csvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * CSV for anyone who wants a spreadsheet rather than a script (spec §6).
 *
 * The header row is ALWAYS present, including for an empty log — a
 * zero-row-plus-header file is readable; a zero-byte file looks like a failed
 * export.
 *
 * `actionType` is lifted out of `action` as its own column because it is the one
 * field a spreadsheet actually pivots on; the full action rides beside it as
 * JSON so nothing is lost in the flattening.
 */
export function toCsv(entries: PlaytestLogEntry[]): string {
  const rows = [CSV_COLUMNS.join(',')];
  for (const entry of entries) {
    rows.push(
      [
        entry.sessionId,
        String(entry.day),
        entry.kind,
        entry.action?.type ?? '',
        entry.action ? JSON.stringify(entry.action) : '',
        entry.events ? JSON.stringify(entry.events) : '',
        entry.note ?? '',
        entry.error ?? '',
      ]
        .map(csvField)
        .join(','),
    );
  }
  return `${rows.join('\n')}\n`;
}

/**
 * The download filename. Session id + entry count, on the same reasoning as
 * `store.ts`'s `careerFileName`: a tester with three exports must be able to
 * tell them apart, and a bug report should name the run it came from.
 *
 * The `json` flavour is named `.jsonl`, not `.json`, because that is what the
 * bytes are — spec §6 settles JSONL as THE format, and §5's "a JSON or CSV file"
 * is the two file flavours of that one record, not two schemas.
 */
export function playtestLogFileName(format: 'json' | 'csv', entryCount: number): string {
  return `rimward-playtest-${sessionId}-${entryCount}.${format === 'csv' ? 'csv' : 'jsonl'}`;
}
