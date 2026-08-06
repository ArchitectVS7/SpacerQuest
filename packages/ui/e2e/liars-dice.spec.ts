import { test, expect, type Page } from '@playwright/test';
import { signOpeningMarker, skipFirstTurnWalkthrough } from './support/career';
// T-221 · the disposition arm's number at its source, so a retune of LD-26's
// constant moves what this spec expects rather than reddening a literal.
import { DARE_FOLD_DISPOSITION, DARE_MIN_WAGER } from '@spacerquest/content';

// ---------------------------------------------------------------------------
// T-136 acceptance: THE LIAR'S DICE TABLE, PLAYED THROUGH THE REAL UI.
//
// Every hand in this file is driven by REAL CLICKS on the real cockpit — no
// `applyPlayerAction` from the test, no state injection, no API shortcut. That is
// this project's standing UX-test rule, and it is also the only way these
// assertions mean anything: the claim under test is about what is in the DOM.
//
// THE TWO ACCEPT CRITERIA, and where each is discharged:
//   1. A full hand is playable end to end through the UI — test 1.
//   2. The dealer's dice are verifiably ABSENT from the DOM before the reveal —
//      test 2, asserted at every live frame of a hand, three ways each time
//      (no `data-face` attribute, no `.d6` cube mounted inside the slot, and the
//      `dare-dealer-face` class absent from the scene's whole innerHTML).
//
// FIXTURE (shared with `hangout.spec.ts`): the player starts at Sol-3 (id 1, the
// home hall) and the cast's index-0 NPC `npc-iron-vex` starts co-located there on
// ANY seed — `createInitialState` seats NPCs at `(index % 20) + 1` and `startDay`
// never moves them (movement is a dusk step), so Iron Vex is a valid, solvent
// (5000cr) dealer at day-1 dawn. Sol-3 authors NO `wager` override, so its band is
// the default `DARE_MIN_WAGER`–`DARE_MAX_WAGER`; the band is READ off the pane
// below rather than assumed.
//
// Reduced motion is emulated in `beforeEach`, which puts the scene on its INSTANT
// rail: the GSAP reveal timeline is never created and the settled DOM exists on
// the very next render. That is a property of the implementation, not a hack for
// the tests — see `LiarsDiceScene`.
// ---------------------------------------------------------------------------

const SEED = 1;
const DEALER = 'npc-iron-vex';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // T-187 · This spec is NOT testing the first-time flow — retire the scripted
  // first-turn walkthrough before the app boots, or its rails would make the
  // panes below inert. See `support/career.ts`.
  await skipFirstTurnWalkthrough(page);
});

/** Start a fresh, deterministic career on a chosen seed, entirely through the UI. */
async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
  // T-200 · Sign the Guild marker this new career opened under. `newGame` arms
  // it unconditionally (every career has its own), so this is the click a player
  // makes too; it calls no engine action, so the pinned RNG stream is unmoved.
  await signOpeningMarker(page);
}

function npcRow(page: Page, id: string) {
  return page.locator(`[data-testid="hangout-npc"][data-npc-id="${id}"]`);
}

function move(page: Page, kind: string) {
  return page.locator(`[data-testid="dare-move"][data-move="${kind}"]`);
}

/** Open the Hangout, seat yourself against Iron Vex and deal a hand — every step
 *  a real click, the wager set to the band's own floor as the pane reports it. */
async function openHand(page: Page): Promise<void> {
  await page.goto('/');
  await newGameSeed(page, SEED);
  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();

  // The band is the PORT's, read off the pane rather than guessed. The floor keeps
  // plenty of headroom against Sol-3's ceiling for the antes a hand will charge.
  await expect(page.getByTestId('dare-wager-bounds')).toContainText(`WAGER ${DARE_MIN_WAGER}`);
  await npcRow(page, DEALER).click();
  await page.getByTestId('dare-wager').fill(String(DARE_MIN_WAGER));
  // T-197 · NO DIE IS ARMED to open a hand — the open is a Free Action
  // (docs/DAWN-HAND-REDESIGN.md §3), bounded by the day's ROUNDS cap (§4b) rather
  // than by the dawn hand. Peek, below, is what still costs a die.
  await expect(page.getByTestId('dare-commit')).toBeEnabled();
  await page.getByTestId('dare-commit').click();
  await expect(page.getByTestId('dare-scene')).toBeVisible();
}

/**
 * THE HIDDEN-DICE ASSERTION, in one place so every frame gets the identical,
 * complete check. `peeked` is the exact number of dealer dice the player is
 * legitimately allowed to see (the one a successful Peek revealed, §8.3) — stated
 * explicitly rather than as a blanket "zero always", because a Peek is a real
 * reveal and a test that forbade it would forbid a shipped rule.
 */
