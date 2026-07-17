import { test, expect, type Page } from '@playwright/test';
import { createInitialState, startDay, createSave, type GameState } from '@spacerquest/engine';

// ============================================================================
//  T-1703 · Demo build — GATE acceptance proof
// ============================================================================
//
// This spec runs ONLY under the `demo` Playwright project (SQ_DEMO=1), whose webServer
// serves the REAL `VITE_SQ_DEMO=1` build — so it proves the actual demo BUILD gates
// veteran content, not a mocked flag. It asserts the acceptance criterion "demo build
// produces the gate correctly (no veteran content reachable)":
//
//   1. Ports        — the `buy-port` control is ABSENT; a `demo-lock-ports` teaser stands in.
//   2. Hangout      — `hire-crew` is ABSENT; a `demo-lock-hangout` teaser stands in.
//   3. Conqueror    — the Registry shows a `demo-lock-conqueror` teaser rung.
//   4. Day wall     — ending the final demo day (33) raises the un-dismissable
//                     `demo-wall` and never advances to day 34, with no veteran control
//                     reachable from it (external CTA only).
//
// Offline fixture construction only (the sanctioned tour-one/onboarding allowance):
// every ASSERTED surface is read through the real cockpit DOM; the only engine use is
// building the day-33 save the demo would produce.

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

/** Boot the store into an offline day-33 fixture at a PURCHASABLE-PORT system (9), the
 *  shape a demo career reaches at the end of its budget (Tour One + 3 post-resolution
 *  days). Standing at a purchasable port is what makes the Port Authority buy affordance
 *  eligible — so its ABSENCE in the demo is a meaningful proof, not a vacuous one. */
async function bootDay33(page: Page): Promise<void> {
  const base = createInitialState(4242);
  base.day = 33;
  base.player.credits = 60000; // enough to make the gated buys eligible in the full build
  const dawn: GameState = startDay(base).state;
  dawn.player.currentSystemId = 9; // Pollux-7 — a purchasable league port
  const save = createSave(dawn, 4242);
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
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('demo build gates every veteran surface and walls the final day', async ({ page }) => {
  await bootDay33(page);
  await expect(page.getByTestId('day')).toHaveText('33');

  // 1) PORTS — the buy control is absent; the teaser stands in its place.
  await expect(page.getByTestId('port-authority')).toBeVisible();
  await expect(page.getByTestId('buy-port')).toHaveCount(0);
  await expect(page.getByTestId('demo-lock-ports')).toBeVisible();

  // 2) HANGOUT PROGRESSION (crew) — hire is absent; the teaser stands in.
  await expect(page.getByTestId('crew-list')).toBeVisible();
  await expect(page.getByTestId('hire-crew')).toHaveCount(0);
  await expect(page.getByTestId('demo-lock-hangout')).toBeVisible();

  // 3) CONQUEROR — the Registry of Deeds shows the locked capstone teaser.
  await page.getByTestId('records-toggle').click();
  await expect(page.getByTestId('registry')).toBeVisible();
  await expect(page.getByTestId('demo-lock-conqueror')).toBeVisible();
  await page.getByTestId('records-close').click();
  await expect(page.getByTestId('records-overlay')).toHaveCount(0);

  // 4) THE DAY WALL — ending day 33 raises the un-dismissable demo wall; the day never
  //    becomes 34 and no veteran control is reachable from the wall (only the external
  //    wishlist CTA, an <a> — there is no in-app button that advances or unlocks).
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('demo-wall')).toBeVisible();
  await expect(page.getByTestId('demo-wall-cta')).toBeVisible();
  await expect(page.getByTestId('day')).not.toHaveText('34');
  // The wall stacks above the cockpit: the gated controls remain absent behind it.
  await expect(page.getByTestId('buy-port')).toHaveCount(0);
  await expect(page.getByTestId('hire-crew')).toHaveCount(0);
});
