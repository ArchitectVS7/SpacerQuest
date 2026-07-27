import { describe, expect, it } from 'vitest';
import {
  CLOUD_FLUSH_MS,
  initCloud,
  isCloudCarried,
  type CloudClientLike,
  type CloudHost,
} from '../cloud';

// ---------------------------------------------------------------------------
// T-1702b · Steam Cloud.
//
// "Cloud round-trip verified in the dev sandbox" and "the no-Steam fallback still
// clean" are the acceptance criteria; the e2e proves the round trip end to end
// through a real Electron window, and THIS file proves the parts an e2e cannot
// reach without breaking a real cloud on purpose: the conflict policy, the
// per-name isolation, the coalescing arithmetic, and every way the native layer
// can misbehave.
//
// Runs with NO Electron binary AND NO native Steam binary (the structural scan in
// `steam.test.ts` pins that), so CI's `Build, lint, test` job keeps running under
// `ELECTRON_SKIP_BINARY_DOWNLOAD: 1`. Same discipline as `steam.test.ts`.
// ---------------------------------------------------------------------------

interface FakeCloud extends CloudClientLike {
  /** Every call made on this object, in order. The whole point of the fake. */
  readonly calls: string[];
  readonly files: Map<string, string>;
}

function fakeCloud(
  opts: {
    files?: Record<string, string>;
    enabledForApp?: boolean;
    enabledForAccount?: boolean;
    throwOnEnabled?: boolean;
    throwOnExists?: (name: string) => boolean;
    throwOnRead?: (name: string) => boolean;
    throwOnWrite?: boolean;
    refuseWrite?: boolean;
  } = {},
): FakeCloud {
  const calls: string[] = [];
  const files = new Map(Object.entries(opts.files ?? {}));
  return {
    calls,
    files,
    isEnabledForApp() {
      calls.push('isEnabledForApp');
      if (opts.throwOnEnabled) throw new Error('native isEnabledForApp exploded');
      return opts.enabledForApp ?? true;
    },
    isEnabledForAccount() {
      calls.push('isEnabledForAccount');
      return opts.enabledForAccount ?? true;
    },
    fileExists(name) {
      calls.push(`fileExists:${name}`);
      if (opts.throwOnExists?.(name)) throw new Error(`native fileExists exploded: ${name}`);
      return files.has(name);
    },
    readFile(name) {
      calls.push(`readFile:${name}`);
      if (opts.throwOnRead?.(name)) throw new Error(`native readFile exploded: ${name}`);
      return files.get(name) ?? '';
    },
    writeFile(name, content) {
      calls.push(`writeFile:${name}`);
      if (opts.throwOnWrite) throw new Error('native writeFile exploded');
      if (opts.refuseWrite) return false;
      files.set(name, content);
      return true;
    },
  };
}

interface FakeHost extends CloudHost {
  readonly local: Map<string, string>;
  /** Every local write, in order — so "never called for that name" is provable
   *  from a log rather than inferred from an absence. */
  readonly writes: string[];
  readonly logged: string[];
  /** Every `schedule` call. The coalescing win is asserted as this being 1. */
  readonly scheduled: number[];
  /** Run whatever was armed, as the main process's `setTimeout` would. */
  runTimers(): void;
}

function hostFor(
  over: {
    client?: CloudClientLike | null;
    local?: Record<string, string>;
    failRead?: (name: string) => boolean;
    failWrite?: (name: string) => boolean;
    failSchedule?: boolean;
  } = {},
): FakeHost {
  const local = new Map(Object.entries(over.local ?? {}));
  const writes: string[] = [];
  const logged: string[] = [];
  const scheduled: number[] = [];
  const armed: (() => void)[] = [];
  return {
    client: over.client ?? null,
    local,
    writes,
    logged,
    scheduled,
    readLocal(name) {
      if (over.failRead?.(name)) throw new Error(`blocked read: ${name}`);
      return local.get(name) ?? null;
    },
    writeLocal(name, content) {
      if (over.failWrite?.(name)) throw new Error(`blocked write: ${name}`);
      writes.push(name);
      local.set(name, content);
    },
    schedule(run, ms) {
      if (over.failSchedule) throw new Error('no timers here');
      scheduled.push(ms);
      armed.push(run);
    },
    log: (message) => logged.push(message),
    runTimers() {
      for (const run of armed.splice(0)) run();
    },
  };
}

const AUTOSAVE = '{"v":8,"seed":1702,"game":{}}';

