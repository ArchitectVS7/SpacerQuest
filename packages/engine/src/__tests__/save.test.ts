import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createSave,
  loadSave,
  migrate,
  SaveError,
  CURRENT_SAVE_VERSION,
  type SaveEnvelope,
  type MigrationFn,
} from '../save.js';
import {
  FLAWS,
  NEMESIS_SYSTEM_ID,
  RENOWN_DEED_THRESHOLDS,
  SIGNAL_FRAGMENTS,
  type RenownRankId,
} from '@spacerquest/content';
import { validateGameState } from '../schema.js';
import { createInitialState, deserializeState, serializeState, starterShip } from '../state.js';
import { advanceDay } from '../day.js';
import { careerEnded } from '../nemesis.js';
import { RENOWN_RANK_ORDER, rankForDeedCount } from '../deeds.js';
import { computePlayerTier } from '../tier.js';
import { GameState, PlayerAction } from '../types.js';

/**
 * Drive a real, evolving GameState by running ~50 days through advanceDay with a
 * tiny deterministic policy (talk down encounters, otherwise top up fuel and
 * push to the next system). Produces a fully-populated state that exercises the
 * market, npc sim, travel, and event log — a realistic round-trip subject.
 */
function drive50Days(seed: number): GameState {
  let state = createInitialState(seed);
  for (let day = 0; day < 50; day += 1) {
    const actions: PlayerAction[] = [];
    if (state.encounter) {
      actions.push({
        type: 'Combat',
        stance: 'talk',
        targetId: state.encounter.interceptor.id,
        spendDie: 0,
      });
    } else {
      actions.push({ type: 'Trade', action: 'buy-fuel', fuelAmount: 50, spendDie: 0 });
      const destination = (state.player.currentSystemId % 20) + 1;
      actions.push({ type: 'Travel', destinationId: destination, spendDie: 1 });
    }
    state = advanceDay(state, actions).state;
  }
  return state;
}

describe('save envelope — migrations', () => {
  it('upgrades a v1 fixture through a dummy v1→v2 migration and still validates', () => {
    const fixtureState = drive50Days(1);
    const envelope: SaveEnvelope = { version: 1, state: fixtureState };

    // Literal acceptance shape: the spread migration proves the loop applied.
    const spreadRegistry: Record<number, MigrationFn> = {
      1: (s) => ({ ...(s as object), migrated: true }),
    };
    const spread = migrate(envelope, { registry: spreadRegistry, targetVersion: 2 }) as {
      migrated?: boolean;
    };
    expect(spread.migrated).toBe(true);

    // A migration that touches a REAL field: the upgraded state still validates
    // as a GameState (proving migrate → validateGameState compose).
    const realRegistry: Record<number, MigrationFn> = {
      1: (s) => ({ ...(s as GameState), day: 999 }),
    };
    const migrated = migrate(envelope, { registry: realRegistry, targetVersion: 2 });
    expect(() => validateGameState(migrated)).not.toThrow();
    expect(validateGameState(migrated).day).toBe(999);
  });

  it('applies migrations sequentially across multiple versions', () => {
    const registry: Record<number, MigrationFn> = {
      1: (s) => ({ ...(s as Record<string, unknown>), steps: ['a'] }),
      2: (s) => {
        const prev = s as { steps: string[] };
        return { ...prev, steps: [...prev.steps, 'b'] };
      },
    };
    const result = migrate({ version: 1, state: {} }, { registry, targetVersion: 3 }) as {
      steps: string[];
    };
    expect(result.steps).toEqual(['a', 'b']);
  });
});

describe('save envelope — wrong-version typed errors', () => {
  it('throws future-version when the save is newer than CURRENT_SAVE_VERSION and no migration exists', () => {
    const json = createSaveAtVersion(drive50Days(2), CURRENT_SAVE_VERSION + 1);
    const error = expectSaveError(() => loadSave(json));
    expect(error.code).toBe('future-version');
  });

  it('throws no-migration when a gap has no registered migration', () => {
    // A version-0 save needs a 0→1 migration to start climbing toward
    // CURRENT_SAVE_VERSION, but production MIGRATIONS only registers 1→2 — there
    // is no 0→1 step, so the walk fails loudly.
    const json = createSaveAtVersion(drive50Days(3), 0);
    const error = expectSaveError(() => loadSave(json));
    expect(error.code).toBe('no-migration');
  });

  it('migrate() throws future-version directly for a newer envelope', () => {
    const error = expectSaveError(() => migrate({ version: 2, state: {} }, { targetVersion: 1 }));
    expect(error.code).toBe('future-version');
  });
});

