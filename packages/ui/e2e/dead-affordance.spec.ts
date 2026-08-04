import { test, expect, type Page } from '@playwright/test';
import { skipFirstTurnWalkthrough } from './support/career';

// ---------------------------------------------------------------------------
// T-162 · F-162-1 and F-162-2, encoded as tests.
//
// Both bugs were found by the long-haul DOM sweep this task shipped
// (`long-haul.spec.ts`), and both are fixed in `store.ts`. The fix-then-encode
// discipline (T-1605b) says the sweep that found them is not the check that
// keeps them fixed: a randomized walk may or may not revisit the state, so each
// gets a deterministic, named spec that reproduces it through the real UI.
//
// F-162-1 — `resolveTrade` spends the die BEFORE the affordability gate
// (`packages/engine/src/actions/trade.ts:23`), so an unaffordable fill burns it.
// `buyFuel` used to INFER the spend from the refusal and keep the selection, and
// `armed` is `selectedDie !== null` everywhere — so one unaffordable fill left
// the whole cockpit rendering armed while every click threw `Die already spent`.
//
// F-162-2 — a second refusal whose words matched the first produced a
// byte-identical DOM, so the cockpit looked inert rather than refusing again.
//
// No state injection: the destitute purchase is reached by asking the depot for
// more fuel than the till can cover, which is a thing a real player does.
// ---------------------------------------------------------------------------

const SEED = 1;
/** Far more than any Tour One bankroll, so the refusal is certain on every seed
 *  rather than tuned to one. */
const UNAFFORDABLE_FUEL = 9_999_999;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // T-187 · This spec is NOT testing the first-time flow. See `support/career.ts`.
  await skipFirstTurnWalkthrough(page);
});

async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
  await expect(page.getByTestId('hand')).toBeVisible();
}

/** Arm the first unspent die, exactly as a player does. */
async function armFirstDie(page: Page): Promise<void> {
  await page.locator('[data-testid="die"][data-spent="0"]').first().click();
  await expect(page.locator('[data-testid="die"][aria-pressed="true"]')).toHaveCount(1);
}

async function askForUnaffordableFuel(page: Page): Promise<void> {
  await page.getByTestId('fuel-amount').fill(String(UNAFFORDABLE_FUEL));
  // The pre-commit warning is the cockpit telling the truth BEFORE the click —
  // it is not the bug, and its presence is what makes the click below a
  // deliberate, informed refusal rather than a surprise.
  await expect(page.getByTestId('fuel-unaffordable')).toBeVisible();
  await page.getByTestId('buy-fuel').click();
}

test('F-162-1 · an unaffordable fill releases the die it burned, so the cockpit stops claiming to be armed', async ({
  page,
}) => {
  await newGameSeed(page, SEED);

  const spentBefore = await page.locator('[data-testid="die"][data-spent="1"]').count();
  await armFirstDie(page);
  await askForUnaffordableFuel(page);

  // The engine refused, and said so.
  await expect(page.getByTestId('notice')).toContainText('Not enough credits');

  // The engine ALSO burned the die — that is the rule, and this spec does not
  // argue with it. What must not happen is the cockpit keeping the selection.
  await expect(page.locator('[data-testid="die"][data-spent="1"]')).toHaveCount(spentBefore + 1);
  await expect(
    page.locator('[data-testid="die"][aria-pressed="true"]'),
    'the burned die must be released — while it stayed armed, every die-gated control in the ' +
      'cockpit rendered enabled and every click threw `Die already spent`',
  ).toHaveCount(0);

  // The disarmed state is what the rest of the cockpit reads. Spot-check the two
  // furthest-apart die-gated surfaces: the yard bench and the depot itself.
  await expect(page.getByTestId('buy-pods')).toBeDisabled();
  await expect(page.getByTestId('buy-pods')).toHaveAttribute('title', /Pick a die first/);
  await expect(page.getByTestId('buy-fuel')).toBeDisabled();

  // And the failure mode itself is gone: nothing on screen is showing the raw
  // engine exception the false-armed state used to produce.
  await expect(page.getByTestId('notice')).not.toContainText('Die already spent');
});

test('F-162-2 · a second identical refusal is visible as a new refusal', async ({ page }) => {
  await newGameSeed(page, SEED);

  await armFirstDie(page);
  await askForUnaffordableFuel(page);
  const notice = page.getByTestId('notice');
  await expect(notice).toBeVisible();
  const firstText = ((await notice.textContent()) ?? '').trim();
  const firstKey = Number(await notice.getAttribute('data-notice-key'));
  expect(Number.isFinite(firstKey)).toBe(true);

  // Do exactly the same thing again with a second die. The words are identical —
  // which is the whole point: before the fix this produced a byte-identical DOM
  // and the cockpit read as broken rather than as refusing a second time.
  await armFirstDie(page);
  await askForUnaffordableFuel(page);
  await expect(notice).toBeVisible();
  expect(((await notice.textContent()) ?? '').trim()).toBe(firstText);
  const secondKey = Number(await notice.getAttribute('data-notice-key'));
  expect(
    secondKey,
    'a repeated identical refusal must still change the DOM — otherwise the player gets no ' +
      'signal at all that the control was pressed and refused again',
  ).toBeGreaterThan(firstKey);
});
