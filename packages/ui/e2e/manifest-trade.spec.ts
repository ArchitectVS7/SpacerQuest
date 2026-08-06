import { test, expect, type Page } from '@playwright/test';
import { signOpeningMarker, skipFirstTurnWalkthrough } from './support/career';

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
  // T-187 · This spec is NOT testing the first-time flow — retire the scripted
  // first-turn walkthrough before the app boots, or its rails would make the
  // panes below inert. See `support/career.ts`.
  await skipFirstTurnWalkthrough(page);
});

/** Start a fresh, deterministic career on a chosen seed, through the UI only. */
async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
  // T-200 · Sign the Guild marker this new career opened under. `newGame` arms
  // it unconditionally (every career has its own), so this is the click a player
  // makes too; it calls no engine action, so the pinned RNG stream is unmoved.
  await signOpeningMarker(page);
}

/** How many dice in the hand currently read as spent. */
async function spentCount(page: Page): Promise<number> {
  const flags = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  return flags.filter((s) => s === '1').length;
}

/** Select the first unspent die in the hand.
 *
 *  T-196a · IDEMPOTENT ON PURPOSE — clicking the ALREADY-ARMED die DISARMS it
 *  (`store.ts` `selectDie`). Free actions (M17, docs/DAWN-HAND-REDESIGN.md §3) do
 *  not consume the armed die, so the same index can still be armed when this is
 *  called again; clicking blindly would un-arm it. */
async function selectUnspentDie(page: Page): Promise<void> {
  const die = page.locator('[data-testid="die"][data-spent="0"]').first();
  if ((await die.getAttribute('aria-pressed')) !== 'true') await die.click();
  await expect(die).toHaveAttribute('aria-pressed', 'true');
}

/** The tank half of the depot's `N/M` hold readout. */
function fuelInTank(hold: string): number {
  return Number(hold.split('/')[0].replace(/[^\d]/g, ''));
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
  // DC 10), so the ship stays at Sol but the jump's fuel bill is spent — with the
  // day's board and depot price untouched (both are set at dawn; the jump is
  // clean thanks to the RNG-advancing debt payment above — T-1103).
  //
  // T-195 (repaired at T-162) · THE BILL IS NO LONGER A LITERAL, AND IS NOT THIS
  // TEST'S CLAIM. `navDieFuelDiscount` made the jump's cost a function of the
  // ARMED DIE (0–15% off), so the old pinned `240` went stale the moment that
  // shipped. What this step is FOR is headroom — a full tank would clamp the
  // purchase below and move nothing — so it asserts headroom exists and the die
  // was spent, and leaves the fuel arithmetic to the engine's own tests. See
  // `F-162-4` for why the previewed figure is not asserted here either.
  const holdBefore = fuelInTank(await page.getByTestId('fuel-hold').innerText());
  expect(holdBefore).toBe(300);
  await page.getByTestId('die').nth(4).click();
  await page.locator('[data-testid="starmap-system"][data-system-id="2"]').click();
  await page.getByTestId('confirm-jump').click();
  await expect
    .poll(async () => fuelInTank(await page.getByTestId('fuel-hold').innerText()))
    .toBeLessThan(holdBefore - 10);
  expect(await spentCount(page)).toBe(1);

  // --- Sign -------------------------------------------------------------
  await expect(page.getByTestId('active-contract-empty')).toBeVisible();
  await selectUnspentDie(page);
  await page.getByTestId('contract').first().click();

  // The signed job is now tracked and the board shrank by one — but T-196a
  // (docs/DAWN-HAND-REDESIGN.md §3) made signing a FREE ACTION, so the spent count
  // is UNCHANGED at the one die the jump above burned. That inversion is the point
  // of keeping the count here rather than deleting it.
  await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);
  const signedText = await page.getByTestId('active-contract').innerText();
  expect(signedText).not.toContain('Hold is empty');
  await expect(page.getByTestId('contract')).toHaveCount(3);
  expect(await spentCount(page)).toBe(1);

  // --- Haggle (honest d20 check — the trade desk's ONE surviving die cost) ----
  await selectUnspentDie(page);
  await page.getByTestId('haggle').first().click();
  await expect(page.getByTestId('check-breakdown')).toBeVisible();
  await expect(page.getByTestId('check-stat')).toHaveText('TRADE');
  await expect(page.getByTestId('check-dc')).toHaveText('12');
  expect(await spentCount(page)).toBe(2);

  // --- Buy fuel (FREE as of T-196a — costs credits, not a die) ---------------
  await expect(page.getByTestId('fuel-price')).toHaveText('8');
  const fuelBefore = await page.getByTestId('fuel-hold').innerText();
  await selectUnspentDie(page);
  await page.getByTestId('fuel-amount').fill('10');
  await page.getByTestId('buy-fuel').click();
  // Fuel rose by exactly the ten paid for, and NO die was spent. Derived
  // from the tank as it stood, not a literal: the jump above no longer lands on a
  // fixed number (T-195's nav-die fuel discount).
  await expect(page.getByTestId('fuel-hold')).not.toHaveText(fuelBefore);
  await expect(page.getByTestId('fuel-hold')).toHaveText(`${fuelInTank(fuelBefore) + 10}/300`);
  // Still 2: the fuel bought is paid in credits, not dice (T-196a).
  expect(await spentCount(page)).toBe(2);
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
  // T-196a: signing is FREE, so nothing was consumed by the successful sign either.
  expect(await spentCount(page)).toBe(0);

  // Try to sign a second offer while already carrying one.
  await selectUnspentDie(page);
  await page.getByTestId('contract').first().click();

  // The engine refusal surfaces as an on-screen notice — never silence.
  await expect(page.getByTestId('notice')).toBeVisible();
  await expect(page.getByTestId('notice')).toContainText('already carrying an active contract');
  // Nothing was silently consumed, and the tracker still shows job one.
  expect(await spentCount(page)).toBe(0);
  expect(await page.getByTestId('active-contract').innerText()).toBe(active);
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

