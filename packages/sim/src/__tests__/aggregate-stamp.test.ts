// ---------------------------------------------------------------------------
// T-183 · F-142-1, CLOSED — a merged aggregate says which ruleset it measured.
//
// Until T-183 a `BaselineAggregate` had seven top-level keys and none of them was
// a stamp, so `balance:report` over two committed aggregates rendered the loud
// "RULESET UNKNOWN FOR ONE OR BOTH INPUTS" banner and a promoted baseline
// inherited the same gap. `sweep.ts --merge` now stamps
// `rulesFingerprint`/`instrumentFingerprint`/`gitCommit` at write time.
//
// WHAT THIS SUITE IS FOR, in one sentence per section:
//   A · the merge really stamps, with the tree's OWN values (not 'unknown');
//   B · the Accept criterion, driven through the real `balance:report` CLI;
//   C · the change is INERT — which is what buys the no-capstone decision;
//   D · the differ ignores the stamps for "what moved" but REPORTS them.
//
// This file lives under `__tests__`, which `HASHED_ROOT_IGNORED_DIRECTORIES`
// excludes from every fingerprint, so nothing written here can move a hash.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCampaign } from '../index.js';
import {
  aggregate,
  summarizeReport,
  type AggregateStamp,
  type BaselineAggregate,
  type SeedRow,
} from '../balance/aggregate.js';
import { diffAggregates, formatAggregateDiff } from '../balance/diff.js';
import { computeAggregateStamp } from '../balance/provenance.js';
import { main as reportMain } from '../balance/report-cli.js';
import {
  computeInstrumentFingerprint,
  computeRulesFingerprint,
  REPO_ROOT,
} from '../balance/rules-fingerprint.js';
import { main as sweepMain } from '../balance/sweep.js';

/** Every label this suite writes is prefixed, so it can never collide with a
 *  committed baseline — and every path below points BOTH `--out` and
 *  `--aggregate-out` at a mkdtemp directory, because `--aggregate-out` defaults
 *  to the committed `docs/balance/`. */
const LABEL_PREFIX = 't183';

/**
 * A handful of REAL rows. Deliberately tiny: the merge gate reports every rate
 * SKIPPED below its `minSample` and still exits 0, and nothing this suite asserts
 * is a distribution — the subject is the three keys beside the distributions.
 */
function sampleRows(days = 20): SeedRow[] {
  const rows: SeedRow[] = [];
  for (let seed = 1; seed <= 3; seed += 1) {
    for (const policy of ['trader', 'fighter'] as const) {
      rows.push(summarizeReport(runCampaign(seed, days, policy)));
    }
  }
  return rows;
}

type Writer = typeof process.stderr.write;
type WriteCallback = (error?: Error | null) => void;

/**
 * Run against a fresh temp directory with stdout AND stderr captured and
 * `process.exitCode` restored — the `sweep-gate.test.ts` harness, for its two
 * reasons: a leaked non-zero exit code would fail the whole vitest process, and
 * production-shaped `[gate]` / `[balance]` lines in the shared run log read as a
 * real sweep's output out of a suite that passed (F-162-5).
 */
