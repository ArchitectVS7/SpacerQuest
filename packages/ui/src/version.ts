/**
 * ============================================================================
 *  T-1704 · WHAT VERSION THIS BUNDLE IS
 * ============================================================================
 *
 * The exact twin of `edition.ts`, and deliberately so — that file is this repo's
 * blessed answer to "how does a bundle know something about itself?", and a
 * second mechanism for a second fact would be a second thing to keep in step.
 *
 * ONE SOURCE OF TRUTH: the root `package.json`'s `version`. Vite reads it at
 * config time and substitutes it as `__SQ_VERSION__` (`vite.config.ts`
 * `define`), so the shipped bundle contains a string literal — no network, no
 * filesystem, no shell. A runtime lookup was rejected for the same reason the
 * edition's was: a cockpit served over `app://` from inside an asar archive has
 * no `package.json` to read, and a version a page has to fetch is a version it
 * cannot show while offline. `__tests__/version.test.ts` pins the root manifest
 * and all five workspace manifests to the same string, so "one source" is
 * asserted rather than merely intended.
 *
 * THE TAG AND THE MANIFESTS DIFFER ON PURPOSE. `v1.0.0-rc1` is the git TAG — a
 * candidate for release 1.0.0 — while every `package.json` stays `1.0.0`.
 * electron-builder derives the Windows/macOS binary version from
 * `packages/desktop/package.json`, NSIS requires an `x.y.z` triple, and both
 * `packages/desktop/e2e/packaged.spec.ts` and `e2e/shell.spec.ts` assert the
 * shell reports `/^\d+\.\d+\.\d+$/`. A prerelease suffix in the manifests would
 * break packaging and buy nothing the tag does not already say. Recorded in
 * `docs/RELEASE-CHECKLIST.md` §A.
 */
declare const __SQ_VERSION__: string | undefined;

/** A semver-ish release string: `x.y.z`, optionally with a prerelease tail. */
const VERSION_SHAPE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** What an unstamped bundle calls itself. */
export const DEV_VERSION = '0.0.0-dev';

/**
 * Normalise whatever the build substituted into a version string.
 *
 * FAILS SAFE TO {@link DEV_VERSION}, and — as with `resolveEdition` — the
 * DIRECTION is the decision. This string ends up in bug reports and on the
 * screenshot attached to them, so the question is what an unstamped or
 * malformed build should claim to be. Guessing `1.0.0` would let a bundle built
 * from an unknown tree impersonate a release, and a support thread would then be
 * chasing the wrong commit; `0.0.0-dev` sorts below every real release and says
 * plainly that nothing stamped it. AN UNSTAMPED BUNDLE MUST NEVER LOOK LIKE A
 * SHIPPED ONE.
 *
 * Pure and separately exported so it is unit-testable without a bundler — the
 * `resolveEdition` / `resolveAppId` precedent.
 */
export function resolveVersion(raw: unknown): string {
  return typeof raw === 'string' && VERSION_SHAPE.test(raw) ? raw : DEV_VERSION;
}

/**
 * THE BUILD'S VERSION.
 *
 * READER: `App.tsx`'s `BuildRow` — the Settings → Build → Version row
 * (`data-testid="app-version"`, `data-version-source="bundle"`), which is the
 * only place a player can read it. Asserted consumed against a REAL `vite build`
 * by `packages/ui/e2e/settings-saves.spec.ts` (which compares it to the root
 * `package.json` on disk), and the desktop side — where the SHELL's version wins
 * — by `packages/desktop/e2e/packaged.spec.ts`.
 *
 * The `typeof` guard is what keeps this file importable from the unit suite and
 * from any tool that has not gone through Vite: with no `define` in scope the
 * identifier is simply undefined, and the fail-safe above resolves it to
 * {@link DEV_VERSION}.
 */
export const BUILD_VERSION: string = resolveVersion(
  typeof __SQ_VERSION__ === 'undefined' ? undefined : __SQ_VERSION__,
);
