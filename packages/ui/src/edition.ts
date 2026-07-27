import type { Edition } from '@spacerquest/engine';

/**
 * ============================================================================
 *  T-1703 · WHICH EDITION THIS BUNDLE IS
 * ============================================================================
 *
 * The cockpit is the ONLY place that knows the build's identity — exactly the
 * seam `storage.ts` already draws (the shell owns platform identity, the engine
 * owns rules). The engine owns what a demo career MAY DO (`packages/engine/src/
 * demo.ts`); this file owns what edition a career is BORN IN or PROMOTED TO.
 *
 * `__SQ_EDITION__` is substituted by Vite at build time (`vite.config.ts`
 * `define`), so it is a string literal in the shipped bundle, not a lookup.
 */
declare const __SQ_EDITION__: string | undefined;

/**
 * Normalise whatever the build substituted into a real {@link Edition}.
 *
 * FAILS SAFE TO `'full'`, and the direction matters: this is the reading side of
 * a distribution gate, so the question is which way an unrecognised value should
 * err. Defaulting to 'demo' would gate a paying player's full build on a typo;
 * defaulting to 'full' means A BUILD THAT CANNOT PROVE IT IS THE DEMO IS NOT THE
 * DEMO. The demo artifact's identity is asserted end to end by
 * `e2e/demo-gate.spec.ts` against the real `dist-demo` bundle, so "fails safe" is
 * not a hole — a demo that silently resolved to 'full' fails that suite loudly.
 *
 * Pure and separately exported so it is unit-testable without a bundler — the
 * `resolveAppId` precedent (`packages/desktop/src/steam.ts`).
 */
export function resolveEdition(raw: unknown): Edition {
  return raw === 'demo' ? 'demo' : 'full';
}

/**
 * THE BUILD'S EDITION. Read by `store.ts` (`newGame` stamps it onto a fresh
 * career; `init`/`loadSlot`/`importCareer` promote a loaded one through the
 * engine's `promoteEdition`), by `format.ts`'s `editionLabel`, and by `steam.ts`'s
 * `achievementManifest`.
 *
 * The `typeof` guard is what keeps this file importable from the unit suite and
 * from any tool that has not gone through Vite: with no `define` in scope the
 * identifier is simply undefined, and the fail-safe above resolves it to 'full'.
 */
export const BUILD_EDITION: Edition = resolveEdition(
  typeof __SQ_EDITION__ === 'undefined' ? undefined : __SQ_EDITION__,
);

/** Whether this bundle is the demo build. Sugar, so no call site compares the
 *  literal string. */
export const IS_DEMO_BUILD: boolean = BUILD_EDITION === 'demo';
