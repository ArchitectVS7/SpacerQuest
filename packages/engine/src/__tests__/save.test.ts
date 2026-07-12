import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createSave,
  loadSave,
  migrate,
  SaveError,
  CURRENT_SAVE_VERSION,
  UNKNOWN_LEGACY_SEED,
  type SaveEnvelope,
  type MigrationFn,
} from '../save.js';
import { validateGameState } from '../schema.js';
import { createInitialState } from '../state.js';
import { advanceDay } from '../day.js';
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

describe('save envelope — seed reproducibility (T-1002)', () => {
  it('the seed survives save → load → save byte-identically and lives in the envelope', () => {
    const state = drive50Days(9);
    // A first load reaches the serialization fixpoint (Zod reorders keys to the
    // schema order), so compare from an already-loaded state.
    const s1 = createSave(state, 1337);
    const l1 = loadSave(s1);
    const s2 = createSave(l1.state, l1.seed);
    const l2 = loadSave(s2);
    const s3 = createSave(l2.state, l2.seed);

    expect(s3).toBe(s2); // byte-identical fixpoint
    expect(l2.seed).toBe(1337); // the seed is preserved verbatim
    // And it genuinely rides the envelope, not the game state.
    const envelope = JSON.parse(s2) as SaveEnvelope;
    expect(envelope.seed).toBe(1337);
  });

  it('a v2 envelope preserves an explicit seed of 0 (the sentinel value)', () => {
    // Seed 0 collides with UNKNOWN_LEGACY_SEED at the engine level; loadSave still
    // returns 0 because the envelope's `seed` field is present.
    const restored = loadSave(createSave(drive50Days(4), 0));
    expect(restored.seed).toBe(0);
  });
});

describe('save envelope — v1 → v2 migration (T-1002)', () => {
  it('loads a seedless v1 envelope green through production MIGRATIONS and backfills the seed', () => {
    // A REAL pre-v2 envelope: version 1, no `seed` field at all.
    const v1 = JSON.stringify({ version: 1, state: drive50Days(9) });

    const loaded = loadSave(v1); // walks 1→2 (identity state migration), validates
    expect(loaded.state.day).toBeGreaterThan(0); // validated, not thrown
    expect(typeof loaded.seed).toBe('number'); // backfilled
    expect(loaded.seed).toBe(UNKNOWN_LEGACY_SEED); // pre-v2 saves have no recorded seed
  });

  it('a v2 envelope with an explicit seed is preserved (no migration needed)', () => {
    const v2 = createSave(drive50Days(9), 4242);
    expect((JSON.parse(v2) as SaveEnvelope).version).toBe(2);
    expect(loadSave(v2).seed).toBe(4242);
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Serialize a state into an envelope at an arbitrary version (for error tests). */
function createSaveAtVersion(state: GameState, version: number): string {
  return JSON.stringify({ version, state });
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