describe('T-1702b · isCloudCarried — the allowlist, and the exclusions that matter', () => {
  it('carries the autosave, the three slots and their display meta', () => {
    // The meta is carried because WITHOUT it a restored slot renders as "Empty" —
    // a half-restore the player reads as data loss.
    for (const name of [
      'sq.save.v1',
      'sq.slot.1.v1',
      'sq.slot.2.v1',
      'sq.slot.3.v1',
      'sq.slot.1.meta',
      'sq.slot.3.meta',
    ]) {
      expect(isCloudCarried(name)).toBe(true);
    }
  });

  it('NEVER carries the localStorage-migration marker — syncing it is career loss', () => {
    // THE test that justifies an allowlist over "mirror every sq. key". This
    // marker is MACHINE-LOCAL: syncing it down would make a fresh machine skip
    // its own localStorage import, and the player's browser career would never
    // arrive. That is a career-loss bug, not untidiness.
    expect(isCloudCarried('sq.migrated.from-localstorage.v1')).toBe(false);
  });

  it('never carries the quarantine blob, settings, the mixer or a bogus slot', () => {
    for (const name of [
      'sq.save.v1.corrupt', // syncing damage to every machine defeats quarantine
      'sq.save.seed',
      'sq.fx',
      'sq.vol.master',
      'sq.audio.muted',
      'sq.reduced-motion',
      'sq.text-size',
      'sq.onboarding.v1',
      'sq.slot.4.v1', // there are three slots
      'sq.slot.0.meta',
      'sq.save.v2',
      'not-sq.thing',
    ]) {
      expect(isCloudCarried(name)).toBe(false);
    }
  });
});

describe('T-1702b · initCloud — the status order is the contract', () => {
  it('no client at all is `no-steam`, and nothing is attempted', () => {
    const host = hostFor({ client: null, local: {} });
    const session = initCloud(host);
    expect(session.status.state).toBe('unavailable');
    expect(session.status.reason).toBe('no-steam');
    expect(session.status.restored).toEqual([]);
    expect(host.writes).toEqual([]);
  });

  it('a binding with no cloud namespace is `no-binding`, not a crash', () => {
    // A steamworks.js older than 0.4 hands us a client without `cloud`. The
    // optional members on `SteamClientLike` exist so this degrades.
    const half = { isEnabledForAccount: () => true } as unknown as CloudClientLike;
    const session = initCloud(hostFor({ client: half }));
    expect(session.status).toMatchObject({ state: 'unavailable', reason: 'no-binding' });
  });

  it('the app-level switch is reported distinctly from the account-level one', () => {
    const app = initCloud(hostFor({ client: fakeCloud({ enabledForApp: false }) }));
    expect(app.status).toMatchObject({ state: 'unavailable', reason: 'disabled-for-app' });

    const account = initCloud(hostFor({ client: fakeCloud({ enabledForAccount: false }) }));
    expect(account.status).toMatchObject({
      state: 'unavailable',
      reason: 'disabled-for-account',
    });
  });

  it('an enabled client with nothing in the cloud is `ready` with nothing restored', () => {
    const session = initCloud(hostFor({ client: fakeCloud() }));
    expect(session.status).toMatchObject({ state: 'ready', reason: 'ready' });
    expect(session.status.restored).toEqual([]);
  });

  it('NEVER THROWS when the native layer explodes, and still returns a usable session', () => {
    // The `initSteam` pattern: a storefront feature must not be able to take the
    // app down at boot.
    const enabled = hostFor({ client: fakeCloud({ throwOnEnabled: true }) });
    let session!: ReturnType<typeof initCloud>;
    expect(() => {
      session = initCloud(enabled);
    }).not.toThrow();
    expect(session.status.state).toBe('unavailable');
    expect(() => session.mark('sq.save.v1')).not.toThrow();
    expect(() => session.flush()).not.toThrow();

    const exists = hostFor({ client: fakeCloud({ throwOnExists: () => true }) });
    expect(() => initCloud(exists)).not.toThrow();

    const read = hostFor({
      client: fakeCloud({ files: { 'sq.save.v1': AUTOSAVE }, throwOnRead: () => true }),
    });
    expect(() => initCloud(read)).not.toThrow();
    expect(read.writes).toEqual([]);
  });

  it('a blocked LOCAL store cannot take the boot down either', () => {
    const host = hostFor({
      client: fakeCloud({ files: { 'sq.save.v1': AUTOSAVE } }),
      failRead: () => true,
    });
    let session!: ReturnType<typeof initCloud>;
    expect(() => {
      session = initCloud(host);
    }).not.toThrow();
    expect(session.status.restored).toEqual([]);
  });
});

