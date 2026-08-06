import type { CockpitState } from './store';
import * as sound from './sound';

/**
 * ============================================================================
 *  T-185 · THE SCORE — a procedural, mood-reactive soundtrack
 * ============================================================================
 *
 * The owner's finding was "music and sound FX is going to be a must. There is
 * just zero feedback, and it is hard to feel like we are playing anything." The
 * FX half of that was three measured defects in `sound.ts` (see its header). THIS
 * file is the other half: there was no music in the cockpit at all, and no bus to
 * put any on.
 *
 * Like `sound.ts`, every note is SYNTHESIZED LIVE via WebAudio. There are ZERO
 * audio asset files, no samples, no third-party recordings, no network fetches.
 *
 *   CREDITS: Original procedural WebAudio composition by the Spacer Quest
 *   project (no third-party samples). Released CC0 with the project.
 *
 * ---------------------------------------------------------------------------
 *  WHAT OWNS WHAT
 * ---------------------------------------------------------------------------
 *  * `sound.ts` owns the AudioContext, the autoplay policy and the mixer. This
 *    file NEVER constructs a context and never reaches `destination`: it asks for
 *    `sound.musicBus()` and hangs everything off the `music` bus, and it defers
 *    its own start through `sound.onUnlock` rather than installing a second set
 *    of gesture listeners.
 *  * The STORE owns state. `moodForState` is a PURE function of `CockpitState`,
 *    which is what keeps `store.ts` free of any `if` about audio — the store's
 *    one wiring line is `music.syncScene(state)` inside `set()`, on the same
 *    argument that put `steam.syncPresence` there.
 *  * The ENGINE owns rules. Nothing here reads a rule, emits an event or touches
 *    `GameState` beyond two null checks, and no seeded run can observe this file.
 *
 * ---------------------------------------------------------------------------
 *  THE THREE MOODS
 * ---------------------------------------------------------------------------
 *  drift    the default: the ship, the wire, the long haul   Aeolian, 52 BPM
 *  tension  an encounter is live                             Phrygian, 92 BPM
 *  table    a Liar's Dice hand is open at a Hangout          Dorian, 68 BPM
 *
 *  A mood change takes effect at the NEXT BAR BOUNDARY and crossfades over
 *  {@link CROSSFADE_S} — the two moods run on their own lanes and swap, so a
 *  change is a transition and never a cut.
 *
 * ---------------------------------------------------------------------------
 *  THE AUDIBLE BAND — the constraint this score is written inside
 * ---------------------------------------------------------------------------
 *  T-185's investigation measured the existing ambient bed as -39.9 dB across
 *  20-100 Hz and -112.7 dB across 100-150 Hz: all of its energy sat under the
 *  range a laptop, monitor or phone speaker reproduces, so it was loud in the
 *  meter and silent in the room. A score written down there would be exactly as
 *  inaudible. Every voice here is therefore constrained to
 *  {@link BAND_LOW_HZ}-{@link BAND_HIGH_HZ}, and `__tests__/music.test.ts`
 *  asserts it against the mood table rather than trusting the comment.
 *
 * ---------------------------------------------------------------------------
 *  SCHEDULING
 * ---------------------------------------------------------------------------
 *  The standard WebAudio lookahead pattern: a {@link TICK_MS} `setInterval`
 *  pushes notes onto the audio clock {@link LOOKAHEAD_S} ahead. NEVER a
 *  `setTimeout` per note — the timer thread is throttled and jittery, the audio
 *  clock is not, so per-note timers are how a score comes out swung by 30 ms.
 *
 *  The scheduler SUSPENDS ITSELF when the mixer is muted or the music bus is at
 *  zero (a silent scheduler burning a timer every 25 ms is a real cost in an
 *  Electron game window), and RESYNCS rather than catching up when the window
 *  comes back from hidden — Electron throttles background timers, and a catch-up
 *  loop would machine-gun every missed note into one bar.
 * ============================================================================
 */

// ---- the pure half: moods, and which one a state is in --------------------

export type Mood = 'drift' | 'tension' | 'table';

/** The audible band every voice must live inside. See the header. */
export const BAND_LOW_HZ = 150;
export const BAND_HIGH_HZ = 4000;

