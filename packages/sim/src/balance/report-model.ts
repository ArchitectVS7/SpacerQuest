/**
 * T-142 · THE TIER 1 TELEMETRY REPORT — the PURE half.
 *
 * `docs/TELEMETRY-REPORT_SPEC.md` §1 asks for three views over artefacts this
 * repository already produces: a per-archetype leaderboard off a committed
 * `BaselineAggregate`, an option-frequency chart off T-140's NPC decision traces
 * and T-141's playtest exports, and a before/after diff of two aggregates. This
 * file turns bytes into VIEW MODELS — counts, sorted bars, sample sizes,
 * provenance. `./report-html.ts` renders them; `./report-cli.ts` owns argv and
 * the filesystem. That is the T-1602b pure/IO split `./aggregate.ts` and
 * `./sweep.ts` already follow, and it is what keeps every test in
 * `../__tests__/balance-report.test.ts` filesystem-free.
 *
 * THIS FILE IMPORTS NO `node:fs` AND READS NO CLOCK. `node:crypto` is used for
 * one content hash of a string the caller already read; it performs no I/O and
 * is deterministic, so the pure half stays snapshot-testable.
 *
 * WHY IT IS NOT AN INSTRUMENT (`./rules-fingerprint.ts`'s classification): it
 * reads finished artefacts and reports on them, exactly as `./diff.ts` does. It
 * cannot produce a number. See `SIM_NON_INSTRUMENT_SOURCES` for the entry.
 *
 * F-142-1, FILED HERE BECAUSE THIS IS WHERE IT BITES. Spec §3 says an aggregate
 * "already carries" its `rulesFingerprint`/`gitCommit` "via the smoke/capstone
 * convention". It does not: `BaselineAggregate` has seven top-level keys
 * (`label, policies, seeds, days, runs, fleet, byPolicy`) and every committed
 * `docs/balance/baseline-*.json` carries only those. The fingerprints live on the
 * smoke FIXTURE (`docs/balance/smoke/tiers.json`), a different artefact. Per spec
 * §6 that is REPORTED, not quietly fixed by adding a field to `aggregate.ts` —
 * so {@link resolveInputProvenance} reads the stamps off a superset shape (it
 * will pick them up for free the day a sweep writes them), accepts an explicit
 * sidecar, and otherwise answers `unknown`. {@link compareRulesets} then refuses
 * to let `unknown` render as `same`.
 *
 * READERS (constraint 7): `./report-html.ts`, `./report-cli.ts`, and
 * `../__tests__/balance-report.test.ts`.
 */

import { createHash } from 'node:crypto';

import type { BaselineAggregate, PolicyAggregate } from './aggregate.js';
import { diffAggregates, HEADLINE_METRICS, type ShapeChange } from './diff.js';

// ---------------------------------------------------------------------------
// Provenance (spec §3)
// ---------------------------------------------------------------------------

/** A three-state verdict. `unknown` is a state of its own and MUST NEVER render
 *  as `same` — an unstamped pair is not a matching pair, it is an unanswered
 *  question, and today (F-142-1) every committed aggregate is unstamped. */
export type RulesetVerdict = 'same' | 'different' | 'unknown';

/**
 * What a report can honestly say about one input file.
 *
 * `path`/`bytes`/`sha256short` are always knowable — they describe the FILE. The
 * rest are read off the parsed JSON if it happens to carry them, or off an
 * explicit sidecar, and are `undefined` otherwise. `declaredBy` records the
 * sidecar so a hand-supplied stamp can never masquerade as intrinsic: the page
 * prints "declared by <file>, not by the aggregate" beside it.
 */
export interface InputProvenance {
  /** Repo-relative where possible; the caller decides, this module only prints. */
  path: string;
  bytes: number;
  sha256short: string;
  label?: string;
  seeds?: number;
  days?: number;
  runs?: number;
  policies?: number;
  productVersion?: string;
  saveSchemaVersion?: number;
  rulesFingerprint?: string;
  instrumentFingerprint?: string;
  gitCommit?: string;
  /** Set when the stamps above came from a sidecar rather than the file itself. */
  declaredBy?: string;
}

/** The superset shape a stamped aggregate WOULD have. Nothing writes it today;
 *  reading it costs nothing and makes F-142-1 a finding instead of a blocker. */
