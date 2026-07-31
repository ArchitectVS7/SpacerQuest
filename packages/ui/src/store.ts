import {
  createInitialState,
  startDay,
  endDay as engineEndDay,
  applyPlayerAction,
  createSave,
  loadSave,
  promoteEdition,
  SaveError,
  isDayOver,
  type GameState,
  type GameEvent,
  type CheckResult,
  type DareMoveKind,
} from '@spacerquest/engine';
import type { Stat } from '@spacerquest/content';
import type { ShipComponentId, SpecialEquipmentId, ShipyardFail } from '@spacerquest/engine';
import {
  careerTransferMessage,
  combatAftermathSummary,
  dareRevealFrom,
  explorationFailExplanation,
  explorationOutcome,
  hangoutFailExplanation,
  loanFailExplanation,
  nextOnboardingSeen,
  shipyardFailureExplanation,
  successionSummary,
  type CombatAftermath,
  type DareRevealView,
  type SaveRecoveryNotice,
  type SuccessionSummary,
} from './format';
import * as sound from './sound';
// T-1702a · The Steam achievement mirror. Like `sound.ts`, a pure CLIENT of the
// event stream the store already scans — the engine emits nothing new for it,
// and no `GameState` field or `GameEvent` was added. See `steam.ts`'s header.
import * as steam from './steam';
// T-1701a · The cockpit's ONE storage surface. `localStorage` on the web build,
// an OS app-data file store on the Electron shell — same synchronous API, same
// throwing contract, so every `try/catch` below is unchanged. See `storage.ts`;
// the store must never reach around it (structurally asserted in
// `__tests__/storage.test.ts`).
import { storage } from './storage';
// T-1703 · THIS BUNDLE'S EDITION, compiled in by Vite. The store is the only
// place that stamps it: `newGame` births a career in it, and every load path
// (`init` / `loadSlot` / `importCareer`) runs the loaded career through the
// engine's `promoteEdition` so the BUILD — never the save — decides which rules
// apply. See `edition.ts`.
import { BUILD_EDITION } from './edition';

/**
 * React to an action's emitted event stream — the store's ONE presentation-side
 * choke point.
 *
 * T-310 introduced this as `playCues` for audio. T-1702a RENAMED it and folded
 * the Steam achievement mirror into the same body, deliberately: there are ~20
 * call sites, and two parallel one-line hooks would mean the next action added
 * can remember one and forget the other. One call, one name, both clients.
 *
 * Both clients are PURE CLIENTS of the rules: the engine emits nothing new for
 * either, and neither owns a rule. `committed` is true when the action actually
 * spent a die (a firm "commit" thunk); the outcome cues (jump / dice / wire /
 * fail / crit flourishes) come straight from `cuesForEvents`, and the
 * achievements from `achievementsForEvents`.
 *
 * NEITHER CALL MAY THROW into the action. `sound.play` is inert without an
 * unlocked AudioContext and `steam.unlock` swallows by contract, so neither is
 * wrapped here — wrapping would hide a real regression in either module.
 */
function reactToEvents(events: GameEvent[], committed: boolean): void {
  if (committed) sound.play('commit');
  for (const cue of sound.cuesForEvents(events)) sound.play(cue);
  steam.unlock(steam.achievementsForEvents(events, BUILD_EDITION));
}

/**
 * T-1702a · Mirror everything a career has ALREADY earned.
 *
 * Called at the three points a career ENTERS the cockpit — boot from the
 * autosave, a fresh career, and a slot load — because the `DeedEarned` events
 * that earned them are in the loaded save's past and will never be re-emitted.
 * A veteran who has only ever played the web build, or has played with Steam
 * closed, gets their whole Registry mirrored on the first Steam launch instead
 * of nothing. `steam.unlock` dedupes per session and the shell dedupes per Steam
 * account, so calling this on every entry is cheap. See `steam.ts`'s
 * `achievementsForState` for why it is not optional.
 */
function mirrorEarned(game: GameState): void {
  steam.unlock(steam.achievementsForState(game, BUILD_EDITION));
}

/**
 * The cockpit store. A tiny module-level store (no framework dependency) exposed
 * to React through `useSyncExternalStore`. It owns the single source of truth —
 * a `GameState` — and is the ONLY place that calls the engine. The UI is a
 * client of the rules, never their owner (TECH-STACK standing constraint).
 */

const SAVE_KEY = 'sq.save.v1';
const FX_KEY = 'sq.fx';
const ONBOARDING_KEY = 'sq.onboarding.v1';
const DEFAULT_SEED = 424242;

// ---- T-312 settings & save-slot keys ------------------------------------
// The autosave (`sq.save.v1`) is the live career; these add three explicit save
// slots plus the display-only settings. `GameState` deliberately does NOT carry
// the original seed — `rngState` mutates on every roll, so the seed is NOT part
// of the engine's pure state. T-1002 moved the seed into the versioned SAVE
// ENVELOPE (engine `createSave`/`loadSave`) so a `.sav` blob alone reproduces
// the run (TECH-STACK "reproducible bug reports"). The `sq.save.seed` key below
// is now a LEGACY fallback only: it recovers the seed for a pre-v2 (seedless)
// envelope, which `loadSave` reports as `seed: null`. New saves carry the seed
// in the envelope, so this key is redundant for them.
const AUTOSAVE_SEED_KEY = 'sq.save.seed'; // LEGACY seed fallback (pre-v2 envelopes)
const SLOT_KEY = (n: number): string => `sq.slot.${n}.v1`; // envelope (createSave output)
const SLOT_META_KEY = (n: number): string => `sq.slot.${n}.meta`; // display JSON
// T-1605a · Quarantine for an autosave that would not load. The boot path used to
// swallow the failure and hand the player a fresh career, whose FIRST autosave
// then overwrote the damaged bytes — the career was lost twice over. Copying the
// raw blob here before anything else can write is what makes the recovery
// save-PRESERVING: the evidence survives for a reproducible bug report
// (TECH-STACK's non-negotiable) and for a later hand-repair. It is also the
// crash screen's escape hatch (`quarantineAndClearAutosave`), so a save that
// faults on every boot can be set aside without being destroyed.
const CORRUPT_SAVE_KEY = `${SAVE_KEY}.corrupt`; // 'sq.save.v1.corrupt'
const REDUCED_MOTION_KEY = 'sq.reduced-motion'; // 'on' | 'off'
const TEXT_SIZE_KEY = 'sq.text-size'; // 'small' | 'normal' | 'large'
const SLOTS = [1, 2, 3] as const;

export type TextSize = 'small' | 'normal' | 'large';

/** A slot's display summary — read from the per-slot meta key, never from the
 *  (heavier) envelope, so the list renders without validating every slot. */
export interface SlotSummary {
  index: number; // 1..3
  empty: boolean;
  day?: number;
  credits?: number;
  systemId?: number;
  seed?: number;
  savedAt?: number; // epoch ms
}

