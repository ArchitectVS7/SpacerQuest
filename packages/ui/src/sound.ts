import type { GameEvent } from '@spacerquest/engine';
// T-1701 · Mixer settings persist through the shared storage adapter (localStorage
// on the web, OS app-data file store in the Electron shell) — same keys, same
// synchronous reads; the hasWindow() guards below are preserved.
import * as storage from './storage';

/**
 * ============================================================================
 *  T-310 · SOUND DESIGN — WebAudio manager (the documented audio map)
 * ============================================================================
 *
 * All sound in the cockpit is SYNTHESIZED LIVE via WebAudio (oscillators, noise
 * buffers, gain/filter envelopes). There are ZERO audio asset files: no samples,
 * no third-party recordings, no network fetches. Every cue below is original
 * procedural synthesis.
 *
 *   CREDITS: All cues are original procedural WebAudio synthesis by the Spacer
 *   Quest project (no third-party samples). Released CC0 with the project.
 *
 * This module is the SOLE owner of audio and a pure CLIENT of the rules: it is
 * driven by the `GameEvent` stream the store already receives (see
 * `cuesForEvents`) plus a few UI-gesture cues. It never imports or calls the
 * engine, and the engine emits nothing new for it. Under headless / SSR (no
 * `window`, no `AudioContext`) the whole module is inert.
 *
 * ---------------------------------------------------------------------------
 *  AUDIO MAP — cue → bus → trigger → synthesis
 * ---------------------------------------------------------------------------
 *  relay       sfx      any UI pointerdown        filtered-noise tick + square blip (relay click)
 *  key         sfx      keydown on the cockpit    shorter/higher relay variant
 *  commit      sfx      a die is spent            two-layer low thunk
 *  jump        sfx      TravelEvent success       rising sine sweep + noise whoosh (~0.5s)
 *  dice        sfx      combat round resolves     short filtered-noise rattle
 *  nat20       sfx      player natural-20         bright three-note arpeggio flourish
 *  nat1        sfx      player natural-1          detuned descending down-blip
 *  combatStart sfx      EncounterStarted          low two-tone alarm sting
 *  wire        sfx      new WireEntry (dusk)      band-passed noise crackle + squelch (throttled to 1)
 *  dawn        sfx      new day / new game        warm ascending phosphor chord
 *  fail        sfx      refused Trade / Shipyard   soft low buzz (throttled to 1)
 *  drive hum   ambient  setDriveHum(true)         ~57Hz sine + detuned layer, slow LFO on a lowpass
 *
 * ---------------------------------------------------------------------------
 *  MIXER (persisted in localStorage; read at init, applied on first gesture)
 * ---------------------------------------------------------------------------
 *  sq.vol.master   0..1  default 0.7   masterGain → destination
 *  sq.vol.sfx      0..1  default 0.6   sfxGain    → masterGain
 *  sq.vol.ambient  0..1  default 0.35  ambientGain→ masterGain
 *  sq.audio.muted  bool  default false zeroes masterGain
 *
 * ---------------------------------------------------------------------------
 *  AUTOPLAY POLICY
 * ---------------------------------------------------------------------------
 *  The `AudioContext` is NEVER constructed at module load. It is created and
 *  resumed only INSIDE the first genuine user gesture (a capture-phase
 *  `pointerdown` / `keydown` on `window`). Because construction + `resume()`
 *  happen inside the gesture, the browser never logs the "AudioContext was not
 *  allowed to start" autoplay warning. Cues fired before that first gesture are
 *  simply dropped.
 * ============================================================================
 */

export type Cue =
  | 'relay'
  | 'key'
  | 'commit'
  | 'jump'
  | 'dice'
  | 'nat20'
  | 'nat1'
  | 'combatStart'
  | 'wire'
  | 'dawn'
  | 'fail';

export type MixerBus = 'master' | 'sfx' | 'ambient';

export interface MixerState {
  master: number;
  sfx: number;
  ambient: number;
  muted: boolean;
}

// ---- persisted mixer keys + tasteful defaults -----------------------------

const KEY_MASTER = 'sq.vol.master';
const KEY_SFX = 'sq.vol.sfx';
const KEY_AMBIENT = 'sq.vol.ambient';
const KEY_MUTED = 'sq.audio.muted';

const DEFAULT_MIXER: MixerState = { master: 0.7, sfx: 0.6, ambient: 0.35, muted: false };

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

