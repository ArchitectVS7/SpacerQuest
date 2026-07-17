import {
  createInitialState,
  startDay,
  endDay as engineEndDay,
  applyPlayerAction,
  createSave,
  loadSave,
  isDayOver,
  SaveError,
  type GameState,
  type GameEvent,
  type CheckResult,
  type SaveErrorCode,
} from '@spacerquest/engine';
import type { Stat } from '@spacerquest/content';
import type { ShipComponentId, SpecialEquipmentId, ShipyardFail } from '@spacerquest/engine';
import {
  combatAftermathSummary,
  explorationOutcome,
  nextOnboardingSeen,
  shipyardFailureExplanation,
  type CombatAftermath,
} from './format';
import * as sound from './sound';
// T-1703 · The demo gate is a build-layer concern the store consumes as a thin CLIENT
// (the engine stays unaware of demo-vs-full — see demo.ts). `endDay` reads the wall
// predicate to refuse advancing past the demo budget; the gated verbs early-return as
// defense-in-depth. No-op in the full build (`DEMO_BUILD === false`).
import { demoWallReached, demoFeatureLocked } from './demo';
// T-1701 · All persistence flows through the storage adapter: a localStorage
// passthrough on the web (unchanged behaviour) and an OS app-data file store inside
// the Electron shell. The swap below is mechanical and behavior-preserving — the
// surrounding try/catch guards stay because the web path still touches localStorage.
import * as storage from './storage';

/**
 * Play the audio cues an action's event stream implies (T-310). The store is the
 * single choke point that already scans engine events, so the sound layer hooks
 * here as a pure client — the engine emits nothing new. `committed` is true when
 * the action actually spent a die (a firm "commit" thunk); the outcome cues
 * (jump / dice / wire / fail / crit flourishes) come straight from `cuesForEvents`.
 */
function playCues(events: GameEvent[], committed: boolean): void {
  if (committed) sound.play('commit');
  for (const cue of sound.cuesForEvents(events)) sound.play(cue);
  // T-1702 · Forward this action's event stream to the desktop Steam bridge at the
  // SAME single per-action choke point sound uses. Steam achievements fire straight
  // off the existing `DeedEarned` / `RenownRankUp` events — the renderer computes
  // nothing Steam-specific and the engine emits nothing new. `?.` no-ops on the web
  // build (no bridge), so the browser build is byte-for-byte unchanged.
  storage.nativeSteam?.sendEvents(events);
}

/**
 * T-1702 · Push the current system + day to Steam rich presence, de-duped so an
 * unchanged snapshot never re-forwards. Called at boot and after every state change
 * (a single central site — see `set` below), so presence is correct at rest and after
 * travel / dusk transitions. A no-op on the web build (no bridge). The main process
 * throttles further; this guard just avoids needless IPC on every keypress.
 */
