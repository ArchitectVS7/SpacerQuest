import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  startDay,
  navDieFuelDiscount,
  navDieEvasionFactor,
  type GameState,
} from '@spacerquest/engine';
import { NEMESIS_SYSTEM_ID, NEMESIS_CROSSING_DC, STAR_SYSTEMS } from '@spacerquest/content';
import { routeCheckReadout, routePreview } from '../format';

// ---------------------------------------------------------------------------
// T-193 · THE STARMAP MUST NOT ADVERTISE A CHECK THAT CANNOT FAIL
//
// The route panel printed "PILOT DC n" for every destination, but T-1605 deleted
// the pilot check from ordinary travel (engine `actions/travel.ts`: only the
// `isCrossing` branch still calls `check(...)`). These tests pin the replacement
// selector, `routeCheckReadout`: a DC ONLY where the resolver really rolls one,
// and otherwise the armed die's real T-195 effect (fuel discount + encounter
// evasion) or a stated "no check".
//
// HARNESS REALITY, stated rather than implied: this package has no jsdom and no
// `@testing-library/react` (`vitest.config.ts` sets `environment: 'node'`), and
// the task explicitly forbids standing one up. So these are SELECTOR tests over
// `format.ts` — never over `../store`, which calls `init()` at module load — the
// same discipline `manifest-board.test.ts` / `hangout-pane.test.ts` keep. The DOM
// half of the acceptance (that `data-testid="route-dc"` is ABSENT from the panel
// for an ordinary destination, and present for the crossing) is asserted through
// real clicks in `packages/ui/e2e/starmap.spec.ts` and
// `packages/ui/e2e/nemesis-crossing.spec.ts`.
// ---------------------------------------------------------------------------

/** A deterministic day-1 career WITH a real dawn hand — `startDay` is what rolls
 *  `player.dawnHand`, and every "is a die armed" branch reads it. */
function career(seed = 1): GameState {
  return startDay(createInitialState(seed)).state;
}

/** Replace the dealt hand with an exact one, so a test can name the face it
 *  expects instead of hunting a seed that deals it. */
function withHand(game: GameState, dice: number[], spent?: boolean[]): GameState {
  return {
    ...game,
    player: {
      ...game.player,
      dawnHand: { dice, spent: spent ?? dice.map(() => false) },
    },
  };
}

/** Every charted system that is neither where we stand nor the crossing.
 *  (`STAR_SYSTEMS` is a Record keyed by id, not an array.) */
function ordinaryDests(game: GameState): number[] {
  return Object.values(STAR_SYSTEMS)
    .map((s) => s.id)
    .filter((id) => id !== game.player.currentSystemId && id !== NEMESIS_SYSTEM_ID);
}

/** Any ordinary (non-crossing) destination other than where we are standing. */
function ordinaryDest(game: GameState): number {
  const [id] = ordinaryDests(game);
  expect(id).toBeDefined();
  return id;
}

