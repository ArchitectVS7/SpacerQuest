import { test, expect, type Page } from '@playwright/test';
import { signOpeningMarker, skipFirstTurnWalkthrough } from './support/career';

// ---------------------------------------------------------------------------
// T-190 · THE MANIFEST IS AN OBJECT, NOT A PANE.
//
// The owner's note: "the contract manifest probably needs to be a clickable item,
// available only in a port… Make it stand out as distinct from everything else."
// The manifest used to be a second instance of `.pane` sitting in the same grid
// as the port ledger, with the same 1px hairline and the same header — visually
// interchangeable with the thing beside it.
//
// This spec asserts BOTH halves of what actually changed, mechanically:
//   * it is a distinct OBJECT — clip, stamp, thicker frame, physical tilt — and
//     the trade pane beside it has none of that (assertion, not prose);
//   * it is CLICKABLE — its header stows and un-stows the paper.
//
// WHAT IS DELIBERATELY NOT HERE. The owner's second ask — "available only in a
// port" — needs an in-transit state to be unavailable DURING. Jumps are still
// instant (T-188 is BLOCKED on an owner ruling), so there is nothing to gate on
// and T-190's own accept clause forbids faking a docking flag against an
// instant-jump model. That half is filed as T-192, blocked on T-188.
//
// THE "SIGN AND HAGGLE ARE UNCHANGED" PROOF IS ONLY PARTLY IN THIS FILE. Tests 4
// and 5 below re-run those two flows through the restyled board, but the stronger
// proof is that the NINE existing specs which read the board directly —
// dawn-hand, manifest-trade, onboarding, recovery, save-write-failure, smoke,
// storylet-delivery, tour-one-death and walkthrough — plus `e2e/support/career.ts`'s
// contract picker, through which tour-one-career and every other career-driving
// spec signs its jobs, all pass with ZERO edits across this change. If any of them
// ever has to be touched to accommodate the clipboard, an interaction was changed
// and the change is wrong.
//
// Everything below drives the real cockpit through real clicks; nothing calls the
// engine or the store directly.
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await skipFirstTurnWalkthrough(page);
});

/** Select the first unspent die in the hand — the same helper shape
 *  `manifest-trade.spec.ts` uses, so an armed die is armed the player's way. */
async function armDie(page: Page): Promise<void> {
  await page.locator('[data-testid="die"][data-spent="0"]').first().click();
}

test('the manifest reads as a physical object, and the trade pane does not', async ({ page }) => {
  await page.goto('/');
  const board = page.getByTestId('manifest-board');
  await expect(board).toBeVisible();

  // --- the parts that make it an object --------------------------------
  await expect(board.locator('.mb-clip')).toHaveCount(1);
  await expect(board.locator('.mb-stamp')).toHaveCount(1);
  await expect(board.locator('.mb-sheet')).toHaveCount(1);
  await expect(board.locator('.mb-punches')).toHaveCount(1);
  await expect(board.locator('.mb-tear')).toHaveCount(1);
  // The stamp says where the paper was posted — the port, not a generic label.
  await expect(board.locator('.mb-stamp')).toContainText('DEPOT');
  await expect(board.locator('.mb-stamp')).toContainText('OFFERS');

  // --- the pane beside it has none of it -------------------------------
  const trade = page.locator('.pane.trade');
  await expect(trade).toBeVisible();
  await expect(trade.locator('.mb-clip')).toHaveCount(0);
  await expect(trade.locator('.mb-stamp')).toHaveCount(0);
  await expect(trade.locator('.mb-sheet')).toHaveCount(0);

  // --- "clearly reads as different" is MEASURED, not asserted in prose --
  const styles = async (locator: ReturnType<Page['locator']>) =>
    locator.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        borderTopWidth: cs.borderTopWidth,
        boxShadow: cs.boxShadow,
        transform: cs.transform,
        overflowY: cs.overflowY,
      };
    });
  const boardStyle = await styles(board);
  const tradeStyle = await styles(trade);
  // A thicker frame than every other pane's 1px hairline.
  expect(boardStyle.borderTopWidth).toBe('2px');
  expect(tradeStyle.borderTopWidth).toBe('1px');
  // Stacked-paper thickness: the board casts a shadow, the pane casts none.
  expect(boardStyle.boxShadow).not.toBe('none');
  expect(tradeStyle.boxShadow).toBe('none');
  // It hangs crooked — a real 2D matrix, not `none` like the pane beside it.
  expect(boardStyle.transform).not.toBe('none');
  expect(tradeStyle.transform).toBe('none');
  // And it is NOT clipped by `.pane`'s overflow, or the clip and the torn edge
  // would be sliced off at the frame (this is the rule the treatment needs most).
  expect(boardStyle.overflowY).toBe('visible');

  // The clip actually overhangs the top of the board, rather than sitting inside
  // it — the geometric difference between a clipboard and a rectangle.
  const clipBox = await board.locator('.mb-clip').boundingBox();
  const boardBox = await board.boundingBox();
  expect(clipBox).not.toBeNull();
  expect(boardBox).not.toBeNull();
  expect(clipBox!.y).toBeLessThan(boardBox!.y);
});

