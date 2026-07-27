import { describe, expect, it } from 'vitest';
import {
  PRESENCE_DISPLAY_TOKEN,
  initPresence,
  type PresenceClientLike,
  type PresenceHost,
} from '../presence';

// ---------------------------------------------------------------------------
// T-1702b · Steam rich presence.
//
// "Rich presence shows current system/day" and "the no-Steam fallback still
// clean" are the acceptance criteria. The e2e proves the values reach the far
// side of the REAL IPC bridge in the REAL main process and MOVE when the player
// ends a day; this file pins the exact Steamworks key set, the dedupe, and every
// way a hostile or broken payload can arrive — which an e2e cannot produce
// without a hostile renderer.
//
// No Electron binary, no native Steam binary. Same discipline as `steam.test.ts`.
// ---------------------------------------------------------------------------

interface FakeClient extends PresenceClientLike {
  readonly calls: { key: string; value: string | null }[];
}

function fakeClient(opts: { throws?: boolean } = {}): FakeClient {
  const calls: { key: string; value: string | null }[] = [];
  return {
    calls,
    setRichPresence(key, value) {
      calls.push({ key, value: value ?? null });
      if (opts.throws) throw new Error('native setRichPresence exploded');
    },
  };
}

function hostFor(client: PresenceClientLike | null): PresenceHost & { logged: string[] } {
  const logged: string[] = [];
  return { client, logged, log: (message) => logged.push(message) };
}

describe('T-1702b · initPresence — the no-Steam path is not an error path', () => {
  it('with no client, `set` answers `unavailable` and nothing is attempted', () => {
    const session = initPresence(hostFor(null));
    expect(session.state).toBe('unavailable');
    expect(session.set('Sol', 1)).toBe('unavailable');
    expect(() => session.set('Sol', 1)).not.toThrow();
    expect(() => session.clear()).not.toThrow();
  });

  it('a binding with no setRichPresence degrades rather than throwing on first use', () => {
    const ancient = {} as unknown as PresenceClientLike;
    const host = hostFor(ancient);
    const session = initPresence(host);
    expect(session.state).toBe('unavailable');
    expect(session.set('Sol', 1)).toBe('unavailable');
    expect(host.logged.join(' ')).toContain('rich presence');
  });
});

describe('T-1702b · set — the exact Steamworks contract', () => {
  it('publishes the two custom keys AND the steam_display token, in order', () => {
    // The partner-site configuration has to match this list exactly, which is why
    // it is asserted as an ordered call log rather than a set. `steam_display`
    // pointing at a localization token is the ONLY supported way to show a
    // rich-presence string — there is no "send a sentence" API.
    const client = fakeClient();
    const session = initPresence(hostFor(client));

    expect(session.set('Aldebaran-1', 12)).toBe('published');
    expect(client.calls).toEqual([
      { key: 'system', value: 'Aldebaran-1' },
      { key: 'day', value: '12' },
      { key: 'steam_display', value: PRESENCE_DISPLAY_TOKEN },
    ]);
    expect(PRESENCE_DISPLAY_TOKEN).toBe('#Status_InSystem');
  });

  it('DEDUPES on the system|day pair, and republishes when either moves', () => {
    // `store.ts` calls this from its one state-update choke point, so it fires on
    // every UI-only patch. Without the dedupe that is pointless native traffic
    // several times a second. Reported as `unchanged` so the test can ASSERT it
    // rather than infer it from a call count.
    const client = fakeClient();
    const session = initPresence(hostFor(client));

    expect(session.set('Sol', 1)).toBe('published');
    expect(session.set('Sol', 1)).toBe('unchanged');
    expect(client.calls).toHaveLength(3);

    expect(session.set('Sol', 2)).toBe('published'); // the day moved
    expect(client.calls).toHaveLength(6);
    expect(session.set('Aldebaran-1', 2)).toBe('published'); // the system moved
    expect(client.calls).toHaveLength(9);
  });
});

describe('T-1702b · set — validation drops, and never throws', () => {
  // Control characters are built with `String.fromCharCode` rather than typed
  // as literals or as a regex class, for the reason `presence.ts` states at
  // `hasControlChars`: neither survives a copy-paste intact.
  const BAD_SYSTEMS = [
    '', // empty
    'x'.repeat(300), // far past the bound (Steamworks caps a value at 256 bytes)
    'x'.repeat(65), // one over the bound, so the bound is really the bound
    `Sol${String.fromCharCode(10)}Aldebaran`, // a newline
    `Sol${String.fromCharCode(0)}Aldebaran`, // a NUL byte
    `Sol${String.fromCharCode(127)}`, // DEL
  ];
  const BAD_DAYS = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53];

  it('refuses a bad system name, silently, and never publishes', () => {
    // This string arrives FROM THE RENDERER and is going to a native library —
    // the `SAFE_ACHIEVEMENT` / `SAFE_KEY` discipline. `main.ts` validates too;
    // that guard is about the process, this one is about the native call.
    for (const system of BAD_SYSTEMS) {
      const client = fakeClient();
      const host = hostFor(client);
      const session = initPresence(host);
      let result;
      expect(() => {
        result = session.set(system, 1);
      }).not.toThrow();
      expect(result).toBe('rejected');
      expect(client.calls).toEqual([]);
      expect(host.logged.length).toBeGreaterThan(0);
    }
  });

  it('refuses a day that is not a positive safe integer', () => {
    for (const day of BAD_DAYS) {
      const client = fakeClient();
      const session = initPresence(hostFor(client));
      let result;
      expect(() => {
        result = session.set('Sol', day);
      }).not.toThrow();
      expect(result).toBe('rejected');
      expect(client.calls).toEqual([]);
    }
  });

  it('a THROWING setRichPresence degrades to rejected rather than crashing main', () => {
    const client = fakeClient({ throws: true });
    const host = hostFor(client);
    const session = initPresence(host);

    let result;
    expect(() => {
      result = session.set('Sol', 1);
    }).not.toThrow();
    expect(result).toBe('rejected');
    expect(host.logged.join(' ')).toContain('setRichPresence failed');
    // `last` was NOT updated, so the next call retries rather than silently
    // deduping against a publish that never happened.
    expect(session.set('Sol', 1)).toBe('rejected');
    expect(client.calls.length).toBeGreaterThan(1);
  });
});

describe('T-1702b · clear — a stale line must not outlive the process', () => {
  it('nulls all three keys on a ready session', () => {
    const client = fakeClient();
    const session = initPresence(hostFor(client));
    session.set('Sol', 1);
    client.calls.length = 0;

    session.clear();

    expect(client.calls).toEqual([
      { key: 'system', value: null },
      { key: 'day', value: null },
      { key: 'steam_display', value: null },
    ]);
  });

  it('is a no-op on an unavailable session, and never throws from before-quit', () => {
    expect(() => initPresence(hostFor(null)).clear()).not.toThrow();

    // A throw here would abort the rest of the `before-quit` emit — the exact
    // shape of the T-1701a `closed`-handler bug that left the process resident.
    const session = initPresence(hostFor(fakeClient({ throws: true })));
    expect(() => session.clear()).not.toThrow();
  });

  it('forgets the dedupe, so the next publish after a clear really publishes', () => {
    const client = fakeClient();
    const session = initPresence(hostFor(client));
    session.set('Sol', 1);
    session.clear();
    client.calls.length = 0;

    expect(session.set('Sol', 1)).toBe('published');
    expect(client.calls).toHaveLength(3);
  });
});
