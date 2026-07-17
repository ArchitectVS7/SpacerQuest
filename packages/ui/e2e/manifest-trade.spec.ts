import { test, expect, type Page } from '@playwright/test';

// T-305 acceptance: the full trade loop — sign, haggle, buy fuel, pay debt —
// driven entirely through the cockpit UI (nothing calls the engine directly),
// and the load-bearing guarantee that EVERY engine failure surfaces as visible
// feedback, never a silent no-op (UGT Finding 4's lesson): can't sign twice and
// won't renegotiate both reach the player as an on-screen notice.
//
// The default career is deterministic (store seed 424242): day 1 on Sol with
// 1000 credits, 25000 debt due day 30, 300 fuel, local fuel price 8, and the
// dawn hand [19,14,14,13,3] against a 4-offer board. Every asserted number
// flows from that fixed seed, not a lucky roll.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  // Settle the dawn roll so die faces equal the dealt values the instant we read.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Start a fresh, deterministic career on a chosen seed, through the UI only. */
async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

/** How many dice in the hand currently read as spent. */
async function spentCount(page: Page): Promise<number> {
  const flags = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  return flags.filter((s) => s === '1').length;
}

/** Select the first unspent die in the hand. */
async function selectUnspentDie(page: Page): Promise<void> {
  await page.locator('[data-testid="die"][data-spent="0"]').first().click();
}

test('full loop through the UI: sign, haggle, buy fuel, pay debt', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('contract')).toHaveCount(4);

  // --- Pay debt (NO die — a ledger transfer) ---------------------------
  // T-1103: moved AHEAD of the fuel-burn jump. The encounter-rate repair (core
  // 0.08 -> 0.30) makes the bare burn-jump interdict on seed 424242; this die-free
  // ledger payment is one engine action, so it advances the RNG stream just enough
  // that the following nav-failed jump clears its encounter roll and stays clean
  // (re-derived offline: pay-debt -> failed Travel = no encounter). The payment's
  // own assertions are unaffected by the reorder — the marker is untouched at dawn.
  await expect(page.getByTestId('debt-chip')).toContainText('25,000');
  const spentBeforePay = await spentCount(page);
  await page.getByTestId('debt-amount').fill('500');
  await page.getByTestId('pay-debt').click();
  // Debt fell by exactly the amount paid, the countdown reads 30 − day = 29d,
  // and crucially NO die was consumed by the payment.
  await expect(page.getByTestId('debt-chip')).toContainText('24,500');
  await expect(page.getByTestId('debt-countdown')).toHaveText('29d');
  expect(await spentCount(page)).toBe(spentBeforePay);

  // --- Make fuel headroom (T-1102) -------------------------------------
  // The fresh junker starts with a FULL tank (300/300), so buying fuel would
  // clamp to the ceiling and move nothing. Burn some first with a jump: the
  // value-3 die (hand index 4) fails the pilot check for Aldebaran-1 (system 2,
  // DC 10), so the ship stays at Sol but the 60-fuel cost is spent — leaving
  // 240/300 with the day's board and depot price untouched (both are set at dawn;
  // the jump is clean thanks to the RNG-advancing debt payment above — T-1103).
  await page.getByTestId('die').nth(4).click();
  await page.locator('[data-testid="starmap-system"][data-system-id="2"]').click();
  await page.getByTestId('confirm-jump').click();
  await expect(page.getByTestId('fuel-hold')).toContainText('240');
  expect(await spentCount(page)).toBe(1);

  // --- Sign -------------------------------------------------------------
  await expect(page.getByTestId('active-contract-empty')).toBeVisible();
  await selectUnspentDie(page);
  await page.getByTestId('contract').first().click();

  // The signed job is now tracked, the board shrank by one, a second die is spent.
  await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);
  const signedText = await page.getByTestId('active-contract').innerText();
  expect(signedText).not.toContain('Hold is empty');
  await expect(page.getByTestId('contract')).toHaveCount(3);
  expect(await spentCount(page)).toBe(2);

  // --- Haggle (honest d20 check) ---------------------------------------
  await selectUnspentDie(page);
  await page.getByTestId('haggle').first().click();
  await expect(page.getByTestId('check-breakdown')).toBeVisible();
  await expect(page.getByTestId('check-stat')).toHaveText('TRADE');
  await expect(page.getByTestId('check-dc')).toHaveText('12');
  expect(await spentCount(page)).toBe(3);

  // --- Buy fuel (consumes a die) ---------------------------------------
  await expect(page.getByTestId('fuel-price')).toHaveText('8');
  const fuelBefore = await page.getByTestId('fuel-hold').innerText();
  await selectUnspentDie(page);
  await page.getByTestId('fuel-amount').fill('10');
  await page.getByTestId('buy-fuel').click();
  // Fuel rose (240 → 250) and exactly one more die was spent.
  await expect(page.getByTestId('fuel-hold')).not.toHaveText(fuelBefore);
  await expect(page.getByTestId('fuel-hold')).toContainText('250');
  expect(await spentCount(page)).toBe(4);
  // (The die-free debt payment that opens this test — moved ahead of the fuel
  // burn for T-1103 — already exercised the ledger-transfer path.)
});