/** Resolve the (possibly prefixed) AudioContext constructor, or null if absent. */
function audioCtor(): typeof AudioContext | null {
  if (!hasWindow()) return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function readNumber(key: string, fallback: number): number {
  if (!hasWindow()) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? clamp01(n) : fallback;
  } catch {
    return fallback;
  }
}

function readBool(key: string, fallback: boolean): boolean {
  if (!hasWindow()) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true' || raw === '1';
  } catch {
    return fallback;
  }
}

function writeString(key: string, value: string): void {
  if (!hasWindow()) return;
  try {
    storage.setItem(key, value);
  } catch {
    /* storage unavailable — non-fatal for play */
  }
}

// ---- reactive mixer snapshot (for the React slider panel) -----------------

// A cached, stable-reference snapshot so `useSyncExternalStore` never loops: the
// object identity changes ONLY when a value actually changes.
let mixer: MixerState = {
  master: readNumber(KEY_MASTER, DEFAULT_MIXER.master),
  sfx: readNumber(KEY_SFX, DEFAULT_MIXER.sfx),
  ambient: readNumber(KEY_AMBIENT, DEFAULT_MIXER.ambient),
  muted: readBool(KEY_MUTED, DEFAULT_MIXER.muted),
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMixer(): MixerState {
  return mixer;
}

// ---- WebAudio graph (all lazily constructed on first gesture) -------------

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let ambientGain: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

// Drive-hum state: `pendingHum` records intent expressed before the context
// exists; `humStop` tears the running bed down.
let pendingHum = false;
let humStop: (() => void) | null = null;

let gesturesInstalled = false;

/** Master gain target honours the mute flag. */
function masterTarget(): number {
  return mixer.muted ? 0 : mixer.master;
}

/** Push the current mixer values onto the live gain nodes (short ramp, no zip). */
function applyMixerToNodes(): void {
  if (!ctx || !masterGain || !sfxGain || !ambientGain) return;
  const t = ctx.currentTime;
  masterGain.gain.setTargetAtTime(masterTarget(), t, 0.015);
  sfxGain.gain.setTargetAtTime(mixer.sfx, t, 0.015);
  ambientGain.gain.setTargetAtTime(mixer.ambient, t, 0.015);
}

/** Construct the context + bus graph on demand. Returns null when unavailable. */
function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = audioCtor();
  if (!Ctor) return null;
  const c = new Ctor();

  const master = c.createGain();
  master.gain.value = masterTarget();
  master.connect(c.destination);

  const sfx = c.createGain();
  sfx.gain.value = mixer.sfx;
  sfx.connect(master);

  const ambient = c.createGain();
  ambient.gain.value = mixer.ambient;
  ambient.connect(master);

  // One second of mono white noise, reused by every noise-based cue.
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  ctx = c;
  masterGain = master;
  sfxGain = sfx;
  ambientGain = ambient;
  noiseBuffer = buf;
  return ctx;
}

/**
 * Idempotently unlock audio: create the context (if needed) and resume it. MUST
 * only be reached from inside a user gesture so the browser never blocks it.
 */
function unlock(): void {
  const c = ensureContext();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  if (pendingHum && !humStop) startHum();
}

/**
 * Attach the one set of persistent, capture-phase gesture listeners. They serve
 * double duty: the FIRST gesture unlocks the context (autoplay-safe), and every
 * gesture thereafter fires the UI relay/key cue. Installed exactly once — the
 * manager lives outside React, so StrictMode double-mounting is irrelevant.
 */
function installGestures(): void {
  if (gesturesInstalled || !hasWindow() || !audioCtor()) return;
  gesturesInstalled = true;

  window.addEventListener(
    'pointerdown',
    () => {
      unlock();
      play('relay');
    },
    { capture: true },
  );

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.repeat) return; // don't machine-gun on held keys
      unlock();
      play('key');
    },
    { capture: true },
  );
}

if (hasWindow()) installGestures();

// ---- synthesis helpers ----------------------------------------------------

function noiseSource(c: AudioContext): AudioBufferSourceNode {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  return src;
}

/**
 * A short percussive envelope on `gain`: 0 → peak (fast) → 0 (decay). The caller
 * has already wired its audio chain INTO `gain` (source → [filters] → gain); this
 * only schedules the envelope, connects `gain → bus`, and starts/stops the source
 * node so it auto-frees.
 */
