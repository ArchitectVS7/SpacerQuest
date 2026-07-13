import { test, expect, type Page } from '@playwright/test';
import { createInitialState, startDay, createSave } from '@spacerquest/engine';

// T-311 acceptance: Tour One's teaching layer, driven end to end through the real
// cockpit UI (per the global "validate the UX, never the API" rule). The only
// engine use here is OFFLINE save-fixture construction — exactly as the wire/combat
// specs do — never an in-page engine call that bypasses a screen the player uses.
//
//   Fresh default seed 424242 (Test A): Day 1 at Sun-3, dawn hand [19,14,14,13,3].
//     - Contract 0 carries cargo to system 3 (reachable, no encounter).
//     - Sign with die index 0, jump with die index 1 → delivery pays out (1,000 →
//       3,200cr, hold empties). The whole first delivery is reachable guided only
//       by the contextual prompts + visible affordances. (T-1102 re-fixture: the
//       distance-priced payout rose — the contract's fuelRequired component now
//       scales with the uncapped per-distance jump cost.)
//   Seed 887 (Test B): dawn hand [20,18,13,7,6]; jump die INDEX 1 (value 18, which
//     clears the T-1101 rim DC 18) to system 15 triggers a tier-2 encounter (the
//     combat-spec fixture).
//   Day-30 dawn saves (Tests C/D) are built offline and injected via the save
//     envelope, with all onboarding prompts pre-marked seen so no coach callout
//     interferes with the ceremony assertions.

const ALL_ONBOARDING_SEEN = JSON.stringify({
  'dawn-roll': true,
  'first-sign': true,
  'first-jump': true,
  'first-encounter': true,
});

test.beforeEach(async ({ page }) => {
  // Settle the dawn-roll scramble so a die's displayed face equals its dealt
  // value the instant we read it, and disable the coach fade (same pattern as the
  // dawn-hand / combat specs).
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

test('fresh seed: first delivery guided by visible affordances; each prompt fires once; state persists', async ({
  page,
}) => {
  // A genuinely fresh career: each test runs in an isolated context, so
  // localStorage starts empty — the default seed 424242 and a fresh onboarding
  // record both boot from scratch. We deliberately do NOT addInitScript a clear
  // (it would re-run on page.reload() and wipe the persisted seen-record the
  // final persistence assertion depends on — the combat-spec gotcha).
  await page.goto('/');

  const coach = page.getByTestId('onboarding');

  // 1) The dawn-roll coach fires first (highest-priority active prompt on a fresh
  //    day-1 hand). Dismiss it via its own affordance (the manual path) → the next
  //    prompt in the guided sequence, first-sign, takes its place.
  await expect(coach).toBeVisible();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'dawn-roll');
  await page.getByTestId('onboarding-dismiss').click();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-sign');

  // 2) Take the job through the manifest: assign a die, sign contract 0. The
  //    active-contract tracker populates and first-sign AUTO-dismisses (the taught
  //    action was performed) → first-jump takes its place.
  await expect(page.getByTestId('active-contract-empty')).toBeVisible();
  await page.getByTestId('die').nth(0).click();
  await page.getByTestId('contract').first().click();
  await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-jump');

  // 3) Plot and confirm the jump through the starmap (die → destination → commit),
  //    exactly as a player would. Delivery pays out on arrival: credits climb and
  //    the hold empties. first-jump AUTO-dismisses and, the delivery done, no
  //    further prompt is due.
  await page.getByTestId('die').nth(1).click();
  await page.locator('[data-testid="starmap-system"][data-system-id="3"]').click();
  await page.getByTestId('confirm-jump').click();

  await expect(page.getByTestId('credits')).toHaveText('3,200');
  await expect(page.getByTestId('active-contract-empty')).toBeVisible();
  await expect(coach).toHaveCount(0);

  // 4) Fired once + persistence: reload WITHOUT clearing storage. The seen record
  //    rode along in sq.onboarding.v1, so no prompt re-fires on the fresh boot.
  await page.reload();
  await expect(page.getByTestId('onboarding')).toHaveCount(0);
});

test('first-encounter coach fires once, inside combat, and its dismissed state persists', async ({
  page,
}) => {
  await page.goto('/');
  await newGameSeed(page, 887);

  // Jump into the seeded interception (no contract needed — the coach keys off the
  // live encounter). The combat overlay mounts, and the highest-priority prompt —
  // the combat coach — surfaces INSIDE it.
  await page.getByTestId('die').nth(1).click();
  await page.locator('[data-testid="starmap-system"][data-system-id="15"]').click();
  await page.getByTestId('confirm-jump').click();

  const overlay = page.getByTestId('combat-overlay');
  await expect(overlay).toBeVisible();
  const coach = overlay.getByTestId('onboarding');
  await expect(coach).toBeVisible();
  await expect(coach).toHaveAttribute('data-onboarding-id', 'first-encounter');

  // Dismiss it via its own affordance, then reload mid-encounter: the autosaved
  // encounter is restored, but the coach does NOT re-fire (seen state persisted).
  await overlay.getByTestId('onboarding-dismiss').click();
  await expect(coach).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('combat-overlay')).toBeVisible();
  await expect(page.getByTestId('combat-overlay').getByTestId('onboarding')).toHaveCount(0);
});