test('signing a second contract is refused, and the refusal is visible', async ({ page }) => {
  await page.goto('/');

  // Sign the first offer.
  await selectUnspentDie(page);
  await page.getByTestId('contract').first().click();
  await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);
  const active = await page.getByTestId('active-contract').innerText();
  expect(await spentCount(page)).toBe(1);

  // Try to sign a second offer while already carrying one.
  await selectUnspentDie(page);
  await page.getByTestId('contract').first().click();

  // The engine refusal surfaces as an on-screen notice — never silence.
  await expect(page.getByTestId('notice')).toBeVisible();
  await expect(page.getByTestId('notice')).toContainText('already carrying an active contract');
  // No second die was silently consumed, and the tracker still shows job one.
  expect(await spentCount(page)).toBe(1);
  expect(await page.getByTestId('active-contract').innerText()).toBe(active);
});

// T-1604 · The Abandon-contract escape hatch (the poverty-trap-fix's player-facing
// half). A carried run whose destination the ship can no longer reach has NO other
// in-game exit — the sign gate refuses a new job while one rides — so the player
// must be able to dump the cargo and void the contract, through the UI.
test('abandon a carried contract through the UI, and the hold clears', async ({ page }) => {
  await page.goto('/');

  // Sign the first offer, then confirm it is tracked.
  await selectUnspentDie(page);
  await page.getByTestId('contract').first().click();
  await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);
  expect(await spentCount(page)).toBe(1);

  // Abandon it: arm a die, click the Abandon button in the active-contract block.
  await selectUnspentDie(page);
  await page.getByTestId('abandon-contract').click();

  // The hold is empty again (the tracker shows the empty state), a second die was
  // spent, and no failure notice fired — a clean, visible forfeit.
  await expect(page.getByTestId('active-contract-empty')).toBeVisible();
  expect(await spentCount(page)).toBe(2);
  await expect(page.getByTestId('notice')).toHaveCount(0);

  // With the hold clear, the sign gate no longer refuses a new job.
  await selectUnspentDie(page);
  await page.getByTestId('contract').first().click();
  await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);
  expect(await spentCount(page)).toBe(3);
});

test('a second haggle is refused, and the refusal is visible', async ({ page }) => {
  await page.goto('/');

  // Haggle the first contract once — a real check that sets it "haggled".
  await selectUnspentDie(page);
  await page.getByTestId('haggle').first().click();
  await expect(page.getByTestId('check-breakdown')).toBeVisible();
  expect(await spentCount(page)).toBe(1);

  // Haggle the SAME contract again — the broker won't renegotiate.
  await selectUnspentDie(page);
  await page.getByTestId('haggle').first().click();

  await expect(page.getByTestId('notice')).toBeVisible();
  await expect(page.getByTestId('notice')).toContainText('will not renegotiate');
  // The refusal spent no die (still just the one from the first haggle).
  expect(await spentCount(page)).toBe(1);
});

test('paying debt clamps to credits, then over-paying with none surfaces a failure', async ({
  page,
}) => {
  await page.goto('/');

  // Over-pay: the engine clamps to min(amount, credits, debt) = 1000, so the
  // debt drops by exactly the 1000 credits on hand and credits hit zero. This
  // is a partial SUCCESS — no failure notice yet.
  await page.getByTestId('debt-amount').fill('999999');
  await page.getByTestId('pay-debt').click();
  await expect(page.getByTestId('debt-chip')).toContainText('24,000');
  await expect(page.getByTestId('notice')).toHaveCount(0);

  // Now, with zero credits, any further payment can send nothing — that failure
  // event must surface as visible feedback, and the debt must not move.
  await page.getByTestId('debt-amount').fill('500');
  await page.getByTestId('pay-debt').click();
  await expect(page.getByTestId('notice')).toBeVisible();
  await expect(page.getByTestId('notice')).toContainText('no credits to send');
  await expect(page.getByTestId('debt-chip')).toContainText('24,000');
});

test('the manifest flags a storylet cargo (display-only, derived from content)', async ({
  page,
}) => {
  await page.goto('/');
  // Seed 3 deals a Medicinals offer (cargo type 4), the one cargo a content
  // storylet is keyed to (cargo.medicinals.quarantine-seal) — so the board flags
  // it STORYLET. This is a read of authored content, not a rule the UI owns.
  await newGameSeed(page, 3);
  await expect(page.getByTestId('flag-storylet').first()).toBeVisible();
});
