import type { CheckPreview } from './format';
import { CheckPreviewRow } from './CheckPreviewRow';

// ---------------------------------------------------------------------------
// T-194 · THE LIAR'S DICE PEEK CONTROL, LIFTED OUT OF `App.tsx`.
//
// BEHAVIOUR-PRESERVING BY CONSTRUCTION (T-193's terms, TT-13a): the button is the
// exact JSX that was inline in `LiarsDiceScene` — same class names, same
// `data-testid`/`data-move` pair, same `disabled` gate, same label, same hover
// copy. The legality gate (`canMove('peek')`) stays in the parent, where it was.
//
// WHAT T-194 ADDS: the `<CheckPreviewRow>` under the button. Peek is a Main
// Action and its die IS the GUILE roll (docs/DAWN-HAND-REDESIGN.md §3), so the
// player is entitled to see that roll resolve against the port's authored DC
// before spending a second die on it.
// ---------------------------------------------------------------------------

export interface PeekControlProps {
  /** The port's authored Peek DC (`DareSceneView.peekDc`). */
  peekDc: number;
  /** Is a die armed? (`state.selectedDie !== null`.) */
  armed: boolean;
  /** The GUILE-vs-DC read for the armed die — `peekCheckPreview(game, …)`. */
  preview: CheckPreview;
  /** The move label, from the scene's shared `DARE_MOVE_LABEL` table. */
  label: string;
  /** Spend the die on a peek. */
  onPeek: () => void;
}

export function PeekControl({ peekDc, armed, preview, label, onPeek }: PeekControlProps) {
  return (
    <span className="dare-peek">
      <button
        className="btn ghost"
        data-testid="dare-move"
        data-move="peek"
        disabled={!armed}
        title={
          armed
            ? `Spend a second die on a GUILE ${peekDc} check to see one of the house’s dice`
            : 'Pick a second die to peek'
        }
        onClick={onPeek}
      >
        {label} · DC {peekDc}
      </button>
      <CheckPreviewRow preview={preview} surface="peek" />
    </span>
  );
}
