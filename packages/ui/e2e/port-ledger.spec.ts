import { test, expect, type Page } from '@playwright/test';
import { skipFirstTurnWalkthrough } from './support/career';

// ---------------------------------------------------------------------------
// T-191 · THE PORT LEDGER IS A SERVICE RACK, NOT A FOURTH COPY OF THE PANE.
//
// The owner's note: "other menus on lower right just need to be more
// interesting… it doesn't differentiate, a few shapes, a few very basic
// animations will do very good for us." The lower-right quadrant was five
// identical rectangles inside the generic pane chrome — the fourth instance of
// a look the other three quadrants had already each escaped (starmap: an SVG
// star plane; ship: T-189's annotated hull outline; manifest: T-190's rounded
// clipboard). It is now dockside HARDWARE: chamfered service plates bolted to a
// riveted rail, each stencilled with its own glyph.
//
// EVERYTHING HERE IS ASSERTED MECHANICALLY, never in prose:
//   * the rack's PARTS exist, and all three neighbouring quadrants have none of
//     them (the accept clause names all three, so all three are asserted);
//   * "differentiated" is MEASURED — a computed-style divergence against each
//     neighbour, plus a bounding-box check that the rail actually runs down the
//     left of the rack;
//   * the icon language is a LANGUAGE — five distinct stencils, one per module;
//   * the animations are WIRED TO STATE — a real fuel purchase and a real debt
//     payment, both driven through the UI, move the module's key;
//   * the motion is RAILED IN BOTH DIRECTIONS — `animation-name` is `none` under
//     reduced motion and not-`none` without it, which makes "wrapped in
//     prefers-reduced-motion" a fact about the running page rather than a claim
//     about a CSS file.
//
// "NO FUNCTIONAL BEHAVIOR CHANGES" IS NOT PROVED IN THIS FILE. It is proved by
// the thirteen existing readers of these testids — progression,
// action-blocked-parity, manifest-trade, walkthrough, demo-gate,
// storylet-delivery, settings-saves, onboarding, playtest-logging,
// tour-one-death, manifest-object, `e2e/support/career.ts` and the desktop
// shell's cockpit helper — passing with ZERO edits across this change. If any of
// them ever has to be touched to accommodate the rack, an interaction was
// changed and the change is wrong.
//
// Everything below drives the real cockpit through real clicks; nothing calls
// the engine or the store directly.
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await skipFirstTurnWalkthrough(page);
});

/** Select the first unspent die in the hand — a player's own affordance. */
async function armDie(page: Page): Promise<void> {
  await page.locator('[data-testid="die"][data-spent="0"]').first().click();
}

/** Read a handful of computed properties off an element, the T-190 pattern. */
async function styles(locator: ReturnType<Page['locator']>) {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { clipPath: cs.clipPath, animationName: cs.animationName };
  });
}

test('the rack has parts, and the other three quadrants have none of them', async ({ page }) => {
  await page.goto('/');
  const trade = page.getByTestId('trade-pane');
  await expect(trade).toBeVisible();

  // --- the parts that make it a rack ------------------------------------
  await expect(trade.locator('.lb-rail')).toHaveCount(1);
  const blocks = trade.locator('.ledger-block');
  await expect(blocks).toHaveCount(5);
  // Every module carries exactly one stencil, and it is punched into the
  // module's OWN head line — not floated somewhere decorative.
  await expect(trade.locator('.ledger-block > .lb-head > svg.lb-glyph')).toHaveCount(5);

  // --- the three neighbours have none of it -----------------------------
  for (const neighbour of ['.pane.manifest-board', '.pane.ship', '.pane.starmap']) {
    const pane = page.locator(neighbour);
    await expect(pane).toBeVisible();
    await expect(pane.locator('.lb-rail')).toHaveCount(0);
    await expect(pane.locator('.lb-glyph')).toHaveCount(0);
    await expect(pane.locator('.ledger-block')).toHaveCount(0);
  }
});

