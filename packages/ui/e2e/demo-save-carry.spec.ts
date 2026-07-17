import { test, expect, type Page } from '@playwright/test';
import { createInitialState, startDay, createSave, type GameState } from '@spacerquest/engine';

// ============================================================================
//  T-1703 · Demo save carries into the full game — acceptance proof
// ============================================================================
//
// This spec runs under the DEFAULT (full-build) chromium project — no VITE_SQ_DEMO —
// and loads the EXACT day-33 save shape a demo career produces. Because the demo never
// writes anything demo-specific into engine state (the gate lives entirely in the UI/
// build layer, see demo.ts), the save is a clean, full-game-loadable GameState. This
// proves the acceptance criterion "save import works full-side": in the full build the
// wall is gone, the gated veteran controls are reachable, and the career advances past
// day 33 normally.
//
// The save envelope is byte-identical between builds (`createSave`/`loadSave`, key
// `sq.save.v1`), so "carries into the full game" holds structurally; this spec exercises
// it through the real cockpit DOM to prove it end-to-end.

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

/** Boot the SAME day-33 fixture the demo-gate spec uses — the shape a completed demo
 *  hands off — but into the full build, where no gate applies. */
async function bootDay33(page: Page): Promise<void> {
  const base = createInitialState(4242);
  base.day = 33;
  base.player.credits = 60000;
  const dawn: GameState = startDay(base).state;
  dawn.player.currentSystemId = 9; // a purchasable port — so buy-port is genuinely eligible
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

test('a day-33 demo save loads and continues in the full build', async ({ page }) => {
  await bootDay33(page);
  await expect(page.getByTestId('day')).toHaveText('33');

  // No demo wall in the full build — the save is just a mid-career day-33 state.
  await expect(page.getByTestId('demo-wall')).toHaveCount(0);

  // The veteran surfaces the demo gated are all REACHABLE here (their teasers gone):
  await expect(page.getByTestId('buy-port')).toBeVisible();
  await expect(page.getByTestId('demo-lock-ports')).toHaveCount(0);
  await expect(page.getByTestId('hire-crew').first()).toBeVisible();
  await expect(page.getByTestId('demo-lock-hangout')).toHaveCount(0);

  await page.getByTestId('records-toggle').click();
  await expect(page.getByTestId('demo-lock-conqueror')).toHaveCount(0);
  await page.getByTestId('records-close').click();

  // And the career advances past the demo budget: ending day 33 rolls into day 34.
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('day')).toHaveText('34');
  await expect(page.getByTestId('hand')).toBeVisible();
});
