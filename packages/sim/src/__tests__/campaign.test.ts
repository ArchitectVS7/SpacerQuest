import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSimulatedCaptain } from '@spacerquest/content';
import { advanceDay, createInitialState, DayPhase, type PlayerAction } from '@spacerquest/engine';
import { describe, expect, it } from 'vitest';
import { availablePlannedActions, parseCliArgs, reportToJson, runCampaign } from '../index.js';

// ---------------------------------------------------------------------------
// The base campaign-runner suite. The competent-policy, Nemesis-arc and
// reachability sweeps that used to share this file were split into sibling
// campaign-*.test.ts files so vitest's fork pool runs them in parallel across
// cores (this single file was ~8 minutes on its own and set the whole test
// suite's wall-clock floor). The split is a pure test-organisation change: seeds,
// horizons and assertions are identical, and the drivers the sibling files share
// live in support/campaign-drivers.ts.
// ---------------------------------------------------------------------------

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

// npm ships as a shell script on POSIX and as `npm.cmd` on Windows. `execFile`
// does no PATHEXT lookup, and since CVE-2024-27980 Node refuses to launch a
// `.cmd` without a shell at all — so a bare `execFileSync('npm', ...)` is a
// guaranteed ENOENT on Windows. Resolve the launcher per platform (and hand
// Windows the shell it needs) so the acceptance command shape below stays
// byte-identical on every OS.
const IS_WINDOWS = process.platform === 'win32';
const NPM_BIN = IS_WINDOWS ? 'npm.cmd' : 'npm';