interface StampedMaybe {
  label?: unknown;
  seeds?: unknown;
  days?: unknown;
  runs?: unknown;
  policies?: unknown;
  productVersion?: unknown;
  saveSchemaVersion?: unknown;
  rulesFingerprint?: unknown;
  instrumentFingerprint?: unknown;
  gitCommit?: unknown;
  provenance?: { gitCommit?: unknown; sweepLabel?: unknown; seeds?: unknown; days?: unknown };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** 16 hex chars, the same width as a `SourceFingerprint` — long enough that a
 *  collision is not a practical concern, short enough to read in a table. */
export function shortHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/**
 * Build one input's provenance row.
 *
 * `sidecar` is an OPTIONAL second JSON (`--provenance <file>`) carrying real
 * stamps — `docs/balance/smoke/tiers.json` is the one that exists, and it names
 * its own `provenance.sweepLabel` so a reader can check the tie by eye. Sidecar
 * stamps NEVER overwrite stamps found on the file itself; a file that speaks for
 * itself is always believed first.
 */
export function resolveInputProvenance(
  path: string,
  raw: string,
  parsed: unknown,
  sidecar?: { path: string; parsed: unknown },
): InputProvenance {
  const own = (parsed ?? {}) as StampedMaybe;
  const provenance: InputProvenance = {
    path,
    bytes: Buffer.byteLength(raw, 'utf8'),
    sha256short: shortHash(raw),
    label: asString(own.label),
    seeds: asNumber(own.seeds),
    days: asNumber(own.days),
    runs: asNumber(own.runs),
    policies: Array.isArray(own.policies) ? own.policies.length : undefined,
    productVersion: asString(own.productVersion),
    saveSchemaVersion: asNumber(own.saveSchemaVersion),
    rulesFingerprint: asString(own.rulesFingerprint),
    instrumentFingerprint: asString(own.instrumentFingerprint),
    gitCommit: asString(own.provenance?.gitCommit) ?? asString(own.gitCommit),
  };
  if (sidecar) {
    const declared = (sidecar.parsed ?? {}) as StampedMaybe;
    let used = false;
    if (provenance.rulesFingerprint === undefined) {
      provenance.rulesFingerprint = asString(declared.rulesFingerprint);
      used ||= provenance.rulesFingerprint !== undefined;
    }
    if (provenance.instrumentFingerprint === undefined) {
      provenance.instrumentFingerprint = asString(declared.instrumentFingerprint);
      used ||= provenance.instrumentFingerprint !== undefined;
    }
    if (provenance.productVersion === undefined) {
      provenance.productVersion = asString(declared.productVersion);
      used ||= provenance.productVersion !== undefined;
    }
    if (provenance.saveSchemaVersion === undefined) {
      provenance.saveSchemaVersion = asNumber(declared.saveSchemaVersion);
      used ||= provenance.saveSchemaVersion !== undefined;
    }
    if (provenance.gitCommit === undefined) {
      provenance.gitCommit = asString(declared.provenance?.gitCommit);
      used ||= provenance.gitCommit !== undefined;
    }
    if (used) provenance.declaredBy = sidecar.path;
  }
  return provenance;
}

/** Compare one stamp across two inputs. Absent on EITHER side ⇒ `unknown`. */
export function compareStamp(before?: string, after?: string): RulesetVerdict {
  if (before === undefined || after === undefined) return 'unknown';
  return before === after ? 'same' : 'different';
}

export interface RulesetComparison {
  rules: RulesetVerdict;
  instrument: RulesetVerdict;
  beforeRules?: string;
  afterRules?: string;
  beforeInstrument?: string;
  afterInstrument?: string;
}

/**
 * Spec §3's sharpest requirement: "A report describing two aggregates with
 * DIFFERENT `rulesFingerprint`s must say so visibly on the page."
 *
 * The instrument hash is compared on the same three states and for the reason
 * `docs/balance/smoke/README.md` gives: an instrument change invalidates a
 * measurement just as thoroughly as a rules change, it just invalidates it for a
 * different reason, and the two call for different responses.
 */
export function compareRulesets(
  before: InputProvenance,
  after: InputProvenance,
): RulesetComparison {
  return {
    rules: compareStamp(before.rulesFingerprint, after.rulesFingerprint),
    instrument: compareStamp(before.instrumentFingerprint, after.instrumentFingerprint),
    beforeRules: before.rulesFingerprint,
    afterRules: after.rulesFingerprint,
    beforeInstrument: before.instrumentFingerprint,
    afterInstrument: after.instrumentFingerprint,
  };
}

// ---------------------------------------------------------------------------
// View 1 — the per-archetype leaderboard (spec §1.1)
// ---------------------------------------------------------------------------

export type MetricFormat = 'credits' | 'rate' | 'days' | 'count';

export interface MetricSpec {
  /** A dotted path into `PolicyAggregate`, exactly as `./diff.ts` addresses it. */
  path: string;
  title: string;
  /** The one sentence that stops the chart being misread. */
  note: string;
  format: MetricFormat;
  /** True when LOWER is the better outcome (ships lost, routes lost, clear day). */
  lowerIsBetter: boolean;
}

/**
 * Spec §1.1's list — "final credits, clear rate, clear-day, ships/routes lost,
 * deed count" — expressed as paths that actually exist on `PolicyAggregate`.
 *
 * `debtClearedRate` is here although the spec does not name it, and that is the
 * one addition: `debtClearedDay.median` is a median over the runs that EVER
 * cleared, so a policy where 4% of runs cleared on day 30 and a policy where 90%
 * cleared on day 30 plot the same bar. Showing the clear-day without the reach
 * beside it is the shape of chart this spec exists to stop.
 *
 * ORDER is not invented here. `HEADLINE_METRICS` in `./diff.ts` is already this
 * repository's answer to "which paths does a human read first"; the list below is
 * sorted by it (see {@link leaderboardMetrics}), so the leaderboard and the
 * before/after view name the same metrics in the same order and a second,
 * drifting priority list never comes into existence.
 */
export const LEADERBOARD_METRICS: readonly MetricSpec[] = [
  {
    path: 'tourOneClearRate',
    title: 'Tour One clear rate',
    note: 'Share of runs that cleared the debt inside the horizon.',
    format: 'rate',
    lowerIsBetter: false,
  },
  {
    path: 'debtClearedDay.median',
    title: 'Debt cleared — median day',
    note: 'Median over the runs that EVER cleared. Read it beside the clear rate below: a fast median over few clearers is a reach finding, not a speed finding.',
    format: 'days',
    lowerIsBetter: true,
  },
  {
    path: 'debtClearedRate',
    title: 'Debt cleared — share of runs',
    note: 'The reach behind the median above.',
    format: 'rate',
    lowerIsBetter: false,
  },
  {
    path: 'finalCredits.median',
    title: 'Final credits — median',
    note: 'Purse at the horizon.',
    format: 'credits',
    lowerIsBetter: false,
  },
  {
    path: 'deedCount.median',
    title: 'Deeds earned — median',
    note: 'Deed pacing over a whole career.',
    format: 'count',
    lowerIsBetter: false,
  },
  {
    path: 'survival.shipsLost',
    title: 'Ships lost',
    note: 'Summed over every run in the row — it scales with the row size, so read it against `runs` on each bar.',
    format: 'count',
    lowerIsBetter: true,
  },
  {
    path: 'routesLost',
    title: 'Routes lost',
    note: 'Summed over every run in the row; same caveat as ships lost.',
    format: 'count',
    lowerIsBetter: true,
  },
];

/** `HEADLINE_METRICS` order first (it is the repository's existing priority
 *  list), then anything it does not name, in declaration order. */
export function leaderboardMetrics(
  specs: readonly MetricSpec[] = LEADERBOARD_METRICS,
): MetricSpec[] {
  const rank = (spec: MetricSpec): number => {
    const index = HEADLINE_METRICS.indexOf(spec.path);
    return index === -1 ? HEADLINE_METRICS.length + specs.indexOf(spec) : index;
  };
  return [...specs].sort((a, b) => rank(a) - rank(b));
}

/** Walk a dotted path into a policy row. Returns `undefined` for a path this
 *  aggregate does not carry — an older artefact, not a defect. */
export function readMetric(row: PolicyAggregate, path: string): number | undefined {
  let cursor: unknown = row;
  for (const segment of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return typeof cursor === 'number' && Number.isFinite(cursor) ? cursor : undefined;
}

const DISTRIBUTION_FIELDS = new Set([
  'n',
  'min',
  'p10',
  'p25',
  'median',
  'p75',
  'p90',
  'max',
  'mean',
]);

/**
 * The sample count behind a distribution-valued metric — `debtClearedDay.n` for
 * `debtClearedDay.median`, and `null` for a scalar like `routesLost` which has no
 * `n` of its own (its sample size is the row's `runs`).
 */
export function readMetricSampleSize(row: PolicyAggregate, path: string): number | null {
  const segments = path.split('.');
  const last = segments[segments.length - 1];
  if (segments.length < 2 || !DISTRIBUTION_FIELDS.has(last)) return null;
  const n = readMetric(row, [...segments.slice(0, -1), 'n'].join('.'));
  return n ?? null;
}

export interface LeaderboardBar {
  policy: string;
  /** `null` when the metric has no sample (`n === 0`) or the aggregate does not
   *  carry the path. Rendered as an explicit "no sample" cell — NEVER as a
   *  zero-height bar, which reads as a measured zero. */
  value: number | null;
  runs: number;
  /** The distribution's own `n`, or `null` for a scalar metric. */
  n: number | null;
  /** Why the value is null, when it is. */
  absence?: string;
}

export interface LeaderboardChart {
  metric: MetricSpec;
  /** Descending by value, ties broken by policy name so a rerun is identical. */
  bars: LeaderboardBar[];
  /** The union row. A REFERENCE LINE, not a bar: `fleet` is every policy pooled,
   *  so plotting it beside the policies would invite reading it as a competitor. */
  fleetValue: number | null;
  fleetRuns: number;
  fleetN: number | null;
  /** Max over bars AND the fleet line, so the reference never falls off the plot. */
  scaleMax: number;
}

export interface LeaderboardView {
  provenance: InputProvenance;
  label: string;
  seeds: number;
  days: number;
  runs: number;
  policies: string[];
  charts: LeaderboardChart[];
}

export function buildLeaderboard(
  aggregate: BaselineAggregate,
  provenance: InputProvenance,
  specs: readonly MetricSpec[] = LEADERBOARD_METRICS,
): LeaderboardView {
  const charts = leaderboardMetrics(specs).map((metric): LeaderboardChart => {
    const bars = aggregate.byPolicy.map((row): LeaderboardBar => {
      const raw = readMetric(row, metric.path);
      const n = readMetricSampleSize(row, metric.path);
      if (raw === undefined) {
        return {
          policy: row.policy,
          value: null,
          runs: row.runs,
          n,
          absence: 'this aggregate does not carry the path',
        };
      }
      if (n === 0) {
        return {
          policy: row.policy,
          value: null,
          runs: row.runs,
          n,
          absence: 'no sample (n = 0)',
        };
      }
      return { policy: row.policy, value: raw, runs: row.runs, n };
    });
    bars.sort((a, b) => {
      if (a.value === null && b.value === null) return a.policy.localeCompare(b.policy);
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return b.value - a.value || a.policy.localeCompare(b.policy);
    });
    const fleetRaw = readMetric(aggregate.fleet, metric.path);
    const fleetN = readMetricSampleSize(aggregate.fleet, metric.path);
    const fleetValue = fleetRaw === undefined || fleetN === 0 ? null : fleetRaw;
    return {
      metric,
      bars,
      fleetValue,
      fleetRuns: aggregate.fleet.runs,
      fleetN,
      // OVER THE BARS ONLY, deliberately. For a metric SUMMED over the row
      // (`survival.shipsLost`, `routesLost`) the pooled fleet figure is the total
      // of every bar, so folding it into the scale would squash all eight bars
      // against the axis and make the chart unreadable — while telling the reader
      // nothing the fleet caption does not already say. The renderer draws the
      // fleet reference line only when it lands inside this scale, and says
      // "OFF SCALE" in words when it does not.
      scaleMax: Math.max(...bars.map((bar) => bar.value ?? 0), 0),
    };
  });
  return {
    provenance,
    label: aggregate.label,
    seeds: aggregate.seeds,
    days: aggregate.days,
    runs: aggregate.runs,
    policies: [...aggregate.policies],
    charts,
  };
}

// ---------------------------------------------------------------------------
// View 2a — option frequency over NPC decision traces (spec §1.2)
// ---------------------------------------------------------------------------

/**
 * A structural copy of `@spacerquest/engine`'s `NpcDecisionTrace`
 * (`packages/engine/src/npc.ts:551`), declared here rather than imported because
 * a JSONL line off disk is UNTRUSTED input: it must be validated field by field
 * before it can be called one, and importing the type would only let a cast
 * pretend the validation happened. `packages/engine/src/npc.ts` owns the shape;
 * {@link parseTraceLine} is the check that a line matches it.
 */
export interface TraceLine {
  day: number;
  npcId: string;
  archetype: string;
  ideal: string;
  kind: 'intent' | 'contract';
  candidates: { option: string; weight: number }[];
  roll: number | null;
  chosen: string;
}

export function parseTraceLine(line: string): TraceLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (kind !== 'intent' && kind !== 'contract') return null;
  if (typeof record.chosen !== 'string' || typeof record.archetype !== 'string') return null;
  if (!Array.isArray(record.candidates)) return null;
  const candidates: { option: string; weight: number }[] = [];
  for (const entry of record.candidates) {
    if (entry === null || typeof entry !== 'object') return null;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.option !== 'string' || typeof candidate.weight !== 'number') return null;
    candidates.push({ option: candidate.option, weight: candidate.weight });
  }
  return {
    day: asNumber(record.day) ?? 0,
    npcId: typeof record.npcId === 'string' ? record.npcId : '',
    archetype: record.archetype,
    ideal: typeof record.ideal === 'string' ? record.ideal : '',
    kind,
    candidates,
    roll: typeof record.roll === 'number' ? record.roll : null,
    chosen: record.chosen,
  };
}

