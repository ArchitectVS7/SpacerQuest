import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COMPILED_STEAM_APP_ID,
  createRecordingClient,
  initSteam,
  resolveAppId,
  resolveFakeLogPath,
  type SteamClientLike,
  type SteamHost,
} from '../steam';

// ---------------------------------------------------------------------------
// T-1702a · The Steamworks core.
//
// "The graceful no-Steam fallback designed in from the start" and "the app runs
// identically without Steam present" are the acceptance criteria, and they are
// asserted here as BEHAVIOUR on a recording fake — not by reading the source. A
// module that merely happened not to crash today, or that called the loader
// before deciding it had no app id, would pass an inspection and fail this file.
//
// Runs with NO Electron binary AND NO native Steam binary (the last test in this
// file pins the first half), so CI's `Build, lint, test` job keeps running
// `npm test` under `ELECTRON_SKIP_BINARY_DOWNLOAD: 1`. Same discipline as
// `saveStore.test.ts` and `updater.test.ts`.
// ---------------------------------------------------------------------------

interface FakeClient extends SteamClientLike {
  /** Every call made on this object, in order. The whole point of the fake. */
  readonly calls: string[];
}

function fakeClient(
  opts: {
    activated?: string[];
    refuse?: boolean;
    throwOnActivate?: boolean;
    throwOnIsActivated?: boolean;
  } = {},
): FakeClient {
  const calls: string[] = [];
  const activated = new Set(opts.activated ?? []);
  return {
    calls,
    achievement: {
      isActivated(name: string) {
        calls.push(`isActivated:${name}`);
        if (opts.throwOnIsActivated) throw new Error('native isActivated exploded');
        return activated.has(name);
      },
      activate(name: string) {
        calls.push(`activate:${name}`);
        if (opts.throwOnActivate) throw new Error('native activate exploded');
        if (opts.refuse) return false;
        activated.add(name);
        return true;
      },
    },
  };
}

/** A host whose `load` records every call, so "never called" is provable. */
function hostFor(
  over: {
    isPackaged?: boolean;
    env?: Record<string, string | undefined>;
    load?: SteamHost['load'];
  } = {},
): SteamHost & { loads: number[]; logged: string[] } {
  const loads: number[] = [];
  const logged: string[] = [];
  return {
    isPackaged: over.isPackaged ?? true,
    env: over.env ?? {},
    loads,
    logged,
    load(appId: number) {
      loads.push(appId);
      return over.load ? over.load(appId) : null;
    },
    log: (message) => logged.push(message),
  };
}

const SANDBOX = { SQ_STEAM_APP_ID: '480' } as const;

describe('T-1702a · resolveAppId — no id is compiled in', () => {
  it('COMPILED_STEAM_APP_ID is null, so no build this repo produces talks to Steam', () => {
    // A guard, not a tautology: an app id committed here would make every dev
    // build (and every packaged build) try to initialise against a real Steam
    // product. The partner id arrives with the store page, T-1704.
    expect(COMPILED_STEAM_APP_ID).toBeNull();
  });

  it('reads SQ_STEAM_APP_ID — the Spacewar dev sandbox is 480', () => {
    expect(resolveAppId(hostFor({ env: { ...SANDBOX } }))).toBe(480);
  });

  it('treats a blank, non-numeric, fractional or non-positive value as ABSENT', () => {
    // A blank env var is how a CI matrix says "not this one", and `init(0)` /
    // `init(NaN)` would be a call into the native layer with garbage.
    for (const raw of ['', '   ', 'spacewar', '0', '-1', '4.8', 'NaN', '1e3x']) {
      expect(resolveAppId(hostFor({ env: { SQ_STEAM_APP_ID: raw } }))).toBeNull();
    }
  });
});

