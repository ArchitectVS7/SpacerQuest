import type { CheckPreview } from './format';
import { CheckPreviewRow } from './CheckPreviewRow';

// ---------------------------------------------------------------------------
// T-194 · THE MANIFEST ROW'S SIGN/HAGGLE STRIP, LIFTED OUT OF `App.tsx`.
//
// BEHAVIOUR-PRESERVING BY CONSTRUCTION (T-193's terms, TT-13a): the markup is the
// exact JSX that was inline in `Manifest`'s per-offer map — same element order,
// same class names, same `data-testid`s, same copy, same enabled state — with two
// changes that belong to T-194 and nothing else:
//
//   1. the hover `title` no longer types `12` as a literal. It reads the DC out of
//      the same `CheckPreview` the row renders, which reads it from the mirror of
//      the resolver's own `haggleDc` (see `format.ts`, and the drift alarm in
//      `__tests__/engine-dc-pins.test.ts`);
//   2. a `<CheckPreviewRow>` sits beside the button, so the TRADE roll the button
//      is about to make is visible BEFORE the click rather than only after it.
//
// SIGN STAYS FREE. The "SIGN · FREE · click to sign" trio is M17's (T-196c) and is
// carried across untouched: signing costs no die, and no check read is attached
// to it, because none is rolled.
// ---------------------------------------------------------------------------

export interface HaggleRowProps {
  /** Has this contract already been renegotiated once? (Engine refusal, but the
   *  control stays ENABLED so the refusal renders as a notice, never a dead click.) */
  haggled: boolean;
  /** Is a die armed? (`state.selectedDie !== null`.) */
  armed: boolean;
  /** The TRADE-vs-DC read for the armed die — `haggleCheckPreview(game, …)`. */
  preview: CheckPreview;
  /** Run the haggle. Receives the raw event so the row can stop propagation to
   *  the parent offer (whose click SIGNS the contract). */
  onHaggle: (e: React.MouseEvent) => void;
}

export function HaggleRow({ haggled, armed, preview, onHaggle }: HaggleRowProps) {
  const dc = preview.kind === 'plan' ? preview.dc : preview.kind === 'live' ? preview.result.dc : 0;
  return (
    <div className="check" data-testid="sign-row">
      {/* T-194 · THE SIGNATURE'S OWN TERMS, given their own testid. The row has
          always held two different things — a FREE signature and an optional
          TRADE roll — and now that the haggle's live check read sits in it too,
          "the signature is not a check" has to be asserted against the signature
          rather than against the whole row. `e2e/derule.spec.ts` is the reader.
          A narrower assertion, not a weaker one: it is the same claim, aimed. */}
      <span className="sign-terms" data-testid="sign-terms">
        <span className="lbl">SIGN</span>
        <span className="mono">FREE</span>
        <span className="arrow">&rarr;</span>
        <span className="mono">click to sign</span>
      </span>
      {/* Kept ENABLED even once haggled: a second haggle is an engine
          refusal that spends no die, and the store surfaces it as a
          visible notice. Disabling it here would make that failure a
          silent dead click — the exact silence the accept criterion
          (UGT Finding 4's lesson) forbids. */}
      <button
        className={haggled ? 'haggle done' : 'haggle'}
        data-testid="haggle"
        title={
          haggled
            ? 'The broker will not renegotiate this contract again.'
            : armed
              ? `Roll TRADE vs DC ${dc} to bump the payment`
              : 'Pick a die first, then haggle'
        }
        onClick={onHaggle}
      >
        HAGGLE
      </button>
      {!haggled && <CheckPreviewRow preview={preview} surface="haggle" />}
    </div>
  );
}
