// ===========================================================================
// T-187 · THE FIRST-TURN WALKTHROUGH — a scripted, on-rails seven-step run.
// ===========================================================================
//
// WHAT THIS IS. A new career opens on a cockpit with five dice, a manifest
// board, a starmap, a fuel depot, an off-lane sweep, a Hangout switch and a
// Liar's Dice table, and nothing tells a first-time captain which of those to
// touch first. The owner's read, after playing without prior design context:
// "I think what I want out of the early turn is to have you literally walk the
// player through a turn… on rails and with the pop ups." This module is that
// script: seven ordered steps — read the dawn hand, arm a die, sign a job, make
// the jump, collect the payout, sweep off-lane, play a hand of Liar's Dice —
// each of which must be completed (or the whole thing skipped) before the next
// unlocks, with every non-scripted affordance made `inert` while it runs.
//
// ---------------------------------------------------------------------------
// WHY THIS DOES NOT REPLACE T-311's CONTEXTUAL COACH
// ---------------------------------------------------------------------------
// `format.ts`'s `ONBOARDING_PROMPTS` / `activeOnboardingPrompt` are explicitly a
// NON-MODAL, contextual system — `App.tsx`'s `OnboardingCallout` states "no
// modal tutorial walls" as a deliberate guarantee. What the owner asked for here
// is close to the opposite: ordered, near-modal, and constraining. The two are
// therefore kept as SEPARATE SYSTEMS rather than one being bent into the other:
//
//   * Nothing in this file reads or writes `onboardingSeen`, `ONBOARDING_PROMPTS`,
//     `activeOnboardingPrompt`, `nextOnboardingSeen` or `reconcileOnboarding`.
//     T-311's coach survives byte for byte.
//   * The ONLY interaction is a render-time suppression: `OnboardingCallout`
//     returns null while `walkthroughActive`, so two coach cards can never be on
//     screen at once. `reconcileOnboarding` keeps running underneath, which is
//     correct — the four delivery-flow prompts auto-dismiss as the scripted
//     actions land, and the five `autoDismiss: false` new-verb prompts survive to
//     coach the player AFTER the walkthrough ends. That is "the two systems can
//     coexist" discharged, not asserted.
//   * The walkthrough is scoped to turn one/two. Once it is `done` or `skipped`
//     it never re-arms except through Settings → "Replay first-turn walkthrough".
//
// ---------------------------------------------------------------------------
// WHY THE RECORD IS CLIENT META-STATE (no save migration is owed)
// ---------------------------------------------------------------------------
// `WalkthroughRecord` is CLIENT presentation meta-state, exactly like
// `onboardingSeen` / `fx` / `patrolScan` / `saveWriteFailed` — it is NOT
// `GameState`. A JSON round-trip of game state is unaffected,
// `CURRENT_SAVE_VERSION` does not move, and NO save migration is owed. It is
// persisted under `sq.walkthrough.v1` through `storage.ts` (the `sq.` prefix is
// load-bearing: the desktop shell's migration copies BY PREFIX).
//
// This whole module is PURE PRESENTATION. It touches no engine rule, adds no
// `GameEvent` and no `GameState` field, so `rulesFingerprint` does not move and
// this task owes no capstone, no `balance:extract` and no sweep.
//
// ---------------------------------------------------------------------------
// THE TWO INVARIANTS THAT MAKE THE RAILS SAFE
// ---------------------------------------------------------------------------
// 1. COMPLETION SIGNALS ARE MONOTONE ONE-SHOT FLAGS, NEVER LIVE PREDICATES.
//    Deriving "the contract is signed" from `player.activeContract != null` would
//    make the walkthrough REGRESS to step 3 the instant the cargo is delivered,
//    because delivery nulls the contract. Every signal below is a `true`-only
//    flag set from the engine's own typed events and never cleared.
// 2. THE PLAYER CAN ALWAYS LEAVE. `hand` and `chrome` are open on EVERY step (so
//    a wasted die can still end the day, and Settings/New game are always
//    reachable), the rails go fully transparent whenever the ENGINE has already
//    constrained the player (`railsSuspended`), and a "Skip tutorial" control is
//    on every card. There is no state this module can put the cockpit in that the
//    player cannot get out of.
// ===========================================================================

import type { GameEvent, GameState } from '@spacerquest/engine';
import { explorationPreview, hangoutOpen, recoveryReadout } from './format';

/** The seven scripted steps, in the owner's stated order. */
export type WalkthroughStepId =
  | 'w1-dawn-hand'
  | 'w2-assign-die'
  | 'w3-take-contract'
  | 'w4-make-the-jump'
  | 'w5-collect-payout'
  | 'w6-explore'
  | 'w7-liars-dice';

