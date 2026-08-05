import { test, expect, type Page } from '@playwright/test';
import { skipFirstTurnWalkthrough } from './support/career';
import { DARE_MIN_WAGER, LIARS_DICE_OPPONENTS } from '@spacerquest/content';

// ---------------------------------------------------------------------------
// T-145 acceptance: THE FIXED ROSTER, SAT DOWN AGAINST THROUGH THE REAL UI
// (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §2, §8 rows 46a/49/50; obligations 25
// and 26).
//
// Every step here is a REAL CLICK on the real cockpit — no `applyPlayerAction`
// from the test, no state injection, no protocol shortcut. That is the standing
// UX-test rule and it is also the only way this file's claim means anything: the
// Accept criterion is "all 42 opponents are reachable THROUGH THE REAL UI at
// their authored port", and the only honest proof of reachability is a hand
// opened by clicking. The full 42-row shape/uniqueness half is unit-asserted in
// `packages/engine/src/__tests__/liarsDiceContent.test.ts`; this is the sample
// that proves the path exists at all.
//
// FIXTURE (shared with `liars-dice.spec.ts`): the player starts at Sol-3 (id 1,
// the home hall) at day-1 dawn. Sol-3's three authored seats are `ld-1-1` /
// `ld-1-2` / `ld-1-3`, they are ALWAYS at their port (pool A takes no part in the
// dusk roam), and they open at their authored bankrolls, so no seed makes them
// unavailable. Sol-3 authors no `wager` override, so its band is the default.
//
// Reduced motion is emulated in `beforeEach`, which puts the scene on its INSTANT
// rail: the reveal timeline is never created and the settled DOM exists on the
// very next render.
// ---------------------------------------------------------------------------

const SEED = 1;
const SUN_3 = 1;
const SEATS = LIARS_DICE_OPPONENTS[SUN_3];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // T-187 · This spec is NOT testing the first-time flow — retire the scripted
  // first-turn walkthrough before the app boots, or its rails would make the
  // panes below inert. See `support/career.ts`.
  await skipFirstTurnWalkthrough(page);
});

async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

function rosterRow(page: Page, id: string) {
  return page.locator(`[data-testid="hangout-roster-opponent"][data-npc-id="${id}"]`);
}

function move(page: Page, kind: string) {
  return page.locator(`[data-testid="dare-move"][data-move="${kind}"]`);
}

async function openHangout(page: Page): Promise<void> {
  await page.goto('/');
  await newGameSeed(page, SEED);
  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();
}

test('the house’s three seats render at their authored port, by NAME', async ({ page }) => {
  await openHangout(page);

  // A SECOND, VISUALLY SEPARATE SECTION beside the roaming captains. The two
  // pools are different things — one is a finite authored gauntlet, the other is
  // whoever happens to be in port — and the picker says so.
  const rows = page.locator('[data-testid="hangout-roster-opponent"]');
  await expect(rows).toHaveCount(3);
  for (const seat of SEATS) {
    const row = rosterRow(page, seat.id);
    await expect(row).toBeVisible();
    // THE AUTHORED NAME, not the raw `ld-1-2` id.
    await expect(row).toContainText(seat.name);
    await expect(row).toHaveAttribute('data-beaten', 'false');
    await expect(row).toHaveAttribute('data-broke', 'false');
    await expect(row).toBeEnabled();
  }

  // …and pool B is still there, untouched, in its own section.
  await expect(page.locator('[data-testid="hangout-npc"]').first()).toBeVisible();
});

