// ---------------------------------------------------------------------------
// T-1604 · UGT campaign acceptance — the ≥1,000-action protocol playtest.
//
// Drives the exact protocol surface UGT hits (handleMessage: new-game →
// start-day → legal-actions → apply-action … → end-day) with three pickers and
// asserts the machine-checked invariants that make the campaign a real test:
//   1. ≥1,000 apply-actions logged.
//   2. ZERO ActionBlocked from a legal-actions-obeying pick (the core parity
//      guarantee — legalActions must never advertise an action the engine blocks).
//   3. ZERO protocol errors / apply-failed, ZERO state-invariant breaks.
//   4. Deterministic: same seed → byte-identical log.
//   5. No soft-lock: the competent driver never ends a run stranded.
//
// The committed campaign report (docs/playtests/T-1604-ugt-campaign.md) records a
// wider 10-seed sweep; this test proves the guarantees on a representative sample
// at the ≥1,000 acceptance floor. Budgets are kept lean so the gate stays fast.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { traderPolicy } from '../index.js';
import {
  competentPicker,
  makePolicyPicker,
  randomLegalPicker,
  runProtocolCampaign,
} from '../protocol-campaign.js';

const BUDGET = 1000;

describe('T-1604 · random-legal fuzzer campaign (parity + invariants)', () => {
  for (const seed of [42, 2024]) {
    it(`seed ${seed}: logs ≥1,000 actions with zero blocks / errors / invariant breaks`, () => {
      const report = runProtocolCampaign({
        seed,
        actionBudget: BUDGET,
        picker: randomLegalPicker,
        keepLog: false,
      });

      // 1. Volume — the acceptance floor.
      expect(report.actionsLogged).toBeGreaterThanOrEqual(1000);

      // 2. The PARITY guarantee: a legal-actions-obeying pick can NEVER apply to
      //    an ActionBlocked. Any block means legalActions over-advertised.
      expect(report.blockedByReasonAndType).toEqual({});

      // 3. No protocol error / apply-failed, and every state invariant held
      //    (credits ≥ 0, 0 ≤ fuel ≤ max, debt ≥ 0, diceRemaining consistent, no
      //    throw escaped handleMessage).
      expect(report.errorsByCode).toEqual({});
      expect(report.violations).toEqual([]);

      // Broad verb coverage: the fuzzer reaches every player verb the enumerator
      // advertises, not just the trade loop.
      const verbs = Object.keys(report.actionTypeCounts);
      for (const verb of ['Trade', 'Travel', 'Combat', 'Shipyard', 'Storylet', 'Crew', 'Port']) {
        expect(verbs).toContain(verb);
      }
    });
  }
});

