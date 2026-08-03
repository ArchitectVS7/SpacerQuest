/**
 * T-152 · THE SWEEP GATE — the sweep's invariants as a pass/fail check.
 *
 * `docs/TESTING-STRATEGY.md` Part D, Tier 1, in one sentence: *"A sweep that
 * produces a negative-credits row or a statistical anomaly (e.g. an expected ~30%
 * event rate reading 0% across a full shard) should fail the run, the same way a
 * broken unit test does."* Before this file the sweep only ever REPORTED; a
 * regression showed up as a number in a baseline that somebody had to notice.
 *
 * THE PURE HALF, and deliberately so. No `fs`, no `process`, no clock, no rng —
 * the same contract `./aggregate.js` states for itself and for the same reason
 * (the T-1602b `flake.ts`/`flake-io.ts` split): CI and a local re-run must not be
 * able to reach different verdicts from the same rows. `./sweep.ts` is the only
 * caller that touches argv, the filesystem or `process.exitCode`.
 *
 * WHY THE PREDICATES RETURN VIOLATIONS INSTEAD OF THROWING. This is the T-1604a
 * `ExploitHunter` discipline, transcribed: it "already never stops on a failure
 * (it dedups into `HuntReport.findings` and keeps walking)", because a failed
 * check is DATA. A `throw` on the first negative-credits row of a 3,500-run
 * campaign would report one seed and hide the shape of the defect. So every
 * `assert*` function below collects and returns; `./sweep.ts` fails ONCE, at the
 * end, on a non-empty collection. The word `assert` in the name is the contract,
 * the non-zero exit is the enforcement.
 *
 * THERE IS NO OPT-OUT. No `--no-gate`, no environment escape hatch, no "expected
 * violations" constant to edit. The house rule is stated next door in
 * `./rules-fingerprint.ts` and it applies here verbatim: nothing in this file may
 * be widened, softened or bypassed to make a run pass. If a legitimate change
 * moves a measurement outside a band, that is a finding that owes a recorded
 * ruling and a re-measured band with cited evidence — see
 * {@link EXPECTED_EVENT_RATES}.
 *
 * T-157 · THE COVERAGE MATRIX RIDES IN THIS REPORT, BUT LIVES NEXT DOOR. The
 * question "is this archetype's headline verb even testable?" is answered by
 * `./coverage.ts` against `docs/NPC_REDESIGN.md`'s PARITY LEDGER, and its results
 * are carried on {@link GateReport.coverage} and printed by
 * {@link formatGateReport}. It is deliberately NOT an `assert*` export here: those
 * are per-report predicates that `runGate` composes and `sweep-gate.test.ts`
 * enumerates, whereas coverage is a RUN-level check over the policy set. Its
 * warn-versus-fail rule is stated once, at `./coverage.ts`'s header; the only part
 * that binds this file is that a coverage FAILURE (an unclassified policy, or an
 * uncovered one with no acknowledged, owner-named gap) sets `passed` false, while
 * an acknowledged gap prints a named warning and does not.
 *
 * READERS (constraint 7): `./sweep.ts` (calls every function below by name),
 * `../__tests__/support/campaign-drivers.ts` (re-exports
 * {@link longestZeroIncomeStreak}), and — from T-153 — the behavioural suite that
 * proves the gate actually catches what it claims to.
 */

import { EXPLORE_ITEMS, YARD_COMPONENT_TIER_PRICES, type PowerTier } from '@spacerquest/content';
import {
  JOB_POOL_BOARD_SIZE,
  calculateFuelCapacity,
  componentTierForStrength,
  renownRankIndex,
} from '@spacerquest/engine';

import type {
  CampaignDayStats,
  CampaignStatsReport,
  CombatEncounterRecord,
  RouteLegRecord,
  SimPolicyName,
} from '../index.js';
import { isCombatWin, type SeedRow } from './aggregate.js';
import { coverageFailures, formatCoverageLines, type ArchetypeCoverageResult } from './coverage.js';

// ---------------------------------------------------------------------------
// The violation record
// ---------------------------------------------------------------------------

/**
 * ONE failed check. Carries enough to reproduce it — a seed, a policy and (where
 * the check is per-day) the day — because a gate that says only "an invariant
 * broke" costs a re-run to act on.
 *
 * `invariant` is the exact NAME of the `assert*` function that produced it, which
 * is what lets the printed table and the JSON report be grepped back to a
 * definition site.
 */
export interface SweepViolation {
  invariant: string;
  seed: number;
  policy: string;
  /** Null for a whole-run check (a malformed record set, a run-level ratchet). */
  day: number | null;
  detail: string;
}

function violation(
  invariant: string,
  report: Pick<CampaignStatsReport, 'seed' | 'policy'>,
  day: number | null,
  detail: string,
): SweepViolation {
  return { invariant, seed: report.seed, policy: report.policy, day, detail };
}

// ---------------------------------------------------------------------------
// Derived bounds — imported, never restated
// ---------------------------------------------------------------------------

/**
 * The condition a pristine component sits at. There is no named constant for
 * this in the engine — it is the pervasive literal in `npc.ts`'s ship builders,
 * in `state.ts`'s `calculateFuelCapacity(1, 9)` starter tank, and in
 * `actions/shipyard.ts` `repairCost`, which charges `(9 - condition) * strength`
 * and therefore defines 9 as "nothing left to repair". Mirrored here ONCE, with
 * its provenance, rather than spelled at three call sites below.
 */
const PRISTINE_COMPONENT_CONDITION = 9;

/**
 * The largest component strength the yard can sell, recovered from the engine's
 * OWN inverse (`componentTierForStrength`) against the content ladder's height
 * (`YARD_COMPONENT_TIER_PRICES.length`) rather than by restating
 * `applyShipyardMutation`'s `strength = tier * 10`. A restated mapping is a
 * second source of truth that agrees right up until somebody changes the ladder.
 *
 * This lands on the TOP of the top tier's strength band (99, not the 90 the yard
 * actually parks at), which is the safe direction for a ceiling: it can never
 * under-state the bound and so can never produce a false violation.
 */
