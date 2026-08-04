import { test, expect, type Page } from '@playwright/test';
import { skipFirstTurnWalkthrough } from './support/career';
import {
  EXPLORATION_NAV_DC,
  SIGNAL_FRAGMENTS,
  STAR_SYSTEMS,
  WISE_ONE_FRAGMENT_ID,
} from '@spacerquest/content';
import {
  createInitialState,
  createSave,
  startDay,
  syncMaxFuel,
  type GameState,
} from '@spacerquest/engine';

// T-1505c · THE ACQUISITION FUNNEL, THROUGH THE REAL COCKPIT — explore → find a
// Signal Fragment → carry it to the Sage → decode it. This discharges the
// deferral `nemesis-file.spec.ts` states in its header ("the full acquisition
// funnel … through the UI … belongs to T-1505c").
//
// HONEST SPLIT, stated up front (the `nemesis-file.spec.ts` convention): the
// injected save sets the SCENARIO only — a fitted mid-career ship parked at
// Achernar-5 (system 19, one jump from the Sage's bench) with a full tank and an
// EMPTY Nemesis file. Nothing about the Signal is injected: the fragment is
// found, carried and decoded entirely by clicking.
//
// Deliberately NOT duplicated here: the twelve-fragment career (that is the
// scripted long sim, `packages/sim/src/__tests__/nemesis-arc.test.ts`) and the
// crossing itself (`nemesis-crossing.spec.ts`).
//
// SEED PROVENANCE (found via the exact UI dispatch path — `startDay(fixture)`
// then `applyPlayerAction`, the same fork stream the store calls; swept seeds
// 1..200): die 0 (a high face + PILOT/nav) clears the sweep's nav DC and its
// seeded loot roll yields a Signal Fragment; die 1 then clears the
// Achernar-5 → Mizar-9 jump (distance 19, DC 17) with NO interdiction on the
// route, and the Sage's matching decode opener is on the board on arrival. The
// spec asserts each step, so a regression here is loud rather than flaky.
//
// T-1603b re-pin (seed 5 → 15). MECHANISM, and it is the same one that moved the
// two protocol goldens: the canonical RENOWN_DEED_THRESHOLDS rescale (content
// `deeds.ts`) means the sweep's earned deeds no longer push the captain through
// three rank-ups (COMMANDER/CAPTAIN/COMMODORE) but through one. Three fewer
// `RenownRankUp` + `WireEntry` pairs land in the day's event stream, which shifts
// the JUMP's action event index — and the travel rng is
// `dayRng.fork('action-travel-<index>')` (engine `day.ts`). Seed 5's jump now
// draws a different fork and is interdicted before it reaches Mizar-9.
//
// T-125-audit re-pin (seed 15 → 6). MECHANISM: T-113/T-114/T-115's 100-row
// explore outcome table and T-117's single band-weighted draw
// (docs/EXPLORE_REDESIGN.md §2.4) replaced the legacy loot table the sweep's
// `FragmentAcquired` draw ran against, so seed 15's sweep no longer finds a
// fragment (it now draws a non-lore band-1 row). RE-SWEEP (seeds 1..500, this
// exact fixture and dispatch path, in `.scratch/`): 59 seeds still land the full
// funnel — 6, 8, 24, 28, 32, 43, 57, 61, 75, 82, 96, 103, 104, 107, 140, 141,
// 146, 154, 174, 180, 188, 193, 194, 197, 238, ... — so the funnel is as broadly
// reachable as it was; only WHICH seed walks it cleanly moved again. Seed 6 is
// the first qualifier: it draws `frag-nemesis-05` and arrives at Mizar-9 with
// `sage.mizar.decode-05` on the board.
// PINNED, NOT STEERED: only the seed changed. Every assertion below is untouched.
const FUNNEL_SEED = 6;
const ACHERNAR = 19;
const MIZAR = 18;
const SWEEP_DIE = 0;
const JUMP_DIE = 1;

/** The scenario fixture — see the HONEST SPLIT above for input vs played. */
function fittedAtAchernar(seed: number): GameState {
  const base = createInitialState(seed);
  base.player.currentSystemId = ACHERNAR;
  base.player.credits = 20000;
  base.player.ship.drives = { strength: 60, condition: 9 };
  base.player.ship.hull = { strength: 30, condition: 9 };
  base.player.ship.navigation = { strength: 90, condition: 9 };
  syncMaxFuel(base.player.ship);
  base.player.ship.fuel = base.player.ship.maxFuel;
  // The Nemesis file is UNTOUCHED — empty, exactly as a fresh career's.
  return startDay(base).state;
}

