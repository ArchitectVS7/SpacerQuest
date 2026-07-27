import { DEMO_FINAL_DAY, DEMO_LOCKED_FEATURES, type DemoLockedFeature } from '@spacerquest/content';
import { rankForDeedCount } from './deeds.js';
import { type Edition, type GameEvent, type GameState } from './types.js';
import { cloneState } from './clone.js';

/**
 * ============================================================================
 *  T-1703 · THE DEMO RULES — the single owner of every demo predicate
 * ============================================================================
 *
 * Four enforcement sites read this module and nothing else: `day.ts`'s action
 * gate and dusk conclusion, `deeds.ts`'s CONQUEROR ceiling, the sim's
 * `legalActions`, and the cockpit's `format.ts`. One predicate set, four
 * consumers, so the gate cannot drift into four slightly different gates.
 *
 * PURE, like every engine module: no DOM, no I/O, no `Math.random`, no `Date`.
 */

/** Whether this career is being flown on a demo licence. */
export function isDemo(state: GameState): boolean {
  return state.edition === 'demo';
}

/**
 * Whether a demo career has played out its ceiling.
 *
 * DERIVED, NEVER A FLAG. A `demoConcluded: true` written onto GameState would be
 * a receipt with no independent reader — and, worse, `promoteEdition` would then
 * have to remember to UNSET it, so a promoted career could silently stay
 * concluded. Deriving it means a promoted save simply continues past day 33 with
 * nothing to clean up.
 *
 * `day > DEMO_FINAL_DAY` and not `>=`: day 33 is PLAYED (its dusk fires
 * `DemoConcluded`), and the roll to day 34 is where the cockpit takes over.
 */
export function demoConcluded(state: GameState): boolean {
  return isDemo(state) && state.day > DEMO_FINAL_DAY;
}

/**
 * Days of demo left, counting the current one, or `null` for a full career.
 *
 * READERS: the cockpit's demo banner (`demoBannerLine`) and the sim's
 * `StateSummary.demoDaysRemaining`. Clamped at 0 rather than going negative, so
 * a concluded demo reads "0 days" rather than "-4 days".
 */
export function demoDaysRemaining(state: GameState): number | null {
  if (!isDemo(state)) return null;
  return Math.max(0, DEMO_FINAL_DAY - state.day + 1);
}

/**
 * The features this state has locked. `DEMO_LOCKED_FEATURES` (content) in a demo
 * career, empty in a full one.
 *
 * THE ONE PREDICATE every gate goes through — `day.ts` asks it before refusing a
 * `Port`/`Crew` verb, `deeds.ts` before promoting to CONQUEROR, `legalActions`
 * before advertising, and the cockpit before disabling a control. Add a fourth
 * lock to the content list and all four honor it without another edit.
 */
export function demoLocks(state: GameState): readonly DemoLockedFeature[] {
  return isDemo(state) ? DEMO_LOCKED_FEATURES : [];
}

/** Whether a named feature is locked in this state. Sugar over
 *  {@link demoLocks}, so no call site hand-rolls an `includes`. */
export function demoLocked(state: GameState, feature: DemoLockedFeature): boolean {
  return demoLocks(state).includes(feature);
}

/** The outcome of {@link promoteEdition}: the promoted (or unchanged) career, or
 *  a typed refusal. A refusal is not a throw — the cockpit routes it through the
 *  same recovery notice a corrupt save takes. */
export type EditionPromotion =
  { state: GameState; events: GameEvent[] } | { refused: 'demo-build-rejects-full-save' };

/**
 * Adopt a loaded career into the edition of the RUNNING BUILD.
 *
 * THIS IS "demo-save carries into full game", and it is deliberately not a save
 * converter: the whole carry is one scalar write plus a re-derive.
 *
 * demo → full  · the locks lift. `registry.renownRank` is RE-DERIVED from the
 *   deed count through `rankForDeedCount`, which heals anything the CONQUEROR
 *   ceiling withheld while the career was on a demo licence (a demo career that
 *   somehow banked 38 deeds carried a capped rank; the full build gives it back).
 *   Emits `EditionPromoted` + a wire line.
 * full → demo  · REFUSED. This is the obvious hole in the gate: without it, a
 *   player could open a full-game career in the demo build and fly veteran
 *   content on a demo licence. The demo build must not open a full save.
 * same edition · identity, and NO event — a load is not a promotion.
 */
export function promoteEdition(state: GameState, buildEdition: Edition): EditionPromotion {
  if (state.edition === buildEdition) return { state, events: [] };
  if (buildEdition === 'demo') return { refused: 'demo-build-rejects-full-save' };

  const next = cloneState(state);
  const from = next.edition;
  next.edition = buildEdition;
  next.player.registry.renownRank = rankForDeedCount(next.player.registry.earned.length);

  const events: GameEvent[] = [
    { type: 'EditionPromoted', day: next.day, from, to: buildEdition },
    {
      type: 'WireEntry',
      day: next.day,
      kind: 'plain',
      message:
        'Licence upgraded. The demo endorsement comes off your papers, the Registry re-reads your file at full weight, and every lane the rim has is open to you again.',
    },
  ];
  next.eventLog.push(...events);

  return { state: next, events };
}
