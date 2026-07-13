import { test, expect, type Page } from '@playwright/test';
import { jumpFuelCost, travelDc, maxJumpDistance } from '@spacerquest/engine';
import { distance, STAR_SYSTEMS } from '@spacerquest/content';

// T-304 acceptance: plan and execute a jump entirely via the starmap; the
// fuel-range ring and route preview match the engine's own math (asserted
// against the imported engine functions — nothing is recomputed by hand here);
// unreachable systems are visibly gated, never clickable-then-error.
//
// The starter ship is deterministic (state.ts): drives {strength:10,condition:9}
// and 300 fuel. Every rule number the test expects flows from an engine call.
const STARTER_DRIVES = { strength: 10, condition: 9 };
const STARTER_FUEL = 300;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  // Settle the dawn roll + ring pulse so DOM reads are stable, not mid-animation.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Start a fresh, deterministic career on a chosen seed, entirely through the UI. */
async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

function sysNode(page: Page, id: number) {
  return page.locator(`[data-testid="starmap-system"][data-system-id="${id}"]`);
}

test('plan and execute a jump entirely via the map', async ({ page }) => {
  await page.goto('/');
  // Seed 1 deals the dawn hand [17,15,15,7,4] on Sol (system 1). The Sol->
  // Aldebaran-1 (1->2) jump spans distance 5, so travelDc(5)=10; Die 0 (value 17)
  // + PILOT 1 = 18 clears that DC-10 pilot check, and the seeded jump to the
  // adjacent system triggers no encounter — a stable seed, not a retry.
  await newGameSeed(page, 1);

  // 1) Assign a die from the hand.
  await page.getByTestId('die').first().click();

  // 2) Click a reachable system → the route preview appears BEFORE committing.
  const dest = 2;
  const target = sysNode(page, dest);
  await expect(target).toHaveAttribute('data-reachable', '1');
  await target.click();

  const d = distance(1, dest);
  await expect(page.getByTestId('route-preview')).toBeVisible();
  await expect(page.getByTestId('route-distance')).toHaveText(String(d));
  await expect(page.getByTestId('route-fuel')).toHaveText(
    String(jumpFuelCost(STARTER_DRIVES, d, false)),
  );
  await expect(page.getByTestId('route-dc')).toHaveText(String(travelDc(d)));

  // 3) Commit the jump.
  await page.getByTestId('confirm-jump').click();

  // Arrived: the bezel now names the destination and exactly one die is spent.
  await expect(page.locator('.loc')).toContainText(STAR_SYSTEMS[dest].name);
  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  expect(spent.filter((s) => s === '1').length).toBe(1);

  // The honest PILOT check rendered via the shared CheckBreakdown.
  await expect(page.getByTestId('check-breakdown')).toBeVisible();
  await expect(page.getByTestId('check-stat')).toHaveText('PILOT');
  await expect(page.getByTestId('check-die')).toHaveText('17');
});

test('fuel ring and route preview match engine math', async ({ page }) => {
  await page.goto('/');
  // Fresh default career on Sol with 300 fuel. Preview an adjacent system.
  const dest = 2;
  await sysNode(page, dest).click();

  const d = distance(1, dest);
  await expect(page.getByTestId('route-distance')).toHaveText(String(d));
  await expect(page.getByTestId('route-fuel')).toHaveText(
    String(jumpFuelCost(STARTER_DRIVES, d, false)),
  );
  await expect(page.getByTestId('route-dc')).toHaveText(String(travelDc(d)));

  // The fuel-range ring is drawn at exactly maxJumpDistance for the starter ship.
  const units = await page.getByTestId('fuel-ring').getAttribute('data-radius-units');
  const expected = maxJumpDistance(STARTER_DRIVES, STARTER_FUEL, false);
  expect(Number(units)).toBe(expected);
  // T-1102: the per-distance fuel cost (12·d for the starter drives) puts the
  // ring at distance 25 (12·25 = 300), not the old flat-cap 60.
  expect(Number(units)).toBe(25);
});

test('unreachable systems are visibly gated, not clickable-then-error', async ({ page }) => {
  await page.goto('/');
  // A full ship reaches everything, so gating is only demonstrable after a drain.
  // T-1102: under the per-distance cost the old 1<->14 lane (168 fuel/jump) can no
  // longer bounce — one leg leaves 132 fuel, short of the 168 return. Bounce the
  // cheap adjacent pair Sun-3 (1) <-> Aldebaran-1 (2) instead: distance 5, 60
  // fuel/jump, so 300 fuel drains to exactly 0 in 5 jumps. Seed 3 clears the lane
  // with no encounter (verified deterministically per seed).
  await newGameSeed(page, 3);

  for (let i = 0; i < 14; i++) {
    const units = Number(await page.getByTestId('fuel-ring').getAttribute('data-radius-units'));
    if (units === 0) break;
    const unspent = page.locator('[data-testid="die"][data-spent="0"]');
    if ((await unspent.count()) === 0) {
      await page.getByTestId('end-day').click();
      continue;
    }
    const here = Number(
      await page
        .locator('[data-testid="starmap-system"][data-here="1"]')
        .getAttribute('data-system-id'),
    );
    const dest = here === 1 ? 2 : 1;
    await unspent.first().click();
    await sysNode(page, dest).click();
    await page.getByTestId('confirm-jump').click();
  }

  // Fully drained: the ring collapses to radius 0 and every other system is gated.
  await expect(page.getByTestId('fuel-ring')).toHaveAttribute('data-radius-units', '0');
  const reach = await page
    .locator('[data-testid="starmap-system"]:not([data-here="1"])')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-reachable')));
  expect(reach.length).toBeGreaterThan(0);
  expect(reach.every((r) => r === '0')).toBe(true);

  // A far system (rim Algol-2, never the current one) is visibly gated: marked
  // unreachable, aria-disabled, and pointer-events:none in CSS.
  const far = sysNode(page, 20);
  await expect(far).toHaveAttribute('data-reachable', '0');
  await expect(far).toHaveAttribute('aria-disabled', 'true');
  const pe = await far.evaluate((el) => getComputedStyle(el).pointerEvents);
  expect(pe).toBe('none');

  // Clicking it reaches nothing — no route preview opens (no onClick is wired to
  // a gated node), so there is no clickable-then-error path.
  await far.dispatchEvent('click');
  await expect(page.getByTestId('route-preview')).toHaveCount(0);
});
