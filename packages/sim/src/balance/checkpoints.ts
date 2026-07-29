/**
 * N7 · THE CHECKPOINT EXTRACTOR — turns a capstone sweep into the fast fixtures
 * under `docs/balance/smoke/`.
 *
 * `docs/balance/smoke/README.md` is the contract and it was written before this
 * code; the {@link SmokeFixture} fields below are that table, in order.
 *
 * THE ONE PROPERTY THAT MATTERS: a fixture whose `rulesFingerprint` does not
 * match the working tree is STALE, and {@link assertFixtureFresh} fails loudly on
 * it. It is never silently used and — this is the part that has to be true in the
 * code, not just in the prose — it is never auto-refreshed. Re-extraction is a
 * separate, explicit command (`./smoke-extract.ts`), and nothing in the smoke
 * suite calls it.
 *
 * READERS (constraint 7): `./smoke-extract.ts` (writes fixtures),
 * `../__tests__/balance-smoke.test.ts` (reads and enforces them).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CURRENT_SAVE_VERSION, calculateFuelCapacity } from '@spacerquest/engine';

import type { SimPolicyName } from '../index.js';
import type { BaselineAggregate, Distribution, MilestoneAggregate } from './aggregate.js';
import {
  computeDocsFingerprint,
  computeInstrumentFingerprint,
  computeRulesFingerprint,
  REPO_ROOT,
} from './rules-fingerprint.js';
import { foldTierOutcome, runTierReports, type SmokeTier, type TierOutcome } from './smoke.js';
import type { NpcSlot, PlayerSlot, TierSpread } from './synthesize.js';

// ---------------------------------------------------------------------------
// The fixture — `docs/balance/smoke/README.md`'s table, as a type
// ---------------------------------------------------------------------------

export interface FixtureProvenance {
  /** The sweep's `--label`. */
  sweepLabel: string;
  seeds: number;
  /** Horizon of the sweep, in days. */
  days: number;
  runs: number;
  policies: string[];
  /** ISO date the fixture was extracted. */
  extractedOn: string;
  /** The commit the extraction ran against. `'unknown'` when git was unavailable
   *  — recorded honestly rather than omitted, because a missing field reads as
   *  "nobody thought about it". */
  gitCommit: string;
  /** Whether the tier spreads are real milestone samples or the extractor's
   *  documented estimates. See {@link TierSpread}. */
  spreadSource: 'harvested' | 'estimated';
  note: string;
}

export interface FixtureTier extends SmokeTier {
  spread: TierSpread | null;
  /** One entry per policy, in `policies` order. */
  expected: TierOutcome[];
}

export interface SmokeFixture {
  productVersion: string;
  saveSchemaVersion: number;
  /** THE load-bearing field (`docs/VERSIONING.md` §3). */
  rulesFingerprint: string;
  /** The measuring device, hashed separately — see `rules-fingerprint.ts` for why
   *  this is a second number rather than part of the first. */
  instrumentFingerprint: string;
  /** RAW bytes of every hashed source, comments included — the commentary state
   *  of the tree this fixture was measured against. INFORMATIONAL ONLY: it is
   *  never a `FreshnessProblem`, because comments decide no outcomes. Optional so
   *  fixtures written before N7-FP still load. See `computeDocsFingerprint`. */
  docsFingerprint?: string;
  provenance: FixtureProvenance;
  checkpoints: FixtureTier[];
}

// ---------------------------------------------------------------------------
// The day tiers — a judgment call, commented at the definition site
// ---------------------------------------------------------------------------

/** The eight-policy fleet the capstone runs. The smoke tiers use the same set so
 *  a tier failure and a capstone row name the same captain. */
const SMOKE_POLICIES: readonly SimPolicyName[] = [
  'trader',
  'trader-degraded',
  'fighter',
  'explorer',
  'veteran',
  'smuggler',
  'gambler',
  'greedy',
];

/**
 * SEVEN seeds per tier, and seven is not arbitrary: a spread ladder has seven
 * rungs (`LADDER` below), and `synthesizeTierState` assigns seed *i* to slot
 * `i % player.length`, so seven seeds cover every rung exactly once. Six covered
 * six — and the rung it dropped was `max`, the only captain in the ladder with a
 * tier-5 fit, i.e. the one that reaches the top of the interceptor band R2a
 * showed had never been exercised by any sweep.
 *
 * Cost of the seventh: 7 x 8 policies x 4 tiers = 224 careers of three days.
 * Raise the count if a tier proves too quiet to catch anything — not for its own
 * sake, and never past the seconds budget that is this suite's whole purpose.
 */
