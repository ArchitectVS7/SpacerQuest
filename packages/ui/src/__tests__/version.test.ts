import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// T-1704 · Named reader for the build-time version stamp. `__APP_VERSION__` is baked by
// Vite `define` (vite.config.ts) from packages/ui/package.json's `version`; vitest shares
// that config, so the global is defined here too. These assertions prove the stamp is
// wired to the REAL source of truth and cannot silently drift from package.json — this is
// the reader that gives the new build-time constant an asserting owner (Standing
// constraint 7, applied to a build value rather than a GameState field).

describe('__APP_VERSION__ — the in-app version stamp', () => {
  it('is defined and looks like a semver', () => {
    expect(typeof __APP_VERSION__).toBe('string');
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('equals the version in packages/ui/package.json (no drift)', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(__APP_VERSION__).toBe(pkg.version);
  });
});
