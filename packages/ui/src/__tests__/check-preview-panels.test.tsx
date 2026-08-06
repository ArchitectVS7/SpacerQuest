// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  applyPlayerAction,
  createInitialState,
  startDay,
  type EncounterState,
  type GameState,
} from '@spacerquest/engine';
import { EXPLORATION_FUEL_COST, EXPLORATION_NAV_DC, Stat } from '@spacerquest/content';
import { ExploreSweepPanel } from '../ExploreSweepPanel';
import { CombatStancePanel } from '../CombatStancePanel';
import { HaggleRow } from '../HaggleRow';
import { PeekControl } from '../PeekControl';
import { haggleCheckPreview, peekCheckPreview } from '../format';

// ---------------------------------------------------------------------------
// T-194 · THE FOUR PANES REALLY MOUNT THE ROW — AND THE EXTRACTION WAS INERT.
//
// Two claims per pane, and both are needed:
//
//   1. THE NEW BEHAVIOUR. Unarmed, the pane shows exactly one PLANNING read;
//      armed, exactly one LIVE read carrying the FACE (not the hand index). A
//      selector test cannot see a pane that forgot to render the row at all,
//      which is the regression this whole task exists to prevent recurring.
//   2. THE EXTRACTION WAS BEHAVIOUR-PRESERVING. Each pane was lifted verbatim out
//      of the 6,000-line `App.tsx` (which reaches `./store`, and `store` runs
//      `init()` at module load, so nothing there is mountable). The pre-existing
//      testids, labels, disabled gates and click wiring are asserted here, so the
//      move is PROVED inert rather than asserted to be — TT-13a bound (2).
//
// Same harness as `route-preview-panel.test.tsx`: a per-file jsdom docblock,
// `@testing-library/react`, explicit cleanup (this package runs without
// `globals`). `environment` stays `'node'` package-wide.
// ---------------------------------------------------------------------------

afterEach(cleanup);

const SUN_3 = 1;
const DEALER = 'npc-iron-vex';

function career(seed = 1): GameState {
  return startDay(createInitialState(seed)).state;
}

function withHand(game: GameState, dice: number[], spent?: boolean[]): GameState {
  return {
    ...game,
    player: { ...game.player, dawnHand: { dice, spent: spent ?? dice.map(() => false) } },
  };
}

function withEncounter(game: GameState, tier: number): GameState {
  const clone = JSON.parse(JSON.stringify(game)) as GameState;
  const interceptor: EncounterState['interceptor'] = {
    id: 'anon-pirate-1',
    source: 'anonymous',
    name: 'Capt.Brutus',
    shipName: 'Rustbucket',
    stats: { [Stat.PILOT]: 2, [Stat.GUNS]: 2, [Stat.TRADE]: 2, [Stat.GUILE]: 2, [Stat.GRIT]: 2 },
    tier: tier as EncounterState['interceptor']['tier'],
  };
  clone.encounter = {
    id: 'enc-1',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 2 },
    interceptor,
    routeDangerLevel: 3,
    routeDangerChance: 0.3,
    encounterRoll: 0.1,
    round: 1,
    enemyHull: 3,
  };
  return clone;
}

/** A day-1 career at Sol-3 with a Dare hand really open — the state the Peek
 *  control only exists in. */
function withDareHand(game: GameState): GameState {
  expect(game.player.currentSystemId).toBe(SUN_3);
  const { state } = applyPlayerAction(game, {
    type: 'VisitHangout',
    venue: 'dare',
    opponentId: DEALER,
    wager: 25,
  });
  expect(state.dareHand).not.toBeNull();
  return state;
}

/** The row every pane must render exactly one of, in the state under test. */
function theRow(): HTMLElement {
  const rows = screen.getAllByTestId('check-preview');
  expect(rows).toHaveLength(1);
  return rows[0];
}

/** The rendered rows, keyed by the `data-surface` each one names. */
function rowsBySurface(rows: HTMLElement[]): Record<string, HTMLElement> {
  const bySurface: Record<string, HTMLElement> = {};
  for (const row of rows) bySurface[row.getAttribute('data-surface') ?? ''] = row;
  return bySurface;
}

