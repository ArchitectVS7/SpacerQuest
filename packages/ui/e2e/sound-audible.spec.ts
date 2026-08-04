import { test, expect, type Page } from '@playwright/test';
import { DARE_MIN_WAGER } from '@spacerquest/content';

// ---------------------------------------------------------------------------
// T-185 · IS THE COCKPIT ACTUALLY MAKING A SOUND?
//
// The owner's UAT finding was "there is just zero feedback". `e2e/sound.spec.ts`
// (T-310) already covers the MIXER — sliders, mute, persistence, no autoplay
// warning — and every one of those tests was green while the cockpit was, for a
// returning player, producing an all-day silence. Passing mixer tests are not
// evidence of output.
//
// WHAT THIS FILE ASSERTS INSTEAD: that a signal is SCHEDULED, with a non-zero
// envelope, on a chain that reaches `ctx.destination`, through open buses.
//
// WHY THE SCHEDULE AND NOT THE SAMPLES. An `AnalyserNode` reading real samples
// is the obvious approach and it is the wrong one for a gate: CI runs this suite
// on a GitHub ubuntu runner (and the Electron suite under `xvfb-run`) with no
// sound card, so a sample-level assertion is green on a workstation and a
// mystery in CI. Observing the SCHEDULE is device-independent — it is a claim
// about what the cockpit asked the audio clock to do, which is the thing that
// can regress. (The T-185 investigation DID measure real samples through an
// analyser, on a workstation, to establish the numbers quoted below; that pass
// is recorded in `sound.ts`'s header, not shipped as a test.)
//
// ZERO TEST HOOKS IN THE COCKPIT. Every instrument here is installed by
// `page.addInitScript` before the app's modules load, and every action is a real
// click on a real control. `packages/desktop/src/main.ts` states the standing
// rule that the cockpit carries no test flag anywhere; this honours it.
// ---------------------------------------------------------------------------

interface AudioTrace {
  running: boolean | null;
  currentTime: number;
  /** Every scheduled source start, in order. */
  starts: { id: number; kind: string; when: number; ctxRunning: boolean }[];
  stops: number[];
  edges: { from: number; to: number }[];
  destId: number;
  /** Peak value scheduled onto each gain node's `gain`, and how it was scheduled. */
  envelopes: { id: number; peak: number }[];
  /** Gain nodes whose value was set directly and never enveloped — the buses. */
  buses: { id: number; value: number }[];
}

/**
 * Install the WebAudio recorder. Runs before any app module, so `sound.ts` picks
 * up the instrumented constructor when it first reaches for one.
 *
 * It patches the PROTOTYPES rather than wrapping `sound.ts`'s own helpers, so it
 * cannot be fooled by a refactor inside that module and does not need to know
 * anything about it.
 */
