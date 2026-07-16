import { describe, expect, it } from 'vitest';
import { Stat } from '@spacerquest/content';
import { FLAWS } from '@spacerquest/content';
import { natWireStories } from '../wire.js';
import { advanceDay } from '../day.js';
import { resolveTrade } from '../actions/trade.js';
import { applyEncounterDuskPressure } from '../actions/combat.js';
import { SeededRng } from '../rng.js';
import { createInitialState, deserializeState, serializeState } from '../state.js';
import { DayPhase, EncounterState, GameEvent, GameState, NpcState } from '../types.js';

// T-1202 · Nat-20/nat-1 stories + margin scaling (PRD §6).

/** Walk a full event log and bucket, by day, (a) how many nat StatChecks fired
 *  and (b) how many WireEntry lines were filed. StatCheck carries no day field,
 *  so the current day is tracked from the surrounding DawnRoll; WireEntry carries
 *  its own day. */
function bucketByDay(log: readonly GameEvent[]): {
  natsByDay: Map<number, number>;
  wireByDay: Map<number, number>;
} {
  const natsByDay = new Map<number, number>();
  const wireByDay = new Map<number, number>();
  let currentDay = 1;
  for (const e of log) {
    if (e.type === 'DawnRoll') {
      currentDay = e.day;
    } else if (e.type === 'StatCheck') {
      if (e.result.nat20 || e.result.nat1) {
        natsByDay.set(currentDay, (natsByDay.get(currentDay) ?? 0) + 1);
      }
    } else if (e.type === 'WireEntry') {
      wireByDay.set(e.day, (wireByDay.get(e.day) ?? 0) + 1);
    }
  }
  return { natsByDay, wireByDay };
}

describe('Galactic Wire nat-20/nat-1 stories (T-1202, PRD §6)', () => {
  it.each([1, 7, 99])('every nat in a 300-day sim has a same-day wire entry (seed %i)', (seed) => {
    let state = createInitialState(seed);
    for (let day = 0; day < 300; day += 1) {
      state = advanceDay(state, [{ type: 'Wait' }]).state;
    }

    const { natsByDay, wireByDay } = bucketByDay(state.eventLog);

    // A nat must have fired at least once across 300 days, or the property is
    // vacuous — the whole cast rolls checks every dusk.
    const totalNats = [...natsByDay.values()].reduce((a, b) => a + b, 0);
    expect(totalNats).toBeGreaterThan(0);

    // The guarantee: for every day that saw N nats there are AT LEAST N wire
    // lines that day (the scanner emits one story per nat; other events add
    // more). No nat is ever silent.
    for (const [day, natCount] of natsByDay) {
      expect(wireByDay.get(day) ?? 0).toBeGreaterThanOrEqual(natCount);
    }
  });

  it('nat-story wire entries survive a JSON save round-trip', () => {
    let state = createInitialState(1);
    for (let day = 0; day < 40; day += 1) {
      state = advanceDay(state, [{ type: 'Wait' }]).state;
    }
    const wireBefore = state.eventLog.filter((e) => e.type === 'WireEntry');
    expect(wireBefore.length).toBeGreaterThan(0);

    const restored = deserializeState(serializeState(state));
    expect(restored).toEqual(state);
    const wireAfter = restored.eventLog.filter((e) => e.type === 'WireEntry');
    expect(wireAfter).toEqual(wireBefore);
  });

  it('reproduces the PRD §6 sample wire line from a seeded gamble nat-20', () => {
    // The exact §6 sample: Lucky Seven wins Cargo King's ship (Fat Profit) at the
    // Hangout. A Socialize (GUILE) nat-20 by Lucky Seven, with Cargo King the only
    // co-located rival, must produce the verbatim line at the pinned seed.
    const npcs: NpcState[] = [
      {
        id: 'npc-lucky-seven',
        name: 'Lucky Seven',
        profileId: 'npc-lucky-seven',
        currentSystemId: 5,
        credits: 5000,
        fuel: 1000,
        disposition: 0,
      },
      {
        id: 'npc-cargo-king',
        name: 'Cargo King',
        profileId: 'npc-cargo-king',
        currentSystemId: 5,
        credits: 5000,
        fuel: 1000,
        disposition: 0,
      },
    ];
    const natCheck: GameEvent = {
      type: 'StatCheck',
      actor: 'npc-lucky-seven',
      stat: Stat.GUILE,
      dc: 14,
      actionContext: 'npc-socialize',
      result: {
        die: 20,
        modifier: 4,
        total: 24,
        dc: 14,
        success: true,
        margin: 10,
        nat20: true,
        nat1: false,
      },
    };

    const stories = natWireStories([natCheck], 5, new SeededRng(1), npcs);
    expect(stories).toHaveLength(1);
    expect(stories[0]).toEqual({
      type: 'WireEntry',
      day: 5,
      // T-1401: a nat-wire story is an actor-driven line — it carries kind 'npc'.
      kind: 'npc',
      message:
        "Lucky Seven wins the Fat Profit off Cargo King in a Spacer's Dare at the Hangout. Cargo King unavailable for comment.",
    });
  });

  it('emits exactly one story per natted check and ignores ordinary checks', () => {
    const npcs: NpcState[] = [];
    const ordinary: GameEvent = {
      type: 'StatCheck',
      actor: 'Player',
      stat: Stat.PILOT,
      dc: 10,
      result: {
        die: 12,
        modifier: 1,
        total: 13,
        dc: 10,
        success: true,
        margin: 3,
        nat20: false,
        nat1: false,
      },
    };
    const nat1: GameEvent = {
      type: 'StatCheck',
      actor: 'Player',
      stat: Stat.PILOT,
      dc: 10,
      result: {
        die: 1,
        modifier: 1,
        total: 2,
        dc: 10,
        success: false,
        margin: -8,
        nat20: false,
        nat1: true,
      },
    };
    const stories = natWireStories([ordinary, nat1, ordinary], 3, new SeededRng(1), npcs);
    expect(stories).toHaveLength(1);
    expect(stories[0]).toMatchObject({ type: 'WireEntry', day: 3 });
  });
});

