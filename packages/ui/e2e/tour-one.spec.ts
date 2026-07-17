import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { createInitialState, startDay, createSave, type GameState } from '@spacerquest/engine';

// T-1602 · Tour One END TO END — one consolidated start-to-resolution career spec
// (the audit gap: Tour One is exercised piecemeal today, but no single career spec
// exists). Three careers, all driven through the REAL cockpit UI per the global
// "validate the UX, never the API" rule: every ACTION a player takes here — sign,
// buy fuel, jump, pay the marker, end the day, dismiss a coach, open a pane — goes
// through the real DOM. The ONLY engine use is OFFLINE save-fixture construction
// (createInitialState → startDay → createSave, then a state mutation for setup),
// exactly the allowance the onboarding/combat specs already stand on: it is state
// SETUP, never an in-page engine call that bypasses a screen the player navigates.
// A genuine 30-day grind is deliberately avoided — it cannot meet the <2% flake
// bar and is not what the rule forbids (the rule forbids bypassing a navigated
// screen, not deterministic fixture setup).
//
// FIXTURE SEEDS — all derived offline by replaying the engine exactly as the store
// does, and cross-checked against the onboarding spec (which asserts the same
// outcomes):
//   • 424242 — the store's shared default. Fresh Tour One opening: the guided first
//     delivery to system 9 pays out to 3,420cr (onboarding.spec asserts this).
//   • 4242 + 30,000cr banked at day 30 — the CLEARED resolution branch.
//   • 909, no banked coin, at day 30 — the UNPAID resolution branch.
//   • 4 — a day-1 LIFE-SUPPORT death. Derived offline: booting dawn of day 1 with
//     lifeSupport.condition = 0 (the junker has no Auto-Repair, so nothing heals it
//     before dusk), the dusk GRIT survival roll (d20 + GRIT 1 vs DC 10) FAILS under
//     this seed, firing the ShipLost → applySuccession path. Verified offline that
//     the run halves credits (1,000 → 500), resets the ship to the junker (a banked
//     hull marker of 30 → 1), carries the 25,000cr Guild debt to the estate, emits
//     the "A successor claims the license" wire obituary, and nulls the encounter.
//     NOTE: a death emits ShipLost + LegacySuccession but NO EncounterResolved, so
//     combatAftermathSummary returns null and NO combat-aftermath panel shows —
//     death surfaces via the Wire obituary + the observable succession state, which
//     is exactly what this test asserts (never combat-aftermath).

const ALL_ONBOARDING_SEEN = JSON.stringify({
  'dawn-roll': true,
  'first-sign': true,
  'first-jump': true,
  'first-encounter': true,
  'first-hangout': true,
  'first-loan': true,
  'first-contraband': true,
  'first-port': true,
  'first-explore': true,
});

/** A run-report recorder. Screens are recorded (deduped) as the career navigates
 *  them; at the end the report is attached as a CI artifact (screens visited +
 *  days elapsed + outcome), satisfying the "run report artifact" acceptance. */
function makeReport(outcome: string) {
  const screens: string[] = [];
  return {
    visit(name: string) {
      if (!screens.includes(name)) screens.push(name);
    },
    async finalize(testInfo: TestInfo, page: Page) {
      const dayText = await page.getByTestId('day').textContent();
      const daysElapsed = Number.parseInt((dayText ?? '0').replace(/[^0-9]/g, ''), 10) || 0;
      await testInfo.attach('tour-one-run-report', {
        contentType: 'application/json',
        body: JSON.stringify({ outcome, screens, daysElapsed }, null, 2),
      });
    },
  };
}

/**
 * Boot the store into an offline save fixture at the dawn of a chosen day, with all
 * onboarding prompts pre-marked seen (so a coach callout never interferes with the
 * resolution/succession assertions). Offline fixture construction only — the same
 * allowance the onboarding/combat specs use; every ACTION afterwards is driven
 * through the real DOM. The init script sets the save UNCONDITIONALLY so a re-boot
 * within a test (e.g. cleared-branch phase 2, after a fresh phase-1 opening) cleanly
 * replaces the live save.
 */
async function bootFixture(
  page: Page,
  seed: number,
  opts: { day?: number; credits?: number; mutate?: (s: GameState) => void } = {},
): Promise<void> {
  const base = createInitialState(seed);
  if (opts.day !== undefined) base.day = opts.day;
  if (opts.credits !== undefined) base.player.credits = opts.credits;
  const dawn = startDay(base).state;
  opts.mutate?.(dawn);
  const save = createSave(dawn, seed);
  await page.addInitScript(
    ([s, ob]) => {
      window.localStorage.setItem('sq.save.v1', s);
      window.localStorage.setItem('sq.onboarding.v1', ob);
    },
    [save, ALL_ONBOARDING_SEEN] as const,
  );
  await page.goto('/');
}

