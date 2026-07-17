import { describe, it, expect } from 'vitest';
import {
  DEMO_FINAL_DAY,
  demoWallReached,
  demoFeatureLocked,
  DEMO_LOCK_COPY,
  type DemoGatedFeature,
} from '../demo';

// T-1703 · Headless reachability proof for the demo gate. These pure predicates are
// the SINGLE SOURCE the store's day-wall and App's feature teasers consume, so proving
// them here proves the rule independent of any build flag or browser (Standing
// constraint 2). Every case passes `demoBuild` EXPLICITLY — the tests never depend on
// how `import.meta.env.VITE_SQ_DEMO` was baked.

describe('demoWallReached — the day-33 playable budget', () => {
  it('leaves the resolution day and the three post-resolution days playable in the demo', () => {
    // Day 30 (Tour One resolution) and 31–33 (the three teased post-resolution days)
    // are all inside the budget: ending them must NOT hit the wall.
    for (const day of [1, 29, 30, 31, 32, DEMO_FINAL_DAY]) {
      expect(demoWallReached(day, true)).toBe(false);
    }
  });

  it('walls the first day past the budget in the demo', () => {
    // store.endDay calls demoWallReached(currentDay + 1); ending day 33 asks about day
    // 34, which is past DEMO_FINAL_DAY and must be refused.
    expect(demoWallReached(DEMO_FINAL_DAY + 1, true)).toBe(true);
    expect(demoWallReached(999, true)).toBe(true);
  });

  it('never walls in the full build, whatever the day', () => {
    for (const day of [1, 30, 33, 34, 100, 999]) {
      expect(demoWallReached(day, false)).toBe(false);
    }
  });
});

describe('demoFeatureLocked — the three teased-but-gated veteran surfaces', () => {
  const features: DemoGatedFeature[] = ['ports', 'hangout-progression', 'conqueror'];

  it('locks every gated feature in the demo build', () => {
    for (const f of features) expect(demoFeatureLocked(f, true)).toBe(true);
  });

  it('unlocks every gated feature in the full build', () => {
    for (const f of features) expect(demoFeatureLocked(f, false)).toBe(false);
  });

  it('ships teaser copy for every gated feature (no orphan lock without a reason)', () => {
    for (const f of features) {
      expect(DEMO_LOCK_COPY[f]).toBeDefined();
      expect(DEMO_LOCK_COPY[f].body.length).toBeGreaterThan(0);
    }
  });
});