/**
 * A region of the cockpit the rails can open or close. One region per node that
 * gets `inert` in `App.tsx` — deliberately finer than "pane" in two places:
 * `fuel` is split out of `trade` (steps 4 and 6 genuinely need the depot without
 * opening the abandon-contract control), and `explore` out of `starmap` (step 6
 * needs the sweep without re-opening the jump controls).
 */
export type RailsRegion =
  | 'hand'
  | 'manifest'
  | 'starmap'
  | 'explore'
  | 'trade'
  | 'fuel'
  | 'ship'
  | 'hangout'
  | 'wire'
  | 'chrome';

/** One-shot, monotone completion signals. Every field is `true` or absent. */
export interface WalkthroughFlags {
  dieAssigned?: true;
  signed?: true;
  jumped?: true;
  delivered?: true;
  explored?: true;
  dareResolved?: true;
}

/** The persisted record. `v` is the shape version; anything else parses to the
 *  `off` default (see {@link parseWalkthrough}). */
export interface WalkthroughRecord {
  v: 1;
  status: 'off' | 'active' | 'done' | 'skipped';
  acked: Partial<Record<WalkthroughStepId, true>>;
  flags: WalkthroughFlags;
  /** What the automatic delivery actually paid, captured off the engine's
   *  `deliver-cargo` event for step 5's body. Presentation only. */
  lastPayment?: number;
}

export interface WalkthroughStep {
  id: WalkthroughStepId;
  /** 1..7 — rendered as "STEP n OF 7". */
  index: number;
  title: string;
  /** WHAT to do. */
  what: string;
  /** WHY it matters. The Accept demands both. */
  why: string;
  /** Which anchor the card positions against (reuses the coach's anchor idiom). */
  anchor: 'hand' | 'manifest' | 'starmap' | 'trade' | 'hangout';
  /** True when the step is completed by the card's own "Next" button rather than
   *  by a game action — the two reading steps (1 and 5). */
  ack: boolean;
  /** The one-shot flag that completes an ACTION step. Absent on ack steps. */
  flag?: keyof WalkthroughFlags;
  /** Regions the player may act in during this step, BEYOND the always-open
   *  `hand` and `chrome`. See {@link railsAllows} for the dead-end escapes. */
  allow: readonly RailsRegion[];
}

/**
 * The script. Seven entries, in the order the owner named them.
 *
 * Step 5 is an ACK step with NO flag, deliberately. Delivery is automatic on
 * arrival (the engine's Travel action pushes `TradeEvent{deliver-cargo}` and
 * nulls the contract in the same action), so by the time the pointer reaches
 * step 5 the payout has already happened and the step's whole job is to point at
 * what just landed. Gating its completion on `flags.delivered` would strand a
 * player whose hold was confiscated by a patrol scan or forfeited en route — the
 * jump succeeded, the delivery did not, and there would be no action left that
 * could ever complete the step. The flag is still RECORDED (it carries
 * `lastPayment` for the card's body); it just does not gate.
 */
/**
 * T-196c · STALE COPY IN w1–w4, LEFT DELIBERATELY AND OWNED BY T-194. M17
 * (docs/DAWN-HAND-REDESIGN.md §3) freed the administrative actions, so "sign a
 * job, buy fuel" are no longer die-priced (w1), "nothing in the cockpit will
 * take an action until a die is armed" is no longer true (w2), "the armed die
 * pays for the signature" is false (w3), and "buy some at the depot first — that
 * costs a die too" is false (w4). T-196c changes UI BEHAVIOUR only; the teaching
 * copy belongs to T-194, gated behind T-198 precisely so the new economy settles
 * before the tutorial bakes it in. Marked here rather than silently half-fixed.
 */
