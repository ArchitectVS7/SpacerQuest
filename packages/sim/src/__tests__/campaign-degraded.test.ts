import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  degradedTraderPolicy,
  resolvePolicy,
  runCampaign,
  traderPolicy,
  type SimPolicyName,
} from '../index.js';

// ---------------------------------------------------------------------------
// R1 (docs/BALANCE-REDESIGN-WORKLIST.md) · THE HUMAN-PLAUSIBLE PILOT.
//
// `trader-degraded` exists to answer one gating question: is the trader's
// perfect survival record a property of the ENGINE (escape is near-free) or an
// artifact of a sim policy that plays optimally? It is a MEASUREMENT INSTRUMENT,
// so this spec pins the two things a measurement instrument must be:
//
//   1. NON-INVASIVE — adding it changed no shipped policy. The trader and its six
//      fleetmates must still produce byte-identical reports, or the R1 sweep is
//      comparing against a baseline that no longer exists. This is the load-
//      bearing assertion in the file.
//   2. ACTUALLY DEGRADED — it must differ from the trader (else it measures the
//      trader again under another name) while still being a CAPTAIN rather than a
//      random-action generator (else it measures nothing a player would do).
//
// It is deliberately absent from `campaign-policies.test.ts`'s COMPETENT_POLICIES:
// the T-1605b anti-poverty-trap invariant is a promise about what the world offers
// a captain who plays WELL (errata E4), and a policy that flies thin-tanked on
// purpose is not making that claim.
// ---------------------------------------------------------------------------

/** The fleet whose reports must not move. `trader` first because it is the row
 *  R1 compares the degraded pilot against. */
const UNCHANGED_POLICIES = [
  'trader',
  'fighter',
  'explorer',
  'veteran',
  'smuggler',
  'gambler',
  'greedy',
] as const satisfies readonly SimPolicyName[];

/**
 * Report fingerprints for seeds 1..5 × 40 days, MEASURED on the commit before
 * `trader-degraded` was added (`755ff2a0`, "T-1605: an ordinary jump always
 * arrives") and pinned here verbatim.
 *
 * WHY A HASH AND NOT A PROPERTY. The R1 refactor threads a `degradation` argument
 * through the trader's whole day plan and adds an optional slip to the shared
 * `dieLedger` every competent policy builds. Any of those touch points could
 * shift a die index, an rng draw order, or an action ordering in a way no
 * hand-written assertion would notice — and the resulting sweep would look
 * entirely plausible while being incomparable to `baseline-vet-t1605.json`. A
 * whole-report hash is the only assertion that cannot be accidentally satisfied.
 *
 * IF THIS FAILS: a change altered shipped-policy behavior. That is not necessarily
 * wrong — but it invalidates the pinned balance baseline, so re-pin the sweep
 * DELIBERATELY (BALANCE-POLICY.md), never by editing a number here to match.
 */
const PINNED_FINGERPRINTS: Record<(typeof UNCHANGED_POLICIES)[number], string> = {
  trader: '86c444b8ec619187',
  fighter: '97180262cbc60805',
  explorer: 'daf1070d7cead726',
  veteran: '437f73e973337248',
  smuggler: '14d763cf29110467',
  gambler: '4cd7cdfe4cec356e',
  greedy: 'd0dbf1836f6246e9',
};

const FINGERPRINT_SEEDS = [1, 2, 3, 4, 5] as const;
const FINGERPRINT_DAYS = 40;

function fingerprint(policy: SimPolicyName): string {
  const hash = createHash('sha256');
  for (const seed of FINGERPRINT_SEEDS) {
    hash.update(JSON.stringify(runCampaign(seed, FINGERPRINT_DAYS, policy)));
  }
  return hash.digest('hex').slice(0, 16);
}

describe('R1 · trader-degraded is non-invasive', () => {
  it.each(UNCHANGED_POLICIES)(
    'leaves the %s policy byte-identical to the pinned pre-R1 baseline',
    (policy) => {
      expect(fingerprint(policy)).toBe(PINNED_FINGERPRINTS[policy]);
    },
  );
});

describe('R1 · trader-degraded is a degraded captain', () => {
  it('resolves to the degraded policy, not to the random fallthrough', () => {
    // `resolvePolicy` answers an unrecognised name with `randomLegalActionPolicy`
    // (see the note at the smuggler/gambler branches), which would report
    // plausible-looking numbers for an entirely different pilot.
    const resolved = resolvePolicy('trader-degraded');
    expect(resolved.name).toBe('trader-degraded');
    expect(resolved.policy).toBe(degradedTraderPolicy);
    expect(resolved.policy).not.toBe(traderPolicy);
    // Reads the live board and dawn hand, exactly as the trader it degrades does.
    expect(resolved.dawnBlind).toBe(false);
  });

  it('is deterministic for a seed', () => {
    // The slips draw from the per-day policy rng fork, never Math.random — a
    // degraded career has to replay byte-for-byte or the sweep is not evidence.
    const first = runCampaign(3, 60, 'trader-degraded');
    const second = runCampaign(3, 60, 'trader-degraded');
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('actually diverges from the trader it degrades', () => {
    // Measured on seeds 1..5 × 60 days: every seed produces a different career.
    for (const seed of [1, 2, 3, 4, 5]) {
      const clean = runCampaign(seed, 60, 'trader');
      const sloppy = runCampaign(seed, 60, 'trader-degraded');
      expect(JSON.stringify(sloppy)).not.toBe(JSON.stringify(clean));
    }
  });

  it('still flies a career rather than stalling into a poverty trap', () => {
    // NOT the T-1605b invariant (that is scoped to the competent policies) — this
    // is the weaker claim R1 actually needs: the instrument must keep meeting
    // interceptors, or a null result would only mean "it never left port". A pilot
    // that idled would report zero deaths for the wrong reason entirely.
    //
    // Measured over seeds 1..10 × 60 days: 140 encounters, worst zero-income
    // streak 3, mean final credits ~29,000 (the clean trader: 156 encounters,
    // streak 2, ~30,000).
    let encounters = 0;
    let worstZeroIncomeStreak = 0;
    for (let seed = 1; seed <= 10; seed += 1) {
      const report = runCampaign(seed, 60, 'trader-degraded');
      encounters += report.combatEncounters.length;
      let streak = 0;
      for (const day of report.daily) {
        streak = day.incomeActionCount === 0 ? streak + 1 : 0;
        worstZeroIncomeStreak = Math.max(worstZeroIncomeStreak, streak);
      }
    }
    expect(encounters).toBeGreaterThan(100);
    expect(worstZeroIncomeStreak).toBeLessThan(5);
  });
});
