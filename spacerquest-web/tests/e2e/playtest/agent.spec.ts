/**
 * SpacerQuest v4.0 — LLM-Driven Playtest Agent
 *
 * An AI player (Claude) that reads the terminal, consults a strategy guide,
 * and makes real game decisions — exactly as a human player would.
 *
 * Every action is justified with reasoning. Every unexpected outcome triggers
 * diagnosis. Confirmed bugs are surfaced to the developer; recoverable errors
 * are handled automatically.
 *
 * Runtime configuration (environment variables):
 *   PLAYTEST_MODEL   — Claude model ID (default: claude-haiku-4-5-20251001)
 *   PLAYTEST_GOAL    — Goal spec: type:value (default: turns:50)
 *   PLAYTEST_LOG     — Log file path (default: /tmp/spacerquest-playtest.log)
 *   ANTHROPIC_API_KEY — Required
 *
 * Goal types:
 *   turns:50         Complete 50 end-turn cycles
 *   credits:50000    Accumulate 50,000 credits
 *   battles:3        Win 3 battles
 *   cargo:5          Complete 5 cargo deliveries
 *   alliance:1       Join any alliance
 *   arena:1          Fight in the arena
 *   rank:Commander   Reach Commander rank
 *   upgrade:5        Upgrade ship components 5 times
 *
 * Examples:
 *   PLAYTEST_GOAL=turns:50 npx playwright test tests/e2e/playtest/agent.spec.ts
 *   PLAYTEST_GOAL=credits:30000 PLAYTEST_MODEL=claude-sonnet-4-6 npx playwright test ...
 *
 * Timeout: 30 minutes (sufficient for 50 turns with LLM latency)
 */

import { test, expect, BrowserContext, Page, APIRequestContext, request as apiRequest } from '@playwright/test';
import { ClaudePlayer } from './claude-player';
import { GameLoop } from './game-loop';
import { parseGoal } from './goals';
import { ApiValidator } from '../helpers/api-validator';
import { waitForText, typeAndEnter } from '../helpers/terminal';

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let ctx: BrowserContext;
let page: Page;
let requestCtx: APIRequestContext;

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Setup: launch browser, login, create character
// ---------------------------------------------------------------------------
test.beforeAll(async ({ browser }) => {
  const playtestModel = process.env.PLAYTEST_MODEL ?? 'claude-haiku';
  const isOllama = process.env.PLAYTEST_PROVIDER === 'ollama' || !playtestModel.includes('claude');
  if (!process.env.ANTHROPIC_API_KEY && !isOllama) {
    throw new Error(
      'ANTHROPIC_API_KEY is required to run the LLM playtest agent with Claude.\n' +
      'Set it in your environment or use a local model via PLAYTEST_MODEL=qwen3-coder:latest.',
    );
  }

  ctx = await browser.newContext();
  page = await ctx.newPage();
  requestCtx = await apiRequest.newContext({ baseURL: API_URL });
});