export interface OptionBar {
  option: string;
  /** Times this option was the one taken. */
  chosen: number;
  /** Times it was on the table AND REACHABLE (`weight > 0`). The denominator of
   *  the share, and spec §4's whole point: a rarely-chosen-rarely-offered option
   *  is a REACH problem, a rarely-chosen-often-offered one is a PREFERENCE
   *  finding, and they must not look the same. */
  offered: number;
  /** Times it was listed at all, reachable or not. `appearances - offered` is the
   *  number of decisions where the option was present with weight 0 — visible to
   *  the tracer, unreachable by the roll. */
  appearances: number;
  /** `chosen / offered`, or `null` when it was never reachable. */
  share: number | null;
}

export interface OptionGroup {
  /** `intent · veteran`, `contract · trader`, … */
  key: string;
  kind: 'intent' | 'contract';
  archetype: string;
  decisions: number;
  /** What the option axis actually is. For `contract` this carries F-140-2. */
  axisLabel: string;
  bars: OptionBar[];
  scaleMax: number;
}

export interface TraceFileSummary {
  path: string;
  bytes: number;
  sha256short: string;
  /** Parsed out of `traces-<label>-shard<i>of<N>.jsonl` when the name matches. */
  sweepLabel: string | null;
  shard: string | null;
  lines: number;
  parsed: number;
  /** Lines that were not a decision trace. A non-zero count is reported, never
   *  swallowed — a half-written shard should look like one. */
  skipped: number;
}

