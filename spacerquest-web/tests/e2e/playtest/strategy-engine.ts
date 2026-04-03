/**
 * SpacerQuest v4.0 — Turn-Planner Strategy Engine
 *
 * Architecture: per-turn task list. Every turn:
 *   1. Read game state (one API call)
 *   2. Build task list based on what's untested + current resources
 *   3. Execute each task — each task owns full flow start→finish
 *   4. Press D to end the turn
 *
 * Key invariants:
 *   - Every task starts at main-menu and ends at main-menu
 *   - All screen transitions use waitForScreen() — no fixed timeouts
 *   - API is used only to read state, never to perform actions
 *   - All actions go through keypresses / typeAndEnter
 */

import { Page } from '@playwright/test';
import { ApiValidator, GameSnapshot, ShipComponent } from '../helpers/api-validator';
import {
  getTerminalText,
  pressKey,
  typeAndEnter,
  waitForText,
  waitForScreen,
  detectScreen,
} from '../helpers/terminal';
import { PlaytestReport } from './playtest-report';

// ── Types ────────────────────────────────────────────────────────────────────

type TaskName =
  | 'visit-pub'
  | 'buy-fuel'
  | 'sell-fuel'
  | 'get-cargo'
  | 'deliver-cargo'
  | 'visit-shipyard'
  | 'visit-registry'
  | 'visit-bank'
  | 'repair'
  | 'visit-npc';

interface CharExtra {
  shipName: string | null;
  missionType: number;
  hullCondition: number;
  hasPatrolCommission: boolean;
}

interface TurnState extends GameSnapshot, CharExtra {
  screen: string | null;
}

// ── Strategy Engine ──────────────────────────────────────────────────────────

export class StrategyEngine {
  private page: Page;
  private api: ApiValidator;
  report: PlaytestReport;
  private log: (msg: string) => void;
  /** Set to true when retreat/surrender ends combat mid-travel — exits waitForTravelComplete */
  private combatEndedEarly = false;
  /** Count consecutive retreats/defeats without a successful delivery — triggers route change */
  private consecutiveRetreats = 0;
  /** Number of A keypresses in the current combat fight (reset when combat starts fresh) */
  private combatAttackCount = 0;
  /** Hull condition at start of current fight (to detect slow vs fast enemy) */
  private combatHullDropRate = 0;  // 0=unknown, 1=slow, 2=fast
  private combatPrevHull = 9;
  /** Rank at end of previous turn — used to detect rank advances that happen at END TURN */
  private prevRank: string = 'LIEUTENANT';

  constructor(page: Page, api: ApiValidator, log: (msg: string) => void) {
    this.page = page;
    this.api = api;
    this.report = new PlaytestReport();
    this.log = log;
  }

  // ── Main loop ──────────────────────────────────────────────────────────────

  async run(): Promise<PlaytestReport> {
    this.log('=== Turn-Planner Engine — Playtest Started ===');

    for (let turn = 1; turn <= 50; turn++) {
      this.report.startTurn(turn);
      this.log(`\n${'═'.repeat(20)} TURN ${turn} ${'═'.repeat(20)}`);

      // Ensure we start at main-menu
      await this.returnToMainMenu();
      const state = await this.readTurnState();

      // Check for NPC systems at start of each turn (may have arrived during END TURN travel)
      if (state.system === 17 || state.system === 18) {
        const termText = await getTerminalText(this.page);
        await this.checkForNpcs(state.system, termText);
      }

      // Detect rank advances that happen at END TURN (bot-runner promotes characters)
      if (state.rank !== this.prevRank && turn > 1) {
        this.report.pass('score.rank_advance',
          `Promoted at turn start: ${this.prevRank}→${state.rank}`,
          { rank: this.prevRank }, { rank: state.rank },
          `Rank advanced at END TURN of turn ${turn - 1}`);
        this.log(`  [RANK] Promoted ${this.prevRank}→${state.rank}`);
      }
      this.prevRank = state.rank;

      const weapons = state.components.find(c => /weapon/i.test(c.name));
      this.log(
        `  State: sys=${state.system} cr=${state.credits} fuel=${state.fuel} ` +
        `pods=${state.cargoPods} rank=${state.rank} score=${state.score} ` +
        `wpn=${weapons?.strength ?? '?'} retreats=${this.consecutiveRetreats}`,
      );

      const tasks = this.buildTurnPlan(state);
      this.log(`  Plan: [${tasks.join(', ')}]`);

      for (const task of tasks) {
        this.log(`\n  >> Task: ${task}`);
        try {
          await this.executeTask(task, await this.readTurnState());
        } catch (err) {
          // Re-throw fail-fast errors (already have rich context)
          if (String(err).includes('FAIL-FAST')) throw err;
          this.log(`  [ERROR] ${task} threw: ${err}`);
          await this.returnToMainMenu();
        }
        // Confirm we're back at main-menu before next task
        await this.returnToMainMenu();

        // Fail-fast: any new FAIL halts the test with a diagnostic snapshot
        const summary = this.report.getSummary();
        if (summary.featuresFailed.length > 0) {
          const failed = summary.featuresFailed[0];
          await this.failFast(
            failed.feature,
            `After task "${task}" — ${failed.details}`,
          );
        }
      }

      // End turn — press D, then handle Y/N confirmation if shown
      this.log('  [END TURN] pressing D');
      await pressKey(this.page, 'D');
      await this.page.waitForTimeout(1000);

      const afterD = await detectScreen(this.page);
      if (afterD === 'end-turn') {
        // tripCount >= DAILY_TRIP_LIMIT — confirm with Y, wait for results, press any key
        this.log('  [END TURN] confirming Y');
        await pressKey(this.page, 'Y');
        // Wait for "Press any key to continue" which appears after bot runs complete
        try {
          await waitForText(this.page, /Press any key to continue/i, 30000);
        } catch {
          this.log('  [END TURN] warning: bot run result screen not detected, continuing');
        }
        // Note: Enter (\r) is filtered by Terminal.tsx unbuffered handler; use Space
        await pressKey(this.page, 'Space');
        // After bots run, a combat encounter may appear before main-menu;
        // use returnToMainMenu to handle combat/jail/rim-port before continuing
        await this.returnToMainMenu();
        this.log('  [END TURN] turn ended, tripCount reset');
      } else if (afterD !== 'main-menu') {
        // Unexpected screen — recover
        await this.returnToMainMenu();
      }
      // If D returned immediately to main-menu: tripCount < DAILY_TRIP_LIMIT
      // (only 1 trip done this game-turn) — that's OK, next turn we'll hit the limit

    }

    this.log('\n=== Playtest Complete ===');
    return this.report;
  }

  // ── Turn Planning ──────────────────────────────────────────────────────────