const SMOKE_SEEDS = [1, 2, 3, 4, 5, 6, 7];

/**
 * THE DAY TIERS. Three come from the worklist's own suggestion (1–3, 21–23,
 * 41–43); the fourth is added here, and the addition is the judgment call.
 *
 * **29–31 exists because the suggested tiers straddle day 30.** `day.ts` forks
 * the whole career there — `nextState.day === nextState.player.debtDueDay` — into
 * the Tour One CLEARED and UNPAID branches, and the unpaid branch sets
 * `guild.debt-flagged`, which then re-prices every manifest board
 * (`guildManifestPenalty`) and every encounter roll (`guildEncounterMultiplier`)
 * for the rest of the career. It is the single most consequential authored branch
 * the game has, and 21–23 ends nine days before it while 41–43 starts eleven days
 * after. A breakage detector that cannot see it would be reporting green on a
 * career whose central beat had stopped firing.
 *
 * Each tier is three days, per the worklist. Three is enough for a dawn, a full
 * action batch and a dusk to run three times — which is where the day loop's
 * scheduled work lives — and short enough that the whole suite stays in seconds.
 */
export const SMOKE_TIERS: readonly SmokeTier[] = [
  {
    id: 'days-1-3',
    startDay: 1,
    days: 3,
    start: 'played',
    rationale:
      'The opening three days of a real career. The only tier with NO synthesis and therefore ' +
      'no caveat: if this one breaks, the game breaks for every player on day one.',
    seeds: SMOKE_SEEDS,
    policies: [...SMOKE_POLICIES],
    expectTourOneResolution: false,
  },
  {
    id: 'days-21-23',
    startDay: 21,
    days: 3,
    start: 'synthesized',
    rationale:
      "Mid-Tour-One, at the trader's measured debt-clear day (baseline median 21) and the low " +
      'edge of the [22, 30] target band. Where the economy is supposed to be paying off.',
    seeds: SMOKE_SEEDS,
    policies: [...SMOKE_POLICIES],
    expectTourOneResolution: false,
  },
  {
    id: 'days-29-31',
    startDay: 29,
    days: 3,
    start: 'synthesized',
    rationale:
      'Straddles the day-30 Tour One resolution in day.ts (day === debtDueDay), the cleared/' +
      'unpaid fork that sets guild.debt-flagged and re-prices boards and encounters thereafter. ' +
      'No other tier reaches it.',
    seeds: SMOKE_SEEDS,
    policies: [...SMOKE_POLICIES],
    expectTourOneResolution: true,
  },
  {
    id: 'days-41-43',
    startDay: 41,
    days: 3,
    start: 'synthesized',
    rationale:
      'Post-Tour-One veteran play: upgraded fits, tier-4/5 matchmaking and the deed pacing that ' +
      'only exists after the marker is settled.',
    seeds: SMOKE_SEEDS,
    policies: [...SMOKE_POLICIES],
    expectTourOneResolution: false,
  },
];

// ---------------------------------------------------------------------------
// Spreads
// ---------------------------------------------------------------------------

/** The quantile ladder a spread slot walks — ascending, seven rungs, matching
 *  `Distribution`'s own fields so no interpolation is invented here. */
const LADDER = ['min', 'p10', 'p25', 'median', 'p75', 'p90', 'max'] as const;

function rung(distribution: Distribution, index: number): number {
  return distribution[LADDER[index]];
}

/**
 * Build a tier spread from a capstone's milestone samples — the path that makes
 * the fixtures get truer with each capstone instead of staying at whatever was
 * guessed on day one.
 *
 * The player ladder is the seven `Distribution` rungs, rank-coupled (see
 * {@link TierSpread} for why that is an assumption and not an observation). The
 * NPC ladder is `npcCount` slots spread evenly across the same seven rungs, so a
 * 30-captain roster runs from the poorest observed captain to the richest instead
 * of thirty copies of the median.
 */
