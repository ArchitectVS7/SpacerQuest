/**
 * UGT API-Direct Bridge for SpacerQuest — Phase 3
 * 
 * FAST MODE: Bypasses Playwright/terminal entirely.
 * 
 * Phase 3 changes:
 *   - Consolidated action space: 9 → 7 (trade & upgrade are atomic)
 *   - Idle penalty for safe no-op exploitation
 *   - Reduced starting resources to force resource management
 *   - Proper tracker reset between episodes
 *   - Episode termination on bankruptcy or 200 steps
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const API = 'http://localhost:3000';

// ── Action Space (Phase 3: Consolidated) ─────────────────────────────────────

const ACTIONS = [
  'trade',          // Atomic: get-cargo → launch → arrive → deliver
  'buy-fuel',
  'upgrade-ship',   // Atomic: upgrade weakest component
  'repair',
  'visit-pub',
  'sell-fuel',
  'visit-bank',
] as const;

type ActionName = typeof ACTIONS[number];

// Actions that don't advance game state (exploitable for survival bonus)
const IDLE_ACTIONS: Set<ActionName> = new Set(['visit-bank', 'sell-fuel']);

// ── Reward Tracking State ────────────────────────────────────────────────────

interface RewardTracker {
  prevCredits: number;
  prevFuel: number;
  prevUpgradePower: number;
  totalTrades: number;
  totalUpgrades: number;
  lastPubStep: number;
  consecutiveIdles: number;
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
    consecutiveIdles: 0,
    stepCount: 0,
  };
}

// ── HTTP Helpers ─────────────────────────────────────────────────────────────

let authToken = '';

async function api(method: string, path: string, body?: any): Promise<any> {
  const opts: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API}${path}`, opts);
  if (!res.ok) return { error: `${res.status} ${res.statusText}` };
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ── Auth & Character Bootstrap ───────────────────────────────────────────────

const TOKEN_CACHE = path.join(os.tmpdir(), 'spacerquest-ugt-token.txt');

async function authenticate(): Promise<string> {
  if (fs.existsSync(TOKEN_CACHE)) {
    const cached = fs.readFileSync(TOKEN_CACHE, 'utf8').trim();
    if (cached) {
      const check = await fetch(`${API}/auth/status`, {
        headers: { Authorization: `Bearer ${cached}` },
      });
      if (check.ok) return cached;
    }
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}/auth/dev-login`, { redirect: 'manual' });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
      await new Promise(r => setTimeout(r, (retryAfter + 1) * 1000));
      continue;
    }
    const location = res.headers.get('location') || '';
    const match = location.match(/token=([^&]+)/);
    if (match) {
      fs.writeFileSync(TOKEN_CACHE, match[1]);
      return match[1];
    }
  }
  throw new Error('Dev login failed after 5 attempts');
}

async function ensureCharacter(): Promise<void> {
  const status = await api('GET', '/auth/status');
  if (!status.hasCharacter) {
    const name = `Agent${Date.now().toString().slice(-4)}`;
    await api('POST', '/auth/character', { name, shipName: 'Pathfinder' });
  }
}

/**
 * Bootstrap character with clean state, with retry for rate limiting.
 * Called on every episode reset — must handle 429s gracefully.
 */
async function bootstrapLeanCharacter(): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await api('POST', '/auth/dev-setup-character');
    if (!result.error) return;

    // Check for rate limiting
    if (String(result.error).includes('429')) {
      const waitMs = Math.min(1000 * (attempt + 1), 5000);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    // Non-rate-limit error — just proceed with current state
    return;
  }
  // If all attempts fail, proceed anyway (character may be in prior state)
}

// ── State Fetching ───────────────────────────────────────────────────────────

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