describe('Margin scaling (T-1202, PRD §6 "the margin decides how well it goes")', () => {
  function haggleState(base: number): GameState {
    const state = createInitialState(1);
    state.dayPhase = DayPhase.DAY;
    state.player.stats[Stat.TRADE] = 1;
    state.market.manifestBoard = [{ destination: 2, cargoType: 1, payment: base, pods: 1 }];
    return state;
  }

  function haggleWithDie(base: number, die: number): number {
    const state = haggleState(base);
    // Single-die hand; the haggle reads dice[0]. Both dice succeed (>= DC 12 with
    // TRADE 1) but at different margins.
    state.player.dawnHand = { dice: [die], spent: [false] };
    const { events } = resolveTrade(
      state,
      { type: 'Trade', action: 'haggle', contractIndex: 0, spendDie: 0 },
      new SeededRng(1),
    );
    const trade = events.find((e) => e.type === 'TradeEvent' && e.action === 'haggle' && e.success);
    if (!trade || trade.type !== 'TradeEvent' || trade.payment === undefined) {
      throw new Error('haggle did not succeed');
    }
    return trade.payment;
  }

  it('same-seed haggle A/B: a higher margin yields a strictly higher payment', () => {
    const base = 1000;
    // die 14 → margin (14+1-12)=3; die 19 → margin 8. Same base, same everything
    // else — only the margin differs.
    const low = haggleWithDie(base, 14);
    const high = haggleWithDie(base, 19);
    expect(high).toBeGreaterThan(low);
    // And both beat the bare contract (the +50% floor still applies).
    expect(low).toBeGreaterThan(base);
  });

  it('haggle bonus is strictly monotonic in margin even at tiny contract sizes', () => {
    // perMarginCredit is floored at 1, so the payout strictly increases per margin
    // point regardless of how small the base is.
    let previous = -Infinity;
    for (const die of [12, 13, 14, 15, 16, 17, 18, 19]) {
      const payment = haggleWithDie(3, die);
      expect(payment).toBeGreaterThan(previous);
      previous = payment;
    }
  });

  // --- Combat interceptor damage varies with margin -------------------------

  function damageEncounter(gunsStat: number): EncounterState {
    return {
      id: 'enc-dmg',
      pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
      interceptor: {
        id: 'anon-pirate-1',
        source: 'anonymous',
        name: 'K)(akj',
        shipName: 'K1++++',
        shipClass: 'Maligna Bat',
        homeSystem: 'Pollux-7',
        kind: 'PIRATE',
        rosterIndex: 1,
        stats: { PILOT: 1, GUNS: gunsStat, TRADE: 0, GRIT: 0, GUILE: 1 },
        tier: 1,
      },
      routeDangerLevel: 1,
      routeDangerChance: 0.3,
      encounterRoll: 0.01,
      round: 1,
      enemyHull: 1,
    };
  }

  /** Find a seed whose FIRST d20 (the enemy-pressure die) lands in [lo, hi]. */
  function seedForEnemyDie(lo: number, hi: number): number {
    for (let seed = 1; seed <= 10_000; seed += 1) {
      const die = new SeededRng(seed).d20();
      if (die >= lo && die <= hi) return seed;
    }
    throw new Error(`no seed for enemy die in [${lo}, ${hi}]`);
  }

  function duskDamageAmount(gunsStat: number, seed: number): number | undefined {
    const state = createInitialState(1);
    state.player.stats[Stat.GRIT] = 1; // DC = 10 + 1 = 11
    state.encounter = damageEncounter(gunsStat);
    const events = applyEncounterDuskPressure(state, new SeededRng(seed));
    const dmg = events.find((e) => e.type === 'ComponentDamaged');
    return dmg && dmg.type === 'ComponentDamaged' ? dmg.amount : undefined;
  }

  it('combat damage varies with the interceptor check margin', () => {
    // Small-margin hit: GUNS 0, DC 11 → success needs die >= 11, margin = die - 11
    // (0..8, never >= 10) → base 1 condition of damage.
    const smallSeed = seedForEnemyDie(11, 19);
    expect(duskDamageAmount(0, smallSeed)).toBe(1);

    // Big-margin hit: GUNS 5, DC 11 → die 16..19 gives margin >= 10 (non-nat) → 2.
    const bigSeed = seedForEnemyDie(16, 19);
    expect(duskDamageAmount(5, bigSeed)).toBe(2);

    // Natural 20: the cleanest possible hit bites deepest → 3.
    const natSeed = seedForEnemyDie(20, 20);
    expect(duskDamageAmount(0, natSeed)).toBe(3);
  });
});

