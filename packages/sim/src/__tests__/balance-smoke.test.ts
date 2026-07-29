import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  assertFixtureFresh,
  fixtureFreshness,
  type FixtureTier,
  type SmokeFixture,
} from '../balance/checkpoints.js';
import { REPO_ROOT } from '../balance/rules-fingerprint.js';
import {
  foldTierOutcome,
  runTierReports,
  tierInvariantViolations,
  type TierOutcome,
} from '../balance/smoke.js';
import type { CampaignStatsReport, SimPolicyName } from '../index.js';

// ---------------------------------------------------------------------------
// N7 · THE STAGED SMOKE SUITE — "did something obviously break?", in seconds.
//
// `docs/balance/smoke/README.md` is the contract. The loop it serves:
//
//   full capstone sweep (1,000 seeds x 120 days, measured 1m46s across 8 shards)
//           |
//           +--> diff against the previous capstone   -> npm run balance:diff
//           +--> extract checkpoint markers            -> npm run balance:extract
//                        |
//                 THIS FILE, on every change
//
// WHAT THIS SUITE IS NOT. It does not grade balance and it cannot. Three of its
// four tiers start from SYNTHESIZED states (`balance/synthesize.ts`) that were
// never played into, and `balance/aggregate.ts` refuses outright to fold their
// rows into a `BaselineAggregate`. The capstone remains the only authority on
// numbers. What this suite answers is narrower and cheaper: is the game still
// standing, and does it still produce exactly what it produced last time?
//
// WHAT IT WOULD MISS, stated because a breakage detector that oversells its
// coverage is the failure mode here:
//   - Anything a three-day window cannot reach. Renown progression, the deed
//     ladder past its early rungs, route diversity, long-horizon debt dynamics.
//   - Anything a synthesized captain does not carry: a synthesized player has an
//     EMPTY deed registry and LIEUTENANT rank on day 41, so rank-gated content
//     and rank-driven tier are untested in the mid-game tiers.
//   - Any regression that moves a number without breaking an invariant, ON A
//     TREE WHERE THE RULES ALSO CHANGED. There the fingerprint fires first and
//     the recorded outcomes are re-measured by the re-extract — by design, since
//     they described the previous ruleset, but it does mean the recorded half of
//     this suite catches drift only while the rules hold still. The INVARIANTS
//     below are the half that survives a re-extract, which is why they exist.
// ---------------------------------------------------------------------------

const FIXTURE_PATH = join(REPO_ROOT, 'docs', 'balance', 'smoke', 'tiers.json');
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as SmokeFixture;

describe('N7 · the fixture describes the ruleset in the working tree', () => {
  it('is not stale', () => {
    // THE load-bearing assertion of the whole rig. A fixture measured against a
    // different ruleset would report green about a game that no longer exists.
    // The remedy is never to edit a fingerprint (docs/VERSIONING.md, "The rule
    // that matters most") — the failure message spells out the capstone loop.
    const problems = fixtureFreshness(fixture);
    expect(problems.map((problem) => problem.message).join('\n\n')).toBe('');
  });

  it('carries every field the folder contract requires', () => {
    // docs/balance/smoke/README.md's table. A fixture missing one of these
    // records numbers without recording the world they were measured in.
    expect(typeof fixture.productVersion).toBe('string');
    expect(typeof fixture.saveSchemaVersion).toBe('number');
    expect(fixture.rulesFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(fixture.instrumentFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(fixture.provenance.sweepLabel.length).toBeGreaterThan(0);
    expect(fixture.provenance.seeds).toBeGreaterThan(0);
    expect(fixture.provenance.days).toBeGreaterThan(0);
    expect(fixture.provenance.extractedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fixture.provenance.gitCommit.length).toBeGreaterThan(0);
    expect(['harvested', 'estimated']).toContain(fixture.provenance.spreadSource);
    expect(fixture.checkpoints.length).toBeGreaterThan(0);
  });

  it('seeds every rung of every tier spread', () => {
    // A ladder rung with no seed on it is a captain the tier claims to exercise
    // and does not — and the rung most easily dropped is `max`, the only one
    // carrying a tier-5 fit.
    for (const tier of fixture.checkpoints) {
      if (tier.spread === null) continue;
      expect(tier.seeds.length, `${tier.id} seeds vs spread slots`).toBeGreaterThanOrEqual(
        tier.spread.player.length,
      );
    }
  });
});

/** Ordered as the fixture records them, so a failure names the same tier the
 *  extractor did. */
const tiers: FixtureTier[] = fixture.checkpoints;

describe.each(tiers.map((tier) => [tier.id, tier] as const))('N7 · tier %s', (_id, tier) => {
  // Every assertion below is meaningless against a stale fixture, so the whole
  // block refuses to run rather than report on the wrong ruleset. Loud, never
  // silent, and never auto-refreshed.
  beforeAll(() => {
    assertFixtureFresh(fixture);
  });

  const reportsByPolicy = new Map<string, CampaignStatsReport[]>();
  const run = (policy: SimPolicyName): CampaignStatsReport[] => {
    const cached = reportsByPolicy.get(policy);
    if (cached) return cached;
    const reports = runTierReports(tier, policy, tier.spread);
    reportsByPolicy.set(policy, reports);
    return reports;
  };

  it.each(tier.policies)('%s — holds the structural invariants', (policy) => {
    // The half a re-extract cannot make vacuous: these could never be true of a
    // working game, whatever the numbers happen to be.
    expect(tierInvariantViolations(tier, policy, run(policy))).toEqual([]);
  });

  it('is not measuring a stalled field', () => {
    // A tier whose captains never earn and never deliver would pass every
    // recorded-outcome check forever while testing nothing — the way a golden
    // suite dies quietly. Checked over the tier as a whole rather than per
    // policy, because `greedy` is the naive control and is SUPPOSED to sit still.
    const outcomes = tier.policies.map((policy) => foldTierOutcome(tier, policy, run(policy)));
    const total = (pick: (outcome: TierOutcome) => number): number =>
      outcomes.reduce((sum, outcome) => sum + pick(outcome), 0);
    expect(total((outcome) => outcome.incomeDays)).toBeGreaterThan(0);
    expect(total((outcome) => outcome.deliveredLegs)).toBeGreaterThan(0);
    expect(total((outcome) => outcome.deedsEarned)).toBeGreaterThan(0);
  });

  it.each(tier.policies)('%s — matches the recorded checkpoint', (policy) => {
    const expected = tier.expected.find((entry) => entry.policy === policy);
    expect(expected, `${tier.id} has no recorded outcome for ${policy}`).toBeDefined();
    const actual: TierOutcome = foldTierOutcome(tier, policy, run(policy));
    // Compared whole rather than field by field: the summary fields make a
    // failure readable, `outcomeHash` makes it unmissable, and a partial
    // comparison would let a field drift in silence.
    expect(actual).toEqual(expected);
  });
});