function pluck(
  node: OscillatorNode | AudioBufferSourceNode,
  gain: GainNode,
  bus: GainNode,
  peak: number,
  attack: number,
  decay: number,
  at: number,
): void {
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  gain.connect(bus);
  node.start(at);
  node.stop(at + attack + decay + 0.02);
}

// ---- cue routines ---------------------------------------------------------

/** Wire an oscillator into a fresh gain and give it a percussive envelope. */
function tone(
  c: AudioContext,
  sfx: GainNode,
  type: OscillatorType,
  freq: number,
  peak: number,
  attack: number,
  decay: number,
  at: number,
): OscillatorNode {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  o.connect(g);
  pluck(o, g, sfx, peak, attack, decay, at);
  return o;
}

function synth(cue: Cue, c: AudioContext, sfx: GainNode, now: number): void {
  switch (cue) {
    case 'relay':
    case 'key': {
      const high = cue === 'key';
      // Filtered-noise tick.
      const n = noiseSource(c);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = high ? 2600 : 1800;
      bp.Q.value = 0.9;
      const ng = c.createGain();
      n.connect(bp);
      bp.connect(ng);
      pluck(n, ng, sfx, high ? 0.12 : 0.16, 0.001, high ? 0.02 : 0.03, now);
      // Tiny square blip for the mechanical snap.
      tone(c, sfx, 'square', high ? 420 : 300, 0.06, 0.001, 0.02, now);
      break;
    }
    case 'commit': {
      // Firmer two-layer low thunk (a die pressed into the console).
      const o1 = c.createOscillator();
      o1.type = 'sine';
      o1.frequency.setValueAtTime(180, now);
      o1.frequency.exponentialRampToValueAtTime(90, now + 0.09);
      const g1 = c.createGain();
      o1.connect(g1);
      pluck(o1, g1, sfx, 0.22, 0.002, 0.1, now);
      tone(c, sfx, 'triangle', 120, 0.14, 0.002, 0.07, now);
      break;
    }
    case 'jump': {
      // Rising sine sweep + noise whoosh (~0.5s).
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(180, now);
      o.frequency.exponentialRampToValueAtTime(1200, now + 0.45);
      const og = c.createGain();
      o.connect(og);
      pluck(o, og, sfx, 0.2, 0.05, 0.42, now);
      const n = noiseSource(c);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(400, now);
      lp.frequency.exponentialRampToValueAtTime(3200, now + 0.4);
      const ng = c.createGain();
      n.connect(lp);
      lp.connect(ng);
      pluck(n, ng, sfx, 0.12, 0.08, 0.4, now);
      break;
    }
    case 'dice': {
      // Short filtered-noise rattle.
      const n = noiseSource(c);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value = 1.4;
      const ng = c.createGain();
      n.connect(bp);
      bp.connect(ng);
      pluck(n, ng, sfx, 0.16, 0.003, 0.12, now);
      break;
    }
    case 'nat20': {
      // Bright ascending three-note flourish.
      [660, 880, 1320].forEach((f, i) => {
        tone(c, sfx, 'triangle', f, 0.14, 0.004, 0.14, now + i * 0.07);
      });
      break;
    }
    case 'nat1': {
      // Detuned descending down-blip.
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(220, now);
      o.frequency.exponentialRampToValueAtTime(70, now + 0.28);
      const og = c.createGain();
      o.connect(og);
      pluck(o, og, sfx, 0.16, 0.004, 0.28, now);
      break;
    }
    case 'combatStart': {
      // Low two-tone alarm sting.
      [140, 150].forEach((f, i) => {
        tone(c, sfx, 'sawtooth', f, 0.16, 0.01, 0.32, now + i * 0.18);
      });
      break;
    }
    case 'wire': {
      // Band-passed noise crackle + carrier squelch.
      const n = noiseSource(c);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 4;
      const ng = c.createGain();
      n.connect(bp);
      bp.connect(ng);
      pluck(n, ng, sfx, 0.1, 0.005, 0.16, now);
      tone(c, sfx, 'square', 900, 0.03, 0.002, 0.05, now + 0.02);
      break;
    }
    case 'dawn': {
      // Warm ascending phosphor chord (a settling triad).
      [261.6, 329.6, 392.0].forEach((f, i) => {
        tone(c, sfx, 'sine', f, 0.12, 0.06, 0.5, now + i * 0.05);
      });
      break;
    }
    case 'fail': {
      // Soft low buzz.
      tone(c, sfx, 'square', 110, 0.1, 0.01, 0.2, now);
      break;
    }
  }
}

