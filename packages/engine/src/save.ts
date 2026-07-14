import { z } from 'zod';
import { GameState } from './types.js';
import { validateGameState } from './schema.js';

// Base envelope that Steam Cloud and localStorage will read.
//
// T-1002: the RNG `seed` now rides the envelope (v2+). TECH-STACK's "reproducible
// bug reports" non-negotiable requires a `.sav` blob ALONE to reproduce a run;
// the seed used to be UI-only (localStorage `sq.save.seed`), so a save handed to
// a developer could not be replayed. It lives on the ENVELOPE, not in GameState:
// `GameState.rngState` mutates on every roll, so the original seed is
// reproducibility metadata the versioned+migrated envelope is the right home for
// — this keeps the engine's GameState pure and its JSON round-trip unaffected.
export const SaveEnvelopeSchema = z.object({
  version: z.number(),
  state: z.unknown(), // The raw state, validated by version-specific schemas during migration
  seed: z.number().optional(), // v2+. Absent in v1 envelopes (loads as seed: null).
});

export type SaveEnvelope = z.infer<typeof SaveEnvelopeSchema>;

export type MigrationFn = (oldState: unknown) => unknown;

/**
 * Explicit STATE migration registry (v1 -> v2 -> ...). A key `n` upgrades the
 * migrated STATE from version `n` to version `n + 1`.
 *
 * T-1002 bumped {@link CURRENT_SAVE_VERSION} to 2. The v1->v2 change is
 * ENVELOPE-level (the new `seed` field), NOT a GameState shape change, so the
 * state migration is the IDENTITY — the state that came out of a v1 envelope is
 * already a valid v2 state. {@link loadSave} reports a seedless v1 envelope as
 * `seed: null` (absence stays absence — no numeric backfill, which would collide
 * with a legitimate explicit seed). This entry is honest, not a stub: it records
 * that v1 and v2 states are structurally identical.
 *
 * T-1304 bumped {@link CURRENT_SAVE_VERSION} to 3. The v2->v3 change IS a
 * GameState shape change: `PlayerState.loan` (the Penny Wise loan ledger, or
 * null) is a new persistent field. The v2->v3 migration backfills `loan: null`
 * on the player so a pre-lending save validates against the v3 schema (whose
 * `loan` key is non-optional). This is the explicit versioned migration the
 * T-1002 registry was built for.
 *
 * T-1306 bumped {@link CURRENT_SAVE_VERSION} to 4. The v3->v4 change IS a
 * GameState shape change: `PlayerState.crew` (the hired-crew dice-progression
 * source, T-1306) is a new persistent field. The v3->v4 migration backfills
 * `crew: []` on the player so a pre-crew save validates against the v4 schema
 * (whose `crew` key is non-optional). `DawnHand.rerollsRemaining` is OPTIONAL, so
 * it needs no migration step (a v3 hand simply banks no charge until it re-rolls
 * at the next dawn).
 *
 * T-1307 bumped {@link CURRENT_SAVE_VERSION} to 5. The v4->v5 change IS a
 * GameState shape change: `PlayerState.ports` (owned port stakes — purchasable
 * property, PRD §9) is a new persistent field. The v4->v5 migration backfills
 * `ports: []` on the player so a pre-ports save validates against the v5 schema
 * (whose `ports` key is non-optional).
 *
 * SEAM: the migration machinery is also exercised WITHOUT relying on this
 * production entry. {@link migrate} takes an injectable `registry` +
 * `targetVersion`, so a test can drive a dummy
 * `{ 1: (s) => ({ ...s, migrated: true }) }` at targetVersion 2 to prove the
 * sequential upgrade loop works independently of production MIGRATIONS.
 */
export const MIGRATIONS: Record<number, MigrationFn> = {
  1: (v1State) => v1State,
  // v2->v3: T-1304 added PlayerState.loan. A v2 save has no `loan` key, so
  // backfill it to null (no active loan) before schema validation.
  2: (v2State) => {
    const s = v2State as { player?: Record<string, unknown> };
    return {
      ...(v2State as object),
      player: { ...(s.player ?? {}), loan: (s.player as { loan?: unknown })?.loan ?? null },
    };
  },
  // v3->v4: T-1306 added PlayerState.crew. A v3 save has no `crew` key, so backfill
  // it to an empty roster (no crew) before schema validation.
  3: (v3State) => {
    const s = v3State as { player?: Record<string, unknown> };
    return {
      ...(v3State as object),
      player: { ...(s.player ?? {}), crew: (s.player as { crew?: unknown })?.crew ?? [] },
    };
  },
  // v4->v5: T-1307 added PlayerState.ports. A v4 save has no `ports` key, so
  // backfill it to an empty roster (no owned ports) before schema validation.
  4: (v4State) => {
    const s = v4State as { player?: Record<string, unknown> };
    return {
      ...(v4State as object),
      player: { ...(s.player ?? {}), ports: (s.player as { ports?: unknown })?.ports ?? [] },
    };
  },
};

