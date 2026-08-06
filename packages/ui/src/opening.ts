// ===========================================================================
// T-200 · THE OPENING MARKER — the debt as a cold open, not a stat line.
// ===========================================================================
//
// WHAT THIS IS. `docs/PRD-REIMAGINED.md` §"The pitch" already promises this and
// the build did not keep it: "You are a nobody with a junker ship and a
// 25,000-credit debt to the Merchant Guild of Sol-3, due in 30 days. The object
// is simple and STATED ON THE FIRST SCREEN: clear the debt and make your name."
// Today the only two places that number appears are the bezel chip and the Trade
// pane's `GUILD DEBT` ledger — both routine, both ledger-voiced, and one of them
// behind a pane the player has to open. Neither is a hook. This module is the
// missing beat: a one-shot, in-fiction Guild dispatch that lands over the day-1
// cockpit at the birth of every career, carries the figure as the largest thing
// on screen, and names the PRIOR OBLIGATIONS that put the player out here.
//
// THIS IS PRESENTATION OVER AN EXISTING NUMBER. Every figure it shows is read
// live off `GameState` — `player.debt`, `player.debtDueDay`, `day`. There is
// deliberately NOT ONE numeric literal for the debt, the due day or the interest
// rate anywhere in this file or its copy (`__tests__/opening-marker.test.ts`
// guards that). `packages/engine/src/state.ts`'s `debt: 25000` / `debtDueDay: 30`
// are untouched, as is every economy constant in `packages/content`.
//
// ---------------------------------------------------------------------------
// WHY THIS IS NOT A WALKTHROUGH STEP (T-187) AND NOT A COACH PROMPT (T-311)
// ---------------------------------------------------------------------------
// Three separate systems, three separate jobs, and folding this into either of
// the other two would break them:
//
//   * T-187's `walkthrough.ts` teaches CONTROLS on rails — seven ordered steps,
//     "STEP n OF 7". Adding a `w0` step would move `WALKTHROUGH_STEP_COUNT`,
//     re-number the counter and invalidate that task's unit and e2e expectations.
//     This beat teaches no control at all; it states the stakes.
//   * T-311's `ONBOARDING_PROMPTS` are explicitly NON-MODAL and contextual ("no
//     modal tutorial walls"). This one IS modal, deliberately and for a few
//     seconds only, because a hook the player can miss is not a hook.
//   * Nothing in this file reads or writes `WalkthroughRecord`, `onboardingSeen`,
//     `ONBOARDING_PROMPTS` or any of their helpers. `walkthrough.ts` and
//     `format.ts`'s coach survive byte for byte. The ONLY interaction is a
//     render-time suppression in `App.tsx` — `WalkthroughCard` stands down while
//     the marker is up, so two overlays are never on screen at once, and the
//     walkthrough resumes on step 1 the instant the marker is dismissed. That is
//     exactly the idiom `OnboardingCallout` already uses for `walkthroughActive`.
//
// ---------------------------------------------------------------------------
// WHY THE RECORD IS CLIENT META-STATE (no save migration is owed)
// ---------------------------------------------------------------------------
// `OpeningMarkerRecord` is CLIENT presentation meta-state, exactly like
// `onboardingSeen` / `WalkthroughRecord` / `fx` — it is NOT `GameState`. A JSON
// round-trip of game state is unaffected, `CURRENT_SAVE_VERSION`
// (`packages/engine/src/save.ts:562`) does not move, and NO save migration is
// owed. It is persisted under `sq.opening.v1` through `storage.ts` (the `sq.`
// prefix is load-bearing: the desktop shell's migration copies BY PREFIX).
//
// This whole module is PURE PRESENTATION. It touches no engine rule, adds no
// `GameEvent` and no `GameState` field, so `rulesFingerprint` does not move and
// this task owes no capstone, no `balance:extract` and no sweep.
//
// ---------------------------------------------------------------------------
// THE ARMING RULE, AND WHY IT DIFFERS FROM THE WALKTHROUGH'S
// ---------------------------------------------------------------------------
// The walkthrough arms ONCE per profile: a captain rolling their fourth seed is
// not a first-time player and re-teaching the controls would be the tutorial wall
// T-311 exists to avoid. The marker arms ONCE PER CAREER: it is not teaching, it
// is establishing THIS career's stakes, and every career is under its own marker.
// So `init()` arms it only on a virgin boot (no save at all), while `newGame()`
// arms it unconditionally, and `loadSlot` / import RETIRE it — a mid-career save
// coming back off disk is not a new run.
// ===========================================================================