describe('T-193 · routeCheckReadout — ordinary jumps report no DC', () => {
  it('reports no check at all when no die is armed', () => {
    const game = career();
    expect(routeCheckReadout(game, ordinaryDest(game), null)).toEqual({ kind: 'no-check' });
  });

  it('reports the armed die and its real effect once a die is armed', () => {
    const game = withHand(career(), [17, 3, 9, 12, 5]);
    const readout = routeCheckReadout(game, ordinaryDest(game), 0);
    expect(readout.kind).toBe('die-effect');
    if (readout.kind !== 'die-effect') throw new Error('unreachable');
    // The FACE at that hand index, not the index itself.
    expect(readout.die).toBe(17);
  });

  it('matches the engine helpers for every face 1..20', () => {
    const base = career();
    const dest = ordinaryDest(base);
    for (let face = 1; face <= 20; face++) {
      const readout = routeCheckReadout(withHand(base, [face]), dest, 0);
      expect(readout).toEqual({
        kind: 'die-effect',
        die: face,
        fuelPct: Math.round(navDieFuelDiscount(face) * 100),
        evasionPct: Math.round((1 - navDieEvasionFactor(face)) * 100),
      });
    }
  });

  it('pins the endpoints explicitly, so a helper retune is visible not tautological', () => {
    const base = career();
    const dest = ordinaryDest(base);
    // A nat 1 honestly reads 0%/0% — that IS its live effect, and showing it is
    // the teaching. It must NOT be special-cased back into `no-check`.
    expect(routeCheckReadout(withHand(base, [1]), dest, 0)).toEqual({
      kind: 'die-effect',
      die: 1,
      fuelPct: 0,
      evasionPct: 0,
    });
    // A nat 20 buys the engine's full NAV_DIE_FUEL_DISCOUNT_MAX / NAV_DIE_EVASION_MAX.
    expect(routeCheckReadout(withHand(base, [20]), dest, 0)).toEqual({
      kind: 'die-effect',
      die: 20,
      fuelPct: 15,
      evasionPct: 20,
    });
  });

  it('treats an already-spent slot, an out-of-range index and a missing hand as no die armed', () => {
    const base = career();
    const dest = ordinaryDest(base);
    // Index 1 is spent — the player cannot arm it, so it has no effect to show.
    expect(routeCheckReadout(withHand(base, [11, 11], [false, true]), dest, 1)).toEqual({
      kind: 'no-check',
    });
    expect(routeCheckReadout(withHand(base, [11, 11]), dest, 5)).toEqual({ kind: 'no-check' });
    expect(routeCheckReadout(withHand(base, [11, 11]), dest, -1)).toEqual({ kind: 'no-check' });
    const handless: GameState = {
      ...base,
      player: { ...base.player, dawnHand: undefined },
    };
    expect(routeCheckReadout(handless, dest, 0)).toEqual({ kind: 'no-check' });
  });
});

describe('T-193 · routeCheckReadout — the crossing keeps its real DC', () => {
  it('reports the content DC, and the same number the preview quotes', () => {
    const game = withHand(career(), [17, 3, 9, 12, 5]);
    const readout = routeCheckReadout(game, NEMESIS_SYSTEM_ID, null);
    expect(readout).toEqual({ kind: 'dc', dc: NEMESIS_CROSSING_DC });
    // Read THROUGH the preview, never recomputed — the panel and the resolver
    // cannot drift apart.
    if (readout.kind !== 'dc') throw new Error('unreachable');
    expect(readout.dc).toBe(routePreview(game, NEMESIS_SYSTEM_ID).dc);
  });

  it('stays a DC even with a die armed — the crossing gets no discount and no encounter roll', () => {
    const game = withHand(career(), [20, 20, 20, 20, 20]);
    expect(routeCheckReadout(game, NEMESIS_SYSTEM_ID, 0)).toEqual({
      kind: 'dc',
      dc: NEMESIS_CROSSING_DC,
    });
  });
});

describe('T-193 · negative control — only the crossing may say "DC"', () => {
  // L-018 discipline: a stubbed `() => ({kind:'no-check'})` or a stubbed
  // `() => ({kind:'dc'})` must each fail one side of this pair.
  it('no charted ordinary system reports a DC, armed or unarmed, while the crossing does', () => {
    const base = withHand(career(), [13, 13, 13, 13, 13]);
    const ordinary = ordinaryDests(base);
    expect(ordinary.length).toBeGreaterThan(10);
    for (const id of ordinary) {
      expect(routeCheckReadout(base, id, null).kind).toBe('no-check');
      expect(routeCheckReadout(base, id, 0).kind).toBe('die-effect');
    }
    expect(routeCheckReadout(base, NEMESIS_SYSTEM_ID, 0).kind).toBe('dc');
    expect(routeCheckReadout(base, NEMESIS_SYSTEM_ID, null).kind).toBe('dc');
  });
});
