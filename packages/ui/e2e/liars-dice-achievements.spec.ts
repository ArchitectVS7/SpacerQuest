import { test, expect, type Page } from '@playwright/test';
import { createInitialState, startDay, createSave, type GameState } from '@spacerquest/engine';
import { DARE_MIN_WAGER, LIARS_DICE_OPPONENTS, PORT_HANGOUTS } from '@spacerquest/content';

// ---------------------------------------------------------------------------
// T-147 acceptance: "BOTH RENDER IN THE REGISTRY WITH A CITATION", asserted
// through the real cockpit (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §6.4).
//
// That acceptance is a UX claim, so it is discharged by CLICKING: open the
// Hangout, pick the seat, set the stake, spend a die, commit, bid, leave the
// table, open Records, read the row. Nothing here calls `applyPlayerAction`, and
// nothing reads `deedRegistry()` — a view-model assertion would prove the deed
// exists, not that a player can ever see it.
//
// FIXTURE, INJECTED, FEATURE CLICKED. The save envelope (`createSave` →
// `sq.save.v1`, the `progression.spec.ts` pattern) is how the WORLD is put one
// win away from a closed set — there is no clickable way to reach 41 beaten seats
// inside a test. Everything after the injection is the real UI.
//
// THE HAND IS DERIVED, NOT HOPED FOR. Verified offline by replaying the exact UI
// dispatch path (`startDay(createInitialState(1))` → the same
// `VisitHangout{venue:'dare'}` → `Dare{move:'bid'}` the buttons dispatch, in the
// same order, on the same die index): on SEED 1, against Sun-3's third seat, at
// the minimum stake, with die 0, the single opening bid `2 × 3s` is answered by
// the dealer's challenge and settles as `challenge-win` in that same action. So
// ONE bid closes the set — there is no tolerant "loop and hope" here, because a
// tolerant loop is fine for a mark and useless for a deed.
// ---------------------------------------------------------------------------

const SEED = 1;
const SUN_3 = 1;
const SEATS = LIARS_DICE_OPPONENTS[SUN_3].map((seat) => seat.id);
/** Sun-3's third seat — the one every fixture below leaves unbeaten. */
const TARGET = SEATS[2];
/** Every authored roster id, derived — never a hand-listed 42. */
const ALL_SEATS = Object.values(LIARS_DICE_OPPONENTS)
  .flat()
  .map((seat) => seat.id);
/** The house whose name the citation has to say out loud. */
const SUN_3_HOUSE = PORT_HANGOUTS[SUN_3].prose.houseName;