test('play a hand against a roster opponent end to end, with their lines', async ({ page }) => {
  await openHangout(page);

  const seat = SEATS[0]; // Sol-3 seat 1 — the journeyman
  await rosterRow(page, seat.id).click();
  await page.getByTestId('dare-wager').fill(String(DARE_MIN_WAGER));
  // The commit button must ENABLE for a roster selection: `chosen` accepts a
  // non-broke roster id, which is the difference between the section rendering
  // and the section working. T-197 · no die is armed — the open is free (§3).
  await expect(page.getByTestId('dare-commit')).toBeEnabled();
  await page.getByTestId('dare-commit').click();

  // --- the table, with the house's own voice ---
  await expect(page.getByTestId('dare-scene')).toBeVisible();
  await expect(page.getByTestId('dare-dealer-name')).toHaveText(seat.name.toUpperCase());
  // OBLIGATION 26, arm 1: the authored table talk, in the DOM at open.
  await expect(page.getByTestId('dare-table-talk')).toHaveText(seat.lines.tableTalk);

  // The hidden-dice discipline is unchanged for a roster hand.
  await expect(page.locator('[data-testid="dare-dealer-die"]')).toHaveCount(4);
  await expect(page.locator('[data-testid="dare-dealer-die"][data-face]')).toHaveCount(0);

  const creditsBefore = await page.getByTestId('credits').textContent();

  // --- play it out: open the bidding, then call ---
  await page.getByTestId('dare-quantity').fill('2');
  await page.getByTestId('dare-face').fill('3');
  await expect(move(page, 'bid')).toBeEnabled();
  await move(page, 'bid').click();

  // The dealer answers synchronously inside that same action, so the hand is
  // either still standing or already settled. Both are legal — assert the
  // invariant, not one seed's script.
  if ((await page.getByTestId('dare-reveal').count()) === 0) {
    await move(page, 'challenge').click();
  }

  // --- the verdict, in the opponent's own words ---
  const reveal = page.getByTestId('dare-reveal');
  await expect(reveal).toBeVisible();
  const outcome = await reveal.getAttribute('data-outcome');
  expect(outcome).toMatch(/^(challenge-win|challenge-loss|dealer-fold)$/);

  // OBLIGATION 26, arms 2 and 3: their `lose` line when the captain took the pot,
  // their `win` line when they did. The ENGINE picked the arm; the pane prints it.
  const playerWon = outcome === 'challenge-win' || outcome === 'dealer-fold';
  await expect(page.getByTestId('dare-opponent-line')).toHaveText(
    playerWon ? seat.lines.lose : seat.lines.win,
  );

  // The purse moved and the cockpit says so, and the whole hand cost NO dawn die —
  // T-197 inverted this from "exactly one" when the open became a Free Action
  // (docs/DAWN-HAND-REDESIGN.md §3). The roster still changes none of the shipped
  // economics; the economics themselves moved.
  await expect(page.getByTestId('credits')).not.toHaveText(creditsBefore ?? '');
  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  expect(spent.filter((s) => s === '1').length).toBe(0);

  // A roster hand moves NO disposition (§7.6) — a zero rendered as an honest zero.
  await expect(page.getByTestId('dare-disposition-delta')).toHaveAttribute('data-delta', '0');

  await page.getByTestId('dare-leave').click();
  await expect(page.getByTestId('dare-scene')).toHaveCount(0);
});

test('a beaten seat is marked, and a rematch is still offered', async ({ page }) => {
  await openHangout(page);

  // Play the easy seat until it loses a hand — a real, clicked search, because a
  // player win is not guaranteed on any single seed and the claim under test is
  // about the MARK, not about winning.
  const seat = SEATS[0];
  let beaten = false;
  for (let attempt = 0; attempt < 4 && !beaten; attempt += 1) {
    if ((await rosterRow(page, seat.id).getAttribute('data-broke')) === 'true') break;
    // T-197 · EACH ATTEMPT IS A NEW DAY (docs/DAWN-HAND-REDESIGN.md §4b). A
    // tier-0 captain may OPEN one hand a day, so a search that plays several hands
    // has to roll the day over between them — through the real end-day button, the
    // way a player would. The commit control tells you so before you click it,
    // which is asserted directly below.
    if (attempt > 0) {
      await expect(page.getByTestId('dare-commit')).toBeDisabled();
      await page.getByTestId('end-day').click();
      await expect(page.getByTestId('hangout-toggle')).toBeVisible();
      await page.getByTestId('hangout-toggle').click();
      await expect(page.getByTestId('hangout-panel')).toBeVisible();
    }
    await rosterRow(page, seat.id).click();
    await page.getByTestId('dare-wager').fill(String(DARE_MIN_WAGER));
    await expect(page.getByTestId('dare-commit')).toBeEnabled();
    await page.getByTestId('dare-commit').click();
    await expect(page.getByTestId('dare-scene')).toBeVisible();
    await page.getByTestId('dare-quantity').fill('2');
    await page.getByTestId('dare-face').fill('3');
    await move(page, 'bid').click();
    if ((await page.getByTestId('dare-reveal').count()) === 0) {
      await move(page, 'challenge').click();
    }
    const outcome = await page.getByTestId('dare-reveal').getAttribute('data-outcome');
    await page.getByTestId('dare-leave').click();
    if (outcome === 'challenge-win' || outcome === 'dealer-fold') beaten = true;
  }

  if (beaten) {
    // The mark is the whole point of a beat-once gauntlet — and the row STAYS
    // enabled, because a rematch is legal and pays; it simply records nothing.
    await expect(rosterRow(page, seat.id)).toHaveAttribute('data-beaten', 'true');
    await expect(rosterRow(page, seat.id)).toContainText('beaten');
    await expect(rosterRow(page, seat.id)).toBeEnabled();
  } else {
    // Four losing hands is a legal outcome of a seeded run; the mark is then
    // correctly absent, which is the same assertion from the other side.
    await expect(rosterRow(page, seat.id)).toHaveAttribute('data-beaten', 'false');
  }
});