export function spreadFromMilestone(milestone: MilestoneAggregate, npcCount: number): TierSpread {
  const player: PlayerSlot[] = LADDER.map((_, index) => {
    const hull = rung(milestone.playerHullStrength, index);
    return {
      credits: rung(milestone.playerCredits, index),
      debt: rung(milestone.playerDebt, index),
      weaponsStrength: rung(milestone.playerWeaponsStrength, index),
      hullStrength: hull,
      shieldsStrength: rung(milestone.playerShieldsStrength, index),
      drivesStrength: rung(milestone.playerDrivesStrength, index),
      cargoPods: rung(milestone.playerCargoPods, index),
      // The tank is stored as a SHARE — the observed fuel over the capacity that
      // observed hull implies — never an invented "half full". `synthesizeTierState`
      // multiplies it back out through the engine's own `syncMaxFuel`.
      fuelShare: hull <= 0 ? 0 : Math.min(1, rung(milestone.playerFuel, index) / capacityFor(hull)),
    };
  });

  const npc: NpcSlot[] = [];
  for (let index = 0; index < npcCount; index += 1) {
    // Evenly spaced across the ladder: index 0 -> min, last -> max.
    const position =
      npcCount === 1 ? 0 : Math.round((index / (npcCount - 1)) * (LADDER.length - 1));
    const hull = rung(milestone.npcHullStrength, position);
    npc.push({
      credits: rung(milestone.npcCredits, position),
      hullStrength: hull,
      fuelShare: hull <= 0 ? 0 : Math.min(1, rung(milestone.npcFuel, position) / capacityFor(hull)),
    });
  }

  return { source: 'harvested', player, npc };
}

/** The condition a synthesized hull carries. `synthesizeTierState` writes only
 *  component STRENGTHS and leaves `createInitialState`'s conditions in place,
 *  which are 9 (undamaged) — so the capacity implied by a harvested hull must be
 *  computed at the same condition or the share would be measured against a tank
 *  the synthesis will not build. */
const SYNTHESIZED_HULL_CONDITION = 9;

/** A full-condition tank, through the ENGINE's own capacity function rather than
 *  a restated `(condition + 1) x strength x MULT` — so a change to
 *  `FUEL_CAPACITY_HULL_MULTIPLIER` moves this with it (R2c's lesson). */
function capacityFor(hullStrength: number): number {
  return calculateFuelCapacity(hullStrength, SYNTHESIZED_HULL_CONDITION);
}

/**
 * THE ESTIMATES — used only when the capstone carries no milestone samples, which
 * is every capstone taken before N7 (including `baseline-n1.json`).
 *
 * These are guesses and they are labelled as such all the way to the fixture's
 * `provenance.spreadSource`, so nobody reads a tier seeded from them as a
 * measurement. **The route to replacing them is one flag:** re-run the capstone
 * with `--milestone-days 21,29,41` and re-extract; `spreadFromMilestone` takes
 * over and `spreadSource` flips to `'harvested'`. They exist so the rig works on
 * the day it lands rather than blocking on a sweep.
 *
 * The shape of the guess: a captain's purse and fit grow roughly linearly through
 * Tour One, anchored at the two ends the baseline does pin — a day-1 junker
 * (1,000 credits, 1,000 debt, every component at its starting strength) and the
 * 120-day medians in `baseline-r2c-final.json`.
 */
export function estimatedSpread(day: number, npcCount: number): TierSpread {
  const progress = Math.min(1, Math.max(0, (day - 1) / 119));
  const ladder = [0.1, 0.3, 0.5, 0.8, 1.2, 1.8, 3];
  const player: PlayerSlot[] = ladder.map((scale) => ({
    credits: Math.round(1000 + 56000 * progress * scale),
    debt: Math.round(Math.max(0, 1000 * (1 - progress * 2))),
    weaponsStrength: Math.round(1 + 60 * progress * Math.min(1.5, scale)),
    hullStrength: Math.round(10 + 50 * progress * Math.min(1.5, scale)),
    shieldsStrength: Math.round(1 + 40 * progress * Math.min(1.5, scale)),
    drivesStrength: Math.round(10 + 30 * progress * Math.min(1.5, scale)),
    cargoPods: Math.round(10 + 10 * progress * Math.min(1.5, scale)),
    fuelShare: 0.5,
  }));
  const npc: NpcSlot[] = [];
  for (let index = 0; index < npcCount; index += 1) {
    const position = npcCount === 1 ? 0 : index / (npcCount - 1);
    npc.push({
      credits: Math.round(500 + 12000 * progress * (0.2 + 2.6 * position)),
      hullStrength: Math.round(4 + 8 * position),
      fuelShare: 0.6,
    });
  }
  return { source: 'estimated', player, npc };
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export interface ExtractOptions {
  repoRoot?: string;
  gitCommit?: string;
  /** ISO date. Injected rather than read from the clock so the extractor stays
   *  testable — the engine's own no-`Date` discipline, one layer out. */
  extractedOn: string;
  npcCount: number;
  tiers?: readonly SmokeTier[];
}

function readProductVersion(repoRoot: string): string {
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    version?: string;
  };
  if (typeof manifest.version !== 'string') {
    throw new Error('Root package.json carries no version');
  }
  return manifest.version;
}