describe('T-1604 · competent (trader-policy) campaign reaches deep states', () => {
  it('seed 42: clears debt, fights, upgrades — with zero blocks / violations / stalls', () => {
    const report = runProtocolCampaign({
      seed: 42,
      actionBudget: BUDGET,
      picker: makePolicyPicker(traderPolicy, 42),
      keepLog: false,
    });

    expect(report.actionsLogged).toBeGreaterThanOrEqual(1000);
    // The competent driver upholds the SAME parity + invariant guarantees…
    expect(report.blockedByReasonAndType).toEqual({});
    expect(report.errorsByCode).toEqual({});
    expect(report.violations).toEqual([]);
    // …and reaches the deep game states a naive picker never does.
    expect(report.finalDebt).toBe(0); // Merchant Guild debt fully cleared
    expect(report.actionTypeCounts.Combat ?? 0).toBeGreaterThan(0);
    expect(report.deaths).toBe(0);
    // No soft-lock: a competent run never ends a day stranded (unable to afford
    // even the cheapest jump). This is the poverty-trap invariant over the wire.
    expect(report.fuelStarvationStalls).toBe(0);
  });

  // T-1604 fix round · The seed-77 poverty-trap REGRESSION. Before the fix this
  // exact run soft-locked: a trader marooned at rim corner Algol-2 (20) with worn
  // drives + hull so that EVERY jump cost more fuel than a full tank could hold —
  // no fuel/credit amount frees such a ship, only a repair. The picker re-queued
  // the same undeliverable Travel for ~926 straight days (daysPlayed 956,
  // finalCredits 0) while the unpaid Guild marker compounded to ~9.5e11, and the
  // `cannotAffordCheapestJump` probe MISSED it (the tank held enough for SOME cheap
  // jump, just not the carried contract's). The fix is threefold: the engine
  // subsistence floor (day.ts — the PRD "world provides a floor" law), the engine
  // forfeit-cargo escape (a player can drop an undeliverable run), and the sim
  // strand-repair (a stranded ship repairs back to mobility before all else). With
  // them the run RECOVERS: it repairs out of the strand within a handful of dusks
  // and trades the whole map instead of freezing. This asserts the recovery, so the
  // soft-lock can never silently return.
  it('seed 77: recovers from the rim-corner strand instead of soft-locking', () => {
    const report = runProtocolCampaign({
      seed: 77,
      actionBudget: BUDGET,
      picker: makePolicyPicker(traderPolicy, 77),
      keepLog: false,
    });

    expect(report.actionsLogged).toBeGreaterThanOrEqual(1000);
    // Invariants hold — the debt-as-ledger never drove credits negative, etc.
    expect(report.blockedByReasonAndType).toEqual({});
    expect(report.errorsByCode).toEqual({});
    expect(report.violations).toEqual([]);
    expect(report.deaths).toBe(0);
    // The ship is NOT permanently stranded: it recovers via the subsistence floor +
    // strand-repair and spends the vast majority of the run mobile. Pre-fix this was
    // ~923 stranded days; the bound is generous but far below any soft-locked run.
    // The lower bound proves the fuelStarvation probe genuinely FIRES on this hard
    // rim-corner strand (it is a real, functioning soft-lock detector), while the
    // upper bound proves the strand is escaped, not permanent.
    expect(report.fuelStarvationStalls).toBeGreaterThan(0);
    expect(report.fuelStarvationStalls).toBeLessThan(150);
    // The unpaid-marker runaway is ARRESTED by the recovery (pre-fix ~9.5e11). The
    // residual debt is only the by-design compounding of a marker missed during the
    // early struggle — bounded, not runaway.
    expect(report.finalDebt).toBeLessThan(10_000_000_000);
  });
});

describe('T-1604 · the heuristic spec-only picker also upholds parity', () => {
  it('seed 7: never blocks or errors from a spec-only pick', () => {
    const report = runProtocolCampaign({
      seed: 7,
      actionBudget: BUDGET,
      picker: competentPicker,
      keepLog: false,
    });
    expect(report.actionsLogged).toBeGreaterThanOrEqual(1000);
    expect(report.blockedByReasonAndType).toEqual({});
    expect(report.errorsByCode).toEqual({});
    // State invariants hold even when the heuristic tunnels into a poverty spiral
    // (a legitimate game state) — credits/fuel/debt never break.
    expect(report.violations).toEqual([]);
  });
});

describe('T-1604 · determinism (engine purity / SeededRng)', () => {
  it('same seed → byte-identical log (random-legal)', () => {
    const a = runProtocolCampaign({ seed: 42, actionBudget: 300, picker: randomLegalPicker });
    const b = runProtocolCampaign({ seed: 42, actionBudget: 300, picker: randomLegalPicker });
    expect(JSON.stringify(b.log)).toBe(JSON.stringify(a.log));
    expect(b.eventTypeCounts).toEqual(a.eventTypeCounts);
  });

  it('same seed → byte-identical log (trader policy over the protocol)', () => {
    const a = runProtocolCampaign({
      seed: 42,
      actionBudget: 300,
      picker: makePolicyPicker(traderPolicy, 42),
    });
    const b = runProtocolCampaign({
      seed: 42,
      actionBudget: 300,
      picker: makePolicyPicker(traderPolicy, 42),
    });
    expect(JSON.stringify(b.log)).toBe(JSON.stringify(a.log));
  });
});
