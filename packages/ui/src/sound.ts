import type { GameEvent } from '@spacerquest/engine';

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
 * This module owns THE AUDIO GRAPH, THE MIXER and THE ONE-SHOT CUES, and is a
 * pure CLIENT of the rules: it is driven by the `GameEvent` stream the store
 * already receives (see `cuesForEvents`) plus a few UI-gesture cues. It never
 * imports or calls the engine, and the engine emits nothing new for it. Under
 * headless / SSR (no `window`, no `AudioContext`) the whole module is inert.
 *
 * T-185 · IT IS NO LONGER THE SOLE AUDIO MODULE. `music.ts` (the procedural
 * score) is a CLIENT of this one: it never constructs a context and never
 * touches `destination` — it asks for {@link musicBus} and hangs its voices off
 * the `music` bus this file owns. Every rule about the context (construct only
 * inside a gesture, defer intent until unlock) still lives HERE, once.
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
 *  drive hum   ambient  setDriveHum(true)         57Hz sine pair + a 171Hz partial, slow LFO on a lowpass
 *  the score   music    `music.ts` (its own file)  three moods, bar-quantised crossfades
 *
 * ---------------------------------------------------------------------------
 *  MIXER (persisted through `storage.ts`; read at init, applied on first gesture)
 *  — T-1701a: that seam is `localStorage` on the web build and an OS app-data
 *  file store under the Electron shell. Same keys, same synchronous API.
 * ---------------------------------------------------------------------------
 *  sq.vol.master   0..1  default 0.7   masterGain → softClip → destination
 *  sq.vol.sfx      0..1  default 0.6   sfxGain    → masterGain
 *  sq.vol.ambient  0..1  default 0.35  ambientGain→ masterGain
 *  sq.vol.music    0..1  default 0.45  musicGain  → masterGain   (T-185)
 *  sq.audio.muted  bool  default false zeroes masterGain
 *
 *  T-185 · `masterGain` feeds a `WaveShaper` soft-clip (a plain `tanh`) before
 *  `destination`. It is transparent below ~-10 dBFS — the level the loudest cue
 *  reaches on its own — and only bends when a bed, a score and three one-shots
 *  pile up in the same 50 ms. That headroom is what let the T-185 level pass
 *  raise every cue without buying digital clipping with it.
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
 *
 * ---------------------------------------------------------------------------
 *  T-185 · WHAT THE AUDIBILITY INVESTIGATION MEASURED (2026-08-03)
 * ---------------------------------------------------------------------------
 *  Measured at `ctx.destination` through an `AnalyserNode` tap in a real
 *  Chromium, driving the real cockpit through the real UI. Recorded here because
 *  the numbers are the argument for every level in this file:
 *
 *   * the context is `running` on the FIRST gesture (created inside it) and the
 *     first-ever cue rendered a 0.034 peak — cues were never being swallowed;
 *   * a plain boot into an autosaved career rendered a peak of EXACTLY 0.000 —
 *     `setDriveHum(true)` was only ever called by `newGame`/`endDay`, so a
 *     returning player had no bed at all (fixed: `store.ts` module scope);
 *   * the bed's spectrum was -39.9 dB at 20-100 Hz and -112.7 dB at 100-150 Hz,
 *     i.e. ENTIRELY below the range a laptop or monitor speaker reproduces. It
 *     was burning 0.25 of peak headroom that nobody could hear (fixed: the
 *     171 Hz partial in `startHum`);
 *   * one-shots landed at 0.034-0.05 peak at the destination — about -29 dBFS
 *     (fixed: the level pass below, roughly +7 dB, plus the soft-clip).
 * ============================================================================
 */

// T-1701a · The cockpit's one storage surface (see `storage.ts`). The
// `hasWindow()` guards below are kept: this module is imported by `store.ts`,
// which is imported by node-side tooling, and the mixer snapshot is built at
// module scope.
import { storage } from './storage';

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

