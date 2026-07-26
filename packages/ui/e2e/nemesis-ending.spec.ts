import { test, expect, type Page } from '@playwright/test';
import {
  ALL_FRAGMENT_IDS,
  CROSSING_ENDING,
  CROSSING_REQUIRED_RANK,
  DEEDS,
  NEMESIS_SYSTEM_ID,
  RENOWN_DEED_THRESHOLDS,
  RENOWN_RANKS,
} from '@spacerquest/content';
import {
  commitCrossingStake,
  createInitialState,
  createSave,
  decodeFragment,
  grantFragment,
  rankForDeedCount,
  startDay,
  syncMaxFuel,
  type GameState,
} from '@spacerquest/engine';

// T-1505c · THE ENDING, THROUGH THE REAL COCKPIT — the task's two remaining
// reachability clauses: the ending screen is REACHABLE by flying the crossing,
// and it RETURNS TO MENU CLEANLY (there is no separate menu screen in this app;
// the entry surface is the day-1 cockpit with its masthead, which is exactly
// where the screen's single control lands the player).
//
// HONEST SPLIT, stated up front (the `nemesis-file.spec.ts` convention): the
// injected save sets the SCENARIO only — a Conqueror standing at Mizar-9 holding
// all twelve fragments DECODED, with the stake already signed. Every fragment is
// granted and decoded through the ENGINE'S OWN helpers, the registry is stood up
// by its DEED LEDGER (the engine re-derives the rank from `earned.length`), and
// the stake is taken by the engine's own `commitCrossingStake` — never a
// hand-written flag. Everything after that is PLAYED: the jump, the ending, the
// return, the reload.
//
// `nemesis-crossing.spec.ts` (T-1505b's committed proof of the locked→staked→
// flown journey) is deliberately left untouched; this is a separate spec that
// picks up where it stops.
//
// SEED PROVENANCE: seed 18 — the same pinned seed the crossing spec uses, for
// the same reason. Its day-1 hand at Mizar-9 [18,17,8,8,6] clears the crossing's
// PILOT DC on the highest die against a fitted navigation suite, and the crossing
// route takes no encounter roll at all.
const ENDING_SEED = 18;
const MIZAR = 18;
const STAKE = 60000;

