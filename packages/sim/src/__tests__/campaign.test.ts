import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceDay, createInitialState, DayPhase, type PlayerAction } from '@spacerquest/engine';
import { describe, expect, it } from 'vitest';
import { availablePlannedActions, parseCliArgs, reportToJson, runCampaign } from '../index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

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
      'npm',
      ['run', 'sim', '--', '--seed', '1', '--days', '5', '--policy', 'greedy'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    );
    const parsed = JSON.parse(stdout) as {
      seed?: unknown;
      days?: unknown;
      policy?: unknown;
      daily?: unknown;
    };

    expect(parsed.seed).toBe(1);
    expect(parsed.days).toBe(5);
    expect(parsed.policy).toBe('greedy');
    expect(Array.isArray(parsed.daily)).toBe(true);
    expect(parsed.daily).toHaveLength(5);
  });

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
