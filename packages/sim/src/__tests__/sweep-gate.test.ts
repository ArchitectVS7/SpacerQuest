// ---------------------------------------------------------------------------
// T-153 · THE GATE'S OWN CORRECTNESS, RE-VERIFIED ON EVERY `npm test`.
//
// T-152 built the sweep gate (`../balance/gate.ts` + `../balance/sweep.ts`'s
// `runGate`/`reportGate`). This file is the evidence that it CATCHES things. The
// distinction is the whole point of the task: a gate confirmed once by hand and
// trusted forever is indistinguishable, six months later, from a gate whose
// predicates silently stopped firing. So the proof is a permanent suite, not a
// paragraph in a Delivered block.
//
// HOW THE FIXTURES ARE MADE. Each seeded-bad fixture is ONE NAMED MUTATION off a
// REAL current-state `CampaignStatsReport` (or off a real 104-row sample) — see
// `./support/gate-fixtures.ts`, which states why nothing here is hand-built. The
// clean fixture is therefore literally the current state, and each bad fixture
// says exactly which defect class it models.
//
// WHAT IS ASSERTED, per invariant class:
//   1. the specific `assert*` function returns >= 1 violation;
//   2. EVERY violation it returns is labelled with that function's own name (no
//      cross-talk, no mislabelled provenance — the `invariant` field is what makes
//      a printed report grep-able back to a definition site);
//   3. the sweep's OWN composition (`runGate`, exported from `sweep.ts` for this
//      suite) also surfaces it — a test that re-lists the nine calls would prove
//      the TEST's composition, not the sweep's;
//   4. `buildGateReport(...).passed` is false.
//
// NOTHING IN THIS FILE, IN `gate.ts`, OR IN THE FIXTURES MAY BE EDITED TO MAKE
// THIS SUITE PASS. Not a band, not a `minSample`, not `INCOME_STALL_LIMIT`, not
// `GATE_COMPETENT_POLICIES`, not a seed range chosen to dodge a failure. If the
// clean 104-row sample ever lands a rate out of band, the remedies are a BIGGER
// SAMPLE or a FILED FINDING, in that order — `gate.ts`'s "there is no opt-out"
// rule applies to the gate's test as much as to the gate.
//
// TWO HONEST LIMITATIONS, stated here rather than discovered later:
//   * The flat invariants' END-TO-END non-zero exit is proven through `reportGate`,
//     not through a full `main()` sweep. They are functions of a report the real
//     engine produced, so making a real sweep emit a negative-credits row would
//     require breaking the engine. The DETECTION is proven on seeded reports; the
//     EXIT-CODE PLUMBING is proven on the exact function every sweep path routes
//     its verdict through.
//   * `--merge` deliberately does not re-run the flat invariants, because `SeedRow`
//     carries no `daily[]`. That limitation is stated at `sweep.ts`'s `mergeShards`
//     and is NOT worked around here. The merge leg is proven on the RATE table,
//     which is what a merge actually re-evaluates.
// ---------------------------------------------------------------------------

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JOB_POOL_BOARD_SIZE } from '@spacerquest/engine';
import { Stat } from '@spacerquest/content';
import { beforeAll, describe, expect, it } from 'vitest';

import { runCampaign, type CampaignStatsReport, type SimPolicyName } from '../index.js';
import { aggregate, isCombatWin, summarizeReport, type SeedRow } from '../balance/aggregate.js';
import * as gateModule from '../balance/gate.js';
import {
  ABSOLUTE_MAX_FUEL,
  ARM_LEVEL_ASSERTIONS,
  CROSS_ARM_SEED,
  GATE_COMPETENT_POLICIES,
  INCOME_STALL_LIMIT,
  SENSITIVITY_MIN_LIVE_VARIANTS,
  SWEEP_INVARIANT_DISPOSITIONS,
  assertBoardDepthWithinPoolBounds,
  assertCombatRecordsWellFormed,
  assertDayMonotonic,
  assertFuelWithinTank,
  assertNoIncomeStall,
  assertNoNegativeResources,
  assertOneSamplePerDay,
  assertProgressRatchetsNeverReverse,
  assertRouteRecordsWellFormed,
  assertVariantsPerturbEveryPolicy,
  buildGateReport,
  checkExpectedEventRates,
  formatGateReport,
  longestZeroIncomeStreak,
  type ExpectedEventRateResult,
  type GateReport,
  type SweepViolation,
} from '../balance/gate.js';
import { main, parseSweepArgs, reportGate, runGate } from '../balance/sweep.js';
import {
  TRINKET_RIG_MEDIANS,
  TRINKET_RIG_VARIANTS,
  FIXTURE_MILESTONES,
  cleanReport,
  cleanRows,
  corrupt,
  corruptRows,
  encounterRecord,
  legRecord,
  rankOneRungBelow,
  trinketRigArms,
} from './support/gate-fixtures.js';

/** Step the LAST day's renown rank one rung below its predecessor's — a genuine
 *  one-way-ratchet reversal on any career that climbed at all. See
 *  {@link rankOneRungBelow} for why the mutation runs downward from a late day
 *  rather than upward from day 1. */
