import {
  applyPlayerAction,
  createInitialState,
  endDay,
  SeededRng,
  startDay,
  type GameState,
  type PlayerAction,
} from '@spacerquest/engine';
import { describe, expect, it } from 'vitest';
import { fighterPolicy, type SimPolicy } from '../index.js';

// T-1205 acceptance: the fighter policy's win rate improves with upgrades. This
// is a sim A/B — the SAME fighter logic and the SAME seeded engine, run once with
// its component upgrades ALLOWED and once with them PINNED to the junker fit, so
// the only difference is whether the ship's weapons/shields/etc. ever improve.

/** Drive a policy headlessly through the real engine (as runCampaign does) and
 *  return the final GameState, whose append-only eventLog carries every encounter
 *  resolution over the whole run. */
function driveCampaign(policy: SimPolicy, seed: number, days: number): GameState {
  let state = createInitialState(seed);
  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const rng = new SeededRng(seed)
      .fork('policy')
      .fork(`day-${state.day}`)
      .fork(`index-${dayIndex}`);
    let dayState = startDay(state).state;
    const actions = policy({ state: dayState, dayIndex, rng });
    for (const action of actions) {
      // Mirror runCampaign: skip an orphaned Combat if a mid-batch death (seeded
      // enemy damage) already ended the encounter.
      if (action.type === 'Combat' && !dayState.encounter) continue;
      dayState = applyPlayerAction(dayState, action).state;
    }
    state = endDay(dayState).state;
  }
  return state;
}

/** The junker-pinned fighter: the real fighter, but every ship-improvement
 *  purchase (component tiers, offensive special equipment) is stripped from its
 *  plan, so its ship never rises above the starter fit. Everything else — routing,
 *  refuelling, the fight/run/talk decision — is byte-identical to the real
 *  fighter. */
const pinnedFighterPolicy: SimPolicy = (context) => {
  const actions = fighterPolicy(context);
  return actions.filter(
    (a: PlayerAction) =>
      !(
        a.type === 'Shipyard' &&
        (a.action === 'buy-component-tier' || a.action === 'buy-special-equipment')
      ),
  );
};

function encounterOutcomes(state: GameState): { defeated: number; resolved: number } {
  let defeated = 0;
  let resolved = 0;
  for (const e of state.eventLog) {
    if (e.type === 'EncounterResolved') {
      resolved += 1;
      if (e.resolution === 'defeated') defeated += 1;
    }
  }
  return { defeated, resolved };
}

describe('T-1205 · fighter win rate improves with upgrades (sim A/B)', () => {
  it('the upgrade-allowed fighter defeats a strictly higher share of interceptors', () => {
    const SEEDS = [1, 2, 3];
    const DAYS = 200;

    let upgradedDefeated = 0;
    let upgradedResolved = 0;
    let pinnedDefeated = 0;
    let pinnedResolved = 0;
    let boughtWeapons = false;

    for (const seed of SEEDS) {
      const upgraded = driveCampaign(fighterPolicy, seed, DAYS);
      const pinned = driveCampaign(pinnedFighterPolicy, seed, DAYS);
      if (upgraded.player.ship.weapons.strength > 1) boughtWeapons = true;

      const u = encounterOutcomes(upgraded);
      const p = encounterOutcomes(pinned);
      upgradedDefeated += u.defeated;
      upgradedResolved += u.resolved;
      pinnedDefeated += p.defeated;
      pinnedResolved += p.resolved;
    }

    // The A/B arms genuinely differ: the upgrade-allowed fighter really did buy a
    // real gun (otherwise there is nothing being tested).
    expect(boughtWeapons).toBe(true);
    // Both arms actually fought interceptors over the run.
    expect(upgradedResolved).toBeGreaterThan(0);
    expect(pinnedResolved).toBeGreaterThan(0);

    const upgradedWinRate = upgradedDefeated / upgradedResolved;
    const pinnedWinRate = pinnedDefeated / pinnedResolved;

    // The core acceptance: upgraded weapons/shields lift the fighter's win rate.
    // Measured (seeds 1-3, 200 days): the upgrade-allowed fighter defeats
    // 68/83 = 0.819 of its interceptors versus the junker-pinned fighter's
    // 7/50 = 0.140 — a decisive gap, not a marginal pass. (Numbers refreshed for
    // T-1207: the opposed run + post-kill enemy retreat shift the campaign rng
    // stream and divert some kills into `interceptor-escaped`, which this test
    // counts as a non-defeat; the gap stays decisive.)
    expect(upgradedWinRate).toBeGreaterThan(pinnedWinRate);
  }, 60000);
});
