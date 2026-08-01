import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// T-140 · THE SHIPPED GAME NEVER SUPPLIES A TRACE SINK.
// ---------------------------------------------------------------------------
//
// `docs/BALANCE-TELEMETRY_SPEC.md` §4(3): NPC decision tracing is a BALANCE
// INSTRUMENT. Only `packages/sim`'s sweep runner passes a sink, and only behind
// its explicit `--trace-npc-decisions` flag — *"the shipped game never supplies
// one: a `grep` for the trace parameter under `packages/ui` and
// `packages/desktop` must return nothing, asserted by a test."* This file is that
// assertion, so the property is checked on every run rather than by whoever
// remembers to grep.
//
// WHY THE RULE MATTERS AND NOT JUST THE GREP. A sink attached in the cockpit
// would be a per-captain-per-day allocation on the player's dusk, in aid of a
// question no player asks; and it would put a diagnostic channel on the code path
// that writes saves. The flag stays where the runtime budget can be spent
// deliberately.
//
// IT LIVES IN `packages/ui` BUT COVERS `packages/desktop` TOO, following
// `version.test.ts`, which already walks up to the repo root from here and reads
// files out of a sibling package. `packages/desktop` has a vitest suite of its
// own, but one scan that owns the whole shipped surface cannot be half-deleted.
// ---------------------------------------------------------------------------

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** The scanned roots: everything that is built into, or drives, a shipped build. */
const SHIPPED_ROOTS = [
  join('packages', 'ui', 'src'),
  join('packages', 'ui', 'e2e'),
  join('packages', 'desktop', 'src'),
  join('packages', 'desktop', 'e2e'),
];

/**
 * The forbidden names. Deliberately the identifiers themselves rather than a
 * looser `/trace/i` — "trace" appears in stack-trace handling and would make the
 * scan noisy, and a noisy guard gets weakened rather than obeyed.
 *
 * `EndDayOptions` is on the list because it is the CARRIER: it is the only way a
 * sink can reach the dusk from outside the engine, and today it carries nothing
 * else. A cockpit that needed it would be a cockpit passing a sink.
 */
const FORBIDDEN = ['npcDecisionTrace', 'NpcDecisionTraceSink', 'NpcDecisionTrace', 'EndDayOptions'];

/** The one exemption: this file, which has to name them to forbid them. */
const SELF = join('packages', 'ui', 'src', '__tests__', 'npc-trace-absent.test.ts')
  .split(sep)
  .join('/');

function scan(): { file: string; needle: string; line: number }[] {
  const hits: { file: string; needle: string; line: number }[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // A root that does not exist scans clean — see the totality test.
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', 'dist-web', 'dist-demo'].includes(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const rel = relative(REPO_ROOT, full).split(sep).join('/');
      if (rel === SELF) continue;
      const lines = readFileSync(full, 'utf8').split('\n');
      lines.forEach((text, index) => {
        for (const needle of FORBIDDEN) {
          if (text.includes(needle)) hits.push({ file: rel, needle, line: index + 1 });
        }
      });
    }
  };
  for (const root of SHIPPED_ROOTS) walk(join(REPO_ROOT, root));
  return hits;
}

describe('T-140 · no NPC decision trace reaches a shipped surface', () => {
  it('names no part of the trace-sink surface anywhere in ui or desktop', () => {
    expect(scan()).toEqual([]);
  });

  it('also refuses the sweep flag by name', () => {
    // The flag is a `packages/sim` CLI argument. Finding the literal in a cockpit
    // source would mean the diagnostic had grown a second, unreviewed door.
    const flagHits: string[] = [];
    const walk = (dir: string): void => {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', 'dist', 'dist-web', 'dist-demo'].includes(entry.name)) continue;
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const rel = relative(REPO_ROOT, full).split(sep).join('/');
        if (rel === SELF) continue;
        if (readFileSync(full, 'utf8').includes('trace-npc-decisions')) flagHits.push(rel);
      }
    };
    for (const root of SHIPPED_ROOTS) walk(join(REPO_ROOT, root));
    expect(flagHits).toEqual([]);
  });

  it('is actually scanning something — the guard against a silently empty walk', () => {
    // A scan whose roots have moved would pass the two cases above by finding
    // nothing anywhere, which is the failure mode every source scan has. So: the
    // roots must exist, and the walk must reach a file that certainly mentions
    // `endDay` (the cockpit store does, and always will).
    const seen: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', 'dist', 'dist-web', 'dist-demo'].includes(entry.name)) continue;
          walk(full);
          continue;
        }
        if (/\.(ts|tsx)$/.test(entry.name))
          seen.push(relative(REPO_ROOT, full).split(sep).join('/'));
      }
    };
    for (const root of SHIPPED_ROOTS) walk(join(REPO_ROOT, root));
    expect(seen.length).toBeGreaterThan(20);
    expect(seen).toContain('packages/ui/src/store.ts');
    expect(readFileSync(join(REPO_ROOT, 'packages', 'ui', 'src', 'store.ts'), 'utf8')).toContain(
      'endDay',
    );
  });
});