export interface TraceView {
  files: TraceFileSummary[];
  totalDecisions: number;
  groups: OptionGroup[];
  caveats: string[];
}

/**
 * F-140-2, from T-140's own filed findings. For `kind: 'contract'` the traced
 * `option` is the BOARD INDEX as a string — which offer that day, never which
 * cargo. Pretty-printing an index as if it were a good would be a fabricated
 * identity, so the axis says what the number is instead.
 */
export const CONTRACT_AXIS_LABEL =
  'board index — which offer on that day’s board, never which cargo (F-140-2)';

export const INTENT_AXIS_LABEL = 'intent';

/**
 * F-140-1, likewise from T-140. A trace line carries no seed and no policy, so a
 * decision CANNOT be attributed to a career. Grouping is therefore by what the
 * data supports — archetype × kind — and file-level attribution is all the
 * provenance there is. The page prints this rather than leaving a reader to
 * assume the grouping is finer than it is.
 */
export const TRACE_ATTRIBUTION_CAVEAT =
  'A decision trace carries no seed and no policy (F-140-1), so no decision below can be ' +
  'attributed to a career or a playstyle. Grouping is by archetype and decision kind — what ' +
  'the data supports — and the run is attributed at FILE level only, from each file name.';

const TRACE_FILE_NAME = /^traces-(.+)-shard(\d+of\d+)\.jsonl$/;