describe('T-194 · ExploreSweepPanel · the sweep shows its PILOT roll before the click', () => {
  const render1 = (game: GameState, armed: number | null, onSweep = () => {}) =>
    render(
      <ExploreSweepPanel game={game} armedDieIndex={armed} outcome={null} onSweep={onSweep} />,
    );

  it('unarmed: one PLANNING row, and no pass/fail claim', () => {
    render1(withHand(career(), [17, 3, 9, 12, 5]), null);
    const row = theRow();
    expect(row.getAttribute('data-kind')).toBe('plan');
    expect(row.getAttribute('data-surface')).toBe('explore');
    expect(screen.queryAllByTestId('check-preview-result')).toHaveLength(0);
  });

  it('armed: one LIVE row carrying the FACE, not the hand index', () => {
    render1(withHand(career(), [17, 3, 9, 12, 5]), 3);
    const row = theRow();
    expect(row.getAttribute('data-kind')).toBe('live');
    expect(screen.getByTestId('check-preview-die').textContent).toBe('12');
    expect(screen.getByTestId('check-preview-result')).toBeTruthy();
  });

  it('EXTRACTION INERT: explore-cost still names the DC and the fuel, armed or not', () => {
    // The e2e specs (`exploration`, `nemesis-funnel`) assert exactly this WITH a
    // die already armed, so both states have to carry the phrase.
    for (const armed of [null, 0]) {
      const view = render1(withHand(career(), [17, 3, 9, 12, 5]), armed);
      const cost = view.getByTestId('explore-cost').textContent ?? '';
      expect(cost).toContain(`PILOT DC ${EXPLORATION_NAV_DC}`);
      expect(cost).toContain(`FUEL ${EXPLORATION_FUEL_COST}`);
      expect(cost).toContain('NAV');
      view.unmount();
    }
  });

  it('EXTRACTION INERT: the button keeps its label ladder, its gate and its click', () => {
    const idle = render1(withHand(career(), [17, 3, 9, 12, 5]), null);
    const idleBtn = idle.getByTestId('explore-sweep');
    expect(idleBtn.textContent).toBe('Pick a die to sweep');
    expect((idleBtn as HTMLButtonElement).disabled).toBe(true);
    idle.unmount();

    const onSweep = vi.fn();
    render1(withHand(career(), [17, 3, 9, 12, 5]), 0, onSweep);
    const live = screen.getByTestId('explore-sweep');
    expect(live.textContent).toBe('Off-lane sweep');
    expect((live as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(live);
    expect(onSweep).toHaveBeenCalledTimes(1);
  });

  it('EXTRACTION INERT: a dry tank still names the fuel it needs and stays disabled', () => {
    const dry = career();
    const game = withHand(
      { ...dry, player: { ...dry.player, ship: { ...dry.player.ship, fuel: 0 } } },
      [17, 3],
    );
    render1(game, 0);
    const btn = screen.getByTestId('explore-sweep');
    expect(btn.textContent).toBe(`Need ${EXPLORATION_FUEL_COST} fuel`);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('T-194 · CombatStancePanel · all three stances read the same armed die', () => {
  const render1 = (game: GameState, armed: number | null, onStance = () => {}) =>
    render(<CombatStancePanel game={game} armedDieIndex={armed} onStance={onStance} />);

  it('unarmed: FIGHT and TALK plan, RUN is opposed — never a fabricated DC', () => {
    render1(withEncounter(withHand(career(), [17, 3, 9]), 3), null);
    const rows = screen.getAllByTestId('check-preview');
    expect(rows).toHaveLength(3);
    const bySurface = rowsBySurface(rows);
    expect(bySurface.fight.getAttribute('data-kind')).toBe('plan');
    expect(bySurface.talk.getAttribute('data-kind')).toBe('plan');
    expect(bySurface.run.getAttribute('data-kind')).toBe('opposed');
    expect(screen.queryAllByTestId('check-preview-result')).toHaveLength(0);
  });

  it('armed: FIGHT and TALK go live on the FACE; RUN still refuses to claim an outcome', () => {
    render1(withEncounter(withHand(career(), [17, 3, 9]), 3), 0);
    const rows = screen.getAllByTestId('check-preview');
    const bySurface = rowsBySurface(rows);
    expect(bySurface.fight.getAttribute('data-kind')).toBe('live');
    expect(bySurface.talk.getAttribute('data-kind')).toBe('live');
    expect(bySurface.run.getAttribute('data-kind')).toBe('opposed');
    expect(bySurface.fight.getAttribute('data-outcome')).not.toBeNull();
    expect(bySurface.run.getAttribute('data-outcome')).toBeNull();
    // Every row reads the SAME armed face — that comparison is the whole point.
    for (const surface of ['fight', 'talk', 'run']) {
      expect(
        bySurface[surface].querySelector('[data-testid="check-preview-die"]')?.textContent,
      ).toBe('17');
    }
  });

  it('EXTRACTION INERT: the three buttons keep their testids, gates, copy and clicks', () => {
    const idle = render1(withEncounter(withHand(career(), [17, 3, 9]), 3), null);
    for (const id of ['combat-fight', 'combat-talk', 'combat-run']) {
      const btn = idle.getByTestId(id);
      expect((btn as HTMLButtonElement).disabled).toBe(true);
      expect((btn as HTMLButtonElement).title).toBe('Pick a die first');
    }
    expect(idle.getByTestId('combat-tribute').textContent).toContain('tribute');
    expect(idle.container.textContent).toContain('Pick a die, then commit a stance.');
    idle.unmount();

    const onStance = vi.fn();
    render1(withEncounter(withHand(career(), [17, 3, 9]), 3), 0, onStance);
    for (const [id, stance] of [
      ['combat-fight', 'fight'],
      ['combat-talk', 'talk'],
      ['combat-run', 'run'],
    ] as const) {
      const btn = screen.getByTestId(id);
      expect((btn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(btn);
      expect(onStance).toHaveBeenCalledWith(stance);
    }
    expect(onStance).toHaveBeenCalledTimes(3);
    // The stance hint is gone once a die is armed, exactly as before the move.
    expect(screen.queryByText('Pick a die, then commit a stance.')).toBeNull();
  });

  it('renders nothing at all with no encounter', () => {
    const { container } = render1(withHand(career(), [17, 3]), 0);
    expect(container.innerHTML).toBe('');
  });
});

describe('T-194 · HaggleRow · the TRADE roll is visible beside the button', () => {
  const render1 = (game: GameState, armed: number | null, haggled = false) => {
    const preview = haggleCheckPreview(game, armed);
    return render(
      <HaggleRow haggled={haggled} armed={armed !== null} preview={preview} onHaggle={() => {}} />,
    );
  };

  it('unarmed: one planning row; armed: one live row on the face', () => {
    const idle = render1(withHand(career(), [17, 3, 9]), null);
    expect(idle.getAllByTestId('check-preview')).toHaveLength(1);
    expect(idle.getByTestId('check-preview').getAttribute('data-kind')).toBe('plan');
    idle.unmount();

    render1(withHand(career(), [17, 3, 9]), 2);
    expect(theRow().getAttribute('data-kind')).toBe('live');
    expect(screen.getByTestId('check-preview-die').textContent).toBe('9');
  });

  it('the hover title quotes the SAME DC the row renders — no typed literal', () => {
    render1(withHand(career(), [17, 3, 9]), 0);
    const dc = screen.getByTestId('check-preview-dc').textContent;
    expect(dc).toBeTruthy();
    const haggle = screen.getByTestId('haggle');
    expect((haggle as HTMLButtonElement).title).toBe(`Roll TRADE vs DC ${dc} to bump the payment`);
  });

  it('EXTRACTION INERT: SIGN is still free, HAGGLE still enabled once haggled, copy unchanged', () => {
    const fresh = render1(withHand(career(), [17]), null);
    const row = fresh.getByTestId('sign-row');
    expect(row.textContent).toContain('SIGN');
    expect(row.textContent).toContain('FREE');
    expect(row.textContent).toContain('click to sign');
    fresh.unmount();

    render1(withHand(career(), [17]), 0, true);
    const btn = screen.getByTestId('haggle');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(btn.className).toContain('done');
    expect((btn as HTMLButtonElement).title).toBe(
      'The broker will not renegotiate this contract again.',
    );
    // A contract already haggled cannot be rolled again, so no check is offered.
    expect(screen.queryAllByTestId('check-preview')).toHaveLength(0);
  });

  it('EXTRACTION INERT: the click fires once and does not reach the row beneath', () => {
    const onHaggle = vi.fn();
    const game = withHand(career(), [17]);
    render(
      <div
        onClick={() => {
          onHaggle('parent');
        }}
      >
        <HaggleRow
          haggled={false}
          armed
          preview={haggleCheckPreview(game, 0)}
          onHaggle={(e) => {
            e.stopPropagation();
            onHaggle('haggle');
          }}
        />
      </div>,
    );
    fireEvent.click(screen.getByTestId('haggle'));
    expect(onHaggle).toHaveBeenCalledTimes(1);
    expect(onHaggle).toHaveBeenCalledWith('haggle');
  });
});

describe('T-194 · PeekControl · the GUILE roll is visible before the second die is spent', () => {
  const render1 = (game: GameState, armed: number | null, onPeek = () => {}) =>
    render(
      <PeekControl
        peekDc={9}
        armed={armed !== null}
        preview={peekCheckPreview(game, armed)}
        label="Peek"
        onPeek={onPeek}
      />,
    );

  it('unarmed: one planning row; armed: one live row on the face', () => {
    const game = withDareHand(withHand(career(), [17, 3, 9, 12, 5]));
    const idle = render1(game, null);
    expect(idle.getByTestId('check-preview').getAttribute('data-kind')).toBe('plan');
    idle.unmount();

    render1(game, 1);
    expect(theRow().getAttribute('data-kind')).toBe('live');
    expect(screen.getByTestId('check-preview-die').textContent).toBe('3');
  });

  it('EXTRACTION INERT: the move button keeps its testid pair, gate, label and click', () => {
    const game = withDareHand(withHand(career(), [17, 3, 9, 12, 5]));
    const idle = render1(game, null);
    const idleBtn = idle.getByTestId('dare-move');
    expect(idleBtn.getAttribute('data-move')).toBe('peek');
    expect((idleBtn as HTMLButtonElement).disabled).toBe(true);
    expect((idleBtn as HTMLButtonElement).title).toBe('Pick a second die to peek');
    expect(idleBtn.textContent).toBe('Peek · DC 9');
    idle.unmount();

    const onPeek = vi.fn();
    render1(game, 0, onPeek);
    const live = screen.getByTestId('dare-move');
    expect((live as HTMLButtonElement).disabled).toBe(false);
    expect((live as HTMLButtonElement).title).toContain('GUILE 9');
    fireEvent.click(live);
    expect(onPeek).toHaveBeenCalledTimes(1);
  });
});
