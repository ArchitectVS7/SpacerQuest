/**
 * T-142 · THE TIER 1 TELEMETRY REPORT — the RENDERER.
 *
 * One pure function, `renderReportHtml(model, { generatedAt })`, turning a
 * {@link ReportModel} into ONE self-contained HTML string. It reads no clock and
 * touches no filesystem: `generatedAt` is a parameter precisely so the same model
 * renders byte-identically twice, which is what makes the output snapshot-testable
 * and is asserted in `../__tests__/balance-report.test.ts`.
 *
 * SELF-CONTAINED IS A HARD CONSTRAINT, NOT A PREFERENCE (spec §3): inline
 * `<style>`, inline `<svg>`, and ZERO JavaScript — no `<script>`, no
 * `<link rel=stylesheet>`, no `@import`, no web font, no remote image. The target
 * is a file someone opens offline on a con floor during an Alpha session, and the
 * absence of every one of those is asserted by a test rather than promised here.
 * The hover layer is `<title>` inside each mark: a native tooltip, no script.
 *
 * CHART METHOD: the `dataviz` skill's — its validated categorical palette
 * (`references/palette.md`, re-run through `scripts/validate_palette.js` for both
 * modes when this file was written: all checks PASS light and dark), its mark
 * specs (bars ≤24px with a 4px rounded data-end square at the baseline, hairline
 * solid axes, a 2px surface gap between touching bars), and its accessibility
 * rules (a legend for ≥2 series, direct value labels on every bar so identity is
 * never colour-alone, a `<details>` table view under every chart, dark mode as
 * its own selected steps rather than an automatic flip).
 *
 * COLOUR FOLLOWS THE ENTITY, NEVER THE RANK. A policy/archetype is assigned a
 * palette slot once, from the sorted union of every name in the report, so
 * `explorer` is the same hue in the leaderboard and in the trace charts and a
 * re-sorted bar list never repaints the survivors. Past the eighth slot names
 * fold into a neutral "other" rather than generating a ninth hue.
 *
 * EVERYTHING INTERPOLATED GOES THROUGH {@link escapeHtml}. Trace and log content
 * is file input; a policy label or an error string is not to be trusted with
 * markup.
 *
 * READERS (constraint 7): `./report-cli.ts`, `../__tests__/balance-report.test.ts`.
 */

import type {
  BeforeAfterRow,
  BeforeAfterView,
  InputProvenance,
  LeaderboardChart,
  LeaderboardView,
  MetricFormat,
  OptionGroup,
  PlaytestView,
  ReportModel,
  RulesetComparison,
  TraceView,
} from './report-model.js';

// ---------------------------------------------------------------------------
// Palette (dataviz `references/palette.md`, validated in both modes)
// ---------------------------------------------------------------------------

const SERIES_LIGHT = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
] as const;

const SERIES_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
] as const;

/** The ninth-and-beyond bucket. NOT a generated hue — see the header. */
const OTHER_SLOT = 'other';

/** The neutral the overflow bucket wears — the palette's muted ink, which is
 *  mode-invariant and deliberately not one of the eight identity hues. */
const OTHER_HUE = '#898781';

/** The slot custom properties, emitted FROM the arrays above so the palette has
 *  exactly one source of truth and a stylesheet copy cannot drift from it. */