export interface MoodParams {
  /** Beats per minute. The grid is sixteenths, so a step is `60/bpm/4` seconds. */
  readonly bpm: number;
  /** Scale degrees in semitones from the root, one octave. */
  readonly mode: readonly number[];
  /** The bass voice's root, in Hz — and the bottom of this mood's range. */
  readonly rootHz: number;
  /** 0..1 · how much of the grid the lead voice fills. */
  readonly density: number;
  /** The shared lowpass cutoff, in Hz — how bright the mood is. */
  readonly cutoffHz: number;
  /** Peak gains per voice, pre-bus. Deliberately low: this sits UNDER the cues. */
  readonly bassLevel: number;
  readonly padLevel: number;
  readonly leadLevel: number;
  /** How many sixteenths apart the bass pulses. 4 = quarters, 2 = eighths. */
  readonly bassEvery: number;
}

/**
 * THE MOOD TABLE.
 *
 * Frozen, and the only place a musical number lives — the scheduler below reads
 * every value from here, so a mood is retuned by editing one row rather than by
 * hunting constants through the voices.
 *
 * The roots (F3 / G3 / A3) are all above {@link BAND_LOW_HZ}; the pad sits an
 * octave up and the lead two, so the brightest note this score can produce is
 * about 1.6 kHz — comfortably inside the band and comfortably below the 2.2 kHz
 * where `sound.ts`'s relay tick lives, so the cues still cut through it.
 */
export const MOODS: Readonly<Record<Mood, MoodParams>> = Object.freeze({
  // The long haul. Sparse, warm, patient — it must survive being heard for an
  // hour, which is the only real constraint on a default loop.
  drift: Object.freeze({
    bpm: 52,
    mode: Object.freeze([0, 2, 3, 5, 7, 8, 10]), // Aeolian
    rootHz: 174.61, // F3
    density: 0.3,
    cutoffHz: 1200,
    bassLevel: 0.1,
    padLevel: 0.075,
    leadLevel: 0.05,
    bassEvery: 8,
  }),
  // An encounter is live. Faster, brighter, a driving eighth-note bass, and the
  // flat second of the Phrygian mode doing the work no UI colour can.
  tension: Object.freeze({
    bpm: 92,
    mode: Object.freeze([0, 1, 3, 5, 7, 8, 10]), // Phrygian
    rootHz: 196.0, // G3
    density: 0.7,
    cutoffHz: 2400,
    bassLevel: 0.13,
    padLevel: 0.055,
    leadLevel: 0.07,
    bassEvery: 2,
  }),
  // A hand of Liar's Dice at a Hangout. Mid-tempo, Dorian, brushed — a room with
  // people in it rather than a ship with nobody in it.
  table: Object.freeze({
    bpm: 68,
    mode: Object.freeze([0, 2, 3, 5, 7, 9, 10]), // Dorian
    rootHz: 220.0, // A3
    density: 0.5,
    cutoffHz: 1800,
    bassLevel: 0.11,
    padLevel: 0.07,
    leadLevel: 0.06,
    bassEvery: 4,
  }),
});

/** The octave each voice plays in, relative to `rootHz`. */
const PAD_OCTAVE = 2;
const LEAD_OCTAVE = 4;

/**
 * The lowest and highest fundamental a mood can produce, in Hz.
 *
 * Exported so `__tests__/music.test.ts` can assert the band constraint against
 * the real voice layout instead of against a hand-copied number — if a later
 * edit drops the bass an octave, the test fails rather than the speakers.
 */
export function moodBandHz(mood: Mood): { lowHz: number; highHz: number } {
  const p = MOODS[mood];
  const topDegree = Math.max(...p.mode);
  return {
    lowHz: p.rootHz,
    highHz: p.rootHz * LEAD_OCTAVE * Math.pow(2, topDegree / 12),
  };
}

/**
 * WHICH MUSIC A COCKPIT STATE IS IN — the whole rule, as a pure function.
 *
 * This is deliberately the ONLY place the question is answered. `store.ts` calls
 * it through `syncScene` and contains no audio branch of its own, which is what
 * keeps "the store owns state, this file owns sound" true rather than aspirational.
 *
 * Priority is `tension` > `table` > `drift`: an encounter can open while a
 * Hangout reveal is still on screen, and a fight outranks a card table.
 *
 * The `table` predicate reads the ENGINE's live hand (`game.dareHand`) first —
 * that is the honest "a hand is open" fact — and then the two presentation
 * fields the Hangout pane renders after it closes (`dareReveal`, `dareBeats`), so
 * the music holds through the reveal timeline the player is still watching. All
 * three are cleared by selection / travel / a new day, so the mood falls back to
 * `drift` on its own without a second rule here to remember.
 */
