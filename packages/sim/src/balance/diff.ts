/**
 * N7 · THE CAPSTONE DIFFER — what moved between two sweep aggregates, and by how
 * much. The PURE half; `./diff-cli.ts` owns argv and the filesystem (the T-1602b
 * split `./aggregate.ts` already follows).
 *
 * WHY THIS EXISTS AT ALL. The N-series grades itself by re-running a capstone and
 * asking "what changed?", and until now the answer came from `diff` plus a human
 * reading 6,000 lines of JSON. That works exactly once. R2a's finding — "at 1,000
 * seeds it moves ONLY `fighter` and `veteran`; the other six rows are
 * byte-identical, which is the control proving the diff is this function alone" —
 * is the shape of answer every step wants, and it should be one command.
 *
 * TWO ANSWERS MUST BOTH BE OBVIOUS AND MACHINE-CHECKABLE:
 *   - "nothing moved"      → `identical === true`, `movedRows === []`.
 *   - "these rows moved"   → `movedRows` names them and nothing else.
 * Both are asserted against real committed pairs in `../__tests__/balance-rig.test.ts`.
 *
 * READERS (constraint 7): `./diff-cli.ts` and `../__tests__/balance-rig.test.ts`.
 */

import type { BaselineAggregate } from './aggregate.js';

/**
 * Fields compared for EQUALITY but excluded from "what moved", because they
 * describe the measurement rather than the game.
 *
 * `label` is the load-bearing entry and the reason this list is not empty. N1's
 * capstone is byte-identical to `baseline-r2c-final.json` **apart from the
 * label** — a differ that reported the label as a change would answer "something
 * moved" to the exact question N1 asked, and the finding would have to be
 * re-established by hand. Ignoring it is a deliberate judgment, so the report
 * carries `ignoredPaths` and prints it: the differ says what it did not look at.
 */
export const IGNORED_PATHS: readonly string[] = ['label'];

export interface NumericChange {
  path: string;
  /** The aggregate row this path belongs to: 'fleet', a policy name, or
   *  'header' for the top-level seeds/days/runs fields. */
  row: string;
  before: number;
  after: number;
  delta: number;
  /** `delta / |before|`, or null when `before` is 0 (an infinite ratio in a
   *  report table reads as a defect, not as data). */
  pctDelta: number | null;
}

export interface ValueChange {
  path: string;
  row: string;
  before: unknown;
  after: unknown;
}

export interface ShapeChange {
  path: string;
  row: string;
  /** Which side carries the path. A field present in one aggregate only means
   *  the two were produced by different instrument versions — a real finding,
   *  and never silently folded into "unchanged". */
  presentIn: 'before' | 'after';
}

export interface AggregateDiff {
  beforeLabel: string;
  afterLabel: string;
  /** True when every compared path is equal and no path is missing on either
   *  side. THE machine-checkable "nothing moved". */
  identical: boolean;
  /** Rows carrying at least one change, in aggregate order. THE
   *  machine-checkable "these rows moved". */
  movedRows: string[];
  /** Rows compared and found equal, in aggregate order. R2a's control ("the other
   *  six rows are byte-identical, which is the control proving the diff is this
   *  function alone") is an assertion about THIS list, so it is reported rather
   *  than left to be inferred from the absence of an entry above. */
  unchangedRows: string[];
  numericChanges: NumericChange[];
  valueChanges: ValueChange[];
  shapeChanges: ShapeChange[];
  ignoredPaths: readonly string[];
  /** Absolute tolerance applied to numeric comparison. */
  epsilon: number;
}

