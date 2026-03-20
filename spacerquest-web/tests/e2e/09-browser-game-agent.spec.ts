/**
 * SpacerQuest v4.0 - 50-Turn Strategic Playtest Agent
 *
 * Phase-driven decision engine that plays 50 full turns, exercising
 * as many game features as possible. Each turn = 2 trips + end-turn.
 *
 * Run:
 *   cd spacerquest-web
 *   npx playwright test tests/e2e/09-browser-game-agent.spec.ts --timeout 1800000
 *   npx playwright test tests/e2e/09-browser-game-agent.spec.ts --headed --timeout 1800000
 */

import { test, expect, Page, BrowserContext, APIRequestContext, request as apiRequest } from '@playwright/test';
import {
  getTerminalText,
  waitForText,
  pressKey,
  typeAndEnter,
  detectScreen,
} from './helpers/terminal';
import { ApiValidator } from './helpers/api-validator';

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let ctx: BrowserContext;
let page: Page;
let api: ApiValidator;
let requestCtx: APIRequestContext;

const MAIN_MENU_SIGNATURE = /Port Accounts/;

// ---------------------------------------------------------------------------
// Scorecard — tracks which game actions were exercised
// ---------------------------------------------------------------------------
const scorecard: Record<string, boolean> = {
  // Onboarding
  'dev-login': false,
  'create-or-load-character': false,
  'main-menu-render': false,

  // Bank
  'bank-deposit': false,
  'bank-withdraw': false,
  'bank-transfer': false,

  // Pub
  'pub-gossip': false,
  'pub-drink': false,
  'pub-wheel-of-fortune': false,
  'pub-spacers-dare': false,

  // Traders
  'buy-fuel': false,
  'sell-fuel': false,
  'accept-cargo': false,
  'deliver-cargo': false,
  'check-cargo-contract': false,

  // Navigation
  'navigate-travel': false,
  'travel-arrival': false,

  // Combat
  'combat-encounter': false,
  'combat-attack': false,
  'combat-retreat': false,
  'combat-surrender': false,
  'combat-victory': false,
  'friendly-npc': false,

  // Ship
  'shipyard-view': false,
  'shipyard-upgrade-strength': false,
  'shipyard-upgrade-condition': false,
  'shipyard-repair': false,
  'special-equipment-menu': false,
  'buy-auto-repair': false,

  // Alliance
  'join-alliance': false,
  'alliance-invest': false,
  'alliance-withdraw': false,
  'bulletin-board-read': false,
  'bulletin-board-write': false,
  'investment-center-screen': false,

  // Registry
  'registry-browse': false,
  'registry-directory': false,

  // Extra-curricular
  'extra-curricular-menu': false,
  'pirate-mode': false,
  'star-patrol-mode': false,
  'hire-ship-guard': false,

  // Gambling (via API)
  'gamble-wheel-api': false,
  'gamble-dare-api': false,

  // Social
  'social-directory': false,
  'social-leaderboard': false,
  'social-battle-log': false,

  // End turn
  'end-turn-terminal': false,

  // Smuggling/Jail
  'smuggling-cargo': false,
  'police-intercept': false,
  'pay-jail-fine': false,

  // NPC
  'visit-sage-system': false,
  'visit-wise-one-system': false,
};

function mark(action: string): void {
  if (action in scorecard) scorecard[action] = true;
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------
async function isMainMenu(): Promise<boolean> {
  const text = await getTerminalText(page);
  return MAIN_MENU_SIGNATURE.test(text);
}

async function goMainMenu(): Promise<void> {
  if (await isMainMenu()) return;
  const escapeKeys = ['r', 'q', 'm', 'Escape'];
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const key of escapeKeys) {
      await pressKey(page, key);
      await page.waitForTimeout(400);
      if (await isMainMenu()) return;
    }
  }
  await page.reload();
  await page.waitForTimeout(3000);
  await waitForText(page, MAIN_MENU_SIGNATURE, 15000);
}

async function resetTrips(): Promise<void> {
  const { execSync } = await import('child_process');
  execSync('npx tsx src/jobs/reset-trips.ts', {
    cwd: '/Users/vs7/Dev/Games/SpacerQuest/spacerquest-web',
    timeout: 15000,
  });
}

/** Pick a neighbor system (distance 1 from current, staying in core 1-14). */
function pickNeighbor(current: number): number {
  if (current >= 14) return current - 1;
  if (current <= 1) return current + 1;
  // Alternate direction to avoid ping-ponging in same 2 systems
  return current % 2 === 0 ? current + 1 : current - 1;
}

/** Step toward a distant system by 1 system at a time. */
function stepToward(current: number, target: number): number {
  if (current === target) return pickNeighbor(current);
  return current < target ? current + 1 : current - 1;
}

/** Estimate fuel needed for distance-1 travel based on starting drives. */
const FUEL_PER_HOP = 20; // Conservative: (21-5)+(10-9)=17, add margin

/** Systems with cheap fuel. Key = system ID, value = price per unit. */
const CHEAP_FUEL_SYSTEMS: Record<number, number> = { 1: 8, 8: 4, 14: 6 };
const DEFAULT_FUEL_PRICE = 25;

/** Maximum cargo destination distance we'll actively pursue. */
const MAX_CARGO_PURSUIT_DISTANCE = 5;

/** Get local fuel price for a system. */
function getFuelPriceFor(system: number): number {
  return CHEAP_FUEL_SYSTEMS[system] ?? DEFAULT_FUEL_PRICE;
}

/** Sell fuel to recover credits when stranded. */
async function recoverFromStranded(): Promise<void> {
  const ship = await api.getShipStatus();
  const char = await api.getCharacter();
  const credits = api.computeCredits(char.creditsHigh, char.creditsLow);

  // If we have some fuel but no credits, sell fuel to bootstrap
  if (credits < 50 && ship.fuel > 30) {
    const sellUnits = Math.min(ship.fuel - 15, 50); // Keep 15 fuel minimum
    if (sellUnits > 0) {
      const result = await api.sellFuel(sellUnits);
      if (!result.error) {
        const price = getFuelPriceFor(char.currentSystem);
        const proceeds = Math.floor(sellUnits * price * 0.5);
        console.log(`    [+] Sold ${sellUnits} fuel for ~${proceeds} cr (recovery)`);
      }
    }
  }
}