export function parseTraceFileName(name: string): { sweepLabel: string; shard: string } | null {
  const match = TRACE_FILE_NAME.exec(name);
  return match ? { sweepLabel: match[1], shard: match[2] } : null;
}

export interface TraceSource {
  /** Display path. */
  path: string;
  /** Base name, used for the label/shard parse. */
  name: string;
  text: string;
}

export function buildTraceView(sources: readonly TraceSource[]): TraceView {
  const files: TraceFileSummary[] = [];
  const groups = new Map<
    string,
    {
      kind: 'intent' | 'contract';
      archetype: string;
      bars: Map<string, OptionBar>;
      decisions: number;
    }
  >();
  let totalDecisions = 0;

  for (const source of sources) {
    let lines = 0;
    let parsed = 0;
    let skipped = 0;
    for (const rawLine of source.text.split('\n')) {
      const line = rawLine.trim();
      if (line === '') continue;
      lines += 1;
      const trace = parseTraceLine(line);
      if (trace === null) {
        skipped += 1;
        continue;
      }
      parsed += 1;
      totalDecisions += 1;
      const key = `${trace.kind} · ${trace.archetype}`;
      let group = groups.get(key);
      if (!group) {
        group = { kind: trace.kind, archetype: trace.archetype, bars: new Map(), decisions: 0 };
        groups.set(key, group);
      }
      group.decisions += 1;
      const touch = (option: string): OptionBar => {
        let bar = group.bars.get(option);
        if (!bar) {
          bar = { option, chosen: 0, offered: 0, appearances: 0, share: null };
          group.bars.set(option, bar);
        }
        return bar;
      };
      for (const candidate of trace.candidates) {
        const bar = touch(candidate.option);
        bar.appearances += 1;
        if (candidate.weight > 0) bar.offered += 1;
      }
      touch(trace.chosen).chosen += 1;
    }
    const named = parseTraceFileName(source.name);
    files.push({
      path: source.path,
      bytes: Buffer.byteLength(source.text, 'utf8'),
      sha256short: shortHash(source.text),
      sweepLabel: named?.sweepLabel ?? null,
      shard: named?.shard ?? null,
      lines,
      parsed,
      skipped,
    });
  }

  const built: OptionGroup[] = [...groups.entries()]
    .map(([key, group]) => {
      const bars = [...group.bars.values()].map((bar) => ({
        ...bar,
        share: bar.offered === 0 ? null : bar.chosen / bar.offered,
      }));
      bars.sort((a, b) => b.chosen - a.chosen || a.option.localeCompare(b.option));
      return {
        key,
        kind: group.kind,
        archetype: group.archetype,
        decisions: group.decisions,
        axisLabel: group.kind === 'contract' ? CONTRACT_AXIS_LABEL : INTENT_AXIS_LABEL,
        bars,
        scaleMax: Math.max(0, ...bars.map((bar) => Math.max(bar.chosen, bar.appearances))),
      };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.archetype.localeCompare(b.archetype));

  const caveats = [TRACE_ATTRIBUTION_CAVEAT];
  if (built.some((group) => group.kind === 'contract')) caveats.push(CONTRACT_AXIS_LABEL);
  if (built.some((group) => group.bars.some((bar) => bar.chosen > bar.offered))) {
    caveats.push(
      'At least one option was CHOSEN more often than it was reachable (chosen > offered, so its ' +
        'share reads above 100%). That is not a counting error: a decision function that returns ' +
        'before drawing — the all-weights-zero corner — can hand back an option whose weight was 0. ' +
        'It is a finding about the decision function rather than about preference, and it is left ' +
        'visible instead of being clamped away.',
    );
  }
  const skippedTotal = files.reduce((total, file) => total + file.skipped, 0);
  if (skippedTotal > 0) {
    caveats.push(
      `${skippedTotal} line(s) across ${files.length} file(s) were not decision traces and were ` +
        'not counted. A non-zero figure here usually means a truncated shard.',
    );
  }
  return { files, totalDecisions, groups: built, caveats };
}

// ---------------------------------------------------------------------------
// View 2b — option frequency over human playtest logs (spec §1.2)
// ---------------------------------------------------------------------------

/**
 * A structural copy of `packages/ui/src/playtestLog.ts:63`'s `PlaytestLogEntry`.
 * Declared rather than imported for the same reason as {@link TraceLine} — and
 * for one more: `@spacerquest/ui` is a React package, and making the sim depend
 * on it to read a JSON file would drag the whole renderer into the balance
 * toolchain. `packages/ui/src/playtestLog.ts` owns the shape.
 */
export interface PlaytestEntry {
  sessionId: string;
  day: number;
  kind: 'action' | 'annotation' | 'error';
  actionType?: string;
  note?: string;
  error?: string;
}

/**
 * `packages/ui/src/playtestLog.ts`'s `CSV_COLUMNS`, restated so a header that has
 * drifted is caught rather than guessed at. Deliberately EXACT: the CSV is a
 * lossy flattening of the same record, not a second capture path, so a file whose
 * header does not match this is not a playtest export and reading it would be
 * guessing at what the columns mean.
 */
export const PLAYTEST_CSV_COLUMNS: readonly string[] = [
  'sessionId',
  'day',
  'kind',
  'actionType',
  'action',
  'events',
  'note',
  'error',
];

/** Minimal RFC4180 row reader: doubled quotes inside a quoted field, embedded
 *  commas and newlines. Enough for the columns above and nothing more. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;
  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
      started = true;
    } else if (char === ',') {
      started = true;
      endField();
    } else if (char === '\n') {
      if (started || row.length > 0 || field !== '') endRow();
    } else if (char === '\r') {
      /* swallowed; \r\n is one terminator */
    } else {
      started = true;
      field += char;
    }
  }
  if (started || row.length > 0 || field !== '') endRow();
  return rows;
}

