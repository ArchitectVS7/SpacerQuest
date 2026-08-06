// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  check,
  createInitialState,
  navBonus,
  startDay,
  navDieFuelDiscount,
  navDieEvasionFactor,
  type GameState,
} from '@spacerquest/engine';
import { NEMESIS_SYSTEM_ID, NEMESIS_CROSSING_DC, STAR_SYSTEMS, Stat } from '@spacerquest/content';
import { RoutePreviewPanel } from '../RoutePreviewPanel';
import { routePreview, starmapGlobe, type GlobeView, type LabelMetrics } from '../format';

// ---------------------------------------------------------------------------
// T-193 · THE PANE TEST: THE DEAD "PILOT DC" MUST BE ABSENT FROM THE DOM.
//
// The sibling `route-preview.test.ts` pins the PREDICATE (`routeCheckReadout`).
// This file pins the RENDERING, because that is where the bug actually lived:
// `travelPreview` still computes a `dc` for every destination, and the panel
// printed it as "PILOT DC n" for every destination long after T-1605 deleted the
// pilot check from ordinary travel. A predicate test cannot see a regression that
// re-adds an unconditional DC to the JSX — only mounting the markup and looking
// for `data-testid="route-dc"` can.
//
// THE HARNESS is the one `vitest.config.ts` has always pointed at: a per-file
// `@vitest-environment jsdom` docblock plus `@testing-library/react`, inside the
// package's existing vitest run (`npm test`, the always-run gate). It is NOT the
// real-browser tier — that is Playwright, and it remains T-162/T-237's open
// thread. jsdom is paid for by this file alone; every other UI test stays on the
// `node` default.
//
// The Playwright specs (`e2e/starmap.spec.ts`, `e2e/nemesis-crossing.spec.ts`)
// still assert the same facts through real clicks. They are the belt; this is the
// braces, and it runs on every commit.
// ---------------------------------------------------------------------------

// `@testing-library/react` only self-registers its cleanup when vitest runs with
// `globals: true`; this package does not, so unmount explicitly between tests.
afterEach(cleanup);

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
    player: { ...game.player, dawnHand: { dice, spent: spent ?? dice.map(() => false) } },
  };
}

/** Every charted system that is neither where we stand nor the crossing. */
function ordinaryDests(game: GameState): number[] {
  return Object.values(STAR_SYSTEMS)
    .map((s) => s.id)
    .filter((id) => id !== game.player.currentSystemId && id !== NEMESIS_SYSTEM_ID);
}

function ordinaryDest(game: GameState): number {
  const [id] = ordinaryDests(game);
  expect(id).toBeDefined();
  return id;
}

/** An ordinary destination the tank can actually cover, so the confirm button's
 *  enabled state is the real one rather than a fuel refusal. */
function reachableOrdinaryDest(game: GameState): number {
  const id = ordinaryDests(game).find((d) => routePreview(game, d).reachable);
  expect(id).toBeDefined();
  return id!;
}

/** THE UNLOCKED CROSSING, as the game unlocks it: `nemesis.crossing.unlocked` is
 *  the flag `crossingStatus` reads and the flag the starmap's node set gates
 *  NEMESIS on, so setting it is what makes the crossing a destination the player
 *  can plot at all. Asserted below rather than assumed. */
function crossingUnlocked(game: GameState): GameState {
  return { ...game, flags: { ...game.flags, 'nemesis.crossing.unlocked': true } };
}

const METRICS: LabelMetrics = { widthOf: (t) => t.length * 4.8, ascent: 6.4, descent: 2.4 };
const VIEW: GlobeView = { yaw: 0, pitch: 0, zoom: 1 };

/** Is `dest` a node the starmap actually offers? (The panel only ever opens on
 *  one, so this is the precondition every case below is entitled to.) */
function isPlottable(game: GameState, dest: number): boolean {
  return starmapGlobe(game, VIEW, METRICS, {}).nodes.some((n) => n.id === dest);
}

