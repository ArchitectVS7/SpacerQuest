// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { check } from '@spacerquest/engine';
import { Stat } from '@spacerquest/content';
import { CheckPreviewRow } from '../CheckPreviewRow';
import type { CheckPreview } from '../format';

// ---------------------------------------------------------------------------
// T-194 · THE PANE TEST FOR THE CHECK ROW ITSELF.
//
// The sibling `check-preview.test.ts` pins the PREDICATE. This file pins the
// RENDERING, because the acceptance clause is about what a player SEES: "a DC
// shown before any die is armed (planning view) must be visually distinct from a
// live per-die read". A selector test cannot see a component that renders both
// states identically, or that prints a pass/fail badge on a roll nobody has made.
//
// The harness is TT-13a's sanctioned exception — a per-file `@vitest-environment
// jsdom` docblock plus `@testing-library/react`, inside the package's existing
// vitest run. `environment` stays `'node'` package-wide.
// ---------------------------------------------------------------------------

// `@testing-library/react` only self-registers cleanup with `globals: true`;
// this package does not set it, so unmount explicitly between tests.
afterEach(cleanup);

const PLAN: CheckPreview = { kind: 'plan', stat: Stat.PILOT, dc: 12, modifier: 3 };
const LIVE_PASS: CheckPreview = { kind: 'live', stat: Stat.PILOT, result: check(14, 3, 12) };
const LIVE_FAIL: CheckPreview = { kind: 'live', stat: Stat.TRADE, result: check(4, 1, 12) };
const LIVE_CRIT: CheckPreview = { kind: 'live', stat: Stat.GUNS, result: check(20, 0, 30) };
const LIVE_FUMBLE: CheckPreview = { kind: 'live', stat: Stat.GUILE, result: check(1, 20, 5) };
const OPPOSED: CheckPreview = { kind: 'opposed', stat: Stat.PILOT, modifier: 3, die: 14 };
const OPPOSED_IDLE: CheckPreview = { kind: 'opposed', stat: Stat.PILOT, modifier: 3, die: null };

describe('T-194 · the planning read and the live read are distinguishable in the DOM', () => {
  it('plan carries data-kind="plan", the DC, and NO verdict of any kind', () => {
    render(<CheckPreviewRow preview={PLAN} />);
    const row = screen.getByTestId('check-preview');
    expect(row.getAttribute('data-kind')).toBe('plan');
    expect(row.getAttribute('data-outcome')).toBeNull();
    expect(row.getAttribute('data-verdict')).toBeNull();
    expect(screen.getByTestId('check-preview-dc').textContent).toBe('12');
    // The whole point of the plan/live split: no pass/fail claim before a roll.
    expect(screen.queryAllByTestId('check-preview-result')).toHaveLength(0);
    expect(screen.queryAllByTestId('check-preview-die')).toHaveLength(0);
    expect(screen.queryAllByTestId('check-preview-total')).toHaveLength(0);
    // …and it says what would turn it into a roll.
    expect(row.textContent).toContain('PILOT DC');
    expect(row.textContent).toContain('arm a die');
  });

  it('live carries data-kind="live", data-outcome, the FACE, the total and a verdict', () => {
    render(<CheckPreviewRow preview={LIVE_PASS} />);
    const row = screen.getByTestId('check-preview');
    expect(row.getAttribute('data-kind')).toBe('live');
    expect(row.getAttribute('data-outcome')).toBe('pass');
    expect(row.getAttribute('data-verdict')).toBe('pass');
    expect(screen.getByTestId('check-preview-die').textContent).toBe('14');
    expect(screen.getByTestId('check-preview-total').textContent).toBe('17');
    expect(screen.getByTestId('check-preview-dc').textContent).toBe('12');
    expect(screen.getByTestId('check-preview-result').textContent).toBe('CLEARS IT');
    // The DC phrase survives into the live state, which is what keeps
    // `explore-cost` / `route-dc` machine-checkable with a die already armed.
    expect(row.textContent).toContain('PILOT DC');
  });

  it('a failing live read says so, and the two states differ on every marker', () => {
    const pass = render(<CheckPreviewRow preview={LIVE_PASS} />);
    const passRow = pass.getByTestId('check-preview');
    const passMarkers = [
      passRow.getAttribute('data-kind'),
      passRow.getAttribute('data-outcome'),
      pass.getByTestId('check-preview-result').textContent,
    ];
    pass.unmount();

    render(<CheckPreviewRow preview={LIVE_FAIL} />);
    const failRow = screen.getByTestId('check-preview');
    expect(failRow.getAttribute('data-outcome')).toBe('fail');
    expect(screen.getByTestId('check-preview-result').textContent).toBe('FALLS SHORT');
    expect([
      failRow.getAttribute('data-kind'),
      failRow.getAttribute('data-outcome'),
      screen.getByTestId('check-preview-result').textContent,
    ]).not.toEqual(passMarkers);
  });

  it('the CSS hooks that carry the distinction are on the element, not just the data', () => {
    // `data-kind` is what the tests key on; the CLASS is what the stylesheet keys
    // on (`.check-preview.plan` dim / `.check-preview.live` lit). Both, or a
    // restyle silently un-distinguishes the two states.
    const plan = render(<CheckPreviewRow preview={PLAN} />);
    expect(plan.getByTestId('check-preview').className).toContain('plan');
    plan.unmount();
    render(<CheckPreviewRow preview={LIVE_PASS} />);
    expect(screen.getByTestId('check-preview').className).toContain('live');
  });
});

