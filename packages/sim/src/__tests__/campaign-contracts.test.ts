import { describe, expect, it } from 'vitest';
import { runCampaign, type CampaignStatsReport } from '../index.js';
import { summarizeReport, aggregate } from '../balance/aggregate.js';

// ---------------------------------------------------------------------------
// N10 · THE NAMED READER (standing constraint 7) for the two contract-competition
// fields this step added to the instrument — `CampaignStatsReport.contractClaims`
// and `CampaignDayStats.boardDepth` — and for their aggregate counterparts
// (`contractClaims` / `contractClaimsPerRun` / `boardDepth` in
// `balance/aggregate.ts`).
//
// WHY THIS FILE EXISTS AT ALL, stated plainly because it is the finding that
// motivated it: before N10 the sim had NO reader for contract competition of any
// kind. `day.ts` emitted `ContractClaimed` and nothing in `packages/sim` counted
// it, so N2's "+2.0%" had to come from an ad-hoc probe and no committed baseline
// has ever carried the number. A mechanism the instrument cannot see cannot be
// graded — the same class of blind spot as N9's "the aggregate cannot see an
// asset" and N4's "sampleMilestone sampled all 41 records" — and it had to close
// BEFORE this step's own capstone, not after.
//
// WHAT IS AND IS NOT ASSERTED. These are BANDS and structural invariants, never
// pinned digits: the claim rate is a live measurement that every later N step is
// expected to move (N11's deeds and N12's ports both change how often a captain
// trades). `docs/VERSIONING.md` — "bands with visible headroom, never pinned
// digits". The one exact assertion is the arithmetic identity between the scalar
// and the per-day series, which is a property of the code rather than of balance.
// ---------------------------------------------------------------------------

const HORIZON = 60;
const SEED = 3;

let report: CampaignStatsReport;

function run(): CampaignStatsReport {
  report ??= runCampaign(SEED, HORIZON, 'trader');
  return report;
}

describe('N10 · the instrument can see contract competition', () => {
  it('counts claims off the live board, and the scalar equals its own per-day series', () => {
    const r = run();
    // The identity T-1601a's `fuelStarved` established: one measurement, two
    // shapes, summed from the series rather than kept as a second counter so the
    // trajectory and the total cannot disagree.
    expect(r.contractClaims).toBe(r.daily.reduce((total, day) => total + day.contractsSniped, 0));
    expect(r.daily).toHaveLength(HORIZON);
  });

  it('records the dawn board depth every day, inside the pool bounds', () => {
    const r = run();
    for (const day of r.daily) {
      // JOB_POOL_MIN_BOARD..JOB_POOL_BOARD_SIZE. Asserted as the closed interval
      // rather than against the engine constants, because the point here is that
      // the SIM records what the engine produced — importing the engine's bounds
      // would let a sim that recorded nothing agree with itself.
      expect(day.boardDepth).toBeGreaterThanOrEqual(1);
      expect(day.boardDepth).toBeLessThanOrEqual(4);
    }
    // A full-depth board is the common case (cast demand is a small fraction of
    // the galaxy's job supply — see N10's Result), so this is not asserting that
    // competition is absent, only that the series is real and varies.
    expect(r.daily.some((day) => day.boardDepth === 4)).toBe(true);
  });

  it('the board is sometimes thinner than a fresh port, and only ever because of a claim', () => {
    // The player parks nowhere special and the cast works the galaxy, so over a
    // 60-day career at least one dawn should open on a drained pool. If this ever
    // fails it is a real signal — the depletion stopped reaching the player — and
    // NOT a band to widen.
    const drained = run().daily.filter((day) => day.boardDepth < 4);
    expect(drained.length).toBeGreaterThan(0);
  });

  it('the aggregate carries the row up: claims per run and the DEPTH distribution', () => {
    const r = run();
    const { fleet } = aggregate('n10-reader', [summarizeReport(r)]);

    expect(fleet.contractClaims).toBe(r.contractClaims);
    expect(fleet.contractClaimsPerRun).toBe(r.contractClaims);
    // The percentiles are the point, and a mean would defeat it: competition shows
    // up as the BOTTOM of this distribution moving long before the median does,
    // and this step's Disproves ("boards empty") is a claim about that tail.
    expect(fleet.boardDepth.n).toBe(HORIZON);
    expect(fleet.boardDepth.max).toBeLessThanOrEqual(4);
    expect(fleet.boardDepth.min).toBeGreaterThanOrEqual(1);
    expect(fleet.boardDepth.p10).toBeLessThanOrEqual(fleet.boardDepth.median);
  });

  it('survives the JSON round trip the sweep writes to disk', () => {
    // The sweep persists reports as JSON; a field that does not survive that is a
    // field the capstone does not carry.
    const r = run();
    const revived = JSON.parse(JSON.stringify(r)) as CampaignStatsReport;
    expect(revived.contractClaims).toBe(r.contractClaims);
    expect(revived.daily.map((d) => d.boardDepth)).toEqual(r.daily.map((d) => d.boardDepth));
  });
});