export interface CockpitState {
  game: GameState;
  /** Index into the current dawn hand the player has picked up, or null. */
  selectedDie: number | null;
  /** Index of the die that was just spent — drives the phosphor bloom. */
  bloomDie: number | null;
  /** CRT effect layer on/off (persisted). */
  fx: boolean;
  /** Last engine refusal / error, surfaced to the player — never swallowed. */
  notice: string | null;
  /** Bumped on every new day so the boot sweep + dice roll replay. */
  bootKey: number;
  /**
   * The most recent player-produced honest check (die + stat + DC + margin),
   * captured from the engine's `StatCheck` event. Null when no check has been
   * resolved since the last selection/day — a cost-only action (sign-contract)
   * emits no StatCheck and therefore leaves this cleared. The UI never computes
   * these numbers; it reads them straight off the engine event.
   */
  lastCheck: { stat: Stat; result: CheckResult; context?: string } | null;
  /** Bumped on each new check so the readout can replay its reveal animation. */
  lastCheckKey: number;
  /**
   * T-307 combat overlay. `combatAftermath` holds the resolution summary of the
   * encounter that just ended (the engine has already nulled `game.encounter`),
   * so the overlay keys off `encounter || combatAftermath` and does not unmount
   * before the aftermath renders. Cleared on dismiss / new day / new game.
   */
  combatAftermath: CombatAftermath | null;
  /**
   * T-1602b death & legacy. The estate summary of a ship loss that JUST happened
   * — set from BOTH death paths (the combat killing blow in `combat()` and the
   * dusk life-support failure / day-end free attack in `endDay()`), composed
   * purely from the action's typed `ShipLost` + `LegacySuccession` events
   * (format.ts `successionSummary`), never recomputed. Like `combatAftermath` /
   * `explorationOutcome` / `patrolScan` this is CLIENT presentation meta-state
   * (NOT GameState), so a JSON round-trip of game state is unaffected and NO save
   * migration is needed; the persisted half of the feature —
   * `player.legacy.successionCount` — already exists and is already covered by
   * the engine's round-trip tests.
   *
   * READER: `App.tsx`'s `SuccessionNotice`, which renders full-screen independent
   * of the combat overlay (a dusk death has no overlay to hang off).
   *
   * DELIBERATE: because it is derived rather than persisted, a reload BEFORE the
   * notice is acknowledged loses the modal — the successor simply wakes up in
   * their junker. The durable reader that survives that reload is the Registry
   * pane's `registry-successions` row, which reads the persisted counter.
   */
  succession: SuccessionSummary | null;
  /** The last combat round was fuel-gated (weapons malfunction) — surfaced as a
   *  loud notice AND cleared like any transient combat readout. */
  combatMalfunction: boolean;
  /**
   * T-1403 off-lane sweep. The one-line honest summary of the LAST successful
   * exploration — the charted POI plus its salvage / fragment / contraband loot,
   * composed from the action's typed events (format.ts `explorationOutcome`). This
   * is CLIENT presentation meta-state (like `combatAftermath`), NOT GameState, so
   * a JSON round-trip of game state is unaffected and no save migration is needed.
   * READER: the Starmap pane's `exploration-outcome` readout. Null when the last
   * sweep failed or nothing has been swept since the last selection / new day.
   */
  explorationOutcome: string | null;
  /**
   * T-136 · THE SETTLED LIAR'S DICE FRAME — the outcome, the standing claim, both
   * hands (the dealer's ONLY on a challenge, per §6.1) and the signed credits /
   * disposition deltas of the LAST hand, built straight from the engine's
   * `DareHandResolved` event and NEVER recomputed (`format.ts dareRevealFrom`).
   *
   * THIS REPLACED `dareOutcome`, which described two opposed GUILE `StatCheck`s
   * the engine has not emitted since T-135 turned the Dare into a scene. It was
   * RENAMED rather than reshaped in place: a live field wearing a doc comment
   * about a mechanic that no longer exists is how this repo gets lied to.
   *
   * Like `explorationOutcome` / `combatAftermath` this is CLIENT presentation
   * meta-state (NOT GameState), so a JSON round-trip of game state is unaffected
   * and NO save migration is needed. READER: the Hangout pane's `dare-reveal`
   * frame. Null until a hand settles; cleared on selection / travel / new day /
   * new game / slot load, and by the pane's own "leave the table" control.
   */
  dareReveal: DareRevealView | null;
  /**
   * T-136 · The typed `Dare*` events the LAST action returned, in order — the
   * scene's move queue ("semantic move stream: never re-render state snaps").
   * At most ~3 per action: the player's move, the dealer's synchronous answer,
   * and the resolution. The scene plays them and clears the queue; it is skippable
   * by a click and is never awaited by an input path.
   *
   * CLIENT presentation meta-state, exactly like `dareReveal` — no `GameState`
   * field, no save migration.
   */
  dareBeats: DareBeat[];
  /**
   * T-132 the three social venues (meet / befriend / insult). The honest readout of
   * the LAST social beat: which venue, against whom, the GUILE check when the venue
   * rolled one (`befriend` only — `meet` and `insult` never roll), and the SIGNED
   * disposition delta the engine actually applied, read off its `DispositionChanged`
   * and never recomputed. Like `dareReveal` / `explorationOutcome` this is CLIENT
   * presentation meta-state (NOT GameState), so a JSON round-trip of game state is
   * unaffected and NO save migration is needed. READER: the Hangout pane's
   * `social-outcome` block (`social-check` + `social-result`). Null until a social
   * venue resolves; cleared alongside `dareReveal` on selection / travel / new day.
   */
  socialOutcome: {
    venue: 'meet' | 'befriend' | 'insult';
    npcId: string;
    npcName: string;
    /** `befriend` only — the engine's player GUILE StatCheck against the PORT's DC.
     *  Null for `meet` / `insult`, which land without a roll. */
    check: { stat: Stat; result: CheckResult } | null;
    /** The applied delta. 0 when the charm check failed (no disposition applied) or
     *  when the port authors a zero — an HONEST zero, never a hidden one. */
    dispositionDelta: number;
    disposition: number;
  } | null;
  /**
   * T-1405 patrol contraband scan. The honest GUILE check the patrol rolled
   * against a smuggler's hold during the LAST jump, plus its consequence (caught +
   * fine + which cargo was seized) — built straight from the Travel action's typed
   * `ContrabandScan` / `ContrabandConfiscated` events, never recomputed. Like
   * `combatAftermath` / `dareReveal` this is CLIENT presentation meta-state (NOT
   * GameState), so a JSON round-trip of game state is unaffected and no save
   * migration is needed. The patrol's `StatCheck` carries `actor === interceptor.name`
   * (not 'Player'), so it never pollutes `lastCheck`; the scan renders its own
   * breakdown from `patrolScan.check`. READER: the combat overlay's `patrol-scan`
   * readout. Null until a scan fires; cleared on selection / new day / new game /
   * aftermath dismiss / slot load.
   */
  patrolScan: {
    check: CheckResult;
    caught: boolean;
    fine: number;
    confiscatedContract: boolean;
    confiscatedPod: boolean;
  } | null;
  /**
   * T-311 onboarding. Which first-time coach prompts the player has already
   * dismissed or progressed past. This is CLIENT presentation meta-state (like
   * `fx`), deliberately kept out of GameState so the engine stays pure and a
   * JSON round-trip of game state is unaffected. Persisted under
   * `sq.onboarding.v1`; reset on New Game so a fresh Tour One re-teaches.
   */
  onboardingSeen: Record<string, true>;
  /**
   * T-312/T-1002. The current career's seed — the reader for the bezel display
   * AND the reproducibility metadata. Now persisted in the versioned save
   * envelope (engine `createSave`), recovered on load via `loadSave().seed`, with
   * the legacy `sq.save.seed` key as a pre-v2 fallback. Never stored in GameState
   * (see the key block above): `rngState` mutates every roll, so the original
   * seed rides the envelope, not the pure engine state.
   */
  seed: number;
  /** User reduced-motion override (persisted). Layered ON TOP of the media
   *  query — either the setting OR the OS preference suppresses motion. */
  reducedMotion: boolean;
  /** User text-size preference (persisted). Drives a zoom on `.tube` in CSS. */
  textSize: TextSize;
  /** Cached slot summaries so React re-renders when a slot is written/deleted. */
  saves: SlotSummary[];
  /**
   * T-1605a · WHY the boot fell back to a fresh career, or null when it didn't.
   * Set ONLY by `init()`, from `readSaveResult()`, carrying the ENGINE's own typed
   * `SaveError.code` (the UI classifies nothing) plus whether the unreadable bytes
   * reached the quarantine key.
   *
   * Like `succession` / `combatAftermath` / `explorationOutcome` / `patrolScan`
   * this is CLIENT presentation meta-state, NOT GameState — so a JSON round-trip
   * of game state is unaffected, `CURRENT_SAVE_VERSION` does not move and NO save
   * migration is owed.
   *
   * READER: `App.tsx`'s `RecoveryNotice`, the first child of `.screen`, which
   * renders `format.ts saveRecoveryMessage(recovery)` — the notice the player must
   * be told instead of a silent reset. `preserved` is read by that same function
   * to decide whether the sentence may promise the damaged bytes were kept.
   *
   * DELIBERATE: it is boot-scoped and dismissable (`dismissRecovery`). A reload of
   * the now-fresh career will not show it again — by then the career IS the save,
   * and repeating the warning would be a lie.
   */
  recovery: SaveRecoveryNotice | null;
  /**
   * T-1605c · TRUE once an autosave WRITE has failed, false once one succeeds
   * again.
   *
   * WHY IT EXISTS. `autosave()` below has always swallowed its write failure in a
   * bare catch, which is correct for "storage blocked, keep playing" but silent
   * for the failure this task's own measurements surfaced: a 1,000-day career
   * serializes to ~10.9 MiB (engine `__tests__/save-perf.test.ts`), Chromium's
   * localStorage quota is ~5 MB per origin, so a
   * long career crosses the quota ON THE WEB BUILD around day ~420 and keeps
   * *playing* while writing nothing. Every subsequent action is lost on reload,
   * and nothing on screen says so. That is the same class of silent omission
   * T-1605a fixed on the READ side (`recovery`); this is the WRITE side.
   *
   * Like `recovery` / `succession` / `patrolScan` / `onboardingSeen`, this is
   * CLIENT presentation meta-state, NOT GameState — so a JSON round-trip of game
   * state is unaffected, `CURRENT_SAVE_VERSION` does not move and NO save
   * migration is owed.
   *
   * NOT `recovery`: that field's own contract pins it as boot-scoped and set only
   * by `init()`, and this condition arises mid-play and can clear. NOT `notice`:
   * that is a one-shot line the next action overwrites, and a career that cannot
   * be saved must keep saying so until it can.
   *
   * READER: `App.tsx`'s `SaveWriteFailedNotice`, a persistent `role="alert"`
   * banner beside `RecoveryNotice`, whose prose is `format.ts
   * saveWriteFailedMessage()`. Asserted consumed by
   * `e2e/save-write-failure.spec.ts`.
   *
   * STILL LOAD-BEARING AFTER T-1701a. That task shipped the real cure — the
   * Electron shell writes saves as ordinary files in the OS app-data dir, where
   * there is no ~5 MB quota (see `storage.ts`) — but it did NOT retire this
   * flag: the web build is still the dev/playtest loop (TECH-STACK §3) and still
   * hits the quota, and the desktop file store has its own write failures (a
   * full disk, a read-only profile dir). The desktop bridge therefore THROWS on
   * a failed write exactly as `localStorage` does, so this flag keeps working on
   * both backends; `format.ts saveWriteFailedMessage(backend)` is what names the
   * right container. Truncating or capping the event log is NOT an option — the wire IS the
   * event log (TECH-STACK §2), so capping it is a rule change this task does not
   * own. `saveToSlot` needs nothing: it has surfaced its own failure notice since
   * T-312.
   */
  saveWriteFailed: boolean;
}

let state: CockpitState = init();
// T-1702b · Publish the booted career's system/day BEFORE the player touches
// anything — a career restored from the autosave (or from Steam Cloud) should
// show on the friends list at once, not only after the first action. Safe at
// MODULE SCOPE for the same reason `mirrorEarned` is: `syncPresence` swallows by
// contract and is a no-op with no shell, so it cannot throw out of module init
// where no error boundary could catch it.
steam.syncPresence(state.game);
const listeners = new Set<() => void>();

// T-1605a · `init()` runs at MODULE SCOPE, outside React, so an error boundary
// could never catch a throw from here — the guard has to live in the readers. It
// deliberately has no top-level try/catch: every storage read it performs
// (`readFx` / `readSaveResult` / `readOnboarding` / `readReducedMotion` /
// `readTextSize` / `readSlots`) is individually guarded and total over any input,
// so module init cannot throw on any save. Considered and closed, not forgotten.
function init(): CockpitState {
  const fx = readFx();
  const { loaded, recovery } = readSaveResult();
  const game = loaded?.game ?? startDay(createInitialState(DEFAULT_SEED)).state;
  // The seed rides the loaded envelope (T-1002); with no save, the game booted
  // from DEFAULT_SEED, so the displayed seed matches it.
  const seed = loaded ? loaded.seed : DEFAULT_SEED;
  // T-1702a · Reconcile the loaded career's Registry with Steam. Safe at MODULE
  // SCOPE for the same reason every other read here is: `steam.unlock` swallows
  // by contract and is a no-op with no shell, so it cannot throw out of `init()`
  // where no error boundary could catch it. On a fresh career this is an empty
  // list.
  mirrorEarned(game);
  return {
    game,
    selectedDie: null,
    bloomDie: null,
    fx,
    notice: null,
    bootKey: 1,
    lastCheck: null,
    lastCheckKey: 0,
    combatAftermath: null,
    succession: null,
    combatMalfunction: false,
    explorationOutcome: null,
    dareReveal: null,
    dareBeats: [],
    socialOutcome: null,
    patrolScan: null,
    onboardingSeen: readOnboarding(),
    seed,
    reducedMotion: readReducedMotion(),
    textSize: readTextSize(),
    saves: readSlots(),
    recovery,
    // T-1605c: boot has not attempted a write yet, so there is nothing to warn
    // about. A blocked/full store raises it on the first autosave instead — and a
    // blocked READ is already `recovery: 'storage-unavailable'`.
    saveWriteFailed: false,
  };
}

/**
 * Scan the events an action returned for the LAST `StatCheck` and surface it as
 * the honest-check readout. Actions that emit no check (e.g. sign-contract, a
 * pure die-cost) return null, which correctly clears the readout.
 */
function lastCheckFrom(
  events: GameEvent[],
): { stat: Stat; result: CheckResult; context?: string } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'StatCheck') {
      return { stat: e.stat, result: e.result, context: e.actionContext };
    }
  }
  return null;
}

/**
 * Pull the first player-facing failure out of an action's event list so it can
 * be surfaced as a visible notice — the load-bearing guarantee for T-305: every
 * engine refusal reaches the player, never a silent no-op (UGT Finding 4). A
 * failed `TradeEvent` (can't sign twice, no renegotiate, not enough credits,
 * pay-debt-failed) carries an honest `actionDetails`; if the engine ever omits
 * one we still fall back to an honest generic line rather than saying nothing.
 * Returns null when no failure occurred (the action succeeded).
 */
