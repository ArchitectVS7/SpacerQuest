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

describe('T-1704 · docs/RELEASE-CHECKLIST.md names the version it ships', () => {
  const doc = readFileSync(join(REPO_ROOT, 'docs', 'RELEASE-CHECKLIST.md'), 'utf8');

  it('names the package version and the RC tag', () => {
    // The checklist is the deliverable of this task, and its whole §A is about
    // this number; a doc that drifted off the manifests would be a release
    // checklist for a release that does not exist.
    expect(ROOT_VERSION).toBeDefined();
    expect(doc).toContain(`\`${ROOT_VERSION!}\``);
    expect(doc).toContain('v1.0.0-rc1');
  });

  it('the RC tag is the package version with an -rc suffix, not a different number', () => {
    // The tag and the manifests differ ON PURPOSE (NSIS wants an x.y.z triple),
    // and this is where that intent is pinned: `v1.0.0-rc1` must still be a
    // candidate for THIS version, not for some other one.
    const tag = /v(\d+\.\d+\.\d+)-rc\d+/.exec(doc);
    expect(tag?.[1]).toBe(ROOT_VERSION);
  });
});
