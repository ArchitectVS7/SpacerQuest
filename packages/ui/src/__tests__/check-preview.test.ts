import { describe, expect, it } from 'vitest';
import {
  applyPlayerAction,
  check,
  createInitialState,
  navBonus,
  startDay,
  travelPreview,
  venueParamsFor,
  type EncounterState,
  type GameState,
} from '@spacerquest/engine';
import {
  EXPLORATION_NAV_DC,
  NEMESIS_SYSTEM_ID,
  NPC_PROFILES,
  Stat,
  TALK_DC_PER_DISPOSITION,
} from '@spacerquest/content';
import {
  armedDieFace,
  combatCheckPreview,
  crossingCheckPreview,
  exploreCheckPreview,
  haggleCheckPreview,
  peekCheckPreview,
  type CheckPreview,
  type CombatStance,
} from '../format';

// ---------------------------------------------------------------------------
// T-194 · "SHOW THE ROLL BEFORE IT IS COMMITTED", AS A PREDICATE.
//
// The owner's finding was that a die is spent with no feedback that it does
// anything. The fix is one selector family that turns a bare DC into either a
// PLANNING read (no die armed yet) or a LIVE read (this exact face, resolved).
// This file pins the selectors; the DOM half — that the two states really render
// differently, and that each pane really mounts one — is
// `check-preview-row.test.tsx` and `check-preview-panels.test.tsx` (TT-13a).
//
// THE LOAD-BEARING DISCIPLINE, and the reason a `live` arm is worth having at
// all: it must be the ENGINE's own `check()` output, not a UI comparison. So
// every `live` expectation below calls `check(face, modifier, dc)` in the test
// and asserts field-by-field equality. A UI that re-implemented `total >= dc`
// would pass the ordinary cases and fail the two that matter — a nat 1 whose
// total clears, and a nat 20 whose total does not.
//
// Node environment, selectors over `format.ts` only, never `../store` (which runs
// `init()` at module load) — the discipline `liars-dice-pane.test.ts` states.
// ---------------------------------------------------------------------------

const SUN_3 = 1;
const DEALER = 'npc-iron-vex'; // cast index 0 — co-located at Sol-3 on every seed.

/** A live day-1 career WITH a real dawn hand — `startDay` is what rolls it, and
 *  every "is a die armed" branch reads it. */
function career(seed = 1): GameState {
  return startDay(createInitialState(seed)).state;
}

/** Replace the dealt hand with an exact one, so a test can name the face it
 *  expects instead of hunting a seed that deals it. */
function withHand(game: GameState, dice: number[], spent?: boolean[]): GameState {
  return {
    ...game,
    player: {
      ...game.player,
      dawnHand: { dice, spent: spent ?? dice.map(() => false) },
    },
  };
}

/** The encounter frame the combat cases share — the `withEncounter` idiom
 *  `combat-catchphrases.test.ts` established. */
function withEncounter(game: GameState, interceptor: EncounterState['interceptor']): GameState {
  const clone = JSON.parse(JSON.stringify(game)) as GameState;
  clone.encounter = {
    id: `enc-1-0-1-2-${interceptor.id}`,
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 2 },
    interceptor,
    routeDangerLevel: 3,
    routeDangerChance: 0.3,
    encounterRoll: 0.1,
    round: 1,
    enemyHull: 3,
  };
  return clone;
}

/** A NAMED interceptor built from a real profile (id === profileId, the same
 *  identity `buildNamedCandidates` gives one), so the TALK disposition term has a
 *  live `game.npcs` row to find. */
function namedInterceptor(tier: number): EncounterState['interceptor'] {
  const profile = NPC_PROFILES.find((p) => p.id === DEALER)!;
  return {
    id: profile.id,
    source: 'named',
    name: profile.name,
    shipName: 'Grudge',
    profileId: profile.id,
    stats: { [Stat.PILOT]: 3, [Stat.GUNS]: 3, [Stat.TRADE]: 3, [Stat.GUILE]: 3, [Stat.GRIT]: 3 },
    tier: tier as EncounterState['interceptor']['tier'],
  };
}

function anonymousInterceptor(tier: number): EncounterState['interceptor'] {
  return {
    id: 'anon-pirate-1',
    source: 'anonymous',
    name: 'Capt.Brutus',
    shipName: 'Rustbucket',
    stats: { [Stat.PILOT]: 2, [Stat.GUNS]: 2, [Stat.TRADE]: 2, [Stat.GUILE]: 2, [Stat.GRIT]: 2 },
    tier: tier as EncounterState['interceptor']['tier'],
  };
}