export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
  {
    id: 'w1-dawn-hand',
    index: 1,
    title: 'Your Dawn Hand',
    what: 'These are the dice you rolled at dawn. You get one roll a day — no more.',
    why: 'Each die is one action: sign a job, buy fuel, make a jump, sweep off-lane, sit at a table. When the hand is spent the day is over, so a die is the real currency of Rimward.',
    anchor: 'hand',
    ack: true,
    allow: [],
  },
  {
    id: 'w2-assign-die',
    index: 2,
    title: 'Arm a Die',
    what: 'Click any die in the hand to arm it. It lights up when it is ready to spend.',
    why: 'Nothing in the cockpit will take an action until a die is armed — that is the game telling you what a turn costs before you pay it.',
    anchor: 'hand',
    ack: false,
    flag: 'dieAssigned',
    allow: [],
  },
  {
    id: 'w3-take-contract',
    index: 3,
    title: 'Sign a Job',
    what: 'Click an offer on the Manifest Board to sign it. The armed die pays for the signature.',
    why: 'Your hold is empty and the Guild marker is running. A contract is where every credit in this game starts — the cargo rides with you until you deliver it.',
    anchor: 'manifest',
    ack: false,
    flag: 'signed',
    allow: ['manifest'],
  },
  {
    id: 'w4-make-the-jump',
    index: 4,
    title: 'Make the Jump',
    what: 'Arm another die, click your destination on the starmap, then Confirm jump. Short on fuel? Buy some at the depot first — that costs a die too.',
    why: 'Fuel is the plot. The route preview shows the bill and the PILOT DC before you commit, so a jump is a decision you make with the numbers in front of you.',
    anchor: 'starmap',
    ack: false,
    flag: 'jumped',
    allow: ['starmap', 'fuel'],
  },
  {
    id: 'w5-collect-payout',
    index: 5,
    title: 'Collect the Payout',
    what: 'You arrived, and the cargo went straight off the ship. Check the credits on the bezel — that job is paid.',
    why: 'Delivery is automatic on arrival: there is no "sell" button to hunt for. Land where the manifest said, and the money is already yours.',
    anchor: 'trade',
    ack: true,
    allow: [],
  },
  {
    id: 'w6-explore',
    index: 6,
    title: 'Sweep Off-Lane',
    what: 'Arm a die and press Off-lane sweep. It burns fuel on a PILOT check against the dark.',
    why: 'The lanes are not the whole map. A sweep is how you find salvage, Signal Fragments and sealed pods — the things contracts alone will never pay for.',
    anchor: 'starmap',
    ack: false,
    flag: 'explored',
    allow: ['explore', 'fuel'],
  },
  {
    id: 'w7-liars-dice',
    index: 7,
    title: "A Hand of Liar's Dice",
    what: 'Open the Cantina, pick someone at the tables, set a wager and commit a die. Then bid, raise, or call them a liar.',
    why: 'The tables are where the Rim keeps its reputations. One die buys a whole hand — and the house never shows its cups until somebody challenges.',
    anchor: 'hangout',
    ack: false,
    flag: 'dareResolved',
    allow: ['hangout'],
  },
];

export const WALKTHROUGH_STEP_COUNT = 7;

/** The `off` default every failed parse resolves to. */
function offRecord(): WalkthroughRecord {
  return { v: 1, status: 'off', acked: {}, flags: {} };
}

/** A freshly-armed record — status `active`, nothing acked, nothing flagged. */
export function armedWalkthrough(): WalkthroughRecord {
  return { v: 1, status: 'active', acked: {}, flags: {} };
}

export function walkthroughActive(r: WalkthroughRecord): boolean {
  return r.status === 'active';
}

/** Has this step's completion signal landed? Ack steps read `acked`, action
 *  steps read their one-shot flag. Both are monotone. */
export function walkthroughStepDone(r: WalkthroughRecord, step: WalkthroughStep): boolean {
  if (step.ack) return r.acked[step.id] === true;
  return step.flag !== undefined && r.flags[step.flag] === true;
}

/** The step the player is on: the first one whose signal has not landed. Null
 *  once all seven are done (the walkthrough is over). */
export function currentWalkthroughStep(r: WalkthroughRecord): WalkthroughStep | null {
  for (const step of WALKTHROUGH_STEPS) {
    if (!walkthroughStepDone(r, step)) return step;
  }
  return null;
}

/**
 * Everything `railsAllows` / `railsSuspended` need. Structural on purpose: the
 * cockpit store's `CockpitState` satisfies it without this module importing the
 * store (which imports this module).
 */
export interface RailsContext {
  game: GameState;
  combatAftermath?: unknown;
  succession?: unknown;
  patrolScan?: unknown;
}

/**
 * The rails go FULLY TRANSPARENT — nothing inert, no card — whenever the ENGINE
 * has already constrained the player. Fighting the engine for control of the
 * screen is how a tutorial soft-locks a career.
 *
 * The `dareHand` clause is mandatory rather than defensive: step 7 IS a live
 * hand, and `App.tsx` force-mounts the Hangout panel while one stands, so the
 * table must be fully playable with no rails over it.
 *
 * `resolutionCeremony` is covered by the day-30 storylet it reads: the ceremony
 * only ever fires on day 31 of a career, decades past the walkthrough's turn-one
 * scope, and a `succession` / `combatAftermath` / `patrolScan` overlay is the
 * shape that can actually collide with it.
 */