import type { GameState } from '@spacerquest/engine';

/** The persisted record. `pending` = the dispatch has not been read yet. */
export interface OpeningMarkerRecord {
  v: 1;
  status: 'pending' | 'seen';
}

function seenRecord(): OpeningMarkerRecord {
  return { v: 1, status: 'seen' };
}

/**
 * Parse a stored record. TOTAL over any input — `null`, `''`, malformed JSON, an
 * array, a bare string, a wrong `v`, an unknown `status`.
 *
 * DEFAULT-CLOSED, and that direction is the whole point: `parseWalkthrough`
 * degrades to `off` because a MISSING tutorial record is never worth a lost turn,
 * whereas a corrupt marker record must never drop a full-screen dispatch over a
 * career already in flight. Unreadable therefore means "already seen".
 */
export function parseOpeningMarker(raw: string | null | undefined): OpeningMarkerRecord {
  if (!raw) return seenRecord();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return seenRecord();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return seenRecord();
  const rec = parsed as Partial<OpeningMarkerRecord>;
  if (rec.v !== 1) return seenRecord();
  if (rec.status !== 'pending' && rec.status !== 'seen') return seenRecord();
  return { v: 1, status: rec.status };
}

export function serializeOpeningMarker(r: OpeningMarkerRecord): string {
  return JSON.stringify(r);
}

/** A career that has not read its marker yet. */
export function armedOpeningMarker(): OpeningMarkerRecord {
  return { v: 1, status: 'pending' };
}

/** The marker has been signed for — it never re-fires for this career. */
export function seenOpeningMarker(): OpeningMarkerRecord {
  return seenRecord();
}

export function openingMarkerPending(r: OpeningMarkerRecord): boolean {
  return r.status === 'pending';
}

/** Everything `App.tsx`'s `OpeningMarker` renders. Prose is prose; the raw
 *  figures ride alongside so a spec asserts on a number, never on a sentence. */
export interface OpeningMarkerView {
  /** The dispatch's letterhead strip. */
  kicker: string;
  title: string;
  /** `game.player.debt`, unformatted — the structural assertion target. */
  debt: number;
  /** The same figure, grouped, for the display slug. */
  debtLabel: string;
  /** `game.player.debtDueDay`, unformatted. */
  dueDay: number;
  /** Days from today to the due day, floored at zero. */
  dueInDays: number;
  /** `"29 days"` / `"1 day"` — the phrase used verbatim inside the prose. */
  dueLabel: string;
  prose: readonly string[];
  signOff: string;
  /** The foot of the document — what turns the bottom of the frame into a
   *  dispatch's footer rather than a dialog box's action bar. */
  stamp: string;
  actionLabel: string;
}

/**
 * Build the dispatch from live state. EVERY number here is read off `game`; the
 * copy carries none of its own. Pay the marker down and the figure follows —
 * which is what makes this a presentation of the engine's number rather than a
 * second copy of it that can drift.
 */
export function openingMarkerView(game: GameState): OpeningMarkerView {
  const debt = game.player.debt;
  const dueDay = game.player.debtDueDay;
  const dueInDays = Math.max(0, dueDay - game.day);
  const dueLabel = `${dueInDays} ${dueInDays === 1 ? 'day' : 'days'}`;
  return {
    kicker: 'MERCHANT GUILD OF SOL-3 · MARKER CALLED',
    title: 'THE PAPER COMES WITH YOU',
    debt,
    // Same idiom as the ledger's OWED readout (`App.tsx`'s `debt-ledger`).
    debtLabel: `${debt.toLocaleString()} CR`,
    dueDay,
    dueInDays,
    dueLabel,
    prose: [
      'The ship is yours. The paper on it is not. Berth fees taken on credit, a hull signed for, ' +
        'favours accepted back when you had nothing to trade against them — prior obligations, ' +
        'every one, bought up and bound into a single marker held by the Merchant Guild of Sol-3.',
      `The Guild does not send a second letter. In ${dueLabel} it comes to collect, and what it ` +
        'cannot collect in credits it takes in hull, in cargo, and in name.',
    ],
    signOff:
      'Fly. Trade. Fight, if it comes to that. Just be holding the whole marker when they come for it.',
    stamp: 'GUILD CLEARING HOUSE · AUTHORISED FOR COLLECTION · NO APPEAL FILED',
    actionLabel: 'SIGN AND UNDOCK',
  };
}
