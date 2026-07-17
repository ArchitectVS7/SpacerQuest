import { createSave, loadSave } from '@spacerquest/engine';
import { describe, expect, it } from 'vitest';
import { traderPolicy } from '../index.js';
import { driveCompetentCampaign } from './support/campaign-drivers.js';

// ---------------------------------------------------------------------------
// T-1605 · Save load-time performance pass (acceptance: "a 1,000-day save loads
// < 2s"). Drives a REALISTIC 1,000-day trader career through the real engine so
// the append-only `eventLog` reaches full-campaign scale (~thousands of typed
// events — the per-element zod discriminated-union validation on load is the cost
// surface, schema.ts GameEventSchema), serializes it with the engine's `createSave`,
// then times `loadSave` on that blob.
//
// DISPOSITION (matches T-1603): this pass MEASURES FIRST. Load is already well
// under budget, so the test RATIFIES current performance and locks it in — it does
// NOT truncate or segment the eventLog (that would change game semantics — deeds /
// legacy reconstruct from the full log, state.ts). The budget is a hard ceiling
// with wide margin so it is not CI-flaky; a soft warn fires far earlier.
//
// `performance.now()` lives only in this TEST — the engine stays pure (no Date /
// timers in engine code). The test also asserts the load round-trips at scale
// (day + eventLog length preserved), so it doubles as a large-save correctness check.
// ---------------------------------------------------------------------------

const LOAD_BUDGET_MS = 2000; // acceptance ceiling
const LOAD_WARN_MS = 1000; // soft warn well under the ceiling

describe('T-1605 · 1,000-day save load performance', () => {
  it('loads a 1,000-day driven career in under 2s and round-trips it', () => {
    const seed = 424242;
    const days = 1000;

    // Drive a real competent career so the save is representative — a full
    // eventLog, ledger, charts, reputation, the works — not a synthetic blob.
    const state = driveCompetentCampaign(traderPolicy, seed, days);
    expect(state.day).toBeGreaterThan(days - 5); // the drive actually reached ~1,000 days
    const logLength = state.eventLog.length;
    expect(logLength).toBeGreaterThan(days); // an append-only log at real campaign scale

    const blob = createSave(state, seed);

    const start = performance.now();
    const loaded = loadSave(blob);
    const elapsed = performance.now() - start;

    // Correctness at scale: the load round-trips the day and the full event log
    // (no truncation) — so this perf test also proves the large save loads intact.
    expect(loaded.state.day).toBe(state.day);
    expect(loaded.state.eventLog.length).toBe(logLength);
    expect(loaded.seed).toBe(seed);

    console.log(
      `[T-1605 save-perf] loadSave of a ${days}-day career (${logLength} events) took ${elapsed.toFixed(1)}ms (budget ${LOAD_BUDGET_MS}ms)`,
    );
    if (elapsed > LOAD_WARN_MS) {
      console.warn(
        `[T-1605 save-perf] loadSave took ${elapsed.toFixed(1)}ms — over the ${LOAD_WARN_MS}ms soft warn (still under the ${LOAD_BUDGET_MS}ms budget)`,
      );
    }

    expect(elapsed).toBeLessThan(LOAD_BUDGET_MS);
    // Generous test timeout below: the 1,000-day DRIVE (not the measured load)
    // dominates wall time and must not race the default 5s vitest timeout.
  }, 120_000);
});
