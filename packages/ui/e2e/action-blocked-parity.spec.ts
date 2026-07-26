import { test, expect, type Page } from '@playwright/test';

// T-1604a · `ActionBlocked` UI/protocol parity — the `active-encounter` mirror.
//
// The protocol side of all four reasons is proven in
// packages/sim/src/__tests__/protocol.test.ts (the three "T-1604a · ActionBlocked
// parity" cases plus the pre-existing active-encounter case), and three of the
// four already have a UI mirror asserted elsewhere:
//
//   destination-locked → nemesis-crossing.spec.ts (sealed systems are not even
//                        rendered as starmap nodes while the crossing is locked)
//   no-hangout         → hangout.spec.ts (the hangout-toggle launcher is present
//                        at Sun-3 and absent one hop away)
//   career-ended       → nemesis-crossing.spec.ts / nemesis-ending.spec.ts (the
//                        ending screen REPLACES the cockpit; only ending-return)
//
// `active-encounter` was the gap. combat.spec.ts proves the overlay is VISIBLE,
// but nothing asserted App.tsx's own stated claim about it — "the starmap/trade/
// hand behind it are engine-blocked during an encounter anyway
// (applyPlayerAction returns ActionBlocked), so covering them prevents dead
// clicks" (App.tsx, CombatOverlay). This spec asserts that claim: while an
// encounter is live, no cockpit affordance for a verb the engine would refuse is
// reachable by a real pointer.
//
// TECHNIQUE — Playwright actionability, not visibility. `.starmap` and the trade
// pane deliberately STAY in the DOM behind the overlay (combat.spec.ts:265 relies
// on that), so `toBeVisible()` would be the wrong assertion: they are visible,
// they are just unclickable. `click({ trial: true })` runs the full actionability
// chain — including "receives pointer events" — WITHOUT dispatching the click, so
// a control the overlay intercepts fails the trial and the promise rejects. That
// is exactly the property under test.
//
// Fixture: seed 43 from combat.spec.ts, reused verbatim (dawn hand [20,18,16,14,1]
// on Sol; the value-18 die at index 1 jumps to Altair-3 and is interdicted by the
// tier-2 "Capt.Brutus"). No state injection beyond what that spec already does —
// the encounter is reached through the real UI.
const SEED = 43;
const JUMP_DIE_INDEX = 1;
const DEST = 3;
const ENEMY_NAME = 'Capt.Brutus';

/** Cockpit controls for verbs `applyPlayerAction` refuses with ActionBlocked
 *  while `state.encounter` is set (day.ts): Travel, Trade, Shipyard, Explore.
 *  `end-day` is deliberately NOT here — the day roll stays legal in an encounter
 *  (legalActions keeps `canWait` and the `end-day` lifecycle move), so demanding
 *  it be unreachable would assert the opposite of the rule. */
const BLOCKABLE = [
  { verb: 'Travel', selector: '[data-testid="starmap-system"][data-system-id="9"]' },
  { verb: 'Trade (sign contract)', selector: '[data-testid="sign-row"]' },
  { verb: 'Trade (buy fuel)', selector: '[data-testid="buy-fuel"]' },
  { verb: 'Shipyard (repair)', selector: '[data-testid="repair-all"]' },
  { verb: 'Explore', selector: '[data-testid="explore-sweep"]' },
];

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

test('an active encounter leaves no cockpit affordance that the engine would refuse', async ({
  page,
}) => {
  await page.goto('/');
  await newGameSeed(page, SEED);

  // Sanity: before the jump the cockpit IS live — at least one blockable control
  // is genuinely actionable. Without this the test could pass on a blank page.
  const liveBefore: string[] = [];
  for (const { verb, selector } of BLOCKABLE) {
    const control = page.locator(selector).first();
    if ((await control.count()) === 0) continue;
    try {
      await control.click({ trial: true, timeout: 1000 });
      liveBefore.push(verb);
    } catch {
      /* not actionable right now for an ordinary reason (e.g. unaffordable) */
    }
  }
  expect(
    liveBefore.length,
    `no cockpit control was actionable BEFORE the encounter — the
  probe below would be vacuous. Live: ${JSON.stringify(liveBefore)}`,
  ).toBeGreaterThan(0);

  // Interdict a jump through the real UI (combat.spec.ts's seed-43 path).
  await page.getByTestId('die').nth(JUMP_DIE_INDEX).click();
  await page.locator(`[data-testid="starmap-system"][data-system-id="${DEST}"]`).click();
  await page.getByTestId('confirm-jump').click();

  await expect(page.getByTestId('combat-overlay')).toBeVisible();
  await expect(page.getByTestId('combat-enemy-name')).toHaveText(ENEMY_NAME);

  // The cockpit is still MOUNTED behind the overlay — that is the whole point of
  // using actionability rather than visibility.
  await expect(page.locator('.starmap')).toBeVisible();

  // Every blockable control still in the DOM must now be unreachable by a pointer.
  const probed: string[] = [];
  for (const { verb, selector } of BLOCKABLE) {
    const control = page.locator(selector).first();
    if ((await control.count()) === 0) continue; // no affordance at all: also fine
    probed.push(verb);
    await expect(
      control.click({ trial: true, timeout: 1000 }),
      `${verb} is still clickable during an encounter — the engine would answer it
      with ActionBlocked('active-encounter'), so this is a dead click`,
    ).rejects.toThrow();
  }
  // Non-vacuity, pinned: the seed-43 fixture is deterministic, and on this run
  // ALL FIVE blockable affordances were mounted behind the overlay and all five
  // refused the pointer. Asserting the exact set (rather than "> 0") means a
  // control quietly disappearing from the cockpit shows up here as a failure
  // instead of silently shrinking the probe.
  expect(probed).toEqual(BLOCKABLE.map((b) => b.verb));

  // The combat verbs — the ONLY thing legalActions advertises in an encounter —
  // stay reachable, so the overlay blocks the refused verbs and nothing else.
  // (The stances arm off a selected die, exactly as the die strip does elsewhere:
  // an unarmed stance button is disabled with "Pick a die first", which is the
  // UI's own affordance rule, not the encounter block.)
  await page.locator('[data-testid="combat-die"][data-spent="0"]').first().click();
  await page.getByTestId('combat-run').click({ trial: true, timeout: 2000 });
});
