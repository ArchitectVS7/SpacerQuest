/**
 * SpacerQuest LLM Playtest — Game Loop
 *
 * Orchestrates the playtest session:
 *   1. Execute Claude's decided action via terminal keypresses
 *   2. Verify the outcome matches expectations
 *   3. On mismatch: diagnose, recover, or surface bug and restart
 *   4. Update session stats after each significant event
 *   5. Check goal completion after each turn cycle
 *
 * The loop terminates when:
 *   - The goal is achieved, OR
 *   - A confirmed game bug blocks progress after MAX_RESTARTS attempts, OR
 *   - The session exceeds MAX_ACTIONS (safety cap)
 */

import { Page, APIRequestContext } from '@playwright/test';
import { ClaudePlayer, PlayerAction, GameContext } from './claude-player';
import { Goal, GoalProgress, SessionStats, checkGoal, initialStats } from './goals';
import { ApiValidator } from '../helpers/api-validator';
import { getTerminalText, waitForText, pressKey, typeAndEnter, detectScreen, BUFFERED_SCREENS } from '../helpers/terminal';
import { writeFileSync } from 'fs';
import { CoverageTracker } from './coverage-tracker';

const MAX_ACTIONS = 2000;       // Safety cap — prevents infinite loops
const MAX_RESTARTS = 3;         // Max session restarts before surfacing to user
const MAX_CONSECUTIVE_ERRORS = 5; // Max errors in a row before forcing restart
const ACTION_LOG_PATH = process.env.PLAYTEST_LOG ?? '/tmp/spacerquest-playtest.log';

export interface LoopResult {
  goal: Goal;
  progress: GoalProgress;
  stats: SessionStats;
  summary: string;
  bugs: Array<{ description: string; terminalSnapshot: string }>;
  success: boolean;
}

export class GameLoop {
  private page: Page;
  private api: ApiValidator;
  private player: ClaudePlayer;
  private goal: Goal;
  private stats: SessionStats;
  private actionLog: string[] = [];
  private recentActions: Array<{ action: string; outcome: string }> = [];
  private bugs: Array<{ description: string; terminalSnapshot: string }> = [];
  private consecutiveErrors = 0;
  private totalActions = 0;
  private turnNumber = 0;
  /** Track last N action signatures to detect stuck loops */
  private recentActionSignatures: string[] = [];
  private coverage: CoverageTracker;
  /** Track which critical failures have already been logged (avoid spam) */
  private loggedCriticalFailures = new Set<string>();

  constructor(page: Page, api: ApiValidator, player: ClaudePlayer, goal: Goal) {
    this.page = page;
    this.api = api;
    this.player = player;
    this.goal = goal;
    this.stats = initialStats();
    this.coverage = new CoverageTracker();
  }

