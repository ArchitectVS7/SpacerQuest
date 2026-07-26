import { test, expect, type Page } from '@playwright/test';
import {
  acknowledgeResolution,
  createReport,
  debtOutstanding,
  emitReport,
  expectPlayableCockpit,
  playDay,
  sightseeingPass,
  startCareer,
  GUILD_MARKER,
  type RunReport,
} from './support/career';

// ---------------------------------------------------------------------------
// T-1602a · TOUR ONE, START TO RESOLUTION, THROUGH THE REAL COCKPIT.
//
// Tour One has been exercised piecemeal for a long time — `onboarding.spec.ts`
// reaches the day-31 ceremony, but it gets there by BOOTING A FABRICATED DAY-30
// SAVE (`bootDay30`). That fixture is legitimate for what T-311 proves and is
// deliberately left untouched. What has never existed is the run itself: day 1
// to the resolution ceremony with every single step a player keystroke or click.
// This is that run.
//
// There is no `createInitialState`, no `createSave`, no `startDay`, no
// `page.evaluate` into the store and no localStorage seeding anywhere in this
// spec or in `support/career.ts` — not even a type import from the engine. The
// career starts at the New game button and ends at the ceremony's Acknowledge.
//
// Both tests play the SAME seed with the SAME driver and differ by EXACTLY ONE
// player decision: whether the Guild marker gets paid through the Port Ledger on
// day 30. Both assert the day-30 bankroll cleared 25,000cr, so the unpaid run is
// a pilot's choice rather than a poorer second fixture.
//
// ---------------------------------------------------------------------------
// SEED PROVENANCE — pinned 2026-07-26
// ---------------------------------------------------------------------------
// Swept seeds 1..40 over a 30-day horizon with THIS driver's decision rules
// (contract picker, fuel policy, RUN/TALK stance policy, one nav retry), because
// a pin backed by a different policy is not backed at all: the engine's rng is a
// pure function of `rngState` + the count of actions already resolved, so the
// action stream IS the seed.
//
//   qualifying (day-30 bank ≥ 25,000cr, ship survived, no succession): 11 of 40
//   pinned: seed 21 — 57,846cr banked on day 30 (2.3× the 25,000cr marker),
//           28 deliveries, 6 encounters, 0 nav failures, 2 idle days, 0 ship
//           losses. Chosen over the higher-banking seed 29 (59,572cr) because 21
//           takes six interceptions instead of one and so actually exercises the
//           driver's combat branch.
//
// THE PIN DEPENDS ON `support/career.ts` BYTE FOR BYTE. Changing a decision rule,
// a tiebreak, or the ORDER of rng-perturbing clicks invalidates it. Re-hunt the
// seed; do not patch the assertion down.
//
// FALLOUT OWNER: if a later economy or content pass (T-1603b and friends) drops
// seed 21's day-30 bank below 25,000cr, re-pinning this seed is that task's job
// under the rebalance-fallout rule — not a licence to weaken the gate here.
// ---------------------------------------------------------------------------

const TOUR_ONE_SEED = 21;
const TOUR_ONE_DAYS = 30;

// A 30-day career is a few hundred real interactions; the 30s default would kill
// it well before the ceremony. Budget ~2x the measured wall clock.
test.setTimeout(300_000);
test.describe.configure({ mode: 'parallel' });

