/**
 * SpacerQuest v4.0 — Playtest Report System
 *
 * Records every game action with before/after state verification,
 * producing a structured QA report grouped by turn.
 *
 * Three-state results:
 *   PASS  — action executed and game state changed as expected
 *   FAIL  — action executed but state did NOT change as expected (potential bug)
 *   SKIP  — action could not be attempted due to game constraints (not a bug)
 *
 * Events (combat encounters, hazards) are recorded separately as they are
 * not player-initiated but still need verification.
 */

export type ActionStatus = 'PASS' | 'FAIL' | 'SKIP' | 'EVENT';

export interface ActionResult {
  turn: number;
  feature: string;
  description: string;
  status: ActionStatus;
  /** Key state values before the action */
  before: Record<string, number | string>;
  /** Key state values after the action */
  after: Record<string, number | string>;
  /** Human-readable delta summary: "fuel 400→600, credits 29800→28800" */
  details: string;
  /** Terminal text captured at time of failure (for diagnosis) */
  terminalSnapshot?: string;
  /** Bug diagnosis referencing original source behavior */
  bugNote?: string;
}

export interface TurnSummary {
  turn: number;
  actions: ActionResult[];
}

export interface PlaytestSummary {
  turns: TurnSummary[];
  totalTurns: number;
  featuresTested: string[];
  featuresPassed: string[];
  featuresFailed: Array<{ feature: string; details: string; bugNote?: string }>;
  featuresSkipped: Array<{ feature: string; reason: string }>;
  featuresNotReached: string[];
  events: ActionResult[];
}

/** All trackable features from GAME-ACTIONS.md */
export const ALL_FEATURES = [
  'nav.launch', 'nav.cargo_delivery', 'nav.hazard', 'nav.encounter', 'nav.malfunction',
  'combat.attack', 'combat.retreat', 'combat.surrender', 'combat.victory',
  'shipyard.view', 'shipyard.upgrade', 'shipyard.repair',
  'traders.buy_fuel', 'traders.sell_fuel', 'traders.accept_cargo',
  'bank.visit', 'bank.deposit', 'bank.withdraw',
  'pub.visit', 'pub.drink', 'pub.gamble',
  'registry.visit', 'registry.patrol',
  'npc.sage', 'npc.wise_one',
  'score.rank_advance',
];

export class PlaytestReport {
  private results: ActionResult[] = [];
  private currentTurn = 0;

  get turn(): number {
    return this.currentTurn;
  }

  startTurn(n: number): void {
    this.currentTurn = n;
  }

  /** Record the result of a verified game action */
  record(result: Omit<ActionResult, 'turn'>): void {
    this.results.push({ turn: this.currentTurn, ...result });
  }

  pass(feature: string, description: string, before: Record<string, number | string>, after: Record<string, number | string>, details: string): void {
    this.record({ feature, description, status: 'PASS', before, after, details });
  }

  fail(feature: string, description: string, before: Record<string, number | string>, after: Record<string, number | string>, details: string, terminalSnapshot?: string, bugNote?: string): void {
    this.record({ feature, description, status: 'FAIL', before, after, details, terminalSnapshot, bugNote });
  }

  skip(feature: string, reason: string): void {
    this.record({ feature, description: reason, status: 'SKIP', before: {}, after: {}, details: reason });
  }

  event(feature: string, description: string, details: string): void {
    this.record({ feature, description, status: 'EVENT', before: {}, after: {}, details });
  }

  /** Check whether a feature has been recorded with a non-SKIP result */
  isTested(feature: string): boolean {
    return this.results.some(r => r.feature === feature && r.status !== 'SKIP');
  }

  /** Check whether a feature has any result at all (including SKIP) */
  isAttempted(feature: string): boolean {
    return this.results.some(r => r.feature === feature);
  }

  /** Check whether a feature passed */
  isPassed(feature: string): boolean {
    return this.results.some(r => r.feature === feature && r.status === 'PASS');
  }

  /** Get all unique tested feature IDs */
  getTestedFeatures(): string[] {
    return [...new Set(this.results.filter(r => r.status !== 'SKIP').map(r => r.feature))];
  }

