import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createInitialState,
  startDay,
  quoteStoryletChoice,
  nextRankFor,
} from '@spacerquest/engine';
import { RENOWN_RANKS } from '@spacerquest/content';

// T-1402: the UI de-rule pass. Three guarantees:
//   1. format.ts IMPORTS the engine rule functions instead of reimplementing them
//      (a source-scan guard — the listed formulas must not be re-derived).
//   2. The manifest sign flow renders a die COST, never a TRADE check (the engine
//      spends the die and never reads its value; the old "+ TRADE" display lied).
//   3. Storylet locks and the rank readout are asserted against the IMPORTED engine
//      exports (quoteStoryletChoice / nextRankFor), not hard-coded literals.
//
// The store's default career is the deterministic seed 424242 → Day 1, Sun-3; the
// headless state below is built the exact way the store boots a fresh game
// (startDay(createInitialState(DEFAULT_SEED))), so the engine truth the DOM is
// checked against is the same run the UI renders.
const DEFAULT_SEED = 424242;
const GUILD_AUDITOR = 'port.sun3.guild-auditor';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

// ---- 1. Guard: format.ts imports rather than reimplements ------------------

test('format.ts imports the engine rules rather than reimplementing them', () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../src/format.ts'),
    'utf8',
  );
  // Strip comments so the guard scans CODE, not the explanatory notes that name
  // the very patterns we ban.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  // (a) Every listed engine formula is imported from the engine barrel.
  for (const fn of [
    'componentTierForStrength',
    'tributeForRound',
    'nextRankFor',
    'quoteStoryletChoice',
    'quoteFuelPurchase',
    'travelPreview',
  ]) {
    expect(code, `format.ts must import ${fn} from the engine`).toContain(fn);
  }
  // The imports must come FROM the engine package (not shadowed local defs).
  expect(code).toMatch(/from '@spacerquest\/engine'/);

  // (b) None of the reimplemented formulas survive.
  const banned: [RegExp, string][] = [
    [/Math\.ceil\(/, 'the ceil-based tier inverse (use componentTierForStrength)'],
    [/Math\.round\(\s*distance/, 'the fabricated jumpsBetween round (use travelPreview)'],
    [/TRIBUTE_BASE_MULTIPLIER/, 'the tribute schedule (use tributeForRound)'],
    [/TRIBUTE_MAX/, 'the tribute cap (use tributeForRound)'],
    [/\.endsWith\(/, 'the flaw-override suffix match (read WireEntry.kind)'],
    [
      /RENOWN_DEED_THRESHOLDS\[[a-z]\]\s*-\s*RENOWN_DEED_THRESHOLDS/,
      'the next-rank threshold sort (use nextRankFor)',
    ],
  ];
  for (const [pattern, why] of banned) {
    expect(code, `format.ts must not reimplement ${why}`).not.toMatch(pattern);
  }
});

// ---- 2. The manifest sign flow renders a die cost, never a check -----------

/** T-1406 · Open a storylet from its diegetic opener (per-offer; no launcher, no
 *  pager) and confirm the focused panel shows it. */
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

test('the manifest sign flow renders a die cost, not a TRADE check', async ({ page }) => {
  await page.goto('/');

  // The sign row on every offer speaks in a DIE COST — no "+ TRADE" fragment, no
  // check-stat element. Signing spends the die; the engine never rolls it.
  const signRow = page.getByTestId('sign-row').first();
  await expect(signRow).toBeVisible();
  await expect(signRow).toContainText('costs 1 die');
  await expect(signRow).not.toContainText('TRADE');
  await expect(signRow.getByTestId('check-stat')).toHaveCount(0);
  // No check breakdown is open at rest — signing is not a check surface.
  await expect(page.getByTestId('check-stat')).toHaveCount(0);

  // Contrast: HAGGLE IS a real TRADE DC-12 roll — the honest check the sign row is
  // NOT. Arm a die and haggle to prove the manifest still exposes that check.
  await page.locator('[data-testid="die"][data-spent="0"]').first().click();
  await page.getByTestId('haggle').first().click();
  await expect(page.getByTestId('check-breakdown')).toBeVisible();
  await expect(page.getByTestId('check-stat')).toHaveText('TRADE');
  await expect(page.getByTestId('check-dc')).toHaveText('12');
});

// ---- 3. Storylet lock + rank asserted against imported engine exports ------

test('storylet lock and rank display match the imported engine exports', async ({ page }) => {
  // The engine truth for the guild-auditor "argue" choice on the store's default
  // seed: a die-gated GUILE check that previews `missing-die` with no die armed.
  const state = startDay(createInitialState(DEFAULT_SEED)).state;
  const quote = quoteStoryletChoice(state, GUILD_AUDITOR, 'argue');
  expect(quote.needsDie).toBe(true);
  expect(quote.reason).toBe('missing-die');
  expect(quote.statCheck).not.toBeNull();
  const expectedCost = `${quote.statCheck!.stat.toUpperCase()} DC ${quote.statCheck!.dc} · die`;

  await page.goto('/');
  await showStorylet(page, GUILD_AUDITOR);

  const argue = choice(page, 'argue');
  // The rendered lock is the prose for the engine's `missing-die` reason, and the
  // cost badge is assembled from the engine quote's stat-check facts.
  await expect(argue.getByTestId('storylet-choice-btn')).toBeDisabled();
  await expect(argue.getByTestId('storylet-choice-lock')).toHaveText('Assign a die');
  await expect(argue.getByTestId('storylet-choice-cost')).toHaveText(expectedCost);

  // Arm a die → the engine quote clears (ok) and the lock disappears, proving the
  // gate is the engine's, not a decorative literal.
  const armedState = { ...state };
  expect(quoteStoryletChoice(armedState, GUILD_AUDITOR, 'argue', 0).reason).toBe(null);
  await page.getByTestId('die').first().click();
  await expect(argue.getByTestId('storylet-choice-btn')).toBeEnabled();
  await expect(argue.getByTestId('storylet-choice-lock')).toHaveCount(0);
});

test('the registry rank readout equals the engine-derived next rank after a deed', async ({
  page,
}) => {
  // The rank a LIEUTENANT reaches on their first deed is the engine's own next rank
  // above LIEUTENANT — computed here from `nextRankFor`, never hard-coded.
  const nextRank = nextRankFor('LIEUTENANT');
  expect(nextRank).not.toBeNull();
  const expectedLabel = RENOWN_RANKS[nextRank!].label;

  await page.goto('/');

  // Play the doc-salvage chain (a no-die answer today, an accept-thanks tomorrow)
  // to earn the Beacon Keeper deed — the same reachable path the registry spec uses.
  await showStorylet(page, 'chain.doc-salvage.distress-ping');
  await choice(page, 'answer').getByTestId('storylet-choice-btn').click();
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('day')).toHaveText('2');
  await showStorylet(page, 'chain.doc-salvage.follow-up');
  await choice(page, 'accept-thanks').getByTestId('storylet-choice-btn').click();

  // The registry rank readout equals the engine-derived rank label.
  await page.getByTestId('records-toggle').click();
  await expect(page.getByTestId('registry-rank')).toHaveText(expectedLabel);
  await expect(page.getByTestId('rank')).toHaveText(expectedLabel);
});
