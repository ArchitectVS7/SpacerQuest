import { test, expect, type Page } from '@playwright/test';
import { skipFirstTurnWalkthrough } from './support/career';

// ---------------------------------------------------------------------------
// T-189 · THE SHIP PANE IS A SHIP, NOT A LEDGER.
//
// The pane used to be eight table rows plus a flat six-cell instrument strip:
// every number legible, none of them LOCATABLE. This spec asserts the thing that
// actually changed — not that the numbers exist (they always did), but that they
// are now positioned AT the part of the hull they describe.
//
// THE "NOTHING WAS LOST" PROOF IS NOT IN THIS FILE. It is that
// `shipyard.spec.ts`, `tour-one-death.spec.ts` and `walkthrough.spec.ts` pass
// UNMODIFIED across this change — they read `ship-pods`, `pods-block`,
// `fuel-per-jump`, `component-strength`, `data-strength`/`data-condition`,
// `repair-all`, `equipment-*` and the pane's rails attributes. If an assertion in
// any of those three ever has to be edited to accommodate the diagram, something
// was lost and the change is wrong. They must stay untouched.
//
// Everything below drives the real cockpit through real clicks; nothing calls the
// engine or the store directly.
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await skipFirstTurnWalkthrough(page);
});

const COMPONENT_REGIONS = [
  'hull',
  'drives',
  'cabin',
  'lifeSupport',
  'weapons',
  'navigation',
  'robotics',
  'shields',
] as const;

async function selectUnspentDie(page: Page): Promise<void> {
  await page.locator('[data-testid="die"][data-spent="0"]').first().click();
}

test('the ship pane draws an actual ship, with a region for every system', async ({ page }) => {
  await page.goto('/');

  const diagram = page.getByTestId('ship-diagram');
  await expect(diagram).toBeVisible();
  // An SVG outline, in keeping with the starmap — never raster ship art.
  expect(await diagram.evaluate((el) => el.tagName.toLowerCase())).toBe('svg');
  await expect(diagram).toHaveAttribute('data-hull', 'junker');
  // The hull silhouette itself, not just a frame.
  await expect(diagram.locator('.hull-outline')).toHaveCount(1);

  // Ten regions: the eight ship components plus the hold and the fuel load.
  await expect(page.getByTestId('ship-region')).toHaveCount(10);
  for (const id of COMPONENT_REGIONS) {
    await expect(page.locator(`[data-region="${id}"]`)).toBeVisible();
  }
  await expect(page.locator('[data-region="pods"]')).toBeVisible();
  await expect(page.locator('[data-region="fuel"]')).toBeVisible();
});

test('cargo pods are locatable AT the cargo bay', async ({ page }) => {
  await page.goto('/');

  const pods = page.locator('[data-region="pods"]');
  await expect(pods).toBeVisible();
  // The junker's str-1 hull holds exactly the ten pods it already carries, so a
  // fresh captain's bay reads 10/10 — full. (It becomes 10/100 the moment the
  // tier-1 hull is bought; `shipyard.spec.ts` asserts that same 10/100 on the
  // pods block, and the test below drives it through the diagram.)
  await expect(pods).toHaveAttribute('data-pods-owned', '10');
  await expect(pods).toHaveAttribute('data-pods-max', '10');
  await expect(pods).toContainText('10/10');

  // The bay's fill meter is texture, not a per-pod count: ten segments, all lit
  // on a full hold. (`maxCargoPods` reaches 100 — 100 cells would be unreadable,
  // which is the ledger problem this task exists to fix.)
  const meter = page.getByTestId('bay-meter');
  await expect(meter).toHaveAttribute('data-lit', '10');
  await expect(meter.locator('.bay-seg')).toHaveCount(10);

  // Buying the tier-1 hull triples the bay's capacity, and the meter empties out
  // to match — a glance at the bay now says "mostly empty" with no digits read.
  await selectUnspentDie(page);
  await page
    .locator('[data-testid="ship-component"][data-component="hull"]')
    .getByTestId('upgrade-component')
    .click();
  await expect(pods).toContainText('10/100');
  await expect(meter).toHaveAttribute('data-lit', '1');
});

test('the engine readouts live AT the engines, and the berths AT the cabin', async ({ page }) => {
  await page.goto('/');

  // THIS is the mechanical proof of the accept criterion "positioned AT the
  // diagram region they describe rather than in a flat list": the readout must
  // be a DESCENDANT of the region's callout, not a sibling in a strip.
  const drives = page.locator('[data-region="drives"]');
  await expect(drives.getByTestId('fuel-per-jump')).toBeVisible();
  await expect(drives.getByTestId('jump-range')).toBeVisible();
  await expect(page.locator('[data-region="cabin"]').getByTestId('crew-capacity')).toBeVisible();

  // The fuel load is drawn as a bar under the drives it feeds, and reads full on
  // a fresh junker (300/300).
  await expect(page.locator('[data-region="fuel"]')).toContainText('300/300');
  const fill = await page
    .getByTestId('fuel-bar-fill')
    .evaluate((el) => Number(el.getAttribute('width')));
  expect(Number.isFinite(fill)).toBe(true);
  expect(fill).toBeGreaterThan(0);

  // And the ids that moved here are still BARE numbers — `shipyard.spec.ts`
  // reads `fuel-per-jump` with `Number(await ...innerText())`, which is only
  // possible because the callouts are HTML rather than SVG <text>.
  expect(Number(await page.getByTestId('fuel-per-jump').innerText())).toBeGreaterThan(0);
});