describe('T-1702b · the restore — semantic 3, proved', () => {
  it('SKIPS a name the local store already holds — a career in progress always wins', () => {
    // `storage.ts`'s `migrateInto` SEMANTIC 3, applied to a second medium: "a
    // desktop career already in progress beats a stale browser one". Asserted
    // from the write LOG, not inferred from the resulting value.
    const host = hostFor({
      client: fakeCloud({ files: { 'sq.save.v1': 'THE CLOUD COPY' } }),
      local: { 'sq.save.v1': 'THE LOCAL CAREER' },
    });

    const session = initCloud(host);

    expect(host.writes).not.toContain('sq.save.v1');
    expect(host.local.get('sq.save.v1')).toBe('THE LOCAL CAREER');
    expect(session.status.restored).toEqual([]);
  });

  it('PULLS a name the local store lacks, byte for byte', () => {
    // The envelope-integrity half of the Accept at unit level: what lands locally
    // is what the cloud held, unchanged — this module never inspects a byte.
    const host = hostFor({
      client: fakeCloud({ files: { 'sq.save.v1': AUTOSAVE, 'sq.slot.2.meta': '{"day":3}' } }),
    });

    const session = initCloud(host);

    expect(session.status.restored).toEqual(['sq.save.v1', 'sq.slot.2.meta']);
    expect(host.local.get('sq.save.v1')).toBe(AUTOSAVE);
    expect(host.local.get('sq.slot.2.meta')).toBe('{"day":3}');
  });

  it('restores the OTHER names when one explodes — slot 2 must not cost you slot 1', () => {
    const host = hostFor({
      client: fakeCloud({
        files: {
          'sq.save.v1': AUTOSAVE,
          'sq.slot.1.v1': 'slot one',
          'sq.slot.2.v1': 'slot two',
        },
        throwOnRead: (name) => name === 'sq.slot.2.v1',
      }),
    });

    const session = initCloud(host);

    expect(session.status.restored).toEqual(['sq.save.v1', 'sq.slot.1.v1']);
    expect(host.local.has('sq.slot.2.v1')).toBe(false);
    expect(host.logged.join(' ')).toContain('sq.slot.2.v1');
  });

  it('an empty cloud entry is not a save — writing it would break a fresh boot', () => {
    const host = hostFor({ client: fakeCloud({ files: { 'sq.save.v1': '' } }) });
    const session = initCloud(host);
    expect(session.status.restored).toEqual([]);
    expect(host.writes).toEqual([]);
  });
});