function slotVariables(palette: readonly string[]): string {
  return `${palette.map((hex, index) => `--slot-${index + 1}:${hex};`).join('')}--slot-${OTHER_SLOT}:${OTHER_HUE};`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Slot id for an entity name, from the report-wide sorted assignment. */
function slotOf(assignment: ReadonlyMap<string, number>, name: string): string {
  const index = assignment.get(name);
  return index === undefined ? OTHER_SLOT : String(index + 1);
}

function assignSlots(names: readonly string[]): Map<string, number> {
  const unique = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  const assignment = new Map<string, number>();
  unique.forEach((name, index) => {
    if (index < SERIES_LIGHT.length) assignment.set(name, index);
  });
  return assignment;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const INTEGER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const TWO_DP = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatValue(value: number, format: MetricFormat): string {
  switch (format) {
    case 'rate':
      return `${TWO_DP.format(value * 100)}%`;
    case 'credits':
      return `${INTEGER.format(Math.round(value))} cr`;
    case 'days':
      return `day ${TWO_DP.format(value)}`;
    default:
      return Number.isInteger(value) ? INTEGER.format(value) : TWO_DP.format(value);
  }
}

function formatDelta(row: BeforeAfterRow, format: MetricFormat): string {
  const sign = row.delta > 0 ? '+' : row.delta < 0 ? '−' : '±';
  const magnitude = formatValue(Math.abs(row.delta), format);
  const pct =
    row.pctDelta === null
      ? ' (no % — before is 0)'
      : ` (${sign}${TWO_DP.format(Math.abs(row.pctDelta) * 100)}%)`;
  return `${sign}${magnitude}${pct}`;
}

function count(value: number): string {
  return INTEGER.format(value);
}

// ---------------------------------------------------------------------------
// SVG primitives — mark specs from `references/marks-and-anatomy.md`
// ---------------------------------------------------------------------------

const BAR_THICKNESS = 22; // ≤ 24px, the leftover of the band is air
const BAR_RADIUS = 4; // 4px rounded data-end, square at the baseline
// The gutters are sized so the longest direct label this report produces fits
// WITHOUT being clipped by the SVG viewport — the mark spec's "a label that won't
// fit doesn't get clipped, measure first". The long form of every label lives in
// the `<title>` hover and in the table view regardless.
const CHART_WIDTH = 1000;
const LABEL_GUTTER = 180;
const VALUE_GUTTER = 300;

/** A bar growing rightward from `x`, with the data-end rounded and the baseline
 *  end square. Falls back to a plain rect below the corner radius. */
function barPath(x: number, y: number, width: number, height: number): string {
  const w = Math.max(0, width);
  if (w <= BAR_RADIUS) return `M${x} ${y}h${w}v${height}h${-w}z`;
  const r = BAR_RADIUS;
  return `M${x} ${y}h${w - r}a${r} ${r} 0 0 1 ${r} ${r}v${height - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - r)}z`;
}

function plotWidth(): number {
  return CHART_WIDTH - LABEL_GUTTER - VALUE_GUTTER;
}

function scale(value: number, max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 0;
  return (Math.max(0, value) / max) * plotWidth();
}

// ---------------------------------------------------------------------------
// View 1 — leaderboard
// ---------------------------------------------------------------------------

function leaderboardChartSvg(
  chart: LeaderboardChart,
  assignment: ReadonlyMap<string, number>,
): string {
  const bandHeight = 34;
  const top = 10;
  const height = top + chart.bars.length * bandHeight + 34;
  const axisX = LABEL_GUTTER;
  const parts: string[] = [];
  parts.push(
    `<line class="axis" x1="${axisX}" y1="${top - 4}" x2="${axisX}" y2="${top + chart.bars.length * bandHeight}" />`,
  );
  const fleetY = top + chart.bars.length * bandHeight;
  // The reference line is emitted FIRST so bars and labels paint over it: it is
  // context, and context must not sit on top of the data or its labels.
  const fleetOnScale = chart.fleetValue !== null && chart.fleetValue <= chart.scaleMax;
  if (chart.fleetValue !== null && fleetOnScale) {
    const fleetX = axisX + scale(chart.fleetValue, chart.scaleMax);
    parts.push(
      `<g><title>fleet (every policy pooled) — ${escapeHtml(formatValue(chart.fleetValue, chart.metric.format))}</title>` +
        `<line class="reference" x1="${fleetX}" y1="${top - 4}" x2="${fleetX}" y2="${fleetY + 6}" /></g>`,
    );
  }
  chart.bars.forEach((bar, index) => {
    const y = top + index * bandHeight + (bandHeight - BAR_THICKNESS) / 2;
    const slot = slotOf(assignment, bar.policy);
    const sample =
      bar.n === null ? `${count(bar.runs)} runs` : `n ${count(bar.n)} of ${count(bar.runs)} runs`;
    const rank = `#${index + 1}`;
    if (bar.value === null) {
      parts.push(
        `<g><title>${escapeHtml(bar.policy)} — ${escapeHtml(bar.absence ?? 'no value')}</title>` +
          `<text class="row-label" x="${axisX - 10}" y="${y + 15}" text-anchor="end">${escapeHtml(rank)} ${escapeHtml(bar.policy)}</text>` +
          `<text class="value-label absent" x="${axisX + 8}" y="${y + 15}">${escapeHtml(bar.absence ?? 'no value')} · ${escapeHtml(sample)}</text></g>`,
      );
      return;
    }
    const width = scale(bar.value, chart.scaleMax);
    parts.push(
      `<g><title>${escapeHtml(bar.policy)} — ${escapeHtml(formatValue(bar.value, chart.metric.format))} · ${escapeHtml(sample)}</title>` +
        `<text class="row-label" x="${axisX - 10}" y="${y + 15}" text-anchor="end">${escapeHtml(rank)} ${escapeHtml(bar.policy)}</text>` +
        `<path class="bar slot-${slot}" d="${barPath(axisX, y, width, BAR_THICKNESS)}" />` +
        `<text class="value-label" x="${axisX + width + 8}" y="${y + 15}">${escapeHtml(formatValue(bar.value, chart.metric.format))} <tspan class="sample">· ${escapeHtml(sample)}</tspan></text></g>`,
    );
  });
  if (chart.fleetValue === null) {
    parts.push(
      `<text class="reference-label" x="${axisX}" y="${fleetY + 24}">fleet (pooled): no sample</text>`,
    );
  } else {
    // A metric summed over the row (ships lost, routes lost) makes the pooled
    // fleet figure the SUM of every bar, so plotting it in-scale would squash
    // every bar against the axis. It is reported in words instead, and the fact
    // that it is off-scale is said out loud rather than hidden by a clipped line.
    const off = fleetOnScale
      ? ''
      : ' — OFF SCALE (summed over the row, so this is the total of every bar)';
    parts.push(
      `<text class="reference-label" x="${axisX}" y="${fleetY + 24}">fleet (pooled, not a competitor): ${escapeHtml(formatValue(chart.fleetValue, chart.metric.format))} · ${escapeHtml(count(chart.fleetRuns))} runs${chart.fleetN === null ? '' : ` · n ${escapeHtml(count(chart.fleetN))}`}${escapeHtml(off)}</text>`,
    );
  }
  return svg(height, parts.join(''), `${chart.metric.title} by policy`);
}

function svg(height: number, body: string, title: string): string {
  return (
    `<svg class="chart" viewBox="0 0 ${CHART_WIDTH} ${height}" width="100%" height="${height}" ` +
    `role="img" aria-label="${escapeHtml(title)}" preserveAspectRatio="xMinYMin meet">` +
    `<title>${escapeHtml(title)}</title>${body}</svg>`
  );
}

function leaderboardTable(chart: LeaderboardChart): string {
  const rows = chart.bars
    .map(
      (bar, index) =>
        `<tr><td>${index + 1}</td><td>${escapeHtml(bar.policy)}</td><td>${bar.value === null ? `no sample (${escapeHtml(bar.absence ?? '')})` : escapeHtml(formatValue(bar.value, chart.metric.format))}</td><td>${escapeHtml(count(bar.runs))}</td><td>${bar.n === null ? '—' : escapeHtml(count(bar.n))}</td></tr>`,
    )
    .join('');
  return (
    '<details class="table-view"><summary>Table view</summary><div class="scroll"><table>' +
    '<thead><tr><th>#</th><th>policy</th><th>value</th><th>runs</th><th>n</th></tr></thead>' +
    `<tbody>${rows}</tbody></table></div></details>`
  );
}

function renderLeaderboard(view: LeaderboardView, assignment: ReadonlyMap<string, number>): string {
  const legend = legendFor(view.policies, assignment, 'policy');
  const charts = view.charts
    .map(
      (chart) =>
        `<figure class="chart-block"><figcaption><h3>${escapeHtml(chart.metric.title)}</h3>` +
        `<p class="note">${escapeHtml(chart.metric.note)}</p></figcaption>` +
        `<div class="scroll">${leaderboardChartSvg(chart, assignment)}</div>${leaderboardTable(chart)}</figure>`,
    )
    .join('');
  return (
    '<section id="leaderboard"><h2>1 · Per-archetype leaderboard</h2>' +
    `<p class="lede">${escapeHtml(view.label)} — ${escapeHtml(count(view.seeds))} seeds × ${escapeHtml(count(view.days))} days = ${escapeHtml(count(view.runs))} runs across ${view.policies.length} policies. ` +
    'Bars are sorted descending and every bar carries the sample behind it; the fleet row is a reference line, not a bar, because it is every policy pooled.</p>' +
    `${legend}${charts}</section>`
  );
}

function legendFor(
  names: readonly string[],
  assignment: ReadonlyMap<string, number>,
  what: string,
): string {
  const items = names
    .map(
      (name) =>
        `<li><span class="swatch slot-${slotOf(assignment, name)}"></span>${escapeHtml(name)}</li>`,
    )
    .join('');
  return `<ul class="legend" aria-label="${escapeHtml(what)} colours">${items}</ul>`;
}

// ---------------------------------------------------------------------------
// View 2 — option frequency
// ---------------------------------------------------------------------------

function optionGroupSvg(group: OptionGroup, assignment: ReadonlyMap<string, number>): string {
  const bandHeight = 40;
  const top = 10;
  const height = top + group.bars.length * bandHeight + 10;
  const axisX = LABEL_GUTTER;
  const slot = slotOf(assignment, group.archetype);
  const sub = 12; // two bars of 12px with a 2px surface gap inside a 26px stack
  const parts: string[] = [
    `<line class="axis" x1="${axisX}" y1="${top - 4}" x2="${axisX}" y2="${top + group.bars.length * bandHeight}" />`,
  ];
  group.bars.forEach((bar, index) => {
    const y = top + index * bandHeight + 5;
    const offeredWidth = scale(bar.offered, group.scaleMax);
    const chosenWidth = scale(bar.chosen, group.scaleMax);
    const unreachable = bar.appearances - bar.offered;
    const shareText = bar.share === null ? 'never reachable' : `${TWO_DP.format(bar.share * 100)}%`;
    // The SHORT form rides the mark; the long form is in the `<title>` hover and
    // in the table view, so nothing is lost and nothing is clipped.
    const label =
      `${count(bar.chosen)} chosen / ${count(bar.offered)} offered · ${shareText}` +
      (unreachable > 0 ? ` · ${count(unreachable)} unreachable` : '') +
      (bar.chosen > bar.offered ? ' · taken while unreachable' : '');
    const detail =
      `chosen ${count(bar.chosen)} of ${count(bar.offered)} offers where it was reachable (weight > 0)` +
      (bar.share === null
        ? ' — never reachable'
        : ` · ${TWO_DP.format(bar.share * 100)}% of offers taken`) +
      (unreachable > 0
        ? ` · listed but unreachable (weight 0) in ${count(unreachable)} decision(s)`
        : '') +
      (bar.chosen > bar.offered
        ? ' · CHOSEN MORE OFTEN THAN IT WAS REACHABLE — the picker is taking this option out of the all-weights-zero corner, which is a finding about the decision function, not about preference'
        : '');
    parts.push(
      `<g><title>${escapeHtml(bar.option)} — ${escapeHtml(detail)}</title>` +
        `<text class="row-label" x="${axisX - 10}" y="${y + 17}" text-anchor="end">${escapeHtml(bar.option)}</text>` +
        `<path class="bar track slot-${slot}" d="${barPath(axisX, y, offeredWidth, sub)}" />` +
        `<path class="bar slot-${slot}" d="${barPath(axisX, y + sub + 2, chosenWidth, sub)}" />` +
        `<text class="value-label" x="${axisX + Math.max(offeredWidth, chosenWidth) + 8}" y="${y + 17}">${escapeHtml(label)}</text></g>`,
    );
  });
  return svg(height, parts.join(''), `${group.key} option frequency`);
}

function optionGroupTable(group: OptionGroup): string {
  const rows = group.bars
    .map(
      (bar) =>
        `<tr><td>${escapeHtml(bar.option)}</td><td>${escapeHtml(count(bar.chosen))}</td><td>${escapeHtml(count(bar.offered))}</td><td>${escapeHtml(count(bar.appearances))}</td><td>${bar.share === null ? '—' : escapeHtml(`${TWO_DP.format(bar.share * 100)}%`)}</td></tr>`,
    )
    .join('');
  return (
    '<details class="table-view"><summary>Table view</summary><div class="scroll"><table>' +
    '<thead><tr><th>option</th><th>chosen</th><th>offered (weight &gt; 0)</th><th>appeared at all</th><th>share</th></tr></thead>' +
    `<tbody>${rows}</tbody></table></div></details>`
  );
}

function renderTraces(view: TraceView, assignment: ReadonlyMap<string, number>): string {
  const files = view.files
    .map(
      (file) =>
        `<tr><td><code>${escapeHtml(file.path)}</code></td><td>${escapeHtml(file.sweepLabel ?? '—')}</td><td>${escapeHtml(file.shard ?? '—')}</td><td>${escapeHtml(count(file.lines))}</td><td>${escapeHtml(count(file.parsed))}</td><td>${escapeHtml(count(file.skipped))}</td><td><code>${escapeHtml(file.sha256short)}</code></td></tr>`,
    )
    .join('');
  const caveats = view.caveats.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  const groups = view.groups
    .map(
      (group) =>
        `<figure class="chart-block"><figcaption><h4>${escapeHtml(group.key)}</h4>` +
        `<p class="note">${escapeHtml(count(group.decisions))} decisions · option axis: ${escapeHtml(group.axisLabel)}</p></figcaption>` +
        `<div class="scroll">${optionGroupSvg(group, assignment)}</div>${optionGroupTable(group)}</figure>`,
    )
    .join('');
  return (
    '<h3>2a · NPC decisions (T-140 traces)</h3>' +
    `<p class="lede">${escapeHtml(count(view.totalDecisions))} decisions across ${view.files.length} file(s). ` +
    'The upper bar is how often an option was OFFERED and reachable (weight &gt; 0); the lower bar is how often it was CHOSEN. ' +
    'A short lower bar under a long upper bar is a preference finding; two short bars are a reach problem — spec §4 asks for exactly this distinction.</p>' +
    '<ul class="legend" aria-label="trace series"><li><span class="swatch track slot-1"></span>offered (weight &gt; 0)</li><li><span class="swatch slot-1"></span>chosen</li></ul>' +
    `<ul class="caveats">${caveats}</ul>` +
    '<div class="scroll"><table class="files"><thead><tr><th>file</th><th>sweep label</th><th>shard</th><th>lines</th><th>parsed</th><th>skipped</th><th>sha256</th></tr></thead>' +
    `<tbody>${files}</tbody></table></div>${groups}`
  );
}

function playtestSvg(view: PlaytestView): string {
  const bandHeight = 34;
  const top = 10;
  const height = top + view.bars.length * bandHeight + 10;
  const axisX = LABEL_GUTTER;
  const parts: string[] = [
    `<line class="axis" x1="${axisX}" y1="${top - 4}" x2="${axisX}" y2="${top + view.bars.length * bandHeight}" />`,
  ];
  view.bars.forEach((bar, index) => {
    const y = top + index * bandHeight + (bandHeight - BAR_THICKNESS) / 2;
    const width = scale(bar.count, view.scaleMax);
    const shareText =
      view.actionEntries === 0
        ? ''
        : ` · ${TWO_DP.format((bar.count / view.actionEntries) * 100)}% of actions`;
    parts.push(
      `<g><title>${escapeHtml(bar.option)} — ${escapeHtml(count(bar.count))}${escapeHtml(shareText)}</title>` +
        `<text class="row-label" x="${axisX - 10}" y="${y + 15}" text-anchor="end">${escapeHtml(bar.option)}</text>` +
        `<path class="bar slot-1" d="${barPath(axisX, y, width, BAR_THICKNESS)}" />` +
        `<text class="value-label" x="${axisX + width + 8}" y="${y + 15}">${escapeHtml(count(bar.count))}<tspan class="sample">${escapeHtml(shareText)}</tspan></text></g>`,
    );
  });
  return svg(height, parts.join(''), 'player actions by type');
}

function renderPlaytest(view: PlaytestView): string {
  const files = view.files
    .map(
      (file) =>
        `<tr><td><code>${escapeHtml(file.path)}</code></td><td>${escapeHtml(file.format)}</td><td>${escapeHtml(count(file.entries))}</td><td>${escapeHtml(count(file.bytes))}</td><td><code>${escapeHtml(file.sha256short)}</code></td></tr>`,
    )
    .join('');
  const table = view.bars
    .map(
      (bar) =>
        `<tr><td>${escapeHtml(bar.option)}</td><td>${escapeHtml(count(bar.count))}</td></tr>`,
    )
    .join('');
  return (
    '<h3>2b · Human playtest actions (T-141 exports)</h3>' +
    `<p class="lede">${escapeHtml(count(view.actionEntries))} action entries across ${view.files.length} export(s) and ${view.sessions.length} session(s). ` +
    'One bar per <code>PlayerAction</code> type.</p>' +
    `<p class="note">Excluded from the bars, deliberately, and counted here instead: ${escapeHtml(count(view.annotationEntries))} tester annotation(s) and ${escapeHtml(count(view.errorEntries))} error entr(ies). Neither is a player action, so neither may enter an action-frequency chart.</p>` +
    '<div class="scroll"><table class="files"><thead><tr><th>file</th><th>format</th><th>entries</th><th>bytes</th><th>sha256</th></tr></thead>' +
    `<tbody>${files}</tbody></table></div>` +
    `<div class="scroll">${playtestSvg(view)}</div>` +
    '<details class="table-view"><summary>Table view</summary><div class="scroll"><table>' +
    `<thead><tr><th>action type</th><th>count</th></tr></thead><tbody>${table}</tbody></table></div></details>`
  );
}

// ---------------------------------------------------------------------------
// View 3 — before/after
// ---------------------------------------------------------------------------

const PAIR_SUB = 12;

function pairSvg(row: BeforeAfterRow, format: MetricFormat, max: number): string {
  const height = 34;
  const axisX = 4;
  const width = 300;
  const scaleTo = (value: number): number =>
    max <= 0 ? 0 : (Math.max(0, value) / max) * (width - 8);
  const body =
    `<line class="axis" x1="${axisX}" y1="2" x2="${axisX}" y2="${height - 2}" />` +
    `<g><title>before ${escapeHtml(formatValue(row.before, format))}</title>` +
    `<path class="bar slot-1" d="${barPath(axisX, 3, scaleTo(row.before), PAIR_SUB)}" /></g>` +
    `<g><title>after ${escapeHtml(formatValue(row.after, format))}</title>` +
    `<path class="bar slot-2" d="${barPath(axisX, 3 + PAIR_SUB + 2, scaleTo(row.after), PAIR_SUB)}" /></g>`;
  return (
    `<svg class="pair" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" ` +
    `aria-label="${escapeHtml(`${row.row} ${row.metric}`)}" preserveAspectRatio="xMinYMin meet">${body}</svg>`
  );
}

function renderBeforeAfter(view: BeforeAfterView): string {
  const byMetric = new Map<string, BeforeAfterRow[]>();
  for (const row of view.rows) {
    const bucket = byMetric.get(row.metric);
    if (bucket) bucket.push(row);
    else byMetric.set(row.metric, [row]);
  }
  const metricFormat = new Map<string, MetricFormat>();
  for (const row of view.rows) {
    if (!metricFormat.has(row.metric)) {
      metricFormat.set(row.metric, guessFormat(row.metric));
    }
  }

  const blocks = [...byMetric.entries()]
    .map(([metric, rows]) => {
      const format = metricFormat.get(metric) ?? 'count';
      const max = Math.max(0, ...rows.flatMap((row) => [row.before, row.after]));
      const body = rows
        .map(
          (row) =>
            `<div class="ba-row"><div class="ba-name">${escapeHtml(row.row)}</div>` +
            pairSvg(row, format, max) +
            '<div class="ba-figures">' +
            `<div class="ba-values"><span class="ba-before">before ${escapeHtml(formatValue(row.before, format))}</span> → <span class="ba-after">after ${escapeHtml(formatValue(row.after, format))}</span></div>` +
            `<div class="ba-delta">delta ${escapeHtml(formatDelta(row, format))}</div>` +
            `<div class="ba-samples">before: ${escapeHtml(count(row.beforeSeeds))} seeds · ${escapeHtml(count(row.beforeRuns))} runs${row.beforeN === null ? '' : ` · n ${escapeHtml(count(row.beforeN))}`} &nbsp;|&nbsp; after: ${escapeHtml(count(row.afterSeeds))} seeds · ${escapeHtml(count(row.afterRuns))} runs${row.afterN === null ? '' : ` · n ${escapeHtml(count(row.afterN))}`}</div>` +
            (row.sampleWarning === null
              ? ''
              : `<div class="ba-warn">Sample caution: ${escapeHtml(row.sampleWarning)}</div>`) +
            '</div></div>',
        )
        .join('');
      return `<figure class="chart-block"><figcaption><h4>${escapeHtml(metric)}</h4></figcaption><div class="ba-rows">${body}</div></figure>`;
    })
    .join('');

  const shape =
    view.shapeChanges.length === 0
      ? '<p class="note">No shape changes: both aggregates carry the same set of paths.</p>'
      : '<div class="callout callout-shape"><h4>Shape changes — the two aggregates are not the same measurement</h4>' +
        `<p>${escapeHtml(count(view.shapeChanges.length))} path(s) exist on one side only, across row(s): ${escapeHtml(view.shapeChangeRows.join(', '))}. ` +
        'A path present on one side only means the two were produced by different instrument versions; it is reported here rather than folded into “unchanged”.</p>' +
        '<div class="scroll"><table><thead><tr><th>path</th><th>row</th><th>present in</th></tr></thead><tbody>' +
        view.shapeChanges
          .slice(0, 40)
          .map(
            (change) =>
              `<tr><td><code>${escapeHtml(change.path)}</code></td><td>${escapeHtml(change.row)}</td><td>${escapeHtml(change.presentIn)}</td></tr>`,
          )
          .join('') +
        `</tbody></table></div>${view.shapeChanges.length > 40 ? `<p class="note">… ${escapeHtml(count(view.shapeChanges.length - 40))} more.</p>` : ''}</div>`;

  const verdict = view.identical
    ? '<p class="callout callout-quiet">NOTHING MOVED. Every compared field is equal on both sides.</p>'
    : view.noMeasuredValueMoved
      ? '<div class="callout callout-shape"><h4>NO MEASURED VALUE MOVED</h4><p>Every difference between these two aggregates is a SHAPE difference: fields present on one side only. ' +
        'The rows listed as moved are listed because the aggregates differ, not because a number did.</p></div>'
      : `<p class="note">Moved rows (${escapeHtml(count(view.movedRows.length))}): ${escapeHtml(view.movedRows.join(', ') || '—')}. Unchanged rows: ${escapeHtml(view.unchangedRows.join(', ') || '—')}.</p>`;

  return (
    '<section id="before-after"><h2>3 · Before / after</h2>' +
    `<p class="lede"><strong>${escapeHtml(view.beforeLabel)}</strong> (${escapeHtml(count(view.beforeSeeds))} seeds × ${escapeHtml(count(view.beforeDays))} days) → ` +
    `<strong>${escapeHtml(view.afterLabel)}</strong> (${escapeHtml(count(view.afterSeeds))} seeds × ${escapeHtml(count(view.afterDays))} days).</p>` +
    '<ul class="legend" aria-label="before/after series"><li><span class="swatch slot-1"></span>before</li><li><span class="swatch slot-2"></span>after</li></ul>' +
    '<p class="note">Every row below prints both inputs’ seed and run counts beside its delta — a delta is never shown bare. ' +
    'Where a row carries a “Sample caution”, that is a display heuristic, not a governed balance band: it says “look at the ' +
    'sample sizes before you believe this delta”, never “this delta failed a threshold”. The governed bands live in ' +
    '<code>docs/BALANCE-POLICY.md</code> and nothing on this page is one of them.</p>' +
    (view.seedsDiffer
      ? '<div class="callout callout-warn"><h4>The two sides are not the same width</h4><p>' +
        `Before ran ${escapeHtml(count(view.beforeSeeds))} seeds; after ran ${escapeHtml(count(view.afterSeeds))}. ` +
        'Every delta below prints both seed counts beside it for this reason. This repository has the lesson written down: ' +
        'in <code>docs/BALANCE-REDESIGN-WORKLIST.md</code> Appendix A a candidate PASSED at n=100 seeds and FAILED at n=1,000.</p></div>'
      : '') +
    `${verdict}${shape}${blocks}</section>`
  );
}

function guessFormat(metricTitle: string): MetricFormat {
  const lower = metricTitle.toLowerCase();
  if (lower.includes('rate') || lower.includes('share')) return 'rate';
  if (lower.includes('credits')) return 'credits';
  if (lower.includes('day')) return 'days';
  return 'count';
}

// ---------------------------------------------------------------------------
// Provenance header & ruleset banners (spec §3)
// ---------------------------------------------------------------------------

function provenanceRow(role: string, provenance: InputProvenance): string {
  const stamp = (value: string | undefined): string =>
    value === undefined
      ? '<span class="unknown">unknown</span>'
      : `<code>${escapeHtml(value)}</code>`;
  const declared =
    provenance.declaredBy === undefined
      ? ''
      : `<div class="declared">stamps declared by <code>${escapeHtml(provenance.declaredBy)}</code> — NOT by the aggregate itself</div>`;
  return (
    `<tr><td>${escapeHtml(role)}</td><td><code>${escapeHtml(provenance.path)}</code>${declared}</td>` +
    `<td>${escapeHtml(count(provenance.bytes))}</td><td><code>${escapeHtml(provenance.sha256short)}</code></td>` +
    `<td>${stamp(provenance.rulesFingerprint)}</td><td>${stamp(provenance.instrumentFingerprint)}</td>` +
    `<td>${stamp(provenance.gitCommit)}</td><td>${stamp(provenance.productVersion)}</td></tr>`
  );
}

/** Spec §3, in all three directions. `unknown` gets a banner as loud as
 *  `different` — because it is not `same`, and it is what any pair of aggregates
 *  merged before T-183 still produces (F-142-1). */
function rulesetBanner(comparison: RulesetComparison): string {
  const parts: string[] = [];
  if (comparison.rules === 'different') {
    parts.push(
      '<div class="callout callout-loud"><h3>THESE TWO RUNS DESCRIBE DIFFERENT RULESETS</h3><p>' +
        `<code>${escapeHtml(comparison.beforeRules ?? '')}</code> vs <code>${escapeHtml(comparison.afterRules ?? '')}</code>. ` +
        'A before/after across a rules change is a legitimate comparison — that is the whole point of a redesign-track diff — ' +
        'but this is NOT a same-ruleset diff, and nothing below may be read as one.</p></div>',
    );
  } else if (comparison.rules === 'unknown') {
    parts.push(
      '<div class="callout callout-loud"><h3>RULESET UNKNOWN FOR ONE OR BOTH INPUTS</h3><p>' +
        'At least one input predates T-183, when <code>sweep.ts --merge</code> began stamping every merged aggregate with its ' +
        'own <code>rulesFingerprint</code> (finding F-142-1: before that, <code>BaselineAggregate</code> had seven top-level keys ' +
        'and none of them was a stamp). This comparison therefore CANNOT be assumed same-ruleset. Re-merge the unstamped arm, or ' +
        'supply <code>--provenance</code> / <code>--compare-provenance</code> pointing at an artefact that does carry the stamps ' +
        '(<code>docs/balance/smoke/tiers.json</code> is one) to answer the question.</p></div>',
    );
  } else {
    parts.push(
      `<p class="callout callout-quiet">Same ruleset on both sides: <code>${escapeHtml(comparison.beforeRules ?? '')}</code>.</p>`,
    );
  }
  if (comparison.instrument === 'different') {
    parts.push(
      '<div class="callout callout-loud"><h3>DIFFERENT INSTRUMENT VERSIONS</h3><p>' +
        `<code>${escapeHtml(comparison.beforeInstrument ?? '')}</code> vs <code>${escapeHtml(comparison.afterInstrument ?? '')}</code>. ` +
        'An instrument change invalidates a measurement as thoroughly as a rules change — the two runs measured the same game with ' +
        'different thermometers.</p></div>',
    );
  } else if (comparison.instrument === 'unknown') {
    parts.push(
      '<p class="callout callout-warn">Instrument version unknown for one or both inputs — same cause as above: an input merged before T-183 (F-142-1).</p>',
    );
  } else {
    parts.push(
      `<p class="callout callout-quiet">Same instrument on both sides: <code>${escapeHtml(comparison.beforeInstrument ?? '')}</code>.</p>`,
    );
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const STYLE = `
:root{color-scheme:light dark}
.viz-root{
  color-scheme:light;
  --surface-1:#fcfcfb;--plane:#f9f9f7;--text-primary:#0b0b0b;--text-secondary:#52514e;
  --muted:#898781;--grid:#e1e0d9;--baseline:#c3c2b7;--border:rgba(11,11,11,0.10);
  --loud-bg:#fdecea;--loud-ink:#7a1c1c;--loud-edge:#d03b3b;
  --warn-bg:#fdf3e0;--warn-ink:#6b4a05;--warn-edge:#fab219;
  --quiet-bg:#eef5ee;--quiet-ink:#134a13;--quiet-edge:#0ca30c;
  --shape-bg:#eef2fb;--shape-ink:#1c3f70;--shape-edge:#2a78d6;
  ${slotVariables(SERIES_LIGHT)}
}
@media (prefers-color-scheme:dark){
  :root:where(:not([data-theme="light"])) .viz-root{
    color-scheme:dark;
    --surface-1:#1a1a19;--plane:#0d0d0d;--text-primary:#ffffff;--text-secondary:#c3c2b7;
    --muted:#898781;--grid:#2c2c2a;--baseline:#383835;--border:rgba(255,255,255,0.10);
    --loud-bg:#3a1414;--loud-ink:#ffd9d6;--loud-edge:#e66767;
    --warn-bg:#3a2f10;--warn-ink:#f6e2b0;--warn-edge:#fab219;
    --quiet-bg:#142a14;--quiet-ink:#cfe8cf;--quiet-edge:#0ca30c;
    --shape-bg:#12233a;--shape-ink:#cfe0f7;--shape-edge:#3987e5;
    ${slotVariables(SERIES_DARK)}
  }
}
:root[data-theme="dark"] .viz-root{
  color-scheme:dark;
  --surface-1:#1a1a19;--plane:#0d0d0d;--text-primary:#ffffff;--text-secondary:#c3c2b7;
  --muted:#898781;--grid:#2c2c2a;--baseline:#383835;--border:rgba(255,255,255,0.10);
  --loud-bg:#3a1414;--loud-ink:#ffd9d6;--loud-edge:#e66767;
  --warn-bg:#3a2f10;--warn-ink:#f6e2b0;--warn-edge:#fab219;
  --quiet-bg:#142a14;--quiet-ink:#cfe8cf;--quiet-edge:#0ca30c;
  --shape-bg:#12233a;--shape-ink:#cfe0f7;--shape-edge:#3987e5;
  ${slotVariables(SERIES_DARK)}
}
.viz-root{
  background:var(--plane);color:var(--text-primary);
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:15px;line-height:1.5;margin:0;padding:24px 16px 64px;
}
.wrap{max-width:1040px;margin:0 auto}
h1{font-size:1.6rem;margin:0 0 4px}
h2{font-size:1.25rem;margin:40px 0 8px;padding-top:16px;border-top:1px solid var(--border)}
h3{font-size:1.05rem;margin:24px 0 4px}
h4{font-size:0.95rem;margin:16px 0 4px}
p{margin:6px 0}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.85em}
.lede{color:var(--text-secondary)}
.note{color:var(--muted);font-size:0.85rem}
.unknown{color:var(--muted);font-style:italic}
.declared{color:var(--muted);font-size:0.78rem}
section{margin-bottom:8px}
figure.chart-block{margin:20px 0;padding:12px;background:var(--surface-1);
  border:1px solid var(--border);border-radius:8px}
figure.chart-block figcaption h3,figure.chart-block figcaption h4{margin-top:0}
.scroll{overflow-x:auto;max-width:100%}
svg.chart{display:block;min-width:600px}
svg .axis{stroke:var(--baseline);stroke-width:1}
svg .reference{stroke:var(--text-secondary);stroke-width:2}
svg text{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:12px;fill:var(--text-primary)}
svg text.row-label{fill:var(--text-secondary);font-size:12px}
svg text.value-label{fill:var(--text-primary);font-size:12px}
svg text.value-label.absent{fill:var(--muted);font-style:italic}
svg tspan.sample{fill:var(--muted);font-size:11px}
svg text.reference-label{fill:var(--text-secondary);font-size:11px}
svg .bar.slot-1{fill:var(--slot-1)}svg .bar.slot-2{fill:var(--slot-2)}
svg .bar.slot-3{fill:var(--slot-3)}svg .bar.slot-4{fill:var(--slot-4)}
svg .bar.slot-5{fill:var(--slot-5)}svg .bar.slot-6{fill:var(--slot-6)}
svg .bar.slot-7{fill:var(--slot-7)}svg .bar.slot-8{fill:var(--slot-8)}
svg .bar.slot-other{fill:var(--slot-other)}
svg .bar.track{opacity:0.32}
ul.legend{list-style:none;display:flex;flex-wrap:wrap;gap:14px;padding:0;margin:8px 0 4px;
  font-size:0.85rem;color:var(--text-secondary)}
ul.legend li{display:flex;align-items:center;gap:6px}
.swatch{width:12px;height:12px;border-radius:3px;display:inline-block}
.swatch.slot-1{background:var(--slot-1)}.swatch.slot-2{background:var(--slot-2)}
.swatch.slot-3{background:var(--slot-3)}.swatch.slot-4{background:var(--slot-4)}
.swatch.slot-5{background:var(--slot-5)}.swatch.slot-6{background:var(--slot-6)}
.swatch.slot-7{background:var(--slot-7)}.swatch.slot-8{background:var(--slot-8)}
.swatch.slot-other{background:var(--slot-other)}
.swatch.track{opacity:0.32}
ul.caveats{font-size:0.85rem;color:var(--text-secondary);padding-left:18px;margin:8px 0}
table{border-collapse:collapse;width:100%;font-size:0.82rem;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--grid);vertical-align:top}
th{color:var(--text-secondary);font-weight:600}
details.table-view{margin-top:8px}
details.table-view summary{cursor:pointer;color:var(--text-secondary);font-size:0.85rem}
.callout{border-radius:8px;padding:10px 14px;margin:12px 0;border-left:4px solid}
.callout h3,.callout h4{margin:0 0 4px}
.callout-loud{background:var(--loud-bg);color:var(--loud-ink);border-left-color:var(--loud-edge)}
.callout-warn{background:var(--warn-bg);color:var(--warn-ink);border-left-color:var(--warn-edge)}
.callout-quiet{background:var(--quiet-bg);color:var(--quiet-ink);border-left-color:var(--quiet-edge)}
.callout-shape{background:var(--shape-bg);color:var(--shape-ink);border-left-color:var(--shape-edge)}
.ba-rows{display:flex;flex-direction:column;gap:10px}
.ba-row{display:grid;grid-template-columns:130px minmax(0,300px) minmax(0,1fr);gap:12px;
  align-items:center;padding:6px 0;border-bottom:1px solid var(--grid)}
.ba-name{color:var(--text-secondary);font-size:0.85rem}
.ba-figures{font-size:0.82rem}
.ba-values{color:var(--text-primary)}
.ba-delta{color:var(--text-primary);font-weight:600}
.ba-samples{color:var(--muted)}
.ba-warn{color:var(--warn-ink);background:var(--warn-bg);border-radius:4px;padding:2px 6px;margin-top:2px}
@media (max-width:720px){.ba-row{grid-template-columns:1fr}}
footer{margin-top:48px;padding-top:16px;border-top:1px solid var(--border);
  color:var(--muted);font-size:0.82rem}
`;

export interface RenderOptions {
  /** ISO timestamp. A PARAMETER so the renderer stays deterministic. */
  generatedAt: string;
}

export function renderReportHtml(model: ReportModel, options: RenderOptions): string {
  const names = [
    ...model.leaderboard.policies,
    ...(model.traces?.groups.map((group) => group.archetype) ?? []),
  ];
  const assignment = assignSlots(names);

  const provenanceRows = [provenanceRow('aggregate', model.leaderboard.provenance)];
  if (model.beforeAfter) {
    provenanceRows.length = 0;
    provenanceRows.push(provenanceRow('before', model.beforeAfter.beforeProvenance));
    provenanceRows.push(provenanceRow('after', model.beforeAfter.afterProvenance));
  }
  for (const file of model.traces?.files ?? []) {
    provenanceRows.push(
      `<tr><td>trace</td><td><code>${escapeHtml(file.path)}</code></td><td>${escapeHtml(count(file.bytes))}</td>` +
        `<td><code>${escapeHtml(file.sha256short)}</code></td><td colspan="4"><span class="unknown">a trace file carries no stamps</span></td></tr>`,
    );
  }
  for (const file of model.playtest?.files ?? []) {
    provenanceRows.push(
      `<tr><td>playtest log</td><td><code>${escapeHtml(file.path)}</code></td><td>${escapeHtml(count(file.bytes))}</td>` +
        `<td><code>${escapeHtml(file.sha256short)}</code></td><td colspan="4"><span class="unknown">an export carries no stamps</span></td></tr>`,
    );
  }

  const banner = model.beforeAfter ? rulesetBanner(model.beforeAfter.rulesets) : '';

  const generator =
    model.generator === null
      ? '<p>Generator tree fingerprints unavailable (the fingerprint walk threw — see the CLI output).</p>'
      : `<p>Generated on a tree whose <code>rulesFingerprint</code> is <code>${escapeHtml(model.generator.rulesFingerprint)}</code> and ` +
        `whose <code>instrumentFingerprint</code> is <code>${escapeHtml(model.generator.instrumentFingerprint)}</code>. ` +
        '<strong>That is the tree this report was generated on — NOT the ruleset of any input above.</strong> ' +
        'An input is only ever stamped by what it carries itself or by an explicitly supplied sidecar; attaching the current ' +
        'tree&#39;s fingerprint to an artefact measured months ago would manufacture provenance.</p>';

  const body =
    '<div class="wrap">' +
    `<h1>Telemetry report — ${escapeHtml(model.name)}</h1>` +
    `<p class="lede">Generated ${escapeHtml(options.generatedAt)} · <code>docs/TELEMETRY-REPORT_SPEC.md</code> Tier 1 · read-only over its inputs.</p>` +
    '<h2 id="provenance">0 · Provenance</h2>' +
    '<div class="scroll"><table><thead><tr><th>role</th><th>file</th><th>bytes</th><th>sha256 (16)</th>' +
    '<th>rulesFingerprint</th><th>instrumentFingerprint</th><th>gitCommit</th><th>productVersion</th></tr></thead>' +
    `<tbody>${provenanceRows.join('')}</tbody></table></div>` +
    banner +
    renderLeaderboard(model.leaderboard, assignment) +
    (model.traces || model.playtest
      ? '<section id="option-frequency"><h2>2 · Option frequency</h2>' +
        (model.traces ? renderTraces(model.traces, assignment) : '') +
        (model.playtest ? renderPlaytest(model.playtest) : '') +
        '</section>'
      : '') +
    (model.beforeAfter ? renderBeforeAfter(model.beforeAfter) : '') +
    `<footer>${generator}<p>Self-contained: no script, no network, no external asset. Nothing in this page is committed to the repository.</p></footer>` +
    '</div>';

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Telemetry report — ${escapeHtml(model.name)}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body class="viz-root">',
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
