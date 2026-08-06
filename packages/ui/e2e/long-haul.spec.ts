import { test, expect } from '@playwright/test';
import {
  assertNonDegenerate,
  emitLonghaulReport,
  runLongHaul,
  skipFirstTurnWalkthrough,
  type LonghaulRun,
} from './support/longhaul';

// ---------------------------------------------------------------------------
// T-162 · THE LONG-HAUL DOM INVARIANT SWEEP — Tier 3.
//
// The bug class this exists for: the *unanticipated* client-side crash deep into
// a career. `docs/TESTING-STRATEGY.md`'s bridge-blind-spot warning (from the UGT
// after-action report's worldbreaker precedent) says a protocol-level tier
// cannot see it by construction, and the 111 scripted specs beside this one
// cannot either — a scripted spec asserts only what its author foresaw.
//
// So this spec asserts NOTHING about the story. It plays a randomized-but-legal
// career through the real DOM for at least thirty in-game days and holds eight
// blanket invariants after every single action (`support/longhaul-invariants.ts`,
// proven against seeded-bad fixtures in `long-haul-invariants.spec.ts`).
//
// NOT TAGGED `@tour-one`. `e2e/support/flake.ts` scopes the 20-run flake gate to
// that tag, and `playwright.config.ts` is explicit that a gate whose threshold is
// a RATE must not have its denominator moved by an unrelated task.
//
// CADENCE (see `docs/playtests/T-162-dom-longhaul.md` §4): the CI default is ONE
// seed × 30 days, inside the existing `e2e` job, because the failure this
// watches for is a REGRESSION — a client crash introduced today should fail
// today's build, not a nightly. Seed BREADTH is bought on demand instead:
//   LONGHAUL_SEEDS=1,2,3,4,5 LONGHAUL_DAYS=35 npm run test:e2e:longhaul -w @spacerquest/ui
// ---------------------------------------------------------------------------

const SEEDS = (process.env.LONGHAUL_SEEDS ?? '1')
  .split(',')
  .map((s) => Number.parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0);

const DAYS = Math.max(30, Number.parseInt(process.env.LONGHAUL_DAYS ?? '30', 10) || 30);

test.describe.configure({ mode: 'parallel' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // T-187 · This spec is NOT testing the first-time flow — retire the scripted
  // first-turn walkthrough before the app boots, or its rails would make the
  // panes below inert. See `support/career.ts`.
  await skipFirstTurnWalkthrough(page);
});

for (const seed of SEEDS) {
  test(`long-haul · seed ${seed} · ≥${DAYS} days through the real DOM`, async ({
    page,
  }, testInfo) => {
    // A long-haul run is minutes, not seconds; the suite-wide 60s budget is for
    // scripted specs. Stated here rather than in the config so the exception is
    // scoped to this file.
    test.setTimeout(900_000);

    let run: LonghaulRun | null = null;
    try {
      run = await runLongHaul(page, { gameSeed: seed, targetDays: DAYS });
    } finally {
      // The artifact is written even when the run goes red — a failing long-haul
      // report is exactly the one worth reading.
      if (run !== null) await emitLonghaulReport(testInfo, run);
    }

    // Unreachable unless `runLongHaul` returned without assigning — kept so the
    // narrowing below is a real check rather than a non-null assertion.
    if (run === null) throw new Error('the long-haul driver produced no run report');

    expect(
      run.violations,
      'invariant violations (each carries the name of the claim it broke):\n' +
        run.violations
          .map((v) => `  step ${v.step} · day ${v.day ?? '?'} · ${v.invariant} · ${v.detail}`)
          .join('\n'),
    ).toEqual([]);
    assertNonDegenerate(run);
  });
}