let lastPresenceKey: string | null = null;
function pushPresence(game: GameState): void {
  const key = `${game.player.currentSystemId}:${game.day}`;
  if (key === lastPresenceKey) return;
  lastPresenceKey = key;
  storage.nativeSteam?.setPresence(game.player.currentSystemId, game.day);
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
  /**
   * T-1605 · A persistent, dismissible boot-time banner set when the autosave was
   * present but could NOT be loaded (corrupt / bad-envelope / future-version) and
   * the app therefore fell back to a fresh career. Before T-1605 that fallback was
   * SILENT (`readSave` swallowed the SaveError at `store.ts` and `init` booted a
   * new game with no word to the player — the exact "silently resetting" defect the
   * task names). This is CLIENT presentation meta-state (like `fx` / `onboardingSeen`),
   * deliberately NOT part of GameState: it is a one-shot boot signal, so the engine
   * stays pure and a JSON round-trip of game state is unaffected — no save migration.
   * UNLIKE the transient `notice` (cleared by the first action, `role="status"`) this
   * survives until the player dismisses it, so the news of a lost career is never
   * wiped by an incidental keypress. READER: the `boot-notice` banner in App.tsx.
   * Null on a clean boot (empty save or a save that loaded fine).
   */
  bootNotice: string | null;
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
   * T-1404 Spacer's Dare. The two opposed honest checks (the player's GUILE gamble
   * and the dealer's counter) plus the wager / winner / signed credits delta of the
   * LAST Dare — built straight from the engine's two `StatCheck` events and the
   * `HangoutEvent{dare}`, never recomputed. Like `explorationOutcome`/`combatAftermath`
   * this is CLIENT presentation meta-state (NOT GameState), so a JSON round-trip of
   * game state is unaffected and no save migration is needed. READER: the Hangout
   * pane's `dare-check-player` / `dare-check-opponent` readouts and `dare-result`
   * line. Null until a Dare resolves; cleared on selection / travel / new day.
   */
  dareOutcome: {
    player: { stat: Stat; result: CheckResult };
    opponent: { npcId: string; npcName: string; stat: Stat; result: CheckResult };
    wager: number;
    playerWon: boolean;
    creditsDelta: number;
  } | null;
  /**
   * T-1405 patrol contraband scan. The honest GUILE check the patrol rolled
   * against a smuggler's hold during the LAST jump, plus its consequence (caught +
   * fine + which cargo was seized) — built straight from the Travel action's typed
   * `ContrabandScan` / `ContrabandConfiscated` events, never recomputed. Like
   * `combatAftermath` / `dareOutcome` this is CLIENT presentation meta-state (NOT
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
   * T-1703 · Raised (demo build only) when the player ends the final playable demo day
   * (`DEMO_FINAL_DAY`), so `endDay` refuses to advance the engine past the demo budget
   * and the App raises the un-dismissable DemoWall ceremony instead. This is CLIENT
   * presentation meta-state (like `bootNotice` / `combatAftermath`), deliberately NOT
   * part of GameState: the engine never advances past day 33 in the demo, so the saved
   * career stays a clean, full-game-loadable day-33 `GameState` — no engine field, no
   * migration, no JSON round-trip impact. Always `false` in the full build (the wall
   * predicate no-ops when `DEMO_BUILD` is false). READER: the `demo-wall` ceremony in
   * App.tsx.
   */
  demoWall: boolean;
}

/**
 * T-1605 · Set by `readSave` when a PRESENT autosave failed to load (as opposed to
 * simply being absent) so `init` can raise a visible boot banner instead of resetting
 * in silence. A module-level hand-off (not a return value) because `readSave` already
 * returns `null` for BOTH the benign "no save" and the "unloadable save" cases and the
 * caller needs to tell them apart. Reset to null after `init` consumes it so a later
 * `readSave` (slot loads never call it, but be safe) cannot resurrect stale news.
 */
let bootLoadFailure: SaveErrorCode | 'unknown' | null = null;

/**
 * T-1605 · The honest player-facing line for each way a present save can fail to
 * load. Every branch tells the player two true things: their old career could not be
 * loaded, and a fresh one was started — so the reset is never a silent surprise. The
 * damaged blob is left on disk untouched by `init` (only an autosave-after-action or
 * an explicit New Game overwrites it), so this copy does not over-promise recovery.
 */
function bootNoticeForFailure(code: SaveErrorCode | 'unknown'): string {
  switch (code) {
    case 'future-version':
      return 'Your saved career was created by a newer version of the game and could not be loaded, so a new game was started. The old save was left untouched.';
    case 'corrupt-json':
    case 'bad-envelope':
    case 'invalid-state':
    case 'no-migration':
    case 'unknown':
    default:
      return 'Your saved career could not be loaded (the save file is damaged) and a new game was started. The damaged save was left untouched.';
  }
}

let state: CockpitState = init();
// T-1702 · Seed Steam rich presence once at boot so the friends-list line is correct
// at rest (before any action). No-op on the web build (no Steam bridge).
pushPresence(state.game);
const listeners = new Set<() => void>();

