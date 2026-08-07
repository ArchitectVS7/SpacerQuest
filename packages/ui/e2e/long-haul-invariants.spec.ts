import { test, expect } from '@playwright/test';
import {
  evaluateInvariants,
  INVARIANTS_PER_STEP,
  LONGHAUL_INVARIANTS,
  type CockpitSnapshot,
  type InvariantName,
  type StepContext,
} from './support/longhaul-invariants';

// ---------------------------------------------------------------------------
// T-162 · Proving the long-haul battery catches what it claims to catch.
//
// The T-153 discipline, applied to Tier 3: a mechanism that claims to catch
// regressions is not shipped on its author's word — it is shown catching one,
// from a SEEDED-BAD fixture, in a committed, re-runnable check. Each case below
// is exactly ONE named mutation off a clean baseline, and asserts three things:
//   (i)   the invariant under test fires;
//   (ii)  every violation returned carries THAT invariant's own name;
//   (iii) exactly one invariant fires — a check that trips its neighbours is a
//         check whose failures cannot be read.
// Plus a totality guard, so a ninth invariant added to `LONGHAUL_INVARIANTS`
// and never wired fails HERE rather than silently never running.
//
// FIRST_RUN_WALKTHROUGH: not-virgin — this is a pure invariant fixture suite.
//
// NO BROWSER. This spec never touches the `page` fixture, so Playwright never
// launches Chromium for it: the battery is a pure function and is tested as one.
// It lives in `e2e/` rather than `src/` because `packages/ui/vitest.config.ts`
// deliberately scopes vitest to `src/**/*.test.ts` (keeping the two runners
// apart) and the evaluator must not ship inside the web bundle.
// ---------------------------------------------------------------------------

function cleanSnapshot(overrides: Partial<CockpitSnapshot> = {}): CockpitSnapshot {
  return {
    day: 4,
    credits: 12_500,
    fuel: '180/240',
    dockedAt: 'Sol-3',
    debt: 'DEBT 25,000 · DUE D30',
    spentDice: 2,
    totalDice: 5,
    present: { 'end-day': 1, hand: 1, 'crash-screen': 0, 'starmap-system': 14, contract: 3 },
    enabled: { 'end-day': 1, contract: 3 },
    modalOwner: null,
    // SYNTHETIC FIXTURE DATA, not a live DOM read: these two rows exist to feed
    // the evaluator a shaped `disabledControls` list, and the strings are opaque
    // to it. T-196c freed `buy-fuel`, so the cockpit no longer emits the first
    // reason — the fixture keeps it because what is under test here is the
    // evaluator's handling of a disabled control WITH a reason, not the reason's
    // wording. (Left deliberately; changing it would prove nothing.)
    disabledControls: [
      {
        testid: 'buy-fuel',
        index: 0,
        reason: 'Pick a die first, then buy fuel',
        reasonSource: 'title',
      },
      {
        testid: 'explore-sweep',
        index: 0,
        reason: 'Pick a die to sweep',
        reasonSource: 'own-text',
      },
    ],
    suspiciousText: [],
    digest: 'a1b2c3d4',
    noticeText: null,
    ...overrides,
  };
}

function cleanContext(overrides: Partial<StepContext> = {}): StepContext {
  const before = cleanSnapshot();
  return {
    step: 17,
    actionLabel: 'buy-fuel',
    trialPassed: true,
    careerRestart: false,
    consoleErrors: [],
    pageErrors: [],
    before,
    // The clean step MOVED the cockpit (a different digest, a day one later is
    // NOT asserted here — only `end-day` advances the day, and this step did not).
    after: cleanSnapshot({ digest: 'e5f6a7b8', credits: 11_300, fuel: '240/240', spentDice: 3 }),
    ...overrides,
  };
}

test('the clean baseline step yields zero violations', () => {
  expect(evaluateInvariants(cleanContext())).toEqual([]);
});