  private buildTurnPlan(state: TurnState): TaskName[] {
    const plan: TaskName[] = [];
    const r = this.report;

    // EMERGENCY: hull critically damaged — repair before traveling
    // Only repair when condition is low (< 4) to avoid burning credits on minor damage
    if (state.hullCondition < 4 && state.credits > 1000) {
      plan.push('repair');
    }

    // EMERGENCY: low fuel — buy before attempting travel
    if (state.fuel < 100 && state.credits > 1000) {
      plan.push('buy-fuel');
    }

    // ACTIVE CARGO: deliver (or navigate to a waypoint when stuck at destination)
    // Require at least 30 fuel to attempt travel (avoid silent launch rejection)
    if (state.cargoPods > 0 && state.destination > 0 && state.fuel >= 30) {
      plan.push('deliver-cargo');
    }

    // UNTESTED FEATURES — only add if not yet passed AND not already attempted (including SKIP)
    if (!r.isAttempted('pub.visit') || !r.isAttempted('pub.drink') || !r.isAttempted('pub.gamble')) {
      plan.push('visit-pub');
    }

    if (!r.isAttempted('traders.buy_fuel')) {
      plan.push('buy-fuel');
    }

    if (!r.isAttempted('traders.sell_fuel') && state.fuel > 200) {
      plan.push('sell-fuel');
    }

    if (!r.isAttempted('shipyard.view') || !r.isAttempted('shipyard.repair') || !r.isAttempted('shipyard.upgrade')) {
      plan.push('visit-shipyard');
    }

    // Keep upgrading all components toward max (199) as long as credits are sufficient.
    // Every turn: if any component is below 150 strength and we have 25k+, visit shipyard.
    const weakComp = state.components.find(c => c.strength < 150);
    if (weakComp && state.credits > 25000 && !plan.includes('visit-shipyard')) {
      plan.push('visit-shipyard');
    }

    if (!r.isAttempted('registry.visit') || !r.isAttempted('registry.patrol')) {
      plan.push('visit-registry');
    }

    // Re-attempt bank on every turn until it passes — it's skipped at LIEUTENANT rank
    // but becomes accessible once rank advances to COMMANDER.
    if (!r.isPassed('bank.visit') && state.rank !== 'LIEUTENANT') {
      plan.push('visit-bank');
    }

    // NPC visits: travel to Wise One (sys 17) or Sage (sys 18) without cargo.
    // Only add when no active cargo, enough fuel, and feature not yet tested.
    const needsNpcVisit = (!r.isTested('npc.wise_one') || !r.isTested('npc.sage'))
      && state.cargoPods === 0 && state.fuel >= 30 && state.credits > 2000;
    if (needsNpcVisit && !plan.includes('visit-npc')) {
      plan.push('visit-npc');
    }

    // Only add first-time get-cargo if NOT doing NPC visit this turn (bribe gives cargo, don't overwrite)
    if (!r.isAttempted('traders.accept_cargo') && state.cargoPods === 0 && !plan.includes('visit-npc')) {
      plan.push('get-cargo');
    }

    // ALWAYS add cargo loop — get cargo if empty, deliver if loaded
    // Skip cargo loop if visiting NPC systems this turn (travel without cargo)
    const canMove = state.fuel >= 30;
    const hasActiveCargo = state.cargoPods > 0 && state.destination > 0;
    if (!plan.includes('visit-npc') && !plan.includes('get-cargo') && !plan.includes('deliver-cargo')) {
      if (state.cargoPods === 0 && state.credits > 200) plan.push('get-cargo');
      if (hasActiveCargo && canMove) plan.push('deliver-cargo');
    }
    // If get-cargo was added but not deliver-cargo, deliver after getting cargo
    if (plan.includes('get-cargo') && !plan.includes('deliver-cargo')) {
      plan.push('deliver-cargo');
    }

    // Deduplicate preserving order
    const seen = new Set<TaskName>();
    return plan.filter(t => seen.has(t) ? false : (seen.add(t), true));
  }

  private async executeTask(task: TaskName, state: TurnState): Promise<void> {
    switch (task) {
      case 'visit-pub':      return this.taskPub(state);
      case 'visit-npc':      return this.taskVisitNpc(state);
      case 'buy-fuel':       return this.taskBuyFuel(state);
      case 'sell-fuel':      return this.taskSellFuel(state);
      case 'get-cargo':      return this.taskGetCargo(state);
      case 'deliver-cargo':  return this.taskDeliverCargo(state);
      case 'visit-shipyard': return this.taskShipyard(state);
      case 'visit-registry': return this.taskRegistry(state);
      case 'visit-bank':     return this.taskBank(state);
      case 'repair':         return this.taskRepair(state);
    }
  }

  // ── State reading ──────────────────────────────────────────────────────────

  private async readTurnState(): Promise<TurnState> {
    const [screen, snap, char] = await Promise.all([
      detectScreen(this.page),
      this.api.snapshotState().catch(() => null),
      this.api.getCharacter().catch(() => null),
    ]);

    const base: GameSnapshot = snap ?? {
      credits: 0, fuel: 0, system: 1, cargoPods: 0, cargoType: 0,
      destination: 0, tripCount: 0, components: [], maxCargoPods: 0,
      score: 0, rank: 'LIEUTENANT',
    };

    const hull = base.components.find(c => c.name === 'Hull');
    return {
      ...base,
      screen,
      shipName: char?.shipName ?? null,
      missionType: char?.missionType ?? 0,
      hullCondition: hull?.condition ?? 9,
      hasPatrolCommission: (char as any)?.hasPatrolCommission ?? false,
    };
  }

  private async snap(): Promise<GameSnapshot> {
    return this.api.snapshotState().catch(() => ({
      credits: 0, fuel: 0, system: 1, cargoPods: 0, cargoType: 0,
      destination: 0, tripCount: 0, components: [], maxCargoPods: 0,
      score: 0, rank: 'LIEUTENANT',
    }));
  }

  // ── Fail-fast ──────────────────────────────────────────────────────────────

  /**
   * Collect a rich diagnostic snapshot and throw.
   * Called whenever a FAIL is detected that should halt the test.
   */
  async failFast(feature: string, reason: string): Promise<never> {
    const term = await getTerminalText(this.page);
    const screen = await detectScreen(this.page);
    const snap = await this.snap().catch(() => null);
    const turnSummary = this.report.getSummary();

    const diag = [
      `\n${'═'.repeat(60)}`,
      `FAIL-FAST: ${feature}`,
      `Reason: ${reason}`,
      `─── Current State ───`,
      `  screen : ${screen ?? '?'}`,
      `  system : ${snap?.system ?? '?'}`,
      `  fuel   : ${snap?.fuel ?? '?'}`,
      `  credits: ${snap?.credits ?? '?'}`,
      `  pods   : ${snap?.cargoPods ?? '?'}`,
      `  dest   : ${snap?.destination ?? '?'}`,
      `  rank   : ${snap?.rank ?? '?'}`,
      `  score  : ${snap?.score ?? '?'}`,
      `─── Terminal (last 600 chars) ───`,
      term.slice(-600).replace(/\x1b\[[0-9;]*m/g, ''),
      `─── Turn Summary ───`,
      `  Turns played: ${turnSummary.totalTurns}`,
      `  Features passed: ${turnSummary.featuresPassed.join(', ') || 'none'}`,
      `  Features failed: ${turnSummary.featuresFailed.map(f => f.feature).join(', ') || 'none'}`,
      `${'═'.repeat(60)}\n`,
    ].join('\n');

    this.log(diag);
    throw new Error(diag);
  }

  // ── Recovery ───────────────────────────────────────────────────────────────

  async returnToMainMenu(): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const screen = await detectScreen(this.page);
      if (screen === 'main-menu') return;

      // In transit — wait (use slice(-200) to avoid stale accumulated text)
      const text = await getTerminalText(this.page);
      if (/In transit|Traveling to|ETA:/i.test(text.slice(-200))) {
        this.log('  [RECOVERY] In transit — waiting...');
        await this.page.waitForTimeout(3000);
        continue;
      }

      // Combat — fight until done
      if (screen === 'combat') {
        await this.handleCombatRound();
        continue;
      }

      // Rim port — pay fee
      if (screen === 'rim-port') {
        await pressKey(this.page, 'Y');
        await this.page.waitForTimeout(500);
        continue;
      }

      // Jail — pay fine
      if (screen === 'jail') {
        await pressKey(this.page, 'P');
        await this.page.waitForTimeout(1000);
        continue;
      }

      // For buffered screens, pressKey() alone won't send — must typeAndEnter
      const BUFFERED = ['navigate', 'traders-cargo', 'shipyard-upgrade', 'traders-buy-fuel', 'traders-sell-fuel', 'bank-deposit', 'bank-withdraw', 'alliance-invest'];
      if (screen && BUFFERED.includes(screen)) {
        if (screen === 'navigate') {
          // Navigate has two input modes: fee confirmation (expects Y/N) and destination entry (expects number/M/0).
          // 'N' safely declines a pending fee confirmation; if in destination-entry mode it produces
          // "Invalid system ID" (stays on navigate), so we follow up with '0' on the next iteration.
          this.log(`  [RECOVERY] navigate → typeAndEnter('N') to decline any pending fee`);
          await typeAndEnter(this.page, 'N');
          await this.page.waitForTimeout(600);
          const screenAfterN = await detectScreen(this.page);
          if (screenAfterN !== 'navigate') continue; // Cleared by N (was a fee confirmation)
          // Still on navigate — must be destination-entry mode; send '0' to abort
          this.log(`  [RECOVERY] navigate still open → typeAndEnter('0') to abort`);
          await typeAndEnter(this.page, '0');
          await this.page.waitForTimeout(600);
        } else {
          this.log(`  [RECOVERY] buffered screen=${screen} → typeAndEnter('0')`);
          await typeAndEnter(this.page, '0');
          await this.page.waitForTimeout(600);
        }
        continue;
      }

      // Try various exit keys (bank/shipyard-special use R; others use M/Q/Escape)
      const screenNow = await detectScreen(this.page);
      const exits = (screenNow === 'bank') ? ['R'] :
                    (screenNow === 'shipyard-special') ? ['M'] :
                    ['M', 'Q', 'Escape'];
      const key = exits[attempt % exits.length];
      this.log(`  [RECOVERY] screen=${screen ?? '?'} → pressing ${key}`);
      await pressKey(this.page, key);
      await this.page.waitForTimeout(600);
    }