export function moodForState(s: CockpitState): Mood {
  if (s.game.encounter) return 'tension';
  if (s.game.dareHand || s.dareReveal || s.dareBeats.length > 0) return 'table';
  return 'drift';
}

// ---- the impure half: the lookahead scheduler ------------------------------

/** How often the scheduler wakes. */
const TICK_MS = 25;
/** How far ahead of the audio clock notes are scheduled. */
const LOOKAHEAD_S = 0.2;
/** Sixteenths per bar. */
const STEPS_PER_BAR = 16;
/** How long a mood swap takes. Long enough to read as a transition, not a cut. */
const CROSSFADE_S = 1.2;

let active: Mood | null = null;
/** The mood requested since the last bar boundary, applied at the next one. */
let pending: Mood | null = null;
/** One gain lane per mood, so a swap is a real crossfade and not a dip. */
const lanes = new Map<Mood, GainNode>();
let timer: ReturnType<typeof setInterval> | null = null;
let nextNoteTime = 0;
let step = 0;
/** Whether an unlock listener is already parked, so repeated calls do not stack. */
let deferred = false;
let listenersInstalled = false;

/**
 * A tiny local PRNG for the lead voice's placement.
 *
 * Local and not `Math.random` so the score is reproducible within a session, and
 * emphatically not the engine's RNG: this file must be incapable of moving a
 * seeded run by one draw. Nothing here is ever saved, compared or asserted on.
 */
let rngState = 0x9e3779b9;
function rnd(): number {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 0x100000000;
}

/** Whether the score should be running at all right now. */
function audible(): boolean {
  const m = sound.getMixer();
  return !m.muted && m.music > 0;
}

/** The lane for a mood, created on demand and connected to the `music` bus. */
function laneFor(mood: Mood, ctx: AudioContext, bus: GainNode): GainNode {
  const existing = lanes.get(mood);
  if (existing) return existing;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(bus);
  lanes.set(mood, g);
  return g;
}

/** Hz for a scale degree, `octave` octaves above the mood's root. */
function degreeHz(p: MoodParams, degree: number, octave: number): number {
  const semitones = p.mode[((degree % p.mode.length) + p.mode.length) % p.mode.length];
  return p.rootHz * octave * Math.pow(2, semitones / 12);
}

/**
 * One voice: an oscillator through a lowpass and an envelope, into a lane.
 * Self-freeing — `stop()` is scheduled with the release, so nothing accumulates.
 */
function voice(
  ctx: AudioContext,
  lane: GainNode,
  type: OscillatorType,
  hz: number,
  peak: number,
  attack: number,
  hold: number,
  release: number,
  cutoffHz: number,
  at: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = hz;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoffHz;
  lp.Q.value = 0.6;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
  g.gain.setValueAtTime(Math.max(peak, 0.0002), at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);

  osc.connect(lp);
  lp.connect(g);
  g.connect(lane);
  osc.start(at);
  osc.stop(at + attack + hold + release + 0.02);
}

/** Schedule everything that happens on one sixteenth of the grid. */
function scheduleStep(ctx: AudioContext, lane: GainNode, mood: Mood, at: number): void {
  const p = MOODS[mood];
  const beat = 60 / p.bpm;

  // BASS — the pulse. Root, then the fifth on the back half of the bar.
  if (step % p.bassEvery === 0) {
    const degree = step < STEPS_PER_BAR / 2 ? 0 : 4;
    voice(
      ctx,
      lane,
      'triangle',
      degreeHz(p, degree, 1),
      p.bassLevel,
      0.01,
      beat * 0.25,
      beat * 0.5,
      p.cutoffHz,
      at,
    );
  }

  // PAD — one slow swell per bar, the root triad an octave up.
  if (step === 0) {
    for (const degree of [0, 2, 4]) {
      voice(
        ctx,
        lane,
        'sine',
        degreeHz(p, degree, PAD_OCTAVE),
        p.padLevel,
        beat * 0.9,
        beat * 1.2,
        beat * 1.6,
        p.cutoffHz,
        at,
      );
    }
  }

  // LEAD — sparse sparkles on the off-grid, gated by the mood's density.
  if (step % 2 === 1 && rnd() < p.density * 0.45) {
    const degree = Math.floor(rnd() * p.mode.length);
    voice(
      ctx,
      lane,
      'sine',
      degreeHz(p, degree, LEAD_OCTAVE),
      p.leadLevel,
      0.012,
      beat * 0.08,
      beat * 0.5,
      p.cutoffHz,
      at,
    );
  }
}