export type PlaytestFormat = 'jsonl' | 'json' | 'csv';

/**
 * Parse one export. JSONL is primary (it is what `toJsonl` writes); a whole-file
 * JSON array is accepted because a tester who renames a file should not lose
 * their bug report; CSV is accepted only with the exact header above.
 */
export function parsePlaytestLog(
  text: string,
  name = '',
): { format: PlaytestFormat; entries: PlaytestEntry[] } {
  const trimmed = text.trim();
  if (trimmed === '') return { format: 'jsonl', entries: [] };
  if (name.endsWith('.csv') || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    const rows = parseCsv(text);
    const header = rows[0] ?? [];
    if (
      header.length !== PLAYTEST_CSV_COLUMNS.length ||
      header.some((column, index) => column !== PLAYTEST_CSV_COLUMNS[index])
    ) {
      throw new Error(
        `Not a playtest CSV export: header is [${header.join(', ')}], expected ` +
          `[${PLAYTEST_CSV_COLUMNS.join(', ')}] (packages/ui/src/playtestLog.ts CSV_COLUMNS). ` +
          'Reading it anyway would mean guessing what the columns mean.',
      );
    }
    const entries: PlaytestEntry[] = [];
    for (const row of rows.slice(1)) {
      if (row.length === 1 && row[0] === '') continue;
      const kind = row[2];
      if (kind !== 'action' && kind !== 'annotation' && kind !== 'error') continue;
      entries.push({
        sessionId: row[0] ?? '',
        day: Number(row[1] ?? 0) || 0,
        kind,
        actionType: row[3] === '' ? undefined : row[3],
        note: row[6] === '' ? undefined : row[6],
        error: row[7] === '' ? undefined : row[7],
      });
    }
    return { format: 'csv', entries };
  }
  const toEntry = (value: unknown): PlaytestEntry | null => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const kind = record.kind;
    if (kind !== 'action' && kind !== 'annotation' && kind !== 'error') return null;
    const action = record.action as { type?: unknown } | undefined;
    return {
      sessionId: typeof record.sessionId === 'string' ? record.sessionId : '',
      day: asNumber(record.day) ?? 0,
      kind,
      actionType: typeof action?.type === 'string' ? action.type : undefined,
      note: asString(record.note),
      error: asString(record.error),
    };
  };
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) throw new Error('Not a playtest export: JSON root is not an array');
    return {
      format: 'json',
      entries: parsed.map(toEntry).filter((entry): entry is PlaytestEntry => entry !== null),
    };
  }
  const entries: PlaytestEntry[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    const entry = toEntry(value);
    if (entry !== null) entries.push(entry);
  }
  return { format: 'jsonl', entries };
}