describe('save envelope — corrupt / malformed input', () => {
  it('throws corrupt-json on non-JSON input', () => {
    const error = expectSaveError(() => loadSave('{ this is not json'));
    expect(error.code).toBe('corrupt-json');
  });

  it('throws bad-envelope when the version envelope is missing', () => {
    const error = expectSaveError(() => loadSave(JSON.stringify({ notAnEnvelope: true })));
    expect(error.code).toBe('bad-envelope');
    expect(error.cause).toBeInstanceOf(z.ZodError);
  });

  it('throws invalid-state carrying a ZodError cause when the state is structurally invalid', () => {
    const json = JSON.stringify({ version: CURRENT_SAVE_VERSION, state: { day: 'not-a-number' } });
    const error = expectSaveError(() => loadSave(json));
    expect(error.code).toBe('invalid-state');
    expect(error.cause).toBeInstanceOf(z.ZodError);
  });
});

describe('save envelope — round-trip property test', () => {
  for (const seed of [1, 7, 42, 1337]) {
    it(`createSave → loadSave is exact for a 50-day state (seed ${seed})`, () => {
      const state = drive50Days(seed);
      const restored = loadSave(createSave(state, seed));
      expect(restored.state).toEqual(state);
      // T-1002: the seed rides the envelope and comes back on load.
      expect(restored.seed).toBe(seed);
    });
  }
});

describe('fuel-capacity migration (T-1102)', () => {
  it('recomputes a legacy maxFuel: 10000 to the hull-derived ceiling on load', () => {
    // A pre-T-1102 save carried a flat maxFuel of 10,000. On load, deserialize
    // re-derives it from the hull (junker: strength 1, condition 9 → 300) and
    // clamps the current fuel to the new ceiling.
    const legacy = createInitialState(123);
    legacy.player.ship.maxFuel = 10000;
    legacy.player.ship.fuel = 9000; // above the new ceiling — must clamp
    legacy.player.ship.hull = { strength: 1, condition: 9 };

    const restored = deserializeState(serializeState(legacy));

    expect(restored.player.ship.maxFuel).toBe(300);
    expect(restored.player.ship.fuel).toBe(300);
  });

  it('is an exact round-trip for a fresh (already-derived) state', () => {
    const fresh = createInitialState(7);
    expect(fresh.player.ship.maxFuel).toBe(starterShip().maxFuel);
    const restored = deserializeState(serializeState(fresh));
    expect(restored).toEqual(fresh);
  });
});

describe('save envelope — malformed-Explore reasons survive save/load (T-1003)', () => {
  // Malformed Explore inputs resolve to typed ExplorationFailed events carrying
  // the three T-1003 reasons, which land in state.eventLog. A save taken after a
  // player triggers one of these paths must createSave → loadSave cleanly — a
  // schema.ts that omits the reason throws SaveError('invalid-state') here (the
  // exact crash T-1003 exists to eliminate, moved to the persistence boundary).
  const cases: Array<{ reason: string; actions: PlayerAction[] }> = [
    { reason: 'no-die', actions: [{ type: 'Explore' }] },
    { reason: 'invalid-die-index', actions: [{ type: 'Explore', spendDie: 99 }] },
    {
      reason: 'die-already-spent',
      actions: [
        { type: 'Trade', action: 'buy-fuel', fuelAmount: 10, spendDie: 0 },
        { type: 'Explore', spendDie: 0 },
      ],
    },
  ];

  for (const { reason, actions } of cases) {
    it(`createSave → loadSave is exact after an ExplorationFailed '${reason}'`, () => {
      const state = advanceDay(createInitialState(7), actions).state;

      // Sanity: the resolver actually logged the reason under test.
      const failure = state.eventLog.find(
        (e) => e.type === 'ExplorationFailed' && e.reason === reason,
      );
      expect(failure, `expected an ExplorationFailed '${reason}' in the event log`).toBeDefined();

      const restored = loadSave(createSave(state, 7));
      expect(restored.state).toEqual(state);
    });
  }
});

describe('NPC StatCheck events survive save/load (T-1201)', () => {
  // T-1201 widened StatCheck.actionContext with five `npc-*` tags and now emits
  // an NPC StatCheck (nested CheckResult) into eventLog every day. No GameState
  // FIELD changed, so no migration is required — but the widened event must
  // JSON round-trip byte-for-byte through the save envelope, including its
  // actionContext and the nested result.
  it('createSave → loadSave preserves an npc-* StatCheck in the event log exactly', () => {
    const state = drive50Days(11);

    // A real drive produces NPC checks in the log (the same events the wire
    // renders). Grab one to prove the fixture is genuine, not hand-built.
    const npcCheck = state.eventLog.find(
      (e) =>
        e.type === 'StatCheck' &&
        typeof e.actionContext === 'string' &&
        e.actionContext.startsWith('npc-'),
    );
    expect(npcCheck, 'expected an npc-* StatCheck in the 50-day event log').toBeDefined();

    const restored = loadSave(createSave(state, 11));
    // Whole-state exactness covers the nested CheckResult + actionContext.
    expect(restored.state).toEqual(state);
    // And, explicitly, the same NPC check comes back identical.
    const restoredCheck = restored.state.eventLog.find(
      (e) =>
        e.type === 'StatCheck' &&
        typeof e.actionContext === 'string' &&
        e.actionContext.startsWith('npc-'),
    );
    expect(restoredCheck).toEqual(npcCheck);
  });
});