const RECORDER = () => {
  interface Rec {
    ctx: AudioContext | null;
    starts: { id: number; kind: string; when: number; ctxRunning: boolean }[];
    stops: number[];
    edges: { from: number; to: number }[];
    destId: number;
    /** id → highest value ever scheduled with an envelope method. */
    enveloped: Map<number, number>;
    /** id → the GainNode itself, for reading `.gain.value` at assert time. */
    gains: Map<number, GainNode>;
  }
  const rec: Rec = {
    ctx: null,
    starts: [],
    stops: [],
    edges: [],
    destId: -1,
    enveloped: new Map(),
    gains: new Map(),
  };
  (window as unknown as { __sqAudio: Rec }).__sqAudio = rec;

  let nextId = 1;
  const idOf = (n: object): number => {
    const o = n as { __sqId?: number };
    if (!o.__sqId) o.__sqId = nextId++;
    return o.__sqId;
  };

  // --- AudioParam: record the peak of every scheduled envelope, per owner ----
  const P = AudioParam.prototype as unknown as Record<string, (...a: never[]) => unknown>;
  for (const m of ['setValueAtTime', 'exponentialRampToValueAtTime', 'linearRampToValueAtTime']) {
    const orig = P[m];
    P[m] = function (this: AudioParam, ...args: never[]) {
      const self = this as unknown as { __sqOwner?: number; __sqName?: string };
      const value = args[0] as unknown as number;
      if (self.__sqOwner !== undefined && self.__sqName === 'gain') {
        rec.enveloped.set(self.__sqOwner, Math.max(rec.enveloped.get(self.__sqOwner) ?? 0, value));
      }
      return orig.apply(this, args);
    };
  }

  // --- AudioNode.connect: the graph edges -----------------------------------
  const AN = AudioNode.prototype as unknown as Record<string, (...a: never[]) => unknown>;
  const origConnect = AN.connect;
  AN.connect = function (this: AudioNode, ...args: never[]) {
    const dest = args[0] as unknown;
    if (dest instanceof AudioNode) rec.edges.push({ from: idOf(this), to: idOf(dest) });
    return origConnect.apply(this, args);
  };

  // --- source start/stop ----------------------------------------------------
  // BOTH concrete prototypes, not just `AudioScheduledSourceNode`:
  // `AudioBufferSourceNode` defines its own three-argument `start`, so patching
  // only the base class silently misses every noise-based cue. (That miss cost
  // the T-185 investigation one whole probe run.)
  const protos: (Record<string, (...a: never[]) => unknown> | undefined)[] = [
    (
      window as unknown as {
        OscillatorNode: { prototype: Record<string, (...a: never[]) => unknown> };
      }
    ).OscillatorNode.prototype,
    (
      window as unknown as {
        AudioBufferSourceNode: { prototype: Record<string, (...a: never[]) => unknown> };
      }
    ).AudioBufferSourceNode.prototype,
    (
      window as unknown as {
        AudioScheduledSourceNode?: { prototype: Record<string, (...a: never[]) => unknown> };
      }
    ).AudioScheduledSourceNode?.prototype,
  ];
  for (const proto of protos) {
    if (!proto) continue;
    if (Object.prototype.hasOwnProperty.call(proto, 'start')) {
      const orig = proto.start;
      proto.start = function (this: AudioScheduledSourceNode, ...args: never[]) {
        rec.starts.push({
          id: idOf(this),
          kind: this.constructor.name,
          when: typeof args[0] === 'number' ? args[0] : -1,
          ctxRunning: rec.ctx?.state === 'running',
        });
        return orig.apply(this, args);
      };
    }
    if (Object.prototype.hasOwnProperty.call(proto, 'stop')) {
      const orig = proto.stop;
      proto.stop = function (this: AudioScheduledSourceNode, ...args: never[]) {
        rec.stops.push(idOf(this));
        return orig.apply(this, args);
      };
    }
  }

  // --- node factories: tag params with their owner ---------------------------
  const Base = (
    window as unknown as {
      BaseAudioContext: { prototype: Record<string, (...a: never[]) => unknown> };
    }
  ).BaseAudioContext.prototype;
  const wrap = (name: string, params: string[]) => {
    const orig = Base[name];
    if (!orig) return;
    Base[name] = function (this: BaseAudioContext, ...args: never[]) {
      const node = orig.apply(this, args) as AudioNode;
      const id = idOf(node);
      if (name === 'createGain') rec.gains.set(id, node as GainNode);
      for (const pn of params) {
        const p = (node as unknown as Record<string, AudioParam | undefined>)[pn];
        if (p) {
          (p as unknown as { __sqOwner: number; __sqName: string }).__sqOwner = id;
          (p as unknown as { __sqOwner: number; __sqName: string }).__sqName = pn;
        }
      }
      return node;
    };
  };
  wrap('createGain', ['gain']);
  wrap('createOscillator', ['frequency', 'detune']);
  wrap('createBufferSource', ['playbackRate', 'detune']);
  wrap('createBiquadFilter', ['frequency', 'Q', 'gain']);

  // --- the context itself ----------------------------------------------------
  const Ctor = window.AudioContext;
  class Recorded extends Ctor {
    constructor(...args: never[]) {
      super(...(args as []));
      rec.ctx = this;
      rec.destId = idOf(this.destination);
    }
  }
  (window as unknown as { AudioContext: unknown }).AudioContext = Recorded;
  (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext = Recorded;
};

/** Pull the recorded trace out of the page, resolved into plain data. */
async function trace(page: Page): Promise<AudioTrace> {
  return page.evaluate(() => {
    interface Rec {
      ctx: AudioContext | null;
      starts: { id: number; kind: string; when: number; ctxRunning: boolean }[];
      stops: number[];
      edges: { from: number; to: number }[];
      destId: number;
      enveloped: Map<number, number>;
      gains: Map<number, GainNode>;
    }
    const r = (window as unknown as { __sqAudio: Rec }).__sqAudio;
    return {
      running: r.ctx ? r.ctx.state === 'running' : null,
      currentTime: r.ctx?.currentTime ?? -1,
      starts: r.starts,
      stops: r.stops,
      edges: r.edges,
      destId: r.destId,
      envelopes: [...r.enveloped].map(([id, peak]) => ({ id, peak })),
      // A "bus" is a gain node that was never given an envelope: `sound.ts` sets
      // the four mixer gains directly and only ever `setTargetAtTime`s them.
      buses: [...r.gains]
        .filter(([id]) => !r.enveloped.has(id))
        .map(([id, g]) => ({ id, value: g.gain.value })),
    };
  });
}

/** Does `from` reach `to` along recorded `connect` edges? */
function reaches(t: AudioTrace, from: number, to: number): boolean {
  const seen = new Set<number>([from]);
  const queue = [from];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === to) return true;
    for (const e of t.edges) {
      if (e.from === n && !seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return false;
}

/** Every gain node between `from` and the destination. */
function busesOnPath(t: AudioTrace, from: number): { id: number; value: number }[] {
  return t.buses.filter((b) => reaches(t, from, b.id) && reaches(t, b.id, t.destId));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(RECORDER);
  // A DEFAULT mixer for every test: these assert the shipped defaults produce
  // sound, so a leftover `sq.vol.master=0` from a sibling spec must not decide it.
  await page.addInitScript(() => window.localStorage.clear());
});

test('the AudioContext is running from the first genuine gesture', async ({ page }) => {
  await page.goto('/');

  // Nothing before the gesture — the autoplay policy `sound.ts` documents.
  const cold = await trace(page);
  expect(cold.running, 'a context existed before any user gesture').toBeNull();

  await page.getByTestId('die').first().click();

  const warm = await trace(page);
  expect(warm.running, 'the context did not reach `running` on the first click').toBe(true);
  // The clock must actually be advancing — a `running` context whose time is
  // frozen is the "stuck suspended" failure wearing the right label.
  const t1 = warm.currentTime;
  await page.waitForTimeout(300);
  expect((await trace(page)).currentTime).toBeGreaterThan(t1);
});

test('a click schedules a real signal, with a non-zero envelope, into the destination', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('die').first().click();

  const t = await trace(page);
  expect(t.starts.length, 'the first click started no source node at all').toBeGreaterThan(0);

  // At least one started source must have a non-zero envelope somewhere on a
  // chain that reaches `ctx.destination`. All three halves matter: a source with
  // no envelope is silent, an envelope not connected through is silent, and a
  // chain that stops short of the destination is silent.
  const audible = t.starts.filter((s) => {
    if (!reaches(t, s.id, t.destId)) return false;
    return t.envelopes.some((e) => e.peak > 0.001 && reaches(t, s.id, e.id));
  });
  expect(
    audible.length,
    `no started source had a non-zero envelope on a path to the destination (starts=${t.starts.length}, envelopes=${t.envelopes.length})`,
  ).toBeGreaterThan(0);
});

