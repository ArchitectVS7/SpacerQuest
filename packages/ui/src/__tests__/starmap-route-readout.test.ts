import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  navDieEvasionFactor,
  navDieFuelDiscount,
  startDay,
} from '@spacerquest/engine';

import { routeDieReadout, routePreview } from '../format';

describe('T-193 · starmap route readout', () => {
  it('threads the armed die through the route fuel preview', () => {
    const game = startDay(createInitialState(424242)).state;
    const destination = game.market.manifestBoard[0].destination;
    const bare = routePreview(game, destination);
    const armed = routePreview(game, destination, 20);

    expect(armed.fuelCost).toBeLessThan(bare.fuelCost);
    expect(armed.fuelCost).toBe(
      Math.max(1, Math.round(bare.fuelCost * (1 - navDieFuelDiscount(20)))),
    );
    expect(armed.dc).toBe(bare.dc);
  });

  it('formats the live ordinary-jump die effect instead of a Pilot check', () => {
    const readout = routeDieReadout(14);

    expect(readout).toEqual({
      die: 14,
      fuelDiscountPercent: Math.round(navDieFuelDiscount(14) * 100),
      evasionPercent: Math.round((1 - navDieEvasionFactor(14)) * 100),
      label: 'die 14 · fuel -10% · encounter odds -14%',
    });
  });

  it('has no live die effect before the player arms a die', () => {
    expect(routeDieReadout(null)).toBeNull();
    expect(routeDieReadout(undefined)).toBeNull();
  });
});