export type MixerBus = 'master' | 'sfx' | 'ambient' | 'music';

export interface MixerState {
  master: number;
  sfx: number;
  ambient: number;
  /** T-185 · The procedural score's bus (see `music.ts`). */
  music: number;
  muted: boolean;
}

// ---- persisted mixer keys + tasteful defaults -----------------------------

const KEY_MASTER = 'sq.vol.master';
const KEY_SFX = 'sq.vol.sfx';
const KEY_AMBIENT = 'sq.vol.ambient';
const KEY_MUSIC = 'sq.vol.music';
const KEY_MUTED = 'sq.audio.muted';

/**
 * T-185 · The persistence key per bus, as a TOTAL map rather than a ternary
 * chain. `setVolume` used to pick its key with `bus === 'master' ? … : bus ===
 * 'sfx' ? … : KEY_AMBIENT`, whose fall-through arm means every bus added after
 * `ambient` silently writes ITS value into `sq.vol.ambient`. A `Record` keyed by
 * `MixerBus` makes the compiler refuse the next omission instead.
 */
const BUS_KEY: Record<MixerBus, string> = {
  master: KEY_MASTER,
  sfx: KEY_SFX,
  ambient: KEY_AMBIENT,
  music: KEY_MUSIC,
};

const DEFAULT_MIXER: MixerState = {
  master: 0.7,
  sfx: 0.6,
  ambient: 0.35,
  // Under the one-shots by design: a score a player has to talk over is a score
  // they mute, and the cues are the feedback the music is a bed for.
  music: 0.45,
  muted: false,
};

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
  music: readNumber(KEY_MUSIC, DEFAULT_MIXER.music),
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
let musicGain: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

// Drive-hum state: `pendingHum` records intent expressed before the context
// exists; `humStop` tears the running bed down.
let pendingHum = false;
let humStop: (() => void) | null = null;

let gesturesInstalled = false;

// T-185 · Who wants to know the moment the context is genuinely unlocked. The
// score cannot poll for it (it has no frame loop before it is running) and must
// not install its own gesture listeners — there is exactly one autoplay policy
// in this cockpit and it lives in this file.
const unlockListeners = new Set<() => void>();
let unlocked = false;

/** Master gain target honours the mute flag. */
function masterTarget(): number {
  return mixer.muted ? 0 : mixer.master;
}

/** Push the current mixer values onto the live gain nodes (short ramp, no zip). */
function applyMixerToNodes(): void {
  if (!ctx || !masterGain || !sfxGain || !ambientGain || !musicGain) return;
  const t = ctx.currentTime;
  masterGain.gain.setTargetAtTime(masterTarget(), t, 0.015);
  sfxGain.gain.setTargetAtTime(mixer.sfx, t, 0.015);
  ambientGain.gain.setTargetAtTime(mixer.ambient, t, 0.015);
  musicGain.gain.setTargetAtTime(mixer.music, t, 0.015);
}

/**
 * T-185 · The master soft-clip curve: a plain `tanh`, sampled once.
 *
 * Slope 1 at the origin, so it is transparent at the level a single cue reaches
 * and does NOT act as a hidden makeup gain; asymptotic to ±1, so no sum of bed +
 * score + one-shots can ever produce a sample outside range. This is the
 * headroom that made the T-185 level pass safe.
 */
function softClipCurve() {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = Math.tanh((i / (n - 1)) * 2 - 1);
  return curve;
}

