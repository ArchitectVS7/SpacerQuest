import { test, expect, type Page } from '@playwright/test';
import { createInitialState, startDay, createSave, type GameState } from '@spacerquest/engine';
import { FENCE_REP_FLAG } from '@spacerquest/content';

// T-1405 acceptance — the three previously-buried M13 mechanics, each driven
// ENTIRELY through the real cockpit UI (the store is the only engine caller):
//   A. dice progression — a hired crew grows the dawn hand to 6 dice, sets a
//      floor, and grants a re-roll charge the UI can spend;
//   B. smuggling — a seeded PATROL interception scans a smuggler's hold and the
//      combat overlay renders the GUILE breakdown + its consequence;
//   C. property — buying the local port authority accrues launch-fee income that
//      ticks in at dusk.
//
// WORLD state is set up by injecting a save envelope (createSave → sq.save.v1),
// the wire.spec.ts pattern — this seeds the SCENARIO only; the feature under test
// is always exercised through the real UI, never an API shortcut. Every asserted
// number is engine-derived (verified offline by replaying the exact UI dispatch
// path: startDay(createInitialState(seed)) → applyPlayerAction, the same fork
// stream the store calls).

// ---- Test A: crew → 6 dice + floor + re-roll --------------------------------
// Seed 1 (any seed works — hiring spends a die regardless of its face). With
// credits 15000 and cabin strength 30 (→ 4 berths, engine crewCapacity) the day-1
// hand [17,15,15,7,4] hires all three roles; at the NEXT dawn the roster resolves
// to handSize 6 (base 5 + First Officer), floor 5, rerolls 1 — dawn hand
// [18,17,8,8,6,5], every face ≥ the floor.
const CREW_SEED = 1;

// ---- Test B: seeded patrol contraband scan ----------------------------------
// Seed 11 deals [20,15,13,12,11] on Sun-3. Carrying a sealed contraband pod AND a
// known fence reputation (FENCE_REP_FLAG lowers the scan DC by 4), the 1→2 jump is
// intercepted by the PATROL "Lt.Savage", who rolls a GUILE scan: die 9 vs DC 6 →
// CAUGHT. The pod is confiscated and a 500cr fine is levied. Derived offline; the
// scan draw is independent of the jump die, so any die index reproduces it.
const PATROL_SEED = 11;
const PATROL_DIE = 0; // value 20
const PATROL_DEST = 2; // Aldebaran-1
const PATROL_CHECK_DIE = 9;
const PATROL_CHECK_DC = 6;

// ---- Test C: buy a port, income ticks at dusk -------------------------------
// Seed 1 starts on Sun-3 (system 1, a purchasable core port). With 40000cr the
// buy commits (25000cr), leaving 15000; the stake accrues 300cr/dusk (no era
// event modulates system 1 at day 1), so the day-1 dusk lifts credits to 15300.
const PORT_SEED = 1;
const PORT_DUSK_INCOME = 300;

test.beforeEach(async ({ page }) => {
  // Settle the dawn-roll scramble so a die's displayed face equals its dealt value
  // the instant we read it. Each test injects its own fixture (Playwright gives
  // every test an isolated context, so localStorage starts empty — no clear needed).
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Boot the store straight into a scenario via the save envelope, then navigate. */
async function inject(page: Page, save: string): Promise<void> {
  await page.addInitScript((s) => window.localStorage.setItem('sq.save.v1', s), save);
  await page.goto('/');
}

/** Deep-cloned day-1 state on `seed`, ready to mutate for a fixture. */
function dawnState(seed: number): GameState {
  return JSON.parse(JSON.stringify(startDay(createInitialState(seed)).state)) as GameState;
}

/** The displayed face values of every dawn-hand die (first span holds the value). */
async function handFaces(page: Page): Promise<number[]> {
  return page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => Number(e.querySelector('span')?.textContent)));
}