function withTempDir<T>(run: (dir: string, output: () => string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'sq-t183-'));
  const previousExitCode = process.exitCode;
  const realErr: Writer = process.stderr.write.bind(process.stderr);
  const realOut: Writer = process.stdout.write.bind(process.stdout);
  const captured: string[] = [];
  const capture =
    (): Writer =>
    (
      chunk: Uint8Array | string,
      encodingOrDone?: BufferEncoding | WriteCallback,
      done?: WriteCallback,
    ): boolean => {
      captured.push(typeof chunk === 'string' ? chunk : String(chunk));
      const finish = typeof encodingOrDone === 'function' ? encodingOrDone : done;
      finish?.();
      return true;
    };
  process.stderr.write = capture();
  process.stdout.write = capture();

  let threw = true;
  try {
    const result = run(dir, () => captured.join(''));
    threw = false;
    return result;
  } finally {
    process.stderr.write = realErr;
    process.stdout.write = realOut;
    if (threw && captured.length > 0) realErr(captured.join(''));
    process.exitCode = previousExitCode;
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Write one shard file and merge it, returning the parsed aggregate. */
function mergeInto(dir: string, label: string, rows: readonly SeedRow[]): BaselineAggregate {
  writeFileSync(join(dir, `rows-${label}-shard1of1.json`), `${JSON.stringify(rows)}\n`, 'utf8');
  sweepMain(['--merge', '--label', label, '--out', dir, '--aggregate-out', dir]);
  return JSON.parse(readFileSync(join(dir, `baseline-${label}.json`), 'utf8')) as BaselineAggregate;
}

// ---------------------------------------------------------------------------
// A · The merge stamps, with the tree's own values
// ---------------------------------------------------------------------------

describe('T-183 · `sweep.ts --merge` stamps the aggregate at write time', () => {
  it('writes rulesFingerprint / instrumentFingerprint / gitCommit off THIS tree', () => {
    withTempDir((dir, output) => {
      const parsed = mergeInto(dir, `${LABEL_PREFIX}-stamped`, sampleRows());
      expect(process.exitCode ?? 0).toBe(0);

      expect(parsed.rulesFingerprint).toBe(computeRulesFingerprint(REPO_ROOT).fingerprint);
      expect(parsed.instrumentFingerprint).toBe(
        computeInstrumentFingerprint(REPO_ROOT).fingerprint,
      );
      // THE SHAPE IS ASSERTED EXPLICITLY, not only the equality. `headCommit`
      // answers 'unknown' when git cannot, and an `'unknown' === 'unknown'`
      // comparison would pass while proving nothing — the green-while-asserting-
      // nothing class `docs/LESSONS.md` names.
      expect(parsed.gitCommit).toMatch(/^[0-9a-f]{40}$/);
      expect(parsed.gitCommit).toBe(
        execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim(),
      );

      // The greppable stderr line a merge log carries, so provenance is visible
      // in CI output and not only inside the artefact.
      expect(output()).toContain(
        `[balance] stamped rules ${parsed.rulesFingerprint} / instrument ` +
          `${parsed.instrumentFingerprint} / commit ${parsed.gitCommit}`,
      );
    });
  }, 120_000);

  it('lands the stamps at the TOP of the JSON, and loses no other key', () => {
    withTempDir((dir) => {
      const parsed = mergeInto(dir, `${LABEL_PREFIX}-keys`, sampleRows());
      // Readable at the head of the file rather than behind a 400KB `byPolicy`
      // array — and a total key list, so a stamp cannot arrive by displacing a
      // measurement.
      expect(Object.keys(parsed)).toEqual([
        'label',
        'rulesFingerprint',
        'instrumentFingerprint',
        'gitCommit',
        'policies',
        'seeds',
        'days',
        'runs',
        'fleet',
        'byPolicy',
      ]);
    });
  }, 120_000);

  it('re-merging the same rows on the same tree is byte-identical', () => {
    // `mergeShards` promises this above its row sort; stamping must not have made
    // the merge depend on anything but the tree and the rows.
    withTempDir((dir) => {
      const rows = sampleRows();
      const label = `${LABEL_PREFIX}-determinism`;
      mergeInto(dir, label, rows);
      const first = readFileSync(join(dir, `baseline-${label}.json`), 'utf8');
      mergeInto(dir, label, rows);
      const second = readFileSync(join(dir, `baseline-${label}.json`), 'utf8');
      expect(second).toBe(first);
    });
  }, 120_000);
});

// ---------------------------------------------------------------------------
// B · The Accept criterion, through the real report CLI
// ---------------------------------------------------------------------------

describe('T-183 · a report over two freshly merged aggregates', () => {
  it('renders WITHOUT the RULESET UNKNOWN banner', () => {
    withTempDir((dir) => {
      const rows = sampleRows();
      mergeInto(dir, `${LABEL_PREFIX}-arm-a`, rows);
      mergeInto(dir, `${LABEL_PREFIX}-arm-b`, rows);

      // Through the CLI, not through `compareRulesets` alone: the criterion is
      // about the page a reader is handed.
      reportMain([
        '--aggregate',
        join(dir, `baseline-${LABEL_PREFIX}-arm-a.json`),
        '--compare-to',
        join(dir, `baseline-${LABEL_PREFIX}-arm-b.json`),
        '--out',
        dir,
        '--name',
        't183-report',
      ]);
      expect(process.exitCode ?? 0).toBe(0);

      const html = readFileSync(join(dir, 't183-report.html'), 'utf8');
      expect(html).not.toContain('RULESET UNKNOWN');
      expect(html).not.toContain('THESE TWO RUNS DESCRIBE DIFFERENT RULESETS');
      expect(html).toContain('Same ruleset on both sides');
      expect(html).toContain('Same instrument on both sides');
    });
  }, 180_000);

  it('still refuses to let UNKNOWN render as SAME when one side predates T-183', () => {
    // The one-sided case must not regress. `baseline-tour-one.json` was merged
    // before T-183 and is deliberately never rewritten.
    withTempDir((dir) => {
      mergeInto(dir, `${LABEL_PREFIX}-arm-new`, sampleRows());
      reportMain([
        '--aggregate',
        join(dir, `baseline-${LABEL_PREFIX}-arm-new.json`),
        '--compare-to',
        join(REPO_ROOT, 'docs', 'balance', 'baseline-tour-one.json'),
        '--out',
        dir,
        '--name',
        't183-mixed',
      ]);
      expect(process.exitCode ?? 0).toBe(0);

      const html = readFileSync(join(dir, 't183-mixed.html'), 'utf8');
      expect(html).toContain('RULESET UNKNOWN FOR ONE OR BOTH INPUTS');
      expect(html).not.toContain('Same ruleset on both sides');
    });
  }, 180_000);
});

// ---------------------------------------------------------------------------
// C · The instrument change is INERT
// ---------------------------------------------------------------------------

describe('T-183 · the instrument change moves no measurement', () => {
  const STAMP: AggregateStamp = {
    rulesFingerprint: 'aaaaaaaaaaaaaaaa',
    instrumentFingerprint: 'bbbbbbbbbbbbbbbb',
    gitCommit: 'c'.repeat(40),
  };

  it('an unstamped `aggregate()` is byte-identical to a stamped one minus the stamps', () => {
    // THE MACHINE-CHECKED FORM OF "no fold, no distribution and no policy was
    // touched" — which is why this task owes no capstone. Contrast T-199, which
    // re-took one for an instrument move because `sim/src/index.ts`'s POLICIES
    // changed and the numbers really moved. Here nothing a career does changes.
    const rows = sampleRows(12);
    const unstamped = aggregate('x', rows);
    const stamped = aggregate('x', rows, STAMP) as unknown as Record<string, unknown>;
    delete stamped.rulesFingerprint;
    delete stamped.instrumentFingerprint;
    delete stamped.gitCommit;
    expect(stamped).toEqual(unstamped);
    expect(JSON.stringify(stamped)).toBe(JSON.stringify(unstamped));
  }, 120_000);

  it('omitting the stamp leaves the keys ABSENT, not present-and-undefined', () => {
    // `JSON.stringify` erases the difference; `Object.keys`, the differ's flatten
    // and every shape test do not.
    const result = aggregate('x', sampleRows(12));
    expect('rulesFingerprint' in result).toBe(false);
    expect('instrumentFingerprint' in result).toBe(false);
    expect('gitCommit' in result).toBe(false);
  }, 120_000);

  it('a stamped and an unstamped aggregate over the same rows diff to NOTHING MOVED', () => {
    const rows = sampleRows(12);
    const diff = diffAggregates(aggregate('x', rows), aggregate('x', rows, STAMP));
    expect(diff.identical).toBe(true);
    expect(diff.shapeChanges).toEqual([]);
    expect(diff.movedRows).toEqual([]);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// D · The differ ignores the stamps but reports them
// ---------------------------------------------------------------------------

describe('T-183 · the differ treats a stamp as provenance, not as a measurement', () => {
  const rows = (): SeedRow[] => sampleRows(12);

  it('two DIFFERENT stamps over identical rows are still "nothing moved"', () => {
    const sample = rows();
    const before = aggregate('x', sample, {
      rulesFingerprint: 'aaaaaaaaaaaaaaaa',
      instrumentFingerprint: 'cccccccccccccccc',
      gitCommit: '1'.repeat(40),
    });
    const after = aggregate('x', sample, {
      rulesFingerprint: 'bbbbbbbbbbbbbbbb',
      instrumentFingerprint: 'dddddddddddddddd',
      gitCommit: '2'.repeat(40),
    });
    const diff = diffAggregates(before, after);
    expect(diff.identical).toBe(true);
    expect(diff.ignoredPaths).toEqual([
      'label',
      'rulesFingerprint',
      'instrumentFingerprint',
      'gitCommit',
    ]);
    // Ignored is not lost: the banner says the two sides are not the same ruleset,
    // which is exactly the fact the row table is now silent about.
    const printed = formatAggregateDiff(diff);
    expect(printed).toContain('DIFFERENT RULESETS: aaaaaaaaaaaaaaaa vs bbbbbbbbbbbbbbbb');
    expect(printed).toContain('DIFFERENT INSTRUMENTS: cccccccccccccccc vs dddddddddddddddd');
    expect(printed).toContain('NOTHING MOVED');
  }, 120_000);

  it('two matching stamps print SAME RULESET', () => {
    const sample = rows();
    const stamp = computeAggregateStamp(REPO_ROOT);
    const diff = diffAggregates(aggregate('x', sample, stamp), aggregate('y', sample, stamp));
    expect(diff.provenance).toMatchObject({ rules: 'same', instrument: 'same' });
    expect(formatAggregateDiff(diff)).toContain(`SAME RULESET: ${stamp.rulesFingerprint}`);
  }, 120_000);

  it('one stamped side and one unstamped side is UNKNOWN, never SAME', () => {
    const sample = rows();
    const diff = diffAggregates(
      aggregate('x', sample),
      aggregate('y', sample, computeAggregateStamp(REPO_ROOT)),
    );
    expect(diff.provenance).toMatchObject({ rules: 'unknown', instrument: 'unknown' });
    const printed = formatAggregateDiff(diff);
    expect(printed).toContain('RULESET UNKNOWN on one or both sides');
    expect(printed).not.toContain('SAME RULESET');
  }, 120_000);
});