const MAX_YARD_COMPONENT_STRENGTH = ((): number => {
  const topTier = YARD_COMPONENT_TIER_PRICES.length;
  let strength = 1;
  while (componentTierForStrength(strength + 1) <= topTier) strength += 1;
  return strength;
})();

/**
 * Every `maxFuel` point the explore tables can bolt on, summed. `syncMaxFuel` is
 * the single chokepoint that adds `bonusMaxFuel` on top of the hull-derived
 * capacity (`economy.ts`, finding F-112-B), so a career that somehow held EVERY
 * Class-A fuel item would sit exactly here above the hull ceiling. Summed from
 * content so a new item cannot silently outgrow this bound.
 */
const MAX_EXPLORE_FUEL_BONUS = EXPLORE_ITEMS.reduce((total, item) => {
  if (item.class !== 'ship') return total;
  return (
    total +
    item.deltas.reduce((sum, delta) => (delta.element === 'maxFuel' ? sum + delta.amount : sum), 0)
  );
}, 0);

/**
 * THE ABSOLUTE FUEL CEILING no career can exceed, derived from the engine's own
 * capacity function at the strongest hull the game can produce. Deliberately not
 * a literal: `FUEL_CAPACITY_HULL_MULTIPLIER` has already moved once (10 → 30, see
 * `economy.ts`) and a transcribed number would have gone stale in that commit.
 *
 * This is the WEAK tier of {@link assertFuelWithinTank}; the exact
 * `fuel <= maxFuel` form is only available on milestone samples, and the function
 * says so at its own definition site rather than letting the name imply more.
 */
export const ABSOLUTE_MAX_FUEL =
  calculateFuelCapacity(MAX_YARD_COMPONENT_STRENGTH, PRISTINE_COMPONENT_CONDITION) +
  MAX_EXPLORE_FUEL_BONUS;

/** `PowerTier` is 1..5 (`content/src/combat.ts`); the bounds a well-formed combat
 *  record's two tier fields must sit inside. */
const MIN_POWER_TIER: PowerTier = 1;
const MAX_POWER_TIER: PowerTier = 5;

/**
 * The poverty-trap threshold, transcribed from the campaign suite that already
 * asserts it (`campaign-policies.test.ts:179`, `campaign-smuggler-gambler.test.ts:173`
 * — both `expect(longestZeroIncomeStreak(report.daily)).toBeLessThan(5)`). Named
 * here so the sweep-side and test-side statements of the same rule can be grepped
 * against each other.
 */
export const INCOME_STALL_LIMIT = 5;

/**
 * The policies {@link assertNoIncomeStall} is asked of, and the scoping is not a
 * convenience — it is `docs/BALANCE-POLICY.md` E4 verbatim: *"The test suite
 * scopes the anti-poverty-trap check to the competent NPC policies, not to every
 * possible policy (a deliberately self-destructive or degenerate policy is not in
 * scope)."*
 *
 * MEMBERSHIP IS TAKEN FROM THE SUITE THAT ALREADY ASSERTS THIS RULE, not invented
 * here — `campaign-policies.test.ts`'s `COMPETENT_POLICIES` (trader, fighter,
 * explorer) plus the two the sibling `campaign-smuggler-gambler.test.ts` asserts
 * the identical `< 5` against (smuggler, gambler). The exclusions are each a
 * recorded exemption, not a convenience:
 *   - `veteran` — EXEMPT AT ITS OWN DEFINITION SITE, in those words: "It is NOT
 *     in COMPETENT_POLICIES: it is an endgame grinder, not a lean balance
 *     baseline, so it is exempt from the poverty-trap sweep" (`../index.ts`
 *     `veteranPolicy`). It is a `DEFAULT_POLICIES` member and it does stall.
 *
 *     RE-JUSTIFIED AND RE-NUMBERED AT T-161 (2026-08-02), because the note that
 *     stood here was wrong in BOTH the number and the mechanism and an exemption
 *     whose stated figure is off by 4x is not an exemption. It used to read "the
 *     first run of this gate measured 6-8 consecutive zero-income days on every
 *     seed of a 35-day arm, which is the grinder banking dice for a gated refit
 *     doing exactly what it is built to do." Re-measured over seeds 1..200 x 35
 *     days on the pre-fix tree: worst streak **31**, with **198 of 200** seeds at
 *     or over the limit. And it was never dice-banking — the veteran was the last
 *     policy in `../index.ts` whose contract filter had no full-tank second pass
 *     (finding F-159-1), so at a rim port it signed nothing at all.
 *
 *     T-161 ported that relaxation. Post-fix on the same rig: worst streak **13**
 *     (the nine seeds that held the 31-day strand fall to 5-10), but still **197
 *     of 200** seeds at or over the limit — so the veteran DOES NOT join this
 *     list. The residual is a second, separately-filed defect (F-161-1,
 *     `docs/BALANCE-POLICY.md` D.2a): `veteranPolicy` takes EVERY offered
 *     storylet as a standalone day where three sibling policies resolve a
 *     die-free choice inline, so on a port with a live storylet queue it never
 *     reaches its contract block. That is the honest mechanism; when F-161-1 is
 *     closed, re-measure and revisit membership rather than assuming either way.
 *   - `greedy` — the naive CONTROL. It is in `DEFAULT_POLICIES` precisely so the
 *     memo can say what playing badly costs, and it clears Tour One at 0.00 in
 *     `docs/balance/baseline-t150-postfix.json`. Gating on it would fail the
 *     sweep for the control behaving like a control.
 *   - `trader-degraded` — an INSTRUMENT, not an archetype, and its own definition
 *     site already states it is out of scope for this invariant "per errata E4".
 *   - `idle` / `random` — protocol/robustness instruments; `idle` takes no income
 *     action by construction.
 */