export function railsSuspended(ctx: RailsContext): boolean {
  return (
    ctx.game.encounter != null ||
    ctx.game.dareHand != null ||
    ctx.combatAftermath != null ||
    ctx.succession != null ||
    ctx.patrolScan != null
  );
}

/**
 * MAY the player act in this region right now?
 *
 * True whenever the walkthrough is not running, the engine has already taken
 * over (`railsSuspended`), the script has finished, the region is one of the two
 * always-open ones, the current step lists it — or the step has hit a dead end
 * that only another region can clear (see `fallbackOpen`).
 */
export function railsAllows(r: WalkthroughRecord, ctx: RailsContext, region: RailsRegion): boolean {
  if (!walkthroughActive(r)) return true;
  if (railsSuspended(ctx)) return true;
  const step = currentWalkthroughStep(r);
  if (!step) return true;
  // NEVER trap the player: the hand (a wasted die must still be able to end the
  // day and roll a fresh one tomorrow) and the chrome (CRT, Records, Settings —
  // where the skip/replay control lives, and New game) are open on every step.
  if (region === 'hand' || region === 'chrome') return true;
  if (step.allow.includes(region)) return true;
  return fallbackOpen(step, ctx.game, region);
}

/**
 * The dead-end escapes. Both are real states a scripted run reaches, not
 * hypotheticals:
 *
 *  * STEP 6 with a tank that cannot pay for the sweep — the depot must open, or
 *    the only scripted action is a disabled button. And with a multi-day salvage
 *    op pinning the ship (`recoveryReadout`), the engine refuses Explore outright,
 *    so the starmap opens instead and the card says to fly on.
 *  * STEP 7 at a port with no Hangout — only the 14 CORE systems carry
 *    `hasHangout`; the six rim ports (ids 15-20) do not, and a signed contract can
 *    route to the rim. The starmap and the depot open so the player can plot a
 *    jump to a core port.
 */
function fallbackOpen(step: WalkthroughStep, game: GameState, region: RailsRegion): boolean {
  if (step.id === 'w6-explore') {
    if (recoveryReadout(game) !== null) return region === 'starmap' || region === 'fuel';
    if (!explorationPreview(game).canAfford) return region === 'fuel';
    return false;
  }
  if (step.id === 'w7-liars-dice' && !hangoutOpen(game)) {
    return region === 'starmap' || region === 'fuel';
  }
  return false;
}

/**
 * Is this region the one the current step is asking the player to act in? The
 * positive half of the rails: `railsAllows` says what is *permitted*,
 * this says what is *wanted*, and `App.tsx` stamps `data-rails-active="1"` on it
 * so the CSS can outline the scripted affordance instead of leaving the player to
 * find the one pane that is not dimmed.
 */
export function railsHighlights(
  r: WalkthroughRecord,
  ctx: RailsContext,
  region: RailsRegion,
): boolean {
  if (!walkthroughActive(r) || railsSuspended(ctx)) return false;
  const step = currentWalkthroughStep(r);
  if (!step) return false;
  return step.anchor === region || step.allow.includes(region);
}

/** The card's live copy for this step. Static for five of the seven; step 5
 *  names the payout the engine actually paid, and steps 6/7 re-voice themselves
 *  when `fallbackOpen` has had to widen the rails. */
export function walkthroughCardCopy(
  r: WalkthroughRecord,
  step: WalkthroughStep,
  game: GameState,
): { what: string; why: string } {
  if (step.id === 'w5-collect-payout' && r.lastPayment !== undefined) {
    return {
      what: `That run paid ${r.lastPayment.toLocaleString()}cr, banked the moment you docked. Look at the credits on the bezel.`,
      why: step.why,
    };
  }
  if (step.id === 'w6-explore') {
    if (recoveryReadout(game) !== null) {
      return {
        what: 'A salvage op has your ship pinned here, so no sweep is possible today. Hold station, or plot a jump and move on.',
        why: step.why,
      };
    }
    if (!explorationPreview(game).canAfford) {
      return {
        what: `A sweep burns ${explorationPreview(game).fuelCost} fuel and the tank is short. Arm a die and top it off at the depot first.`,
        why: step.why,
      };
    }
  }
  if (step.id === 'w7-liars-dice' && !hangoutOpen(game)) {
    return {
      what: 'This port keeps no Cantina — plot a jump to a core port and the tables will be there.',
      why: step.why,
    };
  }
  return { what: step.what, why: step.why };
}

/**
 * On step 4 the rails pin the destination to the hold's own contract, so the
 * scripted jump ends in a real payout instead of a jump to nowhere. Null on
 * every other step (and with an empty hold), which is the starmap's "no lock".
 */
