import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MIGRATION_MARKER_KEY,
  migrateInto,
  selectStorage,
  type DesktopStorageBridge,
  type KeyValueStore,
  type StorageWindow,
} from '../storage';
import { saveRecoveryMessage, saveWriteFailedMessage } from '../format';

// ---------------------------------------------------------------------------
// T-1701a · The storage seam.
//
// Two halves, and both are acceptance evidence:
//
//  * `migrateInto` — the localStorage → app-data import. The desktop e2e proves
//    it end-to-end through a real Electron window; THIS proves its edge
//    semantics, which an e2e cannot reach without breaking a real store on
//    purpose (blocked source, blocked target, a target career already present).
//
//  * the SOURCE SCAN at the bottom — the "web build unaffected" criterion,
//    discharged structurally. Nothing in `packages/ui/src` may import Electron
//    or the desktop package, and nothing but `storage.ts` may reach around the
//    seam back to `localStorage`. Without this, a later task quietly reintroduces
//    a direct `localStorage.setItem` and the desktop build silently loses one
//    key's worth of career. Same precedent as engine `clone.test.ts`'s scan for
//    `JSON.parse(JSON.stringify(state))`.
// ---------------------------------------------------------------------------

interface FakeStore extends KeyValueStore {
  readonly map: Map<string, string>;
}

interface FakeOpts {
  /** Throw from `keys()` — a source whose enumeration is blocked. */
  failKeys?: boolean;
  /** Throw from `getItem` for keys matching this predicate. */
  failGet?: (key: string) => boolean;
  /** Throw from `setItem` for keys matching this predicate. */
  failSet?: (key: string) => boolean;
}

function fakeStore(seed: Record<string, string> = {}, opts: FakeOpts = {}): FakeStore {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (key) => {
      if (opts.failGet?.(key)) throw new Error(`blocked read: ${key}`);
      return map.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (opts.failSet?.(key)) throw new Error(`blocked write: ${key}`);
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    keys: () => {
      if (opts.failKeys) throw new Error('blocked enumerate');
      return [...map.keys()];
    },
  };
}

/** A career's worth of keys, spanning BOTH families that persist under `sq.` —
 *  `store.ts`'s saves/settings and `sound.ts`'s mixer — plus one foreign key
 *  that must be left behind. */
const CAREER = {
  'sq.save.v1': '{"v":2,"seed":1701}',
  'sq.save.seed': '1701',
  'sq.slot.2.v1': '{"v":2,"seed":1701,"slot":2}',
  'sq.slot.2.meta': '{"day":3}',
  'sq.fx': 'off',
  'sq.text-size': 'large',
  'sq.reduced-motion': 'on',
  'sq.onboarding.v1': '{"dice":true}',
  'sq.vol.master': '0.5',
  'sq.audio.muted': 'true',
  'not-sq.thing': 'someone else’s key',
};

