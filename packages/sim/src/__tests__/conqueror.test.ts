import { RENOWN_DEED_THRESHOLDS } from '@spacerquest/content';
import { describe, expect, it } from 'vitest';
import { driveConquerorCampaign } from './support/conqueror-driver.js';

// ---------------------------------------------------------------------------
// T-1504 · Conqueror reachability THROUGH PLAY (acceptance: "a long veteran sim
// reaches Conqueror through play"). T-1308 authored the 10th rank at a deed
// threshold (30) sitting in headroom this task fills; its reachability sweep is
// T-1504's obligation (T-1308 deferred it). This proves the top rank is reached
// by EARNING 30 Deeds across a long all-verb career — never by setting a rank.
//
// The driver is a competent all-verb player (support/conqueror-driver.ts): it
// clears the Tour One marker by honest trading, climbs renown through combat and
// rim runs and era storylets, and exercises every new verb (gambling, lending,
// exploration, property, smuggling) — all through LEGAL engine actions, nothing
// injected. This is the same headless-reachability bar T-114a set for the
// renown-gated equipment (proven by a sim drive, not an e2e playthrough); the UI
// side renders the Conqueror registry generically (packages/ui storylet-registry
// spec loads a 30-deed career and asserts the pane shows "Conqueror").
// ---------------------------------------------------------------------------
describe('T-1504 Conqueror reachable through play', () => {
  it('a long all-verb veteran career earns 30 deeds and crosses into CONQUEROR', () => {
    // Seed 2 is the first that lands the full climb inside the horizon (a seeds
    // 1..6 sweep reaches CONQUEROR on 2, 3 and 4 — see the deed-coverage sweep).
    // Pinned, not steered: nothing here sets a rank or a deed; the rank is a pure
    // function of the Deeds the driver earns through legal play.
    const state = driveConquerorCampaign(2, 250);

    expect(state.player.registry.earned.length).toBeGreaterThanOrEqual(
      RENOWN_DEED_THRESHOLDS.CONQUEROR,
    );
    expect(state.player.registry.renownRank).toBe('CONQUEROR');
  }, 120000);
});