function renderPanel(
  game: GameState,
  dest: number,
  armedDieIndex: number | null,
  onConfirm = () => {},
) {
  return render(
    <RoutePreviewPanel
      game={game}
      dest={dest}
      armedDieIndex={armedDieIndex}
      onConfirm={onConfirm}
    />,
  );
}

describe('T-193 · the route-preview panel renders no Pilot DC for an ordinary jump', () => {
  it('renders the "no check" row, and no route-dc element, with no die armed', () => {
    const game = career();
    const dest = ordinaryDest(game);
    expect(isPlottable(game, dest)).toBe(true);
    renderPanel(game, dest, null);

    // THE ACCEPTANCE FACT: the testid is not merely empty, it is not in the DOM.
    expect(screen.queryAllByTestId('route-dc')).toHaveLength(0);
    // …and neither is the label, so a regression that drops the testid but keeps
    // the misleading words still fails.
    expect(screen.queryByText(/PILOT DC/)).toBeNull();
    expect(screen.getByTestId('route-no-check').textContent).toBe(
      'NONE — every jump with fuel arrives',
    );
    expect(screen.queryAllByTestId('route-die-effect')).toHaveLength(0);
    // The row is present, not missing: the absence of a DC is a stated claim.
    expect(screen.getAllByTestId('route-check')).toHaveLength(1);
  });

  it('renders the armed die’s real effect instead — the engine’s own numbers', () => {
    const game = withHand(career(), [17, 3, 9, 12, 5]);
    const dest = ordinaryDest(game);
    renderPanel(game, dest, 0);

    expect(screen.queryAllByTestId('route-dc')).toHaveLength(0);
    expect(screen.queryByText(/PILOT DC/)).toBeNull();
    // Percentages recomputed here from the ENGINE helpers, never typed as
    // literals, so a retune moves this expectation with the rule.
    const fuelPct = Math.round(navDieFuelDiscount(17) * 100);
    const evasionPct = Math.round((1 - navDieEvasionFactor(17)) * 100);
    expect(screen.getByTestId('route-die-effect').textContent).toBe(
      `FUEL −${fuelPct}% · ENCOUNTER −${evasionPct}%`,
    );
    // The FACE, not the hand index.
    expect(screen.getByTestId('route-check').textContent).toContain('DIE 17');
  });

  it('renders no route-dc for ANY charted ordinary destination, armed or unarmed', () => {
    // L-018 negative control at the DOM level: a component stubbed to always
    // render the DC row fails here, and one stubbed to never render it fails the
    // crossing case below.
    const game = withHand(career(), [13, 13, 13, 13, 13]);
    const dests = ordinaryDests(game);
    expect(dests.length).toBeGreaterThan(10);
    for (const dest of dests) {
      for (const armed of [null, 0]) {
        const view = renderPanel(game, dest, armed);
        expect(view.queryAllByTestId('route-dc')).toHaveLength(0);
        expect(view.getAllByTestId('route-check')).toHaveLength(1);
        view.unmount();
      }
    }
  });
});

