/**
 * UGT Subprocess Bridge for SpacerQuest
 * 
 * Phase 2: Reward-Shaped Learning Bridge
 * 
 * This script runs as a subprocess managed by UGT's simulation engine.
 * It uses Playwright to interface with the SpacerQuest terminal UI,
 * preserving the strict invariant that no actions are performed via API bypasses.
 * 
 * The bridge computes derived reward metrics from state deltas and injects them
 * into the state dict so UGT's reward formula evaluator can reference them:
 * 
 *   - fuel_safety:       Scaled reward for fuel management on launch
 *   - trade_profit:      Credits gained from last cargo delivery
 *   - upgrade_power:     Sum of all ship component strengths (growth metric)
 *   - upgrade_delta:     Change in upgrade_power since last step
 *   - growth_factor:     Ratio of upgrades to total trades (flatlines if no growth)
 *   - pub_penalty:       Penalty if pub visited too frequently (< 5 actions apart)
 *   - turns_alive:       Total steps survived (longevity)
 */

import { chromium, request, Page, APIRequestContext } from '@playwright/test';
import * as readline from 'readline';

// ── Action Space ─────────────────────────────────────────────────────────────

const ACTIONS = [
  'visit-pub',
  'buy-fuel',
  'sell-fuel',
  'get-cargo',
  'deliver-cargo',
  'visit-shipyard',
  'visit-registry',
  'visit-bank',
  'repair'
] as const;

type ActionName = typeof ACTIONS[number];

// ── Reward Tracking State ────────────────────────────────────────────────────

interface RewardTracker {
  prevCredits: number;
  prevFuel: number;
  prevUpgradePower: number;
  totalTrades: number;
  totalUpgrades: number;
  lastPubStep: number;
  stepCount: number;
}

function initTracker(): RewardTracker {
  return {
    prevCredits: 0,
    prevFuel: 0,
    prevUpgradePower: 0,
    totalTrades: 0,
    totalUpgrades: 0,
    lastPubStep: -10,
    stepCount: 0,
  };
}

// ── State Fetching ───────────────────────────────────────────────────────────

async function getToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('spacerquest-storage');
    return raw ? JSON.parse(raw)?.state?.token : null;
  });
}

interface GameState {
  credits: number;
  fuel: number;
  system: number;
  cargoPods: number;
  cargoType: number;
  destination: number;
  tripCount: number;
  components: Array<{ name: string; strength: number; condition: number }>;
  maxCargoPods: number;
  score: number;
  rank: string;
}

const DEFAULT_STATE: GameState = {
  credits: 0, fuel: 0, system: 1, cargoPods: 0, cargoType: 0,
  destination: 0, tripCount: 0, components: [], maxCargoPods: 0,
  score: 0, rank: 'LIEUTENANT',
};