function failNoticeFrom(events: GameEvent[]): string | null {
  for (const e of events) {
    if (e.type === 'TradeEvent' && e.success === false) {
      return e.actionDetails ?? 'That action was refused.';
    }
  }
  return null;
}

/**
 * Translate a `StoryletChoiceBlocked` engine refusal into an honest visible
 * notice — the same "never a silent no-op" guarantee the trade pane keeps.
 * Returns null when the action was NOT blocked (it resolved). The panel gates
 * die-requiring choices itself, so a block is rare (a race with state), but if
 * one lands the player must see why.
 */
function storyletBlockNoticeFrom(events: GameEvent[]): string | null {
  for (const e of events) {
    if (e.type !== 'StoryletChoiceBlocked') continue;
    switch (e.reason) {
      case 'insufficient-credits':
        return 'Not enough credits for that choice.';
      case 'missing-die':
        return 'That choice needs a die — pick one from the hand first.';
      case 'not-available':
        return 'That storylet is no longer on offer.';
      case 'unknown-choice':
        return 'That choice could not be resolved.';
    }
  }
  return null;
}

/**
 * T-1403 · FIND the `ExplorationFailed` in a returned event stream and render it.
 * Returns null in EXACTLY ONE case — no `ExplorationFailed` is present at all (the
 * detour discovered a POI and paid out). It is no longer possible for a present
 * refusal to render as null.
 *
 * T-131 · THE PROSE LIVES IN `format.ts` `explorationFailExplanation`, which is an
 * exhaustive `switch` over the named `ExplorationFailReason` union with no
 * `default` — so a new reason is a compile error there rather than silence here.
 * This function used to switch inline and covered five of six reasons;
 * `recovery-in-progress` fell through to `null` from T-111 until T-131, despite
 * this docstring claiming full coverage. It does not claim what it cannot enforce
 * any more: the type does the enforcing.
 */
function explorationFailNoticeFrom(events: GameEvent[]): string | null {
  for (const e of events) {
    if (e.type !== 'ExplorationFailed') continue;
    return explorationFailExplanation(e.reason);
  }
  return null;
}

/**
 * T-1404 · Find the engine's typed `HangoutEvent` fail (a social/Dare venue) and
 * render it — the "typed fails render, never silence" guarantee. Returns null when
 * no Hangout fail occurred (a successful venue carries no `failReason`).
 *
 * T-132 · The switch itself moved to `format.ts`'s `hangoutFailExplanation`, where
 * it is exhaustive-by-compilation and unit-testable without booting the store
 * (`init()` runs at module load here). This function is now purely the FINDER.
 * Recorded because the move fixed a live hole: the old inline switch here covered
 * `no-opponent` and the three malformed-die reasons and fell through to `null` on
 * `'venue-not-offered'`, so a venue the port does not run refused in silence
 * (F-123-1, the sibling of T-131's `recovery-in-progress`).
 */
function hangoutFailNoticeFrom(events: GameEvent[]): string | null {
  for (const e of events) {
    if (e.type !== 'HangoutEvent' || !e.failReason) continue;
    return hangoutFailExplanation(e.failReason);
  }
  return null;
}

/**
 * T-1404 · Find a Penny Wise `LoanEvent{kind:'failed'}` refusal and render it.
 * Returns null when the borrow/repay committed (a 'borrowed' / 'repaid' event
 * carries no `failReason`).
 *
 * T-132 · The switch moved to `format.ts`'s `loanFailExplanation`. It no longer has
 * (and must not regain) a `default` arm — the old one answered every unlisted
 * reason with "Penny Wise turned that request down", which read as a REFUSAL when
 * `'venue-not-offered'` actually means the port runs no desk at all.
 */
function loanFailNoticeFrom(events: GameEvent[]): string | null {
  for (const e of events) {
    if (e.type !== 'LoanEvent' || e.kind !== 'failed') continue;
    // The engine sets `failReason` on every 'failed' LoanEvent, but the field is
    // OPTIONAL in the event type; this arm keeps that last structural gap from
    // being the one place the desk goes quiet.
    return e.failReason
      ? loanFailExplanation(e.failReason)
      : 'Penny Wise turned that request down.';
  }
  return null;
}

/**
 * T-1405 · Translate a `CrewEvent{kind:'failed'}` refusal into an honest visible
 * notice — the "typed fails render, never silence" guarantee. Returns null when the
 * hire/dismiss committed (a 'hired'/'dismissed' event carries no `failReason`).
 * Covers the crew preconditions (unknown-role / already-hired / no-berth /
 * insufficient-credits / not-hired) plus the UI-prevented malformed-die reasons.
 */
function crewFailNoticeFrom(events: GameEvent[]): string | null {
  for (const e of events) {
    if (e.type !== 'CrewEvent' || e.kind !== 'failed') continue;
    switch (e.failReason) {
      case 'unknown-role':
        return 'No such crew role to hire.';
      case 'already-hired':
        return 'That role is already aboard.';
      case 'no-berth':
        return 'No free cabin berth — upgrade the cabin to make room for crew.';
      case 'insufficient-credits':
        return 'Not enough credits to cover that hire.';
      case 'not-hired':
        return 'That role is not aboard to dismiss.';
      case 'no-die':
      case 'invalid-die-index':
      case 'die-already-spent':
        return 'That crew order needs a fresh die from the hand.';
      default:
        return 'That crew order was refused.';
    }
  }
  return null;
}

/**
 * T-1405 · Translate a `PortEvent{kind:'failed'}` refusal into an honest visible
 * notice. Returns null when the buy committed (a 'purchased' event carries no
 * `failReason`). Covers the port preconditions (not-at-port / not-purchasable /
 * already-owned / insufficient-credits) plus the UI-prevented malformed-die reasons.
 */
function portFailNoticeFrom(events: GameEvent[]): string | null {
  for (const e of events) {
    if (e.type !== 'PortEvent' || e.kind !== 'failed') continue;
    switch (e.failReason) {
      case 'not-at-port':
        return 'You must be docked at the port to buy its authority.';
      case 'not-purchasable':
        return 'No purchasable port authority in this system.';
      case 'already-owned':
        return 'You already hold this port stake.';
      case 'insufficient-credits':
        return 'Not enough credits to buy this port stake.';
      case 'no-die':
      case 'invalid-die-index':
      case 'die-already-spent':
        return 'The port office needs a fresh die from the hand.';
      default:
        return 'That port purchase was refused.';
    }
  }
  return null;
}

/**
 * T-1405 · Translate a `DiceRerolled{failReason}` refusal into an honest visible
 * notice. Returns null when the re-roll committed (a successful `DiceRerolled`
 * carries a `dieIndex`/`result`, no `failReason`). The die-index / already-spent
 * reasons are UI-prevented but still get a line so a race with state is never a
 * silent no-op; `no-charge` fires when the day's re-roll charges are exhausted.
 */
function rerollFailNoticeFrom(events: GameEvent[]): string | null {
  for (const e of events) {
    if (e.type !== 'DiceRerolled' || !e.failReason) continue;
    switch (e.failReason) {
      case 'no-hand':
        return 'No dawn hand to re-roll.';
      case 'invalid-die-index':
        return 'That die is not in the hand.';
      case 'die-already-spent':
        return 'That die is already spent — it cannot be re-rolled.';
      case 'no-charge':
        return 'No re-roll charges left today.';
    }
  }
  return null;
}

function emit(): void {
  for (const l of listeners) l();
}
function set(patch: Partial<CockpitState>): void {
  state = { ...state, ...patch };
  // T-1702b · Rich presence, at the store's ONE state-update choke point rather
  // than at ~20 action call sites — the same argument that folded the achievement
  // mirror into `reactToEvents`: an action added later cannot forget it.
  // `syncPresence` dedupes on the system|day pair, so the ordinary UI-only patch
  // costs one string compare and never touches the bridge. It never throws by
  // contract (see `steam.ts`), so it is deliberately UNWRAPPED here, for the same
  // reason `reactToEvents` is unwrapped: a wrapper would hide a real regression.
  // No `CockpitState` field is added for it.
  steam.syncPresence(state.game);
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getSnapshot(): CockpitState {
  return state;
}

// ---- persistence (T-112 save envelope) ----------------------------------

/** T-1605a · What the boot read out of the autosave key: the career if it loaded,
 *  and — if it did NOT — the reason the player is owed. */
interface SaveReadResult {
  loaded: { game: GameState; seed: number } | null;
  /** Null on a clean boot AND on a first run: no save at all is not a failure,
   *  and a banner there would be a lie. Non-null only when a save was PRESENT and
   *  could not be turned into a career. */
  recovery: SaveRecoveryNotice | null;
}

/**
 * Read the live autosave.
 *
 * T-1605a replaced the old `readSave()`, whose bare `catch { return null }`
 * silently traded a damaged career for a fresh one. The failure is now reported
 * (`recovery`) and the unreadable bytes are quarantined before the fresh career's
 * first autosave can overwrite them. The classification is the ENGINE's:
 * `loadSave` throws `SaveError` with a typed `code`, and this function only
 * forwards it — the UI never inspects a save blob itself.
 *
 * Note the sibling path is already honest and is deliberately untouched:
 * `loadSlot` has told the player about a corrupt slot since T-312 (see its
 * `Slot N is corrupt` notice). The gap this task closes is the AUTOSAVE BOOT path
 * only; `newGame` is likewise unaffected.
 */
function readSaveResult(): SaveReadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    // The store itself is unreachable (private mode / blocked). Not damage —
    // and the notice must not accuse the save of being damaged. Nothing can be
    // quarantined either, so `preserved` is honestly false.
    return { loaded: null, recovery: { code: 'storage-unavailable', preserved: false } };
  }
  if (!raw) return { loaded: null, recovery: null }; // first run — no save, no failure
  try {
    const { state: loadedState, seed } = loadSave(raw);
    // T-1703 · THE BUILD DECIDES, NOT THE SAVE. A demo autosave opened by the
    // full build is promoted in place (locks lift, rank re-derives); a full
    // autosave opened by the DEMO build is REFUSED — which is the hole that would
    // otherwise let a player fly veteran content on a demo licence just by having
    // played the full game first. A refusal is quarantined exactly like a corrupt
    // save, so the full career survives untouched for the full build to open.
    const promoted = promoteEdition(loadedState, BUILD_EDITION);
    if ('refused' in promoted) {
      const preserved = quarantineAutosave(raw);
      return { loaded: null, recovery: { code: 'edition-refused', preserved } };
    }
    const state = promoted.state;
    // T-1002: a pre-v2 autosave has no seed in its envelope (loadSave returns
    // seed: null). Recover the seed the old build stashed in the legacy
    // `sq.save.seed` key so the bezel display and reproducibility survive the
    // upgrade; the next `autosave` re-writes the envelope as v2 with the seed
    // embedded, so this legacy read path self-heals after one write. A v2 save
    // with an explicit seed — including seed 0 — never hits this fallback.
    const recovered = seed === null ? readAutosaveSeed() : seed;
    return { loaded: { game: state, seed: recovered }, recovery: null };
  } catch (err) {
    // Quarantine FIRST, then report: the copy has to land before the fallback
    // career's first autosave can write over `SAVE_KEY`.
    const preserved = quarantineAutosave(raw);
    const code = err instanceof SaveError ? err.code : 'unknown';
    return { loaded: null, recovery: { code, preserved } };
  }
}

