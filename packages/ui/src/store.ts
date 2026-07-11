import {
  createInitialState,
  startDay,
  endDay as engineEndDay,
  applyPlayerAction,
  createSave,
  loadSave,
  isDayOver,
  type GameState,
} from '@spacerquest/engine';

/**
 * The cockpit store. A tiny module-level store (no framework dependency) exposed
 * to React through `useSyncExternalStore`. It owns the single source of truth —
 * a `GameState` — and is the ONLY place that calls the engine. The UI is a
 * client of the rules, never their owner (TECH-STACK standing constraint).
 */

const SAVE_KEY = 'sq.save.v1';
const FX_KEY = 'sq.fx';
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
}

let state: CockpitState = init();
const listeners = new Set<() => void>();

function init(): CockpitState {
  const fx = readFx();
  const loaded = readSave();
  const game = loaded ?? startDay(createInitialState(DEFAULT_SEED)).state;
  return { game, selectedDie: null, bloomDie: null, fx, notice: null, bootKey: 1 };
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

// ---- actions ------------------------------------------------------------

export function newGame(seed: number): void {
  const game = startDay(createInitialState(seed)).state;
  autosave(game);
  set({ game, selectedDie: null, bloomDie: null, notice: null, bootKey: state.bootKey + 1 });
}

export function selectDie(index: number): void {
  const hand = state.game.player.dawnHand;
  if (!hand || hand.spent[index]) return;
  set({ selectedDie: state.selectedDie === index ? null : index, notice: null });
}

export function signContract(contractIndex: number): void {
  const die = state.selectedDie;
  if (die === null) {
    set({ notice: 'Pick a die from the hand first, then sign.' });
    return;
  }
  try {
    const { state: next } = applyPlayerAction(state.game, {
      type: 'Trade',
      action: 'sign-contract',
      contractIndex,
      spendDie: die,
    });
    autosave(next);
    set({ game: next, selectedDie: null, bloomDie: die, notice: null });
  } catch (err) {
    set({ notice: err instanceof Error ? err.message : 'That action could not be resolved.' });
  }
}

/** Close out the day — dusk moves the galaxy — and roll into the next dawn. */
export function endDay(): void {
  try {
    const dusk = engineEndDay(state.game);
    const dawn = startDay(dusk.state);
    autosave(dawn.state);
    set({
      game: dawn.state,
      selectedDie: null,
      bloomDie: null,
      notice: null,
      bootKey: state.bootKey + 1,
    });
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

export function dayIsOver(): boolean {
  const hand = state.game.player.dawnHand;
  return hand ? isDayOver(hand) : false;
}