// ---- drive hum bed (ambient) ----------------------------------------------

function startHum(): void {
  const c = ensureContext();
  if (!c || !ambientGain) {
    pendingHum = true;
    return;
  }
  if (humStop) return; // already running
  pendingHum = true;

  const now = c.currentTime;
  const bedGain = c.createGain();
  bedGain.gain.setValueAtTime(0.0001, now);
  bedGain.gain.exponentialRampToValueAtTime(0.5, now + 1.5); // slow fade-in

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 200;
  lp.Q.value = 0.7;

  const o1 = c.createOscillator();
  o1.type = 'sine';
  o1.frequency.value = 57;
  const o2 = c.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = 57 * 1.006; // slight detune → slow beat

  // Slow LFO wobbling the lowpass cutoff → a living, breathing bed.
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.08;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 60;
  lfo.connect(lfoGain);
  lfoGain.connect(lp.frequency);

  o1.connect(lp);
  o2.connect(lp);
  lp.connect(bedGain);
  bedGain.connect(ambientGain);

  o1.start(now);
  o2.start(now);
  lfo.start(now);

  humStop = () => {
    const t = c.currentTime;
    bedGain.gain.setTargetAtTime(0.0001, t, 0.3);
    const stopAt = t + 1.2;
    o1.stop(stopAt);
    o2.stop(stopAt);
    lfo.stop(stopAt);
    humStop = null;
  };
}

// ---- public API -----------------------------------------------------------

/** Fire-and-forget one-shot. Dropped silently before the first gesture unlock. */
export function play(cue: Cue): void {
  const c = ctx;
  if (!c || !sfxGain) return;
  if (c.state === 'suspended') void c.resume();
  synth(cue, c, sfxGain, c.currentTime);
}

/** Start (true) or stop (false) the ambient drive-hum bed. */
export function setDriveHum(on: boolean): void {
  if (on) {
    pendingHum = true;
    startHum(); // no-op deferral if the context isn't unlocked yet
  } else {
    pendingHum = false;
    if (humStop) humStop();
  }
}

export function setVolume(bus: MixerBus, v: number): void {
  const value = clamp01(v);
  if (mixer[bus] === value) return;
  mixer = { ...mixer, [bus]: value };
  writeString(bus === 'master' ? KEY_MASTER : bus === 'sfx' ? KEY_SFX : KEY_AMBIENT, String(value));
  applyMixerToNodes();
  notify();
}

export function setMuted(m: boolean): void {
  if (mixer.muted === m) return;
  mixer = { ...mixer, muted: m };
  writeString(KEY_MUTED, m ? 'true' : 'false');
  applyMixerToNodes();
  notify();
}

/**
 * PURE mapping from an action's emitted `GameEvent`s to the one-shot cues it
 * should play. No DOM, no side effects — exported so the event→cue mapping stays
 * reviewable and testable. The store plays the returned cues; `relay`/`key`
 * (gesture cues), `commit` (die spend) and `dawn` (day boundary) are triggered
 * directly by the store/gesture layer, not from this stream.
 */
export function cuesForEvents(events: GameEvent[]): Cue[] {
  const cues: Cue[] = [];
  let wireDone = false;
  let failDone = false;
  let diceDone = false;
  for (const e of events) {
    switch (e.type) {
      case 'EncounterStarted':
        cues.push('combatStart');
        break;
      case 'EncounterRound':
        if (!diceDone) {
          cues.push('dice');
          diceDone = true;
        }
        break;
      case 'StatCheck':
        if (e.actor === 'Player') {
          if (e.result.nat20) cues.push('nat20');
          else if (e.result.nat1) cues.push('nat1');
        }
        break;
      case 'TravelEvent':
        if (e.success && !e.interrupted) cues.push('jump');
        break;
      case 'WireEntry':
        if (!wireDone) {
          cues.push('wire');
          wireDone = true;
        }
        break;
      case 'TradeEvent':
        if (e.success === false && !failDone) {
          cues.push('fail');
          failDone = true;
        }
        break;
      case 'ShipyardFail':
        if (!failDone) {
          cues.push('fail');
          failDone = true;
        }
        break;
      default:
        break;
    }
  }
  return cues;
}