// T-1604b · F2 (part B) through the cockpit. UGT finding F2: a captain carrying
// an undeliverable run had no way to free the hold, because signing is refused
// while a contract rides. The Trade pane now carries the release, and it must
// never be a dead click.
test('dumping the run clears the hold and re-opens the board', async ({ page }) => {
  await page.goto('/');

  // Sign the first offer, so there is something in the hold to dump.
  await expect(page.getByTestId('active-contract-empty')).toBeVisible();
  await selectUnspentDie(page);
  await page.getByTestId('contract').first().click();
  await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);
  await expect(page.getByTestId('contract')).toHaveCount(3);
  // T-196a: signing is FREE — the hand is untouched throughout this test, which is
  // exactly what the counts below now assert.
  expect(await spentCount(page)).toBe(0);

  // T-196c · INVERTED, NOT DELETED. This guard used to disarm the hand and assert
  // the release went DISABLED with a `Pick a die first` title. M17 freed the dump
  // (docs/DAWN-HAND-REDESIGN.md §3), so the same scaffold now proves the opposite
  // and stronger thing: with NOTHING armed the release is live, its title names
  // the act rather than a missing die, and clicking it still dumps the hold and
  // still spends nothing. "Never a dead click" is the clause either way.
  await page.locator('[data-testid="die"][aria-pressed="true"]').click();
  await expect(page.locator('[data-testid="die"][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.getByTestId('abandon-contract')).toBeEnabled();
  await expect(page.getByTestId('abandon-contract')).toHaveAttribute(
    'title',
    /Vent the cargo and clear the hold/,
  );
  expect(await spentCount(page)).toBe(0);
  await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);

  // Dump with an EMPTY selection: the hold empties, and NO die is consumed.
  await page.getByTestId('abandon-contract').click();
  await expect(page.getByTestId('active-contract-empty')).toBeVisible();
  expect(await spentCount(page)).toBe(0);
  // The dumped run does NOT return to the board — the crates were vented.
  await expect(page.getByTestId('contract')).toHaveCount(3);

  // The point of the whole verb: the hold takes work again.
  await selectUnspentDie(page);
  await page.getByTestId('contract').first().click();
  await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);
  expect(await spentCount(page)).toBe(0);
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
