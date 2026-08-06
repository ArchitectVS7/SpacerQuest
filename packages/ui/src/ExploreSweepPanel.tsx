import type { GameState } from '@spacerquest/engine';
import { explorationPreview, recoveryReadout, exploreCheckPreview, signedMargin } from './format';
import { CheckPreviewRow } from './CheckPreviewRow';

// ---------------------------------------------------------------------------
// T-194 · THE OFF-LANE SWEEP PANEL, LIFTED OUT OF `App.tsx` SO ITS CHECK READ CAN
// BE MOUNTED BY A TEST.
//
// The move is BEHAVIOUR-PRESERVING BY CONSTRUCTION, on `RoutePreviewPanel.tsx`'s
// terms (T-193, TT-13a): the markup is the exact JSX that was inline in `Starmap`
// — same element order, same class names, same `data-testid`s, same copy — and
// the four values `Starmap` computed beside it are computed here from the SAME
// expressions:
//   `sweep`      = explorationPreview(game)
//   `recovery`   = recoveryReadout(game)
//   `canSweep`   = dieArmed && sweep.canAfford && recovery === null
//   `sweepLabel` = the same four-way ladder, in the same order
// `dieArmed` is `armedDieIndex !== null`, i.e. `state.selectedDie !== null`.
//
// WHAT T-194 ADDS, and nothing else: the `<CheckPreviewRow>` inside `es-cost`. It
// occupies the place the literal "PILOT DC {n}" text used to sit, and its two
// variants BOTH open with that same phrase, so `e2e/exploration.spec.ts` and
// `e2e/nemesis-funnel.spec.ts` — which assert `explore-cost` contains
// `PILOT DC {EXPLORATION_NAV_DC}` WITH a die already armed — keep passing on the
// live read as well as the planning one. The gain is everything after it: the
// armed die's face, the total it makes, and whether that clears.
//
// PROPS-ONLY AND STORE-FREE: the sweep verb arrives as `onSweep`, never by
// importing `./store` (which runs `init()` at module load).
// ---------------------------------------------------------------------------

export interface ExploreSweepPanelProps {
  game: GameState;
  /** The HAND INDEX of the armed die (`state.selectedDie`), or null. */
  armedDieIndex: number | null;
  /** The store's `explorationOutcome` line, or null. */
  outcome: string | null;
  /** T-187 · the rails attributes `railsProps(state, 'explore')` produced. */
  railsAttrs?: { inert?: boolean; 'data-rails-off'?: '1'; 'data-rails-active'?: '1' };
  /** Commit the sweep. */
  onSweep: () => void;
}

export function ExploreSweepPanel({
  game,
  armedDieIndex,
  outcome,
  railsAttrs,
  onSweep,
}: ExploreSweepPanelProps) {
  const dieArmed = armedDieIndex !== null;
  const sweep = explorationPreview(game);
  const recovery = recoveryReadout(game);
  const canSweep = dieArmed && sweep.canAfford && recovery === null;
  const sweepLabel =
    recovery !== null
      ? 'Salvage op under way'
      : !dieArmed
        ? 'Pick a die to sweep'
        : !sweep.canAfford
          ? `Need ${sweep.fuelCost} fuel`
          : 'Off-lane sweep';
  // T-194 · the live read. `plan` until a die is armed, then the engine's own
  // `check()` for that face against the same nav DC the resolver uses.
  const checkPreview = exploreCheckPreview(game, armedDieIndex);

  return (
    <div className="explore-sweep" data-testid="explore-panel" {...railsAttrs}>
      <div className="es-head">OFF-LANE SWEEP</div>
      <div className="es-cost" data-testid="explore-cost">
        <CheckPreviewRow preview={checkPreview} surface="explore" /> · FUEL {sweep.fuelCost} · NAV{' '}
        {signedMargin(sweep.effectiveModifier)}
      </div>
      {recovery && (
        <div className="es-recovery" data-testid="explore-recovery">
          SALVAGE OP · {recovery.outcomeName} at {recovery.systemName} ·{' '}
          {recovery.daysRemaining === 0
            ? 'lifts at dusk'
            : `${recovery.daysRemaining} day${recovery.daysRemaining === 1 ? '' : 's'} to go`}{' '}
          · hold station or lose it
        </div>
      )}
      <button className="btn" data-testid="explore-sweep" disabled={!canSweep} onClick={onSweep}>
        {sweepLabel}
      </button>
      {outcome && (
        <div className="es-outcome" data-testid="exploration-outcome">
          {outcome}
        </div>
      )}
    </div>
  );
}
