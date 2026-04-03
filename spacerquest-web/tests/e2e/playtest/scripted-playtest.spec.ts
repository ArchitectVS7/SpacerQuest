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
import { waitForText } from '../helpers/terminal';
import { StrategyEngine } from './strategy-engine';
import { ALL_FEATURES } from './playtest-report';
import { appendFileSync, writeFileSync } from 'fs';

const BASE_URL = 'http://localhost:5173';
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

  // ── 1. Login ──────────────────────────────────────────────────────────────

  await page.goto(BASE_URL);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const bodyText = await page.textContent('body') ?? '';
  if (/SpacerQuest Authentication|Login/i.test(bodyText)) {
    const devLink = page.locator(
      'a[href*="dev-login"], button:has-text("Dev Login"), a:has-text("Dev")'
    );
    if (await devLink.count() > 0) {
      await devLink.first().click();
    } else {
      await page.goto(`${BASE_URL}/auth/dev-login`);
    }
    await page.waitForTimeout(2000);
  }

  // ── 2. Character creation ─────────────────────────────────────────────────

  await Promise.race([
    page.waitForSelector('text=CREATE NEW SPACER', { timeout: 10000 }).catch(() => null),
    page.locator('.xterm-rows').waitFor({ state: 'attached', timeout: 10000 }).catch(() => null),
  ]);

  const bodyAfterLogin = await page.textContent('body') ?? '';
  if (/CREATE NEW SPACER|Spacer Name/i.test(bodyAfterLogin)) {
    const charName = `Scout${Date.now().toString().slice(-4)}`;
    const shipName = 'Wayfarer';
    const inputs = page.locator('input[type="text"]');
    await inputs.nth(0).fill(charName);
    await inputs.nth(1).fill(shipName);
    await page.click('button:has-text("Create Character")');
    await page.waitForTimeout(3000);
    log(`Character created: ${charName} / ${shipName}`);
  }

  // ── 3. Wait for main menu ─────────────────────────────────────────────────

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);

  const termCheck = await page.locator('.xterm-rows').textContent().catch(() => '');
  if (!/Port Accounts|MAIN MENU/i.test(termCheck ?? '')) {
    await page.evaluate(() => {
      const raw = localStorage.getItem('spacerquest-storage');
      const store = raw ? JSON.parse(raw) : {};
      const token = store?.state?.token;
      if (token) {
        const io = (window as any).__socketIO;
        if (io) io.emit('authenticate', { token });
      }
    });
    await page.waitForTimeout(2000);
  }

  await waitForText(page, /Port Accounts|MAIN MENU/i, 30000);
  log('Main menu reached — starting playtest\n');

  // ── 4. Auth token ─────────────────────────────────────────────────────────

  const token = await page.evaluate((): string => {
    try {
      const raw = localStorage.getItem('spacerquest-storage');
      if (!raw) return '';
      return (JSON.parse(raw) as any)?.state?.token ?? '';
    } catch { return ''; }
  });

  const api = new ApiValidator(token, requestCtx);

  // ── 5. Bootstrap character ────────────────────────────────────────────────

  if (token) {
    const setupRes = await requestCtx.post(`${API_URL}/auth/dev-setup-character`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    log(setupRes.ok()
      ? 'Character bootstrapped (hull=20, fuel=400, credits=30,000)'
      : `Bootstrap failed (${setupRes.status()}) — using defaults`);
  }

  // Reload to reflect bootstrapped state
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await waitForText(page, /Port Accounts|MAIN MENU/i, 15000);

  // ── 6. Run strategy engine ────────────────────────────────────────────────

  const engine = new StrategyEngine(page, api, log);
  const report = await engine.run();

  // ── 7. Output report ──────────────────────────────────────────────────────

  const formatted = report.formatReport();
  const summary = report.getSummary();

  // Write full report to log
  appendFileSync(LOG_PATH, '\n' + formatted + '\n');

  // Console output
  console.log('\n' + '═'.repeat(60));
  console.log(formatted);
  console.log('═'.repeat(60));
  console.log(`\nFull log: ${LOG_PATH}`);

  // ── 8. Assertions ─────────────────────────────────────────────────────────

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
