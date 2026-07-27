import { describe, expect, it } from 'vitest';
import { BUILD_EDITION, IS_DEMO_BUILD, resolveEdition } from '../edition';

// ---------------------------------------------------------------------------
// T-1703 · The build's edition, resolved.
//
// `resolveEdition` is the reading side of a DISTRIBUTION gate, so the only
// interesting question about it is which way it errs — and that is what most of
// this file is about. The demo build's real identity (the `__SQ_EDITION__` Vite
// `define` actually landing in `dist-demo`) is proved end to end against the
// shipped bundle by `e2e/demo-gate.spec.ts`; nothing here can prove that, and
// nothing here pretends to.
// ---------------------------------------------------------------------------

describe('T-1703 · resolveEdition', () => {
  it('recognises the demo build, and only the exact literal', () => {
    expect(resolveEdition('demo')).toBe('demo');
    expect(resolveEdition('full')).toBe('full');
  });

  it('FAILS SAFE to full for anything unrecognised', () => {
    // The direction is the decision. This is the reading side of a distribution
    // gate: defaulting to 'demo' would gate a paying player's full build on a
    // typo; defaulting to 'full' means A BUILD THAT CANNOT PROVE IT IS THE DEMO IS
    // NOT THE DEMO. The demo artifact's identity is asserted separately against
    // the real bundle, so this errs toward more gating being REQUIRED, never less.
    const junk: unknown[] = [
      undefined,
      null,
      '',
      ' demo',
      'demo ',
      'DEMO',
      'Demo',
      'demonstration',
      0,
      1,
      true,
      false,
      {},
      [],
      ['demo'],
      { edition: 'demo' },
      Symbol('demo'),
      Number.NaN,
    ];
    for (const raw of junk) {
      expect(resolveEdition(raw)).toBe('full');
    }
  });
});

describe('T-1703 · BUILD_EDITION', () => {
  it('is full under the unit runner, where no Vite define is in scope', () => {
    // Vitest does not apply `vite.config.ts`'s `define` for the app build, so
    // `__SQ_EDITION__` is genuinely undefined here — which exercises the `typeof`
    // guard that keeps this module importable outside a bundler at all. If this
    // ever read 'demo', the whole unit suite would be measuring a demo cockpit.
    expect(BUILD_EDITION).toBe('full');
    expect(IS_DEMO_BUILD).toBe(false);
  });

  it('IS_DEMO_BUILD agrees with BUILD_EDITION by construction', () => {
    expect(IS_DEMO_BUILD).toBe(BUILD_EDITION === 'demo');
  });
});
