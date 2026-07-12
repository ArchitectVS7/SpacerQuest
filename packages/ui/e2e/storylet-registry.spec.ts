import { test, expect, type Page } from '@playwright/test';

// T-309: the storylet & registry UX. Storylets present as a prose panel in the
// cockpit, each choice showing its authored requirement/cost; a choice whose
// requirement is unmet is locked AND shows why. Earned deeds land in the
// Registry of Deeds with their period-voice citation, and the rank readout
// tracks renown. Every assertion drives the real cockpit UI — nothing calls the
// engine directly (default seed 424242 → Day 1, Sun-3).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  // Reduced motion settles the dawn roll immediately (no scramble flake).
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Open the storylet panel (if closed) and page it until it shows `storyletId`
 *  (rewind first, then advance). All navigation is through the cockpit launcher
 *  and the panel's own pager — no engine calls. */
async function showStorylet(page: Page, storyletId: string): Promise<void> {
  const panel = page.getByTestId('storylet-panel');
  if ((await panel.count()) === 0) {
    await page.getByTestId('storylet-toggle').click();
  }
  await expect(panel).toBeVisible();
  for (let i = 0; i < 8; i++) {
    const prev = page.getByTestId('storylet-prev');
    if ((await prev.count()) === 0 || (await prev.isDisabled())) break;
    await prev.click();
  }
  for (let i = 0; i < 8; i++) {
    if ((await panel.getAttribute('data-storylet-id')) === storyletId) break;
    const next = page.getByTestId('storylet-next');
    if ((await next.count()) === 0 || (await next.isDisabled())) break;
    await next.click();
  }
  await expect(panel).toHaveAttribute('data-storylet-id', storyletId);
}

/** The choice row (button + cost + lock) for a choice id in the live panel. */
function choice(page: Page, choiceId: string) {
  return page.locator(`[data-testid="storylet-choice"][data-choice-id="${choiceId}"]`);
}

test('a locked choice shows its requirement and unlocks when a die is assigned', async ({
  page,
}) => {
  await page.goto('/');
  // The Guild Auditor is one of Day 1's Sun-3 offers; its die-gated choices are
  // the locked-requirement demonstrator.
  await showStorylet(page, 'port.sun3.guild-auditor');

  // The GUILE-check "argue" choice needs a die. Before one is assigned it is
  // disabled, its cost badge names the check, and its lock names the reason.
  const argue = choice(page, 'argue');
  const argueBtn = argue.getByTestId('storylet-choice-btn');
  await expect(argueBtn).toBeDisabled();
  await expect(argue.getByTestId('storylet-choice-cost')).toHaveText('GUILE DC 12 · die');
  await expect(argue.getByTestId('storylet-choice-lock')).toHaveText('Assign a die');

  // The credit+die "pay" choice always shows its full cost, too.
  await expect(choice(page, 'pay').getByTestId('storylet-choice-cost')).toHaveText('75cr · die');

  // Assign a die → the requirement is met and the lock clears (button enabled),
  // proving the gate is real, not decorative.
  await page.getByTestId('die').first().click();
  await expect(argueBtn).toBeEnabled();
  await expect(argue.getByTestId('storylet-choice-lock')).toHaveCount(0);
  // The cost badge stays visible even once the requirement is met.
  await expect(argue.getByTestId('storylet-choice-cost')).toHaveText('GUILE DC 12 · die');
});

test('playing the doc-salvage chain earns a deed that appears in the Registry with citation', async ({
  page,
}) => {
  await page.goto('/');

  // Day 1: answer Doc Salvage's distress ping (a no-die choice) — this schedules
  // the follow-up storylet a day out.
  await showStorylet(page, 'chain.doc-salvage.distress-ping');
  await choice(page, 'answer').getByTestId('storylet-choice-btn').click();
  // The resolved storylet drops off the offer queue.
  await expect(
    page.locator(
      '[data-testid="storylet-panel"][data-storylet-id="chain.doc-salvage.distress-ping"]',
    ),
  ).toHaveCount(0);

  // Roll into Day 2 — the follow-up now surfaces.
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('day')).toHaveText('2');

  await showStorylet(page, 'chain.doc-salvage.follow-up');
  await choice(page, 'accept-thanks').getByTestId('storylet-choice-btn').click();

  // The Beacon Keeper deed is now earned. Open Records → Registry of Deeds and
  // assert the deed with its period-voice citation text.
  await page.getByTestId('records-toggle').click();
  await expect(page.getByTestId('records-tab-registry')).toHaveAttribute('aria-pressed', 'true');
  const deed = page.locator('[data-testid="registry-deed"][data-deed-id="beacon_keeper"]');
  await expect(deed).toBeVisible();
  await expect(deed.getByTestId('registry-deed-title')).toHaveText('Beacon Keeper');
  await expect(deed.getByTestId('registry-deed-citation')).toContainText('answered mayday');

  // One deed bumps renown to Commander — the bezel rank readout updates.
  await expect(page.getByTestId('rank')).toHaveText('Commander');
  await expect(page.getByTestId('registry-rank')).toHaveText('Commander');
});

test('the Nemesis file renders its silent empty state at zero fragments', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('records-toggle').click();
  await page.getByTestId('records-tab-nemesis').click();

  await expect(page.getByTestId('nemesis')).toBeVisible();
  await expect(page.getByTestId('nemesis-count')).toHaveText('0 FRAGMENTS · 0 DECODED');
  await expect(page.getByTestId('nemesis-empty')).toBeVisible();
});
