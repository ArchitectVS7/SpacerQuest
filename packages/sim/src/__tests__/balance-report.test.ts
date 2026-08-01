import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { BaselineAggregate } from '../balance/aggregate.js';
import { HEADLINE_METRICS } from '../balance/diff.js';
import { escapeHtml, renderReportHtml } from '../balance/report-html.js';
import {
  buildBeforeAfter,
  buildLeaderboard,
  buildPlaytestView,
  buildTraceView,
  compareRulesets,
  CONTRACT_AXIS_LABEL,
  LEADERBOARD_METRICS,
  leaderboardMetrics,
  parsePlaytestLog,
  parseTraceFileName,
  parseTraceLine,
  resolveInputProvenance,
  TRACE_ATTRIBUTION_CAVEAT,
  type InputProvenance,
  type ReportModel,
} from '../balance/report-model.js';
import { DEFAULT_OUT_DIR, main, parseReportArgs } from '../balance/report-cli.js';
import { REPO_ROOT } from '../balance/rules-fingerprint.js';
import {
  PLAYTEST_CSV_SAMPLE,
  PLAYTEST_JSONL_SAMPLE,
  TRACE_JSONL_SAMPLE,
} from './fixtures/telemetry-samples.js';

// ---------------------------------------------------------------------------
// T-142 · THE READER (constraint 7) for `../balance/report-model.ts`,
// `../balance/report-html.ts` and `../balance/report-cli.ts`.
//
// TWO KINDS OF TEST LIVE HERE AND THE SPLIT IS DELIBERATE:
//
//   1. FIXTURE MATH — the counting, sorting and escaping, checked against
//      verbatim real lines committed in `./fixtures/telemetry-samples.ts` and
//      independently re-counted here rather than taken from the code under test.
//   2. REAL ARTEFACTS — the leaderboard and before/after views run against
//      COMMITTED `docs/balance/baseline-*.json` files, so the shapes asserted are
//      the shapes the sweep actually writes, not a shape invented for a test.
//
// The live artefacts the fixtures were cut from (`.scratch/balance/…`) are
// gitignored and are NEVER read here: a test that read them would pass on the
// machine that produced them and fail on every clean clone.
// ---------------------------------------------------------------------------

const DOCS_BALANCE = join(REPO_ROOT, 'docs', 'balance');

function loadAggregate(name: string): { raw: string; parsed: BaselineAggregate } {
  const raw = readFileSync(join(DOCS_BALANCE, name), 'utf8');
  return { raw, parsed: JSON.parse(raw) as BaselineAggregate };
}

function provenanceFor(name: string): {
  aggregate: BaselineAggregate;
  provenance: InputProvenance;
} {
  const { raw, parsed } = loadAggregate(name);
  return {
    aggregate: parsed,
    provenance: resolveInputProvenance(`docs/balance/${name}`, raw, parsed),
  };
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return Object.freeze(value);
}

function traceSource(text = TRACE_JSONL_SAMPLE) {
  return [
    {
      path: '.scratch/balance/traces-t140-trace-shard1of1.jsonl',
      name: 'traces-t140-trace-shard1of1.jsonl',
      text,
    },
  ];
}

// ---------------------------------------------------------------------------
// 1 · The leaderboard, over a real committed aggregate
// ---------------------------------------------------------------------------

