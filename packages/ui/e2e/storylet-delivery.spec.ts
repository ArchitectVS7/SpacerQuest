import { test, expect } from '@playwright/test';
import { STORYLETS } from '@spacerquest/content';
import { storyletSurface } from '../src/format';

// T-1406 · Storylet delivery & diegetic shell. PRD §8.3: storylets are delivered
// by the economy — "a contract, a price spike, a wire item — rather than a quest
// marker." These tests prove the badge-counted launcher is gone, that every live
// offer is surfaced by a DIEGETIC opener (a hold/manifest line, a wire bulletin,
// a port dispatch), and that no storylet becomes unreachable by the change.
//
// The store's default career is the deterministic seed 424242 → Day 1, Sun-3,
// whose live offers are the Guild Auditor + the Doc-Salvage distress ping (both
// PORT surface). Signing the board's Rare-Elements contract surfaces a HOLD
// storylet the same day; ending the day in place to Day 10 surfaces the Guild
// day-10 pressure notice (WIRE surface). No engine calls — everything drives the
// real cockpit.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  // Reduced motion settles the dawn roll immediately (no scramble flake).
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

// ---- Classifier totality: nothing is orphaned ------------------------------

test('every shipped storylet classifies to a real diegetic surface', () => {
  // The reachability invariant, proven at the source: the classifier is TOTAL, so
  // every authored id routes to exactly one of the four surfaces — a new storylet
  // can never fall through to "nowhere".
  expect(STORYLETS.length).toBeGreaterThan(0);
  for (const s of STORYLETS) {
    expect(['hold', 'wire', 'port', 'ceremony']).toContain(storyletSurface(s.id));
  }
});

// ---- The badge launcher is gone --------------------------------------------

test('the badge-counted storylet launcher is gone', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('storylet-toggle')).toHaveCount(0);
});

// ---- Sweep: every live offer is surfaced somewhere -------------------------

test('every eligible offer is surfaced by a diegetic opener that opens it', async ({ page }) => {
  await page.goto('/');

  // The audit node reflects the engine's own live non-resolution offer set. For
  // EACH live offer, prove a matching diegetic opener exists, click it, and prove
  // the focused panel opens on that exact id. This proves the openers cover the
  // full available set with no gaps — the "no storylet becomes unreachable" sweep.
  const auditIds = await page
    .locator('[data-testid="storylet-offer-audit"] [data-offer-id]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-offer-id')!));
  expect(auditIds.length).toBeGreaterThan(0);

  for (const id of auditIds) {
    const opener = page.locator(`[data-storylet-open="${id}"]`);
    await expect(opener, `no diegetic opener for live offer ${id}`).toHaveCount(1);
    await opener.click();
    const panel = page.getByTestId('storylet-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-storylet-id', id);
    // Close it and move on to the next offer.
    await page.getByTestId('storylet-close').click();
    await expect(panel).toHaveCount(0);
  }
});

// ---- A cargo storylet opens from its manifest line -------------------------

test('a cargo storylet opens from its manifest line in the hold block', async ({ page }) => {
  await page.goto('/');

  // Arm a die and sign the board's storylet-keyed Rare-Elements contract (index 1
  // on the default seed). Signing surfaces its cargo storylet the SAME day.
  await page.getByTestId('die').first().click();
  const rareElements = page.getByTestId('contract').nth(1);
  await expect(rareElements.getByTestId('flag-storylet')).toBeVisible();
  await rareElements.click();

  // The cargo storylet now opens from a HOLD dispatch — the ship's manifest line —
  // inside the active-contract / hold block, not a launcher.
  const holdBlock = page.getByTestId('hold-dispatches');
  const opener = holdBlock.locator('[data-storylet-open="cargo.rare-elements.assay-dispute"]');
  await expect(opener).toBeVisible();
  await opener.click();

  const panel = page.getByTestId('storylet-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-storylet-id', 'cargo.rare-elements.assay-dispute');
});

// ---- A wire item opens its storylet ----------------------------------------

test('a wire item opens its storylet from a Galactic-Wire bulletin', async ({ page }) => {
  await page.goto('/');

  // End the day IN PLACE (no jumps → no encounters) to Day 10, when the Guild's
  // day-10 pressure notice becomes eligible. It is a WIRE-surface storylet.
  for (let d = 1; d < 10; d++) {
    await page.getByTestId('end-day').click();
    await expect(page.getByTestId('day')).toHaveText(String(d + 1));
  }

  const bulletins = page.getByTestId('wire-bulletins');
  const opener = bulletins.locator('[data-storylet-open="guild.pressure.tour-one.day10"]');
  await expect(opener).toBeVisible();
  await opener.click();

  const panel = page.getByTestId('storylet-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-storylet-id', 'guild.pressure.tour-one.day10');
  // A Guild wire keeps its in-panel letterhead treatment.
  await expect(panel.getByTestId('storylet-letterhead')).toBeVisible();
});
