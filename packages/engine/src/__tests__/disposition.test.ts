import { describe, expect, it } from 'vitest';
import { NPC_PROFILES, Stat } from '@spacerquest/content';
import { resolveCombat } from '../actions/combat.js';
import { selectEncounterInterceptor } from '../actions/travel.js';
import { SeededRng } from '../rng.js';
import { createInitialState } from '../state.js';
import { DayPhase, EncounterInterceptorState, EncounterState, GameState } from '../types.js';

// ---------------------------------------------------------------------------
// T-1204 · Disposition with teeth — the same-seed A/B acceptance.
//
// "Insulting an NPC raises both their tribute DC AND their interception
// probability." We hold the seed and every other input fixed and flip ONLY one
// named NPC's disposition from neutral (0) to insulted (−5, the value the engine
// itself writes on a combat defeat — see `applyDisposition('defeat')`), then show
// both readers move in the wronged direction. Rattlesnake is the PRD §7.4 star.
// ---------------------------------------------------------------------------

const RATTLESNAKE = 'npc-rattlesnake';

function rattlesnakeProfile() {
  const profile = NPC_PROFILES.find((p) => p.id === RATTLESNAKE)!;
  return profile;
}

function rattlesnakeInterceptor(): EncounterInterceptorState {
  const profile = rattlesnakeProfile();
  return {
    id: profile.id,
    source: 'named',
    name: profile.name,
    shipName: profile.shipName,
    profileId: profile.id,
    stats: profile.stats,
    tier: profile.tier,
    flaw: profile.flaw,
    flawDc: profile.flawDc,
  };
}

/** A DAY-phase state with a single high die in hand, generous fuel/credits, and
 *  Rattlesnake's disposition set to `disposition`. */
function talkState(disposition: number): GameState {
  const state = createInitialState(123);
  state.dayPhase = DayPhase.DAY;
  state.player.dawnHand = { dice: [19], spent: [false] };
  state.player.ship.fuel = 1000;
  state.player.credits = 100_000;
  state.player.stats[Stat.TRADE] = 5;
  state.npcs.find((npc) => npc.id === RATTLESNAKE)!.disposition = disposition;
  const encounter: EncounterState = {
    id: 'enc-ab',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
    interceptor: rattlesnakeInterceptor(),
    routeDangerLevel: 1,
    routeDangerChance: 0.3,
    encounterRoll: 0.01,
    round: 1,
    enemyHull: 1,
  };
  state.encounter = encounter;
  return state;
}

function talkDc(seed: number, disposition: number): number | undefined {
  const state = talkState(disposition);
  const { events } = resolveCombat(
    state,
    { type: 'Combat', stance: 'talk', targetId: RATTLESNAKE, spendDie: 0 },
    new SeededRng(seed),
  );
  // The TRADE stat check only fires when Rattlesnake resists its own Vengeful
  // flaw (otherwise it refuses tribute before any talk-down roll). The caller
  // sweeps seeds to land on a resist.
  const talk = events.find((e) => e.type === 'StatCheck' && e.stat === Stat.TRADE);
  return talk?.type === 'StatCheck' ? talk.dc : undefined;
}

describe('T-1204 disposition raises the tribute/talk DC (same-seed A/B)', () => {
  it('an insulted (−5) named interceptor is harder to buy off than a neutral one', () => {
    // Find a seed on which Rattlesnake RESISTS its Vengeful flaw (so the talk-down
    // TRADE check — and its DC — is actually rolled). Disposition never touches the
    // flaw roll, so the SAME seed resists for both A and B: a clean A/B.
    let neutralDc: number | undefined;
    let insultedDc: number | undefined;
    let usedSeed = -1;
    for (let seed = 1; seed <= 200; seed += 1) {
      const a = talkDc(seed, 0);
      const b = talkDc(seed, -5);
      if (a !== undefined && b !== undefined) {
        neutralDc = a;
        insultedDc = b;
        usedSeed = seed;
        break;
      }
    }
    expect(usedSeed).toBeGreaterThan(0);
    // Base talk DC is 10 + tier(3) = 13 at neutral; the −5 grudge adds
    // TALK_DC_PER_DISPOSITION(1) × 5 = 5 → DC 18. "This is personal."
    expect(neutralDc).toBe(13);
    expect(insultedDc).toBe(18);
    expect(insultedDc!).toBeGreaterThan(neutralDc!);
  });
});

/** Count, over a seed sweep, how often `selectEncounterInterceptor` returns
 *  Rattlesnake as the interceptor with its disposition set to `disposition`. */
function rattlesnakePicks(disposition: number, seeds: number): number {
  let picks = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const state = createInitialState(seed);
    state.dayPhase = DayPhase.DAY;
    state.player.tier = 3; // opens the matchmaking band to Rattlesnake (tier 3)
    state.npcs.find((npc) => npc.id === RATTLESNAKE)!.disposition = disposition;
    const interceptor = selectEncounterInterceptor(state, 1, 2, 3, new SeededRng(seed));
    if (interceptor.id === RATTLESNAKE) picks += 1;
  }
  return picks;
}

describe('T-1204 disposition raises interception probability (same-seed A/B)', () => {
  it('a grudge-holding (−5) named NPC hunts the player far more than at neutral', () => {
    const SEEDS = 1500;
    const neutral = rattlesnakePicks(0, SEEDS);
    const grudge = rattlesnakePicks(-5, SEEDS);
    // The grudge weight (1 + 1.5×5 = 8.5 vs 1) makes the wronged NPC dramatically
    // more likely to be the interceptor among same-tier candidates. Same seeds,
    // identical everything else — only the disposition flipped.
    expect(grudge).toBeGreaterThan(neutral);
    // Non-degenerate: the neutral case still picks Rattlesnake sometimes (so the
    // grudge lift is a real re-weighting, not selection appearing from nothing).
    expect(neutral).toBeGreaterThan(0);
  });
});
