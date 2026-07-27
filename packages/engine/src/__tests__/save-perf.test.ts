import { describe, expect, it } from 'vitest';
import { createSave, loadSave } from '../save.js';
import { advanceDay } from '../day.js';
import { createInitialState } from '../state.js';
import { GameEvent, GameState } from '../types.js';

// ===========================================================================
// T-1605c · THE LONG-CAREER LOAD BUDGET.
//
// Accept: "a 1,000-day save loads <2s (asserted in a committed test with the
// measurement method documented); no load-time regression for normal-size
// saves."
//
// ---------------------------------------------------------------------------
// MEASUREMENT METHOD (this is the documentation the Accept asks for; it lives
// here, next to the code that performs it, not only in the commit message).
//
//  1. FIXTURE — built in-process from a fixed seed by running the real day loop.
//     No committed blob (a 1,000-day save is ~11 MB), no fs, no network, no
//     `Math.random`, no `Date`: the whole log is a function of SEED, so the
//     fixture is byte-reproducible on every machine and in CI.
//  2. WARM-UP — one `loadSave` whose timing is DISCARDED. The first call pays
//     JIT compilation and inline-cache warm-up and measured ~169 ms against
//     ~116/122 ms for the two calls after it; including it would report the
//     compiler, not the loader.
//  3. SAMPLES — 7 timed runs, each bracketed by `performance.now()`. Monotonic
//     by construction, unlike `Date.now()`, which can step backwards under NTP
//     correction mid-sample.
//  4. STATISTIC — the MEDIAN is compared against the budget; min/max ride along
//     in the failure message so a CI failure is diagnosable as drift vs. a
//     single descheduled sample rather than being re-run blind.
//
//  PURITY: `performance.now()` is used HERE, in a test. Standing constraint 1
//  ("engine must stay pure — no DOM/I/O/Math.random/Date") governs the engine's
//  production code under packages/engine/src, and no engine module gains a clock
//  from this task. The measured code path (`createSave` / `loadSave` / the day
//  loop) stays clock-free.
//
// ---------------------------------------------------------------------------
// MEASURED, so a future reader can tell drift from noise. Windows 10 / Node
// 22.16, this working tree, seed 20250726:
//
//     save            events    bytes      loadSave median   per event
//     30-day           2,741     0.35 MiB      2.3 ms        0.84 us
//     1,000-day       89,599    10.93 MiB     84.5 ms        0.94 us
//                                             (budget 2,000 ms)
//
// The budget is met with ~24x headroom, and JSON.parse plus the zod
// discriminated-union walk of the whole log is essentially all of it. Note that
// load cost is very nearly LINEAR in event count already (0.94 vs 0.84 us per
// event across a 33x size difference) — which is the property assertion (b)
// below is really protecting.
//
// This test is therefore a GUARD, not a fix: it exists so that a future change
// which makes loading super-linear in log length (a nested scan, a per-event
// `find`, a migration that rebuilds the log) fails here instead of on a
// player's 1,000-day career.
//
// The responsiveness half of T-1605c — the per-DAY cost of a long career, which
// really was broken — is asserted separately in
// packages/sim/src/__tests__/long-career-perf.test.ts, with a deterministic
// backstop in __tests__/clone.test.ts.
// ===========================================================================

const SEED = 20250726;
const LONG_CAREER_DAYS = 1_000;
const NORMAL_CAREER_DAYS = 30;

/**
 * A career of `days` days, generated from SEED with the real day loop.
 *
 * WHY A WAIT-ONLY CAREER IS A FAIR FIXTURE FOR A *LOAD* BUDGET: `loadSave` cost
 * is a function of byte count and event count only — `JSON.parse` and the zod
 * discriminated union walk the same array regardless of which verb produced each
 * entry. A `Wait` day is not an empty day either: the living galaxy still runs
 * (NPC days, the wire, era ticks, storylet offers, dusk upkeep), which is why
 * 1,000 Wait-days still produce ~89,000 events across many event types — both
 * asserted below, so this can never silently degrade into measuring a small
 * save. A realistic verb mix is exercised by the sim's long-career test instead.
 */
function career(days: number): GameState {
  let state = createInitialState(SEED);
  for (let day = 0; day < days; day += 1) {
    state = advanceDay(state, [{ type: 'Wait' }]).state;
  }
  return state;
}

interface LoadSample {
  readonly median: number;
  readonly min: number;
  readonly max: number;
}

/** Step 2–4 of the documented method: one discarded warm-up, 7 timed runs, take
 *  the median. Returns milliseconds. */
function measureLoad(json: string, runs = 7): LoadSample {
  loadSave(json); // warm-up — timing deliberately discarded (see step 2).

  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now();
    loadSave(json);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return {
    median: samples[Math.floor(samples.length / 2)],
    min: samples[0],
    max: samples[samples.length - 1],
  };
}

function distinctEventTypes(log: readonly GameEvent[]): number {
  return new Set(log.map((event) => event.type)).size;
}

