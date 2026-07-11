import { z } from 'zod';
import { GameState } from './types.js';
import { validateGameState } from './schema.js';

// Base envelope that Steam Cloud and localStorage will read
export const SaveEnvelopeSchema = z.object({
  version: z.number(),
  state: z.unknown(), // The raw state, validated by version-specific schemas during migration
});

export type SaveEnvelope = z.infer<typeof SaveEnvelopeSchema>;

export type MigrationFn = (oldState: unknown) => unknown;

/**
 * Explicit migration registry (v1 -> v2 -> ...). A key `n` upgrades a state
 * FROM version `n` to version `n + 1`. Production is at v1 today, so there is
 * nothing to migrate yet — this stays honestly empty until a real schema break
 * lands, at which point the author adds `1: (v1) => v2` and bumps
 * {@link CURRENT_SAVE_VERSION} to 2.
 *
 * SEAM: the migration machinery itself is exercised WITHOUT faking a production
 * migration. {@link migrate} takes an injectable `registry` + `targetVersion`,
 * so a test can drive a dummy `{ 1: (s) => ({ ...s, migrated: true }) }` at
 * targetVersion 2 to prove the sequential upgrade loop works, while production
 * MIGRATIONS remains empty and CURRENT_SAVE_VERSION stays at what the code
 * actually needs.
 */
export const MIGRATIONS: Record<number, MigrationFn> = {
  // 1: (v1State) => v2State
};

export const CURRENT_SAVE_VERSION = 1;

export type SaveErrorCode =
  | 'corrupt-json'
  | 'bad-envelope'
  | 'no-migration'
  | 'future-version'
  | 'invalid-state';

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

/**
 * Validates and migrates a raw JSON save string into a validated
 * {@link GameState}.
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
 * one passed to `createSave` — the round-trip is exact.
 */
export function loadSave(jsonString: string): GameState {
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

  try {
    return validateGameState(migratedState);
  } catch (cause) {
    throw new SaveError('invalid-state', 'Migrated save state failed GameState validation', cause);
  }
}

export function createSave(state: GameState): string {
  const envelope: SaveEnvelope = {
    version: CURRENT_SAVE_VERSION,
    state,
  };
  return JSON.stringify(envelope);
}