describe('save envelope — seed reproducibility (T-1002)', () => {
  it('the seed survives save → load → save byte-identically and lives in the envelope', () => {
    const state = drive50Days(9);
    // A first load reaches the serialization fixpoint (Zod reorders keys to the
    // schema order), so compare from an already-loaded state.
    const s1 = createSave(state, 1337);
    const l1 = loadSave(s1);
    const s2 = createSave(l1.state, requireSeed(l1.seed));
    const l2 = loadSave(s2);
    const s3 = createSave(l2.state, requireSeed(l2.seed));

    expect(s3).toBe(s2); // byte-identical fixpoint
    expect(l2.seed).toBe(1337); // the seed is preserved verbatim
    // And it genuinely rides the envelope, not the game state.
    const envelope = JSON.parse(s2) as SaveEnvelope;
    expect(envelope.seed).toBe(1337);
  });

  it('an explicit seed of 0 is preserved AND distinct from a seedless legacy load', () => {
    // Regression: seed 0 used to collide with a numeric UNKNOWN_LEGACY_SEED
    // sentinel, making a genuine seed-0 career indistinguishable from a pre-v2
    // (seedless) save. The absence is now `null`, so the two cases differ.
    const state = drive50Days(4);
    const explicitZero = loadSave(createSave(state, 0));
    expect(explicitZero.seed).toBe(0);

    const seedless = loadSave(JSON.stringify({ version: 1, state }));
    expect(seedless.seed).toBeNull();
    expect(explicitZero.seed).not.toBe(seedless.seed); // 0 !== null — no collision
  });
});

describe('save envelope — v1 → v2 migration (T-1002)', () => {
  it('loads a seedless v1 envelope green through production MIGRATIONS with seed: null', () => {
    // A REAL pre-v2 envelope: version 1, no `seed` field at all.
    const v1 = JSON.stringify({ version: 1, state: drive50Days(9) });

    const loaded = loadSave(v1); // walks 1→2 (identity state migration), validates
    expect(loaded.state.day).toBeGreaterThan(0); // validated, not thrown
    // Absence stays absence: no numeric backfill (that would collide with a
    // legitimate explicit seed). Callers key legacy fallbacks off null.
    expect(loaded.seed).toBeNull();
  });

  it('a current-version envelope with an explicit seed is preserved (no migration needed)', () => {
    const current = createSave(drive50Days(9), 4242);
    // createSave always stamps CURRENT_SAVE_VERSION; loading it needs no
    // migration and preserves the seed exactly.
    expect((JSON.parse(current) as SaveEnvelope).version).toBe(CURRENT_SAVE_VERSION);
    expect(loadSave(current).seed).toBe(4242);
  });
});

// ---------------------------------------------------------------------------
// T-1304 · v2 → v3 loan migration + loan round-trip.
// ---------------------------------------------------------------------------
describe('save envelope — v2 → v3 loan migration (T-1304)', () => {
  it('backfills PlayerState.loan = null on a v2 envelope with no loan key', () => {
    // Build a REAL v2-shaped state: drive a state, then strip the loan key the
    // way a genuinely pre-T-1304 save would (it never had the field). The v2→v3
    // migration must re-add loan: null before schema validation, else the strict
    // schema (loan is non-optional) would reject it.
    const state = drive50Days(11);
    // Strip the loan key the way a genuinely pre-T-1304 (v2) save would — it
    // never had the field. `delete` via an index cast keeps `loan` off the object.
    delete (state.player as unknown as Record<string, unknown>).loan;
    const v2 = JSON.stringify({ version: 2, state, seed: 77 });

    const loaded = loadSave(v2); // walks 2→3 (loan backfill), then validates
    expect(loaded.state.player.loan).toBeNull();
    expect(loaded.seed).toBe(77);
  });

  it('round-trips an ACTIVE loan through createSave → loadSave (deep-equal)', () => {
    const state = drive50Days(12);
    state.player.loan = {
      lender: 'npc-penny-wise',
      principal: 500,
      outstanding: 575,
      dailyRate: 0.05,
      borrowedDay: 3,
      dueDay: 18,
      status: 'active',
    };
    const loaded = loadSave(createSave(state, 5));
    expect(loaded.state.player.loan).toEqual(state.player.loan);
  });

  it('round-trips a DEFAULTED loan through createSave → loadSave (deep-equal)', () => {
    const state = drive50Days(13);
    state.player.loan = {
      lender: 'npc-penny-wise',
      principal: 1000,
      outstanding: 1600,
      dailyRate: 0.05,
      borrowedDay: 2,
      dueDay: 17,
      status: 'defaulted',
    };
    const loaded = loadSave(createSave(state, 6));
    expect(loaded.state.player.loan).toEqual(state.player.loan);
    expect(loaded.state.player.loan?.status).toBe('defaulted');
  });

  it('strict schema rejects an unknown key inside a loan', () => {
    const state = drive50Days(14);
    (state.player.loan as unknown) = {
      lender: 'npc-penny-wise',
      principal: 500,
      outstanding: 500,
      dailyRate: 0.05,
      borrowedDay: 1,
      dueDay: 16,
      status: 'active',
      collectorBribe: 999, // not part of LoanState — must fail .strict()
    };
    expect(() => loadSave(createSave(state, 7))).toThrow(SaveError);
  });
});

