// ---------------------------------------------------------------------------
// T-153 · SEEDED-BAD FIXTURES FOR THE SWEEP GATE.
//
// A plain support module (NOT a `*.test.ts` file, so vitest never collects it as
// a suite), holding the fixture builders `../sweep-gate.test.ts` drives the gate
// with. The suite owns the assertions; this file owns only the inputs.
//
// THE CONSTRUCTION, AND WHY IT IS NOT HAND-BUILT. Every bad fixture is ONE NAMED
// MUTATION off a REAL `CampaignStatsReport` produced by `runCampaign` — see
// {@link cleanReport} and {@link corrupt}. Three reasons, each of which a
// hand-assembled literal would forfeit:
//
//   1. The "clean/current-state fixture" the acceptance line asks for is then
//      literally the current state, not a curated one that agrees with today's
//      engine by coincidence.
//   2. Each bad fixture differs from a passing one in exactly one field, so the
//      test that consumes it says precisely which defect class it models. A
//      hand-built report differs from reality in every field nobody thought about.
//   3. The fixtures cannot rot as `CampaignStatsReport` grows. A literal would owe
//      an edit for every new required field and would silently drift on every
//      optional one.
//
// The two RECORD builders below ({@link encounterRecord}, {@link legRecord}) are
// the exception, and deliberately: the malformed-record invariants are asserted by
// PUSHING a record onto a real report rather than mutating one that happens to be
// there, so the fixture does not depend on the seeded career having fought or
// signed anything.
//
// MILESTONE DAYS ARE LOAD-BEARING, not decoration. `assertFuelWithinTank`'s EXACT
// `fuel <= maxFuel` branch only reads `milestones[]` (a `CampaignDayStats` carries
// no `maxFuel`), so a fixture built without them can only ever reach the weak
// absolute-ceiling tier. {@link FIXTURE_MILESTONES} is the same `10,30` the CI
// `gate` job passes, for the reason `.github/workflows/sweep-gate.yml` states at
// that flag.
//
// NOTHING HERE MAY BE EDITED TO MAKE A TEST PASS — not a band, not a `minSample`,
// not a seed range chosen to dodge a failure. `../../balance/gate.ts`'s "there is
// no opt-out" rule applies to the gate's own fixtures as much as to the gate.
// ---------------------------------------------------------------------------

import type { RenownRankId } from '@spacerquest/content';
import { RENOWN_RANK_ORDER } from '@spacerquest/engine';

import {
  runCampaign,
  type CampaignStatsReport,
  type CombatEncounterRecord,
  type RouteLegRecord,
  type SimPolicyName,
} from '../../index.js';
import {
  aggregate,
  summarizeReport,
  type BaselineAggregate,
  type SeedRow,
} from '../../balance/aggregate.js';
import type { SensitivityArm } from '../../balance/gate.js';

// ---------------------------------------------------------------------------
// The clean, current-state base
// ---------------------------------------------------------------------------

/** The seed every single-report fixture is built from. Any seed would do; this
 *  one is pinned so a failure is reproducible from the test name alone. */
export const FIXTURE_SEED = 1;

/** The CI `gate` job's horizon. The shortest arm that carries through the day-30
 *  Tour One resolution, so the fixtures exercise a resolved run without making
 *  this suite the test wall-clock floor. */
export const FIXTURE_DAYS = 35;

/** The CI `gate` job's `--milestone-days`, verbatim. See the header. */
export const FIXTURE_MILESTONES: readonly number[] = [10, 30];

// One real career per policy, reused across every fixture in the suite. A
// 35-day run is ~140ms; rebuilding it per fixture would multiply the suite's cost
// by the fixture count for an identical input.
const cleanReportCache = new Map<SimPolicyName, CampaignStatsReport>();

/**
 * A REAL, CURRENT-STATE report — the clean fixture, and the base every seeded-bad
 * fixture is one mutation away from.
 *
 * Cached per policy and returned by reference: callers must go through
 * {@link corrupt}, which clones, rather than mutating what they were handed.
 */
