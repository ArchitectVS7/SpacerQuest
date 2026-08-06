import { statName, checkVerdict, type CheckPreview } from './format';

// ---------------------------------------------------------------------------
// T-194 · THE LIVE PER-DIE CHECK READ, AS ONE COMPONENT.
//
// WHY THIS EXISTS. Owner, live session: "it was not at all apparent why I was
// adding a d20 to any of my tasks… I have no feedback if the die does anything."
// Every remaining Main Action reads its die (docs/DAWN-HAND-REDESIGN.md §3), but
// the cockpit printed a bare DC sitting next to an unrelated hand of dice and
// left the arithmetic connecting them entirely in the player's head. This row
// does that arithmetic in front of them, BEFORE the click.
//
// TWO STATES, DELIBERATELY DIFFERENT (UI-28). `plan` is a DC with no die armed —
// dim etch, no verdict, and it says out loud that arming a die is what turns it
// into a roll. `live` is the same DC with the armed die's real face against it,
// in ember with a pass/fail badge. Both open with the SAME `{STAT} DC {n}`
// phrase, so the DC is machine-checkable at one testid in either state (that is
// what keeps `route-dc` / `explore-cost` honest through the change) and so the
// player reads one line that gains detail rather than two lines that replace one
// another.
//
// THE COMPONENT OWNS NO RULE. Which variant is legal, which stat, which DC and —
// crucially — whether the roll clears are all decided in `format.ts`, and the
// `live` verdict is the ENGINE's own `check()` output (UI-29), never a
// UI-recomputed `total >= dc`. Nat-20 auto-success and nat-1 auto-fail therefore
// come for free instead of being re-implemented in JSX.
//
// RUN GETS NO VERDICT (UI-30). `resolveRun` is an OPPOSED roll: the interceptor's
// pursuit d20 does not exist until resolve time, so there is no DC to clear. The
// `opposed` arm prints the player's total and says the other side still rolls.
// Inventing a DC there would be T-193's bug — an advertised check the resolver
// never runs — reproduced in a new pane.
//
// PROPS-ONLY AND STORE-FREE, so a jsdom pane test can mount it (TT-13a): the only
// import is `./format`, never `./store` (which runs `init()` at module load).
// ---------------------------------------------------------------------------

export interface CheckPreviewRowProps {
  /** The variant, decided in `format.ts`. `none` renders nothing at all. */
  preview: CheckPreview;
  /** Names WHICH surface this row belongs to, so a pane with several rows (the
   *  three combat stances) is addressable one row at a time. */
  surface?: string;
  /** T-193/T-194 · Override the testid on the bare DC value. The route panel
   *  passes `route-dc` so the crossing's DC keeps ONE stable machine-checkable
   *  home in BOTH the planning and the live state — `e2e/nemesis-crossing.spec.ts`
   *  arms a die and then asserts `route-dc` has exactly the content DC. Do not
   *  "clean this up": dropping it re-hides the number that spec exists to pin. */
  dcTestId?: string;
}

/** `+2` / `-1` / `+0` — the modifier as it reads inside an expression. */
function signedModifier(modifier: number): string {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

export function CheckPreviewRow({ preview, surface, dcTestId }: CheckPreviewRowProps) {
  if (preview.kind === 'none') return null;

  const surfaceProps = surface === undefined ? {} : { 'data-surface': surface };

  // ---- OPPOSED (combat RUN) · a total, and an honest "they roll too" --------
  if (preview.kind === 'opposed') {
    return (
      <span
        className="check-preview opposed"
        data-testid="check-preview"
        data-kind="opposed"
        {...surfaceProps}
      >
        <span className="cp-k">{statName(preview.stat)} OPPOSED</span>{' '}
        {preview.die === null ? (
          <span className="cp-hint">arm a die — they roll to pursue</span>
        ) : (
          <span className="cp-expr">
            [<b data-testid="check-preview-die">{preview.die}</b>]{' '}
            {signedModifier(preview.modifier)} ={' '}
            <b data-testid="check-preview-total">{preview.die + preview.modifier}</b> — they roll to
            pursue
          </span>
        )}
      </span>
    );
  }

  // ---- PLAN · a DC, and what would turn it into a roll ---------------------
  if (preview.kind === 'plan') {
    return (
      <span
        className="check-preview plan"
        data-testid="check-preview"
        data-kind="plan"
        {...surfaceProps}
      >
        <span className="cp-k">{statName(preview.stat)} DC</span>{' '}
        <span className="cp-v" data-testid={dcTestId ?? 'check-preview-dc'}>
          {preview.dc}
        </span>{' '}
        <span className="cp-hint">· arm a die to roll it</span>
      </span>
    );
  }

  // ---- LIVE · the armed face, against that DC, resolved by the engine ------
  const r = preview.result;
  const verdict = checkVerdict(r);
  return (
    <span
      className={`check-preview live ${verdict}`}
      data-testid="check-preview"
      data-kind="live"
      data-verdict={verdict}
      data-outcome={r.success ? 'pass' : 'fail'}
      {...surfaceProps}
    >
      <span className="cp-k">{statName(preview.stat)} DC</span>{' '}
      <span className="cp-v" data-testid={dcTestId ?? 'check-preview-dc'}>
        {r.dc}
      </span>{' '}
      <span className="cp-expr">
        · [<b data-testid="check-preview-die">{r.die}</b>] {signedModifier(r.modifier)} ={' '}
        <b data-testid="check-preview-total">{r.total}</b> →{' '}
      </span>
      <span
        className={r.success ? 'result clear' : 'result fail'}
        data-testid="check-preview-result"
      >
        {r.success ? 'CLEARS IT' : 'FALLS SHORT'}
      </span>
      {r.nat20 && (
        <span className="nat-juice crit" data-testid="check-preview-nat20">
          NATURAL 20
        </span>
      )}
      {r.nat1 && (
        <span className="nat-juice fumble" data-testid="check-preview-nat1">
          NATURAL 1
        </span>
      )}
    </span>
  );
}