/** The scenario fixture — see the HONEST SPLIT above for input vs played. */
function stakedAtTheBench(seed: number): GameState {
  const base = createInitialState(seed);
  base.player.currentSystemId = MIZAR;
  base.player.registry.earned = DEEDS.slice(0, RENOWN_DEED_THRESHOLDS.CONQUEROR).map(
    (deed, index) => ({
      id: deed.id,
      title: deed.title,
      citation: deed.citationTemplate,
      day: 1,
      eventIndex: index,
    }),
  );
  base.player.registry.renownRank = rankForDeedCount(base.player.registry.earned.length);
  base.player.credits = STAKE;
  base.player.debt = 0;
  base.player.loan = null;
  base.player.ship.drives = { strength: 60, condition: 9 };
  base.player.ship.hull = { strength: 30, condition: 9 };
  base.player.ship.navigation = { strength: 90, condition: 9 };
  syncMaxFuel(base.player.ship);
  base.player.ship.fuel = base.player.ship.maxFuel;
  for (const id of ALL_FRAGMENT_IDS) {
    grantFragment(base.player.nemesisFile, id, 'sage', base.day);
    decodeFragment(base.player.nemesisFile, id);
  }
  // The engine's OWN stake path — the flags are written by the resolver, not here.
  if (!commitCrossingStake(base, [])) {
    throw new Error('fixture regression: the stake was refused');
  }
  return startDay(base).state;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function inject(page: Page, save: string): Promise<void> {
  await page.addInitScript((s) => window.localStorage.setItem('sq.save.v1', s), save);
  await page.goto('/');
}

function statRow(page: Page, key: string) {
  return page.locator(`[data-testid="ending-stat"][data-stat="${key}"]`);
}

test('the ending: flown to, read, and returned from cleanly', async ({ page }) => {
  await inject(page, createSave(stakedAtTheBench(ENDING_SEED), ENDING_SEED));

  // ---- 1) FLY THE CROSSING, CLICKED ---------------------------------------
  await page.getByTestId('die').first().click();
  await page
    .locator(`[data-testid="starmap-system"][data-system-id="${NEMESIS_SYSTEM_ID}"]`)
    .click();
  await expect(page.getByTestId('route-preview')).toBeVisible();
  await page.getByTestId('confirm-jump').click();

  // ---- 2) THE ENDING SCREEN, WITH CONTENT'S OWN WORDS ---------------------
  const ending = page.getByTestId('ending-screen');
  await expect(ending).toBeVisible();
  await expect(page.getByTestId('ending-kicker')).toHaveText(CROSSING_ENDING.kicker);
  await expect(page.getByTestId('ending-title')).toHaveText(CROSSING_ENDING.title);
  // Every authored paragraph, in order — imported from content, never re-typed.
  await expect(page.getByTestId('ending-prose')).toHaveCount(CROSSING_ENDING.prose.length);
  for (let i = 0; i < CROSSING_ENDING.prose.length; i += 1) {
    await expect(page.getByTestId('ending-prose').nth(i)).toHaveText(CROSSING_ENDING.prose[i]);
  }
  await expect(page.getByTestId('ending-signoff')).toHaveText(CROSSING_ENDING.signOff);

  // The career summary reads the engine's own epilogue numbers.
  await expect(statRow(page, 'day')).toContainText('1');
  await expect(statRow(page, 'rank')).toContainText(RENOWN_RANKS[CROSSING_REQUIRED_RANK].label);
  await expect(statRow(page, 'fragments')).toContainText(
    `${ALL_FRAGMENT_IDS.length} of ${ALL_FRAGMENT_IDS.length} decoded`,
  );
  await expect(statRow(page, 'stake')).toContainText(`${STAKE.toLocaleString('en-US')} CR`);
  // A first-run spacer lost no ship, so the succession row is not rendered at all.
  await expect(statRow(page, 'successions')).toHaveCount(0);

  // ---- 3) THE COCKPIT IS GONE, NOT MERELY COVERED -------------------------
  // The engine refuses every verb from the far side; leaving live controls behind
  // this screen would be a wall of dead clicks.
  await expect(page.locator('.pane.starmap')).toHaveCount(0);
  await expect(page.getByTestId('hand')).toHaveCount(0);
  await expect(page.getByTestId('records-toggle')).toHaveCount(0);
  // …and there is no way to back out of it: the return control is the only one.
  await expect(ending.locator('button')).toHaveCount(1);

  // ---- 4) RETURN: A FRESH DAY-1 COCKPIT -----------------------------------
  await page.getByTestId('ending-return').click();
  await expect(page.getByTestId('ending-screen')).toHaveCount(0);
  await expect(page.getByTestId('records-toggle')).toBeVisible();
  await expect(page.getByTestId('day')).toHaveText('1');
  await expect(page.getByTestId('die')).toHaveCount(5);
  const spent = await page
    .getByTestId('die')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-spent')));
  expect(spent.filter((s) => s === '1')).toHaveLength(0);
  await expect(page.getByTestId('notice')).toHaveCount(0);

  // The new career carries none of the old one's Signal.
  await page.getByTestId('records-toggle').click();
  await page.getByTestId('records-tab-nemesis').click();
  await expect(page.getByTestId('nemesis-count')).toHaveText('0 FRAGMENTS · 0 DECODED');
  await expect(page.getByTestId('nemesis-fragment')).toHaveCount(0);
  await page.getByTestId('records-close').click();

  // ---- 5) "CLEANLY" — IT SURVIVES A RELOAD --------------------------------
  // The autosave `newGame` wrote is the NEW career, not the ended one, so a
  // reload comes back to the fresh cockpit and never to the ending screen.
  await page.reload();
  await expect(page.getByTestId('ending-screen')).toHaveCount(0);
  await expect(page.getByTestId('day')).toHaveText('1');
  await expect(page.getByTestId('die')).toHaveCount(5);
});
