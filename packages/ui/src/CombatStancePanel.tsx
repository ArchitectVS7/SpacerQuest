import type { GameState } from '@spacerquest/engine';
import { combatFuelStatus, combatCheckPreview, tributeThisRound } from './format';
import { CheckPreviewRow } from './CheckPreviewRow';

// ---------------------------------------------------------------------------
// T-194 · THE THREE COMBAT STANCES, LIFTED OUT OF `App.tsx` SO THEIR CHECK READS
// CAN BE MOUNTED BY A TEST.
//
// BEHAVIOUR-PRESERVING BY CONSTRUCTION (T-193's terms, TT-13a): the markup is the
// exact JSX that was inline in `CombatInstrument` — same element order, same
// class names, same `data-testid`s, same `disabled` gates, same `title` strings
// bar the two corrections named below — and the two values `CombatInstrument`
// computed beside it are computed here from the SAME expressions:
//   `fuel`            = combatFuelStatus(game)
//   `tributePreview`  = tributeThisRound(round, kind, interceptorTier - playerTier)
// `armed` is `armedDieIndex !== null`, i.e. `state.selectedDie !== null`.
//
// WHAT T-194 ADDS: one `<CheckPreviewRow>` per stance. All three read the SAME
// armed die against DIFFERENT rules, and comparing them is exactly the decision
// the player is trying to make with three buttons in front of them — so three
// rows, one under each button, rather than one row for a "current" stance that
// does not exist until the click.
//
// RUN'S ROW CARRIES NO VERDICT, ON PURPOSE (UI-30). `resolveRun` is an OPPOSED
// PILOT roll — the interceptor's pursuit d20 is drawn at resolve time — so there
// is no DC to clear and none is invented. TALK's row is honest about the CHECK
// and its `title` now names the one thing the check cannot promise: a flaw-driven
// refusal (`interceptorRefusesTribute`) can pre-empt the TRADE roll entirely.
//
// PROPS-ONLY AND STORE-FREE: the stance verb arrives as `onStance`.
// ---------------------------------------------------------------------------

export interface CombatStancePanelProps {
  game: GameState;
  /** The HAND INDEX of the armed die (`state.selectedDie`), or null. */
  armedDieIndex: number | null;
  /** Commit a stance. */
  onStance: (stance: 'fight' | 'talk' | 'run') => void;
}

export function CombatStancePanel({ game, armedDieIndex, onStance }: CombatStancePanelProps) {
  const encounter = game.encounter;
  if (!encounter) return null;
  const armed = armedDieIndex !== null;
  const fuel = combatFuelStatus(game);
  // T-1402 / T-1603c · Forward the interceptor's CLASS and the TIER GAP so the
  // preview quotes the exact demand the engine charges. Unchanged in the move.
  const tributePreview = tributeThisRound(
    encounter.round,
    encounter.interceptor.kind,
    encounter.interceptor.tier - game.player.tier,
  );

  return (
    <>
      <div className="co-stances">
        <div className="co-stance-slot">
          <button
            className="btn stance fight"
            data-testid="combat-fight"
            disabled={!armed}
            title={
              !armed
                ? 'Pick a die first'
                : fuel.canFight
                  ? 'Roll GUNS to hole their hull (−50 fuel)'
                  : 'Not enough fuel — this will misfire (−50 fuel gated)'
            }
            onClick={() => onStance('fight')}
          >
            FIGHT
          </button>
          <CheckPreviewRow
            preview={combatCheckPreview(game, 'fight', armedDieIndex)}
            surface="fight"
          />
        </div>
        <div className="co-stance-slot">
          <button
            className="btn stance talk"
            data-testid="combat-talk"
            disabled={!armed}
            title={
              armed
                ? 'Roll TRADE to buy the lane with tribute — some captains refuse the deal outright'
                : 'Pick a die first'
            }
            onClick={() => onStance('talk')}
          >
            TALK
          </button>
          <CheckPreviewRow
            preview={combatCheckPreview(game, 'talk', armedDieIndex)}
            surface="talk"
          />
        </div>
        <div className="co-stance-slot">
          <button
            className="btn stance run"
            data-testid="combat-run"
            disabled={!armed}
            title={armed ? 'Roll PILOT to break off (−10 fuel)' : 'Pick a die first'}
            onClick={() => onStance('run')}
          >
            RUN
          </button>
          <CheckPreviewRow preview={combatCheckPreview(game, 'run', armedDieIndex)} surface="run" />
        </div>
      </div>
      <div className="co-tribute" data-testid="combat-tribute">
        Talk this round likely costs <b>{tributePreview.toLocaleString()}cr</b> tribute — the deal
        is struck on the wire.
      </div>
      {!armed && <p className="co-hint">Pick a die, then commit a stance.</p>}
    </>
  );
}
