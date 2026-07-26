import { test, expect, type Page } from '@playwright/test';
import { SIGNAL_FRAGMENTS } from '@spacerquest/content';
import {
  createInitialState,
  createSave,
  grantFragment,
  startDay,
  type GameState,
} from '@spacerquest/engine';

// T-1505a · The DECODED-LORE INDEX renders in the Nemesis File pane for decoded
// fragments — the task's UI-reachability clause, proven through the real cockpit.
//
// HONEST SPLIT, stated up front: the injected save sets the SCENARIO only — it
// stands the spacer at Mizar-9 (system 18, the Sage's workshop, the arc's one
// decoder) holding a single UNDECODED fragment, exactly as if they had just pulled
// it off a derelict on the way in. That is the same sanctioned fixture pattern
// `alliance-arcs.spec.ts` / `wire.spec.ts` use. Every fragment gained and every
// decode below then happens by PLAYING A REAL STORYLET CHOICE through the real
// port opener + storylet panel — no API calls, no state pokes mid-test.
//
// Deliberately NOT duplicated here: the full acquisition funnel (fly to the rim →
// sweep off-lane → board a derelict → carry it to the Sage) through the UI. That
// is a long-play journey and belongs to T-1505c; the headless proof that all three
// acquisition modes yield fragments in legal play is
// `packages/sim/src/__tests__/nemesis-fragments.test.ts`.
const NEMESIS_SEED = 18;

/** The fragment the spacer walks in holding. Derelict-pool, so its presence is
 *  in-fiction consistent with the scenario, and it has a Sage decode path. */
const HELD_ID = 'frag-nemesis-06';
/** The fragment the Sage trades out of their own drawer (`sage.mizar.archive`,
 *  gated on `nemesis.minFragments: 1` — which the held fragment satisfies). */
const ARCHIVE_ID = 'frag-nemesis-11';

/** A dawn state at Mizar-9 holding one undecoded fragment. Scenario fixture. */
function sageBenchState(seed: number): GameState {
  const base = createInitialState(seed);
  base.player.currentSystemId = 18; // Mizar-9 — the Sage's workshop
  // Granted through the engine's OWN grant path (never a hand-written record), so
  // the injected file is exactly what a derelict board would have produced.
  grantFragment(base.player.nemesisFile, HELD_ID, 'derelict', base.day);
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

/** Open Records → Nemesis and run `read` against the live pane, then close it. */
async function inNemesisPane(page: Page, read: () => Promise<void>): Promise<void> {
  await page.getByTestId('records-toggle').click();
  await page.getByTestId('records-tab-nemesis').click();
  await expect(page.getByTestId('nemesis')).toBeVisible();
  await read();
  await page.getByTestId('records-close').click();
}

function fragmentRow(page: Page, fragmentId: string) {
  return page.locator(`[data-testid="nemesis-fragment"][data-fragment-id="${fragmentId}"]`);
}

test('the Nemesis File pane swaps raw signal for decoded lore when the Sage decodes', async ({
  page,
}) => {
  await inject(page, createSave(sageBenchState(NEMESIS_SEED), NEMESIS_SEED));

  // 1) The held fragment renders as an UNDECODED row showing its RAW SIGNAL — the
  //    text asserted against the shipped content, never a string literal here.
  await inNemesisPane(page, async () => {
    await expect(page.getByTestId('nemesis-count')).toHaveText('1 FRAGMENT · 0 DECODED');
    const row = fragmentRow(page, HELD_ID);
    await expect(row).toHaveAttribute('data-decoded', '0');
    await expect(row.locator('.nf-text')).toHaveText(SIGNAL_FRAGMENTS[HELD_ID].signal);
  });

  // 2) THE ACCEPTANCE CLAUSE: play the Sage's real decode storylet from its real
  //    port opener, then re-read the pane — the row flips to DECODED and its text
  //    becomes the fragment's DECODED LORE, i.e. the decoded-lore index rendered.
  await showStorylet(page, 'sage.mizar.decode-06');
  await choice(page, 'decode').getByTestId('storylet-choice-btn').click();

  await inNemesisPane(page, async () => {
    await expect(page.getByTestId('nemesis-count')).toHaveText('1 FRAGMENT · 1 DECODED');
    const row = fragmentRow(page, HELD_ID);
    await expect(row).toHaveAttribute('data-decoded', '1');
    await expect(row.locator('.nf-text')).toHaveText(SIGNAL_FRAGMENTS[HELD_ID].decoded);
  });

  // 3) A NET-NEW fragment reaches the pane through the 'sage' ACQUISITION MODE:
  //    `sage.mizar.archive` is live because the file already holds one fragment
  //    (its `minFragments: 1` gate), and it grants frag-nemesis-11.
  await showStorylet(page, 'sage.mizar.archive');
  await choice(page, 'take-the-drawer-piece').getByTestId('storylet-choice-btn').click();

  await inNemesisPane(page, async () => {
    await expect(page.getByTestId('nemesis-count')).toHaveText('2 FRAGMENTS · 1 DECODED');
    const row = fragmentRow(page, ARCHIVE_ID);
    await expect(row).toHaveAttribute('data-decoded', '0');
    await expect(row.locator('.nf-text')).toHaveText(SIGNAL_FRAGMENTS[ARCHIVE_ID].signal);
  });

  // 4) And it has a working decode path of its own, same day, same bench.
  await showStorylet(page, 'sage.mizar.decode-11');
  await choice(page, 'decode').getByTestId('storylet-choice-btn').click();

  await inNemesisPane(page, async () => {
    await expect(page.getByTestId('nemesis-count')).toHaveText('2 FRAGMENTS · 2 DECODED');
    const row = fragmentRow(page, ARCHIVE_ID);
    await expect(row).toHaveAttribute('data-decoded', '1');
    await expect(row.locator('.nf-text')).toHaveText(SIGNAL_FRAGMENTS[ARCHIVE_ID].decoded);
  });

  // Both decode scenes are `repeat:'never'` and completed — neither re-offers.
  await expect(page.locator('[data-storylet-open="sage.mizar.decode-06"]')).toHaveCount(0);
  await expect(page.locator('[data-storylet-open="sage.mizar.decode-11"]')).toHaveCount(0);
});
