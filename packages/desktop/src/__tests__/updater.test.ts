import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPILED_FEED_URL, initUpdater, type AutoUpdaterLike, type UpdaterHost } from '../updater';

// ---------------------------------------------------------------------------
// T-1701b · The updater stub.
//
// "Inert without a feed" is the acceptance criterion, and it is asserted here as
// an EMPTY CALL LOG on a recording fake — not by reading the source. A stub that
// registered a listener, or set a feed URL and merely failed to fetch, would
// pass an inspection and fail this file.
//
// Runs with NO Electron binary (the last test in this file pins that), so CI's
// `Build, lint, test` job keeps running `npm test` with
// `ELECTRON_SKIP_BINARY_DOWNLOAD: 1`. Same discipline as `saveStore.test.ts`.
// ---------------------------------------------------------------------------

interface FakeAutoUpdater extends AutoUpdaterLike {
  /** Every call made on this object, in order. The whole point of the fake. */
  readonly calls: string[];
  readonly feeds: string[];
  readonly events: string[];
}

function fakeAutoUpdater(opts: { throwOnSetFeed?: boolean } = {}): FakeAutoUpdater {
  const calls: string[] = [];
  const feeds: string[] = [];
  const events: string[] = [];
  return {
    calls,
    feeds,
    events,
    setFeedURL(options: { url: string }) {
      calls.push('setFeedURL');
      feeds.push(options.url);
      if (opts.throwOnSetFeed) throw new Error('feed rejected by the platform');
    },
    checkForUpdates() {
      calls.push('checkForUpdates');
    },
    on(event: string) {
      calls.push(`on:${event}`);
      events.push(event);
      return this;
    },
  };
}

function hostFor(
  over: Partial<UpdaterHost> & { autoUpdater: AutoUpdaterLike } & { env?: UpdaterHost['env'] },
): UpdaterHost {
  return {
    isPackaged: true,
    platform: 'darwin',
    env: {},
    ...over,
  };
}

describe('T-1701b · initUpdater — a dev build never self-updates', () => {
  it('is unsupported when not packaged, even with a feed set, and touches nothing', () => {
    const autoUpdater = fakeAutoUpdater();
    const status = initUpdater(
      hostFor({
        autoUpdater,
        isPackaged: false,
        env: { SQ_UPDATE_FEED: 'https://updates.example/rimward' },
      }),
    );

    expect(status).toEqual({ state: 'unsupported', reason: 'not-packaged', feed: null });
    // Self-updating a dev build would overwrite a working tree with a release.
    expect(autoUpdater.calls).toEqual([]);
  });
});

describe('T-1701b · initUpdater — INERT WITHOUT A FEED (the Accept)', () => {
  for (const platform of ['darwin', 'win32'] as const) {
    it(`makes no autoUpdater call at all on ${platform} when no feed is configured`, () => {
      const autoUpdater = fakeAutoUpdater();
      const status = initUpdater(hostFor({ autoUpdater, platform }));

      expect(status).toEqual({ state: 'inert', reason: 'no-feed', feed: null });
      // No setFeedURL, no checkForUpdates, NO LISTENERS, no network. This
      // assertion IS the acceptance criterion.
      expect(autoUpdater.calls).toEqual([]);
      expect(autoUpdater.feeds).toEqual([]);
      expect(autoUpdater.events).toEqual([]);
    });
  }

  it('treats a blank SQ_UPDATE_FEED as absent rather than as a feed of ""', () => {
    const autoUpdater = fakeAutoUpdater();
    const status = initUpdater(hostFor({ autoUpdater, env: { SQ_UPDATE_FEED: '   ' } }));
    expect(status.state).toBe('inert');
    expect(status.reason).toBe('no-feed');
    expect(autoUpdater.calls).toEqual([]);
  });

  it('COMPILED_FEED_URL is null — no build this repo produces phones home', () => {
    // A guard, not a tautology: a feed committed here would arm EVERY shipped
    // build at once, silently. electron-builder's `publish: null` is the second,
    // independent reason (no `app-update.yml` is embedded either).
    expect(COMPILED_FEED_URL).toBeNull();
  });
});

