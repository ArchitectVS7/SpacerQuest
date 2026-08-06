/**
 * T-143 · §6 CRITERION 5 — "no source file outside the panel's own new code is
 * modified by running any panel action" — and §3's "gitignored by default".
 *
 * The strong form: snapshot `git status --porcelain` over the whole repo, run a
 * real panel action end to end, snapshot again, and require the two to be
 * IDENTICAL. That catches a write anywhere in the tree, not just in the places a
 * reviewer thought to look, and it catches a write to an already-dirty file too.
 *
 * WHY THE `gate` ROW IS NOT EXERCISED HERE, stated rather than quietly skipped:
 * its first step is `npm test`, which is the suite this file is running inside.
 * Driving it from a test would recurse. Its four steps are read-only by
 * construction (`npm test`, `tsc -b`, `eslint .`, `prettier --check .` — the
 * check form, never `--write`), the registry test asserts that composition, and
 * the gate is instead run by hand in the delivered note.
 *
 * PROMOTION is likewise not exercised as a real copy: it is the one action that
 * deliberately DOES write outside `.scratch/`. Its guard is tested directly, as a
 * pure function, plus the server's refusal to promote without a typed confirmation.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findCommand } from '../commands.js';
import { realSpawn, runShardedSweep, runSingleCommand } from '../runner.js';
import {
  assertPromotionTarget,
  listRuns,
  panelRunDir,
  promotionGitLines,
  resolveInsideRoot,
  runTimestamp,
  writeRunRecord,
} from '../runs.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PANEL_RUNS_ROOT = join(REPO_ROOT, '.scratch', 'balance', 'panel-runs');
const resolvePath = (path: string): string => resolve(REPO_ROOT, path);

function gitStatus(): string {
  return execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' });
}

const noopDeps = {
  spawn: realSpawn,
  cwd: REPO_ROOT,
  onEvent: (): void => {
    /* the UI stream; irrelevant here */
  },
};