test('the diagram is a live instrument, not a picture', async ({ page }) => {
  await page.goto('/');

  const pods = page.locator('[data-region="pods"]');
  const drives = page.locator('[data-region="drives"]');
  await expect(pods).toHaveAttribute('data-pods-max', '10');

  // --- Upgrade the hull through the bench: the BAY's capacity moves 10 -> 100.
  await selectUnspentDie(page);
  await page
    .locator('[data-testid="ship-component"][data-component="hull"]')
    .getByTestId('upgrade-component')
    .click();
  await expect(pods).toHaveAttribute('data-pods-max', '100');

  // --- Buy 10 pods through the pods block: the BAY's count moves 10 -> 20.
  await selectUnspentDie(page);
  await page.getByTestId('pods-amount').fill('10');
  await page.getByTestId('buy-pods').click();
  await expect(pods).toHaveAttribute('data-pods-owned', '20');
  await expect(pods).toContainText('20/100');

  // --- Upgrade the drives: the readout AT the engine bells drops.
  const fuelBefore = Number(await drives.getByTestId('fuel-per-jump').innerText());
  await selectUnspentDie(page);
  await page
    .locator('[data-testid="ship-component"][data-component="drives"]')
    .getByTestId('upgrade-component')
    .click();
  const fuelAfter = Number(await drives.getByTestId('fuel-per-jump').innerText());
  expect(fuelAfter).toBeLessThan(fuelBefore);
});

test('a fresh junker shows no damage anywhere on the hull', async ({ page }) => {
  await page.goto('/');

  // Every component starts at condition 9 (`shipyard.spec.ts`'s own seed
  // description), so nothing on the hull should be lit as damaged.
  //
  // The DAMAGED and CRITICAL branches are covered by the unit tests
  // (`src/__tests__/ship-diagram.test.ts`, "damage flags"), deliberately: reaching
  // a damaged component through the UI alone means driving combat or a hazard to a
  // specific outcome, which is a probabilistic multi-day route with no
  // deterministic hook in `e2e/support/career.ts`. Since the flags are a pure
  // projection of `shipComponents(game)` — the exact same read the bench rows
  // already render as `data-damaged` — a selector test proves the branch and this
  // spec proves the wiring.
  for (const id of COMPONENT_REGIONS) {
    await expect(page.locator(`[data-region="${id}"]`)).toHaveAttribute('data-damaged', '0');
    await expect(page.locator(`[data-region="${id}"]`)).toHaveAttribute('data-condition', '9');
  }
});

test('clicking a hull region lands on the bench row that controls it', async ({ page }) => {
  await page.goto('/');

  // The diagram is the readout; the yard bench below is the controls. A click on
  // the hull must therefore go somewhere — it flashes the row it owns.
  await page.locator('[data-region="weapons"]').click();
  await expect(
    page.locator('[data-testid="ship-component"][data-component="weapons"]'),
  ).toHaveClass(/focused/);
});

test('screenshot pass · the pane reads as a ship at a glance', async ({ page }) => {
  await page.goto('/');
  const pane = page.getByTestId('ship-pane');
  await expect(page.getByTestId('ship-diagram')).toBeVisible();
  // Clear the contextual coach card, which otherwise floats over the pane's
  // right-hand callouts (hull / navigation) in the capture.
  const coach = page.getByTestId('onboarding-dismiss');
  while (await coach.isVisible()) await coach.click();
  // `test-results/` is gitignored — nothing binary is committed. These are the
  // artifacts the T-189 accept's "screenshot pass" is judged from.
  await pane.screenshot({ path: 'test-results/T-189-ship-pane-junker.png' });

  // The same pane after real purchases, so the screenshot shows the diagram
  // carrying changed numbers rather than its initial state twice.
  await selectUnspentDie(page);
  await page
    .locator('[data-testid="ship-component"][data-component="hull"]')
    .getByTestId('upgrade-component')
    .click();
  await selectUnspentDie(page);
  await page.getByTestId('pods-amount').fill('40');
  await page.getByTestId('buy-pods').click();
  await selectUnspentDie(page);
  await page
    .locator('[data-testid="ship-component"][data-component="drives"]')
    .getByTestId('upgrade-component')
    .click();
  await expect(page.locator('[data-region="pods"]')).toContainText('50/100');
  // Clicking bench rows scrolls the pane's body; put the diagram back in frame.
  await pane.locator('.body').evaluate((el) => el.scrollTo(0, 0));
  await pane.screenshot({ path: 'test-results/T-189-ship-pane-upgraded.png' });
});