// ---------------------------------------------------------------------------
// T-1306 · v3 → v4 crew migration + crew/reroll round-trip (acceptance #5).
// ---------------------------------------------------------------------------
describe('save envelope — v3 → v4 crew migration (T-1306)', () => {
  it('backfills PlayerState.crew = [] on a v3 envelope with no crew key', () => {
    // Build a REAL v3-shaped state, then strip the crew key the way a genuinely
    // pre-T-1306 save would (it never had the field). The v3→v4 migration must
    // re-add crew: [] before schema validation, else the strict schema (crew is
    // non-optional) would reject it.
    const state = drive50Days(21);
    delete (state.player as unknown as Record<string, unknown>).crew;
    const v3 = JSON.stringify({ version: 3, state, seed: 88 });

    const loaded = loadSave(v3); // walks 3→4 (crew backfill), then validates
    expect(loaded.state.player.crew).toEqual([]);
    expect(loaded.seed).toBe(88);
  });

  it('round-trips a hired crew + a mid-day reroll charge (deep-equal)', () => {
    const state = drive50Days(22);
    state.player.crew = [
      { roleId: 'crew-second', hiredDay: 3 },
      { roleId: 'crew-navigator', hiredDay: 5 },
    ];
    // A mid-day dawn hand carrying an unspent reroll charge must round-trip.
    state.player.dawnHand = {
      dice: [17, 12, 9, 4, 2],
      spent: [false, false, false, false, false],
      rerollsRemaining: 1,
    };
    const loaded = loadSave(createSave(state, 9));
    expect(loaded.state.player.crew).toEqual(state.player.crew);
    expect(loaded.state.player.dawnHand?.rerollsRemaining).toBe(1);
    expect(loaded.state.player.dawnHand).toEqual(state.player.dawnHand);
  });

  it('strict schema rejects an unknown key inside a crew member', () => {
    const state = drive50Days(23);
    (state.player.crew as unknown) = [
      { roleId: 'crew-second', hiredDay: 1, morale: 99 }, // not part of CrewMember
    ];
    expect(() => loadSave(createSave(state, 10))).toThrow(SaveError);
  });
});

