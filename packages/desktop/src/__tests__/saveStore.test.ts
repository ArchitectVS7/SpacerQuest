import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSaveStore } from '../saveStore';

// ---------------------------------------------------------------------------
// T-1701a · The app-data save store.
//
// Runs with NO Electron binary — that is a property of the module under test
// (see the last test in this file), and it is what lets CI's existing
// "Build, lint, test" job run `npm test` unchanged.
// ---------------------------------------------------------------------------

let root: string;
let dir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sq-savestore-'));
  dir = join(root, 'saves');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('T-1701a · createSaveStore — round trip', () => {
  it('writes, reads back and removes a key', () => {
    const store = createSaveStore(dir);
    expect(store.getItem('sq.save.v1')).toBeNull(); // first run is not a failure

    store.setItem('sq.save.v1', '{"v":2,"seed":1701}');
    expect(store.getItem('sq.save.v1')).toBe('{"v":2,"seed":1701}');

    store.removeItem('sq.save.v1');
    expect(store.getItem('sq.save.v1')).toBeNull();
    // Removing what is not there is a success, matching `localStorage`.
    expect(() => store.removeItem('sq.save.v1')).not.toThrow();
  });

  it('keys() lists exactly what was written and ignores .tmp debris', () => {
    const store = createSaveStore(dir);
    expect(store.keys()).toEqual([]); // no directory yet == no keys

    store.setItem('sq.save.v1', 'a');
    store.setItem('sq.slot.2.meta', 'b');
    // A crashed write from a previous run.
    writeFileSync(join(dir, 'sq.save.v1.tmp'), 'half a career', 'utf8');

    expect(store.keys().sort()).toEqual(['sq.save.v1', 'sq.slot.2.meta']);
  });

  it('round-trips a 6 MB career — the quota that motivated this whole task', () => {
    // T-1605c measured a 1,000-day career at ~10.9 MiB of JSON against
    // Chromium's ~5 MB per-origin localStorage quota, which is why a long career
    // silently stopped autosaving on the web build around day ~420. 6 MB is over
    // that ceiling; the file store must not care.
    const store = createSaveStore(dir);
    const big = 'x'.repeat(6 * 1024 * 1024);

    store.setItem('sq.save.v1', big);

    expect(store.getItem('sq.save.v1')).toHaveLength(big.length);
    expect(store.getItem('sq.save.v1')).toBe(big);
  });

  it('is UTF-8 clean — the cockpit writes curly quotes and en-dashes', () => {
    const store = createSaveStore(dir);
    const value = '{"note":"Penny-Wise — “the vig is the vig”"}';
    store.setItem('sq.slot.1.meta', value);
    expect(store.getItem('sq.slot.1.meta')).toBe(value);
  });
});

describe('T-1701a · createSaveStore — the path-traversal guard', () => {
  const unsafe = ['../evil', 'a/b', '..\\evil', '/abs', 'C:\\abs', '', '.', '..', 'x\u0000y'];

  it.each(unsafe)('rejects %j', (key) => {
    const store = createSaveStore(dir);
    expect(() => store.setItem(key, 'pwned')).toThrow();
    expect(() => store.getItem(key)).toThrow();
    expect(() => store.removeItem(key)).toThrow();
  });

  it('writes nothing anywhere when every key is rejected', () => {
    const store = createSaveStore(dir);
    // Seed one legitimate file so the directory exists and the comparison is real.
    store.setItem('sq.save.v1', 'ok');
    const before = readdirSync(dir).sort();

    for (const key of unsafe) {
      try {
        store.setItem(key, 'pwned');
      } catch {
        /* expected */
      }
    }

    expect(readdirSync(dir).sort()).toEqual(before);
    expect(readdirSync(root).sort()).toEqual(['saves']);
  });

  it('rejects a key that would collide with the temp-file suffix', () => {
    // `keys()` filters `.tmp`, so a key ending in `.tmp` would be invisible.
    const store = createSaveStore(dir);
    expect(() => store.setItem('sq.save.tmp', 'x')).toThrow();
  });

  it('accepts every key the cockpit actually uses', () => {
    const store = createSaveStore(dir);
    for (const key of [
      'sq.save.v1',
      'sq.save.v1.corrupt',
      'sq.save.seed',
      'sq.slot.2.v1',
      'sq.slot.2.meta',
      'sq.fx',
      'sq.text-size',
      'sq.reduced-motion',
      'sq.onboarding.v1',
      'sq.vol.master',
      'sq.audio.muted',
      'sq.migrated.from-localstorage.v1',
    ]) {
      expect(() => store.setItem(key, 'v')).not.toThrow();
    }
    expect(store.keys()).toHaveLength(12);
  });
});

describe('T-1701a · createSaveStore — atomicity and failure propagation', () => {
  it('leaves no .tmp behind after a successful write', () => {
    const store = createSaveStore(dir);
    store.setItem('sq.save.v1', 'a career');
    store.setItem('sq.save.v1', 'a longer career, overwriting the first');

    expect(readdirSync(dir)).toEqual(['sq.save.v1']);
    expect(readFileSync(join(dir, 'sq.save.v1'), 'utf8')).toBe(
      'a longer career, overwriting the first',
    );
    expect(existsSync(join(dir, 'sq.save.v1.tmp'))).toBe(false);
  });

  it('a write that cannot land THROWS — that is what raises saveWriteFailed', () => {
    // Make the save dir impossible: its parent path component is a FILE, so
    // `mkdirSync` cannot create it. `store.ts autosave()` needs the throw to set
    // `CockpitState.saveWriteFailed` (T-1605c); a swallowed failure here is a
    // career lost in silence.
    const blocker = join(root, 'blocker');
    writeFileSync(blocker, 'not a directory', 'utf8');
    const store = createSaveStore(join(blocker, 'saves'));

    expect(() => store.setItem('sq.save.v1', 'a career')).toThrow();
  });

  it('an unreadable save THROWS rather than reporting "no save"', () => {
    // A `null` here would boot a fresh career and call it a clean first run —
    // the exact silent-omission bug T-1605a fixed. `store.ts readSaveResult`
    // turns this throw into `recovery: 'storage-unavailable'`.
    const store = createSaveStore(dir);
    store.setItem('sq.save.v1', 'a career');
    // A directory where a file is expected: EISDIR on read, on every platform.
    mkdirSync(join(dir, 'sq.slot.1.v1'));

    expect(() => store.getItem('sq.slot.1.v1')).toThrow();
    // …and the healthy neighbour is unaffected.
    expect(store.getItem('sq.save.v1')).toBe('a career');
  });

  it('keys() on a missing directory is empty, not an error', () => {
    expect(createSaveStore(join(root, 'never-created')).keys()).toEqual([]);
  });
});

describe('T-1701a · structural guard', () => {
  it('saveStore.ts does not import electron', () => {
    // This is what lets the module unit-test (and CI's `npm test` job run)
    // without downloading the ~90 MB Electron binary, and it keeps the file
    // handling independent of the process model T-1701b will move around.
    // `__dirname`, not `import.meta.url`: this package emits CommonJS (the
    // preload script must be CJS — see tsconfig.json), so `import.meta` is not
    // available here the way it is in the ESM engine/ui packages.
    const src = readFileSync(join(__dirname, '..', 'saveStore.ts'), 'utf8');
    expect(src).not.toMatch(/from\s+['"]electron['"]/);
    expect(src).not.toMatch(/require\(\s*['"]electron['"]\s*\)/);
  });
});
