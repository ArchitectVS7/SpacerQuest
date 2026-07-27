// ---------------------------------------------------------------------------
// T-1605c · LONG-CAREER RESPONSIVENESS.
//
// The task's headline is "1,000-day event logs must stay loadable and
// responsive". The LOADABLE half is asserted in
// packages/engine/src/__tests__/save-perf.test.ts. This file is the RESPONSIVE
// half — the per-day cost of actually PLAYING a 1,000-day career, which is the
// part that was genuinely broken.
//
// WHAT WAS BROKEN. `packages/engine/src/clone.ts` exists specifically so that a
// copy-on-write resolver does not deep-copy the unbounded `eventLog` on every
// action; its own docstring records that a plain `JSON.parse(JSON.stringify(
// state))` makes "a day cost O(days-so-far) and a career cost O(days^2)". Six
// resolvers were never migrated to it (trade, travel, crew x2, exploration,
// hangout, port), so every player verb still serialized the whole log.
//
// MEASURED BOTH WAYS on this working tree — same driver, same policy/seed
// (`veteran` / 7), same 1,000 days, once with the six sites reverted and once
// with them fixed (Windows 10, Node 22.16):
//
//     days           BEFORE          AFTER
//     1-100           6.3 ms/day      1.6 ms/day
//     301-400        77.3 ms/day      3.5 ms/day
//     601-700       143.4 ms/day      5.5 ms/day
//     901-1000      206.7 ms/day      8.6 ms/day
//     career        107.2 s           4.7 s          (23x)
//
// The BEFORE column is the O(days^2) signature in the open: per-day cost grows
// with the log while the AFTER column stays flat-ish (the residual growth is the
// real per-day work, not the clone).
//
// IT IS A PURE COST CHANGE, not a behaviour change — which is what the
// rebalance-fallout rule actually cares about. Both runs produced the SAME
// 94,054-event log, and `sha256(createSave(...))` over 6 policies x 2 seeds x
// 120 days (12 careers) is byte-identical across the fix. No golden moved.
//
// WHY THE BUDGET IS 60 s. It has to sit strictly between the two measurements so
// it separates RED from GREEN on evidence rather than on taste: 13x above the
// fixed cost (4.7 s) and 1.8x below the broken cost (107.2 s). That is wide
// enough that ordinary CI-runner noise cannot reach it (the same run inside a
// fully parallel `vitest run` took 6.6 s), and narrow enough that reintroducing
// the O(days^2) clone anywhere in the action path fails here.
//
// WHY THIS IS NOT THE ONLY GUARD. A wall-clock assertion on a shared runner is a
// flake risk, so the same claim also has a DETERMINISTIC backstop in
// `packages/engine/src/__tests__/clone.test.ts`: an identity table proving every
// verb preserves pre-existing log entries by object identity (only possible if
// the log is pointer-copied), plus a source scan that fails any resolver
// containing a raw `JSON.parse(JSON.stringify(state))`. If this file ever has to
// be quarantined for noise, the fix stays protected.
//
// PURITY: `performance.now()` is used HERE, in a sim test. The engine's
// production code gains no clock — standing constraint 1 is untouched.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { veteranPolicy } from '../index.js';
import { driveCompetentCampaign } from './support/campaign-drivers.js';

const SEED = 7;
const DAYS = 1_000;
/** See "WHY THE BUDGET IS 60 s" above: 4.7 s fixed, 107.2 s broken. */
const CAREER_BUDGET_MS = 60_000;

describe('T-1605c · 1,000-day careers stay responsive', () => {
  it('drives a full 1,000-day veteran career inside the per-career budget', () => {
    const start = performance.now();
    const state = driveCompetentCampaign(veteranPolicy, SEED, DAYS);
    const elapsedMs = performance.now() - start;

    // NON-VACUITY. Without these, a policy or driver change that quietly ends
    // the career early (succession loop, terminal guard) would turn this into
    // a fast green test that measures a 50-day run.
    expect(state.day).toBe(DAYS + 1);
    expect(state.eventLog.length).toBeGreaterThan(50_000);

    console.log(
      `[T-1605c] ${DAYS}-day veteran career (seed ${SEED}): ` +
        `${(elapsedMs / 1000).toFixed(1)}s, ${(elapsedMs / DAYS).toFixed(2)} ms/day, ` +
        `${state.eventLog.length} events`,
    );

    expect(
      elapsedMs,
      `a ${DAYS}-day career took ${(elapsedMs / 1000).toFixed(1)}s ` +
        `(${(elapsedMs / DAYS).toFixed(2)} ms/day) against a ${CAREER_BUDGET_MS / 1000}s ` +
        `budget — the usual cause is a resolver deep-copying the eventLog ` +
        `instead of calling cloneState (see engine clone.ts / clone.test.ts)`,
    ).toBeLessThan(CAREER_BUDGET_MS);
  }, 120_000);
});