/** The milestone block for a tier's start day, pooled across the whole fleet
 *  (`fleet`), or undefined when the capstone did not harvest that day. */
function fleetMilestone(aggregate: BaselineAggregate, day: number): MilestoneAggregate | undefined {
  return aggregate.fleet.milestones?.find((entry) => entry.day === day);
}

/**
 * Build a fixture from a capstone aggregate. RUNS the tiers — the recorded
 * expectations are what the current tree actually produces, which is the only
 * thing they could honestly be.
 */
export function extractFixture(
  aggregate: BaselineAggregate,
  options: ExtractOptions,
): SmokeFixture {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const tiers = options.tiers ?? SMOKE_TIERS;
  let anyEstimated = false;

  const checkpoints: FixtureTier[] = tiers.map((tier) => {
    let spread: TierSpread | null = null;
    if (tier.start === 'synthesized') {
      const milestone = fleetMilestone(aggregate, tier.startDay);
      spread =
        milestone === undefined
          ? estimatedSpread(tier.startDay, options.npcCount)
          : spreadFromMilestone(milestone, options.npcCount);
      if (spread.source === 'estimated') anyEstimated = true;
    }
    const expected = tier.policies.map((policy) =>
      foldTierOutcome(tier, policy, runTierReports(tier, policy, spread)),
    );
    return { ...tier, spread, expected };
  });

  return {
    productVersion: readProductVersion(repoRoot),
    saveSchemaVersion: CURRENT_SAVE_VERSION,
    rulesFingerprint: computeRulesFingerprint(repoRoot).fingerprint,
    instrumentFingerprint: computeInstrumentFingerprint(repoRoot).fingerprint,
    docsFingerprint: computeDocsFingerprint(repoRoot).fingerprint,
    provenance: {
      sweepLabel: aggregate.label,
      seeds: aggregate.seeds,
      days: aggregate.days,
      runs: aggregate.runs,
      policies: [...aggregate.policies],
      extractedOn: options.extractedOn,
      gitCommit: options.gitCommit ?? 'unknown',
      spreadSource: anyEstimated ? 'estimated' : 'harvested',
      note: anyEstimated
        ? 'At least one tier spread is an ESTIMATE: this capstone carries no milestone samples. ' +
          'Re-run the sweep with --milestone-days and re-extract to replace them with measured ' +
          'ones. Tier numbers are breakage signals either way; they are never balance verdicts.'
        : 'Tier spreads are milestone samples harvested from the named sweep. They are still ' +
          'SYNTHESIZED starting states and are never balance verdicts — see ' +
          'docs/balance/smoke/README.md.',
    },
    checkpoints,
  };
}

// ---------------------------------------------------------------------------
// Freshness — the rule that makes this safe
// ---------------------------------------------------------------------------

export interface FreshnessProblem {
  field: 'rulesFingerprint' | 'instrumentFingerprint' | 'saveSchemaVersion';
  expected: string;
  found: string;
  message: string;
}