/**
 * Copy the unreadable autosave to the quarantine key. Returns whether the copy
 * actually landed — the caller must not promise custody it does not have (a full
 * quota or a blocked store makes this fail, and that is a report, not a crash).
 *
 * Deliberately a COPY, not a move: leaving `sq.save.v1` in place costs nothing
 * and gives a future build (a new migration, a bug fix) a second chance at it.
 */
function quarantineAutosave(raw: string): boolean {
  try {
    storage.setItem(CORRUPT_SAVE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * T-1605a · The crash screen's last resort. A save that faults the cockpit on
 * EVERY boot would otherwise brick the player, and this is the one place in the
 * crash path that can remove their career — so it is routed through the same
 * quarantine copy, which makes the escape hatch save-PRESERVING by construction
 * rather than by luck. Returns whether the bytes were preserved; never deletes
 * without copying first.
 *
 * READER: `ErrorBoundary.tsx`'s `CrashScreen` ("Start a fresh career").
 */
export function quarantineAndClearAutosave(): boolean {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
  if (raw === null) return false; // nothing to preserve — clearing is a no-op
  const preserved = quarantineAutosave(raw);
  if (!preserved) return false; // refuse to delete what we could not copy
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* the copy survives either way — non-fatal */
  }
  return true;
}

/**
 * T-1605a · Dismiss the corrupt-save notice. Boot-scoped and one-way: the fresh
 * career the player is now flying is real, and re-raising the warning later would
 * be false.
 */
export function dismissRecovery(): void {
  if (state.recovery) set({ recovery: null });
}
/**
 * Write the live career to the autosave slot. Called after EVERY mutating action
 * and at dusk (`endDay`). Dusk is the canonical checkpoint the task names, but the
 * per-action writes are load-bearing too: they preserve mid-day and mid-encounter
 * reload survival (T-307's combat reload criterion boots from this exact key), so
 * the per-action call must not be removed. The `seed` (T-1002) rides the save
 * envelope so the blob alone reproduces the run.
 */
function autosave(game: GameState, seed: number): void {
  try {
    storage.setItem(SAVE_KEY, createSave(game, seed));
    // T-1605c: a write that lands clears any standing alarm. Doing it HERE
    // (rather than in `newGame` / `loadSlot`) is what makes the flag honest in
    // both directions: those two paths clear it because they autosave and the
    // write succeeded — not merely because the player pressed a button. If the
    // store is still full, a fresh career keeps the banner, which is the truth.
    if (state.saveWriteFailed) set({ saveWriteFailed: false });
  } catch {
    // Still non-fatal for PLAY — the career in memory is unharmed and every verb
    // keeps working. But it is fatal for the career's PERSISTENCE, so it stops
    // being silent: T-1605c raises the flag `App.tsx` renders as a standing
    // banner. Guarded on the current value because autosave runs after EVERY
    // action, and an unguarded `set` would emit to every subscriber on each one.
    if (!state.saveWriteFailed) set({ saveWriteFailed: true });
  }
}
function readFx(): boolean {
  try {
    return storage.getItem(FX_KEY) !== 'off';
  } catch {
    return true;
  }
}

// ---- T-312 settings & save-slot persistence -----------------------------

function readAutosaveSeed(): number {
  try {
    const raw = storage.getItem(AUTOSAVE_SEED_KEY);
    const n = raw === null ? NaN : Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : DEFAULT_SEED;
  } catch {
    return DEFAULT_SEED;
  }
}
function readReducedMotion(): boolean {
  try {
    return storage.getItem(REDUCED_MOTION_KEY) === 'on';
  } catch {
    return false;
  }
}
function readTextSize(): TextSize {
  try {
    const v = storage.getItem(TEXT_SIZE_KEY);
    return v === 'small' || v === 'large' ? v : 'normal';
  } catch {
    return 'normal';
  }
}
function readSlotMeta(n: number): Omit<SlotSummary, 'index' | 'empty'> | null {
  try {
    const raw = storage.getItem(SLOT_META_KEY(n));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Omit<SlotSummary, 'index' | 'empty'>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
/** Read all slot summaries for the list. Uses the display-only meta key (never
 *  `loadSave`), so rendering the list does not validate every slot envelope. */
function readSlots(): SlotSummary[] {
  return SLOTS.map((n) => {
    const meta = readSlotMeta(n);
    return meta ? { index: n, empty: false, ...meta } : { index: n, empty: true };
  });
}

// ---- T-311 onboarding-seen persistence ----------------------------------

function readOnboarding(): Record<string, true> {
  try {
    const raw = storage.getItem(ONBOARDING_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, true>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
function writeOnboarding(seen: Record<string, true>): void {
  try {
    storage.setItem(ONBOARDING_KEY, JSON.stringify(seen));
  } catch {
    /* storage unavailable — non-fatal for play */
  }
}

/**
 * Auto-dismiss reconcile for the onboarding prompts. Given the game state before
 * and after an action, mark seen every prompt whose taught affordance was just
 * used (the pure rule lives in format.ts). Persists only when the record
 * actually changed, and returns the record to fold into the action's `set`
 * patch — so an auto-dismiss lands in the SAME render as the state change.
 */
function reconcileOnboarding(prev: GameState, next: GameState): Record<string, true> {
  const seen = nextOnboardingSeen(prev, next, state.onboardingSeen);
  if (seen !== state.onboardingSeen) writeOnboarding(seen);
  return seen;
}

// ---- actions ------------------------------------------------------------

export function newGame(seed: number): void {
  // T-1703 · A fresh career is BORN in the running build's edition. This is the
  // one place a demo career comes into existence; everything downstream (the
  // gate, the banner, the ceiling, the end card) follows from this scalar.
  const game = startDay(createInitialState(seed, BUILD_EDITION)).state;
  // T-1002: the seed now rides the save envelope (autosave embeds it), so a
  // reload recovers it from the save itself — including an explicit seed of 0.
  // The legacy `sq.save.seed` write is kept as a redundant fallback: it lets
  // `readSaveResult` recover the seed for a pre-v2 envelope (seed: null).
  autosave(game, seed);
  try {
    storage.setItem(AUTOSAVE_SEED_KEY, String(seed));
  } catch {
    /* storage unavailable — non-fatal for play */
  }
  // A fresh career re-teaches Tour One: wipe the onboarding-seen record so the
  // contextual prompts fire again from the top.
  writeOnboarding({});
  set({
    game,
    seed,
    selectedDie: null,
    bloomDie: null,
    notice: null,
    bootKey: state.bootKey + 1,
    lastCheck: null,
    combatAftermath: null,
    succession: null,
    combatMalfunction: false,
    explorationOutcome: null,
    dareReveal: null,
    dareBeats: [],
    socialOutcome: null,
    patrolScan: null,
    onboardingSeen: {},
    // T-1605a: the boot's corrupt-save notice is stale the moment the player
    // deliberately starts a career of their own — the fallback career it was
    // explaining no longer exists. The quarantined blob is untouched.
    recovery: null,
  });
  // A fresh career: the dawn sting and the ambient drive-hum bed. The hum defers
  // itself internally until the first user gesture unlocks the AudioContext, so
  // this never triggers an autoplay-policy error.
  sound.play('dawn');
  sound.setDriveHum(true);
  // T-1702a · Usually a no-op (a fresh career has an empty Registry), and
  // deliberately NOT special-cased: succession carries a legacy forward, so
  // "new game" is not a guarantee of zero deeds.
  mirrorEarned(game);
}

export function selectDie(index: number): void {
  const hand = state.game.player.dawnHand;
  if (!hand || hand.spent[index]) return;
  // A fresh selection resets the resolved-check readout AND any prior sweep
  // outcome, so a stale off-lane summary never lingers next to a new action.
  set({
    selectedDie: state.selectedDie === index ? null : index,
    notice: null,
    lastCheck: null,
    explorationOutcome: null,
    dareReveal: null,
    dareBeats: [],
    socialOutcome: null,
    patrolScan: null,
  });
}

export function signContract(contractIndex: number): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then sign.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Trade',
      action: 'sign-contract',
      contractIndex,
      spendDie: die,
    });
    autosave(next, state.seed);
    // Signing is a die-cost, not a check: it emits no StatCheck, so lastCheck
    // resolves to null here — the readout stays cleared, which is honest.
    const lastCheck = lastCheckFrom(events);
    // Surface an engine refusal (already carrying a contract) instead of a
    // silent die-deselect. On success this scan returns null and the notice
    // clears — the previous behaviour, preserved.
    const notice = failNoticeFrom(events);
    set({
      game: next,
      // On refusal the engine spent no die; keep the selection so the player can
      // retry, and don't bloom a die that was never consumed.
      selectedDie: notice ? die : null,
      bloomDie: notice ? null : die,
      notice,
      lastCheck,
      lastCheckKey: state.lastCheckKey + 1,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, !notice);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That action could not be resolved.' });
  }
}

/**
 * T-1604b · Dump the run riding in the hold (UGT finding F2). Costs a die and the
 * whole payment, so it mirrors `signContract` exactly: a die must be armed first,
 * the ENGINE owns the refusal (nothing in the hold → a failed `TradeEvent` that
 * `failNoticeFrom` surfaces as a visible notice, never a silent no-op), and the
 * die only blooms when the engine actually spent it. No rule lives here — the UI
 * is a client of `resolveTrade`, not its owner.
 */
export function abandonContract(): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then abandon the run.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Trade',
      action: 'abandon-contract',
      spendDie: die,
    });
    autosave(next, state.seed);
    const notice = failNoticeFrom(events);
    set({
      game: next,
      // On refusal the engine spent no die; keep the selection so the player can
      // retry, and don't bloom a die that was never consumed.
      selectedDie: notice ? die : null,
      bloomDie: notice ? null : die,
      notice,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, !notice);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That action could not be resolved.' });
  }
}

/**
 * Top up fuel at the local depot. Fueling consumes a die (engine PRD §7: every
 * meaningful action spends a die), so this requires a selection. A shortfall
 * (not enough credits) comes back as a failed TradeEvent and is surfaced via
 * `notice` — never a silent no-op.
 */
export function buyFuel(amount: number): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then buy fuel.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Trade',
      action: 'buy-fuel',
      fuelAmount: amount,
      spendDie: die,
    });
    autosave(next, state.seed);
    const notice = failNoticeFrom(events);
    set({
      game: next,
      selectedDie: notice ? die : null,
      bloomDie: notice ? null : die,
      notice,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, !notice);
  } catch (err) {
    set({
      notice: err instanceof Error ? err.message : 'The fuel purchase could not be resolved.',
    });
  }
}