/** Swap lanes: the old mood rings out while the new one comes up. */
function crossfade(ctx: AudioContext, bus: GainNode, from: Mood | null, to: Mood): void {
  const t = ctx.currentTime;
  if (from && from !== to) {
    const old = lanes.get(from);
    if (old) {
      old.gain.cancelScheduledValues(t);
      old.gain.setValueAtTime(old.gain.value, t);
      old.gain.linearRampToValueAtTime(0, t + CROSSFADE_S);
    }
  }
  const next = laneFor(to, ctx, bus);
  next.gain.cancelScheduledValues(t);
  next.gain.setValueAtTime(next.gain.value, t);
  next.gain.linearRampToValueAtTime(1, t + CROSSFADE_S);
}

function tick(): void {
  const wired = sound.musicBus();
  if (!wired || !active) return;
  if (!audible()) {
    stopScheduler();
    return;
  }
  const { ctx, bus } = wired;
  const horizon = ctx.currentTime + LOOKAHEAD_S;
  while (nextNoteTime < horizon) {
    // A requested mood takes effect ONLY on a bar line, so a change never lands
    // mid-phrase. The crossfade starts here; the new lane's notes start now too,
    // and the old lane's tail rings through it.
    if (step === 0 && pending && pending !== active) {
      crossfade(ctx, bus, active, pending);
      active = pending;
      pending = null;
    }
    const lane = laneFor(active, ctx, bus);
    scheduleStep(ctx, lane, active, nextNoteTime);
    nextNoteTime += 60 / MOODS[active].bpm / 4;
    step = (step + 1) % STEPS_PER_BAR;
  }
}

function startScheduler(): void {
  if (timer !== null) return;
  const wired = sound.musicBus();
  if (!wired || !active) return;
  const { ctx, bus } = wired;
  // Fresh phase every start — see the visibility handler for why catching up is
  // the wrong answer.
  nextNoteTime = ctx.currentTime + 0.05;
  step = 0;
  crossfade(ctx, bus, null, active);
  timer = setInterval(tick, TICK_MS);
  tick();
}

function stopScheduler(): void {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}

/**
 * Install the two listeners the scheduler needs, exactly once.
 *
 * MIXER — muting or dragging Music to zero suspends the timer entirely rather
 * than leaving it running into a silent bus; un-muting restarts it.
 *
 * VISIBILITY — Electron's `backgroundThrottling` (and every browser) stalls
 * timers while the window is hidden. On return we RESYNC the phase to `now`
 * rather than letting the `while` loop above discharge every missed step into
 * one audio buffer, which is what a naive catch-up produces.
 */
function installListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;

  sound.subscribe(() => {
    if (!active) return;
    if (audible()) startScheduler();
    else stopScheduler();
  });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      const wired = sound.musicBus();
      if (!wired) return;
      nextNoteTime = wired.ctx.currentTime + 0.05;
      step = 0;
    });
  }
}

/**
 * Reconcile the score with the cockpit's state. Idempotent and total.
 *
 * CALLED FROM exactly two places, both in `store.ts`: module scope (so a booted
 * career gets its score before the first action) and `set()` (the store's one
 * state-update choke point). It MUST NOT THROW — it is unwrapped at both, on the
 * same argument `steam.syncPresence` is unwrapped: a `try` there would hide a
 * real regression in this module. Everything below is a null check, a string
 * compare or a WebAudio call on a context this module did not create and only
 * uses when `sound.ts` hands it over.
 *
 * Inert under node / SSR: `sound.musicBus()` is null with no `AudioContext`, and
 * the deferral registered instead never fires.
 */
export function syncScene(s: CockpitState): void {
  const mood = moodForState(s);
  installListeners();

  const wired = sound.musicBus();
  if (!wired) {
    // Before the first gesture. Remember the intent and start from the unlock —
    // the same deferral shape `sound.ts` uses for the ambient bed, and the reason
    // this module owns no gesture listener of its own.
    active = active ?? mood;
    pending = mood;
    if (!deferred) {
      deferred = true;
      sound.onUnlock(() => {
        deferred = false;
        if (pending) {
          active = pending;
          pending = null;
        }
        if (audible()) startScheduler();
      });
    }
    return;
  }

  if (active === null) {
    active = mood;
    if (audible()) startScheduler();
    return;
  }
  // Unchanged: the ordinary case, and the reason this is cheap enough to sit at
  // the store's choke point.
  if (mood === active && pending === null) return;
  if (mood === active) {
    pending = null;
    return;
  }
  pending = mood;
  if (audible()) startScheduler();
}