test('every bus between a cue and the destination is open on the default mixer', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('die').first().click();

  const t = await trace(page);
  const source = t.starts.find((s) => reaches(t, s.id, t.destId));
  expect(source, 'no source reached the destination').toBeTruthy();

  const buses = busesOnPath(t, source!.id);
  // master + sfx at minimum. If this ever reads 0, the classifier broke and the
  // assertion below would pass vacuously — which is the failure mode this guards.
  expect(
    buses.length,
    'found no mixer buses on the path — the trace is not working',
  ).toBeGreaterThan(1);
  for (const b of buses) {
    expect(b.value, `a bus on the path to the destination is at ${b.value}`).toBeGreaterThan(0);
  }
});

test('T-185 regression · the first cue is never scheduled into the past', async ({ page }) => {
  // WHAT THIS IS AND IS NOT. The T-185 investigation suspected that the very
  // first cue was scheduled at a FROZEN `currentTime` (a suspended context's
  // clock does not advance) and therefore silently dropped once the clock
  // started. It measured the opposite: because `sound.ts` constructs the context
  // INSIDE the gesture, Chromium hands back a context that is already `running`,
  // its clock starts at 0, and the first-ever cue rendered a real 0.034 peak.
  // The suspicion was REFUTED — no fix was written for it.
  //
  // This test is what keeps it refuted. Move context construction out of the
  // gesture handler (the obvious "tidy-up" a future task might make) and the
  // context comes back suspended, the clock freezes, and this goes red.
  await page.goto('/');
  await page.getByTestId('die').first().click();

  const t = await trace(page);
  expect(t.starts.length).toBeGreaterThan(0);
  for (const s of t.starts) {
    expect(s.ctxRunning, `a source was scheduled while the context was not running`).toBe(true);
    expect(s.when, 'a source was scheduled at a negative time').toBeGreaterThanOrEqual(0);
  }
});