/** The SHIPPED decode-storylet id for a fragment (fragment 01's path predates the
 *  numbered batch and is named differently) — the same door a player opens. */
function decodeStoryletFor(fragmentId: string): string {
  return fragmentId === WISE_ONE_FRAGMENT_ID
    ? 'sage.mizar.decode-first'
    : `sage.mizar.decode-${fragmentId.slice(-2)}`;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // T-187 · This spec is NOT testing the first-time flow — retire the scripted
  // first-turn walkthrough before the app boots, or its rails would make the
  // panes below inert. See `support/career.ts`.
  await skipFirstTurnWalkthrough(page);
});

async function inject(page: Page, save: string): Promise<void> {
  await page.addInitScript((s) => window.localStorage.setItem('sq.save.v1', s), save);
  await page.goto('/');
}

/** Open Records → Nemesis and run `read` against the live pane, then close it. */
async function inNemesisPane(page: Page, read: () => Promise<void>): Promise<void> {
  await page.getByTestId('records-toggle').click();
  await page.getByTestId('records-tab-nemesis').click();
  await expect(page.getByTestId('nemesis')).toBeVisible();
  await read();
  await page.getByTestId('records-close').click();
}

test('the funnel: sweep off-lane, find a fragment, carry it to the Sage, decode it', async ({
  page,
}) => {
  await inject(page, createSave(fittedAtAchernar(FUNNEL_SEED), FUNNEL_SEED));

  // ---- 1) THE SWEEP, CLICKED ----------------------------------------------
  await page.getByTestId('die').nth(SWEEP_DIE).click();
  await expect(page.getByTestId('explore-cost')).toContainText(`PILOT DC ${EXPLORATION_NAV_DC}`);
  await page.getByTestId('explore-sweep').click();

  await expect(page.getByTestId('check-stat')).toHaveText('PILOT');
  await expect(page.getByTestId('check-result')).toHaveText('SUCCESS');
  await expect(page.getByTestId('exploration-outcome')).toContainText('Signal Fragment');

  // ---- 2) THE FILE HAS A RAW FRAGMENT IN IT --------------------------------
  // The id is READ OFF THE DOM rather than pinned, so the assertions below track
  // whatever the seeded loot roll drew; only its TEXT is pinned, and that comes
  // from the shipped content, never a string literal here.
  let fragmentId = '';
  await inNemesisPane(page, async () => {
    await expect(page.getByTestId('nemesis-count')).toHaveText('1 FRAGMENT · 0 DECODED');
    const row = page.getByTestId('nemesis-fragment');
    await expect(row).toHaveCount(1);
    fragmentId = (await row.getAttribute('data-fragment-id')) ?? '';
    expect(SIGNAL_FRAGMENTS[fragmentId], `unknown fragment id ${fragmentId}`).toBeDefined();
    await expect(row).toHaveAttribute('data-decoded', '0');
    await expect(row.locator('.nf-text')).toHaveText(SIGNAL_FRAGMENTS[fragmentId].signal);
  });

  // ---- 3) CARRY IT TO THE SAGE, ON THE REAL STARMAP ------------------------
  await page.getByTestId('die').nth(JUMP_DIE).click();
  await page.locator(`[data-testid="starmap-system"][data-system-id="${MIZAR}"]`).click();
  await expect(page.getByTestId('route-preview')).toBeVisible();
  await page.getByTestId('confirm-jump').click();
  await expect(page.locator('.loc')).toContainText(STAR_SYSTEMS[MIZAR].name);

  // ---- 4) THE SAGE DECODES IT, FROM ITS DIEGETIC OPENER --------------------
  const storyletId = decodeStoryletFor(fragmentId);
  const opener = page.locator(`[data-storylet-open="${storyletId}"]`);
  await expect(opener).toBeVisible();
  await opener.click();
  const panel = page.getByTestId('storylet-panel');
  await expect(panel).toHaveAttribute('data-storylet-id', storyletId);
  await page
    .locator('[data-testid="storylet-choice"][data-choice-id="decode"]')
    .getByTestId('storylet-choice-btn')
    .click();

  // ---- 5) THE FILE NOW READS THE DECODED LORE ------------------------------
  await inNemesisPane(page, async () => {
    await expect(page.getByTestId('nemesis-count')).toHaveText('1 FRAGMENT · 1 DECODED');
    const row = page.locator(`[data-testid="nemesis-fragment"][data-fragment-id="${fragmentId}"]`);
    await expect(row).toHaveAttribute('data-decoded', '1');
    await expect(row.locator('.nf-text')).toHaveText(SIGNAL_FRAGMENTS[fragmentId].decoded);
  });
});