export function cleanReport(policy: SimPolicyName = 'trader'): CampaignStatsReport {
  const cached = cleanReportCache.get(policy);
  if (cached !== undefined) return cached;
  const report = runCampaign(FIXTURE_SEED, FIXTURE_DAYS, policy, {
    milestoneDays: FIXTURE_MILESTONES,
  });
  cleanReportCache.set(policy, report);
  return report;
}

/**
 * Clone a report and apply ONE named defect to the copy.
 *
 * `structuredClone` rather than a spread: the mutations below reach into
 * `daily[]`, `milestones[]` and the record arrays, and a shallow copy would
 * corrupt the cached clean base — which would then leak a defect into every later
 * fixture and, worse, into the clean-fixture test itself. The report is plain JSON
 * data (`reportToJson` round-trips it), so a structured clone is exact.
 */
export function corrupt(
  base: CampaignStatsReport,
  mutate: (report: CampaignStatsReport) => void,
): CampaignStatsReport {
  const copy = structuredClone(base);
  mutate(copy);
  return copy;
}

// ---------------------------------------------------------------------------
// Record builders — for the two "malformed record" invariants
// ---------------------------------------------------------------------------

/** A WELL-FORMED combat record. Every malformed fixture below overrides exactly
 *  the field whose defect it models, so the record is otherwise legal and the
 *  violation cannot be attributed to anything else. */
export function encounterRecord(
  overrides: Partial<CombatEncounterRecord> = {},
): CombatEncounterRecord {
  return {
    encounterId: 'enc-t153',
    day: 2,
    interceptorTier: 1,
    playerTier: 1,
    prepared: false,
    rounds: 1,
    creditsDelta: 0,
    tributeCredits: 0,
    salvageCredits: 0,
    fineCredits: 0,
    successionCredits: 0,
    travelCompleted: true,
    fuelUnits: 0,
    fuelCredits: 0,
    repairCredits: 0,
    resolution: 'defeated',
    shipLost: false,
    ...overrides,
  };
}

