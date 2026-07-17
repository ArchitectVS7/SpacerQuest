import { test, expect, type Page } from '@playwright/test';
import {
  DARE_MIN_WAGER,
  LOAN_MIN_PRINCIPAL,
  LOAN_DAILY_RATE,
  LOAN_TERM_DAYS,
} from '@spacerquest/content';

// T-1404 acceptance: the Spacers Hangout as a visitable place, driven ENTIRELY
// through the real UI (no state injection, no API calls). Visit the pane, wager a
// die on a Spacer's Dare and read BOTH opposed actors' honest checks; take and
// repay a Penny Wise loan through the desk; confirm the pane is offered ONLY where
// the engine says a Hangout exists; and trace every displayed number to an engine
// export / content constant.
//
// FIXTURE: the player starts at Sun-3 (id 1, the sole `hasHangout` system) and the
// cast's index-0 NPC `npc-iron-vex` starts co-located at Sun-3 on ANY seed —
// `createInitialState` seats NPCs at `(index % 20) + 1` and `startDay` never moves
// them (movement is a dusk step), so Iron Vex is a valid, solvent (5000cr) Dare
// dealer at day-1 dawn. Seed 1 additionally deals the dawn hand [17,15,15,7,4] and
// gives an encounter-free Sun-3 -> Aldebaran-1 (1->2) jump (shared with
// starmap.spec.ts), used by the gate test to leave the Hangout cleanly.
const SEED = 1;
const DEALER = 'npc-iron-vex';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Start a fresh, deterministic career on a chosen seed, entirely through the UI. */
async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

function npcRow(page: Page, id: string) {
  return page.locator(`[data-testid="hangout-npc"][data-npc-id="${id}"]`);
}

test('visit the Hangout, wager a die, and read BOTH actors’ honest checks', async ({ page }) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  // 1) Visit: the Hangout launcher is present at Sun-3; open the pane.
  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();

  // 2) The present-NPC list carries Iron Vex (co-located at Sun-3) — pick him.
  await expect(npcRow(page, DEALER)).toBeVisible();
  await npcRow(page, DEALER).click();

  // 3) The wager band is the CONTENT constant, shown up front; set a valid wager.
  await expect(page.getByTestId('dare-wager-bounds')).toContainText(`WAGER ${DARE_MIN_WAGER}`);
  await page.getByTestId('dare-wager').fill('100');

  // 4) Arm a die from the (still-reachable) HandDock and commit the Dare.
  await page.getByTestId('die').nth(0).click();
  await expect(page.getByTestId('dare-commit')).toBeEnabled();
  await page.getByTestId('dare-commit').click();

  // 5) BOTH opposed checks render — the honest-dice signature applied to gambling.
  for (const testid of ['dare-check-player', 'dare-check-opponent']) {
    const check = page.getByTestId(testid);
    await expect(check).toBeVisible();
    // Opposed GUILE: each side's stat, a rolled d20, a DC, a margin and a verdict.
    await expect(check.getByTestId('check-stat')).toHaveText('GUILE');
    await expect(check.getByTestId('check-die')).toBeVisible();
    await expect(check.getByTestId('check-dc')).toBeVisible();
    await expect(check.getByTestId('check-margin')).toBeVisible();
    // The verdict is seed-dependent; assert it is one of the honest two, not which.
    await expect(check.getByTestId('check-result')).toHaveText(/SUCCESS|FAILURE/);
  }

  // 6) The signed credits delta reads off the engine's HangoutEvent, never recomputed.
  const result = page.getByTestId('dare-result');
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute('data-won', /0|1/);
  await expect(result).toContainText(/[+-]100cr/);

  // Exactly one die was spent by the Dare.
  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  expect(spent.filter((s) => s === '1').length).toBe(1);
});

test('take and repay a Penny Wise loan entirely through the UI', async ({ page }) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();

  // The schedule is visible UP FRONT — every number a raw content constant.
  const terms = page.getByTestId('loan-terms');
  await expect(terms).toContainText(`${LOAN_MIN_PRINCIPAL}`); // 250 floor
  await expect(terms).toContainText(`${LOAN_DAILY_RATE * 100}%`); // 5%/dusk
  await expect(terms).toContainText(`${LOAN_TERM_DAYS}-dusk`); // 15-dusk term

  // Starter credits are 1000; borrowing the minimum principal advances +250.
  await expect(page.getByTestId('credits')).toHaveText('1,000');

  // Borrow: arm a die, take the loan at the minimum principal (the input default).
  await page.getByTestId('die').nth(0).click();
  await page.getByTestId('loan-borrow').click();

  await expect(page.getByTestId('credits')).toHaveText('1,250');
  const status = page.getByTestId('loan-status');
  await expect(status).toBeVisible();
  await expect(status).toContainText(`${LOAN_MIN_PRINCIPAL}`); // outstanding = principal at issue
  await expect(status).toContainText('DUE D'); // engine-written due day

  // Repay: arm a second die and pay the balance in full — the loan clears.
  await page.getByTestId('die').nth(1).click();
  await page.getByTestId('loan-repay-amount').fill(String(LOAN_MIN_PRINCIPAL));
  await page.getByTestId('loan-repay').click();

  await expect(page.getByTestId('credits')).toHaveText('1,000');
  // The desk returns to the no-loan state: the status is gone, borrow is offered again.
  await expect(page.getByTestId('loan-status')).toHaveCount(0);
  await expect(page.getByTestId('loan-borrow')).toBeVisible();
});

test('the Hangout is offered only where the engine says one exists', async ({ page }) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  // Sun-3 hosts the sole Hangout — the launcher is present.
  await expect(page.getByTestId('hangout-toggle')).toHaveCount(1);

  // Jump one clean, encounter-free hop to Aldebaran-1 (id 2, no `hasHangout`).
  await page.getByTestId('die').nth(0).click();
  const dest = page.locator('[data-testid="starmap-system"][data-system-id="2"]');
  await expect(dest).toHaveAttribute('data-reachable', '1');
  await dest.click();
  await page.getByTestId('confirm-jump').click();

  // Arrived off the Hangout hub: the launcher is gone — the pane tracks the exact
  // `hasHangout` gate day.ts enforces, not a UI guess.
  await expect(page.getByTestId('day')).toBeVisible();
  await expect(page.getByTestId('hangout-toggle')).toHaveCount(0);
});
