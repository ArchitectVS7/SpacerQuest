import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_SAVE_VERSION, createSave, loadSave } from '@spacerquest/engine';
import {
  PLAYTEST_DISCLOSURE,
  PLAYTEST_LOGGING_KEY,
  PLAYTEST_TOGGLE_LABEL,
  isPlaytestLoggingEnabled,
  playtestLogFileName,
  playtestSessionId,
  redactErrorMessage,
  resetPlaytestLogForTests,
  setPlaytestLoggingEnabled,
  snapshotPlaytestLog,
  toCsv,
  toJsonl,
  type PlaytestLogEntry,
} from '../playtestLog';
import { storage } from '../storage';
import {
  buyFuel,
  exportPlaytestLog,
  flagPlaytestMoment,
  getSnapshot,
  newGame,
  selectDie,
  setPlaytestLogging,
  signContract,
} from '../store';
import { ErrorBoundary } from '../ErrorBoundary';

// ---------------------------------------------------------------------------
// T-141 · THE OPT-IN PLAYTEST LOG.
//
// The acceptance suite for `docs/PLAYTEST-TELEMETRY_SPEC.md` §8, one case per
// clause. It drives the STORE — the same actions a player's keypress reaches —
// rather than calling the engine or the recorders directly, because the claim
// under test is "the cockpit captures what the player did", and a test that
// called `recordAction` itself would prove only that an array can hold objects.
//
// The suite runs in vitest's `node` environment (see `vitest.config.ts`), so
// there is no DOM: `storage.ts` resolves to its in-memory fallback, and the
// export case hand-builds the three browser globals it needs. That is the same
// discipline `storage.test.ts` already uses with its fake window.
// ---------------------------------------------------------------------------

const SEED = 424242;

/** Put the module-scope preference store and the buffer into a known state.
 *  `storage` here is the in-memory fallback (no `window` in node), which is
 *  exactly the seam the shipped code writes through. */
function resetPlaytest(on: boolean): void {
  setPlaytestLoggingEnabled(on);
  resetPlaytestLogForTests();
}

describe('T-141 · the toggle is a client preference, never save state', () => {
  beforeEach(() => {
    storage.removeItem(PLAYTEST_LOGGING_KEY);
    resetPlaytestLogForTests();
  });

  it('defaults OFF on a virgin profile', () => {
    // Spec §3: "OFF by default." Discharged by the READ (an absent key is not
    // `'on'`), not by a constant someone could forget to apply.
    expect(storage.getItem(PLAYTEST_LOGGING_KEY)).toBeNull();
    expect(isPlaytestLoggingEnabled()).toBe(false);
  });

  it('persists through storage.ts’s KeyValueStore, under the sq. prefix', () => {
    setPlaytestLoggingEnabled(true);
    expect(storage.getItem(PLAYTEST_LOGGING_KEY)).toBe('on');
    expect(isPlaytestLoggingEnabled()).toBe(true);

    setPlaytestLoggingEnabled(false);
    expect(storage.getItem(PLAYTEST_LOGGING_KEY)).toBe('off');
    expect(isPlaytestLoggingEnabled()).toBe(false);

    // The `sq.` prefix is load-bearing: `storage.ts`'s `migrateInto` copies by
    // prefix, so a key outside it would be silently left behind on the web
    // profile when a tester moved to the desktop shell.
    expect(PLAYTEST_LOGGING_KEY.startsWith('sq.')).toBe(true);
  });

  it('a save round-trip carries neither the toggle nor the session id', () => {
    // Spec §3/§8: "asserted by a test that a save round-trip does not carry the
    // toggle." Spec §2 adds the session id to that list — it is per-session and
    // must never be persisted into a career.
    newGame(SEED);
    setPlaytestLogging(true);
    expect(getSnapshot().playtestLogging).toBe(true);

    const envelope = createSave(getSnapshot().game, getSnapshot().seed);
    expect(envelope).not.toContain('playtest');
    expect(envelope).not.toContain(PLAYTEST_LOGGING_KEY);
    expect(envelope).not.toContain(playtestSessionId());

    const loaded = loadSave(envelope);
    expect(JSON.stringify(loaded.state).includes('playtest')).toBe(false);

    // …and the preference survives the round-trip untouched, because it never
    // rode the envelope in the first place.
    expect(storage.getItem(PLAYTEST_LOGGING_KEY)).toBe('on');
    expect(isPlaytestLoggingEnabled()).toBe(true);
  });

  it('does not move CURRENT_SAVE_VERSION', () => {
    // Spec §7: "No save-shape change, no `CURRENT_SAVE_VERSION` bump." This
    // feature adds no `GameState` field, so no migration is owed. A later change
    // that quietly persisted the toggle would have to bump the version, and this
    // is the assertion that would fail first and loudly.
    expect(CURRENT_SAVE_VERSION).toBe(15);
  });
});