describe('T-194 · nat 20 and nat 1 keep their juice, read off the engine result', () => {
  it('a natural 20 renders the crit badge and the crit verdict', () => {
    render(<CheckPreviewRow preview={LIVE_CRIT} />);
    expect(screen.getByTestId('check-preview').getAttribute('data-verdict')).toBe('crit');
    // Total 20 against DC 30 — it only clears because the ENGINE auto-succeeds.
    expect(screen.getByTestId('check-preview-total').textContent).toBe('20');
    expect(screen.getByTestId('check-preview-dc').textContent).toBe('30');
    expect(screen.getByTestId('check-preview').getAttribute('data-outcome')).toBe('pass');
    expect(screen.getByTestId('check-preview-nat20').textContent).toBe('NATURAL 20');
    expect(screen.queryAllByTestId('check-preview-nat1')).toHaveLength(0);
  });

  it('a natural 1 renders the fumble badge and FAILS despite clearing on totals', () => {
    render(<CheckPreviewRow preview={LIVE_FUMBLE} />);
    expect(screen.getByTestId('check-preview').getAttribute('data-verdict')).toBe('fumble');
    expect(screen.getByTestId('check-preview-total').textContent).toBe('21');
    expect(screen.getByTestId('check-preview-dc').textContent).toBe('5');
    expect(screen.getByTestId('check-preview').getAttribute('data-outcome')).toBe('fail');
    expect(screen.getByTestId('check-preview-result').textContent).toBe('FALLS SHORT');
    expect(screen.getByTestId('check-preview-nat1').textContent).toBe('NATURAL 1');
  });
});

describe('T-194 · the opposed read invents no DC and claims no outcome (UI-30)', () => {
  it('renders the total and the "they roll" statement, with no DC and no verdict', () => {
    render(<CheckPreviewRow preview={OPPOSED} />);
    const row = screen.getByTestId('check-preview');
    expect(row.getAttribute('data-kind')).toBe('opposed');
    expect(row.getAttribute('data-outcome')).toBeNull();
    expect(screen.getByTestId('check-preview-die').textContent).toBe('14');
    expect(screen.getByTestId('check-preview-total').textContent).toBe('17');
    expect(screen.queryAllByTestId('check-preview-dc')).toHaveLength(0);
    expect(screen.queryAllByTestId('check-preview-result')).toHaveLength(0);
    expect(row.textContent).not.toContain('DC');
    expect(row.textContent).toContain('they roll to pursue');
  });

  it('with no die armed it says so instead of printing a total', () => {
    render(<CheckPreviewRow preview={OPPOSED_IDLE} />);
    expect(screen.queryAllByTestId('check-preview-total')).toHaveLength(0);
    expect(screen.getByTestId('check-preview').textContent).toContain('arm a die');
  });
});

describe('T-194 · `none` renders nothing, and the overrides do what they say', () => {
  it('renders no element at all for `none`', () => {
    const { container } = render(<CheckPreviewRow preview={{ kind: 'none' }} />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryAllByTestId('check-preview')).toHaveLength(0);
  });

  it('`surface` names the row, in every variant that renders', () => {
    for (const preview of [PLAN, LIVE_PASS, OPPOSED]) {
      const view = render(<CheckPreviewRow preview={preview} surface="talk" />);
      expect(view.getByTestId('check-preview').getAttribute('data-surface')).toBe('talk');
      view.unmount();
    }
  });

  it('`dcTestId` moves the DC testid in BOTH the plan and the live state', () => {
    // Load-bearing: `e2e/nemesis-crossing.spec.ts` arms a die and THEN asserts
    // `route-dc` has exactly the content DC, so the override must survive the
    // plan → live transition.
    const plan = render(<CheckPreviewRow preview={PLAN} dcTestId="route-dc" />);
    expect(plan.getByTestId('route-dc').textContent).toBe('12');
    expect(plan.queryAllByTestId('check-preview-dc')).toHaveLength(0);
    plan.unmount();

    render(<CheckPreviewRow preview={LIVE_PASS} dcTestId="route-dc" />);
    expect(screen.getByTestId('route-dc').textContent).toBe('12');
    expect(screen.queryAllByTestId('check-preview-dc')).toHaveLength(0);
  });
});