test.afterAll(async () => {
  await requestCtx.dispose();
  await ctx.close();
});

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------
test('LLM agent plays SpacerQuest to reach the configured goal', async () => {
  // Local LLMs (Ollama) are much slower than cloud APIs — allow 8 hours
  const isOllama = process.env.PLAYTEST_PROVIDER === 'ollama';
  test.setTimeout(isOllama ? 8 * 60 * 60 * 1000 : 60 * 60 * 1000);
  const goal = parseGoal(process.env.PLAYTEST_GOAL);
  const model = process.env.PLAYTEST_MODEL ?? 'claude-haiku-4-5-20251001';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SpacerQuest LLM Playtest`);
  console.log(`  Model: ${model}`);
  console.log(`  Goal:  ${goal.description}`);
  console.log(`${'='.repeat(60)}\n`);

  // --- Step 1: Dev login ---
  // Clear stale auth state from previous runs to avoid "Invalid token" errors
  await page.goto(BASE_URL);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const pageText = await page.textContent('body') ?? '';
  if (/SpacerQuest Authentication|Login/i.test(pageText)) {
    // Click dev login link — redirects to /?token=JWT
    const devLink = page.locator('a[href*="dev-login"], button:has-text("Dev Login"), button:has-text("Development Login"), a:has-text("Dev")');
    if (await devLink.count() > 0) {
      await devLink.first().click();
    } else {
      await page.goto(`${API_URL}/auth/dev-login`);
    }
    await page.waitForTimeout(2000);
  }

  // --- Step 2: Character creation or load ---
  // Wait for either the DOM character creation screen or the terminal to render
  await Promise.race([
    page.waitForSelector('text=CREATE NEW SPACER', { timeout: 10000 }).catch(() => null),
    page.locator('.xterm-rows').waitFor({ state: 'attached', timeout: 10000 }).catch(() => null),
  ]);

  const bodyAfterLogin = await page.textContent('body') ?? '';
  if (/CREATE NEW SPACER|Spacer Name/i.test(bodyAfterLogin)) {
    const charName = `LLMAgent${Date.now().toString().slice(-4)}`;
    const shipName = 'Claude-1';

    const textInputs = page.locator('input[type="text"]');
    await textInputs.nth(0).fill(charName);
    await textInputs.nth(1).fill(shipName);
    await page.click('button:has-text("Create Character")');
    await page.waitForTimeout(3000);
  }

  // --- Step 3: Wait for main menu ---
  // On the first load after dev-login redirect, a WebSocket race condition
  // causes the server's screen:render (main menu) to fire before React
  // registers the listener (App.tsx useEffect depends on isAuthenticated
  // which hasn't re-rendered yet). Reloading forces Zustand to hydrate
  // isAuthenticated=true from localStorage synchronously, so ALL listeners
  // are registered before the WebSocket connects.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // If the main menu still hasn't appeared (e.g. WebSocket connected slowly),
  // explicitly request it via page JS.
  const terminalText = await page.locator('.xterm-rows').textContent().catch(() => '');
  if (!/Port Accounts|MAIN MENU/i.test(terminalText ?? '')) {
    // Poke the WebSocket to re-send the current screen
    await page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem('spacerquest-storage') || '{}');
      const token = store?.state?.token;
      if (token) {
        // Re-emit authenticate to trigger server's auto-send of main-menu
        const sockets = (window as any).__socketIO;
        if (sockets) sockets.emit('authenticate', { token });
      }
    });
    await page.waitForTimeout(2000);
  }

  await waitForText(page, /Port Accounts|MAIN MENU/i, 30000);
  console.log('Main menu reached — starting playtest\n');

  // --- Step 4: Get auth token for API state queries ---
  // Read the JWT that the game already stored in Zustand/localStorage.
  // DO NOT call dev-login again — that creates a new user with empty state.
  const token = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('spacerquest-storage');
      if (!raw) return '';
      const store = JSON.parse(raw) as { state?: { token?: string } };
      return store?.state?.token ?? '';
    } catch {
      return '';
    }
  });

  const api = new ApiValidator(token, requestCtx);

  // --- Step 4.5: Bootstrap character to a playable state ---
  // New characters start with hull=0, fuel=0, and 10,000 Cr (only enough for one hull upgrade).
  // We need hull=20, proper drive/nav/lifesupport, fuel, and enough credits to demonstrate trading.
  if (token) {
    const setupRes = await requestCtx.post(`${API_URL}/auth/dev-setup-character`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (setupRes.ok()) {
      console.log('Character bootstrapped for playtest (hull=20, fuel=400, credits=30,000)');
    } else {
      console.warn(`Character setup failed: ${setupRes.status()} — proceeding anyway`);
    }
  }

  // --- Step 5: Run the game loop ---
  const player = new ClaudePlayer(model);
  const loop = new GameLoop(page, api, player, goal);
  const result = await loop.run();

  // --- Step 6: Report ---
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PLAYTEST COMPLETE`);
  console.log(`  Goal: ${result.goal.description}`);
  console.log(`  Achieved: ${result.progress.achieved}`);
  console.log(`  Progress: ${result.progress.summary}`);
  console.log(`  Turns: ${result.stats.turnsCompleted}`);
  console.log(`  Peak credits: ${result.stats.peakCredits.toLocaleString()}`);
  console.log(`  Battles won: ${result.stats.battlesWon}`);
  console.log(`  Cargo deliveries: ${result.stats.cargoDeliveries}`);
  console.log(`  Upgrades done: ${result.stats.upgradesDone}`);
  console.log(`  Alliance joined: ${result.stats.allianceJoined}`);
  console.log(`  Total actions: ${result.stats.totalActions}`);
  console.log(`  Restarts: ${result.stats.restarts}`);
  console.log(`  Errors recorded: ${result.stats.errors.length}`);
  console.log('');
  console.log(`  Summary: ${result.summary}`);

  if (result.bugs.length > 0) {
    console.log(`\n${'!'.repeat(60)}`);
    console.log(`BUGS FOUND (${result.bugs.length}):`);
    result.bugs.forEach((bug, i) => {
      console.log(`\n  Bug ${i + 1}: ${bug.description}`);
      console.log(`  Terminal snapshot:\n${bug.terminalSnapshot}`);
    });
    console.log('!'.repeat(60));
  }

  console.log('='.repeat(60));

  // Assert: goal was achieved and no confirmed bugs block us
  // (Bugs are surfaced in output — test fails so developer sees them)
  if (result.bugs.length > 0) {
    const bugSummary = result.bugs.map((b, i) => `Bug ${i + 1}: ${b.description}`).join('\n');
    throw new Error(
      `Playtest found ${result.bugs.length} confirmed game bug(s) that blocked progress:\n\n${bugSummary}\n\n` +
      `See full log: ${process.env.PLAYTEST_LOG ?? '/tmp/spacerquest-playtest.log'}`
    );
  }

  expect(result.success).toBe(true);
});