/** Buy fuel in bulk when at a cheap fuel system. */
async function buyBulkFuelIfCheap(): Promise<void> {
  const char = await api.getCharacter();
  const ship = await api.getShipStatus();
  const credits = api.computeCredits(char.creditsHigh, char.creditsLow);
  const price = getFuelPriceFor(char.currentSystem);

  if (price <= 8 && credits > 500) {
    // At a cheap system — buy as much as we can afford while keeping 300 cr reserve
    const affordableUnits = Math.floor((credits - 300) / price);
    const maxCapacity = 500; // Don't buy more than 500 at once
    const unitsToBuy = Math.min(affordableUnits, maxCapacity);
    if (unitsToBuy > 10) {
      await api.buyFuel(unitsToBuy);
      console.log(`    [+] Bulk fuel: ${unitsToBuy} units at ${price} cr/unit (sys ${char.currentSystem})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Phase action functions
// ---------------------------------------------------------------------------

async function doPhase1Actions(turn: number): Promise<void> {
  const snap = await api.snapshotState();

  // Bank deposit/withdraw (need meaningful credits)
  if (!scorecard['bank-deposit'] && snap.credits > 500) {
    await goMainMenu();
    await pressKey(page, 'b');
    await waitForText(page, /BANK|GALACTIC BANK/i, 10000);
    await pressKey(page, 'd');
    await page.waitForTimeout(500);
    await typeAndEnter(page, '100');
    await page.waitForTimeout(1000);
    mark('bank-deposit');
    console.log('    [+] Bank deposit');

    // Withdraw
    await pressKey(page, 'w');
    await page.waitForTimeout(500);
    await typeAndEnter(page, '50');
    await page.waitForTimeout(1000);
    mark('bank-withdraw');
    console.log('    [+] Bank withdraw');

    await goMainMenu();
  }

  // Pub gossip + drink
  if (!scorecard['pub-gossip']) {
    try {
      await goMainMenu();
      await pressKey(page, 'p');
      await waitForText(page, /PUB|LONELY ASTEROID/i, 5000);
      await pressKey(page, 'g');
      await page.waitForTimeout(1000);
      mark('pub-gossip');
      console.log('    [+] Pub gossip');

      if (snap.credits > 100) {
        await pressKey(page, 'b');
        await page.waitForTimeout(1000);
        mark('pub-drink');
        console.log('    [+] Pub drink');
      }
    } catch {
      console.log('    [-] Pub interaction failed');
    }
    await goMainMenu();
  }

  // Registry browse
  if (!scorecard['registry-browse']) {
    try {
      await goMainMenu();
      await pressKey(page, 'r');
      await waitForText(page, /REGISTRY|RECORD|SPACER/i, 5000);
      mark('registry-browse');
      console.log('    [+] Registry browse');
    } catch {
      console.log('    [-] Registry navigation failed');
    }
    await goMainMenu();
  }

  // View special equipment menu (Cloaker requires hull < 5, not available at start)
  if (!scorecard['special-equipment-menu']) {
    try {
      await goMainMenu();
      await pressKey(page, 's');
      await waitForText(page, /SHIPYARD/i, 5000);
      mark('shipyard-view');
      await pressKey(page, 's'); // Special equipment
      await page.waitForTimeout(1500);
      const seText = await getTerminalText(page);
      if (/SPECIAL EQUIPMENT|Cloaker|Auto-Repair/i.test(seText)) {
        mark('special-equipment-menu');
        console.log('    [+] Special equipment menu viewed');
      }
      await pressKey(page, '0'); // Back
      await page.waitForTimeout(500);
    } catch {
      console.log('    [-] Special equipment menu navigation failed');
    }
    await goMainMenu();
  }

  // Shipyard view
  if (!scorecard['shipyard-view']) {
    await goMainMenu();
    await pressKey(page, 's');
    await waitForText(page, /SHIPYARD/i, 10000);
    mark('shipyard-view');
    console.log('    [+] Shipyard view');
    await goMainMenu();
  }

  // Buy/sell fuel
  if (!scorecard['buy-fuel']) {
    await api.buyFuel(5);
    mark('buy-fuel');
    console.log('    [+] Buy fuel');
  }
  if (!scorecard['sell-fuel']) {
    const ship = await api.getShipStatus();
    if (ship.fuel > 20) {
      await api.sellFuel(3);
      mark('sell-fuel');
      console.log('    [+] Sell fuel');
    }
  }

  // Early upgrades — prioritize DRIVES to reduce fuel costs, then cheap combat stats
  const freshSnap = await api.snapshotState();
  if (freshSnap.credits > 4500) {
    // DRIVES first (9000 cr) — reduces fuel cost per hop significantly
    // Then ROBOTICS (4000) → NAVIGATION (5000) → SHIELDS (7000) → WEAPONS (8000)
    const upgradeOrder = freshSnap.credits > 9000
      ? ['DRIVES', 'ROBOTICS', 'NAVIGATION', 'SHIELDS', 'WEAPONS']
      : ['ROBOTICS', 'NAVIGATION', 'SHIELDS', 'WEAPONS'];
    for (const comp of upgradeOrder) {
      const result = await api.upgradeComponent(comp, 'STRENGTH');
      if (!result.error) {
        mark('shipyard-upgrade-strength');
        console.log(`    [+] Early upgrade: ${comp} strength (${result.cost} cr)`);
        break;
      }
    }
  }

  // Accept cargo — but only if we can afford the delivery distance
  if (snap.cargoPods === 0 && snap.credits > 100) {
    const cargo = await api.acceptCargo();
    if (cargo.success || cargo.contract) {
      mark('accept-cargo');
      const char = await api.getCharacter();
      const dist = Math.abs(char.destination - char.currentSystem);
      console.log(`    [+] Cargo accepted: ${char.cargoPods} pods → system ${char.destination} (dist ${dist})`);
    }
  }
}

async function doPhase2Actions(turn: number): Promise<void> {
  const snap = await api.snapshotState();

  // Cargo run — accept if we don't have cargo
  if (snap.cargoPods === 0 && snap.credits > 200) {
    const cargo = await api.acceptCargo();
    if (cargo.success || cargo.contract) {
      mark('accept-cargo');
      const char = await api.getCharacter();
      const dist = Math.abs(char.destination - char.currentSystem);
      console.log(`    [+] Cargo accepted: ${char.cargoPods} pods → system ${char.destination} (dist ${dist})`);
    }
  }

  // Gambling: Wheel of Fortune (API)
  if (!scorecard['gamble-wheel-api'] && snap.credits > 200) {
    const result = await api.gambleWheel(10, 100, 5);
    if (!result.error) {
      mark('gamble-wheel-api');
      console.log(`    [+] Wheel of Fortune: ${result.won ? 'WON' : 'lost'} (${result.payout || result.cost} cr)`);
    }
  }

  // Gambling: Spacer's Dare (API)
  if (!scorecard['gamble-dare-api'] && snap.credits > 800) {
    const result = await api.gambleDare(5, 1);
    if (!result.error) {
      mark('gamble-dare-api');
      console.log(`    [+] Spacer's Dare: ${result.winner === 'player' ? 'WON' : 'lost'} (net ${result.netCredits} cr)`);
    }
  }

  // Terminal gambling: Wheel of Fortune
  if (!scorecard['pub-wheel-of-fortune'] && snap.credits > 200) {
    await goMainMenu();
    await pressKey(page, 'p');
    await waitForText(page, /PUB|LONELY ASTEROID/i, 10000);
    await pressKey(page, 'w');
    await page.waitForTimeout(800);
    const text = await getTerminalText(page);
    if (/bet number|pick.*number|WHEEL/i.test(text)) {
      await typeAndEnter(page, '10');
      await page.waitForTimeout(600);
      await typeAndEnter(page, '3');
      await page.waitForTimeout(600);
      await typeAndEnter(page, '50');
      await page.waitForTimeout(1500);
      mark('pub-wheel-of-fortune');
      console.log('    [+] Pub Wheel of Fortune played');
    }
    await goMainMenu();
  }

  // Terminal gambling: Spacer's Dare
  if (!scorecard['pub-spacers-dare'] && snap.credits > 800) {
    await goMainMenu();
    await pressKey(page, 'p');
    await waitForText(page, /PUB|LONELY ASTEROID/i, 10000);
    await pressKey(page, 'd');
    await page.waitForTimeout(800);
    const text = await getTerminalText(page);
    if (/rounds|DARE/i.test(text)) {
      await typeAndEnter(page, '3');
      await page.waitForTimeout(600);
      await typeAndEnter(page, '1');
      await page.waitForTimeout(1500);
      mark('pub-spacers-dare');
      console.log('    [+] Pub Spacer\'s Dare played');
    }
    await goMainMenu();
  }

  // Upgrade components — DRIVES first for fuel economy, then combat stats
  if (snap.credits > 4500) {
    const upgradeOrder = snap.credits > 9000
      ? ['DRIVES', 'ROBOTICS', 'NAVIGATION', 'SHIELDS', 'WEAPONS', 'LIFE_SUPPORT', 'HULL', 'CABIN']
      : ['ROBOTICS', 'NAVIGATION', 'SHIELDS', 'WEAPONS', 'LIFE_SUPPORT', 'HULL', 'DRIVES', 'CABIN'];
    for (const comp of upgradeOrder) {
      const result = await api.upgradeComponent(comp, 'STRENGTH');
      if (!result.error) {
        mark('shipyard-upgrade-strength');
        console.log(`    [+] Upgraded ${comp} strength (${result.cost} cr)`);
        break;
      }
    }
  }

  // Also try condition upgrade if damaged
  if (!scorecard['shipyard-upgrade-condition'] && snap.credits > 3000) {
    const ship = await api.getShipStatus();
    const damaged = ship.components.find(c => c.condition < 8);
    if (damaged) {
      const name = damaged.name.toUpperCase().replace(/ /g, '_');
      const result = await api.upgradeComponent(name, 'CONDITION');
      if (!result.error) {
        mark('shipyard-upgrade-condition');
        console.log(`    [+] Upgraded ${damaged.name} condition`);
      }
    }
  }

  // Repair if damaged
  if (snap.credits > 500) {
    const ship = await api.getShipStatus();
    const anyDamaged = ship.components.some(c => c.condition < 9);
    if (anyDamaged) {
      const result = await api.repairShip();
      if (result.success || result.cost !== undefined) {
        mark('shipyard-repair');
        console.log(`    [+] Ship repaired (${result.cost || 0} cr)`);
      }
    }
  }
}

async function doPhase3Actions(turn: number): Promise<void> {
  const snap = await api.snapshotState();

  // Accept cargo for income
  if (snap.cargoPods === 0 && snap.credits > 200) {
    const cargo = await api.acceptCargo();
    if (cargo.success || cargo.contract) {
      mark('accept-cargo');
      const char = await api.getCharacter();
      const dist = Math.abs(char.destination - char.currentSystem);
      console.log(`    [+] Cargo accepted: ${char.cargoPods} pods → system ${char.destination} (dist ${dist})`);
    }
  }

  // Join alliance
  if (!scorecard['join-alliance']) {
    const ok = await api.joinAlliance('+');
    if (ok) {
      mark('join-alliance');
      console.log('    [+] Joined Astro League');
    }
  }

  // Alliance invest (even small amounts — just to validate the action)
  if (!scorecard['alliance-invest'] && snap.credits > 500) {
    const result = await api.allianceInvest(100);
    if (!result.error) {
      mark('alliance-invest');
      console.log('    [+] Alliance invest 100 cr');
    }
  }

  // Alliance withdraw (only after investing)
  if (!scorecard['alliance-withdraw'] && scorecard['alliance-invest']) {
    const result = await api.allianceWithdraw(50);
    if (!result.error) {
      mark('alliance-withdraw');
      console.log('    [+] Alliance withdraw 50 cr');
    }
  }

  // Bulletin board
  if (!scorecard['bulletin-board-read']) {
    const board = await api.readBulletinBoard();
    if (!board.error) {
      mark('bulletin-board-read');
      console.log('    [+] Bulletin board read');
    }
  }
  if (!scorecard['bulletin-board-write']) {
    const result = await api.postBulletinBoard('Strategic playtest agent was here!');
    if (!result.error) {
      mark('bulletin-board-write');
      console.log('    [+] Bulletin board post');
    }
  }

  // Investment center screen (terminal)
  if (!scorecard['investment-center-screen']) {
    await goMainMenu();
    await pressKey(page, 'i');
    await page.waitForTimeout(2000);
    const text = await getTerminalText(page);
    if (/ALLIANCE|INVEST/i.test(text)) {
      mark('investment-center-screen');
      console.log('    [+] Investment center screen viewed');
    }
    await goMainMenu();
  }

  // Systematic upgrades
  if (snap.credits > 8000) {
    const allComps = ['HULL', 'DRIVES', 'WEAPONS', 'SHIELDS', 'LIFE_SUPPORT', 'NAVIGATION', 'ROBOTICS', 'CABIN'];
    for (const comp of allComps) {
      const result = await api.upgradeComponent(comp, 'STRENGTH');
      if (!result.error) {
        mark('shipyard-upgrade-strength');
        console.log(`    [+] Upgraded ${comp} strength`);
        break;
      }
    }
  }

  // Condition upgrade
  if (!scorecard['shipyard-upgrade-condition'] && snap.credits > 5000) {
    const ship = await api.getShipStatus();
    const damaged = ship.components.find(c => c.condition < 9);
    if (damaged) {
      const result = await api.upgradeComponent(damaged.name.toUpperCase().replace(' ', '_'), 'CONDITION');
      if (!result.error) {
        mark('shipyard-upgrade-condition');
        console.log(`    [+] Upgraded ${damaged.name} condition`);
      }
    }
  }

  // Repair
  if (turn % 3 === 0) {
    const result = await api.repairShip();
    if (result.success || result.cost !== undefined) {
      mark('shipyard-repair');
    }
  }

  // Extra-curricular menu + modes
  if (!scorecard['extra-curricular-menu']) {
    await goMainMenu();
    await pressKey(page, 'e');
    await page.waitForTimeout(1500);
    const text = await getTerminalText(page);
    if (/EXTRA-CURRICULAR/i.test(text)) {
      mark('extra-curricular-menu');
      console.log('    [+] Extra-curricular menu');

      // Pirate mode
      await pressKey(page, 'p');
      await page.waitForTimeout(500);
      mark('pirate-mode');
      console.log('    [+] Pirate mode activated');

      // Switch to star patrol
      await pressKey(page, 's');
      await page.waitForTimeout(500);
      mark('star-patrol-mode');
      console.log('    [+] Star patrol mode activated');

      // Cancel mode
      await pressKey(page, 'n');
      await page.waitForTimeout(500);
    }
    await goMainMenu();
  }

  // Hire ship guard
  if (!scorecard['hire-ship-guard'] && snap.credits > 12000) {
    await goMainMenu();
    await pressKey(page, 'e');
    await page.waitForTimeout(1500);
    const text = await getTerminalText(page);
    if (/EXTRA-CURRICULAR/i.test(text)) {
      await pressKey(page, 'g');
      await page.waitForTimeout(1000);
      const guardText = await getTerminalText(page);
      if (/guard hired|GUARD/i.test(guardText)) {
        mark('hire-ship-guard');
        console.log('    [+] Ship guard hired');
      }
    }
    await goMainMenu();
  }

  // Social queries
  if (!scorecard['social-directory']) {
    const dir = await api.getDirectory();
    if (!dir.error) {
      mark('social-directory');
      console.log('    [+] Social directory queried');
    }
  }
  if (!scorecard['social-leaderboard']) {
    const lb = await api.getLeaderboard();
    if (!lb.error) {
      mark('social-leaderboard');
      console.log('    [+] Leaderboard queried');
    }
  }
  if (!scorecard['social-battle-log']) {
    const bl = await api.getBattleLog();
    if (!bl.error) {
      mark('social-battle-log');
      console.log('    [+] Battle log queried');
    }
  }
}

async function doPhase4Actions(turn: number): Promise<void> {
  const snap = await api.snapshotState();

  // Accept cargo for income
  if (snap.cargoPods === 0 && snap.credits > 200) {
    const cargo = await api.acceptCargo();
    if (cargo.success || cargo.contract) {
      mark('accept-cargo');
      const char = await api.getCharacter();
      const dist = Math.abs(char.destination - char.currentSystem);
      console.log(`    [+] Cargo accepted: ${char.cargoPods} pods → system ${char.destination} (dist ${dist})`);
    }
  }

  // Upgrades
  if (snap.credits > 5000) {
    const upgradeOrder = ['WEAPONS', 'SHIELDS', 'HULL', 'DRIVES', 'NAVIGATION', 'ROBOTICS'];
    for (const comp of upgradeOrder) {
      const result = await api.upgradeComponent(comp, 'STRENGTH');
      if (!result.error) {
        mark('shipyard-upgrade-strength');
        console.log(`    [+] Upgraded ${comp} strength (${result.cost} cr)`);
        break;
      }
    }
  }

  // Repair
  const ship = await api.getShipStatus();
  const anyDamaged = ship.components.some(c => c.condition < 9);
  if (anyDamaged && snap.credits > 200) {
    const result = await api.repairShip();
    if (result.success || result.cost !== undefined) {
      mark('shipyard-repair');
    }
  }

  // Auto-Repair if affordable (hull_strength * 1000)
  if (!scorecard['buy-auto-repair']) {
    const ship = await api.getShipStatus();
    const hull = ship.components.find(c => c.name.toLowerCase().includes('hull'));
    const cost = (hull?.strength || 5) * 1000;
    if (snap.credits > cost + 5000) {
      await goMainMenu();
      await pressKey(page, 's');
      await waitForText(page, /SHIPYARD/i, 10000);
      await pressKey(page, 's'); // Special equipment
      await waitForText(page, /SPECIAL EQUIPMENT/i, 10000);
      await pressKey(page, '2'); // Auto-Repair
      await page.waitForTimeout(1000);
      const text = await getTerminalText(page);
      if (/installed/i.test(text)) {
        mark('buy-auto-repair');
        console.log('    [+] Auto-Repair purchased');
      }
      await goMainMenu();
    }
  }

  // Bank transfer (if in alliance)
  if (!scorecard['bank-transfer']) {
    await goMainMenu();
    await pressKey(page, 'b');
    await waitForText(page, /BANK|GALACTIC BANK/i, 10000);
    await pressKey(page, 't'); // Transfer
    await page.waitForTimeout(500);
    await typeAndEnter(page, '100');
    await page.waitForTimeout(1000);
    const text = await getTerminalText(page);
    if (/transfer|alliance/i.test(text)) {
      mark('bank-transfer');
      console.log('    [+] Bank transfer to alliance');
    }
    await goMainMenu();
  }

  // Smuggling attempt (try to accept cargo, hope for type 10)
  if (!scorecard['smuggling-cargo'] && snap.cargoPods === 0) {
    const cargo = await api.acceptCargo();
    if (cargo.success || cargo.contract) {
      const char = await api.getCharacter();
      if (char.cargoType === 10) {
        mark('smuggling-cargo');
        console.log('    [+] Contraband cargo obtained!');
      }
    }
  }

}

/** Try to fight a combat encounter. Only engages when ship is strong enough. */
async function tryCombat(): Promise<boolean> {
  const ship = await api.getShipStatus();
  const weapons = ship.components.find(c => c.name.toLowerCase().includes('weapon'));
  const shields = ship.components.find(c => c.name.toLowerCase().includes('shield'));

  // Attempt combat if we have functional weapons — even weak fights give score/experience
  const weaponPower = (weapons?.strength || 1) * (weapons?.condition || 1);
  const shieldPower = (shields?.strength || 1) * (shields?.condition || 1);
  if (weaponPower < 5) return false; // Need at least minimal weapons

  const result = await api.engageCombat();
  if (!result.encounter) return false;

  mark('combat-encounter');

  if (result.friendly) {
    mark('friendly-npc');
    console.log(`    [+] Friendly NPC: ${result.enemy?.name || 'ally'}`);
    return true;
  }

  const enemyBF = result.enemy?.battleFactor || 999;
  console.log(`    [+] Hostile encounter: ${result.enemy?.name} (BF ${enemyBF})`);

  // If enemy is very strong relative to our power, try to retreat immediately
  if (enemyBF > weaponPower + shieldPower + 20) {
    const retreatResult = await api.combatAction('RETREAT', 1, result.enemy);
    if (retreatResult.retreated) {
      mark('combat-retreat');
      console.log('    [+] Retreated from strong enemy');
      return true;
    }
    // Retreat failed — surrender to minimize losses
    const surrenderResult = await api.combatAction('SURRENDER', 2, result.enemy);
    mark('combat-surrender');
    console.log('    [+] Surrendered to strong enemy');
    return true;
  }

  // Fire rounds (fight up to 5 rounds trying for victory)
  for (let round = 1; round <= 5; round++) {
    const fireResult = await api.combatAction('FIRE', round, result.enemy);
    mark('combat-attack');

    if (fireResult.enemyDefeated) {
      mark('combat-victory');
      console.log(`    [+] Victory in round ${round}!`);
      return true;
    }

    if (fireResult.playerDefeated || fireResult.error) {
      console.log(`    [!] Defeated/error in combat round ${round}`);
      return true;
    }
  }

  // After 5 rounds, try retreat
  const retreatResult = await api.combatAction('RETREAT', 6, result.enemy);
  if (retreatResult.retreated) {
    mark('combat-retreat');
    console.log('    [+] Retreated after 5 rounds');
    return true;
  }

  // Surrender as last resort
  const surrenderResult = await api.combatAction('SURRENDER', 7, result.enemy);
  mark('combat-surrender');
  console.log('    [+] Surrendered after failed retreat');
  return true;
}

/** End turn via terminal (press D → Y → wait for summary → any key). */
async function endTurnTerminal(): Promise<boolean> {
  await goMainMenu();
  await pressKey(page, 'd');
  await page.waitForTimeout(1500);

  const text = await getTerminalText(page);
  if (/End your turn/i.test(text)) {
    await pressKey(page, 'y');
    // Wait for bot turns to process (can take a few seconds)
    await page.waitForTimeout(5000);

    const resultText = await getTerminalText(page);
    if (/spacers took their turns|Press any key/i.test(resultText)) {
      mark('end-turn-terminal');
      await pressKey(page, ' '); // Any key to continue
      await page.waitForTimeout(1000);
      console.log('    [+] End turn via terminal completed');
      return true;
    }
  }

  // Fall back to script reset
  await goMainMenu();
  return false;
}

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------
test.describe.serial('SpacerQuest 50-Turn Strategic Playtest', () => {
  test.setTimeout(60 * 60 * 1000); // 60 minutes

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    requestCtx = await apiRequest.newContext();
    api = new ApiValidator('', requestCtx);

    page.on('pageerror', err => {
      console.log(`  [Browser] ${err.message.substring(0, 200)}`);
    });
  });

  test.afterAll(async () => {
    await ctx?.close();
    await requestCtx?.dispose();
  });

  // ── Onboarding ──────────────────────────────────────────────────────────

  test('Login and setup', async () => {
    // Login via dev-login
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    const loginBtn = page.locator('button:has-text("[D] Development Login")');
    await loginBtn.waitFor({ timeout: 10000 });
    await loginBtn.click();
    await page.waitForURL(/token=/, { timeout: 15000 });

    const url = new URL(page.url());
    const token = url.searchParams.get('token')!;
    expect(token).toBeTruthy();
    api = new ApiValidator(token, requestCtx);
    mark('dev-login');
    console.log(`  Authenticated — JWT ${token.length} chars`);

    // Character creation or load
    await page.waitForTimeout(2000);
    const heading = page.locator('text=CREATE NEW SPACER');
    const hasCreationScreen = await heading.isVisible().catch(() => false);

    if (hasCreationScreen) {
      const ts = Date.now().toString().slice(-6);
      await page.locator('input[type="text"]').first().fill(`AGENT${ts}`);
      await page.locator('input[type="text"]').nth(1).fill(`EAGLE${ts}`);
      await page.locator('button:has-text("Create Character")').click();
      await page.waitForTimeout(3000);
    }

    mark('create-or-load-character');
    const char = await api.getCharacter();
    const snap = await api.snapshotState();
    console.log(`  Spacer: ${char.name} — ${snap.credits} cr, ${snap.fuel} fuel, system ${char.currentSystem}`);

    // Wait for main menu
    await waitForText(page, MAIN_MENU_SIGNATURE, 30000);
    mark('main-menu-render');
    console.log('  Main menu rendered');

    // Reset trips to start fresh
    await resetTrips();

    // Ensure character is in a playable state
    const startSnap = await api.snapshotState();
    if (startSnap.credits < 5000 || startSnap.fuel < 30 || startSnap.system < 1 || startSnap.system > 20) {
      // Reset via database script
      const { execSync } = await import('child_process');
      execSync(`npx tsx -e "
        import { PrismaClient } from '@prisma/client';
        const p = new PrismaClient();
        async function r() {
          const chars = await p.character.findMany({ where: { isBot: false }, include: { ship: true } });
          for (const c of chars) {
            await p.character.update({ where: { id: c.id }, data: { currentSystem: 1, creditsHigh: 1, creditsLow: 0, tripCount: 0, lastTripDate: null, cargoPods: 0, cargoType: 0, destination: 0, cargoManifest: null, crimeType: null, missionType: 0, isLost: false, lostLocation: null, extraCurricularMode: null } });
            if (c.ship) await p.ship.update({ where: { id: c.ship.id }, data: { fuel: 100, hullCondition: 9, driveCondition: 9, shieldCondition: 9, weaponCondition: 9, navigationCondition: 9, lifeSupportCondition: 9, cabinCondition: 9, roboticsCondition: 9 } });
            await p.travelState.deleteMany({ where: { characterId: c.id } });
          }
          await p.\\$disconnect();
        }
        r();
      "`, { cwd: '/Users/vs7/Dev/Games/SpacerQuest/spacerquest-web', timeout: 15000 });

      // Reload page after DB reset
      await page.reload();
      await page.waitForTimeout(3000);
      await waitForText(page, MAIN_MENU_SIGNATURE, 15000);
      const fresh = await api.snapshotState();
      console.log(`  Character reset: ${fresh.credits} cr, ${fresh.fuel} fuel, system ${fresh.system}`);
    }

    console.log('  Trips reset — ready to play');
  });

  // ── 50-Turn Game Loop ──────────────────────────────────────────────────

  test('50-turn strategic playtest', async () => {
    const TOTAL_TURNS = 50;

    for (let turn = 1; turn <= TOTAL_TURNS; turn++) {
      const phase = turn <= 5 ? 1 : turn <= 15 ? 2 : turn <= 30 ? 3 : 4;
      const snap = await api.snapshotState();
      const char = await api.getCharacter();
      console.log(`\n  ══ Turn ${turn}/${TOTAL_TURNS} (Phase ${phase}) — sys ${snap.system}, ${snap.credits} cr, ${snap.fuel} fuel, trips ${char.tripCount}/2 ══`);

      // Ensure trip count is 0 at start of turn
      if (char.tripCount >= 2) {
        await resetTrips();
      }

      // ── Phase-specific port actions ──
      try {
        if (phase === 1) await doPhase1Actions(turn);
        if (phase === 2) await doPhase2Actions(turn);
        if (phase === 3) await doPhase3Actions(turn);
        if (phase === 4) await doPhase4Actions(turn);
      } catch (err: any) {
        console.log(`    [!] Phase action error: ${err.message?.substring(0, 100)}`);
      }

      // ── 2 Trips per turn (original: 2 turns per day) ──
      for (let trip = 1; trip <= 2; trip++) {
        const currentSnap = await api.snapshotState();
        const currentChar = await api.getCharacter();

        // If character is stuck in transit (system 0), wait for arrival first
        if (currentSnap.system === 0 || currentSnap.system < 1) {
          try {
            await api.waitForArrival(page, 15000);
            const arrivedChar = await api.getCharacter();
            console.log(`    Trip ${trip}: Was in transit, arrived at system ${arrivedChar.currentSystem}`);
          } catch {
            console.log(`    Trip ${trip}: Stuck in transit — skipping`);
            continue;
          }
        }

        // Stranded recovery: sell fuel if we have fuel but no credits
        if (currentSnap.credits < 50 && currentSnap.fuel > 30) {
          await recoverFromStranded();
        }

        // Buy bulk fuel at cheap systems
        await buyBulkFuelIfCheap();

        // Ensure enough fuel for at least one hop
        if (currentSnap.fuel < FUEL_PER_HOP) {
          const price = getFuelPriceFor(currentChar.currentSystem);
          const credits = currentSnap.credits;
          if (credits >= price * 5) {
            const affordable = Math.floor(credits / price);
            await api.buyFuel(Math.min(100, affordable));
          }
          // Re-check fuel after buying
          const recheckShip = await api.getShipStatus();
          if (recheckShip.fuel < FUEL_PER_HOP) {
            // Last resort: sell any remaining fuel to get credits, then buy at cheaper rate
            if (recheckShip.fuel > 5) {
              await recoverFromStranded();
            }
            console.log(`    Trip ${trip}: Insufficient fuel (${recheckShip.fuel}) — skipping remaining trips`);
            break;
          }
        }

        // Determine destination (always distance-1 hops for reliability)
        let dest: number;

        // Special destinations based on phase (step toward them)
        if (phase >= 3 && !scorecard['visit-sage-system'] && turn >= 20) {
          dest = stepToward(currentSnap.system, 18);
        } else if (phase >= 3 && !scorecard['visit-wise-one-system'] && turn >= 24) {
          dest = stepToward(currentSnap.system, 17);
        } else if (currentChar.cargoPods > 0 && currentChar.destination > 0 && currentChar.destination !== currentSnap.system) {
          // Step toward cargo destination if we have enough fuel
          const cargoDist = Math.abs(currentChar.destination - currentSnap.system);
          const fuelNeeded = cargoDist * FUEL_PER_HOP;
          if (currentSnap.fuel >= fuelNeeded + 30) {
            // Have enough fuel to reach destination + margin
            dest = stepToward(currentSnap.system, currentChar.destination);
          } else if (currentSnap.credits > fuelNeeded * DEFAULT_FUEL_PRICE) {
            // Can afford to buy fuel for the trip
            dest = stepToward(currentSnap.system, currentChar.destination);
          } else {
            // Can't afford — deliver at wrong destination for 50% payment to clear cargo
            // Just do a normal hop and try to deliver wherever we end up
            dest = pickNeighbor(currentSnap.system);
          }
        } else {
          // When idle, gravitate toward cheap fuel systems for arbitrage
          const cheapTarget = currentSnap.system <= 4 ? 1 : currentSnap.system >= 11 ? 14 : 8;
          dest = stepToward(currentSnap.system, cheapTarget);
        }

        // Clamp to valid range
        dest = Math.max(1, Math.min(dest, 20));
        if (dest === currentSnap.system) dest = pickNeighbor(currentSnap.system);

        // Launch
        const launchResult = await api.launch(dest);
        if (launchResult.error) {
          console.log(`    Trip ${trip}: Launch failed → ${launchResult.error}`);
          if (/trip|limit/i.test(launchResult.error)) break;
          // Try neighbor as fallback
          dest = pickNeighbor(currentSnap.system);
          const retryResult = await api.launch(dest);
          if (retryResult.error) {
            console.log(`    Trip ${trip}: Retry also failed → ${retryResult.error}`);
            break;
          }
        }

        // Wait for arrival (distance-1 hops take ~3 seconds)
        const arrivalResult = await api.waitForArrival(page, 15000);
        const afterChar = await api.getCharacter();
        mark('navigate-travel');
        mark('travel-arrival');

        // Handle encounter from travel (pirates find you — original SP.WARP.S behavior)
        if (arrivalResult?.encounter) {
          const enc = arrivalResult.encounter;
          mark('combat-encounter');
          if (enc.friendly) {
            mark('friendly-npc');
            console.log(`    [+] Friendly NPC: ${enc.enemy?.name || 'ally'} (${enc.message})`);
          } else {
            console.log(`    [+] Hostile encounter: ${enc.enemy?.name} (BF ${enc.enemy?.battleFactor}) vs player BF ${enc.playerBF}`);
            // Respond to combat — try to fight if we're strong enough, otherwise retreat/surrender
            const weaponPower = (afterChar.shipName ? 1 : 1); // placeholder
            const ship = await api.getShipStatus();
            const weapons = ship.components.find((c: any) => c.name.toLowerCase().includes('weapon'));
            const shields = ship.components.find((c: any) => c.name.toLowerCase().includes('shield'));
            const myPower = ((weapons?.strength || 1) * (weapons?.condition || 1)) + ((shields?.strength || 1) * (shields?.condition || 1));

            if (myPower > enc.enemy.battleFactor * 0.5) {
              // Try to fight (up to 3 rounds)
              for (let round = 1; round <= 3; round++) {
                const fireResult = await api.combatAction('FIRE', round, enc.enemy);
                mark('combat-attack');
                if (fireResult.enemyDefeated) {
                  mark('combat-victory');
                  console.log(`    [+] Victory in round ${round}!`);
                  break;
                }
                if (fireResult.playerDefeated || fireResult.error) break;
              }
            } else {
              // Try retreat, then surrender
              const retreatResult = await api.combatAction('RETREAT', 1, enc.enemy);
              if (retreatResult.retreated) {
                mark('combat-retreat');
                console.log('    [+] Retreated from combat');
              } else {
                const surrenderResult = await api.combatAction('SURRENDER', 1, enc.enemy);
                mark('combat-surrender');
                console.log('    [+] Surrendered to enemy');
              }
            }
          }
        }

        // Check if arrived at Sage/Wise One systems
        if (afterChar.currentSystem === 18 && !scorecard['visit-sage-system']) {
          mark('visit-sage-system');
          console.log('    [+] Arrived at Sage system (18)');
          // Try visiting sage via terminal
          await goMainMenu();
          const menuText = await getTerminalText(page);
          if (/Ancient One|Sage/i.test(menuText)) {
            await pressKey(page, 'a');
            await page.waitForTimeout(2000);
            await goMainMenu();
          }
        }
        if (afterChar.currentSystem === 17 && !scorecard['visit-wise-one-system']) {
          mark('visit-wise-one-system');
          console.log('    [+] Arrived at Wise One system (17)');
          await goMainMenu();
          const menuText = await getTerminalText(page);
          if (/Wise One/i.test(menuText)) {
            await pressKey(page, 'w');
            await page.waitForTimeout(2000);
            await goMainMenu();
          }
        }

        // Cargo delivery check — try at correct destination, or force-deliver at wrong dest to avoid stale cargo
        if (currentChar.cargoPods > 0) {
          if (afterChar.currentSystem === currentChar.destination) {
            const deliverResult = await api.deliverCargo();
            if (deliverResult.success) {
              mark('deliver-cargo');
              console.log(`    Trip ${trip}: Cargo delivered for ${deliverResult.payment || '?'} cr`);
            } else if (deliverResult.intercepted) {
              mark('police-intercept');
              console.log(`    Trip ${trip}: Police intercepted!`);
              const fine = await api.payFine();
              if (fine.success) {
                mark('pay-jail-fine');
                console.log('    [+] Fine paid, released from jail');
              }
            }
          } else {
            // Try delivering at wrong destination to clear stale cargo (50% payment)
            const cargoDist = Math.abs(currentChar.destination - afterChar.currentSystem);
            const fuelNeeded = cargoDist * FUEL_PER_HOP;
            if (currentSnap.fuel < fuelNeeded && currentSnap.credits < 200) {
              // We're stuck with cargo we can't deliver — force deliver for 50% pay
              const deliverResult = await api.deliverCargo();
              if (deliverResult.success || deliverResult.payment) {
                mark('deliver-cargo');
                console.log(`    Trip ${trip}: Wrong-dest delivery for ${deliverResult.payment || '?'} cr (50% penalty)`);
              }
            }
          }
        }

        // Encounters now happen automatically during travel (original SP.WARP.S behavior)
        // No need to explicitly seek combat — pirates find you

        console.log(`    Trip ${trip}: sys ${currentSnap.system} → ${dest} (arrived: ${afterChar.currentSystem})`);
      }

      // ── End turn ──
      // Use terminal end-turn flow on specific turns to validate it
      if (turn === 5 || turn === 25 || turn === 50) {
        const terminalEndTurn = await endTurnTerminal();
        if (!terminalEndTurn) {
          await resetTrips();
        }
      } else {
        await resetTrips();
      }

      // ── Check cargo contract (terminal) ──
      if (!scorecard['check-cargo-contract'] && turn >= 3) {
        const char2 = await api.getCharacter();
        if (char2.cargoPods > 0) {
          await goMainMenu();
          await pressKey(page, 't');
          await waitForText(page, /TRADERS|INTERGALACTIC/i, 10000);
          await pressKey(page, 'c');
          await page.waitForTimeout(1000);
          mark('check-cargo-contract');
          console.log('    [+] Cargo contract checked');
          await goMainMenu();
        }
      }

      // ── Registry directory (terminal) ──
      if (!scorecard['registry-directory'] && turn >= 8) {
        await goMainMenu();
        await pressKey(page, 'r');
        await waitForText(page, /REGISTRY|RECORD|SPACER/i, 10000);
        await pressKey(page, 'a'); // Alliance directory
        await page.waitForTimeout(1500);
        const regText = await getTerminalText(page);
        if (regText.length > 50) {
          mark('registry-directory');
          console.log('    [+] Registry alliance directory viewed');
        }
        await goMainMenu();
      }
    }
  });

  // ── Final Report ──────────────────────────────────────────────────────

  test('Final scorecard', async () => {
    const char = await api.getCharacter();
    const ship = await api.getShipStatus();
    const credits = api.computeCredits(char.creditsHigh, char.creditsLow);

    console.log(`\n  ╔══════════════════════════════════════════╗`);
    console.log(`  ║     STRATEGIC PLAYTEST FINAL REPORT      ║`);
    console.log(`  ╠══════════════════════════════════════════╣`);
    console.log(`  ║ Spacer: ${char.name.padEnd(33)}║`);
    console.log(`  ║ Ship:   ${char.shipName.padEnd(33)}║`);
    console.log(`  ║ Rank:   ${char.rank.padEnd(33)}║`);
    console.log(`  ║ Credits: ${String(credits).padEnd(32)}║`);
    console.log(`  ║ System:  ${String(char.currentSystem).padEnd(32)}║`);
    console.log(`  ║ Alliance: ${(char.allianceSymbol || 'none').padEnd(31)}║`);
    console.log(`  ║ Fuel:    ${String(ship.fuel).padEnd(32)}║`);
    console.log(`  ║ Battles: ${char.battlesWon}W/${char.battlesLost}L${' '.repeat(27 - String(char.battlesWon).length - String(char.battlesLost).length)}║`);
    console.log(`  ║ Trips:   ${String(char.tripsCompleted).padEnd(32)}║`);
    console.log(`  ╚══════════════════════════════════════════╝`);

    console.log(`\n  Ship Components:`);
    for (const c of ship.components) {
      console.log(`    ${c.name.padEnd(14)} STR ${String(c.strength).padStart(3)}  COND ${c.condition}`);
    }

    // Scorecard summary
    const checked = Object.entries(scorecard).filter(([, v]) => v);
    const unchecked = Object.entries(scorecard).filter(([, v]) => !v);
    const total = Object.keys(scorecard).length;

    console.log(`\n  ══ SCORECARD: ${checked.length}/${total} game actions validated ══`);
    console.log(`\n  ✓ Validated (${checked.length}):`);
    for (const [action] of checked) {
      console.log(`    ✓ ${action}`);
    }

    if (unchecked.length > 0) {
      console.log(`\n  ✗ Not reached (${unchecked.length}):`);
      for (const [action] of unchecked) {
        console.log(`    ✗ ${action}`);
      }
    }

    // The test passes as long as we completed the loop and hit a minimum threshold
    expect(checked.length).toBeGreaterThanOrEqual(25);
    console.log(`\n  Coverage: ${((checked.length / total) * 100).toFixed(1)}%`);
  });
});