/** Each seeded-bad fixture: one named mutation, and the one invariant it must trip. */
const SEEDED_BAD: { name: InvariantName; mutation: string; ctx: () => StepContext }[] = [
  {
    name: 'inv_no_uncaught_exception',
    mutation: 'the step recorded an uncaught TypeError',
    ctx: () =>
      cleanContext({
        pageErrors: ["TypeError: Cannot read properties of undefined (reading 'fuel')"],
      }),
  },
  {
    name: 'inv_no_console_error',
    mutation: 'the step logged a console error',
    ctx: () =>
      cleanContext({
        consoleErrors: ['The above error occurred in the <Starmap> component'],
      }),
  },
  {
    name: 'inv_no_crash_screen',
    mutation: "the ErrorBoundary's crash screen mounted",
    ctx: () => {
      const ctx = cleanContext();
      return {
        ...ctx,
        after: { ...ctx.after, present: { ...ctx.after.present, 'crash-screen': 1 } },
      };
    },
  },
  {
    name: 'inv_cockpit_reachable',
    mutation: 'end-day vanished with no screen owning the view',
    ctx: () => {
      const ctx = cleanContext();
      return {
        ...ctx,
        after: { ...ctx.after, present: { ...ctx.after.present, 'end-day': 0 } },
      };
    },
  },
  {
    name: 'inv_no_dead_affordance',
    mutation: 'the clicked control left the digest untouched',
    ctx: () => {
      const ctx = cleanContext();
      return { ...ctx, after: { ...ctx.after, digest: ctx.before.digest } };
    },
  },
  {
    name: 'inv_blocked_shows_reason',
    mutation: 'a disabled control offers no reason at all',
    ctx: () => {
      const ctx = cleanContext();
      return {
        ...ctx,
        after: {
          ...ctx.after,
          disabledControls: [
            ...ctx.after.disabledControls,
            { testid: 'repair-all', index: 0, reason: null, reasonSource: null },
          ],
        },
      };
    },
  },
  {
    name: 'inv_no_placeholder_text',
    mutation: 'the fuel readout rendered NaN',
    ctx: () => {
      const ctx = cleanContext();
      return {
        ...ctx,
        after: {
          ...ctx.after,
          suspiciousText: [{ where: 'fuel-hold', token: 'NaN', snippet: 'HOLD NaN/240' }],
        },
      };
    },
  },
  {
    name: 'inv_day_monotonic',
    mutation: 'the day went backwards',
    ctx: () => {
      const ctx = cleanContext();
      return { ...ctx, after: { ...ctx.after, day: 3 } };
    },
  },
];

for (const bad of SEEDED_BAD) {
  test(`seeded bad · ${bad.name} fires when ${bad.mutation}`, () => {
    const violations = evaluateInvariants(bad.ctx());
    expect(
      violations.length,
      `${bad.name} did not fire on its own seeded-bad fixture`,
    ).toBeGreaterThan(0);
    // (ii) every violation carries ITS OWN name — the `gate.ts` discipline.
    for (const v of violations) expect(v.invariant).toBe(bad.name);
    // (iii) exactly one invariant fired: a check that trips its neighbours
    // produces failures nobody can read.
    expect(new Set(violations.map((v) => v.invariant)).size).toBe(1);
    // The violation is self-describing: step, action and day ride along.
    for (const v of violations) {
      expect(v.step).toBe(17);
      expect(v.actionLabel).toBe('buy-fuel');
      expect(v.detail.length).toBeGreaterThan(0);
    }
  });
}

test('the battery is total — every declared invariant has a seeded-bad proof', () => {
  const declared = LONGHAUL_INVARIANTS.map((i) => i.name).sort();
  const proven = SEEDED_BAD.map((b) => b.name).sort();
  expect(
    proven,
    'an invariant declared in LONGHAUL_INVARIANTS with no seeded-bad fixture is an invariant ' +
      'nothing proves runs — add the fixture, do not shrink the array',
  ).toEqual(declared);
  expect(new Set(declared).size, 'invariant names must be unique').toBe(declared.length);
  expect(INVARIANTS_PER_STEP).toBe(declared.length);
  // Every claim is a real sentence — the run report renders these verbatim.
  for (const invariant of LONGHAUL_INVARIANTS) {
    expect(invariant.claim.length).toBeGreaterThan(20);
  }
});

test('a step the driver did not dispatch is exempt from the dead-affordance claim', () => {
  // Non-vacuity of the exemption itself: with `trialPassed: false` an unchanged
  // digest is legal (the driver only READ the cockpit), but every OTHER claim
  // still runs — proven by keeping a crash mounted in the same fixture.
  const ctx = cleanContext({ trialPassed: false });
  const unchanged = { ...ctx, after: { ...ctx.after, digest: ctx.before.digest } };
  expect(evaluateInvariants(unchanged)).toEqual([]);

  const alsoCrashed = {
    ...unchanged,
    after: { ...unchanged.after, present: { ...unchanged.after.present, 'crash-screen': 1 } },
  };
  expect(evaluateInvariants(alsoCrashed).map((v) => v.invariant)).toEqual(['inv_no_crash_screen']);
});

test('a declared career restart exempts the day reset and nothing else', () => {
  const restart = cleanContext({ careerRestart: true, actionLabel: 'ending-return' });
  const reset = { ...restart, after: { ...restart.after, day: 1 } };
  expect(evaluateInvariants(reset)).toEqual([]);

  // Without the declaration the same reset IS a violation — so the exemption is
  // a driver statement of intent, never a silent swallow.
  const undeclared = { ...reset, careerRestart: false };
  expect(evaluateInvariants(undeclared).map((v) => v.invariant)).toEqual(['inv_day_monotonic']);
});

test('a screen that owns the view exempts the cockpit-reachable claim', () => {
  const ctx = cleanContext();
  const ended: StepContext = {
    ...ctx,
    after: {
      ...ctx.after,
      modalOwner: 'ending-screen',
      present: { ...ctx.after.present, 'end-day': 0, hand: 0, 'ending-screen': 1 },
    },
  };
  expect(evaluateInvariants(ended)).toEqual([]);
});