/** Boot the store straight into the dawn of day 30 via the save envelope. */
async function bootDay30(page: Page, seed: number, credits?: number): Promise<void> {
  const base = createInitialState(seed);
  base.day = 30;
  if (credits !== undefined) base.player.credits = credits;
  const state = startDay(base).state;
  const save = createSave(state, seed);
  await page.addInitScript(
    ([s, ob]) => {
      window.localStorage.setItem('sq.save.v1', s);
      window.localStorage.setItem('sq.onboarding.v1', ob);
    },
    [save, ALL_ONBOARDING_SEEN] as const,
  );
  await page.goto('/');
  await expect(page.getByTestId('day')).toHaveText('30');
}

test('resolution ceremony: the cleared branch is reachable and playable', async ({ page }) => {
  // Banked enough to discharge the 25,000cr marker on the final day.
  await bootDay30(page, 4242, 30000);

  // Clear the Guild marker through the Port Ledger UI (a die-free ledger transfer),
  // then close out the day. Dusk of day 30 FORCES the resolution; the ceremony
  // surfaces at the dawn of day 31.
  await page.getByTestId('debt-amount').fill('25000');
  await page.getByTestId('pay-debt').click();
  await expect(page.getByTestId('debt-cleared')).toBeVisible();
  await page.getByTestId('end-day').click();

  const ceremony = page.getByTestId('resolution-ceremony');
  await expect(ceremony).toBeVisible();
  await expect(ceremony).toHaveAttribute('data-outcome', 'cleared');
  await expect(page.getByTestId('veteran-unlocked')).toBeVisible();
  await expect(page.getByTestId('resolution-deed')).toContainText('Tour One Complete');

  // Acknowledge the resolution → the ceremony unmounts back to a playable cockpit
  // (no soft-lock): the next day is dealt and the day can be ended.
  await page.getByTestId('resolution-choice-btn').first().click();
  await expect(page.getByTestId('resolution-ceremony')).toHaveCount(0);
  await expect(page.getByTestId('end-day')).toBeVisible();
  await expect(page.getByTestId('hand')).toBeVisible();
});

test('resolution ceremony: the unpaid branch is reachable and the debt survives', async ({
  page,
}) => {
  // No banked coin to clear the marker — the day-30 resolution files it unpaid.
  await bootDay30(page, 909);

  // Close out the day WITHOUT paying. Dusk forces the unpaid resolution.
  await page.getByTestId('end-day').click();

  const ceremony = page.getByTestId('resolution-ceremony');
  await expect(ceremony).toBeVisible();
  await expect(ceremony).toHaveAttribute('data-outcome', 'unpaid');
  await expect(page.getByTestId('veteran-unlocked')).toHaveCount(0);
  await expect(page.getByTestId('resolution-consequence')).toBeVisible();

  // Acknowledge it → the cockpit remains playable and the marker still rides along
  // (the debt was never cleared behind the player's back).
  await page.getByTestId('resolution-choice-btn').first().click();
  await expect(page.getByTestId('resolution-ceremony')).toHaveCount(0);
  await expect(page.getByTestId('end-day')).toBeVisible();
  await expect(page.getByTestId('debt-chip')).toBeVisible();
});
