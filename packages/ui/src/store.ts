import {
  createInitialState,
  startDay,
  endDay as engineEndDay,
  applyPlayerAction,
  createSave,
  loadSave,
  isDayOver,
  type GameState,
  type GameEvent,
  type CheckResult,
} from '@spacerquest/engine';
import type { Stat } from '@spacerquest/content';
import type { ShipComponentId, SpecialEquipmentId, ShipyardFail } from '@spacerquest/engine';
import {
  combatAftermathSummary,
  nextOnboardingSeen,
  shipyardFailureExplanation,
  type CombatAftermath,
} from './format';
import * as sound from './sound';

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
  /** The last combat round was fuel-gated (weapons malfunction) — surfaced as a
   *  loud notice AND cleared like any transient combat readout. */
  combatMalfunction: boolean;
  /**
   * T-311 onboarding. Which first-time coach prompts the player has already
   * dismissed or progressed past. This is CLIENT presentation meta-state (like
   * `fx`), deliberately kept out of GameState so the engine stays pure and a
   * JSON round-trip of game state is unaffected. Persisted under
   * `sq.onboarding.v1`; reset on New Game so a fresh Tour One re-teaches.
   */
  onboardingSeen: Record<string, true>;
}

let state: CockpitState = init();
const listeners = new Set<() => void>();

function init(): CockpitState {
  const fx = readFx();
  const loaded = readSave();
  const game = loaded ?? startDay(createInitialState(DEFAULT_SEED)).state;
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
    combatMalfunction: false,
    onboardingSeen: readOnboarding(),
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

function emit(): void {
  for (const l of listeners) l();
}
function set(patch: Partial<CockpitState>): void {
  state = { ...state, ...patch };
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

function readSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return loadSave(raw);
  } catch {
    return null; // corrupt / missing → fall back to a fresh career
  }
}
function autosave(game: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, createSave(game));
  } catch {
    /* storage unavailable — non-fatal for play */
  }
}
function readFx(): boolean {
  try {
    return localStorage.getItem(FX_KEY) !== 'off';
  } catch {
    return true;
  }
}

// ---- T-311 onboarding-seen persistence ----------------------------------

function readOnboarding(): Record<string, true> {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, true>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
function writeOnboarding(seen: Record<string, true>): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(seen));
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
  autosave(game);
  // A fresh career re-teaches Tour One: wipe the onboarding-seen record so the
  // contextual prompts fire again from the top.
  writeOnboarding({});
  set({
    game,
    selectedDie: null,
    bloomDie: null,
    notice: null,
    bootKey: state.bootKey + 1,
    lastCheck: null,
    combatAftermath: null,
    combatMalfunction: false,
    onboardingSeen: {},
  });
  // A fresh career: the dawn sting and the ambient drive-hum bed. The hum defers
  // itself internally until the first user gesture unlocks the AudioContext, so
  // this never triggers an autoplay-policy error.
  sound.play('dawn');
  sound.setDriveHum(true);
}

export function selectDie(index: number): void {
  const hand = state.game.player.dawnHand;
  if (!hand || hand.spent[index]) return;
  // A fresh selection resets the resolved-check readout.
  set({ selectedDie: state.selectedDie === index ? null : index, notice: null, lastCheck: null });
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
    autosave(next);
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
    autosave(next);
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
    autosave(next);
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
    autosave(next);
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
    autosave(next);
    // The travel PILOT check reuses the honest-check readout (CheckBreakdown).
    const lastCheck = lastCheckFrom(events);
    const travel = events.find(
      (e): e is Extract<GameEvent, { type: 'TravelEvent' }> => e.type === 'TravelEvent',
    );
    let notice: string | null = null;
    if (next.encounter) {
      // T-307 will build the combat overlay; until then the honest surface is a
      // notice that the jump was intercepted en route.
      notice = 'Intercepted en route — combat station.';
    } else if (travel && travel.success === false) {
      notice =
        travel.fuelUsed === 0
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
    autosave(next);

    // Surface the PLAYER's honest roll, NOT the enemy counter-attack. Two
    // StatCheck events can appear in a round: the player's (actor 'Player') and
    // the interceptor's pressure (actor === interceptor.name). We must select the
    // player's, so CheckBreakdown shows the roll the player actually committed.
    const playerCheck = events
      .filter(
        (e): e is Extract<GameEvent, { type: 'StatCheck' }> =>
          e.type === 'StatCheck' && e.actor === 'Player',
      )
      .at(-1);
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
    autosave(next);
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
    autosave(next);
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

/** Dismiss the aftermath panel once the player has read it. */
export function dismissAftermath(): void {
  set({ combatAftermath: null, combatMalfunction: false });
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
    autosave(dawn.state);
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
    localStorage.setItem(FX_KEY, fx ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  set({ fx });
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