describe('T-141 · real actions through applyPlayerAction produce §6-shaped JSONL', () => {
  beforeEach(() => {
    resetPlaytest(true);
    newGame(SEED);
    resetPlaytestLogForTests(); // `newGame` itself takes no PlayerAction
  });

  afterEach(() => {
    resetPlaytest(false);
  });

  it('captures one entry per action, with the day, the action and its events', () => {
    const day = getSnapshot().game.day;

    selectDie(0);
    signContract(0);
    selectDie(1);
    buyFuel(1);

    const entries = snapshotPlaytestLog();
    expect(entries).toHaveLength(2);

    // JSONL: one entry per line, trailing newline, nothing else.
    const lines = toJsonl(entries).split('\n');
    expect(lines).toHaveLength(3); // two records + the trailing empty string
    expect(lines[2]).toBe('');

    const parsed = lines.slice(0, 2).map((line) => JSON.parse(line) as PlaytestLogEntry);

    // Spec §6's shape, EXACTLY: an action line carries these five keys and no
    // others — no empty `note`, no empty `error`.
    for (const entry of parsed) {
      expect(Object.keys(entry).sort()).toEqual(['action', 'day', 'events', 'kind', 'sessionId']);
      expect(entry.kind).toBe('action');
      expect(entry.day).toBe(day); // the PRE-action day, per the recorder
      expect(Array.isArray(entry.events)).toBe(true);
      expect(entry.sessionId).toBe(playtestSessionId());
    }
    // One session id across every line — that is the whole point of §2's
    // per-session correlator.
    expect(new Set(parsed.map((e) => e.sessionId)).size).toBe(1);

    expect(parsed[0].action).toMatchObject({ type: 'Trade', action: 'sign-contract' });
    expect(parsed[1].action).toMatchObject({ type: 'Trade', action: 'buy-fuel', fuelAmount: 1 });
  });

  it('keeps the Settings row’s captured count live, action by action', () => {
    // Reconciled in `set()`, the store's one state-update choke point — so the
    // count a player sees when they open Settings is current, not stale until
    // they touch a control.
    expect(getSnapshot().playtestLogEntries).toBe(0);
    selectDie(0);
    signContract(0);
    expect(getSnapshot().playtestLogEntries).toBe(1);
    selectDie(1);
    buyFuel(1);
    expect(getSnapshot().playtestLogEntries).toBe(2);
  });

  it('captures a REFUSED action too — that is what a playtest log is for', () => {
    selectDie(0);
    signContract(0);
    // Signing a second contract while already carrying one is an engine refusal.
    selectDie(1);
    signContract(0);

    expect(getSnapshot().notice).not.toBeNull(); // the player saw the refusal…

    const entries = snapshotPlaytestLog();
    expect(entries).toHaveLength(2); // …and so does the log
    expect(entries[1].kind).toBe('action');
    expect(entries[1].action).toMatchObject({ type: 'Trade', action: 'sign-contract' });
  });

  it('captures NOTHING at all with logging off', () => {
    // The whole opt-in claim, guarded. Without this case every other assertion
    // here would still pass on a build that captured unconditionally.
    resetPlaytest(false);
    newGame(SEED);
    selectDie(0);
    signContract(0);
    selectDie(1);
    buyFuel(1);
    expect(snapshotPlaytestLog()).toEqual([]);
  });
});