/** Set a named NPC's disposition, the way the TALK DC term reads it. */
function withDisposition(game: GameState, npcId: string, disposition: number): GameState {
  return {
    ...game,
    npcs: game.npcs.map((n) => (n.id === npcId ? { ...n, disposition } : n)),
  };
}

function crossingUnlocked(game: GameState): GameState {
  return { ...game, flags: { ...game.flags, 'nemesis.crossing.unlocked': true } };
}

/** Every DC-based surface, as `(name, selector)` pairs — so the sweeps below are
 *  a loop over the acceptance list rather than five copy-pasted cases. */
function dcSurfaces(game: GameState): { name: string; run: (i: number | null) => CheckPreview }[] {
  return [
    { name: 'explore', run: (i) => exploreCheckPreview(game, i) },
    { name: 'haggle', run: (i) => haggleCheckPreview(game, i) },
    { name: 'peek', run: (i) => peekCheckPreview(game, i) },
    { name: 'crossing', run: (i) => crossingCheckPreview(game, i) },
    { name: 'combat/fight', run: (i) => combatCheckPreview(game, 'fight', i) },
    { name: 'combat/talk', run: (i) => combatCheckPreview(game, 'talk', i) },
  ];
}

/** A state where every one of the six DC surfaces is genuinely live: an unlocked
 *  crossing, an open Dare hand and an encounter, all at once. Contrived on
 *  purpose — the point is to sweep the whole acceptance list against one hand. */
function allSurfacesLive(dice: number[]): GameState {
  const base = createInitialState(1);
  expect(base.player.currentSystemId).toBe(SUN_3);
  const dealt = startDay(base).state;
  const { state: withDare } = applyPlayerAction(dealt, {
    type: 'VisitHangout',
    venue: 'dare',
    opponentId: DEALER,
    wager: 25,
  });
  expect(withDare.dareHand).not.toBeNull();
  return withHand(crossingUnlocked(withEncounter(withDare, namedInterceptor(2))), dice);
}

describe('T-194 · armedDieFace — the four ways "armed" can be a lie', () => {
  it('returns the FACE at the index, never the index', () => {
    const game = withHand(career(), [17, 3, 9, 12, 5]);
    expect(armedDieFace(game, 0)).toBe(17);
    expect(armedDieFace(game, 3)).toBe(12);
  });

  it('is null with no hand, a null index, an out-of-range index, or a spent slot', () => {
    const game = withHand(career(), [11, 11]);
    expect(armedDieFace(game, null)).toBeNull();
    expect(armedDieFace(game, -1)).toBeNull();
    expect(armedDieFace(game, 5)).toBeNull();
    expect(armedDieFace(withHand(game, [11, 11], [true, false]), 0)).toBeNull();
    const handless = { ...game, player: { ...game.player, dawnHand: undefined } };
    expect(armedDieFace(handless, 0)).toBeNull();
  });
});