/** A WELL-FORMED delivered route leg. Same discipline as {@link encounterRecord}. */
export function legRecord(overrides: Partial<RouteLegRecord> = {}): RouteLegRecord {
  return {
    signedDay: 2,
    originSystem: 1,
    destination: 9,
    cargoType: 1,
    quotedPayment: 1000,
    paidPayment: 1000,
    deliveredDay: 4,
    fuelUnitsWhileOpen: 0,
    fuelPriceAtSigning: 5,
    outcome: 'delivered',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The clean ROW sample — the denominator the rate table needs
// ---------------------------------------------------------------------------

/**
 * Seeds and policies of the clean row sample.
 *
 * SIZED BY THE `minSample` FLOORS, NOT BY TASTE. 52 seeds x 2 policies = 104 rows
 * x 35 days = 3,640 sim-days, which clears every denominator floor in
 * `EXPECTED_EVENT_RATES` at once — including the two tightest, `tour-one-clear-share`
 * and `runs-earning-any-deed-share`, whose denominators are RUNS (100 needed, 104
 * supplied) rather than days. A smaller sample reports SKIPPED, and a clean fixture
 * that skips is green-but-hollow, which is the exact failure mode
 * `docs/TESTING-STRATEGY.md` Part A opens with.
 *
 * IF A RATE EVER LANDS OUT OF BAND ON THIS SAMPLE, the remedy is MORE SEEDS or a
 * filed finding — never a widened band and never a lowered `minSample`. See
 * `EXPECTED_EVENT_RATES`' own doc-block, which refuses both in those words.
 */
export const ROW_SAMPLE_SEEDS = 52;
export const ROW_SAMPLE_POLICIES: readonly SimPolicyName[] = ['trader', 'fighter'];

let cleanRowCache: SeedRow[] | null = null;

/** The clean 104-row sample, built from real campaigns. ~5.4s on the authoring
 *  machine, which is why the suite builds it once in a `beforeAll` with an
 *  explicit timeout (vitest's default hook timeout is 5s and would otherwise bite). */
export function cleanRows(): SeedRow[] {
  if (cleanRowCache !== null) return cleanRowCache;
  const rows: SeedRow[] = [];
  for (let seed = 1; seed <= ROW_SAMPLE_SEEDS; seed += 1) {
    for (const policy of ROW_SAMPLE_POLICIES) {
      rows.push(
        summarizeReport(
          runCampaign(seed, FIXTURE_DAYS, policy, { milestoneDays: FIXTURE_MILESTONES }),
        ),
      );
    }
  }
  cleanRowCache = rows;
  return rows;
}

/** Map every row through one named defect. Rows are cloned, so the shared clean
 *  sample is never touched — the same reason {@link corrupt} clones. */
export function corruptRows(rows: readonly SeedRow[], mutate: (row: SeedRow) => void): SeedRow[] {
  return rows.map((row) => {
    const copy = structuredClone(row);
    mutate(copy);
    return copy;
  });
}

// ---------------------------------------------------------------------------
// T-167 · The F-151-9 rig, replayed — the arm set for the sensitivity check
// ---------------------------------------------------------------------------

/**
 * The seven PATCHED arms of the trinket rig, in the column order
 * `docs/PLAYER-TRINKETS_SPEC.md` §2.3(b) prints them. `+1` arms patch one stat;
 * `grit_p2` and `trade_p2` are the `+2` dose-response arms.
 */
export const TRINKET_RIG_VARIANTS: readonly string[] = [
  'pilot_p1',
  'guns_p1',
  'trade_p1',
  'grit_p1',
  'guile_p1',
  'grit_p2',
  'trade_p2',
];

/**
 * THE F-151-9 EVIDENCE, TRANSCRIBED VERBATIM — `docs/PLAYER-TRINKETS_SPEC.md`
 * §2.3(b), "Median final credits, by policy", `n` = 300 per cell, 8 variants x 8
 * policies x 300 seeds x 35 days.
 *
 * Column order is `[control, pilot+1, guns+1, trade+1, grit+1, guile+1, grit+2,
 * trade+2]` — index 0 is the control and indices 1..7 line up, in order, with
 * {@link TRINKET_RIG_VARIANTS}.
 *
 * THE `fighter` ROW IS THE FINDING: 2825 in every one of the eight columns. Every
 * other row moves somewhere. `explorer`, `greedy`, `trader` and `veteran` are each
 * flat under SOME arm and none of them is a defect, which is why the predicate
 * requires flatness under ALL live arms.
 *
 * THIS TABLE IS EVIDENCE AND MAY NEVER BE EDITED TO MAKE A TEST PASS. It is a
 * measurement someone made, quoted; if a number here disagrees with the spec, the
 * transcription is wrong and the fix is to re-read the spec. The same
 * no-editing-to-pass rule this file's header states applies with full force.
 *
 * The rig itself ran in a scratch tree and committed no per-arm aggregate, so a
 * replay of the one published measure is the strongest fixture available. See
 * {@link trinketRigArms} for exactly how much that weakens the demonstration.
 */
export const TRINKET_RIG_MEDIANS: Readonly<Record<string, readonly number[]>> = {
  explorer: [16847, 17421, 16847, 17112, 17223, 16847, 17360, 17572],
  fighter: [2825, 2825, 2825, 2825, 2825, 2825, 2825, 2825],
  gambler: [21418, 21487, 21418, 22378, 21856, 21418, 22081, 22908],
  greedy: [1120, 1120, 1120, 1130, 1120, 1120, 1120, 1130],
  smuggler: [6451, 7592, 6451, 6564, 6267, 6478, 6267, 6766],
  trader: [12725, 12545, 12725, 13438, 13094, 12725, 13289, 13406],
  'trader-degraded': [8836, 8861, 8836, 10346, 8972, 8836, 9516, 11762],
  veteran: [4860, 4852, 4875, 4815, 4835, 4860, 4820, 4772],
};

/**
 * Build the control aggregate and the seven variant arms of the §2.3(b) rig.
 *
 * THE CONSTRUCTION KEEPS THIS FILE'S "ONE NAMED MUTATION OFF A REAL OBJECT" RULE:
 * every cell is a `structuredClone` of ONE real `SeedRow` — `summarizeReport` of the
 * cached clean trader career — with exactly two fields restamped, `policy` and
 * `finalCredits`. Nothing is hand-assembled, so the rows cannot rot as `SeedRow`
 * grows, and the aggregates are folded by the production `aggregate()` rather than
 * written out as literals.
 *
 * THE DELIBERATE WEAKENING, STATED RATHER THAN DISCOVERED. §2.3(b) published ONE
 * measure (the median of final credits), so the replay can only carry that one:
 * every other field of every cell is equal across arms by construction. That makes
 * this fixture STRICTLY WEAKER than a real rig, where the predicate compares whole
 * per-policy blocks and any of a hundred fields can move a row. It is weaker in the
 * safe direction — a policy the fixture calls flat is flat on the published measure,
 * which is exactly the claim F-151-9 makes — and the suite pairs it with a leg built
 * from real `cleanRows()` aggregates so the predicate is never proven only against a
 * transcribed table.
 *
 * @param medians column table in {@link TRINKET_RIG_MEDIANS}'s shape; index 0 is the
 *   control. The suite passes a perturbed clone to build its negative control.
 * @param variants arm ids for columns 1..n, defaulting to {@link TRINKET_RIG_VARIANTS}.
 */
export function trinketRigArms(
  medians: Readonly<Record<string, readonly number[]>> = TRINKET_RIG_MEDIANS,
  variants: readonly string[] = TRINKET_RIG_VARIANTS,
): { control: BaselineAggregate; variants: SensitivityArm[] } {
  const template = summarizeReport(cleanReport('trader'));
  const column = (index: number): SeedRow[] =>
    Object.entries(medians).map(([policy, cells]) => {
      const value = cells[index];
      if (value === undefined) {
        throw new Error(`${policy} has no column ${index} in the rig matrix`);
      }
      const row = structuredClone(template);
      row.policy = policy as SimPolicyName;
      row.finalCredits = value;
      return row;
    });
  return {
    control: aggregate('trinket-rig-control', column(0)),
    variants: variants.map((variant, index) => ({
      variant,
      aggregate: aggregate(`trinket-rig-${variant}`, column(index + 1)),
    })),
  };
}

// ---------------------------------------------------------------------------
// Named helpers the suite's mutations need
// ---------------------------------------------------------------------------

/**
 * One rung DOWN the renown ladder, read through the engine's own
 * `RENOWN_RANK_ORDER` rather than spelled as a rank string. `content/src/deeds.ts`
 * owns that ladder and has appended a rung once already (T-1308); a transcribed
 * name here would be a second source of truth for the same order the invariant
 * under test reads.
 *
 * THE REGRESSION IS SEEDED DOWNWARD, NOT UPWARD, and the first attempt at this
 * fixture is why the note is here: raising the FIRST day's rank by one rung seeds
 * no violation on a real career, because the seeded trader is already COMMANDER on
 * day 1 and CAPTAIN on day 2 — the raise lands exactly on the next day's rank and
 * `<` is strict. Stepping a late day DOWN below its predecessor is a regression on
 * any career that climbed at all, and it throws rather than silently no-op if the
 * predecessor is still on the bottom rung.
 */
export function rankOneRungBelow(rank: RenownRankId): RenownRankId {
  const index = RENOWN_RANK_ORDER.indexOf(rank);
  const below = index <= 0 ? undefined : RENOWN_RANK_ORDER[index - 1];
  if (below === undefined) throw new Error(`no rung below ${rank} in RENOWN_RANK_ORDER`);
  return below;
}