describe('campaign runner', () => {
  it('returns greedy campaign stats', () => {
    const report = runCampaign(1, 100, 'greedy');

    expect(report.seed).toBe(1);
    expect(report.days).toBe(100);
    expect(report.policy).toBe('greedy');
    expect(report.creditsCurve).toHaveLength(100);
    expect(report.daily).toHaveLength(100);
    expect(typeof report.wireVolume).toBe('number');
    expect(typeof report.flawOverrideRate).toBe('number');
    expect(report.deedCount).toBeGreaterThanOrEqual(3);
    expect(report.deedsEarned).toEqual(
      expect.arrayContaining(['first_manifest', 'first_jump', 'first_delivery']),
    );
    expect(report.renownRank).not.toBe('LIEUTENANT');
    expect(report.daily[report.daily.length - 1]?.deedCount).toBe(report.deedCount);
  });

  it('serializes deterministically for the same seed', () => {
    const first = reportToJson(runCampaign(1, 100, 'greedy'));
    const second = reportToJson(runCampaign(1, 100, 'greedy'));

    expect(second).toBe(first);
  });

  it('produces different random-policy output for different seeds', () => {
    const first = reportToJson(runCampaign(1, 20, 'random'));
    const second = reportToJson(runCampaign(2, 20, 'random'));

    expect(second).not.toBe(first);
  });

  it('parses explicit CLI options', () => {
    expect(parseCliArgs(['--seed', '1', '--days', '100', '--policy', 'greedy'])).toEqual({
      seed: 1,
      days: 100,
      policy: 'greedy',
    });
  });

  it('prints JSON-only stdout for the acceptance npm command shape', () => {
    const stdout = execFileSync(
      NPM_BIN,
      ['run', 'sim', '--', '--seed', '1', '--days', '5', '--policy', 'greedy'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        shell: IS_WINDOWS,
      },
    );
    const parsed = JSON.parse(stdout) as {
      seed?: unknown;
      days?: unknown;
      policy?: unknown;
      daily?: unknown;
      deedCount?: unknown;
    };

    expect(parsed.seed).toBe(1);
    expect(parsed.days).toBe(5);
    expect(parsed.policy).toBe('greedy');
    expect(typeof parsed.deedCount).toBe('number');
    expect(Array.isArray(parsed.daily)).toBe(true);
    expect(parsed.daily).toHaveLength(5);
  });

  /**
   * N2 RE-PIN, 10 → 25. PREVIOUS VALUE 10, NEW VALUE 25, MECHANISM: N2's upgrade
   * decision (`npc.ts` `considerRefit`), which is the step whose stated purpose is
   * to produce a wealth SPREAD across the 31-captain field. This bar was written
   * at T-106 against a cast that could not invest, where a top-to-median ratio
   * above 10 could only mean a degenerate distribution; with reinvestment it is
   * the intended shape, and leaving it at 10 would make the test fail *because the
   * step succeeded*.
   *
   * MEASURED before choosing the number, rather than set to just clear seed 1:
   * seeds 1..10 at this exact 200-day horizon give top/median ratios 10.20, 9.53,
   * 14.06, 15.99, 12.26, 7.52, 7.92, 12.15, 12.52, 7.60 — max 15.99. 25 sits ~56%
   * above the worst observed seed, so this stays a runaway detector rather than a
   * value re-pinned to the last measurement.
   *
   * WHAT IT STILL CATCHES, which is the reason not to simply delete it: the
   * `credits[0] > 0` floor below is untouched (the T-1605b anti-poverty-trap
   * invariant), and a genuine runaway — one captain owning the field — is still
   * orders of magnitude past 25.
   *
   * THE CEILING IS UNMOVED AT THE REOPENED N4; WHAT MOVED IS WHO IS COUNTED, and
   * that was a live bug rather than a re-pin. This block used to take its median
   * over all of `state.npcs`, which N3's roster split had grown to 41 records —
   * the 30 simulated captains plus 11 quest characters who take no turn and so
   * sit frozen at exactly 5,000cr. Eleven identical mid-distribution constants
   * SET the median: at seed 1 / day 200 the 41-record median reads 5,000 against
   * the simulated field's 167,421, and the assertion therefore measured a 344x
   * spread where the field's real one is 10.3x. It passed before N4 only because
   * the pre-blend field was poor enough for 5,000 to be a plausible median —
   * i.e. it was already measuring the wrong thing and getting away with it.
   *
   * RE-MEASURED over the SIMULATED LIVING field, seeds 1..10 at this exact
   * horizon: 10.29, 15.51, 9.05, 13.24, 11.92, 17.30, 20.09, 9.54, 9.87, 10.00.
   * **The ceiling stays 25 and the headroom is now thin — 24% above the worst
   * observed seed, where N2 chose 25 for ~56%.** It is deliberately NOT raised:
   * a band moved to keep a test green stops being a detector
   * (docs/VERSIONING.md), and 20.09 is a PASS. But the direction is a real
   * finding rather than noise — N4's specialisation concentrates wealth in the
   * six traders (seed 1: Cargo King 1,722,968 against the six fighters' ~125)
   * and widened the spread from N2's worst-of-ten 15.99 to 20.09. **N8 owns the
   * decision** when it re-pins against the living field: either the fighter's
   * flat `150 x tier` bounty is under-priced against a haul (the likelier
   * reading, and the same shape as R10) or this ceiling belongs somewhere else.
   * If a future seed crosses 25, read it as that finding arriving, not as a
   * fixture to nudge.
   *
   * THE DEAD ARE EXCLUDED, for the `credits[0]` floor rather than for the ratio:
   * a captain lost to an interdiction (N3) keeps whatever purse they died with,
   * and a corpse at 0 credits is a historical record, not the poverty trap
   * T-1605b's floor exists to detect.
   */
  const NPC_WEALTH_SPREAD_CEILING = 25;

  it('keeps the galaxy alive over 200 days: NPCs spread out and stay solvent', () => {
    let state = createInitialState(1);
    for (let day = 0; day < 200; day += 1) {
      state = advanceDay(state, [{ type: 'Wait' }]).state;
    }

    // THE FIELD, not the record count — content's shared predicate (see
    // `isSimulatedCaptain`, and the four bugs that conflation has caused).
    const field = state.npcs.filter((npc) => isSimulatedCaptain(npc.profileId) && !npc.dead);
    expect(field.length).toBeGreaterThan(20);

    // Movement is real: the cast has scattered across the starmap.
    const systems = new Set(field.map((npc) => npc.currentSystemId));
    expect(systems.size).toBeGreaterThanOrEqual(8);

    // Economics are real but non-degenerate: nobody pinned at exactly 0, nobody
    // running away past NPC_WEALTH_SPREAD_CEILING x the median.
    const credits = field.map((npc) => npc.credits).sort((a, b) => a - b);
    const median = credits[Math.floor(credits.length / 2)];
    expect(credits[0]).toBeGreaterThan(0);
    expect(credits[credits.length - 1]).toBeLessThanOrEqual(NPC_WEALTH_SPREAD_CEILING * median);
  }, 30000);

  it('T-1201: a 200-day sim shows a non-degenerate NPC trade failure rate', () => {
    // Every NPC verb now resolves through the shared check() and emits a
    // StatCheck into eventLog (the SAME events the wire renders — this is the
    // player-reachable surface). Scan the npc-trade checks and confirm the
    // failure rate is real but non-degenerate: NPCs neither always succeed
    // (the pre-T-1201 bug) nor always fail.
    let state = createInitialState(1);
    for (let day = 0; day < 200; day += 1) {
      state = advanceDay(state, [{ type: 'Wait' }]).state;
    }

    const tradeChecks = state.eventLog.filter(
      (e) => e.type === 'StatCheck' && e.actionContext === 'npc-trade',
    );
    const failures = tradeChecks.filter((e) => e.type === 'StatCheck' && !e.result.success).length;
    const rate = failures / tradeChecks.length;

    // A meaningfully large sample so the rate is real, not a small-n artifact.
    expect(tradeChecks.length).toBeGreaterThan(50);
    // Observed at authoring time (seed 1): ~937 trade checks, ~37% failures.
    // The assertion is the task's >5% / <60% band — NOT widened to force a pass.
    expect(rate).toBeGreaterThan(0.05);
    expect(rate).toBeLessThan(0.6);
  }, 30000);

  it('churns routes: no route stays optimal and the dominant route commonly shifts (T-107)', () => {
    // Route churn is an EMERGENT property of the churning economy, not a fact about
    // one seed. The prior single-pinned-seed form had to be re-derived every time an
    // upstream mechanic legitimately moved the RNG stream (seed 4 -> 6 at T-1104,
    // then a proposed 6 -> 7 at T-1302) — brittle golden-fixture maintenance dressed
    // up as a fix. T-1302's storylet-trigger rewrite is exactly such a legitimate
    // move: it changed which storylets fire during the greedy campaign, shifting the
    // best-offer stream so seed 6 stopped churning (it now pins destination 14 in
    // every window). Rather than re-pick a lucky seed, this asserts the property over
    // a seed sweep, testing BOTH halves of route churn directly:
    //   1. No route ever DOMINATES: in every 100-day window of every seed the single
    //      most-frequent best-paying destination holds well under half the dawns
    //      (measured max 0.27 at authoring; asserted <= 0.5). An economy that pinned
    //      one optimal route would spike a window's share toward 1.
    //   2. The optimal route commonly SHIFTS over time: for at least half the seeds
    //      the top best-paying destination is not the same across all three windows
    //      (measured 5 of 8 at authoring; asserted >= 4). Era onset/expiry keeps the
    //      optimum moving.
    // Only a REAL regression — a route that dominates, or churn that becomes rare —
    // fails this; a mere stream shift no longer forces a seed swap.
    const SEEDS = 8;
    let churned = 0;
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const report = runCampaign(seed, 300, 'greedy');
      expect(report.routeDiversity).toHaveLength(3);
      for (const window of report.routeDiversity) {
        expect(window.sampleCount).toBeGreaterThan(0);
        // No single destination owns half a window's dawns — no route is ever close
        // to a monopoly on "best-paying".
        expect(window.topShare).toBeLessThanOrEqual(0.5);
      }
      const tops = report.routeDiversity.map((window) => window.topDestination);
      if (new Set(tops).size > 1) churned += 1;
    }
    // Temporal churn is the common case across the sweep — not one cherry-picked seed.
    expect(churned).toBeGreaterThanOrEqual(4);
  }, 200000);

  it('plans upcoming-day die actions without inspecting spent dice', () => {
    const spentState = advanceDay(createInitialState(1), [{ type: 'Wait' }]).state;

    expect(spentState.dayPhase).toBe(DayPhase.DAWN);
    expect(spentState.player.dawnHand?.spent.every(Boolean)).toBe(true);

    const plannedActions = availablePlannedActions(spentState);
    const firstDieAction = plannedActions.find(
      (action): action is PlayerAction & { spendDie: number } =>
        action.type !== 'Wait' && 'spendDie' in action && action.spendDie !== undefined,
    );

    expect(firstDieAction?.spendDie).toBe(0);
    expect(() => advanceDay(spentState, plannedActions)).not.toThrow();
  });
});