export interface PlaytestActionBar {
  option: string;
  count: number;
}

export interface PlaytestFileSummary {
  path: string;
  format: PlaytestFormat;
  bytes: number;
  sha256short: string;
  entries: number;
  sessions: string[];
}

export interface PlaytestView {
  files: PlaytestFileSummary[];
  /** `kind === 'action'` only — the bars. */
  actionEntries: number;
  /** Reported as a footnote, NEVER folded into the bars: an annotation is a
   *  tester's note and an error is a crash, and neither is a player action. */
  annotationEntries: number;
  errorEntries: number;
  bars: PlaytestActionBar[];
  scaleMax: number;
  sessions: string[];
}

export interface PlaytestSource {
  path: string;
  name: string;
  text: string;
}

export function buildPlaytestView(sources: readonly PlaytestSource[]): PlaytestView {
  const files: PlaytestFileSummary[] = [];
  const counts = new Map<string, number>();
  const sessions = new Set<string>();
  let actionEntries = 0;
  let annotationEntries = 0;
  let errorEntries = 0;
  for (const source of sources) {
    const { format, entries } = parsePlaytestLog(source.text, source.name);
    const fileSessions = new Set<string>();
    for (const entry of entries) {
      if (entry.sessionId !== '') {
        sessions.add(entry.sessionId);
        fileSessions.add(entry.sessionId);
      }
      if (entry.kind === 'annotation') {
        annotationEntries += 1;
        continue;
      }
      if (entry.kind === 'error') {
        errorEntries += 1;
        continue;
      }
      actionEntries += 1;
      const type = entry.actionType ?? '(no action type)';
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    files.push({
      path: source.path,
      format,
      bytes: Buffer.byteLength(source.text, 'utf8'),
      sha256short: shortHash(source.text),
      entries: entries.length,
      sessions: [...fileSessions].sort(),
    });
  }
  const bars = [...counts.entries()]
    .map(([option, count]) => ({ option, count }))
    .sort((a, b) => b.count - a.count || a.option.localeCompare(b.option));
  return {
    files,
    actionEntries,
    annotationEntries,
    errorEntries,
    bars,
    scaleMax: Math.max(0, ...bars.map((bar) => bar.count)),
    sessions: [...sessions].sort(),
  };
}

// ---------------------------------------------------------------------------
// View 3 — before/after (spec §1.3, §4)
// ---------------------------------------------------------------------------

/**
 * One metric on one row, WITH the sample sizes behind both numbers.
 *
 * EVERY SAMPLE FIELD IS NON-OPTIONAL, and that is the mechanism rather than a
 * convention: spec §4 requires "each input's seed count next to its numbers so a
 * viewer is never reading a 100-seed delta as if it carries the same confidence
 * as a 1,000-seed one", and a renderer that could omit them would eventually omit
 * them. Making the type unable to express a bare delta is the enforcement;
 * `../__tests__/balance-report.test.ts` then checks the rendered markup carries
 * both counts inside the same row as the delta.
 */
export interface BeforeAfterRow {
  row: string;
  path: string;
  metric: string;
  before: number;
  after: number;
  delta: number;
  pctDelta: number | null;
  beforeSeeds: number;
  afterSeeds: number;
  beforeRuns: number;
  afterRuns: number;
  /** The distribution's own `n`, or `null` for a scalar metric. */
  beforeN: number | null;
  afterN: number | null;
  /**
   * A DISPLAY HEURISTIC — an eye-catch, nothing more. It is deliberately NOT one
   * of the governed bands in `docs/BALANCE-POLICY.md` and must never be read as
   * one: it says "look at the sample sizes before you believe this delta", not
   * "this delta failed a threshold".
   */
  sampleWarning: string | null;
}

export interface BeforeAfterView {
  beforeProvenance: InputProvenance;
  afterProvenance: InputProvenance;
  beforeLabel: string;
  afterLabel: string;
  beforeSeeds: number;
  afterSeeds: number;
  beforeDays: number;
  afterDays: number;
  identical: boolean;
  /** `formatAggregateDiff`'s distinction, preserved: rows can be listed as moved
   *  because a FIELD APPEARED, with not one number having changed. A reader once
   *  drew the opposite conclusion from exactly that. */
  noMeasuredValueMoved: boolean;
  movedRows: string[];
  unchangedRows: string[];
  rows: BeforeAfterRow[];
  /** Never folded into "unchanged" — see `./diff.ts`'s `ShapeChange`. */
  shapeChanges: ShapeChange[];
  shapeChangeRows: string[];
  seedsDiffer: boolean;
  rulesets: RulesetComparison;
}

/** Below this, a distribution's median is a small-sample number and the page says
 *  so. A display threshold, not a balance band — see {@link BeforeAfterRow}. */
export const SMALL_SAMPLE_N = 30;

function policyRow(aggregate: BaselineAggregate, row: string): PolicyAggregate | undefined {
  if (row === 'fleet') return aggregate.fleet;
  return aggregate.byPolicy.find((entry) => entry.policy === row);
}

/**
 * Built on `diffAggregates` — the metric-by-metric comparison, the `byPolicy[x]`
 * re-keying and the shape-change detection already exist and are already pinned
 * by `../__tests__/balance-rig.test.ts` against real committed pairs. This
 * function adds only what the SPEC adds: the sample sizes beside every number.
 */
export function buildBeforeAfter(
  before: BaselineAggregate,
  after: BaselineAggregate,
  beforeProvenance: InputProvenance,
  afterProvenance: InputProvenance,
  specs: readonly MetricSpec[] = LEADERBOARD_METRICS,
): BeforeAfterView {
  const diff = diffAggregates(before, after, { epsilon: 0 });
  const metrics = leaderboardMetrics(specs);
  const rowOrder = ['fleet', ...after.policies.filter((policy) => policy !== 'fleet')];
  const seedsDiffer = before.seeds !== after.seeds;

  const rows: BeforeAfterRow[] = [];
  for (const row of rowOrder) {
    const beforeRow = policyRow(before, row);
    const afterRow = policyRow(after, row);
    if (!beforeRow || !afterRow) continue;
    for (const metric of metrics) {
      const beforeValue = readMetric(beforeRow, metric.path);
      const afterValue = readMetric(afterRow, metric.path);
      if (beforeValue === undefined || afterValue === undefined) continue;
      const beforeN = readMetricSampleSize(beforeRow, metric.path);
      const afterN = readMetricSampleSize(afterRow, metric.path);
      const warnings: string[] = [];
      if (seedsDiffer) {
        warnings.push(
          `seed counts differ (${before.seeds} vs ${after.seeds}) — the two sides are not the ` +
            'same width',
        );
      }
      if (before.days !== after.days) {
        warnings.push(`horizons differ (${before.days}d vs ${after.days}d)`);
      }
      if (
        (beforeN !== null && beforeN < SMALL_SAMPLE_N) ||
        (afterN !== null && afterN < SMALL_SAMPLE_N)
      ) {
        warnings.push(
          `small sample behind the distribution (n ${beforeN ?? '—'} vs ${afterN ?? '—'})`,
        );
      }
      rows.push({
        row,
        path: `${row === 'fleet' ? 'fleet' : `byPolicy[${row}]`}.${metric.path}`,
        metric: metric.title,
        before: beforeValue,
        after: afterValue,
        delta: afterValue - beforeValue,
        pctDelta: beforeValue === 0 ? null : (afterValue - beforeValue) / Math.abs(beforeValue),
        beforeSeeds: before.seeds,
        afterSeeds: after.seeds,
        beforeRuns: beforeRow.runs,
        afterRuns: afterRow.runs,
        beforeN,
        afterN,
        sampleWarning: warnings.length === 0 ? null : warnings.join('; '),
      });
    }
  }

  return {
    beforeProvenance,
    afterProvenance,
    beforeLabel: before.label,
    afterLabel: after.label,
    beforeSeeds: before.seeds,
    afterSeeds: after.seeds,
    beforeDays: before.days,
    afterDays: after.days,
    identical: diff.identical,
    noMeasuredValueMoved:
      !diff.identical && diff.numericChanges.length === 0 && diff.valueChanges.length === 0,
    movedRows: diff.movedRows,
    unchangedRows: diff.unchangedRows,
    rows,
    shapeChanges: diff.shapeChanges,
    shapeChangeRows: [...new Set(diff.shapeChanges.map((change) => change.row))].sort(),
    seedsDiffer,
    rulesets: compareRulesets(beforeProvenance, afterProvenance),
  };
}

// ---------------------------------------------------------------------------
// The whole report
// ---------------------------------------------------------------------------

export interface GeneratorFingerprints {
  rulesFingerprint: string;
  instrumentFingerprint: string;
}

export interface ReportModel {
  /** The page title / output slug. */
  name: string;
  leaderboard: LeaderboardView;
  /** Present only when `--compare-to` was given. */
  beforeAfter: BeforeAfterView | null;
  traces: TraceView | null;
  playtest: PlaytestView | null;
  /**
   * THE TREE THIS REPORT WAS GENERATED ON — never the ruleset of any input.
   * Attaching the current tree's fingerprint to a two-month-old aggregate would
   * MANUFACTURE provenance, which is the exact move `docs/VERSIONING.md`'s "the
   * rule that matters most" exists to stop. The page labels it accordingly.
   */
  generator: GeneratorFingerprints | null;
}