describe('WireEntry.kind stamping (T-1401)', () => {
  it('stamps kind "flaw-override" only on a flaw-override wire line, at emission', () => {
    // Seed 1's day-1 dusk deterministically drives at least one NPC's flaw to
    // override their day (Silk Dagger, "abandoned the job to hunt an old enemy").
    // The engine now TAGS that line at the source — the UI never has to string-
    // match FLAWS[*].detail suffixes to find it.
    const { events } = advanceDay(createInitialState(1), []);
    const flawSuffixes = Object.values(FLAWS).map((f) => f.detail);

    const flawWires = events.filter((e) => e.type === 'WireEntry' && e.kind === 'flaw-override');
    expect(flawWires.length).toBeGreaterThan(0);
    for (const wire of flawWires) {
      // Every flaw-override line does end with a content flaw detail — proving the
      // stamp agrees with the old heuristic where the heuristic was correct...
      expect(wire.type === 'WireEntry' && flawSuffixes.some((s) => wire.message.endsWith(s))).toBe(
        true,
      );
    }

    // ...and every kinded WireEntry carries exactly one of the three kinds.
    for (const e of events) {
      if (e.type === 'WireEntry') {
        expect(['flaw-override', 'npc', 'plain']).toContain(e.kind);
      }
    }
  });

  it('stamps kind "npc" on a nat-wire actor line, not "flaw-override"', () => {
    // The natWireStories assertion above already pins kind 'npc' on a nat-wire
    // line; this guards the discriminator is present on the full day's npc lines.
    const { events } = advanceDay(createInitialState(1), []);
    const npcWires = events.filter((e) => e.type === 'WireEntry' && e.kind === 'npc');
    expect(npcWires.length).toBeGreaterThan(0);
  });
});