async function expectDealerHidden(page: Page, peeked = 0): Promise<void> {
  const slots = page.locator('[data-testid="dare-dealer-die"]');
  // The house always seats four cups — the SLOTS exist, which is what makes the
  // absence of their faces a real claim rather than an absent element.
  await expect(slots).toHaveCount(4);
  // 1. No face DATA on a hidden slot.
  await expect(page.locator('[data-testid="dare-dealer-die"][data-face]')).toHaveCount(peeked);
  // 2. No CUBE mounted inside a hidden slot — not merely hidden by CSS.
  await expect(page.locator('[data-testid="dare-dealer-die"] .d6')).toHaveCount(peeked);
  await expect(page.locator('[data-testid="dare-dealer-die"][data-hidden="1"]')).toHaveCount(
    4 - peeked,
  );
  // 3. A structural sweep of the whole scene's markup: the reveal-only class is
  // not anywhere in it, in any form a renderer could have smuggled it.
  const html = await page.getByTestId('dare-scene').innerHTML();
  expect(html).not.toContain('dare-dealer-face');
}

test('play a full hand of Liar’s Dice end to end through the real UI', async ({ page }) => {
  await openHand(page);

  // The pane is FORCED open while a hand stands: the engine blocks every other
  // verb behind `active-dare-hand`, so a closable panel would be a soft-lock.
  await expect(page.getByTestId('hangout-close')).toHaveCount(0);

  // Your four dice are face-up, each a real value — and each a real CSS-3D cube.
  const mine = page.locator('[data-testid="dare-player-die"]');
  await expect(mine).toHaveCount(4);
  const faces = await mine.evaluateAll((els) => els.map((e) => e.getAttribute('data-face')));
  for (const f of faces) expect(Number(f)).toBeGreaterThanOrEqual(1);
  for (const f of faces) expect(Number(f)).toBeLessThanOrEqual(6);
  await expect(page.locator('[data-testid="dare-player-die"] .d6')).toHaveCount(4);

  // The ledger reads off the engine's escrow — the seed is already debited.
  await expect(page.getByTestId('dare-ante')).toBeVisible();
  await expect(page.getByTestId('dare-pot-player')).toContainText(String(DARE_MIN_WAGER));
  await expect(page.getByTestId('dare-pot-dealer')).toContainText(String(DARE_MIN_WAGER));
  await expect(page.getByTestId('dare-headroom')).toBeVisible();
  await expect(page.getByTestId('dare-turn')).toHaveAttribute('data-actor', 'player');
  const creditsBefore = await page.getByTestId('credits').textContent();

  // --- open the bidding: 2 × 3, composed in the pane's own inputs ---
  await page.getByTestId('dare-quantity').fill('2');
  await page.getByTestId('dare-face').fill('3');
  await expect(move(page, 'bid')).toBeEnabled();
  await move(page, 'bid').click();

  // Your claim is in the public record. The dealer answers SYNCHRONOUSLY inside
  // that same action (§9.4) — so either a house row appeared, or the hand is
  // already settled. Both are legal; the seed decides which, so assert the
  // invariant rather than one seed's script.
  await expect(page.locator('[data-testid="dare-history-entry"][data-actor="player"]')).toHaveCount(
    1,
  );
  const settledEarly = (await page.getByTestId('dare-reveal').count()) > 0;
  if (!settledEarly) {
    await expect(
      page.locator('[data-testid="dare-history-entry"][data-actor="dealer"]'),
    ).toHaveCount(1);
    await expect(page.getByTestId('dare-bid')).toBeVisible();
    // CHALLENGE is legal against ANY standing bid, unconditionally and at zero
    // cost — which is what makes it a terminating move on every seed.
    await move(page, 'challenge').click();
  }

  // --- the verdict ---
  const reveal = page.getByTestId('dare-reveal');
  await expect(reveal).toBeVisible();
  const outcome = await reveal.getAttribute('data-outcome');
  expect(outcome).toMatch(/^(challenge-win|challenge-loss|dealer-fold)$/);

  if (outcome === 'dealer-fold') {
    // §6.1 · A FOLD NEVER REVEALS — the player does not learn the house's hand.
    await expect(page.locator('[data-testid="dare-dealer-die"][data-face]')).toHaveCount(0);
  } else {
    // A challenge lifts all four cups.
    await expect(page.locator('[data-testid="dare-dealer-die"][data-face]')).toHaveCount(4);
    await expect(page.locator('[data-testid="dare-dealer-die"] .d6')).toHaveCount(4);
  }

  // The signed delta is the engine's, off `DareHandResolved`, never recomputed.
  const delta = page.getByTestId('dare-credits-delta');
  await expect(delta).toBeVisible();
  const deltaAttr = await delta.getAttribute('data-delta');
  expect(Number(deltaAttr)).not.toBeNaN();
  expect(Number(deltaAttr)).not.toBe(0);

  // The purse moved, and the cockpit says so.
  await expect(page.getByTestId('credits')).not.toHaveText(creditsBefore ?? '');

  // §9.2 · THE DIE ECONOMY, AS T-197 LEFT IT: a whole hand played without a Peek
  // costs ZERO dawn dice — INVERTED from "exactly one", because the opening wager
  // is a Free Action now (docs/DAWN-HAND-REDESIGN.md §3). Bids, raises, challenges
  // and folds still cost credits, never dice, exactly as before. The Peek — the one
  // check inside the hand — still costs one, and its own test below asserts that.
  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  expect(spent.filter((s) => s === '1').length).toBe(0);

  // Leaving the table returns the pane to its idle controls — and unlocks it.
  await page.getByTestId('dare-leave').click();
  await expect(page.getByTestId('dare-scene')).toHaveCount(0);
  await expect(page.getByTestId('dare-commit')).toBeVisible();
  await expect(page.getByTestId('hangout-close')).toBeVisible();
});