describe('running a panel action leaves the working tree untouched', () => {
  it('a real 2-shard sweep + merge + diff + extract + report changes nothing git can see', async () => {
    const before = gitStatus();
    const runDir = mkdtempSync(join(tmpdir(), 't143-isolation-'));

    const sweep = findCommand('sweep');
    const diff = findCommand('diff');
    const extract = findCommand('extract');
    const report = findCommand('report');
    if (
      sweep === undefined ||
      diff === undefined ||
      extract === undefined ||
      report === undefined
    ) {
      throw new Error('registry is missing a row');
    }

    const sweepResult = await runShardedSweep(
      {
        command: sweep,
        values: { label: 't143-iso', seeds: '4', days: '8', policies: 'trader' },
        shardCount: 2,
        runDir,
        resolvePath,
      },
      noopDeps,
    );
    expect(sweepResult.status).toBe('ok');
    const aggregate = join(runDir, 'baseline-t143-iso.json');
    expect(existsSync(aggregate)).toBe(true);

    const diffResult = await runSingleCommand(
      {
        command: diff,
        values: {
          before: join(REPO_ROOT, 'docs', 'balance', 'baseline-tour-one.json'),
          after: join(REPO_ROOT, 'docs', 'balance', 'baseline-t150-postfix.json'),
        },
        runDir,
        resolvePath,
      },
      noopDeps,
    );
    expect(diffResult.result.code).toBe(0);

    // --out pointed INTO the run dir. Left blank, `smoke-extract.ts` would
    // rewrite the committed docs/balance/smoke/tiers.json — which is exactly the
    // kind of write this criterion exists to catch, so the panel's own default
    // must never be the script's.
    const extractResult = await runSingleCommand(
      {
        command: extract,
        values: {
          aggregate: join(REPO_ROOT, 'docs', 'balance', 'baseline-t150-postfix.json'),
          out: join(runDir, 'tiers.json'),
          date: '2026-01-01',
        },
        runDir,
        resolvePath,
      },
      noopDeps,
    );
    expect(extractResult.result.code).toBe(0);
    expect(existsSync(join(runDir, 'tiers.json'))).toBe(true);

    const reportResult = await runSingleCommand(
      {
        command: report,
        values: { aggregate, out: join(runDir, 'report'), name: 't143-iso' },
        runDir,
        resolvePath,
      },
      noopDeps,
    );
    expect(reportResult.result.code).toBe(0);
    expect(existsSync(join(runDir, 'report', 't143-iso.html'))).toBe(true);

    expect(gitStatus()).toBe(before);
  }, 600_000);

  it('a run written into the real panel-runs root is gitignored by the existing .scratch/ rule', () => {
    const before = gitStatus();
    const startedAt = '2026-08-01T09:14:07.000Z';
    const runDir = panelRunDir(PANEL_RUNS_ROOT, 't143-ignorecheck', startedAt);
    writeRunRecord(runDir, {
      id: basename(runDir),
      commandId: 'sweep',
      title: 'Run Sweep',
      commandLines: ['npm run balance:sweep'],
      startedAt,
      finishedAt: null,
      exitCode: null,
      shardCount: 1,
      status: 'running',
      outputs: [],
      runDir,
    });
    const rule = execFileSync('git', ['check-ignore', '-v', join(runDir, 'run.json')], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    // NO .gitignore EDIT WAS MADE OR NEEDED — the existing wholesale `.scratch/`
    // rule already covers §3's location, and this proves it rather than claiming it.
    expect(rule).toContain('.scratch/');
    expect(gitStatus()).toBe(before);
    expect(
      listRuns(PANEL_RUNS_ROOT).some((run) => run.id === 't143-ignorecheck-20260801-091407'),
    ).toBe(true);
    // REMOVED AGAIN. Found by driving the panel by hand: this probe otherwise
    // leaves a permanent "running / exit null" row at the top of a real
    // developer's run history, which reads as a hung sweep.
    rmSync(runDir, { recursive: true, force: true });
    expect(existsSync(runDir)).toBe(false);
  });

  it('names run directories deterministically from the ISO start time', () => {
    expect(runTimestamp('2026-08-01T09:14:07.123Z')).toBe('20260801-091407');
    expect(panelRunDir('/runs', 'tour-one', '2026-08-01T09:14:07.123Z')).toBe(
      join('/runs', 'tour-one-20260801-091407'),
    );
    expect(() => runTimestamp('not a date')).toThrow();
  });
});

describe('the promotion guard', () => {
  const runsRoot = '/runs';
  const src = join(runsRoot, 'tour-one-20260801-091407', 'baseline-tour-one.json');

  it('accepts exactly the one shape it is for', () => {
    expect(() =>
      assertPromotionTarget({
        src,
        dest: join(REPO_ROOT, 'docs', 'balance', 'baseline-tour-one.json'),
        runsRoot,
        repoRoot: REPO_ROOT,
      }),
    ).not.toThrow();
  });

  it('refuses a destination outside docs/balance', () => {
    for (const dest of [
      join(REPO_ROOT, 'docs', 'baseline-x.json'),
      join(REPO_ROOT, 'packages', 'sim', 'src', 'baseline-x.json'),
      // A sibling directory whose name merely starts with the allowed one.
      join(REPO_ROOT, 'docs', 'balance-scratch', 'baseline-x.json'),
    ]) {
      expect(() => assertPromotionTarget({ src, dest, runsRoot, repoRoot: REPO_ROOT })).toThrow(
        /not inside/,
      );
    }
  });

  it('refuses a .. traversal in either argument', () => {
    expect(() =>
      assertPromotionTarget({
        src,
        dest: join(REPO_ROOT, 'docs', 'balance', '..', '..', 'baseline-x.json'),
        runsRoot,
        repoRoot: REPO_ROOT,
      }),
    ).toThrow();
    expect(() =>
      assertPromotionTarget({
        src: join(runsRoot, '..', 'etc', 'baseline-x.json'),
        dest: join(REPO_ROOT, 'docs', 'balance', 'baseline-x.json'),
        runsRoot,
        repoRoot: REPO_ROOT,
      }),
    ).toThrow(/not inside the panel run root/);
  });

  it('refuses anything that is not a baseline-<label>.json', () => {
    for (const name of [
      'rows-x-shard1of4.json',
      'tiers.json',
      'baseline-.json',
      'baseline-x.txt',
    ]) {
      expect(() =>
        assertPromotionTarget({
          src,
          dest: join(REPO_ROOT, 'docs', 'balance', name),
          runsRoot,
          repoRoot: REPO_ROOT,
        }),
      ).toThrow();
    }
  });

  it('hands back git commands as TEXT rather than running them', () => {
    const lines = promotionGitLines('docs/balance/baseline-tour-one.json');
    expect(lines[0]).toBe('git add docs/balance/baseline-tour-one.json');
    expect(lines[1]).toContain('git commit -m');
    // docs/VERSIONING.md: a baseline pointer move is its own deliberate commit,
    // never a side effect of a tool run.
    expect(lines).toHaveLength(2);
  });
});

describe('the static route cannot escape the runs root', () => {
  it('resolves inside and refuses outside', () => {
    const root = mkdtempSync(join(tmpdir(), 't143-static-'));
    writeFileSync(join(root, 'ok.log'), 'x', 'utf8');
    expect(resolveInsideRoot(root, 'ok.log')).toBe(join(root, 'ok.log'));
    expect(resolveInsideRoot(root, 'a/b/../ok.log')).toBe(join(root, 'a', 'ok.log'));
    for (const bad of ['../secret', '../../etc/passwd', '%2e%2e/secret', `..${sep}secret`]) {
      expect(resolveInsideRoot(root, bad)).toBeNull();
    }
    // A sibling whose name starts with the root's is not inside it.
    expect(resolveInsideRoot(root, `../${root.split(sep).pop() ?? ''}-evil/x`)).toBeNull();
  });

  it('a half-written run.json is a missing history row, not a broken history', () => {
    const root = mkdtempSync(join(tmpdir(), 't143-history-'));
    const good = join(root, 'a-20260801-000001');
    writeRunRecord(good, {
      id: 'a-20260801-000001',
      commandId: 'diff',
      title: 'Diff Aggregates',
      commandLines: [],
      startedAt: '2026-08-01T00:00:01.000Z',
      finishedAt: null,
      exitCode: null,
      shardCount: 1,
      status: 'ok',
      outputs: [],
      runDir: good,
    });
    const broken = join(root, 'b-20260801-000002');
    writeRunRecord(broken, {
      id: 'b',
      commandId: 'diff',
      title: 'x',
      commandLines: [],
      startedAt: '2026-08-01T00:00:02.000Z',
      finishedAt: null,
      exitCode: null,
      shardCount: 1,
      status: 'ok',
      outputs: [],
      runDir: broken,
    });
    writeFileSync(join(broken, 'run.json'), '{ truncated', 'utf8');
    const runs = listRuns(root);
    expect(runs.map((run) => run.id)).toEqual(['a-20260801-000001']);
    expect(readFileSync(join(broken, 'run.json'), 'utf8')).toBe('{ truncated');
  });
});