describe('T-194 · every DC read is the resolver’s own DC and modifier', () => {
  it('explore mirrors actions/exploration.ts — EXPLORATION_NAV_DC, PILOT + navBonus', () => {
    const game = withHand(career(), [12, 12, 12, 12, 12]);
    const plan = exploreCheckPreview(game, null);
    expect(plan).toEqual({
      kind: 'plan',
      stat: Stat.PILOT,
      dc: EXPLORATION_NAV_DC,
      modifier: game.player.stats[Stat.PILOT] + navBonus(game.player.ship),
    });
  });

  it('haggle mirrors actions/trade.ts — the TRADE stat against the broker DC', () => {
    const game = withHand(career(), [12, 12, 12, 12, 12]);
    const plan = haggleCheckPreview(game, null);
    expect(plan.kind).toBe('plan');
    if (plan.kind !== 'plan') throw new Error('unreachable');
    expect(plan.stat).toBe(Stat.TRADE);
    expect(plan.modifier).toBe(game.player.stats[Stat.TRADE]);
    // The number itself is pinned against the RESOLVER'S SOURCE in
    // `engine-dc-pins.test.ts`; here it only has to be internally consistent.
    expect(plan.dc).toBeGreaterThan(0);
  });

  it('peek mirrors actions/dare.ts — GUILE against the PORT’s authored dare DC', () => {
    const game = allSurfacesLive([12, 12, 12, 12, 12]);
    const plan = peekCheckPreview(game, null);
    expect(plan).toEqual({
      kind: 'plan',
      stat: Stat.GUILE,
      dc: venueParamsFor(SUN_3, 'dare').dc,
      modifier: game.player.stats[Stat.GUILE],
    });
  });

  it('the crossing mirrors actions/travel.ts — PILOT + navBonus against the preview DC', () => {
    const game = crossingUnlocked(withHand(career(), [12, 12, 12, 12, 12]));
    expect(crossingCheckPreview(game, null)).toEqual({
      kind: 'plan',
      stat: Stat.PILOT,
      dc: travelPreview(game, NEMESIS_SYSTEM_ID).dc,
      modifier: game.player.stats[Stat.PILOT] + navBonus(game.player.ship),
    });
  });

  it('combat FIGHT mirrors actions/combat.ts — GUNS against a tier-scaled DC', () => {
    const game = withHand(career(), [12, 12, 12, 12, 12]);
    const dcs = [1, 2, 3, 4, 5].map((tier) => {
      const p = combatCheckPreview(withEncounter(game, anonymousInterceptor(tier)), 'fight', null);
      if (p.kind !== 'plan') throw new Error('unreachable');
      expect(p.stat).toBe(Stat.GUNS);
      return p.dc;
    });
    // The rule is `10 + tier`: strictly monotone, one step per tier. Asserted as a
    // SHAPE rather than five literals, so a retune fails `engine-dc-pins` (which
    // reads the resolver's source) rather than quietly passing here.
    expect(dcs).toEqual([dcs[0], dcs[0] + 1, dcs[0] + 2, dcs[0] + 3, dcs[0] + 4]);
  });

  it('combat TALK shifts by TALK_DC_PER_DISPOSITION — a grudge raises it, a favour cuts it', () => {
    const base = withHand(career(), [12, 12, 12, 12, 12]);
    const dcFor = (disposition: number): number => {
      const game = withEncounter(withDisposition(base, DEALER, disposition), namedInterceptor(2));
      const p = combatCheckPreview(game, 'talk', null);
      if (p.kind !== 'plan') throw new Error('unreachable');
      expect(p.stat).toBe(Stat.TRADE);
      return p.dc;
    };
    const neutral = dcFor(0);
    expect(dcFor(-5)).toBe(neutral + TALK_DC_PER_DISPOSITION * 5);
    expect(dcFor(5)).toBe(neutral - TALK_DC_PER_DISPOSITION * 5);
    // An ANONYMOUS raider carries no standing, so its TALK DC is the fight DC.
    const anon = combatCheckPreview(
      withEncounter(withDisposition(base, DEALER, -5), anonymousInterceptor(2)),
      'talk',
      null,
    );
    const anonFight = combatCheckPreview(
      withEncounter(base, anonymousInterceptor(2)),
      'fight',
      null,
    );
    if (anon.kind !== 'plan' || anonFight.kind !== 'plan') throw new Error('unreachable');
    expect(anon.dc).toBe(anonFight.dc);
  });
});

describe('T-194 · a live read is the ENGINE’s check(), for every face', () => {
  it('matches check(face, modifier, dc) field-by-field on all twenty faces, everywhere', () => {
    for (let face = 1; face <= 20; face++) {
      const game = allSurfacesLive([face, face, face, face, face]);
      for (const { name, run } of dcSurfaces(game)) {
        const plan = run(null);
        const live = run(0);
        expect(`${name}:${plan.kind}`).toBe(`${name}:plan`);
        expect(`${name}:${live.kind}`).toBe(`${name}:live`);
        if (plan.kind !== 'plan' || live.kind !== 'live') throw new Error('unreachable');
        expect(live.stat).toBe(plan.stat);
        // THE assertion: not "a result exists" but "this exact result", produced
        // by the same function the resolver calls.
        expect(live.result).toEqual(check(face, plan.modifier, plan.dc));
      }
    }
  });

  it('a NAT 1 fails even when the total clears, and a NAT 20 passes even when it does not', () => {
    // Pinned explicitly rather than left to the sweep above, because these are the
    // two cases a UI-side `total >= dc` would get wrong — the whole reason the
    // live arm delegates to the engine (UI-29).
    const low = allSurfacesLive([1, 1, 1, 1, 1]);
    const high = allSurfacesLive([20, 20, 20, 20, 20]);
    for (const { name, run } of dcSurfaces(low)) {
      const live = run(0);
      if (live.kind !== 'live') throw new Error('unreachable');
      expect(`${name}:${live.result.nat1}`).toBe(`${name}:true`);
      expect(`${name}:${live.result.success}`).toBe(`${name}:false`);
    }
    for (const { name, run } of dcSurfaces(high)) {
      const live = run(0);
      if (live.kind !== 'live') throw new Error('unreachable');
      expect(`${name}:${live.result.nat20}`).toBe(`${name}:true`);
      expect(`${name}:${live.result.success}`).toBe(`${name}:true`);
    }
    // …and the premise: a nat 1 CAN total over the DC and a nat 20 CAN total
    // under it, or the two cases above would prove nothing. Constructed against a
    // DC the surface really uses.
    const talkPlan = combatCheckPreview(low, 'talk', null);
    if (talkPlan.kind !== 'plan') throw new Error('unreachable');
    expect(check(1, talkPlan.dc, talkPlan.dc).total).toBeGreaterThanOrEqual(talkPlan.dc);
    expect(check(1, talkPlan.dc, talkPlan.dc).success).toBe(false);
    expect(check(20, 0, 100).total).toBeLessThan(100);
    expect(check(20, 0, 100).success).toBe(true);
  });
});

