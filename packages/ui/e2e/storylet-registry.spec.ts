import { test, expect, type Page } from '@playwright/test';
import { createInitialState, createSave } from '@spacerquest/engine';
import { DEEDS, RENOWN_RANKS } from '@spacerquest/content';

// T-309: the storylet & registry UX. Storylets present as a prose panel in the
// cockpit, each choice showing its authored requirement/cost; a choice whose
// requirement is unmet is locked AND shows why. Earned deeds land in the
// Registry of Deeds with their period-voice citation, and the rank readout
// tracks renown. Every assertion drives the real cockpit UI — nothing calls the
// engine directly (default seed 424242 → Day 1, Sun-3).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  // Reduced motion settles the dawn roll immediately (no scramble flake).
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** T-1406 · Open a storylet from its diegetic opener (a hold/manifest line, a
 *  wire bulletin or a port dispatch) and confirm the focused panel shows it. The
 *  badge launcher and pager are gone — opening is per-offer. No engine calls. */
async function showStorylet(page: Page, storyletId: string): Promise<void> {
  const opener = page.locator(`[data-storylet-open="${storyletId}"]`);
  await expect(opener).toBeVisible();
  await opener.click();
  const panel = page.getByTestId('storylet-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-storylet-id', storyletId);
}

/** The choice row (button + cost + lock) for a choice id in the live panel. */
function choice(page: Page, choiceId: string) {
  return page.locator(`[data-testid="storylet-choice"][data-choice-id="${choiceId}"]`);
}

test('a locked choice shows its requirement and unlocks when a die is assigned', async ({
  page,
}) => {
  await page.goto('/');
  // The Guild Auditor is one of Day 1's Sun-3 offers; its die-gated choices are
  // the locked-requirement demonstrator.
  await showStorylet(page, 'port.sun3.guild-auditor');

  // The GUILE-check "argue" choice needs a die. Before one is assigned it is
  // disabled, its cost badge names the check, and its lock names the reason.
  const argue = choice(page, 'argue');
  const argueBtn = argue.getByTestId('storylet-choice-btn');
  await expect(argueBtn).toBeDisabled();
  await expect(argue.getByTestId('storylet-choice-cost')).toHaveText('GUILE DC 12 · die');
  await expect(argue.getByTestId('storylet-choice-lock')).toHaveText('Assign a die');

  // The credit+die "pay" choice always shows its full cost, too.
  await expect(choice(page, 'pay').getByTestId('storylet-choice-cost')).toHaveText('75cr · die');

  // Assign a die → the requirement is met and the lock clears (button enabled),
  // proving the gate is real, not decorative.
  await page.getByTestId('die').first().click();
  await expect(argueBtn).toBeEnabled();
  await expect(argue.getByTestId('storylet-choice-lock')).toHaveCount(0);
  // The cost badge stays visible even once the requirement is met.
  await expect(argue.getByTestId('storylet-choice-cost')).toHaveText('GUILE DC 12 · die');
});

test('playing the doc-salvage chain earns a deed that appears in the Registry with citation', async ({
  page,
}) => {
  await page.goto('/');

  // Day 1: answer Doc Salvage's distress ping (a no-die choice) — this schedules
  // the follow-up storylet a day out.
  await showStorylet(page, 'chain.doc-salvage.distress-ping');
  await choice(page, 'answer').getByTestId('storylet-choice-btn').click();
  // The resolved storylet drops off the offer queue.
  await expect(
    page.locator(
      '[data-testid="storylet-panel"][data-storylet-id="chain.doc-salvage.distress-ping"]',
    ),
  ).toHaveCount(0);

  // Roll into Day 2 — the follow-up now surfaces.
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('day')).toHaveText('2');

  await showStorylet(page, 'chain.doc-salvage.follow-up');
  await choice(page, 'accept-thanks').getByTestId('storylet-choice-btn').click();

  // The Beacon Keeper deed is now earned. Open Records → Registry of Deeds and
  // assert the deed with its period-voice citation text.
  await page.getByTestId('records-toggle').click();
  await expect(page.getByTestId('records-tab-registry')).toHaveAttribute('aria-pressed', 'true');
  const deed = page.locator('[data-testid="registry-deed"][data-deed-id="beacon_keeper"]');
  await expect(deed).toBeVisible();
  await expect(deed.getByTestId('registry-deed-title')).toHaveText('Beacon Keeper');
  await expect(deed.getByTestId('registry-deed-citation')).toContainText('answered mayday');

  // One deed bumps renown to Commander — the bezel rank readout updates.
  await expect(page.getByTestId('rank')).toHaveText('Commander');
  await expect(page.getByTestId('registry-rank')).toHaveText('Commander');
});

