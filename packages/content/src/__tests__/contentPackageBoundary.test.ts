import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-164 · THE BOUNDARY THAT MAKES THE HOSTING RULE A RULE.
 *
 * `docs/TESTING-STRATEGY.md` Part I rules that a content validator lives beside
 * its rows UNLESS it has to resolve a row through the engine, in which case it
 * stays in the engine suite permanently. The "unless" is not a preference — it is
 * forced by a CYCLE, and per L-020 prose is not enforcement, so the cycle is
 * asserted here rather than described in a comment somewhere.
 *
 * WHAT WOULD BREAK. `packages/engine` depends on `@spacerquest/content`
 * (`packages/engine/package.json`) and `packages/engine/tsconfig.json` carries
 * `references: [{ path: '../content' }]`; the root `tsconfig.json` solution file
 * lists `./packages/content` BEFORE `./packages/engine` for that reason. Adding
 * an engine dependency here — in any field, including `devDependencies`, which is
 * the one somebody would reach for to move a test — closes the loop: `tsc -b`
 * refuses a project-reference cycle outright, and npm workspaces would be
 * resolving a circular link.
 *
 * SO THE FAILURE THIS CATCHES IS SPECIFICALLY THE WELL-INTENTIONED ONE: a future
 * pass reads Part I, decides the rest of `exploreContent.test.ts` "should live
 * with the rows too", and adds `"@spacerquest/engine": "*"` to devDependencies to
 * make the import resolve. That must fail here, with the reason, rather than in a
 * `tsc -b` cycle error three commands later.
 */

const PACKAGE_JSON = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');

interface PackageManifest {
  name: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function manifest(): PackageManifest {
  return JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')) as PackageManifest;
}

/** The workspaces `packages/content` may never depend on, each because it already
 *  depends on content (directly or transitively) and the edge would be a cycle. */
const FORBIDDEN_WORKSPACES = ['@spacerquest/engine', '@spacerquest/sim', '@spacerquest/ui'];

describe('T-164 · `packages/content` never acquires a dependency on the engine', () => {
  it('is the package it claims to be', () => {
    // A cheap anchor: if the path resolution above ever drifts, every other
    // assertion in this file would be vacuously green against the wrong manifest.
    expect(manifest().name).toBe('@spacerquest/content');
  });

  it('names no workspace that depends on it, in ANY dependency field', () => {
    const pkg = manifest();
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
      const names = Object.keys(pkg[field] ?? {});
      for (const forbidden of FORBIDDEN_WORKSPACES) {
        expect(
          names,
          `${field} names ${forbidden} — that is a tsc -b project-reference cycle ` +
            '(root tsconfig.json lists ./packages/content before ./packages/engine, and ' +
            'packages/engine/tsconfig.json references ../content). A validator that needs the ' +
            'engine stays in the engine suite: docs/TESTING-STRATEGY.md Part I.',
        ).not.toContain(forbidden);
      }
    }
  });

  it('carries the test script the Part I rule depends on', () => {
    // The other half of the ruling: content validators may only live here because
    // there is a runner to run them. If this script is ever removed, the moved
    // half of `exploreContent.test.ts` would stop running SILENTLY — the root
    // `npm test` is `--workspaces --if-present`, which is exactly the flag that
    // makes a missing script a no-op instead of a failure.
    expect(manifest().scripts?.test).toBe('vitest run');
  });
});