export function walkthroughJumpTarget(r: WalkthroughRecord, game: GameState): number | null {
  if (!walkthroughActive(r)) return null;
  const step = currentWalkthroughStep(r);
  if (!step || step.id !== 'w4-make-the-jump') return null;
  return game.player.activeContract?.destination ?? null;
}

/**
 * Fold an action's typed event stream into the record's one-shot flags — the
 * same shape as `dareBeatsFrom` / `lastCheckFrom` / `cuesForEvents`, and reading
 * the ENGINE's own events rather than diffing state.
 *
 * Returns the SAME REFERENCE when nothing relevant landed (the
 * `nextOnboardingSeen` convention), so the store never re-renders needlessly.
 *
 * `dieAssigned` is deliberately absent here: arming a die is a store-local
 * selection that emits no engine event, so `selectDie` sets it directly.
 */
export function nextWalkthroughFlags(events: GameEvent[], r: WalkthroughRecord): WalkthroughRecord {
  if (!walkthroughActive(r)) return r;
  let flags: WalkthroughFlags | null = null;
  let payment: number | undefined;
  const set = (key: keyof WalkthroughFlags): void => {
    if (r.flags[key]) return;
    flags ??= { ...r.flags };
    flags[key] = true;
  };
  for (const e of events) {
    if (e.type === 'TradeEvent' && e.success === true) {
      if (e.action === 'sign-contract') set('signed');
      if (e.action === 'deliver-cargo') {
        set('delivered');
        if (e.payment !== undefined) payment = e.payment;
      }
    } else if (e.type === 'TravelEvent' && e.characterId === 'player' && e.success) {
      set('jumped');
    } else if (e.type === 'PoiDiscovered') {
      set('explored');
    } else if (e.type === 'ExplorationFailed' && e.reason === 'nav-check') {
      // A failed nav check STILL used the verb and still spent the die and the
      // fuel (the engine charges both before the roll), so it completes the
      // teaching step. `no-die` / `insufficient-fuel` are refusals that cost
      // nothing and taught nothing — they do not.
      set('explored');
    } else if (e.type === 'DareHandResolved') {
      set('dareResolved');
    }
  }
  if (flags === null && payment === undefined) return r;
  return {
    ...r,
    flags: flags ?? r.flags,
    ...(payment !== undefined ? { lastPayment: payment } : {}),
  };
}

/** Mark the current ACK step acknowledged, flipping the record to `done` when
 *  that was the last step. A no-op on an action step or a finished run. */
export function ackWalkthroughStep(r: WalkthroughRecord): WalkthroughRecord {
  if (!walkthroughActive(r)) return r;
  const step = currentWalkthroughStep(r);
  if (!step || !step.ack) return r;
  const next: WalkthroughRecord = { ...r, acked: { ...r.acked, [step.id]: true } };
  return currentWalkthroughStep(next) === null ? { ...next, status: 'done' } : next;
}

/** Flip an active record to `done` once every step's signal has landed. Called
 *  after a flag fold, since the last step (7) completes on an ACTION, not an ack. */
export function settleWalkthrough(r: WalkthroughRecord): WalkthroughRecord {
  if (!walkthroughActive(r)) return r;
  return currentWalkthroughStep(r) === null ? { ...r, status: 'done' } : r;
}

/**
 * TOTAL over any input — absent, malformed JSON, the wrong shape, a future `v`:
 * every one resolves to the `off` default without throwing. This matters
 * structurally: the store's `init()` runs at MODULE SCOPE where no React error
 * boundary could catch a throw, exactly as `readOnboarding` documents.
 */
export function parseWalkthrough(raw: string | null | undefined): WalkthroughRecord {
  if (!raw) return offRecord();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return offRecord();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return offRecord();
  const rec = parsed as Partial<WalkthroughRecord>;
  if (rec.v !== 1) return offRecord();
  const status = rec.status;
  if (status !== 'off' && status !== 'active' && status !== 'done' && status !== 'skipped') {
    return offRecord();
  }
  const acked =
    typeof rec.acked === 'object' && rec.acked !== null && !Array.isArray(rec.acked)
      ? rec.acked
      : {};
  const flags =
    typeof rec.flags === 'object' && rec.flags !== null && !Array.isArray(rec.flags)
      ? rec.flags
      : {};
  const out: WalkthroughRecord = { v: 1, status, acked, flags };
  if (typeof rec.lastPayment === 'number' && Number.isFinite(rec.lastPayment)) {
    out.lastPayment = rec.lastPayment;
  }
  return out;
}

export function serializeWalkthrough(r: WalkthroughRecord): string {
  return JSON.stringify(r);
}