describe('T-1701a · migrateInto — the localStorage → app-data import', () => {
  it('copies every sq. key and only those', () => {
    const source = fakeStore(CAREER);
    const target = fakeStore();

    const copied = migrateInto(source, target);

    expect(copied).toHaveLength(10);
    expect(copied).toContain('sq.save.v1');
    expect(copied).toContain('sq.vol.master');
    expect(copied).not.toContain('not-sq.thing');
    expect(target.getItem('sq.save.v1')).toBe(CAREER['sq.save.v1']);
    expect(target.getItem('sq.slot.2.meta')).toBe(CAREER['sq.slot.2.meta']);
    expect(target.getItem('sq.audio.muted')).toBe('true');
    // The foreign key never crosses.
    expect(target.getItem('not-sq.thing')).toBeNull();
  });

  it('is idempotent — a second boot copies nothing', () => {
    const source = fakeStore(CAREER);
    const target = fakeStore();

    expect(migrateInto(source, target)).toHaveLength(10);
    const markerAfterFirst = target.getItem(MIGRATION_MARKER_KEY);

    // Simulate a later web session writing a NEWER value; the import must not
    // run again and must not clobber the desktop career.
    source.setItem('sq.save.v1', '{"v":2,"seed":9999}');
    expect(migrateInto(source, target)).toEqual([]);

    expect(target.getItem('sq.save.v1')).toBe(CAREER['sq.save.v1']);
    expect(target.getItem(MIGRATION_MARKER_KEY)).toBe(markerAfterFirst);
  });

  it('never overwrites a key the desktop store already holds', () => {
    const source = fakeStore(CAREER);
    const target = fakeStore({ 'sq.save.v1': '{"v":2,"seed":4242}' });

    const copied = migrateInto(source, target);

    // A desktop career already in progress beats a stale browser one.
    expect(target.getItem('sq.save.v1')).toBe('{"v":2,"seed":4242}');
    expect(copied).not.toContain('sq.save.v1');
    // …but the keys it does NOT hold still come across.
    expect(target.getItem('sq.text-size')).toBe('large');
  });

  it('COPIES — the browser keys survive, so the web build still has the career', () => {
    const source = fakeStore(CAREER);
    const target = fakeStore();

    migrateInto(source, target);

    for (const key of Object.keys(CAREER)) {
      expect(source.getItem(key)).toBe(CAREER[key as keyof typeof CAREER]);
    }
  });

  it('writes the marker last, carrying the copied key list', () => {
    const source = fakeStore(CAREER);
    const target = fakeStore();

    const copied = migrateInto(source, target);

    const raw = target.getItem(MIGRATION_MARKER_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!) as string[]).toEqual(copied);
    // "Last" in the observable sense that matters: insertion order.
    expect([...target.map.keys()].at(-1)).toBe(MIGRATION_MARKER_KEY);
  });

  it('a blocked SOURCE aborts without a marker (so the next boot retries) and never throws', () => {
    const blockedEnumerate = fakeStore(CAREER, { failKeys: true });
    const target = fakeStore();
    expect(migrateInto(blockedEnumerate, target)).toEqual([]);
    expect(target.getItem(MIGRATION_MARKER_KEY)).toBeNull();

    const blockedRead = fakeStore(CAREER, { failGet: (k) => k === 'sq.slot.2.v1' });
    const target2 = fakeStore();
    expect(migrateInto(blockedRead, target2)).toEqual([]);
    expect(target2.getItem(MIGRATION_MARKER_KEY)).toBeNull();
  });

  it('a blocked TARGET aborts without a marker and never throws', () => {
    const source = fakeStore(CAREER);
    const target = fakeStore({}, { failSet: (k) => k === 'sq.text-size' });

    expect(migrateInto(source, target)).toEqual([]);
    expect(target.getItem(MIGRATION_MARKER_KEY)).toBeNull();

    // A partial import is harmless BY DESIGN: the retry never overwrites what
    // already landed, and the source still holds everything.
    const healthy = fakeStore({ ...Object.fromEntries(target.map) });
    expect(migrateInto(source, healthy)).not.toEqual([]);
    expect(healthy.getItem('sq.text-size')).toBe('large');
  });

  it('a target whose read is blocked outright does nothing rather than throwing', () => {
    const source = fakeStore(CAREER);
    const target = fakeStore({}, { failGet: () => true });
    expect(migrateInto(source, target)).toEqual([]);
  });
});

describe('T-1701a · selectStorage — which backend the cockpit got', () => {
  function bridgeFor(map: Map<string, string>, dir: string): DesktopStorageBridge {
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        map.set(k, v);
      },
      removeItem: (k) => {
        map.delete(k);
      },
      keys: () => [...map.keys()],
      dir: () => dir,
    };
  }

  /** A `localStorage`-shaped fake — `selectStorage` reads the DOM API
   *  (`length`/`key(i)`), not a Map, so the fake has to be shaped like one. */
  function fakeLocalStorage(seed: Record<string, string>): Storage {
    const map = new Map(Object.entries(seed));
    return {
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
    };
  }

  it('picks the desktop bridge when the preload exposed one, and imports the browser career', () => {
    const files = new Map<string, string>();
    const win: StorageWindow = {
      localStorage: fakeLocalStorage(CAREER),
      sqDesktop: bridgeFor(files, '/home/pilot/.config/Rimward/saves'),
    };

    const selected = selectStorage(win);

    expect(selected.backend).toBe('desktop');
    expect(selected.saveLocation).toBe('/home/pilot/.config/Rimward/saves');
    expect(selected.migrated).toHaveLength(10);
    // The handed-out store IS the desktop one.
    expect(selected.storage.getItem('sq.save.v1')).toBe(CAREER['sq.save.v1']);
    expect(files.get('sq.text-size')).toBe('large');
  });

  it('picks localStorage when there is no bridge, and reports no save location', () => {
    const win: StorageWindow = { localStorage: fakeLocalStorage(CAREER) };

    const selected = selectStorage(win);

    expect(selected.backend).toBe('browser');
    expect(selected.saveLocation).toBeNull();
    expect(selected.migrated).toEqual([]);
    expect(selected.storage.getItem('sq.save.v1')).toBe(CAREER['sq.save.v1']);
  });

  it('a bridge that cannot name its save dir is still a usable bridge', () => {
    const files = new Map<string, string>();
    const bridge = bridgeFor(files, 'unused');
    const win: StorageWindow = {
      localStorage: fakeLocalStorage({}),
      sqDesktop: {
        ...bridge,
        dir: () => {
          throw new Error('IPC failed');
        },
      },
    };

    const selected = selectStorage(win);

    expect(selected.backend).toBe('desktop');
    expect(selected.saveLocation).toBeNull(); // Settings falls back to the label
    selected.storage.setItem('sq.fx', 'off');
    expect(files.get('sq.fx')).toBe('off');
  });

  it('falls back to memory with no window at all, so module init cannot throw', () => {
    const selected = selectStorage(null);
    expect(selected.backend).toBe('browser');
    expect(selected.storage.getItem('sq.save.v1')).toBeNull();
    selected.storage.setItem('sq.save.v1', 'x');
    expect(selected.storage.getItem('sq.save.v1')).toBe('x');
  });
});