async function fetchState(page: Page, requestCtx: APIRequestContext): Promise<GameState> {
  const token = await getToken(page);
  if (!token) return { ...DEFAULT_STATE };

  try {
    const [charRes, shipRes] = await Promise.all([
      requestCtx.get('/api/character', { headers: { Authorization: `Bearer ${token}` } }),
      requestCtx.get('/api/ship/status', { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    if (!charRes.ok() || !shipRes.ok()) return { ...DEFAULT_STATE };

    const charData = await charRes.json();
    const shipData = await shipRes.json();
    const char = charData.character || charData;

    return {
      credits: (char.creditsHigh || 0) * 10000 + (char.creditsLow || 0),
      fuel: shipData.fuel || 0,
      system: char.currentSystem || 1,
      cargoPods: char.cargoPods || 0,
      cargoType: char.cargoType || 0,
      destination: char.destination || 0,
      tripCount: char.tripCount || 0,
      components: shipData.components || [],
      maxCargoPods: shipData.maxCargoPods || 0,
      score: char.score || 0,
      rank: char.rank || 'LIEUTENANT',
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

// ── Derived Reward Metrics ───────────────────────────────────────────────────

function computeUpgradePower(components: Array<{ strength: number }>): number {
  return components.reduce((sum, c) => sum + (c.strength || 0), 0);
}

function computeHullCondition(components: Array<{ name: string; condition: number }>): number {
  const hull = components.find(c => c.name === 'Hull');
  return hull?.condition ?? 9;
}

function computeDerivedMetrics(
  state: GameState,
  action: ActionName,
  tracker: RewardTracker
): Record<string, number> {
  const upgradePower = computeUpgradePower(state.components);
  const hullCondition = computeHullCondition(state.components);

  // ── Fuel Safety ──
  // Only relevant when launching (deliver-cargo triggers navigation)
  let fuel_safety = 0;
  if (action === 'deliver-cargo') {
    if (state.fuel < 30) {
      fuel_safety = -50;      // Penalty: launched without enough fuel
    } else if (state.fuel < 60) {
      fuel_safety = 5;        // Small reward: barely enough
    } else if (state.fuel < 200) {
      fuel_safety = 15;       // Standard reward: reasonable buffer
    } else {
      fuel_safety = 10;       // Slight decrease for hoarding (opportunity cost)
    }
  }

  // ── Trade Profit ──
  let trade_profit = 0;
  if (action === 'deliver-cargo') {
    const creditDelta = state.credits - tracker.prevCredits;
    trade_profit = creditDelta;  // Raw delta — formula can scale
    tracker.totalTrades++;
  }

  // ── Upgrade Delta ──
  const upgrade_delta = upgradePower - tracker.prevUpgradePower;
  if (upgrade_delta > 0) {
    tracker.totalUpgrades++;
  }

  // ── Growth Factor ──
  // Ratio of upgrades to trades. If agent trades 20 times but never upgrades,
  // this drops toward 0, causing reward stagnation.
  let growth_factor = 1.0;
  if (tracker.totalTrades > 3) {
    const ratio = tracker.totalUpgrades / tracker.totalTrades;
    growth_factor = Math.min(1.0, ratio * 3);  // 1.0 at 33%+ upgrade rate
    if (ratio < 0.1) growth_factor = 0;         // Zero out if < 10%
  }

  // ── Pub Penalty ──
  let pub_penalty = 0;
  if (action === 'visit-pub') {
    const stepsSinceLastPub = tracker.stepCount - tracker.lastPubStep;
    if (stepsSinceLastPub < 5) {
      pub_penalty = 10;  // Too frequent — penalize
    }
    tracker.lastPubStep = tracker.stepCount;
  }

  // ── Update tracker for next step ──
  tracker.prevCredits = state.credits;
  tracker.prevFuel = state.fuel;
  tracker.prevUpgradePower = upgradePower;
  tracker.stepCount++;

  return {
    credits: state.credits,
    fuel: state.fuel,
    hullCondition,
    cargoPods: state.cargoPods,
    destination: state.destination,
    maxCargoPods: state.maxCargoPods,
    score: state.score,
    upgrade_power: upgradePower,
    fuel_safety,
    trade_profit,
    upgrade_delta,
    growth_factor,
    pub_penalty,
    turns_alive: tracker.stepCount,
    total_trades: tracker.totalTrades,
    total_upgrades: tracker.totalUpgrades,
  };
}

// ── Playwright Action Macros ─────────────────────────────────────────────────

async function executeAction(page: Page, action: ActionName): Promise<void> {
  switch (action) {
    case 'visit-pub':
      await page.keyboard.press('P');
      await page.waitForTimeout(1200);
      await page.keyboard.press('M');
      break;

    case 'buy-fuel':
      await page.keyboard.press('T');
      await page.waitForTimeout(800);
      await page.keyboard.press('B');
      await page.waitForTimeout(500);
      await page.keyboard.type('100\r');
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      await page.keyboard.press('M');
      break;

    case 'sell-fuel':
      await page.keyboard.press('T');
      await page.waitForTimeout(800);
      await page.keyboard.press('S');
      await page.waitForTimeout(500);
      await page.keyboard.type('50\r');
      await page.waitForTimeout(1000);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      await page.keyboard.press('M');
      break;

    case 'get-cargo':
      await page.keyboard.press('T');
      await page.waitForTimeout(800);
      await page.keyboard.press('A');
      await page.waitForTimeout(1500);
      // Pick first contract
      await page.keyboard.type('1\r');
      await page.waitForTimeout(800);
      // Confirm
      await page.keyboard.type('Y\r');
      await page.waitForTimeout(1000);
      await page.keyboard.press('M');
      break;

    case 'deliver-cargo':
      await page.keyboard.press('N');
      await page.waitForTimeout(1000);
      // Enter destination (use current cargo destination from state)
      // Bridge relies on game auto-suggesting the cargo destination
      await page.keyboard.type('0\r');  // 0 = accept suggested destination
      await page.waitForTimeout(800);
      // Confirm launch fee
      await page.keyboard.type('Y\r');
      await page.waitForTimeout(3000);  // Travel time
      await page.keyboard.press('M');
      break;

    case 'visit-shipyard':
      await page.keyboard.press('S');
      await page.waitForTimeout(1000);
      // Try upgrading first available component
      await page.keyboard.press('U');
      await page.waitForTimeout(800);
      await page.keyboard.type('1\r');  // First component
      await page.waitForTimeout(1000);
      await page.keyboard.press('M');
      await page.waitForTimeout(400);
      await page.keyboard.press('M');
      break;

    case 'visit-registry':
      await page.keyboard.press('R');
      await page.waitForTimeout(1000);
      await page.keyboard.press('M');
      break;

    case 'visit-bank':
      await page.keyboard.press('B');
      await page.waitForTimeout(1000);
      await page.keyboard.press('R');  // Return to main menu from bank
      break;

    case 'repair':
      await page.keyboard.press('S');
      await page.waitForTimeout(800);
      await page.keyboard.press('R');
      await page.waitForTimeout(1000);
      await page.keyboard.press('M');
      await page.waitForTimeout(400);
      await page.keyboard.press('M');
      break;
  }

  // Universal settle time
  await page.waitForTimeout(800);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const requestCtx = await request.newContext({ baseURL: 'http://localhost:3000' });

  // ── Boot & Login ──
  try {
    await page.goto('http://localhost:5173');
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
        await page.goto('http://localhost:5173/auth/dev-login');
      }
      await page.waitForTimeout(2000);
    }

    await Promise.race([
      page.waitForSelector('text=CREATE NEW SPACER', { timeout: 10000 }).catch(() => null),
      page.locator('.xterm-rows').waitFor({ state: 'attached', timeout: 10000 }).catch(() => null),
    ]);

    const bodyAfterLogin = await page.textContent('body') ?? '';
    if (/CREATE NEW SPACER|Spacer Name/i.test(bodyAfterLogin)) {
      const charName = `Agent${Date.now().toString().slice(-4)}`;
      const shipName = 'Pathfinder';
      const inputs = page.locator('input[type="text"]');
      await inputs.nth(0).fill(charName);
      await inputs.nth(1).fill(shipName);
      await page.click('button:has-text("Create Character")');
      await page.waitForTimeout(3000);
    }

    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await page.locator('.xterm-rows').waitFor({ state: 'attached', timeout: 10000 });
  } catch (err) {
    console.error(JSON.stringify({
      error: 'Failed to load SpacerQuest. Is the server running?',
      details: String(err),
    }));
    process.exit(1);
  }

  // ── IPC Loop ──
  const tracker = initTracker();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  // Signal ready
  console.log(JSON.stringify({ status: 'ready' }));

  rl.on('line', async (line) => {
    try {
      const msg = JSON.parse(line);

      // ── Reset ──
      if (msg.command === 'reset') {
        const state = await fetchState(page, requestCtx);
        const derived = computeDerivedMetrics(state, 'visit-pub', tracker);
        console.log(JSON.stringify({ state: derived }));
        return;
      }

      // ── Step ──
      if (msg.command === 'step' && msg.action_id !== undefined) {
        const actionName = ACTIONS[msg.action_id] ?? 'visit-pub';

        await executeAction(page, actionName);

        const state = await fetchState(page, requestCtx);
        const derived = computeDerivedMetrics(state, actionName, tracker);

        console.log(JSON.stringify({
          state: derived,
          terminated: false,
          truncated: false,
          info: { action: actionName, step: tracker.stepCount },
        }));
        return;
      }

      // ── Close ──
      if (msg.command === 'close') {
        await browser.close();
        process.exit(0);
      }
    } catch (err) {
      // Return error as valid JSON so UGT doesn't crash
      console.log(JSON.stringify({
        state: { credits: 0, fuel: 0, hullCondition: 0, upgrade_power: 0, fuel_safety: 0,
                 trade_profit: 0, upgrade_delta: 0, growth_factor: 1, pub_penalty: 0,
                 turns_alive: 0, total_trades: 0, total_upgrades: 0 },
        terminated: false,
        truncated: false,
        info: { error: String(err) },
      }));
    }
  });
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
});
