import { systemName, routePreview, routeCheckReadout, crossingCheckPreview } from './format';
import { CheckPreviewRow } from './CheckPreviewRow';
import type { GameState } from '@spacerquest/engine';

// ---------------------------------------------------------------------------
// T-193 (fix round 1) · THE ROUTE-PREVIEW PANEL, LIFTED OUT OF `App.tsx` SO THE
// DOM IT PRODUCES CAN BE MOUNTED BY A TEST.
//
// WHY THIS FILE EXISTS. The bug T-193 fixes is a RENDERING bug: `travelPreview`
// still computes a `dc` for every destination, and the panel used to print it as
// "PILOT DC n" even though `resolveTravel` stopped rolling that check for
// ordinary jumps at T-1605. Pinning the *predicate* (`routeCheckReadout`) is
// necessary but not sufficient — the regression this task exists to prevent is
// JSX that renders a DC unconditionally, ignoring the predicate. That regression
// is only visible to a test that renders the markup and looks for
// `data-testid="route-dc"`. While the whole panel lived inside the 6,000-line
// `App` component (which pulls in `./store`, and `store` runs `init()` — storage,
// sound, timers — at module load), no cheap test could mount it. It lives here
// now: a PURE, PROPS-ONLY component whose only imports are the pure selectors in
// `format.ts`, mountable in jsdom in milliseconds.
//
// BEHAVIOUR-PRESERVING BY CONSTRUCTION. The markup below is the exact JSX that
// was inline in `App.tsx` (same element order, same class names, same
// `data-testid`s, same copy, same entities), and the two values `App` used to
// compute beside it are computed here from the same expressions:
//   `preview`    = routePreview(game, dest)            (App: same call)
//   `routeCheck` = routeCheckReadout(game, dest, armedDieIndex)
//   `dieArmed`   = armedDieIndex !== null              (App: state.selectedDie !== null,
//                                                       and `armedDieIndex` IS
//                                                       `state.selectedDie`)
// No rule is decided here and no number is invented here: which of the three
// check rows is legal remains `routeCheckReadout`'s call, in `format.ts`.
//
// NOT A NEW BROWSER TIER. This is a component rendered by the package's existing
// vitest runner under a per-file `@vitest-environment jsdom` docblock — the
// escape hatch `vitest.config.ts` has always documented. The real-browser tier
// (Playwright) is a different thing and remains T-162's open thread.
// ---------------------------------------------------------------------------

export interface RoutePreviewPanelProps {
  game: GameState;
  /** The plotted destination system id. */
  dest: number;
  /** The HAND INDEX of the armed die (`state.selectedDie`), or null. */
  armedDieIndex: number | null;
  /** Commit the jump. */
  onConfirm: () => void;
}

export function RoutePreviewPanel({
  game,
  dest,
  armedDieIndex,
  onConfirm,
}: RoutePreviewPanelProps) {
  const preview = routePreview(game, dest);
  // T-193 · What the panel may honestly say about a CHECK on this route. The old
  // markup printed `preview.dc` for every destination, but T-1605 removed the
  // pilot check from ordinary travel — only the crossing still rolls. The rule
  // lives in `format.ts`; this component only picks the variant to render.
  const routeCheck = routeCheckReadout(game, dest, armedDieIndex);
  const dieArmed = armedDieIndex !== null;

  return (
    <div className="route-preview" data-testid="route-preview">
      <div className="rp-head">
        PLOT &#9656; <b>{systemName(dest)}</b>
      </div>
      <div className="rp-grid">
        <span className="rp-k">DISTANCE</span>
        <span className="rp-v" data-testid="route-distance">
          {preview.distance}
        </span>
        <span className="rp-k">FUEL</span>
        <span className="rp-v" data-testid="route-fuel">
          {preview.fuelCost}
        </span>
        <span className="rp-k">DANGER</span>
        <span className="rp-v" data-testid="route-danger">
          {preview.dangerLevel}
        </span>
      </div>
      {/* T-193 · The check row. Exactly one of these renders, and the
          DC one ONLY for a destination `resolveTravel` really rolls
          against (the crossing) — an ordinary jump says what its die
          actually does instead, or states plainly that nothing is
          checked. The row is never empty: the absence of a DC is a
          claim the panel makes, not a field that went missing. */}
      {/* T-194 · The crossing is the one destination `resolveTravel` still rolls
          against, so it is the one route row that gains a LIVE per-die read: dim
          "PILOT DC n · arm a die to roll it" until a die is armed, then that
          die's face resolved against the same DC by the engine's own `check()`.
          `routeCheckReadout` is UNCHANGED — it still answers "does this route
          roll a Pilot check at all", which is a route rule; whether a die is
          armed is a hand fact, and `crossingCheckPreview` owns that.
          THE `route-dc` TESTID STAYS ON THE BARE NUMBER IN BOTH STATES, and that
          is load-bearing: `e2e/nemesis-crossing.spec.ts` arms a die and THEN
          asserts `route-dc` has exactly the content DC. Do not "clean it up". */}
      {routeCheck.kind === 'dc' && (
        <div className="rp-check" data-testid="route-check">
          <CheckPreviewRow
            preview={crossingCheckPreview(game, armedDieIndex)}
            surface="crossing"
            dcTestId="route-dc"
          />
        </div>
      )}
      {routeCheck.kind === 'die-effect' && (
        <div className="rp-check" data-testid="route-check">
          <span className="rp-ck">DIE {routeCheck.die}</span>
          <span className="rp-cv" data-testid="route-die-effect">
            FUEL &minus;{routeCheck.fuelPct}% · ENCOUNTER &minus;{routeCheck.evasionPct}%
          </span>
        </div>
      )}
      {routeCheck.kind === 'no-check' && (
        <div className="rp-check" data-testid="route-check">
          <span className="rp-ck">CHECK</span>
          <span className="rp-cv" data-testid="route-no-check">
            NONE — every jump with fuel arrives
          </span>
        </div>
      )}
      <button
        className="btn"
        data-testid="confirm-jump"
        disabled={!dieArmed || !preview.reachable}
        onClick={onConfirm}
      >
        {dieArmed ? 'Confirm jump' : 'Pick a die to jump'}
      </button>
    </div>
  );
}