export interface DiffOptions {
  /**
   * Absolute tolerance. **Defaults to 0 — exact — and that default is the point.**
   * Both sweeps are seeded and deterministic, so two runs of the same ruleset over
   * the same seeds produce identical doubles; a non-zero tolerance would let a real
   * regression hide under "noise" that this instrument does not have. It is
   * exposed only for comparing arms with different seed counts, where the
   * denominators genuinely differ.
   */
  epsilon?: number;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Array elements are addressed by POSITION, with two deliberate exceptions —
 * and the exceptions are chosen by one rule: **re-key only arrays whose
 * membership is fixed.**
 *
 * `byPolicy` and `combatCells` qualify (a policy list and a 3×2 parity grid), and
 * re-keying them means `byPolicy[fighter]` still names the fighter after a policy
 * is added or `--policies` is reordered.
 *
 * `topRoutes` deliberately does NOT qualify: it is the top five routes BY TRAFFIC,
 * so its membership is itself a measurement. Keying it by route id made the first
 * real run report 192 "shape changes" for two aggregates with identical schemas —
 * a route falling out of the top five is a value change (`topRoutes[0].route:
 * 19->20 becomes 10->11`), and dressing it as a schema difference buries the
 * finding under noise. Positional keys say the true thing.
 */
function keyOf(arrayPath: string, container: Json, index: number): string {
  if (container !== null && typeof container === 'object' && !Array.isArray(container)) {
    if (arrayPath === 'byPolicy') {
      const policy = (container as { policy?: Json }).policy;
      if (typeof policy === 'string') return policy;
    }
    if (arrayPath.endsWith('combatCells')) {
      const parity = (container as { parity?: Json }).parity;
      const prepared = (container as { prepared?: Json }).prepared;
      if (typeof parity === 'string' && typeof prepared === 'boolean') {
        return `${parity}/${prepared ? 'prepared' : 'unprepared'}`;
      }
    }
  }
  return String(index);
}

function flatten(value: Json, prefix: string, into: Map<string, Json>): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      flatten(entry, `${prefix}[${keyOf(prefix, entry, index)}]`, into),
    );
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      flatten(entry, prefix === '' ? key : `${prefix}.${key}`, into);
    }
    return;
  }
  into.set(prefix, value);
}

/** The aggregate row a leaf path belongs to. Used for the headline answer, which
 *  is nearly always "which policy rows moved". */
export function rowOf(path: string): string {
  if (path.startsWith('fleet.')) return 'fleet';
  const match = /^byPolicy\[([^\]]+)\]/.exec(path);
  if (match) return match[1];
  return 'header';
}

export function diffAggregates(
  before: BaselineAggregate,
  after: BaselineAggregate,
  options: DiffOptions = {},
): AggregateDiff {
  const epsilon = options.epsilon ?? 0;
  const beforeLeaves = new Map<string, Json>();
  const afterLeaves = new Map<string, Json>();
  flatten(before as unknown as Json, '', beforeLeaves);
  flatten(after as unknown as Json, '', afterLeaves);

  const ignored = new Set(IGNORED_PATHS);
  const numericChanges: NumericChange[] = [];
  const valueChanges: ValueChange[] = [];
  const shapeChanges: ShapeChange[] = [];

  for (const [path, beforeValue] of beforeLeaves) {
    if (ignored.has(path)) continue;
    if (!afterLeaves.has(path)) {
      shapeChanges.push({ path, row: rowOf(path), presentIn: 'before' });
      continue;
    }
    const afterValue = afterLeaves.get(path) as Json;
    if (typeof beforeValue === 'number' && typeof afterValue === 'number') {
      if (Math.abs(afterValue - beforeValue) <= epsilon) continue;
      numericChanges.push({
        path,
        row: rowOf(path),
        before: beforeValue,
        after: afterValue,
        delta: afterValue - beforeValue,
        pctDelta: beforeValue === 0 ? null : (afterValue - beforeValue) / Math.abs(beforeValue),
      });
      continue;
    }
    if (beforeValue !== afterValue) {
      valueChanges.push({ path, row: rowOf(path), before: beforeValue, after: afterValue });
    }
  }
  for (const path of afterLeaves.keys()) {
    if (ignored.has(path)) continue;
    if (!beforeLeaves.has(path)) shapeChanges.push({ path, row: rowOf(path), presentIn: 'after' });
  }

  const moved = new Set<string>([
    ...numericChanges.map((change) => change.row),
    ...valueChanges.map((change) => change.row),
    ...shapeChanges.map((change) => change.row),
  ]);
  // Report order follows the aggregate's own row order so two diffs of the same
  // arm always list rows the same way.
  const rowOrder = ['header', 'fleet', ...after.policies, ...before.policies];
  const byRowOrder = (a: string, b: string): number => {
    const indexA = rowOrder.indexOf(a);
    const indexB = rowOrder.indexOf(b);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB) || a.localeCompare(b);
  };
  const allRows = [...new Set(rowOrder)];
  const movedRows = [...moved].sort(byRowOrder);
  const unchangedRows = allRows.filter((row) => !moved.has(row)).sort(byRowOrder);

  return {
    beforeLabel: before.label,
    afterLabel: after.label,
    identical:
      numericChanges.length === 0 && valueChanges.length === 0 && shapeChanges.length === 0,
    movedRows,
    unchangedRows,
    numericChanges,
    valueChanges,
    shapeChanges,
    ignoredPaths: IGNORED_PATHS,
    epsilon,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** The paths a human reads first when asking "did this step move the game?" —
 *  the R2a result table, expressed as paths. Printed in full for every moved row
 *  before the long tail, so the headline is never buried. */
export const HEADLINE_METRICS: readonly string[] = [
  'tourOneClearRate',
  'debtClearedDay.median',
  'finalCredits.median',
  'deedCount.median',
  'encountersPerRun',
  'combatEvAll.median',
  'survival.shipsLost',
  'survival.deathsPer1000Days',
  // N11/T-022. Added because the alternative is worse than noise: a brand-new path
  // lands in the long TAIL, and this differ's own first outing proved a reader can
  // draw the opposite conclusion from a tail (the "3,699 paths" note below). The gate
  // T-021 opened is the headline of the step T-023 grades, so it prints with the rest.
  'npcSpecialEquipmentPurchasesPerRun',
  // N12/T-030, on T-022's argument one step later: a brand-new path otherwise lands
  // in the long TAIL, where this differ's own first outing proved a reader can draw
  // the opposite conclusion. Port ownership is the headline of the step N12 grades,
  // so it prints with the rest rather than below the fold.
  'portOwnershipRate',
];

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(4);
}