describe('T-1702a · initSteam — the graceful no-Steam fallback (the Accept)', () => {
  it('with NO app id it never touches the loader at all', () => {
    const host = hostFor();
    const session = initSteam(host);

    expect(session.status).toEqual({ state: 'unavailable', reason: 'no-app-id', appId: null });
    // THE ASSERTION THAT MATTERS: `require('steamworks.js')` throws by itself on
    // an unsupported OS/arch, so a build with no app id must not so much as
    // reach the loader. Asserted as an empty call log, not by reading the code.
    expect(host.loads).toEqual([]);
  });

  it('a loader that THROWS degrades to unavailable, logs, and never propagates', () => {
    // This is the whole "designed in from the start" fallback: a missing
    // optional dependency, a native ABI mismatch, an unsupported OS/arch and a
    // Steam client that is not running are ALL throws, and all the same answer.
    const host = hostFor({
      env: { ...SANDBOX },
      load: () => {
        throw new Error("Cannot find module 'steamworks.js'");
      },
    });

    let session!: ReturnType<typeof initSteam>;
    expect(() => {
      session = initSteam(host);
    }).not.toThrow();

    expect(session.status).toEqual({ state: 'unavailable', reason: 'load-failed', appId: null });
    expect(host.logged.join(' ')).toContain('steamworks.js');
  });

  it('a loader that declines without throwing is unavailable too', () => {
    const host = hostFor({ env: { ...SANDBOX }, load: () => null });
    expect(initSteam(host).status).toEqual({
      state: 'unavailable',
      reason: 'not-loaded',
      appId: null,
    });
    expect(host.loads).toEqual([480]);
  });

  it('an unavailable session still ANSWERS unlock — no null to check, no throw', () => {
    const session = initSteam(hostFor());
    expect(session.unlock('DEED_FIRST_MANIFEST')).toBe('unavailable');
    expect(() => session.unlock('DEED_FIRST_MANIFEST')).not.toThrow();
  });

  it('initialises against the resolved app id when the loader succeeds', () => {
    const client = fakeClient();
    const host = hostFor({ env: { ...SANDBOX }, load: () => client });
    const session = initSteam(host);

    expect(session.status).toEqual({ state: 'ready', reason: 'init', appId: 480 });
    expect(host.loads).toEqual([480]);
    // Initialising must not unlock anything by itself.
    expect(client.calls).toEqual([]);
  });
});

describe('T-1702a · unlock — honest results, and never a throw', () => {
  it('unlocks a fresh achievement', () => {
    const client = fakeClient();
    const session = initSteam(hostFor({ env: { ...SANDBOX }, load: () => client }));

    expect(session.unlock('DEED_DEBT_FIRST_PAYMENT')).toBe('unlocked');
    expect(client.calls).toEqual([
      'isActivated:DEED_DEBT_FIRST_PAYMENT',
      'activate:DEED_DEBT_FIRST_PAYMENT',
    ]);
  });

  it('skips the native call when Steam already holds it — the backfill dedupe', () => {
    // Without this, a 44-deed veteran makes 44 redundant native calls on EVERY
    // boot, because the cockpit backfills its whole earned set at every career
    // entry point.
    const client = fakeClient({ activated: ['DEED_FIRST_MANIFEST'] });
    const session = initSteam(hostFor({ env: { ...SANDBOX }, load: () => client }));

    expect(session.unlock('DEED_FIRST_MANIFEST')).toBe('already');
    expect(client.calls).toEqual(['isActivated:DEED_FIRST_MANIFEST']);
    expect(client.calls).not.toContain('activate:DEED_FIRST_MANIFEST');
  });

  it('reports a Steam REFUSAL honestly instead of folding it into success', () => {
    // The ordinary cause is an API name the partner backend does not define —
    // exactly what our names are under Spacewar (480). "It reached Steam and
    // Steam said no" is the single most useful thing this layer can report, so
    // it is a distinct result and it is logged.
    const client = fakeClient({ refuse: true });
    const host = hostFor({ env: { ...SANDBOX }, load: () => client });
    const session = initSteam(host);

    expect(session.unlock('DEED_FIRST_MANIFEST')).toBe('rejected');
    expect(host.logged.join(' ')).toContain('rejected by Steam: DEED_FIRST_MANIFEST');
  });

  it('a THROWING activate degrades to rejected rather than crashing the main process', () => {
    const client = fakeClient({ throwOnActivate: true });
    const session = initSteam(hostFor({ env: { ...SANDBOX }, load: () => client }));

    let result;
    expect(() => {
      result = session.unlock('DEED_FIRST_MANIFEST');
    }).not.toThrow();
    expect(result).toBe('rejected');
  });

  it('a THROWING isActivated falls through to activate rather than losing the unlock', () => {
    // A redundant activate is harmless; a swallowed unlock is not.
    const client = fakeClient({ throwOnIsActivated: true });
    const host = hostFor({ env: { ...SANDBOX }, load: () => client });
    const session = initSteam(host);

    expect(session.unlock('DEED_FIRST_MANIFEST')).toBe('unlocked');
    expect(client.calls).toContain('activate:DEED_FIRST_MANIFEST');
    expect(host.logged.join(' ')).toContain('isActivated');
  });
});