describe('T-1702b · mark + flush — coalescing, and never a throw', () => {
  it('arms the schedule ONCE however often a key is marked, and writes once', () => {
    // `store.ts` autosaves after EVERY mutating action, so an uncoalesced 1:1
    // upload would be ~200 cloud writes of a ~10.9 MiB save in a sitting.
    const cloud = fakeCloud();
    const host = hostFor({ client: cloud, local: { 'sq.save.v1': AUTOSAVE } });
    const session = initCloud(host);

    for (let i = 0; i < 50; i += 1) session.mark('sq.save.v1');

    expect(host.scheduled).toEqual([CLOUD_FLUSH_MS]);
    host.runTimers();
    expect(cloud.calls.filter((c) => c.startsWith('writeFile'))).toEqual(['writeFile:sq.save.v1']);
    expect(cloud.files.get('sq.save.v1')).toBe(AUTOSAVE);
  });

  it('flushes the CURRENT bytes, not a copy captured when the key was marked', () => {
    // Between the mark and the flush the player has usually acted several more
    // times; the cloud must hold what the disk holds.
    const cloud = fakeCloud();
    const host = hostFor({ client: cloud, local: { 'sq.save.v1': 'day one' } });
    const session = initCloud(host);

    session.mark('sq.save.v1');
    host.local.set('sq.save.v1', 'day forty');
    session.flush();

    expect(cloud.files.get('sq.save.v1')).toBe('day forty');
  });

  it('re-arms after a flush, so a later action still syncs', () => {
    const cloud = fakeCloud();
    const host = hostFor({ client: cloud, local: { 'sq.save.v1': 'a' } });
    const session = initCloud(host);

    session.mark('sq.save.v1');
    host.runTimers();
    host.local.set('sq.save.v1', 'b');
    session.mark('sq.save.v1');
    expect(host.scheduled).toEqual([CLOUD_FLUSH_MS, CLOUD_FLUSH_MS]);
    host.runTimers();
    expect(cloud.files.get('sq.save.v1')).toBe('b');
  });

  it('marks nothing — and arms nothing — for a key that does not ride the cloud', () => {
    const cloud = fakeCloud();
    const host = hostFor({ client: cloud, local: { 'sq.fx': 'off' } });
    const session = initCloud(host);

    session.mark('sq.fx');
    session.mark('sq.migrated.from-localstorage.v1');
    session.mark('sq.save.v1.corrupt');

    expect(host.scheduled).toEqual([]);
    session.flush();
    expect(cloud.calls.filter((c) => c.startsWith('writeFile'))).toEqual([]);
  });

  it('uploads several dirty keys in one flush', () => {
    const cloud = fakeCloud();
    const host = hostFor({
      client: cloud,
      local: { 'sq.save.v1': 'auto', 'sq.slot.1.v1': 'one', 'sq.slot.1.meta': 'meta' },
    });
    const session = initCloud(host);

    session.mark('sq.save.v1');
    session.mark('sq.slot.1.v1');
    session.mark('sq.slot.1.meta');
    expect(host.scheduled).toEqual([CLOUD_FLUSH_MS]);
    host.runTimers();

    expect([...cloud.files.keys()].sort()).toEqual([
      'sq.save.v1',
      'sq.slot.1.meta',
      'sq.slot.1.v1',
    ]);
  });

  it('a key deleted between mark and flush is skipped rather than uploaded as null', () => {
    const cloud = fakeCloud();
    const host = hostFor({ client: cloud, local: { 'sq.slot.2.v1': 'two' } });
    const session = initCloud(host);

    session.mark('sq.slot.2.v1');
    host.local.delete('sq.slot.2.v1');
    session.flush();

    expect(cloud.files.has('sq.slot.2.v1')).toBe(false);
  });

  it('flush is silent and total: no client, a THROWING write, and a REFUSED write', () => {
    // `main.ts` calls this from `before-quit`, where a throw would abort the rest
    // of that emit — the exact shape of the T-1701a bug that left the process
    // resident, guarded by the window-close-exits-0 e2e assertion.
    const none = initCloud(hostFor({ client: null }));
    expect(() => none.flush()).not.toThrow();

    const thrower = hostFor({
      client: fakeCloud({ throwOnWrite: true }),
      local: { 'sq.save.v1': AUTOSAVE },
    });
    const throwing = initCloud(thrower);
    throwing.mark('sq.save.v1');
    expect(() => throwing.flush()).not.toThrow();
    expect(thrower.logged.join(' ')).toContain('sq.save.v1');

    const refuser = hostFor({
      client: fakeCloud({ refuseWrite: true }),
      local: { 'sq.save.v1': AUTOSAVE },
    });
    const refusing = initCloud(refuser);
    refusing.mark('sq.save.v1');
    expect(() => refusing.flush()).not.toThrow();
    expect(refuser.logged.join(' ')).toContain('refused');

    // A blocked LOCAL read at flush time is silent too.
    const blocked = hostFor({
      client: fakeCloud(),
      local: { 'sq.save.v1': AUTOSAVE },
      failRead: (name) => name === 'sq.save.v1',
    });
    const session = initCloud(blocked);
    session.mark('sq.save.v1');
    expect(() => session.flush()).not.toThrow();
  });

  it('a scheduler that refuses does not throw into the storage IPC handler', () => {
    // `mark` is called from inside the `sq-store:set` handler, which is
    // `sendSync` — a throw there would surface to the renderer as a FAILED SAVE
    // for a cloud problem the player has lost nothing to.
    const host = hostFor({
      client: fakeCloud(),
      local: { 'sq.save.v1': AUTOSAVE },
      failSchedule: true,
    });
    const session = initCloud(host);
    expect(() => session.mark('sq.save.v1')).not.toThrow();
    // …and the name is still dirty, so the quit-time flush picks it up.
    session.flush();
    expect((host.client as FakeCloud).files.get('sq.save.v1')).toBe(AUTOSAVE);
  });

  it('an unavailable session still ANSWERS mark and flush — no null to check', () => {
    const session = initCloud(hostFor({ client: null }));
    expect(() => {
      session.mark('sq.save.v1');
      session.flush();
    }).not.toThrow();
  });
});