describe('T-193 · the unlocked Nemesis crossing keeps its real DC', () => {
  it('renders route-dc with the content DC — the number resolveTravel rolls against', () => {
    const game = crossingUnlocked(withHand(career(), [17, 3, 9, 12, 5]));
    // The crossing is genuinely OPEN: the starmap offers it as a destination.
    expect(isPlottable(game, NEMESIS_SYSTEM_ID)).toBe(true);
    renderPanel(game, NEMESIS_SYSTEM_ID, null);

    expect(screen.getByTestId('route-dc').textContent).toBe(String(NEMESIS_CROSSING_DC));
    // Read THROUGH the preview, so panel and resolver cannot drift.
    expect(screen.getByTestId('route-dc').textContent).toBe(
      String(routePreview(game, NEMESIS_SYSTEM_ID).dc),
    );
    expect(screen.getByTestId('route-check').textContent).toContain('PILOT DC');
    expect(screen.queryAllByTestId('route-die-effect')).toHaveLength(0);
    expect(screen.queryAllByTestId('route-no-check')).toHaveLength(0);
  });

  it('still renders the DC with a die armed — the crossing rolls, it does not discount', () => {
    const game = crossingUnlocked(withHand(career(), [20, 20, 20, 20, 20]));
    renderPanel(game, NEMESIS_SYSTEM_ID, 0);
    expect(screen.getByTestId('route-dc').textContent).toBe(String(NEMESIS_CROSSING_DC));
    expect(screen.queryAllByTestId('route-die-effect')).toHaveLength(0);
  });

  // ---- T-194 · the crossing's DC is now a LIVE read once a die is armed ----
  it('is a PLANNING read with no die armed: the DC, and no pass/fail claim', () => {
    const game = crossingUnlocked(withHand(career(), [17, 3, 9, 12, 5]));
    renderPanel(game, NEMESIS_SYSTEM_ID, null);
    const row = screen.getByTestId('check-preview');
    expect(row.getAttribute('data-kind')).toBe('plan');
    expect(row.getAttribute('data-surface')).toBe('crossing');
    expect(screen.queryAllByTestId('check-preview-result')).toHaveLength(0);
    // `route-dc` still holds the bare number, which is what
    // `e2e/nemesis-crossing.spec.ts` and the case above assert.
    expect(screen.getByTestId('route-dc').textContent).toBe(String(NEMESIS_CROSSING_DC));
  });

  it('goes LIVE with a die armed: that face, that DC, and whether it clears', () => {
    const game = crossingUnlocked(withHand(career(), [17, 3, 9, 12, 5]));
    renderPanel(game, NEMESIS_SYSTEM_ID, 0);
    const row = screen.getByTestId('check-preview');
    expect(row.getAttribute('data-kind')).toBe('live');
    expect(row.getAttribute('data-outcome')).not.toBeNull();
    // The FACE, not the hand index — and the DC is still the content DC, in the
    // same testid, so nothing downstream of this row had to change.
    expect(screen.getByTestId('check-preview-die').textContent).toBe('17');
    expect(screen.getByTestId('route-dc').textContent).toBe(String(NEMESIS_CROSSING_DC));
    // The result is the ENGINE's: PILOT + navBonus against the crossing DC.
    const modifier = game.player.stats[Stat.PILOT] + navBonus(game.player.ship);
    const expected = check(17, modifier, routePreview(game, NEMESIS_SYSTEM_ID).dc);
    expect(screen.getByTestId('check-preview-total').textContent).toBe(String(expected.total));
    expect(row.getAttribute('data-outcome')).toBe(expected.success ? 'pass' : 'fail');
  });

  it('a spent slot is not "armed": the crossing falls back to the planning read', () => {
    const game = crossingUnlocked(
      withHand(career(), [17, 3, 9, 12, 5], [true, false, false, false, false]),
    );
    renderPanel(game, NEMESIS_SYSTEM_ID, 0);
    expect(screen.getByTestId('check-preview').getAttribute('data-kind')).toBe('plan');
  });
});

describe('T-193 · the rest of the panel is unchanged by the extraction', () => {
  it('shows the engine’s distance / fuel / danger, unchanged', () => {
    const game = career();
    const dest = ordinaryDest(game);
    const preview = routePreview(game, dest);
    renderPanel(game, dest, null);
    expect(screen.getByTestId('route-distance').textContent).toBe(String(preview.distance));
    expect(screen.getByTestId('route-fuel').textContent).toBe(String(preview.fuelCost));
    expect(screen.getByTestId('route-danger').textContent).toBe(String(preview.dangerLevel));
  });

  it('gates the confirm button on an armed die, and commits when clicked', () => {
    const game = withHand(career(), [11, 11, 11, 11, 11]);
    const dest = reachableOrdinaryDest(game);

    const unarmed = renderPanel(game, dest, null);
    const idle = unarmed.getByTestId('confirm-jump');
    expect(idle.textContent).toBe('Pick a die to jump');
    expect((idle as HTMLButtonElement).disabled).toBe(true);
    unarmed.unmount();

    const onConfirm = vi.fn();
    renderPanel(game, dest, 0, onConfirm);
    const live = screen.getByTestId('confirm-jump');
    expect(live.textContent).toBe('Confirm jump');
    expect((live as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(live);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