/** Construct the context + bus graph on demand. Returns null when unavailable. */
function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = audioCtor();
  if (!Ctor) return null;
  const c = new Ctor();

  const shaper = c.createWaveShaper();
  shaper.curve = softClipCurve();
  shaper.oversample = '2x';
  shaper.connect(c.destination);

  const master = c.createGain();
  master.gain.value = masterTarget();
  master.connect(shaper);

  const sfx = c.createGain();
  sfx.gain.value = mixer.sfx;
  sfx.connect(master);

  const ambient = c.createGain();
  ambient.gain.value = mixer.ambient;
  ambient.connect(master);

  // T-185 · The score's bus. Created here with every other bus rather than
  // lazily by `music.ts`, so the mixer slider is honoured from the first ramp
  // and there is exactly one place that knows the bus topology.
  const music = c.createGain();
  music.gain.value = mixer.music;
  music.connect(master);

  // One second of mono white noise, reused by every noise-based cue.
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  ctx = c;
  masterGain = master;
  sfxGain = sfx;
  ambientGain = ambient;
  musicGain = music;
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
  // Set BEFORE the deferred work below: `startHum` now refuses to run while
  // `unlocked` is false (that guard is what keeps the context out of module
  // load), so flipping the flag afterwards would defer the bed forever.
  const first = !unlocked;
  unlocked = true;
  if (pendingHum && !humStop) startHum();
  // T-185 · Fire the deferred-intent listeners ONCE, after the bed, so a client
  // (`music.ts`) that was asked to play before the first gesture starts now.
  // Measured: a context CONSTRUCTED inside a gesture is already `running` here
  // and `currentTime` starts at 0, so this is not a race — the investigation
  // recorded a 0.034 peak from the very first cue.
  if (first) for (const l of [...unlockListeners]) l();
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

/**
 * T-185 · THE LEVEL PASS, in one constant.
 *
 * The investigation measured every one-shot arriving at `ctx.destination` at a
 * 0.034-0.05 peak — roughly -29 dBFS, which is quiet enough that the owner's
 * "there is just zero feedback" is a fair description of it even with the OS
 * volume up. Every peak below is multiplied by this on the way into `pluck`.
 *
 * WHY A MULTIPLIER AND NOT NEW LITERALS: the relative balance between the cues
 * was never the complaint, and it was mixed by ear once already. Moving all of
 * them together by a measured amount keeps that balance exactly and makes the
 * change one reviewable number. WHY NOT `DEFAULT_MIXER.sfx`: that value is
 * PERSISTED — raising it would do nothing for the players who already have a
 * `sq.vol.sfx` written, which is every player who ever opened Settings.
 *
 * 2.2x is +6.8 dB, landing the loudest cue near -12 dBFS. The `tanh` soft-clip
 * on `masterGain` absorbs the pile-ups this makes possible (see the header).
 */
const CUE_GAIN = 2.2;

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
 *
 * T-185 · This is the ONE envelope every one-shot cue goes through and nothing
 * else uses it (the ambient bed builds its own sustained envelope), so it is
 * where {@link CUE_GAIN} is applied — once, rather than at nineteen call sites
 * where the twentieth would be the one that got missed.
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
  gain.gain.exponentialRampToValueAtTime(Math.max(peak * CUE_GAIN, 0.0002), at + attack);
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

/**
 * T-185 · The bed's audible partial.
 *
 * The original bed was a 57 Hz sine pair behind a 200 Hz lowpass, and the
 * investigation measured its spectrum at the destination as -39.9 dB across
 * 20-100 Hz and -112.7 dB across 100-150 Hz: essentially ALL of its energy sat
 * below the range a laptop, a monitor speaker or a phone reproduces at all. It
 * was loud in the meter (0.25 peak, the loudest thing in the mix) and silent in
 * the room — a large part of an honest "there is just zero feedback" report.
 *
 * The cure is a partial, not a level: the third harmonic (171 Hz) at a low mix,
 * routed AROUND the lowpass so the filter cannot undo it. It reads as the same
 * drive, an octave-and-a-fifth up, on speakers that can pass it — and adds
 * nothing on speakers that were already reproducing the fundamental.
 */
const HUM_FUNDAMENTAL_HZ = 57;
const HUM_PARTIAL_HZ = HUM_FUNDAMENTAL_HZ * 3;
const HUM_PARTIAL_MIX = 0.18;

