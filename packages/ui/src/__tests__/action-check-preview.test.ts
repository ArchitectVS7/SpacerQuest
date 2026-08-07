import { describe, expect, it } from 'vitest';
import { createInitialState, startDay } from '@spacerquest/engine';

import { explorationCheckPreview, haggleCheckPreview } from '../format';

describe('T-194 · action check previews', () => {
  it('distinguishes a planning DC from a live armed-die read', () => {
    const game = startDay(createInitialState(1)).state;

    expect(haggleCheckPreview(game, undefined)).toMatchObject({
      tone: 'unarmed',
      die: null,
      success: null,
      label: 'TRADE DC 12 · arm a die',
    });

    expect(haggleCheckPreview(game, 17)).toMatchObject({
      tone: 'armed',
      stat: 'TRADE',
      dc: 12,
      die: 17,
      success: true,
      label: '[17] +1 vs DC 12 · clears it',
    });
  });

  it('uses the same effective PILOT modifier the sweep control already prints', () => {
    const game = startDay(createInitialState(53)).state;
    const low = explorationCheckPreview(game, 10);
    const high = explorationCheckPreview(game, 18);

    expect(low).toMatchObject({ stat: 'PILOT', dc: 12, die: 10, success: false });
    expect(high).toMatchObject({ stat: 'PILOT', dc: 12, die: 18, success: true });
  });
});