describe('T-194 · L-018 negative control — plan and live are BOTH reachable everywhere', () => {
  it('every DC surface reports plan unarmed and live armed, and never the same kind for both', () => {
    const game = allSurfacesLive([13, 13, 13, 13, 13]);
    const surfaces = dcSurfaces(game);
    expect(surfaces).toHaveLength(6);
    for (const { name, run } of surfaces) {
      // A stub that always returns `plan` fails the second line; one that always
      // returns `live` fails the first.
      expect(`${name}:${run(null).kind}`).toBe(`${name}:plan`);
      expect(`${name}:${run(0).kind}`).toBe(`${name}:live`);
    }
  });

  it('a spent slot, an out-of-range index and an empty hand all fall back to plan', () => {
    const spent = allSurfacesLive([13, 13, 13, 13, 13]);
    const withSpent = withHand(spent, [13, 13], [true, true]);
    for (const { name, run } of dcSurfaces(withSpent)) {
      expect(`${name}:${run(0).kind}`).toBe(`${name}:plan`);
      expect(`${name}:${run(9).kind}`).toBe(`${name}:plan`);
    }
    const handless = { ...spent, player: { ...spent.player, dawnHand: undefined } };
    for (const { name, run } of dcSurfaces(handless)) {
      expect(`${name}:${run(0).kind}`).toBe(`${name}:plan`);
    }
  });
});

describe('T-194 · the surfaces that have nothing to say say `none`', () => {
  it('peek is `none` with no hand on the table', () => {
    expect(peekCheckPreview(withHand(career(), [13, 13]), 0)).toEqual({ kind: 'none' });
  });

  it('every combat stance is `none` with no encounter', () => {
    const game = withHand(career(), [13, 13]);
    for (const stance of ['fight', 'talk', 'run'] as CombatStance[]) {
      expect(combatCheckPreview(game, stance, 0)).toEqual({ kind: 'none' });
      expect(combatCheckPreview(game, stance, null)).toEqual({ kind: 'none' });
    }
  });
});

describe('T-194 · combat RUN is OPPOSED and is never dressed up as a DC (UI-30)', () => {
  it('returns `opposed` armed and unarmed, and carries no dc field at all', () => {
    const game = withEncounter(withHand(career(), [14, 14, 14]), anonymousInterceptor(3));
    for (const armed of [null, 0]) {
      const run = combatCheckPreview(game, 'run', armed);
      expect(run.kind).toBe('opposed');
      if (run.kind !== 'opposed') throw new Error('unreachable');
      expect(run.stat).toBe(Stat.PILOT);
      expect(run.modifier).toBe(game.player.stats[Stat.PILOT]);
      expect(Object.keys(run)).not.toContain('dc');
      expect(Object.keys(run)).not.toContain('result');
    }
  });

  it('carries the armed FACE (not the index), and null when nothing is armed', () => {
    const game = withEncounter(withHand(career(), [14, 7, 2]), anonymousInterceptor(3));
    const armed = combatCheckPreview(game, 'run', 1);
    if (armed.kind !== 'opposed') throw new Error('unreachable');
    expect(armed.die).toBe(7);
    const idle = combatCheckPreview(game, 'run', null);
    if (idle.kind !== 'opposed') throw new Error('unreachable');
    expect(idle.die).toBeNull();
  });
});
