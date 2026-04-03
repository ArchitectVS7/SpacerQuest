/**
 * SpacerQuest LLM Playtest — Game-Actions Coverage Tracker
 *
 * Tracks which GAME-ACTIONS.md features have been exercised during a session.
 * Features are marked observed via direct record() calls and via auto-detection
 * from terminal text or current screen name.
 */

export const FEATURES: Record<string, string> = {
  // Navigation
  'nav.launch':           'Launch to another system',
  'nav.cargo_delivery':   'Deliver cargo on arrival',
  'nav.hazard':           'Travel hazard encountered',
  'nav.encounter':        'Combat encounter triggered during travel',
  'nav.malfunction':      'Nav system malfunction (redirected to random system)',
  // Combat
  'combat.attack':        'Attack in combat (press A)',
  'combat.retreat':       'Retreat from combat (press R)',
  'combat.surrender':     'Surrender in combat (press S)',
  'combat.victory':       'Win a combat battle',
  // Shipyard
  'shipyard.view':        'Visit the Shipyard screen',
  'shipyard.upgrade':     'Upgrade a ship component',
  'shipyard.repair':      'Repair ship components (press R at shipyard)',
  // Traders
  'traders.buy_fuel':     'Buy fuel at Traders',
  'traders.sell_fuel':    'Sell fuel at Traders',
  'traders.accept_cargo': 'Accept a cargo contract',
  // Bank
  'bank.visit':           'Visit the Bank screen',
  'bank.deposit':         'Deposit credits to bank',
  'bank.withdraw':        'Withdraw credits from bank',
  // Pub
  'pub.visit':            'Visit the Pub screen',
  'pub.drink':            'Buy a drink at the pub',
  'pub.gamble':           'Gamble at the pub',
  // Registry
  'registry.visit':       'Visit the Space Registry screen',
  'registry.patrol':      'Accept a Space Patrol mission',
  // Special
  'npc.sage':             'Visit the Sage (System 18)',
  'npc.wise_one':         'Visit the Wise One (System 17)',
  // Progress
  'score.rank_advance':   'Advance to a new rank',
};

export interface CoverageSummary {
  observed: string[];
  uncovered: string[];
  percent: number;
  criticalFailures: string[];
  report: string;
}

interface AttemptRecord {
  expectedScreen: string;
  actualScreen: string | null;
}

export class CoverageTracker {
  /** Feature IDs that have been observed at least once */
  private observed: Set<string> = new Set();

  /**
   * Recent attempts per feature key (keyed as `screen:<expectedScreen>` or feature ID).
   * We track up to 3 attempts per key to detect consistent mismatches.
   */
  private attempts: Map<string, AttemptRecord[]> = new Map();

  /**
   * Mark a feature as observed. Idempotent after first call.
   */
  record(featureId: string): void {
    if (featureId in FEATURES) {
      this.observed.add(featureId);
    }
  }

  /**
   * Record that an action was taken for this feature key.
   * Tracks whether the expected screen matched the actual screen.
   * Only screens with an expected value participate in mismatch analysis.
   */
  recordAttempt(featureId: string, expectedScreen: string | undefined, actualScreen: string | null): void {
    if (!expectedScreen) return;

    const entry: AttemptRecord = { expectedScreen, actualScreen };
    const existing = this.attempts.get(featureId) ?? [];
    existing.push(entry);
    // Keep only last 3
    if (existing.length > 3) existing.shift();
    this.attempts.set(featureId, existing);
  }

  isObserved(featureId: string): boolean {
    return this.observed.has(featureId);
  }

  getUncovered(): string[] {
    return Object.keys(FEATURES).filter(id => !this.observed.has(id));
  }

  getCoveragePercent(): number {
    const total = Object.keys(FEATURES).length;
    if (total === 0) return 100;
    return Math.round((this.observed.size / total) * 100);
  }

  /**
   * Returns feature keys (or attempt keys) where the last 3 attempts ALL had
   * expectedScreen !== actualScreen. Only applicable when expectedScreen was set.
   */
  getCriticallyFailing(): string[] {
    const failing: string[] = [];
    for (const [key, records] of this.attempts.entries()) {
      if (records.length < 3) continue;
      const allMismatch = records.every(r => r.actualScreen !== r.expectedScreen);
      if (allMismatch) {
        failing.push(key);
      }
    }
    return failing;
  }

  getReport(): string {
    const lines: string[] = ['=== GAME-ACTIONS COVERAGE REPORT ==='];
    for (const [id, desc] of Object.entries(FEATURES)) {
      const mark = this.observed.has(id) ? '✓' : '✗';
      lines.push(`${mark} ${id.padEnd(24)} (${desc})`);
    }
    const total = Object.keys(FEATURES).length;
    const pct = this.getCoveragePercent();
    lines.push(`Coverage: ${this.observed.size}/${total} features (${pct}%)`);

    const critical = this.getCriticallyFailing();
    if (critical.length > 0) {
      lines.push(`Critical failures (expected screen never matched): ${critical.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Auto-detect observed features from terminal output text.
   */
  detectFromTerminal(text: string): void {
    if (/always a pleasure doing business|Payment.*will be credited|Cargo delivered/i.test(text)) this.record('nav.cargo_delivery');
    if (/In transit|Arrived.*docking/i.test(text)) this.record('nav.launch');
    if (/X-Rad|Plasma-Ion|Proton Radiation|Micro-Asteroid/i.test(text)) this.record('nav.hazard');
    if (/Malfunction|Nav System Malfunction/i.test(text)) this.record('nav.malfunction');
    if (/VICTORY|Enemy destroyed/i.test(text)) this.record('combat.victory');
    if (/Component upgraded|upgrade.*success/i.test(text)) this.record('shipyard.upgrade');
    if (/All components repaired|repaired to full condition|components repaired/i.test(text)) this.record('shipyard.repair');
    if (/Bought \d+ fuel for|fuel.*bought|Fuel purchased/i.test(text)) this.record('traders.buy_fuel');
    if (/Sold \d+ fuel for|Fuel sold/i.test(text)) this.record('traders.sell_fuel');
    if (/Deposited|credits.*added.*account/i.test(text)) this.record('bank.deposit');
    if (/Withdrawn|credits.*withdrawn/i.test(text)) this.record('bank.withdraw');
    if (/gulp.*hit the spot|drink|have a round|you buy/i.test(text)) this.record('pub.drink');
    if (/Wheel of Fortune|Spacer.*Dare|you (win|lose)/i.test(text)) this.record('pub.gamble');
    if (/constellation|cabin.*upgraded|Sage.*quiz/i.test(text)) this.record('npc.sage');
    if (/Wise One|number key|derelict/i.test(text)) this.record('npc.wise_one');
    if (/promoted|new rank|congratulations.*rank/i.test(text)) this.record('score.rank_advance');
  }

  /**
   * Auto-detect observed features from the current screen name.
   */
  detectFromScreen(screen: string | null): void {
    if (!screen) return;
    if (screen === 'shipyard') this.record('shipyard.view');
    if (screen === 'bank') this.record('bank.visit');
    if (screen === 'pub') this.record('pub.visit');
    if (screen === 'registry') this.record('registry.visit');
    if (screen === 'combat') this.record('nav.encounter');
  }
}