/**
 * Pay down the Merchant Guild debt. This is a ledger transfer, NOT a job — it
 * costs credits, never a die (engine comment / PRD §7.3: remote payments need
 * no roll), so it leaves the dawn hand and its selection untouched. The engine
 * clamps the payment to min(amount, credits, debt); paying with zero credits
 * comes back as a `pay-debt-failed` TradeEvent surfaced through `notice`.
 */
export function payDebt(amount: number): void {
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Trade',
      action: 'pay-debt',
      amount,
    });
    autosave(next, state.seed);
    const notice = failNoticeFrom(events);
    // No die is spent — do not touch selectedDie / bloomDie.
    set({ game: next, notice, onboardingSeen: reconcileOnboarding(state.game, next) });
    reactToEvents(events, false);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'The debt payment could not be resolved.' });
  }
}

/**
 * Haggle a manifest contract — the one player-initiated action reachable from
 * the single-system cockpit that produces an honest d20 check. The engine rolls
 * TRADE vs DC 12 and emits a `StatCheck` carrying the full CheckResult, which we
 * surface via `lastCheck`. Refusals (a second haggle) come back as a failed
 * TradeEvent and are surfaced through `notice` — never swallowed.
 */
export function haggleContract(contractIndex: number): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then haggle.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Trade',
      action: 'haggle',
      contractIndex,
      spendDie: die,
    });
    autosave(next, state.seed);
    const lastCheck = lastCheckFrom(events);
    // Surface an engine refusal (broker won't renegotiate) instead of a silent no-op.
    const refusal = events.find(
      (e) => e.type === 'TradeEvent' && e.action === 'haggle' && e.success === false,
    );
    const notice =
      lastCheck === null && refusal && refusal.type === 'TradeEvent'
        ? (refusal.actionDetails ?? 'The broker will not renegotiate this contract.')
        : null;
    set({
      game: next,
      selectedDie: null,
      bloomDie: die,
      notice,
      lastCheck,
      lastCheckKey: state.lastCheckKey + 1,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, !notice);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That action could not be resolved.' });
  }
}

/**
 * Plan-and-commit a jump from the starmap (T-304). The map component selects a
 * reachable destination and previews the engine's own fuel cost / DC / danger;
 * this action is the single engine call that commits it. Every outcome is
 * surfaced through `notice` (never silent): the engine deducts fuel whenever the
 * ship can afford the jump, EVEN on a failed PILOT roll, so a nav malfunction is
 * a real cost the player must see.
 */
export function travelTo(destinationId: number): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then jump.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Travel',
      destinationId,
      spendDie: die,
    });
    autosave(next, state.seed);
    // The travel PILOT check reuses the honest-check readout (CheckBreakdown).
    const lastCheck = lastCheckFrom(events);
    const travel = events.find(
      (e): e is Extract<GameEvent, { type: 'TravelEvent' }> => e.type === 'TravelEvent',
    );
    // T-1405 · A PATROL interception of a smuggler runs a GUILE contraband scan
    // INSIDE this jump (engine actions/patrol.ts), emitting a `ContrabandScan` and,
    // on a catch, a `ContrabandConfiscated` into these events. Capture both into the
    // client `patrolScan` so the combat overlay can render the scan's GUILE
    // breakdown + consequence. The scan's own StatCheck carries actor ===
    // interceptor.name (not 'Player'), so it never lands in `lastCheck`.
    const scan = events.find(
      (e): e is Extract<GameEvent, { type: 'ContrabandScan' }> => e.type === 'ContrabandScan',
    );
    const confiscated = events.find(
      (e): e is Extract<GameEvent, { type: 'ContrabandConfiscated' }> =>
        e.type === 'ContrabandConfiscated',
    );
    const patrolScan: CockpitState['patrolScan'] = scan
      ? {
          check: scan.check,
          caught: scan.caught,
          fine: confiscated?.fine ?? 0,
          confiscatedContract: confiscated?.confiscatedContract ?? false,
          confiscatedPod: confiscated?.confiscatedPod ?? false,
        }
      : null;

    let notice: string | null = null;
    if (next.encounter) {
      // T-307 will build the combat overlay; until then the honest surface is a
      // notice that the jump was intercepted en route.
      notice = 'Intercepted en route — combat station.';
    } else if (travel && travel.success === false) {
      // T-1102: the engine flags a dry-tank refusal explicitly with
      // `insufficientFuel`; `fuelUsed === 0` is the legacy-save fallback for the
      // same case (a failed nav check burns fuel, so it never reads 0 here).
      notice =
        travel.insufficientFuel || travel.fuelUsed === 0
          ? 'Not enough fuel for that jump.'
          : 'Navigation malfunction — the die is spent and fuel burned; you stayed put.';
    }
    set({
      game: next,
      selectedDie: null,
      bloomDie: die,
      notice,
      lastCheck,
      lastCheckKey: state.lastCheckKey + 1,
      // Clear any prior off-lane sweep summary — a fresh jump on the same pane
      // must not read alongside a stale exploration outcome — and any prior Dare
      // readout (a jump can carry the player away from the Hangout).
      explorationOutcome: null,
      dareReveal: null,
      dareBeats: [],
      socialOutcome: null,
      patrolScan,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    // The jump die is always spent (even a failed PILOT roll burns it), so this
    // is always a committed action. `cuesForEvents` adds jump / combatStart.
    reactToEvents(events, true);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That jump could not be resolved.' });
  }
}

/**
 * T-1403 · Off-lane sweep (PRD §7.2) — the missing `Explore` verb. The starmap
 * pane is a pure CLIENT of the exploration rules exactly as it is of travel: it
 * arms a die and this is the single engine call. The engine burns the die on a
 * PILOT nav check (DC/fuel from content), and every outcome is surfaced — the nav
 * check rides the shared PILOT `CheckBreakdown` (via `lastCheck`), the loot
 * (salvage / Signal Fragment / sealed contraband pod) reads through the
 * `explorationOutcome` summary, and every typed `ExplorationFailed` reason renders
 * as a visible notice, never a silent no-op. A discovered contraband pod arms the
 * `derelict.sealed-pod` storylet the same day (engine `refreshAvailableStorylets`),
 * so the carrying choice surfaces behind the existing storylet launcher.
 */
export function explore(): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then sweep.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Explore',
      spendDie: die,
    });
    autosave(next, state.seed);
    // The nav PILOT check reuses the honest-check readout (CheckBreakdown, PILOT).
    const lastCheck = lastCheckFrom(events);
    const failNotice = explorationFailNoticeFrom(events);
    // On a discovery, summarise the loot; a failed sweep clears the outcome and
    // speaks through the notice instead. T-131 · re-checked for the new
    // `insufficient-dice` reason, where a POI genuinely WAS charted but nothing
    // paid out: there is no loot to summarise, so `null` is the honest value and
    // the notice carries the whole story. `committed` below stays true — the
    // sweep's own die is spent either way.
    const outcome = failNotice ? null : explorationOutcome(events);
    // The engine spends the die BEFORE the fuel gate (exploration.ts), so an
    // insufficient-fuel refusal still burns it — a StatCheck-based signal would
    // wrongly read that as uncommitted. Read the authoritative spent flag off the
    // returned hand instead: true whenever the die was actually consumed (success,
    // nav-check, insufficient-fuel), false for the UI-prevented no-spend refusals.
    const committed = next.player.dawnHand?.spent[die] === true;
    set({
      game: next,
      selectedDie: committed ? null : die,
      bloomDie: committed ? die : null,
      notice: failNotice,
      lastCheck,
      lastCheckKey: state.lastCheckKey + 1,
      explorationOutcome: outcome,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, committed);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That sweep could not be resolved.' });
  }
}

/**
 * T-136 · The typed `Dare*` events one action returned, in order — the scene's
 * move queue. Deliberately the ENGINE's own event union rather than a UI-side
 * re-description of it: a beat the engine did not emit cannot be played, and a
 * new event variant is a compile error here rather than a silently-dropped beat.
 */
export type DareBeat = Extract<
  GameEvent,
  { type: 'DareHandStarted' | 'DareBidPlaced' | 'DarePeeked' | 'DareHandResolved' }
>;

/** The four scene-event types, as a runtime set for the beat filter. */
const DARE_BEAT_TYPES = new Set<GameEvent['type']>([
  'DareHandStarted',
  'DareBidPlaced',
  'DarePeeked',
  'DareHandResolved',
]);

function dareBeatsFrom(events: GameEvent[]): DareBeat[] {
  return events.filter((e): e is DareBeat => DARE_BEAT_TYPES.has(e.type));
}

/**
 * T-1404 / T-136 · OPEN a hand of Liar's Dice against a co-located NPC (PRD §7,
 * `docs/LIARS-DICE_REDESIGN.md`). The Hangout pane is still a pure CLIENT of the
 * T-1303 `VisitHangout{dare}` venue: it arms a die, names an opponent and a seed
 * wager, and this is the single engine call.
 *
 * WHAT CHANGED AT T-135, AND WHY THIS FUNCTION HAD TO FOLLOW. The opening visit no
 * longer RESOLVES anything: it emits a `DareHandStarted` and OPENS
 * `state.dareHand`. There are no opposed `StatCheck`s any more (§8.4 — the hand's
 * one possible check is the optional Peek), so the old `dareOutcome` readout this
 * function built could never be populated again, and the pane rendered nothing
 * after a wager while the engine blocked every other verb behind
 * `ActionBlocked{active-dare-hand}`. THE SUCCESS SIGNAL IS NOW `next.dareHand !==
 * null` — the scene opened — not an outcome event.
 *
 * A `no-opponent` / `venue-not-offered` / malformed-die fail spends NO die (read
 * the authoritative spent flag), keeps the selection, and surfaces a visible
 * notice, exactly as before.
 */
export function visitDare(opponentId: string, wager: number): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then wager.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'VisitHangout',
      venue: 'dare',
      opponentId,
      wager,
      spendDie: die,
    });
    autosave(next, state.seed);
    // The die is spent the instant the Dare commits (past the no-opponent /
    // malformed-die guards). Read the authoritative spent flag rather than infer.
    const committed = next.player.dawnHand?.spent[die] === true;
    const failNotice = hangoutFailNoticeFrom(events);
    const opened = next.dareHand !== null;
    set({
      game: next,
      selectedDie: committed ? null : die,
      bloomDie: committed ? die : null,
      notice: failNotice,
      // The opening visit rolls nothing the player committed a die to a CHECK for
      // — clear lastCheck so no stale readout lingers over the new table.
      lastCheck: null,
      // A fresh hand clears the LAST hand's settled frame: the table is live again.
      dareReveal: null,
      dareBeats: opened ? dareBeatsFrom(events) : [],
      // T-132 · a fresh Dare clears any stale social readout: the two blocks sit in
      // the same pane and a hand of cards must not read alongside last turn's
      // introduction.
      socialOutcome: null,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, committed);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That wager could not be resolved.' });
  }
}