test.beforeEach(async ({ page }) => {
  // Settle the dawn-roll scramble so a die's displayed face equals its dealt value
  // the instant we read it, and disable coach fades (same pattern as every other
  // cockpit spec). Deterministic timing is load-bearing for the <2% flake bar.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Tour One career, cleared branch: fresh opening through resolution', async ({
  page,
}, testInfo) => {
  const report = makeReport('cleared');

  // ---- PHASE 1 · a genuinely fresh opening, played through the UI ----------
  // Default seed 424242, no fixture: localStorage starts empty, so the coaches are
  // live and the first delivery is guided exactly as a new player sees it. This is
  // the continuous real opening career the audit found missing.
  await page.goto('/');
  report.visit('dawn-hand');

  const coach = page.getByTestId('onboarding');
  // The dawn-roll coach fires first; dismiss it via its own affordance → first-sign.
  await expect(coach).toBeVisible();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'dawn-roll');
  await page.getByTestId('onboarding-dismiss').click();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-sign');

  // Sign contract 0 through the manifest: assign a die, click the contract.
  report.visit('manifest');
  await expect(page.getByTestId('active-contract-empty')).toBeVisible();
  await page.getByTestId('die').nth(0).click();
  await page.getByTestId('contract').first().click();
  await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-jump');

  // Top the tank off (a visible fuel affordance — "fuel is the plot"; also the RNG
  // hinge the onboarding spec documents for a clean guided jump on this seed).
  report.visit('fuel-depot');
  await page.getByTestId('die').nth(1).click();
  await page.getByTestId('fuel-amount').fill('10');
  await page.getByTestId('buy-fuel').click();

  // Plot and commit the jump to system 9 through the starmap. Delivery pays out on
  // arrival: credits climb to 3,420 and the hold empties.
  report.visit('starmap');
  await page.getByTestId('die').nth(2).click();
  await page.locator('[data-testid="starmap-system"][data-system-id="9"]').click();
  await page.getByTestId('confirm-jump').click();
  await expect(page.getByTestId('credits')).toHaveText('3,420');
  await expect(page.getByTestId('active-contract-empty')).toBeVisible();
  report.visit('delivery');

  // At Pollux-7 the contextual port/explore coaches fire; clear them via their own
  // affordances so the pane tour below is unobstructed.
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-port');
  await page.getByTestId('onboarding-dismiss').click();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-explore');
  await page.getByTestId('onboarding-dismiss').click();
  await expect(coach).toHaveCount(0);

  // Tour the always-present cockpit instruments the player reads (pure reads — no
  // engine action, so the 3,420 payout above is unaffected).
  await expect(page.getByTestId('trade-pane')).toBeVisible();
  await expect(page.getByTestId('ship-pane')).toBeVisible();
  await expect(page.locator('[data-testid="ship-component"][data-component="hull"]')).toBeVisible();
  report.visit('ship-pane');
  await page.getByTestId('wire-log-toggle').click();
  await expect(page.getByTestId('wire-log')).toBeVisible();
  report.visit('wire-log');
  await page.getByTestId('wire-log-close').click();
  await expect(page.getByTestId('debt-ledger')).toBeVisible();
  report.visit('debt-ledger');

  // Prove a full day cycles cleanly from the fresh opening.
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('hand')).toBeVisible();

  // ---- PHASE 2 · deterministic advance to the endgame (sanctioned fixture) --
  // Re-boot at the dawn of day 30 with a competently banked career (30,000cr) and
  // all coaches pre-seen. This is FIXTURE CONSTRUCTION (the onboarding-spec
  // allowance), not a screen bypass: the actions that matter — clearing the marker,
  // ending the final day, acknowledging the ceremony — all run through the DOM
  // below. A real 30-day grind is deliberately avoided for the <2% flake bar.
  await bootFixture(page, 4242, { day: 30, credits: 30000 });
  await expect(page.getByTestId('day')).toHaveText('30');

  // ---- PHASE 3 · the final day + resolution, through the UI ----------------
  // Clear the 25,000cr Guild marker via the Port Ledger (a die-free ledger transfer)
  // and close out the day. Dusk of day 30 forces the resolution ceremony at dawn 31.
  await page.getByTestId('debt-amount').fill('25000');
  await page.getByTestId('pay-debt').click();
  await expect(page.getByTestId('debt-cleared')).toBeVisible();
  await page.getByTestId('end-day').click();

  const ceremony = page.getByTestId('resolution-ceremony');
  await expect(ceremony).toBeVisible();
  await expect(ceremony).toHaveAttribute('data-outcome', 'cleared');
  await expect(page.getByTestId('veteran-unlocked')).toBeVisible();
  await expect(page.getByTestId('resolution-deed')).toContainText('Tour One Complete');
  report.visit('resolution-ceremony');

  // Acknowledge → the ceremony unmounts to a playable cockpit (no soft-lock).
  await page.getByTestId('resolution-choice-btn').first().click();
  await expect(page.getByTestId('resolution-ceremony')).toHaveCount(0);
  await expect(page.getByTestId('end-day')).toBeVisible();
  await expect(page.getByTestId('hand')).toBeVisible();

  await report.finalize(testInfo, page);
});