test('differentiation is measured: the plates are chamfered and the neighbours are not', async ({
  page,
}) => {
  await page.goto('/');
  const trade = page.getByTestId('trade-pane');

  // A machined chamfer — a real polygon, on every one of the five plates.
  const plateCount = await trade.locator('.ledger-block').count();
  expect(plateCount).toBe(5);
  for (let i = 0; i < plateCount; i += 1) {
    const plate = await styles(trade.locator('.ledger-block').nth(i));
    expect(plate.clipPath).not.toBe('none');
    expect(plate.clipPath).toContain('polygon');
  }

  // …and the content boxes of all three neighbouring quadrants are plain.
  for (const neighbour of [
    '.pane.manifest-board .mb-sheet',
    '.pane.ship .body',
    '.pane.starmap .body',
  ]) {
    const el = page.locator(neighbour).first();
    await expect(el).toBeVisible();
    expect((await styles(el)).clipPath).toBe('none');
  }

  // The rail runs down the LEFT of the rack, outboard of every plate, and is
  // at least as tall as the visible rack — it is a mounting rail, not a bullet.
  const railBox = await trade.locator('.lb-rail').boundingBox();
  const bodyBox = await trade.locator('.body').boundingBox();
  expect(railBox).not.toBeNull();
  expect(bodyBox).not.toBeNull();
  expect(railBox!.width).toBeLessThan(16);
  expect(railBox!.height).toBeGreaterThan(bodyBox!.height * 0.8);
  const plateCountToCheck = await trade.locator('.ledger-block').count();
  for (let i = 0; i < plateCountToCheck; i += 1) {
    const plateBox = await trade.locator('.ledger-block').nth(i).boundingBox();
    expect(plateBox).not.toBeNull();
    expect(railBox!.x + railBox!.width).toBeLessThanOrEqual(plateBox!.x);
  }
});

test('the icon language is a language: five distinct stencils, one per module', async ({
  page,
}) => {
  await page.goto('/');
  const trade = page.getByTestId('trade-pane');
  const kinds = await trade
    .locator('[data-glyph]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-glyph') ?? ''));
  expect(kinds).toHaveLength(5);
  expect(new Set(kinds).size).toBe(5);
  expect([...kinds].sort()).toEqual(['debt', 'dispatch', 'fuel', 'hold', 'port']);

  // Each module owns its own stencil — the glyph is a property of the service,
  // not decoration sprinkled over the rack.
  const pairs: Array<[string, string]> = [
    ['port-dispatches', 'dispatch'],
    ['active-contract', 'hold'],
    ['fuel-depot', 'fuel'],
    ['debt-ledger', 'debt'],
    ['port-authority', 'port'],
  ];
  for (const [testid, kind] of pairs) {
    await expect(page.getByTestId(testid).locator('> .lb-head > [data-glyph]')).toHaveAttribute(
      'data-glyph',
      kind,
    );
  }
});

test('a real fuel purchase moves the depot readout AND the depot key', async ({ page }) => {
  await page.goto('/');

  // The fresh junker starts with a FULL tank (300/300), so a purchase would
  // clamp to the ceiling and move nothing. Burn some first, exactly the way
  // `manifest-trade.spec.ts` does — the die-free debt payment first (T-1103, it
  // advances the RNG so the jump lands clean), then the value-3 die at hand
  // index 4, which fails the pilot check for Aldebaran-1 and leaves the ship at
  // Sol having spent the 60-fuel bill.
  await page.getByTestId('debt-amount').fill('500');
  await page.getByTestId('pay-debt').click();
  await page.getByTestId('die').nth(4).click();
  await page.locator('[data-testid="starmap-system"][data-system-id="2"]').click();
  await page.getByTestId('confirm-jump').click();
  await expect(page.getByTestId('fuel-hold')).toContainText('240');

  const depot = page.getByTestId('fuel-depot');
  const keyBefore = await depot.getAttribute('data-fuel-key');
  const holdBefore = await page.getByTestId('fuel-hold').innerText();
  expect(keyBefore).toBe('240/300');

  await armDie(page);
  await page.getByTestId('fuel-amount').fill('10');
  await page.getByTestId('buy-fuel').click();

  await expect(page.getByTestId('fuel-hold')).not.toHaveText(holdBefore);
  await expect(page.getByTestId('fuel-hold')).toContainText('250');
  // The animation is keyed off this attribute, and under `reducedMotion: reduce`
  // the paint is deliberately off — so the KEY is the mechanically checkable
  // proof that the motion is wired to the state change rather than to a timer.
  await expect(depot).toHaveAttribute('data-fuel-key', '250/300');
  expect(await depot.getAttribute('data-fuel-key')).not.toBe(keyBefore);
});

test('a real debt payment moves the owed figure AND the marker key', async ({ page }) => {
  await page.goto('/');
  const ledger = page.getByTestId('debt-ledger');
  const keyBefore = await ledger.getAttribute('data-debt-key');
  expect(keyBefore).toBe('25000:30');

  // A ledger transfer needs NO die (PRD §7.3) — deliberately none is armed here,
  // which is also the existing rule this restyle must not have disturbed.
  await page.getByTestId('debt-amount').fill('500');
  await page.getByTestId('pay-debt').click();

  await expect(page.getByTestId('debt-chip')).toContainText('24,500');
  await expect(ledger).toHaveAttribute('data-debt-key', '24500:30');
  expect(await ledger.getAttribute('data-debt-key')).not.toBe(keyBefore);
});