  /** Get pass percentage (tested features that passed / all features) */
  getPassPercent(): number {
    const passed = new Set(this.results.filter(r => r.status === 'PASS').map(r => r.feature));
    return Math.round((passed.size / ALL_FEATURES.length) * 100);
  }

  // ── Report generation ─────────────────────────────────────────────────────

  getSummary(): PlaytestSummary {
    const tested = new Set<string>();
    const passed = new Set<string>();
    const failedMap = new Map<string, { details: string; bugNote?: string }>();
    const skippedMap = new Map<string, string>();
    const events: ActionResult[] = [];

    for (const r of this.results) {
      if (r.status === 'EVENT') {
        events.push(r);
        tested.add(r.feature);
        continue;
      }
      if (r.status === 'SKIP') {
        if (!skippedMap.has(r.feature)) skippedMap.set(r.feature, r.details);
        continue;
      }
      tested.add(r.feature);
      if (r.status === 'PASS') {
        passed.add(r.feature);
        failedMap.delete(r.feature); // a later pass overrides an earlier fail
      }
      if (r.status === 'FAIL' && !passed.has(r.feature)) {
        failedMap.set(r.feature, { details: r.details, bugNote: r.bugNote });
      }
    }

    const notReached = ALL_FEATURES.filter(f => !tested.has(f) && !skippedMap.has(f));

    // Group by turn
    const turnMap = new Map<number, ActionResult[]>();
    for (const r of this.results) {
      const arr = turnMap.get(r.turn) ?? [];
      arr.push(r);
      turnMap.set(r.turn, arr);
    }
    const turns: TurnSummary[] = [...turnMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([turn, actions]) => ({ turn, actions }));

    return {
      turns,
      totalTurns: this.currentTurn,
      featuresTested: [...tested],
      featuresPassed: [...passed],
      featuresFailed: [...failedMap.entries()].map(([feature, v]) => ({ feature, ...v })),
      featuresSkipped: [...skippedMap.entries()].map(([feature, reason]) => ({ feature, reason })),
      featuresNotReached: notReached,
      events,
    };
  }

  formatReport(): string {
    const s = this.getSummary();
    const lines: string[] = [];

    // ── Turn-by-turn details ──────────────────────────────────────────────
    for (const turn of s.turns) {
      lines.push(`\n${'═'.repeat(3)} TURN ${turn.turn} ${'═'.repeat(52)}`);
      for (const a of turn.actions) {
        const icon = a.status === 'PASS' ? '✓ PASS ' :
                     a.status === 'FAIL' ? '✗ FAIL ' :
                     a.status === 'SKIP' ? '— SKIP ' :
                     '⚡EVENT';
        const feat = a.feature.padEnd(22);
        lines.push(`  ${icon} ${feat} ${a.description}`);
        if (a.details && a.status !== 'SKIP') {
          lines.push(`         ${' '.repeat(22)} ${a.details}`);
        }
        if (a.bugNote) {
          lines.push(`         ${' '.repeat(22)} BUG: ${a.bugNote}`);
        }
      }
    }

    // ── Summary ───────────────────────────────────────────────────────────
    lines.push(`\n${'═'.repeat(3)} SUMMARY ${'═'.repeat(50)}`);
    lines.push(`  Turns played: ${s.totalTurns}`);
    lines.push(`  Features tested: ${s.featuresTested.length}/${ALL_FEATURES.length} (${this.getPassPercent()}% passed)`);
    lines.push(`  PASSED: ${s.featuresPassed.length}  FAILED: ${s.featuresFailed.length}  SKIPPED: ${s.featuresSkipped.length}  NOT REACHED: ${s.featuresNotReached.length}`);

    if (s.featuresFailed.length > 0) {
      lines.push(`\n  FAILURES:`);
      for (const f of s.featuresFailed) {
        lines.push(`    ✗ ${f.feature} — ${f.details}`);
        if (f.bugNote) lines.push(`      ${f.bugNote}`);
      }
    }

    if (s.featuresSkipped.length > 0) {
      lines.push(`\n  SKIPPED:`);
      for (const f of s.featuresSkipped) {
        lines.push(`    — ${f.feature} — ${f.reason}`);
      }
    }

    if (s.featuresNotReached.length > 0) {
      lines.push(`\n  NOT REACHED:`);
      for (const f of s.featuresNotReached) {
        lines.push(`    — ${f}`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }
}
