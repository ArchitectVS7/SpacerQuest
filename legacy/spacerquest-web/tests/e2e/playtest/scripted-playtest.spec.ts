/**
 * SpacerQuest v4.0 — Scripted Strategy Playtest
 *
 * A rule-based agent that plays the game the way a real player would:
 * reading game state, making strategic decisions, and verifying that
 * every action produces the expected outcome.
 *
 * Output: a structured QA report showing PASS / FAIL / SKIP / NOT REACHED
 * for every game feature, grouped by turn, with state deltas and bug notes.
 *
 * No LLM required. Runs in ~10 minutes.
 *
 * Run:
 *   npx playwright test tests/e2e/playtest/scripted-playtest.spec.ts
 */

import { test, expect, BrowserContext, Page, APIRequestContext, request as apiRequest } from '@playwright/test';
import { ApiValidator } from '../helpers/api-validator';
import { waitForReady } from '../helpers/terminal';
import { bootToMainMenu } from '../helpers/boot';
import { StrategyEngine } from './strategy-engine';
import { ALL_FEATURES } from './playtest-report';
import { appendFileSync, writeFileSync } from 'fs';

const API_URL  = 'http://localhost:3000';
const LOG_PATH = process.env.PLAYTEST_LOG ?? '/tmp/spacerquest-playtest.log';

let ctx: BrowserContext;
let page: Page;
let requestCtx: APIRequestContext;

// ── Setup ─────────────────────────────────────────────────────────────────────

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext();
  page = await ctx.newPage();
  requestCtx = await apiRequest.newContext({ baseURL: API_URL });
  writeFileSync(LOG_PATH, '');
});

test.afterAll(async () => {
  await requestCtx.dispose();
  await ctx.close();
});

// ── Main playtest ─────────────────────────────────────────────────────────────

test('scripted agent plays SpacerQuest — 50 turns with verified actions', async () => {
  test.setTimeout(40 * 60 * 1000); // 40 min

  const log = (msg: string) => {
    const ts = new Date().toISOString().slice(11, 19);
    const line = `${ts} ${msg}`;
    console.log(line);
    appendFileSync(LOG_PATH, line + '\n');
  };

  // ── 1. Boot to main menu (shared fixture: real UI login, no reload/poke hacks) ──

  const { token } = await bootToMainMenu(page);
  log('Main menu reached — starting playtest\n');

  const api = new ApiValidator(token, requestCtx);

  // ── 2. Bootstrap character to a playable state ────────────────────────────
  // Backend setup (state mutation for the test fixture), not player gameplay.
  // Deliberately seeds score=148 (2 short of Commander) so rank-advance and the
  // Commander-gated bank unlock through gameplay — do not force Commander here.

  if (token) {
    const setupRes = await requestCtx.post(`${API_URL}/auth/dev-setup-character`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    log(setupRes.ok()
      ? 'Character bootstrapped (playable state)'
      : `Bootstrap failed (${setupRes.status()}) — using defaults`);

    // The character changed server-side, so re-render the menu to reflect it.
    // A fresh load is legitimate here (state actually changed), not a race workaround.
    if (setupRes.ok()) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForReady(page, 20000);
    }
  }

  // ── 3. Run strategy engine ────────────────────────────────────────────────

  const engine = new StrategyEngine(page, api, log);
  const report = await engine.run();

  // ── 4. Output report ──────────────────────────────────────────────────────

  const formatted = report.formatReport();
  const summary = report.getSummary();

  // Write full report to log
  appendFileSync(LOG_PATH, '\n' + formatted + '\n');

  // Console output
  console.log('\n' + '═'.repeat(60));
  console.log(formatted);
  console.log('═'.repeat(60));
  console.log(`\nFull log: ${LOG_PATH}`);

  // ── 5. Assertions ─────────────────────────────────────────────────────────

  // Fail the test if any features FAILED (potential bugs)
  if (summary.featuresFailed.length > 0) {
    const bugList = summary.featuresFailed
      .map(f => `  ✗ ${f.feature}: ${f.details}${f.bugNote ? `\n    ${f.bugNote}` : ''}`)
      .join('\n');
    throw new Error(
      `Playtest found ${summary.featuresFailed.length} feature failure(s):\n\n${bugList}\n\n` +
      `Full report: ${LOG_PATH}`
    );
  }

  // Report pass percentage
  const passPct = report.getPassPercent();
  log(`\nFinal: ${summary.featuresPassed.length}/${ALL_FEATURES.length} features passed (${passPct}%)`);
  log(`Not reached: ${summary.featuresNotReached.join(', ') || 'none'}`);

  expect(passPct).toBeGreaterThanOrEqual(50);
});