test('Tour One career, unpaid branch: the marker survives an unpaid resolution', async ({
  page,
}, testInfo) => {
  const report = makeReport('unpaid');

  // Day 30 with no banked coin to clear the marker — the resolution files it unpaid.
  await bootFixture(page, 909, { day: 30 });
  await expect(page.getByTestId('day')).toHaveText('30');
  report.visit('cockpit');

  // Close out the day WITHOUT paying. Dusk forces the unpaid resolution.
  await page.getByTestId('end-day').click();

  const ceremony = page.getByTestId('resolution-ceremony');
  await expect(ceremony).toBeVisible();
  await expect(ceremony).toHaveAttribute('data-outcome', 'unpaid');
  await expect(page.getByTestId('veteran-unlocked')).toHaveCount(0);
  await expect(page.getByTestId('resolution-consequence')).toBeVisible();
  report.visit('resolution-ceremony');

  // Acknowledge → the cockpit stays playable and the marker still rides along
  // (the debt was never cleared behind the player's back).
  await page.getByTestId('resolution-choice-btn').first().click();
  await expect(page.getByTestId('resolution-ceremony')).toHaveCount(0);
  await expect(page.getByTestId('end-day')).toBeVisible();
  await expect(page.getByTestId('debt-chip')).toBeVisible();
  report.visit('cockpit');

  await report.finalize(testInfo, page);
});

test('Tour One death-and-legacy: a fatal life-support failure passes the license on', async ({
  page,
}, testInfo) => {
  const report = makeReport('death-legacy');

  // Seed 4, dawn of day 1, life support driven to condition 0 (state SETUP), plus a
  // banked hull marker of 30 so its post-death reset to the junker's 1 is observable
  // through the ship pane. Offline-derived: this seed's dusk survival roll fails, so
  // ending the day fires the succession.
  await bootFixture(page, 4, {
    mutate: (s) => {
      s.player.ship.lifeSupport.condition = 0;
      s.player.ship.hull.strength = 30;
    },
  });
  report.visit('cockpit');

  // Baseline the succession-observable state through the UI before the fatal action.
  await expect(page.getByTestId('credits')).toHaveText('1,000');
  const hull = page.locator('[data-testid="ship-component"][data-component="hull"]');
  await expect(hull.getByTestId('component-strength')).toHaveText('30');
  report.visit('ship-pane');

  // The single fatal UI action: end the day. Dusk's life-support survival roll fails
  // → the ship is lost and a successor claims the license at the next dawn.
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('hand')).toBeVisible(); // a fresh dawn was dealt

  // 1) The Wire obituary — death's primary surface. The scrolling ticker carries the
  //    freshest headlines (newest-first), so the obituary rides at its front.
  await expect(page.getByTestId('wire')).toContainText('A successor claims the license');
  report.visit('wire');

  // 2) The succession state, observed through the UI:
  //    • credits halved (1,000 → 500)
  await expect(page.getByTestId('credits')).toHaveText('500');
  //    • ship reset to the junker (banked hull 30 → 1)
  await expect(hull.getByTestId('component-strength')).toHaveText('1');
  report.visit('ship-pane');
  //    • the Guild debt carried to the estate ("…the charts, and the debts")
  await expect(page.getByTestId('debt-chip')).toBeVisible();
  //    • the cockpit is playable — the successor flies on
  await expect(page.getByTestId('end-day')).toBeVisible();

  // A death is NOT a resolved encounter (no EncounterResolved event), so no combat
  // aftermath panel shows — assert its absence to lock the surfacing contract.
  await expect(page.getByTestId('combat-aftermath')).toHaveCount(0);

  await report.finalize(testInfo, page);
});