/**
 * T-136 · ONE MOVE in the open Liar's Dice hand — `bid`, `raise-face`,
 * `raise-quantity`, `raise-both`, `challenge` or `fold`. (`peek` has its own thunk
 * below: it is the only move that costs a DIE and the only one that rolls.)
 *
 * The `combat(stance)` shape, for the same reason: one engine call per player
 * move, and THE DEALER'S ANSWER ARRIVES INSIDE IT (§9.4 — there is no `toAct`
 * field, no dealer action to dispatch and nothing to await). Autosaves
 * immediately so a mid-hand reload restores the table, exactly as a mid-encounter
 * reload restores the fight.
 *
 * `resolveDare` NEVER throws: an illegal move is a typed
 * `HangoutEvent{failReason:'illegal-dare-move'}` that spends nothing and moves
 * nothing, routed through the same `hangoutFailNoticeFrom` every other Hangout
 * refusal uses. The `try/catch` is belt-and-braces against `applyPlayerAction`'s
 * outer gates (`ActionBlocked` for a career that has ended), not against the
 * resolver.
 *
 * NOTHING HERE DECIDES LEGALITY. The pane offers only `legalDareMoves`' kinds and
 * only `isLatticeMove` claims; this thunk sends what it is given and lets the
 * engine refuse.
 */
export function dareMove(move: DareMoveKind, quantity?: number, face?: number): void {
  if (!state.game.dareHand) {
    set({ notice: 'There is no hand on the table.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Dare',
      move,
      ...(quantity !== undefined ? { quantity } : {}),
      ...(face !== undefined ? { face } : {}),
    });
    // Required so a mid-hand reload restores the table (the engine already
    // persists `dareHand` and has the round-trip test for it).
    autosave(next, state.seed);
    const failNotice = hangoutFailNoticeFrom(events);
    // Built from `DareHandResolved` and never recomputed. Null while the hand
    // still stands, which is exactly when the pane keeps showing the live scene.
    const reveal = dareRevealFrom(events, next);
    set({
      game: next,
      notice: failNotice,
      // A bid, a raise, a call and a fold roll NOTHING (§8.4 — the Peek is the
      // hand's only check), so any check still on screen belongs to a previous
      // beat. Cleared for the same reason `visitDare` clears it.
      lastCheck: null,
      dareReveal: reveal ?? state.dareReveal,
      dareBeats: dareBeatsFrom(events),
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, false);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That move could not be resolved.' });
  }
}

/**
 * T-136 · THE PEEK (§8) — spend a SECOND dawn die, before the first bid, on a
 * GUILE check against the port's own DC, to see ONE of the dealer's four dice.
 *
 * The only move in the hand that costs a die and the only one that rolls, so it is
 * the only one that feeds the shared `lastCheck` readout — set from the engine's
 * `StatCheck` exactly as `combat()` does, never recomputed. A failed check still
 * burns the die and still closes the Peek window (`peekUsed`), which the pane
 * shows honestly by dropping the control.
 */
export function darePeek(): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then peek.' });
    return;
  }
  if (!state.game.dareHand) {
    set({ notice: 'There is no hand on the table.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Dare',
      move: 'peek',
      spendDie: die,
    });
    autosave(next, state.seed);
    const committed = next.player.dawnHand?.spent[die] === true;
    const failNotice = hangoutFailNoticeFrom(events);
    const playerCheck = events.find(
      (e): e is Extract<GameEvent, { type: 'StatCheck' }> =>
        e.type === 'StatCheck' && e.actor === 'Player',
    );
    set({
      game: next,
      selectedDie: committed ? null : die,
      bloomDie: committed ? die : null,
      notice: failNotice,
      lastCheck: playerCheck
        ? {
            stat: playerCheck.stat,
            result: playerCheck.result,
            context: playerCheck.actionContext,
          }
        : state.lastCheck,
      lastCheckKey: playerCheck ? state.lastCheckKey + 1 : state.lastCheckKey,
      dareBeats: dareBeatsFrom(events),
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, committed);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That peek could not be resolved.' });
  }
}

/** T-136 · Dismiss the settled frame and return the pane to its idle controls. */
export function clearDareReveal(): void {
  set({ dareReveal: null, dareBeats: [] });
}

/** T-136 · The scene has finished playing its queued beats. */
export function clearDareBeats(): void {
  if (state.dareBeats.length === 0) return;
  set({ dareBeats: [] });
}

/**
 * T-132 · Meet, befriend or insult a co-located captain at the Hangout
 * (PRD §7.1–§7.4; `docs/HANGOUT_REDESIGN.md` F-101-4). The three social venues the
 * T-1404 pane authored numbers for at fourteen ports and then never offered.
 *
 * A pure CLIENT of the T-1303 `VisitHangout` venues, exactly like `visitDare`: arm
 * a die, name an opponent, ONE engine call, and read the result off the typed
 * events. The venue is a DISPATCH PARAMETER, not a rule branch — the three beats
 * differ only in what the ENGINE does with them, so there is one function and not
 * three. `befriend` rolls a GUILE check against the PORT's authored DC and the
 * engine emits a `StatCheck`; it is captured into `socialOutcome.check` and
 * rendered by `CheckReadout`, so the honest-dice signature holds here exactly as it
 * does for the Dare. `meet` and `insult` never roll: their whole result is the
 * `DispositionChanged` delta the engine wrote, read off the event and NEVER
 * recomputed.
 *
 * NO 'rumor' DISPATCH, DELIBERATELY (the seventh venue). `VisitHangout{rumor}`
 * spends a die to emit exactly the `hangoutRumors(state)` output the pane already
 * renders for free every frame (`format.ts` `hangoutRumorLines`), so a paid
 * affordance would be strictly dominated by the free one already on screen. That is
 * why F-101-4 counts "three of six venues" over a SEVEN-member venue union.
 *
 * A typed fail (`no-opponent`, `venue-not-offered`, malformed die) spends NO die —
 * read the authoritative spent flag rather than infer — keeps the selection, and
 * surfaces a visible notice.
 */
export function visitSocial(venue: 'meet' | 'befriend' | 'insult', opponentId: string): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then approach the tables.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'VisitHangout',
      venue,
      opponentId,
      spendDie: die,
    });
    autosave(next, state.seed);
    const committed = next.player.dawnHand?.spent[die] === true;
    const failNotice = hangoutFailNoticeFrom(events);
    let socialOutcome: CockpitState['socialOutcome'] = null;
    if (committed && !failNotice) {
      const hangout = events.find(
        (e): e is Extract<GameEvent, { type: 'HangoutEvent' }> =>
          e.type === 'HangoutEvent' && e.venue === venue,
      );
      // `befriend` is the only social venue that rolls; the other two produce no
      // player StatCheck at all, and `check` stays null rather than being faked.
      const playerCheck = events.find(
        (e): e is Extract<GameEvent, { type: 'StatCheck' }> =>
          e.type === 'StatCheck' && e.actor === 'Player',
      );
      // The applied delta, read off the engine's own event. Absent when the charm
      // check failed (nothing was applied) — an honest zero, not a recomputation.
      const shift = events.find(
        (e): e is Extract<GameEvent, { type: 'DispositionChanged' }> =>
          e.type === 'DispositionChanged' && e.npcId === opponentId,
      );
      if (hangout) {
        const npc = next.npcs.find((n) => n.id === opponentId);
        socialOutcome = {
          venue,
          npcId: opponentId,
          npcName: npc?.name ?? opponentId,
          check: playerCheck ? { stat: playerCheck.stat, result: playerCheck.result } : null,
          dispositionDelta: shift?.delta ?? 0,
          disposition: shift?.disposition ?? npc?.disposition ?? 0,
        };
      }
    }
    set({
      game: next,
      selectedDie: committed ? null : die,
      bloomDie: committed ? die : null,
      notice: failNotice,
      // The befriend check rides `socialOutcome.check`, its own readout, not the
      // shared single-check one — clear lastCheck so no stale check lingers.
      lastCheck: null,
      dareReveal: null,
      dareBeats: [],
      socialOutcome,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, committed);
  } catch (err) {
    set({
      notice: err instanceof Error ? err.message : 'That was not something the room allowed.',
    });
  }
}

/**
 * T-1404 · Borrow from Penny Wise's desk (PRD §7.5). A pure CLIENT of the T-1304
 * `VisitHangout{borrow}` venue. The engine clamps the requested principal into the
 * content band, advances it to credits and records the loan (interest accrues later
 * at dusk — never here). A lending precondition refusal (`already-has-loan`) spends
 * NO die and surfaces as a visible notice; on commit the die blooms.
 */
export function borrowLoan(amount: number): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then borrow.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'VisitHangout',
      venue: 'borrow',
      amount,
      spendDie: die,
    });
    autosave(next, state.seed);
    const notice = loanFailNoticeFrom(events);
    const committed = next.player.dawnHand?.spent[die] === true;
    set({
      game: next,
      selectedDie: committed ? null : die,
      bloomDie: committed ? die : null,
      notice,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, committed);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That loan could not be resolved.' });
  }
}

/**
 * T-1404 · Repay the Penny Wise loan (PRD §7.5). A pure CLIENT of the T-1304
 * `VisitHangout{repay}` venue. The engine clamps the payment to
 * `min(requested, credits, outstanding)` and clears the whole loan when the balance
 * hits zero. A `no-loan` / `insufficient-credits` refusal spends NO die and surfaces
 * as a visible notice; on commit the die blooms.
 */
export function repayLoan(amount: number): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then repay.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'VisitHangout',
      venue: 'repay',
      amount,
      spendDie: die,
    });
    autosave(next, state.seed);
    const notice = loanFailNoticeFrom(events);
    const committed = next.player.dawnHand?.spent[die] === true;
    set({
      game: next,
      selectedDie: committed ? null : die,
      bloomDie: committed ? die : null,
      notice,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, committed);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That payment could not be resolved.' });
  }
}

/**
 * T-1405 · Hire a crew role at the Hangout/port (PRD §7 dice progression). A pure
 * CLIENT of the T-1306 `Crew` action: the ship pane arms a die and names a content
 * role, and this is the single engine call. Crew grant the dawn-hand progression
 * (extra die / re-roll charge / roll floor) at the NEXT dawn — `dawnDiceModifiers`
 * is read in `startDay`, so a mid-day hire does not re-roll the live hand. A typed
 * `CrewEvent{failed}` (no berth / unaffordable / already aboard) spends NO die (read
 * the authoritative spent flag), keeps the selection, and surfaces a visible notice.
 */
export function hireCrew(roleId: string): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then hire.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Crew',
      action: 'hire',
      roleId,
      spendDie: die,
    });
    autosave(next, state.seed);
    const notice = crewFailNoticeFrom(events);
    const committed = next.player.dawnHand?.spent[die] === true;
    set({
      game: next,
      selectedDie: committed ? null : die,
      bloomDie: committed ? die : null,
      notice,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, committed);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That hire could not be resolved.' });
  }
}

/**
 * T-1405 · Dismiss a crew role (PRD §7). A pure CLIENT of the T-1306 `Crew` action's
 * dismiss path — costs a die (like a hire), frees a cabin berth, no refund. A typed
 * `CrewEvent{failed:'not-hired'}` spends NO die and surfaces a visible notice.
 */