describe('T-142 · leaderboard over a real committed aggregate', () => {
  const { aggregate, provenance } = provenanceFor('baseline-n11-shipped.json');

  it('renders one chart per metric and one bar per policy, sorted descending', () => {
    const view = buildLeaderboard(aggregate, provenance);
    expect(view.charts).toHaveLength(LEADERBOARD_METRICS.length);
    for (const chart of view.charts) {
      expect(chart.bars).toHaveLength(aggregate.byPolicy.length);
      expect(chart.bars.map((bar) => bar.policy).sort()).toEqual([...aggregate.policies].sort());
      // `fleet` is the union row and is NEVER a bar — it is the reference line.
      expect(chart.bars.some((bar) => bar.policy === 'fleet')).toBe(false);
      const values = chart.bars
        .map((bar) => bar.value)
        .filter((value): value is number => value !== null);
      expect([...values].sort((a, b) => b - a)).toEqual(values);
    }
  });

  it('orders its metrics by the differ’s HEADLINE_METRICS rather than a second list', () => {
    const ordered = leaderboardMetrics().map((metric) => metric.path);
    const ranks = ordered
      .map((path) => HEADLINE_METRICS.indexOf(path))
      .filter((index) => index !== -1);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    // And every leaderboard metric that IS a headline metric comes before every
    // one that is not.
    const firstNonHeadline = ordered.findIndex((path) => HEADLINE_METRICS.indexOf(path) === -1);
    if (firstNonHeadline !== -1) {
      expect(
        ordered.slice(firstNonHeadline).every((path) => HEADLINE_METRICS.indexOf(path) === -1),
      ).toBe(true);
    }
  });

  it('carries the sample behind every bar, and spot-checks the numbers', () => {
    const view = buildLeaderboard(aggregate, provenance);
    const credits = view.charts.find((chart) => chart.metric.path === 'finalCredits.median');
    expect(credits).toBeDefined();
    for (const bar of credits!.bars) {
      const source = aggregate.byPolicy.find((row) => row.policy === bar.policy)!;
      expect(bar.runs).toBe(source.runs);
      expect(bar.n).toBe(source.finalCredits.n);
      expect(bar.value).toBe(source.finalCredits.median);
    }
    expect(credits!.fleetValue).toBe(aggregate.fleet.finalCredits.median);
    expect(credits!.fleetRuns).toBe(aggregate.fleet.runs);

    const clearDay = view.charts.find((chart) => chart.metric.path === 'debtClearedDay.median')!;
    for (const bar of clearDay.bars) {
      const source = aggregate.byPolicy.find((row) => row.policy === bar.policy)!;
      expect(bar.n).toBe(source.debtClearedDay.n);
      // A distribution with no sample is an explicit absence, never a 0 bar.
      if (source.debtClearedDay.n === 0) expect(bar.value).toBeNull();
      else expect(bar.value).toBe(source.debtClearedDay.median);
    }

    const routesLost = view.charts.find((chart) => chart.metric.path === 'routesLost')!;
    // A scalar metric has no `n` of its own; the row's `runs` is its sample.
    expect(routesLost.bars.every((bar) => bar.n === null)).toBe(true);
  });

  it('renders "no sample" rather than a zero-height bar when n is 0', () => {
    const synthetic = JSON.parse(JSON.stringify(aggregate)) as BaselineAggregate;
    synthetic.byPolicy[0].debtClearedDay = { ...synthetic.byPolicy[0].debtClearedDay, n: 0 };
    const view = buildLeaderboard(synthetic, provenance);
    const chart = view.charts.find((c) => c.metric.path === 'debtClearedDay.median')!;
    const bar = chart.bars.find((b) => b.policy === synthetic.byPolicy[0].policy)!;
    expect(bar.value).toBeNull();
    expect(bar.absence).toContain('no sample');
    expect(
      renderReportHtml(
        {
          name: 'x',
          leaderboard: view,
          beforeAfter: null,
          traces: null,
          playtest: null,
          generator: null,
        },
        { generatedAt: 'T' },
      ),
    ).toContain('no sample');
  });
});

// ---------------------------------------------------------------------------
// 2 · Read-only in the pure half
// ---------------------------------------------------------------------------

describe('T-142 · the model builders never mutate their input', () => {
  it('builds a leaderboard from a deeply frozen aggregate', () => {
    const { raw, parsed } = loadAggregate('baseline-n11-shipped.json');
    const frozen = deepFreeze(parsed);
    const provenance = resolveInputProvenance(
      'docs/balance/baseline-n11-shipped.json',
      raw,
      frozen,
    );
    expect(() => buildLeaderboard(frozen, provenance)).not.toThrow();
    // Mechanical proof: the object is byte-identical to a fresh parse afterwards.
    expect(frozen).toEqual(JSON.parse(raw) as BaselineAggregate);
  });

  it('builds a before/after from two deeply frozen aggregates', () => {
    const before = loadAggregate('baseline-tour-one.json');
    const after = loadAggregate('baseline-t150-postfix.json');
    const frozenBefore = deepFreeze(before.parsed);
    const frozenAfter = deepFreeze(after.parsed);
    expect(() =>
      buildBeforeAfter(
        frozenBefore,
        frozenAfter,
        resolveInputProvenance('a', before.raw, frozenBefore),
        resolveInputProvenance('b', after.raw, frozenAfter),
      ),
    ).not.toThrow();
    expect(frozenBefore).toEqual(JSON.parse(before.raw) as BaselineAggregate);
    expect(frozenAfter).toEqual(JSON.parse(after.raw) as BaselineAggregate);
  });
});