describe('T-141 · the annotation entry kind', () => {
  beforeEach(() => {
    resetPlaytest(true);
    newGame(SEED);
    resetPlaytestLogForTests();
  });

  afterEach(() => {
    resetPlaytest(false);
  });

  it('“flag this moment” appends an annotation with the player’s own words', () => {
    flagPlaytestMoment('the dock UI ate my die');

    const entries = snapshotPlaytestLog();
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(Object.keys(entry).sort()).toEqual(['day', 'kind', 'note', 'sessionId']);
    expect(entry.kind).toBe('annotation');
    expect(entry.note).toBe('the dock UI ate my die');
    expect(entry.day).toBe(getSnapshot().game.day);
    expect(entry.action).toBeUndefined();
    expect(entry.events).toBeUndefined();
    expect(getSnapshot().playtestLogEntries).toBe(1);
  });

  it('an empty note is refused out loud rather than stored as a blank line', () => {
    flagPlaytestMoment('   ');
    expect(snapshotPlaytestLog()).toEqual([]);
    expect(getSnapshot().notice).toContain('note');
  });

  it('with logging off it says why instead of silently dropping the note', () => {
    // The store's "every refusal reaches the player, never a silent no-op" rule.
    resetPlaytest(false);
    flagPlaytestMoment('this would be lost');
    expect(snapshotPlaytestLog()).toEqual([]);
    expect(getSnapshot().notice).toContain('Settings');
  });
});

describe('T-141 · the ErrorBoundary entry kind, and its redaction', () => {
  beforeEach(() => {
    resetPlaytest(true);
    newGame(SEED);
    resetPlaytestLogForTests();
  });

  afterEach(() => {
    resetPlaytest(false);
    vi.restoreAllMocks();
  });

  it('a caught cockpit fault lands as an error entry with no local path in it', () => {
    // Driven through the REAL boundary method React calls, not through the
    // recorder — the claim is that `ErrorBoundary` feeds the log (spec §1).
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boundary = new ErrorBoundary({ children: null });
    boundary.componentDidCatch(new Error('boom at /Users/somebody/Dev/x.ts:12'), {
      componentStack: '\n at Cockpit (/Users/somebody/Dev/App.tsx:3)',
    });
    expect(logged).toHaveBeenCalled(); // the fault is still never swallowed

    const entries = snapshotPlaytestLog();
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(Object.keys(entry).sort()).toEqual(['day', 'error', 'kind', 'sessionId']);
    expect(entry.kind).toBe('error');
    expect(entry.error).toContain('boom');
    // Spec §2/§6: an absolute path embeds the player's OS username.
    expect(entry.error).not.toContain('/Users/somebody');
    expect(entry.error).toContain('<path>');
    // MESSAGE ONLY — the component stack never reaches the log.
    expect(entry.error).not.toContain('Cockpit');
  });

  it('redactErrorMessage strips POSIX, Windows, file:// and http(s) locations', () => {
    expect(redactErrorMessage('failed reading /Users/somebody/Dev/save.sav')).toBe(
      'failed reading <path>',
    );
    expect(redactErrorMessage('failed reading C:\\Users\\somebody\\save.sav')).toBe(
      'failed reading <path>',
    );
    expect(redactErrorMessage('imported file:///Users/somebody/x.js')).toBe('imported <path>');
    expect(redactErrorMessage('GET https://example.test/a/b failed')).toBe('GET <path> failed');
    // Prose survives: this is a blacklist of SHAPES, not a shredder.
    expect(redactErrorMessage('the die and/or the hand was missing')).toBe(
      'the die and/or the hand was missing',
    );
  });

  it('is a no-op when the player never opted in', () => {
    resetPlaytest(false);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    new ErrorBoundary({ children: null }).componentDidCatch(new Error('boom'), {
      componentStack: '',
    });
    expect(snapshotPlaytestLog()).toEqual([]);
  });
});

