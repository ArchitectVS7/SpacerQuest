import { test, expect, type Page } from '@playwright/test';
import { signOpeningMarker, skipFirstTurnWalkthrough } from './support/career';

// ---------------------------------------------------------------------------
// T-162 · F-162-1 and F-162-2, encoded as tests.
//
// Both bugs were found by the long-haul DOM sweep this task shipped
// (`long-haul.spec.ts`), and both are fixed in `store.ts`. The fix-then-encode
// discipline (T-1605b) says the sweep that found them is not the check that
// keeps them fixed: a randomized walk may or may not revisit the state, so each
// gets a deterministic, named spec that reproduces it through the real UI.
//
// F-162-1 — `resolveTrade` used to spend the die BEFORE the affordability gate, so
// an unaffordable fill burnt it. `buyFuel` used to INFER the spend from the refusal
// and keep the selection, and `armed` is `selectedDie !== null` everywhere — so one
// unaffordable fill left the whole cockpit rendering armed while every click threw
// `Die already spent`.
//
// T-196a · THE HALF OF F-162-1 THAT IS NOW STRUCTURALLY IMPOSSIBLE, and the half
// that still needs guarding. M17 (docs/DAWN-HAND-REDESIGN.md §3) made `buy-fuel` a
// FREE ACTION, so a refused fill can no longer burn anything — that specific
// mis-armed state cannot be produced from this pane again. The DURABLE property is
// the FIX, not the trigger: `store.ts` reads whether the die was committed off the
// returned hand (`next.player.dawnHand?.spent[die]`) instead of inferring it, so
// the cockpit's armed state always matches the engine's. The test below now asserts
// that agreement — the hand is untouched AND the cockpit still reads armed, which
// is the honest rendering — rather than the old burn. If a future rule re-prices
// this verb, the same assertion flips back with the rule.
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
  // T-200 · Sign the Guild marker this new career opened under. `newGame` arms
  // it unconditionally (every career has its own), so this is the click a player
  // makes too; it calls no engine action, so the pinned RNG stream is unmoved.
  await signOpeningMarker(page);
  await expect(page.getByTestId('hand')).toBeVisible();
}

/** Arm the first unspent die, exactly as a player does. IDEMPOTENT: clicking the
 *  already-armed die DISARMS it (`store.ts` `selectDie`), and since T-196a a free
 *  action leaves the selection standing, so a second call must not un-arm it. */
async function armFirstDie(page: Page): Promise<void> {
  const die = page.locator('[data-testid="die"][data-spent="0"]').first();
  if ((await die.getAttribute('aria-pressed')) !== 'true') await die.click();
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

test("F-162-1 · the cockpit's armed state always agrees with the engine's hand after a refusal", async ({
  page,
}) => {
  await newGameSeed(page, SEED);

  const spentBefore = await page.locator('[data-testid="die"][data-spent="1"]').count();
  await armFirstDie(page);
  await askForUnaffordableFuel(page);

  // The engine refused, and said so.
  await expect(page.getByTestId('notice')).toContainText('Not enough credits');

  // T-196a · The refusal now burns NOTHING — `buy-fuel` is a Free Action, so the
  // hand is byte-identical across a refused fill (this assertion was
  // `spentBefore + 1`, inverted with the rule, not deleted).
  await expect(page.locator('[data-testid="die"][data-spent="1"]')).toHaveCount(spentBefore);

  // …and BECAUSE nothing was consumed, the cockpit legitimately stays armed. That
  // is the invariant F-162-1 is really about: the rendered armed state is derived
  // from the engine's own `spent` flag, never inferred from the refusal. It agreed
  // when the die was burnt, and it agrees now that it is not.
  await expect(
    page.locator('[data-testid="die"][aria-pressed="true"]'),
    'the selection must survive an action that consumed no die — inferring a spend ' +
      'from a refusal is exactly the F-162-1 defect, in the opposite direction',
  ).toHaveCount(1);

  // The armed state is what the rest of the cockpit reads. Spot-check the two
  // furthest-apart die-gated surfaces: the yard bench and the depot itself. Neither
  // may be refusing for want of a die, because the player really does still hold
  // one. (`buy-pods` can still be disabled on its OWN terms — capacity or price —
  // which is why the assertion is on the reason, not on the enabled flag.)
  await expect(page.getByTestId('buy-pods')).not.toHaveAttribute('title', /Pick a die first/);
  await expect(page.getByTestId('buy-fuel')).toBeEnabled();

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
