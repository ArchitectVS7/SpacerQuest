import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_VERSION, DEV_VERSION, resolveVersion } from '../version';

// ---------------------------------------------------------------------------
// T-1704 · The build's version, resolved — and the ONE SOURCE OF TRUTH pinned.
//
// `resolveVersion` is the reading side of a support-facing fact, so the only
// interesting question about it is which way it errs; that is what the first
// half of this file is about. The second half is the part that actually keeps
// version stamping true over time: six `package.json` files and one doc all have
// to say the same thing, and nothing but a test can hold them together.
//
// The stamp REALLY LANDING in a shipped bundle cannot be proved here (vitest
// applies no Vite `define`) and nothing here pretends to: that is
// `packages/ui/e2e/settings-saves.spec.ts`, which reads the row out of a real
// `vite build` — the same division of labour `edition.test.ts` draws with
// `e2e/demo-gate.spec.ts`.
// ---------------------------------------------------------------------------

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function manifest(...segments: string[]): { version?: string } {
  return JSON.parse(readFileSync(join(REPO_ROOT, ...segments), 'utf8')) as { version?: string };
}

const ROOT_VERSION = manifest('package.json').version;

describe('T-1704 · resolveVersion', () => {
  it('accepts a release triple and a prerelease tail', () => {
    expect(resolveVersion('1.2.3')).toBe('1.2.3');
    expect(resolveVersion('1.0.0-rc.1')).toBe('1.0.0-rc.1');
    expect(resolveVersion('0.0.0-dev')).toBe('0.0.0-dev');
    expect(resolveVersion('12.34.56-beta.7')).toBe('12.34.56-beta.7');
  });

  it('FAILS SAFE to the dev version for anything unrecognised', () => {
    // The direction is the decision. This string ends up in bug reports: a
    // bundle that guessed `1.0.0` would impersonate a release and send a support
    // thread after the wrong commit, while `0.0.0-dev` sorts below every real
    // release and says plainly that nothing stamped it.
    const junk: unknown[] = [
      undefined,
      null,
      '',
      ' 1.2.3',
      '1.2.3 ',
      'v1.2.3',
      '1.2',
      '1.2.3.4',
      'banana',
      42,
      true,
      {},
      [],
      ['1.2.3'],
      { version: '1.2.3' },
      Symbol('1.2.3'),
      Number.NaN,
    ];
    for (const raw of junk) {
      expect(resolveVersion(raw)).toBe(DEV_VERSION);
    }
  });
});

describe('T-1704 · BUILD_VERSION', () => {
  it('is the dev version under the unit runner, where no Vite define is in scope', () => {
    // Vitest does not apply `vite.config.ts`'s `define`, so `__SQ_VERSION__` is
    // genuinely undefined here — which exercises the `typeof` guard that keeps
    // the module importable outside a bundler at all.
    expect(BUILD_VERSION).toBe(DEV_VERSION);
  });
});

describe('T-1704 · one version, six manifests', () => {
  const WORKSPACES = ['content', 'engine', 'ui', 'sim', 'desktop'];

  it('the root package.json carries a version at all', () => {
    // It did not before this task, which is why the cockpit had nothing to stamp.
    expect(ROOT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each(WORKSPACES)('packages/%s agrees with the root version', (workspace) => {
    // The guard that makes "one source of truth" true rather than aspirational:
    // electron-builder reads `packages/desktop`'s version for the binary and the
    // installer, Vite reads the root's for the cockpit, and a player comparing an
    // installer to a Settings row must not see two different numbers.
    expect(manifest('packages', workspace, 'package.json').version).toBe(ROOT_VERSION);
  });
});

describe('the release checklist does NOT restate the version', () => {
  const doc = readFileSync(join(REPO_ROOT, 'docs', 'RELEASE-CHECKLIST.md'), 'utf8');

  // INVERTED 2026-07-28, and the inversion is the point. This pair used to assert
  // that the checklist NAMED the version and the rc tag — which made the doc a
  // SECOND place a version had to be edited by hand, and the manual step is exactly
  // what rots. It rotted: a bump left the doc holding `0.5.0` in some lines and
  // `1.0.0` in others, self-contradictory, with the suite green.
  //
  // One source of truth means the checklist names no live version at all. It points
  // at `docs/VERSIONING.md` and at the root manifest instead.
  it('does not contain the CURRENT version anywhere', () => {
    // THE PRECISE RULE. Not "no version-shaped strings" — the doc legitimately mentions
    // the `0.0.0-dev` fail-safe constant, records that a past transcript was taken in the
    // 1.0.0 era, and cites a real installer filename from a past packaging run. Those are
    // history and constants; rewriting them would fabricate a record.
    //
    // What must never appear is TODAY'S version, because that is the copy someone has to
    // remember to edit on a bump — and forgetting is what produced a checklist holding
    // `0.5.0` in some lines and `1.0.0` in others while the suite stayed green.
    expect(ROOT_VERSION).toBeDefined();
    expect(
      doc.includes(ROOT_VERSION!),
      `the checklist restates the current version (${ROOT_VERSION!}). It lives in the ` +
        `root package.json; point at docs/VERSIONING.md instead of copying the number.`,
    ).toBe(false);
  });

  it('points at the versioning standard instead', () => {
    expect(doc).toContain('docs/VERSIONING.md');
  });
});

describe('the lockfile agrees with the manifests', () => {
  // THE ONE THE OTHER GUARDS MISSED. Six manifests and the checklist were all pinned,
  // so none of them could rot — and the 1.0.0 -> 0.5.0 bump still left every workspace
  // entry in package-lock.json reading 1.0.0, with the whole suite green. Nothing
  // asserted the lockfile. Now something does.
  it('every workspace entry matches the root version', () => {
    const lock = JSON.parse(readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8')) as {
      packages?: Record<string, { version?: string }>;
    };
    const workspaces = Object.entries(lock.packages ?? {}).filter(
      ([key, value]) => /^packages\/[^/]+$/.test(key) && typeof value.version === 'string',
    );
    expect(workspaces.length, 'fixture: no workspace entries found in the lockfile').toBe(5);
    for (const [key, value] of workspaces) {
      expect(
        value.version,
        `${key} in package-lock.json is stale — run \`npm install --package-lock-only\``,
      ).toBe(ROOT_VERSION);
    }
  });
});