  async run(): Promise<LoopResult> {
    this.log(`=== SpacerQuest LLM Playtest Started ===`);
    this.log(`Goal: ${this.goal.description}`);
    this.log(`Model: ${process.env.PLAYTEST_MODEL ?? 'claude-haiku-4-5-20251001'}`);
    this.log('');

    while (this.totalActions < MAX_ACTIONS) {
      // Check goal completion
      const progress = checkGoal(this.goal, this.stats);
      if (progress.achieved) {
        this.log(`\n=== GOAL ACHIEVED: ${progress.summary} ===`);
        const summary = await this.player.summarizeSession(
          await this.buildContext(),
          this.stats,
        );
        this.flushLog();
        return {
          goal: this.goal,
          progress,
          stats: this.stats,
          summary,
          bugs: this.bugs,
          success: true,
        };
      }

      // Check restart limit
      if (this.stats.restarts >= MAX_RESTARTS) {
        const summary = `FAILED: Exceeded ${MAX_RESTARTS} restarts. Unresolved bugs: ${this.bugs.length}`;
        this.log(summary);
        this.flushLog();
        return {
          goal: this.goal,
          progress,
          stats: this.stats,
          summary,
          bugs: this.bugs,
          success: false,
        };
      }

      // Build context and ask Claude for the next action
      const ctx = await this.buildContext();
      this.log(`  [STATE] screen=${ctx.currentScreen ?? '?'} cr=${ctx.stats.credits} pods=${ctx.stats.cargoPods}/${ctx.stats.maxCargoPods} dest=${ctx.stats.destination||'none'} trips=${ctx.stats.tripCount}/2 fuel=${ctx.stats.fuel}`);
      const action = await this.player.decideNextAction(ctx);

      this.log(`[T${this.turnNumber}:A${this.totalActions}] ${action.type}:${action.value} — ${action.reasoning}`);

      // Repetition detector: if the last 5 actions are all identical, the agent is stuck
      const sig = `${action.type}:${action.value}`;
      this.recentActionSignatures.push(sig);
      if (this.recentActionSignatures.length > 6) this.recentActionSignatures.shift();
      const sigs = this.recentActionSignatures;
      const identicalLoop = sigs.length >= 5 && sigs.slice(-5).every(s => s === sigs[sigs.length - 1]);
      // Alternating A/B/A/B/A/B oscillation detector (e.g. press_key:T / press_key:M loop)
      const oscillationLoop = sigs.length === 6 &&
        sigs[0] === sigs[2] && sigs[2] === sigs[4] &&
        sigs[1] === sigs[3] && sigs[3] === sigs[5] &&
        sigs[0] !== sigs[1];
      if (identicalLoop || oscillationLoop) {
        const pattern = oscillationLoop ? `${sigs[0]} ↔ ${sigs[1]}` : sig;
        this.log(`  [!] STUCK LOOP detected — ${oscillationLoop ? 'oscillation' : 'same action 5x'}: ${pattern}. Forcing recovery.`);
        await this.restartSession();
        this.recentActionSignatures = [];
        continue;
      }

      if (action.type === 'diagnose') {
        await this.handleDiagnosis(ctx, action);
        continue;
      }

      // Execute action
      const before = await getTerminalText(this.page);
      const screenBefore = await detectScreen(this.page);
      await this.executeAction(action);
      this.totalActions++;
      this.stats.totalActions++;

      // Map actions to coverage features
      const screenAfterAction = await detectScreen(this.page);

      if (action.type === 'press_key') {
        // Combat features: check what screen we were ON before the keypress
        if (screenBefore === 'combat') {
          if (action.value.toLowerCase() === 'a') this.coverage.record('combat.attack');
          if (action.value.toLowerCase() === 'r') this.coverage.record('combat.retreat');
          if (action.value.toLowerCase() === 's') this.coverage.record('combat.surrender');
        }
        // Nav launch: N key from main-menu → navigate screen
        if (screenBefore === 'main-menu' && action.value.toLowerCase() === 'n') {
          this.coverage.record('nav.launch');
        }
        // Shipyard view: S key from main-menu always opens shipyard
        // NOTE: detectScreen never returns 'shipyard' (timing issue with DB render),
        // so we record based on navigation intent.
        if (screenBefore === 'main-menu' && action.value.toLowerCase() === 's') {
          this.coverage.record('shipyard.view');
        }
        // Shipyard repair: R key on shipyard-upgrade screen (only screen where R=repair)
        // OR when screenBefore is null (shipyard main menu not detected) and R key pressed
        if (screenBefore === 'shipyard' && action.value.toLowerCase() === 'r') {
          this.coverage.record('shipyard.repair');
        }
        // Pub drink: B key on pub screen
        if (screenBefore === 'pub' && action.value.toLowerCase() === 'b') {
          this.coverage.record('pub.drink');
        }
        // Pub gamble: D or W key on pub screen (dare game or wheel of fortune)
        if (screenBefore === 'pub' && (action.value.toLowerCase() === 'd' || action.value.toLowerCase() === 'w')) {
          this.coverage.record('pub.gamble');
        }
      }
      if (action.type === 'type_and_enter') {
        // Cargo accept: Y confirmation on traders-cargo → moves back to traders
        if (screenBefore === 'traders-cargo' && action.value.toLowerCase() === 'y') {
          this.coverage.record('traders.accept_cargo');
        }
        // Fuel buy: number entered on traders-buy-fuel screen
        if (screenBefore === 'traders-buy-fuel' && /^\d+$/.test(action.value)) {
          this.coverage.record('traders.buy_fuel');
        }
        // Fuel sell: number entered on traders-sell-fuel screen
        if (screenBefore === 'traders-sell-fuel' && /^\d+$/.test(action.value)) {
          this.coverage.record('traders.sell_fuel');
        }
      }
      // Cargo delivery: detected when cargoPods went to 0 after travel (from travel handler)
      if (screenAfterAction === 'traders-cargo') this.coverage.record('traders.accept_cargo');

      // Verify outcome (polls for up to 3s for the screen to change)
      const outcomeOk = await this.verifyOutcome(action, before);

      // Post-outcome coverage: shipyard upgrade (success only, no Upgrade failed error)
      // Success message disappears immediately (nextScreen:'shipyard' re-renders before read),
      // so we check outcome success instead of terminal text.
      if (outcomeOk && action.type === 'type_and_enter' &&
          screenBefore === 'shipyard-upgrade' && /^\d$/.test(action.value)) {
        this.coverage.record('shipyard.upgrade');
      }

      if (!outcomeOk) {
        this.consecutiveErrors++;
        this.log(`  [!] Unexpected outcome (error ${this.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`);

        if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          this.log(`  [!] Too many consecutive errors — forcing restart`);
          await this.restartSession();
          continue;
        }

        // Ask Claude to diagnose
        const ctx2 = await this.buildContext();
        const currentText = await getTerminalText(this.page);
        const diagnosis = await this.player.diagnose(ctx2, action, currentText);
        this.log(`  [DIAGNOSIS] ${diagnosis.problem} | isBug: ${diagnosis.isBug}`);

        if (diagnosis.isBug) {
          this.bugs.push({ description: diagnosis.problem, terminalSnapshot: currentText.slice(-600) });
          this.log(`  [BUG RECORDED] ${diagnosis.problem}`);

          if (diagnosis.shouldRestart) {
            await this.restartSession();
            continue;
          }

          // Execute recovery actions only for confirmed bugs
          for (const recovery of diagnosis.recoveryActions) {
            await this.executeAction(recovery);
            await this.page.waitForTimeout(500);
          }
        } else {
          // Not a bug — wrong screen or invalid key for current screen.
          // Record the failure in recentActions so agent learns from it.
          this.consecutiveErrors = 0;
          const currentScreen = await detectScreen(this.page);
          this.recentActions.push({
            action: `${action.type}:${action.value}`,
            outcome: `INVALID on ${currentScreen ?? 'unknown screen'} — ${diagnosis.problem}`,
          });
          if (this.recentActions.length > 20) this.recentActions = this.recentActions.slice(-20);
          this.log(`  [OK] Recorded failure in recentActions, continuing`);
        }
        continue;
      }

      // Successful action
      this.consecutiveErrors = 0;

      // If travel just started, wait for arrival before continuing
      await this.checkAndWaitForTravel();

      const terminalAfter = await getTerminalText(this.page);
      const screenAfter = await detectScreen(this.page);
      this.recordAction(action, terminalAfter, screenAfter);
      await this.updateStats(action, terminalAfter);
    }

