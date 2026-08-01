import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// T-141 · THE PLAYTEST LOG NEVER TOUCHES A NETWORK.
// ---------------------------------------------------------------------------
//
// `docs/PLAYTEST-TELEMETRY_SPEC.md` §5 settles submission as a PLAYER-TRIGGERED
// EXPORT rather than a background upload: there is no server anywhere in this
// repository, standing one up is a distinct feature with its own disclosure and
// retention policy, and "nothing leaves the player's machine until they take an
// action to send it" is the property that makes the whole consent story hold.
// §8 asks for exactly this: "no network call is made anywhere in the feature,
// asserted by a test or a static check over the diff."
//
// TWO TESTS, NOT ONE. `playtest-log.test.ts` installs throwing spies on every
// transport and runs a real export through them — that proves the paths the
// suite EXERCISES are clean. This file proves it for the paths it does not, by
// scanning the feature's sources for a transport by name. Neither is sufficient
// alone; a runtime spy cannot see a branch nobody took, and a source scan cannot
// see an alias.
//
// IT LIVES IN `packages/ui` BUT COVERS `packages/desktop` TOO, on the precedent
// `npc-trace-absent.test.ts` sets and for the reason it states: one scan that
// owns the whole surface cannot be half-deleted.
// ---------------------------------------------------------------------------

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/**
 * Every file the opt-in playtest log is implemented in or passes through.
 *
 * `packages/desktop/src/main.ts` is NOT on this list, and the exemption is
 * stated rather than smuggled: it legitimately serves the packaged renderer over
 * `app://` (`net.fetch` against a `file:` URL) and opens release links in the
 * player's browser (`shell.openExternal`), both of which predate this feature
 * and neither of which the playtest log can reach. Its playtest-specific code is
 * scanned separately below, in isolation.
 */
const FEATURE_FILES = [
  join('packages', 'ui', 'src', 'playtestLog.ts'),
  join('packages', 'ui', 'src', 'storage.ts'),
  join('packages', 'ui', 'src', 'store.ts'),
  join('packages', 'ui', 'src', 'App.tsx'),
  join('packages', 'ui', 'src', 'ErrorBoundary.tsx'),
  join('packages', 'desktop', 'src', 'playtestLog.ts'),
  join('packages', 'desktop', 'src', 'preload.ts'),
];

/**
 * THE AUTHORITATIVE LIST of names that would mean a transport. The feature's own
 * source comments point HERE rather than repeating these strings, so the scan
 * cannot be defeated by the documentation that describes it.
 *
 * `fetch(` carries its paren deliberately: the bare word appears in prose
 * ("fetches", "prefetch") and a noisy guard gets weakened rather than obeyed —
 * the same reasoning `npc-trace-absent.test.ts` gives for naming identifiers
 * instead of matching `/trace/i`.
 */
const FORBIDDEN = [
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'sendBeacon',
  'EventSource',
  'node:http',
  'node:https',
  'node:net',
  'node:dgram',
  'axios',
  'net.request',
];

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

function scan(rel: string, text: string): { file: string; needle: string; line: number }[] {
  const hits: { file: string; needle: string; line: number }[] = [];
  text.split('\n').forEach((line, index) => {
    for (const needle of FORBIDDEN) {
      if (line.includes(needle)) {
        hits.push({ file: rel.split(sep).join('/'), needle, line: index + 1 });
      }
    }
  });
  return hits;
}

describe('T-141 · no network transport exists anywhere in the playtest log feature', () => {
  it('finds every file it claims to scan (non-vacuity)', () => {
    // The failure mode every source scan has: roots that moved, so the guard
    // passes by finding nothing anywhere.
    for (const rel of FEATURE_FILES) {
      expect(existsSync(join(REPO_ROOT, rel)), `missing: ${rel}`).toBe(true);
      expect(read(rel).length).toBeGreaterThan(200);
    }
    // …and the scanner itself works: a synthetic line with a transport in it
    // must be caught, or every clean result below means nothing.
    expect(scan('synthetic.ts', 'await fetch("https://example.test");')).toHaveLength(1);
  });

  it('names no transport in any feature file', () => {
    expect(FEATURE_FILES.flatMap((rel) => scan(rel, read(rel)))).toEqual([]);
  });

  it('the shell’s playtest IPC handler names no transport either', () => {
    // `main.ts` is exempt as a whole (see FEATURE_FILES' comment), so its
    // playtest-specific code is scanned in isolation instead of not at all.
    const main = read(join('packages', 'desktop', 'src', 'main.ts'));
    const start = main.indexOf('function registerPlaytestLogIpc(): void {');
    expect(start).toBeGreaterThan(-1);
    const end = main.indexOf('\n}\n', start);
    expect(end).toBeGreaterThan(start);
    const body = main.slice(start, end);

    // Non-vacuity: the slice really is the handler.
    expect(body).toContain('CHANNELS.playtestLog');
    expect(body).toContain('playtestLog.append');
    expect(scan('packages/desktop/src/main.ts', body)).toEqual([]);
  });

  it('the log module imports nothing but the storage seam and engine types', () => {
    // The strongest form of the claim for the file that actually holds the data:
    // it cannot reach a transport it never imports. Node built-ins are excluded
    // outright — this module runs in a browser tab as well as a renderer.
    const source = read(join('packages', 'ui', 'src', 'playtestLog.ts'));
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(['./storage', '@spacerquest/engine']);
  });

  it('the shell’s log module imports nothing but the filesystem and path', () => {
    const source = read(join('packages', 'desktop', 'src', 'playtestLog.ts'));
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(['node:fs', 'node:path']);
    // The `saveStore.ts` discipline, copied: pure Node, no electron, so the
    // module unit-tests with no Electron binary.
    expect(source).not.toMatch(/from\s+['"]electron['"]/);
    expect(source).not.toMatch(/require\(\s*['"]electron['"]\s*\)/);
  });
});
