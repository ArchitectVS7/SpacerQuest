import { test, expect, type Page } from '@playwright/test';

// T-1502 · NPC personal chains — UI reachability. The standing "reachable through
// the UI" constraint, proven for the cheapest authored arc: Doc Salvage's now
// three-episode chain. The store's default career is the deterministic seed
// 424242 → Day 1, Sun-3, where the Doc-Salvage distress ping is a live PORT offer.
// This drives distress-ping → follow-up → the NEW impound episode entirely through
// the real cockpit (diegetic openers + the storylet panel + end-day), proving each
// episode renders through the actual storylet surface with no new UI wiring.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Open a storylet from its diegetic opener and confirm the focused panel shows it. */
async function showStorylet(page: Page, storyletId: string): Promise<void> {
  const opener = page.locator(`[data-storylet-open="${storyletId}"]`);
  await expect(opener).toBeVisible();
  await opener.click();
  const panel = page.getByTestId('storylet-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-storylet-id', storyletId);
}

function choice(page: Page, choiceId: string) {
  return page.locator(`[data-testid="storylet-choice"][data-choice-id="${choiceId}"]`);
}

test("Doc Salvage's 3-episode chain plays through the real storylet panel", async ({ page }) => {
  await page.goto('/');

  // Episode 1 — the distress ping (a requirement-free "answer" today).
  await showStorylet(page, 'chain.doc-salvage.distress-ping');
  await choice(page, 'answer').getByTestId('storylet-choice-btn').click();

  // Episode 2 — the follow-up, scheduled for the next dawn.
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('day')).toHaveText('2');
  await showStorylet(page, 'chain.doc-salvage.follow-up');
  await choice(page, 'accept-thanks').getByTestId('storylet-choice-btn').click();

  // Episode 3 — the NEW impound beat, scheduled by the follow-up and gated on the
  // disposition the follow-up just granted. It renders through the same port
  // surface; resolve its requirement-free "let Doc fight it" choice.
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('day')).toHaveText('3');
  await showStorylet(page, 'chain.doc-salvage.impound');
  await choice(page, 'let-him-fight').getByTestId('storylet-choice-btn').click();

  // The terminal episode resolved: its opener is gone (completed, never re-offers).
  await expect(page.locator('[data-storylet-open="chain.doc-salvage.impound"]')).toHaveCount(0);
});
