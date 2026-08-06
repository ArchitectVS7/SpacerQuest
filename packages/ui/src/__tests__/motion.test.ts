import { describe, expect, it } from 'vitest';
import {
  MOTION_SCALE,
  MOTION_TIERS,
  MOTION_TIER_LABELS,
  isInstant,
  isMotionTier,
  motionTierFromStorage,
  resolveMotionTier,
  scaleMs,
  type MotionTier,
} from '../motion';

// ---------------------------------------------------------------------------
// T-252 · The tier vocabulary and the one knob.
//
// `motion-tiers.test.ts` proves the CSS rails are COMPLETE (no beat left
// cinematic-only). This file proves the vocabulary those rails are stated in:
// the scale factors, the full OS-query truth table, and the ms arithmetic every
// JS timer site now routes through.
// ---------------------------------------------------------------------------

describe('T-252 · motion tier vocabulary', () => {
  it('is exactly three tiers, in menu order', () => {
    expect(MOTION_TIERS).toEqual(['cinematic', 'snappy', 'instant']);
    expect(Object.keys(MOTION_SCALE).sort()).toEqual(['cinematic', 'instant', 'snappy']);
    expect(Object.keys(MOTION_TIER_LABELS).sort()).toEqual(['cinematic', 'instant', 'snappy']);
  });

  it('pins the scale factors to `tabletop-ui` §8 (~0.4x Snappy, synchronous Instant)', () => {
    // Never edit these to make a downstream test pass — they ARE the rule.
    expect(MOTION_SCALE.cinematic).toBe(1);
    expect(MOTION_SCALE.snappy).toBe(0.4);
    expect(MOTION_SCALE.instant).toBe(0);
  });

  it('narrows only the three tiers', () => {
    for (const t of MOTION_TIERS) expect(isMotionTier(t)).toBe(true);
    for (const junk of ['reduced', 'full', 'FULL', '', null, undefined, 0, {}, ['snappy']]) {
      expect(isMotionTier(junk)).toBe(false);
    }
  });
});

describe('T-252 · resolveMotionTier — the OS-query mapping', () => {
  // Six rows, all of them. The OS preference FORCES Instant (WCAG 2.3.3) and
  // that is the clause that preserves the pre-T-252 `setting || media`
  // semantics: the old binary's "reduced" is the new Instant.
  const TRUTH: ReadonlyArray<[MotionTier, boolean, MotionTier]> = [
    ['cinematic', false, 'cinematic'],
    ['snappy', false, 'snappy'],
    ['instant', false, 'instant'],
    ['cinematic', true, 'instant'],
    ['snappy', true, 'instant'],
    ['instant', true, 'instant'],
  ];

  it.each(TRUTH)('(%s, os=%s) -> %s', (setting, os, expected) => {
    expect(resolveMotionTier(setting, os)).toBe(expected);
  });

  it('covers every (tier x os) pair — the table cannot silently shrink', () => {
    expect(TRUTH).toHaveLength(MOTION_TIERS.length * 2);
  });
});

describe('T-252 · scaleMs — the JS half of the one knob', () => {
  it('is identity at Cinematic', () => {
    for (const ms of [55, 620, 700, 750, 1100]) expect(scaleMs(ms, 'cinematic')).toBe(ms);
  });

  it('trims to ~0.4x at Snappy, rounded to whole ms', () => {
    expect(scaleMs(1100, 'snappy')).toBe(440);
    expect(scaleMs(750, 'snappy')).toBe(300);
    expect(scaleMs(700, 'snappy')).toBe(280);
    expect(scaleMs(620, 'snappy')).toBe(248);
    expect(scaleMs(55, 'snappy')).toBe(22);
  });

  it('is zero at Instant for every input', () => {
    for (const ms of [55, 620, 700, 750, 1100, 40_000]) expect(scaleMs(ms, 'instant')).toBe(0);
  });

  it('Snappy is strictly shorter than Cinematic — a tier that equals another is not a tier', () => {
    for (const ms of [55, 620, 700, 750, 1100]) {
      expect(scaleMs(ms, 'snappy')).toBeLessThan(scaleMs(ms, 'cinematic'));
      expect(scaleMs(ms, 'instant')).toBeLessThan(scaleMs(ms, 'snappy'));
    }
  });
});

describe('T-252 · motionTierFromStorage — the legacy binary must not be lost', () => {
  it('takes the new key whenever it names a tier', () => {
    for (const t of MOTION_TIERS) expect(motionTierFromStorage(t, null)).toBe(t);
  });

  it('the new key WINS over a contradicting legacy key', () => {
    // A player who had "Reduced motion: On" and has since chosen Cinematic must
    // get Cinematic; the reverse precedence would make the setting unusable.
    expect(motionTierFromStorage('cinematic', 'on')).toBe('cinematic');
    expect(motionTierFromStorage('snappy', 'on')).toBe('snappy');
    expect(motionTierFromStorage('instant', 'off')).toBe('instant');
  });

  it('falls back to the legacy binary: on -> Instant, off -> Cinematic', () => {
    expect(motionTierFromStorage(null, 'on')).toBe('instant');
    expect(motionTierFromStorage(null, 'off')).toBe('cinematic');
  });

  it('defaults to Cinematic when nothing is stored — §8’s default tier', () => {
    expect(motionTierFromStorage(null, null)).toBe('cinematic');
  });

  it('is total over garbage in either key — it runs at module scope', () => {
    for (const junk of ['reduced', 'full', '', 'CINEMATIC', '{}', 0, undefined, {}, []]) {
      expect(MOTION_TIERS).toContain(motionTierFromStorage(junk, junk));
    }
    // Garbage in the NEW key does not silently discard a legacy opt-out.
    expect(motionTierFromStorage('reduced', 'on')).toBe('instant');
  });
});

describe('T-252 · isInstant', () => {
  it('is the synchronous rail and nothing else', () => {
    expect(isInstant('instant')).toBe(true);
    expect(isInstant('snappy')).toBe(false);
    expect(isInstant('cinematic')).toBe(false);
  });

  it('agrees with the knob: the synchronous rail is exactly the zero-scale tier', () => {
    for (const t of MOTION_TIERS) expect(isInstant(t)).toBe(MOTION_SCALE[t] === 0);
  });
});