// ---------------------------------------------------------------------------
// The second READER of `storageBackend`: the two storage-failure sentences.
// ---------------------------------------------------------------------------

describe('T-1701a · the storage-failure prose names the right container', () => {
  // The three phrases `e2e/save-write-failure.spec.ts` asserts. They predate
  // this task and must survive BOTH wordings — the rebalance-fallout rule
  // applied to prose. If a future edit drops one from either variant, this
  // fails here instead of red-lighting a Playwright run.
  const WRITE_FAILURE_PHRASES = [
    'no longer being saved automatically',
    'lost when you close or reload',
    'Save to a slot',
  ];

  it('the autosave-failed banner says "browser" on web and not on desktop', () => {
    const web = saveWriteFailedMessage('browser');
    const desktop = saveWriteFailedMessage('desktop');

    expect(web).toContain('the browser refused the write');
    expect(web).toContain('close or reload the page');
    expect(desktop).not.toContain('browser');
    expect(desktop).toContain('close or reload the game');

    for (const phrase of WRITE_FAILURE_PHRASES) {
      expect(web).toContain(phrase);
      expect(desktop).toContain(phrase);
    }
  });

  it('defaults to the web wording, so no pre-existing call site moved', () => {
    expect(saveWriteFailedMessage()).toBe(saveWriteFailedMessage('browser'));
    expect(saveRecoveryMessage({ code: 'corrupt-json', preserved: true })).toBe(
      saveRecoveryMessage({ code: 'corrupt-json', preserved: true }, 'browser'),
    );
  });

  it('only `storage-unavailable` is backend-dependent', () => {
    // Every other cause is about the save's own bytes, which are identical on
    // both backends — re-voicing them per backend would be a lie waiting to
    // happen.
    const notice = { code: 'storage-unavailable', preserved: false } as const;
    expect(saveRecoveryMessage(notice, 'browser')).toContain('this browser blocked access');
    expect(saveRecoveryMessage(notice, 'desktop')).toContain('could not reach its save folder');
    expect(saveRecoveryMessage(notice, 'desktop')).not.toContain('browser');

    for (const code of ['corrupt-json', 'bad-envelope', 'future-version', 'unknown'] as const) {
      expect(saveRecoveryMessage({ code, preserved: true }, 'desktop')).toBe(
        saveRecoveryMessage({ code, preserved: true }, 'browser'),
      );
    }
    // The phrases `e2e/recovery.spec.ts` asserts survive both wordings.
    expect(saveRecoveryMessage({ code: 'future-version', preserved: true }, 'desktop')).toContain(
      'NEWER build',
    );
    expect(saveRecoveryMessage(notice, 'desktop')).toContain('could not be loaded');
  });
});

// ---------------------------------------------------------------------------
// The "web build unaffected" proof, in the small.
// ---------------------------------------------------------------------------

describe('T-1701a · structural guards over packages/ui/src', () => {
  const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const sources = readdirSync(srcDir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

  it('finds the cockpit sources it claims to scan (non-vacuity)', () => {
    expect(sources).toContain('store.ts');
    expect(sources).toContain('sound.ts');
    expect(sources).toContain('App.tsx');
    expect(sources).toContain('storage.ts');
  });

  it('no cockpit source imports electron or the desktop package', () => {
    // The web build must not acquire a desktop dependency — not even type-only,
    // which is why the bridge interface is DUPLICATED in `storage.ts` and
    // `packages/desktop/src/preload.ts` rather than shared.
    const offenders = sources.filter((f) => {
      const text = readFileSync(join(srcDir, f), 'utf8');
      return /from\s+['"](electron|@spacerquest\/desktop)/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it('only storage.ts touches localStorage directly', () => {
    // Anything else bypasses the seam, which on desktop means that key silently
    // never leaves the browser profile.
    const api = /localStorage\s*\.\s*(getItem|setItem|removeItem|clear|key|length)/;
    const offenders = sources.filter(
      (f) => f !== 'storage.ts' && api.test(readFileSync(join(srcDir, f), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
