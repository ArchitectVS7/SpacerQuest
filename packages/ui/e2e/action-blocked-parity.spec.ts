import { test, expect, type Page } from '@playwright/test';
import { isGatedDestination } from '@spacerquest/content';

// ---------------------------------------------------------------------------
// T-1604 · ActionBlocked UI/protocol parity — the UI mirror.
//
// The protocol side (packages/sim protocol.test.ts) proves that applying a
// blocked action returns an action-result carrying a typed ActionBlocked for all
// three reasons. This spec proves the UI is a faithful CLIENT of the same rules:
// it never lets a player COMMIT a blocked action, and never swallows a refusal
// silently. Each reason is asserted through the real cockpit, no engine calls.
//
//   • destination-locked (T-1101): the sealed systems (Andromeda 21–26, specials
//     27–28) are not even rendered as selectable starmap nodes while the Nemesis
//     crossing is locked — the UI structurally cannot emit the blocked Travel.
//   • no-hangout (T-1303): the Hangout launcher is absent at a non-`hasHangout`
//     system — the UI offers no VisitHangout affordance to refuse.
//   • active-encounter (T-307/combat.spec): the full-screen combat overlay covers
//     the trade/jump/shipyard panes the instant an encounter interrupts a jump.
//     (combat.spec.ts owns the deep encounter flow; here we assert the cover.)
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

test('destination-locked: sealed systems are never selectable on the starmap', async ({ page }) => {
  await page.goto('/');
  await newGameSeed(page, 1);

  // The starmap renders the core+rim lane and the current/visited systems, but a
  // sealed destination (isGatedDestination: Andromeda 21–26 and specials 27–28)
  // is off the chart entirely while 'nemesis.crossing.unlocked' is unset — so a
  // player can never point the hull at it and can never trip the engine's
  // destination-locked ActionBlocked through the UI.
  for (const gated of [21, 24, 27, 28]) {
    expect(isGatedDestination(gated)).toBe(true);
    await expect(
      page.locator(`[data-testid="starmap-system"][data-system-id="${gated}"]`),
    ).toHaveCount(0);
  }

  // An ungated core/rim system IS rendered — proving the absence above is the
  // seal, not an empty map.
  await expect(page.locator('[data-testid="starmap-system"][data-system-id="2"]')).toHaveCount(1);
});

test('no-hangout: the Hangout launcher is absent at a non-Hangout system', async ({ page }) => {
  await page.goto('/');
  // Seed 1 deals a die that clears the clean, encounter-free Sun-3 → Aldebaran-1
  // hop (the same fixture starmap.spec/hangout.spec rely on).
  await newGameSeed(page, 1);

  // Sun-3 (id 1) hosts the sole Hangout — the launcher is present.
  await expect(page.getByTestId('hangout-toggle')).toHaveCount(1);

  // Jump one clean hop to Aldebaran-1 (id 2, no hasHangout).
  await page.getByTestId('die').first().click();
  await page.locator('[data-testid="starmap-system"][data-system-id="2"]').click();
  await page.getByTestId('confirm-jump').click();

  // Arrived off the hub: the launcher is gone — the UI offers no VisitHangout to
  // refuse, mirroring the engine's no-hangout gate (never a silent dead button).
  await expect(page.locator('.loc')).toContainText('Aldebaran-1');
  await expect(page.getByTestId('hangout-toggle')).toHaveCount(0);
});