test('the dealer’s dice are absent from the DOM at every frame before the reveal', async ({
  page,
}) => {
  await openHand(page);

  // FRAME 1 — the hand is dealt and nothing has been claimed.
  await expectDealerHidden(page);
  let frames = 1;

  // FRAME 2 — after the opening bid, which also carries the dealer's answer.
  await page.getByTestId('dare-quantity').fill('2');
  await page.getByTestId('dare-face').fill('3');
  await move(page, 'bid').click();
  if ((await page.getByTestId('dare-reveal').count()) === 0) {
    await expectDealerHidden(page);
    frames++;

    // FRAME 3 — after answering the dealer's answer. `raise-quantity` is offered
    // only when the engine says it is legal AND affordable, so this is gated on
    // the control's own presence rather than on arithmetic repeated here.
    if ((await move(page, 'raise-quantity').count()) > 0) {
      const standing = await page.getByTestId('dare-bid').getAttribute('data-quantity');
      await page.getByTestId('dare-quantity').fill(String(Number(standing) + 1));
      await move(page, 'raise-quantity').click();
      if ((await page.getByTestId('dare-reveal').count()) === 0) {
        await expectDealerHidden(page);
        frames++;
      }
    }
  }
  // The hidden-dice claim is about EVERY live frame, not one lucky snapshot.
  expect(frames).toBeGreaterThanOrEqual(2);

  // Now settle it, and watch the same selectors flip.
  if ((await page.getByTestId('dare-reveal').count()) === 0) {
    await move(page, 'challenge').click();
  }
  const outcome = await page.getByTestId('dare-reveal').getAttribute('data-outcome');
  if (outcome === 'dealer-fold') {
    await expect(page.locator('[data-testid="dare-dealer-die"][data-face]')).toHaveCount(0);
  } else {
    await expect(page.locator('[data-testid="dare-dealer-die"][data-face]')).toHaveCount(4);
    await expect(page.locator('[data-testid="dare-dealer-die"] .d6')).toHaveCount(4);
    const revealed = await page
      .locator('[data-testid="dare-dealer-die"]')
      .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-face'))));
    for (const v of revealed) expect(v).toBeGreaterThanOrEqual(1);
    for (const v of revealed) expect(v).toBeLessThanOrEqual(6);
  }
});

test('a fold never reveals, and it costs the seed', async ({ page }) => {
  await openHand(page);
  await expectDealerHidden(page);

  await move(page, 'fold').click();

  const reveal = page.getByTestId('dare-reveal');
  await expect(reveal).toHaveAttribute('data-outcome', 'player-fold');
  // §6.1 · The cup is NEVER lifted on a fold — the player never learns whether the
  // call would have been correct. Same three checks the live frames use.
  await expect(page.locator('[data-testid="dare-dealer-die"][data-face]')).toHaveCount(0);
  await expect(page.locator('[data-testid="dare-dealer-die"] .d6')).toHaveCount(0);
  expect(await page.getByTestId('dare-scene').innerHTML()).not.toContain('dare-dealer-face');

  // The ledger is the ENGINE's: read the rendered delta, never recompute the
  // formula here. Folding before any raise forfeits exactly the seed.
  const delta = await page.getByTestId('dare-credits-delta').getAttribute('data-delta');
  expect(Number(delta)).toBe(-DARE_MIN_WAGER);
  // 1000 starting credits − a 25cr seed already in escrow and now forfeited.
  await expect(page.getByTestId('credits')).toHaveText('975');
});