function regressLastRenownRank(report: CampaignStatsReport): void {
  const last = report.daily.length - 1;
  report.daily[last].renownRank = rankOneRungBelow(report.daily[last - 1].renownRank);
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const DOCS_BALANCE = join(REPO_ROOT, 'docs', 'balance');

/** Every fixture label this suite writes is prefixed so it can never collide with
 *  a committed baseline, and so the "nothing leaked into docs/balance" guard at
 *  the bottom has something exact to look for. */
const LABEL_PREFIX = 't153';

/** Building the clean sample takes ~5.4s; vitest's default hook timeout is 5s. */
const SAMPLE_TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------------------
// Shared assertions
// ---------------------------------------------------------------------------

/**
 * The four-part contract stated in the header, applied to one seeded-bad report.
 * Returns the violations so a caller can assert on their `detail` text.
 */
function expectCaughtBy(
  report: CampaignStatsReport,
  check: (report: CampaignStatsReport) => SweepViolation[],
  name: string,
): SweepViolation[] {
  const found = check(report);
  expect(found.length).toBeGreaterThan(0);
  // (2) provenance: nothing else may borrow this invariant's name, and this
  // function may not report under somebody else's.
  for (const violated of found) expect(violated.invariant).toBe(name);
  // (3) the SWEEP's composition, not a re-composition assembled here.
  const throughSweep = runGate(report);
  expect(throughSweep.map((violated) => violated.invariant)).toContain(name);
  // (4) the verdict the sweep would actually reach.
  expect(buildGateReport(LABEL_PREFIX, 'fixture', 1, throughSweep, []).passed).toBe(false);
  return found;
}

/**
 * The ARM-LEVEL sibling of {@link expectCaughtBy} (T-167).
 *
 * Three of the four legs carry over unchanged — it fires, every violation carries
 * the predicate's OWN name, and `buildGateReport(...).passed` is false. The third
 * leg (`runGate` also surfaces it) is deliberately DROPPED and not faked: an
 * arm-level predicate compares a control against N variants and `runGate` is handed
 * one report, so a sweep has nothing to compare. That absence is what
 * `ARM_LEVEL_ASSERTIONS` records and what the totality guard below partitions on.
 *
 * The two arm-level FIELD conventions are asserted here rather than at each call
 * site, because they are the contract that keeps a cross-arm row readable in a
 * printed table: `seed` is the {@link CROSS_ARM_SEED} sentinel (there is no seed to
 * reproduce a two-aggregate finding with, and `0` is a legal seed) and `day` is null.
 *
 * `formatGateReport` is asserted directly rather than through `reportGate`, on
 * purpose: printing a production-shaped `[gate] … FAIL` line into the shared run log
 * out of a suite that passes is F-162-5, and it was believed once already. See
 * {@link withTempDir}.
 */
function expectArmLevelCaught(found: readonly SweepViolation[], name: string): SweepViolation[] {
  expect(found.length).toBeGreaterThan(0);
  for (const violated of found) {
    expect(violated.invariant).toBe(name);
    expect(violated.seed).toBe(CROSS_ARM_SEED);
    expect(violated.day).toBeNull();
  }
  expect(buildGateReport(LABEL_PREFIX, 'fixture', 0, found, []).passed).toBe(false);
  return [...found];
}

/**
 * Every arm-level `assert*` and the seeded-bad fixture that proves it fires.
 *
 * THE REGISTRY IS NOT ALLOWED TO BECOME AN ESCAPE HATCH. `ARM_LEVEL_ASSERTIONS`
 * exempts its members from the "runGate reaches everything" guard, so without this
 * map a future invariant could be exempted from BOTH by adding one string. The A2
 * test below asserts the keys here are exactly `ARM_LEVEL_ASSERTIONS`, that each is
 * a real exported function, and that each fixture actually makes its predicate fire
 * — so the price of an exemption is a working demonstration.
 */
const ARM_LEVEL_FIXTURES: Readonly<Record<string, () => SweepViolation[]>> = {
  assertVariantsPerturbEveryPolicy: () => {
    const { control, variants } = trinketRigArms();
    return assertVariantsPerturbEveryPolicy(control, variants);
  },
};

/** A clone of the §2.3(b) matrix with one named cell moved. The table itself is
 *  EVIDENCE and is never edited — see its definition site — so every perturbation
 *  the suite needs is built as a copy here. */
function rigMatrixWith(
  edit: (cells: readonly number[], policy: string) => readonly number[],
): Record<string, readonly number[]> {
  return Object.fromEntries(
    Object.entries(TRINKET_RIG_MEDIANS).map(([policy, cells]) => [policy, edit(cells, policy)]),
  );
}

/** A clean base report per policy, with the shared cache warmed once. */
function base(policy: SimPolicyName = 'trader'): CampaignStatsReport {
  return cleanReport(policy);
}

/** The ids of every rate the table FAILED. Exactly-one-failure is the property
 *  each rate fixture is graded on — a fixture that passes by breaking everything
 *  would prove nothing about the band it names. */
function failedRateIds(results: readonly ExpectedEventRateResult[]): string[] {
  return results.filter((rate) => rate.status === 'fail').map((rate) => rate.id);
}

/**
 * Run something against a fresh temp directory, ALWAYS restoring `process.exitCode`
 * AND capturing whatever the run wrote to stderr.
 *
 * TWO LEAKS, ONE GUARD — both are ways this suite could make the repo LESS
 * trustworthy than it was before:
 *
 *   * A leaked `1` from a deliberately-failing fixture would fail the whole vitest
 *     process for tests that passed.
 *   * A leaked `[gate] … FAIL` LINE is the same accident one layer up, in the
 *     reader instead of the exit code. `reportGate` prints `formatGateReport` to
 *     stderr unconditionally, and this suite deliberately drives it with seeded-bad
 *     reports — so the run log used to carry `[gate] t153-invariant · shard 1/1 ·
 *     104 rows · FAIL` / `assertNoNegativeResources · trader · 1 · seed 1 day 5 ·
 *     credits -40`, byte-identical in shape to a REAL sweep-gate failure, out of a
 *     suite that passed and a `npm test` that exited 0. CI's own evidence step is a
 *     `grep '\[gate\]'` (see `formatGateReport`'s grep-ability test below), so a
 *     fixture that prints production-shaped FAIL text into the shared log is a
 *     false alarm waiting to be believed — and it was believed. (F-162-5.)
 *
 * The text is not thrown away: it is handed to the caller as `gateOutput()` so the
 * legs that provoke a FAIL now ASSERT the printed table instead of letting it
 * scroll past unchecked — strictly more coverage than the leak bought. If the run
 * throws, the buffer is replayed to the real stderr first, so capturing can never
 * swallow the diagnostics of a genuine break.
 */
type StderrWrite = typeof process.stderr.write;
type StderrCallback = (error?: Error | null) => void;

function withTempDir<T>(run: (dir: string, gateOutput: () => string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'sq-t153-'));
  const previousExitCode = process.exitCode;
  const realWrite: StderrWrite = process.stderr.write.bind(process.stderr);
  const captured: string[] = [];
  process.stderr.write = (
    chunk: Uint8Array | string,
    encodingOrDone?: BufferEncoding | StderrCallback,
    done?: StderrCallback,
  ): boolean => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    // `write` may be called with a completion callback in either trailing slot;
    // a capture that never calls it would hang a writer that waits on the drain.
    const finish = typeof encodingOrDone === 'function' ? encodingOrDone : done;
    finish?.();
    return true;
  };

  let threw = true;
  try {
    const result = run(dir, () => captured.join(''));
    threw = false;
    return result;
  } finally {
    process.stderr.write = realWrite;
    if (threw && captured.length > 0) realWrite(captured.join(''));
    process.exitCode = previousExitCode;
    rmSync(dir, { recursive: true, force: true });
  }
}

function readGateReport(dir: string, fileName: string): GateReport {
  return JSON.parse(readFileSync(join(dir, fileName), 'utf8')) as GateReport;
}

// ---------------------------------------------------------------------------
// A · One seeded-bad fixture per invariant class
// ---------------------------------------------------------------------------

