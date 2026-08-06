import { describe, expect, it } from 'vitest';
import { createInitialState, startDay, type GameState } from '@spacerquest/engine';
import { ledgerFascia, offersForSurface, systemName } from '../format';

// ---------------------------------------------------------------------------
// T-191 · THE PORT LEDGER AS A SERVICE RACK
//
// Selector tests over `format.ts`, never over `../store` (the store runs `init()`
// at module load and reaches for storage and sound) — the discipline
// `manifest-board.test.ts`, `ship-diagram.test.ts` and `hangout-pane.test.ts` all
// keep.
//
// WHAT IS AND IS NOT COVERED HERE, stated rather than left implicit. This repo
// has no `@testing-library/react`, so the RENDERED rack — the rail, the chamfered
// plates, the five stencil glyphs, and the three animations they carry — is not
// reachable from a unit test at all. It is covered end-to-end, through real
// clicks on the real cockpit, by `packages/ui/e2e/port-ledger.spec.ts` (T-190's
// precedent, and the reason that spec asserts on computed styles and bounding
// boxes rather than on prose).
//
// What IS unit-testable is the thing the presentation hangs off: the three
// re-mount keys. Each animation fires because a React `key` changed, so a key
// that quietly stopped moving with its engine value — or started moving when
// nothing moved — would silently break the motion, or fire it at random, with no
// e2e assertion noticing. Hence these tests.
//
// The contract they defend: `ledgerFascia` RE-READS numbers the Port Ledger
// already renders and INVENTS nothing.
// ---------------------------------------------------------------------------

/** A deterministic starting career: day 1, docked at Sol, with the day's port
 *  dispatches already on offer. `startDay` is what generates them (engine
 *  `day.ts`), so it is the same pair of calls `store.ts` boots a career with — a
 *  bare `createInitialState` would leave the offer set empty and the
 *  `dispatchKey` assertions would be testing nothing. */
function career(): GameState {
  return startDay(createInitialState(424242)).state;
}

/** Clone with the ship's tank moved, without touching the original. */
function withTank(game: GameState, fuel: number, maxFuel?: number): GameState {
  return {
    ...game,
    player: {
      ...game.player,
      ship: { ...game.player.ship, fuel, maxFuel: maxFuel ?? game.player.ship.maxFuel },
    },
  };
}

/** Clone with the Guild marker moved, without touching the original. */
function withMarker(game: GameState, debt: number, debtDueDay?: number): GameState {
  return {
    ...game,
    player: {
      ...game.player,
      debt,
      debtDueDay: debtDueDay ?? game.player.debtDueDay,
    },
  };
}

/** Clone with the live offer array replaced — the axis `dispatchKey` reads. */
function withOffers(game: GameState, available: GameState['storylets']['available']): GameState {
  return { ...game, storylets: { ...game.storylets, available } };
}

describe('ledgerFascia · the port it serves', () => {
  it('names the port the player is docked at, using the same reader the pane uses', () => {
    const game = career();
    const fascia = ledgerFascia(game);
    expect(fascia.portName).toBe(systemName(game.player.currentSystemId));
    expect(fascia.portName.length).toBeGreaterThan(0);
  });
});

describe('ledgerFascia · fuelKey', () => {
  it('prints exactly the pair the FUEL DEPOT readout prints', () => {
    const game = career();
    const { fuel, maxFuel } = game.player.ship;
    expect(ledgerFascia(game).fuelKey).toBe(`${fuel}/${maxFuel}`);
  });

  it('moves when the tank moves — a purchase or a burn', () => {
    const game = career();
    const before = ledgerFascia(game).fuelKey;
    expect(ledgerFascia(withTank(game, game.player.ship.fuel - 60)).fuelKey).not.toBe(before);
  });

  it('moves when the TANK CEILING moves — a hull upgrade is a real change too', () => {
    const game = career();
    const before = ledgerFascia(game).fuelKey;
    const upgraded = withTank(game, game.player.ship.fuel, game.player.ship.maxFuel + 100);
    expect(ledgerFascia(upgraded).fuelKey).not.toBe(before);
  });

  it('is STABLE across an unrelated change — a day advance that touches no fuel', () => {
    // If this ever fails, the fuel readout would tick on every re-render and the
    // animation would stop meaning "the tank moved".
    const game = career();
    const before = ledgerFascia(game).fuelKey;
    const later: GameState = { ...game, day: game.day + 1, credits: 1 } as GameState;
    expect(ledgerFascia(later).fuelKey).toBe(before);
  });
});