function formatChange(change: NumericChange): string {
  const pct = change.pctDelta === null ? '' : ` (${(change.pctDelta * 100).toFixed(1)}%)`;
  return `${formatNumber(change.before)} -> ${formatNumber(change.after)}${pct}`;
}

/** A human-readable report. Deliberately leads with the verdict, because that is
 *  the sentence a worklist entry quotes. */
export function formatAggregateDiff(diff: AggregateDiff, maxPerRow = 12): string {
  const lines: string[] = [];
  lines.push(`# balance diff: ${diff.beforeLabel} -> ${diff.afterLabel}`);
  lines.push(`# ignored (deliberately): ${diff.ignoredPaths.join(', ')} · epsilon ${diff.epsilon}`);
  if (diff.identical) {
    lines.push('');
    lines.push('NOTHING MOVED. Every compared field is equal on both sides.');
    return `${lines.join('\n')}\n`;
  }
  lines.push('');
  lines.push(`MOVED ROWS (${diff.movedRows.length}): ${diff.movedRows.join(', ')}`);
  if (diff.unchangedRows.length > 0) {
    lines.push(`UNCHANGED ROWS: ${diff.unchangedRows.join(', ')}`);
  }
  if (diff.numericChanges.length === 0 && diff.valueChanges.length === 0) {
    // Worth saying out loud: a row listed above only because a FIELD APPEARED is
    // not a row that moved. The first real use of this tool hit exactly that case
    // — adding milestone harvesting to the sweep left all 8 policy rows measuring
    // identically while adding 3,699 paths — and a reader who saw only "MOVED
    // ROWS (9)" would have drawn the opposite conclusion.
    lines.push('');
    lines.push('NO MEASURED VALUE MOVED. Every difference below is a SHAPE difference:');
    lines.push('fields present on one side only. The rows above are listed because the');
    lines.push('aggregates differ, not because a number did.');
  }
  if (diff.shapeChanges.length > 0) {
    lines.push('');
    lines.push(`SHAPE CHANGES (${diff.shapeChanges.length}) — the two aggregates are not the`);
    lines.push('same measurement. Paths present on one side only:');
    for (const change of diff.shapeChanges.slice(0, 20)) {
      lines.push(`  ${change.presentIn === 'before' ? '-' : '+'} ${change.path}`);
    }
    if (diff.shapeChanges.length > 20) {
      lines.push(`  ... ${diff.shapeChanges.length - 20} more`);
    }
  }
  for (const row of diff.movedRows) {
    const numeric = diff.numericChanges.filter((change) => change.row === row);
    const values = diff.valueChanges.filter((change) => change.row === row);
    if (numeric.length === 0 && values.length === 0) continue;
    lines.push('');
    lines.push(`## ${row} — ${numeric.length + values.length} changed field(s)`);
    const headline = numeric.filter((change) =>
      HEADLINE_METRICS.some((metric) => change.path.endsWith(metric)),
    );
    for (const change of headline) {
      lines.push(`  * ${change.path.split('.').slice(1).join('.')}: ${formatChange(change)}`);
    }
    const rest = numeric
      .filter((change) => !headline.includes(change))
      .sort((a, b) => Math.abs(b.pctDelta ?? 0) - Math.abs(a.pctDelta ?? 0));
    for (const change of rest.slice(0, maxPerRow)) {
      lines.push(`    ${change.path}: ${formatChange(change)}`);
    }
    if (rest.length > maxPerRow) lines.push(`    ... ${rest.length - maxPerRow} more`);
    for (const change of values.slice(0, maxPerRow)) {
      lines.push(`    ${change.path}: ${String(change.before)} -> ${String(change.after)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
