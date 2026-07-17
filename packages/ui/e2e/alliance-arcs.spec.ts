import { test, expect, type Page } from '@playwright/test';
import { createInitialState, startDay, createSave, type GameState } from '@spacerquest/engine';

// T-1503 · Alliance arcs — UI reachability + the cross-faction join shift, proven
// end-to-end through the real cockpit for the League patrol writ (anchored at
// Deneb-4/system 5, a League port off the start). The WORLD is set up by injecting
// a save envelope that stands the spacer at Deneb-4 (the wire.spec.ts / progression
// .spec.ts pattern — this seeds the SCENARIO only); the arc itself is then played
// ENTIRELY through the real diegetic storylet openers + storylet panel + end-day,
// and the four-faction ALLIANCE STANDING block in the Records (Registry) overlay is
// read before and after — proving reputation is player-visible, moves through the
// arc, and that JOINING the League measurably cools the other three. No API
// shortcuts: every rep move happens by playing a real storylet choice.
const ARC_SEED = 5;

/** A veteran-phase dawn state on `seed`, standing at Deneb-4 (system 5) where the
 *  League patrol writ is a live PORT offer. Injected as the world fixture. Alliance
 *  arcs are VETERAN-phase content (ep1 is `eras:['VETERAN']`), so the era is flipped
 *  — the scenario setup, exactly as the store would stand after Tour One. */
function writState(seed: number): GameState {
  const base = createInitialState(seed);
  base.player.currentSystemId = 5; // Deneb-4 — the League anchor
  base.era = 'VETERAN';
  return startDay(base).state;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Boot the store into the fixture, then load the cockpit. */
async function inject(page: Page, save: string): Promise<void> {
  await page.addInitScript((s) => window.localStorage.setItem('sq.save.v1', s), save);
  await page.goto('/');
}

/** Open a storylet from its diegetic opener and confirm the focused panel shows it. */
async function showStorylet(page: Page, storyletId: string): Promise<void> {
  const opener = page.locator(`[data-storylet-open="${storyletId}"]`);
  await expect(opener).toBeVisible();
  await opener.click();
  const panel = page.getByTestId('storylet-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-storylet-id', storyletId);
}

function choice(page: Page, choiceId: string) {
  return page.locator(`[data-testid="storylet-choice"][data-choice-id="${choiceId}"]`);
}

/** Read a faction's standing value from the Records → Registry standing block. */
async function readStanding(page: Page, faction: string): Promise<string> {
  await page.getByTestId('records-toggle').click();
  await expect(page.getByTestId('alliance-standing')).toBeVisible();
  const value = (await page.getByTestId(`alliance-standing-${faction}`).textContent()) ?? '';
  await page.getByTestId('records-close').click();
  return value.trim();
}

test('the League patrol writ plays through the UI and joining shifts the other factions', async ({
  page,
}) => {
  await inject(page, createSave(writState(ARC_SEED), ARC_SEED));

  // Every faction starts neutral — the standing block renders four zeros.
  expect(await readStanding(page, 'league')).toBe('0');
  expect(await readStanding(page, 'dragons')).toBe('0');

  // Episode 1 — the writ (a requirement-free "engage" today), +5 League.
  await showStorylet(page, 'alliance.league.writ');
  await choice(page, 'engage').getByTestId('storylet-choice-btn').click();
  expect(await readStanding(page, 'league')).toBe('+5');

  // Episode 2 — the sweep, scheduled for the next dawn, gated on League >= 3. Take
  // the requirement-free "work the desk" beat (+2 → +7).
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('day')).toHaveText('2');
  await showStorylet(page, 'alliance.league.sweep');
  await choice(page, 'work-the-desk').getByTestId('storylet-choice-btn').click();
  expect(await readStanding(page, 'league')).toBe('+7');

  // Episode 3 — the commission, gated on League >= 6. Committing applies the
  // cross-faction shift: League +8 (→ +15), the other three −5 each.
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('day')).toHaveText('3');
  await showStorylet(page, 'alliance.league.commission');
  await choice(page, 'commit').getByTestId('storylet-choice-btn').click();

  // The terminal episode resolved: its opener is gone (completed, never re-offers).
  await expect(page.locator('[data-storylet-open="alliance.league.commission"]')).toHaveCount(0);

  // The standing readout reflects the join: League warmed, the other three cooled.
  expect(await readStanding(page, 'league')).toBe('+15');
  expect(await readStanding(page, 'dragons')).toBe('-5');
  expect(await readStanding(page, 'confederation')).toBe('-5');
  expect(await readStanding(page, 'rebels')).toBe('-5');
});