export function dismissCrew(roleId: string): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then dismiss.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Crew',
      action: 'dismiss',
      roleId,
      spendDie: die,
    });
    autosave(next, state.seed);
    const notice = crewFailNoticeFrom(events);
    const committed = next.player.dawnHand?.spent[die] === true;
    set({
      game: next,
      selectedDie: committed ? null : die,
      bloomDie: committed ? die : null,
      notice,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, committed);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That dismissal could not be resolved.' });
  }
}

/**
 * T-1405 · Re-roll one un-spent dawn die (PRD §7 "allow one re-roll"). A pure CLIENT
 * of the T-1306 `Reroll` action. UNLIKE every other verb this does NOT consume a
 * selected die — it consumes a `rerollsRemaining` charge and targets `dieIndex`
 * directly (the die stays in hand; only its face changes, floored by any crew
 * floor). So `selectedDie` / `bloomDie` are deliberately left untouched. A typed
 * `DiceRerolled{failReason}` (no charge / already spent) surfaces a visible notice.
 */
export function reroll(dieIndex: number): void {
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Reroll',
      dieIndex,
    });
    autosave(next, state.seed);
    const notice = rerollFailNoticeFrom(events);
    // A re-roll consumes a CHARGE, not a die — do not touch selectedDie / bloomDie.
    set({
      game: next,
      notice,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    // No die was committed (only a charge), so this is not a die-commit for the cue.
    reactToEvents(events, false);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That re-roll could not be resolved.' });
  }
}

/**
 * T-1405 · Buy a controlling stake in the local port authority (PRD §9). A pure
 * CLIENT of the T-1307 `Port` action: the trade pane arms a die and this is the
 * single engine call. `systemId` is always the current system — the engine requires
 * you buy the port you stand in. The stake accrues per-dusk launch-fee income
 * (surfaced in the ledger, accrued by day.ts endDay). A typed `PortEvent{failed}`
 * (not-at-port / not-purchasable / already-owned / unaffordable) spends NO die and
 * surfaces a visible notice; on commit the die blooms.
 */
export function buyPort(): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then buy the port.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Port',
      action: 'buy',
      systemId: state.game.player.currentSystemId,
      spendDie: die,
    });
    autosave(next, state.seed);
    const notice = portFailNoticeFrom(events);
    const committed = next.player.dawnHand?.spent[die] === true;
    set({
      game: next,
      selectedDie: committed ? null : die,
      bloomDie: committed ? die : null,
      notice,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, committed);
  } catch (err) {
    set({
      notice: err instanceof Error ? err.message : 'That port purchase could not be resolved.',
    });
  }
}

/**
 * Commit a combat stance (T-307). The overlay is a pure client of `resolveCombat`
 * exactly as the starmap is of `resolveTravel`: it picks a die + stance and this
 * is the single engine call. Every outcome is surfaced — the honest PLAYER roll
 * (not the enemy's counter-attack), a fuel-gated weapons malfunction, and, when
 * the encounter resolves, the aftermath summary. State autosaves so a mid-
 * encounter reload restores the fight (loadSave already restores `encounter`).
 */
export function combat(stance: 'run' | 'talk' | 'fight'): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die, then choose a stance.' });
    return;
  }
  const encounter = state.game.encounter;
  if (!encounter) {
    set({ notice: 'No active encounter.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Combat',
      stance,
      targetId: encounter.interceptor.id,
      spendDie: die,
    });
    // Required so mid-encounter progression (round, enemy hull, fuel) survives a
    // reload — the reload-survival acceptance criterion.
    autosave(next, state.seed);

    // Surface the PLAYER's committed roll — the check made with the die the player
    // actually spent on this stance — NOT the enemy counter-attack and NOT a
    // derived secondary roll. The interceptor's checks carry actor ===
    // interceptor.name and are filtered out here. Within a single combat action the
    // player's committed stance roll (GUNS on a fight, PILOT on a run, TRADE on a
    // talk) is ALWAYS emitted FIRST; the only case with a SECOND Player StatCheck is
    // T-1207's post-kill retreat "pin" — a fresh opposed PILOT d20 the player did
    // NOT commit a die to, pushed AFTER the killing GUNS roll. So we take the FIRST
    // Player StatCheck: `.at(-1)` would pick the pin and make CheckBreakdown lie on
    // every killing blow (showing the PILOT pin instead of the GUNS roll the player
    // spent) — an honest-dice violation at the most dramatic moment.
    const playerCheck = events.find(
      (e): e is Extract<GameEvent, { type: 'StatCheck' }> =>
        e.type === 'StatCheck' && e.actor === 'Player',
    );
    const lastCheck = playerCheck
      ? { stat: playerCheck.stat, result: playerCheck.result, context: playerCheck.actionContext }
      : null;

    // A fuel-gated fight/run: the die was still burned and the enemy still
    // pressed — reflect that honestly, do not claim "nothing happened".
    const malfunction = events.some((e) => e.type === 'CombatEvent' && e.insufficientFuel);

    // The encounter is nulled on the engine side the instant it resolves, so read
    // the resolution off THIS action's events, not off next.encounter.
    const aftermath = combatAftermathSummary(events);
    // T-1602b: the killing blow is NOT an `EncounterResolved` — combat.ts nulls
    // the encounter and returns straight after ShipLost — so `aftermath` is null
    // on a death and the estate reads off its own typed events instead.
    const succession = successionSummary(events);

    let notice: string | null = null;
    if (malfunction) {
      notice = 'Weapons offline — not enough fuel to fire. Die burned, the enemy pressed.';
    }

    set({
      game: next,
      selectedDie: null,
      bloomDie: die,
      notice,
      lastCheck,
      lastCheckKey: state.lastCheckKey + 1,
      combatMalfunction: malfunction,
      combatAftermath: aftermath,
      succession,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    // The stance die is always spent, so combat is always committed. Crit
    // flourishes (nat20 / nat1) and the dice rattle ride the event stream.
    reactToEvents(events, true);
  } catch (err) {
    set({
      notice: err instanceof Error ? err.message : 'That combat action could not be resolved.',
    });
  }
}

/** The partial shipyard action a pane submits — the store fills in `spendDie`. */
export interface ShipyardRequest {
  action: 'buy-component-tier' | 'repair' | 'buy-cargo-pods' | 'buy-special-equipment';
  component?: ShipComponentId;
  tier?: number;
  repairMode?: 'all' | 'single';
  quantity?: number;
  equipment?: SpecialEquipmentId;
}

/** Pull a ShipyardFail out of an action's events (the engine's typed refusal). */
function shipyardFailFrom(events: GameEvent[]): ShipyardFail | null {
  for (const e of events) {
    if (e.type === 'ShipyardFail') return e;
  }
  return null;
}

/**
 * Commit a shipyard purchase / repair (T-308). The pane previews every action
 * through the engine's pure `quoteShipyard` and only enables a button when the
 * quote is `ok`, so a die is never wasted on a predictable refusal — important
 * because the engine (by the established ShipyardFail convention) spends the die
 * BEFORE the business checks. If a refusal does slip through (e.g. a race with
 * state change) it is surfaced as a visible notice via the typed reason, never a
 * silent no-op. On success the spent die blooms and the selection clears; the
 * shipyard emits no StatCheck, so `lastCheck` stays null.
 */
export function shipyard(request: ShipyardRequest): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then buy.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Shipyard',
      action: request.action,
      component: request.component,
      tier: request.tier,
      repairMode: request.repairMode,
      quantity: request.quantity,
      equipment: request.equipment,
      spendDie: die,
    });
    autosave(next, state.seed);
    const fail = shipyardFailFrom(events);
    const notice = fail ? shipyardFailureExplanation(fail) : null;
    set({
      game: next,
      // The die is spent either way (engine convention). Bloom it and clear the
      // selection; on a refusal the notice explains what happened.
      selectedDie: null,
      bloomDie: die,
      notice,
      lastCheck: null,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    // The shipyard spends the die before its business checks (engine convention),
    // so this is always committed; a refusal emits ShipyardFail → the fail cue.
    reactToEvents(events, true);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That yard order could not be resolved.' });
  }
}

/**
 * Resolve a storylet choice (T-309). The in-cockpit storylet panel is a pure
 * CLIENT of the storylet rules exactly as the manifest is of trade: it picks the
 * offer + choice (and, when the choice requires it, a die) and this is the single
 * engine call. `needsDie` is passed by the panel from the choice's authored
 * requirements — a die is spent (and demanded) ONLY for a choice with `spendDie`
 * or a `statCheck`; a no-requirement choice must never consume one. A storylet
 * stat check rides the shared honest-check readout (CheckBreakdown, context
 * 'storylet'); an engine refusal surfaces as a visible notice, never a silent
 * no-op. On success the engine removes the resolved storylet from
 * `game.storylets.available`, so the panel advances or unmounts on its own.
 */
export function resolveStorylet(storyletId: string, choiceId: string, needsDie: boolean): void {
  const die = state.selectedDie;
  if (needsDie && die === null) {
    set({ notice: 'Pick a die from the hand first, then choose.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Storylet',
      storyletId,
      choiceId,
      spendDie: needsDie ? (die ?? undefined) : undefined,
    });
    autosave(next, state.seed);
    const lastCheck = lastCheckFrom(events);
    const notice = storyletBlockNoticeFrom(events);
    set({
      game: next,
      // On a block the engine spent no die (it refuses before the die burn),
      // so keep the selection and don't bloom. On a resolution the die (if any)
      // is spent — clear the selection and bloom only a die that was consumed.
      selectedDie: notice ? die : null,
      bloomDie: notice ? null : needsDie ? die : null,
      notice,
      lastCheck,
      lastCheckKey: state.lastCheckKey + 1,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    reactToEvents(events, needsDie && !notice);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That choice could not be resolved.' });
  }
}

/** Dismiss the aftermath panel once the player has read it. Clears the patrol
 *  scan readout too — it rode the same overlay the aftermath closes. */
export function dismissAftermath(): void {
  set({ combatAftermath: null, combatMalfunction: false, patrolScan: null });
}

/** T-1602b · Dismiss the succession notice once the player has read the estate.
 *  Mirrors `dismissAftermath`: purely client-side, and the cockpit behind it is
 *  already fully playable (the successor holds the day's spent hand and can end
 *  the day). RNG-free, so it costs a pinned seed nothing. */
export function dismissSuccession(): void {
  set({ succession: null });
}

/** No-dice escape hatch: when the hand is empty mid-encounter the three stances
 *  are unusable, so the overlay offers a stand-down that ends the day. Dusk
 *  applies the free enemy attack (and a possible bond rescue), then a fresh dawn
 *  hand is dealt — preventing a soft-lock. This is just `endDay`. */
export function standDown(): void {
  endDay();
}

/** Close out the day — dusk moves the galaxy — and roll into the next dawn. */
export function endDay(): void {
  try {
    const dusk = engineEndDay(state.game);
    const dawn = startDay(dusk.state);
    autosave(dawn.state, state.seed);
    // Surface whatever dusk produced. `combatAftermathSummary` covers a dusk
    // free-attack that RESOLVED the encounter (T-1602b corrects the old comment
    // here: a ShipLost never reaches it — the kill path emits no
    // `EncounterResolved`). The two death paths dusk can take — the free
    // attack's killing blow (`applyEncounterDuskPressure`) and the life-support
    // survival failure (`day.ts`) — both land in `successionSummary` instead.
    const aftermath = combatAftermathSummary(dusk.events);
    const succession = successionSummary(dusk.events);
    set({
      game: dawn.state,
      selectedDie: null,
      bloomDie: null,
      notice: null,
      bootKey: state.bootKey + 1,
      lastCheck: null,
      combatAftermath: aftermath,
      succession,
      combatMalfunction: false,
      explorationOutcome: null,
      dareReveal: null,
      dareBeats: [],
      socialOutcome: null,
      patrolScan: null,
      onboardingSeen: reconcileOnboarding(state.game, dawn.state),
    });
    // Dusk cues (wire crackle / combat resolution) off the dusk events, then the
    // new dawn sting; keep the drive-hum bed running across the day boundary.
    reactToEvents(dusk.events, false);
    sound.play('dawn');
    sound.setDriveHum(true);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'The day could not be ended.' });
  }
}