test('with a hired crew the dock shows 6 dice and the re-roll works through the UI', async ({
  page,
}) => {
  const state = dawnState(CREW_SEED);
  state.player.credits = 15000;
  state.player.ship.cabin.strength = 30; // 4 berths (crewCapacity)
  await inject(page, createSave(state, CREW_SEED));

  // A fresh (crewless) dawn hand is the base 5 dice.
  await expect(page.getByTestId('die')).toHaveCount(5);

  // Hire all three roles through the ShipPane — each spends a die.
  const hire = async (dieIdx: number, roleId: string) => {
    await page.locator('[data-testid="die"][data-spent="0"]').nth(0).click();
    await page.locator(`[data-testid="hire-crew"][data-role-id="${roleId}"]`).click();
    await expect(
      page.locator(`[data-testid="crew-member"][data-role-id="${roleId}"]`),
    ).toBeVisible();
    void dieIdx;
  };
  await hire(0, 'crew-second'); // First Officer — +1 die
  await hire(1, 'crew-navigator'); // Navigator — one re-roll/day
  await hire(2, 'crew-quartermaster'); // Quartermaster — floor 5

  // Crew benefits land at DAWN (dawnDiceModifiers is read in startDay), so roll
  // into the next day, then read the grown hand.
  await page.getByTestId('end-day').click();

  // 6 dice (base 5 + the First Officer's extra die).
  await expect(page.getByTestId('die')).toHaveCount(6);

  // The floor + re-roll charge are surfaced on the dock, read off the engine.
  await expect(page.getByTestId('dawn-floor')).toHaveText('FLOOR 5');
  await expect(page.getByTestId('dawn-rerolls')).toContainText('RE-ROLL');

  // Every die honors the Quartermaster's floor.
  for (const f of await handFaces(page)) expect(f).toBeGreaterThanOrEqual(5);

  // Re-roll a die THROUGH THE UI — the per-die affordance appears on every unspent
  // die while a charge remains; clicking it spends the day's only charge.
  await expect(page.getByTestId('die-reroll')).toHaveCount(6);
  await page.getByTestId('die-reroll').first().click();

  // The charge is spent: the badge and the per-die affordance are both gone (the
  // deterministic signal — the rerolled face may coincidentally repeat).
  await expect(page.getByTestId('dawn-rerolls')).toHaveCount(0);
  await expect(page.getByTestId('die-reroll')).toHaveCount(0);

  // The re-rolled face still respects the floor.
  for (const f of await handFaces(page)) expect(f).toBeGreaterThanOrEqual(5);
});

test('a seeded patrol scan renders its GUILE breakdown and consequence', async ({ page }) => {
  const state = dawnState(PATROL_SEED);
  state.flags['signal.contraband.carrying'] = true; // a sealed contraband pod aboard
  state.flags[FENCE_REP_FLAG] = true; // a known fence rep — scanned harder
  await inject(page, createSave(state, PATROL_SEED));

  // The hold is flagged as carrying illicit cargo — the smuggling surface.
  await expect(page.getByTestId('contraband-hold')).toBeVisible();

  // Arm a die and jump into the patrol interception through the starmap.
  await page.getByTestId('die').nth(PATROL_DIE).click();
  const dest = page.locator(`[data-testid="starmap-system"][data-system-id="${PATROL_DEST}"]`);
  await expect(dest).toHaveAttribute('data-reachable', '1');
  await dest.click();
  await page.getByTestId('confirm-jump').click();

  // The combat overlay mounts; the patrol scan is surfaced inside it with the
  // honest GUILE breakdown (die vs DC), scoped to its own readout.
  await expect(page.getByTestId('patrol-scan')).toBeVisible();
  const check = page.getByTestId('patrol-scan-check');
  await expect(check.getByTestId('check-stat')).toHaveText('GUILE');
  await expect(check.getByTestId('check-die')).toHaveText(String(PATROL_CHECK_DIE));
  await expect(check.getByTestId('check-dc')).toHaveText(String(PATROL_CHECK_DC));

  // …and its consequence: caught → hold seized, the fine, the confiscated pod.
  const result = page.getByTestId('patrol-scan-result');
  await expect(result).toHaveAttribute('data-caught', '1');
  await expect(result).toContainText('Hold seized');
  await expect(result).toContainText('500cr');
  await expect(result).toContainText('sealed pod');
});

test('buy a port and watch income tick at dusk', async ({ page }) => {
  const state = dawnState(PORT_SEED);
  state.player.credits = 40000;
  await inject(page, createSave(state, PORT_SEED));

  // The trade pane offers the local port authority for sale — buy it with a die.
  await page.getByTestId('die').nth(0).click();
  await page.getByTestId('buy-port').click();

  // The stake is now OWNED and its per-dusk income shows in the ledger total.
  await expect(page.getByTestId('port-owned')).toBeVisible();
  await expect(page.getByTestId('port-income-total')).toHaveText(String(PORT_DUSK_INCOME));

  // Watch the income tick at dusk: read credits, roll the day, read them again.
  const readCredits = async () =>
    Number((await page.getByTestId('credits').innerText()).replace(/[^0-9]/g, ''));
  const before = await readCredits();
  await page.getByTestId('end-day').click();
  const after = await readCredits();
  expect(after).toBe(before + PORT_DUSK_INCOME);
});