test('it opens by default: the board is posted and every offer is on it', async ({ page }) => {
  await page.goto('/');
  const board = page.getByTestId('manifest-board');
  await expect(board).toHaveAttribute('data-manifest-open', '1');
  await expect(page.getByTestId('manifest-toggle')).toHaveAttribute('aria-expanded', 'true');
  // The default career (store seed 424242) posts a 4-offer board — the same
  // count `manifest-trade.spec.ts` opens on. Default-open is what keeps every
  // existing spec's `getByTestId('contract')` resolving.
  await expect(page.getByTestId('contract')).toHaveCount(4);
  await expect(page.getByTestId('manifest-stowed')).toHaveCount(0);
});

test('the header is the clickable item: it stows the paper and takes it back down', async ({
  page,
}) => {
  await page.goto('/');
  const board = page.getByTestId('manifest-board');
  const toggle = page.getByTestId('manifest-toggle');
  const before = await page.getByTestId('contract').count();
  expect(before).toBeGreaterThan(0);

  // --- stow -------------------------------------------------------------
  await toggle.click();
  await expect(board).toHaveAttribute('data-manifest-open', '0');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('contract')).toHaveCount(0);
  // The paper is off, the BOARD is still bolted to the console — the object does
  // not disappear, which is the whole point of it being an object.
  await expect(board).toBeVisible();
  await expect(board.locator('.mb-clip')).toHaveCount(1);
  await expect(page.getByTestId('manifest-stowed')).toBeVisible();
  await expect(page.getByTestId('manifest-stowed')).toContainText('BOARD STOWED');

  // --- un-stow ----------------------------------------------------------
  await toggle.click();
  await expect(board).toHaveAttribute('data-manifest-open', '1');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // The SAME offers come back — stowing is presentation and touches no state.
  await expect(page.getByTestId('contract')).toHaveCount(before);
  await expect(page.getByTestId('manifest-stowed')).toHaveCount(0);
});

test('SIGN is unchanged through the restyled board', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('active-contract-empty')).toBeVisible();
  const offers = await page.getByTestId('contract').count();

  await armDie(page);
  await page.getByTestId('contract').first().click();

  // The job is signed and tracked, and the board shrank by one — the exact flow
  // `manifest-trade.spec.ts` asserts, re-run against the clipboard.
  await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);
  await expect(page.getByTestId('active-contract')).toBeVisible();
  expect(await page.getByTestId('active-contract').innerText()).not.toContain('Hold is empty');
  await expect(page.getByTestId('contract')).toHaveCount(offers - 1);
});

test('HAGGLE is unchanged: it still rolls a visible TRADE check, never a dead click', async ({
  page,
}) => {
  await page.goto('/');
  await armDie(page);
  await expect(page.getByTestId('haggle-check-preview').first()).toHaveAttribute(
    'data-tone',
    'armed',
  );
  await expect(page.getByTestId('haggle-check-preview').first()).toHaveAttribute(
    'data-stat',
    'TRADE',
  );
  await page.getByTestId('haggle').first().click();

  // An engine refusal is never silent (UGT Finding 4's lesson) and a success is
  // never invisible: either way the check breakdown surfaces the honest roll.
  await expect(page.getByTestId('check-breakdown')).toBeVisible();
  await expect(page.getByTestId('check-stat')).toHaveText('TRADE');
  await expect(page.getByTestId('check-dc')).toHaveText('12');
  // The readout lives OUTSIDE the sheet, so stowing the paper can never hide the
  // result of a roll the player just paid a die for.
  await expect(page.getByTestId('manifest-toggle')).toBeVisible();
  await page.getByTestId('manifest-toggle').click();
  await expect(page.getByTestId('manifest-board')).toHaveAttribute('data-manifest-open', '0');
  await expect(page.getByTestId('check-breakdown')).toBeVisible();
});