test.beforeEach(async ({ page }) => {
  // Settle the dawn-roll scramble AND put the Dare reveal on its instant rail, so
  // the settled DOM exists on the very next render.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Boot the store straight into a fixture via the save envelope, then navigate. */
async function inject(page: Page, save: string): Promise<void> {
  await page.addInitScript((s) => window.localStorage.setItem('sq.save.v1', s), save);
  await page.goto('/');
}

/** A day-1 dawn state on the pinned seed with a chosen beaten set. */
function oneWinAway(beaten: readonly string[]): GameState {
  const state = JSON.parse(JSON.stringify(startDay(createInitialState(SEED)).state)) as GameState;
  state.player.liarsDiceBeaten = [...beaten];
  return state;
}

function rosterRow(page: Page, id: string) {
  return page.locator(`[data-testid="hangout-roster-opponent"][data-npc-id="${id}"]`);
}

function deedRow(page: Page, id: string) {
  return page.locator(`[data-testid="registry-deed"][data-deed-id="${id}"]`);
}

/** Beat `TARGET` at the Long Table, entirely by clicking. */
async function winTheLastSeat(page: Page): Promise<void> {
  await page.getByTestId('hangout-toggle').click();
  await expect(page.getByTestId('hangout-panel')).toBeVisible();

  // The two already-beaten seats are marked, and the third is not — the fixture
  // is visible in the UI before anything is clicked.
  await expect(rosterRow(page, SEATS[0])).toHaveAttribute('data-beaten', 'true');
  await expect(rosterRow(page, SEATS[1])).toHaveAttribute('data-beaten', 'true');
  await expect(rosterRow(page, TARGET)).toHaveAttribute('data-beaten', 'false');

  await rosterRow(page, TARGET).click();
  await page.getByTestId('dare-wager').fill(String(DARE_MIN_WAGER));
  await page.getByTestId('die').nth(0).click();
  await expect(page.getByTestId('dare-commit')).toBeEnabled();
  await page.getByTestId('dare-commit').click();

  await expect(page.getByTestId('dare-scene')).toBeVisible();
  await page.getByTestId('dare-quantity').fill('2');
  await page.getByTestId('dare-face').fill('3');
  await page.locator('[data-testid="dare-move"][data-move="bid"]').click();

  // The derived script settles inside that one action — the dealer answers
  // synchronously and challenges. Asserted, not assumed: if the derivation ever
  // stops holding, THIS is what fails, rather than a mysterious empty Registry.
  const reveal = page.getByTestId('dare-reveal');
  await expect(reveal).toBeVisible();
  await expect(reveal).toHaveAttribute('data-outcome', 'challenge-win');

  await page.getByTestId('dare-leave').click();
  await expect(page.getByTestId('dare-scene')).toHaveCount(0);
  // The seat now carries the mark, so the set really is closed in the UI's own
  // terms as well as the engine's.
  await expect(rosterRow(page, TARGET)).toHaveAttribute('data-beaten', 'true');
}

async function openRegistry(page: Page): Promise<void> {
  await page.getByTestId('records-toggle').click();
  await expect(page.getByTestId('records-tab-registry')).toHaveAttribute('aria-pressed', 'true');
}

test('clearing a house files that port’s deed — and NOT the whole-circuit one', async ({
  page,
}) => {
  await inject(page, createSave(oneWinAway([SEATS[0], SEATS[1]]), SEED));
  await winTheLastSeat(page);
  await openRegistry(page);

  const deed = deedRow(page, 'liars_dice_cleared_sun_3');
  await expect(deed).toBeVisible();
  await expect(deed.getByTestId('registry-deed-title')).toHaveText('The Long Table Swept');
  // A REAL citation: the house named, the day filed, and no surviving template.
  const citation = deed.getByTestId('registry-deed-citation');
  await expect(citation).toContainText(SUN_3_HOUSE);
  await expect(citation).not.toContainText('{day}');
  await expect(deed).toContainText('DAY 1');

  // THE NEGATIVE HALF, and it is what proves the two scopes are discriminated
  // rather than merely both present: three seats are not forty-two.
  await expect(deedRow(page, 'liars_dice_grand_slam')).toHaveCount(0);
});

test('clearing the last seat on the circuit files BOTH deeds, each with a citation', async ({
  page,
}) => {
  const beaten = ALL_SEATS.filter((id) => id !== TARGET);
  expect(beaten).toHaveLength(ALL_SEATS.length - 1);
  await inject(page, createSave(oneWinAway(beaten), SEED));
  await winTheLastSeat(page);
  await openRegistry(page);

  const port = deedRow(page, 'liars_dice_cleared_sun_3');
  await expect(port).toBeVisible();
  await expect(port.getByTestId('registry-deed-citation')).toContainText(SUN_3_HOUSE);

  const slam = deedRow(page, 'liars_dice_grand_slam');
  await expect(slam).toBeVisible();
  await expect(slam.getByTestId('registry-deed-title')).toHaveText('The Whole Circuit');
  await expect(slam.getByTestId('registry-deed-citation')).not.toHaveText('');
  await expect(slam.getByTestId('registry-deed-citation')).not.toContainText('{day}');
  await expect(slam).toContainText('DAY 1');
});