describe('T-1605c · long-career save load budget', () => {
  it('loads a 1,000-day save well inside 2s, with no per-event regression against a normal save', () => {
    const long = career(LONG_CAREER_DAYS);
    const normal = career(NORMAL_CAREER_DAYS);

    const longJson = createSave(long, SEED);
    const normalJson = createSave(normal, SEED);

    // -- NON-VACUITY -------------------------------------------------------
    // Without these, a future regression that silently shortens the log (a
    // truncating migration, a capped wire) would turn this into a green test
    // that measures nothing.
    expect(long.day).toBe(LONG_CAREER_DAYS + 1);
    expect(long.eventLog.length).toBeGreaterThan(50_000);
    expect(longJson.length).toBeGreaterThan(8 * 1024 * 1024);
    // A Wait-only career is still the living galaxy, not a dead log.
    expect(distinctEventTypes(long.eventLog)).toBeGreaterThanOrEqual(8);
    expect(normal.day).toBe(NORMAL_CAREER_DAYS + 1);
    expect(normal.eventLog.length).toBeGreaterThan(500);

    const longLoad = measureLoad(longJson);
    const normalLoad = measureLoad(normalJson);

    // Recorded for the human reading a CI log, not asserted beyond the
    // budgets below.
    console.log(
      `[T-1605c] ${LONG_CAREER_DAYS}-day: ${long.eventLog.length} events, ` +
        `${(longJson.length / 1024 / 1024).toFixed(2)} MiB, load median ` +
        `${longLoad.median.toFixed(1)}ms (min ${longLoad.min.toFixed(1)} / max ` +
        `${longLoad.max.toFixed(1)})\n` +
        `[T-1605c] ${NORMAL_CAREER_DAYS}-day: ${normal.eventLog.length} events, ` +
        `${(normalJson.length / 1024).toFixed(0)} KiB, load median ` +
        `${normalLoad.median.toFixed(1)}ms (min ${normalLoad.min.toFixed(1)} / max ` +
        `${normalLoad.max.toFixed(1)})`,
    );

    // -- (a) THE ACCEPT'S BUDGET ------------------------------------------
    // Measured ~85 ms; the budget is 2,000 ms.
    expect(
      longLoad.median,
      `1,000-day save load median ${longLoad.median.toFixed(1)}ms exceeded the 2000ms budget ` +
        `(min ${longLoad.min.toFixed(1)}ms / max ${longLoad.max.toFixed(1)}ms, ` +
        `${long.eventLog.length} events, ${longJson.length} bytes)`,
    ).toBeLessThan(2_000);

    // -- (b) NO REGRESSION FOR NORMAL-SIZE SAVES --------------------------
    // A Tour One-length save is what nearly every load actually is. Measured
    // 2.3 ms; the ceiling is deliberately generous because a shared CI runner
    // is noisy at single-millisecond scale.
    expect(
      normalLoad.median,
      `${NORMAL_CAREER_DAYS}-day save load median ${normalLoad.median.toFixed(1)}ms exceeded ` +
        `the 250ms normal-save ceiling`,
    ).toBeLessThan(250);

    // ...and the part that actually says "no regression": per-event load cost
    // must not blow up with log length. Measured today it is essentially flat
    // across a 33x size difference — 0.94 us/event at 89,599 events vs
    // 0.84 us/event at 2,741 (ratio 1.1 run alone; 1.3 with the whole suite
    // running in parallel, which loads the big sample harder than the small
    // one). The 4x ceiling is set for that noise, not because the assertion is
    // weak: a genuine super-linear term (a nested scan, a per-event `find`, a
    // migration that rebuilds the log) costs ~33x per event over this same 33x
    // size step, so it blows through 4x by an order of magnitude.
    const longPerEventUs = (longLoad.median * 1_000) / long.eventLog.length;
    const normalPerEventUs = (normalLoad.median * 1_000) / normal.eventLog.length;
    expect(
      longPerEventUs,
      `per-event load cost went super-linear: ${longPerEventUs.toFixed(2)}us/event at ` +
        `${long.eventLog.length} events vs ${normalPerEventUs.toFixed(2)}us/event at ` +
        `${normal.eventLog.length} events`,
    ).toBeLessThan(normalPerEventUs * 4);

    // -- (c) STANDING CONSTRAINT 3 — JSON ROUND-TRIP ----------------------
    // T-1605c adds no GameState field and no new event shape, so
    // CURRENT_SAVE_VERSION stays 8 and no MIGRATIONS entry is owed (same
    // reasoning as T-1604b / T-1605b). The round-trip still ships in this
    // commit, and at the largest size the game can produce: a 1,000-day save
    // must come back deep-equal, seed included.
    const reloaded = loadSave(longJson);
    expect(reloaded.seed).toBe(SEED);
    expect(reloaded.state).toEqual(long);
    // Timeout below: the 1,000-day fixture alone takes ~2 s to generate and
    // vitest's default timeout is 5 s. Explicit per-test timeouts are the
    // convention here (poverty-invariant.test.ts uses 60_000 / 120_000).
  }, 60_000);
});