// T-1504 · The Conqueror capstone + a new-verb deed render in the cockpit's
// Registry pane. Reaching 30 deeds through play takes hundreds of days (proven
// headlessly by the sim conqueror sweep — the same precedent T-114a set for the
// renown gates), so this UI-reachability proof loads a Conqueror career as the
// boot autosave (the store's own `sq.save.v1` = engine `createSave`) and asserts
// the GENERIC registry pane surfaces the top rank and a T-1504 new-verb deed's
// title + citation — no new component, the same path every deed/rank flows through.
test('the Conqueror rank and a new-verb deed render in the Registry pane', async ({ page }) => {
  const SEED = 424242;
  const landlord = DEEDS.find((d) => d.id === 'landlord')!;
  const landlordCitation = landlord.citationTemplate.replaceAll('{day}', '120');

  // Build a 30-deed CONQUEROR career headlessly: 29 filler deeds + the real
  // `landlord` new-verb deed. Rank is a pure function of earned.length, so this
  // is exactly the registry a long veteran run produces on its 30th deed.
  const state = createInitialState(SEED);
  const earned = Array.from({ length: 29 }, (_v, i) => ({
    id: `deed-${i}`,
    title: `Deed ${i}`,
    citation: `Filler ${i}.`,
    day: 1,
    eventIndex: i,
  }));
  earned.push({
    id: landlord.id,
    title: landlord.title,
    citation: landlordCitation,
    day: 120,
    eventIndex: 100,
  });
  state.player.registry.earned = earned;
  state.player.registry.renownRank = 'CONQUEROR';
  const save = createSave(state, SEED);

  // Clear, then seed the autosave the store boots from (initScripts run in order:
  // the beforeEach clear first, this write second) — the app loads straight into
  // the Conqueror career.
  await page.addInitScript((blob) => window.localStorage.setItem('sq.save.v1', blob), save);
  await page.goto('/');

  // The bezel + registry rank readouts show the top rank (RENOWN_RANKS label).
  await expect(page.getByTestId('rank')).toHaveText(RENOWN_RANKS.CONQUEROR.label);
  await page.getByTestId('records-toggle').click();
  await expect(page.getByTestId('registry-rank')).toHaveText(RENOWN_RANKS.CONQUEROR.label);

  // The new-verb deed is player-visible with its authored period-voice citation.
  const deed = page.locator('[data-testid="registry-deed"][data-deed-id="landlord"]');
  await expect(deed).toBeVisible();
  await expect(deed.getByTestId('registry-deed-title')).toHaveText(landlord.title);
  await expect(deed.getByTestId('registry-deed-citation')).toContainText('bought a berth');
});

// The complementary NON-EMPTY assertion (a fragment reached through the Explore
// UI so the Nemesis File renders populated) lives in exploration.spec.ts (T-1403);
// this empty-state spec is retained, not replaced.
test('the Nemesis file renders its silent empty state at zero fragments', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('records-toggle').click();
  await page.getByTestId('records-tab-nemesis').click();

  await expect(page.getByTestId('nemesis')).toBeVisible();
  await expect(page.getByTestId('nemesis-count')).toHaveText('0 FRAGMENTS · 0 DECODED');
  await expect(page.getByTestId('nemesis-empty')).toBeVisible();
});