    // Safety cap reached
    const progress = checkGoal(this.goal, this.stats);
    const summary = `Safety cap reached (${MAX_ACTIONS} actions). ${progress.summary}`;
    this.flushLog();
    return {
      goal: this.goal,
      progress,
      stats: this.stats,
      summary,
      bugs: this.bugs,
      success: progress.achieved,
    };
  }

  // ---------------------------------------------------------------------------
  // Action execution
  // ---------------------------------------------------------------------------

  private async executeAction(action: PlayerAction): Promise<void> {
    switch (action.type) {
      case 'press_key': {
        // Guard: model sometimes returns press_key:end_turn instead of end_turn action type
        if (action.value === 'end_turn') {
          this.log(`  [NORMALIZE] press_key:end_turn → end_turn action`);
          await this.executeEndTurn();
          break;
        }
        // Guard: empty key string causes playwright crash — fall back to Escape
        if (!action.value || action.value.trim() === '') {
          this.log(`  [NORMALIZE] press_key:(empty) → Escape`);
          await pressKey(this.page, 'Escape');
          break;
        }
        // On buffered screens, single keypresses accumulate in the xterm buffer
        // without being sent to the server. Auto-convert to type_and_enter so each
        // key is immediately processed, preventing buffer corruption.
        const currentScreen = await detectScreen(this.page);

        // Screen-specific key normalization: models sometimes use M to exit screens
        // that don't support M. Remap to the correct exit key for each screen.
        const mKey = action.value.toLowerCase() === 'm';
        if (mKey && currentScreen === 'traders-cargo') {
          this.log(`  [NORMALIZE] press_key:M on traders-cargo → type_and_enter:Q`);
          await typeAndEnter(this.page, 'Q');
          break;
        }
        if (mKey && currentScreen === 'navigate') {
          this.log(`  [NORMALIZE] press_key:M on navigate → type_and_enter:Q`);
          await typeAndEnter(this.page, 'Q');
          break;
        }
        if (mKey && currentScreen === 'bank') {
          this.log(`  [NORMALIZE] press_key:M on bank → type_and_enter:M (bank uses buffered input)`);
          await typeAndEnter(this.page, 'M');
          break;
        }

        if (currentScreen && BUFFERED_SCREENS.includes(currentScreen)) {
          this.log(`  [BUFFERED] Converting press_key:${action.value} to type_and_enter on ${currentScreen}`);
          await typeAndEnter(this.page, action.value);
        } else {
          await pressKey(this.page, action.value);
        }
        break;
      }

      case 'type_and_enter':
        await typeAndEnter(this.page, action.value);
        break;

      case 'wait':
        await this.page.waitForTimeout(parseInt(action.value, 10) || 1000);
        break;

      case 'end_turn':
        await this.executeEndTurn();
        break;

      default:
        this.log(`  [WARN] Unknown action type: ${action.type}`);
    }
  }

  private async executeEndTurn(): Promise<void> {
    // D to open "Done for Today?" prompt, then Y to confirm
    await pressKey(this.page, 'd');
    await this.page.waitForTimeout(600);

    const text = await getTerminalText(this.page);
    if (/Done for Today|end.*turn|quit.*game/i.test(text)) {
      await pressKey(this.page, 'y');
      this.log(`  [END TURN] Confirmed`);

      // Wait for bot summary and return to main menu
      try {
        await waitForText(this.page, /Port Accounts|MAIN MENU/i, 20000);
      } catch {
        // Bots may take longer — wait a bit more
        await this.page.waitForTimeout(5000);
      }

      this.stats.turnsCompleted++;
      this.stats.actionsThisTurn = 0;
      this.turnNumber++;
      this.log(`  [TURN ${this.stats.turnsCompleted} COMPLETE]`);
      // Clear conversation history so the next turn starts fresh without stale context
      this.player.clearHistory();
    } else {
      this.log(`  [WARN] End-turn prompt not found — text: ${text.slice(-100)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Outcome verification
  // ---------------------------------------------------------------------------

  private async verifyOutcome(
    action: PlayerAction,
    before: string,
  ): Promise<boolean> {
    if (action.type === 'wait' || action.type === 'end_turn') return true;

    // Wait a moment for the screen to settle after the action
    await this.page.waitForTimeout(600);
    const current = await getTerminalText(this.page);

    // Only flag as failure if the terminal shows an explicit error response.
    // Do NOT fail on "terminal unchanged" — many screens (cargo, combat, traders sub-menus)
    // have near-identical text structure before and after a valid action.
    const errorPatterns = [
      /Invalid command/i,
      /not enough fuel/i,
      /insufficient credits/i,
      /not enough credits/i,
      /Upgrade failed/i,
      /cannot purchase/i,
      /already own/i,
      /trip limit/i,
      /Aborted/i,
    ];
    for (const pat of errorPatterns) {
      if (pat.test(current) && !pat.test(before)) {
        this.log(`  [WARN] Game error detected after ${action.type}:${action.value}: "${current.match(pat)?.[0]}"`);
        return false;
      }
    }

    // Always log the detected screen for debugging and agent context
    const detectedScreen = await detectScreen(this.page);
    if (detectedScreen) this.log(`  [screen] ${detectedScreen}`);

    // Check for new critical coverage failures (log each only once)
    const criticalFailures = this.coverage.getCriticallyFailing();
    for (const f of criticalFailures) {
      if (!this.loggedCriticalFailures.has(f)) {
        this.loggedCriticalFailures.add(f);
        this.log(`  [COVERAGE CRITICAL] Feature "${f}" has consistent screen mismatches — possible bug`);
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Diagnosis
  // ---------------------------------------------------------------------------

  private async handleDiagnosis(ctx: GameContext, action: PlayerAction): Promise<void> {
    const terminalText = await getTerminalText(this.page);
    const diagnosis = await this.player.diagnose(ctx, action, terminalText);
    this.log(`[DIAGNOSIS] ${diagnosis.problem}`);

    if (diagnosis.isBug) {
      this.bugs.push({ description: diagnosis.problem, terminalSnapshot: terminalText.slice(-600) });
      this.log(`[BUG] ${diagnosis.problem}`);
    }

    if (diagnosis.shouldRestart) {
      await this.restartSession();
      return;
    }

    for (const recovery of diagnosis.recoveryActions) {
      await this.executeAction(recovery);
      await this.page.waitForTimeout(500);
    }
  }

  // ---------------------------------------------------------------------------
  // Session restart
  // ---------------------------------------------------------------------------

  private async restartSession(): Promise<void> {
    this.stats.restarts++;
    this.log(`\n=== SESSION RESTART ${this.stats.restarts}/${MAX_RESTARTS} ===`);
    this.consecutiveErrors = 0;
    // Clear stale conversation history so the agent starts fresh
    this.player.clearHistory();

    // Try to get back to a known state: main menu
    for (const key of ['Escape', 'm', 'q', 'Escape', 'm']) {
      await pressKey(this.page, key);
      await this.page.waitForTimeout(400);
      const text = await getTerminalText(this.page);
      if (/Port Accounts|MAIN MENU/i.test(text)) {
        this.log(`  Recovered to main menu`);
        return;
      }
    }

    // Full page reload
    this.log(`  Hard reload...`);
    await this.page.reload();
    await this.page.waitForTimeout(3000);

    try {
      await waitForText(this.page, /Port Accounts|MAIN MENU/i, 20000);
      this.log(`  Recovered after reload`);
    } catch {
      this.log(`  [CRITICAL] Cannot recover to main menu after reload`);
    }
  }

  // ---------------------------------------------------------------------------
  // Stats & context
  // ---------------------------------------------------------------------------

  private async updateStats(action: PlayerAction, terminalText: string): Promise<void> {
    // Update stats from API for reliable numbers
    try {
      const snapshot = await this.api.snapshotState();
      if (snapshot.credits > this.stats.peakCredits) {
        this.stats.peakCredits = snapshot.credits;
      }
    } catch {
      // API unavailable — parse from terminal as fallback
      const credMatch = terminalText.match(/Credits?[:\s]+([0-9,]+)/i);
      if (credMatch) {
        const cr = parseInt(credMatch[1].replace(/,/g, ''), 10);
        if (cr > this.stats.peakCredits) this.stats.peakCredits = cr;
      }
    }

    // Detect significant events from terminal text
    if (/VICTORY|Enemy destroyed/i.test(terminalText)) {
      this.stats.battlesWon++;
      this.log(`  [+] Battle won (total: ${this.stats.battlesWon})`);
    }
    if (/DEFEAT|overwhelmed/i.test(terminalText)) {
      this.stats.battlesLost++;
    }
    if (/Cargo delivered|delivery complete|Bonus credited|always a pleasure doing business|Payment.*will be credited/i.test(terminalText)) {
      this.stats.cargoDeliveries++;
      this.log(`  [+] Cargo delivered (terminal) (total: ${this.stats.cargoDeliveries})`);
    }
    if (/Upgraded|Component upgraded|upgraded successfully/i.test(terminalText) && action.type !== 'wait') {
      this.stats.upgradesDone++;
      this.log(`  [+] Upgrade done (total: ${this.stats.upgradesDone})`);
    }
    if (/Alliance.*joined|You have joined/i.test(terminalText)) {
      this.stats.allianceJoined = true;
      this.log(`  [+] Alliance joined`);
    }
    if (/ARENA|arena.*round|fight.*begin/i.test(terminalText)) {
      this.stats.arenaFought = true;
    }

    // Rank detection
    const rankMatch = terminalText.match(/\b(Lieutenant|Commander|Captain|Commodore|Admiral|Top Dog|Grand Mufti|Mega Hero|Giga Hero)\b/);
    if (rankMatch) {
      this.stats.currentRank = rankMatch[1];
    }

    // Auto-detect coverage features from terminal text
    this.coverage.detectFromTerminal(terminalText);

    this.stats.actionsThisTurn++;
    this.stats.coveragePercent = this.coverage.getCoveragePercent();
  }

  private async buildContext(): Promise<GameContext> {
    // Brief wait to let the terminal stabilize after any screen transitions
    await this.page.waitForTimeout(800);
    const terminalText = await getTerminalText(this.page);
    const screen = await detectScreen(this.page);

    // Auto-detect coverage features from screen name
    this.coverage.detectFromScreen(screen);

    let gameState = {
      credits: 0,
      fuel: 0,
      system: 0,
      cargoPods: 0,
      maxCargoPods: 0,
      cargoType: 0,
      destination: 0,
      tripCount: 0,
      battlesWon: this.stats.battlesWon,
      rank: this.stats.currentRank,
      turnsCompleted: this.stats.turnsCompleted,
      upgradesDone: this.stats.upgradesDone,
      hullStr: 0,
      score: 0,
    };

    try {
      const snapshot = await this.api.snapshotState();
      const hullComp = snapshot.components?.find((c: any) => c.name === 'Hull' || c.slot === 'hull');
      gameState = {
        ...gameState,
        credits: snapshot.credits,
        fuel: snapshot.fuel,
        system: snapshot.system,
        cargoPods: snapshot.cargoPods,
        cargoType: snapshot.cargoType,
        destination: snapshot.destination,
        tripCount: snapshot.tripCount,
        maxCargoPods: snapshot.maxCargoPods ?? 0,
        hullStr: hullComp?.strength ?? 0,
        score: snapshot.score ?? 0,
        rank: snapshot.rank ?? this.stats.currentRank,
      };
    } catch {
      // Parse from terminal as fallback
    }

    const progress = checkGoal(this.goal, this.stats);

    return {
      terminalText,
      currentScreen: screen,
      stats: {
        ...gameState,
        // Include actions taken this turn so hints can limit exploration time
        actionsThisTurn: this.stats.actionsThisTurn,
      },
      goalDescription: this.goal.description,
      goalProgress: progress.summary,
      recentActions: this.recentActions.slice(-5),
      turnNumber: this.turnNumber,
      uncoveredFeatures: this.coverage.getUncovered(),
      coveragePercent: this.coverage.getCoveragePercent(),
    };
  }

  private recordAction(action: PlayerAction, terminalAfter: string, screen: string | null): void {
    const entry = {
      action: `${action.type}:${action.value}`,
      outcome: screen ?? terminalAfter.slice(-80).replace(/\n/g, ' ').trim(),
    };
    this.recentActions.push(entry);
    if (this.recentActions.length > 20) {
      this.recentActions = this.recentActions.slice(-20);
    }
  }

  // ---------------------------------------------------------------------------
  // Travel detection
  // ---------------------------------------------------------------------------

  /**
   * After any action, check if the character just entered transit.
   * If so, wait for the travel timer to expire, call /arrive, and log arrival.
   *
   * Root cause: the frontend poll only fires when inTransit===true, so after
   * the navigate screen fires startTravel and returns main-menu, the poll
   * never kicks in. This method bridges the gap by polling the API directly.
   */
  private async checkAndWaitForTravel(): Promise<void> {
    try {
      const status = await this.api.getTravelStatus();
      if (!status.inTransit) return;

      const timeRemaining = (status.timeRemaining ?? 30) as number;
      this.log(`  [TRAVEL] In transit to system ${status.destination} — ${timeRemaining}s remaining`);

      // Poll until the timer expires (with a 2-minute hard cap)
      const deadline = Date.now() + Math.min(timeRemaining * 1000 + 5000, 120000);
      while (Date.now() < deadline) {
        await this.page.waitForTimeout(2000);
        const current = await this.api.getTravelStatus();
        if (!current.inTransit) break;
      }

      // Call arrive to run docking (cargo delivery, encounter, screen override)
      try {
        await this.api.arrive();
        this.log(`  [TRAVEL] Arrived — docking processed`);
      } catch {
        this.log(`  [TRAVEL] Arrive already processed or error (non-fatal)`);
      }

      // Give the socket time to emit travel:complete and update the terminal
      await this.page.waitForTimeout(2000);

      // Check if cargo was delivered
      const snapshot = await this.api.snapshotState();
      this.log(`  [TRAVEL] Now at system ${snapshot.system}, cargoPods=${snapshot.cargoPods}`);
      if (snapshot.cargoPods === 0 && snapshot.destination === 0) {
        this.stats.cargoDeliveries++;
        this.coverage.record('nav.cargo_delivery');
        this.log(`  [+] Cargo delivered via travel (total: ${this.stats.cargoDeliveries})`);
      }
    } catch {
      // Non-fatal — travel detection failure should not crash the loop
    }
  }

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  private log(msg: string): void {
    const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
    this.actionLog.push(line);
    console.log(line);
  }

  private flushLog(): void {
    try {
      const coverageReport = this.coverage.getReport();
      this.log('\n' + coverageReport);
      writeFileSync(ACTION_LOG_PATH, this.actionLog.join('\n'), 'utf-8');
      console.log(`\nAction log written to: ${ACTION_LOG_PATH}`);
    } catch {
      // Non-fatal
    }
  }
}
