import { test, expect, type Page } from '@playwright/test';
import { FIGHT_FUEL_COST } from '@spacerquest/content';

// T-307 acceptance: the combat overlay is a full-screen instrument driven end to
// end through the UI — an encounter is fought and fled, the weapons-malfunction
// (fuel-gated) state is loudly communicated, and the fight survives a reload
// mid-encounter. Nothing here calls the engine directly.
//
// SCENARIO FIXTURES — computed OFFLINE by replaying the engine exactly as the
// store does (startDay(createInitialState(seed)) → applyPlayerAction). They are
// engine-derived and must be regenerated if the RNG/danger tables ever change.
//
// Re-fixtured for the T-1101 2D starmap: Antares-5 (system 15) now sits ~21 units
// from Sol (distance 21, pilot DC 18), so the jump die must clear DC 18 — the old
// seed-11 value-15 die no longer reaches the rim. New seeds re-derived offline.
//
//  Seed 887 (fight + flee + reload): dawn hand [20,18,13,7,6] on Sol.
//    - jump die INDEX 1 (value 18, clears DC 18) to system 15 triggers an
//      anonymous tier-2 RIM_PIRATE, "RP-Piet Nym", enemyHull 2, round 1.
//    - a FIGHT with the value-13 die passes GUNS (13 vs DC 12) → hull 2→1, round→2.
//    - a RUN with the value-20 die is a natural-20 PILOT auto-success → escaped.
//
//  Seed 2 (weapons malfunction): dawn hand [17,15,10,8,1] on Sol.
//    - jump die INDEX 0 (value 17, clears DC 18) to system 15 triggers a tier-2
//      encounter, enemyHull 2, fuel 250.
//    - fighting with the LOWEST die each round always misses (dice < DC 12) so the
//      enemy never dies; each fight burns 50 fuel. Draining 250→<50 (standing down
//      to weather dusk and re-arm when the hand runs dry) brings up the weapons-
//      offline band, and the next FIGHT malfunctions (die burned, no hit).
const SEED_A = 887;
const A_JUMP_DIE_INDEX = 1; // value 18
const A_DEST = 15;
const A_ENEMY_NAME = 'RP-Piet Nym';

const SEED_B = 2;
const B_JUMP_DIE_INDEX = 0; // value 17
const B_DEST = 15;