test('T-185 regression · a plain boot has an ambient bed, with no New Game and no day end', async ({
  page,
}) => {
  // THE BUG (F-185-1). `sound.setDriveHum(true)` had exactly two call sites,
  // `newGame` and `endDay`. Neither is on the path a RETURNING player takes:
  // `init()` and `loadSlot()` both left the bed off, so a captain who booted into
  // their autosave and played a turn heard nothing but sub-100ms blips. A probe
  // tapping `ctx.destination` measured a peak of EXACTLY 0.000 on this path.
  //
  // THIS TEST FAILS AGAINST THE PRE-FIX TREE — that is the point of it. The fix
  // is the `sound.setDriveHum(true)` at `store.ts`'s module scope.
  await page.goto('/');

  // ONE gesture, and nothing else: no New game, no Roll, no end-day. Exactly
  // what a returning player does before they have done anything.
  await page.getByTestId('die').first().click();
  await page.waitForTimeout(500);

  const t = await trace(page);
  const stopped = new Set(t.stops);
  const sustained = t.starts.filter((s) => !stopped.has(s.id) && reaches(t, s.id, t.destId));
  expect(
    sustained.length,
    'nothing sustained is playing on a plain boot — the drive-hum bed never started',
  ).toBeGreaterThan(0);
});

test('T-185 · the score keeps playing on its own, with no further input', async ({ page }) => {
  // The music layer is a scheduler, not a one-shot: after the single unlocking
  // gesture it must keep pushing notes onto the audio clock forever. Counting
  // source starts over a window is the device-independent way to see that — a
  // dead scheduler shows a flat count, and no amount of mixer state can fake it.
  await page.goto('/');
  await page.getByTestId('die').first().click();
  await page.waitForTimeout(600);

  const early = (await trace(page)).starts.length;
  // No clicks, no keys, no state change of any kind in this window.
  await page.waitForTimeout(2500);
  const late = (await trace(page)).starts.length;

  expect(
    late,
    `the score stopped scheduling: ${early} sources at 0.6s, ${late} at 3.1s, with no input between`,
  ).toBeGreaterThan(early);
});

/** How many mood lanes have been faded UP. Each lane is a gain node the score
 *  ramps to exactly 1 when its mood takes over; nothing else in either audio
 *  module ramps a gain to 1, so the count is the number of moods that have
 *  played this session. */
const lanesOpened = (t: AudioTrace): number => t.envelopes.filter((e) => e.peak === 1).length;

test('T-185 · the score changes mood when the scene does', async ({ page }) => {
  // `moodForState` is unit-tested as a pure function. THIS asserts the WIRING:
  // that `store.ts`'s one `music.syncScene(state)` inside `set()` really runs on
  // a real state change, so a mood can move at all. Delete that line and the
  // second lane never opens.
  //
  // Driven entirely through the real UI — a fresh career, the Hangout, a seat
  // opposite Iron Vex and a dealt hand — which is what puts the cockpit in the
  // `table` mood. No store call, no injected state.
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill('1');
  await page.getByRole('button', { name: 'Roll' }).click();
  await page.waitForTimeout(1000);

  const drifting = lanesOpened(await trace(page));
  expect(drifting, 'the score never started on the default mood').toBeGreaterThan(0);

  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();
  await page.locator('[data-testid="hangout-npc"][data-npc-id="npc-iron-vex"]').click();
  await page.getByTestId('dare-wager').fill(String(DARE_MIN_WAGER));
  await page.getByTestId('die').nth(0).click();
  await page.getByTestId('dare-commit').click();
  await expect(page.getByTestId('dare-scene')).toBeVisible();

  // A mood change lands on the NEXT BAR LINE, never mid-phrase — the slowest
  // mood's bar is about 4.6s, so give it two.
  await expect
    .poll(async () => lanesOpened(await trace(page)), { timeout: 20_000, intervals: [500] })
    .toBeGreaterThan(drifting);
});