describe('T-153 · seeded-bad fixtures, one per invariant class', () => {
  it('assertNoNegativeResources catches a negative-credits day (T-1604a Finding F1)', () => {
    // F1 is a `credits = -40` state reached in legs 3 and 4 of the UGT campaign —
    // the shape this invariant exists for, transcribed rather than invented.
    const found = expectCaughtBy(
      corrupt(base(), (report) => {
        report.daily[3].credits = -40;
      }),
      assertNoNegativeResources,
      'assertNoNegativeResources',
    );
    expect(found.some((violated) => violated.detail === 'credits -40')).toBe(true);
  });

  it('assertNoNegativeResources checks finalState, a different moment from daily', () => {
    // `daily` is sampled after the dusk, `finalState` after the horizon's post-loop
    // flush. A fixture that only ever corrupted `daily` would leave the second limb
    // of this invariant unproven.
    const found = expectCaughtBy(
      corrupt(base(), (report) => {
        report.finalState.debt = -1;
      }),
      assertNoNegativeResources,
      'assertNoNegativeResources',
    );
    expect(found).toHaveLength(1);
    expect(found[0].detail).toBe('finalState.debt -1');
  });

  it('assertFuelWithinTank catches a day above the ABSOLUTE ceiling (the weak tier)', () => {
    const found = expectCaughtBy(
      corrupt(base(), (report) => {
        report.daily[2].fuel = ABSOLUTE_MAX_FUEL + 1;
      }),
      assertFuelWithinTank,
      'assertFuelWithinTank',
    );
    expect(found[0].detail).toContain('absolute ceiling');
  });

  it('assertFuelWithinTank catches fuel > maxFuel on a milestone (the EXACT tier)', () => {
    // The exact `fuel <= maxFuel` form is only reachable through `milestones[]`,
    // which is why the fixtures are built with the CI job's `--milestone-days`.
    // The two tiers must stay distinguishable in a failure report, so the detail
    // text is asserted, not just the count.
    const bad = corrupt(base(), (report) => {
      const milestone = report.milestones?.[0];
      if (milestone === undefined) throw new Error('fixture built without milestone samples');
      milestone.player.fuel = milestone.player.maxFuel + 1;
    });
    expect(bad.milestones?.length).toBeGreaterThan(0);
    const found = expectCaughtBy(bad, assertFuelWithinTank, 'assertFuelWithinTank');
    expect(found[0].detail).toContain('milestone');
  });

  it('assertDayMonotonic catches the calendar running backwards', () => {
    const found = expectCaughtBy(
      corrupt(base(), (report) => {
        report.daily[10].day = report.daily[9].day - 1;
      }),
      assertDayMonotonic,
      'assertDayMonotonic',
    );
    expect(found.some((violated) => violated.detail.includes('was followed by'))).toBe(true);
  });

  it('assertDayMonotonic catches a TRUNCATED daily series', () => {
    // The second limb, and the one that matters most: a silently-short `daily`
    // would weaken every other per-day invariant on the page without breaking any.
    const found = expectCaughtBy(
      corrupt(base(), (report) => {
        report.daily.pop();
      }),
      assertDayMonotonic,
      'assertDayMonotonic',
    );
    expect(found).toHaveLength(1);
    expect(found[0].detail).toContain('entries for a');
  });

  it('assertOneSamplePerDay catches a duplicated day sample', () => {
    // This mutation also trips `assertDayMonotonic` (a repeated day is not a +1
    // step), which is exactly why the two functions are separate: they answer
    // MULTIPLICITY and ORDERING. The isolated call below is what proves the
    // multiplicity check fires on its own.
    const bad = corrupt(base(), (report) => {
      report.daily[7].day = report.daily[6].day;
    });
    const found = expectCaughtBy(bad, assertOneSamplePerDay, 'assertOneSamplePerDay');
    expect(found[0].detail).toContain('sampled more than once');
    expect(assertDayMonotonic(bad).length).toBeGreaterThan(0);
  });

  it('assertProgressRatchetsNeverReverse catches a deedCount drop', () => {
    expectCaughtBy(
      corrupt(base(), (report) => {
        // A large step so the drop at day 6 is guaranteed regardless of how many
        // deeds the seeded career happens to earn in its first week.
        report.daily[5].deedCount = 100;
      }),
      assertProgressRatchetsNeverReverse,
      'assertProgressRatchetsNeverReverse',
    );
  });

  it('assertProgressRatchetsNeverReverse catches a renown rank regression', () => {
    // The rung is taken from the ENGINE's `RENOWN_RANK_ORDER`, never spelled as a
    // rank string: `content/src/deeds.ts` owns that ladder and appended a rung once
    // already (T-1308).
    const found = expectCaughtBy(
      corrupt(base(), regressLastRenownRank),
      assertProgressRatchetsNeverReverse,
      'assertProgressRatchetsNeverReverse',
    );
    expect(found.some((violated) => violated.detail.includes('renownRank'))).toBe(true);
  });

  it('assertProgressRatchetsNeverReverse catches a fold that drifted from its own series', () => {
    const found = expectCaughtBy(
      corrupt(base(), (report) => {
        report.deedCount += 1;
      }),
      assertProgressRatchetsNeverReverse,
      'assertProgressRatchetsNeverReverse',
    );
    expect(found).toHaveLength(1);
    expect(found[0].detail).toContain('disagrees with the last daily');
  });

  it('assertNoIncomeStall catches a competent policy stranded for the limit', () => {
    const found = expectCaughtBy(
      corrupt(base('trader'), (report) => {
        for (let index = 0; index < INCOME_STALL_LIMIT; index += 1) {
          report.daily[index].incomeActionCount = 0;
        }
      }),
      assertNoIncomeStall,
      'assertNoIncomeStall',
    );
    expect(found).toHaveLength(1);
    expect(found[0].detail).toContain(`limit ${INCOME_STALL_LIMIT}`);
  });

  it('assertNoIncomeStall is SCOPED — the identical stall is exempt for veteran and greedy', () => {
    // The negative control that makes the scoping real rather than accidental.
    // Both exemptions are recorded rulings (`docs/BALANCE-POLICY.md` E4, and
    // `veteranPolicy`'s own definition site); this is what stops a future edit
    // from quietly widening or narrowing the membership without a test noticing.
    for (const policy of ['veteran', 'greedy'] as const) {
      const exempt = corrupt(base('trader'), (report) => {
        report.policy = policy;
        for (let index = 0; index < INCOME_STALL_LIMIT * 2; index += 1) {
          report.daily[index].incomeActionCount = 0;
        }
      });
      expect(assertNoIncomeStall(exempt)).toEqual([]);
      expect(runGate(exempt).map((violated) => violated.invariant)).not.toContain(
        'assertNoIncomeStall',
      );
    }
    expect([...GATE_COMPETENT_POLICIES]).toEqual([
      'trader',
      'fighter',
      'explorer',
      'smuggler',
      'gambler',
    ]);
  });

  it('the veteran carries the T-1104 full-tank relaxation (F-159-1 regression pin)', () => {
    // WHY A LIVE RUN AND NOT A HASH. `campaign-degraded.test.ts` pins the veteran's
    // whole career to a fingerprint, which moves for any reason at all and so can
    // never say WHICH branch landed. The Accept for T-161 asks for the relaxation
    // to be grep-able; this is the behavioural half of that — it fails with the
    // OLD NUMBER coming back if the `if (reachable.length === 0) reachable =
    // signableWithin(ship.maxFuel)` second pass in `veteranPolicy` is removed.
    //
    // THE SEEDS ARE THE PRE-FIX WORST CASE, not a convenient sample. Over seeds
    // 1..200 x 35 days on the pre-fix tree these nine each held a 31-day
    // zero-income streak — the longest in the file, on a policy that was the last
    // one without the second pass. Post-fix, measured on the same rig, they sat at
    // 5-10 (seed 4: 10, seed 10: 7, seed 56: 7, seed 62: 5, seed 82: 7, seed 91: 5,
    // seed 135: 6, seed 155: 9, seed 185: 10).
    //
    // T-196b RE-PIN (10 -> 12), RE-MEASURED WITH ITS OWN CONTROL, not widened to
    // pass. MECHANISM: the eight policies stopped budgeting a die for the nine M17
    // Free Actions (docs/DAWN-HAND-REDESIGN.md §3), so the veteran's day plan and
    // the shared dusk rng stream both changed shape. RE-MEASURED on this tree,
    // same nine seeds, same 35-day horizon: 4: 7, 10: 6, 56: 6, 62: 7, 82: 7,
    // 91: 12, 135: 6, 155: 6, 185: 6 — EIGHT of the nine IMPROVED against the
    // pre-T-196b figures and one (seed 91, 5 -> 12) got worse, which is the
    // ordinary re-phasing signature and not a lost branch.
    //
    // THE CONTROL THAT SAYS SO, run rather than asserted: with the
    // `if (reachable.length === 0) reachable = signableWithin(ship.maxFuel)` pass
    // DELETED from `veteranPolicy` on this same tree, all nine seeds go straight
    // back to 31 (4: 31, 10: 31, 56: 31, 62: 31, 82: 31, 135: 31, 155: 31,
    // 185: 31, 91: 31). The pin therefore still discriminates by a factor of ~2.6
    // at the new bar, which is what it exists to do.
    //
    // THE BAR IS THE MEASUREMENT, not a round number and not INCOME_STALL_LIMIT.
    // The veteran is EXEMPT from that limit and still stalls — see F-161-1 below —
    // so asserting `< 5` here would be asserting a fix this task did not make. 12
    // is the measured maximum over these nine seeds; a regression brings 31
    // straight back and reds this immediately.
    const PRE_FIX_31_DAY_SEEDS = [4, 10, 56, 62, 82, 91, 135, 155, 185] as const;
    const POST_FIX_MAX = 12;
    const streaks = PRE_FIX_31_DAY_SEEDS.map((seed) => ({
      seed,
      streak: longestZeroIncomeStreak(runCampaign(seed, 35, 'veteran').daily),
    }));
    const worst = streaks.reduce((a, b) => (b.streak > a.streak ? b : a));
    expect(
      worst.streak,
      `seed ${worst.seed} stalled ${worst.streak} days — pre-fix these nine seeds ` +
        `held 31 each; the full-tank relaxation in veteranPolicy is the branch that ` +
        `closed them`,
    ).toBeLessThanOrEqual(POST_FIX_MAX);
    // ...and the relaxation did not make the veteran a competent policy: it is still
    // out of GATE_COMPETENT_POLICIES because F-161-1 keeps the residual above the
    // limit. Asserted so a future reader cannot mistake the pin above for the gate.
    expect([...GATE_COMPETENT_POLICIES]).not.toContain('veteran');
  }, 60000);

  it('assertCombatRecordsWellFormed catches every malformed-record limb', () => {
    // PUSHED, not mutated: a seeded career need not have fought, and a fixture that
    // depends on it having done so is a fixture that rots on a balance change.
    //
    // The two tier cases are cast through `never` because 0 and 6 are deliberately
    // OUTSIDE the `PowerTier` union — which is the point. The compiler already
    // forbids them at an engine call site; what it cannot police is a row read back
    // from a JSON file on disk, which is exactly what the sweep gates.
    const cases: { detail: string; record: Parameters<typeof encounterRecord>[0] }[] = [
      { detail: 'rounds -1', record: { rounds: -1 } },
      { detail: 'interceptorTier 0', record: { interceptorTier: 0 as never } },
      { detail: 'playerTier 6', record: { playerTier: 6 as never } },
      { detail: 'tributeCredits -5', record: { tributeCredits: -5 } },
    ];
    for (const { detail, record } of cases) {
      const found = expectCaughtBy(
        corrupt(base(), (report) => {
          report.combatEncounters.push(encounterRecord(record));
        }),
        assertCombatRecordsWellFormed,
        'assertCombatRecordsWellFormed',
      );
      expect(found.some((violated) => violated.detail === detail)).toBe(true);
    }
  });

  it('assertCombatRecordsWellFormed catches the two folds disagreeing about a loss', () => {
    const found = expectCaughtBy(
      corrupt(base(), (report) => {
        report.survival.shipsLost = 0;
        report.combatEncounters.push(encounterRecord({ shipLost: true, resolution: 'ship-lost' }));
      }),
      assertCombatRecordsWellFormed,
      'assertCombatRecordsWellFormed',
    );
    expect(found.some((violated) => violated.detail.includes('survival.shipsLost is 0'))).toBe(
      true,
    );
  });

  it('assertRouteRecordsWellFormed catches every malformed-leg limb', () => {
    const cases: { needle: string; leg: Parameters<typeof legRecord>[0] }[] = [
      // The silent-swallow class the invariant exists for: `routeEv` answers null
      // for a leg with no payment, and a DELIVERED leg would then vanish from
      // `routeEvPerDay` while still counting in `routesDelivered`.
      { needle: 'has paidPayment null', leg: { paidPayment: null } },
      { needle: 'delivered on day', leg: { signedDay: 9, deliveredDay: 4 } },
      { needle: 'carries paidPayment', leg: { outcome: 'lost', paidPayment: 500 } },
    ];
    for (const { needle, leg } of cases) {
      const found = expectCaughtBy(
        corrupt(base(), (report) => {
          report.routeLegs.push(legRecord(leg));
        }),
        assertRouteRecordsWellFormed,
        'assertRouteRecordsWellFormed',
      );
      expect(found.some((violated) => violated.detail.includes(needle))).toBe(true);
    }
  });

  it('assertBoardDepthWithinPoolBounds catches both sides of the pool bounds', () => {
    const found = expectCaughtBy(
      corrupt(base(), (report) => {
        report.daily[1].boardDepth = JOB_POOL_BOARD_SIZE + 1;
        report.daily[2].boardDepth = -1;
      }),
      assertBoardDepthWithinPoolBounds,
      'assertBoardDepthWithinPoolBounds',
    );
    expect(found).toHaveLength(2);
  });

  it('the clean, current-state report violates nothing', () => {
    for (const policy of ['trader', 'fighter'] as const) {
      const report = base(policy);
      expect(runGate(report)).toEqual([]);
      expect(buildGateReport(LABEL_PREFIX, 'fixture', 1, runGate(report), []).passed).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// A2 · Totality — the guards that keep the gate honest as it grows
// ---------------------------------------------------------------------------

describe('T-153 · the gate is TOTAL over its own definitions', () => {
  /** Every `assert*` function `gate.ts` exports, read off the module rather than
   *  transcribed — a transcribed list would agree with the file right up until
   *  somebody added a tenth invariant. */
  const exportedAssertNames = Object.entries(gateModule)
    .filter(([name, value]) => name.startsWith('assert') && typeof value === 'function')
    .map(([name]) => name)
    .sort();

  /**
   * The exported `assert*` names `runGate` is expected to reach, which is every one
   * of them MINUS the arm-level registry.
   *
   * THE PARTITION IS ON SIGNATURE, NOT AN EXEMPTION (T-167). An arm-level predicate
   * takes a control aggregate and N variant arms; `runGate` is handed one finished
   * report, which is one arm, so there is nothing for it to compare — wiring one in
   * would be a check that can never fire, not a check that is being skipped. The
   * exemption costs a working fixture: see `ARM_LEVEL_FIXTURES` and the test below.
   */
  const armLevel = new Set(ARM_LEVEL_ASSERTIONS);
  const reportLevelAssertNames = exportedAssertNames.filter((name) => !armLevel.has(name));

  it('runGate reaches EVERY invariant gate.ts exports (the kitchen sink)', () => {
    // The sweep-gate analogue of `balance-rig.test.ts`'s classification-totality
    // guard, and the thing that now holds `runGate`'s "EXPLICIT CALLS, NOT A LOOP"
    // promise honest: a tenth invariant added to `gate.ts` and never wired into
    // `sweep.ts` fails HERE instead of silently never running.
    const kitchenSink = corrupt(base('trader'), (report) => {
      report.daily[3].credits = -40; // assertNoNegativeResources
      report.daily[2].fuel = ABSOLUTE_MAX_FUEL + 1; // assertFuelWithinTank
      report.daily[10].day = report.daily[9].day - 1; // assertDayMonotonic
      report.daily[7].day = report.daily[6].day; // assertOneSamplePerDay
      regressLastRenownRank(report); // assertProgressRatchetsNeverReverse
      for (let index = 0; index < INCOME_STALL_LIMIT; index += 1) {
        report.daily[index].incomeActionCount = 0; // assertNoIncomeStall
      }
      report.combatEncounters.push(encounterRecord({ rounds: -1 }));
      report.routeLegs.push(legRecord({ paidPayment: null }));
      report.daily[1].boardDepth = JOB_POOL_BOARD_SIZE + 1;
    });

    const reached = [...new Set(runGate(kitchenSink).map((violated) => violated.invariant))].sort();
    expect(reached).toEqual(reportLevelAssertNames);
    expect(reportLevelAssertNames).toHaveLength(9);
    // The whole roster, so an arm-level name cannot be quietly added without this
    // count moving too. Nine report-level + one arm-level (T-167).
    expect(exportedAssertNames).toHaveLength(10);
  });

  it('ARM_LEVEL_ASSERTIONS names only real arm-level exports, and each owes a fixture', () => {
    // The registry buys an exemption from the kitchen sink above. This is its price.
    expect([...ARM_LEVEL_ASSERTIONS].sort()).toEqual(Object.keys(ARM_LEVEL_FIXTURES).sort());
    for (const name of ARM_LEVEL_ASSERTIONS) {
      // (a) it is a real exported function on the gate module, not a string nobody
      //     has to keep true;
      expect(exportedAssertNames).toContain(name);
      // (b) it is disjoint from what runGate reaches — an arm-level predicate that
      //     the sweep DOES reach would be miscategorised, not exempt;
      expect(reportLevelAssertNames).not.toContain(name);
      // (c) and it actually fires on a seeded-bad arm set, carrying its own name.
      expectArmLevelCaught(ARM_LEVEL_FIXTURES[name](), name);
    }
  });

  it('SWEEP_INVARIANT_DISPOSITIONS is honest about all eight UGT predicates', () => {
    // The three protocol-seam predicates have no sweep observable. This test is
    // what stops them from being quietly "upgraded" to fake coverage — the
    // green-but-hollow failure mode `docs/TESTING-STRATEGY.md` Part A opens with.
    expect(SWEEP_INVARIANT_DISPOSITIONS).toHaveLength(8);
    const predicates = SWEEP_INVARIANT_DISPOSITIONS.map((row) => row.ugtPredicate);
    expect(new Set(predicates).size).toBe(predicates.length);

    for (const row of SWEEP_INVARIANT_DISPOSITIONS) {
      if (row.disposition === 'not-observable') {
        expect(row.coveredBy).toBeNull();
        // A disposition without an owner is an omission with better manners.
        expect(row.why).toMatch(/T-15[45]/);
      } else {
        expect(row.coveredBy).not.toBeNull();
        expect(exportedAssertNames).toContain(row.coveredBy);
      }
    }
    expect(
      SWEEP_INVARIANT_DISPOSITIONS.filter((row) => row.disposition === 'not-observable'),
    ).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// B · One seeded-bad fixture per expected-event-rate band
// ---------------------------------------------------------------------------

describe('T-153 · seeded-bad fixtures, one per expected-event-rate band', () => {
  let rows: SeedRow[];

  beforeAll(() => {
    rows = cleanRows();
  }, SAMPLE_TIMEOUT_MS);

  it('the clean sample passes every band, and SKIPS none of them', () => {
    // A clean fixture that skips is green-but-hollow: it would prove the gate can
    // decline to answer, not that it answers correctly. The sample is sized in
    // `gate-fixtures.ts` precisely so this holds.
    const results = checkExpectedEventRates(rows);
    expect(results).toHaveLength(8);
    for (const rate of results) {
      expect(`${rate.id}:${rate.status}`).toBe(`${rate.id}:pass`);
    }
    expect(buildGateReport(LABEL_PREFIX, 'merged', rows.length, [], results).passed).toBe(true);
  });

  it('travel-encounter-rate: an expected rate reading 0% across a full shard', () => {
    // THE TASK'S NAMED EXAMPLE, and `docs/TESTING-STRATEGY.md` Part D's: *"an
    // expected ~30% event rate reading 0% across a full shard should fail the run,
    // the same way a broken unit test does."*
    const results = checkExpectedEventRates(
      corruptRows(rows, (row) => {
        row.combat = [];
      }),
    );
    expect(failedRateIds(results)).toEqual(['travel-encounter-rate-per-1k-sim-days']);
  });

  it('route-leg-signing-rate: the board stops producing signable work', () => {
    const results = checkExpectedEventRates(
      corruptRows(rows, (row) => {
        row.routes = [];
      }),
    );
    expect(failedRateIds(results)).toEqual(['route-leg-signing-rate-per-1k-sim-days']);
  });

  it('route-delivery-share: deliveries stop resolving', () => {
    // Only the FLOOR is fixtured. The `max: 1` ceiling is arithmetically
    // unreachable — the numerator is a subset of the denominator by construction —
    // so a ceiling fixture would have to fake the fold rather than seed a defect.
    const results = checkExpectedEventRates(
      corruptRows(rows, (row) => {
        for (const leg of row.routes) leg.outcome = 'lost';
      }),
    );
    expect(failedRateIds(results)).toEqual(['route-delivery-share']);
  });

  it('combat-win-share: combat resolution stops producing wins', () => {
    // The losing resolution is chosen by ASKING `isCombatWin`, not by assuming
    // which strings it rejects.
    const losing = 'talked-down' as const;
    expect(isCombatWin(encounterRecord({ resolution: losing }))).toBe(false);
    const results = checkExpectedEventRates(
      corruptRows(rows, (row) => {
        for (const record of row.combat) record.resolution = losing;
      }),
    );
    expect(failedRateIds(results)).toEqual(['combat-win-share']);
  });

  it('ship-loss-share: lethality saturates (the ceiling limb — this band has no floor)', () => {
    const results = checkExpectedEventRates(
      corruptRows(rows, (row) => {
        row.shipsLost = row.combat.length;
      }),
    );
    expect(failedRateIds(results)).toEqual(['ship-loss-share-of-encounters']);
  });

  it('tour-one-clear-share: Tour One becomes unclearable', () => {
    const results = checkExpectedEventRates(
      corruptRows(rows, (row) => {
        if (row.tourOneOutcome !== null) row.tourOneOutcome = 'unpaid';
      }),
    );
    expect(failedRateIds(results)).toEqual(['tour-one-clear-share']);
  });

  it('runs-earning-any-deed-share: deeds become unreachable', () => {
    const results = checkExpectedEventRates(
      corruptRows(rows, (row) => {
        row.deedCount = 0;
      }),
    );
    expect(failedRateIds(results)).toEqual(['runs-earning-any-deed-share']);
  });

  it('board-depth-mean: the N10 "boards empty" Disproves limb', () => {
    const results = checkExpectedEventRates(
      corruptRows(rows, (row) => {
        row.boardDepths = row.boardDepths.map(() => 1);
      }),
    );
    expect(failedRateIds(results)).toEqual(['board-depth-mean']);
  });

  it('SKIPPED is a third value, not a quiet pass', () => {
    // A 2-row developer sweep must not be able to FAIL on sampling noise, and must
    // not be able to report PASS either — `status` is three-valued for exactly this
    // reason and `formatGateReport` prints it on its own line.
    const tiny = checkExpectedEventRates(rows.slice(0, 2));
    for (const rate of tiny) {
      expect(rate.denominator).toBeLessThan(rate.minSample);
      expect(`${rate.id}:${rate.status}`).toBe(`${rate.id}:skipped`);
      expect(rate.detail).toContain('minSample');
    }
    expect(buildGateReport(LABEL_PREFIX, 'shard 1/1', 2, [], tiny).passed).toBe(true);
  });

  it('formatGateReport keeps a failure GREP-ABLE back to its definition site', () => {
    // T-152's acceptance rests on the printed table naming the offending invariant
    // and the offending rate id; the CI job's evidence is a `grep '\[gate\]'`.
    const violations = runGate(
      corrupt(base(), (report) => {
        report.daily[3].credits = -40;
      }),
    );
    const rates = checkExpectedEventRates(
      corruptRows(rows, (row) => {
        row.combat = [];
      }),
    );
    const text = formatGateReport(
      buildGateReport(LABEL_PREFIX, 'merged', rows.length, violations, rates),
    );
    expect(text).toContain('assertNoNegativeResources');
    expect(text).toContain('travel-encounter-rate-per-1k-sim-days');
    expect(text).toContain('FAIL');
  });
});

// ---------------------------------------------------------------------------
// C · The exit-code leg — through the entry points CI actually invokes
// ---------------------------------------------------------------------------

describe('T-153 · the gate sets a non-zero exit code, and only when it should', () => {
  let rows: SeedRow[];

  beforeAll(() => {
    rows = cleanRows();
  }, SAMPLE_TIMEOUT_MS);

  it('a clean sweep through main() exits ZERO', () => {
    withTempDir((dir, gateOutput) => {
      main([
        '--label',
        `${LABEL_PREFIX}-clean`,
        '--seeds',
        '2',
        '--days',
        '35',
        '--policies',
        'trader,fighter',
        '--shard',
        '1/1',
        '--milestone-days',
        '10,30',
        '--out',
        dir,
        '--aggregate-out',
        dir,
      ]);
      expect(process.exitCode ?? 0).toBe(0);
      // Four real runs is far below every `minSample`, so the rates report SKIPPED
      // here — correctly, and it is exactly why the in-band clean-rate assertion
      // lives in its own 104-row test above rather than being folded into this one.
      const report = readGateReport(dir, `gate-${LABEL_PREFIX}-clean-shard1of1.json`);
      expect(report.passed).toBe(true);
      expect(report.violationCount).toBe(0);
      expect(report.rows).toBe(4);
      // The PRINTED verdict agrees with the written one, and never says FAIL.
      expect(gateOutput()).toContain(`[gate] ${LABEL_PREFIX}-clean · shard 1/1 · 4 rows · PASS`);
      expect(gateOutput()).not.toContain('· FAIL');
    });
  }, 120_000);

  it('a seeded-bad row set through the real --merge CLI exits NON-ZERO', () => {
    withTempDir((dir, gateOutput) => {
      const bad = corruptRows(rows, (row) => {
        row.combat = [];
      });
      writeFileSync(
        join(dir, `rows-${LABEL_PREFIX}-bad-shard1of1.json`),
        `${JSON.stringify(bad)}\n`,
        'utf8',
      );
      main(['--merge', '--label', `${LABEL_PREFIX}-bad`, '--out', dir, '--aggregate-out', dir]);
      expect(process.exitCode).toBe(1);
      const report = readGateReport(dir, `gate-${LABEL_PREFIX}-bad-merged.json`);
      expect(report.passed).toBe(false);
      expect(failedRateIds(report.rates)).toEqual(['travel-encounter-rate-per-1k-sim-days']);
      // The printed table names the verdict and the offending rate — the thing a
      // reader greps for. Asserted HERE, off the captured buffer, rather than
      // shouted into the shared `npm test` log where it reads as a real failure.
      const printed = gateOutput();
      expect(printed).toContain(`[gate] ${LABEL_PREFIX}-bad · merged · ${rows.length} rows · FAIL`);
      expect(printed).toContain('[gate] rate travel-encounter-rate-per-1k-sim-days: FAIL');
    });
  }, 120_000);

  it('a clean row set through the real --merge CLI exits ZERO', () => {
    withTempDir((dir, gateOutput) => {
      writeFileSync(
        join(dir, `rows-${LABEL_PREFIX}-clean-merge-shard1of1.json`),
        `${JSON.stringify(rows)}\n`,
        'utf8',
      );
      main([
        '--merge',
        '--label',
        `${LABEL_PREFIX}-clean-merge`,
        '--out',
        dir,
        '--aggregate-out',
        dir,
      ]);
      expect(process.exitCode ?? 0).toBe(0);
      const report = readGateReport(dir, `gate-${LABEL_PREFIX}-clean-merge-merged.json`);
      expect(report.passed).toBe(true);
      expect(report.rows).toBe(rows.length);
      for (const rate of report.rates) {
        expect(`${rate.id}:${rate.status}`).toBe(`${rate.id}:pass`);
      }
      expect(gateOutput()).toContain(
        `[gate] ${LABEL_PREFIX}-clean-merge · merged · ${rows.length} rows · PASS`,
      );
      expect(gateOutput()).not.toContain('· FAIL');
    });
  }, 120_000);

  it('a seeded invariant violation exits NON-ZERO through reportGate', () => {
    // WHY THIS LEG GOES THROUGH `reportGate` AND NOT A FULL `main()` SWEEP: see the
    // file header. The flat invariants are functions of a report the real engine
    // produced, so a real sweep cannot be made to emit a negative-credits row
    // without breaking the engine. And `--merge` deliberately does not re-run them
    // (`SeedRow` carries no `daily[]` — stated at `sweep.ts`'s `mergeShards`), which
    // is a limitation this suite records rather than "fixes".
    withTempDir((dir, gateOutput) => {
      const parsed = parseSweepArgs([
        '--label',
        `${LABEL_PREFIX}-invariant`,
        '--out',
        dir,
        '--aggregate-out',
        dir,
      ]);
      expect('help' in parsed).toBe(false);
      if ('help' in parsed) return;

      const violations = runGate(
        corrupt(base(), (report) => {
          report.daily[3].credits = -40;
        }),
      );
      reportGate(parsed, 'shard 1/1', rows, violations);
      expect(process.exitCode).toBe(1);

      const report = readGateReport(dir, `gate-${LABEL_PREFIX}-invariant-shard1of1.json`);
      expect(report.passed).toBe(false);
      expect(report.violations.map((row) => row.invariant)).toContain('assertNoNegativeResources');
      // The rows are the CLEAN sample, so the verdict is FAIL on the invariant
      // alone — no rate is doing the work.
      expect(failedRateIds(report.rates)).toEqual([]);
      // The example line a reader would act on, asserted off the captured buffer.
      // Printing it into the shared log instead is what produced F-162-5's false
      // alarm: this exact text, out of a suite that passed.
      const printed = gateOutput();
      expect(printed).toContain(
        `[gate] ${LABEL_PREFIX}-invariant · shard 1/1 · ${rows.length} rows · FAIL`,
      );
      expect(printed).toContain('[gate]   assertNoNegativeResources · trader · 1');
      expect(printed).toContain('credits -40');
    });
  }, 120_000);

  it('the stderr capture is bounded, and a real break still gets its output', () => {
    // F-162-5's fix mutes production-shaped fixture text out of the shared run log.
    // That is only safe while it is BOTH temporary and non-swallowing — a capture
    // that outlived its run, or that ate the diagnostics of a genuine crash, would
    // trade one silent-failure mode for a worse one. Both halves asserted here.
    const seen: string[] = [];
    const real: StderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => {
      seen.push(typeof chunk === 'string' ? chunk : String(chunk));
      return true;
    };
    try {
      expect(() =>
        withTempDir(() => {
          process.stderr.write('[gate] fixture-shaped noise from a run that then broke\n');
          throw new Error('boom');
        }),
      ).toThrow('boom');
      // The capture is gone even on the throwing path, so later writes route
      // straight back out again.
      process.stderr.write('a later, uncaptured line\n');
    } finally {
      process.stderr.write = real;
    }
    const escaped = seen.join('');
    // NOT swallowed: the throwing run's buffered output was replayed.
    expect(escaped).toContain('fixture-shaped noise from a run that then broke');
    // NOT permanent: the stream works normally once the run is over.
    expect(escaped).toContain('a later, uncaptured line');
  });

  it('wrote nothing into the committed docs/balance/ directory', () => {
    // Every path above points BOTH `--out` and `--aggregate-out` at a mkdtemp dir,
    // because `--aggregate-out` defaults to `docs/balance/` and a merge writes
    // `baseline-<label>.json` there. A green run that quietly overwrote a committed
    // baseline with a 104-row sample is the accident this asserts against.
    const leaked = readdirSync(DOCS_BALANCE).filter((name) => name.includes(LABEL_PREFIX));
    expect(leaked).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D · T-167 — the rig sensitivity check, demonstrated against F-151-9
// ---------------------------------------------------------------------------

describe('T-167 · the rig sensitivity check', () => {
  const CHECK = 'assertVariantsPerturbEveryPolicy';

  it('catches F-151-9 — `fighter` flat at 2,825cr under all eight rig variants', () => {
    // THE CASE THE PREDICATE EXISTS FOR, replayed off the matrix
    // `docs/PLAYER-TRINKETS_SPEC.md` §2.3(b) published: 8 policies x 8 variants x
    // 300 seeds x 35 days, and the `fighter` row reads 2825 in every column. A
    // human found that by reading a table; this is the verdict.
    const found = expectArmLevelCaught(ARM_LEVEL_FIXTURES[CHECK](), CHECK);

    // EXACTLY ONE policy, and it is the right one. This is the leg that proves the
    // check is not merely "everything looks flat to me": `explorer`, `greedy`,
    // `trader` and `veteran` are each byte-identical to the control under SOME arm
    // in this very matrix, and every one of them must stay green.
    expect(found.map((violated) => violated.policy)).toEqual(['fighter']);
    expect(found[0].detail).toContain('2825');
    expect(found[0].detail).toContain(`all ${TRINKET_RIG_VARIANTS.length} live variants`);
    for (const variant of TRINKET_RIG_VARIANTS) {
      expect(found[0].detail).toContain(variant);
    }
    // The four rows that are flat SOMEWHERE, named, so this control cannot rot into
    // a vacuous "no other violations" assertion if the matrix is ever re-transcribed.
    for (const policy of ['explorer', 'greedy', 'trader', 'veteran'] as const) {
      const cells = TRINKET_RIG_MEDIANS[policy];
      expect(cells.slice(1).some((cell) => cell === cells[0])).toBe(true);
      expect(found.map((violated) => violated.policy)).not.toContain(policy);
    }
  });

  it('the verdict and the printed table both carry it', () => {
    const found = ARM_LEVEL_FIXTURES[CHECK]();
    const report = buildGateReport(LABEL_PREFIX, 'rig', 0, found, []);
    expect(report.passed).toBe(false);
    expect(report.violationCount).toBe(1);
    // Asserted off `formatGateReport` directly rather than through `reportGate`:
    // this suite must not print production-shaped `[gate] … FAIL` text into the
    // shared run log (F-162-5, see `withTempDir`).
    const text = formatGateReport(report);
    expect(text).toContain(CHECK);
    expect(text).toContain('fighter');
    expect(text).toContain('FAIL');
  });

  it('goes GREEN when the flat policy moves — a check that cannot pass is not a check', () => {
    // The negative control. ONE cell moved, by ONE credit, in the `trade_p2` column
    // (index 7): `fighter` now has somewhere it is sensitive, and the verdict
    // flips. The matrix itself is evidence and is never edited — this is a clone.
    const moved = rigMatrixWith((cells, policy) =>
      policy === 'fighter' ? cells.map((cell, index) => (index === 7 ? cell + 1 : cell)) : cells,
    );
    const { control, variants } = trinketRigArms(moved);
    expect(assertVariantsPerturbEveryPolicy(control, variants)).toEqual([]);
  });

  it('a DEAD ARM is reported as itself, and never inflates the flat verdict', () => {
    // An eighth arm byte-identical to the control — the harness failure the first
    // limb exists for (`§2.1`: the rig's own first draft was not live). It is
    // reported under the VARIANT id, and it must NOT count toward the live
    // denominator: a dead arm left in would make every policy "flat in all arms"
    // and bury the real finding under one violation per policy.
    const DEAD = 'dead_p0';
    const withDead = rigMatrixWith((cells) => [...cells, cells[0]]);
    const { control, variants } = trinketRigArms(withDead, [...TRINKET_RIG_VARIANTS, DEAD]);
    const found = expectArmLevelCaught(assertVariantsPerturbEveryPolicy(control, variants), CHECK);

    expect(found.map((violated) => violated.policy)).toEqual([DEAD, 'fighter']);
    expect(found[0].detail).toContain('the patched build is not live');
    expect(found[0].detail).toContain(control.label);
    // The flat verdict is UNCHANGED: still seven live variants, still only fighter.
    expect(found[1].detail).toContain(`all ${TRINKET_RIG_VARIANTS.length} live variants`);
    expect(found[1].detail).not.toContain(DEAD);
  });

  it('declines to reach a flatness verdict below the live-variant floor', () => {
    // ONE live variant proves nothing, and this matrix is the proof: under
    // `guns_p1` the `explorer` policy sits at 16,847cr in BOTH columns — identical,
    // and entirely legitimate, because a GUNS bonus has no business moving a policy
    // that never fights. Asserted, not asserted-about.
    expect(TRINKET_RIG_MEDIANS.explorer[2]).toBe(TRINKET_RIG_MEDIANS.explorer[0]);
    expect(SENSITIVITY_MIN_LIVE_VARIANTS).toBe(2);

    const { control, variants } = trinketRigArms();
    const gunsOnly = variants[TRINKET_RIG_VARIANTS.indexOf('guns_p1')];
    // The arm IS live (it moves `veteran`, 4860 -> 4875), so this is the
    // under-powered path and not the dead-arm one — no violation of either kind.
    expect(assertVariantsPerturbEveryPolicy(control, [gunsOnly])).toEqual([]);
    // ...and two live arms are enough to reach a verdict again.
    expect(
      assertVariantsPerturbEveryPolicy(control, variants.slice(0, SENSITIVITY_MIN_LIVE_VARIANTS)),
    ).not.toEqual([]);
  });

  it(
    'works on aggregates the real engine produced, not only on the transcribed matrix',
    () => {
      // The leg that stops this predicate from being proven only against a table
      // somebody typed in. `cleanRows()` is 52 seeds x {trader, fighter}; both
      // variants move `trader` and neither touches `fighter`, so the real fold —
      // whole per-policy blocks, every field the aggregate carries — must name
      // `fighter` and nothing else.
      const rows = cleanRows();
      const control = aggregate('t167-real-control', rows);
      const variants = [1, 2].map((delta) => ({
        variant: `trader-plus-${delta}cr`,
        aggregate: aggregate(
          `t167-real-plus-${delta}`,
          corruptRows(rows, (row) => {
            if (row.policy === 'trader') row.finalCredits += delta;
          }),
        ),
      }));
      const found = expectArmLevelCaught(
        assertVariantsPerturbEveryPolicy(control, variants),
        CHECK,
      );
      expect(found.map((violated) => violated.policy)).toEqual(['fighter']);
      expect(found[0].detail).toContain('all 2 live variants');
    },
    SAMPLE_TIMEOUT_MS,
  );

  it(
    'T-174 · the live fighter rig moves under fresh-start GUNS/GRIT perturbations',
    () => {
      const seeds = Array.from({ length: 120 }, (_, index) => index + 1);
      const rows = (playerStatDeltas: Partial<Record<Stat, number>>) =>
        seeds.map((seed) =>
          summarizeReport(
            runCampaign(seed, 35, 'fighter', {
              milestoneDays: FIXTURE_MILESTONES,
              playerStatDeltas,
            }),
          ),
        );
      const control = aggregate('t174-fighter-control', rows({}));
      const variants = [
        { variant: 'guns_p1', aggregate: aggregate('t174-fighter-guns-p1', rows({ GUNS: 1 })) },
        { variant: 'grit_p1', aggregate: aggregate('t174-fighter-grit-p1', rows({ GRIT: 1 })) },
        { variant: 'guns_p2', aggregate: aggregate('t174-fighter-guns-p2', rows({ GUNS: 2 })) },
        { variant: 'grit_p2', aggregate: aggregate('t174-fighter-grit-p2', rows({ GRIT: 2 })) },
      ];

      const medians = variants.map(
        (arm) =>
          arm.aggregate.byPolicy[0].finalCredits.median - control.byPolicy[0].finalCredits.median,
      );
      expect(
        medians.some((delta) => delta !== 0),
        `fighter deltas ${medians.join(', ')}`,
      ).toBe(true);
      expect(assertVariantsPerturbEveryPolicy(control, variants)).toEqual([]);
    },
    SAMPLE_TIMEOUT_MS,
  );
});