test('the scripted walkthrough force-opens the board — the stow can never soft-lock it', async ({
  page,
}) => {
  // NOTE: no `skipFirstTurnWalkthrough` state here — this is the ONE test in the
  // file that boots a genuine first-time player, because step 3's rails allow
  // ONLY the manifest region. A stowed board there would be a tutorial blocking
  // its own lesson.
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');
  // T-200 · A virgin profile also opens on the Guild marker, which stands in
  // FRONT of the rails by design. Sign it the way the player does; the rails are
  // untouched underneath and the card is on step 1 the moment it clears.
  await signOpeningMarker(page);
  await expect(page.getByTestId('walkthrough')).toBeVisible();

  const board = page.getByTestId('manifest-board');
  await expect(board).toHaveAttribute('data-manifest-open', '1');
  // Pressing the toggle while on rails does NOT stow it — the walkthrough wins.
  // (The manifest region is rails-shut on step 1, so the click is dispatched at
  // the DOM rather than through the `inert` subtree; the assertion is that the
  // board is open regardless of what the player did to the toggle.)
  await page.getByTestId('manifest-toggle').dispatchEvent('click');
  await expect(board).toHaveAttribute('data-manifest-open', '1');

  // Walk to step 3 the way the player does, and sign from the open board.
  await page.getByTestId('walkthrough-next').click();
  await page.getByTestId('die').nth(0).click();
  await expect(page.getByTestId('walkthrough')).toHaveAttribute(
    'data-walkthrough-step',
    'w3-take-contract',
  );
  await expect(board).toHaveAttribute('data-manifest-open', '1');
  await page.getByTestId('manifest-toggle').dispatchEvent('click');
  await expect(board).toHaveAttribute('data-manifest-open', '1');
  await page.getByTestId('contract').first().click();
  await expect(page.getByTestId('active-contract-empty')).toHaveCount(0);
});

test('screenshot pass · the manifest reads as a clipboard beside the port ledger', async ({
  page,
}) => {
  await page.goto('/');
  const board = page.getByTestId('manifest-board');
  await expect(page.getByTestId('contract')).toHaveCount(4);

  // `test-results/` is gitignored — nothing binary is committed. These are the
  // artifacts T-190's accept clause ("a distinct visual treatment… that clearly
  // reads as different from TradePane beside it") is judged from.
  await board.screenshot({ path: 'test-results/T-190-manifest-open.png' });
  // The whole right column, so the manifest and the port ledger are judged
  // SIDE BY SIDE — "distinct from the thing next to it" is a comparison, not a
  // property of one element.
  await page.locator('.main').screenshot({ path: 'test-results/T-190-manifest-vs-ledger.png' });
  // …and the whole cockpit, because the clip deliberately overhangs the board
  // into the gap above it: an element-scoped screenshot crops exactly the part
  // of the object that proves it is one.
  await page.screenshot({ path: 'test-results/T-190-cockpit.png' });

  await page.getByTestId('manifest-toggle').click();
  await expect(board).toHaveAttribute('data-manifest-open', '0');
  await board.screenshot({ path: 'test-results/T-190-manifest-stowed.png' });

  // The T-189 height lesson, re-checked here rather than assumed: the clip bar
  // adds chrome to the right column, and the trade pane's controls must still be
  // reachable at the suite viewport. `click()` fails on an occluded or offscreen
  // control, so these two lines ARE the assertion.
  await page.getByTestId('debt-amount').fill('100');
  await page.getByTestId('pay-debt').click();
  await expect(page.getByTestId('debt-chip')).toContainText('24,900');
});