// ---------------------------------------------------------------------------
// 3 · Option frequency over real trace lines
// ---------------------------------------------------------------------------

describe('T-142 · option frequency over real T-140 traces', () => {
  const view = buildTraceView(traceSource());

  it('counts exactly the lines in the sample', () => {
    const lines = TRACE_JSONL_SAMPLE.split('\n').filter((line) => line.trim() !== '');
    expect(view.files[0].lines).toBe(lines.length);
    expect(view.files[0].parsed).toBe(lines.length);
    expect(view.files[0].skipped).toBe(0);
    expect(view.totalDecisions).toBe(lines.length);
  });

  it('parses the sweep label and shard out of the file name', () => {
    expect(parseTraceFileName('traces-t140-trace-shard1of1.jsonl')).toEqual({
      sweepLabel: 't140-trace',
      shard: '1of1',
    });
    expect(parseTraceFileName('not-a-trace.jsonl')).toBeNull();
    expect(view.files[0].sweepLabel).toBe('t140-trace');
    expect(view.files[0].shard).toBe('1of1');
  });

  it('matches an independent count of chosen / offered / appearances', () => {
    // Counted here from the fixture text, NOT from the code under test.
    const expected = new Map<string, { chosen: number; offered: number; appearances: number }>();
    let decisions = 0;
    for (const line of TRACE_JSONL_SAMPLE.split('\n')) {
      if (line.trim() === '') continue;
      const trace = JSON.parse(line) as {
        kind: string;
        archetype: string;
        chosen: string;
        candidates: { option: string; weight: number }[];
      };
      if (trace.kind !== 'intent' || trace.archetype !== 'veteran') continue;
      decisions += 1;
      const touch = (option: string) => {
        const current = expected.get(option) ?? { chosen: 0, offered: 0, appearances: 0 };
        expected.set(option, current);
        return current;
      };
      for (const candidate of trace.candidates) {
        const bucket = touch(candidate.option);
        bucket.appearances += 1;
        if (candidate.weight > 0) bucket.offered += 1;
      }
      touch(trace.chosen).chosen += 1;
    }
    const group = view.groups.find((entry) => entry.key === 'intent · veteran')!;
    expect(group.decisions).toBe(decisions);
    for (const bar of group.bars) {
      expect({ chosen: bar.chosen, offered: bar.offered, appearances: bar.appearances }).toEqual(
        expected.get(bar.option),
      );
    }
  });

  it('separates reach from preference: weight-0 candidates appear but are not offered', () => {
    const group = view.groups.find((entry) => entry.key === 'intent · veteran')!;
    const unreachable = group.bars.filter((bar) => bar.appearances > bar.offered);
    expect(unreachable.length).toBeGreaterThan(0);
    // And the preference case exists too: offered far more often than chosen.
    expect(group.bars.some((bar) => bar.offered > bar.chosen)).toBe(true);
    // A never-reachable option has no share rather than a fabricated 0%.
    for (const bar of group.bars) {
      if (bar.offered === 0) expect(bar.share).toBeNull();
      else expect(bar.share).toBeCloseTo(bar.chosen / bar.offered, 10);
    }
  });

  it('labels contract options as board indices (F-140-2) and files the F-140-1 caveat', () => {
    const contract = view.groups.find((entry) => entry.kind === 'contract')!;
    expect(contract.axisLabel).toBe(CONTRACT_AXIS_LABEL);
    expect(contract.axisLabel).toContain('board index');
    expect(contract.axisLabel).toContain('F-140-2');
    expect(view.caveats).toContain(TRACE_ATTRIBUTION_CAVEAT);
    expect(TRACE_ATTRIBUTION_CAVEAT).toContain('F-140-1');
  });

  it('reports unparseable lines rather than swallowing them', () => {
    const damaged = buildTraceView(traceSource(`${TRACE_JSONL_SAMPLE}{"day":1,"kind":"int`));
    expect(damaged.files[0].skipped).toBe(1);
    expect(damaged.caveats.some((line) => line.includes('not decision traces'))).toBe(true);
    expect(parseTraceLine('nonsense')).toBeNull();
    expect(parseTraceLine('{"kind":"weather"}')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4 · Option frequency over a real T-141 export
// ---------------------------------------------------------------------------

describe('T-142 · option frequency over a real T-141 export', () => {
  const jsonl = buildPlaytestView([
    {
      path: '.scratch/balance/playtest-t142.jsonl',
      name: 'playtest-t142.jsonl',
      text: PLAYTEST_JSONL_SAMPLE,
    },
  ]);
  const csv = buildPlaytestView([
    {
      path: '.scratch/balance/playtest-t142.csv',
      name: 'playtest-t142.csv',
      text: PLAYTEST_CSV_SAMPLE,
    },
  ]);

  it('counts one bar per PlayerAction type, from an independent count', () => {
    const expected = new Map<string, number>();
    for (const line of PLAYTEST_JSONL_SAMPLE.split('\n')) {
      if (line.trim() === '') continue;
      const entry = JSON.parse(line) as { kind: string; action?: { type: string } };
      if (entry.kind !== 'action') continue;
      const type = entry.action!.type;
      expected.set(type, (expected.get(type) ?? 0) + 1);
    }
    expect(new Map(jsonl.bars.map((bar) => [bar.option, bar.count]))).toEqual(expected);
    expect(jsonl.actionEntries).toBe([...expected.values()].reduce((a, b) => a + b, 0));
  });

  it('excludes annotations and errors from the bars and reports them separately', () => {
    expect(jsonl.annotationEntries).toBe(1);
    expect(jsonl.errorEntries).toBe(1);
    expect(jsonl.bars.some((bar) => bar.option === 'annotation' || bar.option === 'error')).toBe(
      false,
    );
    expect(jsonl.actionEntries + jsonl.annotationEntries + jsonl.errorEntries).toBe(
      PLAYTEST_JSONL_SAMPLE.split('\n').filter((line) => line.trim() !== '').length,
    );
  });

  it('reads the CSV flattening to the SAME action counts as the JSONL', () => {
    expect(csv.files[0].format).toBe('csv');
    expect(csv.bars).toEqual(jsonl.bars);
    expect(csv.actionEntries).toBe(jsonl.actionEntries);
    expect(csv.annotationEntries).toBe(jsonl.annotationEntries);
    expect(csv.errorEntries).toBe(jsonl.errorEntries);
  });

  it('accepts a whole-file JSON array as well as JSONL', () => {
    const entries = PLAYTEST_JSONL_SAMPLE.split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as unknown);
    const asArray = parsePlaytestLog(JSON.stringify(entries), 'log.json');
    expect(asArray.format).toBe('json');
    expect(asArray.entries).toHaveLength(entries.length);
  });

  it('throws loudly on a CSV whose header is not the playtest export header', () => {
    expect(() => parsePlaytestLog('a,b,c\n1,2,3\n', 'weird.csv')).toThrow(
      /Not a playtest CSV export/,
    );
  });
});

// ---------------------------------------------------------------------------
// 5 · Before/after carries the sample sizes
// ---------------------------------------------------------------------------

describe('T-142 · before/after never shows a bare delta', () => {
  const before = provenanceFor('baseline-tour-one.json');
  const after = provenanceFor('baseline-t150-postfix.json');
  const view = buildBeforeAfter(
    before.aggregate,
    after.aggregate,
    before.provenance,
    after.provenance,
  );

  it('is a genuinely different-width pair', () => {
    expect(before.aggregate.seeds).toBe(500);
    expect(after.aggregate.seeds).toBe(1000);
    expect(before.aggregate.policies).toHaveLength(7);
    expect(after.aggregate.policies).toHaveLength(8);
    expect(view.seedsDiffer).toBe(true);
  });

  it('exposes both seed counts, both run counts and both n on EVERY row', () => {
    expect(view.rows.length).toBeGreaterThan(0);
    for (const row of view.rows) {
      expect(typeof row.beforeSeeds).toBe('number');
      expect(typeof row.afterSeeds).toBe('number');
      expect(typeof row.beforeRuns).toBe('number');
      expect(typeof row.afterRuns).toBe('number');
      expect(row.beforeSeeds).toBe(before.aggregate.seeds);
      expect(row.afterSeeds).toBe(after.aggregate.seeds);
      expect(row.sampleWarning).not.toBeNull();
      expect(row.sampleWarning).toContain('seed counts differ');
    }
  });

  it('surfaces shape changes in their own block rather than as "unchanged"', () => {
    // The 8th policy exists only on the after side.
    expect(view.shapeChanges.length).toBeGreaterThan(0);
    expect(view.shapeChangeRows).toContain('trader-degraded');
    expect(view.unchangedRows).not.toContain('trader-degraded');
  });

  it('renders both seed counts inside the same row markup as the delta', () => {
    const html = renderReportHtml(
      {
        name: 'pair',
        leaderboard: buildLeaderboard(after.aggregate, after.provenance),
        beforeAfter: view,
        traces: null,
        playtest: null,
        generator: null,
      },
      { generatedAt: '2026-08-01T00:00:00.000Z' },
    );
    const blocks = html.match(/<div class="ba-row">[\s\S]*?<\/div><\/div>/g) ?? [];
    expect(blocks.length).toBe(view.rows.length);
    for (const block of blocks) {
      expect(block).toMatch(/class="ba-delta">delta /);
      expect(block).toMatch(/before: 500 seeds/);
      expect(block).toMatch(/after: 1,000 seeds/);
    }
    // The sample caution is labelled as a display heuristic, never as a band.
    expect(html).toContain('a display heuristic, not a governed balance band');
    expect(html).toContain('Appendix A');
  });

  it('preserves the differ’s "no measured value moved" distinction', () => {
    const same = provenanceFor('baseline-n11-shipped.json');
    const identical = buildBeforeAfter(
      same.aggregate,
      same.aggregate,
      same.provenance,
      same.provenance,
    );
    expect(identical.identical).toBe(true);
    expect(identical.noMeasuredValueMoved).toBe(false);
    expect(view.identical).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6 · The ruleset banner, in all three states
// ---------------------------------------------------------------------------

describe('T-142 · the ruleset banner', () => {
  const stamped = (rules: string, instrument: string): InputProvenance => ({
    path: 'x.json',
    bytes: 1,
    sha256short: '0'.repeat(16),
    rulesFingerprint: rules,
    instrumentFingerprint: instrument,
  });

  const render = (before: InputProvenance, after: InputProvenance): string => {
    const beforeAggregate = provenanceFor('baseline-tour-one.json');
    const afterAggregate = provenanceFor('baseline-t150-postfix.json');
    const model: ReportModel = {
      name: 'banner',
      leaderboard: buildLeaderboard(afterAggregate.aggregate, after),
      beforeAfter: buildBeforeAfter(
        beforeAggregate.aggregate,
        afterAggregate.aggregate,
        before,
        after,
      ),
      traces: null,
      playtest: null,
      generator: null,
    };
    return renderReportHtml(model, { generatedAt: 'T' });
  };

  it('says SAME quietly when both stamps match', () => {
    const provenance = stamped('f36d71f863a8ebe7', 'd50b03a8ca4323d8');
    expect(compareRulesets(provenance, provenance)).toMatchObject({
      rules: 'same',
      instrument: 'same',
    });
    const html = render(provenance, provenance);
    expect(html).toContain('Same ruleset on both sides');
    expect(html).not.toContain('DIFFERENT RULESETS');
    expect(html).not.toContain('RULESET UNKNOWN');
  });

  it('says DIFFERENT loudly when the rules fingerprints differ', () => {
    const before = stamped('aaaaaaaaaaaaaaaa', 'd50b03a8ca4323d8');
    const after = stamped('bbbbbbbbbbbbbbbb', 'd50b03a8ca4323d8');
    expect(compareRulesets(before, after).rules).toBe('different');
    const html = render(before, after);
    expect(html).toContain('THESE TWO RUNS DESCRIBE DIFFERENT RULESETS');
    expect(html).toContain('aaaaaaaaaaaaaaaa');
    expect(html).toContain('bbbbbbbbbbbbbbbb');
    expect(html).toContain('NOT a same-ruleset diff');
  });

  it('flags a different INSTRUMENT as its own finding', () => {
    const before = stamped('f36d71f863a8ebe7', 'aaaaaaaaaaaaaaaa');
    const after = stamped('f36d71f863a8ebe7', 'bbbbbbbbbbbbbbbb');
    expect(compareRulesets(before, after)).toMatchObject({
      rules: 'same',
      instrument: 'different',
    });
    expect(render(before, after)).toContain('DIFFERENT INSTRUMENT VERSIONS');
  });

  it('never lets UNKNOWN render as SAME — which is what real aggregates produce', () => {
    const before = provenanceFor('baseline-tour-one.json');
    const after = provenanceFor('baseline-t150-postfix.json');
    // F-142-1, asserted rather than assumed: a committed aggregate carries no stamp.
    expect(before.provenance.rulesFingerprint).toBeUndefined();
    expect(after.provenance.rulesFingerprint).toBeUndefined();
    expect(compareRulesets(before.provenance, after.provenance)).toMatchObject({
      rules: 'unknown',
      instrument: 'unknown',
    });
    const html = render(before.provenance, after.provenance);
    expect(html).toContain('RULESET UNKNOWN FOR ONE OR BOTH INPUTS');
    expect(html).toContain('F-142-1');
    expect(html).not.toContain('Same ruleset on both sides');
  });

  it('attributes a sidecar-declared stamp to the sidecar, never to the aggregate', () => {
    const { raw, parsed } = loadAggregate('baseline-t150-postfix.json');
    const sidecarRaw = readFileSync(join(DOCS_BALANCE, 'smoke', 'tiers.json'), 'utf8');
    const provenance = resolveInputProvenance('docs/balance/x.json', raw, parsed, {
      path: 'docs/balance/smoke/tiers.json',
      parsed: JSON.parse(sidecarRaw) as unknown,
    });
    expect(provenance.rulesFingerprint).toBe('f36d71f863a8ebe7');
    expect(provenance.declaredBy).toBe('docs/balance/smoke/tiers.json');
    const html = render(provenance, provenance);
    expect(html).toContain('declared by');
    expect(html).toContain('NOT by the aggregate itself');
  });

  it('reads stamps off the aggregate itself in preference to a sidecar', () => {
    const provenance = resolveInputProvenance(
      'x.json',
      '{}',
      { rulesFingerprint: 'own0000000000000' },
      { path: 'sidecar.json', parsed: { rulesFingerprint: 'sidecar000000000' } },
    );
    expect(provenance.rulesFingerprint).toBe('own0000000000000');
    expect(provenance.declaredBy).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7 · Self-containment and escaping
// ---------------------------------------------------------------------------

describe('T-142 · the page is self-contained', () => {
  const { aggregate, provenance } = provenanceFor('baseline-n11-shipped.json');
  const model: ReportModel = {
    name: 'self-contained',
    leaderboard: buildLeaderboard(aggregate, provenance),
    beforeAfter: null,
    traces: buildTraceView(traceSource()),
    playtest: buildPlaytestView([
      { path: 'log.jsonl', name: 'log.jsonl', text: PLAYTEST_JSONL_SAMPLE },
    ]),
    generator: { rulesFingerprint: 'f36d71f863a8ebe7', instrumentFingerprint: 'd50b03a8ca4323d8' },
  };
  const html = renderReportHtml(model, { generatedAt: '2026-08-01T00:00:00.000Z' });

  it('reaches no network and loads no external asset', () => {
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/@import/);
    expect(html).not.toMatch(/url\(/i);
    expect(html).toContain('<svg');
    expect(html).toContain('<style>');
  });

  it('renders all three views and both themes', () => {
    expect(html).toContain('id="leaderboard"');
    expect(html).toContain('id="option-frequency"');
    expect(html).toContain('@media (prefers-color-scheme:dark)');
    expect(html).toContain('[data-theme="dark"]');
  });

  it('labels the generator fingerprints as the GENERATOR tree, not an input', () => {
    expect(html).toContain('NOT the ruleset of any input above');
    expect(html).toContain('f36d71f863a8ebe7');
  });

  it('escapes every interpolated string', () => {
    const hostile = '<script>alert(1)</script>&"';
    expect(escapeHtml(hostile)).toBe('&lt;script&gt;alert(1)&lt;/script&gt;&amp;&quot;');
    const poisoned = JSON.parse(JSON.stringify(aggregate)) as BaselineAggregate;
    poisoned.label = hostile;
    poisoned.byPolicy[0].policy = hostile;
    poisoned.policies[0] = hostile;
    const rendered = renderReportHtml(
      {
        name: hostile,
        leaderboard: buildLeaderboard(poisoned, { ...provenance, path: hostile }),
        beforeAfter: null,
        traces: null,
        playtest: null,
        generator: null,
      },
      { generatedAt: 'T' },
    );
    expect(rendered).not.toContain('<script>alert(1)</script>');
    expect(rendered).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('embeds only the aggregated view model, never the raw rows', () => {
    // 22,357 trace lines reduce to counts before they reach the page. The sample
    // here is 20 lines; the assertion is that no npcId (a per-line field the view
    // model never carries) survives into the markup.
    expect(html).not.toContain('npc-the-warden');
    expect(html.length).toBeLessThan(400_000);
  });
});

describe('T-142 · rendering is deterministic', () => {
  it('renders byte-identically twice for the same model and timestamp', () => {
    const { aggregate, provenance } = provenanceFor('baseline-n11-shipped.json');
    const model: ReportModel = {
      name: 'determinism',
      leaderboard: buildLeaderboard(aggregate, provenance),
      beforeAfter: null,
      traces: buildTraceView(traceSource()),
      playtest: null,
      generator: null,
    };
    const first = renderReportHtml(model, { generatedAt: '2026-08-01T00:00:00.000Z' });
    const second = renderReportHtml(model, { generatedAt: '2026-08-01T00:00:00.000Z' });
    expect(first).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// 9 · The CLI's argv discipline, and where it writes
// ---------------------------------------------------------------------------

describe('T-142 · the report CLI', () => {
  it('throws on an unknown flag and on a missing value', () => {
    expect(() => parseReportArgs(['--aggregate', 'a.json', '--nope'])).toThrow(/Unknown argument/);
    expect(() => parseReportArgs(['--aggregate'])).toThrow(/--aggregate requires a value/);
    expect(() => parseReportArgs(['--aggregate', 'a.json', '--out'])).toThrow(
      /--out requires a value/,
    );
    expect(() => parseReportArgs(['stray-positional'])).toThrow(/Unknown argument/);
    expect(() => parseReportArgs([])).toThrow(/--aggregate is required/);
    expect(parseReportArgs(['--help'])).toEqual({ help: true });
  });

  it('defaults its output under the already-gitignored .scratch/', () => {
    expect(DEFAULT_OUT_DIR.split(/[\\/]/)[0]).toBe('.scratch');
    const gitignore = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8');
    expect(
      gitignore
        .split('\n')
        .some((line) => line.trim() === '.scratch/' || line.trim() === '.scratch'),
    ).toBe(true);
    const parsed = parseReportArgs(['--aggregate', 'docs/balance/baseline-n11-shipped.json']);
    expect('help' in parsed).toBe(false);
    if (!('help' in parsed)) {
      expect(parsed.outDir.split(/[\\/]/).includes('.scratch')).toBe(true);
    }
  });

  it('runs end to end without modifying a single input', () => {
    const inputs = [
      join(DOCS_BALANCE, 'baseline-t150-postfix.json'),
      join(DOCS_BALANCE, 'baseline-tour-one.json'),
      join(DOCS_BALANCE, 'smoke', 'tiers.json'),
    ];
    const digest = (path: string): string =>
      createHash('sha256').update(readFileSync(path)).digest('hex');
    const before = inputs.map(digest);
    const beforeMtimes = inputs.map((path) => statSync(path).mtimeMs);

    const outDir = mkdtempSync(join(tmpdir(), 'sq-report-'));
    try {
      main([
        '--aggregate',
        'docs/balance/baseline-t150-postfix.json',
        '--compare-to',
        'docs/balance/baseline-tour-one.json',
        '--provenance',
        'docs/balance/smoke/tiers.json',
        '--out',
        outDir,
        '--name',
        'e2e',
      ]);
      expect(process.exitCode ?? 0).toBe(0);
      const written = readdirSync(outDir);
      expect(written).toEqual(['e2e.html']);
      const html = readFileSync(join(outDir, 'e2e.html'), 'utf8');
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toContain('id="leaderboard"');
      expect(html).toContain('id="before-after"');
      expect(html).toContain('0 · Provenance');
      // The sidecar stamped the AFTER side only, so the pair is still unknown.
      expect(html).toContain('RULESET UNKNOWN FOR ONE OR BOTH INPUTS');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }

    expect(inputs.map(digest)).toEqual(before);
    expect(inputs.map((path) => statSync(path).mtimeMs)).toEqual(beforeMtimes);
  });
});
