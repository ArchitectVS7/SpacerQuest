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
// T-1103 (encounter-rate repair, core 0.08 -> 0.30): re-verified offline — both
// seeds are success-path jumps whose encounters already fired at 0.08 and still
// fire at the higher rate with byte-identical interceptor selection (Capt.Brutus
// tier 2 / Chomper tier 1). No fixture drift; the values below are unchanged.
//
// Re-fixtured for the T-1102 fuel-scarcity overhaul: jump cost is now strictly
// per-distance (12·d for the starter drives, no cap), so a rim jump (system 15,
// distance 21) burns 252 of the 300-fuel tank and leaves only 48 — below the
// 50-fuel fight cost, i.e. weapons-offline on arrival. Both scenarios now open on
// a CORE encounter that leaves plenty of fuel to fight. New seeds re-derived
// offline (replaying startDay(createInitialState(seed)) → applyPlayerAction).
//
//  Seed 43 (fight + flee + reload): dawn hand [20,18,16,14,1] on Sol.
//    - jump die INDEX 1 (value 18) to Altair-3 (system 3, distance 8, cost 96,
//      leaving 204 fuel) triggers a named tier-2 encounter, "Capt.Brutus",
//      enemyHull 2, round 1.
//    - a FIGHT with the value-14 die passes GUNS (14 vs DC 12) → hull 2→1, round→2.
//    - a RUN with the value-20 die is a natural-20 PILOT auto-success → escaped.
//
//  Seed 2 (weapons malfunction): dawn hand [17,15,10,8,1] on Sol.
//    - jump die INDEX 0 (value 17) to Pollux-7 (system 9, distance 10, cost 120,
//      leaving 180 fuel) triggers a tier-1 encounter "Chomper", enemyHull 1.
//    - fighting with the LOWEST die each round always misses (dice < DC 12) so the
//      enemy never dies; each fight burns 50 fuel. Draining 180 → 130 → 80 → 30
//      (three misses) brings up the weapons-offline band at 30 fuel (below the 50
//      fight cost), and the next FIGHT malfunctions (die burned, no hit).
const SEED_A = 43;
const A_JUMP_DIE_INDEX = 1; // value 18
const A_DEST = 3;
const A_ENEMY_NAME = 'Capt.Brutus';

const SEED_B = 2;
const B_JUMP_DIE_INDEX = 0; // value 17
const B_DEST = 9;
// Fuel remaining when the tank first drops below the 50-fuel fight cost (180 - 3×50).
const B_OFFLINE_FUEL = 30;

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

  // 3) Fight one round with the value-14 die. The round advances (enemy pressed)
  //    and the honest PLAYER roll — not the enemy counter-attack — is surfaced.
  await page.locator('[data-testid="combat-die"][data-die-value="14"]').first().click();
  await page.getByTestId('combat-fight').click();
  await expect(page.getByTestId('combat-round')).toHaveText('ROUND 2');
  // Scope the check readout to the overlay: the covered Manifest pane also mounts
  // a CheckBreakdown for any non-PILOT check, so assert on the overlay's own.
  const overlayCheck = page.getByTestId('combat-overlay').getByTestId('check-breakdown');
  await expect(overlayCheck).toBeVisible();
  await expect(overlayCheck.getByTestId('check-stat')).toHaveText('GUNS');
  await expect(overlayCheck.getByTestId('check-die')).toHaveText('14');

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
  // T-1102: jump costs are multiples of 12, so a clean drain to exactly 0 is no
  // longer reachable; the tank first dips below the 50-fuel fight cost at 30.
  await expect(offline).toContainText(`have ${B_OFFLINE_FUEL}`);

  // 2) The post-commit signal: firing anyway burns the die and draws pressure but
  //    lands no shot — the enemy hull is unchanged, proving the malfunction.
  const hullBefore = await page.getByTestId('combat-enemy-hull').getAttribute('data-hull');
  const idx = await lowestCombatDieIndex(page);
  await page.locator(`[data-testid="combat-die"][data-die-index="${idx}"]`).click();
  await page.getByTestId('combat-fight').click();
  await expect(page.getByTestId('combat-malfunction')).toBeVisible();
  await expect(page.getByTestId('combat-enemy-hull')).toHaveAttribute('data-hull', hullBefore!);
});