describe('T-141 · CSV is a flattening of the same JSONL', () => {
  // Hand-built entries rather than a live career, so the golden cannot drift
  // with a content change (spec §6: the CSV is "a converter over the settled
  // JSONL shape, not a second capture path").
  const entries: PlaytestLogEntry[] = [
    {
      sessionId: 's-1',
      day: 3,
      kind: 'action',
      action: { type: 'Trade', action: 'buy-fuel', fuelAmount: 2, spendDie: 1 },
      events: [],
    },
    { sessionId: 's-1', day: 3, kind: 'annotation', note: 'ate my die, "again"' },
    { sessionId: 's-1', day: 4, kind: 'error', error: 'boom' },
  ];

  it('has a fixed header and one row per entry', () => {
    const rows = toCsv(entries).trimEnd().split('\n');
    expect(rows[0]).toBe('sessionId,day,kind,actionType,action,events,note,error');
    expect(rows).toHaveLength(4);
  });

  it('quotes per RFC4180 and lifts actionType into its own column', () => {
    const rows = toCsv(entries).trimEnd().split('\n');
    // The action row: type in its own column, the whole action as quoted JSON.
    expect(rows[1].startsWith('s-1,3,action,Trade,"{')).toBe(true);
    expect(rows[1]).toContain('""type"":""Trade""');
    // The annotation row: an embedded quote is doubled, the field is wrapped.
    expect(rows[2]).toContain('"ate my die, ""again"""');
    // The error row: empty action/events columns rather than absent ones.
    expect(rows[3]).toBe('s-1,4,error,,,,,boom');
  });

  it('an empty log is a header and nothing else — never a zero-byte file', () => {
    expect(toCsv([])).toBe('sessionId,day,kind,actionType,action,events,note,error\n');
    expect(toJsonl([])).toBe('');
  });
});