async function fetchState(): Promise<GameState> {
  const [charRes, shipRes] = await Promise.all([
    api('GET', '/api/character'),
    api('GET', '/api/ship/status'),
  ]);

  const char = charRes.character || charRes;
  return {
    credits: (char.creditsHigh || 0) * 10000 + (char.creditsLow || 0),
    fuel: shipRes.fuel || 0,
    system: char.currentSystem || 1,
    cargoPods: char.cargoPods || 0,
    cargoType: char.cargoType || 0,
    destination: char.destination || 0,
    tripCount: char.tripCount || 0,
    components: shipRes.components || [],
    maxCargoPods: shipRes.maxCargoPods || 0,
    score: char.score || 0,
    rank: char.rank || 'LIEUTENANT',
  };
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
  tracker: RewardTracker,
): Record<string, number> {
  const upgradePower = computeUpgradePower(state.components);
  const hullCondition = computeHullCondition(state.components);

  // ── Trade Profit (must be computed FIRST to gate other metrics) ──
  let trade_profit = 0;
  let tradeSucceeded = false;
  if (action === 'trade') {
    const creditDelta = state.credits - tracker.prevCredits;
    if (creditDelta > 0) {
      // Successful delivery — credits increased
      trade_profit = creditDelta;
      tradeSucceeded = true;
      tracker.totalTrades++;
    }
    // Failed trade attempts (no credit change) are NOT counted
  }

  // ── Failed Trade Penalty ──
  // If the agent chose "trade" but no delivery happened, small penalty
  let failed_trade = 0;
  if (action === 'trade' && !tradeSucceeded) {
    failed_trade = 0.5;  // Small cost per wasted trade attempt
  }

  // ── Fuel Safety (only on SUCCESSFUL trades) ──
  let fuel_safety = 0;
  if (tradeSucceeded) {
    if (state.fuel < 30) fuel_safety = -50;
    else if (state.fuel < 60) fuel_safety = 5;
    else if (state.fuel < 200) fuel_safety = 15;
    else fuel_safety = 10;
  }

  // ── Upgrade Delta ──
  const upgrade_delta = upgradePower - tracker.prevUpgradePower;
  if (upgrade_delta > 0) tracker.totalUpgrades++;

  // ── Growth Factor ──
  let growth_factor = 1.0;
  if (tracker.totalTrades > 3) {
    const ratio = tracker.totalUpgrades / tracker.totalTrades;
    growth_factor = Math.min(1.0, ratio * 3);
    if (ratio < 0.1) growth_factor = 0;
  }

  // ── Pub Penalty ──
  let pub_penalty = 0;
  if (action === 'visit-pub') {
    const gap = tracker.stepCount - tracker.lastPubStep;
    if (gap < 5) pub_penalty = 10;
    tracker.lastPubStep = tracker.stepCount;
  }

  // ── Idle Penalty ──
  let idle_penalty = 0;
  if (IDLE_ACTIONS.has(action)) {
    tracker.consecutiveIdles++;
    if (tracker.consecutiveIdles > 2) {
      idle_penalty = 1;  // Escalating cost for no-op spam
    }
  } else {
    tracker.consecutiveIdles = 0;
  }

  // ── Update tracker ──
  tracker.prevCredits = state.credits;
  tracker.prevFuel = state.fuel;
  tracker.prevUpgradePower = upgradePower;
  tracker.stepCount++;

  return {
    credits: state.credits / 10000,
    fuel: state.fuel,
    hullCondition,
    cargoPods: state.cargoPods,
    destination: state.destination,
    maxCargoPods: state.maxCargoPods,
    score: state.score,
    upgrade_power: upgradePower,
    fuel_safety,
    trade_profit: trade_profit / 1000,
    upgrade_delta,
    growth_factor,
    pub_penalty,
    idle_penalty,
    failed_trade,
    turns_alive: tracker.stepCount,
    total_trades: tracker.totalTrades,
    total_upgrades: tracker.totalUpgrades,
  };
}

// ── API Action Execution ─────────────────────────────────────────────────────