test.beforeEach(async ({ page }) => {
  // Each test runs in a fresh, isolated context, so localStorage starts empty —
  // we deliberately do NOT clear it on every navigation (an addInitScript would
  // re-run on page.reload() and wipe the mid-encounter autosave the reload test
  // depends on).
  // Settle the dawn-roll scramble so a die's displayed face equals its dealt
  // value the instant we read it (same pattern as dawn-hand/starmap specs).
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function newGameSeed(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByLabel('seed').fill(String(seed));
  await page.getByRole('button', { name: 'Roll' }).click();
}

/** Jump from the starmap: assign the given hand die, click the destination, commit. */
async function jumpInto(page: Page, dieIndex: number, dest: number): Promise<void> {
  await page.getByTestId('die').nth(dieIndex).click();
  await page.locator(`[data-testid="starmap-system"][data-system-id="${dest}"]`).click();
  await page.getByTestId('confirm-jump').click();
}

/** Index of the unspent combat die with the lowest displayed value (ties → lowest
 *  index) — identical to the offline drain simulation's die-selection strategy.
 *  Returns null when the hand is spent. */
async function lowestCombatDieIndex(page: Page): Promise<number | null> {
  const dice = page.locator('[data-testid="combat-die"][data-spent="0"]');
  const count = await dice.count();
  if (count === 0) return null;
  let bestIdx: number | null = null;
  let bestVal = Infinity;
  for (let i = 0; i < count; i++) {
    const v = Number(await dice.nth(i).getAttribute('data-die-value'));
    const idx = Number(await dice.nth(i).getAttribute('data-die-index'));
    if (v < bestVal || (v === bestVal && (bestIdx === null || idx < bestIdx))) {
      bestVal = v;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

/** Commit a FIGHT with the lowest unspent die and WAIT until that die registers
 *  as spent, so the next read sees the settled re-render (no stale data-spent
 *  race). Returns false when the hand is empty. */
async function fightLowest(page: Page): Promise<boolean> {
  const idx = await lowestCombatDieIndex(page);
  if (idx === null) return false;
  const die = page.locator(`[data-testid="combat-die"][data-die-index="${idx}"]`);
  await die.click();
  await page.getByTestId('combat-fight').click();
  await expect(die).toHaveAttribute('data-spent', '1');
  return true;
}

test('scripted-seed encounter: fought, survives reload, then fled through the UI', async ({
  page,
}) => {
  await page.goto('/');
  await newGameSeed(page, SEED_A);

  // 1) The seeded jump is intercepted → the full-screen combat instrument mounts.
  await jumpInto(page, A_JUMP_DIE_INDEX, A_DEST);
  const overlay = page.getByTestId('combat-overlay');
  await expect(overlay).toBeVisible();
  await expect(page.getByTestId('combat-enemy-name')).toHaveText(A_ENEMY_NAME);
  await expect(page.getByTestId('combat-enemy-tier')).toHaveText('TIER 2');
  await expect(page.getByTestId('combat-round')).toHaveText('ROUND 1');

  // 2) Reload mid-encounter: the autosaved encounter is restored from the save
  //    envelope, so the same enemy and round are still on station.
  await page.reload();
  await expect(page.getByTestId('combat-overlay')).toBeVisible();
  await expect(page.getByTestId('combat-enemy-name')).toHaveText(A_ENEMY_NAME);
  await expect(page.getByTestId('combat-round')).toHaveText('ROUND 1');

  // 3) Fight one round with the value-13 die. The round advances (enemy pressed)
  //    and the honest PLAYER roll — not the enemy counter-attack — is surfaced.
  await page.locator('[data-testid="combat-die"][data-die-value="13"]').first().click();
  await page.getByTestId('combat-fight').click();
  await expect(page.getByTestId('combat-round')).toHaveText('ROUND 2');
  // Scope the check readout to the overlay: the covered Manifest pane also mounts
  // a CheckBreakdown for any non-PILOT check, so assert on the overlay's own.
  const overlayCheck = page.getByTestId('combat-overlay').getByTestId('check-breakdown');
  await expect(overlayCheck).toBeVisible();
  await expect(overlayCheck.getByTestId('check-stat')).toHaveText('GUNS');
  await expect(overlayCheck.getByTestId('check-die')).toHaveText('13');

  // 4) Flee with the natural-20 die → PILOT auto-success → escape. The overlay
  //    transitions to the aftermath summary, then dismisses back to the cockpit.
  await page.locator('[data-testid="combat-die"][data-die-value="20"]').first().click();
  await page.getByTestId('combat-run').click();
  await expect(page.getByTestId('combat-aftermath')).toBeVisible();
  await expect(page.getByTestId('combat-aftermath-resolution')).toHaveText(
    /escaped|broke off|slipped/i,
  );

  await page.getByTestId('combat-dismiss').click();
  await expect(page.getByTestId('combat-overlay')).toHaveCount(0);
  await expect(page.locator('.starmap')).toBeVisible();
});

test('weapons-malfunction is clearly communicated when fuel-gated', async ({ page }) => {
  await page.goto('/');
  await newGameSeed(page, SEED_B);

  await jumpInto(page, B_JUMP_DIE_INDEX, B_DEST);
  await expect(page.getByTestId('combat-overlay')).toBeVisible();

  // No weapons-offline band yet — the tank is full enough to fire.
  await expect(page.getByTestId('combat-weapons-offline')).toHaveCount(0);

  // Drain the tank by fighting with the lowest die each round (always a miss, so
  // the enemy survives) — standing down to weather dusk when the hand runs dry —
  // until fuel drops below the fight cost and the weapons-offline band appears.
  const offline = page.getByTestId('combat-weapons-offline');
  for (let guard = 0; guard < 20 && (await offline.count()) === 0; guard++) {
    const fought = await fightLowest(page);
    if (!fought) {
      // Hand spent mid-fight — stand down to weather dusk and re-arm next dawn.
      const round = await page.getByTestId('combat-round').textContent();
      await page.getByTestId('combat-stand-down').click();
      await expect(page.getByTestId('combat-round')).not.toHaveText(round ?? '');
    }
  }

  // 1) The static, always-visible signal: WEAPONS OFFLINE, stating the shortfall.
  await expect(offline).toBeVisible();
  await expect(offline).toContainText(String(FIGHT_FUEL_COST)); // "need 50 fuel"
  await expect(offline).toContainText('have 0');

  // 2) The post-commit signal: firing anyway burns the die and draws pressure but
  //    lands no shot — the enemy hull is unchanged, proving the malfunction.
  const hullBefore = await page.getByTestId('combat-enemy-hull').getAttribute('data-hull');
  const idx = await lowestCombatDieIndex(page);
  await page.locator(`[data-testid="combat-die"][data-die-index="${idx}"]`).click();
  await page.getByTestId('combat-fight').click();
  await expect(page.getByTestId('combat-malfunction')).toBeVisible();
  await expect(page.getByTestId('combat-enemy-hull')).toHaveAttribute('data-hull', hullBefore!);
});