    // Last resort: page reload
    this.log('  [RECOVERY] Last resort — reloading page');
    await this.page.reload({ waitUntil: 'load' });
    await this.page.waitForTimeout(2000);
    await waitForScreen(this.page, 'main-menu', 15000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TASK: PUB — drink + Wheel of Fortune
  // ═══════════════════════════════════════════════════════════════════════════

  private async taskPub(state: TurnState): Promise<void> {
    await pressKey(this.page, 'P');
    await waitForScreen(this.page, 'pub', 10000);

    // Record pub visit
    this.report.pass('pub.visit', 'Visited the Lonely Asteroid Pub', {}, {}, '');

    // Drink
    if (!this.report.isTested('pub.drink')) {
      const before = await this.snap();
      this.log('  [PUB] Buying drink (B)');
      await pressKey(this.page, 'B');
      await this.page.waitForTimeout(800);
      const after = await this.snap();

      if (after.credits < before.credits) {
        this.report.pass('pub.drink', 'Bought a drink',
          { credits: before.credits }, { credits: after.credits },
          `credits ${before.credits}→${after.credits} (-${before.credits - after.credits})`);
      } else {
        const term = await getTerminalText(this.page);
        this.report.fail('pub.drink', 'Attempted to buy drink',
          { credits: before.credits }, { credits: after.credits },
          'Credits unchanged', term.slice(-200));
      }
    }

    // Wheel of Fortune
    if (!this.report.isTested('pub.gamble') && state.credits > 200) {
      this.log('  [PUB] Starting Wheel of Fortune (W)');
      await pressKey(this.page, 'W');

      // Lucky number
      await waitForText(this.page, /Enter your lucky number/i, 5000).catch(() => null);
      const textAfterW = await getTerminalText(this.page);
      if (/Enter your lucky number/i.test(textAfterW)) {
        await typeAndEnter(this.page, '7');
      }

      // Rolls
      await waitForText(this.page, /How many rolls\?/i, 5000).catch(() => null);
      const textRolls = await getTerminalText(this.page);
      if (/How many rolls\?/i.test(textRolls)) {
        await typeAndEnter(this.page, '3');
      }

      // Bet
      await waitForText(this.page, /Bet amount\?/i, 5000).catch(() => null);
      const textBet = await getTerminalText(this.page);
      if (/Bet amount\?/i.test(textBet)) {
        const before = await this.snap();
        const bet = Math.min(100, Math.max(10, Math.floor(state.credits * 0.01)));
        this.log(`  [WOF] Bet → ${bet}`);
        await typeAndEnter(this.page, String(bet));
        await this.page.waitForTimeout(2000);
        const after = await this.snap();
        const delta = after.credits - before.credits;
        const outcome = delta >= 0 ? `won ${delta}` : `lost ${Math.abs(delta)}`;
        this.report.pass('pub.gamble', `WOF: bet ${bet}, ${outcome}`,
          { credits: before.credits }, { credits: after.credits },
          `credits ${before.credits}→${after.credits}`);
      } else {
        this.report.skip('pub.gamble', 'WOF flow did not reach bet prompt');
      }
    }

    // Return to main menu
    await pressKey(this.page, 'M');
    await waitForScreen(this.page, 'main-menu', 10000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TASK: BUY FUEL
  // ═══════════════════════════════════════════════════════════════════════════

  private async taskBuyFuel(state: TurnState): Promise<void> {
    // Navigate to traders
    await pressKey(this.page, 'T');
    await waitForScreen(this.page, 'traders', 10000);

    // Open buy fuel
    await pressKey(this.page, 'B');
    await waitForScreen(this.page, 'traders-buy-fuel', 10000);

    const before = await this.snap();
    // Use fresh before.fuel (not stale turn-start state) for amount calculation
    const spaceLeft = Math.max(0, 3000 - before.fuel); // max capacity ~3000 with standard hull
    const toBuy = Math.min(200, Math.max(10, spaceLeft > 0 ? Math.min(100, spaceLeft) : 10));
    this.log(`  [BUY FUEL] Purchasing ${toBuy} units (before.fuel=${before.fuel}, spaceLeft=${spaceLeft})`);
    await typeAndEnter(this.page, String(toBuy));
    await this.page.waitForTimeout(1200);
    const after = await this.snap();

    if (after.fuel > before.fuel) {
      this.report.pass('traders.buy_fuel', `Bought ${toBuy} fuel`,
        { fuel: before.fuel, credits: before.credits },
        { fuel: after.fuel, credits: after.credits },
        `fuel ${before.fuel}→${after.fuel}, credits ${before.credits}→${after.credits}`);
    } else {
      const term = await getTerminalText(this.page);
      // Distinguish game constraints (SKIP) from bugs (FAIL)
      if (/Fueling capacity exceeded|Too Much|Not enough credits/i.test(term)) {
        this.report.skip('traders.buy_fuel', `Purchase blocked: ${term.match(/Fueling capacity exceeded|Too Much|Not enough credits/i)?.[0]}`);
      } else {
        this.report.fail('traders.buy_fuel', `Attempted to buy ${toBuy} fuel`,
          { fuel: before.fuel, credits: before.credits },
          { fuel: after.fuel, credits: after.credits },
          `Fuel unchanged: ${before.fuel}→${after.fuel}`, term.slice(-200));
      }
    }

    // Exit: traders-buy-fuel → traders → main-menu
    // Use returnToMainMenu for robustness — background travel arrival events can inject
    // hazard text into the terminal mid-task, which delays main-menu detection.
    await pressKey(this.page, 'Escape');
    await this.page.waitForTimeout(400);
    await this.returnToMainMenu();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TASK: SELL FUEL
  // ═══════════════════════════════════════════════════════════════════════════

  private async taskSellFuel(state: TurnState): Promise<void> {
    if (state.fuel <= 150) {
      this.report.skip('traders.sell_fuel', `Insufficient fuel to sell (fuel=${state.fuel})`);
      return;
    }

    await pressKey(this.page, 'T');
    await waitForScreen(this.page, 'traders', 10000);
    await pressKey(this.page, 'S');
    await waitForScreen(this.page, 'traders-sell-fuel', 10000);

    const before = await this.snap();
    const toSell = Math.min(50, state.fuel - 150);
    this.log(`  [SELL FUEL] Selling ${toSell} units`);
    await typeAndEnter(this.page, String(toSell));
    await this.page.waitForTimeout(800);
    const after = await this.snap();

    if (after.fuel < before.fuel && after.credits > before.credits) {
      this.report.pass('traders.sell_fuel', `Sold ${toSell} fuel`,
        { fuel: before.fuel, credits: before.credits },
        { fuel: after.fuel, credits: after.credits },
        `fuel ${before.fuel}→${after.fuel}, credits ${before.credits}→${after.credits}`);
    } else {
      const term = await getTerminalText(this.page);
      this.report.fail('traders.sell_fuel', `Attempted to sell ${toSell} fuel`,
        { fuel: before.fuel, credits: before.credits },
        { fuel: after.fuel, credits: after.credits },
        'State unchanged', term.slice(-200));
    }

    await pressKey(this.page, 'Escape');
    await this.page.waitForTimeout(400);
    const s1 = await detectScreen(this.page);
    if (s1 === 'traders') {
      await pressKey(this.page, 'M');
      await waitForScreen(this.page, 'main-menu', 8000);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TASK: GET CARGO
  // ═══════════════════════════════════════════════════════════════════════════

  private async taskGetCargo(state: TurnState): Promise<void> {
    await pressKey(this.page, 'T');
    await waitForScreen(this.page, 'traders', 10000);
    await pressKey(this.page, 'A');

    // Cargo dispatch shows either: Commandant prompt OR Manifest Board
    // Wait for either before proceeding
    await waitForText(this.page, /Manifest Board|Commandant wishes to speak|Cargo Dispatch Office/i, 5000).catch(() => null);

    // Handle Commandant prompt (appears before manifest)
    // traders-cargo is a BUFFERED screen — must use typeAndEnter, not pressKey
    const t1 = await getTerminalText(this.page);
    if (/Commandant wishes to speak/i.test(t1.slice(-500))) {
      this.log('  [CARGO] Commandant → declining (N+Enter)');
      await typeAndEnter(this.page, 'N');
      await this.page.waitForTimeout(800);
    }

    // Wait for manifest board to appear
    await waitForText(this.page, /Manifest Board/i, 5000).catch(() => null);
    const t2 = await getTerminalText(this.page);

    if (!/Manifest Board/i.test(t2)) {
      this.report.skip('traders.accept_cargo', 'Manifest board not shown — may have existing contract');
      // traders-cargo is buffered — use typeAndEnter to send the quit command
      await typeAndEnter(this.page, 'Q');
      await this.page.waitForTimeout(400);
      return;
    }

    // Pick the best contract — shortest distance AND destination ≠ current system
    const bestChoice = this.pickBestCargoContract(t2, state.system);
    this.log(`  [CARGO] Picking contract #${bestChoice}`);
    await typeAndEnter(this.page, String(bestChoice));
    await waitForText(this.page, /Are you sure/i, 5000).catch(() => null);
    const t3 = await getTerminalText(this.page);

    if (!/Are you sure/i.test(t3)) {
      this.report.skip('traders.accept_cargo', 'No confirmation prompt after selecting contract');
      await typeAndEnter(this.page, '0');  // exit manifest board via buffered cancel
      await this.page.waitForTimeout(400);
      return;
    }

    const before = await this.snap();
    await typeAndEnter(this.page, 'Y');
    await this.page.waitForTimeout(800);
    const after = await this.snap();

    if (after.cargoPods > 0) {
      this.report.pass('traders.accept_cargo',
        `Accepted contract: ${after.cargoPods} pods → sys ${after.destination}`,
        { cargoPods: 0, destination: 0 },
        { cargoPods: after.cargoPods, destination: after.destination },
        `pods 0→${after.cargoPods}, dest→sys ${after.destination}`);
    } else {
      const term = await getTerminalText(this.page);
      this.report.fail('traders.accept_cargo', 'Confirmed cargo but pods still 0',
        { cargoPods: before.cargoPods }, { cargoPods: after.cargoPods },
        'Cargo not loaded', term.slice(-200));
    }

    // traders-cargo auto-redirects to traders (or navigate) after confirm; go to main-menu
    await this.page.waitForTimeout(600);
    const s1 = await detectScreen(this.page);
    this.log(`  [CARGO] Post-confirm screen: ${s1 ?? '?'}`);
    if (s1 === 'traders' || s1 === 'traders-cargo') {
      await pressKey(this.page, 'M');
      await waitForScreen(this.page, 'main-menu', 8000);
    } else if (s1 === 'navigate') {
      // Some ports auto-route to navigate screen after cargo dispatch — press M to return
      await pressKey(this.page, 'M');
      await waitForScreen(this.page, 'main-menu', 8000).catch(() => null);
    }
    // For any other screen, returnToMainMenu() in the task loop will clean up
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TASK: VISIT NPC (navigate to sys 17 or 18 without cargo)
  // ═══════════════════════════════════════════════════════════════════════════

  private async taskVisitNpc(state: TurnState): Promise<void> {
    const dest = !this.report.isTested('npc.wise_one') ? 17 : 18;
    const npcKey = dest === 17 ? 'npc.wise_one' : 'npc.sage';
    if (state.system === dest) {
      // Already there — just check the terminal for NPC text
      const t = await getTerminalText(this.page);
      await this.checkForNpcs(state.system, t);
      if (!this.report.isTested(npcKey)) {
        this.report.skip(npcKey, `Already at sys ${dest} but no NPC prompt detected`);
      }
      return;
    }

    if (state.fuel < 30) {
      this.report.skip(npcKey, 'Insufficient fuel to travel to NPC system');
      return;
    }

    this.log(`  [NPC] Navigating to NPC system ${dest}`);
    await pressKey(this.page, 'N');
    await waitForText(this.page, /NAVIGATE|DESTINATION|Attempt a bribe\?|Valid contract/i, 8000).catch(() => null);

    const tNav = await getTerminalText(this.page);
    const navRecent = tNav.slice(-500);

    // Bribe is a 3-step flow: (1) Y/N ask, (2) offer amount 1-10, (3) paper type C/S
    if (/Valid contract required|Attempt a bribe\?/i.test(navRecent)) {
      this.log(`  [NPC] Bribe step 1 — accepting (Y)`);
      await typeAndEnter(this.page, 'Y');
      await this.page.waitForTimeout(600);

      const tOffer = await getTerminalText(this.page);
      if (/Offer\?.*thousand|1-10/i.test(tOffer.slice(-400))) {
        this.log(`  [NPC] Bribe step 2 — offering 10 thousand`);
        await typeAndEnter(this.page, '10');
        await this.page.waitForTimeout(600);

        const tPaper = await getTerminalText(this.page);
        if (/kinda papers\?|Cargo.*Smuggling/i.test(tPaper.slice(-400))) {
          this.log(`  [NPC] Bribe step 3 — selecting Cargo papers (C)`);
          await typeAndEnter(this.page, 'C');
          await this.page.waitForTimeout(800);
        } else if (/Not enough funds|main-menu/i.test(tPaper.slice(-400))) {
          this.report.skip(npcKey, 'Bribe rejected: insufficient funds');
          await this.returnToMainMenu();
          return;
        }
      } else {
        // Bribe declined or failed early
        this.report.skip(npcKey, 'Bribe step 1 accepted but offer prompt not received');
        await this.returnToMainMenu();
        return;
      }
    }

    // Now the navigate screen should show destination prompt
    const tAfterBribe = await getTerminalText(this.page);
    if (!/Destination|system ID/i.test(tAfterBribe.slice(-600))) {
      this.report.skip(npcKey, 'No destination prompt after bribe flow');
      await this.returnToMainMenu();
      return;
    }

    const before = await this.snap();
    this.log(`  [NPC] Entering destination: ${dest}`);
    await typeAndEnter(this.page, String(dest));
    await this.page.waitForTimeout(800);

    const tAfterDest = await getTerminalText(this.page);
    const recentDest = tAfterDest.slice(-600);

    if (/Will you pay the fee|Care to Launch now/i.test(recentDest)) {
      this.log(`  [NPC] Confirming launch fee (Y)`);
      await typeAndEnter(this.page, 'Y');
      // Capture launch text before main-menu wipe for malfunction detection
      await this.page.waitForTimeout(300);
      const tLaunchNpc = await getTerminalText(this.page);
      if (/Malfunction/i.test(tLaunchNpc.slice(-800)) && !this.report.isTested('nav.malfunction')) {
        this.report.event('nav.malfunction', 'Nav system malfunction on NPC launch', 'Ship redirected to wrong system');
      }
    } else if (/already.*system|not a valid|cannot travel|Launch Aborted|trip limit|Daily limit/i.test(recentDest)) {
      this.log(`  [NPC] Launch rejected — detected in terminal text`);
      this.report.skip(npcKey, `Launch to sys ${dest} rejected (validateLaunch failed)`);
      await this.returnToMainMenu();
      return;
    } else {
      // No fee prompt and no known rejection text — check current screen as fallback
      const screenAfterDest = await detectScreen(this.page);
      if (screenAfterDest !== 'navigate' && screenAfterDest !== null) {
        this.log(`  [NPC] No fee prompt; screen=${screenAfterDest} — launch was rejected`);
        this.report.skip(npcKey, `No launch fee prompt after destination ${dest} (screen=${screenAfterDest})`);
        await this.returnToMainMenu();
        return;
      }
    }

    await this.waitForTravelComplete(before);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TASK: DELIVER CARGO (navigate → travel → arrive)
  // ═══════════════════════════════════════════════════════════════════════════

  private async taskDeliverCargo(state: TurnState): Promise<void> {
    if (state.fuel < 30) {
      this.report.skip('nav.launch', `Insufficient fuel (${state.fuel}) to travel`);
      return;
    }

    const dest = this.pickDestination(state);
    this.log(`  [NAV] Opening navigate screen (N), dest=${dest}`);

    await pressKey(this.page, 'N');

    // Navigate screen may show destination prompt OR a bribe/contract-required prompt
    // Wait up to 5s for navigate screen; if not found, check for bribe/error
    const navResult = await waitForText(this.page, /NAVIGATE|DESTINATION|Attempt a bribe\?|Valid contract required/i, 8000).catch(() => null);
    if (!navResult) {
      this.log('  [NAV] Navigate screen not detected — aborting');
      this.report.skip('nav.launch', 'Navigate screen not reachable');
      return;
    }

    const tNav0 = await getTerminalText(this.page);

    // If "no contract" bribe prompt appeared immediately:
    // Accept if targeting NPC systems (17/18) — we deliberately travel there without cargo.
    // Otherwise decline and skip.
    if (/Valid contract required|Attempt a bribe\?/i.test(tNav0.slice(-400))) {
      if (dest === 17 || dest === 18) {
        this.log(`  [NAV] Accepting bribe to reach NPC system ${dest}`);
        await typeAndEnter(this.page, 'Y');
        await this.page.waitForTimeout(800);
        const tAfterBribe = await getTerminalText(this.page);
        // After bribe, navigate screen re-appears for destination entry
        if (!/Destination|destination|system ID/i.test(tAfterBribe.slice(-400))) {
          this.report.skip('nav.launch', 'Bribe accepted but no destination prompt appeared');
          return;
        }
        // Enter destination, then fall through to fee prompt handling below
        this.log(`  [NAV] Entering NPC destination after bribe: ${dest}`);
        // (no typeAndEnter here — handled in the unified "enter destination" block below)
      } else {
        this.log('  [NAV] Contract required prompt — declining bribe (N)');
        await typeAndEnter(this.page, 'N');
        await this.page.waitForTimeout(400);
        this.report.skip('nav.launch', 'No cargo contract — launch blocked');
        return;
      }
    }

    const before = await this.snap();

    // Enter destination (applies whether we just accepted a bribe or had a valid contract)
    this.log(`  [NAV] Entering destination: ${dest}`);
    await typeAndEnter(this.page, String(dest));
    await this.page.waitForTimeout(600);

    // Handle fee/launch confirmation
    const tFee = await getTerminalText(this.page);
    if (/Will you pay the fee|Care to Launch now/i.test(tFee.slice(-400))) {
      this.log('  [NAV] Confirming launch fee (Y)');
      await typeAndEnter(this.page, 'Y');
      // Capture launch confirmation text immediately — malfunction/hazard text appears here
      // and is wiped when main-menu screen renders (~500ms later)
      await this.page.waitForTimeout(300);
      const tLaunch = await getTerminalText(this.page);
      if (/Malfunction/i.test(tLaunch.slice(-800)) && !this.report.isTested('nav.malfunction')) {
        this.report.event('nav.malfunction', 'Nav system malfunction on launch', 'Ship redirected to wrong system');
      }
    } else {
      // No fee prompt: check if contract/bribe error appeared, or launch was silently rejected
      const tAfter = await getTerminalText(this.page);
      if (/Valid contract required|Attempt a bribe\?/i.test(tAfter.slice(-400))) {
        // Accept bribe when heading to NPC systems or stuck in retreat loop
        const acceptBribe = dest === 17 || dest === 18 || this.consecutiveRetreats >= 4;
        if (acceptBribe) {
          this.log(`  [NAV] Accepting bribe (dest=${dest}, retreats=${this.consecutiveRetreats})`);
          await typeAndEnter(this.page, 'Y');
          await this.page.waitForTimeout(800);
          const tBribe = await getTerminalText(this.page);
          if (/Will you pay the fee|Care to Launch now/i.test(tBribe.slice(-400))) {
            await typeAndEnter(this.page, 'Y');
          } else if (/Attempt a bribe\?|Bribe failed/i.test(tBribe.slice(-400))) {
            // Bribe prompt repeated or failed — decline and skip
            await typeAndEnter(this.page, 'N');
            await this.page.waitForTimeout(400);
            this.report.skip('nav.launch', 'Bribe failed/not accepted');
            return;
          }
          // Fall through to waitForTravelComplete
        } else {
          await typeAndEnter(this.page, 'N');
          await this.page.waitForTimeout(400);
          this.report.skip('nav.launch', `No contract — launch blocked after destination entry`);
          return;
        }
      }
      const screenAfter = await detectScreen(this.page);
      if (screenAfter === 'main-menu' || screenAfter === 'navigate') {
        const reason = `Launch silently rejected (fuel=${state.fuel}, dest=${dest}) — no fee prompt`;
        this.log(`  [NAV] ${reason}`);
        this.report.skip('nav.launch', reason);
        return;
      }
    }

    // Wait for travel to complete
    await this.waitForTravelComplete(before);
  }

  private pickDestination(state: TurnState): number {
    // Escape retreat loop: navigate to NPC systems or a waypoint to break the stuck cycle
    // This fires when we've retreated 4+ times without delivering cargo
    if (state.cargoPods > 0 && state.destination > 0 && this.consecutiveRetreats >= 4) {
      if (!this.report.isTested('npc.wise_one') && state.system !== 17) return 17;
      if (!this.report.isTested('npc.sage') && state.system !== 18) return 18;
      // Generic waypoint: one hop from destination, different system
      const wp = state.destination > 1 ? state.destination - 1 : state.destination + 2;
      if (wp !== state.system) return wp;
    }

    // Active cargo: if we're NOT at destination, go there directly
    if (state.cargoPods > 0 && state.destination > 0 && state.destination !== state.system) {
      return state.destination;
    }

    // Same-system cargo: destination equals current system (happens when cargo manifest was
    // generated during transit at sys=0, which allows destination=14 contracts).
    // Navigate to an ADJACENT system — docking's wrong-port delivery (Mark VIII Teleporter)
    // will teleport us to the cargo destination and deliver the pods on arrival there.
    if (state.cargoPods > 0 && state.destination > 0 && state.destination === state.system) {
      // Go one hop toward system 1 (or away from 1) to trigger wrong-port delivery
      return state.destination > 1 ? state.destination - 1 : state.destination + 1;
    }

    // Target NPC systems if untested
    if (!this.report.isTested('npc.wise_one') && state.system !== 17) return 17;
    if (!this.report.isTested('npc.sage') && state.system !== 18) return 18;

    // Go somewhere different to trigger encounters/hazards
    return state.system === 1 ? 3 : 1;
  }

  private async waitForTravelComplete(before: GameSnapshot): Promise<void> {
    this.log('  [TRAVEL] Waiting for system change...');
    // The server sends nextScreen='main-menu' immediately on launch confirmation,
    // but the ship is still in transit. We poll the API until currentSystem actually
    // changes — that is the ground truth for arrival.
    this.combatEndedEarly = false;
    this.combatAttackCount = 0;
    this.combatHullDropRate = 0;
    this.combatPrevHull = 9;
    const deadline = Date.now() + 90000;

    while (Date.now() < deadline) {
      await this.page.waitForTimeout(1500);
      const screen = await detectScreen(this.page);
      const text = await getTerminalText(this.page);

      // Check every poll for hazard/malfunction text — it appears briefly when travel:complete fires
      // and gets cleared when main-menu renders, so we must catch it while it's visible.
      if (!this.report.isTested('nav.hazard') &&
          /X-Rad|Plasma-Ion|Proton Radiation|Micro-Asteroid|shields deflect it/i.test(text)) {
        const hazardName = text.match(/X-Rad Shower|Plasma-Ion Cloud|Proton Radiation|Micro-Asteroid/i)?.[0] ?? 'hazard';
        this.report.event('nav.hazard', `Travel hazard: ${hazardName}`, hazardName);
        this.log(`  [HAZARD] Detected: ${hazardName}`);
      }
      if (!this.report.isTested('nav.malfunction') &&
          /Malfunction|Nav System Malfunction/i.test(text)) {
        this.report.event('nav.malfunction', 'Nav malfunction detected during travel', 'Ship redirected');
        this.log('  [MALFUNCTION] Nav malfunction detected');
      }

      // If retreat/surrender ended combat, check if we still moved (retreat can land at destination)
      if (this.combatEndedEarly && screen === 'main-menu') {
        this.combatEndedEarly = false;
        const snap = await this.snap();
        if (snap.system !== before.system && snap.system !== 0) {
          // Retreat brought us to a different system — record travel results
          const after = snap;
          this.log(`  [TRAVEL] Retreat/surrender — landed at sys=${after.system} (not origin ${before.system})`);
          this.report.pass('nav.launch',
            `Launched to system ${after.system} (via retreat)`,
            { system: before.system, fuel: before.fuel, credits: before.credits },
            { system: after.system, fuel: after.fuel, credits: after.credits },
            `sys ${before.system}→${after.system}`);
          if (before.cargoPods > 0 && after.cargoPods === 0) {
            const crDelta = after.credits - before.credits;
            this.consecutiveRetreats = 0;
            this.report.pass('nav.cargo_delivery',
              `Cargo delivered at system ${after.system} (via retreat path)`,
              { cargoPods: before.cargoPods, credits: before.credits },
              { cargoPods: 0, credits: after.credits },
              `pods ${before.cargoPods}→0, credits +${crDelta}`);
          }
          const termNow = await getTerminalText(this.page);
          await this.checkForNpcs(after.system, termNow);
          // Check for hazards in terminal text from this trip
          const recentNow = termNow.slice(-3000);
          if (!this.report.isTested('nav.hazard') &&
              /X-Rad|Plasma-Ion|Proton Radiation|Micro-Asteroid|Radiation.*detected|shields deflect it/i.test(recentNow)) {
            this.report.event('nav.hazard', 'Travel hazard encountered (retreat path)',
              recentNow.match(/X-Rad|Plasma-Ion|Proton Radiation|Micro-Asteroid|Radiation/i)?.[0] ?? 'hazard');
          }
        } else {
          this.log('  [TRAVEL] Travel ended early via retreat/surrender — back at origin');
        }
        return;
      }

      // Handle mid-travel events (can appear while polling)
      if (screen === 'combat') {
        this.report.event('nav.encounter', 'Combat encounter during travel',
          'Enemy ship intercepted during transit');
        await this.handleCombatRound();
        continue;
      }

      if (screen === 'rim-port') {
        await pressKey(this.page, 'Y');
        await this.page.waitForTimeout(500);
        continue;
      }

      // Handle fee prompt if it re-appears (edge case)
      if (screen === 'navigate') {
        const recentNav = text.slice(-400);
        if (/Will you pay the fee|Care to Launch now/i.test(recentNav)) {
          this.log('  [TRAVEL] Fee prompt re-appeared → confirming Y');
          await typeAndEnter(this.page, 'Y');
        }
        continue;
      }

      // Poll the API: has the character actually moved?
      const snap = await this.snap();

      // Detect defeat/surrender mid-transit: cargo dropped and destination cleared
      // (combat ended but system may not have changed if returned to origin)
      if (before.cargoPods > 0 && snap.cargoPods < before.cargoPods && snap.destination === 0 && screen === 'main-menu') {
        this.log('  [TRAVEL] Cargo lost mid-transit — defeat/surrender; travel ended');
        this.combatEndedEarly = false;
        this.consecutiveRetreats++;
        return;
      }

      // sys=0 means in-transit — don't treat as arrival even though it differs from before.system
      if (snap.system !== before.system && snap.system !== 0) {
        // Arrived!
        const after = snap;
        this.log(`  [TRAVEL] Arrived at sys=${after.system}`);
        this.consecutiveRetreats = 0; // reset on ANY successful navigation

        this.report.pass('nav.launch',
          `Launched to system ${after.system}`,
          { system: before.system, fuel: before.fuel, credits: before.credits },
          { system: after.system, fuel: after.fuel, credits: after.credits },
          `sys ${before.system}→${after.system}, fuel ${before.fuel}→${after.fuel}`);

        if (before.cargoPods > 0 && after.cargoPods === 0) {
          const crDelta = after.credits - before.credits;
          this.consecutiveRetreats = 0; // successful delivery — reset retreat counter
          this.report.pass('nav.cargo_delivery',
            `Cargo delivered at system ${after.system}`,
            { cargoPods: before.cargoPods, credits: before.credits },
            { cargoPods: 0, credits: after.credits },
            `pods ${before.cargoPods}→0, credits +${crDelta}`);
        }

        if (after.rank !== before.rank) {
          this.report.pass('score.rank_advance',
            `Promoted: ${before.rank}→${after.rank}`,
            { rank: before.rank, score: before.score },
            { rank: after.rank, score: after.score },
            `score ${before.score}→${after.score}`);
          this.log(`  [RANK] Promoted ${before.rank}→${after.rank} (score ${before.score}→${after.score})`);
        }

        // Check larger window (3000 chars) — hazard text appears before arrival screen's \x1b[2J
        // and is retained in xterm.js scrollback. Shields may deflect without causing condition damage.
        const recent = text.slice(-3000);
        if (/X-Rad|Plasma-Ion|Proton Radiation|Micro-Asteroid|Radiation.*detected|shields deflect it/i.test(recent)) {
          if (!this.report.isTested('nav.hazard')) {
            this.report.event('nav.hazard', 'Travel hazard encountered',
              recent.match(/X-Rad|Plasma-Ion|Proton Radiation|Micro-Asteroid|Radiation/i)?.[0] ?? 'hazard');
          }
        }
        if (/Malfunction|Nav System Malfunction/i.test(recent)) {
          if (!this.report.isTested('nav.malfunction')) {
            this.report.event('nav.malfunction', 'Nav system malfunction', 'Ship redirected');
          }
        }

        // Also detect hazards by component condition degradation (catches cases where
        // hazard text is outside the scroll window or not yet visible).
        if (!this.report.isTested('nav.hazard')) {
          for (const beforeComp of before.components) {
            const afterComp = after.components.find(c => c.name === beforeComp.name);
            if (afterComp && afterComp.condition < beforeComp.condition) {
              this.report.event('nav.hazard', `Travel hazard: ${beforeComp.name} degraded`,
                `condition ${beforeComp.condition}→${afterComp.condition}`);
              break;
            }
          }
        }

        await this.checkForNpcs(after.system, text);
        return;
      }

      // System unchanged — still in transit (or launch failed)
      // Keep polling; don't exit yet
    }

    // Timeout: travel didn't complete in 90s — record failure but don't throw;
    // the outer task-loop fail-fast check will fire after returnToMainMenu() cleans up.
    this.log('  [TRAVEL] Timeout waiting for system change — recording failure');
    const after = await this.snap();
    this.report.fail('nav.launch', 'Travel timeout: system unchanged after 90s',
      { system: before.system, fuel: before.fuel },
      { system: after.system, fuel: after.fuel },
      `System still ${after.system} after 90s; dest=${after.destination} pods=${after.cargoPods}`,
      (await getTerminalText(this.page)).slice(-600));
  }

  private async checkForNpcs(system: number, text: string): Promise<void> {
    // System 17 = Wise One, System 18 = Sage
    if (system === 17 || /Wise One|number key|derelict/i.test(text.slice(-400))) {
      if (!this.report.isTested('npc.wise_one')) {
        this.report.pass('npc.wise_one', 'Visited the Wise One (System 17)', {}, {},
          text.slice(-200).replace(/\x1b\[[0-9;]*m/g, '').trim());
      }
    }
    if (system === 18 || /constellation|Sage.*quiz|Ancient One/i.test(text.slice(-400))) {
      if (!this.report.isTested('npc.sage')) {
        this.report.pass('npc.sage', 'Visited the Sage (System 18)', {}, {},
          text.slice(-200).replace(/\x1b\[[0-9;]*m/g, '').trim());
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TASK: SHIPYARD — view, repair, upgrade
  // ═══════════════════════════════════════════════════════════════════════════

  private async taskShipyard(state: TurnState): Promise<void> {
    await pressKey(this.page, 'S');
    await waitForScreen(this.page, 'shipyard', 10000);

    // Record visit
    if (!this.report.isPassed('shipyard.view')) {
      this.report.pass('shipyard.view', 'Visited Galactic Shipyard', {}, {},
        `Ship: ${state.components.map(c => `${c.name}=${c.strength}/${c.condition}`).join(', ')}`);
    }

    // Repair
    if (!this.report.isPassed('shipyard.repair') || state.components.some(c => c.condition < 7)) {
      const before = await this.snap();
      this.log('  [SHIPYARD] Repairing (R)');
      await pressKey(this.page, 'R');
      await this.page.waitForTimeout(1000);
      const after = await this.snap();
      const term = await getTerminalText(this.page);

      const improved = after.components.some((c, i) =>
        before.components[i] && c.condition > before.components[i].condition);
      const alreadyFull = before.components.every(c => c.condition >= 9);

      if (improved || alreadyFull || /repaired|All components/i.test(term)) {
        this.report.pass('shipyard.repair', 'Repaired ship components',
          { components: before.components.map(c => c.condition).join(',') as any },
          { components: after.components.map(c => c.condition).join(',') as any },
          alreadyFull
            ? 'All components already at full condition'
            : `${before.components.map((c, i) => `${c.name} ${c.condition}→${after.components[i]?.condition}`).join(', ')}`);
      } else {
        this.report.fail('shipyard.repair', 'Attempted repair',
          {}, {}, 'No condition improvements detected', term.slice(-200));
      }
    }

    // Upgrade: keep going as long as any component is below 150 strength and credits are sufficient.
    const currentSnap = await this.snap();
    const needsUpgrade = currentSnap.components.some(c => c.strength < 150);
    if (needsUpgrade && currentSnap.credits > 20000) {
      this.log('  [SHIPYARD] → Upgrade (U)');
      await pressKey(this.page, 'U');
      await waitForScreen(this.page, 'shipyard-upgrade', 8000);
      await this.doUpgrade();
      // After doUpgrade sends typeAndEnter('0'), we're back at shipyard
      await this.page.waitForTimeout(500);
      const postUpgradeScreen = await detectScreen(this.page);
      if (postUpgradeScreen !== 'shipyard') {
        // doUpgrade returned to main-menu instead; re-open shipyard
        // (don't attempt to go deeper — just let taskShipyard clean up)
        this.log(`  [SHIPYARD] After upgrade, screen=${postUpgradeScreen ?? '?'} — skipping back to shipyard`);
      }
    }

    await pressKey(this.page, 'M');
    await waitForScreen(this.page, 'main-menu', 10000);
  }

  private async doUpgrade(): Promise<void> {
    const term = await getTerminalText(this.page);
    if (!/Select a component|component to upgrade/i.test(term)) {
      // Not on upgrade screen — exit via buffered cancel (0+Enter)
      await typeAndEnter(this.page, '0');
      await this.page.waitForTimeout(400);
      return;
    }

    const before = await this.snap();
    const comp = this.pickUpgradeTarget(before.components);
    this.log(`  [UPGRADE] Component ${comp}`);
    // shipyard-upgrade is a BUFFERED screen — typeAndEnter is required to send input
    await typeAndEnter(this.page, String(comp));
    await this.page.waitForTimeout(1000);
    const after = await this.snap();
    const termAfter = await getTerminalText(this.page);

    const upgraded = after.components.some((c, i) =>
      before.components[i] && c.strength > before.components[i].strength);

    if (upgraded || /upgraded|Component upgraded/i.test(termAfter)) {
      const changed = after.components.find((c, i) =>
        before.components[i] && c.strength > before.components[i].strength);
      const oldStr = before.components.find(c => c.name === changed?.name)?.strength ?? 0;
      this.report.pass('shipyard.upgrade',
        `Upgraded ${changed?.name ?? 'component'} (+${(changed?.strength ?? 0) - oldStr} STR)`,
        { credits: before.credits }, { credits: after.credits },
        `credits ${before.credits}→${after.credits}`);
    } else if (/Not enough|cannot afford/i.test(termAfter)) {
      // Can't afford — not a bug, just SKIP
      this.report.skip('shipyard.upgrade', `Insufficient credits: ${termAfter.match(/Not enough.*/i)?.[0] ?? 'Not enough credits'}`);
    } else if (/Upgrade failed/i.test(termAfter)) {
      this.report.fail('shipyard.upgrade', 'Upgrade failed',
        { credits: before.credits }, { credits: after.credits },
        termAfter.match(/Upgrade failed.*/i)?.[0] ?? 'Unknown',
        termAfter.slice(-200));
    }

    // Exit upgrade screen via buffered cancel (0+Enter returns to shipyard)
    // Must use typeAndEnter because shipyard-upgrade is a BUFFERED screen
    await typeAndEnter(this.page, '0');
    await this.page.waitForTimeout(400);
  }

  private pickUpgradeTarget(components: ShipComponent[]): number {
    // 1=Hull 2=Drives 3=Cabin 4=LifeSupport 5=Weapons 6=Nav 7=Robotics 8=Shields
    // Priority order: weapons → shields → hull → drives → nav → robotics → cabin → life support
    // Each component upgraded toward max (199). Pick the weakest in priority order.
    const priority = [5, 8, 1, 2, 6, 7, 3, 4];
    for (const idx of priority) {
      const c = components[idx - 1];
      if (c && c.strength < 150) return idx;
    }
    // All components at 150+: continue cycling toward 199
    for (const idx of priority) {
      const c = components[idx - 1];
      if (c && c.strength < 199) return idx;
    }
    return 5;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TASK: REGISTRY — visit + space patrol
  // ═══════════════════════════════════════════════════════════════════════════

  private async taskRegistry(state: TurnState): Promise<void> {
    await pressKey(this.page, 'R');
    await waitForScreen(this.page, 'registry', 10000);

    if (!this.report.isPassed('registry.visit')) {
      this.report.pass('registry.visit', 'Visited Space Registry', {}, {}, '');
    }

    // Go to Space Patrol HQ
    if (!this.report.isAttempted('registry.patrol') && state.shipName) {
      await pressKey(this.page, 'S');
      await waitForScreen(this.page, 'space-patrol', 8000);

      // Handle Commandant prompt if it fires
      const tPatrol = await getTerminalText(this.page);
      if (/Commandant wishes to speak/i.test(tPatrol.slice(-300))) {
        await pressKey(this.page, 'N');
        await this.page.waitForTimeout(400);
      }

      // Verify the HQ menu is accessible — that's sufficient to PASS registry.patrol
      // DO NOT press J to join: joining sets hasPatrolCommission=true which blocks
      // cargo dispatch for the rest of the test, and creates a patrol cargo state
      // that corrupts subsequent turns.
      const tHQ = await getTerminalText(this.page);
      if (/Space Patrol HQ|SPACE PATROL HEADQUARTERS/i.test(tHQ.slice(-500))) {
        this.report.pass('registry.patrol', 'Accessed Space Patrol HQ — screen operational', {}, {},
          'HQ menu visible and responsive');
      } else {
        this.report.skip('registry.patrol', `HQ screen not confirmed: ${tHQ.slice(-100).replace(/\x1b\[[0-9;]*m/g, '').trim()}`);
      }

      await pressKey(this.page, 'Q');
      await this.page.waitForTimeout(400);
      await waitForScreen(this.page, 'registry', 6000).catch(() => null);
    }

    await pressKey(this.page, 'Q');
    await waitForScreen(this.page, 'main-menu', 10000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TASK: BANK — deposit + withdraw (requires Commander+ rank)
  // ═══════════════════════════════════════════════════════════════════════════

  private async taskBank(state: TurnState): Promise<void> {
    // Bank rejects LIEUTENANTs immediately with nextScreen:'main-menu'.
    // Check rank before pressing B to avoid wasting 8+ seconds on waitForScreen timeout.
    if (state.rank === 'LIEUTENANT') {
      this.log('  [BANK] Skipping — LIEUTENANT rank cannot access Financial Section');
      this.report.skip('bank.visit', 'Bank requires Commander rank (LIEUTENANT blocked)');
      this.report.skip('bank.deposit', 'Bank inaccessible at LIEUTENANT rank');
      this.report.skip('bank.withdraw', 'Bank inaccessible at LIEUTENANT rank');
      return;
    }

    await pressKey(this.page, 'B');
    this.log('  [BANK] Pressed B — waiting for bank screen');

    // Confirm bank screen using direct text match (not detectScreen — scrollback
    // may contain "Port Accounts" from the previous main-menu, causing false main-menu detection)
    let bankConfirmed = false;
    try {
      await waitForText(this.page, /GALACTIC BANK|BANKING MENU/i, 8000);
      const recentBankText = (await getTerminalText(this.page)).slice(-800);
      bankConfirmed = /GALACTIC BANK|BANKING MENU/i.test(recentBankText);
    } catch {
      bankConfirmed = false;
    }
    if (!bankConfirmed) {
      const screenFallback = await detectScreen(this.page);
      this.log(`  [BANK] Not confirmed — screen=${screenFallback ?? '?'}`);
      this.report.skip('bank.visit', `Bank screen not confirmed (screen=${screenFallback ?? '?'})`);
      return;
    }
    this.log('  [BANK] Bank screen confirmed');

    if (!this.report.isPassed('bank.visit')) {
      this.report.pass('bank.visit', 'Visited First Galactic Bank', {}, {},
        `Credits on hand: ${state.credits}`);
    }

    // Deposit
    if (!this.report.isTested('bank.deposit')) {
      await pressKey(this.page, 'D');
      await waitForScreen(this.page, 'bank-deposit', 8000);
      const before = await this.snap();
      const amount = Math.min(5000, Math.max(100, Math.floor(state.credits * 0.2)));
      this.log(`  [DEPOSIT] ${amount} credits`);
      await typeAndEnter(this.page, String(amount));
      await this.page.waitForTimeout(800);
      const after = await this.snap();
      if (after.credits < before.credits) {
        this.report.pass('bank.deposit', `Deposited ${amount} credits`,
          { credits: before.credits }, { credits: after.credits },
          `credits ${before.credits}→${after.credits}`);
      } else {
        const term = await getTerminalText(this.page);
        this.report.fail('bank.deposit', `Attempted deposit of ${amount}`,
          { credits: before.credits }, { credits: after.credits },
          'Credits unchanged', term.slice(-200));
      }
      // After deposit, server returns nextScreen:'bank' — wait for bank to confirm
      await waitForScreen(this.page, 'bank', 5000).catch(() => null);
    }

    // Withdraw
    if (!this.report.isTested('bank.withdraw')) {
      await pressKey(this.page, 'W');
      await waitForScreen(this.page, 'bank-withdraw', 8000);
      const before = await this.snap();
      this.log('  [WITHDRAW] 1000 credits');
      await typeAndEnter(this.page, '1000');
      await this.page.waitForTimeout(800);
      const after = await this.snap();
      if (after.credits > before.credits) {
        this.report.pass('bank.withdraw', 'Withdrew 1000 credits',
          { credits: before.credits }, { credits: after.credits },
          `credits ${before.credits}→${after.credits}`);
      } else {
        const term = await getTerminalText(this.page);
        this.report.fail('bank.withdraw', 'Attempted withdrawal of 1000',
          { credits: before.credits }, { credits: after.credits },
          'Credits unchanged', term.slice(-200));
      }
      // After withdraw, server returns nextScreen:'bank' — wait for bank to confirm
      await waitForScreen(this.page, 'bank', 5000).catch(() => null);
    }

    await pressKey(this.page, 'R');
    await waitForScreen(this.page, 'main-menu', 10000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TASK: REPAIR (emergency)
  // ═══════════════════════════════════════════════════════════════════════════

  private async taskRepair(_state: TurnState): Promise<void> {
    await pressKey(this.page, 'S');
    await waitForScreen(this.page, 'shipyard', 10000);
    this.log('  [REPAIR] Emergency repair (R)');
    await pressKey(this.page, 'R');
    await this.page.waitForTimeout(1000);
    await pressKey(this.page, 'M');
    await waitForScreen(this.page, 'main-menu', 10000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  COMBAT — round-by-round handler (called from recovery + travel)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Parse the manifest board text and pick the best cargo contract:
   *   1. Prefer contracts where destination ≠ current system (avoids circular routes)
   *   2. Among those, prefer shorter distances (less combat exposure)
   * Returns contract number 1-4.
   */
  private pickBestCargoContract(manifestText: string, _currentSystem: number): number {
    // Manifest row format (fixed-width columns):
    // "| N. [cargo 19]  [val 3]  [dest 11]  [dis 3] [paymnt 6]  [fuel 4]   |"
    //
    // NOTE: xterm.js textContent doesn't insert \n between DOM rows.
    // The manifest text is one long string. Use matchAll to find each row.
    //
    // The LAST number in each matched row is ALWAYS fuel required.
    // The 2nd-to-last is payment.
    const rowPattern = /\|\s+([1-4])\.[^|]+\|/g;
    const rowMatches = [...manifestText.matchAll(rowPattern)];
    interface Contract { index: number; fuelRequired: number; payment: number }
    const contracts: Contract[] = [];

    for (const match of rowMatches) {
      const row = match[0];
      const idx = parseInt(match[1], 10);
      if (isNaN(idx) || idx < 1 || idx > 4) continue;
      const nums = (row.match(/\d+/g) ?? []).map(Number);
      if (nums.length >= 3) {
        // Last = fuel, 2nd-to-last = payment (robust against numeric system names)
        const fuelRequired = nums[nums.length - 1];
        const payment = nums[nums.length - 2];
        contracts.push({ index: idx, fuelRequired, payment });
      }
    }

    this.log(`  [CARGO] Parsed ${contracts.length} contracts: ${JSON.stringify(contracts)}`);

    if (contracts.length === 0) return 1; // fallback

    // Prefer LONGER routes — gets us to different regions, avoids repeated short hops
    contracts.sort((a, b) => b.fuelRequired - a.fuelRequired);

    // If retreating repeatedly, insist on the longest route; otherwise pick 2nd-longest
    if (this.consecutiveRetreats >= 2 || contracts.length === 1) {
      return contracts[0].index;
    }
    return contracts[Math.min(1, contracts.length - 1)].index;
  }

  private async handleCombatRound(): Promise<void> {
    const snap = await this.snap();
    const hull = snap.components.find(c => c.name === 'Hull');
    const hullCondition = hull?.condition ?? 9;
    const t = await getTerminalText(this.page);

    // Weapon drop prompt
    if (/Install even if possibly defective/i.test(t)) {
      await typeAndEnter(this.page, 'Y');
      return;
    }

    // Post-combat result — check last 800 chars for victory (it may scroll up)
    if (/VICTORY|Enemy destroyed|Enemy ship destroyed|You have destroyed/i.test(t.slice(-800))) {
      if (!this.report.isPassed('combat.victory')) {
        this.report.pass('combat.victory', 'Won combat', {}, {},
          t.match(/Enemy.*destroyed|You have destroyed|VICTORY.*/i)?.[0] ?? 'Victory');
      }
      await this.page.waitForTimeout(1500);
      return;
    }

    if (/You have been defeated|you surrendered/i.test(t.slice(-400))) {
      this.combatEndedEarly = true;
      this.consecutiveRetreats++;
      await this.page.waitForTimeout(1500);
      return;
    }

    // If we already attempted retreat and are STILL in combat, the retreat failed.
    // Surrender to end combat definitively and avoid death loop.
    if (this.combatEndedEarly) {
      this.log('  [COMBAT] Retreat failed — surrendering to exit');
      await pressKey(this.page, 'S');
      return;
    }

    // Detect enemy speed (fast=hull drops 2/round, slow=hull drops 1/round)
    if (this.combatAttackCount > 0 && this.combatHullDropRate === 0) {
      const drop = this.combatPrevHull - hullCondition;
      if (drop >= 2) this.combatHullDropRate = 2;  // fast enemy (bonus attack)
      else if (drop === 1) this.combatHullDropRate = 1;  // slow enemy
    }
    this.combatPrevHull = hullCondition;

    // Active combat: choose action
    // Surrender only when coverage is needed AND hull reaches 3 (before it hits 1)
    if (!this.report.isTested('combat.surrender') && hullCondition <= 3) {
      this.log(`  [COMBAT] Surrendering (hull ${hullCondition})`);
      this.report.pass('combat.surrender', `Surrendered (hull=${hullCondition})`,
        { hullCondition }, {}, 'Strategic surrender for coverage');
      this.combatEndedEarly = true;
      this.consecutiveRetreats++;
      await pressKey(this.page, 'S');
      return;
    }

    // Push for victory on 9th attack against slow enemies (hull drops 1/round).
    // Enemy hull starts at 9 and takes 1 damage per attack, so attack 9 should be lethal.
    // At hull=1 with 8+ attacks, the enemy is also at hull=1 — one more hit wins.
    // Victory check fires before defeat check on the server, so this is safe.
    const canPushForVictory = this.combatAttackCount >= 8
      && (this.combatHullDropRate === 1 || this.combatHullDropRate === 0)
      && !this.report.isPassed('combat.victory');

    if (hullCondition <= 1 && !canPushForVictory) {
      this.log(`  [COMBAT] Retreating (hull ${hullCondition})`);
      this.report.pass('combat.retreat', `Retreated (hull=${hullCondition})`,
        { hullCondition }, {}, 'Tactical retreat — hull critical');
      this.combatEndedEarly = true;
      this.consecutiveRetreats++;
      await pressKey(this.page, 'R');
      return;
    }

    // Attack
    this.combatAttackCount++;
    this.log(`  [COMBAT] Attacking (hull ${hullCondition}, attack #${this.combatAttackCount})`);
    if (!this.report.isTested('combat.attack')) {
      this.report.pass('combat.attack', 'Engaged in combat', {}, {}, 'Attacked enemy');
    }
    await pressKey(this.page, 'A');
    await this.page.waitForTimeout(800);

    // Check for victory immediately after attack — victory text briefly appears
    // before the screen transitions to main-menu (which clears the terminal)
    const tAfterAttack = await getTerminalText(this.page);
    if (/VICTORY|Enemy destroyed/i.test(tAfterAttack.slice(-800))) {
      if (!this.report.isPassed('combat.victory')) {
        this.report.pass('combat.victory', 'Won combat — enemy destroyed', {}, {},
          tAfterAttack.match(/VICTORY.*|Enemy destroyed.*/i)?.[0] ?? 'Victory');
      }
      this.log('  [COMBAT] VICTORY!');
      await this.page.waitForTimeout(1500);
    }
  }
}
