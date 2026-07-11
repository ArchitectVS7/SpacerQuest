import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createInitialState, serializeState } from '../state.js';
import { advanceDay, startDay, applyPlayerAction, endDay } from '../day.js';
import {
  GameStateSchema,
  validateGameState,
  safeValidateGameState,
  validatePlayerAction,
} from '../schema.js';
import { EncounterState, GameState, PlayerAction } from '../types.js';

/** Drive a handful of real game days so the serialized state is rich —
 *  populated eventLog, evolving market, mutated NPCs — not the pristine seed. */
function playedState(seed: number, days: number): GameState {
  let state = createInitialState(seed);
  for (let d = 0; d < days; d += 1) {
    state = advanceDay(state, [{ type: 'Wait' }]).state;
  }
  return state;
}

/** A weak tier-1 interceptor with 1 hull — a single `fight` volley resolves it,
 *  so combat/encounter event variants land deterministically. Mirrors the
 *  fixtures in encounter.test.ts. */
function fixtureEncounter(): EncounterState {
  return {
    id: 'enc-schema',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
    interceptor: {
      id: 'anon-pirate-schema',
      source: 'anonymous',
      name: 'K)(akj',
      shipName: 'K1++++',
      shipClass: 'Maligna Bat',
      homeSystem: 'Pollux-7',
      kind: 'PIRATE',
      rosterIndex: 1,
      stats: { PILOT: 1, GUNS: 0, TRADE: 0, GRIT: 0, GUILE: 1 },
      tier: 1,
    },
    routeDangerLevel: 1,
    routeDangerChance: 0.08,
    encounterRoll: 0.01,
    round: 1,
    enemyHull: 1,
  };
}

/** Rotating multi-day script covering the trade / travel / shipyard / explore
 *  action families (distinct die indices per day so nothing double-spends). */
const VARIED_SCRIPT: PlayerAction[][] = [
  [
    { type: 'Trade', action: 'haggle', contractIndex: 0, spendDie: 0 },
    { type: 'Trade', action: 'sign-contract', contractIndex: 0, spendDie: 1 },
    { type: 'Travel', destinationId: 3, spendDie: 2 },
  ],
  [
    { type: 'Shipyard', action: 'repair', repairMode: 'all', spendDie: 0 },
    { type: 'Shipyard', action: 'buy-cargo-pods', quantity: 1, spendDie: 1 },
    { type: 'Trade', action: 'pay-debt', amount: 50 },
  ],
  [
    { type: 'Explore', spendDie: 0 },
    { type: 'Travel', destinationId: 4, spendDie: 1 },
    { type: 'Trade', action: 'buy-fuel', fuelAmount: 10, spendDie: 2 },
  ],
];

/**
 * Drive a deterministic, seeded run through the REAL engine that exercises a
 * broad spread of GameEvent variants — so the schema's acceptance of those
 * shapes is proven end-to-end, not merely by transcription (review follow-up).
 */
function driveDiverseRun(seed: number): GameState {
  let state = createInitialState(seed);

  // Day 1: the Sun-3 guild-auditor storylet is deterministically available at
  // the start system — exercises the Storylet* event family — plus explore and
  // travel to open the trade/travel families.
  state = advanceDay(state, [
    { type: 'Storylet', storyletId: 'port.sun3.guild-auditor', choiceId: 'argue', spendDie: 0 },
    { type: 'Trade', action: 'buy-fuel', fuelAmount: 40, spendDie: 1 },
    { type: 'Explore', spendDie: 2 },
    { type: 'Travel', destinationId: 2, spendDie: 3 },
  ]).state;

  for (const actions of VARIED_SCRIPT) {
    state = advanceDay(state, actions).state;
  }

  // Injected encounter day: travel RNG only hits an interceptor sometimes, so
  // inject one directly and drive combat to land the encounter/combat variants
  // (EncounterRound, CombatEvent, TributeDemanded/Paid, EnemyCounterAction,
  // ComponentDamaged, EncounterResolved).
  {
    const dawn = startDay(state);
    let s = dawn.state;
    s.player.ship.fuel = 1000; // guarantee fuel for run/fight volleys
    s.encounter = fixtureEncounter();
    s = applyPlayerAction(s, {
      type: 'Combat',
      stance: 'talk',
      targetId: s.encounter.interceptor.id,
      spendDie: 0,
    }).state;
    if (s.encounter) {
      s = applyPlayerAction(s, {
        type: 'Combat',
        stance: 'fight',
        targetId: s.encounter.interceptor.id,
        spendDie: 1,
      }).state;
    }
    state = endDay(s).state;
  }

  return state;
}

