import { describe, expect, it } from 'vitest';
import { createInitialState, startDay, type GameState } from '@spacerquest/engine';
import { manifestSheet, systemName } from '../format';

// ---------------------------------------------------------------------------
// T-190 · THE MANIFEST BOARD AS A PHYSICAL SHEET
//
// Selector tests over `format.ts`, never over `../store` (the store runs `init()`
// at module load and reaches for storage and sound) — the discipline
// `ship-diagram.test.ts` and `hangout-pane.test.ts` both keep.
//
// WHAT IS AND IS NOT COVERED HERE, stated rather than left implicit: this repo
// has no `@testing-library/react`, so the STOW state — the "clickable item" half
// of the owner's ask — is component state inside `Manifest` and is not reachable
// from a unit test. It is covered end-to-end, through real clicks on the real
// cockpit, by `packages/ui/e2e/manifest-object.spec.ts`. What IS unit-testable is
// the one non-obvious value the presentation depends on: `boardKey`, the React
// key whose CHANGE is what makes a newly generated board visibly re-post itself.
// If that key stopped moving with (port, day), the animation would silently stop
// firing and no e2e assertion would notice — hence these tests.
//
// The contract they defend: `manifestSheet` RE-READS state the manifest header
// already rendered and INVENTS nothing.
// ---------------------------------------------------------------------------

/** A deterministic starting career: day 1, docked at Sol, with a POSTED board.
 *  `startDay` is what generates the manifest board (engine `day.ts` →
 *  `generateManifestBoard`), so it is the same pair of calls `store.ts` boots a
 *  career with — a bare `createInitialState` would leave the board empty and the
 *  offer-count assertions would be testing nothing. */
function career(): GameState {
  return startDay(createInitialState(424242)).state;
}

/** Clone with the day and/or the docked system moved, without touching the
 *  original — the two axes the board's identity is built from. */
function moved(game: GameState, opts: { day?: number; systemId?: number }): GameState {
  return {
    ...game,
    day: opts.day ?? game.day,
    player: { ...game.player, currentSystemId: opts.systemId ?? game.player.currentSystemId },
  };
}

describe('manifestSheet · the header it renders', () => {
  it('names the port the player is docked at, using the same reader the pane uses', () => {
    const game = career();
    const sheet = manifestSheet(game);
    expect(sheet.portName).toBe(systemName(game.player.currentSystemId));
    expect(sheet.portName.length).toBeGreaterThan(0);
  });

  it('counts exactly the offers on the engine board — no filter, no derivation', () => {
    const game = career();
    expect(manifestSheet(game).offerCount).toBe(game.market.manifestBoard.length);
    expect(manifestSheet(game).offerCount).toBeGreaterThan(0);
  });

  it('carries the day the board was posted', () => {
    const game = career();
    expect(manifestSheet(game).day).toBe(game.day);
    expect(manifestSheet(moved(game, { day: 9 })).day).toBe(9);
  });
});

describe('manifestSheet · boardKey, the re-post trigger', () => {
  it('is stable for the same port on the same day', () => {
    const game = career();
    expect(manifestSheet(game).boardKey).toBe(manifestSheet(game).boardKey);
    // A re-render that changes neither axis must NOT remount the sheet, or the
    // paper would flap on every unrelated state change (a die armed, a notice).
    const unrelated: GameState = { ...game, dayEventCount: game.dayEventCount + 3 };
    expect(manifestSheet(unrelated).boardKey).toBe(manifestSheet(game).boardKey);
  });

  it('changes when the day advances (the engine regenerates the board at dawn)', () => {
    const game = career();
    expect(manifestSheet(moved(game, { day: game.day + 1 })).boardKey).not.toBe(
      manifestSheet(game).boardKey,
    );
  });

  it('changes when the ship docks at a different port', () => {
    const game = career();
    const elsewhere = game.player.currentSystemId + 1;
    expect(manifestSheet(moved(game, { systemId: elsewhere })).boardKey).not.toBe(
      manifestSheet(game).boardKey,
    );
  });

  it('is `${systemId}:${day}` — one key per posting, never colliding across ports', () => {
    const game = career();
    const keys = new Set<string>();
    for (const systemId of [0, 1, 2, 3]) {
      for (const day of [1, 2, 3]) {
        keys.add(manifestSheet(moved(game, { systemId, day })).boardKey);
      }
    }
    expect(keys.size).toBe(12);
    expect(manifestSheet(moved(game, { systemId: 5, day: 7 })).boardKey).toBe('5:7');
  });
});

describe('manifestSheet · a dark board', () => {
  it('reports zero offers and a well-formed key — no throw, no NaN, no undefined', () => {
    const game = career();
    const dark: GameState = { ...game, market: { ...game.market, manifestBoard: [] } };
    const sheet = manifestSheet(dark);
    expect(sheet.offerCount).toBe(0);
    // Every field is rendered into the DOM (two of them into attributes), so an
    // `undefined` or a `NaN` here would ship as literal text on the console.
    expect(sheet.boardKey).toMatch(/^\d+:\d+$/);
    expect(sheet.boardKey).not.toContain('undefined');
    expect(sheet.boardKey).not.toContain('NaN');
    expect(Number.isFinite(sheet.day)).toBe(true);
    expect(sheet.portName).not.toContain('undefined');
  });
});

describe('manifestSheet · invents nothing, mutates nothing', () => {
  it('is pure: two calls agree and the state is untouched', () => {
    const game = career();
    const before = JSON.parse(JSON.stringify(game)) as GameState;
    const first = manifestSheet(game);
    const second = manifestSheet(game);
    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(game))).toEqual(before);
  });

  it('adds no field the engine does not already own', () => {
    // The whole sheet is four values, and every one of them is a re-read: the
    // port name (from `currentSystemId`), the offer count (`manifestBoard.length`),
    // the day, and a string composed of the first and the third. If this list
    // ever grows, the UI has started owning state — which is the thing this task
    // was explicitly not allowed to do (no docking flag, no `player.docked`).
    expect(Object.keys(manifestSheet(career())).sort()).toEqual([
      'boardKey',
      'day',
      'offerCount',
      'portName',
    ]);
  });
});
