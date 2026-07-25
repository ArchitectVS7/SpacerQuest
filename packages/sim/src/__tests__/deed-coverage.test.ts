import { DEEDS } from '@spacerquest/content';
import { describe, expect, it } from 'vitest';
import { driveCompetentCampaign } from './support/campaign-drivers.js';
import { deedHunterPolicy } from './support/deed-hunter.js';

// ---------------------------------------------------------------------------
// T-1504 · Deed reachability sweep.
//
// Acceptance: "no deed unearnable — a 200-seed sweep earns every deed at least
// once."
//
// HONESTY BAR (the same one the T-401 storylet sweep is held to): the driver is
// a POLICY fed to the real day loop. Every deed below is earned because the
// engine's own `evaluateDeeds` reacted to a real action's events — nothing in
// this file (or in `support/deed-hunter.ts`) writes `registry.earned`,
// `registry.matchCounts`, `player.credits`, `flags`, `eraEvent`,
// `currentSystemId`, or `activeContract`. If a deed were genuinely unearnable
// the fix would be to re-author its trigger, not to poke state.
//
// This is the PLAY-LEVEL half of the "no dead deeds" guarantee. The STRUCTURAL
// half — every deed's eventType and matcher paths are inside the engine's
// allowlist, so it CAN fire at all — is asserted in
// `packages/engine/src/__tests__/deeds.test.ts`. A deed needs both: the engine
// test proves it is wired, this one proves the wiring is reachable by a player.
//
// COST (measured at authoring time): the union completes on the FIRST seed —
// seed 1 at a 300-day horizon earns all 43 authored deeds, in ~100s. The 200
// ceiling is headroom against seed drift, not the cost; the loop breaks the
// instant the union is full.
//
// THE LONG POLES, and what makes each reachable (all handled by the hunter
// policy, all through legal actions):
//   - `tour_one_cleared` / `debt_cleared` — the 25,000cr Guild marker must be
//     discharged by day 30, which takes essentially every credit the first month
//     can produce. The hunter runs Tour One on the LEAN shipped `traderPolicy`
//     plus a Penny Wise advance, and spends nothing else until the marker is
//     cleared.
//   - `beacon_keeper` — Doc Salvage's distress-ping is TOUR_ONE-gated and only
//     offered while the ship shares Sun-3 with Doc, so it must be answered
//     BEFORE the day's jump leaves the system.
//   - `slipped_the_scan` — needs a patrol to scan a hold that is actually
//     carrying illicit cargo AND miss. A policy that fences every sealed pod to
//     Smuggler Ray on sight (which is what the shipped veteran does) empties the
//     hold and the scan never rolls; the hunter declines Ray once his ledger is
//     written and keeps flying dirty.
//   - `landlord` / `rentier` — two 25,000cr port stakes plus twenty dusks of
//     launch-fee income.
//   - `paid_in_full` — the marker's balance grows 5%/dusk on the ceiling
//     principal, so it has to be cleared EARLY or it outruns the purse.
// ---------------------------------------------------------------------------

const SEED_CEILING = 200;
const DAYS_PER_SEED = 300;

describe('T-1504 deed reachability (seed sweep)', () => {
  it('earns every authored deed at least once through legal headless play', () => {
    const covered = new Set<string>();
    let seedsUsed = 0;

    for (let seed = 1; seed <= SEED_CEILING && covered.size < DEEDS.length; seed += 1) {
      seedsUsed = seed;
      const state = driveCompetentCampaign(deedHunterPolicy, seed, DAYS_PER_SEED);
      for (const deed of state.player.registry.earned) {
        covered.add(deed.id);
      }
    }

    const missing = DEEDS.filter((deed) => !covered.has(deed.id)).map((deed) => deed.id);
    expect(missing, `unearnable deeds after ${seedsUsed} seed(s): ${missing.join(', ')}`).toEqual(
      [],
    );
  }, 900000);
});