function init(): CockpitState {
  const fx = readFx();
  bootLoadFailure = null;
  const loaded = readSave();
  const game = loaded?.game ?? startDay(createInitialState(DEFAULT_SEED)).state;
  // The seed rides the loaded envelope (T-1002); with no save, the game booted
  // from DEFAULT_SEED, so the displayed seed matches it.
  const seed = loaded ? loaded.seed : DEFAULT_SEED;
  // T-1605 · If a PRESENT save failed to load, `readSave` recorded WHY — raise the
  // honest banner so the fresh-career fallback is visible, never silent.
  const bootNotice = bootLoadFailure ? bootNoticeForFailure(bootLoadFailure) : null;
  return {
    game,
    selectedDie: null,
    bloomDie: null,
    fx,
    notice: null,
    bootNotice,
    bootKey: 1,
    lastCheck: null,
    lastCheckKey: 0,
    combatAftermath: null,
    combatMalfunction: false,
    explorationOutcome: null,
    dareOutcome: null,
    patrolScan: null,
    onboardingSeen: readOnboarding(),
    seed,
    reducedMotion: readReducedMotion(),
    textSize: readTextSize(),
    saves: readSlots(),
    // T-1703 · No wall at boot; only ending the final demo day raises it.
    demoWall: false,
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
 * T-1403 · Translate the engine's typed `ExplorationFailed` refusal into an honest
 * visible notice — the "typed fails render as notices, never silence" guarantee.
 * Returns null when no sweep failure occurred (the detour discovered a POI). Every
 * `ExplorationFailed.reason` the resolver emits (exploration.ts) maps here. The
 * three UI-prevented reasons (no-die / invalid-die-index / die-already-spent) still
 * get a line so a race with state is never a silent no-op.
 */
function explorationFailNoticeFrom(events: GameEvent[]): string | null {
  for (const e of events) {
    if (e.type !== 'ExplorationFailed') continue;
    switch (e.reason) {
      case 'insufficient-fuel':
        return 'Not enough fuel to reach an off-lane target.';
      case 'nav-check':
        return 'The sweep turned up nothing but static.';
      case 'no-die':
      case 'invalid-die-index':
      case 'die-already-spent':
        return 'That sweep needs a fresh die from the hand.';
    }
  }
  return null;
}

/**
 * T-1404 · Translate the engine's typed `HangoutEvent` fail (a social/Dare venue)
 * into an honest visible notice — the same "typed fails render, never silence"
 * guarantee. Returns null when no Hangout fail occurred (a successful venue carries
 * no `failReason`). `no-opponent` fires when the named dealer has wandered off; the
 * three malformed-die reasons are UI-prevented but still get a line so a race with
 * state is never a silent no-op.
 */
function hangoutFailNoticeFrom(events: GameEvent[]): string | null {
  for (const e of events) {
    if (e.type !== 'HangoutEvent' || !e.failReason) continue;
    switch (e.failReason) {
      case 'no-opponent':
        return 'That spacer has left the tables — no one here to wager against.';
      case 'no-die':
      case 'invalid-die-index':
      case 'die-already-spent':
        return 'That table needs a fresh die from the hand.';
    }
  }
  return null;
}

/**
 * T-1404 · Translate a Penny Wise `LoanEvent{kind:'failed'}` refusal into an honest
 * visible notice. Returns null when the borrow/repay committed (a 'borrowed' /
 * 'repaid' event carries no `failReason`). Covers the lending preconditions
 * (already-has-loan / no-loan / insufficient-credits) that spend NO die, plus the
 * UI-prevented malformed-die reasons.
 */
function loanFailNoticeFrom(events: GameEvent[]): string | null {
  for (const e of events) {
    if (e.type !== 'LoanEvent' || e.kind !== 'failed') continue;
    switch (e.failReason) {
      case 'already-has-loan':
        return 'You already carry a loan with Penny Wise — clear it before borrowing again.';
      case 'no-loan':
        return 'No loan to repay.';
      case 'insufficient-credits':
        return 'Not enough credits to make that payment.';
      case 'no-die':
      case 'invalid-die-index':
      case 'die-already-spent':
        return "Penny Wise's desk needs a fresh die from the hand.";
      default:
        return 'Penny Wise turned that request down.';
    }
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
  // T-1702 · The single central site that keeps Steam rich presence current. Reads the
  // (possibly new) game state and forwards system/day — de-duped inside `pushPresence`
  // so only an actual system/day change hits the bridge. No-op on the web build.
  pushPresence(state.game);
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

function readSave(): { game: GameState; seed: number } | null {
  // Read the raw blob first. An ABSENT save (getItem → null) or an unreadable
  // localStorage is BENIGN — a first run — and must never raise the corrupt-save
  // banner. T-1605 splits this cleanly from the "save present but unloadable" case
  // below: only the latter records a `bootLoadFailure`.
  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return null; // storage unavailable — treat as a fresh career, no banner
  }
  if (!raw) return null; // no save present — benign, no banner
  try {
    const { state, seed } = loadSave(raw);
    // T-1002: a pre-v2 autosave has no seed in its envelope (loadSave returns
    // seed: null). Recover the seed the old build stashed in the legacy
    // `sq.save.seed` key so the bezel display and reproducibility survive the
    // upgrade; the next `autosave` re-writes the envelope as v2 with the seed
    // embedded, so this legacy read path self-heals after one write. A v2 save
    // with an explicit seed — including seed 0 — never hits this fallback.
    const recovered = seed === null ? readAutosaveSeed() : seed;
    return { game: state, seed: recovered };
  } catch (err) {
    // T-1605 · A PRESENT save that would not load. Record WHY (the typed
    // SaveError.code lets `init` pick honest copy — e.g. a future-version save vs a
    // corrupt one) so the fresh-career fallback surfaces a visible banner instead of
    // silently resetting. Do NOT overwrite/remove the blob here: the player is told,
    // and the damaged save is left on disk untouched until an action autosaves over it.
    bootLoadFailure = err instanceof SaveError ? err.code : 'unknown';
    return null;
  }
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
  } catch {
    /* storage unavailable — non-fatal for play */
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
  const game = startDay(createInitialState(seed)).state;
  // T-1002: the seed now rides the save envelope (autosave embeds it), so a
  // reload recovers it from the save itself — including an explicit seed of 0.
  // The legacy `sq.save.seed` write is kept as a redundant fallback: it lets
  // `readSave` recover the seed for a pre-v2 envelope (loaded as seed: null).
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
    // T-1605 · A fresh career clears any lingering corrupt-save boot banner — the
    // player has explicitly started anew, so the news of the lost save is moot.
    bootNotice: null,
    bootKey: state.bootKey + 1,
    lastCheck: null,
    combatAftermath: null,
    combatMalfunction: false,
    explorationOutcome: null,
    dareOutcome: null,
    patrolScan: null,
    onboardingSeen: {},
    // T-1703 · A fresh career clears any raised demo wall.
    demoWall: false,
  });
  // A fresh career: the dawn sting and the ambient drive-hum bed. The hum defers
  // itself internally until the first user gesture unlocks the AudioContext, so
  // this never triggers an autoplay-policy error.
  sound.play('dawn');
  sound.setDriveHum(true);
}

/**
 * T-1505 · Return to a fresh career from the Nemesis crossing ending. There is no
 * separate title screen — `newGame` fully resets to a playable day-1 cockpit — so
 * the ending's "Return to menu" reuses it with a fresh seed. A thin wrapper (not a
 * new reset path) so the crossing ending shares the exact clean-slate `newGame`
 * does; proven by the e2e ending spec (after click: the ceremony unmounts and
 * `day` reads 1). The fresh seed derives from the outgoing one so a new career is
 * a genuinely different world, not a replay of the crossed one.
 */
export function returnToMenu(): void {
  newGame(state.seed + 1);
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
    dareOutcome: null,
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
    playCues(events, !notice);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That action could not be resolved.' });
  }
}