export function fixtureFreshness(
  fixture: SmokeFixture,
  repoRoot: string = REPO_ROOT,
): FreshnessProblem[] {
  const problems: FreshnessProblem[] = [];
  const rules = computeRulesFingerprint(repoRoot);
  if (fixture.rulesFingerprint !== rules.fingerprint) {
    problems.push({
      field: 'rulesFingerprint',
      expected: rules.fingerprint,
      found: fixture.rulesFingerprint,
      message:
        `STALE FIXTURE: the ruleset has changed since these checkpoints were measured ` +
        `(fixture ${fixture.rulesFingerprint}, tree ${rules.fingerprint} over ` +
        `${rules.fileCount} rule sources).\n` +
        `These checkpoints describe a game that no longer exists. Running them would report ` +
        `green about the wrong ruleset, which docs/balance/smoke/README.md calls worse than no ` +
        `test at all.\n` +
        `THE FIX IS A NEW CAPSTONE, never a refreshed number:\n` +
        `  1. npm run balance:sweep -w @spacerquest/sim -- --label <new> --seeds 1000 ` +
        `--days 120 --milestone-days 21,29,30,41,60,120 ` +
        `--policies explorer,fighter,gambler,greedy,smuggler,trader,trader-degraded,veteran ` +
        `--shard i/8   (x8, then --merge)\n` +
        `     (MATCH the outgoing baseline's milestone set and policy list, or every ` +
        `milestones[i] index shifts and the diff in step 2 fills with phantom deltas.)\n` +
        `  2. npm run balance:diff  -w @spacerquest/sim -- docs/balance/<prev>.json ` +
        `docs/balance/baseline-<new>.json\n` +
        `  3. npm run balance:extract -w @spacerquest/sim -- --aggregate docs/balance/` +
        `baseline-<new>.json\n` +
        `Never edit a fingerprint to make this pass (docs/VERSIONING.md, "The rule that matters ` +
        `most").`,
    });
  }
  const instrument = computeInstrumentFingerprint(repoRoot);
  if (fixture.instrumentFingerprint !== instrument.fingerprint) {
    problems.push({
      field: 'instrumentFingerprint',
      expected: instrument.fingerprint,
      found: fixture.instrumentFingerprint,
      message:
        `STALE FIXTURE: the MEASURING INSTRUMENT has changed (fixture ` +
        `${fixture.instrumentFingerprint}, tree ${instrument.fingerprint}). The ruleset may be ` +
        `untouched — a policy, the day-loop harness or an aggregation definition moved — but ` +
        `these checkpoints were produced by a different instrument and are not comparable. ` +
        `Re-extract: npm run balance:extract -w @spacerquest/sim.`,
    });
  }
  if (fixture.saveSchemaVersion !== CURRENT_SAVE_VERSION) {
    problems.push({
      field: 'saveSchemaVersion',
      expected: String(CURRENT_SAVE_VERSION),
      found: String(fixture.saveSchemaVersion),
      message:
        `STALE FIXTURE: measured against save schema v${fixture.saveSchemaVersion}, tree is at ` +
        `v${CURRENT_SAVE_VERSION} (docs/VERSIONING.md §2). The persisted shape moved under these ` +
        `checkpoints; re-extract.`,
    });
  }
  return problems;
}

/**
 * INFORMATIONAL ONLY — never a failure, by design (N7-FP).
 *
 * Reports that the COMMENTARY of the hashed sources moved since this fixture was
 * measured, while the code did not. That is not staleness: comments decide no
 * outcomes, so the checkpoints still describe the shipped game exactly. It is
 * worth SAYING, because "same game, rewritten explanation" is a useful thing to
 * know when chasing a comment that disagrees with a number.
 *
 * Returns `null` when nothing moved, or when the fixture predates `docsFingerprint`
 * — an absent hash is not a mismatch, and inventing a warning for old fixtures
 * would be noise. Do NOT promote this to a `FreshnessProblem`; that reinstates the
 * exact false positive this whole change exists to remove.
 */
export function fixtureDocsDrift(
  fixture: SmokeFixture,
  repoRoot: string = REPO_ROOT,
): string | null {
  if (fixture.docsFingerprint === undefined) return null;
  const docs = computeDocsFingerprint(repoRoot);
  if (fixture.docsFingerprint === docs.fingerprint) return null;
  // Whether the CODE also moved is CHECKED, never assumed. An earlier draft
  // asserted "the code is unchanged" unconditionally and was caught stating that
  // while a freshness problem was outstanding — a note that lies is worse than no
  // note, because this one exists to be trusted without being enforced.
  const codeAlsoMoved = fixtureFreshness(fixture, repoRoot).length > 0;
  return (
    `NOTE (not a failure): the COMMENTARY of the hashed sources has changed since this ` +
    `fixture was extracted (fixture ${fixture.docsFingerprint}, tree ${docs.fingerprint} over ` +
    `${docs.fileCount} sources).\n` +
    (codeAlsoMoved
      ? `The CODE moved too — see the staleness failure reported alongside this note, which is ` +
        `the one that matters. This line only dates the prose.`
      : `The CODE is unchanged — rulesFingerprint and instrumentFingerprint both still match — ` +
        `so these checkpoints describe the shipped game and no re-measure is needed.`) +
    `\nRecorded because a comment that disagrees with a number is worth being able to date.`
  );
}

/** Throws on a stale fixture. There is deliberately no `force`, no environment
 *  override and no auto-refresh path — see this file's header. */
export function assertFixtureFresh(fixture: SmokeFixture, repoRoot: string = REPO_ROOT): void {
  const problems = fixtureFreshness(fixture, repoRoot);
  if (problems.length > 0) {
    throw new Error(problems.map((problem) => problem.message).join('\n\n'));
  }
}
