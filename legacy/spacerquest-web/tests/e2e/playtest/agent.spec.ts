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
import { waitForReady } from '../helpers/terminal';
import { bootToMainMenu } from '../helpers/boot';

/**
 * Resolve which LLM provider to use, in priority order:
 *   1. Anthropic — when ANTHROPIC_API_KEY is set (and a Claude model is requested).
 *   2. Local Ollama — when reachable; picks PLAYTEST_MODEL if present, else the
 *      first installed model.
 *   3. null — neither available → the test skips cleanly.
 */
async function resolveProvider(): Promise<{ model: string; provider: 'anthropic' | 'ollama' } | null> {
  const explicitModel = process.env.PLAYTEST_MODEL;
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const ollamaUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434';

  // 1. Anthropic when a key is present and the model is a Claude model (or default).
  if (hasKey && (!explicitModel || explicitModel.includes('claude'))) {
    return { model: explicitModel ?? 'claude-haiku-4-5-20251001', provider: 'anthropic' };
  }

  // 2. Fall back to local Ollama if it's up and has at least one model.
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`);
    if (res.ok) {
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const models = (data.models ?? []).map((m) => m.name);
      if (models.length > 0) {
        const model = explicitModel && models.includes(explicitModel) ? explicitModel : models[0];
        return { model, provider: 'ollama' };
      }
    }
  } catch {
    /* Ollama not running — fall through. */
  }

  // 3. A Claude model was requested with a key but Ollama is also unavailable.
  if (hasKey) {
    return { model: explicitModel ?? 'claude-haiku-4-5-20251001', provider: 'anthropic' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let ctx: BrowserContext;
let page: Page;
let requestCtx: APIRequestContext;

const API_URL = 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Setup: launch browser, login, create character
// ---------------------------------------------------------------------------
test.beforeAll(async ({ browser }) => {
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
  // --- Provider resolution: Anthropic (key) → local Ollama → skip ---
  const resolved = await resolveProvider();
  test.skip(!resolved, 'No LLM provider available — set ANTHROPIC_API_KEY or run Ollama.');
  if (!resolved) return; // narrows the type for TS below

  const { model, provider } = resolved;
  if (provider === 'ollama') process.env.PLAYTEST_PROVIDER = 'ollama';

  // Local LLMs (Ollama) are much slower than cloud APIs — allow 8 hours
  test.setTimeout(provider === 'ollama' ? 8 * 60 * 60 * 1000 : 60 * 60 * 1000);
  const goal = parseGoal(process.env.PLAYTEST_GOAL);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SpacerQuest LLM Playtest`);
  console.log(`  Provider: ${provider}`);
  console.log(`  Model: ${model}`);
  console.log(`  Goal:  ${goal.description}`);
  console.log(`${'='.repeat(60)}\n`);

  // --- Step 1: Boot to main menu through the real UI (shared fixture) ---
  const { token } = await bootToMainMenu(page, { characterName: `LLMAgent${Date.now().toString().slice(-4)}`, shipName: 'Claude-1' });
  console.log('Main menu reached — starting playtest\n');

  const api = new ApiValidator(token, requestCtx);

  // --- Step 2: Bootstrap character to a playable state (backend setup) ---
  // New characters start with hull=0, fuel=0. This seeds a playable ship + credits.
  // It's a test fixture (state mutation), not player gameplay.
  if (token) {
    const setupRes = await requestCtx.post(`${API_URL}/auth/dev-setup-character`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (setupRes.ok()) {
      console.log('Character bootstrapped for playtest (playable state)');
      // State changed server-side — re-render the menu to reflect it.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForReady(page, 20000);
    } else {
      console.warn(`Character setup failed: ${setupRes.status()} — proceeding anyway`);
    }
  }

  // --- Step 3: Run the game loop ---
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