describe('T-141 · export writes a file, and the feature makes no network call', () => {
  // The three browser globals the export needs, hand-built because this suite
  // runs in vitest's `node` environment (see this file's header).
  const clicks: { href: string; download: string }[] = [];
  const revoked: string[] = [];
  let blobs = new Map<string, Blob>();
  let originals: Record<string, PropertyDescriptor | undefined> = {};

  /** Every transport a "no network" claim has to exclude. Installed as THROWING
   *  spies, so a call would both be counted and fail loudly. */
  const transports = {
    fetch: vi.fn(() => {
      throw new Error('the playtest log must never reach the network');
    }),
    XMLHttpRequest: vi.fn(() => {
      throw new Error('the playtest log must never reach the network');
    }),
    WebSocket: vi.fn(() => {
      throw new Error('the playtest log must never reach the network');
    }),
    sendBeacon: vi.fn(() => {
      throw new Error('the playtest log must never reach the network');
    }),
  };

  function install(name: string, value: unknown): void {
    originals[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }

  beforeEach(() => {
    clicks.length = 0;
    revoked.length = 0;
    blobs = new Map();
    originals = {};
    for (const spy of Object.values(transports)) spy.mockClear();

    install('document', {
      createElement: (tag: string) => {
        expect(tag).toBe('a');
        const anchor = {
          href: '',
          download: '',
          click: () => clicks.push({ href: anchor.href, download: anchor.download }),
        };
        return anchor;
      },
    });
    install('fetch', transports.fetch);
    install('XMLHttpRequest', transports.XMLHttpRequest);
    install('WebSocket', transports.WebSocket);
    install('navigator', { sendBeacon: transports.sendBeacon });

    // Bound rather than plucked: `URL.createObjectURL` is a method, and lifting
    // it off the object bare is exactly what `@typescript-eslint/unbound-method`
    // exists to stop.
    const createObjectURL = URL.createObjectURL.bind(URL);
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    originals['__url'] = { value: { createObjectURL, revokeObjectURL } };
    URL.createObjectURL = (blob: Blob): string => {
      const url = `blob:playtest-${blobs.size}`;
      blobs.set(url, blob);
      return url;
    };
    URL.revokeObjectURL = (url: string): void => {
      revoked.push(url);
    };

    resetPlaytest(true);
    newGame(SEED);
    resetPlaytestLogForTests();
  });

  afterEach(() => {
    const url = originals['__url']?.value as {
      createObjectURL: typeof URL.createObjectURL;
      revokeObjectURL: typeof URL.revokeObjectURL;
    };
    URL.createObjectURL = url.createObjectURL;
    URL.revokeObjectURL = url.revokeObjectURL;
    for (const [name, descriptor] of Object.entries(originals)) {
      if (name === '__url') continue;
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    }
    resetPlaytest(false);
  });

  it('downloads the JSONL bytes, revokes the URL, and touches no transport', async () => {
    selectDie(0);
    signContract(0);
    const entries = snapshotPlaytestLog();
    expect(entries.length).toBeGreaterThan(0);

    exportPlaytestLog('json');

    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe(playtestLogFileName('json', entries.length));
    expect(clicks[0].download.endsWith('.jsonl')).toBe(true);
    await expect(blobs.get(clicks[0].href)!.text()).resolves.toBe(toJsonl(entries));

    // The object URL is revoked on the next tick, exactly as `exportCareer` does.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revoked).toEqual([clicks[0].href]);

    for (const spy of Object.values(transports)) expect(spy).not.toHaveBeenCalled();
  });

  it('downloads the CSV flattening of the same entries, still with no transport', async () => {
    selectDie(0);
    signContract(0);
    const entries = snapshotPlaytestLog();

    exportPlaytestLog('csv');

    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe(playtestLogFileName('csv', entries.length));
    expect(clicks[0].download.endsWith('.csv')).toBe(true);
    await expect(blobs.get(clicks[0].href)!.text()).resolves.toBe(toCsv(entries));

    for (const spy of Object.values(transports)) expect(spy).not.toHaveBeenCalled();
  });

  it('refuses to write an empty file, and says why', () => {
    exportPlaytestLog('json');
    expect(clicks).toEqual([]);
    expect(getSnapshot().notice).toContain('Nothing captured');
  });
});

describe('T-141 · the disclosure copy is settled by the spec', () => {
  it('matches §3 word for word', () => {
    // SETTLED BY `docs/PLAYTEST-TELEMETRY_SPEC.md` §3 (and its preamble). This is
    // the promise the player is shown before opting in, so it is pinned here and
    // MAY NOT be edited to make a test pass — if the capture ever grows beyond
    // gameplay actions, the spec changes first and this string with it.
    expect(PLAYTEST_DISCLOSURE).toBe(
      'Gameplay actions only — no personally identifying information, no location.',
    );
    expect(PLAYTEST_TOGGLE_LABEL).toBe('Enable Playtest Logging');
  });

  it('is the string App.tsx actually renders, by import and not by retyping', () => {
    // The constant is only a promise if the Settings row reads it. `App.tsx`
    // imports both names; a re-typed literal there could drift from the spec
    // without failing anything above, so this asserts the import AND the absence
    // of a hand-copied sentence.
    const app = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx'),
      'utf8',
    );
    expect(app).toContain("from './playtestLog'");
    expect(app).toContain('{PLAYTEST_DISCLOSURE}');
    expect(app).toContain('{PLAYTEST_TOGGLE_LABEL}');
    expect(app).not.toContain('no personally identifying information');
    // …and the row is reachable: the toggle, the flag control and both export
    // buttons all carry the handles a spec asserts on.
    for (const id of [
      'set-playtest-logging',
      'playtest-disclosure',
      'playtest-flag',
      'playtest-export-json',
      'playtest-export-csv',
    ]) {
      expect(app).toContain(`data-testid="${id}"`);
    }
  });
});