test('a port dispatch still opens through the restyled rack', async ({ page }) => {
  await page.goto('/');
  const dispatches = page.getByTestId('port-dispatches');
  await expect(dispatches).toBeVisible();
  // The re-post key is on the block, and the openers are inside the keyed list.
  await expect(dispatches).toHaveAttribute('data-dispatch-key', /.+/);
  const openers = dispatches.getByTestId('storylet-open');
  const count = await openers.count();
  expect(count).toBeGreaterThan(0);

  const title = (await openers.first().innerText()).trim();
  await openers.first().click();
  await expect(page.getByTestId('storylet-panel')).toBeVisible();
  await expect(page.getByTestId('storylet-title')).toContainText(title);
  await page.getByTestId('storylet-close').click();
  await expect(page.getByTestId('storylet-panel')).toHaveCount(0);
});

test('motion is railed in BOTH directions, not merely declared', async ({ page }) => {
  await page.goto('/');
  const sweep = page.getByTestId('fuel-depot').locator('.lb-sweep');
  await expect(sweep).toHaveCount(1);

  // Reduced motion (set in beforeEach): the keyframes are never applied at all —
  // instant, not "animated then skipped", which is what keeps this suite honest.
  expect((await styles(sweep)).animationName).toBe('none');
  expect((await styles(page.getByTestId('fuel-hold'))).animationName).toBe('none');

  // Without the preference the same elements carry real keyframes. A RELOAD is
  // required, not just `emulateMedia`: the cockpit reads the OS preference once
  // per render and stamps `data-motion` on `<html>` (App.tsx, T-312), and that
  // attribute is a blanket `animation: none !important` kill-switch. Asserting
  // without the reload would be asserting against a stale kill-switch, not
  // against the media query — so the reload is part of the claim.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await expect(page.getByTestId('trade-pane')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  expect((await styles(sweep)).animationName).toBe('tp-charge');
  expect((await styles(page.getByTestId('fuel-hold'))).animationName).toBe('tp-tick');
  expect(
    (await styles(page.getByTestId('port-dispatches').getByTestId('storylet-open').first()))
      .animationName,
  ).toBe('tp-post');
});

test('screenshot pass · all four quadrants, side by side', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('trade-pane')).toBeVisible();
  // Dismiss the contextual coach so it does not sit over the comparison shot —
  // a player's own clicks, nothing faked. It re-arms with the next prompt, so
  // this dismisses until the board is clear (bounded, never a spin).
  const coach = page.getByTestId('onboarding-dismiss');
  for (let i = 0; i < 10; i += 1) {
    if (!(await coach.isVisible().catch(() => false))) break;
    await coach.click();
    await page.waitForTimeout(150);
  }

  // `test-results/` is gitignored — nothing binary is committed. These are the
  // artifacts T-191's accept clause is judged from, and the FIRST of them is the
  // clause's named deliverable: "a screenshot pass comparing all four quadrants
  // side by side", so that "differentiated" is a visible claim.
  await page.locator('.main').screenshot({ path: 'test-results/T-191-quadrants.png' });
  await page.screenshot({ path: 'test-results/T-191-cockpit.png' });
  await page.getByTestId('trade-pane').screenshot({ path: 'test-results/T-191-trade-pane.png' });

  // …and the rack immediately after a real purchase, so the moved readout is in
  // the record alongside the resting state.
  await page.getByTestId('debt-amount').fill('500');
  await page.getByTestId('pay-debt').click();
  await page.getByTestId('die').nth(4).click();
  await page.locator('[data-testid="starmap-system"][data-system-id="2"]').click();
  await page.getByTestId('confirm-jump').click();
  await expect(page.getByTestId('fuel-hold')).toContainText('240');
  await armDie(page);
  await page.getByTestId('fuel-amount').fill('10');
  await page.getByTestId('buy-fuel').click();
  await expect(page.getByTestId('fuel-hold')).toContainText('250');
  await page
    .getByTestId('trade-pane')
    .screenshot({ path: 'test-results/T-191-fuel-buy-after.png' });

  // THE BELOW-THE-FOLD ASSERTION (T-189's gate went red on exactly this class of
  // problem, and T-190's first screenshot pass failed for eating 12px). The rail
  // and the chamfer must not push a control out of reach: `click()` fails on an
  // occluded or offscreen element, so these lines ARE the assertion.
  await page.getByTestId('debt-amount').click();
  await page.getByTestId('debt-amount').fill('100');
  await page.getByTestId('pay-debt').click();
  await expect(page.getByTestId('debt-chip')).toContainText('24,400');
  // The Port Authority buy sits at the very bottom of the rack, and by this
  // point every die is spent so the control is legitimately DISABLED — `hover()`
  // is the right probe: it still runs the visible / stable / receives-events
  // actionability checks (so it fails on an occluded or offscreen control) but
  // does not require the button to be enabled, which is engine state this test
  // has no business changing.
  const buyPort = page.getByTestId('buy-port');
  if ((await buyPort.count()) > 0) await buyPort.hover();
});
