import { test, expect, type Page, type Locator } from '@playwright/test';

// T-308 acceptance, driven entirely through the cockpit (nothing calls the
// engine directly): buy an upgrade and watch the manifest/fuel instruments
// change, and prove an exclusion / renown conflict is shown WITH its reason and
// DISABLED — never hidden.
//
// The default career is deterministic (store seed 424242): day 1 on Sol with
// 1000 credits, LIEUTENANT renown, the dawn hand [19,14,14,13,3], and the
// starting junker — hull str1/cond9, drives str10/cond9, 10 cargo pods (a full
// hold at that hull), 300 fuel. Every asserted number flows from that seed.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function spentCount(page: Page): Promise<number> {
  const flags = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  return flags.filter((s) => s === '1').length;
}

async function selectUnspentDie(page: Page): Promise<void> {
  await page.locator('[data-testid="die"][data-spent="0"]').first().click();
}

/** The component grid row for a given component id. */
function component(page: Page, id: string): Locator {
  return page.locator(`[data-testid="ship-component"][data-component="${id}"]`);
}

/** The special-equipment row for a given equipment id. */
function equipment(page: Page, id: string): Locator {
  return page.locator(`[data-testid="equipment-row"][data-equipment="${id}"]`);
}

test('buying an upgrade changes the ship instruments (manifest pods + fuel curve)', async ({
  page,
}) => {
  await page.goto('/');

  // Starting instruments read straight off the junker.
  await expect(component(page, 'hull').getByTestId('component-strength')).toHaveText('1');
  await expect(page.getByTestId('ship-pods')).toHaveText('10');
  await expect(page.getByTestId('credits')).toHaveText('1,000');

  // --- Buy the tier-1 hull (str1 junker → strength 10) ------------------
  // T-1402: the junker sits at tier 0 (engine `componentTierForStrength`), so its
  // offered upgrade is TIER 1 (strength 10) — buyable now that the UI reads the
  // floor-based tier. Before the de-rule pass the UI's `ceil` inverse called the
  // junker "tier 1" and offered tier 2, skipping tier 1 entirely.
  await selectUnspentDie(page);
  await component(page, 'hull').getByTestId('upgrade-component').click();

  await expect(component(page, 'hull').getByTestId('component-strength')).toHaveText('10');
  // Cost 25 = tier-1 price 50 − trade-in 25 on the str-1 hull.
  await expect(page.getByTestId('credits')).toHaveText('975');
  expect(await spentCount(page)).toBe(1);
  // The pod-trap fix: a str-10 hull holds max 100 pods (was 0 before the engine's
  // `> 10` boundary fix), so cargoPods still reads 10/100 — the regression is gone.
  await expect(page.getByTestId('pods-block')).toContainText('10/100');

  // --- Buy 10 cargo pods (a manifest/cargo number visibly changing) -----
  await selectUnspentDie(page);
  await page.getByTestId('pods-amount').fill('10');
  await page.getByTestId('buy-pods').click();

  await expect(page.getByTestId('ship-pods')).toHaveText('20');
  expect(await spentCount(page)).toBe(2);

  // --- Upgrade the drives (str10 → 20): the FUEL CURVE drops ------------
  const fuelBefore = Number(await page.getByTestId('fuel-per-jump').innerText());
  await selectUnspentDie(page);
  await component(page, 'drives').getByTestId('upgrade-component').click();

  await expect(component(page, 'drives').getByTestId('component-strength')).toHaveText('20');
  const fuelAfter = Number(await page.getByTestId('fuel-per-jump').innerText());
  expect(fuelAfter).toBeLessThan(fuelBefore);
  expect(await spentCount(page)).toBe(3);
});

test('an exclusion conflict is shown WITH its reason and disabled, never hidden', async ({
  page,
}) => {
  await page.goto('/');

  // With a die in hand and no conflict yet, Auto-Repair is a live purchase and
  // shows no blocking reason.
  await selectUnspentDie(page);
  await expect(equipment(page, 'AUTO_REPAIR')).toBeVisible();
  await expect(equipment(page, 'AUTO_REPAIR').getByTestId('buy-equipment')).toBeEnabled();
  await expect(equipment(page, 'AUTO_REPAIR').getByTestId('equipment-reason')).toHaveCount(0);

  // Install the Cloaker (prereqs met on the junker: light hull + shields). The
  // die selected above is spent by this purchase.
  await equipment(page, 'CLOAKER').getByTestId('buy-equipment').click();

  await expect(equipment(page, 'CLOAKER')).toHaveAttribute('data-owned', '1');
  await expect(equipment(page, 'CLOAKER').getByTestId('equipment-installed')).toBeVisible();
  await expect(page.getByTestId('credits')).toHaveText('500');

  // Re-arm so "disabled" can only be the conflict, not a missing die: the
  // Auto-Repair row is STILL VISIBLE, disabled, and explains WHY.
  await selectUnspentDie(page);
  await expect(equipment(page, 'AUTO_REPAIR')).toBeVisible();
  await expect(equipment(page, 'AUTO_REPAIR').getByTestId('buy-equipment')).toBeDisabled();
  await expect(equipment(page, 'AUTO_REPAIR').getByTestId('equipment-reason')).toContainText(
    'Cloaker',
  );
});

test('a renown gate is disabled-not-hidden with a legible reason', async ({ page }) => {
  await page.goto('/');

  // Even with a die in hand, the LIEUTENANT can't buy a Captain-gated item — it
  // stays visible and disabled, with the reason spelled out.
  await selectUnspentDie(page);
  const starBuster = equipment(page, 'STAR_BUSTER');
  await expect(starBuster).toBeVisible();
  await expect(starBuster.getByTestId('buy-equipment')).toBeDisabled();
  await expect(starBuster.getByTestId('equipment-reason')).toContainText('Captain');
});