async function executeAction(action: ActionName, state: GameState): Promise<void> {
  switch (action) {
    case 'trade': {
      // Atomic trade: get cargo → launch → arrive → deliver
      // Step 1: Accept cargo if we don't have any
      if (state.cargoPods === 0 || state.cargoType === 0) {
        const cargoResult = await api('POST', '/api/economy/cargo/accept');
        if (cargoResult.error) break;
        // Refetch state to get destination
        const updated = await fetchState();
        if (updated.destination > 0) {
          // Step 2: Launch to cargo destination
          const launchResult = await api('POST', '/api/navigation/launch', {
            destinationSystemId: updated.destination,
          });
          if (!launchResult.error) {
            // Step 3: Arrive
            await api('POST', '/api/navigation/arrive');
            // Step 4: Deliver
            await api('POST', '/api/economy/cargo/deliver');
          }
        }
      } else if (state.destination > 0) {
        // Already have cargo, deliver it
        const launchResult = await api('POST', '/api/navigation/launch', {
          destinationSystemId: state.destination,
        });
        if (!launchResult.error) {
          await api('POST', '/api/navigation/arrive');
          await api('POST', '/api/economy/cargo/deliver');
        }
      }
      break;
    }

    case 'buy-fuel': {
      const toBuy = Math.min(200, Math.max(10, 500 - state.fuel));
      await api('POST', '/api/economy/fuel/buy', { units: toBuy });
      break;
    }

    case 'sell-fuel': {
      const toSell = Math.min(50, Math.max(0, state.fuel - 100));
      if (toSell > 0) await api('POST', '/api/economy/fuel/sell', { units: toSell });
      break;
    }

    case 'upgrade-ship': {
      // Atomic: upgrade the weakest component
      if (state.components.length > 0) {
        const weakest = state.components.reduce(
          (min, c) => (c.strength < min.strength ? c : min),
          state.components[0],
        );
        const compMap: Record<string, string> = {
          'Hull': 'HULL', 'Drives': 'DRIVES', 'Cabin': 'CABIN',
          'Life Support': 'LIFE_SUPPORT', 'Weapons': 'WEAPONS',
          'Navigation': 'NAVIGATION', 'Robotics': 'ROBOTICS', 'Shields': 'SHIELDS',
        };
        const compKey = compMap[weakest.name] || 'HULL';
        await api('POST', '/api/ship/upgrade', { component: compKey, upgradeType: 'STRENGTH' });
      }
      break;
    }

    case 'repair':
      await api('POST', '/api/ship/repair');
      break;

    case 'visit-pub':
      // Gamble small amount
      await api('POST', '/api/economy/gamble/wheel', {
        betNumber: 7,
        betAmount: Math.min(100, Math.max(10, Math.floor(state.credits * 0.01))),
        rolls: 1,
      });
      break;

    case 'visit-bank':
      // Read-only / invest
      if (state.credits > 5000) {
        await api('POST', '/api/economy/alliance/invest', { amount: 1000 });
      }
      break;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    authToken = await authenticate();
    await ensureCharacter();
  } catch (err) {
    console.error(JSON.stringify({
      error: 'Failed to authenticate with SpacerQuest API.',
      details: String(err),
    }));
    process.exit(1);
  }

  let tracker = initTracker();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  console.log(JSON.stringify({ status: 'ready' }));

  rl.on('line', async (line) => {
    try {
      const msg = JSON.parse(line);

      // ── Reset ──
      if (msg.command === 'reset') {
        await bootstrapLeanCharacter();
        tracker = initTracker();
        const state = await fetchState();
        const derived = computeDerivedMetrics(state, 'visit-pub', tracker);
        console.log(JSON.stringify({ state: derived }));
        return;
      }

      // ── Step ──
      if (msg.command === 'step' && msg.action_id !== undefined) {
        const actionName = ACTIONS[msg.action_id] ?? 'visit-pub';
        const preState = await fetchState();

        await executeAction(actionName, preState);

        const postState = await fetchState();
        const derived = computeDerivedMetrics(postState, actionName, tracker);

        // Episode termination
        const isBankrupt = postState.credits <= 0;
        const maxSteps = tracker.stepCount >= 200;
        const terminated = isBankrupt;
        const truncated = maxSteps;

        console.log(JSON.stringify({
          state: derived,
          terminated,
          truncated,
          info: {
            action: actionName,
            step: tracker.stepCount,
            ...(isBankrupt ? { reason: 'bankruptcy' } : {}),
            ...(maxSteps ? { reason: 'max_steps' } : {}),
          },
        }));
        return;
      }

      // ── Close ──
      if (msg.command === 'close') {
        process.exit(0);
      }
    } catch (err) {
      console.log(JSON.stringify({
        state: {
          credits: 0, fuel: 0, hullCondition: 0, upgrade_power: 0,
          fuel_safety: 0, trade_profit: 0, upgrade_delta: 0,
          growth_factor: 1, pub_penalty: 0, idle_penalty: 0, failed_trade: 0,
          turns_alive: 0, total_trades: 0, total_upgrades: 0,
          cargoPods: 0, destination: 0, maxCargoPods: 0, score: 0,
        },
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