describe('GameStateSchema — accepts real serialized states', () => {
  it('round-trips a fresh initial state', () => {
    const state = createInitialState(1);
    const raw = JSON.parse(serializeState(state)) as unknown;
    const validated = validateGameState(raw);
    expect(validated).toEqual(raw);
  });

  it('round-trips a played-forward state with a populated event log', () => {
    const state = playedState(7, 40);
    // Sanity: the run actually produced events to validate.
    expect(state.eventLog.length).toBeGreaterThan(0);

    const raw = JSON.parse(serializeState(state)) as unknown;
    const validated = validateGameState(raw);
    expect(validated).toEqual(raw);
  });

  it('accepts a diverse driven run (travel/trade/shipyard/explore/storylet/combat events)', () => {
    const allTypes = new Set<string>();
    for (const seed of [3, 11, 29, 101]) {
      const state = driveDiverseRun(seed);
      const raw = JSON.parse(serializeState(state)) as unknown;
      const validated = validateGameState(raw);
      expect(validated).toEqual(raw);
      for (const e of state.eventLog) allTypes.add(e.type);
    }

    // The run must exercise a broad spread of variants — guard against silently
    // regressing to Wait/DawnRoll-only coverage. (Fixed seeds + a deterministic
    // engine make this union reproducible; the current run lands 27 types.)
    expect(allTypes.size).toBeGreaterThanOrEqual(15);

    // Representatives of every major action family must actually appear, so the
    // schema's acceptance of these event shapes is validated end-to-end rather
    // than resting on manual transcription.
    for (const required of [
      'TravelEvent', // travel
      'TradeEvent', // trade
      'ShipyardFail', // shipyard (repair-all on an undamaged ship)
      'CombatEvent', // combat
      'EncounterRound', // encounter loop
      'EncounterResolved', // encounter resolution
      'StoryletChoiceResolved', // storylet
    ]) {
      expect(allTypes.has(required)).toBe(true);
    }
    // Explore emits exactly one of these per attempt.
    expect(allTypes.has('ExplorationFailed') || allTypes.has('PoiDiscovered')).toBe(true);
  });

  it('round-trips a populated nemesisFile (T-111b fragments survive validation)', () => {
    const state = createInitialState(1);
    state.player.nemesisFile.fragments = [
      { fragmentId: 'frag-nemesis-01', source: 'wise-one', day: 3, decoded: true },
      { fragmentId: 'frag-nemesis-02', source: 'derelict', day: 8, decoded: false },
    ];
    const raw = JSON.parse(serializeState(state)) as unknown;
    const validated = validateGameState(raw);
    expect(validated).toEqual(raw);
    expect(validated.player.nemesisFile.fragments).toHaveLength(2);
  });

  it('rejects a nemesisFile fragment with a bad source enum', () => {
    const obj = JSON.parse(serializeState(createInitialState(1))) as Record<string, unknown>;
    const player = obj.player as Record<string, unknown>;
    (player.nemesisFile as { fragments: unknown[] }).fragments = [
      { fragmentId: 'x', source: 'not-a-source', day: 1, decoded: false },
    ];
    const result = safeValidateGameState(obj);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.path.join('.').startsWith('player.nemesisFile.fragments'),
        ),
      ).toBe(true);
    }
  });

  it('accepts states across many seeds without rejecting a legitimate shape', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const raw = JSON.parse(serializeState(playedState(seed, 30))) as unknown;
      const result = safeValidateGameState(raw);
      if (!result.success) {
        throw new Error(
          `seed ${seed} rejected: ${JSON.stringify(result.error.issues, null, 2)}`,
        );
      }
    }
  });
});

describe('GameStateSchema — rejects corrupt states with typed ZodErrors', () => {
  function corrupt(mutate: (obj: Record<string, unknown>) => void): unknown {
    const obj = JSON.parse(serializeState(createInitialState(1))) as Record<string, unknown>;
    mutate(obj);
    return obj;
  }

  it('throws a ZodError (not a generic Error)', () => {
    const bad = corrupt((o) => {
      (o.player as Record<string, unknown>).credits = 'abc';
    });
    expect(() => validateGameState(bad)).toThrow(z.ZodError);
  });

  it('wrong-typed credits — path points at player.credits', () => {
    const bad = corrupt((o) => {
      (o.player as Record<string, unknown>).credits = 'abc';
    });
    const result = safeValidateGameState(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(z.ZodError);
      expect(result.error.issues.some((i) => i.path.join('.') === 'player.credits')).toBe(true);
    }
  });

  it('missing required top-level field — path points at the field', () => {
    const bad = corrupt((o) => {
      delete o.day;
    });
    const result = safeValidateGameState(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'day')).toBe(true);
    }
  });

  it('bad enum value — dayPhase not a member', () => {
    const bad = corrupt((o) => {
      o.dayPhase = 'MIDNIGHT';
    });
    const result = safeValidateGameState(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'dayPhase')).toBe(true);
    }
  });

  it('malformed nested object — ship component missing a field', () => {
    const bad = corrupt((o) => {
      const ship = (o.player as Record<string, unknown>).ship as Record<string, unknown>;
      ship.hull = { strength: 5 }; // condition missing
    });
    const result = safeValidateGameState(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join('.') === 'player.ship.hull.condition'),
      ).toBe(true);
    }
  });

  it('bad discriminated-union member — unknown event type is rejected', () => {
    const bad = corrupt((o) => {
      (o.eventLog as unknown[]).push({ type: 'NotARealEvent', day: 1 });
    });
    const result = safeValidateGameState(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'eventLog')).toBe(true);
    }
  });

  it('malformed nested enum inside StatBlock', () => {
    const bad = corrupt((o) => {
      const player = o.player as Record<string, unknown>;
      (player.stats as Record<string, unknown>).PILOT = 'high';
    });
    const result = safeValidateGameState(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join('.') === 'player.stats.PILOT'),
      ).toBe(true);
    }
  });
});

describe('PlayerActionSchema — companion validator', () => {
  it('accepts a valid action', () => {
    expect(validatePlayerAction({ type: 'Travel', destinationId: 3 })).toEqual({
      type: 'Travel',
      destinationId: 3,
    });
  });

  it('rejects an unknown action type with a ZodError', () => {
    expect(() => validatePlayerAction({ type: 'Teleport' })).toThrow(z.ZodError);
  });
});

describe('GameStateSchema — export surface', () => {
  it('exposes the schema for T-112b to compose into loadSave', () => {
    expect(GameStateSchema).toBeInstanceOf(z.ZodType);
  });
});