/**
 * T-1604 · Abandon the active contract — the player's escape hatch out of a
 * carried-contract soft-lock (a run whose destination the ship can no longer
 * reach in a single jump, e.g. after hull damage shrank the tank). Dumping the
 * cargo costs a die and forfeits the payment; the engine emits a `forfeit-cargo`
 * TradeEvent and clears `activeContract`. Mirrors signContract's refusal handling
 * (a refusal — no contract to dump — spends no die and surfaces via `notice`).
 */
export function abandonContract(): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then abandon the contract.' });
    return;
  }
  try {
    const { state: next, events } = applyPlayerAction(state.game, {
      type: 'Trade',
      action: 'forfeit-cargo',
      spendDie: die,
    });
    autosave(next, state.seed);
    const notice = failNoticeFrom(events);
    set({
      game: next,
      selectedDie: notice ? die : null,
      bloomDie: notice ? null : die,
      notice,
      lastCheck: null,
      lastCheckKey: state.lastCheckKey + 1,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    playCues(events, !notice);
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
    playCues(events, !notice);
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
    playCues(events, false);
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
    playCues(events, !notice);
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
      dareOutcome: null,
      patrolScan,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    // The jump die is always spent (even a failed PILOT roll burns it), so this
    // is always a committed action. `cuesForEvents` adds jump / combatStart.
    playCues(events, true);
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
    // speaks through the notice instead.
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
    playCues(events, committed);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That sweep could not be resolved.' });
  }
}

/**
 * T-1404 · Wager a die on a Spacer's Dare against a co-located NPC (PRD §7). The
 * Hangout pane is a pure CLIENT of the T-1303 `VisitHangout{dare}` venue: it arms a
 * die and names an opponent, and this is the single engine call. The engine rolls
 * the opposed GUILE and emits TWO `StatCheck`s (the player's `gamble` roll framed
 * against the dealer's total, and the dealer's counter) plus a `HangoutEvent{dare}`
 * carrying the wager / winner / signed credits delta. Both honest checks + the delta
 * are captured into `dareOutcome` for the pane's two `CheckReadout`s — never
 * recomputed. A `no-opponent` / malformed-die fail spends NO die (read the
 * authoritative spent flag), keeps the selection, and surfaces a visible notice.
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
    let dareOutcome: CockpitState['dareOutcome'] = null;
    if (committed && !failNotice) {
      const playerCheck = events.find(
        (e): e is Extract<GameEvent, { type: 'StatCheck' }> =>
          e.type === 'StatCheck' && e.actor === 'Player',
      );
      const oppCheck = events.find(
        (e): e is Extract<GameEvent, { type: 'StatCheck' }> =>
          e.type === 'StatCheck' && e.actor === opponentId,
      );
      const hangout = events.find(
        (e): e is Extract<GameEvent, { type: 'HangoutEvent' }> =>
          e.type === 'HangoutEvent' && e.venue === 'dare',
      );
      if (playerCheck && oppCheck && hangout) {
        const npc = next.npcs.find((n) => n.id === opponentId);
        dareOutcome = {
          player: { stat: playerCheck.stat, result: playerCheck.result },
          opponent: {
            npcId: opponentId,
            npcName: npc?.name ?? opponentId,
            stat: oppCheck.stat,
            result: oppCheck.result,
          },
          wager: hangout.wager ?? 0,
          playerWon: hangout.playerWon ?? false,
          creditsDelta: hangout.creditsDelta ?? 0,
        };
      }
    }
    set({
      game: next,
      selectedDie: committed ? null : die,
      bloomDie: committed ? die : null,
      notice: failNotice,
      // The Dare's opposed checks ride their own dual readout (dareOutcome), not
      // the shared single-check readout — clear lastCheck so no stale check lingers.
      lastCheck: null,
      dareOutcome,
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    playCues(events, committed);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That wager could not be resolved.' });
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
  // T-1703 · Defense-in-depth demo gate (Penny Wise borrowing is Hangout progression).
  // The demo renders a teaser in place of the borrow button; refuse here too. Full no-op.
  if (demoFeatureLocked('hangout-progression')) {
    set({ notice: 'Borrowing unlocks in the full game.' });
    return;
  }
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
    playCues(events, committed);
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
    playCues(events, committed);
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
  // T-1703 · Defense-in-depth demo gate (crew is the Hangout dice progression). The
  // demo renders a teaser in place of the hire button; refuse here too. Full build no-op.
  if (demoFeatureLocked('hangout-progression')) {
    set({ notice: 'Crew hiring unlocks in the full game.' });
    return;
  }
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
    playCues(events, committed);
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
    playCues(events, committed);
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
    playCues(events, false);
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
  // T-1703 · Defense-in-depth: the demo build renders a teaser in place of the buy
  // button (App.tsx), so this is normally unreachable there — but if a stale binding
  // ever calls it, refuse with an honest notice rather than spend a die on a gated
  // veteran feature. No-op in the full build.
  if (demoFeatureLocked('ports')) {
    set({ notice: 'Port authority unlocks in the full game.' });
    return;
  }
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
    playCues(events, committed);
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
      onboardingSeen: reconcileOnboarding(state.game, next),
    });
    // The stance die is always spent, so combat is always committed. Crit
    // flourishes (nat20 / nat1) and the dice rattle ride the event stream.
    playCues(events, true);
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
    playCues(events, true);
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
    playCues(events, needsDie && !notice);
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That choice could not be resolved.' });
  }
}

/** Dismiss the aftermath panel once the player has read it. Clears the patrol
 *  scan readout too — it rode the same overlay the aftermath closes. */
export function dismissAftermath(): void {
  set({ combatAftermath: null, combatMalfunction: false, patrolScan: null });
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
  // T-1703 · Demo day-wall. Ask the pure predicate whether the PROSPECTIVE next day is
  // past the demo budget BEFORE touching the engine. If so, do NOT advance: raise the
  // DemoWall instead. The engine is never called, so the autosave stays a clean day-33
  // career that continues verbatim in the full build. No-op in the full build.
  if (demoWallReached(state.game.day + 1)) {
    set({ demoWall: true });
    return;
  }
  try {
    const dusk = engineEndDay(state.game);
    const dawn = startDay(dusk.state);
    autosave(dawn.state, state.seed);
    // If an encounter is still live at the new dawn (dusk pressure did not end
    // it), surface any resolution the dusk free-attack produced (e.g. a ShipLost
    // succession) as the aftermath; otherwise clear it.
    const aftermath = combatAftermathSummary(dusk.events);
    set({
      game: dawn.state,
      selectedDie: null,
      bloomDie: null,
      notice: null,
      bootKey: state.bootKey + 1,
      lastCheck: null,
      combatAftermath: aftermath,
      combatMalfunction: false,
      explorationOutcome: null,
      dareOutcome: null,
      patrolScan: null,
      onboardingSeen: reconcileOnboarding(state.game, dawn.state),
    });
    // Dusk cues (wire crackle / combat resolution) off the dusk events, then the
    // new dawn sting; keep the drive-hum bed running across the day boundary.
    playCues(dusk.events, false);
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
    game = loaded.state;
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
    combatMalfunction: false,
    dareOutcome: null,
    patrolScan: null,
    // T-1703 · Loading a save clears any raised demo wall.
    demoWall: false,
    // Do NOT reset onboardingSeen — loading a mid-career save shouldn't re-teach.
  });
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

/**
 * T-1605 · Dismiss the corrupt-save boot banner once the player has read it. A pure
 * client action — clears the presentation-only `bootNotice`, touching no GameState
 * and writing nothing to disk. READER: the `boot-notice` banner's close button.
 */
export function dismissBootNotice(): void {
  if (state.bootNotice !== null) set({ bootNotice: null });
}

export function dayIsOver(): boolean {
  const hand = state.game.player.dawnHand;
  return hand ? isDayOver(hand) : false;
}