export const GATE_COMPETENT_POLICIES: readonly SimPolicyName[] = [
  'trader',
  'fighter',
  'explorer',
  'smuggler',
  'gambler',
];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * The longest run of consecutive days on which the policy took NO
 * income-producing action (sign / travel-to-deliver / explore / fight-or-talk).
 * The poverty-trap invariant is that this never reaches {@link INCOME_STALL_LIMIT}
 * — the policy is never stranded with no legal way to make progress.
 *
 * LIFTED HERE FROM `../__tests__/support/campaign-drivers.ts` (T-152), which now
 * re-exports it. A `__tests__` support module is not importable from `src/`, so
 * the gate would otherwise have had to re-derive the streak — and two copies of a
 * threshold rule are exactly how a test and a gate come to disagree about whether
 * the same run passed.
 */
export function longestZeroIncomeStreak(daily: readonly { incomeActionCount: number }[]): number {
  let longest = 0;
  let current = 0;
  for (const day of daily) {
    if (day.incomeActionCount === 0) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
}

// ---------------------------------------------------------------------------
// The invariants — one named, grep-able function each
// ---------------------------------------------------------------------------

/**
 * UGT `inv_no_negative_resources` — `credits`, `debt` and `fuel` are never
 * negative.
 *
 * THE ONE THAT ALREADY CAUGHT SOMETHING. T-1604a Finding F1 is a `credits = -40`
 * state reached in legs 3 and 4, and it is the reason that campaign's own gate
 * reads "NOT MET — 14/16 checks" rather than green. The committed evidence that
 * the floor holds on today's line is `docs/balance/baseline-t150-postfix.json`,
 * whose `fleet.finalCredits.min` is 100.
 *
 * Checked on every `daily[]` sample AND on `finalState`, because the two are
 * different moments: `daily` is sampled after the dusk, `finalState` after the
 * horizon's post-loop flush.
 */
export function assertNoNegativeResources(report: CampaignStatsReport): SweepViolation[] {
  const name = 'assertNoNegativeResources';
  const violations: SweepViolation[] = [];
  for (const day of report.daily) {
    if (day.credits < 0)
      violations.push(violation(name, report, day.day, `credits ${day.credits}`));
    if (day.debt < 0) violations.push(violation(name, report, day.day, `debt ${day.debt}`));
    if (day.fuel < 0) violations.push(violation(name, report, day.day, `fuel ${day.fuel}`));
  }
  const final = report.finalState;
  if (final.credits < 0) {
    violations.push(violation(name, report, final.day, `finalState.credits ${final.credits}`));
  }
  if (final.debt < 0) {
    violations.push(violation(name, report, final.day, `finalState.debt ${final.debt}`));
  }
  if (final.fuel < 0) {
    violations.push(violation(name, report, final.day, `finalState.fuel ${final.fuel}`));
  }
  return violations;
}

/**
 * UGT `inv_fuel_within_tank` — `fuel <= maxFuel`.
 *
 * TWO TIERS, AND THE WEAKENING IS STATED HERE RATHER THAN HIDDEN. `CampaignDayStats`
 * carries `fuel` but not `maxFuel` (the tank is derived from the hull and the hull
 * is not on the day record), so the per-day form can only assert the ABSOLUTE
 * ceiling {@link ABSOLUTE_MAX_FUEL} — enough to catch a runaway tank, not enough
 * to catch a ship carrying 40 units in a 30-unit hold.
 *
 * The EXACT form is available on `milestones[]`, which carries both fields — and
 * milestones exist only when the sweep was run with `--milestone-days`. The CI
 * gate job passes `--milestone-days`, so the exact branch genuinely executes
 * there; a bare local sweep gets the weak tier only.
 */
export function assertFuelWithinTank(report: CampaignStatsReport): SweepViolation[] {
  const name = 'assertFuelWithinTank';
  const violations: SweepViolation[] = [];
  for (const day of report.daily) {
    if (day.fuel > ABSOLUTE_MAX_FUEL) {
      violations.push(
        violation(
          name,
          report,
          day.day,
          `fuel ${day.fuel} > absolute ceiling ${ABSOLUTE_MAX_FUEL}`,
        ),
      );
    }
  }
  for (const sample of report.milestones ?? []) {
    if (sample.player.fuel > sample.player.maxFuel) {
      violations.push(
        violation(
          name,
          report,
          sample.day,
          `milestone fuel ${sample.player.fuel} > maxFuel ${sample.player.maxFuel}`,
        ),
      );
    }
  }
  return violations;
}

/**
 * UGT `inv_day_monotonic` — the calendar never runs backwards.
 *
 * THE CONTRACT ACTUALLY VERIFIED, not the one assumed. `runCampaign`'s day loop
 * has no early exit: a career-ending run keeps playing days (succession hands the
 * seat to an heir), so `daily` is never truncated and `daily.length === days`
 * holds unconditionally. That is asserted here alongside the step check, because
 * a silently-short `daily` would weaken every other per-day invariant on this
 * page without breaking any of them.
 *
 * The step is exactly 1: each iteration pushes the post-dusk `state.day`, and one
 * `endDay` advances the calendar by one.
 */
export function assertDayMonotonic(report: CampaignStatsReport): SweepViolation[] {
  const name = 'assertDayMonotonic';
  const violations: SweepViolation[] = [];
  if (report.daily.length !== report.days) {
    violations.push(
      violation(
        name,
        report,
        null,
        `daily has ${report.daily.length} entries for a ${report.days}-day horizon`,
      ),
    );
  }
  for (let index = 1; index < report.daily.length; index += 1) {
    const previous = report.daily[index - 1].day;
    const current = report.daily[index].day;
    if (current !== previous + 1) {
      violations.push(
        violation(name, report, current, `day ${previous} was followed by ${current}`),
      );
    }
  }
  return violations;
}

/**
 * UGT `inv_phaseday_binary` — A DECLARED ANALOGUE, and the name must not be read
 * as more than it is.
 *
 * The UGT predicate asserts `phaseDay ∈ {0,1}` over the protocol's dawn/dusk
 * phase field. The sweep has no phase field at all: `runCampaign` inlines
 * `startDay → act → endDay` and reports one folded record per day. The
 * STRUCTURAL equivalent of "the day has exactly two phases and they alternate" is
 * therefore "each simulated day produced exactly one dawn/dusk sample" — no day
 * number appears twice in `daily[]`.
 *
 * Kept separate from {@link assertDayMonotonic} even though a strict +1 step
 * already implies distinctness: the two answer different questions (ordering vs
 * multiplicity), and folding them would leave the UGT predicate with no named
 * home in this file. It is listed as `analogue`, never `mapped`, in
 * {@link SWEEP_INVARIANT_DISPOSITIONS}.
 */
export function assertOneSamplePerDay(report: CampaignStatsReport): SweepViolation[] {
  const name = 'assertOneSamplePerDay';
  const violations: SweepViolation[] = [];
  const seen = new Set<number>();
  for (const day of report.daily) {
    if (seen.has(day.day)) {
      violations.push(violation(name, report, day.day, `day ${day.day} sampled more than once`));
    }
    seen.add(day.day);
  }
  return violations;
}

/**
 * UGT `inv_era_one_way`, GENERALISED to every one-way ratchet the sweep can see.
 *
 * The UGT predicate watches `eraVeteran` never flipping 1 → 0. The sweep does not
 * carry an era flag on the day record, but it carries two progress ratchets that
 * are one-way for the same structural reason and would fail the same way if the
 * reason stopped holding:
 *
 *   - `deedCount` — the registry only ever gains entries, and `legacy.ts` names
 *     the deed registry first among the things succession CARRIES ("untouched on
 *     state: the deed registry (deeds, renownRank, …)"). A drop here means an
 *     heir lost their predecessor's record.
 *   - `renownRank` — a step function of the deed stock, read through the ENGINE's
 *     own `renownRankIndex` against `RENOWN_RANK_ORDER`. The ladder's order is
 *     deliberately NOT restated here; `content/src/deeds.ts` owns it and appended
 *     a tenth rung once already (T-1308).
 *
 * The report-level `deedCount` is cross-checked against the last day's, which is
 * what makes a fold that drifted from its own series visible.
 */
export function assertProgressRatchetsNeverReverse(report: CampaignStatsReport): SweepViolation[] {
  const name = 'assertProgressRatchetsNeverReverse';
  const violations: SweepViolation[] = [];
  let previous: CampaignDayStats | null = null;
  for (const day of report.daily) {
    if (previous !== null) {
      if (day.deedCount < previous.deedCount) {
        violations.push(
          violation(name, report, day.day, `deedCount ${previous.deedCount} → ${day.deedCount}`),
        );
      }
      if (renownRankIndex(day.renownRank) < renownRankIndex(previous.renownRank)) {
        violations.push(
          violation(name, report, day.day, `renownRank ${previous.renownRank} → ${day.renownRank}`),
        );
      }
    }
    previous = day;
  }
  if (previous !== null && report.deedCount !== previous.deedCount) {
    violations.push(
      violation(
        name,
        report,
        previous.day,
        `report.deedCount ${report.deedCount} disagrees with the last daily ${previous.deedCount}`,
      ),
    );
  }
  return violations;
}

/**
 * The sweep-native successor to UGT `inv_blocked_from_legal_non_increasing`: the
 * T-201/T-1605b POVERTY-TRAP invariant — a competent policy is never stranded for
 * {@link INCOME_STALL_LIMIT} consecutive days with no income-producing action.
 *
 * The UGT predicate is a statement about the protocol's legal-action seam, which
 * the sweep does not touch (see {@link SWEEP_INVARIANT_DISPOSITIONS}). This is the
 * nearest sweep-side check and it is listed there as RELATED, not as coverage:
 * "the enumerator never advertises an illegal verb" and "the world always offers a
 * competent captain something to do" are different claims.
 *
 * SCOPED per `docs/BALANCE-POLICY.md` E4 — see {@link GATE_COMPETENT_POLICIES} for
 * the membership and for why `greedy` (a `DEFAULT_POLICIES` member) is out.
 */
export function assertNoIncomeStall(report: CampaignStatsReport): SweepViolation[] {
  const name = 'assertNoIncomeStall';
  if (!GATE_COMPETENT_POLICIES.includes(report.policy)) return [];
  const streak = longestZeroIncomeStreak(report.daily);
  if (streak < INCOME_STALL_LIMIT) return [];
  return [
    violation(
      name,
      report,
      null,
      `${streak} consecutive zero-income days (limit ${INCOME_STALL_LIMIT})`,
    ),
  ];
}

/**
 * SWEEP-NATIVE · every `CombatEncounterRecord` is well formed.
 *
 * The instrument's own integrity check. `aggregate.ts` divides by these fields
 * and buckets on them (`tierParityBucket` reads both tiers, `combatCost` sums
 * five credit lines), so a malformed record does not fail — it produces a
 * plausible wrong number in a memo table. Costs are asserted NON-NEGATIVE
 * individually rather than as a sum, because two sign errors that cancel would
 * pass a sum check and still corrupt every per-line figure the memo reports.
 *
 * The `shipLost` clause is a cross-fold consistency check: `survival.shipsLost`
 * counts `ShipLost` events on the day fold and `shipLost` is set on the encounter
 * fold, so a record claiming the ship was lost inside a run whose survival block
 * counted no loss means the two folds disagree.
 */
export function assertCombatRecordsWellFormed(report: CampaignStatsReport): SweepViolation[] {
  const name = 'assertCombatRecordsWellFormed';
  const violations: SweepViolation[] = [];
  const costLines: (keyof CombatEncounterRecord)[] = [
    'tributeCredits',
    'salvageCredits',
    'fineCredits',
    'successionCredits',
    'fuelCredits',
    'repairCredits',
    'fuelUnits',
  ];
  for (const record of report.combatEncounters) {
    if (record.rounds < 0) {
      violations.push(violation(name, report, record.day, `rounds ${record.rounds}`));
    }
    for (const tier of ['interceptorTier', 'playerTier'] as const) {
      const value = record[tier];
      if (value < MIN_POWER_TIER || value > MAX_POWER_TIER) {
        violations.push(violation(name, report, record.day, `${tier} ${value}`));
      }
    }
    for (const line of costLines) {
      const value = record[line];
      if (typeof value === 'number' && value < 0) {
        violations.push(violation(name, report, record.day, `${String(line)} ${value}`));
      }
    }
    if (record.shipLost && report.survival.shipsLost === 0) {
      violations.push(
        violation(
          name,
          report,
          record.day,
          `encounter ${record.encounterId} reports shipLost but survival.shipsLost is 0`,
        ),
      );
    }
  }
  return violations;
}

/**
 * SWEEP-NATIVE · every `RouteLegRecord` is well formed.
 *
 * THE DEFECT CLASS THIS EXISTS FOR: `routeEv` answers `null` for any leg missing
 * `paidPayment` or `deliveredDay`, and `aggregate.ts` then filters those nulls
 * out. That is correct behaviour for an UNDELIVERED leg and it is a silent
 * swallow for a DELIVERED one — a delivered leg with a null payment would vanish
 * from `routeEvPerDay` while still counting in `routesDelivered`, quietly shifting
 * the memo's route EV without moving its denominator.
 *
 * So the two directions are asserted explicitly: delivered ⇒ both fields present
 * and the delivery is not before the signing; not delivered ⇒ no payment.
 */
export function assertRouteRecordsWellFormed(report: CampaignStatsReport): SweepViolation[] {
  const name = 'assertRouteRecordsWellFormed';
  const violations: SweepViolation[] = [];
  for (const leg of report.routeLegs) {
    if (leg.outcome === 'delivered') {
      if (leg.paidPayment === null || leg.deliveredDay === null) {
        violations.push(
          violation(
            name,
            report,
            leg.signedDay,
            `delivered leg ${describeLeg(leg)} has paidPayment ${String(leg.paidPayment)} / ` +
              `deliveredDay ${String(leg.deliveredDay)}`,
          ),
        );
      } else if (leg.deliveredDay < leg.signedDay) {
        violations.push(
          violation(
            name,
            report,
            leg.signedDay,
            `leg ${describeLeg(leg)} delivered on day ${leg.deliveredDay}, signed on ${leg.signedDay}`,
          ),
        );
      }
    } else if (leg.paidPayment !== null) {
      violations.push(
        violation(
          name,
          report,
          leg.signedDay,
          `undelivered (${leg.outcome}) leg ${describeLeg(leg)} carries paidPayment ${leg.paidPayment}`,
        ),
      );
    }
  }
  return violations;
}

function describeLeg(leg: RouteLegRecord): string {
  return `${leg.originSystem}->${leg.destination}`;
}

/**
 * SWEEP-NATIVE (N10) · the dawn board's depth stays inside the job pool's bounds.
 *
 * `jobPoolDepth` clamps to `[JOB_POOL_MIN_BOARD, JOB_POOL_BOARD_SIZE]` and
 * `boardDepth` is sampled from the generated board, so a depth above the pool
 * ceiling means the board and the pool disagree — which is the exact failure the
 * N10 competition mechanic would produce if a claim stopped being subtracted.
 *
 * The FLOOR asserted is 0, not `JOB_POOL_MIN_BOARD`: a system with no contract
 * content at all is a content question, not a pool defect, and asserting the
 * min-board floor here would make the gate fail for a map edit. The ceiling is
 * imported from the engine, never spelled.
 */
export function assertBoardDepthWithinPoolBounds(report: CampaignStatsReport): SweepViolation[] {
  const name = 'assertBoardDepthWithinPoolBounds';
  const violations: SweepViolation[] = [];
  for (const day of report.daily) {
    if (day.boardDepth < 0 || day.boardDepth > JOB_POOL_BOARD_SIZE) {
      violations.push(
        violation(
          name,
          report,
          day.day,
          `boardDepth ${day.boardDepth} outside [0, ${JOB_POOL_BOARD_SIZE}]`,
        ),
      );
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// The three UGT predicates the sweep cannot observe — declared, never faked
// ---------------------------------------------------------------------------

export interface SweepInvariantDisposition {
  /** The exact predicate name from `docs/playtests/T-1604a-ugt-campaign.md` §4. */
  ugtPredicate: string;
  disposition: 'mapped' | 'analogue' | 'not-observable';
  /** The `assert*` function above that covers it, or null. */
  coveredBy: string | null;
  /** For a `not-observable` entry this MUST name the task that owns it. */
  why: string;
}

/**
 * THE FULL EIGHT, each exactly once, with an honest disposition.
 *
 * This table is the answer to "a named assertion function per invariant" for the
 * three predicates that have no sweep observable. The alternative — a function
 * that asserts nothing and reads green — is the "green but hollow" failure mode
 * `docs/TESTING-STRATEGY.md` Part A opens with, and it is exactly the discipline
 * T-1604a applied to its own P1–P11 pre-flight: *"Recorded as N/A rather than
 * passed."*
 *
 * Every `not-observable` entry names an OWNING TASK. A disposition without an
 * owner is an omission with better manners.
 */
export const SWEEP_INVARIANT_DISPOSITIONS: readonly SweepInvariantDisposition[] = [
  {
    ugtPredicate: 'inv_no_negative_resources',
    disposition: 'mapped',
    coveredBy: 'assertNoNegativeResources',
    why: 'Credits/debt/fuel are on every `CampaignDayStats` and on `finalState`.',
  },
  {
    ugtPredicate: 'inv_fuel_within_tank',
    disposition: 'mapped',
    coveredBy: 'assertFuelWithinTank',
    why:
      'Exact on milestone samples (which carry `maxFuel`); the absolute hull ceiling on every ' +
      'day sample. The weakening is stated at the function.',
  },
  {
    ugtPredicate: 'inv_day_monotonic',
    disposition: 'mapped',
    coveredBy: 'assertDayMonotonic',
    why: '`daily[]` is the calendar, one entry per played day.',
  },
  {
    ugtPredicate: 'inv_phaseday_binary',
    disposition: 'analogue',
    coveredBy: 'assertOneSamplePerDay',
    why:
      'The sweep has no protocol phase field — `runCampaign` inlines start→act→dusk and folds ' +
      'one record per day. "Exactly one sample per day" is the structural equivalent, and the ' +
      'name is listed as an analogue so it is never read as checking `phaseDay`.',
  },
  {
    ugtPredicate: 'inv_era_one_way',
    disposition: 'analogue',
    coveredBy: 'assertProgressRatchetsNeverReverse',
    why:
      'No era flag is on the day record, but the deed count and the renown rank are one-way for ' +
      'the same structural reason (`legacy.ts` carries the registry through succession) and are ' +
      'asserted in its place.',
  },
  {
    ugtPredicate: 'inv_blocked_from_legal_non_increasing',
    disposition: 'not-observable',
    coveredBy: null,
    why:
      'OWNED BY T-154/T-155 (the native Tier-2 pilot). The sim policies form actions directly, ' +
      'never off the `legal-actions` enumerator, so there is no "blocked from a legal pick" ' +
      'event for a sweep to count. `assertNoIncomeStall` is the nearest sweep-side check and is ' +
      'RELATED, not coverage: "the enumerator never advertises an illegal verb" and "the world ' +
      'always offers a competent captain something to do" are different claims.',
  },
  {
    ugtPredicate: 'inv_protocol_errors_non_increasing',
    disposition: 'not-observable',
    coveredBy: null,
    why:
      'OWNED BY T-154/T-155. The sweep never calls `handleMessage`; a campaign run produces no ' +
      'protocol responses at all, so the counter has no denominator here.',
  },
  {
    ugtPredicate: 'inv_dice_bounds',
    disposition: 'not-observable',
    coveredBy: null,
    why:
      'OWNED BY T-154/T-155. `diceLeft` is carried on neither `CampaignDayStats` nor ' +
      '`CampaignStatsReport`, and adding an engine/report field for it is engine scope this ' +
      'task does not hold. Recorded rather than approximated.',
  },
];

// ---------------------------------------------------------------------------
// The expected-event-rate table — the statistical-anomaly check
// ---------------------------------------------------------------------------

/**
 * ONE probability the sweep can watch, with the band outside which it is an
 * ANOMALY rather than a tuning result.
 *
 * READ THIS BEFORE TOUCHING A NUMBER BELOW. These are ANOMALY DETECTORS, NOT
 * BALANCE TARGETS. Balance targets live in
 * `packages/sim/src/__tests__/balance-targets.test.ts` and `docs/BALANCE-POLICY.md`,
 * they are narrow on purpose, and one of them is deliberately red today. Every
 * band here is deliberately far WIDER than the measured spread, because its job is
 * to catch a probability that DIED or SATURATED — the Part D example is "an
 * expected ~30% event rate reading 0% across a full shard" — not to grade tuning.
 *
 *   * Never NARROW a band to make it "more useful": that converts an anomaly
 *     detector into a second, unowned balance target, and the sweep would then
 *     fail for a legitimate tuning pass.
 *   * Never WIDEN a band, and never raise a `minSample`, to make a run pass. If a
 *     legitimate change moves a rate outside its band, that is a FINDING: it owes
 *     a recorded ruling and a re-measured band citing the new committed baseline,
 *     exactly as `./rules-fingerprint.ts` refuses a re-stamped fixture. The
 *     remedy for a noisy small sweep is a bigger sample, which is what
 *     `minSample` already enforces.
 *
 * RATES ARE PER SIM-DAY OR SHARES, NEVER PER RUN. The committed arms are 35-day
 * and 120-day; any per-run figure differs ~3x between them, so a per-run band
 * would be horizon-dependent and would fail on arm choice alone.
 */
export interface ExpectedEventRate {
  /** Grep-able, kebab-case. Printed in the gate table and keyed in the JSON. */
  id: string;
  /** One line: what the rate is. */
  what: string;
  /** Where the probability lives, or the committed baselines the band was read
   *  off. A band with no provenance is a guess with a decimal point. */
  source: string;
  /** DENOMINATOR floor. Below it the check reports SKIPPED and never fails — a
   *  3-seed developer sweep must not be able to fail on sampling noise. */
  minSample: number;
  /** Floor, or null when a zero is legitimate (and `why` must say why). */
  min: number | null;
  /** Ceiling, or null when there is no meaningful upper bound. */
  max: number | null;
  measure: (rows: readonly SeedRow[]) => { numerator: number; denominator: number };
}

function sumBy<T>(items: readonly T[], read: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += read(item);
  return total;
}

const PER_1K_DAYS = 1000;

export const EXPECTED_EVENT_RATES: readonly ExpectedEventRate[] = [
  {
    id: 'travel-encounter-rate-per-1k-sim-days',
    what: 'Combat encounters opened per 1,000 simulated days.',
    source:
      'ROUTE_DANGER_CHANCE (content/src/combat.ts) via `routeDangerFor`, damped by ' +
      'TOUR_ONE_ENCOUNTER_MULTIPLIER (0.5) during Tour One. Measured fleet-wide at 148.3 / 149.5 ' +
      '(baseline-tour-one.json, baseline-tour-one-t1605.json, 35d) and 213.4 / 197.4 / 197.5 ' +
      '(baseline-vet-t1605.json, baseline-t148-roster-ladder.json, baseline-t150-postfix.json, 120d).',
    minSample: 2000,
    min: 40,
    max: 600,
    measure: (rows) => ({
      numerator: sumBy(rows, (row) => row.combat.length) * PER_1K_DAYS,
      denominator: sumBy(rows, (row) => row.days),
    }),
  },
  {
    id: 'route-leg-signing-rate-per-1k-sim-days',
    what: 'Contract legs signed per 1,000 simulated days.',
    source:
      'The manifest board (`rollContract`) against the policies that sign off it. Measured ' +
      'fleet-wide at 479.4 / 579.4 (35d) and 490.7 / 487.4 / 486.9 (120d) across the five ' +
      'committed baselines above.',
    minSample: 2000,
    min: 120,
    max: 1400,
    measure: (rows) => ({
      numerator: sumBy(rows, (row) => row.routes.length) * PER_1K_DAYS,
      denominator: sumBy(rows, (row) => row.days),
    }),
  },
  {
    id: 'route-delivery-share',
    what: 'Share of signed legs that were delivered.',
    source:
      'Measured fleet-wide at 0.963 / 0.978 (35d) and 0.988 (120d, all three committed veteran ' +
      'aggregates). The ceiling is 1.0 because a share above it is arithmetically impossible and ' +
      'therefore a fold defect.',
    minSample: 200,
    min: 0.7,
    max: 1,
    measure: (rows) => {
      const legs = rows.flatMap((row) => row.routes);
      return {
        numerator: legs.filter((leg) => leg.outcome === 'delivered').length,
        denominator: legs.length,
      };
    },
  },
  {
    id: 'combat-win-share',
    what: 'Share of encounters the player won on the field (`isCombatWin`).',
    source:
      'Re-uses `aggregate.ts` `isCombatWin` rather than re-deriving the resolution set. Measured ' +
      'fleet-wide over `fleet.combatCells` (Σ n × winRate) at 0.128 / 0.147 (35d) and 0.203 / ' +
      '0.114 / 0.114 (120d). A 0.00 would mean combat resolution stopped producing wins; a 1.00 ' +
      'would mean it stopped producing anything else.',
    minSample: 200,
    min: 0.02,
    max: 0.999,
    measure: (rows) => {
      const combat = rows.flatMap((row) => row.combat);
      return { numerator: combat.filter(isCombatWin).length, denominator: combat.length };
    },
  },
  {
    id: 'ship-loss-share-of-encounters',
    what: 'Ships lost per encounter opened — the lethality of the combat model.',
    source:
      'NO FLOOR, and the proof is committed: `baseline-tour-one.json` records ' +
      '`fleet.survival.deathsPer1000Days` of exactly 0.000 across 3,500 runs at a 35-day ' +
      'horizon, so a zero here is a legitimate reading of a short arm and must never fail the ' +
      'gate. The ceiling is the anomaly that matters — measured at 0.0000 (35d) and ' +
      '0.0026-0.0033 (120d), so 0.10 is ~30x the observed veteran figure.',
    minSample: 200,
    min: null,
    max: 0.1,
    measure: (rows) => ({
      numerator: sumBy(rows, (row) => row.shipsLost),
      denominator: sumBy(rows, (row) => row.combat.length),
    }),
  },
  {
    id: 'tour-one-clear-share',
    what: 'Share of runs that resolved Tour One as `cleared`.',
    source:
      'Measured fleet-wide at 0.327 / 0.432 (35d) and 0.436 / 0.571 / 0.569 (120d). The fleet ' +
      'denominator includes the `greedy` control, which clears at 0.00, so the fleet figure sits ' +
      'well below any single competent policy by construction. `minSample` is in RESOLVED runs, ' +
      'so a sweep whose horizon never reaches day 30 reports SKIPPED rather than a false 0.',
    minSample: 100,
    min: 0.05,
    max: 0.98,
    measure: (rows) => {
      const resolved = rows.filter((row) => row.tourOneOutcome !== null);
      return {
        numerator: resolved.filter((row) => row.tourOneOutcome === 'cleared').length,
        denominator: resolved.length,
      };
    },
  },
  {
    id: 'runs-earning-any-deed-share',
    what: 'Share of runs that earned at least one deed.',
    source:
      'The deed registry is the progression spine (T-020). `fleet.deedCount.min` is 1 in ' +
      'baseline-tour-one.json and 4 in every later committed aggregate — i.e. EVERY run in every ' +
      'committed sweep earned at least one deed, so the measured share is 1.00 throughout. The ' +
      'floor is set at 0.50 anyway: this detects deeds becoming unreachable, not a tuning shift.',
    minSample: 100,
    min: 0.5,
    max: 1,
    measure: (rows) => ({
      numerator: rows.filter((row) => row.deedCount > 0).length,
      denominator: rows.length,
    }),
  },
  {
    id: 'board-depth-mean',
    what: 'Mean dawn-board depth, pooled over every day of every run (N10).',
    source:
      'Measured at mean 3.78 (min 1, max 4) over 960,000 day samples in ' +
      'baseline-t148-roster-ladder.json and baseline-t150-postfix.json. The ceiling is the ' +
      "engine's own JOB_POOL_BOARD_SIZE, imported not spelled; the floor of 1.5 sits between the " +
      'pool floor (JOB_POOL_MIN_BOARD = 1) and the measured mean, so it fires only if boards ' +
      'collapse toward permanently drained — the N10 Disproves limb, "boards empty".',
    minSample: 2000,
    min: 1.5,
    max: JOB_POOL_BOARD_SIZE,
    measure: (rows) => {
      const depths = rows.flatMap((row) => row.boardDepths);
      return { numerator: sumBy(depths, (depth) => depth), denominator: depths.length };
    },
  },
];

export interface ExpectedEventRateResult {
  id: string;
  status: 'pass' | 'fail' | 'skipped';
  numerator: number;
  denominator: number;
  /** `numerator / denominator`, or 0 when the denominator is empty — never NaN,
   *  for the reason `aggregate.ts` `share` states: a NaN in a report is
   *  indistinguishable from a real zero once it is prose. */
  rate: number;
  min: number | null;
  max: number | null;
  minSample: number;
  detail: string;
}

/**
 * Evaluate every rate in {@link EXPECTED_EVENT_RATES} over a row set.
 *
 * A SKIP IS REPORTED, NEVER SILENTLY PASSED. `status` is a three-value field and
 * `formatGateReport` prints it on its own line, because a check that could not
 * run and a check that ran and passed answer different questions — and a rig that
 * conflated them is precisely how a gate becomes green and hollow.
 */
export function checkExpectedEventRates(rows: readonly SeedRow[]): ExpectedEventRateResult[] {
  return EXPECTED_EVENT_RATES.map((expected) => {
    const { numerator, denominator } = expected.measure(rows);
    const rate = denominator === 0 ? 0 : numerator / denominator;
    const base = {
      id: expected.id,
      numerator,
      denominator,
      rate,
      min: expected.min,
      max: expected.max,
      minSample: expected.minSample,
    };
    if (denominator < expected.minSample) {
      return {
        ...base,
        status: 'skipped' as const,
        detail: `sample ${denominator} < minSample ${expected.minSample}`,
      };
    }
    const belowFloor = expected.min !== null && rate < expected.min;
    const aboveCeiling = expected.max !== null && rate > expected.max;
    if (belowFloor || aboveCeiling) {
      return {
        ...base,
        status: 'fail' as const,
        detail: `${rate.toFixed(4)} outside [${expected.min ?? '-inf'}, ${expected.max ?? '+inf'}]`,
      };
    }
    return {
      ...base,
      status: 'pass' as const,
      detail: `${rate.toFixed(4)} in [${expected.min ?? '-inf'}, ${expected.max ?? '+inf'}]`,
    };
  });
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/** One `(invariant, policy)` bucket. The dedup key is T-1604a's `ExploitHunter`
 *  shape — it dedups by `(kind, name, action_name, message[:80])` so that "44 raw
 *  finding rows" reads as the one underlying defect it is. */
export interface ViolationSummaryRow {
  invariant: string;
  policy: string;
  count: number;
  /** At most {@link VIOLATION_EXAMPLE_LIMIT}. `count` is ALWAYS the true total. */
  examples: SweepViolation[];
}

/** How many concrete examples a summary row carries. Enough to see a pattern,
 *  few enough that a systemic failure does not print a megabyte. */
export const VIOLATION_EXAMPLE_LIMIT = 5;

export function summarizeViolations(violations: readonly SweepViolation[]): ViolationSummaryRow[] {
  const byKey = new Map<string, ViolationSummaryRow>();
  for (const found of violations) {
    const key = `${found.invariant}::${found.policy}`;
    const row = byKey.get(key);
    if (row === undefined) {
      byKey.set(key, {
        invariant: found.invariant,
        policy: found.policy,
        count: 1,
        examples: [found],
      });
    } else {
      row.count += 1;
      if (row.examples.length < VIOLATION_EXAMPLE_LIMIT) row.examples.push(found);
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.invariant.localeCompare(b.invariant) ||
      a.policy.localeCompare(b.policy),
  );
}

export interface GateReport {
  label: string;
  /** `shard 1/4` or `merged` — which sample this verdict is about. */
  scope: string;
  rows: number;
  passed: boolean;
  violationCount: number;
  violations: ViolationSummaryRow[];
  rates: ExpectedEventRateResult[];
  /** T-157 · one row per policy the sample actually contained. */
  coverage: ArchetypeCoverageResult[];
}

/**
 * `coverage` is the OPTIONAL sixth parameter, defaulting to the empty set, and the
 * default is not laziness: every existing caller in `sweep-gate.test.ts` builds a
 * report about a hand-seeded fixture whose policy set is not the sweep's fleet, and
 * an empty coverage table is the honest answer for "no policies were graded here".
 * `./sweep.ts` — the one caller that knows which policies actually ran — always
 * passes it.
 */
export function buildGateReport(
  label: string,
  scope: string,
  rowCount: number,
  violations: readonly SweepViolation[],
  rates: readonly ExpectedEventRateResult[],
  coverage: readonly ArchetypeCoverageResult[] = [],
): GateReport {
  return {
    label,
    scope,
    rows: rowCount,
    passed:
      violations.length === 0 &&
      !rates.some((rate) => rate.status === 'fail') &&
      coverageFailures(coverage).length === 0,
    violationCount: violations.length,
    violations: summarizeViolations(violations),
    rates: [...rates],
    coverage: [...coverage],
  };
}

/** The human-readable table. Pure string building — `./sweep.ts` decides where it
 *  goes (stderr, so stdout stays pipeable per that file's header contract). */
export function formatGateReport(report: GateReport): string {
  const lines: string[] = [
    `[gate] ${report.label} · ${report.scope} · ${report.rows} rows · ` +
      `${report.passed ? 'PASS' : 'FAIL'}`,
  ];
  if (report.violationCount === 0) {
    lines.push('[gate] invariants: 0 violations');
  } else {
    lines.push(`[gate] invariants: ${report.violationCount} violations`);
    for (const row of report.violations) {
      lines.push(`[gate]   ${row.invariant} · ${row.policy} · ${row.count}`);
      for (const example of row.examples) {
        lines.push(
          `[gate]     seed ${example.seed}` +
            `${example.day === null ? '' : ` day ${example.day}`} · ${example.detail}`,
        );
      }
      if (row.count > row.examples.length) {
        lines.push(`[gate]     ... ${row.count - row.examples.length} more`);
      }
    }
  }
  for (const rate of report.rates) {
    lines.push(`[gate] rate ${rate.id}: ${rate.status.toUpperCase()} — ${rate.detail}`);
  }
  lines.push(...formatCoverageLines(report.coverage));
  return lines.join('\n');
}