export function toggleFx(): void {
  const fx = !state.fx;
  try {
    storage.setItem(FX_KEY, fx ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  set({ fx });
}

// ---- T-312 save slots & settings actions --------------------------------

/**
 * Write the live career into an explicit save slot (overwriting it). The slot
 * envelope goes through the engine's `createSave` — the SAME function the T-112b
 * property test proves round-trips exactly — so a later `loadSlot` restores a
 * GameState deep-equal to what was saved. A lightweight display meta blob is
 * stored alongside for the slot list (UI may use `Date.now()`; the purity rule
 * governs the engine, not this client).
 */
export function saveToSlot(n: number): void {
  try {
    storage.setItem(SLOT_KEY(n), createSave(state.game, state.seed));
    const meta: Omit<SlotSummary, 'index' | 'empty'> = {
      savedAt: Date.now(),
      seed: state.seed,
      day: state.game.day,
      credits: state.game.player.credits,
      systemId: state.game.player.currentSystemId,
    };
    storage.setItem(SLOT_META_KEY(n), JSON.stringify(meta));
    set({ saves: readSlots(), notice: `Saved to slot ${n}.` });
  } catch {
    set({ notice: 'Could not write to that slot (storage unavailable).' });
  }
}

/**
 * Load a save slot into the live career. The loaded GameState becomes the new
 * autosave (so a subsequent reload boots into it), and its seed is recovered from
 * the save envelope (T-1002), falling back to the slot meta for a pre-v2 slot.
 * A corrupt slot surfaces as a notice — never a crash. Because
 * `createSave`/`loadSave` round-trip exactly (T-112b), the restored state is
 * deep-equal to what was saved, so "load restores exactly" holds by construction.
 */
export function loadSlot(n: number): void {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SLOT_KEY(n));
  } catch {
    /* fall through to the empty-slot notice */
  }
  if (!raw) {
    set({ notice: 'That slot is empty.' });
    return;
  }
  let game: GameState;
  let loadedSeed: number | null;
  try {
    const loaded = loadSave(raw);
    // T-1703 · Same promotion the boot path runs, for the same reason: the BUILD
    // decides the edition, not the slot. A demo slot loaded by the full game is
    // upgraded; a full slot loaded by the demo build is refused, and the slot is
    // left exactly as it was.
    const promoted = promoteEdition(loaded.state, BUILD_EDITION);
    if ('refused' in promoted) {
      set({ notice: careerTransferMessage('edition-refused') });
      return;
    }
    game = promoted.state;
    loadedSeed = loaded.seed;
  } catch {
    set({ notice: `Slot ${n} is corrupt and could not be loaded.` });
    return;
  }
  // The seed rides the envelope for v2+ slots; for a pre-v2 slot the envelope
  // has none (loadSave returns null) so recover it from the slot's display meta.
  const seed = loadedSeed === null ? (readSlotMeta(n)?.seed ?? state.seed) : loadedSeed;
  // The loaded career becomes the live autosave.
  autosave(game, seed);
  try {
    storage.setItem(AUTOSAVE_SEED_KEY, String(seed));
  } catch {
    /* non-fatal */
  }
  set({
    game,
    seed,
    selectedDie: null,
    bloomDie: null,
    notice: `Loaded slot ${n}.`,
    bootKey: state.bootKey + 1,
    lastCheck: null,
    combatAftermath: null,
    succession: null,
    combatMalfunction: false,
    dareReveal: null,
    dareBeats: [],
    socialOutcome: null,
    patrolScan: null,
    // T-1605a: a slot load replaces the fallback career the boot notice was
    // explaining, so the notice is stale. (This path's OWN corrupt case has told
    // the player since T-312 — see the `Slot N is corrupt` notice above.)
    recovery: null,
    // Do NOT reset onboardingSeen — loading a mid-career save shouldn't re-teach.
  });
  // T-1702a · A slot can hold a career earned long before this build (or on the
  // web build), so its Registry is reconciled the same way the autosave's is.
  mirrorEarned(game);
}

// ---- T-1703 career transfer (the demo→full carry) ------------------------
//
// "demo-save carries into full game" is the task's own phrasing, and this is the
// pair of actions that makes it a thing a PLAYER can do rather than a property of
// a data format. Export writes the SAME `createSave(state, seed)` envelope every
// other persistence path writes — the one T-112b's property test proves round-
// trips exactly — so nothing new is serialized and no new format exists.
//
// A FILE, not the clipboard and not a cloud handoff: the demo and the full game
// are two different installs (different app id, different save directory), so the
// carry has to cross a filesystem, and a file is the one thing both builds can
// read on web AND desktop with no new IPC.

/** The download filename. Seed + day so a player with three exports can tell them
 *  apart, and so a bug report names the run it reproduces. */
function careerFileName(game: GameState, seed: number): string {
  return `rimward-career-seed${seed}-day${game.day}.sav`;
}

/**
 * Write the live career out as a `.sav` file the player keeps.
 *
 * Browser APIs (Blob / object URL / a synthetic anchor click) live HERE rather
 * than in `storage.ts`, deliberately: `storage.ts` is the key-value seam and this
 * is not a key-value operation — it is a one-shot download, and it works
 * identically on the web build and inside the Electron shell (which is a Chromium
 * renderer with a real download manager).
 *
 * Never throws into the caller: a failed export is a notice, not a lost turn.
 */
export function exportCareer(): void {
  try {
    const blob = new Blob([createSave(state.game, state.seed)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = careerFileName(state.game, state.seed);
    anchor.click();
    // Revoke on the next tick: revoking synchronously can race the download in
    // some Chromium versions, and an object URL that outlives the tab costs
    // nothing anyway.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    set({ notice: careerTransferMessage('exported') });
  } catch {
    set({ notice: 'That career could not be exported.' });
  }
}

/**
 * Adopt a career from a `.sav` file the player picked.
 *
 * THE FULL SIDE OF THE CARRY. Everything the boot path does, in the same order
 * and through the same engine functions — `loadSave` → `promoteEdition` → adopt
 * → autosave — so an imported career is indistinguishable from a career that had
 * been sitting in this install all along. In particular a DEMO save imported by
 * the FULL build is promoted here: the locks lift, the Registry rank re-derives,
 * and the day ceiling stops applying, so the career simply continues past day 33.
 *
 * The demo build importing a FULL save is refused with a notice and nothing is
 * adopted — the gate's closed hole, asserted in `e2e/demo-gate.spec.ts`.
 *
 * `async` because `File.text()` is; every failure is caught and reported.
 */
export async function importCareer(file: File): Promise<void> {
  let raw: string;
  try {
    raw = await file.text();
  } catch {
    set({ notice: careerTransferMessage('unreadable') });
    return;
  }
  let game: GameState;
  let seed: number;
  let promotedEdition: boolean;
  try {
    const loaded = loadSave(raw);
    const promoted = promoteEdition(loaded.state, BUILD_EDITION);
    if ('refused' in promoted) {
      set({ notice: careerTransferMessage('edition-refused') });
      return;
    }
    game = promoted.state;
    promotedEdition = promoted.events.length > 0;
    // A pre-v2 envelope carries no seed; fall back to the live one rather than
    // inventing a number, exactly as `loadSlot` does.
    seed = loaded.seed ?? state.seed;
  } catch {
    set({ notice: careerTransferMessage('unreadable') });
    return;
  }
  // The imported career becomes the live autosave — the same adoption `loadSlot`
  // performs, so a reload boots into it.
  autosave(game, seed);
  try {
    storage.setItem(AUTOSAVE_SEED_KEY, String(seed));
  } catch {
    /* non-fatal */
  }
  set({
    game,
    seed,
    selectedDie: null,
    bloomDie: null,
    notice: careerTransferMessage(promotedEdition ? 'promoted' : 'imported'),
    bootKey: state.bootKey + 1,
    lastCheck: null,
    combatAftermath: null,
    succession: null,
    combatMalfunction: false,
    explorationOutcome: null,
    dareReveal: null,
    dareBeats: [],
    socialOutcome: null,
    patrolScan: null,
    // The boot recovery notice (if any) described the career this one replaces.
    recovery: null,
    // Do NOT reset onboardingSeen — importing a mid-career save shouldn't re-teach.
  });
  // The imported Registry may have been earned on another install entirely.
  mirrorEarned(game);
}

/** Delete a save slot (both the envelope and its display meta). The "asks first"
 *  confirm is UI-local component state — the store just performs the deletion. */
export function deleteSlot(n: number): void {
  try {
    storage.removeItem(SLOT_KEY(n));
    storage.removeItem(SLOT_META_KEY(n));
  } catch {
    /* non-fatal */
  }
  set({ saves: readSlots(), notice: `Slot ${n} deleted.` });
}

/** User reduced-motion override (persisted). Layered over the OS media query. */
export function setReducedMotion(v: boolean): void {
  try {
    storage.setItem(REDUCED_MOTION_KEY, v ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  set({ reducedMotion: v });
}

/** User text-size preference (persisted). */
export function setTextSize(size: TextSize): void {
  try {
    storage.setItem(TEXT_SIZE_KEY, size);
  } catch {
    /* ignore */
  }
  set({ textSize: size });
}

export function clearBloom(): void {
  if (state.bloomDie !== null) set({ bloomDie: null });
}

/**
 * Manually dismiss a first-time coach prompt (the "Got it" affordance). The
 * prompt is marked seen and persisted so it never re-fires — the same seen-set
 * the auto-dismiss reconcile writes. A no-op if already seen.
 */
export function dismissOnboarding(id: string): void {
  if (state.onboardingSeen[id]) return;
  const seen: Record<string, true> = { ...state.onboardingSeen, [id]: true };
  writeOnboarding(seen);
  set({ onboardingSeen: seen });
}

export function dayIsOver(): boolean {
  const hand = state.game.player.dawnHand;
  return hand ? isDayOver(hand) : false;
}