// ---------------------------------------------------------------------------
// T-1307 · v4 → v5 ports migration + owned-ports round-trip (acceptance #3a).
// ---------------------------------------------------------------------------
describe('save envelope — v4 → v5 ports migration (T-1307)', () => {
  it('backfills PlayerState.ports = [] on a v4 envelope with no ports key', () => {
    // Build a REAL v4-shaped state, then strip the ports key the way a genuinely
    // pre-T-1307 save would (it never had the field). The v4→v5 migration must
    // re-add ports: [] before schema validation, else the strict schema (ports is
    // non-optional) would reject it.
    const state = drive50Days(31);
    delete (state.player as unknown as Record<string, unknown>).ports;
    const v4 = JSON.stringify({ version: 4, state, seed: 99 });

    const loaded = loadSave(v4); // walks 4→5 (ports backfill), then validates
    expect(loaded.state.player.ports).toEqual([]);
    expect(loaded.seed).toBe(99);
  });

  it('round-trips owned port stakes through createSave → loadSave (deep-equal)', () => {
    const state = drive50Days(32);
    state.player.ports = [
      { systemId: 1, purchaseDay: 3 },
      { systemId: 7, purchaseDay: 12 },
    ];
    const loaded = loadSave(createSave(state, 13));
    expect(loaded.state.player.ports).toEqual(state.player.ports);
  });

  it('strict schema rejects an unknown key inside a port stake', () => {
    const state = drive50Days(33);
    (state.player.ports as unknown) = [
      { systemId: 1, purchaseDay: 1, alliance: 'league' }, // not part of PortStake
    ];
    expect(() => loadSave(createSave(state, 14))).toThrow(SaveError);
  });

  it('CURRENT_SAVE_VERSION is 9', () => {
    // T-1401 bumped 5 → 6 (WireEntry.kind); T-1503 bumped 6 → 7 for the required
    // nested PlayerState.reputation container; T-1603b bumped 7 → 8 to re-derive
    // `registry.renownRank` + `player.tier` after the canonical
    // RENOWN_DEED_THRESHOLDS rescale — the first migration that adds no field and
    // instead repairs the MEANING of two it finds; T-1703 bumped 8 → 9 for the new
    // ROOT-level `GameState.edition` (the demo gate's persisted scalar). See save.ts.
    expect(CURRENT_SAVE_VERSION).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Serialize a state into an envelope at an arbitrary version (for error tests). */
function createSaveAtVersion(state: GameState, version: number): string {
  return JSON.stringify({ version, state });
}

/** Narrow a LoadedSave seed for re-save: a v2 save always carries one. */
function requireSeed(seed: number | null): number {
  if (seed === null) throw new Error('expected the loaded save to carry a seed');
  return seed;
}

/** Assert the thunk throws a SaveError and return it (typed). */
function expectSaveError(fn: () => unknown): SaveError {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(SaveError);
  return caught as SaveError;
}

// T-1401 · v5 → v6 WireEntry.kind migration + kinded-eventLog round-trip.
describe('save envelope — v5 → v6 WireEntry.kind migration (T-1401)', () => {
  const flawSuffixes = Object.values(FLAWS).map((f) => f.detail);
  const endsWithFlaw = (msg: string): boolean => flawSuffixes.some((s) => msg.endsWith(s));

  /** Strip the `kind` off every WireEntry, the way a genuinely pre-T-1401 (v5)
   *  save would look — it never had the field. */
  function stripWireKind(state: GameState): GameState {
    const clone = JSON.parse(JSON.stringify(state)) as GameState;
    for (const e of clone.eventLog) {
      if (e.type === 'WireEntry') {
        delete (e as unknown as Record<string, unknown>).kind;
      }
    }
    return clone;
  }

  it('backfills kind on a v5 envelope by re-deriving the pre-change classification', () => {
    // Seed 1 deterministically files both flaw-override lines and plain npc lines.
    const state = drive50Days(1);
    const wireEntries = state.eventLog.filter((e) => e.type === 'WireEntry');
    expect(wireEntries.length).toBeGreaterThan(0);
    // The driven log must contain BOTH classes so the migration is exercised on each.
    const hasFlawLine = wireEntries.some((e) => e.type === 'WireEntry' && endsWithFlaw(e.message));
    const hasPlainLine = wireEntries.some(
      (e) => e.type === 'WireEntry' && !endsWithFlaw(e.message),
    );
    expect(hasFlawLine).toBe(true);
    expect(hasPlainLine).toBe(true);

    const v5 = createSaveAtVersion(stripWireKind(state), 5);
    const loaded = loadSave(v5); // walks 5→6 (kind backfill), then validates

    const migratedWire = loaded.state.eventLog.filter((e) => e.type === 'WireEntry');
    expect(migratedWire.length).toBe(wireEntries.length);
    for (const e of migratedWire) {
      if (e.type !== 'WireEntry') continue;
      // Re-derivation: a flaw-detail suffix ⇒ 'flaw-override', everything else ⇒ 'npc'.
      expect(e.kind).toBe(endsWithFlaw(e.message) ? 'flaw-override' : 'npc');
    }
    // At least one of each landed (proves both branches ran, not just a default).
    expect(migratedWire.some((e) => e.type === 'WireEntry' && e.kind === 'flaw-override')).toBe(
      true,
    );
    expect(migratedWire.some((e) => e.type === 'WireEntry' && e.kind === 'npc')).toBe(true);
  });

  it('leaves an already-kinded WireEntry untouched during migration', () => {
    // A v5 save whose WireEntry somehow already carries a kind must not be re-derived.
    const state = createInitialState(3);
    state.eventLog.push({ type: 'WireEntry', day: 1, kind: 'plain', message: 'A world line.' });
    const v5 = createSaveAtVersion(state, 5);
    const loaded = loadSave(v5);
    const wire = loaded.state.eventLog.find((e) => e.type === 'WireEntry');
    expect(wire?.type === 'WireEntry' && wire.kind).toBe('plain');
  });

  it('round-trips a state whose eventLog carries kinded WireEntry events (deep-equal)', () => {
    const state = drive50Days(2);
    expect(state.eventLog.some((e) => e.type === 'WireEntry')).toBe(true);
    const restored = loadSave(createSave(state, 2));
    expect(restored.state).toEqual(state);
    // The kinds survive the round-trip byte-for-byte.
    const before = state.eventLog.filter((e) => e.type === 'WireEntry');
    const after = restored.state.eventLog.filter((e) => e.type === 'WireEntry');
    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// T-1503 · v6 → v7 nested-reputation migration + NESTED round-trip regression.
//
// This is the exact bug class the T-1002 drift-protection was built to stop, BY
// NAME: `player.reputation` is the nested container the schema comment cites as the
// field Zod's default STRIP mode used to silently drop. These tests prove (a) a
// pre-reputation v6 save gets the neutral nested container back through the v6→v7
// migration, (b) non-zero nested rep values survive createSave → loadSave
// DEEP-EQUAL (the silent-nested-key-strip regression), and (c) an unknown nested
// key under `reputation` fails the `.strict()` load — drift protection covers it.
// ---------------------------------------------------------------------------
describe('save envelope — v6 → v7 reputation migration (T-1503, the T-1002 nested-key bug class)', () => {
  const NEUTRAL = { league: 0, dragons: 0, confederation: 0, rebels: 0 };

  it('backfills the neutral PlayerState.reputation container on a v6 envelope with no reputation key', () => {
    // Build a REAL v6-shaped state, then strip the reputation key the way a
    // genuinely pre-T-1503 save would (it never had the nested field). The v6→v7
    // migration must re-add the strict four-key container before validation, else
    // the strict schema (reputation is non-optional) rejects it.
    const state = drive50Days(41);
    delete (state.player as unknown as Record<string, unknown>).reputation;
    const v6 = JSON.stringify({ version: 6, state, seed: 71 });

    const loaded = loadSave(v6); // walks 6→7 (reputation backfill), then validates
    expect(loaded.state.player.reputation).toEqual(NEUTRAL);
    expect(loaded.seed).toBe(71);
  });

  it('merges a PARTIAL reputation container faction-key by faction-key on migration', () => {
    // A v6 save that carries only some faction keys (a hand-tampered or partially
    // written blob) must have the missing keys backfilled to 0, not the whole
    // container replaced — the T-1002 strict schema needs all four present.
    const state = drive50Days(42);
    (state.player as unknown as Record<string, unknown>).reputation = { league: 4 };
    const v6 = JSON.stringify({ version: 6, state, seed: 72 });

    const loaded = loadSave(v6);
    expect(loaded.state.player.reputation).toEqual({
      league: 4,
      dragons: 0,
      confederation: 0,
      rebels: 0,
    });
  });

  it('round-trips NON-ZERO nested reputation through createSave → loadSave (deep-equal — the silent-strip regression)', () => {
    // THE regression: set every faction key to a distinct non-zero value and prove
    // the nested `player.reputation` object survives serialize → migrate → validate
    // byte-for-byte. Under Zod's old default STRIP mode (pre-T-1002) an unknown or
    // unmodelled nested key here was silently dropped; the strict schema + this
    // deep-equal assertion is what makes that impossible for `player.reputation`.
    const state = drive50Days(43);
    state.player.reputation = { league: 7, dragons: -4, confederation: 12, rebels: -1 };
    const loaded = loadSave(createSave(state, 73));
    expect(loaded.state.player.reputation).toEqual(state.player.reputation);
    // The WHOLE state is deep-equal — the nested container did not perturb anything.
    expect(loaded.state).toEqual(state);
  });

  it('strict schema rejects an unknown nested key inside reputation (drift protection covers it)', () => {
    // Adding a fifth, unmodelled key under `reputation` must FAIL the load — the
    // `.strict()` FactionReputationSchema is what guarantees a nested drift is loud,
    // not silently stripped. This is the negative twin of the deep-equal test.
    const state = drive50Days(44);
    (state.player.reputation as unknown as Record<string, unknown>).syndicate = 5;
    expect(() => loadSave(createSave(state, 74))).toThrow(SaveError);
  });
});

describe('save envelope — v8 → v9 edition migration (T-1703)', () => {
  it('backfills edition: "full" on a v8 envelope with no edition key', () => {
    // Build a REAL v8-shaped state, then strip the root `edition` key the way a
    // genuinely pre-T-1703 save would (it never had the field). The v8→v9
    // migration must re-add it before validation, else the strict schema (edition
    // is non-optional) rejects it.
    //
    // THE DIRECTION MATTERS AND IS THE POINT: every save that exists was written
    // before a demo build existed, so 'full' is a statement of fact. Backfilling
    // 'demo' would silently take a real player's ports, crew and capstone rank.
    const state = drive50Days(81);
    delete (state as unknown as Record<string, unknown>).edition;
    const v8 = JSON.stringify({ version: 8, state, seed: 91 });

    const loaded = loadSave(v8);
    expect(loaded.state.edition).toBe('full');
    expect(loaded.seed).toBe(91);
  });

  it('leaves an edition already present alone (idempotent, forward-safe)', () => {
    const state = drive50Days(82);
    (state as unknown as Record<string, unknown>).edition = 'demo';
    const loaded = loadSave(JSON.stringify({ version: 8, state, seed: 92 }));
    expect(loaded.state.edition).toBe('demo');
  });

  it('round-trips a DEMO career exactly through createSave → loadSave', () => {
    // Constraint 3, in the same commit as the field: a demo autosave must come
    // back deep-equal, or a demo player loses their career on reload.
    const state = drive50Days(83);
    state.edition = 'demo';
    const loaded = loadSave(createSave(state, 93));
    expect(loaded.state.edition).toBe('demo');
    expect(loaded.state).toEqual(state);
  });

  it('strict schema rejects an edition the engine has no rules for', () => {
    // The negative twin: a hand-edited save cannot invent a third edition and get
    // whatever the gate does with an unknown value — it fails loudly on load.
    const state = drive50Days(84);
    (state as unknown as Record<string, unknown>).edition = 'deluxe';
    expect(() => loadSave(createSave(state, 94))).toThrow(SaveError);
  });
});

// ---------------------------------------------------------------------------
// T-1505a · The twelve-fragment Nemesis file round-trips, including the two
// source literals the arc only started producing in this task.
//
// NO MIGRATION AND NO VERSION BUMP is required, and that is the point of these
// tests: T-1505a adds no GameState FIELD. `SignalFragmentRecordSchema` already
// types `fragmentId: z.string()` (any authored id passes) and its source enum
// already carries all five literals — 'sage' and 'npc' were simply never emitted
// by content before. These assert the shipped schema really does carry the whole
// arc through createSave → loadSave, so the "no migration needed" claim is
// proven rather than asserted in prose (the T-1504c/d precedent).
// ---------------------------------------------------------------------------
describe('save envelope — the full Nemesis file round-trips with no migration (T-1505a)', () => {
  it('all 12 fragments and all 5 source literals survive createSave → loadSave (deep-equal)', () => {
    const state = drive50Days(51);
    const ids = Object.keys(SIGNAL_FRAGMENTS);
    expect(ids).toHaveLength(12);

    // Every source literal appears at least once, 'sage' and 'npc' included.
    const sources = ['derelict', 'beacon', 'wise-one', 'sage', 'npc'] as const;
    state.player.nemesisFile = {
      fragments: ids.map((fragmentId, i) => ({
        fragmentId,
        source: sources[i % sources.length],
        day: i + 1,
        decoded: i % 3 === 0,
      })),
    };
    const usedSources = new Set(state.player.nemesisFile.fragments.map((f) => f.source));
    for (const source of sources) expect(usedSources.has(source)).toBe(true);

    const loaded = loadSave(createSave(state, 75));
    expect(loaded.state.player.nemesisFile).toEqual(state.player.nemesisFile);
    // The WHOLE state is deep-equal — nothing about the fuller file perturbed it.
    expect(loaded.state).toEqual(state);
    // No version bump was needed for any of it. (T-1603b later bumped 7 → 8 for
    // an unrelated reason — the renown re-derivation — and T-1703 8 → 9 for the
    // new `edition` field, so this pins the CURRENT version rather than claiming
    // the fragment file caused it.)
    expect(CURRENT_SAVE_VERSION).toBe(9);
  });

  it('strict schema still rejects an unknown fragment source (drift protection covers it)', () => {
    const state = drive50Days(52);
    (state.player.nemesisFile.fragments as unknown[]) = [
      { fragmentId: 'frag-nemesis-09', source: 'courier', day: 4, decoded: false },
    ];
    expect(() => loadSave(createSave(state, 76))).toThrow(SaveError);
  });
});

// ---------------------------------------------------------------------------
// T-1505c · The ENDED career round-trips, with no migration.
//
// Again NO GameState FIELD ships (design call D7): the terminus is DERIVED from
// `player.currentSystemId`, which the save schema has round-tripped since v1, so
// there is nothing to migrate and no version bump. What IS new is a serialized
// literal — `ActionBlocked.reason: 'career-ended'` — and an ended career's
// autosave will contain it the first time the player pokes a dead control, so
// the schema has to accept it or a reload would be rejected outright.
// ---------------------------------------------------------------------------
describe('save envelope — an ended career round-trips with no migration (T-1505c)', () => {
  it("the far-side position and a logged 'career-ended' refusal survive the round trip", () => {
    const state = drive50Days(53);
    state.player.currentSystemId = NEMESIS_SYSTEM_ID;
    state.eventLog.push({
      type: 'ActionBlocked',
      day: state.day,
      actionType: 'Explore',
      reason: 'career-ended',
    });

    const loaded = loadSave(createSave(state, 77));

    expect(loaded.state).toEqual(state);
    expect(careerEnded(loaded.state)).toBe(true);
    expect(loaded.state.eventLog).toContainEqual({
      type: 'ActionBlocked',
      day: state.day,
      actionType: 'Explore',
      reason: 'career-ended',
    });
    // Nothing needed a bump for any of it. (T-1603b later bumped 7 → 8 for the
    // unrelated renown re-derivation and T-1703 8 → 9 for the new `edition`
    // field; this pins the CURRENT version.)
    expect(CURRENT_SAVE_VERSION).toBe(9);
  });

  it('strict schema still rejects an unknown ActionBlocked reason (drift protection)', () => {
    const state = drive50Days(54);
    // A reason literal the union does not carry — cast through `unknown` (the
    // pattern the loan/fragment drift tests above use) so the strict schema, not
    // the type checker, is what rejects it.
    (state.eventLog as unknown[]).push({
      type: 'ActionBlocked',
      day: state.day,
      actionType: 'Explore',
      reason: 'career-abandoned',
    });
    expect(() => loadSave(createSave(state, 78))).toThrow(SaveError);
  });
});

// ---------------------------------------------------------------------------
// T-1603b · A THRESHOLD RESCALE NEEDS NO MIGRATION, and this is why.
//
// The canonical `RENOWN_DEED_THRESHOLDS` rescale (content deeds.ts) added and
// removed no `GameState` field, so `CURRENT_SAVE_VERSION` did not move and no
// migration was written. That is only safe because the rank is a DERIVED value:
// `deserializeState` (state.ts) recomputes
// `registry.renownRank = rankForDeedCount(earned.length)` on every load, so a
// save written under any earlier table self-heals to whatever the current table
// selects for the deeds it actually holds.
//
// This block asserts that behaviour end-to-end through the real save envelope
// (createSave -> loadSave), not just through deserializeState, because the
// envelope is what a player's browser actually holds. It is the standing proof
// that the next rescale is likewise migration-free — and the alarm if someone
// ever makes `renownRank` an independently stored fact.
// ---------------------------------------------------------------------------
describe('T-1603b renown rescale save compatibility (v7 -> v8)', () => {
  /** A state standing at `storedRank` with `deeds` earned deeds. When the two
   *  disagree it is exactly the shape a pre-rescale save has. */
  function stateAt(storedRank: RenownRankId, deeds: number, tier?: 1 | 2 | 3 | 4 | 5): GameState {
    const state = createInitialState(1603);
    state.player.registry.earned = Array.from({ length: deeds }, (_, i) => ({
      id: `synthetic-deed-${i}`,
      title: `Synthetic Deed ${i}`,
      citation: 'test',
      day: 1,
      eventIndex: i,
    }));
    state.player.registry.renownRank = storedRank;
    if (tier !== undefined) state.player.tier = tier;
    return state;
  }

  it('a v7 envelope is healed by the production migration, not only by the loader', () => {
    // THE FAILURE THIS GUARDS. `deserializeState` (state.ts) recomputes the rank,
    // but `loadSave` does NOT go through it — it runs `migrate` ->
    // `validateGameState`, and that is the path the shipped UI store takes
    // (`packages/ui/src/store.ts`). So the healing has to live in the v7->v8
    // MIGRATION, and this asserts it there. Without it, a real player's save would
    // keep a rank its deeds no longer buy, and the next deed earned would drive
    // `evaluateDeeds` from GIGA_HERO down to ADMIRAL and emit that DEMOTION as a
    // `RenownRankUp` carrying a promotion citation on the wire.
    //
    // 15 deeds bought GIGA_HERO under the pre-T-1603b table. The healed rank is
    // asserted DERIVED (`rankForDeedCount`), so this states the RULE — "rank
    // follows the count" — rather than pinning a rank that the next rescale moves.
    const v7Envelope = JSON.stringify({
      version: 7,
      state: stateAt('GIGA_HERO', 15, 5),
      seed: 1603,
    });

    const loaded = loadSave(v7Envelope);
    expect(loaded.state.player.registry.earned).toHaveLength(15);
    expect(loaded.state.player.registry.renownRank).toBe(rankForDeedCount(15));
    // The demotion is real, not a no-op: this is the deliberate consequence
    // recorded at the threshold table's definition site.
    expect(loaded.state.player.registry.renownRank).not.toBe('GIGA_HERO');

    // ...and `player.tier` — derived from rank, and the ONLY input to encounter
    // matchmaking — is resynced with it. A load that healed the rank but not the
    // band would send the matchmaker after hunters the captain no longer ranks
    // with, which is the quiet half of this bug.
    expect(loaded.state.player.tier).toBe(
      computePlayerTier(rankForDeedCount(15), loaded.state.player.ship),
    );
    expect(loaded.state.player.tier).not.toBe(5);

    // IDEMPOTENT: re-saving the healed state and loading it again changes nothing,
    // so a player who loads twice does not drift.
    const again = loadSave(createSave(loaded.state, 1603));
    expect(again.state.player.registry.renownRank).toBe(loaded.state.player.registry.renownRank);
    expect(again.state.player.tier).toBe(loaded.state.player.tier);
  });

  it('the migration passes an unreadable registry through instead of throwing', () => {
    // A migration must never be the thing that throws — the schema is what
    // rejects a malformed save, with a typed SaveError. Driven through `migrate`
    // directly so the assertion is about the migration step, not the loader.
    const noRegistry = { player: { credits: 1 } };
    expect(() => migrate({ version: 7, state: noRegistry })).not.toThrow();
    expect(() => migrate({ version: 7, state: { player: 'nonsense' } })).not.toThrow();
    expect(() => migrate({ version: 7, state: {} })).not.toThrow();
    // ...and the loader still refuses the malformed state, with the typed error.
    expect(() => loadSave(JSON.stringify({ version: 7, state: noRegistry, seed: 1 }))).toThrow(
      SaveError,
    );
  });

  it('every rank round-trips at its own threshold (no rank is lost in the envelope)', () => {
    // The schema carries a rank ENUM, so a rescale must not strand one. Each rank
    // is saved with the deed count that legitimately selects it, so the migration
    // is a no-op and what is under test is the envelope + schema. Driven from
    // content — never a hand-listed rank list.
    for (const rank of RENOWN_RANK_ORDER) {
      const loaded = loadSave(createSave(stateAt(rank, RENOWN_DEED_THRESHOLDS[rank]), 1603));
      expect(loaded.state.player.registry.renownRank, `${rank} did not survive the save`).toBe(
        rank,
      );
    }
  });
});