test.beforeEach(async ({ page }) => {
  // Settle the dawn-roll scramble so a die's displayed face equals its dealt
  // value the instant it is read, and kill the coach fade (the same pattern the
  // dawn-hand / combat / onboarding specs use).
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Play the whole Tour, day 1 through dusk of day 30, and hand back the report. */
async function flyTourOne(page: Page, branch: 'cleared' | 'unpaid'): Promise<RunReport> {
  const report = createReport(branch, TOUR_ONE_SEED);
  const started = Date.now();

  await startCareer(page, TOUR_ONE_SEED, report);
  // Day 1 opens at Sun-3, the only Tour One Hangout — the one day every screen
  // is reachable at once. Every click in here is rng-free, so the tour is free.
  await sightseeingPass(page, report);

  for (let day = 1; day <= TOUR_ONE_DAYS; day += 1) {
    const played = await playDay(page, { payMarker: branch === 'cleared', report });
    expect(played, 'the career must advance exactly one day per playDay').toBe(day);
  }

  report.wallClockMs = Date.now() - started;
  return report;
}

// T-1602b · Both tests carry the `@tour-one` tag so the flake gate can measure
// exactly the suite its acceptance names (see e2e/support/flake.ts). A title/tag
// change is RNG-FREE — it adds no click and moves no engine action — so it
// cannot disturb the seed-21 pin above.
test(
  'a full Tour One career clears the Guild marker and opens the veteran lanes',
  { tag: '@tour-one' },
  async ({ page }, testInfo) => {
    const report = await flyTourOne(page, 'cleared');

    // Dusk of day 30 FORCES the resolution; the ceremony surfaces at dawn of 31.
    await expect(page.getByTestId('day')).toHaveText('31');

    const ceremony = page.getByTestId('resolution-ceremony');
    await expect(ceremony).toBeVisible();
    await expect(ceremony).toHaveAttribute('data-outcome', 'cleared');
    await expect(page.getByTestId('resolution-rank')).toBeVisible();
    await expect(page.getByTestId('resolution-deed')).toContainText('Tour One Complete');
    await expect(page.getByTestId('veteran-unlocked')).toBeVisible();
    await expect(page.getByTestId('resolution-consequence')).toHaveCount(0);
    // The marker is gone from the bezel because the player discharged it on day 30
    // through the Port Ledger — not because the ceremony wrote it off.
    await expect(page.getByTestId('debt-chip')).toHaveCount(0);
    // T-1301's dusk-of-day-30 era flip, asserted for the first time on the only
    // surface a player can see it on.
    await expect(page.getByTestId('campaign-era')).toHaveText('Veteran');

    await acknowledgeResolution(page, report);
    await expectPlayableCockpit(page);
    await expect(page.getByTestId('debt-chip')).toHaveCount(0);

    expect(report.resolution?.outcome).toBe('cleared');
    expect(report.resolution?.veteranUnlocked).toBe(true);
    expect(report.resolution?.deedTitle).toBe('Tour One Complete');
    expect(report.resolution?.eraAfter).toBe('Veteran');
    expect(report.totals.debtFinal).toBe(0);
    expect(report.totals.deliveries).toBeGreaterThan(0);
    expect(report.totals.encounters).toBeGreaterThan(0);
    expect(report.totals.day30Bankroll).toBeGreaterThanOrEqual(GUILD_MARKER);
    // The career really did walk the cockpit, and really did fight and finish.
    expect(report.screensVisited).toEqual(
      expect.arrayContaining([
        'starmap',
        'manifest-board',
        'port-ledger',
        'records-registry',
        'hangout',
        'settings',
        'wire-log',
        'route-preview',
        'combat',
        'resolution-ceremony',
      ]),
    );

    await emitReport(testInfo, report);
  },
);

test(
  'the same career, marker unpaid: the resolution files it and the debt rides on',
  { tag: '@tour-one' },
  async ({ page }, testInfo) => {
    const report = await flyTourOne(page, 'unpaid');

    await expect(page.getByTestId('day')).toHaveText('31');

    const ceremony = page.getByTestId('resolution-ceremony');
    await expect(ceremony).toBeVisible();
    await expect(ceremony).toHaveAttribute('data-outcome', 'unpaid');
    await expect(page.getByTestId('resolution-rank')).toBeVisible();
    await expect(page.getByTestId('resolution-consequence')).toBeVisible();
    await expect(page.getByTestId('veteran-unlocked')).toHaveCount(0);
    await expect(page.getByTestId('resolution-deed')).toHaveCount(0);
    // The era flips on BOTH branches (day.ts:866-885) — `veteran.unlocked` is the
    // thing the unpaid run forfeits, not the campaign era.
    await expect(page.getByTestId('campaign-era')).toHaveText('Veteran');

    await acknowledgeResolution(page, report);
    await expectPlayableCockpit(page);
    // The marker was never cleared behind the player's back.
    await expect(page.getByTestId('debt-chip')).toBeVisible();
    expect(await debtOutstanding(page)).toBe(GUILD_MARKER);

    expect(report.resolution?.outcome).toBe('unpaid');
    expect(report.resolution?.veteranUnlocked).toBe(false);
    expect(report.resolution?.deedTitle).toBeNull();
    expect(report.resolution?.eraAfter).toBe('Veteran');
    expect(report.totals.debtFinal).toBe(GUILD_MARKER);
    // The decisive claim: this pilot could have paid, on the same seed, off the
    // same 30 days of work — and did not.
    expect(
      report.totals.day30Bankroll,
      'the unpaid branch must be a CHOICE: the same career banked enough to clear the marker',
    ).toBeGreaterThanOrEqual(GUILD_MARKER);

    await emitReport(testInfo, report);
  },
);
