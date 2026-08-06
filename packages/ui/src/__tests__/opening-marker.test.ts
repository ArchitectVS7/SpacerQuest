import { describe, expect, it } from 'vitest';
import { createInitialState, startDay, type GameState } from '@spacerquest/engine';
import {
  armedOpeningMarker,
  openingMarkerPending,
  openingMarkerView,
  parseOpeningMarker,
  seenOpeningMarker,
  serializeOpeningMarker,
} from '../opening';

// ---------------------------------------------------------------------------
// T-200 · THE OPENING MARKER — the pure rules.
//
// Everything under test here is presentation logic with no engine rule in it, so
// it is unit-testable without a DOM (`vitest.config.ts` gives this package a
// `node` environment). The e2e (`e2e/opening-marker.spec.ts`) drives the beat
// through the real cockpit; this file guards the two things a browser test
// cannot cheaply reach:
//
//   1. `parseOpeningMarker` is TOTAL and DEFAULT-CLOSED, because it is read from
//      `init()` at module scope where a throw has no error boundary above it —
//      and because the closed direction is the safe one for a MODAL beat.
//   2. Every figure in the dispatch is DERIVED FROM `GameState`, never authored.
//      Test "the copy carries no economy constant of its own" below is the
//      standing guard on the Accept's "no economy constant changed": if anyone
//      ever pastes 25,000 or a 30-day countdown into the prose, it goes red.
//
// NOTE ON WHAT IS DELIBERATELY NOT ASSERTED: no test here compares the debt to a
// literal 25000 or the due day to a literal 30. Those live at
// `packages/engine/src/state.ts` and are the ENGINE's to own; a UI test pinning
// them would quietly make an economy constant un-tunable from a presentation
// suite. Every assertion below is an IDENTITY against live state instead.
// ---------------------------------------------------------------------------

const openingState = (): GameState => startDay(createInitialState(424242)).state;

describe('parseOpeningMarker', () => {
  it('is total over every malformed input, and defaults CLOSED', () => {
    // A corrupt record must never drop a full-screen dispatch over a career
    // already in flight — so unreadable means "already seen", the opposite of
    // `parseWalkthrough`'s `off` default (a missing tutorial record costs a turn
    // at worst; a spurious modal costs the player their place).
    for (const raw of [
      null,
      undefined,
      '',
      '{',
      'null',
      '[]',
      '"pending"',
      '{"v":2,"status":"pending"}',
      '{"v":1,"status":"nonsense"}',
      '{"v":1}',
      '{"v":"1","status":"pending"}',
      '[{"v":1,"status":"pending"}]',
    ]) {
      expect(parseOpeningMarker(raw)).toEqual({
        v: 1,
        status: 'seen',
      });
    }
  });

  it('a missing record parses as seen, never as pending', () => {
    expect(openingMarkerPending(parseOpeningMarker(null))).toBe(false);
  });

  it('round-trips a well-formed record through serialize', () => {
    const armed = armedOpeningMarker();
    expect(parseOpeningMarker(serializeOpeningMarker(armed))).toEqual(armed);
    const seen = seenOpeningMarker();
    expect(parseOpeningMarker(serializeOpeningMarker(seen))).toEqual(seen);
  });
});

describe('the marker record', () => {
  it('armed is pending and seen is not', () => {
    expect(armedOpeningMarker()).toEqual({ v: 1, status: 'pending' });
    expect(seenOpeningMarker()).toEqual({ v: 1, status: 'seen' });
    expect(openingMarkerPending(armedOpeningMarker())).toBe(true);
    expect(openingMarkerPending(seenOpeningMarker())).toBe(false);
  });
});

describe('openingMarkerView', () => {
  it('reports the ENGINE’s own opening debt and due day, as an identity', () => {
    const game = openingState();
    const view = openingMarkerView(game);
    expect(view.debt).toBe(game.player.debt);
    expect(view.dueDay).toBe(game.player.debtDueDay);
    expect(view.debtLabel).toBe(`${game.player.debt.toLocaleString()} CR`);
  });

  it('counts the days left from today, and floors at zero', () => {
    const game = openingState();
    const view = openingMarkerView(game);
    expect(view.dueInDays).toBe(game.player.debtDueDay - game.day);

    const overdue: GameState = { ...game, day: game.player.debtDueDay + 4 };
    expect(openingMarkerView(overdue).dueInDays).toBe(0);
    expect(openingMarkerView(overdue).dueLabel).toBe('0 days');

    const tomorrow: GameState = { ...game, day: game.player.debtDueDay - 1 };
    expect(openingMarkerView(tomorrow).dueLabel).toBe('1 day');
  });

  it('follows a paid-down marker — the figure is derived, not baked', () => {
    const game = openingState();
    const paid: GameState = { ...game, player: { ...game.player, debt: 1234 } };
    const view = openingMarkerView(paid);
    expect(view.debt).toBe(1234);
    expect(view.debtLabel).toBe(`${(1234).toLocaleString()} CR`);
    // And it still is not the engine's opening figure, which is the point.
    expect(view.debt).not.toBe(game.player.debt);
  });

  it('the copy carries no economy constant of its own', () => {
    const game = openingState();
    const view = openingMarkerView(game);
    // `Sol-3` is a PLACE, not a quantity — the content pack's own system name —
    // so it is the one digit the copy is allowed and it is stripped before the
    // scan rather than weakening the scan itself.
    const scrub = (s: string): string => s.replace(/sol-3/gi, 'Sol');
    const authored = scrub(
      [view.kicker, view.title, view.signOff, view.stamp, view.actionLabel].join(' '),
    );
    // Nothing else hand-authored may carry a digit at all: the debt, the due day
    // and the interest rate are the engine's to state, and a copy that spells one
    // out is a second source of truth that will drift the first time it is tuned.
    expect(authored).not.toMatch(/\d/);
    // The prose's ONLY quantity is the interpolated countdown.
    const prose = view.prose.join(' ');
    expect(prose).toContain(view.dueLabel);
    expect(scrub(prose).replace(view.dueLabel, '')).not.toMatch(/\d/);
    for (const forbidden of ['25,000', '25000', '30 days', 'day 30']) {
      expect(prose.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('names the PRIOR OBLIGATIONS the Accept asks for, and the Guild that holds them', () => {
    const view = openingMarkerView(openingState());
    const prose = view.prose.join(' ').toLowerCase();
    expect(prose).toContain('prior obligations');
    expect(prose).toContain('merchant guild of sol-3');
    expect(view.prose.length).toBeGreaterThan(0);
  });
});