// ---------------------------------------------------------------------------
// The test-only recording client, and the guard that keeps it out of a package.
// ---------------------------------------------------------------------------

describe('T-1702a · the recording client (test-only)', () => {
  const scratch: string[] = [];
  afterEach(() => {
    for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function logPath(): string {
    const dir = mkdtempSync(join(tmpdir(), 'sq-steam-'));
    scratch.push(dir);
    return join(dir, 'steam.jsonl');
  }

  it('is REFUSED when the build is packaged, whatever the environment says', () => {
    // A packaged build that could be talked into a fake Steam client by an env
    // var is a packaged build whose achievement state an attacker can redirect
    // into a file of their choosing — and the packaged e2e's whole job is to
    // prove the REAL path.
    expect(
      resolveFakeLogPath(hostFor({ isPackaged: true, env: { SQ_STEAM_FAKE: '/tmp/x' } })),
    ).toBeNull();
  });

  it('is used only when the flag is set on a dev build', () => {
    expect(resolveFakeLogPath(hostFor({ isPackaged: false, env: {} }))).toBeNull();
    expect(
      resolveFakeLogPath(hostFor({ isPackaged: false, env: { SQ_STEAM_FAKE: '  ' } })),
    ).toBeNull();
    expect(
      resolveFakeLogPath(hostFor({ isPackaged: false, env: { SQ_STEAM_FAKE: '/tmp/x' } })),
    ).toBe('/tmp/x');
  });

  it('records to JSONL and answers isActivated from its own log, so the dedupe is real', () => {
    const path = logPath();
    const client = createRecordingClient(path);
    const session = initSteam(hostFor({ env: { ...SANDBOX }, load: () => client }));

    expect(session.unlock('DEED_FIRST_MANIFEST')).toBe('unlocked');
    expect(session.unlock('RANK_CONQUEROR')).toBe('unlocked');
    // A fresh session over the SAME log sees the earlier unlocks — which is what
    // the e2e's relaunch/backfill assertion depends on.
    const second = initSteam(
      hostFor({ env: { ...SANDBOX }, load: () => createRecordingClient(path) }),
    );
    expect(second.unlock('DEED_FIRST_MANIFEST')).toBe('already');

    const lines = readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => (JSON.parse(l) as { achievement: string }).achievement);
    expect(lines).toEqual(['DEED_FIRST_MANIFEST', 'RANK_CONQUEROR']);
  });

  it('an unwritable log is a rejected unlock, never a throw', () => {
    // Same rule as the real path: a test harness that cannot write its log must
    // not be able to fail a player's action.
    const client = createRecordingClient(join(tmpdir(), 'sq-steam-nope', 'nested', 'steam.jsonl'));
    const session = initSteam(hostFor({ env: { ...SANDBOX }, load: () => client }));
    expect(session.unlock('DEED_FIRST_MANIFEST')).toBe('rejected');
  });
});

describe('T-1702a · structural guard', () => {
  it('steam.ts imports no electron and no steamworks.js — so this suite needs neither', () => {
    // Same precedent (and same purpose) as `updater.test.ts`'s scan. The
    // steamworks.js half is the load-bearing one: it is an OPTIONAL dependency,
    // so an `import` (even `import type`) here would be a hard compile error the
    // moment that optional install is skipped — which is precisely the state
    // this module exists to support. The single guarded `require` lives in
    // `main.ts`. `__dirname`, not `import.meta.url`: this package emits CJS.
    const source = readFileSync(join(__dirname, '..', 'steam.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+['"]electron['"]/);
    expect(source).not.toMatch(/require\(\s*['"]electron['"]\s*\)/);
    expect(source).not.toMatch(/['"]steamworks\.js['"]/);
  });
});