describe('ledgerFascia · debtKey', () => {
  it('carries both halves of the marker the GUILD DEBT module renders', () => {
    const game = career();
    expect(ledgerFascia(game).debtKey).toBe(`${game.player.debt}:${game.player.debtDueDay}`);
  });

  it('moves on a pay-down, and moves again when the marker is cleared outright', () => {
    const game = career();
    const before = ledgerFascia(game).debtKey;
    const paid = ledgerFascia(withMarker(game, game.player.debt - 500)).debtKey;
    const cleared = ledgerFascia(withMarker(game, 0)).debtKey;
    expect(paid).not.toBe(before);
    expect(cleared).not.toBe(before);
    expect(cleared).not.toBe(paid);
  });

  it('moves when the due day is re-markered, even at an unchanged balance', () => {
    const game = career();
    const before = ledgerFascia(game).debtKey;
    expect(ledgerFascia(withMarker(game, game.player.debt, game.player.debtDueDay + 30)).debtKey)
      // A re-marker is a real change to what the module shows, so it must tick.
      .not.toBe(before);
  });
});

describe('ledgerFascia · dispatchKey', () => {
  it('names exactly the live PORT-surface offers, and nothing else', () => {
    const game = career();
    const ids = offersForSurface(game, 'port')
      .map((o) => o.storyletId)
      .sort();
    expect(ids.length).toBeGreaterThan(0);
    expect(ledgerFascia(game).dispatchKey).toBe(ids.join('|'));
  });

  it('is ORDER-INDEPENDENT: an engine-side reordering fires no spurious re-post', () => {
    const game = career();
    const before = ledgerFascia(game).dispatchKey;
    const shuffled = withOffers(game, [...game.storylets.available].reverse());
    expect(ledgerFascia(shuffled).dispatchKey).toBe(before);
  });

  it('moves when an offer leaves the board and when one arrives', () => {
    const game = career();
    const before = ledgerFascia(game).dispatchKey;
    const dropped = withOffers(game, game.storylets.available.slice(1));
    expect(ledgerFascia(dropped).dispatchKey).not.toBe(before);
    // …and re-adding it returns the ORIGINAL key: the set, not the history.
    expect(
      ledgerFascia(
        withOffers(dropped, [...dropped.storylets.available, game.storylets.available[0]]),
      ).dispatchKey,
    ).toBe(before);
  });
});

describe('ledgerFascia · well-formedness and purity', () => {
  it('yields well-formed keys on an empty board and a cleared marker', () => {
    const game = withOffers(withMarker(career(), 0), []);
    const fascia = ledgerFascia(game);
    expect(fascia.dispatchKey).toBe('');
    expect(fascia.debtKey).toBe(`0:${game.player.debtDueDay}`);
    // Nothing degenerate ever reaches a rendered attribute.
    for (const value of Object.values(fascia)) {
      expect(String(value)).not.toContain('NaN');
      expect(String(value)).not.toContain('undefined');
      expect(String(value)).not.toContain('null');
    }
  });

  it('is pure: two calls agree, the state is untouched, and it owns exactly four fields', () => {
    const game = career();
    const clone = structuredClone(game);
    const first = ledgerFascia(game);
    const second = ledgerFascia(game);
    expect(second).toEqual(first);
    expect(game).toEqual(clone);
    // The field-count guard: a fifth field would be the UI starting to own
    // state, which is the thing this selector exists to prevent (T-190's guard).
    expect(Object.keys(first).sort()).toEqual(['debtKey', 'dispatchKey', 'fuelKey', 'portName']);
  });
});
