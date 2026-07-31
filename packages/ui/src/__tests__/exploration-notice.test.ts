import { describe, expect, it } from 'vitest';
import type { ExplorationFailReason } from '@spacerquest/engine';
import { explorationFailExplanation } from '../format';

/**
 * T-131 · "TYPED FAILS RENDER AS NOTICES, NEVER SILENCE" — asserted over the
 * WHOLE `ExplorationFailReason` union rather than over the reasons somebody
 * remembered to cover.
 *
 * THE BUG THIS FILE EXISTS TO PREVENT, stated plainly because it already
 * happened once: `explorationFailNoticeFrom` (store.ts) switched on the reason
 * inline, handled five of the six shipped reasons, and fell through to `return
 * null` on the sixth. `recovery-in-progress` therefore rendered as SILENCE from
 * T-111 until T-131 — while the function's own docstring claimed every reason
 * mapped. Nothing caught it because nothing enumerated the union.
 *
 * TWO LOCKS, and the file needs both:
 *   1. COMPILE TIME — `ALL` below is a `Record<ExplorationFailReason, true>`, so
 *      a new reason fails `tsc` here until it is listed; and
 *      `explorationFailExplanation` is an exhaustive `switch` with no `default`,
 *      so it fails `tsc` there until it is given a line.
 *   2. RUN TIME — every key of `ALL` is driven through the mapper and must come
 *      back a real sentence.
 *
 * WHY IT IMPORTS `../format` AND NOT `../store`: `store.ts` runs `init()` at
 * module load and reaches for storage and sound. Extracting the mapper into the
 * pure-prose module is what makes this testable at all under the UI's `node`
 * vitest environment.
 */

const ALL: Record<ExplorationFailReason, true> = {
  'nav-check': true,
  'insufficient-fuel': true,
  'no-die': true,
  'invalid-die-index': true,
  'die-already-spent': true,
  'recovery-in-progress': true,
  'insufficient-dice': true,
};

describe('T-131 · every ExplorationFailed reason renders a visible notice', () => {
  it.each(Object.keys(ALL) as ExplorationFailReason[])(
    '%s renders a real sentence, never silence',
    (reason) => {
      const line = explorationFailExplanation(reason);
      expect(typeof line).toBe('string');
      expect(line.trim().length, `${reason} rendered empty`).toBeGreaterThan(0);
    },
  );

  it('THE HOLE THAT SHIPPED: recovery-in-progress is no longer silent', () => {
    // Named on its own so the acceptance criterion is greppable. This is the
    // reason that fell through the old inline switch to `null`.
    const line = explorationFailExplanation('recovery-in-progress');
    expect(line.length).toBeGreaterThan(0);
    expect(line).toMatch(/salvage op/i);
  });

  it('THE REASON T-131 ADDS: insufficient-dice says the find was left behind', () => {
    // The one fail where a POI genuinely WAS charted — the notice has to say that
    // something was found and not collected, or the player reads a successful
    // sweep as a failed one.
    const line = explorationFailExplanation('insufficient-dice');
    expect(line.length).toBeGreaterThan(0);
    expect(line).toMatch(/left behind/i);
  });

  it('no two reason classes collapse into one indistinguishable line', () => {
    // The three malformed-die reasons deliberately SHARE a line (they are one
    // player-facing situation). Everything else must be distinguishable, or a
    // player cannot tell a dry tank from a thin hand.
    const lines = new Set(
      (Object.keys(ALL) as ExplorationFailReason[]).map(explorationFailExplanation),
    );
    expect(lines.size).toBe(Object.keys(ALL).length - 2);
  });
});