export const CURRENT_SAVE_VERSION = 5;

export type SaveErrorCode =
  'corrupt-json' | 'bad-envelope' | 'no-migration' | 'future-version' | 'invalid-state';

/**
 * Typed error for every way a save can fail to load. `code` lets callers (the
 * UI later) branch without string-matching messages; `cause` carries the
 * underlying error (a {@link z.ZodError} for `bad-envelope` / `invalid-state`,
 * the raw parse error for `corrupt-json`).
 */
export class SaveError extends Error {
  readonly code: SaveErrorCode;

  constructor(code: SaveErrorCode, message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'SaveError';
    this.code = code;
  }
}

export interface MigrateOptions {
  /** Registry to migrate through. Defaults to the module {@link MIGRATIONS}. */
  registry?: Record<number, MigrationFn>;
  /** Version to migrate up to. Defaults to {@link CURRENT_SAVE_VERSION}. */
  targetVersion?: number;
}

/**
 * Pure, injectable migration loop. Walks `envelope.version` up to
 * `targetVersion`, applying one registered {@link MigrationFn} per step.
 *
 * - a version ABOVE the target (a save from a newer build) throws
 *   {@link SaveError} `future-version`;
 * - a gap with no registered migration throws `no-migration`.
 *
 * Returns the migrated (but not yet GameState-validated) state.
 */
export function migrate(envelope: SaveEnvelope, options: MigrateOptions = {}): unknown {
  const registry = options.registry ?? MIGRATIONS;
  const targetVersion = options.targetVersion ?? CURRENT_SAVE_VERSION;

  let version = envelope.version;
  let state = envelope.state;

  if (version > targetVersion) {
    throw new SaveError(
      'future-version',
      `Save version ${version} is newer than the supported version ${targetVersion}`,
    );
  }

  while (version < targetVersion) {
    const step = registry[version];
    if (!step) {
      throw new SaveError('no-migration', `No migration registered for version ${version}`);
    }
    state = step(state);
    version += 1;
  }

  return state;
}

/** A loaded save: the validated GameState plus the seed that reproduces it. */
export interface LoadedSave {
  state: GameState;
  /** The RNG seed the run started from, or `null` for a pre-v2 (seedless) save
   *  whose seed was never recorded — such saves cannot be reproduced from the
   *  blob alone; the store may substitute a legacy fallback. `null` (not a
   *  numeric sentinel) so an explicit seed of 0 stays distinguishable. */
  seed: number | null;
}

/**
 * Validates and migrates a raw JSON save string into a {@link LoadedSave} —
 * the validated {@link GameState} plus the reproduction `seed`.
 *
 * Pipeline: JSON.parse (→ `corrupt-json`) → envelope safeParse
 * (→ `bad-envelope`) → {@link migrate} (→ `future-version` / `no-migration`) →
 * {@link validateGameState} (→ `invalid-state`, carrying the {@link z.ZodError}
 * as `cause`).
 *
 * COMPOSITION: {@link createSave} embeds the raw state object inside the
 * envelope, so `JSON.stringify` serializes it identically to `serializeState`.
 * On load, `JSON.parse` therefore yields exactly the serialized shape
 * `validateGameState` expects, and the returned GameState is deep-equal to the
 * one passed to `createSave` — the round-trip is exact. The `seed` rides
 * alongside (v2+) and round-trips byte-identically.
 */
export function loadSave(jsonString: string): LoadedSave {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonString);
  } catch (cause) {
    throw new SaveError('corrupt-json', 'Save data is not valid JSON', cause);
  }

  const parsed = SaveEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SaveError(
      'bad-envelope',
      'Save data is missing a valid { version, state } envelope',
      parsed.error,
    );
  }

  const migratedState = migrate(parsed.data);

  let state: GameState;
  try {
    state = validateGameState(migratedState);
  } catch (cause) {
    throw new SaveError('invalid-state', 'Migrated save state failed GameState validation', cause);
  }

  // v1 envelopes have no `seed` — report the absence as null (never a numeric
  // sentinel, which would collide with a legitimate explicit seed).
  const seed = parsed.data.seed ?? null;
  return { state, seed };
}

export function createSave(state: GameState, seed: number): string {
  const envelope: SaveEnvelope = {
    version: CURRENT_SAVE_VERSION,
    state,
    seed,
  };
  return JSON.stringify(envelope);
}