describe('T-1701b · initUpdater — platforms and bad feeds', () => {
  it('is unsupported on linux even with a feed (the built-in autoUpdater throws there)', () => {
    const autoUpdater = fakeAutoUpdater();
    const status = initUpdater(
      hostFor({
        autoUpdater,
        platform: 'linux',
        env: { SQ_UPDATE_FEED: 'https://updates.example/rimward' },
      }),
    );

    expect(status).toEqual({ state: 'unsupported', reason: 'platform-unsupported', feed: null });
    // CI's ubuntu `desktop` job launches this same main process; a call here
    // would throw out of `whenReady` and take the shell down.
    expect(autoUpdater.calls).toEqual([]);
  });

  it('refuses a plaintext feed — an update channel is a code-execution channel', () => {
    const autoUpdater = fakeAutoUpdater();
    const status = initUpdater(
      hostFor({ autoUpdater, env: { SQ_UPDATE_FEED: 'http://updates.example/rimward' } }),
    );

    expect(status).toEqual({ state: 'inert', reason: 'invalid-feed', feed: null });
    expect(autoUpdater.calls).toEqual([]);
  });

  it('refuses an unparseable feed', () => {
    const autoUpdater = fakeAutoUpdater();
    const status = initUpdater(hostFor({ autoUpdater, env: { SQ_UPDATE_FEED: 'not a url' } }));
    expect(status).toEqual({ state: 'inert', reason: 'invalid-feed', feed: null });
    expect(autoUpdater.calls).toEqual([]);
  });
});

describe('T-1701b · initUpdater — arming, and never throwing', () => {
  it('arms exactly once on an https feed, with both listeners registered first', () => {
    const autoUpdater = fakeAutoUpdater();
    const feed = 'https://updates.example/rimward/darwin';
    const status = initUpdater(hostFor({ autoUpdater, env: { SQ_UPDATE_FEED: feed } }));

    expect(status).toEqual({ state: 'armed', reason: 'feed', feed });
    expect(autoUpdater.feeds).toEqual([feed]);
    expect(autoUpdater.calls.filter((c) => c === 'setFeedURL')).toHaveLength(1);
    expect(autoUpdater.calls.filter((c) => c === 'checkForUpdates')).toHaveLength(1);
    expect(autoUpdater.events.sort()).toEqual(['error', 'update-downloaded']);
    // Listeners BEFORE the calls that can raise: an unhandled `error` event is a
    // crash dialog in Electron.
    expect(autoUpdater.calls.indexOf('on:error')).toBeLessThan(
      autoUpdater.calls.indexOf('setFeedURL'),
    );
  });

  it('a platform that rejects the feed degrades instead of taking the app down', () => {
    const autoUpdater = fakeAutoUpdater({ throwOnSetFeed: true });
    const logged: string[] = [];
    let status;
    expect(() => {
      status = initUpdater(
        hostFor({
          autoUpdater,
          env: { SQ_UPDATE_FEED: 'https://updates.example/rimward' },
          log: (m) => logged.push(m),
        }),
      );
    }).not.toThrow();

    expect(status).toEqual({ state: 'unsupported', reason: 'feed-rejected', feed: null });
    // It never reached the check — and it reported why.
    expect(autoUpdater.calls).not.toContain('checkForUpdates');
    expect(logged.join(' ')).toContain('feed rejected');
  });
});

describe('T-1701b · structural guard', () => {
  it('updater.ts imports no electron — so this suite runs with no Electron binary', () => {
    // Same precedent (and same purpose) as `saveStore.test.ts`'s scan: CI's
    // `Build, lint, test` job installs with ELECTRON_SKIP_BINARY_DOWNLOAD=1.
    // `__dirname`, not `import.meta.url`: this package emits CommonJS (the
    // preload script must be CJS — see tsconfig.json), so `import.meta` is not
    // available. Same as `saveStore.test.ts`'s scan.
    const source = readFileSync(join(__dirname, '..', 'updater.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+['"]electron['"]/);
    expect(source).not.toMatch(/require\(\s*['"]electron['"]\s*\)/);
  });
});