test('the Peek spends a die and shows exactly one of the house’s dice', async ({ page }) => {
  await openHand(page);
  await expectDealerHidden(page);

  // T-197 · The Peek is now the ONLY thing in the entire Hangout family that costs
  // a die (§9.2, and docs/DAWN-HAND-REDESIGN.md §3 which kept it a Main Action) and
  // the only move that rolls (§8.4) — so it needs a die armed, and the control says
  // so. It used to need a SECOND die because the open took the first; the open is
  // free now, so this is the first and only die the whole hand spends.
  await expect(move(page, 'peek')).toBeDisabled();
  await page.getByTestId('die').nth(1).click();
  await expect(move(page, 'peek')).toBeEnabled();
  await move(page, 'peek').click();

  // The honest roll renders, whichever way it went.
  const check = page.getByTestId('dare-peek-check');
  await expect(check).toBeVisible();
  await expect(check.getByTestId('check-stat')).toHaveText('GUILE');
  await expect(check.getByTestId('check-result')).toHaveText(/SUCCESS|FAILURE/);

  // The DC-12 roll is seed-dependent, so assert the INVARIANT: one die at most,
  // never the house's hand. A failed Peek burns the die and shows nothing.
  const shown = await page.locator('[data-testid="dare-dealer-die"][data-face]').count();
  expect(shown === 0 || shown === 1).toBe(true);
  await expectDealerHidden(page, shown);
  if (shown === 1) {
    await expect(page.locator('[data-testid="dare-dealer-die"][data-peeked="1"]')).toHaveCount(1);
  }

  // T-197 · EXACTLY ONE die spent — the Peek's, and nothing else's. Inverted from
  // "two: the opening wager and the Peek", because the wager no longer takes one.
  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  expect(spent.filter((s) => s === '1').length).toBe(1);

  // One Peek per hand — the window closes whether it hit or missed.
  await expect(move(page, 'peek')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// T-221 · THE FOLD TRADE IS PRICED AT THE POINT OF DECISION (F-177-1;
// `docs/LIARS-DICE-DECISIONS.md` LD-26, `docs/LIARS-DICE_REDESIGN.md` §17.7).
//
// LD-26 rules FOLD a PRICED PURCHASE of goodwill rather than a null mechanic. The
// claim under test is about what a player can SEE before they commit, so it is
// asserted in the real DOM beside the real FOLD control — a formatter assertion
// could not make it. Real clicks only, as everywhere else in this file.
//
// Both arms are checked against LIVE sources rather than against numbers typed
// here: the credit arm against the pane's own escrow cell, the disposition arm
// against `DARE_FOLD_DISPOSITION` imported from content.
// ---------------------------------------------------------------------------

test('the FOLD trade is priced at the point of decision — both arms', async ({ page }) => {
  await openHand(page);

  const trade = page.getByTestId('dare-fold-trade');
  await expect(trade).toBeVisible();

  // --- ARM 1: what the fold FORFEITS, equal to the escrow the pane itself shows.
  const staked = (await page.getByTestId('dare-pot-player').innerText()).match(/\d+/)![0];
  await expect(trade).toHaveAttribute('data-credits', staked);
  await expect(trade).toContainText(`${staked}cr`);
  // …and what it walks away from, likewise off the pane's own house cell.
  const house = (await page.getByTestId('dare-pot-dealer').innerText()).match(/\d+/)![0];
  await expect(trade).toContainText(`${house}cr`);

  // --- ARM 2: what it BUYS. The number is content's, never a literal, and the
  // sentence has to be legible to a player who has never read LD-26 — so it names
  // the captain, says "warmer", and says what warmth is for.
  await expect(trade).toHaveAttribute('data-disposition', String(DARE_FOLD_DISPOSITION));
  const dealer = await page.getByTestId('dare-dealer-name').innerText();
  expect((await trade.innerText()).toLowerCase()).toContain(dealer.toLowerCase());
  await expect(trade).toContainText(/warm/i);
  await expect(trade).toContainText(/intercept/i);
  // The RULING is not restated at the table: no threshold, no probability, no
  // crossover, and no bare "+1 disposition" jargon.
  await expect(trade).not.toContainText(/disposition|crossover|probab/i);

  // The hover and the printed line are ONE string, so they cannot drift.
  await expect(move(page, 'fold')).toHaveAttribute('title', await trade.innerText());

  // --- it TRACKS the escrow rather than freezing the opening number.
  await page.getByTestId('dare-quantity').fill('2');
  await page.getByTestId('dare-face').fill('3');
  await move(page, 'bid').click();
  if ((await page.getByTestId('dare-reveal').count()) === 0) {
    // The hand still stands (the dealer answered without settling, §9.4) — the
    // quoted price is still the pane's own live escrow, whatever it now reads.
    const now = (await page.getByTestId('dare-pot-player').innerText()).match(/\d+/)![0];
    await expect(page.getByTestId('dare-fold-trade')).toHaveAttribute('data-credits', now);
    await expect(page.getByTestId('dare-fold-trade')).toContainText(`${now}cr`);
  }
});