function startHum(): void {
  // T-185 · DEFER UNTIL THE FIRST GESTURE, EXPLICITLY.
  //
  // This guard used to be implicit — `ensureContext()` returns null with no
  // `AudioContext` constructor, which covered node and SSR but NOT a browser
  // before the first click. In a browser `ensureContext()` happily CONSTRUCTS
  // one, so the moment T-185 added a `setDriveHum(true)` at `store.ts`'s module
  // scope (the fix for the silent returning-player boot), the context was being
  // built at module load and Chromium logged "The AudioContext was not allowed
  // to start" eight times over. `e2e/sound.spec.ts`'s console-cleanliness test
  // and `e2e/sound-audible.spec.ts`'s cold-boot assertion both caught it.
  //
  // The autoplay rule in this file's header is now enforced rather than
  // described: nothing constructs a context until `unlock()` runs inside a real
  // gesture, and every caller before that just parks its intent in `pendingHum`.
  if (!unlocked) {
    pendingHum = true;
    return;
  }
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
  o1.frequency.value = HUM_FUNDAMENTAL_HZ;
  const o2 = c.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = HUM_FUNDAMENTAL_HZ * 1.006; // slight detune → slow beat

  // The audible partial (see above), on its own path so the lowpass — whose
  // cutoff the LFO drags down to ~140 Hz — cannot swallow it again.
  const o3 = c.createOscillator();
  o3.type = 'sine';
  o3.frequency.value = HUM_PARTIAL_HZ;
  const partialGain = c.createGain();
  partialGain.gain.value = HUM_PARTIAL_MIX;

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
  o3.connect(partialGain);
  partialGain.connect(bedGain);
  bedGain.connect(ambientGain);

  o1.start(now);
  o2.start(now);
  o3.start(now);
  lfo.start(now);

  humStop = () => {
    const t = c.currentTime;
    bedGain.gain.setTargetAtTime(0.0001, t, 0.3);
    const stopAt = t + 1.2;
    o1.stop(stopAt);
    o2.stop(stopAt);
    o3.stop(stopAt);
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
  writeString(BUS_KEY[bus], String(value));
  applyMixerToNodes();
  notify();
}

/**
 * T-185 · The score's ONE window onto the audio graph.
 *
 * `music.ts` gets the context (for its own `currentTime` and node factories) and
 * the `music` bus to hang voices off — and nothing else. It never constructs a
 * context, never reaches `destination`, never touches the mixer's gains: the
 * autoplay policy and the bus topology stay owned by this file. Null before the
 * first gesture, which is exactly when the score must not be running.
 */
export function musicBus(): { ctx: AudioContext; bus: GainNode } | null {
  if (!ctx || !musicGain) return null;
  return { ctx, bus: musicGain };
}

/**
 * T-185 · Run `cb` once the AudioContext is genuinely unlocked, or immediately
 * if it already is. Returns an unsubscribe.
 *
 * This exists so `music.ts` can express "start when you can" without installing
 * a second set of gesture listeners — there is one autoplay policy in this
 * cockpit and `installGestures` is it. Mirrors `pendingHum`'s deferral, which is
 * the same shape for the ambient bed.
 */
export function onUnlock(cb: () => void): () => void {
  if (unlocked) {
    cb();
    return () => {};
  }
  unlockListeners.add(cb);
  return () => unlockListeners.delete(cb);
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
      // T-136 · The Liar's Dice table. Foley for the two beats that have one: a
      // claim landing on the boards, and a hand that cost the captain money.
      // Additive — this switch has a `default: break`, so T-135's scene events
      // were already silent rather than broken.
      case 'DareBidPlaced':
        if (!diceDone) {
          cues.push('dice');
          diceDone = true;
        }
        break;
      case 'DareHandResolved':
        if (e.creditsDelta < 0 && !failDone) {
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
